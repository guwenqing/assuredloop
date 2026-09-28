// The rough links of al context --diff [LNK-1], on the fixtures of
// acceptance C5 and C1: 1 a bracketed [ID] on a changed line or the nearest
// one above it in the same file, with the distance; 2 old-side blame of
// changed or deleted lines with -w -M -C and .git-blame-ignore-revs, then the
// commit's request [LNK-2] by a Request: line anywhere in its message, else
// the request folder it touched ("ambiguous" for more than one), else an
// issue number in a request's owner's words; 3 co-change, skipping and
// counting commits over 30 files. IDs match as whole tokens [SPC-2]. A
// shallow clone says "history unavailable" [VW-9].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cloneRepo, sha256 } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { addRequest, both, lineWith } from './helpers/request.js';
import { assertBlamed, assertDiffFrame, contextDiff, file, squashMerge } from './helpers/links.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const INV3 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const INV7 = '## [INV-7] CSV rows\nOne row per line item.\n';

const ok = (r) => assert.equal(r.code, 0, both(r));
const has = (out, ...parts) => assert.ok(lineWith(out, ...parts), `expected a line with ${parts.map(String).join(' and ')}:\n${out}`);
const hasNo = (out, ...parts) => assert.ok(!lineWith(out, ...parts), `expected no line with ${parts.map(String).join(' and ')}:\n${out}`);

// main with the baseline committed; returns the repo.
function base(t, spec = file(INV1, INV3, INV7)) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', spec);
  repo.commit('Initial spec', { date: '2026-01-05T12:00:00Z' });
  return repo;
}
// Replace `from` by `to` in `path`, which must hold it.
function change(repo, path, from, to) {
  const text = repo.read(path).toString();
  assert.ok(text.includes(from), `the fixture: ${path} should hold ${JSON.stringify(from)}`);
  repo.write(path, text.replace(from, to));
}
// On a new branch `work`: apply the edits [path, from, to] and commit.
function work(repo, edits, message = 'Work') {
  repo.git(['checkout', '-q', '-b', 'work']);
  for (const [path, from, to] of edits) change(repo, path, from, to);
  return repo.commit(message, { date: '2026-06-01T12:00:00Z' });
}
function diffOk(repo, range = 'main...HEAD') {
  const r = contextDiff(repo, range);
  ok(r);
  assertDiffFrame(r.stdout);
  return r.stdout;
}

// --- 1: a bracketed ID near the change ---

const MIXED = [
  '// [INV-3] Dates', // 1
  'export function formatDate(d) {',
  '  return d.toISOString().slice(0, 10);', // 3
  '}',
  '',
  '// [INV-7] CSV rows', // 6
  'export function csvRow(invoice) {',
  '  const cells = [',
  '    invoice.number,',
  '    invoice.customer,',
  '    invoice.total,',
  '    invoice.currency,',
  '    invoice.issuedOn,',
  '    invoice.dueOn,',
  '  ];',
  "  return cells.join(',');", // 16
  '}',
].join('\n') + '\n';

