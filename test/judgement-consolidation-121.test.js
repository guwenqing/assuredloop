// #121: a judgement on map-consolidation keeps its versions and goes stale
// (DES-163, DES-162). Written from the requirement and the public interface
// only:
//
// - `al record <name> judgement --hint map-consolidation --on <name>
//   --reason <why> --yes` records J<n> in the request's record. The hint
//   line is `hint map-consolidation <change spec file> <name> ...`, and its
//   message names the change paragraphs that go into specs/ with no current
//   consolidation judgement.
// - The judgement keeps the versions of both sides of its hint: the hint's
//   message, and the text of the paragraph that it is on and of each
//   paragraph that its message names. The hint is cleared while these are
//   the versions of now.
// - When one side changes, the hint comes back, and it ends with "the
//   judgement <request>/J<n> (<date>) is stale: <what> changed since it".
// - `al check` shows the current judgements in one line:
//   `info judged - - <request>/J<n> <code> <ID>: <reason>; ...`. A stale
//   judgement is not current, and the line leaves it out.
// - A hint changes no exit code: `al check` and `al check --strict` exit 0
//   here, as no `not ok` prints.
//
// The hint line may end with " · places: ...", which is not part of what
// the requirement says the message ends with. The ID in <what> may be bare
// (SP-1) or named (share/SP-1). This reads a request "share" whose change
// spec is not the subject of the hint's "paragraph that it is on": a change
// to a change paragraph that the message does not name (a plan) leaves the
// judgement current. No model and no network. Nothing here reads src/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, HEX64, commitAll, editFile, read, record, recordPath, show } from './helpers/project.js';
import { CS, NAME, world } from './helpers/map-68.js';
import { check, coded, judge, judgedLine, judgedLines, none, one } from './helpers/judgement-88.js';

const WHY = 'Consolidated at the close of the request.';
const T1 = 'A shared export link never stops.';
const T1b = 'A shared export link always stops.';
const T2 = 'A link has a token.';
const T2b = 'A link has no token.';
const T9 = 'One PR: the link, then the email.';

// The own request share (path 2, committed with its claim): SP-1 (a promise
// kind) and SP-2 (a design kind) go into specs/ and are not there; SP-9 is a
// plan, which does not.
const shared = (t) => world(t, [['SP-1 rule serves:R1', T1], ['SP-2 data serves:R1', T2], ['SP-9 plan', T9]]);

const consolidation = (r) => coded(r, 'map-consolidation', NAME);
const judgedText = `${NAME}/J1 map-consolidation ${NAME}: ${WHY}`;
// An ID as a whole word, bare or with "share/".
const names = (msg, id) => new RegExp(`(?<![\\w-])(?:${NAME}/)?${id}(?![\\w-])`).test(msg);

// Both modes exit 0: a hint is never a not ok.
function checks(dir) {
  const r = check(dir);
  assert.equal(r.code, 0, show(r));
  const s = check(dir, '--strict');
  assert.equal(s.code, 0, show(s));
  return [r, s];
}

// The judgement is current: no map-consolidation hint, and the info judged
// line names it.
function assertCurrent(dir, when) {
  for (const r of checks(dir)) {
    none(consolidation(r), r, `map-consolidation on ${NAME} ${when}`);
    assert.equal(judgedLine(r), judgedText, `${when}:\n${show(r)}`);
  }
}

// The judgement is stale on `ids`: the hint is back, its message (before
// " · places:") ends with "the judgement share/J1 (<date>) is stale: <what>
// changed since it", <what> names each of `ids`, and no info judged line
// names J1.
function assertStale(dir, ids, when) {
  for (const r of checks(dir)) {
    const f = one(consolidation(r), r, `map-consolidation on ${NAME} ${when}`);
    const msg = f.msg.split(' · places: ')[0];
    const tail = `; the judgement ${NAME}/J1 (${DAY}) is stale: `;
    const at = msg.lastIndexOf(tail);
    assert.ok(at >= 0, `the hint names ${NAME}/J1 as stale ${when}:\n${f.line}\n${show(r)}`);
    const rest = msg.slice(at + tail.length);
    assert.ok(rest.endsWith(' changed since it'), `the message ends with "<what> changed since it" ${when}:\n${f.line}`);
    const what = rest.slice(0, -' changed since it'.length);
    for (const id of ids) assert.ok(names(what, id), `<what> names ${id} ${when}: "${what}"\n${f.line}`);
    assert.deepEqual(judgedLines(r).filter((j) => j.msg.includes(`${NAME}/J1 `)).map((j) => j.line), [],
      `no info judged line names ${NAME}/J1 ${when}:\n${show(r)}`);
  }
}

