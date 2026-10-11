// Issue #212: level 2 search without a second npm package, released as 0.2.1.
// Built from the issue's requirement and the public interface only:
// package.json and package-lock.json, the packed tarball, the two workflow
// files as GitHub Actions files, README.md, and the installed `al`. Nothing
// here reads src/. It follows test/v4/pack.test.js: a scratch npm home, cache
// and config, `npm pack --json`, an offline global install into a scratch
// prefix, and a hard time limit on every spawned process.
// - Item 1: one package. packages/search/ is gone, and no shipped file names
//   @assuredloop/search or packages/search.
// - Item 2: @huggingface/transformers at exactly 4.3.1 in peerDependencies,
//   optional in peerDependenciesMeta; dependencies is yaml 2.9.1 only;
//   package-lock.json agrees and holds no entry for the library, so npm ci
//   does not install it.
// - Item 5: version 0.2.1 in package.json and package-lock.json; README.md's
//   two install lines, and no @assuredloop/search or packages/search in it;
//   publish.yml publishes only @assuredloop/cli (a tag check of ./package.json
//   alone, one npm publish step, skip when on npm, --tag next for a
//   pre-release); neither workflow installs the library or fills npm's cache
//   with it.
// - Item 6: the packed cli alone, installed offline: no file of the library
//   in the tarball, npm does not install the library, al --version names
//   0.2.1, al check --strict runs, and the installed al finds the library in
//   the project first and then beside itself (a stand-in, helpers/search.js).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { lines, makeRepo } from './helpers/repo.js';
import {
  LEVEL2_LINE, TRANSFORMERS, TRANSFORMERS_VERSION, importsOf, installEmbedder, smallRepo, standIn,
} from './helpers/search.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CLI = '@assuredloop/cli';
const OLD = '@assuredloop/search';
const VERSION = '0.2.1';
const YAML_VERSION = '2.9.1';
const INSTALL = `${TRANSFORMERS}@${TRANSFORMERS_VERSION}`;
// npm pack, npm install and al take seconds; a hang is killed.
const LIMIT = 120_000;

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const cliPkg = () => readJson(join(ROOT, 'package.json'));
const lock = () => readJson(join(ROOT, 'package-lock.json'));

// --- item 1 and item 2: one package, an optional peer dependency

test('#212 packages/search/ is gone', () => {
  assert.ok(!existsSync(join(ROOT, 'packages', 'search')), 'packages/search should not exist');
});

test('#212 package.json is @assuredloop/cli at 0.2.1, and package-lock.json says 0.2.1 at its top and for its root package', () => {
  assert.equal(cliPkg().name, CLI);
  assert.equal(cliPkg().version, VERSION);
  const l = lock();
  assert.equal(l.name, CLI);
  assert.equal(l.version, VERSION, 'package-lock.json: version');
  assert.equal(l.packages?.['']?.version, VERSION, 'package-lock.json: packages[""].version');
});

test('#212 package.json names @huggingface/transformers at exactly 4.3.1 in peerDependencies, optional in peerDependenciesMeta; dependencies stays yaml 2.9.1 only', () => {
  const p = cliPkg();
  assert.equal(p.peerDependencies?.[TRANSFORMERS], TRANSFORMERS_VERSION, 'peerDependencies: exactly 4.3.1');
  assert.deepEqual(p.peerDependenciesMeta?.[TRANSFORMERS], { optional: true }, 'peerDependenciesMeta: { optional: true }');
  assert.deepEqual(p.dependencies, { yaml: YAML_VERSION }, 'dependencies: yaml 2.9.1 only');
  for (const field of ['devDependencies', 'optionalDependencies']) {
    assert.equal(p[field]?.[TRANSFORMERS], undefined, `not in ${field}`);
  }
  for (const field of ['bundleDependencies', 'bundledDependencies']) {
    assert.equal(p[field], undefined, `no ${field}`);
  }
});

