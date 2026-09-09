import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  activationPath,
  comment,
  configPath,
  makePolicyFixture,
  policyPath,
  repository,
  work,
} from '../policy/helpers.js';
import { makeTraceFixture, workPull } from '../trace-cli/helpers.mjs';

const repositoryRoot = path.resolve(new URL('../../..', import.meta.url).pathname);
const packageMetadata = JSON.parse(readFileSync(path.join(repositoryRoot, 'contracts/metadata.json'), 'utf8'));

export { activationPath, configPath, policyPath, repository, work };

export function packageBinding() {
  return {
    name: packageMetadata.name,
    version: packageMetadata.version,
    integrity: `sha512-${Buffer.alloc(64).toString('base64')}`,
    source_ref: structuredClone(packageMetadata.source_ref),
    contracts_path: packageMetadata.contracts_path,
  };
}

export function makeReviewConfig(policyRevision, { mutate } = {}) {
  const config = {
    schema_version: 1,
    project: {
      workflow: packageBinding(),
      review: {
        depth: 'full-scope',
        internal: { allowed_models: ['internal-model'] },
        excluded_models: ['excluded-model'],
        model_aliases: {
          primary: 'internal-model',
          external: 'external-provider',
        },
        context: { max_inline_bytes: 2048 },
      },
      bootstrap: {
        policy_ref: { repository, revision: policyRevision, path: policyPath },
        policy_acceptance: { repository, comment_id: 101 },
        proposal_acceptance: { repository, comment_id: 102 },
        authorized_by: 'review-kind-fixture-owner',
      },
    },
    repository: {
      name: repository,
      openspec_root: 'openspec',
      tools: ['codex'],
      labels: {
        type: {
          request: 'type:request',
          epic: 'type:epic',
          'architecture-task': 'type:architecture-task',
          task: 'type:task',
          bug: 'type:bug',
          spike: 'type:spike',
        },
      },
    },
  };
  mutate?.(config);
  return config;
}

export async function makeReviewScenario(t, options = {}) {
  const fixture = await makePolicyFixture({
    configFor: ({ policyRevision }) => makeReviewConfig(policyRevision, options),
    comments: {
      [`${repository}#101`]: comment(101, 'The review policy source was accepted for this fixture.'),
      [`${repository}#102`]: comment(102, 'The proposal scope was accepted for this fixture.'),
      [`${repository}#103`]: comment(103, 'Review evidence source for the fixture.'),
    },
  });
  t.after(() => fixture.dispose());
  return fixture;
}

export function currentTuple(policy, fixture, overrides = {}) {
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

export function evidenceRecord(policy, fixture, overrides = {}) {
  const current = currentTuple(policy, fixture);
  return {
    head: current.head,
    scope: 'Review-kind qualification boundary',
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
    reviewer_model: 'external-provider',
    review_depth: 'full-scope',
    command: 'node --test test/review-kind.test.js',
    exit_code: 0,
    ...overrides,
  };
}

export async function makeReviewKindCliFixture(t) {
  const fixture = await makeTraceFixture(t);
  const scenarioPath = fixture.env.FAKE_GH_SCENARIO;
  const scenario = JSON.parse(await readFile(scenarioPath, 'utf8'));
  const replaceEvidenceModel = (body) => {
    try {
      const record = JSON.parse(body);
      if (record.pr !== workPull) return body;
      return JSON.stringify({ ...record, reviewer_model: 'external-provider' }, null, 2);
    } catch {
      return body;
    }
  };
  for (const key of [`issues/42/comments`, `issues/${workPull.split('#')[1]}/comments`]) {
    const pages = scenario.records[key];
    if (!Array.isArray(pages)) continue;
    scenario.records[key] = pages.map((page) => page.map((entry) => ({
      ...entry,
      body: replaceEvidenceModel(entry.body),
    })));
  }
  scenario.records['issues/comments/101'].body = replaceEvidenceModel(scenario.records['issues/comments/101'].body);
  await writeFile(scenarioPath, `${JSON.stringify(scenario)}\n`);
  return fixture;
}
