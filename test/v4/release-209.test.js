// Issue #209 (T18): the v4 release, 0.2.0. Built from the issue's
// requirement and the public interface only: the two package.json files, the
// packed tarballs, publish.yml as a GitHub Actions file, the README texts, and
// the installed `al`. Nothing here reads src/ or packages/search/index.js
// beyond its exported createLevel2. It follows test/v4/pack.test.js: a
// scratch npm home and config, `npm pack --json`, an offline global install
// into a scratch prefix, and a hard time limit on every spawned process.
// - Versions: @assuredloop/cli and @assuredloop/search are both 0.2.0; the
//   search package is no longer private.
// - The search package is publishable: license, repository (with directory
//   packages/search), bugs, homepage, files, description, publishConfig.access
//   public; @huggingface/transformers stays pinned at exactly 4.3.1 in
//   dependencies; its own README.md and a byte-equal copy of LICENSE; npm pack
//   holds exactly package.json, index.js, README.md and LICENSE.
// - publish.yml publishes packages/search after the cli, by trusted publishing
//   (no token); the version must equal the release tag; an already published
//   version is skipped with a log line; a pre-release goes out under `next`.
// - The install: the cli tarball, the cached yaml archive and the search
//   tarball, installed together with --offline. npm ls shows both packages at
//   0.2.0 with their pinned dependencies met; al --version names 0.2.0; the
//   installed al finds the installed search package beside itself.
// - README.md: 0.2.0 is v4 and breaks 0.1.0 records; the install lines of
//   both packages; how to move from 0.1.0.
//
// No network for the install. The search package's dependencies come from the
// user's npm cache, which CI (and the developer, locally) fills first from a
// scratch copy of packages/search's package files. The install has no lock, so
// npm needs the registry metadata of each package as well as its archive. The
// install uses that cache with --offline; when the cache lacks either, npm says
// ENOTCACHED and this file fails with a "the fixture: ..." message.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { lines } from './helpers/repo.js';
import { CONCEPTS, smallRepo } from './helpers/search.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SEARCH = join(ROOT, 'packages', 'search');
const CLI = '@assuredloop/cli';
const NAME = '@assuredloop/search';
const VERSION = '0.2.0';
const YAML_VERSION = '2.9.1';
const TRANSFORMERS = '@huggingface/transformers';
const TRANSFORMERS_VERSION = '4.3.1';
const MODEL = 'Xenova/bge-small-en-v1.5';
const REVISION = 'ea104dacec62c0de699686887e3f920caeb4f3e3';
const REPO_URL = 'git+https://github.com/guwenqing/assuredloop.git';
// npm pack, npm install and al take seconds; a hang is killed.
const LIMIT = 120_000;

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const cliPkg = () => readJson(join(ROOT, 'package.json'));
const searchPkg = () => readJson(join(SEARCH, 'package.json'));
const re = (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'));

// --- versions and package.json

test('#209 @assuredloop/cli (package.json) is at 0.2.0', () => {
  assert.equal(cliPkg().name, CLI);
  assert.equal(cliPkg().version, VERSION);
});

test('#209 @assuredloop/search (packages/search/package.json) is at 0.2.0 and is not private', () => {
  const p = searchPkg();
  assert.equal(p.name, NAME);
  assert.equal(p.version, VERSION);
  assert.notEqual(p.private, true, 'packages/search/package.json should not be private');
});

test('#209 packages/search/package.json has what a published package needs: license MIT, repository with directory packages/search, bugs, homepage, files, a description, publishConfig.access public', () => {
  const p = searchPkg();
  const cli = cliPkg();
  assert.equal(p.license, 'MIT');
  assert.deepEqual(p.repository, { type: 'git', url: REPO_URL, directory: 'packages/search' });
  assert.equal(cli.repository?.url, REPO_URL, 'the fixture: the cli names the same repository');
  assert.match(p.bugs?.url ?? '', /^https:\/\/github\.com\/guwenqing\/assuredloop\/issues\b/, 'bugs.url: the repo\'s issues');
  assert.match(p.homepage ?? '', /^https:\/\/github\.com\/guwenqing\/assuredloop\b/, 'homepage: the repo on GitHub');
  assert.ok(Array.isArray(p.files) && p.files.length > 0, 'files should be a list (what npm pack takes)');
  assert.equal(typeof p.description, 'string');
  assert.ok(p.description.trim().length > 0, 'description should not be empty');
  assert.deepEqual(p.publishConfig, cli.publishConfig, 'publishConfig like the cli\'s');
  assert.equal(p.publishConfig?.access, 'public');
});

test('#209 packages/search/package.json keeps @huggingface/transformers pinned at exactly 4.3.1, in dependencies', () => {
  const p = searchPkg();
  assert.equal(p.dependencies?.[TRANSFORMERS], TRANSFORMERS_VERSION);
  assert.equal(p.devDependencies?.[TRANSFORMERS], undefined, 'not in devDependencies');
  assert.equal(p.optionalDependencies?.[TRANSFORMERS], undefined, 'not in optionalDependencies');
});

test('#209 packages/search/LICENSE is byte for byte the root LICENSE', () => {
  const lic = join(SEARCH, 'LICENSE');
  assert.ok(existsSync(lic), 'packages/search/LICENSE should exist');
  assert.ok(readFileSync(lic).equals(readFileSync(join(ROOT, 'LICENSE'))), 'packages/search/LICENSE should be the same bytes as LICENSE');
});

test('#209 packages/search/README.md says what the package is, how to install it beside al, and names the pinned model and its revision', () => {
  const f = join(SEARCH, 'README.md');
  assert.ok(existsSync(f), 'packages/search/README.md should exist');
  const md = readFileSync(f, 'utf8');
  assert.match(md, re(NAME), 'it names the package');
  assert.match(md, /\bal search\b/, 'it says what the package is for: al search');
  assert.match(md, /\blevel 2\b/i, 'it says that it is level 2 of al search');
  assert.ok(md.split('\n').some((l) => /\bnpm (install|i)\b.*(--global|-g)\b.*@assuredloop\/search\b/.test(l)
    || /\bnpm (install|i)\b.*@assuredloop\/search\b.*(--global|-g)\b/.test(l)),
  `an install line: npm install --global ... @assuredloop/search (beside al):\n${md}`);
  assert.match(md, re(MODEL), 'it names the model');
  assert.match(md, re(REVISION), 'it names the model\'s full pinned revision');
});

// --- README.md (root)

// The README cut into sections at each heading line.
const sections = (md) => md.split(/^(?=#{1,6} )/m);
const paragraphs = (md) => md.split(/\n\s*\n/);

test('#209 README.md says that 0.2.0 is v4, and that it breaks 0.1.0 records', () => {
  const md = readFileSync(join(ROOT, 'README.md'), 'utf8');
  assert.ok(paragraphs(md).some((p) => /\b0\.2\.0\b/.test(p) && /\bv4\b/.test(p)), 'one paragraph names 0.2.0 and v4');
  assert.ok(paragraphs(md).some((p) => /\b0\.1\.0\b/.test(p) && /\brecords?\b/.test(p)
    && /\b(break|breaks|does not read|cannot read|can not read|no longer reads?|not compatible|incompatible)\b/i.test(p)),
  'one paragraph says that 0.1.0 records are not read (broken) by this version');
});

test('#209 README.md gives the install lines of both packages', () => {
  const md = readFileSync(join(ROOT, 'README.md'), 'utf8');
  assert.match(md, /npm install --global @assuredloop\/cli\b/);
  assert.ok(md.split('\n').some((l) => /\bnpm (install|i)\b.*@assuredloop\/search\b/.test(l)),
    'an install line names @assuredloop/search');
});

test('#209 README.md tells an adopter how to move from 0.1.0: finish or restart an open 0.1.0 request, then run al spec --add-ids', () => {
  const md = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const found = sections(md).some((s) => {
    const at = s.search(/\b0\.1\.0\b/);
    if (at < 0) return false;
    const rest = s.slice(at);
    const fin = rest.search(/\bfinish/i);
    if (fin < 0 || !/\bopen\b/i.test(rest)) return false;
    if (!/\brestart|\bstart\b[^.]{0,30}\b(again|over)\b/i.test(rest)) return false;
    return rest.indexOf('al spec --add-ids', fin) > fin;
  });
  assert.ok(found, 'one section names 0.1.0, says to finish or restart an open request, and after that names `al spec --add-ids`');
});

// --- publish.yml: the search package's publish step, run with a stub npm

// The shape assumed: in the job of publish.yml that publishes the cli (the
// step whose run has `npm publish` and does not name packages/search), one
// or more steps handle packages/search. The one that runs `npm publish` comes
// after the cli's publish step; another (for example one tag check of both
// packages) may come before it. A step handles packages/search
// when its `working-directory` is packages/search or its `run` names
// packages/search. These steps have no `if:`; together they check the tag
// against packages/search/package.json, ask `npm view` whether the version is
// on npm, and run `npm publish` in packages/search (or name it). They read the
// tag and the pre-release flag from github.event.release.tag_name and
// github.event.release.prerelease, through `env:` or in the script.
//
// The test runs those steps in order, as GitHub runs a bash step
// (`bash --noprofile --norc -eo pipefail`), in a scratch copy of the package
// files, with a stub `npm` first on PATH. The stub logs each call (cwd and
// arguments). `npm view` (or info, show, v) of the package under test
// (@assuredloop/search here, @assuredloop/cli for the cli's steps below)
// answers as npm does: the version (JSON-quoted with --json) and exit 0 when
// it is published; E404 and exit 1 when it is not. The package under test is
// the one an argument names, or else the package.json of the cwd. `npm
// publish` prints a line and exits 0. Any other npm command goes to the real
// npm.
const WF = join(ROOT, '.github', 'workflows', 'publish.yml');

const isSearch = (s) => /(^|\/)packages\/search\/?$/.test(String(s?.['working-directory'] ?? '').replace(/^\.\//, ''))
  || /packages\/search\b/.test(String(s?.run ?? ''));
const isCliPublish = (s) => /\bnpm publish\b/.test(String(s?.run ?? '')) && !isSearch(s);

function publishJob() {
  const wf = parseYaml(readFileSync(WF, 'utf8'));
  const jobs = Object.entries(wf?.jobs ?? {});
  const found = jobs.find(([, j]) => (j.steps ?? []).some(isCliPublish));
  assert.ok(found, 'the fixture: publish.yml has a job with the cli\'s npm publish step');
  return found;
}

function searchSteps() {
  const wf = parseYaml(readFileSync(WF, 'utf8'));
  const jobs = Object.entries(wf?.jobs ?? {});
  const found = jobs.find(([, j]) => (j.steps ?? []).some(isCliPublish));
  assert.ok(found, 'the fixture: publish.yml has a job with the cli\'s npm publish step');
  const [id, job] = found;
  const steps = job.steps;
  const cliAt = steps.findIndex(isCliPublish);
  const mine = steps.map((s, i) => ({ s, i })).filter(({ s }) => isSearch(s));
  assert.ok(mine.length > 0, `job ${id} of publish.yml should have a step that publishes packages/search (working-directory packages/search, or a run that names packages/search)`);
  for (const { s, i } of mine) {
    if (/\bnpm publish\b/.test(String(s.run ?? ''))) {
      assert.ok(i > cliAt, `the search step "${s.name ?? i}" runs npm publish, so it should come after the cli's publish step`);
    }
    assert.equal(s.if, undefined, `this test assumes the search steps have no if: ("${s.name ?? i}")`);
    assert.equal(typeof s.run, 'string', `the search step "${s.name ?? i}" should be a run step`);
  }
  return { id, job, steps: mine.map(({ s }) => s) };
}

test('#209 publish.yml: the search package is published in the same trusted-publishing job as the cli, after it, with no token', () => {
  const { id, job, steps } = searchSteps();
  assert.equal(job.permissions?.['id-token'], 'write', `job ${id}: id-token: write (npm trusted publishing)`);
  const text = JSON.stringify(steps);
  assert.ok(!/secrets\./.test(text), 'the search steps use no secret');
  assert.ok(!/NODE_AUTH_TOKEN|NPM_TOKEN/.test(text), 'the search steps set no npm token');
  assert.ok(steps.some((s) => /\bnpm publish\b/.test(s.run)), 'a search step runs npm publish');
});

// A scratch copy of what the steps may read: the root package.json, LICENSE
// and README.md, and packages/search without node_modules or test/.
function workspace(dir) {
  const ws = join(dir, 'ws');
  mkdirSync(join(ws, 'packages', 'search'), { recursive: true });
  for (const f of ['package.json', 'package-lock.json', 'LICENSE', 'README.md']) {
    if (existsSync(join(ROOT, f))) copyFileSync(join(ROOT, f), join(ws, f));
  }
  for (const f of readdirSync(SEARCH)) {
    if (f !== 'node_modules' && f !== 'test') copyFileSync(join(SEARCH, f), join(ws, 'packages', 'search', f));
  }
  return realpathSync(ws);
}

// The stub npm, written as a node script.
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

// Runs the search steps (or the given `steps`) for one release, with the stub
// answering `npm view` of package `name` at `version`; stops at the first step
// that fails, as GitHub does. Returns the exit code, the output and the npm
// calls.
// `searchVersion`, when set, replaces the version in the scratch copy of
// packages/search/package.json.
function runSteps(t, {
  tag, prerelease, view, steps = searchSteps().steps, name = NAME, version = searchPkg().version, searchVersion,
}) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'al4-publish-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const ws = workspace(dir);
  if (searchVersion !== undefined) {
    const pj = join(ws, 'packages', 'search', 'package.json');
    writeFileSync(pj, `${JSON.stringify({ ...readJson(pj), version: searchVersion }, null, 2)}\n`);
  }
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
  for (const [i, s] of steps.entries()) {
    const stepEnv = {};
    for (const [k, v] of Object.entries(s.env ?? {})) stepEnv[k] = expr(v);
    const script = expr(s.run);
    const left = `${JSON.stringify(stepEnv)}\n${script}`.match(/\$\{\{[^}]*\}\}/);
    assert.equal(left, null, `the search step "${s.name ?? i}" uses an expression this test does not know: ${left?.[0]}`);
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
        STUB_LOG: log, STUB_VIEW: view, STUB_NAME: name, STUB_VERSION: version, REAL_NPM,
        ...stepEnv,
      },
    });
    assert.equal(r.signal, null, `the search step "${s.name ?? i}" was killed (signal ${r.signal}):\n${r.stdout}\n${r.stderr}`);
    out += `${r.stdout}\n${r.stderr}\n`;
    code = r.status;
    if (code !== 0) break;
  }
  const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const searchDir = join(ws, 'packages', 'search');
  const publishes = calls.filter((c) => c.args.find((a) => !a.startsWith('-')) === 'publish');
  const inSearch = (c) => c.cwd === searchDir
    || c.args.some((a) => !a.startsWith('-') && a !== 'publish' && (resolve(c.cwd, a) === searchDir || /assuredloop-search-.*\.tgz$/.test(a)));
  // A publish of the repo root: in the root, naming no folder or the root.
  const inRoot = (c) => c.args.filter((a) => !a.startsWith('-') && a !== 'publish' && !/^(next|latest|public)$/.test(a))
    .every((a) => resolve(c.cwd, a) === ws) && c.cwd === ws;
  return { code, out, calls, searchPublishes: publishes.filter(inSearch), rootPublishes: publishes.filter(inRoot) };
}

