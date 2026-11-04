// #128: after `al conclude <name> --yes` moves a request to requests/archive/
// on a branch, al check reads that request as an open request at its new paths.
// A current close line still clears the hint no-paragraph-link. A judgement on
// that hint still holds when the request's own files cite the requirement.
//
// Written before the fix, from the issue and the public interface only: the al
// command, its output, its exit code and the files that it writes. Nothing here
// reads src/. No model and no network.
//
// What the spec says:
// - DES-37: "a request that the branch concludes is checked as an open request,
//   at its new paths." A request archived at the base is never checked again.
// - DES-165: "A current close line on the requirement clears the hint, as it
//   clears item 2; a stale one does not, and the hint names it." A judgement
//   goes stale "when a link or a citing file comes or goes, and not when a
//   linked paragraph or a citing line only moves."
//
// How these tests reach each state:
// - Path 2 refuses `al conclude` while a signed requirement has no link and no
//   current close line. So a stale close line on path 2 is a refusal. These tests
//   assert that refusal.
// - Path 1d has no such refusal. So a stale close line can reach the move there.
// - A close line also keeps the version of each spec paragraph that its reason
//   names. So on path 2, these tests make a current line go stale after the move:
//   the reason names INV-12, and the branch then changes INV-12. INV-12 is a data
//   paragraph, so that change gives no `not ok`.
// - `al record` refuses an archived request. So each record is made before the
//   move. A change after the move is an edit of the moved files.
//
// The decision for `al context <name>`: on a closing branch, in the working tree
// with a base, it agrees with al check about a close line. It shows the line as
// `current`, or as `stale` with the fact that changed, at the new path. It does
// not say "an archived request is not checked". For a request archived at the
// base, and with no base, it still says so, and al check gives no such hint.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DAY, appendSection, commitAll, doc, editFile, editRecord, editRequest, git, index, newRequest, ok, organized, read,
  record, recordPath, refused, req, sha, show, write,
} from './helpers/project.js';
import { NAME, R1, SPEC, T12, claim, openRequest, world } from './helpers/map-68.js';
import { check, coded, judgedLines, judge, namesNoJudgement, namesStale, none, one } from './helpers/judgement-88.js';
import { conclude as concludeRun } from './helpers/views.js';

const CODE = 'no-paragraph-link';
const ID = `${NAME}/R1`;
const OPEN = `requests/${NAME}`;
const MOVED = `requests/archive/${NAME}`;
const WHY = 'The plan paragraph is enough for this small change.';
const WHY2 = 'A second reason, after the move.';
const MET = 'A one-time migration met this requirement.';
const NAMES_INV12 = 'INV-12 already holds this requirement.';
const T12B = 'An invoice has a unique number, a customer, lines, a total and a paid date.';
const CITE = `Build for ${ID} first.`;
const NO_CITE = 'Build the link first.';
const CITED = ['SP-9 plan', CITE];
const NOT_CITED = ['SP-9 plan', NO_CITE];
const HINT_TEXT = "the hint's text changed since it";
const TEXT_24 = 'MUST live for 24 hours';
const TEXT_48 = 'MUST live for 48 hours';

// The hash of the message of the world `opened(t, [CITED])`, as release 5.0.3
// wrote it into a record: the message with the open path and the word current.
const RELEASED_MESSAGE_SHA256 = '58232fa8355469cc082a3c5c6c77ab38159643febfbae98138ddb6ac8b2edc56';

// --- the expected text of the hint

const HEAD = (id) =>
  `${id} has no declared paragraph link: no paragraph of specs/ and no promise or design paragraph of an open change spec serves it, and no accepted ADR decides it.`;
const CLEAR = (name, n) =>
  `Link it, record where it is met (al record ${name} close --on ${n} --reason <why>), or judge it (al record ${name} judgement --hint ${CODE} --on ${name}/${n} --reason <why>)`;
const NONE_KNOWN = (id, name, n) => `${HEAD(id)} Known direct links: none known. ${CLEAR(name, n)}`;
const KNOWN_CITED = (id, name, n, cites) =>
  `${HEAD(id)} Known direct links, each with the limit of its evidence: cited in ${cites.join(', ')}, and a citation is not evidence that the code or the test does what the requirement says. ${CLEAR(name, n)}`;
const SHARE_MESSAGE = (cites) => KNOWN_CITED(ID, NAME, 'R1', cites);

// The line of a close line in `al context share`. R1 is at line 14 of request.md.
const CLOSE_LINE = (state, why) => `close C1 ${ID} (${MOVED}/request.md:14) ${state}: ${why}`;
const NOT_CHECKED = (why) => CLOSE_LINE("recorded at the close; an archived request is not checked against today's spec", why);
const STALE_CLOSE = (fact, why) => CLOSE_LINE(`stale: ${fact} changed since it was recorded; it clears nothing until you record it again`, why);

// --- the worlds

const save = (dir, { name = NAME, tier = '1d', message = 'work' } = {}) => {
  index(dir);
  commitAll(dir, `${message}\n\nTier: ${tier} — ${name}`);
};

// A world is built once for this process, and each test gets its own copy. So
// no test shares state with another, and the file runs in less time.
const BUILT = new Map();
const KEPT = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-world-'));
process.on('exit', () => rmSync(KEPT, { recursive: true, force: true }));
function copyOf(t, key, build) {
  if (!BUILT.has(key)) {
    const made = [];
    try {
      const built = build({ after: (f) => made.push(f) });
      const keep = join(KEPT, String(BUILT.size));
      cpSync(built, keep, { recursive: true });
      BUILT.set(key, keep);
    } finally {
      for (const f of made) f();
    }
  }
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(BUILT.get(key), dir, { recursive: true });
  return dir;
}

// main, then the branch feature with no request. A world with `onMain` is not kept.
const empty = (t, onMain) => (onMain ? world(t, null, { link: false, onMain }) : copyOf(t, 'empty', (b) => world(b, null, { link: false })));

// share with R1 signed, made on the branch feature and committed.
function opened(t, paras = [NOT_CITED], { tier = '1d', onMain } = {}) {
  const build = (b) => {
    const dir = onMain ? world(b, null, { link: false, onMain }) : empty(b);
    openRequest(dir, NAME, paras, { tier });
    commitAll(dir, claim(NAME, tier));
    return dir;
  };
  return onMain ? build(t) : copyOf(t, JSON.stringify([paras, tier]), build);
}
const pathTwo = (t) => opened(t, [NOT_CITED], { tier: '2' });

// pathTwo, with a close line on R1. Committed.
const closedTwo = (t, why = MET) => copyOf(t, `closed ${why}`, (b) => {
  const dir = pathTwo(b);
  ok(dir, ['record', NAME, 'close', '--on', 'R1', '--reason', why, '--yes']);
  save(dir, { tier: '2' });
  return dir;
});

// share on path 1d, whose own spec cites R1, with a judgement on its hint.
// Committed. Then the same world, after the commit of the move.
const judged = (t) => copyOf(t, 'judged', (b) => {
  const dir = opened(b, [CITED]);
  judge(dir, CODE, ID, WHY, { name: NAME });
  save(dir);
  return dir;
});
const judgedMoved = (t) => copyOf(t, 'judged and moved', (b) => {
  const dir = judged(b);
  ok(dir, ['conclude', NAME, '--yes']);
  save(dir);
  return dir;
});

// As `judged`, and specs/x.md cites R1 too. Then the same world, after the move.
const judgedWithX = (t) => copyOf(t, 'judged with x', (b) => {
  const dir = opened(b, [CITED]);
  citeIn(dir, 'specs/x.md');
  judge(dir, CODE, ID, WHY, { name: NAME });
  save(dir);
  return dir;
});
const judgedWithXMoved = (t) => copyOf(t, 'judged with x and moved', (b) => {
  const dir = judgedWithX(b);
  ok(dir, ['conclude', NAME, '--yes']);
  save(dir);
  return dir;
});

// closedTwo, after the commit of the move.
const closedTwoMoved = (t) => copyOf(t, 'closed and moved', (b) => {
  const dir = closedTwo(b);
  ok(dir, ['conclude', NAME, '--yes']);
  save(dir, { tier: '2' });
  return dir;
});

