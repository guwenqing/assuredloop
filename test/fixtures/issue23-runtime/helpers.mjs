import { chmod, cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { execFile as execCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { makeGitFixture, makeConfig, git } from '../adoption/helpers.js';

const exec = promisify(execCallback);
const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(import.meta.url);
const dependencyRoot = path.dirname(path.dirname(require.resolve('ajv/package.json')));

export async function makeRuntimeFixture(t, { layout = 'local-linked', scoped = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'issue23-runtime-'));
  const target = await makeGitFixture({ prefix: 'issue23-runtime-consumer-', remote: 'https://github.com/example/adoption-consumer.git', files: {
    'README.md': '# Keep consumer content\n', 'openspec/config.yaml': 'schema: spec-driven\n',
  } });
  target.root = await realpath(target.root);
  t.after(async () => { await rm(root, { recursive: true, force: true }); await rm(target.root, { recursive: true, force: true }); });
  const packageName = scoped ? '@independent/runtime' : 'assuredloop-base';
  const global = layout.startsWith('global');
  const linked = layout.endsWith('linked');
  const moduleParent = global ? path.join(root, 'prefix/lib/node_modules') : path.join(target.root, 'node_modules');
  const selectedPackage = path.join(moduleParent, packageName);
  const toolkit = linked || layout === 'direct' ? path.join(root, 'toolkit') : selectedPackage;
  await mkdir(toolkit, { recursive: true });
  for (const dir of ['src', 'schemas', 'contracts', 'skills']) await cp(path.join(repositoryRoot, dir), path.join(toolkit, dir), { recursive: true });
  const pkg = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
  pkg.name = packageName;
  await writeFile(path.join(toolkit, 'package.json'), JSON.stringify(pkg));
  await symlink(dependencyRoot, path.join(toolkit, 'node_modules'), 'dir');
  const metadata = JSON.parse(await readFile(path.join(toolkit, 'contracts/metadata.json'), 'utf8'));
  metadata.name = packageName;
  await writeFile(path.join(toolkit, 'contracts/metadata.json'), JSON.stringify(metadata));
  const config = makeConfig(metadata);
  const configPath = path.join(root, 'consumer-config.json');
  await writeFile(configPath, JSON.stringify(config));
  await chmod(path.join(toolkit, 'src/cli.js'), 0o755);
  let invocation = path.join(toolkit, 'src/cli.js');
  if (layout !== 'direct') {
    if (linked) { await mkdir(path.dirname(selectedPackage), { recursive: true }); await symlink(toolkit, selectedPackage, 'dir'); }
    const bin = global ? path.join(root, 'prefix/bin') : path.join(target.root, 'node_modules/.bin');
    await mkdir(bin, { recursive: true });
    invocation = path.join(bin, 'assuredloop');
    await symlink(path.relative(bin, path.join(selectedPackage, 'src/cli.js')), invocation);
  }
  const fixture = { root, target, toolkit, metadata, config, configPath, invocation, selectedPackage, layout, linked, env: { ...process.env },
    statusBefore: (await git(target.root, ['status', '--porcelain'])).stdout };
  fixture.saveConfig = () => writeFile(configPath, JSON.stringify(config));
  return fixture;
}

export async function runInit(f, { apply = false, instrument = false } = {}) {
  const args = ['init', '--target', f.target.root, '--config', f.configPath, '--local-only', ...(apply ? ['--apply'] : [])];
  let raw;
  try {
    const command = instrument ? process.execPath : f.invocation;
    const commandArgs = instrument ? ['--import', fileURLToPath(new URL('./read-boundary.mjs', import.meta.url)), f.invocation, ...args] : args;
    raw = { ...await exec(command, commandArgs, { env: { ...f.env, ISSUE23_CONTRACT_ROOT: path.join(f.toolkit, 'contracts'), ISSUE23_AUDIT_LOG: path.join(f.root, 'reads.jsonl') }, timeout: 15000, maxBuffer: 4 * 1024 * 1024 }), exit: 0 };
  } catch (error) { raw = { stdout: error.stdout ?? '', stderr: error.stderr ?? '', exit: error.code }; }
  return { ...raw, value: raw.stdout.trim() ? JSON.parse(raw.stdout) : null };
}

export async function auditReads(f) {
  try { return (await readFile(path.join(f.root, 'reads.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

export { git };

export async function auditCommands(f) {
  try { return (await readFile(path.join(f.root, 'commands.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
