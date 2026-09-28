// al check --strict [HNT-3]: exit 1 on a "not ok" owned by a request the
// branch serves (its main..HEAD commits map to it by [LNK-2]: a Request line,
// else a folder, else an issue number; or it changed the request's folder) or
// archives, or owned by no request (duplicate IDs, conflict markers, Was:/Now:
// in the baseline, a tier-0 claim with a baseline edit). Another request's not
// ok shows as information, naming its owner, and does not count. context,
// spec and check exit 0, and nothing is installed in git hooks. Acceptance C3
// (a hotfix into a held section) and C8.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRepo, addOrigin, runAl, git, tempDir, sha256 } from './helpers/fixture.js';
import { block, changeMd } from './helpers/change.js';
import { ENV, addRequest, both } from './helpers/request.js';
import { contextOf, file, says } from './helpers/links.js';
import { assertCheckFrame, assertCounts, assertInformation, check, checkHints, hint, kindOf, message, noHint, strict } from './helpers/hints.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const S2 = '## [INV-3] Dates\nDates MUST show in ISO 8601, with the time zone.\n';
const INV4A = '## [INV-4] Separator\nThe CSV separator is a comma.\n';
const INV4B = '## [INV-4] Separator\nThe CSV separator MUST be a semicolon.\n';
const INV4C = '## [INV-4] Separator\nThe CSV separator MUST be a tab.\n';

