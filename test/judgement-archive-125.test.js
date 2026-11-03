// #125: a judgement holds when `al conclude <name> --yes` moves its request to
// requests/archive/<name>/ on the branch. Written from the issue, the
// architect's decision and the public interface only: the al command, its
// output and the records. Nothing here reads src/. No model and no network.
//
// - DES-163: a hint clears by a judgement, `al record <name> judgement --hint
//   <code> --on <ID> --reason <why>`. `--on` is the ID that the hint line
//   shows, or the hint's path when that ID is "-". The judgement keeps the
//   versions of both sides of its hint. When one side changes, the hint comes
//   back, and it ends with "the judgement <request>/J<n> (<date>) is stale:
//   <what> changed since it". For one hint code and `--on`, only the newest
//   judgement counts.
// - DES-37: a request that the branch concludes is checked as an open request,
//   at its new paths. A request archived at the base is never checked again.
// - The decision for map-consolidation: the hint's message keeps its wording
//   and its path. A judgement reads the message as the message of the open
//   request: a requests/archive/<name>/ path in the message counts as
//   requests/<name>/. So a judgement that was recorded on the open request
//   clears its hint after the move, with no new record. A message with no
//   archive path behaves as before.
// - The decision for no-id: a judgement on the path of the open request's file
//   holds on that file after the move, and the audit shows it as current. It
//   does not clear a hint on another file with the same text.
//
// How these tests change the hint's message after the move: they edit the
// moved change spec in the working tree, as a real branch can do. They add a
// paragraph SP-3 (a longer list), or they change the kind of SP-2 to plan (a
// shorter list). They commit the edit too. `al record` stays refused, because
// an archived request is not edited.
//
// A request needs a close line or a link to conclude on path 2, so the
// map-consolidation worlds record a close line on R1. The no-id worlds use path
// 1d. `al new` refuses an uppercase name, so the test of a name that looks like
// an ID uses sp-1. The requirement leaves one choice open: the `info judged`
// and `Judgement` lines of a no-id judgement may show `--on` at either path
// after the move, and these tests take either.
//
// Requirement 4 (a request archived at the base) has its own tests here,
// because the neighbouring tests prove it only for other hint codes.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync } from 'node:fs';
import { join } from 'node:path';
import {
  DAY, baseProject, commitAll, doc, editFile, editRecord, git, index, ok, read, record, refused, show, write,
} from './helpers/project.js';
import { CS, NAME, SPEC, addSpec, claim, openRequest, world } from './helpers/map-68.js';
import { check, coded, judge, judgedLines, none, one } from './helpers/judgement-88.js';

const open = (name) => `requests/${name}`;
const archive = (name) => `requests/archive/${name}`;
const ARCHIVED = `${archive(NAME)}/spec.md`;

const WHY = 'Withdrawn on purpose, so no spec paragraph holds these.';
const CLOSE = 'A decision took this off the track.';
const T1 = 'A shared export link never stops.';
const T1b = 'A shared export link always stops.';
const T2 = 'A link has a token.';
const T2b = 'A link has no token.';
const T3 = 'A link has an owner.';
const T9 = 'One PR: the link, then the email.';
const T9b = 'Two PRs: the link, then the email.';
const PARAS = [['SP-1 rule serves:R1', T1], ['SP-2 data serves:R1', T2], ['SP-9 plan', T9]];
const HINT_TEXT = "the hint's text";
const SP3 = ['SP-3 rule serves:R1', T3];
const CHANGED = ' changed since it';

// The hash of the plain open message of `PARAS`, as al wrote it into a record
// before this fix. A judgement in such a record must still hold.
const RELEASED_MESSAGE_SHA256 = '13b272e8e03f1e4089124f6b70d40d2f6aa81b3c887a00a1be307b4d10d49386';

// An ID as a whole word, bare or with the request's name.
const names = (msg, id, name = NAME) => new RegExp(`(?<![\\w-])(?:${name}/)?${id}(?![\\w-])`).test(msg);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const before = (msg) => msg.split(' · places: ')[0];
const addParagraph = (dir, file, para) => write(dir, file, `${read(dir, file)}\n${doc([para])}`);

// Both modes exit 0: a hint is never a not ok.
function checks(dir) {
  const r = check(dir);
  assert.equal(r.code, 0, show(r));
  const s = check(dir, '--strict');
  assert.equal(s.code, 0, show(s));
  return [r, s];
}

const judgedHas = (r, text) => judgedLines(r).some((j) => j.msg.includes(text));
const judgedMatches = (r, re) => judgedLines(r).some((j) => re.test(j.msg));
const assertNotJudged = (r, j, when) =>
  assert.ok(!judgedLines(r).some((f) => f.msg.includes(`${j} `)), `no info judged line names ${j} ${when}:\n${show(r)}`);

