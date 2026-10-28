// #91, part 2: the hints that `al context` shows are the ones that al check
// gives after its judgements (DES-163), so the trace and al check give the
// same state for a judgement. Written before the code, from the issue and
// the architect's wording:
//
// - `al context <name>` shows `Hints     <n>` (or `Hints     none`), then one
//   line for each hint that concerns the request:
//   `  <severity> <code> <where> <id> <message>...`.
// - A hint that a current judgement clears is not shown there, with and
//   without --audit, and <n> does not count it.
// - When the judgement is stale, the hint shows again, and its message ends
//   as al check's does: "; the judgement inv/J1 (<date>) is stale: <what>
//   changed since it".
// - A judgement on a not ok does not clear it: the not ok stays, with
//   " · judgement inv/J<n> is shown; it does not clear a not ok", as al check
//   shows it.
// - The project view `al context` has `Hints     <h> hints, <k> not ok (al
//   check lists them)`; <h> no longer counts a hint that a judgement cleared.
// - At --at <commit>, no Hints section, as today. No exit code changes.
//
// The world is that of judgement-88.test.js. Nothing here reads the code
// under test.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { commitAll, editFile, ok, show } from './helpers/project.js';
import { CS, NAME, T, check, coded, judge, one, world } from './helpers/judgement-88.js';

const WHY = 'SP-2 applies R1; it is a design paragraph.';
const VIEWS = [[], ['--audit']];
const out = (r) => r.stdout.split('\n');
const context = (dir, extra = []) => ok(dir, ['context', NAME, ...extra]);
const label = (extra) => `al context ${NAME}${extra.length ? ` ${extra.join(' ')}` : ''}`;

// The Hints section of `al context <name>`: its count and its lines (the
// lines right after it that start with two spaces, without those spaces).
function hintsOf(r) {
  const ls = out(r);
  const at = ls.findIndex((l) => l.startsWith('Hints     '));
  assert.ok(at >= 0, `a Hints line:\n${show(r)}`);
  const head = ls[at].slice('Hints     '.length);
  const lines = [];
  for (let i = at + 1; i < ls.length && ls[i].startsWith('  '); i++) lines.push(ls[i].slice(2));
  const count = head === 'none' ? 0 : Number(head);
  assert.ok(Number.isInteger(count), `the Hints line is "Hints     <n>" or "Hints     none": ${ls[at]}\n${show(r)}`);
  assert.equal(lines.length, count, `the Hints count is the number of its lines:\n${show(r)}`);
  return { count, lines };
}
const promiseKindLines = (h) => h.lines.filter((l) => l.startsWith('hint promise-kind ') && l.includes(' inv/SP-2 '));

// Each line under Hints is a line of al check's output.
function fromCheck(h, c, r) {
  const lines = new Set(out(c));
  for (const l of h.lines) assert.ok(lines.has(l), `the Hints line "${l}" is a line of al check:\n${show(r)}\n${show(c)}`);
}

// The `Hints     <h> hints, <k> not ok (al check lists them)` line of the project view.
function projectHints(dir) {
  const r = ok(dir, ['context']);
  const found = out(r).filter((l) => l.startsWith('Hints     '));
  assert.equal(found.length, 1, `one Hints line:\n${show(r)}`);
  const m = /^Hints {5}(\d+) hints, (\d+) not ok \(al check lists them\)$/.exec(found[0]);
  assert.ok(m, `the project Hints line in its form:\n${show(r)}`);
  return { r, hints: Number(m[1]), notOk: Number(m[2]) };
}

// =====================================================================

describe('al context <name>: the Hints section leaves out a hint that a current judgement clears', () => {
  for (const extra of VIEWS) {
    test(`${label(extra)}: promise-kind on inv/SP-2 is shown before J1; after J1 it is not shown, and the count is one less; each Hints line is one of al check`, (t) => {
      const dir = world(t);
      const before = hintsOf(context(dir, extra));
      assert.equal(promiseKindLines(before).length, 1, `promise-kind on inv/SP-2 is shown before the judgement:\n${before.lines.join('\n')}`);
      judge(dir, 'promise-kind', 'inv/SP-2', WHY);
      const c = check(dir);
      assert.deepEqual(coded(c, 'promise-kind', 'inv/SP-2').map((f) => f.line), [], `al check gives no promise-kind on inv/SP-2:\n${show(c)}`);
      const r = context(dir, extra);
      const after = hintsOf(r);
      assert.deepEqual(promiseKindLines(after), [], `the cleared hint is not shown:\n${show(r)}`);
      assert.equal(after.count, before.count - 1, `the Hints count does not count the cleared hint:\n${show(r)}`);
      fromCheck(after, c, r);
    });
  }
});

