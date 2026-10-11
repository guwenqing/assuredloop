// #218: a spec root that config.yaml sets explicitly, and that is outside the
// repository, reached through a symlink, or not an existing folder, is a
// `not ok spec-root` line in `al check`, so `al check --strict` exits 1.
// The default root (no root: key) with no specs/ folder gives no such line.
// Written before the code, from the issue and the public interface.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { makeRepo, addRequest, runV4, lines, show } from './helpers/repo.js';

const CONFIG = '.assuredloop/config.yaml';
const rootLine = (shown, reason) => `not ok spec-root ${CONFIG} - ${shown}/: ${reason}`;
const rootLines = (r) => lines(r.stdout).filter((l) => l.startsWith('not ok spec-root '));
const nextLine = (r) => lines(r.stdout).find((l) => l.startsWith('Next '));

// A marked doc a read of the bad root would show: a marker lint and an ID.
const OUTSIDE_TEXT = '<!-- OUT-1 -->\nOutside text.\n';

// A folder next to the repo, outside it, with a doc in it.
function outsideFolder(repo, name = 'outside') {
  const dir = join(dirname(repo.dir), name);
  mkdirSync(join(dir, 'sub'), { recursive: true });
  writeFileSync(join(dir, 'bad.md'), OUTSIDE_TEXT);
  writeFileSync(join(dir, 'sub', 'bad.md'), OUTSIDE_TEXT);
  return dir;
}

// Each case: the root as config.yaml writes it, the root as the line shows
// it (trailing slashes removed), and the reason.
const BAD_ROOTS = [
  {
    name: 'a root with a leading .. part',
    make: (repo) => { outsideFolder(repo); return '../outside'; },
    shown: () => '../outside', reason: 'outside the repository',
  },
  {
    name: 'a root with a leading .. part and a trailing slash',
    make: (repo) => { outsideFolder(repo); return '../outside/'; },
    shown: () => '../outside', reason: 'outside the repository',
  },
  {
    name: 'an absolute root outside the repository',
    make: (repo) => outsideFolder(repo),
    shown: (root) => root, reason: 'outside the repository',
  },
  {
    name: 'a root that is a symlink to a folder outside',
    make: (repo) => { symlinkSync(outsideFolder(repo), join(repo.dir, 'alias')); return 'alias'; },
    shown: () => 'alias', reason: 'through a symlink',
  },
  {
    name: 'a root under a symlinked folder',
    make: (repo) => { symlinkSync(outsideFolder(repo), join(repo.dir, 'alias')); return 'alias/sub'; },
    shown: () => 'alias/sub', reason: 'through a symlink',
  },
  {
    name: 'an explicit root that does not exist',
    make: () => 'design',
    shown: () => 'design', reason: 'no such folder',
  },
  {
    name: 'an explicit root that does not exist, with a trailing slash',
    make: () => 'design/',
    shown: () => 'design', reason: 'no such folder',
  },
  {
    name: 'an explicit root: specs with no specs/ folder',
    make: () => 'specs',
    shown: () => 'specs', reason: 'no such folder',
  },
  {
    name: 'an explicit root that is a file, not a folder',
    make: (repo) => { repo.write('design', 'not a folder\n'); return 'design'; },
    shown: () => 'design', reason: 'no such folder',
  },
  // Review of PR #221: a symlink is "through a symlink" also when its target
  // does not exist; that reason comes before "no such folder".
  {
    name: 'a root that is a dangling symlink',
    make: (repo) => { symlinkSync(join(dirname(repo.dir), 'missing'), join(repo.dir, 'alias')); return 'alias'; },
    shown: () => 'alias', reason: 'through a symlink',
  },
];

// The repo with the bad root committed in config.yaml.
function badRoot(t, c) {
  const repo = makeRepo(t);
  const root = c.make(repo);
  repo.write(CONFIG, `root: ${JSON.stringify(root)}\n`);
  repo.commit('config with a bad root');
  return { repo, expected: rootLine(c.shown(root), c.reason) };
}

