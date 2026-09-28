// al consolidate <name> [--section <ID>] [--yes] [STA-4]@2 [TL-1]@2: it
// validates everything, shows what it would write, and with --yes writes
// atomically. Only a pending block not marked Dropped is written [STA-6];
// consolidated and carried blocks are left alone; every other state, a
// blocked request [REC-6] and a duplicate ID in the root [SPC-3] refuse with
// exit 1, and misuse exits 2 [HNT-3]. Where each op lands is checked as exact
// bytes (the architect's rulings 5-8). Acceptance C3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { makeRepo, runAl } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { ENV, ORG, addRequest, assertRefused, both, expectState, lineWith } from './helpers/request.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const INV2 = '## [INV-2] Format\nThe export format is CSV.\n';
const INV2B = '## [INV-2] Format\nThe export format MUST be CSV or PDF.\n';
const S0 = '## [INV-3] Dates\nDates show in the customer\'s local format.\n';
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const S2 = '## [INV-3] Dates\nDates MUST show in ISO 8601, with the time zone.\n';
const S3 = '## [INV-3] Dates\nDates MUST show in ISO 8601, with the time zone, to the second.\n';
const INV31 = '### [INV-3.1] Time zones\nTimes MUST carry their zone.\n';
const INV32 = '### [INV-3.2] Offsets\nOffsets MUST be written as +hh:mm.\n';
const INV4 = '## [INV-4] Separator\nThe CSV separator is a comma.\n';
const INV4_TAB = '## [INV-4] Separator\nThe CSV separator is a tab.\n';
const INV4B = '## [INV-4] Separator\nThe CSV separator MUST be a semicolon.\n';
const INV5 = '## [INV-5] Cancelling\nAn invoice MUST be cancellable.\n';
const INV6 = '## [INV-6] Credit notes\nA cancelled invoice MUST get a credit note.\n';
const INV7 = '## [INV-7] CSV export\nA customer MUST be able to export one invoice as CSV.\n';
const INV7B = '## [INV-7] CSV export\nA customer MUST be able to export one invoice or a month as CSV.\n';
const INV8 = '## [INV-8] Export page\nThe invoice page MUST offer the export.\n';
const INV9 = '## [INV-9] Export name\nThe file MUST be named after the invoice number.\n';

// Sections separated by one blank line, the file ending with one newline.
const file = (...sections) => sections.join('\n');
const BASE = file('# Invoices\n', INV1, INV2, S0, INV31, INV4);

// A committed repo: specs/invoices.md holding `baseline`, the request `inv`
// holding `blocks` (signed unless `signed: false`), `others` as { name: blocks },
// and `before(repo)` run just before the commit.
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
const spec = (repo, rel = 'specs/invoices.md') => repo.read(rel).toString();
const clean = (repo) => assert.equal(repo.git(['status', '--porcelain']), '', 'nothing should be written');
const ok = (r) => assert.equal(r.code, 0, both(r));

