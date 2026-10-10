// al export (design.md 11): one JSONL row per version of each paragraph,
// requirement, decision, snapshot, result and declared output, read from the
// committed files only, with the row's role at the selected commit. Every
// version comes from the first-parent history up to that commit, so removed
// and replaced text stays findable as `history`.
import { createHash } from 'node:crypto';
import { basename, posix } from 'node:path';
import { parse } from 'yaml';
import { parseMarkdown } from './markers.js';
import { requirements } from './request-md.js';
import { git, readObjects } from './git.js';
import { findCites, namedIds, outputRepos, repoConfigAt } from './repos.js';
import { SPEC, scopeOf } from './scope.js';
import { Fail, guard, write } from './base.js';

const OUTPUT_LINKS = ['implements', 'verifies', 'documents'];
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const REQUEST_FILE = /^requests\/(archive\/)?([^/]+)\/(spec\.md|request\.md|origin\/([^/]+))$/;

// The commit `at` (default HEAD) as a full hash; a refusal when there is none.
export function resolveCommit(top, at) {
  const c = git(top, ['rev-parse', '--verify', '--quiet', `${at ?? 'HEAD'}^{commit}`], { allowFail: true });
  if (!c) throw new Fail(at ? `no commit ${at}` : 'no commit yet: the export reads committed files only', at ? 'name a commit with --at <commit>' : 'commit the docs and records, then run it again');
  return c;
}

const yamlAt = (text) => {
  try { const v = parse(text ?? 'null'); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
};

// The text of each blob (or `<commit>:<path>`) that is there; with `raw`, its bytes.
function readBlobs(top, blobs, raw = false) {
  return new Map([...readObjects(top, blobs)].map(([b, bytes]) => [b, raw ? bytes : bytes.toString('utf8')]));
}

// The files of `commit`: Map path -> blob.
function treeOf(top, commit) {
  const out = git(top, ['ls-tree', '-r', '-z', '--full-tree', commit]) ?? '';
  const tree = new Map();
  for (const e of out.split('\0').filter(Boolean)) {
    const tab = e.indexOf('\t');
    const [, type, blob] = e.slice(0, tab).split(' ');
    if (type === 'blob') tree.set(e.slice(tab + 1), blob);
  }
  return tree;
}

// The changes of each first-parent commit up to `commit`, oldest first:
// [{ commit, changes: [{ path, blob|null }] }]. A merge counts as one change
// against its first parent.
function walk(top, commit, paths) {
  const out = git(top, ['log', '--first-parent', '--diff-merges=first-parent', '--reverse', '--raw', '-z', '--no-abbrev', '--no-renames', '--format=%x01%H', commit, '--', ...paths]) ?? '';
  const commits = [];
  const fields = out.split('\0');
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i].replace(/^\n+/, '');
    if (f.startsWith('\x01')) commits.push({ commit: f.slice(1), changes: [] });
    else if (f.startsWith(':') && commits.length) {
      const blob = f.split(' ')[3];
      commits.at(-1).changes.push({ path: fields[++i], blob: /^0+$/.test(blob) ? null : blob });
    }
  }
  return commits;
}

// A link target as written, made exact in its doc (as al index does).
function qualify(ref, request, own) {
  if (!request || ref.includes(':') || ref.includes('/')) return ref;
  if (/^[RQDS]\d+$/.test(ref) || own.has(ref)) return `${request}/${ref}`;
  return ref;
}

// What a path holds: { type, doc, request?, archived? }, or null.
function kindOfPath(path, config, extra) {
  const r = REQUEST_FILE.exec(path);
  if (r) {
    const [, archived, request, part, origin] = r;
    const type = part === 'spec.md' ? 'change' : part === 'request.md' ? 'requirements' : 'origin';
    return { type, doc: request, request, archived: Boolean(archived), file: origin };
  }
  const adr = `${config.root}/adr/`;
  if (path.startsWith(adr) && /^\d{4}-[^/]*\.md$/.test(path.slice(adr.length))) return { type: 'adr', doc: path };
  if (scopeOf(path, config) === SPEC) return { type: 'spec', doc: path };
  const rec = /^\.assuredloop\/records\/requests\/([^/]+)\.yaml$/.exec(path);
  if (rec) return { type: 'record', doc: rec[1], request: rec[1] };
  if (path.startsWith(`${config.results}/`) && path.endsWith('.yaml')) return { type: 'result', doc: path };
  return null;
}

