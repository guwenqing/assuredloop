import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  currentTuple,
  evidenceRecord,
  makeReviewScenario,
  makeReviewKindCliFixture,
  work,
} from './fixtures/review-kind/helpers.mjs';

const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname);
const policyModuleUrl = new URL('../src/policy.js', import.meta.url);
const policyModule = await import(policyModuleUrl.href);
const execFile = promisify(execFileCallback);
const cliPath = path.join(repositoryRoot, 'src', 'cli.js');

function codes(findings) {
  return (findings ?? []).map((finding) => finding.code);
}

function hasCode(findings, code) {
  return codes(findings).includes(code);
}

function assertHasCode(findings, code, message = `expected finding ${code}`) {
  assert.equal(hasCode(findings, code), true, `${message}; got ${JSON.stringify(findings)}`);
}

function assertNoCode(findings, code, message = `did not expect finding ${code}`) {
  assert.equal(hasCode(findings, code), false, `${message}; got ${JSON.stringify(findings)}`);
}

function assertOnlyInformational(findings, code) {
  assertHasCode(findings, code);
  assert.deepEqual(findings.filter((finding) => finding.code !== code), [],
    `expected only the caller-assumption finding; got ${JSON.stringify(findings)}`);
}

function assertReviewKindFinding(findings, code, kind) {
  const finding = findings.find((entry) => entry.code === code);
  assert.ok(finding, `expected finding ${code}; got ${JSON.stringify(findings)}`);
  assert.equal(finding.severity, 'review');
  if (kind !== undefined) assert.equal(finding.review_kind, kind);
  return finding;
}

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

function parseCli(result) {
  assert.ok(result.stdout.trim(), `CLI returned no JSON; stderr: ${result.stderr}`);
  return JSON.parse(result.stdout.trim());
}

async function policyFor(t, options) {
  const fixture = await makeReviewScenario(t, options);
  const policy = await policyModule.resolvePolicy({
    adapter: fixture.adapter,
    work,
    packageRoot: repositoryRoot,
  });
  assert.equal(policy.status, 'available', JSON.stringify(policy.findings));
  return { fixture, policy, current: currentTuple(policy, fixture) };
}

test('missing review kind reports a qualification gap without assuming internal eligibility', async (t) => {
  const { fixture, policy, current } = await policyFor(t);
  const record = evidenceRecord(policy, fixture, { reviewer_model: 'external-provider' });

  const findings = policyModule.checkReviewEvidence({ record, policy, current });

  assertReviewKindFinding(findings, 'review-kind-unresolved');
  assertNoCode(findings, 'review-model-ineligible', 'an unknown role must not be treated as internal');
  assertNoCode(findings, 'review-policy-unavailable', 'the policy is available; only review role is unresolved');
  assertNoCode(findings, 'review-evidence-invalid', 'an unresolved role does not make the record malformed');
});

test('invalid review kind does not fall through to the internal allowlist and still checks shared constraints', async (t) => {
  const { fixture, policy, current } = await policyFor(t);
  const record = evidenceRecord(policy, fixture, {
    reviewer_model: 'external-provider',
    reviewer_session: 'producer-session',
    review_depth: 'partial-scope',
  });

  const findings = policyModule.checkReviewEvidence({
    record,
    policy,
    current,
    reviewKind: 'owner-arranged',
  });

  assertReviewKindFinding(findings, 'review-kind-unresolved');
  assertHasCode(findings, 'review-independence-invalid');
  assertHasCode(findings, 'review-depth-invalid');
  assertNoCode(findings, 'review-model-ineligible');
  assertNoCode(findings, 'review-policy-unavailable');
});

