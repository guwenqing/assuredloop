import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { labelsFixture, names, repository, provisioning, mutations, sha256, git } from './fixtures/issue38-labels/helpers.mjs';

test('label plan previews ordered missing custom mappings with exact config binding and zero effects', async (t) => {
  const f = await labelsFixture(t);
  const ordinary = await f.plan({ provisionLabels: false });
  assert.equal(ordinary.label_provisioning, undefined);
  const plan = await f.plan();
  const labels = provisioning(plan);
  assert.equal(plan.status, 'preview');
  assert.equal(labels.repository, repository);
  assert.equal(labels.config_digest, sha256(plan.files.find((file) => file.path === '.assuredloop/config.json').content));
  assert.deepEqual(labels.operations.map((operation) => operation.name), names.slice(3, 5));
  for (const operation of labels.operations) {
    assert.deepEqual(Object.keys(operation).sort(), ['color', 'description', 'name']);
    assert.match(operation.color, /^[a-f\d]{6}$/i); assert.ok(operation.description.trim());
  }
  assert.deepEqual(provisioning(await f.plan()).operations, labels.operations, 'metadata and ordering are stable');
  assert.deepEqual((await f.state()).labels, f.initialLabels);
  assert.deepEqual(mutations(await f.log()), []);
  await assert.rejects(readFile(path.join(f.root, '.assuredloop/config.json')));
});

test('label apply creates only requested missing names with literal serialization and per-create readback', async (t) => {
  const f = await labelsFixture(t);
  const plan = await f.plan();
  const applied = await f.apply(plan);
  assert.equal(applied.status, 'applied');
  const state = await f.state();
  assert.deepEqual(state.labels.slice(0, f.initialLabels.length), f.initialLabels);
  assert.deepEqual(state.labels.slice(f.initialLabels.length).map((label) => label.name), names.slice(3, 5));
  const events = await f.log(), writes = mutations(events);
  assert.deepEqual(writes.map((entry) => entry.body.name), names.slice(3, 5));
  assert.ok(writes.every((entry) => entry.method === 'POST' && entry.endpoint === `repos/${repository}/labels`));
  for (const [index, creation] of writes.entries()) {
    assert.deepEqual(creation.body, provisioning(plan).operations[index]);
    const at = events.indexOf(creation), next = writes[index + 1] ? events.indexOf(writes[index + 1]) : events.length;
    assert.ok(events.slice(at + 1, next).some((entry) => entry.method === 'GET' && entry.observed?.includes(creation.body.name)),
      'each creation is read back before the next create or complete-init claim');
  }
  assert.deepEqual(provisioning(applied).effects.map(({ name, status }) => ({ name, status })), names.slice(3, 5).map((name) => ({ name, status: 'created' })));
  assert.deepEqual(provisioning(applied).remaining, []);
});

test('local-only label provisioning is rejected before any remote access', async (t) => {
  const f = await labelsFixture(t);
  await assert.rejects(f.plan({ localOnly: true }));
  assert.deepEqual(await f.log(), []);
});

for (const change of ['operations', 'config-bytes', 'origin', 'native-owner', 'local-conflict', 'package-identity', 'skill-source']) {
  test(`label apply rejects changed ${change} before writes`, async (t) => {
    const f = await labelsFixture(t); const plan = await f.plan();
    if (change === 'operations') {
      plan.label_provisioning ??= { operations: [] };
      plan.label_provisioning.operations.push({ name: 'unrequested', color: 'abcdef', description: 'tamper' });
    }
    if (change === 'config-bytes') plan.files.find((file) => file.path === '.assuredloop/config.json').content += ' ';
    if (change === 'origin') await git(f.root, ['remote', 'set-url', 'origin', 'https://github.com/example/other.git']);
    if (change === 'native-owner') {
      const marker = path.join(f.root, '.agents/skills/.openspec-target'); await mkdir(path.dirname(marker), { recursive: true }); await writeFile(marker, 'other-tool\n');
    }
    if (change === 'local-conflict') {
      const config = path.join(f.root, '.assuredloop/config.json'); await mkdir(path.dirname(config), { recursive: true }); await writeFile(config, '{"owner":"changed"}\n');
    }
    if (change === 'package-identity') {
      const file = path.join(f.packageRoot, 'package.json'); const pkg = JSON.parse(await readFile(file, 'utf8')); pkg.name = 'different-selected-package'; await writeFile(file, JSON.stringify(pkg));
    }
    if (change === 'skill-source') await writeFile(path.join(f.packageRoot, 'skills/assuredloop-adopt/SKILL.md'), '# Changed after preview\n');
    await assert.rejects(f.apply(plan));
    assert.deepEqual(mutations(await f.log()), []);
    assert.deepEqual((await f.state()).labels, f.initialLabels);
  });
}

