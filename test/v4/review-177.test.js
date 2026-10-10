// The five defects the reviewer of PR #177 confirmed (coordinator,
// 2026-10-10), each with a clean control. Written before the fix.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parseMarkdown } from '../../src/v4/markers.js';
import { makeRepo, runV4, lines, show } from './helpers/repo.js';

const doc = (...ls) => ls.join('\n') + '\n';
const addIds = (repo, ...args) => runV4(repo.dir, ['spec', '--add-ids', ...args]);
const check = (repo, ...args) => runV4(repo.dir, ['check', ...args]);
const idsOf = (repo, rel) => parseMarkdown(repo.read(rel), rel).paragraphs.map((p) => p.id);
const lintLines = (r) => lines(r.stdout).filter((l) => /^(not ok|hint) /.test(l));
const assertError = (r) => {
  assert.equal(r.code, 2, show(r));
  assert.match(r.stdout + r.stderr, /^al: \S/m, show(r));
};

// A folder outside the repo, next to it in the test's temp dir.
function outside(repo, files = {}) {
  const dir = join(dirname(repo.dir), 'outside');
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}
const snapshot = (dir) => Object.fromEntries(readdirSync(dir).sort().map((n) => [n, readFileSync(join(dir, n), 'utf8')]));

describe('1. spec --add-ids refuses to write through a symlink', () => {
  test('a folder on the path to the file is a symlink to a folder outside the repo', (t) => {
    const repo = makeRepo(t);
    const out = outside(repo, { 'victim.md': '# External document\n' });
    mkdirSync(join(repo.dir, 'specs'));
    symlinkSync(out, join(repo.dir, 'specs/alias'));
    const r = addIds(repo, 'specs/alias/victim.md', '--prefix', 'EXT', '--yes');
    assertError(r);
    assert.deepEqual(snapshot(out), { 'victim.md': '# External document\n' });
    assert.ok(!repo.exists('.assuredloop'), '.assuredloop should not be written');
  });

  test('the file itself is a symlink to a file outside the repo', (t) => {
    const repo = makeRepo(t);
    const out = outside(repo, { 'victim.md': '# External document\n' });
    mkdirSync(join(repo.dir, 'specs'));
    symlinkSync(join(out, 'victim.md'), join(repo.dir, 'specs/link.md'));
    const r = addIds(repo, 'specs/link.md', '--prefix', 'EXT', '--yes');
    assertError(r);
    assert.deepEqual(snapshot(out), { 'victim.md': '# External document\n' });
    assert.ok(!repo.exists('.assuredloop'), '.assuredloop should not be written');
  });

  test('.assuredloop is a symlink to a folder outside the repo', (t) => {
    const repo = makeRepo(t);
    const out = outside(repo);
    symlinkSync(out, join(repo.dir, '.assuredloop'));
    repo.write('specs/a.md', '# Alpha\n');
    const r = addIds(repo, 'specs/a.md', '--prefix', 'A', '--yes');
    assertError(r);
    assert.deepEqual(snapshot(out), {});
    assert.equal(repo.read('specs/a.md'), '# Alpha\n');
  });

  test('.assuredloop/config.yaml is a symlink to a file outside the repo', (t) => {
    const repo = makeRepo(t);
    const out = outside(repo, { 'config.yaml': 'root: specs\n' });
    mkdirSync(join(repo.dir, '.assuredloop'));
    symlinkSync(join(out, 'config.yaml'), join(repo.dir, '.assuredloop/config.yaml'));
    repo.write('specs/a.md', '# Alpha\n');
    const r = addIds(repo, 'specs/a.md', '--prefix', 'A', '--yes');
    assertError(r);
    assert.deepEqual(snapshot(out), { 'config.yaml': 'root: specs\n' });
    assert.equal(repo.read('specs/a.md'), '# Alpha\n');
    assert.ok(!existsSync(join(repo.dir, '.assuredloop/schema.yaml')), 'schema.yaml should not be written');
  });

  test('.assuredloop/schema.yaml is a symlink (dangling) to a path outside the repo', (t) => {
    const repo = makeRepo(t);
    const out = outside(repo);
    mkdirSync(join(repo.dir, '.assuredloop'));
    symlinkSync(join(out, 'schema.yaml'), join(repo.dir, '.assuredloop/schema.yaml'));
    repo.write('specs/a.md', '# Alpha\n');
    const r = addIds(repo, 'specs/a.md', '--prefix', 'A', '--yes');
    assertError(r);
    assert.deepEqual(snapshot(out), {});
    assert.equal(repo.read('specs/a.md'), '# Alpha\n');
    assert.ok(!existsSync(join(repo.dir, '.assuredloop/config.yaml')), 'config.yaml should not be written');
  });

  test('control: a plain file in a plain folder is marked', (t) => {
    const repo = makeRepo(t);
    repo.write('specs/plain/a.md', '# Alpha\n');
    const r = addIds(repo, 'specs/plain/a.md', '--prefix', 'A', '--yes');
    assert.equal(r.code, 0, show(r));
    assert.deepEqual(idsOf(repo, 'specs/plain/a.md'), ['A-1']);
    assert.ok(repo.exists('.assuredloop/config.yaml'));
  });
});

