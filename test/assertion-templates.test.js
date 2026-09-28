// Assertion calls in template literals and regex literals [LNK-3] [HNT-2]
// [REC-11]: in a supported JS/TS test file, a call inside a template
// literal's ${…} interpolation runs, so it is an assertion call; the text of
// a regex literal, and a template's plain text, never run, so they are not.
// A division is not a regex: a call after a "/" on the same line still
// counts. Adding a real call changes the count, lists the file among the
// tests whose assertions changed, and gives the assertion-change note;
// adding text that is not a call does none of these. (Re-review of #85,
// finding 1.) Acceptance C6.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo } from './helpers/fixture.js';
import { lineWith } from './helpers/request.js';
import { labelled } from './helpers/links.js';
import { check, checkHints, hint, message } from './helpers/hints.js';
import { assertNoVerdict, assertions } from './helpers/evidence.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const PATH = 'test/dates.test.js';

// A node:test file: one test, a setup line, then `body`.
const js = (body) => [
  "import { test } from 'node:test';",
  "import assert from 'node:assert/strict';",
  '',
  "test('dates', () => {",
  '  const dates = 3;',
  '  const total = 3;',
  ...body,
  '});',
].join('\n') + '\n';

// Main: the baseline, then PATH with one assertion call. The branch: PATH
// with `added` after it, in a commit with a tier-2 claim. Returns check --all.
const ONE = '  assert.equal(dates, 3);';
function branch(t, added) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  repo.commit('Baseline', { date: '2026-09-01T12:00:00Z' });
  repo.write(PATH, js([ONE]));
  repo.commit('Test the dates', { date: '2026-09-02T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write(PATH, js([ONE, added]));
  repo.commit(message('More in the dates test', { tier: '2 — tests' }), { date: '2026-09-03T12:00:00Z' });
  return check(repo, '--all');
}

function counts(out, a, b) {
  const block = labelled(out, 'Tests');
  assert.ok(block, `expected a line starting with Tests:\n${out}`);
  assertNoVerdict(block);
  assert.ok(lineWith(block, PATH, assertions(a, b)), `${PATH} should show ${a} → ${b} assertions:\n${block}`);
}
function evidence(out) {
  const e = labelled(out, 'Evidence');
  assert.ok(e, `expected a line starting with Evidence:\n${out}`);
  return e;
}
// The hint lines naming PATH that speak of assertions.
const assertionNotes = (out) => checkHints(out).filter((l) => l.includes(PATH) && /assert/i.test(l));

test('C6 [LNK-3][HNT-2][REC-11] a call inside a template literal\'s ${…} is an assertion call: 1 → 2, the file is among the tests whose assertions changed, and the note', (t) => {
  const out = branch(t, '  const label = `value: ${assert.equal(dates, 3)}`;');
  counts(out, 1, 2);
  assert.ok(evidence(out).includes(PATH), `${PATH}'s assertions changed:\n${evidence(out)}`);
  hint(out, 'note', PATH, /assert/i);
});

test('C6 [LNK-3][HNT-2][REC-11] a regex literal holding an assertion call is not one: 1 → 1, the file is not among the tests whose assertions changed, and no note', (t) => {
  const out = branch(t, '  const pattern = /assert.equal(dates, 3)/;');
  counts(out, 1, 1);
  assert.ok(!evidence(out).includes(PATH), `no assertion call was added to ${PATH}:\n${evidence(out)}`);
  assert.deepEqual(assertionNotes(out), [], `no assertion-change note for ${PATH}:\n${out}`);
});

test('C6 [LNK-3] contrast: a template literal\'s plain text, with no interpolation, is not a call: 1 → 1', (t) => {
  counts(branch(t, '  const text = `assert.equal(x, 1)`;'), 1, 1);
});

test('C6 [LNK-3] contrast: a division is not a regex: an assertion call after "/" on the same line, before another "/", still counts: 1 → 2', (t) => {
  counts(branch(t, '  const half = total / 2; assert.equal(half, 1.5); const third = total / 3;'), 1, 2);
});
