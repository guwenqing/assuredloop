// al conclude <name> [--dropped <Dn>] [--yes] [STA-7] [STA-6] [STA-3]: it
// reads the working tree and refuses (exit 1) unless the sign-off is current
// and every held block is consolidated, carried, Dropped while retaining
// nothing, or validly Kept; --dropped needs no sign-off when every block
// retains nothing [REC-6]. With --yes it writes the Outcome [REC-9], sets the
// Status and moves the folder to requests/archive/ [REC-1]. It prints at most
// three lines under the [VW-9] frame. Acceptance C2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, runAl } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { D4, DECISIONS, ENV, ORG, addRequest, assertRefused, both, expectState, lineWith, outcome, statusLine } from './helpers/request.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const INV2 = '## [INV-2] Format\nThe export format is CSV.\n';
const S0 = '## [INV-3] Dates\nDates show in the customer\'s local format.\n';
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const S2 = '## [INV-3] Dates\nDates MUST show in ISO 8601, with the time zone.\n';
const S3 = '## [INV-3] Dates\nDates MUST show in ISO 8601, with the time zone, to the second.\n';
const INV4A = '## [INV-4] Separator\nThe CSV separator is a comma.\n';
const INV4B = '## [INV-4] Separator\nThe CSV separator MUST be a semicolon.\n';
const INV5A = '## [INV-5] Cancelling\nAn invoice can be cancelled.\n';
const INV5B = '## [INV-5] Cancelling\nAn invoice MUST be cancellable within 14 days.\n';
const INV7 = '## [INV-7] CSV export\nA customer MUST be able to export one invoice as CSV.\n';
const INV7B = '## [INV-7] CSV export\nA customer MUST be able to export one invoice or a month as CSV.\n';
const INV8 = '## [INV-8] Export page\nThe invoice page MUST offer the export.\n';

const file = (...sections) => sections.join('\n');
const DIR = 'requests/inv';
const ARCHIVE = 'requests/archive/inv';
const FILES = ['change.md', 'origin/2026-09-20-owner-words.md', 'origin/2026-09-21-signoff.md'];

// A committed repo: specs/invoices.md holding `baseline`, the request `inv`
// holding `blocks`, and `others` as { name: blocks }; returns { repo, md }.
function setup(t, blocks, { baseline = file(INV1, S1), others = {}, ...opts } = {}) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', baseline);
  const md = addRequest(repo, 'inv', blocks, opts);
  for (const [name, b] of Object.entries(others)) addRequest(repo, name, b);
  repo.commit('setup');
  return { repo, md };
}
const conclude = (repo, ...args) => runAl(repo.dir, ['conclude', ...args], { env: ENV });
const consolidate = (repo, ...args) => runAl(repo.dir, ['consolidate', ...args], { env: ENV });
const read = (repo, rel) => repo.read(rel).toString();
const clean = (repo) => assert.equal(repo.git(['status', '--porcelain']), '', 'nothing should be written');
const ok = (r) => assert.equal(r.code, 0, both(r));
// Three lines or fewer under the frame (Read, Next, Not known).
function assertShort(r) {
  assert.ok(lines(r.stdout).length <= 6, `more than six lines:\n${r.stdout}`);
  assertFrame(r.stdout);
}
function assertWould(r) {
  ok(r);
  assert.ok(lines(r.stdout).some((l) => l.startsWith('Would')), `a line should start with "Would":\n${r.stdout}`);
  assertShort(r);
}
// Moved to requests/archive/<name>/ with every file, the others byte-identical.
function assertArchived(repo, name, before) {
  assert.ok(!existsSync(join(repo.dir, `requests/${name}`)), `requests/${name}/ should be gone`);
  for (const [rel, bytes] of Object.entries(before)) {
    assert.equal(read(repo, `requests/archive/${name}/${rel}`), bytes, `requests/archive/${name}/${rel}`);
  }
}
const snapshot = (repo, dir = DIR) => Object.fromEntries(FILES.map((f) => [f, read(repo, `${dir}/${f}`)]));
const archivedMd = (repo, name = 'inv') => read(repo, `requests/archive/${name}/request.md`);

// --- Success ---

test('[STA-7][TL-1] every block consolidated: without --yes a "Would" line and nothing written; with --yes the Outcome, Status: concluded (rest of the line kept), the folder moved', (t) => {
  const line = `${statusLine('open')} · Follows: invoice-export`;
  const { repo, md } = setup(t, [
    block('[INV-3]@1 modify   for R2', { was: S0, now: S1 }),
    block('[INV-7]@1 add after [INV-3]   for R1', { now: INV7 }),
  ], { baseline: file(INV1, S1, INV7), line });
  const files = snapshot(repo);

  assertWould(conclude(repo, 'inv'));
  clean(repo);

  const r = conclude(repo, 'inv', '--yes');
  ok(r);
  assertShort(r);
  assertArchived(repo, 'inv', files);
  const o = outcome(archivedMd(repo));
  assert.equal(o.before.trimEnd(), md.replace(line, `${statusLine('concluded')} · Follows: invoice-export`).trimEnd(),
    'request.md is unchanged above the Outcome but for the Status value');
  assert.equal(read(repo, 'specs/invoices.md'), file(INV1, S1, INV7), 'the baseline is untouched');
});

