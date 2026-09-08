import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const schemaUrl = new URL('../schemas/workflow.schema.json', import.meta.url);
const recordsUrl = new URL('./fixtures/records/', import.meta.url);
const templatesUrl = new URL('../templates/records/', import.meta.url);
const runtimeUrl = new URL('../src/records.js', import.meta.url);

function readFixture(name) {
  return JSON.parse(readFileSync(new URL(name, recordsUrl), 'utf8'));
}

async function validate(kind, value) {
  let module;
  try {
    module = await import(runtimeUrl.href);
  } catch (error) {
    throw new Error(
      `Issue #6 runtime is unavailable; expected src/records.js before behavioral tests: ${error.message}`,
      { cause: error },
    );
  }

  assert.equal(typeof module.validateRecord, 'function');
  const result = await module.validateRecord(kind, value);
  assert.equal(typeof result, 'object');
  assert.ok(result !== null);
  assert.equal(typeof result.valid, 'boolean');
  assert.ok(Array.isArray(result.errors));
  return result;
}

function clone(value) {
  return structuredClone(value);
}

function assertValid(result, message = 'record should be valid') {
  assert.equal(result.valid, true, message);
  assert.deepEqual(result.errors, [], 'valid records should not report errors');
}

function assertInvalid(result, message = 'record should be invalid') {
  assert.equal(result.valid, false, message);
  assert.ok(result.errors.length > 0, 'invalid records should explain at least one error');
}

test('workflow schema exposes one reusable root with every record definition', () => {
  const schema = JSON.parse(readFileSync(schemaUrl, 'utf8'));

  assert.equal(typeof schema, 'object');
  assert.ok(schema !== null);
  assert.equal(typeof schema.$defs, 'object');

  for (const definition of [
    'config',
    'repoRef',
    'planRef',
    'issue',
    'pr',
    'evidence',
    'activation',
    'manifest',
    'selfChangeDecision',
  ]) {
    assert.ok(Object.hasOwn(schema.$defs, definition), `missing $defs.${definition}`);
  }
});

test('every readable record template validates through its declared record kind', async () => {
  const templateKinds = new Map([
    ['activation.json', 'activation'],
    ['config.json', 'config'],
    ['evidence.json', 'evidence'],
    ['issue.json', 'issue'],
    ['manifest.json', 'manifest'],
    ['planRef.json', 'planRef'],
    ['pr.json', 'pr'],
    ['repoRef.json', 'repoRef'],
    ['selfChangeDecision.json', 'selfChangeDecision'],
  ]);
  const templateFiles = readdirSync(templatesUrl).filter((name) => name.endsWith('.json')).sort();

  assert.deepEqual(templateFiles, [...templateKinds.keys()].sort());
  for (const name of templateFiles) {
    const value = JSON.parse(readFileSync(new URL(name, templatesUrl), 'utf8'));
    assertValid(await validate(templateKinds.get(name), value), `${name} must validate as ${templateKinds.get(name)}`);
  }
});

test('record templates contain sanitized example identities rather than consumer history', () => {
  const forbiddenTemplateData = [
    /\bguwenqing\b/i,
    /5576464303/,
    /owner:wenqing/,
    /gpt-6-astra/,
    /gpt-5\.6-sol/,
    /\bfable\b/i,
  ];

  for (const name of readdirSync(templatesUrl).filter((entry) => entry.endsWith('.json')).sort()) {
    const content = readFileSync(new URL(name, templatesUrl), 'utf8');
    for (const forbidden of forbiddenTemplateData) {
      assert.doesNotMatch(content, forbidden, `${name} contains consumer-specific data matching ${forbidden}`);
    }
  }
});

test('valid repository and plan references use immutable, normalized paths', async () => {
  assertValid(await validate('repoRef', readFixture('repo-ref.json')));
  assertValid(await validate('planRef', readFixture('plan-ref.json')));
});

test('repository references reject malformed identity, revision, and path traversal', async () => {
  const valid = readFixture('repo-ref.json');

  for (const [field, value] of [
    ['repository', 'not-an-owner-repository'],
    ['revision', 'not-a-commit'],
    ['path', '../outside.txt'],
    ['path', '/absolute.txt'],
    ['path', 'docs\\outside.txt'],
  ]) {
    const candidate = clone(valid);
    candidate[field] = value;
    assertInvalid(await validate('repoRef', candidate), `${field}=${value} must be rejected`);
  }

  for (const path of ['./x', 'a//b', 'contains\u0000control', 'contains\u001fcontrol']) {
    const candidate = clone(valid);
    candidate.path = path;
    assertInvalid(await validate('repoRef', candidate), `path=${JSON.stringify(path)} must be rejected`);
  }

  const repositoryRootRef = clone(valid);
  repositoryRootRef.path = '.';
  assertValid(await validate('repoRef', repositoryRootRef), 'the repository root is a normalized path');
});

