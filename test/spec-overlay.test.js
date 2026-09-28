// al spec [--list] [--at <commit>] with the open changes over the baseline
// [VW-5]: under each baseline section an open change holds, after its text
// and before the next heading, a line naming the block (<request>/<ID>@<n>)
// and its state [STA-2], then its "now" indented when it differs from the
// section's text; an add not yet in the baseline under the section it is
// added after; in --list, the block and state after the section's map entry.
// Archived requests are not open changes. --at reads it all as at that
// commit [VW-8].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { addRequest, both, hasId } from './helpers/request.js';
import { file } from './helpers/links.js';
import { short } from './helpers/evidence.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const S2 = '## [INV-3] Dates\nDates MUST show in ISO 8601, with the time zone.\n';
const INV4A = '## [INV-4] Separator\nThe CSV separator is a comma.\n';
const INV4B = '## [INV-4] Separator\nThe CSV separator MUST be a semicolon.\n';
const INV5 = '## [INV-5] Cancelling\nAn invoice can be cancelled.\n';
const INV7 = '## [INV-7] CSV rows\nOne row per line item.\n';
const HEADINGS = { 'INV-1': '## [INV-1] Totals', 'INV-3': '## [INV-3] Dates', 'INV-4': '## [INV-4] Separator', 'INV-5': '## [INV-5] Cancelling' };

const ok = (r) => assert.equal(r.code, 0, both(r));
const nonBlank = (text) => text.split('\n').filter((l) => l.trim());
// A line naming a block: <request>/<ID>@<n>.
const BLOCK_KEY = /[\w-]+\/[A-Z][A-Z0-9]*-\d+(?:\.\d+)*@\d+/;

// The lines of the full text view from section `id`'s heading (the last
// unindented one: the map comes first) up to the next heading `next`.
function under(out, id, next) {
  const ls = lines(out);
  const heading = (h) => ls.findLastIndex((l) => l === h);
  const from = heading(HEADINGS[id]);
  assert.ok(from >= 0, `the text should hold the heading ${HEADINGS[id]}:\n${out}`);
  const to = next ? heading(HEADINGS[next]) : ls.findIndex((l, i) => i > from && /^(Read|Next|Not known)\b/.test(l));
  assert.ok(to > from, `${next ?? 'the frame'} should follow ${id} in the text:\n${out}`);
  return ls.slice(from + 1, to);
}
// The line naming `key` with `state`, and the lines after it.
function blockLine(ls, key, state, out) {
  const i = ls.findIndex((l) => l.includes(key) && l.includes(state));
  assert.ok(i >= 0, `expected a line naming ${key} and ${state} here:\n${ls.join('\n')}\n--- whole output ---\n${out}`);
  return i;
}
// Every line of `now` follows, each indented by two spaces or more.
function nowFollows(ls, from, now, out) {
  let i = from;
  for (const want of nonBlank(now)) {
    const j = ls.findIndex((l, k) => k > i && /^\s{2,}\S/.test(l) && l.trim() === want);
    assert.ok(j > i, `"${want}" should follow, indented by two spaces or more:\n${ls.join('\n')}\n--- whole output ---\n${out}`);
    i = j;
  }
}

// iso-dates and tz-dates both hold INV-3 (pending, each "now" differs from
// the section); sep holds INV-4 (consolidated); csv adds INV-7 after INV-3;
// old-credit, archived, holds INV-5; nothing holds INV-1.
function overlay(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0, INV4B, INV5));
  addRequest(repo, 'iso-dates', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  const x = repo.commit('iso-dates', { date: '2026-09-21T12:00:00Z' });
  addRequest(repo, 'tz-dates', [block('[INV-3]@1 modify   for R2', { was: S0, now: S2 })]);
  addRequest(repo, 'sep', [block('[INV-4]@1 modify   for R1', { was: INV4A, now: INV4B })]);
  addRequest(repo, 'csv', [block('[INV-7]@1 add after [INV-3]   for R1', { now: INV7 })]);
  addRequest(repo, 'old-credit', [block('[INV-5]@1 modify   for R1', { was: INV5.replace('can be', 'is'), now: INV5 })],
    { dir: 'requests/archive/old-credit', status: 'concluded' });
  repo.commit('More requests', { date: '2026-09-22T12:00:00Z' });
  return { repo, x };
}

