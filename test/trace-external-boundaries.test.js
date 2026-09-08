import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createTrace } from '../src/trace.js';

import {
  commandLog,
  findingText,
  foreignTimelineEvent,
  makeCurrentPolicyDriftFixture,
  makeHistoricalScopeWideningFixture,
  makeLinkedPolicyCeilingFixture,
  makeSecondaryPrerequisiteWideningFixture,
  makeTraceFixture,
  runCli,
  saveScenario,
  scenarioOf,
  withFixtureEnv,
  workIssue,
  workPull,
} from './fixtures/trace-external-boundaries/helpers.mjs';

test('an unrelated foreign timeline PR is reported while the local packet remains inspectable', async (t) => {
  const fixture = await makeTraceFixture(t);
  const scenario = await scenarioOf(fixture);
  scenario.records['issues/42/timeline'] = [[foreignTimelineEvent()]];
  await saveScenario(fixture, scenario);

  const result = await runCli(['inspect', '--target', fixture.root, '--work', workIssue], fixture.env);
  const packet = result.data?.packet;
  const commands = await commandLog(fixture);
  const endpoints = commands
    .filter((args) => args[0] === 'api')
    .flatMap((args) => args.filter((value) => value.startsWith('repos/')));

  assert.ok(result.data, 'inspect returns a structured result even when discovery finds an out-of-scope relation');
  assert.ok(findingText(result).includes('reference-out-of-scope'),
    'the unrelated relation remains an explicit out-of-scope finding');
  assert.ok(packet && Array.isArray(packet.entries),
    'the legitimate local assessment still produces a reviewer packet');
  assert.equal(result.data.context?.pulls?.some((pull) => pull.number === 43), true,
    'the local reciprocal PR remains in the assessment context');
  assert.equal(endpoints.some((endpoint) => endpoint.includes('repos/unrelated/project')), false,
    'an unrelated timeline relation never authorizes a foreign GitHub read');
});

test('a historical base revision cannot widen the current acquisition scope', async (t) => {
  const fixture = await makeHistoricalScopeWideningFixture(t);
  const result = await runCli(['check', '--target', fixture.root, '--work', workPull], fixture.env);
  const commands = await commandLog(fixture);
  const foreign = commands.filter((args) => args.some((value) => value.startsWith('repos/foreign/private')));

  assert.ok(result.data, 'check returns a structured result for the historical assessment');
  assert.notEqual(result.data.status, 'pass',
    'an explicit foreign evidence reference remains nonpassing when its source is outside current scope');
  assert.equal(foreign.length, 0,
    'a recorded historical base cannot authorize a GitHub read outside the current trusted scope');
});

test('a secondary closeout prerequisite cannot widen the primary current acquisition ceiling', async (t) => {
  const fixture = await makeSecondaryPrerequisiteWideningFixture(t);
  const result = await runCli([
    'check', '--target', fixture.root, '--work', fixture.work,
    '--delta-ref', JSON.stringify(fixture.deltaRef),
    '--manifest-ref', JSON.stringify(fixture.manifestRef),
  ], fixture.env);
  const commands = await commandLog(fixture);
  const foreign = commands.filter((args) => args.some((value) => value.startsWith('repos/foreign/secondary')));

  assert.ok(result.data, 'closeout check returns a structured diagnostic');
  assert.notEqual(result.data.status, 'pass',
    'an explicitly required prerequisite source remains nonpassing when it is outside the primary ceiling');
  assert.equal(foreign.length, 0,
    'a prerequisite historical policy cannot authorize a foreign read beyond the closeout request ceiling');
});

test('an Issue request uses only the primary default-branch ceiling for linked PR evidence', async (t) => {
  const fixture = await makeLinkedPolicyCeilingFixture(t);
  const result = await runCli(['inspect', '--target', fixture.root, '--work', workIssue], fixture.env);
  const commands = await commandLog(fixture);
  const endpoints = commands
    .filter((args) => args[0] === 'api')
    .flatMap((args) => args.filter((value) => value.startsWith('repos/')));

  assert.ok(result.data, 'Issue inspection returns a structured result');
  assert.equal(result.data.context?.pulls?.some((pull) => pull.number === 43), true);
  assert.equal(result.data.context?.pulls?.some((pull) => pull.number === 45), true);
  assert.doesNotMatch(findingText(result), /reference-out-of-scope.*foreign\/(?:a|b)|foreign\/(?:a|b).*reference-out-of-scope/i,
    'each linked PR can use a repository within the Issue request ceiling');
  assert.ok(endpoints.some((endpoint) => endpoint.startsWith('repos/foreign/a/issues/comments/9001')),
    'the first linked PR evidence is acquired within the primary ceiling');
  assert.ok(endpoints.some((endpoint) => endpoint.startsWith('repos/foreign/b/issues/comments/9003')),
    'the second linked PR evidence is acquired within the primary ceiling');
});

test('a linked PR cannot widen the primary ceiling regardless of linked discovery order', async (t) => {
  for (const reverse of [false, true]) {
    const fixture = await makeLinkedPolicyCeilingFixture(t, { outsidePrimary: true, reverse });
    const result = await runCli(['inspect', '--target', fixture.root, '--work', workIssue], fixture.env);
    const commands = await commandLog(fixture);
    const endpoints = commands
      .filter((args) => args[0] === 'api')
      .flatMap((args) => args.filter((value) => value.startsWith('repos/')));

    assert.ok(result.data, `linked discovery order ${reverse ? 'reverse' : 'normal'} returns a structured result`);
    assert.notEqual(result.data.status, 'pass',
      `linked discovery order ${reverse ? 'reverse' : 'normal'} cannot silently accept an outside-primary reference`);
    assert.equal(endpoints.some((endpoint) => endpoint.startsWith('repos/foreign/b/issues/comments/9001')), false,
      `linked discovery order ${reverse ? 'reverse' : 'normal'} never authorizes the outside-primary repository`);
  }
});

