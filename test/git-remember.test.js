// #143: after remember(), a git call with the same cwd and args as an earlier
// one gives the earlier result without starting git again; a call marked
// worktree: true is never remembered. remember() holds for the whole process,
// so the tests without it are in git-once.test.js. Calls are counted with a
// `git` first on PATH that logs each one.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo } from './helpers/fixture.js';
import { gitShim } from './helpers/git-shim.js';

const mod = await import('../src/git.js');
const { git, Fail } = mod;

before(() => {
  if (typeof mod.remember === 'function') mod.remember();
});

// Runs `fn` with the shim first on PATH, then puts PATH back.
function withShim(shim, fn) {
  const saved = process.env.PATH;
  process.env.PATH = shim.path;
  try { return fn(); } finally { process.env.PATH = saved; }
}

const exported = () => assert.equal(typeof mod.remember, 'function', 'src/git.js exports remember()');

test('#143 after remember(), the same rev-parse HEAD in the same repo starts git once and gives the first answer, even after a new commit', (t) => {
  exported();
  const repo = makeRepo(t);
  const shim = gitShim(t);
  const a = repo.head();
  assert.equal(withShim(shim, () => git(repo.dir, ['rev-parse', 'HEAD'])), a);
  assert.equal(withShim(shim, () => git(repo.dir, ['rev-parse', 'HEAD'])), a);
  repo.commit('second');
  assert.equal(withShim(shim, () => git(repo.dir, ['rev-parse', 'HEAD'])), a, 'remembered within the run');
  assert.equal(shim.calls().length, 1, 'git started once');
});

test('#143 after remember(), different args, or the same args in another repo, start git', (t) => {
  exported();
  const one = makeRepo(t);
  const two = makeRepo(t);
  two.commit('two differs');
  const shim = gitShim(t);
  withShim(shim, () => git(one.dir, ['rev-parse', 'HEAD']));
  assert.equal(withShim(shim, () => git(one.dir, ['rev-parse', '--verify', 'HEAD'])), one.head());
  assert.equal(withShim(shim, () => git(two.dir, ['rev-parse', 'HEAD'])), two.head(), 'another repo gets its own answer');
  assert.deepEqual(shim.calls().map((c) => [c.cwd, ...c.args]), [
    [one.dir, 'rev-parse', 'HEAD'],
    [one.dir, 'rev-parse', '--verify', 'HEAD'],
    [two.dir, 'rev-parse', 'HEAD'],
  ]);
});

test('#143 after remember(), a failing call with allowFail gives null both times, starting git once', (t) => {
  exported();
  const repo = makeRepo(t);
  const shim = gitShim(t);
  const args = ['rev-parse', '--verify', '--quiet', 'refs/heads/nope'];
  assert.equal(withShim(shim, () => git(repo.dir, args, { allowFail: true })), null);
  assert.equal(withShim(shim, () => git(repo.dir, args, { allowFail: true })), null);
  assert.equal(shim.calls().length, 1, 'git started once');
});

test('#143 after remember(), a failing call without allowFail throws Fail both times, with the same message, starting git once', (t) => {
  exported();
  const repo = makeRepo(t);
  const shim = gitShim(t);
  const args = ['cat-file', 'blob', 'HEAD:missing.md'];
  const thrown = () => {
    try { withShim(shim, () => git(repo.dir, args)); } catch (e) { return e; }
    assert.fail('git should have thrown');
  };
  const e1 = thrown();
  const e2 = thrown();
  assert.ok(e1 instanceof Fail, `a Fail, not ${e1}`);
  assert.ok(e2 instanceof Fail, `a Fail, not ${e2}`);
  assert.equal(e2.message, e1.message);
  assert.match(e1.message, /cat-file blob HEAD:missing\.md failed/);
  assert.equal(shim.calls().length, 1, 'git started once');
});

test('#143 after remember(), text: false gives a Buffer with the same bytes both times (a binary blob), starting git once', (t) => {
  exported();
  const repo = makeRepo(t);
  const bytes = Buffer.from([0xff, 0x00, 0xfe, 0x0a, 0x0a]);
  repo.write('blob.bin', bytes);
  repo.commit('binary');
  const shim = gitShim(t);
  const args = ['cat-file', 'blob', 'HEAD:blob.bin'];
  const b1 = withShim(shim, () => git(repo.dir, args, { text: false }));
  const b2 = withShim(shim, () => git(repo.dir, args, { text: false }));
  assert.ok(Buffer.isBuffer(b1) && Buffer.isBuffer(b2), 'Buffers');
  assert.ok(b1.equals(bytes), `the blob's bytes: ${b1.toString('hex')}`);
  assert.ok(b2.equals(bytes), `the blob's bytes again: ${b2.toString('hex')}`);
  assert.equal(shim.calls().length, 1, 'git started once');
});

// Whether these start git again is left open; the result must still be right.
test('#143 after remember(), the same args asked as text then as a Buffer, or with then without allowFail, still give each form its own result', (t) => {
  exported();
  const repo = makeRepo(t);
  assert.equal(git(repo.dir, ['cat-file', 'blob', 'HEAD:README.md']), 'fixture');
  const buf = git(repo.dir, ['cat-file', 'blob', 'HEAD:README.md'], { text: false });
  assert.ok(Buffer.isBuffer(buf), 'a Buffer when asked with text: false');
  assert.equal(buf.toString('utf8'), 'fixture\n', 'the Buffer keeps the trailing newline');
  assert.equal(git(repo.dir, ['cat-file', 'blob', 'HEAD:README.md']), 'fixture', 'text again');

  const args = ['cat-file', 'blob', 'HEAD:missing.md'];
  assert.equal(git(repo.dir, args, { allowFail: true }), null);
  assert.throws(() => git(repo.dir, args), (e) => e instanceof Fail, 'without allowFail the failure throws Fail');
});

test('#143 after remember(), a call marked worktree: true is not remembered: ls-files -z sees a file staged between two calls', (t) => {
  exported();
  const repo = makeRepo(t);
  const shim = gitShim(t);
  const args = ['ls-files', '-z'];
  assert.equal(withShim(shim, () => git(repo.dir, args, { worktree: true })), 'README.md\0');
  repo.write('new.md', 'new\n');
  repo.git(['add', 'new.md']);
  assert.equal(withShim(shim, () => git(repo.dir, args, { worktree: true })), 'README.md\0new.md\0');
  assert.equal(shim.calls().length, 2, 'git started for each call');
});