// The line of a judgement in `al context <name> --audit`.
function auditLine(dir, holder, id) {
  const r = ok(dir, ['context', holder, '--audit']);
  const found = r.stdout.split('\n').filter((l) => l.startsWith(`Judgement ${id} `));
  assert.equal(found.length, 1, `one Judgement line for ${id}:\n${show(r)}`);
  return { line: found[0], r };
}
function assertAudit(dir, { holder = NAME, id = 'J1', code = 'map-consolidation', on = NAME, state, why = WHY, when }) {
  const { line, r } = auditLine(dir, holder, id);
  const re = new RegExp(`^Judgement ${id} ${esc(code)} ${on} recorded \\S+ \\([^)]+\\): ${state}; reason: ${esc(why)}$`);
  assert.match(line, re, `the audit ${when}:\n${show(r)}`);
}
const CURRENT = 'current';
const STALE = 'stale: .+ changed since it';

// --- map-consolidation

const consolidation = (r, name = NAME) => coded(r, 'map-consolidation', name);

// The judgement is current: no hint, and the info judged line names it.
function assertCurrent(dir, when, { name = NAME, holder = name, n = 1, why = WHY } = {}) {
  for (const r of checks(dir)) {
    none(consolidation(r, name), r, `map-consolidation on ${name} ${when}`);
    const text = `${holder}/J${n} map-consolidation ${name}: ${why}`;
    assert.ok(judgedHas(r, text), `an info judged line names "${text}" ${when}:\n${show(r)}`);
  }
}

// The hint is back, at the paths of `at`. Its message names the judgement as
// stale. <what> names each of `ids`, or is about the hint's text.
function assertStale(dir, when, { name = NAME, holder = name, n = 1, at = 'archive', ids, text = false } = {}) {
  for (const r of checks(dir)) {
    const f = one(consolidation(r, name), r, `map-consolidation on ${name} ${when}`);
    const msg = before(f.msg);
    const folder = at === 'archive' ? archive(name) : open(name);
    assert.equal(f.file, `${folder}/spec.md`, `its place ${when}:\n${f.line}\n${show(r)}`);
    assert.ok(msg.includes(`; judge each consolidation in ${folder}/review.md`), `the message keeps its wording and its path ${when}:\n${f.line}`);
    if (at === 'archive') assert.ok(!msg.includes(`${open(name)}/`), `the message names no old path ${when}:\n${f.line}`);
    const tail = `; the judgement ${holder}/J${n} (${DAY}) is stale: `;
    const where = msg.lastIndexOf(tail);
    assert.ok(where >= 0, `the hint names ${holder}/J${n} as stale ${when}:\n${f.line}\n${show(r)}`);
    const rest = msg.slice(where + tail.length);
    assert.ok(rest.endsWith(CHANGED), `the message ends with "<what> changed since it" ${when}:\n${f.line}`);
    const what = rest.slice(0, -CHANGED.length);
    if (text) assert.ok(what.includes(HINT_TEXT), `<what> is about the hint's text ${when}: "${what}"\n${f.line}`);
    for (const id of ids ?? []) assert.ok(names(what, id, name), `<what> names ${id} ${when}: "${what}"\n${f.line}`);
    if (ids) assert.ok(!what.includes(HINT_TEXT), `<what> names the paragraph, not the hint's text ${when}: "${what}"\n${f.line}`);
    assertNotJudged(r, `${holder}/J${n}`, when);
  }
}

const closeLine = (dir, name = NAME) => ok(dir, ['record', name, 'close', '--on', 'R1', '--reason', CLOSE, '--yes']);

// al conclude <name> --yes, then al index. `indexed` false leaves out al index.
function concludeHere(dir, { name = NAME, indexed = true } = {}) {
  const r = ok(dir, ['conclude', name, '--yes']);
  assert.ok(r.stdout.startsWith(`Concluded ${name}: `) || r.stdout.includes(`\nConcluded ${name}: `), show(r));
  if (indexed) index(dir);
}
const commitMove = (dir, name = NAME, tier = '2') => commitAll(dir, `Conclude ${name}\n\nTier: ${tier} — ${name}`);

// share (made on the branch feature), with its hint judged as J1, and a close
// line on R1. Committed.
function judged(t) {
  const dir = world(t, PARAS);
  const r = check(dir);
  const f = one(consolidation(r), r, 'map-consolidation before the judgement');
  assert.equal(f.file, CS, show(r));
  judge(dir, 'map-consolidation', NAME, WHY, { name: NAME });
  closeLine(dir);
  commitAll(dir, `${NAME}: the judgement J1`);
  return dir;
}

// The world where the request was concluded and merged into main, then a new
// branch. The request is archived at the base.
function archivedAtBase(dir) {
  git(dir, 'checkout', '-q', 'main');
  git(dir, 'merge', '-q', '--no-ff', '-m', 'Merge the branch feature', 'feature');
  git(dir, 'checkout', '-q', '-b', 'next');
}

const judgementOf = (dir, name, id) => (record(dir, name).judgements ?? []).find((j) => j.id === id);

