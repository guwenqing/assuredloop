// al context <ID> [VW-3]: the section's text, the open changes holding it
// with their states, the requests that shaped it (blame of the baseline with
// -w -M and no -C, each commit mapped by [LNK-2] with its date and how), the
// decisions citing it (open and archived), and the linked code with a reason
// each [LNK-1]: 1 a line naming [ID], 3 files changed in the same commits
// (skipping and counting commits over 30 files), 4 shared words. IDs match as
// whole tokens [SPC-2]. A shallow clone says "history unavailable" [VW-9].
// Acceptance C1, C5, and G3 finding 6.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRepo, cloneRepo } from './helpers/fixture.js';
import { assertFrame } from './helpers/output.js';
import { block } from './helpers/change.js';
import { addRequest, both, lineWith } from './helpers/request.js';
import { assertBlamed, contextOf, file, squashMerge } from './helpers/links.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const INV3_0 = "## [INV-3] Dates\nDates show in the customer's local format.\nThe time zone is the server's.\n";
const INV3_1 = "## [INV-3] Dates\nDates MUST show in ISO 8601.\nThe time zone is the server's.\n";
const INV3_2 = "## [INV-3] Dates\nDates MUST show in ISO 8601.\nThe time zone MUST be the customer's.\n";
// Cites [INV-3] inside the baseline, which is not code.
const INV4 = '## [INV-4] Separator\nThe CSV separator is a comma; dates in it follow [INV-3].\n';

const ok = (r) => assert.equal(r.code, 0, both(r));
const has = (out, ...parts) => assert.ok(lineWith(out, ...parts), `expected a line with ${parts.map(String).join(' and ')}:\n${out}`);
const hasNo = (out, ...parts) => assert.ok(!lineWith(out, ...parts), `expected no line with ${parts.map(String).join(' and ')}:\n${out}`);

// src/dates.js names [INV-3] on line 1, src/format.js on line 7.
const DATES_0 = '// [INV-3] Dates\nexport function formatDate(d) {\n  return d.toLocaleDateString();\n}\n';
const DATES_1 = DATES_0.replace('d.toLocaleDateString()', 'd.toISOString().slice(0, 10)');
const FORMAT = "import { formatDate } from './dates.js';\n\nexport function formatInvoice(invoice) {\n  return {\n" +
  '    number: invoice.number,\n    total: invoice.total.toFixed(2),\n    issuedOn: formatDate(invoice.issuedOn), // [INV-3]\n  };\n}\n';

