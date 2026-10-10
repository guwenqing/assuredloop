// Throwaway git repos for the v4 tests, and a runner for `node bin/al-v4.js`.
// Deterministic: fixed identities and dates, no user or system git config.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

export const AL4 = fileURLToPath(new URL('../../../bin/al-v4.js', import.meta.url));

const DATE = '2026-01-01T00:00:00Z';

function cleanEnv(extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith('GIT_') && k !== 'SOURCE_DATE_EPOCH') env[k] = v;
  }
  return { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', ...extra };
}

const gitEnv = () => cleanEnv({
  GIT_AUTHOR_NAME: 'Fixture Author',
  GIT_AUTHOR_EMAIL: 'author@example.invalid',
  GIT_AUTHOR_DATE: DATE,
  GIT_COMMITTER_NAME: 'Fixture Committer',
  GIT_COMMITTER_EMAIL: 'committer@example.invalid',
  GIT_COMMITTER_DATE: DATE,
});

export function git(cwd, args, { branch = 'main' } = {}) {
  const r = spawnSync('git', ['-c', `init.defaultBranch=${branch}`, '-c', 'commit.gpgsign=false', ...args],
    { cwd, env: gitEnv(), encoding: 'utf8', timeout: 30000 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}:\n${r.stderr}`);
  return r.stdout.trim();
}

export const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

// A new git repo in a temp dir, removed when the test ends. `branch` names
// the first branch. With `commit: false` the repo has no commit yet.
export function makeRepo(t, { branch = 'main', commit = true } = {}) {
  const top = mkdtempSync(join(realpathSync(tmpdir()), 'al4-test-'));
  t.after(() => rmSync(top, { recursive: true, force: true }));
  const dir = join(top, 'repo');
  mkdirSync(dir);
  git(dir, ['init', '-q'], { branch });
  const repo = {
    dir,
    git: (args) => git(dir, args, { branch }),
    write(rel, content) {
      const p = join(dir, rel);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, content);
      return p;
    },
    read: (rel) => readFileSync(join(dir, rel), 'utf8'),
    exists: (rel) => existsSync(join(dir, rel)),
    remove: (rel) => rmSync(join(dir, rel), { force: true }),
    commit(message) {
      git(dir, ['add', '-A']);
      git(dir, ['commit', '-q', '--allow-empty', '-m', message]);
      return git(dir, ['rev-parse', 'HEAD']);
    },
    head: () => git(dir, ['rev-parse', 'HEAD']),
  };
  if (commit) {
    repo.write('README.md', 'fixture\n');
    repo.commit('initial');
  }
  return repo;
}

// Run `node bin/al-v4.js ...args` in `cwd`, killed after `timeout` ms.
export function runV4(cwd, args, { timeout = 60000 } = {}) {
  const r = spawnSync(process.execPath, [AL4, ...args],
    { cwd, input: '', env: cleanEnv(), encoding: 'utf8', timeout });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', signal: r.signal };
}

export function lines(stdout) {
  return stdout.replace(/\n+$/, '').split('\n');
}

// v1's frame: a "Read" line, then the last two lines start with "Next" and
// "Not known" (label padded to 10 columns, no colon).
export function assertFrame(stdout) {
  const ls = lines(stdout);
  assert.ok(ls.some((l) => /^Read {6}\S/.test(l)), `a Read line is expected:\n${stdout}`);
  assert.ok(ls.length >= 3, `output too short:\n${stdout}`);
  assert.match(ls.at(-2), /^Next {6}\S/, `second last line should be Next:\n${stdout}`);
  assert.match(ls.at(-1), /^Not known \S/, `last line should be Not known:\n${stdout}`);
}

export const show = (r) => `exit ${r.code}${r.signal ? ` (${r.signal})` : ''}\n--- stdout\n${r.stdout}--- stderr\n${r.stderr}`;
