// al record <name> origin: store a snapshot, verify a re-fetch [REC-3], C7.
// It shows what it would write, and writes only with --yes [TL-1].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, runAl, sha256 } from './helpers/fixture.js';
import { assertFrame, assertNotOk } from './helpers/output.js';

const ENV = { SOURCE_DATE_EPOCH: '1790206200', TZ: 'Asia/Tokyo' }; // 2026-09-23T23:30Z
const URL_31 = 'https://github.com/o/r/issues/31';
const ISSUE = '# Export invoices\n\nPlease let me download a CSV.\r\nThanks ✓';
const ISSUE_EDITED = '# Export invoices\n\nPlease let me download a CSV or a PDF.\r\nThanks ✓';

// A request written by hand, with one snapshot of ISSUE fetched 2026-09-23T10:14Z.
function requestWithSnapshot(t) {
  const repo = makeRepo(t);
  repo.write('requests/invoice-download/request.md',
    '# Customers can download invoices\nTier: 2 · Status: open\n\n## Owner\'s words and dialog\n\n' +
    '- 2026-09-23 issue #31, snapshot origin/2026-09-23-issue-31.md\n');
  repo.write('requests/invoice-download/origin/2026-09-23-issue-31.md',
    `Source: ${URL_31}\nFetched: 2026-09-23T10:14Z\nSHA-256: ${sha256(ISSUE)}\n---\n${ISSUE}`);
  repo.commit('request invoice-download');
  return repo;
}

const originDir = (repo) => join(repo.dir, 'requests/invoice-download/origin');
const OLD = 'requests/invoice-download/origin/2026-09-23-issue-31.md';

const added = (repo) => readdirSync(originDir(repo)).filter((f) => f !== '2026-09-23-issue-31.md');
const UPDATED = '2026-09-27T08:13:48-04:00';
const EXPECTED_NEW = 'Source: https://example.com/spec/page\n' +
  'Fetched: 2026-09-25T08:05Z\n' +
  `Target updated: ${UPDATED}\n` +
  `SHA-256: ${sha256(ISSUE_EDITED)}\n` +
  '---\n' +
  ISSUE_EDITED;
const URL_ARGS = ['record', 'invoice-download', 'origin', '--url', 'https://example.com/spec/page',
  '--from', '-', '--fetched', '2026-09-25T08:05Z', '--updated', UPDATED];

test('[TL-1][REC-3] record origin --url without --yes prints the path and the exact snapshot, and writes nothing', (t) => {
  const repo = requestWithSnapshot(t);
  const r = runAl(repo.dir, URL_ARGS, { input: ISSUE_EDITED, env: ENV });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /origin\/2026-09-25-\S+\.md/);
  assert.ok(r.stdout.includes(EXPECTED_NEW), `stdout should show the snapshot:\n${r.stdout}`);
  assert.deepEqual(added(repo), []);
  assert.equal(repo.git(['status', '--porcelain']), '');
  assertFrame(r.stdout);
});

test('[TL-1][REC-3] record origin --url --yes writes the exact snapshot, Target updated as given, and prints the same', (t) => {
  const repo = requestWithSnapshot(t);
  const r = runAl(repo.dir, [...URL_ARGS, '--yes'], { input: ISSUE_EDITED, env: ENV });
  assert.equal(r.code, 0, r.stderr);
  const files = added(repo);
  assert.equal(files.length, 1, files.join(', '));
  assert.match(files[0], /^2026-09-25-.+\.md$/);
  assert.equal(repo.read(join('requests/invoice-download/origin', files[0])).toString(), EXPECTED_NEW);
  assert.ok(r.stdout.includes(files[0]), `stdout should name ${files[0]}:\n${r.stdout}`);
  assert.ok(r.stdout.includes(EXPECTED_NEW), `stdout should show the snapshot:\n${r.stdout}`);
  assertFrame(r.stdout);
});

