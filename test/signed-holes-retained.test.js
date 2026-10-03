// Issue #136: holes in what counts as signed, part 3 of 3: what a request
// retains and delivers (see signed-holes.test.js). Each is the tool not doing
// what specs/ already say, driven through the real CLI:
// (2) [STA-3][STA-7] a request with no change.md counts its own baseline
//     changes (in a commit on the branch carrying `Request: <name>`, or
//     uncommitted) as retained, so conclude --dropped refuses while it keeps
//     them, and check re-runs that rule on a request archived by hand [STA-8];
// (7) [REC-6][STA-4][STA-3] a revert and Dropped markers on a blocked request
//     that then retains nothing deliver no work;
// (9) [STA-6][STA-4] a Dropped marker (not Kept) on a version that another
//     request's work builds on does not lift the guard: a section carried by
//     a successor is never reverted, only kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, runAl } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { ENV, addRequest, assertRefused, both } from './helpers/request.js';
import { file } from './helpers/links.js';
import { assertCounts, check, hint, message, noHint, strict } from './helpers/hints.js';

const TIER1 = 'Type: story · Tier: 1 · Status: open';
const A1 = '## [A-1] Promise\nThe promise MUST say old.\n';
const A1B = '## [A-1] Promise\nThe promise MUST say new.\n';
const A2 = '## [A-2] Order\nThe order MUST be old.\n';

const al = (repo, ...args) => runAl(repo.dir, args, { env: ENV });
const ok = (r, what) => assert.equal(r.code, 0, `${what}:\n${both(r)}`);
const status = (repo) => repo.git(['status', '--porcelain', '--untracked-files=all']);
function context(repo, ...args) {
  const r = al(repo, 'context', ...args);
  ok(r, `context ${args.join(' ')}`);
  return r.stdout;
}
const firstLine = (out) => lines(out)[0];

// --- (2) a no-change.md request dropped while keeping its baseline edit ---

const ONE_LINE = '## Organized requirement\n\nR1: The promise MUST say new. Amends: [A-1]\n';
const DROP = '\n## Decisions\n\n- D1, 2026-09-22. Source: the owner. Drop this request.\n';
const T1 = 'requests/t1/request.md';

// Main: specs/rules.md with A-1 and A-2, and the tier-1 request t1 (no
// change.md; D1, the owner's decision to drop it), signed when `signed`. On
// the branch `work`, A-1 is edited when `edit` is 'committed' (in a commit
// carrying Request: t1) or 'uncommitted'.
function tier1(t, { signed, edit = null }) {
  const repo = makeRepo(t);
  repo.write('specs/rules.md', file(A1, A2));
  repo.commit('Baseline', { date: '2026-09-20T12:00:00Z' });
  addRequest(repo, 't1', null, { line: TIER1, org: ONE_LINE, signedText: ONE_LINE, signed, decisions: DROP });
  repo.commit('t1: request', { date: '2026-09-21T12:00:00Z' });
  assert.equal(/^BLOCKED/.test(firstLine(context(repo, 't1'))), !signed, `the fixture: t1 is ${signed ? 'signed' : 'blocked'}`);
  repo.git(['checkout', '-q', '-b', 'work']);
  if (edit) repo.write('specs/rules.md', file(A1B, A2));
  if (edit === 'committed') repo.commit(message('The promise says new', { request: 't1', tier: '1 — promise' }), { date: '2026-09-22T12:00:00Z' });
  return repo;
}

for (const signed of [false, true]) {
  for (const edit of ['committed', 'uncommitted']) {
    test(`#136 (2) [STA-3][STA-7] a ${signed ? 'signed' : 'blocked'} tier-1 request with no change.md whose own work edited A-1 (${edit}): conclude t1 --dropped D1 --yes refuses; the folder is not moved and nothing is written`, (t) => {
      const repo = tier1(t, { signed, edit });
      const before = status(repo);
      const md = repo.read(T1).toString();
      assertRefused(al(repo, 'conclude', 't1', '--dropped', 'D1', '--yes'));
      assert.ok(existsSync(join(repo.dir, T1)) && !existsSync(join(repo.dir, 'requests/archive/t1')), 'the folder is not moved');
      assert.equal(repo.read(T1).toString(), md, 'request.md is not written');
      assert.equal(repo.read('specs/rules.md').toString(), file(A1B, A2), 'the baseline is not touched');
      assert.equal(status(repo), before, 'nothing else is written');
    });
  }
}

