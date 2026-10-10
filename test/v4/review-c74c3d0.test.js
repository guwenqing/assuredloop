// Regression tests for the two findings of the review of c74c3d0 (#179,
// reviewer-179): how the close rule learns a removed paragraph's kind from
// history. Each with its control, through the commands. Cases root-moved-*,
// kind-pre and remove-kind of the invoicer world.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invoicer } from './helpers/invoicer.js';
import { al, commitAll, editRecord, git, read, write } from './helpers/project.js';
import { conclude, show, word } from './helpers/views.js';

const refusesNaming = (r, id) => {
  assert.equal(r.code, 1, show(r));
  assert.equal(r.wrote, false, `a refusal writes nothing:\n${show(r)}`);
  assert.ok(r.refused.some((l) => word(id).test(l)), `a refused line names ${id}:\n${show(r)}`);
};
const wouldConclude = (r, name) => {
  assert.equal(r.code, 0, show(r));
  assert.deepEqual(r.refused, [], show(r));
  assert.match(r.stdout, new RegExp(`^Would conclude ${name}: `, 'm'), show(r));
};

// --- 1. the spec root moved after the removal

test('1: INV-4 removed on main by unsigned drop-tax, then the root moved to current-specs/: conclude still refuses on drop-tax/SP-1', (t) => {
  const dir = invoicer(t, 'root-moved-unsigned');
  assert.ok(!git(dir, 'ls-files').split('\n').some((f) => f.startsWith('specs/')), 'no file under specs/ any more');
  refusesNaming(conclude(dir, 'drop-tax'), 'drop-tax/SP-1');
  refusesNaming(conclude(dir, 'drop-tax', '--yes'), 'drop-tax/SP-1');
});

test('1 control: the same root move after the signed removal would conclude', (t) => {
  wouldConclude(conclude(invoicer(t, 'root-moved-signed'), 'drop-tax'), 'drop-tax');
});

// --- 2. a kind change in history (INV-99: note, then limit, on main)

const LIMIT = '\n<!-- INV-99 limit -->\n\nInvoicer does not calculate foreign tax.\n';

// Removes INV-99 in the working tree, records the removed disposition, indexes.
function removeInv99(dir) {
  const spec = read(dir, 'specs/invoices.md');
  assert.ok(spec.includes(LIMIT), 'INV-99 is a limit at the start');
  write(dir, 'specs/invoices.md', spec.replace(LIMIT, ''));
  editRecord(dir, 'drop-latest', (rec) => {
    rec.dispositions = [...(rec.dispositions ?? []), { source: 'drop-latest/SP-1', disposition: 'removed', spec: 'INV-99' }];
  });
  const r = al(dir, ['index']);
  assert.equal(r.code, 0, show(r));
}

test('2: the limit INV-99 removed in the working tree only, R1 unsigned: conclude refuses on drop-latest/SP-1, also with --yes', (t) => {
  const dir = invoicer(t, 'remove-kind', 'unsigned');
  removeInv99(dir);
  assert.notEqual(git(dir, 'status', '--porcelain'), '', 'the removal is not committed');
  refusesNaming(conclude(dir, 'drop-latest'), 'drop-latest/SP-1');
  refusesNaming(conclude(dir, 'drop-latest', '--yes'), 'drop-latest/SP-1');
});

test('2: the same removal committed on the branch, R1 unsigned: conclude refuses on drop-latest/SP-1', (t) => {
  const dir = invoicer(t, 'remove-kind', 'unsigned');
  removeInv99(dir);
  commitAll(dir, 'Remove the foreign tax limit\n\nTier: 2 — drop-latest');
  refusesNaming(conclude(dir, 'drop-latest'), 'drop-latest/SP-1');
});

test('2 control: the same removal in the working tree with R1 signed would conclude', (t) => {
  const dir = invoicer(t, 'remove-kind', 'signed');
  removeInv99(dir);
  wouldConclude(conclude(dir, 'drop-latest'), 'drop-latest');
});