test('[REC-3][TL-2] record origin without --fetched stamps SOURCE_DATE_EPOCH, and without --updated has no Target updated line', (t) => {
  const repo = requestWithSnapshot(t);
  repo.write('fetched.txt', ISSUE_EDITED);
  const r = runAl(repo.dir, ['record', 'invoice-download', 'origin', '--url', 'chat with the owner',
    '--from', 'fetched.txt', '--yes'], { env: ENV });
  assert.equal(r.code, 0, r.stderr);
  const files = added(repo);
  assert.equal(files.length, 1, files.join(', '));
  assert.match(files[0], /^2026-09-23-.+\.md$/);
  assert.equal(repo.read(join('requests/invoice-download/origin', files[0])).toString(),
    `Source: chat with the owner\nFetched: 2026-09-23T23:30Z\nSHA-256: ${sha256(ISSUE_EDITED)}\n---\n${ISSUE_EDITED}`);
});

test('[REC-3] record origin never overwrites: the same source on the same date gets a second file', (t) => {
  const repo = requestWithSnapshot(t);
  const args = ['record', 'invoice-download', 'origin', '--url', URL_31, '--from', '-', '--fetched', '2026-09-23T12:00Z', '--yes'];
  assert.equal(runAl(repo.dir, args, { input: ISSUE_EDITED, env: ENV }).code, 0);
  assert.equal(runAl(repo.dir, args, { input: 'third text', env: ENV }).code, 0);
  const files = readdirSync(originDir(repo));
  assert.equal(files.length, 3, files.join(', '));
  assert.equal(repo.read(OLD).toString(),
    `Source: ${URL_31}\nFetched: 2026-09-23T10:14Z\nSHA-256: ${sha256(ISSUE)}\n---\n${ISSUE}`);
  const bodies = files.map((f) => repo.read(join('requests/invoice-download/origin', f)).toString());
  assert.ok(bodies.some((b) => b.endsWith('---\n' + ISSUE_EDITED)));
  assert.ok(bodies.some((b) => b.endsWith('---\nthird text')));
});

test('[REC-1][REC-3] record origin on an unknown request exits 2 and writes nothing, even with --yes', (t) => {
  const repo = requestWithSnapshot(t);
  const r = runAl(repo.dir, ['record', 'no-such-request', 'origin', '--url', URL_31, '--from', '-', '--yes'], { input: ISSUE, env: ENV });
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.ok(!existsSync(join(repo.dir, 'requests/no-such-request')));
});

test('[REC-3] record origin with empty text, or with neither --url nor --verify, exits 2 and writes nothing, even with --yes', (t) => {
  const repo = requestWithSnapshot(t);
  assert.equal(runAl(repo.dir, ['record', 'invoice-download', 'origin', '--url', URL_31, '--from', '-', '--yes'], { input: '', env: ENV }).code, 2);
  assert.equal(runAl(repo.dir, ['record', 'invoice-download', 'origin', '--from', '-', '--yes'], { input: ISSUE, env: ENV }).code, 2);
  assert.deepEqual(readdirSync(originDir(repo)), ['2026-09-23-issue-31.md']);
});

test('C7 [REC-3] --verify with the same text says "unchanged since" the snapshot\'s Fetched, and writes nothing, with or without --yes', (t) => {
  const repo = requestWithSnapshot(t);
  const args = ['record', 'invoice-download', 'origin', '--verify', '2026-09-23-issue-31.md', '--from', '-', '--fetched', '2026-09-26T09:00Z'];
  for (const extra of [[], ['--yes']]) {
    const r = runAl(repo.dir, [...args, ...extra], { input: ISSUE, env: ENV });
    assert.equal(r.code, 0, r.stderr);
    assert.ok(r.stdout.includes('unchanged since 2026-09-23T10:14Z'), r.stdout);
    assert.ok(!r.stdout.includes('not ok'), r.stdout);
    assertFrame(r.stdout);
  }
  assert.deepEqual(readdirSync(originDir(repo)), ['2026-09-23-issue-31.md']);
  assert.equal(repo.git(['status', '--porcelain']), '');
});

