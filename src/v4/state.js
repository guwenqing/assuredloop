// One state of a v4 project, the working tree or a commit, as the checks and
// views read it (T10, T11): the spec paragraphs, each request with its
// request.md, record and change spec, and the ADRs. Nothing is written.
import { readdirSync } from 'node:fs';
import { join, posix } from 'node:path';
import { parse } from 'yaml';
import { exists, read, recordPath, sha256 } from './base.js';
import { loadConfig, loadSchema } from './config.js';
import { fileAt, filesAt, git } from './git.js';
import { KINDS, groupOf, parseMarkdown } from './markers.js';
import { frameOf, requirements, signedText } from './request-md.js';
import { SIGNED } from './snapshot.js';
import { SPEC, docsInScope, parseScopes, symlinkOn } from './scope.js';

const ADR_FILE = /^(\d{4})-[^/]*\.md$/;

// The names in folder `dir` of the state: its folders, or its files.
function names(top, rev, dir, folders) {
  if (rev) {
    const out = git(top, ['ls-tree', rev, `${dir}/`], { allowFail: true }) ?? '';
    return out.split('\n').filter(Boolean).map((l) => l.split('\t'))
      .filter(([meta]) => (folders ? meta.includes(' tree ') : meta.includes(' blob ')))
      .map(([, path]) => path.slice(dir.length + 1)).sort();
  }
  if (symlinkOn(top, dir)) return [];
  try {
    return readdirSync(join(top, dir), { withFileTypes: true }).filter((e) => (folders ? e.isDirectory() : e.isFile())).map((e) => e.name).sort();
  } catch {
    return [];
  }
}

// The text after an ADR's Status line: what must not change once it is accepted.
const adrBody = (text) => text.replace(/\r\n?/g, '\n').replace(/^\s*Status:[^\n]*\n?/, '').replace(/^\n+/, '');

// The same with the line of the heading marker left out: what must not change
// when links are added to that marker (schema.md 5).
const adrRest = (text, head) => adrBody(text.replace(/\r\n?/g, '\n').split('\n').map((l, i) => (i === head.line - 1 ? '<!-- -->' : l)).join('\n'));

