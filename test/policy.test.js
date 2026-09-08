import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  activationPath,
  comment,
  configPath,
  makePolicyFixture,
  policyPath,
  repository,
  sha256,
  work,
} from './fixtures/policy/helpers.js';

const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname);
const packageMetadata = JSON.parse(readFileSync(path.join(repositoryRoot, 'contracts/metadata.json'), 'utf8'));
const policyModuleUrl = new URL('../src/policy.js', import.meta.url);
const policyAcceptanceBody = 'Scope accepted for the proposal; policy adoption requires review.';
const proposalAcceptanceBody = 'Proposal accepted for the agreed workflow scope.';
const activationEvidenceBody = 'Activation evidence supplied for owner review.';

let policyModule;
let policyImportError;
try {
  policyModule = await import(policyModuleUrl.href);
} catch (error) {
  policyImportError = error;
}

function packageBinding() {
  return {
    name: packageMetadata.name,
    version: packageMetadata.version,
    integrity: `sha512-${Buffer.alloc(64).toString('base64')}`,
    source_ref: structuredClone(packageMetadata.source_ref),
    contracts_path: packageMetadata.contracts_path,
  };
}

function labels() {
  return {
    type: {
      request: 'type:request',
      epic: 'type:epic',
      task: 'type:task',
      bug: 'type:bug',
      spike: 'type:spike',
    },
  };
}

function makeConfig(policyRevision, { bootstrap = true, mutate } = {}) {
  const config = {
    schema_version: 1,
    project: {
      workflow: packageBinding(),
      review: {
        depth: 'full-scope',
        internal: { allowed_models: ['model-alpha', 'model-beta'] },
        excluded_models: ['model-excluded'],
        model_aliases: {
          primary: 'model-alpha',
        },
        context: { max_inline_bytes: 65536 },
      },
    },
    repository: {
      name: repository,
      openspec_root: 'openspec',
      tools: ['codex'],
      labels: labels(),
    },
  };
  if (bootstrap) {
    config.project.bootstrap = {
      policy_ref: {
        repository,
        revision: policyRevision,
        path: policyPath,
      },
      policy_acceptance: { repository, comment_id: 101 },
      proposal_acceptance: { repository, comment_id: 102 },
      authorized_by: 'example-owner',
    };
  }
  mutate?.(config);
  return config;
}

function makeActivation(policyRevision, { state = 'active', mutate } = {}) {
  const activation = {
    schema_version: 1,
    state,
    policy_ref: {
      repository,
      revision: policyRevision,
      path: policyPath,
    },
    contract_package: packageBinding(),
    activated_at: '2026-09-08T02:30:14Z',
    authorized_by: 'example-owner',
    evidence: [{ repository, comment_id: 103 }],
  };
  mutate?.(activation);
  return activation;
}

function scenarioComments() {
  return {
    [`${repository}#101`]: comment(101, policyAcceptanceBody),
    [`${repository}#102`]: comment(102, proposalAcceptanceBody),
    [`${repository}#103`]: comment(103, activationEvidenceBody),
  };
}

async function scenario(t, {
  activation = false,
  activationState = 'active',
  config = true,
  configMutate,
  activationMutate,
  configBytesFor,
  activationBytesFor,
  policyBytes,
  readBlobFailureFor,
  candidateFiles,
  comments = scenarioComments(),
} = {}) {
  const fixture = await makePolicyFixture({
    configFor: config ? ({ policyRevision }) => makeConfig(policyRevision, { bootstrap: true, mutate: configMutate }) : undefined,
    activationFor: activation ? ({ policyRevision }) => makeActivation(policyRevision, { state: activationState, mutate: activationMutate }) : undefined,
    configBytesFor,
    activationBytesFor,
    policyBytes,
    readBlobFailureFor,
    candidateFiles,
    comments,
  });
  t.after(() => fixture.dispose());
  return fixture;
}