// share on path 1d, whose own spec cites R1, after the commit of the move. Then
// the same world, archived at the base of the branch next.
const citedMoved = (t) => copyOf(t, 'cited and moved', (b) => {
  const dir = opened(b, [CITED]);
  ok(dir, ['conclude', NAME, '--yes']);
  save(dir);
  return dir;
});
const citedAtBase = (t) => copyOf(t, 'cited at the base', (b) => {
  const dir = citedMoved(b);
  mergeAndBranch(dir);
  return dir;
});

// share, whose own spec cites R1, and the open request other. Then the same
// world, where other and specs/x.md cite R1 too.
const citedWithOther = (t) => copyOf(t, 'cited with other', (b) => {
  const dir = opened(b, [CITED]);
  another(dir);
  return dir;
});
const threeCite = (t) => copyOf(t, 'three cite', (b) => {
  const dir = opened(b, [CITED]);
  another(dir, 'other', [['OT-9 plan', CITE]]);
  citeIn(dir, 'specs/x.md');
  save(dir);
  return dir;
});

// An open request beside share, with R1 signed.
function another(dir, name = 'other', paras = [['OT-9 plan', NO_CITE]], tier = '1d') {
  openRequest(dir, name, paras, { tier });
  commitAll(dir, claim(name, tier));
}

// On main, as a world's `onMain`: a request that is made and concluded. The
// world commits it.
function concluded(dir, name, text) {
  openRequest(dir, name, [['SP-9 plan', text]], { tier: '1d' });
  ok(dir, ['conclude', name, '--yes']);
  index(dir);
}

// A file that holds a citation of an ID on one line.
const citeIn = (dir, file, id = ID) => write(dir, file, `A note on ${id}.\n`);
const addParagraph = (dir, file, para) => write(dir, file, `${read(dir, file)}\n${doc([para])}`);

// --- the commands

const judgeIt = (dir, { name = NAME, on = ID, why = WHY } = {}) => judge(dir, CODE, on, why, { name });
const closeIt = (dir, { name = NAME, on = 'R1', why = MET } = {}) =>
  ok(dir, ['record', name, 'close', '--on', on, '--reason', why, '--yes']);

function concludeHere(dir, { name = NAME, tier = '1d' } = {}) {
  const r = ok(dir, ['conclude', name, '--yes']);
  assert.ok(r.stdout.includes(`Concluded ${name}: `), show(r));
  index(dir);
  commitAll(dir, claim(name, tier));
}

// Runs `assertIt` at each stage of the move: before it, then after al conclude,
// after al index, and after the commit.
function acrossTheMove(dir, assertIt, { name = NAME, tier = '1d' } = {}) {
  assertIt('before the move');
  const r = ok(dir, ['conclude', name, '--yes']);
  assert.ok(r.stdout.includes(`Concluded ${name}: `), show(r));
  assertIt('after the move, before al index');
  index(dir);
  assertIt('after the move and al index, before the commit');
  commitAll(dir, claim(name, tier));
  assertIt('after the commit of the move');
}

// A shorter form, for the cases that the tests above cover at each stage.
function beforeAndAfter(dir, assertIt, opts) {
  assertIt('before the move');
  concludeHere(dir, opts);
  assertIt('after the move');
}

// The branch feature goes into main, and a new branch starts. So what the
// branch concluded is archived at the base.
function mergeAndBranch(dir) {
  git(dir, 'checkout', '-q', 'main');
  git(dir, 'merge', '-q', '--no-ff', '-m', 'Merge the branch feature', 'feature');
  git(dir, 'checkout', '-q', '-b', 'next');
}

// --- reading the output

const hintOn = (r, id = ID) => coded(r, CODE, id);
// One `info judged` line holds every current judgement, joined by "; ".
const judgedHas = (r, text) => judgedLines(r).some((j) => j.msg.split('; ').includes(text));
const judgedText = ({ holder = NAME, n = 1, on = ID, why = WHY } = {}) => `${holder}/J${n} ${CODE} ${on}: ${why}`;

// Exit 0 in plain mode.
function plain(dir) {
  const r = check(dir);
  assert.equal(r.code, 0, show(r));
  return r;
}

// Exit 0 in plain mode and under --strict. A hint never fails --strict.
function bothModes(dir) {
  const r = check(dir);
  assert.equal(r.code, 0, show(r));
  const s = check(dir, '--strict');
  assert.equal(s.code, 0, `--strict exits 0 with no not ok:\n${show(s)}`);
  return r;
}

// No hint on `id`. No line calls a close line stale.
function assertClear(dir, when, { id = ID } = {}) {
  const r = plain(dir);
  none(hintOn(r, id), r, `${CODE} on ${id} ${when}`);
  assert.doesNotMatch(r.stdout, /close line C\d+ is stale/, `no close line reads as stale ${when}:\n${show(r)}`);
  return r;
}

// The judgement is current: no hint, and an info judged line names it.
function assertHolds(dir, when, { id = ID, holder = NAME, n = 1, why = WHY } = {}) {
  const r = plain(dir);
  none(hintOn(r, id), r, `${CODE} on ${id} ${when}`);
  const text = judgedText({ holder, n, on: id, why });
  assert.ok(judgedHas(r, text), `an info judged line "${text}" ${when}:\n${show(r)}`);
  return r;
}

// The hint is back, and it names the judgement as stale.
function assertStale(dir, when, { id = ID, holder = NAME, n = 1, text = true } = {}) {
  const r = check(dir);
  const f = one(hintOn(r, id), r, `${CODE} on ${id} ${when}`);
  namesStale(f, r, n, holder);
  if (text) assert.ok(f.msg.includes(`; the judgement ${holder}/J${n} (${DAY}) is stale: ${HINT_TEXT}`), `the hint's text changed ${when}:\n${f.line}`);
  assert.ok(!judgedHas(r, judgedText({ holder, n, on: id })), `no info judged line names it ${when}:\n${show(r)}`);
  return f;
}

// The hint is back, and it names the stale close line.
function assertStaleClose(dir, when, { id = ID, n = 1 } = {}) {
  const r = check(dir);
  const f = one(hintOn(r, id), r, `${CODE} on ${id} ${when}`);
  assert.ok(f.msg.includes(`; close line C${n} is stale`), `the hint names C${n} ${when}:\n${f.line}\n${show(r)}`);
  return f;
}

// The citing files, as the message shows them: "<word> <path>".
function citedIn(f) {
  const m = /cited in (.+?), and a citation is not evidence/.exec(f.msg);
  assert.ok(m, `the message names citing files:\n${f.line}`);
  return m[1].split(', ');
}

// The line of a judgement in `al context <holder> --audit`.
function assertAudit(dir, { holder = NAME, n = 1, on = ID, state, why = WHY }) {
  const r = ok(dir, ['context', holder, '--audit']);
  const found = r.stdout.split('\n').filter((l) => l.startsWith(`Judgement J${n} `));
  assert.equal(found.length, 1, `one Judgement line for J${n}:\n${show(r)}`);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  assert.match(found[0], new RegExp(`^Judgement J${n} ${CODE} ${esc(on)} recorded \\S+ \\([^)]+\\): ${state}; reason: ${esc(why)}$`), show(r));
}

const closeEntries = (dir, name = NAME) => record(dir, name).closes ?? [];
const judgementEntries = (dir, name = NAME) => record(dir, name).judgements ?? [];

// =====================================================================
// 1. A current close line clears the hint before and after the move.

