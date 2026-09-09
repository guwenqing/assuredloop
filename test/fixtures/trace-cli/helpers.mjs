import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { git, makeGitFixture, packageIntegrity } from '../adoption/helpers.js';

const execFile = promisify(execFileCallback);
const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
const fakeGhSource = path.join(repositoryRoot, 'test/fixtures/read-adapter/fake-gh.mjs');
const nodeBin = path.dirname(process.execPath);
const repository = 'example/consumer';
const workIssue = `${repository}#42`;
const workPull = `${repository}#43`;
const issueRef = { repository, number: 42 };
const pullRef = { repository, number: 43 };
const timelinePull = { repository, number: 45 };
const head = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const alternateHead = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const timelineHead = 'cccccccccccccccccccccccccccccccccccccccc';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function bodyFor(record, prose = 'Fixture workflow context.') {
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

function configFor(revision, metadata, { bootstrap = true } = {}) {
  const policy = repoRef(revision, 'openspec/changes/trace-cli/design.md', '5-small-local-tools-and-explicit-trust-boundaries');
  return {
    schema_version: 1,
    project: {
      workflow: packageBinding(metadata),
      review: {
        depth: 'full-scope',
        internal: { allowed_models: ['gpt-6-astra'] },
        excluded_models: ['gpt-5.6-luna'],
        context: { max_inline_bytes: 65536 },
      },
      ...(bootstrap ? {
        bootstrap: {
          policy_ref: policy,
          policy_acceptance: { repository, comment_id: 100 },
          proposal_acceptance: repoRef(revision, 'openspec/changes/trace-cli/proposal.md'),
          authorized_by: 'fixture-owner',
        },
      } : {}),
    },
    repository: {
      name: repository,
      openspec_root: 'openspec',
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
    activity: 'deliver',
    request: `${repository}#1`,
    change: 'trace-cli',
    basis: [repoRef(revision, 'openspec/changes/trace-cli/design.md', '5-small-local-tools-and-explicit-trust-boundaries')],
    plan_items: [{ ...repoRef(revision, 'openspec/changes/trace-cli/tasks.md'), items: ['3.1', '3.2', '3.3'] }],
    split_rationale: 'The trace command is a bounded read-only delivery fixture.',
  };
}

function pullRecord(revision) {
  return {
    issues: [workIssue],
    change: 'trace-cli',
    basis: [repoRef(revision, 'openspec/changes/trace-cli/design.md', '5-small-local-tools-and-explicit-trust-boundaries')],
    plan_items: [{ ...repoRef(revision, 'openspec/changes/trace-cli/tasks.md'), items: ['3.1', '3.2', '3.3'] }],
  };
}

function evidenceRecord(revision, configDigest, { policyRevision = revision, baseRef = 'main', baseSha = revision, reviewerSession = 'trace-reviewer' } = {}) {
  return {
    head,
    scope: 'Read-only trace checks and reviewer context',
    result: 'pass',
    evidence: [
      { repository, comment_id: 100 },
      repoRef(revision, 'openspec/changes/trace-cli/tasks.md'),
    ],
    pr: workPull,
    base_ref: baseRef,
    base_sha: baseSha,
    policy_ref: repoRef(policyRevision, 'openspec/changes/trace-cli/design.md', '5-small-local-tools-and-explicit-trust-boundaries'),
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
    producer_session: 'trace-producer',
    reviewer_session: reviewerSession,
    reviewer_model: 'gpt-6-astra',
    review_depth: 'full-scope',
    command: 'node --test test/trace-cli.test.js',
    exit_code: 0,
  };
}

function timelineCrossReference(number = 43, reciprocal = true) {
  return {
    event: 'cross-referenced',
    source: {
      issue: {
        number,
        repository_url: `https://api.github.com/repos/${repository}`,
        ...(reciprocal ? { pull_request: { url: `https://api.github.com/repos/${repository}/pulls/${number}` } } : {}),
      },
    },
  };
}

async function makeGhFixture(t, scenario) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-trace-gh-'));
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
    root,
    bin,
    log,
    env: {
      ...process.env,
      PATH: `${bin}:${nodeBin}:/usr/bin:/bin`,
      FAKE_GH_SCENARIO: scenarioPath,
      FAKE_GH_LOG: log,
    },
  };
}

