import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import {
  alternateHead,
  git,
  makeTraceFixture,
  readLog,
  repoRef,
  workIssue,
  workPull,
} from './fixtures/trace-cli/helpers.mjs';

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

function findingsOf(result) {
  const values = [
    ...(Array.isArray(result.findings) ? result.findings : []),
    ...(Array.isArray(result.context?.findings) ? result.context.findings : []),
    ...(Array.isArray(result.policy?.findings) ? result.policy.findings : []),
  ];
  return values;
}

function findingText(result) {
  return JSON.stringify(findingsOf(result));
}

function packetOf(result) {
  return result.packet ?? result.context?.packet;
}

function pullsOf(result) {
  return result.context?.pulls ?? result.context?.pull_requests ?? result.context?.associated_pulls ??
    result.pulls ?? result.pull_requests ?? result.associated_pulls ?? [];
}

function assertPacketPage(packet) {
  assert.ok(packet && typeof packet === 'object', 'inspect exposes a reviewer packet');
  assert.ok(Array.isArray(packet.entries), 'packet retains the structured inventory entries');
  assert.ok(packet.counts && typeof packet.counts.total === 'number', 'packet exposes a stable total count');
  assert.ok(Object.hasOwn(packet, 'next_cursor'), 'packet exposes pagination state');
  assert.ok(packet.limits && typeof packet.limits === 'object', 'packet exposes its configured limits');
}

test('inspect resolves an Issue through explicit comments and timeline relations, paginates, and stays read-only', async (t) => {
  const fixture = await makeTraceFixture(t);
  const result = await runCli([
    'inspect', '--target', fixture.root, '--work', workIssue, '--max-inline-bytes', '2048',
  ], fixture.env);
  const inspected = outputOf(result);

  assert.equal(result.exitCode, 0);
  assert.ok(Buffer.byteLength(result.stdout, 'utf8') <= 2048,
    'the complete inspect response and newline fit the declared byte budget');
  assert.equal(result.stdout.endsWith('\n'), true, 'inspect responses are newline terminated');
  assert.equal(inspected.operation, 'inspect');
  assert.equal(inspected.mode, 'live');
  assert.equal(inspected.status, 'pass');
  assert.equal(inspected.work, workIssue);
  assert.equal(inspected.context?.issue?.number, 42);
  assert.equal(pullsOf(inspected).some((pull) => pull.number === 43), true,
    'the explicitly reciprocal PR is included in Issue context');
  assert.equal(pullsOf(inspected).some((pull) => pull.number === 45), true,
    'a reciprocal PR found on a later timeline page is included in the full inventory');
  assert.equal(pullsOf(inspected).some((pull) => pull.number === 44), false,
    'an unrelated timeline cross-reference is retained as non-delivery context, not guessed as the PR');

  const packet = packetOf(inspected);
  assertPacketPage(packet);
  assert.ok(packet.counts.total >= 3, 'Issue, scoped work and evidence roots are inventoried');
  assert.ok(Buffer.byteLength(JSON.stringify(packet), 'utf8') + 1 <= 2048,
    'the serialized packet remains within the declared byte budget');

  const commands = await readLog(fixture.ghLog);
  const apiCommands = commands.filter((args) => args[0] === 'api');
  const endpoints = apiCommands.map((args) => args.find((value) => value.startsWith('repos/'))).filter(Boolean);
  assert.ok(endpoints.some((endpoint) => endpoint.startsWith(`repos/example/consumer/issues/42/comments`)),
    'all Issue evidence comments are read through the fixed endpoint');
  assert.ok(endpoints.some((endpoint) => endpoint.startsWith(`repos/example/consumer/issues/42/timeline`)),
    'cross-referenced PR inventory is read through the fixed timeline endpoint');
  assert.ok(endpoints.includes('repos/example/consumer/pulls/43'),
    'the structured reciprocal PR is fetched');
  assert.ok(endpoints.includes('repos/example/consumer/pulls/45'),
    'the reciprocal PR on the later timeline page is fetched');
  assert.equal(endpoints.some((endpoint) => endpoint.includes('/pulls/44')), false);
  const commentsCommand = apiCommands.find((args) => args.some((value) => value.startsWith('repos/example/consumer/issues/42/comments')));
  const timelineCommand = apiCommands.find((args) => args.some((value) => value.startsWith('repos/example/consumer/issues/42/timeline')));
  assert.ok(commentsCommand?.includes('--paginate') && commentsCommand?.includes('--slurp'));
  assert.ok(timelineCommand?.includes('--paginate') && timelineCommand?.includes('--slurp'));
  assert.equal(apiCommands.every((args) => args[args.indexOf('--method') + 1] === 'GET'), true,
    'inspect uses GET-only GitHub reads');
  assert.equal(apiCommands.some((args) => args.some((value) => value.includes('evil.invalid'))), false,
    'URLs in ticket prose never become request targets');
  assert.equal(await git(fixture.root, ['status', '--porcelain']).then(({ stdout }) => stdout), fixture.statusBefore,
    'inspect does not write the target checkout');
  assert.equal((await git(fixture.root, ['remote', 'get-url', 'origin'])).stdout.trim(), 'https://github.com/example/consumer.git');
  assert.equal(await readFile(path.join(fixture.root, 'README.md'), 'utf8'), '# trace fixture\n');
});