describe('#125 a map-consolidation judgement stays current after the move, while the paragraphs that it names are unchanged', () => {
  test('al conclude --yes, before and after al index, before and after the commit of the move: no hint, the info judged line names J1, exit 0, the audit says current, and the record of J1 is not changed', (t) => {
    const dir = judged(t);
    assertCurrent(dir, 'before the move');
    const j = judgementOf(dir, NAME, 'J1');
    concludeHere(dir, { indexed: false });
    assertCurrent(dir, 'after the move, before al index');
    index(dir);
    assertCurrent(dir, 'after the move and al index, before the commit');
    assertAudit(dir, { state: CURRENT, when: 'before the commit of the move' });
    commitMove(dir);
    assertCurrent(dir, 'after the commit of the move');
    assertAudit(dir, { state: CURRENT, when: 'after the commit of the move' });
    assert.deepEqual(judgementOf(dir, NAME, 'J1'), j, 'the move records nothing new in J1');
  });

  test('a request that is open at the base and changed on the branch: the judgement holds after the move, before and after the commit', (t) => {
    const dir = baseProject(t, { branch: null });
    openRequest(dir, NAME, PARAS);
    commitAll(dir, claim(NAME));
    git(dir, 'checkout', '-q', '-b', 'feature');
    addParagraph(dir, CS, SP3);
    index(dir);
    commitAll(dir, claim(NAME));
    const r = check(dir);
    assert.equal(one(consolidation(r), r, 'map-consolidation before the judgement').file, CS, show(r));
    judge(dir, 'map-consolidation', NAME, WHY, { name: NAME });
    closeLine(dir);
    assertCurrent(dir, 'before the move');
    concludeHere(dir);
    assertCurrent(dir, 'after the move, before the commit');
    commitMove(dir);
    assertCurrent(dir, 'after the commit of the move');
    assertAudit(dir, { state: CURRENT, when: 'after the commit of the move' });
  });

  test('a judgement in a record that al wrote before this fix holds after the move: its hash is of the plain open message', (t) => {
    const dir = judged(t);
    editRecord(dir, NAME, (rec) => {
      rec.judgements.find((j) => j.id === 'J1').message_sha256 = [RELEASED_MESSAGE_SHA256];
    });
    assertCurrent(dir, 'before the move');
    concludeHere(dir);
    assertCurrent(dir, 'after the move');
  });

  test('a further commit on the same branch after the move: the judgement stays current', (t) => {
    const dir = judged(t);
    concludeHere(dir);
    commitMove(dir);
    addParagraph(dir, SPEC, ['INV-50 note', 'Exports are described below.']);
    index(dir);
    commitAll(dir, 'A note in specs/invoices.md\n\nTier: 0 — a note');
    assertCurrent(dir, 'after a further commit');
  });

  test('a change of a change paragraph that the message does not name (the plan SP-9) in the moved change spec leaves it current', (t) => {
    const dir = judged(t);
    concludeHere(dir);
    editFile(dir, ARCHIVED, T9, T9b);
    assertCurrent(dir, 'after an edit of the plan SP-9');
  });

  test('a request name that looks like an ID (sp-1, with a paragraph SP-1): the judgement holds after the move, and an edit of SP-1 makes it stale', (t) => {
    const name = 'sp-1';
    const dir = world(t, null, { link: false });
    openRequest(dir, name, PARAS);
    commitAll(dir, claim(name));
    judge(dir, 'map-consolidation', name, WHY, { name });
    closeLine(dir, name);
    commitAll(dir, `${name}: the judgement J1`);
    assertCurrent(dir, 'before the move', { name });
    concludeHere(dir, { name });
    assertCurrent(dir, 'after the move', { name });
    editFile(dir, `${archive(name)}/spec.md`, T1, T1b);
    assertStale(dir, 'after an edit of SP-1', { name, ids: ['SP-1'] });
  });

  test('another open request on the branch: J1 of each holds, and only the moved request reads as moved; an edit of the open request makes only its own judgement stale', (t) => {
    const dir = judged(t);
    const other = 'other';
    const OT = 'Another promise that never ends.';
    openRequest(dir, other, [['OT-1 rule serves:R1', OT]]);
    commitAll(dir, claim(other));
    judge(dir, 'map-consolidation', other, WHY, { name: other });
    commitAll(dir, `${other}: the judgement J1`);
    concludeHere(dir);
    assertCurrent(dir, 'after the move of share');
    assertCurrent(dir, 'after the move of share', { name: other });
    editFile(dir, `${open(other)}/spec.md`, OT, 'Another promise that always ends.');
    assertStale(dir, 'after an edit of OT-1', { name: other, at: 'open', ids: ['OT-1'] });
    assertCurrent(dir, 'after an edit of OT-1');
  });

  test('a judgement in the record of another open request, on the hint of the moved request: recorded before the move, it holds after it, and an edit of SP-2 makes it stale', (t) => {
    const dir = world(t, PARAS);
    const other = 'other';
    openRequest(dir, other, [['OT-1 rule serves:R1', 'Another promise that never ends.']]);
    commitAll(dir, claim(other));
    judge(dir, 'map-consolidation', NAME, WHY, { name: other });
    closeLine(dir);
    commitAll(dir, 'The judgement in the record of other');
    assertCurrent(dir, 'before the move', { holder: other });
    concludeHere(dir);
    assertCurrent(dir, 'after the move', { holder: other });
    assertAudit(dir, { holder: other, state: CURRENT, when: 'after the move' });
    editFile(dir, ARCHIVED, T2, T2b);
    assertStale(dir, 'after an edit of SP-2', { holder: other, ids: ['SP-2'] });
  });

  test('a judgement that another open request records after the move, on a message with the archive path: it clears the hint, and an edit of SP-2 makes it stale', (t) => {
    const dir = world(t, PARAS);
    const other = 'other';
    openRequest(dir, other, [['OT-1 rule serves:R1', 'Another promise that never ends.']]);
    commitAll(dir, claim(other));
    closeLine(dir);
    commitAll(dir, 'The close line');
    concludeHere(dir);
    judge(dir, 'map-consolidation', NAME, WHY, { name: other });
    assertCurrent(dir, 'after the judgement', { holder: other });
    commitMove(dir);
    assertCurrent(dir, 'after the commit', { holder: other });
    editFile(dir, ARCHIVED, T2, T2b);
    assertStale(dir, 'after an edit of SP-2', { holder: other, ids: ['SP-2'] });
  });

  test('control: a judgement on another hint of the moved request (design-link on SP-2, whose places name the paths) stays current across the move', (t) => {
    const dir = world(t, PARAS);
    const r = check(dir);
    one(coded(r, 'design-link', `${NAME}/SP-2`), r, 'design-link on share/SP-2');
    judge(dir, 'design-link', `${NAME}/SP-2`, WHY, { name: NAME });
    closeLine(dir);
    commitAll(dir, `${NAME}: the judgement J1`);
    const text = `${NAME}/J1 design-link ${NAME}/SP-2: ${WHY}`;
    for (const when of ['before the move', 'after the move', 'after the commit']) {
      if (when === 'after the move') concludeHere(dir);
      if (when === 'after the commit') commitMove(dir);
      for (const x of checks(dir)) {
        none(coded(x, 'design-link', `${NAME}/SP-2`), x, `design-link ${when}`);
        assert.ok(judgedHas(x, text), `the info judged line names "${text}" ${when}:\n${show(x)}`);
      }
    }
  });
});

