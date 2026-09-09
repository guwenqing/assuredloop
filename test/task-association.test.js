import assert from 'node:assert/strict';
import test from 'node:test';

import * as workRecords from '../src/work-records.js';
import {
  contextBody,
  issueRecord,
  categoryMapping,
  issueSnapshot,
  issueWork,
  primaryBasis,
} from './fixtures/work-records/helpers.mjs';
import {
  ambiguousPackage,
  conflictingTaskAndPackage,
  earlyPlanningWithoutPlan,
  foreignHostAssociation,
  foreignRepositoryAssociation,
  fencedAndProseLinks,
  duplicateTaskIdAcrossPackages,
  inlineCodeExampleWithPackageOwner,
  inlineTaskAssociation,
  matchingPackageTasks,
  mismatchedPackage,
  missingTask,
  neighboringWorkIssue,
  otherWorkIssue,
  planRef,
  sectionBoundary,
  taskOnlyAssociation,
  unresolvedTaskAssociation,
  unsupportedAssociationLabel,
  workIssue,
} from './fixtures/task-association/helpers.mjs';

const checker = workRecords.checkTaskAssociations;

function invoke(content, ref = planRef(), allowedWorks = [workIssue], options = {}) {
  assert.equal(
    typeof checker,
    'function',
    'work-records must expose checkTaskAssociations for canonical PlanRef ownership checks',
  );
  return checker({
    content,
    planRef: ref,
    allowedWorks,
    allowUnresolved: false,
    ...options,
  });
}

async function resultFor(...args) {
  return await invoke(...args);
}

function resultText(result) {
  return JSON.stringify(result ?? {}).toLowerCase();
}

function associationText(result) {
  return JSON.stringify(result?.associations ?? {}).toLowerCase();
}

function assertFinding(result, pattern) {
  assert.match(resultText(result), pattern, `expected finding matching ${pattern}`);
}

