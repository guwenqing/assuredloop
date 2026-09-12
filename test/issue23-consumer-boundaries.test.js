import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { linkedConsumerFixture } from './fixtures/issue23-consumer/helpers.mjs';
import { git, readLog } from './fixtures/trace-cli/helpers.mjs';

const cases = [
  ['missing requirement source', async (f) => {
    f.issueRecord.basis[0].path = 'openspec/changes/trace-cli/missing-requirement.md';
    delete f.issueRecord.basis[0].anchor; await f.save();
  }, /reference-unavailable/],
  ['missing independent review', async (f) => {
    f.store.records['issues/42/comments'] = [[]]; f.store.records['issues/43/comments'] = [[]]; await f.save();
  }, /review-evidence-missing/],
  ['missing fixed policy acceptance source', async (f) => {
    delete f.store.records['issues/comments/100']; await f.save();
  }, /project\.bootstrap\.policy_acceptance/],
  ['invalid destination configuration', async (f) => {
    await f.changeBaseConfig((config) => { config.schema_version = 999; });
  }, /acquisition configuration is invalid|Invalid.*config|policy-unavailable/],
  ['stale reviewed head', async (f) => {
    f.evidence.head = '7'.repeat(40); f.updateEvidence(); await f.save();
  }, /review-evidence-stale|evidence-tuple-stale/],
  ['stale reviewed base', async (f) => {
    f.evidence.base_sha = f.initialRevision; f.updateEvidence(); await f.save();
  }, /review-evidence-stale|evidence-tuple-stale/],
  ['same-session review', async (f) => {
    f.evidence.reviewer_session = f.evidence.producer_session; f.updateEvidence(); await f.save();
  }, /review-independence-invalid/],
  ['forbidden fixed policy source', async (f) => {
    await f.changeBaseConfig((config) => { config.project.bootstrap.policy_ref.repository = 'forbidden/private'; });
  }, /reference-out-of-scope/],
  ['missing fixed policy source', async (f) => {
    await f.changeBaseConfig((config) => { config.project.bootstrap.policy_ref.path = 'policy/not-delivered.md'; });
  }, /project\.bootstrap\.policy_ref.*does not exist|project\.bootstrap\.policy_ref.*unavailable/],
];

for (const [name, mutate, expected] of cases) {
  test(`linked consumer checks preserve ${name} failure`, async (t) => {
    const f = await linkedConsumerFixture(t);
    await mutate(f);
    const result = await f.run();
    assert.notEqual(result.exit, 0, `${name} was waived`);
    assert.notEqual(result.value.status, 'pass');
    assert.match(JSON.stringify(result.value), expected,
      `${name} must remain the consumer diagnostic, not an excluded toolkit check`);
    assert.equal(result.value.runtime?.mode, 'linked-development');
    assert.equal(result.value.runtime?.toolkit_verification, 'not-performed');
    assert.equal((JSON.stringify(result.value).match(/"toolkit_verification"/g) || []).length, 1);
    if (name === 'forbidden fixed policy source') {
      const commands = await readLog(f.ghLog);
      assert.equal(commands.some((args) => args.some((arg) => arg.startsWith('repos/forbidden/private'))), false,
        'linked runtime cannot broaden the existing source acquisition ceiling');
    }
  });
}

test('candidate configuration cannot relax the destination review policy or choose its runtime exemption', async (t) => {
  const f = await linkedConsumerFixture(t);
  const candidate = JSON.parse(await readFile(path.join(f.root, '.assuredloop/config.json'), 'utf8'));
  candidate.project.review.excluded_models = [];
  candidate.project.review.internal.allowed_models = ['gpt-5.6-luna'];
  candidate.runtime = { mode: 'linked-development', skip_consumer_checks: true };
  await writeFile(path.join(f.root, '.assuredloop/config.json'), JSON.stringify(candidate));
  await git(f.root, ['add', '.assuredloop/config.json']);
  await git(f.root, ['commit', '-q', '-m', 'unaccepted candidate policy claim']);
  const head = (await git(f.root, ['rev-parse', 'HEAD'])).stdout.trim();
  f.store.records['pulls/43'].head.sha = head;
  f.store.records['pulls/43/files'] = [[{ filename: '.assuredloop/config.json', status: 'modified' }]];
  f.evidence.head = head; f.evidence.reviewer_model = 'gpt-5.6-luna'; f.updateEvidence(); await f.save();
  const result = await f.run();
  assert.notEqual(result.exit, 0);
  assert.match(JSON.stringify(result.value), /review-model-excluded/);
  assert.deepEqual(result.value.policy.config.project.review.excluded_models, f.config.project.review.excluded_models);
  assert.equal(result.value.runtime?.mode, 'linked-development', 'actual package link selects runtime independently of candidate data');
});

test('historical linked reconstruction rejects an altered declared consumer package', async (t) => {
  const f = await linkedConsumerFixture(t, { historical: true });
  f.evidence.contract_package.version = '8.8.8'; f.updateEvidence(); await f.save();
  const result = await f.run();
  assert.notEqual(result.exit, 0);
  assert.match(JSON.stringify(result.value), /historical-policy-mismatch/);
  assert.equal(result.value.runtime?.mode, 'linked-development');
});
