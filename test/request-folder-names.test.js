// Issue #138, item 2 [REC-1] [HNT-2] [HNT-3] [VW-1] [VW-2]: a folder under
// requests/ (or requests/archive/) counts as a request only when its name
// follows the request-name rule (lowercase letters, digits and hyphens,
// starting with a letter or digit; not `archive`). Any other folder is
// listed by no view, and check says `not ok` naming it ("is not a request
// name"), owned by no request, so check --strict exits 1 on it. A name both
// open and archived is read open first, and check says `not ok` naming it
// ("in both requests/<n> and requests/archive/<n>"). No folder name makes a
// read crash or slow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { addRequest, both } from './helpers/request.js';
import { says } from './helpers/links.js';
import { check, hint, message, noHint, strict } from './helpers/hints.js';
import { assertFinished, timed } from './helpers/bounded.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const INV1B = '## [INV-1] Totals\nTotals MUST show three decimals.\n';
const INV1C = '## [INV-1] Totals\nTotals MUST show four decimals.\n';
const INV4 = '## [INV-4] Separator\nThe CSV separator is a comma.\n';

const crash = (r) => /internal error|Invalid regular expression/.test(both(r));

// Main: the baseline INV-1 and the signed request other, holding INV-1@1.
// The branch work: one commit adding the signed request folder
// requests/<name>/ (and `extra` files), tier 1.
function branchWith(t, name, extra = {}) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  addRequest(repo, 'other', [block('[INV-1]@1 modify   for R1', { was: INV1, now: INV1 })]);
  repo.commit('Baseline and the request other', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  addRequest(repo, name, null, { dir: `requests/${name}` });
  for (const [path, text] of Object.entries(extra)) repo.write(path, text);
  repo.commit(message(`Add ${name}`, { tier: '1 — a request' }), { date: '2026-09-22T12:00:00Z' });
  return repo;
}

test('#138 [HNT-3] a commit touching requests/c++-port/request.md: al check, al context, al context --diff main...HEAD and al context other exit 0, with no internal error and no "Invalid regular expression"', (t) => {
  const repo = branchWith(t, 'c++-port');
  for (const args of [['check'], ['context'], ['context', '--diff', 'main...HEAD'], ['context', 'other']]) {
    const r = runAl(repo.dir, args);
    assert.ok(!crash(r), `al ${args.join(' ')} crashed:\n${both(r)}`);
    assert.equal(r.code, 0, `al ${args.join(' ')}:\n${both(r)}`);
  }
});

test('#138 [REC-1][HNT-2] requests/c++-port: al check says not ok naming requests/c++-port, "is not a request name"', (t) => {
  const repo = branchWith(t, 'c++-port');
  hint(check(repo, '--all'), 'not ok', 'requests/c++-port', 'is not a request name');
});

test('#138 [VW-1] requests/Big_Fix holding a request.md: al context does not list it (no "al context Big_Fix", no line opening with Big_Fix)', (t) => {
  const repo = branchWith(t, 'Big_Fix');
  const r = runAl(repo.dir, ['context']);
  assert.equal(r.code, 0, both(r));
  assert.ok(!lines(r.stdout).some((l) => /^Big_Fix\b/.test(l) || l.includes('al context Big_Fix')),
    `Big_Fix is not a request name, so it is not listed as a request:\n${r.stdout}`);
  assert.ok(lines(r.stdout).some((l) => /^other\b/.test(l)), `the request other is listed:\n${r.stdout}`);
});

test('#138 [REC-1][HNT-2][HNT-3] requests/Big_Fix: al check says not ok naming requests/Big_Fix, "is not a request name"; owned by no request, so check --strict exits 1', (t) => {
  const repo = branchWith(t, 'Big_Fix');
  hint(check(repo, '--all'), 'not ok', 'requests/Big_Fix', 'is not a request name');
  strict(repo, 1);
});

test('#138 [HNT-3] contrast: the same branch adding requests/big-fix: no "is not a request name", and check --strict exits 0', (t) => {
  const repo = branchWith(t, 'big-fix');
  noHint(check(repo, '--all'), 'is not a request name');
  strict(repo, 0);
});

// Main: the baseline INV-1 and INV-4; requests/archive/dup (concluded,
// holding INV-1@1 to four decimals and INV-4@1) and requests/dup (open,
// holding INV-1@1 to three decimals, pending).
function openAndArchived(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', `${INV1}\n${INV4}`);
  addRequest(repo, 'dup', [block('[INV-1]@1 modify   for R1', { was: INV1, now: INV1C }), block('[INV-4]@1 modify   for R2', { was: INV4, now: INV4 })],
    { dir: 'requests/archive/dup', status: 'concluded' });
  addRequest(repo, 'dup', [block('[INV-1]@1 modify   for R1', { was: INV1, now: INV1B })]);
  repo.commit('dup open and archived', { date: '2026-09-21T12:00:00Z' });
  return repo;
}

test('#138 [VW-2][VW-5] dup in both requests/dup and requests/archive/dup: the open one is read first: context dup shows INV-1 pending from the open change.md, not INV-4; spec shows the open dup/INV-1@1 pending', (t) => {
  const repo = openAndArchived(t);
  const c = runAl(repo.dir, ['context', 'dup']);
  assert.equal(c.code, 0, both(c));
  assert.ok(says(c.stdout, 'INV-1', 'pending'), `context dup should show the open request's INV-1 pending:\n${c.stdout}`);
  assert.ok(!c.stdout.includes('INV-4'), `INV-4 is held only by the archived dup:\n${c.stdout}`);
  const s = runAl(repo.dir, ['spec']);
  assert.equal(s.code, 0, both(s));
  assert.ok(lines(s.stdout).some((l) => l.includes('dup/INV-1@1') && l.includes('pending')), `spec should show the open dup/INV-1@1 pending:\n${s.stdout}`);
});

test('#138 [HNT-2] dup in both requests/dup and requests/archive/dup: al check says not ok naming dup, "in both requests/dup and requests/archive/dup"', (t) => {
  const repo = openAndArchived(t);
  hint(check(repo, '--all'), 'not ok', 'in both requests/dup and requests/archive/dup');
});

// A name that is a regex with nested quantifiers, and a file in its folder
// with a long name: a reader that builds a regex from the name and tries it
// on that path backtracks for hours.
for (const name of ['(.|.)*Q', 'a{1,99999}']) {
  test(`#138 [HNT-3] a branch adding requests/${name}/ with a 40-character file name in it: al check, al context and al context --diff main...HEAD finish (bounded), exit 0, no crash`, (t) => {
    const repo = branchWith(t, name, { [`requests/${name}/${'a'.repeat(40)}.txt`]: 'notes\n' });
    for (const args of [['check'], ['context'], ['context', '--diff', 'main...HEAD']]) {
      const r = timed(repo.dir, args);
      assertFinished(r, args);
      assert.equal(r.code, 0, `al ${args.join(' ')}:\n${both(r)}`);
    }
  });
}
