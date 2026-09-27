// changeStates(repoDir, { at }) from src/states.js: the change spec [SPC-5]
// parsed, the link check [STA-1] first, then the content states [STA-2], and
// "retains nothing" [STA-3]; revisions [STA-5]. Acceptance C3, and C2's
// classification. Expected states are worked out by hand from design §5.2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRepo } from './helpers/fixture.js';
import { block, changeMd, requestMd, indent, fence, CHANGE_PROSE } from './helpers/change.js';

// Loaded per test, so a missing module fails each test rather than the file.
async function states(repo, opts) {
  const { changeStates } = await import('../src/states.js');
  return await changeStates(repo.dir, opts);
}

const FIELDS = ['request', 'id', 'n', 'block', 'op', 'state', 'by', 'candidates', 'retainsNothing', 'forR'];
const pick = (e) => Object.fromEntries(FIELDS.map((f) => [f, e[f]]));
const keys = (list) => list.map((e) => e.block).sort();

function entry(list, key) {
  const e = list.find((x) => x.block === key);
  assert.ok(e, `no entry ${key} in ${JSON.stringify(keys(list))}`);
  return e;
}
// The state of one block, what it names (`by`), and whether it retains nothing.
function expectState(list, key, state, { by = null, retainsNothing } = {}) {
  const e = entry(list, key);
  assert.equal(e.state, state, `${key}: ${JSON.stringify(pick(e))}`);
  assert.equal(e.by, by, `${key} by: ${JSON.stringify(pick(e))}`);
  if (retainsNothing !== undefined) assert.equal(e.retainsNothing, retainsNothing, `${key} retainsNothing: ${JSON.stringify(pick(e))}`);
}

// Four versions of one section, and some neighbours.
const S0 = '## [INV-3] Dates\nDates show in the customer\'s local format.\n';
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const S2 = '## [INV-3] Dates\nDates MUST show in ISO 8601, with the time zone.\n';
const S3 = '## [INV-3] Dates\nDates MUST show in ISO 8601, with the time zone, to the second.\n';
const S4 = '## [INV-3] Dates\nDates MUST show in RFC 3339.\n';
const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const INV2 = '## [INV-2] Format\nThe export format is CSV.\n';
const INV7 = '## [INV-7] CSV export\nA customer MUST be able to export one invoice as CSV.\n';
const INV7B = '## [INV-7] CSV export\nA customer MUST be able to export one invoice or a month as CSV.\n';
const INV8 = '## [INV-8] Export page\nThe invoice page MUST offer the export.\n';
const INV31 = '## [INV-3.1] Time zones\nTimes MUST carry their zone.\n';

// specs/invoices.md holding the given sections.
const baseline = (repo, ...sections) => repo.write('specs/invoices.md', sections.join('\n'));
// requests/<name>/ (or `dir`) with a request.md and a change.md of `blocks`.
function request(repo, name, blocks, { status = 'open', dir = `requests/${name}` } = {}) {
  repo.write(`${dir}/request.md`, requestMd(name, { status }));
  repo.write(`${dir}/change.md`, changeMd(...blocks));
}

// --- Parsing [SPC-5] ---

test('[SPC-5][STA-2] each op, the ID (dotted too), n, block key and several for R are read; one entry per block', async (t) => {
  const repo = makeRepo(t);
  baseline(repo, INV1, INV2, S0);
  request(repo, 'inv', [
    block('[INV-3]@1 modify   for R1', { was: S0, now: S1 }),
    block('[INV-7]@1 add after [INV-3]   for R1, R3', { now: INV7 }),
    block('[INV-8]@1 add in specs/export.md   for R2', { now: INV8 }),
    block('[INV-2]@1 remove, was after [INV-1]', { was: INV2 }),
    block('[INV-3.1]@1 add after [INV-3]', { now: INV31 }),
  ]);
  const list = await states(repo);
  const one = (id, op, forR) => ({ request: 'inv', id, n: 1, block: `inv/${id}@1`, op, state: 'pending', by: null,
    candidates: [], retainsNothing: true, forR });
  const byBlock = (a, b) => (a.block < b.block ? -1 : a.block > b.block ? 1 : 0);
  assert.deepEqual(list.map(pick).sort(byBlock), [
    one('INV-2', 'remove', []),
    one('INV-3', 'modify', ['R1']),
    one('INV-3.1', 'add', []),
    one('INV-7', 'add', ['R1', 'R3']),
    one('INV-8', 'add', ['R2']),
  ].sort(byBlock));
});

