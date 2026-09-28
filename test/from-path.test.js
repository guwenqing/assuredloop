// [TL-1] `new --from <file>`, `record origin --from <file>` and `--verify <file>`
// take a file as the shell gives it: an absolute path, or a path relative to
// the current directory, as well as `-` for standard input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, runAl, sha256, tempDir } from './helpers/fixture.js';
import { assertFrame } from './helpers/output.js';

const ENV = { SOURCE_DATE_EPOCH: '1790206200', TZ: 'Asia/Tokyo' }; // 2026-09-23T23:30Z
const WORDS = 'Customers keep asking to download their invoices.\r\nCSV, ünïcode ✓\n\nno newline at end';
const URL_31 = 'https://github.com/o/r/issues/31';
const ISSUE = '# Export invoices\n\nPlease let me download a CSV.\r\nThanks ✓';
const SNAP = '2026-09-23-issue-31.md';
const ORIGIN = 'requests/invoice-download/origin';

// The three ways to hand over WORDS: where to run, what to pass to --from,
// and what to feed on standard input.
const FORMS = {
  'an absolute path outside the repo': (t, repo) => {
    const file = join(tempDir(t), 'words.txt');
    writeFileSync(file, WORDS);
    return { cwd: repo.dir, from: file };
  },
  'a path relative to the subfolder it runs in': (t, repo) => {
    repo.write('sub/notes/words.txt', WORDS);
    assert.ok(!existsSync(join(repo.dir, 'notes/words.txt')), 'the path must not exist from the repo top');
    return { cwd: join(repo.dir, 'sub'), from: 'notes/words.txt' };
  },
  'standard input (-)': (t, repo) => ({ cwd: repo.dir, from: '-', input: WORDS }),
};

// A request written by hand, with one snapshot of ISSUE fetched 2026-09-23T10:14Z.
function requestWithSnapshot(t) {
  const repo = makeRepo(t);
  repo.write('requests/invoice-download/request.md',
    '# Customers can download invoices\nTier: 2 · Status: open\n\n## Owner\'s words and dialog\n\n' +
    `- 2026-09-23 issue #31, snapshot origin/${SNAP}\n`);
  repo.write(join(ORIGIN, SNAP),
    `Source: ${URL_31}\nFetched: 2026-09-23T10:14Z\nSHA-256: ${sha256(ISSUE)}\n---\n${ISSUE}`);
  repo.commit('request invoice-download');
  return repo;
}

for (const [form, given] of Object.entries(FORMS)) {
  test(`[TL-1] new --from ${form} exits 0 and the snapshot holds the text exactly`, (t) => {
    const repo = makeRepo(t);
    const { cwd, from, input } = given(t, repo);
    const r = runAl(cwd, ['new', 'invoice-download', '--from', from], { input, env: ENV });
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const files = readdirSync(join(repo.dir, ORIGIN));
    assert.equal(files.length, 1, files.join(', '));
    const snap = repo.read(join(ORIGIN, files[0])).toString();
    assert.ok(snap.endsWith(`SHA-256: ${sha256(WORDS)}\n---\n${WORDS}`), snap);
    assertFrame(r.stdout);
  });

  test(`[TL-1] record origin --url --from ${form} --yes stores a snapshot holding the text exactly`, (t) => {
    const repo = requestWithSnapshot(t);
    const { cwd, from, input } = given(t, repo);
    const r = runAl(cwd, ['record', 'invoice-download', 'origin', '--url', 'https://example.com/spec/page',
      '--from', from, '--yes'], { input, env: ENV });
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const files = readdirSync(join(repo.dir, ORIGIN)).filter((f) => f !== SNAP);
    assert.equal(files.length, 1, files.join(', '));
    assert.equal(repo.read(join(ORIGIN, files[0])).toString(),
      `Source: https://example.com/spec/page\nFetched: 2026-09-23T23:30Z\nSHA-256: ${sha256(WORDS)}\n---\n${WORDS}`);
    assertFrame(r.stdout);
  });
}

function assertVerifiedUnchanged(t, verify) {
  const repo = requestWithSnapshot(t);
  const r = runAl(repo.dir, ['record', 'invoice-download', 'origin', '--verify', verify(repo), '--from', '-'],
    { input: ISSUE, env: ENV });
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.ok(r.stdout.includes('unchanged since 2026-09-23T10:14Z'), r.stdout);
  assertFrame(r.stdout);
  assert.deepEqual(readdirSync(join(repo.dir, ORIGIN)), [SNAP]);
  assert.equal(repo.git(['status', '--porcelain']), '');
}

test('[TL-1] record origin --verify <absolute path of a snapshot> --from - with the same text says "unchanged since"', (t) => {
  assertVerifiedUnchanged(t, (repo) => join(repo.dir, ORIGIN, SNAP));
});

test('[TL-1] record origin --verify <bare file name of a snapshot> --from - with the same text says "unchanged since"', (t) => {
  assertVerifiedUnchanged(t, () => SNAP);
});

test('[TL-1] new --from an absolute path that does not exist exits 2, names the path, and writes nothing', (t) => {
  const repo = makeRepo(t);
  const missing = join(tempDir(t), 'no-such-words.txt');
  const r = runAl(repo.dir, ['new', 'invoice-download', '--from', missing], { env: ENV });
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.ok((r.stdout + r.stderr).includes(missing), `the output should name ${missing}:\n${r.stdout}${r.stderr}`);
  assertFrame(r.stdout);
  assert.ok(!existsSync(join(repo.dir, 'requests')), 'no requests/ folder should be written');
  assert.equal(repo.git(['status', '--porcelain']), '');
});

test('[TL-1] record origin --from or --verify an absolute path that does not exist exits 2, names the path, and writes nothing', (t) => {
  const repo = requestWithSnapshot(t);
  const missingFrom = join(tempDir(t), 'no-such-fetch.txt');
  const missingSnap = join(repo.dir, ORIGIN, '2026-01-01-nope.md');
  for (const [missing, args] of [
    [missingFrom, ['--url', 'https://example.com/spec/page', '--from', missingFrom]],
    [missingSnap, ['--verify', missingSnap, '--from', '-']],
  ]) {
    const r = runAl(repo.dir, ['record', 'invoice-download', 'origin', ...args, '--yes'], { input: ISSUE, env: ENV });
    assert.equal(r.code, 2, `${missing}: ${r.stdout}${r.stderr}`);
    assert.ok((r.stdout + r.stderr).includes(missing), `the output should name ${missing}:\n${r.stdout}${r.stderr}`);
    assertFrame(r.stdout);
  }
  assert.deepEqual(readdirSync(join(repo.dir, ORIGIN)), [SNAP]);
  assert.equal(repo.git(['status', '--porcelain']), '');
});
