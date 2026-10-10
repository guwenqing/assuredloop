// al index [--align <ID>]: writes the per-doc records (the regenerable fields,
// with the agents' hints kept), appends requirement versions, freezes the
// bindings of new links and fills the hashes of new dispositions. Ordinary
// indexing never advances a binding; only --align does (design.md 4, 10).
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { parseMarkdown } from './markers.js';
import { diffParagraphs } from './ids.js';
import { git, mergeBase, fileAt } from './git.js';
import { loadConfig } from './config.js';
import { Fail, SCHEMA, docRecordPath, read, recordPath, sha256, write } from './base.js';
import { requirements } from './request-md.js';
import { YAML_OPTIONS, addVersions, append, latest, openRecord, recordText, seq } from './records.js';

// The marker links that get a binding, by the parser's key; `for` (a task) has no text to bind.
const LINK_WORDS = {
  serves: 'serves', buildsOn: 'builds-on', changes: 'changes', removes: 'removes', explains: 'explains',
  illustrates: 'illustrates', resolvedBy: 'resolved-by', governedBy: 'governed-by', decides: 'decides',
  supersedes: 'supersedes', source: 'source',
};
const OUTPUT_LINKS = ['implements', 'verifies', 'documents'];
const ADR_FILE = /^specs\/adr\/\d{4}-[^/]*\.md$/;
const CONFLICT = /^(<{7}|={7}|>{7})( |$)/m;

const list = (top, dir) => {
  try { return readdirSync(join(top, dir), { withFileTypes: true }); } catch { return []; }
};

// The names of the open requests (requests/<name>/request.md) and of the archived ones.
function requestNames(top) {
  const open = list(top, 'requests').filter((e) => e.isDirectory() && e.name !== 'archive' && read(top, `requests/${e.name}/request.md`) !== null).map((e) => e.name).sort();
  const archived = list(top, 'requests/archive').filter((e) => e.isDirectory()).map((e) => e.name).sort();
  return { open, archived };
}

