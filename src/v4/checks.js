// The checks that read records (T10; design.md 3-7 and 9, schema.md 5; the
// architect's answers for #179, decision D15). Each finding is
// { severity, code, file, line, id, message }: `not ok`, `hint` or `info`.
// They compare the working tree with the base (baseOf in git.js: the
// merge-base with main or origin/main) and read the records of the open
// requests. No AI, no network.
import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import { read } from './base.js';
import { droppedUnsigned, judgeRequest } from './dispositions.js';
import { commitsOf, git } from './git.js';
import { diffParagraphs } from './ids.js';
import { crossResults } from './repos.js';
import { loadResults } from './results.js';
import {
  adrParagraph, hasBaselineEffect, isPromise, loadState, named, qualify, requestOf, resolve, servesSigned,
} from './state.js';
import { NEAR, closeness, diffWords, marks, requirementWords, sentencesOf, showHunk } from './words.js';
import { LINK_WORDS, groupOf, markerLines, onlyLinksAdded, sameBlocks } from './markers.js';
import { canAlignTo, declaredNow, isCentral } from './indexer.js';
import { adrOf, recordBlocks, supersededBlocks } from './blocks.js';
import { phraseFindings } from './phrases.js';
import { issueHints } from './issues.js';

const DESIGN = ['component', 'interface', 'data', 'flow', 'choice'];
const TIER = /^[ \t]*Tier:[ \t]*(0|1d|1|2|3|S)\b[ \t]*(?:—|–|--?)?[ \t]*(.*)$/m;

// The PR's path claim: the Tier line of the newest commit in base..HEAD that
// has one (as v1 reads it); null when none has. `commits` is how many there are.
export function readClaim(top, base) {
  if (!base) return { claim: null, commits: 0 };
  const out = git(top, ['log', '--format=%B%x00', `${base}..HEAD`], { allowFail: true }) ?? '';
  const messages = out.split('\0').map((m) => m.trim()).filter(Boolean);
  for (const m of messages) {
    const lines = [...m.matchAll(new RegExp(TIER.source, 'gm'))];
    if (lines.length) {
      const [line, tier, rest] = lines.at(-1);
      const typo = /^typo in\s+(.+)$/i.exec(rest.trim());
      const ids = typo ? typo[1].split(/\s*(?:,|\band\b)\s*/).map((s) => s.trim().replace(/^central:/, '').replace(/[.;]$/, '')).filter(Boolean) : [];
      return { claim: { tier, rest: rest.trim(), line: line.trim(), typo: new Set(ids) }, commits: messages.length };
    }
  }
  return { claim: null, commits: messages.length };
}

// Each paragraph's change from the base to the head, per scope, with both
// versions: { scope, request, id, name, head, base, changes, changed, kindChange }.
function changesOf(now, was) {
  const out = [];
  for (const scope of new Set([...now.scopes.keys(), ...(was?.scopes.keys() ?? [])])) {
    const head = now.scopes.get(scope) ?? [];
    const before = was?.scopes.get(scope) ?? [];
    const h = new Map(head.map((p) => [p.id, p]));
    const b = new Map(before.map((p) => [p.id, p]));
    const request = requestOf(scope);
    for (const c of diffParagraphs(before, head)) {
      const hp = h.get(c.id) ?? null;
      const bp = b.get(c.id) ?? null;
      const changed = c.changes.some((x) => x !== 'Moved');
      const kindChange = !!(hp && bp && hp.kind !== bp.kind);
      if (!changed && !kindChange) continue;
      out.push({ scope, request, id: c.id, name: named(request, c.id), head: hp, base: bp, changes: c.changes, changed, kindChange });
    }
  }
  return out;
}

const changeWord = (c) => (c.changes.includes('New') ? 'new' : c.changes.includes('Removed') ? 'removed' : c.changed ? 'changed' : 'given another kind');

