// [REC-1][REC-3][SPC-2] the tool writes only through real folders: no path
// component from the repo top down to the file it writes may be a symlink,
// even one whose target stays inside the repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symlinkSync, readdirSync, readFileSync, readlinkSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, runAl, sha256 } from './helpers/fixture.js';
import { lines } from './helpers/output.js';

const ENV = { SOURCE_DATE_EPOCH: '1790206200' }; // 2026-09-23T23:30Z
const SNAP = '2026-09-20-issue.md';
const ISSUE = '# Export invoices\nPlease let me download a CSV.\n';
const EDITED = '# Export invoices\nPlease let me download a CSV or a PDF.\n';
const REQUEST_MD = "# Other request\nTier: 1 · Status: open\n\n## Owner's words and dialog\n\n- 2026-09-20 issue, snapshot origin/2026-09-20-issue.md\n";
const SNAP_MD = `Source: https://example.com/issue\nFetched: 2026-09-20T09:00Z\nSHA-256: ${sha256(ISSUE)}\n---\n${ISSUE}`;

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

function assertRefused(r, repo) {
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.equal(repo.git(['status', '--porcelain']), '', 'nothing written in the repo');
  const ls = lines(r.stdout);
  assert.match(ls.at(-2) ?? '', /^Next/, r.stdout);
  assert.match(ls.at(-1) ?? '', /^Not known/, r.stdout);
}

test('[REC-1] new refuses when `requests` is a symlink to a folder inside the repo: exit 2, nothing created', (t) => {
  const repo = makeRepo(t);
  repo.write('alternate/keep.txt', 'kept\n');
  symlinkSync('alternate', join(repo.dir, 'requests'));
  repo.commit('requests links to alternate');
  assertLinkCommitted(repo, 'requests');
  const before = tree(join(repo.dir, 'alternate'));
  const r = runAl(repo.dir, ['new', 'sample', '--from', '-'], { input: 'words\n', env: ENV });
  assertRefused(r, repo);
  assert.deepEqual(tree(join(repo.dir, 'alternate')), before);
  assert.ok(!existsSync(join(repo.dir, 'alternate', 'sample')), 'alternate/sample must not exist');
  assert.ok(!existsSync(join(repo.dir, 'requests', 'sample')), 'requests/sample must not exist');
});

// requests/other is a real request; requests/alias is a symlink to it.
function aliasRepo(t) {
  const repo = makeRepo(t);
  repo.write('requests/other/request.md', REQUEST_MD);
  repo.write(`requests/other/origin/${SNAP}`, SNAP_MD);
  symlinkSync('other', join(repo.dir, 'requests', 'alias'));
  repo.commit('alias links to other');
  assertLinkCommitted(repo, 'requests/alias');
  return repo;
}

test('[REC-1][REC-3] record origin --yes refuses a request folder that is a symlink to another request in the repo', (t) => {
  const repo = aliasRepo(t);
  const before = tree(join(repo.dir, 'requests/other'));
  const r = runAl(repo.dir, ['record', 'alias', 'origin', '--url', 'https://example.com/a', '--from', '-',
    '--fetched', '2026-09-25T08:05Z', '--yes'], { input: EDITED, env: ENV });
  assertRefused(r, repo);
  assert.deepEqual(tree(join(repo.dir, 'requests/other')), before, 'requests/other must be unchanged');
  // Contrast: the real request in the same repo can be written.
  const ok = runAl(repo.dir, ['record', 'other', 'origin', '--url', 'https://example.com/a', '--from', '-',
    '--fetched', '2026-09-25T08:05Z', '--yes'], { input: EDITED, env: ENV });
  assert.equal(ok.code, 0, ok.stdout + ok.stderr);
  assert.equal(readdirSync(join(repo.dir, 'requests/other/origin')).length, 2);
});

test('[REC-1][REC-3] record origin --verify --yes with changed text refuses the same symlinked request folder', (t) => {
  const repo = aliasRepo(t);
  const before = tree(join(repo.dir, 'requests/other'));
  const r = runAl(repo.dir, ['record', 'alias', 'origin', '--verify', SNAP, '--from', '-',
    '--fetched', '2026-09-25T08:05Z', '--yes'], { input: EDITED, env: ENV });
  assertRefused(r, repo);
  assert.deepEqual(tree(join(repo.dir, 'requests/other')), before, 'requests/other must be unchanged');
});

test('[SPC-2] --add-ids refuses a spec file that is a symlink to another spec file in the repo; the real file still numbers', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/real.md', '## Real\n');
  symlinkSync('real.md', join(repo.dir, 'specs', 'link.md'));
  repo.commit('link.md links to real.md');
  assertLinkCommitted(repo, 'specs/link.md');
  for (const extra of [[], ['--yes']]) {
    const r = runAl(repo.dir, ['spec', '--add-ids', 'specs/link.md', '--prefix', 'INV', ...extra]);
    assertRefused(r, repo);
    assert.equal(readFileSync(join(repo.dir, 'specs/real.md'), 'utf8'), '## Real\n');
    assert.equal(readlinkSync(join(repo.dir, 'specs/link.md')), 'real.md', 'the link itself is unchanged');
  }
  // Contrast: the real file is numbered.
  const ok = runAl(repo.dir, ['spec', '--add-ids', 'specs/real.md', '--prefix', 'INV', '--yes']);
  assert.equal(ok.code, 0, ok.stdout + ok.stderr);
  assert.equal(readFileSync(join(repo.dir, 'specs/real.md'), 'utf8'), '## [INV-1] Real\n');
});
