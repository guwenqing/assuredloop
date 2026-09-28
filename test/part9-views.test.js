// Gaps in the views, from the architect's rulings for part 9:
// [VW-2] al context <name>'s Words line names each snapshot with its SHA-256
// re-checked, a tampered one "not ok"; [VW-3] context <ID> for a pending add
// shows each holder's "now"; [VW-4] the review view's intent lists only the
// blocks whose sections the branch changes, counted by state as [VW-2]@2 has
// it when they do not fit; [HNT-1] hidden hints are always counted, even when
// context <name>'s twelve lines leave no room for a hint line; and [VW-2] a
// chained add (add after an add in the same request) shows on another
// request's Same file line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, runAl, sha256 } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { ORG, addRequest, both, hasId, statusLine } from './helpers/request.js';
import { contextOf, contextDiff, file, indexOf, labelled } from './helpers/links.js';
import { viewHints } from './helpers/hints.js';
import { count } from './helpers/evidence.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const INV4A = '## [INV-4] Separator\nThe CSV separator is a comma.\n';
const INV4B = '## [INV-4] Separator\nThe CSV separator MUST be a semicolon.\n';
const INV5 = '## [INV-5] Cancelling\nAn invoice can be cancelled.\n';
const INV7 = '## [INV-7] CSV rows\nOne row per line item.\n';
const DECIDED = '\n## Decisions\n\n- D1, 2026-09-21. Source: the owner. CSV only for now.\n' +
  '- D2, 2026-09-24. Source: ruling by the agent (developer). Semicolon as separator.\n';

const ok = (r) => assert.equal(r.code, 0, both(r));
const ISSUE = 'Please add a CSV download to the invoice page.\n';
const snapshot = (text) => `Source: https://example.com/issues/31\nFetched: 2026-09-22T10:00Z\nSHA-256: ${sha256(ISSUE)}\n---\n${text}`;

// --- 7a [VW-2] the Words line re-checks each snapshot ---

function words(t, tampered) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  addRequest(repo, 'csv-export', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })], { decisions: DECIDED });
  repo.write('requests/csv-export/origin/2026-09-22-issue.md', snapshot(tampered ? `${ISSUE}And PDF too.\n` : ISSUE));
  repo.commit('csv-export', { date: '2026-09-22T12:00:00Z' });
  return repo;
}
const SNAPSHOTS = ['2026-09-20-owner-words.md', '2026-09-21-signoff.md', '2026-09-22-issue.md'];

test('[VW-2][REC-3] context <name>: the Words line names each snapshot in origin/, and marks the tampered one "not ok" on the line naming it', (t) => {
  const r = contextOf(words(t, true), 'csv-export');
  ok(r);
  const w = labelled(r.stdout, 'Words');
  assert.ok(w, `expected a line starting with Words:\n${r.stdout}`);
  for (const f of SNAPSHOTS) assert.ok(w.includes(f), `the Words line should name ${f}:\n${r.stdout}`);
  assert.ok(lines(w).some((l) => l.includes('2026-09-22-issue.md') && l.includes('not ok')),
    `the Words line naming 2026-09-22-issue.md should say "not ok":\n${r.stdout}`);
  assert.ok(lines(r.stdout).length <= 12, `more than 12 lines:\n${r.stdout}`);
});

test('[VW-2][REC-3] context <name>: with every snapshot matching its SHA-256, the Words line names each and says no "not ok"', (t) => {
  const r = contextOf(words(t, false), 'csv-export');
  ok(r);
  const w = labelled(r.stdout, 'Words');
  for (const f of SNAPSHOTS) assert.ok(w.includes(f), `the Words line should name ${f}:\n${r.stdout}`);
  assert.ok(!w.includes('not ok'), `nothing tampered:\n${r.stdout}`);
});

// --- 7b [VW-3] context <ID> of a pending add shows each holder's "now" ---

