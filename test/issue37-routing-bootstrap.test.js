import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyInitialBootstrap } from '../src/initial-bootstrap.js';
import { captureManifest, checkManifest } from '../src/manifest.js';
import { checkReviewerEligibility, checkReviewEvidence } from '../src/policy.js';
import { validateRecord } from '../src/records.js';
import { checkWorkRecords } from '../src/work-records.js';
import { categoryMapping } from './fixtures/work-records/helpers.mjs';
import { scenario, commentKey } from './fixtures/issue36-bootstrap/scenario.mjs';
import { ref, repository, wrap } from './fixtures/issue36-bootstrap/records.mjs';
import { evidence, policy } from './fixtures/issue37-records/helpers.mjs';

function routed() {
  const f = scenario();
  f.verificationPolicy.config.project.review.routing = { primary_tool: 'gemini', additional: 'required' };
  return f;
}
const verify = (f) => verifyInitialBootstrap({ adapter: f.adapter, record: f.verification, verificationPolicy: f.verificationPolicy });
const errors = (result) => result.findings.filter((finding) => finding.severity !== 'review');

test('specialized legacy bootstrap remains a valid control without routing', async () => {
  assert.equal((await verify(scenario())).valid, true);
});
test('specialized bootstrap verifies under current routing without new role or tool fields', async () => {
  const f = routed(); const before = structuredClone(f.verification);
  assert.equal(validateRecord('initialBootstrapVerification', f.verification).valid, true);
  const result = await verify(f);
  assert.equal(result.valid, true);
  assert.deepEqual(f.verification, before);
  assert.equal(Object.hasOwn(f.verification, 'review_kind'), false);
  assert.equal(Object.hasOwn(f.verification, 'review_tool'), false);
  assert.ok(result.findings.some((item) => item.severity === 'review' && /semantic/i.test(item.code)));
  assert.ok(f.calls.some((call) => call.method === 'readCommit'));
  assert.ok(f.calls.some((call) => call.method === 'readComment' && call.value.comment_id === 403));
});
test('specialized current-policy alias resolves without fabricating native tool identity', async () => {
  const f = routed(); f.verificationPolicy.config.project.review.model_aliases = { chosen: 'gpt-6-astra' }; f.verification.reviewer_model = 'chosen';
  assert.equal((await verify(f)).valid, true);
});
for (const [name, change, code] of [
  ['wrong current policy ref', (f) => { f.verification.verification_policy_ref.revision = '7'.repeat(40); }, 'initial-bootstrap-policy-unavailable'],
  ['unavailable current policy', (f) => { f.verificationPolicy.status = 'unavailable'; }, 'initial-bootstrap-policy-unavailable'],
  ['model outside current internal allowlist', (f) => { f.verification.reviewer_model = 'outside-allowlist'; }, 'initial-bootstrap-review-invalid'],
  ['excluded resolved alias', (f) => { f.verificationPolicy.config.project.review.model_aliases = { chosen: 'gpt-6-astra' }; f.verificationPolicy.config.project.review.excluded_models.push('chosen'); f.verification.reviewer_model = 'chosen'; }, 'initial-bootstrap-review-invalid'],
  ['producer session reused', (f) => { f.verification.reviewer_session = f.verification.producer_session; }, 'initial-bootstrap-review-invalid'],
  ['changed original review bytes', (f) => { f.comments.get(commentKey(f.verification.sources[2].source)).body += '\nchanged'; }, 'evidence-drift'],
  ['different delivered tree', (f) => { f.commits.get(f.verification.merge_sha).tree.sha = '7'.repeat(40); }, 'initial-bootstrap-merge-unsupported'],
  ['reference outside current ceiling', (f) => { f.verification.sources[2].source.repository = 'outside/consumer'; }, 'reference-out-of-scope'],
]) {
  test(`specialized verification under routing still rejects ${name}`, async () => {
    const f = routed(); change(f);
    await assert.rejects(verify(f), (error) => error.code === code);
  });
}
for (const [name, change] of [
  ['mixed ordinary role/tool fields', (f) => { f.verification.review_kind = 'internal'; f.verification.review_tool = 'gemini'; }],
  ['bare discriminator', (f) => { f.verification = { record_type: 'initial-bootstrap-verification' }; }],
  ['missing full depth declaration', (f) => { delete f.verification.review_depth; }],
]) {
  test(`actual specialized verifier rejects ${name} before acquiring sources`, async () => {
    const f = routed(); change(f);
    await assert.rejects(verify(f), (error) => error.code === 'initial-bootstrap-invalid');
    assert.deepEqual(f.calls, []);
  });
}
test('a mixed ordinary record tag cannot select the specialized helper exception', () => {
  const record = evidence(); delete record.review_kind; delete record.review_tool;
  record.record_type = 'initial-bootstrap-verification';
  assert.equal(validateRecord('initialBootstrapVerification', record).valid, false);
  const findings = checkReviewerEligibility({ record, policy: policy(), reviewKind: 'internal' });
  assert.ok(findings.some((item) => item.severity !== 'review' && /invalid|kind|tool|specialized|bootstrap/i.test(JSON.stringify(item))), JSON.stringify(findings));
  const actual = checkReviewEvidence({ record, policy: policy(), current: { head: record.head }, reviewKind: 'internal' });
  assert.ok(actual.some((item) => item.code === 'review-evidence-invalid'));
});
test('bootstrap manifest capture and recheck retain specialized source verification under routing', async () => {
  const f = routed();
  const captured = await captureManifest(f.captureArgs());
  assert.equal(captured.manifest.deliveries.length, 1);
  assert.deepEqual(errors(captured), []);
  assert.deepEqual(captured.manifest.deliveries[0].initial_bootstrap.verification, f.verification);
  const checked = await checkManifest({ ...f.checkArgs(), manifest: captured.manifest });
  assert.equal(checked.valid, true, JSON.stringify(checked.findings));
  assert.ok(f.calls.some((call) => call.method === 'readComment' && call.value.comment_id === 405));
});
test('bootstrap manifest cannot admit a mixed tagged record under routing', async () => {
  const f = routed(); f.verification.review_kind = 'internal'; f.refreshLater();
  const checked = await checkManifest(f.checkArgs());
  assert.equal(checked.valid, false);
});
test('PR prerequisite callback retains specialized validation under routed invoking policy', async () => {
  const f = routed(); const ownerWork = `${repository}#2`; const dependentWork = `${repository}#8`;
  const basis = ref('e'.repeat(40), 'openspec/changes/bootstrap/proposal.md');
  const plan = { ...ref('e'.repeat(40), 'openspec/changes/bootstrap/tasks.md'), items: ['1.1'] };
  const owner = { issue: { number: 2, state: 'open', labels: [{ name: 'type:architecture-task' }], repository_url: `https://api.github.com/repos/${repository}`,
    body: wrap({ activity: 'plan', request: `${repository}#1`, change: 'bootstrap', basis: [basis], plan_items: [plan] }) } };
  f.pull.body = wrap({ issues: [ownerWork], change: 'bootstrap', basis: [basis], plan_items: [plan] });
  const contribution = { issue: { number: 4, state: 'closed', body: f.pull.body, repository_url: `https://api.github.com/repos/${repository}`,
    pull_request: { url: `https://api.github.com/repos/${repository}/pulls/4` } }, pulls: [f.pull],
    evidence: [{ ref: { repository, comment_id: 405 }, record: f.verification, body: f.comments.get(commentKey(f.laterSource)).body }] };
  let called = 0;
  const result = await checkWorkRecords({ work: dependentWork, categoryMapping,
    issue: { number: 8, state: 'open', labels: [{ name: 'type:task' }], repository_url: `https://api.github.com/repos/${repository}`,
      body: wrap({ activity: 'deliver', request: `${repository}#1`, basis: [basis], depends_on: [f.verification.pr] }) },
    async resolveWork(value) { if (value === ownerWork) return structuredClone(owner); if (value === f.verification.pr) return structuredClone(contribution); throw new Error(`Unexpected work ${value}`); },
    async resolveRef(source) { return { content: source.path.endsWith('tasks.md') ? `## 1. Bootstrap\nWork Issue: [#2](https://github.com/${repository}/issues/2)\n\n- [x] 1.1 Initial contribution.\n` : '# Bootstrap accepted proposal\n' }; },
    async verifyBootstrap(value) { called++; return verifyInitialBootstrap({ adapter: f.adapter, record: value.record, verificationPolicy: f.verificationPolicy }); },
  });
  assert.equal(result.status, 'valid', JSON.stringify(result.findings));
  assert.equal(called, 1);
  assert.ok(f.calls.some((call) => call.method === 'readCommit'));
});