async function requirePolicy(t) {
  if (policyImportError) {
    t.skip(`Issue #8 policy runtime is unavailable: ${policyImportError.message}`);
    return null;
  }
  return policyModule;
}

function findingText(findings) {
  return JSON.stringify(findings ?? []).toLowerCase();
}

function assertFinding(findings, pattern, message = `expected finding matching ${pattern}`) {
  assert.ok(Array.isArray(findings), 'findings must be an array');
  assert.match(findingText(findings), pattern, message);
}

function assertDeclaredReviewKind(findings, kind) {
  assert.ok(Array.isArray(findings), 'findings must be an array');
  const declaration = findings.find((finding) => finding.code === 'review-kind-declared');
  assert.ok(declaration, `expected caller-selected ${kind} review declaration`);
  assert.equal(declaration.severity, 'review');
  assert.equal(declaration.review_kind, kind);
  assert.deepEqual(findings.filter((finding) => finding.code !== 'review-kind-declared'), []);
}

function assertUnavailable(result) {
  assert.equal(result.status, 'unavailable');
  assert.equal(result.mode, null);
  assertFinding(result.findings, /policy|unavailable|invalid/);
}

function assertAvailable(result, mode) {
  assert.equal(result.status, 'available');
  assert.equal(result.mode, mode);
  assert.ok(result.config && typeof result.config === 'object');
  assert.ok(result.policy_ref && typeof result.policy_ref === 'object');
  assert.ok(result.contract_package && typeof result.contract_package === 'object');
}

function findSource(sources, sourcePath) {
  const entries = Array.isArray(sources) ? sources : Object.values(sources ?? {});
  return entries.find((entry) => {
    const candidate = entry?.ref ?? entry?.source?.ref ?? entry?.descriptor?.ref;
    return candidate?.path === sourcePath;
  });
}

function assertRawBlobSource(policy, sourcePath, revision) {
  const source = findSource(policy.sources, sourcePath);
  assert.ok(source, `missing source descriptor for ${sourcePath}`);
  const descriptor = source.ref ? source : source.source ?? source.descriptor;
  assert.equal(descriptor.kind, 'git-blob');
  assert.equal(descriptor.representation, 'raw-bytes');
  assert.equal(descriptor.ref.repository, repository);
  assert.equal(descriptor.ref.revision, revision);
  assert.equal(descriptor.ref.path, sourcePath);
}

function currentTuple(policy, fixture, overrides = {}) {
  return {
    pr: work,
    head: fixture.headRevision,
    base_ref: 'main',
    base_sha: fixture.baseRevision,
    policy_ref: structuredClone(policy.policy_ref),
    contract_package: structuredClone(policy.contract_package),
    config_digest: policy.config_digest,
    activation_digest: policy.activation_digest,
    ...overrides,
  };
}

function evidenceRecord(policy, fixture, overrides = {}) {
  const current = currentTuple(policy, fixture);
  return {
    head: current.head,
    scope: 'Issue #8 policy and review checks',
    result: 'pass',
    evidence: [{ repository, comment_id: 103 }],
    pr: current.pr,
    base_ref: current.base_ref,
    base_sha: current.base_sha,
    policy_ref: structuredClone(current.policy_ref),
    contract_package: structuredClone(current.contract_package),
    config_digest: current.config_digest,
    activation_digest: current.activation_digest,
    policy_mode: policy.mode,
    producer_session: 'producer-session',
    reviewer_session: 'reviewer-session',
    reviewer_model: 'model-alpha',
    review_depth: 'full-scope',
    ...overrides,
  };
}

test('policy module exposes the planned resolution and evidence-check API', () => {
  if (policyImportError) {
    throw new Error(`Issue #8 policy runtime is unavailable; expected src/policy.js before behavioral tests: ${policyImportError.message}`, {
      cause: policyImportError,
    });
  }
  assert.equal(typeof policyModule.resolvePolicy, 'function');
  assert.equal(typeof policyModule.checkReviewEvidence, 'function');
});

