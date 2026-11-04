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
// - The decision for a hint with an open form: the hint line stays as it was.
//   The finding says what its message is at the open paths. map-consolidation
//   does so, and no-paragraph-link does so too (#128). A judgement on such a
//   hint keeps the hash of the message as shown and the hash of the message at
//   the open paths, when they differ (#128). A judgement compares its hashes
//   with the message as shown and with that open message. So a judgement that
//   was recorded on the open request clears its hint after the move, with no
//   new record. No text that a user wrote is ever read as moved. A hint whose
//   message names a path under its request's folder and that gives no open
//   message goes stale across the move, which is the safe way to fail.
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
// Later decisions, in the last block of tests:
// - No judgement that was current changes state. So a hash of the message with
//   the archive path in it, as an earlier al wrote it after the move, still
//   holds.
// - When a request moved, requests/<name>/<file> and
//   requests/archive/<name>/<file> are two spellings of one path for reading:
//   the judgement pass of `al check` and the audit. So a judgement on the open
//   spelling from before the move still counts, and the newest on either
//   spelling counts. Only a path whose whole text starts at requests/archive/
//   counts as moved. In a message, only the finding's own open message counts,
//   so a message that gains archive/ in any other way is a changed message.
// - `al record` does not read that way (DES-163). After the move, the hint's
//   path is the archive path, so `--on requests/<name>/<file>` is refused, and
//   only the path that the hint line shows is accepted. The record keeps the
//   hash of the message as `al check` shows it, with the archive path in it. On
//   a hint with an open form, it also keeps the hash of the message at the open
//   paths, when they differ (#128).
// - The open spelling counts only for a request that the branch concludes
//   (DES-37). For a request archived at the base, requests/<name>/<file> names
//   no hint, and only the path that the hint line shows does (DES-163).
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
import { cpSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DAY, EPOCH, baseProject, commitAll, doc, editFile, editRecord, git, index, ok, read, record, refused, sha, show, write,
  writeConfig,
} from './helpers/project.js';
import { CS, NAME, SPEC, addSpec, claim, openRequest, world } from './helpers/map-68.js';
import { check, coded, judge, judgedLines, judgementArgs, none, one } from './helpers/judgement-88.js';

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

// A world is built once for this process, and each test gets its own copy, so
// no test shares state with another. What a builder asserts holds for each copy.
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

