// Assertion counts [LNK-3], for supported syntax only: test files ending in
// .js .mjs .cjs .ts .tsx .jsx. An assertion is a call to assert(…),
// assert.<x>(…) (assert.equal, assert.strict.equal, assert.ok), t.assert.<x>(…)
// or expect(…); the count is the number of such calls in the file. check's
// Tests block shows "<a> → <b> assertions", base to working tree, for each
// changed supported test file, and "skipped" for every other test file,
// which never gets a count. Python and Go are counted too (#130): see
// assertions-python-go.test.js. Observations, never verdicts. Acceptance C6.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo } from './helpers/fixture.js';
import { lineWith } from './helpers/request.js';
import { labelled } from './helpers/links.js';
import { check, message } from './helpers/hints.js';
import { assertNoVerdict, assertions } from './helpers/evidence.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';

// Main: the baseline, then `files` ({ path: text }) in one commit. The branch
// work writes `changes` in one commit.
function branch(t, files, changes) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  repo.commit('Baseline', { date: '2026-09-01T12:00:00Z' });
  for (const [path, text] of Object.entries(files)) repo.write(path, text);
  repo.commit('Tests', { date: '2026-09-02T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  for (const [path, text] of Object.entries(changes)) repo.write(path, text);
  repo.commit(message('More tests', { tier: '2 — tests' }), { date: '2026-09-03T12:00:00Z' });
  return repo;
}
function testsBlock(out) {
  const b = labelled(out, 'Tests');
  assert.ok(b, `expected a line starting with Tests:\n${out}`);
  assertNoVerdict(b);
  return b;
}
const has = (b, ...parts) => assert.ok(lineWith(b, ...parts), `expected a line with ${parts.map(String).join(' and ')}:\n${b}`);

const HEAD = "import { test } from 'node:test';\nimport assert from 'node:assert';\n\ntest('totals', (t) => {\n";
// Four assertions: assert(…), assert.equal, assert.strict.equal, assert.ok.
const FOUR = [
  '  assert(total > 0);',
  '  assert.equal(total, 3);',
  '  assert.strict.equal(total, 3);',
  '  assert.ok(total);',
];
// Five more: t.assert.deepEqual, expect(…), two calls on one line, and a call
// over three lines; then three calls that are not assertions.
const FIVE_MORE = [
  '  t.assert.deepEqual(rows, []);',
  '  expect(total).toBe(3);',
  '  assert.ok(first); assert.ok(second);',
  '  assert.deepEqual(',
  '    rows,',
  '    [],',
  '  );',
  '  assertValid(total);',
  '  expected.push(total);',
  '  assertions.push(total);',
];
const js = (body) => `${HEAD}${body.join('\n')}\n});\n`;

test('C6 [LNK-3] the count is the number of assertion calls: assert(…), assert.x(…), assert.strict.x(…), t.assert.x(…), expect(…), two on one line, one over three lines; assertValid(…), expected.push(…) and assertions.push(…) are not assertions: 4 → 9', (t) => {
  const repo = branch(t, { 'test/totals.test.js': js(FOUR) }, { 'test/totals.test.js': js([...FOUR, ...FIVE_MORE]) });
  has(testsBlock(check(repo, '--all')), 'test/totals.test.js', assertions(4, 9));
});

test('C6 [LNK-3] each supported extension gets a count (.js .mjs .cjs .ts .tsx .jsx, test_*.py, *_test.go: 1 → 2); every other test file is skipped and gets none (.rb, .java, .rs, .json)', (t) => {
  const SUPPORTED = ['test/a.test.js', 'test/b.test.mjs', 'test/c.test.cjs', 'test/d.test.ts', 'test/e.test.tsx', 'test/f.test.jsx'];
  const COUNTED = {
    'tests/test_ledger.py': (n) => `def test_ledger():\n${'    assert ledger() == 1\n'.repeat(n)}`,
    'pkg/ledger_test.go': (n) => `package pkg\n\nfunc TestLedger(t *testing.T) {\n${'\tassert.Equal(t, 1, ledger())\n'.repeat(n)}}\n`,
  };
  const OTHER = {
    'spec/ledger_spec.rb': (n) => `describe 'ledger' do\n${'  it { expect(ledger).to eq(1) }\n'.repeat(n)}end\n`,
    'tests/ledger.rs': (n) => `#[test]\nfn ledger() {\n${'    assert_eq!(ledger(), 1);\n'.repeat(n)}}\n`,
    'test/LedgerTest.java': (n) => `class LedgerTest {\n  void ledger() {\n${'    assertEquals(1, ledger());\n'.repeat(n)}  }\n}\n`,
    'test/fixtures/rows.json': (n) => `${JSON.stringify({ rows: n })}\n`,
  };
  const at = (n) => ({
    ...Object.fromEntries(SUPPORTED.map((p) => [p, js(FOUR.slice(0, n))])),
    ...Object.fromEntries(Object.entries({ ...COUNTED, ...OTHER }).map(([p, f]) => [p, f(n)])),
  });
  const b = testsBlock(check(branch(t, at(1), at(2)), '--all'));
  for (const p of [...SUPPORTED, ...Object.keys(COUNTED)]) has(b, p, assertions(1, 2));
  for (const p of Object.keys(OTHER)) {
    const line = lineWith(b, p);
    assert.ok(line && /\bskipped\b/.test(line), `${p} should be listed as skipped:\n${b}`);
    assert.doesNotMatch(line, /\d\s*(?:→|->)\s*\d/, `${p} never gets a count:\n${line}`);
  }
});

test('C6 [LNK-3] a test file added on the branch shows its count (2 assertions); an edited assertion with the count unchanged shows 3 → 3', (t) => {
  const THREE = FOUR.slice(1);
  const repo = branch(t, { 'test/edited.test.js': js(THREE) }, {
    'test/added.test.js': js(FOUR.slice(0, 2)),
    'test/edited.test.js': js(THREE.map((l) => l.replace('3)', '4)'))),
  });
  const b = testsBlock(check(repo, '--all'));
  has(b, 'test/added.test.js', /\b2 assertions?\b/);
  has(b, 'test/edited.test.js', assertions(3, 3));
});

test('C6 [LNK-3] the counts read the working tree: an assertion added and not committed shows 4 → 5', (t) => {
  const repo = branch(t, { 'test/totals.test.js': js(FOUR) }, {});
  repo.write('test/totals.test.js', js([...FOUR, '  assert.ok(rows);']));
  has(testsBlock(check(repo, '--all')), 'test/totals.test.js', assertions(4, 5));
});