test('[SPC-5] Was and Now in fenced blocks, or indented with no blank line after the label, are read', async (t) => {
  const repo = makeRepo(t);
  const INV1B = INV1.replace('two decimals', 'two decimals, rounded half up');
  baseline(repo, INV1, S0);
  repo.write('requests/fenced/request.md', requestMd('fenced'));
  repo.write('requests/fenced/change.md', `${CHANGE_PROSE}## Spec changes\n\n### [INV-3]@1 modify\nWas:\n${fence(S0)}Now:\n${fence(S1)}`);
  repo.write('requests/tight/request.md', requestMd('tight'));
  repo.write('requests/tight/change.md', `${CHANGE_PROSE}## Spec changes\n\n### [INV-1]@1 modify\nWas:\n${indent(INV1)}Now:\n${indent(INV1B)}`);
  let list = await states(repo);
  expectState(list, 'fenced/INV-3@1', 'pending');
  expectState(list, 'tight/INV-1@1', 'pending');

  baseline(repo, INV1B, S1);
  list = await states(repo);
  expectState(list, 'fenced/INV-3@1', 'consolidated');
  expectState(list, 'tight/INV-1@1', 'consolidated');
});

test('[SPC-5][SPC-4] a blank line inside an indented block is part of it', async (t) => {
  const repo = makeRepo(t);
  const now = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n\nTimes MUST show in UTC.\n';
  request(repo, 'inv', [block('[INV-3]@1 modify', { was: S0, now })]);
  baseline(repo, INV1, now);
  expectState(await states(repo), 'inv/INV-3@1', 'consolidated');
  // The same words with the paragraph break gone are not the same section.
  baseline(repo, INV1, now.replace('8601.\n\n', '8601.\n'));
  expectState(await states(repo), 'inv/INV-3@1', 'differs');
});

test('[SPC-4][STA-2] the baseline is found by ID in any file under the root, whatever its heading level or trailing spaces', async (t) => {
  const repo = makeRepo(t);
  request(repo, 'inv', [block('[INV-3]@1 modify', { was: S0, now: S1 })]);
  repo.write('specs/billing/dates.md', `# Billing\n\n### [INV-3] Dates  \nDates MUST show in ISO 8601.\t\n\n## [INV-4] Other\nText.\n`);
  expectState(await states(repo), 'inv/INV-3@1', 'consolidated');
});

test('[SPC-1][STA-2] the root is `root:` in .assuredloop when set, else specs/', async (t) => {
  const repo = makeRepo(t);
  request(repo, 'inv', [block('[INV-3]@1 modify', { was: S0, now: S1 })]);
  repo.write('specs/invoices.md', S0);
  repo.write('docs/spec/invoices.md', S1);
  expectState(await states(repo), 'inv/INV-3@1', 'pending');
  repo.write('.assuredloop', 'root: docs/spec\n');
  expectState(await states(repo), 'inv/INV-3@1', 'consolidated');
});

