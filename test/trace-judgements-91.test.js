// #91: the full trace (`al context <name> --audit`) shows each judgement of
// the request's record with its state, and each Binding line names its
// judgement and its judged_target_sha256 (light-resign/R1; assuredloop-v4/R9;
// DES-163, DES-130, DES-125). Written before the code, from the issue and
// the agreed wording:
//
// - After the Binding lines, one line for each entry of `judgements:`, in
//   record order:
//   `Judgement J<n> <hint> <on> recorded <recorded> (<record>:<line>): <state>; reason: <reason>`
//   <line> is the line where the entry starts in the record file.
// - <state> equals what al check decides: current (on al check's "info
//   judged" line); "stale: <what> changed since it" (the <what> of al
//   check's hint); "history: ..." for an older judgement; "shown on a not
//   ok; it does not clear a not ok"; "no hint now: ...". A binding judgement
//   is current while no binding that names it gives a hint, and history
//   when no binding names it now. issue-changed, archived, --at and an
//   entry with no hint code or no --on have their own words.
// - `Binding   <holder> <link> <target>[ version <v>] target <sha12>
//   holder <sha12>[ judged target <sha12>][ judgement J<n>]: <state>`; the
//   state compares the target with judged_target_sha256 when the record
//   holds it, else with target_sha256.
// - Under --audit only, the Records line also names the bindings and the
//   judgements when the record holds them. No exit code changes.
//
// The worlds are those of judgement-88.test.js. Nothing here reads the code
// under test.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findings } from './helpers/invoicer.js';
import {
  WORDS_FILE, al, appendSection, binding, commitAll, doc, editFile, editRecord, git, hashOf, index, move, newRequest, ok,
  organized, record, req, show, write, writeYaml,
} from './helpers/project.js';
import {
  CS, NAME, R1, REC, SPEC, T, base, check, coded, judge, judgedLine, onLink, one, world,
} from './helpers/judgement-88.js';
import {
  agrees, allBindingsShown, audit, bindingLines, entryStarts, expectedBinding, hasBinding, hasJudgement, judgementLines,
  judgementsInOrder, listed, out, recordsLine, staleWhats,
} from './helpers/trace-91.js';

const WHY = 'SP-2 applies R1; it is a design paragraph.';
const WHY2 = 'SP-2 still applies R1.';
const SP2_FIXED = 'The exporter writes one file per month.';
const RECORDS_TODAY = `Records   only al's record ${REC} holds the requirement versions below`;

// The one <what> that al check's hints give for J<n> as stale.
function oneWhat(c, n) {
  const whats = staleWhats(c, n);
  assert.equal(whats.length, 1, `one hint of al check names ${NAME}/J${n} as stale:\n${show(c)}`);
  return whats[0];
}

// =====================================================================

