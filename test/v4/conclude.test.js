// al-v4 conclude <name> [--yes]: the close rule (#179, task T11; design.md 5,
// 6; #72, LD-57). It refuses (exit 1, nothing written, one "refused: " line
// per reason) when a promise change has no signed requirement, a spike's
// current question is not signed, or, on paths 2 and 3, a signed requirement
// has no declared link or a change paragraph's changes/removes target is not
// changed or removed. #72 (LD-58) removed the dispositions and the
// exact-text rule. States of the invoicer world.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invoicer } from './helpers/invoicer.js';
import { exists, read, readYaml, write } from './helpers/project.js';
import { conclude, show, word } from './helpers/views.js';

const refuses = (r, ...ids) => {
  assert.equal(r.code, 1, show(r));
  assert.equal(r.wrote, false, `a refusal writes nothing:\n${show(r)}`);
  assert.ok(r.refused.length >= 1, `a "refused: " line:\n${show(r)}`);
  for (const id of ids) assert.ok(r.refused.some((l) => word(id).test(l)), `a refused line names ${id}:\n${show(r)}`);
};
const naming = (r, id) => r.refused.filter((l) => word(id).test(l));
const wouldPass = (r, name) => {
  assert.equal(r.code, 0, show(r));
  assert.equal(r.wrote, false, `without --yes nothing is written:\n${show(r)}`);
  assert.deepEqual(r.refused, [], show(r));
  assert.match(r.stdout, new RegExp(`^Would conclude ${name}: `, 'm'), show(r));
};

// #72: no exact-text rule, so a drift between a change paragraph and its
// spec text no longer refuses; the review judges it.
test('D06: the drifted EXP-10 no longer makes conclude refuse (#72); the defect and the control would conclude', (t) => {
  wouldPass(conclude(invoicer(t, 'd06', 'defect'), 'invoice-exports'), 'invoice-exports');
  wouldPass(conclude(invoicer(t, 'd06', 'control'), 'invoice-exports'), 'invoice-exports');
});

test('D14: two trailing spaces no longer make conclude refuse (#72); the defect and the control would conclude', (t) => {
  wouldPass(conclude(invoicer(t, 'd14', 'defect'), 'csv-header'), 'csv-header');
  wouldPass(conclude(invoicer(t, 'd14', 'control'), 'csv-header'), 'csv-header');
});

test('cr-wording: a recorded wording decision lets invoice-exports conclude', (t) => {
  wouldPass(conclude(invoicer(t, 'cr-wording'), 'invoice-exports'), 'invoice-exports');
});

test('cr-revert: an unexplained revert makes conclude refuse on reminder-emails/SP-2 only', (t) => {
  const r = conclude(invoicer(t, 'cr-revert'), 'reminder-emails');
  refuses(r, 'reminder-emails/SP-2');
  for (const id of ['reminder-emails/SP-3', 'reminder-emails/SP-4']) assert.deepEqual(naming(r, id), [], show(r));
});

test('cr-45: R2 version 2 is signed, so no sign-off reason and nothing on R2; conclude refuses only because R3 has no declared paragraph link (#72)', (t) => {
  const r = conclude(invoicer(t, 'cr-45'), 'invoice-exports');
  refuses(r, 'invoice-exports/R3');
  assert.equal(r.refused.length, 1, `one reason, no sign-off reason:\n${show(r)}`);
  assert.match(r.refused[0], /no declared paragraph link/, show(r));
  assert.deepEqual(naming(r, 'R2'), [], show(r));
});

test('a removal and an incorporation, both signed (cr-remove): tax-module would conclude', (t) => {
  wouldPass(conclude(invoicer(t, 'cr-remove'), 'tax-module'), 'tax-module');
});

test('a design-only request needs no sign-off (D08 control): due-dates would conclude', (t) => {
  wouldPass(conclude(invoicer(t, 'd08', 'control'), 'due-dates'), 'due-dates');
});

test('an unsigned promise change refuses with one reason that names late-fees/SP-2', (t) => {
  const r = conclude(invoicer(t, 'conclude-unsigned'), 'late-fees');
  refuses(r, 'late-fees/SP-2');
  assert.equal(r.refused.length, 1, `only the sign-off reason; its disposition is valid:\n${show(r)}`);
});

test('reminder-emails, signed but not consolidated: refuses on R1 (no declared paragraph link) and SP-2 (INV-11 unchanged since the link), with no sign-off reason (#72)', (t) => {
  const r = conclude(invoicer(t, 'clean'), 'reminder-emails');
  refuses(r, 'reminder-emails/R1', 'reminder-emails/SP-2');
  assert.equal(r.refused.length, 2, show(r));
  assert.ok(naming(r, 'reminder-emails/R1').some((l) => /no declared paragraph link/.test(l)), show(r));
  assert.ok(naming(r, 'reminder-emails/SP-2').some((l) => word('INV-11').test(l) && /unchanged since the link/.test(l)), show(r));
  assert.deepEqual(r.refused.filter((l) => /no signed requirement/.test(l)), [], `no sign-off reason:\n${show(r)}`);
  assert.deepEqual(naming(r, 'reminder-emails/SP-5'), [], `a plan is not named:\n${show(r)}`);
});