test('[STA-4][TL-1] consolidate without --yes: a "Would" line naming inv/INV-3@1, exit 0, nothing written; with --yes the Now replaces the section and it reads consolidated', async (t) => {
  const repo = setup(t, [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  await expectState(repo, 'inv/INV-3@1', 'pending');

  const preview = consolidate(repo, 'inv');
  ok(preview);
  assert.ok(lines(preview.stdout).some((l) => l.startsWith('Would')), `a line should start with "Would":\n${preview.stdout}`);
  assert.ok(preview.stdout.includes('inv/INV-3@1'), preview.stdout);
  clean(repo);
  assertFrame(preview.stdout);

  const r = consolidate(repo, 'inv', '--yes');
  ok(r);
  assert.ok(r.stdout.includes('inv/INV-3@1'), `the output names the block with its owner:\n${r.stdout}`);
  assert.equal(spec(repo), file('# Invoices\n', INV1, INV2, S1, INV31, INV4));
  assertFrame(r.stdout);
  await expectState(repo, 'inv/INV-3@1', 'consolidated');
  const c = runAl(repo.dir, ['context', 'inv']);
  assert.ok(lineWith(c.stdout, /^Spec/, 'INV-3', 'consolidated'), `context's Spec line should show INV-3 consolidated:\n${c.stdout}`);
});

// --- Where each op goes (exact bytes) ---

test('[STA-4] an add goes after its anchor and the anchor\'s deeper sub-headings, before the next heading at the anchor\'s level (exact bytes)', async (t) => {
  const repo = setup(t, [block('[INV-7]@1 add after [INV-3]   for R1', { now: INV7 })]);
  ok(consolidate(repo, 'inv', '--yes'));
  assert.equal(spec(repo), file('# Invoices\n', INV1, INV2, S0, INV31, INV7, INV4));
  await expectState(repo, 'inv/INV-7@1', 'consolidated');
});

test('[STA-4] an add after a sub-heading goes before the next heading at a higher level; an add after the last section goes at the end (exact bytes)', async (t) => {
  const repo = setup(t, [
    block('[INV-3.2]@1 add after [INV-3.1]', { now: INV32 }),
    block('[INV-8]@1 add after [INV-4]', { now: INV8 }),
  ]);
  ok(consolidate(repo, 'inv', '--yes'));
  assert.equal(spec(repo), file('# Invoices\n', INV1, INV2, S0, INV31, INV32, INV4, INV8));
  await expectState(repo, 'inv/INV-3.2@1', 'consolidated');
  await expectState(repo, 'inv/INV-8@1', 'consolidated');
});

test('[STA-4] an add into a file with no blank lines between sections still lands with one blank line before and after it; the other gaps stay as they were (exact bytes)', async (t) => {
  // INV-1 is followed directly by the next heading at its level; INV-3's last
  // sub-heading, INV-3.1, is followed directly by the next heading at INV-3's level.
  const tight = `# Invoices\n${INV1}${S0}${INV31}${INV4}`;
  const repo = setup(t, [
    block('[INV-2]@1 add after [INV-1]', { now: INV2 }),
    block('[INV-7]@1 add after [INV-3]', { now: INV7 }),
  ], { baseline: tight });
  ok(consolidate(repo, 'inv', '--yes'));
  assert.equal(spec(repo), `# Invoices\n${INV1}\n${INV2}\n${S0}${INV31}\n${INV7}\n${INV4}`);
  await expectState(repo, 'inv/INV-2@1', 'consolidated');
  await expectState(repo, 'inv/INV-7@1', 'consolidated');
});

test('[STA-4][SPC-5] add in <path>: a new file (and its folder) holds the Now as written; in an existing file it goes at the end (exact bytes)', async (t) => {
  const repo = setup(t, [
    block('[INV-8]@1 add in specs/billing/export.md', { now: INV8 }),
    block('[INV-9]@1 add in specs/invoices.md', { now: INV9 }),
  ]);
  ok(consolidate(repo, 'inv', '--yes'));
  assert.equal(spec(repo, 'specs/billing/export.md'), INV8);
  assert.equal(spec(repo), file(BASE, INV9));
  await expectState(repo, 'inv/INV-8@1', 'consolidated');
  await expectState(repo, 'inv/INV-9@1', 'consolidated');
});

test('[STA-4][SPC-4] a modify replaces the section in place and keeps the baseline\'s "###", with a Now of two paragraphs (exact bytes)', async (t) => {
  const was31 = INV31.slice(1); // "## [INV-3.1] ...": the # count is outside the comparison
  const now31 = '## [INV-3.1] Time zones\nTimes MUST carry their zone as an offset.\n';
  const s1p = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n\nTimes MUST show in UTC.\n';
  const repo = setup(t, [
    block('[INV-3.1]@1 modify', { was: was31, now: now31 }),
    block('[INV-3]@1 modify', { was: S0, now: s1p }),
  ]);
  await expectState(repo, 'inv/INV-3.1@1', 'pending');
  ok(consolidate(repo, 'inv', '--yes'));
  assert.equal(spec(repo), file('# Invoices\n', INV1, INV2, s1p, `#${now31}`, INV4));
  await expectState(repo, 'inv/INV-3.1@1', 'consolidated');
  await expectState(repo, 'inv/INV-3@1', 'consolidated');
});

test('[STA-4] a remove deletes the section and leaves one blank line between its neighbours; removing the last section leaves one final newline (exact bytes)', async (t) => {
  const repo = setup(t, [
    block('[INV-2]@1 remove, was after [INV-1]', { was: INV2 }),
    block('[INV-4]@1 remove, was after [INV-3]', { was: INV4 }),
  ]);
  ok(consolidate(repo, 'inv', '--yes'));
  assert.equal(spec(repo), file('# Invoices\n', INV1, S0, INV31));
  await expectState(repo, 'inv/INV-2@1', 'consolidated');
  await expectState(repo, 'inv/INV-4@1', 'consolidated');
});

// --- A request's own chain (ruling 6) ---

test('[STA-4][STA-5] a revision chain (@1 Revised, then @2): the whole run writes @1 then @2 in place; @2 reads consolidated and @1 carried by @2', async (t) => {
  const blocks = [
    block('[INV-3]@1 modify   Revised 2026-09-22 (D1)   for R2', { was: S0, now: S1 }),
    block('[INV-3]@2 modify   for R2', { was: S1, now: S2 }),
  ];
  const repo = setup(t, blocks);
  await expectState(repo, 'inv/INV-3@2', 'waiting', { by: 'inv/INV-3@1' });
  const r = consolidate(repo, 'inv', '--yes');
  ok(r);
  for (const key of ['inv/INV-3@1', 'inv/INV-3@2']) assert.ok(r.stdout.includes(key), `should name ${key}:\n${r.stdout}`);
  assert.equal(spec(repo), file('# Invoices\n', INV1, INV2, S2, INV31, INV4));
  await expectState(repo, 'inv/INV-3@2', 'consolidated');
  await expectState(repo, 'inv/INV-3@1', 'carried', { by: 'inv/INV-3@2' });

  // --section takes the one ID and walks the same chain.
  const one = setup(t, blocks);
  ok(consolidate(one, 'inv', '--section', 'INV-3', '--yes'));
  assert.equal(spec(one), file('# Invoices\n', INV1, INV2, S2, INV31, INV4));
});

test('[STA-4][STA-5] a revised add (@1 add, @2 modify) with --section: the file ends with @2\'s Now at @1\'s place', async (t) => {
  const repo = setup(t, [
    block('[INV-7]@1 add after [INV-3]   Revised 2026-09-22 (D1)   for R1', { now: INV7 }),
    block('[INV-7]@2 modify   for R1', { was: INV7, now: INV7B }),
  ]);
  ok(consolidate(repo, 'inv', '--section', 'INV-7', '--yes'));
  assert.equal(spec(repo), file('# Invoices\n', INV1, INV2, S0, INV31, INV7B, INV4));
  await expectState(repo, 'inv/INV-7@2', 'consolidated');
  await expectState(repo, 'inv/INV-7@1', 'carried', { by: 'inv/INV-7@2' });
});

// --- The anchor (ruling 7) ---

test('[STA-4] an add whose anchor is pending in the same request: --section refuses ("anchor", naming the anchor\'s block); the whole run writes both together', async (t) => {
  const blocks = [
    block('[INV-5]@1 add after [INV-4]', { now: INV5 }),
    block('[INV-6]@1 add after [INV-5]', { now: INV6 }),
  ];
  const repo = setup(t, blocks);
  await expectState(repo, 'inv/INV-6@1', 'pending');
  for (const extra of [[], ['--yes']]) {
    const r = consolidate(repo, 'inv', '--section', 'INV-6', ...extra);
    assertRefused(r, 'INV-6', 'anchor');
    assert.ok(both(r).includes('inv/INV-5@1'), `should name the block holding the anchor:\n${both(r)}`);
    clean(repo);
    assertFrame(r.stdout);
  }
  ok(consolidate(repo, 'inv', '--yes'));
  assert.equal(spec(repo), file(BASE, INV5, INV6));
});

test('[STA-4] an add whose anchor is held by another request\'s pending add refuses, naming that block; with no block holding the anchor it refuses too', async (t) => {
  const repo = setup(t, [block('[INV-6]@1 add after [INV-5]', { now: INV6 })],
    { others: { 'cancel-invoices': [block('[INV-5]@1 add after [INV-4]', { now: INV5 })] } });
  for (const extra of [[], ['--yes']]) {
    const r = consolidate(repo, 'inv', ...extra);
    assertRefused(r, 'INV-6', 'anchor');
    assert.ok(both(r).includes('cancel-invoices/INV-5@1'), `should name the block holding the anchor:\n${both(r)}`);
    clean(repo);
  }

  const alone = setup(t, [block('[INV-6]@1 add after [INV-5]', { now: INV6 })]);
  for (const extra of [[], ['--yes']]) {
    assertRefused(consolidate(alone, 'inv', ...extra), 'INV-6', 'anchor');
    clean(alone);
  }
});

test('[STA-4] a pending modify of the anchor does not block an add after it: --section INV-7 writes the add and leaves the anchor at its "was"', async (t) => {
  const repo = setup(t, [
    block('[INV-3]@1 modify', { was: S0, now: S1 }),
    block('[INV-7]@1 add after [INV-3]', { now: INV7 }),
  ]);
  ok(consolidate(repo, 'inv', '--section', 'INV-7', '--yes'));
  assert.equal(spec(repo), file('# Invoices\n', INV1, INV2, S0, INV31, INV7, INV4));
  await expectState(repo, 'inv/INV-3@1', 'pending');
});

// --- Validate everything first (ruling 5) ---

test('[STA-4] the whole run writes nothing when any block refuses, and names each refusing block; --section on a pending block still writes it', async (t) => {
  const repo = setup(t, [
    block('[INV-3]@1 modify', { was: S0, now: S1 }),
    block('[INV-4]@1 modify', { was: INV4_TAB, now: INV4B }),
    block('[INV-12]@1 modify', { was: '## [INV-12] Paper\nInvoices are printed.\n', now: '## [INV-12] Paper\nInvoices MUST NOT be printed.\n' }),
  ]);
  await expectState(repo, 'inv/INV-4@1', 'differs');
  await expectState(repo, 'inv/INV-12@1', 'not found');
  for (const extra of [[], ['--yes']]) {
    const r = consolidate(repo, 'inv', ...extra);
    assertRefused(r, 'INV-4', 'differs');
    assertRefused(r, 'INV-12', 'not found');
    clean(repo);
    assertFrame(r.stdout);
  }
  ok(consolidate(repo, 'inv', '--section', 'INV-3', '--yes'));
  assert.equal(spec(repo), file('# Invoices\n', INV1, INV2, S1, INV31, INV4));
});

// One held INV-3 in each state outside the positive list (the others: a blocked
// request and duplicates, below). Each case sets up the repo and gives the state.
const REFUSED = {
  'no change yet': () => ({ blocks: [block('[INV-3]@1 modify', { was: S0, now: S0 })] }),
  waiting: () => ({
    blocks: [block('[INV-3]@1 modify   builds on cancel-invoices/INV-3@1', { was: S1, now: S2 })],
    others: { 'cancel-invoices': [block('[INV-3]@1 modify', { was: S0, now: S1 })] },
  }),
  'base revised': () => ({
    baseline: file('# Invoices\n', INV1, INV2, S1, INV31, INV4),
    blocks: [block('[INV-3]@1 modify   builds on cancel-invoices/INV-3@1', { was: S1, now: S2 })],
    others: { 'cancel-invoices': [
      block('[INV-3]@1 modify   Revised 2026-09-22 (D1)', { was: S0, now: S1 }),
      block('[INV-3]@2 modify', { was: S1, now: S3 }),
    ] },
  }),
  'base dropped': () => ({
    blocks: [block('[INV-3]@1 modify   builds on cancel-invoices/INV-3@1', { was: S1, now: S2 })],
    others: { 'cancel-invoices': [block('[INV-3]@1 modify   Dropped 2026-09-22 (D4)', { was: S0, now: S1 })] },
  }),
  'broken link': () => ({
    baseline: file('# Invoices\n', INV1, INV2, S1, INV31, INV4),
    blocks: [block('[INV-3]@1 modify   builds on nosuch/INV-3@1', { was: S1, now: S2 })],
  }),
  'not found': () => ({ baseline: file('# Invoices\n', INV1, INV2, INV4), blocks: [block('[INV-3]@1 modify', { was: S0, now: S1 })] }),
  differs: () => ({ baseline: file('# Invoices\n', INV1, INV2, S3, INV31, INV4), blocks: [block('[INV-3]@1 modify', { was: S0, now: S1 })] }),
};

for (const [state, make] of Object.entries(REFUSED)) {
  test(`[STA-4][HNT-3] a block that reads ${state} is refused (exit 1) with and without --yes, on a line naming INV-3 and "${state}"; nothing written`, async (t) => {
    const { blocks, ...opts } = make();
    const repo = setup(t, blocks, opts);
    await expectState(repo, 'inv/INV-3@1', state, { by: state === 'waiting' ? 'cancel-invoices/INV-3@1' : null });
    for (const args of [['inv'], ['inv', '--yes'], ['inv', '--section', 'INV-3', '--yes']]) {
      const r = consolidate(repo, ...args);
      assertRefused(r, 'INV-3', state);
      clean(repo);
      assertFrame(r.stdout);
    }
  });
}

test('[STA-4][REC-6] a blocked request is refused ("blocked"): no sign-off, and changed since the sign-off; nothing written', (t) => {
  const pending = [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })];
  const unsigned = setup(t, pending, { signed: false });
  const changed = setup(t, pending, { org: ORG.replace('ISO 8601', 'RFC 3339') });
  for (const repo of [unsigned, changed]) {
    for (const extra of [[], ['--yes']]) {
      const r = consolidate(repo, 'inv', ...extra);
      assertRefused(r, 'blocked');
      clean(repo);
      assertFrame(r.stdout);
    }
  }
});