test('resolvePolicy reads actual destination pre-change state and fixed raw Git objects', async (t) => {
  const runtime = await requirePolicy(t);
  if (!runtime) return;
  const fixture = await scenario(t, { activation: true });
  const result = await runtime.resolvePolicy({
    adapter: fixture.adapter,
    work,
    packageRoot: repositoryRoot,
    // These are deliberately ignored: policy is selected from the PR base.
    config: { project: { review: { internal: { allowed_models: ['candidate-only'] } } } },
    candidateConfig: { project: { review: { internal: { allowed_models: ['candidate-only'] } } } },
  });

  assertAvailable(result, 'activation');
  assert.deepEqual(result.config.project.review.internal.allowed_models, ['model-alpha', 'model-beta']);
  assert.equal(result.policy_ref.revision, fixture.policyRevision);
  assert.notEqual(result.policy_ref.revision, fixture.baseRevision);
  assert.notEqual(result.policy_ref.revision, fixture.headRevision);
  assert.equal(result.config_digest, sha256(fixture.configBytes));
  assert.equal(result.activation_digest, sha256(fixture.activationBytes));
  assertRawBlobSource(result, configPath, fixture.baseRevision);
  assertRawBlobSource(result, activationPath, fixture.baseRevision);
  assert.deepEqual(fixture.adapter.calls.readPull, [work]);
  assert.ok(fixture.adapter.calls.readBlob.some((ref) => ref.path === policyPath && ref.revision === fixture.policyRevision));
  assert.equal(fixture.adapter.calls.readBlob.some((ref) => ref.revision === fixture.headRevision), false);
  assert.equal(fixture.adapter.calls.readBlob.some((ref) => ref.revision === fixture.baseRevision && ref.path === policyPath), false);
});

