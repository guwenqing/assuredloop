// One central spec repo, and output repos (design.md 12; T12, decision D13).
// The central repo's config lists its output repos; an output repo's config
// names the central repo. Another repo is read only through git, at its
// selected commit: its tree, its blobs and its commit messages, never its
// working tree, and nothing is fetched. A repo that cannot be read so is
// unknown, with its reason, and nothing is inferred from it.
import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, posix, resolve } from 'node:path';
import { parse } from 'yaml';
import { read, sha256 } from './base.js';
import { loadConfig } from './config.js';
import { commitOf, commitsOf, fileAt, filesAt, git, mergeBase, mergesOf } from './git.js';
import { loadState, qualify, requestNames } from './indexer.js';
import { latest } from './records.js';
import { parseResult } from './results.js';

const OUTPUT_LINKS = ['implements', 'verifies', 'documents'];
// A qualified central ID in text: `central:` and an optional `<request>/`,
// then a spec ID (EXP-4, ADR-3-2) or a request's R, Q, D, S or T number.
const QID = /(?<![A-Za-z0-9_-])central:((?:[a-z0-9][a-z0-9-]*\/)?(?:[A-Z][A-Z0-9]*-\d+(?:-\d+)?|[RQDST]\d+))(?![A-Za-z0-9_])/g;
const TASK = /^[a-z0-9][a-z0-9-]*\/T\d+$/;
const PR = /^([A-Za-z0-9][A-Za-z0-9._-]*)#(\d+)$/;
const PROVES = {
  cites: 'the file names the ID',
  'named-by': 'the commit message names the task',
  declared: 'a claim, not proven',
  pr: 'a reference; the merge is found in git',
};

const short = (sha) => sha.slice(0, 7);
const ids = (text) => [...text.matchAll(QID)].map((m) => m[1]);

// An ID in text, qualified (`central:EXP-4`) or bare (`EXP-4`, `invoice-exports/R3`).
const ANY_ID = /(?<![A-Za-z0-9_\/-])(central:)?((?:[a-z0-9][a-z0-9-]*\/)?(?:[A-Z][A-Z0-9]*-\d+(?:-\d+)?|[RQDST]\d+))(?![A-Za-z0-9_])/g;

// The IDs that a line names, as written: with `qualified`, only `central:<ID>`;
// else also a bare ID, and only those whose ID is in `known`.
export function namedIds(text, { qualified = true, known = null } = {}) {
  const out = [];
  for (const m of text.matchAll(ANY_ID)) {
    if (qualified ? !m[1] : known && !known.has(m[2])) continue;
    if (!out.includes(m[0])) out.push(m[0]);
  }
  return out;
}

// The one cite finder (design.md 3, 12; D17): each line of the repo at `dir`
// that names an ID, at commit `rev`, or in the working tree (tracked, and
// untracked not ignored) when `rev` is null. Text files only; nothing under
// the `exclude` paths. Options as namedIds. Returns [{ file, line, text, ids }].
export function findCites(dir, rev, { qualified = true, known = null, exclude = [] } = {}) {
  const pattern = qualified ? 'central:' : '[A-Z][A-Z0-9]*-?[0-9]';
  const args = ['grep', '-I', '-n', '-z', ...(rev ? [] : ['--untracked']), '-E', '-e', pattern, ...(rev ? [rev] : []),
    '--', '.', ...exclude.map((p) => `:(exclude)${p}`)];
  const out = git(dir, args, { allowFail: true }) ?? '';
  const found = [];
  for (const l of out.split('\n')) {
    if (!l) continue;
    const [where, n, ...rest] = l.split('\0');
    const text = rest.join('\0');
    const named = namedIds(text, { qualified, known });
    if (named.length) found.push({ file: rev ? where.slice(rev.length + 1) : where, line: Number(n), text, ids: named });
  }
  return found;
}

// A repo named in config, made readable: { dir, sha } or { unknown }.
function open(top, { name, path, url, commit }) {
  if (typeof path !== 'string' || !path) return { unknown: url ? `no path in config; al does not fetch ${url}` : 'no path in config' };
  const dir = isAbsolute(path) ? path : resolve(top, path);
  if (!existsSync(dir)) return { unknown: `no clone at ${path}` };
  const toplevel = git(dir, ['rev-parse', '--show-toplevel'], { allowFail: true });
  if (!toplevel || realpathSync(toplevel) !== realpathSync(dir)) return { unknown: `${path} is not a git repository` };
  const sha = commitOf(dir, commit);
  if (!sha) return { unknown: `commit ${commit} is not in the ${name} clone` };
  return { dir, sha };
}

