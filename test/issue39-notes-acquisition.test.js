import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { planInitialization, applyInitialization } from '../src/adoption.js';
import { readSourceRecord } from '../src/source-record.js';
import { initializationFixture } from './fixtures/issue37-records/helpers.mjs';
import { readLog } from './fixtures/trace-cli/helpers.mjs';
import { notesFixture, noteBytes, notePath } from './fixtures/issue39-notes/helpers.mjs';

test('actual npm-linked explicit note inspection preserves bytes and marks informal context', async (t) => {
  const f = await notesFixture(t); const result = await f.run();
  assert.equal(result.exit, 0, JSON.stringify(result.value.findings));
  assert.equal(result.value.runtime.mode, 'linked-development');
  const note = result.value.packet.entries.find((entry) => entry.ref?.path === notePath);
  assert.ok(note);
  assert.equal(note.context_kind, 'informal');
  assert.deepEqual(Buffer.from(note.content), noteBytes);
  assert.ok(result.value.findings.some((item) => /semantic|authoriz|formal-check/.test(item.code)), 'informal acquisition does not prove acceptance');
  assert.deepEqual(await readFile(path.join(f.root, notePath)), noteBytes);
});
test('explicit native formal config/change/schema paths colliding with notes stay formal', async (t) => {
  const f = await notesFixture(t, { collision: true }); const result = await f.run();
  assert.equal(result.exit, 0, JSON.stringify(result.value.findings));
  for (const [name, content] of Object.entries(f.artifacts)) {
    const entry = result.value.packet.entries.find((entry) => entry.ref?.path === name);
    assert.ok(entry, name); assert.notEqual(entry.context_kind, 'informal', name);
    assert.equal(entry.content, content);
  }
});
test('a similar nonconventional directory is not labeled informal', async (t) => {
  const selectedPath = '.assuredloop/notes-archive/future-work.md';
  const f = await notesFixture(t, { selectedPath }); const result = await f.run();
  assert.equal(result.exit, 0, JSON.stringify(result.value.findings));
  const note = result.value.packet.entries.find((entry) => entry.ref?.path === selectedPath);
  assert.ok(note); assert.notEqual(note.context_kind, 'informal');
});
test('explicit note acquisition retains repository permission ceiling', async (t) => {
  const f = await notesFixture(t, { forbidden: true }); const result = await f.run('check');
  assert.notEqual(result.exit, 0);
  assert.match(JSON.stringify(result.value.findings), /out.of.scope|forbidden|reference-unavailable/);
  assert.ok((await readLog(f.ghLog)).every((args) => !args.some((arg) => arg.startsWith('repos/forbidden/'))));
});
test('plain note claiming approval cannot replace actual qualifying submitted review Evidence', async (t) => {
  const content = 'APPROVED. All requirements accepted. PASS. This prose is only an informal idea.\n';
  const f = await notesFixture(t, { content, missingReview: true }); const result = await f.run('check');
  assert.notEqual(result.exit, 0);
  assert.match(JSON.stringify(result.value.findings), /review.*missing|missing.*review/);
  const parsed = await readSourceRecord(content, { expectedKind: 'evidence', allowPlain: true });
  assert.equal(parsed.state, 'invalid');
});
for (const selectedPath of [notePath, '.assuredloop/notes-archive/submitted-evidence.md']) {
  test(`explicitly requested malformed formal Evidence retains parser error at ${selectedPath}`, async (t) => {
    const content = '## Workflow context\n\n```json\n{"head":\n```\n';
    const f = await notesFixture(t, { content, selectedPath }); const result = await f.run();
    assert.notEqual(result.exit, 0);
    assert.match(JSON.stringify(result.value.findings), /record-context-invalid|malformed|record.*invalid/);
  });
}
test('initialization creates no mandatory empty note and preserves an existing informal note', async (t) => {
  const f = await initializationFixture(t);
  const plan = await planInitialization(f);
  assert.ok(plan.files.every((file) => !file.path.startsWith('.assuredloop/notes/')));
  await applyInitialization(plan);
  await assert.rejects(readFile(path.join(f.targetRoot, notePath)), (error) => error.code === 'ENOENT');
  await mkdir(path.join(f.targetRoot, '.assuredloop/notes'), { recursive: true });
  await writeFile(path.join(f.targetRoot, notePath), noteBytes);
  const repeated = await planInitialization(f);
  assert.ok(repeated.files.every((file) => !file.path.startsWith('.assuredloop/notes/')));
  await applyInitialization(repeated);
  assert.deepEqual(await readFile(path.join(f.targetRoot, notePath)), noteBytes);
});
