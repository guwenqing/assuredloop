import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { generateContracts, verifyContracts } from '../src/contracts.js';
import {
  execFile,
  git,
  makeGitFixture,
  sha256,
  readJson,
} from './fixtures/adoption/helpers.js';

async function expectCode(operation, code) {
  await assert.rejects(operation, (error) => {
    assert.equal(error?.code, code);
    return true;
  });
}

test('generateContracts uses committed source bytes and records deterministic metadata', async (t) => {
  const source = await makeGitFixture({
    prefix: 'assuredloop-contract-source-',
    files: {
      'bootstrap/project-workflow/spec.md': Buffer.from('# Bootstrap\r\nRequirement: preserve bytes.\r\n'),
      'bootstrap/review/spec.md': Buffer.from('# Review\n'),
      'canonical/project-workflow/spec.md': Buffer.from('# Canonical\n'),
    },
  });
  const root = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-contract-output-'));
  t.after(async () => {
    await Promise.all([
      rm(source.root, { recursive: true, force: true }),
      rm(root, { recursive: true, force: true }),
    ]);
  });

  const sourceRef = {
    repository: 'framework/source',
    revision: source.revision,
    path: 'bootstrap',
  };
  const outputRoot = path.join(root, 'contracts');
  const metadata = await generateContracts({
    sourceRoot: source.root,
    sourceRef,
    outputRoot,
    packageName: 'assuredloop-base',
    packageVersion: '0.1.0',
    basis: 'bootstrap',
  });

  assert.deepEqual(metadata.source_ref, sourceRef);
  assert.equal(metadata.schema_version, 1);
  assert.equal(metadata.name, 'assuredloop-base');
  assert.equal(metadata.version, '0.1.0');
  assert.equal(metadata.basis, 'bootstrap');
  assert.equal(metadata.contracts_path, 'contracts');
  assert.deepEqual(metadata.files.map((file) => file.path), [
    'project-workflow/spec.md',
    'review/spec.md',
  ]);
  assert.equal(metadata.files.some((file) => file.path === 'metadata.json'), false);

  for (const file of metadata.files) {
    const sourcePath = path.posix.join(sourceRef.path, file.path);
    const { stdout } = await execFile('git', ['show', `${source.revision}:${sourcePath}`], { cwd: source.root });
    const actual = await readFile(path.join(outputRoot, file.path));
    assert.deepEqual(actual, Buffer.from(stdout, 'utf8'));
    assert.equal(file.sha256, sha256(actual));
  }
  assert.equal(await readFile(path.join(outputRoot, 'project-workflow/spec.md'), 'utf8'), '# Bootstrap\r\nRequirement: preserve bytes.\r\n');

  await writeFile(
    path.join(source.root, 'bootstrap/project-workflow/spec.md'),
    '# Changed after the pinned revision\n',
  );
  await writeFile(path.join(source.root, 'bootstrap/untracked.md'), '# Do not package\n');
  const regeneratedRoot = path.join(root, 'regenerated-contracts');
  const regenerated = await generateContracts({
    sourceRoot: source.root,
    sourceRef,
    outputRoot: regeneratedRoot,
    packageName: 'assuredloop-base',
    packageVersion: '0.1.0',
    basis: 'bootstrap',
  });
  assert.deepEqual(regenerated, metadata);
  assert.deepEqual(
    await readFile(path.join(regeneratedRoot, 'project-workflow/spec.md')),
    Buffer.from('# Bootstrap\r\nRequirement: preserve bytes.\r\n'),
  );
  assert.equal(await readFile(path.join(source.root, 'bootstrap/untracked.md'), 'utf8'), '# Do not package\n');
  await assert.rejects(readFile(path.join(regeneratedRoot, 'untracked.md')));
});

test('generateContracts supports the canonical source root with the same byte contract', async (t) => {
  const source = await makeGitFixture({
    prefix: 'assuredloop-canonical-source-',
    files: {
      'openspec/specs/workflow-goals/spec.md': '# Goals\n',
      'openspec/specs/project-workflow-adoption/spec.md': '# Adoption\n',
    },
  });
  const root = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-canonical-output-'));
  t.after(async () => {
    await Promise.all([
      rm(source.root, { recursive: true, force: true }),
      rm(root, { recursive: true, force: true }),
    ]);
  });
  const metadata = await generateContracts({
    sourceRoot: source.root,
    sourceRef: {
      repository: 'framework/source',
      revision: source.revision,
      path: 'openspec/specs',
    },
    outputRoot: path.join(root, 'contracts'),
    packageName: 'assuredloop-base',
    packageVersion: '0.1.0',
    basis: 'canonical',
  });
  assert.equal(metadata.basis, 'canonical');
  assert.deepEqual(metadata.files.map((file) => file.path), [
    'project-workflow-adoption/spec.md',
    'workflow-goals/spec.md',
  ]);
  assert.deepEqual(await verifyContracts(root), metadata);
});

test('verifyContracts rejects changed bytes and malformed metadata', async (t) => {
  const source = await makeGitFixture({
    prefix: 'assuredloop-invalid-contract-source-',
    files: { 'spec.md': '# Contract\n' },
  });
  const root = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-invalid-contract-output-'));
  t.after(async () => {
    await Promise.all([
      rm(source.root, { recursive: true, force: true }),
      rm(root, { recursive: true, force: true }),
    ]);
  });
  await generateContracts({
    sourceRoot: source.root,
    sourceRef: {
      repository: 'framework/source',
      revision: source.revision,
      path: '.',
    },
    outputRoot: path.join(root, 'contracts'),
    packageName: 'assuredloop-base',
    packageVersion: '0.1.0',
    basis: 'canonical',
  });

  await writeFile(path.join(root, 'contracts/spec.md'), '# Tampered\n');
  await expectCode(() => verifyContracts(root), 'contract-invalid');
  await writeFile(path.join(root, 'contracts/spec.md'), '# Contract\n');
  const metadataPath = path.join(root, 'contracts/metadata.json');
  const metadata = await readJson(metadataPath);
  delete metadata.source_ref;
  await writeFile(metadataPath, `${JSON.stringify(metadata)}\n`);
  await expectCode(() => verifyContracts(root), 'contract-invalid');
});