test('#212 package-lock.json: the root package names the same optional peer, and no entry installs @huggingface/transformers, so npm ci does not', () => {
  const root = lock().packages?.[''] ?? {};
  assert.equal(root.peerDependencies?.[TRANSFORMERS], TRANSFORMERS_VERSION, 'the lock\'s root: peerDependencies');
  assert.deepEqual(root.peerDependenciesMeta?.[TRANSFORMERS], { optional: true }, 'the lock\'s root: peerDependenciesMeta');
  assert.deepEqual(root.dependencies, { yaml: YAML_VERSION }, 'the lock\'s root: dependencies');
  const entries = Object.keys(lock().packages ?? {}).filter((k) => k.endsWith(`node_modules/${TRANSFORMERS}`));
  assert.deepEqual(entries, [], 'package-lock.json has no entry for @huggingface/transformers');
});

// --- item 5: README.md

const readme = () => readFileSync(join(ROOT, 'README.md'), 'utf8');

test('#212 README.md gives two install lines: the cli alone, and the cli with @huggingface/transformers@4.3.1 for level 2', () => {
  const ls = readme().split('\n').map((l) => l.trim());
  assert.ok(ls.includes(`npm install --global ${CLI}`), 'a line: npm install --global @assuredloop/cli');
  assert.ok(ls.includes(`npm install --global ${CLI} ${INSTALL}`), `a line: npm install --global @assuredloop/cli ${INSTALL}`);
});

test('#212 README.md names @assuredloop/search and packages/search nowhere', () => {
  const md = readme();
  assert.ok(!md.includes(OLD), 'README.md names @assuredloop/search');
  assert.ok(!md.includes('packages/search'), 'README.md names packages/search');
});

// --- item 5: the workflows

const WF = (file) => join(ROOT, '.github', 'workflows', file);
const workflow = (file) => parseYaml(readFileSync(WF(file), 'utf8'));
const runSteps = (wf) => Object.entries(wf?.jobs ?? {}).flatMap(([id, j]) => (j.steps ?? []).map((s) => ({ id, s })))
  .filter(({ s }) => typeof s.run === 'string');

test('#212 publish.yml names neither @assuredloop/search nor packages/search, and has one npm publish step', () => {
  const text = readFileSync(WF('publish.yml'), 'utf8');
  assert.ok(!text.includes(OLD), 'publish.yml names @assuredloop/search');
  assert.ok(!text.includes('packages/search'), 'publish.yml names packages/search');
  const publishing = runSteps(workflow('publish.yml')).filter(({ s }) => /\bnpm publish\b/.test(s.run));
  assert.equal(publishing.length, 1, `one step runs npm publish: ${publishing.map(({ s }) => s.name).join(', ')}`);
  assert.equal(publishing[0].s['working-directory'], undefined, 'it publishes the repo root');
});

// Each npm command in a run script that installs something: `npm ci`, or
// `npm install` (i, add, ...) and `npm cache add` with what they name.
function npmInstalls(run) {
  const found = [];
  for (const line of run.split('\n')) {
    for (const m of line.matchAll(/\bnpm\s+((?:install|i|add|isntall|in|ins|inst|insta|instal|isnt|isnta|isntal|ci|clean-install|install-clean|cache)\b[^;&|]*)/g)) {
      const words = m[1].trim().split(/\s+/);
      found.push({ cmd: words[0], rest: words.slice(1), line: line.trim() });
    }
  }
  return found;
}

for (const file of ['test.yml', 'publish.yml']) {
  test(`#212 ${file}: no step installs @huggingface/transformers or fills npm's cache with it; npm ci and npm install --global . are the only installs`, () => {
    for (const { id, s } of runSteps(workflow(file))) {
      const where = `${file}, job ${id}, step "${s.name ?? s.run.split('\n')[0]}"`;
      assert.ok(!/huggingface|transformers/i.test(s.run), `${where} names the library`);
      assert.ok(!/packages\/search|search-deps/.test(s.run), `${where} names the search package`);
      for (const c of npmInstalls(s.run)) {
        if (['ci', 'clean-install', 'install-clean'].includes(c.cmd)) continue;
        if (c.cmd === 'cache') {
          assert.notEqual(c.rest[0], 'add', `${where} fills npm's cache: ${c.line}`);
          continue;
        }
        const named = c.rest.filter((w) => !w.startsWith('-'));
        assert.deepEqual(named, ['.'], `${where} installs only the repo itself: ${c.line}`);
      }
    }
  });
}

