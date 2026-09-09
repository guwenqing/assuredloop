import assert from 'node:assert/strict';
import test from 'node:test';

import { parseWorkRecord, checkWorkRecords } from '../src/work-records.js';
import { validateRecord } from '../src/records.js';
import {
  basisPath,
  caseA,
  caseB,
  createSourceResolver,
  nativeTaskDescriptions,
  revision,
  taskRevisionFor,
  taskSourceFor,
  tasksPath,
} from './fixtures/semantic-delivery/helpers.mjs';

function findingCodes(result) {
  return result.findings.map((finding) => finding.code);
}

function parsedRecords(value) {
  return Promise.all([
    parseWorkRecord({ body: value.issue.body, kind: 'issue' }),
    parseWorkRecord({ body: value.pulls[0].body, kind: 'pr' }),
  ]);
}

test('semantic delivery fixtures contain valid Issue, PR, Evidence and immutable source references', async () => {
  const descriptions = await nativeTaskDescriptions();
  assert.ok(descriptions.some((description) => /^3\.6\b/.test(description)));

  for (const value of [caseA, caseB]) {
    const [issue, pull] = await parsedRecords(value);
    assert.equal(issue.findings.length, 0, 'Issue record must be schema-valid');
    assert.equal(pull.findings.length, 0, 'PR record must be schema-valid');
    assert.equal(validateRecord('issue', issue.record).valid, true);
    assert.equal(validateRecord('pr', pull.record).valid, true);
    assert.equal(validateRecord('evidence', value.evidence[0].record).valid, true);
    assert.equal(validateRecord('evidenceRef', value.evidence[0].ref).valid, true);
    assert.equal(value.issue.state, 'closed');
    assert.equal(value.issue.state_reason, 'completed');
    assert.equal(value.pulls[0].merged, true);
    assert.equal(value.pulls[0].base.ref, 'integration');
    assert.equal(value.evidence[0].record.pr, `${value.issue.repository_url.split('/repos/')[1]}#${value.pulls[0].number}`);
    assert.equal(issue.record.plan_items[0].revision, taskRevisionFor(value.issue.number));
    assert.equal(issue.record.plan_items[0].path, tasksPath);
    assert.equal(issue.record.basis[0].revision, revision);
    assert.equal(issue.record.basis[0].path, basisPath);

    const taskEvidence = value.evidence[0].record.evidence.find((ref) => ref.path === tasksPath);
    assert.equal(taskEvidence?.revision, taskRevisionFor(value.issue.number));

    const resolver = createSourceResolver(value.issue.number);
    const taskSource = await resolver.resolveRef(issue.record.plan_items[0]);
    assert.equal(taskSource.content, taskSourceFor(value.issue.number),
      'each neutral case resolves its own immutable canonical task source');
    assert.match(taskSource.content, new RegExp(`Work Issue: \\[#${value.issue.number}\\]`));
    assert.doesNotMatch(taskSource.content, new RegExp(`Work Issue: \\[#${value.issue.number === 201 ? 202 : 201}\\]`));
  }
});

test('mechanical work-record checks preserve both original assignments and destination facts for semantic review', async () => {
  const outputs = [];
  for (const value of [caseA, caseB]) {
    const before = structuredClone(value);
    const resolver = createSourceResolver(value.issue.number);
    const result = await checkWorkRecords({
      ...value,
      phase: 'closeout',
      resolveRef: resolver.resolveRef,
    });
    outputs.push(result);
    assert.equal(result.status, 'valid');
    assert.ok(findingCodes(result).includes('semantic-delivery-review-required'));
    assert.doesNotMatch(findingCodes(result).join('\n'), /record-schema-invalid|reference-unavailable|plan-item-missing|pr-identity-invalid|pr-issue-mismatch|evidence-pr-mismatch|evidence-tuple-stale|delivery-unsupported|delivery-review-missing|delivery-plan-uncovered/);
    assert.match(result.context.issue.body, /Assigned outcome:/);
    assert.equal(result.context.pulls[0].base.ref, 'integration');
    assert.equal(result.context.pulls[0].merged, true);
    assert.equal(resolver.calls.some((ref) => ref.path === basisPath), true);
    assert.equal(resolver.calls.some((ref) => ref.path === tasksPath), true);
    assert.deepEqual(value, before, 'read-only checking must not mutate the source fixture');
  }

  const assignments = outputs.map((result) => result.context.issue.body);
  assert.notEqual(assignments[0], assignments[1]);
  assert.match(assignments[0], /integration destination/);
  assert.match(assignments[1], /complete records change through the release destination/);
  assert.equal(outputs[0].context.pulls[0].base.ref, outputs[1].context.pulls[0].base.ref);
  assert.equal(outputs[0].context.pulls[0].head.ref.startsWith('feature/delivery-boundary-'), true);
  assert.equal(outputs[1].context.pulls[0].head.ref.startsWith('feature/delivery-boundary-'), true);
});
