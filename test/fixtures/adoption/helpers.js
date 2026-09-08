import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

export const execFile = promisify(execFileCallback);

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'adoption-test',
  GIT_AUTHOR_EMAIL: 'adoption-test@example.invalid',
  GIT_COMMITTER_NAME: 'adoption-test',
  GIT_COMMITTER_EMAIL: 'adoption-test@example.invalid',
};

export async function git(cwd, args) {
  return execFile('git', args, { cwd, env: GIT_ENV });
}

export async function makeGitFixture({ prefix = 'assuredloop-adoption-', files = {}, remote } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  for (const [relativePath, content] of Object.entries(files)) {
    const destination = path.join(root, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
  await git(root, ['init', '-q', '-b', 'main']);
  await git(root, ['add', '.']);
  await git(root, ['commit', '-q', '-m', 'fixture']);
  if (remote) await git(root, ['remote', 'add', 'origin', remote]);
  const { stdout } = await git(root, ['rev-parse', 'HEAD']);
  return { root, revision: stdout.trim() };
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function packageIntegrity() {
  return `sha512-${createHash('sha512').update('adoption-test-package').digest('base64')}`;
}

export async function makePackageFixture({
  sourceRef,
  name = 'assuredloop-base',
  version = '0.1.0',
  contractFiles = { 'project-workflow/spec.md': '# Project workflow contract\n' },
  skillText = '# AssuredLoop adoption\n',
} = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-package-'));
  const contractsRoot = path.join(root, 'contracts');
  for (const [relativePath, content] of Object.entries(contractFiles)) {
    const destination = path.join(contractsRoot, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
  const metadata = {
    schema_version: 1,
    name,
    version,
    basis: 'canonical',
    source_ref: sourceRef,
    contracts_path: 'contracts',
    files: Object.entries(contractFiles).map(([relativePath, content]) => ({
      path: relativePath,
      sha256: sha256(content),
    })),
  };
  await writeFile(path.join(contractsRoot, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  const skillRoot = path.join(root, 'skills', 'assuredloop-adopt');
  await mkdir(skillRoot, { recursive: true });
  await writeFile(path.join(skillRoot, 'SKILL.md'), skillText);
  await writeFile(path.join(root, 'package.json'), `${JSON.stringify({
    name,
    version,
    type: 'module',
  }, null, 2)}\n`);
  return { root, metadata };
}

export function makeConfig(metadata, {
  repository = 'example/adoption-consumer',
  tools = ['gemini'],
  openspecRoot = 'openspec',
} = {}) {
  return {
    schema_version: 1,
    project: {
      workflow: {
        name: metadata.name,
        version: metadata.version,
        integrity: packageIntegrity(),
        source_ref: metadata.source_ref,
        contracts_path: metadata.contracts_path,
      },
      review: {
        depth: 'full-scope',
        internal: { allowed_models: ['gpt-6-astra'] },
        excluded_models: ['gpt-5.6-luna'],
      },
    },
    repository: {
      name: repository,
      openspec_root: openspecRoot,
      tools,
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

export async function writeJson(destination, value) {
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readJson(destination) {
  return JSON.parse(await readFile(destination, 'utf8'));
}
