// One state of a v4 project, the working tree or a commit, as the checks and
// views read it (T10, T11): the spec paragraphs, each request with its
// request.md, record and change spec, and the ADRs. Nothing is written.
import { readdirSync } from 'node:fs';
import { join, posix } from 'node:path';
import { parse } from 'yaml';
import { parseOnce } from './yaml-once.js';
import { exists, read, recordPath, sha256 } from './base.js';
import { loadConfig, loadSchema } from './config.js';
import { fileAt, filesAt, git } from './git.js';
import { KINDS, groupOf, lf, parseMarkdown, withoutScope } from './markers.js';
import { frameOf, requirements, signedText } from './request-md.js';
import { originals } from './originals.js';
import { ADR_FILE, SPEC, adrId, docsInScope, parseScopes, symlinkOn } from './scope.js';

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
const adrBody = (text) => withoutScope(text.replace(/\r\n?/g, '\n')).replace(/^\s*Status:[^\n]*\n?/, '').replace(/^\n+/, '');

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

// A state at a commit, named by its full hash, is read once in a process
// (#101): nothing changes it, and al check reads the base's state in al
// index and again in its checks. The working tree's state is read each time,
// as al index writes records between two reads.
const atCommits = new Map();
export function loadState(top, rev = null) {
  if (!rev || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(rev)) return readState(top, rev);
  const key = `${top}\n${rev}`;
  if (!atCommits.has(key)) atCommits.set(key, readState(top, rev));
  return atCommits.get(key);
}