// --- item 5: publish.yml's publish job, run with a stub npm
//
// The shape assumed: the job of publish.yml with the npm publish step. Its
// run steps after actions/setup-node run in order, as GitHub runs a bash step
// (`bash --noprofile --norc -eo pipefail`), in a scratch copy of the package
// files, with a stub `npm` first on PATH. They have no `if:`. They read the
// tag and the pre-release flag from github.event.release.tag_name and
// github.event.release.prerelease. The stub logs each call (cwd and
// arguments). `npm view` (or info, show, v) of @assuredloop/cli answers as npm
// does: the version (JSON-quoted with --json) and exit 0 when it is
// published; E404 and exit 1 when it is not. `npm publish` prints a line and
// exits 0. Any other npm command goes to the real npm.

function publishJob() {
  const jobs = Object.entries(workflow('publish.yml')?.jobs ?? {});
  const found = jobs.find(([, j]) => (j.steps ?? []).some((s) => /\bnpm publish\b/.test(String(s.run ?? ''))));
  assert.ok(found, 'the fixture: publish.yml has a job with an npm publish step');
  return found;
}

// Every run step of the publish job after actions/setup-node, in order.
function jobSteps() {
  const [id, job] = publishJob();
  const setup = job.steps.findIndex((s) => /^actions\/setup-node@/.test(String(s.uses ?? '')));
  assert.ok(setup >= 0, `the fixture: job ${id} of publish.yml has an actions/setup-node step`);
  const mine = job.steps.slice(setup + 1).filter((s) => s.run !== undefined);
  for (const [i, s] of mine.entries()) assert.equal(s.if, undefined, `this test assumes the publish job's steps have no if: ("${s.name ?? i}")`);
  return mine;
}

// A scratch copy of what the steps may read: package.json, package-lock.json,
// LICENSE and README.md. With `stray`, also a packages/search/package.json of
// the old package at 0.2.0, which a tag check of ./package.json alone ignores.
function workspace(dir, { stray = false } = {}) {
  const ws = join(dir, 'ws');
  mkdirSync(ws, { recursive: true });
  for (const f of ['package.json', 'package-lock.json', 'LICENSE', 'README.md']) {
    if (existsSync(join(ROOT, f))) copyFileSync(join(ROOT, f), join(ws, f));
  }
  if (stray) {
    mkdirSync(join(ws, 'packages', 'search'), { recursive: true });
    writeFileSync(join(ws, 'packages', 'search', 'package.json'), `${JSON.stringify({ name: OLD, version: '0.2.0' })}\n`);
  }
  return realpathSync(ws);
}

const STUB = `#!/usr/bin/env node
const { appendFileSync, existsSync, readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
const args = process.argv.slice(2);
appendFileSync(process.env.STUB_LOG, JSON.stringify({ cwd: process.cwd(), args }) + '\\n');
const cmd = args.find((a) => !a.startsWith('-'));
if (['view', 'info', 'show', 'v'].includes(cmd)) {
  const pj = join(process.cwd(), 'package.json');
  const here = existsSync(pj) ? JSON.parse(readFileSync(pj, 'utf8')).name : '';
  const name = process.env.STUB_NAME;
  const named = args.some((a) => a === name || a.startsWith(name + '@'));
  const other = args.some((a) => a.startsWith('@') && a !== name && !a.startsWith(name + '@'));
  const about = named || (!other && here === name);
  if (about && process.env.STUB_VIEW === 'published') {
    const v = process.env.STUB_VERSION;
    console.log(args.includes('--json') ? JSON.stringify(v) : v);
    process.exit(0);
  }
  console.error('npm error code E404');
  console.error("npm error 404 No match found for version " + process.env.STUB_VERSION);
  process.exit(1);
}
if (cmd === 'publish') {
  console.log('stub npm: published ' + args.join(' '));
  process.exit(0);
}
const r = spawnSync(process.env.REAL_NPM, args, { stdio: 'inherit' });
process.exit(r.status ?? 1);
`;