test('[STA-4][SPC-3] a duplicate ID anywhere in the root (another file) refuses every write, the preview included ("duplicate", naming the ID)', (t) => {
  const repo = setup(t, [block('[INV-3]@1 modify', { was: S0, now: S1 })],
    { before: (r) => r.write('specs/other.md', '## [INV-1] Totals again\nTotals MUST round half up.\n') });
  for (const args of [['inv'], ['inv', '--yes'], ['inv', '--section', 'INV-3', '--yes']]) {
    const r = consolidate(repo, ...args);
    assertRefused(r, 'duplicate');
    assert.ok(lineWith(both(r), 'INV-1'), `should name the duplicate INV-1:\n${both(r)}`);
    clean(repo);
  }
});

// --- Dropped (ruling 5), and what is left alone ---

test('[STA-4][STA-6] a block marked Dropped is skipped by the whole run, whatever its state; --section on a section whose every block is Dropped refuses', async (t) => {
  const repo = setup(t, [
    block('[INV-3]@1 modify', { was: S0, now: S1 }),
    block('[INV-2]@1 modify   Dropped 2026-09-23 (D4)', { was: INV2, now: INV2B }),
    block('[INV-4]@1 modify   Dropped 2026-09-23 (D4)', { was: INV4_TAB, now: INV4B }),
  ]);
  await expectState(repo, 'inv/INV-2@1', 'pending');
  await expectState(repo, 'inv/INV-4@1', 'differs');
  const r = consolidate(repo, 'inv', '--yes');
  ok(r);
  assert.equal(spec(repo), file('# Invoices\n', INV1, INV2, S1, INV31, INV4));

  repo.commit('INV-3 consolidated');
  for (const extra of [[], ['--yes']]) {
    const s = consolidate(repo, 'inv', '--section', 'INV-2', ...extra);
    assertRefused(s, 'INV-2', /dropped/i);
    clean(repo);
  }
});

