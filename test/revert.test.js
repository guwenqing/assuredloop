// al consolidate <name> --revert <ID> [--yes] [STA-4]@2 [STA-6]: puts back
// the "was" of the request's first block for the ID (an add is removed, a
// modify replaced in place, a remove put back after its recorded anchor);
// allowed while the request is blocked [REC-6]; refuses a section carried by
// another request's block and one it cannot place (exit 1) [HNT-3];
// --revert with --section is misuse (exit 2). A fold then a revert gives back
// the original bytes (the architect's rulings 8 and 9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { ENV, addRequest, assertRefused, both, expectState } from './helpers/request.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const INV2 = '## [INV-2] Format\nThe export format is CSV.\n';
const S0 = '## [INV-3] Dates\nDates show in the customer\'s local format.\n';
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const S2 = '## [INV-3] Dates\nDates MUST show in ISO 8601, with the time zone.\n';
const INV31 = '### [INV-3.1] Time zones\nTimes MUST carry their zone.\n';
const INV31B = '### [INV-3.1] Time zones\nTimes MUST carry their zone as an offset.\n';
const INV4 = '## [INV-4] Separator\nThe CSV separator is a comma.\n';
const INV7 = '## [INV-7] CSV export\nA customer MUST be able to export one invoice as CSV.\n';
const INV9 = '## [INV-9] Export name\nThe file MUST be named after the invoice number.\n';

const file = (...sections) => sections.join('\n');
const BASE = file('# Invoices\n', INV1, INV2, S0, INV31, INV4);

function setup(t, blocks, { baseline = BASE, others = {}, before, ...opts } = {}) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', baseline);
  addRequest(repo, 'inv', blocks, opts);
  for (const [name, b] of Object.entries(others)) addRequest(repo, name, b);
  if (before) before(repo);
  repo.commit('setup');
  return repo;
}
const consolidate = (repo, ...args) => runAl(repo.dir, ['consolidate', ...args], { env: ENV });
const revert = (repo, id, ...args) => consolidate(repo, 'inv', '--revert', id, ...args);
const spec = (repo) => repo.read('specs/invoices.md').toString();
const clean = (repo) => assert.equal(repo.git(['status', '--porcelain']), '', 'nothing should be written');
const ok = (r) => assert.equal(r.code, 0, both(r));

test('[STA-4] fold an add, a modify (### kept) and two removes, then revert each: the bytes after every step, ending with the original file', async (t) => {
  const repo = setup(t, [
    block('[INV-7]@1 add after [INV-3]', { now: INV7 }),
    block('[INV-3.1]@1 modify', { was: INV31.slice(1), now: INV31B.slice(1) }),
    block('[INV-2]@1 remove, was after [INV-1]', { was: INV2 }),
    block('[INV-4]@1 remove, was after [INV-3]', { was: INV4 }),
  ]);
  ok(consolidate(repo, 'inv', '--yes'));
  const folded = file('# Invoices\n', INV1, S0, INV31B, INV7);
  assert.equal(spec(repo), folded);
  repo.commit('folded');

  // Without --yes: what it would write, and nothing written.
  const preview = revert(repo, 'INV-7');
  ok(preview);
  assert.ok(lines(preview.stdout).some((l) => l.startsWith('Would')), `a line should start with "Would":\n${preview.stdout}`);
  clean(repo);
  assertFrame(preview.stdout);

  const steps = [
    ['INV-7', file('# Invoices\n', INV1, S0, INV31B)],
    ['INV-3.1', file('# Invoices\n', INV1, S0, INV31)],
    ['INV-2', file('# Invoices\n', INV1, INV2, S0, INV31)],
    ['INV-4', BASE],
  ];
  for (const [id, bytes] of steps) {
    const r = revert(repo, id, '--yes');
    ok(r);
    assert.equal(spec(repo), bytes, `after reverting ${id}`);
    assertFrame(r.stdout);
  }
  for (const key of ['inv/INV-7@1', 'inv/INV-3.1@1', 'inv/INV-2@1', 'inv/INV-4@1']) await expectState(repo, key, 'pending');
});

test('[STA-4] fold and revert an add in an existing file: the original bytes', async (t) => {
  const repo = setup(t, [block('[INV-9]@1 add in specs/invoices.md', { now: INV9 })]);
  ok(consolidate(repo, 'inv', '--yes'));
  assert.equal(spec(repo), file(BASE, INV9));
  ok(revert(repo, 'INV-9', '--yes'));
  assert.equal(spec(repo), BASE);
});

test('[STA-4][STA-5] revert of a revision chain puts back the first block\'s "was", not @2\'s', async (t) => {
  const repo = setup(t, [
    block('[INV-3]@1 modify   Revised 2026-09-22 (D1)', { was: S0, now: S1 }),
    block('[INV-3]@2 modify', { was: S1, now: S2 }),
  ]);
  ok(consolidate(repo, 'inv', '--yes'));
  assert.equal(spec(repo), file('# Invoices\n', INV1, INV2, S2, INV31, INV4));
  ok(revert(repo, 'INV-3', '--yes'));
  assert.equal(spec(repo), BASE);
  await expectState(repo, 'inv/INV-3@1', 'pending');
});

