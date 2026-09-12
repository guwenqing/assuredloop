import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { routingFixture } from './helpers.mjs';
import { git } from '../trace-cli/helpers.mjs';
import { wrap } from '../issue23-consumer/helpers.mjs';

export const priorSource = { repository: 'example/consumer', comment_id: 301 };
export const dispositionSource = { repository: 'example/consumer', comment_id: 302 };
export const dispositionText = 'Author disposition for prior finding R1: corrected the missing exact-candidate guard; retained the original REVISE for independent reassessment.';
const execFile = promisify(execFileCallback);

export async function lifecycleCliFixture(t, options = {}) {
  const f = await routingFixture(t, options);
  const npmRoot = await mkdtemp(path.join(os.tmpdir(), 'issue37-lifecycle-npm-'));
  t.after(() => rm(npmRoot, { recursive: true, force: true }));
  const prefix = path.join(npmRoot, 'prefix');
  const userconfig = path.join(npmRoot, 'user.npmrc'), globalconfig = path.join(npmRoot, 'global.npmrc');
  await writeFile(userconfig, ''); await writeFile(globalconfig, '');
  const npmEnv = { ...process.env, npm_config_prefix: prefix, npm_config_cache: path.join(npmRoot, 'cache'),
    npm_config_userconfig: userconfig, npm_config_globalconfig: globalconfig };
  await execFile('npm', ['link', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: f.toolkitRoot, env: npmEnv });
  const executable = path.join(prefix, 'bin', 'assuredloop');
  const old = { ...structuredClone(f.primary), result: 'revise',
    reviewer_session: 'prior-independent-reviewer', scope: 'Prior finding R1: exact candidate guard is missing; correction and renewed independent review required.' };
  await git(f.root, ['commit', '--allow-empty', '-q', '-m', 'correct R1 and renew current review']);
  const head = (await git(f.root, ['rev-parse', 'HEAD'])).stdout.trim();
  f.store.records['pulls/43'].head.sha = head;
  for (const record of f.reviews) {
    record.head = head;
    record.scope = 'Independent current reassessment addresses prior R1 and the linked author disposition; exact candidate reviewed full-scope.';
    record.evidence.push(priorSource, dispositionSource);
  }
  f.primary.reviewer_session = 'current-primary-reviewer';
  async function save() {
    await f.save();
    const prior = { id: priorSource.comment_id, body: wrap(old) };
    const disposition = { id: dispositionSource.comment_id, body: dispositionText };
    for (const key of ['issues/42/comments', 'issues/43/comments']) {
      // Preserve the old verdict even when it is encountered after fresh PASS.
      f.store.records[key][0].push(prior, disposition);
    }
    f.store.records[`issues/comments/${prior.id}`] = prior;
    f.store.records[`issues/comments/${disposition.id}`] = disposition;
    await writeFile(f.env.FAKE_GH_SCENARIO, JSON.stringify(f.store));
  }
  await save();
  return { ...f, old, head, save, async run(operation = 'check') {
    const args = [executable, operation, '--target', f.root, '--work', 'example/consumer#43'];
    if (operation === 'inspect') args.push('--max-inline-bytes', '65536');
    try {
      const result = await execFile(process.execPath, args, { env: f.env, maxBuffer: 16 * 1024 * 1024 });
      return { ...result, exit: 0, value: JSON.parse(result.stdout) };
    } catch (error) {
      if (!error.stdout) throw error;
      return { stdout: error.stdout, stderr: error.stderr, exit: error.code, value: JSON.parse(error.stdout) };
    }
  } };
}

export function applicability(result, source) {
  const entry = result.value.review_evidence?.find((item) => item.source?.repository === source.repository && item.source?.comment_id === source.comment_id);
  if (!entry) throw new Error(`Missing review applicability context for comment ${source.comment_id}: ${JSON.stringify(result.value.findings)}`);
  return entry;
}
