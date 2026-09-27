// [VW-9] origin/main is named with the time its ref last moved: origin/main's
// latest reflog entry (`origin/main as of <time>`), else the `clone:` entry of
// origin/HEAD's reflog (`origin/main as of <time> (clone)`), else
// `origin/main (time unknown)`. FETCH_HEAD is never used: it cannot tell which
// fetch touched main. Times come from git, never the clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, utimesSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, cloneRepo, runAl, sha256 } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';

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

const CLONE_LABEL = 'origin/main as of 2026-09-21T07:45Z (clone)';

// The line names the time from the reflog, not the clone, and never says "fetched".
function assertAsOf(stdout, time) {
  const line = originLine(stdout);
  assert.ok(line.includes(`origin/main as of ${time}`), line);
  assert.ok(!line.includes('(clone)'), line);
  assert.doesNotMatch(line, /fetched/, line);
  return line;
}

function assertAsOfClone(stdout) {
  const line = originLine(stdout);
  assert.ok(line.includes(CLONE_LABEL), line);
  assert.doesNotMatch(line, /fetched/, line);
  return line;
}

// A fetch at `iso`, with FETCH_HEAD's mtime set to it so a tool reading FETCH_HEAD shows it.
function fetchAt(clone, args, iso) {
  clone.git(['fetch', '-q', ...args], { date: iso });
  const when = new Date(iso);
  utimesSync(join(clone.dir, '.git/FETCH_HEAD'), when, when);
  return readFileSync(join(clone.dir, '.git/FETCH_HEAD'), 'utf8');
}

const reflog = (clone) => clone.git(['reflog', 'show', '--date=iso-strict', 'refs/remotes/origin/main']);

test('[VW-9] a fresh clone names origin/main "as of" the clone\'s time, labelled (clone), and Not known says it may have moved since', (t) => {
  const { clone } = clonedSource(t);
  assert.ok(!existsSync(join(clone.dir, '.git/FETCH_HEAD')), 'the fixture clone has no FETCH_HEAD');
  const r = runAl(clone.dir, ['context', 'invoice-download'], { env: ENV });
  assert.equal(r.code, 0, r.stderr);
  const line = assertAsOfClone(r.stdout);
  assert.ok(!line.includes('unknown'), line);
  const notKnown = lines(r.stdout).at(-1);
  assert.ok(notKnown.includes('whether origin/main moved after'), notKnown);
  assert.ok(notKnown.includes('2026-09-21T07:45Z'), notKnown);
  assertFrame(r.stdout, { main: 'origin/main' });
});

test('[VW-9] after a fetch that moved origin/main, its reflog time is shown, not the clone time, and Not known names it', (t) => {
  const { repo, clone } = clonedSource(t);
  repo.write('later.txt', 'more\n');
  repo.commit('later', { date: '2026-09-22T10:00:00Z' });
  fetchAt(clone, ['origin'], '2026-09-24T12:30:00Z');
  const r = runAl(clone.dir, ['context', 'invoice-download'], { env: ENV });
  assert.equal(r.code, 0, r.stderr);
  const line = assertAsOf(r.stdout, '2026-09-24T12:30Z');
  assert.ok(!line.includes('2026-09-21T07:45Z'), line);
  const notKnown = lines(r.stdout).at(-1);
  assert.ok(notKnown.includes('whether origin/main moved after'), notKnown);
  assert.ok(notKnown.includes('2026-09-24T12:30Z'), notKnown);
});

test('[VW-9] a fetch that found nothing new leaves no record: the clone time is still shown, not FETCH_HEAD\'s time', (t) => {
  const { clone } = clonedSource(t);
  fetchAt(clone, ['origin'], '2026-09-25T06:10:00Z');
  const r = runAl(clone.dir, ['context', 'invoice-download'], { env: ENV });
  assert.equal(r.code, 0, r.stderr);
  const line = assertAsOfClone(r.stdout);
  assert.ok(!line.includes('2026-09-25T06:10Z'), line);
});

test('[VW-9] with no FETCH_HEAD, origin/main\'s last reflog entry wins over the clone entry', (t) => {
  const { repo, clone } = clonedSource(t);
  repo.write('later.txt', 'more\n');
  repo.commit('later', { date: '2026-09-22T10:00:00Z' });
  clone.git(['fetch', '-q', 'origin'], { date: '2026-09-24T12:30:00Z' });
  rmSync(join(clone.dir, '.git/FETCH_HEAD'));
  const r = runAl(clone.dir, ['context', 'invoice-download'], { env: ENV });
  assert.equal(r.code, 0, r.stderr);
  assertAsOf(r.stdout, '2026-09-24T12:30Z');
});

