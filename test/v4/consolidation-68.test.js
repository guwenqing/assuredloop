// #68: the consolidation judgement and its line in the map
// (requests/light-design/request.md v4/R5 version 2, signed; spec LD-55,
// LD-59, LD-60, LD-61, LD-27, LD-65, LD-28, LD-66, LD-37). Written from the
// requirement and the public interface only. The map's spec and link lines
// are in map-68.test.js.
//
// - A consolidation judgement is an ordinary judgement of LD-65 in
//   requests/<name>/review.md, with at least one Spec line:
//     - SP-1 and SP-2 complies: <reason>
//       - Item (SP-1): "<quote>"
//       - Item (SP-2): "<quote>"
//       - Spec (INV-41): "<quote>"
//       - Spec (INV-13, base): "<quote>"
//   The first line may name several IDs, joined by ", " or " and ". With one
//   item, `Item: "<quote>"` stays. A Spec quote is checked against the spec
//   paragraph's text at the head, or at the base with `, base`. The review
//   section's judgement line adds `spec quote found (<ID>)` or
//   `spec quote not found (<ID>)` for each Spec line, in note order.
// - `al index` keeps the version of each paragraph that the judgement names
//   (its items and its Spec IDs). The map judges the consolidation judgement
//   by those versions only.
// - The map, for each own change paragraph that goes into specs/ (a promise
//   kind, component, interface, data, flow, choice, rationale, example,
//   open; not approach, plan, step, migration, note), for each consolidation
//   judgement whose items name it:
//     map consolidation <name>/<CID> · <change spec file>:<line> · <fact>
//   <fact>:
//     current: its named paragraphs are unchanged (judgement <note>:<line>, <verdict>)
//     stale: <ID>[, <ID>] changed since it was judged (judgement <note>:<line>, <verdict>)
//     not known: identity not kept: run al index (judgement <note>:<line>, <verdict>)
//     not known when judged (judgement <note>:<line>, <verdict>)
//   or `none` when no consolidation judgement names it. Lines with the same
//   fact are grouped:
//     map consolidation · <n> change paragraphs · <fact>: <name>/<CID> (<place>), ...
// - `hint map-consolidation <change spec file> <name> ...`: one per own
//   request, naming each change paragraph that goes into specs/ and has no
//   current consolidation judgement.
// - `al conclude <name>` prints the map hints (map-unnamed, map-consolidation)
//   before it closes, refuses or previews, and never refuses on them.
//   Today's dispositions and exact-text rule still apply.
//
// A place may be the marker line or the first line of the text (the
// interface says only "<file>:<line>"). The ID in a stale fact may be bare
// (SP-1) or named (share/SP-1). No model and no network. Nothing here reads
// src/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commitAll, editFile, editRecord, exists, git, index, write } from './helpers/project.js';
import { conclude } from './helpers/views.js';
import {
  CS, NAME, SPEC, T13, T41, addSpec, assertSpec, check, consolidationHint, editSpec, entries, entry, judged,
  judgementAt, jref, mapHints, mapLines, noConsolidationHint, noEntry, noUnnamedHint, note, parts, places,
  placed, removeSpec, show, staleBase, unnamedHint, world,
} from './helpers/map-68.js';

const N41 = 'The export link MUST expire 24 hours after it is created.';
const N41b = 'The export link MUST expire 48 hours after it is created.';
const N42 = 'The email MUST hold the link and no file.';
const PLAN = ['SP-9 plan', 'One PR: the link, then the email.'];

const fact = (kind, dir, first, verdict = 'complies') => `${kind} (${jref(dir, first)}, ${verdict})`;
const current = (dir, first, verdict) => fact('current: its named paragraphs are unchanged', dir, first, verdict);
const notKept = (dir, first, verdict) => fact('not known: identity not kept: run al index', dir, first, verdict);
// A stale fact that names `ids` (each bare or with "share/").
function assertStale(r, e, dir, first, ids, verdict = 'complies') {
  const names = ids.map((id) => `(?:${NAME}/)?${id}`).join(', ');
  const tail = `(${jref(dir, first)}, ${verdict})`.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  assert.match(e.fact, new RegExp(`^stale: ${names} changed since it was judged ${tail}$`), `${e.line}\n${show(r)}`);
}

const consolidation = (r, cid) => entry(r, 'consolidation', `${NAME}/${cid}`);

// =====================================================================
// One piece split into two spec paragraphs; two pieces joined into one (LD-59)