test('[VW-3] context <ID> for an ID not in the baseline, held by two open adds: each holder\'s "now" text shows', (t) => {
  const A = '## [INV-8] Export page\nThe invoice page MUST offer the export.\n';
  const B = '## [INV-8] Export page\nThe invoice page MUST offer the export as a button.\n';
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S1));
  addRequest(repo, 'csv-export', [block('[INV-8]@1 add after [INV-3]   for R1', { now: A })]);
  addRequest(repo, 'export-button', [block('[INV-8]@1 add after [INV-3]   for R1', { now: B })]);
  repo.commit('Records', { date: '2026-09-21T12:00:00Z' });
  const r = contextOf(repo, 'INV-8');
  ok(r);
  assert.ok(r.stdout.includes('not in the baseline'), r.stdout);
  for (const [name, now] of [['csv-export', A], ['export-button', B]]) {
    assert.ok(r.stdout.includes(name), `the holder ${name}:\n${r.stdout}`);
    const body = now.split('\n')[1];
    assert.ok(lines(r.stdout).some((l) => l.trim() === body || l.trimEnd().endsWith(` ${body}`)), `${name}'s "now", "${body}", should show:\n${r.stdout}`);
  }
});

// --- 7c [VW-4] the review view's intent lists only the blocks the branch changes ---

function review(repo) {
  const r = contextDiff(repo, 'main...HEAD', '--for', 'review');
  ok(r);
  const ls = lines(r.stdout);
  const i = indexOf(ls, /^[#\s]*Intent\b/i);
  assert.ok(i >= 0, `expected an Intent line or header:\n${r.stdout}`);
  const e = indexOf(ls, /^[#\s]*Evidence\b/i, i + 1);
  assert.ok(e > i, `expected an Evidence line or header after the Intent one:\n${r.stdout}`);
  return { out: r.stdout, intent: ls.slice(i, e) };
}

test('[VW-4] --for review, intent: of the served request\'s three blocks, only INV-4, whose section the branch changes, is named', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0, INV4A, INV5));
  addRequest(repo, 'csv-export', [
    block('[INV-3]@1 modify   for R2', { was: S0, now: S1 }),
    block('[INV-4]@1 modify   for R1', { was: INV4A, now: INV4B }),
    block('[INV-7]@1 add after [INV-4]   for R1', { now: INV7 }),
  ], { decisions: DECIDED });
  repo.commit('Records', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'separator']);
  repo.write('specs/invoices.md', file(INV1, S0, INV4B, INV5));
  repo.commit('Semicolon separator\n\nRequest: csv-export', { date: '2026-09-22T12:00:00Z' });

  const { out, intent } = review(repo);
  assert.ok(intent.some((l) => hasId(l, 'INV-4')), `the intent part names INV-4, which the branch changes:\n${out}`);
  for (const id of ['INV-3', 'INV-7']) {
    assert.ok(!intent.some((l) => hasId(l, id)), `the branch does not change ${id}; the intent part should not name it:\n${out}`);
  }
});

const W = (n) => `## [INV-${n}] Rule ${n}\nRule ${n} holds.\n`;
const N = (n) => `## [INV-${n}] Rule ${n}\nRule ${n} MUST hold.\n`;
const X = (n) => `## [INV-${n}] Rule ${n}\nRule ${n} MUST NOT hold.\n`;
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

