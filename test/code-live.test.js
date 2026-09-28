// The Outcome conclude writes [REC-9] ends with the code still live for
// dropped work: the files touched by the commits that map to the request (by
// a Request: line or its folder [LNK-2]), blamed at HEAD with -w -M -C, as
// path:a-b ranges of the lines still attributed to those commits, and no
// commit ID. For --dropped that is all of them; for a concluded request, only
// the lines whose nearest [ID] marker above belongs to a Dropped (not Kept)
// section. Records and the baseline are not code. With no such code there is
// no such line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { block } from './helpers/change.js';
import { ENV, addRequest, both, outcome } from './helpers/request.js';
import { assertBlamed, file } from './helpers/links.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const INV5A = '## [INV-5] Cancelling\nAn invoice can be cancelled.\n';
const INV5B = '## [INV-5] Cancelling\nAn invoice MUST be cancellable within 14 days.\n';
const INV7 = '## [INV-7] CSV rows\nOne row per line item.\n';
const INV8 = '## [INV-8] Time zones\nDates MUST carry the customer\'s time zone.\n';
const EM2 = '## [EM-2] Email link\nThe invoice email MUST carry a link to the CSV.\n';
const LIVE = '- Code still live for dropped work: ';
const BLAME = ['-w', '-M', '-C'];

const numbered = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1)).join('\n') + '\n';
const change = (repo, path, from, to) => {
  const text = repo.read(path).toString();
  assert.ok(text.includes(from), `the fixture: ${path} should hold ${JSON.stringify(from)}`);
  repo.write(path, text.replace(from, to));
};
function conclude(repo, ...args) {
  const r = runAl(repo.dir, ['conclude', ...args, '--yes'], { env: ENV });
  assert.equal(r.code, 0, both(r));
  return repo.read(`requests/archive/${args[0]}/request.md`).toString();
}
function assertNoCommitIds(repo, md) {
  for (const id of repo.git(['rev-list', '--all']).split('\n')) {
    assert.ok(!md.includes(id.slice(0, 7)), `request.md should hold no commit ID, found ${id.slice(0, 7)}:\n${md}`);
  }
}

test('[REC-9][LNK-2] conclude --dropped: the Outcome\'s last line lists the request\'s code still live at HEAD, by Request line and by folder, as path:a-b ranges with no commit ID', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  repo.write('src/invoice.js', numbered(15, (i) => `export const line${i} = ${i};`));
  const before = repo.commit('Invoice code', { date: '2026-09-01T12:00:00Z' });
  addRequest(repo, 'email-link', [block('[EM-2]@1 add in specs/email.md   for R3', { now: EM2 })], { signed: false });
  repo.commit('email-link: request', { date: '2026-09-20T12:00:00Z' });
  // By its Request line: src/email.js, and line 12 of src/invoice.js.
  repo.write('src/email.js', numbered(9, (i) => `export const email${i} = 'part ${i} of the email link';`));
  change(repo, 'src/invoice.js', 'line12 = 12;', "line12 = 'with the email link';");
  const code = repo.commit('Email link\n\nRequest: email-link', { date: '2026-09-21T12:00:00Z' });
  // By its folder: src/page.js.
  const md = repo.read('requests/email-link/request.md').toString();
  repo.write('requests/email-link/request.md', `${md}\n## Parts\n\n1. Email page\n`);
  repo.write('src/page.js', numbered(3, (i) => `export const page${i} = 'the email page, part ${i}';`));
  const page = repo.commit('Email page', { date: '2026-09-22T12:00:00Z' });
  // Another request rewrites lines 8 and 9 of src/email.js.
  change(repo, 'src/email.js', "email8 = 'part 8 of the email link';\nexport const email9 = 'part 9 of the email link';",
    "email8 = 'a shorter link';\nexport const email9 = 'no tracking';");
  const other = repo.commit('Shorter link\n\nRequest: link-format', { date: '2026-09-23T12:00:00Z' });

  assertBlamed(repo, 'HEAD', 'src/email.js', [1, 7], BLAME, code);
  assertBlamed(repo, 'HEAD', 'src/email.js', [8, 9], BLAME, other);
  assertBlamed(repo, 'HEAD', 'src/invoice.js', [12, 12], BLAME, code);
  assertBlamed(repo, 'HEAD', 'src/invoice.js', [11, 11], BLAME, before);
  assertBlamed(repo, 'HEAD', 'src/invoice.js', [13, 13], BLAME, before);
  assertBlamed(repo, 'HEAD', 'src/page.js', [1, 3], BLAME, page);

  const archived = conclude(repo, 'email-link', '--dropped', 'D4');
  const g = outcome(archived).generated;
  assert.equal(g[0], '- Dropped as a whole by D4', g.join('\n'));
  const last = g.at(-1);
  assert.ok(last.startsWith(LIVE), `the last generated line should start with "${LIVE}":\n${g.join('\n')}`);
  assert.deepEqual(last.slice(LIVE.length).split(', ').sort(), ['src/email.js:1-7', 'src/invoice.js:12', 'src/page.js:1-3']);
  assert.equal(g.filter((l) => l.includes('Code still live')).length, 1, g.join('\n'));
  assertNoCommitIds(repo, archived);
});

