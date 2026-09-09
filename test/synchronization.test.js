import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  baseFiles,
  baseRevision,
  baseSpec,
  candidateFiles,
  candidateSpec,
  canonicalPath,
  change,
  cloneFiles,
  customRetirementSchemaYaml,
  customSchemaPath,
  currentReferenceInboundOld,
  currentReferenceInboundPath,
  currentReferenceInboundRepaired,
  deltaPath,
  deltaRevision,
  deltaSpec,
  metadataPath,
  historicalInbound,
  historicalInboundPath,
  historyRelativeInboundOld,
  historyRelativeInboundPath,
  historyRelativeInboundRepaired,
  headRevision,
  linkExamplesPath,
  openspecRoot,
  snapshot,
  staleRevision,
  currentInboundPath,
  currentInboundRepaired,
  retirementBaseFiles,
  retirementBaseSpec,
  retirementBaseSpecWithUnaccountedContent,
  retirementCanonicalPath,
  retirementCandidateFiles,
  retirementDeltaFiles,
  retirementDeltaPath,
  retirementDeltaSpec,
  retirementEmptyBaseSpec,
  retirementEmptyDeltaSpec,
  retirementMalformedBaseSpec,
  retirementMetadata,
  retirementMetadataCustomSchema,
  retirementMetadataInvalidMarker,
  retirementMetadataInvalidSchema,
  retirementMetadataMissingMarker,
  retirementSnapshot,
  repository,
  unrelatedCanonicalPath,
  unrelatedSpec,
} from './fixtures/synchronization/fixtures.mjs';

const require = createRequire(import.meta.url);
const execFile = promisify(execFileCallback);
const pinnedEntry = require.resolve('@fission-ai/openspec');
const pinnedDist = path.dirname(pinnedEntry);
const pinnedDependencyRoot = path.resolve(pinnedDist, '..');
const [{ buildUpdatedSpec, findSpecUpdates }, { Validator }, { extractRequirementsSection, parseDeltaSpec }, { isRetirableSpec }, { readRetireCapabilitiesMarker }] = await Promise.all([
  import(pathToFileURL(path.join(pinnedDist, 'core/specs-apply.js')).href),
  import(pathToFileURL(path.join(pinnedDist, 'core/validation/validator.js')).href),
  import(pathToFileURL(path.join(pinnedDist, 'core/parsers/requirement-blocks.js')).href),
  import(pathToFileURL(path.join(pinnedDist, 'core/archive.js')).href),
  import(pathToFileURL(path.join(pinnedDist, 'utils/change-metadata.js')).href),
]);

const synchronizationUrl = new URL('../src/synchronization.js', import.meta.url);
let synchronization;
let synchronizationLoadError;
try {
  synchronization = await import(synchronizationUrl.href);
} catch (error) {
  synchronizationLoadError = error;
}