test('[VW-8][STA-2] { at } reads the change specs and the baseline from that commit', async (t) => {
  const repo = makeRepo(t);
  baseline(repo, INV1, S0);
  request(repo, 'inv', [block('[INV-3]@1 modify', { was: S0, now: S1 })]);
  const before = repo.commit('hold INV-3');
  baseline(repo, INV1, S1);
  request(repo, 'inv', [block('[INV-3]@1 modify', { was: S0, now: S1 }), block('[INV-7]@1 add after [INV-3]', { now: INV7 })]);
  repo.commit('consolidate INV-3, hold INV-7');

  const then = await states(repo, { at: before });
  assert.deepEqual(keys(then), ['inv/INV-3@1']);
  expectState(then, 'inv/INV-3@1', 'pending');
  const now = await states(repo);
  assert.deepEqual(keys(now), ['inv/INV-3@1', 'inv/INV-7@1']);
  expectState(now, 'inv/INV-3@1', 'consolidated');
});

// --- The content states [STA-2], one request, no links ---

test('[STA-2] row 1: "was" equals "now" is no change yet, whatever the baseline holds; it retains nothing', async (t) => {
  const repo = makeRepo(t);
  request(repo, 'inv', [block('[INV-3]@1 modify', { was: S0, now: S0 })]);
  baseline(repo, INV1, S0);
  expectState(await states(repo), 'inv/INV-3@1', 'no change yet', { retainsNothing: true });
  baseline(repo, INV1, S3);
  expectState(await states(repo), 'inv/INV-3@1', 'no change yet', { retainsNothing: true });
});

test('[STA-2][STA-3] row 2: consolidated for a modify, an add and a remove (the ID absent); each possibly retained', async (t) => {
  const repo = makeRepo(t);
  request(repo, 'inv', [
    block('[INV-3]@1 modify', { was: S0, now: S1 }),
    block('[INV-7]@1 add after [INV-3]', { now: INV7 }),
    block('[INV-2]@1 remove, was after [INV-1]', { was: INV2 }),
  ]);
  baseline(repo, INV1, S1, INV7);
  const list = await states(repo);
  for (const key of ['inv/INV-3@1', 'inv/INV-7@1', 'inv/INV-2@1']) expectState(list, key, 'consolidated', { retainsNothing: false });
});

test('[STA-2][STA-3] row 5: pending when the baseline equals "was" (an add: absent; a remove: still there); it retains nothing', async (t) => {
  const repo = makeRepo(t);
  request(repo, 'inv', [
    block('[INV-3]@1 modify', { was: S0, now: S1 }),
    block('[INV-8]@1 add in specs/export.md', { now: INV8 }),
    block('[INV-2]@1 remove, was after [INV-1]', { was: INV2 }),
  ]);
  baseline(repo, INV1, INV2, S0);
  const list = await states(repo);
  for (const key of ['inv/INV-3@1', 'inv/INV-8@1', 'inv/INV-2@1']) expectState(list, key, 'pending', { retainsNothing: true });
});

test('[STA-2] an add after an anchor that is still pending reads pending, not waiting', async (t) => {
  const repo = makeRepo(t);
  request(repo, 'inv', [
    block('[INV-3]@1 add after [INV-1]', { now: S1 }),
    block('[INV-7]@1 add after [INV-3]', { now: INV7 }),
  ]);
  baseline(repo, INV1);
  const list = await states(repo);
  expectState(list, 'inv/INV-3@1', 'pending');
  expectState(list, 'inv/INV-7@1', 'pending', { retainsNothing: true });
});

test('[STA-2][STA-3] row 6: a held ID not in the baseline is not found, with candidates whose body equals "was" or "now" exactly', async (t) => {
  const repo = makeRepo(t);
  request(repo, 'inv', [block('[INV-3]@1 modify', { was: S0, now: S1 })]);
  baseline(repo, INV1,
    '## [INV-9] Date display\nDates show in the customer\'s local format.\n',      // "was" body, renamed
    '## [INV-10] Dates\nDates MUST show in ISO 8601.\n',                           // "now" body
    '### [INV-12] Local dates\nDates show in the customer\'s local format.   \n',   // "was" body, after [SPC-4]
    '## [INV-11] Dates\nDates show in the customer\'s local format!\n',            // close, not equal
    '## [INV-13] Dates\nDates show in the local format.\n');                      // same title only
  const e = entry(await states(repo), 'inv/INV-3@1');
  assert.equal(e.state, 'not found', JSON.stringify(pick(e)));
  assert.deepEqual([...e.candidates].sort(), ['INV-10', 'INV-12', 'INV-9']);
  assert.equal(e.by, null);
  assert.equal(e.retainsNothing, false, 'a failure to match is not "retains nothing" [STA-3]');
});

