import assert from 'node:assert/strict';
import test from 'node:test';
import { captureManifest, checkManifest } from '../src/manifest.js';
import { validateRecord } from '../src/records.js';
import { commentSource, ref, repository, sha256 } from './fixtures/issue36-bootstrap/records.mjs';
import { blobKey, codedError, commentKey, scenario } from './fixtures/issue36-bootstrap/scenario.mjs';

const errors = (result) => result.findings.filter((finding) => finding.severity !== 'review');
const diagnostic = (result) => JSON.stringify(result.findings);
function assertSemanticNotice(result) {
  assert.ok(result.findings.some((finding) => finding.severity === 'review' &&
    /semantic|authority|independence|approval/i.test(`${finding.code} ${finding.message}`)), diagnostic(result));
  assert.equal(Object.hasOwn(result, 'approved'), false, 'mechanical source eligibility does not grant approval');
}

test('bootstrap capture retains full later verification and measured source bytes with honest original absence', async () => {
  const fixture = scenario();
  const input = fixture.captureArgs();
  // Capture must measure source bytes itself; a caller's guessed digest is not authoritative.
  input.deliveries[0].content_sha256 = 'f'.repeat(64);
  const captured = await captureManifest(input);
  assert.equal(captured.manifest.deliveries.length, 1, diagnostic(captured));
  const row = captured.manifest.deliveries[0];
  assert.deepEqual(row.initial_bootstrap, fixture.row.initial_bootstrap);
  assert.equal(row.content_sha256, fixture.row.content_sha256);
  assert.equal(row.policy_ref, null);
  assert.equal(row.policy_mode, null);
  assert.equal(Object.hasOwn(row, 'config_digest'), false);
  assert.equal(Object.hasOwn(row, 'activation_digest'), false);
  assert.deepEqual(captured.manifest.closeout_policy_ref, fixture.closeoutPolicyRef);
  assert.notDeepEqual(row.initial_bootstrap.verification.verification_policy_ref, fixture.closeoutPolicyRef);
  assert.equal(validateRecord('manifest', captured.manifest).valid, true);
  assert.equal(errors(captured).length, 0, diagnostic(captured));
  assertSemanticNotice(captured);
  const readComments = fixture.calls.filter((call) => call.method === 'readComment').map((call) => call.value.comment_id);
  for (const id of [401, 402, 403, 404, 405]) assert.ok(readComments.includes(id), `capture did not reacquire original/later comment ${id}`);
  for (const path of ['.assuredloop/config.json', '.assuredloop/activation.json']) {
    assert.ok(fixture.calls.some((call) => call.method === 'readBlob' && call.value.path === path &&
      call.value.revision === fixture.verification.base_sha), `no positive absent-base acquisition for ${path}`);
  }
  assert.ok(fixture.calls.some((call) => call.method === 'readCommit' && call.value.revision === fixture.verification.merge_sha));
});

test('unchanged bootstrap manifest independently revalidates squash relation and nested fixity', async () => {
  const fixture = scenario();
  const result = await checkManifest(fixture.checkArgs());
  assert.equal(result.valid, true, diagnostic(result));
  assertSemanticNotice(result);
  for (const id of [401, 402, 403, 404, 405]) {
    assert.ok(fixture.calls.some((call) => call.method === 'readComment' && call.value.comment_id === id));
  }
  assert.ok(fixture.calls.some((call) => call.method === 'readPull'));
  assert.ok(fixture.calls.some((call) => call.method === 'readCommit' && call.value.revision === fixture.verification.head));
});

test('bootstrap manifest supports raw Git original sources as well as decoded raw comment bytes', async () => {
  const fixture = scenario(); fixture.useGitOriginal();
  const result = await checkManifest(fixture.checkArgs());
  assert.equal(result.valid, true, diagnostic(result));
  assert.ok(fixture.calls.some((call) => call.method === 'readBlob' && call.value.path === 'reports/original-review.md'));
});

