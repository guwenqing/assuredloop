// Per-doc records written by al-v4 index (#175).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
import {
  HEX64, commitAll, doc, docRecord, docRecordPath, editFile, exists, git, index, move, newRequest, paragraph, project,
  read, tree, write, writeConfig, writeYaml,
} from './helpers/project.js';

const SPEC = 'specs/invoices.md';
const BASE_DOC = `An intro with no ID.\n\n${doc([
  ['INV-1 note', '# Invoices'],
  ['INV-2 rule', 'An invoice MUST have a number.'],
  ['INV-5 rule', 'An invoice MUST have a customer.'],
  ['INV-6 rule', 'An invoice MUST have a total.'],
  ['INV-9 rule', 'An invoice MAY have a note.'],
  ['INV-3 note', '## Exports'],
  ['INV-7 rule', 'An export MUST be a CSV file.'],
])}`;

function committed(t) {
  const dir = project(t);
  writeConfig(dir);
  write(dir, SPEC, BASE_DOC);
  commitAll(dir, 'base');
  return dir;
}

test('index writes the per-doc record: schema, file, each ID with kind, text_sha256 and display', (t) => {
  const dir = committed(t);
  const r = index(dir);
  assert.doesNotMatch(r.stdout, /base unknown/, 'main exists');
  const rec = docRecord(dir, SPEC);
  assert.equal(rec.schema, 'assuredloop/1');
  assert.equal(rec.file, SPEC);
  assert.ok(!('status' in rec), 'status is for ADRs only');
  assert.ok(!('removed' in rec), 'nothing removed');
  assert.deepEqual(rec.paragraphs.map((p) => [p.id, p.kind]), [
    ['INV-1', 'note'], ['INV-2', 'rule'], ['INV-5', 'rule'], ['INV-6', 'rule'], ['INV-9', 'rule'],
    ['INV-3', 'note'], ['INV-7', 'rule'],
  ], 'every paragraph with an ID, in order; the intro with no ID is not listed');
  for (const p of rec.paragraphs) {
    assert.match(p.text_sha256, HEX64);
    assert.ok(p.display !== undefined && p.display !== null && p.display !== '', `${p.id} has a display number`);
    assert.ok(!('change' in p), `${p.id} is unchanged against the base`);
    for (const k of Object.keys(p)) assert.ok(['id', 'kind', 'text_sha256', 'display'].includes(k), `${p.id}: ${k}`);
  }
  assert.equal(new Set(rec.paragraphs.map((p) => p.text_sha256)).size, rec.paragraphs.length);
});

test('change kinds against the base commit, and the removed list', (t) => {
  const dir = committed(t);
  git(dir, 'checkout', '-q', '-b', 'feature');
  write(dir, SPEC, `An intro with no ID.\n\n${doc([
    ['INV-1 note', '# Invoices'],
    ['INV-2 rule', 'An invoice MUST have a unique number.'],
    ['INV-4 rule', 'An invoice MUST have a date.'],
    ['INV-3 note', '## Exports'],
    ['INV-7 rule', 'An export MUST be a CSV file.'],
    ['INV-5 rule', 'An invoice MUST have a customer.'],
    ['INV-6 rule', 'An export MUST show the total.'],
  ])}`);
  index(dir);
  const rec = docRecord(dir, SPEC);
  const change = (id) => paragraph(dir, SPEC, id).change;
  assert.equal(change('INV-1'), undefined, 'unchanged: no change field');
  assert.deepEqual(change('INV-2'), ['Changed']);
  assert.deepEqual(change('INV-4'), ['New']);
  assert.ok(change('INV-5')?.includes('Moved') && !change('INV-5').includes('Changed'), `INV-5: ${change('INV-5')}`);
  assert.ok(change('INV-6')?.includes('Moved') && change('INV-6').includes('Changed'), `INV-6: ${change('INV-6')}`);
  assert.deepEqual(rec.removed, ['INV-9']);
  assert.ok(!rec.paragraphs.some((p) => p.id === 'INV-9'));
});

test('an ADR in specs/adr/ gets a record with its status, though config does not list it', (t) => {
  const dir = committed(t);
  const adr = 'specs/adr/0004-one-time-tokens.md';
  write(dir, adr, `Status: proposed\n\n${doc([
    ['ADR-4 choice', '# ADR-4: One-time tokens'],
    ['ADR-4-1 rationale', 'Context: a link must be cancellable.'],
  ])}`);
  index(dir);
  let rec = docRecord(dir, adr);
  assert.equal(rec.file, adr);
  assert.equal(rec.status, 'proposed');
  assert.deepEqual(rec.paragraphs.map((p) => [p.id, p.kind]), [['ADR-4', 'choice'], ['ADR-4-1', 'rationale']]);
  for (const s of ['accepted', 'superseded']) {
    editFile(dir, adr, /^Status: \w+/.exec(read(dir, adr))[0], `Status: ${s}`);
    index(dir);
    rec = docRecord(dir, adr);
    assert.equal(rec.status, s);
  }
});

