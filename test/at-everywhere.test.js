// --at <commit> on every read command [VW-8]: al context <ID>, al context
// --diff (HEAD and an omitted side read as the commit), al check (the final
// state is that commit's tree, the commits main..<commit>), each reading the
// commit's tree through git and never the working tree; an unknown commit
// exits 2. And the gaps a check against today's behaviour found [VW-8]
// [VW-9]@2: an archived request's Concluded line under --at reads the
// commit's own first-parent line; test results under --at are read as at the
// commit; the Not known line under --at says hints comparing with main were
// not read; a repo with no main says so; a bad range names itself; a shallow
// or single-branch clone that lacks history says "history unavailable"; no
// Not known line is empty.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { makeRepo, cloneRepo, runAl, git, tempDir } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { addRequest, both, lineWith } from './helpers/request.js';
import { file, labelled, says } from './helpers/links.js';
import { hint, message, noHint } from './helpers/hints.js';
import { count, short, tap } from './helpers/evidence.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const S2 = '## [INV-3] Dates\nDates MUST show in ISO 8601, with the time zone.\n';
const INV7 = '## [INV-7] CSV rows\nOne row per line item.\n';
const NOWHERE = '0123456789abcdef0123456789abcdef01234567';

const ok = (r) => assert.equal(r.code, 0, both(r));
const readLine = (out) => lines(out).find((l) => /^Read\b/.test(l)) ?? '';
const notKnown = (out) => lines(out).at(-1) ?? '';
function readsCommit(out, sha) {
  const read = readLine(out);
  assert.ok(read.includes(short(sha)), `the Read line should name ${short(sha)}:\n${out}`);
  assert.ok(!read.includes('working tree'), `under --at the working tree is not read:\n${out}`);
}

// --- context <ID> --at ---