test('complete bootstrap is available but preserves acceptance bodies and requires semantic authorization review', async (t) => {
  const runtime = await requirePolicy(t);
  if (!runtime) return;
  const fixture = await scenario(t, { activation: false });
  const result = await runtime.resolvePolicy({ adapter: fixture.adapter, work, packageRoot: repositoryRoot });

  assertAvailable(result, 'bootstrap');
  assert.equal(result.activation, null);
  assert.equal(result.activation_digest, null);
  assertRawBlobSource(result, configPath, fixture.baseRevision);
  assert.match(JSON.stringify(result.sources), new RegExp(policyAcceptanceBody.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(JSON.stringify(result.sources), new RegExp(proposalAcceptanceBody.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(result.config.project.bootstrap.authorized_by, 'example-owner');
  assertFinding(result.findings, /semantic|authorization|review|required/);
});

test('a valid policy heading anchor resolves against the fixed policy blob', async (t) => {
  const runtime = await requirePolicy(t);
  if (!runtime) return;
  const fixture = await scenario(t, {
    policyBytes: '# Accepted policy\n\n## Review policy basis\n\nRules for this fixture.\n',
    configMutate: (config) => {
      config.project.bootstrap.policy_ref.anchor = 'review-policy-basis';
    },
  });
  const result = await runtime.resolvePolicy({ adapter: fixture.adapter, work, packageRoot: repositoryRoot });

  assertAvailable(result, 'bootstrap');
  assert.equal(result.policy_ref.anchor, 'review-policy-basis');
});

test('a nonexistent policy heading anchor makes an otherwise existing policy unavailable', async (t) => {
  const runtime = await requirePolicy(t);
  if (!runtime) return;
  const fixture = await scenario(t, {
    policyBytes: '# Accepted policy\n\n## Review policy basis\n\nRules for this fixture.\n',
    configMutate: (config) => {
      config.project.bootstrap.policy_ref.anchor = 'does-not-exist';
    },
  });
  const result = await runtime.resolvePolicy({ adapter: fixture.adapter, work, packageRoot: repositoryRoot });

  assertUnavailable(result);
  assertFinding(result.findings, /anchor|heading|policy|unavailable/);
});

test('policy anchors follow GitHub slug rules for markup, inline links, spaces and punctuation', async (t) => {
  const runtime = await requirePolicy(t);
  if (!runtime) return;
  const fixture = await scenario(t, {
    policyBytes: '# Accepted policy\n\n## *Review* **scope** [guide](https://example.invalid/guide): v2!\n',
    configMutate: (config) => {
      config.project.bootstrap.policy_ref.anchor = 'review-scope-guide-v2';
    },
  });
  const result = await runtime.resolvePolicy({ adapter: fixture.adapter, work, packageRoot: repositoryRoot });

  assertAvailable(result, 'bootstrap');
  assert.equal(result.policy_ref.anchor, 'review-scope-guide-v2');
});

test('duplicate plain headings receive the documented incrementing anchor suffix', async (t) => {
  const runtime = await requirePolicy(t);
  if (!runtime) return;
  const fixture = await scenario(t, {
    policyBytes: '# Accepted policy\n\n## Plain heading\n\n## Duplicate heading\n\n## Duplicate heading\n',
    configMutate: (config) => {
      config.project.bootstrap.policy_ref.anchor = 'duplicate-heading-1';
    },
  });
  const result = await runtime.resolvePolicy({ adapter: fixture.adapter, work, packageRoot: repositoryRoot });

  assertAvailable(result, 'bootstrap');
  assert.equal(result.policy_ref.anchor, 'duplicate-heading-1');
});

test('headings inside fenced code are not policy section anchors', async (t) => {
  const runtime = await requirePolicy(t);
  if (!runtime) return;
  const fixture = await scenario(t, {
    policyBytes: '# Accepted policy\n\n```markdown\n## Fake heading\n```\n',
    configMutate: (config) => {
      config.project.bootstrap.policy_ref.anchor = 'fake-heading';
    },
  });
  const result = await runtime.resolvePolicy({ adapter: fixture.adapter, work, packageRoot: repositoryRoot });

  assertUnavailable(result);
  assertFinding(result.findings, /anchor|heading|policy|unavailable/);
});

test('ordinary acceptance evidence with another head remains semantic review input', async (t) => {
  const runtime = await requirePolicy(t);
  if (!runtime) return;
  const ordinaryEvidenceHead = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const comments = scenarioComments();
  comments[`${repository}#101`] = comment(101, JSON.stringify({
    head: ordinaryEvidenceHead,
    base_sha: ordinaryEvidenceHead,
    result: 'pass',
  }));
  const fixture = await scenario(t, { comments });
  const result = await runtime.resolvePolicy({ adapter: fixture.adapter, work, packageRoot: repositoryRoot });

  assertAvailable(result, 'bootstrap');
  assert.notEqual(result.policy_ref.revision, ordinaryEvidenceHead);
  assert.match(JSON.stringify(result.sources), new RegExp(ordinaryEvidenceHead));
  assertFinding(result.findings, /semantic|authorization|review|required/);
});

test('candidate-only bootstrap cannot authorize a policy when destination config is absent', async (t) => {
  const runtime = await requirePolicy(t);
  if (!runtime) return;
  const candidateConfig = makeConfig('1111111111111111111111111111111111111111');
  const fixture = await scenario(t, {
    config: false,
    candidateFiles: {
      [configPath]: `${JSON.stringify(candidateConfig)}\n`,
      'candidate/change.txt': 'candidate\n',
    },
  });
  const result = await runtime.resolvePolicy({ adapter: fixture.adapter, work, packageRoot: repositoryRoot });

  assertUnavailable(result);
  assert.equal(fixture.adapter.calls.readBlob.some((ref) => ref.path === configPath && ref.revision === fixture.headRevision), false);
  assert.ok(fixture.adapter.calls.readBlob.some((ref) => ref.path === configPath && ref.revision === fixture.baseRevision));
});

test('each required bootstrap field is mechanically missing rather than guessed', async (t) => {
  const runtime = await requirePolicy(t);
  if (!runtime) return;
  for (const field of ['policy_ref', 'policy_acceptance', 'proposal_acceptance', 'authorized_by']) {
    const fixture = await scenario(t, { configMutate: (config) => delete config.project.bootstrap[field] });
    const result = await runtime.resolvePolicy({ adapter: fixture.adapter, work, packageRoot: repositoryRoot });
    assertUnavailable(result);
    assertFinding(result.findings, new RegExp(field.replace('_', '[-_]')));
    await fixture.dispose();
  }
});

test('missing review/workflow declarations and unresolved bootstrap references make policy unavailable', async (t) => {
  const runtime = await requirePolicy(t);
  if (!runtime) return;
  const cases = [
    ['project.review', (config) => delete config.project.review],
    ['project.workflow', (config) => delete config.project.workflow],
    ['policy_ref', (config) => { config.project.bootstrap.policy_ref.path = 'policy/missing.md'; }],
    ['policy_acceptance', (config) => { config.project.bootstrap.policy_acceptance.comment_id = 999; }],
    ['proposal_acceptance', (config) => { config.project.bootstrap.proposal_acceptance.comment_id = 998; }],
  ];
  for (const [label, mutate] of cases) {
    const fixture = await scenario(t, { configMutate: mutate });
    const result = await runtime.resolvePolicy({ adapter: fixture.adapter, work, packageRoot: repositoryRoot });
    assertUnavailable(result);
    assertFinding(result.findings, new RegExp(label.replace('.', '[.]').replace('_', '[-_]')));
    await fixture.dispose();
  }
});

test('invalid or suspended activation never falls back to bootstrap', async (t) => {
  const runtime = await requirePolicy(t);
  if (!runtime) return;
  const suspended = await scenario(t, { activation: true, activationState: 'suspended' });
  const suspendedResult = await runtime.resolvePolicy({ adapter: suspended.adapter, work, packageRoot: repositoryRoot });
  assertUnavailable(suspendedResult);
  assert.equal(suspended.adapter.calls.readComment.length, 0, 'suspended activation must not read bootstrap acceptance');
  await suspended.dispose();

  const invalid = await scenario(t, {
    activation: true,
    activationMutate: (activation) => delete activation.policy_ref,
  });
  const invalidResult = await runtime.resolvePolicy({ adapter: invalid.adapter, work, packageRoot: repositoryRoot });
  assertUnavailable(invalidResult);
  assert.equal(invalid.adapter.calls.readComment.length, 0, 'invalid activation must not read bootstrap acceptance');
  await invalid.dispose();
});

test('bootstrap fallback requires a typed missing-path activation result', async (t) => {
  const runtime = await requirePolicy(t);
  if (!runtime) return;

  const absent = await scenario(t, { activation: false });
  let absence;
  try {
    await absent.adapter.readBlob({ repository, revision: absent.baseRevision, path: activationPath });
  } catch (error) {
    absence = error;
  }
  assert.equal(absence?.code, 'record-unavailable');
  assert.equal(absence?.details?.reason, 'path-missing');
  const absentResult = await runtime.resolvePolicy({ adapter: absent.adapter, work, packageRoot: repositoryRoot });
  assertAvailable(absentResult, 'bootstrap');
  await absent.dispose();

  for (const reason of ['not-a-blob', 'git-object-unavailable', 'invalid-response', undefined]) {
    const fixture = await scenario(t, {
      activation: true,
      readBlobFailureFor: (ref) => ref.path === activationPath ? {
        code: 'record-unavailable',
        message: `activation source failure: ${reason || 'missing reason'}`,
        ...(reason === undefined ? {} : { details: { reason } }),
      } : null,
    });
    const result = await runtime.resolvePolicy({ adapter: fixture.adapter, work, packageRoot: repositoryRoot });
    assertUnavailable(result);
    assert.equal(
      fixture.adapter.calls.readComment.some((ref) => ref.comment_id === 101 || ref.comment_id === 102),
      false,
      `activation ${reason || 'untyped'} failure must not fall back to bootstrap`,
    );
    await fixture.dispose();
  }

  const invalid = await scenario(t, {
    activation: true,
    activationBytesFor: () => Buffer.from('{ invalid activation JSON\n', 'utf8'),
  });
  const invalidResult = await runtime.resolvePolicy({ adapter: invalid.adapter, work, packageRoot: repositoryRoot });
  assertUnavailable(invalidResult);
  assert.equal(
    invalid.adapter.calls.readComment.some((ref) => ref.comment_id === 101 || ref.comment_id === 102),
    false,
    'present but invalid activation must not fall back to bootstrap',
  );
});

test('each required activation field and fixed reference is mechanically required', async (t) => {
  const runtime = await requirePolicy(t);
  if (!runtime) return;
  for (const field of ['schema_version', 'state', 'policy_ref', 'contract_package', 'activated_at', 'authorized_by', 'evidence']) {
    const fixture = await scenario(t, {
      activation: true,
      activationMutate: (activation) => delete activation[field],
    });
    const result = await runtime.resolvePolicy({ adapter: fixture.adapter, work, packageRoot: repositoryRoot });
    assertUnavailable(result);
    assert.equal(fixture.adapter.calls.readComment.length, 0, 'invalid activation must not fall back to bootstrap');
    assertFinding(result.findings, new RegExp(field.replace('_', '[-_]')));
    await fixture.dispose();
  }

  for (const [label, mutate] of [
    ['activation policy ref', (activation) => { activation.policy_ref.path = 'policy/missing.md'; }],
    ['activation evidence ref', (activation) => { activation.evidence = [{ repository, comment_id: 997 }]; }],
    ['activation package binding', (activation) => { activation.contract_package.name = 'missing-package'; }],
  ]) {
    const fixture = await scenario(t, { activation: true, activationMutate: mutate });
    const result = await runtime.resolvePolicy({ adapter: fixture.adapter, work, packageRoot: repositoryRoot });
    assertUnavailable(result);
    assert.equal(
      fixture.adapter.calls.readComment.some((ref) => ref.comment_id === 101 || ref.comment_id === 102),
      false,
      'unresolvable activation must not read bootstrap acceptance',
    );
    assertFinding(result.findings, /activation|policy|package|evidence|unavailable/, label);
    await fixture.dispose();
  }
});

test('active activation does not require bootstrap acceptance and keeps its fixed package/policy binding', async (t) => {
  const runtime = await requirePolicy(t);
  if (!runtime) return;
  const fixture = await scenario(t, {
    activation: true,
    configMutate: (config) => {
      config.project.bootstrap.policy_acceptance.comment_id = 999;
      config.project.bootstrap.proposal_acceptance.comment_id = 998;
    },
  });
  const result = await runtime.resolvePolicy({ adapter: fixture.adapter, work, packageRoot: repositoryRoot });

  assertAvailable(result, 'activation');
  assert.equal(fixture.adapter.calls.readComment.length, 1, 'only activation evidence is relevant to active policy');
  assert.equal(result.policy_ref.revision, fixture.policyRevision);
  assert.deepEqual(result.contract_package, fixture.config.project.workflow);
});

test('raw-byte config and activation digests change with bytes, not parsed JSON', async (t) => {
  const runtime = await requirePolicy(t);
  if (!runtime) return;
  const fixture = await scenario(t, {
    activation: true,
    configBytesFor: ({ config }) => Buffer.from(`${JSON.stringify(config)}\r\n`, 'utf8'),
    activationBytesFor: ({ activation }) => Buffer.from(` ${JSON.stringify(activation)} \n`, 'utf8'),
  });
  const result = await runtime.resolvePolicy({ adapter: fixture.adapter, work, packageRoot: repositoryRoot });

  assertAvailable(result, 'activation');
  assert.equal(result.config_digest, sha256(fixture.configBytes));
  assert.equal(result.activation_digest, sha256(fixture.activationBytes));
  assert.notEqual(result.config_digest, sha256(Buffer.from(`${JSON.stringify(result.config)}\n`, 'utf8')));
  assert.notEqual(result.activation_digest, sha256(Buffer.from(`${JSON.stringify(result.activation)}\n`, 'utf8')));
});

test('checkReviewEvidence accepts an exact independent internal full-scope assessment', async (t) => {
  const runtime = await requirePolicy(t);
  if (!runtime) return;
  const fixture = await scenario(t, { activation: true });
  const policy = await runtime.resolvePolicy({ adapter: fixture.adapter, work, packageRoot: repositoryRoot });
  const current = currentTuple(policy, fixture);
  const findings = runtime.checkReviewEvidence({
    record: evidenceRecord(policy, fixture),
    policy,
    current,
    reviewKind: 'internal',
  });
  assertDeclaredReviewKind(findings, 'internal');
});

test('checkReviewEvidence rejects missing or equal sessions and incomplete full-scope declarations', async (t) => {
  const runtime = await requirePolicy(t);
  if (!runtime) return;
  const fixture = await scenario(t, { activation: true });
  const policy = await runtime.resolvePolicy({ adapter: fixture.adapter, work, packageRoot: repositoryRoot });
  for (const [label, overrides] of [
    ['missing producer session', { producer_session: undefined }],
    ['missing reviewer session', { reviewer_session: undefined }],
    ['equal sessions', { reviewer_session: 'producer-session' }],
    ['missing model', { reviewer_model: undefined }],
    ['wrong depth', { review_depth: 'partial-scope' }],
  ]) {
    const record = evidenceRecord(policy, fixture, overrides);
    for (const key of Object.keys(overrides)) if (overrides[key] === undefined) delete record[key];
    const findings = runtime.checkReviewEvidence({ record, policy, current: currentTuple(policy, fixture), reviewKind: 'internal' });
    assertFinding(findings, /independ|session|full[-_ ]scope|depth|model/, label);
  }
});

test('checkReviewEvidence applies exact allowlist, exclusions, aliases and alias resolution failures', async (t) => {
  const runtime = await requirePolicy(t);
  if (!runtime) return;
  const fixture = await scenario(t, { activation: true });
  const policy = await runtime.resolvePolicy({ adapter: fixture.adapter, work, packageRoot: repositoryRoot });
  const current = currentTuple(policy, fixture);

  const aliasRecord = evidenceRecord(policy, fixture, { reviewer_model: 'primary' });
  assertDeclaredReviewKind(runtime.checkReviewEvidence({ record: aliasRecord, policy, current, reviewKind: 'internal' }), 'internal');

  for (const [label, model, policyMutation, pattern] of [
    ['not exact allowlist', 'model-alph', null, /model|eligible|allow/],
    ['excluded exact model', 'model-excluded', null, /excluded|model/],
    ['unresolved alias', 'unknown-alias', null, /alias|identity|model/],
    ['alias cycle', 'cycle-a', (value) => { value.config.project.review.model_aliases = { 'cycle-a': 'cycle-b', 'cycle-b': 'cycle-a' }; }, /alias|cycle|identity/],
    ['alias to excluded model', 'blocked', (value) => { value.config.project.review.model_aliases = { blocked: 'model-excluded' }; }, /excluded|alias|model/],
  ]) {
    const candidatePolicy = structuredClone(policy);
    policyMutation?.(candidatePolicy);
    const record = evidenceRecord(candidatePolicy, fixture, { reviewer_model: model });
    const findings = runtime.checkReviewEvidence({ record, policy: candidatePolicy, current, reviewKind: 'internal' });
    assertFinding(findings, pattern, label);
  }
});

test('explicit external review bypasses internal allowlist but still enforces independence, exclusions and depth', async (t) => {
  const runtime = await requirePolicy(t);
  if (!runtime) return;
  const fixture = await scenario(t, { activation: true });
  const policy = await runtime.resolvePolicy({ adapter: fixture.adapter, work, packageRoot: repositoryRoot });
  const current = currentTuple(policy, fixture);
  const external = evidenceRecord(policy, fixture, { reviewer_model: 'external-review-provider' });
  assertDeclaredReviewKind(runtime.checkReviewEvidence({ record: external, policy, current, reviewKind: 'external' }), 'external');

  const excluded = evidenceRecord(policy, fixture, { reviewer_model: 'model-excluded' });
  assertFinding(runtime.checkReviewEvidence({ record: excluded, policy, current, reviewKind: 'external' }), /excluded|model/);
  const wrongDepth = evidenceRecord(policy, fixture, { reviewer_model: 'external-review-provider', review_depth: 'partial-scope' });
  assertFinding(runtime.checkReviewEvidence({ record: wrongDepth, policy, current, reviewKind: 'external' }), /depth|full[-_ ]scope/);
  const sameSession = evidenceRecord(policy, fixture, { reviewer_model: 'external-review-provider', reviewer_session: 'producer-session' });
  assertFinding(runtime.checkReviewEvidence({ record: sameSession, policy, current, reviewKind: 'external' }), /independ|session/);
});

test('checkReviewEvidence rejects stale head, base, retarget, policy, package and raw digest context', async (t) => {
  const runtime = await requirePolicy(t);
  if (!runtime) return;
  const fixture = await scenario(t, { activation: true });
  const policy = await runtime.resolvePolicy({ adapter: fixture.adapter, work, packageRoot: repositoryRoot });
  const fields = [
    ['head', { head: '2222222222222222222222222222222222222222' }, /head|revision|stale/],
    ['base ref', { base_ref: 'release' }, /base[_ -]?ref|retarget|destination|stale/],
    ['base sha', { base_sha: '3333333333333333333333333333333333333333' }, /base|stale/],
    ['policy ref', { policy_ref: { ...policy.policy_ref, revision: '4444444444444444444444444444444444444444' } }, /policy|stale/],
    ['package', { contract_package: { ...policy.contract_package, version: '9.9.9' } }, /package|contract|stale/],
    ['config digest', { config_digest: '5555555555555555555555555555555555555555555555555555555555555555' }, /config|digest|stale/],
    ['activation digest', { activation_digest: '6666666666666666666666666666666666666666666666666666666666666666' }, /activation|digest|stale/],
    ['pull request', { pr: 'example/consumer#78' }, /pr|work|retarget|stale/],
  ];
  for (const [label, currentOverride, pattern] of fields) {
    const record = evidenceRecord(policy, fixture);
    const findings = runtime.checkReviewEvidence({
      record,
      policy,
      current: currentTuple(policy, fixture, currentOverride),
      reviewKind: 'internal',
    });
    assertFinding(findings, pattern, label);
  }
});

test('checkReviewEvidence reports unavailable policy instead of guessing review eligibility', async (t) => {
  const runtime = await requirePolicy(t);
  if (!runtime) return;
  const fixture = await scenario(t, { activation: true });
  const policy = await runtime.resolvePolicy({ adapter: fixture.adapter, work, packageRoot: repositoryRoot });
  const record = evidenceRecord(policy, fixture);
  const unavailable = { ...policy, status: 'unavailable', mode: null, config: null };
  const findings = runtime.checkReviewEvidence({ record, policy: unavailable, current: currentTuple(policy, fixture), reviewKind: 'internal' });
  assertFinding(findings, /policy|unavailable/);
});
