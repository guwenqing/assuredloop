import assert from 'node:assert/strict';
import test from 'node:test';
import { readSnapshotBatch } from '../src/github-snapshot-batch.js';

const normalized = 'example/consumer';
const observation = (resource, value, paginate = false) => ({ normalized, resource, value, paginate });
const comment = { id: 'C1', fullDatabaseId: '5600000001', body: 'Exact\r\nreview\n', repository: { nameWithOwner: normalized } };
const sha = '1'.repeat(40);
const pull = { number: 3, body: 'Assigned work', state: 'OPEN', merged: false, mergedAt: null,
  mergeCommit: null, potentialMergeCommit: { oid: sha }, changedFiles: 2,
  headRefOid: sha, headRefName: 'topic', headRepository: { nameWithOwner: normalized },
  baseRefOid: sha, baseRefName: 'main', repository: { nameWithOwner: normalized } };

test('one read-only query obtains PR and comment facts without one request per object', async () => {
  let queries = [];
  const inputs = [observation('pulls/3', { node_id: 'P3' }), observation('issues/comments/5600000001', { node_id: 'C1' })];
  const rows = await readSnapshotBatch(inputs, async query => {
    queries.push(query);
    return { data: { r0: pull, r1: comment } };
  });
  assert.equal(queries.length, 1);
  assert.match(queries[0], /^query \{/);
  assert.doesNotMatch(queries[0], /mutation/);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].value.merge_commit_sha, sha, 'open PRs use the potential merge commit, not mergeCommit');
  assert.equal(rows[1].value.id, 5600000001, 'comment IDs must not truncate to signed 32 bits');
  assert.equal(rows[1].value.body, comment.body, 'raw Markdown is not rendered or normalized');
});

test('merged PR facts use the delivered commit, including a deleted source repository', async () => {
  const rows = await readSnapshotBatch([observation('pulls/3', { node_id: 'P3' })], async () => ({ data: {
    r0: { ...pull, state: 'MERGED', merged: true, mergedAt: '2026-09-10T00:00:00Z',
      mergeCommit: { oid: '2'.repeat(40) }, headRepository: null },
  } }));
  assert.equal(rows[0].value.merge_commit_sha, '2'.repeat(40));
  assert.equal(rows[0].value.state, 'closed');
  assert.equal(rows[0].value.head.repo, null);
});

test('complete comment inventory includes new comments; incomplete pages require REST fallback', async () => {
  const input = observation('issues/3/comments', [], true);
  const marker = observation('unsupported', { node_id: 'I3' });
  const node = { number: 3, repository: { nameWithOwner: normalized }, comments: {
    totalCount: 2, pageInfo: { hasNextPage: false }, nodes: [comment, { ...comment, id: 'C2', fullDatabaseId: '5600000002', body: 'New review' }],
  } };
  const read = value => readSnapshotBatch([input, marker], async () => ({ data: { r0: { issueOrPullRequest: value } } }));
  const complete = await read(node);
  assert.equal(complete[0].value.length, 2);
  assert.equal(complete[0].value[1].body, 'New review');
  assert.deepEqual(await read({ ...node, comments: { ...node.comments, pageInfo: { hasNextPage: true } } }), []);
  assert.deepEqual(await read({ ...node, comments: { ...node.comments, totalCount: 3 } }), []);
  assert.deepEqual(await read({ ...node, comments: { ...node.comments, nodes: [comment, comment] } }), []);
});

test('wrong identity, missing nodes, failed or partial queries never become empty evidence', async () => {
  const inputs = [observation('issues/comments/5600000001', { node_id: 'C1' })];
  for (const result of [null, { data: { r0: null } }, { data: { r0: comment }, errors: [{ message: 'Denied' }] },
    { data: { r0: { ...comment, repository: { nameWithOwner: 'outside/scope' } } } },
    { data: { r0: { ...comment, fullDatabaseId: '5600000002' } } },
    { data: { r0: { ...comment, body: null } } }]) {
    assert.deepEqual(await readSnapshotBatch(inputs, async () => result), []);
  }
  assert.deepEqual(await readSnapshotBatch(inputs, async () => { throw new Error('Unavailable'); }), []);
});

test('closed unmerged PRs and absent bodies retain REST representation checks', async () => {
  const input = [observation('pulls/3', { node_id: 'P3' })];
  for (const patch of [{ state: 'CLOSED', merged: false }, { body: '' }]) {
    assert.deepEqual(await readSnapshotBatch(input, async () => ({ data: { r0: { ...pull, ...patch } } })), []);
  }
});

test('batch bounds do not truncate the inventory or reuse a prior operation snapshot', async () => {
  const inputs = Array.from({ length: 81 }, (_, i) => observation(`pulls/${i + 1}`, { node_id: `P${i + 1}` }));
  let calls = 0;
  const request = async query => {
    calls++;
    return { data: Object.fromEntries([...query.matchAll(/(r\d+):node\(id:"P(\d+)"\)/g)]
      .map(([, alias, number]) => [alias, { ...pull, number: Number(number) }])) };
  };
  assert.equal((await readSnapshotBatch(inputs, request)).length, 81);
  assert.equal(calls, 3);
  assert.equal((await readSnapshotBatch(inputs, request)).length, 81);
  assert.equal(calls, 6);
});

test('the batch does not fetch comments already covered by an acquired list or timeline', async () => {
  const inputs = [
    observation('issues/3/comments', [], true),
    observation('issues/3/timeline', [], true),
    observation('issues/comments/5600000001', { node_id: 'C1', issue_url: 'https://api.github.com/repos/example/consumer/issues/3' }),
  ];
  let calls = 0;
  assert.deepEqual(await readSnapshotBatch(inputs, async () => { calls++; }), []);
  assert.equal(calls, 0);
});
