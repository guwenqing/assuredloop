// No write through a symlink: a command whose destination path inside the
// project passes through a symlinked folder refuses and writes nothing,
// inside the repo or in the symlink's target (#175, review finding).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse } from 'yaml';
import {
  INVOICES, appendSection, doc, editFile, editRecord, exists, move, newRequest, ok, organized, project, read, record,
  refused, req, tree, write, writeConfig,
} from './helpers/project.js';

// A folder outside the project, removed when the test ends.
function outside(t) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-outside-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Moves the project folder or file rel out to `external` and puts a symlink in its place.
function symlinkOut(dir, rel, external) {
  rmSync(external, { recursive: true, force: true });
  renameSync(join(dir, rel), external);
  symlinkSync(external, join(dir, rel));
}

test('new refuses when .assuredloop is a symlink: no snapshot, no request.md, nothing outside', (t) => {
  const dir = project(t);
  const external = outside(t);
  symlinkSync(external, join(dir, '.assuredloop'));
  refused(dir, ['new', 'inv', '--from', '-'], { input: 'Owner words.\n' });
  assert.deepEqual(tree(external), {});
  assert.deepEqual(Object.keys(tree(dir)), ['.assuredloop']);
});

test('new refuses when requests/ is a symlink, and writes nothing outside', (t) => {
  const dir = project(t);
  const external = outside(t);
  symlinkSync(external, join(dir, 'requests'));
  refused(dir, ['new', 'inv', '--from', '-'], { input: 'Owner words.\n' });
  assert.deepEqual(tree(external), {});
  assert.deepEqual(Object.keys(tree(dir)), ['requests']);
});

test('record decision --yes refuses when .assuredloop/records/requests is a symlink', (t) => {
  const dir = project(t);
  newRequest(dir, 'inv');
  const external = join(outside(t), 'requests');
  symlinkOut(dir, '.assuredloop/records/requests', external);
  const before = tree(external);
  assert.deepEqual(Object.keys(before), ['inv.yaml']);
  refused(dir, ['record', 'inv', 'decision', '--source', 'owner', '--text', 'Thirty minutes.', '--yes']);
  assert.deepEqual(tree(external), before);
});

test('index refuses when .assuredloop/records is a symlink, and writes nothing', (t) => {
  const dir = project(t);
  writeConfig(dir);
  write(dir, 'specs/invoices.md', INVOICES);
  newRequest(dir, 'inv');
  write(dir, 'requests/inv/spec.md', doc([['SP-1 rule builds-on:INV-41', 'The link MUST expire after 20 minutes.']]));
  const external = join(outside(t), 'records');
  symlinkOut(dir, '.assuredloop/records', external);
  const before = tree(external);
  refused(dir, ['index']);
  assert.deepEqual(tree(external), before);
});

test('index refuses before any write when only the request records go through a symlink', (t) => {
  // No change spec here: its per-doc record would sit under records/requests/
  // too. So the per-doc records of specs/ come first among the writes, and
  // the request record, the one behind the symlink, comes after them.
  const dir = project(t);
  writeConfig(dir);
  write(dir, 'specs/invoices.md', INVOICES);
  newRequest(dir, 'inv');
  appendSection(dir, 'inv', organized([req('R1', 'Monthly CSV', 'A month MUST be one CSV file.')]));
  ok(dir, ['index']);
  assert.ok(exists(dir, '.assuredloop/records/specs/invoices.md.yaml'));
  // Now index would change one per-doc record, write a new one, and change
  // the request record (a new binding of INV-50 to inv/R1).
  editFile(dir, 'specs/invoices.md', 'MUST expire 30 minutes', 'MUST expire 25 minutes');
  write(dir, 'specs/invoices.md',
    `${read(dir, 'specs/invoices.md')}\n${doc([['INV-50 rule serves:inv/R1', 'An export MUST be one CSV file.']])}`);
  write(dir, 'specs/more.md', doc([['MORE-1 rule', 'A new doc MUST get a record.']]));
  const external = join(outside(t), 'requests');
  symlinkOut(dir, '.assuredloop/records/requests', external);
  const before = tree(external);
  assert.deepEqual(Object.keys(before), ['inv.yaml']);
  refused(dir, ['index']);
  assert.ok(!exists(dir, '.assuredloop/records/specs/more.md.yaml'));
  assert.deepEqual(tree(external), before);
});

