// al-v4 check and adopted paragraphs (#179; decision D14, design.md 5 and 14).
// An adopted paragraph is one that the adoption record names in a disposition
// with source: adoption, its commit and its text hash. no-link does not fire on
// it while its text hash equals that hash; after an edit it follows its path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, invoicer } from './helpers/invoicer.js';
import { show } from './helpers/project.js';

const run = (t, name, arm, ...args) => check(invoicer(t, name, arm), ...args);
const noLink = (r, id) => r.findings.filter((f) => f.code === 'no-link' && f.id === id);
const ADOPTED = ['INV-2', 'INV-3', 'INV-4', 'INV-6', 'INV-8', 'INV-10', 'INV-11'];

test('the base: no no-link on an adopted promise or design paragraph', (t) => {
  const r = run(t, 'clean');
  for (const id of ADOPTED) assert.deepEqual(noLink(r, id), [], show(r));
  assert.deepEqual(r.findings.filter((f) => f.code === 'no-link'), [], show(r));
});

test('--strict on the D06 and D14 controls exits 0 again', (t) => {
  for (const name of ['d06', 'd14']) {
    const r = run(t, name, 'control', '--strict');
    assert.equal(r.code, 0, `${name}\n${show(r)}`);
  }
});

test('an adopted paragraph edited on the branch (D09 defect, INV-4) gets no-link back, beside its other findings', (t) => {
  const r = run(t, 'd09', 'defect');
  assert.equal(noLink(r, 'INV-4').length, 1, show(r));
  assert.equal(noLink(r, 'INV-4')[0].severity, 'hint', show(r));
  for (const code of ['path-claim', 'signoff-coverage']) {
    assert.ok(r.findings.some((f) => f.severity === 'not ok' && f.code === code && f.id === 'INV-4'), `${code}:\n${show(r)}`);
  }
  for (const id of ADOPTED.filter((x) => x !== 'INV-4')) assert.deepEqual(noLink(r, id), [], show(r));
  const control = run(t, 'd09', 'control');
  assert.deepEqual(noLink(control, 'INV-4'), [], `the path-1 edit adds serves:no-conversion/R1:\n${show(control)}`);
});

test('a promise paragraph with no link and no adoption entry gets no-link', (t) => {
  const unlisted = run(t, 'adoption-gap', 'unlisted');
  assert.equal(noLink(unlisted, 'INV-10').length, 1, show(unlisted));
  assert.deepEqual(noLink(unlisted, 'INV-11'), [], show(unlisted));
  const fresh = run(t, 'adoption-gap', 'new');
  assert.equal(noLink(fresh, 'INV-17').length, 1, show(fresh));
  assert.deepEqual(noLink(fresh, 'INV-10'), [], show(fresh));
});