test('[REC-9] the Outcome: each R\'s fate in change.md order, the sections by net op (Kept and Dropped only there), the decisions with the agent\'s rulings apart', (t) => {
  const { repo } = setup(t, [
    block('[INV-7]@1 add after [INV-3]   for R1', { now: INV7 }),
    block('[INV-3]@1 modify   for R1, R2', { was: S0, now: S1 }),
    block('[INV-2]@1 remove, was after [INV-1]', { was: INV2 }),
    block('[INV-4]@1 modify   Dropped 2026-09-26 (D4)   for R2', { was: INV4A, now: INV4B }),
    block('[INV-5]@1 modify   Dropped 2026-09-26 (D4)   Kept 2026-09-26 (D3)   for R2', { was: INV5A, now: INV5B }),
  ], { baseline: file(INV1, S1, INV7, INV4A, INV5B) });
  ok(conclude(repo, 'inv', '--yes'));
  assert.deepEqual(outcome(archivedMd(repo)).generated, [
    '- R1 Invoice export: in [INV-7], [INV-3]',
    '- R2 Dates: in [INV-3], [INV-5]',
    '- R3 Email link: in no section',
    '- Added: [INV-7]',
    '- Modified: [INV-3]',
    '- Removed: [INV-2]',
    '- Dropped: [INV-4]',
    '- Kept: [INV-5]',
    '- Decisions: D1, D3, D4',
    '- Agent rulings: D2',
  ]);
});

test('[REC-9][STA-5] the Outcome lists a revised section once, by its net op: an add revised by a modify is Added, a modify revised is Modified', (t) => {
  const { repo } = setup(t, [
    block('[INV-7]@1 add after [INV-3]   Revised 2026-09-25 (D3)   for R1', { now: INV7 }),
    block('[INV-7]@2 modify   for R1', { was: INV7, now: INV7B }),
    block('[INV-3]@1 modify   Revised 2026-09-25 (D3)   for R2', { was: S0, now: S1 }),
    block('[INV-3]@2 modify   for R2', { was: S1, now: S2 }),
  ], { baseline: file(INV1, S2, INV7B) });
  ok(conclude(repo, 'inv', '--yes'));
  assert.deepEqual(outcome(archivedMd(repo)).generated, [
    '- R1 Invoice export: in [INV-7]',
    '- R2 Dates: in [INV-3]',
    '- R3 Email link: in no section',
    '- Added: [INV-7]',
    '- Modified: [INV-3]',
    '- Removed: none',
    '- Dropped: none',
    '- Kept: none',
    '- Decisions: D1, D3, D4',
    '- Agent rulings: D2',
  ]);
});

test('C2 [STA-7][STA-4] passes after a fold, a revert and a re-fold', (t) => {
  const { repo } = setup(t, [
    block('[INV-3]@1 modify   for R2', { was: S0, now: S1 }),
    block('[INV-7]@1 add after [INV-3]   for R1', { now: INV7 }),
  ], { baseline: file(INV1, S0) });
  ok(consolidate(repo, 'inv', '--yes'));
  ok(consolidate(repo, 'inv', '--revert', 'INV-3', '--yes'));
  assert.equal(read(repo, 'specs/invoices.md'), file(INV1, S0, INV7));
  ok(consolidate(repo, 'inv', '--yes'));
  const files = snapshot(repo);
  const r = conclude(repo, 'inv', '--yes');
  ok(r);
  assertShort(r);
  assertArchived(repo, 'inv', files);
  assert.equal(read(repo, 'specs/invoices.md'), file(INV1, S1, INV7));
});

test('C2 [STA-7] passes with a separate consolidation PR: consolidated and merged to main, then concluded on a later branch', (t) => {
  const { repo } = setup(t, [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })], { baseline: file(INV1, S0) });
  repo.git(['checkout', '-q', '-b', 'consolidate-inv']);
  ok(consolidate(repo, 'inv', '--yes'));
  repo.commit('consolidate inv', { date: '2026-09-24T10:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  repo.git(['merge', '-q', '--no-ff', '-m', 'Merge consolidate-inv', 'consolidate-inv'], { date: '2026-09-24T11:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'conclude-inv']);
  const files = snapshot(repo);
  const r = conclude(repo, 'inv', '--yes');
  ok(r);
  assertArchived(repo, 'inv', files);
  assert.match(outcome(archivedMd(repo)).before, /Status: concluded/);
});

