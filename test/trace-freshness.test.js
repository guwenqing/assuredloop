import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import {
  alternateHead,
  git,
  installDynamicMutation,
  makeTraceFixture,
  patchScenarioRecord,
  readLog,
  readScenario,
  workIssue,
  workPull,
} from './fixtures/trace-freshness/helpers.mjs';

const execFile = promisify(execFileCallback);
const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname);
const cliPath = path.join(repositoryRoot, 'src', 'cli.js');
const responseBudget = 2048;

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

function packetOf(result) {
  return result.packet ?? result.context?.packet;
}

function findingsText(result) {
  return JSON.stringify([
    ...(Array.isArray(result.findings) ? result.findings : []),
    ...(Array.isArray(result.context?.findings) ? result.context.findings : []),
    ...(Array.isArray(result.policy?.findings) ? result.policy.findings : []),
  ]);
}

async function firstCursor(t, work) {
  const fixture = await makeTraceFixture(t);
  const firstResult = await runCli([
    'inspect', '--target', fixture.root, '--work', work, '--max-inline-bytes', String(responseBudget),
  ], fixture.env);
  const first = outputOf(firstResult);
  assert.equal(firstResult.exitCode, 0);
  assert.equal(first.operation, 'inspect');
  assert.ok(Buffer.byteLength(firstResult.stdout, 'utf8') <= responseBudget,
    'the complete first response and newline fit the declared byte budget');
  const packet = packetOf(first);
  assert.ok(packet && packet.next_cursor, 'fixture must produce a continuation cursor');
  return { fixture, packet };
}

test('inspect cursor rejects a changed PR head or destination after the first page', async (t) => {
  for (const [label, patch] of [
    ['head', async (fixture) => ({
      head: { ...((await readScenario(fixture)).records['pulls/43'].head), sha: alternateHead },
    })],
    ['base', async (fixture) => ({
      base: { ...((await readScenario(fixture)).records['pulls/43'].base), ref: 'release' },
    })],
  ]) {
    await t.test(`changed ${label}`, async (subtest) => {
      const { fixture, packet } = await firstCursor(subtest, workPull);
      const before = await readScenario(fixture);
      const body = before.records['pulls/43'].body;
      const mutation = await patch(fixture);
      await patchScenarioRecord(fixture, 'pulls/43', mutation);
      const after = await readScenario(fixture);
      assert.equal(after.records['pulls/43'].body, body, 'only immutable packet context changes');

      const secondResult = await runCli([
        'inspect', '--target', fixture.root, '--work', workPull,
        '--max-inline-bytes', String(responseBudget), '--cursor', packet.next_cursor,
      ], fixture.env);
      const second = outputOf(secondResult);
      assert.notEqual(secondResult.exitCode, 0, 'a cursor cannot continue across a changed PR assessment tuple');
      assert.match(findingsText(second), /packet-stale|stale|changed|freshness|context/i);
    });
  }
});

test('inspect cursor rejects a changed Issue state while its body and references stay unchanged', async (t) => {
  const { fixture, packet } = await firstCursor(t, workIssue);
  const before = await readScenario(fixture);
  const body = before.records['issues/42'].body;
  await patchScenarioRecord(fixture, 'issues/42', { state: 'closed', state_reason: 'completed' });
  const after = await readScenario(fixture);
  assert.equal(after.records['issues/42'].body, body);

  const secondResult = await runCli([
    'inspect', '--target', fixture.root, '--work', workIssue,
    '--max-inline-bytes', String(responseBudget), '--cursor', packet.next_cursor,
  ], fixture.env);
  const second = outputOf(secondResult);
  assert.notEqual(secondResult.exitCode, 0, 'a cursor cannot continue after the bound Issue changes state');
  assert.match(findingsText(second), /packet-stale|stale|changed|freshness|context/i);
});

test('check reports a same-run Issue body/state change and retains the source Evidence reference', async (t) => {
  const fixture = await makeTraceFixture(t, { candidateActivation: true });
  const changedBody = `${fixture.issueBody}\n<!-- changed after the first bound Issue read -->\n`;
  await installDynamicMutation(fixture, {
    resource: 'issues/42',
    patch: { body: changedBody, state: 'closed', state_reason: 'completed' },
  });

  const result = await runCli([
    'check', '--target', fixture.root, '--work', workPull,
  ], fixture.env);
  const checked = outputOf(result);
  assert.notEqual(result.exitCode, 0, 'check must reject a bound Issue changing during one assessment');
  assert.notEqual(checked.status, 'pass');
  assert.match(findingsText(checked), /stale|changed|freshness|context/i);
  assert.doesNotMatch(findingsText(checked), /evidence-source-unavailable/,
    'the source Evidence reference remains available while the Issue context changes');
  const commands = await readLog(fixture.ghLog);
  const endpoints = commands
    .filter((args) => args[0] === 'api')
    .map((args) => args.find((value) => value.startsWith('repos/')))
    .filter(Boolean);
  assert.ok(endpoints.includes('repos/example/consumer/issues/comments/100'),
    'the existing structured Evidence source is still read');
  assert.ok(endpoints.filter((endpoint) => endpoint === 'repos/example/consumer/issues/42').length >= 2,
    'check performs a final bound Issue re-read before accepting its result');
  assert.equal(await git(fixture.root, ['status', '--porcelain']).then(({ stdout }) => stdout), fixture.statusBefore);
  assert.equal(await readFile(path.join(fixture.root, 'README.md'), 'utf8'), '# trace fixture\n');
});
