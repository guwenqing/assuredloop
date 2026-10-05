// Issue #164, the npm package @assuredloop/cli: the pack check. Built from the
// issue (tier 0, no spec change); nothing here reads the code under test.
// (4) `npm pack`, run in the repo, gives a tarball that holds what al needs
//     (package.json, LICENSE, README.md, bin/al.js, every file of src/,
//     skills/assuredloop/SKILL.md) and nothing outside package.json and the
//     "files" entries bin/, src/, skills/, README.md, LICENSE: so no test/,
//     requests/, specs/, docs/, .github/, AGENTS.md or CLAUDE.md. Installed
//     from that tarball into a scratch global prefix, with no network, the
//     `al` it puts in <prefix>/bin runs al --version and al check.
// (3) Installed from npm, not a checkout, al --version prints the version and
//     no commit: "al 0.1.0 · not a git checkout: <installed folder>", the
//     installed folder being <prefix>/lib/node_modules/@assuredloop/cli.
// (5) The installed package carries skills/assuredloop/SKILL.md at
//     $(npm root -g)/@assuredloop/cli/skills/assuredloop/SKILL.md.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, makeRepo } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { checkHints, kindOf } from './helpers/hints.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NAME = '@assuredloop/cli';
const VERSION = '0.1.0';
// npm pack and npm install take seconds; a hang is killed.
const LIMIT = 120_000;

// The scratch folder (npm's home, cache and config, the tarball, the global
// prefix), the files npm pack listed, and the global prefix.
let scratch, packed, prefix;

// The environment without anything that points git at another repo or
// config, or npm at the user's home, cache or config or at a parent npm run.
function env() {
  const e = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_') && !/^npm_/i.test(k)) e[k] = v;
  return {
    ...e, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
    HOME: join(scratch, 'home'), npm_config_cache: join(scratch, 'npm-cache'),
    npm_config_userconfig: join(scratch, 'npmrc'), npm_config_update_notifier: 'false',
    // The installed al starts with #!/usr/bin/env node: this node comes first.
    PATH: [dirname(process.execPath), process.env.PATH].join(delimiter),
  };
}

// `cmd ...args` in `cwd`, killed after LIMIT; its status, stdout and stderr.
function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, env: env(), encoding: 'utf8', timeout: LIMIT });
  const both = `${r.stdout}\n${r.stderr}`;
  assert.equal(r.signal, null, `${cmd} ${args.join(' ')} was killed (signal ${r.signal}):\n${both}`);
  return { code: r.status, stdout: r.stdout, both };
}

before(() => {
  scratch = mkdtempSync(join(realpathSync(tmpdir()), 'al-pack-'));
  mkdirSync(join(scratch, 'home'));
  const p = run('npm', ['pack', '--json', '--pack-destination', scratch], ROOT);
  assert.equal(p.code, 0, `npm pack should succeed in the repo:\n${p.both}`);
  const [info] = JSON.parse(p.stdout);
  packed = info.files.map((f) => f.path);
  prefix = join(scratch, 'prefix');
  const i = run('npm', ['install', '--global', '--prefix', prefix, '--offline', '--no-audit', '--no-fund', join(scratch, info.filename)], scratch);
  assert.equal(i.code, 0, `npm install --global of the tarball should succeed with no network:\n${i.both}`);
});

after(() => { if (scratch) rmSync(scratch, { recursive: true, force: true }); });

// The installed al (the link npm put in <prefix>/bin) run with `args` in
// `cwd`: exit 0, ending with Next then Not known; its stdout.
function al(cwd, ...args) {
  const bin = join(prefix, 'bin', 'al');
  assert.ok(existsSync(bin), `npm install --global should put al in ${join(prefix, 'bin')}`);
  const r = run(bin, args, cwd);
  assert.equal(r.code, 0, `the installed al ${args.join(' ')} should exit 0:\n${r.both}`);
  const ls = lines(r.stdout);
  assert.ok(ls.length >= 2, `al ${args.join(' ')}: output too short:\n${r.both}`);
  assert.match(ls.at(-2), /^Next/, `second last line should start with Next:\n${r.stdout}`);
  assert.match(ls.at(-1), /^Not known/, `last line should start with Not known:\n${r.stdout}`);
  return r.stdout;
}

test('#164 (4) npm pack holds what al needs: package.json, LICENSE, README.md, bin/al.js, every file git tracks in src/, and skills/assuredloop/SKILL.md', () => {
  const src = git(ROOT, ['ls-files', 'src']).split('\n').filter(Boolean);
  assert.ok(src.length > 0, 'the fixture: git tracks files in src/');
  const needed = ['package.json', 'LICENSE', 'README.md', 'bin/al.js', 'skills/assuredloop/SKILL.md', ...src];
  assert.deepEqual(needed.filter((p) => !packed.includes(p)), [], `npm pack left out needed files; it packed:\n${packed.join('\n')}`);
});

test('#164 (4) npm pack holds nothing outside package.json and the "files" entries bin/, src/, skills/, README.md, LICENSE: no test/, requests/, specs/, docs/, .github/, AGENTS.md or CLAUDE.md', () => {
  for (const p of ['test', 'requests', 'specs', 'docs', '.github', 'AGENTS.md', 'CLAUDE.md']) {
    assert.ok(existsSync(join(ROOT, p)), `the fixture: the repo has ${p}`);
  }
  const allowed = (p) => ['package.json', 'README.md', 'LICENSE'].includes(p) || /^(bin|src|skills)\//.test(p);
  assert.deepEqual(packed.filter((p) => !allowed(p)), [], 'npm pack should hold only package.json, README.md, LICENSE, bin/, src/ and skills/');
});

test('#164 (3) installed from the tarball (no git checkout), al --version prints the version and no commit: "al 0.1.0 · not a git checkout: <prefix>/lib/node_modules/@assuredloop/cli", from a folder that is no git repo and from a git repo', (t) => {
  const installed = realpathSync(join(prefix, 'lib', 'node_modules', NAME));
  const elsewhere = join(scratch, 'elsewhere');
  mkdirSync(elsewhere, { recursive: true });
  assert.equal(spawnSync('git', ['rev-parse', '--git-dir'], { cwd: elsewhere, env: env() }).status, 128, 'the fixture: the folder is no git repo');
  for (const cwd of [elsewhere, makeRepo(t).dir]) {
    assert.equal(lines(al(cwd, '--version'))[0], `al ${VERSION} · not a git checkout: ${installed}`, `run from ${cwd}`);
  }
});

test('#164 (4) the installed al check, in a scratch git repo: exit 0 with no not ok', (t) => {
  const out = al(makeRepo(t).dir, 'check');
  assert.deepEqual(checkHints(out).filter((l) => kindOf(l) === 'not ok'), [], `no not ok:\n${out}`);
});

test('#164 (5) the installed package carries skills/assuredloop/SKILL.md at $(npm root -g)/@assuredloop/cli/skills/assuredloop/SKILL.md, the same as the repo\'s', () => {
  const r = run('npm', ['root', '--global', '--prefix', prefix], scratch);
  assert.equal(r.code, 0, `npm root --global should succeed:\n${r.both}`);
  const skill = join(r.stdout.trim(), NAME, 'skills', 'assuredloop', 'SKILL.md');
  assert.ok(existsSync(skill), `${skill} should exist`);
  assert.equal(readFileSync(skill, 'utf8'), readFileSync(join(ROOT, 'skills', 'assuredloop', 'SKILL.md'), 'utf8'));
});