test('[STA-7][REC-8] an open named child request gives a note, not a refusal; a child already archived gives none', (t) => {
  const parts = '\n## Parts\n\n1. CSV export: request csv-export\n2. Date format\n';
  for (const childDir of ['requests/csv-export', 'requests/archive/csv-export']) {
    const repo = makeRepo(t);
    repo.write('specs/invoices.md', file(INV1, S1));
    addRequest(repo, 'inv', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })], { rest: parts });
    addRequest(repo, 'csv-export', null, { dir: childDir, status: childDir.includes('archive') ? 'concluded' : 'open' });
    repo.commit('setup');
    const r = conclude(repo, 'inv', '--yes');
    ok(r);
    assertShort(r);
    const note = lineWith(both(r), /\bnote\b/i, 'csv-export');
    if (childDir.includes('archive')) assert.ok(!note, `an archived child is not open:\n${both(r)}`);
    else assert.ok(note, `expected a note naming the open child csv-export:\n${both(r)}`);
    assert.ok(existsSync(join(repo.dir, ARCHIVE, 'request.md')));
  }
});

test('[STA-7][REC-9] conclude again on a request archived only on this branch regenerates the Outcome and keeps everything from "Notes:" on', (t) => {
  const { repo } = setup(t, [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  repo.git(['checkout', '-q', '-b', 'conclude-inv']);
  ok(conclude(repo, 'inv', '--yes'));
  repo.commit('conclude inv');

  const NOTES = 'Notes:\nThe owner asked for the email link in a later request.\n';
  const D5 = '- D5, 2026-09-27. Source: the owner. The email link waits.\n';
  let md = archivedMd(repo);
  const at = md.search(/^Notes:/m);
  md = at < 0 ? `${md.trimEnd()}\n\n${NOTES}` : md.slice(0, at) + NOTES;
  md = md.replace(D4, D4 + D5);
  repo.write(`${ARCHIVE}/request.md`, md);
  repo.commit('notes, and D5');
  assert.ok(!outcome(md).generated.includes('- Decisions: D1, D3, D4, D5'), 'the fixture\'s Outcome predates D5');

  const r = conclude(repo, 'inv', '--yes');
  ok(r);
  assertShort(r);
  const now = archivedMd(repo);
  assert.ok(outcome(now).generated.includes('- Decisions: D1, D3, D4, D5'), `the Outcome is regenerated:\n${now}`);
  assert.equal(now.slice(now.search(/^Notes:/m)), NOTES, 'everything from "Notes:" on is kept');
  assert.ok(!existsSync(join(repo.dir, DIR)) && !existsSync(join(repo.dir, 'requests/archive/archive')), 'it stays where it is');
});

// --- Refusals ---

// One held INV-3 in each state conclude refuses: the word to look for, the
// state the fixture reads (and what it names), and the fixture.
const WAITS_ON = 'cancel-invoices/INV-3@1';
const REFUSED = {
  pending: [/pending/, ['pending'], () => ({ baseline: file(INV1, S0), blocks: [block('[INV-3]@1 modify', { was: S0, now: S1 })] })],
  differs: [/differs/, ['differs'], () => ({ baseline: file(INV1, S3), blocks: [block('[INV-3]@1 modify', { was: S0, now: S1 })] })],
  'not found': [/not found/, ['not found'], () => ({ baseline: file(INV1), blocks: [block('[INV-3]@1 modify', { was: S0, now: S1 })] })],
  'no change yet': [/no change yet/, ['no change yet'], () => ({ baseline: file(INV1, S0), blocks: [block('[INV-3]@1 modify', { was: S0, now: S0 })] })],
  waiting: [/waiting/, ['waiting', WAITS_ON], () => ({
    baseline: file(INV1, S0),
    blocks: [block('[INV-3]@1 modify   builds on cancel-invoices/INV-3@1', { was: S1, now: S2 })],
    others: { 'cancel-invoices': [block('[INV-3]@1 modify', { was: S0, now: S1 })] },
  })],
  'base revised': [/base revised/, ['base revised'], () => ({
    baseline: file(INV1, S2),
    blocks: [block('[INV-3]@1 modify   builds on cancel-invoices/INV-3@1', { was: S1, now: S2 })],
    others: { 'cancel-invoices': [
      block('[INV-3]@1 modify   Revised 2026-09-22 (D1)', { was: S0, now: S1 }),
      block('[INV-3]@2 modify', { was: S1, now: S3 }),
    ] },
  })],
  'base dropped': [/base dropped/, ['base dropped'], () => ({
    baseline: file(INV1, S0),
    blocks: [block('[INV-3]@1 modify   builds on cancel-invoices/INV-3@1', { was: S1, now: S2 })],
    others: { 'cancel-invoices': [block('[INV-3]@1 modify   Dropped 2026-09-22 (D4)', { was: S0, now: S1 })] },
  })],
  'broken link': [/broken link/, ['broken link'], () => ({ baseline: file(INV1, S2), blocks: [block('[INV-3]@1 modify   builds on nosuch/INV-3@1', { was: S1, now: S2 })] })],
  'Dropped but consolidated, not Kept': [/dropped|retain/i, ['consolidated'], () => ({ baseline: file(INV1, S1), blocks: [block('[INV-3]@1 modify   Dropped 2026-09-26 (D4)', { was: S0, now: S1 })] })],
};

for (const [label, [word, [state, by], make]] of Object.entries(REFUSED)) {
  test(`C2 [STA-7][HNT-3] conclude refuses (exit 1) a block that is ${label}, naming it, with and without --yes; nothing written`, async (t) => {
    const { blocks, ...opts } = make();
    const { repo } = setup(t, blocks, opts);
    await expectState(repo, 'inv/INV-3@1', state, { by });
    for (const extra of [[], ['--yes']]) {
      const r = conclude(repo, 'inv', ...extra);
      assert.equal(r.code, 1, both(r));
      assert.ok(lineWith(both(r), 'INV-3', word), `a line should name INV-3 and ${word}:\n${both(r)}`);
      clean(repo);
      assertShort(r);
    }
  });
}

test('C2 [STA-7][REC-6] conclude refuses a blocked request (no sign-off; changed since the sign-off) though every block is consolidated; the signed one passes', (t) => {
  const blocks = [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })];
  for (const opts of [{ signed: false }, { org: ORG.replace('ISO 8601', 'RFC 3339') }]) {
    const { repo } = setup(t, blocks, opts);
    for (const extra of [[], ['--yes']]) {
      const r = conclude(repo, 'inv', ...extra);
      assert.equal(r.code, 1, both(r));
      assert.match(both(r), /blocked|sign-?off|signed/i, 'should say it is blocked on the sign-off');
      clean(repo);
      assertShort(r);
    }
  }
  const { repo } = setup(t, blocks);
  assertWould(conclude(repo, 'inv'));
});

