// Throwaway git repos for end-to-end tests, and a runner for the CLI.
// Deterministic: fixed identities and dates, no user or system git config.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, realpathSync, utimesSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const AL = fileURLToPath(new URL('../../bin/al.js', import.meta.url));

export const DEFAULT_DATE = '2026-01-01T00:00:00Z';

// The environment without anything that points git at another repo or config.
function cleanEnv(extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith('GIT_') && k !== 'SOURCE_DATE_EPOCH') env[k] = v;
  }
  return { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', ...extra };
}

function gitEnv(date = DEFAULT_DATE) {
  return cleanEnv({
    GIT_AUTHOR_NAME: 'Fixture Author',
    GIT_AUTHOR_EMAIL: 'author@example.invalid',
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: 'Fixture Committer',
    GIT_COMMITTER_EMAIL: 'committer@example.invalid',
    GIT_COMMITTER_DATE: date,
  });
}

export function git(cwd, args, { date } = {}) {
  const r = spawnSync('git', ['-c', 'init.defaultBranch=main', '-c', 'commit.gpgsign=false', ...args],
    { cwd, env: gitEnv(date), encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}:\n${r.stderr}`);
  return r.stdout.trim();
}

// A temp dir removed when the test ends. `t` is the node:test context.
export function tempDir(t) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'al-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function wrap(dir) {
  return {
    dir,
    git: (args, opts) => git(dir, args, opts),
    write(rel, content) {
      const p = join(dir, rel);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, content);
      return p;
    },
    read: (rel) => readFileSync(join(dir, rel)),
    // Stage everything and commit; returns the commit id.
    commit(message, { date } = {}) {
      git(dir, ['add', '-A']);
      git(dir, ['commit', '-q', '--allow-empty', '-m', message], { date });
      return git(dir, ['rev-parse', 'HEAD']);
    },
    head: () => git(dir, ['rev-parse', 'HEAD']),
  };
}

// A new repo on branch main with one initial commit. It is built once per
// process for each `date` and copied into each test's own dir.
const built = new Map();
export function makeRepo(t, { date } = {}) {
  if (!built.has(date)) {
    const dir = join(mkdtempSync(join(realpathSync(tmpdir()), 'al-fixture-')), 'repo');
    process.on('exit', () => rmSync(dirname(dir), { recursive: true, force: true }));
    mkdirSync(dir);
    git(dir, ['init', '-q']);
    const repo = wrap(dir);
    repo.write('README.md', 'fixture\n');
    repo.commit('initial', { date });
    built.set(date, dir);
  }
  const dir = join(tempDir(t), 'repo');
  cpSync(built.get(date), dir, { recursive: true });
  return wrap(dir);
}

// A bare repo holding `repo`'s main, set as `repo`'s origin, then fetched at
// `fetchedAt`: every reflog entry of origin/main and the mtime of FETCH_HEAD
// carry that time.
export function addOrigin(t, repo, { fetchedAt = DEFAULT_DATE } = {}) {
  const bare = join(tempDir(t), 'origin.git');
  git(dirname(bare), ['init', '-q', '--bare', bare]);
  repo.git(['remote', 'add', 'origin', bare]);
  repo.git(['push', '-q', 'origin', 'main'], { date: fetchedAt });
  repo.git(['fetch', '-q', 'origin'], { date: fetchedAt });
  const when = new Date(fetchedAt);
  utimesSync(join(repo.dir, '.git', 'FETCH_HEAD'), when, when);
  return bare;
}

// A clone of `repo` over file://; `depth` makes it shallow, `singleBranch`
// true or false passes --single-branch or --no-single-branch, and `branch`
// checks out that branch instead of the source's HEAD.
export function cloneRepo(t, repo, { depth, singleBranch, branch, date } = {}) {
  const dir = join(tempDir(t), 'clone');
  const args = ['clone', '-q'];
  if (depth) args.push('--depth', String(depth));
  if (singleBranch !== undefined) args.push(singleBranch ? '--single-branch' : '--no-single-branch');
  if (branch) args.push('--branch', branch);
  git(dirname(dir), [...args, `file://${repo.dir}`, dir], { date });
  return wrap(dir);
}

// Run `node bin/al.js ...args` in `cwd`. `input` is fed to stdin. With
// `timeout` (ms) the process is killed after that long: `signal` says so.
export function runAl(cwd, args, { input, env, timeout } = {}) {
  const r = spawnSync(process.execPath, [AL, ...args],
    { cwd, input: input ?? '', env: cleanEnv(env), encoding: 'utf8', timeout });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, signal: r.signal };
}

export const sha256 = (text) => createHash('sha256').update(text).digest('hex');
