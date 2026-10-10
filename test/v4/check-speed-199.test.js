// Issue #199: al check within 10 s at 1,000 requests. Written before the code,
// from the issue and the interface note (interface-199.md), by a different
// author than the code.
//
// 1. commitsOf(dir, revs) in src/v4/git.js: one git process for any number of
//    revs, none for an empty list; each value equals commitOf(dir, rev).
// 2. mergesOf(dir, commit): one git process; the function it returns gives,
//    for each n, what mergeOf(dir, commit, n) gives.
// 3. The output of `al-v4 check` and `al-v4 context` stays as it was on main
//    at 4d983cf, byte for byte, in the worlds that the interface names. The
//    expected text below is that output, taken from main. Commit hashes in it
//    are shown by name ({<repo>:<subject>} for a full hash, {...:7} for its
//    first 7), so that the text does not hang on how the worlds are hashed.
// 4. The number of git processes that one `al-v4 check` (or `al-v4 context`)
//    starts does not grow with the number of result files in an output repo,
//    nor with the number of PR references in the records (5 against 60).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as gitjs from '../../src/v4/git.js';
import { makeRepo } from './helpers/repo.js';
import { blobSha, centralConfig, commit, world, worldOutputs } from './helpers/cross-repo.js';
import { invoicer } from './helpers/invoicer.js';
import { al, commitAll, git, move, read, readYaml, show, write, writeYaml } from './helpers/project.js';

const GIT_JS = fileURLToPath(new URL('../../src/v4/git.js', import.meta.url));
const { commitOf, mergeOf } = gitjs;

// The new functions, with a clear failure while they are not exported.
function fn(name) {
  assert.equal(typeof gitjs[name], 'function', `src/v4/git.js exports ${name}`);
  return gitjs[name];
}

function cleanEnv(extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_') && k !== 'SOURCE_DATE_EPOCH') env[k] = v;
  return { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', ...extra };
}

// n commits made with one `git fast-import`, each on top of the one before,
// on `ref` (a new ref: the first is a root commit). Fixed dates, so the same
// hashes each run. Their full hashes, oldest first.
function fastCommits(dir, ref, n, subject) {
  let input = '';
  for (let i = 1; i <= n; i++) {
    const msg = `${subject} ${i}\n`;
    input += `commit ${ref}\ncommitter Fixture Committer <committer@example.invalid> 1767225600 +0000\ndata ${Buffer.byteLength(msg)}\n${msg}\n`;
  }
  const r = spawnSync('git', ['-C', dir, 'fast-import', '--quiet'], { input, env: cleanEnv(), encoding: 'utf8', timeout: 60_000 });
  assert.equal(r.status, 0, `git fast-import in ${dir}:\n${r.stderr}`);
  return git(dir, 'rev-list', '--reverse', ref).split('\n');
}

// The first 4 characters that two of the commits share: a short hash that is
// ambiguous between two commits.
function sharedPrefix(shas) {
  const seen = new Set();
  for (const s of shas) {
    const p = s.slice(0, 4);
    if (seen.has(p)) return p;
    seen.add(p);
  }
  assert.fail(`no two of ${shas.length} commits share 4 characters`);
}

// A 7-character hash that no object in the repo starts with.
function absentShort(dir) {
  const all = git(dir, 'cat-file', '--batch-all-objects', '--batch-check=%(objectname)').split('\n');
  const found = ['abcdef0', 'fedcba9', '0123456', '7654321'].find((c) => !all.some((o) => o.startsWith(c)));
  assert.ok(found, 'a 7-character hash that no object starts with');
  return found;
}

// --- counting git processes: a `git` first on PATH that logs a line, then
// runs the real git (as in git-batch-190.test.js).

const MARK = 'GITCALL';

function realGit() {
  const r = spawnSync('/bin/sh', ['-c', 'command -v git'], { encoding: 'utf8' });
  const p = r.stdout.trim();
  assert.ok(r.status === 0 && p.startsWith('/'), `command -v git finds git: ${JSON.stringify(r.stdout)} ${r.stderr}`);
  return p;
}

// A temp folder with the wrapper; `count()` reads how many git processes ran
// since the last `reset()`.
function gitCounter(t) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'al4-gitwrap-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const log = join(dir, 'calls.log');
  const wrapper = join(dir, 'git');
  writeFileSync(wrapper, ['#!/bin/sh', `printf '${MARK} %s\\n' "$*" >> '${log}'`, `exec '${realGit()}' "$@"`, ''].join('\n'));
  chmodSync(wrapper, 0o755);
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n') : []).filter((l) => l.startsWith(`${MARK} `));
  return {
    PATH: `${dir}:${process.env.PATH}`,
    reset: () => rmSync(log, { force: true }),
    calls,
    count: () => calls().length,
  };
}

// One call of commitsOf or mergesOf in a child node process with the wrapper
// first on PATH. commitsOf gives its Map as entries; mergesOf gives the value
// of its function for each of `ns`.
const CHILD = `
import { readFileSync } from 'node:fs';
const { mod, name, args, ns } = JSON.parse(readFileSync(0, 'utf8'));
const m = await import(mod);
if (typeof m[name] !== 'function') { console.log(JSON.stringify({ missing: name })); process.exit(3); }
const r = await m[name](...args);
if (name === 'commitsOf') console.log(JSON.stringify(r instanceof Map ? { map: [...r] } : { other: String(r) }));
else console.log(JSON.stringify(typeof r === 'function' ? { values: ns.map((n) => r(n)) } : { other: String(r) }));
`;

function inChild(counter, name, args, ns = []) {
  counter.reset();
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', CHILD], {
    input: JSON.stringify({ mod: pathToFileURL(GIT_JS).href, name, args, ns }),
    env: cleanEnv({ PATH: counter.PATH }),
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.equal(r.status, 0, `child ${name}: exit ${r.status} ${r.signal ?? ''}\n${r.stdout}\n${r.stderr}`);
  return { out: JSON.parse(r.stdout.trim().split('\n').at(-1)), processes: counter.count(), calls: counter.calls() };
}

// --- 1. commitsOf

// A repo with commits on main and on side, a tag v1 and an annotated tag v2,
// and 1,500 more commits on refs/collide/all, two of which share their first
// 4 characters.
function commitsRepo(t) {
  const repo = makeRepo(t);
  const c1 = repo.head();
  repo.write('a.txt', 'second\n');
  const c2 = repo.commit('second');
  repo.git(['branch', 'side', c1]);
  repo.git(['tag', 'v1', c2]);
  repo.git(['tag', '-a', '-m', 'release one', 'v2', c1]);
  const many = fastCommits(repo.dir, 'refs/collide/all', 1500, 'collide');
  const dir = repo.dir;
  return {
    dir, c1, c2, many,
    ambiguous: sharedPrefix(many),
    absent: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    absentShort: absentShort(dir),
    tagObject: git(dir, 'rev-parse', 'v2'),
    tree: git(dir, 'rev-parse', 'HEAD^{tree}'),
    blob: git(dir, 'rev-parse', 'HEAD:README.md'),
  };
}

// Every rev: its value in the Map equals commitOf's, and the Map has no other key.
function assertLikeCommitOf(dir, revs, map) {
  assert.ok(map instanceof Map, `commitsOf returns a Map: ${map}`);
  for (const r of revs) {
    assert.ok(map.has(r), `the Map has the rev ${JSON.stringify(String(r))}`);
    assert.equal(map.get(r), commitOf(dir, r), `the value of ${JSON.stringify(String(r))}`);
  }
  assert.equal(map.size, new Set(revs).size, `one key for each rev given: ${[...map.keys()].map(String).join(', ')}`);
}