test('inspect keeps over-budget references in the inventory and accepts explicit structured expansion', async (t) => {
  const fixture = await makeTraceFixture(t);
  const responseBudget = 2048;
  const firstResult = await runCli([
    'inspect', '--target', fixture.root, '--work', workIssue, '--max-inline-bytes', String(responseBudget),
  ], fixture.env);
  const first = outputOf(firstResult);
  assert.equal(firstResult.exitCode, 0);
  assert.equal(first.operation, 'inspect');
  const firstPacket = packetOf(first);
  assertPacketPage(firstPacket);
  assert.ok(firstPacket.entries.some((entry) => ['over-budget', 'outside-depth', 'inlined'].includes(entry.disposition)));
  assert.ok(Buffer.byteLength(firstResult.stdout, 'utf8') <= responseBudget,
    'complete serialized response and newline fit the UTF-8 byte budget');
  assert.ok(Buffer.byteLength(JSON.stringify(firstPacket), 'utf8') + 1 <= responseBudget,
    'packet metadata and any inline content fit the UTF-8 byte budget');
  assert.ok(firstPacket.next_cursor, 'the bounded CLI packet exposes a continuation cursor');
  const firstKeys = new Set(firstPacket.entries.map((entry) => JSON.stringify(entry.ref)));

  const nextResult = await runCli([
    'inspect', '--target', fixture.root, '--work', workIssue,
    '--max-inline-bytes', String(responseBudget), '--cursor', firstPacket.next_cursor,
  ], fixture.env);
  const next = outputOf(nextResult);
  assert.equal(nextResult.exitCode, 0);
  const nextPacket = packetOf(next);
  assertPacketPage(nextPacket);
  assert.ok(Buffer.byteLength(nextResult.stdout, 'utf8') <= responseBudget,
    'complete continuation response and newline fit the UTF-8 byte budget');
  assert.equal(nextPacket.counts.total, firstPacket.counts.total);
  assert.equal(nextPacket.entries.some((entry) => firstKeys.has(JSON.stringify(entry.ref))), false,
    'continuation pages do not duplicate the prior page');

  const expansion = JSON.stringify(repoRef(
    fixture.revision,
    'openspec/changes/trace-cli/design.md',
    '5-small-local-tools-and-explicit-trust-boundaries',
  ));
  const expandedResult = await runCli([
    'inspect', '--target', fixture.root, '--work', workIssue,
    '--max-inline-bytes', '65536', '--expand', expansion,
  ], fixture.env);
  const expanded = outputOf(expandedResult);
  assert.equal(expandedResult.exitCode, 0);
  assert.equal(expanded.operation, 'inspect');
  const expandedPacket = packetOf(expanded);
  assertPacketPage(expandedPacket);
  const expandedEntry = expandedPacket.entries.find((entry) => entry.ref?.path === 'openspec/changes/trace-cli/design.md');
  assert.ok(expandedEntry, 'the explicit structured RepoRef remains in the packet inventory');
  assert.equal(expandedEntry.disposition, 'inlined');
});

test('check assembles a formal bootstrap result while retaining semantic authorization and not-active findings', async (t) => {
  const fixture = await makeTraceFixture(t, { candidateActivation: true });
  const result = await runCli([
    'check', '--target', fixture.root, '--work', workPull,
  ], fixture.env);
  const checked = outputOf(result);

  assert.equal(result.exitCode, 0);
  assert.equal(checked.operation, 'check');
  assert.equal(checked.mode, 'live');
  assert.equal(checked.status, 'pass', 'formal checks can pass without claiming semantic authorization');
  assert.equal(checked.context?.pulls?.[0]?.number ?? checked.context?.pull?.number, 43);
  assert.equal(checked.policy?.mode, 'bootstrap', 'destination base policy is selected');
  assert.equal(checked.policy?.activation, null, 'candidate activation content cannot authorize itself');
  assert.match(findingText(checked), /semantic-authorization-review-required/);
  assert.match(findingText(checked), /not-active/);
  const checkCommands = await readLog(fixture.ghLog);
  const checkEndpoints = checkCommands
    .filter((args) => args[0] === 'api')
    .map((args) => args.find((value) => value.startsWith('repos/')))
    .filter(Boolean);
  assert.ok(checkEndpoints.includes('repos/example/consumer/git/ref/heads/main'),
    'freshness is checked against the fixed destination branch ref');
  assert.equal(await git(fixture.root, ['status', '--porcelain']).then(({ stdout }) => stdout), fixture.statusBefore);
});