// main's history of INV-3 (specs/invoices.md lines 4-6):
//   C1 2026-01-10 "Initial invoicer", no request: the heading, with src/dates.js and src/format.js;
//   "Helpers": src/other.js (a bare INV-3), src/updates.js, lib/parseDates.js, no spec;
//   C2 2026-02-10 "Request: iso-dates" on a branch, merged with a merge commit on 2026-02-11: line 5;
//   S1 2026-03-12, git's default squash message of "Request: tz-dates" (branch commit 2026-03-10): line 6, with src/timezone.js;
//   "Records": iso-dates archived (D1 cites [INV-3]); tz-dates open, holding INV-3 (consolidated);
//   csv-export open (D2 cites [INV-3] on its second line); other-req open (D1 cites [INV-30]).
// The working tree also holds an untracked src/scratch.js naming [INV-3].
function billing(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, INV3_0, INV4));
  repo.write('src/dates.js', DATES_0);
  repo.write('src/format.js', FORMAT);
  const c1 = repo.commit('Initial invoicer', { date: '2026-01-10T12:00:00Z' });
  repo.write('src/other.js', '// See INV-3 for the date rules.\nexport const other = 1;\n');
  repo.write('src/updates.js', 'export const updates = [];\n');
  repo.write('lib/parseDates.js', "export const parseDates = (s) => s.split(',');\n");
  repo.commit('Helpers', { date: '2026-01-15T12:00:00Z' });

  repo.git(['checkout', '-q', '-b', 'iso-dates']);
  repo.write('specs/invoices.md', file(INV1, INV3_1, INV4));
  repo.write('src/dates.js', DATES_1);
  const c2 = repo.commit('ISO dates\n\nRequest: iso-dates', { date: '2026-02-10T12:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  repo.git(['merge', '-q', '--no-ff', '-m', "Merge branch 'iso-dates'", 'iso-dates'], { date: '2026-02-11T12:00:00Z' });

  repo.git(['checkout', '-q', '-b', 'tz-dates']);
  repo.write('specs/invoices.md', file(INV1, INV3_2, INV4));
  repo.write('src/timezone.js', 'export const zoneOf = (customer) => customer.timeZone;\n');
  repo.commit('Time zone in dates\n\nRequest: tz-dates', { date: '2026-03-10T12:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  const s1 = squashMerge(repo, 'tz-dates', '2026-03-12T12:00:00Z');
  repo.git(['branch', '-q', '-D', 'tz-dates']);

  addRequest(repo, 'iso-dates', [block('[INV-3]@1 modify   for R2', { was: INV3_0, now: INV3_1 })], {
    dir: 'requests/archive/iso-dates', status: 'concluded',
    decisions: '\n## Decisions\n\n- D1, 2026-02-01. Source: the owner. Dates in ISO 8601 everywhere, as [INV-3] says.\n',
  });
  addRequest(repo, 'tz-dates', [block('[INV-3]@1 modify   for R2', { was: INV3_1, now: INV3_2 })], {
    decisions: "\n## Decisions\n\n- D1, 2026-03-01. Source: the owner. The customer's zone.\n",
  });
  addRequest(repo, 'csv-export', null, {
    decisions: '\n## Decisions\n\n- D1, 2026-03-02. Source: the owner. CSV only for now.\n' +
      '- D2, 2026-03-05. Source: ruling by the agent (developer). The CSV keeps\n  the dates of [INV-3], unquoted.\n',
  });
  addRequest(repo, 'other-req', null, { decisions: '\n## Decisions\n\n- D1, 2026-03-06. Source: the owner. Refunds follow [INV-30].\n' });
  repo.commit('Records', { date: '2026-03-20T12:00:00Z' });
  repo.write('src/scratch.js', '// [INV-3] scratch\n');

  // The fixture holds the history it claims: lines 5 and 6 of the baseline blame to C2 and S1.
  assertBlamed(repo, 'HEAD', 'specs/invoices.md', [4, 4], ['-w', '-M'], c1);
  assertBlamed(repo, 'HEAD', 'specs/invoices.md', [5, 5], ['-w', '-M'], c2);
  assertBlamed(repo, 'HEAD', 'specs/invoices.md', [6, 6], ['-w', '-M'], s1);
  const squashMsg = repo.git(['log', '-1', '--format=%B', s1]);
  assert.ok(squashMsg.includes('\n    Request: tz-dates'), `the fixture: git's squash message indents the Request line:\n${squashMsg}`);
  return repo;
}

test('[VW-3] context <ID> shows the section\'s text and the open change holding it, with its state; exits 0 in the frame', (t) => {
  const repo = billing(t);
  const r = contextOf(repo, 'INV-3');
  ok(r);
  assert.ok(r.stdout.includes('Dates MUST show in ISO 8601.'), `the section's text:\n${r.stdout}`);
  assert.ok(r.stdout.includes("The time zone MUST be the customer's."), `the section's text:\n${r.stdout}`);
  has(r.stdout, 'tz-dates', 'consolidated');
  hasNo(r.stdout, 'iso-dates', 'differs'); // archived: it shaped INV-3, it does not hold it
  assertFrame(r.stdout);
});

test('[VW-3] context accepts the ID bracketed or not: [INV-3] gives what INV-3 gives', (t) => {
  const repo = billing(t);
  const bare = contextOf(repo, 'INV-3');
  const bracketed = contextOf(repo, '[INV-3]');
  ok(bare);
  ok(bracketed);
  // The Next line may echo the argument as given.
  const body = (out) => out.split('\n').filter((l) => !l.startsWith('Next')).join('\n');
  assert.equal(body(bracketed.stdout), body(bare.stdout));
});

test('C1 [VW-3][LNK-2] shaped by: blame of the section maps through a merge commit and through git\'s default squash message, by "Request: line", with each commit\'s date', (t) => {
  const repo = billing(t);
  const r = contextOf(repo, 'INV-3');
  ok(r);
  has(r.stdout, 'iso-dates', 'Request: line', '2026-02-10');
  has(r.stdout, 'tz-dates', 'Request: line', '2026-03-12');
  assert.ok(!r.stdout.includes('2026-03-10'), `the squashed branch commit is not on main; the squash is:\n${r.stdout}`);
});

test('[VW-3][REC-7] the decisions citing [INV-3], open and archived (one over two lines), and none citing [INV-30] only', (t) => {
  const repo = billing(t);
  const r = contextOf(repo, 'INV-3');
  ok(r);
  has(r.stdout, 'iso-dates', /\bD1\b/);
  has(r.stdout, 'csv-export', /\bD2\b/);
  assert.ok(!r.stdout.includes('other-req'), `other-req cites [INV-30], not [INV-3]:\n${r.stdout}`);
});

test('[VW-3][LNK-1] link 1: every tracked line outside requests/ and the baseline naming [INV-3], as path:line; not a bare INV-3, a record, the baseline or an untracked file', (t) => {
  const repo = billing(t);
  const r = contextOf(repo, 'INV-3');
  ok(r);
  has(r.stdout, /src\/dates\.js:1(?!\d)/, 'names [INV-3]');
  has(r.stdout, /src\/format\.js:7(?!\d)/, 'names [INV-3]');
  assert.ok(!r.stdout.includes('src/other.js'), `a bare INV-3 is not an ID link:\n${r.stdout}`);
  hasNo(r.stdout, /requests\/\S*:\d/, 'names');
  hasNo(r.stdout, /specs\/\S*:\d/, 'names');
  assert.ok(!r.stdout.includes('src/scratch.js'), `an untracked file is not linked:\n${r.stdout}`);
});

test('[VW-3][LNK-1] link 3: files changed in the commits blame gives for the section, "changed together"', (t) => {
  const repo = billing(t);
  const r = contextOf(repo, 'INV-3');
  ok(r);
  has(r.stdout, 'src/timezone.js', 'changed together');
});

test('[VW-3][LNK-1] link 4: a path sharing a heading word, split on camelCase ("dates" in lib/parseDates.js); "updates" is not "dates"', (t) => {
  const repo = billing(t);
  const r = contextOf(repo, 'INV-3');
  ok(r);
  has(r.stdout, 'lib/parseDates.js', 'shares the word "dates"');
  assert.ok(!r.stdout.includes('src/updates.js'), `"updates" does not share the word "dates":\n${r.stdout}`);
});

test('C1 [VW-9][VW-3] in a shallow clone, shaped-by and co-change say "history unavailable", never a false "no request"; the ID and word links still show', (t) => {
  const repo = billing(t);
  const clone = cloneRepo(t, repo, { depth: 1 });
  assert.equal(clone.git(['rev-parse', '--is-shallow-repository']), 'true');
  assert.equal(clone.git(['rev-list', '--count', 'HEAD']), '1', 'the fixture clone holds one commit');

  const full = contextOf(repo, 'INV-3');
  ok(full);
  assert.ok(!full.stdout.includes('history unavailable'), `a full repo has the history:\n${full.stdout}`);

  const r = contextOf(clone, 'INV-3');
  ok(r);
  assert.ok(r.stdout.includes('history unavailable'), r.stdout);
  // Blame here puts every line on the one commit, "Records", which touched four request folders.
  assert.ok(!r.stdout.includes('no request'), `blame in a shallow clone gives no request to report:\n${r.stdout}`);
  assert.ok(!r.stdout.includes('ambiguous'), `blame in a shallow clone gives no request to report:\n${r.stdout}`);
  assert.doesNotMatch(r.stdout, /nothing found/i);
  has(r.stdout, /src\/dates\.js:1(?!\d)/, 'names [INV-3]');
  has(r.stdout, 'lib/parseDates.js', 'shares the word "dates"');
  assertFrame(r.stdout, { main: 'origin/main' });
});

test('[VW-3][LNK-1] link 4 takes words of four letters or more: "rows" links src/rows.js; "csv" does not link src/csv.js', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, '## [INV-7] CSV rows\nOne row per line item.\n'));
  repo.commit('Initial spec', { date: '2026-01-10T12:00:00Z' });
  repo.write('src/rows.js', 'export const rows = [];\n');
  repo.write('src/csv.js', "export const separator = ',';\n");
  repo.commit('Code', { date: '2026-01-11T12:00:00Z' });
  const r = contextOf(repo, 'INV-7');
  ok(r);
  has(r.stdout, 'src/rows.js', 'shares the word "rows"');
  assert.ok(!r.stdout.includes('src/csv.js'), `"csv" has three letters:\n${r.stdout}`);
});

