import { createHash } from 'node:crypto';
import { copyFile, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

import {
  baseSpec,
  candidateSpec,
  currentInboundOld,
  currentInboundRepaired,
  deltaSpec,
  metadataPath,
  openspecRoot,
  retirementBaseSpec,
  retirementCanonicalPath,
  retirementDeltaPath,
  retirementDeltaSpec,
  retirementMetadata,
} from '../synchronization/fixtures.mjs';
import { git, makeGitFixture, packageIntegrity } from '../adoption/helpers.js';

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
const fakeGhSource = path.join(repositoryRoot, 'test/fixtures/read-adapter/fake-gh.mjs');
const nodeBin = path.dirname(process.execPath);

export const repository = 'example/consumer';
export const closeoutIssue = `${repository}#90`;
export const closeoutPull = `${repository}#91`;
export const prerequisiteIssue = `${repository}#80`;
export const prerequisitePull = `${repository}#81`;
export const parentIssue = `${repository}#1`;
export const change = 'workflow-refresh';
export const policyPath = `${openspecRoot}/changes/${change}/design.md`;
export const tasksPath = `${openspecRoot}/changes/${change}/tasks.md`;
export const deltaPath = `${openspecRoot}/changes/${change}/specs/audit/spec.md`;
export const manifestActivePath = `${openspecRoot}/changes/${change}/acceptance-manifest.json`;
export const manifestArchivePath = `${openspecRoot}/archive/${change}/acceptance-manifest.json`;
export const canonicalPath = `${openspecRoot}/specs/audit/spec.md`;
export const currentInboundPath = 'docs/current-links.md';
export const baseHead = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
export const prerequisiteCommentId = 801;
export const closeoutCommentId = 901;
export const policyAcceptanceCommentId = 100;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function bodyFor(record, prose = 'Closeout fixture workflow context.') {
  return `${prose}\n\n## Workflow context\n\n\`\`\`json\n${JSON.stringify(record, null, 2)}\n\`\`\`\n`;
}

function repoRef(revision, pathname, anchor) {
  return { repository, revision, path: pathname, ...(anchor ? { anchor } : {}) };
}

function sourceComment(comment_id) {
  return {
    kind: 'github-issue-comment',
    repository,
    comment_id,
    endpoint: 'GET /repos/{owner}/{repo}/issues/comments/{id}',
    api_version: '2022-11-28',
    media_type: 'application/vnd.github.raw+json',
    field: 'body',
    encoding: 'utf-8',
    normalization: 'none',
  };
}

function packageBinding(metadata) {
  return {
    name: metadata.name,
    version: metadata.version,
    integrity: packageIntegrity(),
    source_ref: metadata.source_ref,
    contracts_path: metadata.contracts_path,
  };
}

function configFor(revision, metadata, {
  allowedModels = ['gpt-6-astra'],
  excludedModels = ['gpt-5.6-luna'],
} = {}) {
  const policy = repoRef(revision, policyPath, 'closeout-policy');
  return {
    schema_version: 1,
    project: {
      workflow: packageBinding(metadata),
      review: {
        depth: 'full-scope',
        internal: { allowed_models: allowedModels },
        excluded_models: excludedModels,
        context: { max_inline_bytes: 65536 },
      },
      bootstrap: {
        policy_ref: policy,
        policy_acceptance: { repository, comment_id: policyAcceptanceCommentId },
        proposal_acceptance: repoRef(revision, `${openspecRoot}/changes/${change}/proposal.md`),
        authorized_by: 'closeout-owner',
      },
    },
    repository: {
      name: repository,
      openspec_root: openspecRoot,
      tools: ['codex'],
      labels: {
        type: {
          request: 'type:request',
          epic: 'type:epic',
          task: 'type:task',
          bug: 'type:bug',
          spike: 'type:spike',
        },
      },
    },
  };
}

function issueRecord(revision) {
  return {
    activity: 'closeout',
    request: parentIssue,
    change,
    basis: [repoRef(revision, policyPath, 'closeout-policy')],
    plan_items: [{ ...repoRef(revision, tasksPath), items: ['3.5', '3.6', '3.7'] }],
    depends_on: [prerequisiteIssue],
    split_rationale: 'The owner-led closeout aggregates delivered prerequisites and the complete accepted delta.',
  };
}

function prerequisiteIssueRecord(revision) {
  return {
    activity: 'deliver',
    request: parentIssue,
    change,
    basis: [repoRef(revision, policyPath, 'closeout-policy')],
    plan_items: [{ ...repoRef(revision, tasksPath), items: ['3.1', '3.2', '3.3'] }],
    split_rationale: 'The prerequisite contribution is an independently delivered trace adapter package.',
  };
}

function nativeChildIssueRecord(revision) {
  return {
    activity: 'deliver',
    request: parentIssue,
    change,
    basis: [repoRef(revision, policyPath, 'closeout-policy')],
    plan_items: [{ ...repoRef(revision, tasksPath), items: ['3.5'] }],
    split_rationale: 'This native child relation is context inventory only; it is not an explicit closeout prerequisite.',
  };
}

function pullRecord(revision, issues, items) {
  return {
    issues,
    change,
    basis: [repoRef(revision, policyPath, 'closeout-policy')],
    plan_items: [{ ...repoRef(revision, tasksPath), items }],
  };
}

function evidenceRecord(revision, head, pr, baseSha, configDigest, policyRevision = revision, reviewerModel = 'gpt-6-astra') {
  return {
    head,
    scope: pr === closeoutPull
      ? 'Owner-led closeout candidate with aggregate synchronization and fixity checks.'
      : 'Delivered prerequisite trace adapter contribution.',
    result: 'pass',
    evidence: [
      { repository, comment_id: policyAcceptanceCommentId },
      repoRef(revision, tasksPath),
    ],
    pr,
    base_ref: 'main',
    base_sha: baseSha,
    policy_ref: repoRef(policyRevision, policyPath, 'closeout-policy'),
    contract_package: packageBinding({
      name: 'assuredloop-base',
      version: '0.1.0',
      source_ref: {
        repository: 'guwenqing/assuredloop-base',
        revision: '530c6fc4d0e0caeb715f0da9a22cc933ecd27a93',
        path: 'openspec/changes/establish-project-workflow/specs',
      },
      contracts_path: 'contracts',
    }),
    config_digest: configDigest,
    activation_digest: null,
    policy_mode: 'bootstrap',
    producer_session: pr === closeoutPull ? 'closeout-producer' : 'prerequisite-producer',
    reviewer_session: pr === closeoutPull ? 'closeout-reviewer' : 'prerequisite-reviewer',
    reviewer_model: reviewerModel,
    review_depth: 'full-scope',
    command: 'node --test test/closeout-cli.test.js',
    exit_code: 0,
  };
}

async function commit(root, message) {
  await git(root, ['add', '.']);
  await git(root, ['commit', '-q', '-m', message]);
  return (await git(root, ['rev-parse', 'HEAD'])).stdout.trim();
}

async function writeValue(root, relativePath, value) {
  const destination = path.join(root, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.isBuffer(value) ? value : Buffer.from(
    typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`, 'utf8'));
}

async function removeValue(root, relativePath) {
  await rm(path.join(root, relativePath), { recursive: true, force: true });
}

async function makeGhFixture(t, scenario) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-closeout-gh-'));
  const bin = path.join(root, 'bin');
  const scenarioPath = path.join(root, 'scenario.json');
  const log = path.join(root, 'commands.log');
  await mkdir(bin, { recursive: true });
  await writeFile(scenarioPath, `${JSON.stringify(scenario)}\n`);
  const executable = path.join(bin, 'gh');
  await copyFile(fakeGhSource, executable);
  await chmod(executable, 0o755);
  t.after(() => rm(root, { recursive: true, force: true }));
  return {
    log,
    env: {
      ...process.env,
      PATH: `${bin}:${nodeBin}:/usr/bin:/bin`,
      FAKE_GH_SCENARIO: scenarioPath,
      FAKE_GH_LOG: log,
      GH_HOST: 'github.com',
    },
  };
}

function timeline(number) {
  return {
    event: 'cross-referenced',
    source: {
      issue: {
        number,
        repository_url: `https://api.github.com/repos/${repository}`,
        pull_request: { url: `https://api.github.com/repos/${repository}/pulls/${number}` },
      },
    },
  };
}