const show = (r) => `exit ${r.code}\n--- output\n${r.out}--- npm calls\n${r.calls.map((c) => `${c.cwd}: npm ${c.args.join(' ')}`).join('\n')}`;

test('#209 publish.yml, the search step: a release tag that is not v<packages/search version> stops it, with a message, and nothing is published', (t) => {
  const tag = 'v9.9.9';
  assert.notEqual(`v${searchPkg().version}`, tag, 'the fixture: the tag differs from the version');
  const r = runSteps(t, { tag, prerelease: false, view: 'not-published' });
  assert.notEqual(r.code, 0, `a tag mismatch should fail:\n${show(r)}`);
  assert.deepEqual(r.searchPublishes, [], `no npm publish of packages/search:\n${show(r)}`);
  assert.match(r.out, /v?9\.9\.9|\b0\.2\.0\b/, `the message names the tag or the version:\n${show(r)}`);
});

test('#209 publish.yml, the search step: a version already on npm is skipped with a log line, exit 0, no npm publish', (t) => {
  const r = runSteps(t, { tag: `v${searchPkg().version}`, prerelease: false, view: 'published' });
  assert.equal(r.code, 0, `an already published version should not fail the run:\n${show(r)}`);
  assert.deepEqual(r.searchPublishes, [], `no npm publish of packages/search:\n${show(r)}`);
  assert.ok(r.calls.some((c) => ['view', 'info', 'show', 'v'].includes(c.args.find((a) => !a.startsWith('-')))),
    `it asks npm whether the version is published:\n${show(r)}`);
  assert.match(r.out, /skip/i, `a log line says it is skipped:\n${show(r)}`);
});