// The branch against its base, in states `now` and `was` (null with no
// base): each paragraph's change, adoption aside, the path claim, and the
// promise changes with no signed requirement that covers them (design.md 6).
// A change paragraph that is validly abandoned with no kept effect needs none.
// al check reports each of those, and al conclude refuses on them (DES-37).
export function branchOf(top, now, was, base) {
  const promise = (k) => isPromise(now, k);
  const open = [...now.requests.values()].filter((r) => r.open);
  // Adoption on the branch (D16, D21): a spec paragraph that is new at the
  // head is adopted text, not a change, when the adoption record names it with
  // its current hash and the same text is a block of its file at the base, in
  // its place (sameBlocks: one block covers one paragraph). An adoption record
  // cannot cover new text.
  const captured = adoptionEntries(now);
  const notAdopted = new Set();
  const atBase = new Map();
  const adoptedHere = (c) => {
    if (c.request || !c.head || c.base || !captured.get(c.id)?.has(c.head.sha256)) return false;
    const file = c.head.file;
    if (!atBase.has(file)) {
      const text = was.get(file);
      atBase.set(file, text == null ? new Set() : sameBlocks(text, (now.scopes.get(c.scope) ?? []).filter((p) => p.file === file), { file, living: new Set(now.spec.keys()) }));
    }
    return atBase.get(file).has(c.id);
  };
  const changes = [];
  for (const c of was ? changesOf(now, was) : []) {
    if (adoptedHere(c)) continue;
    if (!c.request && c.head && !c.base && captured.has(c.id)) notAdopted.add(c.id);
    changes.push(c);
  }
  const { claim, commits } = readClaim(top, base);
  const typo = claim?.tier === '0' ? claim.typo : new Set();

  // A promise change: a promise-kind paragraph new, changed or removed, or a
  // kind change into or out of a promise kind.
  const isPromiseChange = (c) => (c.changed && (promise(c.head?.kind) || promise(c.base?.kind)))
    || (c.kindChange && (promise(c.head.kind) || promise(c.base.kind)));

  // Sign-off coverage: a promise change with no signed requirement that covers it.
  const uncovered = [];
  for (const c of changes.filter(isPromiseChange)) {
    if (typo.has(c.name)) continue;
    const r = c.request && c.head ? now.requests.get(c.request) : null;
    if (r && !r.spike && droppedUnsigned(now, r, c.head, { typo, baseSpec: was?.spec ?? null })) continue;
    let covered;
    if (!c.head) {
      if (c.request) continue; // a change spec paragraph taken out is no promise change
      const removers = open.flatMap((r) => [...r.paras.values()].filter((p) => p.links.removes.includes(c.id)).map((p) => [r, p]));
      covered = removers.some(([r, p]) => servesSigned(now, p, r.name));
    } else {
      covered = servesSigned(now, c.head, c.request);
    }
    if (!covered) uncovered.push(c);
  }

  return { changes, captured, notAdopted, claim, commits, typo, isPromiseChange, uncovered };
}