test('[STA-4] revert when the baseline already reads "was" (a modify, an add, a remove) writes nothing and exits 0, with or without --yes; after a fold it writes', async (t) => {
  const repo = setup(t, [
    block('[INV-3]@1 modify', { was: S0, now: S1 }),
    block('[INV-7]@1 add after [INV-3]', { now: INV7 }),
    block('[INV-2]@1 remove, was after [INV-1]', { was: INV2 }),
  ]);
  for (const id of ['INV-3', 'INV-7', 'INV-2']) {
    for (const extra of [[], ['--yes']]) {
      const r = revert(repo, id, ...extra);
      ok(r);
      clean(repo);
      assertFrame(r.stdout);
    }
  }
  // The contrast: once folded, the same revert writes.
  ok(consolidate(repo, 'inv', '--section', 'INV-3', '--yes'));
  assert.equal(spec(repo), file('# Invoices\n', INV1, INV2, S1, INV31, INV4));
  ok(revert(repo, 'INV-3', '--yes'));
  assert.equal(spec(repo), BASE);
});

test('[STA-4][SPC-4] revert when the baseline reads "was" only after [SPC-4]\'s normalizing (trailing spaces and a tab, a blank line after the heading) changes no byte, with or without --yes; after a fold it writes "was" as written', async (t) => {
  const s0Loose = '## [INV-3] Dates  \n\nDates show in the customer\'s local format.\t\n';
  const loose = file('# Invoices\n', INV1, INV2, s0Loose, INV31, INV4);
  const repo = setup(t, [block('[INV-3]@1 modify', { was: S0, now: S1 })], { baseline: loose });
  await expectState(repo, 'inv/INV-3@1', 'pending');
  for (const extra of [[], ['--yes']]) {
    const r = revert(repo, 'INV-3', ...extra);
    ok(r);
    assert.equal(spec(repo), loose, 'no byte of the file changes');
    clean(repo);
    assertFrame(r.stdout);
  }
  // The contrast: once folded, the revert writes, and puts back "was" as written.
  ok(consolidate(repo, 'inv', '--yes'));
  assert.equal(spec(repo), file('# Invoices\n', INV1, INV2, S1, INV31, INV4));
  ok(revert(repo, 'INV-3', '--yes'));
  assert.equal(spec(repo), BASE);
});

test('[STA-4][STA-6] revert refuses a section carried by another request\'s block (exit 1, "carried"), with or without --yes; nothing written', async (t) => {
  const repo = setup(t, [block('[INV-3]@1 modify', { was: S0, now: S1 })], {
    baseline: file('# Invoices\n', INV1, INV2, S2, INV31, INV4),
    others: { 'late-dates': [block('[INV-3]@1 modify   builds on inv/INV-3@1', { was: S1, now: S2 })] },
  });
  await expectState(repo, 'inv/INV-3@1', 'carried', { by: 'late-dates/INV-3@1' });
  for (const extra of [[], ['--yes']]) {
    const r = revert(repo, 'INV-3', ...extra);
    assertRefused(r, 'INV-3', 'carried');
    clean(repo);
    assertFrame(r.stdout);
  }
});

test('[STA-4] revert refuses (exit 1) what it cannot place: a modify whose ID is not in the baseline, a remove whose anchor is gone; nothing written', async (t) => {
  const repo = setup(t, [
    block('[INV-3]@1 modify', { was: S0, now: S1 }),
    block('[INV-2]@1 remove, was after [INV-1]', { was: INV2 }),
  ], { baseline: file('# Invoices\n', INV4) });
  await expectState(repo, 'inv/INV-3@1', 'not found');
  for (const id of ['INV-3', 'INV-2']) {
    for (const extra of [[], ['--yes']]) {
      const r = revert(repo, id, ...extra);
      assertRefused(r, id);
      clean(repo);
    }
  }
});

test('[STA-4][REC-6] revert is allowed while the request is blocked; consolidate itself is refused', async (t) => {
  const repo = setup(t, [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })],
    { signed: false, baseline: file('# Invoices\n', INV1, INV2, S1, INV31, INV4) });
  const r = revert(repo, 'INV-3', '--yes');
  ok(r);
  assert.equal(spec(repo), BASE);
  assertFrame(r.stdout);

  repo.commit('reverted');
  assertRefused(consolidate(repo, 'inv', '--yes'), 'blocked');
  clean(repo);
});

test('[STA-4][SPC-3] a duplicate ID in the root blocks a revert like any consolidate write (exit 1, "duplicate")', (t) => {
  const repo = setup(t, [block('[INV-3]@1 modify', { was: S0, now: S1 })], {
    baseline: file('# Invoices\n', INV1, INV2, S1, INV31, INV4),
    before: (r) => r.write('specs/other.md', '## [INV-4] Separator again\nThe separator MUST be one character.\n'),
  });
  for (const extra of [[], ['--yes']]) {
    assertRefused(revert(repo, 'INV-3', ...extra), 'duplicate');
    clean(repo);
  }
});

test('[STA-4][HNT-3] --revert together with --section exits 2 and writes nothing; --revert alone exits 0', (t) => {
  const repo = setup(t, [block('[INV-3]@1 modify', { was: S0, now: S1 })],
    { baseline: file('# Invoices\n', INV1, INV2, S1, INV31, INV4) });
  for (const extra of [[], ['--yes']]) {
    const r = consolidate(repo, 'inv', '--revert', 'INV-3', '--section', 'INV-3', ...extra);
    assert.equal(r.code, 2, both(r));
    clean(repo);
  }
  ok(revert(repo, 'INV-3', '--yes'));
  assert.equal(spec(repo), BASE);
});
