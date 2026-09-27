// al context <name> [--at <commit>]: the request, its snapshots checked [REC-3],
// history through git [VW-8], deterministic [TL-2].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl, sha256 } from './helpers/fixture.js';
import { assertFrame, assertNotOk, lines } from './helpers/output.js';

const WORDS = 'Customers keep asking to download their invoices.\n';
const ISSUE = '# Export invoices\n\nPlease let me download a CSV.\n';

const snap = (source, fetched, text) => `Source: ${source}\nFetched: ${fetched}\nSHA-256: ${sha256(text)}\n---\n${text}`;
const REQ = (title) => `# ${title}\nType: story · Tier: 2 · Status: open\n\n## Owner's words and dialog\n\n` +
  '- 2026-09-20 owner chat, snapshot origin/2026-09-20-owner-words.md\n';

function addRequest(repo, name, title, base = `requests/${name}`) {
  repo.write(`${base}/request.md`, REQ(title));
  repo.write(`${base}/origin/2026-09-20-owner-words.md`, snap('standard input', '2026-09-20T09:00Z', WORDS));
}

test('[REC-1][REC-3] context shows the title, tier and status, all snapshots ok, in at most 12 lines', (t) => {
  const repo = makeRepo(t);
  addRequest(repo, 'invoice-download', 'Customers can download invoices');
  repo.write('requests/invoice-download/origin/2026-09-23-issue-31.md', snap('https://github.com/o/r/issues/31', '2026-09-23T10:14Z', ISSUE));
  const r = runAl(repo.dir, ['context', 'invoice-download']);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.stdout.includes('Customers can download invoices'), r.stdout);
  assert.match(r.stdout, /tier\W{0,3}2\b/i, 'tier');
  assert.ok(r.stdout.includes('open'), r.stdout);
  assert.ok(!r.stdout.includes('not ok'), r.stdout);
  assert.ok(lines(r.stdout).length <= 12, `more than 12 lines:\n${r.stdout}`);
  assertFrame(r.stdout);
});

test('C7 [REC-3] context marks a snapshot whose text no longer matches its SHA-256 "not ok", naming it, and still exits 0', (t) => {
  const repo = makeRepo(t);
  addRequest(repo, 'invoice-download', 'Customers can download invoices');
  repo.write('requests/invoice-download/origin/2026-09-23-issue-31.md',
    `Source: https://github.com/o/r/issues/31\nFetched: 2026-09-23T10:14Z\nSHA-256: ${sha256(ISSUE)}\n---\n${ISSUE}tampered\n`);
  const r = runAl(repo.dir, ['context', 'invoice-download']);
  assert.equal(r.code, 0, r.stderr);
  assertNotOk(r.stdout, '2026-09-23-issue-31.md');
  assert.ok(!lines(r.stdout).some((l) => l.includes('not ok') && l.includes('2026-09-20-owner-words.md')), r.stdout);
  assertFrame(r.stdout);
});

test('[REC-3] context reads the existing snapshot variants: extra header lines, a comment after the hash, a "--- signed text ---" separator', (t) => {
  const repo = makeRepo(t);
  addRequest(repo, 'v1', 'AssuredLoop v1');
  const signed = '## Organized requirement\n\n### R1 One current design\nThe project MUST keep one spec.\n';
  const charter = 'AssuredLoop rebuilds AssuredLoop.\n';
  repo.write('requests/v1/origin/2026-09-27-signoff.md',
    'Source: chat with the owner, architect session\nOwner\'s words: "Signed"\nFetched: 2026-09-27T15:50Z\n' +
    `SHA-256: ${sha256(signed)}   (of the signed text below)\n--- signed text ---\n${signed}`);
  repo.write('requests/v1/origin/2026-09-26-charter.md',
    'Source: bot.yaml (charter) @ ca0482cd\nFetched: 2026-09-27T15:27Z\nTarget updated: 2026-09-27T08:13:48-04:00\n' +
    `SHA-256: ${sha256(charter)}   (of the text below)\n---\n${charter}`);
  const ok = runAl(repo.dir, ['context', 'v1']);
  assert.equal(ok.code, 0, ok.stderr);
  assert.ok(!ok.stdout.includes('not ok'), ok.stdout);

  // The same signed file with one word of the signed text changed.
  repo.write('requests/v1/origin/2026-09-27-signoff.md',
    'Source: chat with the owner, architect session\nOwner\'s words: "Signed"\nFetched: 2026-09-27T15:50Z\n' +
    `SHA-256: ${sha256(signed)}   (of the signed text below)\n--- signed text ---\n${signed.replace('MUST', 'SHOULD')}`);
  const bad = runAl(repo.dir, ['context', 'v1']);
  assert.equal(bad.code, 0, bad.stderr);
  assertNotOk(bad.stdout, '2026-09-27-signoff.md');
  assert.ok(!lines(bad.stdout).some((l) => l.includes('not ok') && l.includes('2026-09-26-charter.md')), bad.stdout);
});