test('the spike: a signed question concludes with no dispositions; a changed, unsigned question refuses on Q1', (t) => {
  wouldPass(conclude(invoicer(t, 'clean'), 'link-expiry-spike'), 'link-expiry-spike');
  const r = conclude(invoicer(t, 'spike-q2'), 'link-expiry-spike');
  refuses(r, 'link-expiry-spike/Q1');
  assert.equal(r.refused.length, 1, show(r));
});

// #72: the uncommitted edit is a new rule EXP-30 with no signed requirement
// (the exact-text rule that the edit of EXP-10 tripped is gone).
test('conclude reads the working tree: an uncommitted new rule EXP-30 with no signed requirement makes the D06 control refuse', (t) => {
  const dir = invoicer(t, 'd06', 'control');
  const spec = read(dir, 'specs/exports.md');
  write(dir, 'specs/exports.md', `${spec.replace(/\n*$/, '\n')}\n<!-- EXP-30 rule -->\n\nAn export MUST be signed.\n`);
  const r = conclude(dir, 'invoice-exports');
  refuses(r, 'EXP-30');
  assert.ok(naming(r, 'EXP-30').some((l) => /no signed requirement/.test(l)), show(r));
});

test('--yes on a refusal writes nothing and exits 1', (t) => {
  refuses(conclude(invoicer(t, 'conclude-unsigned'), 'late-fees', '--yes'), 'late-fees/SP-2');
});

test('--yes writes the Outcome, sets the status, and moves the request to requests/archive/; a second run says already archived', (t) => {
  const dir = invoicer(t, 'd06', 'control');
  const r = conclude(dir, 'invoice-exports', '--yes');
  assert.equal(r.code, 0, show(r));
  assert.deepEqual(r.refused, [], show(r));
  assert.ok(!exists(dir, 'requests/invoice-exports'), 'the open folder is gone');
  const md = read(dir, 'requests/archive/invoice-exports/request.md');
  assert.ok(exists(dir, 'requests/archive/invoice-exports/spec.md'));
  assert.match(md, /Status: concluded/);
  assert.doesNotMatch(md, /Status: open/);
  const outcome = md.slice(md.indexOf('## Outcome'));
  assert.ok(md.includes('## Outcome'), md);
  for (const id of ['R1', 'R2', 'R3', 'R4']) assert.match(outcome, word(id), outcome);
  // #72: the Outcome lists what serves each requirement; no disposition lines.
  for (const id of ['SP-10', 'EXP-10', 'SP-6', 'EXP-4']) {
    assert.ok(outcome.split('\n').some((l) => word(id).test(l) && /serves it/.test(l)), `${id} serves its requirement:\n${outcome}`);
  }
  assert.doesNotMatch(outcome, /incorporated|disposition/, outcome);
  assert.match(outcome, /unknown|not known/i, `it says what is unknown:\n${outcome}`);
  assert.doesNotMatch(outcome, /\bproves?\b|\bis complete\b|\bwork is done\b/i, outcome);
  const rec = readYaml(dir, '.assuredloop/records/requests/invoice-exports.yaml');
  assert.equal(rec.status, 'concluded');

  const again = conclude(dir, 'invoice-exports', '--yes');
  assert.notEqual(again.code, 0, show(again));
  assert.match(again.stdout, /already archived/, show(again));
  assert.equal(again.wrote, false, show(again));
});

test('--yes on the spike: its Outcome names the question version that the answer answers', (t) => {
  const dir = invoicer(t, 'clean');
  const r = conclude(dir, 'link-expiry-spike', '--yes');
  assert.equal(r.code, 0, show(r));
  const md = read(dir, 'requests/archive/link-expiry-spike/request.md');
  const outcome = md.slice(md.indexOf('## Outcome'));
  assert.match(outcome, /\bQ1\b.*\b(version 1|v1)\b/, outcome);
});

test('conclude of an archived request is refused (already archived); an unknown name is exit 2', (t) => {
  const dir = invoicer(t, 'd01', 'control');
  const r = conclude(dir, 'small-remainders');
  assert.notEqual(r.code, 0, show(r));
  assert.match(r.stdout, /already archived/, show(r));
  assert.equal(r.wrote, false, show(r));
  const u = conclude(dir, 'no-such-request');
  assert.equal(u.code, 2, show(u));
  assert.match(u.stdout, /^al: .*no-such-request/m, show(u));
});
