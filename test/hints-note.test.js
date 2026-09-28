// The notes [HNT-2] al check gives for a branch: a section it changes that
// also changed on main since the fork; baseline changes in commits that map
// to no request; code still live for dropped work, as path:lines, and whether
// a part plans its removal (for requests the branch serves or archives, by
// [REC-9]'s rule); a served request's snapshot of an http(s) source, "fetched
// <date>, not re-checked since", naming al record <name> origin --verify.
// Notes never count: check --strict ignores them [HNT-3].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl, sha256 } from './helpers/fixture.js';
import { block } from './helpers/change.js';
import { ENV, addRequest, both } from './helpers/request.js';
import { assertBlamed, file } from './helpers/links.js';
import { check, hint, message, noHint } from './helpers/hints.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const INV1B = '## [INV-1] Totals\nTotals MUST show two decimals, rounded half up.\n';
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const S2 = '## [INV-3] Dates\nDates MUST show in ISO 8601, with the time zone.\n';
const INV4A = '## [INV-4] Separator\nThe CSV separator is a comma.\n';
const INV4B = '## [INV-4] Separator\nThe CSV separator MUST be a semicolon.\n';
const INV7 = '## [INV-7] CSV rows\nOne row per line item.\n';
const EM2 = '## [EM-2] Email link\nThe invoice email MUST carry a link to the CSV.\n';
const BLAME = ['-w', '-M', '-C'];

// --- changed on main since the fork ---

// Main at the fork: iso-dates (signed) holds INV-3. The branch consolidates
// it; then main takes `onMain` (the baseline) in a commit of tz-dates.
function forked(t, onMain) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0, INV4A));
  addRequest(repo, 'iso-dates', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  addRequest(repo, 'tz-dates', null);
  const fork = repo.commit('Records', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'iso-dates-part-1']);
  repo.write('specs/invoices.md', file(INV1, S1, INV4A));
  repo.commit(message('Consolidate INV-3', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-22T12:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  repo.write('specs/invoices.md', onMain);
  repo.commit(message('Main moves on', { request: 'tz-dates', tier: '1 — main moves on' }), { date: '2026-09-23T12:00:00Z' });
  repo.git(['checkout', '-q', 'iso-dates-part-1']);
  assert.equal(repo.git(['merge-base', 'main', 'HEAD']), fork, 'the fixture: the branch forks before main\'s commit');
  return repo;
}

test('[HNT-2] a section the branch changes that also changed on main since the fork is a note naming it; a section only main changed is not', (t) => {
  const out = check(forked(t, file(INV1, S2, INV4A)), '--all');
  hint(out, 'note', 'changed on main since the fork', 'INV-3');

  const other = check(forked(t, file(INV1, S0, INV4B)), '--all');
  noHint(other, 'changed on main since the fork');
});

// --- no request linked ---

test('[HNT-2] a baseline change in commits that map to no request is a note, "no request linked"; the same change with a Request line is not', (t) => {
  for (const request of [undefined, 'totals']) {
    const repo = makeRepo(t);
    repo.write('specs/invoices.md', file(INV1, S0));
    addRequest(repo, 'totals', null);
    repo.commit('Records', { date: '2026-09-21T12:00:00Z' });
    repo.git(['checkout', '-q', '-b', 'work']);
    repo.write('specs/invoices.md', file(INV1B, S0));
    const c = repo.commit(message('Round totals', { request, tier: '1 — round totals' }), { date: '2026-09-22T12:00:00Z' });
    const out = check(repo, '--all');
    if (request) noHint(out, 'no request linked');
    else hint(out, 'note', 'no request linked', new RegExp(`\\bINV-1\\b|${c.slice(0, 7)}|specs/invoices\\.md`));
  }
});

// --- code still live for dropped work ---

const MAIL = [
  '// [INV-7] CSV rows', // 1
  'export function csvRow(invoice) {',
  "  return [invoice.number, invoice.total].join(',');",
  '}',
  '// [EM-2] Email link', // 5
  'export function emailLink(invoice) {',
  '  return `https://example.invalid/invoices/${invoice.number}.csv`;',
  '}',
  '// [INV-5] Cancelling', // 9
  'export function cancellable(invoice, today) {',
  '  return today - invoice.issuedOn <= 14 * 86400000;',
  '}', // 12
].join('\n') + '\n';
const INV5A = '## [INV-5] Cancelling\nAn invoice can be cancelled.\n';
const INV5B = '## [INV-5] Cancelling\nAn invoice MUST be cancellable within 14 days.\n';

// Main: invoice-mail (signed) with INV-7 consolidated, EM-2 Dropped (not
// kept) and INV-5 Dropped but Kept, its parts `own`; its parent invoice-epic,
// whose parts are `parent`; csv-rows, another request; src/mail.js by
// invoice-mail's Request line. The branch serves `serve`.
function dropped(t, { own = '1. CSV rows\n', parent = '1. Mail: request invoice-mail\n', serve = 'invoice-mail' } = {}) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S1, INV7, INV5B));
  addRequest(repo, 'invoice-mail', [
    block('[INV-7]@1 add after [INV-3]   for R1', { now: INV7 }),
    block('[EM-2]@1 add in specs/email.md   Dropped 2026-09-26 (D4)   for R3', { now: EM2 }),
    block('[INV-5]@1 modify   Dropped 2026-09-26 (D4)   Kept 2026-09-26 (D3)   for R2', { was: INV5A, now: INV5B }),
  ], { rest: `\n## Parts\n\n${own}` });
  addRequest(repo, 'invoice-epic', null, { rest: `\n## Parts\n\n${parent}` });
  addRequest(repo, 'csv-rows', null);
  repo.commit('Records', { date: '2026-09-20T12:00:00Z' });
  repo.write('src/mail.js', MAIL);
  const code = repo.commit(message('Mail code', { request: 'invoice-mail', tier: '2 — mail' }), { date: '2026-09-21T12:00:00Z' });
  assertBlamed(repo, 'HEAD', 'src/mail.js', [1, 12], BLAME, code);
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('src/page.js', 'export const page = "invoice";\n');
  repo.commit(message('Invoice page', { request: serve, tier: '2 — page' }), { date: '2026-09-22T12:00:00Z' });
  return repo;
}
// The note for EM-2's lines; no code-still-live line gives a range reaching
// the Kept INV-5's lines (9-12).
function liveNote(repo) {
  const out = check(repo, '--all');
  const line = hint(out, 'note', 'code still live', /src\/mail\.js:(5|6)-8\b/);
  for (const l of out.split('\n').filter((x) => x.includes('code still live'))) {
    for (const [, a, b] of l.matchAll(/src\/mail\.js:(\d+)(?:-(\d+))?/g)) {
      assert.ok(Number(b ?? a) < 9, `the Kept INV-5's lines (9-12) are not code still live for dropped work:\n${l}`);
    }
  }
  return line;
}

