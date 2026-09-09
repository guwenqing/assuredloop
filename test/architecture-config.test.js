import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { validateRecord } from '../src/records.js';
import { planInitialization } from '../src/adoption.js';
import { execFile, makePackageFixture } from './fixtures/adoption/helpers.js';

const categories = ['request', 'epic', 'architecture-task', 'task', 'bug', 'spike'];
const defaultTypes = Object.fromEntries(categories.map((category) => [category, `type:${category}`]));
const customTypes = {
  request: 'Incoming idea',
  epic: 'Work collection',
  'architecture-task': 'Design & closeout',
  task: 'Implementation',
  bug: 'Repair',
  spike: 'Investigation',
};
const legacyDiscipline = {
  adopt: 'discipline:development', triage: 'discipline:architecture',
  plan: 'discipline:architecture', research: 'discipline:architecture',
  deliver: 'discipline:development', review: 'discipline:architecture',
  closeout: 'discipline:architecture',
};

function configWith(types = defaultTypes) {
  const config = JSON.parse(readFileSync(new URL('./fixtures/records/config-bootstrap-comment.json', import.meta.url), 'utf8'));
  config.repository.labels = { type: structuredClone(types) };
  return config;
}

function assertValid(config) {
  assert.deepEqual(validateRecord('config', config), { valid: true, errors: [] });
}

function assertInvalid(config) {
  const result = validateRecord('config', config);
  assert.equal(result.valid, false, 'invalid category configuration must be rejected');
  assert.ok(result.errors.length > 0, 'rejection must explain the configuration error');
  return result;
}

function assertMigrationGuidance(value) {
  const text = JSON.stringify(value);
  assert.match(text, /discipline/i, 'guidance identifies the removed field');
  assert.match(text, /remov|replac|migrat/i, 'guidance provides a correction action');
  assert.match(text, /architecture-task/i, 'guidance identifies the replacement category mapping');
}

test('all six default category mappings validate without discipline or mutation', () => {
  const config = configWith();
  const original = structuredClone(config);
  assertValid(config);
  assert.deepEqual(config, original);
});

test('all six category labels can be customized with mixed case and spaces', () => {
  assertValid(configWith(customTypes));
});

for (const category of categories) {
  test(`category mapping requires ${category} explicitly without supplying a default`, () => {
    const config = configWith();
    delete config.repository.labels.type[category];
    const original = structuredClone(config);
    assertInvalid(config);
    assert.deepEqual(config, original, 'validation must not fill in a missing mapping');
  });

  test(`category mapping rejects empty, whitespace and non-string ${category} values`, () => {
    for (const value of ['', '   ', '\t\n', null, 17]) {
      const config = configWith();
      config.repository.labels.type[category] = value;
      assertInvalid(config);
    }
  });
}

test('every pair of categories rejects exact and case-insensitive label collisions', async (t) => {
  for (let first = 0; first < categories.length; first += 1) {
    for (const second of categories.slice(first + 1)) {
      await t.test(`${categories[first]} and ${second}`, () => {
        for (const duplicate of ['Shared category', 'sHARED CATEGORY']) {
          const config = configWith(customTypes);
          config.repository.labels.type[categories[first]] = 'Shared category';
          config.repository.labels.type[second] = duplicate;
          assertInvalid(config);
        }
      });
    }
  }
});

test('category mapping rejects an unknown key instead of treating it as a category', () => {
  const config = configWith();
  config.repository.labels.type.architecture = 'Other architecture';
  assertInvalid(config);
});

test('legacy five-category discipline configuration is invalid with a migration correction', () => {
  const config = configWith();
  delete config.repository.labels.type['architecture-task'];
  config.repository.labels.discipline = structuredClone(legacyDiscipline);
  const original = structuredClone(config);
  assertMigrationGuidance(assertInvalid(config));
  assert.deepEqual(config, original);
});

test('discipline is rejected even with six valid mappings or an empty legacy object', () => {
  for (const discipline of [legacyDiscipline, {}]) {
    const config = configWith(customTypes);
    config.repository.labels.discipline = structuredClone(discipline);
    assertMigrationGuidance(assertInvalid(config));
  }
});

async function initializationScenario(t) {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-architecture-config-'));
  t.after(() => rm(targetRoot, { recursive: true, force: true }));
  await execFile('git', ['init', '-q', targetRoot]);
  await execFile('git', ['-C', targetRoot, 'remote', 'add', 'origin', 'https://github.com/example/consumer.git']);
  await mkdir(path.join(targetRoot, 'openspec'));
  await writeFile(path.join(targetRoot, 'openspec/config.yaml'), 'schema: spec-driven\n');
  const config = configWith(customTypes);
  config.repository.tools = ['gemini'];
  const packageFixture = await makePackageFixture({ sourceRef: config.project.workflow.source_ref });
  t.after(() => rm(packageFixture.root, { recursive: true, force: true }));
  config.project.workflow.name = packageFixture.metadata.name;
  config.project.workflow.version = packageFixture.metadata.version;
  return { targetRoot, config, packageRoot: packageFixture.root, localOnly: true };
}

test('initialization previews custom six-category configuration unchanged and remains read-only', async (t) => {
  const scenario = await initializationScenario(t);
  const original = structuredClone(scenario.config);
  const before = await readdir(scenario.targetRoot);
  const plan = await planInitialization(scenario);
  assert.equal(plan.status, 'preview');
  const configFile = plan.files.find((file) => file.path === '.assuredloop/config.json');
  assert.ok(configFile, 'initialization previews the bound consumer configuration');
  assert.deepEqual(JSON.parse(configFile.content), original);
  assert.deepEqual(scenario.config, original);
  assert.deepEqual(await readdir(scenario.targetRoot), before);
  assert.equal(await readFile(path.join(scenario.targetRoot, 'openspec/config.yaml'), 'utf8'), 'schema: spec-driven\n');
});

test('initialization rejects a legacy configuration with actionable guidance and no writes', async (t) => {
  const scenario = await initializationScenario(t);
  delete scenario.config.repository.labels.type['architecture-task'];
  scenario.config.repository.labels.discipline = structuredClone(legacyDiscipline);
  const original = structuredClone(scenario.config);
  const before = await readdir(scenario.targetRoot);
  await assert.rejects(planInitialization(scenario), (error) => {
    assert.equal(error.code, 'binding-invalid');
    assertMigrationGuidance({ message: error.message, details: error.details });
    return true;
  });
  assert.deepEqual(scenario.config, original);
  assert.deepEqual(await readdir(scenario.targetRoot), before);
});
