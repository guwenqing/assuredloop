// Issue #91, request context-all, R1 (amends [VW-2] and [VW-6]): al context
// <name> MAY group repeated output but MUST NOT leave out a section; --all
// MUST show everything in full.
// Default view: when the held sections do not fit the one-line list form,
// the Spec line lists every one, grouped by state as "<count> <state>:
// <ids>", the groups joined by " · " in first-seen order, empty groups left
// out; a waiting block keeps "on <target>"; Dropped and Kept blocks group
// under dropped and kept. An archived request's Sections line groups the
// same way by what [VW-6] says of each section ("as at conclusion", "since
// changed by <request> (<date>)", "removed since conclusion", "history
// unavailable"). Within a group, IDs of one prefix that differ only in their
// last number and are consecutive collapse to "<first ID>–<last number>"
// (an en dash): REC-1–3, INV-3.1–3.2; gaps split runs; dotted and undotted
// IDs never share one; a block named with @n is listed on its own. The view
// stays at twelve lines or fewer.
// --all: Spec has one held section per line, "<ID or ID@n> <state>[ on/by
// <block>] (<R-lines>)", the first line labelled, the rest indented under
// it; Decided has one decision per line with its full text, newest first;
// every hint; an archived request's Sections has one section per line; no
// twelve-line cap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRepo, cloneRepo, runAl } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { DECISIONS, addRequest, both } from './helpers/request.js';
import { file } from './helpers/links.js';
import { viewHints } from './helpers/hints.js';
import { expanded, groups } from './helpers/grouped.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const V1 = 'requests/archive/assuredloop-v1';
const LABEL = /^(Spec|Sections|Decided|Require|Words|Parts|Hints?|Same file|Concluded|Followed by|Read|Next|Not known)\b/;

const ok = (r, what) => assert.equal(r.code, 0, `${what}:\n${both(r)}`);
function context(repo, name, ...args) {
  const r = runAl(repo.dir, ['context', name, ...args]);
  ok(r, `context ${name} ${args.join(' ')}`);
  return r.stdout;
}
// The lines above the frame (Read, Next, Not known).
const body = (out) => lines(out).filter((l) => !/^(Read|Next|Not known)\b/.test(l));
// [VW-2]'s twelve lines hold Read, Next and Not known too.
const assertCap = (out) => assert.ok(lines(out).length <= 12, `more than twelve lines, Read, Next and Not known included (${lines(out).length}):\n${out}`);

// The line starting with `label`.
function labelLine(out, label) {
  const line = lines(out).find((l) => new RegExp(`^${label}\\b`).test(l));
  assert.ok(line, `expected a line starting with ${label}:\n${out}`);
  return line;
}
// The block of `label`: its line, then the indented lines under it, each
// with the label or the indent taken off.
function labelBlock(out, label) {
  const ls = lines(out);
  const at = ls.findIndex((l) => new RegExp(`^${label}\\b`).test(l));
  assert.ok(at >= 0, `expected a line starting with ${label}:\n${out}`);
  const got = [ls[at].replace(new RegExp(`^${label}\\s+`), '')];
  for (const l of ls.slice(at + 1)) {
    if (!/^\s/.test(l) || LABEL.test(l)) break;
    got.push(l.trim());
  }
  return got;
}

const sorted = (xs) => [...xs].sort();

// --- an open request whose sections do not fit one line ---

const W = (id, h = '##') => `${h} [${id}] Rule ${id}\nRule ${id} holds.\n`;
const N = (id, h = '##') => `${h} [${id}] Rule ${id}\nRule ${id} MUST hold.\n`;
const N2 = (id) => `## [${id}] Rule ${id}\nRule ${id} MUST hold, always.\n`;
const modify = (id, h) => block(`[${id}]@1 modify   for R1`, { was: W(id, h), now: N(id, h) });

