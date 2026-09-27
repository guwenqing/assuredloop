// al record <name> section <ID> [--builds-on <request>] [--accept]
// [--decision Dn] [--yes] [STA-5]: hold a baseline section, build on another
// request's block, revise one's own block under an existing decision, or
// accept the text underneath. Without --yes it writes
// nothing [TL-1]. The expected files are built by hand from [SPC-5].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, runAl } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';
import { block, changeMd, indent, shape, CHANGE_PROSE } from './helpers/change.js';

const ENV = { SOURCE_DATE_EPOCH: '1790206200', TZ: 'Asia/Tokyo' }; // 2026-09-23T23:30Z; 2026-09-24 in Tokyo
const DIR = 'requests/invoice-download';

const S0 = '## [INV-3] Dates\nDates show in the customer\'s local format.\n';
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const S2 = '## [INV-3] Dates\nDates MUST show in ISO 8601, with the time zone.\n';
const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const INV4 = '## [INV-4] Separator\nThe CSV separator is a comma.\n';

const HEAD = '# Customers can download invoices\nType: story · Tier: 2 · Status: open\n\n' +
  '## Owner\'s words and dialog\n\n- 2026-09-20 owner chat\n\n' +
  '## Organized requirement\n\n### R1 Invoice export\nA customer MUST be able to export one invoice as CSV.\n\n' +
  '### R2 Dates\nDates MUST show in ISO 8601.\nSigned off: pending\n';
// D3 is missing on purpose: --accept's next is the highest + 1, D5, and
// D3 is named only inside D2's text, so it is not an entry.
const DECISIONS = '\n## Decisions\n\n' +
  '- D1, 2026-09-21. Source: the owner. CSV only for now.\n' +
  '- D2, 2026-09-22. Source: the owner. ISO dates (D3 was withdrawn before it was written).\n' +
  '- D4, 2026-09-22. Source: the owner. Dates in the customer\'s zone.\n';
const REQUEST = HEAD + DECISIONS;

// A committed repo: the baseline INV-1, INV-3 (as `inv3`), INV-4; the request
// with `request` as request.md and `change` as change.md (if given); `others`
// as { name: change.md } for other requests.
function setup(t, { change, request = REQUEST, inv3 = S0, others = {} } = {}) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', [INV1, inv3, INV4].join('\n'));
  repo.write(`${DIR}/request.md`, request);
  if (change !== undefined) repo.write(`${DIR}/change.md`, change);
  for (const [name, text] of Object.entries(others)) {
    repo.write(`requests/${name}/request.md`, HEAD.replace('Customers can download invoices', name));
    repo.write(`requests/${name}/change.md`, text);
  }
  repo.commit('setup');
  return repo;
}

const section = (repo, args, name = 'invoice-download') => runAl(repo.dir, ['record', name, 'section', ...args], { env: ENV });
const read = (repo, rel) => repo.read(rel).toString();
const clean = (repo) => assert.equal(repo.git(['status', '--porcelain']), '', 'nothing should be written');
// A block as its [SPC-5] lines: the heading, then Was: and Now: with the section indented.
const blockShape = (head, { was, now }) => shape(`### ${head}\n` +
  (was === undefined ? '' : `Was:\n${indent(was)}`) + (now === undefined ? '' : `Now:\n${indent(now)}`));
// The line of `context` naming the ID with the state.
function assertContextState(repo, id, state) {
  const c = runAl(repo.dir, ['context', 'invoice-download']);
  assert.equal(c.code, 0, c.stderr);
  assert.ok(lines(c.stdout).some((l) => new RegExp(`\\b${id}\\b(?![.\\d])`).test(l) && l.includes(state)),
    `context should show ${id} ${state}:\n${c.stdout}`);
}

test('[STA-5][TL-1] record section <ID> in the baseline, no change.md: without --yes shows the block and writes nothing', (t) => {
  const repo = setup(t);
  const r = section(repo, ['INV-3']);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.stdout.includes('[INV-3]@1'), r.stdout);
  assert.ok(r.stdout.includes('Dates show in the customer\'s local format.'), r.stdout);
  assert.ok(!existsSync(join(repo.dir, DIR, 'change.md')), 'change.md should not be created');
  clean(repo);
  assertFrame(r.stdout);
});

test('[STA-5][SPC-5] record section <ID> --yes creates change.md with ## Spec changes and an @1 modify, was = now = the baseline; it reads no change yet', (t) => {
  const repo = setup(t);
  const r = section(repo, ['INV-3', '--yes']);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.stdout.includes('[INV-3]@1'), r.stdout);
  assert.deepEqual(shape(read(repo, `${DIR}/change.md`)),
    ['## Spec changes', ...blockShape('[INV-3]@1 modify', { was: S0, now: S0 })]);
  assert.equal(read(repo, `${DIR}/request.md`), REQUEST, 'request.md is unchanged');
  assertFrame(r.stdout);
  assertContextState(repo, 'INV-3', 'no change yet');
});

