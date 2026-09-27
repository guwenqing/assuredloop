// [VW-9] origin/main is named with the time it was last fetched, and a clone is
// a fetch: FETCH_HEAD's mtime, else origin/main's last reflog entry, else the
// `clone:` entry of origin/HEAD's reflog. Times come from git, never the clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, utimesSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, cloneRepo, runAl, sha256 } from './helpers/fixture.js';
import { assertFrame } from './helpers/output.js';

const WORDS = 'Customers keep asking to download their invoices.\n';
const CLONED = '2026-09-21T07:45:00Z';
const ENV = { SOURCE_DATE_EPOCH: '1790206200' }; // 2026-09-23T23:30Z, matches none of the times below

function clonedSource(t) {
  const repo = makeRepo(t);
  repo.write('requests/invoice-download/request.md',
    "# Customers can download invoices\nTier: 2 · Status: open\n\n## Owner's words and dialog\n\n" +
    '- 2026-09-20 owner chat, snapshot origin/2026-09-20-owner-words.md\n');
  repo.write('requests/invoice-download/origin/2026-09-20-owner-words.md',
    `Source: standard input\nFetched: 2026-09-20T09:00Z\nSHA-256: ${sha256(WORDS)}\n---\n${WORDS}`);
  repo.commit('add request', { date: '2026-09-20T10:00:00Z' });
  const clone = cloneRepo(t, repo, { date: CLONED });
  return { repo, clone };
}

function originLine(stdout) {
  const line = stdout.split('\n').find((l) => l.includes('origin/main'));
  assert.ok(line, `no origin/main line:\n${stdout}`);
  return line;
}

test('[VW-9] a fresh clone names origin/main "fetched at clone" with the clone\'s time', (t) => {
  const { clone } = clonedSource(t);
  assert.ok(!existsSync(join(clone.dir, '.git/FETCH_HEAD')), 'the fixture clone has no FETCH_HEAD');
  const r = runAl(clone.dir, ['context', 'invoice-download'], { env: ENV });
  assert.equal(r.code, 0, r.stderr);
  const line = originLine(r.stdout);
  assert.ok(line.includes('fetched at clone'), line);
  assert.ok(line.includes('2026-09-21T07:45Z'), line);
  assert.ok(!line.includes('unknown'), line);
  assertFrame(r.stdout, { main: 'origin/main' });
});

test('[VW-9] after a fetch that moved origin/main, the fetch time is shown, not the clone time', (t) => {
  const { repo, clone } = clonedSource(t);
  repo.write('later.txt', 'more\n');
  repo.commit('later', { date: '2026-09-22T10:00:00Z' });
  clone.git(['fetch', '-q', 'origin'], { date: '2026-09-24T12:30:00Z' });
  const when = new Date('2026-09-24T12:30:00Z');
  utimesSync(join(clone.dir, '.git/FETCH_HEAD'), when, when);
  const r = runAl(clone.dir, ['context', 'invoice-download'], { env: ENV });
  assert.equal(r.code, 0, r.stderr);
  const line = originLine(r.stdout);
  assert.ok(line.includes('2026-09-24T12:30Z'), line);
  assert.ok(!line.includes('fetched at clone'), line);
  assert.ok(!line.includes('2026-09-21T07:45Z'), line);
});

test('[VW-9] after a fetch that found nothing new, FETCH_HEAD\'s time is shown, not the clone time', (t) => {
  const { clone } = clonedSource(t);
  clone.git(['fetch', '-q', 'origin'], { date: '2026-09-25T06:10:00Z' });
  const when = new Date('2026-09-25T06:10:00Z');
  utimesSync(join(clone.dir, '.git/FETCH_HEAD'), when, when);
  const r = runAl(clone.dir, ['context', 'invoice-download'], { env: ENV });
  assert.equal(r.code, 0, r.stderr);
  const line = originLine(r.stdout);
  assert.ok(line.includes('2026-09-25T06:10Z'), line);
  assert.ok(!line.includes('fetched at clone'), line);
  assert.ok(!line.includes('2026-09-21T07:45Z'), line);
});