// Main: specs/rules.md; the signed request `grouped` (DECISIONS: D1-D4, D2 on
// two lines, the agent's) holding, in this order:
// REC-1, REC-2, REC-3 consolidated; REC-4 pending; REC-5 consolidated;
// SPC-1, SPC-2 pending; INV-3 consolidated; INV-3.1, INV-3.2 consolidated
// (### under INV-3); INV-8 added and Kept (D1, the owner's); INV-9 added and
// Dropped (D4), absent; VW-1@1 pending (Revised) and VW-1@2 waiting on it.
const CONSOLIDATED = ['REC-1', 'REC-2', 'REC-3', 'REC-5', 'INV-3', 'INV-3.1', 'INV-3.2'];
const PENDING = ['REC-4', 'SPC-1', 'SPC-2', 'VW-1@1'];
const EVERY = ['REC-1', 'REC-2', 'REC-3', 'REC-4', 'REC-5', 'SPC-1', 'SPC-2', 'INV-3', 'INV-3.1', 'INV-3.2', 'INV-8', 'INV-9', 'VW-1@1', 'VW-1@2'];
function grouped(t) {
  const repo = makeRepo(t);
  repo.write('specs/rules.md', file(
    N('REC-1'), N('REC-2'), N('REC-3'), W('REC-4'), N('REC-5'), W('SPC-1'), W('SPC-2'),
    N('INV-3'), N('INV-3.1', '###'), N('INV-3.2', '###'), N('INV-8'), W('VW-1')));
  addRequest(repo, 'grouped', [
    modify('REC-1'), modify('REC-2'), modify('REC-3'), modify('REC-4'), modify('REC-5'),
    modify('SPC-1'), modify('SPC-2'), modify('INV-3'), modify('INV-3.1', '###'), modify('INV-3.2', '###'),
    block('[INV-8]@1 add after [INV-3.2]   Kept 2026-09-26 (D1)   for R1', { now: N('INV-8') }),
    block('[INV-9]@1 add after [INV-8]   Dropped 2026-09-26 (D4)   for R1', { now: N('INV-9') }),
    block('[VW-1]@1 modify   Revised 2026-09-26 (D3)   for R1', { was: W('VW-1'), now: N('VW-1') }),
    block('[VW-1]@2 modify   for R1', { was: N('VW-1'), now: N2('VW-1') }),
  ]);
  repo.commit('Rules and the request', { date: '2026-09-27T12:00:00Z' });
  return repo;
}

test('#91 [VW-2] default view: the Spec line groups every held section by state, "<count> <state>: <ids>", in first-seen order: consolidated, pending, kept, dropped, waiting', (t) => {
  const out = context(grouped(t), 'grouped');
  assertFrame(out);
  const line = labelLine(out, 'Spec');
  const gs = groups(line, 'Spec');
  assert.deepEqual(gs.map((g) => g.state), ['consolidated', 'pending', 'kept', 'dropped', 'waiting'], `the groups, in first-seen order:\n${line}`);
  const by = expanded(gs, line);
  assert.deepEqual(sorted(by.consolidated), sorted(CONSOLIDATED), line);
  assert.deepEqual(sorted(by.pending), sorted(PENDING), line);
  assert.deepEqual(by.kept, ['INV-8'], line);
  assert.deepEqual(by.dropped, ['INV-9'], line);
  assert.deepEqual(by.waiting, ['VW-1@2'], line);
  assertCap(out);
});

test('#91 [VW-2] ranges: REC-1–3 and REC-5 (a gap splits the run), INV-3 apart from INV-3.1–3.2 (dotted and undotted never share one), SPC-1–2 beside REC-4 (each prefix its own runs), VW-1@1 on its own, never ranged', (t) => {
  const line = labelLine(context(grouped(t), 'grouped'), 'Spec');
  const gs = Object.fromEntries(groups(line, 'Spec').map((g) => [g.state, g.items]));
  assert.deepEqual(sorted(gs.consolidated), sorted(['REC-1–3', 'REC-5', 'INV-3', 'INV-3.1–3.2']), `consolidated:\n${line}`);
  assert.deepEqual(sorted(gs.pending), sorted(['REC-4', 'SPC-1–2', 'VW-1@1']), `pending:\n${line}`);
  assert.ok(line.includes('–'), `a range is written with an en dash:\n${line}`);
});

test('#91 [VW-2] a waiting block keeps what it waits on, the same request\'s prefix dropped: "1 waiting: VW-1@2 on VW-1@1"', (t) => {
  const line = labelLine(context(grouped(t), 'grouped'), 'Spec');
  assert.ok(line.includes('1 waiting: VW-1@2 on VW-1@1'), line);
});

