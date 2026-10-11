// al --version and al -v (#196, T17). Written from the requirement of issue
// #196, not from the code: the command reads no project, works outside a git
// repo, and names the version, the commit and the install folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { BIN, commitAll, git, project, tree, write } from './helpers/project.js';

// The install folder: the folder that holds bin/ and package.json, real path.
const INSTALL = realpathSync(dirname(dirname(BIN)));
const VERSION = JSON.parse(readFileSync(join(INSTALL, 'package.json'), 'utf8')).version;

function cleanEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith('GIT_') && k !== 'SOURCE_DATE_EPOCH') env[k] = v;
  }
  return { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
}

// One run of `node <bin> ...args` in cwd.
function run(cwd, args, bin = BIN) {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, env: cleanEnv(), input: '', encoding: 'utf8', timeout: 30_000 });
  return { code: r.status, signal: r.signal, stdout: r.stdout ?? '', stderr: r.stderr ?? '', args };
}
const show = (r) => `al ${r.args.join(' ')} -> exit ${r.code} (signal ${r.signal})\n--- stdout\n${r.stdout}--- stderr\n${r.stderr}`;
const outLines = (stdout) => stdout.replace(/\n+$/, '').split('\n');

// The line for an install folder that is the top of a git checkout.
const checkoutLine = (version, commit, folder) => `al ${version} · ${commit.slice(0, 7)} · ${folder}`;
const notCheckoutLine = (version, folder) => `al ${version} · not a git checkout: ${folder}`;

function tempDir(t) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-version-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// A copy of the install (bin/, src/, package.json with its own version) in
// folder, with node_modules linked to this repo's. Returns the copied binary.
function installCopy(folder, version) {
  mkdirSync(join(folder, 'bin'), { recursive: true });
  cpSync(BIN, join(folder, 'bin', basename(BIN)));
  cpSync(join(INSTALL, 'src'), join(folder, 'src'), { recursive: true });
  const pkg = JSON.parse(readFileSync(join(INSTALL, 'package.json'), 'utf8'));
  writeFileSync(join(folder, 'package.json'), JSON.stringify({ ...pkg, version }, null, 2) + '\n');
  symlinkSync(join(INSTALL, 'node_modules'), join(folder, 'node_modules'));
  return join(folder, 'bin', basename(BIN));
}

function assertEndsWithNextAndNotKnown(r) {
  const ls = outLines(r.stdout);
  assert.ok(ls.length >= 3, `output too short:\n${show(r)}`);
  assert.match(ls.at(-2), /^Next {6}\S/, `second last line should be Next:\n${show(r)}`);
  assert.match(ls.at(-1), /^Not known \S/, `last line should be Not known:\n${show(r)}`);
}

const expected = () => checkoutLine(VERSION, git(INSTALL, 'rev-parse', 'HEAD'), INSTALL);

for (const flag of ['--version', '-v']) {
  test(`${flag} outside a git repo: exit 0, first line is al <version> · <commit> · <install folder>`, (t) => {
    const dir = tempDir(t);
    const r = run(dir, [flag]);
    assert.equal(r.code, 0, show(r));
    assert.equal(outLines(r.stdout)[0], expected(), show(r));
  });

  test(`${flag} inside a git repo: the same first line, from the install folder and not from the repo`, (t) => {
    const dir = project(t);
    write(dir, 'README.md', 'other repo\n');
    commitAll(dir, 'other');
    const r = run(dir, [flag]);
    assert.equal(r.code, 0, show(r));
    assert.equal(outLines(r.stdout)[0], expected(), show(r));
  });

  test(`${flag} ends with a Next line and then a Not known line`, (t) => {
    const r = run(tempDir(t), [flag]);
    assert.equal(r.code, 0, show(r));
    assertEndsWithNextAndNotKnown(r);
  });
}

test('--version reads no project: a config.yaml that does not parse does not stop it, and nothing is written', (t) => {
  const dir = project(t);
  write(dir, '.assuredloop/config.yaml', 'docs: [\n  - {file: specs/a.md\n');
  write(dir, 'specs/a.md', '# A\n\nUnmarked text.\n');
  commitAll(dir, 'a broken project');
  const before = tree(dir);
  const r = run(dir, ['--version']);
  assert.equal(r.code, 0, show(r));
  assert.equal(outLines(r.stdout)[0], expected(), show(r));
  assert.deepEqual(tree(dir), before, `--version writes nothing:\n${show(r)}`);
});

test('--version names the version of the install folder package.json and its own commit, when the install folder is a checkout top', (t) => {
  const dir = project(t);
  const bin = installCopy(dir, '9.8.7-test');
  const head = commitAll(dir, 'an install that is a checkout');
  const r = run(tempDir(t), ['--version'], bin);
  assert.equal(r.code, 0, show(r));
  assert.equal(outLines(r.stdout)[0], checkoutLine('9.8.7-test', head, dir), show(r));
  assertEndsWithNextAndNotKnown(r);
});

test('--version says "not a git checkout" when the install folder is in no git repo', (t) => {
  const folder = join(tempDir(t), 'install');
  const bin = installCopy(folder, '9.8.7-test');
  const r = run(tempDir(t), ['--version'], bin);
  assert.equal(r.code, 0, show(r));
  assert.equal(outLines(r.stdout)[0], notCheckoutLine('9.8.7-test', folder), show(r));
  assertEndsWithNextAndNotKnown(r);
});

test('--version says "not a git checkout" when the install folder is inside a git repo but not its top', (t) => {
  const dir = project(t);
  const folder = join(dir, 'tools', 'al');
  const bin = installCopy(folder, '9.8.7-test');
  commitAll(dir, 'an install below the top');
  const r = run(tempDir(t), ['-v'], bin);
  assert.equal(r.code, 0, show(r));
  assert.equal(outLines(r.stdout)[0], notCheckoutLine('9.8.7-test', folder), show(r));
});
