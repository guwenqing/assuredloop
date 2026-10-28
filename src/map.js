// The map of a change (light-design LD-56, LD-61, LD-60; light-resign/R5):
// one section of al check, after the review section, for each open request
// of the change's own that is of path 2 or 3. From facts only: each spec
// paragraph that the branch added, changed or removed, with the change
// paragraphs and consolidation judgements that name it; each `changes` or
// `removes` link of an own change paragraph, with the state of its target
// since the link; and each own change paragraph that goes into specs/, with
// its consolidation judgement (LD-59). al compares no text with text. The
// two hints never refuse and change no exit code. al index keeps, by
// itself, the version that the change's own branch gave a named paragraph
// (keepOwnEdits); no person and no AI writes or reads it.
import { now, stamp } from './base.js';
import { consolidations, notePath } from './evidence.js';
import { ownRequests, textLine } from './inforce.js';
import { append } from './records.js';
import { fileAt, git, shallowCommits } from './git.js';
import { parseMarkdown } from './markers.js';
import { paragraphDetails } from './views.js';
import { hasBaselineEffect, loadState, qualify } from './state.js';

const list = (x) => (Array.isArray(x) ? x : []);
const LINKS = [['changes', 'changes'], ['removes', 'removes'], ['buildsOn', 'builds-on']];
const NOUN = { spec: 'spec paragraphs', link: 'links', consolidation: 'change paragraphs' };

// The own requests that have a map: not a spike, and not of path 0, 1 or 1d.
export const mapped = (own) => own.filter((r) => !r.spike && !['0', '1', '1d'].includes(r.tier));

// The spec paragraphs that paragraph `p` of request `r` names by link word
// `key`, in `state`, as { id, key }: `key` is the target as its binding holds
// it. In the central repo, `central:X` is its own X (DES-69).
const specRefs = (state, r, p, key) => p.links[key].flatMap((ref) => {
  const central = Array.isArray(state.config?.outputs) && state.config.outputs.length > 0;
  const t = qualify(central && ref.startsWith('central:') ? ref.slice('central:'.length) : ref, r.name, new Set(r.paras.keys()));
  return t.cross || t.req ? [] : [{ id: t.id, key: ref }];
});

// The latest version that al kept of spec paragraph `id` from the own branch
// of request `r` (LD-61), or null.
export const ownEdit = (r, id) => list(r.data?.own_edits).filter((e) => e?.paragraph === id).at(-1)?.sha256 ?? null;

// The `changes` and `removes` links of each change paragraph of request `r`,
// and the state of each target since the link: its binding holds the version
// that it had when the change first linked it (LD-61). Read by the map and by
// the close rule of al conclude (LD-57). `was` is the base state, or null.
// Returns [{ q, word, id, at, fact }].
export function linkStates(state, was, r) {
  const text = state.docs.find((d) => d.path === r.specFile)?.text ?? '';
  const out = [];
  for (const q of r.paras.values()) {
    for (const [key, word] of LINKS.slice(0, 2)) {
      for (const { id, key: target } of specRefs(state, r, q, key)) {
        const b = list(r.data?.bindings).find((x) => x?.holder === `${r.name}/${q.id}` && x.link === word && x.target === target);
        const cur = state.spec.get(id);
        const fact = !cur ? (b || was?.spec.has(id) ? 'removed' : 'not known: no such spec paragraph')
          : !b?.target_sha256 ? 'not known: the link has no binding (run al index)'
            : cur.sha256 === b.target_sha256 ? 'unchanged since the link' : 'changed since the link';
        out.push({ q, word, id, at: `${r.specFile}:${textLine(text, q)}`, fact });
      }
    }
  }
  return out;
}

