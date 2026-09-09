import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

import { generateContracts, verifyContracts } from '../src/contracts.js';
import { validateRecord } from '../src/records.js';

const execFile = promisify(execFileCallback);
const root = fileURLToPath(new URL('..', import.meta.url));
const bootstrapSourceRef = {
  repository: 'guwenqing/assuredloop-base',
  revision: 'f5c528723e24e11162a637b3e679f4896a5c024b',
  path: 'openspec/changes/establish-project-workflow/specs',
};
const canonicalSourcePath = 'openspec/specs';
const contractFiles = [
  'github-work-traceability/spec.md', 'project-workflow-adoption/spec.md',
  'review-and-validation/spec.md', 'specification-baseline/spec.md',
  'work-intake-and-planning/spec.md', 'workflow-goals/spec.md',
  'workflow-self-evolution/spec.md',
];
const categories = ['request', 'epic', 'architecture-task', 'task', 'bug', 'spike'];
const read = (file) => readFile(path.join(root, file), 'utf8');

test('shipped config exemplar and schema agree on six default categories without discipline', async () => {
  const config = JSON.parse(await read('templates/records/config.json'));
  const schema = JSON.parse(await read('schemas/workflow.schema.json'));
  const labels = schema.$defs.config.properties.repository.properties.labels;
  assert.deepEqual(Object.keys(labels.properties), ['type']);
  assert.deepEqual([...labels.properties.type.required].sort(), [...categories].sort());
  assert.deepEqual(Object.keys(labels.properties.type.properties).sort(), [...categories].sort());
  assert.deepEqual(Object.keys(config.repository.labels), ['type']);
  assert.deepEqual(config.repository.labels.type,
    Object.fromEntries(categories.map((category) => [category, `type:${category}`])));
  for (const category of categories) {
    assert.equal(labels.properties.type.properties[category].default, config.repository.labels.type[category]);
  }
  assert.deepEqual(validateRecord('config', config), { valid: true, errors: [] });
});

test('shared creation guidance states the compatible category/activity table and limited exceptions', async () => {
  const guidance = await read('templates/README.md');
  const rows = [...guidance.matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/gm)];
  const actual = Object.fromEntries(rows.filter(([, category]) =>
    ['Request', 'Epic', 'Architecture Task', 'Task', 'Bug', 'Spike'].includes(category))
    .map(([, category, activities]) => [category, [...activities.matchAll(/`([a-z]+)`/g)].map((match) => match[1])]));
  assert.deepEqual(actual, {
    Request: ['triage'], Epic: [], 'Architecture Task': ['plan', 'closeout'],
    Task: ['adopt', 'deliver', 'review'], Bug: ['deliver'], Spike: ['research'],
  });
  assert.match(guidance, /rough incoming Request[^.]*omit[^.]*before triage/i);
  assert.match(guidance, /non-executable Epic[^.]*omit context/i);
  assert.match(guidance, /Neither exception[^.]*omit context[^.]*Epic[^.]*executable activity/i);
  assert.match(guidance, /exactly one configured category/i);
  assert.match(guidance, /case-insensitive/i);
  assert.match(guidance, /Different consumer label names[^.]*supported/i);
  assert.match(guidance, /unrelated labels[^.]*not count/i);
  assert.match(guidance, /category-migration\.md/);
});

