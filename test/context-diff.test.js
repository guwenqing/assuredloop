// al context --diff <range> [VW-4]: A...B reads merge-base(A, B)..B, A..B
// reads A..B, a single rev X reads X...HEAD; uncommitted changes are not
// read. It shows the requests the branch serves (each commit in the range,
// mapped by [LNK-2]), the innermost baseline sections whose text differs
// between base and head with their holders' states, the nearby sections the
// links reach [LNK-1], and the related history: requests citing an ID of a
// changed or nearby section, the rejected first (Status dropped, or a
// decision citing that ID that says "rejected"). Acceptance C5 (a negative
// spike found again).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo } from './helpers/fixture.js';
import { block } from './helpers/change.js';
import { addRequest, both, hasId, lineWith } from './helpers/request.js';
import { lines } from './helpers/output.js';
import { assertDiffFrame, contextDiff, file, labelled, says } from './helpers/links.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';

const has = (out, ...parts) => assert.ok(lineWith(out, ...parts), `expected a line with ${parts.map(String).join(' and ')}:\n${out}`);
const hasNo = (out, ...parts) => assert.ok(!lineWith(out, ...parts), `expected no line with ${parts.map(String).join(' and ')}:\n${out}`);
function diffOk(repo, range = 'main...HEAD') {
  const r = contextDiff(repo, range);
  assert.equal(r.code, 0, `context --diff ${range}:\n${both(r)}`);
  assertDiffFrame(r.stdout);
  return r.stdout;
}
function serves(out, yes, no) {
  const block = labelled(out, 'Serves');
  assert.ok(block, `expected a line starting with Serves:\n${out}`);
  for (const name of yes) assert.ok(block.includes(name), `Serves should name ${name}:\n${out}`);
  for (const name of no) assert.ok(!block.includes(name), `Serves should not name ${name}:\n${out}`);
}

