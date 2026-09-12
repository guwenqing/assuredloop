import assert from 'node:assert/strict';
import test from 'node:test';
import { checkSynchronization } from '../src/synchronization.js';
import { snapshot, baseSpec } from './fixtures/synchronization/fixtures.mjs';

const file = (path, content) => ({ path, content: Buffer.isBuffer(content) ? Buffer.from(content) : Buffer.from(content) });
const obsolete = '[Obsolete idea](missing-design.md#retired-heading)\n';
function unchanged({ openspecRoot = 'openspec', extras = [], spec = baseSpec } = {}) {
  const canonical = `${openspecRoot}/specs/audit/spec.md`;
  return snapshot({ openspecRoot, baseFiles: [file(canonical, spec)], candidateFiles: [file(canonical, spec), ...extras],
    deltaFiles: [file(`${openspecRoot}/changes/workflow-refresh/.openspec.yaml`, 'schema: spec-driven\nskip_specs: true\n')] });
}
for (const note of ['.assuredloop/notes/future-work.md', '.assuredloop/notes/drafts/unstructured-idea.md']) {
  test(`default sync excludes obsolete anchored references in optional ${note}`, async () => {
    const input = unchanged({ extras: [file(note, `A tentative thought with no schema, IDs, status or backlinks.\r\n${obsolete}`)] });
    const before = Buffer.from(input.candidateFiles.at(-1).content);
    const result = await checkSynchronization(input);
    assert.equal(result.status, 'valid', JSON.stringify(result.findings));
    assert.deepEqual(input.candidateFiles.at(-1).content, before);
    assert.ok(!result.findings.some((item) => /synchronization-inbound/.test(item.code)));
  });
}
test('an obsolete existing-target heading in conventional notes is excluded by default', async () => {
  const result = await checkSynchronization(unchanged({ extras: [file('.assuredloop/notes/future-work.md', '[old](../../README.md#removed)\n'), file('README.md', '# Current heading\n')] }));
  assert.equal(result.status, 'valid', JSON.stringify(result.findings));
});
for (const formal of ['.assuredloop/README.md', '.assuredloop/notes-archive/future-work.md', '.assuredloop/future-work.md', 'docs/notes/future-work.md']) {
  test(`default sync keeps obsolete reference failure outside exact convention: ${formal}`, async () => {
    const result = await checkSynchronization(unchanged({ extras: [file(formal, obsolete)] }));
    assert.notEqual(result.status, 'valid');
    assert.ok(result.findings.some((item) => /synchronization-inbound/.test(item.code)));
  });
}
test('the same obsolete note link remains a failure in a formal current Spec', async () => {
  const result = await checkSynchronization(unchanged({ spec: Buffer.concat([baseSpec, Buffer.from('\n'+obsolete)]) }));
  assert.notEqual(result.status, 'valid');
  assert.ok(result.findings.some((item) => /synchronization-inbound/.test(item.code)));
});
for (const openspecRoot of ['.assuredloop/notes', '.assuredloop/notes/native']) {
  test(`configured native Spec tree at ${openspecRoot} remains formal despite conventional prefix`, async () => {
    const result = await checkSynchronization(unchanged({ openspecRoot, spec: Buffer.concat([baseSpec, Buffer.from('\n'+obsolete)]) }));
    assert.notEqual(result.status, 'valid');
    assert.ok(result.findings.some((item) => /synchronization-inbound/.test(item.code)), JSON.stringify(result.findings));
  });
}
test('configured formal current Spec under note prefix still receives native requirement validation', async () => {
  const result = await checkSynchronization(unchanged({ openspecRoot: '.assuredloop/notes', spec: '# Informal-looking text is not a valid current Spec.\n' }));
  assert.notEqual(result.status, 'valid');
  assert.ok(result.findings.some((item) => /native-candidate-invalid/.test(item.code)), JSON.stringify(result.findings));
});
test('a formal source referencing a missing note heading still fails its own link check', async () => {
  const result = await checkSynchronization(unchanged({ extras: [file('README.md', '[link](.assuredloop/notes/future-work.md#missing)\n'),
    file('.assuredloop/notes/future-work.md', '# Tentative thought\n')] }));
  assert.notEqual(result.status, 'valid');
  assert.ok(result.findings.some((item) => /synchronization-inbound-anchor/.test(item.code)));
});
test('explicit formal Workflow context inside notes retains its surrounding formal link checks', async () => {
  const formal = `## Workflow context\n\n\`\`\`json\n${JSON.stringify({ head: 'a'.repeat(40), scope: 'submitted verification', result: 'pass', evidence: [{ repository: 'example/consumer', comment_id: 39 }] })}\n\`\`\`\n\n${obsolete}`;
  const result = await checkSynchronization(unchanged({ extras: [file('.assuredloop/notes/submitted-evidence.md', formal)] }));
  assert.notEqual(result.status, 'valid');
  assert.ok(result.findings.some((item) => /inbound|record|context/.test(item.code)), JSON.stringify(result.findings));
});
test('misplaced malformed explicit formal Evidence under notes remains an error', async () => {
  const malformed = '## Workflow context\n\n```json\n{"head":\n```\n';
  const result = await checkSynchronization(unchanged({ extras: [file('.assuredloop/notes/submitted-evidence.md', malformed)] }));
  assert.notEqual(result.status, 'valid');
  assert.ok(result.findings.some((item) => /record|context|formal/.test(item.code)), JSON.stringify(result.findings));
});
test('ordinary notes may quote JSON snippets without creating a formal record or mandatory schema', async () => {
  const note = 'An idea; the example below is only a snippet.\n\n```json\n{"head": "not-a-real-review"}\n```\n\n'+obsolete;
  const result = await checkSynchronization(unchanged({ extras: [file('.assuredloop/notes/future-work.md', note)] }));
  assert.equal(result.status, 'valid', JSON.stringify(result.findings));
});