// x: the baseline at S0, iso-dates holding INV-3 (pending). Later: INV-3 at
// S1 and INV-7 added; tz-dates holds INV-3.
function sections(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  addRequest(repo, 'iso-dates', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  const x = repo.commit('iso-dates: request\n\nRequest: iso-dates', { date: '2026-09-21T12:00:00Z' });
  repo.write('specs/invoices.md', file(INV1, S1, INV7));
  addRequest(repo, 'tz-dates', [block('[INV-3]@1 modify   for R2', { was: S1, now: S2 })]);
  repo.commit('INV-3 consolidated, INV-7 added; tz-dates\n\nRequest: tz-dates', { date: '2026-09-22T12:00:00Z' });
  return { repo, x };
}

test('[VW-8] context <ID> --at <commit>: the section\'s text and its holders as at that commit; the Read line names it; exit 0', (t) => {
  const { repo, x } = sections(t);
  const r = runAl(repo.dir, ['context', 'INV-3', '--at', x]);
  ok(r);
  assert.ok(r.stdout.includes("Dates show in the customer's local format."), `INV-3's text at ${short(x)}:\n${r.stdout}`);
  assert.ok(!r.stdout.includes('Dates MUST show in ISO 8601.'), `INV-3 changed after ${short(x)}:\n${r.stdout}`);
  assert.ok(says(r.stdout, 'INV-3', 'pending') || lineWith(r.stdout, 'iso-dates', 'pending'), `iso-dates held INV-3, pending:\n${r.stdout}`);
  assert.ok(!r.stdout.includes('tz-dates'), `tz-dates came after ${short(x)}:\n${r.stdout}`);
  readsCommit(r.stdout, x);
  assertFrame(r.stdout, { read: short(x) });

  const now = runAl(repo.dir, ['context', 'INV-3']);
  ok(now);
  assert.ok(now.stdout.includes('tz-dates'), `the fixture: tz-dates holds INV-3 now:\n${now.stdout}`);
});

test('[VW-8] context <ID> --at <commit> for a section added after that commit reads "not in the baseline"', (t) => {
  const { repo, x } = sections(t);
  const r = runAl(repo.dir, ['context', 'INV-7', '--at', x]);
  ok(r);
  assert.ok(r.stdout.includes('not in the baseline'), r.stdout);
  readsCommit(r.stdout, x);
});

test('[VW-8] under --at the working tree is never read: an untracked file, and an uncommitted edit to a tracked one, naming [INV-3] do not show under context INV-3 --at HEAD', (t) => {
  const { repo } = sections(t);
  repo.write('src/format.js', 'export const format = (d) => d;\n');
  repo.commit('Format', { date: '2026-09-23T12:00:00Z' });
  repo.write('src/format.js', '// [INV-3]\nexport const format = (d) => d.toISOString();\n');
  repo.write('src/scratch.js', '// [INV-3] scratch\n');
  const r = runAl(repo.dir, ['context', 'INV-3', '--at', 'HEAD']);
  ok(r);
  assert.ok(!r.stdout.includes('src/scratch.js'), `an untracked file is not in HEAD's tree:\n${r.stdout}`);
  assert.ok(!r.stdout.includes('src/format.js'), `HEAD's src/format.js names no [INV-3]:\n${r.stdout}`);
  readsCommit(r.stdout, repo.head());
});

// --- context --diff --at ---

// main: the baseline at S0. Branch work: w1 serves iso-dates (INV-3 at S1),
// w2 serves tz-dates (written in w2). HEAD is work at w2.
function branch(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  repo.commit('Baseline', { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  addRequest(repo, 'iso-dates', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  repo.write('specs/invoices.md', file(INV1, S1));
  const w1 = repo.commit(message('ISO dates', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-21T12:00:00Z' });
  addRequest(repo, 'tz-dates', [block('[INV-3]@1 modify   for R2', { was: S1, now: S2 })]);
  repo.write('specs/invoices.md', file(INV1, S2));
  const w2 = repo.commit(message('Time zone', { request: 'tz-dates', tier: '2 — time zone' }), { date: '2026-09-22T12:00:00Z' });
  return { repo, w1, w2 };
}
const serves = (out) => {
  const b = labelled(out, 'Serves');
  assert.ok(b, `expected a line starting with Serves:\n${out}`);
  return b;
};

for (const range of ['main...HEAD', 'main...']) {
  test(`[VW-8] context --diff ${range} --at <commit>: HEAD (or the omitted side) reads as that commit, so the branch shows as it was then; the Read line names it; exit 0`, (t) => {
    const { repo, w1 } = branch(t);
    const now = runAl(repo.dir, ['context', '--diff', 'main...HEAD']);
    ok(now);
    assert.ok(serves(now.stdout).includes('tz-dates'), `the fixture: the branch serves tz-dates now:\n${now.stdout}`);

    const r = runAl(repo.dir, ['context', '--diff', range, '--at', w1]);
    ok(r);
    assert.ok(serves(r.stdout).includes('iso-dates'), `at ${short(w1)} the branch serves iso-dates:\n${r.stdout}`);
    assert.ok(!r.stdout.includes('tz-dates'), `tz-dates came after ${short(w1)}:\n${r.stdout}`);
    readsCommit(r.stdout, w1);
  });
}

// --- check --at ---

test('[VW-8] check --at <commit>: a duplicate ID present at that commit and removed later is reported with --at and not without; --strict exits 1 with --at, 0 without', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  repo.commit('Baseline', { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('specs/more.md', '## [INV-3] Dates again\nAnother rule.\n');
  const x = repo.commit('A second INV-3', { date: '2026-09-21T12:00:00Z' });
  repo.git(['rm', '-q', 'specs/more.md']);
  repo.commit('Drop the second INV-3', { date: '2026-09-22T12:00:00Z' });

  const at = runAl(repo.dir, ['check', '--all', '--at', x]);
  ok(at);
  hint(at.stdout, 'not ok', 'duplicate ID', 'INV-3');
  readsCommit(at.stdout, x);
  assertFrame(at.stdout, { read: short(x) });

  const now = runAl(repo.dir, ['check', '--all']);
  ok(now);
  noHint(now.stdout, 'duplicate ID');

  assert.equal(runAl(repo.dir, ['check', '--strict', '--at', x]).code, 1, 'check --strict --at x: the duplicate counts');
  assert.equal(runAl(repo.dir, ['check', '--strict']).code, 0, 'check --strict: nothing counts at HEAD');
});

// --- an unknown commit ---

for (const args of [['context', 'INV-3'], ['context', '--diff', 'main...HEAD'], ['check']]) {
  test(`[VW-8][VW-9] ${args.join(' ')} --at a commit that exists nowhere exits 2, "unknown commit"`, (t) => {
    const { repo } = branch(t);
    const r = runAl(repo.dir, [...args, '--at', NOWHERE]);
    assert.equal(r.code, 2, both(r));
    assert.match(both(r), /unknown commit/, both(r));
    assert.equal(repo.git(['status', '--porcelain']), '', 'nothing written');
  });
}

// --- gaps: Concluded under --at ---

test('[VW-8][STA-8] context <archived name> --at the branch commit that archived it, before the merge: the Concluded line reads that commit\'s own line and never names the later merge on main', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  addRequest(repo, 'iso-dates', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  repo.commit('iso-dates: request\n\nRequest: iso-dates', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'part-1']);
  repo.write('specs/invoices.md', file(INV1, S1));
  mkdirSync(join(repo.dir, 'requests/archive'), { recursive: true });
  repo.git(['mv', 'requests/iso-dates', 'requests/archive/iso-dates']);
  const md = repo.read('requests/archive/iso-dates/request.md').toString().replace('Status: open', 'Status: concluded');
  repo.write('requests/archive/iso-dates/request.md', `${md}\n## Outcome\n\n- R2 Dates: in [INV-3]\n- Modified: [INV-3]\n`);
  const x = repo.commit('Consolidate and conclude\n\nRequest: iso-dates', { date: '2026-09-22T12:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  repo.git(['merge', '-q', '--no-ff', '-m', "Merge branch 'part-1'", 'part-1'], { date: '2026-09-23T12:00:00Z' });
  const mg = repo.head();

  const r = runAl(repo.dir, ['context', 'iso-dates', '--at', x]);
  ok(r);
  const line = lines(r.stdout).find((l) => /^Concluded\b/.test(l));
  assert.ok(line, `expected a line starting with Concluded:\n${r.stdout}`);
  assert.ok(!line.includes(short(mg)), `${short(mg)}, the merge on main, comes after ${short(x)}:\n${line}`);
  for (const [sha] of line.matchAll(/\b[0-9a-f]{7,40}\b/g)) {
    assert.doesNotThrow(() => repo.git(['merge-base', '--is-ancestor', sha, x]), `the Concluded line names ${sha}, which ${short(x)} does not reach:\n${line}`);
  }
  readsCommit(r.stdout, x);
});

// --- gaps: test results under --at ---

// main: the spec, src/rounding.js, results: results. Branch work: w1 a code
// change; x adds results/ci.tap (revision w1: 1 pass, 1 fail). In the
// working tree, results/ci.tap passes both, and results/local.tap is untracked.
function results(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  repo.write('src/rounding.js', "export const mode = 'half-up';\n");
  repo.write('.assuredloop', 'results: results\n');
  repo.commit('Spec and code', { date: '2026-09-01T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('src/rounding.js', "export const mode = 'half-even';\n");
  const w1 = repo.commit(message('Round half even', { tier: '2 — rounding' }), { date: '2026-09-02T12:00:00Z' });
  repo.write('results/ci.tap', tap(w1, [['totals round', 'ok'], ['dates show ISO 8601', 'not ok']]));
  const x = repo.commit(message('CI results', { tier: '2 — rounding' }), { date: '2026-09-03T12:00:00Z' });
  repo.write('results/ci.tap', tap(w1, [['totals round', 'ok'], ['dates show ISO 8601', 'ok']]));
  repo.write('results/local.tap', tap(w1, [['totals round', 'ok']]));
  return { repo, x };
}
function resultLine(out, path) {
  const b = labelled(out, 'Results');
  assert.ok(b, `expected a line starting with Results:\n${out}`);
  const line = lineWith(b, path);
  assert.ok(line, `the Results block should name ${path}:\n${out}`);
  return { b, line };
}

test('[VW-8][LNK-3] check --at <commit> reads the result files as at that commit: its results/ci.tap (1 fail), not the working tree\'s (0 fail), and not an untracked one', (t) => {
  const { repo, x } = results(t);
  const now = runAl(repo.dir, ['check', '--all']);
  ok(now);
  assert.match(resultLine(now.stdout, 'results/ci.tap').line, count(0, 'fail'), `the fixture: the working tree's ci.tap has no fail:\n${now.stdout}`);

  const r = runAl(repo.dir, ['check', '--all', '--at', x]);
  ok(r);
  const { b, line } = resultLine(r.stdout, 'results/ci.tap');
  assert.match(line, count(1, 'fail'), `at ${short(x)} ci.tap has one fail:\n${r.stdout}`);
  assert.ok(!b.includes('results/local.tap'), `results/local.tap is not in ${short(x)}'s tree:\n${r.stdout}`);
  readsCommit(r.stdout, x);
});

test('[VW-8][LNK-3] context --diff main...HEAD --at <commit> reads the result files as at that commit', (t) => {
  const { repo, x } = results(t);
  const r = runAl(repo.dir, ['context', '--diff', 'main...HEAD', '--at', x]);
  ok(r);
  const { b, line } = resultLine(r.stdout, 'results/ci.tap');
  assert.match(line, count(1, 'fail'), `at ${short(x)} ci.tap has one fail:\n${r.stdout}`);
  assert.ok(!b.includes('results/local.tap'), `results/local.tap is not in ${short(x)}'s tree:\n${r.stdout}`);
});

// --- gaps: the frame ---

test('[VW-8][VW-9] context <name> --at <commit>: the Not known line says the hints comparing with main were not read', (t) => {
  const { repo, x } = sections(t);
  const r = runAl(repo.dir, ['context', 'iso-dates', '--at', x]);
  ok(r);
  assert.match(notKnown(r.stdout), /^Not known\b.*(--at|\bmain\b)/, `the Not known line should say what --at leaves unread (hints comparing with main):\n${r.stdout}`);
});

test('[VW-9] a repo with no main anywhere (only trunk, no remote): the Read line says there is no main, never "local main"', (t) => {
  const repo = makeRepo(t);
  repo.git(['branch', '-m', 'main', 'trunk']);
  repo.write('specs/invoices.md', file(INV1, S0));
  addRequest(repo, 'iso-dates', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  repo.commit('iso-dates', { date: '2026-09-21T12:00:00Z' });
  assert.throws(() => repo.git(['rev-parse', '--verify', 'main']), 'the fixture: no main');
  for (const args of [['context', 'iso-dates'], ['spec']]) {
    const r = runAl(repo.dir, args);
    ok(r);
    const read = readLine(r.stdout);
    assert.ok(!read.includes('local main'), `${args.join(' ')}: there is no local main:\n${r.stdout}`);
    assert.ok(read.includes('no main'), `${args.join(' ')}: the Read line should say "no main":\n${r.stdout}`);
  }
});

test('[VW-4][VW-9] context --diff nosuchref...HEAD exits 2, and its message names nosuchref and not --at', (t) => {
  const { repo } = branch(t);
  const r = runAl(repo.dir, ['context', '--diff', 'nosuchref...HEAD']);
  assert.equal(r.code, 2, both(r));
  assert.ok(both(r).includes('nosuchref'), `the message should name nosuchref:\n${both(r)}`);
  assert.ok(!both(r).includes('--at'), `--at was not given:\n${both(r)}`);
});

// main: c0, c1, c2 (and c3 when `more`); work forks at c1 with w1 (INV-3 to S1, serving iso-dates).
function forked(t, { more = false } = {}) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  repo.commit('c0', { date: '2026-09-01T12:00:00Z' });
  addRequest(repo, 'iso-dates', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  const c1 = repo.commit('c1 iso-dates\n\nRequest: iso-dates', { date: '2026-09-02T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('specs/invoices.md', file(INV1, S1));
  repo.commit(message('w1 ISO dates', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-03T12:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  repo.write('later.txt', 'c2\n');
  repo.commit('c2', { date: '2026-09-04T12:00:00Z' });
  if (more) {
    repo.write('later.txt', 'c3\n');
    repo.commit('c3', { date: '2026-09-05T12:00:00Z' });
  }
  return { repo, c1 };
}

test('[VW-9] a shallow clone whose merge-base is not in the clone: context --diff says "history unavailable", never "share no history", and exits 2', (t) => {
  const { repo } = forked(t, { more: true });
  const clone = cloneRepo(t, repo, { depth: 1, singleBranch: false });
  assert.equal(clone.git(['rev-parse', '--is-shallow-repository']), 'true');
  assert.throws(() => clone.git(['merge-base', 'main', 'origin/work']), 'the fixture: the clone holds no merge-base');
  const r = runAl(clone.dir, ['context', '--diff', 'main...origin/work']);
  assert.equal(r.code, 2, both(r));
  assert.ok(both(r).includes('history unavailable'), both(r));
  assert.ok(!both(r).includes('share no history'), both(r));
  assert.doesNotMatch(both(r), /nothing found/i);
});

test('[VW-9] a shallow clone whose merge-base is the shallow boundary: context --diff exits 0 and its Not known line says "history unavailable"', (t) => {
  const { repo, c1 } = forked(t);
  const clone = cloneRepo(t, repo, { depth: 2, singleBranch: false });
  assert.equal(clone.git(['merge-base', 'main', 'origin/work']), c1, 'the fixture: the merge-base is in the clone');
  assert.ok(readFileSync(join(clone.dir, '.git', 'shallow'), 'utf8').includes(c1), 'the fixture: the merge-base is the shallow boundary');
  const r = runAl(clone.dir, ['context', '--diff', 'main...origin/work']);
  ok(r);
  assert.match(notKnown(r.stdout), /^Not known\b.*history unavailable/, `the Not known line should say "history unavailable":\n${r.stdout}`);
});

test('[VW-9] a single-branch clone of a feature branch (no main in it): check and context <name> say "history unavailable"', (t) => {
  const { repo } = forked(t);
  const dir = join(tempDir(t), 'clone');
  git(dirname(dir), ['clone', '-q', '--single-branch', '--branch', 'work', `file://${repo.dir}`, dir]);
  assert.throws(() => git(dir, ['rev-parse', '--verify', 'main']), 'the fixture: no main');
  assert.throws(() => git(dir, ['rev-parse', '--verify', 'origin/main']), 'the fixture: no origin/main');
  for (const args of [['check'], ['context', 'iso-dates']]) {
    const r = runAl(dir, args);
    ok(r);
    assert.ok(r.stdout.includes('history unavailable'), `${args.join(' ')} should say "history unavailable":\n${r.stdout}`);
    assert.doesNotMatch(r.stdout, /nothing found/i);
  }
});

test('[VW-9] no Not known line is empty: check with local main and no remote, and record decision without --yes', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  addRequest(repo, 'iso-dates', null);
  repo.commit('iso-dates', { date: '2026-09-21T12:00:00Z' });
  for (const args of [['check'], ['record', 'iso-dates', 'decision', '--source', 'the owner', '--text', 'CSV only.']]) {
    const r = runAl(repo.dir, args);
    ok(r);
    assert.match(notKnown(r.stdout), /^Not known\s+\S/, `${args.join(' ')}: the Not known line should have text after its label:\n${r.stdout}`);
  }
});