test('[STA-4] consolidated blocks are left alone: the whole run writes only the pending one; --section on the consolidated one writes nothing, exit 0', async (t) => {
  const repo = setup(t, [
    block('[INV-3]@1 modify', { was: S0, now: S1 }),
    block('[INV-7]@1 add after [INV-3]', { now: INV7 }),
  ], { baseline: file('# Invoices\n', INV1, INV2, S1, INV31, INV4) });
  await expectState(repo, 'inv/INV-3@1', 'consolidated');
  ok(consolidate(repo, 'inv', '--yes'));
  assert.equal(spec(repo), file('# Invoices\n', INV1, INV2, S1, INV31, INV7, INV4));

  repo.commit('INV-7 consolidated');
  for (const extra of [[], ['--yes']]) {
    ok(consolidate(repo, 'inv', '--section', 'INV-3', ...extra));
    ok(consolidate(repo, 'inv', ...extra));
    clean(repo);
  }
});

test('[STA-4][STA-2] anyone may consolidate another request\'s section, named by owner; a waiting block then consolidates, and the carried one is never written back', async (t) => {
  const repo = setup(t, [block('[INV-3]@1 modify   builds on cancel-invoices/INV-3@1', { was: S1, now: S2 })],
    { others: { 'cancel-invoices': [block('[INV-3]@1 modify', { was: S0, now: S1 })] } });
  assertRefused(consolidate(repo, 'inv', '--yes'), 'INV-3', 'waiting');
  clean(repo);

  const a = consolidate(repo, 'cancel-invoices', '--yes');
  ok(a);
  assert.ok(a.stdout.includes('cancel-invoices/INV-3@1'), `the output names the owner:\n${a.stdout}`);
  assert.equal(spec(repo), file('# Invoices\n', INV1, INV2, S1, INV31, INV4));

  const b = consolidate(repo, 'inv', '--yes');
  ok(b);
  assert.ok(b.stdout.includes('inv/INV-3@1'), b.stdout);
  const after = file('# Invoices\n', INV1, INV2, S2, INV31, INV4);
  assert.equal(spec(repo), after);
  await expectState(repo, 'cancel-invoices/INV-3@1', 'carried', { by: 'inv/INV-3@1' });

  repo.commit('both consolidated');
  for (const args of [['cancel-invoices', '--yes'], ['cancel-invoices', '--section', 'INV-3', '--yes']]) {
    ok(consolidate(repo, ...args));
    assert.equal(spec(repo), after, 'a carried section is never rewritten back to an earlier "now"');
  }
  clean(repo);
});

