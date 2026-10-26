// The close lines of a request and items 2 and 3 of the close rule
// (light-design LD-57, LD-62; light-resign/R5). A close line is one sentence
// of the author, recorded with al record <name> close: it names a change
// paragraph that is not delivered, or a requirement that is met where no
// lasting paragraph links to it. al keeps, by itself, the version of what it
// names and of each spec paragraph that its reason names; no person and no
// AI writes or reads them. It clears items 2 and 3 only while they keep
// those versions. It is not a judgement of LD-12, and it never clears item 1.
import { git } from './git.js';
import { isCentral } from './indexer.js';
import { linkStates, mapped } from './map.js';
import { parseMarkdown } from './markers.js';
import { SPEC, docsInScope } from './scope.js';
import { isPromise, qualify, servesSigned, settingsAt, signed } from './state.js';

const list = (x) => (Array.isArray(x) ? x : []);
const ID_WORD = /(?<![\w-])(central:)?(ADR-[0-9]+-[0-9]+|[A-Z][A-Z0-9]*-[0-9]+)(?![\w-])/g;
const isReq = (id) => /^[RQ]\d+$/.test(id);

// The own ID that `ref` names in request `r` (bare, or <name>/<ID>): a
// requirement of its current version or a paragraph of its change spec; else null.
export function ownTarget(r, ref) {
  const id = ref.startsWith(`${r.name}/`) ? ref.slice(r.name.length + 1) : ref;
  return (isReq(id) ? r.reqs.some((q) => q.id === id) : r.paras.has(id)) ? id : null;
}

// The text hash of own ID `on` of request `r` now, or null when it is gone.
export const onSha = (r, on) => (isReq(on) ? r.reqs.find((q) => q.id === on)?.sha256 : r.paras.get(on)?.sha256) ?? null;

// The latest version of requirement `on` in the record of request `r`, or
// null. A text A, then B, then A again has three versions, so a close line
// keeps the version as well as the text hash (LD-16).
export const reqVersion = (r, on) => list(r.data?.requirements).filter((v) => v?.id === on)
  .reduce((a, v) => (Number(v.version) > Number(a?.version ?? 0) ? v : a), null);

// The words of `reason` in al's ID form, but `on`, each with its paragraph
// of specs/ or null. In the central repo, `central:X` is its own X (DES-69).
export function reasonNames(state, reason, on) {
  const central = isCentral(state.config);
  const out = new Map();
  for (const [, prefix, bare] of reason.matchAll(ID_WORD)) {
    const id = prefix && !central ? `${prefix}${bare}` : bare;
    if (id === on || out.has(id)) continue;
    out.set(id, prefix && !central ? null : state.spec.get(bare) ?? null);
  }
  return [...out].map(([id, p]) => ({ id, p }));
}

// The latest close line for each own ID of request `r`, with whether it is
// current: [{ e, current, facts }], `facts` naming what changed since. An
// archived request is never checked again against today's spec: its lines
// are { e, archived: true }.
export function closeLines(state, r) {
  const latest = new Map();
  for (const e of list(r.data?.closes)) if (e?.on) latest.set(String(e.on), e);
  return [...latest.values()].map((e) => {
    if (!r.open) return { e, archived: true, current: false, facts: [] };
    const on = String(e.on);
    const now = onSha(r, on);
    const v = isReq(on) ? reqVersion(r, on) : null;
    const facts = now !== e.sha256 ? [`${on} ${now ? 'changed' : 'is gone'}`]
      : v && e.version != null && Number(v.version) !== Number(e.version) ? [`${on} changed (version ${e.version}, now version ${v.version})`] : [];
    for (const n of list(e.names)) {
      const p = state.spec.get(String(n?.id));
      if (!p) facts.push(`${n?.id} left specs/`);
      else if (p.sha256 !== n.sha256) facts.push(`${n.id} changed`);
    }
    return { e, current: !facts.length, facts };
  });
}

export const closeLine = (r, c) => `close ${c.e.id} ${r.name}/${c.e.on} `
  + `${c.archived ? 'recorded at the close; an archived request is not checked against today\'s spec' : c.current ? 'current' : `stale: ${c.facts.join(', ')} since it was recorded; it clears nothing until you record it again`}: ${c.e.reason}`;

