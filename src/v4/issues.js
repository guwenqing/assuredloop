// Hints from the linked issues (issue-hints R1, design.md 8): with
// `al check --issues`, the GitHub issues that the `tasks:` of each open
// request name, read with the GitHub CLI `gh` (D1). It only reads: `gh repo
// view` and `gh issue view`. Each finding is a hint (R1, hints-and-blocks R2):
// - issue-superseded: the issue's text names a superseded ADR without its
//   successor, by R5's own code (supersededIn, D7);
// - issue-bare-ref: a bare `#n` in an issue of another repository;
// - issue-not-sub: not a sub-issue of the request's own issue (D3);
// - phrase: a phrase of the config matches (R2, phrases.js);
// - issue-unread: an issue that was not read, with the reason (D5).
// An issue's text is its body and its comments that are not minimized (D4).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { citedMessage, supersededIn } from './blocks.js';
import { phraseHits, phraseMessage } from './phrases.js';
import { outputRepos } from './repos.js';

const TIMEOUT = 60_000;
const ISSUE_URL = /\bhttps?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)\b/g;
const QUALIFIED = /(?<![\w./-])([\w.-]+)\/([\w.-]+)#(\d+)\b/g;
const NAMED = /(?<![\w./#-])([a-z0-9][a-z0-9._-]*)#(\d+)\b/g;
const BARE = /(?<![\w/#&-])#(\d+)\b/g;
const firstLine = (s) => String(s ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';
const slug = (repo) => repo.toLowerCase();

// The issues that one `ref` names, in the forms of D2: [{ repo } | { name } | { own }, n].
export function issueRefs(ref, names) {
  let rest = String(ref ?? '');
  const out = [];
  const take = (re, f) => {
    rest = rest.replace(re, (...m) => {
      const r = f(m);
      if (!r) return m[0];
      out.push(r);
      return ' '.repeat(m[0].length);
    });
  };
  take(ISSUE_URL, (m) => ({ repo: `${m[1]}/${m[2]}`, n: Number(m[3]) }));
  take(QUALIFIED, (m) => ({ repo: `${m[1]}/${m[2]}`, n: Number(m[3]) }));
  take(NAMED, (m) => (names.has(m[1]) ? { name: m[1], n: Number(m[2]) } : null));
  take(BARE, (m) => ({ own: true, n: Number(m[1]) }));
  return out;
}

// The names of the repos that the config names, each with its folder or why it has none.
function namedRepos(top, config) {
  const out = new Map();
  for (const o of outputRepos(top, config)) if (o.name) out.set(o.name, o.dir ? { dir: o.dir } : { unknown: o.unknown });
  const c = config.central;
  if (c && typeof c === 'object' && typeof c.path === 'string' && c.path) {
    const dir = isAbsolute(c.path) ? c.path : resolve(top, c.path);
    out.set('central', existsSync(dir) ? { dir } : { unknown: `no clone at ${c.path}` });
  }
  return out;
}

// Each task reference to an issue in the open requests: [{ r, task, ref }].
function occurrences(state, names) {
  const out = [];
  for (const r of state.requests.values()) {
    if (!r.open) continue;
    for (const t of Array.isArray(r.data?.tasks) ? r.data.tasks : []) {
      if (!t || typeof t !== 'object' || t.ref == null) continue;
      for (const ref of issueRefs(t.ref, names)) out.push({ r, task: String(t.id ?? '-'), ref });
    }
  }
  return out;
}

const written = (ref) => (ref.repo ? `${ref.repo}#${ref.n}` : ref.name ? `${ref.name}#${ref.n}` : `#${ref.n}`);

// Without --issues: the Not known line, when tasks name issues.
export function issuesNotRead(top, state) {
  const names = new Set(namedRepos(top, state.config).keys());
  const n = new Set(occurrences(state, names).map((o) => (o.ref.repo ? slug(written(o.ref)) : written(o.ref)))).size;
  return n ? [`the ${n === 1 ? 'issue' : `${n} issues`} that the tasks of the open requests name: not read; al check --issues reads them`] : [];
}

function gh(cwd, args) {
  const r = spawnSync('gh', args, { cwd, encoding: 'utf8', timeout: TIMEOUT, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: '1' } });
  if (r.error) {
    if (r.error.code === 'ENOENT') return { error: 'gh is not installed (no gh on PATH)' };
    if (r.error.code === 'ETIMEDOUT') return { error: `gh gave no answer in ${TIMEOUT / 1000} seconds` };
    return { error: `gh could not run: ${r.error.message}` };
  }
  if (r.status !== 0) return { error: firstLine(r.stderr) || firstLine(r.stdout) || `gh exited with ${r.status}`, stderr: String(r.stderr ?? '') };
  try {
    return { json: JSON.parse(r.stdout) };
  } catch {
    return { error: 'gh gave an answer that is not JSON' };
  }
}

const repoOf = (dir) => {
  const r = gh(dir, ['repo', 'view', '--json', 'nameWithOwner']);
  if (r.error) return { unknown: `gh repo view: ${r.error}` };
  return typeof r.json?.nameWithOwner === 'string' && r.json.nameWithOwner.includes('/') ? { repo: r.json.nameWithOwner } : { unknown: 'gh repo view gave no nameWithOwner' };
};

// The issue that a URL or `owner/repo#n` names, as `owner/repo#n`, or null.
const issueKey = (s) => {
  const t = String(s ?? '');
  const m = new RegExp(ISSUE_URL.source).exec(t) ?? new RegExp(QUALIFIED.source).exec(t);
  return m ? `${m[1]}/${m[2]}#${m[3]}` : null;
};

// The request's own issue (D3): the first source whose url names an issue.
const ownIssue = (r) => (Array.isArray(r.data?.sources) ? r.data.sources : []).map((s) => (s && typeof s === 'object' ? issueKey(s.url) : null)).find(Boolean) ?? null;

export function issueHints(top, state, matchers, add) {
  const notKnown = [];
  const names = namedRepos(top, state.config);
  const occ = occurrences(state, new Set(names.keys()));
  const cited = supersededIn(state);
  let own;
  const ownRepo = () => (own ??= repoOf(top));
  const folders = new Map();
  // Each reference's repository: { repo } or { unknown }.
  const repoFor = (ref) => {
    if (ref.repo) return { repo: ref.repo };
    if (ref.own) return ownRepo();
    const named = names.get(ref.name);
    if (!named.dir) return { unknown: `${ref.name}: ${named.unknown}` };
    if (!folders.has(ref.name)) folders.set(ref.name, repoOf(named.dir));
    return folders.get(ref.name);
  };

  // Read each issue once, in the order the tasks name them.
  const issues = new Map();
  const unread = [];
  const noParent = new Set();
  for (const o of occ) {
    const where = repoFor(o.ref);
    const key = where.repo ? slug(`${where.repo}#${o.ref.n}`) : `? ${written(o.ref)}`;
    o.key = key;
    if (issues.has(key)) continue;
    const entry = { first: o, repo: where.repo ?? null, n: o.ref.n };
    issues.set(key, entry);
    if (!where.repo) {
      entry.error = where.unknown;
      continue;
    }
    const args = ['issue', 'view', String(o.ref.n), '--repo', where.repo, '--json'];
    let r = gh(top, [...args, 'number,url,body,comments,parent']);
    if (r.error && /parent/.test(r.stderr ?? '')) {
      r = gh(top, [...args, 'number,url,body,comments']);
      if (!r.error) noParent.add(slug(where.repo));
    }
    if (r.error) entry.error = r.error;
    else if (!r.json || typeof r.json !== 'object') entry.error = 'gh gave no issue';
    else entry.issue = r.json;
  }

  for (const e of issues.values()) {
    const id = `${e.first.r.name}/${e.first.task}`;
    const shown = e.repo ? `${e.repo}#${e.n}` : written(e.first.ref);
    if (e.error) {
      add('hint', 'issue-unread', shown, id, `not read: ${e.error}`);
      unread.push(`${shown} (${e.error})`);
      continue;
    }
    // The issue's own repository, from its URL when gh gives one.
    const at = new RegExp(ISSUE_URL.source).exec(String(e.issue.url ?? ''));
    e.home = at ? `${at[1]}/${at[2]}` : e.repo;
    const texts = [{ where: shown, text: e.issue.body }];
    (Array.isArray(e.issue.comments) ? e.issue.comments : []).forEach((c, i) => {
      if (c && typeof c === 'object' && c.isMinimized !== true) texts.push({ where: `${shown}/comment-${i + 1}`, text: c.body });
    });
    const ownKnown = ownRepo().repo;
    const other = ownKnown && slug(e.home) !== slug(ownKnown);
    for (const { where, text } of texts) {
      if (typeof text !== 'string' || !text) continue;
      for (const c of cited(text)) add('hint', 'issue-superseded', `${where}:${c.line}`, id, citedMessage(c));
      if (other) {
        text.replace(/\r\n?/g, '\n').split('\n').forEach((l, i) => {
          const refs = [...l.matchAll(BARE)].map((m) => `#${m[1]}`);
          if (refs.length) add('hint', 'issue-bare-ref', `${where}:${i + 1}`, id, `${refs.join(', ')} in an issue of ${e.home} points to ${e.home}, not to ${ownKnown}: write ${refs.map((x) => `${ownKnown}${x}`).join(', ')} if that is meant`);
        });
      }
      for (const h of phraseHits(text, matchers)) add('hint', 'phrase', `${where}:${h.line}`, id, phraseMessage(h));
    }
  }
  if (issues.size && [...issues.values()].some((e) => e.issue) && !ownRepo().repo) {
    notKnown.push(`the issue-bare-ref check: the request's own repository is not known (${ownRepo().unknown})`);
  }

  // Sub-issues, for each request and each issue its tasks name.
  const pairs = new Map();
  for (const o of occ) if (!pairs.has(`${o.r.name} ${o.key}`)) pairs.set(`${o.r.name} ${o.key}`, o);
  const noOwn = new Set();
  const noData = new Set();
  for (const o of pairs.values()) {
    const e = issues.get(o.key);
    if (!e.issue) continue;
    const mine = ownIssue(o.r);
    if (!mine) {
      noOwn.add(o.r.name);
      continue;
    }
    if (noParent.has(slug(e.repo))) {
      noData.add(e.repo);
      continue;
    }
    const self = `${e.home}#${e.n}`;
    if (slug(self) === slug(mine)) continue;
    const p = e.issue.parent;
    const parent = p && typeof p === 'object' ? issueKey(p.url) ?? (p.number ? `${e.home}#${p.number}` : null) : null;
    if (parent && slug(parent) === slug(mine)) continue;
    add('hint', 'issue-not-sub', `${e.repo}#${e.n}`, `${o.r.name}/${o.task}`, `is not a sub-issue of ${mine}, the request's own issue${parent ? `; its parent is ${parent}` : ''}`);
  }
  for (const n of noOwn) notKnown.push(`whether the issues of ${n} are sub-issues of its own issue: no origin source of ${n} names an issue`);
  for (const repo of noData) notKnown.push(`whether the issues of ${repo} are sub-issues: GitHub gives no sub-issue data for ${repo}`);
  if (unread.length) notKnown.push(`the issues that were not read: ${unread.join(', ')}`);
  const read = [...issues.values()].filter((e) => e.issue).length;
  add('info', 'issues', '-', '-', `read ${read} of ${issues.size} issues that the tasks of the open requests name`);
  return notKnown;
}