// The map. `changes` are the branch's paragraph changes (branchOf); `none`
// the reason that no change is selected, or null. Returns { body, findings },
// and `ran: false` when there is no map, so its two hints were not checked.
export function mapSection(top, { now: state, was, base, own, changes, config, issues = null, none = null, paragraphs = [], full = false }) {
  const paras = paragraphLines(state, was, paragraphs, full);
  if (none) return { body: [`map: no change selected: ${none}`, ...paras], findings: [], ran: false };
  const rs = mapped(own);
  if (!rs.length) return { body: ['map: no open change of path 2 or 3 is this change\'s own', ...paras], findings: [], ran: false };
  const findings = [];
  const names = new Set(rs.map((r) => r.name));
  const judged = new Map(rs.map((r) => [r.name, consolidations(top, state, r, { config, issues, was })]));
  const place = (s, p) => `${p.file}:${textLine(s.docs.find((d) => d.path === p.file)?.text ?? '', p)}`;
  const entries = [];

  // 1. The spec paragraphs that the branch added, changed or removed.
  for (const c of changes.filter((x) => !x.request)) {
    const what = c.changes.includes('New') ? 'added' : c.changes.includes('Removed') ? 'removed' : 'changed';
    const refs = [];
    let named = false;
    for (const r of rs) {
      for (const q of r.paras.values()) {
        for (const [key, word] of LINKS) {
          if (!specRefs(state, r, q, key).some((x) => x.id === c.id)) continue;
          refs.push(`${r.name}/${q.id} ${word}`);
          if (key !== 'buildsOn') named = true;
        }
      }
      for (const j of judged.get(r.name)) if (j.specs.has(c.id)) { refs.push(j.at); named = true; }
    }
    const proposals = [];
    for (const r of [...state.requests.values()].filter((x) => x.open && !names.has(x.name))) {
      for (const q of r.paras.values()) {
        for (const [key, word] of LINKS.slice(0, 2)) if (specRefs(state, r, q, key).some((x) => x.id === c.id)) proposals.push(`${r.name}/${q.id} ${word} it`);
      }
    }
    const at = c.head ? place(state, c.head) : place(was, c.base);
    entries.push({ kind: 'spec', id: c.id, at, fact: `${what}; named by ${refs.length ? refs.join(', ') : 'no change paragraph'}${proposals.length ? `; open proposal: ${proposals.join(', ')}` : ''}` });
    if (!named) {
      findings.push({
        severity: 'hint', code: 'map-unnamed', where: at, id: c.id,
        message: `the branch ${what} this spec paragraph, and no change paragraph of ${[...names].join(', ')} names it by changes or removes, and no consolidation judgement names it: add the link, or judge its consolidation in the review note`,
      });
    }
  }

  // 2. The changes and removes links of the own change paragraphs, and the
  // state of each target since the link (linkStates).
  for (const r of rs) {
    for (const l of linkStates(state, was, r)) entries.push({ kind: 'link', id: `${r.name}/${l.q.id} ${l.word} ${l.id}`, at: l.at, fact: l.fact });
  }

  // 3. Each own change paragraph that goes into specs/, with each
  // consolidation judgement that names it, or none (LD-59).
  for (const r of rs) {
    const text = state.docs.find((d) => d.path === r.specFile)?.text ?? '';
    const missing = [];
    for (const q of [...r.paras.values()].filter((x) => hasBaselineEffect(state, x.kind))) {
      const at = `${r.specFile}:${textLine(text, q)}`;
      const js = judged.get(r.name).filter((j) => j.covers.has(q.id));
      for (const j of js) entries.push({ kind: 'consolidation', id: `${r.name}/${q.id}`, at, fact: j.fact });
      if (!js.length) entries.push({ kind: 'consolidation', id: `${r.name}/${q.id}`, at, fact: 'none' });
      if (!js.some((j) => j.current)) missing.push(q.id);
    }
    if (missing.length) {
      findings.push({
        severity: 'hint', code: 'map-consolidation', where: r.specFile, id: r.name, request: r.name,
        message: `${missing.length} change paragraphs that go into specs/ have no current consolidation judgement: ${missing.join(', ')}; judge each consolidation in ${notePath(r)}`,
      });
    }
  }

  const base7 = base.slice(0, 7);
  return { body: [`map: the change against its base ${base7} (own changes: ${rs.map((r) => r.name).join(', ')}), from facts only`, ...paras, ...grouped(entries)], findings };
}

