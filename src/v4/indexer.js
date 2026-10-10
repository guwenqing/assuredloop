// al index [--align <ID>]: writes the per-doc records (the regenerable fields,
// with the agents' hints kept), appends requirement versions, freezes the
// bindings of new links and fills the hashes of new dispositions. Ordinary
// indexing never advances a binding; only --align does (design.md 4, 10).
import { readdirSync } from 'node:fs';
import { join, posix } from 'node:path';
import { isMap, parse, stringify } from 'yaml';
import { parseMarkdown } from './markers.js';
import { diffParagraphs } from './ids.js';
import { git, mergeBase, fileAt, filesAt } from './git.js';
import { loadConfig } from './config.js';
import { SPEC, docsInScope, symlinkOn } from './scope.js';
import { Fail, SCHEMA, docRecordPath, guard, inside, read, recordPath, sha256, write } from './base.js';
import { requirements } from './request-md.js';
import { outputRepos } from './repos.js';
import { YAML_OPTIONS, addVersions, append, latest, openRecord, recordText, seq } from './records.js';

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
    .filter((f) => f.startsWith(`${adr}/`) && /^\d{4}-[^/]*\.md$/.test(f.slice(adr.length + 1))).sort();
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
  return { docs, requests, spec: new Map(docs.filter((d) => !d.request).flatMap((d) => d.paragraphs.map((p) => [p.id, p]))) };
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
      const files = [...state.requests.values()].filter((r) => r.open).flatMap((r) => r.data?.outputs ?? [])
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
    for (const o of r.data?.outputs ?? []) {
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
const short = (h) => (h ? h.slice(0, 12) : 'unknown');

export function index({ top, opts }) {
  let loaded;
  try { loaded = loadConfig(top); } catch (e) { throw new Fail(e.message, 'fix .assuredloop/config.yaml'); }
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

  // The base: the merge-base with main; with no main, HEAD (so a committed
  // link with no binding stays unknown); with no commit, nothing.
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
    rec.changed = addVersions(rec, requirements(read(top, `requests/${n}/request.md`) ?? '')).length > 0;
    recs.set(n, rec);
  }

  const now = loadState(top, null, config, names);
  for (const [n, rec] of recs) now.requests.get(n).data = rec.data;
  const repos = new Map(outputRepos(top, loaded).filter((r) => r.name).map((r) => [r.name, r]));
  const links = linksOf(top, now, config, true, repos);
  const atBase = new Set(base ? linksOf(top, loadState(top, base, config, names), config, false).map(tripleKey) : []);

  // --align <ID>: the ID must be something that holds links now.
  const align = opts.align;
  if (align !== undefined) {
    const froms = new Set([...now.docs.flatMap((d) => d.paragraphs.map((p) => (d.request ? `${d.request}/${p.id}` : p.id))),
      ...[...now.requests.values()].filter((r) => r.open).flatMap((r) => [...r.reqs.map((q) => `${r.name}/${q.id}`), ...(r.data?.outputs ?? []).map((o) => (o && foreign(o, config) ? `${o.repo}/${o.file}` : o?.file))])]);
    if (!froms.has(align)) throw new Fail(`--align ${align}: no paragraph, requirement or output with that ID (a change spec's ID is <request>/<ID>)`, 'al index --align <ID>');
  }

  let bound = 0;
  const seen = new Set();
  const once = (line) => { if (!seen.has(line)) { seen.add(line); body.push(line); } };
  for (const l of links) {
    const name = `${l.holder} ${l.link} ${l.target}`;
    if (l.t.cross) { once(`not bound: ${name}: cross-repo`); continue; }
    const homes = l.homes.filter((h) => recs.has(h));
    if (!homes.length) { once(`not bound: ${name}: no request record holds it`); continue; }
    const aligning = align !== undefined && l.holder === align;
    for (const h of homes) {
      const rec = recs.get(h);
      const items = seq(rec, 'bindings').items;
      const at = items.findIndex((it) => it?.get?.('holder') === l.holder && it.get('link') === l.link && it.get('target') === l.target);
      if (at >= 0 && !aligning) continue;
      if (at < 0 && !aligning && atBase.has(tripleKey(l))) { once(`binding unknown: ${name}`); continue; }
      if (l.unknown) { once(`unknown: ${name}: ${l.unknown}`); continue; }
      const target = targetOf(l.t, now);
      if (!target) { once(`not bound: ${name}: target not found`); continue; }
      if (l.holderSha === null) { once(`not bound: ${name}: output file not found`); continue; }
      const entry = { holder: l.holder, link: l.link, target: l.target, holder_sha256: l.holderSha, target_sha256: target.sha };
      if (target.version !== undefined) entry.target_version = target.version;
      if (l.commit) entry.commit = l.commit;
      const node = rec.doc.createNode(entry);
      node.flow = true;
      if (at >= 0) {
        const old = items[at].toJSON();
        items[at] = node;
        body.push(`aligned: ${name}: ${short(old.holder_sha256)} -> ${short(entry.holder_sha256)}, ${short(old.target_sha256)} -> ${short(entry.target_sha256)}`);
      } else {
        append(rec, 'bindings', entry, true);
        if (aligning) body.push(`aligned: ${name}: unknown -> ${short(entry.holder_sha256)}, ${short(entry.target_sha256)}`);
        else bound += 1;
      }
      rec.changed = true;
    }
  }

  // Dispositions: the hashes of the source version, and of the spec text it
  // produced, frozen when first indexed.
  for (const [n, rec] of recs) {
    const own = new Set(now.requests.get(n).paras.keys());
    for (const it of seq(rec, 'dispositions').items) {
      if (!it?.get) continue;
      const source = it.get('source');
      // `adoption` names the captured baseline, which has no hash here (T17).
      if (source && source !== 'adoption' && !it.has('source_sha256')) {
        const t = targetOf(qualify(String(source), n, own, isCentral(config)), now);
        if (t) { it.set('source_sha256', t.sha); rec.changed = true; } else body.push(`disposition: ${source} not found, so its hash is not filled`);
      }
      const spec = it.get('spec');
      if (it.get('disposition') === 'incorporated' && spec && !it.has('spec_sha256')) {
        const t = targetOf(qualify(String(spec), null, new Set(), isCentral(config)), now);
        if (t) { it.set('spec_sha256', t.sha); rec.changed = true; } else body.push(`disposition: ${spec} not found, so its spec hash is not filled`);
      }
    }
    // A wording decision names its pair, {source, spec}; its hashes are filled
    // once, as a disposition's are (the architect, #179, D15).
    for (const it of seq(rec, 'decisions').items) {
      const w = it?.get?.('wording');
      if (!isMap(w)) continue;
      for (const [name, key, request] of [['source', 'source_sha256', n], ['spec', 'target_sha256', null]]) {
        const ref = w.get(name);
        if (!ref || w.has(key)) continue;
        const t = targetOf(qualify(String(ref), request, request ? own : new Set()), now);
        if (t) { w.set(key, t.sha); rec.changed = true; } else body.push(`decision ${it.get('id')}: ${ref} not found, so its wording hash is not filled`);
      }
    }
  }

  // The per-doc records: regenerable fields, written fresh; hints kept by ID.
  // A change spec's IDs are its request's own, so they are compared as <request>/<ID>.
  const qualified = (docs) => docs.flatMap((d) => d.paragraphs.map((p) => (d.request ? { ...p, id: `${d.request}/${p.id}` } : p)));
  const diffs = main ? diffParagraphs(qualified(loadState(top, main, config, names).docs), qualified(now.docs)) : null;
  const own = (d, id) => (d.request ? `${d.request}/${id}` : id);
  const changeOf = new Map((diffs ?? []).filter((x) => x.sha256 !== null).map((x) => [`${x.file}\t${x.id}`, x.changes]));
  const outputs = [];
  for (const d of now.docs) {
    const path = docRecordPath(d.file);
    const old = read(top, path);
    let hints = new Map();
    if (old !== null) {
      let data = null;
      try { data = CONFLICT.test(old) ? null : parse(old); } catch { data = null; }
      if (data && typeof data === 'object') hints = new Map((data.paragraphs ?? []).filter((p) => p?.id && p.hint).map((p) => [p.id, p.hint]));
      else body.push(`hints dropped: ${path} could not be read, so it was rebuilt with no hints`);
    }
    const status = d.adr ? d.text.split('\n').find((l) => l.trim())?.match(/^Status:\s*([a-z]+)/i)?.[1].toLowerCase() : undefined;
    const paragraphs = d.paragraphs.map((p) => {
      const change = changeOf.get(`${d.file}\t${own(d, p.id)}`) ?? [];
      const hint = hints.get(p.id);
      if (hint && stale(hint, p)) body.push(`refresh hint: ${d.file} ${p.id}`);
      return { id: p.id, ...(p.kind ? { kind: p.kind } : {}), text_sha256: p.sha256, display: p.displayNumber, ...(change.length ? { change } : {}), ...(hint ? { hint } : {}) };
    });
    const removed = (diffs ?? []).filter((x) => x.sha256 === null && x.file === d.file).map((x) => (d.request ? x.id.slice(d.request.length + 1) : x.id));
    const rec = { schema: SCHEMA, file: d.file, ...(status ? { status } : {}), paragraphs, ...(removed.length ? { removed } : {}) };
    outputs.push([path, stringify(rec, YAML_OPTIONS)]);
  }
  for (const [, rec] of recs) if (rec.changed) outputs.push([rec.path, recordText(rec)]);
  guard(top, outputs.map(([path]) => path));
  const written = outputs.filter(([path, text]) => write(top, path, text)).map(([path]) => path);

  return {
    body: [`Indexed ${now.docs.length} docs and ${recs.size} request records; bound ${bound} new links`, ...(written.length ? [`Wrote ${written.join(', ')}`] : ['No record changed']), ...notes, ...body],
    next: body.some((l) => l.startsWith('refresh hint:')) ? 'refresh the hints listed, then al index'
      : body.some((l) => l.startsWith('binding unknown:')) ? 'a binding unknown was in the marker at the base and its record is gone: check the link, then al index --align <its holder ID>' : 'al check',
  };
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
