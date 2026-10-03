// #143: one `al` run asks git the same question once. Identical read-only git
// calls (same args, same repo) start git once per run; the working-tree forms
// (ls-files, diff with fewer than two revisions, grep or blame without a
// revision) may repeat. Nothing is remembered across runs. Calls are counted
// with a `git` first on PATH that logs each one. This file never calls
// remember(), so its last test also checks library use without it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { gitShim, repeats } from './helpers/git-shim.js';
import { addRequest } from './helpers/request.js';
import { block } from './helpers/change.js';
import { git } from '../src/git.js';

const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';

// main holds a spec; branch iso-dates, checked out, is two commits ahead:
// a request with a change.md, then code and a test file.
function branchRepo(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', S0);
  repo.commit('baseline');
  repo.git(['checkout', '-q', '-b', 'iso-dates']);
  addRequest(repo, 'iso-dates', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  repo.commit('iso-dates: request\n\nRequest: iso-dates');
  repo.write('src/dates.js', 'export const iso = (d) => d.toISOString();\n');
  repo.write('test/dates.test.js', '// iso dates\n');
  repo.commit('iso-dates: code\n\nRequest: iso-dates');
  return repo;
}

const commands = (sha) => [
  ['check'], ['context'], ['spec', '--list'],
  ['check', '--at', sha], ['context', '--at', sha], ['spec', '--list', '--at', sha],
];

// Each command, run with and without the shim: the same output, git called,
// and no call made twice except the working-tree forms.
async function noRepeats(t, repo) {
  const shim = gitShim(t);
  for (const args of commands(repo.head())) {
    await t.test(`al ${args.join(' ')}`, () => {
      const plain = runAl(repo.dir, args);
      shim.clear();
      const shimmed = runAl(repo.dir, args, { env: { PATH: shim.path } });
      assert.equal(plain.code, 0, plain.stdout + plain.stderr);
      assert.deepEqual(shimmed, plain, 'the shim must not change what al prints or its exit code');
      const calls = shim.calls();
      assert.ok(calls.length > 0, 'the shim saw no git call');
      assert.deepEqual(repeats(calls), [], `git asked the same question twice in one run (${calls.length} calls)`);
    });
  }
}

test('#143 on a one-commit repo, check, context and spec --list, with and without --at, start each identical read-only git call once', async (t) => {
  await noRepeats(t, makeRepo(t));
});

test('#143 on a branch two commits ahead of main (a request, code and a test), check, context and spec --list, with and without --at, start each identical read-only git call once', async (t) => {
  await noRepeats(t, branchRepo(t));
});

test('#143 nothing is remembered across runs: a second al check starts the same git calls again, and a new commit shows in the next run', (t) => {
  const repo = branchRepo(t);
  const shim = gitShim(t);
  const run = () => {
    shim.clear();
    const r = runAl(repo.dir, ['check'], { env: { PATH: shim.path } });
    return { r, calls: shim.calls() };
  };
  const first = run();
  const second = run();
  assert.ok(first.calls.length > 0, 'the first run called git');
  assert.deepEqual(second.calls, first.calls, 'the second run asks git the same questions again');
  assert.deepEqual(second.r, first.r, 'the same repo gives the same output');
  assert.ok(first.r.stdout.includes('2 commit(s) over main..HEAD'), first.r.stdout);
  assert.equal(repo.git(['status', '--porcelain', '--ignored']), '', 'no cache file left in the repo');

  repo.write('src/more.js', 'export const more = 1;\n');
  repo.commit('iso-dates: more code\n\nRequest: iso-dates');
  const third = run();
  assert.ok(third.calls.length > 0, 'the third run called git');
  assert.ok(third.r.stdout.includes('3 commit(s) over main..HEAD'), `the new commit shows:\n${third.r.stdout}`);
});

test('#143 without remember(), in-process git calls each start git: rev-parse HEAD before and after a new commit gives both commits', (t) => {
  const repo = makeRepo(t);
  const shim = gitShim(t);
  const saved = process.env.PATH;
  const viaShim = (fn) => {
    process.env.PATH = shim.path;
    try { return fn(); } finally { process.env.PATH = saved; }
  };
  const a = repo.head();
  assert.equal(viaShim(() => git(repo.dir, ['rev-parse', 'HEAD'])), a);
  assert.equal(viaShim(() => git(repo.dir, ['rev-parse', 'HEAD'])), a);
  const b = repo.commit('second');
  assert.notEqual(b, a);
  assert.equal(viaShim(() => git(repo.dir, ['rev-parse', 'HEAD'])), b, 'the call after the commit sees it');
  assert.equal(shim.calls().length, 3, 'each call started git');
});