describe('#125 the judgement is still judged after the move, so the check is not made weaker', () => {
  test('a different list of paragraphs (SP-3 added to the moved change spec): the hint is back at the new paths, it names J1 as stale, and the text is the reason', (t) => {
    const dir = judged(t);
    concludeHere(dir);
    addParagraph(dir, ARCHIVED, SP3);
    assertStale(dir, 'after SP-3 is added in the working tree', { text: true });
    assertAudit(dir, { state: STALE, when: 'after SP-3 is added' });
    const r = check(dir);
    const f = one(consolidation(r), r, 'map-consolidation after SP-3');
    assert.ok(names(before(f.msg).split('; the judgement')[0], 'SP-3'), `the message names SP-3:\n${f.line}`);
    index(dir);
    commitMove(dir);
    assertStale(dir, 'after SP-3 is committed', { text: true });
  });

  test('with SP-3 added to the moved change spec and then taken out, J1 is current again', (t) => {
    const dir = judged(t);
    concludeHere(dir);
    const moved = read(dir, ARCHIVED);
    addParagraph(dir, ARCHIVED, SP3);
    write(dir, ARCHIVED, moved);
    assertCurrent(dir, 'with SP-3 gone again');
  });

  test('a shorter list (the kind of SP-2 made plan in the moved change spec): the hint is back at the new paths, and it names J1 as stale', (t) => {
    const dir = judged(t);
    concludeHere(dir);
    commitMove(dir);
    editFile(dir, ARCHIVED, '<!-- SP-2 data serves:R1 -->', '<!-- SP-2 plan -->');
    assertStale(dir, 'with SP-2 a plan', { text: true });
    const r = check(dir);
    const f = one(consolidation(r), r, 'map-consolidation with SP-2 a plan');
    assert.ok(!names(before(f.msg).split('; the judgement')[0], 'SP-2'), `the message does not name SP-2:\n${f.line}`);
  });

  test('a named paragraph SP-1 changes in the moved change spec: the hint is back at the new paths, <what> names SP-1; the judged text again clears it', (t) => {
    const dir = judged(t);
    concludeHere(dir);
    editFile(dir, ARCHIVED, T1, T1b);
    assertStale(dir, 'after the edit of SP-1 in the working tree', { ids: ['SP-1'] });
    assertAudit(dir, { state: STALE, when: 'after the edit of SP-1' });
    commitMove(dir);
    assertStale(dir, 'after the edit of SP-1 is committed', { ids: ['SP-1'] });
    editFile(dir, ARCHIVED, T1b, T1);
    assertCurrent(dir, 'with the judged text of SP-1 back');
  });

  test('the other named paragraph SP-2 changes in a further commit after the move: <what> names SP-2', (t) => {
    const dir = judged(t);
    concludeHere(dir);
    commitMove(dir);
    editFile(dir, ARCHIVED, T2, T2b);
    commitAll(dir, `The moved SP-2\n\nTier: 2 — ${NAME}`);
    assertStale(dir, 'after the commit of the edit of SP-2', { ids: ['SP-2'] });
  });

  test('the move does not wash a stale judgement: SP-1 edited before the move, then the move: stale at the new paths, <what> names SP-1', (t) => {
    const dir = judged(t);
    editFile(dir, CS, T1, T1b);
    assertStale(dir, 'before the move', { at: 'open', ids: ['SP-1'] });
    concludeHere(dir);
    assertStale(dir, 'after the move', { ids: ['SP-1'] });
  });

  test('the move does not wash a stale judgement: SP-3 added before the move, then the move: stale at the new paths, the text is the reason', (t) => {
    const dir = judged(t);
    addParagraph(dir, CS, SP3);
    index(dir);
    assertStale(dir, 'before the move', { at: 'open', text: true });
    concludeHere(dir);
    assertStale(dir, 'after the move', { text: true });
  });

  test('only the newest judgement counts across the move: J2 on a longer list is current and J1 is history; with the list of J1 back, the hint names J2 as stale, not J1', (t) => {
    const dir = judged(t);
    const WHY2 = 'The longer list is withdrawn too.';
    addParagraph(dir, CS, SP3);
    index(dir);
    judge(dir, 'map-consolidation', NAME, WHY2, { name: NAME });
    commitAll(dir, `${NAME}: the judgement J2`);
    concludeHere(dir);
    const shorter = read(dir, ARCHIVED).replace(`\n${doc([SP3])}`, '');
    assertCurrent(dir, 'after the move', { n: 2, why: WHY2 });
    for (const r of checks(dir)) assertNotJudged(r, `${NAME}/J1`, 'after the move');
    assertAudit(dir, { id: 'J1', state: `history: ${NAME}/J2 is newer on the same hint and ID`, when: 'after the move' });
    assertAudit(dir, { id: 'J2', state: CURRENT, why: WHY2, when: 'after the move' });
    write(dir, ARCHIVED, shorter);
    assertStale(dir, 'with the list of J1 back', { n: 2, text: true });
    for (const r of checks(dir)) {
      assert.ok(!r.stdout.includes(`${NAME}/J1 (`), `no line names J1 as stale:\n${show(r)}`);
    }
  });

  test('control: with no judgement, the hint after the move keeps its wording and names the new paths', (t) => {
    const dir = world(t, PARAS);
    closeLine(dir);
    commitAll(dir, 'The close line');
    concludeHere(dir);
    const r = check(dir);
    const f = one(consolidation(r), r, 'map-consolidation after the move');
    assert.equal(f.file, ARCHIVED, show(r));
    assert.equal(
      before(f.msg),
      `2 change paragraphs that go into specs/ have no current consolidation judgement: SP-1, SP-2; judge each consolidation in ${archive(NAME)}/review.md`,
      show(r),
    );
  });

  test('control: al record stays refused after the move: an archived request is not edited', (t) => {
    const dir = judged(t);
    concludeHere(dir);
    const r = refused(dir, ['record', NAME, 'judgement', '--hint', 'map-consolidation', '--on', NAME, '--reason', 'Again.', '--yes']);
    assert.match(r.stdout, new RegExp(`^al: ${NAME} is archived, and an archived request is not edited$`, 'm'), show(r));
  });
});

