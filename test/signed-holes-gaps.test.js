// Issue #136, items 10-14, from the validation's test-correctness pass.
// Items 10-13 pin rules the tool already keeps, each where a planted bug
// went unseen; item 14 is a change. Driven through the real CLI:
// (10) [REC-6] record signoff after an R is deleted names it as removed;
// (11) [REC-6][STA-7] a blocked request is dropped without a sign-off only
//      when every section retains nothing: one Kept section refuses it;
// (12) [STA-2] a remove successor carries a block only when its ID is absent:
//      with the section still at "was", the block is pending, not carried;
// (13) [REC-12] deleting a file under a request archived on main is a not ok;
// (14) [REC-4] the one-line `R<n>:` form is read for a tier-1 request only;
//      at another tier the line is plain text of the part it sits in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { ENV, addRequest, assertRefused, both, outcome } from './helpers/request.js';
import { file } from './helpers/links.js';
import { check, hint, message, noHint } from './helpers/hints.js';

const al = (repo, ...args) => runAl(repo.dir, args, { env: ENV });
const ok = (r, what) => assert.equal(r.code, 0, `${what}:\n${both(r)}`);
const status = (repo) => repo.git(['status', '--porcelain', '--untracked-files=all']);
const clean = (repo) => assert.equal(status(repo), '', 'nothing should be written');
function context(repo, name) {
  const r = al(repo, 'context', name);
  ok(r, `context ${name}`);
  return r.stdout;
}

// --- (10) record signoff names a removed R ---

test('#136 (10) [REC-6] record signoff without --yes on a signed request whose "### R2" was deleted: names R2 as removed, and writes nothing', (t) => {
  const repo = makeRepo(t);
  addRequest(repo, 'inv', null);
  const md = 'requests/inv/request.md';
  const text = repo.read(md).toString();
  const R2 = '### R2 Dates\nDates MUST show in ISO 8601.\n\n';
  assert.ok(text.includes(R2), 'the fixture: R2 in request.md');
  repo.write(md, text.replace(R2, ''));
  repo.commit('inv: R2 deleted', { date: '2026-09-22T12:00:00Z' });
  const r = al(repo, 'record', 'inv', 'signoff', '--source', 'chat with the owner');
  ok(r, 'record signoff (a preview)');
  assert.ok(lines(r.stdout).some((l) => /\bremoved\b/i.test(l) && /\bR2\b/.test(l)), `a line naming R2 as removed:\n${r.stdout}`);
  clean(repo);
});

// --- (11) a blocked --dropped with one Kept section ---

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const INV4 = '## [INV-4] Separator\nThe CSV separator is a comma.\n';
const INV4B = '## [INV-4] Separator\nThe CSV separator MUST be a semicolon.\n';

test('#136 (11) [REC-6][STA-7] blocked inv: INV-3 consolidated and Kept (D3, the owner\'s), INV-4 Dropped and still at its "was": conclude inv --dropped D4 --yes refuses, naming blocked; nothing written', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S1, INV4));
  addRequest(repo, 'inv', [
    block('[INV-3]@1 modify   Kept 2026-09-25 (D3)   for R2', { was: S0, now: S1 }),
    block('[INV-4]@1 modify   Dropped 2026-09-26 (D4)   for R1', { was: INV4, now: INV4B }),
  ], { signed: false });
  repo.commit('inv: request', { date: '2026-09-21T12:00:00Z' });
  assert.match(lines(context(repo, 'inv'))[0], /^BLOCKED/, 'the fixture: inv is blocked');
  assertRefused(al(repo, 'conclude', 'inv', '--dropped', 'D4', '--yes'), 'blocked');
  clean(repo);
});

// --- (12) a remove successor carries only when the ID is absent ---

const EX0 = '## [EX-0] Anchor\nThe anchor MUST remain.\n';
const OLD = '## [EX-1] Example\nThe example is old.\n';
const NEW = '## [EX-1] Example\nThe example MUST be new.\n';

