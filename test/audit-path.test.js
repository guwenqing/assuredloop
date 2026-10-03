// Issue #138, item 4 [VW-7] [HNT-3]: `al context <path>:<line> --audit`
// reads only a file in the repo, by a path that goes through no symlink. A
// path that leaves the repo (../secret.txt, an absolute path) or goes through
// a symlink in the repo (to a folder or to a file, pointing out or in) is
// refused: exit 2, the file's text is not printed, and nothing is said about
// it as "not committed yet". A plain path in the repo still works.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symlinkSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { makeRepo, runAl } from './helpers/fixture.js';
import { both } from './helpers/request.js';

const SECRET = 'TOP SECRET LINE, never to be printed';
const CODE = 'export const total = (lines) => lines.reduce((a, b) => a + b, 0);\n';

// The repo: src/total.js; committed symlinks up -> the folder holding the
// repo (outside it), sec.txt -> secret.txt beside the repo, alias.js ->
// src/total.js and srcalias -> src. secret.txt sits beside the repo.
function setup(t) {
  const repo = makeRepo(t);
  const beside = dirname(repo.dir);
  writeFileSync(join(beside, 'secret.txt'), `${SECRET}\n`);
  repo.write('src/total.js', CODE);
  symlinkSync(beside, join(repo.dir, 'up'));
  symlinkSync(join(beside, 'secret.txt'), join(repo.dir, 'sec.txt'));
  symlinkSync('src/total.js', join(repo.dir, 'alias.js'));
  symlinkSync('src', join(repo.dir, 'srcalias'));
  repo.commit('code and four symlinks');
  for (const p of ['up', 'sec.txt', 'alias.js', 'srcalias']) {
    assert.match(repo.git(['ls-files', '-s', p]), /^120000 /, `the fixture: ${p} is committed as a symlink`);
  }
  return repo;
}

const audit = (repo, target) => runAl(repo.dir, ['context', target, '--audit']);

function assertRefused(r, target) {
  assert.equal(r.code, 2, `${target} --audit should be refused:\n${both(r)}`);
  assert.ok(!both(r).includes(SECRET), `${target}: the file's text is not printed:\n${both(r)}`);
  assert.ok(!/not committed yet/.test(both(r)), `${target}: nothing is said about it:\n${both(r)}`);
}

test('#138 [VW-7] context ../secret.txt:1 --audit, a path out of the repo: exit 2, the secret not printed, no "not committed yet"', (t) => {
  const repo = setup(t);
  assertRefused(audit(repo, '../secret.txt:1'), '../secret.txt:1');
});

test('#138 [VW-7] context <absolute path to secret.txt>:1 --audit: exit 2, the secret not printed, no "not committed yet"', (t) => {
  const repo = setup(t);
  const target = `${join(dirname(repo.dir), 'secret.txt')}:1`;
  assertRefused(audit(repo, target), target);
});

test('#138 [VW-7] context up/secret.txt:1 and sec.txt:1 --audit, through a symlinked folder or file leading out: exit 2, the secret not printed, no "not committed yet"', (t) => {
  const repo = setup(t);
  for (const target of ['up/secret.txt:1', 'sec.txt:1']) assertRefused(audit(repo, target), target);
});

test('#138 [VW-7] context alias.js:1 and srcalias/total.js:1 --audit, through a symlink to a file or folder inside the repo: exit 2', (t) => {
  const repo = setup(t);
  for (const target of ['alias.js:1', 'srcalias/total.js:1']) {
    const r = audit(repo, target);
    assert.equal(r.code, 2, `${target} goes through a symlink:\n${both(r)}`);
  }
});

test('#138 [VW-7] contrast: context src/total.js:1 --audit, a plain path in the repo: exit 0, the line shown', (t) => {
  const repo = setup(t);
  const r = audit(repo, 'src/total.js:1');
  assert.equal(r.code, 0, both(r));
  assert.ok(r.stdout.includes('export const total'), r.stdout);
});
