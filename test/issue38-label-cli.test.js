import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { labelsFixture, names, provisioning, mutations } from './fixtures/issue38-labels/helpers.mjs';

for (const apply of [false, true]) {
  test(`actual npm-linked default init ${apply ? 'apply' : 'preview'} never creates remote labels`, async (t) => {
    const f = await labelsFixture(t, { cli: true });
    const result = await f.run(apply ? ['--apply'] : []);
    assert.equal(result.exit, 0, result.stdout);
    assert.equal(result.value.status, apply ? 'applied' : 'preview');
    assert.equal(result.value.runtime.mode, 'linked-development');
    assert.deepEqual(mutations(await f.log()), []);
    assert.deepEqual((await f.state()).labels, f.initialLabels);
    assert.ok(result.value.diagnostics.some((entry) => entry.code === 'labels-missing'));
  });
}

test('actual npm-linked provisioning defaults to an explicit zero-write preview', async (t) => {
  const f = await labelsFixture(t, { cli: true }); const result = await f.run(['--provision-labels']);
  assert.equal(result.exit, 0, result.stdout); assert.equal(result.value.status, 'preview');
  assert.deepEqual(provisioning(result.value).operations.map((entry) => entry.name), names.slice(3, 5));
  assert.deepEqual(mutations(await f.log()), []);
  await assert.rejects(readFile(path.join(f.root, '.assuredloop/config.json')));
});

test('actual npm-linked explicit apply creates only mapped labels and verifies configuration output', async (t) => {
  const f = await labelsFixture(t, { cli: true }); const result = await f.run(['--provision-labels', '--apply']);
  assert.equal(result.exit, 0, result.stdout); assert.equal(result.value.status, 'applied');
  assert.deepEqual(mutations(await f.log()).map((entry) => entry.body.name), names.slice(3, 5));
  assert.deepEqual(JSON.parse(await readFile(path.join(f.root, '.assuredloop/config.json'), 'utf8')), f.config);
  assert.deepEqual(provisioning(result.value).remaining, []);
});

test('actual npm-linked partial provisioning returns exit1 with actual effects and remaining work', async (t) => {
  const f = await labelsFixture(t, { cli: true }); await f.change((state) => { state.failName = names[4]; });
  const result = await f.run(['--provision-labels', '--apply']);
  assert.equal(result.exit, 1); assert.equal(result.value.status, 'partial', result.stdout);
  assert.deepEqual(provisioning(result.value).effects.map((entry) => entry.status), ['created', 'failed']);
  assert.deepEqual(provisioning(result.value).remaining.map((entry) => entry.name), [names[4]]);
  assert.equal((await f.state()).successfulCreates, 1);
});

test('actual npm-linked local-only provisioning is rejected before remote activity', async (t) => {
  const f = await labelsFixture(t, { cli: true }); const result = await f.run(['--provision-labels', '--local-only', '--apply']);
  assert.equal(result.exit, 1); assert.notEqual(result.value.status, 'applied');
  assert.match(JSON.stringify(result.value), /local.only/i);
  assert.deepEqual(await f.log(), []);
});
