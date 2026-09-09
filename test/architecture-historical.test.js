import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

import { resolveHistoricalPolicy } from '../src/policy.js';
import { validateRecord } from '../src/records.js';
import { legacyBytes, makeLegacyScenario, provenance } from './fixtures/architecture-historical/helpers.mjs';
import { makeHistoricalFixture } from './fixtures/historical-policy/helpers.mjs';

const execFile = promisify(execFileCallback);
const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const packageMetadata = JSON.parse(readFileSync(new URL('../contracts/metadata.json', import.meta.url), 'utf8'));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const findingsText = (result) => JSON.stringify(result.findings);

test('legacy input retains exact old committed five-category discipline bytes and original digest', async () => {
  const { stdout } = await execFile('git', ['show', `${provenance.source_ref.revision}:${provenance.source_ref.path}`],
    { cwd: packageRoot, encoding: 'buffer' });
  assert.deepEqual(legacyBytes, stdout);
  assert.equal(digest(legacyBytes), provenance.content_sha256);
  const config = JSON.parse(legacyBytes);
  assert.deepEqual(Object.keys(config.repository.labels.type).sort(), ['bug', 'epic', 'request', 'spike', 'task']);
  assert.ok(Object.hasOwn(config.repository.labels, 'discipline'));
  const current = validateRecord('config', config);
  assert.equal(current.valid, false, 'retaining old bytes must not relax current configuration acceptance');
  assert.match(JSON.stringify(current.errors), /discipline/);
});

test('unsupported legacy history is unavailable with original source, digest and assessment preserved', async (t) => {
  const scenario = await makeLegacyScenario(t);
  const originalRecord = structuredClone(scenario.record);
  const originalPull = structuredClone(scenario.pull);
  assert.equal(validateRecord('evidence', scenario.record).valid, true, 'legacy configuration is not malformed evidence');
  const result = await resolveHistoricalPolicy(scenario);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.mode, null);
  assert.equal(result.config_digest, provenance.content_sha256);
  assert.deepEqual(result.config, JSON.parse(legacyBytes));
  const source = result.sources.find((entry) => entry.role === 'config');
  assert.ok(source);
  assert.deepEqual(source.source, { kind: 'git-blob', representation: 'raw-bytes', ref: scenario.configRef });
  assert.deepEqual(Buffer.from(source.content, 'utf8'), legacyBytes);
  assert.equal(source.content_sha256, provenance.content_sha256);
  assert.equal(result.context.base_sha, originalRecord.base_sha);
  assert.equal(result.context.pr, originalRecord.pr);
  assert.equal(result.context.live_authority, false);
  assert.deepEqual(scenario.record, originalRecord, 'recorded acceptance, package, policy and digest remain unchanged');
  assert.deepEqual(scenario.pull, originalPull);
  assert.deepEqual(scenario.calls.readPull, [originalRecord.pr]);
  assert.deepEqual(scenario.calls.readBlob, [scenario.configRef], 'no current/head or secondary-source fallback');
  assert.deepEqual(scenario.calls.readComment, []);
  assert.match(findingsText(result), /policy-unavailable/);
  assert.match(findingsText(result), /discipline|architecture-task/);
  assert.doesNotMatch(findingsText(result), /historical-evidence-invalid|historical-policy-mismatch/);
});

test('unavailable legacy reconstruction must not claim successful recorded-policy reconstruction', async (t) => {
  const scenario = await makeLegacyScenario(t);
  const result = await resolveHistoricalPolicy(scenario);
  assert.equal(result.status, 'unavailable');
  assert.doesNotMatch(findingsText(result), /Reconstructed recorded pre-merge policy/i,
    'an unsupported historical configuration must not produce a successful reconstruction statement');
});

