// al check --strict and a request with no kept effect (#226; design.md DES-42:
// "A request with no kept effect may be abandoned without a sign-off.").
// The sign-off coverage of al check skips a change-spec paragraph whose
// current version has a valid `abandoned` disposition with no kept effect,
// the same exception that al conclude uses. One function serves both commands
// (#217), so for the request's own paragraphs the IDs of check's
// `not ok signoff-coverage` lines equal the IDs on conclude's sign-off
// `refused:` line. A paragraph abandoned while an owner decision keeps its
// effect, or abandoned with a disposition that is not valid, still needs a
// signed requirement.
//
// States of the invoicer world: abandon-unsigned.yaml (arms abandoned and
// incorporated), and states built in this file from them (see each test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, invoicer } from './helpers/invoicer.js';
import { al, commitAll, editRecord, exists, index, ok, read, write } from './helpers/project.js';
import { conclude, show, word } from './helpers/views.js';

const NAME = 'csv-bom';
const SP2 = `${NAME}/SP-2`;
const SPEC = `requests/${NAME}/spec.md`;
const CLAIM = `Tier: 2 — ${NAME}`;
const COVERAGE = 'a promise change with no signed requirement that covers it: ';

// The not ok lines of al check --strict, and the IDs of its signoff-coverage findings.
function strict(dir) {
  const r = check(dir, '--strict');
  const notOk = r.findings.filter((f) => f.severity === 'not ok');
  const ids = [...new Set(notOk.filter((f) => f.code === 'signoff-coverage').map((f) => f.id))].sort();
  return { r, notOk, ids };
}

// The IDs that conclude's sign-off refusal names ([] when it has none).
function refusedIds(r) {
  const line = r.refused.find((l) => l.startsWith(`refused: ${COVERAGE}`));
  return line ? line.slice(`refused: ${COVERAGE}`.length).split(', ').map((x) => x.trim()).sort() : [];
}

const own = (ids) => ids.filter((id) => id.startsWith(`${NAME}/`));

// Check and conclude agree on the request's own paragraphs; returns both runs.
function agree(dir) {
  const c = strict(dir);
  const k = conclude(dir, NAME);
  assert.deepEqual(own(refusedIds(k)), own(c.ids), `conclude names the IDs that check reports:\n${show(c.r)}\n${show(k)}`);
  return { c, k };
}

// Both commands need coverage on SP-2. With `judged`, the state is as meant:
// conclude's "no valid disposition" refusal judges SP-2's current version so.
const needsCoverage = (dir, judged, id = SP2) => {
  const { c, k } = agree(dir);
  if (judged) {
    assert.ok(k.refused.some((l) => l.startsWith('refused: no valid disposition') && l.includes(`${SP2} (${judged}`)),
      `conclude judges ${SP2}: ${judged}:\n${show(k)}`);
  }
  assert.equal(c.r.code, 1, show(c.r));
  assert.ok(c.ids.includes(id), `check --strict reports signoff-coverage on ${id}:\n${show(c.r)}`);
  assert.equal(k.code, 1, show(k));
  assert.equal(k.wrote, false, show(k));
  assert.ok(refusedIds(k).some((x) => word(id).test(x)), `conclude's sign-off refusal names ${id}:\n${show(k)}`);
};

// A change to the branch's state: the record edit, then al index and a commit.
function reindex(dir, message) {
  index(dir);
  commitAll(dir, `${message}\n\n${CLAIM}`);
}

const setDisposition = (dir, set) => editRecord(dir, NAME, (rec) => {
  const d = (rec.dispositions ?? []).filter((x) => x.source === SP2).at(-1);
  assert.ok(d, `${NAME} has a disposition for ${SP2}`);
  Object.assign(d, set);
});

// --- 1. the issue's case: SP-2 validly abandoned, its text never in specs/, R1 not signed

test('1: SP-2 validly abandoned with no kept effect: check --strict has no signoff-coverage on it while the request is open', (t) => {
  const dir = invoicer(t, 'abandon-unsigned', 'abandoned');
  const c = strict(dir);
  assert.deepEqual(c.ids, [], `no signoff-coverage finding:\n${show(c.r)}`);
  assert.equal(c.r.code, 0, show(c.r));
  const { k } = agree(dir);
  // A guard: conclude would conclude, as it does before #226.
  assert.equal(k.code, 0, show(k));
  assert.deepEqual(k.refused, [], show(k));
  assert.match(k.stdout, new RegExp(`^Would conclude ${NAME}: `, 'm'), show(k));
});

