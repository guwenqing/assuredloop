// al index: writes the per-doc records (the regenerable fields, with the
// agents' hints kept), appends requirement versions, freezes the bindings of
// new links. Ordinary indexing never advances a binding; only a recorded
// judgement does (al record <name> judgement, #88; design.md 4, 10).
// With --issues <folder>, it keeps the text of the tasks' work items at the
// moment of reliance (light-design LD-22, kept-items.js).
import { accessSync, constants, lstatSync, readdirSync } from 'node:fs';
import { join, posix } from 'node:path';
import { parse, stringify } from 'yaml';
import { parseMarkdown } from './markers.js';
import { baseOf, git, mergeBase, fileAt, filesAt, blobAt, shallowCommits } from './git.js';
import { loadConfig } from './config.js';
import { ADR_FILE, SPEC, adrId, docsInScope, symlinkOn } from './scope.js';
import { Fail, SCHEMA, docRecordPath, guard, inside, read, recordPath, sha256, write } from './base.js';
import { requirements } from './request-md.js';
import { outputRepos } from './repos.js';
import { loadItems, taskItems } from './issues.js';
import { keepItems } from './kept-items.js';
import { keepJudgements } from './evidence.js';
import { pastParagraph } from './close.js';
import { keepOwnEdits } from './map.js';
import { INDEX_KEYS, YAML_OPTIONS, addVersions, append, latest, openRecord, recordText, seq } from './records.js';

// The marker links that get a binding, by the parser's key; `for` (a task) has no text to bind.
const LINK_WORDS = {
  serves: 'serves', buildsOn: 'builds-on', changes: 'changes', removes: 'removes', explains: 'explains',
  illustrates: 'illustrates', resolvedBy: 'resolved-by', governedBy: 'governed-by', decides: 'decides',
  supersedes: 'supersedes', source: 'source',
};
const OUTPUT_LINKS = ['implements', 'verifies', 'documents'];
const CONFLICT = /^(<{7}|={7}|>{7})( |$)/m;

const list = (top, dir) => {
  try { return readdirSync(join(top, dir), { withFileTypes: true }); } catch { return []; }
};

// The names of the open requests (requests/<name>/request.md) and of the
// archived ones, in the working tree, or at commit `at`.
export function requestNames(top, at = null) {
  if (at) {
    const dirs = (path) => (git(top, ['ls-tree', '-d', '--name-only', at, `${path}/`], { allowFail: true }) ?? '').split('\n').filter(Boolean).map((p) => p.slice(path.length + 1));
    const candidates = dirs('requests').filter((n) => n !== 'archive');
    const mds = filesAt(top, at, candidates.map((n) => `requests/${n}/request.md`));
    const open = candidates.filter((n) => mds.get(`requests/${n}/request.md`) !== null).sort();
    return { open, archived: dirs('requests/archive').sort() };
  }
  const open = list(top, 'requests').filter((e) => e.isDirectory() && e.name !== 'archive' && read(top, `requests/${e.name}/request.md`) !== null).map((e) => e.name).sort();
  const archived = list(top, 'requests/archive').filter((e) => e.isDirectory()).map((e) => e.name).sort();
  return { open, archived };
}

