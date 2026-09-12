import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { validateRecord, hasReviewDeclarations } from '../src/records.js';
import { planInitialization } from '../src/adoption.js';
import { config, evidence, initializationFixture } from './fixtures/issue37-records/helpers.mjs';

for (const additional of ['on-request', 'required']) {
  test(`routing record accepts explicit ${additional} with consumer model choice`, () => {
    const value = config({ routing: { primary_tool: 'codex', additional } });
    assert.deepEqual(validateRecord('config', value), { valid: true, errors: [] });
  });
}
test('raw tool strings are structural declarations, not native registry qualification', () => {
  assert.equal(validateRecord('config', config({ routing: { primary_tool: 'future-native-tool', additional: 'on-request' } })).valid, true);
  assert.equal(validateRecord('evidence', evidence({ review_tool: 'future-native-tool' })).valid, true);
});
for (const [name, routing] of Object.entries({ missingPrimary: { additional: 'on-request' }, missingAdditional: { primary_tool: 'codex' }, emptyPrimary: { primary_tool: '', additional: 'required' }, unknownAdditional: { primary_tool: 'codex', additional: 'sometimes' }, unknownField: { primary_tool: 'codex', additional: 'required', provider: 'guessed' }, null: null })) {
  test(`routing shape rejects ${name}`, () => {
    const value = config(); value.project.review.routing = routing;
    assert.equal(validateRecord('config', value).valid, false);
  });
}
for (const kind of ['internal', 'external']) {
  test(`Evidence accepts optional ${kind} role and tool with full review declaration`, () => {
    assert.deepEqual(validateRecord('evidence', evidence({ review_kind: kind })), { valid: true, errors: [] });
  });
}
for (const omitted of ['review_kind', 'review_tool']) {
  test(`Evidence shape leaves ${omitted} optional before contextual qualification`, () => {
    const value = evidence(); delete value[omitted];
    assert.equal(validateRecord('evidence', value).valid, true);
  });
}
for (const marker of ['review_kind', 'review_tool']) {
  test(`${marker} is a review marker requiring the existing full reviewer declaration`, () => {
    const value = { head: 'a'.repeat(40), scope: 'routing change', result: 'pass', evidence: [{ repository: 'example/consumer', comment_id: 37 }], [marker]: marker === 'review_kind' ? 'internal' : 'codex' };
    assert.equal(hasReviewDeclarations(value), true);
    const checked = validateRecord('evidence', value);
    assert.equal(checked.valid, false);
    for (const field of ['producer_session', 'reviewer_session', 'reviewer_model', 'review_depth']) {
      assert.ok(checked.errors.some((error) => error.keyword === 'required' && error.params?.missingProperty === field), JSON.stringify(checked.errors));
    }
  });
}
for (const [name, overrides] of Object.entries({ unknownKind: { review_kind: 'provider' }, emptyTool: { review_tool: '' }, nonStringTool: { review_tool: ['codex'] }, unknownField: { inferred_provider: 'model-vendor' } })) {
  test(`Evidence rejects ${name}`, () => assert.equal(validateRecord('evidence', evidence(overrides)).valid, false));
}
test('legacy records and configs remain structurally valid with no invented routing', () => {
  const value = evidence(); delete value.review_kind; delete value.review_tool;
  assert.equal(validateRecord('evidence', value).valid, true);
  assert.equal(validateRecord('config', config({ routing: null })).valid, true);
});
for (const tools of [['codex'], ['codex', 'gemini']]) {
  test(`init preserves explicitly selected routing for ${tools.length} native tools`, async (t) => {
    const fixture = await initializationFixture(t, { tools });
    const before = structuredClone(fixture.config);
    const result = await planInitialization(fixture);
    assert.equal(result.status, 'preview');
    const planned = JSON.parse(result.files.find((file) => file.path === '.assuredloop/config.json').content);
    assert.deepEqual(planned, before);
    assert.deepEqual(fixture.config, before);
    await assert.rejects(readFile(path.join(fixture.targetRoot, '.assuredloop/config.json')));
  });
}
test('init rejects a supported primary tool that the consumer did not select', async (t) => {
  const fixture = await initializationFixture(t, { routing: { primary_tool: 'gemini', additional: 'required' } });
  await assert.rejects(planInitialization(fixture), (error) => /primary|selected/i.test(JSON.stringify({ code: error.code, message: error.message, details: error.details })));
});
test('init rejects unsupported primary native ID contextually', async (t) => {
  const fixture = await initializationFixture(t, { tools: ['future-native-tool'], routing: { primary_tool: 'future-native-tool', additional: 'required' } });
  await assert.rejects(planInitialization(fixture), (error) => /unsupported|supported|registry/i.test(JSON.stringify({ code: error.code, message: error.message, details: error.details })));
});
test('legacy init with several tools remains accepted and reports absent routing without choosing one', async (t) => {
  const fixture = await initializationFixture(t, { routing: null, tools: ['codex', 'gemini'] });
  const result = await planInitialization(fixture);
  assert.equal(result.status, 'preview');
  assert.ok(result.diagnostics.some((item) => /routing/i.test(JSON.stringify(item)) && /not.configured|absent|unconfigured/i.test(JSON.stringify(item))), JSON.stringify(result.diagnostics));
  const saved = JSON.parse(result.files.find((file) => file.path === '.assuredloop/config.json').content);
  assert.equal(Object.hasOwn(saved.project.review, 'routing'), false);
});
