import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkWorkRecords } from '../src/work-records.js';
import { categoryMapping, repository, issueWork, prerequisiteWork, prerequisitePullWork, issueSnapshot, contextBody, prerequisiteBundle, prerequisiteIssueRecord, prerequisitePrRecord, taskFile, primaryBasis, secondaryBasis, issueRecord, refKey } from './fixtures/work-records/helpers.mjs';

const clone = (value) => structuredClone(value);
const text = (value) => JSON.stringify(value);
function fixture() {
  const owner = prerequisiteBundle({ state: 'open', state_reason: null });
  owner.issue.labels = [{ name: categoryMapping['architecture-task'] }];
  owner.issue.body = contextBody({ ...prerequisiteIssueRecord, activity: 'plan', plan_items: [{ ...prerequisiteIssueRecord.plan_items[0], items: ['3.1', '3.9'] }] });
  const pull = owner.pulls[0];
  const contribution = { issue: { number: 41, state: 'closed', body: pull.body, repository_url: `https://api.github.com/repos/${repository}`, pull_request: { url: `https://api.github.com/repos/${repository}/pulls/41` } }, pulls: [pull], evidence: owner.evidence };
  const record = { ...issueRecord, depends_on: [prerequisitePullWork] };
  const sources = new Map([[refKey(primaryBasis), '## Record link status checks\n'], [refKey(secondaryBasis), '## Focused context\n']]);
  const calls = [];
  const bundles = new Map([[prerequisiteWork, owner], [prerequisitePullWork, contribution]]);
  const input = { work: issueWork, issue: issueSnapshot({ body: contextBody(record) }), categoryMapping,
    resolveRef: async (ref) => ({ content: ref.path.endsWith('tasks.md') ? `${taskFile}\n## Remaining planning\nWork Issue: [#31](https://github.com/example/consumer/issues/31)\n- [ ] 3.9 Deliver the other assigned planning contribution.\n` : sources.get(refKey(ref)) || '## Record link status checks\n\n## Focused context\n' }),
    resolveWork: async (work) => { calls.push(work); if (!bundles.has(work)) throw Object.assign(new Error(`Missing ${work}`), { code: 'record-unavailable' }); return clone(bundles.get(work)); },
  };
  return { input, record, owner, contribution, bundles, calls };
}
function setRecord(f, record) { f.input.issue.body = contextBody(record); }

test('issue36 delivery: actual PR contribution qualifies while canonical owner and remaining plan stay open', async () => {
  const f = fixture();
  const result = await checkWorkRecords(f.input);
  assert.equal(result.status, 'valid', text(result.findings));
  assert.ok(f.calls.includes(prerequisiteWork), 'canonical owner is acquired rather than synthesized');
  assert.match(text(result.context.prerequisites), /3\.9/, 'review context retains owner remaining scope');
  assert.match(text(result.context.prerequisites), /open/, 'open owner context is preserved');
  assert.equal(f.contribution.issue.state_reason, undefined, 'PR fixture has no synthetic Issue state_reason');
});

test('issue36 delivery: whole Issue dependency is incomplete after only its first planning contribution', async () => {
  const f = fixture();
  setRecord(f, { ...f.record, depends_on: [prerequisiteWork] });
  assert.notEqual((await checkWorkRecords(f.input)).status, 'valid');
  f.owner.issue.state = 'closed'; f.owner.issue.state_reason = 'completed';
  const closed = await checkWorkRecords(f.input);
  assert.notEqual(closed.status, 'valid');
  assert.match(text(closed.findings), /delivery-plan-uncovered/);
});

test('issue36 delivery: ordinary complete Issue prerequisite remains valid', async () => {
  const f = fixture();
  f.bundles.set(prerequisiteWork, prerequisiteBundle());
  setRecord(f, { ...f.record, depends_on: [prerequisiteWork] });
  const result = await checkWorkRecords(f.input);
  assert.equal(result.status, 'valid', text(result.findings));
});

for (const variant of ['unmerged', 'cancelled', 'missing', 'unrelated', 'foreign-task', 'stale-head', 'stale-base-ref', 'missing-review', 'revise-review', 'same-session', 'missing-merge']) {
  test(`issue36 delivery: PR prerequisite rejects ${variant}`, async () => {
    const f = fixture();
    const pr = f.contribution.pulls[0];
    const evidence = f.contribution.evidence[0].record;
    if (variant === 'unmerged' || variant === 'cancelled') { pr.merged = false; pr.merged_at = null; pr.merge_commit_sha = null; pr.state = variant === 'unmerged' ? 'open' : 'closed'; }
    if (variant === 'missing') f.bundles.delete(prerequisitePullWork);
    if (variant === 'missing-merge') pr.merge_commit_sha = null;
    if (variant === 'unrelated' || variant === 'foreign-task') {
      const record = clone(prerequisitePrRecord);
      if (variant === 'unrelated') record.issues = [issueWork];
      else record.plan_items[0].items = ['3.2'];
      pr.body = contextBody(record); f.contribution.issue.body = pr.body;
    }
    if (variant === 'stale-head') evidence.head = 'a'.repeat(40);
    if (variant === 'stale-base-ref') evidence.base_ref = 'other';
    if (variant === 'missing-review') f.contribution.evidence = [];
    if (variant === 'revise-review') evidence.result = 'revise';
    if (variant === 'same-session') evidence.reviewer_session = evidence.producer_session;
    const result = await checkWorkRecords(f.input);
    assert.notEqual(result.status, 'valid', text(result.findings));
  });
}

test('issue36 delivery: mixed Issue to PR to canonical owner dependency cycle is detected', async () => {
  const f = fixture();
  const ownerRecord = clone(prerequisiteIssueRecord);
  f.owner.issue.labels = [{ name: categoryMapping.task }];
  ownerRecord.depends_on = [issueWork.toUpperCase()];
  f.owner.issue.body = contextBody(ownerRecord);
  f.owner.issue.state = 'closed'; f.owner.issue.state_reason = 'completed';
  f.bundles.set(issueWork, { issue: f.input.issue, pulls: [], evidence: [] });
  const result = await checkWorkRecords(f.input);
  assert.notEqual(result.status, 'valid');
  assert.match(text(result.findings), /dependency-cycle/, 'one normalized graph must report the compound cycle');
});

test('issue36 delivery: forbidden canonical prerequisite source remains unavailable', async () => {
  const f = fixture();
  const original = f.input.resolveRef;
  f.input.resolveRef = async (ref, context) => {
    if (context.work === prerequisitePullWork) throw Object.assign(new Error('Scoped PR source denied'), { code: 'reference-out-of-scope' });
    return original(ref, context);
  };
  const result = await checkWorkRecords(f.input);
  assert.notEqual(result.status, 'valid');
  assert.match(text(result.findings), /reference-out-of-scope/);
});
