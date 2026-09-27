// [REC-1] an archived request is not edited once its archiving reaches main
// (origin/main when it exists, else local main); [REC-12] before that it may be.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, addOrigin, runAl, sha256 } from './helpers/fixture.js';

const ENV = { SOURCE_DATE_EPOCH: '1790206200' }; // 2026-09-23T23:30Z
const NAME = 'done-req';
const ISSUE = '# Export invoices\nPlease let me download a CSV.\n';
const EDITED = '# Export invoices\nPlease let me download a CSV or a PDF.\n';
const SNAP = '2026-09-20-issue.md';

function writeRequest(repo, base) {
  repo.write(`${base}/request.md`,
    "# Done request\nTier: 1 · Status: concluded\n\n## Owner's words and dialog\n\n- 2026-09-20 issue, snapshot origin/2026-09-20-issue.md\n");
  repo.write(`${base}/origin/${SNAP}`,
    `Source: https://example.com/issue\nFetched: 2026-09-20T09:00Z\nSHA-256: ${sha256(ISSUE)}\n---\n${ISSUE}`);
}

// The request open on main, then moved to archive/ in a second commit on the current branch.
function archivedOnBranch(t, branch) {
  const repo = makeRepo(t);
  writeRequest(repo, `requests/${NAME}`);
  repo.commit('open request', { date: '2026-09-20T10:00:00Z' });
  if (branch !== 'main') repo.git(['checkout', '-q', '-b', branch]);
  archive(repo);
  repo.commit('archive request', { date: '2026-09-21T10:00:00Z' });
  return repo;
}

function archive(repo) {
  mkdirSync(join(repo.dir, 'requests/archive'), { recursive: true });
  repo.git(['mv', `requests/${NAME}`, `requests/archive/${NAME}`]);
}

const archivedOrigin = (repo) => readdirSync(join(repo.dir, `requests/archive/${NAME}/origin`));
const URL_ARGS = ['record', NAME, 'origin', '--url', 'https://example.com/other', '--from', '-', '--fetched', '2026-09-25T08:05Z'];
const VERIFY_ARGS = ['record', NAME, 'origin', '--verify', SNAP, '--from', '-', '--fetched', '2026-09-25T08:05Z'];

function assertRefused(repo, r) {
  assert.equal(r.code, 2, r.stdout + r.stderr);
  const out = r.stdout + r.stderr;
  assert.ok(out.includes(NAME), `should name the request:\n${out}`);
  assert.match(out, /archived/i, `should say it is archived:\n${out}`);
  assert.deepEqual(archivedOrigin(repo), [SNAP], 'nothing written');
  assert.equal(repo.git(['status', '--porcelain']), '', 'nothing written');
}

test('[REC-1] archived on local main (no remote): record origin --url exits 2 and writes nothing, with or without --yes', (t) => {
  const repo = archivedOnBranch(t, 'main');
  assertRefused(repo, runAl(repo.dir, [...URL_ARGS, '--yes'], { input: EDITED, env: ENV }));
  assertRefused(repo, runAl(repo.dir, URL_ARGS, { input: EDITED, env: ENV }));
});

test('[REC-1] archived on local main (no remote): record origin --verify with changed text exits 2 and writes nothing, with or without --yes', (t) => {
  const repo = archivedOnBranch(t, 'main');
  assertRefused(repo, runAl(repo.dir, [...VERIFY_ARGS, '--yes'], { input: EDITED, env: ENV }));
  assertRefused(repo, runAl(repo.dir, VERIFY_ARGS, { input: EDITED, env: ENV }));
});

test('[REC-1] archived on origin/main but not on local main: record origin exits 2 and writes nothing', (t) => {
  const repo = archivedOnBranch(t, 'main');
  const open = repo.git(['rev-parse', 'HEAD~1']);
  addOrigin(t, repo, { fetchedAt: '2026-09-22T10:00:00Z' });
  // Work on a branch holding the archive; local main moved back before it.
  repo.git(['checkout', '-q', '-b', 'feature']);
  repo.git(['branch', '-f', 'main', open]);
  assert.equal(repo.git(['ls-tree', '--name-only', 'main', 'requests/']), `requests/${NAME}`);
  assertRefused(repo, runAl(repo.dir, [...URL_ARGS, '--yes'], { input: EDITED, env: ENV }));
  assertRefused(repo, runAl(repo.dir, [...VERIFY_ARGS, '--yes'], { input: EDITED, env: ENV }));
});

test('[REC-12] archived only on a feature branch, not on main: record origin --yes may still write (exit 0)', (t) => {
  const repo = archivedOnBranch(t, 'feature');
  const r = runAl(repo.dir, [...URL_ARGS, '--yes'], { input: EDITED, env: ENV });
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const files = archivedOrigin(repo);
  assert.equal(files.length, 2, files.join(', '));
  const v = runAl(repo.dir, [...VERIFY_ARGS, '--yes'], { input: EDITED, env: ENV });
  assert.equal(v.code, 0, v.stdout + v.stderr);
  assert.equal(archivedOrigin(repo).length, 3);
});

test('[REC-12] archived only in the working tree (uncommitted move): record origin --yes may still write (exit 0)', (t) => {
  const repo = makeRepo(t);
  writeRequest(repo, `requests/${NAME}`);
  repo.commit('open request', { date: '2026-09-20T10:00:00Z' });
  archive(repo);
  const r = runAl(repo.dir, [...URL_ARGS, '--yes'], { input: EDITED, env: ENV });
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(archivedOrigin(repo).length, 2);
});
