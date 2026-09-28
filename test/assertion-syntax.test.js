// Comments and string contents are not assertions [LNK-3] [HNT-2] [REC-11]:
// in a supported JS/TS test file, the count is the number of assertion
// calls, and "assertions changed" means a line holding an assertion call was
// added or removed. A call written inside a line comment, a block comment or
// a string literal is not a call: adding one leaves the count as it was,
// does not list the file among the tests whose assertions changed, and gives
// no assertion-change note. Editing a real assertion's expected string still
// is an assertion change. (Review of #85, finding 2.) Acceptance C6.
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
  ...body,
  '});',
].join('\n') + '\n';

// Main: the baseline, then PATH at `before`. The branch: PATH at `after`, in
// a commit with a tier-2 claim. Returns check --all.
function branch(t, before, after) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  repo.commit('Baseline', { date: '2026-09-01T12:00:00Z' });
  repo.write(PATH, js(before));
  repo.commit('Test the dates', { date: '2026-09-02T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write(PATH, js(after));
  repo.commit(message('Explain the dates test', { tier: '2 — tests' }), { date: '2026-09-03T12:00:00Z' });
  return check(repo, '--all');
}

function testsBlock(out) {
  const b = labelled(out, 'Tests');
  assert.ok(b, `expected a line starting with Tests:\n${out}`);
  assertNoVerdict(b);
  return b;
}
function evidence(out) {
  const e = labelled(out, 'Evidence');
  assert.ok(e, `expected a line starting with Evidence:\n${out}`);
  return e;
}
// The hint lines naming PATH that speak of assertions.
const assertionNotes = (out) => checkHints(out).filter((l) => l.includes(PATH) && /assert/i.test(l));

const ONE = ["  assert.equal(dates, 3);"];
const NOT_CALLS = [
  '  // expect(dates).toBe(9);',
  '  const help = "assert.equal(dates, 12)";',
  '  /* assert.ok(x) */',
];

test('C6 [LNK-3][HNT-2][REC-11] a line comment, a string and a block comment holding assertion calls are not assertions: 1 → 1, the file is not among the tests whose assertions changed, and no assertion-change note', (t) => {
  const out = branch(t, ONE, [...ONE, ...NOT_CALLS]);
  const b = testsBlock(out);
  assert.ok(lineWith(b, PATH, assertions(1, 1)), `${PATH} still holds one assertion call:\n${b}`);
  assert.ok(!evidence(out).includes(PATH), `no assertion line changed in ${PATH}:\n${evidence(out)}`);
  assert.deepEqual(assertionNotes(out), [], `no assertion-change note for ${PATH}:\n${out}`);
});

test('C6 [LNK-3][HNT-2][REC-11] contrast: editing a real assertion\'s expected string (\'a\' to \'b\') is an assertion change: 1 → 1, listed in the Evidence line, and a note', (t) => {
  const out = branch(t, ["  assert.equal(x, 'a');"], ["  assert.equal(x, 'b');"]);
  const b = testsBlock(out);
  assert.ok(lineWith(b, PATH, assertions(1, 1)), `${PATH} holds one assertion call:\n${b}`);
  assert.ok(evidence(out).includes(PATH), `${PATH}'s assertion changed:\n${evidence(out)}`);
  hint(out, 'note', PATH, /assert/i);
});