// One state of the project, the working tree (at null) or a commit: its
// docs, parsed, and its requests, each with request.md's requirements and
// its record's data.
export function loadState(top, at, config, names) {
  // The spec docs and the open change specs (docsInScope), and the ADRs in <root>/adr/.
  const adr = `${config.root}/adr`;
  const adrs = (at
    ? (git(top, ['ls-tree', '--name-only', at, `${adr}/`], { allowFail: true }) ?? '').split('\n')
    : symlinkOn(top, adr) ? [] : list(top, adr).filter((e) => e.isFile()).map((e) => `${adr}/${e.name}`))
    .filter((f) => f.startsWith(`${adr}/`) && ADR_FILE.test(f.slice(adr.length + 1))).sort();
  // At a commit, every file below is read in one batch.
  const atCommit = at ? filesAt(top, at, [...adrs,
    ...names.open.flatMap((n) => [`requests/${n}/request.md`, recordPath(n)]),
    ...names.archived.flatMap((n) => [`requests/archive/${n}/request.md`, recordPath(n), `requests/archive/${n}/spec.md`])]) : null;
  const get = at ? (p) => (atCommit.has(p) ? atCommit.get(p) : fileAt(top, at, p)) : (p) => read(top, p);
  const open = new Set(names.open);
  const files = [
    ...docsInScope(top, config, at).flatMap((d) => {
      if (d.scope === SPEC) return [{ file: d.path, request: null, text: d.text }];
      const n = d.scope.slice('request:'.length);
      return d.path === `requests/${n}/spec.md` && open.has(n) ? [{ file: d.path, request: n, text: d.text }] : [];
    }),
    ...adrs.map((file) => ({ file, request: null, text: get(file), adr: true })),
  ];
  const docs = [];
  for (const { file, request, text, adr: isAdr } of files) {
    if (text === null || text === undefined) continue;
    const paragraphs = parseMarkdown(text, file).paragraphs.filter((p) => p.id);
    docs.push({ file, request, text, adr: Boolean(isAdr), paragraphs, ids: new Set(paragraphs.map((p) => p.id)) });
  }
  const requests = new Map();
  for (const [n, open] of [...names.open.map((n) => [n, true]), ...names.archived.map((n) => [n, false])]) {
    const md = get(open ? `requests/${n}/request.md` : `requests/archive/${n}/request.md`) ?? '';
    let data = null;
    // A record that is not YAML reads as none; a refused read (outside, or through a symlink) stays a refusal.
    const text = get(recordPath(n));
    try { data = parse(text ?? 'null'); } catch { data = null; }
    const spec = open ? docs.find((d) => d.request === n) : null;
    let paras = spec?.paragraphs;
    if (!open) {
      const text = get(`requests/archive/${n}/spec.md`);
      paras = text === null ? [] : parseMarkdown(text, `requests/archive/${n}/spec.md`).paragraphs.filter((p) => p.id);
    }
    requests.set(n, { name: n, open, md, reqs: requirements(md), data: data && typeof data === 'object' ? data : null, paras: new Map((paras ?? []).map((p) => [p.id, p])) });
  }
  // An ADR number names the first of its files in name order (DES-113).
  const firsts = new Set();
  const first = (d) => {
    if (!d.adr) return true;
    const id = adrId(ADR_FILE.exec(posix.basename(d.file))[1]);
    return !firsts.has(id) && Boolean(firsts.add(id));
  };
  return { docs, requests, spec: new Map(docs.filter((d) => !d.request && first(d)).flatMap((d) => d.paragraphs.map((p) => [p.id, p]))) };
}

// A link target as written, made exact: `name:ID` is another repo's;
// `<request>/<ID>` a request's; in a request's own text, R/Q/D/S numbers, a
// snapshot file and an ID of its own change spec are its own; else a spec ID.
export function qualify(ref, request, own = new Set(), central = false) {
  // In the central repo, `central:X` is its own X (T12); the key stays as written.
  if (central && ref.startsWith('central:')) return { ...qualify(ref.slice('central:'.length), request, own), key: ref };
  if (ref.includes(':')) return { key: ref, cross: true };
  const slash = ref.indexOf('/');
  if (slash > 0) return { key: ref, req: ref.slice(0, slash), id: ref.slice(slash + 1) };
  if (request && (/^[RQDS]\d+$/.test(ref) || /\.md$/.test(ref) || own.has(ref))) return { key: `${request}/${ref}`, req: request, id: ref };
  return { key: ref, req: null, id: ref };
}

// The central repo is the one whose config lists output repos (T12).
export const isCentral = (config) => Array.isArray(config.outputs) && config.outputs.length > 0;

// An output in another repo (T12): its repo is named, and is not this one.
const foreign = (o, config) => Boolean(o.repo) && o.repo !== config.repo && o.repo !== 'central';

// A record's declared outputs; a value that is not a list declares none, so al check still runs (#2).
const outputsOf = (r) => (Array.isArray(r.data?.outputs) ? r.data.outputs : []);

