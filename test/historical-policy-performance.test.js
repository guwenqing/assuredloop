import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { resolveHistoricalPolicy } from '../src/policy.js';
import { makeHistoricalFixture } from './fixtures/historical-policy/helpers.mjs';

const packageRoot = new URL('..', import.meta.url).pathname;
const packageMetadata = JSON.parse(await readFile(new URL('../contracts/metadata.json', import.meta.url), 'utf8'));

async function fixtureFor(t) {
  const fixture = await makeHistoricalFixture({ packageMetadata });
  t.after(() => fixture.dispose());
  return fixture;
}

function resolve(fixture, record = fixture.record) {
  return resolveHistoricalPolicy({ adapter: fixture.adapter, record, packageRoot });
}

test('one shared historical adapter reuses policy sources for repeated same-context Evidence', async (t) => {
  const fixture = await fixtureFor(t);
  const first = await resolve(fixture);
  assert.equal(first.status, 'available');
  assert.ok(fixture.adapter.calls.readBlob.length > 0);
  assert.ok(fixture.adapter.calls.readComment.length > 0);
  const before = {
    blobs: fixture.adapter.calls.readBlob.length,
    comments: fixture.adapter.calls.readComment.length,
  };
  for (let i = 0; i < 3; i++) {
    const next = await resolve(fixture, { ...fixture.record, scope: `Distinct assessment ${i}`,
      reviewer_session: `independent-session-${i}` });
    assert.equal(next.status, 'available');
    assert.equal(next.config_digest, first.config_digest);
    assert.deepEqual(next.policy_ref, first.policy_ref);
    assert.deepEqual(next.sources, first.sources);
  }
  assert.deepEqual({
    blobs: fixture.adapter.calls.readBlob.length - before.blobs,
    comments: fixture.adapter.calls.readComment.length - before.comments,
  }, { blobs: 0, comments: 0 },
  'same historical policy sources must not be reacquired for each Evidence on the shared operation adapter');
});

test('warm historical policy reuse still compares each Evidence digest, policy reference and base', async (t) => {
  const fixture = await fixtureFor(t);
  assert.equal((await resolve(fixture)).status, 'available');
  for (const [field, patch] of [
    ['config_digest', { config_digest: '1'.repeat(64) }],
    ['policy_ref', { policy_ref: { ...fixture.record.policy_ref, revision: fixture.historicalBase } }],
    ['base_sha', { base_sha: fixture.liveBase }],
  ]) {
    const changed = await resolve(fixture, { ...fixture.record, ...patch });
    assert.notEqual(changed.status, 'available', `${field} mismatch must not inherit prior acceptance`);
    assert.ok(changed.findings.some((finding) => finding.code === 'historical-policy-mismatch'),
      `${field} must be compared with actual reconstructed source identity`);
    if (field === 'base_sha') {
      assert.equal(changed.context.base_sha, fixture.liveBase);
      assert.deepEqual(changed.config.project.review.internal.allowed_models, ['candidate-only'],
        'a distinct base must reconstruct its own config rather than reuse the previous base');
    }
    assert.equal((await resolve(fixture)).status, 'available',
      'a rejected Evidence must not contaminate the shared accepted policy snapshot');
  }
});
