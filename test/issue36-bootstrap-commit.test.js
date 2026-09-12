import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createReadAdapter } from '../src/read-adapter.js';
import { git, makeGitFixture } from './fixtures/adoption/helpers.js';

const repository = 'example/bootstrap-commit-reader';
async function fixture(t) {
  const f = await makeGitFixture({ prefix: 'issue36-bootstrap-commit-', files: { 'source.txt': 'base\n' },
    remote: `https://github.com/${repository}.git` });
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const adapter = await createReadAdapter({ targetRoot: f.root, repository, localOnly: true });
  return { ...f, adapter };
}

test('bootstrap commit acquisition returns actual root tree and actual fixed child parent', async (t) => {
  const f = await fixture(t);
  const initialTree = (await git(f.root, ['rev-parse', `${f.revision}^{tree}`])).stdout.trim();
  const initial = await f.adapter.readCommit({ repository, revision: f.revision });
  assert.deepEqual(initial, { sha: f.revision, tree: { sha: initialTree }, parents: [] });
  await writeFile(path.join(f.root, 'source.txt'), 'reviewed bootstrap contribution\n');
  await git(f.root, ['add', 'source.txt']);
  await git(f.root, ['commit', '-q', '-m', 'synthetic bootstrap contribution']);
  const child = (await git(f.root, ['rev-parse', 'HEAD'])).stdout.trim();
  const childTree = (await git(f.root, ['rev-parse', `${child}^{tree}`])).stdout.trim();
  assert.deepEqual(await f.adapter.readCommit({ repository, revision: child }),
    { sha: child, tree: { sha: childTree }, parents: [{ sha: f.revision }] });
  assert.notEqual(childTree, initialTree);
  assert.deepEqual(await f.adapter.readCommit({ repository, revision: f.revision }), initial,
    'advancing the checkout cannot retarget a fixed historical commit');
});

test('bootstrap commit acquisition rejects mutable refs, blob objects and unavailable revisions', async (t) => {
  const f = await fixture(t);
  const blob = (await git(f.root, ['rev-parse', `${f.revision}:source.txt`])).stdout.trim();
  for (const revision of ['main', 'HEAD', blob, 'f'.repeat(40)]) {
    await assert.rejects(f.adapter.readCommit({ repository, revision }),
      (error) => ['binding-invalid', 'record-unavailable'].includes(error.code), revision);
  }
});

test('bootstrap commit acquisition enforces repository scope even for a locally available SHA', async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.adapter.readCommit({ repository: 'forbidden/private', revision: f.revision }),
    (error) => error.code === 'reference-out-of-scope');
});
