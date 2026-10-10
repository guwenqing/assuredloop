// The binding rules: frozen bindings, lost bindings, new links, --align, and
// a second index that changes nothing (#175).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INVOICES, WORDS_FILE, appendSection, baseProject, binding, bindingsOf, commitAll, doc, docRecordPath, editFile,
  editRecord, editRequest, git, hashOf, index, newRequest, ok, organized, project, read, record, refused, req, tree,
  write, writeConfig, writeYaml,
} from './helpers/project.js';
import { parse } from 'yaml';

const SPEC = 'specs/invoices.md';
const CS = 'requests/inv/spec.md';
const R1 = req('R1', 'Monthly CSV download', 'A user MUST be able to download one month as one CSV file.', [WORDS_FILE]);
const R2 = req('R2', 'An email link that expires', 'The link MUST stop working after a short time.', [WORDS_FILE]);
const R2b = req('R2', 'An email link that expires', 'The link MUST stop working after 30 minutes.', [WORDS_FILE]);
const SP1 = 'The export link MUST expire 30 minutes after the email is sent.';
const SP1b = 'The export link MUST expire 20 minutes after the email is sent.';
const CHANGE_SPEC = doc([
  ['SP-1 rule serves:R2 builds-on:INV-12', SP1],
  ['SP-2 rule builds-on:INV-12', 'An export MUST name the invoice number.'],
]);
const R2_FROM = ['inv/R2', 'from', `inv/${WORDS_FILE}`];

// The request inv and its change spec, on top of what is in dir.
function addRequest(dir) {
  newRequest(dir, 'inv');
  appendSection(dir, 'inv', organized([R1, R2]));
  write(dir, CS, CHANGE_SPEC);
}

// Branch feature off main; the request is new there; indexed once.
function bound(t) {
  const dir = baseProject(t);
  addRequest(dir);
  index(dir);
  return dir;
}

// The three texts change: INV-12, SP-1 and R2.
function changeTexts(dir) {
  editFile(dir, SPEC, 'An invoice has a number', 'An invoice has a unique number');
  editFile(dir, CS, SP1, SP1b);
  editRequest(dir, 'inv', R2.text, R2b.text);
}

// On main: the request, indexed (its links are new there) and committed with
// its bindings. Then branch feature, and the bindings of SP-1 builds-on INV-12
// and R2 from the words are deleted from the record by hand.
function lost(t) {
  const dir = baseProject(t, { branch: null });
  addRequest(dir);
  index(dir);
  binding(record(dir, 'inv'), 'inv/SP-1', 'builds-on', 'INV-12');
  binding(record(dir, 'inv'), ...R2_FROM);
  commitAll(dir, 'the request and its bindings');
  git(dir, 'checkout', '-q', '-b', 'feature');
  editRecord(dir, 'inv', (rec) => {
    rec.bindings = rec.bindings.filter((b) =>
      !(b.from === 'inv/SP-1' && b.link === 'builds-on') && !(b.from === 'inv/R2' && b.link === 'from'));
  });
  return dir;
}

const unknownLine = (from, link, to) => new RegExp(`^binding unknown: ${from} ${link} ${to}$`, 'm');

test('indexing again never advances a binding, whatever changed in either text', (t) => {
  const dir = bound(t);
  const before = record(dir, 'inv').bindings;
  assert.equal(before.length, 5, 'R1 from, R2 from, SP-1 serves, SP-1 builds-on, SP-2 builds-on');
  changeTexts(dir);
  index(dir);
  const rec = record(dir, 'inv');
  assert.deepEqual(rec.bindings, before);
  assert.deepEqual(rec.requirements.at(-1), { id: 'R2', version: 2, sha256: R2b.sha256, title: R2b.title });
  const b = binding(rec, 'inv/SP-1', 'builds-on', 'INV-12');
  assert.notEqual(hashOf(dir, SPEC, 'INV-12'), b.to_sha256, 'the target text did change');
  assert.notEqual(hashOf(dir, CS, 'SP-1'), b.from_sha256, 'the source text did change');
  assert.equal(binding(rec, 'inv/SP-1', 'serves', 'inv/R2').to_version, 1);
  index(dir);
  assert.deepEqual(record(dir, 'inv').bindings, before);
});

test('a lost binding is not bound again: "binding unknown", and still so on the next index', (t) => {
  const dir = lost(t);
  for (let run = 1; run <= 2; run += 1) {
    const r = index(dir);
    const rec = record(dir, 'inv');
    assert.equal(bindingsOf(rec, 'inv/SP-1', 'builds-on', 'INV-12').length, 0, `run ${run}`);
    assert.equal(bindingsOf(rec, ...R2_FROM).length, 0, `run ${run}`);
    assert.match(r.stdout, unknownLine('inv/SP-1', 'builds-on', 'INV-12'), `run ${run}`);
    assert.match(r.stdout, unknownLine(...R2_FROM), `run ${run}`);
    binding(rec, 'inv/SP-1', 'serves', 'inv/R2');
    binding(rec, 'inv/SP-2', 'builds-on', 'INV-12');
  }
});

