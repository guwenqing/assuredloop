// check reads the working tree for the code side of a test's links too
// [LNK-1] [LNK-3] [HNT-2] [REC-11]: the tests and their assertions come from
// the working tree, so the code they are linked to, and the sections near
// the changed code, must as well. A change made in the working tree and not
// committed reaches the sections near it, as it would once committed: the
// Evidence line lists INV-3 near the changed code, a tier-0 claim gets its
// note naming the test whose assertions changed, and that test is not an
// assertion change "with no linked code or spec change". A new, untracked
// code file's own [INV-3] line reaches INV-3. (Review of #85, finding 1.)
// Acceptance C4 and C6.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo } from './helpers/fixture.js';
import { file, labelled } from './helpers/links.js';
import { check, checkHints, hint, message } from './helpers/hints.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const INV3 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';

// src/dates.js: its [INV-3] marker above the line that changes.
const DATES = (how) => `// [INV-3] Dates\nexport function formatDate(d) {\n  return ${how};\n}\n`;
const LOCAL = DATES('d.toLocaleDateString()');
const ISO = DATES('d.toISOString().slice(0, 10)');
// test/format.test.js: names [INV-3] and holds one assertion.
const FORMAT = (expected) => [
  "import { test } from 'node:test';",
  "import assert from 'node:assert/strict';",
  "import { formatDate } from '../src/dates.js';",
  '',
  "test('[INV-3] invoice dates', () => {",
  "  const day = new Date('2026-09-01T12:00:00Z');",
  `  assert.equal(formatDate(day), '${expected}');`,
  '});',
].join('\n') + '\n';
const TIER0 = '0 — restores the dates; no promise changes';

// Main: the baseline; src/dates.js; test/format.test.js, in a commit of its
// own. The branch: one commit with a tier-0 claim and no file.
function main(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, INV3));
  repo.commit('Spec', { date: '2026-09-01T12:00:00Z' });
  repo.write('src/dates.js', LOCAL);
  repo.commit('Dates', { date: '2026-09-02T12:00:00Z' });
  repo.write('test/format.test.js', FORMAT('9/1/2026'));
  const c = repo.commit('Test the dates', { date: '2026-09-03T12:00:00Z' });
  assert.equal(repo.git(['show', '--name-only', '--format=', c]), 'test/format.test.js', 'the fixture: the test is committed on its own');
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.commit(message('Restore the dates', { tier: TIER0 }), { date: '2026-09-20T12:00:00Z' });
  return repo;
}
// The code and its test changed in the working tree only.
function uncommitted(repo) {
  repo.write('src/dates.js', ISO);
  repo.write('test/format.test.js', FORMAT('2026-09-01'));
  assert.equal(repo.git(['status', '--porcelain']), 'M src/dates.js\n M test/format.test.js',
    'the fixture: both files changed in the working tree, nothing staged or committed');
}

// The Evidence line (with the lines after it that start with a space).
function evidence(out) {
  const e = labelled(out, 'Evidence');
  assert.ok(e, `expected a line starting with Evidence:\n${out}`);
  return e;
}
// The IDs the Evidence line lists as near the changed code.
function near(out) {
  const e = evidence(out);
  assert.ok(e.includes('near the changed code'), `the Evidence line lists the sections near the changed code:\n${e}`);
  return e.split('near the changed code')[1].split(/[·;]/)[0];
}
// The assertion-change notes naming `path`, other than the tier-0 note.
const assertionNotes = (out, path) => checkHints(out).filter((l) => l.includes(path) && /assert/i.test(l) && !l.includes('tier 0'));

function assertReached(out) {
  assert.match(near(out), /\bINV-3\b/, `INV-3 is near the changed code:\n${evidence(out)}`);
  hint(out, 'note', 'tier 0', 'test/format.test.js');
  assert.deepEqual(assertionNotes(out, 'test/format.test.js'), [],
    `test/format.test.js's assertion change has linked code (src/dates.js, by [INV-3]):\n${out}`);
}

test('C4 C6 [LNK-1][HNT-2][REC-11] code and its test changed in the working tree only: the Evidence line lists INV-3 near the changed code, the tier-0 note names test/format.test.js, and no note calls its assertion change unlinked', (t) => {
  const repo = main(t);
  uncommitted(repo);
  assertReached(check(repo, '--all'));
});

test('C4 C6 [LNK-1][REC-11] contrast (the fixture holds): the same bytes committed give the same Evidence line and notes', (t) => {
  const repo = main(t);
  uncommitted(repo);
  repo.commit(message('Restore the dates, ISO', { tier: TIER0 }), { date: '2026-09-21T12:00:00Z' });
  assertReached(check(repo, '--all'));
});

test('C4 C6 [LNK-1][REC-11] a new code file, not yet tracked, whose own line carries [INV-3]: the Evidence line lists INV-3 near the changed code', (t) => {
  const repo = main(t);
  repo.write('src/iso.js', '// [INV-3] Dates in ISO 8601\nexport const iso = (d) => d.toISOString().slice(0, 10);\n');
  assert.equal(repo.git(['status', '--porcelain']), '?? src/iso.js', 'the fixture: src/iso.js is untracked, and nothing else changed');
  assert.match(near(check(repo, '--all')), /\bINV-3\b/, 'INV-3 is near the changed code');
});
