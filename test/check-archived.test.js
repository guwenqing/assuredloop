// check re-runs conclude's rules on the final state of each request the
// branch archives [STA-8]: one edited after concluding so that it no longer
// passes is "not ok" ("no longer meets conclude"), owned by it, and counts
// [HNT-3]. A request archived on main is never re-checked against today's
// baseline. For a request the branch archives, a requirement in no section
// and a named child still open are notes [HNT-2].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, runAl } from './helpers/fixture.js';
import { block } from './helpers/change.js';
import { ENV, addRequest, both } from './helpers/request.js';
import { file } from './helpers/links.js';
import { assertCounts, check, hint, message, noHint, strict } from './helpers/hints.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const S2 = '## [INV-3] Dates\nDates MUST show in ISO 8601, with the time zone.\n';
const ARCHIVE = 'requests/archive/iso-dates';

function ok(repo, ...args) {
  const r = runAl(repo.dir, args, { env: ENV });
  assert.equal(r.code, 0, `al ${args.join(' ')}:\n${both(r)}`);
}
// Consolidate and conclude `name` with the tool, then commit that for it.
function conclude(repo, name, date) {
  ok(repo, 'consolidate', name, '--yes');
  ok(repo, 'conclude', name, '--yes');
  repo.commit(message(`Conclude ${name}`, { request: name, tier: '2 — conclude' }), { date });
  assert.ok(existsSync(join(repo.dir, `requests/archive/${name}/request.md`)), `the fixture: ${name} is archived`);
}

// Main: iso-dates (signed) holds INV-3 `forRs`, pending, and `more` is
// written. The branch consolidates and concludes it.
function archivedOnBranch(t, { forRs = 'for R2', more = () => {} } = {}) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  addRequest(repo, 'iso-dates', [block(`[INV-3]@1 modify   ${forRs}`, { was: S0, now: S1 })]);
  more(repo);
  repo.commit('Records', { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'iso-dates-last']);
  conclude(repo, 'iso-dates', '2026-09-21T12:00:00Z');
  return repo;
}

test('[STA-8][HNT-3] a request the branch archives that still meets conclude\'s rules gives no such not ok; check --strict exits 0', (t) => {
  const repo = archivedOnBranch(t);
  noHint(check(repo, '--all'), 'no longer meets conclude');
  strict(repo, 0);
});

// Edits after concluding, each so that conclude would now refuse.
const AFTER = {
  'its block\'s Now edited, so the block differs': (repo) => {
    const path = `${ARCHIVE}/change.md`;
    const text = repo.read(path).toString();
    assert.ok(text.includes('Dates MUST show in ISO 8601.'), 'the fixture: the block\'s Now');
    repo.write(path, text.replace('    Dates MUST show in ISO 8601.', '    Dates MUST show in ISO 8601, with the time zone.'));
  },
  'its organized requirement edited, so the sign-off is no longer current': (repo) => {
    const path = `${ARCHIVE}/request.md`;
    const text = repo.read(path).toString();
    assert.ok(text.includes('Dates MUST show in ISO 8601.'), 'the fixture: R2');
    repo.write(path, text.replace('Dates MUST show in ISO 8601.', 'Dates MUST show in ISO 8601, with the zone.'));
  },
};

for (const [label, edit] of Object.entries(AFTER)) {
  test(`[STA-8][HNT-2][HNT-3] a request archived on the branch, then ${label}: not ok ("no longer meets conclude"), owned by it; check --strict exits 1`, (t) => {
    const repo = archivedOnBranch(t);
    edit(repo);
    repo.commit(message('Edit after concluding', { request: 'iso-dates', tier: '2 — edit' }), { date: '2026-09-22T12:00:00Z' });
    assertCounts(hint(check(repo, '--all'), 'not ok', 'no longer meets conclude', 'iso-dates'));
    strict(repo, 1);
  });
}

test('[STA-8] a request archived on main is never re-checked against today\'s baseline: a branch that moves INV-3 on gives no "no longer meets conclude"', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  addRequest(repo, 'iso-dates', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  repo.commit('Records', { date: '2026-09-20T12:00:00Z' });
  conclude(repo, 'iso-dates', '2026-09-21T12:00:00Z');
  repo.git(['checkout', '-q', '-b', 'zones']);
  repo.write('specs/invoices.md', file(INV1, S2));
  repo.commit(message('Dates carry the zone', { tier: '1 — dates carry the zone' }), { date: '2026-09-22T12:00:00Z' });
  noHint(check(repo, '--all'), 'no longer meets conclude');
});

test('[HNT-2][REC-9] a request the branch archives with R1 and R3 in no section: a note for each ("in no section"); with every R in a section, none', (t) => {
  const out = check(archivedOnBranch(t), '--all');
  hint(out, 'note', 'in no section', /\bR1\b/);
  hint(out, 'note', 'in no section', /\bR3\b/);

  noHint(check(archivedOnBranch(t, { forRs: 'for R1, R2, R3' }), '--all'), 'in no section');
});

test('[HNT-2] contrast: an open request the branch serves, with R1 and R3 in no section yet, gets no "in no section" note', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  addRequest(repo, 'iso-dates', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  repo.commit('Records', { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'iso-dates-part-1']);
  ok(repo, 'consolidate', 'iso-dates', '--yes');
  repo.commit(message('Consolidate INV-3', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-21T12:00:00Z' });
  noHint(check(repo, '--all'), 'in no section');
});

// iso-dates is the parent: its parts name the child email-link, which is open
// or, when `childDone`, archived as concluded.
const withChild = (childDone) => (repo) => {
  const md = repo.read('requests/iso-dates/request.md').toString();
  repo.write('requests/iso-dates/request.md', `${md}\n## Parts\n\n1. Email link: request email-link\n`);
  addRequest(repo, 'email-link', null, childDone ? { dir: 'requests/archive/email-link', status: 'concluded' } : {});
};

test('[HNT-2][REC-8] a parent the branch concludes while a named child is still open: a note naming the child ("still open"); with the child concluded, none', (t) => {
  hint(check(archivedOnBranch(t, { forRs: 'for R1, R2, R3', more: withChild(false) }), '--all'), 'note', 'still open', 'email-link');
  noHint(check(archivedOnBranch(t, { forRs: 'for R1, R2, R3', more: withChild(true) }), '--all'), 'still open');
});
