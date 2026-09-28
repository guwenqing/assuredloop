// [SPC-5] a block holds exactly one heading, and it carries the block's own
// ID; [STA-4] consolidate validates everything before it writes. The
// architect's ruling: consolidate refuses (exit 1) a block it would write
// whose Now holds any number of headings but one, or whose one heading carries
// another ID or none; --revert refuses the same in the Was it would put back.
// Nothing is written, preview and --yes alike. Each test has its contrast: the
// same fixture with a proper block is written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, runAl } from './helpers/fixture.js';
import { assertFrame } from './helpers/output.js';
import { block } from './helpers/change.js';
import { ENV, addRequest, assertRefused, both, expectState } from './helpers/request.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const INV2 = '## [INV-2] Format\nThe export format is CSV.\n';
const S0 = '## [INV-3] Dates\nDates show in the customer\'s local format.\n';
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const INV4 = '## [INV-4] Separator\nThe CSV separator is a comma.\n';
const INV8 = '## [INV-8] Export page\nThe invoice page MUST offer the export.\n';
const EXTRA = '## [INV-12] Time zones\nTimes MUST carry their zone.\n';
const file = (...sections) => sections.join('\n');
const BASE = file('# Invoices\n', INV1, INV2, S0, INV4);

// A committed repo: specs/invoices.md holding `baseline`, the signed request `inv` holding `blocks`.
function setup(t, blocks, baseline = BASE) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', baseline);
  addRequest(repo, 'inv', blocks);
  repo.commit('setup');
  return repo;
}
const consolidate = (repo, ...args) => runAl(repo.dir, ['consolidate', 'inv', ...args], { env: ENV });
const spec = (repo) => repo.read('specs/invoices.md').toString();
const clean = (repo) => assert.equal(repo.git(['status', '--porcelain']), '', 'nothing should be written');
const ok = (r) => assert.equal(r.code, 0, both(r));

// Refused on a line with "refused", `key` and the cause (a heading), for the
// whole run and for --section `id`, with and without --yes; nothing written.
function assertBlockRefused(repo, key, id) {
  for (const args of [[], ['--yes'], ['--section', id], ['--section', id, '--yes']]) {
    const r = consolidate(repo, ...args);
    assertRefused(r, key, /heading/i);
    clean(repo);
    assertFrame(r.stdout);
  }
}

test('[SPC-5][STA-4] a pending add whose Now holds two headings (the second an ID already in the baseline) is refused, naming the block; nothing is written; with one heading it is written', async (t) => {
  const good = block('[INV-3]@1 modify', { was: S0, now: S1 });
  const repo = setup(t, [good, block('[INV-8]@1 add after [INV-3]', { now: `${INV8}\n${INV1.replace('Totals\n', 'Totals again\n')}` })]);
  await expectState(repo, 'inv/INV-8@1', 'pending');
  assertBlockRefused(repo, 'inv/INV-8@1', 'INV-8');
  assert.equal(spec(repo), BASE, 'not even the other pending block is written');

  const one = setup(t, [good, block('[INV-8]@1 add after [INV-3]', { now: INV8 })]);
  ok(consolidate(one, '--yes'));
  assert.equal(spec(one), file('# Invoices\n', INV1, INV2, S1, INV8, INV4));
});

test('[SPC-5][STA-4] a pending modify whose Now holds two headings (the second a fresh ID) is refused, naming the block; nothing is written; with one heading it is written', async (t) => {
  const repo = setup(t, [block('[INV-3]@1 modify', { was: S0, now: `${S1}\n${EXTRA}` })]);
  await expectState(repo, 'inv/INV-3@1', 'pending');
  assertBlockRefused(repo, 'inv/INV-3@1', 'INV-3');
  assert.equal(spec(repo), BASE);

  const one = setup(t, [block('[INV-3]@1 modify', { was: S0, now: S1 })]);
  ok(consolidate(one, '--yes'));
  assert.equal(spec(one), file('# Invoices\n', INV1, INV2, S1, INV4));
});

test('[SPC-5][STA-4] a pending add whose Now holds no heading at all (a paragraph) is refused, naming the block: exactly one heading; with one heading it is written', async (t) => {
  const repo = setup(t, [block('[INV-8]@1 add after [INV-3]', { now: 'The invoice page MUST offer the export.\n' })]);
  await expectState(repo, 'inv/INV-8@1', 'pending');
  assertBlockRefused(repo, 'inv/INV-8@1', 'INV-8');
  assert.equal(spec(repo), BASE);

  const one = setup(t, [block('[INV-8]@1 add after [INV-3]', { now: INV8 })]);
  ok(consolidate(one, '--yes'));
  assert.equal(spec(one), file('# Invoices\n', INV1, INV2, S0, INV8, INV4));
});