test('[STA-2] candidates are empty for every state but not found', async (t) => {
  const repo = makeRepo(t);
  request(repo, 'inv', [block('[INV-3]@1 modify', { was: S0, now: S1 })]);
  baseline(repo, INV1, S3, '## [INV-9] Dates\nDates MUST show in ISO 8601.\n');
  const e = entry(await states(repo), 'inv/INV-3@1');
  assert.equal(e.state, 'differs');
  assert.deepEqual(e.candidates, []);
});

test('[STA-2][STA-3] row 7: differs when the baseline is neither "was" nor "now" (modify, add, remove); possibly retained', async (t) => {
  const repo = makeRepo(t);
  request(repo, 'inv', [
    block('[INV-3]@1 modify', { was: S0, now: S1 }),
    block('[INV-7]@1 add after [INV-3]', { now: INV7 }),
    block('[INV-2]@1 remove, was after [INV-1]', { was: INV2 }),
  ]);
  baseline(repo, INV1, INV2.replace('CSV', 'CSV or PDF'), S3, INV7B);
  const list = await states(repo);
  for (const key of ['inv/INV-3@1', 'inv/INV-7@1', 'inv/INV-2@1']) expectState(list, key, 'differs', { retainsNothing: false });
});

// --- The link check [STA-1] ---

test('[STA-1] broken link: the named block does not exist (no such version, no such request)', async (t) => {
  const repo = makeRepo(t);
  baseline(repo, INV1, S1);
  request(repo, 'a', [block('[INV-3]@1 modify', { was: S0, now: S1 })]);
  request(repo, 'b', [block('[INV-3]@1 modify   builds on a/INV-3@2', { was: S1, now: S2 })]);
  request(repo, 'c', [block('[INV-3]@1 modify   builds on nosuch/INV-3@1', { was: S1, now: S2 })]);
  request(repo, 'd', [block('[INV-3]@1 modify   builds on a/INV-3@1', { was: S1, now: S2 })]);
  const list = await states(repo);
  expectState(list, 'b/INV-3@1', 'broken link');
  expectState(list, 'c/INV-3@1', 'broken link');
  expectState(list, 'd/INV-3@1', 'pending'); // the same link to a block that exists
});

test('[STA-1] broken link: this block\'s "was" is not the base\'s "now"', async (t) => {
  const repo = makeRepo(t);
  baseline(repo, INV1, S1);
  request(repo, 'a', [block('[INV-3]@1 modify', { was: S0, now: S1 })]);
  request(repo, 'b', [block('[INV-3]@1 modify   builds on a/INV-3@1', { was: S0, now: S2 })]);
  expectState(await states(repo), 'b/INV-3@1', 'broken link');
});

test('[STA-1] broken link: an add building on an add (it has no "was"), across requests and as an implied @2', async (t) => {
  const repo = makeRepo(t);
  baseline(repo, INV1);
  request(repo, 'a', [block('[INV-7]@1 add after [INV-1]', { now: INV7 })]);
  request(repo, 'b', [block('[INV-7]@1 add after [INV-1]   builds on a/INV-7@1', { now: INV7B })]);
  request(repo, 'c', [
    block('[INV-7]@1 add after [INV-1]   Revised 2026-09-26 (D1)', { now: INV7 }),
    block('[INV-7]@2 add after [INV-1]', { now: INV7B }),
  ]);
  const list = await states(repo);
  expectState(list, 'a/INV-7@1', 'pending');
  expectState(list, 'b/INV-7@1', 'broken link');
  expectState(list, 'c/INV-7@2', 'broken link');
});