describe('commitsOf: the full hash of each rev, as commitOf gives it', () => {
  test('full and short hashes, an ambiguous and an absent hash, a branch, tags, a tree, a blob, non-strings', (t) => {
    const commitsOf = fn('commitsOf');
    const w = commitsRepo(t);
    const obj = {};
    const list = [w.c1, w.c2.slice(0, 7), w.c2.slice(0, 12), w.ambiguous, w.absent, w.absentShort, 'main', 'side', 'v1', 'v2', w.tagObject,
      w.tree, w.blob, w.many[700], w.many[701].slice(0, 7), 'no-such-branch', '', 123, null, undefined, obj, ['main']];
    const got = commitsOf(w.dir, list);
    assertLikeCommitOf(w.dir, list, got);
    // What those values are, so that the test does not pass on two nulls.
    assert.equal(got.get(w.c1), w.c1);
    assert.equal(got.get(w.c2.slice(0, 7)), w.c2);
    assert.equal(got.get(w.c2.slice(0, 12)), w.c2);
    assert.equal(got.get(w.ambiguous), null, `${w.ambiguous} is ambiguous`);
    assert.equal(got.get(w.absent), null);
    assert.equal(got.get(w.absentShort), null);
    assert.equal(got.get('main'), w.c2);
    assert.equal(got.get('side'), w.c1);
    assert.equal(got.get('v1'), w.c2);
    assert.equal(got.get('v2'), w.c1, 'an annotated tag gives its commit');
    assert.equal(got.get(w.tagObject), w.c1, 'the hash of an annotated tag gives its commit');
    assert.equal(got.get(w.tree), null, 'a tree is not a commit');
    assert.equal(got.get(w.blob), null, 'a blob is not a commit');
    assert.equal(got.get(w.many[700]), w.many[700]);
    assert.equal(got.get(w.many[701].slice(0, 7)), w.many[701]);
    for (const x of ['no-such-branch', '', 123, null, undefined, obj]) assert.equal(got.get(x), null, String(x));
  });

  test('odd revs give what commitOf gives', (t) => {
    const commitsOf = fn('commitsOf');
    const w = commitsRepo(t);
    const list = [' ', 'HEAD', 'HEAD~1', 'main^', 'main:README.md', 'main^{tree}', 'v2^{}', 'v2^{tag}', '-n', '--all', '--end-of-options',
      'a b', `${w.c2} ${w.c1}`, ':/second', 'main..side', '@', 'x\ny', 'main\n', 'main\r', '\tmain', w.c1.toUpperCase(), `${w.c1}x`,
      `${w.ambiguous}^{commit}`, w.c1.slice(0, 3), 'refs/collide/all', 'collide/all'];
    assertLikeCommitOf(w.dir, list, commitsOf(w.dir, list));
  });

  test('a rev given twice is one key', (t) => {
    const commitsOf = fn('commitsOf');
    const w = commitsRepo(t);
    const list = ['main', w.c1, 'main', w.c1, w.absent, w.absent];
    const got = commitsOf(w.dir, list);
    assertLikeCommitOf(w.dir, list, got);
    assert.equal(got.size, 3);
  });

  test('one git process for 3 revs and for 60, none for an empty list', (t) => {
    fn('commitsOf');
    const w = commitsRepo(t);
    const counter = gitCounter(t);
    const three = [w.c2, w.c1.slice(0, 7), w.absent];
    const sixty = [
      ...w.many.slice(0, 25), ...w.many.slice(25, 50).map((s) => s.slice(0, 7)),
      'main', 'side', 'v1', 'v2', w.tagObject, w.tree, w.blob, w.ambiguous, w.absent, w.absentShort,
    ];
    assert.equal(sixty.length, 60);
    for (const [revs, label] of [[three, '3 revs'], [sixty, '60 revs']]) {
      const r = inChild(counter, 'commitsOf', [w.dir, revs]);
      assert.ok(r.out.map, `commitsOf gives a Map: ${JSON.stringify(r.out)}`);
      const got = new Map(r.out.map);
      assertLikeCommitOf(w.dir, revs, got);
      assert.equal(r.processes, 1, `one git process for ${label}:\n${r.calls.join('\n')}`);
    }
    const none = inChild(counter, 'commitsOf', [w.dir, []]);
    assert.deepEqual(none.out, { map: [] });
    assert.equal(none.processes, 0, `no git process for an empty list:\n${none.calls.join('\n')}`);
  });
});

// --- 2. mergesOf

// First-parent history of main, newest first:
//   c12 "Tidy (#0)"                      c11 "Merge pull request #40from owner/x"
//   c10 "Bump the version (#170)"        c9  "Merge pull request #12"
//   c8  "Fix two things (#22) (#23)"     c7  "(#21) at the start"
//   c6  merge "Merge pull request #7 from owner/again"
//   c5  "Redo the export (#5)"
//   c4  merge "Merge pull request #70 from owner/f3"
//   c3  merge "Merge pull request #7 from owner/f1" (#30 only in its body); its
//       side branch has "Side fix (#9)", "Deep side work (#31)" and the merge
//       "Merge pull request #11 from owner/f2", which are not first-parent.
//   c2  "Add the export (#5)"            c1  "initial"
function mergesRepo(t) {
  const repo = makeRepo(t);
  const g = (...args) => repo.git(args);
  const c = { c1: repo.head() };
  let k = 0;
  const file = () => repo.write(`f${++k}.txt`, `${k}\n`);
  file(); c.c2 = repo.commit('Add the export (#5)');
  g('checkout', '-q', '-b', 'f1');
  file(); repo.commit('Side fix (#9)');
  g('checkout', '-q', '-b', 'f2');
  file(); repo.commit('Deep side work (#31)');
  g('checkout', '-q', 'f1');
  g('merge', '-q', '--no-ff', 'f2', '-m', 'Merge pull request #11 from owner/f2');
  g('checkout', '-q', 'main');
  g('merge', '-q', '--no-ff', 'f1', '-m', 'Merge pull request #7 from owner/f1\n\nMerge pull request #30 is named only in this body.');
  c.c3 = repo.head();
  g('checkout', '-q', '-b', 'f3');
  file(); repo.commit('Seventy work');
  g('checkout', '-q', 'main');
  g('merge', '-q', '--no-ff', 'f3', '-m', 'Merge pull request #70 from owner/f3');
  c.c4 = repo.head();
  file(); c.c5 = repo.commit('Redo the export (#5)');
  g('checkout', '-q', '-b', 'f4');
  file(); repo.commit('Again');
  g('checkout', '-q', 'main');
  g('merge', '-q', '--no-ff', 'f4', '-m', 'Merge pull request #7 from owner/again');
  c.c6 = repo.head();
  c.c7 = repo.commit('(#21) at the start');
  c.c8 = repo.commit('Fix two things (#22) (#23)');
  c.c9 = repo.commit('Merge pull request #12');
  c.c10 = repo.commit('Bump the version (#170)');
  c.c11 = repo.commit('Merge pull request #40from owner/x');
  c.c12 = repo.commit('Tidy (#0)');
  return { dir: repo.dir, ...c };
}

