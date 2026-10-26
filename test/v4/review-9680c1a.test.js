// Regression tests for the five findings of the review of 9680c1a (#179,
// its reviewer), each with its control, through the commands. States of the
// invoicer world (test/v4/fixtures/invoicer/cases/remove-promise.yaml,
// remove-merged-*.yaml, abandon-unsigned.yaml, code-cite.yaml).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invoicer } from './helpers/invoicer.js';
import { al, commitAll, git, move, read, write, writeYaml } from './helpers/project.js';
import { conclude, has, hasNot, show, view, word } from './helpers/views.js';

const refusesNaming = (r, id) => {
  assert.equal(r.code, 1, show(r));
  assert.equal(r.wrote, false, show(r));
  assert.ok(r.refused.some((l) => word(id).test(l)), `a refused line names ${id}:\n${show(r)}`);
};
const wouldConclude = (r, name) => {
  assert.equal(r.code, 0, show(r));
  assert.deepEqual(r.refused, [], show(r));
  assert.match(r.stdout, new RegExp(`^Would conclude ${name}: `, 'm'), show(r));
  assert.equal(r.wrote, false, show(r));
};

// --- 1. a removed promise needs a signed requirement (design.md 5)

test('1: an unsigned removal of the limit INV-4 makes conclude refuse, naming drop-tax/SP-1', (t) => {
  refusesNaming(conclude(invoicer(t, 'remove-promise', 'unsigned'), 'drop-tax'), 'drop-tax/SP-1');
  refusesNaming(conclude(invoicer(t, 'remove-promise', 'unsigned'), 'drop-tax', '--yes'), 'drop-tax/SP-1');
});

// #72: R1 of drop-tax is met by the removal itself, so no paragraph serves
// it; a close line on R1 says so, as the close rule asks.
const closeR1 = (dir) => {
  const r = al(dir, ['record', 'drop-tax', 'close', '--on', 'R1', '--reason', 'Met by the removal of INV-4.', '--yes']);
  assert.equal(r.code, 0, show(r));
  return dir;
};

test('1 control: the same removal with R1 signed would conclude', (t) => {
  wouldConclude(conclude(closeR1(invoicer(t, 'remove-promise', 'signed')), 'drop-tax'), 'drop-tax');
});

test('1: the removal merged on main earlier (INV-4 absent at the merge-base too): still refused when unsigned', (t) => {
  const dir = invoicer(t, 'remove-merged-unsigned');
  assert.ok(!read(dir, 'specs/invoices.md').includes('INV-4'), 'INV-4 is gone');
  assert.ok(!git(dir, 'show', 'main:specs/invoices.md').includes('INV-4'), 'INV-4 is gone at main too');
  refusesNaming(conclude(dir, 'drop-tax'), 'drop-tax/SP-1');
});

test('1 control: the removal merged on main earlier, signed: would conclude', (t) => {
  wouldConclude(conclude(closeR1(invoicer(t, 'remove-merged-signed')), 'drop-tax'), 'drop-tax');
});

// --- 2. no kept effect, no sign-off needed (design.md 6)
// #72 (LD-58) removed the dispositions and the abandoned exemption; the
// unsigned rule refuses on the sign-off alone.

test('2 control: the same rule incorporated with no sign-off refuses on the sign-off alone', (t) => {
  const dir = invoicer(t, 'abandon-unsigned', 'incorporated');
  const r = conclude(dir, 'csv-bom');
  refusesNaming(r, 'csv-bom/SP-2');
  assert.equal(r.refused.length, 1, `one reason, the sign-off:\n${show(r)}`);
});

// --- 3. an archived request is never checked again (design.md 5)

const EDIT = ['A yearly ZIP holds twelve monthly CSV files', 'A yearly ZIP holds 12 monthly CSV files'];
const editExp10 = (dir) => write(dir, 'specs/exports.md', read(dir, 'specs/exports.md').replace(...EDIT));

// #72 (LD-58): the views no longer judge a disposition; --audit shows an old
// one as "recorded; not checked".
test('3: after conclude --yes and a later edit of EXP-10, the archived request shows SP-10 as recorded, not "not valid"', (t) => {
  const dir = invoicer(t, 'd06', 'control');
  const closed = al(dir, ['conclude', 'invoice-exports', '--yes']);
  assert.equal(closed.code, 0, show(closed));
  commitAll(dir, 'Close invoice-exports');
  editExp10(dir);
  commitAll(dir, 'Say 12 in EXP-10\n\nTier: 1d — exports-wording');
  for (const args of [['context', 'invoice-exports'], ['context', 'invoice-exports', '--audit']]) {
    const r = view(dir, args);
    hasNot(r, word('SP-10'), /not valid/);
  }
  has(view(dir, ['context', 'invoice-exports', '--audit']), /^Disp\./, word('SP-10'), /incorporated/, word('EXP-10'), /recorded; not checked/);
});

// --- 4. a code cite is not a check (design.md 9)

const exportsCoverage = (r) => has(r, 'specs/exports.md', /\bExports\b/, /\d+ rules?, \d+ with a check, \d+ without/);

test('4: only src/exports.js names EXP-2: EXP-2 has no check, and its checks are none', (t) => {
  const dir = invoicer(t, 'code-cite', 'code');
  const r = view(dir, ['context', 'invoice-exports']);
  assert.match(exportsCoverage(r), /\b2 rules, 0 with a check, 2 without\b/, show(r));
  has(r, word('EXP-2'), /\bnone\b/);
  const id = view(dir, ['context', 'EXP-2']);
  has(id, /check/i, /\bnone\b/);
});

test('4 control: a test file that names EXP-2 is a check', (t) => {
  const r = view(invoicer(t, 'code-cite', 'test'), ['context', 'invoice-exports']);
  assert.match(exportsCoverage(r), /\b2 rules, 1 with a check, 1 without\b/, show(r));
  has(r, word('EXP-2'), 'test/exports.test.js');
  hasNot(r, word('EXP-2'), /\bnone\b/);
});

test('4 control: a file outside the test folders is a check when a result names it as its check', (t) => {
  const r = view(invoicer(t, 'code-cite', 'result'), ['context', 'invoice-exports']);
  assert.match(exportsCoverage(r), /\b2 rules, 1 with a check, 1 without\b/, show(r));
  has(r, word('EXP-2'), 'reviews/monthly-export.md');
});

// --- 5. --at reads that commit's config (R9)

function movedRoot(t) {
  const dir = invoicer(t, 'clean');
  const saved = git(dir, 'rev-parse', 'HEAD');
  move(dir, 'specs', 'current-specs');
  writeYaml(dir, '.assuredloop/config.yaml', {
    root: 'current-specs',
    docs: [{ file: 'current-specs/invoices.md', prefix: 'INV' }, { file: 'current-specs/exports.md', prefix: 'EXP' }],
  });
  commitAll(dir, 'Move the spec root to current-specs/\n\nTier: 0 — restores EXP-4');
  return { dir, saved };
}

test('5: context EXP-4 --at a commit before the root moved finds EXP-4 with its text', (t) => {
  const { dir, saved } = movedRoot(t);
  const r = view(dir, ['context', 'EXP-4', '--at', saved]);
  has(r, 'The export link MUST expire 30 minutes after the email is sent.');
  has(r, /(?<![\w-])specs\/exports\.md/);
});

test('5 control: context EXP-4 on the working tree finds it under current-specs/', (t) => {
  const { dir } = movedRoot(t);
  const r = view(dir, ['context', 'EXP-4']);
  has(r, 'The export link MUST expire 30 minutes after the email is sent.');
  has(r, 'current-specs/exports.md');
});