test('contract generation rejects unsafe source paths before reading outside the source root', async (t) => {
  const source = await makeGitFixture({
    prefix: 'assuredloop-unsafe-contract-source-',
    files: { 'spec.md': '# Contract\n' },
  });
  const root = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-unsafe-contract-output-'));
  t.after(async () => {
    await Promise.all([
      rm(source.root, { recursive: true, force: true }),
      rm(root, { recursive: true, force: true }),
    ]);
  });
  await expectCode(
    () => generateContracts({
      sourceRoot: source.root,
      sourceRef: {
        repository: 'framework/source',
        revision: source.revision,
        path: '../outside',
      },
      outputRoot: path.join(root, 'contracts'),
      packageName: 'assuredloop-base',
      packageVersion: '0.1.0',
      basis: 'canonical',
    }),
    'path-unsafe',
  );
  await assert.rejects(readFile(path.join(root, 'contracts', 'metadata.json')));
});

test('contract generation rejects unexpected output files before writing expected assets', async (t) => {
  const source = await makeGitFixture({
    prefix: 'assuredloop-leftover-source-',
    files: { 'spec.md': '# Contract\n' },
  });
  const root = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-leftover-output-'));
  const outputRoot = path.join(root, 'contracts');
  await mkdir(outputRoot, { recursive: true });
  await writeFile(path.join(outputRoot, 'leftover.md'), '# Consumer-owned file\n');
  t.after(async () => {
    await Promise.all([
      rm(source.root, { recursive: true, force: true }),
      rm(root, { recursive: true, force: true }),
    ]);
  });

  await expectCode(
    () => generateContracts({
      sourceRoot: source.root,
      sourceRef: {
        repository: 'framework/source',
        revision: source.revision,
        path: '.',
      },
      outputRoot,
      packageName: 'assuredloop-base',
      packageVersion: '0.1.0',
      basis: 'canonical',
    }),
    'file-conflict',
  );
  assert.equal(await readFile(path.join(outputRoot, 'leftover.md'), 'utf8'), '# Consumer-owned file\n');
  await assert.rejects(readFile(path.join(outputRoot, 'spec.md')));
  await assert.rejects(readFile(path.join(outputRoot, 'metadata.json')));
});

test('contract generation rejects a source repository identity mismatch', async (t) => {
  const source = await makeGitFixture({
    prefix: 'assuredloop-source-identity-',
    remote: 'https://github.com/example/actual-source.git',
    files: { 'spec.md': '# Contract\n' },
  });
  const root = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-source-identity-output-'));
  const outputRoot = path.join(root, 'contracts');
  t.after(async () => {
    await Promise.all([
      rm(source.root, { recursive: true, force: true }),
      rm(root, { recursive: true, force: true }),
    ]);
  });

  await expectCode(
    () => generateContracts({
      sourceRoot: source.root,
      sourceRef: {
        repository: 'example/different-source',
        revision: source.revision,
        path: '.',
      },
      outputRoot,
      packageName: 'assuredloop-base',
      packageVersion: '0.1.0',
      basis: 'canonical',
    }),
    'binding-invalid',
  );
  await assert.rejects(readFile(path.join(outputRoot, 'metadata.json')));
});

test('contract generation accepts supported GitHub origin forms and rejects an unrecognized origin', async (t) => {
  const source = await makeGitFixture({
    prefix: 'assuredloop-source-origin-forms-',
    remote: 'https://github.com/example/actual-source.git',
    files: { 'spec.md': '# Contract\n' },
  });
  const root = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-source-origin-forms-output-'));
  t.after(async () => {
    await Promise.all([
      rm(source.root, { recursive: true, force: true }),
      rm(root, { recursive: true, force: true }),
    ]);
  });
  const origins = [
    'https://github.com/example/actual-source.git',
    'https://github.com/example/actual-source',
    'git@github.com:example/actual-source.git',
    'git@github.com:example/actual-source',
    'ssh://git@github.com/example/actual-source.git',
  ];
  for (const [index, origin] of origins.entries()) {
    await git(source.root, ['remote', 'set-url', 'origin', origin]);
    await generateContracts({
      sourceRoot: source.root,
      sourceRef: {
        repository: index === 0 ? 'Example/Actual-Source' : 'example/actual-source',
        revision: source.revision,
        path: '.',
      },
      outputRoot: path.join(root, `contracts-${index}`),
      packageName: 'assuredloop-base',
      packageVersion: '0.1.0',
      basis: 'canonical',
    });
  }

  await git(source.root, ['remote', 'set-url', 'origin', 'https://code.example.invalid/example/actual-source.git']);
  await expectCode(
    () => generateContracts({
      sourceRoot: source.root,
      sourceRef: {
        repository: 'example/actual-source',
        revision: source.revision,
        path: '.',
      },
      outputRoot: path.join(root, 'unsupported-origin'),
      packageName: 'assuredloop-base',
      packageVersion: '0.1.0',
      basis: 'canonical',
    }),
    'binding-invalid',
  );
  await assert.rejects(readFile(path.join(root, 'unsupported-origin', 'metadata.json')));
});