test('[HNT-2][REC-9] code still live for a Dropped (not Kept) section of a request the branch serves is a note with its path:lines; it says whether a part (its own, or its parent\'s) names that path', (t) => {
  const unplanned = liveNote(dropped(t));
  const own = liveNote(dropped(t, { own: '1. CSV rows\n2. Remove the email link code from src/mail.js\n' }));
  const parent = liveNote(dropped(t, { parent: '1. Mail: request invoice-mail\n2. Remove src/mail.js once the link is dropped\n' }));
  // Commit ids differ between the fixtures; they are not what says whether a part plans it.
  const plain = (l) => l.replace(/\b[0-9a-f]{7,40}\b/g, '<commit>');
  for (const [how, line] of [['its own part', own], ['its parent\'s part', parent]]) {
    assert.notEqual(plain(line), plain(unplanned), `with ${how} naming src/mail.js, the note should say a part plans its removal:\n${line}\n---\n${unplanned}`);
    assert.match(line, /\bpart\b/i, `the note should say which part plans it:\n${line}`);
  }
});

test('[HNT-2] contrast: the same live code on a branch that serves another request (neither serving nor archiving invoice-mail) gives no such note', (t) => {
  noHint(check(dropped(t, { serve: 'csv-rows' }), '--all'), 'code still live');
});

test('[HNT-2][REC-9] code still live for a request the branch drops and archives is a note with its path:lines', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S1));
  addRequest(repo, 'email-link', [block('[EM-2]@1 add in specs/email.md   for R3', { now: EM2 })]);
  repo.commit('Records', { date: '2026-09-20T12:00:00Z' });
  repo.write('src/email.js', "export const a = 'the email link, part 1';\nexport const b = 'part 2';\nexport const c = 'part 3';\n");
  const code = repo.commit(message('Email code', { request: 'email-link', tier: '2 — email' }), { date: '2026-09-21T12:00:00Z' });
  assertBlamed(repo, 'HEAD', 'src/email.js', [1, 3], BLAME, code);
  repo.git(['checkout', '-q', '-b', 'drop-email-link']);
  const r = runAl(repo.dir, ['conclude', 'email-link', '--dropped', 'D4', '--yes'], { env: ENV });
  assert.equal(r.code, 0, both(r));
  repo.commit(message('Drop email-link', { request: 'email-link', tier: '2 — drop' }), { date: '2026-09-22T12:00:00Z' });
  assert.ok(repo.read('requests/archive/email-link/request.md').toString().includes('Status: dropped'), 'the fixture: archived as dropped');
  hint(check(repo, '--all'), 'note', 'code still live', 'src/email.js:1-3');
});