describe('2. a marker inside a fenced block in history is not an ID', () => {
  const WITH_FENCE = doc(
    '<!-- A-1 note -->', '', '# Alpha', '',
    '<!-- A-2 example illustrates:A-1 -->', '', 'An example:', '',
    '```markdown', '<!-- A-9 note -->', '', 'Example text.', '```',
  );
  const WITHOUT_FENCE = doc(
    '<!-- A-1 note -->', '', '# Alpha', '',
    '<!-- A-2 example illustrates:A-1 -->', '', 'An example without code.',
  );

  function fenceHistory(t) {
    const repo = makeRepo(t);
    repo.write('specs/a.md', WITH_FENCE);
    repo.commit('example with a fenced marker');
    repo.write('specs/a.md', WITHOUT_FENCE);
    repo.commit('example without the fence');
    return repo;
  }

  test('a branch that adds a real A-9 gets no used-again', (t) => {
    const repo = fenceHistory(t);
    repo.git(['checkout', '-q', '-b', 'feature']);
    repo.write('specs/a.md', WITHOUT_FENCE + doc('', '<!-- A-9 note -->', '', 'Nine.'));
    const r = check(repo, '--strict');
    assert.equal(r.code, 0, show(r));
    assert.ok(!r.stdout.includes('used-again'), show(r));
    assert.ok(lines(r.stdout).includes('specs/a.md A-9 New'), show(r));
  });

  test('--add-ids numbers from the real markers only, not from a fenced one in history', (t) => {
    const repo = fenceHistory(t);
    repo.write('specs/a.md', WITHOUT_FENCE + doc('', 'New block.'));
    const r = addIds(repo, 'specs/a.md', '--prefix', 'A', '--yes');
    assert.equal(r.code, 0, show(r));
    assert.deepEqual(idsOf(repo, 'specs/a.md'), ['A-1', 'A-2', 'A-3']);
  });

  test('--add-ids numbers from the real markers only, not from a fenced one in the file itself', (t) => {
    const repo = makeRepo(t);
    repo.write('specs/a.md', WITH_FENCE + doc('', 'New block.'));
    const r = addIds(repo, 'specs/a.md', '--prefix', 'A', '--yes');
    assert.equal(r.code, 0, show(r));
    assert.deepEqual(idsOf(repo, 'specs/a.md'), ['A-1', 'A-2', 'A-3']);
  });
});

describe('3. history reads a deleted doc whatever its file name', () => {
  for (const [name, file] of [['a plain name (control)', 'specs/old.md'], ['a tab', 'specs/old\tname.md'], ['a double quote', 'specs/old"name.md']]) {
    function deletedDoc(t) {
      const repo = makeRepo(t);
      repo.write(file, doc('<!-- A-9 note -->', '', 'Old paragraph.'));
      repo.commit('old doc with A-9');
      repo.remove(file);
      repo.commit('old doc deleted');
      return repo;
    }

    test(`used-again: A-9 was in a deleted doc whose name has ${name}`, (t) => {
      const repo = deletedDoc(t);
      repo.git(['checkout', '-q', '-b', 'feature']);
      repo.write('specs/new.md', doc('<!-- A-9 note -->', '', 'New paragraph.'));
      const r = check(repo);
      assert.equal(r.code, 0, show(r));
      const used = lines(r.stdout).filter((l) => l.startsWith('not ok used-again '));
      assert.equal(used.length, 1, show(r));
      assert.match(used[0], /^not ok used-again specs\/new\.md:1 A-9 \S/);
    });

    test(`--add-ids starts above A-9 from a deleted doc whose name has ${name}`, (t) => {
      const repo = deletedDoc(t);
      repo.write('specs/new.md', 'New paragraph.\n');
      const r = addIds(repo, 'specs/new.md', '--prefix', 'A', '--yes');
      assert.equal(r.code, 0, show(r));
      assert.deepEqual(idsOf(repo, 'specs/new.md'), ['A-10']);
    });
  }
});

const BLOCKS = {
  list: '- Independent item',
  fence: '```\nIndependent code\n```',
  table: '| A | B |\n|---|---|\n| 1 | 2 |',
  quote: '> Independent quote',
  indented: '    Independent indented text',
};