describe('#128 a current close line clears the hint before and after the move', () => {
  test('path 2: the hint, then a close line, then each stage of the move: no hint, and no line calls C1 stale', (t) => {
    const dir = pathTwo(t);
    const r = check(dir);
    one(hintOn(r), r, 'the hint before the close line');
    closeIt(dir);
    save(dir, { tier: '2' });
    acrossTheMove(dir, (when) => assertClear(dir, when), { tier: '2' });
    bothModes(dir);
  });

  test('path 2: the Hints section of al context shows no such hint after the move, as al check gives none', (t) => {
    const dir = closedTwoMoved(t);
    const r = ok(dir, ['context', NAME]);
    assert.ok(r.stdout.split('\n').includes('Hints     none'), `Hints none:\n${show(r)}`);
    assert.doesNotMatch(r.stdout, new RegExp(`hint ${CODE}`), show(r));
  });

  test('path 2: a request that is open at the base and concluded on the branch: the close line clears the hint after the move', (t) => {
    const dir = empty(t, (d) => {
      openRequest(d, NAME, [NOT_CITED], { tier: '2' });
      closeIt(d);
    });
    assertClear(dir, 'before the move');
    concludeHere(dir, { tier: '2' });
    assertClear(dir, 'after the move');
  });

  test('path 1d: a close line clears the hint across the move when the own spec cites the requirement', (t) => {
    const dir = opened(t, [CITED]);
    closeIt(dir);
    save(dir);
    beforeAndAfter(dir, (when) => assertClear(dir, when));
  });

  test('the issue: a judgement, then a close line, then the move: no hint, and nothing reads as stale', (t) => {
    const dir = pathTwo(t);
    judgeIt(dir);
    closeIt(dir);
    save(dir, { tier: '2' });
    acrossTheMove(dir, (when) => {
      const r = assertClear(dir, when);
      assert.doesNotMatch(r.stdout, new RegExp(`the judgement ${NAME}/J1 \\(${DAY}\\) is stale`), `J1 does not read as stale ${when}:\n${show(r)}`);
    }, { tier: '2' });
  });

  test('path 1d: a close line on R1 clears only R1: after the move R2 keeps its hint, with no close line in it', (t) => {
    const dir = empty(t);
    const R2 = req('R2', 'Reminders', 'A reminder email MUST go out 7 days after the due date.');
    newRequest(dir, NAME, 'The owner wants share.\n', ['--tier', '1d']);
    appendSection(dir, NAME, organized([R1, R2]));
    ok(dir, ['record', NAME, 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
    write(dir, `${OPEN}/spec.md`, doc([NOT_CITED]));
    closeIt(dir);
    save(dir);
    concludeHere(dir);
    const r = assertClear(dir, 'after the move');
    const f = one(hintOn(r, `${NAME}/R2`), r, 'the hint on R2 after the move');
    assert.equal(f.msg, NONE_KNOWN(`${NAME}/R2`, NAME, 'R2'), f.line);
  });

  test('a close line of the moved request does not clear R1 of another open request, which has the same ID', (t) => {
    const dir = pathTwo(t);
    another(dir, 'other', [['OT-9 plan', NO_CITE]], '2');
    closeIt(dir);
    save(dir, { tier: '2' });
    concludeHere(dir, { tier: '2' });
    assertClear(dir, 'after the move');
    const r = check(dir);
    const f = one(hintOn(r, 'other/R1'), r, 'the hint on other/R1');
    assert.equal(f.file, 'requests/other/request.md', f.line);
  });
});

// =====================================================================
// 2. A close line that goes stale on the closing branch clears nothing.

describe('#128 a close line that goes stale on the closing branch clears nothing, and the hint names it', () => {
  // Path 1d allows the move with a stale line, so the requirement can change first.
  const staleByRequirement = (t) => copyOf(t, 'stale by R1', (b) => {
    const dir = opened(b);
    closeIt(dir);
    save(dir);
    assertClear(dir, 'while the close line is current');
    editRequest(dir, NAME, TEXT_24, TEXT_48);
    index(dir);
    ok(dir, ['record', NAME, 'signoff', '--source', 'owner', '--words', 'Yes, the new text', '--yes']);
    save(dir);
    return dir;
  });

  test('path 1d: R1 gets a new version, signed: C1 is stale before the move, al conclude shows it and closes, and C1 is stale after the move', (t) => {
    const dir = staleByRequirement(t);
    assertStaleClose(dir, 'before the move');
    const r = ok(dir, ['conclude', NAME, '--yes']);
    assert.match(r.stdout, /^close C1 share\/R1 stale: R1 changed since it was recorded; it clears nothing until you record it again: /m, show(r));
    index(dir);
    assertStaleClose(dir, 'after the move, before the commit');
    commitAll(dir, claim(NAME, '1d'));
    const f = assertStaleClose(dir, 'after the commit of the move');
    assert.equal(f.file, `${MOVED}/request.md`, f.line);
    assert.equal(f.msg, `${NONE_KNOWN(ID, NAME, 'R1')}; close line C1 is stale`, f.line);
  });

  test('path 1d: R1 changes and changes back, signed each time: C1 stays stale, before and after the move', (t) => {
    const dir = staleByRequirement(t);
    editRequest(dir, NAME, TEXT_48, TEXT_24);
    index(dir);
    ok(dir, ['record', NAME, 'signoff', '--source', 'owner', '--words', 'Yes, the first text', '--yes']);
    save(dir);
    assertStaleClose(dir, 'before the move');
    concludeHere(dir);
    assertStaleClose(dir, 'after the move');
  });

  test('path 2: R1 gets a new version, signed: al conclude refuses, in the preview and with --yes, exit 1, and it writes nothing', (t) => {
    const dir = closedTwo(t);
    editRequest(dir, NAME, TEXT_24, TEXT_48);
    index(dir);
    ok(dir, ['record', NAME, 'signoff', '--source', 'owner', '--words', 'Yes, the new text', '--yes']);
    save(dir, { tier: '2' });
    assertStaleClose(dir, 'before the move');
    for (const args of [[NAME], [NAME, '--yes']]) {
      const r = concludeRun(dir, ...args);
      assert.equal(r.code, 1, show(r));
      assert.equal(r.wrote, false, show(r));
      assert.ok(r.refused.some((l) => l.includes(ID) && l.includes('no declared paragraph link') && l.includes('close line C1 is stale')), show(r));
    }
  });

  test('path 2: a paragraph that the reason names changes before the move: al conclude refuses, exit 1, and the hint names C1', (t) => {
    const dir = closedTwo(t, NAMES_INV12);
    assertClear(dir, 'while the close line is current');
    editFile(dir, SPEC, T12, T12B);
    save(dir, { tier: '2' });
    assertStaleClose(dir, 'before the move');
    const r = concludeRun(dir, NAME, '--yes');
    assert.equal(r.code, 1, show(r));
    assert.equal(r.wrote, false, show(r));
    assert.ok(r.refused.some((l) => l.includes(ID) && l.includes('close line C1 is stale')), show(r));
  });

  test('path 2: a paragraph that the reason names changes after the move: C1 clears until then, and after it the hint names C1', (t) => {
    const dir = closedTwo(t, NAMES_INV12);
    concludeHere(dir, { tier: '2' });
    assertClear(dir, 'after the move, while INV-12 is the same');
    editFile(dir, SPEC, T12, T12B);
    assertStaleClose(dir, 'after INV-12 changes, before al index');
    index(dir);
    const f = assertStaleClose(dir, 'after INV-12 changes and al index');
    assert.equal(f.file, `${MOVED}/request.md`, f.line);
    commitAll(dir, claim(NAME, '2'));
    assertStaleClose(dir, 'after the commit');
    assert.equal(check(dir, '--strict').code, 0, 'a stale close line is a hint, and --strict stays at 0');
  });

  test('the latest line counts after the move: C1 names INV-12 and C2 does not, so a change of INV-12 clears no line', (t) => {
    const dir = pathTwo(t);
    closeIt(dir, { why: NAMES_INV12 });
    closeIt(dir, { why: MET });
    save(dir, { tier: '2' });
    concludeHere(dir, { tier: '2' });
    assertClear(dir, 'after the move');
    editFile(dir, SPEC, T12, T12B);
    save(dir, { tier: '2' });
    assertClear(dir, 'after INV-12 changes');
  });

  test('the latest line counts after the move: C2 names INV-12, so a change of INV-12 makes C2 stale, and the hint names C2', (t) => {
    const dir = pathTwo(t);
    closeIt(dir, { why: MET });
    closeIt(dir, { why: NAMES_INV12 });
    save(dir, { tier: '2' });
    concludeHere(dir, { tier: '2' });
    assertClear(dir, 'after the move');
    editFile(dir, SPEC, T12, T12B);
    save(dir, { tier: '2' });
    const f = assertStaleClose(dir, 'after INV-12 changes', { n: 2 });
    assert.ok(!f.msg.includes('close line C1 is stale'), f.line);
  });

  test('the moved request.md changes R1: R1 is not signed, so a not ok and no hint. al index adds no version, and --strict exits 1', (t) => {
    const dir = closedTwoMoved(t);
    const versions = record(dir, NAME).requirements;
    editFile(dir, `${MOVED}/request.md`, TEXT_24, TEXT_48);
    index(dir);
    assert.deepEqual(record(dir, NAME).requirements, versions, 'al index adds no version to an archived record');
    const r = check(dir);
    assert.equal(r.code, 0, show(r));
    assert.ok(r.findings.some((f) => f.severity === 'not ok' && f.code === 'unsigned-requirement' && f.id === ID), show(r));
    none(hintOn(r), r, 'the hint on an unsigned requirement');
    assert.equal(check(dir, '--strict').code, 1, '--strict exits 1 on a not ok');
  });

  test('a judgement that is recorded on the hint of a stale close line holds across the move, when the own spec cites the requirement', (t) => {
    const dir = opened(t, [CITED]);
    closeIt(dir);
    save(dir);
    editRequest(dir, NAME, TEXT_24, TEXT_48);
    index(dir);
    ok(dir, ['record', NAME, 'signoff', '--source', 'owner', '--words', 'Yes, the new text', '--yes']);
    save(dir);
    assertStaleClose(dir, 'before the judgement');
    judgeIt(dir);
    save(dir);
    beforeAndAfter(dir, (when) => assertHolds(dir, when));
  });

  test('a judgement, then a close line that goes stale: the message gains the close line, so the judgement is stale, before and after the move', (t) => {
    const dir = opened(t, [CITED]);
    judgeIt(dir);
    closeIt(dir, { why: NAMES_INV12 });
    save(dir);
    editFile(dir, SPEC, T12, T12B);
    save(dir);
    for (const when of ['before the move', 'after the move']) {
      const f = assertStale(dir, when);
      assert.ok(f.msg.includes('; close line C1 is stale'), `it names C1 ${when}:\n${f.line}`);
      if (when === 'before the move') concludeHere(dir);
    }
  });
});

// =====================================================================
// al context on a closing branch agrees with al check about a close line.

describe('#128 al context on a closing branch agrees with al check about a close line', () => {
  const NOT_CHECKED_WORDS = 'an archived request is not checked';

  // The state is the working tree with a base: al check says so.
  function assertWithBase(dir) {
    const r = check(dir);
    assert.match(r.stdout, /^Read {6}working tree · base [0-9a-f]+ /m, show(r));
  }
  function assertContext(dir, line, when) {
    const r = ok(dir, ['context', NAME]);
    assert.ok(r.stdout.split('\n').includes(line), `the line "${line}" ${when}:\n${show(r)}`);
    assert.ok(!r.stdout.includes(NOT_CHECKED_WORDS), `no "${NOT_CHECKED_WORDS}" ${when}:\n${show(r)}`);
    assert.match(r.stdout, /^Read {6}working tree/m, show(r));
    return r;
  }

  test('a current close line shows as current at its new path, and al context does not say that the request is not checked, before and after the commit of the move', (t) => {
    const dir = closedTwo(t);
    ok(dir, ['conclude', NAME, '--yes']);
    index(dir);
    assertWithBase(dir);
    assertContext(dir, CLOSE_LINE('current', MET), 'before the commit of the move');
    commitAll(dir, claim(NAME, '2'));
    assertWithBase(dir);
    assertContext(dir, CLOSE_LINE('current', MET), 'after the commit of the move');
  });

  test('a stale close line shows as stale, with the fact that changed: a paragraph that its reason names, or the requirement', (t) => {
    const named = closedTwo(t, NAMES_INV12);
    concludeHere(named, { tier: '2' });
    editFile(named, SPEC, T12, T12B);
    save(named, { tier: '2' });
    assertWithBase(named);
    const r = assertContext(named, STALE_CLOSE('INV-12', NAMES_INV12), 'after INV-12 changes');
    assert.ok(r.stdout.includes('; close line C1 is stale'), `the Hints section names C1:\n${show(r)}`);

    const dir = opened(t);
    closeIt(dir);
    save(dir);
    editRequest(dir, NAME, TEXT_24, TEXT_48);
    index(dir);
    ok(dir, ['record', NAME, 'signoff', '--source', 'owner', '--words', 'Yes, the new text', '--yes']);
    save(dir);
    concludeHere(dir);
    assertWithBase(dir);
    assertContext(dir, STALE_CLOSE('R1', MET), 'after R1 gets a new version');
  });
});

// =====================================================================
// 3. A judgement holds across the move when the own files cite the requirement.

describe('#128 a judgement on the hint holds across the move when the own files cite the requirement', () => {
  test('the issue, path 1d: a plan paragraph cites share/R1: the judgement holds at each stage of the move, and the audit says current', (t) => {
    const dir = opened(t, [CITED]);
    const r = check(dir);
    const f = one(hintOn(r), r, 'the hint before the judgement');
    assert.deepEqual(citedIn(f), [`current ${OPEN}/spec.md`], f.line);
    judgeIt(dir);
    save(dir);
    acrossTheMove(dir, (when) => assertHolds(dir, when));
    bothModes(dir);
    assertAudit(dir, { state: 'current' });
  });

  test('a request that is open at the base and concluded on the branch: the judgement holds after the move', (t) => {
    const dir = empty(t, (d) => {
      openRequest(d, NAME, [CITED], { tier: '1d' });
      judgeIt(d);
    });
    assertHolds(dir, 'before the move');
    concludeHere(dir);
    assertHolds(dir, 'after the move');
    assertAudit(dir, { state: 'current' });
  });

  test('every own file that cites it moves: spec.md, review.md, a file in a folder, and a section of request.md: the judgement holds', (t) => {
    const dir = opened(t, [CITED]);
    citeIn(dir, `${OPEN}/review.md`);
    citeIn(dir, `${OPEN}/notes/more.md`);
    write(dir, `${OPEN}/request.md`, `${read(dir, `${OPEN}/request.md`)}\n## Notes\n\nSee ${ID}.\n`);
    const r = check(dir);
    const f = one(hintOn(r), r, 'the hint before the judgement');
    assert.deepEqual(citedIn(f), [`current ${OPEN}/notes/more.md`, `current ${OPEN}/request.md`, `current ${OPEN}/review.md`, `current ${OPEN}/spec.md`], f.line);
    judgeIt(dir);
    save(dir);
    beforeAndAfter(dir, (when) => assertHolds(dir, when));
  });

  test('guard: no citation: the judgement holds across the move', (t) => {
    const dir = opened(t);
    judgeIt(dir);
    save(dir);
    beforeAndAfter(dir, (when) => assertHolds(dir, when));
    assertAudit(dir, { state: 'current' });
  });

  test('a citing line only moves after the move: the judgement holds', (t) => {
    const dir = judgedMoved(t);
    assertHolds(dir, 'after the move');
    addParagraph(dir, `${MOVED}/spec.md`, ['SP-1 plan', NO_CITE]);
    write(dir, `${MOVED}/spec.md`, `${doc([['SP-2 plan', NO_CITE]])}\n${read(dir, `${MOVED}/spec.md`)}`);
    save(dir);
    assertHolds(dir, 'after the citing line moves');
  });

  test('guard: a plan paragraph serves R1 and no file cites it: the judgement holds across the move', (t) => {
    const dir = opened(t, [['SP-8 plan serves:R1', NO_CITE]]);
    judgeIt(dir);
    save(dir);
    beforeAndAfter(dir, (when) => assertHolds(dir, when));
  });

  test('an approach paragraph serves R1 and the own spec cites it: the judgement holds across the move', (t) => {
    const dir = opened(t, [['SP-8 approach serves:R1', NO_CITE], CITED]);
    judgeIt(dir);
    save(dir);
    beforeAndAfter(dir, (when) => assertHolds(dir, when));
  });

  test('a judgement that another open request holds on share/R1 holds across the move of share', (t) => {
    const dir = citedWithOther(t);
    judgeIt(dir, { name: 'other' });
    save(dir, { name: 'other' });
    beforeAndAfter(dir, (when) => assertHolds(dir, when, { holder: 'other' }));
    assertAudit(dir, { holder: 'other', state: 'current' });
  });

  test('guard: another open request records a judgement on share/R1 after the move: it clears the hint at the text that the hint line shows', (t) => {
    const dir = citedWithOther(t);
    concludeHere(dir);
    const r = check(dir);
    one(hintOn(r), r, 'the hint after the move');
    judgeIt(dir, { name: 'other', why: WHY2 });
    save(dir, { name: 'other' });
    assertHolds(dir, 'after the judgement', { holder: 'other', why: WHY2 });
  });
});

// =====================================================================
// 4. A citation or a link that comes or goes makes the judgement stale.

describe('#128 a citation or a link that comes or goes on the closing branch makes the judgement stale', () => {
  const placesThatCome = [
    ['in an own file', `${OPEN}/review.md`, `${MOVED}/review.md`, 'historical'],
    ['in specs/', 'specs/x.md', 'specs/x.md', 'current'],
    ['in a file under requests/', 'requests/b-note.md', 'requests/b-note.md', 'current'],
  ];

  for (const [label, file, shown, word] of placesThatCome) {
    test(`guard: a citation comes before the move, ${label}: the judgement is stale before the move and after it`, (t) => {
      const dir = opened(t, [CITED]);
      judgeIt(dir);
      save(dir);
      assertHolds(dir, 'before the citation');
      citeIn(dir, file);
      save(dir);
      assertStale(dir, 'before the move');
      concludeHere(dir);
      const f = assertStale(dir, 'after the move');
      assert.ok(citedIn(f).includes(`${word} ${shown}`), f.line);
    });
  }

  const placesThatComeAfter = [
    ['in a moved file', `${MOVED}/review.md`, 'historical'],
    ['in specs/', 'specs/x.md', 'current'],
    ['in a file under requests/', 'requests/b-note.md', 'current'],
    ['in a file at the old path of the request', `${OPEN}/late.md`, 'current'],
  ];

  for (const [label, file, word] of placesThatComeAfter) {
    test(`a citation comes after the move, ${label}: the judgement holds until then, and it is stale after it`, (t) => {
      const dir = opened(t, [CITED]);
      judgeIt(dir);
      save(dir);
      concludeHere(dir);
      assertHolds(dir, 'after the move');
      citeIn(dir, file);
      const f = assertStale(dir, 'after the citation, before al index');
      assert.ok(citedIn(f).includes(`${word} ${file}`), f.line);
      save(dir);
      assertStale(dir, 'after the citation and the commit');
    });
  }

  // The new file has the open spelling of the moved file. A reading that maps
  // the moved path back to its open path must not take the two files as one.
  test('a citation comes after the move, in a new file at the old path of an own file that also cites it: the judgement is stale, and the message names both files', (t) => {
    const dir = judgedMoved(t);
    assertHolds(dir, 'after the move');
    write(dir, `${OPEN}/spec.md`, doc([CITED]));
    const both = [`current ${OPEN}/spec.md`, `historical ${MOVED}/spec.md`];
    assert.deepEqual(citedIn(assertStale(dir, 'after the new file, before al index')), both);
    save(dir);
    const f = assertStale(dir, 'after the new file and the commit');
    assert.deepEqual(citedIn(f), both, f.line);
    assert.ok(f.msg.endsWith(` · cited lines: ${OPEN}/spec.md 3; ${MOVED}/spec.md 3`), f.line);
  });

  test('guard: a citation goes before the move: the judgement is stale before the move and after it', (t) => {
    const dir = judgedWithX(t);
    write(dir, `${OPEN}/spec.md`, doc([NOT_CITED]));
    save(dir);
    assertStale(dir, 'before the move');
    concludeHere(dir);
    assertStale(dir, 'after the move');
  });

  test('a citing line goes from the moved spec after the move: the judgement is stale', (t) => {
    const dir = judgedWithXMoved(t);
    assertHolds(dir, 'after the move');
    write(dir, `${MOVED}/spec.md`, doc([NOT_CITED]));
    save(dir);
    const f = assertStale(dir, 'after the citation goes');
    assert.deepEqual(citedIn(f), ['current specs/x.md'], f.line);
  });

  test('the only citation goes after the move, so no link is known: the judgement is stale', (t) => {
    const dir = judgedMoved(t);
    assertHolds(dir, 'after the move');
    write(dir, `${MOVED}/spec.md`, doc([NOT_CITED]));
    save(dir);
    const f = assertStale(dir, 'after the citation goes');
    assert.ok(f.msg.startsWith(NONE_KNOWN(ID, NAME, 'R1')), f.line);
  });

  test('a moved file that cites it is deleted after the move: the judgement is stale', (t) => {
    const dir = opened(t, [CITED]);
    citeIn(dir, `${OPEN}/review.md`);
    judgeIt(dir);
    save(dir);
    concludeHere(dir);
    assertHolds(dir, 'after the move');
    rmSync(join(dir, `${MOVED}/review.md`));
    save(dir);
    const f = assertStale(dir, 'after the file goes');
    assert.deepEqual(citedIn(f), [`historical ${MOVED}/spec.md`], f.line);
  });

  test('a citing file outside the request is deleted after the move: the judgement is stale', (t) => {
    const dir = judgedWithXMoved(t);
    assertHolds(dir, 'after the move');
    rmSync(join(dir, 'specs/x.md'));
    save(dir);
    const f = assertStale(dir, 'after the file goes');
    assert.deepEqual(citedIn(f), [`historical ${MOVED}/spec.md`], f.line);
  });

  test('after the move, one moved file stops the citation and another starts it: the count is the same, and the judgement is stale', (t) => {
    const dir = judgedMoved(t);
    assertHolds(dir, 'after the move');
    write(dir, `${MOVED}/spec.md`, doc([NOT_CITED]));
    citeIn(dir, `${MOVED}/review.md`);
    save(dir);
    const f = assertStale(dir, 'after the swap');
    assert.deepEqual(citedIn(f), [`historical ${MOVED}/review.md`], f.line);
  });

  test('a link comes after the move: a plan paragraph of the moved spec serves R1: the judgement is stale', (t) => {
    const dir = judgedMoved(t);
    assertHolds(dir, 'after the move');
    addParagraph(dir, `${MOVED}/spec.md`, ['SP-8 plan serves:R1', NO_CITE]);
    save(dir);
    assertStale(dir, 'after the link comes');
  });

  test('a link goes after the move: the plan paragraph of the moved spec stops to serve R1: the judgement is stale', (t) => {
    const dir = opened(t, [CITED, ['SP-8 plan serves:R1', NO_CITE]]);
    judgeIt(dir);
    save(dir);
    concludeHere(dir);
    assertHolds(dir, 'after the move');
    editFile(dir, `${MOVED}/spec.md`, 'SP-8 plan serves:R1', 'SP-8 plan');
    save(dir);
    assertStale(dir, 'after the link goes');
  });
});

// =====================================================================
// 5. A judgement on the open request holds with no new record.

describe('#128 a judgement recorded on the open request holds after the move, with no new record', () => {
  test('the judgement entry is the same before and after the move, its hash is of the open message, and al check clears the hint', (t) => {
    const dir = opened(t, [CITED]);
    const r = check(dir);
    const f = one(hintOn(r), r, 'the hint before the judgement');
    const message = SHARE_MESSAGE([`current ${OPEN}/spec.md`]);
    judgeIt(dir);
    save(dir);
    const before = judgementEntries(dir);
    assert.deepEqual(before[0].message_sha256, [sha(message)], f.line);
    acrossTheMove(dir, (when) => {
      assertHolds(dir, when);
      assert.deepEqual(judgementEntries(dir), before, `the record of J1 stays as it was ${when}`);
    });
  });

  test('the record of a close line and of a judgement stays as it was after the move and al index', (t) => {
    const dir = opened(t, [CITED]);
    judgeIt(dir);
    closeIt(dir, { why: NAMES_INV12 });
    save(dir);
    const closes = closeEntries(dir);
    const judgements = judgementEntries(dir);
    concludeHere(dir);
    assertClear(dir, 'after the move');
    assert.deepEqual(closeEntries(dir), closes, 'the record of C1 stays as it was');
    assert.deepEqual(judgementEntries(dir), judgements, 'the record of J1 stays as it was');
  });

  test('a judgement with the hash that release 5.0.3 wrote holds before and after the move', (t) => {
    const dir = opened(t, [CITED]);
    judgeIt(dir);
    editRecord(dir, NAME, (rec) => {
      rec.judgements.find((j) => j.id === 'J1').message_sha256 = [RELEASED_MESSAGE_SHA256];
    });
    save(dir);
    assertHolds(dir, 'before the move');
    concludeHere(dir);
    assertHolds(dir, 'after the move');
    assert.deepEqual(judgementEntries(dir)[0].message_sha256, [RELEASED_MESSAGE_SHA256], 'the hash is not rewritten');
  });
});

// =====================================================================
// 6. A request archived at the base stays unchecked.

describe('#128 a request archived at the base stays unchecked', () => {
  // share, on path 1d, with a citation, no close line and no judgement. It is
  // concluded on feature, and it is archived at the base of next.
  function archivedAtBase(t, { paras = [CITED], tier = '1d', closeWhy } = {}) {
    return copyOf(t, `archived ${JSON.stringify([paras, tier, closeWhy])}`, (b) => {
      const dir = opened(b, paras, { tier });
      if (closeWhy) {
        closeIt(dir, { why: closeWhy });
        save(dir, { tier });
      }
      concludeHere(dir, { tier });
      mergeAndBranch(dir);
      return dir;
    });
  }

  const archivedWithOther = (t) => copyOf(t, 'archived with other', (b) => {
    const dir = archivedAtBase(b, { paras: [NOT_CITED] });
    another(dir);
    return dir;
  });

  test('guard: no hint and no judged line for a request archived at the base, with a citation in its own spec, also after a commit on the new branch', (t) => {
    const dir = archivedAtBase(t);
    for (const when of ['on the new branch', 'after a commit on it']) {
      const r = bothModes(dir);
      none(hintOn(r), r, `${CODE} on ${ID} ${when}`);
      assert.deepEqual(judgedLines(r).map((f) => f.line), [], show(r));
      if (when === 'on the new branch') {
        addParagraph(dir, SPEC, ['INV-50 note', 'Exports are described below.']);
        save(dir, { tier: '0', message: 'A note' });
      }
    }
  });

  test('guard: a paragraph that its close line names changes on the new branch: no hint, and the close line is not called stale', (t) => {
    const dir = archivedAtBase(t, { paras: [NOT_CITED], tier: '2', closeWhy: NAMES_INV12 });
    editFile(dir, SPEC, T12, T12B);
    save(dir, { tier: '1', message: 'INV-12' });
    const r = bothModes(dir);
    none(hintOn(r), r, `${CODE} on ${ID}`);
    assert.doesNotMatch(r.stdout, /close line C1 is stale/, show(r));
  });

  test('guard: al context of a request archived at the base says that it is not checked, and it shows no hint', (t) => {
    const dir = archivedAtBase(t, { paras: [NOT_CITED], tier: '2', closeWhy: NAMES_INV12 });
    editFile(dir, SPEC, T12, T12B);
    save(dir, { tier: '1', message: 'INV-12' });
    const r = ok(dir, ['context', NAME]);
    assert.ok(r.stdout.split('\n').includes(NOT_CHECKED(NAMES_INV12)), show(r));
    assert.ok(r.stdout.split('\n').includes('Hints     none'), show(r));
  });

  // `--on` names the ID of a hint, or the path of a hint with no ID.
  for (const on of [`${MOVED}/spec.md`, `${MOVED}/request.md`, `${OPEN}/request.md`, ID]) {
    test(`guard: an open request records a judgement with --on ${on}: refused, exit 2, and the live hint of the open request stays`, (t) => {
      const dir = archivedWithOther(t);
      const r = refused(dir, ['record', 'other', 'judgement', '--hint', CODE, '--on', on, '--reason', WHY, '--yes']);
      assert.ok(r.stdout.split('\n').includes(`al: --on ${on}: al check gives no ${CODE} hint on ${on} now`), show(r));
      const c = check(dir);
      one(hintOn(c, 'other/R1'), c, 'the hint on other/R1');
    });
  }

  // A real judgement on other/R1, whose `on` is then set by hand to a path of
  // the archived request. Its other fields still match the live hint.
  for (const on of [`${MOVED}/spec.md`, `${MOVED}/request.md`, `${OPEN}/request.md`]) {
    test(`guard: a record whose judgement says on: ${on} clears nothing on an open request whose own path is different`, (t) => {
      const dir = archivedWithOther(t);
      judgeIt(dir, { name: 'other', on: 'other/R1' });
      save(dir, { name: 'other' });
      assertHolds(dir, 'before the edit', { id: 'other/R1', holder: 'other' });
      editRecord(dir, 'other', (rec) => { rec.judgements.find((j) => j.id === 'J1').on = on; });
      const r = check(dir);
      one(hintOn(r, 'other/R1'), r, 'the hint on other/R1');
    });
  }

  test('guard: the close line that an archived record holds on R1 does not clear R1 of an open request', (t) => {
    const dir = archivedAtBase(t, { paras: [NOT_CITED], tier: '2', closeWhy: MET });
    another(dir, 'other', [['OT-9 plan', NO_CITE]], '2');
    const r = check(dir);
    const f = one(hintOn(r, 'other/R1'), r, 'the hint on other/R1');
    assert.equal(f.msg, NONE_KNOWN('other/R1', 'other', 'R1'), f.line);
  });

  test('guard: a judgement of a request on the hint of another request counts on the closing branch, and not when the holder is archived at the base', (t) => {
    const dir = opened(t);
    another(dir);
    judgeIt(dir, { on: 'other/R1' });
    save(dir);
    assertHolds(dir, 'while the holder is open', { id: 'other/R1' });
    concludeHere(dir);
    assertHolds(dir, 'on the closing branch', { id: 'other/R1' });
    mergeAndBranch(dir);
    const r = check(dir);
    const f = one(hintOn(r, 'other/R1'), r, 'the hint on other/R1');
    namesNoJudgement(f, r);
  });

  test('guard: a paragraph of the moved spec that serves another request counts on the closing branch, and not when it is archived at the base', (t) => {
    const dir = opened(t, [['SP-1 component serves:other/R1', 'A table holds the link.']]);
    another(dir);
    const r = check(dir);
    none(hintOn(r, 'other/R1'), r, 'the hint on other/R1 before the move');
    concludeHere(dir);
    const moved = check(dir);
    none(hintOn(moved, 'other/R1'), moved, 'the hint on other/R1 after the move');
    mergeAndBranch(dir);
    const next = check(dir);
    one(hintOn(next, 'other/R1'), next, 'the hint on other/R1, with share archived at the base');
  });

  test('guard: with no base, a concluded request gets no hint, and al context says that it is not checked', (t) => {
    const dir = opened(t, [CITED]);
    closeIt(dir);
    save(dir);
    git(dir, 'branch', '-m', 'main', 'trunk');
    git(dir, 'branch', '-m', 'feature', 'work');
    concludeHere(dir);
    const r = check(dir);
    assert.match(r.stdout, /^Read {6}working tree · no base$/m, show(r));
    none(hintOn(r), r, `${CODE} on ${ID}`);
    const c = ok(dir, ['context', NAME]);
    assert.ok(c.stdout.split('\n').includes(NOT_CHECKED(MET)), show(c));
    assert.ok(c.stdout.split('\n').includes('Hints     none'), show(c));
  });
});

// =====================================================================
// 7. `al record` stays strict: no new field, command or exit code.

describe('#128 al record stays strict', () => {
  const RECORDS = [
    ['close', ['close', '--on', 'R1', '--reason', MET, '--yes']],
    ['judgement', ['judgement', '--hint', CODE, '--on', ID, '--reason', WHY, '--yes']],
  ];
  const REFUSAL = `al: ${NAME} is archived, and an archived request is not edited`;

  for (const [label, args] of RECORDS) {
    test(`guard: al record ${NAME} ${label} on a request that the branch concluded: refused, exit 2, and it writes nothing`, (t) => {
      const dir = citedMoved(t);
      const r = refused(dir, ['record', NAME, ...args]);
      assert.ok(r.stdout.split('\n').includes(REFUSAL), show(r));
    });

    test(`guard: al record ${NAME} ${label} on a request archived at the base: refused, exit 2, and it writes nothing`, (t) => {
      const dir = citedAtBase(t);
      const r = refused(dir, ['record', NAME, ...args]);
      assert.ok(r.stdout.split('\n').includes(REFUSAL), show(r));
    });
  }

  test('guard: a close entry and a judgement entry keep their fields', (t) => {
    const dir = opened(t, [CITED]);
    judgeIt(dir);
    closeIt(dir);
    save(dir);
    concludeHere(dir);
    assert.deepEqual(Object.keys(closeEntries(dir)[0]).sort(), ['id', 'names', 'on', 'reason', 'recorded', 'sha256', 'version'], read(dir, recordPath(NAME)));
    assert.deepEqual(Object.keys(judgementEntries(dir)[0]).sort(), ['hint', 'id', 'keeps', 'message_sha256', 'on', 'reason', 'recorded'], read(dir, recordPath(NAME)));
  });
});

// =====================================================================
// 8. The order of the files in the message.

describe('#128 a move can change the order of the files in the message, and the judgement holds', () => {
  test('another open request and specs/ sort around the own file: the judgement holds, and the shown message has the real order', (t) => {
    const dir = threeCite(t);
    const r = check(dir);
    assert.deepEqual(
      citedIn(one(hintOn(r), r, 'the hint before the judgement')),
      ['current requests/other/spec.md', `current ${OPEN}/spec.md`, 'current specs/x.md'],
      show(r),
    );
    judgeIt(dir);
    save(dir);
    // A new citation brings the hint back, so its order can be read.
    beforeAndAfter(dir, (when) => assertHolds(dir, when));
    citeIn(dir, 'specs/z.md');
    const f = assertStale(dir, 'after a new citation');
    assert.deepEqual(citedIn(f), ['current requests/other/spec.md', 'current specs/x.md', 'current specs/z.md', `historical ${MOVED}/spec.md`], f.line);
  });

  test('a file that sorts between requests/archive/ and requests/share/: the judgement holds across the move', (t) => {
    const dir = opened(t, [CITED]);
    citeIn(dir, 'requests/b-note.md');
    const r = check(dir);
    assert.deepEqual(
      citedIn(one(hintOn(r), r, 'the hint before the judgement')),
      ['current requests/b-note.md', `current ${OPEN}/spec.md`],
      show(r),
    );
    judgeIt(dir);
    save(dir);
    beforeAndAfter(dir, (when) => assertHolds(dir, when));
    citeIn(dir, 'requests/c-note.md');
    const f = assertStale(dir, 'after a new citation');
    assert.deepEqual(citedIn(f), ['current requests/b-note.md', 'current requests/c-note.md', `historical ${MOVED}/spec.md`], f.line);
  });

  test('files archived at the base sort around the moved snapshot in the historical group: the judgement holds across the move', (t) => {
    const words = `The owner wants ${ID} to live.\n`;
    const dir = empty(t, (d) => {
      concluded(d, 'aaa', CITE);
      concluded(d, 'zzz', CITE);
    });
    newRequest(dir, NAME, words, ['--tier', '1d']);
    appendSection(dir, NAME, organized([R1]));
    ok(dir, ['record', NAME, 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
    write(dir, `${OPEN}/spec.md`, doc([NOT_CITED]));
    save(dir);
    const snapshot = `origin/${DAY}-owner-words.md`;
    const r = check(dir);
    assert.deepEqual(
      citedIn(one(hintOn(r), r, 'the hint before the judgement')),
      ['historical requests/archive/aaa/spec.md', 'historical requests/archive/zzz/spec.md', `historical ${OPEN}/${snapshot}`],
      show(r),
    );
    judgeIt(dir);
    save(dir);
    beforeAndAfter(dir, (when) => assertHolds(dir, when));
    citeIn(dir, 'specs/x.md');
    const f = assertStale(dir, 'after a new citation');
    assert.deepEqual(
      citedIn(f),
      ['current specs/x.md', 'historical requests/archive/aaa/spec.md', `historical ${MOVED}/${snapshot}`, 'historical requests/archive/zzz/spec.md'],
      f.line,
    );
  });
});

// =====================================================================
// 9. A snapshot under origin/ is historical before the move and after it.

describe('#128 a citation in a snapshot under origin/ is historical before and after the move', () => {
  const snapshot = `origin/${DAY}-owner-words.md`;

  function withWords(t, spec = NOT_CITED) {
    const dir = empty(t);
    newRequest(dir, NAME, `The owner wants ${ID} to live.\n`, ['--tier', '1d']);
    appendSection(dir, NAME, organized([R1]));
    ok(dir, ['record', NAME, 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
    write(dir, `${OPEN}/spec.md`, doc([spec]));
    save(dir);
    return dir;
  }

  test('only the snapshot cites it: the word stays historical, and the judgement holds across the move', (t) => {
    const dir = withWords(t);
    const r = check(dir);
    assert.deepEqual(citedIn(one(hintOn(r), r, 'the hint before the judgement')), [`historical ${OPEN}/${snapshot}`], show(r));
    judgeIt(dir);
    save(dir);
    beforeAndAfter(dir, (when) => assertHolds(dir, when));
    citeIn(dir, `${MOVED}/review.md`);
    const f = assertStale(dir, 'after a new citation');
    assert.deepEqual(citedIn(f), [`historical ${MOVED}/${snapshot}`, `historical ${MOVED}/review.md`], f.line);
  });

  test('the snapshot and the own spec cite it: current, then historical, before the move: the judgement holds across it', (t) => {
    const dir = withWords(t, CITED);
    const r = check(dir);
    assert.deepEqual(
      citedIn(one(hintOn(r), r, 'the hint before the judgement')),
      [`current ${OPEN}/spec.md`, `historical ${OPEN}/${snapshot}`],
      show(r),
    );
    judgeIt(dir);
    save(dir);
    beforeAndAfter(dir, (when) => assertHolds(dir, when));
  });

  test('a file whose path only looks like a snapshot is current before the move: the judgement holds across it', (t) => {
    const dir = opened(t, [CITED]);
    citeIn(dir, `${OPEN}/origin-notes.md`);
    citeIn(dir, `${OPEN}/sub/origin/deep.md`);
    const r = check(dir);
    assert.deepEqual(
      citedIn(one(hintOn(r), r, 'the hint before the judgement')),
      [`current ${OPEN}/origin-notes.md`, `current ${OPEN}/spec.md`, `current ${OPEN}/sub/origin/deep.md`],
      show(r),
    );
    judgeIt(dir);
    save(dir);
    beforeAndAfter(dir, (when) => assertHolds(dir, when));
  });
});

// =====================================================================
// 10. A citation that does not move keeps its word and its path.

describe('#128 a citation that does not move keeps its word and its path, and the judgement holds', () => {
  test('a citation in another open request and in specs/, beside an own citation', (t) => {
    const dir = threeCite(t);
    judgeIt(dir);
    save(dir);
    beforeAndAfter(dir, (when) => assertHolds(dir, when));
    citeIn(dir, `${MOVED}/review.md`);
    const f = assertStale(dir, 'after a new citation');
    const shown = citedIn(f);
    assert.ok(shown.includes('current requests/other/spec.md'), f.line);
    assert.ok(shown.includes('current specs/x.md'), f.line);
  });

  test('a snapshot of another open request stays historical at its path', (t) => {
    const dir = opened(t, [CITED]);
    newRequest(dir, 'other', `The owner wants ${ID} too.\n`, ['--tier', '1d']);
    save(dir, { name: 'other' });
    const words = `historical requests/other/origin/${DAY}-owner-words.md`;
    const r = check(dir);
    assert.deepEqual(citedIn(one(hintOn(r), r, 'the hint before the judgement')), [`current ${OPEN}/spec.md`, words], show(r));
    judgeIt(dir);
    save(dir);
    beforeAndAfter(dir, (when) => assertHolds(dir, when));
    citeIn(dir, 'specs/x.md');
    const f = assertStale(dir, 'after a new citation');
    assert.ok(citedIn(f).includes(words), f.line);
  });

  test('paths outside requests/ that hold the text of a request path keep their path', (t) => {
    const dir = opened(t, [CITED]);
    const odd = [`docs/${MOVED}/note.md`, `specs/${OPEN}/note.md`];
    for (const file of odd) citeIn(dir, file);
    judgeIt(dir);
    save(dir);
    beforeAndAfter(dir, (when) => assertHolds(dir, when));
    citeIn(dir, 'README.md');
    const f = assertStale(dir, 'after a new citation');
    assert.deepEqual(citedIn(f), ['current README.md', ...odd.map((x) => `current ${x}`), `historical ${MOVED}/spec.md`], f.line);
  });

  test('a citation in an open request whose name starts with the name of the moved request', (t) => {
    const dir = opened(t, [CITED]);
    another(dir, `${NAME}-more`, [['OT-9 plan', CITE]]);
    judgeIt(dir);
    save(dir);
    beforeAndAfter(dir, (when) => assertHolds(dir, when));
    citeIn(dir, 'specs/x.md');
    const f = assertStale(dir, 'after a new citation');
    assert.ok(citedIn(f).includes(`current requests/${NAME}-more/spec.md`), f.line);
  });

  test('a citation in a request archived at the base, whose name starts with the name of the moved request, stays historical at its path', (t) => {
    const old = `${NAME}-more`;
    const dir = opened(t, [CITED], { onMain: (d) => concluded(d, old, CITE) });
    const r = check(dir);
    assert.deepEqual(
      citedIn(one(hintOn(r), r, 'the hint before the judgement')),
      [`current ${OPEN}/spec.md`, `historical requests/archive/${old}/spec.md`],
      show(r),
    );
    judgeIt(dir);
    save(dir);
    beforeAndAfter(dir, (when) => assertHolds(dir, when));
    citeIn(dir, 'specs/x.md');
    const f = assertStale(dir, 'after a new citation');
    assert.ok(citedIn(f).includes(`historical requests/archive/${old}/spec.md`), f.line);
  });

  test('a citation in another request archived at the base stays historical at its path, in the message of a request that the branch concludes', (t) => {
    const dir = opened(t, [CITED], { onMain: (d) => concluded(d, 'old', CITE) });
    judgeIt(dir);
    save(dir);
    beforeAndAfter(dir, (when) => assertHolds(dir, when));
    citeIn(dir, 'specs/x.md');
    const f = assertStale(dir, 'after a new citation');
    assert.deepEqual(citedIn(f), ['current specs/x.md', 'historical requests/archive/old/spec.md', `historical ${MOVED}/spec.md`], f.line);
  });
});

// =====================================================================
// 11. Two requests that cite each other.

describe('#128 two requests cite each other', () => {
  const A = 'alpha';
  const B = 'beta';
  const JA = `${A}/R1`;
  const JB = `${B}/R1`;

  // alpha cites beta/R1, and beta cites alpha/R1. Each has a judgement on its
  // own hint, made while both are open.
  const crossCited = (t) => copyOf(t, 'cross cited', (b) => {
    const dir = empty(b);
    openRequest(dir, A, [['SP-9 plan', `Build for ${JB} first.`]], { tier: '1d' });
    commitAll(dir, claim(A, '1d'));
    openRequest(dir, B, [['SP-9 plan', `Build for ${JA} first.`]], { tier: '1d' });
    commitAll(dir, claim(B, '1d'));
    const r = check(dir);
    assert.deepEqual(citedIn(one(hintOn(r, JA), r, 'the hint on alpha/R1')), [`current requests/${B}/spec.md`], show(r));
    assert.deepEqual(citedIn(one(hintOn(r, JB), r, 'the hint on beta/R1')), [`current requests/${A}/spec.md`], show(r));
    judgeIt(dir, { name: A, on: JA });
    save(dir, { name: A });
    judgeIt(dir, { name: B, on: JB });
    save(dir, { name: B });
    return dir;
  });
  const holdsA = (dir, when) => assertHolds(dir, when, { id: JA, holder: A });
  const holdsB = (dir, when) => assertHolds(dir, when, { id: JB, holder: B });

  test('one branch concludes both: each judgement holds after each move', (t) => {
    const dir = crossCited(t);
    concludeHere(dir, { name: A });
    holdsA(dir, 'after alpha moves');
    holdsB(dir, 'after alpha moves');
    concludeHere(dir, { name: B });
    holdsA(dir, 'after both move');
    holdsB(dir, 'after both move');
  });

  // The word of the citing file changes from current to historical here. That
  // is no honest reason for staleness: DES-165 says that a citing file that
  // only moves does not make a judgement stale, and DES-37 reads the moved
  // request as an open one on this branch. This file does not assert what that
  // judgement does on a later branch, where alpha is archived at the base. The
  // requirement does not say.
  test('the branch concludes only alpha: the judgement of alpha holds, and the judgement of beta, which stays open, holds too', (t) => {
    const dir = crossCited(t);
    beforeAndAfter(dir, (when) => {
      holdsA(dir, when);
      holdsB(dir, when);
    }, { name: A });
  });

  test('the branch concludes only alpha, and the citing line of beta/R1 then goes from the moved spec: the judgement of beta is stale', (t) => {
    const dir = crossCited(t);
    concludeHere(dir, { name: A });
    holdsB(dir, 'after alpha moves');
    write(dir, `requests/archive/${A}/spec.md`, doc([NOT_CITED]));
    save(dir, { name: A });
    assertStale(dir, 'after the citation goes', { id: JB, holder: B });
  });
});

// =====================================================================
// 12. The message as shown does not change.

describe('#128 the message as shown does not change', () => {
  test('guard: with no judgement: the hint shows the moved file as historical, at its real path', (t) => {
    const dir = citedMoved(t);
    const r = check(dir);
    const f = one(hintOn(r), r, 'the hint after the move');
    assert.equal(f.file, `${MOVED}/request.md`, f.line);
    assert.equal(f.msg, `${SHARE_MESSAGE([`historical ${MOVED}/spec.md`])} · cited lines: ${MOVED}/spec.md 3`, f.line);
    namesNoJudgement(f, r);
  });

  test('guard: with a stale judgement: the hint shows the moved files as historical, at their real paths, and then the stale judgement', (t) => {
    const dir = judged(t);
    citeIn(dir, `${OPEN}/review.md`);
    save(dir);
    concludeHere(dir);
    const r = check(dir);
    const f = one(hintOn(r), r, 'the hint after the move');
    assert.equal(
      f.msg,
      `${SHARE_MESSAGE([`historical ${MOVED}/review.md`, `historical ${MOVED}/spec.md`])}; the judgement ${NAME}/J1 (${DAY}) is stale: ${HINT_TEXT} · cited lines: ${MOVED}/review.md 1; ${MOVED}/spec.md 3`,
      f.line,
    );
  });

  test('a judgement that holds leaves the words of a hint on another requirement as they are', (t) => {
    const dir = opened(t, [CITED]);
    another(dir, 'other', [['OT-9 plan', NO_CITE]]);
    citeIn(dir, `${OPEN}/review.md`, 'other/R1');
    judgeIt(dir);
    save(dir);
    concludeHere(dir);
    const r = assertHolds(dir, 'after the move');
    const f = one(hintOn(r, 'other/R1'), r, 'the hint on other/R1');
    assert.equal(f.msg, `${KNOWN_CITED('other/R1', 'other', 'R1', [`historical ${MOVED}/review.md`])} · cited lines: ${MOVED}/review.md 1`, f.line);
  });
});

// =====================================================================
// 13. --strict stays as it is.

describe('#128 --strict stays as it is', () => {
  test('guard: the hint with no judgement, after the move: exit 0 in both modes', (t) => {
    const dir = citedMoved(t);
    const r = bothModes(dir);
    one(hintOn(r), r, 'the hint after the move');
  });

  test('guard: a stale close line and a stale judgement, after the move: exit 0 in both modes', (t) => {
    const dir = opened(t, [CITED]);
    judgeIt(dir);
    closeIt(dir, { why: NAMES_INV12 });
    save(dir);
    editFile(dir, SPEC, T12, T12B);
    save(dir);
    concludeHere(dir);
    const r = bothModes(dir);
    const f = one(hintOn(r), r, 'the hint after the move');
    assert.ok(f.msg.includes('; close line C1 is stale'), f.line);
    assert.ok(f.msg.includes(`; the judgement ${NAME}/J1 (${DAY}) is stale: `), f.line);
  });

  test('a judgement that holds after the move does not hide a not ok: exit 0 in plain mode, and exit 1 under --strict', (t) => {
    const dir = judgedMoved(t);
    assertHolds(dir, 'after the move');
    editFile(dir, `${MOVED}/request.md`, TEXT_24, TEXT_48);
    index(dir);
    const r = check(dir);
    assert.equal(r.code, 0, show(r));
    assert.ok(r.findings.some((f) => f.severity === 'not ok'), show(r));
    assert.equal(check(dir, '--strict').code, 1, 'a not ok fails --strict');
  });
});
