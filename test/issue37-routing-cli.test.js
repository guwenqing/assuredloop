import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { readLog } from './fixtures/trace-cli/helpers.mjs';
import { routingFixture, route, primaryModel } from './fixtures/issue37-routing/helpers.mjs';

function assertSatisfied(result, f, extraCount) {
  assert.equal(result.exit, 0, JSON.stringify(result.value.findings));
  const routing = route(result);
  assert.equal(routing.status, 'satisfied');
  assert.equal(routing.primary_tool, 'codex');
  assert.equal(routing.head, f.primary.head);
  assert.equal(routing.base_sha, f.primary.base_sha);
  assert.equal(routing.qualified.internal.length, 1);
  assert.equal(routing.qualified.external.length, extraCount);
  assert.equal(routing.qualified.internal[0].reviewer_model, primaryModel);
  assert.equal(routing.qualified.internal[0].review_tool, 'codex');
  assert.deepEqual(routing.qualified.internal[0].source, { repository: 'example/consumer', comment_id: 101 });
  return routing;
}

test('on-request routing accepts one independent primary review with the owner-selected model', async (t) => {
  const f = await routingFixture(t);
  const result = await f.run();
  const routing = assertSatisfied(result, f, 0);
  assert.equal(routing.additional, 'on-request');
  assert.match(JSON.stringify(routing.findings), /on-request|work-specific|handoff/i);
  assert.match(JSON.stringify(routing.findings), /semantic|manual|explicit/i,
    'arbitrary prose is not mechanically classified as an additional-review request');
});

test('required routing accepts same-tool same-model assessments in genuinely separate declared sessions', async (t) => {
  const f = await routingFixture(t, { additional: 'required', externalTool: 'codex' });
  assert.equal(f.primary.reviewer_model, f.external.reviewer_model);
  assert.notEqual(f.primary.reviewer_session, f.external.reviewer_session);
  const routing = assertSatisfied(await f.run(), f, 1);
  assert.equal(routing.additional, 'required');
  assert.deepEqual(routing.qualified.external[0].source, { repository: 'example/consumer', comment_id: 102 });
});

test('supported nonselected additional tool qualifies without local discovery installation or provider execution', async (t) => {
  const f = await routingFixture(t, { additional: 'required', externalTool: 'gemini' });
  f.external.reviewer_model = 'independently-declared-additional-model';
  await f.save();
  assert.deepEqual(f.config.repository.tools, ['codex']);
  await assert.rejects(access(path.join(f.root, '.gemini')));
  const routing = assertSatisfied(await f.run(), f, 1);
  assert.equal(routing.qualified.external[0].review_tool, 'gemini');
  await assert.rejects(access(path.join(f.root, '.gemini')));
  const commands = await readLog(f.ghLog);
  assert.ok(commands.every((args) => ['api', 'auth', '--version'].includes(args[0])));
  assert.ok(commands.filter((args) => args[0] === 'api').every((args) => args.includes('GET')),
    'review context reads do not dispatch providers or mutate GitHub');
});

test('inspect exposes required primary and additional obligations and their acquired source declarations', async (t) => {
  const f = await routingFixture(t, { additional: 'required', externalTool: 'codex' });
  const result = await f.run('inspect');
  const routing = assertSatisfied(result, f, 1);
  assert.equal(routing.additional, 'required');
  assert.ok(result.value.packet.entries.some((entry) => entry.ref?.comment_id === 102));
});

test('inspect exposes missing required additional review without calling another provider', async (t) => {
  const f = await routingFixture(t, { additional: 'required' });
  const result = await f.run('inspect');
  const routing = route(result);
  assert.equal(routing.status, 'incomplete');
  assert.equal(routing.qualified.internal.length, 1);
  assert.equal(routing.qualified.external.length, 0);
  assert.match(JSON.stringify(routing.findings), /additional.*(?:missing|required)|(?:missing|required).*additional/i);
});

test('legacy current reviews retain old meaning and explicitly report routing not configured', async (t) => {
  const f = await routingFixture(t, { legacy: true });
  const result = await f.run();
  assert.equal(result.exit, 0, JSON.stringify(result.value.findings));
  assert.equal(route(result).status, 'not-configured');
  assert.match(JSON.stringify(result.value.findings), /unresolved|not.configured/i);
});

test('historical review without declarations uses its actual old policy after the current policy gains routing', async (t) => {
  const f = await routingFixture(t, { legacy: true, historical: true });
  await f.upgradeOnlyCurrentPolicy();
  const result = await f.run();
  assert.equal(result.exit, 0, JSON.stringify(result.value.findings));
  assert.equal(result.value.policy.context.historical, true);
  assert.equal(result.value.policy.config.project.review.routing, undefined);
  assert.equal(route(result).status, 'not-configured');
});
