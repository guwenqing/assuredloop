// [VW-9] --at a commit this clone does not hold: a clone that lacks history
// says "history unavailable" and how to fetch it; a full clone says "unknown commit".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cloneRepo, runAl, sha256 } from './helpers/fixture.js';
import { lines } from './helpers/output.js';

const WORDS = 'Customers keep asking to download their invoices.\n';
const NOWHERE_SHA = '0123456789abcdef0123456789abcdef01234567';

// main: initial, C1 (the request), C2, C3. Branch `other` from C2 with one commit of its own.
function source(t) {
  const repo = makeRepo(t);
  repo.write('requests/invoice-download/request.md',
    "# Customers can download invoices\nTier: 2 · Status: open\n\n## Owner's words and dialog\n\n" +
    '- 2026-09-20 owner chat, snapshot origin/2026-09-20-owner-words.md\n');
  repo.write('requests/invoice-download/origin/2026-09-20-owner-words.md',
    `Source: standard input\nFetched: 2026-09-20T09:00Z\nSHA-256: ${sha256(WORDS)}\n---\n${WORDS}`);
  const c1 = repo.commit('C1 request', { date: '2026-09-20T10:00:00Z' });
  repo.write('later.txt', 'two\n');
  const c2 = repo.commit('C2', { date: '2026-09-21T10:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'other']);
  repo.write('other.txt', 'only on other\n');
  const onOther = repo.commit('on other', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  repo.write('later.txt', 'three\n');
  const c3 = repo.commit('C3', { date: '2026-09-22T10:00:00Z' });
  return { repo, c1, c2, c3, onOther };
}

const holds = (clone, sha) => clone.git(['rev-list', '--all']).split('\n').includes(sha);

function assertHistoryUnavailable(clone, r, asGiven) {
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.ok(r.stdout.includes('history unavailable'), r.stdout);
  assert.ok(r.stdout.includes(asGiven), `should name the commit as given (${asGiven}):\n${r.stdout}`);
  assert.ok(!/unknown commit/i.test(r.stdout + r.stderr), r.stdout + r.stderr);
  assert.ok(!/nothing found/i.test(r.stdout + r.stderr), r.stdout + r.stderr);
  const ls = lines(r.stdout);
  assert.match(ls.at(-2), /^Next/, r.stdout);
  assert.match(ls.at(-2), /git fetch/, `Next should suggest fetching the missing history:\n${r.stdout}`);
  assert.match(ls.at(-1), /^Not known/, r.stdout);
  assert.equal(clone.git(['status', '--porcelain']), '', 'nothing written');
}

function assertUnknownCommit(repo, r) {
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.ok((r.stdout + r.stderr).includes('unknown commit'), r.stdout + r.stderr);
  assert.ok(!(r.stdout + r.stderr).includes('history unavailable'), r.stdout + r.stderr);
  assert.equal(repo.git(['status', '--porcelain']), '', 'nothing written');
}

test('[VW-9] a shallow clone asked --at an older main commit it lacks says "history unavailable", suggests git fetch, exits 2', (t) => {
  const { repo, c1 } = source(t);
  const clone = cloneRepo(t, repo, { depth: 1, singleBranch: false });
  assert.equal(clone.git(['rev-parse', '--is-shallow-repository']), 'true');
  assert.ok(!holds(clone, c1), 'the fixture clone must lack C1');
  assertHistoryUnavailable(clone, runAl(clone.dir, ['context', 'invoice-download', '--at', c1]), c1);
});

test('[VW-9] a shallow clone asked --at a short sha of a commit it lacks names the sha as given', (t) => {
  const { repo, c2 } = source(t);
  const clone = cloneRepo(t, repo, { depth: 1, singleBranch: false });
  assert.ok(!holds(clone, c2));
  const short = c2.slice(0, 10);
  assertHistoryUnavailable(clone, runAl(clone.dir, ['context', 'invoice-download', '--at', short]), short);
});

test('[VW-9] a single-branch clone that is not shallow, asked --at a commit only on another branch, says "history unavailable", exits 2', (t) => {
  const { repo, c1, onOther } = source(t);
  const clone = cloneRepo(t, repo, { singleBranch: true });
  assert.equal(clone.git(['rev-parse', '--is-shallow-repository']), 'false');
  assert.ok(holds(clone, c1), 'the clone holds all of main');
  assert.ok(!holds(clone, onOther), 'the fixture clone must lack the commit on other');
  assertHistoryUnavailable(clone, runAl(clone.dir, ['context', 'invoice-download', '--at', onOther]), onOther);
  // Contrast: an old main commit it does hold reads fine.
  const ok = runAl(clone.dir, ['context', 'invoice-download', '--at', c1]);
  assert.equal(ok.code, 0, ok.stderr);
  assert.ok(!ok.stdout.includes('history unavailable'), ok.stdout);
});

test('[VW-9] a full clone asked --at a sha that exists nowhere says "unknown commit", not "history unavailable", exits 2', (t) => {
  const { repo, c1 } = source(t);
  const clone = cloneRepo(t, repo);
  assert.equal(clone.git(['rev-parse', '--is-shallow-repository']), 'false');
  assertUnknownCommit(clone, runAl(clone.dir, ['context', 'invoice-download', '--at', NOWHERE_SHA]));
  // Contrast: an old commit it holds reads fine.
  assert.equal(runAl(clone.dir, ['context', 'invoice-download', '--at', c1]).code, 0);
});

test('[VW-9] a full clone asked --at a ref name that exists nowhere says "unknown commit", exits 2', (t) => {
  const { repo } = source(t);
  const clone = cloneRepo(t, repo);
  assertUnknownCommit(clone, runAl(clone.dir, ['context', 'invoice-download', '--at', 'no-such-branch']));
});

test('[VW-9] a repo with no remote asked --at a sha that exists nowhere says "unknown commit", exits 2', (t) => {
  const { repo } = source(t);
  assertUnknownCommit(repo, runAl(repo.dir, ['context', 'invoice-download', '--at', NOWHERE_SHA]));
});
