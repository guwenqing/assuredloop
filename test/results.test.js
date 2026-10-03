// Test results and their provenance [LNK-3]: read only from the files the
// `results:` lines of .assuredloop name (every file in a named folder), and
// from the working tree, even for context --diff. A result file's revision is
// the first `revision: <sha>` line in its text (7 to 40 hex, any case, behind
// a `#` or `<!--` if need be). Against the head and the base (check: HEAD and
// merge-base(main, HEAD); --diff A...B: B and the merge-base; A..B: B and A)
// each file is head (evidence), base (compared with the head), older (an
// ancestor that is neither) or unknown (no revision line, a sha git does not
// know, or not an ancestor of the head). Formats: TAP (ok / not ok, nested by
// indentation, # SKIP and # TODO neither passed nor failed) and JUnit XML
// (<failure> or <error> failed, <skipped> neither). Head and base compared by
// test name: already failing at base, new, fixed. A file that is older or
// unknown, or a base result with no head result, is a note [HNT-2]: not
// evidence. Acceptance C6: observed, not judged; results carry their
// provenance, with base vs head.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { both, lineWith } from './helpers/request.js';
import { assertDiffFrame, contextDiff, indexOf, labelled } from './helpers/links.js';
import { check, hint, message, noHint } from './helpers/hints.js';
import { assertAfterServes, assertNoVerdict, count, failureKind, junit, short, tap } from './helpers/evidence.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const CODE = (mode) => `export const mode = '${mode}';\n`;

