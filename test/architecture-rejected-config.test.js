import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  addForeignIssue, createTrace, destinationConfig, endpoints, foreignRepository, foreignWork,
  makeCategoryFixture, repository, saveScenario, scenarioOf, withFixtureEnv, work,
} from './fixtures/architecture-acquisition/helpers.mjs';
import {
  classificationOf, foreignConfigSource, foreignFixture, rejectForeignConfig,
} from './fixtures/architecture-rejected-config/helpers.mjs';

const thirdWork = 'third/untrusted-category-source#1';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hasRef = (loaded, expected) => loaded.references.some((ref) => JSON.stringify(ref) === JSON.stringify(expected));

function assertRejected(classification) {
  assert.equal(classification.category, null, 'a rejected config never resolves an accepted category');
  assert.equal(classification.exception, null);
  assert.ok(classification.discrepancies.some((finding) => ['error', 'unavailable'].includes(finding.severity)));
}

function assertProvenance(classification, expected) {
  for (const field of ['repository', 'branch', 'revision', 'config_ref', 'config_digest']) {
    assert.deepEqual(classification[field], expected[field], `classification retains actually observed ${field}`);
  }
}

for (const kind of ['legacy discipline', 'missing architecture', 'case collision', 'malformed JSON']) {
  test(`rejected foreign ${kind} retains observed provenance and acquired source without permissions`, async (t) => {
    const fixture = await foreignFixture(t);
    const expected = await rejectForeignConfig(fixture, kind);
    await withFixtureEnv(fixture, async () => {
      const trace = await createTrace({ targetRoot: fixture.root, work });
      const loaded = await trace.load(foreignWork);
      const classification = classificationOf(loaded);
      assertRejected(classification);
      assert.ok((await endpoints(fixture)).includes(`repos/${foreignRepository}/git/blobs/${expected.blob}`),
        'the actual source bytes were acquired before their config was rejected');
      assertProvenance(classification, expected);
      assert.ok(hasRef(loaded, expected.config_ref), 'reviewer source references include the acquired rejected config');
      const before = (await endpoints(fixture)).length;
      const rejectedSource = await trace.load(expected.config_ref);
      const retainedBytes = rejectedSource.bytes ?? Buffer.from(rejectedSource.content, 'utf8');
      assert.deepEqual(retainedBytes, expected.bytes);
      assert.equal(digest(retainedBytes), expected.config_digest);
      assert.equal((await endpoints(fixture)).length, before, 'retained source uses acquired bytes rather than a new read');
      assert.deepEqual(rejectedSource.references, [], 'rejected fields are not accepted source-routing instructions');
      await assert.rejects(() => trace.load(thirdWork), (error) => error.code === 'reference-out-of-scope');
    });
    assert.equal((await endpoints(fixture)).some((endpoint) => endpoint.startsWith('repos/third/')), false);
  });
}

test('valid foreign mapping retains provenance and still resolves the foreign category', async (t) => {
  const fixture = await foreignFixture(t);
  const expected = await foreignConfigSource(fixture);
  await withFixtureEnv(fixture, async () => {
    const trace = await createTrace({ targetRoot: fixture.root, work });
    const loaded = await trace.load(foreignWork);
    const classification = classificationOf(loaded);
    assert.equal(classification.category, 'spike', 'foreign label has a different primary-consumer meaning');
    assert.deepEqual(classification.discrepancies, []);
    assertProvenance(classification, expected);
    assert.ok(hasRef(loaded, expected.config_ref));
    await trace.recheckAcquisition();
  });
});

test('acquired invalid UTF-8 config retains exact cached bytes without fabricated text or imported references', async (t) => {
  const fixture = await foreignFixture(t);
  const expected = await rejectForeignConfig(fixture, 'invalid UTF-8');
  assert.throws(() => new TextDecoder('utf-8', { fatal: true }).decode(expected.bytes),
    'fixture must physically contain an invalid UTF-8 byte sequence');
  await withFixtureEnv(fixture, async () => {
    const trace = await createTrace({ targetRoot: fixture.root, work });
    const loaded = await trace.load(foreignWork);
    const classification = classificationOf(loaded);
    assertRejected(classification);
    assertProvenance(classification, expected);
    assert.ok(hasRef(loaded, expected.config_ref));
    assert.ok((await endpoints(fixture)).includes(`repos/${foreignRepository}/git/blobs/${expected.blob}`));
    const before = (await endpoints(fixture)).length;
    const source = await trace.load(expected.config_ref);
    assert.ok(Buffer.isBuffer(source.bytes));
    assert.deepEqual(source.bytes, expected.bytes);
    assert.equal(digest(source.bytes), classification.config_digest);
    assert.equal(Object.hasOwn(source, 'content'), false, 'retention does not manufacture decoded or replacement text');
    assert.equal(source.disposition, 'unavailable');
    assert.equal(source.reason, 'non-text-source');
    assert.deepEqual(source.references, [], 'rejected bytes do not import embedded permission or reference declarations');
    assert.equal((await endpoints(fixture)).length, before,
      'binary source was retained by classification, not fetched later by generic source loading');
    await assert.rejects(() => trace.load(thirdWork), (error) => error.code === 'reference-out-of-scope');
  });
  assert.equal((await endpoints(fixture)).some((endpoint) => endpoint.startsWith('repos/third/')), false);
});