test('check rejects retargeted or stale review evidence instead of transferring a prior assessment', async (t) => {
  const retargetedFixture = await makeTraceFixture(t, {
    baseRef: 'release',
    evidenceBaseRef: 'main',
  });
  const retargetedResult = await runCli([
    'check', '--target', retargetedFixture.root, '--work', workPull,
  ], retargetedFixture.env);
  const retargeted = outputOf(retargetedResult);
  assert.notEqual(retargeted.status, 'pass');
  assert.match(findingText(retargeted), /stale|retarget|base_ref|destination/i);

  const advancedFixture = await makeTraceFixture(t, { advanceDestination: true });
  const advancedResult = await runCli([
    'check', '--target', advancedFixture.root, '--work', workPull,
  ], advancedFixture.env);
  const advanced = outputOf(advancedResult);
  assert.notEqual(advanced.status, 'pass');
  assert.match(findingText(advanced), /stale|fresh|base|destination/i);
  const assessedBase = advanced.assessment?.base_sha ?? advanced.policy?.assessment?.base_sha ?? advanced.context?.base_sha;
  assert.equal(assessedBase, advancedFixture.revision,
    'the assessed base remains the PR base');
  assert.notEqual(assessedBase, advancedFixture.destinationRevision,
    'current destination advancement is reported rather than rewriting the historical assessment');

  const localOnlyAdvanceFixture = await makeTraceFixture(t, { localHeadOnly: true });
  const localOnlyAdvanceResult = await runCli([
    'check', '--target', localOnlyAdvanceFixture.root, '--work', workPull,
  ], localOnlyAdvanceFixture.env);
  const localOnlyAdvance = outputOf(localOnlyAdvanceResult);
  assert.equal(localOnlyAdvance.status, 'pass',
    'a checkout-only change does not stand in for the remote destination branch');
  assert.doesNotMatch(findingText(localOnlyAdvance), /stale|freshness|destination.*advanced/i);
  assert.equal(localOnlyAdvanceFixture.destinationRevision === localOnlyAdvanceFixture.remoteDestinationRevision, false);
});

test('check distinguishes inaccessible GitHub tooling from a missing accepted evidence record', async (t) => {
  const forbiddenFixture = await makeTraceFixture(t, { mode: 'forbidden' });
  const forbiddenResult = await runCli([
    'check', '--target', forbiddenFixture.root, '--work', workPull,
  ], forbiddenFixture.env);
  const forbidden = outputOf(forbiddenResult);
  assert.notEqual(forbidden.status, 'pass');
  assert.match(findingText(forbidden), /tool-unavailable|insufficient-access|authentication/i);
  assert.doesNotMatch(findingText(forbidden), /record-unavailable.*not-found/i);

  const missingFixture = await makeTraceFixture(t, { missing: ['issues/comments/100'] });
  const missingResult = await runCli([
    'check', '--target', missingFixture.root, '--work', workPull,
  ], missingFixture.env);
  const missing = outputOf(missingResult);
  assert.notEqual(missing.status, 'pass');
  assert.match(findingText(missing), /record-unavailable|policy-unavailable|not-found|unavailable/i);
  assert.doesNotMatch(findingText(missing), /tool-unavailable|insufficient-access/i);
});

test('local-only check is explicitly incomplete and performs no GitHub reads', async (t) => {
  const fixture = await makeTraceFixture(t);
  const result = await runCli([
    'check', '--target', fixture.root, '--work', workIssue, '--local-only',
  ], fixture.env);
  const checked = outputOf(result);

  assert.notEqual(result.exitCode, 0, 'local-only cannot claim a complete live pre-merge check');
  assert.equal(checked.operation, 'check');
  assert.equal(checked.mode, 'local-only');
  assert.equal(checked.status, 'incomplete');
  assert.match(findingText(checked), /github-skipped|policy-unavailable|local-only/i);
  assert.deepEqual(await readLog(fixture.ghLog), [], 'local-only never invokes GitHub');
  assert.equal(await git(fixture.root, ['status', '--porcelain']).then(({ stdout }) => stdout), fixture.statusBefore);
});

test('PR selection is based on the actual GitHub pull-request marker, not caller prose or an arbitrary URL', async (t) => {
  const fixture = await makeTraceFixture(t, { head: alternateHead });
  const result = await runCli([
    'inspect', '--target', fixture.root, '--work', workPull,
  ], fixture.env);
  const inspected = outputOf(result);

  assert.equal(result.exitCode, 0);
  assert.equal(inspected.operation, 'inspect');
  assert.equal(inspected.context?.issue?.number, 43);
  assert.equal(inspected.context?.issue?.pull_request !== undefined, true,
    'the selected work identity is classified from GitHub issue data');
  assert.equal(inspected.context?.pulls?.[0]?.head?.sha ?? inspected.context?.pull?.head?.sha, alternateHead);
  const commands = await readLog(fixture.ghLog);
  const endpoints = commands
    .filter((args) => args[0] === 'api')
    .map((args) => args.find((value) => value.startsWith('repos/')))
    .filter(Boolean);
  assert.ok(endpoints.includes('repos/example/consumer/issues/42'),
    'the PR record\'s explicit structured issues mapping is followed as context');
  assert.equal(endpoints.some((endpoint) => endpoint.includes('/issues/999')), false,
    'PR mode does not scrape an unrelated prose-only Issue URL');
  assert.ok(endpoints.includes('repos/example/consumer/issues/43'));
  assert.ok(endpoints.includes('repos/example/consumer/pulls/43'));
});