const invalidCases = [
  ['base config existed', (f) => f.put(ref(f.verification.base_sha, '.assuredloop/config.json'), f.configBytes)],
  ['base malformed config existed', (f) => f.put(ref(f.verification.base_sha, '.assuredloop/config.json'), '{bad json')],
  ['base unsupported config existed', (f) => f.put(ref(f.verification.base_sha, '.assuredloop/config.json'), '{"schema_version":999}')],
  ['base suspended activation existed', (f) => f.put(ref(f.verification.base_sha, '.assuredloop/activation.json'), '{"state":"suspended"}')],
  ['base malformed activation existed', (f) => f.put(ref(f.verification.base_sha, '.assuredloop/activation.json'), 'bad activation')],
  ['base configuration access denied', (f) => f.blobs.set(blobKey(ref(f.verification.base_sha, '.assuredloop/config.json')), codedError('tool-unavailable', 'insufficient-access'))],
  ['base activation unavailable is not confirmed absence', (f) => f.blobs.set(blobKey(ref(f.verification.base_sha, '.assuredloop/activation.json')), codedError('record-unavailable', 'git-object-unavailable'))],
  ['base object inaccessible', (f) => f.commits.delete(f.verification.base_sha)],
  ['unmerged candidate', (f) => { f.pull.merged = false; f.pull.state = 'open'; f.pull.merged_at = null; f.pull.merge_commit_sha = null; }],
  ['wrong actual merge', (f) => { f.pull.merge_commit_sha = '7'.repeat(40); }],
  ['wrong reviewed head', (f) => { f.pull.head.sha = '7'.repeat(40); }],
  ['wrong destination ref', (f) => { f.pull.base.ref = 'other'; }],
  ['wrong PR identity', (f) => { f.pull.number = 99; }],
  ['wrong destination repository', (f) => { f.pull.base.repo.full_name = 'other/consumer'; }],
  ['wrong squash parent', (f) => { f.commits.get(f.verification.merge_sha).parents = [{ sha: '7'.repeat(40) }]; }],
  ['unsupported two-parent merge', (f) => { f.commits.get(f.verification.merge_sha).parents.push({ sha: '7'.repeat(40) }); }],
  ['different delivered tree', (f) => { f.commits.get(f.verification.merge_sha).tree.sha = '7'.repeat(40); }],
  ['mismatched returned commit identity', (f) => { f.commits.get(f.verification.merge_sha).sha = '7'.repeat(40); }],
  ['delivered config differs from reviewed contribution', (f) => f.put(ref(f.verification.head, '.assuredloop/config.json'), Buffer.concat([f.configBytes, Buffer.from(' ')]))],
  ['bootstrap ref selects unrelated config', (f) => { f.verification.bootstrap_ref = ref('7'.repeat(40), '.assuredloop/config.json'); f.put(f.verification.bootstrap_ref, '{"schema_version":999}'); }],
  ['delivered bootstrap has no fixed policy acceptance', (f) => {
    delete f.config.project.bootstrap.policy_acceptance;
    for (const revision of [f.verification.head, f.verification.merge_sha]) f.put(ref(revision, '.assuredloop/config.json'), JSON.stringify(f.config));
  }],
  ['policy acceptance purpose points to a different source', (f) => { f.verification.sources[0].source = structuredClone(f.verification.sources[1].source); f.verification.sources[0].content_sha256 = f.verification.sources[1].content_sha256; }],
  ['proposal acceptance purpose points to a different source', (f) => { f.verification.sources[1].source = structuredClone(f.verification.sources[0].source); f.verification.sources[1].content_sha256 = f.verification.sources[0].content_sha256; }],
  ['later verifier selected a different policy', (f) => { f.verification.verification_policy_ref = ref('7'.repeat(40), 'policy/candidate.md'); }],
  ['later verification policy unavailable', (f) => { f.verificationPolicy.status = 'unavailable'; }],
  ['later verifier same session', (f) => { f.verification.reviewer_session = f.verification.producer_session; }],
  ['later reviewer not allowed by current policy', (f) => { f.verification.reviewer_model = 'other-model'; }],
  ['later reviewer excluded by current policy', (f) => { f.verificationPolicy.config.project.review.excluded_models.push('gpt-6-astra'); }],
  ['later assessment precedes actual delivery', (f) => { f.verification.verified_at = '2026-09-10T18:00:00Z'; }],
  ['later reviewer withheld acceptance after scope-only owner approval', (f) => { f.verification.result = 'revise'; f.verification.scope = 'Owner accepted Proposal scope only; fixed-policy adoption is not accepted.'; }],
  ['later reviewer withheld acceptance after wrong fixed policy approval', (f) => { f.verification.result = 'revise'; f.verification.scope = 'Owner approved another policy revision; this fixed binding remains unaccepted.'; }],
  ['later reviewer withheld acceptance after original same-session review', (f) => { f.verification.result = 'revise'; f.verification.scope = 'Original delivery producer reviewed its own work; genuine independence is missing.'; }],
  ['later reviewer reports incomplete task coverage', (f) => { f.verification.result = 'incomplete'; f.verification.scope = 'Task 1.2 remains missing from the original reviewed contribution.'; }],
];