// The refusals of items 2 and 3 for request `r`, on paths 2 and 3 only (the
// requests that have a map). `was` is the base state, or null.
export function closeRefusals(state, was, r, lines = closeLines(state, r)) {
  if (!mapped([r]).length) return [];
  const byOn = new Map(lines.map((c) => [String(c.e.on), c]));
  const cleared = (id) => byOn.get(id)?.current === true;
  const stale = (id) => (byOn.has(id) && !cleared(id) ? `; close line ${byOn.get(id).e.id} is stale` : '');
  const out = [];
  // 2. A signed requirement of the current version with no declared link: a
  // `serves` link from a paragraph in specs/, or a `decides` link from an
  // accepted ADR. A requirement that the owner dropped is not in r.reqs.
  for (const q of r.reqs) {
    if (!signed(state, r.name, q.id) || cleared(q.id)) continue;
    const key = `${r.name}/${q.id}`;
    const names = (refs) => refs.some((s) => qualify(s, null).key === key);
    if ([...state.spec.values()].some((p) => names(p.links.serves))) continue;
    if (state.adrList.some((a) => a.status === 'accepted' && names(a.head?.links.decides ?? []))) continue;
    out.push(`${key} has no declared paragraph link: no paragraph of specs/ serves it, and no accepted ADR decides it; `
      + `link it, or record where it is met: al record ${r.name} close --on ${q.id} --reason <why>${stale(q.id)}`);
  }
  // 3. A `changes` target unchanged since the link, or a `removes` target
  // still in specs/, read from the map's states (LD-61).
  for (const l of linkStates(state, was, r)) {
    if (cleared(l.q.id)) continue;
    const who = `${r.name}/${l.q.id}`;
    const fix = `or record why it is not delivered: al record ${r.name} close --on ${l.q.id} --reason <why>${stale(l.q.id)}`;
    if (l.word === 'removes') {
      if (state.spec.has(l.id)) out.push(`${who} removes ${l.id}, and ${l.id} is still in specs/: remove it, ${fix}`);
    } else if (l.fact === 'unchanged since the link') out.push(`${who} changes ${l.id}, and ${l.id} is unchanged since the link: change it, ${fix}`);
    else if (l.fact.startsWith('not known: the link has no binding')) out.push(`${who} changes ${l.id}, and the link has no binding, so whether ${l.id} changed is not known: run al index, ${fix}`);
  }
  return out;
}

// Item 1 for a removal: each promise paragraph that a change paragraph of
// request `r` removes by `removes`, and that is gone from specs/, when the
// remover serves no signed requirement. This holds also for a removal that
// an earlier PR of the same change merged, which the branch does not show.
// Returns ["<ID> (removed by <name>/<ID>)"].
export function unsignedRemovals(state, was, r) {
  const central = isCentral(state.config);
  const out = [];
  for (const p of r.paras.values()) {
    for (const ref of p.links.removes) {
      const id = central && ref.startsWith('central:') ? ref.slice('central:'.length) : ref;
      if (id.includes(':') || id.includes('/') || state.spec.has(id) || servesSigned(state, p, r.name)) continue;
      const kind = was?.spec.get(id)?.kind ?? pastKind(state, id);
      if (isPromise(state, p.kind) || isPromise(state, kind)) out.push({ id, line: `${id} (removed by ${r.name}/${p.id})` });
    }
  }
  return out;
}

// The kind that spec paragraph `id` had in the newest commit that held it,
// from git history, or null. First the selected commit itself; then, newest
// first, each commit whose diff adds or removes the marker (in any spacing
// the parser allows, in any path) or changes .assuredloop/config.yaml (which
// can bring a marked file into scope or take it out). Each commit, then its
// parent, is read with that commit's own config and schema.
function pastKind(state, id) {
  const top = state.top;
  const rev = state.rev ?? 'HEAD';
  const marker = `<!--[[:space:]][[:space:]]*${id}[[:space:]]`;
  const list = (args) => (git(top, ['log', '--format=%H', ...args], { allowFail: true }) ?? '').split('\n').filter(Boolean);
  const candidates = new Set([...list(['-G', marker, rev]), ...list([rev, '--', '.assuredloop/config.yaml'])]);
  const ordered = (git(top, ['rev-list', rev], { allowFail: true }) ?? '').split('\n').filter((sha) => candidates.has(sha));
  const kindAt = (at) => {
    const { config, kinds } = settingsAt(top, at);
    for (const d of docsInScope(top, config, at).filter((x) => x.scope === SPEC)) {
      const p = parseMarkdown(d.text, d.path, { kinds }).paragraphs.find((x) => x.id === id);
      if (p) return p.kind;
    }
    return undefined;
  };
  for (const at of [rev, ...ordered.flatMap((sha) => [sha, `${sha}^`])]) {
    const kind = kindAt(at);
    if (kind !== undefined) return kind;
  }
  return null;
}
