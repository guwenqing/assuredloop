import { execFile as execFileCallback } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { makeTraceFixture, git, sha256 } from '../trace-cli/helpers.mjs';

const execFile = promisify(execFileCallback);
const sourceRoot = new URL('../../../', import.meta.url).pathname;
export const fixedMarker = 'The fixture policy.';
export const mutableMarker = 'MUTABLE TOOLKIT BYTES ARE NOT FIXED CONSUMER AUTHORITY';
export const wrap = (record) => `## Workflow context\n\n\`\`\`json\n${JSON.stringify(record, null, 2)}\n\`\`\`\n`;

export async function linkedConsumerFixture(t, { toolkit = 'missing-contracts', linked = true, historical = false } = {}) {
  const f = await makeTraceFixture(t);
  const toolkitRoot = await mkdtemp(path.join(os.tmpdir(), 'issue23-consumer-toolkit-'));
  t.after(() => rm(toolkitRoot, { recursive: true, force: true }));
  for (const folder of ['src', 'schemas']) await cp(path.join(sourceRoot, folder), path.join(toolkitRoot, folder), { recursive: true });
  const pkg = JSON.parse(await readFile(path.join(sourceRoot, 'package.json'), 'utf8'));
  if (toolkit !== 'regular') pkg.version = '99.0.0';
  await writeFile(path.join(toolkitRoot, 'package.json'), JSON.stringify(pkg));
  await symlink(path.join(sourceRoot, 'node_modules'), path.join(toolkitRoot, 'node_modules'), 'dir');
  if (toolkit !== 'missing-contracts') await cp(path.join(sourceRoot, 'contracts'), path.join(toolkitRoot, 'contracts'), { recursive: true });
  const store = JSON.parse(await readFile(f.env.FAKE_GH_SCENARIO, 'utf8'));
  const records = store.records;
  records['issues/42/timeline'] = [[records['issues/42/timeline'][0][0]]];
  records['issues/1/timeline'] = [[]];
  const evidence = structuredClone(f.evidence);
  const issueRecord = structuredClone(f.issue);
  const config = structuredClone(f.config);
  let base = f.revision;
  await writeFile(path.join(f.root, 'candidate.txt'), 'consumer candidate\n');
  await git(f.root, ['add', 'candidate.txt']);
  await git(f.root, ['commit', '-q', '-m', 'synthetic linked consumer candidate']);
  const head = (await git(f.root, ['rev-parse', 'HEAD'])).stdout.trim();
  records['pulls/43'].head.sha = head;
  evidence.head = head;
  records['pulls/43/files'] = [[{ filename: 'candidate.txt', status: 'added' }]];
  if (historical) {
    const tree = (await git(f.root, ['rev-parse', `${head}^{tree}`])).stdout.trim();
    const merge = (await git(f.root, ['commit-tree', tree, '-p', base, '-m', 'actual synthetic squash'])).stdout.trim();
    const advanced = (await git(f.root, ['commit-tree', tree, '-p', merge, '-m', 'later destination'])).stdout.trim();
    Object.assign(records['pulls/43'], { state: 'closed', merged: true,
      merged_at: '2026-09-12T18:00:00Z', merge_commit_sha: merge });
    records['pulls/43'].base.sha = advanced;
    records['issues/43'].state = 'closed';
    records['git/ref/heads/main'].object.sha = advanced;
  }
  if (toolkit === 'mutable-shadow') {
    const metadata = JSON.parse(await readFile(path.join(toolkitRoot, 'contracts/metadata.json'), 'utf8'));
    const bytes = `# Trace CLI\n\n## 5. Small local tools and explicit trust boundaries\n\n${mutableMarker}\n`;
    metadata.source_ref = { repository: 'example/consumer', revision: f.initialRevision, path: 'openspec/changes/trace-cli' };
    metadata.files = [{ path: 'design.md', sha256: sha256(bytes) }];
    await writeFile(path.join(toolkitRoot, 'contracts/design.md'), bytes);
    await writeFile(path.join(toolkitRoot, 'contracts/metadata.json'), JSON.stringify(metadata));
  }
  const modules = path.join(f.root, 'node_modules');
  await mkdir(path.join(modules, '.bin'), { recursive: true });
  const selected = path.join(modules, pkg.name);
  if (linked) await symlink(toolkitRoot, selected, 'dir');
  else await cp(toolkitRoot, selected, { recursive: true, dereference: false, verbatimSymlinks: true });
  const executable = path.join(modules, '.bin', 'assuredloop');
  await symlink(`../${pkg.name}/src/cli.js`, executable);
  function updateEvidence() {
    const comment = { id: 101, body: wrap(evidence) };
    records['issues/comments/101'] = comment;
    records['issues/42/comments'] = [[comment]];
    records['issues/43/comments'] = [[comment]];
  }
  updateEvidence();
  async function save() {
    records['issues/42'].body = wrap(issueRecord);
    await writeFile(f.env.FAKE_GH_SCENARIO, JSON.stringify(store));
  }
  await save();
  return { ...f, toolkitRoot, executable, store, config, evidence, issueRecord, head, updateEvidence, save,
    async changeBaseConfig(mutate) {
      mutate(config);
      const bytes = `${JSON.stringify(config, null, 2)}\n`;
      await writeFile(path.join(f.root, '.assuredloop/config.json'), bytes);
      await git(f.root, ['add', '.assuredloop/config.json']);
      await git(f.root, ['commit', '-q', '-m', 'synthetic destination configuration']);
      base = (await git(f.root, ['rev-parse', 'HEAD'])).stdout.trim();
      records['pulls/43'].base.sha = base;
      records['git/ref/heads/main'].object.sha = base;
      evidence.base_sha = base; evidence.config_digest = sha256(bytes);
      evidence.policy_ref = structuredClone(config.project.bootstrap.policy_ref);
      updateEvidence(); await save();
    },
    async run(operation = 'check', work = 'example/consumer#43', direct = false) {
      const entry = direct ? path.join(toolkitRoot, 'src/cli.js') : executable;
      const args = [entry, operation, '--target', f.root, '--work', work];
      if (operation === 'inspect') args.push('--max-inline-bytes', '65536');
      try {
        const result = await execFile(process.execPath, args, { env: f.env, maxBuffer: 16 * 1024 * 1024 });
        return { ...result, exit: 0, value: JSON.parse(result.stdout) };
      } catch (error) {
        if (!error.stdout) throw error;
        return { stdout: error.stdout, stderr: error.stderr, exit: error.code, value: JSON.parse(error.stdout) };
      }
    },
  };
}