test('#68 split: one change paragraph into INV-41 and INV-42: one judgement with one item and two Spec lines; both quotes found; the map says current for the item', (t) => {
  const dir = world(t, [['SP-1 rule serves:R1 changes:INV-41', 'A shared export link lives for 24 hours; the email carries only the link.'], PLAN]);
  editSpec(dir, 'INV-41', 'rule', T41, N41);
  addSpec(dir, 'INV-42 rule serves:share/R1', N42);
  const first = 'SP-1 complies: one shared link that lives 24 hours, now in INV-41 and INV-42.';
  note(dir, judged(first,
    'Item: "A shared export link lives for 24 hours"',
    `Spec (INV-41): "${N41}"`,
    `Spec (INV-42): "${N42}"`));
  index(dir);
  commitAll(dir, `${NAME}: INV-41 and INV-42, and the review`);
  const r = check(dir);

  const ps = parts(judgementAt(r, dir, first));
  const a = ps.indexOf('spec quote found (INV-41)');
  const b = ps.indexOf('spec quote found (INV-42)');
  assert.ok(a > 0 && b > a, `spec quote found (INV-41), then (INV-42):\n${show(r)}`);

  const e = consolidation(r, 'SP-1');
  placed(r, e, places(dir, CS, 'SP-1'));
  assert.equal(e.fact, current(dir, first), show(r));
  noEntry(r, 'consolidation', `${NAME}/SP-9`);
  assertSpec(r, 'INV-41', { what: 'changed', refs: ['share/SP-1 changes', jref(dir, first)], at: places(dir, SPEC, 'INV-41') });
  assertSpec(r, 'INV-42', { what: 'added', refs: [jref(dir, first)], at: places(dir, SPEC, 'INV-42') });
  noUnnamedHint(r, 'INV-41');
  noUnnamedHint(r, 'INV-42');
  noConsolidationHint(r);
});

test('#68 join: two change paragraphs into INV-41: one judgement "SP-1 and SP-2" with two named items and one Spec line; the quote is found; one grouped current line for both', (t) => {
  const dir = world(t, [
    ['SP-1 rule serves:R1 changes:INV-41', 'A shared export link lives for 24 hours.'],
    ['SP-2 rule serves:R1', 'The email carries only the link.'],
    PLAN,
  ]);
  const J = 'The export link MUST expire 24 hours after it is created, and the email MUST hold the link and no file.';
  editSpec(dir, 'INV-41', 'rule', T41, J);
  const first = 'SP-1 and SP-2 complies: the link and the email are one rule now, INV-41.';
  note(dir, judged(first,
    'Item (SP-1): "lives for 24 hours"',
    'Item (SP-2): "the email carries only the link"',
    `Spec (INV-41): "${J}"`));
  index(dir);
  commitAll(dir, `${NAME}: INV-41 joined, and the review`);
  const r = check(dir);

  assert.ok(parts(judgementAt(r, dir, first)).includes('spec quote found (INV-41)'), show(r));
  const one = consolidation(r, 'SP-1');
  const two = consolidation(r, 'SP-2');
  assert.equal(one.fact, current(dir, first), show(r));
  assert.equal(two.fact, current(dir, first), show(r));
  assert.ok(one.grouped && two.grouped && one.line === two.line, `one grouped line for SP-1 and SP-2:\n${show(r)}`);
  placed(r, one, places(dir, CS, 'SP-1'));
  placed(r, two, places(dir, CS, 'SP-2'));
  noConsolidationHint(r);
});

test('#68 Spec quotes: not found at the head; found at the base with ", base" for a removed paragraph; not found at the head for it; in note order', (t) => {
  const dir = world(t, [
    ['SP-1 rule serves:R1 changes:INV-41', 'A shared export link lives for 24 hours.'],
    ['SP-3 limit serves:R1 removes:INV-13', 'An invoice may have no line now.'],
    PLAN,
  ]);
  editSpec(dir, 'INV-41', 'rule', T41, N41);
  removeSpec(dir, 'INV-13', T13);
  const first = 'SP-1, SP-3 complies: INV-41 lives 24 hours and INV-13 is gone.';
  note(dir, judged(first,
    'Item (SP-1): "lives for 24 hours"',
    'Item (SP-3): "may have no line now"',
    'Spec (INV-41): "MUST expire 48 hours after it is created"',
    `Spec (INV-13, base): "${T13}"`,
    `Spec (INV-13): "${T13}"`));
  const r = check(dir);
  const ps = parts(judgementAt(r, dir, first));
  const i = ps.indexOf('spec quote not found (INV-41)');
  const j = ps.findIndex((p) => /^spec quote found \(INV-13(, base)?\)$/.test(p));
  const k = ps.findIndex((p, x) => x > j && p === 'spec quote not found (INV-13)');
  assert.ok(i > 0, `spec quote not found (INV-41):\n${show(r)}`);
  assert.ok(j > i, `then the base quote of INV-13 found:\n${show(r)}`);
  assert.ok(k > j, `then the head quote of INV-13 not found:\n${show(r)}`);
});

