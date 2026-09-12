import assert from 'node:assert/strict';
import { execFile as callback } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { linkedConsumerFixture } from '../issue23-consumer/helpers.mjs';
import { git } from '../trace-cli/helpers.mjs';
const exec = promisify(callback);
export const notePath = '.assuredloop/notes/future-work.md';
export const noteBytes = Buffer.from('Tentative idea — not an accepted requirement.\r\nπ e\u0301\r\n[obsolete](missing.md#old-heading)\r\n');
export async function notesFixture(t, { content = noteBytes, selectedPath = notePath, collision = false, missingReview = false, forbidden = false } = {}) {
  const f = await linkedConsumerFixture(t);
  if (collision) await f.changeBaseConfig((config) => { config.repository.openspec_root = '.assuredloop/notes'; });
  const artifacts = collision ? {
    '.assuredloop/notes/config.yaml': 'schema: spec-driven\n',
    '.assuredloop/notes/changes/example/proposal.md': '# Formal native proposal\n',
    '.assuredloop/notes/schemas/example/schema.yaml': 'name: example\nversion: 1\n',
  } : { [selectedPath]: content };
  for (const [name, bytes] of Object.entries(artifacts)) { const destination = path.join(f.root, name); await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, bytes); }
  await git(f.root, ['add', ...Object.keys(artifacts)]); await git(f.root, ['commit', '-q', '-m', 'isolated note context']);
  const head = (await git(f.root, ['rev-parse', 'HEAD'])).stdout.trim();
  f.store.records['pulls/43'].head.sha = head; f.evidence.head = head;
  const refs = Object.keys(artifacts).map((name) => ({ repository: forbidden ? 'forbidden/consumer' : 'example/consumer', revision: head, path: name }));
  f.evidence.evidence.push(...refs);
  f.store.records['pulls/43/files'][0].push(...Object.keys(artifacts).map((filename) => ({ filename, status: 'added' })));
  f.updateEvidence();
  if (missingReview) {
    f.issueRecord.basis.push(...refs);
    f.store.records['issues/42/comments'] = [[]]; f.store.records['issues/43/comments'] = [[]];
  }
  await f.save();
  const isolated = await mkdtemp(path.join(os.tmpdir(), 'issue39-notes-link-'));
  t.after(() => rm(isolated, { recursive: true, force: true }));
  const overrides = { npm_config_prefix: path.join(isolated, 'prefix'), npm_config_cache: path.join(isolated, 'cache'),
    npm_config_userconfig: path.join(isolated, 'user.npmrc'), npm_config_globalconfig: path.join(isolated, 'global.npmrc') };
  await writeFile(overrides.npm_config_userconfig, ''); await writeFile(overrides.npm_config_globalconfig, '');
  const args = ['link', '--ignore-scripts', '--offline', '--no-audit', '--no-fund'];
  const linked = await exec('npm', args, { cwd: f.toolkitRoot, env: { ...process.env, ...overrides } });
  const executable = path.join(overrides.npm_config_prefix, 'bin/assuredloop');
  assert.equal(await realpath(executable), await realpath(path.join(f.toolkitRoot, 'src/cli.js')));
  if (process.env.ISSUE39_NOTES_LINK_LOG) await appendFile(process.env.ISSUE39_NOTES_LINK_LOG,
    JSON.stringify({ command: 'npm', args, cwd: f.toolkitRoot, selected_env: overrides, stdout: linked.stdout, stderr: linked.stderr, exit: 0, executable })+'\n');
  return { ...f, refs, artifacts, async run(operation = 'inspect') {
    const args = [executable, operation, '--target', f.root, '--work', 'example/consumer#43'];
    if (operation === 'inspect') args.push('--max-inline-bytes', '65536', ...refs.flatMap((ref) => ['--expand', JSON.stringify(ref)]));
    try { const raw = await exec(process.execPath, args, { env: f.env, maxBuffer: 16 * 1024 * 1024 }); return { ...raw, exit: 0, value: JSON.parse(raw.stdout) }; }
    catch (error) { if (!error.stdout) throw error; return { stdout: error.stdout, stderr: error.stderr, exit: error.code, value: JSON.parse(error.stdout) }; }
  } };
}
