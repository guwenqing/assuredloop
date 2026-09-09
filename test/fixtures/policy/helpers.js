import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
  GIT_AUTHOR_NAME: 'policy-test',
  GIT_AUTHOR_EMAIL: 'policy-test@example.invalid',
  GIT_COMMITTER_NAME: 'policy-test',
  GIT_COMMITTER_EMAIL: 'policy-test@example.invalid',
};

export async function git(cwd, args, options = {}) {
  return execFile('git', args, { cwd, env: gitEnvironment, ...options });
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function errorWithCode(code, message = code, details) {
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

async function commit(root, message, { allowEmpty = false } = {}) {
  await git(root, ['add', '.']);
  await git(root, ['commit', '-q', ...(allowEmpty ? ['--allow-empty'] : []), '-m', message]);
  return (await git(root, ['rev-parse', 'HEAD'])).stdout.trim();
}

async function writeFixtureFile(root, relativePath, value) {
  const destination = path.join(root, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes(value));
}

/**
 * Create a repository with a fixed policy revision, a destination base
 * revision, and an optional candidate revision. Config and activation are
 * written only at the destination base, so candidate-only records cannot be
 * selected by a policy resolver.
 */
export async function makePolicyFixture({
  configFor,
  activationFor,
  configBytesFor,
  activationBytesFor,
  readBlobFailureFor,
  candidateFiles = { 'candidate/change.txt': 'candidate\n' },
  policyBytes = '# Accepted policy\n',
  comments = {},
} = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-policy-'));
  await git(root, ['init', '-q', '-b', 'main']);
  await git(root, ['remote', 'add', 'origin', `https://github.com/${repository}.git`]);

  await writeFixtureFile(root, policyPath, policyBytes);
  const policyRevision = await commit(root, 'policy revision');

  const config = configFor ? await configFor({ policyRevision }) : undefined;
  if (config !== undefined) {
    const raw = configBytesFor ? await configBytesFor({ config, policyRevision }) : config;
    await writeFixtureFile(root, configPath, raw);
  }
  const activation = activationFor ? await activationFor({ policyRevision }) : undefined;
  if (activation !== undefined) {
    const raw = activationBytesFor ? await activationBytesFor({ activation, policyRevision }) : activation;
    await writeFixtureFile(root, activationPath, raw);
  }
  const baseRevision = await commit(root, 'destination base', { allowEmpty: true });

  for (const [relativePath, value] of Object.entries(candidateFiles ?? {})) {
    await writeFixtureFile(root, relativePath, value);
  }
  const headRevision = Object.keys(candidateFiles ?? {}).length
    ? await commit(root, 'candidate change')
    : baseRevision;

  const pull = {
    number: 77,
    base: {
      ref: 'main',
      sha: baseRevision,
      repo: { full_name: repository },
    },
    head: {
      ref: 'feature/policy-check',
      sha: headRevision,
      repo: { full_name: repository },
    },
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
      const injectedFailure = readBlobFailureFor ? await readBlobFailureFor(structuredClone(ref)) : null;
      if (injectedFailure) {
        if (injectedFailure instanceof Error) throw injectedFailure;
        throw errorWithCode(
          injectedFailure.code || 'record-unavailable',
          injectedFailure.message || `Injected Git blob failure for ${ref.revision}:${ref.path}`,
          injectedFailure.details,
        );
      }
      const object = `${ref.revision}:${ref.path}`;
      try {
        const type = (await git(root, ['cat-file', '-t', object])).stdout.trim();
        if (type !== 'blob') throw errorWithCode('record-unavailable', `Git object is not a blob: ${object}`, { reason: 'not-a-blob' });
      } catch (error) {
        if (error.code === 'record-unavailable') throw error;
        try {
          await git(root, ['cat-file', '-e', `${ref.revision}^{commit}`]);
        } catch {
          throw errorWithCode('record-unavailable', `Git revision is unavailable: ${ref.revision}`, { reason: 'git-object-unavailable' });
        }
        throw errorWithCode('record-unavailable', `Git path is unavailable: ${object}`, { reason: 'path-missing' });
      }
      try {
        const result = await git(root, ['show', object], { encoding: 'buffer' });
        return Buffer.from(result.stdout);
      } catch (error) {
        throw errorWithCode('record-unavailable', `Git blob response is unreadable: ${object}`, { reason: 'invalid-response' });
      }
    },
    async readComment(ref) {
      calls.readComment.push(structuredClone(ref));
      const key = `${ref.repository}#${ref.comment_id}`;
      if (!Object.hasOwn(comments, key)) throw errorWithCode('record-unavailable', `Missing comment ${key}`);
      return structuredClone(comments[key]);
    },
  };

  return {
    root,
    adapter,
    pull,
    comments,
    config,
    activation,
    policyRevision,
    baseRevision,
    headRevision,
    configBytes: config === undefined ? null : await git(root, ['show', `${baseRevision}:${configPath}`], { encoding: 'buffer' }).then(({ stdout }) => Buffer.from(stdout)),
    activationBytes: activation === undefined ? null : await git(root, ['show', `${baseRevision}:${activationPath}`], { encoding: 'buffer' }).then(({ stdout }) => Buffer.from(stdout)),
    async dispose() {
      await rm(root, { recursive: true, force: true });
    },
  };
}

export function comment(id, body) {
  return { id, body, html_url: `https://github.com/${repository}/issues/77#issuecomment-${id}` };
}

export function missingRecord(message = 'record unavailable') {
  return errorWithCode('record-unavailable', message);
}
