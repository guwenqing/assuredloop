import { execFile as execFileCallback } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { makeBootstrapLiveFixture } from '../issue36-bootstrap/live.mjs';
import { wrap } from '../issue36-bootstrap/records.mjs';
import { git } from '../trace-cli/helpers.mjs';

const execFile = promisify(execFileCallback);

export async function specializedOnlyFixture(t, { mixed = false } = {}) {
  const f = await makeBootstrapLiveFixture(t, { ownerOnly: true });
  const config = structuredClone(f.config);
  config.project.review.routing = { primary_tool: 'codex', additional: 'required' };
  await writeFile(path.join(f.root, '.assuredloop/config.json'), JSON.stringify(config));
  await git(f.root, ['add', '.assuredloop/config.json']);
  const tree = (await git(f.root, ['write-tree'])).stdout.trim();
  const base = (await git(f.root, ['commit-tree', tree, '-p', f.currentBase, '-m', 'accepted current routing'])).stdout.trim();
  const head = (await git(f.root, ['commit-tree', tree, '-p', base, '-m', 'current dependent PR'])).stdout.trim();
  await git(f.root, ['update-ref', 'HEAD', head]);
  f.store.records['git/ref/heads/main'].object.sha = base;
  f.store.records['pulls/43'].base.sha = base;
  f.store.records['pulls/43'].head.sha = head;
  f.store.records['issues/42/comments'] = [[]];
  f.store.records['issues/43/comments'] = [[]];
  if (mixed) {
    const tagged = { id: 405, body: wrap({ ...f.verification, review_kind: 'internal', review_tool: 'codex' }) };
    f.store.records['issues/2/comments'] = [[tagged]];
    f.store.records['issues/comments/405'] = tagged;
  }
  await f.save();
  return { ...f, async run() {
    const cli = new URL('../../../src/cli.js', import.meta.url).pathname;
    try {
      const result = await execFile(process.execPath, [cli, 'check', '--target', f.root, '--work', 'example/consumer#43'],
        { env: f.env, maxBuffer: 16 * 1024 * 1024 });
      return { ...result, exit: 0, value: JSON.parse(result.stdout) };
    } catch (error) {
      if (!error.stdout) throw error;
      return { stdout: error.stdout, stderr: error.stderr, exit: error.code, value: JSON.parse(error.stdout) };
    }
  } };
}
