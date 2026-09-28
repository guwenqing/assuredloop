// Test files [LNK-3]: a file is one when a path segment is test, tests,
// __tests__ or spec; or its name matches *.test.*, *.spec.*, *_test.*,
// test_*, *Test.* or *Tests.*; or it is under a `tests:` line of
// .assuredloop (a path prefix, not a glob: a folder covers every file under
// it). Named paths add to the patterns. A file under the baseline root or
// requests/ is never a test file. al check's Tests block lists each test file
// changed from the base to the working tree, or says none changed. Each
// `tests:`, `results:` and `adrs:` path is checked like root: [SPC-2]: an
// absolute path, `..`, or a path through a symlink is exit 2, and nothing is
// written. Acceptance C6.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { makeRepo, runAl } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { addRequest, both, lineWith } from './helpers/request.js';
import { file, labelled } from './helpers/links.js';
import { check, message } from './helpers/hints.js';
import { assertAfterServes, assertNoVerdict } from './helpers/evidence.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';

// A file's text at the base (v 1) and on the branch (v 2): a section with an
// ID of its own for a .md file, a line of code for the rest.
const ids = new Map();
const text = (path, v) => {
  if (!path.endsWith('.md')) return `value = ${v}\n`;
  if (!ids.has(path)) ids.set(path, ids.size + 1);
  return `## [TST-${ids.get(path)}] Cases\nCase MUST pass, version ${v}.\n`;
};

// Main: the baseline, .assuredloop when given, `extra` (run on the repo),
// then each group of `groups` added in a commit of its own. The branch work
// changes each group in a commit of its own, so no file in one group ever
// changed together with a file in another.
function changed(t, groups, { config, baseline = { 'specs/invoices.md': INV1 }, extra } = {}) {
  const repo = makeRepo(t);
  for (const [path, body] of Object.entries(baseline)) repo.write(path, body);
  if (config) repo.write('.assuredloop', config);
  extra?.(repo);
  repo.commit('Baseline', { date: '2026-09-01T12:00:00Z' });
  groups.forEach((paths, i) => {
    for (const p of paths) repo.write(p, text(p, 1));
    repo.commit(`Group ${i}`, { date: `2026-09-0${i + 2}T12:00:00Z` });
  });
  repo.git(['checkout', '-q', '-b', 'work']);
  groups.forEach((paths, i) => {
    for (const p of paths) repo.write(p, text(p, 2));
    repo.commit(message(`Change group ${i}`, { tier: '2 — group' }), { date: `2026-09-1${i}T12:00:00Z` });
  });
  return repo;
}

// check's Tests block: it lists each of `yes` and none of `no`.
function tests(out, yes, no) {
  const b = labelled(out, 'Tests');
  assert.ok(b, `expected a line starting with Tests:\n${out}`);
  for (const p of yes) assert.ok(b.includes(p), `the Tests block should list ${p}:\n${b}`);
  for (const p of no) assert.ok(!b.includes(p), `${p} is not a test file:\n${b}`);
  assertNoVerdict(b);
  return b;
}

const PATTERNS = ['test/unit/a.js', 'tests/b.py', 'src/__tests__/c.js', 'spec/d.rb', 'src/e.test.js', 'src/f.spec.ts',
  'pkg/g_test.go', 'tools/test_h.py', 'src/InvoiceTest.java', 'src/InvoiceTests.cs'];
const LOOKALIKES = ['src/contest.js', 'src/testing.js', 'src/latest.py', 'src/attest.py', 'lib/spectrum.js',
  'src/Testament.js', 'src/testimony/x.js', 'docs/specs/y.md'];

test('C6 [LNK-3] check\'s Tests block, after the Serves line and before the hints, lists each changed test file by the common patterns: a test, tests, __tests__ or spec segment, and names *.test.*, *.spec.*, *_test.*, test_*, *Test.*, *Tests.*', (t) => {
  const repo = changed(t, [PATTERNS, LOOKALIKES]);
  const out = check(repo, '--all');
  tests(out, PATTERNS, []);
  assertAfterServes(out, 'Tests');
});

