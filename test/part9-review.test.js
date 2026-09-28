// Findings of the review of PR #87 (part 9), each from the spec text:
// [VW-7] audit dates a removal's consolidation at the commit where the
// section went from present to absent [STA-2] row 2; [VW-7][LNK-2] audit's
// linked commits include those mapped by an issue number in the owner's
// words; [VW-5] the spec overlay shows every open change, a chained add and
// an add into a file not in the baseline yet included; [VW-8] check --at X
// reads main only up to X's fork from it, keeps the per-commit append-only
// check [REC-12], and says so on its Not known line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { addRequest, both, lineWith } from './helpers/request.js';
import { file } from './helpers/links.js';
import { checkHints } from './helpers/hints.js';
import { short } from './helpers/evidence.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const INV3 = '## [INV-3] Dates\nDates MUST show ISO dates.\n';
const INV7 = '## [INV-7] CSV\nOne row per invoice.\n';
const INV8 = '## [INV-8] Email\nEmail a CSV link.\n';
const NEW1 = '## [NEW-1] New file\nNew promise.\n';

const ok = (r) => assert.equal(r.code, 0, both(r));
const audit = (repo, name) => runAl(repo.dir, ['context', name, '--audit']);
const notKnown = (out) => lines(out).at(-1) ?? '';

// --- 1. [VW-7] a removal is consolidated where the section went away ---

test('[VW-7][STA-2] audit dates a remove block\'s consolidation at the commit that took the section out, not at a commit from before the section existed', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  const m1 = repo.commit('Baseline before Dates', { date: '2026-09-01T12:00:00Z' });
  repo.write('specs/invoices.md', file(INV1, INV3));
  const m2 = repo.commit('Add Dates', { date: '2026-09-02T12:00:00Z' });
  addRequest(repo, 'remove-dates', [block('[INV-3]@1 remove, was after [INV-1]   for R2', { was: INV3 })]);
  repo.commit('Record the removal\n\nRequest: remove-dates', { date: '2026-09-03T12:00:00Z' });
  repo.write('specs/invoices.md', INV1);
  const m3 = repo.commit('Remove Dates\n\nRequest: remove-dates', { date: '2026-09-04T12:00:00Z' });

  const r = audit(repo, 'remove-dates');
  ok(r);
  const line = lineWith(r.stdout, 'INV-3', /consolidated/);
  assert.ok(line, `expected a line saying when INV-3 was consolidated:\n${r.stdout}`);
  assert.ok(line.includes(short(m3)), `INV-3 went from present to absent in ${short(m3)}:\n${line}`);
  for (const [what, c] of [['m1, before INV-3 existed', m1], ['m2, which added INV-3', m2]]) {
    assert.ok(!line.includes(short(c)), `the consolidation should not be dated at ${what} (${short(c)}):\n${line}`);
  }
});

// --- 2. [VW-7][LNK-2] a commit mapped by an issue number is linked ---

test('[VW-7][LNK-2] audit lists a commit mapped to the request by an issue number in its owner\'s words (#35), with the test file it changed; not a commit naming #350', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  addRequest(repo, 'csv', null);
  const md = repo.read('requests/csv/request.md').toString().replace('- 2026-09-20 owner chat,', '- 2026-09-20 owner chat, issue #35,');
  repo.write('requests/csv/request.md', md);
  repo.commit('Record csv', { date: '2026-09-21T12:00:00Z' });
  repo.write('src/download.js', 'export const downloadCsv = () => 35;\n');
  repo.write('test/download.test.js', 'assert.equal(downloadCsv(), 35);\n');
  const c = repo.commit('Implement invoice download #35', { date: '2026-09-22T12:00:00Z' });
  repo.write('src/refunds.js', 'export const refund = () => 350;\n');
  repo.write('test/refunds.test.js', 'assert.equal(refund(), 350);\n');
  const other = repo.commit('Refunds #350', { date: '2026-09-23T12:00:00Z' });
  assert.equal(repo.git(['show', '--name-only', '--format=', c]), 'src/download.js\ntest/download.test.js', 'the fixture: c touches no request folder');

  const r = audit(repo, 'csv');
  ok(r);
  assert.ok(r.stdout.includes(short(c)), `the commit mapped by issue #35, ${short(c)}, is a linked commit:\n${r.stdout}`);
  assert.ok(r.stdout.includes('test/download.test.js'), `the test file ${short(c)} changed:\n${r.stdout}`);
  assert.ok(!r.stdout.includes(short(other)), `#350 is another issue:\n${r.stdout}`);
  assert.ok(!r.stdout.includes('test/refunds.test.js'), `#350 is another issue:\n${r.stdout}`);
});

// --- 3. [VW-5] the overlay shows every open change ---

