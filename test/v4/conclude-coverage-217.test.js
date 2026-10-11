// al conclude <name> applies the same sign-off coverage as al check (#217;
// design.md DES-37 and DES-42, "every promise change is signed"). Every
// promise change of the branch (base: the merge-base of HEAD with main) must
// be covered by a signed requirement. While one is not, conclude refuses:
// exit 1, nothing written, a "refused: " line that names each uncovered ID.
// One function serves both commands, so for each ID that check --strict
// reports as "not ok signoff-coverage", conclude names it, and when check has
// no signoff-coverage finding, conclude has no coverage refusal.
//
// Each test: specs/invoices.md and the config on main (baseProject), then the
// branch `feature` with an open path-1 request `change` and the edit under test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check } from './helpers/invoicer.js';
import {
  appendSection, baseProject, commitAll, doc, editFile, git, index, newRequest, ok, organized, read, req, write,
} from './helpers/project.js';
import { conclude, show, word } from './helpers/views.js';

const SPEC = 'specs/invoices.md';
const NAME = 'change';
const R1 = req('R1', 'Lines on every invoice', 'Every invoice MUST have at least one line, paid or not.');
const CLAIM = 'Tier: 1 — change; the spec follows the request';

// The branch: an open path-1 request with R1, signed when `signed`.
function branch(t, { signed = false } = {}) {
  const dir = baseProject(t);
  newRequest(dir, NAME, 'Every invoice needs a line, also the unpaid ones.\n', ['--tier', '1']);
  appendSection(dir, NAME, organized([R1]));
  if (signed) ok(dir, ['record', NAME, 'signoff', '--source', 'email from the owner', '--yes']);
  return dir;
}

// Index and commit the branch's state, with a path claim.
function commit(dir, message = CLAIM) {
  index(dir);
  commitAll(dir, `the branch\n\n${message}`);
}

// The IDs of the signoff-coverage findings of al check --strict.
function coverage(dir) {
  const r = check(dir, '--strict');
  const ids = r.findings.filter((f) => f.severity === 'not ok' && f.code === 'signoff-coverage').map((f) => f.id);
  return { r, ids: [...new Set(ids)].sort() };
}

const refuses = (r, ...ids) => {
  assert.equal(r.code, 1, show(r));
  assert.equal(r.wrote, false, `a refusal writes nothing:\n${show(r)}`);
  assert.ok(r.refused.length >= 1, `a "refused: " line:\n${show(r)}`);
  assert.doesNotMatch(r.stdout, /^Would conclude /m, show(r));
  for (const id of ids) assert.ok(r.refused.some((l) => word(id).test(l)), `a refused line names ${id}:\n${show(r)}`);
};
const names = (r, id) => r.refused.some((l) => word(id).test(l));
const wouldPass = (r) => {
  assert.equal(r.code, 0, show(r));
  assert.equal(r.wrote, false, `without --yes nothing is written:\n${show(r)}`);
  assert.deepEqual(r.refused, [], show(r));
  assert.match(r.stdout, new RegExp(`^Would conclude ${NAME}: `, 'm'), show(r));
};

const RULE13 = 'An invoice MUST have at least one line.';
const RULE13_ALL = 'An invoice MUST have at least one line, paid or not.';

test('the audit case: a changed rule with no serves link and no sign-off; check --strict reports it, conclude refuses naming it', (t) => {
  const dir = branch(t);
  editFile(dir, SPEC, RULE13, RULE13_ALL);
  commit(dir);
  const c = coverage(dir);
  assert.equal(c.r.code, 1, show(c.r));
  assert.deepEqual(c.ids, ['INV-13'], show(c.r));
  assert.equal(c.r.findings.find((f) => f.id === 'INV-13' && f.code === 'signoff-coverage').file, SPEC, show(c.r));
  refuses(conclude(dir, NAME), 'INV-13');
});

test('a signed request does not cover a spec paragraph that does not serve it: a new rule with no serves link refuses', (t) => {
  const dir = branch(t, { signed: true });
  write(dir, SPEC, `${read(dir, SPEC)}\n${doc([['INV-50 rule', 'An unpaid invoice MUST have at least one line.']])}`);
  commit(dir);
  assert.deepEqual(coverage(dir).ids, ['INV-50']);
  const r = conclude(dir, NAME);
  refuses(r, 'INV-50');
  assert.ok(!names(r, `${NAME}/R1`) && !names(r, 'R1'), `R1 is signed:\n${show(r)}`);
});

test('a rule removed with no signed remover: conclude refuses naming the removed ID', (t) => {
  const dir = branch(t, { signed: true });
  editFile(dir, SPEC, '<!-- INV-41 rule -->\n\nThe export link MUST expire 30 minutes after the email is sent.\n', '');
  assert.ok(!read(dir, SPEC).includes('INV-41'), read(dir, SPEC));
  commit(dir);
  assert.deepEqual(coverage(dir).ids, ['INV-41']);
  refuses(conclude(dir, NAME), 'INV-41');
});

test('a kind change into a promise kind (data -> rule) with no serves link: conclude refuses naming it', (t) => {
  const dir = branch(t, { signed: true });
  editFile(dir, SPEC, '<!-- INV-12 data -->', '<!-- INV-12 rule -->');
  commit(dir);
  assert.deepEqual(coverage(dir).ids, ['INV-12']);
  refuses(conclude(dir, NAME), 'INV-12');
});