test('#91 [VW-2] no section is left out: every ID --all shows one per line is in the grouped Spec line', (t) => {
  const repo = grouped(t);
  const line = labelLine(context(repo, 'grouped'), 'Spec');
  const shown = Object.values(expanded(groups(line, 'Spec'), line)).flat();
  const all = labelBlock(context(repo, 'grouped', '--all'), 'Spec').map((l) => l.split(' ')[0]);
  assert.deepEqual(sorted(all), sorted(EVERY), 'the fixture: --all lists every held section');
  assert.deepEqual(sorted(shown), sorted(all), `the grouped line should name every section:\n${line}`);
});

// --- --all ---

test('#91 [VW-2] --all: Spec has one held section per line, "<ID or ID@n> <state>[ on <block>] (R1)", the first labelled, the rest indented; no grouping', (t) => {
  const out = context(grouped(t), 'grouped', '--all');
  assertFrame(out);
  const ls = lines(out);
  const at = ls.findIndex((l) => /^Spec\b/.test(l));
  assert.ok(at >= 0, `expected a Spec line:\n${out}`);
  const spec = labelBlock(out, 'Spec');
  assert.equal(spec.length, EVERY.length, `one line per held section:\n${spec.join('\n')}`);
  ls.slice(at + 1, at + spec.length).forEach((l) => assert.match(l, /^\s+\S/, `the lines under Spec are indented:\n${out}`));
  const expected = {
    'REC-1': 'consolidated', 'REC-2': 'consolidated', 'REC-3': 'consolidated', 'REC-4': 'pending', 'REC-5': 'consolidated',
    'SPC-1': 'pending', 'SPC-2': 'pending', 'INV-3': 'consolidated', 'INV-3.1': 'consolidated', 'INV-3.2': 'consolidated',
    'INV-8': 'kept', 'INV-9': 'dropped', 'VW-1@1': 'pending', 'VW-1@2': 'waiting on VW-1@1',
  };
  for (const [id, state] of Object.entries(expected)) {
    assert.ok(spec.includes(`${id} ${state} (R1)`), `expected the line "${id} ${state} (R1)":\n${spec.join('\n')}`);
  }
  assert.doesNotMatch(spec.join('\n'), /(?:^|· )\d+ [a-z]|–/m, `--all neither counts nor ranges:\n${spec.join('\n')}`);
});

test('#91 [VW-2] --all: Decided has one decision per line with its full text as written, newest first; D2, written over two lines, on one', (t) => {
  const out = context(grouped(t), 'grouped', '--all');
  const entries = DECISIONS.split('\n- ').slice(1).map((e) => e.replace(/\n\s*/g, ' ').trim());
  assert.equal(entries.length, 4, 'the fixture: D1-D4');
  const decided = labelBlock(out, 'Decided');
  assert.deepEqual(decided, [...entries].reverse(), `each decision in full, newest first:\n${out}`);
});

// Every hint with --all is pinned by hints.test.js ("context <name> shows
// three of its request's hints … --all shows every one"); this fixture has none.
test('#91 [VW-2] --all is not held to twelve lines (one line per held section here gives more); the default view is', (t) => {
  const repo = grouped(t);
  const all = context(repo, 'grouped', '--all');
  assert.doesNotMatch(all, /more hidden/, `--all hides nothing:\n${all}`);
  assert.ok(body(all).length > 12, `--all lists each of the 14 held sections on its own line:\n${all}`);
  assertCap(context(repo, 'grouped'));
});

// --- the real assuredloop-v1, copied back as an open request onto an empty baseline ---

