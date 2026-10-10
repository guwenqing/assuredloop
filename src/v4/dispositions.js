// Dispositions and the close rule (design.md 5; the architect's answers for
// #179, decision D15): for each change paragraph with a baseline effect, the
// disposition of its current version, and whether that disposition is valid
// in the given state. Read by al check, al context and al conclude.
import { git } from './git.js';
import { parseMarkdown } from './markers.js';
import { SPEC, docsInScope } from './scope.js';
import { closeness, NEAR } from './words.js';
import { hasBaselineEffect, isPromise, qualify, servesSigned, settingsAt } from './state.js';

const list = (x) => (Array.isArray(x) ? x : []);

// The disposition of `source` (<request>/SP-n) for the version with hash
// `sha`: the last entry for that version; an entry whose hash is not filled
// yet (not indexed) stands for the current version.
function dispositionOf(data, source, sha) {
  const mine = list(data?.dispositions).filter((d) => d?.source === source);
  return mine.filter((d) => d.source_sha256 === sha).at(-1) ?? mine.filter((d) => !d.source_sha256).at(-1) ?? null;
}

// The binding of `holder` `link` `target` in a record's data, or null.
const bindingOf = (data, holder, link, target) => list(data?.bindings)
  .find((b) => b?.holder === holder && b.link === link && b.target === target) ?? null;

// Whether disposition `d` of source paragraph `p` (request `r`) is valid.
// Returns { valid, reason, notes }. `seen` guards a supersession chain.
export function judge(state, r, p, d, opts = {}, seen = new Set()) {
  const source = `${r.name}/${p.id}`;
  const notes = [];
  const no = (reason) => ({ valid: false, reason, notes });
  const yes = (reason = null) => ({ valid: true, reason, notes });
  const decision = (id) => list(r.data?.decisions).find((x) => x?.id === id) ?? null;
  const spec = (id) => state.spec.get(id) ?? null;

  switch (d.disposition) {
    case 'incorporated': {
      const s = spec(d.spec);
      if (!d.spec) return no('it names no spec paragraph');
      if (!s) return no(`${d.spec} is not in specs/`);
      if (d.spec_sha256 && s.sha256 !== d.spec_sha256) return no(`${d.spec} changed after it was incorporated`);
      if (s.sha256 === p.sha256) return yes();
      if (d.decision) {
        const w = decision(d.decision)?.wording;
        if (!w) return no(`${d.decision} is not a wording decision in the record`);
        if (w.source_sha256 !== p.sha256 || w.target_sha256 !== s.sha256) return no(`${d.decision} names other versions of ${p.id} and ${d.spec}`);
        return yes(`worded by ${d.decision}`);
      }
      if (opts.typo?.has(d.spec) && opts.baseSpec?.get(d.spec)?.sha256 === d.spec_sha256) {
        notes.push(`a typo claim on this branch changes ${d.spec}; a claim, not proven`);
        return yes('a typo claim');
      }
      return no(`${d.spec} does not equal ${p.id} (no wording decision, no typo claim)`);
    }
    case 'removed': {
      const id = d.spec ?? p.links.removes[0];
      if (!id) return no('it names no spec paragraph');
      if (!p.links.removes.includes(id)) return no(`${p.id} does not declare removes:${id}`);
      if (spec(id)) return no(`${id} is still in specs/`);
      const wasKind = opts.baseSpec?.get(id)?.kind ?? pastKind(state, id);
      if ((isPromise(state, p.kind) || isPromise(state, wasKind)) && !servesSigned(state, p, r.name)) {
        return no(`${id} is a promise, and no signed requirement covers its removal`);
      }
      return yes();
    }
    case 'superseded': {
      if (!d.by) return no('it names no later change (by:)');
      const by = qualify(String(d.by), r.name);
      const rb = state.requests.get(by.req);
      if (!rb) return no(`${d.by}: no such request`);
      // The incorporated version: on this entry, or on the earlier incorporated entry it replaced.
      const was = d.spec_sha256 ?? list(r.data?.dispositions).filter((x) => x?.source === source && x.disposition === 'incorporated'
        && x.spec === d.spec && x.source_sha256 === p.sha256).at(-1)?.spec_sha256;
      const b = bindingOf(rb.data, d.by, 'changes', d.spec) ?? bindingOf(rb.data, d.by, 'removes', d.spec);
      if (!b || !was || b.target_sha256 !== was) return no(`${d.by} has no changes or removes binding to the incorporated version of ${d.spec}`);
      if (seen.has(source)) return no('the supersession chain goes round in a circle');
      seen.add(source);
      const pb = rb.paras.get(by.id);
      if (!rb.open) {
        // An archived change is never checked again: its record stands.
        const ok = list(rb.data?.dispositions).some((x) => x?.source === d.by && ['incorporated', 'removed', 'superseded'].includes(x.disposition));
        return ok ? yes(`by ${d.by}, archived`) : no(`${d.by} has no disposition in its archived record`);
      }
      if (!pb) return no(`${d.by} is not in its change spec`);
      const db = dispositionOf(rb.data, d.by, pb.sha256);
      if (!db || !['incorporated', 'removed', 'superseded'].includes(db.disposition)) return no(`${d.by} has no incorporated, removed or superseded disposition`);
      const v = judge(state, rb, pb, db, opts, seen);
      return v.valid ? yes(`by ${d.by}`) : no(`${d.by}: ${v.reason}`);
    }
    case 'abandoned': {
      // First the facts of no kept effect (D15 rules a-c): then no sign-off is
      // needed, whatever decision names the drop (design.md 6).
      const effect = keptEffect(state, r, p, source);
      if (!effect) {
        if (d.decision && !decision(d.decision)) return no(`${d.decision} is not in the record`);
        notes.push(...nearNotes(state, p));
        return { valid: true, reason: d.decision ? `never applied, or reverted; dropped by ${d.decision}` : null, notes, kept: false };
      }
      // Its effect is still in specs/: only an owner decision can keep it, and
      // a kept promise needs a signed requirement (D15 rule d, design.md 5).
      if (!d.decision) return no(effect);
      const x = decision(d.decision);
      if (!x) return no(`${d.decision} is not in the record`);
      if (!/^owner\b/i.test(String(x.source ?? ''))) return no(`${d.decision}'s source is not the owner, and ${effect}`);
      if (isPromise(state, p.kind) && !servesSigned(state, p, r.name)) return no(`${d.decision} keeps a promise, and no signed requirement covers it`);
      return { valid: true, reason: `its effect is kept by ${d.decision}`, notes, kept: true };
    }
    default:
      return no(`"${d.disposition}" is not a disposition`);
  }
}