const REAL_NPM = (() => {
  const r = spawnSync('which', ['npm'], { encoding: 'utf8', timeout: LIMIT });
  return r.status === 0 ? r.stdout.trim() : 'npm';
})();

// Runs the publish job's steps for one release; stops at the first step that
// fails, as GitHub does. Returns the exit code, the output, the npm calls and
// the publishes of the repo root (an npm publish in the root that names no
// other folder).
function runJob(t, { tag, prerelease, view, stray = false }) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'al4-publish-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const ws = workspace(dir, { stray });
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'npm'), STUB);
  chmodSync(join(bin, 'npm'), 0o755);
  mkdirSync(join(dir, 'home'));
  const log = join(dir, 'npm.log');
  writeFileSync(log, '');
  for (const f of ['output', 'env', 'summary']) writeFileSync(join(dir, f), '');
  const expr = (text) => String(text)
    .replace(/\$\{\{\s*github\.event\.release\.tag_name\s*\}\}/g, tag)
    .replace(/\$\{\{\s*github\.event\.release\.prerelease\s*\}\}/g, String(prerelease));
  let code = 0;
  let out = '';
  for (const [i, s] of jobSteps().entries()) {
    const stepEnv = {};
    for (const [k, v] of Object.entries(s.env ?? {})) stepEnv[k] = expr(v);
    const script = expr(s.run);
    const left = `${JSON.stringify(stepEnv)}\n${script}`.match(/\$\{\{[^}]*\}\}/);
    assert.equal(left, null, `the step "${s.name ?? i}" uses an expression this test does not know: ${left?.[0]}`);
    const file = join(dir, `step-${i}.sh`);
    writeFileSync(file, script);
    const cwd = s['working-directory'] ? resolve(ws, s['working-directory']) : ws;
    const r = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', file], {
      cwd, encoding: 'utf8', input: '', timeout: LIMIT,
      env: {
        PATH: [bin, dirname(process.execPath), '/usr/bin', '/bin'].join(delimiter),
        HOME: join(dir, 'home'), npm_config_cache: join(dir, 'npm-cache'), npm_config_userconfig: join(dir, 'npmrc'),
        npm_config_update_notifier: 'false',
        GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'release', GITHUB_REF_NAME: tag, GITHUB_REF: `refs/tags/${tag}`,
        GITHUB_WORKSPACE: ws, GITHUB_OUTPUT: join(dir, 'output'), GITHUB_ENV: join(dir, 'env'),
        GITHUB_STEP_SUMMARY: join(dir, 'summary'),
        STUB_LOG: log, STUB_VIEW: view, STUB_NAME: CLI, STUB_VERSION: cliPkg().version, REAL_NPM,
        ...stepEnv,
      },
    });
    assert.equal(r.signal, null, `the step "${s.name ?? i}" was killed (signal ${r.signal}):\n${r.stdout}\n${r.stderr}`);
    out += `${r.stdout}\n${r.stderr}\n`;
    code = r.status;
    if (code !== 0) break;
  }
  const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const publishes = calls.filter((c) => c.args.find((a) => !a.startsWith('-')) === 'publish');
  const inRoot = (c) => c.cwd === ws && c.args.filter((a) => !a.startsWith('-') && a !== 'publish' && !/^(next|latest|public)$/.test(a))
    .every((a) => resolve(c.cwd, a) === ws);
  return { code, out, calls, publishes, rootPublishes: publishes.filter(inRoot) };
}

const showJob = (r) => `exit ${r.code}\n--- output\n${r.out}--- npm calls\n${r.calls.map((c) => `${c.cwd}: npm ${c.args.join(' ')}`).join('\n')}`;
const tagOf = () => `v${cliPkg().version}`;