test('control: the changed rule serves change/R1 and R1 is signed; check has no signoff-coverage and conclude would conclude', (t) => {
  const dir = branch(t, { signed: true });
  editFile(dir, SPEC, RULE13, RULE13_ALL);
  editFile(dir, SPEC, '<!-- INV-13 rule -->', `<!-- INV-13 rule serves:${NAME}/R1 -->`);
  commit(dir);
  const c = coverage(dir);
  assert.deepEqual(c.ids, [], show(c.r));
  wouldPass(conclude(dir, NAME));
});

test('the changed rule serves change/R1 but R1 is not signed: both commands name INV-13', (t) => {
  const dir = branch(t);
  editFile(dir, SPEC, RULE13, RULE13_ALL);
  editFile(dir, SPEC, '<!-- INV-13 rule -->', `<!-- INV-13 rule serves:${NAME}/R1 -->`);
  commit(dir);
  assert.deepEqual(coverage(dir).ids, ['INV-13']);
  refuses(conclude(dir, NAME), 'INV-13');
});

test('control: a new component paragraph and a changed data paragraph need no sign-off; conclude would conclude', (t) => {
  const dir = branch(t);
  editFile(dir, SPEC, 'lines, a total and a paid date.', 'lines, a total, a currency and a paid date.');
  write(dir, SPEC, `${read(dir, SPEC)}\n${doc([['INV-60 component', 'The export service builds the CSV files.']])}`);
  commit(dir);
  const c = coverage(dir);
  assert.deepEqual(c.ids, [], show(c.r));
  wouldPass(conclude(dir, NAME));
});

test('control: a typo claim on path 0 excuses its paragraph in both commands', (t) => {
  const dir = branch(t);
  editFile(dir, SPEC, RULE13, 'An Invoice MUST have at least one line.');
  commit(dir);
  assert.deepEqual(coverage(dir).ids, ['INV-13'], 'without the claim the edit is a promise change');
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'the claim\n\nTier: 0 — typo in INV-13');
  const c = coverage(dir);
  assert.deepEqual(c.ids, [], show(c.r));
  wouldPass(conclude(dir, NAME));
});

test('--yes on a coverage refusal writes nothing and exits 1', (t) => {
  const dir = branch(t);
  editFile(dir, SPEC, RULE13, RULE13_ALL);
  commit(dir);
  refuses(conclude(dir, NAME, '--yes'), 'INV-13');
});

test('check and conclude agree on one tree: conclude names exactly the IDs that check reports', (t) => {
  const dir = branch(t, { signed: true });
  let spec = read(dir, SPEC);
  spec = spec.replace('<!-- INV-12 data -->', '<!-- INV-12 rule -->'); // kind change into a promise kind: uncovered
  spec = spec.replace(`<!-- INV-13 rule -->\n\n${RULE13}`, `<!-- INV-13 rule serves:${NAME}/R1 -->\n\n${RULE13_ALL}`); // covered
  spec = spec.replace('<!-- INV-41 rule -->\n\nThe export link MUST expire 30 minutes after the email is sent.\n', ''); // removed: uncovered
  spec += `\n${doc([
    ['INV-50 limit', 'An invoice MUST NOT have more than 500 lines.'], // new: uncovered
    ['INV-51 rule serves:other/R1', 'A credit note MUST name its invoice.'], // serves a request that does not exist: uncovered
    ['INV-60 component', 'The export service builds the CSV files.'], // not a promise
  ])}`;
  write(dir, SPEC, spec);
  write(dir, `requests/${NAME}/spec.md`, doc([
    ['SP-1 note', '# The change'],
    ['SP-2 plan', 'One PR.'], // not a promise
    ['SP-3 rule', 'An unpaid invoice MUST show its due date.'], // a change spec promise with no serves link: uncovered
  ]));
  commit(dir);
  const c = coverage(dir);
  assert.deepEqual(c.ids, ['INV-12', 'INV-41', 'INV-50', 'INV-51', `${NAME}/SP-3`], `the tree is as meant:\n${show(c.r)}`);
  const r = conclude(dir, NAME);
  refuses(r, ...c.ids);
  for (const id of ['INV-1', 'INV-13', 'INV-60', 'R1', `${NAME}/R1`, `${NAME}/SP-1`, `${NAME}/SP-2`]) assert.ok(!names(r, id), `no refused line names ${id}:\n${show(r)}`);
});

test('the base is the merge-base with main: a promise change made on main after the fork is no change of the branch', (t) => {
  const dir = branch(t);
  commit(dir);
  git(dir, 'checkout', '-q', 'main');
  editFile(dir, SPEC, RULE13, RULE13_ALL);
  commitAll(dir, 'main moves on');
  git(dir, 'checkout', '-q', 'feature');
  assert.equal(read(dir, SPEC).includes(RULE13_ALL), false, 'the branch has the old text');
  const c = coverage(dir);
  assert.deepEqual(c.ids, [], show(c.r));
  wouldPass(conclude(dir, NAME));
});

test('a promise change of another open request on the branch is a change of the branch: conclude names other/SP-2', (t) => {
  const dir = branch(t, { signed: true });
  newRequest(dir, 'other', 'Credit notes, please.\n', ['--tier', '1']);
  appendSection(dir, 'other', organized([req('R1', 'Credit notes', 'A credit note MUST name its invoice.')]));
  write(dir, 'requests/other/spec.md', doc([['SP-1 note', '# Credit notes'], ['SP-2 rule serves:R1', 'A credit note MUST name its invoice.']]));
  commit(dir);
  const c = coverage(dir);
  assert.deepEqual(c.ids, ['other/SP-2'], show(c.r));
  refuses(conclude(dir, NAME), 'other/SP-2');
});
