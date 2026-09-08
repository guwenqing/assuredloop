import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

import { inspectNativeSnapshot } from '../src/native-snapshot.js';
import {
  canonicalSnapshotFiles,
  canonicalSpec,
  canonicalSpecPath,
  capability,
  change,
  malformedDeltaSpec,
  malformedProposal,
  malformedSpec,
  nestedCanonicalSpec,
  nestedCanonicalSpecPath,
  nestedCapability,
  nestedDeltaSpec,
  nestedDeltaSpecPath,
  nestedSnapshotFiles,
  openspecRoot,
  proposalPath,
  repository,
  revision,
  scenarioLossDeltaSpec,
  snapshotWithUnsupportedSchema,
  snapshotWithUnrelatedFiles,
  tasks,
} from './fixtures/native-snapshot/fixtures.mjs';

const require = createRequire(import.meta.url);
const pinnedEntry = require.resolve('@fission-ai/openspec');
const pinnedDist = path.dirname(pinnedEntry);
const pinnedDependencyRoot = path.resolve(pinnedDist, '..');
const [
  { MarkdownParser },
  { ChangeParser },
  { Validator },
  { extractRequirementsSection, findMissingCurrentScenarios, parseDeltaSpec },
  { parseTaskLines },
  { discoverSpecFiles },
] = await Promise.all([
  import(pathToFileURL(path.join(pinnedDist, 'core/parsers/markdown-parser.js')).href),
  import(pathToFileURL(path.join(pinnedDist, 'core/parsers/change-parser.js')).href),
  import(pathToFileURL(path.join(pinnedDist, 'core/validation/validator.js')).href),
  import(pathToFileURL(path.join(pinnedDist, 'core/parsers/requirement-blocks.js')).href),
  import(pathToFileURL(path.join(pinnedDist, 'utils/task-progress.js')).href),
  import(pathToFileURL(path.join(pinnedDist, 'utils/spec-discovery.js')).href),
]);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const text = (bytes) => bytes.toString('utf8');
const canonicalSpecRelativePath = canonicalSpecPath.slice(openspecRoot.length + 1);

function matchesPath(candidate, suffix) {
  return candidate === suffix || candidate?.endsWith(`/${suffix}`) ||
    (suffix === canonicalSpecPath && (candidate === canonicalSpecRelativePath ||
      candidate?.endsWith(`/${canonicalSpecRelativePath}`)));
}

function findSpec(result, suffix) {
  const entry = result.specs?.find((candidate) => matchesPath(candidate.path, suffix));
  assert.ok(entry, `native snapshot did not return spec ${suffix}`);
  return entry;
}

function digestRecord(result, suffix) {
  const digests = result.raw_digests;
  if (Array.isArray(digests)) {
    const entry = digests.find((candidate) => matchesPath(candidate.path, suffix));
    if (!entry) return undefined;
    return typeof entry === 'string' ? entry : entry.sha256 ?? entry.digest;
  }
  if (digests && typeof digests === 'object') {
    const key = Object.keys(digests).find((candidate) => matchesPath(candidate, suffix));
    if (key === undefined) return undefined;
    const entry = digests[key];
    return typeof entry === 'string' ? entry : entry?.sha256 ?? entry?.digest;
  }
  return undefined;
}

function withoutRawDigests(result) {
  const copy = structuredClone(result);
  delete copy.raw_digests;
  return copy;
}

async function materializeSnapshot(t, files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-native-snapshot-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const file of files) {
    const destination = path.join(root, ...file.path.split('/'));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.content);
  }
  return {
    root,
    mainSpecsDir: path.join(root, openspecRoot, 'specs'),
    changeDir: path.join(root, openspecRoot, 'changes', change),
  };
}

async function expectedNativeSnapshot(t, files) {
  const materialized = await materializeSnapshot(t, files);
  const canonicalModel = new MarkdownParser(text(canonicalSpec)).parseSpec(capability);
  const canonicalValidation = await new Validator().validateSpecContent(capability, text(canonicalSpec));
  const proposalText = text(files.find((file) => file.path === proposalPath).content);
  const changeModel = await new ChangeParser(proposalText, materialized.changeDir).parseChangeWithDeltas(change);
  const changeValidation = await new Validator().validateChangeDeltaSpecs(materialized.changeDir, {
    mainSpecsDir: materialized.mainSpecsDir,
  });
  const proposalValidation = await new Validator(true).validateChange(path.join(materialized.changeDir, 'proposal.md'));
  return { canonicalModel, canonicalValidation, changeModel, changeValidation, proposalValidation };
}

