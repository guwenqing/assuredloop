// #143: makeRepo may build its repo once and copy it, but what it gives each
// test stays as before: the same repo as `git init` plus one commit, a
// separate copy per test, removed when the test ends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { makeRepo, tempDir, git, DEFAULT_DATE } from './helpers/fixture.js';

// The one-commit repo built by hand, the way makeRepo built it before #143.
function handRepo(t, date) {
  const dir = join(tempDir(t), 'repo');
  mkdirSync(dir);
  git(dir, ['init', '-q']);
  writeFileSync(join(dir, 'README.md'), 'fixture\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '--allow-empty', '-m', 'initial'], { date });
  return dir;
}

// What a test can see of a repo, none of it naming the repo's own path.
function seen(dir) {
  return {
    head: git(dir, ['rev-parse', 'HEAD']),
    branch: git(dir, ['symbolic-ref', 'HEAD']),
    status: git(dir, ['status', '--porcelain', '--ignored']),
    reflogHead: git(dir, ['log', '-g', '--date=raw', '--format=%H %gd %gn %ge %gs', 'HEAD']),
    reflogMain: git(dir, ['log', '-g', '--date=raw', '--format=%H %gd %gn %ge %gs', 'refs/heads/main']),
    log: git(dir, ['log', '--format=%H %an %ae %aI %cn %ce %cI %s']),
    tracked: git(dir, ['ls-files']),
    files: readdirSync(dir).sort(),
    readme: readFileSync(join(dir, 'README.md'), 'utf8'),
    config: git(dir, ['config', '--local', '--list']),
  };
}

// The default date again last: a repo kept from an earlier call must still match.
for (const [n, date] of [[1, undefined], [2, '2026-09-21T12:00:00Z'], [3, undefined]]) {
  test(`#143 makeRepo (${n}: date ${date ?? 'default'}) gives the repo git init and one commit give: same HEAD, branch, reflog, log, files, clean status`, (t) => {
    const repo = makeRepo(t, date === undefined ? {} : { date });
    const hand = handRepo(t, date);
    assert.deepEqual(seen(repo.dir), seen(hand));
    assert.equal(git(repo.dir, ['rev-parse', '--show-toplevel']), repo.dir, 'git sees the repo at its own dir');
    assert.equal(repo.head(), git(hand, ['rev-parse', 'HEAD']));
    assert.equal(repo.read('README.md').toString('utf8'), 'fixture\n');
    if (date === undefined) assert.equal(repo.head(), git(handRepo(t, DEFAULT_DATE), ['rev-parse', 'HEAD']), 'the default date is DEFAULT_DATE');

    // The wrapper works on this repo: the same new commit on both gives the same id.
    repo.write('specs/a.md', '## A\n');
    mkdirSync(join(hand, 'specs'));
    writeFileSync(join(hand, 'specs/a.md'), '## A\n');
    git(hand, ['add', '-A']);
    git(hand, ['commit', '-q', '-m', 'second'], { date: '2026-09-22T12:00:00Z' });
    assert.equal(repo.commit('second', { date: '2026-09-22T12:00:00Z' }), git(hand, ['rev-parse', 'HEAD']));
    assert.equal(repo.git(['status', '--porcelain']), '');
  });
}

test('#143 two makeRepo repos in one test are separate: a commit or a file in one does not show in the other', (t) => {
  const a = makeRepo(t);
  const b = makeRepo(t);
  assert.notEqual(a.dir, b.dir);
  assert.notEqual(dirname(a.dir), dirname(b.dir), 'each in its own temp dir');
  const start = b.head();
  a.write('only-a.md', 'a\n');
  const moved = a.commit('in a only');
  b.write('only-b.md', 'b\n');
  assert.notEqual(a.head(), start);
  assert.equal(a.head(), moved);
  assert.equal(b.head(), start, 'b did not get a\'s commit');
  assert.equal(b.git(['log', '--format=%s']), 'initial');
  assert.ok(!existsSync(join(b.dir, 'only-a.md')), 'a\'s file is not in b');
  assert.ok(!existsSync(join(a.dir, 'only-b.md')), 'b\'s file is not in a');
  assert.equal(a.git(['status', '--porcelain']), '');
  assert.equal(b.git(['status', '--porcelain']), '?? only-b.md');
});

test('#143 a makeRepo repo from an earlier test is not shared: a later makeRepo starts from the one commit again', (t) => {
  const first = makeRepo(t);
  first.write('x.md', 'x\n');
  first.commit('changed');
  const later = makeRepo(t);
  assert.equal(later.git(['log', '--format=%s']), 'initial');
  assert.deepEqual(readdirSync(later.dir).sort(), ['.git', 'README.md']);
});

test('#143 makeRepo\'s dir, and the temp dir holding it, are removed when its test ends', async (t) => {
  let dir;
  await t.test('makes a repo', (st) => {
    dir = makeRepo(st).dir;
    assert.ok(existsSync(join(dir, '.git')));
  });
  assert.ok(!existsSync(dir), `${dir} should be gone`);
  assert.ok(!existsSync(dirname(dir)), `${dirname(dir)} should be gone`);
});