test('C7 [REC-3] --verify takes a path to the snapshot as well as its file name', (t) => {
  const repo = requestWithSnapshot(t);
  const r = runAl(repo.dir, ['record', 'invoice-download', 'origin', '--verify', OLD, '--from', '-'], { input: ISSUE, env: ENV });
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.stdout.includes('unchanged since 2026-09-23T10:14Z'), r.stdout);
});

const VERIFY_CHANGED = ['record', 'invoice-download', 'origin', '--verify', '2026-09-23-issue-31.md',
  '--from', '-', '--fetched', '2026-09-26T09:00Z', '--updated', UPDATED];
const EXPECTED_REFETCH = `Source: ${URL_31}\nFetched: 2026-09-26T09:00Z\nTarget updated: ${UPDATED}\n` +
  `SHA-256: ${sha256(ISSUE_EDITED)}\n---\n${ISSUE_EDITED}`;

function assertChanged(stdout) {
  assert.match(stdout, /(^|[^n])changed/);
  assert.ok(!stdout.includes('unchanged'), stdout);
  assert.ok(!stdout.includes('not ok'), stdout);
}

test('C7 [TL-1] --verify with different text says "changed" and shows the new snapshot, but without --yes writes nothing', (t) => {
  const repo = requestWithSnapshot(t);
  const r = runAl(repo.dir, VERIFY_CHANGED, { input: ISSUE_EDITED, env: ENV });
  assert.equal(r.code, 0, r.stderr);
  assertChanged(r.stdout);
  assert.ok(r.stdout.includes(EXPECTED_REFETCH), `stdout should show the new snapshot:\n${r.stdout}`);
  assert.deepEqual(added(repo), []);
  assert.equal(repo.git(['status', '--porcelain']), '');
  assertFrame(r.stdout);
});

test('C7 [REC-3] --verify --yes with different text says "changed", appends a snapshot with the same Source, keeps the old one byte-identical', (t) => {
  const repo = requestWithSnapshot(t);
  const before = repo.read(OLD);
  const r = runAl(repo.dir, [...VERIFY_CHANGED, '--yes'], { input: ISSUE_EDITED, env: ENV });
  assert.equal(r.code, 0, r.stderr);
  assertChanged(r.stdout);
  assert.ok(repo.read(OLD).equals(before), 'old snapshot must stay byte-identical');
  const files = added(repo);
  assert.equal(files.length, 1, files.join(', '));
  assert.match(files[0], /^2026-09-26-.+\.md$/);
  assert.equal(repo.read(join('requests/invoice-download/origin', files[0])).toString(), EXPECTED_REFETCH);
  assert.ok(r.stdout.includes(files[0]), `stdout should name ${files[0]}:\n${r.stdout}`);
  assertFrame(r.stdout);
});

test('C7 [REC-3] --verify against a snapshot whose own text was tampered reports "not ok" naming it', (t) => {
  const repo = requestWithSnapshot(t);
  // Same header and recorded hash, one character of the text changed.
  repo.write(OLD, `Source: ${URL_31}\nFetched: 2026-09-23T10:14Z\nSHA-256: ${sha256(ISSUE)}\n---\n${ISSUE.replace('CSV', 'CSW')}`);
  const r = runAl(repo.dir, ['record', 'invoice-download', 'origin', '--verify', '2026-09-23-issue-31.md',
    '--from', '-', '--fetched', '2026-09-26T09:00Z'], { input: ISSUE, env: ENV });
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.stdout.includes('unchanged since 2026-09-23T10:14Z'), r.stdout);
  assertNotOk(r.stdout, '2026-09-23-issue-31.md');
});

test('[REC-3] --verify of a snapshot that does not exist exits 2 and writes nothing', (t) => {
  const repo = requestWithSnapshot(t);
  const r = runAl(repo.dir, ['record', 'invoice-download', 'origin', '--verify', '2026-01-01-nope.md', '--from', '-', '--yes'], { input: ISSUE, env: ENV });
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.deepEqual(readdirSync(originDir(repo)), ['2026-09-23-issue-31.md']);
});