test('#209 publish.yml, the search step: a version not on npm is published in packages/search (a full release: not under next)', (t) => {
  const r = runSteps(t, { tag: `v${searchPkg().version}`, prerelease: false, view: 'not-published' });
  assert.equal(r.code, 0, show(r));
  assert.equal(r.searchPublishes.length, 1, `one npm publish of packages/search:\n${show(r)}`);
  assert.ok(!r.searchPublishes[0].args.some((a) => /\bnext\b/.test(a)), `a full release is not tagged next:\n${show(r)}`);
});

test('#209 publish.yml, the search step: a pre-release is published in packages/search with --tag next, as the cli is', (t) => {
  const r = runSteps(t, { tag: `v${searchPkg().version}`, prerelease: true, view: 'not-published' });
  assert.equal(r.code, 0, show(r));
  assert.equal(r.searchPublishes.length, 1, `one npm publish of packages/search:\n${show(r)}`);
  const a = r.searchPublishes[0].args;
  const i = a.indexOf('--tag');
  assert.ok((i >= 0 && a[i + 1] === 'next') || a.includes('--tag=next'), `npm publish --tag next:\n${show(r)}`);
});

// --- publish.yml: the cli's steps also skip a version already on npm, so a
// re-run after the cli went out and the search publish failed reaches the
// search package.
//
// The cli's steps: the run steps of the publish job after the
// actions/setup-node step, up to and including the cli's publish step (so a
// tag check before it, of the cli alone or of both packages, runs too). They
// have no `if:`. They run with the same
// stub npm, which answers `npm view` of @assuredloop/cli at package.json's
// version. A publish of the repo root is an `npm publish` in the root that
// names no other folder.
function cliSteps() {
  const [id, job] = publishJob();
  const steps = job.steps;
  const setup = steps.findIndex((s) => /^actions\/setup-node@/.test(String(s.uses ?? '')));
  assert.ok(setup >= 0, `the fixture: job ${id} of publish.yml has an actions/setup-node step`);
  const cliAt = steps.findIndex(isCliPublish);
  assert.ok(cliAt > setup, `the fixture: job ${id} runs the cli's npm publish after actions/setup-node`);
  const mine = steps.slice(setup + 1, cliAt + 1).filter((s) => s.run !== undefined);
  for (const [i, s] of mine.entries()) assert.equal(s.if, undefined, `this test assumes the cli steps have no if: ("${s.name ?? i}")`);
  return mine;
}
const runCli = (t, opts) => runSteps(t, { ...opts, steps: cliSteps(), name: CLI, version: cliPkg().version });

