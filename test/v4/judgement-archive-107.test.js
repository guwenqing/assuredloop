// #107: a judgement of a request that this branch concludes still clears its
// hint after `al conclude <name> --yes` moves the request to
// requests/archive/<name>/. Written before the code, from the issue and the
// architect's decision, through the al command only:
//
// - A judgement of a request that this branch concludes (open at the base,
//   archived in the working tree) still clears its hint after the move, as
//   it did before the move. This holds for each hint code that such a
//   judgement clears.
// - A request that was already archived at the base stays not checked: its
//   judgements are not applied.
// - With no base, al behaves as today.
// - No new message text and no new command.
//
// The tests use promise-kind and no-link. Of the codes tried on a change spec
// (also near-match, unresolved-link and stale-base), only these two still
// show after the move today. Nothing here reads the code under test.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { check } from './helpers/invoicer.js';
import {
  INVOICES, commitAll, doc, editFile, git, index, newRequest, ok, project, recordPath, show, write, writeConfig,
} from './helpers/project.js';
import { coded, judge, judgedLines, none, one } from './helpers/judgement-88.js';

const NAME = 'inv';
const CS = `requests/${NAME}/spec.md`;
const ARCHIVED = `requests/archive/${NAME}/spec.md`;
const TIER = `Tier: 1d — ${NAME}`;

const PLAN = 'The exporter writes each file once.';
const PLAN_NEVER = 'The exporter never writes a file twice.';
const PLAN_NEVER_B = 'The exporter never writes a file three times.';
const APPROACH = 'The exporter reads the lines of an invoice in order.';
const WHY = 'A plan step, not a promise.';
const PROMISE_KIND_MSG = 'promise kind? a plan paragraph holds never';
const NO_LINK_MSG = 'SP-2 is a approach paragraph with no link';

const paragraphs = ({ plan, approach }) => doc([
  ['SP-1 plan', plan],
  ...(approach ? [['SP-2 approach', APPROACH]] : []),
]);

// The world: the config and specs/invoices.md, and the request inv (path 1d)
// with its change spec. `at` says where the request starts:
// - 'base': open on main with SP-1 plan (PLAN); the branch feature then
//   writes the change spec `cs`;
// - 'branch': main has no request; the branch feature makes it, with `cs`;
// - 'none': as 'base', but the only branch is trunk, so there is no base.
// The change spec is indexed and committed with a Tier line.
function world(t, cs, { at = 'base' } = {}) {
  const dir = project(t);
  writeConfig(dir);
  write(dir, 'specs/invoices.md', INVOICES);
  const open = () => {
    newRequest(dir, NAME, 'The owner wants a monthly export.\n', ['--tier', '1d']);
    write(dir, CS, paragraphs({ plan: PLAN }));
    index(dir);
  };
  if (at === 'branch') {
    commitAll(dir, 'base');
    git(dir, 'checkout', '-q', '-b', 'feature');
    open();
  } else {
    open();
    commitAll(dir, `The request inv\n\n${TIER}`);
    if (at === 'none') git(dir, 'branch', '-m', 'main', 'trunk');
    else git(dir, 'checkout', '-q', '-b', 'feature');
  }
  write(dir, CS, paragraphs(cs));
  index(dir);
  commitAll(dir, `The change spec of inv\n\n${TIER}`);
  return dir;
}

// al conclude inv --yes, then al index; with `commit`, also a commit.
function concludeHere(dir, { commit = false } = {}) {
  const r = ok(dir, ['conclude', NAME, '--yes']);
  assert.ok(r.stdout.startsWith(`Concluded ${NAME}: `), show(r));
  index(dir);
  if (commit) commitAll(dir, `Conclude inv\n\n${TIER}`);
}

// The lines of al check, without the `info judged` lines. A judgement that is
// still current may name itself there; it must then be this one.
function linesBesideJudged(r, judged) {
  for (const f of judgedLines(r)) assert.equal(f.line, `info judged - - ${judged}`, `the only info judged line:\n${show(r)}`);
  return r.stdout.split('\n').filter((l) => !l.startsWith('info judged '));
}