describe('#125 control: a judgement on the open request keeps the same behaviour as before the fix', () => {
  test('current while its versions are the same, in the working tree and after a commit', (t) => {
    const dir = world(t, PARAS);
    judge(dir, 'map-consolidation', NAME, WHY, { name: NAME });
    assertCurrent(dir, 'in the working tree');
    assertAudit(dir, { state: CURRENT, when: 'in the working tree' });
    commitAll(dir, `${NAME}: the judgement J1`);
    assertCurrent(dir, 'after a commit');
  });

  test('stale when the list of paragraphs changes: the hint is at the open paths, the text is the reason', (t) => {
    const dir = judged(t);
    addParagraph(dir, CS, SP3);
    assertStale(dir, 'after SP-3 is added', { at: 'open', text: true });
    assertAudit(dir, { state: STALE, when: 'after SP-3 is added' });
  });

  test('stale when a named paragraph changes: <what> names it', (t) => {
    const dir = judged(t);
    editFile(dir, CS, T1, T1b);
    assertStale(dir, 'after the edit of SP-1', { at: 'open', ids: ['SP-1'] });
    assertAudit(dir, { state: STALE, when: 'after the edit of SP-1' });
  });
});

describe('#125 control: a request that was already archived at the base stays not checked', () => {
  test('map-consolidation: no hint, its judgement is not applied, and the audit says "recorded; not checked: the request is archived", also after an edit of the archived change spec', (t) => {
    const dir = judged(t);
    concludeHere(dir);
    commitMove(dir);
    archivedAtBase(dir);
    const state = 'recorded; not checked: the request is archived';
    for (const when of ['with no change', 'after an edit', 'after a commit of the edit']) {
      if (when === 'after an edit') editFile(dir, ARCHIVED, T2, T2b);
      if (when === 'after a commit of the edit') commitMove(dir);
      const r = check(dir);
      none(consolidation(r), r, `map-consolidation ${when}`);
      assertNotJudged(r, `${NAME}/J1`, when);
      assertAudit(dir, { state, when });
    }
  });
});

// --- no-id: a hint with no ID, whose --on is the path of its file

