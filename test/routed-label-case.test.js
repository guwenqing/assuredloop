import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { test } from 'node:test';

import { makeRoutedLabelCaseFixture } from './fixtures/routed-label-case/helpers.mjs';

const execFile = promisify(execFileCallback);
const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname);
const cliPath = path.join(repositoryRoot, 'src', 'cli.js');
const packetBudget = 65536;

async function runCli(args, env) {
  try {
    const result = await execFile(process.execPath, [cliPath, ...args], {
      env,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { ...result, exitCode: 0 };
  } catch (error) {
    return {
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
      exitCode: error.code,
    };
  }
}

function outputOf(result) {
  assert.ok(result.stdout.trim(), `CLI returned no JSON output; stderr: ${result.stderr}`);
  return JSON.parse(result.stdout.trim());
}

function findingText(result) {
  return JSON.stringify(result.findings ?? result);
}

function hasRoutedContextFinding(result) {
  return /record-context-(?:missing|required)/.test(findingText(result));
}

function checkIssue(result) {
  return result.records?.find((entry) => entry.context?.issue)?.context.issue;
}

function packetIssue(result, work) {
  const entry = (result.packet?.entries ?? []).find((candidate) => candidate.ref === work);
  assert.ok(entry, 'inspect retains the selected Issue in the packet');
  return JSON.parse(entry.content.split('\n\n', 1)[0]).issue;
}

for (const labelKind of ['task', 'bug', 'spike']) {
  test(`${labelKind} label identity is case-insensitive in check and inspect`, async (t) => {
    const fixture = await makeRoutedLabelCaseFixture(t, {
      labelKind,
      configuredVariant: 'mixed',
      observedVariant: 'upper',
    });

    const checkResult = await runCli(['check', '--target', fixture.root, '--work', fixture.work], fixture.env);
    const inspectResult = await runCli([
      'inspect', '--target', fixture.root, '--work', fixture.work,
      '--max-inline-bytes', String(packetBudget),
    ], fixture.env);
    const checked = outputOf(checkResult);
    const inspected = outputOf(inspectResult);
    assert.deepEqual({
      checkStatus: checked.status,
      checkRequiresContext: hasRoutedContextFinding(checked),
      checkAllowsRough: /rough-intake-context/.test(findingText(checked)),
      inspectStatus: inspected.status,
      inspectRequiresContext: hasRoutedContextFinding(inspected),
      inspectAllowsRough: /rough-intake-context/.test(findingText(inspected)),
    }, {
      checkStatus: 'invalid',
      checkRequiresContext: true,
      checkAllowsRough: false,
      inspectStatus: 'invalid',
      inspectRequiresContext: true,
      inspectAllowsRough: false,
    });
    assert.notEqual(checkResult.exitCode, 0);
    assert.deepEqual(checkIssue(checked)?.labels, fixture.labels,
      'check keeps GitHub’s original label spelling for display');
    assert.notEqual(inspectResult.exitCode, 0);
    assert.equal(inspected.status, 'invalid');
    assert.match(findingText(inspected), /record-context-(?:missing|required)/);
    assert.doesNotMatch(findingText(inspected), /rough-intake-context/);
    assert.deepEqual(packetIssue(inspected, fixture.work).labels, fixture.labels,
      'inspect keeps GitHub’s original label spelling for display');
  });
}

test('an unlabeled rough intake remains allowed in check and inspect', async (t) => {
  const fixture = await makeRoutedLabelCaseFixture(t, { unlabeled: true, labelKind: null });

  const checkResult = await runCli(['check', '--target', fixture.root, '--work', fixture.work], fixture.env);
  const inspectResult = await runCli([
    'inspect', '--target', fixture.root, '--work', fixture.work,
    '--max-inline-bytes', String(packetBudget),
  ], fixture.env);
  const checked = outputOf(checkResult);
  const inspected = outputOf(inspectResult);
  assert.equal(checked.status, 'incomplete');
  assert.match(findingText(checked), /rough-intake-context/);
  assert.doesNotMatch(findingText(checked), /record-context-(?:missing|required)/);
  assert.deepEqual(checkIssue(checked)?.labels, []);
  assert.equal(inspected.status, 'pass');
  assert.equal(inspectResult.exitCode, 0);
  assert.doesNotMatch(findingText(inspected), /record-context-(?:missing|required)/);
  assert.deepEqual(packetIssue(inspected, fixture.work).labels, []);
});