test('C6 [LNK-3] contrast: files that only look like tests (contest.js, testing.js, latest.py, attest.py, spectrum.js, Testament.js, a testimony/ folder, docs/specs/) are not test files', (t) => {
  const repo = changed(t, [PATTERNS, LOOKALIKES]);
  tests(check(repo, '--all'), [], LOOKALIKES);
});

test('C6 [LNK-3] a file under the baseline root (specs/) or under requests/ is never a test file, even in a test folder or named *.test.*', (t) => {
  const NEVER = ['specs/test/cases.md', 'specs/rounding.test.md', 'requests/csv-export/tests/cases.md', 'requests/csv-export/rows.test.js'];
  const repo = changed(t, [NEVER, ['test/control.test.js']], { extra: (r) => addRequest(r, 'csv-export', null) });
  tests(check(repo, '--all'), ['test/control.test.js'], NEVER);
});

test('C6 [LNK-3] with root: docs/spec, the baseline root is what is never a test file (docs/spec/test/, a spec segment too); specs/test/ is then a test folder like any other', (t) => {
  const NEVER = ['docs/spec/test/cases.md', 'docs/spec/rounding.test.md'];
  const repo = changed(t, [NEVER, ['specs/test/z.js']],
    { config: 'root: docs/spec\n', baseline: { 'docs/spec/invoices.md': INV1 } });
  tests(check(repo, '--all'), ['specs/test/z.js'], NEVER);
});

test('C6 [LNK-3] tests: adds a folder (every file under it, not a sibling that shares its prefix) and a single file; the common patterns still hold beside them', (t) => {
  const YES = ['qa/cases/login.js', 'qa/smoke.py', 'checks/smoke.js', 'test/control.test.js'];
  const NO = ['qa-extra/x.js', 'checks/other.js', 'specs/checks/a.md'];
  const repo = changed(t, [YES, NO], { config: 'tests: qa\ntests: checks/smoke.js\ntests: specs/checks\n' });
  tests(check(repo, '--all'), YES, NO);
});

test('C6 [LNK-3] contrast: without a tests: line, or with glob lines (tests: qa/*.js, tests: checks/*.js: a path prefix, not a glob), qa/ and checks/smoke.js are not test files', (t) => {
  for (const config of [undefined, 'tests: qa/*.js\ntests: checks/*.js\n']) {
    const repo = changed(t, [['qa/cases/login.js', 'checks/smoke.js'], ['test/control.test.js']], { config });
    tests(check(repo, '--all'), ['test/control.test.js'], ['qa/cases/login.js', 'checks/smoke.js']);
  }
});

test('C6 [LNK-3] a branch that changes no test file: the Tests block says no test file changed', (t) => {
  const repo = changed(t, [['src/export.js']]);
  const b = tests(check(repo, '--all'), [], ['src/export.js']);
  assert.ok(lineWith(b, /\bno(ne)?\b/i, /changed/i), `the Tests block should say no test file changed:\n${b}`);
});

test('C6 [LNK-3] a test file changed only in the working tree, not committed, is listed: check reads the base to the working tree', (t) => {
  const repo = changed(t, [['src/export.js']]);
  repo.write('test/export.test.js', text('test/export.test.js', 1));
  tests(check(repo, '--all'), ['test/export.test.js'], []);
});

// --- the guard ---

// Exit 2, naming the configured path, in the frame (Next, then Not known, last).
function refused(r, path) {
  assert.equal(r.code, 2, `expected exit 2:\n${both(r)}`);
  assert.ok(both(r).includes(path), `should name the configured path ${path}:\n${both(r)}`);
  const ls = lines(r.stdout);
  assert.match(ls.at(-2) ?? '', /^Next/, r.stdout);
  assert.match(ls.at(-1) ?? '', /^Not known/, r.stdout);
}
const VIEWS = [['check'], ['check', '--strict'], ['context', '--diff', 'main...HEAD'], ['context', 'INV-1']];