test('a new link on a branch is bound with the hashes of now, beside a lost one', (t) => {
  const dir = lost(t);
  write(dir, CS, `${read(dir, CS)}\n${doc([['SP-3 rule builds-on:INV-13', 'An export MUST skip an empty invoice.']])}`);
  editFile(dir, CS, '<!-- SP-2 rule builds-on:INV-12 -->', '<!-- SP-2 rule builds-on:INV-12,INV-41 -->');
  const r = index(dir);
  const rec = record(dir, 'inv');
  assert.deepEqual(binding(rec, 'inv/SP-3', 'builds-on', 'INV-13'), {
    from: 'inv/SP-3', link: 'builds-on', to: 'INV-13',
    from_sha256: hashOf(dir, CS, 'SP-3'), to_sha256: hashOf(dir, SPEC, 'INV-13'),
  });
  assert.deepEqual(binding(rec, 'inv/SP-2', 'builds-on', 'INV-41'), {
    from: 'inv/SP-2', link: 'builds-on', to: 'INV-41',
    from_sha256: hashOf(dir, CS, 'SP-2'), to_sha256: hashOf(dir, SPEC, 'INV-41'),
  });
  assert.match(r.stdout, unknownLine('inv/SP-1', 'builds-on', 'INV-12'));
  assert.doesNotMatch(r.stdout, /binding unknown: inv\/SP-[23] /);
});

test('with no main, the base is HEAD: a committed link with no binding is unknown, a new one is bound', (t) => {
  const dir = project(t, { branch: 'work' });
  writeConfig(dir);
  write(dir, SPEC, INVOICES);
  addRequest(dir);
  commitAll(dir, 'on work only');
  write(dir, CS, `${CHANGE_SPEC}\n${doc([['SP-3 rule builds-on:INV-13', 'An export MUST skip an empty invoice.']])}`);
  const r = index(dir);
  assert.match(r.stdout, /base unknown/);
  assert.match(r.stdout, unknownLine('inv/SP-1', 'builds-on', 'INV-12'));
  const rec = record(dir, 'inv');
  assert.equal(bindingsOf(rec, 'inv/SP-1', 'builds-on', 'INV-12').length, 0);
  binding(rec, 'inv/SP-3', 'builds-on', 'INV-13');
});

test('with no commit at all, every link is new and bound; "base unknown" is printed', (t) => {
  const dir = project(t);
  writeConfig(dir);
  write(dir, SPEC, INVOICES);
  addRequest(dir);
  const r = index(dir);
  assert.match(r.stdout, /base unknown/);
  assert.doesNotMatch(r.stdout, /binding unknown:/);
  const rec = record(dir, 'inv');
  for (const [from, link, to] of [
    ['inv/SP-1', 'serves', 'inv/R2'], ['inv/SP-1', 'builds-on', 'INV-12'], ['inv/SP-2', 'builds-on', 'INV-12'],
    ['inv/R1', 'from', `inv/${WORDS_FILE}`], R2_FROM,
  ]) binding(rec, from, link, to);
});

test('a link removed from its marker keeps its binding as history', (t) => {
  const dir = bound(t);
  const old = binding(record(dir, 'inv'), 'inv/SP-1', 'builds-on', 'INV-12');
  editFile(dir, CS, '<!-- SP-1 rule serves:R2 builds-on:INV-12 -->', '<!-- SP-1 rule serves:R2 -->');
  index(dir);
  assert.deepEqual(binding(record(dir, 'inv'), 'inv/SP-1', 'builds-on', 'INV-12'), old);
});

test('--align <ID> sets that paragraph\'s bindings to now and leaves the others', (t) => {
  const dir = bound(t);
  const before = record(dir, 'inv');
  changeTexts(dir);
  ok(dir, ['index', '--align', 'inv/SP-1']);
  const rec = record(dir, 'inv');
  const sp1 = hashOf(dir, CS, 'SP-1');
  assert.deepEqual(binding(rec, 'inv/SP-1', 'builds-on', 'INV-12'), {
    from: 'inv/SP-1', link: 'builds-on', to: 'INV-12', from_sha256: sp1, to_sha256: hashOf(dir, SPEC, 'INV-12'),
  });
  assert.deepEqual(binding(rec, 'inv/SP-1', 'serves', 'inv/R2'), {
    from: 'inv/SP-1', link: 'serves', to: 'inv/R2', from_sha256: sp1, to_sha256: R2b.sha256, to_version: 2,
  });
  assert.deepEqual(binding(rec, 'inv/SP-2', 'builds-on', 'INV-12'), binding(before, 'inv/SP-2', 'builds-on', 'INV-12'));
  assert.deepEqual(binding(rec, ...R2_FROM), binding(before, ...R2_FROM));
  assert.deepEqual(rec.requirements.at(-1), { id: 'R2', version: 2, sha256: R2b.sha256, title: R2b.title },
    'align also does what a plain index does');
});