async function expectedNestedNativeSnapshot(t, files) {
  const materialized = await materializeSnapshot(t, files);
  const discovered = await discoverSpecFiles(materialized.mainSpecsDir);
  const nested = discovered.find((entry) => entry.id === nestedCapability);
  assert.ok(nested, `pinned native discovery did not find ${nestedCapability}`);
  const nestedModel = new MarkdownParser(text(nestedCanonicalSpec)).parseSpec(nested.id);
  const nestedValidation = await new Validator(true).validateSpecContent(nested.id, text(nestedCanonicalSpec));
  const proposalText = text(files.find((file) => file.path === proposalPath).content);
  const changeModel = await new ChangeParser(proposalText, materialized.changeDir).parseChangeWithDeltas(change);
  const changeValidation = await new Validator(true).validateChangeDeltaSpecs(materialized.changeDir, {
    mainSpecsDir: materialized.mainSpecsDir,
  });
  return { discovered, nestedModel, nestedValidation, changeModel, changeValidation };
}

async function expectCode(operation, code) {
  await assert.rejects(operation, (error) => {
    assert.equal(error?.code, code);
    return true;
  });
}

test('validates a canonical spec and delta through pinned native models and reports', async (t) => {
  const files = canonicalSnapshotFiles();
  const expected = await expectedNativeSnapshot(t, files);
  const result = await inspectNativeSnapshot({
    repository,
    revision,
    openspecRoot,
    change,
    files,
    dependencyRoot: pinnedDependencyRoot,
  });

  assert.equal(result.status, 'valid');
  const spec = findSpec(result, canonicalSpecPath);
  assert.deepEqual(spec.model, expected.canonicalModel);
  assert.deepEqual(spec.validation, expected.canonicalValidation);
  assert.deepEqual(result.change.model, expected.changeModel);
  assert.deepEqual(result.change.validation, expected.changeValidation);
  assert.deepEqual(result.tasks, parseTaskLines(text(tasks)));
  assert.deepEqual(spec.model.requirements[0].scenarios, expected.canonicalModel.requirements[0].scenarios);
  assert.ok(Array.isArray(result.findings));
  assert.equal(result.status, 'valid');
});

test('reports malformed canonical specs as invalid with the native validation report', async () => {
  const files = canonicalSnapshotFiles();
  files[0] = { path: canonicalSpecPath, content: malformedSpec };
  const result = await inspectNativeSnapshot({ repository, revision, openspecRoot, change, files });

  assert.equal(result.status, 'invalid');
  const spec = findSpec(result, canonicalSpecPath);
  assert.equal(spec.validation.valid, false);
  assert.ok(spec.validation.issues.some((issue) => /Requirements section|requirements/i.test(issue.message)));
  assert.equal(result.change.validation.valid, true);
});

test('reports malformed deltas as invalid while preserving the native change model', async (t) => {
  const files = canonicalSnapshotFiles({ delta: malformedDeltaSpec });
  const expected = await expectedNativeSnapshot(t, files);
  const result = await inspectNativeSnapshot({ repository, revision, openspecRoot, change, files });

  assert.equal(result.status, 'invalid');
  assert.deepEqual(result.change.model, expected.changeModel);
  assert.deepEqual(result.change.validation, expected.changeValidation);
  assert.equal(result.change.validation.valid, false);
  assert.ok(result.change.validation.issues.some((issue) => /scenario/i.test(issue.message)));
});

test('reports an empty native snapshot as unavailable with an explicit missing-input finding', async () => {
  const result = await inspectNativeSnapshot({ repository, revision, openspecRoot, files: [] });

  assert.equal(result.status, 'unavailable');
  assert.deepEqual(result.specs, []);
  assert.equal(result.change, null);
  assert.ok(result.findings.some((finding) =>
    finding.code === 'native-input-unavailable' && /snapshot|spec|change|artifact/i.test(finding.message)));
});