test('C3 [STA-1] a cycle of blocks (x@1 builds on y@1, which builds on x@1) is a broken link', async (t) => {
  const repo = makeRepo(t);
  baseline(repo, INV1, S1);
  request(repo, 'x', [block('[INV-3]@1 modify   builds on y/INV-3@1', { was: S1, now: S2 })]);
  request(repo, 'y', [block('[INV-3]@1 modify   builds on x/INV-3@1', { was: S2, now: S1 })]);
  const list = await states(repo);
  expectState(list, 'x/INV-3@1', 'broken link');
  expectState(list, 'y/INV-3@1', 'broken link');
});

test('C3 [STA-1] base dropped: the base block is marked Dropped', async (t) => {
  const repo = makeRepo(t);
  baseline(repo, INV1, S0);
  request(repo, 'a', [block('[INV-3]@1 modify   Dropped 2026-09-25 (D2)', { was: S0, now: S1 })]);
  request(repo, 'b', [block('[INV-3]@1 modify   builds on a/INV-3@1', { was: S1, now: S2 })]);
  expectState(await states(repo), 'b/INV-3@1', 'base dropped');
});

test('C3 [STA-1] base dropped: the base\'s request is dropped; when the base block is Kept the link stays valid', async (t) => {
  const repo = makeRepo(t);
  baseline(repo, INV1, S1);
  request(repo, 'a', [block('[INV-3]@1 modify', { was: S0, now: S1 })], { status: 'dropped' });
  request(repo, 'b', [block('[INV-3]@1 modify   builds on a/INV-3@1', { was: S1, now: S2 })]);
  expectState(await states(repo), 'b/INV-3@1', 'base dropped');

  request(repo, 'a', [block('[INV-3]@1 modify   Kept 2026-09-26 (D3)', { was: S0, now: S1 })], { status: 'dropped' });
  expectState(await states(repo), 'b/INV-3@1', 'pending', { retainsNothing: true });
});

test('C3 [STA-1] base revised: building on a Revised block of another request; building on its newer version is valid', async (t) => {
  const repo = makeRepo(t);
  baseline(repo, INV1, S2);
  request(repo, 'a', [
    block('[INV-3]@1 modify   Revised 2026-09-26 (D1)', { was: S0, now: S1 }),
    block('[INV-3]@2 modify', { was: S1, now: S2 }),
  ]);
  request(repo, 'b', [block('[INV-3]@1 modify   builds on a/INV-3@1', { was: S1, now: S3 })]);
  request(repo, 'c', [block('[INV-3]@1 modify   builds on a/INV-3@2', { was: S2, now: S3 })]);
  const list = await states(repo);
  expectState(list, 'b/INV-3@1', 'base revised');
  expectState(list, 'c/INV-3@1', 'pending');
});

test('C3 [STA-1][STA-3] a stale base never reads consolidated: base revised though the baseline is its "now", possibly retained; at its "was" it retains nothing', async (t) => {
  const repo = makeRepo(t);
  request(repo, 'a', [
    block('[INV-3]@1 modify   Revised 2026-09-26 (D1)', { was: S0, now: S1 }),
    block('[INV-3]@2 modify', { was: S1, now: S4 }),
  ]);
  request(repo, 'b', [block('[INV-3]@1 modify   builds on a/INV-3@1', { was: S1, now: S2 })]);
  baseline(repo, INV1, S2);
  expectState(await states(repo), 'b/INV-3@1', 'base revised', { retainsNothing: false });
  baseline(repo, INV1, S1);
  expectState(await states(repo), 'b/INV-3@1', 'base revised', { retainsNothing: true });
});

// --- Chains [STA-2] rows 3 and 4, design §5.2 ---