// The items one version of a file holds: [{ doc, id, sha256, row }].
function itemsOf(path, text, what, bytes = null) {
  if (what.type === 'spec' || what.type === 'adr' || what.type === 'change') {
    const paragraphs = parseMarkdown(text, path).paragraphs.filter((p) => p.id);
    const title = paragraphs.find((p) => /^#\s/.test(p.text))?.text.replace(/^#\s+/, '').split('\n')[0].trim() ?? null;
    const own = new Set(paragraphs.map((p) => p.id));
    const req = what.type === 'change' ? what.request : null;
    return paragraphs.map((p) => ({
      doc: what.doc,
      id: req ? `${req}/${p.id}` : p.id,
      sha256: p.sha256,
      row: {
        source_type: what.type, file: path, line: p.line ?? null, heading_path: p.headingPath ?? [], kind: p.kind ?? null, title,
        serves: (p.links?.serves ?? []).map((x) => qualify(x, req, own)),
        builds_on: (p.links?.buildsOn ?? []).map((x) => qualify(x, req, own)),
        changes: (p.links?.changes ?? []).map((x) => qualify(x, req, own)),
        text: p.text,
      },
    }));
  }
  if (what.type === 'requirements') {
    return requirements(text).map((q) => ({
      doc: what.doc, id: `${what.request}/${q.id}`, sha256: q.sha256,
      row: { source_type: q.id.startsWith('Q') ? 'question' : 'requirement', file: path, line: null, heading_path: [], text: q.text },
    }));
  }
  if (what.type === 'record') {
    const data = yamlAt(text);
    return (data?.decisions ?? []).filter((d) => d?.id).map((d) => {
      const body = String(d.text ?? d.summary ?? '');
      return { doc: what.doc, id: `${what.request}/${d.id}`, sha256: sha256(body), row: { source_type: 'decision', file: path, line: null, heading_path: [], text: body } };
    });
  }
  // An output file (D17): its version (the hash of its bytes), and only the
  // lines that name an ID.
  if (what.type === 'output') {
    const lines = text.split('\n').map((l, i) => ({ n: i + 1, text: l, ids: namedIds(l, what.cite) })).filter((l) => l.ids.length);
    return [{ doc: path, id: path, sha256: sha256(bytes ?? text), row: { source_type: 'output', file: path, line: null, heading_path: [], lines } }];
  }
  // A snapshot or a result: the whole file is one item.
  const id = what.type === 'origin' ? `${what.request}/${what.file}` : path;
  const type = what.type === 'origin' ? 'owner-words' : what.type;
  return [{ doc: what.doc, id, sha256: sha256(text), row: { source_type: type, file: path, line: null, heading_path: [], text } }];
}

// The settings of the commit: the spec root, the docs, the repo name and the results folder.
function configAt(top, tree, blobs) {
  const c = yamlAt(blobs.get(tree.get('.assuredloop/config.yaml'))) ?? {};
  const clean = (p) => String(p).replace(/^\.\//, '').replace(/\/+$/, '');
  return {
    ...c,
    root: clean(c.root ?? 'specs'),
    docs: Array.isArray(c.docs) ? c.docs : [],
    results: clean(c.results ?? '.assuredloop/results'),
    repo: typeof c.repo === 'string' && c.repo ? c.repo : basename(top),
  };
}

const startsWith = (full, short) => typeof short === 'string' && short.length >= 7 && String(full).startsWith(short);

// The records of the requests at the commit, by name, and the declared
// output files of this repo with the requests that declare them.
function recordsAt(top, tree, config) {
  const recordBlobs = readBlobs(top, [...tree].filter(([p]) => /^\.assuredloop\/records\/requests\/[^/]+\.yaml$/.test(p)).map(([, b]) => b));
  const records = new Map();
  for (const [p, b] of tree) {
    const m = /^\.assuredloop\/records\/requests\/([^/]+)\.yaml$/.exec(p);
    if (m) records.set(m[1], yamlAt(recordBlobs.get(b)) ?? {});
  }
  const outputs = new Map();
  for (const [name, rec] of records) {
    for (const o of Array.isArray(rec.outputs) ? rec.outputs : []) {
      if (!o?.file || (o.repo && o.repo !== config.repo)) continue;
      if (!outputs.has(o.file)) outputs.set(o.file, new Set());
      outputs.get(o.file).add(name);
    }
  }
  return { records, outputs };
}

// What the history walk knows: every version of every item, and the items
// each path holds at `last`. `spec` names the settings it was walked with; a
// walk with other settings starts again from the first commit.
export const newHistory = () => ({ last: null, spec: null, files: [], versions: new Map(), atPath: new Map() });

// The commits of the first-parent history up to `commit`, as a set.
export const firstParents = (top, commit) => new Set((git(top, ['rev-list', '--first-parent', commit]) ?? '').split('\n').filter(Boolean));

// Brings `h` to `commit`: walks only the commits after `h.last` when that is
// on the first-parent history of `commit` (`chain`) and the settings are the
// same; else from the first commit, so a version's number never depends on a
// branch indexed before. Reads only the files each commit changed. Returns the keys
// (doc TAB id) whose versions changed.
function advance(top, h, commit, spec, paths, classify, chain, { added = [], removed = [] } = {}) {
  const resume = h.last && h.spec === spec && chain.has(h.last);
  if (!resume) Object.assign(h, newHistory());
  else {
    // Files that left the set lose their rows; a file that joined it gets its
    // history up to the indexed commit, read for its path alone.
    for (const path of removed) {
      h.atPath.delete(path);
      for (const [key, vs] of h.versions) if ([...vs.values()].some((v) => v.meta.doc === path && v.meta.type === 'output')) h.versions.delete(key);
    }
    if (added.length) walkInto(top, h, h.last, added.map((p) => `:(literal)${p}`), classify);
  }
  h.spec = spec;
  if (h.last === commit) return;
  walkInto(top, h, h.last ? `${h.last}..${commit}` : commit, paths, classify);
  h.last = commit;
}

// Walks the commits of `range` that touch `paths` into `h`, oldest first.
function walkInto(top, h, range, paths, classify) {
  const commits = walk(top, range, paths);
  const blobs = readBlobs(top, [...new Set(commits.flatMap((c) => c.changes.map((x) => x.blob)).filter(Boolean))], true);
  for (const { commit: c, changes } of commits) {
    const touched = new Set();
    for (const { path, blob } of changes) {
      for (const it of h.atPath.get(path) ?? []) touched.add(it.key);
      h.atPath.delete(path);
      const what = blob && classify(path);
      const bytes = what ? blobs.get(blob) : undefined;
      if (bytes === undefined) continue;
      const items = itemsOf(path, bytes.toString('utf8'), what, bytes);
      h.atPath.set(path, items.map((it) => ({ key: `${it.doc}\t${it.id}`, sha: it.sha256 })));
      for (const it of items) {
        const key = `${it.doc}\t${it.id}`;
        touched.add(key);
        if (!h.versions.has(key)) h.versions.set(key, new Map());
        const vs = h.versions.get(key);
        const meta = { doc: it.doc, id: it.id, archived: Boolean(what.archived), request: what.request ?? null, type: what.type };
        const v = vs.get(it.sha256);
        if (!v) vs.set(it.sha256, { n: vs.size + 1, from: c, until: null, row: it.row, meta });
        else Object.assign(v, { row: it.row, meta });
      }
    }
    // A touched version that no path holds after this commit ended here.
    const present = new Set([...h.atPath.values()].flat().filter((x) => touched.has(x.key)).map((x) => `${x.key}\t${x.sha}`));
    for (const key of touched) {
      for (const [sha, v] of h.versions.get(key) ?? []) {
        if (present.has(`${key}\t${sha}`)) v.until = null;
        else if (v.until === null) v.until = c;
      }
    }
  }
}

// The repos of the export at `commit`: the central repo first, then the
// output repos of its config as committed there, each { name, commit, unknown, dir }.
export function selectedRepos(top, commit) {
  const tree = treeOf(top, commit);
  const config = configAt(top, tree, readBlobs(top, [tree.get('.assuredloop/config.yaml')].filter(Boolean)));
  return [{ name: config.repo, commit, unknown: null, dir: top },
    ...outputRepos(top, config).map((r) => ({ name: r.name, commit: r.sha, unknown: r.unknown, dir: r.dir }))];
}

// The declared outputs of the records, by `<repo> TAB <file>`: [{ request,
// link, target }], sorted. An entry with no repo, or the central's own name,
// is the central repo's.
function declaredOf(records, config) {
  const out = new Map();
  for (const [request, rec] of records) {
    for (const o of Array.isArray(rec.outputs) ? rec.outputs : []) {
      if (!o?.file) continue;
      const repo = !o.repo || o.repo === config.repo || o.repo === 'central' ? config.repo : String(o.repo);
      const key = `${repo}\t${o.file}`;
      if (!out.has(key)) out.set(key, []);
      for (const link of OUTPUT_LINKS) for (const target of [].concat(o[link] ?? [])) out.get(key).push({ request, link, target: String(target) });
    }
  }
  for (const list of out.values()) list.sort((a, b) => `${a.request}\t${a.link}\t${a.target}`.localeCompare(`${b.request}\t${b.link}\t${b.target}`));
  return out;
}

const PROVES = { exact: 'proves only that the ID is named', declared: 'a claim, not proven' };

// The rows of one repo's output files and results, walked on its own
// first-parent history up to `commit` with the history `hs.get(key)`. An
// output row holds only the lines that name an ID (D17).
function outputRows(dir, commit, hs, key, { repo, files, results, cite, declared, chain }) {
  if (!hs.has(key)) hs.set(key, newHistory());
  const h = hs.get(key);
  const inResults = (p) => results !== null && p.endsWith('.yaml') && (results === '.' ? !p.includes('/') : p.startsWith(`${results}/`) && !p.slice(results.length + 1).includes('/'));
  // A result file is a result, never a member of the output set (it keeps its history).
  const list = [...files].filter((p) => !inResults(p)).sort();
  const paths = [...list.map((f) => `:(literal)${f}`), ...(results === null ? [] : [results === '.' ? ':(glob)*.yaml' : `:(literal)${results}/`])];
  if (!paths.length) { Object.assign(h, newHistory()); return []; }
  // The set of files and the known IDs are not in the walk's settings: a file
  // that joins the set is walked alone, and IDs are matched when rows are made.
  const spec = JSON.stringify({ results, cite: cite.qualified ? 'central:' : 'known IDs' });
  const walked = { qualified: cite.qualified, known: null };
  const members = new Set(list);
  const classify = (p) => (inResults(p) ? { type: 'result', doc: p } : members.has(p) ? { type: 'output', doc: p, cite: walked } : null);
  const before = new Set(h.files ?? []);
  advance(dir, h, commit, spec, paths, classify, chain, { added: list.filter((f) => !before.has(f)), removed: [...before].filter((f) => !members.has(f) && !inResults(f)) });
  h.files = list;
  const current = new Set([...h.atPath.values()].flat().map((x) => `${x.key}\t${x.sha}`));
  const rows = [];
  for (const [k, vs] of h.versions) {
    for (const [sha, v] of vs) {
      const live = current.has(`${k}\t${sha}`);
      const out = v.row.source_type === 'output';
      let extra = {};
      let text = v.row.text;
      if (out) {
        // In the central repo only the IDs that the export has count (D17).
        const keep = (id) => !cite.known || cite.known.has(id.replace(/^central:/, ''));
        const lines = v.row.lines.map((l) => ({ ...l, ids: l.ids.filter(keep) })).filter((l) => l.ids.length);
        const cites = [...new Set(lines.flatMap((l) => l.ids))].sort();
        const dec = declared.get(`${repo}\t${v.row.file}`);
        const how = [...(dec ? ['declared'] : []), ...(cites.length ? ['exact'] : [])];
        extra = { cites, declared: dec ?? [], how, proves: how.map((x) => PROVES[x]) };
        text = lines.map((l) => `${l.n}: ${l.text}`).join('\n');
      }
      rows.push({
        repo, doc_or_request: v.meta.doc, id: v.meta.id, version: v.n, role: live ? 'evidence' : 'history', source_type: v.row.source_type,
        file: v.row.file, line: null, heading_path: [], kind: v.row.source_type, serves: [], builds_on: [], changes: [],
        valid_from: v.from, superseded_by: live ? null : v.until, commit: live ? commit : v.from, sha256: sha, text, ...extra, title: null,
      });
    }
  }
  return rows;
}

// The rows of the export at `commit`: the central repo's, sorted, then each
// known output repo's (design.md 12; D17). `h` is the central history to
// resume from and `hs` the output histories by key (the index keeps them);
// with none, the whole history is walked. `repos` gives each repo's commit,
// or why it is unknown.
export function exportRows(top, commit, h = newHistory(), hs = new Map()) {
  const tree = treeOf(top, commit);
  const config = configAt(top, tree, readBlobs(top, [tree.get('.assuredloop/config.yaml')].filter(Boolean)));
  const { records, outputs } = recordsAt(top, tree, config);
  const chain = firstParents(top, commit);
  const spec = JSON.stringify({ root: config.root, docs: config.docs, results: config.results, repo: config.repo });
  const paths = ['*.md', ...['.assuredloop/records/requests/', `${config.results}/`].map((p) => `:(literal)${p}`)];
  advance(top, h, commit, spec, paths, (path) => kindOfPath(path, config, outputs), chain);
  const current = new Set([...h.atPath.values()].flat().map((x) => `${x.key}\t${x.sha}`));

  // Requirement versions: the record's number when it holds the hash; else after its highest.
  const number = new Map();
  for (const [key, vs] of h.versions) {
    const m = /^([^/]+)\/([RQ]\d+)$/.exec(key.split('\t')[1]);
    if (!m || ![...vs.values()].some((v) => v.meta.type === 'requirements')) continue;
    const rec = records.get(m[1]) ?? {};
    const known = [...(Array.isArray(rec.requirements) ? rec.requirements : []), ...(Array.isArray(rec.questions) ? rec.questions : [])].filter((x) => x?.id === m[2]);
    let next = Math.max(0, ...known.map((x) => Number(x.version) || 0));
    for (const [sha, v] of [...vs].sort((a, b) => a[1].n - b[1].n)) {
      const hit = known.find((x) => x.sha256 === sha || startsWith(sha, x.sha256));
      number.set(`${key}\t${sha}`, hit ? Number(hit.version) : ++next);
    }
  }

  // The hints of the per-doc records at the commit.
  const hintBlobs = readBlobs(top, [...tree].filter(([p]) => /^\.assuredloop\/records\/.*\.md\.yaml$/.test(p)).map(([, b]) => b));
  const hintDocs = new Map();
  const hintsOf = (file, id, sha) => {
    if (!hintDocs.has(file)) hintDocs.set(file, yamlAt(hintBlobs.get(tree.get(`.assuredloop/records/${file}.yaml`))));
    const local = id.includes('/') ? id.slice(id.indexOf('/') + 1) : id;
    const paras = hintDocs.get(file)?.paragraphs;
    const hint = (Array.isArray(paras) ? paras : []).find((p) => p?.id === local)?.hint;
    if (!hint || hint.basis_sha256 !== sha) return null;
    return { summary: hint.summary ?? null, tags: Array.isArray(hint.tags) ? hint.tags : [] };
  };

  const adrs = [...tree].filter(([p]) => kindOfPath(p, config, outputs)?.type === 'adr');
  const adrTexts = readBlobs(top, adrs.map(([, b]) => b));
  const statusOf = new Map(adrs.map(([p, b]) => [p, ((adrTexts.get(b) ?? '').match(/^Status:\s*([a-z]+)/im)?.[1] ?? '').toLowerCase()]));

  const rows = [];
  for (const [key, vs] of h.versions) {
    for (const [sha, v] of vs) {
      const { meta, row } = v;
      const live = current.has(`${key}\t${sha}`);
      const rec = meta.request ? records.get(meta.request) : null;
      const signoffs = Array.isArray(rec?.signoff) ? rec.signoff : [];
      let sourceType = row.source_type;
      let id = meta.id;
      if (sourceType === 'change' && String(rec?.tier) === 'S') sourceType = 'spike';
      const signed = sourceType === 'owner-words' ? signoffs.find((x) => x?.id && basename(String(x.file ?? "")) === basename(row.file)) : null;
      if (signed) { sourceType = 'signoff'; id = `${meta.request}/${signed.id}`; }
      const role0 = { spec: 'baseline', adr: { proposed: 'proposal', superseded: 'history' }[statusOf.get(row.file)] ?? 'baseline', change: 'proposal', spike: 'spike', result: 'evidence', output: 'evidence' }[sourceType] ?? 'source';
      // history wins: a past version, a closed or archived request, a dropped change paragraph.
      const closed = meta.archived || (rec && rec.status !== undefined && rec.status !== 'open');
      const dispositions = Array.isArray(rec?.dispositions) ? rec.dispositions : [];
      const local = meta.id.slice(meta.id.indexOf('/') + 1);
      const dropped = (sourceType === 'change' || sourceType === 'spike') && dispositions.some((d) => ['abandoned', 'superseded'].includes(d?.disposition)
        && [meta.id, local].includes(String(d.source)) && (d.source_sha256 === sha || startsWith(sha, d.source_sha256)));
      const role = !live || closed || dropped ? 'history' : role0;
      const hints = live && ['spec', 'adr', 'change', 'spike'].includes(sourceType) ? hintsOf(row.file, meta.id, sha) : null;
      rows.push({
        repo: config.repo,
        doc_or_request: meta.doc,
        id,
        version: number.get(`${key}\t${sha}`) ?? v.n,
        role,
        source_type: sourceType,
        file: row.file,
        line: row.line,
        heading_path: row.heading_path,
        kind: row.kind ?? sourceType,
        serves: row.serves ?? [],
        builds_on: row.builds_on ?? [],
        changes: row.changes ?? [],
        valid_from: v.from,
        superseded_by: live ? null : v.until,
        commit: live ? commit : v.from,
        sha256: sha,
        text: row.text,
        ...(hints ? { hints } : {}),
        title: row.title ?? null,
      });
    }
  }
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const order = (list) => list.sort((a, b) => cmp(a.doc_or_request, b.doc_or_request) || cmp(a.id, b.id) || a.version - b.version || cmp(a.sha256, b.sha256));

  // The output files (D17): in the central repo, the declared ones and every
  // other file that names a known ID, but not the spec's own files; in an
  // output repo, the declared ones and every file that names central:<ID>.
  const declared = declaredOf(records, config);
  const known = new Set(rows.filter((r) => r.role !== 'history').map((r) => r.id));
  const own = (name) => [...declared.keys()].filter((k) => k.startsWith(`${name}\t`)).map((k) => k.slice(name.length + 1));
  const cite = { qualified: false, known };
  const exclude = [config.root, 'requests', '.assuredloop', config.results, ...config.docs.map((d) => String(d.file ?? '').replace(/^\.\//, ''))].filter(Boolean);
  // A declared file of the spec's own is no output either.
  const outside = (path) => !exclude.some((e) => path === e || path.startsWith(`${e}/`));
  const files = new Set([...findCites(top, commit, { ...cite, exclude }).map((c) => c.file), ...own(config.repo).filter(outside)]);
  rows.push(...outputRows(top, commit, hs, `${config.repo}\toutputs`, { repo: config.repo, files, results: null, cite, declared, chain }));
  order(rows);

  const repos = [{ name: config.repo, commit, unknown: null }];
  for (const r of outputRepos(top, config)) {
    repos.push({ name: r.name, commit: r.sha, unknown: r.unknown });
    if (!r.sha) continue;
    const results = posix.normalize(String(repoConfigAt(r.dir, r.sha).results ?? '.assuredloop/results')).replace(/\/+$/, '');
    const skip = ['.assuredloop', ...(results === '.' ? [] : [results])];
    const cited = findCites(r.dir, r.sha, { exclude: skip }).map((c) => c.file);
    const theirs = new Set([...cited, ...own(r.name).filter((p) => !skip.some((e) => p === e || p.startsWith(`${e}/`)))]);
    rows.push(...order(outputRows(r.dir, r.sha, hs, r.name, { repo: r.name, files: theirs, results, cite: { qualified: true }, declared, chain: firstParents(r.dir, r.sha) })));
  }
  return { rows, config, records, outputs, chain, repos };
}

// The parent section of paragraph `id` in `file` as it was at `commit`: the
// paragraphs under the same heading path, in file order, each { id, sha256,
// row }. Null when the file or the ID is not there.
export function sectionAt(top, commit, file, id) {
  const [text] = readBlobs(top, [`${commit}:${file}`]).values();
  if (text === undefined) return null;
  const r = REQUEST_FILE.exec(file);
  const what = r && r[3] === 'spec.md' ? { type: 'change', doc: r[2], request: r[2] } : { type: 'spec', doc: file };
  const items = itemsOf(file, text, what);
  const hit = items.find((it) => it.id === id);
  if (!hit) return null;
  const path = JSON.stringify(hit.row.heading_path);
  return items.filter((it) => JSON.stringify(it.row.heading_path) === path);
}

// A row as the export writes it: the design's fields, in a fixed order.
export const exported = ({ title, ...row }) => row;

// al export [--at <commit>] [--out <file>]
export function exportCommand({ top, opts }) {
  const commit = resolveCommit(top, opts.at);
  const { rows, repos } = exportRows(top, commit);
  const text = rows.map((r) => JSON.stringify(exported(r))).join('\n') + (rows.length ? '\n' : '');
  if (opts.out === undefined) return { raw: text };
  guard(top, [opts.out]);
  write(top, opts.out, text);
  const roles = {};
  for (const r of rows) roles[r.role] = (roles[r.role] ?? 0) + 1;
  const count = (name) => rows.filter((r) => r.repo === name).length;
  return {
    body: [`Wrote ${rows.length} rows to ${opts.out}, at ${commit.slice(0, 12)}: ${Object.entries(roles).sort().map(([k, n]) => `${n} ${k}`).join(', ') || 'none'}`,
      ...(repos.length > 1 ? repos.map((r) => (r.commit ? `  ${r.name}@${r.commit.slice(0, 12)}: ${count(r.name)} rows` : `  ${r.name} unknown: no rows`)) : [])],
    next: 'al search <words>',
    notKnown: repos.filter((r) => r.unknown).map((r) => `the output repo ${r.name}: ${r.unknown}; none of its rows is exported`),
  };
}