// --- Kept [STA-6] ---

test('C2 [STA-6] a Kept on a section that differs is refused, naming it; the same Kept on the consolidated section passes', (t) => {
  const blocks = [block('[INV-3]@1 modify   Dropped 2026-09-26 (D4)   Kept 2026-09-26 (D3)   for R2', { was: S0, now: S1 })];
  const { repo } = setup(t, blocks, { baseline: file(INV1, S3) });
  for (const extra of [[], ['--yes']]) {
    const r = conclude(repo, 'inv', ...extra);
    assert.equal(r.code, 1, both(r));
    assert.ok(lineWith(both(r), 'INV-3'), `should name INV-3:\n${both(r)}`);
    clean(repo);
  }
  const { repo: good } = setup(t, blocks);
  assertWould(conclude(good, 'inv'));
});

// A Kept traces to a signed R (the block's `for`, with the sign-off current)
// or to an owner decision: its Source clause, up to the first ". ", names the
// owner and not the agent.
const KEPT_DECISIONS = DECISIONS +
  '- D5, 2026-09-26. Source: the review of PR #9. The owner agreed to keep it.\n' +
  '- D6, 2026-09-26. Source: the owner, relayed by the agent. Keep it.\n';
const KEPT = [
  ['D2, the agent\'s ruling, with no for', 'D2', '', 1],
  ['D2, for R9, which the requirement does not hold', 'D2', 'for R9', 1],
  ['D5, whose Source clause names a review (the owner only after ". ")', 'D5', '', 1],
  ['D6, whose Source clause names the agent as well as the owner', 'D6', '', 1],
  ['D7, which is not a Decisions entry', 'D7', '', 1],
  ['D3, the owner\'s decision', 'D3', '', 0],
  ['D2, for R2, with the sign-off current', 'D2', 'for R2', 0],
];

for (const [label, d, forR, code] of KEPT) {
  test(`C2 [STA-6] a Kept by ${label} on a consolidated section: conclude exits ${code}`, async (t) => {
    const { repo } = setup(t, [block(`[INV-3]@1 modify   Dropped 2026-09-26 (D4)   Kept 2026-09-26 (${d})   ${forR}`.trimEnd(), { was: S0, now: S1 })],
      { decisions: KEPT_DECISIONS });
    await expectState(repo, 'inv/INV-3@1', 'consolidated');
    const r = conclude(repo, 'inv');
    assert.equal(r.code, code, both(r));
    if (code === 1) assert.ok(lineWith(both(r), 'INV-3'), `should name INV-3:\n${both(r)}`);
    else assert.ok(lines(r.stdout).some((l) => l.startsWith('Would')), r.stdout);
    clean(repo);
    assertShort(r);
  });
}