// --- index reads nothing through a symlinked folder (#175, review finding)

// A folder outside the project with marked docs, linked in at rel.
function linkedDocs(t, dir, rel, files) {
  const external = outside(t);
  for (const [name, text] of Object.entries(files)) write(external, name, text);
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  symlinkSync(external, join(dir, rel));
  return external;
}
const OUT_DOC = doc([['X-1 rule', 'A rule outside the repo MUST hold.']]);
const OUT_ADR = `Status: accepted\n\n${doc([['ADR-1 choice decides:INV-41 source:inv/D1', '# ADR-1: Outside']])}`;
const recordPaths = (dir) => Object.keys(tree(dir)).filter((p) => p.startsWith('.assuredloop/records/'));

test('a config docs entry through a symlinked folder is not indexed; the other docs are', (t) => {
  const dir = project(t);
  writeConfig(dir, [{ file: 'specs/invoices.md', prefix: 'INV' }, { file: 'specs/alias/x.md', prefix: 'X' }]);
  write(dir, 'specs/invoices.md', INVOICES);
  const external = linkedDocs(t, dir, 'specs/alias', { 'x.md': OUT_DOC });
  const before = tree(external);
  const r = ok(dir, ['index']);
  assert.ok(r.stdout.split('\n').includes('not indexed: specs/alias/x.md: through a symlink'), r.stdout);
  assert.deepEqual(recordPaths(dir).filter((p) => p.startsWith('.assuredloop/records/specs/alias')), []);
  assert.ok(exists(dir, '.assuredloop/records/specs/invoices.md.yaml'), 'the other doc is indexed');
  assert.deepEqual(tree(external), before);
});

test('index refuses when the spec root specs/ is a symlink (no config), and writes nothing', (t) => {
  const dir = project(t);
  newRequest(dir, 'inv');
  const external = linkedDocs(t, dir, 'specs', { 'a.md': OUT_DOC, 'adr/0001-first.md': OUT_ADR });
  const before = tree(external);
  refused(dir, ['index']);
  assert.deepEqual(tree(external), before);
});

test('index refuses when the config root is a symlink, and writes nothing', (t) => {
  const dir = project(t);
  writeConfig(dir, [], { root: 'docs-spec' });
  newRequest(dir, 'inv');
  const external = linkedDocs(t, dir, 'docs-spec', { 'a.md': OUT_DOC, 'adr/0001-first.md': OUT_ADR });
  const before = tree(external);
  refused(dir, ['index']);
  assert.deepEqual(tree(external), before);
});

test('specs/adr through a symlink is not indexed: no ADR record, its links not bound', (t) => {
  const dir = project(t);
  write(dir, 'specs/invoices.md', INVOICES);
  newRequest(dir, 'inv');
  ok(dir, ['record', 'inv', 'decision', '--source', 'owner', '--text', 'Thirty minutes.', '--yes']);
  const external = linkedDocs(t, dir, 'specs/adr', { '0001-first.md': OUT_ADR });
  const before = tree(external);
  const r = ok(dir, ['index']);
  assert.ok(r.stdout.split('\n').includes('not indexed: specs/adr: through a symlink'), r.stdout);
  assert.deepEqual(recordPaths(dir).filter((p) => p.startsWith('.assuredloop/records/specs/adr')), []);
  assert.ok(exists(dir, '.assuredloop/records/specs/invoices.md.yaml'), 'the normal doc is indexed');
  assert.deepEqual(record(dir, 'inv').bindings.filter((b) => b.holder === 'ADR-1'), []);
  assert.deepEqual(tree(external), before);
});

