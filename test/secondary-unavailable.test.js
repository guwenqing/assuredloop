import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  commandLog,
  makeSecondaryUnavailableFixture,
  makePrerequisiteSecondaryUnavailableFixture,
  runCli,
  workIssue,
} from './fixtures/secondary-unavailable/helpers.mjs';

const secondaryWork = 'example/consumer#45';

function packetRefs(output) {
  return (output.packet?.entries ?? []).map((entry) => JSON.stringify(entry.ref));
}

function allFindings(output) {
  return [
    ...(output.findings ?? []),
    ...(output.policies ?? []).flatMap((policy) => policy.findings ?? []),
    ...(output.records ?? []).flatMap((record) => record.findings ?? []),
  ];
}

function qualifiedUnavailableFinding(output, work) {
  return allFindings(output).find((finding) => {
    const text = JSON.stringify(finding);
    return /unavailable|not-found|path-missing|record-unavailable/i.test(text) &&
      (finding.assessment === work || finding.work === work || finding.details?.assessment === work || finding.details?.work === work);
  });
}

function assertQualifiedUnavailable(output, work, sourceHint) {
  const finding = qualifiedUnavailableFinding(output, work);
  assert.ok(finding, `${work} has an attributed unavailable finding`);
  const text = JSON.stringify(finding);
  assert.match(text, new RegExp(sourceHint));
  assert.match(text, /record-unavailable|not-found|path-missing|unavailable/i);
}

function endpoints(commands) {
  return commands.filter((args) => args[0] === 'api')
    .flatMap((args) => args.filter((value) => value.startsWith('repos/')));
}

function assertNoSecondaryForeignRead(commands) {
  assert.equal(endpoints(commands).some((endpoint) => endpoint.includes('foreign/b/issues/comments/9003')), false,
    'an unavailable secondary never reads its evidence through an old/current fallback scope');
}

function assertAvailableSecondaryForeignRead(commands) {
  assert.equal(endpoints(commands).some((endpoint) => endpoint.includes('foreign/a/issues/comments/9001')), true,
    'the available linked PR keeps its primary-authorized evidence source');
}

test('the linked-policy ceiling fixture remains a valid two-PR control', async (t) => {
  const fixture = await makeSecondaryUnavailableFixture(t, { missing: 'control' });
  const result = await runCli(['inspect', '--target', fixture.root, '--work', workIssue], fixture.env);

  assert.equal(result.data?.status, 'pass');
  assert.ok(result.data?.packet);
  assert.match(packetRefs(result.data).join('\n'), /example\/consumer#42/);
  assert.match(packetRefs(result.data).join('\n'), /example\/consumer#43/);
  assert.match(packetRefs(result.data).join('\n'), /example\/consumer#45/);
});

test('Issue inspect retains the packet when one linked PR destination is unavailable', async (t) => {
  const fixture = await makeSecondaryUnavailableFixture(t, { missing: 'branch' });
  const result = await runCli(['inspect', '--target', fixture.root, '--work', workIssue], fixture.env);
  const output = result.data;

  assert.ok(output, 'inspect returns structured output');
  assert.equal(output.status, 'unavailable');
  assert.ok(output.packet, 'the primary and available linked PR remain inspectable');
  assert.match(packetRefs(output).join('\n'), /example\/consumer#42/,
    'the primary Issue root remains in the reviewer inventory');
  assert.match(packetRefs(output).join('\n'), /example\/consumer#43/,
    'the available linked PR remains in the reviewer inventory');
  assertQualifiedUnavailable(output, secondaryWork, 'linked-second|git\\/ref|assessment');
  const commands = await commandLog(fixture);
  assertAvailableSecondaryForeignRead(commands);
  assertNoSecondaryForeignRead(commands);
});

test('Issue inspect isolates a missing secondary current config', async (t) => {
  const fixture = await makeSecondaryUnavailableFixture(t, { missing: 'config' });
  const result = await runCli(['inspect', '--target', fixture.root, '--work', workIssue], fixture.env);
  const output = result.data;

  assert.ok(output?.packet, 'a missing secondary config does not discard the packet');
  assert.match(packetRefs(output).join('\n'), /example\/consumer#42/);
  assert.match(packetRefs(output).join('\n'), /example\/consumer#43/);
  assertQualifiedUnavailable(output, secondaryWork, 'config\\.json|path-missing|assessment');
  const commands = await commandLog(fixture);
  assertAvailableSecondaryForeignRead(commands);
  assertNoSecondaryForeignRead(commands);
});

test('Issue inspect keeps the primary root when both linked PR destinations are unavailable', async (t) => {
  const fixture = await makeSecondaryUnavailableFixture(t, { missing: 'both' });
  const result = await runCli(['inspect', '--target', fixture.root, '--work', workIssue], fixture.env);
  const output = result.data;

  assert.equal(output?.status, 'unavailable');
  assert.ok(output?.packet, 'the primary Issue remains inspectable without secondary destinations');
  assert.match(packetRefs(output).join('\n'), /example\/consumer#42/);
  assertNoSecondaryForeignRead(await commandLog(fixture));
});

test('check preserves the available linked assessment and Issue record around a missing secondary destination', async (t) => {
  const fixture = await makeSecondaryUnavailableFixture(t, { missing: 'branch' });
  const result = await runCli(['check', '--target', fixture.root, '--work', workIssue], fixture.env);
  const output = result.data;

  assert.ok(output);
  assert.notEqual(output.status, 'pass');
  assert.ok(output.policies?.some((policy) => JSON.stringify(policy).includes('example/consumer#43')),
    'the available linked PR policy assessment survives');
  assert.ok(output.records?.some((record) => JSON.stringify(record).includes(workIssue)),
    'the Issue work record survives');
  assertQualifiedUnavailable(output, secondaryWork, 'linked-second|git\\/ref|assessment');
  const commands = await commandLog(fixture);
  assertAvailableSecondaryForeignRead(commands);
  assertNoSecondaryForeignRead(commands);
});

test('check keeps prerequisite records when the prerequisite current destination is unavailable', async (t) => {
  const fixture = await makePrerequisiteSecondaryUnavailableFixture(t);
  const result = await runCli([
    'check', '--target', fixture.root, '--work', fixture.work,
    '--delta-ref', JSON.stringify(fixture.deltaRef),
    '--manifest-ref', JSON.stringify(fixture.manifestRef),
  ], fixture.env);
  const output = result.data;

  assert.ok(output);
  assert.notEqual(output.status, 'pass');
  assert.ok(output.records?.some((record) => JSON.stringify(record).includes(fixture.prerequisiteIssue)),
    'the prerequisite work record remains in check output');
  const unavailablePolicy = output.policies?.find((policy) => policy.status === 'unavailable' &&
    JSON.stringify(policy).includes(fixture.prerequisitePull));
  assert.ok(unavailablePolicy, 'the unavailable prerequisite assessment remains attributed to its PR');
  assert.match(JSON.stringify(unavailablePolicy), /linked-prerequisite|record-unavailable|not-found|unavailable/i);
});