// --- Dropping the whole request [STA-6][STA-3] ---

test('C2 [STA-6][REC-6] --dropped with nothing retained needs no sign-off: an unsigned B waiting on a pending A drops whole; the baseline and A are untouched; nothing is called Kept', async (t) => {
  const baseline = file(INV1, S0, INV4A);
  const { repo } = setup(t, [
    block('[INV-3]@1 modify   builds on cancel-invoices/INV-3@1   for R1', { was: S1, now: S2 }),
    block('[INV-4]@1 modify', { was: INV4A, now: INV4A }),
    block('[INV-8]@1 add after [INV-4]   for R2', { now: INV8 }),
  ], { signed: false, baseline, others: { 'cancel-invoices': [block('[INV-3]@1 modify', { was: S0, now: S1 })] } });
  await expectState(repo, 'inv/INV-3@1', 'waiting', { by: 'cancel-invoices/INV-3@1' });
  const a = { request: read(repo, 'requests/cancel-invoices/request.md'), change: read(repo, 'requests/cancel-invoices/change.md') };
  const files = Object.fromEntries(FILES.slice(0, 2).map((f) => [f, read(repo, `${DIR}/${f}`)])); // unsigned: no sign-off file

  assertWould(conclude(repo, 'inv', '--dropped', 'D4'));
  clean(repo);

  const r = conclude(repo, 'inv', '--dropped', 'D4', '--yes');
  ok(r);
  assertShort(r);
  assertArchived(repo, 'inv', files);
  const o = outcome(archivedMd(repo));
  assert.match(o.before, /Status: dropped/);
  assert.deepEqual(o.generated, [
    '- Dropped as a whole by D4',
    '- R1 Invoice export: in no section',
    '- R2 Dates: in no section',
    '- R3 Email link: in no section',
    '- Added: none',
    '- Modified: none',
    '- Removed: none',
    '- Dropped: [INV-3], [INV-4], [INV-8]',
    '- Kept: none',
    '- Decisions: D1, D3, D4',
    '- Agent rulings: D2',
  ]);
  assert.equal(read(repo, 'specs/invoices.md'), baseline, 'dropping never touches the baseline');
  assert.equal(read(repo, 'requests/cancel-invoices/request.md'), a.request, 'nor another request');
  assert.equal(read(repo, 'requests/cancel-invoices/change.md'), a.change, 'nor another request');
});

test('C2 [STA-6] --dropped with a Kept section and a reverted one passes: Kept lists the kept, Dropped the reverted; the baseline stays', (t) => {
  const { repo } = setup(t, [
    block('[INV-3]@1 modify   for R2', { was: S0, now: S1 }),
    block('[INV-4]@1 modify   for R1', { was: INV4A, now: INV4B }),
  ], { baseline: file(INV1, S0, INV4A) });
  ok(consolidate(repo, 'inv', '--yes'));
  ok(consolidate(repo, 'inv', '--revert', 'INV-4', '--yes'));
  // The owner keeps the dates: the Kept marker is written by hand.
  repo.write(`${DIR}/change.md`, read(repo, `${DIR}/change.md`).replace('[INV-3]@1 modify   for R2', '[INV-3]@1 modify   Kept 2026-09-26 (D3)   for R2'));
  repo.commit('INV-3 consolidated and kept, INV-4 reverted');
  const baseline = file(INV1, S1, INV4A);
  assert.equal(read(repo, 'specs/invoices.md'), baseline);

  const r = conclude(repo, 'inv', '--dropped', 'D4', '--yes');
  ok(r);
  assertShort(r);
  const o = outcome(archivedMd(repo));
  assert.match(o.before, /Status: dropped/);
  assert.deepEqual(o.generated, [
    '- Dropped as a whole by D4',
    '- R1 Invoice export: in no section',
    '- R2 Dates: in [INV-3]',
    '- R3 Email link: in no section',
    '- Added: none',
    '- Modified: none',
    '- Removed: none',
    '- Dropped: [INV-4]',
    '- Kept: [INV-3]',
    '- Decisions: D1, D3, D4',
    '- Agent rulings: D2',
  ]);
  assert.equal(read(repo, 'specs/invoices.md'), baseline);
});

