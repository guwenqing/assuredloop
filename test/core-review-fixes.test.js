import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { verifyInitialBootstrap } from '../src/initial-bootstrap.js';
import { checkReviewerEligibility } from '../src/policy.js';
import { validateRecord } from '../src/records.js';
import { reviewEvidenceApplicability } from '../src/review-evidence.js';
import { scenario } from './fixtures/issue36-bootstrap/scenario.mjs';
import { wrap } from './fixtures/issue36-bootstrap/records.mjs';
import { lifecycleCliFixture, applicability, priorSource } from './fixtures/issue37-routing/lifecycle-cli.mjs';
import { firstEvidenceRecord, evidenceEntry, pullSnapshot } from './fixtures/work-records/helpers.mjs';
import { readLog } from './fixtures/trace-cli/helpers.mjs';
import { makeNonPrEvidenceFixture } from './fixtures/execution-evidence-review/helpers.mjs';

function minimalBootstrap() {
  const fixture = scenario();
  fixture.verificationPolicy.config.project.review = { context: { max_inline_bytes: 65536 } };
  delete fixture.verification.reviewer_model;
  delete fixture.verification.review_depth;
  return fixture;
}

test('bootstrap record shape permits omitted model and depth under consumer-selected constraints', () => {
  const fixture = minimalBootstrap();
  const checked = validateRecord('initialBootstrapVerification', fixture.verification);
  assert.equal(checked.valid, true, JSON.stringify(checked.errors));
});

test('source-backed initial bootstrap verification accepts minimal current review policy without model or depth', async () => {
  const fixture = minimalBootstrap();
  const result = await verifyInitialBootstrap({ adapter: fixture.adapter,
    record: fixture.verification, verificationPolicy: fixture.verificationPolicy });
  assert.equal(result.valid, true, JSON.stringify(result.findings));
  assert.ok(fixture.calls.some((call) => call.method === 'readCommit'), 'Verification still checks original Git objects.');
  assert.ok(fixture.calls.some((call) => call.method === 'readComment'), 'Verification still checks original source bytes.');
});

for (const [field, code] of [['reviewer_model', 'review-model-unresolved'], ['review_depth', 'review-depth-invalid']]) {
  test(`explicit legacy bootstrap constraints still reject omitted ${field} contextually`, async () => {
    const fixture = scenario();
    delete fixture.verification[field];
    const findings = checkReviewerEligibility({ record: fixture.verification,
      policy: fixture.verificationPolicy, reviewKind: 'internal' });
    assert.ok(findings.some((finding) => finding.code === code), JSON.stringify(findings));
    await assert.rejects(verifyInitialBootstrap({ adapter: fixture.adapter,
      record: fixture.verification, verificationPolicy: fixture.verificationPolicy }),
    (error) => error.code === 'initial-bootstrap-review-invalid' && JSON.stringify(error.details).includes(code));
  });
}

function assertVerdictDiagnostic(findings) {
  const finding = findings.find((item) => item.code === 'review-verdict-invalid');
  assert.ok(finding, JSON.stringify(findings));
  assert.equal(finding.severity, 'review', 'Historical repair advice must not itself invalidate a current assessment.');
  for (const verdict of ['pass', 'fail', 'revise', 'incomplete']) {
    assert.match(JSON.stringify(finding), new RegExp(`\\b${verdict}\\b`));
  }
}

for (const state of ['current', 'noncurrent']) {
  test(`applicability retains a nonblocking verdict repair for ${state} historical prose`, () => {
    const record = structuredClone(firstEvidenceRecord);
    record.result = 'PASS: historical reviewer reported no blockers, with explanatory prose.';
    const pull = pullSnapshot();
    if (state === 'noncurrent') record.head = '9'.repeat(40);
    const entry = evidenceEntry(record);
    const original = JSON.stringify(entry);
    const result = reviewEvidenceApplicability({ entry, pr: record.pr, pull });
    assert.equal(result.applicability, state);
    assertVerdictDiagnostic(result.findings);
    assert.equal(JSON.stringify(entry), original);
    assert.notEqual(entry.record.result, 'pass');
    if (state === 'noncurrent') assert.ok(result.findings.some((finding) => finding.code === 'review-history-retained'));
  });
}

for (const operation of ['inspect', 'check']) {
  test(`linked no-routing ${operation} passes with fresh canonical evidence and retains old prose repair`, async (t) => {
    const fixture = await lifecycleCliFixture(t, { legacy: true });
    fixture.old.result = 'PASS: historical reviewer reported no blockers, with explanatory prose.';
    await fixture.save();
    const original = fixture.store.records['issues/comments/301'].body;
    assert.equal(original, wrap(fixture.old));
    assert.equal(fixture.config.project.review.routing, undefined);
    const result = await fixture.run(operation);
    assert.equal(result.exit, 0, JSON.stringify(result.value.findings));
    assert.equal(result.value.status, 'pass');
    const prior = applicability(result, priorSource);
    assert.equal(prior.applicability, 'noncurrent');
    assertVerdictDiagnostic(prior.findings);
    assert.equal(applicability(result, { repository: 'example/consumer', comment_id: 101 }).applicability, 'current');
    assert.equal(fixture.old.result, 'PASS: historical reviewer reported no blockers, with explanatory prose.');
    if (operation === 'inspect') {
      const source = result.value.packet.entries.find((entry) => entry.ref?.comment_id === 301);
      assert.ok(source, 'Original noncurrent source stays in the packet.');
      assert.equal(source.content, original);
    }
    const commands = await readLog(fixture.ghLog);
    assert.ok(commands.filter((args) => args[0] === 'api').every((args) => args.includes('GET')));
  });
}

test('old descriptive review alone cannot supply current acceptance credit', async (t) => {
  const fixture = await lifecycleCliFixture(t, { legacy: true });
  fixture.old.result = 'PASS: historical reviewer reported no blockers.';
  fixture.reviews.splice(0);
  await fixture.save();
  const result = await fixture.run('check');
  assert.notEqual(result.exit, 0);
  const prior = applicability(result, priorSource);
  assert.equal(prior.applicability, 'noncurrent');
  assert.equal(result.value.review_evidence.some((entry) => entry.applicability === 'current'), false);
});

test('non-PR inspect retains historical review prose and exposes a nonblocking verdict repair', async (t) => {
  const fixture = await makeNonPrEvidenceFixture(t, { contextBudget: 65536, ordinary: {
    result: 'PASS: historical research review',
    producer_session: 'research-producer', reviewer_session: 'independent-research-reviewer',
    reviewer_model: 'gpt-6-astra', review_depth: 'full-scope',
  } });
  assert.equal(validateRecord('evidence', fixture.ordinaryEvidence).valid, true);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli.js', import.meta.url)),
    'inspect', '--target', fixture.root, '--work', fixture.researchWork,
    '--expand', JSON.stringify({ repository: 'example/consumer', comment_id: 601 })], {
    env: fixture.env, encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout || result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, 'pass');
  const source = output.packet.entries.find((entry) => entry.ref?.comment_id === 601);
  assert.ok(source, 'Historical non-PR review remains in the source packet.');
  assert.equal(source.content, fixture.ordinaryBody);
  assert.match(JSON.stringify(output), /review-verdict-invalid/);
});