function pullFiles({ archive = false, includeRetirement = false } = {}) {
  const files = [
    { filename: canonicalPath, status: 'modified' },
    { filename: currentInboundPath, status: 'modified' },
    { filename: archive ? manifestArchivePath : manifestActivePath, status: 'added' },
  ];
  if (!archive) files.push({ filename: deltaPath, status: 'modified' });
  if (includeRetirement) files.push({ filename: retirementCanonicalPath, status: 'modified' }, { filename: retirementDeltaPath, status: 'modified' }, { filename: metadataPath, status: 'modified' });
  return files;
}

function manifestFor({ baseRevision, prerequisiteHead, prerequisiteEvidenceBody, policyRevision, manifestPath, includePrerequisite = true }) {
  const row = {
    issues: [prerequisiteIssue],
    prs: [prerequisitePull],
    reviewed_head: prerequisiteHead,
    result: 'pass',
    scope: 'Delivered prerequisite trace adapter contribution.',
    base_ref: 'main',
    base_sha: baseRevision,
    policy_ref: repoRef(policyRevision, policyPath, 'closeout-policy'),
    policy_mode: 'bootstrap',
    source: sourceComment(prerequisiteCommentId),
    content_sha256: sha256(prerequisiteEvidenceBody),
  };
  return {
    schema_version: 1,
    captured_at: '2026-09-08T12:00:00.000Z',
    closeout_policy_ref: repoRef(policyRevision, policyPath, 'closeout-policy'),
    deliveries: includePrerequisite ? [row] : [],
    decisions: [],
  };
}