test('[STA-5][SPC-5] record section <ID> --yes appends to an existing change.md, keeping its prose and blocks', (t) => {
  const INV1B = INV1.replace('two decimals', 'two decimals, rounded half up');
  const old = changeMd(block('[INV-1]@1 modify   for R1', { was: INV1, now: INV1B }));
  const repo = setup(t, { change: old });
  const r = section(repo, ['INV-4', '--yes']);
  assert.equal(r.code, 0, r.stderr);
  const now = read(repo, `${DIR}/change.md`);
  assert.ok(now.startsWith(`${CHANGE_PROSE}## Spec changes\n`), now);
  assert.deepEqual(shape(now), [...shape(old), ...blockShape('[INV-4]@1 modify', { was: INV4, now: INV4 })]);
});

const OTHER = changeMd(
  block('[INV-3]@1 modify   Revised 2026-09-22 (D1)', { was: S0, now: S1 }),
  block('[INV-3]@2 modify', { was: S1, now: S2 }),
);

test('[STA-5] record section <ID> --builds-on <request>: without --yes names the other request\'s latest block and writes nothing', (t) => {
  const repo = setup(t, { others: { 'cancel-invoices': OTHER } });
  const r = section(repo, ['INV-3', '--builds-on', 'cancel-invoices']);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.stdout.includes('cancel-invoices/INV-3@2'), r.stdout);
  clean(repo);
});

test('[STA-5][SPC-5] record section <ID> --builds-on <request> --yes: @1 builds on its latest block, was = now = that block\'s now', (t) => {
  const repo = setup(t, { others: { 'cancel-invoices': OTHER } });
  const r = section(repo, ['INV-3', '--builds-on', 'cancel-invoices', '--yes']);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(shape(read(repo, `${DIR}/change.md`)),
    ['## Spec changes', ...blockShape('[INV-3]@1 modify  builds on cancel-invoices/INV-3@2', { was: S2, now: S2 })]);
  assert.equal(read(repo, 'requests/cancel-invoices/change.md'), OTHER, 'the other request is untouched');
  assert.equal(read(repo, `${DIR}/request.md`), REQUEST);
  assertContextState(repo, 'INV-3', 'no change yet');
});

test('[STA-5] record section <ID> --builds-on a request that holds no block for the ID exits 2 and writes nothing; one that does exits 0', (t) => {
  const repo = setup(t, { others: { 'cancel-invoices': OTHER } });
  for (const extra of [[], ['--yes']]) {
    const r = section(repo, ['INV-4', '--builds-on', 'cancel-invoices', ...extra]);
    assert.equal(r.code, 2, r.stdout + r.stderr);
    clean(repo);
  }
  assert.equal(section(repo, ['INV-3', '--builds-on', 'cancel-invoices']).code, 0);
});

const INV4B = '## [INV-4] Separator\nThe CSV separator MUST be a semicolon.\n';
// INV-3@1 held, and another block after it.
const OWN = changeMd(block('[INV-3]@1 modify', { was: S0, now: S1 }), block('[INV-4]@1 modify', { was: INV4, now: INV4B }));

test('[STA-5][TL-1] record section <ID> held already --decision D4: without --yes shows the revision (@2, Revised, D4) and writes nothing', (t) => {
  const repo = setup(t, { change: OWN });
  const r = section(repo, ['INV-3', '--decision', 'D4']);
  assert.equal(r.code, 0, r.stderr);
  for (const part of ['[INV-3]@2', 'Revised', 'D4']) assert.ok(r.stdout.includes(part), `should show ${part}:\n${r.stdout}`);
  clean(repo);
  assertFrame(r.stdout);
});

test('[STA-5][SPC-5] record section <ID> held already --decision D4 --yes: @1 marked Revised (UTC date, D4), @2 modify (was = now = @1\'s now) right after @1; request.md untouched', (t) => {
  const repo = setup(t, { change: OWN });
  const r = section(repo, ['INV-3', '--decision', 'D4', '--yes']);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(shape(read(repo, `${DIR}/change.md`)), [
    ...shape(CHANGE_PROSE), '## Spec changes',
    ...blockShape('[INV-3]@1 modify  Revised 2026-09-23 (D4)', { was: S0, now: S1 }),
    ...blockShape('[INV-3]@2 modify', { was: S1, now: S1 }),
    ...blockShape('[INV-4]@1 modify', { was: INV4, now: INV4B }),
  ]);
  assert.equal(read(repo, `${DIR}/request.md`), REQUEST, 'a revision writes no decision');
  assertFrame(r.stdout);
});

test('[STA-5] a revision without --decision, or naming no Decisions entry (D3 is only in text, D9 nowhere), exits 2, writes nothing, and says to write the decision first', (t) => {
  const repo = setup(t, { change: OWN });
  for (const args of [[], ['--decision', 'D3'], ['--decision', 'D9']]) {
    for (const extra of [[], ['--yes']]) {
      const r = section(repo, ['INV-3', ...args, ...extra]);
      assert.equal(r.code, 2, `${args.join(' ')} ${extra.join(' ')}: ${r.stdout}${r.stderr}`);
      assert.ok((r.stdout + r.stderr).includes('--decision'), `should say to pass --decision:\n${r.stdout}${r.stderr}`);
      clean(repo);
    }
  }
  assert.equal(section(repo, ['INV-3', '--decision', 'D4']).code, 0, 'an existing entry is accepted');
});