test('#136 (12) [STA-2][STA-7] first (EX-1 old to new) and second (a remove building on first/EX-1@1), EX-1 still old in the baseline: first reads pending, not carried, and conclude first exits 1', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/ex.md', file(EX0, OLD));
  addRequest(repo, 'first', [block('[EX-1]@1 modify   for R1', { was: OLD, now: NEW })]);
  addRequest(repo, 'second', [block('[EX-1]@1 remove, was after [EX-0]   builds on first/EX-1@1   for R1', { was: NEW })]);
  repo.commit('first and second', { date: '2026-09-21T12:00:00Z' });
  const out = context(repo, 'first');
  const line = lines(out).find((l) => /\bEX-1\b/.test(l) && /^(Spec|\s)/.test(l)) ?? '';
  assert.match(line, /\bpending\b/, `EX-1 is pending:\n${out}`);
  assert.doesNotMatch(line, /carried/, `EX-1 is still in the baseline, so the remove carries nothing:\n${out}`);
  const r = al(repo, 'conclude', 'first');
  assert.equal(r.code, 1, `conclude first refuses a pending section:\n${both(r)}`);
  clean(repo);
});

// --- (13) a deletion under a request archived on main ---

test('#136 (13) [REC-12] a branch commit that deletes origin/2026-09-20-owner-words.md of done, archived on main: check gives a not ok naming that commit and the file', (t) => {
  const repo = makeRepo(t);
  addRequest(repo, 'done', null, { dir: 'requests/archive/done', status: 'concluded' });
  repo.commit('done, archived', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'feature']);
  const path = 'requests/archive/done/origin/2026-09-20-owner-words.md';
  repo.git(['rm', '-q', path]);
  const sha = repo.commit(message('Tidy done', { tier: '0 — no promise changes' }), { date: '2026-09-22T12:00:00Z' });
  hint(check(repo, '--all'), 'not ok', sha.slice(0, 7), path);
});

// --- (14) the one-line R form is for tier 1 only ---

const A1 = '## [A-1] Promise\nThe promise MUST say old.\n';
const A1B = '## [A-1] Promise\nThe promise MUST say new.\n';
const ONE_LINE = '## Organized requirement\n\nR1: The promise MUST say new. Amends: [A-1]\n';
const tierLine = (tier) => `Type: story · Tier: ${tier} · Status: open`;

// Main: specs/rules.md with A-1. On the branch: the signed request promise at
// `tier`, its organized section the one line R1, its change.md modifying A-1
// for R1, committed with Request: promise.
function oneLine(t, tier) {
  const repo = makeRepo(t);
  repo.write('specs/rules.md', file('# Rules\n', A1));
  repo.commit('Baseline', { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  addRequest(repo, 'promise', [block('[A-1]@1 modify   for R1', { was: A1, now: A1B })],
    { line: tierLine(tier), org: ONE_LINE, signedText: ONE_LINE, decisions: '' });
  repo.commit(message('promise: request', { request: 'promise', tier: `${tier} — promise` }), { date: '2026-09-21T12:00:00Z' });
  return repo;
}
const LACKS = /cites R1 in .*which its organized requirement lacks/;
const NOT_READ = 'not read as a requirement';

test('#136 (14) [REC-4][HNT-2] a tier-2 request whose organized requirement is only "R1: … Amends: [A-1]", its block for R1: check gives "promise cites R1 in …, which its organized requirement lacks" and the "not read as a requirement" note', (t) => {
  const out = check(oneLine(t, '2'), '--all');
  hint(out, 'not ok', 'promise', LACKS);
  hint(out, 'note', NOT_READ, 'promise');
});

test('#136 (14) [REC-4] contrast: the same request at Tier: 1 gives neither', (t) => {
  const out = check(oneLine(t, '1'), '--all');
  noHint(out, LACKS);
  noHint(out, NOT_READ);
});

test('#136 (14) [REC-4][REC-9] the tier-2 request, consolidated and concluded: its Outcome has no "- R1" line', (t) => {
  const repo = oneLine(t, '2');
  ok(al(repo, 'consolidate', 'promise', '--yes'), 'consolidate');
  ok(al(repo, 'conclude', 'promise', '--yes'), 'conclude');
  const { generated } = outcome(repo.read('requests/archive/promise/request.md').toString());
  assert.ok(!generated.some((l) => l.startsWith('- R1')), `at tier 2 the R1: line is not a requirement:\n${generated.join('\n')}`);
});
