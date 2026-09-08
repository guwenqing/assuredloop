import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { test } from 'node:test';

import { readLog } from './fixtures/trace-cli/helpers.mjs';
import {
  malformedIssueBody,
  malformedPrBody,
  makePrimaryFormalFixture,
  makeRoughRequestFixture,
  makeRoutedTaskMissingFixture,
  schemaInvalidIssueBody,
  schemaInvalidPrBody,
} from './fixtures/primary-record-sources/helpers.mjs';

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
  return JSON.stringify(result);
}

function invalidSourcesOf(result) {
  return result.context?.invalid_sources ?? [];
}

function sourceRefMatches(ref, work) {
  if (ref === work) return true;
  if (ref && typeof ref === 'object') {
    const match = /^([^#]+)#(\d+)$/.exec(work);
    return Boolean(match && ref.repository?.toLowerCase() === match[1].toLowerCase() && ref.number === Number(match[2]));
  }
  return false;
}

function packetEntry(result, predicate) {
  return (result.packet?.entries ?? []).find(predicate);
}

function endpointOf(command) {
  return command.find((value) => value.startsWith('repos/'));
}

const formalCases = [
  {
    name: 'malformed primary PR body',
    kind: 'pr',
    body: malformedPrBody,
    code: 'record-context-invalid',
  },
  {
    name: 'schema-invalid primary PR body',
    kind: 'pr',
    body: schemaInvalidPrBody,
    code: 'record-schema-invalid',
  },
  {
    name: 'malformed routed Issue body',
    kind: 'issue',
    body: malformedIssueBody,
    code: 'record-context-invalid',
  },
  {
    name: 'schema-invalid routed Issue body',
    kind: 'issue',
    body: schemaInvalidIssueBody,
    code: 'record-schema-invalid',
  },
];

for (const scenario of formalCases) {
  test(`check and inspect retain ${scenario.name} beside a valid review`, async (t) => {
    const fixture = await makePrimaryFormalFixture(t, scenario);

    const checkResult = await runCli(['check', '--target', fixture.root, '--work', fixture.work], fixture.env);
    const checked = outputOf(checkResult);
    assert.notEqual(checkResult.exitCode, 0);
    assert.notEqual(checked.status, 'pass');
    assert.match(findingText(checked), new RegExp(scenario.code));

    const invalidSource = invalidSourcesOf(checked).find((source) => sourceRefMatches(source.ref, fixture.work));
    assert.ok(invalidSource, 'the complete check report retains the formal source identity');
    assert.equal(invalidSource.body, scenario.body, 'the complete check report retains the exact source body');
    assert.ok(invalidSource.findings?.some((finding) => finding.code === scenario.code),
      'the retained source carries the expected parse or schema diagnostic');
    if (scenario.code === 'record-context-invalid') {
      assert.match(JSON.stringify(invalidSource.findings), /Malformed record JSON/);
    } else {
      assert.ok(invalidSource.findings.some((finding) => Array.isArray(finding.details) && finding.details.length),
        'schema diagnostics retain validator details');
    }

    const inspectResult = await runCli([
      'inspect', '--target', fixture.root, '--work', fixture.work,
      '--max-inline-bytes', String(packetBudget),
    ], fixture.env);
    const inspected = outputOf(inspectResult);
    assert.notEqual(inspectResult.exitCode, 0);
    assert.notEqual(inspected.status, 'pass');
    assert.match(findingText(inspected), new RegExp(scenario.code));
    assert.ok(Buffer.byteLength(inspectResult.stdout, 'utf8') <= packetBudget,
      'the complete inspect response remains within the packet budget');

    const primaryEntry = packetEntry(inspected, (entry) => entry.ref === fixture.work);
    assert.ok(primaryEntry, 'inspect retains the formal source identity in its packet');
    assert.equal(primaryEntry.disposition, 'inlined');
    assert.match(primaryEntry.content, new RegExp(scenario.body.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      'inspect retains the exact formal source body');
    const validReviewEntry = packetEntry(inspected, (entry) => entry.ref?.comment_id === 101);
    assert.ok(validReviewEntry, 'the valid neighboring review remains in the packet');
    assert.match(validReviewEntry.content, /"reviewer_session"/);

    const commands = await readLog(fixture.ghLog);
    assert.ok(commands.length, 'the test used the active fake GitHub environment');
    if (scenario.kind === 'pr') {
      assert.ok(commands.some((command) => endpointOf(command) === 'repos/example/consumer/issues/43'));
      assert.ok(commands.some((command) => endpointOf(command) === 'repos/example/consumer/pulls/43'));
    } else {
      assert.ok(commands.some((command) => endpointOf(command) === 'repos/example/consumer/issues/42'));
    }
  });
}

test('a configured Task without formal context is distinct from an unclassified rough Request', async (t) => {
  const routedFixture = await makeRoutedTaskMissingFixture(t);
  const routedResult = await runCli(['check', '--target', routedFixture.root, '--work', routedFixture.work], routedFixture.env);
  const routed = outputOf(routedResult);
  assert.notEqual(routed.status, 'pass');
  assert.match(findingText(routed), /record-context-missing|record-context-required/);
  assert.doesNotMatch(findingText(routed), /rough-intake-context/);
  assert.deepEqual(routed.records?.[0]?.context?.issue?.labels, [{ name: routedFixture.taskLabel }]);
  assert.equal(routed.records?.[0]?.context?.issue?.body, routedFixture.body);
  const routedSource = invalidSourcesOf(routed).find((source) => sourceRefMatches(source.ref, routedFixture.work));
  assert.ok(routedSource, 'a routed Task missing its required formal context retains its source');
  assert.equal(routedSource.body, routedFixture.body);
  assert.ok(routedSource.findings?.some((finding) => finding.code === 'record-context-missing'));

  const roughFixture = await makeRoughRequestFixture(t);
  const roughResult = await runCli(['check', '--target', roughFixture.root, '--work', roughFixture.work], roughFixture.env);
  const rough = outputOf(roughResult);
  assert.equal(rough.status, 'incomplete');
  assert.match(findingText(rough), /rough-intake-context/);
  assert.doesNotMatch(findingText(rough), /record-context-(missing|invalid)|record-schema-invalid/);
  assert.deepEqual(invalidSourcesOf(rough), [], 'absence is not reported as a malformed formal source');
  assert.equal(rough.records?.[0]?.context?.issue?.body, roughFixture.body);

  const inspectResult = await runCli([
    'inspect', '--target', roughFixture.root, '--work', roughFixture.work,
    '--max-inline-bytes', String(packetBudget),
  ], roughFixture.env);
  const inspected = outputOf(inspectResult);
  assert.equal(inspectResult.exitCode, 0);
  assert.equal(inspected.status, 'pass');
  assert.doesNotMatch(findingText(inspected), /record-context-(missing|invalid)|record-schema-invalid/);
  const entry = packetEntry(inspected, (candidate) => candidate.ref === roughFixture.work);
  assert.ok(entry);
  assert.match(entry.content, new RegExp(roughFixture.body.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
