import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';

import { makePackageFixture } from '../adoption/helpers.js';

export const provenance = JSON.parse(readFileSync(new URL('./provenance.json', import.meta.url), 'utf8'));
export const legacyBytes = readFileSync(new URL('./legacy-config.json', import.meta.url));

// Synthetic consumer identities; provenance identifies the real immutable fixture origin.
export async function makeLegacyScenario(t) {
  const config = JSON.parse(legacyBytes);
  const repository = config.repository.name;
  const binding = config.project.workflow;
  const selected = await makePackageFixture({
    name: binding.name, version: binding.version, sourceRef: binding.source_ref,
  });
  t.after(() => rm(selected.root, { recursive: true, force: true }));
  const record = {
    head: '2'.repeat(40), scope: 'Simulated assessment using an immutable legacy configuration fixture',
    result: 'pass', evidence: [{ repository, comment_id: 901 }], pr: `${repository}#77`,
    base_ref: 'main', base_sha: '1'.repeat(40),
    policy_ref: structuredClone(config.project.bootstrap.policy_ref),
    contract_package: structuredClone(binding), config_digest: provenance.content_sha256,
    activation_digest: null, policy_mode: 'bootstrap', producer_session: 'legacy-fixture-producer',
    reviewer_session: 'legacy-fixture-reviewer', reviewer_model: 'model-alpha', review_depth: 'full-scope',
  };
  const pull = {
    number: 77, merged: true, merged_at: '2026-09-08T05:00:00Z', merge_commit_sha: '4'.repeat(40),
    base: { ref: 'main', sha: '3'.repeat(40), repo: { full_name: repository } },
    head: { sha: record.head, repo: { full_name: repository } },
  };
  const configRef = { repository, revision: record.base_sha, path: '.assuredloop/config.json' };
  const calls = { readPull: [], readBlob: [], readComment: [] };
  const adapter = {
    async readPull(work) { calls.readPull.push(work); return structuredClone(pull); },
    async readBlob(ref) {
      calls.readBlob.push(structuredClone(ref));
      assert.deepEqual(ref, configRef, 'unsupported legacy configuration must not select another source or revision');
      return Buffer.from(legacyBytes);
    },
    async readComment(ref) {
      calls.readComment.push(structuredClone(ref));
      throw new Error('Unsupported legacy configuration must stop before fetching acceptance sources.');
    },
  };
  return { config, record, pull, configRef, calls, adapter, packageRoot: selected.root };
}
