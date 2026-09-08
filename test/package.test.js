import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import {
  execFile,
  makeGitFixture,
  makeConfig,
  readJson,
  writeJson,
} from './fixtures/adoption/helpers.js';

const execFileDirect = promisify(execFileCallback);
const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname);

async function packRepository(destination) {
  const { stdout } = await execFileDirect(
    'npm',
    ['pack', '--json', '--ignore-scripts', '--pack-destination', destination],
    { cwd: repositoryRoot },
  );
  const [record] = JSON.parse(stdout);
  return { archive: path.join(destination, record.filename), record };
}

async function archiveEntries(archive) {
  const { stdout } = await execFileDirect('tar', ['-tzf', archive]);
  return stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((entry) => entry.replace(/^package\//, '').replace(/\/$/, ''));
}

async function readArchiveJson(archive, relativePath) {
  const { stdout } = await execFileDirect('tar', ['-xOf', archive, `package/${relativePath}`]);
  return JSON.parse(stdout);
}

test('package metadata and npm pack expose only reusable workflow assets', async (t) => {
  const destination = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-pack-'));
  t.after(() => rm(destination, { recursive: true, force: true }));
  const { archive, record } = await packRepository(destination);
  const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const entries = await archiveEntries(archive);
  const packageMetadata = await readArchiveJson(archive, 'package.json');

  assert.equal(packageJson.name, 'assuredloop-base');
  assert.equal(packageJson.version, '0.1.0');
  assert.equal(packageJson.private, true);
  assert.equal(packageMetadata.name, packageJson.name);
  assert.equal(packageMetadata.version, packageJson.version);
  assert.equal(path.posix.normalize(packageMetadata.bin.assuredloop), 'src/cli.js');
  for (const requiredRoot of ['src', 'schemas', 'templates', 'skills', 'contracts']) {
    assert.ok(
      packageMetadata.files.includes(requiredRoot),
      `package files allowlist must include ${requiredRoot}`,
    );
    assert.ok(entries.some((entry) => entry === requiredRoot || entry.startsWith(`${requiredRoot}/`)));
  }
  assert.ok(entries.includes('src/cli.js'));
  assert.ok(entries.includes('skills/assuredloop-adopt/SKILL.md'));
  assert.ok(entries.includes('contracts/metadata.json'));
  assert.equal(record.name, packageJson.name);
  assert.equal(record.version, packageJson.version);

  for (const forbiddenPrefix of [
    '.git',
    '.agents',
    '.claude',
    '.assuredloop',
    'openspec',
    'local-data',
    'test',
  ]) {
    assert.equal(
      entries.some((entry) => entry === forbiddenPrefix || entry.startsWith(`${forbiddenPrefix}/`)),
      false,
      `packed package must exclude ${forbiddenPrefix}`,
    );
  }
  assert.equal(entries.some((entry) => /(?:credential|\.log$|execution)/i.test(entry)), false);
});

test('packed CLI runs from an installed package without the source checkout', async (t) => {
  const destination = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-install-'));
  const installRoot = path.join(destination, 'consumer-install');
  t.after(() => rm(destination, { recursive: true, force: true }));
  const { archive } = await packRepository(destination);
  await execFileDirect(
    'npm',
    [
      'install',
      '--offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--prefix',
      installRoot,
      archive,
    ],
    { cwd: destination },
  );

  const installedRoot = path.join(installRoot, 'node_modules', 'assuredloop-base');
  const installedCli = path.join(installedRoot, 'src', 'cli.js');
  const { stdout: help } = await execFileDirect(process.execPath, [installedCli, '--help'], { cwd: installRoot });
  assert.match(help, /assuredloop/i);
  assert.match(help, /init/);
  const { stdout: version } = await execFileDirect(process.execPath, [installedCli, '--version'], { cwd: installRoot });
  assert.equal(version.trim(), '0.1.0');

  const metadata = await readJson(path.join(installedRoot, 'contracts/metadata.json'));
  const target = await makeGitFixture({
    prefix: 'assuredloop-packed-target-',
    remote: 'https://github.com/example/packed-consumer.git',
    files: {
      'README.md': '# Packed consumer\n',
      'openspec/config.yaml': 'schema: spec-driven\n',
      'openspec/specs/product/spec.md': '# Consumer-owned requirements\n',
    },
  });
  const config = makeConfig(metadata, {
    repository: 'example/packed-consumer',
    tools: ['gemini'],
  });
  const configPath = path.join(destination, 'target-config.json');
  await writeJson(configPath, config);
  t.after(() => rm(target.root, { recursive: true, force: true }));

  const { stdout } = await execFileDirect(
    process.execPath,
    [installedCli, 'init', '--target', target.root, '--config', configPath, '--local-only', '--apply'],
    { cwd: installRoot },
  );
  const result = JSON.parse(stdout);
  assert.equal(result.status, 'applied');
  assert.deepEqual(await readJson(path.join(target.root, '.assuredloop/config.json')), config);
  assert.ok(await readFile(path.join(target.root, '.gemini/skills/assuredloop-adopt/SKILL.md'), 'utf8'));
  assert.equal(
    await readFile(path.join(target.root, 'openspec/specs/product/spec.md'), 'utf8'),
    '# Consumer-owned requirements\n',
  );
  assert.equal(
    result.files.some((file) => file.path.startsWith('openspec/specs/project-workflow')),
    false,
  );
  assert.equal(
    result.files.some((file) => file.path.startsWith('openspec/changes')),
    false,
  );
});
