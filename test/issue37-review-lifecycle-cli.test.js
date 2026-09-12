import assert from 'node:assert/strict';
import test from 'node:test';
import { lifecycleCliFixture, applicability, priorSource, dispositionSource, dispositionText } from './fixtures/issue37-routing/lifecycle-cli.mjs';
import { readLog } from './fixtures/trace-cli/helpers.mjs';

function retainedPrior(result, f) {
  const prior = applicability(result, priorSource);
  assert.equal(prior.pr, f.old.pr);
  assert.equal(prior.applicability, 'noncurrent');
  assert.match(JSON.stringify(prior.findings), /head|tuple|assessment/i, 'the exclusion reason remains visible');
  assert.match(JSON.stringify(prior.findings), /not|does not/i);
  assert.match(JSON.stringify(prior.findings), /resolv|accept|supersed/i,
    'excluding an old tuple must not claim that its findings were resolved');
  return prior;
}

for (const legacy of [false, true]) {
  test(`linked lifecycle retains old REVISE beside current PASS and disposition under ${legacy ? 'legacy' : 'routed'} policy`, async (t) => {
    const f = await lifecycleCliFixture(t, { legacy });
    const result = await f.run();
    assert.equal(result.exit, 0, JSON.stringify(result.value.findings));
    assert.equal(result.value.runtime.mode, 'linked-development');
    retainedPrior(result, f);
    assert.deepEqual(result.value.context.evidence.find((entry) => entry.source.comment_id === 301).record, f.old);
    assert.equal(applicability(result, { repository: 'example/consumer', comment_id: 101 }).applicability, 'current');
    assert.deepEqual(f.primary.evidence.slice(-2), [priorSource, dispositionSource]);
  });
}

for (const verdict of ['revise', 'pass']) {
  test(`linked lifecycle old ${verdict.toUpperCase()} alone cannot qualify the actual current candidate`, async (t) => {
    const f = await lifecycleCliFixture(t, { legacy: true });
    f.old.result = verdict; f.reviews.length = 0; await f.save();
    const result = await f.run();
    assert.notEqual(result.exit, 0);
    retainedPrior(result, f);
    assert.equal(result.value.review_evidence.some((entry) => entry.applicability === 'current'), false);
  });
}

for (const field of ['base_sha', 'policy_ref']) {
  test(`linked lifecycle matching head with mismatched ${field} still has no qualifying current review`, async (t) => {
    const f = await lifecycleCliFixture(t);
    if (field === 'base_sha') f.primary.base_sha = f.initialRevision;
    else delete f.primary.policy_ref.anchor;
    await f.save();
    const result = await f.run();
    assert.notEqual(result.exit, 0);
    assert.equal(result.value.review_routing.find((entry) => entry.pr === f.primary.pr).status, 'incomplete');
    assert.equal(applicability(result, { repository: 'example/consumer', comment_id: 101 }).applicability, 'noncurrent');
  });
}

test('linked lifecycle required routing accepts the fresh distinct-session pair while retaining old REVISE', async (t) => {
  const f = await lifecycleCliFixture(t, { additional: 'required', externalTool: 'codex' });
  const result = await f.run();
  assert.equal(result.exit, 0, JSON.stringify(result.value.findings));
  const route = result.value.review_routing.find((entry) => entry.pr === f.primary.pr);
  assert.equal(route.status, 'satisfied');
  assert.deepEqual(route.qualified.internal.map((entry) => entry.source.comment_id), [101]);
  assert.deepEqual(route.qualified.external.map((entry) => entry.source.comment_id), [102]);
  retainedPrior(result, f);
});

test('linked lifecycle old passing external review cannot fill missing current additional review', async (t) => {
  const f = await lifecycleCliFixture(t, { additional: 'required' });
  Object.assign(f.old, { result: 'pass', review_kind: 'external' }); await f.save();
  const result = await f.run();
  assert.notEqual(result.exit, 0);
  const route = result.value.review_routing.find((entry) => entry.pr === f.primary.pr);
  assert.equal(route.status, 'incomplete');
  assert.equal(route.qualified.internal.length, 1);
  assert.equal(route.qualified.external.length, 0);
  retainedPrior(result, f);
});

test('linked lifecycle fresh primary and additional still need distinct reviewer sessions', async (t) => {
  const f = await lifecycleCliFixture(t, { additional: 'required', externalTool: 'codex' });
  f.external.reviewer_session = f.primary.reviewer_session; await f.save();
  const result = await f.run();
  assert.notEqual(result.exit, 0);
  assert.equal(result.value.review_routing.find((entry) => entry.pr === f.primary.pr).status, 'incomplete');
});

for (const guard of ['malformed-mixed', 'wrong-pr', 'unavailable-source']) {
  test(`linked lifecycle ${guard} cannot hide behind retained noncurrent context`, async (t) => {
    const f = await lifecycleCliFixture(t);
    if (guard === 'malformed-mixed') f.old.record_type = 'initial-bootstrap-verification';
    if (guard === 'wrong-pr') f.old.pr = 'example/consumer#999';
    if (guard === 'unavailable-source') f.old.evidence.push({ repository: 'example/consumer', comment_id: 9999 });
    await f.save();
    const result = await f.run();
    assert.notEqual(result.exit, 0);
    assert.match(JSON.stringify(result.value.findings), guard === 'malformed-mixed' ? /schema|invalid/i
      : guard === 'wrong-pr' ? /mismatch|unavailable|invalid/i : /unavailable|not-found|record-unavailable/i);
  });
}

test('linked lifecycle inspect preserves original REVISE tuple and disposition without declaring it resolved', async (t) => {
  const f = await lifecycleCliFixture(t);
  const result = await f.run('inspect');
  assert.equal(result.exit, 0, JSON.stringify(result.value.findings));
  retainedPrior(result, f);
  const prior = result.value.packet.entries.find((entry) => entry.ref?.comment_id === 301);
  assert.ok(prior, 'original comment stays in the acquired source inventory');
  assert.match(prior.content, /"result": "revise"/);
  assert.ok(prior.content.includes(f.old.head));
  assert.ok(prior.content.includes(f.old.base_sha));
  const disposition = result.value.packet.entries.find((entry) => entry.ref?.comment_id === 302);
  assert.equal(disposition.content, dispositionText);
  const fresh = result.value.packet.entries.find((entry) => entry.ref?.comment_id === 101);
  assert.match(fresh.content, /"comment_id": 301/);
  assert.match(fresh.content, /"comment_id": 302/);
  const commands = await readLog(f.ghLog);
  assert.ok(commands.every((args) => ['api', 'auth', '--version'].includes(args[0])));
  assert.ok(commands.filter((args) => args[0] === 'api').every((args) => args.includes('GET')));
});