const NS = [0, 1, 5, 7, 9, 11, 12, 17, 21, 22, 23, 30, 31, 40, 70, 99, 170, '5', '07', '170', '1', '12'];

describe('mergesOf: one read of the first-parent history, and each n as mergeOf gives it', () => {
  test('at main: found, not found, a repeated n (the newest wins), and a merge only on a side branch', (t) => {
    const mergesOf = fn('mergesOf');
    const w = mergesRepo(t);
    const at = mergesOf(w.dir, 'main');
    assert.equal(typeof at, 'function', 'mergesOf returns a function');
    for (const n of NS) assert.equal(at(n), mergeOf(w.dir, 'main', n), `n = ${JSON.stringify(n)}`);
    // What those values are, so that the test does not pass on two nulls.
    const want = { 0: w.c12, 5: w.c5, 7: w.c6, 12: w.c9, 23: w.c8, 70: w.c4, 170: w.c10 };
    for (const n of [0, 1, 5, 7, 9, 11, 12, 17, 21, 22, 23, 30, 31, 40, 70, 99, 170]) assert.equal(at(n), want[n] ?? null, `n = ${n}`);
    assert.equal(at('07'), w.c6);
  });

  test('at an older commit: only its first-parent history counts', (t) => {
    const mergesOf = fn('mergesOf');
    const w = mergesRepo(t);
    for (const commit of [w.c4, w.c4.slice(0, 7), w.c1]) {
      const at = mergesOf(w.dir, commit);
      for (const n of NS) assert.equal(at(n), mergeOf(w.dir, commit, n), `at ${commit}, n = ${JSON.stringify(n)}`);
    }
    const c4 = mergesOf(w.dir, w.c4);
    assert.deepEqual([c4(5), c4(7), c4(70), c4(23), c4(12)], [w.c2, w.c3, w.c4, null, null]);
  });

  test('at a commit that does not resolve: null for every n', (t) => {
    const mergesOf = fn('mergesOf');
    const w = mergesRepo(t);
    const at = mergesOf(w.dir, 'no-such-branch');
    for (const n of NS) {
      assert.equal(mergeOf(w.dir, 'no-such-branch', n), null);
      assert.equal(at(n), null, `n = ${JSON.stringify(n)}`);
    }
  });

  test('one git process for the whole lookup', (t) => {
    fn('mergesOf');
    const w = mergesRepo(t);
    const counter = gitCounter(t);
    const r = inChild(counter, 'mergesOf', [w.dir, 'main'], NS);
    assert.ok(r.out.values, `mergesOf gives a function: ${JSON.stringify(r.out)}`);
    assert.deepEqual(r.out.values, NS.map((n) => mergeOf(w.dir, 'main', n)));
    assert.equal(r.processes, 1, `one git process for ${NS.length} lookups:\n${r.calls.join('\n')}`);
    const gone = inChild(counter, 'mergesOf', [w.dir, 'no-such-branch'], NS);
    assert.deepEqual(gone.out.values, NS.map(() => null));
    assert.ok(gone.processes <= 1, `at most one git process:\n${gone.calls.join('\n')}`);
  });
});

// --- 3. The output of al-v4 check and al-v4 context, as on main at 4d983cf

// Each commit of each repo by name: { <full hash>: '<repo>:<subject>' }.
function commitNames(repos) {
  const names = new Map();
  for (const [repo, dir] of Object.entries(repos)) {
    const seen = new Map();
    for (const line of git(dir, 'log', '--all', '--topo-order', '--format=%H %s').split('\n')) {
      const sp = line.indexOf(' ');
      const sha = line.slice(0, sp);
      const label = `${repo}:${line.slice(sp + 1)}`;
      const k = (seen.get(label) ?? 0) + 1;
      seen.set(label, k);
      if (!names.has(sha)) names.set(sha, k === 1 ? label : `${label} (${k})`);
    }
  }
  return names;
}

// The output with each full hash of a commit as {name}, and its first 7 as
// {name:7}; any other text stays as it is. `extra` maps more text to its
// name: a path (starting with /) wherever it is, longest first; other text
// only as a whole word.
function named(stdout, repos, extra = {}) {
  const names = commitNames(repos);
  const short = new Map();
  for (const [sha, label] of names) short.set(sha.slice(0, 7), short.has(sha.slice(0, 7)) ? null : label);
  const entries = Object.entries(extra).sort(([a], [b]) => b.length - a.length);
  let text = stdout;
  for (const [from, to] of entries.filter(([k]) => k.startsWith('/'))) text = text.split(from).join(to);
  text = text.replace(/\b[0-9a-f]{7,40}\b/g, (h) => {
    if (h.length === 40 && names.has(h)) return `{${names.get(h)}}`;
    if (h.length === 7 && short.get(h)) return `{${short.get(h)}:7}`;
    return h;
  });
  for (const [from, to] of entries.filter(([k]) => !k.startsWith('/'))) text = text.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
  return text;
}

// The run, compared with the expected exit code and text.
function sameAsMain(r, repos, expected, extra) {
  assert.equal(r.signal, null, show(r));
  assert.equal(named(r.stdout, repos, extra), expected.lines.join('\n') + '\n', show(r));
  assert.equal(r.code, expected.code, show(r));
}

// The cross-repo world, with more results in invoicer-worker and more PR
// references in the central records:
// - worker: 1,500 commits on refs/collide/all (two share their first 4
//   characters); on main after K5 "First try (#14)", "Second try (#14)", the
//   merge "Merge pull request #15 ..." of a side branch with "Side work (#16)",
//   and the results commit K6 with results at a full hash, an ambiguous hash,
//   an absent short hash, a branch name, a tree, a number and a tag; the tag
//   v1 names K4.
// - central: the worker selected at K6 (short), and the PR references #10
//   (merged on main as "(#10)"), invoicer-worker#14, #15 and #16.
function crossWorld(t) {
  const w = world(t);
  const many = fastCommits(w.worker, 'refs/collide/all', 1500, 'collide');
  const ambiguous = sharedPrefix(many);
  const absent = absentShort(w.worker);
  const { K4, K5 } = w.shas.worker;
  const tree = git(w.worker, 'rev-parse', `${K4}^{tree}`);
  git(w.worker, 'tag', 'v1', K4);
  write(w.worker, 'docs/first.md', 'first\n');
  commit(w.worker, 'First try (#14)');
  write(w.worker, 'docs/first.md', 'second\n');
  commit(w.worker, 'Second try (#14)');
  git(w.worker, 'checkout', '-q', '-b', 'fifteen');
  write(w.worker, 'docs/side.md', 'side\n');
  commit(w.worker, 'Side work (#16)');
  git(w.worker, 'checkout', '-q', 'main');
  git(w.worker, 'merge', '-q', '--no-ff', 'fifteen', '-m', 'Merge pull request #15 from invoicer/fifteen');
  const input = [{ file: 'src/zip-export.js', sha256: blobSha(w.worker, K5, 'src/zip-export.js') }];
  const results = {
    'i-full.yaml': { check: 'test/zip-export.test.js', outcome: 'pass', commit: K5, inputs: input },
    'j-ambiguous.yaml': { check: 'test/zip-export.test.js', outcome: 'pass', commit: ambiguous, inputs: input },
    'k-absent-short.yaml': { check: 'test/zip-export.test.js', outcome: 'fail', commit: absent, inputs: input },
    'l-branch.yaml': { check: 'test/zip-export.test.js', outcome: 'pass', commit: 'zip-names', inputs: input },
    'm-tree.yaml': { check: 'test/zip-export.test.js', outcome: 'pass', commit: tree, inputs: input },
    'n-number.yaml': { check: 'test/zip-export.test.js', outcome: 'pass', commit: 1234567, inputs: input },
    'o-tag.yaml': { check: 'test/zip-export.test.js', outcome: 'pass', commit: 'v1', inputs: input },
  };
  for (const [file, value] of Object.entries(results)) writeYaml(w.worker, `.assuredloop/results/${file}`, value);
  const K6 = commit(w.worker, 'Record more results');
  centralConfig(w.central, worldOutputs(K6));
  const rel = '.assuredloop/records/requests/invoice-exports.yaml';
  const rec = readYaml(w.central, rel);
  rec.tasks.find((x) => x.id === 'T1').prs.push('#10');
  rec.tasks.find((x) => x.id === 'T2').prs.push('invoicer-worker#14', 'invoicer-worker#15', 'invoicer-worker#16');
  writeYaml(w.central, rel, rec);
  commit(w.central, 'More PR references');
  return {
    dir: w.central,
    repos: { central: w.central, web: w.web, worker: w.worker },
    extra: { [w.root]: '<root>', [ambiguous]: '{ambiguous}', [absent]: '{absent}', [tree]: '{tree of K4}', [tree.slice(0, 7)]: '{tree of K4:7}' },
  };
}

