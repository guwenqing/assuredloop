import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

export const execFile = promisify(execFileCallback);
export const repository = 'example/consumer';
export const work = `${repository}#77`;
export const policyPath = 'policy/design.md';
export const configPath = '.assuredloop/config.json';
export const activationPath = '.assuredloop/activation.json';

const gitEnvironment = {
  ...process.env,
  GIT_AUTHOR_NAME: 'historical-policy-test',
  GIT_AUTHOR_EMAIL: 'historical-policy-test@example.invalid',
  GIT_COMMITTER_NAME: 'historical-policy-test',
  GIT_COMMITTER_EMAIL: 'historical-policy-test@example.invalid',
};

export async function git(cwd, args, options = {}) {
  return execFile('git', args, { cwd, env: gitEnvironment, ...options });
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function errorWithCode(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function bytes(value) {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeFixtureFile(root, relativePath, value) {
  const destination = path.join(root, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes(value));
}

async function commit(root, message) {
  await git(root, ['add', '.']);
  await git(root, ['commit', '-q', '-m', message]);
  return (await git(root, ['rev-parse', 'HEAD'])).stdout.trim();
}

function packageBinding(packageMetadata) {
  return {
    name: packageMetadata.name,
    version: packageMetadata.version,
    integrity: `sha512-${Buffer.alloc(64).toString('base64')}`,
    source_ref: structuredClone(packageMetadata.source_ref),
    contracts_path: packageMetadata.contracts_path,
  };
}

function makeConfig(packageMetadata, policyRevision, { candidate = false } = {}) {
  return {
    schema_version: 1,
    project: {
      workflow: packageBinding(packageMetadata),
      review: {
        depth: 'full-scope',
        internal: { allowed_models: candidate ? ['candidate-only'] : ['model-alpha', 'model-beta'] },
        excluded_models: ['model-excluded'],
        model_aliases: { primary: 'model-alpha' },
        context: { max_inline_bytes: 65536 },
      },
      bootstrap: {
        policy_ref: { repository, revision: policyRevision, path: policyPath },
        policy_acceptance: { repository, comment_id: 701 },
        proposal_acceptance: { repository, comment_id: 702 },
        authorized_by: 'example-owner',
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
}

export function comment(id, body) {
  return { id, body, html_url: `https://github.com/${repository}/issues/77#issuecomment-${id}` };
}

/**
 * Build a real merged PR whose recorded pre-merge base differs from the
 * destination base visible after merge. Policy/config are only authoritative
 * at historicalBase; the current base intentionally contains candidate-only
 * policy data so a resolver that reads live state fails this fixture.
 */
export async function makeHistoricalFixture({
  packageMetadata,
  merged = true,
  hideHistoricalObjects = false,
  acceptanceHead = 'ordinary-evidence-head',
} = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-historical-policy-'));
  await git(root, ['init', '-q', '-b', 'main']);
  await git(root, ['remote', 'add', 'origin', `https://github.com/${repository}.git`]);

  const policyBody = '# Accepted policy\n\n## Historical review basis\n';
  await writeFixtureFile(root, policyPath, policyBody);
  const policyRevision = await commit(root, 'policy revision');
  const historicalConfig = makeConfig(packageMetadata, policyRevision);
  await writeFixtureFile(root, configPath, historicalConfig);
  const historicalBase = await commit(root, 'historical destination base');

  await git(root, ['checkout', '-q', '-b', 'feature/historical-delivery']);
  await writeFixtureFile(root, 'candidate/change.txt', 'candidate delivery\n');
  const headRevision = await commit(root, 'candidate delivery');

  await git(root, ['checkout', '-q', 'main']);
  await writeFixtureFile(root, configPath, makeConfig(packageMetadata, policyRevision, { candidate: true }));
  await writeFixtureFile(root, 'candidate/live-only-config.txt', 'live destination advance\n');
  const liveBase = await commit(root, 'advance destination after review');

  let mergeCommit = null;
  if (merged) {
    await git(root, ['merge', '--no-ff', '-q', 'feature/historical-delivery', '-m', 'merge historical delivery']);
    mergeCommit = (await git(root, ['rev-parse', 'HEAD'])).stdout.trim();
  }
  await git(root, ['checkout', '-q', 'feature/historical-delivery']);

  const pull = {
    number: 77,
    merged,
    merged_at: merged ? '2026-09-08T05:00:00Z' : null,
    merge_commit_sha: mergeCommit,
    base: { ref: 'main', sha: liveBase, repo: { full_name: repository } },
    head: { ref: 'feature/historical-delivery', sha: headRevision, repo: { full_name: repository } },
  };

  const comments = {
    [`${repository}#701`]: comment(701, JSON.stringify({ head: acceptanceHead, base_sha: acceptanceHead, result: 'pass' })),
    [`${repository}#702`]: comment(702, 'Proposal acceptance for the historical policy fixture.'),
    [`${repository}#703`]: comment(703, 'Recorded delivery evidence for historical reconstruction.'),
  };
  const calls = { readPull: [], readBlob: [], readComment: [] };
  const adapter = {
    calls,
    async readPull(qualifiedWork) {
      calls.readPull.push(qualifiedWork);
      return structuredClone(pull);
    },
    async readBlob(ref) {
      calls.readBlob.push(structuredClone(ref));
      if (hideHistoricalObjects && ref.revision === historicalBase) {
        throw errorWithCode('record-unavailable', `Historical object unavailable: ${ref.revision}`, { reason: 'git-object-unavailable' });
      }
      try {
        const type = (await git(root, ['cat-file', '-t', `${ref.revision}:${ref.path}`])).stdout.trim();
        if (type !== 'blob') throw errorWithCode('record-unavailable', 'Historical source is not a blob.', { reason: 'not-a-blob' });
        const result = await git(root, ['show', `${ref.revision}:${ref.path}`], { encoding: 'buffer' });
        return Buffer.from(result.stdout);
      } catch (error) {
        if (error.code === 'record-unavailable') throw error;
        throw errorWithCode('record-unavailable', `Historical path is unavailable: ${ref.revision}:${ref.path}`, { reason: 'path-missing' });
      }
    },
    async readComment(ref) {
      calls.readComment.push(structuredClone(ref));
      const key = `${ref.repository}#${ref.comment_id}`;
      if (!Object.hasOwn(comments, key)) throw errorWithCode('record-unavailable', `Missing comment ${key}`);
      return structuredClone(comments[key]);
    },
  };

  const configBytes = Buffer.from(JSON.stringify(historicalConfig, null, 2) + '\n', 'utf8');
  const activationBytes = null;
  const record = {
    head: headRevision,
    scope: 'Historical policy and delivery assessment',
    result: 'pass',
    evidence: [{ repository, comment_id: 703 }],
    pr: work,
    base_ref: 'main',
    base_sha: historicalBase,
    policy_ref: { repository, revision: policyRevision, path: policyPath },
    contract_package: packageBinding(packageMetadata),
    config_digest: sha256(configBytes),
    activation_digest: null,
    policy_mode: 'bootstrap',
    producer_session: 'historical-producer-session',
    reviewer_session: 'historical-reviewer-session',
    reviewer_model: 'model-alpha',
    review_depth: 'full-scope',
  };

  return {
    root,
    adapter,
    pull,
    comments,
    record,
    policyRevision,
    historicalBase,
    liveBase,
    headRevision,
    mergeCommit,
    configBytes,
    activationBytes,
    async dispose() {
      await rm(root, { recursive: true, force: true });
    },
  };
}