test('[VW-4][VW-2]@2 --for review, intent: 28 changed sections do not fit on one line, so one line with the count in each state, naming every one except the consolidated or pending; INV-42, which the branch leaves alone, is not counted', (t) => {
  const consolidated = range(11, 30); // W at base, N at head
  const pending = range(31, 35); // X at base, W at head
  const differs = [36, 37]; // W at base, X at head
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, ...consolidated.map(W), ...pending.map(X), ...differs.map(W), W(38), X(42)));
  addRequest(repo, 'big-change', [...consolidated, ...pending, ...differs, 38, 42].map((n) => block(`[INV-${n}]@1 modify   for R1`, { was: W(n), now: N(n) })),
    { decisions: DECIDED });
  repo.commit('Records', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'big']);
  // INV-38 is taken out of the baseline: not found. INV-42 stays X: differs, but the branch does not change it.
  repo.write('specs/invoices.md', file(INV1, ...consolidated.map(N), ...pending.map(W), ...differs.map(X), X(42)));
  repo.commit('Many sections\n\nRequest: big-change', { date: '2026-09-22T12:00:00Z' });

  const { out, intent } = review(repo);
  const text = intent.join('\n');
  const line = intent.find((l) => count(consolidated.length, 'consolidated').test(l));
  assert.ok(line, `the intent part should give ${consolidated.length} consolidated:\n${out}`);
  // One line, far shorter than listing all 28 blocks (well over 800 characters).
  assert.ok(line.length < 160, `the line with the counts should be far shorter than the full list, under 160 characters, got ${line.length}:\n${line}`);
  for (const [n, state] of [[pending.length, 'pending'], [differs.length, 'differs'], [1, 'not found']]) {
    assert.match(text, count(n, state), `the intent part should give ${n} ${state}:\n${out}`);
  }
  for (const n of [...differs, 38]) assert.ok(intent.some((l) => hasId(l, `INV-${n}`)), `the intent part should name INV-${n}:\n${out}`);
  for (const n of [...consolidated, ...pending, 42]) {
    assert.ok(!intent.some((l) => hasId(l, `INV-${n}`)), `the intent part should not name INV-${n}:\n${out}`);
  }
});

// --- 7d [HNT-1] hidden hints are always counted ---

test('[HNT-1][VW-2] context <name> of an open request with BLOCKED, Require, Words, Decided, Spec, Parts and Same file lines: the hints not shown are counted, with --all, in twelve lines', (t) => {
  const ORG_R2 = ORG.replace('Dates MUST show in ISO 8601.', 'Dates MUST show in ISO 8601, with the time zone.');
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, '## [INV-3] Dates\nDates MUST show in RFC 3339.\n', INV4A, INV5));
  addRequest(repo, 'csv-export', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })],
    { org: ORG_R2, decisions: DECIDED, rest: '\n## Parts\n\n1. CSV export\n2. Email link\n' });
  repo.write('requests/csv-export/origin/2026-09-22-issue.md', snapshot(`${ISSUE}And PDF too.\n`));
  addRequest(repo, 'cancel-invoices', [block('[INV-5]@1 modify   for R1', { was: INV5, now: INV5.replace('can be', 'MUST be able to be') })]);
  repo.commit('Records', { date: '2026-09-22T12:00:00Z' });

  const all = runAl(repo.dir, ['context', 'csv-export', '--all']);
  ok(all);
  const hints = viewHints(all.stdout);
  assert.ok(hints.length >= 2, `the fixture: csv-export owns hints (INV-3 differs, a tampered snapshot):\n${all.stdout}`);

  const r = contextOf(repo, 'csv-export');
  ok(r);
  const ls = lines(r.stdout);
  assert.match(ls[0], /^BLOCKED/, `the fixture: csv-export is blocked:\n${r.stdout}`);
  for (const label of ['Require', 'Words', 'Decided', 'Spec', 'Parts', 'Same file']) {
    assert.ok(ls.some((l) => l.startsWith(label)), `the fixture: a ${label} line:\n${r.stdout}`);
  }
  assert.ok(ls.length <= 12, `more than 12 lines:\n${r.stdout}`);
  // Every hint not on a line of its own is counted as hidden.
  const hidden = hints.length - viewHints(r.stdout).length;
  if (hidden > 0) {
    assert.ok(r.stdout.includes(`${hidden} more hidden`), `the output should say "${hidden} more hidden":\n${r.stdout}`);
    assert.ok(r.stdout.includes('--all'), `the output should mention --all:\n${r.stdout}`);
  }
});