const STRAY = 'A stray paragraph with no marker.';
const STRAY_B = 'A stray paragraph, edited.';
const fileOf = (f) => f.file.split(':')[0];
const noIds = (r, folder) => coded(r, 'no-id').filter((f) => fileOf(f) === `${folder}/spec.md`);
const noIdOn = (holder, n, why) =>
  new RegExp(`^(?:.*; )?${holder}/J${n} no-id requests/(?:archive/)?${NAME}/spec\\.md: ${esc(why)}(?:;.*)?$`);
const NO_ID_ON = `requests/(?:archive/)?${NAME}/spec\\.md`;

// A request (path 1d, R1 signed) whose change spec ends with an unmarked block
// after SP-9. Committed.
function strayRequest(dir, name = NAME) {
  openRequest(dir, name, [['SP-1 plan', 'One PR.'], ['SP-9 plan', 'Two steps.']], { tier: '1d' });
  write(dir, `${open(name)}/spec.md`, `${read(dir, `${open(name)}/spec.md`)}\n${STRAY}\n`);
  index(dir);
  commitAll(dir, claim(name, '1d'));
}
function strayWorld(t) {
  const dir = world(t, null, { link: false });
  strayRequest(dir);
  const r = check(dir);
  const f = one(noIds(r, open(NAME)), r, `no-id on ${CS}`);
  assert.equal(f.id, '-', `the hint line shows the ID "-":\n${f.line}`);
  assert.equal(fileOf(f), CS, f.line);
  return dir;
}

// No no-id hint at all, and the info judged line names the judgement.
function assertNoIdCleared(dir, when, { holder = NAME, n = 1, why = WHY } = {}) {
  for (const r of checks(dir)) {
    none(coded(r, 'no-id'), r, `no-id ${when}`);
    assert.ok(judgedMatches(r, noIdOn(holder, n, why)), `the info judged line names ${holder}/J${n} ${when}:\n${show(r)}`);
  }
}

// One no-id hint, at the new path, and it names the judgement as stale.
function assertNoIdStale(dir, when, { holder = NAME, n = 1 } = {}) {
  for (const r of checks(dir)) {
    const f = one(coded(r, 'no-id'), r, `no-id ${when}`);
    assert.equal(fileOf(f), ARCHIVED, `the hint is at the new path ${when}:\n${f.line}\n${show(r)}`);
    assert.equal(f.id, '-', f.line);
    const msg = before(f.msg);
    const tail = `; the judgement ${holder}/J${n} (${DAY}) is stale: `;
    const where = msg.lastIndexOf(tail);
    assert.ok(where >= 0, `the hint names ${holder}/J${n} as stale ${when}:\n${f.line}\n${show(r)}`);
    const rest = msg.slice(where + tail.length);
    assert.ok(rest.endsWith(CHANGED), `the message ends with "<what> changed since it" ${when}:\n${f.line}`);
    assert.ok(rest.includes(ARCHIVED), `<what> names the place at the new path ${when}:\n${f.line}`);
    assert.ok(!rest.includes(`${CS}:`), `<what> names no old path ${when}:\n${f.line}`);
    assertNotJudged(r, `${holder}/J${n}`, when);
  }
}

const assertNoIdAudit = (dir, { holder = NAME, id = 'J1', state, why = WHY, when }) =>
  assertAudit(dir, { holder, id, code: 'no-id', on: NO_ID_ON, state, why, when });

