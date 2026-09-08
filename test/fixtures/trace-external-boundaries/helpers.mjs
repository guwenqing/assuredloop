import { createHash } from 'node:crypto';
import { chmod, copyFile } from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  git,
  makeTraceFixture,
  workIssue,
  workPull,
} from '../trace-cli/helpers.mjs';

const execFile = promisify(execFileCallback);
const cliPath = path.resolve(new URL('../../../src/cli.js', import.meta.url).pathname);
const boundaryFakeGh = fileURLToPath(new URL('./fake-gh.mjs', import.meta.url));

export { git, makeTraceFixture, workIssue, workPull };

export async function runCli(args, env) {
  try {
    const result = await execFile(process.execPath, [cliPath, ...args], {
      env,
      maxBuffer: 32 * 1024 * 1024,
    });
    return { ...result, exitCode: 0, data: JSON.parse(result.stdout) };
  } catch (error) {
    return {
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
      exitCode: error.code,
      data: error.stdout ? JSON.parse(error.stdout) : null,
    };
  }
}

export async function scenarioOf(fixture) {
  return JSON.parse(await readFile(fixture.env.FAKE_GH_SCENARIO, 'utf8'));
}

export async function saveScenario(fixture, scenario) {
  await writeFile(fixture.env.FAKE_GH_SCENARIO, `${JSON.stringify(scenario)}\n`);
}

export async function installBoundaryFakeGh(fixture) {
  const executable = path.join(path.dirname(fixture.env.FAKE_GH_SCENARIO), 'bin', 'gh');
  await copyFile(boundaryFakeGh, executable);
  await chmod(executable, 0o755);
}

export async function withFixtureEnv(fixture, action) {
  const names = ['PATH', 'FAKE_GH_SCENARIO', 'FAKE_GH_LOG', 'GH_HOST'];
  const saved = new Map(names.map((name) => [name, process.env[name]]));
  for (const name of names) if (fixture.env[name] === undefined) delete process.env[name];
    else process.env[name] = fixture.env[name];
  try {
    return await action();
  } finally {
    for (const [name, value] of saved) if (value === undefined) delete process.env[name];
      else process.env[name] = value;
  }
}

