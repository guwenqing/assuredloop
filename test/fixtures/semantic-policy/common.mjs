import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  comment,
  configPath,
  makePolicyFixture,
  policyPath,
  repository,
} from '../policy/helpers.js';

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
const metadataPath = path.join(repositoryRoot, 'contracts/metadata.json');

const otherPolicyRevision = 'ffffffffffffffffffffffffffffffffffffffff';

const acceptanceBodies = Object.freeze({
  fixed: {
    policy: 'Policy reference accepted for this destination at the recorded fixed revision.',
    proposal: 'Proposal scope accepted for the agreed workflow request.',
  },
  scoped: {
    policy: 'The proposal scope is accepted for this destination. This note records scope only.',
    proposal: 'The proposal scope is accepted for the agreed workflow request.',
  },
  different: {
    policy: `Policy revision ${otherPolicyRevision} at policy/design.md is accepted for this destination.`,
    proposal: 'Proposal scope accepted for the agreed workflow request.',
  },
});

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

async function packageBinding() {
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  return {
    name: metadata.name,
    version: metadata.version,
    integrity: `sha512-${Buffer.alloc(64).toString('base64')}`,
    source_ref: structuredClone(metadata.source_ref),
    contracts_path: metadata.contracts_path,
  };
}

async function configFor({ policyRevision }) {
  return {
    schema_version: 1,
    project: {
      workflow: await packageBinding(),
      review: {
        depth: 'full-scope',
        internal: { allowed_models: ['model-alpha', 'model-beta'] },
        excluded_models: ['model-excluded'],
        context: { max_inline_bytes: 65536 },
      },
      bootstrap: {
        policy_ref: { repository, revision: policyRevision, path: policyPath },
        policy_acceptance: { repository, comment_id: 101 },
        proposal_acceptance: { repository, comment_id: 102 },
        authorized_by: 'example-owner',
      },
    },
    repository: {
      name: repository,
      openspec_root: 'openspec',
      tools: ['codex'],
      labels: labels(),
    },
  };
}

export function acceptanceBody(kind) {
  if (!Object.hasOwn(acceptanceBodies, kind)) throw new Error(`Unknown semantic policy fixture: ${kind}`);
  return structuredClone(acceptanceBodies[kind]);
}

/**
 * Build a real Git snapshot using the shared policy fixture harness. The
 * returned adapter is read-only; callers should pass its `root` as the
 * explicit source of package metadata and call `dispose()` after inspection.
 */
export async function makeSemanticPolicyFixture(kind) {
  const bodies = acceptanceBody(kind);
  return makePolicyFixture({
    configFor,
    policyBytes: '# Accepted policy\n\nRules for the scoped workflow.\n',
    comments: {
      [`${repository}#101`]: comment(101, bodies.policy),
      [`${repository}#102`]: comment(102, bodies.proposal),
    },
  });
}

export const policyFixtureKinds = Object.freeze(['fixed', 'scoped', 'different']);
export { configPath, otherPolicyRevision, policyPath, repository };