test('plan references require a nonempty task-item list and do not accept RepoRef-only fields', async () => {
  const valid = readFixture('plan-ref.json');

  for (const candidate of [
    { ...clone(valid), items: [] },
    { ...clone(valid), items: [''] },
    { ...clone(valid), items: ['not-a-task-number'] },
    { ...clone(valid), anchor: 'unexpected-heading' },
  ]) {
    assertInvalid(await validate('planRef', candidate));
  }
});

test('config includes workflow package, review policy, target binding, mappings, and both bootstrap evidence forms', async () => {
  const config = readFixture('config-bootstrap-comment.json');
  assert.equal(typeof config.project.bootstrap.policy_acceptance.comment_id, 'number');
  assert.equal(typeof config.project.bootstrap.proposal_acceptance.revision, 'string');
  assertValid(await validate('config', config));
});

test('config may use a versioned file for policy acceptance and a GitHub comment for proposal acceptance', async () => {
  assertValid(await validate('config', readFixture('config-bootstrap-file.json')));
});

test('config rejects missing required bindings, wrong types, and unnamespaced extension keys', async () => {
  const valid = readFixture('config-bootstrap-comment.json');
  const cases = [];

  const missingWorkflow = clone(valid);
  delete missingWorkflow.project.workflow;
  cases.push(missingWorkflow);

  const wrongVersion = clone(valid);
  wrongVersion.schema_version = '1';
  cases.push(wrongVersion);

  const missingRepositoryName = clone(valid);
  delete missingRepositoryName.repository.name;
  cases.push(missingRepositoryName);

  const wrongAllowedModels = clone(valid);
  wrongAllowedModels.project.review.internal.allowed_models = [];
  cases.push(wrongAllowedModels);

  const wrongContextLimit = clone(valid);
  wrongContextLimit.project.review.context.max_inline_bytes = 0;
  cases.push(wrongContextLimit);

  const wrongTools = clone(valid);
  wrongTools.repository.tools = 'codex';
  cases.push(wrongTools);

  const wrongIntegrityAlgorithm = clone(valid);
  wrongIntegrityAlgorithm.project.workflow.integrity =
    'md5-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
  cases.push(wrongIntegrityAlgorithm);

  const wrongIntegrityLength = clone(valid);
  wrongIntegrityLength.project.workflow.integrity =
    'sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
  cases.push(wrongIntegrityLength);

  const unnamespacedExtension = clone(valid);
  unnamespacedExtension.project.extensions.policy = { enabled: true };
  cases.push(unnamespacedExtension);

  for (const field of ['policy_ref', 'policy_acceptance', 'proposal_acceptance', 'authorized_by']) {
    const missingBootstrapField = clone(valid);
    delete missingBootstrapField.project.bootstrap[field];
    cases.push(missingBootstrapField);
  }

  const wrongBootstrapEvidence = clone(valid);
  wrongBootstrapEvidence.project.bootstrap.policy_acceptance = { repository: 'bad' };
  cases.push(wrongBootstrapEvidence);

  const wrongBootstrapTypes = clone(valid);
  wrongBootstrapTypes.project.bootstrap.policy_ref = 'not-a-repo-ref';
  cases.push(wrongBootstrapTypes);

  const wrongPolicyAcceptanceType = clone(valid);
  wrongPolicyAcceptanceType.project.bootstrap.policy_acceptance = 42;
  cases.push(wrongPolicyAcceptanceType);

  const wrongProposalAcceptanceType = clone(valid);
  wrongProposalAcceptanceType.project.bootstrap.proposal_acceptance = 'not-an-evidence-ref';
  cases.push(wrongProposalAcceptanceType);

  const wrongAuthorizedByType = clone(valid);
  wrongAuthorizedByType.project.bootstrap.authorized_by = 42;
  cases.push(wrongAuthorizedByType);

  const mixedEvidenceRef = clone(valid);
  mixedEvidenceRef.project.bootstrap.policy_acceptance = {
    repository: 'example/consumer',
    comment_id: 123456789,
    revision: '0123456789abcdef0123456789abcdef01234567',
    path: 'README.md',
  };
  cases.push(mixedEvidenceRef);

  for (const candidate of cases) {
    assertInvalid(await validate('config', candidate));
  }
});