test('a change spec of an open request gets a per-doc record; an archived one is never indexed nor its record written', (t) => {
  const dir = committed(t);
  newRequest(dir, 'inv');
  write(dir, 'requests/inv/spec.md', doc([['SP-1 rule', 'The export MUST be a CSV file.']]));
  newRequest(dir, 'old');
  write(dir, 'requests/old/spec.md', doc([['SP-1 rule', 'An old rule.']]));
  write(dir, 'requests/old/request.md', `${read(dir, 'requests/old/request.md')}\n## Organized requirement\n\n<!-- R1 -->\n\n### R1 Old\nOld text.\n`);
  move(dir, 'requests/old', 'requests/archive/old');
  const oldRecord = read(dir, '.assuredloop/records/requests/old.yaml');
  index(dir);
  assert.deepEqual(paragraph(dir, 'requests/inv/spec.md', 'SP-1').kind, 'rule');
  assert.equal(read(dir, '.assuredloop/records/requests/old.yaml'), oldRecord, 'an archived record is never written');
  assert.ok(!exists(dir, docRecordPath('requests/archive/old/spec.md')));
  assert.ok(!exists(dir, docRecordPath('requests/old/spec.md')));
});

test('index keeps a hint as is and overwrites anything typed into the regenerable fields', (t) => {
  const dir = committed(t);
  index(dir);
  const first = read(dir, docRecordPath(SPEC));
  const rec = parse(first);
  const hint = {
    basis_sha256: rec.paragraphs[1].text_sha256,
    summary: 'An invoice has a number.',
    tags: ['invoice', 'number'],
    quote: { exact: 'MUST have a number' },
  };
  rec.paragraphs[1].hint = hint;
  rec.paragraphs[2].text_sha256 = 'f'.repeat(64);
  rec.paragraphs[2].kind = 'limit';
  rec.paragraphs[2].display = '99';
  rec.paragraphs[3].change = ['New'];
  writeYaml(dir, docRecordPath(SPEC), rec);
  index(dir);
  const after = docRecord(dir, SPEC);
  const expected = parse(first);
  expected.paragraphs[1].hint = hint;
  assert.deepEqual(after, expected);
});

test('index lists each stale hint, and only those', (t) => {
  const dir = project(t);
  writeConfig(dir);
  write(dir, SPEC, doc([
    ['INV-1 rule', 'A link MUST expire.'],
    ['INV-2 rule', 'A link MUST be signed.'],
    ['INV-3 rule', 'A link MUST name the invoice.'],
    ['INV-4 rule', 'The total is a sum. The total is shown.'],
    ['INV-5 rule', 'The date is ISO. The date is shown.'],
    ['INV-6 rule', 'A paragraph with no hint.'],
    ['INV-7 rule', 'A hint with no quote.'],
  ]));
  index(dir);
  const rec = docRecord(dir, SPEC);
  const h = (i) => rec.paragraphs[i].text_sha256;
  const hints = [
    { basis_sha256: h(0), summary: 'fresh', quote: { exact: 'MUST expire' } },
    { basis_sha256: 'a'.repeat(64), summary: 'made from another text', quote: { exact: 'MUST be signed' } },
    { basis_sha256: h(2), summary: 'quote not in the text', quote: { exact: 'MUST name the customer' } },
    { basis_sha256: h(3), summary: 'quote twice, no prefix or suffix', quote: { exact: 'The total is' } },
    { basis_sha256: h(4), summary: 'quote twice, with a prefix', quote: { exact: 'The date is', prefix: 'ISO. ' } },
    undefined,
    { basis_sha256: h(6), summary: 'no quote', tags: ['hint'] },
  ];
  hints.forEach((hint, i) => { if (hint) rec.paragraphs[i].hint = hint; });
  writeYaml(dir, docRecordPath(SPEC), rec);

  const r = index(dir);
  const listed = r.stdout.split('\n').filter((l) => l.startsWith('refresh hint: '));
  const named = (id) => listed.some((l) => new RegExp(`^refresh hint: \\S*specs/invoices\\.md\\S* ${id}$`).test(l));
  assert.deepEqual(['INV-1', 'INV-2', 'INV-3', 'INV-4', 'INV-5', 'INV-6', 'INV-7'].filter(named),
    ['INV-2', 'INV-3', 'INV-4'], r.stdout);
  assert.equal(listed.length, 3, r.stdout);
  assert.deepEqual(docRecord(dir, SPEC).paragraphs[1].hint, hints[1], 'a stale hint is kept');
});

test('a per-doc record that is not YAML (a merge conflict) is rebuilt with no hints, and "hints dropped" is printed', (t) => {
  const dir = committed(t);
  index(dir);
  const clean = read(dir, docRecordPath(SPEC));
  const conflicted = [
    '<<<<<<< HEAD',
    'schema: assuredloop/1',
    'paragraphs:',
    '  - id: INV-1',
    '    hint: {summary: ours}',
    '=======',
    'paragraphs:',
    '  - id: INV-1',
    '    hint: {summary: theirs}',
    '>>>>>>> other',
    '',
  ].join('\n');
  assert.throws(() => parse(conflicted), 'the test record is not YAML');
  write(dir, docRecordPath(SPEC), conflicted);
  const r = index(dir);
  assert.ok(r.stdout.split('\n').some((l) => l.includes('specs/invoices.md') && l.includes('hints dropped')), r.stdout);
  assert.equal(read(dir, docRecordPath(SPEC)), clean, 'rebuilt as a clean index writes it');
});

test('a second index leaves every per-doc record byte for byte the same', (t) => {
  const dir = committed(t);
  git(dir, 'checkout', '-q', '-b', 'feature');
  editFile(dir, SPEC, 'MUST have a number', 'MUST have a unique number');
  index(dir);
  const before = tree(dir);
  index(dir);
  assert.deepEqual(tree(dir), before);
});