// Every declared link of a state: { holder, holderSha, link, target, homes }, with
// `homes` the requests whose record holds it. An output in another repo also
// has `commit` (<repo>@<sha>), or `unknown` with the reason; `repos` are the
// output repos of config, by name (live only).
function linksOf(top, state, config, live, repos = new Map()) {
  const out = [];
  // The declared output files in another repo, read in one batch per repo.
  const batches = new Map();
  const outputFiles = (repo) => {
    if (!batches.has(repo.name)) {
      const files = [...state.requests.values()].filter((r) => r.open).flatMap(outputsOf)
        .filter((o) => o?.file && o.repo === repo.name).map((o) => String(o.file));
      batches.set(repo.name, filesAt(repo.dir, repo.sha, [...new Set(files)], null));
    }
    return batches.get(repo.name);
  };
  for (const d of state.docs) {
    for (const p of d.paragraphs) {
      const holder = d.request ? `${d.request}/${p.id}` : p.id;
      const ls = Object.entries(LINK_WORDS).flatMap(([k, link]) => (p.links?.[k] ?? []).map((ref) => ({ link, t: qualify(ref, d.request, d.ids, isCentral(config)) })));
      const homes = d.request ? [d.request] : [...new Set(ls.map((l) => l.t.req).filter(Boolean))];
      for (const { link, t } of ls) out.push({ holder, holderSha: p.sha256, link, target: t.key, t, homes });
    }
  }
  for (const r of state.requests.values()) {
    if (!r.open) continue;
    for (const q of r.reqs) {
      for (const f of q.from) out.push({ holder: `${r.name}/${q.id}`, holderSha: q.sha256, link: 'from', target: `${r.name}/${f}`, t: { req: r.name, id: f }, homes: [r.name] });
    }
    const own = new Set(r.paras.keys());
    for (const o of outputsOf(r)) {
      if (!o?.file) continue;
      const other = foreign(o, config);
      const repo = other ? repos.get(o.repo) : null;
      const unknown = !other || !live ? null : !repo ? 'not an output repo in config' : repo.unknown;
      let bytes = null;
      if (live && !other) bytes = read(top, o.file, null);
      else if (live && !unknown) bytes = outputFiles(repo).get(String(o.file));
      const at = other && live && !unknown ? { commit: `${o.repo}@${repo.sha}` } : {};
      for (const link of OUTPUT_LINKS) {
        for (const ref of [].concat(o[link] ?? [])) {
          out.push({ holder: other ? `${o.repo}/${o.file}` : o.file, holderSha: bytes === null ? null : sha256(bytes), link, target: qualify(String(ref), r.name, own, isCentral(config)).key, t: qualify(String(ref), r.name, own, isCentral(config)), homes: [r.name], output: true, ...(unknown ? { unknown } : {}), ...at });
        }
      }
    }
  }
  return out;
}

// The text hash of a target in `state`, with its version for a requirement; null when it does not resolve.
export function targetOf(t, state) {
  if (!t.req) {
    const p = state.spec.get(t.id);
    return p ? { sha: p.sha256 } : null;
  }
  const r = state.requests.get(t.req);
  if (!r) return null;
  const data = r.data ?? {};
  const find = (key) => (data[key] ?? []).find((e) => e?.id === t.id);
  if (/^[RQ]\d+$/.test(t.id)) {
    const v = latest(data, t.id);
    return v ? { sha: v.sha256, version: v.version } : null;
  }
  if (/^D\d+$/.test(t.id)) return find('decisions')?.sha256 ? { sha: find('decisions').sha256 } : null;
  if (/^S\d+$/.test(t.id)) return find('signoff')?.sha256 ? { sha: find('signoff').sha256 } : null;
  if (/\.md$/.test(t.id)) {
    const s = (data.sources ?? []).find((e) => e?.file === t.id);
    return s?.sha256 ? { sha: s.sha256 } : null;
  }
  const p = r.paras.get(t.id);
  return p ? { sha: p.sha256 } : null;
}

const tripleKey = (l) => `${l.holder}\t${l.link}\t${l.target}`;

// Whether a binding's holder declares its link now: the same holder, link
// word and target (#2). It reads al check's own state (state.js), so each
// file is read once, by al check's rules.
export function declaredNow(top, state) {
  const docs = [
    { request: null, ids: new Set(), paragraphs: [...state.spec.values()].filter((p) => p.id) },
    ...[...state.requests.values()].filter((r) => r.open).map((r) => ({ request: r.name, ids: new Set(r.paras.keys()), paragraphs: [...r.paras.values()].filter((p) => p.id) })),
    ...state.adrList.map((a) => ({ request: null, ids: new Set(), paragraphs: a.paragraphs.filter((p) => p.id) })),
  ];
  const keys = new Set(linksOf(top, { docs, requests: state.requests }, state.config, false).map(tripleKey));
  return (b) => keys.has(tripleKey(b));
}