// A repo with a branch, a real folder outside it (../outside) and the
// `.assuredloop` `config`, committed on main.
function guarded(t, config) {
  const repo = makeRepo(t);
  const outside = join(dirname(repo.dir), 'outside');
  mkdirSync(outside);
  writeFileSync(join(outside, 'results.tap'), 'TAP version 13\nok 1 - outside\n1..1\n');
  repo.write('specs/invoices.md', INV1);
  repo.write('.assuredloop', config(outside));
  repo.commit('Config', { date: '2026-09-01T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('src/export.js', 'value = 1\n');
  repo.commit(message('Export', { tier: '2 — export' }), { date: '2026-09-02T12:00:00Z' });
  return { repo, outside };
}

test('C6 [LNK-3][SPC-2] a tests:, results: or adrs: path that is absolute, or holds .., is exit 2 in check, check --strict, context --diff and context <ID>', (t) => {
  for (const kind of ['tests', 'results', 'adrs']) {
    for (const bad of [(o) => o, () => '../outside', () => 'docs/../../outside']) {
      let path;
      const { repo } = guarded(t, (o) => `${kind}: ${(path = bad(o))}\n`);
      for (const args of VIEWS) refused(runAl(repo.dir, args), path);
      assert.equal(repo.git(['status', '--porcelain']), '', 'nothing written');
    }
  }
});

test('C6 [LNK-3][SPC-2] a tests:, results: or adrs: path through a symlink is exit 2: a committed link to a folder outside the repo, and one to a folder inside it', (t) => {
  for (const kind of ['tests', 'results', 'adrs']) {
    for (const [link, target, path] of [['link', null, 'link/cases'], ['alias', 'qa', 'alias']]) {
      const { repo } = guarded(t, () => `${kind}: ${path}\n`);
      if (target) repo.write(`${target}/x.js`, 'value = 1\n');
      symlinkSync(target ?? join(dirname(repo.dir), 'outside'), join(repo.dir, link));
      repo.commit('A symlink', { date: '2026-09-03T12:00:00Z' });
      assert.equal(repo.git(['ls-files', '-s', link]).split(' ')[0], '120000', 'the fixture commits a symlink');
      for (const args of VIEWS) refused(runAl(repo.dir, args), path);
      assert.equal(repo.git(['status', '--porcelain']), '', 'nothing written');
    }
  }
});

test('C6 [LNK-3][SPC-2] conclude --yes with an adrs: line outside the repo is exit 2 and writes nothing; with the line inside the repo it concludes', (t) => {
  for (const [config, code] of [['adrs: decisions\n', 0], ['adrs: ../outside\n', 2]]) {
    const repo = makeRepo(t);
    mkdirSync(join(dirname(repo.dir), 'outside'));
    repo.write('specs/invoices.md', file(INV1, S1));
    addRequest(repo, 'inv', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
    repo.write('.assuredloop', config);
    repo.commit('setup', { date: '2026-09-01T12:00:00Z' });
    const r = runAl(repo.dir, ['conclude', 'inv', '--yes'], { env: { SOURCE_DATE_EPOCH: '1790206200' } });
    if (code === 2) {
      refused(r, '../outside');
      assert.equal(repo.git(['status', '--porcelain']), '', 'nothing written');
    } else {
      assert.equal(r.code, 0, both(r));
      assert.notEqual(repo.git(['status', '--porcelain']), '', 'the request is archived');
    }
  }
});

test('C6 [LNK-3] contrast: tests:, results: and adrs: paths inside the repo, existing or not, are fine: exit 0 in each view', (t) => {
  const { repo } = guarded(t, () => 'tests: qa\nresults: results/ci.tap\nadrs: decisions\n');
  for (const args of VIEWS) {
    const r = runAl(repo.dir, args);
    assert.equal(r.code, 0, `al ${args.join(' ')}:\n${both(r)}`);
  }
});