// Main: `base`, the baseline, src/rounding.js and .assuredloop (`config`, or
// none when null). The branch work: `older` then `head`, each a code change.
// Then main moves on: `trunk`, not an ancestor of the branch.
function history(t, config = 'results: results\n') {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  repo.write('src/rounding.js', CODE('half-up'));
  if (config) repo.write('.assuredloop', config);
  const base = repo.commit('Spec and code', { date: '2026-09-01T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('src/rounding.js', CODE('half-even'));
  const older = repo.commit(message('Round half even', { tier: '2 — rounding' }), { date: '2026-09-02T12:00:00Z' });
  repo.write('src/rounding.js', CODE('cents'));
  const head = repo.commit(message('Round to cents', { tier: '2 — rounding' }), { date: '2026-09-03T12:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  repo.write('src/ledger.js', CODE('ledger'));
  const trunk = repo.commit('Main moves on', { date: '2026-09-04T12:00:00Z' });
  repo.git(['checkout', '-q', 'work']);
  assert.equal(repo.git(['merge-base', 'main', 'HEAD']), base, 'the fixture: the branch forks at base');
  assert.equal(repo.git(['merge-base', '--is-ancestor', older, head]), '', 'the fixture: older is an ancestor of head');
  assert.throws(() => repo.git(['merge-base', '--is-ancestor', trunk, head]), 'the fixture: trunk is not an ancestor of head');
  return { repo, base, older, head, trunk };
}

function resultsBlock(out) {
  const b = labelled(out, 'Results');
  assert.ok(b, `expected a line starting with Results:\n${out}`);
  assertNoVerdict(b);
  return b;
}
const has = (b, ...parts) => {
  const line = lineWith(b, ...parts);
  assert.ok(line, `expected a line with ${parts.map(String).join(' and ')}:\n${b}`);
  return line;
};

// `name` is not given a failure kind: on no line with a kind word.
const notFailure = (r, name) => assert.ok(!lineWith(r, name, /\bnew\b|\balready failing\b|\bfixed\b/i), `${name} is not a failure:\n${r}`);

const A = 'totals round half up';
const B = 'dates show ISO 8601';
const C = 'separator is a comma';
const D = 'rows per line item';
const E = 'email link';

test('C6 [LNK-3] check\'s Results block, after the Serves line and before the hints: each named file with its path, its revision (7 hex), its class (head, base, older, unknown) and its pass and fail counts', (t) => {
  const { repo, base, older, head, trunk } = history(t);
  repo.write('results/ci.tap', tap(head, [[A, 'ok'], [B, 'not ok'], [C, 'ok']]));
  repo.write('results/fork.tap', tap(base, [[A, 'ok'], [B, 'ok'], [C, 'ok']]));
  repo.write('results/nightly.tap', tap(older, [[A, 'not ok']]));
  repo.write('results/local.tap', tap(null, [[A, 'ok']]));
  repo.write('results/stale.tap', tap('deadbeefcafe', [[A, 'ok']]));
  repo.write('results/trunk.tap', tap(trunk, [[A, 'ok']]));
  assert.throws(() => repo.git(['cat-file', '-e', 'deadbeefcafe^{commit}']), 'the fixture: git does not know deadbeefcafe');

  const out = check(repo, '--all');
  const r = resultsBlock(out);
  assertAfterServes(out, 'Results');
  has(r, 'results/ci.tap', short(head), /\bhead\b/, count(2, 'pass'), count(1, 'fail'));
  has(r, 'results/fork.tap', short(base), /\bbase\b/, count(3, 'pass'), count(0, 'fail'));
  has(r, 'results/nightly.tap', short(older), /\bolder\b/, count(0, 'pass'), count(1, 'fail'));
  for (const f of ['results/local.tap', 'results/stale.tap', 'results/trunk.tap']) has(r, f, /\bunknown\b/);
});

test('C6 [LNK-3][HNT-2] an older or unknown result is a note naming its path and class, not evidence; the head result and a base result beside it give none; the Not known line says a head result may not cover uncommitted changes', (t) => {
  const { repo, base, older, head, trunk } = history(t);
  repo.write('results/ci.tap', tap(head, [[A, 'ok']]));
  repo.write('results/fork.tap', tap(base, [[A, 'ok']]));
  repo.write('results/nightly.tap', tap(older, [[A, 'ok']]));
  repo.write('results/local.tap', tap(null, [[A, 'ok']]));
  repo.write('results/stale.tap', tap('deadbeefcafe', [[A, 'ok']]));
  repo.write('results/trunk.tap', tap(trunk, [[A, 'ok']]));

  const out = check(repo, '--all');
  hint(out, 'note', 'results/nightly.tap', /\bolder\b/);
  for (const f of ['results/local.tap', 'results/stale.tap', 'results/trunk.tap']) hint(out, 'note', f, /\bunknown\b/);
  noHint(out, 'results/ci.tap');
  noHint(out, 'results/fork.tap');
  assert.match(lines(out).at(-1), /uncommitted/, `with a head result shown, Not known says it may not cover uncommitted changes:\n${out}`);
});

test('C6 [LNK-3][HNT-2] a base result with no head result is a note naming its path and "base": not evidence for this change; Not known says nothing of uncommitted changes', (t) => {
  const { repo, base } = history(t);
  repo.write('results/fork.tap', tap(base, [[A, 'ok']]));
  const out = check(repo, '--all');
  has(resultsBlock(out), 'results/fork.tap', /\bbase\b/);
  hint(out, 'note', 'results/fork.tap', /\bbase\b/);
  // #139 item 17: with no head result shown, nothing to say about uncommitted changes.
  assert.doesNotMatch(lines(out).at(-1), /uncommitted/, `with no head result, Not known says nothing of uncommitted changes:\n${out}`);
});

test('C6 [LNK-3] TAP, head vs base by test name: failing at both is already failing at base, failing only at the head is new, failing only at the base is fixed; a test passing at both is no failure', (t) => {
  const { repo, base, head } = history(t);
  repo.write('results/ci.tap', tap(head, [[A, 'not ok'], [B, 'not ok'], [C, 'ok'], [D, 'ok']]));
  repo.write('results/fork.tap', tap(base, [[A, 'not ok'], [B, 'ok'], [C, 'not ok'], [D, 'ok']]));
  const r = resultsBlock(check(repo, '--all'));
  assert.equal(failureKind(r, A), 'already failing', `${A} failed at base too:\n${r}`);
  assert.equal(failureKind(r, B), 'new', `${B} fails only at the head:\n${r}`);
  assert.equal(failureKind(r, C), 'fixed', `${C} failed only at base:\n${r}`);
  notFailure(r, D);
});

test('C6 [LNK-3] JUnit XML: <failure> and <error> are failed, <skipped> neither, the rest passed; head vs base by test name as for TAP', (t) => {
  const { repo, base, head } = history(t);
  repo.write('results/ci.xml', junit(head, [[A, 'failure'], [B, 'error'], [C, 'pass'], [D, 'pass'], [E, 'skipped']]));
  repo.write('results/fork.xml', junit(base, [[A, 'failure'], [B, 'pass'], [C, 'error'], [D, 'pass'], [E, 'skipped']]));
  const r = resultsBlock(check(repo, '--all'));
  has(r, 'results/ci.xml', short(head), /\bhead\b/, count(2, 'pass'), count(2, 'fail'));
  has(r, 'results/fork.xml', short(base), /\bbase\b/, count(2, 'pass'), count(2, 'fail'));
  assert.equal(failureKind(r, A), 'already failing', r);
  assert.equal(failureKind(r, B), 'new', r);
  assert.equal(failureKind(r, C), 'fixed', r);
  notFailure(r, D);
  notFailure(r, E);
});

test('C6 [LNK-3] TAP: a point with # SKIP or # TODO is neither passed nor failed (2 passed, 1 failed of five); a TODO failing at the head only is no failure', (t) => {
  const { repo, base, head } = history(t);
  repo.write('results/ci.tap', tap(head, [[A, 'ok'], [B, 'not ok'], [C, 'skip'], [D, 'todo'], [E, 'ok']]));
  repo.write('results/fork.tap', tap(base, [[A, 'ok'], [B, 'ok'], [C, 'ok'], [D, 'ok'], [E, 'ok']]));
  const r = resultsBlock(check(repo, '--all'));
  has(r, 'results/ci.tap', count(2, 'pass'), count(1, 'fail'));
  assert.equal(failureKind(r, B), 'new', r);
  notFailure(r, C);
  notFailure(r, D);
});

test('C6 [LNK-3] TAP from node\'s --test-reporter=tap: indentation nests subtests; a subtest failing only at the head is new, its passing sibling is no failure', (t) => {
  const { repo, base, head } = history(t);
  repo.write('results/ci.tap', tap(head, [['invoice dates', [['show ISO 8601', 'not ok'], ['keep the zone', 'ok']]], [A, 'ok']]));
  repo.write('results/fork.tap', tap(base, [['invoice dates', [['show ISO 8601', 'ok'], ['keep the zone', 'ok']]], [A, 'ok']]));
  const r = resultsBlock(check(repo, '--all'));
  assert.equal(failureKind(r, 'show ISO 8601'), 'new', r);
  notFailure(r, 'keep the zone');
});

test('C6 [LNK-3] the revision line: a full sha, upper case, at the end of the file, in an XML comment; the first match counts; six hex digits are no revision', (t) => {
  const { repo, base, head } = history(t);
  const ok = [[A, 'ok']];
  repo.write('results/full.tap', tap(head, ok));
  repo.write('results/upper.tap', tap(short(head).toUpperCase(), ok));
  repo.write('results/end.tap', tap(head, ok, { revisionAt: 'end' }));
  repo.write('results/ci.xml', junit(head.slice(0, 10), [[A, 'pass']]));
  repo.write('results/first.tap', `${tap(base, ok)}# revision: ${head}\n`);
  repo.write('results/six.tap', tap(head.slice(0, 6), ok));
  const r = resultsBlock(check(repo, '--all'));
  for (const f of ['results/full.tap', 'results/upper.tap', 'results/end.tap', 'results/ci.xml']) has(r, f, /\bhead\b/);
  has(r, 'results/first.tap', short(base), /\bbase\b/);
  has(r, 'results/six.tap', /\bunknown\b/);
});

test('C6 [LNK-3] only named files are read: a named file in neither format is skipped (not TAP or JUnit XML), a named file that is missing is not found, and an unnamed result file is not read', (t) => {
  const { repo, base, head } = history(t, 'results: results/ci.tap\nresults: results/notes.txt\nresults: results/missing.tap\n');
  repo.write('results/ci.tap', tap(head, [[A, 'ok']]));
  repo.write('results/notes.txt', `All 12 tests passed.\nrevision: ${head}\n`);
  repo.write('results/fork.tap', tap(base, [[A, 'ok']]));
  const out = check(repo, '--all');
  const r = resultsBlock(out);
  has(r, 'results/ci.tap', /\bhead\b/);
  has(r, 'results/notes.txt', /\bskipped\b/, /\bTAP\b/);
  has(r, 'results/missing.tap', /not found/);
  assert.ok(!r.includes('results/fork.tap'), `results/fork.tap is not named:\n${r}`);
  noHint(out, 'results/fork.tap');
});

test('C6 [LNK-3] with no results: line, the Results block says no result files are named, and a result file lying in the repo is not read', (t) => {
  const { repo, head } = history(t, null);
  repo.write('results/ci.tap', tap(head, [[A, 'ok']]));
  repo.write('test-results.xml', junit(head, [[A, 'pass']]));
  const r = resultsBlock(check(repo, '--all'));
  assert.ok(lineWith(r, /\bno\b/i, /\bresult/i, /\bnamed\b/i), `the Results block should say no result files are named:\n${r}`);
  assert.ok(!r.includes('results/ci.tap') && !r.includes('test-results.xml'), `unnamed files are not read:\n${r}`);
});

// context --diff over `range`: exit 0 in the frame; its Results block.
function diffResults(repo, range) {
  const r = contextDiff(repo, range);
  assert.equal(r.code, 0, `context --diff ${range}:\n${both(r)}`);
  assertDiffFrame(r.stdout);
  return resultsBlock(r.stdout);
}

test('C6 [LNK-3][VW-4] context --diff classes each result against its range: A...B has head B and base the merge-base; A..B has head B and base A; a result newer than B is unknown', (t) => {
  const { repo, base, older, head } = history(t);
  repo.write('results/ci.tap', tap(head, [[A, 'ok']]));
  repo.write('results/nightly.tap', tap(older, [[A, 'ok']]));
  repo.write('results/fork.tap', tap(base, [[A, 'ok']]));

  const three = diffResults(repo, 'main...HEAD');
  has(three, 'results/ci.tap', /\bhead\b/);
  has(three, 'results/fork.tap', /\bbase\b/);
  has(three, 'results/nightly.tap', /\bolder\b/);

  const two = diffResults(repo, `${older}..${head}`);
  has(two, 'results/ci.tap', /\bhead\b/);
  has(two, 'results/nightly.tap', /\bbase\b/);
  has(two, 'results/fork.tap', /\bolder\b/);

  const early = diffResults(repo, `main...${older}`);
  has(early, 'results/nightly.tap', /\bhead\b/);
  has(early, 'results/fork.tap', /\bbase\b/);
  has(early, 'results/ci.tap', /\bunknown\b/);
});

test('C6 [LNK-3][VW-4] context --diff reads result files from the working tree, not from the range\'s commits', (t) => {
  const { repo, head } = history(t);
  // Committed: all passing, at the revision before the new head.
  repo.write('results/ci.tap', tap(head, [[A, 'ok'], [B, 'ok']]));
  const top = repo.commit(message('Results', { tier: '2 — results' }), { date: '2026-09-05T12:00:00Z' });
  // The working tree: one failing, at the new head.
  repo.write('results/ci.tap', tap(top, [[A, 'ok'], [B, 'not ok']]));
  has(diffResults(repo, 'main...HEAD'), 'results/ci.tap', short(top), /\bhead\b/, count(1, 'pass'), count(1, 'fail'));
});

test('C6 [VW-4][LNK-3] context --diff --for review: the evidence part holds the Tests and Results blocks, with the result\'s class', (t) => {
  const { repo, head } = history(t);
  repo.write('results/ci.tap', tap(head, [[A, 'ok']]));
  const r = runAl(repo.dir, ['context', '--diff', 'main...HEAD', '--for', 'review']);
  assert.equal(r.code, 0, both(r));
  assertDiffFrame(r.stdout);
  const ls = lines(r.stdout);
  const i = indexOf(ls, /^[#\s]*Intent\b/i);
  const e = indexOf(ls, /^[#\s]*Evidence\b/i, i + 1);
  assert.ok(i >= 0 && e > i, `expected an Intent part, then an Evidence part:\n${r.stdout}`);
  const evidence = ls.slice(e).join('\n');
  assert.ok(labelled(evidence, 'Tests'), `the evidence part should hold a Tests block:\n${r.stdout}`);
  has(resultsBlock(evidence), 'results/ci.tap', /\bhead\b/);
});