test('[VW-9] when FETCH_HEAD is newer than origin/main\'s last reflog entry, the reflog time is shown, not FETCH_HEAD\'s', (t) => {
  const { repo, clone } = clonedSource(t);
  repo.write('later.txt', 'more\n');
  repo.commit('later', { date: '2026-09-22T10:00:00Z' });
  fetchAt(clone, ['origin'], '2026-09-24T12:30:00Z'); // moves origin/main: reflog T1
  fetchAt(clone, ['origin'], '2026-09-26T18:05:00Z'); // nothing new: FETCH_HEAD only
  assert.ok(reflog(clone).includes('2026-09-24T12:30:00Z'), 'the fixture reflog should still say T1');
  const r = runAl(clone.dir, ['context', 'invoice-download'], { env: ENV });
  assert.equal(r.code, 0, r.stderr);
  const line = assertAsOf(r.stdout, '2026-09-24T12:30Z');
  assert.ok(!line.includes('2026-09-26T18:05Z'), line);
});

test('[VW-9] regression: fetch origin main at T1, then fetch --append origin feature at T2: T1 is shown, not T2', (t) => {
  const { repo, clone } = clonedSource(t);
  repo.write('later.txt', 'more\n');
  repo.commit('later on main', { date: '2026-09-22T10:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'feature']);
  repo.write('feature.txt', 'on feature\n');
  repo.commit('feature work', { date: '2026-09-22T11:00:00Z' });
  fetchAt(clone, ['origin', 'main'], '2026-09-24T12:30:00Z');
  const fetchHead = fetchAt(clone, ['--append', 'origin', 'feature'], '2026-09-26T18:05:00Z');
  // FETCH_HEAD still lists origin's main, yet its mtime is T2.
  assert.match(fetchHead, /branch 'main' of /, fetchHead);
  assert.match(fetchHead, /branch 'feature' of /, fetchHead);
  assert.ok(reflog(clone).includes('2026-09-24T12:30:00Z'), 'the fixture reflog should say T1');
  const r = runAl(clone.dir, ['context', 'invoice-download'], { env: ENV });
  assert.equal(r.code, 0, r.stderr);
  const line = assertAsOf(r.stdout, '2026-09-24T12:30Z');
  assert.ok(!line.includes('2026-09-26T18:05Z'), line);
});

test('[VW-9] a one-branch fetch of origin (not main) does not change origin/main\'s time', (t) => {
  const { repo, clone } = clonedSource(t);
  repo.git(['checkout', '-q', '-b', 'feature']);
  repo.write('feature.txt', 'on feature\n');
  repo.commit('feature work', { date: '2026-09-22T10:00:00Z' });
  const fetchHead = fetchAt(clone, ['origin', 'feature'], '2026-09-26T18:05:00Z');
  assert.match(fetchHead, /branch 'feature' of /, fetchHead);
  assert.doesNotMatch(fetchHead, /branch 'main' of /, fetchHead);
  const r = runAl(clone.dir, ['context', 'invoice-download'], { env: ENV });
  assert.equal(r.code, 0, r.stderr);
  const line = assertAsOfClone(r.stdout);
  assert.ok(!line.includes('2026-09-26T18:05Z'), line);
});

test('[VW-9] a fetch from another remote, even of its main, does not change origin/main\'s time', (t) => {
  const { clone } = clonedSource(t);
  const other = makeRepo(t);
  other.write('other.txt', 'another repo\n');
  other.commit('other work', { date: '2026-09-22T10:00:00Z' });
  clone.git(['remote', 'add', 'other', other.dir]);
  const fetchHead = fetchAt(clone, ['other'], '2026-09-26T18:05:00Z');
  assert.ok(fetchHead.includes(`branch 'main' of ${other.dir}`), fetchHead);
  const r = runAl(clone.dir, ['context', 'invoice-download'], { env: ENV });
  assert.equal(r.code, 0, r.stderr);
  const line = assertAsOfClone(r.stdout);
  assert.ok(!line.includes('2026-09-26T18:05Z'), line);
});

test('[VW-9] with no origin/main reflog and no clone entry, origin/main\'s time is unknown, even when FETCH_HEAD exists', (t) => {
  const { clone } = clonedSource(t);
  fetchAt(clone, ['origin'], '2026-09-25T06:10:00Z');
  rmSync(join(clone.dir, '.git/logs/refs/remotes'), { recursive: true, force: true });
  const r = runAl(clone.dir, ['context', 'invoice-download'], { env: ENV });
  assert.equal(r.code, 0, r.stderr);
  const line = originLine(r.stdout);
  assert.ok(line.includes('origin/main (time unknown)'), line);
  assert.ok(!line.includes('2026-09-25T06:10Z'), line);
  assert.ok(!line.includes('2026-09-21T07:45Z'), line);
});