test('malformed legacy assessment and wrong PR identity remain distinct invalid failures', async (t) => {
  for (const [change, code] of [
    [(record) => { delete record.scope; }, 'historical-evidence-invalid'],
    [(record) => { record.pr = 'example/consumer#78'; }, 'historical-pr-identity-invalid'],
    [(record) => { record.head = '9'.repeat(40); }, 'historical-tuple-mismatch'],
  ]) {
    const scenario = await makeLegacyScenario(t);
    change(scenario.record);
    const original = structuredClone(scenario.record);
    const result = await resolveHistoricalPolicy(scenario);
    assert.equal(result.status, 'invalid');
    assert.ok(result.findings.some((finding) => finding.code === code), findingsText(result));
    assert.deepEqual(scenario.calls.readBlob, [], 'invalid assessment is rejected before config acquisition');
    assert.deepEqual(scenario.record, original);
  }
});

test('a genuine digest mismatch against acquired legacy bytes remains invalid despite schema incompatibility', async (t) => {
  const scenario = await makeLegacyScenario(t);
  scenario.record.config_digest = '9'.repeat(64);
  const original = structuredClone(scenario.record);
  const result = await resolveHistoricalPolicy(scenario);
  assert.equal(result.config_digest, provenance.content_sha256, 'the acquired original digest is available for comparison');
  assert.equal(result.status, 'invalid', 'known byte mismatch is distinct from unsupported historical schema');
  assert.ok(result.findings.some((finding) => /mismatch/.test(finding.code) && /config.*digest|digest.*config/i.test(finding.message)), findingsText(result));
  assert.deepEqual(scenario.record, original);
  assert.deepEqual(scenario.calls.readBlob, [scenario.configRef]);
});

test('current six-category synthetic historical fixture reconstructs; this is not legacy compatibility proof', async (t) => {
  const fixture = await makeHistoricalFixture({ packageMetadata });
  t.after(() => fixture.dispose());
  const original = structuredClone(fixture.record);
  assert.equal(Object.keys(JSON.parse(fixture.configBytes).repository.labels.type).length, 6);
  assert.equal(Object.hasOwn(JSON.parse(fixture.configBytes).repository.labels, 'discipline'), false);
  const result = await resolveHistoricalPolicy({ adapter: fixture.adapter, record: fixture.record, packageRoot });
  assert.equal(result.status, 'available', findingsText(result));
  assert.equal(result.config_digest, digest(fixture.configBytes));
  assert.deepEqual(fixture.record, original);
  assert.equal(fixture.adapter.calls.readBlob.some((ref) =>
    [fixture.liveBase, fixture.headRevision].includes(ref.revision)), false);
});

test('current supported reconstruction still rejects genuine digest, package and policy mismatches', async (t) => {
  const fixture = await makeHistoricalFixture({ packageMetadata });
  t.after(() => fixture.dispose());
  for (const [field, change] of [
    ['config_digest', (record) => { record.config_digest = '9'.repeat(64); }],
    ['contract_package', (record) => { record.contract_package.version = '9.9.9'; }],
    ['policy_ref', (record) => { record.policy_ref.revision = '9'.repeat(40); }],
  ]) {
    const record = structuredClone(fixture.record);
    change(record);
    const original = structuredClone(record);
    const result = await resolveHistoricalPolicy({ adapter: fixture.adapter, record, packageRoot });
    assert.equal(result.status, 'invalid', `${field} mismatch must not become a compatibility-unavailable result`);
    assert.ok(result.findings.some((finding) => finding.code === 'historical-policy-mismatch' && finding.message.includes(field)), findingsText(result));
    assert.deepEqual(record, original);
  }
});

test('unavailable config acquisition does not compare an unknown digest as acquired bytes', async (t) => {
  const fixture = await makeHistoricalFixture({ packageMetadata, hideHistoricalObjects: true });
  t.after(() => fixture.dispose());
  const original = structuredClone(fixture.record);
  const result = await resolveHistoricalPolicy({ adapter: fixture.adapter, record: fixture.record, packageRoot });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.config_digest, null);
  assert.equal(result.sources.some((source) => source.role === 'config'), false);
  assert.doesNotMatch(findingsText(result), /historical-policy-mismatch|Reconstructed recorded pre-merge policy/);
  assert.deepEqual(fixture.record, original);
  assert.deepEqual(fixture.adapter.calls.readBlob, [{
    repository: 'example/consumer', revision: fixture.historicalBase, path: '.assuredloop/config.json',
  }]);
});