// cr-chain merged on main, then on main portal-downloads and link-refresh
// archived (so EXP-4 was removed by an archived request, and the dispositions
// of invoice-exports are superseded by archived changes); the branch pr2 cut
// from there, with one commit that `change` makes.
function archivedChain(t, change) {
  const dir = invoicer(t, 'cr-chain');
  git(dir, 'checkout', '-q', 'main');
  git(dir, 'merge', '-q', '--ff-only', 'pr');
  mkdirSync(join(dir, 'requests/archive'), { recursive: true });
  move(dir, 'requests/portal-downloads', 'requests/archive/portal-downloads');
  move(dir, 'requests/link-refresh', 'requests/archive/link-refresh');
  commitAll(dir, 'Archive portal-downloads and link-refresh');
  git(dir, 'checkout', '-q', '-b', 'pr2');
  change(dir);
  return dir;
}

function editText(dir, file, from, to) {
  const text = read(dir, file);
  assert.equal(text.split(from).length, 2, `${file} has ${JSON.stringify(from)} once`);
  write(dir, file, text.replace(from, to));
}

const notesOnly = (dir) => {
  write(dir, 'README.md', 'notes\n');
  commitAll(dir, 'Notes\n\nTier: 0 — notes only');
};

// Each case: how to build its world ({ dir, repos, extra }, see named()),
// and the commands run in it.
const onBranch = (name, arm) => (t) => ({ dir: invoicer(t, name, arm) });
const chain = (change) => (t) => ({ dir: archivedChain(t, change) });
const CASES = {
  cross: { build: crossWorld, runs: [['check'], ['context', 'invoice-exports'], ['context', 'invoice-exports/SP-10']] },
  clean: { build: onBranch('clean'), runs: [['check'], ['check', '--strict']] },
  'd09 defect': { build: onBranch('d09', 'defect'), runs: [['check']] },
  'd01 defect': { build: onBranch('d01', 'defect'), runs: [['check']] },
  'd10 defect': { build: onBranch('d10', 'defect'), runs: [['check']] },
  'd10 control': { build: onBranch('d10', 'control'), runs: [['check']] },
  'archived chain': { build: chain(notesOnly), runs: [['check'], ['context', 'invoice-exports'], ['context', 'portal-downloads']] },
  'archived chain, EXP-9 edited': {
    build: chain((dir) => {
      editText(dir, 'specs/exports.md', 'An accountant MUST log in to the portal before downloading an export.',
        'An accountant MUST log in to the portal before downloading any export.');
      commitAll(dir, 'Reword EXP-9\n\nTier: 0 — typo in EXP-9');
    }),
    runs: [['check']],
  },
  'archived chain, superseded request changed': {
    build: chain((dir) => {
      const rel = '.assuredloop/records/requests/invoice-exports.yaml';
      const rec = readYaml(dir, rel);
      (rec.tasks.find((x) => x.id === 'T1').prs ??= []).push('#41');
      writeYaml(dir, rel, rec);
      commitAll(dir, 'Name PR #41 in invoice-exports\n\nTier: 0 — notes only');
    }),
    runs: [['check'], ['context', 'invoice-exports']],
  },
  'archived chain, archived folder edited': {
    build: chain((dir) => {
      editText(dir, 'requests/archive/portal-downloads/spec.md', 'One PR: the portal download page;', 'One PR: the portal download page, with its tests;');
      commitAll(dir, 'Note the tests of portal-downloads\n\nTier: 0 — notes only');
    }),
    runs: [['check']],
  },
};

