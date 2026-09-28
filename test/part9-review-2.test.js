// Findings of the second review of PR #87 (part 9), each from the spec text:
// [VW-7] when a section was consolidated is the request's own consolidation,
// not an earlier or a later commit where the baseline happened to match its
// "now" (a removal, a removal undone and redone by later requests; an add
// whose text the baseline held before the request existed); [VW-5] a chained
// add into a file not in the baseline yet is shown under that file's line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { ENV, addRequest, both, lineWith, statusLine } from './helpers/request.js';
import { file } from './helpers/links.js';
import { short } from './helpers/evidence.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const INV3 = '## [INV-3] Dates\nDates MUST show ISO dates.\n';

const ok = (r) => assert.equal(r.code, 0, both(r));
const al = (repo, ...args) => {
  const r = runAl(repo.dir, args, { env: ENV });
  ok(r);
  return r.stdout;
};
// The audit's line saying when `key` was consolidated.
function consolidatedLine(repo, name, key) {
  const out = al(repo, 'context', name, '--audit');
  const line = lineWith(out, key, /consolidated/);
  assert.ok(line, `expected a line saying when ${key} was consolidated:\n${out}`);
  return line;
}

// --- 1. [VW-7] a request's own consolidation date ---

test('[VW-7][STA-2] an archived removal keeps its own consolidation date: remove-dates/INV-3@1 at R1, where it took INV-3 out, not R2, where remove-again took it out again after restore-dates put it back', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, INV3));
  repo.commit('Baseline with Dates', { date: '2026-09-01T12:00:00Z' });
  addRequest(repo, 'remove-dates', [block('[INV-3]@1 remove, was after [INV-1]   for R2', { was: INV3 })]);
  repo.commit('Record the removal\n\nRequest: remove-dates', { date: '2026-09-02T12:00:00Z' });
  al(repo, 'consolidate', 'remove-dates', '--section', 'INV-3', '--yes');
  const r1 = repo.commit('Remove Dates\n\nRequest: remove-dates', { date: '2026-09-03T12:00:00Z' });
  al(repo, 'conclude', 'remove-dates', '--yes');
  repo.commit('Conclude remove-dates\n\nRequest: remove-dates', { date: '2026-09-04T12:00:00Z' });

  addRequest(repo, 'restore-dates', [block('[INV-3]@1 add after [INV-1]   builds on remove-dates/INV-3@1   for R2', { now: INV3 })],
    { line: `${statusLine('open')} · Follows: remove-dates` });
  repo.commit('Record the restoration\n\nRequest: restore-dates', { date: '2026-09-05T12:00:00Z' });
  al(repo, 'consolidate', 'restore-dates', '--section', 'INV-3', '--yes');
  repo.commit('Restore Dates\n\nRequest: restore-dates', { date: '2026-09-06T12:00:00Z' });
  al(repo, 'conclude', 'restore-dates', '--yes');
  repo.commit('Conclude restore-dates\n\nRequest: restore-dates', { date: '2026-09-07T12:00:00Z' });

  addRequest(repo, 'remove-again', [block('[INV-3]@1 remove, was after [INV-1]   for R2', { was: INV3 })],
    { line: `${statusLine('open')} · Follows: restore-dates` });
  repo.commit('Record the later removal\n\nRequest: remove-again', { date: '2026-09-08T12:00:00Z' });
  al(repo, 'consolidate', 'remove-again', '--section', 'INV-3', '--yes');
  const r2 = repo.commit('Remove Dates again\n\nRequest: remove-again', { date: '2026-09-09T12:00:00Z' });
  assert.ok(!repo.read('specs/invoices.md').toString().includes('[INV-3]'), 'the fixture: INV-3 is out of the baseline again');

  const line = consolidatedLine(repo, 'remove-dates', 'remove-dates/INV-3@1');
  assert.ok(line.includes(short(r1)), `remove-dates took INV-3 out at ${short(r1)} (remove-again at ${short(r2)}):\n${line}`);
  assert.ok(!line.includes(short(r2)), `${short(r2)} is remove-again's removal, not remove-dates':\n${line}`);
});

test('[VW-7][STA-2] an add whose "now" the baseline held before the request existed is dated at the request\'s own consolidating commit, not the earlier one', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, INV3));
  const early = repo.commit('Baseline with Dates', { date: '2026-09-01T12:00:00Z' });
  repo.write('specs/invoices.md', INV1);
  repo.commit('Drop Dates', { date: '2026-09-02T12:00:00Z' });
  addRequest(repo, 'add-dates', [block('[INV-3]@1 add after [INV-1]   for R2', { now: INV3 })]);
  repo.commit('Record the addition\n\nRequest: add-dates', { date: '2026-09-03T12:00:00Z' });
  al(repo, 'consolidate', 'add-dates', '--section', 'INV-3', '--yes');
  const own = repo.commit('Add Dates\n\nRequest: add-dates', { date: '2026-09-04T12:00:00Z' });
  assert.equal(repo.read('specs/invoices.md').toString(), file(INV1, INV3), 'the fixture: the baseline holds INV-3 as at the early commit');

  const line = consolidatedLine(repo, 'add-dates', 'add-dates/INV-3@1');
  assert.ok(line.includes(short(own)), `add-dates consolidated INV-3 at ${short(own)} (the early baseline was ${short(early)}):\n${line}`);
  assert.ok(!line.includes(short(early)), `${short(early)} predates add-dates:\n${line}`);
});

// --- 2. [VW-5] a chained add in a new file, under its file ---

// NEW-1 is added in specs/new.md, a file not in the baseline; NEW-2 after NEW-1.
function newFile(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  addRequest(repo, 'new-file', [
    block('[NEW-1]@1 add in specs/new.md   for R1', { now: '## [NEW-1] New file\nNew promise.\n' }),
    block('[NEW-2]@1 add after [NEW-1]   for R2', { now: '## [NEW-2] New dates\nDates promise.\n' }),
  ]);
  repo.commit('New-file additions', { date: '2026-09-21T12:00:00Z' });
  return repo;
}
// After the last line naming specs/new.md: NEW-1's then NEW-2's block line
// with pending, and no line naming another spec file between; no line says
// "no file named".
function underNewFile(out) {
  assert.ok(!/no file named/.test(out), `no line may say "no file named":\n${out}`);
  const ls = lines(out);
  const p = ls.findLastIndex((l) => l.includes('specs/new.md'));
  assert.ok(p >= 0, `a line should name specs/new.md:\n${out}`);
  const at = (key) => ls.findIndex((l, i) => i > p && l.includes(key) && l.includes('pending'));
  const [one, two] = [at('new-file/NEW-1@1'), at('new-file/NEW-2@1')];
  assert.ok(one > p && two > one, `NEW-1 then NEW-2, pending, should follow the line naming specs/new.md:\n${out}`);
  const between = ls.slice(p + 1, two).find((l) => /specs\/(?!new\.md)[\w./-]+\.md/.test(l));
  assert.ok(!between, `NEW-2 should stay under specs/new.md, not under "${between}":\n${out}`);
}

test('[VW-5] spec shows a chained add in a new file (NEW-2 after NEW-1, in specs/new.md) under the line naming specs/new.md', (t) => {
  underNewFile(al(newFile(t), 'spec'));
});

test('[VW-5] spec --list shows a chained add in a new file under the line naming specs/new.md', (t) => {
  underNewFile(al(newFile(t), 'spec', '--list'));
});