test('#212 publish.yml: the publish job uses trusted publishing (id-token: write) and no token', () => {
  const [id, job] = publishJob();
  assert.equal(job.permissions?.['id-token'], 'write', `job ${id}: id-token: write (npm trusted publishing)`);
  const text = JSON.stringify(job.steps);
  assert.ok(!/secrets\./.test(text), 'the publish job uses no secret');
  assert.ok(!/NODE_AUTH_TOKEN|NPM_TOKEN/.test(text), 'the publish job sets no npm token');
});

test('#212 publish.yml, the publish job: a release tag that is not v<package.json version> stops it before any npm publish, with a message', (t) => {
  const tag = 'v9.9.9';
  assert.notEqual(tagOf(), tag, 'the fixture: the tag differs from the version');
  const r = runJob(t, { tag, prerelease: false, view: 'not-published' });
  assert.notEqual(r.code, 0, `a tag mismatch should fail:\n${showJob(r)}`);
  assert.deepEqual(r.publishes, [], `no npm publish:\n${showJob(r)}`);
  assert.match(r.out, /v?9\.9\.9|\b0\.2\.1\b/, `the message names the tag or the version:\n${showJob(r)}`);
});

test('#212 publish.yml, the publish job: the tag check reads only ./package.json: with no packages/ folder, and with a stray packages/search/package.json at 0.2.0, a matching tag publishes the root once', (t) => {
  for (const stray of [false, true]) {
    const r = runJob(t, { tag: tagOf(), prerelease: false, view: 'not-published', stray });
    assert.equal(r.code, 0, `stray packages/search: ${stray}:\n${showJob(r)}`);
    assert.equal(r.publishes.length, 1, `one npm publish (stray packages/search: ${stray}):\n${showJob(r)}`);
    assert.equal(r.rootPublishes.length, 1, `the npm publish is of the repo root (stray packages/search: ${stray}):\n${showJob(r)}`);
  }
});

test('#212 publish.yml, the publish job: a version already on npm is skipped with a log line, exit 0, no npm publish', (t) => {
  const r = runJob(t, { tag: tagOf(), prerelease: false, view: 'published' });
  assert.equal(r.code, 0, `an already published version should not fail the run:\n${showJob(r)}`);
  assert.deepEqual(r.publishes, [], `no npm publish:\n${showJob(r)}`);
  assert.ok(r.calls.some((c) => ['view', 'info', 'show', 'v'].includes(c.args.find((a) => !a.startsWith('-')))),
    `it asks npm whether the version is published:\n${showJob(r)}`);
  assert.match(r.out, /skip/i, `a log line says it is skipped:\n${showJob(r)}`);
});

test('#212 publish.yml, the publish job: a full release not on npm is published in the root, not under next', (t) => {
  const r = runJob(t, { tag: tagOf(), prerelease: false, view: 'not-published' });
  assert.equal(r.code, 0, showJob(r));
  assert.equal(r.rootPublishes.length, 1, `one npm publish of the repo root:\n${showJob(r)}`);
  assert.ok(!r.rootPublishes[0].args.some((a) => /\bnext\b/.test(a)), `a full release is not tagged next:\n${showJob(r)}`);
});

test('#212 publish.yml, the publish job: a pre-release not on npm is published in the root with --tag next', (t) => {
  const r = runJob(t, { tag: tagOf(), prerelease: true, view: 'not-published' });
  assert.equal(r.code, 0, showJob(r));
  assert.equal(r.rootPublishes.length, 1, `one npm publish of the repo root:\n${showJob(r)}`);
  const a = r.rootPublishes[0].args;
  const i = a.indexOf('--tag');
  assert.ok((i >= 0 && a[i + 1] === 'next') || a.includes('--tag=next'), `npm publish --tag next:\n${showJob(r)}`);
});

// --- item 6: the packed cli alone, installed with no network