describe('a judgement on a hint that is not a binding hint (promise-kind): current, stale, history, no hint now', () => {
  test('current: one Judgement line J1 after the Binding lines, with the line of its entry in the record; al check lists J1 on its info judged line', (t) => {
    const dir = world(t);
    judge(dir, 'promise-kind', 'inv/SP-2', WHY);
    const r = audit(dir);
    assert.equal(judgementLines(r).length, 1, show(r));
    judgementsInOrder(r, dir);
    hasJudgement(r, dir, 1, 'current');
    const c = check(dir);
    assert.equal(judgedLine(c), `${NAME}/J1 promise-kind inv/SP-2: ${WHY}`, show(c));
    agrees(r, c);
  });

  test('the <record>:<line> of the Judgement line is the line of the entry in the record file, also after the commit', (t) => {
    const dir = world(t);
    judge(dir, 'promise-kind', 'inv/SP-2', WHY);
    commitAll(dir, 'The judgement J1');
    const [line] = entryStarts(dir);
    const recordText = git(dir, 'show', `HEAD:${REC}`).split('\n');
    assert.match(recordText[line - 1], /^\s*- (\{ )?id: J1\b/, `line ${line} of the record starts the entry J1`);
    const r = audit(dir);
    const found = judgementLines(r).filter((l) => l.startsWith('Judgement J1 '));
    assert.equal(found.length, 1, show(r));
    assert.ok(found[0].includes(` (${REC}:${line}): `), `the Judgement line names ${REC}:${line}:\n${show(r)}`);
  });

  test('stale: SP-2 changes after J1; al check names J1 stale; the trace says "stale: <what> changed since it" with al check\'s <what>', (t) => {
    const dir = world(t);
    judge(dir, 'promise-kind', 'inv/SP-2', WHY);
    commitAll(dir, 'The judgement J1');
    editFile(dir, CS, T.SP2, T.SP2b);
    const c = check(dir);
    one(coded(c, 'promise-kind', 'inv/SP-2'), c, 'promise-kind on inv/SP-2 after the edit');
    const what = oneWhat(c, 1);
    const r = audit(dir);
    hasJudgement(r, dir, 1, `stale: ${what} changed since it`);
    agrees(r, c);
  });

  test('history: J1, then SP-2 changes, then J2 on the same hint and ID: J1 is "history: inv/J2 is newer on the same hint and ID"; J2 is current; record order', (t) => {
    const dir = world(t);
    judge(dir, 'promise-kind', 'inv/SP-2', WHY);
    commitAll(dir, 'The judgement J1');
    editFile(dir, CS, T.SP2, T.SP2b);
    judge(dir, 'promise-kind', 'inv/SP-2', WHY2);
    const r = audit(dir);
    judgementsInOrder(r, dir);
    hasJudgement(r, dir, 1, `history: ${NAME}/J2 is newer on the same hint and ID`);
    hasJudgement(r, dir, 2, 'current');
    const c = check(dir);
    assert.ok(listed(c, 2) && !listed(c, 1), `al check lists J2 and not J1:\n${show(c)}`);
    agrees(r, c);
  });

  test('no hint now: SP-2 loses its MUST after J1; al check gives no promise-kind on inv/SP-2; the trace says "no hint now: al check gives no promise-kind hint on inv/SP-2"', (t) => {
    const dir = world(t);
    judge(dir, 'promise-kind', 'inv/SP-2', WHY);
    editFile(dir, CS, T.SP2, SP2_FIXED);
    const c = check(dir);
    assert.deepEqual(coded(c, 'promise-kind', 'inv/SP-2').map((f) => f.line), [], show(c));
    const r = audit(dir);
    hasJudgement(r, dir, 1, 'no hint now: al check gives no promise-kind hint on inv/SP-2');
    agrees(r, c);
  });

  test('a judgement on a not ok (unsigned-requirement inv/R1): "shown on a not ok; it does not clear a not ok"; al check shows it on the not ok line', (t) => {
    const dir = world(t);
    judge(dir, 'unsigned-requirement', 'inv/R1', 'The owner signs R1 tomorrow.');
    const c = check(dir);
    const f = coded(c, 'unsigned-requirement', 'inv/R1');
    assert.equal(f.length, 1, show(c));
    assert.ok(f[0].line.includes(` · judgement ${NAME}/J1 is shown; it does not clear a not ok`), show(c));
    const r = audit(dir);
    hasJudgement(r, dir, 1, 'shown on a not ok; it does not clear a not ok');
    agrees(r, c);
  });
});

// =====================================================================

describe('a binding judgement: the Judgement line and the Binding lines that name it', () => {
  const SB = 'SP-1 still builds on the invoice data.';
  function judged(t) {
    const dir = world(t);
    editFile(dir, SPEC, T.INV12, T.INV12b);
    judge(dir, 'stale-base', 'inv/SP-1', SB);
    commitAll(dir, 'INV-12 changed, with the judgement J1');
    return dir;
  }

  test('stale-base J1 on inv/SP-1, current: the Binding line of builds-on INV-12 ends "judgement J1: bound"; each Binding line is in the agreed form; al check lists J1', (t) => {
    const dir = judged(t);
    const r = audit(dir);
    hasJudgement(r, dir, 1, 'current');
    hasBinding(r, binding(record(dir, NAME), 'inv/SP-1', 'builds-on', 'INV-12'), 'bound');
    hasBinding(r, binding(record(dir, NAME), 'inv/SP-1', 'serves', 'inv/R1'), 'bound');
    allBindingsShown(r, dir);
    agrees(r, check(dir));
  });

  test('stale: INV-12 changes again; the Judgement line says "stale: <what> changed since it" with al check\'s <what>; the Binding line ends "judgement J1: stale"', (t) => {
    const dir = judged(t);
    editFile(dir, SPEC, T.INV12b, T.INV12c);
    const c = check(dir);
    const what = oneWhat(c, 1);
    const r = audit(dir);
    hasJudgement(r, dir, 1, `stale: ${what} changed since it`);
    hasBinding(r, binding(record(dir, NAME), 'inv/SP-1', 'builds-on', 'INV-12'), 'stale');
    agrees(r, c);
  });

  test('history: INV-12 changes again and J2 moves the binding; J1 is "history: no binding names it now"; J2 is current, and the Binding line names J2', (t) => {
    const dir = judged(t);
    editFile(dir, SPEC, T.INV12b, T.INV12c);
    judge(dir, 'stale-base', 'inv/SP-1', 'SP-1 still builds on it, again.');
    const b = binding(record(dir, NAME), 'inv/SP-1', 'builds-on', 'INV-12');
    assert.equal(b.judgement, 'J2', 'J2 moved the binding');
    const r = audit(dir);
    judgementsInOrder(r, dir);
    hasJudgement(r, dir, 1, 'history: no binding names it now');
    hasJudgement(r, dir, 2, 'current');
    hasBinding(r, b, 'bound');
    agrees(r, check(dir));
  });

  test('holder-changed J1 on INV-60 moves both its bindings; then INV-13 changes: J1 is stale with the <what> of the one hint that names it; builds-on INV-13 is stale, serves inv/R1 is bound, both name J1', (t) => {
    const dir = world(t);
    editFile(dir, SPEC, T.INV60, T.INV60b);
    judge(dir, 'holder-changed', 'INV-60', 'INV-60 still serves R1 and builds on INV-13.');
    commitAll(dir, 'INV-60 changed, with the judgement J1');
    let r = audit(dir);
    hasJudgement(r, dir, 1, 'current');
    for (const [link, target] of [['serves', 'inv/R1'], ['builds-on', 'INV-13']]) {
      const b = binding(record(dir, NAME), 'INV-60', link, target);
      assert.equal(b.judgement, 'J1');
      hasBinding(r, b, 'bound');
    }
    agrees(r, check(dir));

    editFile(dir, SPEC, T.INV13, T.INV13b);
    const c = check(dir);
    one(onLink(c, 'stale-base', 'INV-60', 'builds-on', 'INV-13'), c, 'stale-base on INV-60 builds-on INV-13');
    const what = oneWhat(c, 1);
    r = audit(dir);
    hasJudgement(r, dir, 1, `stale: ${what} changed since it`);
    hasBinding(r, binding(record(dir, NAME), 'INV-60', 'builds-on', 'INV-13'), 'stale');
    hasBinding(r, binding(record(dir, NAME), 'INV-60', 'serves', 'inv/R1'), 'bound');
    agrees(r, c);
  });
});

// =====================================================================

describe('a binding with judged_target_sha256: the Binding line names it, and its state compares the target with it', () => {
  // As in judgement-88-review.test.js: SP-1 data serves:R1 changes:INV-12
  // builds-on:INV-13. inv part 1 changes INV-12 and merges; other work on
  // main changes INV-12 again; then the branch feature-2 of inv.
  const SP1 = 'The invoice number is unique in the shop.';
  const H = `${NAME}/SP-1`;
  const INV12d = 'An invoice has a unique number, one customer, lines, a total and a due date.';
  function changed(t) {
    const dir = base(t, { adr: false });
    newRequest(dir, NAME, 'The owner wants unique invoice numbers.\n', ['--tier', '2']);
    appendSection(dir, NAME, organized([R1]));
    write(dir, CS, doc([['SP-1 data serves:R1 changes:INV-12 builds-on:INV-13', SP1]]));
    index(dir);
    commitAll(dir, `The request ${NAME}\n\nTier: 2 — ${NAME}`);
    editFile(dir, SPEC, T.INV12, T.INV12b);
    commitAll(dir, `${NAME}: INV-12 gets a unique number`);
    index(dir);
    commitAll(dir, `${NAME}: records`);
    git(dir, 'checkout', '-q', 'main');
    git(dir, 'merge', '-q', '--no-ff', '-m', `Merge ${NAME} part 1`, 'feature');
    editFile(dir, SPEC, T.INV12b, T.INV12c);
    index(dir);
    commitAll(dir, 'other work: one customer');
    git(dir, 'checkout', '-q', '-b', 'feature-2');
    write(dir, 'src/number.js', 'export const unique = true;\n');
    commitAll(dir, `${NAME}: part 2`);
    return dir;
  }
  const changesOf = (dir) => binding(record(dir, NAME), H, 'changes', 'INV-12');

  test('before the judgement: the changes binding is stale, with no judged target and no judgement; after the stale-base judgement: "judged target <sha12> judgement J1: bound", not stale; J1 is current', (t) => {
    const dir = changed(t);
    let c = check(dir);
    one(onLink(c, 'stale-base', H, 'changes', 'INV-12'), c, 'stale-base on inv/SP-1 changes INV-12');
    let r = audit(dir);
    const was = changesOf(dir);
    assert.equal(was.judged_target_sha256, undefined);
    hasBinding(r, was, 'stale');
    assert.deepEqual(judgementLines(r), [], show(r));

    judge(dir, 'stale-base', H, 'SP-1 still changes INV-12 as intended.');
    const now = changesOf(dir);
    assert.equal(now.judged_target_sha256, hashOf(dir, SPEC, 'INV-12'), 'judged_target_sha256 is INV-12 now');
    assert.notEqual(now.target_sha256.slice(0, 12), now.judged_target_sha256.slice(0, 12), 'the two target versions differ');
    c = check(dir);
    assert.deepEqual(onLink(c, 'stale-base', H, 'changes', 'INV-12').map((f) => f.line), [], show(c));
    r = audit(dir);
    hasBinding(r, now, 'bound');
    assert.ok(out(r).includes(expectedBinding(now, 'bound')) && !out(r).includes(expectedBinding(now, 'stale')), show(r));
    hasJudgement(r, dir, 1, 'current');
    allBindingsShown(r, dir);
    agrees(r, c);
  });

  test('other work changes INV-12 again after the judgement: the Binding line, with its judged target, is stale; J1 is stale with al check\'s <what>', (t) => {
    const dir = changed(t);
    judge(dir, 'stale-base', H, 'SP-1 still changes INV-12 as intended.');
    commitAll(dir, `${NAME}: J1`);
    git(dir, 'checkout', '-q', 'main');
    git(dir, 'merge', '-q', '--no-ff', '-m', `Merge ${NAME} part 2`, 'feature-2');
    editFile(dir, SPEC, T.INV12c, INV12d);
    index(dir);
    commitAll(dir, 'other work: a due date');
    git(dir, 'checkout', '-q', '-b', 'feature-3');
    const c = check(dir);
    const what = oneWhat(c, 1);
    const r = audit(dir);
    hasBinding(r, changesOf(dir), 'stale');
    hasJudgement(r, dir, 1, `stale: ${what} changed since it`);
    agrees(r, c);
  });
});

// =====================================================================

describe('issue-changed judgements: al context does not read the work items', () => {
  // A repo with origin acme/invoicer, and the items folder beside it. The
  // request inv has the task T1 for #5. With `section`, the request has R1
  // to sign.
  const FOLDER = '../items';
  const ISSUES = ['--issues', FOLDER];
  const READ = 'Read the change; the task still holds.';
  const item = (body) => `${JSON.stringify({ body, comments: [], number: 5, parent: null, state: 'OPEN', url: 'https://github.com/acme/invoicer/issues/5' }, null, 2)}\n`;
  const A = 'Build the export.\n';
  const B = 'Build the export as JSON.\n';
  const C = 'Build the export as CSV, one file per month.\n';
  const NOT_KNOWN = 'not known whether the item changed since it: al check --issues <folder> reads the item';
  function items(t, { section = false } = {}) {
    const root = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-91-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const dir = join(root, 'invoicer');
    const folder = join(root, 'items');
    mkdirSync(dir);
    mkdirSync(folder);
    git(dir, 'init', '-q', '-b', 'main');
    git(dir, 'config', 'user.name', 'Fixture Author');
    git(dir, 'config', 'user.email', 'author@example.invalid');
    git(dir, 'config', 'commit.gpgsign', 'false');
    git(dir, 'remote', 'add', 'origin', 'git@github.com:acme/invoicer.git');
    writeYaml(dir, '.assuredloop/config.yaml', { docs: [{ file: SPEC, prefix: 'INV' }] });
    write(dir, SPEC, doc([['INV-1 note', '# Invoices'], ['INV-2 rule', 'An invoice MUST have at least one line.']]));
    commitAll(dir, 'base');
    git(dir, 'checkout', '-q', '-b', 'feature');
    write(folder, 'invoicer-5.json', item(A));
    ok(dir, ['new', NAME, '--from', '-'], { input: 'The owner wants the monthly export.\n' });
    if (section) appendSection(dir, NAME, organized([req('R1', 'Monthly CSV download', 'A user MUST be able to download one month as one CSV file.', [WORDS_FILE])]));
    editRecord(dir, NAME, (rec) => { rec.tasks = [{ id: 'T1', ref: '#5' }]; });
    ok(dir, ['index', ...ISSUES]);
    commitAll(dir, 'name the item');
    return { dir, save: (body) => write(folder, 'invoicer-5.json', item(body)) };
  }
  const judgeItem = (dir) => ok(dir, ['record', NAME, 'judgement', '--hint', 'issue-changed', '--on', '#5', '--reason', READ, ...ISSUES, '--yes']);
  const checkIssues = (dir) => {
    const r = al(dir, ['check', ...ISSUES]);
    return { ...r, findings: findings(r.stdout) };
  };

  test('the newest judgement at the moment of reliance: "not known whether the item changed since it: al check --issues <folder> reads the item"', (t) => {
    const w = items(t);
    w.save(B);
    one(coded(checkIssues(w.dir), 'issue-changed'), checkIssues(w.dir), 'issue-changed before the judgement');
    judgeItem(w.dir);
    assert.deepEqual(coded(checkIssues(w.dir), 'issue-changed').map((f) => f.line), [], 'the judgement clears the hint');
    const r = audit(w.dir);
    assert.equal(judgementLines(r).length, 1, show(r));
    hasJudgement(r, w.dir, 1, NOT_KNOWN);
  });

  test('history: the item changes again and J2 judges it at the same moment: J1 is "history: inv/J2 is newer on the same item and moment"', (t) => {
    const w = items(t);
    w.save(B);
    judgeItem(w.dir);
    commitAll(w.dir, 'the change of #5 was read');
    w.save(C);
    judgeItem(w.dir);
    const r = audit(w.dir);
    judgementsInOrder(r, w.dir);
    hasJudgement(r, w.dir, 1, `history: ${NAME}/J2 is newer on the same item and moment`);
    hasJudgement(r, w.dir, 2, NOT_KNOWN);
  });

  test('stale: J1 at the naming, then the sign-off S1 becomes the moment of reliance: "stale: the moment of reliance is now the sign-off S1"; a new J2 at S1 is the newest', (t) => {
    const w = items(t, { section: true });
    w.save(B);
    judgeItem(w.dir);
    w.save(C);
    ok(w.dir, ['record', NAME, 'signoff', '--source', 'email from the owner', '--words', 'Yes, sign it', '--yes']);
    ok(w.dir, ['index', ...ISSUES]);
    commitAll(w.dir, 'sign off');
    const s = (record(w.dir, NAME).signoff ?? []).map((x) => x.id);
    assert.deepEqual(s, ['S1'], `one sign-off, S1:\n${JSON.stringify(record(w.dir, NAME).signoff)}`);
    let r = audit(w.dir);
    hasJudgement(r, w.dir, 1, 'stale: the moment of reliance is now the sign-off S1');

    w.save(B);
    one(coded(checkIssues(w.dir), 'issue-changed'), checkIssues(w.dir), 'issue-changed after the sign-off');
    judgeItem(w.dir);
    r = audit(w.dir);
    judgementsInOrder(r, w.dir);
    hasJudgement(r, w.dir, 1, 'stale: the moment of reliance is now the sign-off S1');
    hasJudgement(r, w.dir, 2, NOT_KNOWN);
  });
});

// =====================================================================

describe('the other cases: an archived request, --at, an entry with no hint code or no --on', () => {
  test('an archived request: "recorded; not checked: the request is archived"', (t) => {
    // world() makes inv on the branch feature. It is judged and archived
    // there, and feature is merged into main, so inv is archived at the
    // base of the next branch (#107: a request that the branch itself
    // concludes is still checked).
    const dir = world(t);
    judge(dir, 'promise-kind', 'inv/SP-2', WHY);
    editRecord(dir, NAME, (rec) => { rec.status = 'concluded'; });
    move(dir, `requests/${NAME}`, `requests/archive/${NAME}`);
    commitAll(dir, 'archive inv');
    git(dir, 'checkout', '-q', 'main');
    git(dir, 'merge', '-q', '--no-ff', '-m', 'Merge the branch feature', 'feature');
    git(dir, 'checkout', '-q', '-b', 'next');
    const r = audit(dir);
    hasJudgement(r, dir, 1, 'recorded; not checked: the request is archived');
  });

  test('--at HEAD: "not known at --at: al check reads the working tree only", for a current and for a history judgement', (t) => {
    const dir = world(t);
    judge(dir, 'promise-kind', 'inv/SP-2', WHY);
    commitAll(dir, 'The judgement J1');
    editFile(dir, CS, T.SP2, T.SP2b);
    judge(dir, 'promise-kind', 'inv/SP-2', WHY2);
    commitAll(dir, 'The judgement J2');
    const r = audit(dir, ['--at', 'HEAD']);
    judgementsInOrder(r, dir);
    hasJudgement(r, dir, 1, 'not known at --at: al check reads the working tree only');
    hasJudgement(r, dir, 2, 'not known at --at: al check reads the working tree only');
  });

  test('an entry with no hint code, and an entry with no --on: "not checked: the entry has no hint code or no --on"', (t) => {
    const dir = world(t);
    editRecord(dir, NAME, (rec) => {
      rec.judgements = [
        { id: 'J1', reason: 'Written by hand.', recorded: '2026-05-04T09:30Z' },
        { id: 'J2', hint: 'promise-kind', reason: 'Written by hand, too.', recorded: '2026-05-04T09:30Z' },
      ];
    });
    const r = audit(dir);
    judgementsInOrder(r, dir);
    const starts = entryStarts(dir);
    const ls = judgementLines(r);
    const state = 'not checked: the entry has no hint code or no --on';
    assert.ok(ls[0].startsWith('Judgement J1 ') && ls[0].endsWith(` (${REC}:${starts[0]}): ${state}; reason: Written by hand.`), show(r));
    assert.ok(ls[1].startsWith('Judgement J2 promise-kind ') && ls[1].endsWith(` (${REC}:${starts[1]}): ${state}; reason: Written by hand, too.`), show(r));
  });
});

// =====================================================================

describe('the Records line, and the trace without --audit', () => {
  test('a request with no judgement: no Judgement line; the Records line names the bindings and no judgement; each Binding line is in the agreed form, with no judgement part', (t) => {
    const dir = world(t);
    const r = audit(dir);
    assert.deepEqual(judgementLines(r), [], show(r));
    const line = recordsLine(r);
    assert.ok(line.startsWith(`Records   only al's record ${REC} holds the requirement versions`), show(r));
    assert.ok(line.includes('the bindings') && line.endsWith(' below'), `the Records line names the bindings:\n${line}`);
    assert.ok(!line.includes('judgement'), `the Records line names no judgement:\n${line}`);
    allBindingsShown(r, dir);
    for (const l of bindingLines(r)) assert.ok(!l.includes(' judgement ') && !l.includes(' judged target '), show(r));
    assert.equal(recordsLine(ok(dir, ['context', NAME])), RECORDS_TODAY, 'without --audit the Records line is as before');
  });

  test('with judgements: under --audit the Records line ends "the bindings and the judgements below"; without --audit, no Judgement line and the Records line as before; exit 0 both times', (t) => {
    const dir = world(t);
    editFile(dir, SPEC, T.INV12, T.INV12b);
    judge(dir, 'stale-base', 'inv/SP-1', 'SP-1 still builds on the invoice data.');
    judge(dir, 'promise-kind', 'inv/SP-2', WHY);
    const r = audit(dir);
    const line = recordsLine(r);
    assert.ok(line.startsWith(`Records   only al's record ${REC} holds the requirement versions`), show(r));
    assert.ok(line.endsWith(', the bindings and the judgements below'), `the Records line names the bindings and the judgements:\n${line}`);
    assert.equal(judgementLines(r).length, 2, show(r));
    const plain = ok(dir, ['context', NAME]);
    assert.deepEqual(judgementLines(plain), [], show(plain));
    assert.equal(recordsLine(plain), RECORDS_TODAY, show(plain));
  });
});
