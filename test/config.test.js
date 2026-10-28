// src/v4/config.js: loadConfig(top) and loadSchema(top), and src/v4/git.js.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, loadSchema } from '../../src/v4/config.js';
import { KINDS } from '../../src/v4/markers.js';
import { git as gitV4, mergeBase, fileAt } from '../../src/v4/git.js';
import { makeRepo, runV4, show } from './helpers/repo.js';

describe('loadConfig', () => {
  test('no config file gives the defaults: root specs, docs []', (t) => {
    const repo = makeRepo(t);
    const c = loadConfig(repo.dir);
    assert.equal(c.root, 'specs');
    assert.deepEqual(c.docs, []);
  });

  test('a written config file gives its root and docs', (t) => {
    const repo = makeRepo(t);
    repo.write('.assuredloop/config.yaml', 'root: design\ndocs:\n  - file: README.md\n    prefix: RD\n  - file: guide/use.md\n    prefix: USE\n');
    const c = loadConfig(repo.dir);
    assert.equal(c.root, 'design');
    assert.deepEqual(c.docs, [{ file: 'README.md', prefix: 'RD' }, { file: 'guide/use.md', prefix: 'USE' }]);
  });

  test('a config file without root or docs still gives their defaults', (t) => {
    const repo = makeRepo(t);
    repo.write('.assuredloop/config.yaml', 'docs:\n  - file: README.md\n    prefix: RD\n');
    assert.equal(loadConfig(repo.dir).root, 'specs');
    repo.write('.assuredloop/config.yaml', 'root: design\n');
    assert.deepEqual(loadConfig(repo.dir).docs, []);
  });

  test('bad YAML throws an Error that names the file', (t) => {
    const repo = makeRepo(t);
    repo.write('.assuredloop/config.yaml', 'root: [specs\ndocs: {\n');
    assert.throws(() => loadConfig(repo.dir), (e) => e instanceof Error && e.message.includes('config.yaml'));
  });
});

describe('loadSchema', () => {
  test('no schema file gives the built-in kinds', (t) => {
    const repo = makeRepo(t);
    const s = loadSchema(repo.dir);
    assert.deepEqual(s.kinds, KINDS);
    assert.ok('schema' in s);
  });

  test('the schema file that spec --add-ids writes loads back as the built-in kinds', (t) => {
    const repo = makeRepo(t);
    repo.write('specs/inv.md', '# Invoices\n\nText.\n');
    const r = runV4(repo.dir, ['spec', '--add-ids', 'specs/inv.md', '--prefix', 'INV', '--yes']);
    assert.equal(r.code, 0, show(r));
    assert.ok(repo.exists('.assuredloop/schema.yaml'));
    assert.deepEqual(loadSchema(repo.dir).kinds, KINDS);
  });

  // Ambiguity: the interface states the bad-YAML rule for loadConfig only;
  // the same rule is taken for loadSchema.
  test('bad YAML in schema.yaml throws an Error that names the file', (t) => {
    const repo = makeRepo(t);
    repo.write('.assuredloop/schema.yaml', 'kinds: [rule\n  - {\n');
    assert.throws(() => loadSchema(repo.dir), (e) => e instanceof Error && e.message.includes('schema.yaml'));
  });
});

describe('git helpers', () => {
  test('git returns trimmed stdout; allowFail gives null on failure', (t) => {
    const repo = makeRepo(t);
    assert.match(gitV4(repo.dir, ['rev-parse', 'HEAD']), /^[0-9a-f]{40}$/);
    assert.equal(gitV4(repo.dir, ['rev-parse', 'no-such-ref'], { allowFail: true }), null);
  });

  test('mergeBase is the merge-base of HEAD with main, or null without main', (t) => {
    const repo = makeRepo(t);
    const base = repo.head();
    repo.git(['checkout', '-q', '-b', 'feature']);
    repo.write('a.txt', 'a\n');
    repo.commit('on feature');
    assert.equal(mergeBase(repo.dir), base);
    const trunk = makeRepo(t, { branch: 'trunk' });
    assert.equal(mergeBase(trunk.dir), null);
  });

  test('fileAt gives the text at a commit, or null when the path is absent', (t) => {
    const repo = makeRepo(t);
    repo.write('specs/a.md', 'old\n');
    const first = repo.commit('a');
    repo.write('specs/a.md', 'new\n');
    repo.commit('b');
    assert.equal(fileAt(repo.dir, first, 'specs/a.md'), 'old\n');
    assert.equal(fileAt(repo.dir, first, 'specs/none.md'), null);
  });
});