export function checks(top, { base, phrases = [], issues = null }) {
  const now = loadState(top);
  const was = base ? loadState(top, base) : null;
  const findings = [];
  const notKnown = [];
  const at = (p) => (p ? `${p.file}:${p.line}` : '-');
  const add = (severity, code, p, id, message) => findings.push({ severity, code, where: typeof p === 'string' ? p : at(p), id, message });
  const promise = (k) => isPromise(now, k);
  const open = [...now.requests.values()].filter((r) => r.open);
  const { changes, captured, notAdopted, claim, commits, typo, isPromiseChange, uncovered } = branchOf(top, now, was, base);

  // Sign-off coverage (design.md 6): a promise change with no signed requirement that covers it.
  for (const c of uncovered) add('not ok', 'signoff-coverage', c.head ?? c.base, c.name, `a ${(c.head ?? c.base).kind} paragraph is ${changeWord(c)} with no signed requirement that covers it`);

  // The path claim (design.md 7), and the typo claim's words (design.md 6).
  if (!base) notKnown.push('no base, so the path claim was not read');
  else if (!claim) {
    if (commits) add('hint', 'no-claim', '-', '-', `no Tier line in ${base.slice(0, 7)}..HEAD; add "Tier: <n> — <claim>" to a commit message`);
    notKnown.push(commits ? 'the path checks: no Tier line' : 'the path checks: no commit on this branch');
  } else if (claim.tier === '0') {
    for (const c of changes) {
      if (typo.has(c.name)) continue;
      if (isPromiseChange(c)) add('hint', 'path-claim', c.head ?? c.base, c.name, `path 0, but a ${(c.head ?? c.base).kind} paragraph is ${changeWord(c)} with no typo claim`);
      else if (!c.request && ['design', 'informative'].includes(groupOf((c.head ?? c.base).kind, now.kinds))) {
        add('hint', 'path-claim', c.head ?? c.base, c.name, `path 0, but a ${(c.head ?? c.base).kind} paragraph is ${changeWord(c)}: path 1d or 2?`);
      }
    }
  } else if (claim.tier === '1d') {
    for (const c of changes) {
      const p = c.head ?? c.base;
      if (isPromiseChange(c)) add('hint', 'path-claim', p, c.name, `path 1d, but a ${p.kind} paragraph is ${changeWord(c)}; 1d is for names and wording of design paragraphs`);
      else if (DESIGN.includes(p.kind) && (!c.head || !c.base)) add('hint', 'path-claim', p, c.name, `path 1d, but a ${p.kind} paragraph is ${changeWord(c)}; 1d adds or removes no design paragraph`);
    }
  }
  const byName = new Map(changes.map((c) => [c.name, c]));
  const shownWords = (name, why) => {
    const c = byName.get(name);
    if (!c?.head || !c.base || c.head.sha256 === c.base.sha256) {
      add('info', 'typo-words', c?.head ?? '-', name, `${why}, but this branch does not change its text`);
      return;
    }
    const hunks = diffWords(c.base.text, c.head.text);
    add('info', 'typo-words', c.head, name, `${hunks.map(showHunk).join(' · ')}; now: "${sentencesOf(c.head.text, hunks)}"`);
    const m = marks(hunks);
    if (why === 'typo claim' && m.length) add('hint', 'typo-mark', c.head, name, `meaning-sensitive; review the typo claim (${m.join(', ')})`);
  };
  for (const id of typo) shownWords(id, 'typo claim');
  if (claim?.tier === '1d') for (const c of changes) if (c.head && c.base && DESIGN.includes(c.head.kind) && c.changed) shownWords(c.name, '1d claim');

  // A spec edit that makes an open change's incorporated disposition invalid.
  for (const c of changes.filter((x) => !x.request && x.base && x.changed)) {
    for (const r of open) {
      for (const d of Array.isArray(r.data?.dispositions) ? r.data.dispositions : []) {
        if (d?.disposition === 'incorporated' && d.spec === c.id && d.spec_sha256 === c.base.sha256) {
          add('info', 'invalidates', c.head ?? c.base, c.id, `${d.source} incorporated this text; this edit makes that disposition invalid, so ${r.name} aligns`);
        }
      }
    }
  }

  // In the central repo, `central:X` is its own X (design.md 12).
  const self = (ref) => (isCentral(now.config) && ref.startsWith('central:') ? ref.slice('central:'.length) : ref);

  // Requirement words in a non-promise kind (design.md 3). A paragraph that
  // builds on a promise paragraph that exists applies that promise: no hint.
  const appliesPromise = (p, request) => {
    const own = new Set(now.requests.get(request)?.paras.keys() ?? []);
    return p.links.buildsOn.some((ref) => promise(resolve(now, qualify(self(ref), request, own))?.p?.kind));
  };
  for (const c of changes) {
    const p = c.head;
    if (!p?.kind || promise(p.kind) || !c.changed || appliesPromise(p, c.request)) continue;
    const w = requirementWords(p.text);
    if (w.length) add('hint', 'promise-kind', p, c.name, `promise kind? a ${p.kind} paragraph holds ${w.join(', ')}`);
  }

  // Near matches (design.md 3): a change paragraph close to a spec paragraph it does not link.
  for (const c of changes) {
    const r = c.request && now.requests.get(c.request);
    if (!r?.open || r.spike || !c.head || !hasBaselineEffect(now, c.head.kind)) continue;
    const linked = new Set([...c.head.links.changes, ...c.head.links.buildsOn, ...c.head.links.removes].map((x) => x.replace(/^central:/, '')));
    for (const d of Array.isArray(r.data?.dispositions) ? r.data.dispositions : []) if (d?.source === c.name && d.spec) linked.add(d.spec);
    for (const s of now.spec.values()) {
      if (linked.has(s.id) || !s.kind || s.kind === 'note') continue;
      if (closeness(c.head.text, s.text) >= NEAR) add('hint', 'near-match', c.head, c.name, `does this change ${s.id}? its text is close, and it has no changes or builds-on link to it`);
    }
  }

  // Overlaps (design.md 4): two open changes that both change one spec ID.
  const changers = new Map();
  for (const r of open) {
    for (const p of r.paras.values()) {
      for (const t of p.links.changes) {
        const id = t.replace(/^central:/, '');
        if (!changers.has(id)) changers.set(id, []);
        changers.get(id).push({ r, p });
      }
    }
  }
  for (const [id, xs] of changers) {
    if (new Set(xs.map((x) => x.r.name)).size < 2) continue;
    for (const { r, p } of xs) {
      const others = xs.filter((x) => x.r !== r).map((x) => `${x.r.name}/${x.p.id}`);
      add('hint', 'overlap', p, `${r.name}/${p.id}`, `${others.join(', ')} also change${others.length === 1 ? 's' : ''} ${id}: two open changes change one paragraph; align them`);
    }
  }

  // Links that do not resolve, and targets that a change removed (design.md 3).
  // The request that removed an ID is looked up only for a link that does not
  // resolve, and only a record whose text names the ID is parsed for it; the
  // last request in order wins.
  const removers = new Map();
  const removerOf = (id) => {
    if (removers.has(id)) return removers.get(id);
    let by = null;
    for (const r of now.requests.values()) {
      for (const p of r.paras.values()) if (p.links.removes.includes(id)) by = r.name;
      if (!r.mentions(id)) continue;
      for (const d of Array.isArray(r.data?.dispositions) ? r.data.dispositions : []) if (d?.disposition === 'removed' && d.spec === id) by = r.name;
    }
    removers.set(id, by);
    return by;
  };
  const holders = [
    ...now.spec.values(),
    ...open.flatMap((r) => [...r.paras.values()].map((p) => ({ p, r }))),
    ...[...now.adrs.values()].filter((a) => a.head && a.status !== 'superseded').map((a) => ({ p: a.head, adr: a })),
  ].map((x) => (x.p ? x : { p: x }));
  for (const { p, r, adr } of holders) {
    const own = r ? new Set(r.paras.keys()) : new Set();
    for (const [word, refs] of Object.entries(p.links)) {
      if (word === 'for') continue; // a task reference; tasks are optional
      for (const ref of refs) {
        const t = qualify(ref, r?.name ?? null, own);
        if (t.cross || resolve(now, t)) continue;
        const who = named(r?.name ?? null, p.id);
        if (word === 'removes' && !t.req && !now.spec.has(t.id) && r) continue; // its own removal, done
        if (!t.req && removerOf(t.id)) add('hint', 'target-removed', p, who, `${ref}: target removed by ${removerOf(t.id)}; align this link`);
        else add('hint', 'unresolved-link', p, who, `${ref}: no such ID${adr ? ` (in ${adr.id})` : ''}`);
      }
    }
  }

  // Design links (design.md 3): a design or approach paragraph of a change
  // spec that serves a requirement, where promise paragraphs of the same
  // change spec serve it, and that builds on or changes none of them. In the
  // central repo, `central:X` is its own X (self, above).
  for (const r of open) {
    const own = new Set(r.paras.keys());
    const key = (ref) => qualify(self(ref), r.name, own).key;
    const promises = new Map();
    for (const p of r.paras.values()) {
      if (!promise(p.kind)) continue;
      for (const k of new Set(p.links.serves.map(key))) {
        if (!promises.has(k)) promises.set(k, []);
        promises.get(k).push(p.id);
      }
    }
    if (!promises.size) continue;
    for (const p of r.paras.values()) {
      if (groupOf(p.kind, now.kinds) !== 'design') continue;
      const linked = new Set([...p.links.buildsOn, ...p.links.changes].map(key));
      for (const k of new Set(p.links.serves.map(key))) {
        const ids = promises.get(k);
        if (!ids || ids.some((id) => linked.has(`${r.name}/${id}`))) continue;
        add('hint', 'design-link', p, `${r.name}/${p.id}`, `serves ${k}, but links to none of its promise paragraphs in this change spec (${ids.join(', ')}): which promise does it keep?`);
      }
    }
  }

  // Task references (design.md 8): where the project uses tasks, a `for:`
  // that names no task in the record. A bare task is the paragraph's own
  // request's. The records are read only when an open change spec has a `for:`.
  const tasksOf = (r) => (Array.isArray(r?.data?.tasks) ? r.data.tasks : []);
  const fors = open.flatMap((r) => [...r.paras.values()].flatMap((p) => p.links.for.map((ref) => ({ r, p, ref }))));
  if (fors.length && [...now.requests.values()].some((r) => tasksOf(r).length)) {
    for (const { r, p, ref } of fors) {
      const t = self(ref);
      if (t.includes(':')) continue;
      const slash = t.indexOf('/');
      const [name, id] = slash > 0 ? [t.slice(0, slash), t.slice(slash + 1)] : [r.name, t];
      if (tasksOf(now.requests.get(name)).some((x) => String(x?.id) === id)) continue;
      add('hint', 'unknown-task', p, `${r.name}/${p.id}`, `for:${ref}: no task ${id} in the record of ${name}`);
    }
  }

  // Bindings whose target changed since they were bound (design.md 4, 6).
  let declared = null;
  let alignable = null;
  for (const r of open) {
    for (const b of Array.isArray(r.data?.bindings) ? r.data.bindings : []) {
      if (!b?.target || !b.holder || !b.target_sha256) continue;
      // A holder paragraph whose text changed since the link was bound
      // (removed-links/R2, #11). Output files and requirements are not
      // paragraphs; a link no longer declared is history (#2); the target
      // must be one that al index --align can move the binding to.
      if (b.holder_sha256) {
        const hq = qualify(String(b.holder), null);
        // An ID in several files of one ADR number (DES-113): the paragraph
        // with the bound text; else the one that declares the link and names
        // this record's request, as al index binds it; else it is unclear.
        const twins = hq.req || now.spec.has(hq.id) ? [] : now.adrList.flatMap((a) => a.paragraphs.filter((p) => p.id === hq.id));
        const declaring = twins.filter((p) => (p.links[LINK_WORDS[b.link]] ?? []).some((x) => qualify(x, null).key === String(b.target)));
        const homed = declaring.filter((p) => Object.values(p.links).flat().some((x) => qualify(String(x), null).req === r.name));
        const holders = homed.length ? homed : declaring.length ? declaring : twins;
        const hp = hq.req ? now.requests.get(hq.req)?.paras.get(hq.id) : twins.length > 1
          ? twins.find((p) => p.sha256 === b.holder_sha256) ?? holders[0]
          : now.spec.get(hq.id) ?? adrParagraph(now, hq.id);
        const unclear = twins.length > 1 && hp?.sha256 !== b.holder_sha256 && holders.length > 1
          ? ` It is unclear which of ${holders.map((p) => p.file).join(', ')} holds it.` : '';
        declared ??= declaredNow(top, now);
        alignable ??= canAlignTo(now);
        if (hp && hp.sha256 !== b.holder_sha256 && declared(b) && alignable(b.target)) {
          add('hint', 'holder-changed', hp, b.holder, `${b.link} ${b.target}: this paragraph changed after the link was bound.${unclear} Check that it still ${b.link} ${b.target}, then al index --align ${b.holder}`);
        }
      }
      const t = qualify(String(b.target), null);
      if (t.cross) continue;
      const cur = resolve(now, t);
      if (!cur || !cur.sha || cur.sha === b.target_sha256) continue;
      // The holder's own change made the target what it is now: its disposition names that text.
      if ((Array.isArray(r.data?.dispositions) ? r.data.dispositions : []).some((d) => d?.source === b.holder && d.spec === b.target && d.spec_sha256 === cur.sha)) continue;
      // A superseded ADR's links are history (schema.md 5).
      if (now.adrs.get(String(b.holder))?.status === 'superseded') continue;
      // A link that its holder no longer declares, or whose holder is gone, is history too (#2).
      declared ??= declaredNow(top, now);
      if (!declared(b)) continue;
      const hq = qualify(String(b.holder), null);
      const hp = hq.req ? now.requests.get(hq.req)?.paras.get(hq.id) : now.spec.get(hq.id);
      const msg = /^[RQ]\d+$/.test(t.id ?? '')
        ? `${b.target} changed after this paragraph was linked to it. Check that it still ${b.link} ${t.id}, then al index --align ${b.holder}`
        : `${b.link} ${b.target}, which changed since it was bound. Align it: check it, then al index --align ${b.holder}`;
      add('hint', 'stale-base', hp ?? '-', b.holder, msg);
    }
  }

  // AI hints made from another version of their paragraph (design.md 10).
  const docs = [...new Set([...now.spec.values(), ...open.flatMap((r) => [...r.paras.values()])].map((p) => p.file))];
  for (const file of docs) {
    let rec;
    try {
      rec = parseYaml(read(top, `.assuredloop/records/${file}.yaml`) ?? 'null');
    } catch {
      continue;
    }
    const paras = new Map([...now.scopes.values()].flat().filter((p) => p.file === file).map((p) => [p.id, p]));
    for (const e of Array.isArray(rec?.paragraphs) ? rec.paragraphs : []) {
      const p = paras.get(e?.id);
      if (!p || !e.hint?.basis_sha256 || e.hint.basis_sha256 === p.sha256) continue;
      const r = requestOfFile(file);
      add('hint', 'stale-ai-hint', p, named(r, p.id), 'its AI hint was made from another version of the text; refresh it (a hint is stale even when its quote still matches)');
    }
  }

  // Dispositions of the open requests (design.md 5).
  const baseSpec = was?.spec ?? null;
  for (const r of open) {
    const judged = judgeRequest(now, r, { typo, baseSpec });
    for (const j of judged) {
      if (j.status === 'pending') continue;
      if (!j.valid) add('hint', 'disposition', j.p, j.id, `${j.status} is not valid: ${j.reason}`);
      for (const n of j.notes) add(n.startsWith('near-match') ? 'hint' : 'info', n.startsWith('near-match') ? 'near-match' : 'disposition', j.p, j.id, n.replace(/^near-match /, ''));
    }
    const pending = judged.filter((j) => j.status === 'pending').map((j) => j.p.id);
    if (pending.length) add('info', 'disposition-pending', r.specFile, r.name, `${pending.length} of ${judged.length} paragraphs with a baseline effect have no disposition for their current version: ${pending.join(', ')}`);
  }

  // ADRs (schema.md 5). An ADR's text may be rewritten when its decision
  // stays, so a change is a hint for the review (#238). Links may be added to
  // the heading marker of an accepted ADR, with nothing else in that line
  // changed (#4) and the rest unchanged; that gives no finding.
  const linksAdded = (a, h) => a.status === 'accepted' && a.head && h.head && a.rest === h.rest
    && onlyLinksAdded(a.marker, h.marker, now.kinds);
  // A status goes only forward: accepted to superseded, and a superseded-by
  // list only gains ADRs (#31). Any other change of a known status line is a
  // change of the ADR; an unknown one has its own hint, adr-status.
  const statusBack = (a, h) => h.known
    && !(h.status === 'superseded' ? a.by.every((b) => h.by.includes(b)) : h.status === a.status);
  // Each file is compared with the same file; else, when its number has one
  // file at the base and one now, with that file, as after a rename (DES-113).
  const filesOf = (state, id) => state.adrList.filter((x) => x.id === id).length;
  for (const a of was?.adrList ?? []) {
    const { id } = a;
    if (!['accepted', 'superseded'].includes(a.status)) continue;
    const h = now.adrList.find((x) => x.file === a.file)
      ?? (filesOf(was, id) === 1 && filesOf(now, id) === 1 ? now.adrs.get(id) : undefined);
    if (!h) {
      add('hint', 'adr-changed', a.file, id, `${id} was ${a.status} and its file is gone: check that its decision is not lost; an ADR that no longer holds is superseded by a new ADR, not deleted`);
      continue;
    }
    const back = statusBack(a, h);
    const changed = h.body !== a.body && !linksAdded(a, h);
    if (back) add('hint', 'adr-changed', h.head ?? h.file, id, `${id}'s status changed from "${a.line}" to "${h.line}"${changed ? ', and its text changed' : ''}, but a status goes only forward: proposed, accepted, superseded by ADR-n; check that its decision is unchanged; if the decision changed, write a new ADR that supersedes it`);
    else if (changed) add('hint', 'adr-changed', h.head ?? h.file, id, `${id}'s text changed: check that its decision is unchanged; if the decision changed, write a new ADR that supersedes it`);
  }
  // Every ADR file, whatever its status (#4): a first line that is not a known
  // status, and a marker line that holds more than its ID, a kind and links.
  for (const a of now.adrList) {
    if (!a.known) add('hint', 'adr-status', `${a.file}:1`, a.id, `${a.id}'s first line is not a status that al knows: write "Status: proposed", "Status: accepted" or "Status: superseded by ADR-<n>" (or by a list, "ADR-11, ADR-12")`);
    for (const m of markerLines(a.text, now.kinds)) {
      const where = `${a.file}:${m.line}`;
      if (!m.extras) add('hint', 'adr-marker', where, m.id, `the marker line of ${m.id} is not a well-formed marker, so al does not read it: write "<!-- ${m.id} <kind> <links> -->" alone on the line; a page can show text after its -->`);
      else if (m.extras.length) add('hint', 'adr-marker', where, m.id, `the marker of ${m.id} holds more than its ID, a kind and links: ${m.extras.map((x) => `"${x}"`).join(', ')}; a page can show text that it hides`);
    }
  }
  for (const a of now.adrList) {
    if (!['proposed', 'accepted'].includes(a.status)) continue;
    const missing = ['source', 'decides'].filter((w) => !a.head?.links[w].length);
    if (missing.length) add('hint', 'adr-links', a.head ?? a.file, a.id, `${a.id} has ${missing.map((w) => `no ${w}:`).join(' and ')}; add the links to its marker`);
  }
  for (const a of now.adrList) {
    // ADR-n-k, a paragraph of ADR-n, names ADR-n (schema.md 5), once each.
    for (const old of new Set((a.head?.links.supersedes ?? []).map(adrOf).filter(Boolean))) {
      const o = now.adrs.get(old);
      if (o && o.status !== 'superseded') add('hint', 'adr-supersede', a.head, a.id, `${a.id} supersedes ${old}, whose status is ${o.status ?? 'missing'}; set it to superseded`);
      // The other direction of superseded-status (#31): the status line of
      // the superseded ADR names each ADR that supersedes it.
      else if (o && !o.by.includes(a.id)) add('hint', 'adr-supersede', a.head, a.id, `${a.id} supersedes ${old}, but the status line of ${old} leaves out ${a.id}: write "Status: superseded by ${[...o.by, a.id].join(', ')}"`);
    }
  }
  // Two files with one number, and an ADR folder with no ADR in it (adr-numbers/R1).
  for (const [id, a] of now.adrs) {
    const files = now.adrList.filter((x) => x.id === id).map((x) => x.file);
    if (files.length > 1) add('hint', 'adr-number', a.head ?? a.file, id, `${id} is the number of ${files.length} files: ${files.join(', ')}; al reads each one, and uses ${a.file}, the first in name order, where ${id} is named; give each ADR its own number`);
  }
  if (now.noAdrs) add('hint', 'adr-none', `${now.root}/adr`, '-', `${now.root}/adr holds Markdown files, but al reads none of them as an ADR, so no ADR check runs: an ADR file's name starts with its number and a dash, for example 001-<slug>.md`);
  for (const c of changes.filter((x) => !x.request)) {
    const p = c.head ?? c.base;
    const govern = [...now.adrs.values()].filter((a) => a.status === 'accepted'
      && ((a.head?.links.decides ?? []).includes(c.id) || p.links.governedBy.includes(a.id)));
    for (const a of govern) add('hint', 'adr-governs', p, c.id, `check that ${a.id} still holds`);
  }

  // The rules that block (#238): unsigned requirements, record evidence,
  // unreadable records and citations of superseded ADRs.
  recordBlocks(top, now, add);
  supersededBlocks(top, now, add);

  // Phrases for the review (issue-hints R2), and with --issues <folder> the
  // hints from the work items that the caller saved (issue-hints R1); without
  // it, no item is read and nothing is added.
  phraseFindings(top, now, phrases, add);
  if (issues) notKnown.push(...issueHints(top, now, phrases, add, issues));

  // Results (design.md 9): whether each one applies to the current text. The
  // commits they ran at are looked up in one batch.
  const results = loadResults(top);
  const ran = commitsOf(top, results.filter((res) => !res.problems.length && res.inputs.length && res.commit !== 'unknown').map((res) => res.commit));
  for (const res of results) {
    if (res.problems.length) {
      add('hint', 'result', res.file, res.check ?? '-', `not a valid result: ${res.problems.join('; ')}`);
      continue;
    }
    add('info', 'result', res.file, res.check, `${res.outcome} at ${res.commit === 'unknown' ? 'an unknown commit' : res.commit.slice(0, 7)}: ${applicability(top, res, ran)}`);
  }

  // Output repos (T12, design.md 12): their results, and each repo that cannot be read.
  const cross = crossResults(top);
  for (const repo of cross.repos) if (repo.unknown) add('info', 'output-repo', repo.name, '-', `unknown: ${repo.unknown}`);
  for (const res of cross.results) {
    add('info', 'result', `${res.repo}/${res.file}`, res.check ?? '-', `${res.outcome ?? 'no outcome'} at ${res.repo}@${String(res.resolved ?? res.commit ?? 'unknown').slice(0, 7)}: ${res.applies}`);
  }

  for (const id of notAdopted) {
    const p = now.spec.get(id);
    add('hint', 'adoption', p, id, `the adoption record names ${id}, but its text is not a paragraph of ${p.file} at the base, so it reads as a change`);
  }

  // Adopted paragraphs (D16): a disposition with `source: adoption` names the
  // spec paragraph and its captured hash; it stays adopted while its text is that.
  // Only a record whose text holds `source: adoption` is parsed for it.
  const adopted = new Set();
  for (const [id, hashes] of captured) if (!notAdopted.has(id) && now.spec.has(id) && hashes.has(now.spec.get(id).sha256)) adopted.add(id);

  return { findings, notKnown, adopted, now, was };
}