for (const change of ['permissions', 'repository']) {
  test(`label apply rechecks remote ${change} before the first write`, async (t) => {
    const f = await labelsFixture(t); const plan = await f.plan();
    await f.change((state) => { if (change === 'permissions') state.canWrite = false; else state.remoteName = 'example/renamed'; });
    await assert.rejects(f.apply(plan));
    assert.deepEqual(mutations(await f.log()), []);
    assert.deepEqual((await f.state()).labels, f.initialLabels);
  });
}

test('fresh inventory skips a mapped label that appeared after preview and preserves its metadata', async (t) => {
  const f = await labelsFixture(t); const plan = await f.plan();
  const appeared = { id: 700, name: names[3].toUpperCase(), color: '654321', description: 'Concurrent owner metadata' };
  await f.change((state) => { state.appearNextInventory = appeared; });
  const result = await f.apply(plan);
  assert.equal(result.status, 'applied');
  assert.deepEqual(mutations(await f.log()).map((entry) => entry.body.name), [names[4]]);
  assert.deepEqual((await f.state()).labels.find((label) => label.id === 700), appeared);
  assert.deepEqual(provisioning(result).effects.map((entry) => entry.status), ['skipped', 'created']);
});

test('create race is skipped only after a read confirms the existing label', async (t) => {
  const f = await labelsFixture(t); const plan = await f.plan();
  await f.change((state) => { state.raceName = names[3]; });
  const result = await f.apply(plan);
  assert.equal(result.status, 'applied');
  assert.deepEqual(provisioning(result).effects.map((entry) => entry.status), ['skipped', 'created']);
  const state = await f.state();
  assert.equal(state.labels.find((label) => label.name === names[3]).description, 'Created concurrently; preserve this metadata');
  const events = await f.log(), race = events.findIndex((entry) => entry.race);
  const nextCreate = events.findIndex((entry, index) => index > race && entry.method === 'POST');
  assert.ok(events.slice(race + 1, nextCreate).some((entry) => entry.method === 'GET' && entry.observed?.includes(names[3])));
});

test('partial create failure reports confirmed effects and remaining work then new preview retries only remaining labels', async (t) => {
  const f = await labelsFixture(t); const plan = await f.plan();
  await f.change((state) => { state.failName = names[4]; });
  const result = await f.apply(plan);
  assert.equal(result.status, 'partial');
  assert.deepEqual(provisioning(result).effects.map((entry) => entry.status), ['created', 'failed']);
  assert.deepEqual(provisioning(result).remaining.map((entry) => entry.name), [names[4]]);
  assert.deepEqual((await f.state()).labels.slice(0, f.initialLabels.length), f.initialLabels);
  await f.change((state) => { delete state.failName; });
  const retry = await f.plan();
  assert.deepEqual(provisioning(retry).operations.map((entry) => entry.name), [names[4]]);
  assert.equal((await f.apply(retry)).status, 'applied');
  assert.deepEqual(mutations(await f.log()).map((entry) => entry.body.name), [names[3], names[4], names[4]]);
  assert.ok(mutations(await f.log()).every((entry) => entry.method === 'POST'));
});

test('successful create with unavailable readback remains unverified and does not claim complete initialization', async (t) => {
  const f = await labelsFixture(t); const plan = await f.plan();
  await f.change((state) => { state.readbackDenied = true; });
  const result = await f.apply(plan);
  assert.equal(result.status, 'partial');
  assert.equal(provisioning(result).effects[0].status, 'unverified');
  assert.deepEqual(provisioning(result).remaining.map((entry) => entry.name), names.slice(3, 5));
  assert.equal((await f.state()).successfulCreates, 1);
  assert.equal(mutations(await f.log()).length, 1);
});