// One state of the project, the working tree (at null) or a commit: its
// docs, parsed, and its requests, each with request.md's requirements and
// its record's data.
function loadState(top, at, config, names) {
  const get = at ? (p) => fileAt(top, at, p) : (p) => read(top, p);
  const adrs = at
    ? (git(top, ['ls-tree', '--name-only', at, 'specs/adr/'], { allowFail: true }) ?? '').split('\n')
    : list(top, 'specs/adr').filter((e) => e.isFile()).map((e) => `specs/adr/${e.name}`);
  const files = [...new Set([...config.docs.map((d) => d.file).filter(Boolean), ...adrs.filter((f) => ADR_FILE.test(f)).sort()])].map((file) => ({ file, request: null }));
  files.push(...names.open.map((n) => ({ file: `requests/${n}/spec.md`, request: n })));
  const docs = [];
  for (const { file, request } of files) {
    const text = get(file);
    if (text === null) continue;
    const paragraphs = parseMarkdown(text, file).paragraphs.filter((p) => p.id);
    docs.push({ file, request, text, paragraphs, ids: new Set(paragraphs.map((p) => p.id)) });
  }
  const requests = new Map();
  for (const [n, open] of [...names.open.map((n) => [n, true]), ...names.archived.map((n) => [n, false])]) {
    const md = get(open ? `requests/${n}/request.md` : `requests/archive/${n}/request.md`) ?? '';
    let data = null;
    try { data = parse(get(recordPath(n)) ?? 'null'); } catch { data = null; }
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
function qualify(ref, request, own) {
  if (ref.includes(':')) return { key: ref, cross: true };
  const slash = ref.indexOf('/');
  if (slash > 0) return { key: ref, req: ref.slice(0, slash), id: ref.slice(slash + 1) };
  if (request && (/^[RQDS]\d+$/.test(ref) || /\.md$/.test(ref) || own.has(ref))) return { key: `${request}/${ref}`, req: request, id: ref };
  return { key: ref, req: null, id: ref };
}

// Every declared link of a state: { from, fromSha, link, to, homes }, with
// `homes` the requests whose record holds it.
function linksOf(top, state, config, live) {
  const out = [];
  for (const d of state.docs) {
    for (const p of d.paragraphs) {
      const from = d.request ? `${d.request}/${p.id}` : p.id;
      const ls = Object.entries(LINK_WORDS).flatMap(([k, link]) => (p.links?.[k] ?? []).map((ref) => ({ link, t: qualify(ref, d.request, d.ids) })));
      const homes = d.request ? [d.request] : [...new Set(ls.map((l) => l.t.req).filter(Boolean))];
      for (const { link, t } of ls) out.push({ from, fromSha: p.sha256, link, to: t.key, t, homes });
    }
  }
  for (const r of state.requests.values()) {
    if (!r.open) continue;
    for (const q of r.reqs) {
      for (const f of q.from) out.push({ from: `${r.name}/${q.id}`, fromSha: q.sha256, link: 'from', to: `${r.name}/${f}`, t: { req: r.name, id: f }, homes: [r.name] });
    }
    const own = new Set(r.paras.keys());
    for (const o of r.data?.outputs ?? []) {
      if (!o?.file || (o.repo && o.repo !== config.repo)) continue;
      const bytes = live ? read(top, o.file) : null;
      for (const link of OUTPUT_LINKS) {
        for (const ref of [].concat(o[link] ?? [])) {
          out.push({ from: o.file, fromSha: bytes === null ? null : sha256(bytes), link, to: qualify(String(ref), r.name, own).key, t: qualify(String(ref), r.name, own), homes: [r.name], output: true });
        }
      }
    }
  }
  return out;
}

// The text hash of a target in `state`, with its version for a requirement; null when it does not resolve.
function targetOf(t, state) {
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

const tripleKey = (l) => `${l.from}\t${l.link}\t${l.to}`;
const short = (h) => (h ? h.slice(0, 12) : 'unknown');

export function index({ top, opts }) {
  const config = loadConfig(top);
  const names = requestNames(top);
  const body = [];
  const notes = [];

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
    try { rec = openRecord(top, n); } catch (e) { if (!(e instanceof Fail)) throw e; notes.push(`not read: ${e.message}`); continue; }
    if (!rec) { notes.push(`no record: requests/${n} has no ${recordPath(n)}`); continue; }
    rec.changed = addVersions(rec, requirements(read(top, `requests/${n}/request.md`) ?? '')).length > 0;
    recs.set(n, rec);
  }

  const now = loadState(top, null, config, names);
  for (const [n, rec] of recs) now.requests.get(n).data = rec.data;
  const links = linksOf(top, now, config, true);
  const atBase = new Set(base ? linksOf(top, loadState(top, base, config, names), config, false).map(tripleKey) : []);

  // --align <ID>: the ID must be something that holds links now.
  const align = opts.align;
  if (align !== undefined) {
    const froms = new Set([...now.docs.flatMap((d) => d.paragraphs.map((p) => (d.request ? `${d.request}/${p.id}` : p.id))),
      ...[...now.requests.values()].filter((r) => r.open).flatMap((r) => [...r.reqs.map((q) => `${r.name}/${q.id}`), ...(r.data?.outputs ?? []).map((o) => o?.file)])]);
    if (!froms.has(align)) throw new Fail(`--align ${align}: no paragraph, requirement or output with that ID (a change spec's ID is <request>/<ID>)`, 'al index --align <ID>');
  }

  let bound = 0;
  const seen = new Set();
  const once = (line) => { if (!seen.has(line)) { seen.add(line); body.push(line); } };
  for (const l of links) {
    const name = `${l.from} ${l.link} ${l.to}`;
    if (l.t.cross) { once(`not bound: ${name}: cross-repo`); continue; }
    const homes = l.homes.filter((h) => recs.has(h));
    if (!homes.length) { once(`not bound: ${name}: no request record holds it`); continue; }
    const aligning = align !== undefined && l.from === align;
    for (const h of homes) {
      const rec = recs.get(h);
      const items = seq(rec, 'bindings').items;
      const at = items.findIndex((it) => it?.get?.('from') === l.from && it.get('link') === l.link && it.get('to') === l.to);
      if (at >= 0 && !aligning) continue;
      if (at < 0 && !aligning && atBase.has(tripleKey(l))) { once(`binding unknown: ${name}`); continue; }
      const target = targetOf(l.t, now);
      if (!target) { once(`not bound: ${name}: target not found`); continue; }
      if (l.fromSha === null) { once(`not bound: ${name}: output file not found`); continue; }
      const entry = { from: l.from, link: l.link, to: l.to, from_sha256: l.fromSha, to_sha256: target.sha };
      if (target.version !== undefined) entry.to_version = target.version;
      const node = rec.doc.createNode(entry);
      node.flow = true;
      if (at >= 0) {
        const old = items[at].toJSON();
        items[at] = node;
        body.push(`aligned: ${name}: ${short(old.from_sha256)} -> ${short(entry.from_sha256)}, ${short(old.to_sha256)} -> ${short(entry.to_sha256)}`);
      } else {
        append(rec, 'bindings', entry, true);
        if (aligning) body.push(`aligned: ${name}: unknown -> ${short(entry.from_sha256)}, ${short(entry.to_sha256)}`);
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
      if (source && !it.has('source_sha256')) {
        const t = targetOf(qualify(String(source), n, own), now);
        if (t) { it.set('source_sha256', t.sha); rec.changed = true; } else body.push(`disposition: ${source} not found, so its hash is not filled`);
      }
      const spec = it.get('spec');
      if (it.get('disposition') === 'incorporated' && spec && !it.has('spec_sha256')) {
        const t = targetOf(qualify(String(spec), null, new Set()), now);
        if (t) { it.set('spec_sha256', t.sha); rec.changed = true; } else body.push(`disposition: ${spec} not found, so its spec hash is not filled`);
      }
    }
  }

  // The per-doc records: regenerable fields, written fresh; hints kept by ID.
  const diffs = main ? diffParagraphs(loadState(top, main, config, names).docs.flatMap((d) => d.paragraphs), now.docs.flatMap((d) => d.paragraphs)) : null;
  const changeOf = new Map((diffs ?? []).filter((x) => x.sha256 !== null).map((x) => [`${x.file}\t${x.id}`, x.changes]));
  const written = [];
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
    const status = d.file.startsWith('specs/adr/') ? d.text.split('\n').find((l) => l.trim())?.match(/^Status:\s*([a-z]+)/i)?.[1].toLowerCase() : undefined;
    const paragraphs = d.paragraphs.map((p) => {
      const change = changeOf.get(`${d.file}\t${p.id}`) ?? [];
      const hint = hints.get(p.id);
      if (hint && stale(hint, p)) body.push(`refresh hint: ${d.file} ${p.id}`);
      return { id: p.id, ...(p.kind ? { kind: p.kind } : {}), text_sha256: p.sha256, display: p.displayNumber, ...(change.length ? { change } : {}), ...(hint ? { hint } : {}) };
    });
    const removed = (diffs ?? []).filter((x) => x.sha256 === null && x.file === d.file).map((x) => x.id);
    const rec = { schema: SCHEMA, file: d.file, ...(status ? { status } : {}), paragraphs, ...(removed.length ? { removed } : {}) };
    if (write(top, path, stringify(rec, YAML_OPTIONS))) written.push(path);
  }
  for (const [, rec] of recs) if (rec.changed && write(top, rec.path, recordText(rec))) written.push(rec.path);

  return {
    body: [`Indexed ${now.docs.length} docs and ${recs.size} request records; bound ${bound} new links`, ...(written.length ? [`Wrote ${written.join(', ')}`] : ['No record changed']), ...notes, ...body],
    next: body.some((l) => l.startsWith('refresh hint:')) ? 'refresh the hints listed, then al index'
      : body.some((l) => l.startsWith('binding unknown:')) ? 'a binding unknown was in the marker at the base and its record is gone: check the link, then al index --align <its from ID>' : 'al check',
  };
}

// A hint is stale when its paragraph changed since it was made, or its quote
// no longer points at one place in the paragraph.
function stale(hint, p) {
  if (hint.from_sha256 !== p.sha256) return true;
  const q = hint.quote;
  if (!q || q.exact === undefined) return false;
  const exact = String(q.exact);
  const count = (s) => (s ? p.text.split(s).length - 1 : 0);
  if (q.prefix !== undefined || q.suffix !== undefined) return count(`${q.prefix ?? ''}${exact}${q.suffix ?? ''}`) !== 1;
  return count(exact) !== 1;
}