test('[VW-3][LNK-1] the baseline\'s blame honours -w and .git-blame-ignore-revs: a spacing reflow and a listed wording sweep leave the section shaped by iso-dates alone', (t) => {
  const repo = makeRepo(t);
  const INV3 = (a, b) => `## [INV-3] Dates\nDates MUST show in ${a}.\nThe time zone is ${b}.\n`;
  repo.write('specs/invoices.md', INV1);
  repo.commit('Initial spec', { date: '2026-01-10T12:00:00Z' });
  repo.write('specs/invoices.md', file(INV1, INV3('ISO 8601', "the customer's")));
  const wrote = repo.commit('ISO dates\n\nRequest: iso-dates', { date: '2026-02-10T12:00:00Z' });
  repo.write('specs/invoices.md', file(INV1, INV3('ISO  8601', "the customer's")));
  const reflow = repo.commit('Reflow the spec', { date: '2026-03-01T12:00:00Z' });
  repo.write('specs/invoices.md', file(INV1, INV3('ISO  8601', 'the customer’s')));
  const sweep = repo.commit('Typographic apostrophes', { date: '2026-03-02T12:00:00Z' });
  repo.write('.git-blame-ignore-revs', `# The apostrophe sweep\n${sweep}\n`);
  repo.commit('Ignore the apostrophe sweep in blame', { date: '2026-03-03T12:00:00Z' });
  assertBlamed(repo, 'HEAD', 'specs/invoices.md', [5, 5], ['-M'], reflow);
  assertBlamed(repo, 'HEAD', 'specs/invoices.md', [6, 6], ['-w', '-M'], sweep);
  assertBlamed(repo, 'HEAD', 'specs/invoices.md', [4, 6], ['-w', '-M', '--ignore-revs-file', '.git-blame-ignore-revs'], wrote);

  const r = contextOf(repo, 'INV-3');
  ok(r);
  has(r.stdout, 'iso-dates', 'Request: line', '2026-02-10');
  assert.ok(!r.stdout.includes('no request'), `the sweeps are skipped:\n${r.stdout}`);
  assert.ok(!r.stdout.includes('2026-03-01') && !r.stdout.includes('2026-03-02'), `the sweeps are skipped:\n${r.stdout}`);
});

