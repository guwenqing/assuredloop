import assert from 'node:assert/strict';
import test from 'node:test';

import {
  commandLog,
  makeDirectMergedFixture,
  makeSecondaryMergedFixture,
  runCli,
  workPull,
} from './fixtures/f8-direct-merged-acquisition/helpers.mjs';

function findings(result) {
  return result?.data?.findings || [];
}

function findingCodes(result) {
  return findings(result).map((finding) => finding.code);
}

function hasFinding(result, code) {
  return findingCodes(result).includes(code);
}

function policyFindings(result) {
  return (result?.data?.policies || []).flatMap((policy) => policy.findings || []);
}

function endpointCommands(log) {
  return log
    .filter((args) => args[0] === 'api')
    .flatMap((args) => args.filter((value) => value.startsWith('repos/')));
}

test('direct merged check uses current destination authority and reaches historical assessment', async (t) => {
  const fixture = await makeDirectMergedFixture(t);
  const result = await runCli(['check', '--target', fixture.root, '--work', workPull], fixture.env);
  const log = await commandLog(fixture);
  const endpoints = endpointCommands(log);

  assert.ok(result.data, 'check returns a structured diagnostic');
  assert.equal(hasFinding(result, 'acquisition-context-stale'), false,
    'the normal post-merge destination shape is not request drift');
  assert.equal(result.data.context?.acquisition?.primary?.revision, fixture.currentRevision,
    'acquisition records the actual current destination revision');
  assert.equal(result.data.context?.acquisition?.primary?.config_ref?.revision, fixture.currentRevision,
    'acquisition reads config at the actual current destination revision');
  assert.equal(result.data.context?.acquisition?.primary?.config_digest, fixture.currentConfigDigest,
    'the current config digest is retained as the request ceiling');

  assert.equal(result.data.policies?.some((policy) => policy.status === 'available'), true,
    'check reaches policy reconstruction for the merged PR');
  assert.equal(policyFindings(result).some((finding) => finding.code === 'historical-assessment-only'), true,
    'check reaches the historical assessment path after acquisition');
  assert.equal(result.data.policies?.some((policy) => policy.context?.base_sha === fixture.historicalBase), true,
    'historical policy assessment retains the recorded pre-merge base');
  assert.equal(result.data.policies?.some((policy) => policy.config_digest === fixture.historicalConfigDigest), true,
    'historical policy uses the recorded historical config bytes');

  assert.equal(endpoints.some((endpoint) => endpoint.startsWith(`repos/${fixture.foreignRepository}/`)), false,
    'historical config cannot authorize a foreign evidence read beyond the current ceiling');
});

test('direct merged inspect acquires the live destination and retains historical reviewer context', async (t) => {
  const fixture = await makeDirectMergedFixture(t);
  const result = await runCli(['inspect', '--target', fixture.root, '--work', workPull], fixture.env);

  assert.ok(result.data, 'inspect returns a structured diagnostic');
  assert.equal(hasFinding(result, 'acquisition-context-stale'), false,
    'the normal post-merge destination shape is not request drift');
  assert.ok(result.data.packet && Array.isArray(result.data.packet.entries),
    'inspect reaches a reviewer packet after merged-PR acquisition');
  const workEntry = result.data.packet.entries.find((entry) => entry.ref === workPull);
  assert.ok(workEntry?.content, 'inspect inlines the selected work entry');
  const acquisition = JSON.parse(workEntry.content.split('\n\n', 1)[0]).acquisition;
  assert.equal(acquisition?.revision, fixture.currentRevision,
    'inspect exposes the actual current destination revision in the selected work entry');
  assert.equal(acquisition?.config_ref?.revision, fixture.currentRevision,
    'inspect acquires its permission config at the live destination revision');
  assert.match(workEntry.content, new RegExp(fixture.historicalBase),
    'inspect packet retains the historical assessment coordinates');
});

test('current destination drift during a merged assessment remains fatal after acquisition', async (t) => {
  const fixture = await makeDirectMergedFixture(t, { drift: true });
  const result = await runCli(['check', '--target', fixture.root, '--work', workPull], fixture.env);

  assert.ok(result.data, 'drift still returns a structured diagnostic');
  assert.equal(result.data.policies?.some((policy) => policy.context?.base_sha === fixture.historicalBase), true,
    'the drift is tested after historical policy acquisition, not at initial merged-PR selection');
  assert.equal(result.data.context?.acquisition?.primary?.revision, fixture.currentRevision,
    'drift is checked against the originally captured current authority');
  assert.equal(hasFinding(result, 'acquisition-context-stale'), true,
    'a real current destination change during the request remains stale');
  assert.equal(result.data.status, 'unavailable',
    'actual during-request drift prevents a trusted result');
});

test('secondary merged assessment narrows from its current destination config', async (t) => {
  const fixture = await makeSecondaryMergedFixture(t);
  const result = await runCli(['check', '--target', fixture.root, '--work', 'example/consumer#42'], fixture.env);
  const log = await commandLog(fixture);
  const endpoints = endpointCommands(log);
  const secondary = result.data?.context?.acquisition?.secondary?.find((entry) => entry.work === workPull);

  assert.ok(result.data, 'Issue-root check returns a structured diagnostic');
  assert.equal(secondary?.config_ref?.revision, fixture.currentSecondaryRevision,
    'a secondary merged PR acquires scope from its current destination revision');
  assert.equal(secondary?.allowed_repositories?.includes(fixture.foreignRepository), false,
    'the current secondary config narrows the primary ceiling for this assessment');
  assert.equal(result.data.policies?.some((policy) => policy.context?.base_sha === fixture.historicalBase), true,
    'secondary checking still reaches the merged PR historical assessment');
  assert.equal(endpoints.some((endpoint) => endpoint.startsWith(`repos/${fixture.foreignRepository}/`)), false,
    'the secondary historical config cannot authorize a foreign read after current narrowing');
});