// Every run step of the publish job after actions/setup-node, in order.
function jobSteps() {
  const [id, job] = publishJob();
  const setup = job.steps.findIndex((s) => /^actions\/setup-node@/.test(String(s.uses ?? '')));
  assert.ok(setup >= 0, `the fixture: job ${id} of publish.yml has an actions/setup-node step`);
  const mine = job.steps.slice(setup + 1).filter((s) => s.run !== undefined);
  for (const [i, s] of mine.entries()) assert.equal(s.if, undefined, `this test assumes the publish job's steps have no if: ("${s.name ?? i}")`);
  return mine;
}

test('#209 publish.yml, the whole publish job: a packages/search version that is not the tag (0.2.1, tag v0.2.0) stops it before any npm publish, with a message', (t) => {
  const tag = `v${cliPkg().version}`;
  const searchVersion = '0.2.1';
  assert.notEqual(`v${searchVersion}`, tag, 'the fixture: the search version differs from the tag');
  const r = runSteps(t, { tag, prerelease: false, view: 'not-published', steps: jobSteps(), name: CLI, version: cliPkg().version, searchVersion });
  const publishes = r.calls.filter((c) => c.args.find((a) => !a.startsWith('-')) === 'publish');
  assert.notEqual(r.code, 0, `a packages/search version that is not the tag should fail:\n${show(r)}`);
  assert.deepEqual(publishes, [], `no npm publish at all, of the cli or of packages/search:\n${show(r)}`);
  assert.match(r.out, /\b0\.2\.1\b|\bv0\.2\.0\b/, `the message names packages/search's version or the tag:\n${show(r)}`);
});