function text(content) {
  return Buffer.from(content).toString('utf8');
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function findingText(finding) {
  return `${finding?.code || ''} ${finding?.message || ''} ${JSON.stringify(finding || {})}`;
}

function hasFinding(result, pattern) {
  return Array.isArray(result?.findings) && result.findings.some((finding) => pattern.test(findingText(finding)));
}

function mutableCandidateFiles() {
  return cloneFiles(candidateFiles());
}

function remapRoot(files, root) {
  return files.map((file) => ({
    path: file.path.startsWith(`${openspecRoot}/`) ? `${root}/${file.path.slice(openspecRoot.length + 1)}` : file.path,
    content: Buffer.from(text(file.content).replaceAll(`../${openspecRoot}/`, `../${root}/`), 'utf8'),
  }));
}

function withCanonical(files, content) {
  const result = cloneFiles(files);
  const canonical = result.find((file) => file.path === canonicalPath);
  assert.ok(canonical, 'fixture must include the canonical spec');
  canonical.content = Buffer.from(content, 'utf8');
  return result;
}

function removeAddedRequirement(content) {
  return content.replace(/\n### Requirement: Export audit report[\s\S]*?\n(?=### Requirement:|$)/, '\n');
}

function removeUnicodeScenario(content) {
  return content.replace(/\n#### Scenario: Preserve a Unicode note[\s\S]*?(?=\n### Requirement:|\n*$)/, '\n');
}

function runCheck(args) {
  return synchronization.checkSynchronization({ dependencyRoot: pinnedDependencyRoot, ...args });
}

async function nativeMergedFixture(t, { baseContent = baseSpec, deltaContent = deltaSpec } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-synchronization-native-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const canonical = path.join(root, canonicalPath);
  const delta = path.join(root, deltaPath);
  await mkdir(path.dirname(canonical), { recursive: true });
  await mkdir(path.dirname(delta), { recursive: true });
  await writeFile(canonical, baseContent);
  await writeFile(delta, deltaContent);
  const updates = await findSpecUpdates(
    path.join(root, openspecRoot, 'changes', change),
    path.join(root, openspecRoot, 'specs'),
  );
  assert.equal(updates.length, 1);
  const merged = await buildUpdatedSpec(updates[0], change, { silent: true });
  const validation = await new Validator().validateSpecContent('audit', merged.rebuilt);
  return { merged, validation };
}

async function nativeRetirementFixture(t, {
  baseContent = retirementBaseSpec,
  deltaContent = retirementDeltaSpec,
  metadata = retirementMetadata,
  schema = null,
  includeBase = true,
} = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-synchronization-retirement-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const canonical = path.join(root, retirementCanonicalPath);
  const delta = path.join(root, retirementDeltaPath);
  const metadataFile = path.join(root, metadataPath);
  await mkdir(path.join(root, openspecRoot, 'specs'), { recursive: true });
  if (includeBase) {
    await mkdir(path.dirname(canonical), { recursive: true });
    await writeFile(canonical, baseContent);
  }
  await mkdir(path.dirname(delta), { recursive: true });
  await writeFile(delta, deltaContent);
  if (metadata !== null) await writeFile(metadataFile, metadata);
  if (schema !== null) {
    const schemaFile = path.join(root, customSchemaPath);
    await mkdir(path.dirname(schemaFile), { recursive: true });
    await writeFile(schemaFile, schema);
  }
  const changeDir = path.join(root, openspecRoot, 'changes', change);
  const updates = await findSpecUpdates(changeDir, path.join(root, openspecRoot, 'specs'));
  assert.equal(updates.length, 1);
  const merged = await buildUpdatedSpec(updates[0], change, { silent: true });
  const validation = await new Validator().validateSpecContent('retireable-audit', merged.rebuilt);
  const marker = readRetireCapabilitiesMarker(changeDir);
  const retirable = await isRetirableSpec('retireable-audit', merged.rebuilt);
  return { merged, validation, marker, retirable };
}

async function ambientCustomSchemaResult(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-synchronization-ambient-schema-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const schemaFile = path.join(root, 'openspec', 'schemas', 'retirement-schema', 'schema.yaml');
  await mkdir(path.dirname(schemaFile), { recursive: true });
  await writeFile(schemaFile, customRetirementSchemaYaml);
  const fixtureUrl = new URL('./fixtures/synchronization/fixtures.mjs', import.meta.url).href;
  const script = [
    `import { checkSynchronization } from ${JSON.stringify(synchronizationUrl.href)};`,
    `import { retirementDeltaFiles, retirementMetadataCustomSchema, retirementSnapshot } from ${JSON.stringify(fixtureUrl)};`,
    `const args = retirementSnapshot({ deltaFiles: retirementDeltaFiles({ metadata: retirementMetadataCustomSchema }) });`,
    `const result = await checkSynchronization({ ...args, dependencyRoot: ${JSON.stringify(pinnedDependencyRoot)} });`,
    'process.stdout.write(JSON.stringify(result));',
  ].join('\n');
  const { stdout } = await execFile(process.execPath, ['--input-type=module', '-e', script], {
    cwd: path.resolve(new URL('..', import.meta.url).pathname),
    env: { ...process.env, XDG_DATA_HOME: root, XDG_CONFIG_HOME: path.join(root, 'config') },
    maxBuffer: 4 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

async function expectCode(operation, code) {
  await assert.rejects(operation, (error) => {
    assert.equal(error?.code, code);
    return true;
  });
}

test('synchronization module exposes the planned API', () => {
  assert.ifError(synchronizationLoadError, `Issue #8 synchronization runtime is unavailable; expected src/synchronization.js before behavioral tests: ${synchronizationLoadError?.message}`);
  assert.equal(typeof synchronization.checkSynchronization, 'function');
});

test('the fixture uses the pinned OpenSpec 1.12.0 native merge as its oracle', async (t) => {
  const packageJson = JSON.parse(await readFile(path.join(pinnedDependencyRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.name, '@fission-ai/openspec');
  assert.equal(packageJson.version, '1.12.0');

  const plan = parseDeltaSpec(text(deltaSpec));
  assert.equal(plan.added.length, 1);
  assert.equal(plan.modified.length, 1);
  assert.equal(plan.removed.length, 1);
  assert.equal(plan.renamed.length, 1);
  const merged = await nativeMergedFixture(t);
  assert.deepEqual(merged.merged.counts, { added: 1, modified: 1, removed: 1, renamed: 1 });
  assert.equal(merged.validation.valid, true, JSON.stringify(merged.validation));
  assert.deepEqual(Buffer.from(merged.merged.rebuilt), candidateSpec);
});

test('the pinned native retirement composition requires the marker and last-removal shape', async (t) => {
  const packageJson = JSON.parse(await readFile(path.join(pinnedDependencyRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.version, '1.12.0');
  const plan = parseDeltaSpec(text(retirementDeltaSpec));
  assert.equal(plan.removed.length, 1);
  const retirement = await nativeRetirementFixture(t);
  assert.deepEqual(retirement.merged.counts, { added: 0, modified: 0, removed: 1, renamed: 0 });
  assert.equal(retirement.merged.noRequirementBlocks, true);
  assert.deepEqual(retirement.merged.unaccountedContent, []);
  assert.equal(retirement.validation.valid, false);
  assert.ok(retirement.validation.issues.some((issue) => /at least one requirement/i.test(issue.message)));
  assert.deepEqual(retirement.marker, { declared: true });
  assert.equal(retirement.retirable, true);
  const skipped = await nativeRetirementFixture(t, { includeBase: false });
  assert.deepEqual(skipped.merged.counts, { added: 0, modified: 0, removed: 0, renamed: 0 });
  assert.equal(skipped.merged.noRequirementBlocks, true);
  assert.equal(skipped.retirable, true);
  const custom = await nativeRetirementFixture(t, {
    metadata: retirementMetadataCustomSchema,
    schema: customRetirementSchemaYaml,
  });
  assert.deepEqual(custom.marker, { declared: true });
  assert.equal(custom.retirable, true);
});

const behavioralTest = (name, callback) => test(name, { skip: synchronizationLoadError ? `surface absent: ${synchronizationLoadError.message}` : false }, callback);

behavioralTest('accepts the complete native delta against a candidate without the active change path', async () => {
  const args = snapshot();
  assert.equal(args.candidateFiles.some((file) => file.path === deltaPath), false);
  const result = await runCheck(args);

  assert.equal(result.status, 'valid');
  assert.ok(Array.isArray(result.findings));
  assert.ok(result.context && typeof result.context === 'object');
  assert.match(JSON.stringify(result.context), new RegExp(`${baseRevision}|${headRevision}|${deltaRevision}`));
  assert.ok(hasFinding(result, /semantic|meaning|human|review|not.*proof/i), 'structural synchronization must disclose the semantic review boundary');
  assert.equal(text(args.candidateFiles.find((file) => file.path === canonicalPath).content), text(candidateSpec));

  const current = args.candidateFiles.find((file) => file.path === currentInboundPath);
  assert.deepEqual(current.content, currentInboundRepaired);
  const currentReference = args.candidateFiles.find((file) => file.path === currentReferenceInboundPath);
  assert.deepEqual(currentReference.content, currentReferenceInboundRepaired);
  const history = args.candidateFiles.find((file) => file.path === historicalInboundPath);
  assert.deepEqual(history.content, historicalInbound);
  assert.doesNotMatch(text(history.content), /stable-audit-links/);
  assert.match(text(history.content), new RegExp(`${baseRevision}.*requirement-audit-links`));
  const historyRelative = args.candidateFiles.find((file) => file.path === historyRelativeInboundPath);
  assert.deepEqual(historyRelative.content, historyRelativeInboundRepaired);
});

behavioralTest('preserves unchanged canonical requirements and scenarios', async () => {
  const result = await runCheck(snapshot());

  assert.equal(result.status, 'valid');
  const baseBlock = extractRequirementsSection(text(baseSpec)).bodyBlocks.find((block) => block.name === 'Preserve unrelated contract');
  const candidateBlock = extractRequirementsSection(text(candidateSpec)).bodyBlocks.find((block) => block.name === 'Preserve unrelated contract');
  assert.ok(baseBlock && candidateBlock);
  assert.equal(candidateBlock.raw, baseBlock.raw);
  assert.match(candidateBlock.raw, /#### Scenario: Keep unrelated behavior/);
});

behavioralTest('keeps fixed source provenance and does not mutate snapshot inputs', async () => {
  const args = snapshot();
  const before = {
    baseFiles: cloneFiles(args.baseFiles),
    candidateFiles: cloneFiles(args.candidateFiles),
    deltaFiles: cloneFiles(args.deltaFiles),
  };
  const result = await runCheck(args);

  assert.equal(result.status, 'valid');
  assert.deepEqual(args.baseFiles, before.baseFiles);
  assert.deepEqual(args.candidateFiles, before.candidateFiles);
  assert.deepEqual(args.deltaFiles, before.deltaFiles);
  assert.ok(Array.isArray(result.context.sources));
  for (const [role, files, revision] of [
    ['base', args.baseFiles, baseRevision],
    ['candidate', args.candidateFiles, headRevision],
    ['delta', args.deltaFiles, deltaRevision],
  ]) {
    for (const file of files) {
      const source = result.context.sources.find((entry) => entry.role === role && entry.path === file.path);
      assert.deepEqual(source && {
        repository: source.repository,
        revision: source.revision,
        path: source.path,
        sha256: source.sha256,
      }, {
        repository,
        revision,
        path: file.path,
        sha256: sha256(file.content),
      });
    }
  }
});

behavioralTest('supports a non-default native root while retaining fixed snapshot paths', async () => {
  const root = 'workflow-spec';
  const remappedBase = remapRoot(baseFiles(), root);
  const remappedCandidate = remapRoot(candidateFiles(), root);
  const remappedDelta = remapRoot([{ path: deltaPath, content: deltaSpec }], root);
  const result = await runCheck(snapshot({
    openspecRoot: root,
    baseFiles: remappedBase,
    candidateFiles: remappedCandidate,
    deltaFiles: remappedDelta,
  }));

  assert.equal(result.status, 'valid');
  const suppliedPaths = new Set([...remappedBase, ...remappedCandidate, ...remappedDelta].map((file) => file.path));
  const sourcePaths = new Set(result.context.sources.map((source) => source.path));
  assert.deepEqual(sourcePaths, suppliedPaths);
  const nativeSources = result.context.sources.filter((source) =>
    source.path.includes('/specs/') || source.path.includes('/changes/'));
  assert.ok(nativeSources.length > 0);
  assert.ok(nativeSources.every((source) => source.path.startsWith(`${root}/`)));
  assert.ok(result.context.sources.some((source) => source.path === 'docs/current-links.md'));
  assert.ok(result.context.sources.some((source) => source.path === 'history/immutable-review.md'));
});

behavioralTest('ignores stale-looking links inside fenced and inline code examples', async () => {
  const result = await runCheck(snapshot());

  assert.equal(result.status, 'valid');
  assert.ok(result.context.sources.some((source) => source.path === linkExamplesPath));
});

behavioralTest('rejects a candidate that omits an accepted delta operation', async () => {
  const files = mutableCandidateFiles();
  const canonical = files.find((file) => file.path === canonicalPath);
  canonical.content = Buffer.from(removeAddedRequirement(text(canonical.content)), 'utf8');
  const result = await runCheck(snapshot({ candidateFiles: files }));

  assert.equal(result.status, 'invalid');
  assert.ok(hasFinding(result, /missing|omitted|unaccounted|coverage|added|delta/i), JSON.stringify(result.findings));
});

behavioralTest('rejects native scenario loss in a modified requirement', async () => {
  const result = await runCheck(snapshot({
    candidateFiles: withCanonical(candidateFiles(), removeUnicodeScenario(text(candidateSpec))),
  }));

  assert.equal(result.status, 'invalid');
  assert.ok(hasFinding(result, /scenario|preserve a unicode note|loss|dropped/i), JSON.stringify(result.findings));
});

behavioralTest('checks relative inbound links inside history-named directories', async () => {
  const files = mutableCandidateFiles();
  const historyRelative = files.find((file) => file.path === historyRelativeInboundPath);
  historyRelative.content = historyRelativeInboundOld;
  const result = await runCheck(snapshot({ candidateFiles: files }));

  assert.equal(result.status, 'invalid');
  assert.ok(hasFinding(result, /inbound|anchor|link|reference|rename/i), JSON.stringify(result.findings));
});

behavioralTest('checks reference-style current inbound links', async () => {
  const files = mutableCandidateFiles();
  const currentReference = files.find((file) => file.path === currentReferenceInboundPath);
  currentReference.content = currentReferenceInboundOld;
  const result = await runCheck(snapshot({ candidateFiles: files }));

  assert.equal(result.status, 'invalid');
  assert.ok(hasFinding(result, /inbound|anchor|link|reference|rename/i), JSON.stringify(result.findings));
});

behavioralTest('accepts explicit last-requirement retirement and preserves unrelated specs', async () => {
  const args = retirementSnapshot();
  assert.equal(args.candidateFiles.some((file) => file.path === retirementCanonicalPath), false);
  const result = await runCheck(args);

  assert.equal(result.status, 'valid');
  assert.ok(hasFinding(result, /retir|capability|delete|native/i), JSON.stringify(result.findings));
  const unrelated = result.context.sources.find((source) => source.path === unrelatedCanonicalPath && source.role === 'candidate');
  assert.ok(unrelated, 'the unrelated candidate spec must remain in the assessed snapshot');
  assert.deepEqual(args.candidateFiles.find((file) => file.path === unrelatedCanonicalPath).content, unrelatedSpec);
});

behavioralTest('rejects last-requirement removal without the native retirement marker', async () => {
  const result = await runCheck(retirementSnapshot({
    deltaFiles: retirementDeltaFiles({ metadata: retirementMetadataMissingMarker }),
  }));

  assert.equal(result.status, 'invalid');
  assert.ok(hasFinding(result, /retir|marker|authoriz|delete|requirement/i), JSON.stringify(result.findings));
});

behavioralTest('rejects an invalid retirement schema marker', async () => {
  const result = await runCheck(retirementSnapshot({
    deltaFiles: retirementDeltaFiles({ metadata: retirementMetadataInvalidSchema }),
  }));

  assert.equal(result.status, 'invalid');
  assert.ok(hasFinding(result, /retir|marker|schema|metadata|authoriz/i), JSON.stringify(result.findings));
});

behavioralTest('rejects a custom retirement schema when its fixed snapshot artifact is missing', async () => {
  const result = await runCheck(retirementSnapshot({
    deltaFiles: retirementDeltaFiles({ metadata: retirementMetadataCustomSchema }),
  }));

  assert.equal(result.status, 'invalid');
  assert.ok(hasFinding(result, /schema|metadata|missing|unavailable|retir/i), JSON.stringify(result.findings));
});

behavioralTest('accepts a custom retirement schema supplied in the fixed delta snapshot', async () => {
  const result = await runCheck(retirementSnapshot({
    deltaFiles: retirementDeltaFiles({
      metadata: retirementMetadataCustomSchema,
      schema: customRetirementSchemaYaml,
    }),
  }));

  assert.equal(result.status, 'valid');
  assert.ok(hasFinding(result, /retir|capability|native/i), JSON.stringify(result.findings));
  assert.ok(result.context.sources.some((source) => source.path === customSchemaPath && source.role === 'delta'));
});

behavioralTest('does not depend on delta metadata and schema file ordering', async () => {
  const delta = retirementDeltaFiles({
    metadata: retirementMetadataCustomSchema,
    schema: customRetirementSchemaYaml,
  }).reverse();
  const result = await runCheck(retirementSnapshot({ deltaFiles: delta }));

  assert.equal(result.status, 'valid');
});

behavioralTest('does not authorize a missing snapshot schema from an ambient override', async (t) => {
  const result = await ambientCustomSchemaResult(t);

  assert.notEqual(result.status, 'valid');
  assert.ok(hasFinding(result, /schema|snapshot|missing|unavailable|metadata/i), JSON.stringify(result.findings));
});

behavioralTest('rejects an invalid retirement marker value', async () => {
  const result = await runCheck(retirementSnapshot({
    deltaFiles: retirementDeltaFiles({ metadata: retirementMetadataInvalidMarker }),
  }));

  assert.equal(result.status, 'invalid');
  assert.ok(hasFinding(result, /retir|marker|metadata|boolean|authoriz/i), JSON.stringify(result.findings));
});

behavioralTest('rejects retirement when native merge cannot account for remaining content', async () => {
  const result = await runCheck(retirementSnapshot({
    baseFiles: retirementBaseFiles({ content: retirementBaseSpecWithUnaccountedContent }),
  }));

  assert.equal(result.status, 'invalid');
  assert.ok(hasFinding(result, /unaccounted|content|retir|delete/i), JSON.stringify(result.findings));
});

behavioralTest('rejects retirement when another native validation error remains', async () => {
  const result = await runCheck(retirementSnapshot({
    baseFiles: retirementBaseFiles({ content: retirementMalformedBaseSpec }),
  }));

  assert.equal(result.status, 'invalid');
  assert.ok(hasFinding(result, /native|validation|purpose|requirements|retir/i), JSON.stringify(result.findings));
});

behavioralTest('rejects a preexisting empty capability when this run removes nothing', async () => {
  const result = await runCheck(retirementSnapshot({
    baseFiles: retirementBaseFiles({ content: retirementEmptyBaseSpec }),
  }));

  assert.equal(result.status, 'invalid');
  assert.ok(hasFinding(result, /empty|no.*remov|preexist|retir|requirement/i), JSON.stringify(result.findings));
});

behavioralTest('rejects an empty delta as synchronization evidence', async () => {
  const result = await runCheck(snapshot({
    deltaFiles: [{ path: deltaPath, content: retirementEmptyDeltaSpec }],
    candidateFiles: candidateFiles(),
  }));

  assert.equal(result.status, 'invalid');
  assert.ok(hasFinding(result, /empty|no.*operation|delta|native|requirement/i), JSON.stringify(result.findings));
});

behavioralTest('accepts native reapplication when the base is already synchronized', async () => {
  const alreadySynchronized = candidateFiles();
  const result = await runCheck(snapshot({
    baseFiles: cloneFiles(alreadySynchronized),
    candidateFiles: cloneFiles(alreadySynchronized),
  }));

  assert.equal(result.status, 'valid');
});

behavioralTest('accepts native retirement skip when the capability is already absent', async () => {
  const unrelatedOnly = [{ path: unrelatedCanonicalPath, content: unrelatedSpec }];
  const result = await runCheck(retirementSnapshot({
    baseFiles: cloneFiles(unrelatedOnly),
    candidateFiles: cloneFiles(unrelatedOnly),
  }));

  assert.equal(result.status, 'valid');
  assert.ok(hasFinding(result, /retir|skip|already|native/i), JSON.stringify(result.findings));
});

behavioralTest('requires absence of the canonical spec after a native retirement', async () => {
  const result = await runCheck(retirementSnapshot({
    candidateFiles: retirementCandidateFiles({ includeRetired: true }),
  }));

  assert.equal(result.status, 'invalid');
  assert.ok(hasFinding(result, /retir|delete|present|canonical|requirement/i), JSON.stringify(result.findings));
});

behavioralTest('fails when trusted live freshness reports a stale base', async () => {
  const result = await runCheck(snapshot({ observedBaseRevision: staleRevision }));

  assert.equal(result.status, 'invalid');
  assert.ok(hasFinding(result, /stale|base.*mismatch|mismatch.*base|fresh/i), JSON.stringify(result.findings));
});

behavioralTest('labels missing live freshness as a bounded snapshot limit', async () => {
  const args = snapshot();
  delete args.observedBaseRevision;
  const result = await runCheck(args);

  assert.equal(result.status, 'valid');
  assert.ok(hasFinding(result, /snapshot|freshness|live|observed|unavailable/i), JSON.stringify(result.findings));
  assert.doesNotMatch(JSON.stringify(result), /(?:live|base).*fresh(?:ness)?\s*(?:verified|accepted)/i);
});

behavioralTest('reports malformed native candidate content as invalid', async () => {
  const malformed = '## Purpose\nThis candidate is intentionally missing its Requirements section.\n';
  const result = await runCheck(snapshot({ candidateFiles: withCanonical(candidateFiles(), malformed) }));

  assert.equal(result.status, 'invalid');
  assert.ok(hasFinding(result, /native|validation|malformed|requirements/i), JSON.stringify(result.findings));
});

behavioralTest('reports malformed native delta content as invalid', async () => {
  const malformed = Buffer.from(`## MODIFIED Requirements
### Requirement: Record audit changes
The system SHALL retain every account audit change but this delta omits its scenarios.
`, 'utf8');
  const result = await runCheck(snapshot({ deltaFiles: [{ path: deltaPath, content: malformed }] }));

  assert.equal(result.status, 'invalid');
  assert.ok(hasFinding(result, /native|validation|malformed|scenario|delta/i), JSON.stringify(result.findings));
});

behavioralTest('reports missing native delta artifacts as unavailable', async () => {
  const result = await runCheck(snapshot({ deltaFiles: [] }));

  assert.equal(result.status, 'unavailable');
  assert.ok(hasFinding(result, /unavailable|missing|delta|artifact|snapshot/i), JSON.stringify(result.findings));
});

behavioralTest('reports a missing canonical candidate artifact as unavailable', async () => {
  const candidate = candidateFiles().filter((file) => file.path !== canonicalPath);
  const result = await runCheck(snapshot({ candidateFiles: candidate }));

  assert.equal(result.status, 'unavailable');
  assert.ok(hasFinding(result, /unavailable|missing|canonical|spec|artifact|snapshot/i), JSON.stringify(result.findings));
});

behavioralTest('rejects unsafe snapshot paths before native inspection', async () => {
  const unsafe = { path: '../openspec/specs/audit/spec.md', content: candidateSpec };
  await expectCode(runCheck(snapshot({ candidateFiles: [...candidateFiles(), unsafe] })), 'path-unsafe');
});