// The paragraphs that the branch changed, in the spec, the open change
// specs and the ADRs, each with its place, kind and change (LD-63): one
// line each, and one line for two or more of the same change. With --full,
// each has its own line, and under it what the review view showed.
function paragraphLines(state, was, paragraphs, full) {
  const one = (c) => `map paragraph ${c.id} · ${c.at} · ${c.kind} · ${c.change}`;
  if (full) return paragraphs.flatMap((c) => [one(c), ...paragraphDetails(state, was, c.request, c.p)]);
  const by = new Map();
  for (const c of paragraphs) by.set(c.change, [...(by.get(c.change) ?? []), c]);
  return [...by].map(([change, cs]) => (cs.length < 2 ? one(cs[0])
    : `map paragraph · ${cs.length} paragraphs · ${change}: ${cs.map((c) => `${c.id} ${c.kind} (${c.at})`).join(', ')}`));
}

// One line for each entry; two or more entries of one kind with the same
// fact are one line, at the place of the first, naming each ID and place.
function grouped(entries) {
  const key = (e) => `${e.kind}\0${e.fact}`;
  const count = new Map();
  for (const e of entries) count.set(key(e), (count.get(key(e)) ?? 0) + 1);
  const done = new Set();
  const out = [];
  for (const e of entries) {
    const k = key(e);
    if (count.get(k) < 2) { out.push(`map ${e.kind} ${e.id} · ${e.at} · ${e.fact}`); continue; }
    if (done.has(k)) continue;
    done.add(k);
    const all = entries.filter((x) => key(x) === k);
    out.push(`map ${e.kind} · ${all.length} ${NOUN[e.kind]} · ${e.fact}: ${all.map((x) => `${x.id} (${x.at})`).join(', ')}`);
  }
  return out;
}

// al index: keeps the version that the change's own branch gave each spec
// paragraph that an own change paragraph names by `changes` or `removes`
// (LD-61): the paragraph differs from the base, and its latest kept version
// is another. A later edit by other work then gives the parallel-work hint
// (stale-base); the change's own consolidation does not. The version is the
// paragraph's text in the working tree when the tree changes it against
// HEAD; else its text at the latest commit of base..HEAD that is not a merge
// and that changed it. A merge commit, which may hold other work's edit,
// gives none, and so does a commit where a shallow clone's history is cut.
// Returns the lines for the output.
export function keepOwnEdits(top, recs, base) {
  if (!base) return [];
  const state = loadState(top);
  const was = loadState(top, base);
  const head = git(top, ['rev-parse', '--verify', '--quiet', 'HEAD'], { allowFail: true });
  const atHead = head ? loadState(top, head) : null;
  let shallow = null;
  const body = [];
  const kept = stamp(now());
  for (const r of ownRequests(top, state, base)) {
    const rec = recs.get(r.name);
    if (!rec) continue;
    const ids = new Set([...r.paras.values()].flatMap((q) => [...specRefs(state, r, q, 'changes'), ...specRefs(state, r, q, 'removes')].map((x) => x.id)));
    for (const id of ids) {
      const cur = state.spec.get(id);
      if (!cur || was.spec.get(id)?.sha256 === cur.sha256) continue;
      let sha = cur.sha256;
      if (atHead?.spec.get(id)?.sha256 === cur.sha256) {
        shallow ??= shallowCommits(top);
        sha = branchEdit(top, base, cur.file, id, shallow);
        if (!sha) continue;
      }
      if (list(rec.data.own_edits).filter((e) => e?.paragraph === id).at(-1)?.sha256 === sha) continue;
      append(rec, 'own_edits', { paragraph: id, sha256: sha, kept }, true);
      rec.changed = true;
      body.push(`kept: the version of ${id} that this change's branch gave it (${r.name})`);
    }
  }
  return body;
}

// The text hash of paragraph `id` of `file` at the latest commit of
// base..HEAD that is not a merge and that changed it, or null.
function branchEdit(top, base, file, id, shallow) {
  const commits = (git(top, ['rev-list', '--no-merges', `${base}..HEAD`, '--', file], { allowFail: true }) ?? '').split('\n').filter(Boolean);
  const textOf = (c) => {
    const text = fileAt(top, c, file);
    return text === null ? null : parseMarkdown(text, file).paragraphs.find((p) => p.id === id)?.sha256 ?? null;
  };
  for (const c of commits) {
    if (shallow.has(c)) return null;
    const now = textOf(c);
    if (now !== textOf(`${c}^`)) return now;
  }
  return null;
}
