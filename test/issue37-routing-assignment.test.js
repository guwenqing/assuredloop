import assert from 'node:assert/strict';
import test from 'node:test';
import { checkReviewObligations } from '../src/review-routing.js';
import { evidence, policy } from './fixtures/issue37-records/helpers.mjs';

function fixture() {
  const accepted = policy({ routing: { primary_tool: 'codex', additional: 'required' } });
  accepted.policy_ref = { repository: 'example/consumer', revision: 'c'.repeat(40), path: 'policy/review.md' };
  const current = { pr: 'example/consumer#37', head: 'a'.repeat(40), base_ref: 'main', base_sha: 'b'.repeat(40),
    policy_ref: accepted.policy_ref, contract_package: accepted.config.project.workflow,
    config_digest: 'd'.repeat(64), activation_digest: null };
  const entry = (kind, session, commentId) => ({ ref: { repository: 'example/consumer', comment_id: commentId },
    record: evidence({ ...current, policy_mode: accepted.mode, review_kind: kind, reviewer_session: session }) });
  return { policy: accepted, current, internalA: entry('internal', 'reviewer-a', 101), internalB: entry('internal', 'reviewer-b', 102),
    externalA: entry('external', 'reviewer-a', 103), externalB: entry('external', 'reviewer-b', 104) };
}
async function assess(f, entries) {
  const before = structuredClone({ entries, policy: f.policy, current: f.current });
  const result = await checkReviewObligations({ entries, policy: f.policy, current: f.current });
  assert.deepEqual({ entries, policy: f.policy, current: f.current }, before, 'assessment must retain all input records without mutation');
  for (const entry of entries) {
    assert.ok(result.findings.some((finding) => JSON.stringify(finding.source) === JSON.stringify(entry.ref)),
      `all source declarations remain represented: ${JSON.stringify(entry.ref)}`);
  }
  const credited = [...result.qualified.internal, ...result.qualified.external];
  assert.equal(new Set(credited.map((entry) => entry.reviewer_session)).size, credited.length,
    'credited primary/additional assignments must never reuse a session');
  for (const kind of ['internal', 'external']) for (const selected of result.qualified[kind]) {
    assert.ok(entries.some((entry) => entry.record.review_kind === kind && entry.record.reviewer_session === selected.reviewer_session &&
      JSON.stringify(entry.ref) === JSON.stringify(selected.source)), 'credited assignment must retain actual source and role');
  }
  return result;
}
function satisfied(result) {
  assert.equal(result.status, 'satisfied', JSON.stringify(result));
  assert.ok(result.qualified.internal.length > 0);
  assert.ok(result.qualified.external.length > 0);
}

test('redundant internal A cannot prevent distinct internal B and external A assignment', async () => {
  const f = fixture();
  satisfied(await assess(f, [f.internalB, f.externalA]));
  const result = await assess(f, [f.internalA, f.internalB, f.externalA]);
  satisfied(result);
  assert.deepEqual(result.qualified.internal.map((item) => item.source), [f.internalB.ref]);
  assert.deepEqual(result.qualified.external.map((item) => item.source), [f.externalA.ref]);
});
test('valid distinct-session assignment is independent of input evidence order', async () => {
  const f = fixture(); const values = [f.internalA, f.internalB, f.externalA];
  for (const order of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
    satisfied(await assess(f, order.map((index) => values[index])));
  }
});
test('symmetric redundant external A still permits internal A and external B assignment', async () => {
  const f = fixture();
  for (const entries of [[f.internalA, f.externalA, f.externalB], [f.externalB, f.externalA, f.internalA], [f.externalA, f.internalA, f.externalB]]) {
    const result = await assess(f, entries); satisfied(result);
    assert.deepEqual(result.qualified.internal.map((item) => item.source), [f.internalA.ref]);
    assert.deepEqual(result.qualified.external.map((item) => item.source), [f.externalB.ref]);
  }
});
test('one shared session cannot satisfy both roles even with repeated source entries', async () => {
  const f = fixture();
  const result = await assess(f, [f.internalA, f.externalA, structuredClone(f.internalA), structuredClone(f.externalA)]);
  assert.equal(result.status, 'incomplete');
  assert.ok(!result.qualified.internal.length || !result.qualified.external.length);
});
test('duplicate same-role reviews do not manufacture the missing opposite obligation', async () => {
  const f = fixture();
  for (const [entries, missing] of [[[f.internalA, f.internalB, structuredClone(f.internalA)], 'external'],
    [[f.externalA, f.externalB, structuredClone(f.externalA)], 'internal']]) {
    const result = await assess(f, entries);
    assert.equal(result.status, 'incomplete');
    assert.equal(result.qualified[missing].length, 0);
  }
});
