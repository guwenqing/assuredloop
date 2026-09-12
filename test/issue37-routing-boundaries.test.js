import assert from 'node:assert/strict';
import test from 'node:test';
import { routingFixture, route } from './fixtures/issue37-routing/helpers.mjs';
import { specializedOnlyFixture } from './fixtures/issue37-routing/specialized.mjs';

const cases = [
  ['missing additional review', (f) => { f.reviews.pop(); }],
  ['external review cannot replace primary', (f) => { f.reviews.shift(); }],
  ['primary and additional share a reviewer session', (f) => { f.external.reviewer_session = f.primary.reviewer_session; }],
  ['additional reviewer is the producer', (f) => { f.external.reviewer_session = f.external.producer_session; }],
  ['missing additional reviewer session', (f) => { delete f.external.reviewer_session; }],
  ['primary tool differs from configured primary', (f) => { f.primary.review_tool = 'gemini'; }],
  ['primary tool is undeclared', (f) => { delete f.primary.review_tool; }],
  ['primary role is undeclared', (f) => { delete f.primary.review_kind; }],
  ['additional tool is undeclared', (f) => { delete f.external.review_tool; }],
  ['additional role is undeclared', (f) => { delete f.external.review_kind; }],
  ['additional head is stale', (f) => { f.external.head = '7'.repeat(40); }],
  ['additional base is stale', (f) => { f.external.base_sha = f.initialRevision; }],
  ['additional assessment is not passing', (f) => { f.external.result = 'revise'; }],
];

for (const [name, mutate] of cases) {
  test(`required aggregate routing rejects ${name}`, async (t) => {
    const f = await routingFixture(t, { additional: 'required', externalTool: 'codex' });
    mutate(f); await f.save();
    const result = await f.run();
    assert.notEqual(result.exit, 0, `${name} discharged a review obligation`);
    const routing = route(result);
    assert.equal(routing.status, 'incomplete', JSON.stringify(routing));
    const primarySessions = new Set(routing.qualified.internal.map((item) => item.reviewer_session));
    assert.equal(routing.qualified.external.some((item) => primarySessions.has(item.reviewer_session)), false,
      'one reviewer session cannot discharge both primary and additional obligations');
    if (name.startsWith('additional ') && !name.includes('producer')) assert.equal(routing.qualified.external.length, 0,
      'nonqualifying additional evidence must not be counted as satisfied coverage');
  });
}

test('unknown additional native tool remains visible but cannot qualify', async (t) => {
  const f = await routingFixture(t, { additional: 'required', externalTool: 'not-a-native-tool' });
  const result = await f.run();
  assert.notEqual(result.exit, 0);
  const routing = route(result);
  assert.equal(routing.status, 'incomplete');
  assert.equal(routing.qualified.external.length, 0);
  assert.match(JSON.stringify(result.value), /unsupported.tool|tool.unsupported/i);
  assert.ok(result.value.context.evidence.some((entry) => entry.record.review_tool === 'not-a-native-tool'),
    'unknown native-ID qualification does not silently discard the original report');
});

test('unavailable native registry is inability to qualify, not invented unsupported-tool certainty', async (t) => {
  const f = await routingFixture(t, { additional: 'required', externalTool: 'gemini' });
  const result = await f.runWithRegistryFault();
  assert.notEqual(result.exit, 0);
  assert.equal(route(result).status, 'unavailable');
  assert.match(JSON.stringify(result.value), /registry.*unavailable|compatibility-error/i);
  assert.doesNotMatch(JSON.stringify(result.value.findings), /unsupported-tool|tool-unsupported/);
});

test('candidate on-request routing cannot waive the destination requirement for additional review', async (t) => {
  const f = await routingFixture(t, { additional: 'required' });
  await f.candidateRouting({ primary_tool: 'codex', additional: 'on-request' });
  const result = await f.run();
  assert.notEqual(result.exit, 0);
  const routing = route(result);
  assert.equal(routing.additional, 'required');
  assert.equal(routing.status, 'incomplete');
  assert.equal(result.value.policy.config.project.review.routing.additional, 'required');
});

test('verified specialized bootstrap prerequisite cannot discharge current ordinary primary or additional review', async (t) => {
  const f = await specializedOnlyFixture(t);
  const result = await f.run();
  assert.notEqual(result.exit, 0);
  assert.match(JSON.stringify(result.value.records), /initial-bootstrap-semantic-review-required/,
    'the distinct source-backed prerequisite remains verifiable under current policy');
  assert.match(JSON.stringify(result.value.findings), /review-evidence-missing/);
  const routing = route(result);
  assert.equal(routing.status, 'incomplete');
  assert.equal(routing.qualified.internal.length, 0);
  assert.equal(routing.qualified.external.length, 0);
});

test('mixed specialized tag with ordinary role and tool fields cannot evade ordinary routing', async (t) => {
  const f = await specializedOnlyFixture(t, { mixed: true });
  const result = await f.run();
  assert.notEqual(result.exit, 0);
  assert.match(JSON.stringify(result.value), /invalid|schema/);
  const routing = route(result);
  assert.equal(routing.status, 'incomplete');
  assert.equal(routing.qualified.internal.length, 0);
  assert.equal(routing.qualified.external.length, 0);
});