describe('4. an unmarked block after a marked heading has no ID', () => {
  for (const [kind, block] of Object.entries(BLOCKS)) {
    test(`no-id for an unmarked ${kind} after a marked heading, after a blank line`, () => {
      const r = parseMarkdown(`<!-- A-1 note -->\n\n# Title\n\n${block}\n`, 'specs/a.md');
      const noId = r.lints.filter((l) => l.code === 'no-id');
      assert.deepEqual(noId.map((l) => [l.line, l.id, l.severity]), [[5, null, 'not ok']], JSON.stringify(r.lints));
    });

    test(`no-id for an unmarked ${kind} right after a marked heading, with no blank line`, () => {
      const r = parseMarkdown(`<!-- A-1 note -->\n\n# Title\n${block}\n`, 'specs/a.md');
      const noId = r.lints.filter((l) => l.code === 'no-id');
      assert.deepEqual(noId.map((l) => [l.line, l.id, l.severity]), [[4, null, 'not ok']], JSON.stringify(r.lints));
    });

    test(`control: an unmarked ${kind} after a marked paragraph belongs to it`, () => {
      const r = parseMarkdown(`<!-- A-1 note -->\n\n# Title\n\n<!-- A-2 note -->\n\nIntro:\n\n${block}\n`, 'specs/a.md');
      assert.deepEqual(r.lints, []);
      assert.equal(r.paragraphs[1].text, `Intro:\n\n${block}`);
    });
  }

  test('check gives no-id for each such block, and none after --add-ids --yes', (t) => {
    const repo = makeRepo(t);
    repo.write('specs/a.md', doc(
      '<!-- A-1 note -->', '', '# Title', '', BLOCKS.list, '',
      '<!-- A-2 note -->', '', '## Code', BLOCKS.fence, '',
      '<!-- A-3 note -->', '', '## Table', '', BLOCKS.table, '',
      '<!-- A-4 note -->', '', '## Quote', BLOCKS.quote, '',
      '<!-- A-5 note -->', '', '## Indented', '', BLOCKS.indented,
    ));
    const before = check(repo);
    assert.equal(before.code, 0, show(before));
    assert.equal(lintLines(before).filter((l) => l.startsWith('not ok no-id specs/a.md:')).length, 5, show(before));
    const add = addIds(repo, 'specs/a.md', '--prefix', 'A', '--yes');
    assert.equal(add.code, 0, show(add));
    assert.ok(lines(add.stdout).includes('Marked 5 paragraph(s) in specs/a.md'), show(add));
    const after = check(repo);
    assert.ok(!after.stdout.includes(' no-id '), show(after));
  });
});

describe('5. a GFM table without leading pipes belongs to the paragraph before it', () => {
  for (const [name, table] of [
    ['--- | ---', 'A | B\n--- | ---\n1 | 2'],
    [':--|--:', 'A|B\n:--|--:\n1|2'],
  ]) {
    test(`a table with delimiter row ${name} after a blank line: no no-id, and it is in the text`, () => {
      const r = parseMarkdown(`<!-- A-1 note -->\n\nThe table has:\n\n${table}\n`, 'specs/a.md');
      assert.deepEqual(r.lints, []);
      assert.equal(r.paragraphs[0].text, `The table has:\n\n${table}`);
    });

    test(`--add-ids puts no marker before a table with delimiter row ${name}`, (t) => {
      const repo = makeRepo(t);
      repo.write('specs/a.md', `The table has:\n\n${table}\n`);
      const r = addIds(repo, 'specs/a.md', '--prefix', 'A', '--yes');
      assert.equal(r.code, 0, show(r));
      assert.ok(lines(r.stdout).includes('Marked 1 paragraph(s) in specs/a.md'), show(r));
      const ps = parseMarkdown(repo.read('specs/a.md'), 'specs/a.md').paragraphs;
      assert.deepEqual(ps.map((p) => [p.id, p.text]), [['A-1', `The table has:\n\n${table}`]]);
    });
  }

  test('control: a prose line with a | and no delimiter row after a blank line is a new paragraph', () => {
    const r = parseMarkdown('<!-- A-1 note -->\n\nIntro.\n\nThis line has a | in it.\nAnd no delimiter row.\n', 'specs/a.md');
    assert.deepEqual(r.lints.map((l) => [l.code, l.line]), [['no-id', 5]]);
  });

  test('control: --add-ids marks such a prose line as a paragraph of its own', (t) => {
    const repo = makeRepo(t);
    repo.write('specs/a.md', 'Intro.\n\nThis line has a | in it.\nAnd no delimiter row.\n');
    const r = addIds(repo, 'specs/a.md', '--prefix', 'A', '--yes');
    assert.equal(r.code, 0, show(r));
    assert.ok(lines(r.stdout).includes('Marked 2 paragraph(s) in specs/a.md'), show(r));
  });
});