test('unavailable activation acquisition does not compare its null digest with a declared digest', async (t) => {
  const fixture = await makeHistoricalFixture({ packageMetadata });
  t.after(() => fixture.dispose());
  const record = { ...structuredClone(fixture.record), policy_mode: 'activation', activation_digest: '8'.repeat(64) };
  assert.equal(validateRecord('evidence', record).valid, true);
  const original = structuredClone(record);
  const requested = [];
  const adapter = {
    ...fixture.adapter,
    async readBlob(ref) {
      requested.push(structuredClone(ref));
      if (ref.path === '.assuredloop/activation.json') {
        throw Object.assign(new Error('The historical activation object could not be acquired.'), {
          code: 'record-unavailable', details: { reason: 'git-object-unavailable' },
        });
      }
      return fixture.adapter.readBlob(ref);
    },
  };
  const result = await resolveHistoricalPolicy({ adapter, record, packageRoot });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.config_digest, record.config_digest);
  assert.equal(result.activation_digest, null);
  assert.equal(result.sources.some((source) => source.role === 'activation'), false);
  assert.doesNotMatch(findingsText(result), /historical-policy-mismatch|Reconstructed recorded pre-merge policy/);
  assert.match(findingsText(result), /activation.*could not be acquired/);
  assert.deepEqual(record, original);
  assert.deepEqual(requested.map((ref) => [ref.revision, ref.path]), [
    [fixture.historicalBase, '.assuredloop/config.json'],
    [fixture.historicalBase, '.assuredloop/activation.json'],
  ]);
});

test('acquired malformed activation preserves a matching digest as unavailable and rejects a genuine mismatch', async (t) => {
  const fixture = await makeHistoricalFixture({ packageMetadata });
  t.after(() => fixture.dispose());
  // Deliberately malformed current-format policy input; not an asserted historical version.
  const activationBytes = Buffer.from('{"schema_version":1,"state":"unsupported-state"}\n');
  const activationDigest = digest(activationBytes);
  const activationRef = {
    repository: 'example/consumer', revision: fixture.historicalBase, path: '.assuredloop/activation.json',
  };
  for (const matches of [true, false]) {
    const record = {
      ...structuredClone(fixture.record), policy_mode: 'activation',
      activation_digest: matches ? activationDigest : '8'.repeat(64),
    };
    assert.equal(validateRecord('evidence', record).valid, true);
    const original = structuredClone(record);
    const requested = [];
    const adapter = {
      ...fixture.adapter,
      async readBlob(ref) {
        requested.push(structuredClone(ref));
        if (ref.path === activationRef.path) {
          assert.deepEqual(ref, activationRef);
          return Buffer.from(activationBytes);
        }
        return fixture.adapter.readBlob(ref);
      },
    };
    const result = await resolveHistoricalPolicy({ adapter, record, packageRoot });
    assert.equal(result.status, matches ? 'unavailable' : 'invalid', findingsText(result));
    assert.equal(result.activation_digest, activationDigest);
    assert.equal(result.config_digest, record.config_digest);
    const source = result.sources.find((entry) => entry.role === 'activation');
    assert.ok(source);
    assert.deepEqual(source.source, { kind: 'git-blob', representation: 'raw-bytes', ref: activationRef });
    assert.deepEqual(Buffer.from(source.content, 'utf8'), activationBytes);
    assert.equal(source.content_sha256, activationDigest);
    assert.match(findingsText(result), /policy-unavailable/);
    assert.match(findingsText(result), /activation/);
    assert.doesNotMatch(findingsText(result), /Reconstructed recorded pre-merge policy|historical-evidence-invalid/);
    const mismatches = result.findings.filter((finding) => /mismatch/.test(finding.code));
    if (matches) assert.deepEqual(mismatches, []);
    else assert.ok(mismatches.some((finding) => /activation.*digest|digest.*activation/.test(finding.message)), findingsText(result));
    assert.deepEqual(record, original);
    assert.deepEqual(requested.map((ref) => [ref.revision, ref.path]), [
      [fixture.historicalBase, '.assuredloop/config.json'],
      [fixture.historicalBase, '.assuredloop/activation.json'],
    ]);
  }
});