test('[VW-3][LNK-1] link 3 skips and counts a commit over 30 files; a narrow commit still links', (t) => {
  const repo = makeRepo(t);
  const INV9 = (a, b) => `## [INV-9] Rounding\nTotals MUST round ${a}.\nTaxes MUST round ${b}.\n`;
  repo.write('specs/invoices.md', file(INV1, INV9('half up', 'half up')));
  repo.commit('Initial spec', { date: '2026-01-10T12:00:00Z' });
  // W: 200 files, one of them INV-9's first rule.
  for (let i = 1; i <= 198; i++) repo.write(`gen/f${String(i).padStart(3, '0')}.txt`, `generated ${i}\n`);
  repo.write('src/export.js', 'export const rows = [];\n');
  repo.write('specs/invoices.md', file(INV1, INV9('half away from zero', 'half up')));
  const wide = repo.commit('Regenerate everything', { date: '2026-02-01T12:00:00Z' });
  // N: INV-9's second rule and src/narrow.js.
  repo.write('specs/invoices.md', file(INV1, INV9('half away from zero', 'half even')));
  repo.write('src/narrow.js', 'export const narrow = true;\n');
  const narrow = repo.commit('Tax rounding\n\nRequest: tax-rounding', { date: '2026-02-02T12:00:00Z' });

  assert.equal(repo.git(['show', '--name-only', '--format=', wide]).split('\n').length, 200, 'the fixture: W touches 200 files');
  assertBlamed(repo, 'HEAD', 'specs/invoices.md', [5, 5], ['-w', '-M'], wide);
  assertBlamed(repo, 'HEAD', 'specs/invoices.md', [6, 6], ['-w', '-M'], narrow);

  const r = contextOf(repo, 'INV-9');
  ok(r);
  has(r.stdout, 'src/narrow.js', 'changed together');
  has(r.stdout, 'over 30 files', /\b1\b/);
  assert.ok(!r.stdout.includes('gen/'), `the wide commit's files are skipped:\n${r.stdout}`);
  assert.ok(!r.stdout.includes('src/export.js'), `the wide commit's files are skipped:\n${r.stdout}`);
  assertFrame(r.stdout);
});