// share with the hint, then J1 recorded on it and committed.
function judged(t) {
  const dir = shared(t);
  const r = check(dir);
  const f = one(consolidation(r), r, 'map-consolidation before the judgement');
  assert.equal(f.file, CS, show(r));
  for (const id of ['SP-1', 'SP-2']) assert.ok(names(f.msg, id), `the hint names ${id}:\n${f.line}`);
  assert.ok(!names(f.msg.split(' · places: ')[0], 'SP-9'), `the hint does not name the plan SP-9:\n${f.line}`);
  judge(dir, 'map-consolidation', NAME, WHY, { name: NAME });
  return dir;
}

test('#121 a map-consolidation judgement is current while its named paragraphs are unchanged: no hint, and the info judged line names it, in the working tree and after a commit', (t) => {
  const dir = judged(t);
  assertCurrent(dir, 'in the working tree');
  commitAll(dir, `${NAME}: the judgement J1`);
  assertCurrent(dir, 'after a commit');
});

test('#121 the judgement keeps a version of each paragraph that the hint message names: no null sha256 for SP-1 and SP-2', (t) => {
  const dir = judged(t);
  const js = (record(dir, NAME).judgements ?? []).filter((j) => j.id === 'J1');
  assert.equal(js.length, 1, `one J1 in ${recordPath(NAME)}:\n${read(dir, recordPath(NAME))}`);
  const [j] = js;
  assert.equal(j.hint, 'map-consolidation');
  assert.equal(j.on, NAME);
  const keeps = j.keeps ?? [];
  for (const id of ['SP-1', 'SP-2']) {
    const k = keeps.filter((x) => x.id === id || x.id === `${NAME}/${id}`);
    assert.equal(k.length, 1, `one keeps entry for ${id}:\n${read(dir, recordPath(NAME))}`);
    assert.match(String(k[0].sha256), HEX64, `the version of ${id} is kept, not null:\n${read(dir, recordPath(NAME))}`);
  }
});

test('#121 a meaning change of a named paragraph (SP-1 "never stops" to "always stops") makes the judgement stale: the hint comes back naming SP-1, and the info judged line leaves it out; the judged text again clears it', (t) => {
  const dir = judged(t);
  commitAll(dir, `${NAME}: the judgement J1`);
  editFile(dir, CS, T1, T1b);
  assertStale(dir, ['SP-1'], 'after the edit of SP-1 in the working tree');
  commitAll(dir, `${NAME}: SP-1 always stops`);
  assertStale(dir, ['SP-1'], 'after the edit of SP-1 is committed');
  editFile(dir, CS, T1b, T1);
  assertCurrent(dir, 'with the judged text of SP-1 back');
});

test('#121 a change of the other named paragraph (SP-2) also makes the judgement stale, naming SP-2', (t) => {
  const dir = judged(t);
  commitAll(dir, `${NAME}: the judgement J1`);
  editFile(dir, CS, T2, T2b);
  assertStale(dir, ['SP-2'], 'after the edit of SP-2');
});

test('#121 a change of a change paragraph that the message does not name (the plan SP-9) leaves the judgement current', (t) => {
  const dir = judged(t);
  commitAll(dir, `${NAME}: the judgement J1`);
  editFile(dir, CS, T9, 'Two PRs: the link, then the email.');
  assertCurrent(dir, 'after an edit of the plan SP-9');
});
