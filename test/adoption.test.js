import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { applyInitialization, planInitialization } from '../src/adoption.js';
import {
  execFile,
  git,
  makeGitFixture,
  makePackageFixture,
  makeConfig,
  readJson,
  writeJson,
} from './fixtures/adoption/helpers.js';

const execFileDirect = promisify(execFileCallback);
const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname);
const cliPath = path.join(repositoryRoot, 'src', 'cli.js');

async function makeScenario(t, { tools = ['gemini'], repository = 'example/adoption-consumer' } = {}) {
  const source = await makeGitFixture({
    prefix: 'assuredloop-source-',
    files: {
      'openspec/specs/project-workflow/spec.md': '# Framework workflow\n',
      'openspec/specs/review-and-validation/spec.md': '# Review contract\n',
    },
  });
  const packageFixture = await makePackageFixture({
    sourceRef: {
      repository: 'framework/source',
      revision: source.revision,
      path: 'openspec/specs',
    },
    contractFiles: {
      'project-workflow/spec.md': '# Framework workflow\n',
      'review-and-validation/spec.md': '# Review contract\n',
    },
    skillText: '# AssuredLoop adoption\nUse explicit target bindings.\n',
  });
  const target = await makeGitFixture({
    prefix: 'assuredloop-consumer-',
    remote: `https://github.com/${repository}.git`,
    files: {
      'README.md': '# Consumer fixture\n',
      'openspec/config.yaml': 'schema: spec-driven\n',
      'openspec/specs/product/spec.md': '# Consumer product requirements\n',
    },
  });
  const config = makeConfig(packageFixture.metadata, { tools, repository });
  t.after(async () => {
    await Promise.all([
      rm(source.root, { recursive: true, force: true }),
      rm(packageFixture.root, { recursive: true, force: true }),
      rm(target.root, { recursive: true, force: true }),
    ]);
  });
  return { source, packageFixture, target, config };
}

async function expectCode(operation, code) {
  await assert.rejects(operation, (error) => {
    assert.equal(error?.code, code);
    return true;
  });
}

function plannedFile(plan, relativePath) {
  const file = plan.files.find((candidate) => candidate.path === relativePath);
  assert.ok(file, `expected planned file ${relativePath}`);
  return file;
}

test('planInitialization previews explicit target artifacts without writing', async (t) => {
  const { packageFixture, target, config } = await makeScenario(t);
  const plan = await planInitialization({
    targetRoot: target.root,
    config,
    packageRoot: packageFixture.root,
    localOnly: true,
  });

  assert.equal(plan.status, 'preview');
  assert.equal(plan.targetRoot, target.root);
  assert.ok(Array.isArray(plan.diagnostics));
  assert.ok(plan.diagnostics.some((diagnostic) => /github/i.test(JSON.stringify(diagnostic)) && /skip|local/i.test(JSON.stringify(diagnostic))));
  assert.ok(plan.files.length >= 2);
  for (const file of plan.files) {
    assert.match(file.path, /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.\.\/(?:|$))/);
    assert.ok(['create', 'unchanged'].includes(file.action));
    assert.equal(typeof file.content, 'string');
  }

  const configFile = plannedFile(plan, '.assuredloop/config.json');
  assert.deepEqual(JSON.parse(configFile.content), config);
  const skillFile = plannedFile(plan, '.gemini/skills/assuredloop-adopt/SKILL.md');
  assert.equal(skillFile.content, await readFile(path.join(packageFixture.root, 'skills/assuredloop-adopt/SKILL.md'), 'utf8'));
  assert.equal(plan.files.some((file) => file.path.endsWith('.openspec-target')), false);
  assert.equal(plan.files.some((file) => file.path.startsWith('openspec/specs/')), false);

  await assert.rejects(readFile(path.join(target.root, '.assuredloop/config.json')));
  await assert.rejects(readFile(path.join(target.root, '.gemini/skills/assuredloop-adopt/SKILL.md')));
});

