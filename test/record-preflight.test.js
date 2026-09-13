import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { readRecordBody } from '../src/record-body.js';
import { validateRecord } from '../src/records.js';

const cliPath = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const verdicts = ['pass', 'fail', 'revise', 'incomplete'];
const fixtures = Object.fromEntries(await Promise.all(['evidence', 'issue', 'pr'].map(async (kind) => [
  kind, JSON.parse(await readFile(new URL(`../templates/records/${kind}.json`, import.meta.url), 'utf8')),
])));

function bodyFor(record, heading = '## Workflow context') {
  return `${heading}\n\n\`\`\`json\n${JSON.stringify(record, null, 2)}\n\`\`\`\n`;
}

async function consumer(t, { sentinels = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-record-preflight-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = path.join(root, 'bin');
  const log = path.join(root, 'external-calls.log');
  await mkdir(bin);
  if (sentinels) {
    for (const name of ['gh', 'git', 'curl', 'wget', 'npm', 'openspec']) {
      await writeFile(path.join(bin, name), '#!/bin/sh\nprintf "%s\\n" "$0 $*" >> "$PREFLIGHT_EXTERNAL_LOG"\nexit 97\n', { mode: 0o755 });
    }
  }
  return { root, bin, log };
}

async function runValidation(fixture, { body, kind = 'evidence', expectedRecord } = {}) {
  const bodyPath = path.join(fixture.root, 'publication.md');
  await writeFile(bodyPath, body);
  const args = [cliPath, 'validate', '--kind', kind, '--file', bodyPath];
  if (expectedRecord !== undefined) {
    const recordPath = path.join(fixture.root, 'intended-record.json');
    await writeFile(recordPath, JSON.stringify(expectedRecord));
    args.push('--record', recordPath);
  }
  const result = spawnSync(process.execPath, args, {
    cwd: fixture.root,
    env: { PATH: fixture.bin, HOME: fixture.root, PREFLIGHT_EXTERNAL_LOG: fixture.log },
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.ifError(result.error);
  assert.ok(result.stdout.trim(), `Expected JSON report; stderr: ${result.stderr}`);
  return { exitCode: result.status, output: JSON.parse(result.stdout) };
}

function assertInvalid(result, diagnostic) {
  assert.notEqual(result.exitCode, 0, JSON.stringify(result.output));
  assert.equal(result.output.status, 'invalid', JSON.stringify(result.output));
  assert.ok(result.output.findings?.length, 'Invalid publication must explain the failure.');
  if (diagnostic) assert.match(JSON.stringify(result.output.findings), diagnostic);
}

test('preflight fixtures are complete records accepted by the existing schema', () => {
  for (const [kind, record] of Object.entries(fixtures)) {
    const result = validateRecord(kind, record);
    assert.equal(result.valid, true, `${kind}: ${JSON.stringify(result.errors)}`);
  }
});

for (const kind of ['evidence', 'issue', 'pr']) {
  test(`local validate accepts canonical ${kind} from an unconfigured consumer without gh or credentials`, async (t) => {
    const fixture = await consumer(t);
    const result = await runValidation(fixture, { kind, body: bodyFor(fixtures[kind]) });
    assert.equal(result.exitCode, 0, JSON.stringify(result.output));
    assert.equal(result.output.status, 'pass');
    assert.deepEqual(result.output.record, fixtures[kind]);
    assert.deepEqual(result.output.findings, []);
    assert.deepEqual((await readdir(fixture.root)).sort(), ['bin', 'publication.md']);
  });
}

test('validate makes no external tool calls or cloud writes', async (t) => {
  const fixture = await consumer(t, { sentinels: true });
  const result = await runValidation(fixture, { body: bodyFor(fixtures.evidence) });
  await assert.rejects(readFile(fixture.log), { code: 'ENOENT' });
  assert.equal(result.exitCode, 0, JSON.stringify(result.output));
  assert.equal(result.output.status, 'pass');
});

test('an unsupported Evidence heading gives the canonical Workflow context repair', async (t) => {
  const result = await runValidation(await consumer(t), {
    body: bodyFor(fixtures.evidence, '## Evidence'),
  });
  assertInvalid(result, /Workflow context/);
});

for (const [name, body, diagnostic] of [
  ['duplicate sections', `${bodyFor(fixtures.evidence)}\n${bodyFor(fixtures.evidence)}`, /exactly one|duplicate|multiple/i],
  ['malformed JSON', '## Workflow context\n```json\n{"head":\n```\n', /json|malformed|parse/i],
  ['two JSON fences', `${bodyFor(fixtures.evidence)}\n\`\`\`json\n${JSON.stringify(fixtures.evidence)}\n\`\`\`\n`, /exactly one|multiple/i],
  ['unclosed JSON fence', bodyFor(fixtures.evidence).replace(/```\n$/, ''), /complete|fence|json/i],
]) {
  test(`validate rejects ${name}`, async (t) => {
    assertInvalid(await runValidation(await consumer(t), { body }), diagnostic);
  });
}

for (const [name, body] of [
  ['standalone JSON', JSON.stringify(fixtures.evidence)],
  ['unscoped fenced JSON', `\`\`\`json\n${JSON.stringify(fixtures.evidence)}\n\`\`\`\n`],
  ['quoted Markdown example', `\`\`\`\`markdown\n${bodyFor(fixtures.evidence)}\`\`\`\`\n`],
  ['blockquote', bodyFor(fixtures.evidence).split('\n').map((line) => `> ${line}`).join('\n')],
]) {
  test(`publication preflight never promotes ${name} into an authoritative record`, async (t) => {
    assertInvalid(await runValidation(await consumer(t), { body }), /Workflow context|authoritative/i);
  });
}

test('validate rejects a schema-invalid record derived from the full evidence fixture', async (t) => {
  const record = structuredClone(fixtures.evidence);
  delete record.scope;
  assert.equal(validateRecord('evidence', record).valid, false);
  assertInvalid(await runValidation(await consumer(t), { body: bodyFor(record) }), /scope|required/i);
});

test('--record accepts identical structured content despite JSON key order and whitespace', async (t) => {
  const expectedRecord = Object.fromEntries(Object.entries(fixtures.evidence).reverse());
  const result = await runValidation(await consumer(t), { body: bodyFor(fixtures.evidence), expectedRecord });
  assert.equal(result.exitCode, 0, JSON.stringify(result.output));
  assert.equal(result.output.status, 'pass');
  assert.deepEqual(result.output.record, fixtures.evidence);
});

test('--record rejects a valid intended record that differs from the parsed publication', async (t) => {
  const expectedRecord = { ...fixtures.evidence, scope: 'A different reviewed scope' };
  assert.equal(validateRecord('evidence', expectedRecord).valid, true);
  assertInvalid(await runValidation(await consumer(t), {
    body: bodyFor(fixtures.evidence), expectedRecord,
  }), /mismatch|differ|match/i);
});

test('--record cannot override missing canonical publication context', async (t) => {
  assertInvalid(await runValidation(await consumer(t), {
    body: bodyFor(fixtures.evidence, '## Evidence'), expectedRecord: fixtures.evidence,
  }), /Workflow context/);
});

test('reviewVerdict schema defines only pass, fail, revise and incomplete', () => {
  for (const verdict of verdicts) {
    assert.equal(validateRecord('reviewVerdict', verdict).valid, true, verdict);
  }
  for (const verdict of ['PASS', 'passed', 'pass with explanatory prose', '', null, {}]) {
    assert.equal(validateRecord('reviewVerdict', verdict).valid, false, JSON.stringify(verdict));
  }
});

for (const verdict of verdicts) {
  test(`canonical review verdict ${verdict} passes publication validation, not semantic acceptance`, async (t) => {
    const record = { ...fixtures.evidence, result: verdict };
    const result = await runValidation(await consumer(t), { body: bodyFor(record) });
    assert.equal(result.exitCode, 0, JSON.stringify(result.output));
    assert.equal(result.output.status, 'pass');
    assert.equal(result.output.record.result, verdict);
  });
}

test('historical explanatory review results remain source data but fail publication with an actionable verdict diagnostic', async (t) => {
  const record = { ...fixtures.evidence, result: 'PASS: reviewed the complete change and found no blockers.' };
  const body = bodyFor(record);
  assert.deepEqual(await readRecordBody(body), record);
  assert.equal(validateRecord('evidence', record).valid, true, 'Historical evidence shape must remain readable.');
  const result = await runValidation(await consumer(t), { body });
  assertInvalid(result);
  const finding = result.output.findings.find((entry) => entry.code === 'review-verdict-invalid');
  assert.ok(finding, JSON.stringify(result.output.findings));
  for (const verdict of verdicts) assert.match(JSON.stringify(finding), new RegExp(`\\b${verdict}\\b`));
  assert.notEqual(result.output.record?.result, 'pass', 'Do not infer a canonical verdict from prose.');
});

test('ordinary execution evidence retains a descriptive result', async (t) => {
  const record = structuredClone(fixtures.evidence);
  for (const key of ['producer_session', 'reviewer_session', 'reviewer_model', 'review_depth', 'review_kind', 'review_tool']) delete record[key];
  record.result = 'Executed the targeted checks; 12 assertions completed with exit code 0.';
  assert.equal(validateRecord('evidence', record).valid, true);
  const result = await runValidation(await consumer(t), { body: bodyFor(record) });
  assert.equal(result.exitCode, 0, JSON.stringify(result.output));
  assert.equal(result.output.status, 'pass');
  assert.deepEqual(result.output.record, record);
});

test('producer-only authorship does not turn descriptive execution into review evidence', async (t) => {
  const record = structuredClone(fixtures.evidence);
  for (const key of ['reviewer_session', 'reviewer_model', 'review_depth', 'review_kind', 'review_tool']) delete record[key];
  record.result = 'Executed the recorded checks successfully; retained the output for inspection.';
  assert.ok(record.producer_session);
  assert.equal(validateRecord('evidence', record).valid, true);
  const result = await runValidation(await consumer(t), { body: bodyFor(record), expectedRecord: record });
  assert.equal(result.exitCode, 0, JSON.stringify(result.output));
  assert.equal(result.output.status, 'pass');
  assert.deepEqual(result.output.record, record);
});
