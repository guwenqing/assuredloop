// Issue #196 (T17, the switch): the pack check of the v4 package. It replaces
// v1's test/pack.test.js (#164) and keeps its approach: a scratch npm home,
// cache and config, `npm pack` in the repo, a global install of the tarball
// into a scratch prefix with no network, and a hard time limit on every npm
// and node process. Built from the issue, design.md 17 and decisions D3 and
// D10; nothing here reads the code under test.
// - package.json: "bin" maps al to bin/al.js, the v4 entry (bin/al-v4.js is
//   gone); "files" stays bin/, src/, skills/, README.md, LICENSE; yaml,
//   pinned at exactly 2.9.1, is in "dependencies", not devDependencies.
// - npm pack holds package.json, LICENSE, README.md, bin/al.js, every file git
//   tracks under src/ (all under src/v4/), skills/assuredloop/SKILL.md, and
//   nothing outside package.json and the "files" entries.
// - The installed al: --version names the version and the installed folder;
//   check and spec run in a scratch git repo.
// - The installed package carries skills/assuredloop/SKILL.md, the same bytes.
//
// No network: yaml must come from somewhere local. npm ci (run first, in CI
// too) downloads the registry's yaml archive into the user's npm cache. The
// test copies that archive out with an offline `npm pack` of the lock's
// resolved URL, checks its bytes against the integrity package-lock.json
// pins, and gives it to the same `npm install --global --offline` as the al
// tarball. npm puts yaml beside
// @assuredloop/cli in <prefix>/lib/node_modules, where al's declared
// dependency resolves to it; `npm ls` shows that the dependency edge is met.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, lines, makeRepo } from './helpers/repo.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const NAME = '@assuredloop/cli';
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const LOCK = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
const YAML_VERSION = '2.9.1';
// npm pack and npm install take seconds; a hang is killed.
const LIMIT = 120_000;

// The scratch folder (npm's home, cache and config, the tarballs, the global
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
  const r = spawnSync(cmd, args, { cwd, env: env(), input: '', encoding: 'utf8', timeout: LIMIT });
  const both = `${r.stdout}\n${r.stderr}`;
  assert.equal(r.signal, null, `${cmd} ${args.join(' ')} was killed (signal ${r.signal}):\n${both}`);
  return { code: r.status, stdout: r.stdout, both };
}