// csv-export, archived with three sections and followed by tz, is BLOCKED
// (R2 changed since its sign-off) and owns a hint (a tampered snapshot).
function archivedBlocked(t) {
  const INV4B7 = [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 }),
    block('[INV-4]@1 modify   for R1', { was: INV4A, now: INV4B }), block('[INV-7]@1 add after [INV-4]   for R1', { now: INV7 })];
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0, INV4A));
  addRequest(repo, 'csv-export', INV4B7, { org: ORG.replace('ISO 8601.', 'ISO 8601, with the time zone.'), decisions: DECIDED,
    rest: '\n## Parts\n\n1. CSV export\n2. Email link\n' });
  repo.write('requests/csv-export/origin/2026-09-22-issue.md', snapshot(`${ISSUE}And PDF too.\n`));
  repo.commit('csv-export', { date: '2026-09-21T12:00:00Z' });
  repo.write('specs/invoices.md', file(INV1, S1, INV4B, INV7));
  mkdirSync(join(repo.dir, 'requests/archive'), { recursive: true });
  repo.git(['mv', 'requests/csv-export', 'requests/archive/csv-export']);
  const md = repo.read('requests/archive/csv-export/request.md').toString().replace('Status: open', 'Status: concluded');
  repo.write('requests/archive/csv-export/request.md', `${md}\n## Outcome\n\n- Added: [INV-7]\n- Modified: [INV-3], [INV-4]\n`);
  repo.commit('Conclude csv-export\n\nRequest: csv-export', { date: '2026-09-22T12:00:00Z' });
  addRequest(repo, 'tz', null, { line: `${statusLine('open')} · Follows: csv-export` });
  repo.commit('tz', { date: '2026-09-23T12:00:00Z' });
  return repo;
}

test('[HNT-1][VW-2] context <name> of an archived, BLOCKED request whose twelve lines leave no room for a hint line (Concluded, Sections, Followed by, Require, Words, Decided, Parts): it still says how many hints are hidden and mentions --all, in twelve lines', (t) => {
  const repo = archivedBlocked(t);
  const all = runAl(repo.dir, ['context', 'csv-export', '--all']);
  ok(all);
  const r = contextOf(repo, 'csv-export');
  ok(r);
  const ls = lines(r.stdout);
  assert.match(ls[0], /^BLOCKED/, `the fixture: csv-export is blocked:\n${r.stdout}`);
  for (const label of ['Concluded', 'Sections', 'Followed by', 'Require', 'Words', 'Decided', 'Parts']) {
    assert.ok(ls.some((l) => l.startsWith(label)), `the fixture: a ${label} line:\n${r.stdout}`);
  }
  assert.ok(ls.length <= 12, `more than 12 lines:\n${r.stdout}`);
  const hidden = Math.max(viewHints(all.stdout).length, 1) - viewHints(r.stdout).length;
  assert.ok(hidden > 0, `the fixture: twelve lines leave no room for csv-export's hint:\n${r.stdout}`);
  assert.ok(r.stdout.includes(`${hidden} more hidden`), `the output should say "${hidden} more hidden":\n${r.stdout}`);
  assert.ok(r.stdout.includes('--all'), `the output should mention --all:\n${r.stdout}`);
});

// --- 7e [VW-2] a chained add on another request's Same file line ---

test('[VW-2] a chained add (NEW-2 after NEW-1, itself added in specs/x.md by the same request) shows on the Same file line of another request holding a section in specs/x.md', (t) => {
  const X1 = '## [XS-1] First\nThe first rule.\n';
  const repo = makeRepo(t);
  repo.write('specs/x.md', X1);
  addRequest(repo, 'adds-two', [
    block('[NEW-1]@1 add in specs/x.md   for R1', { now: '## [NEW-1] New one\nA new rule.\n' }),
    block('[NEW-2]@1 add after [NEW-1]   for R1', { now: '## [NEW-2] New two\nAnother new rule.\n' }),
  ]);
  addRequest(repo, 'edits-first', [block('[XS-1]@1 modify   for R1', { was: X1, now: X1.replace('The first', 'The very first') })]);
  repo.commit('Records', { date: '2026-09-21T12:00:00Z' });
  const r = contextOf(repo, 'edits-first');
  ok(r);
  const same = labelled(r.stdout, 'Same file');
  assert.ok(same.includes('adds-two'), `the Same file line should name adds-two:\n${r.stdout}`);
  assert.ok(hasId(same, 'NEW-2'), `the Same file line should name NEW-2, added after NEW-1 in specs/x.md:\n${r.stdout}`);
});
