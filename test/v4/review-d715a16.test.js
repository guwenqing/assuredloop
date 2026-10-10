// Regression test for the finding of the review of d715a16 (#179,
// reviewer-179): a config-only commit brought policies/tax.md, already marked,
// into spec scope, so no marker diff shows when INV-99 became a spec limit.
// With its control, through the commands. Cases scope-pre and remove-scoped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invoicer } from './helpers/invoicer.js';
import { al, commitAll, editRecord, git, read, write, writeYaml } from './helpers/project.js';
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

const LIMIT = '<!-- INV-99 limit -->\n\nInvoicer does not calculate foreign tax.\n';

function recordRemoval(dir) {
  editRecord(dir, 'drop-configured', (rec) => {
    rec.dispositions = [...(rec.dispositions ?? []), { source: 'drop-configured/SP-1', disposition: 'removed', spec: 'INV-99' }];
  });
  const r = al(dir, ['index']);
  assert.equal(r.code, 0, show(r));
}

// INV-99 deleted from policies/tax.md in the working tree only.
function deleteInv99(dir) {
  assert.equal(read(dir, 'policies/tax.md'), LIMIT, 'policies/tax.md holds the limit');
  write(dir, 'policies/tax.md', '');
  recordRemoval(dir);
  assert.notEqual(git(dir, 'status', '--porcelain'), '', 'the removal is not committed');
}

// policies/tax.md taken out of scope by a config-only commit on the branch;
// its text stays in the repo.
function unscopeInv99(dir) {
  writeYaml(dir, '.assuredloop/config.yaml', {
    root: 'specs',
    docs: [{ file: 'specs/invoices.md', prefix: 'INV' }, { file: 'specs/exports.md', prefix: 'EXP' }],
  });
  commitAll(dir, 'Take the tax policy out of the spec\n\nTier: 2 — drop-configured');
  recordRemoval(dir);
  assert.equal(read(dir, 'policies/tax.md'), LIMIT, 'the text stays');
}

test('INV-99, in scope by config only, removed in the working tree, R1 unsigned: conclude refuses on drop-configured/SP-1, also with --yes', (t) => {
  const dir = invoicer(t, 'remove-scoped', 'unsigned');
  deleteInv99(dir);
  refusesNaming(conclude(dir, 'drop-configured'), 'drop-configured/SP-1');
  refusesNaming(conclude(dir, 'drop-configured', '--yes'), 'drop-configured/SP-1');
});

test('INV-99 taken out of scope by a config-only commit on the branch, R1 unsigned: conclude refuses on drop-configured/SP-1', (t) => {
  const dir = invoicer(t, 'remove-scoped', 'unsigned');
  unscopeInv99(dir);
  refusesNaming(conclude(dir, 'drop-configured'), 'drop-configured/SP-1');
  refusesNaming(conclude(dir, 'drop-configured', '--yes'), 'drop-configured/SP-1');
});

test('control: the same working-tree removal with R1 signed would conclude', (t) => {
  const dir = invoicer(t, 'remove-scoped', 'signed');
  deleteInv99(dir);
  wouldConclude(conclude(dir, 'drop-configured'), 'drop-configured');
});

test('control: the same out-of-scope removal with R1 signed would conclude', (t) => {
  const dir = invoicer(t, 'remove-scoped', 'signed');
  unscopeInv99(dir);
  wouldConclude(conclude(dir, 'drop-configured'), 'drop-configured');
});