// Whether a judgement can move a binding to `target` now, by the target
// rules of al index, in al check's state (state.js): holder-changed is given
// only where the judgement can clear it (#11).
export function canAlignTo(state) {
  const adrs = [...state.adrs.values()].flatMap((a) => a.paragraphs.filter((p) => p.id).map((p) => [p.id, p]));
  const view = { spec: new Map([...state.spec, ...adrs]), requests: state.requests };
  const central = isCentral(state.config);
  return (target) => Boolean(targetOf(qualify(String(target), null, new Set(), central), view));
}

// A state whose archived requests declare their links too: their change
// specs' markers, their requirements' from: and their records' outputs: (#11).
function everyDeclaration(state) {
  const old = [...state.requests.values()].filter((r) => !r.open);
  return {
    docs: [...state.docs, ...old.map((r) => ({ request: r.name, ids: new Set(r.paras.keys()), paragraphs: [...r.paras.values()] }))],
    requests: new Map([...state.requests].map(([n, r]) => [n, { ...r, open: true }])),
  };
}

// The files and folders that can declare links but are not read, each with
// why: reached through a symlink, a file that cannot be read, or a folder that
// cannot be listed. They are the spec root's, the requests' (open and
// archived) request.md, spec.md and record, whose outputs: declare links, and
// the docs that config lists (#11).
function notRead(top, root, config) {
  const out = [];
  const blocked = (p) => {
    let stat;
    try { stat = lstatSync(join(top, p)); } catch { return false; }
    if (stat.isSymbolicLink()) { out.push(`${p}: through a symlink`); return true; }
    try { accessSync(join(top, p), stat.isDirectory() ? constants.R_OK | constants.X_OK : constants.R_OK); } catch { out.push(`${p}: cannot be read`); return true; }
    return false;
  };
  const tree = (dir) => {
    if (blocked(dir)) return;
    for (const e of list(top, dir)) {
      if (e.isDirectory()) tree(`${dir}/${e.name}`);
      else blocked(`${dir}/${e.name}`);
    }
  };
  tree(root);
  const records = !blocked('.assuredloop/records/requests');
  for (const dir of ['requests', 'requests/archive']) {
    if (blocked(dir)) continue;
    for (const e of list(top, dir)) {
      const d = `${dir}/${e.name}`;
      if (d === 'requests/archive' || (!e.isDirectory() && !e.isSymbolicLink()) || blocked(d)) continue;
      blocked(`${d}/request.md`);
      blocked(`${d}/spec.md`);
      if (records) blocked(recordPath(e.name));
    }
  }
  for (const d of config.docs) blocked(posix.normalize(String(d.file)));
  return out;
}

