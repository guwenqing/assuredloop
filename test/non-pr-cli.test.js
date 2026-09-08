import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { test } from 'node:test';

import { createReadAdapter } from '../src/read-adapter.js';
import {
  cancellationWork,
  defaultBranch,
  git,
  intakeWork,
  makeNonPrFixture,
  noSpecWork,
  readLog,
  researchWork,
} from './fixtures/non-pr-cli/helpers.mjs';

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

function findingText(result) {
  return JSON.stringify(result);
}

function currentOf(result) {
  return result.current ?? result.context?.current ?? result.policy?.current ?? result.policies?.[0]?.current;
}

function firstRecord(result) {
  return result.records?.[0] ?? result.record ?? result.context?.record;
}

function apiEndpoints(log) {
  return log.filter((args) => args[0] === 'api')
    .map((args) => args.find((value) => value.startsWith('repos/')))
    .filter(Boolean);
}

test('non-PR research uses remote default branch current context even when local HEAD is older', async (t) => {
  const fixture = await makeNonPrFixture(t, { localHeadOld: true });
  const inspectedResult = await runCli([
    'inspect', '--target', fixture.root, '--work', researchWork,
  ], fixture.env);
  const inspected = outputOf(inspectedResult);
  assert.equal(inspectedResult.exitCode, 0);
  assert.equal(inspected.operation, 'inspect');
  assert.equal(inspected.status, 'pass');
  assert.equal(inspected.context?.issue?.number, 60);
  const current = currentOf(inspected);
  assert.equal(current?.branch, defaultBranch);
  assert.equal(current?.revision, fixture.revision);

  const localHead = (await git(fixture.root, ['rev-parse', 'HEAD'])).stdout.trim();
  assert.notEqual(localHead, fixture.revision, 'fixture keeps local HEAD older than the remote default branch');

  const checkedResult = await runCli([
    'check', '--target', fixture.root, '--work', researchWork,
  ], fixture.env);
  const checked = outputOf(checkedResult);
  assert.equal(checkedResult.exitCode, 0);
  assert.equal(checked.status, 'pass');
  assert.match(findingText(checked), /research-review-required|semantic.*research/i);
  assert.doesNotMatch(findingText(checked), /policy-destination-unavailable/);

  const record = firstRecord(checked);
  const evidence = record?.context?.evidence?.[0]?.record ?? record?.evidence?.[0]?.record;
  assert.equal(evidence?.head, null);
  assert.equal(typeof evidence?.no_head_reason, 'string');
  assert.equal(Object.hasOwn(evidence ?? {}, 'pr'), false);
  assert.equal(Object.hasOwn(evidence ?? {}, 'base_sha'), false);
  assert.equal(Object.hasOwn(evidence ?? {}, 'policy_ref'), false,
    'non-PR evidence does not receive a synthetic historical policy tuple');

  const endpoints = apiEndpoints(await readLog(fixture.ghLog));
  assert.ok(endpoints.includes('repos/example/consumer'));
  assert.ok(endpoints.includes(`repos/example/consumer/git/ref/heads/${defaultBranch}`));
  assert.equal(endpoints.some((endpoint) => endpoint.includes('/git/ref/heads/main')), false,
    'the checker does not guess main or use the local checkout branch');
});

test('non-PR inspect selects the configured current packet budget and never exceeds it', async (t) => {
  const fixture = await makeNonPrFixture(t, { contextBudget: 2048 });
  const defaultResult = await runCli([
    'inspect', '--target', fixture.root, '--work', researchWork,
  ], fixture.env);
  const inspected = outputOf(defaultResult);
  assert.equal(defaultResult.exitCode, 0);
  assert.equal(inspected.status, 'pass');
  assert.equal(inspected.packet?.limits?.max_inline_bytes, 2048,
    'the current destination policy supplies the default packet budget');
  assert.ok(Buffer.byteLength(JSON.stringify(inspected.packet), 'utf8') + 1 <= 2048);

  const oversizedRequest = await runCli([
    'inspect', '--target', fixture.root, '--work', researchWork, '--max-inline-bytes', '4096',
  ], fixture.env);
  const oversized = outputOf(oversizedRequest);
  if (oversized.status === 'pass') {
    assert.ok(oversized.packet?.limits?.max_inline_bytes <= 2048,
      'a caller cannot widen the configured current policy budget');
    assert.ok(Buffer.byteLength(JSON.stringify(oversized.packet), 'utf8') + 1 <= 2048);
  } else {
    assert.match(findingText(oversized), /budget|limit|policy/i,
      'rejecting a caller budget above policy must be explicit');
  }
});

test('null-head research without no_head_reason is rejected as incomplete evidence', async (t) => {
  const fixture = await makeNonPrFixture(t, { missingNoHeadReason: true });
  const result = await runCli([
    'check', '--target', fixture.root, '--work', researchWork,
  ], fixture.env);
  const checked = outputOf(result);
  assert.notEqual(checked.status, 'pass');
  assert.match(findingText(checked), /no.?head.?reason|head.*reason|evidence.*invalid|schema/i);
});

