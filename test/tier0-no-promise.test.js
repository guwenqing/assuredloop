// [REC-10] tier 0 changes no promise, and adding section IDs or moving a
// section without changing its text changes no promise. So a tier-0 claim
// [REC-11] whose baseline edit only adds an ID, or only moves a section, is
// not flagged, and check --strict exits 0 [HNT-3]. A tier-0 claim with a
// baseline edit that does more [HNT-2] (a changed text, an added or removed
// section, a renamed ID, the text before a file's first heading, a file under
// the root that is not .md) is still `not ok`, counting, and check --strict
// exits 1. Built from the spec text and the CLI; nothing here reads the code
// under test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { hasId } from './helpers/request.js';
import { file } from './helpers/links.js';
import { assertCounts, check, checkHints, hint, kindOf, message, noHint, strict } from './helpers/hints.js';

const DATES = '## [TXT-1] Dates\nDates show in ISO 8601.\n';
const DATES_CHANGED = "## [TXT-1] Dates\nDates show in the customer's local format.\n";
const TOTALS = '## [TXT-2] Totals\nTotals show two decimals.\n';
const NAMES = '## [TXT-3] Names\nNames show in full.\n';
// specs/a.md holds TXT-1 then TXT-2; specs/b.md holds TXT-3.
const BASE = { 'specs/a.md': file(DATES, TOTALS), 'specs/b.md': NAMES };
const CLAIM = 'restores the spec layout; no promise changes';

// Main holds `before`; branch `work` starts from it. HEAD is the work.
function onBranch(t, before) {
  const repo = makeRepo(t);
  for (const [path, text] of Object.entries(before)) repo.write(path, text);
  repo.commit('Initial spec', { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  return repo;
}
// One tier-0 commit on the branch, writing `after` (null removes the file).
function commitTier0(repo, after = {}) {
  for (const [path, text] of Object.entries(after)) {
    if (text === null) repo.git(['rm', '-q', path]);
    else repo.write(path, text);
  }
  repo.commit(message('Spec layout', { tier: `0 — ${CLAIM}` }), { date: '2026-09-21T12:00:00Z' });
  assert.ok(repo.git(['diff', '--name-only', 'main..HEAD']).split('\n').some((p) => p.startsWith('specs/')),
    'the fixture: the branch edits the baseline');
}

const notOks = (out) => checkHints(out).filter((l) => kindOf(l) === 'not ok');

// The claim was read as tier 0: a Tier line holds it, and there is no "no Tier line" note.
function assertTier0Read(out) {
  const line = lines(out).find((l) => /^Tier\b/.test(l));
  assert.ok(line && line.includes(CLAIM) && /\b0\b/.test(line), `a Tier line should hold the tier-0 claim:\n${out}`);
  noHint(out, 'no Tier line');
}

// Passes: the tier-0 claim is read, no not ok says tier 0 (a note may), no
// not ok at all, and check --strict exits 0.
function assertNoPromiseChange(repo) {
  const out = check(repo, '--all');
  assertTier0Read(out);
  noHint(out, 'not ok', /tier[ -]?0\b/i);
  assert.deepEqual(notOks(out), [], `no not ok at all:\n${out}`);
  strict(repo, 0);
}

// Flagged: the tier-0 not ok over main..HEAD names one of `ids` (any or none
// when `ids` is empty: no section changed), counts, and is the only not ok,
// so it is what makes check --strict exit 1.
function assertTier0NotOk(repo, ids) {
  const out = check(repo, '--all');
  assertTier0Read(out);
  const line = hint(out, 'not ok', 'tier 0', 'main..HEAD');
  if (ids.length) assert.ok(ids.some((id) => hasId(line, id)), `the tier-0 not ok should name ${ids.join(' or ')}:\n${out}`);
  assertCounts(line);
  assert.deepEqual(notOks(out), [line], `the tier-0 line should be the only not ok:\n${out}`);
  strict(repo, 1);
}

test('[REC-10][REC-11][HNT-2][HNT-3] a tier-0 commit that only adds an ID to a heading (al spec --add-ids: ## Dates becomes ## [TXT-1] Dates, body unchanged) is not flagged, and check --strict exits 0', (t) => {
  const repo = onBranch(t, { 'specs/a.md': '## Dates\nDates show in ISO 8601.\n' });
  const r = runAl(repo.dir, ['spec', '--add-ids', 'specs/a.md', '--prefix', 'TXT', '--yes']);
  assert.equal(r.code, 0, `${r.stdout}\n${r.stderr}`);
  assert.equal(repo.read('specs/a.md').toString('utf8'), DATES, 'the fixture: add-ids wrote only the ID');
  commitTier0(repo);
  assertNoPromiseChange(repo);
});

test('[REC-10][REC-11][HNT-2][HNT-3] a tier-0 commit that only moves [TXT-1] unchanged from specs/a.md to specs/b.md is not flagged, and check --strict exits 0', (t) => {
  const repo = onBranch(t, BASE);
  commitTier0(repo, { 'specs/a.md': TOTALS, 'specs/b.md': file(DATES, NAMES) });
  assert.ok(!repo.read('specs/a.md').toString('utf8').includes('TXT-1') && repo.read('specs/b.md').toString('utf8').includes(DATES),
    'the fixture: TXT-1 left specs/a.md and is in specs/b.md, its text as it was');
  assertNoPromiseChange(repo);
});

// Each: what it does, the files on main, the files the tier-0 commit writes,
// and the IDs the not ok may name (one of them).
const contrasts = [
  ['changes the text of [TXT-1] in place', BASE, { 'specs/a.md': file(DATES_CHANGED, TOTALS) }, ['TXT-1']],
  ['adds a new section [TXT-4]', BASE, { 'specs/b.md': file(NAMES, '## [TXT-4] Currency\nAmounts show their currency code.\n') }, ['TXT-4']],
  ['removes the section [TXT-2]', BASE, { 'specs/a.md': DATES }, ['TXT-2']],
  ['renames [TXT-1] to [TXT-4], title and body the same', BASE, { 'specs/a.md': file('## [TXT-4] Dates\nDates show in ISO 8601.\n', TOTALS) }, ['TXT-1', 'TXT-4']],
  ['moves [TXT-1] to specs/b.md and changes its text', BASE, { 'specs/a.md': TOTALS, 'specs/b.md': file(DATES_CHANGED, NAMES) }, ['TXT-1']],
  ['adds the ID [TXT-1] to ## Dates and changes its body', { 'specs/a.md': '## Dates\nDates show in ISO 8601.\n' }, { 'specs/a.md': DATES_CHANGED }, ['TXT-1']],
  ['changes only the text before the first heading of specs/a.md, every section the same',
    { ...BASE, 'specs/a.md': 'Promises about invoices.\n\n' + file(DATES, TOTALS) },
    { 'specs/a.md': 'Promises about invoices and receipts.\n\n' + file(DATES, TOTALS) }, []],
  ['adds only specs/diagram.txt, a file under the root that is not .md', BASE, { 'specs/diagram.txt': 'invoice -> csv\n' }, []],
];

for (const [what, before, after, ids] of contrasts) {
  test(`[REC-10][REC-11][HNT-2][HNT-3] contrast: a tier-0 commit that ${what} is not ok, counting, and check --strict exits 1`, (t) => {
    const repo = onBranch(t, before);
    commitTier0(repo, after);
    assertTier0NotOk(repo, ids);
  });
}