for (const [name, mutate] of invalidCases) {
  test(`bootstrap eligibility rejects ${name} during capture and revalidation`, async () => {
    const fixture = scenario(); mutate(fixture); fixture.refreshLater();
    const capture = await captureManifest(fixture.captureArgs());
    assert.ok(errors(capture).length > 0, `capture accepted ${name}: ${diagnostic(capture)}`);
    const checked = await checkManifest(fixture.checkArgs());
    assert.equal(checked.valid, false, `revalidation accepted ${name}`);
    assert.ok(errors(checked).length > 0, diagnostic(checked));
  });
}

for (const purpose of ['policy-acceptance', 'proposal-acceptance', 'review', 'delivery', 'later-verification']) {
  for (const failure of ['drift', 'missing', 'wrong returned identity']) {
    test(`bootstrap ${purpose} ${failure} is detected in capture and revalidation`, async () => {
      const fixture = scenario();
      const source = purpose === 'later-verification' ? fixture.laterSource
        : fixture.verification.sources.find((item) => item.purpose === purpose).source;
      const key = commentKey(source);
      if (failure === 'missing') fixture.comments.delete(key);
      else if (failure === 'wrong returned identity') fixture.comments.get(key).id += 1000;
      else fixture.comments.get(key).body += '\r\nsource changed\n';
      const captured = await captureManifest(fixture.captureArgs());
      assert.ok(errors(captured).length > 0, `capture ignored ${purpose} ${failure}`);
      const checked = await checkManifest(fixture.checkArgs());
      assert.equal(checked.valid, false, `revalidation ignored ${purpose} ${failure}`);
    });
  }
}

test('Git original review drift remains visible without changing the later source', async () => {
  const fixture = scenario(); fixture.useGitOriginal();
  const source = fixture.verification.sources[2].source;
  fixture.put(source.ref, 'changed original review\n');
  assert.equal((await checkManifest(fixture.checkArgs())).valid, false);
  assert.ok(errors(await captureManifest(fixture.captureArgs())).length > 0);
});

test('nested stored verification cannot differ from its unchanged source', async () => {
  const fixture = scenario();
  fixture.row.initial_bootstrap.verification.scope = 'Caller rewrote the original contribution';
  assert.equal((await checkManifest(fixture.checkArgs())).valid, false);
  assert.ok(errors(await captureManifest(fixture.captureArgs())).length > 0);
});