test('preserves nested native capability ids and models under the explicit custom root', async (t) => {
  const files = nestedSnapshotFiles();
  const expected = await expectedNestedNativeSnapshot(t, files);
  const result = await inspectNativeSnapshot({ repository, revision, openspecRoot, change, files });

  assert.deepEqual(expected.discovered.map((entry) => entry.id), [nestedCapability]);
  assert.equal(result.status, 'valid');
  assert.notEqual(result.status, 'unavailable');
  const spec = findSpec(result, nestedCanonicalSpecPath);
  assert.deepEqual(spec.model, expected.nestedModel);
  assert.deepEqual(spec.validation, expected.nestedValidation);
  assert.deepEqual(result.change.model, expected.changeModel);
  assert.deepEqual(result.change.validation, expected.changeValidation);
  assert.equal(digestRecord(result, nestedCanonicalSpecPath), sha256(nestedCanonicalSpec));
  assert.equal(digestRecord(result, nestedDeltaSpecPath), sha256(nestedDeltaSpec));
});

test('uses native proposal validation for malformed proposal content while preserving delta output', async (t) => {
  const files = canonicalSnapshotFiles({ proposal: malformedProposal });
  const expected = await expectedNativeSnapshot(t, files);
  const result = await inspectNativeSnapshot({ repository, revision, openspecRoot, change, files });

  assert.equal(result.status, 'invalid');
  assert.deepEqual(result.change.model, expected.changeModel);
  assert.deepEqual(result.change.validation, expected.changeValidation);
  assert.deepEqual(result.change.proposal_validation, expected.proposalValidation);
  assert.equal(result.change.proposal_validation.valid, false);
  assert.ok(result.change.proposal_validation.issues.some((issue) =>
    issue.path === 'why' && /at least 50 characters/i.test(issue.message)));
  assert.ok(result.findings.some((finding) =>
    finding.code === 'native-inspection-scope' && /schema|status|not executed/i.test(finding.message)));
});

test('keeps unsupported custom schema and project-status coverage explicit', async () => {
  const result = await inspectNativeSnapshot({
    repository,
    revision,
    openspecRoot,
    change,
    files: snapshotWithUnsupportedSchema(),
  });
  const scope = result.findings.find((finding) => finding.code === 'native-inspection-scope');

  assert.ok(scope, 'native inspection must disclose its bounded coverage');
  assert.match(scope.message, /schema/i);
  assert.match(scope.message, /status/i);
  assert.match(scope.message, /not executed/i);
  assert.doesNotMatch(JSON.stringify(result.findings), /complete project schema|fully validated.*status/i);
});

test('reports native scenario loss when a MODIFIED delta drops a current scenario', async (t) => {
  const files = canonicalSnapshotFiles({ delta: scenarioLossDeltaSpec });
  const expected = await expectedNativeSnapshot(t, files);
  const current = extractRequirementsSection(text(canonicalSpec)).bodyBlocks[0];
  const incoming = parseDeltaSpec(text(scenarioLossDeltaSpec)).modified[0];
  const missing = findMissingCurrentScenarios(current, incoming);
  const result = await inspectNativeSnapshot({ repository, revision, openspecRoot, change, files });

  assert.deepEqual(missing, ['Preserve a Unicode note']);
  assert.equal(result.status, 'invalid');
  assert.deepEqual(result.change.validation, expected.changeValidation);
  assert.ok(result.change.validation.issues.some((issue) =>
    /Preserve a Unicode note|scenario/i.test(issue.message)));
});

test('keeps CRLF and Unicode source bytes represented by separate raw SHA-256 digests', async () => {
  const files = canonicalSnapshotFiles();
  const result = await inspectNativeSnapshot({ repository, revision, openspecRoot, change, files });
  const expectedDigest = sha256(canonicalSpec);
  const normalizedDigest = sha256(Buffer.from(text(canonicalSpec).replaceAll('\r\n', '\n'), 'utf8'));

  assert.notEqual(expectedDigest, normalizedDigest);
  assert.equal(digestRecord(result, canonicalSpecPath), expectedDigest);
  assert.notEqual(digestRecord(result, canonicalSpecPath), normalizedDigest);
  const spec = findSpec(result, canonicalSpecPath);
  assert.equal(Object.hasOwn(spec.model, 'content'), false);
  assert.equal(Object.hasOwn(spec.validation, 'content'), false);
});