// A (S0→S1), B builds on A (S1→S2), C builds on B (S2→S3). The states once
// the baseline is S<k>, worked out by hand from §5.2.
function chainExpected(k, [a, b, c]) {
  const [ka, kb, kc] = [a, b, c].map((n) => `${n}/INV-3@1`);
  return [
    { [ka]: ['pending', null, true], [kb]: ['waiting', ka, true], [kc]: ['waiting', ka, true] },
    { [ka]: ['consolidated', null, false], [kb]: ['pending', null, true], [kc]: ['waiting', kb, true] },
    { [ka]: ['carried', kb, false], [kb]: ['consolidated', null, false], [kc]: ['pending', null, true] },
    { [ka]: ['carried', kc, false], [kb]: ['carried', kc, false], [kc]: ['consolidated', null, false] },
  ][k];
}
const ORDERS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

for (const order of ORDERS) {
  test(`C3 [STA-2] A → B → C consolidated in the order ${order.map((i) => 'ABC'[i]).join('')}: no block ever differs, and A and B end carried by C`, async (t) => {
    // The request tried i-th is named r<i+1>, so the folders are also read in a different order.
    const names = [];
    order.forEach((role, i) => { names[role] = `r${i + 1}`; });
    const [a, b, c] = names;
    const S = [S0, S1, S2, S3];
    const repo = makeRepo(t);
    request(repo, a, [block('[INV-3]@1 modify', { was: S0, now: S1 })]);
    request(repo, b, [block(`[INV-3]@1 modify   builds on ${a}/INV-3@1`, { was: S1, now: S2 })]);
    request(repo, c, [block(`[INV-3]@1 modify   builds on ${b}/INV-3@1`, { was: S2, now: S3 })]);
    let k = 0;
    baseline(repo, INV1, S[k]);
    // Try each request in `order` until nothing moves; a try writes "now" only when the block is pending.
    for (let pass = 0; pass < 3 && k < 3; pass++) {
      for (const role of order) {
        const list = await states(repo);
        for (const [key, [state, by, rn]] of Object.entries(chainExpected(k, names))) {
          expectState(list, key, state, { by, retainsNothing: rn });
        }
        if (entry(list, `${names[role]}/INV-3@1`).state === 'pending') {
          k = role + 1;
          baseline(repo, INV1, S[k]);
        }
      }
    }
    assert.equal(k, 3, 'the chain should reach C\'s "now"');
    const list = await states(repo);
    for (const [key, [state, by]] of Object.entries(chainExpected(3, names))) expectState(list, key, state, { by });
  });
}

test('C3 [STA-5][STA-2] a revision inside a request (A@1 ← B@1 ← B@2, implied): B@2 consolidated, B@1 and A@1 carried by B@2, no false cycle or base revised', async (t) => {
  const repo = makeRepo(t);
  request(repo, 'a', [block('[INV-3]@1 modify', { was: S0, now: S1 })]);
  request(repo, 'b', [
    block('[INV-3]@1 modify   builds on a/INV-3@1   Revised 2026-09-26 (D1)', { was: S1, now: S2 }),
    block('[INV-3]@2 modify', { was: S2, now: S3 }),
  ]);
  baseline(repo, INV1, S1);
  let list = await states(repo);
  expectState(list, 'a/INV-3@1', 'consolidated');
  expectState(list, 'b/INV-3@1', 'pending');
  expectState(list, 'b/INV-3@2', 'waiting', { by: 'b/INV-3@1', retainsNothing: true });

  baseline(repo, INV1, S2);
  list = await states(repo);
  expectState(list, 'a/INV-3@1', 'carried', { by: 'b/INV-3@1' });
  expectState(list, 'b/INV-3@1', 'consolidated');
  expectState(list, 'b/INV-3@2', 'pending');

  baseline(repo, INV1, S3);
  list = await states(repo);
  expectState(list, 'b/INV-3@2', 'consolidated', { retainsNothing: false });
  expectState(list, 'b/INV-3@1', 'carried', { by: 'b/INV-3@2', retainsNothing: false });
  expectState(list, 'a/INV-3@1', 'carried', { by: 'b/INV-3@2', retainsNothing: false });
});

