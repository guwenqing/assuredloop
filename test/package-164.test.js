// Issue #164, the npm package @assuredloop/cli; the command stays `al`. Built
// from the issue (tier 0, no spec change); nothing here reads the code under
// test. The pack and install checks are in pack.test.js.
// (1) package.json: name @assuredloop/cli, version 0.1.0, not private,
//     license MIT, a description, repository, bugs and homepage at
//     guwenqing/assuredloop, publishConfig.access public, "files" exactly
//     bin/, src/, skills/, README.md, LICENSE; it keeps type module, bin.al
//     bin/al.js and engines.node >=24.
// (2) LICENSE: MIT, "Copyright (c) 2026 Wenqing Gu".
// (3) al --version prints 0.1.0 from package.json; from a clone it still adds
//     the commit: "al 0.1.0 · <sha7 of HEAD> · <repo folder>".
// (5) README's Install says `npm install --global @assuredloop/cli`, with
//     @<version> to pin, and where the installed package carries the skill:
//     $(npm root -g)/@assuredloop/cli/skills/assuredloop/SKILL.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, tempDir } from './helpers/fixture.js';
import { lines } from './helpers/output.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO = 'github.com/guwenqing/assuredloop';

const pkg = () => JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
// A package.json URL field, given as a string or as { url }.
const url = (field) => (typeof field === 'string' ? field : field?.url) ?? '';

test('#164 (1) package.json: name @assuredloop/cli, version 0.1.0, not private, license MIT, a description, publishConfig.access public', () => {
  const p = pkg();
  assert.equal(p.name, '@assuredloop/cli');
  assert.equal(p.version, '0.1.0');
  assert.equal(p.private, undefined, 'package.json should have no "private"');
  assert.equal(p.license, 'MIT');
  assert.ok(typeof p.description === 'string' && p.description.trim() !== '', 'package.json should have a description');
  assert.equal(p.publishConfig?.access, 'public');
});

test('#164 (1) package.json: repository, bugs and homepage at guwenqing/assuredloop', () => {
  const p = pkg();
  assert.match(url(p.repository), /guwenqing\/assuredloop\b/, `repository: ${JSON.stringify(p.repository)}`);
  assert.ok(url(p.bugs).includes(REPO), `bugs: ${JSON.stringify(p.bugs)}`);
  assert.ok(url(p.homepage).includes(REPO), `homepage: ${JSON.stringify(p.homepage)}`);
});

test('#164 (1) package.json: "files" is exactly bin/, src/, skills/, README.md, LICENSE', () => {
  assert.deepEqual([...(pkg().files ?? [])].sort(), ['LICENSE', 'README.md', 'bin/', 'skills/', 'src/']);
});

test('#164 (1) package.json keeps type module, bin.al bin/al.js and engines.node >=24', () => {
  const p = pkg();
  assert.equal(p.type, 'module');
  assert.deepEqual(p.bin, { al: 'bin/al.js' });
  assert.equal(p.engines?.node, '>=24');
});

test('#164 (2) LICENSE is the MIT License, "Copyright (c) 2026 Wenqing Gu"', () => {
  const text = readFileSync(join(ROOT, 'LICENSE'), 'utf8');
  assert.match(text, /^MIT License$/m);
  assert.match(text, /^Copyright \(c\) 2026 Wenqing Gu$/m);
  assert.ok(text.includes('Permission is hereby granted, free of charge'), 'the MIT grant');
  assert.ok(text.includes('THE SOFTWARE IS PROVIDED "AS IS"'), 'the MIT disclaimer');
});

test('#164 (3) from this repo, a clone at the top of its git checkout, al --version and al -v print "al 0.1.0 · <sha7 of HEAD> · <repo folder>", then Next and Not known', (t) => {
  const top = realpathSync(ROOT);
  assert.equal(git(ROOT, ['rev-parse', '--show-toplevel']), top, 'the fixture: the repo folder is the top of a git checkout');
  const sha = git(ROOT, ['rev-parse', 'HEAD']).slice(0, 7);
  const elsewhere = join(tempDir(t), 'elsewhere');
  mkdirSync(elsewhere);
  const e = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) e[k] = v;
  for (const flag of ['--version', '-v']) {
    const r = spawnSync(process.execPath, [join(ROOT, 'bin', 'al.js'), flag],
      { cwd: elsewhere, env: { ...e, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }, encoding: 'utf8' });
    assert.equal(r.status, 0, `al ${flag} should exit 0:\n${r.stdout}\n${r.stderr}`);
    const ls = lines(r.stdout);
    assert.equal(ls[0], `al 0.1.0 · ${sha} · ${top}`);
    assert.match(ls.at(-2), /^Next/, `second last line should start with Next:\n${r.stdout}`);
    assert.match(ls.at(-1), /^Not known/, `last line should start with Not known:\n${r.stdout}`);
  }
});

test('#164 (5) README.md\'s Install names npm install --global @assuredloop/cli, with @<version> to pin, and the installed skill @assuredloop/cli/skills/assuredloop/SKILL.md', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const at = readme.search(/^## Install\s*$/m);
  assert.ok(at >= 0, 'README.md should have an "## Install" section');
  const rest = readme.slice(at + 1);
  const end = rest.search(/^## /m);
  const install = end < 0 ? rest : rest.slice(0, end);
  assert.ok(install.includes('npm install --global @assuredloop/cli'), `Install should say npm install --global @assuredloop/cli:\n${install}`);
  assert.match(install, /@assuredloop\/cli@\d+\.\d+\.\d+/, `Install should say how to pin a version:\n${install}`);
  assert.ok(install.includes('@assuredloop/cli/skills/assuredloop/SKILL.md'), `Install should say where the installed package carries the skill:\n${install}`);
});
