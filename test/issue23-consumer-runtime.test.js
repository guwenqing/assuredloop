import assert from 'node:assert/strict';
import test from 'node:test';
import { linkedConsumerFixture, fixedMarker, mutableMarker } from './fixtures/issue23-consumer/helpers.mjs';

function linkedNotice(result) {
  assert.equal(result.runtime?.mode, 'linked-development', JSON.stringify(result.findings));
  assert.equal(result.runtime?.toolkit_verification, 'not-performed');
  assert.equal((JSON.stringify(result).match(/"toolkit_verification"/g) || []).length, 1,
    'one operation observation, not a notice for every nested policy reconstruction');
}

for (const historical of [false, true]) {
  test(`linked CLI ${historical ? 'historical' : 'current PR'} check preserves consumer policy without toolkit contract/release verification`, async (t) => {
    const f = await linkedConsumerFixture(t, { historical });
    const result = await f.run();
    assert.equal(result.exit, 0, JSON.stringify(result.value.findings));
    assert.equal(result.value.status, 'pass');
    linkedNotice(result.value);
    assert.equal(result.value.policy.status, 'available');
    assert.deepEqual(result.value.policy.contract_package, f.config.project.workflow,
      'declared consumer package remains its historical/current policy value');
    assert.notEqual(result.value.policy.contract_package.version, '99.0.0');
    if (historical) assert.equal(result.value.policy.context.historical, true);
    const policySource = result.value.policy.sources.find((source) => source.role === 'project.bootstrap.policy_ref');
    assert.ok(policySource.content.includes(fixedMarker));
    assert.notEqual(policySource.acquisition, 'installed-contract');
  });
}

for (const work of ['example/consumer#43', 'example/consumer#1']) {
  test(`linked inspect propagates runtime through ${work.endsWith('#1') ? 'current default-branch' : 'PR'} policy loading`, async (t) => {
    const f = await linkedConsumerFixture(t);
    const result = await f.run('inspect', work);
    assert.equal(result.exit, 0, JSON.stringify(result.value.findings));
    assert.equal(result.value.status, 'pass');
    linkedNotice(result.value);
    assert.equal(result.value.policy.status, 'available');
    if (work.endsWith('#1')) assert.equal(result.value.context.current.comparison, 'current-policy-only');
    const policy = f.config.project.bootstrap.policy_ref;
    const entry = result.value.packet.entries.find((item) => item.ref?.revision === policy.revision && item.ref?.path === policy.path);
    assert.equal(entry?.disposition, 'inlined');
    assert.ok(entry.content.includes(fixedMarker), 'reviewer context contains the fixed applicable consumer policy');
  });
}

test('mutable linked contract bytes cannot shadow an existing permitted fixed policy source', async (t) => {
  const f = await linkedConsumerFixture(t, { toolkit: 'mutable-shadow' });
  const result = await f.run();
  assert.equal(result.exit, 0, JSON.stringify(result.value.findings));
  linkedNotice(result.value);
  const selected = result.value.policy.sources.find((item) => item.role === 'project.bootstrap.policy_ref');
  assert.ok(selected.content.includes(fixedMarker));
  assert.equal(selected.content.includes(mutableMarker), false);
  assert.notEqual(selected.acquisition, 'installed-contract');
});

test('ordinary installed bin shim and direct source keep toolkit verification behavior', async (t) => {
  for (const direct of [false, true]) {
    const f = await linkedConsumerFixture(t, { linked: direct, toolkit: 'missing-contracts' });
    const result = await f.run('check', 'example/consumer#43', direct);
    assert.notEqual(result.exit, 0, 'missing toolkit contracts still fails outside linked invocation');
    assert.notEqual(result.value.runtime?.mode, 'linked-development');
    assert.match(JSON.stringify(result.value.findings), /policy-unavailable|contract|ENOENT/);
  }
});

test('ordinary installed runtime with valid package assets retains successful consumer checks', async (t) => {
  const f = await linkedConsumerFixture(t, { linked: false, toolkit: 'regular' });
  const result = await f.run();
  assert.equal(result.exit, 0, JSON.stringify(result.value.findings));
  assert.notEqual(result.value.runtime?.mode, 'linked-development');
  assert.deepEqual(result.value.policy.contract_package, f.config.project.workflow);
});
