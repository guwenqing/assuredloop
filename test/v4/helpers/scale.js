// Helpers for the tests of the T15 scale run (#188): scale/generate.js and
// scale/run.js. They use only the two scripts, the files they write, git, and
// the public `node bin/al.js` command. Nothing runs at import.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export const REPO = fileURLToPath(new URL('../../../', import.meta.url));
export const GENERATE = join(REPO, 'scale/generate.js');
export const RUN = join(REPO, 'scale/run.js');
export const AL4 = join(REPO, 'bin/al.js');
export const FULL = /^[0-9a-f]{40}$/;

// The environment of every run: nothing that points git at another repo or
// at the user's config, and no fixed clock.
export function cleanEnv(extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith('GIT_') && k !== 'SOURCE_DATE_EPOCH' && k !== 'NODE_OPTIONS') env[k] = v;
  }
  return { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', ...extra };
}

// A temp dir, removed when `after` runs. Returns its real path.
export function tempDir(prefix = 'al4-scale-') {
  return mkdtempSync(join(realpathSync(tmpdir()), prefix));
}
export const removeDir = (dir) => { if (dir) rmSync(dir, { recursive: true, force: true }); };

function runNode(script, args, { cwd = REPO, timeout = 240_000 } = {}) {
  const r = spawnSync(process.execPath, [script, ...args], {
    cwd, env: cleanEnv(), encoding: 'utf8', timeout, maxBuffer: 1 << 28, input: '',
  });
  return { code: r.status, signal: r.signal, stdout: r.stdout ?? '', stderr: r.stderr ?? '', args, script };
}

export const generate = (args, opts) => runNode(GENERATE, args, opts);
export const runHarness = (args, opts) => runNode(RUN, args, opts);
export const al = (cwd, args, { timeout = 120_000 } = {}) => runNode(AL4, args, { cwd, timeout });

export const show = (r) =>
  `node ${r.script} ${r.args.join(' ')} -> exit ${r.code} (signal ${r.signal})\n--- stdout\n${r.stdout.slice(0, 6000)}--- stderr\n${r.stderr.slice(0, 6000)}`;

// Generate a world at <top>/world and check that it worked. `opts` maps
// option names to values, for example { requests: 6, outputs: 2 }.
export function makeWorld(top, opts, { name = 'world' } = {}) {
  const dir = join(top, name);
  const args = ['--out', dir, ...Object.entries(opts).flatMap(([k, v]) => [`--${k}`, String(v)])];
  const r = generate(args);
  assert.equal(r.code, 0, show(r));
  return { dir, result: r, world: JSON.parse(readFileSync(join(dir, 'world.json'), 'utf8')) };
}

// git in `dir`; throws on a failure.
export function git(dir, ...args) {
  const r = spawnSync('git', args, { cwd: dir, env: cleanEnv(), encoding: 'utf8', timeout: 60_000, maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${dir}:\n${r.stderr}`);
  return r.stdout.replace(/\n$/, '');
}
// git that may fail: { code, stdout }.
export function tryGit(dir, ...args) {
  const r = spawnSync('git', args, { cwd: dir, env: cleanEnv(), encoding: 'utf8', timeout: 60_000, maxBuffer: 1 << 28 });
  return { code: r.status, stdout: (r.stdout ?? '').replace(/\n$/, ''), stderr: r.stderr ?? '' };
}

export const linesOf = (text) => text.split('\n').filter((l) => l !== '');

// The state of a repo: its current branch, its branches, main, and a clean tree.
export function repoState(dir) {
  return {
    current: tryGit(dir, 'symbolic-ref', '--short', 'HEAD').stdout,
    branches: linesOf(git(dir, 'branch', '--format=%(refname:short)')).sort(),
    main: git(dir, 'rev-parse', 'refs/heads/main'),
    status: git(dir, 'status', '--porcelain'),
  };
}

// Every repo of a world: [{ name, dir }], central first.
export function worldRepos(worldDir, world) {
  return [
    { name: 'central', dir: join(worldDir, world.central.path) },
    ...world.repos.map((r) => ({ name: r.name, dir: join(worldDir, r.path) })),
  ];
}

// The IDs in the v4 markers of `text`: the first word of each `<!-- ... -->`
// line.
export function markerIds(text) {
  return [...text.matchAll(/^<!-- (\S+)/gm)].map((m) => m[1]);
}

// The IDs of the markers in specs/ (every file under it) at `rev` of the repo.
export function specIdsAt(dir, rev) {
  const files = linesOf(git(dir, 'ls-tree', '-r', '--name-only', rev, '--', 'specs/')).filter((f) => f.endsWith('.md'));
  const ids = new Set();
  for (const f of files) for (const id of markerIds(git(dir, 'show', `${rev}:${f}`))) ids.add(id);
  return ids;
}

// The subjects of the first-parent merge commits of main: [{ sha, subject }].
export function firstParentMerges(dir) {
  return linesOf(git(dir, 'log', '--first-parent', '--merges', '--format=%H %s', 'main')).map((l) => {
    const i = l.indexOf(' ');
    return { sha: l.slice(0, i), subject: l.slice(i + 1) };
  });
}
export const PR_MERGE = /^Merge pull request #(\d+) from \S+$/;

// The rows of `al-v4 export --at <rev>` in `dir`: one JSON object per line.
export function exportAt(dir, rev) {
  const r = al(dir, ['export', '--at', rev]);
  assert.equal(r.code, 0, show(r));
  return linesOf(r.stdout).map((l) => JSON.parse(l));
}

// The paragraph kinds of schema.md 4: the promise kinds and the design kinds.
export const PROMISE_KINDS = ['purpose', 'scope', 'rule', 'limit', 'definition'];
export const DESIGN_KINDS = ['component', 'interface', 'data', 'flow', 'choice'];

export const readYamlFile = (path) => parse(readFileSync(path, 'utf8'));
export const listDir = (dir) => (existsSync(dir) ? readdirSync(dir).sort() : null);