before(() => {
  scratch = mkdtempSync(join(realpathSync(tmpdir()), 'al4-pack-'));
  mkdirSync(join(scratch, 'home'));
  const p = run('npm', ['pack', '--json', '--pack-destination', scratch], ROOT);
  assert.equal(p.code, 0, `npm pack should succeed in the repo:\n${p.both}`);
  const [info] = JSON.parse(p.stdout);
  packed = info.files.map((f) => f.path);

  // The pinned yaml: the registry's own archive, which npm ci left in the
  // user's npm cache. `npm pack --offline <the lock's resolved URL>`, run with
  // the user's npm config (not the scratch one), copies it out of that cache
  // and fails with ENOTCACHED when it is not there. Its bytes are checked
  // against the lock's integrity. A repacked node_modules/yaml is not
  // byte-equal to the registry archive.
  const lockYaml = LOCK.packages['node_modules/yaml'];
  assert.equal(lockYaml?.version, YAML_VERSION, 'the fixture: package-lock.json pins yaml 2.9.1');
  assert.match(lockYaml.integrity ?? '', /^sha512-/, 'the fixture: package-lock.json gives yaml a sha512 integrity');
  const y = spawnSync('npm', ['pack', '--offline', '--json', '--ignore-scripts', '--pack-destination', scratch, lockYaml.resolved],
    { cwd: scratch, input: '', encoding: 'utf8', timeout: LIMIT });
  assert.equal(y.signal, null, `npm pack of the cached yaml was killed:\n${y.stderr}`);
  assert.equal(y.status, 0, `the fixture: npm's cache holds the pinned yaml archive ${lockYaml.resolved} (run npm ci first):\n${y.stdout}\n${y.stderr}`);
  const yamlTgz = join(scratch, JSON.parse(y.stdout)[0].filename);
  assert.equal(`sha512-${createHash('sha512').update(readFileSync(yamlTgz)).digest('base64')}`, lockYaml.integrity,
    'the fixture: the yaml archive is the release that package-lock.json pins, byte for byte');

  prefix = join(scratch, 'prefix');
  const i = run('npm', ['install', '--global', '--prefix', prefix, '--offline', '--no-audit', '--no-fund',
    join(scratch, info.filename), yamlTgz], scratch);
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
  assert.match(ls.at(-2), /^Next\b/, `second last line should start with Next:\n${r.stdout}`);
  assert.match(ls.at(-1), /^Not known\b/, `last line should start with Not known:\n${r.stdout}`);
  return r.stdout;
}

test('#196 package.json: bin maps al to bin/al.js, the v4 entry; bin/al-v4.js is gone; files stays bin/, src/, skills/, README.md, LICENSE', () => {
  assert.deepEqual(PKG.bin, { al: 'bin/al.js' });
  assert.deepEqual(PKG.files, ['bin/', 'src/', 'skills/', 'README.md', 'LICENSE']);
  assert.ok(existsSync(join(ROOT, 'bin', 'al.js')), 'bin/al.js should exist');
  assert.ok(!existsSync(join(ROOT, 'bin', 'al-v4.js')), 'bin/al-v4.js should be gone');
  const src = git(ROOT, ['ls-files', 'src']).split('\n').filter(Boolean);
  assert.ok(src.length > 0, 'git should track files in src/');
  assert.deepEqual(src.filter((p) => !p.startsWith('src/v4/')), [], 'every file git tracks under src/ should be under src/v4/');
});

test('#196 package.json: yaml, pinned at exactly 2.9.1, is in dependencies, not devDependencies (D3, D10), and package-lock.json agrees', () => {
  assert.equal(PKG.dependencies?.yaml, YAML_VERSION, 'dependencies.yaml should be exactly 2.9.1');
  assert.equal(PKG.devDependencies?.yaml, undefined, 'yaml should not be in devDependencies');
  assert.equal(LOCK.packages[''].dependencies?.yaml, YAML_VERSION, 'package-lock.json: the root depends on yaml 2.9.1');
  assert.equal(LOCK.packages[''].devDependencies?.yaml, undefined, 'package-lock.json: yaml is no dev dependency of the root');
  assert.notEqual(LOCK.packages['node_modules/yaml'].dev, true, 'package-lock.json: node_modules/yaml is not marked dev');
});

test('#196 npm pack holds what al needs: package.json, LICENSE, README.md, bin/al.js, every file git tracks in src/, and skills/assuredloop/SKILL.md; no bin/al-v4.js', () => {
  const src = git(ROOT, ['ls-files', 'src']).split('\n').filter(Boolean);
  assert.ok(src.length > 0, 'the fixture: git tracks files in src/');
  const needed = ['package.json', 'LICENSE', 'README.md', 'bin/al.js', 'skills/assuredloop/SKILL.md', ...src];
  assert.deepEqual(needed.filter((p) => !packed.includes(p)), [], `npm pack left out needed files; it packed:\n${packed.join('\n')}`);
  assert.ok(!packed.includes('bin/al-v4.js'), 'npm pack should not hold bin/al-v4.js');
});

test('#196 npm pack holds nothing outside package.json and the "files" entries: no test/, requests/, specs/, .assuredloop/, packages/, .github/, AGENTS.md or CLAUDE.md', () => {
  // packages/ is not in the list since #212 removed packages/search; the
  // filter below still keeps it out of the tarball.
  for (const p of ['test', 'requests', 'specs', '.assuredloop', '.github', 'AGENTS.md', 'CLAUDE.md']) {
    assert.ok(existsSync(join(ROOT, p)), `the fixture: the repo has ${p}`);
  }
  const allowed = (p) => ['package.json', 'README.md', 'LICENSE'].includes(p) || /^(bin|src|skills)\//.test(p);
  assert.deepEqual(packed.filter((p) => !allowed(p)), [], 'npm pack should hold only package.json, README.md, LICENSE, bin/, src/ and skills/');
});

test('#196 the offline install meets the installed package\'s yaml dependency with yaml 2.9.1 (npm ls)', () => {
  const r = run('npm', ['ls', '--global', '--prefix', prefix, '--all', '--json'], scratch);
  assert.equal(r.code, 0, `npm ls --global should find no missing or invalid dependency:\n${r.both}`);
  const tree = JSON.parse(r.stdout);
  assert.equal(tree.dependencies?.[NAME]?.dependencies?.yaml?.version, YAML_VERSION,
    `the installed ${NAME} should depend on yaml ${YAML_VERSION}:\n${r.stdout}`);
});

test('#196 installed from the tarball (no git checkout), al --version prints "al <version> · not a git checkout: <prefix>/lib/node_modules/@assuredloop/cli", from a folder that is no git repo and from a git repo', (t) => {
  const installed = realpathSync(join(prefix, 'lib', 'node_modules', NAME));
  const elsewhere = join(scratch, 'elsewhere');
  mkdirSync(elsewhere, { recursive: true });
  const probe = spawnSync('git', ['rev-parse', '--git-dir'], { cwd: elsewhere, env: env(), timeout: LIMIT });
  assert.equal(probe.status, 128, 'the fixture: the folder is no git repo');
  for (const cwd of [elsewhere, makeRepo(t).dir]) {
    assert.equal(lines(al(cwd, '--version'))[0], `al ${PKG.version} · not a git checkout: ${installed}`, `run from ${cwd}`);
  }
});

test('#196 the installed al check, in a scratch git repo with one commit: exit 0 with no not ok line', (t) => {
  const out = al(makeRepo(t).dir, 'check');
  assert.deepEqual(lines(out).filter((l) => l.startsWith('not ok')), [], `no not ok:\n${out}`);
});

test('#196 the installed al spec (a v4 command) runs and exits 0 in a scratch git repo with one commit', (t) => {
  al(makeRepo(t).dir, 'spec');
});

test('#196 the installed package carries skills/assuredloop/SKILL.md at $(npm root -g)/@assuredloop/cli/skills/assuredloop/SKILL.md, byte for byte the repo\'s', () => {
  const r = run('npm', ['root', '--global', '--prefix', prefix], scratch);
  assert.equal(r.code, 0, `npm root --global should succeed:\n${r.both}`);
  const skill = join(r.stdout.trim(), NAME, 'skills', 'assuredloop', 'SKILL.md');
  assert.ok(existsSync(skill), `${skill} should exist`);
  assert.ok(readFileSync(skill).equals(readFileSync(join(ROOT, 'skills', 'assuredloop', 'SKILL.md'))), 'SKILL.md should be the same bytes');
});