test('[HNT-2][REC-9] context --diff over a fixed range reads code still live at the range\'s head: a later commit that rewrites the line leaves the hint as it was', (t) => {
  const LINE1 = /src\/export\.js:1(?![\d-])/;
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S1));
  addRequest(repo, 'email-link', [block('[EM-2]@1 add in specs/email.md   for R3', { now: EM2 })]);
  const base = repo.commit('Records', { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'drop-email-link']);
  repo.write('src/export.js', "export const link = 'the email link';\n");
  const code = repo.commit(message('Email link in the export', { request: 'email-link', tier: '2 — email' }), { date: '2026-09-21T12:00:00Z' });
  const r = runAl(repo.dir, ['conclude', 'email-link', '--dropped', 'D4', '--yes'], { env: ENV });
  assert.equal(r.code, 0, both(r));
  const head = repo.commit(message('Drop email-link', { request: 'email-link', tier: '2 — drop' }), { date: '2026-09-22T12:00:00Z' });
  const range = () => {
    const d = runAl(repo.dir, ['context', '--diff', `${base}..${head}`, '--all']);
    assert.equal(d.code, 0, both(d));
    return d.stdout;
  };
  hint(range(), 'note', 'code still live', LINE1);

  repo.write('src/export.js', "export const link = 'no link';\n");
  const later = repo.commit(message('Rewrite the export', { tier: '0 — tidy the export' }), { date: '2026-09-23T12:00:00Z' });
  assertBlamed(repo, head, 'src/export.js', [1, 1], BLAME, code);
  assertBlamed(repo, 'HEAD', 'src/export.js', [1, 1], BLAME, later);
  hint(range(), 'note', 'code still live', LINE1);
});

// --- snapshots not re-checked ---

const snap = (source, fetched, text) => `Source: ${source}\nFetched: ${fetched}\nSHA-256: ${sha256(text)}\n---\n${text}`;

test('[HNT-2][REC-3] a served request\'s snapshot of an http(s) source is a note: fetched <date>, not re-checked, naming al record <name> origin --verify; chats, files, standard input and requests not served get none', (t) => {
  const repo = makeRepo(t);
  addRequest(repo, 'invoice-download', null);
  const origin = 'requests/invoice-download/origin';
  repo.write(`${origin}/2026-09-23-issue-31.md`, snap('https://github.com/o/r/issues/31', '2026-09-23T10:14Z', 'Please let me download a CSV.\n'));
  repo.write(`${origin}/2026-09-24-wiki.md`, snap('http://intranet.example/wiki/Invoices', '2026-09-24T08:00Z', 'Invoices page.\n'));
  repo.write(`${origin}/2026-09-22-call-notes.md`, snap('docs/call-notes.txt', '2026-09-22T09:00Z', 'Call notes.\n'));
  addRequest(repo, 'csv-rows', null);
  repo.write('requests/csv-rows/origin/2026-09-25-issue-40.md', snap('https://github.com/o/r/issues/40', '2026-09-25T10:00Z', 'Rows, please.\n'));
  repo.commit('Records', { date: '2026-09-25T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('src/export.js', 'export const rows = [];\n');
  repo.commit(message('Rows', { request: 'invoice-download', tier: '2 — rows' }), { date: '2026-09-26T12:00:00Z' });

  const out = check(repo, '--all');
  hint(out, 'note', 'not re-checked', '2026-09-23-issue-31.md', /fetched:? 2026-09-23/i, 'al record invoice-download origin --verify');
  hint(out, 'note', 'not re-checked', '2026-09-24-wiki.md', /fetched:? 2026-09-24/i, 'al record invoice-download origin --verify');
  for (const f of ['2026-09-22-call-notes.md', '2026-09-20-owner-words.md', '2026-09-21-signoff.md', '2026-09-25-issue-40.md']) {
    noHint(out, 'not re-checked', f);
  }
});
