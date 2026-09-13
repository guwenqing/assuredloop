import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import test from 'node:test';

import {
  alternateHead,
  makeTraceFixture,
  readLog,
  workIssue,
  workPull,
} from './fixtures/trace-cli/helpers.mjs';
import { patchScenario } from './fixtures/packet-response-review/helpers.mjs';

const execFile = promisify(execFileCallback);
const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname);
const cliPath = path.join(repositoryRoot, 'src', 'cli.js');
const packetBudget = 4096;

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

function parseOutput(result) {
  assert.ok(result.stdout.trim(), `CLI returned no JSON output; stderr: ${result.stderr}`);
  return JSON.parse(result.stdout.trim());
}

function packetOf(result) {
  return result.packet ?? result.context?.packet;
}

function findingsOf(result) {
  return [
    ...(Array.isArray(result.findings) ? result.findings : []),
    ...(Array.isArray(result.policy?.findings) ? result.policy.findings : []),
    ...(Array.isArray(result.context?.findings) ? result.context.findings : []),
  ];
}

function endpointOf(command) {
  return command.find((value) => value.startsWith('repos/'));
}

async function collectInspectPages(fixture, work, maxInlineBytes = packetBudget) {
  const pages = [];
  const outputs = [];
  let cursor;
  for (let index = 0; index < 32; index += 1) {
    const args = ['inspect', '--target', fixture.root, '--work', work,
      '--max-inline-bytes', String(maxInlineBytes)];
    if (cursor) args.push('--cursor', cursor);
    const result = await runCli(args, fixture.env);
    const parsed = parseOutput(result);
    outputs.push({ result, parsed });
    pages.push(packetOf(parsed));
    cursor = packetOf(parsed)?.next_cursor;
    if (!cursor) return { outputs, pages };
  }
  assert.fail('bounded inspect pagination did not terminate');
}

test('inspect bounds every complete serialized CLI response page, including envelope and newline', async (t) => {
  const fixture = await makeTraceFixture(t, { head: alternateHead });
  const { outputs, pages } = await collectInspectPages(fixture, workIssue);

  assert.ok(pages.length > 1, 'the fixture must exercise a continuation page');
  for (const { result, parsed } of outputs) {
    assert.ok(parsed.packet, 'each response carries a reviewer packet page');
    assert.ok(
      Buffer.byteLength(result.stdout, 'utf8') <= packetBudget,
      `complete JSON response plus newline must fit ${packetBudget} UTF-8 bytes; got ${Buffer.byteLength(result.stdout, 'utf8')}`,
    );
    assert.equal(result.stdout.endsWith('\n'), true, 'CLI responses are newline terminated');
    assert.equal(Buffer.byteLength(JSON.stringify(parsed.packet), 'utf8') + 1 <= packetBudget, true,
      'the packet itself may fit while the complete response is independently bounded');
  }
});

test('inspect inventories every paginated PR changed file as a depth-0 candidate root', async (t) => {
  const fixture = await makeTraceFixture(t, { head: alternateHead });
  const candidateFiles = [
    { filename: 'README.md', status: 'modified', additions: 1, deletions: 0, changes: 1 },
    { filename: 'openspec/changes/trace-cli/design.md', status: 'modified', additions: 2, deletions: 1, changes: 3 },
    { filename: 'openspec/changes/trace-cli/tasks.md', status: 'modified', additions: 1, deletions: 0, changes: 1 },
    { filename: 'removed-from-head.txt', status: 'removed', additions: 0, deletions: 4, changes: 4 },
  ];
  await patchScenario(fixture, (scenario) => {
    scenario.records['pulls/43'].head.sha = fixture.revision;
    scenario.records['pulls/43/files'] = [candidateFiles.slice(0, 2), candidateFiles.slice(2)];
  });

  const { outputs, pages } = await collectInspectPages(fixture, workPull, 4096);
  const entries = pages.flatMap((page) => page?.entries ?? []);
  const candidateEntries = candidateFiles.map((file) => {
    const matches = entries.filter((entry) => entry.ref?.repository === fixture.config.repository.name &&
      entry.ref?.revision === fixture.revision && entry.ref?.path === file.filename &&
      !Object.hasOwn(entry.ref, 'anchor'));
    assert.equal(matches.length, 1, `changed file ${file.filename} appears once as a structured candidate root`);
    assert.equal(matches[0].depth, 0, `changed file ${file.filename} is a packet root`);
    return matches[0];
  });

  assert.equal(candidateEntries.find((entry) => entry.ref.path === 'README.md').disposition, 'inlined');
  const removed = candidateEntries.find((entry) => entry.ref.path === 'removed-from-head.txt');
  assert.equal(removed.disposition, 'unavailable', 'a removed head path remains visible as unavailable');
  assert.match(removed.reason, /missing|unavailable|removed|path/i);
  assert.equal(Object.hasOwn(removed, 'content'), false);

  const commands = await readLog(fixture.ghLog);
  const fileCommands = commands.filter((command) => endpointOf(command)?.startsWith('repos/example/consumer/pulls/43/files'));
  assert.ok(fileCommands.length >= 1, 'changed-file inventory is requested');
  assert.ok(fileCommands.every((command) => command.includes('--paginate') && command.includes('--slurp')),
    'changed-file inventory requests are paginated');
  assert.ok(fileCommands.every((command) => command[command.indexOf('--method') + 1] === 'GET'),
    'changed-file inventory requests are read-only');
});

