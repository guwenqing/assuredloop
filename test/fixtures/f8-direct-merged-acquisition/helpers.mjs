import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  commandLog,
  git,
  installBoundaryFakeGh,
  makeTraceFixture,
  runCli,
  saveScenario,
  scenarioOf,
  workPull,
} from '../trace-external-boundaries/helpers.mjs';

export { commandLog, runCli, workPull };

const repository = 'example/consumer';
const branchEndpoint = `repos/${repository}/git/ref/heads/main`;
const foreignRepository = 'foreign/historical';
const foreignCommentId = 9101;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

async function commit(root, message) {
  await git(root, ['add', '.']);
  await git(root, ['commit', '-q', '-m', message]);
  return (await git(root, ['rev-parse', 'HEAD'])).stdout.trim();
}

function configWithAllowed(config, allowed) {
  const next = structuredClone(config);
  next.repository.allowed_reference_repositories = [...allowed];
  return next;
}

function configBytes(config) {
  return Buffer.from(`${JSON.stringify(config, null, 2)}\n`);
}

function replaceComment(scenario, id, body) {
  for (const [key, value] of Object.entries(scenario.records)) {
    if (key === `issues/comments/${id}`) {
      scenario.records[key] = { ...value, body };
      continue;
    }
    if (!key.endsWith('/comments')) continue;
    for (const page of value) {
      for (const entry of page) if (entry.id === id) entry.body = body;
    }
  }
}

function addForeignEvidenceSource(scenario) {
  scenario.foreignRepositories = {
    ...(scenario.foreignRepositories || {}),
    [foreignRepository]: { full_name: foreignRepository, private: false },
  };
  scenario.foreignRecords = {
    ...(scenario.foreignRecords || {}),
    [foreignRepository]: {
      ...(scenario.foreignRecords?.[foreignRepository] || {}),
      [`issues/comments/${foreignCommentId}`]: {
        id: foreignCommentId,
        body: 'Historical-only foreign source; current policy does not permit this read.',
      },
    },
  };
}

/**
 * Build a merged PR with three distinct revisions:
 *
 *   historicalBase: recorded pre-merge base/config, which permits a foreign source
 *   mergeCommit:     actual merged delivery recorded by GitHub
 *   currentRevision: current destination config, which removes that permission
 *
 * The scenario is served only by the existing fake GitHub adapter.
 */
export async function makeDirectMergedFixture(t, { drift = false } = {}) {
  const fixture = await makeTraceFixture(t, { advanceDestination: true });
  await installBoundaryFakeGh(fixture);

  const historicalConfig = configWithAllowed(fixture.config, [foreignRepository]);
  await git(fixture.root, ['checkout', '-q', '-b', 'f8-historical-base']);
  await writeFile(path.join(fixture.root, '.assuredloop/config.json'), configBytes(historicalConfig));
  const historicalBase = await commit(fixture.root, 'F8 historical destination base');
  const historicalConfigBytes = configBytes(historicalConfig);

  await git(fixture.root, ['checkout', '-q', '-b', 'f8-delivery']);
  await writeFile(path.join(fixture.root, 'f8-delivered.txt'), 'merged delivery\n');
  const headRevision = await commit(fixture.root, 'F8 merged delivery');

  await git(fixture.root, ['checkout', '-q', 'main']);
  await git(fixture.root, ['merge', '--no-ff', '-q', 'f8-delivery', '-m', 'F8 merge delivery']);
  const mergeCommit = (await git(fixture.root, ['rev-parse', 'HEAD'])).stdout.trim();

  const currentConfig = configWithAllowed(fixture.config, []);
  await writeFile(path.join(fixture.root, '.assuredloop/config.json'), configBytes(currentConfig));
  const currentRevision = await commit(fixture.root, 'F8 current destination policy');
  const currentConfigBytes = configBytes(currentConfig);

  let driftRevision = null;
  if (drift) {
    await writeFile(path.join(fixture.root, 'f8-destination-drift.txt'), 'unrelated current drift\n');
    driftRevision = await commit(fixture.root, 'F8 destination drift');
  }

  const scenario = await scenarioOf(fixture);
  const pull = scenario.records['pulls/43'];
  pull.state = 'closed';
  pull.merged = true;
  pull.merged_at = '2026-09-08T12:00:00Z';
  pull.merge_commit_sha = mergeCommit;
  pull.base = { ...pull.base, ref: 'main', sha: historicalBase };
  pull.head = { ...pull.head, ref: 'f8-delivery', sha: headRevision };
  scenario.records['issues/43'].state = 'closed';
  scenario.records['pulls/43/files'] = [[{
    filename: 'f8-delivered.txt',
    status: 'added',
    additions: 1,
    deletions: 0,
    patch: '@@ -0,0 +1 @@\n+merged delivery',
  }]];
  scenario.records[`git/ref/heads/main`] = {
    ref: 'refs/heads/main',
    object: { type: 'commit', sha: currentRevision },
  };

  const evidence = JSON.parse(scenario.records['issues/comments/101'].body);
  evidence.head = headRevision;
  evidence.base_ref = 'main';
  evidence.base_sha = historicalBase;
  evidence.config_digest = sha256(historicalConfigBytes);
  evidence.evidence = [
    ...(evidence.evidence || []).filter((ref) => ref.repository !== foreignRepository),
    { repository: foreignRepository, comment_id: foreignCommentId },
  ];
  replaceComment(scenario, 101, JSON.stringify(evidence, null, 2));
  addForeignEvidenceSource(scenario);

  if (drift) scenario.endpointSequences = {
    ...(scenario.endpointSequences || {}),
    [branchEndpoint]: [currentRevision, currentRevision, currentRevision, driftRevision].map((sha) => ({
      ref: 'refs/heads/main',
      object: { type: 'commit', sha },
    })),
  };
  await saveScenario(fixture, scenario);

  return {
    ...fixture,
    historicalBase,
    mergeCommit,
    currentRevision,
    driftRevision,
    headRevision,
    historicalConfigDigest: sha256(historicalConfigBytes),
    currentConfigDigest: sha256(currentConfigBytes),
    foreignRepository,
    foreignCommentId,
    branchEndpoint,
  };
}

