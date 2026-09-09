import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { validateRecord } from '../src/records.js';
import {
  configPath,
  makeHistoricalFixture,
  policyPath,
  repository,
  sha256,
  work,
} from './fixtures/historical-policy/helpers.mjs';

const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname);
const packageMetadata = JSON.parse(readFileSync(path.join(repositoryRoot, 'contracts/metadata.json'), 'utf8'));
const policyModule = await import('../src/policy.js');

function findingText(result) {
  return JSON.stringify(result?.findings ?? []).toLowerCase();
}

function assertFinding(result, pattern, message = `expected finding matching ${pattern}`) {
  assert.match(findingText(result), pattern, message);
}

function assertNoRevisionCall(fixture, revision) {
  assert.equal(
    fixture.adapter.calls.readBlob.some((ref) => ref.revision === revision),
    false,
    `historical reconstruction must not read live/candidate revision ${revision}`,
  );
}

test('policy module exposes historical reconstruction as a separate read-only API', () => {
  assert.equal(typeof policyModule.resolveHistoricalPolicy, 'function');
});

test('reconstructs a delivered PR from its recorded pre-merge base after the destination advances', async (t) => {
  if (typeof policyModule.resolveHistoricalPolicy !== 'function') {
    t.skip('resolveHistoricalPolicy is not implemented yet');
    return;
  }
  const fixture = await makeHistoricalFixture({ packageMetadata, acceptanceHead: 'a'.repeat(40) });
  t.after(() => fixture.dispose());

  assert.equal(validateRecord('evidence', fixture.record).valid, true);
  const result = await policyModule.resolveHistoricalPolicy({
    adapter: fixture.adapter,
    record: fixture.record,
    packageRoot: repositoryRoot,
  });

  assert.equal(result.status, 'available');
  assert.equal(result.mode, 'bootstrap');
  assert.equal(result.context?.historical, true);
  assert.equal(result.context?.base_sha, fixture.historicalBase);
  assert.equal(result.context?.pr, work);
  assert.equal(result.config.project.review.internal.allowed_models[0], 'model-alpha');
  assert.equal(result.config_digest, fixture.record.config_digest);
  assert.equal(result.activation_digest, null);
  assert.deepEqual(result.policy_ref, fixture.record.policy_ref);
  assert.equal(result.policy_ref.revision, fixture.policyRevision);
  assert.notEqual(result.context.base_sha, fixture.liveBase);
  assertNoRevisionCall(fixture, fixture.liveBase);
  assertNoRevisionCall(fixture, fixture.headRevision);
  assert.ok(fixture.adapter.calls.readBlob.some((ref) => ref.revision === fixture.historicalBase && ref.path === configPath));
  assert.ok(fixture.adapter.calls.readBlob.some((ref) => ref.revision === fixture.policyRevision && ref.path === policyPath));
  assertFinding(result, /historical|semantic|authorization|review/);
});

test('candidate/live policy data cannot override the recorded historical destination or policy revision', async (t) => {
  if (typeof policyModule.resolveHistoricalPolicy !== 'function') {
    t.skip('resolveHistoricalPolicy is not implemented yet');
    return;
  }
  const fixture = await makeHistoricalFixture({ packageMetadata, acceptanceHead: 'b'.repeat(40) });
  t.after(() => fixture.dispose());

  const result = await policyModule.resolveHistoricalPolicy({
    adapter: fixture.adapter,
    record: fixture.record,
    packageRoot: repositoryRoot,
    // These are untrusted caller data and must not become policy inputs.
    base: fixture.liveBase,
    candidateConfig: { project: { review: { internal: { allowed_models: ['attacker-only'] } } } },
    policyRevision: 'c'.repeat(40),
  });

  assert.equal(result.status, 'available');
  assert.deepEqual(result.config.project.review.internal.allowed_models, ['model-alpha', 'model-beta']);
  assert.equal(result.policy_ref.revision, fixture.policyRevision);
  assertNoRevisionCall(fixture, fixture.liveBase);
  assertNoRevisionCall(fixture, fixture.headRevision);
  assertNoRevisionCall(fixture, 'c'.repeat(40));
});

