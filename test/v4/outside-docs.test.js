// A docs: entry in config.yaml whose file is outside the repository is never
// read (coordinator, 2026-10-10). Written before the code.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { docsInScope } from '../../src/v4/scope.js';
import { loadConfig } from '../../src/v4/config.js';
import { makeRepo, addRequest, runV4, lines, show } from './helpers/repo.js';

// A marker problem a read would show: no blank line after the marker, and no kind.
const OUTSIDE_TEXT = '<!-- OUT-1 -->\nOutside text.\n';

// The repo, and outside.md in the temp folder next to it.
function setup(t, entry) {
  const repo = makeRepo(t);
  const outsidePath = join(dirname(repo.dir), 'outside.md');
  writeFileSync(outsidePath, OUTSIDE_TEXT);
  const file = entry === 'ABSOLUTE' ? outsidePath : entry;
  repo.write('.assuredloop/config.yaml', `docs:\n  - file: ${JSON.stringify(file)}\n    prefix: OUT\n`);
  repo.commit('config with an outside doc');
  return { repo, file };
}

const ENTRIES = [
  ['an absolute path', 'ABSOLUTE'],
  ['../outside.md', '../outside.md'],
  ['specs/../../outside.md', 'specs/../../outside.md'],
];

describe('a docs: entry outside the repository is not read', () => {
  for (const [name, entry] of ENTRIES) {
    test(`spec: ${name} is not listed and gets a not read line`, (t) => {
      const { repo, file } = setup(t, entry);
      const r = runV4(repo.dir, ['spec']);
      assert.equal(r.code, 0, show(r));
      assert.ok(lines(r.stdout).includes(`not read: ${file}: outside the repository`), show(r));
      assert.ok(!r.stdout.includes('OUT-1'), show(r));
      assert.ok(!lines(r.stdout).includes(file), show(r));
    });

    test(`check: ${name} gives no lint, a not read line, and exit 0 also with --strict`, (t) => {
      const { repo, file } = setup(t, entry);
      for (const args of [[], ['--strict']]) {
        const r = runV4(repo.dir, ['check', ...args]);
        assert.equal(r.code, 0, show(r));
        assert.ok(lines(r.stdout).includes(`not read: ${file}: outside the repository`), show(r));
        assert.ok(!r.stdout.includes('OUT-1'), show(r));
        assert.deepEqual(lines(r.stdout).filter((l) => /^(not ok|hint) /.test(l)), [], show(r));
      }
    });

    test(`docsInScope: ${name} gives no doc`, (t) => {
      const { repo } = setup(t, entry);
      const docs = docsInScope(repo.dir, loadConfig(repo.dir));
      assert.ok(!JSON.stringify(docs).includes('outside.md'), JSON.stringify(docs));
    });
  }
});

// root: design, so specs/a.md is in scope only through the docs: entry.
describe('control: a docs: entry inside the repository in another form is read', () => {
  for (const entry of ['./specs/a.md', 'specs/../specs/a.md']) {
    function inside(t) {
      const repo = makeRepo(t);
      repo.write('.assuredloop/config.yaml', `root: design\ndocs:\n  - file: ${entry}\n    prefix: A\n`);
      repo.write('specs/a.md', '<!-- A-1 note -->\n\n# Alpha\n');
      repo.commit('config with an inside doc');
      return repo;
    }

    test(`spec: ${entry} is listed as specs/a.md, once, with no not read line`, (t) => {
      const repo = inside(t);
      const r = runV4(repo.dir, ['spec']);
      assert.equal(r.code, 0, show(r));
      assert.equal(lines(r.stdout).filter((l) => l === 'specs/a.md').length, 1, show(r));
      assert.ok(lines(r.stdout).includes('  A-1 (0, Alpha)  note'), show(r));
      assert.ok(!r.stdout.includes('not read:'), show(r));
    });

    test(`check: ${entry} is read (a planted lint in specs/a.md shows)`, (t) => {
      const repo = inside(t);
      repo.write('specs/a.md', '<!-- A-1 note -->\n\n# Alpha\n\n<!-- A-2 -->\n\nUntyped.\n');
      const r = runV4(repo.dir, ['check']);
      assert.equal(r.code, 0, show(r));
      assert.ok(lines(r.stdout).some((l) => /^hint no-kind specs\/a\.md:5 A-2 \S/.test(l)), show(r));
    });

    test(`docsInScope: ${entry} gives specs/a.md`, (t) => {
      const repo = inside(t);
      const docs = docsInScope(repo.dir, loadConfig(repo.dir));
      // The path as a whole JSON string, so "specs/../specs/a.md" does not count.
      assert.ok(JSON.stringify(docs).includes('"specs/a.md"'), JSON.stringify(docs));
      assert.ok(!JSON.stringify(docs).includes('specs/../') && !JSON.stringify(docs).includes('./specs'), JSON.stringify(docs));
    });
  }
});