test('index refuses when requests/ is a symlink to a folder with a request, and writes nothing', (t) => {
  const dir = project(t);
  write(dir, 'specs/invoices.md', INVOICES);
  newRequest(dir, 'inv');
  appendSection(dir, 'inv', organized([req('R1', 'Monthly CSV', 'A month MUST be one CSV file.')]));
  write(dir, 'requests/inv/spec.md', doc([['SP-1 rule serves:R1 builds-on:INV-41', 'The link MUST expire after 20 minutes.']]));
  const external = join(outside(t), 'requests');
  symlinkOut(dir, 'requests', external);
  const before = tree(external);
  assert.deepEqual(Object.keys(before).sort(), ['inv/origin/2026-05-04-owner-words.md', 'inv/request.md', 'inv/spec.md']);
  refused(dir, ['index']);
  assert.deepEqual(tree(external), before);
});

// --- index and the record commands read no file through a symlink (#175, review finding)

// An open request inv with a draft R1, and specs/invoices.md.
function draftProject(t) {
  const dir = project(t);
  write(dir, 'specs/invoices.md', INVOICES);
  newRequest(dir, 'inv');
  appendSection(dir, 'inv', organized([req('R1', 'Monthly CSV', 'A month MUST be one CSV file.')]));
  return dir;
}

// Moves the file rel out of the project and puts a symlink in its place; the
// outside path.
function fileOut(t, dir, rel) {
  const external = join(outside(t), rel.split('/').at(-1));
  symlinkOut(dir, rel, external);
  return external;
}