// After the move, the run with the judgement gives what the same world with
// no judgement gives, without the one hint line that the judgement clears:
// the same exit code, the same stderr, and every other line the same.
function sameAsWithoutTheHint(after, control, hint, judged) {
  assert.equal(after.code, control.code, `the exit code of a run with no such hint:\n${show(after)}\n--- control\n${show(control)}`);
  assert.equal(after.stderr, control.stderr, show(after));
  const want = control.stdout.split('\n').filter((l) => l !== hint.line);
  assert.deepEqual(linesBesideJudged(after, judged), want, `the same output, without the hint:\n${show(after)}\n--- control\n${show(control)}`);
}

const auditLine = (r) => r.stdout.split('\n').find((l) => l.startsWith('Judgement J1 '));

// =====================================================================

const MOMENTS = [['uncommitted', false], ['committed', true]];

describe('promise-kind: a judgement of a request that this branch concludes still clears its hint after the move', () => {
  for (const [moment, commit] of MOMENTS) {
    test(`open at the base; judged on the branch; al conclude --yes (${moment}), al index, al check: no promise-kind, and the output of a run with no such hint`, (t) => {
      const cs = { plan: PLAN_NEVER };
      const dir = world(t, cs);
      const before = check(dir);
      const hint = one(coded(before, 'promise-kind', 'inv/SP-1'), before, 'promise-kind on inv/SP-1 before the judgement');
      assert.equal(hint.file, CS, show(before));
      assert.equal(hint.msg, PROMISE_KIND_MSG, show(before));

      judge(dir, 'promise-kind', 'inv/SP-1', WHY);
      const judged = check(dir);
      none(coded(judged, 'promise-kind'), judged, 'promise-kind after the judgement, before the move');

      concludeHere(dir, { commit });
      const after = check(dir);
      none(coded(after, 'promise-kind'), after, `promise-kind after al conclude --yes (${moment})`);

      // The same world with no judgement: the hint is at the archived path.
      const ctl = world(t, cs);
      concludeHere(ctl, { commit });
      const control = check(ctl);
      const back = one(coded(control, 'promise-kind', 'inv/SP-1'), control, 'promise-kind on inv/SP-1 with no judgement');
      assert.equal(back.file, ARCHIVED, show(control));
      assert.equal(back.msg, PROMISE_KIND_MSG, show(control));
      sameAsWithoutTheHint(after, control, back, `inv/J1 promise-kind inv/SP-1: ${WHY}`);
    });
  }

  test('made on the branch (not at the base); judged; al conclude --yes, al index, al check: no promise-kind, and the output of a run with no such hint', (t) => {
    const cs = { plan: PLAN_NEVER };
    const dir = world(t, cs, { at: 'branch' });
    const before = check(dir);
    assert.equal(one(coded(before, 'promise-kind', 'inv/SP-1'), before, 'promise-kind before the judgement').file, CS, show(before));
    judge(dir, 'promise-kind', 'inv/SP-1', WHY);
    none(coded(check(dir), 'promise-kind'), check(dir), 'promise-kind after the judgement, before the move');

    concludeHere(dir);
    const after = check(dir);
    none(coded(after, 'promise-kind'), after, 'promise-kind after al conclude --yes');

    const ctl = world(t, cs, { at: 'branch' });
    concludeHere(ctl);
    const control = check(ctl);
    const back = one(coded(control, 'promise-kind', 'inv/SP-1'), control, 'promise-kind with no judgement');
    assert.equal(back.file, ARCHIVED, show(control));
    sameAsWithoutTheHint(after, control, back, `inv/J1 promise-kind inv/SP-1: ${WHY}`);
  });
});