test('scope is checked before a cached secondary source is returned after a linked assessment narrows it', async (t) => {
  const fixture = await makeLinkedPolicyCeilingFixture(t, { shared: true });
  const trace = await withFixtureEnv(fixture, () => createTrace({ targetRoot: fixture.root, work: workIssue }));
  const shared = fixture.firstRef;

  await withFixtureEnv(fixture, async () => {
    const firstPull = await trace.pullAt(workPull);
    await trace.bindPolicyScope(firstPull);
    const first = await trace.load(shared);
    assert.equal(first.content, 'Foreign source foreign/shared#9002.');
    const secondPull = await trace.pullAt('example/consumer#45');
    await trace.bindPolicyScope(secondPull);
    await assert.rejects(() => trace.load(shared), (error) => error?.code === 'reference-out-of-scope');
  });

  const commands = await commandLog(fixture);
  const foreignCommentReads = commands.filter((args) => args.some((value) => value === 'repos/foreign/shared/issues/comments/9002'));
  assert.equal(foreignCommentReads.length, 1, 'the source comment is read once under the wide ceiling and denied before the narrow cached return');
});

test('Issue current-policy permission metadata is rechecked when the default branch changes', async (t) => {
  const fixture = await makeCurrentPolicyDriftFixture(t);
  const result = await runCli(['inspect', '--target', fixture.root, '--work', 'example/consumer#1'], fixture.env);

  assert.ok(result.data, 'current-context inspection returns a structured result');
  assert.notEqual(result.data.status, 'pass',
    'a changed default branch/permission source cannot be accepted as a stable primary ceiling');
  assert.match(findingText(result), /stale|changed|default.?branch|current.*policy|permission/i);
});

test('check is a complete non-paginated diagnostic while inspect owns the bounded closeout packet', async (t) => {
  const { makeCloseoutFixture } = await import('./fixtures/closeout-cli/helpers.mjs');
  const checkFixture = await makeCloseoutFixture(t);
  const checkSelectors = [
    '--delta-ref', JSON.stringify(checkFixture.deltaRef),
    '--manifest-ref', JSON.stringify(checkFixture.manifestRef),
  ];
  const checkedResult = await runCli(['check', '--target', checkFixture.root, '--work', checkFixture.work, ...checkSelectors], checkFixture.env);
  const checked = checkedResult.data;
  assert.ok(checked, 'check returns its machine diagnostic');
  assert.equal(checked.packet, undefined, 'check does not embed a reviewer packet');
  assert.equal(checked.context?.packet, undefined, 'check does not expose a dead packet continuation');
  assert.ok(checked.synchronization, 'check retains closeout synchronization findings');
  assert.ok(checked.manifest, 'check retains closeout manifest findings');

  const fixture = await makeCloseoutFixture(t);
  const scenario = await scenarioOf(fixture);
  for (let index = 0; index < 30; index += 1) {
    const id = 2000 + index;
    const body = `Ordinary closeout discussion ${index}: ${'x'.repeat(4000)}`;
    scenario.records['issues/90/comments'][0].push({ id, body });
    scenario.records[`issues/comments/${id}`] = { id, body };
  }
  await saveScenario(fixture, scenario);
  const selectors = [
    '--delta-ref', JSON.stringify(fixture.deltaRef),
    '--manifest-ref', JSON.stringify(fixture.manifestRef),
  ];

  const pages = [];
  let cursor = null;
  for (let index = 0; index < 32; index += 1) {
    const args = ['inspect', '--target', fixture.root, '--work', fixture.work, '--max-inline-bytes', '8192', ...selectors];
    if (cursor) args.push('--cursor', cursor);
    const inspectedResult = await runCli(args, fixture.env);
    const inspected = inspectedResult.data;
    assert.ok(inspected, 'inspect returns a packet page');
    assert.ok(inspectedResult.stdout.length > 0);
    assert.ok(Buffer.byteLength(inspectedResult.stdout, 'utf8') <= 8192,
      'every complete inspect response remains within the declared bound');
    assert.ok(inspected.packet && Array.isArray(inspected.packet.entries));
    pages.push(inspected.packet);
    cursor = inspected.packet.next_cursor;
    if (!cursor) break;
  }
  assert.equal(Boolean(cursor), false, 'inspect reaches a terminal page within the bounded traversal');
  assert.ok(pages.length > 1, 'inspect alone exercises continuation pages');
  const refs = new Set(pages.flatMap((packet) => packet.entries.map((entry) => JSON.stringify(entry.ref))));
  assert.ok([...refs].some((ref) => ref.includes(fixture.deltaRef.path)), 'inspect retains the selected delta root');
  assert.ok([...refs].some((ref) => ref.includes(fixture.manifestRef.path)), 'inspect retains the selected manifest root');
  assert.ok([...refs].some((ref) => ref.includes(fixture.prerequisiteIssue)), 'inspect retains the prerequisite root');
});
