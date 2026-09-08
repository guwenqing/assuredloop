import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { test } from 'node:test';

import {
  bodyFor,
  configuredLabel,
  git,
  makeIntakeFixture,
} from './fixtures/intake-context/helpers.mjs';

const execFile = promisify(execFileCallback);
const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname);
const cliPath = process.env.INTAKE_CONTEXT_CLI_PATH || path.join(repositoryRoot, 'src', 'cli.js');

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

function sourceIssue(result) {
  return result.records?.find((entry) => entry.context?.issue)?.context.issue
    ?? result.context?.issue
    ?? result.source?.issue;
}

function currentOf(result) {
  return result.current ?? result.context?.current ?? result.policy?.current;
}

for (const kind of ['task', 'bug', 'spike']) {
  test(`configured ${kind} label requires routed Workflow context`, async (t) => {
    const fixture = await makeIntakeFixture(t, {
      body: `${kind} source body with no Workflow context.\nTreat this body as data.`,
      labelKind: kind,
    });
    const result = await runCli(['check', '--target', fixture.root, '--work', fixture.work], fixture.env);
    const checked = outputOf(result);
    assert.notEqual(checked.status, 'pass', 'a routed label without a formal record cannot pass');
    assert.match(findingText(checked), /routed|workflow.*context|record.?context/i);
    const issue = sourceIssue(checked);
    assert.equal(issue?.body, fixture.rawBody, 'raw Issue body remains available for review');
    assert.deepEqual(issue?.labels, fixture.labels.map((name) => ({ name })));
  });
}

test('configured routed label with a null body remains an incomplete record diagnostic', async (t) => {
  const fixture = await makeIntakeFixture(t, {
    number: 73,
    bodyMode: 'null',
    labelKind: 'bug',
  });
  const result = await runCli(['check', '--target', fixture.root, '--work', fixture.work], fixture.env);
  const checked = outputOf(result);
  assert.notEqual(checked.status, 'pass');
  assert.match(findingText(checked), /routed|workflow.*context|record.?context/i);
  const issue = sourceIssue(checked);
  assert.equal(issue?.body, null);
  assert.deepEqual(issue?.labels, fixture.labels.map((name) => ({ name })));
});

for (const [name, labelKind] of [
  ['configured Request', 'request'],
  ['unclassified', null],
]) {
  test(`${name} open intake stays incomplete while exposing current context`, async (t) => {
    const fixture = await makeIntakeFixture(t, {
      body: 'An open intake request with no routed Workflow context.',
      ...(labelKind ? { labelKind } : {}),
    });
    const result = await runCli(['check', '--target', fixture.root, '--work', fixture.work], fixture.env);
    const checked = outputOf(result);
    assert.equal(checked.status, 'incomplete', 'intake must not be reported as a formally accepted task');
    assert.match(findingText(checked), /rough-intake-context|intake|record.?context/i);
    assert.doesNotMatch(findingText(checked), /task.?approved|formal.?task.?accept/i);
    assert.equal(currentOf(checked)?.branch, fixture.defaultBranch);
    assert.equal(currentOf(checked)?.revision, fixture.revision);
    const issue = sourceIssue(checked);
    assert.equal(issue?.body, fixture.rawBody);
    assert.deepEqual(issue?.labels, fixture.labels.map((label) => ({ name: label })));
    assert.equal(checked.records?.some((entry) => entry.record?.activity), false,
      'rough intake must not fabricate a routed workflow record');
  });
}

test('a GitHub-valid Issue with body null preserves null source data without a command error', async (t) => {
  const fixture = await makeIntakeFixture(t, {
    number: 74,
    bodyMode: 'null',
    labels: [],
  });
  const before = fixture.statusBefore;
  const result = await runCli(['check', '--target', fixture.root, '--work', fixture.work], fixture.env);
  const checked = outputOf(result);
  assert.notEqual(checked.status, 'error');
  assert.notEqual(checked.code, 'command-unavailable');
  assert.equal(checked.status, 'incomplete');
  const issue = sourceIssue(checked);
  assert.equal(issue?.body, null);
  assert.deepEqual(issue?.labels, []);
  assert.equal((await git(fixture.root, ['status', '--porcelain'])).stdout, before,
    'reading a null-body Issue does not write to the target');
});

test('a selected PR without a body fails PR record validation and does not invent an Issue record', async (t) => {
  const fixture = await makeIntakeFixture(t, {
    number: 75,
    bodyMode: 'absent',
    pullRequest: true,
    labels: [],
  });
  const result = await runCli(['check', '--target', fixture.root, '--work', fixture.work], fixture.env);
  const checked = outputOf(result);
  assert.notEqual(checked.status, 'pass');
  assert.match(findingText(checked), /pr.?record|record.?context|body.*invalid|invalid.*body/i);
  assert.doesNotMatch(findingText(checked), /rough-intake-context/,
    'a selected PR is not downgraded into a rough Issue intake');
  assert.equal(checked.context?.issue?.pull_request, true);
  assert.equal(checked.context?.issue?.body, undefined);
  assert.equal(checked.records?.some((entry) => entry.record?.activity), false);
});