test('C2 [STA-6] a section carried by a successor in another request: revert refuses, --dropped refuses until it is Kept, then passes; the baseline and the successor are untouched', async (t) => {
  const baseline = file(INV1, S2);
  const { repo } = setup(t, [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })],
    { baseline, others: { 'late-dates': [block('[INV-3]@1 modify   builds on inv/INV-3@1   for R2', { was: S1, now: S2 })] } });
  await expectState(repo, 'inv/INV-3@1', 'carried', { by: 'late-dates/INV-3@1' });
  const successor = read(repo, 'requests/late-dates/change.md');

  assertRefused(consolidate(repo, 'inv', '--revert', 'INV-3', '--yes'), 'INV-3', 'carried');
  clean(repo);
  const notKept = conclude(repo, 'inv', '--dropped', 'D4', '--yes');
  assert.equal(notKept.code, 1, both(notKept));
  assert.ok(lineWith(both(notKept), 'INV-3'), both(notKept));
  clean(repo);

  repo.write(`${DIR}/change.md`, read(repo, `${DIR}/change.md`).replace('modify   for R2', 'modify   Kept 2026-09-26 (D3)   for R2'));
  repo.commit('kept');
  const r = conclude(repo, 'inv', '--dropped', 'D4', '--yes');
  ok(r);
  assert.ok(outcome(archivedMd(repo)).generated.includes('- Kept: [INV-3]'), archivedMd(repo));
  assert.equal(read(repo, 'specs/invoices.md'), baseline);
  assert.equal(read(repo, 'requests/late-dates/change.md'), successor);
});

// `base` keeps INV-3 by the agent's ruling D2, citing no R; `successor` builds
// on it `for R2` (or `forR`), signed unless `successorSigned` is false. The
// baseline is the successor's "now", so base reads carried by successor/INV-3@1.
function carriedKept(t, { successorSigned = true, forR = 'for R2' } = {}) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S2));
  addRequest(repo, 'base', [block('[INV-3]@1 modify   Kept 2026-09-26 (D2)', { was: S0, now: S1 })]);
  addRequest(repo, 'successor', [block(`[INV-3]@1 modify   builds on base/INV-3@1   ${forR}`, { was: S1, now: S2 })], { signed: successorSigned });
  repo.commit('setup');
  return repo;
}

test('C2 [STA-6] a Kept section carried by a successor meets the rule through the successor\'s signed, current R-line (design §5.4): --dropped passes; with the successor unsigned, or citing an R its requirement does not hold, it refuses', async (t) => {
  for (const opts of [{ successorSigned: false }, { forR: 'for R9' }]) {
    const repo = carriedKept(t, opts);
    await expectState(repo, 'base/INV-3@1', 'carried', { by: 'successor/INV-3@1' });
    for (const extra of [[], ['--yes']]) {
      const r = conclude(repo, 'base', '--dropped', 'D4', ...extra);
      assert.equal(r.code, 1, `${JSON.stringify(opts)}:\n${both(r)}`);
      assert.ok(lineWith(both(r), 'INV-3'), `should name INV-3:\n${both(r)}`);
      clean(repo);
      assertShort(r);
    }
  }

  const repo = carriedKept(t);
  await expectState(repo, 'base/INV-3@1', 'carried', { by: 'successor/INV-3@1' });
  const r = conclude(repo, 'base', '--dropped', 'D4', '--yes');
  ok(r);
  assertShort(r);
  assert.ok(outcome(archivedMd(repo, 'base')).generated.includes('- Kept: [INV-3]'), archivedMd(repo, 'base'));
  assert.equal(read(repo, 'specs/invoices.md'), file(INV1, S2), 'the baseline is untouched');
});

// `base` as above, carried by two successors that both build on it `for R2`:
// `aaa`, signed only when `aaaSigned`, and `zzz`, signed unless `zzzSigned` is false.
function twoCarriers(t, { aaaSigned = false, zzzSigned = true } = {}) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S2));
  addRequest(repo, 'base', [block('[INV-3]@1 modify   Kept 2026-09-26 (D2)', { was: S0, now: S1 })]);
  const successor = [block('[INV-3]@1 modify   builds on base/INV-3@1   for R2', { was: S1, now: S2 })];
  addRequest(repo, 'aaa', successor, { signed: aaaSigned });
  addRequest(repo, 'zzz', successor, { signed: zzzSigned });
  repo.commit('setup');
  return repo;
}

test('C2 [STA-6] a Kept section carried by two successors traces through any of them: with the first one named (aaa) unsigned and the other (zzz) signed, --dropped passes; with both unsigned it refuses', async (t) => {
  const unsigned = twoCarriers(t, { zzzSigned: false });
  for (const extra of [[], ['--yes']]) {
    const r = conclude(unsigned, 'base', '--dropped', 'D4', ...extra);
    assert.equal(r.code, 1, both(r));
    assert.ok(lineWith(both(r), 'INV-3'), `should name INV-3:\n${both(r)}`);
    clean(unsigned);
    assertShort(r);
  }

  const repo = twoCarriers(t);
  // The fixture: the states name the unsigned aaa as the carrier, so a check of that one carrier alone refuses.
  await expectState(repo, 'base/INV-3@1', 'carried', { by: 'aaa/INV-3@1' });
  const r = conclude(repo, 'base', '--dropped', 'D4', '--yes');
  ok(r);
  assertShort(r);
  assert.ok(outcome(archivedMd(repo, 'base')).generated.includes('- Kept: [INV-3]'), archivedMd(repo, 'base'));
});

