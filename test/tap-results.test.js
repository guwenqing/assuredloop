// Reading TAP for base vs head [LNK-3]. A nested test is known by its path:
// a leaf "same test" under "group one" is not the leaf of that name under
// "group two", so each is compared with its own self at the base, and each
// line that names such a leaf names its group. (Review of #85, finding 3.)
// A TAP result that is incomplete (its plan is not met, or it bails out)
// did not run every test: a test it never reached is not "fixed", and its
// Results line says it is incomplete, naming the bail out when there is
// one. (Review of #85, finding 4; TAP 13's plan and "Bail out!".)
// Acceptance C6: observed, not judged; results carry their provenance, with
// base vs head.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { lineWith } from './helpers/request.js';
import { labelled } from './helpers/links.js';
import { check, message } from './helpers/hints.js';
import { assertNoVerdict, tap } from './helpers/evidence.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';

// Main: the baseline and .assuredloop naming results/, at `base`. The
// branch: one commit, `head`. The result files are written in the working
// tree.
function history(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  repo.write('.assuredloop', 'results: results\n');
  const base = repo.commit('Spec and config', { date: '2026-09-01T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  const head = repo.commit(message('Work', { tier: '2 — work' }), { date: '2026-09-02T12:00:00Z' });
  assert.equal(repo.git(['merge-base', 'main', 'HEAD']), base, 'the fixture: the branch forks at base');
  return { repo, base, head };
}

function resultsBlock(out) {
  const b = labelled(out, 'Results');
  assert.ok(b, `expected a line starting with Results:\n${out}`);
  assertNoVerdict(b);
  return b;
}

// Every entry of the Results block that holds `name`, with the failure kind
// it is given: 'new', 'already failing', 'fixed', or undefined. A line is cut
// at each kind word, and each part after one has that kind; the part before
// the first has the kind of the nearest kind word above (a heading over a
// list). A part is cut into entries at "·", ";" and ",".
const KINDS = /\bnew\b|\balready failing\b|\bfixed\b/gi;
function entries(block, name) {
  const out = [];
  let above;
  for (const line of lines(block)) {
    const cuts = [...line.matchAll(KINDS)];
    const parts = [{ kind: above, text: line.slice(0, cuts[0]?.index ?? line.length) }];
    cuts.forEach((m, i) => parts.push({ kind: m[0].toLowerCase(), text: line.slice(m.index + m[0].length, cuts[i + 1]?.index ?? line.length) }));
    for (const { kind, text } of parts) {
      for (const e of text.split(/[·;,]/)) if (e.includes(name)) out.push({ kind, text: e.trim() });
    }
    if (cuts.length) above = cuts.at(-1)[0].toLowerCase();
  }
  return out;
}

// --- nested TAP: a leaf is known by its path ---

test('C6 [LNK-3] nested TAP keeps the parent path: "same test" under group one fails only at base, under group two only at the head: group one\'s is fixed, group two\'s is new, neither is already failing at base, and each line names its group', (t) => {
  const { repo, base, head } = history(t);
  repo.write('results/base.tap', tap(base, [['group one', [['same test', 'not ok']]], ['group two', [['same test', 'ok']]]]));
  repo.write('results/head.tap', tap(head, [['group one', [['same test', 'ok']]], ['group two', [['same test', 'not ok']]]]));
  const r = resultsBlock(check(repo, '--all'));
  const es = entries(r, 'same test').filter((e) => e.kind);
  assert.ok(es.length > 0, `the Results block should give "same test" a failure kind:\n${r}`);
  for (const e of es) {
    assert.notEqual(e.kind, 'already failing', `"same test" is not one test failing at both:\n${r}`);
    assert.ok(e.text.includes('group one') || e.text.includes('group two'), `each "same test" names its group ("${e.text}"):\n${r}`);
  }
  assert.ok(es.some((e) => e.text.includes('group one') && e.kind === 'fixed'), `group one's "same test" is fixed:\n${r}`);
  assert.ok(es.some((e) => e.text.includes('group two') && e.kind === 'new'), `group two's "same test" is new:\n${r}`);
});

// --- incomplete TAP derives no "fixed" ---

const raw = (revision, ...body) => ['TAP version 13', `# revision: ${revision}`, ...body].join('\n') + '\n';
const BASE = (base) => raw(base, '1..2', 'ok 1 - first', 'not ok 2 - second');

// No entry gives "second" the kind "fixed".
const notFixed = (r) => assert.ok(!entries(r, 'second').some((e) => e.kind === 'fixed'), `"second" never ran at the head: not fixed:\n${r}`);

test('C6 [LNK-3] a head TAP that bails out before its plan is met: "second", failing at base and never run at the head, is not fixed; the head\'s Results line says incomplete and names the bail out', (t) => {
  const { repo, base, head } = history(t);
  repo.write('results/base.tap', BASE(base));
  repo.write('results/head.tap', raw(head, '1..2', 'ok 1 - first', 'Bail out! Lost worker before second'));
  const r = resultsBlock(check(repo, '--all'));
  notFixed(r);
  assert.ok(lineWith(r, 'results/head.tap', /\bincomplete\b/i, /\bbail(?:ed)?[ -]?out\b/i), `the head's line says incomplete and names the bail out:\n${r}`);
});

test('C6 [LNK-3] a head TAP cut short, its plan of 2 unmet and no bail out: "second" is not fixed, and the head\'s Results line says incomplete', (t) => {
  const { repo, base, head } = history(t);
  repo.write('results/base.tap', BASE(base));
  repo.write('results/head.tap', raw(head, '1..2', 'ok 1 - first'));
  const r = resultsBlock(check(repo, '--all'));
  notFixed(r);
  assert.ok(lineWith(r, 'results/head.tap', /\bincomplete\b/i), `the head's line says incomplete:\n${r}`);
});

test('C6 [LNK-3] contrast: a complete head TAP (plan 1..2 met) where "second" passes: "second" failed at base and is fixed, and no line says incomplete', (t) => {
  const { repo, base, head } = history(t);
  repo.write('results/base.tap', BASE(base));
  repo.write('results/head.tap', raw(head, '1..2', 'ok 1 - first', 'ok 2 - second'));
  const r = resultsBlock(check(repo, '--all'));
  assert.ok(entries(r, 'second').some((e) => e.kind === 'fixed'), `"second" is fixed:\n${r}`);
  assert.doesNotMatch(r, /\bincomplete\b/i, `both results are complete:\n${r}`);
});