test('unknown kind preserves alias resolution and exclusion checks', async (t) => {
  const { fixture, policy, current } = await policyFor(t);
  const aliased = evidenceRecord(policy, fixture, { reviewer_model: 'external' });
  const aliasedFindings = policyModule.checkReviewEvidence({
    record: aliased,
    policy,
    current,
    reviewKind: null,
  });
  assertReviewKindFinding(aliasedFindings, 'review-kind-unresolved');
  assertNoCode(aliasedFindings, 'review-model-ineligible', 'an alias to an external model must not be forced internal');
  assertNoCode(aliasedFindings, 'review-model-unresolved');

  const excluded = evidenceRecord(policy, fixture, { reviewer_model: 'excluded-model' });
  const excludedFindings = policyModule.checkReviewEvidence({
    record: excluded,
    policy,
    current,
    reviewKind: 'unknown',
  });
  assertReviewKindFinding(excludedFindings, 'review-kind-unresolved');
  assertHasCode(excludedFindings, 'review-model-excluded');
  assertNoCode(excludedFindings, 'review-model-ineligible');
});

test('explicit internal review enforces the exact allowlist', async (t) => {
  const { fixture, policy, current } = await policyFor(t);
  const allowed = evidenceRecord(policy, fixture, { reviewer_model: 'internal-model' });
  const allowedFindings = policyModule.checkReviewEvidence({
    record: allowed,
    policy,
    current,
    reviewKind: 'internal',
  });
  assertOnlyInformational(allowedFindings, 'review-kind-declared');
  assertReviewKindFinding(allowedFindings, 'review-kind-declared', 'internal');

  const externalModel = evidenceRecord(policy, fixture, { reviewer_model: 'external-provider' });
  const findings = policyModule.checkReviewEvidence({
    record: externalModel,
    policy,
    current,
    reviewKind: 'internal',
  });
  assertReviewKindFinding(findings, 'review-kind-declared', 'internal');
  assertHasCode(findings, 'review-model-ineligible');
  assertNoCode(findings, 'review-kind-unresolved');
});

test('explicit external review bypasses the internal allowlist but keeps shared restrictions', async (t) => {
  const { fixture, policy, current } = await policyFor(t);
  const external = evidenceRecord(policy, fixture, { reviewer_model: 'external-provider' });
  const externalFindings = policyModule.checkReviewEvidence({
    record: external,
    policy,
    current,
    reviewKind: 'external',
  });
  assertOnlyInformational(externalFindings, 'review-kind-declared');
  assertReviewKindFinding(externalFindings, 'review-kind-declared', 'external');

  const excluded = evidenceRecord(policy, fixture, {
    reviewer_model: 'excluded-model',
    review_depth: 'partial-scope',
    reviewer_session: 'producer-session',
  });
  const findings = policyModule.checkReviewEvidence({
    record: excluded,
    policy,
    current,
    reviewKind: 'external',
  });
  assertReviewKindFinding(findings, 'review-kind-declared', 'external');
  assertHasCode(findings, 'review-model-excluded');
  assertHasCode(findings, 'review-depth-invalid');
  assertHasCode(findings, 'review-independence-invalid');
  assertNoCode(findings, 'review-model-ineligible');
  assertNoCode(findings, 'review-kind-unresolved');
});

test('live check exposes unresolved review role without treating an external model as internal', async (t) => {
  const fixture = await makeReviewKindCliFixture(t);
  const result = await runCli(['check', '--target', fixture.root, '--work', fixture.workPull], fixture.env);
  const output = parseCli(result);
  const serialized = JSON.stringify(output);

  assert.match(serialized, /review-kind-unresolved|review-role-unresolved/);
  assert.doesNotMatch(serialized, /review-model-ineligible/);
  assert.equal(output.operation, 'check');
  assert.ok(['pass', 'incomplete', 'invalid', 'unavailable'].includes(output.status));

  const inspectedResult = await runCli(['inspect', '--target', fixture.root, '--work', fixture.workPull], fixture.env);
  const inspected = parseCli(inspectedResult);
  assert.match(JSON.stringify(inspected), /external-provider/, 'the source review body remains in the inspect packet');
  assert.ok(inspected.policy || inspected.policies, 'the applicable policy remains in the inspection output');
});