test('C2 [STA-6] a Kept section carried by two successors traces through any of them, the mirror case: with the first one named (aaa) signed and the other (zzz) unsigned, --dropped passes', async (t) => {
  const repo = twoCarriers(t, { aaaSigned: true, zzzSigned: false });
  await expectState(repo, 'base/INV-3@1', 'carried', { by: 'aaa/INV-3@1' });
  const r = conclude(repo, 'base', '--dropped', 'D4', '--yes');
  ok(r);
  assertShort(r);
  assert.ok(outcome(archivedMd(repo, 'base')).generated.includes('- Kept: [INV-3]'), archivedMd(repo, 'base'));
});

test('C2 [STA-6][REC-6] --dropped with a Kept, unsigned change refuses, whether the Kept cites an R or the owner; signed, it passes', (t) => {
  const kept = (d) => [block(`[INV-3]@1 modify   Kept 2026-09-26 (${d})   for R2`, { was: S0, now: S1 })];
  for (const d of ['D2', 'D3']) {
    const { repo } = setup(t, kept(d), { signed: false });
    for (const extra of [[], ['--yes']]) {
      const r = conclude(repo, 'inv', '--dropped', 'D4', ...extra);
      assert.equal(r.code, 1, both(r));
      clean(repo);
      assertShort(r);
    }
  }
  const { repo } = setup(t, kept('D2'));
  ok(conclude(repo, 'inv', '--dropped', 'D4', '--yes'));
  const o = outcome(archivedMd(repo));
  assert.equal(o.generated[0], '- Dropped as a whole by D4');
  assert.ok(o.generated.includes('- Kept: [INV-3]'), o.generated.join('\n'));
});

test('C2 [STA-3][STA-6] a Dropped block that is waiting retains nothing: the request concludes with it listed as Dropped', (t) => {
  const { repo } = setup(t, [
    block('[INV-3]@1 modify   builds on cancel-invoices/INV-3@1   Dropped 2026-09-26 (D4)   for R2', { was: S1, now: S2 }),
    block('[INV-7]@1 add after [INV-3]   for R1', { now: INV7 }),
  ], { baseline: file(INV1, S0, INV7), others: { 'cancel-invoices': [block('[INV-3]@1 modify', { was: S0, now: S1 })] } });
  ok(conclude(repo, 'inv', '--yes'));
  const g = outcome(archivedMd(repo)).generated;
  assert.ok(g.includes('- Dropped: [INV-3]') && g.includes('- Added: [INV-7]'), g.join('\n'));
});

// Each block is possibly retained, so --dropped refuses it [STA-3]: the state
// the fixture reads, and the fixture.
const RETAINED = {
  'consolidated and not Kept': ['consolidated', () => ({ baseline: file(INV1, S1), blocks: [block('[INV-3]@1 modify', { was: S0, now: S1 })] })],
  'not found': ['not found', () => ({ baseline: file(INV1), blocks: [block('[INV-3]@1 modify', { was: S0, now: S1 })] })],
  'partly reverted by a hotfix (neither "was" nor "now")': ['differs', () => ({
    baseline: file(INV1, '## [INV-3] Export\nFormat: CSV.\nDates: ISO 8601.\n'),
    blocks: [block('[INV-3]@1 modify', { was: '## [INV-3] Export\nFormat: CSV.\nDates: local.\n', now: '## [INV-3] Export\nFormat: PDF.\nDates: ISO 8601.\n' })],
  })],
  'consolidated before its base was revised (a stale base)': ['base revised', () => ({
    baseline: file(INV1, S2),
    blocks: [block('[INV-3]@1 modify   builds on cancel-invoices/INV-3@1', { was: S1, now: S2 })],
    others: { 'cancel-invoices': [
      block('[INV-3]@1 modify   Revised 2026-09-22 (D1)', { was: S0, now: S1 }),
      block('[INV-3]@2 modify', { was: S1, now: S3 }),
    ] },
  })],
};

for (const [label, [state, make]] of Object.entries(RETAINED)) {
  test(`C2 [STA-3][STA-6] --dropped refuses a block ${label}, naming it; nothing written`, async (t) => {
    const { blocks, ...opts } = make();
    const { repo } = setup(t, blocks, opts);
    await expectState(repo, 'inv/INV-3@1', state);
    for (const extra of [[], ['--yes']]) {
      const r = conclude(repo, 'inv', '--dropped', 'D4', ...extra);
      assert.equal(r.code, 1, both(r));
      assert.ok(lineWith(both(r), 'INV-3'), `should name INV-3:\n${both(r)}`);
      clean(repo);
      assertShort(r);
    }
  });
}