// The output of each run on main at 4d983cf.
const PINNED = {
  'cross: check': {
    code: 0,
    lines: [
      'ok: no marker lint',
      'info disposition-pending requests/invoice-exports/spec.md invoice-exports 4 of 8 paragraphs with a baseline effect have no disposition for their current version: SP-7, SP-10, SP-11, SP-12',
      'info disposition-pending requests/reminder-emails/spec.md reminder-emails 3 of 3 paragraphs with a baseline effect have no disposition for their current version: SP-2, SP-3, SP-4',
      'info output-repo invoicer-mobile - unknown: no clone at ../invoicer-mobile',
      'info result invoicer-web/.assuredloop/results/export-link-test.yaml test/export-link.test.js pass at invoicer-web@{web:Move the link time into config/link.json (W3):7}: declared inputs unchanged since invoicer-web@{web:Move the link time into config/link.json (W3):7}',
      'info result invoicer-worker/.assuredloop/results/a-no-inputs.yaml test/zip-export.test.js not run at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: applicability unknown: no declared inputs',
      'info result invoicer-worker/.assuredloop/results/b-unknown-no-inputs.yaml test/zip-export.test.js pass at invoicer-worker@unknown: applicability unknown: no declared inputs',
      'info result invoicer-worker/.assuredloop/results/c-unknown.yaml test/zip-export.test.js pass at invoicer-worker@unknown: applicability unknown: the commit is unknown',
      'info result invoicer-worker/.assuredloop/results/d-k7.yaml test/zip-export.test.js pass at invoicer-worker@deadbee: applicability unknown: commit deadbeefdeadbeefdeadbeefdeadbeefdeadbeef is not in the invoicer-worker clone',
      'info result invoicer-worker/.assuredloop/results/e-gone.yaml test/zip-export.test.js fail at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: applicability unknown: the declared input src/old-zip.js is not there',
      'info result invoicer-worker/.assuredloop/results/f-changed.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: does not apply to the current text: src/zip-export.js changed',
      'info result invoicer-worker/.assuredloop/results/g-unchanged.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: declared inputs unchanged since invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}',
      'info result invoicer-worker/.assuredloop/results/h-short.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: declared inputs unchanged since invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}',
      'info result invoicer-worker/.assuredloop/results/i-full.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Merge pull request #12 from invoicer/zip-names:7}: declared inputs unchanged since invoicer-worker@{worker:Merge pull request #12 from invoicer/zip-names:7}',
      'info result invoicer-worker/.assuredloop/results/j-ambiguous.yaml test/zip-export.test.js pass at invoicer-worker@{ambiguous}: applicability unknown: commit {ambiguous} is not in the invoicer-worker clone',
      'info result invoicer-worker/.assuredloop/results/k-absent-short.yaml test/zip-export.test.js fail at invoicer-worker@{absent}: applicability unknown: commit {absent} is not in the invoicer-worker clone',
      'info result invoicer-worker/.assuredloop/results/l-branch.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Yearly ZIP file names (central:invoice-exports/T2):7}: declared inputs unchanged since invoicer-worker@{worker:Yearly ZIP file names (central:invoice-exports/T2):7}',
      'info result invoicer-worker/.assuredloop/results/m-tree.yaml test/zip-export.test.js pass at invoicer-worker@{tree of K4:7}: applicability unknown: commit {tree of K4} is not in the invoicer-worker clone',
      'info result invoicer-worker/.assuredloop/results/n-number.yaml test/zip-export.test.js pass at invoicer-worker@1234567: applicability unknown: commit 1234567 is not in the invoicer-worker clone',
      'info result invoicer-worker/.assuredloop/results/o-tag.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: declared inputs unchanged since invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}',
      'Read      working tree · base {central:The invoicer world:7} (merge-base with main)',
      'Next      al-v4 context',
      'Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, and whether a change is authorized in substance (the review judges these)',
    ],
  },
  'cross: context invoice-exports': {
    code: 0,
    lines: [
      'Request   invoice-exports · tier 3 · open · requests/invoice-exports',
      '  R1 version 1 (Monthly CSV download): signed in S1',
      '  R2 version 1 (An email link that expires): signed in S1',
      '  R3 version 1 (A yearly ZIP): signed in S1',
      '  R4 version 1 (ISO dates in every export): signed in S1',
      'Decision  D1 (owner): The link expires 30 minutes after the email is sent.',
      'Decision  D2 (owner): The link uses a one-time token that can be cancelled; ADR-4 replaces ADR-3.',
      'Task      T1 tasks.md T1; issue #31 · delivers R1, R2, R4 · PRs: #33 no merge found in main, invoicer-web#57 merged at invoicer-web@{web:Document the export link (#57):7}, #10 merged at {central:Adopt AssuredLoop: al spec --add-ids (#10):7}',
      'Task      T2 tasks.md T2; issue #34 · delivers R3 · PRs: invoicer-worker#12 merged at invoicer-worker@{worker:Merge pull request #12 from invoicer/zip-names:7}, invoicer-worker#13 no merge found at invoicer-worker@{worker:Record more results:7}, invoicer-worker#1 no merge found at invoicer-worker@{worker:Record more results:7}, invoicer-worker#14 merged at invoicer-worker@{worker:Second try (#14):7}, invoicer-worker#15 merged at invoicer-worker@{worker:Merge pull request #15 from invoicer/fifteen:7}, invoicer-worker#16 no merge found at invoicer-worker@{worker:Record more results:7}',
      'Task      T3 tasks.md T3; issue #36 · delivers R1, R2 · PRs: invoicer-web#570 merged at invoicer-web@{web:Tidy the link docs (#570):7}, invoicer-mobile#4 unknown: no clone at ../invoicer-mobile, invoicer-desktop#2 unknown: not an output repo in config',
      'PRs from git: none found',
      'Dispositions 15 paragraphs, 8 with a baseline effect: 4 incorporated, 4 pending',
      '  SP-4 rule incorporated EXP-2 · valid',
      '  SP-5 rule incorporated EXP-3 · valid',
      '  SP-6 rule incorporated EXP-4 · valid',
      '  SP-7 rule pending',
      '  SP-9 component incorporated EXP-6 · valid',
      '  SP-10 data pending',
      '  SP-11 interface pending',
      '  SP-12 rationale pending',
      'Coverage  specs/exports.md 0 Exports: 2 rules, 0 with a check, 2 without (0% have a check)',
      '  EXP-2 rule: none',
      '  EXP-3 rule: none',
      'Coverage  specs/exports.md 1 Export links: 1 rules, 1 with a check, 0 without (100% have a check)',
      '  EXP-4 rule: invoicer-web/test/export-link.test.js cites it (at invoicer-web@{web:Tidy the link docs (#570):7}) · invoicer-web/test/export-link.test.js verifies it (a claim) · also named in docs/exports.md, invoicer-web/docs/link.md, invoicer-web/src/export-link.js (not a test: no check)',
      'Hints     none',
      'Not checked whether each kind is right; whether a requirement is fully covered; whether a test really checks the rule it names; whether a result\'s declared inputs are complete; whether a change is authorized in substance (the review judges these)',
      'Read      working tree',
      'Next      give SP-7, SP-10, SP-11, SP-12 a valid disposition in .assuredloop/records/requests/invoice-exports.yaml, then al-v4 index',
      'Not known the PRs that never named the request in a commit message',
    ],
  },
  'cross: context invoice-exports/SP-10': {
    code: 0,
    lines: [
      'Paragraph SP-10 (2:2, in Design) · data · requests/invoice-exports/spec.md:41',
      '  A yearly ZIP holds twelve monthly CSV files named YYYY-MM.csv, each in the',
      '  format of a monthly export.',
      'Serves    invoice-exports/R3 version 1: signed in S1 (declared)',
      'Links     buildsOn EXP-3',
      'Checks    invoicer-worker/test/zip-export.test.js cites it (at invoicer-worker@{worker:Record more results:7}) · also named in invoicer-worker/src/zip-export.js (not a test: no check)',
      'Result    invoicer-worker/.assuredloop/results/a-no-inputs.yaml test/zip-export.test.js not run at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: applicability unknown: no declared inputs',
      'Result    invoicer-worker/.assuredloop/results/b-unknown-no-inputs.yaml test/zip-export.test.js pass at invoicer-worker@unknown: applicability unknown: no declared inputs',
      'Result    invoicer-worker/.assuredloop/results/c-unknown.yaml test/zip-export.test.js pass at invoicer-worker@unknown: applicability unknown: the commit is unknown',
      'Result    invoicer-worker/.assuredloop/results/d-k7.yaml test/zip-export.test.js pass at invoicer-worker@deadbee: applicability unknown: commit deadbeefdeadbeefdeadbeefdeadbeefdeadbeef is not in the invoicer-worker clone',
      'Result    invoicer-worker/.assuredloop/results/e-gone.yaml test/zip-export.test.js fail at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: applicability unknown: the declared input src/old-zip.js is not there',
      'Result    invoicer-worker/.assuredloop/results/f-changed.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: does not apply to the current text: src/zip-export.js changed',
      'Result    invoicer-worker/.assuredloop/results/g-unchanged.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: declared inputs unchanged since invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}',
      'Result    invoicer-worker/.assuredloop/results/h-short.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: declared inputs unchanged since invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}',
      'Result    invoicer-worker/.assuredloop/results/i-full.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Merge pull request #12 from invoicer/zip-names:7}: declared inputs unchanged since invoicer-worker@{worker:Merge pull request #12 from invoicer/zip-names:7}',
      'Result    invoicer-worker/.assuredloop/results/j-ambiguous.yaml test/zip-export.test.js pass at invoicer-worker@{ambiguous}: applicability unknown: commit {ambiguous} is not in the invoicer-worker clone',
      'Result    invoicer-worker/.assuredloop/results/k-absent-short.yaml test/zip-export.test.js fail at invoicer-worker@{absent}: applicability unknown: commit {absent} is not in the invoicer-worker clone',
      'Result    invoicer-worker/.assuredloop/results/l-branch.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Yearly ZIP file names (central:invoice-exports/T2):7}: declared inputs unchanged since invoicer-worker@{worker:Yearly ZIP file names (central:invoice-exports/T2):7}',
      'Result    invoicer-worker/.assuredloop/results/m-tree.yaml test/zip-export.test.js pass at invoicer-worker@{tree of K4:7}: applicability unknown: commit {tree of K4} is not in the invoicer-worker clone',
      'Result    invoicer-worker/.assuredloop/results/n-number.yaml test/zip-export.test.js pass at invoicer-worker@1234567: applicability unknown: commit 1234567 is not in the invoicer-worker clone',
      'Result    invoicer-worker/.assuredloop/results/o-tag.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: declared inputs unchanged since invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}',
      'Disp.     SP-10 data pending',
      'Read      working tree',
      'Next      al-v4 context invoice-exports',
      'Not known the PRs that never named the request in a commit message',
    ],
  },
  'clean: check': {
    code: 0,
    lines: [
      'ok: no marker lint',
      'info disposition-pending requests/invoice-exports/spec.md invoice-exports 4 of 8 paragraphs with a baseline effect have no disposition for their current version: SP-7, SP-10, SP-11, SP-12',
      'info disposition-pending requests/reminder-emails/spec.md reminder-emails 3 of 3 paragraphs with a baseline effect have no disposition for their current version: SP-2, SP-3, SP-4',
      'Read      working tree · base {central:The invoicer world:7} (merge-base with main)',
      'Next      al-v4 context',
      'Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, and whether a change is authorized in substance (the review judges these)',
    ],
  },
  'clean: check --strict': {
    code: 0,
    lines: [
      'ok: no marker lint',
      'info disposition-pending requests/invoice-exports/spec.md invoice-exports 4 of 8 paragraphs with a baseline effect have no disposition for their current version: SP-7, SP-10, SP-11, SP-12',
      'info disposition-pending requests/reminder-emails/spec.md reminder-emails 3 of 3 paragraphs with a baseline effect have no disposition for their current version: SP-2, SP-3, SP-4',
      'Read      working tree · base {central:The invoicer world:7} (merge-base with main)',
      'Next      al-v4 context',
      'Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, and whether a change is authorized in substance (the review judges these)',
    ],
  },
  'd09 defect: check': {
    code: 0,
    lines: [
      'hint no-link specs/invoices.md:14 INV-4 INV-4 is a limit paragraph with no link',
      'specs/invoices.md INV-4 Changed',
      'not ok signoff-coverage specs/invoices.md:14 INV-4 a limit paragraph is changed with no signed requirement that covers it',
      'not ok path-claim specs/invoices.md:14 INV-4 path 0, but a limit paragraph is changed with no typo claim',
      'info disposition-pending requests/invoice-exports/spec.md invoice-exports 4 of 8 paragraphs with a baseline effect have no disposition for their current version: SP-7, SP-10, SP-11, SP-12',
      'info disposition-pending requests/reminder-emails/spec.md reminder-emails 3 of 3 paragraphs with a baseline effect have no disposition for their current version: SP-2, SP-3, SP-4',
      'Read      working tree · base {central:The invoicer world:7} (merge-base with main)',
      'Next      fix each not ok; al-v4 spec --add-ids <file> marks the paragraphs with no ID',
      'Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, and whether a change is authorized in substance (the review judges these)',
    ],
  },
  'd01 defect: check': {
    code: 0,
    lines: [
      'specs/invoices.md INV-6 Changed',
      'ok: no marker lint',
      'not ok signoff-coverage specs/invoices.md:22 INV-6 a definition paragraph is changed with no signed requirement that covers it',
      'hint stale-base requests/reminder-emails/spec.md:10 reminder-emails/SP-3 builds-on INV-6, which changed since it was bound. Align it: check it, then al-v4 index --align reminder-emails/SP-3',
      'info disposition-pending requests/invoice-exports/spec.md invoice-exports 4 of 8 paragraphs with a baseline effect have no disposition for their current version: SP-7, SP-10, SP-11, SP-12',
      'info disposition-pending requests/reminder-emails/spec.md reminder-emails 3 of 3 paragraphs with a baseline effect have no disposition for their current version: SP-2, SP-3, SP-4',
      'Read      working tree · base {central:The invoicer world:7} (merge-base with main)',
      'Next      deal with each not ok and hint, or say in the PR why it stays',
      'Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, and whether a change is authorized in substance (the review judges these)',
    ],
  },
  'd10 defect: check': {
    code: 0,
    lines: [
      'specs/exports.md EXP-9 Changed',
      'ok: no marker lint',
      'info typo-words specs/exports.md:24 EXP-9 MUST -> SHOULD · nubmer -> number; now: "A monthly export SHOULD list each invoice once, sorted by invoice number."',
      'hint typo-mark specs/exports.md:24 EXP-9 meaning-sensitive; review the typo claim (a normative word)',
      'info disposition-pending requests/invoice-exports/spec.md invoice-exports 4 of 8 paragraphs with a baseline effect have no disposition for their current version: SP-7, SP-10, SP-11, SP-12',
      'info disposition-pending requests/reminder-emails/spec.md reminder-emails 3 of 3 paragraphs with a baseline effect have no disposition for their current version: SP-2, SP-3, SP-4',
      'Read      working tree · base {central:Export rules: order, overdue export, file names:7} (merge-base with main)',
      'Next      deal with each not ok and hint, or say in the PR why it stays',
      'Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, and whether a change is authorized in substance (the review judges these)',
    ],
  },
  'd10 control: check': {
    code: 0,
    lines: [
      'specs/exports.md EXP-9 Changed',
      'ok: no marker lint',
      'info typo-words specs/exports.md:24 EXP-9 nubmer -> number; now: "A monthly export MUST list each invoice once, sorted by invoice number."',
      'info disposition-pending requests/invoice-exports/spec.md invoice-exports 4 of 8 paragraphs with a baseline effect have no disposition for their current version: SP-7, SP-10, SP-11, SP-12',
      'info disposition-pending requests/reminder-emails/spec.md reminder-emails 3 of 3 paragraphs with a baseline effect have no disposition for their current version: SP-2, SP-3, SP-4',
      'Read      working tree · base {central:Export rules: order, overdue export, file names:7} (merge-base with main)',
      'Next      al-v4 context',
      'Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, and whether a change is authorized in substance (the review judges these)',
    ],
  },
  'archived chain: check': {
    code: 0,
    lines: [
      'ok: no marker lint',
      'hint target-removed requests/link-expiry-spike/spec.md:5 link-expiry-spike/SP-2 EXP-4: target removed by portal-downloads; align this link',
      'hint target-removed requests/link-expiry-spike/spec.md:9 link-expiry-spike/SP-3 EXP-4: target removed by portal-downloads; align this link',
      'info disposition-pending requests/invoice-exports/spec.md invoice-exports 4 of 8 paragraphs with a baseline effect have no disposition for their current version: SP-7, SP-10, SP-11, SP-12',
      'info disposition-pending requests/reminder-emails/spec.md reminder-emails 3 of 3 paragraphs with a baseline effect have no disposition for their current version: SP-2, SP-3, SP-4',
      'Read      working tree · base {central:Archive portal-downloads and link-refresh:7} (merge-base with main)',
      'Next      deal with each not ok and hint, or say in the PR why it stays',
      'Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, and whether a change is authorized in substance (the review judges these)',
    ],
  },
  'archived chain: context invoice-exports': {
    code: 0,
    lines: [
      'Request   invoice-exports · tier 3 · open · requests/invoice-exports',
      '  R1 version 1 (Monthly CSV download): signed in S1',
      '  R2 version 1 (An email link that expires): signed in S1',
      '  R3 version 1 (A yearly ZIP): signed in S1',
      '  R4 version 1 (ISO dates in every export): signed in S1',
      'Decision  D1 (owner): The link expires 30 minutes after the email is sent.',
      'Decision  D2 (owner): The link uses a one-time token that can be cancelled; ADR-4 replaces ADR-3.',
      'Task      T1 tasks.md T1; issue #31 · delivers R1, R2, R4',
      'Task      T2 tasks.md T2; issue #34 · delivers R3',
      'Task      T3 tasks.md T3; issue #36 · delivers R1, R2',
      'PRs from git: none found',
      'Dispositions 15 paragraphs, 8 with a baseline effect: 2 incorporated, 4 pending, 2 superseded',
      '  SP-4 rule incorporated EXP-2 · valid',
      '  SP-5 rule incorporated EXP-3 · valid',
      '  SP-6 rule superseded EXP-4 by link-refresh/SP-2 · valid (by link-refresh/SP-2, archived)',
      '  SP-7 rule pending',
      '  SP-9 component superseded EXP-6 by portal-downloads/SP-3 · valid (by portal-downloads/SP-3, archived)',
      '  SP-10 data pending',
      '  SP-11 interface pending',
      '  SP-12 rationale pending',
      'Coverage  specs/exports.md 0 Exports: 2 rules, 0 with a check, 2 without (0% have a check)',
      '  EXP-2 rule: none',
      '  EXP-3 rule: none',
      'Hints     none',
      'Not checked whether each kind is right; whether a requirement is fully covered; whether a test really checks the rule it names; whether a result\'s declared inputs are complete; whether a change is authorized in substance (the review judges these)',
      'Read      working tree',
      'Next      give SP-7, SP-10, SP-11, SP-12 a valid disposition in .assuredloop/records/requests/invoice-exports.yaml, then al-v4 index',
      'Not known the PRs that never named the request in a commit message',
    ],
  },
  'archived chain: context portal-downloads': {
    code: 0,
    lines: [
      'Request   portal-downloads · tier 2 · archived · requests/archive/portal-downloads',
      '  R1 version 1 (Downloads after login): signed in S1',
      'Decision  D1 (owner): The email links go; ADR-5 replaces ADR-4.',
      'PRs from git: none found',
      'Dispositions 6 paragraphs, 4 with a baseline effect: 1 incorporated, 3 removed',
      '  SP-2 rule removed EXP-4 · valid (as recorded at the close; not checked again)',
      '  SP-3 component removed EXP-6 · valid (as recorded at the close; not checked again)',
      '  SP-6 rationale removed EXP-5 · valid (as recorded at the close; not checked again)',
      '  SP-4 rule incorporated EXP-9 · valid (as recorded at the close; not checked again)',
      'Coverage  specs/exports.md 1 Downloads: 1 rules, 0 with a check, 1 without (0% have a check)',
      '  EXP-9 rule: none',
      'Hints     none',
      'Not checked whether each kind is right; whether a requirement is fully covered; whether a test really checks the rule it names; whether a result\'s declared inputs are complete; whether a change is authorized in substance (the review judges these)',
      'Read      working tree',
      'Next      al-v4 context portal-downloads --audit',
      'Not known the PRs that never named the request in a commit message',
    ],
  },
  'archived chain, EXP-9 edited: check': {
    code: 0,
    lines: [
      'specs/exports.md EXP-9 Changed',
      'ok: no marker lint',
      'info typo-words specs/exports.md:28 EXP-9 an -> any; now: "An accountant MUST log in to the portal before downloading any export."',
      'hint typo-mark specs/exports.md:28 EXP-9 meaning-sensitive; review the typo claim (a quantifier)',
      'hint target-removed requests/link-expiry-spike/spec.md:5 link-expiry-spike/SP-2 EXP-4: target removed by portal-downloads; align this link',
      'hint target-removed requests/link-expiry-spike/spec.md:9 link-expiry-spike/SP-3 EXP-4: target removed by portal-downloads; align this link',
      'info disposition-pending requests/invoice-exports/spec.md invoice-exports 4 of 8 paragraphs with a baseline effect have no disposition for their current version: SP-7, SP-10, SP-11, SP-12',
      'info disposition-pending requests/reminder-emails/spec.md reminder-emails 3 of 3 paragraphs with a baseline effect have no disposition for their current version: SP-2, SP-3, SP-4',
      'hint adr-governs specs/exports.md:28 EXP-9 check that ADR-5 still holds',
      'Read      working tree · base {central:Archive portal-downloads and link-refresh:7} (merge-base with main)',
      'Next      deal with each not ok and hint, or say in the PR why it stays',
      'Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, and whether a change is authorized in substance (the review judges these)',
    ],
  },
  'archived chain, superseded request changed: check': {
    code: 0,
    lines: [
      'ok: no marker lint',
      'hint target-removed requests/link-expiry-spike/spec.md:5 link-expiry-spike/SP-2 EXP-4: target removed by portal-downloads; align this link',
      'hint target-removed requests/link-expiry-spike/spec.md:9 link-expiry-spike/SP-3 EXP-4: target removed by portal-downloads; align this link',
      'info disposition-pending requests/invoice-exports/spec.md invoice-exports 4 of 8 paragraphs with a baseline effect have no disposition for their current version: SP-7, SP-10, SP-11, SP-12',
      'info disposition-pending requests/reminder-emails/spec.md reminder-emails 3 of 3 paragraphs with a baseline effect have no disposition for their current version: SP-2, SP-3, SP-4',
      'Read      working tree · base {central:Archive portal-downloads and link-refresh:7} (merge-base with main)',
      'Next      deal with each not ok and hint, or say in the PR why it stays',
      'Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, and whether a change is authorized in substance (the review judges these)',
    ],
  },
  'archived chain, superseded request changed: context invoice-exports': {
    code: 0,
    lines: [
      'Request   invoice-exports · tier 3 · open · requests/invoice-exports',
      '  R1 version 1 (Monthly CSV download): signed in S1',
      '  R2 version 1 (An email link that expires): signed in S1',
      '  R3 version 1 (A yearly ZIP): signed in S1',
      '  R4 version 1 (ISO dates in every export): signed in S1',
      'Decision  D1 (owner): The link expires 30 minutes after the email is sent.',
      'Decision  D2 (owner): The link uses a one-time token that can be cancelled; ADR-4 replaces ADR-3.',
      'Task      T1 tasks.md T1; issue #31 · delivers R1, R2, R4 · PRs: #41 no merge found in main',
      'Task      T2 tasks.md T2; issue #34 · delivers R3',
      'Task      T3 tasks.md T3; issue #36 · delivers R1, R2',
      'PRs from git: none found',
      'Dispositions 15 paragraphs, 8 with a baseline effect: 2 incorporated, 4 pending, 2 superseded',
      '  SP-4 rule incorporated EXP-2 · valid',
      '  SP-5 rule incorporated EXP-3 · valid',
      '  SP-6 rule superseded EXP-4 by link-refresh/SP-2 · valid (by link-refresh/SP-2, archived)',
      '  SP-7 rule pending',
      '  SP-9 component superseded EXP-6 by portal-downloads/SP-3 · valid (by portal-downloads/SP-3, archived)',
      '  SP-10 data pending',
      '  SP-11 interface pending',
      '  SP-12 rationale pending',
      'Coverage  specs/exports.md 0 Exports: 2 rules, 0 with a check, 2 without (0% have a check)',
      '  EXP-2 rule: none',
      '  EXP-3 rule: none',
      'Hints     none',
      'Not checked whether each kind is right; whether a requirement is fully covered; whether a test really checks the rule it names; whether a result\'s declared inputs are complete; whether a change is authorized in substance (the review judges these)',
      'Read      working tree',
      'Next      give SP-7, SP-10, SP-11, SP-12 a valid disposition in .assuredloop/records/requests/invoice-exports.yaml, then al-v4 index',
      'Not known the PRs that never named the request in a commit message',
    ],
  },
  'archived chain, archived folder edited: check': {
    code: 0,
    lines: [
      'requests/archive/portal-downloads/spec.md SP-5 Changed',
      'ok: no marker lint',
      'hint target-removed requests/link-expiry-spike/spec.md:5 link-expiry-spike/SP-2 EXP-4: target removed by portal-downloads; align this link',
      'hint target-removed requests/link-expiry-spike/spec.md:9 link-expiry-spike/SP-3 EXP-4: target removed by portal-downloads; align this link',
      'info disposition-pending requests/invoice-exports/spec.md invoice-exports 4 of 8 paragraphs with a baseline effect have no disposition for their current version: SP-7, SP-10, SP-11, SP-12',
      'info disposition-pending requests/reminder-emails/spec.md reminder-emails 3 of 3 paragraphs with a baseline effect have no disposition for their current version: SP-2, SP-3, SP-4',
      'Read      working tree · base {central:Archive portal-downloads and link-refresh:7} (merge-base with main)',
      'Next      deal with each not ok and hint, or say in the PR why it stays',
      'Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, and whether a change is authorized in substance (the review judges these)',
    ],
  },
};