// Exit 0: a hint is never a not ok. The requirement names al check --strict for
// the main behaviour, so `strict` runs both modes there. Elsewhere one mode
// reads the result.
function checks(dir, { strict = false } = {}) {
  const r = check(dir);
  assert.equal(r.code, 0, show(r));
  if (!strict) return [r];
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
function assertCurrent(dir, when, { name = NAME, holder = name, n = 1, why = WHY, strict } = {}) {
  const runs = checks(dir, { strict });
  for (const r of runs) {
    none(consolidation(r, name), r, `map-consolidation on ${name} ${when}`);
    const text = `${holder}/J${n} map-consolidation ${name}: ${why}`;
    assert.ok(judgedHas(r, text), `an info judged line names "${text}" ${when}:\n${show(r)}`);
  }
  return runs[0];
}

// The hint is back, at the paths of `at`. Its message names the judgement as
// stale. <what> names each of `ids`, or is about the hint's text.
function assertStale(dir, when, { name = NAME, holder = name, n = 1, at = 'archive', ids, text = false, strict } = {}) {
  const runs = checks(dir, { strict });
  for (const r of runs) {
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
  return { r: runs[0], f: one(consolidation(runs[0], name), runs[0], `map-consolidation on ${name} ${when}`) };
}

const closeLine = (dir, name = NAME) => ok(dir, ['record', name, 'close', '--on', 'R1', '--reason', CLOSE, '--yes']);

// al conclude <name> --yes, then al index. `indexed` false leaves out al index.
function concludeHere(dir, { name = NAME, indexed = true } = {}) {
  const r = ok(dir, ['conclude', name, '--yes']);
  assert.ok(r.stdout.startsWith(`Concluded ${name}: `) || r.stdout.includes(`\nConcluded ${name}: `), show(r));
  if (indexed) index(dir);
}
const commitMove = (dir, name = NAME, tier = '2') => commitAll(dir, `Conclude ${name}\n\nTier: ${tier} — ${name}`);

// The base with the branch feature, and no request.
const empty = (t) => copyOf(t, 'empty', (b) => world(b, null, { link: false }));
// share (made on the branch feature), with PARAS. Committed.
const paras = (t) => copyOf(t, 'paras', (b) => world(b, PARAS));
// paras, the open request other, and a close line on R1 of share. Committed.
const closedWithOther = (t) => copyOf(t, 'closedWithOther', (b) => {
  const dir = paras(b);
  openRequest(dir, 'other', [['OT-1 rule serves:R1', 'Another promise that never ends.']]);
  commitAll(dir, claim('other'));
  closeLine(dir);
  commitAll(dir, 'The close line');
  return dir;
});

// share (made on the branch feature), with its hint judged as J1, and a close
// line on R1. Committed.
const judged = (t) => copyOf(t, 'judged', (b) => {
  const dir = paras(b);
  const r = check(dir);
  const f = one(consolidation(r), r, 'map-consolidation before the judgement');
  assert.equal(f.file, CS, show(r));
  judge(dir, 'map-consolidation', NAME, WHY, { name: NAME });
  closeLine(dir);
  commitAll(dir, `${NAME}: the judgement J1`);
  return dir;
});

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
    assertCurrent(dir, 'before the move', { strict: true });
    const j = judgementOf(dir, NAME, 'J1');
    concludeHere(dir, { indexed: false });
    assertCurrent(dir, 'after the move, before al index', { strict: true });
    index(dir);
    assertCurrent(dir, 'after the move and al index, before the commit', { strict: true });
    assertAudit(dir, { state: CURRENT, when: 'before the commit of the move' });
    commitMove(dir);
    assertCurrent(dir, 'after the commit of the move', { strict: true });
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
    assertCurrent(dir, 'before the move', { strict: true });
    concludeHere(dir);
    assertCurrent(dir, 'after the move, before the commit', { strict: true });
    commitMove(dir);
    assertCurrent(dir, 'after the commit of the move', { strict: true });
  });

  test('a judgement in a record that al wrote before this fix holds after the move: its hash is of the plain open message; a different list makes it stale', (t) => {
    const dir = judged(t);
    editRecord(dir, NAME, (rec) => {
      rec.judgements.find((j) => j.id === 'J1').message_sha256 = [RELEASED_MESSAGE_SHA256];
    });
    assertCurrent(dir, 'before the move');
    concludeHere(dir);
    assertCurrent(dir, 'after the move');
    addParagraph(dir, ARCHIVED, SP3);
    assertStale(dir, 'after SP-3 is added', { text: true });
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
    const dir = empty(t);
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
    const dir = closedWithOther(t);
    const other = 'other';
    judge(dir, 'map-consolidation', NAME, WHY, { name: other });
    commitAll(dir, 'The judgement in the record of other');
    assertCurrent(dir, 'before the move', { holder: other });
    concludeHere(dir);
    assertCurrent(dir, 'after the move', { holder: other });
    assertAudit(dir, { holder: other, state: CURRENT, when: 'after the move' });
    editFile(dir, ARCHIVED, T2, T2b);
    assertStale(dir, 'after an edit of SP-2', { holder: other, ids: ['SP-2'] });
  });

  test('a judgement that another open request records after the move, on a message with the archive path: it clears the hint, and an edit of SP-2 makes it stale', (t) => {
    const dir = closedWithOther(t);
    const other = 'other';
    concludeHere(dir);
    judge(dir, 'map-consolidation', NAME, WHY, { name: other });
    assertCurrent(dir, 'after the judgement', { holder: other });
    commitMove(dir);
    assertCurrent(dir, 'after the commit', { holder: other });
    editFile(dir, ARCHIVED, T2, T2b);
    assertStale(dir, 'after an edit of SP-2', { holder: other, ids: ['SP-2'] });
  });

  test('control: a judgement on another hint of the moved request (design-link on SP-2, whose places name the paths) stays current across the move', (t) => {
    const dir = paras(t);
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
    const { f } = assertStale(dir, 'after SP-3 is added in the working tree', { text: true });
    assertAudit(dir, { state: STALE, when: 'after SP-3 is added' });
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
    const { f } = assertStale(dir, 'with SP-2 a plan', { text: true });
    assert.ok(!names(before(f.msg).split('; the judgement')[0], 'SP-2'), `the message does not name SP-2:\n${f.line}`);
  });

  test('a named paragraph SP-1 changes in the moved change spec: the hint is back at the new paths, <what> names SP-1; the judged text again clears it', (t) => {
    const dir = judged(t);
    concludeHere(dir);
    editFile(dir, ARCHIVED, T1, T1b);
    assertStale(dir, 'after the edit of SP-1 in the working tree', { ids: ['SP-1'], strict: true });
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
    assertNotJudged(assertCurrent(dir, 'after the move', { n: 2, why: WHY2 }), `${NAME}/J1`, 'after the move');
    assertAudit(dir, { id: 'J1', state: `history: ${NAME}/J2 is newer on the same hint and ID`, when: 'after the move' });
    assertAudit(dir, { id: 'J2', state: CURRENT, why: WHY2, when: 'after the move' });
    write(dir, ARCHIVED, shorter);
    const { r } = assertStale(dir, 'with the list of J1 back', { n: 2, text: true });
    assert.ok(!r.stdout.includes(`${NAME}/J1 (`), `no line names J1 as stale:\n${show(r)}`);
  });

  test('control: with no judgement, the hint after the move keeps its wording and names the new paths', (t) => {
    const dir = paras(t);
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
    const dir = paras(t);
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
const strayWorld = (t) => copyOf(t, 'stray', (b) => {
  const dir = empty(b);
  strayRequest(dir);
  const r = check(dir);
  const f = one(noIds(r, open(NAME)), r, `no-id on ${CS}`);
  assert.equal(f.id, '-', `the hint line shows the ID "-":\n${f.line}`);
  assert.equal(fileOf(f), CS, f.line);
  return dir;
});
// strayWorld, with the hint judged as share/J1. Committed.
const strayJudged = (t) => copyOf(t, 'strayJudged', (b) => {
  const dir = strayWorld(b);
  judge(dir, 'no-id', CS, WHY, { name: NAME });
  commitAll(dir, `${NAME}: the judgement J1`);
  return dir;
});
// The open request other, on path 1d. Committed.
const OTHER = 'other';
function otherPlan(dir) {
  openRequest(dir, OTHER, [['OT-1 plan', 'Another plan.']], { tier: '1d' });
  commitAll(dir, claim(OTHER, '1d'));
}
const strayWithOther = (t) => copyOf(t, 'strayWithOther', (b) => {
  const dir = strayWorld(b);
  otherPlan(dir);
  return dir;
});

// No no-id hint at all, and the info judged line names the judgement.
function assertNoIdCleared(dir, when, { holder = NAME, n = 1, why = WHY } = {}) {
  const [r] = checks(dir);
  none(coded(r, 'no-id'), r, `no-id ${when}`);
  assert.ok(judgedMatches(r, noIdOn(holder, n, why)), `the info judged line names ${holder}/J${n} ${when}:\n${show(r)}`);
  return r;
}

// One no-id hint, at `file` (the new path by default), and it names the
// judgement as stale.
function assertNoIdStale(dir, when, { holder = NAME, n = 1, file = ARCHIVED, day = DAY } = {}) {
  const [r] = checks(dir);
  const f = one(coded(r, 'no-id'), r, `no-id ${when}`);
  assert.equal(fileOf(f), file, `the hint is at ${file} ${when}:\n${f.line}\n${show(r)}`);
  assert.equal(f.id, '-', f.line);
  const msg = before(f.msg);
  const tail = `; the judgement ${holder}/J${n} (${day}) is stale: `;
  const where = msg.lastIndexOf(tail);
  assert.ok(where >= 0, `the hint names ${holder}/J${n} as stale ${when}:\n${f.line}\n${show(r)}`);
  const rest = msg.slice(where + tail.length);
  assert.ok(rest.endsWith(CHANGED), `the message ends with "<what> changed since it" ${when}:\n${f.line}`);
  assert.ok(rest.includes(`${file}:`), `<what> names the place in ${file} ${when}:\n${f.line}`);
  if (file === ARCHIVED) assert.ok(!rest.includes(`${CS}:`), `<what> names no old path ${when}:\n${f.line}`);
  assertNotJudged(r, `${holder}/J${n}`, when);
  return f;
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
    const dir = strayJudged(t);
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
    const dir = strayJudged(t);
    editFile(dir, CS, STRAY, STRAY_B);
    concludeHere(dir);
    assertNoIdStale(dir, 'after the move');
  });

  // `--on` names the file, so J1 covers each no-id hint of that file. A second
  // unmarked block makes J1 stale on its hint (DES-163: a judgement that is
  // stale on one of its hints is not current). The first block stays cleared.
  const SECOND = ['<!-- SP-1 plan -->\n\nOne PR.\n', '<!-- SP-1 plan -->\n\nOne PR.\n\nA second stray paragraph.\n'];
  function secondBlock(dir, file) {
    editFile(dir, file, ...SECOND);
    const f = assertNoIdStale(dir, 'with a second unmarked block', { file });
    assert.ok(f.msg.startsWith('a paragraph with no ID marker, after SP-1'), `the one hint is on the second block, so the first stays cleared:\n${f.line}`);
    assertNoIdAudit(dir, { state: STALE, when: 'with a second unmarked block' });
    return f.line;
  }

  test('control: on the open request, with no move, a second unmarked block gets a hint that names J1 as stale, no info judged line names J1, and the first block stays cleared', (t) => {
    const dir = strayJudged(t);
    assertNoIdCleared(dir, 'with one block');
    secondBlock(dir, CS);
  });

  test('a second unmarked block added after the move gives the same as on the open request, at the new path: one hint, which names J1 as stale, no info judged line for J1, and the first block stays cleared', (t) => {
    const dir = strayJudged(t);
    concludeHere(dir);
    assertNoIdCleared(dir, 'after the move, with one block');
    const moved = secondBlock(dir, ARCHIVED);

    const ctl = strayJudged(t);
    const opened = secondBlock(ctl, CS);
    assert.equal(moved, opened.replaceAll(`${open(NAME)}/`, `${archive(NAME)}/`), 'the hint line of the open request, at the new paths');
  });

  test('only the newest counts across the move: J1 and J2 on one hint: the info judged line names J2, the audit shows J1 as history and J2 as current, before and after the commit', (t) => {
    const dir = strayWorld(t);
    const WHY2 = 'A second look agrees.';
    judge(dir, 'no-id', CS, WHY, { name: NAME });
    judge(dir, 'no-id', CS, WHY2, { name: NAME });
    commitAll(dir, `${NAME}: the judgements J1 and J2`);
    const history = `history: ${NAME}/J2 is newer on the same hint and ID`;
    const read2 = (when) => {
      assertNotJudged(assertNoIdCleared(dir, when, { n: 2, why: WHY2 }), `${NAME}/J1`, when);
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
    const dir = strayWithOther(t);
    const other = OTHER;
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
    const dir = strayJudged(t);
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
  const bothFolders = (t) => copyOf(t, 'bothFolders', (b) => {
    const dir = strayWorld(b);
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
  });

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

describe('#125 the two spellings of a moved path, and judgements in another open request', () => {
  const WHY2 = 'Looked at again after the move.';

  // The fixed text is what al printed before this fix. The line carries nothing
  // new, before or after the move.
  const LINE_OPEN = 'hint map-consolidation requests/share/spec.md share 2 change paragraphs that go into specs/ have no current consolidation judgement: SP-1, SP-2; judge each consolidation in requests/share/review.md · places: share/SP-1 requests/share/spec.md:3, share/SP-2 requests/share/spec.md:7';
  const LINE_ARCHIVE = 'hint map-consolidation requests/archive/share/spec.md share 2 change paragraphs that go into specs/ have no current consolidation judgement: SP-1, SP-2; judge each consolidation in requests/archive/share/review.md · places: share/SP-1 requests/archive/share/spec.md:3, share/SP-2 requests/archive/share/spec.md:7';
  const namesTheCode = (r) => r.stdout.split('\n').filter((l) => l.includes('map-consolidation') && !l.startsWith('ok: '));
  test('the hint line is the same as before this fix: with no judgement, the whole hint map-consolidation line is the fixed text, before and after the move, and after the move no output line names the open path', (t) => {
    const dir = paras(t);
    closeLine(dir);
    commitAll(dir, 'The close line');
    for (const args of [[], ['--strict']]) {
      const r = check(dir, ...args);
      assert.deepEqual(namesTheCode(r), [LINE_OPEN], `the line at the open path:\n${show(r)}`);
    }
    concludeHere(dir);
    for (const args of [[], ['--strict']]) {
      const r = check(dir, ...args);
      assert.deepEqual(namesTheCode(r), [LINE_ARCHIVE], `the line at the archive path:\n${show(r)}`);
      assert.deepEqual(r.stdout.split('\n').filter((l) => l.includes(`${open(NAME)}/`)), [], `no line names the open path:\n${show(r)}`);
    }
  });

  // The keys were read from a run of the code before this fix.
  const JUDGEMENT_KEYS = ['hint', 'id', 'keeps', 'message_sha256', 'on', 'reason', 'recorded'];
  test('the record holds no new field: a map-consolidation judgement recorded before the move, and one recorded after it by another open request, have exactly the keys of a record before this fix, also after the move', (t) => {
    const dir = closedWithOther(t);
    judge(dir, 'map-consolidation', NAME, WHY, { name: NAME });
    assert.deepEqual(Object.keys(judgementOf(dir, NAME, 'J1')).sort(), JUDGEMENT_KEYS, 'before the move');
    commitAll(dir, `${NAME}: the judgement J1`);
    concludeHere(dir);
    assert.deepEqual(Object.keys(judgementOf(dir, NAME, 'J1')).sort(), JUDGEMENT_KEYS, 'after the move');
    judge(dir, 'map-consolidation', NAME, WHY2, { name: OTHER });
    assert.deepEqual(Object.keys(judgementOf(dir, OTHER, 'J1')).sort(), JUDGEMENT_KEYS, 'recorded after the move');
  });

  test('an older record: the hash in another open request is of the message with the archive path, as al check shows it: the judgement stays current, and a different list still makes it stale', (t) => {
    const dir = closedWithOther(t);
    concludeHere(dir);
    const r = check(dir);
    const msg = before(one(consolidation(r), r, 'map-consolidation after the move').msg);
    assert.ok(msg.includes(`${archive(NAME)}/review.md`), `the message names the archive path:\n${msg}`);
    assert.ok(!msg.includes('the judgement '), `the message has no stale text:\n${msg}`);
    judge(dir, 'map-consolidation', NAME, WHY, { name: OTHER });
    editRecord(dir, OTHER, (rec) => {
      rec.judgements.find((j) => j.id === 'J1').message_sha256 = [sha(msg)];
    });
    assertCurrent(dir, 'with the older hash', { holder: OTHER });
    assertAudit(dir, { holder: OTHER, state: CURRENT, when: 'with the older hash' });
    commitMove(dir);
    assertCurrent(dir, 'with the older hash, after the commit', { holder: OTHER });
    addParagraph(dir, ARCHIVED, SP3);
    assertStale(dir, 'with the older hash, after SP-3 is added', { holder: OTHER, text: true });
  });

  // The clock of a test run is fixed, and with one stamp al takes share/J1 as
  // the newer one. So the later judgement is recorded with a clock one day
  // later (SOURCE_DATE_EPOCH, which al reads for its stamps). The record is not
  // edited.
  test('newest wins across the two spellings: share/J1 on requests/share/spec.md before the move, a later other/J1 on requests/archive/share/spec.md after it: the audit shows share/J1 as history and other/J1 as current; the later one is what goes stale', (t) => {
    const dir = strayWithOther(t);
    judge(dir, 'no-id', CS, WHY, { name: NAME });
    commitAll(dir, `${NAME}: the judgement J1`);
    concludeHere(dir);
    assertNoIdCleared(dir, 'after the move, with share/J1');
    ok(dir, judgementArgs('no-id', ARCHIVED, WHY2, { name: OTHER }), { env: { SOURCE_DATE_EPOCH: String(EPOCH + 86400) } });
    const read2 = (when) => {
      assertNotJudged(assertNoIdCleared(dir, when, { holder: OTHER, why: WHY2 }), `${NAME}/J1`, when);
      assertNoIdAudit(dir, { state: `history: ${OTHER}/J1 is newer on the same hint and ID`, when });
      assertNoIdAudit(dir, { holder: OTHER, state: CURRENT, why: WHY2, when });
    };
    read2('after the later judgement');
    commitMove(dir, NAME, '1d');
    read2('after the commit');
    editFile(dir, ARCHIVED, STRAY, STRAY_B);
    assertNoIdStale(dir, 'after an edit of the block', { holder: OTHER, day: '2026-05-05' });
  });

  // From review. An older judgement is history (DES-163). A fix of the hint does
  // not undo the later judgement, also across the two spellings of a moved path.
  test('history holds when the hint is fixed: share/J1 on the open spelling, a later other/J1 on the archive spelling, then the block removed from the moved change spec: share/J1 is still history, and other/J1 says "no hint now"', (t) => {
    const dir = strayWithOther(t);
    judge(dir, 'no-id', CS, WHY, { name: NAME });
    commitAll(dir, `${NAME}: the judgement J1`);
    concludeHere(dir);
    ok(dir, judgementArgs('no-id', ARCHIVED, WHY2, { name: OTHER }), { env: { SOURCE_DATE_EPOCH: String(EPOCH + 86400) } });
    const history = `history: ${OTHER}/J1 is newer on the same hint and ID`;
    assertNoIdAudit(dir, { state: history, when: 'after the later judgement' });
    editFile(dir, ARCHIVED, `\n${STRAY}\n`, '');
    index(dir);
    const [r] = checks(dir);
    none(coded(r, 'no-id'), r, 'no-id with the block removed');
    assertNoIdAudit(dir, { state: history, when: 'with the block removed' });
    assertNoIdAudit(dir, { holder: OTHER, state: `no hint now: al check gives no no-id hint on ${NO_ID_ON}`, why: WHY2, when: 'with the block removed' });
  });

  // From review. The audit agrees with al check on history for a hint with no
  // ID and no line. Such a judgement keeps the message and its paragraphs, and no
  // blocks. The two spellings of a moved path name one hint there too.
  test('history for a hint with no ID and no line: a result hint at a file of the moved request: share/J1 on the open path holds after the move; a later other/J1 on the archive path is the only current one, and the audit shows share/J1 as history', (t) => {
    const resultAt = (name) => `${name}/results/missing-check.yaml`;
    const OPEN_RESULT = resultAt(open(NAME));
    const ARCHIVE_RESULT = resultAt(archive(NAME));
    const dir = empty(t);
    writeConfig(dir, undefined, { results: `${open(NAME)}/results` });
    openRequest(dir, NAME, [['SP-1 plan', 'One PR.']], { tier: '1d' });
    write(dir, OPEN_RESULT, 'outcome: pass\ncommit: unknown\n');
    index(dir);
    commitAll(dir, claim(NAME, '1d'));
    otherPlan(dir);
    const first = check(dir);
    const f = one(coded(first, 'result', '-'), first, `result at ${OPEN_RESULT}`);
    assert.equal(fileOf(f), OPEN_RESULT, show(first));

    judge(dir, 'result', OPEN_RESULT, WHY, { name: NAME });
    const j = judgementOf(dir, NAME, 'J1');
    assert.ok('message_sha256' in j && 'keeps' in j, `J1 keeps the message and its paragraphs:\n${JSON.stringify(j)}`);
    assert.ok(!('blocks' in j), `J1 keeps no blocks:\n${JSON.stringify(j)}`);
    commitAll(dir, `${NAME}: the judgement J1`);

    ok(dir, ['conclude', NAME, '--yes']);
    writeConfig(dir, undefined, { results: `${archive(NAME)}/results` });
    index(dir);
    const moved = check(dir);
    none(coded(moved, 'result', '-'), moved, 'result after the move');
    assert.ok(judgedHas(moved, `${NAME}/J1 result ${OPEN_RESULT}: ${WHY}`), `share/J1 still clears the hint:\n${show(moved)}`);

    ok(dir, judgementArgs('result', ARCHIVE_RESULT, WHY2, { name: OTHER }), { env: { SOURCE_DATE_EPOCH: String(EPOCH + 86400) } });
    const later = check(dir);
    none(coded(later, 'result', '-'), later, 'result after the later judgement');
    assert.ok(judgedHas(later, `${OTHER}/J1 result ${ARCHIVE_RESULT}: ${WHY2}`), `al check names other/J1:\n${show(later)}`);
    assertNotJudged(later, `${NAME}/J1`, 'after the later judgement');
    assertAudit(dir, { code: 'result', on: esc(OPEN_RESULT), state: `history: ${OTHER}/J1 is newer on the same hint and ID`, when: 'after the later judgement' });
    assertAudit(dir, { holder: OTHER, code: 'result', on: esc(ARCHIVE_RESULT), state: CURRENT, why: WHY2, when: 'after the later judgement' });
  });

  // Rule: only a path that starts at requests/archive/ counts as moved. The two
  // files are spec docs through `docs:` in the config, under the root specs/,
  // and each holds the same unmarked block, so only the path tells them apart.
  const LOOK_OPEN = `specs/${open(NAME)}/notes.md`;
  const LOOK_ARCHIVE = `specs/${archive(NAME)}/notes.md`;
  const lookAlike = (t) => copyOf(t, 'lookAlike', (b) => {
    const dir = world(b, null, {
      link: false,
      onMain: (d) => {
        writeConfig(d, [{ file: SPEC, prefix: 'INV' }, { file: LOOK_OPEN, prefix: 'NA' }, { file: LOOK_ARCHIVE, prefix: 'NB' }]);
        write(d, LOOK_OPEN, doc([['NA-1 note', '# Notes']]));
        write(d, LOOK_ARCHIVE, doc([['NB-1 note', '# Notes']]));
      },
    });
    openRequest(dir, NAME, [['SP-1 plan', 'One PR.']], { tier: '1d' });
    otherPlan(dir);
    for (const file of [LOOK_OPEN, LOOK_ARCHIVE]) write(dir, file, `${read(dir, file)}\n${STRAY}\n`);
    index(dir);
    commitAll(dir, claim(NAME, '1d'));
    const r = check(dir);
    for (const file of [LOOK_OPEN, LOOK_ARCHIVE]) {
      one(coded(r, 'no-id').filter((f) => fileOf(f) === file), r, `no-id on ${file}`);
    }
    return dir;
  });
  // The hint on `on` is cleared, and the one on `kept` shows and names no judgement.
  function onlyThisFile(dir, on, kept, holder, when) {
    for (const r of checks(dir)) {
      const f = one(coded(r, 'no-id'), r, `no-id ${when}`);
      assert.equal(fileOf(f), kept, `the one hint is on ${kept} ${when}:\n${f.line}\n${show(r)}`);
      assert.ok(!f.msg.includes('the judgement '), `the hint names no judgement ${when}:\n${f.line}`);
      assert.ok(judgedHas(r, `${holder}/J1 no-id ${on}: ${WHY}`), `the info judged line names ${holder}/J1 on ${on} ${when}:\n${show(r)}`);
    }
  }

  for (const [on, kept] of [[LOOK_OPEN, LOOK_ARCHIVE], [LOOK_ARCHIVE, LOOK_OPEN]]) {
    test(`a path that only looks like the archive: --on ${on} clears only that hint, before and after share moves, with the judgement in the moved request`, (t) => {
      const dir = lookAlike(t);
      judge(dir, 'no-id', on, WHY, { name: NAME });
      commitAll(dir, `${NAME}: the judgement J1`);
      onlyThisFile(dir, on, kept, NAME, 'before the move');
      concludeHere(dir);
      onlyThisFile(dir, on, kept, NAME, 'after the move');
      commitMove(dir, NAME, '1d');
      onlyThisFile(dir, on, kept, NAME, 'after the commit of the move');
    });

    test(`a path that only looks like the archive: --on ${on} recorded after the move by another open request clears only that hint`, (t) => {
      const dir = lookAlike(t);
      concludeHere(dir);
      judge(dir, 'no-id', on, WHY, { name: OTHER });
      onlyThisFile(dir, on, kept, OTHER, 'after the judgement');
    });
  }

  test('a path that only looks like the archive: a judgement on each file: both hints clear, and neither judgement is the history of the other', (t) => {
    const dir = lookAlike(t);
    concludeHere(dir);
    judge(dir, 'no-id', LOOK_OPEN, WHY, { name: OTHER });
    judge(dir, 'no-id', LOOK_ARCHIVE, WHY2, { name: OTHER });
    for (const r of checks(dir)) {
      none(coded(r, 'no-id'), r, 'no-id with a judgement on each file');
      assert.ok(judgedHas(r, `${OTHER}/J1 no-id ${LOOK_OPEN}: ${WHY}`), show(r));
      assert.ok(judgedHas(r, `${OTHER}/J2 no-id ${LOOK_ARCHIVE}: ${WHY2}`), show(r));
    }
    assertAudit(dir, { holder: OTHER, id: 'J1', code: 'no-id', on: esc(LOOK_OPEN), state: CURRENT, when: 'with a judgement on each file' });
    assertAudit(dir, { holder: OTHER, id: 'J2', code: 'no-id', on: esc(LOOK_ARCHIVE), state: CURRENT, why: WHY2, when: 'with a judgement on each file' });
  });

  test(`recording after the move, by another open request, on the no-id hint of the moved file: --on ${ARCHIVED}, the path that the hint line shows, is accepted and clears the hint; an edit of the block makes it stale`, (t) => {
    const dir = strayWithOther(t);
    concludeHere(dir);
    const r = check(dir);
    assert.equal(fileOf(one(coded(r, 'no-id'), r, 'no-id after the move')), ARCHIVED, show(r));
    judge(dir, 'no-id', ARCHIVED, WHY, { name: OTHER });
    assertNoIdCleared(dir, 'after the judgement', { holder: OTHER });
    assertNoIdAudit(dir, { holder: OTHER, state: CURRENT, when: 'after the judgement' });
    commitMove(dir, NAME, '1d');
    assertNoIdCleared(dir, 'after the commit', { holder: OTHER });
    editFile(dir, ARCHIVED, STRAY, STRAY_B);
    assertNoIdStale(dir, 'after an edit of the block', { holder: OTHER });
  });

  test(`recording after the move, by another open request, on the no-id hint of the moved file: --on ${CS} is refused, with exit 2 and nothing written: al check gives no such hint now; the hint stays`, (t) => {
    const dir = strayWithOther(t);
    concludeHere(dir);
    const stays = (when) => {
      for (const r of checks(dir)) {
        const f = one(coded(r, 'no-id'), r, `no-id ${when}`);
        assert.equal(fileOf(f), ARCHIVED, `the hint is at the new path ${when}:\n${f.line}\n${show(r)}`);
        assert.ok(!f.msg.includes('the judgement '), `the hint names no judgement ${when}:\n${f.line}`);
        assertNotJudged(r, `${OTHER}/J1`, when);
      }
    };
    stays('before the attempt');
    const r = refused(dir, judgementArgs('no-id', CS, WHY, { name: OTHER }));
    assert.match(r.stdout, new RegExp(`al check gives no no-id hint on ${esc(CS)} now`), show(r));
    stays('after the refusal');
  });

  test('recording after the move, by another open request, on the map-consolidation hint of the moved request: the record keeps two hashes, in this order: the sha256 of the message as al check shows it, with the archive path in it, and the sha256 of the same message at the open path; and the hint clears', (t) => {
    const dir = closedWithOther(t);
    concludeHere(dir);
    const r = check(dir);
    const msg = before(one(consolidation(r), r, 'map-consolidation after the move').msg);
    assert.ok(msg.includes(`${archive(NAME)}/review.md`), `the message names the archive path:\n${msg}`);
    judge(dir, 'map-consolidation', NAME, WHY, { name: OTHER });
    const openMsg = msg.replaceAll(`${archive(NAME)}/`, `${open(NAME)}/`);
    assert.notEqual(openMsg, msg, `the open form differs from the message as shown:\n${msg}`);
    assert.deepEqual(judgementOf(dir, OTHER, 'J1').message_sha256, [sha(msg), sha(openMsg)], `the sha256 of the message as shown, then of the same message at the open path:\n${msg}`);
    assertCurrent(dir, 'after the judgement', { holder: OTHER });
    assertAudit(dir, { holder: OTHER, state: CURRENT, when: 'after the judgement' });
  });

  // From review. A path counts as moved only when the whole path starts at
  // requests/archive/. Here the first folder is "notes requests", whose name
  // holds a space. The reader of findings in the helpers splits a line at a
  // space, so these tests read the hint lines as text.
  const SPACED_OPEN = `notes ${open(NAME)}/copy.md`;
  const SPACED_ARCHIVE = `notes ${archive(NAME)}/copy.md`;
  const noIdLines = (r) => r.stdout.split('\n').filter((l) => l.startsWith('hint no-id '));
  const spaced = (t) => copyOf(t, 'spaced', (b) => {
    const dir = world(b, null, {
      link: false,
      onMain: (d) => {
        writeConfig(d, [{ file: SPEC, prefix: 'INV' }, { file: SPACED_OPEN, prefix: 'NA' }, { file: SPACED_ARCHIVE, prefix: 'NB' }]);
        write(d, SPACED_OPEN, doc([['NA-1 note', '# Notes']]));
        write(d, SPACED_ARCHIVE, doc([['NB-1 note', '# Notes']]));
      },
    });
    openRequest(dir, NAME, [['SP-1 plan', 'One PR.']], { tier: '1d' });
    for (const file of [SPACED_OPEN, SPACED_ARCHIVE]) write(dir, file, `${read(dir, file)}\n${STRAY}\n`);
    index(dir);
    commitAll(dir, claim(NAME, '1d'));
    assert.equal(noIdLines(check(dir)).length, 2, 'two no-id hints before the judgement');
    return dir;
  });
  for (const [on, kept] of [[SPACED_OPEN, SPACED_ARCHIVE], [SPACED_ARCHIVE, SPACED_OPEN]]) {
    test(`a folder with a space in front of the path never moved: --on "${on}" clears only that hint, before and after share moves`, (t) => {
      const dir = spaced(t);
      judge(dir, 'no-id', on, WHY, { name: NAME });
      commitAll(dir, `${NAME}: the judgement J1`);
      const onlyThis = (when) => {
        for (const r of checks(dir)) {
          const lines = noIdLines(r);
          assert.equal(lines.length, 1, `one no-id hint, on "${kept}" ${when}:\n${show(r)}`);
          assert.ok(lines[0].startsWith(`hint no-id ${kept}:`), `the hint is on "${kept}" ${when}:\n${lines[0]}`);
          assert.ok(!lines[0].includes('the judgement '), `the hint names no judgement ${when}:\n${lines[0]}`);
          assert.ok(judgedHas(r, `${NAME}/J1 no-id ${on}: ${WHY}`), `the info judged line names J1 on "${on}" ${when}:\n${show(r)}`);
        }
      };
      onlyThis('before the move');
      concludeHere(dir);
      onlyThis('after the move');
    });
  }

  // From review. A changed message makes the judgement stale (DES-163). Only
  // the finding's own open message counts. A hint of this code gives none, so
  // nothing in its message reads as moved, also when the token only gains
  // archive/.
  for (const [from, to] of [
    [`${open(NAME)}/missing/**`, `${archive(NAME)}/missing/**`],
    [`notes?${open(NAME)}/missing/**`, `notes?${archive(NAME)}/missing/**`],
  ]) {
    test(`a message that gains archive/ on a path that did not move is a changed message: the files token ${from} of INV-41 becomes ${to}: scope-no-file comes back, it names share/J1 as stale, and the audit agrees`, (t) => {
      const dir = world(t, null, {
        link: false,
        onMain: (d) => editFile(d, SPEC, '<!-- INV-41 rule -->', `<!-- INV-41 rule files:${from} -->`),
      });
      openRequest(dir, NAME, [['SP-1 plan', 'One PR.']], { tier: '1d' });
      commitAll(dir, claim(NAME, '1d'));
      const first = check(dir);
      assert.ok(one(coded(first, 'scope-no-file', 'INV-41'), first, 'scope-no-file on INV-41').msg.includes(from), show(first));
      judge(dir, 'scope-no-file', 'INV-41', WHY, { name: NAME });
      commitAll(dir, `${NAME}: the judgement J1`);
      concludeHere(dir);
      const text = `${NAME}/J1 scope-no-file INV-41: ${WHY}`;
      for (const r of checks(dir)) {
        none(coded(r, 'scope-no-file', 'INV-41'), r, 'scope-no-file after the move, with the message unchanged');
        assert.ok(judgedHas(r, text), `the info judged line names "${text}" after the move:\n${show(r)}`);
      }
      assertAudit(dir, { code: 'scope-no-file', on: 'INV-41', state: CURRENT, when: 'after the move' });
      editFile(dir, SPEC, `files:${from}`, `files:${to}`);
      for (const r of checks(dir)) {
        const f = one(coded(r, 'scope-no-file', 'INV-41'), r, 'scope-no-file after the edit of the files token');
        const msg = before(f.msg);
        assert.ok(msg.includes(to), `the message names the new token:\n${f.line}`);
        assert.ok(msg.endsWith(`; the judgement ${NAME}/J1 (${DAY}) is stale: ${HINT_TEXT}${CHANGED}`), `it names ${NAME}/J1 as stale, and the text is the reason:\n${f.line}\n${show(r)}`);
        assertNotJudged(r, `${NAME}/J1`, 'after the edit of the files token');
      }
      assertAudit(dir, { code: 'scope-no-file', on: 'INV-41', state: STALE, when: 'after the edit of the files token' });
    });
  }

  // From review. A target in a marker is text that a user wrote, so it is never
  // read as moved, with or without .md at its end. A scope-no-file variant on a
  // change paragraph is left out: al gave no such hint on a change paragraph of
  // the kinds plan, rule, data, component and approach.
  for (const [what, tail] of [['a malformed ID that looks like a path', 'INV-41'], ['a target that ends in .md', 'INV-41.md']]) {
    test(`${what} is not a moved path: unresolved-link on requests/share/${tail} holds across the move; the target changed to requests/archive/share/${tail} in the moved change spec makes J1 stale, and the audit agrees`, (t) => {
      const from = `${open(NAME)}/${tail}`;
      const to = `${archive(NAME)}/${tail}`;
      const on = `${NAME}/SP-1`;
      const dir = empty(t);
      openRequest(dir, NAME, [[`SP-1 plan builds-on:${from}`, 'One PR.']], { tier: '1d' });
      commitAll(dir, claim(NAME, '1d'));
      const first = check(dir);
      assert.ok(one(coded(first, 'unresolved-link', on), first, `unresolved-link on ${on}`).msg.startsWith(`${from}: no such ID`), show(first));
      judge(dir, 'unresolved-link', on, WHY, { name: NAME });
      commitAll(dir, `${NAME}: the judgement J1`);
      concludeHere(dir);
      const text = `${NAME}/J1 unresolved-link ${on}: ${WHY}`;
      for (const r of checks(dir)) {
        none(coded(r, 'unresolved-link', on), r, 'unresolved-link after the move, with the message unchanged');
        assert.ok(judgedHas(r, text), `the info judged line names "${text}" after the move:\n${show(r)}`);
      }
      assertAudit(dir, { code: 'unresolved-link', on: esc(on), state: CURRENT, when: 'after the move' });
      editFile(dir, ARCHIVED, `builds-on:${from}`, `builds-on:${to}`);
      for (const r of checks(dir)) {
        const f = one(coded(r, 'unresolved-link', on), r, 'unresolved-link after the edit of the target');
        const msg = before(f.msg);
        assert.ok(msg.startsWith(`${to}: no such ID`), `the message names the new target:\n${f.line}`);
        assert.ok(msg.endsWith(`; the judgement ${NAME}/J1 (${DAY}) is stale: ${HINT_TEXT}${CHANGED}`), `it names ${NAME}/J1 as stale, and the text is the reason:\n${f.line}\n${show(r)}`);
        assertNotJudged(r, `${NAME}/J1`, 'after the edit of the target');
      }
      assertAudit(dir, { code: 'unresolved-link', on: esc(on), state: STALE, when: 'after the edit of the target' });
    });
  }

  // From review. A hint whose ID is a path is not a hint with no ID. Two such
  // IDs that differ only by the archive path are two hints, so the audit agrees
  // with al check, also after the move.
  test('the audit agrees with al check: design-doc hints on requests/share/missing.md and requests/archive/share/missing.md are two hints: after the move, both judgements are current, and neither is the history of the other', (t) => {
    const OPEN_ID = `${open(NAME)}/missing.md`;
    const ARCHIVE_ID = `${archive(NAME)}/missing.md`;
    const WHY_OPEN = 'The first document comes later.';
    const WHY_ARCHIVE = 'The second document comes later.';
    const dir = empty(t);
    openRequest(dir, NAME, [['SP-1 plan', 'One PR.']], { tier: '1d' });
    openRequest(dir, OTHER, [['OT-1 plan', 'Another plan.']], { tier: '1d' });
    const md = `${open(OTHER)}/request.md`;
    editFile(dir, md, '## Organized requirement', `Design: ${OPEN_ID}\nDesign: ${ARCHIVE_ID}\n\n## Organized requirement`);
    index(dir);
    commitAll(dir, claim(NAME, '1d'));
    const r = check(dir);
    for (const id of [OPEN_ID, ARCHIVE_ID]) one(coded(r, 'design-doc', id), r, `design-doc on ${id}`);
    judge(dir, 'design-doc', OPEN_ID, WHY_OPEN, { name: OTHER });
    judge(dir, 'design-doc', ARCHIVE_ID, WHY_ARCHIVE, { name: OTHER });
    index(dir);
    const agree = (when) => {
      for (const x of checks(dir)) {
        none(coded(x, 'design-doc'), x, `design-doc ${when}`);
        assert.ok(judgedHas(x, `${OTHER}/J1 design-doc ${OPEN_ID}: ${WHY_OPEN}`), `al check names J1 ${when}:\n${show(x)}`);
        assert.ok(judgedHas(x, `${OTHER}/J2 design-doc ${ARCHIVE_ID}: ${WHY_ARCHIVE}`), `al check names J2 ${when}:\n${show(x)}`);
      }
      assertAudit(dir, { holder: OTHER, id: 'J1', code: 'design-doc', on: esc(OPEN_ID), state: CURRENT, why: WHY_OPEN, when });
      assertAudit(dir, { holder: OTHER, id: 'J2', code: 'design-doc', on: esc(ARCHIVE_ID), state: CURRENT, why: WHY_ARCHIVE, when });
    };
    agree('before the move');
    concludeHere(dir);
    agree('after the move');
    // Both hints fixed: each judgement says "no hint now", and neither is history.
    editFile(dir, md, `Design: ${OPEN_ID}\nDesign: ${ARCHIVE_ID}\n\n`, '');
    index(dir);
    const [fixed] = checks(dir);
    none(coded(fixed, 'design-doc'), fixed, 'design-doc with both hints fixed');
    assertAudit(dir, { holder: OTHER, id: 'J1', code: 'design-doc', on: esc(OPEN_ID), state: `no hint now: al check gives no design-doc hint on ${esc(OPEN_ID)}`, why: WHY_OPEN, when: 'with both hints fixed' });
    assertAudit(dir, { holder: OTHER, id: 'J2', code: 'design-doc', on: esc(ARCHIVE_ID), state: `no hint now: al check gives no design-doc hint on ${esc(ARCHIVE_ID)}`, why: WHY_ARCHIVE, when: 'with both hints fixed' });
  });
});

describe('#125 a request archived at the base did not move on this branch: the open spelling of its path counts for nothing (DES-37)', () => {
  // share concluded on the branch feature, and merged into main. Then the new
  // branch next.
  const merged = (dir) => {
    concludeHere(dir);
    commitMove(dir, NAME, '1d');
    archivedAtBase(dir);
  };
  function hintStays(dir, when) {
    for (const r of checks(dir)) {
      const f = one(coded(r, 'no-id'), r, `no-id ${when}`);
      assert.equal(fileOf(f), ARCHIVED, `the hint is at the archived path ${when}:\n${f.line}\n${show(r)}`);
      assert.ok(!f.msg.includes('the judgement '), `the hint names no judgement ${when}:\n${f.line}`);
      assertNotJudged(r, `${OTHER}/J1`, when);
    }
  }

  const mergedThenOther = (t) => copyOf(t, 'mergedThenOther', (b) => {
    const dir = strayWorld(b);
    merged(dir);
    otherPlan(dir);
    return dir;
  });

  test('--on requests/share/spec.md, recorded by another open request on the new branch, is refused: al check gives no such hint now; the hint stays', (t) => {
    const dir = mergedThenOther(t);
    hintStays(dir, 'before the attempt');
    const r = refused(dir, judgementArgs('no-id', CS, WHY, { name: OTHER }));
    assert.match(r.stdout, new RegExp(`al check gives no no-id hint on ${esc(CS)} now`), show(r));
    hintStays(dir, 'after the refusal');
  });

  test('a judgement that another open request recorded on requests/share/spec.md while share was open clears nothing once share is archived at the base: the hint shows at the archived path, and the audit says "no hint now"', (t) => {
    const dir = strayWithOther(t);
    judge(dir, 'no-id', CS, WHY, { name: OTHER });
    commitAll(dir, 'The judgement in the record of other');
    assertNoIdCleared(dir, 'while share is open', { holder: OTHER });
    merged(dir);
    hintStays(dir, 'with share archived at the base');
    assertAudit(dir, {
      holder: OTHER, code: 'no-id', on: esc(CS), state: `no hint now: al check gives no no-id hint on ${esc(CS)}`, when: 'with share archived at the base',
    });
  });

  test('control: --on requests/archive/share/spec.md, the path that the hint line shows, recorded by another open request, is accepted and clears the hint (DES-163)', (t) => {
    const dir = mergedThenOther(t);
    hintStays(dir, 'before the judgement');
    judge(dir, 'no-id', ARCHIVED, WHY, { name: OTHER });
    for (const r of checks(dir)) {
      none(coded(r, 'no-id'), r, 'no-id after the judgement');
      assert.ok(judgedHas(r, `${OTHER}/J1 no-id ${ARCHIVED}: ${WHY}`), `the info judged line names ${OTHER}/J1:\n${show(r)}`);
    }
    assertAudit(dir, { holder: OTHER, code: 'no-id', on: esc(ARCHIVED), state: CURRENT, when: 'after the judgement' });
  });
});
