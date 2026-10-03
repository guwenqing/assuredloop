// Assertion counts for Python and Go [LNK-3] (#130), counted the way JS/TS is:
// check's Tests block shows "<a> → <b> assertions (+added -removed lines)",
// base to working tree, where added and removed are assertion lines. A line
// counts when, after its leading whitespace, it starts with an assertion: in
// test_*.py and *_test.py, `assert `, `self.assert…(`, `pytest.raises(` or
// `with pytest.raises(`; in *_test.go, `t.Error(`, `t.Errorf(`, `t.Fatal(`,
// `t.Fatalf(`, `assert.<Name>(` or `require.<Name>(`. A comment line, a line
// whose assertion text sits in a string, and lookalikes are not counted. An
// assertion change gives the [HNT-2] note and is named on the Evidence line
// [REC-11], as for JS. Rust, Ruby and Java test files stay skipped, with no
// count. Observations, never verdicts. Acceptance C6.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo } from './helpers/fixture.js';
import { lineWith } from './helpers/request.js';
import { labelled } from './helpers/links.js';
import { check, hint, message, noHint } from './helpers/hints.js';
import { assertNoVerdict, assertions } from './helpers/evidence.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';

// Main: the baseline, then `files` ({ path: text }) in one commit. The branch
// writes `changes` in one commit, with a tier-2 claim. Returns check --all.
function branch(t, files, changes) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  repo.commit('Baseline', { date: '2026-09-01T12:00:00Z' });
  for (const [path, text] of Object.entries(files)) repo.write(path, text);
  repo.commit('Tests', { date: '2026-09-02T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  for (const [path, text] of Object.entries(changes)) repo.write(path, text);
  repo.commit(message('More tests', { tier: '2 — tests' }), { date: '2026-09-03T12:00:00Z' });
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
// "(+<added> -<removed> lines)": the assertion lines added and removed.
const moved = (added, removed) => new RegExp(`\\(\\+${added} -${removed} lines?\\)`);
const has = (b, ...parts) => assert.ok(lineWith(b, ...parts), `expected a line with ${parts.map(String).join(' and ')}:\n${b}`);

// The file's assertions changed: the Evidence line names it, and a note.
function changed(out, path) {
  assert.ok(evidence(out).includes(path), `${path}'s assertions changed:\n${evidence(out)}`);
  hint(out, 'note', path, /assert/i);
}
// No assertion line changed: not on the Evidence line, and no note.
function unchanged(out, path) {
  assert.ok(!evidence(out).includes(path), `no assertion line changed in ${path}:\n${evidence(out)}`);
  noHint(out, path, /assert/i);
}

// --- Python ---

// A unittest test method: a setup line, then `body`, each line indented to
// the method body.
const py = (body, setup = 'total = ledger()') => [
  'import unittest',
  '',
  'import pytest',
  '',
  '',
  'class LedgerTest(unittest.TestCase):',
  '    def test_ledger(self):',
  `        ${setup}`,
  ...body.map((l) => `        ${l}`),
  '',
].join('\n');
const PY_ONE = ['assert total == 1'];

test('C6 [LNK-3] Python: each assertion form counts, in test_*.py and in *_test.py: assert, self.assertEqual(…), self.assertTrue(…), self.assertRaises(…), pytest.raises(…): 1 → 6 (+5 -0 lines)', (t) => {
  const FIVE = [
    'self.assertEqual(total, 1)',
    'self.assertTrue(total)',
    'self.assertRaises(ValueError, ledger, -1)',
    'pytest.raises(ValueError, ledger, -2)',
    'assert total > 0',
  ];
  const PATHS = ['tests/test_ledger.py', 'pkg/ledger_test.py'];
  const out = branch(t, Object.fromEntries(PATHS.map((p) => [p, py(PY_ONE)])), Object.fromEntries(PATHS.map((p) => [p, py([...PY_ONE, ...FIVE])])));
  const b = testsBlock(out);
  for (const p of PATHS) has(b, p, assertions(1, 6), moved(5, 0));
});

test('C6 [LNK-3] Python: `with pytest.raises(…):` counts as one assertion (its body line does not): 1 → 2 (+1 -0 lines)', (t) => {
  const out = branch(t, { 'tests/test_ledger.py': py(PY_ONE) },
    { 'tests/test_ledger.py': py([...PY_ONE, 'with pytest.raises(ValueError):', '    ledger(-1)']) });
  has(testsBlock(out), 'tests/test_ledger.py', assertions(1, 2), moved(1, 0));
});

test('C6 [LNK-3][HNT-2][REC-11] Python: a changed assertion (one edited, one added) moves the count and the lines: 2 → 3 (+2 -1 lines); the Evidence line names the file, and an assertion-change note', (t) => {
  const PATH = 'tests/test_ledger.py';
  const out = branch(t, { [PATH]: py(['assert total == 1', 'self.assertEqual(rows, [])']) },
    { [PATH]: py(['assert total == 2', 'self.assertEqual(rows, [])', 'self.assertTrue(ok)']) });
  has(testsBlock(out), PATH, assertions(2, 3), moved(2, 1));
  changed(out, PATH);
});

test('C6 [LNK-3][HNT-2][REC-11] Python: a test file edited without touching an assertion line (its setup line) shows 1 → 1 (+0 -0 lines), is not on the Evidence line, and gets no assertion-change note', (t) => {
  const PATH = 'tests/test_ledger.py';
  const out = branch(t, { [PATH]: py(PY_ONE) }, { [PATH]: py(PY_ONE, 'total = ledger(rows=[])') });
  has(testsBlock(out), PATH, assertions(1, 1), moved(0, 0));
  unchanged(out, PATH);
});

test('C6 [LNK-3][HNT-2][REC-11] Python: a comment line, a string holding assertion text and lookalikes are not assertions (# assert …, msg = "assert …", assertValid(…), x = assert_that(…)): 1 → 1 (+0 -0 lines), no assertion-change note', (t) => {
  const PATH = 'tests/test_ledger.py';
  const NOT = ['# assert total == 9', 'msg = "assert total == 1"', 'assertValid(total)', 'x = assert_that(total)'];
  const out = branch(t, { [PATH]: py(PY_ONE) }, { [PATH]: py([...PY_ONE, ...NOT]) });
  has(testsBlock(out), PATH, assertions(1, 1), moved(0, 0));
  unchanged(out, PATH);
});

// --- Go ---

// A Go test function: a setup line, then `body`, each line indented one tab.
const go = (body, setup = 'total := ledger()') => [
  'package ledger',
  '',
  'import (',
  '\t"testing"',
  '',
  '\t"github.com/stretchr/testify/assert"',
  '\t"github.com/stretchr/testify/require"',
  ')',
  '',
  'func TestLedger(t *testing.T) {',
  `\t${setup}`,
  ...body.map((l) => `\t${l}`),
  '}',
  '',
].join('\n');
// One assertion, inside an if block.
const GO_ONE = ['if total != 1 {', '\tt.Errorf("total = %d", total)', '}'];

test('C6 [LNK-3] Go: each assertion form counts in *_test.go: t.Error(…), t.Errorf(…), t.Fatal(…), t.Fatalf(…), assert.Equal(…), require.NoError(…): 1 → 6 (+5 -0 lines)', (t) => {
  const PATH = 'pkg/ledger_test.go';
  const FIVE = ['t.Error("no total")', 't.Fatal("no rows")', 't.Fatalf("rows = %v", rows)', 'assert.Equal(t, 1, total)', 'require.NoError(t, err)'];
  const out = branch(t, { [PATH]: go(GO_ONE) }, { [PATH]: go([...GO_ONE, ...FIVE]) });
  has(testsBlock(out), PATH, assertions(1, 6), moved(5, 0));
});

test('C6 [LNK-3][HNT-2][REC-11] Go: a changed assertion (one edited, one added) moves the count and the lines: 1 → 2 (+2 -1 lines); the Evidence line names the file, and an assertion-change note', (t) => {
  const PATH = 'pkg/ledger_test.go';
  const out = branch(t, { [PATH]: go(GO_ONE) },
    { [PATH]: go(['if total != 1 {', '\tt.Errorf("total is %d", total)', '}', 'assert.Equal(t, 1, total)']) });
  has(testsBlock(out), PATH, assertions(1, 2), moved(2, 1));
  changed(out, PATH);
});

test('C6 [LNK-3][HNT-2][REC-11] Go: a test file edited without touching an assertion line (its setup line) shows 1 → 1 (+0 -0 lines), is not on the Evidence line, and gets no assertion-change note', (t) => {
  const PATH = 'pkg/ledger_test.go';
  const out = branch(t, { [PATH]: go(GO_ONE) }, { [PATH]: go(GO_ONE, 'total := ledger(nil)') });
  has(testsBlock(out), PATH, assertions(1, 1), moved(0, 0));
  unchanged(out, PATH);
});

test('C6 [LNK-3][HNT-2][REC-11] Go: a comment line, a string holding assertion text and lookalikes are not assertions (// t.Errorf(…), s := "t.Errorf(…)", t.Errorx(…), t.Log(…), t.Skip(…)): 1 → 1 (+0 -0 lines), no assertion-change note', (t) => {
  const PATH = 'pkg/ledger_test.go';
  const NOT = ['// t.Errorf("x")', 's := "t.Errorf(\\"x\\")"', 't.Errorx("x")', 't.Log("x")', 't.Skip("x")'];
  const out = branch(t, { [PATH]: go(GO_ONE) }, { [PATH]: go([...GO_ONE, ...NOT]) });
  has(testsBlock(out), PATH, assertions(1, 1), moved(0, 0));
  unchanged(out, PATH);
});

test('C6 [LNK-3][HNT-2] contrast: a .py or .go file that is a test file only by its folder (tests/conftest.py, test/helpers.go), with an assertion added, stays skipped, gets no count and no assertion-change note', (t) => {
  const OTHER = {
    'tests/conftest.py': (n) => py(PY_ONE.concat(Array(n - 1).fill('assert total > 0'))),
    'test/helpers.go': (n) => go(GO_ONE.concat(Array(n - 1).fill('assert.Equal(t, 1, total)'))),
  };
  const at = (n) => Object.fromEntries(Object.entries(OTHER).map(([p, f]) => [p, f(n)]));
  const out = branch(t, at(1), at(2));
  const b = testsBlock(out);
  for (const p of Object.keys(OTHER)) {
    const line = lineWith(b, p);
    assert.ok(line && /\bskipped\b/.test(line), `${p} should be listed as skipped:\n${b}`);
    assert.doesNotMatch(line, /\d\s*(?:→|->)\s*\d/, `${p} never gets a count:\n${line}`);
    noHint(out, p, /assert/i);
  }
});

// --- other languages ---

test('C6 [LNK-3][HNT-2] contrast: Rust (tests/*.rs, *_test.rs), Ruby and Java test files with an assertion added stay skipped, get no count and no assertion-change note', (t) => {
  const OTHER = {
    'tests/ledger.rs': (n) => `#[test]\nfn ledger() {\n${'    assert_eq!(ledger(), 1);\n'.repeat(n)}}\n`,
    'src/ledger_test.rs': (n) => `#[test]\nfn ledger() {\n${'    assert!(ledger() > 0);\n'.repeat(n)}}\n`,
    'spec/ledger_spec.rb': (n) => `describe 'ledger' do\n${'  it { expect(ledger).to eq(1) }\n'.repeat(n)}end\n`,
    'test/LedgerTest.java': (n) => `class LedgerTest {\n  void ledger() {\n${'    assertEquals(1, ledger());\n'.repeat(n)}  }\n}\n`,
  };
  const at = (n) => Object.fromEntries(Object.entries(OTHER).map(([p, f]) => [p, f(n)]));
  const out = branch(t, at(1), at(2));
  const b = testsBlock(out);
  for (const p of Object.keys(OTHER)) {
    const line = lineWith(b, p);
    assert.ok(line && /\bskipped\b/.test(line), `${p} should be listed as skipped:\n${b}`);
    assert.doesNotMatch(line, /\d\s*(?:→|->)\s*\d/, `${p} never gets a count:\n${line}`);
    noHint(out, p, /assert/i);
  }
});