describe('al-v4 check and al-v4 context print what main prints', () => {
  for (const [name, { build, runs }] of Object.entries(CASES)) {
    test(name, (t) => {
      const { dir, repos = { central: dir }, extra = {} } = build(t);
      for (const args of runs) {
        const key = `${name}: ${args.join(' ')}`;
        const r = al(dir, args);
        assert.ok(PINNED[key], `an expected output for ${key}`);
        sameAsMain(r, repos, PINNED[key], { [dir]: '<dir>', ...extra });
      }
    });
  }
});

// --- 4. git processes: the count does not grow with the results or the PR references

// How many more git processes a run with 60 may start than a run with 5.
const SLACK = 3;

// The cross-repo world with one output repo, invoicer-worker, selected at K6:
// `results` result files there, each at its own commit (full and short hashes
// of commits on refs/ci/runs), and, with `prs`, the tasks of invoice-exports
// with `prs` PR references (central and invoicer-worker ones, by turns).
function countWorld(t, { results = 0, prs = null }) {
  const w = world(t);
  const { K5 } = w.shas.worker;
  let selected = K5;
  if (results) {
    const runs = fastCommits(w.worker, 'refs/ci/runs', results, 'CI run');
    const input = [{ file: 'src/zip-export.js', sha256: blobSha(w.worker, K5, 'src/zip-export.js') }];
    for (let i = 0; i < results; i++) {
      writeYaml(w.worker, `.assuredloop/results/run-${String(i + 1).padStart(2, '0')}.yaml`,
        { check: 'test/zip-export.test.js', outcome: 'pass', commit: i % 2 ? runs[i].slice(0, 7) : runs[i], inputs: input });
    }
    selected = commit(w.worker, `Record ${results} results`);
  }
  centralConfig(w.central, [{ name: 'invoicer-worker', path: '../invoicer-worker', commit: selected.slice(0, 7) }]);
  if (prs !== null) {
    const rel = '.assuredloop/records/requests/invoice-exports.yaml';
    const rec = readYaml(w.central, rel);
    const refs = Array.from({ length: prs }, (_, i) => (i % 2 ? `#${200 + i}` : `invoicer-worker#${200 + i}`));
    for (const task of rec.tasks) task.prs = task.id === 'T2' ? refs : [];
    writeYaml(w.central, rel, rec);
  }
  commit(w.central, 'Count world');
  return w;
}

