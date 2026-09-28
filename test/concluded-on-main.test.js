// al context <name> for an archived request [STA-8]: whether it is concluded
// on main is derived from main's history, the commit that added
// requests/archive/<name>/request.md; no commit ID is recorded [REC-9]; a
// closed request is never re-checked against today's baseline. Acceptance C2
// (after a squash, a fresh clone derives the concluding commit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, cloneRepo, runAl } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { ENV, addRequest, both, outcome } from './helpers/request.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const S0 = '## [INV-3] Dates\nDates show in the customer\'s local format.\n';
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const S3 = '## [INV-3] Dates\nDates MUST show in ISO 8601, with the time zone, to the second.\n';
const file = (...sections) => sections.join('\n');
const OUTCOME = '\n## Outcome\n\n' +
  '- R1 Invoice export: in no section\n- R2 Dates: in [INV-3]\n- R3 Email link: in no section\n' +
  '- Added: none\n- Modified: [INV-3]\n- Removed: none\n- Dropped: none\n- Kept: none\n' +
  '- Decisions: D1, D3, D4\n- Agent rulings: D2\n';

// On main: the request `inv` holding INV-3, consolidated in `baseline`.
function openRequest(t, baseline = file(INV1, S1)) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', baseline);
  addRequest(repo, 'inv', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  repo.commit('open inv', { date: '2026-09-21T10:00:00Z' });
  return repo;
}
// Archived by hand, as conclude leaves it: the folder moved, the Status set, an Outcome.
function archiveByHand(repo) {
  mkdirSync(join(repo.dir, 'requests/archive'), { recursive: true });
  repo.git(['mv', 'requests/inv', 'requests/archive/inv']);
  const md = repo.read('requests/archive/inv/request.md').toString().replace('Status: open', 'Status: concluded');
  repo.write('requests/archive/inv/request.md', md + OUTCOME);
}
const context = (repo) => runAl(repo.dir, ['context', 'inv'], { env: ENV });
const concluded = (r) => lines(r.stdout).find((l) => /^Concluded\b/.test(l));
const ok = (r) => assert.equal(r.code, 0, both(r));

// A Concluded line on main naming `id`, and no section states against today's baseline.
function assertOnMain(r, id) {
  ok(r);
  const line = concluded(r);
  assert.ok(line, `expected a line starting with Concluded:\n${r.stdout}`);
  assert.ok(line.includes('on main') && !line.includes('not on main'), `should say on main:\n${line}`);
  assert.ok(line.includes(id.slice(0, 7)), `should name the commit on main that added the archived request.md, ${id.slice(0, 7)}:\n${line}`);
}
function assertNoStates(r) {
  assert.ok(!lines(r.stdout).some((l) => /^Spec\b/.test(l)), `no Spec line for a closed request:\n${r.stdout}`);
  assert.ok(!r.stdout.includes('differs'), `a closed request is not checked against today's baseline:\n${r.stdout}`);
}

test('[STA-8] context of a request archived on this branch only: "Concluded ... not on main yet", no Spec line, and no "differs" after the baseline moved on', (t) => {
  const repo = openRequest(t);
  const open = context(repo);
  ok(open);
  assert.ok(!concluded(open), `an open request is not concluded:\n${open.stdout}`);
  assert.ok(lines(open.stdout).some((l) => /^Spec\b/.test(l)), open.stdout);

  repo.git(['checkout', '-q', '-b', 'conclude-inv']);
  archiveByHand(repo);
  repo.commit('conclude inv', { date: '2026-09-22T10:00:00Z' });
  const r = context(repo);
  ok(r);
  assert.ok(concluded(r)?.includes('not on main yet'), `expected "Concluded ... not on main yet":\n${r.stdout}`);
  assertNoStates(r);
  assertFrame(r.stdout);

  repo.write('specs/invoices.md', file(INV1, S3));
  repo.commit('hotfix INV-3', { date: '2026-09-23T10:00:00Z' });
  const later = context(repo);
  ok(later);
  assert.ok(concluded(later)?.includes('not on main yet'), later.stdout);
  assertNoStates(later);
});

test('[STA-8] once the archiving commit reaches main (fast-forward), context names it; a later commit on main does not change it, and the moved baseline shows no "differs"', (t) => {
  const repo = openRequest(t);
  repo.git(['checkout', '-q', '-b', 'conclude-inv']);
  archiveByHand(repo);
  const archivedAt = repo.commit('conclude inv', { date: '2026-09-22T10:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  repo.git(['merge', '-q', '--ff-only', 'conclude-inv']);
  const r = context(repo);
  assertOnMain(r, archivedAt);
  assertNoStates(r);
  assertFrame(r.stdout);

  repo.write('specs/invoices.md', file(INV1, S3));
  repo.commit('hotfix INV-3', { date: '2026-09-23T10:00:00Z' });
  const later = context(repo);
  assertOnMain(later, archivedAt);
  assertNoStates(later);
});

test('C2 [STA-8][REC-9] after a squash merge, a fresh clone derives the concluding commit (the squash), and the Outcome holds none of the repo\'s commit IDs', (t) => {
  const repo = openRequest(t, file(INV1, S0));
  repo.git(['checkout', '-q', '-b', 'inv-part-1']);
  ok(runAl(repo.dir, ['consolidate', 'inv', '--yes'], { env: ENV }));
  repo.commit('consolidate inv', { date: '2026-09-22T10:00:00Z' });
  ok(runAl(repo.dir, ['conclude', 'inv', '--yes'], { env: ENV }));
  repo.commit('conclude inv', { date: '2026-09-22T11:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  repo.git(['merge', '-q', '--squash', 'inv-part-1']);
  const squash = repo.commit('inv (#12)', { date: '2026-09-23T10:00:00Z' });

  const clone = cloneRepo(t, repo);
  const r = context(clone);
  assertOnMain(r, squash);
  assertNoStates(r);
  assertFrame(r.stdout, { main: 'origin/main' });

  const md = clone.read('requests/archive/inv/request.md').toString();
  assert.ok(outcome(md).generated.includes('- Modified: [INV-3]'), `the Outcome is there:\n${md}`);
  for (const id of repo.git(['rev-list', '--all']).split('\n')) {
    assert.ok(!md.includes(id.slice(0, 7)), `request.md should hold no commit ID, found ${id.slice(0, 7)}:\n${md}`);
  }
});