test('[STA-5] record section --accept without --yes shows the text underneath as the new now and writes nothing', (t) => {
  const repo = setup(t, { change: changeMd(block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })), inv3: S2 });
  const r = section(repo, ['INV-3', '--accept']);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.stdout.includes('with the time zone'), r.stdout);
  clean(repo);
  assertFrame(r.stdout);
});

test('[STA-5] record section --accept --yes keeps was, sets now to the baseline\'s text, records the decision; the section then reads consolidated', (t) => {
  const repo = setup(t, { change: changeMd(block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })), inv3: S2 });
  assertContextState(repo, 'INV-3', 'differs');
  const r = section(repo, ['INV-3', '--accept', '--yes']);
  assert.equal(r.code, 0, r.stderr);
  const change = read(repo, `${DIR}/change.md`);
  assert.ok(change.startsWith(`${CHANGE_PROSE}## Spec changes\n`), change);
  assert.deepEqual(shape(change), [...shape(CHANGE_PROSE), '## Spec changes',
    ...blockShape('[INV-3]@1 modify   for R2', { was: S0, now: S2 })]);
  assert.equal(read(repo, `${DIR}/request.md`), REQUEST +
    '- D5, 2026-09-23. Source: the agent. Accepted the text underneath [INV-3] as the new "now" for invoice-download/INV-3@1.\n');
  assertContextState(repo, 'INV-3', 'consolidated');
  assertFrame(r.stdout);
});

test('[STA-5] record section --accept --yes on a request with no ## Decisions adds the section at the end, with D1', (t) => {
  const repo = setup(t, { change: changeMd(block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })), inv3: S2, request: HEAD });
  const r = section(repo, ['INV-3', '--accept', '--yes']);
  assert.equal(r.code, 0, r.stderr);
  const req = read(repo, `${DIR}/request.md`);
  assert.ok(req.startsWith(HEAD), req);
  assert.deepEqual(shape(req.slice(HEAD.length)), ['## Decisions',
    '- D1, 2026-09-23. Source: the agent. Accepted the text underneath [INV-3] as the new "now" for invoice-download/INV-3@1.']);
});

test('[STA-5] --accept puts its decision at the end of ## Decisions when ## Parts follows it', (t) => {
  const parts = '\n## Parts\n\n1. CSV export\n';
  const repo = setup(t, { change: changeMd(block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })), inv3: S2, request: REQUEST + parts });
  const r = section(repo, ['INV-3', '--accept', '--yes']);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(read(repo, `${DIR}/request.md`), REQUEST +
    '- D5, 2026-09-23. Source: the agent. Accepted the text underneath [INV-3] as the new "now" for invoice-download/INV-3@1.\n' + parts);
});

test('[STA-5] --accept for an ID the request does not hold, or that is not in the baseline, exits 2 and writes nothing; a held baseline ID exits 0', (t) => {
  const INV8 = '## [INV-8] Export page\nThe invoice page MUST offer the export.\n';
  const repo = setup(t, { change: changeMd(
    block('[INV-3]@1 modify   for R2', { was: S0, now: S1 }),
    block('[INV-8]@1 add after [INV-4]   for R1', { now: INV8 })), inv3: S2 });
  for (const id of ['INV-4', 'INV-8']) {
    for (const extra of [[], ['--yes']]) {
      const r = section(repo, [id, '--accept', ...extra]);
      assert.equal(r.code, 2, `${id} ${extra.join(' ')}: ${r.stdout}${r.stderr}`);
      clean(repo);
    }
  }
  assert.equal(section(repo, ['INV-3', '--accept']).code, 0);
});

test('[STA-5] record section <ID> in neither the baseline nor the request exits 2, writes nothing, and points to the add block and spec --add-ids', (t) => {
  const repo = setup(t);
  for (const extra of [[], ['--yes']]) {
    const r = section(repo, ['INV-9', ...extra]);
    assert.equal(r.code, 2, r.stdout + r.stderr);
    assert.ok((r.stdout + r.stderr).includes('spec --add-ids'), r.stdout + r.stderr);
    clean(repo);
  }
  assert.equal(section(repo, ['INV-3']).code, 0, 'an ID in the baseline is accepted');
});

test('[STA-5][REC-1] record section on an unknown request exits 2 and writes nothing; the known one exits 0', (t) => {
  const repo = setup(t);
  for (const extra of [[], ['--yes']]) {
    const r = section(repo, ['INV-3', ...extra], 'no-such-request');
    assert.equal(r.code, 2, r.stdout + r.stderr);
    clean(repo);
  }
  assert.equal(section(repo, ['INV-3']).code, 0);
});