test('C2 [STA-3][STA-6] a section partly reverted by a hotfix refuses a drop until it is reverted, or accepted and kept; then the drop passes', async (t) => {
  const WAS = '## [INV-3] Export\nFormat: CSV.\nDates: local.\n';
  const NOW = '## [INV-3] Export\nFormat: PDF.\nDates: ISO 8601.\n';
  const HOTFIX = '## [INV-3] Export\nFormat: CSV.\nDates: ISO 8601.\n';
  const { repo } = setup(t, [block('[INV-3]@1 modify', { was: WAS, now: NOW })], { baseline: file(INV1, HOTFIX) });
  const refused = conclude(repo, 'inv', '--dropped', 'D4', '--yes');
  assert.equal(refused.code, 1, both(refused));
  clean(repo);

  ok(consolidate(repo, 'inv', '--revert', 'INV-3', '--yes'));
  assert.equal(read(repo, 'specs/invoices.md'), file(INV1, WAS));
  ok(conclude(repo, 'inv', '--dropped', 'D4', '--yes'));
  assert.ok(outcome(archivedMd(repo)).generated.includes('- Dropped: [INV-3]'));

  // Or accepted (its "now" set to the text underneath, as record section
  // --accept leaves it) and then Kept by the owner: the drop passes, the hotfix stays.
  const { repo: kept } = setup(t, [block('[INV-3]@1 modify   Kept 2026-09-26 (D3)', { was: WAS, now: HOTFIX })], { baseline: file(INV1, HOTFIX) });
  await expectState(kept, 'inv/INV-3@1', 'consolidated');
  ok(conclude(kept, 'inv', '--dropped', 'D4', '--yes'));
  assert.ok(outcome(archivedMd(kept)).generated.includes('- Kept: [INV-3]'));
  assert.equal(read(kept, 'specs/invoices.md'), file(INV1, HOTFIX));
});

// --- Misuse (exit 2) ---

test('[STA-7][HNT-3] conclude of an unknown request exits 2; --at is not taken (exit 2); the same conclude without them exits 0', (t) => {
  const { repo } = setup(t, [block('[INV-3]@1 modify', { was: S0, now: S1 })]);
  for (const args of [['no-such-request'], ['no-such-request', '--yes'], ['inv', '--at', 'HEAD'], ['inv', '--at', 'HEAD', '--yes']]) {
    const r = conclude(repo, ...args);
    assert.equal(r.code, 2, `${args.join(' ')}:\n${both(r)}`);
    clean(repo);
  }
  assertWould(conclude(repo, 'inv'));
});

test('[STA-7][HNT-3] --dropped with a D that is not a Decisions entry (absent, or only named inside another) exits 2; with D4 it passes', (t) => {
  const decisions = DECISIONS.replace('Drop this request.', 'Drop this request (D5 was withdrawn).');
  const { repo } = setup(t, [block('[INV-3]@1 modify', { was: S0, now: S1 })], { baseline: file(INV1, S0), signed: false, decisions });
  for (const d of ['D9', 'D5']) {
    for (const extra of [[], ['--yes']]) {
      const r = conclude(repo, 'inv', '--dropped', d, ...extra);
      assert.equal(r.code, 2, `--dropped ${d}:\n${both(r)}`);
      clean(repo);
    }
  }
  assertWould(conclude(repo, 'inv', '--dropped', 'D4'));
});

test('[REC-1][STA-7][HNT-3] a request archived on main: conclude and consolidate exit 2 and write nothing; archived only on the branch, conclude runs', (t) => {
  const { repo } = setup(t, [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  repo.git(['checkout', '-q', '-b', 'conclude-inv']);
  ok(conclude(repo, 'inv', '--yes'));
  repo.commit('conclude inv', { date: '2026-09-25T10:00:00Z' });
  ok(conclude(repo, 'inv', '--yes'));
  repo.commit('conclude inv again', { date: '2026-09-25T10:05:00Z' });

  repo.git(['checkout', '-q', 'main']);
  repo.git(['merge', '-q', '--ff-only', 'conclude-inv']);
  for (const args of [['conclude', 'inv'], ['conclude', 'inv', '--yes'], ['consolidate', 'inv'], ['consolidate', 'inv', '--yes']]) {
    const r = runAl(repo.dir, args, { env: ENV });
    assert.equal(r.code, 2, `${args.join(' ')}:\n${both(r)}`);
    clean(repo);
    assertFrame(r.stdout);
  }
});