test('#209 publish.yml, the cli steps: a version already on npm is skipped with a log line, exit 0, no npm publish of the root', (t) => {
  const r = runCli(t, { tag: `v${cliPkg().version}`, prerelease: false, view: 'published' });
  assert.equal(r.code, 0, `an already published cli version should not fail the run:\n${show(r)}`);
  assert.deepEqual(r.rootPublishes, [], `no npm publish of the repo root:\n${show(r)}`);
  assert.ok(r.calls.some((c) => ['view', 'info', 'show', 'v'].includes(c.args.find((a) => !a.startsWith('-')))),
    `it asks npm whether the version is published:\n${show(r)}`);
  assert.match(r.out, /skip/i, `a log line says it is skipped:\n${show(r)}`);
});

test('#209 publish.yml, the cli steps: a version not on npm is published in the root (a full release: not under next)', (t) => {
  const r = runCli(t, { tag: `v${cliPkg().version}`, prerelease: false, view: 'not-published' });
  assert.equal(r.code, 0, show(r));
  assert.equal(r.rootPublishes.length, 1, `one npm publish of the repo root:\n${show(r)}`);
  assert.ok(!r.rootPublishes[0].args.some((a) => /\bnext\b/.test(a)), `a full release is not tagged next:\n${show(r)}`);
});