test('index refuses when an open request.md is a symlink to an outside file', (t) => {
  const dir = draftProject(t);
  const external = fileOut(t, dir, 'requests/inv/request.md');
  const text = readFileSync(external, 'utf8');
  assert.match(text, /### R1 Monthly CSV/);
  refused(dir, ['index']);
  assert.deepEqual(record(dir, 'inv').requirements, [], 'no version from the outside file');
  assert.equal(readFileSync(external, 'utf8'), text);
});

test('index refuses when an archived request.md is a symlink', (t) => {
  const dir = draftProject(t);
  newRequest(dir, 'old');
  move(dir, 'requests/old', 'requests/archive/old');
  const external = fileOut(t, dir, 'requests/archive/old/request.md');
  const text = readFileSync(external, 'utf8');
  refused(dir, ['index']);
  assert.equal(readFileSync(external, 'utf8'), text);
});

test('index refuses when requests/archive is a symlink to an outside folder with a request', (t) => {
  const dir = draftProject(t);
  newRequest(dir, 'old');
  move(dir, 'requests/old', 'requests/archive/old');
  const external = join(outside(t), 'archive');
  symlinkOut(dir, 'requests/archive', external);
  const before = tree(external);
  assert.ok(Object.keys(before).includes('old/request.md'));
  refused(dir, ['index']);
  assert.deepEqual(tree(external), before);
});

test('index refuses when the request record file is a symlink to an outside file', (t) => {
  const dir = draftProject(t);
  const external = fileOut(t, dir, '.assuredloop/records/requests/inv.yaml');
  const text = readFileSync(external, 'utf8');
  refused(dir, ['index']);
  assert.equal(readFileSync(external, 'utf8'), text, 'the outside record is unchanged');
});

test('record signoff refuses when request.md is a symlink: no snapshot, no record change', (t) => {
  const dir = draftProject(t);
  const external = fileOut(t, dir, 'requests/inv/request.md');
  const text = readFileSync(external, 'utf8');
  refused(dir, ['record', 'inv', 'signoff', '--source', 'x', '--yes']);
  assert.ok(!exists(dir, 'requests/inv/origin/2026-05-04-signoff.md'));
  assert.deepEqual(record(dir, 'inv').signoff, []);
  assert.equal(readFileSync(external, 'utf8'), text);
});

test('index refuses when a declared output file is a symlink to an outside file', (t) => {
  const dir = draftProject(t);
  write(dir, 'src/x.js', 'export const minutes = 30;\n');
  editRecord(dir, 'inv', (rec) => { rec.outputs = [{ file: 'src/x.js', implements: ['INV-41'] }]; });
  const external = fileOut(t, dir, 'src/x.js');
  refused(dir, ['index']);
  assert.equal(readFileSync(external, 'utf8'), 'export const minutes = 30;\n');
  assert.deepEqual(record(dir, 'inv').bindings.filter((b) => b.holder === 'src/x.js'), []);
});

// --- a symlinked folder or config refuses index even when it holds nothing
// (#175, review finding)

test('index refuses when requests/ is a symlink to an empty outside folder', (t) => {
  const dir = project(t);
  write(dir, 'specs/a.md', doc([['A-1 rule', 'An export MUST be a CSV file.']]));
  const external = outside(t);
  symlinkSync(external, join(dir, 'requests'));
  refused(dir, ['index']);
  assert.ok(!exists(dir, '.assuredloop/records/specs/a.md.yaml'));
  assert.deepEqual(tree(external), {});
});

test('index refuses when requests/archive is a symlink to an empty outside folder', (t) => {
  const dir = project(t);
  write(dir, 'specs/a.md', doc([['A-1 rule', 'An export MUST be a CSV file.']]));
  newRequest(dir, 'inv');
  const external = outside(t);
  symlinkSync(external, join(dir, 'requests/archive'));
  refused(dir, ['index']);
  assert.ok(!exists(dir, '.assuredloop/records/specs/a.md.yaml'));
  assert.deepEqual(tree(external), {});
});

test('index refuses when .assuredloop/config.yaml is a symlink to an outside file', (t) => {
  const dir = project(t);
  write(dir, 'docs-spec/a.md', doc([['A-1 rule', 'An export MUST be a CSV file.']]));
  mkdirSync(join(dir, '.assuredloop'));
  const external = join(outside(t), 'config.yaml');
  write(dirname(external), 'config.yaml', 'root: docs-spec\n');
  symlinkSync(external, join(dir, '.assuredloop/config.yaml'));
  refused(dir, ['index']);
  assert.ok(!exists(dir, '.assuredloop/records/docs-spec/a.md.yaml'));
  assert.equal(readFileSync(external, 'utf8'), 'root: docs-spec\n');
});

test('index refuses when an archived request record is a symlink to an outside file', (t) => {
  const dir = draftProject(t);
  newRequest(dir, 'old');
  move(dir, 'requests/old', 'requests/archive/old');
  const external = fileOut(t, dir, '.assuredloop/records/requests/old.yaml');
  const text = readFileSync(external, 'utf8');
  refused(dir, ['index']);
  assert.deepEqual(record(dir, 'inv').requirements, [], 'inv gets no requirement version');
  assert.equal(readFileSync(external, 'utf8'), text);
});

test('an archived request record that is real but not YAML does not stop index', (t) => {
  const dir = draftProject(t);
  newRequest(dir, 'old');
  move(dir, 'requests/old', 'requests/archive/old');
  const broken = '<<<<<<< HEAD\nrequest: old\n=======\nrequest: [old\n>>>>>>> other\n';
  assert.throws(() => parse(broken), 'the test record is not YAML');
  write(dir, '.assuredloop/records/requests/old.yaml', broken);
  ok(dir, ['index']);
  assert.deepEqual(record(dir, 'inv').requirements.map((v) => [v.id, v.version]), [['R1', 1]]);
  assert.equal(read(dir, '.assuredloop/records/requests/old.yaml'), broken, 'an archived record is never written');
});