test('C5 [LNK-1] a mixed file: a change under each marker links to its own marker, with the distance (2 and 10 lines above)', (t) => {
  const repo = base(t);
  repo.write('src/invoice.js', MIXED);
  repo.commit('Invoice code', { date: '2026-02-01T12:00:00Z' });
  work(repo, [['src/invoice.js', 'slice(0, 10)', 'slice(0, 19)'], ['src/invoice.js', "cells.join(',')", "cells.join(';')"]]);
  assert.equal(repo.git(['diff', '-U0', 'main', 'work', '--', 'src/invoice.js']).split('\n').filter((l) => l.startsWith('@@')).length, 2,
    'the fixture: two hunks, at lines 3 and 16');

  const out = diffOk(repo);
  has(out, 'src/invoice.js', 'names [INV-3]', /\b2 lines above\b/);
  has(out, 'src/invoice.js', 'names [INV-7]', /\b10 lines above\b/);
  // Each marker with the distance after it, before the next bracket: only the nearest marker above each change.
  const pairs = lines(out).filter((l) => l.includes('src/invoice.js'))
    .flatMap((l) => [...l.matchAll(/\[(INV-\d+)\][^[\n]*?\b(\d+) lines? above/g)].map((m) => `${m[1]} ${m[2]}`));
  assert.deepEqual([...new Set(pairs)].sort(), ['INV-3 2', 'INV-7 10'], `the change under [INV-7] should not link to [INV-3] further up:\n${out}`);
});

test('C5 [LNK-1] an [ID] on the changed line links first; the marker above it does not', (t) => {
  const repo = base(t);
  repo.write('src/invoice.js', '// [INV-3] Dates\nexport function formatDate(d) {\n  return d.toISOString().slice(0, 10);\n}\n' +
    "export const separator = ','; // [INV-7]\n");
  repo.commit('Invoice code', { date: '2026-02-01T12:00:00Z' });
  work(repo, [['src/invoice.js', "separator = ','", "separator = ';'"]]);

  const out = diffOk(repo);
  has(out, 'src/invoice.js', 'names [INV-7]');
  hasNo(out, 'src/invoice.js', 'INV-3');
});

test('C5 [LNK-1] a test name is a line like any other: a changed assertion links to the [INV-3] in its test name, 2 lines above', (t) => {
  const repo = base(t);
  repo.write('test/invoice.test.js', "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\n\n" +
    "test('[INV-3] dates show in ISO 8601', () => {\n  const d = new Date('2026-01-05T12:00:00Z');\n" +
    "  assert.equal(formatDate(d), '2026-01-05');\n});\n");
  repo.commit('Invoice test', { date: '2026-02-01T12:00:00Z' });
  work(repo, [['test/invoice.test.js', "formatDate(d), '2026-01-05'", "formatDate(d), '2026-01-05T12:00'"]]);
  has(diffOk(repo), 'test/invoice.test.js', 'names [INV-3]', /\b2 lines above\b/);
});

test('C5 [LNK-1][SPC-2] scoped IDs: changes under [INV-3.1], [INV-30] and [INV-3] each link to their own marker and to no other', (t) => {
  const repo = base(t, file(INV3, '### [INV-3.1] Weekdays\nWeekdays MUST show in full.\n', '## [INV-30] Refunds\nRefunds MUST name the invoice.\n'));
  const code = (id, name, body) => `// [${id}]\nexport function ${name}(x) {\n  return ${body};\n}\n`;
  repo.write('src/a.js', code('INV-3.1', 'dayOfWeek', 'x.getUTCDay()'));
  repo.write('src/b.js', code('INV-30', 'refundOf', 'x.number'));
  repo.write('src/c.js', code('INV-3', 'isoDate', 'x.toISOString()'));
  repo.commit('Code', { date: '2026-02-01T12:00:00Z' });
  work(repo, [['src/a.js', 'x.getUTCDay()', 'x.getUTCDay() || 7'], ['src/b.js', 'x.number', 'x.invoiceNumber'], ['src/c.js', 'x.toISOString()', 'x.toISOString().slice(0, 10)']]);

  const out = diffOk(repo);
  const cases = [['src/a.js', 'INV-3.1'], ['src/b.js', 'INV-30'], ['src/c.js', 'INV-3']];
  for (const [path, id] of cases) {
    has(out, path, `names [${id}]`, /\b2 lines above\b/);
    for (const [, other] of cases.filter((c) => c[1] !== id)) hasNo(out, path, other);
  }
});

// --- 2: old-side blame, then the commit's request ---

const DATES = (indent, quote) => `export function formatDate(d) {\n${indent}const sep = ${quote}-${quote};\n` +
  `${indent}return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()].join(sep);\n}\n`;

test('C5 [LNK-1] a whitespace-only reindent is skipped by blame (-w): the changed line is still last changed by the request that wrote it', (t) => {
  const repo = base(t);
  repo.write('src/dates.js', DATES('  ', "'"));
  const wrote = repo.commit('ISO dates\n\nRequest: invoice-dates', { date: '2026-02-01T12:00:00Z' });
  repo.write('src/dates.js', DATES('    ', "'"));
  const sweep = repo.commit('Reindent to four spaces', { date: '2026-02-02T12:00:00Z' });
  assertBlamed(repo, 'HEAD', 'src/dates.js', [3, 3], ['-M', '-C'], sweep);
  assertBlamed(repo, 'HEAD', 'src/dates.js', [3, 3], ['-w', '-M', '-C'], wrote);
  work(repo, [['src/dates.js', '.join(sep)', ".join('/')"]]);

  const out = diffOk(repo);
  has(out, 'src/dates.js', 'last changed by invoice-dates');
  hasNo(out, 'src/dates.js', 'no request');
});

test('C5 [LNK-1] a quote-style sweep listed in .git-blame-ignore-revs is skipped too: the changed line is still last changed by the request that wrote it', (t) => {
  const repo = base(t);
  repo.write('src/dates.js', DATES('  ', "'"));
  const wrote = repo.commit('ISO dates\n\nRequest: invoice-dates', { date: '2026-02-01T12:00:00Z' });
  repo.write('src/dates.js', DATES('  ', '"'));
  const sweep = repo.commit('Prettier: double quotes', { date: '2026-02-02T12:00:00Z' });
  repo.write('.git-blame-ignore-revs', `# The quote sweep\n${sweep}\n`);
  repo.commit('Ignore the quote sweep in blame', { date: '2026-02-03T12:00:00Z' });
  assertBlamed(repo, 'HEAD', 'src/dates.js', [2, 2], ['-w', '-M', '-C'], sweep);
  assertBlamed(repo, 'HEAD', 'src/dates.js', [2, 2], ['-w', '-M', '-C', '--ignore-revs-file', '.git-blame-ignore-revs'], wrote);
  work(repo, [['src/dates.js', 'const sep = "-";', 'const sep = "/";']]);

  const out = diffOk(repo);
  has(out, 'src/dates.js', 'last changed by invoice-dates');
  hasNo(out, 'src/dates.js', 'no request');
});

test('C5 [LNK-1] a function moved to another file in a later commit: blame (-M -C) of the moved lines still gives the request that wrote them, not the move', (t) => {
  const repo = base(t);
  const CSV = 'export function csvRowForInvoice(invoice) {\n  const cells = [invoice.number, invoice.customerName, invoice.totalAmount];\n' +
    "  return cells.map((cell) => String(cell).replaceAll('\"', '\"\"')).join(',');\n}\n";
  const TAIL = "export function exportInvoices(list) {\n  return list.map(csvRowForInvoice).join('\\n');\n}\n";
  repo.write('src/export.js', `import { formatDate } from './dates.js';\n\n${CSV}\n${TAIL}`);
  const wrote = repo.commit('CSV export\n\nRequest: csv-export', { date: '2026-02-01T12:00:00Z' });
  repo.write('src/export.js', `import { formatDate } from './dates.js';\nimport { csvRowForInvoice } from './csv.js';\n\n${TAIL}`);
  repo.write('src/csv.js', `// CSV helpers\n\n${CSV}`);
  const moved = repo.commit('Move csvRowForInvoice into src/csv.js', { date: '2026-02-02T12:00:00Z' });
  assertBlamed(repo, 'HEAD', 'src/csv.js', [4, 4], ['-w', '-M'], moved);
  assertBlamed(repo, 'HEAD', 'src/csv.js', [4, 4], ['-w', '-M', '-C'], wrote);
  work(repo, [['src/csv.js', 'invoice.totalAmount]', 'invoice.totalAmount, invoice.currency]']]);

  const out = diffOk(repo);
  has(out, 'src/csv.js', 'last changed by csv-export');
  hasNo(out, 'src/csv.js', 'no request');
});

test('C5 [LNK-1] a deleted line: old-side blame names the request that added it; a pure insertion has no old side and says so', (t) => {
  const repo = base(t);
  repo.write('src/dates.js', 'export function formatDate(d) {\n  // the local format was dropped\n  return d.toISOString().slice(0, 10);\n}\n');
  repo.write('src/money.js', 'export function formatTotal(n) {\n  return n.toFixed(2);\n}\n');
  repo.commit('ISO dates\n\nRequest: invoice-dates', { date: '2026-02-01T12:00:00Z' });
  work(repo, [['src/dates.js', '  // the local format was dropped\n', ''],
    ['src/money.js', '  return n.toFixed(2);\n', "  if (n === 0) return '0.00';\n  return n.toFixed(2);\n"]]);
  assert.equal(repo.git(['diff', '--numstat', 'main', 'work', '--', 'src/dates.js', 'src/money.js']),
    '0\t1\tsrc/dates.js\n1\t0\tsrc/money.js', 'the fixture: one line deleted, one line inserted');

  const out = diffOk(repo);
  has(out, 'src/dates.js', 'last changed by invoice-dates');
  // The wording that says so is left open.
  has(out, 'src/money.js', /insert|old side|added|new lines|not blamed|nothing to blame/i);
  hasNo(out, 'src/money.js', 'last changed by');
});

test('C1 C5 [LNK-2] missing trailers: "folder" (open and archived), "folder, ambiguous" naming both, "issue #57" from the owner\'s words only, and "no request"', (t) => {
  const repo = base(t);
  const words = (name, text) => {
    const path = `requests/${name}/request.md`;
    change(repo, path, 'owner chat', text);
  };
  addRequest(repo, 'csv-export', null);
  addRequest(repo, 'tz-dates', null);
  addRequest(repo, 'sep-fix', null);
  words('sep-fix', 'issue #57');
  addRequest(repo, 'issue-570', null);
  words('issue-570', 'issue #570');
  addRequest(repo, 'decisions-only', null, { decisions: '\n## Decisions\n\n- D1, 2026-02-01. Source: the owner. Same as #57, later.\n' });
  addRequest(repo, 'invoice-dates', null, { dir: 'requests/archive/invoice-dates', status: 'concluded' });
  repo.commit('Records', { date: '2026-02-01T12:00:00Z' });

  const append = (path, text) => repo.write(path, repo.read(path).toString() + text);
  append('requests/csv-export/request.md', '\n## Parts\n\n1. Export page\n');
  repo.write('src/page.js', 'export const page = "export";\n');
  repo.commit('Export page', { date: '2026-02-02T12:00:00Z' });
  repo.write('requests/archive/invoice-dates/origin/2026-02-03-note.md',
    `Source: standard input\nFetched: 2026-02-03T09:00Z\nSHA-256: ${sha256('A note.\n')}\n---\nA note.\n`);
  repo.write('src/calendar.js', 'export const calendar = "iso";\n');
  repo.commit('Calendar', { date: '2026-02-03T12:00:00Z' });
  append('requests/csv-export/request.md', '2. Zones\n');
  append('requests/tz-dates/request.md', '\n## Parts\n\n1. Zones\n');
  repo.write('src/zone.js', 'export const zone = "UTC";\n');
  repo.commit('Hotfix', { date: '2026-02-04T12:00:00Z' });
  repo.write('src/separator.js', 'export const separator = ",";\n');
  repo.commit('Fix the separator (#57)', { date: '2026-02-05T12:00:00Z' });
  repo.write('src/tidy.js', 'export const tidy = true;\n');
  repo.commit('Tidy', { date: '2026-02-06T12:00:00Z' });
  work(repo, [['src/page.js', '"export"', '"csv"'], ['src/calendar.js', '"iso"', '"iso-8601"'], ['src/zone.js', '"UTC"', '"Europe/Amsterdam"'],
    ['src/separator.js', '","', '";"'], ['src/tidy.js', 'true', 'false']]);

  const out = diffOk(repo);
  has(out, 'src/page.js', 'last changed by csv-export', 'folder');
  hasNo(out, 'src/page.js', 'ambiguous');
  has(out, 'src/calendar.js', 'last changed by invoice-dates', 'folder');
  has(out, 'src/zone.js', 'csv-export', 'folder, ambiguous');
  has(out, 'src/zone.js', 'tz-dates', 'folder, ambiguous');
  has(out, 'src/separator.js', 'last changed by sep-fix', 'issue #57');
  assert.ok(!out.includes('issue-570'), `#57 is not #570:\n${out}`);
  assert.ok(!out.includes('decisions-only'), `#57 in Decisions is not in the owner's words:\n${out}`);
  has(out, 'src/tidy.js', 'no request');
  hasNo(out, 'src/tidy.js', /csv-export|tz-dates|sep-fix|invoice-dates/);
});

test('C1 [LNK-2] git\'s default merge --squash message indents the Request line; it still maps by "Request: line"', (t) => {
  const repo = base(t);
  repo.git(['checkout', '-q', '-b', 'part-2']);
  repo.write('src/export.js', "export const header = ['number', 'total'];\n");
  repo.commit('Part 2: CSV export\n\nRequest: csv-export', { date: '2026-02-01T12:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  squashMerge(repo, 'part-2', '2026-02-02T12:00:00Z');
  repo.git(['branch', '-q', '-D', 'part-2']);
  const msg = repo.git(['log', '-1', '--format=%B']);
  assert.ok(msg.startsWith('Squashed commit of the following:') && msg.includes('\n    Request: csv-export'), `the fixture: git's default squash message:\n${msg}`);
  assert.equal(repo.git(['log', '-1', '--format=%(trailers:key=Request)']), '', 'the fixture: git reads no Request trailer in it');
  work(repo, [['src/export.js', "'total'", "'total', 'currency'"]]);

  has(diffOk(repo), 'src/export.js', 'last changed by csv-export', 'Request: line');
});

test('C1 [LNK-2] "Fixes #12" in the same paragraph as "Request: csv-export" maps by the Request line, not by the issue another request lists', (t) => {
  const repo = base(t);
  addRequest(repo, 'csv-export', null);
  addRequest(repo, 'invoice-dates', null);
  change(repo, 'requests/invoice-dates/request.md', 'owner chat', 'issue #12');
  repo.commit('Records', { date: '2026-02-01T12:00:00Z' });
  repo.write('src/export.js', "export const header = ['number', 'total'];\n");
  repo.commit('Export CSV\n\nFixes #12\nRequest: csv-export', { date: '2026-02-02T12:00:00Z' });
  assert.equal(repo.git(['log', '-1', '--format=%(trailers:key=Request)']), '', 'the fixture: git reads no Request trailer in it');
  work(repo, [['src/export.js', "'total'", "'total', 'currency'"]]);

  const out = diffOk(repo);
  has(out, 'src/export.js', 'last changed by csv-export', 'Request: line');
  hasNo(out, 'issue #12');
  hasNo(out, 'src/export.js', 'invoice-dates');
});

test('C1 [LNK-2] several distinct Request lines, bulleted, name every request, and that is not "ambiguous"', (t) => {
  const repo = base(t);
  repo.write('src/shared.js', 'export const shared = 1;\n');
  repo.commit('Shared helper\n\n- Request: csv-export\n- Request: invoice-dates', { date: '2026-02-01T12:00:00Z' });
  work(repo, [['src/shared.js', '= 1', '= 2']]);

  const out = diffOk(repo);
  has(out, 'src/shared.js', 'csv-export', 'Request: line');
  has(out, 'src/shared.js', 'invoice-dates', 'Request: line');
  hasNo(out, 'src/shared.js', 'ambiguous');
});

// --- 3: co-change ---

test('C5 [LNK-1] co-change skips and counts a 200-file commit ("over 30 files", 1); a narrow commit that changed the file still links its section', (t) => {
  const INV4 = (s) => `## [INV-4] Separator\nThe CSV separator is ${s}.\n`;
  const INV9 = (r) => `## [INV-9] Rounding\nTotals MUST round ${r}.\n`;
  const repo = base(t, file(INV1, INV4('a comma'), INV9('half up')));
  repo.write('src/export.js', "export const sep = ',';\nexport const round = 'half up';\nexport const rows = [];\n");
  repo.commit('Export code', { date: '2026-02-01T12:00:00Z' });
  for (let i = 1; i <= 198; i++) repo.write(`gen/f${String(i).padStart(3, '0')}.txt`, `generated ${i}\n`);
  change(repo, 'src/export.js', "'half up'", "'half away from zero'");
  repo.write('specs/invoices.md', file(INV1, INV4('a comma'), INV9('half away from zero')));
  const wide = repo.commit('Regenerate everything', { date: '2026-02-02T12:00:00Z' });
  change(repo, 'src/export.js', "sep = ','", "sep = ';'");
  repo.write('specs/invoices.md', file(INV1, INV4('a semicolon'), INV9('half away from zero')));
  const narrow = repo.commit('Semicolon separator\n\nRequest: csv-export', { date: '2026-02-03T12:00:00Z' });
  assert.equal(repo.git(['show', '--name-only', '--format=', wide]).split('\n').length, 200, 'the fixture: W touches 200 files');
  assert.equal(repo.git(['show', '--name-only', '--format=', narrow]), 'specs/invoices.md\nsrc/export.js', 'the fixture: N touches 2 files');
  work(repo, [['src/export.js', 'rows = []', 'rows = [header]']]);

  const out = diffOk(repo);
  has(out, 'src/export.js', 'INV-4', 'changed together');
  hasNo(out, 'INV-9', 'changed together');
  has(out, 'over 30 files', /\b1\b/);
});

// --- A shallow clone ---

test('C1 [VW-9][LNK-1] --diff in a shallow clone: blame and co-change say "history unavailable", never a false "no request"; the ID link still shows', (t) => {
  const repo = base(t);
  repo.write('src/dates.js', '// [INV-3] Dates\nexport function formatDate(d) {\n  return d.toISOString().slice(0, 10);\n}\n');
  repo.commit('ISO dates\n\nRequest: iso-dates', { date: '2026-02-01T12:00:00Z' });
  change(repo, 'specs/invoices.md', 'two decimals', 'two decimals, always');
  const tidy = repo.commit('Tidy the spec', { date: '2026-02-02T12:00:00Z' });
  change(repo, 'src/dates.js', 'slice(0, 10)', 'slice(0, 19)');
  repo.commit('Dates with the time\n\nRequest: tz-dates', { date: '2026-02-03T12:00:00Z' });
  const clone = cloneRepo(t, repo, { depth: 2 });
  assert.equal(clone.git(['rev-parse', '--is-shallow-repository']), 'true');
  assert.equal(clone.git(['rev-list', '--count', 'HEAD']), '2', 'the fixture clone holds two commits');
  // In the clone, blame at the base puts the changed line on the boundary commit, which has no request.
  assertBlamed(clone, 'HEAD~1', 'src/dates.js', [3, 3], ['-w', '-M', '-C'], tidy);

  const full = contextDiff(repo, 'HEAD~1..HEAD');
  ok(full);
  assert.ok(!full.stdout.includes('history unavailable'), full.stdout);
  has(full.stdout, 'src/dates.js', 'last changed by iso-dates');

  const r = contextDiff(clone, 'HEAD~1..HEAD');
  ok(r);
  assertDiffFrame(r.stdout, 'origin/main');
  assert.ok(r.stdout.includes('history unavailable'), r.stdout);
  assert.ok(!r.stdout.includes('no request'), `blame in a shallow clone gives no request to report:\n${r.stdout}`);
  assert.doesNotMatch(r.stdout, /nothing found/i);
  has(r.stdout, 'src/dates.js', 'names [INV-3]', /\b2 lines above\b/);
});