test('applyInitialization is idempotent and preserves unrelated consumer files', async (t) => {
  const { packageFixture, target, config } = await makeScenario(t);
  const keepPath = path.join(target.root, '.gemini/skills/consumer-owned/SKILL.md');
  await mkdir(path.dirname(keepPath), { recursive: true });
  await writeFile(keepPath, '# Consumer-owned skill\n');
  const plan = await planInitialization({ targetRoot: target.root, config, packageRoot: packageFixture.root, localOnly: true });
  const applied = await applyInitialization(plan);
  assert.equal(applied.status, 'applied');
  assert.equal(await readFile(keepPath, 'utf8'), '# Consumer-owned skill\n');
  assert.deepEqual(await readJson(path.join(target.root, '.assuredloop/config.json')), config);

  const repeat = await planInitialization({ targetRoot: target.root, config, packageRoot: packageFixture.root, localOnly: true });
  assert.ok(repeat.files.length > 0);
  assert.ok(repeat.files.every((file) => file.action === 'unchanged'));
  const reapplied = await applyInitialization(repeat);
  assert.equal(reapplied.status, 'applied');
  assert.equal(await readFile(keepPath, 'utf8'), '# Consumer-owned skill\n');
  assert.deepEqual(await readJson(path.join(target.root, '.assuredloop/config.json')), config);
});

test('conflicting managed content stops initialization before any write', async (t) => {
  const { packageFixture, target, config } = await makeScenario(t);
  const configPath = path.join(target.root, '.assuredloop/config.json');
  await writeJson(configPath, { schema_version: 1, consumer: 'different' });
  await expectCode(
    () => planInitialization({ targetRoot: target.root, config, packageRoot: packageFixture.root, localOnly: true }),
    'file-conflict',
  );
  await assert.rejects(readFile(path.join(target.root, '.gemini/skills/assuredloop-adopt/SKILL.md')));
  assert.deepEqual(await readJson(configPath), { schema_version: 1, consumer: 'different' });
});

test('invalid bindings and package version mismatches fail explicitly', async (t) => {
  const { packageFixture, target, config } = await makeScenario(t);
  const missingRepository = structuredClone(config);
  delete missingRepository.repository.name;
  await expectCode(
    () => planInitialization({ targetRoot: target.root, config: missingRepository, packageRoot: packageFixture.root, localOnly: true }),
    'binding-invalid',
  );

  const unsafePath = structuredClone(config);
  unsafePath.repository.openspec_root = '../outside';
  await expectCode(
    () => planInitialization({ targetRoot: target.root, config: unsafePath, packageRoot: packageFixture.root, localOnly: true }),
    'path-unsafe',
  );

  const wrongVersion = structuredClone(config);
  wrongVersion.project.workflow.version = '9.9.9';
  await expectCode(
    () => planInitialization({ targetRoot: target.root, config: wrongVersion, packageRoot: packageFixture.root, localOnly: true }),
    'version-mismatch',
  );
});

test('target repository identity must match the explicit repository binding', async (t) => {
  const { packageFixture, target, config } = await makeScenario(t);
  await git(target.root, ['remote', 'set-url', 'origin', 'https://github.com/example/different-consumer.git']);
  await expectCode(
    () => planInitialization({ targetRoot: target.root, config, packageRoot: packageFixture.root, localOnly: true }),
    'binding-invalid',
  );
});

test('unsupported native tools and incompatible shared roots stop safely', async (t) => {
  const unsupported = await makeScenario(t, { tools: ['not-a-native-tool'] });
  await expectCode(
    () => planInitialization({ targetRoot: unsupported.target.root, config: unsupported.config, packageRoot: unsupported.packageFixture.root, localOnly: true }),
    'compatibility-error',
  );

  const shared = await makeScenario(t, { tools: ['codex'] });
  const markerPath = path.join(shared.target.root, '.agents/skills/.openspec-target');
  await mkdir(path.dirname(markerPath), { recursive: true });
  await writeFile(markerPath, 'agents\n');
  await expectCode(
    () => planInitialization({ targetRoot: shared.target.root, config: shared.config, packageRoot: shared.packageFixture.root, localOnly: true }),
    'compatibility-error',
  );
  assert.equal(await readFile(markerPath, 'utf8'), 'agents\n');
});