test('capture compares caller original summary with typed bootstrap subject', async () => {
  for (const [field, value] of [['reviewed_head', '7'.repeat(40)], ['base_sha', '7'.repeat(40)],
    ['base_ref', 'wrong'], ['prs', [`${repository}#99`]], ['scope', 'Unrelated contribution'],
    ['policy_ref', ref('7'.repeat(40), 'policy/candidate.md')], ['policy_mode', 'bootstrap']]) {
    const fixture = scenario(); fixture.row[field] = value;
    const result = await captureManifest(fixture.captureArgs());
    assert.ok(errors(result).length > 0, `${field} contradiction was ignored`);
    assert.equal((await checkManifest(fixture.checkArgs())).valid, false, `${field} contradiction revalidated`);
  }
});

test('current verification policy and adapter ceiling both bound nested original acquisition', async () => {
  for (const allowInPolicy of [false, true]) {
    const fixture = scenario();
    const forbidden = commentSource(901, 'forbidden/private');
    fixture.verification.sources[2].source = forbidden;
    fixture.comments.set(commentKey(forbidden), { id: 901, body: 'otherwise reachable original review' });
    fixture.verification.sources[2].content_sha256 = sha256('otherwise reachable original review');
    if (allowInPolicy) fixture.verificationPolicy.config.repository.allowed_reference_repositories = ['forbidden/private'];
    fixture.config.repository.allowed_reference_repositories = ['forbidden/private'];
    fixture.refreshLater();
    const result = await checkManifest(fixture.checkArgs());
    assert.equal(result.valid, false);
    if (!allowInPolicy) assert.equal(fixture.calls.some((call) => call.value?.repository === 'forbidden/private'), false,
      'candidate config cannot broaden accepted verification policy permissions');
  }
});

test('current policy is required independently of the tagged verifier choice', async () => {
  const fixture = scenario();
  const captureArgs = fixture.captureArgs(); delete captureArgs.verificationPolicy;
  assert.ok(errors(await captureManifest(captureArgs)).length > 0);
  const checkArgs = fixture.checkArgs(); delete checkArgs.verificationPolicy;
  assert.equal((await checkManifest(checkArgs)).valid, false);
});

test('ordinary unverified historical null policy remains a gap', async () => {
  const fixture = scenario(); delete fixture.row.initial_bootstrap;
  const captured = await captureManifest(fixture.captureArgs());
  assert.equal(captured.manifest.deliveries.length, 1);
  assert.ok(captured.findings.some((finding) => finding.code === 'audit-data-unavailable'));
  const result = await checkManifest({ ...fixture.checkArgs(), manifest: captured.manifest });
  assert.equal(result.valid, false);
  assert.ok(result.findings.some((finding) => finding.code === 'audit-data-unavailable'));
});

test('raw comment normalization is prohibited even when rendered text is unchanged', async () => {
  const fixture = scenario();
  const source = fixture.verification.sources[0].source;
  const comment = fixture.comments.get(commentKey(source));
  comment.body = comment.body.normalize('NFC').replaceAll('\r\n', '\n');
  assert.equal((await checkManifest(fixture.checkArgs())).valid, false);
});

test('malformed tagged later source cannot fall through to historical prose', async () => {
  const fixture = scenario();
  fixture.verification.policy_ref = fixture.verification.verification_policy_ref;
  fixture.refreshLater();
  assert.ok(errors(await captureManifest(fixture.captureArgs())).length > 0);
  assert.equal((await checkManifest(fixture.checkArgs())).valid, false);
});

test('human authority remains a semantic obligation even with consistent sources and different session strings', async () => {
  const fixture = scenario();
  const comment = fixture.comments.get(commentKey(fixture.verification.sources[0].source));
  comment.body = 'I accept scope only; this text does not accept a fixed workflow policy.\n';
  fixture.verification.sources[0].content_sha256 = sha256(comment.body);
  fixture.refreshLater();
  const result = await checkManifest(fixture.checkArgs());
  // Presence/hash consistency cannot authenticate the speaker or decide the
  // meaning of arbitrary prose. A real reviewer must reject semantic acceptance.
  assertSemanticNotice(result);
});
