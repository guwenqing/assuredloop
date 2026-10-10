// loadConfig and loadSchema do not read through a symlink (coordinator,
// 2026-10-10). Written before the code.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { loadConfig, loadSchema } from '../../src/v4/config.js';
import { KINDS } from '../../src/v4/markers.js';
import { makeRepo, runV4, lines, show } from './helpers/repo.js';

const CONFIG = 'root: design\n';
const msg = (name, part) => `.assuredloop/${name} is reached through the symlink ${part}; nothing was read`;
const snapshot = (dir) => Object.fromEntries(readdirSync(dir).sort().map((n) => [n, readFileSync(join(dir, n), 'utf8')]));

// The folder next to the repo, with a config.yaml a read would show.
function outsideDir(repo) {
  const dir = join(dirname(repo.dir), 'outside-al');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'config.yaml'), CONFIG);
  return dir;
}

// Each case: how to set it up, and the <part> named for each file.
const CASES = {
  'the .assuredloop folder is a symlink': {
    make(repo, out) { symlinkSync(out, join(repo.dir, '.assuredloop')); },
    config: '.assuredloop', schema: '.assuredloop',
  },
  'the .assuredloop folder is a dangling symlink': {
    make(repo, out) { symlinkSync(join(out, 'none'), join(repo.dir, '.assuredloop')); },
    config: '.assuredloop', schema: '.assuredloop',
  },
  'config.yaml is a symlink': {
    make(repo, out) { mkdirSync(join(repo.dir, '.assuredloop')); symlinkSync(join(out, 'config.yaml'), join(repo.dir, '.assuredloop/config.yaml')); },
    config: '.assuredloop/config.yaml', schema: null,
  },
  'config.yaml is a dangling symlink': {
    make(repo, out) { mkdirSync(join(repo.dir, '.assuredloop')); symlinkSync(join(out, 'none.yaml'), join(repo.dir, '.assuredloop/config.yaml')); },
    config: '.assuredloop/config.yaml', schema: null,
  },
  'schema.yaml is a symlink': {
    make(repo, out) { mkdirSync(join(repo.dir, '.assuredloop')); writeFileSync(join(out, 'schema.yaml'), 'version: 1\n'); symlinkSync(join(out, 'schema.yaml'), join(repo.dir, '.assuredloop/schema.yaml')); },
    config: null, schema: '.assuredloop/schema.yaml',
  },
  'schema.yaml is a dangling symlink': {
    make(repo, out) { mkdirSync(join(repo.dir, '.assuredloop')); symlinkSync(join(out, 'none.yaml'), join(repo.dir, '.assuredloop/schema.yaml')); },
    config: null, schema: '.assuredloop/schema.yaml',
  },
};

function setup(t, c) {
  const repo = makeRepo(t);
  const out = outsideDir(repo);
  c.make(repo, out);
  repo.write('specs/a.md', '<!-- A-1 note -->\n\n# Alpha\n');
  return { repo, out };
}

describe('loadConfig and loadSchema refuse a symlink', () => {
  for (const [name, c] of Object.entries(CASES)) {
    if (c.config) {
      test(`loadConfig throws when ${name}`, (t) => {
        const { repo } = setup(t, c);
        assert.throws(() => loadConfig(repo.dir), (e) => {
          assert.ok(e instanceof Error);
          assert.equal(e.message, msg('config.yaml', c.config));
          return true;
        });
      });
    } else {
      test(`control: loadConfig gives the defaults when ${name} and config.yaml is absent`, (t) => {
        const { repo } = setup(t, c);
        const cfg = loadConfig(repo.dir);
        assert.equal(cfg.root, 'specs');
        assert.deepEqual(cfg.docs, []);
      });
    }
    if (c.schema) {
      test(`loadSchema throws when ${name}`, (t) => {
        const { repo } = setup(t, c);
        assert.throws(() => loadSchema(repo.dir), (e) => {
          assert.ok(e instanceof Error);
          assert.equal(e.message, msg('schema.yaml', c.schema));
          return true;
        });
      });
    } else {
      test(`control: loadSchema gives the built-in kinds when ${name} and schema.yaml is absent`, (t) => {
        const { repo } = setup(t, c);
        assert.deepEqual(loadSchema(repo.dir).kinds, KINDS);
      });
    }
  }

  test('control: plain config.yaml and schema.yaml are read', (t) => {
    const repo = makeRepo(t);
    repo.write('specs/a.md', '# Alpha\n');
    const r = runV4(repo.dir, ['spec', '--add-ids', 'specs/a.md', '--prefix', 'A', '--yes']);
    assert.equal(r.code, 0, show(r));
    repo.write('.assuredloop/config.yaml', repo.read('.assuredloop/config.yaml').replace(/^root:.*\n/m, '') + 'root: design\n');
    assert.equal(loadConfig(repo.dir).root, 'design');
    assert.deepEqual(loadSchema(repo.dir).kinds, KINDS);
  });
});

describe('spec and check refuse a symlinked config.yaml or schema.yaml', () => {
  for (const [name, c] of Object.entries(CASES)) {
    // Ambiguity: the coordinator named the config.yaml line for the CLI; when
    // only schema.yaml is a symlink, the schema.yaml line is expected.
    const file = c.config ? 'config.yaml' : 'schema.yaml';
    const expected = `al: ${msg(file, c.config ?? c.schema)}`;
    for (const cmd of [['spec'], ['check']]) {
      test(`${cmd[0]} exits 2 and writes nothing when ${name}`, (t) => {
        const { repo, out } = setup(t, c);
        const before = snapshot(out);
        const status = repo.git(['status', '--porcelain', '--untracked-files=all']);
        const r = runV4(repo.dir, cmd);
        assert.equal(r.code, 2, show(r));
        assert.ok(lines(r.stdout + r.stderr).includes(expected), `${JSON.stringify(expected)} expected:\n${show(r)}`);
        assert.deepEqual(snapshot(out), before);
        assert.equal(repo.git(['status', '--porcelain', '--untracked-files=all']), status);
      });
    }
  }
});