test('[VW-5] spec: under a held section, after its text and before the next heading, each holder\'s block and state, then its "now" indented', (t) => {
  const { repo } = overlay(t);
  const r = runAl(repo.dir, ['spec']);
  ok(r);
  const inv3 = under(r.stdout, 'INV-3', 'INV-4');
  nowFollows(inv3, blockLine(inv3, 'iso-dates/INV-3@1', 'pending', r.stdout), S1, r.stdout);
  nowFollows(inv3, blockLine(inv3, 'tz-dates/INV-3@1', 'pending', r.stdout), S2, r.stdout);
  // The section's own text comes first.
  assert.equal(inv3.find((l) => l.trim()), "Dates show in the customer's local format.", `the section's text first:\n${r.stdout}`);
  const inv4 = under(r.stdout, 'INV-4', 'INV-5');
  blockLine(inv4, 'sep/INV-4@1', 'consolidated', r.stdout);
  assertFrame(r.stdout);
});

test('[VW-5] spec: an add not yet in the baseline shows after the section it is added after, with its block, state and "now"', (t) => {
  const { repo } = overlay(t);
  const r = runAl(repo.dir, ['spec']);
  ok(r);
  const inv3 = under(r.stdout, 'INV-3', 'INV-4');
  nowFollows(inv3, blockLine(inv3, 'csv/INV-7@1', 'pending', r.stdout), INV7, r.stdout);
});

test('[VW-5] spec: a section no open change holds shows no block line; an archived request\'s block is not shown', (t) => {
  const { repo } = overlay(t);
  const r = runAl(repo.dir, ['spec']);
  ok(r);
  const inv1 = under(r.stdout, 'INV-1', 'INV-3');
  assert.ok(!inv1.some((l) => BLOCK_KEY.test(l)), `nothing holds INV-1:\n${r.stdout}`);
  const inv5 = under(r.stdout, 'INV-5');
  assert.ok(!inv5.some((l) => BLOCK_KEY.test(l)), `old-credit is archived; nothing open holds INV-5:\n${r.stdout}`);
  assert.ok(!r.stdout.includes('old-credit'), `an archived request is not an open change:\n${r.stdout}`);
});

test('[VW-5] spec --list: each held section\'s map entry is followed by a line naming the block and its state', (t) => {
  const { repo } = overlay(t);
  const r = runAl(repo.dir, ['spec', '--list']);
  ok(r);
  const ls = lines(r.stdout);
  const entry = (id, title) => {
    const i = ls.findIndex((l) => hasId(l, id) && l.includes(title) && !l.includes('@'));
    assert.ok(i >= 0, `expected the map entry of ${id} ${title}:\n${r.stdout}`);
    return i;
  };
  const [inv1, inv3, inv4, inv5] = [entry('INV-1', 'Totals'), entry('INV-3', 'Dates'), entry('INV-4', 'Separator'), entry('INV-5', 'Cancelling')];
  const between = (from, to, key, state) => {
    const i = ls.findIndex((l, k) => k > from && k < to && l.includes(key) && l.includes(state));
    assert.ok(i >= 0, `a line naming ${key} and ${state} should follow the map entry, before the next:\n${r.stdout}`);
  };
  between(inv3, inv4, 'iso-dates/INV-3@1', 'pending');
  between(inv3, inv4, 'tz-dates/INV-3@1', 'pending');
  between(inv4, inv5, 'sep/INV-4@1', 'consolidated');
  assert.ok(!ls.slice(inv1 + 1, inv3).some((l) => BLOCK_KEY.test(l)), `nothing holds INV-1:\n${r.stdout}`);
  assert.ok(!r.stdout.includes('old-credit'), `an archived request is not an open change:\n${r.stdout}`);
  assertFrame(r.stdout);
});

test('[VW-5][VW-8] spec --at <commit> shows the open changes as at that commit: iso-dates holds INV-3; tz-dates and csv came later; the Read line names it', (t) => {
  const { repo, x } = overlay(t);
  const r = runAl(repo.dir, ['spec', '--at', x]);
  ok(r);
  const inv3 = under(r.stdout, 'INV-3', 'INV-4');
  nowFollows(inv3, blockLine(inv3, 'iso-dates/INV-3@1', 'pending', r.stdout), S1, r.stdout);
  for (const later of ['tz-dates', 'csv/', 'sep/']) assert.ok(!r.stdout.includes(later), `${later} came after ${short(x)}:\n${r.stdout}`);
  assertFrame(r.stdout, { read: short(x) });
});