for (const stage of ['branch revision', 'config bytes']) {
  test(`failed foreign ${stage} read preserves earlier coordinates without inventing unobserved facts`, async (t) => {
    const fixture = await foreignFixture(t);
    const expected = await foreignConfigSource(fixture);
    const scenario = await scenarioOf(fixture);
    if (stage === 'branch revision') delete scenario.foreignRecords[foreignRepository]['git/ref/heads/trunk'];
    else delete scenario.foreignRecords[foreignRepository][`git/blobs/${expected.blob}`];
    await saveScenario(fixture, scenario);
    await withFixtureEnv(fixture, async () => {
      const trace = await createTrace({ targetRoot: fixture.root, work });
      const loaded = await trace.load(foreignWork);
      const classification = classificationOf(loaded);
      assertRejected(classification);
      assert.equal(classification.repository, foreignRepository, 'Issue identity already established the repository');
      assert.equal(classification.branch, expected.branch);
      if (stage !== 'config bytes') {
        assert.equal(classification.revision ?? null, null);
        assert.equal(classification.config_ref ?? null, null);
      } else {
        assert.equal(classification.revision, expected.revision);
        assert.deepEqual(classification.config_ref, expected.config_ref);
      }
      assert.equal(classification.config_digest ?? null, null, 'no blob bytes means no measured digest');
      if (stage !== 'config bytes') assert.equal(hasRef(loaded, expected.config_ref), false);
    });
  });
}

test('missing foreign repository metadata fails before Issue, branch or config acquisition', async (t) => {
  const fixture = await foreignFixture(t);
  const scenario = await scenarioOf(fixture);
  delete scenario.foreignRepositories[foreignRepository];
  await saveScenario(fixture, scenario);
  await withFixtureEnv(fixture, async () => {
    const trace = await createTrace({ targetRoot: fixture.root, work });
    await assert.rejects(() => trace.load(foreignWork), (error) =>
      error.code === 'tool-unavailable' && error.details?.reason === 'insufficient-access');
  });
  const foreignReads = (await endpoints(fixture)).filter((endpoint) => endpoint.startsWith(`repos/${foreignRepository}`));
  assert.deepEqual(foreignReads, [`repos/${foreignRepository}`], 'failed access confirmation yields no downstream observed coordinates or bytes');
});

test('out-of-scope foreign classification is denied before any repository or config read', async (t) => {
  const fixture = await makeCategoryFixture(t);
  await addForeignIssue(fixture);
  await withFixtureEnv(fixture, async () => {
    const trace = await createTrace({ targetRoot: fixture.root, work });
    await assert.rejects(() => trace.load(foreignWork), (error) => error.code === 'reference-out-of-scope');
  });
  assert.equal((await endpoints(fixture)).some((endpoint) => endpoint.startsWith(`repos/${foreignRepository}`)), false);
});

test('a retained rejected config and classification cache do not escape a subsequently narrower scope', async (t) => {
  const fixture = await foreignFixture(t);
  const expected = await rejectForeignConfig(fixture);
  await destinationConfig(fixture, { branch: 'rejected-config-narrow', allowed: [] });
  await withFixtureEnv(fixture, async () => {
    const trace = await createTrace({ targetRoot: fixture.root, work });
    assertRejected(classificationOf(await trace.load(foreignWork)));
    const before = (await endpoints(fixture)).filter((endpoint) => endpoint.startsWith(`repos/${foreignRepository}`)).length;
    await trace.bindPolicyScope(await trace.pullAt(`${repository}#70`));
    for (const ref of [foreignWork, expected.config_ref]) {
      await assert.rejects(() => trace.load(ref), (error) => error.code === 'reference-out-of-scope');
    }
    await assert.rejects(() => trace.bundleAt(foreignWork), (error) => error.code === 'reference-out-of-scope');
    assert.equal((await endpoints(fixture)).filter((endpoint) => endpoint.startsWith(`repos/${foreignRepository}`)).length, before);
  });
});

for (const drift of ['branch revision', 'configuration bytes']) {
  test(`observed rejected classification context detects later ${drift} drift`, async (t) => {
    const fixture = await foreignFixture(t);
    await rejectForeignConfig(fixture);
    await withFixtureEnv(fixture, async () => {
      const trace = await createTrace({ targetRoot: fixture.root, work });
      assertRejected(classificationOf(await trace.load(foreignWork)));
      if (drift === 'branch revision') {
        const scenario = await scenarioOf(fixture);
        scenario.foreignRecords[foreignRepository]['git/ref/heads/trunk'].object.sha = 'c'.repeat(40);
        await saveScenario(fixture, scenario);
      } else await rejectForeignConfig(fixture, 'malformed JSON');
      await assert.rejects(() => trace.recheckAcquisition(), (error) => /stale|changed/i.test(`${error.code} ${error.message}`),
        'failed validation does not erase an actually consumed source from freshness checks');
    });
  });
}
