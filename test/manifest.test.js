import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateRecord } from '../src/records.js';

const manifestUrl = new URL('../src/manifest.js', import.meta.url);
const fixtureUrl = new URL('./fixtures/manifest/', import.meta.url);

const closeoutPolicyRef = {
  repository: 'example/consumer',
  revision: '9999999999999999999999999999999999999999',
  path: 'openspec/specs/specification-baseline.md',
  anchor: 'requirement-closeout',
};

async function loadManifestModule() {
  try {
    return await import(manifestUrl.href);
  } catch (error) {
    throw new Error(
      `Issue #8 manifest runtime is unavailable; expected src/manifest.js before behavioral tests: ${error.message}`,
      { cause: error },
    );
  }
}

async function fixtureBytes(name) {
  return readFile(new URL(name, fixtureUrl));
}

async function fixtureText(name) {
  return (await fixtureBytes(name)).toString('utf8');
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

function codedError(code, message = code, details) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function makeAdapter({ blobs = {}, comments = {}, blobError, commentError } = {}) {
  const calls = { readBlob: [], readComment: [] };
  return {
    calls,
    async readBlob(ref) {
      calls.readBlob.push(structuredClone(ref));
      if (blobError) throw blobError;
      const value = blobs[sourceKey(ref)];
      if (value === undefined) throw codedError('record-unavailable', `Missing blob ${sourceKey(ref)}`);
      if (value instanceof Error) throw value;
      return Buffer.from(value);
    },
    async readComment(ref) {
      calls.readComment.push(structuredClone(ref));
      if (commentError) throw commentError;
      const value = comments[commentKey(ref)];
      if (value === undefined) throw codedError('record-unavailable', `Missing comment ${commentKey(ref)}`);
      if (value instanceof Error) throw value;
      return structuredClone(value);
    },
  };
}

function findingText(finding) {
  return `${finding?.code || ''} ${finding?.message || ''} ${JSON.stringify(finding || {})}`;
}

function hasFinding(result, pattern) {
  return Array.isArray(result?.findings) && result.findings.some((finding) => pattern.test(findingText(finding)));
}

function assertValidManifest(manifest) {
  const validation = validateRecord('manifest', manifest);
  assert.equal(validation.valid, true, `capture returned an invalid manifest: ${JSON.stringify(validation.errors)}`);
}

async function capture(args) {
  const module = await loadManifestModule();
  return module.captureManifest(args);
}

async function check(args) {
  const module = await loadManifestModule();
  return module.checkManifest(args);
}

test('manifest module exposes the capture and check APIs', async () => {
  const module = await loadManifestModule();
  assert.equal(typeof module.captureManifest, 'function');
  assert.equal(typeof module.checkManifest, 'function');
});

test('capture hashes exact Git blob bytes, preserves source identity, and carries an activation audit envelope', async () => {
  const ref = {
    repository: 'example/consumer',
    revision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    path: 'evidence/activation.json',
  };
  const source = gitSource(ref);
  const raw = Buffer.from((await fixtureText('evidence-activation.json')).replaceAll('\n', '\r\n'), 'utf8');
  const adapter = makeAdapter({ blobs: { [sourceKey(ref)]: raw } });

  const result = await capture({
    adapter,
    closeoutPolicyRef,
    capturedAt: '2026-09-08T03:00:00Z',
    deliveries: [{
      issues: ['example/consumer#42'],
      prs: ['example/consumer#42'],
      source,
    }],
  });

  assert.deepEqual(adapter.calls.readBlob, [ref]);
  assert.deepEqual(result.findings, []);
  assert.equal(result.manifest.schema_version, 1);
  assert.equal(result.manifest.captured_at, '2026-09-08T03:00:00Z');
  assert.deepEqual(result.manifest.closeout_policy_ref, closeoutPolicyRef);
  assert.equal(result.manifest.deliveries.length, 1);
  const delivery = result.manifest.deliveries[0];
  assert.deepEqual(delivery.issues, ['example/consumer#42']);
  assert.deepEqual(delivery.prs, ['example/consumer#42']);
  assert.equal(delivery.reviewed_head, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(delivery.result, 'pass');
  assert.equal(delivery.scope, 'Activation delivery — raw fixity π 💾');
  assert.equal(delivery.base_ref, 'release');
  assert.equal(delivery.base_sha, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  assert.deepEqual(delivery.policy_ref, {
    repository: 'example/consumer',
    revision: 'cccccccccccccccccccccccccccccccccccccccc',
    path: 'openspec/specs/policy.md',
    anchor: 'requirement-policy',
  });
  assert.equal(delivery.policy_mode, 'activation');
  assert.deepEqual(delivery.source, source);
  assert.equal(delivery.content_sha256, sha256(raw));
  assertValidManifest(result.manifest);
});

test('capture parses one Workflow context block without hashing rendered or unrelated prose', async () => {
  const ref = {
    repository: 'example/consumer',
    revision: '3333333333333333333333333333333333333333',
    path: 'evidence/context.md',
  };
  const source = gitSource(ref);
  const raw = await fixtureBytes('evidence-context.md');
  const adapter = makeAdapter({ blobs: { [sourceKey(ref)]: raw } });

  const result = await capture({
    adapter,
    closeoutPolicyRef,
    capturedAt: '2026-09-08T03:01:00Z',
    deliveries: [{
      issues: ['example/consumer#45'],
      prs: ['example/consumer#45'],
      source,
    }],
  });

  assert.deepEqual(result.findings, []);
  const delivery = result.manifest.deliveries[0];
  assert.equal(delivery.reviewed_head, '3333333333333333333333333333333333333333');
  assert.equal(delivery.scope, 'Single context block delivery');
  assert.equal(delivery.base_ref, 'main');
  assert.equal(delivery.policy_mode, 'bootstrap');
  assert.equal(delivery.content_sha256, sha256(raw));
  const context = raw.toString('utf8').match(/```json\n([\s\S]*?)\n```/)[1];
  const renderedContextDigest = sha256(Buffer.from(JSON.stringify(JSON.parse(context)), 'utf8'));
  assert.notEqual(delivery.content_sha256, renderedContextDigest);
  assertValidManifest(result.manifest);
});

test('capture retains planning, bootstrap, activation, and non-revisioned research provenance independently', async () => {
  const bootstrapRef = {
    repository: 'example/consumer',
    revision: 'dddddddddddddddddddddddddddddddddddddddd',
    path: 'evidence/bootstrap.json',
  };
  const activationRef = {
    repository: 'example/consumer',
    revision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    path: 'evidence/activation.json',
  };
  const researchRef = {
    repository: 'example/consumer',
    revision: '2222222222222222222222222222222222222222',
    path: 'evidence/research.json',
  };
  const adapter = makeAdapter({ blobs: {
    [sourceKey(bootstrapRef)]: await fixtureBytes('evidence-bootstrap.json'),
    [sourceKey(activationRef)]: await fixtureBytes('evidence-activation.json'),
    [sourceKey(researchRef)]: await fixtureBytes('evidence-research.json'),
  } });

  const result = await capture({
    adapter,
    closeoutPolicyRef,
    capturedAt: '2026-09-08T03:02:00Z',
    deliveries: [
      { issues: ['example/consumer#41'], prs: ['example/consumer#41'], source: gitSource(bootstrapRef) },
      { issues: ['example/consumer#42'], prs: ['example/consumer#42'], source: gitSource(activationRef) },
      { issues: ['example/consumer#43'], source: gitSource(researchRef) },
    ],
  });

  assert.deepEqual(result.findings, []);
  assert.equal(result.manifest.deliveries.length, 3);
  const [bootstrap, activation, research] = result.manifest.deliveries;
  assert.equal(bootstrap.policy_mode, 'bootstrap');
  assert.equal(bootstrap.base_ref, 'main');
  assert.equal(bootstrap.base_sha, 'ffffffffffffffffffffffffffffffffffffffff');
  assert.equal(activation.policy_mode, 'activation');
  assert.equal(activation.base_ref, 'release');
  assert.equal(activation.base_sha, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  assert.equal(research.reviewed_head, null);
  assert.equal(research.no_head_reason, 'The bounded research used an external service and has no Git revision.');
  assert.equal(research.base_ref, null);
  assert.equal(research.base_sha, null);
  assert.equal(research.policy_ref, null);
  assert.equal(research.policy_mode, null);
  for (const delivery of result.manifest.deliveries) assert.notDeepEqual(delivery.policy_ref, closeoutPolicyRef);
  assertValidManifest(result.manifest);
});

test('capture keeps missing historical audit fields null and reports an audit gap instead of using closeout policy', async () => {
  const ref = {
    repository: 'example/consumer',
    revision: '2222222222222222222222222222222222222222',
    path: 'evidence/missing-audit.json',
  };
  const source = gitSource(ref);
  const adapter = makeAdapter({ blobs: { [sourceKey(ref)]: await fixtureBytes('evidence-missing-audit.json') } });

  const result = await capture({
    adapter,
    closeoutPolicyRef,
    capturedAt: '2026-09-08T03:03:00Z',
    deliveries: [{ issues: ['example/consumer#47'], source }],
  });

  assert.ok(hasFinding(result, /audit|base_ref|base_sha|policy_ref|policy_mode/i));
  const delivery = result.manifest.deliveries[0];
  assert.equal(delivery.reviewed_head, '2222222222222222222222222222222222222222');
  assert.equal(delivery.result, 'pass');
  assert.equal(delivery.base_ref, null);
  assert.equal(delivery.base_sha, null);
  assert.equal(delivery.policy_ref, null);
  assert.equal(delivery.policy_mode, null);
  assert.notDeepEqual(delivery.policy_ref, closeoutPolicyRef);
  assertValidManifest(result.manifest);
});

test('capture records typed self-change decisions separately and rejects delivery-shape borrowing', async () => {
  const decisionRef = {
    repository: 'example/consumer',
    revision: '6666666666666666666666666666666666666666',
    path: 'decisions/improvement.json',
  };
  const contextDecisionRef = {
    repository: 'example/consumer',
    revision: '8888888888888888888888888888888888888888',
    path: 'decisions/context.md',
  };
  const decisionSource = gitSource(decisionRef);
  const contextDecisionSource = gitSource(contextDecisionRef);
  const decisionBytes = await fixtureBytes('decision-improvement.json');
  const contextDecisionBytes = await fixtureBytes('decision-context.md');
  const adapter = makeAdapter({ blobs: {
    [sourceKey(decisionRef)]: decisionBytes,
    [sourceKey(contextDecisionRef)]: contextDecisionBytes,
  } });

  const result = await capture({
    adapter,
    closeoutPolicyRef,
    capturedAt: '2026-09-08T03:04:00Z',
    deliveries: [],
    decisions: [{ source: decisionSource }, { source: contextDecisionSource }],
  });

  assert.deepEqual(result.findings, []);
  assert.equal(result.manifest.deliveries.length, 0);
  assert.equal(result.manifest.decisions.length, 2);
  const decision = result.manifest.decisions[0];
  assert.equal(decision.record_type, 'self-change-decision');
  assert.equal(decision.selection, 'improvement');
  assert.equal(decision.work, 'example/consumer#44');
  assert.equal(decision.authorized_by, 'example-owner');
  assert.deepEqual(decision.source, decisionSource);
  assert.equal(decision.content_sha256, sha256(decisionBytes));
  for (const forbidden of ['reviewed_head', 'result', 'scope', 'base_ref', 'base_sha', 'policy_ref', 'policy_mode']) {
    assert.equal(Object.hasOwn(decision, forbidden), false, `decision must not borrow delivery field ${forbidden}`);
  }
  const contextDecision = result.manifest.decisions[1];
  assert.equal(contextDecision.selection, 'closeout-alternative');
  assert.equal(contextDecision.work, 'example/consumer#46');
  assert.deepEqual(contextDecision.source, contextDecisionSource);
  assert.equal(contextDecision.content_sha256, sha256(contextDecisionBytes));
  assertValidManifest(result.manifest);
});

test('capture reports a source-summary contradiction instead of silently replacing supplied delivery references', async () => {
  const ref = {
    repository: 'example/consumer',
    revision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    path: 'evidence/activation.json',
  };
  const source = gitSource(ref);
  const adapter = makeAdapter({ blobs: { [sourceKey(ref)]: await fixtureBytes('evidence-activation.json') } });

  const result = await capture({
    adapter,
    closeoutPolicyRef,
    capturedAt: '2026-09-08T03:05:00Z',
    deliveries: [{
      issues: ['example/consumer#42'],
      prs: ['example/consumer#999'],
      source,
    }],
  });

  assert.ok(hasFinding(result, /contradict|mismatch|source.*pr|delivery.*pr/i));
  if (result.manifest.deliveries.length > 0) {
    assert.deepEqual(result.manifest.deliveries[0].prs, ['example/consumer#999']);
  }
  assertValidManifest(result.manifest);
});

test('capture leaves unsupported or unstructured sources as an explicit gap without fabricating a delivery summary', async () => {
  const ref = {
    repository: 'example/consumer',
    revision: '7777777777777777777777777777777777777777',
    path: 'evidence/unstructured.txt',
  };
  const source = gitSource(ref);
  const adapter = makeAdapter({ blobs: { [sourceKey(ref)]: await fixtureBytes('unstructured.txt') } });

  const result = await capture({
    adapter,
    closeoutPolicyRef,
    capturedAt: '2026-09-08T03:06:00Z',
    deliveries: [{ issues: ['example/consumer#48'], source }],
  });

  assert.ok(hasFinding(result, /unavailable|manual|structured|record/i));
  assert.equal(result.manifest.deliveries.length, 0);
  assertValidManifest(result.manifest);
});

test('capture validates source descriptors before any adapter read', async () => {
  const ref = {
    repository: 'example/consumer',
    revision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    path: 'evidence/activation.json',
  };
  const validComment = commentSource('example/consumer', 901);
  const invalidSources = [
    { ...validComment, endpoint: 'https://evil.invalid/comment' },
    { ...validComment, api_version: '2020-01-01' },
    { ...validComment, media_type: 'text/html' },
    { ...validComment, field: 'body_html' },
    { ...validComment, encoding: 'utf-16' },
    { ...validComment, normalization: 'trim' },
    { ...gitSource(ref), representation: 'utf8-text' },
    { ...gitSource(ref), ref: { ...ref, path: '../outside.json' } },
  ];

  for (const source of invalidSources) {
    const adapter = makeAdapter();
    let result;
    let error;
    try {
      result = await capture({
        adapter,
        closeoutPolicyRef,
        capturedAt: '2026-09-08T03:07:00Z',
        deliveries: [{ issues: ['example/consumer#49'], source }],
      });
    } catch (caught) {
      error = caught;
    }
    if (error) assert.match(`${error.code || ''} ${error.message}`, /invalid|unsafe|descriptor|source|path/i);
    else {
      assert.ok(Array.isArray(result.findings) && result.findings.length > 0);
      assert.equal(result.manifest.deliveries.length, 0);
    }
    assert.deepEqual(adapter.calls.readBlob, [], 'invalid source must not call readBlob');
    assert.deepEqual(adapter.calls.readComment, [], 'invalid source must not call readComment');
  }
});

test('check revalidates exact comment body bytes while ignoring alternate renderings', async () => {
  const source = commentSource('example/consumer', 901);
  const body = `${await fixtureText('evidence-activation.json').then((text) => text.replaceAll('\n', '\r\n'))}\r\n`;
  const captured = await capture({
    adapter: makeAdapter({ comments: { 'example/consumer#901': { id: 901, body, body_text: 'rendered body', body_html: '<p>rendered body</p>' } } }),
    closeoutPolicyRef,
    capturedAt: '2026-09-08T03:08:00Z',
    deliveries: [{ issues: ['example/consumer#42'], prs: ['example/consumer#42'], source }],
  });
  assert.deepEqual(captured.manifest.deliveries[0].source, source);
  assert.equal(captured.manifest.deliveries[0].content_sha256, sha256(Buffer.from(body, 'utf8')));

  const unchanged = await check({
    adapter: makeAdapter({ comments: { 'example/consumer#901': { id: 901, body, body_text: 'a different display', body_html: '<div>different display</div>' } } }),
    manifest: captured.manifest,
  });
  assert.equal(unchanged.valid, true);
  assert.deepEqual(unchanged.findings, []);

  const changed = await check({
    adapter: makeAdapter({ comments: { 'example/consumer#901': { id: 901, body: body.replace('raw fixity', 'changed body'), body_text: 'a different display', body_html: '<div>different display</div>' } } }),
    manifest: captured.manifest,
  });
  assert.equal(changed.valid, false);
  assert.ok(hasFinding(changed, /evidence-drift|drift/i));
});

test('check reports unavailable evidence and does not turn an integrity match into an approval claim', async () => {
  const source = commentSource('example/consumer', 901);
  const body = await fixtureText('evidence-activation.json');
  const captured = await capture({
    adapter: makeAdapter({ comments: { 'example/consumer#901': { id: 901, body } } }),
    closeoutPolicyRef,
    capturedAt: '2026-09-08T03:09:00Z',
    deliveries: [{ issues: ['example/consumer#42'], source }],
  });
  const checked = await check({
    adapter: makeAdapter({ commentError: codedError('record-unavailable', 'comment disappeared') }),
    manifest: captured.manifest,
  });

  assert.equal(checked.valid, false);
  assert.ok(hasFinding(checked, /evidence-unavailable|unavailable/i));
  assert.equal(Object.hasOwn(checked, 'approved'), false);
  assert.equal(Object.hasOwn(checked, 'execution_confirmed'), false);
});

test('check validates manifest source descriptors before re-reading them', async () => {
  const source = commentSource('example/consumer', 901);
  const body = await fixtureText('evidence-activation.json');
  const captured = await capture({
    adapter: makeAdapter({ comments: { 'example/consumer#901': { id: 901, body } } }),
    closeoutPolicyRef,
    capturedAt: '2026-09-08T03:10:00Z',
    deliveries: [{ issues: ['example/consumer#42'], source }],
  });
  const manifest = structuredClone(captured.manifest);
  manifest.deliveries[0].source.endpoint = 'https://evil.invalid/comment';
  const adapter = makeAdapter({ comments: { 'example/consumer#901': { id: 901, body } } });

  let result;
  let error;
  try {
    result = await check({ adapter, manifest });
  } catch (caught) {
    error = caught;
  }
  if (error) assert.match(`${error.code || ''} ${error.message}`, /invalid|unsafe|descriptor|source/i);
  else {
    assert.equal(result.valid, false);
    assert.ok(hasFinding(result, /invalid|unsafe|descriptor|source/i));
  }
  assert.deepEqual(adapter.calls.readBlob, []);
  assert.deepEqual(adapter.calls.readComment, []);
});
