import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { validateRecord } from '../src/records.js';
import { makeDefaultBudgetFixture } from './fixtures/default-review-budget/helpers.mjs';

const execFile = promisify(execFileCallback);
const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname);
const cliPath = path.join(repositoryRoot, 'src', 'cli.js');

async function runCli(args, env) {
  try {
    const result = await execFile(process.execPath, [cliPath, ...args], {
      env,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { ...result, exitCode: 0 };
  } catch (error) {
    return { stdout: error.stdout ?? '', stderr: error.stderr ?? '', exitCode: error.code };
  }
}

function outputOf(result) {
  assert.ok(result.stdout.trim(), `CLI returned no JSON output; stderr: ${result.stderr}`);
  return JSON.parse(result.stdout.trim());
}

function packetOf(result) {
  return result.packet ?? result.context?.packet;
}

test('a schema-valid config without review.context uses the 65536-byte default', async (t) => {
  const fixture = await makeDefaultBudgetFixture(t);
  assert.equal(Object.hasOwn(fixture.config.project.review, 'context'), false);
  assert.equal(validateRecord('config', fixture.config).valid, true);

  const result = await runCli([
    'inspect', '--target', fixture.root, '--work', fixture.work,
  ], fixture.env);
  const inspected = outputOf(result);

  assert.equal(result.exitCode, 0, JSON.stringify(inspected));
  assert.equal(inspected.status, 'pass', JSON.stringify(inspected));
  assert.equal(inspected.policy?.status, 'available');
  assert.equal(packetOf(inspected)?.limits?.max_inline_bytes, 65536);
});

test('an explicit CLI max-inline-bytes still narrows the omitted-context default', async (t) => {
  const fixture = await makeDefaultBudgetFixture(t);
  const responseBudget = 2048;
  const result = await runCli([
    'inspect', '--target', fixture.root, '--work', fixture.work,
    '--max-inline-bytes', String(responseBudget),
  ], fixture.env);
  const inspected = outputOf(result);

  assert.equal(result.exitCode, 0, JSON.stringify(inspected));
  assert.equal(inspected.status, 'pass', JSON.stringify(inspected));
  assert.equal(packetOf(inspected)?.limits?.max_inline_bytes, responseBudget);
  assert.ok(Buffer.byteLength(result.stdout, 'utf8') <= responseBudget,
    'the narrowed complete inspect response remains within the explicit CLI budget');
});