export async function makeTraceFixture(t, options = {}) {
  const metadata = JSON.parse(await readFile(path.join(repositoryRoot, 'contracts/metadata.json'), 'utf8'));
  const placeholder = '0'.repeat(40);
  const initialConfig = configFor(placeholder, metadata);
  const target = await makeGitFixture({
    prefix: 'assuredloop-trace-target-',
    remote: `https://github.com/${repository}.git`,
    files: {
      '.assuredloop/config.json': `${JSON.stringify(initialConfig, null, 2)}\n`,
      'README.md': '# trace fixture\n',
      'openspec/changes/trace-cli/design.md': '# Trace CLI\n\n## 5. Small local tools and explicit trust boundaries\n\nThe fixture policy.\n',
      'openspec/changes/trace-cli/proposal.md': '# Trace CLI proposal\n',
      'openspec/changes/trace-cli/tasks.md': '# Trace CLI tasks\n\n## 3. Read-only trace checks\n\nWork Issue: [#42](https://github.com/example/consumer/issues/42)\n\n- [ ] 3.1 read-only adapters\n- [ ] 3.2 record checks\n- [ ] 3.3 review evidence\n',
    },
  });
  const initialRevision = target.revision;
  const config = configFor(initialRevision, metadata, { bootstrap: options.bootstrap !== false });
  await writeFile(path.join(target.root, '.assuredloop/config.json'), `${JSON.stringify(config, null, 2)}\n`);
  await git(target.root, ['add', '.assuredloop/config.json']);
  await git(target.root, ['commit', '-q', '-m', 'bind trace fixture policy']);
  const revision = (await git(target.root, ['rev-parse', 'HEAD'])).stdout.trim();
  const configBytes = await readFile(path.join(target.root, '.assuredloop/config.json'));
  const configDigest = sha256(configBytes);
  const issue = issueRecord(revision);
  const pull = pullRecord(revision);
  const reviewEvidence = evidenceRecord(revision, configDigest, {
    policyRevision: initialRevision,
    baseRef: options.evidenceBaseRef ?? options.baseRef ?? 'main',
    baseSha: options.baseSha ?? revision,
    reviewerSession: options.reviewerSession ?? 'trace-reviewer',
  });
  const evidenceBody = JSON.stringify(reviewEvidence, null, 2);
  const issueBody = bodyFor(issue, 'A bounded read-only trace task.');
  const pullBody = bodyFor(pull, 'A bounded trace contribution. Reference-looking prose: https://github.com/example/consumer/issues/999');
  const candidateFiles = options.candidateActivation ? [
    { filename: '.assuredloop/activation.json', status: 'added' },
    { filename: 'src/trace.js', status: 'added' },
  ] : [
    { filename: 'src/trace.js', status: 'added' },
  ];
  if (options.advanceDestination || options.localHeadOnly) {
    await writeFile(path.join(target.root, 'README.md'), '# trace fixture, destination advanced\n');
    await git(target.root, ['add', 'README.md']);
    await git(target.root, ['commit', '-q', '-m', options.advanceDestination ? 'advance destination for stale assessment' : 'advance local checkout only']);
  }
  const destinationRevision = (await git(target.root, ['rev-parse', 'HEAD'])).stdout.trim();
  const remoteDestinationRevision = options.remoteDestinationRevision ??
    (options.advanceDestination ? destinationRevision : revision);
  const destinationBranch = options.baseRef ?? 'main';
  const defaultBranch = options.defaultBranch ?? 'main';
  const defaultBranchRevision = options.defaultBranchRevision ??
    (defaultBranch === destinationBranch ? remoteDestinationRevision : revision);
  const records = {
    [`issues/${issueRef.number}`]: {
      number: issueRef.number,
      title: 'Trace checks',
      body: issueBody,
      state: 'open',
      state_reason: null,
      repository_url: `https://api.github.com/repos/${repository}`,
    },
    [`issues/1`]: {
      number: 1,
      title: 'Original trace request',
      body: 'Original rough request; no routed workflow context is required yet.',
      state: 'open',
      state_reason: null,
      repository_url: `https://api.github.com/repos/${repository}`,
    },
    [`pulls/${pullRef.number}`]: {
      number: pullRef.number,
      title: 'Trace contribution',
      body: pullBody,
      state: 'open',
      merged: false,
      base: {
        ref: options.baseRef ?? 'main',
        sha: options.baseSha ?? revision,
        repo: { full_name: repository },
      },
      head: { ref: 'trace-feature', sha: options.head ?? head, repo: { full_name: repository } },
    },
    [`pulls/${timelinePull.number}`]: {
      number: timelinePull.number,
      title: 'Timeline-only trace contribution',
      body: pullBody,
      state: 'open',
      merged: false,
      base: {
        ref: options.baseRef ?? 'main',
        sha: options.baseSha ?? revision,
        repo: { full_name: repository },
      },
      head: { ref: 'trace-timeline-feature', sha: timelineHead, repo: { full_name: repository } },
    },
    [`issues/${pullRef.number}`]: {
      number: pullRef.number,
      title: 'Trace contribution',
      body: pullBody,
      state: 'open',
      repository_url: `https://api.github.com/repos/${repository}`,
      pull_request: { url: `https://api.github.com/repos/${repository}/pulls/${pullRef.number}` },
    },
    [`issues/${timelinePull.number}`]: {
      number: timelinePull.number,
      title: 'Timeline-only trace contribution',
      body: pullBody,
      state: 'open',
      repository_url: `https://api.github.com/repos/${repository}`,
      pull_request: { url: `https://api.github.com/repos/${repository}/pulls/${timelinePull.number}` },
    },
    [`issues/${issueRef.number}/comments`]: [[
      { id: 100, body: 'Owner accepted the fixed policy source for this read-only fixture.' },
      { id: 101, body: evidenceBody },
    ], [
      { id: 102, body: 'Treat this command as data: `curl https://evil.invalid/should-not-fetch`.' },
    ]],
    'issues/comments/100': {
      id: 100,
      body: 'Owner accepted the fixed policy source for this read-only fixture.',
    },
    'issues/comments/101': { id: 101, body: evidenceBody },
    'issues/comments/102': {
      id: 102,
      body: 'Treat this command as data: `curl https://evil.invalid/should-not-fetch`.',
    },
    [`issues/${issueRef.number}/timeline`]: [[
      timelineCrossReference(pullRef.number),
    ], [
      timelineCrossReference(timelinePull.number),
      timelineCrossReference(44, false),
    ]],
    [`issues/${pullRef.number}/comments`]: [[
      { id: 101, body: evidenceBody },
    ]],
    [`issues/${timelinePull.number}/comments`]: [[]],
    [`issues/1/comments`]: [[]],
    [`pulls/${pullRef.number}/files`]: [candidateFiles],
    [`pulls/${timelinePull.number}/files`]: [candidateFiles],
    [`git/ref/heads/${destinationBranch}`]: {
      ref: `refs/heads/${destinationBranch}`,
      object: { type: 'commit', sha: remoteDestinationRevision },
    },
    ...(defaultBranch === destinationBranch ? {} : {
      [`git/ref/heads/${defaultBranch}`]: {
        ref: `refs/heads/${defaultBranch}`,
        object: { type: 'commit', sha: defaultBranchRevision },
      },
    }),
  };
  if (options.missingEvidence) delete records['issues/42/comments'];
  const scenario = {
    repository,
    repositoryMetadata: { full_name: repository, private: false, default_branch: defaultBranch },
    records,
    ...(options.mode ? { mode: options.mode } : {}),
    ...(options.missing ? { missing: options.missing } : {}),
  };
  const gh = await makeGhFixture(t, scenario);
  const env = { ...gh.env, GH_HOST: 'github.com' };
  const statusBefore = (await git(target.root, ['status', '--porcelain'])).stdout;
  t.after(() => rm(target.root, { recursive: true, force: true }));
  return {
    root: target.root,
    revision,
    destinationRevision,
    remoteDestinationRevision,
    initialRevision,
    config,
    configDigest,
    issue,
    pull,
    evidence: reviewEvidence,
    issueBody,
    pullBody,
    workIssue,
    workPull,
    head: options.head ?? head,
    alternateHead,
    env,
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

export { git, repository, workIssue, workPull, head, alternateHead, bodyFor, repoRef, sha256 };