describe('#218 a bad explicit root is a not ok spec-root line in al check', () => {
  for (const c of BAD_ROOTS) {
    test(`check: ${c.name} prints the spec-root line once, reads nothing from it, exit 0`, (t) => {
      const { repo, expected } = badRoot(t, c);
      const r = runV4(repo.dir, ['check']);
      assert.equal(r.code, 0, show(r));
      assert.deepEqual(rootLines(r), [expected], show(r));
      assert.ok(!r.stdout.includes('OUT-1'), show(r));
      assert.match(nextLine(r) ?? '', /^Next {6}fix each not ok/, show(r));
    });

    test(`check --strict: ${c.name} prints the spec-root line once and exits 1`, (t) => {
      const { repo, expected } = badRoot(t, c);
      const r = runV4(repo.dir, ['check', '--strict']);
      assert.equal(r.code, 1, show(r));
      assert.deepEqual(rootLines(r), [expected], show(r));
      assert.ok(!r.stdout.includes('OUT-1'), show(r));
      assert.match(nextLine(r) ?? '', /^Next {6}fix each not ok/, show(r));
    });
  }

  // The issue's case: the outside root hides a changed rule in specs/.
  function hiddenChange(t) {
    const repo = makeRepo(t);
    outsideFolder(repo);
    addRequest(repo);
    repo.write('specs/a.md', '<!-- A-1 note -->\n\n# Alpha\n\n<!-- A-2 rule serves:inv/R1 -->\n\nAn invoice MUST be sent.\n');
    repo.write(CONFIG, 'root: ../outside\n');
    repo.commit('spec on main, with a committed outside root');
    repo.git(['checkout', '-q', '-b', 'feature']);
    repo.write('specs/a.md', '<!-- A-1 note -->\n\n# Alpha\n\n<!-- A-2 rule serves:inv/R1 -->\n\nAn invoice MUST be sent within a day.\n');
    repo.commit('change the rule');
    return repo;
  }

  test('the issue: a committed root: ../outside while a rule in specs/ changes: check --strict exits 1 with the spec-root line', (t) => {
    const repo = hiddenChange(t);
    const r = runV4(repo.dir, ['check', '--strict']);
    assert.equal(r.code, 1, show(r));
    assert.deepEqual(rootLines(r), [rootLine('../outside', 'outside the repository')], show(r));
    assert.match(nextLine(r) ?? '', /^Next {6}fix each not ok/, show(r));
  });

  test('other output stays: a marker lint of a docs: entry inside the repo is printed with the spec-root line', (t) => {
    const repo = makeRepo(t);
    outsideFolder(repo);
    repo.write(CONFIG, 'root: ../outside\ndocs:\n  - file: guide/a.md\n    prefix: A\n');
    repo.write('guide/a.md', '<!-- A-1 note -->\n\n# Alpha\n\n<!-- A-2 -->\n\nUntyped.\n');
    repo.commit('an outside root and an inside doc');
    const r = runV4(repo.dir, ['check']);
    assert.equal(r.code, 0, show(r));
    assert.deepEqual(rootLines(r), [rootLine('../outside', 'outside the repository')], show(r));
    assert.ok(lines(r.stdout).some((l) => /^hint no-kind guide\/a\.md:5 A-2 \S/.test(l)), show(r));
    assert.ok(!r.stdout.includes('OUT-1'), show(r));
  });
});

// Review point on #218: with no root: key the root is specs. Only a specs
// path where nothing exists is exempt; anything at specs that cannot be read
// as the root is a not ok, as for an explicit root.
const DEFAULT_BAD = [
  {
    name: 'specs is a symlink to a folder outside',
    make: (repo) => symlinkSync(outsideFolder(repo), join(repo.dir, 'specs')),
    reason: 'through a symlink',
  },
  {
    name: 'specs is a regular file',
    make: (repo) => repo.write('specs', 'not a folder\n'),
    reason: 'no such folder',
  },
  {
    name: 'specs is a dangling symlink',
    make: (repo) => symlinkSync(join(dirname(repo.dir), 'missing'), join(repo.dir, 'specs')),
    reason: 'through a symlink',
  },
];
const CONFIGS = [
  ['config.yaml with no root: key', (repo) => {
    repo.write(CONFIG, 'docs:\n  - file: guide/a.md\n    prefix: A\n');
    repo.write('guide/a.md', '<!-- A-1 note -->\n\n# Alpha\n');
  }],
  ['no config.yaml', () => {}],
];

