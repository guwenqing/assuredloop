// Dispositions and the close rule (design.md 5; the architect's answers for
// #179, decision D15): for each change paragraph with a baseline effect, the
// disposition of its current version, and whether that disposition is valid
// in the given state. Read by al check, al context and al conclude.
import { closeness, NEAR } from './words.js';
import { hasBaselineEffect, isPromise, qualify, servesSigned } from './state.js';

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
      const was = opts.baseSpec?.get(id);
      if ((isPromise(state, p.kind) || (was && isPromise(state, was.kind))) && !servesSigned(state, p, r.name)) {
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
      if (d.decision) {
        const x = decision(d.decision);
        if (!x) return no(`${d.decision} is not in the record`);
        if (!/^owner\b/i.test(String(x.source ?? ''))) return no(`${d.decision}'s source is not the owner`);
        if (isPromise(state, p.kind) && !servesSigned(state, p, r.name)) return no(`${d.decision} keeps a promise, and no signed requirement covers it`);
        return yes(`kept by ${d.decision}`);
      }
      const holder = source;
      for (const id of p.links.changes) {
        const b = bindingOf(r.data, holder, 'changes', id);
        if (!b) return no(`no changes binding to ${id}, so whether it was applied is unknown`);
        if (spec(id)?.sha256 !== b.target_sha256) return no(`${id} is not the version that ${p.id} bound: applied, or changed since`);
      }
      for (const id of p.links.removes) {
        const b = bindingOf(r.data, holder, 'removes', id);
        if (!b) return no(`no removes binding to ${id}, so whether it was applied is unknown`);
        if (spec(id)?.sha256 !== b.target_sha256) return no(`${id} is gone or changed: the removal was applied`);
      }
      if (!p.links.changes.length && !p.links.removes.length) {
        const same = [...state.spec.values()].find((s) => s.sha256 === p.sha256);
        if (same) return no(`its text is in specs/ as ${same.id}`);
        const near = [...state.spec.values()].find((s) => s.kind !== 'note' && closeness(s.text, p.text) >= NEAR);
        if (near) notes.push(`near-match ${near.id}: applied in another form?`);
      }
      return yes();
    }
    default:
      return no(`"${d.disposition}" is not a disposition`);
  }
}

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
    const v = judge(state, r, p, d, opts);
    out.push({ id, p, d, status: String(d.disposition), ...v });
  }
  return out;
}