test('[VW-4] the range: A...B reads from merge-base(A, B), A..B from A, and a single rev X is X...HEAD; the commits read are base..head', (t) => {
  const T1 = "## [INV-1] Totals\nTotals MUST show the currency's decimals.\n";
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  const m0 = repo.commit('Initial spec', { date: '2026-02-01T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'feature']);
  repo.write('specs/invoices.md', file(INV1, S1));
  repo.commit('ISO dates\n\nRequest: feature-dates', { date: '2026-02-02T12:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  repo.write('specs/invoices.md', file(T1, S0));
  const m1 = repo.commit('Currency decimals\n\nRequest: main-totals', { date: '2026-02-03T12:00:00Z' });
  repo.git(['checkout', '-q', 'feature']);
  assert.equal(repo.git(['merge-base', 'main', 'feature']), m0, 'the fixture: feature forks at m0');

  // From the fork: only the branch's own INV-3 change and its request.
  for (const range of ['main...feature', 'main']) {
    const out = diffOk(repo, range);
    serves(out, ['feature-dates'], ['main-totals']);
    has(out, 'INV-3');
    hasNo(out, 'INV-1');
  }
  // From main itself: INV-1 differs between main and feature too, but main's commit is not read.
  const two = diffOk(repo, 'main..feature');
  serves(two, ['feature-dates'], ['main-totals']);
  has(two, 'INV-3');
  has(two, 'INV-1');
  // A range on main, by commit IDs.
  const onMain = diffOk(repo, `${m0}..${m1}`);
  serves(onMain, ['main-totals'], ['feature-dates']);
  has(onMain, 'INV-1');
  hasNo(onMain, 'INV-3');
});

test('[VW-4][LNK-2] the requests served (by a Request line and by a folder), the sections changed with their states; uncommitted changes are not read', (t) => {
  const INV4A = '## [INV-4] Separator\nThe CSV separator is a comma.\n';
  const INV4B = '## [INV-4] Separator\nThe CSV separator MUST be a semicolon.\n';
  const INV7 = '## [INV-7] CSV rows\nOne row per line item.\n';
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0, INV4A));
  addRequest(repo, 'csv-export', [block('[INV-7]@1 add in specs/invoices.md   for R1', { now: INV7 })]);
  addRequest(repo, 'iso-dates', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  repo.commit('Records', { date: '2026-02-01T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('specs/invoices.md', file(INV1, S0, INV4A, INV7));
  repo.write('src/export.js', "export const header = ['number', 'total'];\n");
  repo.commit('CSV rows\n\nRequest: csv-export', { date: '2026-02-02T12:00:00Z' });
  repo.write('specs/invoices.md', file(INV1, S1, INV4A, INV7));
  const iso = repo.read('requests/iso-dates/request.md').toString();
  repo.write('requests/iso-dates/request.md', `${iso}\n## Parts\n\n1. Dates\n`);
  repo.commit('ISO dates', { date: '2026-02-03T12:00:00Z' });
  // Uncommitted: INV-4 edited, and a line naming [INV-1] in the code.
  repo.write('specs/invoices.md', file(INV1, S1, INV4B, INV7));
  repo.write('src/export.js', "// [INV-1]\nexport const header = ['number', 'total'];\n");

  const out = diffOk(repo);
  serves(out, ['csv-export', 'iso-dates'], []);
  assert.ok(says(out, 'INV-7', 'consolidated'), `INV-7 changed, consolidated:\n${out}`);
  assert.ok(says(out, 'INV-3', 'consolidated'), `INV-3 changed, consolidated:\n${out}`);
  hasNo(out, 'INV-4');
  hasNo(out, 'INV-1');
});

test('[VW-4][LNK-1] nearby sections are the ones the links reach, listed as sections: by an [ID] (1), by co-change (3), by a shared word (4), with the blame lines (2); not the spec file\'s neighbours; related history through a nearby section', (t) => {
  const INV7A = '## [INV-7] CSV rows\nOne row per invoice.\n';
  const INV7B = '## [INV-7] CSV rows\nOne row per line item.\n';
  const INV8 = '## [INV-8] Invoice page\nThe invoice page MUST offer the export.\n';
  const INV9 = '## [INV-9] Rounding\nTotals MUST round half away from zero.\n';
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S1, INV7A, INV8, INV9));
  repo.commit('Initial spec', { date: '2026-02-01T12:00:00Z' });
  // INV-7's changed line is its last, next to INV-8's heading.
  repo.write('specs/invoices.md', file(INV1, S1, INV7B, INV8, INV9));
  repo.write('src/export.js', "export const header = ['number', 'total'];\nexport const rows = [];\n");
  repo.commit('CSV rows\n\nRequest: csv-export', { date: '2026-02-02T12:00:00Z' });
  repo.write('src/dates.js', '// [INV-3] Dates\nexport function formatDate(d) {\n  return d.toISOString().slice(0, 10);\n}\n');
  repo.commit('Dates\n\nRequest: iso-dates', { date: '2026-02-03T12:00:00Z' });
  repo.write('src/rounding.js', 'export const mode = "half-up";\nexport const digits = 2;\n');
  repo.commit('Rounding helper', { date: '2026-02-04T12:00:00Z' });
  // old-rounding cites INV-9, which only a shared word reaches; invoice-page cites the neighbour INV-8.
  addRequest(repo, 'old-rounding', [block('[INV-9]@1 modify   for R1', { was: INV9.replace('away from zero', 'up'), now: INV9 })],
    { dir: 'requests/archive/old-rounding', status: 'concluded' });
  addRequest(repo, 'invoice-page', [block('[INV-8]@1 modify   for R1', { was: INV8.replace('MUST', 'may'), now: INV8 })],
    { dir: 'requests/archive/invoice-page', status: 'concluded' });
  repo.commit('Records', { date: '2026-02-05T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('src/export.js', "export const header = ['number', 'total'];\nexport const rows = [header];\n");
  repo.write('src/dates.js', '// [INV-3] Dates\nexport function formatDate(d) {\n  return d.toISOString().slice(0, 19);\n}\n');
  repo.write('src/rounding.js', 'export const mode = "half-away";\nexport const digits = 2;\n');
  repo.commit('Work', { date: '2026-06-01T12:00:00Z' });

  const out = diffOk(repo);
  has(out, 'src/dates.js', 'names [INV-3]', /\b2 lines above\b/);
  has(out, 'src/export.js', 'last changed by csv-export');
  has(out, 'src/dates.js', 'last changed by iso-dates');
  has(out, 'src/rounding.js', 'no request');
  has(out, 'src/export.js', 'INV-7', 'changed together');
  has(out, 'src/rounding.js', 'INV-9', 'shares the word "rounding"');
  // Each nearby section is listed as a section too: on a line of its own, holding no path and outside Related.
  const related = new Set(lines(labelled(out, 'Related')));
  for (const id of ['INV-3', 'INV-7', 'INV-9']) {
    assert.ok(lines(out).some((l) => hasId(l, id) && !/\bsrc\//.test(l) && !related.has(l)), `${id} listed as a nearby section:\n${out}`);
  }
  assert.ok(labelled(out, 'Related').includes('old-rounding'), `old-rounding cites the nearby INV-9:\n${out}`);
  assert.ok(!out.includes('invoice-page'), `invoice-page cites only the neighbour INV-8:\n${out}`);
  hasNo(out, 'INV-8');
  hasNo(out, 'INV-1');
});

test('C5 [VW-4] related history, the rejected first: an archived spike whose decision rejects live FX because it breaks [INV-4], and a dropped request, come before the others citing INV-4', (t) => {
  const INV4 = (s) => `## [INV-4] Currency\nTotals show in ${s}.\n`;
  const INV40 = '## [INV-40] Refund totals\nRefunds show their own totals.\n';
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, INV4("the invoice's currency"), INV40));
  repo.commit('Initial spec', { date: '2026-01-10T12:00:00Z' });

  // Rejected: the spike (by its decision) and fx-display (Status: dropped).
  const QUESTION = '## Organized question\n\nCan totals be converted live from a free FX API?\n';
  addRequest(repo, 'spike-live-fx', null, {
    dir: 'requests/archive/spike-live-fx', title: 'Spike: convert totals live', line: 'Type: spike · Tier: S · Status: concluded',
    org: QUESTION, signedText: QUESTION,
    decisions: '\n## Decisions\n\n- D1, 2026-04-20. Source: the owner. Rejected: live FX conversion; it breaks [INV-4].\n',
  });
  repo.write('requests/archive/spike-live-fx/findings.md', 'Answer: no. Do not convert totals live.\n');
  addRequest(repo, 'fx-display', [block('[INV-4]@1 modify   for R1', { was: INV4("the invoice's currency"), now: INV4('euros and the FX rate') })],
    { dir: 'requests/archive/fx-display', status: 'dropped' });
  // Not rejected: currency-totals (concluded), and pdf-export, whose rejection cites [INV-40], not [INV-4].
  addRequest(repo, 'currency-totals', [block('[INV-4]@1 modify   for R1', { was: INV4('euros'), now: INV4("the invoice's currency") })],
    { dir: 'requests/archive/currency-totals', status: 'concluded' });
  addRequest(repo, 'pdf-export', [block('[INV-4]@1 modify   for R2', { was: INV4("the invoice's currency"), now: INV4("the invoice's currency, in a PDF too") })],
    { decisions: '\n## Decisions\n\n- D1, 2026-04-25. Source: the owner. Rejected: PDF export for now; see [INV-40].\n' });
  // Cites only [INV-40].
  addRequest(repo, 'refunds', [block('[INV-40]@1 modify   for R1', { was: INV40.replace('their own', 'no'), now: INV40 })],
    { dir: 'requests/archive/refunds', status: 'concluded' });
  repo.commit('Records', { date: '2026-05-01T12:00:00Z' });

  repo.git(['checkout', '-q', '-b', 'fx-totals']);
  addRequest(repo, 'fx-totals', [block('[INV-4]@1 modify   for R1', { was: INV4("the invoice's currency"), now: INV4("the customer's currency, converted live") })]);
  repo.write('specs/invoices.md', file(INV1, INV4("the customer's currency, converted live"), INV40));
  repo.commit('Live totals\n\nRequest: fx-totals', { date: '2026-09-01T12:00:00Z' });

  const out = diffOk(repo);
  const related = labelled(out, 'Related');
  assert.ok(related, `expected a line starting with Related:\n${out}`);
  const at = (name) => {
    const i = related.indexOf(name);
    assert.ok(i >= 0, `Related should name ${name}:\n${out}`);
    return i;
  };
  const rejected = Math.max(at('spike-live-fx'), at('fx-display'));
  const others = Math.min(at('currency-totals'), at('pdf-export'));
  assert.ok(rejected < others, `the rejected (spike-live-fx, fx-display) come first:\n${related}`);
  assert.ok(!out.includes('refunds'), `refunds cites [INV-40], not [INV-4]:\n${out}`);
});