describe('no-link: a judgement of a request that this branch concludes still clears its hint after the move', () => {
  for (const [moment, commit] of MOMENTS) {
    test(`open at the base; an approach paragraph SP-2 with no link, judged on the branch; al conclude --yes (${moment}), al index, al check: no no-link on SP-2, and the output of a run with no such hint`, (t) => {
      const cs = { plan: PLAN, approach: true };
      const dir = world(t, cs);
      const before = check(dir);
      const hint = one(coded(before, 'no-link', 'SP-2'), before, 'no-link on SP-2 before the judgement');
      assert.equal(hint.file, CS, show(before));
      assert.ok(hint.msg.startsWith(NO_LINK_MSG), show(before));

      judge(dir, 'no-link', 'SP-2', WHY);
      const judged = check(dir);
      none(coded(judged, 'no-link', 'SP-2'), judged, 'no-link on SP-2 after the judgement, before the move');

      concludeHere(dir, { commit });
      const after = check(dir);
      none(coded(after, 'no-link', 'SP-2'), after, `no-link on SP-2 after al conclude --yes (${moment})`);

      const ctl = world(t, cs);
      concludeHere(ctl, { commit });
      const control = check(ctl);
      const back = one(coded(control, 'no-link', 'SP-2'), control, 'no-link on SP-2 with no judgement');
      assert.equal(back.file, ARCHIVED, show(control));
      assert.ok(back.msg.startsWith(NO_LINK_MSG), show(control));
      sameAsWithoutTheHint(after, control, back, `inv/J1 no-link SP-2: ${WHY}`);
    });
  }
});

describe('al context shows the judgement of a request that this branch concludes as current after the move', () => {
  test('al context inv: Hints none; al context inv --audit: J1 is current, not "not checked: the request is archived"', (t) => {
    const dir = world(t, { plan: PLAN_NEVER });
    judge(dir, 'promise-kind', 'inv/SP-1', WHY);
    const open = ok(dir, ['context', NAME, '--audit']);
    const current = /^Judgement J1 promise-kind inv\/SP-1 recorded \S+ \([^)]+\): current; reason: A plan step, not a promise\.$/;
    assert.match(auditLine(open) ?? '', current, `before the move:\n${show(open)}`);

    concludeHere(dir);
    const view = ok(dir, ['context', NAME]);
    assert.ok(view.stdout.split('\n').includes('Hints     none'), show(view));
    assert.ok(!view.stdout.includes('promise kind?'), show(view));
    const audit = ok(dir, ['context', NAME, '--audit']);
    assert.match(auditLine(audit) ?? '', current, show(audit));
    assert.ok(!audit.stdout.includes('not checked: the request is archived'), show(audit));
  });
});

// =====================================================================
// Controls: these hold on main today, and must still hold.