test('#209 publish.yml, the cli steps: a pre-release not on npm is published in the root with --tag next', (t) => {
  const r = runCli(t, { tag: `v${cliPkg().version}`, prerelease: true, view: 'not-published' });
  assert.equal(r.code, 0, show(r));
  assert.equal(r.rootPublishes.length, 1, `one npm publish of the repo root:\n${show(r)}`);
  const a = r.rootPublishes[0].args;
  const i = a.indexOf('--tag');
  assert.ok((i >= 0 && a[i + 1] === 'next') || a.includes('--tag=next'), `npm publish --tag next:\n${show(r)}`);
});

// --- the packed search package, and the offline install of both packages

describe('#209 the packed packages, installed together with no network', () => {
  // The scratch folder (npm's home, cache and config, the tarballs, the
  // global prefix), the files npm pack listed for packages/search, and the
  // global prefix.
  let scratch, searchPacked, prefix;

  // The environment without anything that points git at another repo or
  // config, or npm at the user's home, cache or config or at a parent npm run.
  // `extra` replaces entries.
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
  // tried to download the model would fail, not download it.
  const NO_NET = { NODE_USE_ENV_PROXY: '1', HTTPS_PROXY: 'http://127.0.0.1:9', HTTP_PROXY: 'http://127.0.0.1:9', NO_PROXY: '' };

  // The installed al (the link npm put in <prefix>/bin) run with `args` in
  // `cwd`, with no network: exit 0; its stdout.
  function al(cwd, ...args) {
    const bin = join(prefix, 'bin', 'al');
    assert.ok(existsSync(bin), `npm install --global should put al in ${join(prefix, 'bin')}`);
    const r = run(bin, args, cwd, NO_NET);
    assert.equal(r.code, 0, `the installed al ${args.join(' ')} should exit 0:\n${r.both}`);
    return r.stdout;
  }
  const alJson = (cwd, ...args) => {
    const out = al(cwd, ...args, '--json');
    try { return JSON.parse(out); } catch { return assert.fail(`al ${args.join(' ')} --json gives one JSON object:\n${out}`); }
  };
  const idRoles = (out) => out.hits.map((h) => `${h.id} v${h.version} ${h.role}`);

  before(() => {
    scratch = mkdtempSync(join(realpathSync(tmpdir()), 'al4-release-'));
    mkdirSync(join(scratch, 'home'));

    const c = run('npm', ['pack', '--json', '--pack-destination', scratch], ROOT);
    assert.equal(c.code, 0, `npm pack should succeed in the repo:\n${c.both}`);
    const cliTgz = join(scratch, JSON.parse(c.stdout)[0].filename);

    const s = run('npm', ['pack', '--json', '--pack-destination', scratch], SEARCH);
    assert.equal(s.code, 0, `npm pack should succeed in packages/search:\n${s.both}`);
    const [sInfo] = JSON.parse(s.stdout);
    searchPacked = sInfo.files.map((f) => f.path);
    const searchTgz = join(scratch, sInfo.filename);

    // The pinned yaml: the registry's own archive from the user's npm cache,
    // as pack.test.js gets it.
    const lock = readJson(join(ROOT, 'package-lock.json'));
    const lockYaml = lock.packages['node_modules/yaml'];
    assert.equal(lockYaml?.version, YAML_VERSION, 'the fixture: package-lock.json pins yaml 2.9.1');
    const y = spawnSync('npm', ['pack', '--offline', '--json', '--ignore-scripts', '--pack-destination', scratch, lockYaml.resolved],
      { cwd: scratch, input: '', encoding: 'utf8', timeout: LIMIT });
    assert.equal(y.signal, null, `npm pack of the cached yaml was killed:\n${y.stderr}`);
    assert.equal(y.status, 0, `the fixture: npm's cache holds the pinned yaml archive ${lockYaml.resolved} (run npm ci first):\n${y.stdout}\n${y.stderr}`);
    const yamlTgz = join(scratch, JSON.parse(y.stdout)[0].filename);
    assert.equal(`sha512-${createHash('sha512').update(readFileSync(yamlTgz)).digest('base64')}`, lockYaml.integrity,
      'the fixture: the yaml archive is the release that package-lock.json pins, byte for byte');

    // The user's npm cache (the one npm ci filled), asked with the user's config.
    const k = spawnSync('npm', ['config', 'get', 'cache'], { cwd: scratch, input: '', encoding: 'utf8', timeout: LIMIT });
    assert.equal(k.status, 0, `npm config get cache:\n${k.stderr}`);
    const userCache = k.stdout.trim();

    prefix = join(scratch, 'prefix');
    const i = run('npm', ['install', '--global', '--prefix', prefix, '--offline', '--ignore-scripts', '--no-audit', '--no-fund',
      cliTgz, yamlTgz, searchTgz], scratch, { npm_config_cache: userCache });
    assert.ok(!(i.code !== 0 && /ENOTCACHED/.test(i.both)),
      `the fixture: npm's cache (${userCache}) holds the search package's dependencies, their archives and their registry metadata. Fill it from a scratch copy of packages/search's package files, as CI does (npm ci caches the archives only; npm install --ignore-scripts --no-package-lock on a copy of package.json caches both):\n${i.both}`);
    assert.equal(i.code, 0, `npm install --global --offline of the cli tarball, yaml and the search tarball should succeed with no network:\n${i.both}`);
  });

  after(() => { if (scratch) rmSync(scratch, { recursive: true, force: true }); });

  test('#209 npm pack of packages/search holds exactly package.json, index.js, README.md and LICENSE (no test/, no package-lock.json)', () => {
    assert.ok(existsSync(join(SEARCH, 'test')), 'the fixture: packages/search has test/');
    assert.ok(existsSync(join(SEARCH, 'package-lock.json')), 'the fixture: packages/search has package-lock.json');
    assert.deepEqual([...searchPacked].sort(), ['LICENSE', 'README.md', 'index.js', 'package.json']);
  });

  test('#209 npm ls --global: @assuredloop/search 0.2.0 with @huggingface/transformers 4.3.1, and @assuredloop/cli 0.2.0 with yaml 2.9.1, all met', () => {
    const r = run('npm', ['ls', '--global', '--prefix', prefix, '--all', '--json'], scratch);
    assert.equal(r.code, 0, `npm ls --global should find no missing or invalid dependency:\n${r.both.slice(0, 4000)}`);
    const deps = JSON.parse(r.stdout).dependencies ?? {};
    assert.equal(deps[NAME]?.version, VERSION, `${NAME} ${VERSION} is installed`);
    assert.equal(deps[NAME]?.dependencies?.[TRANSFORMERS]?.version, TRANSFORMERS_VERSION, `${NAME} depends on ${TRANSFORMERS} ${TRANSFORMERS_VERSION}`);
    assert.equal(deps[CLI]?.version, VERSION, `${CLI} ${VERSION} is installed`);
    assert.equal(deps[CLI]?.dependencies?.yaml?.version, YAML_VERSION, `${CLI} depends on yaml ${YAML_VERSION}`);
  });

  test('#209 the installed al --version: the first line names 0.2.0', () => {
    const elsewhere = join(scratch, 'elsewhere');
    mkdirSync(elsewhere, { recursive: true });
    assert.match(lines(al(elsewhere, '--version'))[0], /^al 0\.2\.0\b/);
  });

  test('#209 the installed al finds the installed @assuredloop/search beside itself: al search --level 2 --id EXP-4 answers at level 2, names the model, and downloads nothing', (t) => {
    const { dir } = smallRepo(t);
    assert.ok(!existsSync(join(dir, 'node_modules')), 'the fixture: the project has no node_modules');
    const out = alJson(dir, 'search', '--level', '2', '--id', 'EXP-4');
    assert.equal(out.level, 2, `level 2 answered (fallback: ${out.fallback})`);
    assert.equal(out.fallback, null);
    assert.equal(out.hits[0]?.id, 'EXP-4', idRoles(out).join('\n'));
    const text = al(dir, 'search', '--level', '2', '--id', 'EXP-4');
    assert.match(text.split('\n')[0], new RegExp(`^Level\\s+2\\b.*${MODEL.replace(/[./]/g, '\\$&')}`), text);
    assert.ok(!/^Fallback\b/m.test(text), text);
    // No model file came: the run embedded nothing.
    const onnx = spawnSync('find', [prefix, join(scratch, 'home'), dir, '-name', '*.onnx'], { encoding: 'utf8', timeout: LIMIT });
    assert.equal(onnx.stdout.trim(), '', 'no model was downloaded');
  });

  test('#209 the installed al with a project package made by the installed createLevel2 and the fixed test embedder: al search URL answers at level 2 with that model and finds EXP-4 by meaning', (t) => {
    const { dir } = smallRepo(t);
    const installed = join(prefix, 'lib', 'node_modules', NAME, 'index.js');
    assert.ok(existsSync(installed), `${installed} should exist`);
    // installEmbedder of helpers/search.js, with createLevel2 from the
    // installed package instead of the repo's packages/search.
    const pkg = join(dir, 'node_modules', '@assuredloop', 'search');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, 'package.json'), `${JSON.stringify({
      name: NAME, version: '0.0.0-test', private: true, type: 'module', exports: './index.js',
    }, null, 2)}\n`);
    writeFileSync(join(pkg, 'index.js'), [
      `import { createLevel2 } from ${JSON.stringify(pathToFileURL(installed).href)};`,
      `const CONCEPTS = ${JSON.stringify(CONCEPTS)}.map((s) => new RegExp(s, 'i'));`,
      'const vector = (t) => [...CONCEPTS.map((re) => (re.test(t) ? 1 : 0)), 0.1];',
      "export default createLevel2({ model: 'test-fixed', embed: async (texts) => texts.map(vector) });",
      '',
    ].join('\n'));
    assert.deepEqual(alJson(dir, 'search', 'URL', '--level', '1').hits, [], 'the fixture: at level 1 no row has the word');
    const out = alJson(dir, 'search', 'URL');
    assert.equal(out.level, 2, `level 2 answered (fallback: ${out.fallback})`);
    assert.equal(out.fallback, null);
    assert.ok(idRoles(out).includes('EXP-4 v1 baseline'), idRoles(out).join('\n'));
    const text = al(dir, 'search', 'URL');
    assert.match(text.split('\n')[0], /^Level\s+2\b.*test-fixed/, text);
  });
});
