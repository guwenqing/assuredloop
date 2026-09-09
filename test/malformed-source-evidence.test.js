import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { test } from 'node:test';
import { captureManifest } from '../src/manifest.js';

import {
  makeContextVariantFixture,
  makeDecisionFixture,
  makeEvidenceFieldFixture,
  makeInvalidOrdinaryEvidenceFixture,
  makeMalformedContextFixture,
  makeUnknownDiscriminatorFixture,
  makeUnrelatedJsonFixture,
  makeProseOnlyFixture,
  makeSupportingReferenceFixture,
} from './fixtures/malformed-source-evidence/helpers.mjs';
import { workPull } from './fixtures/execution-evidence-review/helpers.mjs';

const execFile = promisify(execFileCallback);
const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname);
const cliPath = path.join(repositoryRoot, 'src', 'cli.js');

async function runCli(args, env) {
  try {
    const result = await execFile(process.execPath, [cliPath, ...args], {
      env,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { ...result, exitCode: 0 };
  } catch (error) {
    return { stdout: error.stdout ?? '', stderr: error.stderr ?? '', exitCode: error.code };
  }
}

function outputOf(result) {
  assert.ok(result.stdout.trim(), `CLI returned no JSON output; stderr: ${result.stderr}`);
  return JSON.parse(result.stdout.trim());
}

function findingText(result) {
  return JSON.stringify(result.findings ?? result);
}

function packetEntry(result, commentId) {
  return (result.packet?.entries ?? []).find((entry) => entry.ref?.comment_id === commentId);
}

function containsExactString(value, expected, seen = new Set()) {
  if (typeof value === 'string') return value === expected;
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  return Array.isArray(value)
    ? value.some((entry) => containsExactString(entry, expected, seen))
    : Object.values(value).some((entry) => containsExactString(entry, expected, seen));
}

test('invalid ordinary Evidence remains visible beside a valid review', async (t) => {
  const fixture = await makeInvalidOrdinaryEvidenceFixture(t);
  const checkResult = await runCli(['check', '--target', fixture.root, '--work', workPull], fixture.env);
  const checked = outputOf(checkResult);
  assert.notEqual(checkResult.exitCode, 0);
  assert.notEqual(checked.status, 'pass');
  assert.match(findingText(checked), /109|exit_code|schema|evidence.*invalid/i);
  assert.equal(containsExactString(checked, fixture.ordinaryBody), true,
    'check retains the acquired invalid Evidence body for diagnosis');

  const inspectResult = await runCli(['inspect', '--target', fixture.root, '--work', workPull], fixture.env);
  const inspected = outputOf(inspectResult);
  assert.notEqual(inspectResult.exitCode, 0);
  assert.notEqual(inspected.status, 'pass');
  assert.match(findingText(inspected), /109|exit_code|schema|evidence.*invalid/i);
  const entry = packetEntry(inspected, 109);
  assert.ok(entry, 'the malformed ordinary Evidence source remains referenced');
  assert.match(entry.content, /"exit_code":\s*"zero"/);
});

test('malformed explicit Workflow context comment remains visible in check and inspect', async (t) => {
  const fixture = await makeMalformedContextFixture(t);
  const checkResult = await runCli(['check', '--target', fixture.root, '--work', workPull], fixture.env);
  const checked = outputOf(checkResult);
  assert.notEqual(checkResult.exitCode, 0);
  assert.notEqual(checked.status, 'pass');
  assert.match(findingText(checked), /110|record-context-invalid|malformed|json/i);
  assert.equal(containsExactString(checked, fixture.malformedBody), true,
    'check retains the acquired malformed Workflow context body for diagnosis');

  const inspectResult = await runCli(['inspect', '--target', fixture.root, '--work', workPull], fixture.env);
  const inspected = outputOf(inspectResult);
  assert.notEqual(inspectResult.exitCode, 0);
  assert.notEqual(inspected.status, 'pass');
  assert.match(findingText(inspected), /110|record-context-invalid|malformed|json/i);
  const entry = packetEntry(inspected, 110);
  assert.ok(entry, 'the malformed Workflow context source remains referenced');
  assert.match(entry.content, /malformed-trailing-comma/);
});

test('ordinary collaboration prose with command and exit language is not Evidence', async (t) => {
  const fixture = await makeProseOnlyFixture(t);
  const checkResult = await runCli(['check', '--target', fixture.root, '--work', workPull], fixture.env);
  const checked = outputOf(checkResult);
  assert.equal(checkResult.exitCode, 0, findingText(checked));
  assert.equal(checked.status, 'pass');
  assert.doesNotMatch(findingText(checked), /review-evidence-invalid|evidence-record-invalid|record-context-invalid|record-schema-invalid/);

  const inspectResult = await runCli(['inspect', '--target', fixture.root, '--work', workPull], fixture.env);
  const inspected = outputOf(inspectResult);
  assert.equal(inspectResult.exitCode, 0, findingText(inspected));
  assert.equal(inspected.status, 'pass');
  assert.doesNotMatch(findingText(inspected), /review-evidence-invalid|evidence-record-invalid|record-context-invalid|record-schema-invalid/);
  const entry = packetEntry(inspected, 111);
  assert.ok(entry, 'ordinary prose remains available as source context');
  assert.match(entry.content, /Ordinary collaboration prose/);
});

for (const field of ['head', 'scope', 'result', 'evidence']) {
  test(`Evidence-like plain JSON missing ${field} remains a visible schema error`, async (t) => {
    const fixture = await makeEvidenceFieldFixture(t, field);
    const result = await runCli(['check', '--target', fixture.root, '--work', workPull], fixture.env);
    const checked = outputOf(result);
    assert.notEqual(result.exitCode, 0);
    assert.notEqual(checked.status, 'pass');
    assert.match(findingText(checked), /109|schema|evidence|invalid/i);
  });
}

for (const variant of ['duplicate', 'incomplete', 'invalidShape']) {
  test(`explicit Workflow context ${variant} remains a visible source error`, async (t) => {
    const fixture = await makeContextVariantFixture(t, variant);
    const result = await runCli(['check', '--target', fixture.root, '--work', workPull], fixture.env);
    const checked = outputOf(result);
    assert.notEqual(result.exitCode, 0);
    assert.notEqual(checked.status, 'pass');
    assert.match(findingText(checked), /120|record-context|duplicate|malformed|schema|invalid/i);

    const inspectedResult = await runCli(['inspect', '--target', fixture.root, '--work', workPull], fixture.env);
    const inspected = outputOf(inspectedResult);
    assert.notEqual(inspectedResult.exitCode, 0);
    assert.notEqual(inspected.status, 'pass');
    assert.match(findingText(inspected), /120|record-context|duplicate|malformed|schema|invalid/i);
    const entry = packetEntry(inspected, 120);
    assert.ok(entry, 'the explicit malformed source remains in the packet');
    assert.match(entry.content, /Workflow context/);
  });
}

test('valid self-change decision stays separate from Evidence', async (t) => {
  const fixture = await makeDecisionFixture(t, 'valid');
  const result = await runCli(['check', '--target', fixture.root, '--work', workPull], fixture.env);
  const checked = outputOf(result);
  assert.equal(result.exitCode, 0, findingText(checked));
  assert.equal(checked.status, 'pass');
  assert.doesNotMatch(findingText(checked), /review-evidence-invalid|evidence-record-invalid|source-record-invalid/);
});

for (const variant of ['invalid', 'mixed']) {
  test(`${variant} self-change decision declarations remain visible errors`, async (t) => {
    const fixture = await makeDecisionFixture(t, variant);
    const result = await runCli(['check', '--target', fixture.root, '--work', workPull], fixture.env);
    const checked = outputOf(result);
    assert.notEqual(result.exitCode, 0);
    assert.notEqual(checked.status, 'pass');
    assert.match(findingText(checked), /121|decision|record|invalid|evidence/i);
  });
}

test('an unknown discriminator cannot hide an otherwise Evidence-like invalid record', async (t) => {
  const fixture = await makeUnknownDiscriminatorFixture(t);
  const result = await runCli(['check', '--target', fixture.root, '--work', workPull], fixture.env);
  const checked = outputOf(result);
  assert.notEqual(result.exitCode, 0);
  assert.notEqual(checked.status, 'pass');
  assert.match(findingText(checked), /122|record|evidence|schema|invalid/i);
});

test('result-only unrelated JSON remains context instead of becoming Evidence', async (t) => {
  const fixture = await makeUnrelatedJsonFixture(t);
  const result = await runCli(['check', '--target', fixture.root, '--work', workPull], fixture.env);
  const checked = outputOf(result);
  assert.equal(result.exitCode, 0, findingText(checked));
  assert.equal(checked.status, 'pass');
  assert.doesNotMatch(findingText(checked), /review-evidence-invalid|evidence-record-invalid|record-context-invalid|record-schema-invalid/);
});

test('unrelated JSON in a valid Evidence supporting reference remains generic context', async (t) => {
  const fixture = await makeSupportingReferenceFixture(t);
  const checkResult = await runCli(['check', '--target', fixture.root, '--work', workPull], fixture.env);
  const checked = outputOf(checkResult);
  assert.equal(checkResult.exitCode, 0, findingText(checked));
  assert.equal(checked.status, 'pass');
  assert.doesNotMatch(findingText(checked), /review-evidence-invalid|evidence-record-invalid|source-record-invalid/);

  const inspectResult = await runCli(['inspect', '--target', fixture.root, '--work', workPull], fixture.env);
  const inspected = outputOf(inspectResult);
  assert.equal(inspectResult.exitCode, 0, findingText(inspected));
  assert.equal(inspected.status, 'pass');
  const entry = packetEntry(inspected, fixture.supportCommentId);
  assert.ok(entry, 'the supporting artifact remains in the raw source inventory');
  assert.match(entry.content, /generic supporting artifact/);
});

test('malformed Workflow context in a supporting reference retains source error and raw context', async (t) => {
  const fixture = await makeSupportingReferenceFixture(t, { malformed: true });
  const checkResult = await runCli(['check', '--target', fixture.root, '--work', workPull], fixture.env);
  const checked = outputOf(checkResult);
  assert.notEqual(checkResult.exitCode, 0);
  assert.notEqual(checked.status, 'pass');
  assert.match(findingText(checked), /131|record-context-invalid|malformed|supporting/i);

  const inspectResult = await runCli(['inspect', '--target', fixture.root, '--work', workPull], fixture.env);
  const inspected = outputOf(inspectResult);
  assert.notEqual(inspectResult.exitCode, 0);
  assert.notEqual(inspected.status, 'pass');
  assert.match(findingText(inspected), /131|record-context-invalid|malformed|supporting/i);
  const entry = packetEntry(inspected, fixture.supportCommentId);
  assert.ok(entry, 'the malformed supporting artifact remains in the raw source inventory');
  assert.match(entry.content, /malformed-supporting-context/);
});

test('captureManifest does not qualify an empty canonical delivery source', async () => {
  const source = {
    kind: 'github-issue-comment',
    repository: 'example/consumer',
    comment_id: 140,
    endpoint: 'GET /repos/{owner}/{repo}/issues/comments/{id}',
    api_version: '2022-11-28',
    media_type: 'application/vnd.github.raw+json',
    field: 'body',
    encoding: 'utf-8',
    normalization: 'none',
  };
  const result = await captureManifest({
    adapter: { async readComment() { return { id: 140, body: '{}' }; } },
    closeoutPolicyRef: {
      repository: 'example/consumer',
      revision: '9'.repeat(40),
      path: 'openspec/specs/policy.md',
      anchor: 'policy',
    },
    capturedAt: '2026-09-08T20:00:00Z',
    deliveries: [{ issues: ['example/consumer#43'], source }],
  });
  assert.equal(result.manifest.deliveries.length, 0);
  assert.match(JSON.stringify(result.findings), /source-record-invalid|source-evidence-invalid|evidence|invalid/i);
});