describe('Control: a request already archived at the base stays not checked; its judgements clear nothing', () => {
  // main, then the branch earlier: inv open with SP-1 plan (never) and SP-2
  // approach (no link), judged while open (J1 promise-kind, J2 no-link),
  // concluded and committed; earlier merged into main. Then the branch
  // feature.
  function archivedAtBase(t) {
    const dir = project(t);
    writeConfig(dir);
    write(dir, 'specs/invoices.md', INVOICES);
    commitAll(dir, 'base');
    git(dir, 'checkout', '-q', '-b', 'earlier');
    newRequest(dir, NAME, 'The owner wants a monthly export.\n', ['--tier', '1d']);
    write(dir, CS, paragraphs({ plan: PLAN_NEVER, approach: true }));
    index(dir);
    commitAll(dir, `The request inv\n\n${TIER}`);
    const open = check(dir);
    one(coded(open, 'promise-kind', 'inv/SP-1'), open, 'promise-kind on inv/SP-1 while inv is open');
    one(coded(open, 'no-link', 'SP-2'), open, 'no-link on SP-2 while inv is open');
    judge(dir, 'promise-kind', 'inv/SP-1', WHY);
    judge(dir, 'no-link', 'SP-2', WHY);
    const judged = check(dir);
    none(coded(judged, 'promise-kind'), judged, 'promise-kind after the judgement, while inv is open');
    none(coded(judged, 'no-link', 'SP-2'), judged, 'no-link on SP-2 after the judgement, while inv is open');
    concludeHere(dir, { commit: true });
    git(dir, 'checkout', '-q', 'main');
    git(dir, 'merge', '-q', '--no-ff', '-m', 'Merge the branch earlier', 'earlier');
    git(dir, 'checkout', '-q', '-b', 'feature');
    return dir;
  }

  const noJudged = (r) => assert.deepEqual(judgedLines(r).map((x) => x.line), [], `no info judged line:\n${show(r)}`);
  function noLinkShows(r) {
    const f = one(coded(r, 'no-link', 'SP-2'), r, 'no-link on SP-2');
    assert.equal(f.file, ARCHIVED, show(r));
    assert.equal(f.msg, NO_LINK_MSG, `the hint as today, naming no judgement:\n${show(r)}`);
  }
  function promiseKindShows(r) {
    const f = one(coded(r, 'promise-kind', 'inv/SP-1'), r, 'promise-kind on inv/SP-1');
    assert.equal(f.file, ARCHIVED, show(r));
    assert.equal(f.msg, PROMISE_KIND_MSG, `the hint as today, naming no judgement:\n${show(r)}`);
  }

  test('the branch changes only specs/invoices.md: no-link shows on the archived SP-2, whose text J2 judged; al context --audit says J1 and J2 are not checked', (t) => {
    const dir = archivedAtBase(t);
    write(dir, 'specs/invoices.md', `${INVOICES}\n${doc([['INV-50 note', 'Exports are described below.']])}`);
    index(dir);
    for (const when of ['uncommitted', 'committed']) {
      if (when === 'committed') commitAll(dir, 'A note in specs/invoices.md\n\nTier: 0 — a note');
      const r = check(dir);
      noLinkShows(r);
      noJudged(r);
    }
    const audit = ok(dir, ['context', NAME, '--audit']);
    const ls = audit.stdout.split('\n');
    for (const [id, code, on] of [['J1', 'promise-kind', 'inv/SP-1'], ['J2', 'no-link', 'SP-2']]) {
      const line = ls.find((l) => l.startsWith(`Judgement ${id} ${code} ${on} recorded `));
      assert.match(line ?? '', /: recorded; not checked: the request is archived; reason: A plan step, not a promise\.$/, show(audit));
    }
  });

  test('the branch changes the archived SP-1, which still holds never: promise-kind and no-link show, naming no judgement', (t) => {
    const dir = archivedAtBase(t);
    editFile(dir, ARCHIVED, PLAN_NEVER, PLAN_NEVER_B);
    index(dir);
    for (const when of ['uncommitted', 'committed']) {
      if (when === 'committed') commitAll(dir, `The archived SP-1 of inv\n\n${TIER}`);
      const r = check(dir);
      promiseKindShows(r);
      noLinkShows(r);
      noJudged(r);
    }
  });
});

describe('Control: with no base, al behaves as today', () => {
  // With no base, promise-kind does not show (no change is selected), so
  // this uses no-link, which shows with no base.
  test('only the branch trunk: no-link on SP-2 judged, then al conclude --yes, al index, al check: no-link shows at the archived path, as today', (t) => {
    const dir = world(t, { plan: PLAN, approach: true }, { at: 'none' });
    const before = check(dir);
    assert.match(before.stdout, /^Read {6}working tree · no base$/m, show(before));
    assert.equal(one(coded(before, 'no-link', 'SP-2'), before, 'no-link on SP-2 before the judgement').file, CS, show(before));
    judge(dir, 'no-link', 'SP-2', WHY);
    const judged = check(dir);
    none(coded(judged, 'no-link', 'SP-2'), judged, 'no-link on SP-2 after the judgement');
    concludeHere(dir);
    const after = check(dir);
    assert.match(after.stdout, /^Read {6}working tree · no base$/m, show(after));
    const f = one(coded(after, 'no-link', 'SP-2'), after, 'no-link on SP-2 after the move, with no base');
    assert.equal(f.file, ARCHIVED, show(after));
    assert.equal(f.msg, NO_LINK_MSG, show(after));
  });
});

// =====================================================================
// A binding judgement (stale-base, holder-changed, binding-unknown) of a
// request that the branch concludes is checked again, as for an open
// request (#110): with nothing changed, it stays current after the move,
// and its Binding line still names it. Only a binding judgement of a
// request archived at the base is "recorded; not checked: the request is
// archived". A non-binding judgement of that request stays current.