// root: outside the repository is never walked or read (coordinator).
describe('a root: outside the repository is not walked', () => {
  function setupRoot(t, entry) {
    const repo = makeRepo(t);
    const outsideDir = join(dirname(repo.dir), 'outside-specs');
    mkdirSync(join(outsideDir, 'sub'), { recursive: true });
    writeFileSync(join(outsideDir, 'bad.md'), OUTSIDE_TEXT);
    writeFileSync(join(outsideDir, 'sub', 'deep.md'), '<!-- OUT-2 -->\nDeep text.\n');
    const root = entry === 'ABSOLUTE' ? outsideDir : entry;
    repo.write('.assuredloop/config.yaml', `root: ${JSON.stringify(root)}\n`);
    repo.commit('config with an outside root');
    return { repo, root };
  }

  for (const [name, entry] of [['an absolute path', 'ABSOLUTE'], ['../outside-specs', '../outside-specs']]) {
    test(`spec: root ${name} lists no doc from it and gets a not read line`, (t) => {
      const { repo, root } = setupRoot(t, entry);
      const r = runV4(repo.dir, ['spec']);
      assert.equal(r.code, 0, show(r));
      assert.ok(lines(r.stdout).includes(`not read: ${root}/: outside the repository`), show(r));
      assert.ok(!r.stdout.includes('OUT-1') && !r.stdout.includes('OUT-2'), show(r));
      assert.ok(!r.stdout.includes('bad.md') && !r.stdout.includes('deep.md'), show(r));
    });

    test(`check: root ${name} gives no lint, a not read line, and exit 0 also with --strict`, (t) => {
      const { repo, root } = setupRoot(t, entry);
      for (const args of [[], ['--strict']]) {
        const r = runV4(repo.dir, ['check', ...args]);
        assert.equal(r.code, 0, show(r));
        assert.ok(lines(r.stdout).includes(`not read: ${root}/: outside the repository`), show(r));
        assert.ok(!r.stdout.includes('OUT-1') && !r.stdout.includes('OUT-2'), show(r));
        assert.deepEqual(lines(r.stdout).filter((l) => /^(not ok|hint) /.test(l)), [], show(r));
      }
    });

    test(`docsInScope: root ${name} gives no doc from it`, (t) => {
      const { repo } = setupRoot(t, entry);
      const docs = docsInScope(repo.dir, loadConfig(repo.dir));
      const json = JSON.stringify(docs);
      assert.ok(!json.includes('bad.md') && !json.includes('deep.md') && !json.includes('OUT-'), json);
    });
  }
});