export function index({ top, cwd, opts }) {
  // --align is removed (#88): a hint clears by a fix, or by a recorded judgement.
  if (opts.align !== undefined) {
    throw new Fail('--align is removed: a hint clears by a fix, or by a recorded judgement with its reason',
      `al record <name> judgement --hint stale-base|holder-changed --on ${opts.align} --reason <why>`);
  }
  let loaded;
  try { loaded = loadConfig(top); } catch (e) { throw new Fail(e.message, 'fix .assuredloop/config.yaml'); }
  // The work items that the caller saved; a folder that is not there is a refusal.
  const issues = opts.issues === undefined ? null : loadItems(cwd ?? top, opts.issues);
  const body = [];
  const notes = [];
  // The spec root as a repo path, once (`./specs/` is `specs`), for the tree and for past commits alike.
  const root = posix.normalize(String(loaded.root)).replace(/\/+$/, '');
  if (!inside(String(loaded.root)) || !inside(root) || root === '.') {
    throw new Fail(`config root ${loaded.root} is not a folder inside the repository; nothing was read or written`, 'set root: in .assuredloop/config.yaml to a folder in this repo, such as specs');
  }
  // Nothing is read through a symlink, which can lead out of the repo: read() refuses for each
  // file, and the folders that are walked or listed are refused here, empty or not
  // (the check of requests/archive looks at requests/ on its way).
  for (const dir of [root, 'requests/archive']) {
    if (symlinkOn(top, dir)) throw new Fail(`${dir} is reached through the symlink ${symlinkOn(top, dir)}; nothing was read or written`, `make ${symlinkOn(top, dir)} a real folder in this repo`);
  }
  // A doc that config names outside the repo, or through a symlink, is neither read nor indexed.
  const why = (file) => (!inside(file) ? 'outside the repository' : symlinkOn(top, posix.normalize(file)) ? 'through a symlink' : null);
  const config = { ...loaded, root, docs: loaded.docs.filter((d) => !why(String(d.file ?? ''))) };
  for (const d of loaded.docs) if (why(String(d.file ?? ''))) notes.push(`not indexed: ${d.file}: ${why(String(d.file ?? ''))}`);
  if (symlinkOn(top, `${root}/adr`)) notes.push(`not indexed: ${root}/adr: through a symlink`);
  const names = requestNames(top);

  // The base: mergeBase (the merge-base with main or origin/main); with no
  // main, HEAD (so a committed link with no binding stays unknown); with no
  // commit, nothing.
  const main = mergeBase(top);
  const head = git(top, ['rev-parse', '--verify', '--quiet', 'HEAD'], { allowFail: true });
  const base = main ?? head ?? null;
  if (!main) notes.push(`base unknown: no main branch${head ? '; links already committed with no binding stay unknown' : ' and no commit; every link is new'}`);

  // The records of the open requests, and the requirement versions first, so bindings read them.
  const recs = new Map();
  for (const n of names.open) {
    let rec = null;
    try { rec = openRecord(top, n); } catch (e) { if (!e.invalid) throw e; notes.push(`not read: ${e.message}`); continue; }
    if (!rec) { notes.push(`no record: requests/${n} has no ${recordPath(n)}`); continue; }
    // A list that al index adds to and that is not a list: the record is
    // not read, and al check reports it (#78: al check runs al index).
    const bad = INDEX_KEYS.find((k) => rec.data[k] != null && !Array.isArray(rec.data[k]));
    if (bad) { notes.push(`not read: ${rec.path} is not a valid record: its ${bad} is not a list`); continue; }
    rec.changed = addVersions(rec, requirements(read(top, `requests/${n}/request.md`) ?? '')).length > 0;
    recs.set(n, rec);
  }

  const now = loadState(top, null, config, names);
  for (const [n, rec] of recs) now.requests.get(n).data = rec.data;
  const bind = opts.bind ?? null;
  if (issues && !bind) {
    const { named, missing, finder } = taskItems(top, { ...now, config: loaded }, issues.items);
    body.push(...keepItems(top, recs, named, finder));
    for (const m of missing) notes.push(`not kept: ${m.r.name}/${m.task} ${m.written}: ${m.key ? `no item in ${issues.folder} is ${m.key}` : m.unknown ?? 'it names no item'}`);
    for (const u of issues.unread) notes.push(`item file not read: ${u.file}: ${u.why}`);
  }
  // The identity of each review judgement that has none (light-design R2).
  if (!bind) body.push(...keepJudgements(top, recs, loaded, issues));
  // The versions that the change's own branch gave the spec paragraphs it names (LD-61).
  if (!bind) body.push(...keepOwnEdits(top, recs, main));
  const repos = new Map(outputRepos(top, loaded).filter((r) => r.name).map((r) => [r.name, r]));
  const links = linksOf(top, now, config, true, repos);
  const then = base ? loadState(top, base, config, names) : null;
  const atBase = new Set(then ? linksOf(top, then, config, false).map(tripleKey) : []);

  // The records of the archived requests: they still hold bindings (#41),
  // and a binding that no current marker declares is removed from them too.
  const archived = new Map();
  for (const n of names.archived) {
    try { const rec = openRecord(top, n); if (rec) archived.set(n, rec); } catch (e) { if (!e.invalid) throw e; notes.push(`not read: ${e.message}`); }
  }

  // The records that already hold each binding, open and archived: a holder
  // whose marker names no request any more, such as a superseded ADR that
  // dropped `source:`, still reaches the bindings it holds (#11). A binding in
  // an archived record counts as held; al binds no new link there (#41).
  const held = new Map();
  for (const [n, rec] of [...recs, ...archived]) {
    for (const it of rec.doc.get('bindings')?.items ?? []) {
      if (!it?.get) continue;
      const k = tripleKey({ holder: it.get('holder'), link: it.get('link'), target: it.get('target') });
      held.set(k, [...(held.get(k) ?? []), n]);
    }
  }
  if (bind) return bindNow(top, { bind, recs, links, atBase, held, now, then, base });

  // al keeps a binding "at a moment that is now" only for a link that the
  // working tree adds. A link that HEAD already declares, with no binding,
  // was made at a past moment, so its binding comes from the branch history:
  // the earliest commit of base..HEAD that declares it (LD-61). When the
  // history cannot tell (a shallow clone), the link stays not bound.
  let atHead = null;
  const committed = (l) => (atHead ??= new Set(head ? linksOf(top, loadState(top, head, config, requestNames(top, head)), config, false).map(tripleKey) : [])).has(tripleKey(l));
  const states = new Map();
  const stateAt = (c) => {
    if (!states.has(c)) {
      const st = loadState(top, c, config, requestNames(top, c));
      states.set(c, { st, links: new Map(linksOf(top, st, config, false).map((x) => [tripleKey(x), x])) });
    }
    return states.get(c);
  };
  let history = null;
  let shallow = null;
  const madeAt = (l) => {
    history ??= (git(top, ['rev-list', '--reverse', '--topo-order', `${main}..HEAD`, '--', root, 'requests', '.assuredloop/records/requests',
      ...config.docs.map((d) => posix.normalize(String(d.file)))], { allowFail: true }) ?? '').split('\n').filter(Boolean);
    shallow ??= shallowCommits(top);
    const c = history.find((x) => stateAt(x).links.has(tripleKey(l)));
    if (!c || shallow.has(c)) return { unknown: 'HEAD declares it with no binding, and the history of this clone cannot tell when the link was made' };
    const { st, links } = stateAt(c);
    // The holder's text at that commit; an output file in this repo, its bytes there.
    let holderSha = links.get(tripleKey(l)).holderSha;
    if (l.output) {
      const bytes = l.holder.includes('/') && l.commit ? null : blobAt(top, c, l.holder);
      holderSha = l.commit ? l.holderSha : bytes === null ? null : sha256(bytes);
    }
    // The target's text at that commit; a requirement's version is the one
    // whose text it had there. A decision, a sign-off or a snapshot keeps its
    // text, so its record entry now holds it. A changes or removes link of a
    // change spec binds the target's text at the base of that commit.
    let target;
    if (l.t.req && /^[RQ]\d+$/.test(l.t.id)) {
      const q = st.requests.get(l.t.req)?.reqs.find((x) => x.id === l.t.id);
      const v = q && (now.requests.get(l.t.req)?.data?.requirements ?? []).filter((x) => x?.id === l.t.id && x.sha256 === q.sha256).at(-1);
      target = v ? { sha: v.sha256, version: v.version } : null;
    } else if (l.t.req && /^([DS]\d+|.*\.md)$/.test(l.t.id)) {
      target = targetOf(l.t, now);
    } else {
      target = targetOf(l.t, st);
    }
    let before = null;
    if (!l.t.req && ['changes', 'removes'].includes(l.link) && l.holder.includes('/')) {
      const b = baseOf(top, c)?.commit;
      before = b ? stateAt(b).st.spec.get(l.t.id) ?? null : null;
    }
    return { holderSha, target, before };
  };

  const bound = [];
  const seen = new Set();
  const once = (line) => { if (!seen.has(line)) { seen.add(line); body.push(line); } };
  for (const l of links) {
    const name = `${l.holder} ${l.link} ${l.target}`;
    if (l.t.cross) { once(`not bound: ${name}: cross-repo`); continue; }
    const homes = [...new Set([...l.homes.filter((h) => recs.has(h)), ...(held.get(tripleKey(l)) ?? [])])];
    if (!homes.length) { once(`not bound: ${name}: no request record holds it`); continue; }
    const isHeld = held.has(tripleKey(l));
    for (const h of homes) {
      if (!recs.has(h)) continue;
      const rec = recs.get(h);
      const items = seq(rec, 'bindings').items;
      const at = items.findIndex((it) => it?.get?.('holder') === l.holder && it.get('link') === l.link && it.get('target') === l.target);
      if (at >= 0) continue;
      // Held in another record, open or archived, the binding is not gone (DES-26).
      if (atBase.has(tripleKey(l))) { if (!isHeld) once(`binding unknown: ${name}`); continue; }
      if (l.unknown) { once(`unknown: ${name}: ${l.unknown}`); continue; }
      const past = main && committed(l) ? madeAt(l) : null;
      if (past?.unknown) { once(`not bound: ${name}: ${past.unknown}`); continue; }
      const target = past ? past.target : targetOf(l.t, now);
      if (!target) { once(`not bound: ${name}: target not found`); continue; }
      const holderSha = past ? past.holderSha : l.holderSha;
      if (holderSha === null) { once(`not bound: ${name}: output file not found`); continue; }
      const entry = { holder: l.holder, link: l.link, target: l.target, holder_sha256: holderSha, target_sha256: target.sha };
      // A new changes or removes link of a change spec whose target the
      // branch already changed binds the target's text at the base: the
      // version that it had when the change linked it (LD-61).
      const before = past ? past.before : main && !l.t.req && ['changes', 'removes'].includes(l.link) && l.holder.includes('/') ? then.spec.get(l.t.id) : null;
      if (before) entry.target_sha256 = before.sha256;
      if (target.version !== undefined) entry.target_version = target.version;
      if (l.commit) entry.commit = l.commit;
      append(rec, 'bindings', entry, true);
      bound.push(name);
      rec.changed = true;
    }
  }

  // Removed links (removed-links/R1, #11): a binding whose link no current
  // marker, requirement or outputs: entry declares is removed from the records
  // of the open and the archived requests, and named. An archived change spec
  // and request.md still declare their links. While a file that can declare
  // links is not read, nothing is removed: a missing file is not a removed link.
  const unread = [...new Set([
    ...notes.filter((l) => /^not (indexed|read): /.test(l)).map((l) => l.replace(/^not (indexed|read): /, '')),
    ...notRead(top, root, config),
  ])];
  const declared = new Set(linksOf(top, everyDeclaration(now), config, false).map(tripleKey));
  const undeclared = (it) => it?.get && !declared.has(tripleKey({ holder: it.get('holder'), link: it.get('link'), target: it.get('target') }));
  const dead = [...recs, ...archived].flatMap(([n, rec]) => (rec.doc.get('bindings')?.items ?? []).filter(undeclared).map((it) => [n, rec, it]));
  if (unread.length) {
    body.push(`not removed: no binding is removed in this run, as al index could not read ${unread.join('; ')}`);
  } else {
    for (const [n, rec, it] of dead) {
      const items = rec.doc.get('bindings').items;
      items.splice(items.indexOf(it), 1);
      body.push(`removed: ${it.get('holder')} ${it.get('link')} ${it.get('target')} from the record of ${n}: no longer declared`);
      rec.changed = true;
    }
  }

  // The per-doc records: regenerable fields, written fresh; hints kept by ID.
  // Nothing in them depends on the branch or its base, so main's index
  // rebuilds a merged record as it is (#245).
  const outputs = [];
  for (const d of now.docs) {
    const path = docRecordPath(d.file);
    const old = read(top, path);
    let hints = new Map();
    if (old !== null) {
      let data = null;
      try { data = CONFLICT.test(old) ? null : parse(old); } catch { data = null; }
      if (data && typeof data === 'object' && Array.isArray(data.paragraphs ?? [])) hints = new Map((data.paragraphs ?? []).filter((p) => p?.id && p.hint).map((p) => [p.id, p.hint]));
      else body.push(`hints dropped: ${path} could not be read, so it was rebuilt with no hints`);
    }
    const status = d.adr ? d.text.split('\n').find((l) => l.trim())?.match(/^Status:\s*([a-z]+)/i)?.[1].toLowerCase() : undefined;
    const paragraphs = d.paragraphs.map((p) => {
      const hint = hints.get(p.id);
      if (hint && stale(hint, p)) body.push(`refresh hint: ${d.file} ${p.id}`);
      return { id: p.id, ...(p.kind ? { kind: p.kind } : {}), text_sha256: p.sha256, display: p.displayNumber, ...(hint ? { hint } : {}) };
    });
    const rec = { schema: SCHEMA, file: d.file, ...(status ? { status } : {}), paragraphs };
    outputs.push([path, stringify(rec, YAML_OPTIONS)]);
  }
  for (const [, rec] of [...recs, ...archived]) if (rec.changed) outputs.push([rec.path, recordText(rec)]);
  guard(top, outputs.map(([path]) => path));
  const written = outputs.filter(([path, text]) => write(top, path, text)).map(([path]) => path);

  return {
    body: [`Indexed ${now.docs.length} docs and ${recs.size + archived.size} request records (${recs.size} open and ${archived.size} archived); bound ${bound.length} new links`, ...(written.length ? [`Wrote ${written.join(', ')}`] : ['No record changed']), ...notes, ...body],
    // For al check, which runs al index first (LD-63): the files written,
    // each link bound, and the other lines, each "<kind>: <entry>".
    written, bound, lines: [...notes, ...body],
    next: body.some((l) => l.startsWith('refresh hint:')) ? 'refresh the hints listed, then al index'
      : body.some((l) => l.startsWith('binding unknown:')) ? 'a binding unknown was in the marker at the base and its record is gone: check the link, then al record <name> judgement --hint binding-unknown --on <its holder ID> --reason <why>' : 'al check',
  };
}