test('1: after al conclude csv-bom --yes, and again after the archive move is committed, check --strict exits 0 with no not ok', (t) => {
  const dir = invoicer(t, 'abandon-unsigned', 'abandoned');
  const closed = al(dir, ['conclude', NAME, '--yes']);
  assert.equal(closed.code, 0, show(closed));
  assert.ok(exists(dir, `requests/archive/${NAME}/spec.md`), 'the request is archived');
  const before = strict(dir);
  commitAll(dir, `Close ${NAME}\n\nTier: 2 — ${NAME}; closes the request`);
  const after = strict(dir);
  const runs = { before: before.r, after: after.r };
  assert.deepEqual({ before: before.notOk.map((f) => f.line), after: after.notOk.map((f) => f.line) }, { before: [], after: [] },
    `no not ok before or after the commit:\n${show(before.r)}\n${show(after.r)}`);
  for (const [when, r] of Object.entries(runs)) assert.equal(r.code, 0, `${when} the commit:\n${show(r)}`);
});

// --- 2. control: the same rule incorporated as EXP-9, no sign-off

test('2 control: SP-2 incorporated with no sign-off: check reports signoff-coverage on SP-2 and conclude refuses naming it', (t) => {
  needsCoverage(invoicer(t, 'abandon-unsigned', 'incorporated'));
});

// --- 3. an owner decision keeps the effect: still needs a signed requirement

// Built from abandon-unsigned, arm incorporated (SP-2 new on the branch, its
// text in specs/ as EXP-9, R1 not signed): the owner's decision D1, and SP-2's
// disposition set to abandoned by D1, as abandon-decided-kept.yaml does on
// main. The effect is kept, so the paragraph still needs coverage.
test('3: SP-2 abandoned while the owner decision D1 keeps its effect (EXP-9): check and conclude still need coverage on SP-2', (t) => {
  const dir = invoicer(t, 'abandon-unsigned', 'incorporated');
  ok(dir, ['record', NAME, 'decision', '--source', 'owner', '--text', 'Do not deliver the byte order mark. The draft was never applied.', '--yes']);
  setDisposition(dir, { disposition: 'abandoned', decision: 'D1' });
  reindex(dir, 'Drop the byte order mark by D1');
  assert.ok(read(dir, 'specs/exports.md').includes('<!-- EXP-9 rule'), 'the effect is in specs/');
  needsCoverage(dir, 'abandoned, not valid: D1 keeps a promise');
});

// --- 4. an abandoned disposition that is not valid: still needs coverage

test('4: SP-2 abandoned naming the decision D9, which is not in the record: still needs coverage', (t) => {
  const dir = invoicer(t, 'abandon-unsigned', 'abandoned');
  setDisposition(dir, { decision: 'D9' });
  reindex(dir, 'Name D9');
  needsCoverage(dir, 'abandoned, not valid: D9 is not in the record');
});

test('4: SP-2 abandoned with no decision while its text is in specs/ as EXP-9: still needs coverage', (t) => {
  const dir = invoicer(t, 'abandon-unsigned', 'incorporated');
  editRecord(dir, NAME, (rec) => {
    const d = (rec.dispositions ?? []).filter((x) => x.source === SP2).at(-1);
    assert.ok(d, `${NAME} has a disposition for ${SP2}`);
    d.disposition = 'abandoned';
    delete d.spec;
    delete d.spec_sha256;
  });
  reindex(dir, 'Abandon SP-2 with no decision');
  needsCoverage(dir, 'abandoned, not valid:');
});

test('4: SP-2 changed after its abandoned disposition: its current version has none, and still needs coverage', (t) => {
  const dir = invoicer(t, 'abandon-unsigned', 'abandoned');
  const from = 'Every CSV export MUST start with a byte order mark.';
  const text = read(dir, SPEC);
  assert.equal(text.split(from).length, 2, text);
  write(dir, SPEC, text.replace(from, 'Every CSV export MUST start with a UTF-8 byte order mark.'));
  reindex(dir, 'Say UTF-8 in SP-2');
  needsCoverage(dir, 'none');
});