test('[REC-1] context finds a concluded request in requests/archive/', (t) => {
  const repo = makeRepo(t);
  addRequest(repo, 'sessions-expiry', 'Sessions expire after a day', 'requests/archive/sessions-expiry');
  const r = runAl(repo.dir, ['context', 'sessions-expiry']);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.stdout.includes('Sessions expire after a day'), r.stdout);
  assertFrame(r.stdout);
});

test('[REC-1] context on an unknown request exits 2', (t) => {
  const repo = makeRepo(t);
  addRequest(repo, 'invoice-download', 'Customers can download invoices');
  const r = runAl(repo.dir, ['context', 'no-such-request']);
  assert.equal(r.code, 2, r.stdout + r.stderr);
});

test('[TL-2] context does not read the clock: the same repo gives identical output whatever SOURCE_DATE_EPOCH is', (t) => {
  const repo = makeRepo(t);
  addRequest(repo, 'invoice-download', 'Customers can download invoices');
  repo.commit('add request');
  const a = runAl(repo.dir, ['context', 'invoice-download']);
  const b = runAl(repo.dir, ['context', 'invoice-download'], { env: { SOURCE_DATE_EPOCH: '1790206200' } });
  const c = runAl(repo.dir, ['context', 'invoice-download'], { env: { SOURCE_DATE_EPOCH: '1893456000', TZ: 'Asia/Tokyo' } });
  assert.equal(a.code, 0, a.stderr);
  assert.equal(b.stdout, a.stdout);
  assert.equal(c.stdout, a.stdout);
});

// C1: request A with one good snapshot, title "Old title".
// C2: A gets a tampered snapshot (committed that way) and a new title; request B added.
// Working tree: A's first snapshot tampered, request C added, all uncommitted.
function history(t) {
  const repo = makeRepo(t);
  addRequest(repo, 'req-a', 'Old title');
  const c1 = repo.commit('C1', { date: '2026-09-20T10:00:00Z' });
  repo.write('requests/req-a/request.md', REQ('New title'));
  repo.write('requests/req-a/origin/2026-09-22-later.md',
    `Source: later\nFetched: 2026-09-22T10:00Z\nSHA-256: ${sha256('later text\n')}\n---\nlater text, edited\n`);
  addRequest(repo, 'req-b', 'Request B');
  const c2 = repo.commit('C2', { date: '2026-09-22T10:00:00Z' });
  repo.write('requests/req-a/origin/2026-09-20-owner-words.md', snap('standard input', '2026-09-20T09:00Z', WORDS).replace('download', 'd0wnload'));
  addRequest(repo, 'req-c', 'Request C');
  return { repo, c1, c2 };
}

test('[VW-8] context --at reads that commit\'s tree: the title as it was, and names the commit it read', (t) => {
  const { repo, c1 } = history(t);
  const r = runAl(repo.dir, ['context', 'req-a', '--at', c1]);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.stdout.includes('Old title'), r.stdout);
  assert.ok(!r.stdout.includes('New title'), r.stdout);
  assertFrame(r.stdout, { read: c1.slice(0, 7) });
});

test('[VW-8] context --at: a snapshot added after that commit is not there; one tampered only in the working tree reads ok', (t) => {
  const { repo, c1, c2 } = history(t);
  const at1 = runAl(repo.dir, ['context', 'req-a', '--at', c1]);
  assert.equal(at1.code, 0, at1.stderr);
  assert.ok(!at1.stdout.includes('not ok'), at1.stdout);
  assert.ok(!at1.stdout.includes('2026-09-22-later.md'), at1.stdout);

  const at2 = runAl(repo.dir, ['context', 'req-a', '--at', c2]);
  assert.equal(at2.code, 0, at2.stderr);
  assertNotOk(at2.stdout, '2026-09-22-later.md');
  assert.ok(!lines(at2.stdout).some((l) => l.includes('not ok') && l.includes('2026-09-20-owner-words.md')), at2.stdout);

  const now = runAl(repo.dir, ['context', 'req-a']);
  assert.equal(now.code, 0, now.stderr);
  assertNotOk(now.stdout, '2026-09-20-owner-words.md');
  assert.ok(now.stdout.includes('New title'), now.stdout);
});

test('[VW-8] context --at: a request added after that commit is unknown (exit 2); uncommitted requests are ignored', (t) => {
  const { repo, c1, c2 } = history(t);
  assert.equal(runAl(repo.dir, ['context', 'req-b', '--at', c1]).code, 2);
  const b2 = runAl(repo.dir, ['context', 'req-b', '--at', c2]);
  assert.equal(b2.code, 0, b2.stderr);
  assert.ok(b2.stdout.includes('Request B'), b2.stdout);
  assert.equal(runAl(repo.dir, ['context', 'req-c', '--at', c2]).code, 2);
  const cNow = runAl(repo.dir, ['context', 'req-c']);
  assert.equal(cNow.code, 0, cNow.stderr);
  assert.ok(cNow.stdout.includes('Request C'), cNow.stdout);
});

test('[VW-8] context --at with an unknown commit exits 2', (t) => {
  const { repo } = history(t);
  assert.equal(runAl(repo.dir, ['context', 'req-a', '--at', 'no-such-ref']).code, 2);
  assert.equal(runAl(repo.dir, ['context', 'req-a', '--at', 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef']).code, 2);
});