// The held blocks of the archived change.md: ID for an ID held by one block, ID@n otherwise.
function heldKeys() {
  const change = readFileSync(join(ROOT, V1, 'change.md'), 'utf8');
  const blocks = [...change.matchAll(/^### \[([A-Z][A-Z0-9]*-\d+(?:\.\d+)*)\]@(\d+)/gm)].map((m) => ({ id: m[1], n: m[2] }));
  const many = new Set(blocks.filter((b) => b.n !== '1').map((b) => b.id));
  return { ids: [...new Set(blocks.map((b) => b.id))], keys: blocks.map((b) => (many.has(b.id) ? `${b.id}@${b.n}` : b.id)) };
}

test('#91 [VW-2] real data: assuredloop-v1 as an open request on an empty baseline: the grouped Spec line names every held block (pending, and each @2 waiting on its @1), in twelve lines', (t) => {
  const { keys } = heldKeys();
  const repo = makeRepo(t);
  cpSync(join(ROOT, V1), join(repo.dir, 'requests/assuredloop-v1'), { recursive: true });
  const out = context(repo, 'assuredloop-v1');
  const line = labelLine(out, 'Spec');
  const gs = groups(line, 'Spec');
  assert.deepEqual(gs.map((g) => g.state), ['pending', 'waiting'], line);
  assert.deepEqual(sorted(Object.values(expanded(gs, line)).flat()), sorted(keys), `every held block named:\n${line}`);
  for (const w of gs[1].items) assert.match(w, /^([A-Z]+-\d+)@2 on \1@1$/, `a waiting block names its target: ${w}`);
  assertCap(out);
});

// --- an archived request: the real assuredloop-v1 ---

// The archive and specs/ committed on main (the concluding commit); then, by
// request ctx-x on 2026-09-29, a sentence added to [VW-2] and [TL-5] removed.
function archived(t) {
  const repo = makeRepo(t);
  cpSync(join(ROOT, V1), join(repo.dir, V1), { recursive: true });
  cpSync(join(ROOT, 'specs'), join(repo.dir, 'specs'), { recursive: true });
  repo.commit('Archive assuredloop-v1', { date: '2026-09-28T15:05:00Z' });
  const views = repo.read('specs/views.md').toString();
  const vw2 = views.match(/^## \[VW-2\][^\n]*\n[\s\S]*?(?=\n#+ |$(?![\s\S]))/m);
  assert.ok(vw2, 'the fixture: specs/views.md holds [VW-2]');
  repo.write('specs/views.md', views.replace(vw2[0], `${vw2[0]}\nIt names the request's tier.`));
  const tool = repo.read('specs/tool.md').toString();
  const tl5 = tool.match(/^## \[TL-5\][^\n]*\n[\s\S]*?(?=^#+ |$(?![\s\S]))/m);
  assert.ok(tl5, 'the fixture: specs/tool.md holds [TL-5]');
  repo.write('specs/tool.md', tool.replace(tl5[0], ''));
  repo.commit('ctx-x: the tier in context, and no TL-5\n\nRequest: ctx-x', { date: '2026-09-29T12:00:00Z' });
  return repo;
}
const AS_AT = ['REC-1–12', 'SPC-1–5', 'STA-1–8', 'VW-1', 'VW-3–9', 'LNK-1–4', 'HNT-1–3', 'TL-1–4'];

test('#91 [VW-6] real data, archived: the Sections line groups by what [VW-6] says: "44 as at conclusion: REC-1–12, …", then "1 since changed by ctx-x (2026-09-29): VW-2", then "1 removed since conclusion: TL-5"; in twelve lines', (t) => {
  const { ids } = heldKeys();
  const out = context(archived(t), 'assuredloop-v1');
  assertFrame(out);
  const line = labelLine(out, 'Sections');
  const gs = groups(line, 'Sections');
  assert.deepEqual(gs.map((g) => g.state), ['as at conclusion', 'since changed by ctx-x (2026-09-29)', 'removed since conclusion'], line);
  assert.deepEqual(gs[0].items, AS_AT, `the as-at-conclusion runs:\n${line}`);
  assert.deepEqual(gs[1].items, ['VW-2'], line);
  assert.deepEqual(gs[2].items, ['TL-5'], line);
  assert.deepEqual(sorted(Object.values(expanded(gs, line)).flat()), sorted(ids), `every section named:\n${line}`);
  assertCap(out);
});

test('#91 [VW-6] real data, archived, in a shallow clone that lacks the concluding commit: one group, "46 history unavailable", naming every section', (t) => {
  const { ids } = heldKeys();
  const clone = cloneRepo(t, archived(t), { depth: 1 });
  assert.equal(clone.git(['rev-list', '--count', 'HEAD']), '1', 'the fixture: the clone holds only the ctx-x commit');
  const r = runAl(clone.dir, ['context', 'assuredloop-v1']);
  ok(r, 'context in the shallow clone');
  const line = labelLine(r.stdout, 'Sections');
  const gs = groups(line, 'Sections');
  assert.equal(gs.length, 1, line);
  assert.match(gs[0].state, /history unavailable/, line);
  assert.deepEqual(sorted(Object.values(expanded(gs, line)).flat()), sorted(ids), `every section named:\n${line}`);
});

test('#91 [VW-6] real data, archived, --all: Sections has one section per line, "<ID> <what [VW-6] says>"', (t) => {
  const { ids } = heldKeys();
  const out = context(archived(t), 'assuredloop-v1', '--all');
  const sections = labelBlock(out, 'Sections');
  assert.equal(sections.length, ids.length, `one line per section:\n${sections.join('\n')}`);
  for (const id of ids) {
    const want = id === 'VW-2' ? 'since changed by ctx-x (2026-09-29)' : id === 'TL-5' ? 'removed since conclusion' : 'as at conclusion';
    assert.ok(sections.includes(`${id} ${want}`), `expected the line "${id} ${want}":\n${sections.join('\n')}`);
  }
});

test('#91 [VW-6] real data, archived, --all: Decided has every decision, D7 to D1, each with its full text as written', (t) => {
  const md = readFileSync(join(ROOT, V1, 'request.md'), 'utf8');
  const from = md.slice(md.indexOf('## Decisions'));
  const end = from.search(/\n## (?!Decisions)/);
  const entries = (end < 0 ? from : from.slice(0, end))
    .split('\n- ').slice(1).map((e) => e.replace(/\n\s*/g, ' ').trim());
  assert.equal(entries.length, 7, `the fixture: D1-D7:\n${entries.join('\n')}`);
  const decided = labelBlock(context(archived(t), 'assuredloop-v1', '--all'), 'Decided');
  assert.deepEqual(decided, [...entries].reverse());
});

// --- PR #92 review: a range expands back to the exact IDs ---

// Two IDs share a run only when the text before their last number is the
// same (INV-03 is not INV-3), their last numbers are consecutive, and each
// is written without leading zeros (INV-02 is not ranged with INV-1).
const RUN = [11, 12, 13, 14].map((n) => `INV-${n}`);
const CASES = {
  'INV-03.1 and INV-3.2: the text before the last number differs': [['INV-03.1', 'INV-3.2', ...RUN], ['INV-03.1', 'INV-3.2', 'INV-11–14']],
  'control, INV-03.1 and INV-03.2: the same text before it': [['INV-03.1', 'INV-03.2', ...RUN], ['INV-03.1–03.2', 'INV-11–14']],
  'INV-1 and INV-02: a leading zero in the last number': [['INV-1', 'INV-02', ...RUN], ['INV-1', 'INV-02', 'INV-11–14']],
};

// The signed request `zeros` holding a modify block for each of `ids`; the
// baseline has each "was" (pending), or, when `archived`, each "now", and
// the request is concluded with the tool and committed on main.
function zeros(t, ids, { archived = false } = {}) {
  const repo = makeRepo(t);
  repo.write('specs/rules.md', file(...ids.map((id) => (archived ? N(id) : W(id)))));
  addRequest(repo, 'zeros', ids.map((id) => modify(id)));
  repo.commit('zeros: request', { date: '2026-09-27T12:00:00Z' });
  if (archived) {
    ok(runAl(repo.dir, ['conclude', 'zeros', '--yes']), 'conclude');
    repo.commit('Conclude zeros\n\nRequest: zeros', { date: '2026-09-28T12:00:00Z' });
  }
  return repo;
}

for (const [label, [ids, items]] of Object.entries(CASES)) {
  test(`#91 PR #92 [VW-2] the open view's Spec line: ${label}; every ID expands back exactly`, (t) => {
    const line = labelLine(context(zeros(t, ids), 'zeros'), 'Spec');
    const gs = groups(line, 'Spec');
    assert.deepEqual(gs.map((g) => g.state), ['pending'], line);
    assert.deepEqual(sorted(gs[0].items), sorted(items), `the pending group:\n${line}`);
    assert.deepEqual(sorted(expanded(gs, line).pending), sorted(ids), `the IDs as written:\n${line}`);
  });

  test(`#91 PR #92 [VW-6] the archived view's Sections line: ${label}; every ID expands back exactly`, (t) => {
    const line = labelLine(context(zeros(t, ids, { archived: true }), 'zeros'), 'Sections');
    const gs = groups(line, 'Sections');
    assert.deepEqual(gs.map((g) => g.state), ['as at conclusion'], line);
    assert.deepEqual(sorted(gs[0].items), sorted(items), `the as-at-conclusion group:\n${line}`);
    assert.deepEqual(sorted(expanded(gs, line)['as at conclusion']), sorted(ids), `the IDs as written:\n${line}`);
  });
}