// The output repos of the central repo's config, in config order.
export function outputRepos(top, config = loadConfig(top)) {
  const seen = new Set();
  return (Array.isArray(config.outputs) ? config.outputs : []).map((o) => {
    const e = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    const name = typeof e.name === 'string' ? e.name : null;
    const entry = { name, path: e.path ?? null, url: e.url ?? null, commit: e.commit == null ? 'HEAD' : String(e.commit) };
    let r;
    if (!name || !/^[a-z0-9][a-z0-9._-]*$/.test(name)) r = { unknown: 'no valid name in config' };
    else if (seen.has(name)) r = { unknown: `a second outputs entry named ${name}` };
    else r = open(top, entry);
    if (name) seen.add(name);
    return { ...entry, sha: r.sha ?? null, unknown: r.unknown ?? null, dir: r.dir ?? null };
  });
}

// A central ID (with no `central:`), found in a state: { display, kind } or null.
export function findCentral(state, ref) {
  const t = qualify(ref, null);
  if (t.cross) return null;
  if (!t.req) {
    const p = state.spec.get(t.id);
    return p ? { display: p.displayNumber, kind: p.kind ?? null } : null;
  }
  const r = state.requests.get(t.req);
  if (!r) return null;
  const data = r.data ?? {};
  const listed = (key) => (Array.isArray(data[key]) ? data[key] : []).some((e) => e?.id === t.id);
  let found;
  if (/^[RQ]\d+$/.test(t.id)) found = r.reqs.some((q) => q.id === t.id) || latest(data, t.id) !== null;
  else if (/^D\d+$/.test(t.id)) found = listed('decisions');
  else if (/^S\d+$/.test(t.id)) found = listed('signoff');
  else if (/^T\d+$/.test(t.id)) found = listed('tasks');
  else {
    const p = r.paras.get(t.id);
    return p ? { display: `${t.req}/${p.displayNumber}`, kind: p.kind ?? null } : null;
  }
  return found ? { display: `${t.req}/${t.id}`, kind: null } : null;
}

// The config a state is loaded with: the spec root as a repo path.
const stateConfig = (c) => ({ ...c, root: posix.normalize(String(c.root ?? 'specs')).replace(/\/+$/, ''), docs: Array.isArray(c.docs) ? c.docs : [] });

// The repo's own config at `sha`, or {} when it has none or it does not parse.
export function repoConfigAt(dir, sha) {
  try {
    const c = parse(fileAt(dir, sha, '.assuredloop/config.yaml') ?? '') ?? {};
    return typeof c === 'object' && !Array.isArray(c) ? c : {};
  } catch {
    return {};
  }
}

// Each line of `dir`'s tree at `sha` that names a central ID: [{ file, line, ids }].
const citingLines = (dir, sha) => findCites(dir, sha, { exclude: ['.assuredloop'] })
  .map(({ file, line, ids: named }) => ({ file, line, ids: named.map((x) => x.slice('central:'.length)) }));

// The first line of each (file, ID) in `lines`, in file and line order.
function firsts(lines) {
  const seen = new Map();
  for (const { file, line, ids: found } of lines) {
    for (const id of found) if (!seen.has(`${file}\t${id}`)) seen.set(`${file}\t${id}`, { file, line, id });
  }
  return [...seen.values()];
}

// Whether a declared target resolves in the central state: `central:X` and an
// unqualified X are the central repo's; another qualifier is not (null).
function resolves(state, target, request) {
  const ref = target.startsWith('central:') ? target.slice('central:'.length) : target;
  if (ref.includes(':')) return null;
  const own = new Set(state.requests.get(request)?.paras.keys() ?? []);
  const t = qualify(ref, request, own);
  return findCentral(state, t.req ? `${t.req}/${t.id}` : t.id) !== null;
}

// Whether a result applies to the repo's tree at `sha` (design.md 9);
// `bytes` holds the declared inputs there, by path.
function applies(repo, res, bytes) {
  if (!res.inputs.length) return 'applicability unknown: no declared inputs';
  if (res.commit === 'unknown') return 'applicability unknown: the commit is unknown';
  if (!res.resolved) return `applicability unknown: commit ${res.commit} is not in the ${repo.name} clone`;
  for (const x of res.inputs) {
    if (bytes.get(String(x.file)) === null) return `applicability unknown: the declared input ${x.file} is not there`;
  }
  for (const x of res.inputs) {
    if (sha256(bytes.get(String(x.file))) !== x.sha256) return `does not apply to the current text: ${x.file} changed`;
  }
  return `declared inputs unchanged since ${repo.name}@${short(res.resolved)}`;
}

