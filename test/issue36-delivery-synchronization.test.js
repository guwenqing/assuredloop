import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSynchronization } from '../src/synchronization.js';
import { snapshot, canonicalPath, baseSpec, metadataPath, deltaFiles, candidateFiles, customSchemaPath, customRetirementSchemaYaml, retirementSnapshot } from './fixtures/synchronization/fixtures.mjs';

const file = (path, content) => ({ path, content: Buffer.isBuffer(content) ? content : Buffer.from(content) });
const baseline = () => [file(canonicalPath, baseSpec)];
function noSpecs(overrides = {}) {
  return snapshot({ baseFiles: baseline(), candidateFiles: baseline(),
    deltaFiles: [file(metadataPath, 'schema: spec-driven\nskip_specs: true\n')], ...overrides });
}
const diagnostic = (result) => JSON.stringify(result.findings);

for (const empty of [false, true]) test(`issue36 delivery: accepted native skip verifies ${empty ? 'empty' : 'complete'} unchanged baseline`, async () => {
  const input = noSpecs(empty ? { baseFiles: [], candidateFiles: [] } : {});
  const result = await checkSynchronization(input);
  assert.equal(result.status, 'valid', diagnostic(result));
  assert.equal(result.mode, 'no-spec-change');
  for (const key of ['baseRevision', 'headRevision', 'deltaRevision']) assert.equal(result.context[key], input[key]);
  assert.ok(result.findings.some((finding) => /review/.test(finding.code)), 'no-spec result retains semantic review obligation');
});

test('issue36 delivery: skip metadata resolves the supplied custom native schema at the selected root', async () => {
  const input = noSpecs({ deltaFiles: [file(metadataPath, 'schema: retirement-schema\nskip_specs: true\n'), file(customSchemaPath, customRetirementSchemaYaml)] });
  input.openspecRoot = 'native';
  for (const key of ['baseFiles', 'candidateFiles', 'deltaFiles']) input[key] = input[key].map((entry) => ({ ...entry, path: entry.path.replace(/^openspec\//, 'native/') }));
  const result = await checkSynchronization(input);
  assert.equal(result.status, 'valid', diagnostic(result));
  assert.equal(result.mode, 'no-spec-change');
});

for (const [name, marker] of Object.entries({ absent: null, false: 'schema: spec-driven\nskip_specs: false\n', malformed: 'schema: spec-driven\nskip_specs: yes\n', unknown: 'schema: nonexistent-issue36-schema\nskip_specs: true\n', brokenYaml: 'schema: [\nskip_specs: true\n' })) {
  test(`issue36 delivery: ${name} skip declaration does not waive missing delta`, async () => {
    const result = await checkSynchronization(noSpecs({ deltaFiles: marker === null ? [] : [file(metadataPath, marker)] }));
    assert.notEqual(result.status, 'valid', diagnostic(result));
    assert.notEqual(result.mode, 'no-spec-change');
  });
}

test('issue36 delivery: candidate-only skip is not accepted fixed metadata', async () => {
  const result = await checkSynchronization(noSpecs({ deltaFiles: [], candidateFiles: [...baseline(), file(metadataPath, 'schema: spec-driven\nskip_specs: true\n')] }));
  assert.notEqual(result.status, 'valid', diagnostic(result));
});

for (const [name, candidate] of Object.entries({
  purpose: [file(canonicalPath, baseSpec.toString().replace('This capability keeps', 'This changed capability keeps'))],
  newline: [file(canonicalPath, baseSpec.toString().replaceAll('\n', '\r\n'))],
  added: [...baseline(), file('openspec/specs/extra/spec.md', baseSpec)],
  removed: [],
  renamed: [file('openspec/specs/renamed/spec.md', baseSpec)],
})) test(`issue36 delivery: skip rejects ${name} baseline drift with mechanical comparison`, async () => {
  const result = await checkSynchronization(noSpecs({ candidateFiles: candidate }));
  assert.equal(result.status, 'invalid', diagnostic(result));
});

test('issue36 delivery: skip cannot hide native delta artifacts', async () => {
  const result = await checkSynchronization(noSpecs({ deltaFiles: [...noSpecs().deltaFiles, ...deltaFiles()], candidateFiles: candidateFiles() }));
  assert.equal(result.status, 'invalid', diagnostic(result));
  assert.match(diagnostic(result), /contradict|skip/i);
});

test('issue36 delivery: skip cannot coexist with retirement intent even without delta', async () => {
  const result = await checkSynchronization(noSpecs({ deltaFiles: [file(metadataPath, 'schema: spec-driven\nskip_specs: true\nretire_capabilities: true\n')] }));
  assert.equal(result.status, 'invalid', diagnostic(result));
  assert.match(diagnostic(result), /contradict|retire/i);
});

test('issue36 delivery: skip cannot coexist with native retirement artifacts', async () => {
  const input = retirementSnapshot();
  input.deltaFiles.find((entry) => entry.path === metadataPath).content = Buffer.from('schema: spec-driven\nskip_specs: true\nretire_capabilities: true\n');
  const result = await checkSynchronization(input);
  assert.equal(result.status, 'invalid', diagnostic(result));
});

test('issue36 delivery: skip still validates native baseline and inbound links', async () => {
  const invalid = [file(canonicalPath, 'Invalid native spec\n')];
  const malformed = await checkSynchronization(noSpecs({ baseFiles: invalid, candidateFiles: invalid }));
  assert.equal(malformed.status, 'invalid', diagnostic(malformed));
  const brokenLink = await checkSynchronization(noSpecs({ candidateFiles: [...baseline(), file('docs/current.md', '[missing](../openspec/specs/audit/spec.md#missing-heading)\n')] }));
  assert.equal(brokenLink.status, 'invalid', diagnostic(brokenLink));
});

test('issue36 delivery: ordinary native nonempty delta behavior remains valid', async () => {
  const result = await checkSynchronization(snapshot());
  assert.equal(result.status, 'valid', diagnostic(result));
  assert.notEqual(result.mode, 'no-spec-change');
});

test('issue36 delivery: accepted skip preserves destination freshness', async () => {
  const result = await checkSynchronization(noSpecs({ observedBaseRevision: '9'.repeat(40) }));
  assert.equal(result.status, 'invalid', diagnostic(result));
  assert.ok(result.findings.some((finding) => finding.code === 'synchronization-stale-base'));
});