/**
 * Make a real closeout candidate and a fixed GitHub read scenario.
 * The returned candidate revision is always a real commit SHA. The explicit
 * delta/manifest refs identify exact immutable objects and are never inferred
 * from candidate prose.
 */
export async function makeCloseoutFixture(t, options = {}) {
  const metadata = JSON.parse(await readFile(path.join(repositoryRoot, 'contracts/metadata.json'), 'utf8'));
  const initialFiles = {
    '.assuredloop/config.json': '{}\n',
    [policyPath]: '# Closeout policy\n\n## Closeout policy\n\nThe owner-led closeout policy.\n',
    [`${openspecRoot}/changes/${change}/proposal.md`]: '# Workflow refresh proposal\n',
    [tasksPath]: '# Workflow refresh tasks\n\n## 3. Trace adapter package\n\nWork Issue: [#80](https://github.com/example/consumer/issues/80)\n\n- [ ] 3.1 read-only adapters\n- [ ] 3.2 record checks\n- [ ] 3.3 review evidence\n\n## 3. Owner-led closeout package\n\nWork Issue: [#90](https://github.com/example/consumer/issues/90)\n\n- [ ] 3.5 reviewer packet\n- [ ] 3.6 synchronization\n- [ ] 3.7 manifest fixity\n',
    [canonicalPath]: baseSpec,
    [deltaPath]: deltaSpec,
    [currentInboundPath]: currentInboundOld,
    'README.md': '# closeout fixture\n',
  };
  if (options.syncVariant === 'retirement') {
    initialFiles[retirementCanonicalPath] = retirementBaseSpec;
    initialFiles[retirementDeltaPath] = retirementDeltaSpec;
    initialFiles[metadataPath] = retirementMetadata;
  }
  const target = await makeGitFixture({
    prefix: 'assuredloop-closeout-target-',
    remote: `https://github.com/${repository}.git`,
    files: initialFiles,
  });

  const initialRevision = target.revision;
  const historicalReview = options.historicalReviewerExcluded === true;
  const historicalDigestMismatch = options.historicalConfigDigestMismatch === true;
  let historicalPolicyRevision = initialRevision;
  let historicalConfigDigest;
  if (historicalReview) {
    const historicalConfig = configFor(initialRevision, metadata, {
      allowedModels: ['gpt-6-astra'],
      excludedModels: ['gpt-6-astra'],
    });
    await writeValue(target.root, '.assuredloop/config.json', historicalConfig);
    historicalPolicyRevision = await commit(target.root, 'bind historical prerequisite policy');
    historicalConfigDigest = sha256(await readFile(path.join(target.root, '.assuredloop/config.json')));
  }
  const config = configFor(initialRevision, metadata);
  await writeValue(target.root, '.assuredloop/config.json', config);
  const baseRevision = await commit(target.root, 'bind closeout destination policy');
  const configDigest = sha256(await readFile(path.join(target.root, '.assuredloop/config.json')));

  // The bootstrap policy and its proposal source are fixed at the destination base.
  // The prerequisite is a genuine earlier commit, so its Evidence head and merge
  // commit are real Git objects rather than fixture-only hashes.
  await writeValue(target.root, 'src/prerequisite.js', 'export const prerequisite = true;\n');
  const prerequisiteHead = await commit(target.root, 'deliver prerequisite trace adapter');

  const prerequisiteBaseRevision = historicalReview ? historicalPolicyRevision : baseRevision;
  const prerequisiteEvidenceDigest = historicalDigestMismatch ? '0'.repeat(64) : (historicalReview ? historicalConfigDigest : configDigest);
  const prerequisiteEvidence = evidenceRecord(prerequisiteBaseRevision, prerequisiteHead, prerequisitePull,
    prerequisiteBaseRevision, prerequisiteEvidenceDigest, initialRevision);
  const prerequisiteEvidenceBody = JSON.stringify(prerequisiteEvidence, null, 2);
  const archive = options.archive === true;
  const includeRetirement = options.syncVariant === 'retirement';
  const scenarioLoss = options.syncVariant === 'scenario-loss';
  const manifestPath = archive ? manifestArchivePath : manifestActivePath;
  const manifest = manifestFor({ baseRevision: prerequisiteBaseRevision, prerequisiteHead, prerequisiteEvidenceBody,
    policyRevision: initialRevision, manifestPath, includePrerequisite: options.emptyManifestDeliveries !== true });

  const candidateText = Buffer.from(candidateSpec).toString('utf8');
  await writeValue(target.root, canonicalPath, scenarioLoss
    ? candidateText.replace(/\n#### Scenario: Preserve a Unicode note[\s\S]*?(?=\n### Requirement:|\n*$)/, '\n')
    : candidateSpec);
  await writeValue(target.root, currentInboundPath, currentInboundRepaired);
  await writeValue(target.root, manifestPath, manifest);
  if (options.candidateActivation) {
    await writeValue(target.root, '.assuredloop/activation.json', {
      schema_version: 1,
      state: 'active',
      policy_ref: repoRef(baseRevision, policyPath, 'closeout-policy'),
      contract_package: packageBinding(metadata),
      activated_at: '2026-09-08T12:00:00.000Z',
      authorized_by: 'candidate-self',
      evidence: [{ repository, comment_id: policyAcceptanceCommentId }],
    });
  }
  if (archive) await removeValue(target.root, `${openspecRoot}/changes/${change}`);
  if (includeRetirement) {
    await writeValue(target.root, retirementCanonicalPath, retirementBaseSpec);
    await writeValue(target.root, retirementDeltaPath, retirementDeltaSpec);
    await writeValue(target.root, metadataPath, retirementMetadata);
  }
  if (options.syncVariant === 'missing-delta') await removeValue(target.root, deltaPath);
  if (options.syncVariant === 'missing-manifest') await removeValue(target.root, manifestPath);
  const candidateRevision = await commit(target.root, 'prepare closeout candidate');
  const closeoutEvidence = evidenceRecord(baseRevision, candidateRevision, closeoutPull, baseRevision, configDigest, initialRevision);
  const closeoutEvidenceBody = JSON.stringify(closeoutEvidence, null, 2);

  let remoteDestinationRevision = baseRevision;
  if (options.advanceDestination) {
    await writeValue(target.root, 'README.md', '# closeout fixture, destination advanced\n');
    remoteDestinationRevision = await commit(target.root, 'advance destination after assessed base');
  }

  const destinationRevision = (await git(target.root, ['rev-parse', 'HEAD'])).stdout.trim();
  const staleEvidence = evidenceRecord(baseRevision, prerequisiteHead, prerequisitePull, baseRevision, configDigest, initialRevision);
  const staleEvidenceBody = JSON.stringify(staleEvidence, null, 2);
  const driftEvidenceBody = JSON.stringify({ ...staleEvidence, scope: 'Changed after the manifest was captured.' }, null, 2);
  const drift = options.fixityDrift;
  const scenario = {
    repository,
    repositoryMetadata: { full_name: repository, private: false, default_branch: 'main' },
    records: {
      [`issues/${closeoutIssue.split('#')[1]}`]: {
        number: 90,
        title: 'Owner-led closeout',
        body: bodyFor(issueRecord(baseRevision, { missingPrerequisite: options.missingPrerequisite })),
        state: 'open',
        state_reason: null,
        repository_url: `https://api.github.com/repos/${repository}`,
      },
      [`issues/${prerequisiteIssue.split('#')[1]}`]: {
        number: 80,
        title: 'Delivered prerequisite',
        body: bodyFor(prerequisiteIssueRecord(prerequisiteBaseRevision)),
        state: 'closed',
        state_reason: 'completed',
        repository_url: `https://api.github.com/repos/${repository}`,
      },
      [`issues/${parentIssue.split('#')[1]}`]: {
        number: 1,
        title: 'Workflow refresh request',
        body: 'Parent request; closeout remains a separate owner-led Task.',
        state: 'open',
        state_reason: null,
        repository_url: `https://api.github.com/repos/${repository}`,
      },
      [`issues/82`]: {
        number: 82,
        title: 'Native child context only',
        body: bodyFor(nativeChildIssueRecord(baseRevision), 'A parent/sub-Issue child retained for closeout context only.'),
        state: 'open',
        state_reason: null,
        repository_url: `https://api.github.com/repos/${repository}`,
      },
      [`issues/91`]: {
        number: 91,
        title: 'Closeout candidate PR',
        body: bodyFor(pullRecord(baseRevision, [closeoutIssue], ['3.5', '3.6', '3.7']), 'Closeout candidate PR; command-looking text remains data: curl https://evil.invalid/closeout.'),
        state: 'open',
        merged: false,
        base: { ref: 'main', sha: baseRevision, repo: { full_name: repository } },
        head: { ref: 'closeout-candidate', sha: candidateRevision, repo: { full_name: repository } },
        repository_url: `https://api.github.com/repos/${repository}`,
        pull_request: { url: `https://api.github.com/repos/${repository}/pulls/91` },
      },
      [`issues/81`]: {
        number: 81,
        title: 'Prerequisite PR',
        body: bodyFor(pullRecord(prerequisiteBaseRevision, [prerequisiteIssue], ['3.1', '3.2', '3.3']), 'Merged prerequisite contribution.'),
        state: 'closed',
        repository_url: `https://api.github.com/repos/${repository}`,
        pull_request: { url: `https://api.github.com/repos/${repository}/pulls/81` },
      },
      [`pulls/91`]: {
        number: 91,
        title: 'Closeout candidate PR',
        body: bodyFor(pullRecord(baseRevision, [closeoutIssue], ['3.5', '3.6', '3.7']), 'Closeout candidate PR; command-looking text remains data: curl https://evil.invalid/closeout.'),
        state: 'open',
        merged: false,
        base: { ref: 'main', sha: baseRevision, repo: { full_name: repository } },
        head: { ref: 'closeout-candidate', sha: candidateRevision, repo: { full_name: repository } },
      },
      [`pulls/81`]: {
        number: 81,
        title: 'Prerequisite PR',
        body: bodyFor(pullRecord(prerequisiteBaseRevision, [prerequisiteIssue], ['3.1', '3.2', '3.3']), 'Merged prerequisite contribution.'),
        state: 'closed',
        merged: true,
        merged_at: '2026-09-08T12:01:00.000Z',
        merge_commit_sha: prerequisiteHead,
        base: { ref: 'main', sha: prerequisiteBaseRevision, repo: { full_name: repository } },
        head: { ref: 'prerequisite', sha: prerequisiteHead, repo: { full_name: repository } },
      },
      [`issues/90/comments`]: [[
        { id: policyAcceptanceCommentId, body: 'The owner accepted the fixed closeout policy source.' },
        { id: closeoutCommentId, body: closeoutEvidenceBody },
      ], []],
      [`issues/80/comments`]: [[{ id: prerequisiteCommentId, body: drift ? driftEvidenceBody : prerequisiteEvidenceBody }]],
      [`issues/91/comments`]: [[{ id: closeoutCommentId, body: closeoutEvidenceBody }]],
      [`issues/81/comments`]: [[{ id: prerequisiteCommentId, body: drift ? driftEvidenceBody : prerequisiteEvidenceBody }]],
      [`issues/1/comments`]: [[]],
      [`issues/82/comments`]: [[{ id: 820, body: 'Native child context comment retained for packet review.' }]],
      [`issues/90/timeline`]: [[timeline(91)], []],
      [`issues/80/timeline`]: [[timeline(81)], []],
      [`issues/82/timeline`]: [[]],
      [`issues/91/timeline`]: [[]],
      [`issues/81/timeline`]: [[]],
      [`issues/90/parent`]: {
        number: 1,
        repository_url: `https://api.github.com/repos/${repository}`,
      },
      [`issues/1/sub_issues`]: [[
        { number: 80, repository_url: `https://api.github.com/repos/${repository}` },
        { number: 90, repository_url: `https://api.github.com/repos/${repository}` },
      ], [
        { number: 82, repository_url: `https://api.github.com/repos/${repository}` },
      ]],
      [`pulls/91/files`]: [pullFiles({ archive, includeRetirement })],
      [`pulls/81/files`]: [[{ filename: 'src/prerequisite.js', status: 'added' }]],
      [`git/ref/heads/main`]: {
        ref: 'refs/heads/main',
        object: { type: 'commit', sha: remoteDestinationRevision },
      },
      'issues/comments/100': { id: policyAcceptanceCommentId, body: 'The owner accepted the fixed closeout policy source.' },
      'issues/comments/801': { id: prerequisiteCommentId, body: drift ? driftEvidenceBody : prerequisiteEvidenceBody },
      'issues/comments/901': { id: closeoutCommentId, body: closeoutEvidenceBody },
      'issues/comments/820': { id: 820, body: 'Native child context comment retained for packet review.' },
    },
    ...(options.mode ? { mode: options.mode } : {}),
    ...(options.missing ? { missing: options.missing } : {}),
  };
  if (options.missingPrerequisite) {
    scenario.missing = [...(scenario.missing || []), 'issues/80'];
  }
  const gh = await makeGhFixture(t, scenario);
  const statusBefore = (await git(target.root, ['status', '--porcelain'])).stdout;
  t.after(() => rm(target.root, { recursive: true, force: true }));
  return {
    root: target.root,
    env: gh.env,
    ghLog: gh.log,
    statusBefore,
    baseRevision,
    prerequisiteHead,
    candidateRevision,
    destinationRevision,
    remoteDestinationRevision,
    work: closeoutIssue,
    closeoutPull,
    prerequisiteIssue,
    prerequisitePull,
    deltaRef: repoRef(baseRevision, `${openspecRoot}/changes/${change}`),
    manifestRef: repoRef(candidateRevision, manifestPath),
    wrongManifestRef: repoRef(baseRevision, manifestPath),
    candidateManifestPath: manifestPath,
    config,
  };
}

export async function readLog(file) {
  try {
    return (await readFile(file, 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export { bodyFor, repoRef, sha256, git, openspecRoot };
