// The test notes [HNT-2] al check gives, each a note that names the file and a
// command, and the tier claim's evidence [REC-11]. A test file is linked to a
// code file [LNK-1] (a) when they share a section ID (the test names [ID] and
// the code change reaches it: an [ID] marker near the change, blame, or
// co-change with the section); (b) when they changed together in one commit
// of 30 files or fewer; (c) when the test's name without its test markers and
// extension equals the code file's name without its extension. Code is a
// changed file outside requests/, the baseline root and the ADR folders that
// is neither a test file nor a named result file. The notes: code changed
// while its linked tests did not; an assertion change (supported syntax
// only) with no linked code or spec change; a tier-0 claim where the tests of
// a section near the changed code changed (a note: check --strict still
// exits 0). With a Tier line, check's Evidence line names the tests whose
// assertions changed, or says none. Acceptance C4 (a nearby promise's test
// changed) and C6.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo } from './helpers/fixture.js';
import { file, labelled } from './helpers/links.js';
import { check, hint, message, noHint, strict } from './helpers/hints.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const INV3 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const INV4 = '## [INV-4] Separator\nThe CSV separator is a comma.\n';
const INV9 = (how) => `## [INV-9] Rounding\nTotals MUST round ${how}.\n`;
const BASELINE = file(INV1, INV3, INV4, INV9('half up'));

// A node:test file: one test called `name`, a setup line, then assert.equal
// lines, each [actual, expected].
const jsTest = (name, asserts, setup = 'const cents = 100;') => [
  "import { test } from 'node:test';",
  "import assert from 'node:assert/strict';",
  '',
  `test('${name}', () => {`,
  `  ${setup}`,
  ...asserts.map(([x, y]) => `  assert.equal(${x}, ${y});`),
  '});',
].join('\n') + '\n';
const code = (v) => `export const value = ${v};\nexport const digits = 2;\n`;
const DATES = (how) => `// [INV-3] Dates\nexport function formatDate(d) {\n  return ${how};\n}\n`;
const EXPORT = (sep) => `// [INV-4] Separator\nexport const separator = "${sep}";\n`;

// Main: the baseline, then each file of `files` ({ path: text }) in a commit
// of its own, so no two of them changed together. The branch work starts
// there.
function main(t, files, { baseline = BASELINE, config } = {}) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', baseline);
  if (config) repo.write('.assuredloop', config);
  repo.commit('Spec', { date: '2026-09-01T12:00:00Z' });
  Object.entries(files).forEach(([path, text], i) => {
    repo.write(path, text);
    const c = repo.commit(`Add ${path}`, { date: `2026-09-${String(i + 2).padStart(2, '0')}T12:00:00Z` });
    assert.equal(repo.git(['show', '--name-only', '--format=', c]), path, 'the fixture: one file per commit');
  });
  repo.git(['checkout', '-q', '-b', 'work']);
  return repo;
}
// On the branch: write `files` and commit them, with a Tier line; an array of
// them is one commit each, so files in two of them never changed together
// [LNK-1] (b). Returns check --all.
function work(repo, files, tier = '2 — work') {
  (Array.isArray(files) ? files : [files]).forEach((group, i) => {
    for (const [path, text] of Object.entries(group)) repo.write(path, text);
    repo.commit(message(`Work ${i}`, { tier }), { date: `2026-09-2${i}T12:00:00Z` });
  });
  return check(repo, '--all');
}

// --- code changed while its linked tests did not ---

test('C6 [HNT-2][LNK-1] (c) same stem: src/rounding.js changed, test/rounding.test.js did not: a note naming both; with the test changed too, none', (t) => {
  const files = { 'src/rounding.js': code(1), 'test/rounding.test.js': jsTest('rounds to cents', [['round(1.005)', '1.01']]) };
  hint(work(main(t, files), { 'src/rounding.js': code(2) }), 'note', 'src/rounding.js', 'test/rounding.test.js');

  const both = work(main(t, files), { 'src/rounding.js': code(2), 'test/rounding.test.js': jsTest('rounds to cents', [['round(1.005)', '1.01'], ['round(2.5)', '2.5']]) });
  noHint(both, 'src/rounding.js', 'test/rounding.test.js');
});