describe('A binding judgement of a request that the branch concludes stays current after the move; one of a request archived at the base is "recorded; not checked: the request is archived"', () => {
  const REC = recordPath(NAME);
  const WHY_BOUND = 'Checked against the new INV-12.';
  const BOUND_J1 = /^Binding {3}inv\/SP-1 builds-on INV-12 target [0-9a-f]{12} holder [0-9a-f]{12} judgement J1: bound$/;

  // main: the config and specs/invoices.md. The branch feature makes inv
  // (path 1d) with SP-1 plan builds-on:INV-12, which holds never. Then
  // INV-12 changes: stale-base and promise-kind on inv/SP-1, judged as J1
  // (stale-base) and J2 (promise-kind).
  function judgedTwice(t) {
    const dir = project(t);
    writeConfig(dir);
    write(dir, 'specs/invoices.md', INVOICES);
    commitAll(dir, 'base');
    git(dir, 'checkout', '-q', '-b', 'feature');
    newRequest(dir, NAME, 'The owner wants a monthly export.\n', ['--tier', '1d']);
    write(dir, CS, doc([['SP-1 plan builds-on:INV-12', PLAN_NEVER]]));
    index(dir);
    commitAll(dir, `The request inv\n\n${TIER}`);
    editFile(dir, 'specs/invoices.md', 'An invoice has a number', 'An invoice has a unique number');
    const r = check(dir);
    one(coded(r, 'stale-base', 'inv/SP-1'), r, 'stale-base on inv/SP-1');
    one(coded(r, 'promise-kind', 'inv/SP-1'), r, 'promise-kind on inv/SP-1');
    judge(dir, 'stale-base', 'inv/SP-1', WHY_BOUND);
    judge(dir, 'promise-kind', 'inv/SP-1', WHY);
    return dir;
  }

  function trace(dir) {
    const r = ok(dir, ['context', NAME, '--audit']);
    const ls = r.stdout.split('\n');
    return { r, binding: ls.filter((l) => l.startsWith('Binding ')), j: (id) => ls.find((l) => l.startsWith(`Judgement ${id} `)) };
  }
  function judgementIs(tr, id, code, state, reason) {
    const line = tr.j(id) ?? '';
    assert.ok(line.startsWith(`Judgement ${id} ${code} inv/SP-1 recorded `), `a Judgement line for ${id}:\n${show(tr.r)}`);
    assert.ok(line.includes(` (${REC}:`), `${id} names its record:\n${show(tr.r)}`);
    assert.ok(line.endsWith(`): ${state}; reason: ${reason}`), `${id} is "${state}":\n${show(tr.r)}`);
  }

  for (const [moment, commit] of MOMENTS) {
    test(`stale-base J1 and promise-kind J2 on inv/SP-1; al conclude --yes (${moment}), al index: --audit gives J1 and J2 current, and the Binding line still names J1 and is bound`, (t) => {
      const dir = judgedTwice(t);
      const before = trace(dir);
      assert.equal(before.binding.length, 1, show(before.r));
      assert.match(before.binding[0], BOUND_J1, show(before.r));
      judgementIs(before, 'J1', 'stale-base', 'current', WHY_BOUND);
      judgementIs(before, 'J2', 'promise-kind', 'current', WHY);

      concludeHere(dir, { commit });
      const after = trace(dir);
      assert.equal(after.binding.length, 1, show(after.r));
      assert.match(after.binding[0], BOUND_J1, show(after.r));
      judgementIs(after, 'J1', 'stale-base', 'current', WHY_BOUND);
      judgementIs(after, 'J2', 'promise-kind', 'current', WHY);
    });
  }

  test('control: the same request concluded and merged into main before the branch: J1 and J2 are both "recorded; not checked: the request is archived", and the Binding line names J1', (t) => {
    const dir = judgedTwice(t);
    concludeHere(dir, { commit: true });
    git(dir, 'checkout', '-q', 'main');
    git(dir, 'merge', '-q', '--no-ff', '-m', 'Merge the branch feature', 'feature');
    git(dir, 'checkout', '-q', '-b', 'next');
    const tr = trace(dir);
    assert.equal(tr.binding.length, 1, show(tr.r));
    assert.match(tr.binding[0], BOUND_J1, show(tr.r));
    judgementIs(tr, 'J1', 'stale-base', 'recorded; not checked: the request is archived', WHY_BOUND);
    judgementIs(tr, 'J2', 'promise-kind', 'recorded; not checked: the request is archived', WHY);
  });
});