test('ordinary Evidence text containing another head does not select the historical policy revision', async (t) => {
  if (typeof policyModule.resolveHistoricalPolicy !== 'function') {
    t.skip('resolveHistoricalPolicy is not implemented yet');
    return;
  }
  const ordinaryHead = 'd'.repeat(40);
  const fixture = await makeHistoricalFixture({ packageMetadata, acceptanceHead: ordinaryHead });
  t.after(() => fixture.dispose());

  const result = await policyModule.resolveHistoricalPolicy({
    adapter: fixture.adapter,
    record: fixture.record,
    packageRoot: repositoryRoot,
  });

  assert.equal(result.status, 'available');
  assert.equal(result.policy_ref.revision, fixture.policyRevision);
  assert.notEqual(result.policy_ref.revision, ordinaryHead);
  assert.match(JSON.stringify(result.sources), new RegExp(ordinaryHead));
  assertFinding(result, /semantic|authorization|review/);
});

test('recorded digest, policy reference, package and mode mismatches are invalid historical evidence', async (t) => {
  if (typeof policyModule.resolveHistoricalPolicy !== 'function') {
    t.skip('resolveHistoricalPolicy is not implemented yet');
    return;
  }
  for (const [label, mutate, pattern] of [
    ['config digest', (record) => { record.config_digest = '1'.repeat(64); }, /digest|config|stale|mismatch/],
    ['policy reference', (record) => { record.policy_ref = { repository, revision: record.base_sha, path: configPath }; }, /policy|reference|stale|mismatch/],
    ['package binding', (record) => { record.contract_package = { ...record.contract_package, version: '9.9.9' }; }, /package|contract|stale|mismatch/],
    ['policy mode', (record) => { record.policy_mode = 'activation'; }, /mode|policy|stale|mismatch/],
  ]) {
    const fixture = await makeHistoricalFixture({ packageMetadata });
    t.after(() => fixture.dispose());
    const record = structuredClone(fixture.record);
    mutate(record);
    const result = await policyModule.resolveHistoricalPolicy({ adapter: fixture.adapter, record, packageRoot: repositoryRoot });

    assert.notEqual(result.status, 'available', `${label} must not be accepted as historical delivery`);
    assertFinding(result, pattern, label);
  }
});

test('missing recorded-base objects remain unavailable and do not fall back to live state', async (t) => {
  if (typeof policyModule.resolveHistoricalPolicy !== 'function') {
    t.skip('resolveHistoricalPolicy is not implemented yet');
    return;
  }
  const fixture = await makeHistoricalFixture({ packageMetadata, hideHistoricalObjects: true });
  t.after(() => fixture.dispose());

  const result = await policyModule.resolveHistoricalPolicy({
    adapter: fixture.adapter,
    record: fixture.record,
    packageRoot: repositoryRoot,
  });

  assert.equal(result.status, 'unavailable');
  assertFinding(result, /historical|record|object|unavailable/);
  assertNoRevisionCall(fixture, fixture.liveBase);
  assertNoRevisionCall(fixture, fixture.headRevision);
});

test('an unmerged PR is not a historical delivery even when its recorded tuple is otherwise valid', async (t) => {
  if (typeof policyModule.resolveHistoricalPolicy !== 'function') {
    t.skip('resolveHistoricalPolicy is not implemented yet');
    return;
  }
  const fixture = await makeHistoricalFixture({ packageMetadata, merged: false });
  t.after(() => fixture.dispose());

  const result = await policyModule.resolveHistoricalPolicy({
    adapter: fixture.adapter,
    record: fixture.record,
    packageRoot: repositoryRoot,
  });

  assert.notEqual(result.status, 'available');
  assertFinding(result, /merge|deliver|historical|pr|pull/);
  assert.equal(fixture.adapter.calls.readBlob.length, 0, 'unmerged PR must fail before policy source reconstruction');
});

test('a merged PR with inconsistent recorded identity/head/base ref is rejected before reconstruction', async (t) => {
  if (typeof policyModule.resolveHistoricalPolicy !== 'function') {
    t.skip('resolveHistoricalPolicy is not implemented yet');
    return;
  }
  for (const [label, mutate, pattern] of [
    ['work identity', (record) => { record.pr = `${repository}#78`; }, /identity|pr|work/],
    ['head', (record) => { record.head = 'e'.repeat(40); }, /head|tuple|stale/],
    ['base ref', (record) => { record.base_ref = 'release'; }, /base|ref|destination/],
  ]) {
    const fixture = await makeHistoricalFixture({ packageMetadata });
    t.after(() => fixture.dispose());
    const record = structuredClone(fixture.record);
    mutate(record);
    const result = await policyModule.resolveHistoricalPolicy({ adapter: fixture.adapter, record, packageRoot: repositoryRoot });

    assert.notEqual(result.status, 'available', `${label} must not pass historical identity checks`);
    assertFinding(result, pattern, label);
    assert.equal(fixture.adapter.calls.readBlob.length, 0, `${label} must fail before reading historical policy objects`);
  }
});
