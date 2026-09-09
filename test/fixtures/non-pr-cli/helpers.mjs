import { copyFile, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

import { git, makeGitFixture, packageIntegrity } from '../adoption/helpers.js';

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
const fakeGhSource = new URL('./fake-gh.mjs', import.meta.url);
const nodeBin = path.dirname(process.execPath);
const repository = 'example/consumer';
const defaultBranch = 'develop';
const researchWork = `${repository}#60`;
const cancellationWork = `${repository}#61`;
const intakeWork = `${repository}#62`;
const noSpecWork = `${repository}#63`;
const policyAnchor = '5-small-local-tools-and-explicit-trust-boundaries';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function bodyFor(record, prose = 'Fixture workflow context.') {
  if (record === null) return `${prose}\n`;
  return `${prose}\n\n## Workflow context\n\n\`\`\`json\n${JSON.stringify(record, null, 2)}\n\`\`\`\n`;
}

function repoRef(revision, pathname, anchor) {
  return { repository, revision, path: pathname, ...(anchor ? { anchor } : {}) };
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

function configFor(revision, metadata, options = {}) {
  const policyRepository = options.policyRepository ?? repository;
  const policyRevision = options.policyRevision ?? revision;
  const policy = {
    repository: policyRepository,
    revision: policyRevision,
    path: 'openspec/changes/non-pr/design.md',
    anchor: policyAnchor,
  };
  const proposal = {
    repository: policyRepository,
    revision: policyRevision,
    path: 'openspec/changes/non-pr/proposal.md',
  };
  return {
    schema_version: 1,
    project: {
      workflow: packageBinding(metadata),
      review: {
        depth: 'full-scope',
        internal: { allowed_models: ['gpt-6-astra'] },
        excluded_models: ['gpt-5.6-luna'],
        context: { max_inline_bytes: options.contextBudget ?? 2048 },
      },
      bootstrap: {
        policy_ref: policy,
        policy_acceptance: { repository, comment_id: 500 },
        proposal_acceptance: proposal,
        authorized_by: 'fixture-owner',
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
      ...(options.allowedReferenceRepositories ? {
        allowed_reference_repositories: options.allowedReferenceRepositories,
      } : {}),
    },
  };
}

function issueRecord(revision, activity, options = {}) {
  const common = {
    activity,
    request: `${repository}#1`,
    change: 'non-pr',
    basis: options.noSpec ? [] : [repoRef(revision, 'openspec/changes/non-pr/design.md', policyAnchor)],
  };
  if (options.noSpec) common.no_spec_reason = 'This fixture intentionally has no applicable Spec for the bounded change.';
  if (activity === 'research') common.split_rationale = 'Research is returned to the owner with explicit limits.';
  return common;
}

function evidenceRecord({ head = null, noHeadReason, scope, result = 'pass', reviewerModel = 'gpt-6-astra' } = {}) {
  return {
    head,
    ...(head === null ? { no_head_reason: noHeadReason } : {}),
    scope,
    result,
    evidence: [{ repository, comment_id: 500 }],
    producer_session: 'non-pr-producer',
    reviewer_session: 'non-pr-reviewer',
    reviewer_model: reviewerModel,
    review_depth: 'full-scope',
  };
}

async function makeGhFixture(t, scenario) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-non-pr-gh-'));
  const bin = path.join(root, 'bin');
  const scenarioPath = path.join(root, 'scenario.json');
  const log = path.join(root, 'commands.log');
  await mkdir(bin, { recursive: true });
  await writeFile(scenarioPath, `${JSON.stringify(scenario)}\n`);
  const executable = path.join(bin, 'gh');
  await copyFile(fileURLToPath(fakeGhSource), executable);
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

function issueSnapshot(number, body, { state = 'open', stateReason = null, labels = [] } = {}) {
  return {
    number,
    title: `Non-PR fixture #${number}`,
    labels,
    body,
    state,
    state_reason: stateReason,
    repository_url: `https://api.github.com/repos/${repository}`,
  };
}

function addIssueRecords(records, number, body, options) {
  records[`issues/${number}`] = issueSnapshot(number, body, options);
}

function addComment(records, number, id, body) {
  records[`issues/${number}/comments`] = [[{ id, body }]];
  records[`issues/comments/${id}`] = { id, body };
}

export async function makeNonPrFixture(t, options = {}) {
  const metadata = JSON.parse(await readFile(path.join(repositoryRoot, 'contracts/metadata.json'), 'utf8'));
  const placeholder = '0'.repeat(40);
  const initialConfig = configFor(placeholder, metadata, options);
  const target = await makeGitFixture({
    prefix: 'assuredloop-non-pr-target-',
    remote: `https://github.com/${repository}.git`,
    files: {
      '.assuredloop/config.json': `${JSON.stringify(initialConfig, null, 2)}\n`,
      'README.md': '# non-pr fixture\n',
      'openspec/changes/non-pr/design.md': '# Non-PR design\n\n## 5. Small local tools and explicit trust boundaries\n\nCurrent policy fixture.\n',
      'openspec/changes/non-pr/proposal.md': '# Non-PR proposal\n',
      'openspec/changes/non-pr/tasks.md': '# Non-PR tasks\n\n- [ ] 3.2 record checks\n',
    },
  });
  const initialRevision = target.revision;
  const validConfig = configFor(initialRevision, metadata, options);
  await writeFile(path.join(target.root, '.assuredloop/config.json'), `${JSON.stringify(validConfig, null, 2)}\n`);
  await git(target.root, ['add', '.assuredloop/config.json']);
  await git(target.root, ['commit', '-q', '-m', 'bind non-pr current policy']);
  const policyRevision = (await git(target.root, ['rev-parse', 'HEAD'])).stdout.trim();
  let branchRevision = policyRevision;
  let driftRevision = null;
  if (options.drift) {
    await writeFile(path.join(target.root, 'README.md'), '# non-pr fixture, branch drift\n');
    await git(target.root, ['add', 'README.md']);
    await git(target.root, ['commit', '-q', '-m', 'advance current default branch']);
    driftRevision = (await git(target.root, ['rev-parse', 'HEAD'])).stdout.trim();
  }
  if (options.missingConfig) {
    await rm(path.join(target.root, '.assuredloop/config.json'));
    await git(target.root, ['add', '-u', '.assuredloop/config.json']);
    await git(target.root, ['commit', '-q', '-m', 'remove current config']);
    branchRevision = (await git(target.root, ['rev-parse', 'HEAD'])).stdout.trim();
  }
  if (options.localHeadOld) await git(target.root, ['checkout', '-q', '--detach', initialRevision]);
  const configBytes = await readFile(path.join(target.root, '.assuredloop/config.json')).catch(() => Buffer.from(''));
  const configDigest = sha256(configBytes);
  const researchRecord = issueRecord(policyRevision, 'research');
  const cancellationRecord = issueRecord(policyRevision, 'deliver');
  const noSpecRecord = issueRecord(policyRevision, 'deliver', { noSpec: true });
  const evidenceHead = options.evidenceHead === 'initial' ? initialRevision : (options.evidenceHead ?? null);
  const researchEvidence = evidenceRecord({
    head: evidenceHead,
    noHeadReason: 'This bounded research has no implementation revision.',
    scope: options.scopeSentinel ? `${repository}#999` : 'Compare native current-context reads and report limits.',
    reviewerModel: options.reviewerModel ?? 'gpt-6-astra',
  });
  if (options.missingNoHeadReason) delete researchEvidence.no_head_reason;
  const cancellationEvidence = evidenceRecord({
    noHeadReason: 'Cancelled before implementation; no candidate revision exists.',
    scope: 'Cancellation rationale and remaining requirement gap.',
    result: 'cancelled',
  });
  const records = {
    'issues/1': issueSnapshot(1, 'Original rough request; no routed Workflow context yet.'),
    'issues/1/comments': [[]],
    'issues/1/timeline': [[]],
    'issues/60/timeline': [[]],
    'issues/61/timeline': [[]],
    'issues/62/timeline': [[]],
    'issues/63/timeline': [[]],
  };
  addIssueRecords(records, 60, bodyFor(researchRecord, 'A bounded research spike with explicit limitations.'), { state: 'closed', stateReason: 'completed', labels: [{ name: validConfig.repository.labels.type.spike }] });
  addIssueRecords(records, 61, bodyFor(cancellationRecord, options.cancelRationale === false
    ? 'This work was cancelled before implementation.'
    : 'Cancellation rationale: superseded by the owner-selected current-context path.'), { state: 'closed', stateReason: 'not_planned', labels: [{ name: validConfig.repository.labels.type.task }] });
  addIssueRecords(records, 62, bodyFor(null, 'A rough incoming request awaiting triage.'), { state: 'open', stateReason: null });
  addIssueRecords(records, 63, bodyFor(noSpecRecord, 'A closed no-Spec implementation request.'), { state: 'closed', stateReason: 'completed', labels: [{ name: validConfig.repository.labels.type.task }] });
  addComment(records, 60, 601, JSON.stringify(researchEvidence, null, 2));
  addComment(records, 61, 611, JSON.stringify(cancellationEvidence, null, 2));
  records['issues/62/comments'] = [[]];
  records['issues/63/comments'] = [[]];
  records['issues/comments/500'] = { id: 500, body: 'Owner accepted the current fixed policy context.' };
  records['issues/60/comments'] = [[{ id: 500, body: 'Owner accepted the current fixed policy context.' }, { id: 601, body: JSON.stringify(researchEvidence, null, 2) }]];
  const sequences = {
    [`git/ref/heads/${defaultBranch}`]: options.drift
      ? [{ ref: `refs/heads/${defaultBranch}`, object: { type: 'commit', sha: policyRevision } }, { ref: `refs/heads/${defaultBranch}`, object: { type: 'commit', sha: driftRevision } }]
      : [{ ref: `refs/heads/${defaultBranch}`, object: { type: 'commit', sha: branchRevision } }],
  };
  if (options.missingDefaultBranch) delete sequences[`git/ref/heads/${defaultBranch}`];
  const scenario = {
    repository,
    repositoryData: {
      full_name: repository,
      ...(options.missingDefaultBranch ? {} : { default_branch: defaultBranch }),
    },
    records,
    sequences,
    ...(options.mode ? { mode: options.mode } : {}),
    ...(options.missing ? { missing: options.missing } : {}),
  };
  const gh = await makeGhFixture(t, scenario);
  const statusBefore = (await git(target.root, ['status', '--porcelain'])).stdout;
  t.after(() => rm(target.root, { recursive: true, force: true }));
  return {
    root: target.root,
    initialRevision,
    revision: policyRevision,
    branchRevision,
    driftRevision,
    config: validConfig,
    configDigest,
    researchEvidence,
    evidenceHead,
    cancellationEvidence,
    researchWork,
    cancellationWork,
    intakeWork,
    noSpecWork,
    repository,
    defaultBranch,
    env: gh.env,
    ghLog: gh.log,
    statusBefore,
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

export { git, repository, defaultBranch, researchWork, cancellationWork, intakeWork, noSpecWork, repoRef, bodyFor };
