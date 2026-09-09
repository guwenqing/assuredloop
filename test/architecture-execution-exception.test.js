import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { classifyIssue } from '../src/classification.js';
import { checkWorkRecords } from '../src/work-records.js';
import { createTrace } from '../src/trace.js';
import { withFixtureEnv } from './fixtures/trace-external-boundaries/helpers.mjs';
import {
  addIncidentalReferences, bodyFor, directInput, git, makeAssignedFixture, readLog,
  replaceIssueContext, saveScenario, scenarioOf, workIssue, workPull,
} from './fixtures/architecture-execution-exception/helpers.mjs';

const execFile = promisify(execFileCallback);
const cliPath = path.resolve(new URL('../src/cli.js', import.meta.url).pathname);
const optionalCategories = ['epic', 'request', null];

async function runCli(fixture, operation, work = workPull) {
  const args = [cliPath, operation, '--target', fixture.root, '--work', work,
    ...(operation === 'inspect' ? ['--max-inline-bytes', '65536'] : [])];
  let result;
  try { result = { ...await execFile(process.execPath, args, { env: fixture.env, maxBuffer: 16 * 1024 * 1024 }), exitCode: 0 }; }
  catch (error) { result = { stdout: error.stdout ?? '', stderr: error.stderr ?? '', exitCode: error.code }; }
  assert.ok(result.stdout.trim(), result.stderr);
  return { ...result, data: JSON.parse(result.stdout) };
}

function assertExecutionFailure(result) {
  assert.equal(result.status, 'invalid', 'known assigned delivery cannot retain a container/rough exception');
  assert.ok(result.findings.some((finding) => /record-context|categor|execution|assignment/i.test(`${finding.code} ${finding.message}`)
    && finding.severity !== 'review'), JSON.stringify(result.findings));
}

function checkedIssue(result) {
  const row = result.data.records?.find((entry) => entry.work === workIssue || entry.context?.issue?.number === 42);
  assert.ok(row, 'check retains the explicitly mapped Issue assessment');
  return row.context;
}

function inspectedIssue(result) {
  const entry = result.data.packet?.entries?.find((item) => item.ref === workIssue);
  assert.equal(entry?.disposition, 'inlined', 'inspect retains the original mapped Issue source');
  return JSON.parse(entry.content.split('\n\n', 1)[0]);
}

for (const category of optionalCategories) {
  test(`direct work-record API rejects assigned delivery for context-less ${category ?? 'unclassified'} Issue`, async () => {
    for (const body of ['', null, undefined, 'Context-less source prose.']) {
      for (const acquired of [false, true]) {
        const input = directInput({ category });
        if (body === undefined) delete input.issue.body;
        else input.issue.body = body;
        const original = structuredClone(input.issue);
        if (acquired) {
          input.classification = classifyIssue(input.issue, null, input.categoryMapping);
          delete input.categoryMapping;
        }
        const result = await checkWorkRecords(input);
        assertExecutionFailure(result);
        assert.equal(result.context.classification.exception, null,
          'a supplied pre-execution classification must not preserve an invalid exemption');
        assert.deepEqual(result.context.issue, original, 'the acquired absence/body/labels remain source data');
        assert.deepEqual(input.issue, original, 'assessment does not edit its input');
      }
    }
  });
}