test('C6 [HNT-2][LNK-1] (c) the test markers .test, .spec, _test, test_, Test and Tests come off the stem, in any language; test/linked.test.js is not src/links.js\'s test', (t) => {
  const pairs = [['src/rounding.py', 'tests/test_rounding.py'], ['pkg/money.go', 'pkg/money_test.go'], ['src/Invoice.java', 'test/InvoiceTest.java'],
    ['src/Ledger.cs', 'test/LedgerTests.cs'], ['src/links.js', 'test/links.spec.js']];
  for (const [src, tst] of pairs) {
    hint(work(main(t, { [src]: code(1), [tst]: code(1) }), { [src]: code(2) }), 'note', src, tst);
  }
  noHint(work(main(t, { 'src/links.js': code(1), 'test/linked.test.js': code(1) }), { 'src/links.js': code(2) }), 'src/links.js');
});

test('C6 [HNT-2][LNK-1] (a) a shared section ID: src/dates.js changes under its [INV-3] marker and test/format.test.js names [INV-3]: a note naming both; a test naming [INV-1] instead gives none', (t) => {
  for (const [id, linked] of [['INV-3', true], ['INV-1', false]]) {
    const repo = main(t, { 'src/dates.js': DATES('d.toLocaleDateString()'), 'test/format.test.js': jsTest(`[${id}] invoice fields`, [['field', "'x'"]]) });
    const out = work(repo, { 'src/dates.js': DATES('d.toISOString().slice(0, 10)') });
    if (linked) hint(out, 'note', 'src/dates.js', 'test/format.test.js');
    else noHint(out, 'src/dates.js', 'test/format.test.js');
  }
});

// Main: src/ledger.js and test/books.test.js added in one commit with `filler`
// generated files beside them; the branch changes src/ledger.js only.
function cochanged(t, filler) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', BASELINE);
  repo.commit('Spec', { date: '2026-09-01T12:00:00Z' });
  repo.write('src/ledger.js', code(1));
  repo.write('test/books.test.js', jsTest('books balance', [['balance()', '0']]));
  for (let i = 1; i <= filler; i++) repo.write(`gen/f${String(i).padStart(2, '0')}.txt`, `generated ${i}\n`);
  const c = repo.commit('Ledger and its test', { date: '2026-09-02T12:00:00Z' });
  assert.equal(repo.git(['show', '--name-only', '--format=', c]).split('\n').length, filler + 2, `the fixture: ${filler + 2} files in one commit`);
  repo.git(['checkout', '-q', '-b', 'work']);
  return work(repo, { 'src/ledger.js': code(2) });
}

test('C6 [HNT-2][LNK-1] (b) changed together in one commit of 30 files or fewer: 2 and 30 files give a note naming both; 31 files is no link, and no note', (t) => {
  hint(cochanged(t, 0), 'note', 'src/ledger.js', 'test/books.test.js');
  hint(cochanged(t, 28), 'note', 'src/ledger.js', 'test/books.test.js');
  noHint(cochanged(t, 29), 'src/ledger.js');
});

test('C6 [HNT-2] code changed with no linked test at all gives no note: src/ledger.js beside an unlinked test/books.test.js (src/rounding.js, changed beside it, gets its note)', (t) => {
  const repo = main(t, { 'src/ledger.js': code(1), 'test/books.test.js': jsTest('books balance', [['balance()', '0']]),
    'src/rounding.js': code(1), 'test/rounding.test.js': jsTest('rounds to cents', [['round(1.005)', '1.01']]) });
  const out = work(repo, { 'src/ledger.js': code(2), 'src/rounding.js': code(2) });
  hint(out, 'note', 'src/rounding.js', 'test/rounding.test.js');
  noHint(out, 'src/ledger.js');
});

test('C6 [HNT-2][LNK-3] not code: a baseline file and a named result file that share a test\'s stem give no "linked tests did not change" note (src/rounding.js, changed beside them, gets its note)', (t) => {
  const repo = main(t, {
    'specs/rounding.md': '## [RND-1] Rounding\nRound half up.\n',
    'results/rounding.tap': 'TAP version 13\nok 1 - rounds\n1..1\n',
    'src/rounding.js': code(1),
    'test/rounding.test.js': jsTest('rounds to cents', [['round(1.005)', '1.01']]),
  }, { config: 'results: results\n' });
  const out = work(repo, { 'specs/rounding.md': '## [RND-1] Rounding\nRound half even.\n', 'results/rounding.tap': 'TAP version 13\nnot ok 1 - rounds\n1..1\n',
    'src/rounding.js': code(2) });
  hint(out, 'note', 'src/rounding.js', 'test/rounding.test.js');
  noHint(out, 'specs/rounding.md', 'test/rounding.test.js');
  noHint(out, 'results/rounding.tap', 'test/rounding.test.js');
});