test('inspect reports an unavailable changed-file inventory instead of a complete packet', async (t) => {
  const fixture = await makeTraceFixture(t, { head: alternateHead });
  await patchScenario(fixture, (scenario) => {
    scenario.missing = ['pulls/43/files'];
  });

  const result = await runCli([
    'inspect', '--target', fixture.root, '--work', workPull,
    '--max-inline-bytes', String(packetBudget),
  ], fixture.env);
  const inspected = parseOutput(result);

  assert.notEqual(result.exitCode, 0, 'missing PR file inventory cannot pass as a complete inspect');
  assert.notEqual(inspected.status, 'pass');
  assert.match(JSON.stringify(findingsOf(inspected)), /unavailable|tool|not-found|files/i);
  const commands = await readLog(fixture.ghLog);
  assert.equal(commands.some((command) => endpointOf(command)?.startsWith('repos/example/consumer/pulls/43/files')), true,
    'the missing changed-file inventory is actually requested');
});

test('inspect preserves a title-only rough Request in its packet source content', async (t) => {
  const fixture = await makeTraceFixture(t, { head: alternateHead });
  const title = 'Preserve exactly this title-only original request';
  await patchScenario(fixture, (scenario) => {
    scenario.records['issues/1'] = {
      ...scenario.records['issues/1'],
      title,
      body: null,
    };
  });

  const result = await runCli([
    'inspect', '--target', fixture.root, '--work', workIssue,
    '--max-inline-bytes', '65536',
  ], fixture.env);
  const inspected = parseOutput(result);
  assert.equal(result.exitCode, 0);
  const entry = packetOf(inspected)?.entries?.find((candidate) => candidate.ref === workIssue.replace('#42', '#1'));
  assert.ok(entry, 'the source Request is retained as an explicit packet reference');
  assert.equal(entry.disposition, 'inlined');
  const metadata = JSON.parse(entry.content.split('\n\n', 1)[0]);
  assert.equal(metadata.issue.title, title, 'the original Request title remains in packet content');
  assert.equal(metadata.issue.body, null, 'a null body stays distinguishable from a missing title-only source');
});

test('inspect cursor becomes stale when a title-only rough Request changes', async (t) => {
  const fixture = await makeTraceFixture(t, { head: alternateHead });
  await patchScenario(fixture, (scenario) => {
    scenario.records['issues/1'] = {
      ...scenario.records['issues/1'],
      title: 'Title before the first packet page',
      body: null,
    };
  });
  const firstResult = await runCli([
    'inspect', '--target', fixture.root, '--work', workIssue,
    '--max-inline-bytes', String(packetBudget),
  ], fixture.env);
  const first = parseOutput(firstResult);
  const firstPacket = packetOf(first);
  assert.equal(firstResult.exitCode, 0);
  assert.ok(firstPacket?.next_cursor, 'the title-only fixture produces a continuation cursor');

  await patchScenario(fixture, (scenario) => {
    scenario.records['issues/1'].title = 'Title changed after the first packet page';
  });
  const secondResult = await runCli([
    'inspect', '--target', fixture.root, '--work', workIssue,
    '--max-inline-bytes', String(packetBudget), '--cursor', firstPacket.next_cursor,
  ], fixture.env);
  const second = parseOutput(secondResult);

  assert.notEqual(secondResult.exitCode, 0, 'a cursor cannot continue after a title-only source change');
  assert.match(JSON.stringify(findingsOf(second)), /packet-stale|stale|changed|freshness|context/i);
});