test('selected shared native root preserves the upstream ownership marker', async (t) => {
  const { packageFixture, target, config } = await makeScenario(t, { tools: ['codex'] });
  const markerPath = path.join(target.root, '.agents/skills/.openspec-target');
  await mkdir(path.dirname(markerPath), { recursive: true });
  await writeFile(markerPath, 'codex\n');
  const plan = await planInitialization({ targetRoot: target.root, config, packageRoot: packageFixture.root, localOnly: true });
  assert.equal(plan.files.some((file) => file.path === '.agents/skills/.openspec-target'), false);
  assert.ok(plan.files.some((file) => file.path === '.agents/skills/assuredloop-adopt/SKILL.md'));
  await applyInitialization(plan);
  assert.equal(await readFile(markerPath, 'utf8'), 'codex\n');
});

test('initialization rejects a managed path that escapes through a symlink', async (t) => {
  const { packageFixture, target, config } = await makeScenario(t);
  const outside = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-outside-'));
  const skillPath = path.join(target.root, '.gemini/skills/assuredloop-adopt');
  await mkdir(path.dirname(skillPath), { recursive: true });
  await symlink(outside, skillPath);
  t.after(() => rm(outside, { recursive: true, force: true }));
  await expectCode(
    () => planInitialization({ targetRoot: target.root, config, packageRoot: packageFixture.root, localOnly: true }),
    'path-unsafe',
  );
  assert.equal(await readlink(skillPath), outside);
});

test('applyInitialization rejects a plan object that was not produced by planning', async () => {
  await expectCode(
    () => applyInitialization({
      status: 'preview',
      targetRoot: '/tmp/untrusted-target',
      files: [],
      diagnostics: [],
    }),
    'binding-invalid',
  );
});

test('CLI local-only init emits JSON and does not require gh', async (t) => {
  const { target } = await makeScenario(t);
  const packageMetadata = await readJson(path.join(repositoryRoot, 'contracts/metadata.json'));
  const config = makeConfig(packageMetadata, {
    repository: 'example/adoption-consumer',
    tools: ['gemini'],
  });
  const configPath = path.join(await mkdtemp(path.join(os.tmpdir(), 'assuredloop-config-')), 'config.json');
  t.after(() => rm(path.dirname(configPath), { recursive: true, force: true }));
  await writeJson(configPath, config);
  const pathWithoutGh = `${path.join(repositoryRoot, 'node_modules', '.bin')}:/usr/bin:/bin`;
  const env = { ...process.env, PATH: pathWithoutGh };

  const preview = await execFileDirect(process.execPath, [cliPath, 'init', '--target', target.root, '--config', configPath, '--local-only'], { env });
  const previewOutput = JSON.parse(preview.stdout);
  assert.equal(previewOutput.status, 'preview');
  assert.ok(previewOutput.files.some((file) => file.path === '.assuredloop/config.json'));
  assert.ok(previewOutput.diagnostics.some((diagnostic) => /github/i.test(JSON.stringify(diagnostic)) && /skip|local/i.test(JSON.stringify(diagnostic))));
  await assert.rejects(readFile(path.join(target.root, '.assuredloop/config.json')));

  const applied = await execFileDirect(process.execPath, [cliPath, 'init', '--target', target.root, '--config', configPath, '--local-only', '--apply'], { env });
  const appliedOutput = JSON.parse(applied.stdout);
  assert.equal(appliedOutput.status, 'applied');
  assert.deepEqual(await readJson(path.join(target.root, '.assuredloop/config.json')), config);
  const { stdout: remote } = await execFile('git', ['remote', 'get-url', 'origin'], { cwd: target.root });
  assert.equal(remote.trim(), 'https://github.com/example/adoption-consumer.git');
});

test('initialization honors a custom OpenSpec root and category label mapping', async (t) => {
  const { packageFixture, target, config } = await makeScenario(t);
  const customRoot = path.join(target.root, 'specification');
  await mkdir(customRoot, { recursive: true });
  await writeFile(path.join(customRoot, 'config.yaml'), 'schema: spec-driven\n');
  config.repository.openspec_root = 'specification';
  config.repository.labels.type = {
    request: 'work-request',
    epic: 'work-epic',
    'architecture-task': 'work-architecture-task',
    task: 'work-task',
    bug: 'work-bug',
    spike: 'work-spike',
  };
  const plan = await planInitialization({
    targetRoot: target.root,
    config,
    packageRoot: packageFixture.root,
    localOnly: true,
  });
  const applied = await applyInitialization(plan);
  assert.equal(applied.status, 'applied');
  assert.deepEqual(await readJson(path.join(target.root, '.assuredloop/config.json')), config);
  assert.equal(await readFile(path.join(customRoot, 'config.yaml'), 'utf8'), 'schema: spec-driven\n');
});