// The bind mode of al index, for al record <name> judgement (#88): the
// links that `bind.pick(l, { bound, unknown })` chooses, in the record of
// `bind.record` only, are bound to the versions of now, each with
// `judgement: <its ID>`. A target that is gone takes its text in the newest
// commit that held it. The target side of a change paragraph's changes or
// removes link is the version from when the change linked it, which the map
// and al conclude read (DES-160): a judgement keeps it, and a stale-base
// judgement keeps the target of now in judged_target_sha256; a new binding
// takes the target's text at the base. Returns { done: [{ name, link,
// target, holder, at?, base? }], refused: [{ name, why }] }; with
// `bind.write`, it also adds `bind.entry` to the record's judgements and
// writes that record, and nothing else.
function bindNow(top, { bind, recs, links, atBase, held, now, then, base }) {
  const rec = recs.get(bind.record);
  if (!rec) throw new Fail(`${recordPath(bind.record)} is not read, so no binding can be recorded in it`, 'al check');
  const items = seq(rec, 'bindings').items;
  const done = [];
  const refused = [];
  const seen = new Set();
  for (const l of links) {
    const k = tripleKey(l);
    if (seen.has(k) || l.t.cross) continue;
    seen.add(k);
    if (!l.homes.includes(bind.record) && !(held.get(k) ?? []).includes(bind.record)) continue;
    const at = items.findIndex((it) => it?.get?.('holder') === l.holder && it.get('link') === l.link && it.get('target') === l.target);
    if (!bind.pick(l, { bound: at >= 0, unknown: at < 0 && atBase.has(k) && !held.has(k) })) continue;
    const name = `${l.link} ${l.target} of ${l.holder}`;
    if (l.unknown || l.holderSha === null) { refused.push({ name, why: `${name}: ${l.unknown ?? 'its output file is not there'}` }); continue; }
    const linked = !l.t.req && ['changes', 'removes'].includes(l.link) && l.holder.includes('/');
    const old = at >= 0 ? items[at].toJSON() : null;
    const atTheBase = linked && !old ? then?.spec.get(l.t.id) ?? null : null;
    let target = atTheBase ? { sha: atTheBase.sha256 } : targetOf(l.t, now);
    let past = null;
    if (!target && !l.t.req) {
      past = pastParagraph({ top, rev: null }, l.t.id);
      if (!past) { refused.push({ name, why: `al cannot tell what ${l.t.id} said: no commit in this clone holds it` }); continue; }
      target = { sha: past.p.sha256 };
    }
    if (!target) { refused.push({ name, why: `${name}: ${l.target} is not found` }); continue; }
    const entry = { holder: l.holder, link: l.link, target: l.target, holder_sha256: l.holderSha, target_sha256: linked && old ? old.target_sha256 : target.sha };
    if (target.version !== undefined) entry.target_version = target.version;
    if (l.commit) entry.commit = l.commit;
    entry.judgement = bind.entry.id;
    if (linked && old && bind.entry.hint === 'stale-base') entry.judged_target_sha256 = target.sha;
    done.push({ name, link: l.link, target: l.target, holder: l.holder, ...(past ? { at: past.commit } : {}), ...(atTheBase ? { base } : {}) });
    const node = rec.doc.createNode(entry);
    node.flow = true;
    if (at >= 0) items[at] = node;
    else items.push(node);
  }
  if (bind.write && done.length && !refused.length) {
    append(rec, 'judgements', bind.entry, true);
    guard(top, [rec.path]);
    write(top, rec.path, recordText(rec));
  }
  return { done, refused };
}

// A hint is stale when its paragraph changed since it was made, or its quote
// no longer points at one place in the paragraph.
function stale(hint, p) {
  if (hint.basis_sha256 !== p.sha256) return true;
  const q = hint.quote;
  if (!q || q.exact === undefined) return false;
  const exact = String(q.exact);
  const count = (s) => (s ? p.text.split(s).length - 1 : 0);
  if (q.prefix !== undefined || q.suffix !== undefined) return count(`${q.prefix ?? ''}${exact}${q.suffix ?? ''}`) !== 1;
  return count(exact) !== 1;
}
