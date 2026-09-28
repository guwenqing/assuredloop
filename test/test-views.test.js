// Linked tests in the views [VW-3][VW-4][LNK-1][LNK-3]. al context <ID>: the
// Links block keeps code files only; a Tests block lists the linked test
// files, each with its reason (names [ID] at path:line, changed together with
// [ID], or shares a word); no ADR file is under Links. al context --diff
// <range>: a Tests block with each changed test file and its assertion
// observation, and each test linked to the changed code (a shared section
// ID, changed together, the same stem) or to a changed section, with its
// reason. --for review: its evidence part holds the same Tests block.
// Acceptance C6.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';
import { both, lineWith } from './helpers/request.js';
import { assertBlamed, assertDiffFrame, contextDiff, contextOf, file, indexOf, labelled } from './helpers/links.js';
import { message } from './helpers/hints.js';
import { assertNoVerdict, assertions, writeAdr } from './helpers/evidence.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const INV3 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const INV9 = (how) => `## [INV-9] Rounding\nTotals MUST round ${how}.\n`;

// A node:test file: the test `name` on line 4, then an assert.equal line per
// [actual, expected].
const jsTest = (name, asserts) => [
  "import { test } from 'node:test';",
  "import assert from 'node:assert/strict';",
  '',
  `test('${name}', () => {`,
  ...asserts.map(([x, y]) => `  assert.equal(${x}, ${y});`),
  '});',
].join('\n') + '\n';
const code = (v) => `export const value = ${v};\nexport const digits = 2;\n`;
const DATES = (how) => `// [INV-3] Dates\nexport function formatDate(d) {\n  return ${how};\n}\n`;

const has = (b, ...parts) => assert.ok(lineWith(b, ...parts), `expected a line with ${parts.map(String).join(' and ')}:\n${b}`);
function block(out, label) {
  const b = labelled(out, label);
  assert.ok(b, `expected a line starting with ${label}:\n${out}`);
  return b;
}

// --- context <ID> ---

// Main: INV-1; then INV-3 with test/format.test.js (changed together with
// it); src/dates.js under an [INV-3] marker; test/dates.test.js naming
// [INV-3] on line 4; test/calendar-dates.test.js (shares "dates"); ADR 0002
// governing [INV-3]; each in a commit of its own.
function section(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  repo.commit('Spec', { date: '2026-09-01T12:00:00Z' });
  repo.write('specs/invoices.md', file(INV1, INV3));
  repo.write('test/format.test.js', jsTest('invoice fields', [['field', "'x'"]]));
  const dates = repo.commit('Dates', { date: '2026-09-02T12:00:00Z' });
  const adds = [
    ['src/dates.js', DATES('d.toISOString()')],
    ['test/dates.test.js', jsTest('[INV-3] dates show ISO 8601', [['formatDate(d)', "'2026-09-20'"]])],
    ['test/calendar-dates.test.js', jsTest('calendar', [['days', '7']])],
  ];
  adds.forEach(([path, text], i) => {
    repo.write(path, text);
    repo.commit(`Add ${path}`, { date: `2026-09-0${i + 3}T12:00:00Z` });
  });
  writeAdr(repo, '0002-iso-dates', 'ISO dates', { governs: ['INV-3'], text: 'Customers read [INV-3] dates in many formats.' });
  repo.commit('ISO dates ADR', { date: '2026-09-07T12:00:00Z' });
  assertBlamed(repo, 'HEAD', 'specs/invoices.md', [4, 5], ['-w', '-M'], dates);
  return repo;
}

test('C6 [VW-3][LNK-1] context INV-3: a Tests block lists the linked tests with their reasons: names [INV-3] at test/dates.test.js:4, changed together with [INV-3], shares a word', (t) => {
  const r = contextOf(section(t), 'INV-3');
  assert.equal(r.code, 0, both(r));
  assertFrame(r.stdout);
  const tests = block(r.stdout, 'Tests');
  has(tests, /test\/dates\.test\.js:4(?!\d)/, 'names [INV-3]');
  has(tests, 'test/format.test.js', 'changed together');
  has(tests, 'test/calendar-dates.test.js', /\bshares\b/);
  assertNoVerdict(tests);
});