// The settings of a commit: its own config.yaml and schema.yaml, with the
// defaults of config.js when a file is absent or not a mapping.
export function settingsAt(top, rev) {
  const files = filesAt(top, rev, ['.assuredloop/config.yaml', '.assuredloop/schema.yaml']);
  const yamlAt = (name) => {
    try {
      const v = parse(files.get(`.assuredloop/${name}`) ?? 'null');
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch {
      return {};
    }
  };
  const c = yamlAt('config.yaml');
  const s = yamlAt('schema.yaml');
  return { config: { ...c, root: c.root ?? 'specs', docs: Array.isArray(c.docs) ? c.docs : [] }, kinds: s.kinds ?? KINDS };
}

export function loadState(top, rev = null) {
  const { config, kinds } = rev ? settingsAt(top, rev) : { config: loadConfig(top), kinds: loadSchema(top).kinds };
  const root = posix.normalize(String(config.root)).replace(/\/+$/, '');
  const openNames = names(top, rev, 'requests', true).filter((n) => n !== 'archive');
  const archivedNames = names(top, rev, 'requests/archive', true);
  const adrFiles = names(top, rev, `${root}/adr`, false);
  // At a commit, the requests' files and the ADRs are read in one batch.
  const atRev = rev ? filesAt(top, rev, [
    ...openNames.flatMap((n) => [`requests/${n}/request.md`, recordPath(n)]),
    ...archivedNames.flatMap((n) => [`requests/archive/${n}/request.md`, recordPath(n)]),
    ...adrFiles.map((f) => `${root}/adr/${f}`),
  ]) : null;
  const get = rev ? (p) => (atRev.has(p) ? atRev.get(p) : fileAt(top, rev, p)) : (p) => read(top, p);
  const docs = docsInScope(top, config, rev);
  const { scopes, lints } = parseScopes(docs, kinds);
  const spec = new Map((scopes.get(SPEC) ?? []).map((p) => [p.id, p]));

  const requests = new Map();
  const add = (name, open) => {
    const dir = open ? `requests/${name}` : `requests/archive/${name}`;
    const md = get(`${dir}/request.md`);
    if (md === null || md === undefined) return;
    // The record is read now and parsed on first use (design.md 11): a check
    // that does not need an archived record never parses it.
    let text = null;
    let readError = null;
    try {
      text = get(recordPath(name));
    } catch (e) {
      text = null;
      readError = e.message.split('\n')[0];
    }
    // read() gives null for a file it cannot read (EACCES, a folder): only a
    // record that is not there at all has no error.
    if (!rev && text == null && !readError && exists(top, recordPath(name))) readError = 'it is there, but it cannot be read as a file';
    let data;
    let error = readError;
    const dataOf = () => {
      if (data !== undefined) return data;
      try {
        data = parse(text ?? 'null');
      } catch (e) {
        data = null;
        error = e.message.split('\n')[0];
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        if (text !== null && text !== undefined && !error) error = 'not a mapping';
        data = null;
      }
      return data;
    };
    const specFile = `${dir}/spec.md`;
    const paras = (scopes.get(`request:${name}`) ?? []).filter((p) => p.file === specFile);
    const tierOf = () => String(dataOf()?.tier ?? /^Tier:\s*(\S+)/m.exec(md)?.[1] ?? '');
    // Whether sign-off `s` signed the intro, Out: and Assumed: text that the
    // section has now (#216): its signed text is the section's, or its
    // snapshot in origin/, checked against its hash, has the same frame.
    const current = signedText(md);
    const framed = new Map();
    const framedBy = (s) => {
      if (current === null) return false;
      if (s.sha256 === sha256(current)) return true;
      const file = typeof s.file === 'string' ? `${dir}/origin/${s.file.replace(/^origin\//, '')}` : null;
      if (!file) return false;
      if (!framed.has(file)) {
        let snap = null;
        try {
          snap = get(file);
        } catch {
          snap = null;
        }
        const at = typeof snap === 'string' ? snap.indexOf(`\n${SIGNED}\n`) : -1;
        const signed = at < 0 ? null : snap.slice(at + SIGNED.length + 2);
        framed.set(file, signed !== null && sha256(signed) === s.sha256 ? frameOf(signed) : null);
      }
      return framed.get(file) === frameOf(current);
    };
    requests.set(name, {
      name, open, dir, md, specFile,
      get data() { return dataOf(); },
      // Why a record that is there cannot be read, or null (#238).
      get recordError() { dataOf(); return error; },
      get tier() { return tierOf(); },
      get spike() { return tierOf() === 'S' || /^##\s+Organized question\s*$/m.test(md); },
      // Whether the record's text names `x`, so that a reader parses only the
      // records that can hold what it looks for; mayAdopt for the adoption
      // entries. YAML writes a word another way only through an escape in a
      // double-quoted string, so a record with a backslash always counts.
      mentions: (x) => typeof text === 'string' && (text.includes(x) || text.includes('\\')),
      mayAdopt: typeof text === 'string' && (text.includes('adoption') || text.includes('\\')),
      reqs: requirements(md), paras: new Map(paras.map((p) => [p.id, p])), framedBy,
    });
  };
  for (const n of openNames) add(n, true);
  for (const n of archivedNames) if (!requests.has(n)) add(n, false);

  const adrs = new Map();
  // The ADR files that are there but cannot be read (#238): R5 reports them.
  const unreadableAdrs = [];
  for (const f of adrFiles) {
    const m = ADR_FILE.exec(f);
    if (!m) continue;
    const file = `${root}/adr/${f}`;
    const text = get(file);
    if (text === null || text === undefined) {
      if (!rev && exists(top, file)) unreadableAdrs.push(file);
      continue;
    }
    const paragraphs = parseMarkdown(text, file, { kinds }).paragraphs;
    const id = `ADR-${Number(m[1])}`;
    const status = /^\s*Status:\s*([a-z]+)/i.exec(text)?.[1].toLowerCase() ?? null;
    const head = paragraphs.find((p) => p.id === id) ?? null;
    // The ADRs that its status line names: `Status: superseded by ADR-n` (#238),
    // or a list joined by commas and `and`, `ADR-11, ADR-12 and ADR-13` (#1).
    const list = /^\s*Status:[ \t]*superseded[ \t]+by[ \t]+(ADR-\d+(?:(?:[ \t]*,[ \t]*(?:and[ \t]+)?|[ \t]+and[ \t]+)ADR-\d+)*)[ \t]*\r?(?:\n|$)/i.exec(text)?.[1];
    const by = [...new Set([...(list ?? '').matchAll(/ADR-(\d+)/gi)].map((m) => `ADR-${Number(m[1])}`))];
    adrs.set(id, { id, file, text, status, by, body: adrBody(text), rest: head && adrRest(text, head), paragraphs, head });
  }
  return { top, rev, config, kinds, root, get, docs, scopes, lints, spec, requests, adrs, unreadableAdrs };
}

// The kind groups a check asks about.
export const isPromise = (state, kind) => !!kind && groupOf(kind, state.kinds) === 'promise';
// A kind whose change paragraph goes into specs/, so it needs a disposition
// (design.md 5, item 3): promise, the lasting design kinds and the informative ones.
export const hasBaselineEffect = (state, kind) => !!kind && kind !== 'approach'
  && ['promise', 'design', 'informative'].includes(groupOf(kind, state.kinds));

// A link target as written, made exact: `name:ID` is another repo's (T12);
// `<request>/<ID>` a request's; in a request's own text, R, Q, D and S numbers,
// a snapshot file and an ID of its own change spec are its own; else a spec ID.
export function qualify(ref, request, own = new Set()) {
  if (ref.includes(':')) return { key: ref, cross: true };
  const slash = ref.indexOf('/');
  if (slash > 0) return { key: ref, req: ref.slice(0, slash), id: ref.slice(slash + 1) };
  if (request && (/^[RQDS]\d+$/.test(ref) || /\.md$/.test(ref) || own.has(ref))) return { key: `${request}/${ref}`, req: request, id: ref };
  return { key: ref, req: null, id: ref };
}

// The paragraph or record entry a qualified target names in `state`, as
// { sha, version? }, or null when it does not resolve.
export function resolve(state, t) {
  if (t.cross) return null;
  if (!t.req) {
    const p = state.spec.get(t.id) ?? adrParagraph(state, t.id);
    return p ? { sha: p.sha256, p } : null;
  }
  const r = state.requests.get(t.req);
  if (!r) return null;
  // A requirement in request.md needs no record, so the record is not parsed for it.
  if (/^[RQ]\d+$/.test(t.id)) {
    const q = r.reqs.find((x) => x.id === t.id);
    if (q) return { sha: q.sha256, req: q };
    const v = latestVersion(r.data ?? {}, t.id);
    return v ? { sha: v.sha256 } : null;
  }
  if (!/^[DST]\d+$/.test(t.id) && !/\.md$/.test(t.id)) {
    const p = r.paras.get(t.id);
    return p ? { sha: p.sha256, p } : null;
  }
  const data = r.data ?? {};
  const entry = (key) => (Array.isArray(data[key]) ? data[key] : []).find((e) => e?.id === t.id);
  if (/^D\d+$/.test(t.id)) return entry('decisions') ? { sha: entry('decisions').sha256 ?? null, entry: entry('decisions') } : null;
  if (/^S\d+$/.test(t.id)) return entry('signoff') ? { sha: entry('signoff').sha256 ?? null, entry: entry('signoff') } : null;
  if (/^T\d+$/.test(t.id)) return entry('tasks') ? { sha: null, entry: entry('tasks') } : null;
  if (/\.md$/.test(t.id)) {
    const s = (Array.isArray(data.sources) ? data.sources : []).find((e) => e?.file === t.id);
    return s ? { sha: s.sha256 ?? null } : null;
  }
  return null;
}

export function adrParagraph(state, id) {
  const m = /^(ADR-\d+)(?:-\d+)?$/.exec(id);
  return m ? state.adrs.get(m[1])?.paragraphs.find((p) => p.id === id) ?? null : null;
}

export const latestVersion = (data, id) => (Array.isArray(data?.requirements) ? data.requirements : []).filter((v) => v?.id === id)
  .reduce((a, v) => (Number(v.version) > Number(a?.version ?? 0) ? v : a), null);

// The latest sign-off that signs requirement (or question) `id` of request
// `name` at its current text: it covers that id with the current text's hash,
// and it signed the section's current intro, Out: and Assumed: text. Null
// when there is none.
export function signedBy(state, name, id) {
  const r = state.requests.get(name);
  const q = r?.reqs.find((x) => x.id === id);
  if (!q) return null;
  return (Array.isArray(r.data?.signoff) ? r.data.signoff : [])
    .filter((s) => (Array.isArray(s?.covers) ? s.covers : []).some((c) => c?.id === id && c.sha256 === q.sha256) && r.framedBy(s))
    .at(-1) ?? null;
}

// Whether requirement (or question) `id` of request `name` is signed at its current text.
export const signed = (state, name, id) => !!signedBy(state, name, id);

// Whether paragraph `p` (of request `request`, or of specs/ when null) serves a
// requirement that is signed at its current text.
export function servesSigned(state, p, request) {
  return (p.links?.serves ?? []).some((ref) => {
    const t = qualify(ref, request);
    return !t.cross && t.req && /^[RQ]\d+$/.test(t.id) && signed(state, t.req, t.id);
  });
}

// The request a scope belongs to, or null for specs/.
export const requestOf = (scope) => (scope.startsWith('request:') ? scope.slice('request:'.length) : null);
// How a paragraph is named in findings: a change spec's IDs are its request's own.
export const named = (request, id) => (request ? `${request}/${id}` : id);