// Whether a result applies (design.md 9): never "applies", only what is known.
// `ran` holds the commits already looked up (commitsOf); with none, it looks.
export function applicability(top, res, ran = null) {
  if (!res.inputs.length) return 'applicability unknown: no declared inputs';
  if (res.commit === 'unknown') return 'applicability unknown: the commit is unknown';
  const commit = ran?.has(res.commit) ? ran.get(res.commit) : commitsOf(top, [res.commit]).get(res.commit);
  if (!commit) return `applicability unknown: commit ${res.commit} is not in this clone`;
  const changed = [];
  for (const x of res.inputs) {
    let bytes;
    try {
      bytes = read(top, String(x.file), null);
    } catch {
      bytes = null;
    }
    if (bytes === null) return `applicability unknown: the declared input ${x.file} is not there`;
    if (createHash('sha256').update(bytes).digest('hex') !== String(x.sha256)) changed.push(x.file);
  }
  if (changed.length) return `does not apply to the current text: ${changed.join(', ')} changed since ${res.commit.slice(0, 7)}`;
  return `declared inputs unchanged since ${res.commit.slice(0, 7)} (that they are complete is a claim)`;
}

// The spec IDs that a disposition with `source: adoption` names, each with
// the text hashes it was captured with.
function adoptionEntries(state) {
  const named = new Map();
  for (const r of state.requests.values()) {
    if (!r.mayAdopt) continue;
    for (const d of Array.isArray(r.data?.dispositions) ? r.data.dispositions : []) {
      if (d?.source !== 'adoption' || !d.spec) continue;
      if (!named.has(d.spec)) named.set(d.spec, new Set());
      named.get(d.spec).add(d.spec_sha256);
    }
  }
  return named;
}

const REQUEST_FILE = /^requests\/(?:archive\/)?([^/]+)\/spec\.md$/;
const requestOfFile = (file) => REQUEST_FILE.exec(file)?.[1] ?? null;