test('C6 [VW-3][LNK-4] context INV-3: the Links block keeps code files only: src/dates.js, and no test file or ADR file', (t) => {
  const r = contextOf(section(t), 'INV-3');
  assert.equal(r.code, 0, both(r));
  const links = block(r.stdout, 'Links');
  has(links, /src\/dates\.js:1(?!\d)/, 'names [INV-3]');
  for (const l of lines(links)) {
    assert.ok(!/\btest\//.test(l) && !l.includes('docs/adr/'), `the Links block keeps code files only:\n${links}`);
  }
});

// --- context --diff ---

// Main: INV-1, INV-3 and INV-9; then, each in a commit of its own unless
// named together: src/rounding.js; test/rounding.test.js (its stem);
// src/dates.js under an [INV-3] marker; test/format.test.js naming [INV-3];
// src/ledger.js with test/books.test.js (together); test/cents.test.js naming
// [INV-9]; test/unrelated.test.js. The branch changes, each in a commit of
// its own: src/rounding.js, src/dates.js line 3, src/ledger.js, INV-9, and
// test/rounding.test.js (1 → 2 assertions).
function branch(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, INV3, INV9('half up')));
  repo.commit('Spec', { date: '2026-09-01T12:00:00Z' });
  const groups = [
    { 'src/rounding.js': code(1) },
    { 'test/rounding.test.js': jsTest('rounds to cents', [['round(1.005)', '1.01']]) },
    { 'src/dates.js': DATES('d.toLocaleDateString()') },
    { 'test/format.test.js': jsTest('[INV-3] invoice fields', [['field', "'x'"]]) },
    { 'src/ledger.js': code(1), 'test/books.test.js': jsTest('books balance', [['balance()', '0']]) },
    { 'test/cents.test.js': jsTest('[INV-9] rounds to cents', [['cents(1.005)', '101']]) },
    { 'test/unrelated.test.js': jsTest('unrelated', [['1', '1']]) },
  ];
  groups.forEach((g, i) => {
    for (const [path, text] of Object.entries(g)) repo.write(path, text);
    const c = repo.commit(`Add ${Object.keys(g).join(', ')}`, { date: `2026-09-${String(i + 2).padStart(2, '0')}T12:00:00Z` });
    assert.deepEqual(repo.git(['show', '--name-only', '--format=', c]).split('\n').sort(), Object.keys(g).sort(), 'the fixture: the files of each commit');
  });
  repo.git(['checkout', '-q', '-b', 'work']);
  const changes = [
    { 'src/rounding.js': code(2) },
    { 'src/dates.js': DATES('d.toISOString().slice(0, 10)') },
    { 'src/ledger.js': code(2) },
    { 'specs/invoices.md': file(INV1, INV3, INV9('half even')) },
    { 'test/rounding.test.js': jsTest('rounds to cents', [['round(1.005)', '1.01'], ['round(2.5)', '2.5']]) },
  ];
  changes.forEach((g, i) => {
    for (const [path, text] of Object.entries(g)) repo.write(path, text);
    repo.commit(message(`Work ${i}`, { tier: '2 — work' }), { date: `2026-09-2${i}T12:00:00Z` });
  });
  return repo;
}

test('C6 [VW-4][LNK-1][LNK-3] context --diff: a Tests block with the changed test and its observation (1 → 2 assertions), and the tests linked to the changed code or a changed section, each with its reason; an unlinked test is not listed', (t) => {
  const repo = branch(t);
  const r = contextDiff(repo, 'main...HEAD');
  assert.equal(r.code, 0, both(r));
  assertDiffFrame(r.stdout);
  const tests = block(r.stdout, 'Tests');
  has(tests, 'test/rounding.test.js', assertions(1, 2));
  has(tests, 'test/rounding.test.js', /src\/rounding\.js|\bstem\b/);
  has(tests, 'test/format.test.js', /\bINV-3\b/);
  has(tests, 'test/books.test.js', 'changed together');
  has(tests, 'test/cents.test.js', /\bINV-9\b/);
  assert.ok(!tests.includes('test/unrelated.test.js'), `test/unrelated.test.js is linked to nothing changed:\n${tests}`);
  assertNoVerdict(tests);
});

test('C6 [VW-4] context --diff --for review: the evidence part holds the Tests block, with the changed test and a linked one', (t) => {
  const repo = branch(t);
  const r = runAl(repo.dir, ['context', '--diff', 'main...HEAD', '--for', 'review']);
  assert.equal(r.code, 0, both(r));
  assertDiffFrame(r.stdout);
  const ls = lines(r.stdout);
  const i = indexOf(ls, /^[#\s]*Intent\b/i);
  const e = indexOf(ls, /^[#\s]*Evidence\b/i, i + 1);
  assert.ok(i >= 0 && e > i, `expected an Intent part, then an Evidence part:\n${r.stdout}`);
  const tests = block(ls.slice(e).join('\n'), 'Tests');
  has(tests, 'test/rounding.test.js', assertions(1, 2));
  has(tests, 'test/format.test.js', /\bINV-3\b/);
});