test('uses only the supplied scoped snapshot despite unrelated dirty consumer files and candidate dependencies', async (t) => {
  const clean = await inspectNativeSnapshot({
    repository,
    revision,
    openspecRoot,
    change,
    files: canonicalSnapshotFiles(),
  });
  const dirty = await inspectNativeSnapshot({
    repository,
    revision,
    openspecRoot,
    change,
    files: snapshotWithUnrelatedFiles(),
  });

  assert.deepEqual(withoutRawDigests(dirty), withoutRawDigests(clean));
  assert.equal(digestRecord(dirty, canonicalSpecPath), sha256(canonicalSpec));
  assert.equal(digestRecord(dirty, 'README.md'), undefined);
  assert.equal(dirty.status, 'valid');
  assert.doesNotMatch(JSON.stringify(dirty.findings), /attacker\/redirect|0\.0\.0-malicious|process\.exit\(99\)/);
  await expectedNativeSnapshot(t, canonicalSnapshotFiles());
});

test('rejects unsafe roots, revisions, snapshot paths and dependency links before reading them', async () => {
  await expectCode(() => inspectNativeSnapshot({
    repository,
    revision,
    openspecRoot: '../workflow-spec',
    change,
    files: canonicalSnapshotFiles(),
  }), 'path-unsafe');
  await expectCode(() => inspectNativeSnapshot({
    repository,
    revision,
    openspecRoot,
    change: '../ship-audit',
    files: canonicalSnapshotFiles(),
  }), 'path-unsafe');
  await expectCode(() => inspectNativeSnapshot({
    repository,
    revision,
    openspecRoot,
    change,
    files: [{ path: `${openspecRoot}/../outside.md`, content: Buffer.from('outside', 'utf8') }],
  }), 'path-unsafe');
  await expectCode(() => inspectNativeSnapshot({
    repository,
    revision,
    openspecRoot,
    change,
    files: [{ path: '/tmp/outside.md', content: Buffer.from('outside', 'utf8') }],
  }), 'path-unsafe');
  await expectCode(() => inspectNativeSnapshot({
    repository,
    revision: 'HEAD;process.exit(99)',
    openspecRoot,
    change,
    files: canonicalSnapshotFiles(),
  }), 'binding-invalid');
});

test('rejects symlinked dependency roots and incompatible trusted dependency shapes', async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-native-dependency-'));
  t.after(() => rm(temp, { recursive: true, force: true }));

  const linkedRoot = path.join(temp, 'linked-openspec');
  await symlink(pinnedDependencyRoot, linkedRoot, 'dir');
  await expectCode(() => inspectNativeSnapshot({
    repository,
    revision,
    openspecRoot,
    change,
    files: canonicalSnapshotFiles(),
    dependencyRoot: linkedRoot,
  }), 'path-unsafe');

  async function usableRuntime(overrides, name) {
    const root = path.join(temp, name);
    await cp(pinnedDependencyRoot, root, { recursive: true });
    await symlink(path.resolve(pinnedDependencyRoot, '..', '..'), path.join(root, 'node_modules'), 'dir');
    const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    await writeFile(path.join(root, 'package.json'), `${JSON.stringify({ ...packageJson, ...overrides })}\n`);
    return root;
  }

  const wrongVersion = await usableRuntime({ version: '1.11.0' }, 'wrong-version');
  await expectCode(() => inspectNativeSnapshot({
    repository,
    revision,
    openspecRoot,
    change,
    files: canonicalSnapshotFiles(),
    dependencyRoot: wrongVersion,
  }), 'compatibility-error');

  const wrongName = await usableRuntime({ name: '@example/openspec' }, 'wrong-name');
  await expectCode(() => inspectNativeSnapshot({
    repository,
    revision,
    openspecRoot,
    change,
    files: canonicalSnapshotFiles(),
    dependencyRoot: wrongName,
  }), 'compatibility-error');

  const wrongShape = path.join(temp, 'wrong-shape');
  await mkdir(path.join(wrongShape, 'dist', 'core'), { recursive: true });
  await writeFile(path.join(wrongShape, 'package.json'), JSON.stringify({
    name: '@fission-ai/openspec',
    version: '1.12.0',
  }));
  await writeFile(path.join(wrongShape, 'dist', 'core', 'config.js'), 'export const AI_TOOLS = {};\n');
  await expectCode(() => inspectNativeSnapshot({
    repository,
    revision,
    openspecRoot,
    change,
    files: canonicalSnapshotFiles(),
    dependencyRoot: wrongShape,
  }), 'compatibility-error');
});