describe('control: root: ./design reads design/*.md', () => {
  function design(t) {
    const repo = makeRepo(t);
    repo.write('.assuredloop/config.yaml', 'root: ./design\n');
    repo.write('design/a.md', '<!-- A-1 note -->\n\n# Alpha\n');
    repo.commit('config with root ./design');
    return repo;
  }

  test('spec lists design/a.md with no not read line', (t) => {
    const repo = design(t);
    const r = runV4(repo.dir, ['spec']);
    assert.equal(r.code, 0, show(r));
    assert.equal(lines(r.stdout).filter((l) => l === 'design/a.md').length, 1, show(r));
    assert.ok(lines(r.stdout).includes('  A-1 (0, Alpha)  note'), show(r));
    assert.ok(!r.stdout.includes('not read:'), show(r));
  });

  test('check reads design/a.md (a planted lint shows)', (t) => {
    const repo = design(t);
    repo.write('design/a.md', '<!-- A-1 note -->\n\n# Alpha\n\n<!-- A-2 -->\n\nUntyped.\n');
    const r = runV4(repo.dir, ['check']);
    assert.equal(r.code, 0, show(r));
    assert.ok(lines(r.stdout).some((l) => /^hint no-kind design\/a\.md:5 A-2 \S/.test(l)), show(r));
  });

  test('docsInScope gives design/a.md', (t) => {
    const repo = design(t);
    const json = JSON.stringify(docsInScope(repo.dir, loadConfig(repo.dir)));
    assert.ok(json.includes('"design/a.md"') && !json.includes('./design'), json);
  });
});

// Reading does not go through a symlink (coordinator, from the reviewer).
const SYMLINK_CASES = [
  {
    name: 'a docs: file under a symlinked folder',
    config: 'root: unused\ndocs:\n  - file: specs/alias/victim.md\n    prefix: OUT\n',
    link: 'specs/alias', inner: 'victim.md', docPath: 'specs/alias/victim.md', notRead: 'specs/alias/victim.md',
  },
  {
    name: 'a root: under a symlinked folder',
    config: 'root: alias/sub\n',
    link: 'alias', inner: 'sub/victim.md', docPath: 'alias/sub/victim.md', notRead: 'alias/sub/',
  },
];

describe('reading does not go through a symlink', () => {
  for (const c of SYMLINK_CASES) {
    function linked(t) {
      const repo = makeRepo(t);
      const out = join(dirname(repo.dir), 'outside-linked');
      mkdirSync(dirname(join(out, c.inner)), { recursive: true });
      writeFileSync(join(out, c.inner), OUTSIDE_TEXT);
      mkdirSync(dirname(join(repo.dir, c.link)), { recursive: true });
      symlinkSync(out, join(repo.dir, c.link));
      repo.write('.assuredloop/config.yaml', c.config);
      return repo;
    }
    const notReadLine = `not read: ${c.notRead}: through a symlink`;

    test(`docsInScope: ${c.name} gives no doc from it`, (t) => {
      const repo = linked(t);
      const json = JSON.stringify(docsInScope(repo.dir, loadConfig(repo.dir)));
      assert.ok(!json.includes('victim.md') && !json.includes('OUT-1'), json);
    });

    test(`spec: ${c.name} lists nothing from it and prints ${JSON.stringify(notReadLine)}`, (t) => {
      const repo = linked(t);
      const r = runV4(repo.dir, ['spec']);
      assert.equal(r.code, 0, show(r));
      assert.ok(lines(r.stdout).includes(notReadLine), show(r));
      assert.ok(!r.stdout.includes('OUT-1'), show(r));
      assert.ok(!lines(r.stdout).includes(c.docPath), show(r));
    });

    test(`check: ${c.name} gives no lint and no change line, prints the not read line, exit 0 also with --strict`, (t) => {
      const repo = linked(t);
      for (const args of [[], ['--strict']]) {
        const r = runV4(repo.dir, ['check', ...args]);
        assert.equal(r.code, 0, show(r));
        assert.ok(lines(r.stdout).includes(notReadLine), show(r));
        assert.ok(!r.stdout.includes('OUT-1'), show(r));
        assert.deepEqual(lines(r.stdout).filter((l) => /^(not ok|hint) /.test(l)), [], show(r));
        assert.deepEqual(lines(r.stdout).filter((l) => l.startsWith(`${c.docPath} `)), [], show(r));
      }
    });

    // Control: the same path as a plain folder inside the repo is read.
    function plain(t) {
      const repo = makeRepo(t);
      repo.write(join(c.link, c.inner), OUTSIDE_TEXT);
      repo.write('.assuredloop/config.yaml', c.config);
      return repo;
    }

    test(`control: ${c.name}, as a plain folder, is read by docsInScope, spec and check`, (t) => {
      const repo = plain(t);
      const json = JSON.stringify(docsInScope(repo.dir, loadConfig(repo.dir)));
      assert.ok(json.includes(`"${c.docPath}"`), json);
      const s = runV4(repo.dir, ['spec']);
      assert.equal(s.code, 0, show(s));
      assert.ok(lines(s.stdout).includes(c.docPath), show(s));
      assert.ok(!s.stdout.includes('not read:'), show(s));
      const r = runV4(repo.dir, ['check']);
      assert.equal(r.code, 0, show(r));
      assert.ok(!r.stdout.includes('not read:'), show(r));
      assert.ok(lines(r.stdout).some((l) => l.startsWith(`not ok no-blank-after ${c.docPath}:1 OUT-1 `)), show(r));
    });
  }
});