test('non-PR evidence with a real non-null head verifies that fixed Git object and preserves its identity', async (t) => {
  const fixture = await makeNonPrFixture(t, { evidenceHead: 'initial' });
  assert.notEqual(fixture.evidenceHead, fixture.revision,
    'the evidence head is an actual historical Git commit distinct from current policy context');

  const adapter = await createReadAdapter({ targetRoot: fixture.root, repository: fixture.repository });
  const files = await adapter.listFiles({ repository: fixture.repository, revision: fixture.evidenceHead, path: '.' });
  assert.ok(files.some((entry) => entry.path === 'README.md'),
    'the evidence head is a readable fixed Git object');
  const statusBefore = await git(fixture.root, ['status', '--porcelain']);

  const result = await runCli([
    'check', '--target', fixture.root, '--work', researchWork,
  ], fixture.env);
  const checked = outputOf(result);
  assert.equal(result.exitCode, 0);
  assert.equal(checked.status, 'pass');
  const record = firstRecord(checked);
  const evidence = record?.context?.evidence?.[0]?.record ?? record?.evidence?.[0]?.record;
  assert.equal(evidence?.head, fixture.evidenceHead,
    'non-PR evidence keeps its declared revision instead of substituting current branch SHA');
  assert.equal(Object.hasOwn(evidence ?? {}, 'pr'), false);
  assert.equal(Object.hasOwn(evidence ?? {}, 'base_sha'), false);
  assert.equal(checked.assessment?.pr, undefined,
    'current non-PR inspection does not synthesize a PR assessment tuple');
  assert.equal(await git(fixture.root, ['status', '--porcelain']).then(({ stdout }) => stdout), statusBefore.stdout,
    'fixed object inspection is read-only');
});

test('non-PR evidence with a syntactically valid but missing head cannot pass as current context', async (t) => {
  const missingHead = 'd'.repeat(40);
  const fixture = await makeNonPrFixture(t, { evidenceHead: missingHead });
  const result = await runCli([
    'check', '--target', fixture.root, '--work', researchWork,
  ], fixture.env);
  const checked = outputOf(result);
  assert.notEqual(checked.status, 'pass');
  const formalFindings = [
    ...(checked.findings ?? []),
    ...(firstRecord(checked)?.findings ?? []),
  ];
  assert.match(JSON.stringify(formalFindings), /record-unavailable|git-object-unavailable|missing.*revision|evidence.*unavailable/i,
    'the unavailable head is reported as an evidence/source finding, not only as missing PR policy');
  const record = firstRecord(checked);
  const evidence = record?.context?.evidence?.[0]?.record ?? record?.evidence?.[0]?.record;
  assert.equal(evidence?.head, missingHead,
    'the unavailable source remains the declared head in the diagnostic');
});

test('non-PR current-context drift is detected by rechecking the remote default branch SHA', async (t) => {
  const fixture = await makeNonPrFixture(t, { drift: true });
  const result = await runCli([
    'check', '--target', fixture.root, '--work', researchWork,
  ], fixture.env);
  const checked = outputOf(result);
  assert.notEqual(checked.status, 'pass');
  assert.match(findingText(checked), /current.*stale|stale.*current|branch.*advanced|freshness/i);
  const endpoints = apiEndpoints(await readLog(fixture.ghLog));
  assert.ok(endpoints.filter((endpoint) => endpoint === `repos/example/consumer/git/ref/heads/${defaultBranch}`).length >= 2,
    'current-context checking rechecks the same fixed remote branch ref');
});

test('valid non-PR cancellation preserves its rationale and receives no delivery credit', async (t) => {
  const fixture = await makeNonPrFixture(t);
  const result = await runCli([
    'check', '--target', fixture.root, '--work', cancellationWork,
  ], fixture.env);
  const checked = outputOf(result);
  assert.equal(result.exitCode, 0);
  assert.equal(checked.status, 'pass');
  assert.match(findingText(checked), /cancellation-not-delivery|cancelled|cancellation/i);
  assert.doesNotMatch(findingText(checked), /delivery-unsupported|delivery-plan-uncovered/);
  assert.match(findingText(checked), /superseded by the owner-selected current-context path/);
  assert.equal((await readLog(fixture.ghLog)).some((args) => args.some((value) => value.includes('/pulls/'))), false,
    'cancellation does not invent or query a delivery PR');
});