test('[REC-9] conclude --dropped with no code still live writes no such line: the request\'s commits touched only its records and the baseline, and its code was rewritten since', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  repo.commit('Initial spec', { date: '2026-09-01T12:00:00Z' });
  addRequest(repo, 'tz-dates', [block('[INV-8]@1 add after [INV-3]   for R2', { now: INV8 })], { signed: false });
  change(repo, 'specs/invoices.md', 'two decimals.', 'two decimals, always.');
  repo.write('src/tz.js', 'export const zone = "UTC";\nexport const offset = 0;\n');
  const first = repo.commit('tz-dates: request and a first try\n\nRequest: tz-dates', { date: '2026-09-20T12:00:00Z' });
  repo.write('src/tz.js', 'export const zone = "Europe/Amsterdam";\nexport const offset = 1;\n');
  const redone = repo.commit('Zones done right\n\nRequest: zones', { date: '2026-09-21T12:00:00Z' });
  assertBlamed(repo, 'HEAD', 'specs/invoices.md', [2, 2], BLAME, first);
  assertBlamed(repo, 'HEAD', 'src/tz.js', [1, 2], BLAME, redone);

  const archived = conclude(repo, 'tz-dates', '--dropped', 'D4');
  const g = outcome(archived).generated;
  assert.ok(!g.some((l) => l.includes('Code still live')), `no code is still live:\n${g.join('\n')}`);
  assert.equal(g.at(-1), '- Agent rulings: D2', g.join('\n'));
});

test('[REC-9] a concluded request with a Dropped section: only the lines under that section\'s marker are listed, not a consolidated or a Dropped-but-Kept section\'s', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S1, INV7, INV5B));
  addRequest(repo, 'invoice-mail', [
    block('[INV-7]@1 add after [INV-3]   for R1', { now: INV7 }),
    block('[EM-2]@1 add in specs/email.md   Dropped 2026-09-26 (D4)   for R3', { now: EM2 }),
    block('[INV-5]@1 modify   Dropped 2026-09-26 (D4)   Kept 2026-09-26 (D3)   for R2', { was: INV5A, now: INV5B }),
  ]);
  repo.commit('invoice-mail: request and spec', { date: '2026-09-20T12:00:00Z' });
  repo.write('src/mail.js', [
    '// [INV-7] CSV rows', // 1
    'export function csvRow(invoice) {',
    "  return [invoice.number, invoice.total].join(',');",
    '}',
    '// [INV-5] Cancelling', // 5
    'export function cancellable(invoice, today) {',
    '  return today - invoice.issuedOn <= 14 * 86400000;',
    '}',
    '// [EM-2] Email link', // 9
    'export function emailLink(invoice) {',
    '  return `https://example.invalid/invoices/${invoice.number}.csv`;',
    '}', // 12
  ].join('\n') + '\n');
  const code = repo.commit('Mail code\n\nRequest: invoice-mail', { date: '2026-09-21T12:00:00Z' });
  assertBlamed(repo, 'HEAD', 'src/mail.js', [1, 12], BLAME, code);

  const archived = conclude(repo, 'invoice-mail');
  const g = outcome(archived).generated;
  // Whether the marker line itself (9) counts as under its marker is left open.
  assert.match(g.at(-1), /^- Code still live for dropped work: src\/mail\.js:(9|10)-12$/, g.join('\n'));
  assert.equal(g.filter((l) => l.includes('Code still live')).length, 1, g.join('\n'));
  assertNoCommitIds(repo, archived);
});