// One run of `al-v4 <args>` in the central repo with the wrapper: the same
// output as without it, checked by `assertOut`; and its git processes.
function countRun(t, w, args, assertOut) {
  const counter = gitCounter(t);
  counter.reset();
  const r = al(w.central, args, { env: { PATH: counter.PATH } });
  const processes = counter.count();
  const calls = counter.calls();
  assert.ok(calls.some((l) => l.includes('merge-base')), `the wrapper saw al's git:\n${calls.join('\n')}`);
  assert.equal(r.code, 0, show(r));
  assertOut(r);
  const plain = al(w.central, args);
  assert.equal(plain.code, r.code, show(plain));
  assert.equal(plain.stdout, r.stdout, 'the same output without the wrapper');
  return { processes, calls };
}

const outLines = (r) => r.stdout.replace(/\n+$/, '').split('\n');

describe('al-v4 check and al-v4 context start about as many git processes for 60 as for 5', () => {
  test('check: an output repo with 5 result files, and one with 60', (t) => {
    const run = (n) => countRun(t, countWorld(t, { results: n }), ['check'], (r) => {
      assert.equal(outLines(r).filter((l) => l.startsWith('info result invoicer-worker/.assuredloop/results/run-')).length, n, show(r));
    });
    const five = run(5);
    const sixty = run(60);
    assert.ok(sixty.processes <= five.processes + SLACK,
      `git processes: ${five.processes} for 5 results, ${sixty.processes} for 60\n--- 60:\n${sixty.calls.join('\n')}`);
  });

  test('check: records with 5 PR references, and with 60', (t) => {
    const run = (n) => countRun(t, countWorld(t, { prs: n }), ['check'], () => {});
    const five = run(5);
    const sixty = run(60);
    assert.ok(sixty.processes <= five.processes + SLACK,
      `git processes: ${five.processes} for 5 PR references, ${sixty.processes} for 60\n--- 60:\n${sixty.calls.join('\n')}`);
  });

  test('context: records with 5 PR references, and with 60', (t) => {
    const run = (n) => countRun(t, countWorld(t, { prs: n }), ['context', 'invoice-exports'], (r) => {
      const task = outLines(r).find((l) => l.startsWith('Task      T2 '));
      assert.ok(task, show(r));
      assert.equal((task.match(/(?:no merge found|merged at)/g) ?? []).length, n, show(r));
    });
    const five = run(5);
    const sixty = run(60);
    assert.ok(sixty.processes <= five.processes + SLACK,
      `git processes: ${five.processes} for 5 PR references, ${sixty.processes} for 60\n--- 60:\n${sixty.calls.join('\n')}`);
  });
});
