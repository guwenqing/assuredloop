import assert from 'node:assert/strict';
import test from 'node:test';
import { checkWorkRecords } from '../src/work-records.js';
import {
  categoryMapping, contextBody, evidenceEntry, evidenceRecord, firstMerge,
  issueSnapshot, primaryBasis, pullSnapshot, researchRecord, workRef,
} from './fixtures/work-records/helpers.mjs';

function researchBundle(number, dependencies = []) {
  return {
    issue: issueSnapshot({ number, state: 'closed', state_reason: 'completed',
      labels: [{ name: 'type:spike' }],
      body: contextBody({ activity: 'research', request: workRef(30), basis: [primaryBasis], depends_on: dependencies.map((number) => workRef(number)) }) }),
    pulls: [], evidence: [evidenceEntry(researchRecord)],
  };
}

function fixture() {
  const bundles = new Map([
    [workRef(60), researchBundle(60, [61, 62, 71])],
    [workRef(61), researchBundle(61, [63])],
    [workRef(62), researchBundle(62, [63])],
    [workRef(63), researchBundle(63)],
  ]);
  const pull = pullSnapshot({ number: 71, merged: true, state: 'closed',
    merged_at: '2026-09-08T03:45:00Z', merge_commit_sha: firstMerge,
    body: contextBody({ issues: [workRef(70)], basis: [primaryBasis] }) });
  const owner = {
    issue: issueSnapshot({ number: 70, body: contextBody({ activity: 'deliver', request: workRef(30),
      basis: [primaryBasis], depends_on: [workRef(63)] }) }),
    pulls: [pull], evidence: [evidenceEntry(evidenceRecord({ pr: workRef(71) }))],
  };
  bundles.set(workRef(70), owner);
  bundles.set(workRef(71), { issue: { ...issueSnapshot({ number: 71 }), pull_request: {} }, pulls: [pull], evidence: owner.evidence });
  const reads = [];
  const inputs = {
    categoryMapping, assessmentCache: new Map(), scopeKey: 'current-policy-A',
    resolveWork: async (work) => structuredClone(bundles.get(work)),
    resolveRef: async (ref, { work }) => {
      reads.push(work);
      return { content: '# Record link status checks\n' };
    },
    verifyEvidence: async () => ({ valid: true }),
  };
  return { bundles, reads, inputs,
    check: (number, overrides = {}) => checkWorkRecords({ ...inputs, work: workRef(number),
      ...structuredClone(bundles.get(workRef(number))), phase: 'closeout', ...overrides }) };
}

test('shared leaf assessment is reused across diamond paths, PR owner recursion, and later closeout', async () => {
  const f = fixture();
  const result = await f.check(60);
  assert.equal(result.status, 'valid', JSON.stringify(result.findings));
  const leafContexts = result.context.prerequisites.slice(0, 2)
    .map((entry) => entry.assessment.prerequisites[0].assessment);
  const ownerLeaf = result.context.prerequisites[2].assessment.prerequisites[0].prerequisites[0].assessment;
  assert.deepEqual(leafContexts[0], leafContexts[1], 'both diamond paths retain the complete assessment context');
  assert.deepEqual(ownerLeaf, leafContexts[0], 'PR owner recursion retains the same leaf context');
  const leaf = await f.check(63);
  assert.deepEqual(leaf.context, leafContexts[0], 'subsequent closeout returns the complete preserved context');
  assert.equal(f.reads.filter((work) => work === workRef(63)).length, 1,
    'one completed leaf assessment serves all four occurrences in the same operation');
});

test('assessment reuse preserves report data without sharing mutable result objects', async () => {
  const f = fixture();
  const first = await f.check(63);
  const expected = structuredClone(first);
  first.context.issue.title = 'caller mutation';
  first.findings.length = 0;
  const second = await f.check(63);
  assert.deepEqual(second, expected);
  assert.equal(f.reads.length, 1, 'identical closeout reuses the completed assessment');
});

test('assessment contexts isolate phase, scope changes, and changed PR mappings', async () => {
  const f = fixture();
  const scope = { key: 'permission-A' };
  const scopeKey = () => scope.key;
  const initial = await f.check(70, { phase: 'handoff', scopeKey });
  assert.equal(initial.status, 'valid');
  await f.check(70, { phase: 'handoff', scopeKey });
  scope.key = 'permission-B';
  const changedScope = await f.check(70, { phase: 'handoff', scopeKey });
  assert.deepEqual(changedScope, initial);
  assert.equal(f.reads.filter((work) => work === workRef(70)).length, 2,
    'the scope callback is re-evaluated before each reuse');
  assert.equal((await f.check(70, { phase: 'handoff', evidence: [], scopeKey })).status, 'valid');
  const closeout = await f.check(70, { phase: 'closeout', evidence: [], scopeKey });
  assert.ok(closeout.findings.some((item) => item.code === 'evidence-missing'));
  assert.equal((await f.check(70, { phase: 'handoff', pulls: [], evidence: [], scopeKey })).status, 'valid');
  const contribution = await f.check(70, { phase: 'handoff', pulls: [], evidence: [], _contribution: true, scopeKey });
  assert.ok(contribution.findings.some((item) => item.code === 'delivery-unsupported'));
  const remapped = await f.check(70, { phase: 'handoff', scopeKey,
    pulls: [pullSnapshot({ number: 72, body: contextBody({ issues: [workRef(69)], basis: [primaryBasis] }) })] });
  assert.ok(remapped.findings.some((item) => item.code === 'pr-issue-mismatch'));
});

test('a completed cache entry cannot hide a cycle on the active traversal path', async () => {
  const f = fixture();
  assert.equal((await f.check(63)).status, 'valid');
  const cycle = await f.check(63, { _stack: [workRef(63)] });
  assert.equal(cycle.status, 'invalid');
  assert.ok(cycle.findings.some((item) => item.code === 'dependency-cycle'));
  const cyclic = researchBundle(64, [65]);
  f.bundles.set(workRef(64), cyclic);
  f.bundles.set(workRef(65), researchBundle(65, [64]));
  const result = await f.check(64);
  assert.equal(result.status, 'invalid');
  assert.match(JSON.stringify(result.findings), /dependency-cycle/);
});
