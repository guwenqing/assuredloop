// #245, DES-58: a per-doc record holds only what al index can always rebuild
// from the current files. It holds no field that depends on the branch or on
// its base: no change field on a paragraph, and no removed list. So a fresh
// al index on main right after a merge writes nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
import {
  al, commitAll, doc, docRecord, docRecordPath, git, index, newRequest, project, read, show, tree, write, writeConfig,
  writeYaml,
} from './helpers/project.js';

const SPEC = 'specs/invoices.md';
const CS = 'requests/inv/spec.md';
const DOCS = [SPEC, CS];

// The fields a per-doc record may hold. A spec doc has no status.
const RECORD_KEYS = ['schema', 'file', 'paragraphs'];
const PARAGRAPH_KEYS = ['id', 'kind', 'text_sha256', 'display', 'hint'];

const BASE_SPEC = doc([
  ['INV-1 note', '# Invoices'],
  ['INV-2 rule', 'An invoice MUST have a number.'],
  ['INV-5 rule', 'An invoice MUST have a customer.'],
  ['INV-6 rule', 'An invoice MUST have a total.'],
  ['INV-9 rule', 'An invoice MAY have a note.'],
  ['INV-3 note', '## Exports'],
  ['INV-7 rule', 'An export MUST be a CSV file.'],
]);
// INV-2 changed, INV-4 new, INV-5 moved, INV-6 moved and changed, INV-9 removed.
const BRANCH_SPEC = doc([
  ['INV-1 note', '# Invoices'],
  ['INV-2 rule', 'An invoice MUST have a unique number.'],
  ['INV-4 rule', 'An invoice MUST have a date.'],
  ['INV-3 note', '## Exports'],
  ['INV-7 rule', 'An export MUST be a CSV file.'],
  ['INV-5 rule', 'An invoice MUST have a customer.'],
  ['INV-6 rule', 'An export MUST show the total.'],
]);

const BASE_CS = doc([
  ['SP-1 rule', 'The export MUST be a CSV file.'],
  ['SP-2 rule', 'The export MAY be a ZIP file.'],
  ['SP-3 rule', 'The export MUST name the year.'],
  ['SP-4 note', '## Links'],
]);
// SP-1 changed, SP-5 new, SP-3 moved, SP-2 removed.
const BRANCH_CS = doc([
  ['SP-1 rule', 'The export MUST be one CSV file.'],
  ['SP-4 note', '## Links'],
  ['SP-3 rule', 'The export MUST name the year.'],
  ['SP-5 rule', 'The link MUST expire.'],
]);

// Config, the spec doc and an open request with its change spec, on main.
function onMain(t, spec = BASE_SPEC, cs = BASE_CS) {
  const dir = project(t);
  writeConfig(dir);
  newRequest(dir, 'inv');
  write(dir, SPEC, spec);
  write(dir, CS, cs);
  commitAll(dir, 'base');
  return dir;
}

// The per-doc records as bytes, by doc.
const records = (dir) => Object.fromEntries(DOCS.map((d) => [d, read(dir, docRecordPath(d))]));

// Every key of the record and of each paragraph is a regenerable one.
function onlyRegenerable(dir, file) {
  const rec = docRecord(dir, file);
  const text = read(dir, docRecordPath(file));
  assert.ok(!('removed' in rec), `${file}: no removed list:\n${text}`);
  for (const k of Object.keys(rec)) assert.ok(RECORD_KEYS.includes(k), `${file}: no ${k} field in the record:\n${text}`);
  for (const p of rec.paragraphs) {
    assert.ok(!('change' in p), `${file} ${p.id}: no change field, but it holds ${JSON.stringify(p.change)}:\n${text}`);
    for (const k of Object.keys(p)) assert.ok(PARAGRAPH_KEYS.includes(k), `${file} ${p.id}: no ${k} field`);
  }
  return rec;
}

test('on a branch, a changed, a new, a moved and a removed paragraph leave no change field and no removed list', (t) => {
  const dir = onMain(t);
  git(dir, 'checkout', '-q', '-b', 'feature');
  write(dir, SPEC, BRANCH_SPEC);
  write(dir, CS, BRANCH_CS);
  index(dir);
  const spec = onlyRegenerable(dir, SPEC);
  assert.deepEqual(spec.paragraphs.map((p) => p.id), ['INV-1', 'INV-2', 'INV-4', 'INV-3', 'INV-7', 'INV-5', 'INV-6'],
    'the paragraphs of the current file, in order; the removed INV-9 is not listed');
  const cs = onlyRegenerable(dir, CS);
  assert.deepEqual(cs.paragraphs.map((p) => p.id), ['SP-1', 'SP-4', 'SP-3', 'SP-5']);
});