test('C5 [VW-3][SPC-2] scoped IDs: [INV-3], [INV-3.1] and [INV-30] never cross-link, in code or in decisions', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file('## [INV-3] Dates\nDates MUST show in ISO 8601.\n',
    '### [INV-3.1] Weekdays\nWeekdays MUST show in full.\n', '## [INV-30] Refunds\nRefunds MUST name the invoice.\n'));
  repo.commit('Spec', { date: '2026-01-10T12:00:00Z' });
  repo.write('src/c.js', '// [INV-3]\nexport const isoDate = (d) => d.toISOString();\n');
  repo.write('src/a.js', '// [INV-3.1]\nexport const dayOfWeek = (d) => d.getUTCDay();\n');
  repo.write('src/b.js', '// [INV-30]\nexport const refundOf = (invoice) => invoice.number;\n');
  repo.commit('Code', { date: '2026-01-11T12:00:00Z' });
  const cite = (id) => ({ decisions: `\n## Decisions\n\n- D1, 2026-01-12. Source: the owner. As [${id}] says.\n` });
  addRequest(repo, 'dates-main', null, cite('INV-3'));
  addRequest(repo, 'weekday-names', null, cite('INV-3.1'));
  addRequest(repo, 'refund-rules', null, cite('INV-30'));
  repo.commit('Records', { date: '2026-01-12T12:00:00Z' });

  const cases = [['INV-3', 'src/c.js', 'dates-main'], ['INV-3.1', 'src/a.js', 'weekday-names'], ['INV-30', 'src/b.js', 'refund-rules']];
  for (const [id, path, request] of cases) {
    const r = contextOf(repo, id);
    ok(r);
    has(r.stdout, `${path}:1`, `names [${id}]`);
    has(r.stdout, request, /\bD1\b/);
    for (const [, otherPath, otherRequest] of cases.filter((c) => c[0] !== id)) {
      assert.ok(!r.stdout.includes(otherPath), `context ${id} should not link ${otherPath}:\n${r.stdout}`);
      assert.ok(!r.stdout.includes(otherRequest), `context ${id} should not name ${otherRequest}:\n${r.stdout}`);
    }
  }
});