// The result files of an output repo at its commit, in its own results folder.
function resultsOf(repo) {
  // As a repo path, the form git gives back: `./ci/results/` is `ci/results`;
  // `.` and `./` are the repo's top, whose files git gives with no prefix.
  const dir = posix.normalize(String(repoConfigAt(repo.dir, repo.sha).results ?? '.assuredloop/results')).replace(/\/+$/, '');
  const prefix = dir === '.' ? '' : `${dir}/`;
  const files = (git(repo.dir, ['ls-tree', '-z', '--name-only', repo.sha, ...(prefix ? ['--', prefix] : [])], { allowFail: true }) ?? '')
    .split('\0').filter((f) => f.startsWith(prefix) && !f.slice(prefix.length).includes('/') && f.endsWith('.yaml')).sort();
  // The result files, then all their declared inputs, each in one batch.
  const texts = filesAt(repo.dir, repo.sha, files);
  const parsed = files.map((file) => [file, parseResult(file, texts.get(file) ?? '')]);
  const bytes = filesAt(repo.dir, repo.sha, [...new Set(parsed.flatMap(([, r]) => (r.inputs ?? []).map((x) => String(x.file))))], null);
  // The commits the results ran at, in one batch.
  const commits = commitsOf(repo.dir, parsed.map(([, r]) => r.commit).filter((c) => typeof c === 'string' && c !== 'unknown'));
  return parsed.map(([file, r]) => {
    const inputs = r.inputs ?? [];
    const resolved = typeof r.commit === 'string' && r.commit !== 'unknown' ? commits.get(r.commit) : null;
    const res = { repo: repo.name, file, check: r.check ?? null, outcome: r.outcome ?? null, commit: r.commit ?? null, resolved, inputs, by: r.by ?? null, source: r.source ?? null, note: r.note ?? null, problems: r.problems };
    return { ...res, applies: applies(repo, res, bytes) };
  });
}

// The commits reachable from `sha` whose message names a central task: [{ sha, task }].
function taskCommits(dir, sha) {
  const out = git(dir, ['log', '--format=%H%x00%B%x01', sha], { allowFail: true }) ?? '';
  const found = [];
  for (const entry of out.split('\x01')) {
    const [h, message = ''] = entry.replace(/^\s+/, '').split('\0');
    if (!h) continue;
    for (const id of new Set(ids(message))) if (TASK.test(id)) found.push({ sha: h, task: id });
  }
  return found;
}

// The output repos of the central repo at `top` and their results, and
// nothing else of crossRepo: what al check reads (design.md 9, 12).
export function crossResults(top) {
  const repos = outputRepos(top, loadConfig(top));
  return { repos: repos.map(({ dir, ...r }) => r), results: repos.filter((r) => r.sha).flatMap((r) => resultsOf(r)) };
}

const link = (fields) => ({ repo: null, holder: null, link: null, target: null, how: null, proves: null, commit: null, unknown: null, resolves: null, file: null, line: null, request: null, ...fields });