test('C3 [STA-5][STA-2] the same revision with `builds on @1` written out reads the same', async (t) => {
  const repo = makeRepo(t);
  request(repo, 'a', [block('[INV-3]@1 modify', { was: S0, now: S1 })]);
  request(repo, 'b', [
    block('[INV-3]@1 modify   builds on a/INV-3@1   Revised 2026-09-26 (D1)', { was: S1, now: S2 }),
    block('[INV-3]@2 modify   builds on @1', { was: S2, now: S3 }),
  ]);
  baseline(repo, INV1, S3);
  const list = await states(repo);
  expectState(list, 'b/INV-3@2', 'consolidated');
  expectState(list, 'b/INV-3@1', 'carried', { by: 'b/INV-3@2' });
  expectState(list, 'a/INV-3@1', 'carried', { by: 'b/INV-3@2' });
});

test('C3 [STA-1] another request built on B@1 reads base revised once B@2 exists', async (t) => {
  const repo = makeRepo(t);
  request(repo, 'a', [block('[INV-3]@1 modify', { was: S0, now: S1 })]);
  request(repo, 'b', [block('[INV-3]@1 modify   builds on a/INV-3@1', { was: S1, now: S2 })]);
  request(repo, 'c', [block('[INV-3]@1 modify   builds on b/INV-3@1', { was: S2, now: S4 })]);
  baseline(repo, INV1, S2);
  expectState(await states(repo), 'c/INV-3@1', 'pending');

  request(repo, 'b', [
    block('[INV-3]@1 modify   builds on a/INV-3@1   Revised 2026-09-26 (D1)', { was: S1, now: S2 }),
    block('[INV-3]@2 modify', { was: S2, now: S3 }),
  ]);
  expectState(await states(repo), 'c/INV-3@1', 'base revised');
});

test('[STA-5][STA-2] a revised add in one request: @2 modify (was = @1\'s now) waits on @1, then @1 is carried by @2', async (t) => {
  const repo = makeRepo(t);
  request(repo, 'inv', [
    block('[INV-7]@1 add after [INV-1]   Revised 2026-09-26 (D1)', { now: INV7 }),
    block('[INV-7]@2 modify', { was: INV7, now: INV7B }),
  ]);
  baseline(repo, INV1);
  let list = await states(repo);
  expectState(list, 'inv/INV-7@1', 'pending', { retainsNothing: true });
  expectState(list, 'inv/INV-7@2', 'waiting', { by: 'inv/INV-7@1', retainsNothing: true });

  baseline(repo, INV1, INV7);
  list = await states(repo);
  expectState(list, 'inv/INV-7@1', 'consolidated');
  expectState(list, 'inv/INV-7@2', 'pending');

  baseline(repo, INV1, INV7B);
  list = await states(repo);
  expectState(list, 'inv/INV-7@2', 'consolidated');
  expectState(list, 'inv/INV-7@1', 'carried', { by: 'inv/INV-7@2' });
});

test('[STA-2] archived change specs are read for chains but not listed: an archived base, and an archived successor that carries', async (t) => {
  const repo = makeRepo(t);
  request(repo, 'a', [block('[INV-3]@1 modify', { was: S0, now: S1 })], { status: 'concluded', dir: 'requests/archive/a' });
  request(repo, 'b', [block('[INV-3]@1 modify   builds on a/INV-3@1', { was: S1, now: S2 })]);
  baseline(repo, INV1, S1);
  let list = await states(repo);
  assert.deepEqual(keys(list), ['b/INV-3@1']);
  expectState(list, 'b/INV-3@1', 'pending');

  const other = makeRepo(t);
  request(other, 'a', [block('[INV-3]@1 modify', { was: S0, now: S1 })]);
  request(other, 'b', [block('[INV-3]@1 modify   builds on a/INV-3@1', { was: S1, now: S2 })], { status: 'concluded', dir: 'requests/archive/b' });
  baseline(other, INV1, S2);
  list = await states(other);
  assert.deepEqual(keys(list), ['a/INV-3@1']);
  expectState(list, 'a/INV-3@1', 'carried', { by: 'b/INV-3@1' });
});

