// al check --strict and conclude on a request whose promise paragraph is not
// signed (#226, #217): one function serves both commands, so for the
// request's own paragraphs the IDs of check's `not ok signoff-coverage`
// lines equal the IDs on conclude's sign-off `refused:` line.
//
// #72 (LD-58) removed the dispositions, and with them the exemption of a
// paragraph validly abandoned with no kept effect. An old record that still
// says `abandoned` is readable, and the paragraph needs a signed requirement
// like any other.
//
// States of the invoicer world: abandon-unsigned.yaml (arms abandoned and
// incorporated).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, invoicer } from './helpers/invoicer.js';
import { conclude, show, word } from './helpers/views.js';

const NAME = 'csv-bom';
const SP2 = `${NAME}/SP-2`;
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

// Both commands need coverage on SP-2.
const needsCoverage = (dir, id = SP2) => {
  const { c, k } = agree(dir);
  assert.equal(c.r.code, 1, show(c.r));
  assert.ok(c.ids.includes(id), `check --strict reports signoff-coverage on ${id}:\n${show(c.r)}`);
  assert.equal(k.code, 1, show(k));
  assert.equal(k.wrote, false, show(k));
  assert.ok(refusedIds(k).some((x) => word(id).test(x)), `conclude's sign-off refusal names ${id}:\n${show(k)}`);
};

// --- 1. the issue's case, after #72: SP-2 with an old abandoned disposition, R1 not signed

test('1: SP-2 with an old abandoned disposition and no sign-off: check reports signoff-coverage on SP-2 and conclude refuses naming it (#72: no exemption)', (t) => {
  needsCoverage(invoicer(t, 'abandon-unsigned', 'abandoned'));
});

// --- 2. control: the same rule incorporated as EXP-9, no sign-off

test('2 control: SP-2 incorporated with no sign-off: check reports signoff-coverage on SP-2 and conclude refuses naming it', (t) => {
  needsCoverage(invoicer(t, 'abandon-unsigned', 'incorporated'));
});