// =====================================================================
// Current, then stale (LD-59, LD-61)

test('#68 a judgement before al index is "not known: identity not kept"; after al index current; a rewrite of INV-41 by the same change makes it stale and names INV-41; al index keeps it stale', (t) => {
  const dir = world(t, [['SP-1 rule serves:R1 changes:INV-41', 'A shared export link lives for 24 hours.'], PLAN]);
  editSpec(dir, 'INV-41', 'rule', T41, N41);
  commitAll(dir, `${NAME}: INV-41 lives 24 hours`);
  const first = 'SP-1 complies: the link lives 24 hours, now in INV-41.';
  note(dir, judged(first, 'Item: "lives for 24 hours"', `Spec (INV-41): "${N41}"`));

  let r = check(dir);
  assert.equal(consolidation(r, 'SP-1').fact, notKept(dir, first), show(r));
  consolidationHint(r, { ids: ['SP-1'], all: ['SP-1', 'SP-9'] });

  index(dir);
  r = check(dir);
  assert.equal(consolidation(r, 'SP-1').fact, current(dir, first), show(r));
  noConsolidationHint(r);
  commitAll(dir, `${NAME}: the review`);
  r = check(dir);
  assert.equal(consolidation(r, 'SP-1').fact, current(dir, first), `a commit of the note and the records keeps it current:\n${show(r)}`);

  // The same change rewrites INV-41 again.
  editSpec(dir, 'INV-41', 'rule', N41, N41b);
  r = check(dir);
  assertStale(r, consolidation(r, 'SP-1'), dir, first, ['INV-41']);
  consolidationHint(r, { ids: ['SP-1'], all: ['SP-1', 'SP-9'] });
  index(dir);
  commitAll(dir, `${NAME}: INV-41 lives 48 hours`);
  r = check(dir);
  assertStale(r, consolidation(r, 'SP-1'), dir, first, ['INV-41']);
  consolidationHint(r, { ids: ['SP-1'], all: ['SP-1', 'SP-9'] });
});

test('#68 a judgement goes stale when a change paragraph that it names changes; the stale fact names that paragraph', (t) => {
  const dir = world(t, [['SP-1 rule serves:R1 changes:INV-41', 'A shared export link lives for 24 hours.'], PLAN]);
  editSpec(dir, 'INV-41', 'rule', T41, N41);
  const first = 'SP-1 complies: the link lives 24 hours, now in INV-41.';
  note(dir, judged(first, 'Item: "lives for 24 hours"', `Spec (INV-41): "${N41}"`));
  index(dir);
  commitAll(dir, `${NAME}: INV-41 and the review`);
  assert.equal(consolidation(check(dir), 'SP-1').fact, current(dir, first), 'control: current');
  editFile(dir, CS, 'A shared export link lives for 24 hours.', 'A shared export link lives for 24 hours from its creation.');
  index(dir);
  const r = check(dir);
  assertStale(r, consolidation(r, 'SP-1'), dir, first, ['SP-1']);
  consolidationHint(r, { ids: ['SP-1'], all: ['SP-1', 'SP-9'] });
});

test('#68 a judgement goes stale after a rewrite by other work: the first PR merges, main edits INV-41 again, a new branch of the same request: stale, naming INV-41; and stale-base', (t) => {
  const dir = world(t, [['SP-1 rule serves:R1 changes:INV-41', 'A shared export link lives for 24 hours.'], PLAN]);
  editSpec(dir, 'INV-41', 'rule', T41, N41);
  const first = 'SP-1 complies: the link lives 24 hours, now in INV-41.';
  note(dir, judged(first, 'Item: "lives for 24 hours"', `Spec (INV-41): "${N41}"`));
  index(dir);
  commitAll(dir, `${NAME}: INV-41 and the review`);
  let r = check(dir);
  assert.equal(consolidation(r, 'SP-1').fact, current(dir, first), 'control: current on the first branch');
  assert.deepEqual(staleBase(r, 'share/SP-1', 'changes', 'INV-41'), [], `the own consolidation gives no stale-base:\n${show(r)}`);

  git(dir, 'checkout', '-q', 'main');
  git(dir, 'merge', '-q', '--no-ff', '-m', `Merge ${NAME} part 1`, 'feature');
  editSpec(dir, 'INV-41', 'rule', N41, N41b);
  index(dir);
  commitAll(dir, 'other work: INV-41 lives 48 hours');
  git(dir, 'checkout', '-q', '-b', 'feature-2');
  write(dir, 'src/share.js', 'export const hours = 48;\n');
  commitAll(dir, `${NAME}: part 2`);

  r = check(dir);
  assertStale(r, consolidation(r, 'SP-1'), dir, first, ['INV-41']);
  consolidationHint(r, { ids: ['SP-1'], all: ['SP-1', 'SP-9'] });
  assert.equal(staleBase(r, 'share/SP-1', 'changes', 'INV-41').length, 1, `the later edit by other work gives stale-base:\n${show(r)}`);
});

