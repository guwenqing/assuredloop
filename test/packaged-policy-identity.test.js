import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { resolvePolicy } from '../src/policy.js';
import {
  comment,
  makePolicyFixture,
  repository,
} from './fixtures/policy/helpers.js';

const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname);
const metadata = JSON.parse(readFileSync(path.join(repositoryRoot, 'contracts/metadata.json'), 'utf8'));
const configTemplate = JSON.parse(readFileSync(path.join(repositoryRoot, 'templates/records/config.json'), 'utf8'));
const packagePolicyPath = `${metadata.source_ref.path}/${metadata.files[0].path}`;
const packagePolicyRef = {
  repository: metadata.source_ref.repository,
  revision: metadata.source_ref.revision,
  path: packagePolicyPath,
};

function packageBinding() {
  return {
    name: metadata.name,
    version: metadata.version,
    integrity: `sha512-${Buffer.alloc(64).toString('base64')}`,
    source_ref: structuredClone(metadata.source_ref),
    contracts_path: metadata.contracts_path,
  };
}

function configFor(policyRepository) {
  const config = structuredClone(configTemplate);
  config.project.workflow = packageBinding();
  config.project.bootstrap = {
    policy_ref: { ...packagePolicyRef, repository: policyRepository },
    policy_acceptance: { repository, comment_id: 701 },
    proposal_acceptance: { repository, comment_id: 702 },
    authorized_by: 'example-owner',
  };
  config.repository.name = repository;
  config.repository.allowed_reference_repositories = [];
  return config;
}

async function policyFixture(t, policyRepository) {
  const fixture = await makePolicyFixture({
    configFor: () => configFor(policyRepository),
    comments: {
      [`${repository}#701`]: comment(701, 'Policy accepted for fixture scope.'),
      [`${repository}#702`]: comment(702, 'Proposal accepted for fixture scope.'),
    },
  });
  t.after(() => fixture.dispose());
  return fixture;
}

function sourceFor(policy, sourcePath) {
  return policy.sources.find((entry) => (entry.source?.ref ?? entry.ref)?.path === sourcePath);
}

function readBlobRefs(fixture) {
  return fixture.adapter.calls.readBlob.filter((ref) => ref.path === packagePolicyPath);
}

test('installed policy assets resolve case-insensitively with identical fixed source bytes and no remote policy read', async (t) => {
  const lowerFixture = await policyFixture(t, metadata.source_ref.repository);
  const upperRepository = metadata.source_ref.repository.toUpperCase();
  const upperFixture = await policyFixture(t, upperRepository);

  const lower = await resolvePolicy({
    adapter: lowerFixture.adapter,
    work: 'example/consumer#77',
    packageRoot: repositoryRoot,
  });
  const upper = await resolvePolicy({
    adapter: upperFixture.adapter,
    work: 'example/consumer#77',
    packageRoot: repositoryRoot,
  });

  assert.equal(lower.status, 'available', JSON.stringify(lower));
  assert.equal(upper.status, 'available', JSON.stringify(upper));
  assert.equal(lower.policy_ref.revision, upper.policy_ref.revision);
  assert.equal(lower.policy_ref.path, upper.policy_ref.path);
  assert.deepEqual(lower.contract_package, upper.contract_package);

  const lowerSource = sourceFor(lower, packagePolicyPath);
  const upperSource = sourceFor(upper, packagePolicyPath);
  assert.ok(lowerSource, 'lowercase installed policy source is retained');
  assert.ok(upperSource, 'uppercase installed policy source is retained');
  assert.equal(lowerSource.content_sha256, upperSource.content_sha256,
    'repository spelling does not change the installed policy bytes or digest');
  assert.equal(lowerSource.content, upperSource.content);
  assert.equal(lowerSource.source.ref.revision, upperSource.source.ref.revision);
  assert.equal(lowerSource.source.ref.path, upperSource.source.ref.path);

  assert.deepEqual(readBlobRefs(lowerFixture), [], 'installed lowercase policy asset does not require a remote policy read');
  assert.deepEqual(readBlobRefs(upperFixture), [], 'installed uppercase policy asset does not require a remote policy read');
  assert.ok(lowerFixture.adapter.calls.readBlob.every((ref) => ref.repository === repository));
  assert.ok(upperFixture.adapter.calls.readBlob.every((ref) => ref.repository === repository));
});
