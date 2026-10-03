// TAP completeness in subtests, and points beyond the plan [LNK-3]. A subtest
// is a TAP stream of its own: its plan must be met too, and a "Bail out!"
// inside it, indented, stops the whole run. A stream with more points than
// its plan is not a clean run either. Each of these makes the head's Results
// line say incomplete (or invalid, for points beyond the plan) rather than
// show only its counts. Node's reporter output with every plan met says
// neither. (Re-review of #85, finding 2; TAP 14's subtests and plans.)
// Acceptance C6: observed, not judged; results carry their provenance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo } from './helpers/fixture.js';
import { lineWith } from './helpers/request.js';
import { labelled } from './helpers/links.js';
import { check, message } from './helpers/hints.js';
import { assertNoVerdict, tap } from './helpers/evidence.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const FLAWED = /\b(incomplete|invalid)\b/i;

// Main: the baseline and .assuredloop naming results/, at `base`. The
// branch: one commit, `head`. results/base.tap, complete, at base, and
// results/head.tap (`body` under the version and revision lines, or the
// text `body` returns) at head, both in the working tree. Returns the
// Results block of check --all.
function results(t, body) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  repo.write('.assuredloop', 'results: results\n');
  const base = repo.commit('Spec and config', { date: '2026-09-01T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  const head = repo.commit(message('Work', { tier: '2 — work' }), { date: '2026-09-02T12:00:00Z' });
  assert.equal(repo.git(['merge-base', 'main', 'HEAD']), base, 'the fixture: the branch forks at base');
  repo.write('results/base.tap', tap(base, [['group', [['first', 'ok'], ['second', 'ok']]]]));
  repo.write('results/head.tap', typeof body === 'function' ? body(head) : ['TAP version 13', `# revision: ${head}`, ...body].join('\n') + '\n');
  const b = labelled(check(repo, '--all'), 'Results');
  assert.ok(b, 'expected a line starting with Results');
  assertNoVerdict(b);
  assert.ok(lineWith(b, 'results/base.tap') && !FLAWED.test(lineWith(b, 'results/base.tap')), `the base result is complete:\n${b}`);
  return b;
}
const flawed = (b) => assert.ok(lineWith(b, 'results/head.tap', FLAWED), `the head's Results line should say incomplete or invalid:\n${b}`);

test('C6 [LNK-3] a subtest\'s plan of 2 with one point, its parent point ok and the root plan 1..1 met: the head is incomplete', (t) => {
  flawed(results(t, ['# Subtest: group', '    1..2', '    ok 1 - first', 'ok 1 - group', '1..1']));
});

test('C6 [LNK-3] a "Bail out!" indented inside a subtest stops the run: the head is incomplete', (t) => {
  flawed(results(t, ['# Subtest: group', '    1..1', '    ok 1 - first', '    Bail out! Worker unavailable', 'ok 1 - group', '1..1']));
});

test('C6 [LNK-3] a root plan of 1..1 followed by two passing points: the head is incomplete or invalid', (t) => {
  flawed(results(t, ['1..1', 'ok 1 - first', 'ok 2 - second']));
});

test('#138 [LNK-3] a TAP file with no plan line (a run killed early), its two points ok: the head is incomplete', (t) => {
  flawed(results(t, ['ok 1 - first', 'ok 2 - second']));
});

test('C6 [LNK-3] contrast: node\'s reporter output with nested groups and every plan met (a failure and a skip among them) is neither incomplete nor invalid', (t) => {
  const b = results(t, (head) => tap(head, [
    ['group one', [['first', 'ok'], ['second', 'not ok'], ['third', 'skip']]],
    ['group two', [['inner', [['deep', 'ok']]]]],
    ['last', 'ok'],
  ]));
  assert.ok(lineWith(b, 'results/head.tap'), `the head result is listed:\n${b}`);
  assert.doesNotMatch(b, FLAWED, `every plan is met:\n${b}`);
});