// --- an assertion change with no linked code or spec change ---

const ROUNDS = (expected, name = 'rounds to cents') => jsTest(name, [['round(1.005)', expected], ['round(2.5)', '2.5']]);

test('C6 [HNT-2][LNK-3] an assertion edited (the count unchanged) with no code change is a note naming the test; a code change that is not linked to it does not stop the note', (t) => {
  const files = { 'src/rounding.js': code(1), 'src/ledger.js': code(1), 'test/rounding.test.js': ROUNDS('1.01') };
  hint(work(main(t, files), { 'test/rounding.test.js': ROUNDS('1.00') }), 'note', 'test/rounding.test.js', /assert/i);
  hint(work(main(t, files), [{ 'test/rounding.test.js': ROUNDS('1.00') }, { 'src/ledger.js': code(2) }]), 'note', 'test/rounding.test.js', /assert/i);
});

test('C6 [HNT-2][LNK-1] contrast: the same assertion change beside a change to its linked code (src/rounding.js, same stem) gives no such note (test/cents.test.js, changed beside it with no code, gets its note)', (t) => {
  const files = { 'src/rounding.js': code(1), 'test/rounding.test.js': ROUNDS('1.01'), 'test/cents.test.js': ROUNDS('1.01', 'cents') };
  const out = work(main(t, files), [{ 'test/rounding.test.js': ROUNDS('1.00') }, { 'src/rounding.js': code(2) }, { 'test/cents.test.js': ROUNDS('1.00', 'cents') }]);
  hint(out, 'note', 'test/cents.test.js', /assert/i);
  noHint(out, 'test/rounding.test.js', /assert/i);
});

test('C6 [HNT-2] contrast: an assertion change in a test naming [INV-9], beside a change to baseline section INV-9, gives no note; beside a change to INV-1 instead, it does', (t) => {
  const files = { 'test/cents.test.js': ROUNDS('1.01', '[INV-9] rounds to cents') };
  const edit = { 'test/cents.test.js': ROUNDS('1.00', '[INV-9] rounds to cents') };
  const spec = work(main(t, files), [edit, { 'specs/invoices.md': file(INV1, INV3, INV4, INV9('half even')) }]);
  noHint(spec, 'test/cents.test.js', /assert/i);
  const other = work(main(t, files), [edit, { 'specs/invoices.md': file(INV1.replace('two', 'three'), INV3, INV4, INV9('half up')) }]);
  hint(other, 'note', 'test/cents.test.js', /assert/i);
});

test('C6 [HNT-2][LNK-3] contrast: a test edit that changes no assertion line (its title and setup) gives no note; nor does an assertion change in a Python test (not a supported syntax); test/cents.test.js, whose assertion changed beside them, gets its note', (t) => {
  const repo = main(t, { 'test/rounding.test.js': ROUNDS('1.01'), 'tests/test_ledger.py': 'def test_ledger():\n    assert ledger() == 1\n',
    'test/cents.test.js': ROUNDS('1.01', 'cents') });
  const renamed = ROUNDS('1.01', 'rounds to the cent').replace('const cents = 100;', 'const cents = 10 * 10;');
  const out = work(repo, { 'test/rounding.test.js': renamed, 'tests/test_ledger.py': 'def test_ledger():\n    assert ledger() == 2\n',
    'test/cents.test.js': ROUNDS('1.00', 'cents') });
  hint(out, 'note', 'test/cents.test.js', /assert/i);
  noHint(out, 'test/rounding.test.js');
  noHint(out, 'tests/test_ledger.py');
});

// --- tier 0 where a nearby promise's tests changed; the Evidence line ---

// Main: the baseline; src/export.js under an [INV-4] marker; the tests
// test/separator.test.js (names [INV-4]), test/totals.test.js (names [INV-1])
// and test/export.test.js (src/export.js's stem, no ID), each in a commit of
// its own.
const SEP = (expected, name = '[INV-4] the separator') => jsTest(name, [['separator', `'${expected}'`]]);
const TOT = (expected) => jsTest('[INV-1] totals show two decimals', [['total', `'${expected}'`]]);
const EXP = (expected) => jsTest('exports one row', [['row', `'${expected}'`]]);
const nearby = (t) => main(t, { 'src/export.js': EXPORT(','), 'test/separator.test.js': SEP(','), 'test/totals.test.js': TOT('3.00'), 'test/export.test.js': EXP('a,b') });
const TIER0 = '0 — restores the separator; no promise changes';

