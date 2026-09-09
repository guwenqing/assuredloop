import assert from 'node:assert/strict';
import test from 'node:test';

import { checkSynchronization } from '../src/synchronization.js';
import {
  candidateFiles,
  candidateSpec,
  cloneFiles,
  retirementSnapshot,
  snapshot,
  unrelatedCanonicalPath,
  unrelatedSpec,
} from './fixtures/synchronization/fixtures.mjs';

const extraCanonicalPath = 'openspec/specs/unplanned/spec.md';

function withCandidateFiles(args, additions) {
  return {
    ...args,
    candidateFiles: [...cloneFiles(args.candidateFiles), ...additions.map(({ path, content }) => ({
      path,
      content: Buffer.isBuffer(content) ? Buffer.from(content) : Buffer.from(content, 'utf8'),
    }))],
  };
}

function findingText(result) {
  return JSON.stringify(result?.findings ?? []);
}

test('keeps a declared native add valid while retaining the complete candidate source set', async () => {
  const args = snapshot();
  const result = await checkSynchronization(args);

  assert.equal(result.status, 'valid', JSON.stringify(result));
  assert.ok(result.context.sources.some((source) => source.role === 'candidate' && source.path === 'openspec/specs/audit/spec.md'));
  assert.ok(result.context.sources.some((source) => source.role === 'delta' && source.path.includes('/changes/workflow-refresh/')));
});

test('keeps a declared native retirement valid with its unrelated canonical capability', async () => {
  const args = retirementSnapshot();
  const result = await checkSynchronization(args);

  assert.equal(result.status, 'valid', JSON.stringify(result));
  assert.ok(result.context.sources.some((source) => source.role === 'candidate' && source.path === unrelatedCanonicalPath));
  assert.deepEqual(args.candidateFiles.find((file) => file.path === unrelatedCanonicalPath).content, unrelatedSpec);
});

test('does not treat ordinary non-Spec Markdown as an unplanned canonical artifact', async () => {
  const result = await checkSynchronization(withCandidateFiles(snapshot(), [
    { path: 'docs/extra-notes.md', content: '# Review notes\n\nThis is ordinary project documentation.\n' },
  ]));

  assert.equal(result.status, 'valid', JSON.stringify(result));
  assert.ok(result.context.sources.some((source) => source.role === 'candidate' && source.path === 'docs/extra-notes.md'));
});

test('rejects a well-formed canonical Spec added outside the declared base and delta set', async () => {
  const result = await checkSynchronization(withCandidateFiles(snapshot(), [
    { path: extraCanonicalPath, content: candidateSpec },
  ]));

  assert.notEqual(result.status, 'valid', 'an unplanned canonical Spec cannot silently pass synchronization');
  assert.ok(result.context.sources.some((source) => source.role === 'candidate' && source.path === extraCanonicalPath));
  assert.match(findingText(result), /unplanned|candidate|canonical|spec|extra|native|delta/i);
});

test('native-validates a malformed canonical Spec added outside the declared set', async () => {
  const result = await checkSynchronization(withCandidateFiles(snapshot(), [
    { path: extraCanonicalPath, content: 'not a valid canonical specification\n' },
  ]));

  assert.notEqual(result.status, 'valid', 'a malformed unplanned canonical Spec cannot be hidden by expected-set comparison');
  assert.ok(result.context.sources.some((source) => source.role === 'candidate' && source.path === extraCanonicalPath));
  const unaccounted = result.findings.find((finding) => finding.code === 'synchronization-unaccounted-candidate');
  const nativeInvalid = result.findings.find((finding) => finding.code === 'synchronization-native-candidate-invalid');
  assert.ok(unaccounted, 'the malformed file remains an unaccounted candidate-set finding');
  assert.match(unaccounted.message, new RegExp(extraCanonicalPath.replaceAll('/', '\\/')));
  assert.ok(nativeInvalid, 'the malformed file receives a native validation finding');
  assert.match(nativeInvalid.message, new RegExp(extraCanonicalPath.replaceAll('/', '\\/')));
  assert.match(findingText(result), /Purpose|Requirements|validation|invalid/i);
});
