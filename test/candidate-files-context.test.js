import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import {
  makeCandidateFilesFixture,
  readLog,
  workPull,
} from './fixtures/candidate-files-context/helpers.mjs';

const execFile = promisify(execFileCallback);
const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname);
const cliPath = process.env.CANDIDATE_FILES_CLI_PATH || path.join(repositoryRoot, 'src', 'cli.js');

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

function endpoints(log) {
  return log.filter((args) => args[0] === 'api')
    .map((args) => args.find((value) => value.startsWith('repos/')))
    .filter(Boolean);
}

function findingText(result) {
  return JSON.stringify(result.findings ?? result);
}

test('inspect rejects a changed-file inventory when PR head/base changes after initial metadata', async (t) => {
  const fixture = await makeCandidateFilesFixture(t, { mode: 'drift' });
  const result = await runCli([
    'inspect', '--target', fixture.root, '--work', fixture.work, '--max-inline-bytes', '65536',
  ], fixture.env);
  const inspected = outputOf(result);
  assert.notEqual(inspected.status, 'pass',
    'mutable changed-file rows cannot be attached to an earlier PR tuple');
  assert.match(findingText(inspected), /stale|changed|candidate|head|base|inventory/i);
  const apiEndpoints = endpoints(await readLog(fixture.ghLog));
  assert.ok(apiEndpoints.filter((endpoint) => endpoint === 'repos/example/consumer/pulls/43').length >= 2,
    'the PR identity is rechecked after changed-file acquisition');
  const observed = (await readFile(fixture.observedLog, 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line))
    .filter((entry) => entry.resource === 'pulls/43');
  assert.ok(observed.length >= 3, 'the fake GitHub source records initial and post-files PR metadata observations');
  const beforeFiles = observed.filter((entry) => !entry.files_seen);
  const afterFiles = observed.find((entry) => entry.files_seen);
  assert.ok(beforeFiles.length >= 2, 'initial tuple is stable through policy resolution before files acquisition');
  assert.ok(afterFiles, 'the changed tuple is served only after the files endpoint was requested');
  assert.equal(beforeFiles.every((entry) => entry.value.head.sha === fixture.initialPull.head.sha), true);
  assert.equal(beforeFiles.every((entry) => entry.value.base.ref === fixture.initialPull.base.ref), true);
  assert.notEqual(afterFiles.value.head.sha, fixture.initialPull.head.sha,
    'the observed PR head actually changed after the files request');
  assert.notEqual(afterFiles.value.base.ref, fixture.initialPull.base.ref,
    'the observed PR destination actually changed after the files request');
  const packetEntries = inspected.packet?.entries ?? [];
  assert.equal(packetEntries.some((entry) => entry.ref?.revision === fixture.initialPull.head.sha && entry.ref?.path === fixture.changedPath), false,
    'changed patches are not assigned to the original PR head');
});

test('inspect rejects a changed-file packet when PR changed_files count disagrees with flattened rows', async (t) => {
  const fixture = await makeCandidateFilesFixture(t, { mode: 'count-mismatch' });
  const result = await runCli([
    'inspect', '--target', fixture.root, '--work', fixture.work, '--max-inline-bytes', '65536',
  ], fixture.env);
  const inspected = outputOf(result);
  assert.notEqual(inspected.status, 'pass',
    'a packet with an incomplete changed-file inventory cannot be reported complete');
  assert.match(findingText(inspected), /changed.?files|inventory|count|complete|mismatch/i);
});
