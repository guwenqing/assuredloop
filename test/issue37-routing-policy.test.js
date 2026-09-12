import assert from 'node:assert/strict';
import test from 'node:test';
import { checkReviewerEligibility, checkReviewEvidence, resolvePolicy } from '../src/policy.js';
import { comment, makePolicyFixture, repository, work, policyPath } from './fixtures/policy/helpers.js';
import { config, policy, evidence, head, packageRoot, eligible, diagnostic, failures } from './fixtures/issue37-records/helpers.mjs';

const check = (record = evidence(), accepted = policy(), extra = {}) => checkReviewerEligibility({ record, policy: accepted, ...extra });

test('declared primary review uses consumer custom model and distinct same-model sessions', () => {
  eligible(check());
});
test('primary eligibility resolves an owner alias to the exact custom model', () => {
  eligible(check(evidence({ reviewer_model: 'chosen' })));
});
test('primary model allowlist is enforced using the source declaration without caller role', () => {
  diagnostic(check(evidence({ reviewer_model: 'owner-model-r7-extra' })), /model.*(?:ineligible|allowlist)/i);
});
test('declared tool is exact and cannot be inferred from model or transport', () => {
  diagnostic(check(evidence({ review_tool: 'gemini' })), /tool.*(?:mismatch|primary)|primary.*tool/i);
});
test('primary route must be in repository selected tools', () => {
  diagnostic(check(evidence({ review_tool: 'gemini' }), policy({ routing: { primary_tool: 'gemini', additional: 'on-request' } })), /primary.*select|select.*primary/i);
});
for (const field of ['review_kind', 'review_tool']) {
  test(`routing requires actual ${field}; caller role cannot supply it`, () => {
    const record = evidence(); delete record[field];
    diagnostic(check(record, policy(), { reviewKind: 'internal' }), field === 'review_kind' ? /kind|role/ : /tool/);
  });
}
test('caller external comparison cannot bypass source-declared primary model restriction', () => {
  diagnostic(check(evidence({ reviewer_model: 'outside-primary-allowlist' }), policy(), { reviewKind: 'external' }), /model.*(?:ineligible|allowlist)|kind.*(?:mismatch|conflict)/i);
});
test('caller internal comparison cannot relabel source-declared additional evidence as primary', () => {
  const findings = check(evidence({ review_kind: 'external', reviewer_model: 'additional-model' }), policy(), { reviewKind: 'internal' });
  assert.ok(!findings.some((item) => item.code === 'review-kind-declared' && item.review_kind === 'internal'), JSON.stringify(findings));
  assert.ok(findings.some((item) => item.review_kind === 'external' || /kind.*(?:mismatch|conflict)|role.*(?:mismatch|conflict)/i.test(JSON.stringify(item))), JSON.stringify(findings));
});
test('source additional declaration may use same tool and an independent model outside internal allowlist', () => {
  eligible(check(evidence({ review_kind: 'external', reviewer_model: 'additional-model' })));
});
for (const kind of ['internal', 'external']) {
  test(`${kind} review retains producer/reviewer session separation`, () => {
    diagnostic(check(evidence({ review_kind: kind, reviewer_session: 'owner-model-r7:producer' })), /independence|session/i);
  });
  test(`${kind} review retains resolved model exclusion`, () => {
    diagnostic(check(evidence({ review_kind: kind, reviewer_model: 'owner-model-rejected' })), /model.*excluded/i);
  });
}
test('excluded alias cannot hide behind an otherwise allowed model', () => {
  const accepted = policy(); accepted.config.project.review.excluded_models.push('chosen');
  diagnostic(check(evidence({ reviewer_model: 'chosen' }), accepted), /model.*excluded/i);
});
test('alias cycle remains an explicit unresolved model failure under routing', () => {
  const accepted = policy(); accepted.config.project.review.model_aliases = { first: 'second', second: 'first' };
  diagnostic(check(evidence({ reviewer_model: 'first' }), accepted), /model.*unresolved|alias.*cycle/i);
});
test('routed review Evidence validates complete source declarations and current context', () => {
  eligible(checkReviewEvidence({ record: evidence(), policy: policy(), current: { head } }));
});
test('routed review Evidence still rejects a stale candidate head', () => {
  diagnostic(checkReviewEvidence({ record: evidence(), policy: policy(), current: { head: 'b'.repeat(40) } }), /review-evidence-stale/i);
});
test('legacy policy retains unresolved-role notice and does not invent a primary tool', () => {
  const record = evidence(); delete record.review_kind; delete record.review_tool;
  const findings = check(record, policy({ routing: null }));
  assert.deepEqual(failures(findings), []);
  assert.ok(findings.some((item) => item.code === 'review-kind-unresolved' && item.severity === 'review'));
  assert.ok(!findings.some((item) => item.review_tool || /tool.*(?:missing|mismatch)/i.test(item.code)));
});
test('legacy caller-selected internal model comparison remains unchanged', () => {
  const record = evidence({ reviewer_model: 'outside-primary-allowlist' }); delete record.review_kind; delete record.review_tool;
  diagnostic(check(record, policy({ routing: null }), { reviewKind: 'internal' }), /review-model-ineligible/);
});

async function resolvedFixture(t, options) {
  const fixture = await makePolicyFixture({ configFor: ({ policyRevision }) => {
    const value = config(options);
    value.project.bootstrap = { policy_ref: { repository, revision: policyRevision, path: policyPath },
      policy_acceptance: { repository, comment_id: 101 }, proposal_acceptance: { repository, comment_id: 102 }, authorized_by: 'owner' };
    return value;
  }, comments: { [`${repository}#101`]: comment(101, 'Owner accepted fixed policy.'), [`${repository}#102`]: comment(102, 'Owner accepted scoped proposal.') } });
  t.after(() => fixture.dispose());
  return { fixture, result: await resolvePolicy({ adapter: fixture.adapter, work, packageRoot }) };
}
test('resolved destination policy exposes accepted routing and preserves exact owner models', async (t) => {
  const { fixture, result } = await resolvedFixture(t);
  assert.equal(result.status, 'available', JSON.stringify(result.findings));
  assert.deepEqual(result.config.project.review.routing, { primary_tool: 'codex', additional: 'on-request' });
  assert.deepEqual(result.config.project.review.internal.allowed_models, ['owner-model-r7']);
  assert.ok(fixture.adapter.calls.readBlob.some((ref) => ref.path === '.assuredloop/config.json' && ref.revision === fixture.baseRevision));
  assert.ok(!fixture.adapter.calls.readBlob.some((ref) => ref.revision === fixture.headRevision));
});
test('resolved legacy policy stays available and reports routing not configured', async (t) => {
  const { result } = await resolvedFixture(t, { routing: null });
  assert.equal(result.status, 'available', JSON.stringify(result.findings));
  assert.ok(result.findings.some((item) => /routing/i.test(JSON.stringify(item)) && /not.configured|absent|unconfigured/i.test(JSON.stringify(item))), JSON.stringify(result.findings));
  assert.equal(Object.hasOwn(result.config.project.review, 'routing'), false);
});
test('resolved policy rejects a primary tool absent from selected repository integrations', async (t) => {
  const { result } = await resolvedFixture(t, { routing: { primary_tool: 'gemini', additional: 'required' } });
  assert.equal(result.status, 'unavailable');
  assert.ok(result.findings.some((item) => /primary.*select|select.*primary/i.test(JSON.stringify(item))), JSON.stringify(result.findings));
});
