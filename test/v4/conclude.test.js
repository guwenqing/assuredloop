// al-v4 conclude <name> [--yes]: the close rule (#179, task T11; design.md 5,
// 6). It refuses (exit 1, nothing written, one "refused: " line per reason)
// when a promise change has no signed requirement, a spike's current question
// is not signed, or a paragraph with a baseline effect has no valid
// disposition for its current version. States of the invoicer world.
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

test('D06: the drifted EXP-10 makes conclude refuse on invoice-exports/SP-10; the control would conclude', (t) => {
  const r = conclude(invoicer(t, 'd06', 'defect'), 'invoice-exports');
  refuses(r, 'invoice-exports/SP-10');
  for (const id of ['SP-4', 'SP-7', 'SP-11', 'SP-12']) assert.deepEqual(naming(r, `invoice-exports/${id}`), [], show(r));
  wouldPass(conclude(invoicer(t, 'd06', 'control'), 'invoice-exports'), 'invoice-exports');
});

test('D14: two trailing spaces make conclude refuse on csv-header/SP-2; the control would conclude', (t) => {
  refuses(conclude(invoicer(t, 'd14', 'defect'), 'csv-header'), 'csv-header/SP-2');
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

test('cr-45: conclude refuses because SP-6\'s current version has no disposition, though R2 version 2 is signed', (t) => {
  const r = conclude(invoicer(t, 'cr-45'), 'invoice-exports');
  refuses(r, 'invoice-exports/SP-6', 'invoice-exports/SP-7', 'invoice-exports/SP-10', 'invoice-exports/SP-11', 'invoice-exports/SP-12');
  assert.equal(r.refused.length, 1, `one reason, no sign-off reason:\n${show(r)}`);
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

test('reminder-emails, signed but not consolidated: refuses on SP-2, SP-3 and SP-4, with no sign-off reason', (t) => {
  const r = conclude(invoicer(t, 'clean'), 'reminder-emails');
  refuses(r, 'reminder-emails/SP-2', 'reminder-emails/SP-3', 'reminder-emails/SP-4');
  assert.equal(r.refused.length, 1, show(r));
  assert.deepEqual(naming(r, 'reminder-emails/SP-5'), [], `a plan needs no disposition:\n${show(r)}`);
});

test('the spike: a signed question concludes with no dispositions; a changed, unsigned question refuses on Q1', (t) => {
  wouldPass(conclude(invoicer(t, 'clean'), 'link-expiry-spike'), 'link-expiry-spike');
  const r = conclude(invoicer(t, 'spike-q2'), 'link-expiry-spike');
  refuses(r, 'link-expiry-spike/Q1');
  assert.equal(r.refused.length, 1, show(r));
});

test('conclude reads the working tree: an uncommitted edit of EXP-10 makes the D06 control refuse', (t) => {
  const dir = invoicer(t, 'd06', 'control');
  const spec = read(dir, 'specs/exports.md');
  write(dir, 'specs/exports.md', spec.replace('A yearly ZIP holds twelve monthly CSV files', 'A yearly ZIP holds 12 monthly CSV files'));
  refuses(conclude(dir, 'invoice-exports'), 'invoice-exports/SP-10');
});

test('--yes on a refusal writes nothing and exits 1', (t) => {
  refuses(conclude(invoicer(t, 'd06', 'defect'), 'invoice-exports', '--yes'), 'invoice-exports/SP-10');
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
  for (const [sp, spec] of [['SP-10', 'EXP-10'], ['SP-6', 'EXP-4'], ['SP-12', 'EXP-12']]) {
    assert.ok(outcome.split('\n').some((l) => word(sp).test(l) && /incorporated/.test(l) && word(spec).test(l)), `${sp} -> ${spec}:\n${outcome}`);
  }
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