// root: that is the repository top is refused (coordinator).
describe('a root: that is the repository top is refused', () => {
  function topRoot(t, root) {
    const repo = makeRepo(t);
    repo.write('.assuredloop/config.yaml', `root: ${JSON.stringify(root)}\n`);
    repo.write('specs/a.md', '<!-- A-1 note -->\n\n# Alpha\n');
    repo.commit('config with root at the top');
    return repo;
  }

  for (const root of ['.', './', './/', 'specs/..']) {
    for (const cmd of [['spec'], ['check'], ['check', '--strict']]) {
      test(`${cmd.join(' ')} with root ${JSON.stringify(root)} exits 2 with an al: line that names root, and writes nothing`, (t) => {
        const repo = topRoot(t, root);
        const before = repo.git(['status', '--porcelain', '--untracked-files=all']);
        const r = runV4(repo.dir, cmd);
        assert.equal(r.code, 2, show(r));
        assert.match(r.stdout + r.stderr, /^al: .*\broot\b/m, show(r));
        assert.equal(repo.git(['status', '--porcelain', '--untracked-files=all']), before);
      });
    }
  }

  // Ambiguity: "<root>/" for root "/" would print "//"; any run of slashes
  // is accepted here.
  for (const root of ['/', '///']) {
    test(`control: root ${JSON.stringify(root)} is outside the repository: not read, exit 0`, (t) => {
      const repo = topRoot(t, root);
      for (const cmd of [['spec'], ['check'], ['check', '--strict']]) {
        const r = runV4(repo.dir, cmd);
        assert.equal(r.code, 0, show(r));
        assert.ok(lines(r.stdout).some((l) => /^not read: \/+: outside the repository$/.test(l)), show(r));
      }
    });
  }

  function dotSpecs(t) {
    const repo = makeRepo(t);
    repo.write('.assuredloop/config.yaml', 'root: ./specs\n');
    repo.write('specs/a.md', '<!-- A-1 note -->\n\n# Alpha\n\n<!-- A-2 rule serves:inv/R1 -->\n\nA rule.\n');
    addRequest(repo);
    repo.commit('specs with root ./specs');
    return repo;
  }

  test('control: root ./specs reads specs/a.md, with no ./ in the path', (t) => {
    const repo = dotSpecs(t);
    const r = runV4(repo.dir, ['spec']);
    assert.equal(r.code, 0, show(r));
    assert.ok(lines(r.stdout).includes('specs/a.md'), show(r));
    assert.ok(!r.stdout.includes('./specs'), show(r));
    assert.ok(lines(r.stdout).includes('  A-2 (0:1, in Alpha)  rule'), show(r));
  });

  test('control: root ./specs on a clean tree with one commit on main prints no change line', (t) => {
    const repo = dotSpecs(t);
    const r = runV4(repo.dir, ['check', '--strict']);
    assert.equal(r.code, 0, show(r));
    assert.deepEqual(lines(r.stdout).filter((l) => /^(\.\/)?specs\//.test(l)), [], show(r));
    assert.ok(lines(r.stdout).includes('ok: no marker lint'), show(r));
  });
});