// The cross-repo links of the central repo at `top` (design.md 12): its output
// repos, each link from them or to them, and their results.
export function crossRepo(top) {
  const config = loadConfig(top);
  const repos = outputRepos(top, config);
  if (!repos.length) return { repos: [], links: [], results: [] };
  const byName = new Map(repos.filter((r) => r.name).map((r) => [r.name, r]));
  const self = new Set(['central', ...(typeof config.repo === 'string' ? [config.repo] : [])]);
  const state = loadState(top, null, stateConfig(config), requestNames(top));
  const links = [];
  const results = [];

  for (const repo of repos) {
    if (!repo.sha) continue;
    for (const { file, line, id } of firsts(citingLines(repo.dir, repo.sha))) {
      links.push(link({ repo: repo.name, holder: `${repo.name}/${file}`, link: 'cites', target: `central:${id}`, how: 'exact', proves: PROVES.cites, commit: repo.sha, resolves: findCentral(state, id) !== null, file, line }));
    }
    for (const { sha, task } of taskCommits(repo.dir, repo.sha)) {
      links.push(link({ repo: repo.name, holder: `${repo.name}@${sha}`, link: 'named-by', target: `central:${task}`, how: 'exact', proves: PROVES['named-by'], commit: sha, resolves: findCentral(state, task) !== null }));
    }
    results.push(...resultsOf(repo));
  }

  // What the central records declare: outputs in other repos, and the PRs of tasks.
  // The merges of each repo are read once (mergesOf).
  const mergesByRepo = new Map();
  const unknownOf = (name) => (byName.has(name) ? byName.get(name).unknown : 'not an output repo in config');
  // The declared output files of each readable repo, read in one batch per repo.
  const declared = new Map();
  for (const r of state.requests.values()) {
    for (const o of Array.isArray(r.data?.outputs) ? r.data.outputs : []) {
      if (!o?.file || !o.repo || self.has(o.repo) || !byName.get(o.repo)?.sha) continue;
      if (!declared.has(o.repo)) declared.set(o.repo, new Set());
      declared.get(o.repo).add(String(o.file));
    }
  }
  const present = new Map([...declared].map(([name, files]) => [name, filesAt(byName.get(name).dir, byName.get(name).sha, [...files], null)]));
  for (const r of state.requests.values()) {
    const data = r.data ?? {};
    for (const o of Array.isArray(data.outputs) ? data.outputs : []) {
      if (!o?.file || !o.repo || self.has(o.repo)) continue;
      const repo = byName.get(o.repo);
      const known = repo?.sha ? repo : null;
      for (const kind of OUTPUT_LINKS) {
        for (const ref of [].concat(o[kind] ?? [])) {
          links.push({
            ...link({ repo: String(o.repo), holder: `${o.repo}/${o.file}`, link: kind, target: String(ref), how: 'declared', proves: PROVES.declared, commit: known?.sha ?? null, unknown: unknownOf(o.repo), resolves: resolves(state, String(ref), r.name), file: String(o.file), request: r.name }),
            present: known ? present.get(o.repo).get(String(o.file)) !== null : null,
          });
        }
      }
    }
    for (const task of Array.isArray(data.tasks) ? data.tasks : []) {
      for (const ref of [].concat(task?.prs ?? [])) {
        const m = PR.exec(String(ref));
        if (!m || self.has(m[1])) continue;
        const repo = byName.get(m[1]);
        let merge = null;
        let unknown = unknownOf(m[1]);
        if (!unknown) {
          if (!mergesByRepo.has(repo.name)) mergesByRepo.set(repo.name, mergesOf(repo.dir, repo.sha));
          merge = mergesByRepo.get(repo.name)(m[2]);
          if (!merge) unknown = `no merge found at ${repo.name}@${short(repo.sha)}`;
        }
        links.push({
          ...link({ repo: m[1], holder: `${r.name}/${task.id}`, link: 'pr', target: String(ref), how: 'declared', proves: PROVES.pr, commit: merge, unknown, request: r.name }),
          merged: merge ? `merged at ${m[1]}@${short(merge)}` : null,
        });
      }
    }
  }

  const order = new Map(repos.map((r, i) => [r.name, i]));
  const rank = (name) => order.get(name) ?? repos.length;
  links.sort((a, b) => rank(a.repo) - rank(b.repo) || a.link.localeCompare(b.link) || a.holder.localeCompare(b.holder)
    || a.target.localeCompare(b.target) || (a.line ?? 0) - (b.line ?? 0));
  return { repos: repos.map(({ dir, ...r }) => r), links, results };
}

// In an output repo: the files that the branch changed (merge-base with main
// to the working tree, and untracked files not ignored), or with no base every
// file; never under .assuredloop/.
function changedFiles(top, base) {
  const list = (args) => (git(top, args, { allowFail: true }) ?? '').split('\0').filter(Boolean);
  const files = base
    ? [...list(['diff', '--name-only', '-z', base, '--']), ...list(['ls-files', '-z', '--others', '--exclude-standard'])]
    : list(['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  return [...new Set(files)].filter((f) => !f.startsWith('.assuredloop/')).sort();
}

// al check in an output repo (design.md 12): each central ID that the branch's
// changed files cite, looked up in the central repo at its selected commit.
// Returns { body, notKnown }; both empty when config names no central repo.
export function centralLookup(top) {
  const config = loadConfig(top);
  const c = config.central;
  if (!c || typeof c !== 'object' || Array.isArray(c)) return { body: [], notKnown: [] };
  const central = { name: 'central', path: c.path ?? null, url: c.url ?? null, commit: c.commit == null ? 'HEAD' : String(c.commit) };
  const r = open(top, central);
  if (r.unknown) return { body: [`unknown: the central repo: ${r.unknown}`], notKnown: [`the central repo (${r.unknown}): no central ID was looked up`] };
  const base = mergeBase(top);
  const lines = [];
  for (const file of changedFiles(top, base)) {
    let text;
    try { text = read(top, file); } catch { continue; }
    if (text === null || text.includes('\0')) continue;
    text.split('\n').forEach((l, i) => { const found = ids(l); if (found.length) lines.push({ file, line: i + 1, ids: found }); });
  }
  const state = loadState(r.dir, r.sha, stateConfig(repoConfigAt(r.dir, r.sha)), requestNames(r.dir, r.sha));
  const body = [`central repo ${c.path} at ${r.sha}`];
  for (const { file, line, id } of firsts(lines)) {
    const found = findCentral(state, id);
    body.push(found ? `info cites ${file}:${line} central:${id} ${found.display} ${found.kind ?? '-'}`
      : `hint unresolved-central ${file}:${line} central:${id} not in the central repo at ${short(r.sha)}`);
  }
  return { body, notKnown: base ? [] : ['no base (no main branch, or no commit): every file was looked at for central IDs'] };
}
