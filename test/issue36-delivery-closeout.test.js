import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectCloseout } from '../src/closeout.js';
import { checkWorkRecords } from '../src/work-records.js';
import { contextBody, categoryMapping, evidenceRecord, evidenceEntry, issueSnapshot, pullSnapshot } from './fixtures/work-records/helpers.mjs';

const repository = 'example/consumer';
const revision = '1'.repeat(40);
const head = '3'.repeat(40);
const change = 'first-batch-change';
const work = `${repository}#24`;
const plan = (name, items = ['3.1'], fixed = revision) => ({ repository, revision: fixed, path: `openspec/changes/${name}/tasks.md`, items });
function fixture() {
  const record = { activity: 'closeout', request: `${repository}#21`, basis: [{ repository, revision, path: `openspec/changes/${change}/proposal.md` }], plan_items: [plan(change), plan('second-batch-change')] };
  const pr = { issues: [work], change, basis: record.basis, plan_items: [plan(change)] };
  const pull = pullSnapshot({ number: 50, headSha: head, body: contextBody(pr) });
  return { repository, work, record, pull, pr, policy: { config: { repository: { openspec_root: 'openspec' } } } };
}
function updatePr(input, updates) { Object.assign(input.pr, updates); input.pull.body = contextBody(input.pr); }

test('issue36 delivery: batch closeout PR selects exactly one assigned accepted whole change', async () => {
  const input = fixture();
  const result = await selectCloseout(input);
  assert.equal(result.change, change);
  assert.deepEqual(result.delta, { repository, revision, path: `openspec/changes/${change}` });
  assert.equal(result.manifest.revision, head);
  assert.equal(result.manifest.path, `openspec/changes/${change}/acceptance-manifest.json`);
  assert.equal(input.record.change, undefined, 'aggregate Issue remains free of a mutable selector');
  assert.equal(input.record.plan_items.length, 2, 'remaining batch assignments are retained');
});

test('issue36 delivery: legacy singular Issue selector works without a PR selector', async () => {
  const input = fixture(); input.record.change = change; delete input.pr.change; input.pull.body = contextBody(input.pr);
  const result = await selectCloseout(input);
  assert.equal(result.change, change);
});

for (const variant of ['unassigned', 'ambiguous-revision', 'conflicting-selectors', 'other-change-tasks', 'unassigned-task', 'stale-task-revision', 'unrelated-owner', 'no-selector', 'override-other-change']) {
  test(`issue36 delivery: batch closeout rejects ${variant}`, async () => {
    const input = fixture();
    if (variant === 'unassigned') updatePr(input, { change: 'unassigned', plan_items: [plan('unassigned')] });
    if (variant === 'ambiguous-revision') input.record.plan_items.push(plan(change, ['3.1'], '2'.repeat(40)));
    if (variant === 'conflicting-selectors') input.record.change = 'second-batch-change';
    if (variant === 'other-change-tasks') updatePr(input, { plan_items: [plan('second-batch-change')] });
    if (variant === 'unassigned-task') updatePr(input, { plan_items: [plan(change, ['3.99'])] });
    if (variant === 'stale-task-revision') updatePr(input, { plan_items: [plan(change, ['3.1'], '2'.repeat(40))] });
    if (variant === 'unrelated-owner') updatePr(input, { issues: [`${repository}#99`] });
    if (variant === 'no-selector') { delete input.pr.change; input.pull.body = contextBody(input.pr); }
    if (variant === 'override-other-change') input.deltaRef = { repository, revision, path: 'openspec/changes/second-batch-change' };
    await assert.rejects(async () => selectCloseout(input), /change|assign|scope|select|revision|task|closeout/i);
  });
}

test('issue36 delivery: first closeout PR does not complete cumulative batch Issue obligations', async () => {
  const input = fixture();
  const pull = { ...input.pull, state: 'closed', merged: true, merged_at: '2026-09-12T10:00:00Z', merge_commit_sha: '4'.repeat(40) };
  const result = await checkWorkRecords({ work, categoryMapping, phase: 'closeout',
    issue: issueSnapshot({ number: 24, body: contextBody(input.record), state: 'closed', state_reason: 'completed', labels: [{ name: 'type:architecture-task' }] }),
    pulls: [pull], evidence: [evidenceEntry(evidenceRecord({ pr: `${repository}#50`, head, baseSha: pull.base.sha }))],
    resolveRef: async (ref) => ({ content: ref.path.endsWith('tasks.md') ? `# Tasks\n\nWork Issue: [#24](https://github.com/${repository}/issues/24)\n\n- [ ] 3.1 Close out this full change.\n` : '# Accepted proposal\n' }),
  });
  assert.equal(result.status, 'invalid');
  assert.ok(result.findings.some((finding) => finding.code === 'delivery-plan-uncovered' && finding.details.item.includes('second-batch-change')), JSON.stringify(result.findings));
});