describe('#212 the packed @assuredloop/cli alone, installed with no network', () => {
  // The scratch folder (npm's home, cache and config, the tarballs, the
  // global prefix), the files npm pack listed, and the global prefix.
  let scratch, packed, prefix;

  // The environment without anything that points git at another repo or
  // config, or npm at the user's home, cache or config or at a parent npm run.
  function env(extra = {}) {
    const e = {};
    for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_') && !/^npm_/i.test(k)) e[k] = v;
    return {
      ...e, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
      HOME: join(scratch, 'home'), npm_config_cache: join(scratch, 'npm-cache'),
      npm_config_userconfig: join(scratch, 'npmrc'), npm_config_update_notifier: 'false',
      // The installed al starts with #!/usr/bin/env node: this node comes first.
      PATH: [dirname(process.execPath), process.env.PATH].join(delimiter),
      ...extra,
    };
  }

  // `cmd ...args` in `cwd`, killed after LIMIT; its status, stdout and both.
  function run(cmd, args, cwd, extra) {
    const r = spawnSync(cmd, args, { cwd, env: env(extra), input: '', encoding: 'utf8', timeout: LIMIT, maxBuffer: 1 << 26 });
    const both = `${r.stdout}\n${r.stderr}`;
    assert.equal(r.signal, null, `${cmd} ${args.join(' ')} was killed (signal ${r.signal}):\n${both}`);
    return { code: r.status, stdout: r.stdout, both };
  }

  // A proxy that refuses every connection, for node's fetch: a run that
  // tried to download anything would fail, not download it.
  const NO_NET = { NODE_USE_ENV_PROXY: '1', HTTPS_PROXY: 'http://127.0.0.1:9', HTTP_PROXY: 'http://127.0.0.1:9', NO_PROXY: '' };

  // The installed al (the link npm put in <prefix>/bin) run with `args` in
  // `cwd`, with no network; its exit code and output.
  function alRun(cwd, ...args) {
    const bin = join(prefix, 'bin', 'al');
    assert.ok(existsSync(bin), `npm install --global should put al in ${join(prefix, 'bin')}`);
    return run(bin, args, cwd, NO_NET);
  }
  function al(cwd, ...args) {
    const r = alRun(cwd, ...args);
    assert.equal(r.code, 0, `the installed al ${args.join(' ')} should exit 0:\n${r.both}`);
    return r.stdout;
  }
  const alJson = (cwd, ...args) => {
    const out = al(cwd, ...args, '--json');
    try { return JSON.parse(out); } catch { return assert.fail(`al ${args.join(' ')} --json gives one JSON object:\n${out}`); }
  };
  const idRoles = (out) => out.hits.map((h) => `${h.id} v${h.version} ${h.role}`);
  const installed = () => join(prefix, 'lib', 'node_modules');
  const saysInstall = (text) => /\bnpm install\b/.test(text) && text.includes(INSTALL);

  before(() => {
    scratch = mkdtempSync(join(realpathSync(tmpdir()), 'al4-release-212-'));
    mkdirSync(join(scratch, 'home'));

    const c = run('npm', ['pack', '--json', '--pack-destination', scratch], ROOT);
    assert.equal(c.code, 0, `npm pack should succeed in the repo:\n${c.both}`);
    const [info] = JSON.parse(c.stdout);
    packed = info.files.map((f) => f.path);
    const cliTgz = join(scratch, info.filename);

    // The pinned yaml: the registry's own archive from the user's npm cache,
    // as pack.test.js gets it.
    const lockYaml = lock().packages['node_modules/yaml'];
    assert.equal(lockYaml?.version, YAML_VERSION, 'the fixture: package-lock.json pins yaml 2.9.1');
    const y = spawnSync('npm', ['pack', '--offline', '--json', '--ignore-scripts', '--pack-destination', scratch, lockYaml.resolved],
      { cwd: scratch, input: '', encoding: 'utf8', timeout: LIMIT });
    assert.equal(y.signal, null, `npm pack of the cached yaml was killed:\n${y.stderr}`);
    assert.equal(y.status, 0, `the fixture: npm's cache holds the pinned yaml archive ${lockYaml.resolved} (run npm ci first):\n${y.stdout}\n${y.stderr}`);
    const yamlTgz = join(scratch, JSON.parse(y.stdout)[0].filename);
    assert.equal(`sha512-${createHash('sha512').update(readFileSync(yamlTgz)).digest('base64')}`, lockYaml.integrity,
      'the fixture: the yaml archive is the release that package-lock.json pins, byte for byte');

    // The scratch cache is empty: if npm tried to install the optional peer,
    // the offline install would fail with ENOTCACHED.
    prefix = join(scratch, 'prefix');
    const i = run('npm', ['install', '--global', '--prefix', prefix, '--offline', '--no-audit', '--no-fund', cliTgz, yamlTgz], scratch);
    assert.equal(i.code, 0, `npm install --global --offline of the cli tarball and yaml alone should succeed with no network:\n${i.both}`);
  });

  after(() => { if (scratch) rmSync(scratch, { recursive: true, force: true }); });

  test('#212 npm pack holds no file of @huggingface/transformers', () => {
    assert.ok(packed.length > 0, 'the fixture: npm pack listed files');
    assert.deepEqual(packed.filter((p) => /(^|\/)node_modules\/|@huggingface|transformers/i.test(p)), [],
      'no packed path is a file of @huggingface/transformers');
  });

  test('#212 no packed file names @assuredloop/search or packages/search', () => {
    for (const p of packed) {
      const text = readFileSync(join(ROOT, p), 'utf8');
      assert.ok(!text.includes(OLD), `${p} names ${OLD}`);
      assert.ok(!text.includes('packages/search'), `${p} names packages/search`);
    }
  });

  test('#212 the installed package.json names @huggingface/transformers 4.3.1 as an optional peer, and npm installed no @huggingface/transformers', () => {
    const pj = readJson(join(installed(), CLI, 'package.json'));
    assert.equal(pj.version, VERSION);
    assert.equal(pj.peerDependencies?.[TRANSFORMERS], TRANSFORMERS_VERSION);
    assert.deepEqual(pj.peerDependenciesMeta?.[TRANSFORMERS], { optional: true });
    for (const where of [join(installed(), TRANSFORMERS), join(installed(), CLI, 'node_modules', TRANSFORMERS)]) {
      assert.ok(!existsSync(where), `${where} should not exist`);
    }
  });

  test('#212 npm ls --global: @assuredloop/cli 0.2.1 with yaml 2.9.1, all met, and no @huggingface/transformers', () => {
    const r = run('npm', ['ls', '--global', '--prefix', prefix, '--all', '--json'], scratch);
    assert.equal(r.code, 0, `npm ls --global should find no missing or invalid dependency:\n${r.both.slice(0, 4000)}`);
    const tree = JSON.parse(r.stdout);
    const deps = tree.dependencies ?? {};
    assert.equal(deps[CLI]?.version, VERSION, `${CLI} ${VERSION} is installed`);
    assert.equal(deps[CLI]?.dependencies?.yaml?.version, YAML_VERSION, `${CLI} depends on yaml ${YAML_VERSION}`);
    assert.equal(deps[TRANSFORMERS], undefined, `${TRANSFORMERS} is not installed`);
    assert.equal(deps[CLI]?.dependencies?.[TRANSFORMERS]?.version, undefined, `${TRANSFORMERS} is not installed under the cli`);
  });

  test('#212 the installed al --version: the first line names 0.2.1', () => {
    const elsewhere = join(scratch, 'elsewhere');
    mkdirSync(elsewhere, { recursive: true });
    assert.match(lines(al(elsewhere, '--version'))[0], /^al 0\.2\.1 · not a git checkout: /);
  });

  test('#212 the installed al check --strict runs in a scratch git repo: exit 0, no not ok, and it does not import @huggingface/transformers from the project', (t) => {
    const repo = makeRepo(t, { commit: false });
    repo.write('.gitignore', 'node_modules/\n');
    repo.write('README.md', 'fixture\n');
    repo.commit('initial');
    const marker = join(repo.dir, '.git', 'imported.log');
    installEmbedder(repo.dir, { marker });
    const out = al(repo.dir, 'check', '--strict');
    assert.deepEqual(lines(out).filter((l) => l.startsWith('not ok')), [], `no not ok:\n${out}`);
    assert.deepEqual(importsOf(marker), [], 'al check --strict imported the library');
  });

  test('#212 the installed al, with no @huggingface/transformers anywhere: al search answers at level 1, and Not known says npm install @huggingface/transformers@4.3.1', (t) => {
    const { dir } = smallRepo(t);
    assert.ok(!existsSync(join(dir, 'node_modules')), 'the fixture: the project has no node_modules');
    const text = al(dir, 'search', 'export', 'link');
    assert.match(text.split('\n')[0], /^Level\s+1\b/, text);
    const ls = text.replace(/\n+$/, '').split('\n');
    const at = ls.findIndex((l) => /^Not known\b/.test(l));
    assert.ok(at >= 0 && saysInstall(ls.slice(at).join('\n')), `the Not known line names npm install and ${INSTALL}:\n${text}`);
    const out = alJson(dir, 'search', 'export', 'link');
    assert.equal(out.level, 1);
    assert.ok(out.not_known.some(saysInstall), JSON.stringify(out.not_known));
  });

  test('#212 the installed al finds @huggingface/transformers in the project: al search URL answers at level 2 and finds EXP-4 by meaning', (t) => {
    const { dir } = smallRepo(t);
    installEmbedder(dir);
    assert.deepEqual(alJson(dir, 'search', 'URL', '--level', '1').hits, [], 'the fixture: at level 1 no row has the word');
    const out = alJson(dir, 'search', 'URL');
    assert.equal(out.level, 2, `level 2 answered (fallback: ${out.fallback})`);
    assert.equal(out.fallback, null);
    assert.ok(idRoles(out).includes('EXP-4 v1 baseline'), idRoles(out).join('\n'));
    assert.equal(al(dir, 'search', 'URL').split('\n')[0], LEVEL2_LINE);
  });

  // These two put a stand-in beside the installed al, where
  // `npm install --global @assuredloop/cli @huggingface/transformers@4.3.1`
  // puts the library, and take it away at the end.
  test('#212 the installed al finds @huggingface/transformers beside itself when the project has none: level 2', (t) => {
    const beside = join(installed(), TRANSFORMERS);
    t.after(() => rmSync(beside, { recursive: true, force: true }));
    const marker = join(scratch, 'beside-imported.log');
    standIn(beside, { marker });
    const { dir } = smallRepo(t);
    assert.ok(!existsSync(join(dir, 'node_modules')), 'the fixture: the project has no node_modules');
    const out = alJson(dir, 'search', 'URL');
    assert.equal(out.level, 2, `level 2 answered (fallback: ${out.fallback})`);
    assert.ok(idRoles(out).includes('EXP-4 v1 baseline'), idRoles(out).join('\n'));
    assert.ok(importsOf(marker).length > 0, 'the stand-in beside al was imported');
    assert.ok(!out.not_known.some(saysInstall), JSON.stringify(out.not_known));
  });

  test('#212 the installed al takes the project\'s @huggingface/transformers before the one beside itself', (t) => {
    const beside = join(installed(), TRANSFORMERS);
    t.after(() => rmSync(beside, { recursive: true, force: true }));
    const besideMarker = join(scratch, 'beside-first-imported.log');
    standIn(beside, { mode: 'load-throws', marker: besideMarker });
    const { dir } = smallRepo(t);
    const projectMarker = join(dir, '.git', 'imported.log');
    installEmbedder(dir, { marker: projectMarker });
    const out = alJson(dir, 'search', 'URL');
    assert.equal(out.level, 2, `the project's stand-in answered (fallback: ${out.fallback})`);
    assert.ok(importsOf(projectMarker).length > 0, 'the project\'s stand-in was imported');
    assert.deepEqual(importsOf(besideMarker), [], 'the stand-in beside al was not imported');
  });
});
