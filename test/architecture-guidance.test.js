import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

import { generateContracts, verifyContracts } from '../src/contracts.js';
import { validateRecord } from '../src/records.js';

const execFile = promisify(execFileCallback);
const root = fileURLToPath(new URL('..', import.meta.url));
const acceptedRevision = 'f5c528723e24e11162a637b3e679f4896a5c024b';
const acceptedSourcePath = 'openspec/changes/establish-project-workflow/specs';
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

test('shipped contracts exactly reproduce the accepted Architecture Task amendment via the generator', async (t) => {
  const metadata = await verifyContracts(root);
  assert.equal(metadata.source_ref.revision, acceptedRevision);
  assert.equal(metadata.source_ref.path, acceptedSourcePath);
  assert.equal(metadata.basis, 'bootstrap', 'the accepted source is still the native active change');
  const packageJson = JSON.parse(await read('package.json'));
  assert.equal(metadata.name, packageJson.name);
  assert.equal(metadata.version, packageJson.version);
  const output = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-architecture-contracts-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  const generated = await generateContracts({
    sourceRoot: root, sourceRef: metadata.source_ref, outputRoot: path.join(output, 'contracts'),
    packageName: packageJson.name, packageVersion: packageJson.version, basis: 'bootstrap',
  });
  assert.deepEqual(generated, metadata, 'metadata must match actual generation from the accepted commit');
  assert.deepEqual(await verifyContracts(output), metadata);
  for (const file of metadata.files) {
    const { stdout: acceptedBytes } = await execFile('git', [
      'show', `${acceptedRevision}:${acceptedSourcePath}/${file.path}`,
    ], { cwd: root, encoding: 'buffer' });
    const shippedBytes = await readFile(path.join(root, 'contracts', file.path));
    assert.deepEqual(shippedBytes, acceptedBytes, `${file.path} differs from the accepted immutable source`);
    assert.deepEqual(await readFile(path.join(output, 'contracts', file.path)), shippedBytes);
  }
});
