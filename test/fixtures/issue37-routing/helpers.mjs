import { execFile as execFileCallback } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { linkedConsumerFixture, wrap } from '../issue23-consumer/helpers.mjs';
import { git } from '../trace-cli/helpers.mjs';

const execFile = promisify(execFileCallback);
export const primaryModel = 'owner-selected-primary-model';

export async function routingFixture(t, { additional = 'on-request', externalTool = null, legacy = false, historical = false } = {}) {
  const f = await linkedConsumerFixture(t, { historical });
  if (!legacy) {
    await f.changeBaseConfig((config) => {
      config.project.review.routing = { primary_tool: 'codex', additional };
      config.project.review.internal.allowed_models = [primaryModel];
    });
    await git(f.root, ['commit', '--allow-empty', '-q', '-m', 'current candidate after accepted routing']);
    const head = (await git(f.root, ['rev-parse', 'HEAD'])).stdout.trim();
    f.store.records['pulls/43'].head.sha = head;
    f.evidence.head = head;
    f.evidence.reviewer_model = primaryModel;
    f.evidence.review_kind = 'internal'; f.evidence.review_tool = 'codex';
  }
  const primary = structuredClone(f.evidence);
  const external = externalTool ? { ...structuredClone(primary), review_kind: 'external', review_tool: externalTool,
    reviewer_session: 'independent-additional-reviewer' } : null;
  const reviews = [primary, ...(external ? [external] : [])];
  async function save() {
    const comments = reviews.map((record, index) => ({ id: 101 + index, body: wrap(record) }));
    f.store.records['issues/42/comments'] = [comments];
    f.store.records['issues/43/comments'] = [comments];
    for (const comment of comments) f.store.records[`issues/comments/${comment.id}`] = comment;
    await f.save();
  }
  await save();
  return { ...f, primary, external, reviews, save,
    async candidateRouting(routing) {
      const candidate = JSON.parse(await readFile(path.join(f.root, '.assuredloop/config.json'), 'utf8'));
      candidate.project.review.routing = routing;
      await writeFile(path.join(f.root, '.assuredloop/config.json'), JSON.stringify(candidate));
      await git(f.root, ['add', '.assuredloop/config.json']);
      await git(f.root, ['commit', '-q', '-m', 'unaccepted candidate routing']);
      const head = (await git(f.root, ['rev-parse', 'HEAD'])).stdout.trim();
      f.store.records['pulls/43'].head.sha = head;
      for (const record of reviews) record.head = head;
      await save();
    },
    async upgradeOnlyCurrentPolicy() {
      const config = structuredClone(f.config);
      config.project.review.routing = { primary_tool: 'codex', additional: 'required' };
      await writeFile(path.join(f.root, '.assuredloop/config.json'), JSON.stringify(config));
      await git(f.root, ['add', '.assuredloop/config.json']);
      const tree = (await git(f.root, ['write-tree'])).stdout.trim();
      const current = f.store.records['git/ref/heads/main'].object.sha;
      const revision = (await git(f.root, ['commit-tree', tree, '-p', current, '-m', 'later current routing policy'])).stdout.trim();
      f.store.records['git/ref/heads/main'].object.sha = revision;
      f.store.records['pulls/43'].base.sha = revision;
      await save();
    },
    async runWithRegistryFault(operation = 'check') {
      const hook = new URL('./registry-unavailable-hook.mjs', import.meta.url).pathname;
      try {
        const result = await execFile(process.execPath, ['--import', hook, f.executable, operation,
          '--target', f.root, '--work', 'example/consumer#43'], { env: f.env, maxBuffer: 16 * 1024 * 1024 });
        return { ...result, exit: 0, value: JSON.parse(result.stdout) };
      } catch (error) {
        if (!error.stdout) throw error;
        return { stdout: error.stdout, stderr: error.stderr, exit: error.code, value: JSON.parse(error.stdout) };
      }
    },
  };
}

export function route(result) {
  const found = result.value.review_routing?.find((item) => item.pr === 'example/consumer#43');
  if (!found) throw new Error(`Missing acquired PR routing context: ${JSON.stringify(result.value.findings)}`);
  return found;
}
