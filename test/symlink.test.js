// [REC-1][REC-3] records are written only inside requests/<name>/ in this repo:
// `new` and `record origin` do not write through a symlink that leads out of it
// (`requests`, `requests/<name>` or `requests/<name>/origin`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symlinkSync, mkdirSync, writeFileSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, tempDir, runAl, sha256 } from './helpers/fixture.js';
import { lines } from './helpers/output.js';

const ENV = { SOURCE_DATE_EPOCH: '1790206200' }; // 2026-09-23T23:30Z
const NAME = 'req-x';
const SNAP = '2026-09-20-issue.md';
const ISSUE = '# Export invoices\nPlease let me download a CSV.\n';
const EDITED = '# Export invoices\nPlease let me download a CSV or a PDF.\n';
const REQUEST_MD = "# Request X\nTier: 1 · Status: open\n\n## Owner's words and dialog\n\n- 2026-09-20 issue, snapshot origin/2026-09-20-issue.md\n";
const SNAP_MD = `Source: https://example.com/issue\nFetched: 2026-09-20T09:00Z\nSHA-256: ${sha256(ISSUE)}\n---\n${ISSUE}`;

const URL_ARGS = ['record', NAME, 'origin', '--url', 'https://example.com/other', '--from', '-', '--fetched', '2026-09-25T08:05Z', '--yes'];
const VERIFY_ARGS = ['record', NAME, 'origin', '--verify', SNAP, '--from', '-', '--fetched', '2026-09-25T08:05Z', '--yes'];

function write(path, content) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

// Every file under `dir` with its content, to compare before and after.
function tree(dir) {
  const out = {};
  for (const e of readdirSync(dir, { recursive: true })) {
    const p = join(dir, e);
    if (statSync(p).isFile()) out[e] = readFileSync(p, 'utf8');
  }
  return out;
}

function assertLinkCommitted(repo, path) {
  const entry = repo.git(['ls-files', '-s', path]);
  assert.match(entry, /^120000 /, `${path} should be committed as a symlink: ${entry}`);
}

function assertRefused(r, repo, outside, before) {
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.deepEqual(tree(outside), before, 'nothing written outside the repo');
  assert.equal(repo.git(['status', '--porcelain']), '', 'nothing written in the repo');
  const ls = lines(r.stdout);
  assert.match(ls.at(-2) ?? '', /^Next/, r.stdout);
  assert.match(ls.at(-1) ?? '', /^Not known/, r.stdout);
}

test('[REC-1][REC-3] record origin --yes refuses when `requests` is a symlink out of the repo: exit 2, nothing written', (t) => {
  const outside = tempDir(t);
  write(join(outside, NAME, 'request.md'), REQUEST_MD);
  write(join(outside, NAME, 'origin', SNAP), SNAP_MD);
  const repo = makeRepo(t);
  symlinkSync(outside, join(repo.dir, 'requests'));
  repo.commit('requests is a link');
  assertLinkCommitted(repo, 'requests');
  const before = tree(outside);
  assertRefused(runAl(repo.dir, URL_ARGS, { input: EDITED, env: ENV }), repo, outside, before);
});

test('[REC-1][REC-3] record origin --yes refuses when `requests/<name>` is a symlink out of the repo: exit 2, nothing written', (t) => {
  const outside = tempDir(t);
  write(join(outside, 'request.md'), REQUEST_MD);
  write(join(outside, 'origin', SNAP), SNAP_MD);
  const repo = makeRepo(t);
  mkdirSync(join(repo.dir, 'requests'));
  symlinkSync(outside, join(repo.dir, 'requests', NAME));
  repo.commit('requests/req-x is a link');
  assertLinkCommitted(repo, `requests/${NAME}`);
  const before = tree(outside);
  assertRefused(runAl(repo.dir, URL_ARGS, { input: EDITED, env: ENV }), repo, outside, before);
});

test('[REC-1][REC-3] record origin --yes and --verify --yes refuse when `requests/<name>/origin` is a symlink out of the repo', (t) => {
  const outside = tempDir(t);
  write(join(outside, SNAP), SNAP_MD);
  const repo = makeRepo(t);
  repo.write(`requests/${NAME}/request.md`, REQUEST_MD);
  symlinkSync(outside, join(repo.dir, 'requests', NAME, 'origin'));
  repo.commit('origin is a link');
  assertLinkCommitted(repo, `requests/${NAME}/origin`);
  const before = tree(outside);
  assertRefused(runAl(repo.dir, URL_ARGS, { input: EDITED, env: ENV }), repo, outside, before);
  assertRefused(runAl(repo.dir, VERIFY_ARGS, { input: EDITED, env: ENV }), repo, outside, before);
});

test('[REC-1] new refuses when `requests` is a symlink out of the repo: exit 2, nothing created outside', (t) => {
  const outside = tempDir(t);
  write(join(outside, 'other-req', 'request.md'), '# Other\n');
  const repo = makeRepo(t);
  symlinkSync(outside, join(repo.dir, 'requests'));
  repo.commit('requests is a link');
  assertLinkCommitted(repo, 'requests');
  const before = tree(outside);
  const r = runAl(repo.dir, ['new', 'brand-new', '--from', '-'], { input: 'words\n', env: ENV });
  assertRefused(r, repo, outside, before);
  assert.deepEqual(readdirSync(outside), ['other-req']);
});

test('[REC-1][REC-3] contrast: with plain folders, record origin --yes and new still write (exit 0)', (t) => {
  const repo = makeRepo(t);
  repo.write(`requests/${NAME}/request.md`, REQUEST_MD);
  repo.write(`requests/${NAME}/origin/${SNAP}`, SNAP_MD);
  repo.commit('plain request');
  const r = runAl(repo.dir, URL_ARGS, { input: EDITED, env: ENV });
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(readdirSync(join(repo.dir, 'requests', NAME, 'origin')).length, 2);
  const v = runAl(repo.dir, VERIFY_ARGS, { input: EDITED, env: ENV });
  assert.equal(v.code, 0, v.stdout + v.stderr);
  assert.equal(readdirSync(join(repo.dir, 'requests', NAME, 'origin')).length, 3);
  const n = runAl(repo.dir, ['new', 'brand-new', '--from', '-'], { input: 'words\n', env: ENV });
  assert.equal(n.code, 0, n.stdout + n.stderr);
  assert.ok(readdirSync(join(repo.dir, 'requests', 'brand-new', 'origin')).length === 1);
});

test('[REC-1][REC-3] record origin --yes refuses when `requests/<name>` links out to a folder with no origin/: nothing created outside', (t) => {
  const outside = tempDir(t);
  write(join(outside, 'request.md'), REQUEST_MD);
  const repo = makeRepo(t);
  mkdirSync(join(repo.dir, 'requests'));
  symlinkSync(outside, join(repo.dir, 'requests', 'req-y'));
  repo.commit('requests/req-y is a link');
  assertLinkCommitted(repo, 'requests/req-y');
  const before = tree(outside);
  const r = runAl(repo.dir, ['record', 'req-y', 'origin', '--url', 'https://example.com/other', '--from', '-',
    '--fetched', '2026-09-25T08:05Z', '--yes'], { input: EDITED, env: ENV });
  assertRefused(r, repo, outside, before);
  assert.deepEqual(readdirSync(outside), ['request.md'], 'no origin/ folder created outside');
});