function assertAssociations(result, ...needles) {
  assert.equal(result.status, 'valid', JSON.stringify(result));
  assert.ok(result.associations !== undefined, 'valid results expose canonical associations');
  const text = associationText(result);
  for (const needle of needles) assert.match(text, new RegExp(String(needle).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

test('canonical task association checker is exposed as a separate structural check', () => {
  assert.equal(typeof checker, 'function');
});

test('checkWorkRecords rejects a canonical PlanRef assignment that disagrees with the selected Issue', async () => {
  const record = structuredClone(issueRecord);
  record.depends_on = [];
  record.prior_work = [];
  record.basis = [structuredClone(primaryBasis)];
  record.plan_items = [planRef(['3.1'])];

  const issue = issueSnapshot({ body: contextBody(record), number: 32 });
  const result = await workRecords.checkWorkRecords({
    work: issueWork,
    categoryMapping,
    issue,
    pulls: [],
    evidence: [],
    phase: 'handoff',
    async resolveRef(ref) {
      if (ref.path === primaryBasis.path) return { content: '# Record link status checks\n' };
      if (ref.path === planRef().path) return { content: mismatchedPackage };
      throw Object.assign(new Error(`unexpected fixture reference: ${ref.path}`), { code: 'reference-out-of-scope' });
    },
  });

  assert.equal(result.status, 'invalid', JSON.stringify(result));
  assertFinding(result, /association|assignment|canonical|work.?issue/);
});

test('package Work Issue association applies to each selected native task', async () => {
  const result = await resultFor(matchingPackageTasks, planRef(['3.1', '3.2']));
  assertAssociations(result, workIssue, '3.1', '3.2');
});

test('an unambiguous task-level Work Issue association is accepted without a package declaration', async () => {
  const result = await resultFor(taskOnlyAssociation);
  assertAssociations(result, workIssue, '3.1');
});

test('a Work Issue link written on the native checkbox line is accepted as task-level ownership', async () => {
  const result = await resultFor(inlineTaskAssociation);
  assertAssociations(result, workIssue, '3.1');
});

test('an inline-code Work Issue example does not conflict with the real package owner', async () => {
  const result = await resultFor(inlineCodeExampleWithPackageOwner);
  assertAssociations(result, workIssue, '3.1');
  assert.doesNotMatch(associationText(result), /example\/consumer#9/);
});

test('a canonical package assignment that differs from the selected work is rejected', async () => {
  const result = await resultFor(mismatchedPackage, planRef(), [workIssue]);
  assert.equal(result.status, 'invalid');
  assertFinding(result, /association|assignment|work.?issue|canonical/);
  assert.match(associationText(result), /example\/consumer#9/);
});

test('multiple package Work Issue declarations are unresolved even when both Issues are allowed', async () => {
  const result = await resultFor(ambiguousPackage, planRef(), [workIssue, otherWorkIssue]);
  assert.notEqual(result.status, 'valid');
  assertFinding(result, /ambiguous|unresolved|multiple|conflict/);
});

test('conflicting package and task-level declarations are unresolved', async () => {
  const result = await resultFor(conflictingTaskAndPackage, planRef(), [workIssue, otherWorkIssue]);
  assert.notEqual(result.status, 'valid');
  assertFinding(result, /ambiguous|unresolved|conflict|association/);
});

test('duplicate native task IDs under different packages are unresolved instead of merged', async () => {
  const result = await resultFor(duplicateTaskIdAcrossPackages, planRef(), [workIssue, otherWorkIssue]);
  assert.notEqual(result.status, 'valid');
  assertFinding(result, /duplicate|ambiguous|unresolved|conflict|association/);
  assert.notEqual(result.associations?.find((entry) => entry.item === '3.1')?.verified, true);
});

test('fenced examples and ordinary Basis/dependency URLs are ignored as ownership declarations', async () => {
  const result = await resultFor(fencedAndProseLinks);
  assertAssociations(result, workIssue, '3.1');
  const associations = associationText(result);
  assert.doesNotMatch(associations, /999|77|66/);
});

test('package section boundaries prevent an earlier Work Issue from leaking into the selected task', async () => {
  const result = await resultFor(sectionBoundary);
  assertAssociations(result, workIssue, '3.1');
  assert.doesNotMatch(associationText(result), new RegExp(neighboringWorkIssue.replace('/', '\\/')));
});

test('unsupported ownership labels remain unresolved instead of being interpreted as Work Issue declarations', async () => {
  const result = await resultFor(unsupportedAssociationLabel);
  assert.notEqual(result.status, 'valid');
  assertFinding(result, /unresolved|unrecognized|association|work.?issue/);
});

test('an ownership link on another host is rejected within the bound GitHub scope', async () => {
  const result = await resultFor(foreignHostAssociation);
  assert.notEqual(result.status, 'valid');
  assertFinding(result, /host|scope|allowed|association|github/);
});

test('an ownership link for another repository is rejected even when its Issue number matches', async () => {
  const result = await resultFor(foreignRepositoryAssociation);
  assert.notEqual(result.status, 'valid');
  assertFinding(result, /repository|scope|allowed|association|work.?issue/);
});

test('a PlanRef task identifier must exist in the native task list', async () => {
  const result = await resultFor(missingTask, planRef(['3.9']));
  assert.notEqual(result.status, 'valid');
  assertFinding(result, /task|plan|3\.9|missing/);
});

test('no applicable PlanRef preserves early planning treatment without inventing ownership', async () => {
  const result = await resultFor(earlyPlanningWithoutPlan, null, []);
  assert.notEqual(result.status, 'invalid');
  assert.deepEqual(result.associations ?? [], []);
  assert.doesNotMatch(resultText(result), /canonical.?assignment|work.?issue.*required/);
});

test('allowUnresolved keeps an unassociated task unverified', async () => {
  const result = await resultFor(unresolvedTaskAssociation, planRef(), [workIssue], { allowUnresolved: true });
  const association = result.associations?.find((entry) => entry.item === '3.1');
  assert.ok(association, JSON.stringify(result));
  assert.notEqual(association.verified, true, JSON.stringify(result));
  assertFinding(result, /unresolved|association|ownership/);
  assert.match(JSON.stringify(result.findings), /review/);
});