// --- Misuse (exit 2) ---

// `add in <path>` must name a file under the root, with no `..` and no symlink
// on the way. `outDir` is a real folder next to the repo, holding x.md; `link`
// is [where the committed symlink is, what in outDir it points to].
const OUTSIDE = '## Outside\nNot ours.\n';
const GUARDS = [
  ['outside the root', () => 'docs/export.md'],
  ['outside the repo, with ..', () => '../outside/x.md'],
  ['under the root, but through ..', () => 'specs/../specs/export.md'],
  ['an absolute path outside the repo', (outDir) => join(outDir, 'x.md')],
  ['through a symlinked folder under the root', () => 'specs/linked/x.md', ['specs/linked', '']],
  ['a symlinked file under the root', () => 'specs/link.md', ['specs/link.md', 'x.md']],
];

for (const [label, path, link] of GUARDS) {
  test(`[STA-4][SPC-5] add in a path ${label} exits 2 and writes nothing, not even the request's other pending block, with or without --yes`, (t) => {
    const repo = makeRepo(t);
    const outDir = join(dirname(repo.dir), 'outside');
    mkdirSync(outDir);
    writeFileSync(join(outDir, 'x.md'), OUTSIDE);
    repo.write('specs/invoices.md', BASE);
    addRequest(repo, 'inv', [
      block('[INV-3]@1 modify', { was: S0, now: S1 }),
      block(`[INV-8]@1 add in ${path(outDir)}`, { now: INV8 }),
    ]);
    if (link) symlinkSync(join(outDir, link[1]), join(repo.dir, link[0]));
    repo.commit('setup');
    for (const extra of [[], ['--yes']]) {
      const r = consolidate(repo, 'inv', ...extra);
      assert.equal(r.code, 2, both(r));
      clean(repo);
      assert.equal(readFileSync(join(outDir, 'x.md'), 'utf8'), OUTSIDE, 'the file outside must stay byte-identical');
      assert.ok(!existsSync(join(repo.dir, 'docs/export.md')) && !existsSync(join(repo.dir, 'specs/export.md')), 'no file created');
      assertFrame(r.stdout);
    }

    // The contrast: the same request with a plain path under the root is written.
    if (link) rmSync(join(repo.dir, link[0]));
    addRequest(repo, 'inv', [
      block('[INV-3]@1 modify', { was: S0, now: S1 }),
      block('[INV-8]@1 add in specs/export.md', { now: INV8 }),
    ]);
    ok(consolidate(repo, 'inv', '--yes'));
    assert.equal(spec(repo, 'specs/export.md'), INV8);
    assert.equal(spec(repo), file('# Invoices\n', INV1, INV2, S1, INV31, INV4));
  });
}

test('[STA-4][HNT-3] consolidate of an unknown request exits 2 and writes nothing; the known one exits 0', (t) => {
  const repo = setup(t, [block('[INV-3]@1 modify', { was: S0, now: S1 })]);
  for (const extra of [[], ['--yes']]) {
    const r = consolidate(repo, 'no-such-request', ...extra);
    assert.equal(r.code, 2, both(r));
    clean(repo);
  }
  ok(consolidate(repo, 'inv'));
});