test('non-PR review comparison is current-only and does not rewrite null-head evidence', async (t) => {
  const fixture = await makeNonPrFixture(t, {
    reviewerModel: 'gpt-5.6-luna',
    scopeSentinel: true,
  });
  const inspectedResult = await runCli([
    'inspect', '--target', fixture.root, '--work', researchWork,
  ], fixture.env);
  const inspected = outputOf(inspectedResult);
  assert.equal(inspectedResult.exitCode, 0);
  const endpoints = apiEndpoints(await readLog(fixture.ghLog));
  assert.equal(endpoints.some((endpoint) => endpoint.includes('/issues/999') || endpoint.includes('/pulls/999')), false,
    'a work-like string in evidence scope is prose, not a reference');

  const checkedResult = await runCli([
    'check', '--target', fixture.root, '--work', researchWork,
  ], fixture.env);
  const checked = outputOf(checkedResult);
  assert.notEqual(checked.status, 'unavailable');
  const findings = [
    ...(checked.findings ?? []),
    ...(checked.policies ?? []).flatMap((policy) => policy.findings ?? []),
    ...(checked.records ?? []).flatMap((record) => record.findings ?? []),
  ];
  const findingTextOf = (finding) => `${finding.code ?? ''} ${finding.message ?? ''}`;
  assert.ok(findings.some((finding) => /current.*(review|policy|model)|review.*current|excluded/i.test(findingTextOf(finding))),
    'current-policy comparison reports the excluded reviewer model');
  assert.equal(findings.some((finding) => {
    const text = findingTextOf(finding);
    return /historical/i.test(text) && /excluded|ineligible/i.test(text);
  }), false, 'no individual finding claims historical reviewer exclusion or ineligibility');
  const record = firstRecord(checked);
  const evidence = record?.context?.evidence?.[0]?.record ?? record?.evidence?.[0]?.record;
  assert.equal(evidence?.head, null);
  assert.equal(evidence?.reviewer_model, 'gpt-5.6-luna');
  assert.equal(Object.hasOwn(evidence ?? {}, 'base_ref'), false);
  assert.equal(Object.hasOwn(evidence ?? {}, 'base_sha'), false);
});

test('open rough intake remains an intake diagnostic and can still expose current context', async (t) => {
  const fixture = await makeNonPrFixture(t);
  const result = await runCli([
    'check', '--target', fixture.root, '--work', intakeWork,
  ], fixture.env);
  const checked = outputOf(result);
  assert.notEqual(checked.status, 'unavailable');
  assert.match(findingText(checked), /rough|intake|triage|record.?context/i);
  assert.doesNotMatch(findingText(checked), /policy-destination-unavailable/);
  const current = currentOf(checked);
  assert.equal(current?.branch, defaultBranch);
  assert.equal(current?.revision, fixture.revision);
});

test('closed no-Spec delivery still requires an actual merged PR', async (t) => {
  const fixture = await makeNonPrFixture(t);
  const result = await runCli([
    'check', '--target', fixture.root, '--work', noSpecWork,
  ], fixture.env);
  const checked = outputOf(result);
  assert.notEqual(checked.status, 'pass');
  assert.match(findingText(checked), /delivery-unsupported|merged PR|actual.*PR|delivery/i);
  assert.doesNotMatch(findingText(checked), /policy-destination-unavailable/);
});

test('missing current config or repository default branch is unavailable without fallback', async (t) => {
  const missingConfigFixture = await makeNonPrFixture(t, { missingConfig: true });
  const missingConfigResult = await runCli([
    'check', '--target', missingConfigFixture.root, '--work', researchWork,
  ], missingConfigFixture.env);
  const missingConfig = outputOf(missingConfigResult);
  assert.equal(missingConfig.status, 'unavailable');
  assert.match(findingText(missingConfig), /config|policy|current.*context|unavailable/i);
  const missingConfigEndpoints = apiEndpoints(await readLog(missingConfigFixture.ghLog));
  assert.ok(missingConfigEndpoints.includes('repos/example/consumer'));
  assert.ok(missingConfigEndpoints.includes(`repos/example/consumer/git/ref/heads/${defaultBranch}`),
    'missing config is reported only after the remote current branch is selected');

  const missingBranchFixture = await makeNonPrFixture(t, { missingDefaultBranch: true });
  const missingBranchResult = await runCli([
    'check', '--target', missingBranchFixture.root, '--work', researchWork,
  ], missingBranchFixture.env);
  const missingBranch = outputOf(missingBranchResult);
  assert.equal(missingBranch.status, 'unavailable');
  assert.match(findingText(missingBranch), /default.?branch|repository.*metadata|current.*context|unavailable/i);
  const endpoints = apiEndpoints(await readLog(missingBranchFixture.ghLog));
  assert.ok(endpoints.includes('repos/example/consumer'),
    'repository metadata is read before deciding that default_branch is unavailable');
  assert.equal(endpoints.some((endpoint) => endpoint.includes('/git/ref/heads/main') || endpoint.includes('/git/ref/heads/develop')), false,
    'missing default_branch does not fall back to a guessed branch');
});

test('a policy source in another repository is rejected before an unallowlisted remote read', async (t) => {
  const fixture = await makeNonPrFixture(t, { policyRepository: 'other/reference' });
  const result = await runCli([
    'check', '--target', fixture.root, '--work', researchWork,
  ], fixture.env);
  const checked = outputOf(result);
  assert.equal(checked.status, 'unavailable');
  assert.match(findingText(checked), /allow|scope|policy|reference|unavailable/i);
  const endpoints = apiEndpoints(await readLog(fixture.ghLog));
  assert.ok(endpoints.includes(`repos/example/consumer/git/ref/heads/${defaultBranch}`),
    'the destination current context is resolved before checking foreign policy scope');
  assert.equal(endpoints.some((endpoint) => endpoint.startsWith('repos/other/reference/')), false,
    'destination config must authorize a foreign repository before any source read');
});
