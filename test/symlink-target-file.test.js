// [REC-1][REC-3] the file record origin writes is never a symlink: a name with
// anything at it, a symlink included (dangling or not), is taken, and the tool
// writes a regular file at the next free name, never through the link.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symlinkSync, writeFileSync, readFileSync, readlinkSync, lstatSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, tempDir, runAl, sha256 } from './helpers/fixture.js';

const ENV = { SOURCE_DATE_EPOCH: '1790206200' }; // 2026-09-23T23:30Z
const NAME = 'req-x';
const SNAP = '2026-09-20-issue.md';
const ISSUE = '# Export invoices\nPlease let me download a CSV.\n';
const EDITED = '# Export invoices\nPlease let me download a CSV or a PDF.\n';
const REQUEST_MD = "# Request X\nTier: 1 · Status: open\n\n## Owner's words and dialog\n\n- 2026-09-20 issue, snapshot origin/2026-09-20-issue.md\n";
const SNAP_MD = `Source: https://example.com/issue\nFetched: 2026-09-20T09:00Z\nSHA-256: ${sha256(ISSUE)}\n---\n${ISSUE}`;

const URL_ARGS = ['record', NAME, 'origin', '--url', 'https://example.com/a', '--from', '-', '--fetched', '2026-09-23T23:30Z'];
const URL_NAME = '2026-09-23-example-com-a.md';
const VERIFY_ARGS = ['record', NAME, 'origin', '--verify', SNAP, '--from', '-', '--fetched', '2026-09-25T08:05Z'];
const VERIFY_NAME = '2026-09-25-example-com-issue.md';

// A real request folder. The preview (no --yes) must name `chosen`, so the link
// planted there is the file the tool would write.
function repoWithLinkAt(t, args, chosen, target) {
  const repo = makeRepo(t);
  repo.write(`requests/${NAME}/request.md`, REQUEST_MD);
  repo.write(`requests/${NAME}/origin/${SNAP}`, SNAP_MD);
  repo.commit('request');
  const preview = runAl(repo.dir, args, { input: EDITED, env: ENV });
  assert.ok(preview.stdout.includes(chosen), `the fixture expects the tool to choose ${chosen}:\n${preview.stdout}`);
  const link = join(repo.dir, 'requests', NAME, 'origin', chosen);
  symlinkSync(target, link);
  repo.commit('a link at the chosen name');
  assert.match(repo.git(['ls-files', '-s', `requests/${NAME}/origin/${chosen}`]), /^120000 /);
  return { repo, link };
}

const EXPECTED_URL = `Source: https://example.com/a\nFetched: 2026-09-23T23:30Z\nSHA-256: ${sha256(EDITED)}\n---\n${EDITED}`;
const EXPECTED_VERIFY = `Source: https://example.com/issue\nFetched: 2026-09-25T08:05Z\nSHA-256: ${sha256(EDITED)}\n---\n${EDITED}`;

// Exit 0; the link untouched; one new regular file at another name, holding
// the snapshot, and named in the output.
function assertSkippedLink(r, repo, link, target, chosen, expected) {
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.ok(lstatSync(link).isSymbolicLink(), 'the link is still a symlink');
  assert.equal(readlinkSync(link), target, 'the link still has the same target');
  const originDir = join(repo.dir, 'requests', NAME, 'origin');
  const added = readdirSync(originDir).filter((f) => f !== SNAP && f !== chosen);
  assert.equal(added.length, 1, `one new file expected: ${added.join(', ')}`);
  const file = join(originDir, added[0]);
  assert.ok(lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink(), `${added[0]} should be a regular file`);
  assert.equal(readFileSync(file, 'utf8'), expected);
  assert.ok(r.stdout.includes(added[0]), `the output should name ${added[0]}:\n${r.stdout}`);
  assert.equal(repo.git(['status', '--porcelain']), `?? requests/${NAME}/origin/${added[0]}`, 'only the new file is written');
}

test('[REC-1][REC-3] record origin --yes with a dangling symlink at the chosen name writes a regular file at the next name, nothing at the link\'s target', (t) => {
  const target = join(tempDir(t), 'missing.md');
  const { repo, link } = repoWithLinkAt(t, URL_ARGS, URL_NAME, target);
  assert.ok(!existsSync(target));
  const r = runAl(repo.dir, [...URL_ARGS, '--yes'], { input: EDITED, env: ENV });
  assertSkippedLink(r, repo, link, target, URL_NAME, EXPECTED_URL);
  assert.ok(!existsSync(target), 'nothing created at the link\'s outside target');
});

test('[REC-1][REC-3] record origin --yes with a symlink to an existing outside file at the chosen name writes a regular file at the next name, the outside file unchanged', (t) => {
  const target = join(tempDir(t), 'existing.md');
  writeFileSync(target, 'outside content\n');
  const { repo, link } = repoWithLinkAt(t, URL_ARGS, URL_NAME, target);
  const r = runAl(repo.dir, [...URL_ARGS, '--yes'], { input: EDITED, env: ENV });
  assertSkippedLink(r, repo, link, target, URL_NAME, EXPECTED_URL);
  assert.equal(readFileSync(target, 'utf8'), 'outside content\n');
});

test('[REC-1][REC-3] --verify --yes with changed text and a dangling symlink at the new snapshot\'s name writes a regular file at the next name, nothing at the link\'s target', (t) => {
  const target = join(tempDir(t), 'missing.md');
  const { repo, link } = repoWithLinkAt(t, VERIFY_ARGS, VERIFY_NAME, target);
  const r = runAl(repo.dir, [...VERIFY_ARGS, '--yes'], { input: EDITED, env: ENV });
  assertSkippedLink(r, repo, link, target, VERIFY_NAME, EXPECTED_VERIFY);
  assert.ok(!existsSync(target), 'nothing created at the link\'s outside target');
});