test('#136 (2) [STA-7][REC-6] contrast: a blocked tier-1 request with no change.md and no baseline edit drops: exit 0, archived with Status: dropped', (t) => {
  const repo = tier1(t, { signed: false });
  ok(al(repo, 'conclude', 't1', '--dropped', 'D1', '--yes'), 'conclude --dropped');
  assert.ok(!existsSync(join(repo.dir, T1)), 'moved out of requests/t1');
  assert.match(repo.read('requests/archive/t1/request.md').toString(), /Status: dropped/);
});

test('#136 (2) [STA-8][HNT-2][HNT-3] a branch that archives blocked t1 by hand (Status: dropped, an Outcome) and keeps its A-1 edit: not ok, t1 no longer meets conclude\'s rules; check --strict exits 1', (t) => {
  const repo = tier1(t, { signed: false, edit: 'committed' });
  mkdirSync(join(repo.dir, 'requests/archive'), { recursive: true });
  repo.git(['mv', 'requests/t1', 'requests/archive/t1']);
  const md = 'requests/archive/t1/request.md';
  const text = repo.read(md).toString().replace('Status: open', 'Status: dropped');
  repo.write(md, `${text}\n## Outcome\n\n- Dropped as a whole by D1\n- R1 The promise MUST say new: in no section\n\nNotes:\n`);
  repo.commit(message('Drop t1', { request: 't1', tier: '1 — promise' }), { date: '2026-09-23T12:00:00Z' });
  assert.equal(repo.read('specs/rules.md').toString(), file(A1B, A2), 'the fixture: the A-1 edit is kept');
  assertCounts(hint(check(repo, '--all'), 'not ok', 'no longer meets conclude', 't1'));
  strict(repo, 1);
});

// --- (7) a revert and Dropped markers on a blocked request deliver no work ---

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const X_DECISIONS = '\n## Decisions\n\n- D1, 2026-09-21. Source: the owner. CSV only for now.\n';

// Main: x (signed, ORG) holds INV-3 (S0 to S1 for R2), consolidated. The
// branch changes x's R2 (so x is blocked), reverts INV-3 with consolidate
// --revert, marks the block Dropped (D2, the owner's), and commits that with
// Request: x.
function revertedWhileBlocked(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  addRequest(repo, 'x', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })], { decisions: X_DECISIONS });
  repo.commit('x: request, signed', { date: '2026-09-20T12:00:00Z' });
  ok(al(repo, 'consolidate', 'x', '--yes'), 'consolidate x');
  repo.commit(message('Consolidate x', { request: 'x', tier: '2 — dates' }), { date: '2026-09-21T12:00:00Z' });
  assert.equal(repo.read('specs/invoices.md').toString(), file(INV1, S1), 'the fixture: INV-3 consolidated on main');
  repo.git(['checkout', '-q', '-b', 'work']);
  const md = 'requests/x/request.md';
  repo.write(md, `${repo.read(md).toString().replace('Dates MUST show in ISO 8601.', 'Dates MUST show in ISO 8601, with the zone.')}` +
    '- D2, 2026-09-24. Source: the owner. Drop the date change.\n');
  assert.match(firstLine(context(repo, 'x')), /^BLOCKED/, 'the fixture: x is blocked');
  ok(al(repo, 'consolidate', 'x', '--revert', 'INV-3', '--yes'), 'consolidate --revert');
  const change = 'requests/x/change.md';
  const text = repo.read(change).toString();
  assert.ok(text.includes('### [INV-3]@1 modify   for R2\n'), 'the fixture: the block heading');
  repo.write(change, text.replace('### [INV-3]@1 modify   for R2\n', '### [INV-3]@1 modify   for R2   Dropped 2026-09-24 (D2)\n'));
  repo.commit(message('Drop the date change of x', { request: 'x', tier: '2 — dates' }), { date: '2026-09-24T12:00:00Z' });
  assert.equal(repo.read('specs/invoices.md').toString(), file(INV1, S0), 'the fixture: INV-3 is back to its "was"');
  assert.match(firstLine(context(repo, 'x')), /^BLOCKED/, 'the fixture: x is still blocked');
  return repo;
}