// =====================================================================
// Grouping and the kinds that go into specs/ (LD-15, LD-55)

const groupedForms = (noun, f, items) => [0, 1].map((k) =>
  `map consolidation · ${items.length} ${noun} · ${f}: ${items.map(([id, at]) => `${id} (${at[k]})`).join(', ')}`);

test('#68 grouping: three change paragraphs with no judgement are one "none" line; a judgement of two items gives one grouped current line and leaves the third "none"; "SP-1, SP-2 and SP-3" names all three; approach, plan and note get no line', (t) => {
  const dir = world(t, [
    ['SP-1 rule serves:R1 changes:INV-41', 'A shared export link lives for 24 hours.'],
    ['SP-2 data serves:R1 changes:INV-12', 'An invoice names its currency.'],
    ['SP-3 rationale explains:SP-1', 'A day is enough to open the email.'],
    ['SP-4 approach serves:R1', 'Build the link first.'],
    ['SP-5 note', 'Written for the first PR.'],
    PLAN,
  ]);
  const at = (cid) => places(dir, CS, cid);
  const ALL = ['SP-1', 'SP-2', 'SP-3', 'SP-4', 'SP-5', 'SP-9'];

  let r = check(dir);
  let forms = groupedForms('change paragraphs', 'none', [['share/SP-1', at('SP-1')], ['share/SP-2', at('SP-2')], ['share/SP-3', at('SP-3')]]);
  assert.ok(mapLines(r).some((l) => forms.includes(l)), `one grouped "none" line, one of:\n${forms.join('\n')}\n${show(r)}`);
  for (const cid of ['SP-4', 'SP-5', 'SP-9']) noEntry(r, 'consolidation', `${NAME}/${cid}`);
  consolidationHint(r, { ids: ['SP-1', 'SP-2', 'SP-3'], all: ALL });

  // A judgement of SP-1 and SP-2.
  const first = 'SP-1 and SP-2 complies: the link rule and the currency are in INV-41 and INV-12.';
  note(dir, judged(first,
    'Item (SP-1): "lives for 24 hours"',
    'Item (SP-2): "names its currency"',
    `Spec (INV-41): "${T41}"`,
    'Spec (INV-12): "An invoice has a number"'));
  index(dir);
  r = check(dir);
  forms = groupedForms('change paragraphs', current(dir, first), [['share/SP-1', at('SP-1')], ['share/SP-2', at('SP-2')]]);
  assert.ok(mapLines(r).some((l) => forms.includes(l)), `one grouped current line, one of:\n${forms.join('\n')}\n${show(r)}`);
  const third = consolidation(r, 'SP-3');
  assert.equal(third.fact, 'none', show(r));
  assert.equal(third.grouped, false, show(r));
  placed(r, third, at('SP-3'));
  consolidationHint(r, { ids: ['SP-3'], all: ALL });

  // One judgement that names three items, joined by ", " and " and ".
  const all3 = 'SP-1, SP-2 and SP-3 complies: the link, the currency and the reason are in INV-41 and INV-12.';
  note(dir, judged(all3,
    'Item (SP-1): "lives for 24 hours"',
    'Item (SP-2): "names its currency"',
    'Item (SP-3): "A day is enough"',
    `Spec (INV-41): "${T41}"`,
    'Spec (INV-12): "An invoice has a number"'));
  index(dir);
  r = check(dir);
  forms = groupedForms('change paragraphs', current(dir, all3), [['share/SP-1', at('SP-1')], ['share/SP-2', at('SP-2')], ['share/SP-3', at('SP-3')]]);
  assert.ok(mapLines(r).some((l) => forms.includes(l)), `one grouped current line for three, one of:\n${forms.join('\n')}\n${show(r)}`);
  assert.equal(entries(r).filter((e) => e.kind === 'consolidation').length, 3, show(r));
  noConsolidationHint(r);
});