test('rendered adoption guidance resolves installation bindings and preserves marked later-work tokens', async (t) => {
  const { packageFixture, target, config } = await makeScenario(t);
  await writeFile(path.join(packageFixture.root, 'skills/assuredloop-adopt/SKILL.md'), [
    '# Adoption example',
    'repository={{repository}}',
    'openspec_root={{openspec_root}}',
    'package_name={{package_name}}',
    'package_version={{package_version}}',
    '<!-- assuredloop:template:start -->',
    'Reusable example, not completed target data',
    '{"repository":"{{repository}}","openspec_root":"{{openspec_root}}","package":"{{package_name}}@{{package_version}}","change":"{{change}}"}',
    '<!-- assuredloop:template:end -->',
  ].join('\n') + '\n');
  const plan = await planInitialization({ targetRoot: target.root, config, packageRoot: packageFixture.root, localOnly: true });
  const skill = plannedFile(plan, '.gemini/skills/assuredloop-adopt/SKILL.md').content;
  assert.match(skill, /repository=example\/adoption-consumer/);
  assert.match(skill, /openspec_root=openspec/);
  assert.match(skill, /package_name=assuredloop-base/);
  assert.match(skill, /package_version=0\.1\.0/);
  assert.match(skill, /Reusable example, not completed target data/);
  assert.match(skill, /\{"repository":"example\/adoption-consumer","openspec_root":"openspec","package":"assuredloop-base@0\.1\.0","change":"\{\{change\}\}"\}/);
  for (const known of ['{{repository}}', '{{openspec_root}}', '{{package_name}}', '{{package_version}}']) {
    assert.equal(skill.includes(known), false, `known installation token remains: ${known}`);
  }
});

test('unknown or misspelled tokens outside a marked reusable example are rejected', async (t) => {
  const { packageFixture, target, config } = await makeScenario(t);
  await writeFile(path.join(packageFixture.root, 'skills/assuredloop-adopt/SKILL.md'), 'outside={{chang}}\n');
  await expectCode(
    () => planInitialization({ targetRoot: target.root, config, packageRoot: packageFixture.root, localOnly: true }),
    'binding-invalid',
  );
});

test('inherited binding keys are rejected outside reusable examples', async (t) => {
  for (const token of ['constructor', '__proto__']) {
    const { packageFixture, target, config } = await makeScenario(t);
    await writeFile(path.join(packageFixture.root, 'skills/assuredloop-adopt/SKILL.md'), `outside={{${token}}}\n`);
    await expectCode(
      () => planInitialization({ targetRoot: target.root, config, packageRoot: packageFixture.root, localOnly: true }),
      'binding-invalid',
    );
  }
});

test('inherited binding keys remain literal inside reusable examples', async (t) => {
  const { packageFixture, target, config } = await makeScenario(t);
  await writeFile(path.join(packageFixture.root, 'skills/assuredloop-adopt/SKILL.md'), [
    '<!-- assuredloop:template:start -->',
    'Reusable example, not completed target data',
    '{"constructor":"{{constructor}}","__proto__":"{{__proto__}}","change":"{{change}}"}',
    '<!-- assuredloop:template:end -->',
  ].join('\n') + '\n');
  const plan = await planInitialization({ targetRoot: target.root, config, packageRoot: packageFixture.root, localOnly: true });
  const skill = plannedFile(plan, '.gemini/skills/assuredloop-adopt/SKILL.md').content;
  assert.match(skill, /\{"constructor":"\{\{constructor\}\}","__proto__":"\{\{__proto__\}\}","change":"\{\{change\}\}"\}/);
});

test('template regions reject unbalanced and nested markers', async (t) => {
  const cases = [
    '<!-- assuredloop:template:start -->\nReusable example, not completed target data\n',
    '<!-- assuredloop:template:end -->\nReusable example, not completed target data\n',
    '<!-- assuredloop:template:start -->\n<!-- assuredloop:template:start -->\nReusable example, not completed target data\n<!-- assuredloop:template:end -->\n',
  ];
  for (const skillText of cases) {
    const { packageFixture, target, config } = await makeScenario(t);
    await writeFile(path.join(packageFixture.root, 'skills/assuredloop-adopt/SKILL.md'), skillText);
    await expectCode(
      () => planInitialization({ targetRoot: target.root, config, packageRoot: packageFixture.root, localOnly: true }),
      'binding-invalid',
    );
  }
});