test('config does not accept legacy or unrequested workflow fields', async () => {
  const candidate = clone(readFixture('config-bootstrap-comment.json'));
  candidate.repository.base_branch = 'main';
  candidate.project.workflow.agreed_destination = 'main';
  assertInvalid(await validate('config', candidate));

  const unknownPackageField = clone(readFixture('config-bootstrap-comment.json'));
  unknownPackageField.project.workflow.registry = 'npm';
  assertInvalid(await validate('config', unknownPackageField));

  const nestedPackageField = clone(readFixture('config-bootstrap-comment.json'));
  nestedPackageField.project.workflow.contractPackage = {
    name: 'another-package',
    version: '1.0.0',
  };
  assertInvalid(await validate('config', nestedPackageField));
});

test('routed Issues carry an authoritative activity selector, request, basis, and plan references', async () => {
  assertValid(await validate('issue', readFixture('issue.json')));
});

test('Issue activity is restricted to the seven work guidance selectors', async () => {
  const valid = readFixture('issue.json');

  for (const activity of ['adopt', 'triage', 'plan', 'research', 'deliver', 'review', 'closeout']) {
    const candidate = clone(valid);
    candidate.activity = activity;
    assertValid(await validate('issue', candidate), `${activity} is a supported activity`);
  }

  const invalid = clone(valid);
  invalid.activity = 'development';
  assertInvalid(await validate('issue', invalid));
});

test('Issues reject missing basis and malformed qualified work references', async () => {
  const valid = readFixture('issue.json');

  const missingBasis = clone(valid);
  delete missingBasis.basis;
  assertInvalid(await validate('issue', missingBasis));

  const badRequest = clone(valid);
  badRequest.request = 'issue-1';
  assertInvalid(await validate('issue', badRequest));

  const badDependency = clone(valid);
  badDependency.depends_on = ['https://github.com/example/project/issues/2'];
  assertInvalid(await validate('issue', badDependency));
});

test('a legitimate no-Spec Issue uses an explicit reason instead of an empty basis alone', async () => {
  assertValid(await validate('issue', readFixture('issue-no-spec.json')));

  const noReason = clone(readFixture('issue-no-spec.json'));
  delete noReason.no_spec_reason;
  assertInvalid(await validate('issue', noReason));
});

test('PR records carry Issue links, scope basis, and optional plan context', async () => {
  assertValid(await validate('pr', readFixture('pr.json')));
});

test('PR records reject missing issues/basis and M-R3 destination or staging fields', async () => {
  const valid = readFixture('pr.json');

  const missingIssues = clone(valid);
  delete missingIssues.issues;
  assertInvalid(await validate('pr', missingIssues));

  const missingBasis = clone(valid);
  delete missingBasis.basis;
  assertInvalid(await validate('pr', missingBasis));

  const unrequestedFields = clone(valid);
  unrequestedFields.agreed_destination = 'main';
  unrequestedFields.staging_outcome = 'merged';
  assertInvalid(await validate('pr', unrequestedFields));
});

test('activation records pin policy, contracts, owner declaration, and evidence', async () => {
  assertValid(await validate('activation', readFixture('activation.json')));
});

test('activation rejects missing fields, unsupported state, and malformed timestamps', async () => {
  const valid = readFixture('activation.json');

  const missingPolicy = clone(valid);
  delete missingPolicy.policy_ref;
  assertInvalid(await validate('activation', missingPolicy));

  const badState = clone(valid);
  badState.state = 'enabled';
  assertInvalid(await validate('activation', badState));

  const badTimestamp = clone(valid);
  badTimestamp.activated_at = 'yesterday';
  assertInvalid(await validate('activation', badTimestamp));
});

test('UTC timestamp fields reject impossible calendar values', async () => {
  for (const timestamp of [
    '2026-02-29T00:00:00Z',
    '2026-04-31T12:00:00Z',
    '2026-13-01T00:00:00Z',
    '2026-01-01T24:00:00Z',
  ]) {
    const activation = clone(readFixture('activation.json'));
    activation.activated_at = timestamp;
    assertInvalid(await validate('activation', activation), `${timestamp} must be rejected`);

    const manifest = clone(readFixture('manifest.json'));
    manifest.captured_at = timestamp;
    assertInvalid(await validate('manifest', manifest), `${timestamp} must be rejected`);
  }
});

test('PR evidence binds candidate and destination assessment, with activation mode', async () => {
  assertValid(await validate('evidence', readFixture('evidence-pr-activation.json')));
});