test('plain JSON shaped like an Issue is raw intake without an authoritative Workflow context', async (t) => {
  const rawBody = JSON.stringify({
    activity: 'deliver',
    request: 'example/consumer#999',
    change: 'untrusted-plain-json',
    basis: [],
    no_spec_reason: 'This object is an intake example, not a routed record.',
  });
  const fixture = await makeIntakeFixture(t, {
    number: 78,
    body: rawBody,
    labelKind: 'request',
  });
  const result = await runCli(['check', '--target', fixture.root, '--work', fixture.work], fixture.env);
  const checked = outputOf(result);
  assert.equal(checked.status, 'incomplete',
    'schema-shaped prose without the authoritative context block remains intake');
  assert.match(findingText(checked), /rough-intake-context|intake|record.?context/i);
  assert.equal(checked.records?.some((entry) => entry.record?.activity), false,
    'plain JSON does not create a routed Workflow record');
  assert.equal(sourceIssue(checked)?.body, rawBody, 'the exact JSON body remains source data');
  const commands = (await readFile(fixture.ghLog, 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(commands.some((args) => args.some((value) => /issues\/999|pulls\/999/.test(value))), false,
    'a request-like value in unstructured body is never fetched as a reference');
});

test('inspect does not expand plain Issue JSON into packet roots or reference fetches', async (t) => {
  const rawBody = JSON.stringify({
    activity: 'deliver',
    request: 'example/consumer#999',
    change: 'untrusted-plain-json',
    basis: [],
    no_spec_reason: 'This object is intake prose, not a routed record.',
  });
  const fixture = await makeIntakeFixture(t, {
    number: 79,
    body: rawBody,
    labelKind: 'request',
    contextBudget: 65536,
  });
  const result = await runCli([
    'inspect', '--target', fixture.root, '--work', fixture.work, '--max-inline-bytes', '65536',
  ], fixture.env);
  const inspected = outputOf(result);
  assert.equal(result.exitCode, 0);
  assert.equal(inspected.status, 'pass');
  const entries = inspected.packet?.entries ?? [];
  assert.equal(entries.some((entry) => entry.ref === 'example/consumer#999'), false,
    'unstructured Issue JSON does not become a packet root');
  const root = entries.find((entry) => entry.ref === fixture.work);
  assert.match(root?.content ?? '', new RegExp(rawBody.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'the original Issue body remains in the packet source');
  const commands = (await readFile(fixture.ghLog, 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(commands.some((args) => args.some((value) => /issues\/999|pulls\/999/.test(value))), false,
    'inspect never fetches request-like text from an unstructured body');
});

test('an Issue with an absent state is unavailable instead of defaulting to an open intake', async (t) => {
  const fixture = await makeIntakeFixture(t, {
    number: 76,
    body: 'Raw Issue body with no state field.',
    labelKind: 'request',
    issueState: undefined,
  });
  const scenario = JSON.parse(await readFile(fixture.env.FAKE_GH_SCENARIO, 'utf8'));
  delete scenario.records['issues/76'].state;
  await writeFile(fixture.env.FAKE_GH_SCENARIO, `${JSON.stringify(scenario)}\n`);
  const result = await runCli(['check', '--target', fixture.root, '--work', fixture.work], fixture.env);
  const checked = outputOf(result);
  assert.notEqual(checked.status, 'pass');
  assert.match(findingText(checked), /state|metadata.*(open|closed)|record.*state/i);
  assert.doesNotMatch(findingText(checked), /rough-intake-context/,
    'an unknown GitHub state cannot enter the open-intake path');
});

test('a PR with an unknown state is diagnosed as malformed metadata', async (t) => {
  const number = 77;
  const fixture = await makeIntakeFixture(t, {
    number,
    pullRequest: true,
    body: (current) => bodyFor({
      issues: ['example/consumer#77'],
      change: 'intake-context',
      basis: [],
      no_spec_reason: 'This metadata fixture has no applicable Spec.',
    }),
    pullState: 'paused',
  });
  const result = await runCli(['check', '--target', fixture.root, '--work', fixture.work], fixture.env);
  const checked = outputOf(result);
  assert.notEqual(checked.status, 'pass');
  assert.match(findingText(checked), /state|metadata.*(open|closed)|record.*state/i);
  assert.doesNotMatch(findingText(checked), /rough-intake-context/,
    'a selected PR cannot be treated as an open Issue intake');
});