describe('#125 a no-id judgement, whose --on is the hint\'s path, holds across the move', () => {
  test('--on requests/share/spec.md clears the hint; after al conclude --yes it stays cleared, the info judged line names it, and the audit says current, before and after the commit of the move', (t) => {
    const dir = strayWorld(t);
    judge(dir, 'no-id', CS, WHY, { name: NAME });
    assertNoIdCleared(dir, 'before the move');
    assertNoIdAudit(dir, { state: CURRENT, when: 'before the move' });
    commitAll(dir, `${NAME}: the judgement J1`);
    concludeHere(dir, { indexed: false });
    assertNoIdCleared(dir, 'after the move, before al index');
    index(dir);
    assertNoIdCleared(dir, 'after the move, before the commit');
    assertNoIdAudit(dir, { state: CURRENT, when: 'after the move, before the commit' });
    commitMove(dir, NAME, '1d');
    assertNoIdCleared(dir, 'after the commit of the move');
    assertNoIdAudit(dir, { state: CURRENT, when: 'after the commit of the move' });
  });

  test('after the move, an edit of the block in the moved change spec: the hint is back at the new path, it names J1 as stale, and the audit agrees; the judged text again clears it', (t) => {
    const dir = strayWorld(t);
    judge(dir, 'no-id', CS, WHY, { name: NAME });
    commitAll(dir, `${NAME}: the judgement J1`);
    concludeHere(dir);
    editFile(dir, ARCHIVED, STRAY, STRAY_B);
    assertNoIdStale(dir, 'after the edit in the working tree');
    assertNoIdAudit(dir, { state: STALE, when: 'after the edit in the working tree' });
    commitMove(dir, NAME, '1d');
    assertNoIdStale(dir, 'after the commit of the edit');
    editFile(dir, ARCHIVED, STRAY_B, STRAY);
    assertNoIdCleared(dir, 'with the judged text back');
  });

  test('the move does not wash a stale no-id judgement: the block edited before the move stays stale at the new path', (t) => {
    const dir = strayWorld(t);
    judge(dir, 'no-id', CS, WHY, { name: NAME });
    commitAll(dir, `${NAME}: the judgement J1`);
    editFile(dir, CS, STRAY, STRAY_B);
    concludeHere(dir);
    assertNoIdStale(dir, 'after the move');
  });

  test('a second unmarked block added after the move gets its own hint at the new path; the judged block stays cleared', (t) => {
    const dir = strayWorld(t);
    judge(dir, 'no-id', CS, WHY, { name: NAME });
    commitAll(dir, `${NAME}: the judgement J1`);
    concludeHere(dir);
    editFile(dir, ARCHIVED, '<!-- SP-1 plan -->\n\nOne PR.\n', '<!-- SP-1 plan -->\n\nOne PR.\n\nA second stray paragraph.\n');
    for (const r of checks(dir)) {
      const f = one(coded(r, 'no-id'), r, 'no-id: the new block');
      assert.equal(fileOf(f), ARCHIVED, f.line);
      assert.ok(f.msg.startsWith('a paragraph with no ID marker, after SP-1'), `the hint is on the new block:\n${f.line}`);
      assert.ok(!f.msg.includes('the judgement '), `the hint names no judgement:\n${f.line}`);
      assert.ok(judgedMatches(r, noIdOn(NAME, 1, WHY)), `the judged block stays cleared:\n${show(r)}`);
    }
  });

  test('only the newest counts across the move: J1 and J2 on one hint: the info judged line names J2, the audit shows J1 as history and J2 as current, before and after the commit', (t) => {
    const dir = strayWorld(t);
    const WHY2 = 'A second look agrees.';
    judge(dir, 'no-id', CS, WHY, { name: NAME });
    judge(dir, 'no-id', CS, WHY2, { name: NAME });
    commitAll(dir, `${NAME}: the judgements J1 and J2`);
    const history = `history: ${NAME}/J2 is newer on the same hint and ID`;
    const read2 = (when) => {
      assertNoIdCleared(dir, when, { n: 2, why: WHY2 });
      for (const r of checks(dir)) assertNotJudged(r, `${NAME}/J1`, when);
      assertNoIdAudit(dir, { id: 'J1', state: history, when });
      assertNoIdAudit(dir, { id: 'J2', state: CURRENT, why: WHY2, when });
    };
    read2('before the move');
    concludeHere(dir);
    read2('after the move, before the commit');
    commitMove(dir, NAME, '1d');
    read2('after the commit of the move');
  });

  test('only the newest counts across the move: J1 on the old text, J2 on the new text; with the old text back in the moved change spec, the hint names J2 as stale, and J1 clears nothing', (t) => {
    const dir = strayWorld(t);
    const WHY2 = 'The edited text is fine too.';
    judge(dir, 'no-id', CS, WHY, { name: NAME });
    editFile(dir, CS, STRAY, STRAY_B);
    judge(dir, 'no-id', CS, WHY2, { name: NAME });
    commitAll(dir, `${NAME}: the judgements J1 and J2`);
    concludeHere(dir);
    assertNoIdCleared(dir, 'after the move', { n: 2, why: WHY2 });
    editFile(dir, ARCHIVED, STRAY_B, STRAY);
    assertNoIdStale(dir, 'with the text of J1 back', { n: 2 });
    assertNoIdAudit(dir, { id: 'J1', state: `history: ${NAME}/J2 is newer on the same hint and ID`, when: 'with the text of J1 back' });
    assertNoIdAudit(dir, { id: 'J2', state: STALE, why: WHY2, when: 'with the text of J1 back' });
  });

  test('a judgement in the record of another open request, on the path of the request that moves: it holds after the move, and the audit says current', (t) => {
    const dir = strayWorld(t);
    const other = 'other';
    openRequest(dir, other, [['OT-1 plan', 'Another plan.']], { tier: '1d' });
    commitAll(dir, claim(other, '1d'));
    judge(dir, 'no-id', CS, WHY, { name: other });
    commitAll(dir, 'The judgement in the record of other');
    assertNoIdCleared(dir, 'before the move', { holder: other });
    concludeHere(dir);
    assertNoIdCleared(dir, 'after the move', { holder: other });
    assertNoIdAudit(dir, { holder: other, state: CURRENT, when: 'after the move' });
  });

  test('another request whose name starts the same (share-two), with the same text: a judgement on share stays on share; the hint on share-two still shows after the move', (t) => {
    const dir = strayWorld(t);
    const two = `${NAME}-two`;
    strayRequest(dir, two);
    judge(dir, 'no-id', CS, WHY, { name: NAME });
    commitAll(dir, `${NAME}: the judgement J1`);
    const hintOnTwo = (when) => {
      for (const r of checks(dir)) {
        const f = one(coded(r, 'no-id'), r, `no-id ${when}`);
        assert.equal(fileOf(f), `${open(two)}/spec.md`, `the one hint is on ${two} ${when}:\n${f.line}\n${show(r)}`);
        assert.ok(!f.msg.includes('the judgement '), `the hint names no judgement:\n${f.line}`);
        assert.ok(judgedMatches(r, noIdOn(NAME, 1, WHY)), `J1 is named ${when}:\n${show(r)}`);
      }
    };
    hintOnTwo('before the move');
    concludeHere(dir);
    hintOnTwo('after the move');
  });

  test('control: a no-id judgement on a path in specs/, recorded by the request that moves, holds across the move', (t) => {
    const dir = world(t, null, { link: false, onMain: (d) => addSpec(d, 'INV-50 note', 'Exports are described below.') });
    openRequest(dir, NAME, [['SP-1 plan', 'One PR.']], { tier: '1d' });
    write(dir, SPEC, `${read(dir, SPEC)}\n${STRAY}\n`);
    index(dir);
    commitAll(dir, claim(NAME, '1d'));
    judge(dir, 'no-id', SPEC, WHY, { name: NAME });
    commitAll(dir, `${NAME}: the judgement J1`);
    const text = `${NAME}/J1 no-id ${SPEC}: ${WHY}`;
    for (const when of ['before the move', 'after the move']) {
      if (when === 'after the move') concludeHere(dir);
      for (const r of checks(dir)) {
        none(coded(r, 'no-id'), r, `no-id ${when}`);
        assert.ok(judgedHas(r, text), `the info judged line names "${text}" ${when}:\n${show(r)}`);
      }
    }
    assertAudit(dir, { code: 'no-id', on: esc(SPEC), state: CURRENT, when: 'after the move' });
  });

  test('control: a no-id judgement of a request already archived at the base is not applied: the hint shows at the archived path and names no judgement, and the audit says "recorded; not checked: the request is archived"', (t) => {
    const dir = strayWorld(t);
    judge(dir, 'no-id', CS, WHY, { name: NAME });
    commitAll(dir, `${NAME}: the judgement J1`);
    concludeHere(dir);
    commitMove(dir, NAME, '1d');
    archivedAtBase(dir);
    const r = check(dir);
    const f = one(coded(r, 'no-id'), r, 'no-id on the archived file');
    assert.equal(fileOf(f), ARCHIVED, f.line);
    assert.ok(!f.msg.includes('the judgement '), `the hint names no judgement:\n${f.line}`);
    assertNotJudged(r, `${NAME}/J1`, 'with the request archived at the base');
    assertNoIdAudit(dir, { state: 'recorded; not checked: the request is archived', when: 'with the request archived at the base' });
  });
});

