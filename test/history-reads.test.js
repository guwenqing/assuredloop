// Reads of history and refs must answer for the commit and the main they name
// (#137). [HNT-3]: merging main into a branch does not make main's commits
// the branch's own, so other requests' debt does not count. [VW-8]: every
// --at read uses that commit, however it is spelled (HEAD, a tag, any ref
// name), and a past tree's settings are read leniently. [REC-9]: the code
// still live for dropped work is the working tree's, and a shallow clone
// does not guess it. [VW-9]: a bare `main` is the main the tool reads, and
// the ranges are labelled with it; a single-branch clone that cannot tell
// says "history unavailable".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { makeRepo, cloneRepo, runAl, git, tempDir } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { ENV, addRequest, both, lineWith, outcome } from './helpers/request.js';
import { file } from './helpers/links.js';
import { checkHints, hint, message, noHint, viewHints } from './helpers/hints.js';
import { adrOrder, short, tap, writeAdr } from './helpers/evidence.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const S2 = '## [INV-3] Dates\nDates MUST show in ISO 8601, with the time zone.\n';
const OUTCOME = '\n## Outcome\n\n- R2 Dates: in [INV-3]\n- Modified: [INV-3]\n\nNotes:\n';
const LIVE = '- Code still live for dropped work: ';

const ok = (r) => assert.equal(r.code, 0, both(r));
const readLine = (out) => lines(out).find((l) => /^Read\b/.test(l)) ?? '';
const startingWith = (out, label) => lines(out).find((l) => new RegExp(`^${label}\\b`).test(l));
const numbered = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1)).join('\n') + '\n';

// Archived by hand, as conclude leaves it: the folder moved, the Status set, an Outcome.
function archive(repo, name, status = 'concluded') {
  mkdirSync(join(repo.dir, 'requests/archive'), { recursive: true });
  repo.git(['mv', `requests/${name}`, `requests/archive/${name}`]);
  const md = repo.read(`requests/archive/${name}/request.md`).toString().replace('Status: open', `Status: ${status}`);
  repo.write(`requests/archive/${name}/request.md`, md + OUTCOME);
}

// --- 1. merging main into a branch [HNT-3] [REC-12] ---