// csv adds INV-7 after INV-1, INV-8 after INV-7, and NEW-1 in specs/new.md,
// a file the baseline does not have yet.
function overlay(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  addRequest(repo, 'csv', [
    block('[INV-7]@1 add after [INV-1]   for R1', { now: INV7 }),
    block('[INV-8]@1 add after [INV-7]   for R3', { now: INV8 }),
    block('[NEW-1]@1 add in specs/new.md   for R1', { now: NEW1 }),
  ]);
  repo.commit('Proposed CSV chain and a new file', { date: '2026-09-21T12:00:00Z' });
  return repo;
}
// The index of the first line at or after `from` naming `key` and pending; then every line of `now` indented after it.
function shown(ls, from, key, now, out) {
  const i = ls.findIndex((l, k) => k >= from && l.includes(key) && l.includes('pending'));
  assert.ok(i >= 0, `expected a line naming ${key} and pending:\n${out}`);
  let j = i;
  for (const want of now.split('\n').filter(Boolean)) {
    const k = ls.findIndex((l, n) => n > j && /^\s{2,}\S/.test(l) && l.trim() === want);
    assert.ok(k > j, `${key}'s "now" line "${want}" should follow, indented:\n${out}`);
    j = k;
  }
  return i;
}

test('[VW-5] spec shows a chained add after the add it follows (INV-7 then INV-8, after INV-1\'s text), and an add into a new file under a line naming it, each with its state and "now"', (t) => {
  const repo = overlay(t);
  const r = runAl(repo.dir, ['spec']);
  ok(r);
  const ls = lines(r.stdout);
  const inv1 = ls.findLastIndex((l) => l === '## [INV-1] Totals');
  assert.ok(inv1 >= 0, `the text should hold INV-1's heading:\n${r.stdout}`);
  const inv7 = shown(ls, inv1, 'csv/INV-7@1', INV7, r.stdout);
  const inv8 = shown(ls, inv1, 'csv/INV-8@1', INV8, r.stdout);
  assert.ok(inv7 < inv8, `INV-8 is added after INV-7:\n${r.stdout}`);
  const path = ls.findIndex((l) => l.includes('specs/new.md'));
  assert.ok(path >= 0, `a line should name specs/new.md:\n${r.stdout}`);
  shown(ls, path, 'csv/NEW-1@1', NEW1, r.stdout);
});

test('[VW-5] spec --list names all three open blocks with their state', (t) => {
  const repo = overlay(t);
  const r = runAl(repo.dir, ['spec', '--list']);
  ok(r);
  for (const key of ['csv/INV-7@1', 'csv/INV-8@1', 'csv/NEW-1@1']) {
    assert.ok(lineWith(r.stdout, key, 'pending'), `expected a line naming ${key} and pending:\n${r.stdout}`);
  }
});

// --- 4. [VW-8] check --at X reads main only up to X's fork ---

// Main: the unsigned request csv. Branch work: x, work for csv. HEAD is work.
function blockedBranch(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  addRequest(repo, 'csv', null, { signed: false });
  repo.commit('Unsigned request on main', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('src/branch.js', 'export const branch = 1;\n');
  const x = repo.commit('Branch work\n\nTier: 0 — work\nRequest: csv', { date: '2026-09-22T12:00:00Z' });
  return { repo, x };
}
// A commit of work for csv on main, after x forked; HEAD back on work.
function mainMoves(repo) {
  repo.git(['checkout', '-q', 'main']);
  repo.write('src/future.js', 'export const future = 2;\n');
  const future = repo.commit('Future work on main\n\nRequest: csv', { date: '2026-09-23T12:00:00Z' });
  repo.git(['checkout', '-q', 'work']);
  return future;
}
const checkAt = (repo, x) => {
  const r = runAl(repo.dir, ['check', '--at', x, '--all']);
  ok(r);
  return r.stdout;
};

test('[VW-8] check --at X gives the same hints before and after main moves on: none names a main commit made after X forked', (t) => {
  const { repo, x } = blockedBranch(t);
  const before = checkAt(repo, x);
  const future = mainMoves(repo);
  const after = checkAt(repo, x);
  assert.ok(!after.includes(short(future)), `${short(future)} was made on main after ${short(x)} forked:\n${after}`);
  assert.deepEqual(checkHints(after), checkHints(before), `the same hints at ${short(x)}:\n--- before ---\n${before}\n--- after ---\n${after}`);
});

test('[VW-8][REC-12] check --at X keeps the per-commit append-only check over main..X, after main moves on too', (t) => {
  const { repo } = blockedBranch(t);
  const words = 'requests/csv/origin/2026-09-20-owner-words.md';
  repo.write(words, `${repo.read(words)}Edited after writing.\n`);
  const edit = repo.commit('Edit a snapshot', { date: '2026-09-22T13:00:00Z' });
  repo.write('src/branch.js', 'export const branch = 2;\n');
  const x = repo.commit('More branch work\n\nRequest: csv', { date: '2026-09-22T14:00:00Z' });
  mainMoves(repo);
  const out = checkAt(repo, x);
  assert.ok(lines(out).some((l) => l.includes('not ok') && l.includes(short(edit)) && l.includes('origin/2026-09-20-owner-words.md')),
    `a "not ok" line should name ${short(edit)} and the edited snapshot:\n${out}`);
});

test('[VW-8][VW-9] check --at X: the Not known line says main was read only up to X\'s fork point', (t) => {
  const { repo, x } = blockedBranch(t);
  mainMoves(repo);
  const out = checkAt(repo, x);
  assert.match(notKnown(out), /^Not known\b.*(--at|\bmain\b)/, `the Not known line should say main was read only up to ${short(x)}'s fork point:\n${out}`);
});
