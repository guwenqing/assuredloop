import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import {
  makeCloseoutEvidenceFixture,
  makeNonPrEvidenceFixture,
  makeTraceEvidenceFixture,
  workPull,
} from './fixtures/execution-evidence-review/helpers.mjs';

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

function findingText(result) {
  return JSON.stringify(result);
}

function closeoutArgs(fixture) {
  return [
    'check', '--target', fixture.root, '--work', fixture.work,
    '--delta-ref', JSON.stringify(fixture.deltaRef),
    '--manifest-ref', JSON.stringify(fixture.manifestRef),
  ];
}

test('valid review remains sufficient when ordinary command/exit Evidence is present', async (t) => {
  const fixture = await makeTraceEvidenceFixture(t, { mode: 'mixed' });
  const result = await runCli(['check', '--target', fixture.root, '--work', workPull], fixture.env);
  const checked = outputOf(result);
  assert.equal(result.exitCode, 0, findingText(checked));
  assert.equal(checked.status, 'pass', 'ordinary execution Evidence must not invalidate the valid review');
  assert.doesNotMatch(findingText(checked), /review-evidence-missing/);
  assert.match(findingText(checked), /node --test test\/trace-cli\.test\.js/,
    'the ordinary command remains available as execution evidence');
});

test('verification-only Evidence cannot satisfy the required PR review obligation', async (t) => {
  const fixture = await makeTraceEvidenceFixture(t, { mode: 'verification-only' });
  const result = await runCli(['check', '--target', fixture.root, '--work', workPull], fixture.env);
  const checked = outputOf(result);
  assert.notEqual(checked.status, 'pass');
  assert.match(findingText(checked), /review-evidence-missing|delivery-review-missing/);
  assert.match(findingText(checked), /node --test test\/trace-cli\.test\.js/);
});

test('partial reviewer declarations are invalid instead of becoming ordinary execution Evidence', async (t) => {
  const fixture = await makeTraceEvidenceFixture(t, { mode: 'partial-review' });
  const result = await runCli(['check', '--target', fixture.root, '--work', workPull], fixture.env);
  const checked = outputOf(result);
  assert.notEqual(checked.status, 'pass');
  assert.match(findingText(checked), /review-evidence-invalid/);
});

test('ordinary PR execution Evidence still preserves tuple and source checks without review-role errors', async (t) => {
  const fixture = await makeTraceEvidenceFixture(t, {
    mode: 'mixed',
    ordinary: {
      base_ref: 'release',
      evidence: [{ repository: 'example/consumer', comment_id: 999 }],
    },
  });
  const result = await runCli(['check', '--target', fixture.root, '--work', workPull], fixture.env);
  const checked = outputOf(result);
  assert.notEqual(checked.status, 'pass');
  assert.match(findingText(checked), /stale|tuple|destination|evidence-source-unavailable|source.*unavailable/i,
    'ordinary execution Evidence keeps its fixed tuple and source verification');
  assert.doesNotMatch(findingText(checked), /review-evidence-missing/,
    'a valid review declaration is present; the ordinary record is not a second review obligation');
  assert.match(findingText(checked), /node --test test\/trace-cli\.test\.js/);
});

test('non-PR execution Evidence keeps its source and remains distinct from review coverage', async (t) => {
  const fixture = await makeNonPrEvidenceFixture(t);
  const result = await runCli(['check', '--target', fixture.root, '--work', fixture.researchWork], fixture.env);
  const checked = outputOf(result);
  assert.equal(result.exitCode, 0, findingText(checked));
  assert.equal(checked.status, 'pass');
  assert.match(findingText(checked), /research-review-required/);
  assert.doesNotMatch(findingText(checked), /current-review-(independence|depth|model)|review-evidence-invalid/);
  assert.match(findingText(checked), /node --test test\/trace-cli\.test\.js/);
});

test('closeout keeps synchronization and manifest checks when ordinary execution Evidence accompanies review', async (t) => {
  const fixture = await makeCloseoutEvidenceFixture(t);
  const result = await runCli(closeoutArgs(fixture), fixture.env);
  const checked = outputOf(result);
  assert.equal(result.exitCode, 0, findingText(checked));
  assert.equal(checked.status, 'pass');
  assert.doesNotMatch(findingText(checked), /review-evidence-missing/);
  assert.equal(checked.synchronization?.status, 'valid');
  assert.equal(checked.manifest?.valid, true);
  assert.match(findingText(checked), /node --test test\/closeout-cli\.test\.js/);
});

test('ordinary execution Evidence retains exact command and exit fields in the source record', async (t) => {
  const fixture = await makeTraceEvidenceFixture(t, { mode: 'mixed' });
  const result = await runCli(['inspect', '--target', fixture.root, '--work', workPull], fixture.env);
  const inspected = outputOf(result);
  assert.equal(result.exitCode, 0, findingText(inspected));
  const ordinaryEntry = inspected.packet?.entries?.find((entry) => entry.ref?.comment_id === 109);
  assert.ok(ordinaryEntry, 'the ordinary Evidence source remains in the inspect packet');
  const ordinary = JSON.parse(ordinaryEntry.content);
  assert.equal(ordinary.command, 'node --test test/trace-cli.test.js');
  assert.equal(ordinary.exit_code, 0);
  const commands = (await readFile(fixture.ghLog, 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(commands.some((args) => args.includes('--method') && args[args.indexOf('--method') + 1] !== 'GET'), false);
});