test('each packaged activity points to shared category guidance and its compatible category', async () => {
  const pairs = {
    adopt: ['Task/adopt'], triage: ['Request/triage'], plan: ['Architecture Task/plan'],
    research: ['Spike/research'], deliver: ['Task/deliver', 'Bug/deliver'],
    review: ['Task/review'], closeout: ['Architecture Task/closeout'],
  };
  for (const [activity, declarations] of Object.entries(pairs)) {
    const file = `skills/assuredloop-${activity}/SKILL.md`;
    const source = await read(file);
    assert.match(source, /templates\/README\.md/, `${file} uses the shared creation contract`);
    for (const declaration of declarations) {
      assert.ok(source.includes(declaration), `${file} must identify ${declaration}`);
    }
    assert.doesNotMatch(source, /(?:(?<!Architecture )Task\/(?:plan|closeout)|Architecture Task\/deliver|Epic\/deliver)/,
      `${file} must not teach an incompatible executable category`);
  }
  assert.match(await read('templates/work-issue.md'), /templates\/README\.md/);
  assert.match(await read('README.md'), /templates\/README\.md#classify-the-assigned-work/);
});

test('migration guidance preserves cancellation and evidence within explicit scope', async () => {
  const migration = await read('templates/category-migration.md');
  assert.match(migration, /explicitly authorized consumer migration[^.]*accepted/i);
  assert.match(migration, /remove `repository\.labels\.discipline`/);
  assert.match(migration, /six distinct category mappings/i);
  assert.match(migration, /inventory[^.]*open and closed Issues/i);
  assert.match(migration, /Preserve[^.]*state\/state_reason[^.]*assignees[^.]*parent[^.]*dependencies[^.]*evidence/i);
  assert.match(migration, /reconcile newly affected Issues/i);
  assert.match(migration, /preserve[^.]*cancellation[^.]*prose\/evidence/i);
  assert.match(migration, /Do not invent[^.]*delivered work[^.]*retroactive acceptance/i);
  assert.match(migration, /unresolved required fact[^.]*migration is incomplete/i);
  assert.match(migration, /does not reopen cancelled work/i);
  assert.match(migration, /Only after replacement checks pass[^.]*delete[^.]*explicitly scoped/i);
  assert.match(migration, /`discipline:architecture`[^.]*`discipline:development`/);
  assert.match(migration, /do not infer authority to delete other labels/i);
  assert.match(migration, /before\/after evidence[^.]*GitHub Issue\/PR comments/i);
  assert.match(migration, /Read-only[^.]*`check`[^.]*`inspect`[^.]*remain read-only/i);
  assert.match(migration, /does not[^.]*rewrite historical Git revisions\/review records/i);
});

test('frozen Architecture Task bootstrap fixture reproduces its immutable source via the generator', async (t) => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-architecture-bootstrap-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  const generated = await generateContracts({
    sourceRoot: root, sourceRef: bootstrapSourceRef, outputRoot: path.join(output, 'contracts'),
    packageName: 'assuredloop-base', packageVersion: '0.1.0', basis: 'bootstrap',
  });
  const files = [];
  for (const file of contractFiles) {
    const { stdout: acceptedBytes } = await execFile('git', [
      'show', `${bootstrapSourceRef.revision}:${bootstrapSourceRef.path}/${file}`,
    ], { cwd: root, encoding: 'buffer' });
    assert.deepEqual(await readFile(path.join(output, 'contracts', file)), acceptedBytes,
      `${file} differs from the frozen bootstrap source`);
    files.push({ path: file, sha256: createHash('sha256').update(acceptedBytes).digest('hex') });
  }
  assert.deepEqual(generated, {
    schema_version: 1, name: 'assuredloop-base', version: '0.1.0', basis: 'bootstrap',
    source_ref: bootstrapSourceRef, contracts_path: 'contracts', files,
  });
  assert.deepEqual(await verifyContracts(output), generated);
});

test('shipped contracts regenerate from a full pinned canonical source revision', async (t) => {
  const metadata = await verifyContracts(root);
  assert.equal(metadata.basis, 'canonical');
  assert.equal(metadata.source_ref.path, canonicalSourcePath);
  const { stdout: revision } = await execFile('git', [
    'rev-parse', '--verify', `${metadata.source_ref.revision}^{commit}`,
  ], { cwd: root });
  assert.equal(metadata.source_ref.revision, revision.trim());
  const packageJson = JSON.parse(await read('package.json'));
  assert.equal(metadata.name, packageJson.name);
  assert.equal(metadata.version, packageJson.version);
  assert.deepEqual(metadata.files.map((file) => file.path), contractFiles);
  const output = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-architecture-canonical-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  const generated = await generateContracts({
    sourceRoot: root, sourceRef: metadata.source_ref, outputRoot: path.join(output, 'contracts'),
    packageName: packageJson.name, packageVersion: packageJson.version, basis: 'canonical',
  });
  assert.deepEqual(generated, metadata, 'shipped metadata must match canonical generation');
  assert.deepEqual(await verifyContracts(output), metadata);
  for (const file of contractFiles) {
    assert.deepEqual(await readFile(path.join(output, 'contracts', file)),
      await readFile(path.join(root, 'contracts', file)));
  }
});

test('shipped contract bodies cover canonical capabilities and equal pinned Git blobs and current Specs', async () => {
  const metadata = await verifyContracts(root);
  const entries = await readdir(path.join(root, canonicalSourcePath), { recursive: true, withFileTypes: true });
  const currentFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.relative(path.join(root, canonicalSourcePath), path.join(entry.parentPath, entry.name)))
    .sort();
  assert.deepEqual(currentFiles, contractFiles);
  assert.deepEqual(metadata.files.map((file) => file.path), currentFiles);
  for (const file of currentFiles) {
    const canonicalBytes = await readFile(path.join(root, canonicalSourcePath, file));
    const shippedBytes = await readFile(path.join(root, 'contracts', file));
    const { stdout: pinnedBytes } = await execFile('git', [
      'show', `${metadata.source_ref.revision}:${canonicalSourcePath}/${file}`,
    ], { cwd: root, encoding: 'buffer' });
    assert.deepEqual(shippedBytes, pinnedBytes, `${file} differs from the pinned canonical Git blob`);
    assert.deepEqual(shippedBytes, canonicalBytes, `${file} differs from current canonical content`);
    const body = shippedBytes.toString('utf8');
    assert.match(body, /^# .+/m, `${file} needs its capability title`);
    assert.match(body, /^## Purpose$/m, `${file} needs its canonical Purpose`);
    assert.match(body, /^## Requirements$/m, `${file} needs canonical Requirements`);
    assert.match(body, /^### Requirement: .+/m, `${file} needs requirement bodies`);
    assert.match(body, /^#### Scenario: .+/m, `${file} needs scenario bodies`);
    assert.doesNotMatch(body, /^## (?:ADDED|MODIFIED|REMOVED|RENAMED) Requirements$/m,
      `${file} must not ship active-change operation headings`);
  }
});