// The Evidence line (with the lines after it that start with a space).
function evidence(out) {
  const e = labelled(out, 'Evidence');
  assert.ok(e, `expected a line starting with Evidence:\n${out}`);
  return e;
}
// The Evidence line says no test's assertions changed: a part about tests or
// assertions that says none.
function noTestsIn(e) {
  const part = e.split(/[·;\n]/).find((p) => /\btests?\b|\bassertions?\b/i.test(p));
  assert.ok(part && /\bno(ne)?\b/i.test(part), `the Evidence line should say no test's assertions changed:\n${e}`);
}

test('C4 C6 [HNT-2][REC-11] a tier-0 claim where the test of INV-4, the section near the changed code, changed its assertions: a note naming the test; check --strict exits 0; the Evidence line names the test', (t) => {
  const repo = nearby(t);
  const out = work(repo, [{ 'src/export.js': EXPORT(';') }, { 'test/separator.test.js': SEP(';') }], TIER0);
  hint(out, 'note', 'tier 0', 'test/separator.test.js');
  assert.ok(evidence(out).includes('test/separator.test.js'), `the Evidence line names the test whose assertions changed:\n${out}`);
  strict(repo, 0);
});

test('C4 C6 [HNT-2] a tier-0 claim where src/export.js\'s same-stem test changed its assertions: a note naming test/export.test.js', (t) => {
  const repo = nearby(t);
  hint(work(repo, [{ 'src/export.js': EXPORT(';') }, { 'test/export.test.js': EXP('a;b') }], TIER0), 'note', 'tier 0', 'test/export.test.js');
});

test('C4 C6 [HNT-2][REC-11] contrast: the same change under a tier-2 claim gives no tier-0 note, and the Evidence line still names the test', (t) => {
  const out = work(nearby(t), { 'src/export.js': EXPORT(';'), 'test/separator.test.js': SEP(';') }, '2 — the separator');
  noHint(out, 'tier 0');
  assert.ok(evidence(out).includes('test/separator.test.js'), `the Evidence line names the test whose assertions changed:\n${out}`);
});

test('C4 C6 [HNT-2][REC-11] contrast: a tier-0 claim where a test of INV-1, not near the changed code, changed its assertions gives no tier-0 note; the Evidence line names that test', (t) => {
  const out = work(nearby(t), [{ 'src/export.js': EXPORT(';') }, { 'test/totals.test.js': TOT('3.000') }], TIER0);
  noHint(out, 'tier 0');
  const e = evidence(out);
  assert.ok(e.includes('test/totals.test.js'), `the Evidence line names the test whose assertions changed:\n${out}`);
  // A test file is not code [LNK-3]: the [INV-1] it names does not make INV-1 a section near the changed code.
  assert.ok(e.includes('near the changed code'), `the Evidence line lists the sections near the changed code:\n${e}`);
  const near = e.split('near the changed code')[1].split(/[·;]/)[0];
  assert.ok(!/\bINV-1\b/.test(near), `INV-1 is named only by a changed test, not near the changed code:\n${e}`);
});

test('C4 C6 [HNT-2][REC-11] contrast: a tier-0 claim where the test of INV-4 changed but no assertion line did gives no tier-0 note, and the Evidence line says no test\'s assertions changed', (t) => {
  const out = work(nearby(t), { 'src/export.js': EXPORT(';'), 'test/separator.test.js': SEP(',', '[INV-4] the separator stays') }, TIER0);
  noHint(out, 'tier 0');
  const e = evidence(out);
  assert.ok(!e.includes('test/separator.test.js'), `no assertion line changed in test/separator.test.js:\n${e}`);
  noTestsIn(e);
});

test('C4 C6 [REC-11] a tier-0 code-only change: the Evidence line says no test\'s assertions changed, and still names INV-4 near the changed code', (t) => {
  const out = work(nearby(t), { 'src/export.js': EXPORT(';') }, TIER0);
  const e = evidence(out);
  assert.ok(/\bINV-4\b/.test(e), `the Evidence line names INV-4:\n${e}`);
  noTestsIn(e);
});