/**
 * Build the same merged-PR shape as a secondary assessment reached from the
 * Issue root. The primary live ceiling permits the foreign source, while the
 * secondary destination's current config removes it after the merge. This
 * distinguishes live secondary narrowing from reading the historical base.
 */
export async function makeSecondaryMergedFixture(t) {
  const fixture = await makeTraceFixture(t, { advanceDestination: true });
  await installBoundaryFakeGh(fixture);

  const primaryConfig = configWithAllowed(fixture.config, [foreignRepository]);
  await writeFile(path.join(fixture.root, '.assuredloop/config.json'), configBytes(primaryConfig));
  const primaryRevision = await commit(fixture.root, 'F8 primary current ceiling');
  const primaryConfigBytes = configBytes(primaryConfig);

  await git(fixture.root, ['checkout', '-q', '-b', 'f8-secondary-base']);
  await writeFile(path.join(fixture.root, 'f8-secondary-base.txt'), 'historical secondary base\n');
  const historicalBase = await commit(fixture.root, 'F8 secondary historical base');

  await git(fixture.root, ['checkout', '-q', '-b', 'f8-secondary-delivery']);
  await writeFile(path.join(fixture.root, 'f8-secondary-delivered.txt'), 'secondary merged delivery\n');
  const headRevision = await commit(fixture.root, 'F8 secondary merged delivery');

  await git(fixture.root, ['checkout', '-q', '-b', 'f8-secondary-destination', 'f8-secondary-base']);
  await git(fixture.root, ['merge', '--no-ff', '-q', 'f8-secondary-delivery', '-m', 'F8 secondary merge delivery']);
  const mergeCommit = (await git(fixture.root, ['rev-parse', 'HEAD'])).stdout.trim();
  const currentConfig = configWithAllowed(fixture.config, []);
  await writeFile(path.join(fixture.root, '.assuredloop/config.json'), configBytes(currentConfig));
  const currentSecondaryRevision = await commit(fixture.root, 'F8 secondary current policy');
  const historicalConfigBytes = configBytes(primaryConfig);
  await git(fixture.root, ['checkout', '-q', 'main']);

  const scenario = await scenarioOf(fixture);
  const pull = scenario.records['pulls/43'];
  pull.state = 'closed';
  pull.merged = true;
  pull.merged_at = '2026-09-08T12:00:00Z';
  pull.merge_commit_sha = mergeCommit;
  pull.base = { ...pull.base, ref: 'f8-secondary-destination', sha: historicalBase };
  pull.head = { ...pull.head, ref: 'f8-secondary-delivery', sha: headRevision };
  scenario.records['issues/43'].state = 'closed';
  scenario.records['pulls/43/files'] = [[{
    filename: 'f8-secondary-delivered.txt',
    status: 'added',
    additions: 1,
    deletions: 0,
    patch: '@@ -0,0 +1 @@\n+secondary merged delivery',
  }]];
  scenario.records['issues/42/timeline'] = [[{
    event: 'cross-referenced',
    source: {
      issue: {
        number: 43,
        repository_url: `https://api.github.com/repos/${repository}`,
        pull_request: { url: `https://api.github.com/repos/${repository}/pulls/43` },
      },
    },
  }]];
  scenario.records['git/ref/heads/main'] = {
    ref: 'refs/heads/main',
    object: { type: 'commit', sha: primaryRevision },
  };
  scenario.records['git/ref/heads/f8-secondary-destination'] = {
    ref: 'refs/heads/f8-secondary-destination',
    object: { type: 'commit', sha: currentSecondaryRevision },
  };

  const evidence = JSON.parse(scenario.records['issues/comments/101'].body);
  evidence.head = headRevision;
  evidence.base_ref = 'f8-secondary-destination';
  evidence.base_sha = historicalBase;
  evidence.config_digest = sha256(historicalConfigBytes);
  evidence.evidence = [
    ...(evidence.evidence || []).filter((ref) => ref.repository !== foreignRepository),
    { repository: foreignRepository, comment_id: foreignCommentId },
  ];
  replaceComment(scenario, 101, JSON.stringify(evidence, null, 2));
  addForeignEvidenceSource(scenario);
  await saveScenario(fixture, scenario);

  return {
    ...fixture,
    primaryRevision,
    primaryConfigDigest: sha256(primaryConfigBytes),
    historicalBase,
    currentSecondaryRevision,
    mergeCommit,
    headRevision,
    historicalConfigDigest: sha256(historicalConfigBytes),
    foreignRepository,
    foreignCommentId,
  };
}