// --- Retains nothing [STA-3], C2's classification ---

test('C2 [STA-3] a waiting block retains nothing; a partial revert differs and is possibly retained; a stale base is possibly retained', async (t) => {
  const repo = makeRepo(t);
  const WAS = '## [INV-2] Export\nFormat: CSV.\nDates: local.\n';
  const NOW = '## [INV-2] Export\nFormat: PDF.\nDates: ISO 8601.\n';
  const HOTFIX = '## [INV-2] Export\nFormat: CSV.\nDates: ISO 8601.\n';
  // Waiting: b builds on a pending a.
  request(repo, 'a', [block('[INV-3]@1 modify', { was: S0, now: S1 })]);
  request(repo, 'b', [block('[INV-3]@1 modify   builds on a/INV-3@1', { was: S1, now: S2 })]);
  // Partial revert: a hotfix put back only the format.
  request(repo, 'p', [block('[INV-2]@1 modify', { was: WAS, now: NOW })]);
  // Stale base: s was consolidated, then its base r was revised.
  request(repo, 'r', [
    block('[INV-8]@1 add after [INV-1]   Revised 2026-09-26 (D1)', { now: INV8 }),
    block('[INV-8]@2 modify', { was: INV8, now: INV8.replace('offer', 'show') }),
  ]);
  request(repo, 's', [block('[INV-8]@1 modify   builds on r/INV-8@1', { was: INV8, now: INV8.replace('offer', 'link to') })]);
  baseline(repo, INV1, S0, HOTFIX, INV8.replace('offer', 'link to'));
  const list = await states(repo);
  expectState(list, 'b/INV-3@1', 'waiting', { by: 'a/INV-3@1', retainsNothing: true });
  expectState(list, 'p/INV-2@1', 'differs', { retainsNothing: false });
  expectState(list, 's/INV-8@1', 'base revised', { retainsNothing: false });
});

// --- Real data ---

test('[STA-2] real data: a copy of assuredloop-v1 and specs/ — REC-1..5 and SPC-1..4 consolidated, VW-9@2 waiting on VW-9@1, every other block pending', async (t) => {
  // As later parts consolidate more sections, the pending ones here will move on.
  const root = fileURLToPath(new URL('..', import.meta.url));
  const repo = makeRepo(t);
  cpSync(join(root, 'requests/assuredloop-v1'), join(repo.dir, 'requests/assuredloop-v1'), { recursive: true });
  cpSync(join(root, 'specs'), join(repo.dir, 'specs'), { recursive: true });
  const list = await states(repo);
  assert.ok(list.every((e) => e.request === 'assuredloop-v1'), JSON.stringify(keys(list)));
  const consolidated = ['REC-1', 'REC-2', 'REC-3', 'REC-4', 'REC-5', 'SPC-1', 'SPC-2', 'SPC-3', 'SPC-4'];
  for (const id of consolidated) expectState(list, `assuredloop-v1/${id}@1`, 'consolidated');
  expectState(list, 'assuredloop-v1/VW-9@2', 'waiting', { by: 'assuredloop-v1/VW-9@1', retainsNothing: true });
  for (const id of ['REC-6', 'TL-1', 'STA-4', 'VW-9']) expectState(list, `assuredloop-v1/${id}@1`, 'pending', { retainsNothing: true });
  const others = list.filter((e) => e.n === 1 && !consolidated.includes(e.id));
  assert.ok(others.length > 30, `expected the rest of the @1 blocks: ${JSON.stringify(keys(list))}`);
  for (const e of others) assert.equal(e.state, 'pending', `${e.block}: ${JSON.stringify(pick(e))}`);
  assert.deepEqual(entry(list, 'assuredloop-v1/REC-4@1').forR, ['R2', 'R3']);
  assert.equal(entry(list, 'assuredloop-v1/TL-1@1').op, 'add');
  assert.equal(entry(list, 'assuredloop-v1/VW-9@2').op, 'modify');
});
