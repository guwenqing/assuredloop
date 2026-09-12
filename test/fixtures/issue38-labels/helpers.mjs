import { chmod, copyFile, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { planInitialization, applyInitialization } from '../../../src/adoption.js';
import { execFile, git, makeConfig, makeGitFixture, makePackageFixture, sha256 } from '../adoption/helpers.js';

export { git, sha256 };
export const repository = 'example/label-consumer';
export const names = ['Request: intake', 'Epic Ω', 'Plan / design', 'Task "quote" $(printf INJECTED)', "Bug: user's café", 'Spike: investigate'];
const sourceRoot = new URL('../../../', import.meta.url).pathname;

export async function labelsFixture(t, { cli = false } = {}) {
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'issue38-labels-'));
  const pkg = await makePackageFixture({ sourceRef: { repository: 'framework/source', revision: 'a'.repeat(40), path: 'openspec/specs' } });
  const target = await makeGitFixture({ prefix: 'issue38-consumer-', remote: `https://github.com/${repository}.git`,
    files: { 'README.md': '# Consumer stays unchanged\n', 'openspec/config.yaml': 'schema: spec-driven\n' } });
  t.after(async () => { for (const root of [scratch, pkg.root, target.root]) await rm(root, { recursive: true, force: true }); });
  const config = makeConfig(pkg.metadata, { repository, tools: ['codex'] });
  for (const [index, key] of Object.keys(config.repository.labels.type).entries()) config.repository.labels.type[key] = names[index];
  const initialLabels = [0, 1, 2, 5].map((index) => ({ id: index + 1, name: index === 0 ? names[index].toUpperCase() : names[index],
    color: '0123ab', description: `Owner metadata ${index}`, node_id: `unchanged-${index}` }));
  initialLabels.push({ id: 99, name: 'unrelated: retain', color: 'ff00ff', description: 'Outside this workflow' });
  const statePath = path.join(scratch, 'github-state.json'), logPath = path.join(scratch, 'github-calls.jsonl');
  await writeFile(statePath, JSON.stringify({ repository, labels: initialLabels, canWrite: true, successfulCreates: 0, inventoryReads: 0 }));
  await writeFile(logPath, '');
  const bin = path.join(scratch, 'bin'); await mkdir(bin);
  await copyFile(new URL('./fake-gh.mjs', import.meta.url), path.join(bin, 'gh')); await chmod(path.join(bin, 'gh'), 0o755);
  const env = { ...process.env, PATH: `${bin}:${path.dirname(process.execPath)}:/usr/bin:/bin`, ISSUE38_GH_STATE: statePath, ISSUE38_GH_LOG: logPath };
  if (!cli) {
    const saved = Object.fromEntries(['PATH', 'ISSUE38_GH_STATE', 'ISSUE38_GH_LOG'].map((key) => [key, process.env[key]]));
    for (const key of Object.keys(saved)) process.env[key] = env[key];
    t.after(() => { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  }
  const configPath = path.join(scratch, 'input.json'); await writeFile(configPath, JSON.stringify(config));
  let executable;
  if (cli) {
    for (const folder of ['src', 'schemas']) await cp(path.join(sourceRoot, folder), path.join(pkg.root, folder), { recursive: true });
    await copyFile(path.join(sourceRoot, 'package.json'), path.join(pkg.root, 'package.json'));
    await symlink(path.join(sourceRoot, 'node_modules'), path.join(pkg.root, 'node_modules'), 'dir');
    const userconfig = path.join(scratch, 'user.npmrc'), globalconfig = path.join(scratch, 'global.npmrc');
    await writeFile(userconfig, ''); await writeFile(globalconfig, '');
    const prefix = path.join(scratch, 'prefix');
    await execFile('npm', ['link', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: pkg.root,
      env: { ...process.env, npm_config_prefix: prefix, npm_config_cache: path.join(scratch, 'npm-cache'),
        npm_config_userconfig: userconfig, npm_config_globalconfig: globalconfig } });
    executable = path.join(prefix, 'bin', 'assuredloop');
  }
  return { root: target.root, packageRoot: pkg.root, config, configPath, initialLabels, env,
    async state() { return JSON.parse(await readFile(statePath, 'utf8')); },
    async change(mutate) { const value = JSON.parse(await readFile(statePath, 'utf8')); mutate(value); await writeFile(statePath, JSON.stringify(value)); },
    async log() { return (await readFile(logPath, 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)); },
    plan(options = {}) { return planInitialization({ targetRoot: target.root, packageRoot: pkg.root, config,
      runtime: { mode: 'linked-development' }, provisionLabels: true, ...options }); },
    apply(plan) { return applyInitialization(plan); },
    async run(flags = []) {
      try {
        const result = await execFile(process.execPath, [executable, 'init', '--target', target.root, '--config', configPath, ...flags], { env });
        return { ...result, exit: 0, value: JSON.parse(result.stdout) };
      } catch (error) {
        if (!error.stdout) throw error;
        return { stdout: error.stdout, stderr: error.stderr, exit: error.code, value: JSON.parse(error.stdout) };
      }
    },
  };
}

export const mutations = (events) => events.filter((entry) => entry.method && entry.method !== 'GET');
export function provisioning(plan) {
  if (!plan.label_provisioning) throw new Error(`Initialization omitted requested label operations: ${JSON.stringify(plan.diagnostics)}`);
  return plan.label_provisioning;
}