// Main holds iso-dates, signed, its INV-3 consolidated: the baseline is at its Now.
function mainWithIso(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S1));
  addRequest(repo, 'iso-dates', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  repo.commit(message('iso-dates: request, INV-3 consolidated', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-21T12:00:00Z' });
  assert.ok(says(contextOf(repo, 'iso-dates').stdout, 'INV-3', 'consolidated'), 'the fixture: INV-3 is consolidated on main');
  return repo;
}

// The branch hotfix: INV-3 edited in the baseline by one commit that maps to
// no request, claiming `tier`.
function hotfix(repo, tier) {
  repo.git(['checkout', '-q', '-b', 'hotfix']);
  repo.write('specs/invoices.md', file(INV1, S2));
  repo.commit(message('Dates carry the time zone', { tier }), { date: '2026-09-22T12:00:00Z' });
  assert.equal(repo.git(['diff', '--name-only', 'main', 'HEAD']), 'specs/invoices.md', 'the fixture: only the baseline changed');
  assert.ok(!repo.git(['log', '--format=%B', 'main..HEAD']).includes('Request:'), 'the fixture: no Request line');
  assert.ok(says(contextOf(repo, 'iso-dates').stdout, 'INV-3', 'differs'), 'the fixture: iso-dates now reads differs');
}

const notOks = (out) => checkHints(out).filter((l) => kindOf(l) === 'not ok');

test('C3 [HNT-3] a hotfix claimed as tier 1, with no request, into INV-3 that iso-dates holds: check --strict exits 0; iso-dates\' differs is information, and a hotfix note names INV-3', (t) => {
  const repo = mainWithIso(t);
  hotfix(repo, '1 — dates carry the time zone');
  strict(repo, 0);
  const out = check(repo, '--all');
  assertInformation(hint(out, 'not ok', 'reads differs', 'INV-3'), 'iso-dates');
  hint(out, 'note', 'hotfix', 'INV-3');
  // A tier-1 claim with no request is not flagged; its baseline change gets the no-request-linked note.
  hint(out, 'note', 'no request linked');
  // Nothing here counts: every not ok is iso-dates' debt, shown as information.
  for (const line of notOks(out)) assertInformation(line, 'iso-dates');
});

test('C3 [HNT-3] context --diff over the hotfix shows iso-dates\' differs as information too', (t) => {
  const repo = mainWithIso(t);
  hotfix(repo, '1 — dates carry the time zone');
  const r = runAl(repo.dir, ['context', '--diff', 'main...HEAD', '--all']);
  assert.equal(r.code, 0, both(r));
  assertInformation(hint(r.stdout, 'not ok', 'reads differs', 'INV-3'), 'iso-dates');
});

test('C3 [HNT-3][REC-11] the same hotfix claimed as tier 0: the tier-0 claim with a baseline edit is a not ok no request owns, so check --strict exits 1; iso-dates\' differs is still information', (t) => {
  const repo = mainWithIso(t);
  hotfix(repo, '0 — restores the dates; no promise changes');
  strict(repo, 1);
  const out = check(repo, '--all');
  assertCounts(hint(out, 'not ok', 'tier 0', 'main..HEAD', 'INV-3'));
  assertInformation(hint(out, 'not ok', 'reads differs', 'INV-3'), 'iso-dates');
  hint(out, 'note', 'hotfix', 'INV-3');
});

// After the tier-1 hotfix reached main: iso-dates' own branch, one code
// commit with its Request line.
function holderBranch(t) {
  const repo = mainWithIso(t);
  hotfix(repo, '1 — dates carry the time zone');
  repo.git(['checkout', '-q', 'main']);
  repo.git(['merge', '-q', '--ff-only', 'hotfix']);
  repo.git(['checkout', '-q', '-b', 'iso-dates-part-2']);
  repo.write('src/dates.js', 'export const format = "iso";\n');
  repo.commit(message('ISO dates in the export', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-23T12:00:00Z' });
  return repo;
}

test('C3 [HNT-3] once the hotfix is on main, iso-dates\' own branch (served by its Request line) gets check --strict exit 1: its differs counts', (t) => {
  const repo = holderBranch(t);
  strict(repo, 1);
  const out = check(repo, '--all');
  assertCounts(hint(out, 'not ok', 'reads differs', 'INV-3'));
  noHint(out, 'hotfix');
});

test('C8 [HNT-3] with a counting not ok on the branch, context (a name, an ID, --diff, --for review), spec and check all exit 0; only check --strict exits 1', (t) => {
  const repo = holderBranch(t);
  for (const args of [['context', 'iso-dates'], ['context', 'INV-3'], ['context', '--diff', 'main...HEAD'],
    ['context', '--diff', 'main...HEAD', '--for', 'review'], ['context', 'iso-dates', '--all'], ['context', '--diff', 'main...HEAD', '--all'],
    ['spec'], ['spec', '--list'], ['check'], ['check', '--all']]) {
    const r = runAl(repo.dir, args);
    assert.equal(r.code, 0, `al ${args.join(' ')} should exit 0:\n${both(r)}`);
  }
  strict(repo, 1);
});

const MARKED = file(INV1, '## [INV-3] Dates\n<<<<<<< HEAD\nDates MUST show in ISO 8601.\n=======\nDates show in the local format.\n>>>>>>> main\n');

// Defects no request owns, each written into the baseline on a branch.
const NO_OWNER = {
  'a duplicate ID': { files: { 'specs/more.md': '## [INV-3] Dates again\nAnother rule.\n' }, key: 'duplicate ID', thing: 'INV-3' },
  'conflict markers': { files: { 'specs/invoices.md': MARKED }, key: 'conflict marker', thing: /specs\/invoices\.md|INV-3/ },
  'a Was:/Now: block': {
    files: { 'specs/invoices.md': file(INV1, "## [INV-3] Dates\nWas:\n\n    Dates show in the customer's local format.\n\nNow:\n\n    Dates MUST show in ISO 8601.\n") },
    key: 'Was:/Now:', thing: /specs\/invoices\.md|INV-3/,
  },
};

// Main holds the baseline only; the branch writes `files` in one commit claiming tier 1.
function baselineBranch(t, files) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  repo.commit('Initial spec', { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'tidy']);
  for (const [path, text] of Object.entries(files)) repo.write(path, text);
  repo.commit(message('Tidy the invoices spec', { tier: '1 — tidy the invoices spec' }), { date: '2026-09-22T12:00:00Z' });
  return repo;
}

for (const [label, { files, key, thing }] of Object.entries(NO_OWNER)) {
  test(`C8 [HNT-3][HNT-2] ${label} in the baseline is a not ok no request owns: it counts, and check --strict exits 1`, (t) => {
    const repo = baselineBranch(t, files);
    strict(repo, 1);
    assertCounts(hint(check(repo, '--all'), 'not ok', key, thing));
  });
}

test('C8 [HNT-3] contrast: the same kind of branch with a clean baseline edit has no not ok, and check --strict exits 0', (t) => {
  const repo = baselineBranch(t, { 'specs/invoices.md': file(INV1.replace('two decimals', 'two decimals, rounded half up'), S0) });
  strict(repo, 0);
  const out = check(repo, '--all');
  assert.deepEqual(notOks(out), [], `no not ok:\n${out}`);
});

test('[HNT-3] check\'s final-state rules read the working tree: an uncommitted conflict marker counts; a committed one, fixed in the working tree, is not reported', (t) => {
  const repo = baselineBranch(t, { 'specs/invoices.md': file(INV1.replace('two decimals', 'two decimals, rounded half up'), S0) });
  repo.write('specs/invoices.md', MARKED);
  assertCounts(hint(check(repo, '--all'), 'not ok', 'conflict marker', /specs\/invoices\.md|INV-3/));
  strict(repo, 1);

  const fixed = baselineBranch(t, { 'specs/invoices.md': MARKED });
  fixed.write('specs/invoices.md', file(INV1, S1));
  noHint(check(fixed, '--all'), 'conflict marker');
  strict(fixed, 0);
});

// Main: iso-dates (signed) holds INV-3, pending; csv-separator (signed) holds
// INV-4, which the baseline has neither at its Was nor at its Now. The branch
// consolidates INV-3 for iso-dates.
function twoRequests(t, { words } = {}) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0, INV4C));
  addRequest(repo, 'iso-dates', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  addRequest(repo, 'csv-separator', [block('[INV-4]@1 modify   for R1', { was: INV4A, now: INV4B })]);
  if (words) {
    const md = repo.read('requests/csv-separator/request.md').toString();
    assert.ok(md.includes('owner chat'), 'the fixture: the owner\'s words entry');
    repo.write('requests/csv-separator/request.md', md.replace('owner chat', words));
  }
  repo.commit('Records', { date: '2026-09-21T12:00:00Z' });
  assert.ok(says(contextOf(repo, 'csv-separator').stdout, 'INV-4', 'differs'), 'the fixture: csv-separator reads differs');
  repo.git(['checkout', '-q', '-b', 'iso-dates-part-1']);
  repo.write('specs/invoices.md', file(INV1, S1, INV4C));
  repo.commit(message('Consolidate INV-3', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-22T12:00:00Z' });
  return repo;
}

test('[HNT-3] another request\'s not ok (csv-separator reads differs) is information on a branch that does not serve it: check --strict exits 0', (t) => {
  const repo = twoRequests(t);
  strict(repo, 0);
  const out = check(repo, '--all');
  assertInformation(hint(out, 'not ok', 'reads differs', 'INV-4'), 'csv-separator');
  for (const line of notOks(out)) assertInformation(line, 'csv-separator');
  // INV-3, which the branch changes, is held by iso-dates, which it serves: no hotfix.
  noHint(out, 'hotfix');
});

test('[HNT-3][LNK-2] with origin/main, check reads origin/main..HEAD: a commit on local main that origin/main lacks serves its request, whose differs then counts; with no remote, main..HEAD is empty and it is information', (t) => {
  for (const remote of [true, false]) {
    const repo = makeRepo(t);
    repo.write('specs/invoices.md', file(INV1, S0, INV4C));
    addRequest(repo, 'csv-separator', [block('[INV-4]@1 modify   for R1', { was: INV4A, now: INV4B })]);
    repo.commit('Records', { date: '2026-09-21T12:00:00Z' });
    if (remote) addOrigin(t, repo);
    repo.write('src/export.js', 'export const separator = ";";\n');
    repo.commit(message('Separator', { request: 'csv-separator', tier: '2 — separator' }), { date: '2026-09-22T12:00:00Z' });
    if (remote) assert.equal(repo.git(['rev-list', '--count', 'origin/main..HEAD']), '1', 'the fixture: local main is one commit ahead of origin/main');
    const main = remote ? 'origin/main' : 'local main';
    const r = runAl(repo.dir, ['check', '--all']);
    assert.equal(r.code, 0, both(r));
    assertCheckFrame(r.stdout, main);
    const line = hint(r.stdout, 'not ok', 'reads differs', 'INV-4');
    if (remote) assertCounts(line);
    else assertInformation(line, 'csv-separator');
    const s = runAl(repo.dir, ['check', '--strict']);
    assert.equal(s.code, remote ? 1 : 0, both(s));
    assertCheckFrame(s.stdout, main);
  }
});

// Three ways the branch comes to serve csv-separator [LNK-2].
const SERVES = {
  'a Request line': (repo) => {
    repo.write('src/export.js', 'export const separator = ";";\n');
    repo.commit(message('Separator', { request: 'csv-separator', tier: '2 — separator' }), { date: '2026-09-23T12:00:00Z' });
  },
  'a change to its folder': (repo) => {
    const md = repo.read('requests/csv-separator/request.md').toString();
    repo.write('requests/csv-separator/request.md', `${md}\n## Parts\n\n1. Separator\n`);
    repo.commit(message('Plan the separator', { tier: '2 — separator' }), { date: '2026-09-23T12:00:00Z' });
  },
  'an issue number in its owner\'s words': (repo) => {
    repo.write('src/export.js', 'export const separator = ";";\n');
    repo.commit(message('Fix the separator (#57)', { tier: '2 — separator' }), { date: '2026-09-23T12:00:00Z' });
  },
};

for (const [how, serve] of Object.entries(SERVES)) {
  test(`[HNT-3][LNK-2] once the branch serves csv-separator (by ${how}), its differs counts: check --strict exits 1`, (t) => {
    const repo = twoRequests(t, { words: 'issue #57' });
    serve(repo);
    strict(repo, 1);
    assertCounts(hint(check(repo, '--all'), 'not ok', 'reads differs', 'INV-4'));
  });
}

const D1 = '- D1, 2026-09-21. Source: the owner. CSV only for now.\n';

test('[HNT-3][REC-12] an append-only edit is owned by its request, which the branch serves by changing its folder: check --strict exits 1; an appended decision exits 0', (t) => {
  for (const [edit, code] of [[(md) => md.replace(D1, D1.replace('CSV only', 'CSV and PDF')), 1], [(md) => `${md}- D5, 2026-09-27. Source: the owner. PDF later.\n`, 0]]) {
    const repo = makeRepo(t);
    addRequest(repo, 'inv', null);
    repo.commit('open inv', { date: '2026-09-21T12:00:00Z' });
    repo.git(['checkout', '-q', '-b', 'feature']);
    const md = repo.read('requests/inv/request.md').toString();
    assert.ok(md.includes(D1) && md.trimEnd().endsWith('Drop this request.'), 'the fixture: D1 in ## Decisions, which ends request.md');
    repo.write('requests/inv/request.md', edit(md));
    const c = repo.commit(message('Decisions', { tier: '1 — decisions' }), { date: '2026-09-22T12:00:00Z' });
    strict(repo, code);
    if (code) assertCounts(hint(check(repo, '--all'), 'not ok', c.slice(0, 7), 'requests/inv/request.md'));
  }
});

// Every file under .git/hooks with its bytes, and git's core.hooksPath.
function hooks(repo) {
  const dir = join(repo.dir, '.git/hooks');
  const files = readdirSync(dir, { recursive: true }).sort()
    .map((f) => (statSync(join(dir, f)).isFile() ? `${f} ${sha256(readFileSync(join(dir, f)))}` : `${f}/`));
  let hooksPath = '';
  try { hooksPath = repo.git(['config', '--get', 'core.hooksPath']); } catch { /* unset: git exits 1 */ }
  return { files, hooksPath };
}

test('C8 [HNT-3] nothing is installed in git hooks: every command, each run for real, leaves .git/hooks and core.hooksPath as they were', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  addRequest(repo, 'iso-dates', null, { signed: false });
  repo.commit('iso-dates: request', { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  const before = hooks(repo);
  assert.ok(before.files.length > 0, 'the fixture: git init wrote its sample hooks');

  const run = (args, input) => runAl(repo.dir, args, { input, env: ENV });
  const ok = (args, input) => {
    const r = run(args, input);
    assert.equal(r.code, 0, `al ${args.join(' ')} should exit 0:\n${both(r)}`);
  };
  ok(['new', 'csv-export', '--from', '-', '--tier', '2'], 'Customers want a CSV.\n');
  ok(['record', 'iso-dates', 'origin', '--url', 'https://example.com/issues/31', '--from', '-', '--yes'], 'Issue 31.\n');
  ok(['record', 'iso-dates', 'signoff', '--source', 'chat with the owner', '--yes']);
  ok(['record', 'iso-dates', 'section', 'INV-3', '--yes']);
  repo.write('requests/iso-dates/change.md', changeMd(block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })));
  ok(['record', 'iso-dates', 'decision', '--source', 'the owner', '--text', 'ISO dates everywhere.', '--yes']);
  ok(['record', 'iso-dates', 'part', '--text', 'Dates in the export', '--yes']);
  ok(['consolidate', 'iso-dates', '--yes']);
  repo.commit(message('ISO dates', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-22T12:00:00Z' });
  for (const args of [['context', 'iso-dates'], ['context', 'INV-3'], ['context', '--diff', 'main...HEAD'],
    ['spec'], ['check'], ['check', '--all']]) ok(args);
  run(['check', '--strict']);
  ok(['conclude', 'iso-dates', '--yes']);
  repo.commit(message('Conclude iso-dates', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-23T12:00:00Z' });
  ok(['check']);

  assert.deepEqual(hooks(repo), before);
});

test('C8 [HNT-3] real data: al check in a clone of this repo exits 0, with part 5\'s line, the Read line naming the working tree, and the frame', (t) => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const base = tempDir(t);
  const dir = join(base, 'clone');
  git(base, ['clone', '-q', root, dir]);
  const r = runAl(dir, ['check']);
  assert.equal(r.code, 0, both(r));
  assertCheckFrame(r.stdout, 'origin/main');
});