export async function commandLog(fixture) {
  try {
    return (await readFile(fixture.ghLog, 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export function findingText(result) {
  return JSON.stringify([
    ...(Array.isArray(result?.data?.findings) ? result.data.findings : []),
    ...(Array.isArray(result?.data?.context?.findings) ? result.data.context.findings : []),
    ...(Array.isArray(result?.data?.policy?.findings) ? result.data.policy.findings : []),
  ]);
}

export function foreignTimelineEvent() {
  return {
    event: 'cross-referenced',
    source: {
      issue: {
        number: 1,
        repository_url: 'https://api.github.com/repos/unrelated/project',
        pull_request: {
          url: 'https://api.github.com/repos/unrelated/project/pulls/1',
        },
      },
    },
  };
}

function replaceComment(scenario, id, body) {
  for (const key of Object.keys(scenario.records)) {
    if (key === `issues/comments/${id}`) {
      scenario.records[key] = { ...scenario.records[key], body };
      continue;
    }
    if (!key.endsWith('/comments')) continue;
    for (const page of scenario.records[key]) {
      for (const entry of page) if (entry.id === id) entry.body = body;
    }
  }
}

async function commitConfig(fixture, allowed, branch, message) {
  await git(fixture.root, ['checkout', '-q', '-b', branch]);
  const config = structuredClone(fixture.config);
  config.repository.allowed_reference_repositories = [...allowed];
  const bytes = Buffer.from(`${JSON.stringify(config, null, 2)}\n`);
  await writeFile(path.join(fixture.root, '.assuredloop/config.json'), bytes);
  await git(fixture.root, ['add', '.assuredloop/config.json']);
  await git(fixture.root, ['commit', '-q', '-m', message]);
  const revision = (await git(fixture.root, ['rev-parse', 'HEAD'])).stdout.trim();
  await git(fixture.root, ['checkout', '-q', 'main']);
  return { config, bytes, revision, digest: createHash('sha256').update(bytes).digest('hex') };
}

function setScenarioRepositoryMetadata(scenario) {
  scenario.repositoryMetadata = {
    full_name: 'example/consumer',
    private: false,
    default_branch: 'main',
  };
}

function foreignComment(scenario, repository, commentId, body = `Foreign source ${repository}#${commentId}.`) {
  scenario.foreignRepositories ??= {};
  scenario.foreignRepositories[repository] ??= { full_name: repository, private: false };
  scenario.foreignRecords ??= {};
  scenario.foreignRecords[repository] ??= {};
  scenario.foreignRecords[repository][`issues/comments/${commentId}`] = { id: commentId, body };
}

function foreignPolicySource(scenario, repository = 'foreign/secondary') {
  const revision = 'd'.repeat(40);
  const tree = 'e'.repeat(40);
  const content = '# Foreign secondary policy\n';
  const bytes = Buffer.from(content);
  const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  scenario.foreignRepositories ??= {};
  scenario.foreignRecords ??= {};
  scenario.foreignRepositories[repository] = { full_name: repository, private: false };
  scenario.foreignRecords[repository] ??= {};
  scenario.foreignRecords[repository][`git/commits/${revision}`] = { sha: revision, tree: { sha: tree } };
  scenario.foreignRecords[repository][`git/trees/${tree}`] = {
    sha: tree,
    truncated: false,
    tree: [{ path: 'policy.md', mode: '100644', type: 'blob', sha: blob }],
  };
  scenario.foreignRecords[repository][`git/blobs/${blob}`] = {
    sha: blob,
    encoding: 'base64',
    content: bytes.toString('base64'),
    size: bytes.length,
  };
  return { repository, revision, path: 'policy.md' };
}

function updateEvidenceRecord(scenario, id, update) {
  const original = JSON.parse(scenario.records[`issues/comments/${id}`].body);
  const next = { ...original, ...update };
  replaceComment(scenario, id, JSON.stringify(next, null, 2));
  return next;
}

function addPullEvidence(scenario, pullNumber, commentId, record) {
  scenario.records[`issues/${pullNumber}/comments`] = [[{ id: commentId, body: JSON.stringify(record, null, 2) }]];
  scenario.records[`issues/comments/${commentId}`] = { id: commentId, body: JSON.stringify(record, null, 2) };
}

export async function makeLinkedPolicyCeilingFixture(t, { shared = false, outsidePrimary = false, reverse = false } = {}) {
  const fixture = await makeTraceFixture(t);
  await installBoundaryFakeGh(fixture);
  const scenario = await scenarioOf(fixture);
  setScenarioRepositoryMetadata(scenario);
  const primaryAllowed = outsidePrimary ? ['foreign/a'] : (shared ? ['foreign/shared'] : ['foreign/a', 'foreign/b']);
  const firstAllowed = outsidePrimary ? ['foreign/b'] : (shared ? ['foreign/shared'] : ['foreign/a']);
  const secondAllowed = outsidePrimary ? ['foreign/a'] : (shared ? [] : ['foreign/b']);
  const primary = await commitConfig(fixture, primaryAllowed, 'primary-ceiling', 'primary live ceiling');
  const first = await commitConfig(fixture, firstAllowed, 'linked-first', 'first linked PR ceiling');
  const second = await commitConfig(fixture, secondAllowed, 'linked-second', 'second linked PR ceiling');
  scenario.records['git/ref/heads/main'] = {
    ref: 'refs/heads/main', object: { type: 'commit', sha: primary.revision },
  };
  scenario.records['git/ref/heads/linked-first'] = {
    ref: 'refs/heads/linked-first', object: { type: 'commit', sha: first.revision },
  };
  scenario.records['git/ref/heads/linked-second'] = {
    ref: 'refs/heads/linked-second', object: { type: 'commit', sha: second.revision },
  };
  scenario.records['pulls/43'].base.ref = 'linked-first';
  scenario.records['pulls/43'].base.sha = first.revision;
  scenario.records['issues/43'].pull_request = { url: 'https://api.github.com/repos/example/consumer/pulls/43' };
  scenario.records['pulls/45'].base.ref = 'linked-second';
  scenario.records['pulls/45'].base.sha = second.revision;
  scenario.records['issues/45'].pull_request = { url: 'https://api.github.com/repos/example/consumer/pulls/45' };

  const firstRef = shared
    ? { repository: 'foreign/shared', comment_id: 9002 }
    : (outsidePrimary ? { repository: 'foreign/b', comment_id: 9001 } : { repository: 'foreign/a', comment_id: 9001 });
  const secondRef = shared
    ? { repository: 'foreign/shared', comment_id: 9002 }
    : (outsidePrimary ? { repository: 'foreign/a', comment_id: 9003 } : { repository: 'foreign/b', comment_id: 9003 });
  const firstRecord = updateEvidenceRecord(scenario, 101, {
    base_ref: 'linked-first',
    base_sha: first.revision,
    config_digest: first.digest,
    policy_ref: { repository: 'example/consumer', revision: first.revision, path: 'openspec/changes/trace-cli/design.md', anchor: '5-small-local-tools-and-explicit-trust-boundaries' },
    evidence: [firstRef],
  });
  const secondRecord = {
    ...firstRecord,
    pr: 'example/consumer#45',
    head: 'cccccccccccccccccccccccccccccccccccccccc',
    base_ref: 'linked-second',
    base_sha: second.revision,
    config_digest: second.digest,
    policy_ref: { repository: 'example/consumer', revision: second.revision, path: 'openspec/changes/trace-cli/design.md', anchor: '5-small-local-tools-and-explicit-trust-boundaries' },
    evidence: [secondRef],
    producer_session: 'trace-second-producer',
    reviewer_session: 'trace-second-reviewer',
  };
  addPullEvidence(scenario, 45, 105, secondRecord);
  if (shared) {
    foreignComment(scenario, 'foreign/shared', 9002);
  } else if (outsidePrimary) {
    foreignComment(scenario, 'foreign/b', 9001);
    foreignComment(scenario, 'foreign/a', 9003);
  } else {
    foreignComment(scenario, 'foreign/a', 9001);
    foreignComment(scenario, 'foreign/b', 9003);
  }
  if (reverse) {
    const firstPage = scenario.records['issues/42/comments'][0];
    const secondEntry = scenario.records['issues/45/comments'][0][0];
    scenario.records['issues/42/comments'][0] = [firstPage[0], secondEntry, firstPage[1]];
  }
  await saveScenario(fixture, scenario);
  return { ...fixture, primary, first, second, firstRef, secondRef };
}

export async function makeSecondaryPrerequisiteWideningFixture(t) {
  const fixture = await makeCloseoutFixtureForBoundary(t);
  await installBoundaryFakeGh(fixture);
  const scenario = await scenarioOf(fixture);
  setScenarioRepositoryMetadata(scenario);
  const widened = await commitConfig(fixture, ['foreign/secondary'], 'secondary-widening', 'unaccepted prerequisite scope widening');
  const foreignPolicy = foreignPolicySource(scenario);
  const widenedConfig = structuredClone(widened.config);
  widenedConfig.project.bootstrap.policy_ref = foreignPolicy;
  const widenedBytes = Buffer.from(`${JSON.stringify(widenedConfig, null, 2)}\n`);
  await git(fixture.root, ['checkout', '-q', 'secondary-widening']);
  await writeFile(path.join(fixture.root, '.assuredloop/config.json'), widenedBytes);
  await git(fixture.root, ['add', '.assuredloop/config.json']);
  await git(fixture.root, ['commit', '-q', '-m', 'record foreign prerequisite policy']);
  const widenedRevision = (await git(fixture.root, ['rev-parse', 'HEAD'])).stdout.trim();
  await git(fixture.root, ['checkout', '-q', 'main']);
  widened.revision = widenedRevision;
  widened.config = widenedConfig;
  widened.bytes = widenedBytes;
  widened.digest = createHash('sha256').update(widenedBytes).digest('hex');
  const evidence = updateEvidenceRecord(scenario, 801, {
    base_ref: 'secondary-widening',
    base_sha: widenedRevision,
    config_digest: widened.digest,
    policy_ref: foreignPolicy,
    evidence: [{ repository: 'foreign/secondary', comment_id: 9004 }],
  });
  scenario.records['git/ref/heads/secondary-widening'] = {
    ref: 'refs/heads/secondary-widening', object: { type: 'commit', sha: widenedRevision },
  };
  scenario.records['pulls/81'].base.ref = 'secondary-widening';
  scenario.records['pulls/81'].base.sha = widenedRevision;
  foreignComment(scenario, 'foreign/secondary', 9004);
  await saveScenario(fixture, scenario);
  return { ...fixture, widened, evidence };
}

export async function makeCurrentPolicyDriftFixture(t) {
  const fixture = await makeTraceFixture(t);
  await installBoundaryFakeGh(fixture);
  const scenario = await scenarioOf(fixture);
  setScenarioRepositoryMetadata(scenario);
  const develop = await commitConfig(fixture, [], 'develop-policy', 'develop current policy');
  scenario.records['git/ref/heads/main'] = {
    ref: 'refs/heads/main', object: { type: 'commit', sha: fixture.revision },
  };
  scenario.records['git/ref/heads/develop'] = {
    ref: 'refs/heads/develop', object: { type: 'commit', sha: develop.revision },
  };
  scenario.records['issues/1/timeline'] = [[]];
  scenario.metadataAfter = {
    endpoint: 'repos/example/consumer/git/ref/heads/main',
    value: { full_name: 'example/consumer', private: false, default_branch: 'develop' },
  };
  await saveScenario(fixture, scenario);
  return { ...fixture, develop };
}

async function makeCloseoutFixtureForBoundary(t) {
  const { makeCloseoutFixture } = await import('../closeout-cli/helpers.mjs');
  return makeCloseoutFixture(t);
}

export async function makeHistoricalScopeWideningFixture(t) {
  const fixture = await makeTraceFixture(t);
  const scenario = await scenarioOf(fixture);

  await writeFile(path.join(fixture.root, 'delivered.txt'), 'delivered\n');
  await git(fixture.root, ['add', 'delivered.txt']);
  await git(fixture.root, ['commit', '-q', '-m', 'delivered candidate']);
  const delivered = (await git(fixture.root, ['rev-parse', 'HEAD'])).stdout.trim();

  await git(fixture.root, ['checkout', '-q', '-b', 'unaccepted-policy']);
  const widened = structuredClone(fixture.config);
  widened.repository.allowed_reference_repositories = ['foreign/private'];
  const widenedBytes = Buffer.from(`${JSON.stringify(widened, null, 2)}\n`);
  await writeFile(path.join(fixture.root, '.assuredloop/config.json'), widenedBytes);
  await git(fixture.root, ['add', '.assuredloop/config.json']);
  await git(fixture.root, ['commit', '-q', '-m', 'unaccepted scope widening']);
  const unaccepted = (await git(fixture.root, ['rev-parse', 'HEAD'])).stdout.trim();
  await git(fixture.root, ['checkout', '-q', 'main']);

  const pull = scenario.records['pulls/43'];
  pull.state = 'closed';
  pull.merged = true;
  pull.merged_at = '2026-09-08T12:00:00Z';
  pull.merge_commit_sha = delivered;
  pull.head.sha = delivered;
  scenario.records['issues/43'].state = 'closed';

  const record = JSON.parse(scenario.records['issues/comments/101'].body);
  record.head = delivered;
  record.base_sha = unaccepted;
  record.config_digest = createHash('sha256').update(widenedBytes).digest('hex');
  record.evidence.push({ repository: 'foreign/private', comment_id: 9000 });
  replaceComment(scenario, 101, JSON.stringify(record));

  await saveScenario(fixture, scenario);
  return { ...fixture, delivered, unaccepted, widened, widenedBytes };
}