describe('al context <name>: a stale judgement shows its hint again, as al check does', () => {
  for (const extra of VIEWS) {
    test(`${label(extra)}: SP-2 edited after J1: the promise-kind line is al check's line, which ends "; the judgement inv/J1 (<date>) is stale: <what> changed since it"`, (t) => {
      const dir = world(t);
      judge(dir, 'promise-kind', 'inv/SP-2', WHY);
      commitAll(dir, 'The judgement J1');
      editFile(dir, CS, T.SP2, T.SP2b);
      const c = check(dir);
      const f = one(coded(c, 'promise-kind', 'inv/SP-2'), c, 'promise-kind on inv/SP-2 after the edit');
      assert.match(f.msg, new RegExp(`; the judgement ${NAME}/J1 \\(\\d{4}-\\d\\d-\\d\\d\\) is stale: .+ changed since it$`), show(c));
      const r = context(dir, extra);
      assert.deepEqual(promiseKindLines(hintsOf(r)), [f.line], `the Hints line is al check's line:\n${show(r)}\n${show(c)}`);
    });
  }
});

describe('al context <name>: a judgement on a not ok does not clear it', () => {
  for (const extra of VIEWS) {
    test(`${label(extra)}: unsigned-requirement inv/R1 after J1 stays under Hints as al check's line, with " · judgement inv/J1 is shown; it does not clear a not ok"`, (t) => {
      const dir = world(t);
      const before = hintsOf(context(dir, extra));
      judge(dir, 'unsigned-requirement', 'inv/R1', 'The owner signs R1 tomorrow.');
      const c = check(dir);
      const found = coded(c, 'unsigned-requirement', 'inv/R1');
      assert.equal(found.length, 1, show(c));
      assert.ok(found[0].line.includes(` · judgement ${NAME}/J1 is shown; it does not clear a not ok`), show(c));
      const r = context(dir, extra);
      const h = hintsOf(r);
      const shown = h.lines.filter((l) => l.startsWith('not ok unsigned-requirement ') && l.includes(' inv/R1 '));
      assert.deepEqual(shown, [found[0].line], `the not ok stays, as al check shows it:\n${show(r)}\n${show(c)}`);
      assert.equal(h.count, before.count, `the count is as before the judgement:\n${show(r)}`);
    });
  }
});

// =====================================================================

describe('al context (the project view): the Hints count leaves out a hint that a judgement cleared', () => {
  test('"Hints     <h> hints, <k> not ok (al check lists them)": after J1 on promise-kind inv/SP-2, <h> is one less and <k> is the same', (t) => {
    const dir = world(t);
    const before = projectHints(dir);
    judge(dir, 'promise-kind', 'inv/SP-2', WHY);
    const after = projectHints(dir);
    assert.equal(after.hints, before.hints - 1, `<h> no longer counts the cleared hint:\n--- before\n${show(before.r)}\n--- after\n${show(after.r)}`);
    assert.equal(after.notOk, before.notOk, show(after.r));
  });

  test('control: after J1 on the not ok unsigned-requirement inv/R1, <h> and <k> are as before', (t) => {
    const dir = world(t);
    const before = projectHints(dir);
    judge(dir, 'unsigned-requirement', 'inv/R1', 'The owner signs R1 tomorrow.');
    const after = projectHints(dir);
    assert.deepEqual([after.hints, after.notOk], [before.hints, before.notOk], show(after.r));
  });
});

// =====================================================================

describe('--at <commit>: no Hints section, as today', () => {
  test('al context inv --at HEAD, with and without --audit, and al context --at HEAD: exit 0 and no Hints line, with a judgement in the record', (t) => {
    const dir = world(t);
    judge(dir, 'promise-kind', 'inv/SP-2', WHY);
    commitAll(dir, 'The judgement J1');
    for (const args of [['context', NAME, '--at', 'HEAD'], ['context', NAME, '--audit', '--at', 'HEAD'], ['context', '--at', 'HEAD']]) {
      const r = ok(dir, args);
      assert.deepEqual(out(r).filter((l) => l.startsWith('Hints')), [], `no Hints line:\n${show(r)}`);
    }
  });
});