test('template markers never exempt placeholders in target configuration', async (t) => {
  const markerConfig = await makeScenario(t);
  markerConfig.config.project.extensions = {
    'example:note': '<!-- assuredloop:template:start --> {{change}} <!-- assuredloop:template:end -->',
  };
  await expectCode(
    () => planInitialization({
      targetRoot: markerConfig.target.root,
      config: markerConfig.config,
      packageRoot: markerConfig.packageFixture.root,
      localOnly: true,
    }),
    'binding-invalid',
  );

  const requiredBinding = await makeScenario(t);
  requiredBinding.config.repository.name = '{{repository}}';
  await expectCode(
    () => planInitialization({
      targetRoot: requiredBinding.target.root,
      config: requiredBinding.config,
      packageRoot: requiredBinding.packageFixture.root,
      localOnly: true,
    }),
    'binding-invalid',
  );
});

test('binding data cannot manufacture a template start marker', async (t) => {
  const { packageFixture, target, config } = await makeScenario(t);
  const markerRoot = '<!-- assuredloop:template:start -->';
  const contextRoot = path.join(target.root, markerRoot);
  await mkdir(contextRoot, { recursive: true });
  await writeFile(path.join(contextRoot, 'config.yaml'), 'schema: spec-driven\n');
  config.repository.openspec_root = markerRoot;
  await writeFile(path.join(packageFixture.root, 'skills/assuredloop-adopt/SKILL.md'), [
    '# Guidance',
    '{{openspec_root}}',
    'Unknown={{misspelled_binding}}',
    '<!-- assuredloop:template:end -->',
  ].join('\n') + '\n');
  await expectCode(
    () => planInitialization({ targetRoot: target.root, config, packageRoot: packageFixture.root, localOnly: true }),
    'binding-invalid',
  );
});

test('binding data cannot close a source-declared template region', async (t) => {
  const { packageFixture, target, config } = await makeScenario(t);
  const markerRoot = '<!-- assuredloop:template:end -->';
  const contextRoot = path.join(target.root, markerRoot);
  await mkdir(contextRoot, { recursive: true });
  await writeFile(path.join(contextRoot, 'config.yaml'), 'schema: spec-driven\n');
  config.repository.openspec_root = markerRoot;
  await writeFile(path.join(packageFixture.root, 'skills/assuredloop-adopt/SKILL.md'), [
    '<!-- assuredloop:template:start -->',
    '{{openspec_root}}',
    '{"change":"{{change}}"}',
    '<!-- assuredloop:template:end -->',
  ].join('\n') + '\n');
  const plan = await planInitialization({ targetRoot: target.root, config, packageRoot: packageFixture.root, localOnly: true });
  const skill = plannedFile(plan, '.gemini/skills/assuredloop-adopt/SKILL.md').content;
  assert.equal(skill.split('<!-- assuredloop:template:end -->').length - 1, 2);
  assert.match(skill, /\{"change":"\{\{change\}\}"\}/);
});

test('template rendering preserves CRLF delimiters while resolving bindings', async (t) => {
  const { packageFixture, target, config } = await makeScenario(t);
  const source = [
    '# Guidance',
    'repository={{repository}}',
    '<!-- assuredloop:template:start -->',
    'Reusable example, not completed target data',
    '{"openspec":"{{openspec_root}}","change":"{{change}}"}',
    '<!-- assuredloop:template:end -->',
  ].join('\r\n') + '\r\n';
  await writeFile(path.join(packageFixture.root, 'skills/assuredloop-adopt/SKILL.md'), source);
  const plan = await planInitialization({ targetRoot: target.root, config, packageRoot: packageFixture.root, localOnly: true });
  const skill = plannedFile(plan, '.gemini/skills/assuredloop-adopt/SKILL.md').content;
  const expected = [
    '# Guidance',
    'repository=example/adoption-consumer',
    '<!-- assuredloop:template:start -->',
    'Reusable example, not completed target data',
    '{"openspec":"openspec","change":"{{change}}"}',
    '<!-- assuredloop:template:end -->',
  ].join('\r\n') + '\r\n';
  assert.equal(skill, expected);
});