// =====================================================================
// A judgement missing at close (LD-60): al conclude shows the hints and
// still concludes. Today's dispositions still apply.

const T50 = 'A shared export link MUST live for 24 hours.';

// share: SP-1 is in specs/ as INV-50 with the exact text, and its
// disposition is recorded; SP-9 is a plan. Indexed and committed.
function readyToClose(t) {
  const dir = world(t, [['SP-1 rule serves:R1', T50], PLAN]);
  addSpec(dir, 'INV-50 rule serves:share/R1', T50);
  editRecord(dir, NAME, (rec) => {
    rec.dispositions = [...(rec.dispositions ?? []), { source: `${NAME}/SP-1`, disposition: 'incorporated', spec: 'INV-50' }];
  });
  index(dir);
  commitAll(dir, `${NAME}: INV-50\n\nTier: 2 — ${NAME}; closes the request`);
  return dir;
}

test('#68 a judgement missing at close: al conclude prints hint map-consolidation (SP-1, not the plan) and hint map-unnamed INV-50, and still concludes; --yes concludes and archives', (t) => {
  const dir = readyToClose(t);
  const r = conclude(dir, NAME);
  assert.equal(r.code, 0, show(r));
  assert.equal(r.wrote, false, show(r));
  assert.deepEqual(r.refused, [], show(r));
  assert.match(r.stdout, new RegExp(`^Would conclude ${NAME}: `, 'm'), show(r));
  consolidationHint(r, { ids: ['SP-1'], all: ['SP-1', 'SP-9'] });
  unnamedHint(r, 'INV-50', places(dir, SPEC, 'INV-50'));

  const y = conclude(dir, NAME, '--yes');
  assert.equal(y.code, 0, show(y));
  assert.deepEqual(y.refused, [], show(y));
  consolidationHint(y, { ids: ['SP-1'], all: ['SP-1', 'SP-9'] });
  assert.ok(exists(dir, `requests/archive/${NAME}/request.md`), `the request is archived:\n${show(y)}`);
});

test('#68 at close with a current consolidation judgement: al conclude prints no map hint and would conclude', (t) => {
  const dir = readyToClose(t);
  const first = 'SP-1 complies: the link rule is INV-50.';
  note(dir, judged(first, 'Item: "MUST live for 24 hours"', `Spec (INV-50): "${T50}"`));
  index(dir);
  commitAll(dir, `${NAME}: the review`);
  const c = check(dir);
  assert.equal(consolidation(c, 'SP-1').fact, current(dir, first), show(c));
  const r = conclude(dir, NAME);
  assert.equal(r.code, 0, show(r));
  assert.match(r.stdout, new RegExp(`^Would conclude ${NAME}: `, 'm'), show(r));
  assert.deepEqual(mapHints(r), [], show(r));
});

// The stale fact names each changed ID: "<ID>, <ID>".
test('#68 a judgement that names two spec paragraphs, both rewritten: the stale fact names both', (t) => {
  const dir = world(t, [['SP-1 rule serves:R1 changes:INV-41', 'A shared export link lives for 24 hours; the email carries only the link.'], PLAN]);
  editSpec(dir, 'INV-41', 'rule', T41, N41);
  addSpec(dir, 'INV-42 rule serves:share/R1', N42);
  const first = 'SP-1 complies: split into INV-41 and INV-42.';
  note(dir, judged(first, 'Item: "lives for 24 hours"', `Spec (INV-41): "${N41}"`, `Spec (INV-42): "${N42}"`));
  index(dir);
  commitAll(dir, `${NAME}: split, and the review`);
  assert.equal(consolidation(check(dir), 'SP-1').fact, current(dir, first), 'control: current');
  editSpec(dir, 'INV-41', 'rule', N41, N41b);
  editFile(dir, SPEC, N42, 'The email MUST hold only the link.');
  const r = check(dir);
  const e = consolidation(r, 'SP-1');
  const m = /^stale: (.+) changed since it was judged \(/.exec(e.fact);
  assert.ok(m, `a stale fact:\n${e.line}\n${show(r)}`);
  assert.deepEqual(m[1].split(', ').sort(), ['INV-41', 'INV-42'], `both changed IDs are named:\n${e.line}\n${show(r)}`);
});
