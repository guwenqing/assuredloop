// loadResults from src/v4/results.js: the result files and their problems (#175).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { REPO, project, write, writeConfig } from './helpers/project.js';

const load = async () => (await import(pathToFileURL(join(REPO, 'src/v4/results.js')).href)).loadResults;
const DIR = '.assuredloop/results';
const H = 'c'.repeat(64);
const GOOD = [
  'check: test/export-link.test.js',
  'outcome: pass',
  'commit: a81c3f2',
  'inputs:',
  `  - {file: src/export-link.js, sha256: ${H}}`,
  'by: reviewer-12',
  'source: https://example.com/runs/1',
  'note: ran on CI',
  '',
].join('\n');

test('loadResults reads each result file with its fields and no problems', async (t) => {
  const loadResults = await load();
  const dir = project(t);
  write(dir, `${DIR}/export-link.yaml`, GOOD);
  assert.deepEqual(await loadResults(dir), [{
    file: `${DIR}/export-link.yaml`,
    check: 'test/export-link.test.js',
    outcome: 'pass',
    commit: 'a81c3f2',
    inputs: [{ file: 'src/export-link.js', sha256: H }],
    by: 'reviewer-12',
    source: 'https://example.com/runs/1',
    note: 'ran on CI',
    problems: [],
  }]);
});

test('loadResults sorts by file, reads only *.yaml, and takes outcome fail and not run and commit unknown', async (t) => {
  const loadResults = await load();
  const dir = project(t);
  write(dir, `${DIR}/b.yaml`, 'check: b\noutcome: not run\ncommit: unknown\n');
  write(dir, `${DIR}/a.yaml`, `check: a\noutcome: fail\ncommit: ${'d'.repeat(40)}\n`);
  write(dir, `${DIR}/notes.txt`, 'not a result\n');
  const results = await loadResults(dir);
  assert.deepEqual(results.map((r) => r.file), [`${DIR}/a.yaml`, `${DIR}/b.yaml`]);
  assert.deepEqual(results.map((r) => [r.check, r.outcome, r.commit, r.problems]),
    [['a', 'fail', 'd'.repeat(40), []], ['b', 'not run', 'unknown', []]]);
});

test('loadResults gives [] when there is no results folder', async (t) => {
  const loadResults = await load();
  const dir = project(t);
  assert.deepEqual(await loadResults(dir), []);
});

test('loadResults reads the folder named by config results:', async (t) => {
  const loadResults = await load();
  const dir = project(t);
  writeConfig(dir, [], { results: 'out/results' });
  write(dir, 'out/results/x.yaml', GOOD);
  write(dir, `${DIR}/ignored.yaml`, GOOD);
  const results = await loadResults(dir);
  assert.deepEqual(results.map((r) => r.file), ['out/results/x.yaml']);
  assert.deepEqual(results[0].problems, []);
});

test('loadResults lists each break of the format as a problem', async (t) => {
  const loadResults = await load();
  const dir = project(t);
  const bad = {
    'no-check': 'outcome: pass\ncommit: a81c3f2\n',
    'no-outcome': 'check: x\ncommit: a81c3f2\n',
    'no-commit': 'check: x\noutcome: pass\n',
    'other-outcome': 'check: x\noutcome: passed\ncommit: a81c3f2\n',
    'short-commit': 'check: x\noutcome: pass\ncommit: a81c3f\n',
    'long-commit': `check: x\noutcome: pass\ncommit: ${'a'.repeat(41)}\n`,
    'not-hex-commit': 'check: x\noutcome: pass\ncommit: main-branch\n',
    'input-no-file': `check: x\noutcome: pass\ncommit: a81c3f2\ninputs:\n  - {sha256: ${H}}\n`,
    'input-short-sha': 'check: x\noutcome: pass\ncommit: a81c3f2\ninputs:\n  - {file: a.js, sha256: abc}\n',
    'input-no-sha': 'check: x\noutcome: pass\ncommit: a81c3f2\ninputs:\n  - {file: a.js}\n',
    'not-yaml': 'check: [x\noutcome: : pass\n',
  };
  assert.throws(() => parse(bad['not-yaml']), 'the test file is not YAML');
  for (const [name, text] of Object.entries(bad)) write(dir, `${DIR}/${name}.yaml`, text);
  write(dir, `${DIR}/ok.yaml`, GOOD);
  const results = await loadResults(dir);
  assert.equal(results.length, Object.keys(bad).length + 1);
  for (const r of results) {
    const name = r.file.replace(`${DIR}/`, '').replace(/\.yaml$/, '');
    assert.ok(Array.isArray(r.problems), name);
    for (const p of r.problems) assert.equal(typeof p, 'string', name);
    if (name === 'ok') assert.deepEqual(r.problems, [], name);
    else assert.equal(r.problems.length, 1, `${name}: ${JSON.stringify(r.problems)}`);
  }
});

test('a commit that YAML would read as a number keeps its exact text and gives no problem', async (t) => {
  const loadResults = await load();
  const dir = project(t);
  const commits = ['1234567', '0123456', '3e45678'];
  for (const [i, c] of commits.entries()) write(dir, `${DIR}/n${i}.yaml`, `check: x\noutcome: pass\ncommit: ${c}\n`);
  const results = await loadResults(dir);
  assert.deepEqual(results.map((r) => [r.commit, r.problems]), commits.map((c) => [c, []]));
});

test('a result file that is a symlink to an outside file is not read: one problem that names the symlink', async (t) => {
  const loadResults = await load();
  const dir = project(t);
  const external = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-outside-'));
  t.after(() => rmSync(external, { recursive: true, force: true }));
  const outsideText = 'check: test/outside.test.js\noutcome: fail\ncommit: b81c3f2\n';
  writeFileSync(join(external, 'r.yaml'), outsideText);
  mkdirSync(join(dir, DIR), { recursive: true });
  symlinkSync(join(external, 'r.yaml'), join(dir, DIR, 'r.yaml'));
  write(dir, `${DIR}/a.yaml`, GOOD);
  const results = await loadResults(dir);
  assert.deepEqual(results.map((r) => r.file), [`${DIR}/a.yaml`, `${DIR}/r.yaml`]);
  assert.deepEqual(results[0].problems, [], 'the other result file is read as usual');
  assert.equal(results[0].check, 'test/export-link.test.js');
  const r = results[1];
  assert.notEqual(r.check, 'test/outside.test.js');
  assert.notEqual(r.outcome, 'fail');
  assert.notEqual(r.commit, 'b81c3f2');
  assert.equal(r.problems.length, 1, JSON.stringify(r.problems));
  assert.match(r.problems[0], /symlink/);
  assert.equal(readFileSync(join(external, 'r.yaml'), 'utf8'), outsideText);
});