describe('#218 the default root specs, present but not a readable folder, is a not ok spec-root line', () => {
  for (const c of DEFAULT_BAD) {
    for (const [configName, writeConfig] of CONFIGS) {
      function setup(t) {
        const repo = makeRepo(t);
        c.make(repo);
        writeConfig(repo);
        repo.commit(`${c.name}, ${configName}`);
        return repo;
      }

      test(`check: ${c.name}, ${configName}: the spec-root line once, nothing read from it, exit 0`, (t) => {
        const repo = setup(t);
        const r = runV4(repo.dir, ['check']);
        assert.equal(r.code, 0, show(r));
        assert.deepEqual(rootLines(r), [rootLine('specs', c.reason)], show(r));
        assert.ok(!r.stdout.includes('OUT-1'), show(r));
        assert.match(nextLine(r) ?? '', /^Next {6}fix each not ok/, show(r));
      });

      test(`check --strict: ${c.name}, ${configName}: the spec-root line once, exit 1`, (t) => {
        const repo = setup(t);
        const r = runV4(repo.dir, ['check', '--strict']);
        assert.equal(r.code, 1, show(r));
        assert.deepEqual(rootLines(r), [rootLine('specs', c.reason)], show(r));
        assert.ok(!r.stdout.includes('OUT-1'), show(r));
        assert.match(nextLine(r) ?? '', /^Next {6}fix each not ok/, show(r));
      });
    }
  }
});

describe('#218 controls: no spec-root line', () => {
  test('control: no config.yaml and no specs/ folder: check --strict exits 0 with no spec-root line', (t) => {
    const repo = makeRepo(t);
    for (const args of [[], ['--strict']]) {
      const r = runV4(repo.dir, ['check', ...args]);
      assert.equal(r.code, 0, show(r));
      assert.deepEqual(rootLines(r), [], show(r));
      assert.ok(!r.stdout.includes('spec-root'), show(r));
    }
  });

  test('control: config.yaml with no root: key and no specs/ folder: check --strict exits 0 with no spec-root line', (t) => {
    const repo = makeRepo(t);
    repo.write(CONFIG, 'docs:\n  - file: guide/a.md\n    prefix: A\n');
    repo.write('guide/a.md', '<!-- A-1 note -->\n\n# Alpha\n');
    repo.commit('config with no root');
    for (const args of [[], ['--strict']]) {
      const r = runV4(repo.dir, ['check', ...args]);
      assert.equal(r.code, 0, show(r));
      assert.deepEqual(rootLines(r), [], show(r));
      assert.ok(!r.stdout.includes('spec-root'), show(r));
    }
  });

  for (const root of ['design', './design', 'design/']) {
    test(`control: an explicit root ${JSON.stringify(root)} that exists as a folder in the repo: no spec-root line, check --strict exits 0`, (t) => {
      const repo = makeRepo(t);
      repo.write(CONFIG, `root: ${JSON.stringify(root)}\n`);
      repo.write('design/a.md', '<!-- A-1 note -->\n\n# Alpha\n');
      repo.commit('config with an inside root');
      for (const args of [[], ['--strict']]) {
        const r = runV4(repo.dir, ['check', ...args]);
        assert.equal(r.code, 0, show(r));
        assert.deepEqual(rootLines(r), [], show(r));
        assert.ok(lines(r.stdout).includes('ok: no marker lint'), show(r));
      }
    });
  }

  test('control: al spec with root: ../outside is unchanged: exit 0 and no spec-root line', (t) => {
    const repo = makeRepo(t);
    outsideFolder(repo);
    repo.write(CONFIG, 'root: ../outside\n');
    repo.commit('config with an outside root');
    const r = runV4(repo.dir, ['spec']);
    assert.equal(r.code, 0, show(r));
    assert.ok(!r.stdout.includes('spec-root'), show(r));
  });

  test('control: al index with root: ../outside still refuses: exit 2', (t) => {
    const repo = makeRepo(t);
    outsideFolder(repo);
    repo.write(CONFIG, 'root: ../outside\n');
    repo.commit('config with an outside root');
    const r = runV4(repo.dir, ['index']);
    assert.equal(r.code, 2, show(r));
  });

  test('control: root: . is still refused by check --strict with exit 2', (t) => {
    const repo = makeRepo(t);
    repo.write(CONFIG, 'root: .\n');
    repo.commit('config with root at the top');
    const r = runV4(repo.dir, ['check', '--strict']);
    assert.equal(r.code, 2, show(r));
    assert.match(r.stdout + r.stderr, /^al: .*\broot\b/m, show(r));
  });
});
