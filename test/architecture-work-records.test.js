import assert from 'node:assert/strict';
import test from 'node:test';

import { checkWorkRecords } from '../src/work-records.js';
import { classifyIssue } from '../src/classification.js';
import {
  contextBody, issueSnapshot, noSpecIssueRecord, prerequisiteBundle, repository,
} from './fixtures/work-records/helpers.mjs';

const categories = ['request', 'epic', 'architecture-task', 'task', 'bug', 'spike'];
const mapping = Object.fromEntries(categories.map((category) => [category, `Consumer ${category}`]));
const foreignRepository = 'other/support';
const foreignMapping = Object.fromEntries(categories.map((category) => [category, `Support ${category}`]));
foreignMapping['architecture-task'] = mapping.task;

function inputs({ dependency, labels = [mapping.task], activity = 'deliver' } = {}) {
  const record = { ...structuredClone(noSpecIssueRecord), activity };
  delete record.prior_work;
  if (dependency) record.depends_on = [dependency];
  return {
    work: `${repository}#32`, categoryMapping: structuredClone(mapping),
    issue: issueSnapshot({ body: contextBody(record), labels }),
  };
}

function dependencyBundle(owner = repository, label = mapping.task) {
  const bundle = JSON.parse(JSON.stringify(prerequisiteBundle()).replaceAll(repository, owner));
  bundle.issue.labels = [{ name: label }];
  bundle.issue.body = contextBody({
    activity: 'deliver', request: `${owner}#30`, basis: [],
    no_spec_reason: 'This bounded prerequisite has no applicable current specification.',
  });
  bundle.pulls[0].body = contextBody({
    issues: [`${owner}#31`], basis: [],
    no_spec_reason: 'This prerequisite implements the bounded no-Spec maintenance assignment.',
  });
  return bundle;
}

async function withDependency(bundle, owner = repository) {
  const dependency = `${owner}#31`;
  const calls = [];
  const result = await checkWorkRecords({
    ...inputs({ dependency }),
    async resolveWork(work) {
      calls.push(work);
      assert.equal(work, dependency, 'checker resolves the explicit prerequisite identity');
      return structuredClone(bundle);
    },
  });
  assert.deepEqual(calls, [dependency]);
  return result;
}

function assertValid(result) {
  assert.equal(result.status, 'valid', JSON.stringify(result.findings));
  assert.equal(result.findings.some((finding) => ['error', 'unavailable'].includes(finding.severity)), false);
}

function assertCategoryFailure(result, code, { nested = false } = {}) {
  assert.notEqual(result.status, 'valid', JSON.stringify(result.findings));
  const findings = nested
    ? result.findings.find((finding) => finding.code === 'prerequisite-unverified')?.details?.findings
    : result.findings;
  assert.ok(Array.isArray(findings), 'classification failure must survive through the prerequisite result');
  assert.ok(findings.some((finding) => finding.code === code), JSON.stringify(findings));
  assert.equal(result.findings.some((finding) => finding.code === 'prerequisite-unavailable'), false,
    'a fixture or thrown resolver error must not masquerade as category rejection');
}

test('direct work-record API accepts explicit custom mapping and preserves classification context', async () => {
  const result = await checkWorkRecords(inputs());
  assertValid(result);
  assert.equal(result.context.classification.category, 'task');
  assert.equal(result.context.classification.activity, 'deliver');
  assert.deepEqual(result.context.classification.labels, [mapping.task]);
});

test('direct work-record API accepts an acquired classification without a separate mapping', async () => {
  const input = inputs();
  input.classification = classifyIssue(input.issue, noSpecIssueRecord, input.categoryMapping);
  delete input.categoryMapping;
  const result = await checkWorkRecords(input);
  assertValid(result);
  assert.deepEqual(result.context.classification, input.classification);
});

test('direct work-record API does not infer default or custom mappings when configuration is absent', async () => {
  for (const label of [mapping.task, 'type:task']) {
    const input = inputs({ labels: [label] });
    delete input.categoryMapping;
    assertCategoryFailure(await checkWorkRecords(input), 'category-config-unavailable');
  }
});

test('direct work-record API rejects incomplete and colliding explicit category maps', async () => {
  const incomplete = inputs();
  delete incomplete.categoryMapping['architecture-task'];
  assertCategoryFailure(await checkWorkRecords(incomplete), 'category-config-unavailable');
  const collision = inputs();
  collision.categoryMapping['architecture-task'] = collision.categoryMapping.task.toUpperCase();
  assertCategoryFailure(await checkWorkRecords(collision), 'category-config-unavailable');
});

test('same-repository prerequisite inherits the explicitly supplied consumer mapping', async () => {
  assertValid(await withDependency(dependencyBundle()));
});

test('same-repository prerequisite may carry its separately acquired mapping', async () => {
  const bundle = dependencyBundle(repository, foreignMapping.task);
  bundle.categoryMapping = structuredClone(foreignMapping);
  assertValid(await withDependency(bundle));
});

test('foreign prerequisite succeeds with its own map even when consumer category vocabularies conflict', async () => {
  const bundle = dependencyBundle(foreignRepository, foreignMapping.task);
  bundle.categoryMapping = structuredClone(foreignMapping);
  assertValid(await withDependency(bundle, foreignRepository));
});

test('foreign prerequisite can use its acquired classification without a map', async () => {
  const bundle = dependencyBundle(foreignRepository, foreignMapping.task);
  bundle.classification = classifyIssue(bundle.issue, { activity: 'deliver' }, foreignMapping);
  assertValid(await withDependency(bundle, foreignRepository));
});

test('foreign prerequisite cannot inherit the primary mapping even if its label matches the primary Task', async () => {
  const bundle = dependencyBundle(foreignRepository, mapping.task);
  assertCategoryFailure(await withDependency(bundle, foreignRepository), 'category-config-unavailable', { nested: true });
});

test('foreign prerequisite incompatible under its own mapping is rejected instead of using the primary meaning', async () => {
  const bundle = dependencyBundle(foreignRepository, mapping.task);
  bundle.categoryMapping = structuredClone(foreignMapping);
  assertCategoryFailure(await withDependency(bundle, foreignRepository), 'category-activity-incompatible', { nested: true });
});

test('acquired prerequisite classification discrepancies remain blocking through the direct API', async () => {
  const bundle = dependencyBundle(foreignRepository, mapping.task);
  bundle.classification = classifyIssue(bundle.issue, { activity: 'deliver' }, foreignMapping);
  assertCategoryFailure(await withDependency(bundle, foreignRepository), 'category-activity-incompatible', { nested: true });
});

test('completed routed prerequisite missing Workflow context cannot become verified delivery', async () => {
  for (const acquired of [false, true]) {
    const bundle = dependencyBundle(foreignRepository, foreignMapping.task);
    bundle.issue.body = 'Closed prerequisite with old prose, but no authoritative Workflow context.';
    if (acquired) bundle.classification = classifyIssue(bundle.issue, null, foreignMapping);
    else bundle.categoryMapping = structuredClone(foreignMapping);
    assertCategoryFailure(await withDependency(bundle, foreignRepository), 'record-context-required', { nested: true });
  }
});