// The kind that spec paragraph `id` had in the newest commit that held it,
// from git history, or null. First the selected commit itself; then, newest
// first, each commit whose diff adds or removes the marker (in any spacing
// the parser allows, in any path) or changes .assuredloop/config.yaml (which
// can bring a marked file into scope or take it out). Each commit, then its
// parent, is read with that commit's own config and schema.
export function pastKind(state, id) {
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

// Why paragraph `p` (<request>/SP-n `source`) still has an effect in specs/,
// or null when it has none: its changes or removes targets keep the text they
// were bound to, and a paragraph with neither link has no copy in specs/.
function keptEffect(state, r, p, source) {
  const spec = (id) => state.spec.get(id) ?? null;
  for (const id of p.links.changes) {
    const b = bindingOf(r.data, source, 'changes', id);
    if (!b) return `no changes binding to ${id}, so whether it was applied is unknown`;
    if (spec(id)?.sha256 !== b.target_sha256) return `${id} is not the version that ${p.id} bound: applied, or changed since`;
  }
  for (const id of p.links.removes) {
    const b = bindingOf(r.data, source, 'removes', id);
    if (!b) return `no removes binding to ${id}, so whether it was applied is unknown`;
    if (spec(id)?.sha256 !== b.target_sha256) return `${id} is gone or changed: the removal was applied`;
  }
  if (!p.links.changes.length && !p.links.removes.length) {
    const same = [...state.spec.values()].find((s) => s.sha256 === p.sha256);
    if (same) return `its text is in specs/ as ${same.id}`;
  }
  return null;
}

// A near match in specs/ for a paragraph with no changes or removes link.
const nearNotes = (state, p) => {
  if (p.links.changes.length || p.links.removes.length) return [];
  const near = [...state.spec.values()].find((s) => s.kind !== 'note' && closeness(s.text, p.text) >= NEAR);
  return near ? [`near-match ${near.id}: applied in another form?`] : [];
};

// Every change paragraph of request `r` with a baseline effect, with the
// disposition of its current version and its validity. A spike has none.
export function judgeRequest(state, r, opts = {}) {
  if (r.spike) return [];
  const out = [];
  for (const p of r.paras.values()) {
    if (!hasBaselineEffect(state, p.kind) && !p.links.removes.length) continue;
    const id = `${r.name}/${p.id}`;
    const d = dispositionOf(r.data, id, p.sha256);
    if (!d) {
      out.push({ id, p, d: null, status: 'pending', valid: false, reason: 'no disposition for its current version', notes: [] });
      continue;
    }
    // An archived request is never checked again against today's spec (design.md 5).
    if (!r.open) {
      out.push({ id, p, d, status: String(d.disposition), valid: true, reason: 'as recorded at the close; not checked again', notes: [] });
      continue;
    }
    const v = judge(state, r, p, d, opts);
    out.push({ id, p, d, status: String(d.disposition), ...v });
  }
  return out;
}