test('[VW-9] with no FETCH_HEAD, origin/main\'s last reflog entry wins over the clone entry', (t) => {
  const { repo, clone } = clonedSource(t);
  repo.write('later.txt', 'more\n');
  repo.commit('later', { date: '2026-09-22T10:00:00Z' });
  clone.git(['fetch', '-q', 'origin'], { date: '2026-09-24T12:30:00Z' });
  rmSync(join(clone.dir, '.git/FETCH_HEAD'));
  const r = runAl(clone.dir, ['context', 'invoice-download'], { env: ENV });
  assert.equal(r.code, 0, r.stderr);
  const line = originLine(r.stdout);
  assert.ok(line.includes('2026-09-24T12:30Z'), line);
  assert.ok(!line.includes('fetched at clone'), line);
});

test('[VW-9] when FETCH_HEAD is newer than origin/main\'s last reflog entry, the last fetch (FETCH_HEAD) wins', (t) => {
  const { repo, clone } = clonedSource(t);
  repo.write('later.txt', 'more\n');
  repo.commit('later', { date: '2026-09-22T10:00:00Z' });
  clone.git(['fetch', '-q', 'origin'], { date: '2026-09-24T12:30:00Z' }); // moves origin/main: reflog T1
  clone.git(['fetch', '-q', 'origin'], { date: '2026-09-26T18:05:00Z' }); // nothing new: FETCH_HEAD only
  const when = new Date('2026-09-26T18:05:00Z');
  utimesSync(join(clone.dir, '.git/FETCH_HEAD'), when, when);
  assert.ok(clone.git(['reflog', 'show', '--date=iso-strict', 'refs/remotes/origin/main']).includes('2026-09-24T12:30:00Z'),
    'the fixture reflog should still say T1');
  const r = runAl(clone.dir, ['context', 'invoice-download'], { env: ENV });
  assert.equal(r.code, 0, r.stderr);
  const line = originLine(r.stdout);
  assert.ok(line.includes('2026-09-26T18:05Z'), line);
  assert.ok(!line.includes('2026-09-24T12:30Z'), line);
  assert.ok(!line.includes('fetched at clone'), line);
});

// FETCH_HEAD counts only when it lists origin's main (`branch 'main' of <origin url>`).
function fetchAt(clone, args, iso) {
  clone.git(['fetch', '-q', ...args], { date: iso });
  const when = new Date(iso);
  utimesSync(join(clone.dir, '.git/FETCH_HEAD'), when, when);
  return readFileSync(join(clone.dir, '.git/FETCH_HEAD'), 'utf8');
}

test('[VW-9] a one-branch fetch of origin (not main) does not count as a fetch of origin/main', (t) => {
  const { repo, clone } = clonedSource(t);
  repo.git(['checkout', '-q', '-b', 'feature']);
  repo.write('feature.txt', 'on feature\n');
  repo.commit('feature work', { date: '2026-09-22T10:00:00Z' });
  const fetchHead = fetchAt(clone, ['origin', 'feature'], '2026-09-26T18:05:00Z');
  assert.match(fetchHead, /branch 'feature' of /, fetchHead);
  assert.doesNotMatch(fetchHead, /branch 'main' of /, fetchHead);
  const r = runAl(clone.dir, ['context', 'invoice-download'], { env: ENV });
  assert.equal(r.code, 0, r.stderr);
  const line = originLine(r.stdout);
  assert.ok(!line.includes('2026-09-26T18:05Z'), line);
  assert.ok(line.includes('fetched at clone'), line);
  assert.ok(line.includes('2026-09-21T07:45Z'), line);
});

test('[VW-9] a fetch from another remote, even of its main, does not count as a fetch of origin/main', (t) => {
  const { clone } = clonedSource(t);
  const other = makeRepo(t);
  other.write('other.txt', 'another repo\n');
  other.commit('other work', { date: '2026-09-22T10:00:00Z' });
  clone.git(['remote', 'add', 'other', other.dir]);
  const fetchHead = fetchAt(clone, ['other'], '2026-09-26T18:05:00Z');
  assert.ok(fetchHead.includes(`branch 'main' of ${other.dir}`), fetchHead);
  const r = runAl(clone.dir, ['context', 'invoice-download'], { env: ENV });
  assert.equal(r.code, 0, r.stderr);
  const line = originLine(r.stdout);
  assert.ok(!line.includes('2026-09-26T18:05Z'), line);
  assert.ok(line.includes('fetched at clone'), line);
  assert.ok(line.includes('2026-09-21T07:45Z'), line);
});
