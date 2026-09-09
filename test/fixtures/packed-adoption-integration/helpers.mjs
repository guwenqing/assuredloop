import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const repositoryRoot = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const nodeBin = path.dirname(process.execPath);

function parseJsonOutput(stdout) {
  try { return JSON.parse(stdout.trim()); }
  catch { return null; }
}

export async function makePackedArtifact(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-packed-artifact-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packed = await execFile('npm', [
    'pack', '--json', '--ignore-scripts', '--pack-destination', root,
  ], {
    cwd: repositoryRoot,
    env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false' },
    maxBuffer: 8 * 1024 * 1024,
  });
  const [manifest] = JSON.parse(packed.stdout);
  if (!manifest?.filename || !manifest?.integrity || !manifest?.name || !manifest?.version) {
    throw new Error('npm pack did not return a complete package manifest.');
  }
  const tarball = path.join(root, manifest.filename);
  return { root, tarball, manifest };
}

export async function installPackedCli(t, targetRoot, artifact) {
  const packagePath = path.join(targetRoot, 'package.json');
  try {
    await readFile(packagePath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeFile(packagePath, `${JSON.stringify({
      name: 'packed-consumer-fixture',
      version: '1.0.0',
      private: true,
      type: 'module',
    }, null, 2)}\n`);
  }
  const installed = await execFile('npm', [
    'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', artifact.tarball,
  ], {
    cwd: targetRoot,
    env: {
      ...process.env,
      npm_config_offline: 'true',
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_update_notifier: 'false',
    },
    maxBuffer: 16 * 1024 * 1024,
  });
  const packageRoot = path.join(targetRoot, 'node_modules', artifact.manifest.name);
  const executable = path.join(targetRoot, 'node_modules', '.bin', 'assuredloop');
  const resolvedExecutable = await realpath(executable);
  const expectedExecutable = await realpath(path.join(packageRoot, 'src', 'cli.js'));
  if (resolvedExecutable !== expectedExecutable) {
    throw new Error(`Installed CLI resolved to ${resolvedExecutable}, expected ${expectedExecutable}.`);
  }
  const packageJson = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  const metadata = JSON.parse(await readFile(path.join(packageRoot, 'contracts', 'metadata.json'), 'utf8'));
  const lockfile = JSON.parse(await readFile(path.join(targetRoot, 'package-lock.json'), 'utf8'));
  return {
    integrity: artifact.manifest.integrity,
    executable,
    packageRoot,
    packageJson,
    metadata,
    lockfile,
    resolvedExecutable,
    installStdout: installed.stdout,
    installStderr: installed.stderr,
  };
}

export async function runPackedCli(executable, args, env = {}, options = {}) {
  try {
    const result = await execFile(executable, args, {
      env: { ...process.env, PATH: `${path.dirname(executable)}:${nodeBin}:/usr/bin:/bin`, ...env },
      maxBuffer: options.maxBuffer ?? 32 * 1024 * 1024,
      cwd: options.cwd,
    });
    return { ...result, exitCode: 0, data: parseJsonOutput(result.stdout) };
  } catch (error) {
    return {
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
      exitCode: error.code,
      data: parseJsonOutput(error.stdout ?? ''),
    };
  }
}

export function consumerConfig(packageInfo, {
  repository = 'acme/packed-consumer',
  tools = ['gemini'],
  openspecRoot = 'openspec',
} = {}) {
  return {
    schema_version: 1,
    project: {
      workflow: {
        name: packageInfo.packageJson.name,
        version: packageInfo.packageJson.version,
        integrity: packageInfo.integrity,
        source_ref: packageInfo.metadata.source_ref,
        contracts_path: packageInfo.metadata.contracts_path,
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

export { repositoryRoot };
