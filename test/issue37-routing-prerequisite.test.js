import assert from 'node:assert/strict';
import test from 'node:test';
import { routedPrerequisiteFixture } from './fixtures/issue37-routing/prerequisite.mjs';

test('historically required paired reviews qualify the real prerequisite contribution while its owner remains open', async (t) => {
  const f = await routedPrerequisiteFixture(t);
  const result = await f.run();
  assert.equal(result.exit, 0, JSON.stringify(result.value.findings));
  assert.equal(result.value.policy.config.project.review.routing.additional, 'on-request');
  assert.equal(f.store.records['issues/40'].state, 'open');
  assert.match(JSON.stringify(result.value.records), /example\/consumer#41/);
  assert.match(JSON.stringify(result.value.records), /original-additional-session/);
  assert.match(JSON.stringify(result.value.records), /1\.2/);
  assert.equal(result.value.review_routing.find((item) => item.pr === 'example/consumer#43').status, 'satisfied');
});

for (const reviews of ['primary-only', 'external-only']) {
  test(`historically required prerequisite rejects ${reviews} despite current on-request routing`, async (t) => {
    const f = await routedPrerequisiteFixture(t, { reviews });
    const result = await f.run();
    assert.equal(result.value.policy.config.project.review.routing.additional, 'on-request');
    assert.equal(result.value.review_routing.find((item) => item.pr === 'example/consumer#43').status, 'satisfied',
      'the current PR has its own qualifying ordinary review');
    assert.notEqual(result.exit, 0, `${reviews} incorrectly discharged historical primary-plus-additional obligations`);
    assert.match(JSON.stringify(result.value.findings), /prerequisite-unverified/);
    assert.match(JSON.stringify(result.value.findings), /example\/consumer#41/);
  });
}