test('[SPC-5][STA-4] --revert of a consolidated modify, or of a consolidated remove, whose Was holds two headings is refused, naming the block; nothing is written; with one heading it is put back', async (t) => {
  const folded = file('# Invoices\n', INV1, S1, INV4);
  const repo = setup(t, [
    block('[INV-3]@1 modify', { was: `${S0}\n${EXTRA}`, now: S1 }),
    block('[INV-2]@1 remove, was after [INV-1]', { was: `${INV2}\n${EXTRA}` }),
  ], folded);
  await expectState(repo, 'inv/INV-3@1', 'consolidated');
  await expectState(repo, 'inv/INV-2@1', 'consolidated');
  for (const [id, key] of [['INV-3', 'inv/INV-3@1'], ['INV-2', 'inv/INV-2@1']]) {
    for (const extra of [[], ['--yes']]) {
      const r = consolidate(repo, '--revert', id, ...extra);
      assertRefused(r, key, /heading/i);
      clean(repo);
      assertFrame(r.stdout);
    }
  }
  assert.equal(spec(repo), folded);

  const one = setup(t, [
    block('[INV-3]@1 modify', { was: S0, now: S1 }),
    block('[INV-2]@1 remove, was after [INV-1]', { was: INV2 }),
  ], folded);
  ok(consolidate(one, '--revert', 'INV-3', '--yes'));
  ok(consolidate(one, '--revert', 'INV-2', '--yes'));
  assert.equal(spec(one), BASE);
});

test('[SPC-5][STA-4] an add in a new file whose one heading carries another ID (INV-1, already in the baseline) is refused, naming the block; nothing is written; with its own ID it is written', async (t) => {
  const repo = setup(t, [block('[INV-8]@1 add in specs/new.md', { now: '## [INV-1] Totals again\nTotals MUST round half up.\n' })]);
  await expectState(repo, 'inv/INV-8@1', 'pending');
  assertBlockRefused(repo, 'inv/INV-8@1', 'INV-8');
  assert.ok(!existsSync(join(repo.dir, 'specs/new.md')), 'specs/new.md is not created');

  const one = setup(t, [block('[INV-8]@1 add in specs/new.md', { now: INV8 })]);
  ok(consolidate(one, '--yes'));
  assert.equal(one.read('specs/new.md').toString(), INV8);
});

test('[SPC-5][STA-4] an add whose one heading carries another ID (INV-9, absent everywhere) is refused, naming the block; nothing is written; with its own ID it is written', async (t) => {
  const noInv3 = file('# Invoices\n', INV1, INV2, INV4);
  const repo = setup(t, [block('[INV-3]@1 add after [INV-2]', { now: '## [INV-9] Other\nOther things MUST hold.\n' })], noInv3);
  await expectState(repo, 'inv/INV-3@1', 'pending');
  assertBlockRefused(repo, 'inv/INV-3@1', 'INV-3');
  assert.equal(spec(repo), noInv3);

  const one = setup(t, [block('[INV-3]@1 add after [INV-2]', { now: S1 })], noInv3);
  ok(consolidate(one, '--yes'));
  assert.equal(spec(one), file('# Invoices\n', INV1, INV2, S1, INV4));
});

test('[SPC-5][STA-4] a modify whose Now heading carries no ID ("## Dates") is refused, naming the block; nothing is written; with its ID it is written', async (t) => {
  const repo = setup(t, [block('[INV-3]@1 modify', { was: S0, now: '## Dates\nDates MUST show in ISO 8601.\n' })]);
  await expectState(repo, 'inv/INV-3@1', 'pending');
  assertBlockRefused(repo, 'inv/INV-3@1', 'INV-3');
  assert.equal(spec(repo), BASE);

  const one = setup(t, [block('[INV-3]@1 modify', { was: S0, now: S1 })]);
  ok(consolidate(one, '--yes'));
  assert.equal(spec(one), file('# Invoices\n', INV1, INV2, S1, INV4));
});

test('[SPC-5][STA-4] --revert whose Was heading carries another ID (a modify\'s, a remove\'s) is refused, naming the block; nothing is written; with its own ID it is put back', async (t) => {
  const folded = file('# Invoices\n', INV1, S1, INV4);
  const repo = setup(t, [
    block('[INV-3]@1 modify', { was: S0.replace('[INV-3]', '[INV-9]'), now: S1 }),
    block('[INV-2]@1 remove, was after [INV-1]', { was: INV2.replace('[INV-2]', '[INV-10]') }),
  ], folded);
  await expectState(repo, 'inv/INV-3@1', 'consolidated');
  await expectState(repo, 'inv/INV-2@1', 'consolidated');
  for (const [id, key] of [['INV-3', 'inv/INV-3@1'], ['INV-2', 'inv/INV-2@1']]) {
    for (const extra of [[], ['--yes']]) {
      const r = consolidate(repo, '--revert', id, ...extra);
      assertRefused(r, key, /heading/i);
      clean(repo);
      assertFrame(r.stdout);
    }
  }
  assert.equal(spec(repo), folded);

  const one = setup(t, [
    block('[INV-3]@1 modify', { was: S0, now: S1 }),
    block('[INV-2]@1 remove, was after [INV-1]', { was: INV2 }),
  ], folded);
  ok(consolidate(one, '--revert', 'INV-3', '--yes'));
  ok(consolidate(one, '--revert', 'INV-2', '--yes'));
  assert.equal(spec(one), BASE);
});