// Main: the baseline and the signed request `done`. The branch `feature`
// forks there and serves its own request `inv`. Then main moves on with
// `after(repo)`, and the branch merges main, as GitHub's "Update branch" does.
function mergedMain(t, after) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  addRequest(repo, 'done', null);
  repo.commit('Baseline and done', { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'feature']);
  addRequest(repo, 'inv', null);
  repo.write('src/inv.js', 'export const inv = 1;\n');
  repo.commit(message('inv: request and code', { request: 'inv', tier: '2 — invoices' }), { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  after(repo);
  repo.git(['checkout', '-q', 'feature']);
  repo.git(['merge', '-q', '--no-ff', '-m', "Merge branch 'main' into feature", 'main'], { date: '2026-09-23T12:00:00Z' });
  assert.equal(repo.git(['rev-list', '--count', '--merges', 'main..HEAD']), '1', 'the fixture: the branch holds one merge of main');
  return repo;
}
// Main concludes `done` after the fork.
const concludeDone = (repo) => {
  archive(repo, 'done');
  repo.commit(message('Conclude done', { request: 'done', tier: '2 — done' }), { date: '2026-09-22T12:00:00Z' });
};
// Main gets the request `bbb`, not signed off (so blocked), with its first work.
const blockedWork = (repo) => {
  addRequest(repo, 'bbb', null, { signed: false });
  repo.write('src/bbb.js', 'export const bbb = 1;\n');
  repo.commit(message('bbb: request and first work', { request: 'bbb' }), { date: '2026-09-22T12:00:00Z' });
};

test('#137 (1) [HNT-3][REC-12] a branch that merged main after main archived another request: check --strict exits 0, and no not ok says the merge changes a request archived on main', (t) => {
  const repo = mergedMain(t, concludeDone);
  const r = runAl(repo.dir, ['check', '--strict', '--all']);
  assert.ok(!checkHints(r.stdout).some((l) => l.includes('changes a request archived on main')),
    `the merge brings main's own archive of done; it is not this branch's edit:\n${r.stdout}`);
  assert.equal(r.code, 0, `nothing this branch owns is not ok:\n${both(r)}`);
});

test('#137 (1) [HNT-3][REC-6] a branch that merged main after main took work for a blocked request: check --strict exits 0, and no not ok says this branch delivers work for bbb', (t) => {
  const repo = mergedMain(t, blockedWork);
  const r = runAl(repo.dir, ['check', '--strict', '--all']);
  noHint(r.stdout, 'not ok', 'delivers work for bbb');
  assert.equal(r.code, 0, `bbb's work came from main, not from this branch:\n${both(r)}`);
});

test('#137 (1) [VW-4][HNT-3] context --diff main...HEAD --for review on a branch that merged main: Serves names the branch\'s own request, not bbb, and no hint says it delivers work for bbb', (t) => {
  const repo = mergedMain(t, blockedWork);
  const r = runAl(repo.dir, ['context', '--diff', 'main...HEAD', '--for', 'review', '--all']);
  ok(r);
  const serves = startingWith(r.stdout, 'Serves');
  assert.ok(serves?.includes('inv'), `the branch serves inv:\n${r.stdout}`);
  assert.ok(!serves.includes('bbb'), `bbb's commit reached the branch through the merge of main:\n${r.stdout}`);
  assert.ok(!viewHints(r.stdout).some((l) => l.includes('delivers work for bbb')), r.stdout);
});

test('#137 (1) [VW-2][HNT-3] context bbb on a branch that merged main: no hint says this branch delivers work for bbb', (t) => {
  const repo = mergedMain(t, blockedWork);
  const r = runAl(repo.dir, ['context', 'bbb', '--all']);
  ok(r);
  assert.ok(r.stdout.includes('BLOCKED'), `the fixture: bbb is blocked:\n${r.stdout}`);
  assert.ok(!viewHints(r.stdout).some((l) => l.includes('delivers work for bbb')), r.stdout);
});

// --- 2. --at spellings [VW-8] ---

// Main: the baseline. Branch `work`: email-link's request and code (Request
// line), a commit "Tidy the totals #42" in src/other.js that maps to no
// request, then email-link archived as dropped. Uncommitted: email-link's
// owner's words now cite #42.
function droppedWithIssue(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  repo.commit('Baseline', { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  addRequest(repo, 'email-link', null, { signed: false });
  repo.write('src/email.js', numbered(3, (i) => `export const email${i} = ${i};`));
  repo.commit(message('Email link', { request: 'email-link', tier: '2 — email link' }), { date: '2026-09-21T12:00:00Z' });
  repo.write('src/other.js', 'export const total = 2;\n');
  repo.commit('Tidy the totals #42', { date: '2026-09-22T12:00:00Z' });
  archive(repo, 'email-link', 'dropped');
  const x = repo.commit(message('Drop email-link', { request: 'email-link', tier: '2 — email link' }), { date: '2026-09-23T12:00:00Z' });
  const path = 'requests/archive/email-link/request.md';
  repo.write(path, repo.read(path).toString().replace('- 2026-09-20 owner chat,', '- 2026-09-20 owner chat about #42,'));
  assert.ok(repo.git(['status', '--porcelain']).includes(path), 'the fixture: the edit is not committed');
  return { repo, x };
}

test('#137 (2) [VW-8] check --at HEAD gives what check --at <full sha> gives on the same commit: the uncommitted issue number in an archived request is not read', (t) => {
  const { repo, x } = droppedWithIssue(t);
  const bySha = runAl(repo.dir, ['check', '--all', '--at', x]);
  ok(bySha);
  hint(bySha.stdout, 'note', 'code still live for dropped work of email-link', 'src/email.js');
  assert.ok(!bySha.stdout.includes('src/other.js'), `at ${short(x)}, no record cites #42:\n${bySha.stdout}`);
  const byHead = runAl(repo.dir, ['check', '--all', '--at', 'HEAD']);
  ok(byHead);
  assert.equal(byHead.stdout, bySha.stdout, 'HEAD and its full sha name the same commit, so the same output');
});

// Main: victim.txt and the request inv; branch `work` one commit on. A ref
// named `--output=victim.txt` points at HEAD.
function trickyRef(t) {
  const repo = makeRepo(t);
  repo.write('victim.txt', 'keep me\n');
  addRequest(repo, 'inv', null);
  repo.commit('Victim and inv', { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('src/inv.js', 'export const inv = 1;\n');
  repo.commit(message('inv code', { request: 'inv', tier: '2 — invoices' }), { date: '2026-09-21T12:00:00Z' });
  repo.git(['update-ref', 'refs/heads/--output=victim.txt', 'HEAD']);
  assert.equal(repo.git(['rev-parse', '--verify', '--end-of-options', '--output=victim.txt^{commit}']), repo.head(), 'the fixture: the ref names HEAD');
  return repo;
}

for (const args of [['check', '--all'], ['context', 'inv', '--audit']]) {
  test(`#137 (2) [VW-8] ${args.join(' ')} --at=--output=victim.txt, a ref by that name: the ref is read as a commit, and victim.txt is left as it was`, (t) => {
    const repo = trickyRef(t);
    const r = runAl(repo.dir, [...args, '--at=--output=victim.txt']);
    assert.equal(repo.read('victim.txt').toString(), 'keep me\n', `no git command may take the ref name as an option:\n${both(r)}`);
    ok(r);
    assert.ok(readLine(r.stdout).includes(short(repo.head())), `the Read line names the commit:\n${r.stdout}`);
  });
}

test('#137 (2) [VW-8] check --at <annotated tag> gives what check --at <the tagged commit> gives: no hint names the tag object\'s id', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  repo.write('src/rounding.js', "export const mode = 'half-up';\n");
  repo.write('.assuredloop', 'results: results\n');
  repo.commit('Spec and code', { date: '2026-09-01T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('src/rounding.js', "export const mode = 'half-even';\n");
  const w1 = repo.commit(message('Round half even', { tier: '2 — rounding' }), { date: '2026-09-02T12:00:00Z' });
  repo.write('results/ci.tap', tap(w1, [['totals round', 'ok']]));
  const x = repo.commit(message('CI results', { tier: '2 — rounding' }), { date: '2026-09-03T12:00:00Z' });
  repo.git(['tag', '-a', 'v1', '-m', 'Release 1', x], { date: '2026-09-04T12:00:00Z' });
  const tagObject = repo.git(['rev-parse', 'v1']);
  assert.notEqual(tagObject, x, 'the fixture: v1 is an annotated tag, an object of its own');

  const bySha = runAl(repo.dir, ['check', '--all', '--at', x]);
  ok(bySha);
  hint(bySha.stdout, 'note', 'results/ci.tap', 'not evidence', short(x));
  const byTag = runAl(repo.dir, ['check', '--all', '--at', 'v1']);
  ok(byTag);
  assert.ok(!byTag.stdout.includes(short(tagObject)), `the tag object ${short(tagObject)} is not a commit:\n${byTag.stdout}`);
  assert.equal(byTag.stdout, bySha.stdout, 'v1 names the same commit, so the same output');
});

// --- 3. past trees' settings [VW-8] ---

// Main: the baseline and `.assuredloop` with `bad`, a line that names a path
// outside the repo. Branch `fix` corrects it to `good`.
function badSetting(t, bad, good) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  repo.write('.assuredloop', `${bad}\n`);
  addRequest(repo, 'inv', null);
  repo.commit('Baseline with a bad setting', { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'fix']);
  repo.write('.assuredloop', `${good}\n`);
  repo.commit(message('Fix the setting', { tier: '0 — the setting names a path in this repo' }), { date: '2026-09-21T12:00:00Z' });
  return repo;
}
const insideRepo = (r) => assert.ok(!/must be inside this repo/.test(both(r)), `main's old line does not stop a read on the branch that fixes it:\n${both(r)}`);

for (const args of [['check'], ['context', '--diff', 'main...HEAD']]) {
  test(`#137 (3) [VW-8] main's .assuredloop has tests: ../outside, the branch fixes it to tests: test: ${args.join(' ')} exits 0`, (t) => {
    const repo = badSetting(t, 'tests: ../outside', 'tests: test');
    ok(runAl(repo.dir, ['spec'])); // the fixture: the working tree's setting reads fine
    const r = runAl(repo.dir, args);
    insideRepo(r);
    ok(r);
  });
}

test('#137 (3) [VW-8] main\'s .assuredloop has adrs: ../outside, the branch fixes it to adrs: decisions: check exits 0', (t) => {
  const repo = badSetting(t, 'adrs: ../outside', 'adrs: decisions');
  const r = runAl(repo.dir, ['check']);
  insideRepo(r);
  ok(r);
});

test('#137 (3) [VW-8][REC-9] conclude of a request with no change.md, on a branch that fixes main\'s tests: ../outside: exits 0 and writes the Outcome', (t) => {
  const repo = badSetting(t, 'tests: ../outside', 'tests: test');
  repo.write('specs/invoices.md', file(INV1, S1));
  repo.commit(message('ISO dates', { request: 'inv', tier: '1 — ISO dates' }), { date: '2026-09-22T12:00:00Z' });
  const r = runAl(repo.dir, ['conclude', 'inv', '--yes'], { env: ENV });
  insideRepo(r);
  ok(r);
  assert.ok(outcome(repo.read('requests/archive/inv/request.md').toString()).generated.includes('- Modified: [INV-3]'), 'the Outcome lists INV-3 as modified');
});

test('#137 (3) [VW-6][VW-8] context of a request concluded on main while .assuredloop had tests: ../outside, fixed since: exits 0 and shows its sections', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  repo.write('.assuredloop', 'tests: ../outside\n');
  addRequest(repo, 'inv', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  repo.commit('open inv', { date: '2026-09-20T12:00:00Z' });
  repo.write('specs/invoices.md', file(INV1, S1));
  archive(repo, 'inv');
  repo.commit(message('Conclude inv', { request: 'inv', tier: '2 — ISO dates' }), { date: '2026-09-21T12:00:00Z' });
  repo.write('.assuredloop', 'tests: test\n');
  repo.commit(message('Fix the setting', { tier: '0 — the setting names a path in this repo' }), { date: '2026-09-22T12:00:00Z' });
  const r = runAl(repo.dir, ['context', 'inv'], { env: ENV });
  insideRepo(r);
  ok(r);
  assert.ok(lineWith(r.stdout, /^Sections\b/, 'INV-3', 'as at conclusion'), `INV-3 is as at conclusion:\n${r.stdout}`);
});

// --- 4. code still live for dropped work [REC-9] ---

// email-link, not signed off, with D4 to drop it; its code in src/email.js
// and src/page.js (Request line); then other.txt, by no request.
function droppedWork(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  addRequest(repo, 'email-link', null, { signed: false });
  repo.commit('email-link: request', { date: '2026-09-20T12:00:00Z' });
  repo.write('src/email.js', numbered(4, (i) => `export const email${i} = 'part ${i} of the email link';`));
  repo.write('src/page.js', numbered(3, (i) => `export const page${i} = 'the email page, part ${i}';`));
  repo.commit(message('Email link', { request: 'email-link' }), { date: '2026-09-21T12:00:00Z' });
  repo.write('other.txt', 'not the email link\n');
  repo.commit('Other work', { date: '2026-09-22T12:00:00Z' });
  return repo;
}
function concludeDropped(repo) {
  const r = runAl(repo.dir, ['conclude', 'email-link', '--dropped', 'D4', '--yes'], { env: ENV });
  ok(r);
  return outcome(repo.read('requests/archive/email-link/request.md').toString()).generated;
}
const liveIn = (g) => g.find((l) => l.startsWith(LIVE))?.slice(LIVE.length).split(', ').sort() ?? [];

test('#137 (4a) [REC-9][VW-9] conclude --dropped in a --depth 1 clone: the Outcome does not name code the request never touched as still live', (t) => {
  const repo = droppedWork(t);
  const clone = cloneRepo(t, repo, { depth: 1 });
  assert.equal(clone.git(['rev-list', '--count', 'HEAD']), '1', 'the fixture: the clone holds one commit');
  const g = concludeDropped(clone);
  assert.ok(!g.some((l) => l.includes('other.txt') || l.includes('README.md')), `other.txt and README.md are not email-link's code:\n${g.join('\n')}`);

  // In the full repo, the same conclude names only email-link's code.
  assert.deepEqual(liveIn(concludeDropped(repo)), ['src/email.js:1-4', 'src/page.js:1-3']);
});

test('#137 (4b) [REC-9] conclude --dropped after an uncommitted git rm of one of its files: the Outcome names only the code still in the working tree', (t) => {
  const repo = droppedWork(t);
  repo.git(['rm', '-q', 'src/email.js']);
  const g = concludeDropped(repo);
  assert.deepEqual(liveIn(g), ['src/page.js:1-3'], g.join('\n'));
});

// --- 5. a bare main is the main the tool reads [VW-9] ---

// `upstream` holds the baseline; `clone` is cloned from it. Upstream then
// takes other's work, which the clone fetches: origin/main moves, local main
// stays where the clone left it. The clone's branch `feature` forks from
// origin/main and serves mine.
function staleMain(t) {
  const upstream = makeRepo(t);
  upstream.write('specs/invoices.md', file(INV1, S0));
  upstream.commit('Baseline', { date: '2026-09-20T12:00:00Z' });
  const clone = cloneRepo(t, upstream, { date: '2026-09-20T13:00:00Z' });
  upstream.write('src/other.js', 'export const other = 1;\n');
  upstream.commit(message('Other work', { request: 'other' }), { date: '2026-09-21T12:00:00Z' });
  clone.git(['fetch', '-q', 'origin'], { date: '2026-09-21T13:00:00Z' });
  clone.git(['checkout', '-q', '-b', 'feature', 'origin/main']);
  addRequest(clone, 'mine', null);
  clone.write('src/mine.js', 'export const mine = 1;\n');
  clone.commit(message('Mine', { request: 'mine', tier: '2 — mine' }), { date: '2026-09-22T12:00:00Z' });
  assert.notEqual(clone.git(['rev-parse', 'main']), clone.git(['rev-parse', 'origin/main']), 'the fixture: local main is behind origin/main');
  return clone;
}

test('#137 (5) [VW-4][VW-9] with a stale local main, context --diff main...HEAD --for review reads origin/main: other\'s merged work is neither served nor Unlinked', (t) => {
  const clone = staleMain(t);
  const r = runAl(clone.dir, ['context', '--diff', 'main...HEAD', '--for', 'review']);
  ok(r);
  const serves = startingWith(r.stdout, 'Serves');
  assert.ok(serves?.includes('mine'), `the branch serves mine:\n${r.stdout}`);
  assert.ok(!serves.includes('other'), `other's work is on origin/main, not this branch's:\n${r.stdout}`);
  const unlinked = startingWith(r.stdout, 'Unlinked');
  assert.ok(unlinked, `expected a line starting with Unlinked:\n${r.stdout}`);
  assert.ok(!unlinked.includes('src/other.js'), `src/other.js is not this branch's file:\n${r.stdout}`);
});

test('#137 (5) [VW-9] with a stale local main, check labels its range with the main it read: origin/main..HEAD', (t) => {
  const clone = staleMain(t);
  const r = runAl(clone.dir, ['check']);
  ok(r);
  assert.match(readLine(r.stdout), /\borigin\/main\.\.HEAD\b/, `the Read line should name the range read, origin/main..HEAD:\n${r.stdout}`);
});

// staleMain's clone, detached on its own commit, with no local main, as CI checks out a PR.
function noLocalMain(t) {
  const clone = staleMain(t);
  clone.git(['checkout', '-q', '--detach']);
  clone.git(['branch', '-q', '-D', 'main', 'feature']);
  assert.throws(() => clone.git(['rev-parse', '--verify', 'refs/heads/main']), 'the fixture: no local main');
  return clone;
}

test('#137 (5) [VW-4][VW-9] with no local main (a CI checkout), context --diff main...HEAD --for review reads origin/main and exits 0', (t) => {
  const clone = noLocalMain(t);
  const r = runAl(clone.dir, ['context', '--diff', 'main...HEAD', '--for', 'review']);
  ok(r);
  const serves = startingWith(r.stdout, 'Serves');
  assert.ok(serves?.includes('mine') && !serves.includes('other'), `the branch serves mine alone:\n${r.stdout}`);
});

// The command after the Next label.
const nextCommand = (out) => startingWith(out, 'Next').replace(/^Next\s+/, '');
const argsOf = (command) => command.split(/\s+/).slice(1);

test('#137 (5) [VW-9] with no local main, the command context suggests for --for review without --diff runs and exits 0', (t) => {
  const clone = noLocalMain(t);
  const misuse = runAl(clone.dir, ['context', '--for', 'review']);
  assert.equal(misuse.code, 2, both(misuse));
  const suggested = nextCommand(misuse.stdout);
  assert.match(suggested, /^al context --diff \S+ --for review$/, misuse.stdout);
  ok(runAl(clone.dir, argsOf(suggested)));
});

test('#137 (5) [VW-9] with no local main, the command a tier-0 hint suggests (al context --diff <range>) runs and exits 0', (t) => {
  const clone = noLocalMain(t);
  clone.write('specs/invoices.md', file(INV1, S1));
  clone.commit(message('ISO dates', { tier: '0 — a typo' }), { date: '2026-09-23T12:00:00Z' });
  const r = runAl(clone.dir, ['check', '--all']);
  ok(r);
  const h = hint(r.stdout, 'not ok', 'tier 0', 'edits the baseline');
  const suggested = h.slice(h.lastIndexOf('; ') + 2);
  assert.match(suggested, /^al context --diff \S+$/, h);
  ok(runAl(clone.dir, argsOf(suggested)));
});

// --- 6. one order of the branch's commits [REC-11] ---

test('#137 (6) [REC-11][VW-4] on a branch with a merged side branch whose dates interleave, check and the review view give the same tier claim', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  repo.commit('Baseline', { date: '2026-09-01T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('specs/invoices.md', file(INV1, S1));
  repo.commit(message('A: ISO dates', { tier: '2 — ISO dates' }), { date: '2026-09-02T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'side']);
  repo.write('side.txt', 'one\n');
  repo.commit('S1: side work', { date: '2026-09-03T12:00:00Z' });
  repo.write('side.txt', 'two\n');
  repo.commit(message('S2: a fix', { tier: '0 — a fix' }), { date: '2026-09-04T12:00:00Z' });
  repo.git(['checkout', '-q', 'work']);
  repo.write('b.txt', 'b\n');
  repo.commit(message('B: more ISO dates', { tier: '2 — ISO dates' }), { date: '2026-09-05T12:00:00Z' });
  repo.git(['merge', '-q', '--no-ff', '-m', "Merge branch 'side' into work", 'side'], { date: '2026-09-06T12:00:00Z' });
  const order = (...flags) => repo.git(['log', '--format=%s', '--reverse', ...flags, 'main..HEAD']).split('\n').map((s) => s.split(':')[0]).join(' ');
  assert.notEqual(order(), order('--topo-order'), 'the fixture: date order and topological order differ');

  const c = runAl(repo.dir, ['check', '--all']);
  ok(c);
  const v = runAl(repo.dir, ['context', '--diff', 'main...HEAD', '--for', 'review']);
  ok(v);
  const [checkTier, viewTier] = [startingWith(c.stdout, 'Tier'), startingWith(v.stdout, 'Tier')];
  assert.ok(checkTier && viewTier, `both name a tier claim:\n${c.stdout}\n---\n${v.stdout}`);
  assert.equal(checkTier, viewTier, 'one branch, one tier claim');
});

// --- 7. an archived request's sections under --at [VW-6] [VW-8] ---

test('#137 (7) [VW-6][VW-8] context <archived> --at X, where X\'s history concluded it and later changed INV-3: the Sections line reads X\'s history, as the Concluded line does', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  addRequest(repo, 'iso-dates', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  repo.commit(message('iso-dates: request', { request: 'iso-dates' }), { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'part-1']);
  repo.write('specs/invoices.md', file(INV1, S1));
  archive(repo, 'iso-dates');
  const cb = repo.commit(message('Consolidate and conclude', { request: 'iso-dates' }), { date: '2026-09-21T12:00:00Z' });
  repo.write('specs/invoices.md', file(INV1, S2));
  const x = repo.commit(message('Time zone', { request: 'tz-dates' }), { date: '2026-09-22T12:00:00Z' });

  const r = runAl(repo.dir, ['context', 'iso-dates', '--at', x]);
  ok(r);
  const concluded = startingWith(r.stdout, 'Concluded');
  assert.ok(concluded?.includes(short(cb)), `the fixture: in ${short(x)}'s history iso-dates concluded at ${short(cb)}:\n${r.stdout}`);
  const sections = startingWith(r.stdout, 'Sections');
  assert.ok(sections?.includes('since changed') && sections.includes('tz-dates'), `INV-3 changed after ${short(cb)}, by tz-dates:\n${r.stdout}`);
});

// --- 8. single-branch clones [VW-9] [REC-1] ---

// The source: aaa archived on main, then a branch `feature` one commit on.
// The clone: --single-branch of feature, so it holds no main of any kind.
function singleBranch(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  addRequest(repo, 'aaa', null);
  repo.commit('open aaa', { date: '2026-09-20T12:00:00Z' });
  archive(repo, 'aaa');
  repo.commit(message('Conclude aaa', { request: 'aaa' }), { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'feature']);
  repo.write('src/x.js', 'export const x = 1;\n');
  repo.commit(message('Feature work', { tier: '0 — tidy' }), { date: '2026-09-22T12:00:00Z' });
  const dir = join(tempDir(t), 'clone');
  git(dirname(dir), ['clone', '-q', '--single-branch', '--branch', 'feature', `file://${repo.dir}`, dir]);
  for (const ref of ['refs/heads/main', 'refs/remotes/origin/main']) assert.throws(() => git(dir, ['rev-parse', '--verify', ref]), `the fixture: no ${ref}`);
  assert.equal(git(dir, ['rev-parse', '--is-shallow-repository']), 'false', 'the fixture: not shallow');
  return dir;
}

test('#137 (8) [REC-1][VW-9] in a single-branch clone with no main, record aaa decision, aaa archived in the tree, exits 2 with "history unavailable" and writes nothing', (t) => {
  const dir = singleBranch(t);
  const path = join(dir, 'requests/archive/aaa/request.md');
  const before = git(dir, ['hash-object', path]);
  for (const yes of [[], ['--yes']]) {
    const r = runAl(dir, ['record', 'aaa', 'decision', '--source', 'the owner', '--text', 'CSV only.', ...yes]);
    assert.equal(r.code, 2, `whether aaa is archived on main cannot be told here:\n${both(r)}`);
    assert.ok(r.stdout.includes('history unavailable'), r.stdout);
    assert.ok(!/Would add|Added/.test(r.stdout), r.stdout);
  }
  assert.equal(git(dir, ['hash-object', path]), before, 'request.md unchanged');
});

test('#137 (8) [STA-8][VW-9] in a single-branch clone with no main, context aaa\'s Concluded line says "history unavailable", not "not on main yet"', (t) => {
  const dir = singleBranch(t);
  const r = runAl(dir, ['context', 'aaa']);
  ok(r);
  const concluded = startingWith(r.stdout, 'Concluded');
  assert.ok(concluded, `expected a line starting with Concluded:\n${r.stdout}`);
  assert.ok(concluded.includes('history unavailable'), `which main concluded aaa cannot be told here:\n${r.stdout}`);
  assert.ok(!concluded.includes('not on main yet'), r.stdout);
});

// --- 9. a folder name starting with -- under --at [VW-8] [LNK-4] ---

test('#137 (9) [VW-8][LNK-4] an adrs: folder named --decisions: context INV-3 --at HEAD shows its ADR, as context INV-3 does', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  repo.write('.assuredloop', 'adrs: --decisions\n');
  writeAdr(repo, '0001-iso-dates', 'ISO dates', { dir: '--decisions', governs: ['INV-3'] });
  repo.commit('Baseline and an ADR', { date: '2026-09-20T12:00:00Z' });
  const now = runAl(repo.dir, ['context', 'INV-3']);
  ok(now);
  assert.deepEqual(adrOrder(now.stdout).numbers, ['0001'], `the fixture: the working tree shows ADR 0001:\n${now.stdout}`);
  const at = runAl(repo.dir, ['context', 'INV-3', '--at', 'HEAD']);
  ok(at);
  assert.deepEqual(adrOrder(at.stdout).numbers, ['0001'], `HEAD's tree holds --decisions/0001-iso-dates.md:\n${at.stdout}`);
});