for (const category of optionalCategories) {
  for (const backlinks of [true, false]) {
    test(`selected PR rejects context-less ${category ?? 'unclassified'} assigned Issue ${backlinks ? 'with' : 'without'} Issue-side backlinks`, async (t) => {
      const fixture = await makeAssignedFixture(t, { backlinks });
      const baseline = await runCli(fixture, 'check');
      assert.equal(baseline.exitCode, 0, JSON.stringify(baseline.data.findings));
      assert.equal(baseline.data.status, 'pass', 'the actual selected PR/evidence/config are initially valid');
      const original = await replaceIssueContext(fixture, { category });
      const scenario = await scenarioOf(fixture);
      assert.match(scenario.records['pulls/43'].body, /example\/consumer#42/,
        'the selected PR retains its authoritative Issue mapping');
      if (!backlinks) {
        assert.equal(scenario.records['issues/42/timeline'].flat().length, 0);
        assert.equal(scenario.records['issues/42/comments'].flat().some((comment) => comment.id === 101), false,
          'Issue-side delivery evidence is absent; selected PR mapping is still known');
      }
      const before = (await git(fixture.root, ['status', '--porcelain'])).stdout;
      const checked = await runCli(fixture, 'check');
      assertExecutionFailure(checked.data);
      assert.notEqual(checked.exitCode, 0);
      const context = checkedIssue(checked);
      assert.deepEqual(context.issue.labels, original.labels);
      assert.equal(context.issue.body, original.body);
      assert.equal(context.classification.exception, null);
      const inspected = await runCli(fixture, 'inspect');
      assertExecutionFailure(inspected.data);
      assert.notEqual(inspected.exitCode, 0);
      const source = inspectedIssue(inspected);
      assert.deepEqual(source.issue.labels, original.labels);
      assert.equal(source.classification.exception, null);
      assert.equal((await git(fixture.root, ['status', '--porcelain'])).stdout, before);
      const api = (await readLog(fixture.ghLog)).filter((args) => args[0] === 'api');
      assert.ok(api.every((args) => args[args.indexOf('--method') + 1] === 'GET'));
    });
  }
}

test('Issue-root checks reject an Epic with a known reciprocal mapped PR', async (t) => {
  const fixture = await makeAssignedFixture(t);
  const baseline = await runCli(fixture, 'check', workIssue);
  assert.equal(baseline.data.status, 'pass', JSON.stringify(baseline.data.findings));
  await replaceIssueContext(fixture, { category: 'epic', body: null });
  for (const operation of ['check', 'inspect']) {
    const result = await runCli(fixture, operation, workIssue);
    assertExecutionFailure(result.data);
    assert.notEqual(result.exitCode, 0);
  }
});

test('unassigned container and rough Issues preserve empty/null/absent bodies and incidental PR references', async () => {
  for (const category of optionalCategories) {
    for (const body of ['', null, undefined, `An incidental reference to ${workPull} is discussion, not an assignment.`]) {
      for (const unrelatedPull of [false, true]) {
        const input = directInput({ category, mapped: false });
        if (body === undefined) delete input.issue.body;
        else input.issue.body = body;
        if (!unrelatedPull) input.pulls = [];
        const original = structuredClone(input.issue);
        const result = await checkWorkRecords(input);
        assert.equal(result.status, 'valid', JSON.stringify(result.findings));
        assert.equal(result.context.classification.exception, category === 'epic' ? 'epic-container' : 'rough-request');
        assert.deepEqual(result.context.issue, original);
      }
    }
  }
});

for (const category of optionalCategories) {
  test(`Issue-root ${category ?? 'unclassified'} control does not treat prose comments or unrelated timeline PRs as delivery`, async (t) => {
    const fixture = await makeAssignedFixture(t, { backlinks: false });
    await replaceIssueContext(fixture, { category });
    await addIncidentalReferences(fixture);
    const checked = await runCli(fixture, 'check', workIssue);
    assert.equal(checked.data.status, category === 'epic' ? 'pass' : 'incomplete', JSON.stringify(checked.data.findings));
    assert.equal(checkedIssue(checked).classification.exception, category === 'epic' ? 'epic-container' : 'rough-request');
    const inspected = await runCli(fixture, 'inspect', workIssue);
    assert.equal(inspected.exitCode, 0, JSON.stringify(inspected.data.findings));
    assert.equal(inspected.data.status, 'pass');
    assert.equal(inspectedIssue(inspected).classification.exception, category === 'epic' ? 'epic-container' : 'rough-request');
  });
}