test('the same working files give byte-identical per-doc records on two branches with different bases, and on main', (t) => {
  // Base 1: the base files. Base 2: other text, with INV-4 and SP-5 already there.
  const one = onMain(t);
  git(one, 'checkout', '-q', '-b', 'feature');
  const two = onMain(t,
    BASE_SPEC.replace('MUST have a number', 'MUST have a short number')
      .replace('An export MUST be a CSV file.', 'An export MUST be a CSV file.\n\n<!-- INV-4 rule -->\n\nAn invoice MUST have a date.'),
    `${BASE_CS}\n${doc([['SP-5 rule', 'The link MUST expire.']])}`);
  git(two, 'checkout', '-q', '-b', 'other-feature');
  for (const dir of [one, two]) {
    write(dir, SPEC, BRANCH_SPEC);
    write(dir, CS, BRANCH_CS);
    index(dir);
  }
  const first = records(one);
  assert.deepEqual(records(two), first, 'another branch and another base give the same per-doc records');

  // The same files committed on main, with no branch at all.
  const three = onMain(t, BRANCH_SPEC, BRANCH_CS);
  index(three);
  assert.deepEqual(records(three), first, 'main gives the same per-doc records as a branch');
});

test('right after a branch that ran al index is merged, al index on main writes nothing and says "No record changed"', (t) => {
  const dir = onMain(t);
  index(dir);
  commitAll(dir, 'index on main');
  git(dir, 'checkout', '-q', '-b', 'feature');
  write(dir, SPEC, BRANCH_SPEC);
  write(dir, CS, BRANCH_CS);
  index(dir);
  commitAll(dir, 'the change, indexed on the branch');
  git(dir, 'checkout', '-q', 'main');
  git(dir, 'merge', '-q', '--no-ff', '-m', 'merge feature', 'feature');

  const docsBefore = records(dir);
  const before = tree(dir);
  const r = index(dir);
  assert.deepEqual(records(dir), docsBefore, `al index on main rewrites no per-doc record:\n${show(r)}`);
  assert.deepEqual(tree(dir), before, `al index on main writes no file:\n${show(r)}`);
  assert.match(r.stdout, /No record changed/, show(r));
});

test('a stale change field and removed list in a committed record (as main holds today) go on the next al index on main', (t) => {
  const dir = onMain(t);
  index(dir);
  const clean = read(dir, docRecordPath(SPEC));
  const rec = parse(clean);
  rec.paragraphs[1].change = ['Changed'];
  rec.paragraphs[2].change = ['New'];
  rec.removed = ['INV-8'];
  writeYaml(dir, docRecordPath(SPEC), rec);
  commitAll(dir, 'a record with stale change fields');
  index(dir);
  onlyRegenerable(dir, SPEC);
  assert.equal(read(dir, docRecordPath(SPEC)), clean, 'rebuilt as a clean index writes it');
});

test('a stale change field and removed list go on the next al index on a branch that changes the doc', (t) => {
  const dir = onMain(t);
  index(dir);
  const rec = docRecord(dir, SPEC);
  rec.paragraphs[0].change = ['Moved'];
  rec.removed = ['INV-8'];
  writeYaml(dir, docRecordPath(SPEC), rec);
  commitAll(dir, 'a record with stale change fields');
  git(dir, 'checkout', '-q', '-b', 'feature');
  write(dir, SPEC, BRANCH_SPEC);
  write(dir, CS, BRANCH_CS);
  index(dir);
  onlyRegenerable(dir, SPEC);
  onlyRegenerable(dir, CS);
});

test('a hint is still kept by ID, on a branch that moves and changes other paragraphs', (t) => {
  const dir = onMain(t);
  index(dir);
  const rec = docRecord(dir, SPEC);
  const inv5 = rec.paragraphs.find((p) => p.id === 'INV-5');
  const hint = { basis_sha256: inv5.text_sha256, summary: 'An invoice has a customer.', quote: { exact: 'MUST have a customer' } };
  inv5.hint = hint;
  writeYaml(dir, docRecordPath(SPEC), rec);
  commitAll(dir, 'a hint on INV-5');
  git(dir, 'checkout', '-q', '-b', 'feature');
  write(dir, SPEC, BRANCH_SPEC);
  index(dir);
  const after = onlyRegenerable(dir, SPEC);
  assert.deepEqual(after.paragraphs.find((p) => p.id === 'INV-5').hint, hint, 'the moved INV-5 keeps its hint');
});

test('al check on a branch still names a changed paragraph, though the record holds no change field', (t) => {
  const dir = onMain(t);
  index(dir);
  commitAll(dir, 'index on main');
  git(dir, 'checkout', '-q', '-b', 'feature');
  write(dir, SPEC, BRANCH_SPEC);
  index(dir);
  commitAll(dir, 'the change, indexed on the branch');
  const r = al(dir, ['check']);
  const lines = r.stdout.split('\n');
  for (const line of ['specs/invoices.md INV-2 Changed', 'specs/invoices.md INV-4 New', 'specs/invoices.md INV-5 Moved']) {
    assert.ok(lines.includes(line), `line ${JSON.stringify(line)} expected:\n${show(r)}`);
  }
  onlyRegenerable(dir, SPEC);
});
