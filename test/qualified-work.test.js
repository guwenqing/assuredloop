import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

import { checkReviewEvidence } from '../src/policy.js';
import { checkWorkRecords } from '../src/work-records.js';
import {
  contextBody,
  evidenceEntry,
  firstEvidenceRecord,
  firstPrRecord,
  issueRecord,
  categoryMapping,
  issueSnapshot,
  primaryBasis,
  pullSnapshot,
  secondaryBasis,
  taskFile,
} from './fixtures/work-records/helpers.mjs';
import {
  lowerIssue,
  lowerRecordIssue,
  mixedCaseIssue,
  mixedCaseRecordIssue,
  mixedCaseRecordPull,
  wrongNumberWork,
  wrongRepositoryWork,
} from './fixtures/qualified-work/helpers.mjs';
import { makeTraceFixture } from './fixtures/trace-cli/helpers.mjs';

const execFile = promisify(execFileCallback);
const cliPath = new URL('../src/cli.js', import.meta.url);

async function runCli(args, env) {
  try {
    const result = await execFile(process.execPath, [cliPath.pathname, ...args], {
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

function pullsOf(result) {
  return result.context?.pulls ?? result.context?.pull_requests ?? [];
}

function findingText(result) {
  return JSON.stringify(result?.findings ?? []).toLowerCase();
}

function sourceResolver() {
  const sources = new Map([
    [primaryBasis.path, '# Record link status checks\n'],
    [secondaryBasis.path, '# Focused context\n'],
    ['openspec/changes/records/tasks.md', taskFile],
  ]);
  return async (ref) => {
    const content = sources.get(ref.path);
    if (content === undefined) throw Object.assign(new Error(`missing fixture source: ${ref.path}`), { code: 'record-unavailable' });
    return { content };
  };
}

function mixedCaseWorkInputs() {
  const issue = structuredClone(issueRecord);
  delete issue.depends_on;
  delete issue.prior_work;
  const pullRecord = structuredClone(firstPrRecord);
  pullRecord.issues = [lowerRecordIssue];
  const evidence = structuredClone(firstEvidenceRecord);
  evidence.pr = mixedCaseRecordPull;
  return {
    work: mixedCaseRecordIssue,
    categoryMapping,
    issue: issueSnapshot({ number: 32, body: contextBody(issue) }),
    pulls: [pullSnapshot({ number: 42, body: contextBody(pullRecord) })],
    evidence: [evidenceEntry(evidence)],
    phase: 'handoff',
    resolveRef: sourceResolver(),
  };
}

function reviewPolicy() {
  return {
    status: 'available',
    mode: 'activation',
    config: {
      project: {
        review: {
          depth: 'full-scope',
          internal: { allowed_models: ['model-alpha'] },
          excluded_models: [],
          context: { max_inline_bytes: 4096 },
        },
      },
    },
  };
}

function reviewCurrent(record, overrides = {}) {
  return {
    pr: lowerIssue,
    head: record.head,
    base_ref: record.base_ref,
    base_sha: record.base_sha,
    policy_ref: structuredClone(record.policy_ref),
    contract_package: structuredClone(record.contract_package),
    config_digest: record.config_digest,
    activation_digest: record.activation_digest,
    scope: record.scope,
    ...overrides,
  };
}

test('inspect treats repository owner and name casing as a qualified identity alias', async (t) => {
  const fixture = await makeTraceFixture(t);
  const lowerResult = await runCli(['inspect', '--target', fixture.root, '--work', lowerIssue], fixture.env);
  const mixedResult = await runCli(['inspect', '--target', fixture.root, '--work', mixedCaseIssue], fixture.env);
  const lower = outputOf(lowerResult);
  const mixed = outputOf(mixedResult);

  assert.equal(lowerResult.exitCode, 0);
  assert.equal(mixedResult.exitCode, 0);
  assert.equal(mixed.context?.issue?.number, lower.context?.issue?.number);
  assert.deepEqual(
    pullsOf(mixed).map((pull) => pull.number),
    pullsOf(lower).map((pull) => pull.number),
    'case aliases select the same actual Issue and reciprocal PR inventory',
  );
  assert.ok(pullsOf(mixed).some((pull) => pull.number === 43));
  assert.ok(pullsOf(mixed).some((pull) => pull.number === 45));

  const lowerCheckResult = await runCli(['check', '--target', fixture.root, '--work', lowerIssue], fixture.env);
  const mixedCheckResult = await runCli(['check', '--target', fixture.root, '--work', mixedCaseIssue], fixture.env);
  const lowerCheck = outputOf(lowerCheckResult);
  const mixedCheck = outputOf(mixedCheckResult);
  assert.equal(mixedCheckResult.exitCode, lowerCheckResult.exitCode,
    'a case alias preserves the formal result exit status');
  assert.equal(mixedCheck.status, lowerCheck.status,
    'a case alias preserves the formal result status');
  assert.deepEqual(
    mixedCheck.findings?.map(({ code, severity, message }) => ({ code, severity, message })),
    lowerCheck.findings?.map(({ code, severity, message }) => ({ code, severity, message })),
    'a case alias preserves findings, including known missing review evidence',
  );
  assert.match(JSON.stringify(mixedCheck.findings), /review-evidence-missing/);
  assert.equal(mixedCheck.context?.issue?.number, lowerCheck.context?.issue?.number);
  assert.deepEqual(
    pullsOf(mixedCheck).map((pull) => pull.number),
    pullsOf(lowerCheck).map((pull) => pull.number),
    'check selects the same actual Issue and reciprocal PR inventory for a case alias',
  );
  assert.ok(pullsOf(mixedCheck).some((pull) => pull.number === 43));
  assert.ok(pullsOf(mixedCheck).some((pull) => pull.number === 45));
});

test('work-record mappings compare qualified identities case-insensitively while preserving source spelling', async () => {
  const result = await checkWorkRecords(mixedCaseWorkInputs());
  assert.equal(result.status, 'valid', JSON.stringify(result));
  assert.doesNotMatch(findingText(result), /pr-issue-mismatch|evidence-pr-mismatch|evidence-tuple-stale/);
  assert.equal(result.context.pulls[0].body.includes(lowerRecordIssue), true,
    'the raw PR record remains unchanged in returned context');
  assert.equal(result.context.evidence[0].record.pr, mixedCaseRecordPull,
    'the raw Evidence qualified work reference remains unchanged');
});

test('distinct repositories and issue numbers remain binding errors', async () => {
  for (const work of [wrongRepositoryWork, wrongNumberWork]) {
    const result = await checkWorkRecords({
      work,
      categoryMapping,
      issue: issueSnapshot({ number: 42 }),
      pulls: [],
      evidence: [],
      phase: 'handoff',
    });
    assert.equal(result.status, 'invalid', `${work}: ${JSON.stringify(result)}`);
    assert.match(findingText(result), /identity|binding|selected work/);
  }
});

test('review evidence PR aliases do not become stale, while branch names remain case-sensitive', () => {
  const record = structuredClone(firstEvidenceRecord);
  record.pr = mixedCaseRecordPull;
  const policy = reviewPolicy();
  const aliasFindings = checkReviewEvidence({ record, policy, current: reviewCurrent(record) });
  assert.doesNotMatch(JSON.stringify(aliasFindings), /review-evidence-stale/,
    'qualified PR aliases represent the same identity');

  const branchFindings = checkReviewEvidence({
    record: { ...record, base_ref: 'Main' },
    policy,
    current: reviewCurrent(record, { base_ref: 'main' }),
  });
  assert.match(JSON.stringify(branchFindings), /review-evidence-stale/,
    'branch names remain exact strings even when repository identity is normalized');
});

test('review evidence with a different qualified repository is still stale', () => {
  const record = structuredClone(firstEvidenceRecord);
  const findings = checkReviewEvidence({
    record,
    policy: reviewPolicy(),
    current: reviewCurrent(record, { pr: 'example/other-consumer#42' }),
  });
  assert.match(JSON.stringify(findings), /review-evidence-stale/);
});
