import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { checkReviewEvidence, resolvePolicy } from '../src/policy.js';
import { validateRecord } from '../src/records.js';
import { readRecordBody } from '../src/record-body.js';
import { currentTuple, evidenceRecord, makeReviewScenario, work } from './fixtures/review-kind/helpers.mjs';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const minimalReview = { context: { max_inline_bytes: 65536 } };

async function assessment(t, { minimal = true } = {}) {
  const fixture = await makeReviewScenario(t);
  const policy = await resolvePolicy({ adapter: fixture.adapter, work, packageRoot: repositoryRoot });
  assert.equal(policy.status, 'available', JSON.stringify(policy.findings));
  const current = currentTuple(policy, fixture);
  const record = evidenceRecord(policy, fixture, { reviewer_model: 'internal-model' });
  if (minimal) {
    policy.config.project.review = structuredClone(minimalReview);
    delete record.reviewer_model;
    delete record.review_depth;
  }
  return { policy, current, record };
}

function assertFinding(findings, code) {
  assert.ok(findings.some((finding) => finding.code === code), JSON.stringify(findings));
}

test('packaged Skills expose only adoption, records, context and synchronization operations', async () => {
  const entries = await readdir(new URL('../skills/', import.meta.url), { withFileTypes: true });
  assert.deepEqual(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(), [
    'assuredloop-adopt', 'assuredloop-context', 'assuredloop-record', 'assuredloop-sync',
  ]);
  for (const entry of entries.filter((item) => item.isDirectory())) {
    const body = await readFile(new URL(`../skills/${entry.name}/SKILL.md`, import.meta.url), 'utf8');
    assert.ok(body.trim(), `${entry.name} must provide its operation guidance.`);
  }
});

test('template review configuration supplies context budgeting without a default work methodology', async () => {
  const config = JSON.parse(await readFile(new URL('../templates/records/config.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.project.review, minimalReview);
  assert.equal(validateRecord('config', config).valid, true);
});

test('minimal review configuration is valid in the complete existing config fixture', async () => {
  const config = JSON.parse(await readFile(new URL('../templates/records/config.json', import.meta.url), 'utf8'));
  config.project.review = structuredClone(minimalReview);
  const result = validateRecord('config', config);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(validateRecord('review', {}).valid, true, 'Context budgeting itself is optional.');
});

test('minimal review policy accepts distinct sessions without requiring model, depth or review routing', async (t) => {
  const input = await assessment(t);
  const shape = validateRecord('evidence', input.record);
  assert.equal(shape.valid, true, JSON.stringify(shape.errors));
  assert.deepEqual(checkReviewEvidence(input), []);
});

test('minimal review policy still rejects producer self-review', async (t) => {
  const input = await assessment(t);
  input.record.reviewer_session = input.record.producer_session;
  assertFinding(checkReviewEvidence(input), 'review-independence-invalid');
});

test('minimal review policy still rejects a different PR assessment tuple', async (t) => {
  const input = await assessment(t);
  input.record.pr = `${work.split('#')[0]}#999999`;
  assertFinding(checkReviewEvidence(input), 'review-evidence-stale');
});

test('explicit legacy model exclusions remain enforceable', async (t) => {
  const input = await assessment(t, { minimal: false });
  assert.equal(validateRecord('evidence', input.record).valid, true);
  assert.deepEqual(checkReviewEvidence({ ...input, reviewKind: 'internal' })
    .filter((finding) => finding.code !== 'review-kind-declared'), []);
  input.record.reviewer_model = 'excluded-model';
  assertFinding(checkReviewEvidence({ ...input, reviewKind: 'internal' }), 'review-model-excluded');
});

test('explicit legacy full-scope policy remains enforceable', async (t) => {
  const input = await assessment(t, { minimal: false });
  delete input.record.review_depth;
  assertFinding(checkReviewEvidence({ ...input, reviewKind: 'internal' }), 'review-depth-invalid');
});

test('local review checking rejects explanatory historical verdicts without rewriting the source record', async (t) => {
  const input = await assessment(t);
  input.record.result = 'PASS: the historical reviewer reported no remaining blockers.';
  const original = JSON.stringify(input.record, null, 2);
  const parsed = await readRecordBody(original, { allowPlain: true });
  assert.equal(validateRecord('evidence', parsed).valid, true, 'Historical source shape remains readable.');
  const findings = checkReviewEvidence({ ...input, record: parsed });
  assertFinding(findings, 'review-verdict-invalid');
  const verdictFinding = findings.find((finding) => finding.code === 'review-verdict-invalid');
  for (const verdict of ['pass', 'fail', 'revise', 'incomplete']) {
    assert.match(JSON.stringify(verdictFinding), new RegExp(`\\b${verdict}\\b`));
  }
  assert.equal(JSON.stringify(parsed, null, 2), original, 'Eligibility checking must not rewrite historical data.');
  assert.notEqual(parsed.result, 'pass');
});
