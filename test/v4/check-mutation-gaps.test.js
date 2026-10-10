// Two gaps that a hand mutation check of T10 found (#179): an abandoned
// disposition of a paragraph with a changes: link (decision D11, rule a), and
// the case of the requirement words (design.md 3). States of the invoicer world
// (test/v4/fixtures/invoicer/cases/abandon-changes.yaml, req-words.yaml).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, invoicer } from './helpers/invoicer.js';
import { show } from './helpers/project.js';

const run = (t, name, arm) => check(invoicer(t, name, arm));
const on = (r, code, id) => r.findings.filter((f) => f.code === code && f.id === id && f.severity !== 'info');

test('abandoned with changes:INV-11 is valid while INV-11 keeps the text its changes binding bound', (t) => {
  const r = run(t, 'abandon-changes', 'kept');
  assert.deepEqual(on(r, 'disposition', 'reminder-emails/SP-2'), [], show(r));
});

test('abandoned with changes:INV-11 is not valid when INV-11 now holds the paragraph\'s text (it was applied)', (t) => {
  const r = run(t, 'abandon-changes', 'applied');
  const found = on(r, 'disposition', 'reminder-emails/SP-2');
  assert.equal(found.length, 1, show(r));
  assert.equal(found[0].severity, 'hint', show(r));
});

test('abandoned with changes:INV-11 is not valid when INV-11 changed in any other way since the binding', (t) => {
  const r = run(t, 'abandon-changes', 'changed');
  const found = on(r, 'disposition', 'reminder-emails/SP-2');
  assert.equal(found.length, 1, show(r));
  assert.equal(found[0].severity, 'hint', show(r));
});

test('lower-case may, should, must and shall in a changed rationale give no promise-kind hint', (t) => {
  const r = run(t, 'req-words', 'lower');
  assert.deepEqual(on(r, 'promise-kind', 'EXP-5'), [], show(r));
});

test('control: MAY in capitals in the changed rationale gives promise kind?', (t) => {
  const r = run(t, 'req-words', 'upper');
  const found = on(r, 'promise-kind', 'EXP-5');
  assert.equal(found.length, 1, show(r));
  assert.ok(found[0].msg.includes('promise kind?'), show(r));
});

test('never in lower case and Always with a capital both give promise kind?', (t) => {
  for (const arm of ['never', 'always']) {
    const r = run(t, 'req-words', arm);
    const found = on(r, 'promise-kind', 'EXP-5');
    assert.equal(found.length, 1, `${arm}:\n${show(r)}`);
    assert.equal(found[0].severity, 'hint', show(r));
  }
});
