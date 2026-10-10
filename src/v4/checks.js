// The checks that read records (T10; design.md 3-7 and 9, schema.md 5; the
// architect's answers for #179, decision D15). Each finding is
// { severity, code, file, line, id, message }: `not ok`, `hint` or `info`.
// They compare the working tree with the base (the merge-base with main) and
// read the records of the open requests. No AI, no network.
import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import { read } from './base.js';
import { judgeRequest } from './dispositions.js';
import { commitsOf, git } from './git.js';
import { diffParagraphs } from './ids.js';
import { crossResults } from './repos.js';
import { loadResults } from './results.js';
import {
  hasBaselineEffect, isPromise, loadState, named, qualify, requestOf, resolve, servesSigned,
} from './state.js';
import { NEAR, closeness, diffWords, marks, requirementWords, sentencesOf, showHunk } from './words.js';
import { blockHashes, groupOf } from './markers.js';

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

export function checks(top, { base, strict = false }) {
  const now = loadState(top);
  const was = base ? loadState(top, base) : null;
  const findings = [];
  const notKnown = [];
  const at = (p) => (p ? `${p.file}:${p.line}` : '-');
  const add = (severity, code, p, id, message) => findings.push({ severity, code, where: typeof p === 'string' ? p : at(p), id, message });
  const promise = (k) => isPromise(now, k);
  const open = [...now.requests.values()].filter((r) => r.open);
  // Adoption on the branch (D16, D19): a spec paragraph that is new at the
  // head is adopted text, not a change, when the adoption record names it with
  // its current hash and the same text is a block of its file at the base. An
  // adoption record cannot cover new text.
  const captured = adoptionEntries(now);
  const notAdopted = new Set();
  const atBase = new Map();
  const adoptedHere = (c) => {
    if (c.request || !c.head || c.base || !captured.get(c.id)?.has(c.head.sha256)) return false;
    const file = c.head.file;
    if (!atBase.has(file)) {
      const text = was.get(file);
      atBase.set(file, text == null ? new Set() : blockHashes(text, file));
    }
    return atBase.get(file).has(c.head.sha256);
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

  // Sign-off coverage (design.md 6): a promise change with no signed requirement that covers it.
  for (const c of changes.filter(isPromiseChange)) {
    if (typo.has(c.name)) continue;
    let covered;
    if (!c.head) {
      if (c.request) continue; // a change spec paragraph taken out is no promise change
      const removers = open.flatMap((r) => [...r.paras.values()].filter((p) => p.links.removes.includes(c.id)).map((p) => [r, p]));
      covered = removers.some(([r, p]) => servesSigned(now, p, r.name));
    } else {
      covered = servesSigned(now, c.head, c.request);
    }
    if (!covered) add('not ok', 'signoff-coverage', c.head ?? c.base, c.name, `a ${(c.head ?? c.base).kind} paragraph is ${changeWord(c)} with no signed requirement that covers it`);
  }

  // The path claim (design.md 7), and the typo claim's words (design.md 6).
  if (!base) notKnown.push('no base, so the path claim was not read');
  else if (!claim) {
    if (commits) add('hint', 'no-claim', '-', '-', `no Tier line in ${base.slice(0, 7)}..HEAD; add "Tier: <n> — <claim>" to a commit message`);
    notKnown.push(commits ? 'the path checks: no Tier line' : 'the path checks: no commit on this branch');
  } else if (claim.tier === '0') {
    for (const c of changes) {
      if (typo.has(c.name)) continue;
      if (isPromiseChange(c)) add('not ok', 'path-claim', c.head ?? c.base, c.name, `path 0, but a ${(c.head ?? c.base).kind} paragraph is ${changeWord(c)} with no typo claim`);
      else if (!c.request && ['design', 'informative'].includes(groupOf((c.head ?? c.base).kind, now.kinds))) {
        add('hint', 'path-claim', c.head ?? c.base, c.name, `path 0, but a ${(c.head ?? c.base).kind} paragraph is ${changeWord(c)}: path 1d or 2?`);
      }
    }
  } else if (claim.tier === '1d') {
    for (const c of changes) {
      const p = c.head ?? c.base;
      if (isPromiseChange(c)) add('not ok', 'path-claim', p, c.name, `path 1d, but a ${p.kind} paragraph is ${changeWord(c)}; 1d is for names and wording of design paragraphs`);
      else if (DESIGN.includes(p.kind) && (!c.head || !c.base)) add('not ok', 'path-claim', p, c.name, `path 1d, but a ${p.kind} paragraph is ${changeWord(c)}; 1d adds or removes no design paragraph`);
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

  // Requirement words in a non-promise kind (design.md 3).
  for (const c of changes) {
    const p = c.head;
    if (!p?.kind || promise(p.kind) || !c.changed) continue;
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
        else add('not ok', 'unresolved-link', p, who, `${ref}: no such ID${adr ? ` (in ${adr.id})` : ''}`);
      }
    }
  }

  // Bindings whose target changed since they were bound (design.md 4, 6).
  for (const r of open) {
    for (const b of Array.isArray(r.data?.bindings) ? r.data.bindings : []) {
      if (!b?.target || !b.holder || !b.target_sha256) continue;
      const t = qualify(String(b.target), null);
      if (t.cross) continue;
      const cur = resolve(now, t);
      if (!cur || !cur.sha || cur.sha === b.target_sha256) continue;
      // The holder's own change made the target what it is now: its disposition names that text.
      if ((Array.isArray(r.data?.dispositions) ? r.data.dispositions : []).some((d) => d?.source === b.holder && d.spec === b.target && d.spec_sha256 === cur.sha)) continue;
      // A superseded ADR's links are history (schema.md 5).
      if (now.adrs.get(String(b.holder))?.status === 'superseded') continue;
      const hq = qualify(String(b.holder), null);
      const hp = hq.req ? now.requests.get(hq.req)?.paras.get(hq.id) : now.spec.get(hq.id);
      const msg = /^[RQ]\d+$/.test(t.id ?? '')
        ? `${b.target} changed after this paragraph was linked to it. Check that it still ${b.link} ${t.id}, then al-v4 index --align ${b.holder}`
        : `${b.link} ${b.target}, which changed since it was bound. Align it: check it, then al-v4 index --align ${b.holder}`;
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
      if (!j.valid) add(strict ? 'not ok' : 'hint', 'disposition', j.p, j.id, `${j.status} is not valid: ${j.reason}`);
      for (const n of j.notes) add(n.startsWith('near-match') ? 'hint' : 'info', n.startsWith('near-match') ? 'near-match' : 'disposition', j.p, j.id, n.replace(/^near-match /, ''));
    }
    const pending = judged.filter((j) => j.status === 'pending').map((j) => j.p.id);
    if (pending.length) add('info', 'disposition-pending', r.specFile, r.name, `${pending.length} of ${judged.length} paragraphs with a baseline effect have no disposition for their current version: ${pending.join(', ')}`);
  }

  // ADRs (schema.md 5).
  for (const [id, a] of was?.adrs ?? []) {
    if (!['accepted', 'superseded'].includes(a.status)) continue;
    const h = now.adrs.get(id);
    if (!h) add('not ok', 'adr-changed', a.file, id, `${id} was ${a.status} and its file is gone; an ADR is superseded, never edited or deleted`);
    else if (h.body !== a.body) add('not ok', 'adr-changed', h.head ?? h.file, id, `the text of ${id} changed after it was accepted; write a new ADR that supersedes it`);
  }
  for (const a of now.adrs.values()) {
    for (const old of a.head?.links.supersedes ?? []) {
      const o = now.adrs.get(old);
      if (o && o.status !== 'superseded') add('hint', 'adr-supersede', a.head, a.id, `${a.id} supersedes ${old}, whose status is ${o.status ?? 'missing'}; set it to superseded`);
    }
  }
  for (const c of changes.filter((x) => !x.request)) {
    const p = c.head ?? c.base;
    const govern = [...now.adrs.values()].filter((a) => a.status === 'accepted'
      && ((a.head?.links.decides ?? []).includes(c.id) || p.links.governedBy.includes(a.id)));
    for (const a of govern) add('hint', 'adr-governs', p, c.id, `check that ${a.id} still holds`);
  }

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

  return { findings, notKnown, adopted };
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