describe('#125 control: an open request and an archived request with one name: a no-id judgement clears only the hint on its own path', () => {
  // main: share is concluded and archived, with the unmarked block. A new
  // branch copies requests/archive/share/ to requests/share/ by hand, runs
  // al index and commits. So the same text is at both paths, and al check
  // gives two no-id hints.
  function bothFolders(t) {
    const dir = strayWorld(t);
    concludeHere(dir);
    commitMove(dir, NAME, '1d');
    archivedAtBase(dir);
    cpSync(join(dir, archive(NAME)), join(dir, open(NAME)), { recursive: true });
    index(dir);
    commitAll(dir, claim(NAME, '1d'));
    const r = check(dir);
    one(noIds(r, open(NAME)), r, `no-id on ${CS}`);
    one(noIds(r, archive(NAME)), r, `no-id on ${ARCHIVED}`);
    return dir;
  }

  // After a judgement on `on`, the hint on `on` is cleared, the hint on `kept`
  // still shows and names no judgement.
  function onlyOwn(dir, on, keptFolder, clearedFolder, when) {
    for (const r of checks(dir)) {
      none(noIds(r, clearedFolder), r, `no-id on ${clearedFolder} ${when}`);
      const f = one(noIds(r, keptFolder), r, `no-id on ${keptFolder} ${when}`);
      assert.ok(!f.msg.includes('the judgement '), `the hint names no judgement ${when}:\n${f.line}\n${show(r)}`);
      assert.ok(judgedHas(r, `${NAME}/J1 no-id ${on}: ${WHY}`), `the info judged line names J1 on ${on} ${when}:\n${show(r)}`);
    }
  }

  test('--on requests/share/spec.md clears only the hint on that file; the hint on the archived file still shows, also after a commit', (t) => {
    const dir = bothFolders(t);
    judge(dir, 'no-id', CS, WHY, { name: NAME });
    onlyOwn(dir, CS, archive(NAME), open(NAME), 'in the working tree');
    assertAudit(dir, { code: 'no-id', on: esc(CS), state: CURRENT, when: 'in the working tree' });
    commitAll(dir, `${NAME}: the judgement J1`);
    onlyOwn(dir, CS, archive(NAME), open(NAME), 'after a commit');
  });

  test('--on requests/archive/share/spec.md clears only the hint on that file; the hint on the open file still shows, also after a commit', (t) => {
    const dir = bothFolders(t);
    judge(dir, 'no-id', ARCHIVED, WHY, { name: NAME });
    onlyOwn(dir, ARCHIVED, open(NAME), archive(NAME), 'in the working tree');
    assertAudit(dir, { code: 'no-id', on: esc(ARCHIVED), state: CURRENT, when: 'in the working tree' });
    commitAll(dir, `${NAME}: the judgement J1`);
    onlyOwn(dir, ARCHIVED, open(NAME), archive(NAME), 'after a commit');
  });
});