test('--align binds a lost link again; the next index has no "binding unknown" for it', (t) => {
  const dir = lost(t);
  ok(dir, ['index', '--align', 'inv/SP-1']);
  assert.deepEqual(binding(record(dir, 'inv'), 'inv/SP-1', 'builds-on', 'INV-12'), {
    from: 'inv/SP-1', link: 'builds-on', to: 'INV-12',
    from_sha256: hashOf(dir, CS, 'SP-1'), to_sha256: hashOf(dir, SPEC, 'INV-12'),
  });
  const r = index(dir);
  assert.doesNotMatch(r.stdout, /binding unknown: inv\/SP-1 /);
  assert.match(r.stdout, unknownLine(...R2_FROM), 'R2 was not aligned');
});

test('--align a requirement sets its from: bindings; --align a spec ID sets that paragraph\'s', (t) => {
  const dir = bound(t);
  write(dir, SPEC, `${read(dir, SPEC)}\n${doc([['INV-42 rule serves:inv/R2', 'An export link MUST name one month.']])}`);
  index(dir);
  const before = record(dir, 'inv');
  binding(before, 'INV-42', 'serves', 'inv/R2');
  editRequest(dir, 'inv', R2.text, R2b.text);
  editFile(dir, SPEC, 'MUST name one month', 'MUST name one month and one customer');

  ok(dir, ['index', '--align', 'inv/R2']);
  let rec = record(dir, 'inv');
  assert.deepEqual(binding(rec, ...R2_FROM), {
    from: 'inv/R2', link: 'from', to: `inv/${WORDS_FILE}`,
    from_sha256: R2b.sha256, to_sha256: rec.sources[0].sha256,
  });
  assert.deepEqual(binding(rec, 'inv/SP-1', 'serves', 'inv/R2'), binding(before, 'inv/SP-1', 'serves', 'inv/R2'));
  assert.deepEqual(binding(rec, 'INV-42', 'serves', 'inv/R2'), binding(before, 'INV-42', 'serves', 'inv/R2'));

  ok(dir, ['index', '--align', 'INV-42']);
  rec = record(dir, 'inv');
  assert.deepEqual(binding(rec, 'INV-42', 'serves', 'inv/R2'), {
    from: 'INV-42', link: 'serves', to: 'inv/R2',
    from_sha256: hashOf(dir, SPEC, 'INV-42'), to_sha256: R2b.sha256, to_version: 2,
  });
});

test('--align refuses an ID that is not found', (t) => {
  const dir = bound(t);
  changeTexts(dir);
  for (const id of ['inv/SP-99', 'INV-999', 'inv/R9', 'nope/SP-1']) refused(dir, ['index', '--align', id]);
});

test('a second index leaves every record byte for byte the same', (t) => {
  const dir = bound(t);
  newRequest(dir, 'other');
  appendSection(dir, 'other', organized([req('R1', 'Yearly ZIP', 'A year MUST be one ZIP file.')]));
  ok(dir, ['record', 'inv', 'signoff', '--source', 'owner', '--yes']);
  ok(dir, ['record', 'inv', 'decision', '--source', 'owner', '--text', 'Thirty minutes.', '--yes']);
  write(dir, 'specs/adr/0004-one-time-tokens.md', `Status: accepted\n\n${doc([
    ['ADR-4 choice decides:INV-41 source:inv/D1 supersedes:ADR-3', '# ADR-4: One-time tokens'],
  ])}`);
  write(dir, SPEC, `${read(dir, SPEC)}\n${doc([['INV-43 rule serves:inv/R1,other/R1', 'An export MUST use ISO dates.']])}`);
  write(dir, 'src/export-link.js', 'export const minutes = 30;\n');
  editRecord(dir, 'inv', (rec) => {
    rec.outputs = [{ file: 'src/export-link.js', implements: ['INV-41'] }];
    rec.dispositions = [{ source: 'inv/SP-1', disposition: 'incorporated', spec: 'INV-41' }];
  });
  index(dir);
  const docRec = parse(read(dir, docRecordPath(SPEC)));
  docRec.paragraphs[0].hint = { from_sha256: docRec.paragraphs[0].text_sha256, summary: 'The title.' };
  writeYaml(dir, docRecordPath(SPEC), docRec);
  changeTexts(dir);
  index(dir);
  const first = tree(dir);
  index(dir);
  assert.deepEqual(tree(dir), first);
});