test('#136 (7) [REC-6][STA-4][STA-3] a branch that only reverts blocked x\'s section and marks its block Dropped (retaining nothing) delivers no work: no "delivers work for x" not ok; check --strict exits 0', (t) => {
  const repo = revertedWhileBlocked(t);
  noHint(check(repo, '--all'), 'not ok', 'delivers work for');
  strict(repo, 0);
});

test('#136 (7) [REC-6][HNT-2] contrast: the same branch also changing code in a commit carrying Request: x delivers work for blocked x: not ok, check --strict exits 1', (t) => {
  const repo = revertedWhileBlocked(t);
  repo.write('src/dates.js', 'export const format = "iso";\n');
  repo.commit(message('Date code', { request: 'x', tier: '2 — dates' }), { date: '2026-09-25T12:00:00Z' });
  assertCounts(hint(check(repo, '--all'), 'not ok', /delivers work for x\b/));
  strict(repo, 1);
});

// --- (9) a Dropped marker does not lift the carried guard ---

const P0 = '## [A-1] Promise\nThe promise MUST say old.\n';
const P1 = '## [A-1] Promise\nThe promise MUST say first.\n';
const P2 = '## [A-1] Promise\nThe promise MUST say later.\n';
const FIRST_BLOCK = '### [A-1]@1 modify   for R1\n';

// Main: the signed tier-2 requests first (A-1 old to first) and later (A-1
// first to later, building on first/A-1@1), both consolidated: the baseline
// says later. first's Decisions hold D1.
function carried(t) {
  const repo = makeRepo(t);
  repo.write('specs/rules.md', file('# Rules\n', P0));
  repo.commit('Baseline', { date: '2026-09-20T12:00:00Z' });
  addRequest(repo, 'first', [block(FIRST_BLOCK.slice(4, -1), { was: P0, now: P1 })],
    { decisions: '\n## Decisions\n\n- D1, 2026-09-22. Source: the owner. Drop first.\n' });
  addRequest(repo, 'later', [block('[A-1]@1 modify   for R1   builds on first/A-1@1', { was: P1, now: P2 })], { decisions: '' });
  repo.commit('first and later: requests', { date: '2026-09-21T12:00:00Z' });
  ok(al(repo, 'consolidate', 'first', '--yes'), 'consolidate first');
  ok(al(repo, 'consolidate', 'later', '--yes'), 'consolidate later');
  repo.commit('Consolidate first and later', { date: '2026-09-21T13:00:00Z' });
  assert.equal(repo.read('specs/rules.md').toString(), file('# Rules\n', P2), 'the fixture: the baseline says later');
  return repo;
}
// consolidate first --revert A-1, with and without --yes: refused, naming carried; nothing written.
function revertRefused(repo) {
  for (const extra of [[], ['--yes']]) {
    assertRefused(al(repo, 'consolidate', 'first', '--revert', 'A-1', ...extra), 'carried');
    assert.equal(repo.read('specs/rules.md').toString(), file('# Rules\n', P2), 'the baseline still says later');
    assert.equal(status(repo), '', 'nothing should be written');
  }
}

test('#136 (9) [STA-6][STA-4] contrast: consolidate first --revert A-1 refuses while later\'s block, building on first/A-1@1, carries it ("carried"); nothing written', (t) => {
  revertRefused(carried(t));
});

test('#136 (9) [STA-6][STA-4] first\'s block marked "Dropped 2026-09-22 (D1)", not Kept: consolidate first --revert A-1 still refuses ("carried"), with or without --yes, and specs/ still says later', (t) => {
  const repo = carried(t);
  const path = 'requests/first/change.md';
  const text = repo.read(path).toString();
  assert.ok(text.includes(FIRST_BLOCK), 'the fixture: first\'s block heading');
  repo.write(path, text.replace(FIRST_BLOCK, '### [A-1]@1 modify   for R1   Dropped 2026-09-22 (D1)\n'));
  repo.commit('Drop first\'s A-1', { date: '2026-09-22T12:00:00Z' });
  revertRefused(repo);
});
