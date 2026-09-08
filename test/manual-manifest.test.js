import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateRecord } from '../src/records.js';
import { loadManualSummaryCases } from './fixtures/manual-manifest/helpers.mjs';

const manifestUrl = new URL('../src/manifest.js', import.meta.url);
const fixtureUrl = new URL('./fixtures/manual-manifest/', import.meta.url);

const closeoutPolicyRef = {
  repository: 'example/consumer',
  revision: '9999999999999999999999999999999999999999',
  path: 'openspec/specs/specification-baseline.md',
  anchor: 'requirement-closeout',
};

const policyRef = {
  repository: 'example/consumer',
  revision: 'cccccccccccccccccccccccccccccccccccccccc',
  path: 'openspec/specs/policy.md',
  anchor: 'requirement-policy',
};

async function loadManifestModule() {
  try {
    return await import(manifestUrl.href);
  } catch (error) {
    throw new Error(`Manual manifest runtime is unavailable: ${error.message}`, { cause: error });
  }
}

async function fixtureBytes(name) {
  return readFile(new URL(name, fixtureUrl));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function gitSource(ref) {
  return { kind: 'git-blob', representation: 'raw-bytes', ref: structuredClone(ref) };
}

function commentSource(repository, comment_id) {
  return {
    kind: 'github-issue-comment',
    repository,
    comment_id,
    endpoint: 'GET /repos/{owner}/{repo}/issues/comments/{id}',
    api_version: '2022-11-28',
    media_type: 'application/vnd.github.raw+json',
    field: 'body',
    encoding: 'utf-8',
    normalization: 'none',
  };
}

function sourceKey(ref) {
  return `${ref.repository}@${ref.revision}:${ref.path}`;
}

function commentKey(ref) {
  return `${ref.repository}#${ref.comment_id}`;
}

function codedError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function makeAdapter({ blobs = {}, comments = {} } = {}) {
  const calls = { readBlob: [], readComment: [] };
  return {
    calls,
    async readBlob(ref) {
      calls.readBlob.push(structuredClone(ref));
      const value = blobs[sourceKey(ref)];
      if (value === undefined) throw codedError('record-unavailable', `Missing blob ${sourceKey(ref)}`);
      if (value instanceof Error) throw value;
      return Buffer.from(value);
    },
    async readComment(ref) {
      calls.readComment.push(structuredClone(ref));
      const value = comments[commentKey(ref)];
      if (value === undefined) throw codedError('record-unavailable', `Missing comment ${commentKey(ref)}`);
      if (value instanceof Error) throw value;
      return structuredClone(value);
    },
  };
}

function manualDelivery(source, overrides = {}) {
  return {
    issues: ['example/consumer#81'],
    prs: ['example/consumer#82'],
    reviewed_head: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    result: 'pass',
    scope: 'The bounded trace package described by the source note.',
    base_ref: 'main',
    base_sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    policy_ref: structuredClone(policyRef),
    policy_mode: 'bootstrap',
    content_sha256: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    source,
    ...structuredClone(overrides),
  };
}

function findingText(finding) {
  return `${finding?.code || ''} ${finding?.message || ''} ${JSON.stringify(finding || {})}`;
}

function hasFinding(result, pattern) {
  return Array.isArray(result?.findings) && result.findings.some((finding) => pattern.test(findingText(finding)));
}

function hasSummaryReview(result) {
  return result?.findings?.find((finding) => /summary|correspondence|manual/i.test(findingText(finding)));
}

function assertValidManifest(manifest) {
  const validation = validateRecord('manifest', manifest);
  assert.equal(validation.valid, true, `invalid manifest: ${JSON.stringify(validation.errors)}`);
}

async function capture(args) {
  const module = await loadManifestModule();
  return module.captureManifest(args);
}

async function check(args) {
  const module = await loadManifestModule();
  return module.checkManifest(args);
}

test('manual Git report capture hashes raw bytes and retains a semantic correspondence review finding', async () => {
  const ref = {
    repository: 'example/consumer',
    revision: '1111111111111111111111111111111111111111',
    path: 'reports/trace-assessment.txt',
  };
  const source = gitSource(ref);
  const raw = await fixtureBytes('manual-report.txt');
  const adapter = makeAdapter({ blobs: { [sourceKey(ref)]: raw } });

  const result = await capture({
    adapter,
    closeoutPolicyRef,
    capturedAt: '2026-09-08T04:00:00Z',
    deliveries: [manualDelivery(source)],
  });

  assert.deepEqual(adapter.calls.readBlob, [ref]);
  assert.equal(result.manifest.deliveries.length, 1);
  const delivery = result.manifest.deliveries[0];
  assert.equal(delivery.content_sha256, sha256(raw));
  assert.notEqual(delivery.content_sha256, 'f'.repeat(64));
  assert.equal(delivery.reviewed_head, 'a'.repeat(40));
  assert.deepEqual(delivery.policy_ref, policyRef);
  assert.deepEqual(delivery.source, source);
  const review = hasSummaryReview(result);
  assert.ok(review, 'unstructured summary correspondence must remain a review finding');
  assert.equal(review.severity, 'review');
  assert.equal(Object.hasOwn(result, 'approved'), false);
  assertValidManifest(result.manifest);
});

test('manual capture accepts opaque non-UTF8 Git bytes and hashes the unchanged source', async () => {
  const ref = {
    repository: 'example/consumer',
    revision: 'abababababababababababababababababababab',
    path: 'reports/opaque-assessment.bin',
  };
  const source = gitSource(ref);
  const raw = Buffer.from((await fixtureBytes('manual-binary.blob.b64')).toString('ascii').trim(), 'base64');
  assert.ok(raw.some((byte) => byte > 0x7f), 'fixture must contain non-UTF8 bytes');
  const captured = await capture({
    adapter: makeAdapter({ blobs: { [sourceKey(ref)]: raw } }),
    closeoutPolicyRef,
    capturedAt: '2026-09-08T04:00:30Z',
    deliveries: [manualDelivery(source, { scope: 'An opaque historical assessment blob.' })],
  });

  assert.equal(captured.manifest.deliveries.length, 1);
  const delivery = captured.manifest.deliveries[0];
  assert.deepEqual(delivery.source, source);
  assert.equal(delivery.content_sha256, sha256(raw));
  assert.ok(hasSummaryReview(captured));
  assert.equal(hasSummaryReview(captured).severity, 'review');
  assertValidManifest(captured.manifest);

  const checked = await check({
    adapter: makeAdapter({ blobs: { [sourceKey(ref)]: raw } }),
    manifest: captured.manifest,
  });
  assert.equal(checked.valid, true);
  assert.ok(hasSummaryReview(checked));
});

test('invalid UTF8 beginning with an authoritative JSON marker stays an explicit structured-source gap', async () => {
  const ref = {
    repository: 'example/consumer',
    revision: 'cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd',
    path: 'reports/invalid-utf8.json',
  };
  const source = gitSource(ref);
  const raw = Buffer.from((await fixtureBytes('malformed-utf8-json.blob.b64')).toString('ascii').trim(), 'base64');
  const result = await capture({
    adapter: makeAdapter({ blobs: { [sourceKey(ref)]: raw } }),
    closeoutPolicyRef,
    capturedAt: '2026-09-08T04:00:45Z',
    deliveries: [manualDelivery(source, { scope: 'A caller summary cannot replace invalid structured source bytes.' })],
  });

  assert.equal(result.manifest.deliveries.length, 0);
  assert.ok(result.findings.some((finding) =>
    /source-record-invalid|structured-source-invalid/.test(finding?.code || '')
      && /invalid.*encoding|encoding.*invalid|utf-?8/i.test(findingText(finding))));
});

test('manual comment capture hashes the exact body and check accepts fixity while retaining semantic review', async () => {
  const source = commentSource('example/consumer', 812);
  const body = `${(await fixtureBytes('manual-comment.md')).toString('utf8')}\r\n`;
  const adapter = makeAdapter({ comments: {
    [commentKey(source)]: { id: 812, body, body_text: 'rendered alternate', body_html: '<p>rendered alternate</p>' },
  } });

  const captured = await capture({
    adapter,
    closeoutPolicyRef,
    capturedAt: '2026-09-08T04:01:00Z',
    deliveries: [manualDelivery(source)],
  });

  assert.equal(captured.manifest.deliveries.length, 1);
  assert.equal(captured.manifest.deliveries[0].content_sha256, sha256(Buffer.from(body, 'utf8')));
  assert.deepEqual(adapter.calls.readComment, [{ repository: 'example/consumer', comment_id: 812 }]);

  const checked = await check({
    adapter: makeAdapter({ comments: {
      [commentKey(source)]: { id: 812, body, body_text: 'changed rendering', body_html: '<div>changed rendering</div>' },
    } }),
    manifest: captured.manifest,
  });
  assert.equal(checked.valid, true);
  assert.ok(hasSummaryReview(checked));
  assert.equal(Object.hasOwn(checked, 'approved'), false);

  const drifted = await check({
    adapter: makeAdapter({ comments: {
      [commentKey(source)]: { id: 812, body: body.replace('bounded assessment', 'changed assessment') },
    } }),
    manifest: captured.manifest,
  });
  assert.equal(drifted.valid, false);
  assert.ok(hasFinding(drifted, /evidence-drift|drift/i));
});

test('a known PR with a null reviewed head is rejected instead of being declared non-revisioned research', async () => {
  const ref = {
    repository: 'example/consumer',
    revision: '2222222222222222222222222222222222222222',
    path: 'reports/missing-head.txt',
  };
  const source = gitSource(ref);
  const adapter = makeAdapter({ blobs: { [sourceKey(ref)]: await fixtureBytes('manual-report.txt') } });
  const result = await capture({
    adapter,
    closeoutPolicyRef,
    capturedAt: '2026-09-08T04:02:00Z',
    deliveries: [manualDelivery(source, {
      reviewed_head: null,
      no_head_reason: 'The historical report did not record the reviewed revision.',
    })],
  });

  assert.equal(result.manifest.deliveries.length, 0);
  assert.ok(hasFinding(result, /head|revision|manual|non-revisioned/i));
});

test('a genuinely non-revisioned research summary keeps null audit fields and remains reviewable', async () => {
  const ref = {
    repository: 'example/consumer',
    revision: '3333333333333333333333333333333333333333',
    path: 'reports/research.txt',
  };
  const source = gitSource(ref);
  const raw = await fixtureBytes('manual-research.txt');
  const result = await capture({
    adapter: makeAdapter({ blobs: { [sourceKey(ref)]: raw } }),
    closeoutPolicyRef,
    capturedAt: '2026-09-08T04:03:00Z',
    deliveries: [manualDelivery(source, {
      issues: ['example/consumer#83'],
      prs: undefined,
      reviewed_head: null,
      no_head_reason: 'The bounded research used an external service and has no Git revision.',
      result: 'inconclusive',
      scope: 'External research recorded in the source note.',
      base_ref: null,
      base_sha: null,
      policy_ref: null,
      policy_mode: null,
    })],
  });

  assert.equal(result.manifest.deliveries.length, 1);
  const delivery = result.manifest.deliveries[0];
  assert.equal(delivery.reviewed_head, null);
  assert.equal(delivery.no_head_reason, 'The bounded research used an external service and has no Git revision.');
  assert.equal(delivery.base_ref, null);
  assert.equal(delivery.base_sha, null);
  assert.equal(delivery.policy_ref, null);
  assert.equal(delivery.policy_mode, null);
  assert.ok(hasSummaryReview(result));
  assertValidManifest(result.manifest);
});

test('manual summaries preserve explicit null historical audit values and never backfill the current closeout policy', async () => {
  const ref = {
    repository: 'example/consumer',
    revision: '4444444444444444444444444444444444444444',
    path: 'reports/unknown-audit.txt',
  };
  const source = gitSource(ref);
  const result = await capture({
    adapter: makeAdapter({ blobs: { [sourceKey(ref)]: await fixtureBytes('manual-report.txt') } }),
    closeoutPolicyRef,
    capturedAt: '2026-09-08T04:04:00Z',
    deliveries: [manualDelivery(source, {
      base_ref: null,
      base_sha: null,
      policy_ref: null,
      policy_mode: null,
    })],
  });

  assert.equal(result.manifest.deliveries.length, 1);
  const delivery = result.manifest.deliveries[0];
  assert.equal(delivery.base_ref, null);
  assert.equal(delivery.base_sha, null);
  assert.equal(delivery.policy_ref, null);
  assert.equal(delivery.policy_mode, null);
  assert.notDeepEqual(delivery.policy_ref, closeoutPolicyRef);
  assert.ok(hasFinding(result, /audit|historical|unknown|gap/i));
  assertValidManifest(result.manifest);
});

test('structured Evidence remains authoritative when caller supplied manual fields contradict it', async () => {
  const ref = {
    repository: 'example/consumer',
    revision: '5555555555555555555555555555555555555555',
    path: 'evidence/activation.json',
  };
  const source = gitSource(ref);
  const raw = await readFile(new URL('../manifest/evidence-activation.json', fixtureUrl));
  const result = await capture({
    adapter: makeAdapter({ blobs: { [sourceKey(ref)]: raw } }),
    closeoutPolicyRef,
    capturedAt: '2026-09-08T04:05:00Z',
    deliveries: [manualDelivery(source, {
      issues: ['example/consumer#42'],
      prs: ['example/consumer#42'],
      reviewed_head: '9999999999999999999999999999999999999999',
      result: 'fail',
      scope: 'Caller supplied contradiction',
      base_ref: 'candidate',
      base_sha: '8888888888888888888888888888888888888888',
      policy_ref: null,
      policy_mode: 'bootstrap',
    })],
  });

  assert.equal(result.manifest.deliveries.length, 1);
  const delivery = result.manifest.deliveries[0];
  assert.equal(delivery.reviewed_head, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(delivery.result, 'pass');
  assert.equal(delivery.scope, 'Activation delivery — raw fixity π 💾');
  assert.equal(delivery.base_ref, 'release');
  assert.equal(delivery.policy_mode, 'activation');
  assert.ok(hasFinding(result, /contradict|mismatch|source|manual/i));
  assertValidManifest(result.manifest);
});

test('malformed authoritative JSON cannot fall through to a caller-authored manual delivery row', async () => {
  const ref = {
    repository: 'example/consumer',
    revision: '6666666666666666666666666666666666666666',
    path: 'reports/malformed.json',
  };
  const source = gitSource(ref);
  const result = await capture({
    adapter: makeAdapter({ blobs: { [sourceKey(ref)]: await fixtureBytes('malformed-authoritative.json') } }),
    closeoutPolicyRef,
    capturedAt: '2026-09-08T04:06:00Z',
    deliveries: [manualDelivery(source)],
  });

  assert.equal(result.manifest.deliveries.length, 0);
  assert.ok(hasFinding(result, /structured|malformed|authoritative|invalid/i));
});

test('duplicate authoritative Workflow contexts cannot fall through to a caller-authored manual delivery row', async () => {
  const ref = {
    repository: 'example/consumer',
    revision: '7777777777777777777777777777777777777777',
    path: 'reports/duplicate.md',
  };
  const source = gitSource(ref);
  const result = await capture({
    adapter: makeAdapter({ blobs: { [sourceKey(ref)]: await fixtureBytes('duplicate-authoritative.md') } }),
    closeoutPolicyRef,
    capturedAt: '2026-09-08T04:07:00Z',
    deliveries: [manualDelivery(source)],
  });

  assert.equal(result.manifest.deliveries.length, 0);
  assert.ok(hasFinding(result, /duplicate|authoritative|structured|context/i));
});

test('manual source fixity and caller summaries stay mechanically reviewable without proving coverage', async () => {
  const { raw, cases } = await loadManualSummaryCases();

  for (const [index, item] of cases.entries()) {
    const source = item.source;
    const captured = await capture({
      adapter: makeAdapter({ blobs: { [sourceKey(item.source.ref)]: raw } }),
      closeoutPolicyRef,
      capturedAt: `2026-09-08T04:0${8 + index}:00Z`,
      deliveries: [item.row],
    });

    assert.equal(captured.manifest.deliveries.length, 1);
    assert.equal(captured.manifest.deliveries[0].content_sha256, sha256(raw));
    assert.ok(hasSummaryReview(captured));
    assertValidManifest(captured.manifest);

    const checked = await check({
      adapter: makeAdapter({ blobs: { [sourceKey(item.source.ref)]: raw } }),
      manifest: captured.manifest,
    });
    assert.equal(checked.valid, true);
    assert.ok(hasSummaryReview(checked));
    assert.equal(Object.hasOwn(checked, 'approved'), false);
  }
});