function readState(top, rev) {
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
  // The one reader of original files, in the repo or at the place (origin-elsewhere/R1).
  const origin = originals(top, rev, get, config);

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
        data = parseOnce(text ?? 'null');
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
    // section has now (#216): its snapshot, checked against its hash, has the
    // section's signed text or the same frame. True, false, or null (not
    // known) when its file is kept outside and no place is set: a sign-off
    // whose file is not checked is never counted as signed.
    const current = signedText(md);
    const framedBy = (s) => {
      if (current === null || typeof s?.file !== 'string' || typeof s.sha256 !== 'string') return false;
      const got = origin.check(requests.get(name), s.file, s.sha256, true);
      if (got.status === 'not checked') return null;
      if (got.status !== 'verified') return false;
      return s.sha256 === sha256(current) || frameOf(got.text.toString('utf8')) === frameOf(current);
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

  // Every ADR file, in name order (adrList), and by number the first file of
  // that number, which a lookup by number uses (DES-113).
  const adrs = new Map();
  const adrList = [];
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
    const id = adrId(m[1]);
    const status = /^\s*Status:\s*([a-z]+)/i.exec(text)?.[1].toLowerCase() ?? null;
    const head = paragraphs.find((p) => p.id === id) ?? null;
    // The status line that al knows: `Status: proposed`, `accepted` or
    // `superseded by ADR-n` (#238), or by a list joined by commas and `and`,
    // `ADR-11, ADR-12 and ADR-13` (#1). `by` is the ADRs that it names;
    // `known` is whether it is the file's first line (#4). One parse gives
    // both, so superseded-status and adr-status agree.
    const s = /^(\s*)Status:[ \t]*(?:proposed|accepted|superseded[ \t]+by[ \t]+(ADR-\d+(?:(?:[ \t]*,[ \t]*(?:and[ \t]+)?|[ \t]+and[ \t]+)ADR-\d+)*))[ \t]*\r?(?:\n|$)/i.exec(text);
    const by = [...new Set([...(s?.[2] ?? '').matchAll(/ADR-(\d+)/gi)].map((m) => adrId(m[1])))];
    const known = Boolean(s) && !/[\r\n]/.test(s[1]);
    const marker = head && lf(text).split('\n')[head.line - 1];
    // The words after `Status:`, for a hint that names a changed status (#31).
    const line = /^\s*Status:[ \t]*([^\r\n]*)/i.exec(text)?.[1].trim() ?? null;
    const adr = { id, file, text, status, by, known, line, body: adrBody(text), rest: head && adrRest(text, head), paragraphs, head, marker };
    adrList.push(adr);
    if (!adrs.has(id)) adrs.set(id, adr);
  }
  // Markdown files in the ADR folder, none of them named as an ADR (adr-none).
  const noAdrs = adrFiles.some((f) => f.endsWith('.md')) && !adrFiles.some((f) => ADR_FILE.test(f));
  return { top, rev, config, kinds, root, get, docs, scopes, lints, spec, requests, adrs, adrList, noAdrs, unreadableAdrs, originals: origin };
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

// The place of a paragraph's text (LD-47): the file and the line of its
// first line of text, never its marker line; a paragraph with no text line
// says so.
export const placeOf = (p) => (p.textAt ? `${p.file}:${p.textAt}` : `${p.file}: no text line`);

// The line of requirement (or question) `id` of request `r`: its `### R<n>`
// heading; 0 when request.md has none.
export const reqLine = (r, id) => lf(r.md).split('\n').findIndex((l) => new RegExp(`^###\\s+${id}\\b`).test(l)) + 1;

// The line of decision `id` of request `r`: its entry under `## Decisions`
// in request.md; 0 when it has none there.
export function decisionLine(r, id) {
  const lines = lf(r.md).split('\n');
  const at = lines.findIndex((l) => /^##\s+Decisions\s*$/.test(l));
  if (at < 0) return 0;
  for (let i = at + 1; i < lines.length && !/^#{1,2}\s/.test(lines[i]); i++) if (new RegExp(`^- ${id}\\b`).test(lines[i])) return i + 1;
  return 0;
}

// The place of an ADR: the first line of text after its own marker, else
// its first line.
export const adrPlace = (a) => (a.head ? placeOf(a.head) : `${a.file}:1`);

// The place of the item that the qualified target `t` names in `state`: a
// spec, change spec or ADR paragraph, an ADR, a requirement or a decision.
// Null when al cannot find it there; a decision with no line in request.md
// says so.
export function placeOfTarget(state, t) {
  if (t.cross) return null;
  if (!t.req) {
    if (/^ADR-\d+$/.test(t.id)) { const a = state.adrs.get(t.id); return a ? adrPlace(a) : null; }
    const p = state.spec.get(t.id) ?? adrParagraph(state, t.id);
    return p ? placeOf(p) : null;
  }
  const r = state.requests.get(t.req);
  if (!r) return null;
  if (/^[RQ]\d+$/.test(t.id)) { const n = reqLine(r, t.id); return n ? `${r.dir}/request.md:${n}` : null; }
  if (/^D\d+$/.test(t.id)) {
    const n = decisionLine(r, t.id);
    if (n) return `${r.dir}/request.md:${n}`;
    return (Array.isArray(r.data?.decisions) ? r.data.decisions : []).some((d) => d?.id === t.id) ? `no line in ${r.dir}/request.md` : null;
  }
  const p = r.paras.get(t.id);
  return p ? placeOf(p) : null;
}

export const latestVersion = (data, id) => (Array.isArray(data?.requirements) ? data.requirements : []).filter((v) => v?.id === id)
  .reduce((a, v) => (Number(v.version) > Number(a?.version ?? 0) ? v : a), null);

// The sign-offs of request `name` that cover requirement (or question) `id`
// at its current text, each with framedBy's answer.
function covering(state, name, id) {
  const r = state.requests.get(name);
  const q = r?.reqs.find((x) => x.id === id);
  if (!q) return [];
  return (Array.isArray(r.data?.signoff) ? r.data.signoff : [])
    .filter((s) => (Array.isArray(s?.covers) ? s.covers : []).some((c) => c?.id === id && c.sha256 === q.sha256))
    .map((s) => [s, r.framedBy(s)]);
}

// The latest sign-off that signs requirement (or question) `id` of request
// `name` at its current text: it covers that id with the current text's hash,
// its snapshot is verified, and it signed the section's current intro, Out:
// and Assumed: text. Null when there is none.
export const signedBy = (state, name, id) => covering(state, name, id).filter(([, f]) => f === true).map(([s]) => s).at(-1) ?? null;

// The latest sign-off that would sign `id` but whose file is not checked
// (kept outside, no place set), when none signs it; else null.
export const unknownBy = (state, name, id) => (signedBy(state, name, id) ? null
  : covering(state, name, id).filter(([, f]) => f === null).map(([s]) => s).at(-1) ?? null);

// Whether requirement (or question) `id` of request `name` is signed at its current text.
export const signed = (state, name, id) => !!signedBy(state, name, id);

// The requirements that paragraph `p` (of request `request`, or of specs/ when
// null) serves, as <request>/<id>.
const served = (p, request) => (p.links?.serves ?? []).map((ref) => qualify(ref, request))
  .filter((t) => !t.cross && t.req && /^[RQ]\d+$/.test(t.id));

// Whether paragraph `p` serves a requirement that is signed at its current text.
export const servesSigned = (state, p, request) => served(p, request).some((t) => signed(state, t.req, t.id));

// The requirements that `p` serves whose sign-off cannot be checked here, when
// it serves none that is signed: [<request>/<id>].
export const servesUnknown = (state, p, request) => (servesSigned(state, p, request) ? []
  : served(p, request).filter((t) => unknownBy(state, t.req, t.id)).map((t) => `${t.req}/${t.id}`));

// The request a scope belongs to, or null for specs/.
export const requestOf = (scope) => (scope.startsWith('request:') ? scope.slice('request:'.length) : null);
// How a paragraph is named in findings: a change spec's IDs are its request's own.
export const named = (request, id) => (request ? `${request}/${id}` : id);

// The version of a requirement's current text, from the record ("new" when not indexed yet).
export const versionOf = (r, q) => {
  const v = (Array.isArray(r.data?.requirements) ? r.data.requirements : []).filter((x) => x?.id === q.id && x.sha256 === q.sha256).at(-1);
  return v ? `version ${v.version}` : `version ${Number(latestVersion(r.data, q.id)?.version ?? 0) + 1} (not indexed)`;
};

// The replaces: links of every request's requirements (LD-68), read once for
// each state: { r, q, ref, line, key, target } for each link, with the
// target's { r, q } when it is a requirement R<n> of another request,
// `own` when it names its own request, and `question` when a question's
// marker holds it: only a requirement replaces one. `holds` is true when the new
// requirement is signed at its current text, null when its sign-off is not
// checked, and false when it is a proposed replacement.
const linksOfState = new WeakMap();
export function replaceLinks(state) {
  if (linksOfState.has(state)) return linksOfState.get(state);
  const out = [];
  for (const r of state.requests.values()) {
    for (const q of r.reqs) {
      for (const { ref, line } of q.replaces) {
        const t = qualify(ref, r.name);
        const question = !/^R\d+$/.test(q.id);
        const tr = !question && !t.cross && t.req && t.req !== r.name && /^R\d+$/.test(t.id) ? state.requests.get(t.req) : null;
        const tq = tr?.reqs.find((x) => x.id === t.id) ?? null;
        // The same target named twice by one requirement is one link.
        if (out.some((l) => l.r === r && l.q === q && l.ref === ref)) continue;
        const holds = !tq ? false : signedBy(state, r.name, q.id) ? true : unknownBy(state, r.name, q.id) ? null : false;
        out.push({ r, q, ref, line, key: `${r.name}/${q.id}`, question, own: !question && !t.cross && t.req === r.name, target: tq ? { r: tr, q: tq, key: `${tr.name}/${tq.id}` } : null, holds });
      }
    }
  }
  linksOfState.set(state, out);
  return out;
}

// The valid links that replace the requirement named `key`.
export const replacersOf = (state, key) => replaceLinks(state).filter((l) => l.target?.key === key);

// What a replacement's state means, after its sign state.
export const replaceWords = (l) => (l.holds ? 'the replacement holds' : l.holds === null ? 'not known whether the replacement holds'
  : 'a proposed replacement: it holds once this version is signed');