test('bootstrap PR evidence preserves a null activation digest and still carries the complete audit envelope', async () => {
  const evidence = readFixture('evidence-pr-bootstrap.json');
  assert.equal(evidence.activation_digest, null);
  assert.equal(evidence.policy_mode, 'bootstrap');
  assertValid(await validate('evidence', evidence));
});

test('non-revisioned research evidence may use head null only with a reason', async () => {
  assertValid(await validate('evidence', readFixture('evidence-research.json')));

  const missingReason = clone(readFixture('evidence-research.json'));
  delete missingReason.no_head_reason;
  assertInvalid(await validate('evidence', missingReason));
});

test('evidence checks conditional command/exit and review envelopes structurally', async () => {
  const valid = readFixture('evidence-pr-activation.json');

  const commandOnly = clone(valid);
  delete commandOnly.exit_code;
  assertInvalid(await validate('evidence', commandOnly));

  const reviewOnly = clone(valid);
  delete reviewOnly.reviewer_model;
  assertInvalid(await validate('evidence', reviewOnly));

  const wrongDigest = clone(valid);
  wrongDigest.config_digest = 'short';
  assertInvalid(await validate('evidence', wrongDigest));

  const activationModeWithoutDigest = clone(valid);
  activationModeWithoutDigest.activation_digest = null;
  assertInvalid(await validate('evidence', activationModeWithoutDigest));
});

test('ordinary Evidence records do not accept self-change decision fields or M-R3 delivery fields', async () => {
  const candidate = clone(readFixture('evidence-research.json'));
  candidate.record_type = 'self-change-decision';
  candidate.selection = 'improvement';
  candidate.agreed_destination = 'main';
  assertInvalid(await validate('evidence', candidate));
});

test('manifest preserves per-delivery audit metadata and separate decisions', async () => {
  assertValid(await validate('manifest', readFixture('manifest.json')));
});

test('manifest rejects missing per-delivery audit data and misplaced closeout policy', async () => {
  const valid = readFixture('manifest.json');

  const missingBase = clone(valid);
  delete missingBase.deliveries[0].base_sha;
  assertInvalid(await validate('manifest', missingBase));

  const substitutedPolicy = clone(valid);
  substitutedPolicy.deliveries[0].policy_ref = clone(valid.closeout_policy_ref);
  substitutedPolicy.deliveries[0].closeout_policy_ref = clone(valid.closeout_policy_ref);
  assertInvalid(await validate('manifest', substitutedPolicy));

  const invalidDigest = clone(valid);
  invalidDigest.deliveries[0].content_sha256 = 'not-a-sha256';
  assertInvalid(await validate('manifest', invalidDigest));
});

test('manifest retains explicit null audit fields for a non-PR source', async () => {
  const candidate = clone(readFixture('manifest.json'));
  const delivery = candidate.deliveries[0];
  delete delivery.prs;
  delivery.base_ref = null;
  delivery.base_sha = null;
  delivery.policy_ref = null;
  delivery.policy_mode = null;
  delivery.source = {
    kind: 'git-blob',
    representation: 'raw-bytes',
    ref: {
      repository: 'example/framework',
      revision: '0123456789abcdef0123456789abcdef01234567',
      path: 'test/schema.test.js'
    }
  };
  assertValid(await validate('manifest', candidate));
});

test('self-change decision is a distinct closed record shape', async () => {
  assertValid(await validate('selfChangeDecision', readFixture('self-change-decision.json')));
});

test('self-change decision requires selection/work/rationale/authorization/evidence and rejects Evidence fields', async () => {
  const valid = readFixture('self-change-decision.json');

  const missingRationale = clone(valid);
  delete missingRationale.rationale;
  assertInvalid(await validate('selfChangeDecision', missingRationale));

  const missingWorkForImprovement = clone(valid);
  missingWorkForImprovement.work = null;
  assertInvalid(await validate('selfChangeDecision', missingWorkForImprovement));

  const mixedRecord = clone(valid);
  mixedRecord.head = '0123456789abcdef0123456789abcdef01234567';
  mixedRecord.result = 'pass';
  assertInvalid(await validate('selfChangeDecision', mixedRecord));
});

test('not-accepted self-change decision alone may have null work', async () => {
  const candidate = clone(readFixture('self-change-decision.json'));
  candidate.selection = 'not-accepted';
  candidate.work = null;
  assertValid(await validate('selfChangeDecision', candidate));
});

test('unsupported record kinds return a structured invalid result', async () => {
  const result = await validate('unknownKind', {});
  assertInvalid(result);
});