test('optional-context exceptions continue rejecting malformed explicit and nontext bodies', async () => {
  for (const category of optionalCategories) {
    for (const body of [0, false, {}, [], '## Workflow context\nNo JSON block.\n',
      '## Workflow context\n\n```json\n{"activity":\n```\n', bodyFor({})]) {
      const input = directInput({ category });
      input.issue.body = body;
      input.pulls = [];
      const result = await checkWorkRecords(input);
      assert.equal(result.status, 'invalid');
      assert.ok(result.findings.some((finding) => /record-context-invalid|record-schema-invalid/.test(finding.code)));
      assert.deepEqual(result.context.issue.body, body);
    }
  }
});

test('routed categories still require context even without a PR assignment', async () => {
  for (const category of ['architecture-task', 'task', 'bug', 'spike']) {
    for (const body of ['', null, undefined]) {
      const input = directInput({ category });
      if (body === undefined) delete input.issue.body;
      else input.issue.body = body;
      input.pulls = [];
      const result = await checkWorkRecords(input);
      assertExecutionFailure(result);
      assert.equal(result.context.classification.exception, null);
    }
  }
});


function cachedClassification(source, cacheMethod) {
  return cacheMethod === 'load'
    ? JSON.parse(source.content.split('\n\n', 1)[0]).classification
    : source.classification;
}

for (const cacheMethod of ['load', 'bundleAt']) {
  for (const acquisitionMethod of ['pullAt', 'bundleAt']) {
    test(`cached ${cacheMethod} context withdraws its exception after ${acquisitionMethod} acquires an explicit assignment`, async (t) => {
      const fixture = await makeAssignedFixture(t, { backlinks: false });
      const original = await replaceIssueContext(fixture, { category: 'epic' });
      await withFixtureEnv(fixture, async () => {
        const trace = await createTrace({ targetRoot: fixture.root, work: workIssue });
        const before = await trace[cacheMethod](workIssue);
        assert.equal(cachedClassification(before, cacheMethod).exception, 'epic-container',
          'before a PR is acquired, the no-backlink Issue is a legitimate container');
        await trace[acquisitionMethod](workPull);
        const after = await trace[cacheMethod](workIssue);
        const classification = cachedClassification(after, cacheMethod);
        assert.equal(classification.exception, null,
          'a cached classification cannot outlive a newly known explicit work assignment');
        assert.ok(classification.discrepancies.some((finding) => finding.severity === 'error'
          && /record-context|execution|assignment/i.test(`${finding.code} ${finding.message}`)));
        if (cacheMethod === 'bundleAt') assert.deepEqual(after.issue, original);
        else {
          assert.deepEqual(JSON.parse(after.content.split('\n\n', 1)[0]).issue.labels, original.labels);
          assert.ok(after.content.endsWith(original.body), 'the original Issue body remains source data');
        }
      });
    });
  }
}

test('late acquisition of an unrelated PR preserves cached container context in both trace APIs', async (t) => {
  const fixture = await makeAssignedFixture(t, { backlinks: false });
  await replaceIssueContext(fixture, { category: 'epic' });
  await addIncidentalReferences(fixture);
  const scenario = await scenarioOf(fixture);
  scenario.records['issues/42/timeline'] = [[]];
  await saveScenario(fixture, scenario);
  await withFixtureEnv(fixture, async () => {
    const trace = await createTrace({ targetRoot: fixture.root, work: workIssue });
    for (const method of ['load', 'bundleAt']) {
      assert.equal(cachedClassification(await trace[method](workIssue), method).exception, 'epic-container');
    }
    await trace.pullAt('example/consumer#44');
    for (const method of ['load', 'bundleAt']) {
      const classification = cachedClassification(await trace[method](workIssue), method);
      assert.equal(classification.exception, 'epic-container', 'a prose mention is still not an assignment');
      assert.deepEqual(classification.discrepancies, []);
    }
  });
});