test('C5 [VW-3][LNK-1] G3 finding 6: the baseline is blamed without -C, so a section consolidated in a commit that also edited change.md is dated to that commit, mapped by "folder"', (t) => {
  const repo = makeRepo(t);
  const INV7 = '## [INV-7] CSV rows\nA customer MUST be able to export one invoice as CSV, one row per line item.\n';
  repo.write('specs/invoices.md', file(INV1, INV3_1));
  repo.commit('Initial invoicer', { date: '2026-03-01T12:00:00Z' });
  addRequest(repo, 'csv-export', [block('[INV-7]@1 add after [INV-3]   for R1', { now: INV7 })]);
  const spec = repo.commit('csv-export: request and change spec', { date: '2026-04-01T12:00:00Z' });
  repo.write('specs/invoices.md', file(INV1, INV3_1, INV7));
  const change = repo.read('requests/csv-export/change.md').toString();
  repo.write('requests/csv-export/change.md', change.replace('Why: customers asked.', 'Why: customers asked twice.'));
  const consolidated = repo.commit('csv-export: consolidate', { date: '2026-04-20T12:00:00Z' });

  // The fixture: with -C, git credits INV-7 (lines 8-9) to the change spec's commit; without, to the consolidating one.
  assertBlamed(repo, 'HEAD', 'specs/invoices.md', [8, 9], ['-w', '-M', '-C'], spec);
  assertBlamed(repo, 'HEAD', 'specs/invoices.md', [8, 9], ['-w', '-M'], consolidated);

  const r = contextOf(repo, 'INV-7');
  ok(r);
  has(r.stdout, 'csv-export', 'folder', '2026-04-20');
  assert.ok(!r.stdout.includes('2026-04-01'), `INV-7 reached the baseline on 2026-04-20, not when the change spec was written:\n${r.stdout}`);
  assertFrame(r.stdout);
});

test('[VW-3] an ID in no section and held by no change exits 0 and says "not in the baseline"; a pending add says so too, and names its holder', (t) => {
  const repo = makeRepo(t);
  const INV8 = '## [INV-8] Export page\nThe invoice page MUST offer the export.\n';
  repo.write('specs/invoices.md', file(INV1, INV3_1));
  addRequest(repo, 'csv-export', [block('[INV-8]@1 add after [INV-3]   for R1', { now: INV8 })]);
  repo.commit('Records', { date: '2026-03-01T12:00:00Z' });

  const none = contextOf(repo, 'INV-99');
  ok(none);
  assert.ok(none.stdout.includes('not in the baseline'), none.stdout);
  assertFrame(none.stdout);

  const pending = contextOf(repo, 'INV-8');
  ok(pending);
  assert.ok(pending.stdout.includes('not in the baseline'), pending.stdout);
  has(pending.stdout, 'csv-export', 'pending');
  assertFrame(pending.stdout);
});

test('[VW-3] real data: context STA-4 in a copy of this repo shows its text and its holder, assuredloop-v1', (t) => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const repo = makeRepo(t);
  cpSync(join(root, 'requests'), join(repo.dir, 'requests'), { recursive: true });
  cpSync(join(root, 'specs'), join(repo.dir, 'specs'), { recursive: true });
  repo.commit('Copy of the records and the baseline');
  const r = contextOf(repo, 'STA-4');
  ok(r);
  assert.ok(r.stdout.includes('MUST validate everything first'), `STA-4's text:\n${r.stdout}`);
  has(r.stdout, 'assuredloop-v1');
  assertFrame(r.stdout);
});
