// What every output says it read [VW-9], and misuse exit codes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, addOrigin, cloneRepo, runAl, sha256 } from './helpers/fixture.js';
import { assertFrame } from './helpers/output.js';

const WORDS = 'Customers keep asking to download their invoices.\n';

function repoWithRequest(t) {
  const repo = makeRepo(t);
  repo.write('requests/invoice-download/request.md',
    "# Customers can download invoices\nTier: 2 · Status: open\n\n## Owner's words and dialog\n\n" +
    '- 2026-09-20 owner chat, snapshot origin/2026-09-20-owner-words.md\n');
  repo.write('requests/invoice-download/origin/2026-09-20-owner-words.md',
    `Source: standard input\nFetched: 2026-09-20T09:00Z\nSHA-256: ${sha256(WORDS)}\n---\n${WORDS}`);
  repo.commit('add request', { date: '2026-09-20T10:00:00Z' });
  return repo;
}

test('[VW-9] with no origin/main, context names the working tree and local main', (t) => {
  const repo = repoWithRequest(t);
  const r = runAl(repo.dir, ['context', 'invoice-download']);
  assert.equal(r.code, 0, r.stderr);
  assertFrame(r.stdout, { read: 'working tree', main: 'local main' });
  assert.ok(!r.stdout.includes('origin/main'), r.stdout);
});

test('[VW-9] with origin/main, context names it with the timestamp of its last fetch, not an age', (t) => {
  const repo = repoWithRequest(t);
  addOrigin(t, repo, { fetchedAt: '2026-09-21T07:45:00Z' });
  const r = runAl(repo.dir, ['context', 'invoice-download'], { env: { SOURCE_DATE_EPOCH: '1790206200' } });
  assert.equal(r.code, 0, r.stderr);
  assertFrame(r.stdout, { read: 'working tree', main: 'origin/main' });
  const line = r.stdout.split('\n').find((l) => l.includes('origin/main'));
  assert.ok(line.includes('2026-09-21T07:45Z'), `origin/main line should carry the fetch time:\n${r.stdout}`);
  assert.ok(!r.stdout.includes('local main'), r.stdout);
});

// The request, then two more commits on main, and a branch `other`: a clone of
// depth 1 holds only main's last commit.
function repoWithHistory(t) {
  const repo = repoWithRequest(t);
  repo.write('later.txt', 'more\n');
  repo.commit('a later commit', { date: '2026-09-21T10:00:00Z' });
  repo.git(['branch', 'other']);
  repo.write('later.txt', 'even more\n');
  repo.commit('the last commit', { date: '2026-09-22T10:00:00Z' });
  return repo;
}

// Each clone lacks history its own way: the shallow one holds one commit
// where the source has four; the single-branch one lacks the branch `other`.
for (const [kind, opts, lacks] of [
  ['a shallow clone (--depth 1 --no-single-branch)', { depth: 1, singleBranch: false }, (clone, repo) => {
    assert.equal(clone.git(['rev-list', '--count', 'HEAD']), '1');
    assert.equal(repo.git(['rev-list', '--count', 'HEAD']), '4');
  }],
  ['a single-branch clone (--single-branch, not shallow)', { singleBranch: true }, (clone, repo) => {
    assert.equal(clone.git(['rev-parse', '--is-shallow-repository']), 'false');
    assert.equal(clone.git(['branch', '-r', '--list', 'origin/other']), '');
    assert.notEqual(repo.git(['branch', '--list', 'other']), '');
  }],
]) {
  test(`[VW-9] in ${kind} that lacks history, context and context --at say "history unavailable", never "nothing found"`, (t) => {
    const repo = repoWithHistory(t);
    const clone = cloneRepo(t, repo, opts);
    // The fixture really lacks history.
    lacks(clone, repo);
    const head = clone.head();
    for (const args of [['context', 'invoice-download'], ['context', 'invoice-download', '--at', head]]) {
      const r = runAl(clone.dir, args);
      assert.equal(r.code, 0, `${args.join(' ')}: ${r.stderr}`);
      assert.ok(r.stdout.includes('Customers can download invoices'), r.stdout);
      assert.ok(r.stdout.includes('history unavailable'), `${args.join(' ')}:\n${r.stdout}`);
      assert.ok(!/nothing found/i.test(r.stdout + r.stderr), r.stdout);
    }
  });
}

test('[VW-9] a full clone does not say "history unavailable"', (t) => {
  const repo = repoWithRequest(t);
  const full = cloneRepo(t, repo);
  const r = runAl(full.dir, ['context', 'invoice-download']);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(!r.stdout.includes('history unavailable'), r.stdout);
});

test('exit 2 on an unknown command or no command', (t) => {
  const repo = repoWithRequest(t);
  assert.equal(runAl(repo.dir, ['frobnicate']).code, 2);
  assert.equal(runAl(repo.dir, []).code, 2);
});
