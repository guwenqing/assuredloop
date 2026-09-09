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

const optionalContextCases = [
  { name: 'open Request', labels: [mapping.request], exception: 'rough-request' },
  { name: 'unlabeled rough intake', labels: [], exception: 'rough-request' },
  { name: 'container Epic', labels: [mapping.epic], exception: 'epic-container' },
];
const absentBodies = [
  { name: 'empty text', value: '' },
  { name: 'null', value: null },
  { name: 'undefined', value: undefined },
  { name: 'omitted', omitted: true },
];

for (const context of optionalContextCases) {
  for (const body of absentBodies) {
    test(`${context.name} permits ${body.name} body without changing the captured source`, async () => {
      for (const acquired of [false, true]) {
        const input = inputs({ labels: context.labels });
        if (body.omitted) delete input.issue.body;
        else input.issue.body = body.value;
        if (acquired) {
          input.classification = classifyIssue(input.issue, null, input.categoryMapping);
          delete input.categoryMapping;
        }
        const originalIssue = structuredClone(input.issue);
        const result = await checkWorkRecords(input);
        assertValid(result);
        assert.equal(result.context.classification.exception, context.exception);
        assert.deepEqual(result.context.issue, originalIssue, 'absence is preserved as acquired source data');
        assert.deepEqual(input.issue, originalIssue, 'validation does not mutate the caller’s Issue');
      }
    });
  }
}

test('optional-context categories still reject malformed explicit Workflow context', async () => {
  for (const context of optionalContextCases) {
    for (const body of [
      '## Workflow context\nThe required JSON block is missing.\n',
      '## Workflow context\n\n```json\n{"activity":\n```\n',
      '## Workflow context\n\n```json\n{}\n```\n',
    ]) {
      for (const acquired of [false, true]) {
        const input = inputs({ labels: context.labels });
        input.issue.body = body;
        if (acquired) {
          input.classification = classifyIssue(input.issue, null, input.categoryMapping);
          delete input.categoryMapping;
        }
        const result = await checkWorkRecords(input);
        assert.equal(result.status, 'invalid', `${context.name} must not exempt malformed explicit context`);
        assert.ok(result.findings.some((finding) =>
          ['record-context-invalid', 'record-schema-invalid'].includes(finding.code)), JSON.stringify(result.findings));
      }
    }
  }
});

test('optional-context categories reject unsupported nontext bodies instead of converting them to absence', async () => {
  for (const context of optionalContextCases) {
    for (const body of [0, false, {}, []]) {
      const input = inputs({ labels: context.labels });
      input.issue.body = body;
      const result = await checkWorkRecords(input);
      assert.equal(result.status, 'invalid');
      assert.ok(result.findings.some((finding) => finding.code === 'record-context-invalid'));
    }
  }
});

test('routed executable categories still require context for every supported absent body representation', async () => {
  for (const category of ['architecture-task', 'task', 'bug', 'spike']) {
    for (const body of absentBodies) {
      const input = inputs({ labels: [mapping[category]] });
      if (body.omitted) delete input.issue.body;
      else input.issue.body = body.value;
      assertCategoryFailure(await checkWorkRecords(input), 'record-context-required');
    }
  }
});
