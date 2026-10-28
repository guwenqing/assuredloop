// #11, the request removed-links. Written before the code.
//
// R1 Records of removed links: when no current declaration has the same
// holder, the same link word and the same target any more, al index removes
// the binding from the request's record (open or archived) and names it in
// its output, one line per binding (grouping allowed). A link that is still
// declared keeps its binding, unchanged. A link that was declared at the base
// but lost its binding stays "binding unknown". When al index cannot read a
// doc or a record, it removes no binding in that run and says why.
//
// R2 A changed paragraph that holds a link: in the records of the open
// requests, a binding whose holder is a paragraph that still declares the
// link, and whose holder text changed since it was bound, gives the hint
// holder-changed (one per binding) until a judgement on it moves it (#88:
// al record <name> judgement --hint holder-changed --on <holder> --reason
// <why> --yes, which replaced al index --align <holder>). Output files,
// requirements and archived records are out. Nothing blocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { stringify } from 'yaml';
import { check } from './helpers/invoicer.js';
import {
  WORDS_FILE, al, appendSection, baseProject, bindingsOf, commitAll, doc, editFile, editRecord, editRequest, git, index,
  newRequest, ok, organized, read, readYaml, record, recordPath, req, show, tree, write, writeConfig, writeYaml,
} from './helpers/project.js';

const SPEC = 'specs/invoices.md';
const CS = 'requests/inv/spec.md';
const ADR4 = 'specs/adr/0004-line-rules.md';
const ADR5 = 'specs/adr/0005-line-checks.md';
const ADR6 = 'specs/adr/0006-line-totals.md';
const R1 = req('R1', 'Monthly CSV download', 'A user MUST be able to download one month as one CSV file.', [WORDS_FILE]);
const R1b = req('R1', 'Monthly CSV download', 'A user MUST be able to download one month or one year as one CSV file.', [WORDS_FILE]);
const R2 = req('R2', 'A line count', 'The export MUST show how many lines it holds.', [WORDS_FILE]);
const WORDS = `inv/${WORDS_FILE}`;

const adr = (id, links, title, status = 'accepted') => `Status: ${status}\n\n${doc([[`${id} choice ${links}`, `# ${id}: ${title}`]])}`;

// --- the output of al index

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The word w stands alone in s (not a part of a longer ID or path).
const token = (s, w) => new RegExp(`(^|[^\\w/.-])${esc(w)}($|[^\\w/-])`).test(s);
const removalLines = (r) => r.stdout.split('\n').filter((l) => /remov/i.test(l));
// A line of the output says that the binding [holder, link, target] was removed.
const namesRemoved = (r, [holder, link, target]) =>
  removalLines(r).some((l) => token(l, holder) && token(l, link) && token(l, target));

function reportsRemoved(r, b) {
  assert.ok(namesRemoved(r, b), `al index names the removed binding ${b.join(' ')} on a line that says "removed":\n${show(r)}`);
}
// No line reports a binding of this holder as removed (a holder all of whose
// links are still declared). rec is the record before the run. The holder's
// ID may still appear on a removal line as the target of another binding.
function namesNoRemoval(r, holder, rec) {
  const own = (rec.bindings ?? []).filter((b) => b.holder === holder);
  assert.ok(own.length > 0, `${holder} holds bindings in the record before the run`);
  for (const b of own) {
    const found = [b.holder, b.link, b.target];
    assert.ok(!namesRemoved(r, found), `no line reports ${found.join(' ')} as removed; its link is still declared:\n${show(r)}`);
  }
}

const oneBinding = (rec, [holder, link, target]) => {
  const found = bindingsOf(rec, holder, link, target);
  assert.equal(found.length, 1, `one binding ${holder} ${link} ${target}; bindings:\n${stringify(rec.bindings)}`);
  return found[0];
};
const noBinding = (rec, [holder, link, target], why = '') => {
  const found = bindingsOf(rec, holder, link, target);
  assert.deepEqual(found, [], `no binding ${holder} ${link} ${target} ${why}; bindings:\n${stringify(rec.bindings)}`);
};

// ============================================================================
// R1: the world of the removed links.
//
// main: config, specs/invoices.md, ADR-3. Branch feature: the request inv
// with R1, R2 (each from: the owner's words) and D1; a change spec, three
// more specs/ paragraphs, two ADRs and four declared outputs; indexed and
// committed.
const SP = {
  1: 'An export MUST hold one row per invoice line.',
  2: 'An export MUST skip an invoice with no line.',
  3: 'An export MUST count the lines of each invoice.',
  4: 'An export MUST show the line count in its header.',
  5: 'An export MUST name each line by its position.',
  6: 'An export MUST name the expiry time of its link.',
};
const INV = {
  60: 'A credit note MUST have at least one line.',
  61: 'A draft invoice MAY have no line.',
  62: 'A line MUST belong to one invoice.',
};
const CHANGE_SPEC = doc([
  ['SP-1 rule serves:R1 builds-on:INV-12,INV-13', SP[1]],
  ['SP-2 rule serves:R1 builds-on:INV-13', SP[2]],
  ['SP-3 rule serves:R1 builds-on:INV-13', SP[3]],
  ['SP-4 rule serves:R1 builds-on:INV-13', SP[4]],
  ['SP-5 rule serves:R1 builds-on:INV-13', SP[5]],
  ['SP-6 rule serves:R2 builds-on:INV-41', SP[6]],
]);
const SPEC_MORE = doc([
  ['INV-60 rule serves:inv/R1 builds-on:INV-13', INV[60]],
  ['INV-61 rule serves:inv/R1 builds-on:INV-13', INV[61]],
  ['INV-62 rule serves:inv/R1 builds-on:INV-13', INV[62]],
]);
const OUTPUTS = [
  { file: 'src/lines.js', implements: ['INV-13'] },
  { file: 'src/count.js', implements: ['INV-12', 'INV-13'] },
  { file: 'test/count.test.js', verifies: ['INV-13'] },
  { file: 'docs/export.md', documents: ['INV-13'] },
];

function linked(t) {
  const dir = baseProject(t);
  newRequest(dir, 'inv');
  appendSection(dir, 'inv', organized([R1, R2]));
  ok(dir, ['record', 'inv', 'decision', '--source', 'owner', '--text', 'Lines are checked on export.', '--clarifies', 'R1', '--yes']);
  write(dir, CS, CHANGE_SPEC);
  write(dir, SPEC, `${read(dir, SPEC)}\n${SPEC_MORE}`);
  write(dir, ADR4, adr('ADR-4', 'decides:INV-12,INV-13 source:inv/D1', 'Line rules'));
  write(dir, ADR5, adr('ADR-5', 'decides:INV-13 source:inv/D1', 'Line checks'));
  write(dir, 'src/lines.js', 'export const minLines = 1;\n');
  write(dir, 'src/count.js', 'export const count = (inv) => inv.lines.length;\n');
  write(dir, 'test/count.test.js', '// count\n');
  write(dir, 'docs/export.md', '# Export\n');
  editRecord(dir, 'inv', (rec) => { rec.outputs = OUTPUTS; });
  index(dir);
  commitAll(dir, 'The request inv and its links');
  return dir;
}

// The bindings whose links dropLinks takes away, as [holder, link, target].
const GONE = [
  ['inv/SP-1', 'builds-on', 'INV-13'], // one target of two dropped from the marker
  ['inv/SP-2', 'builds-on', 'INV-13'], // the marker names another target
  ['inv/SP-3', 'serves', 'inv/R1'], // the paragraph is deleted
  ['inv/SP-3', 'builds-on', 'INV-13'],
  ['inv/SP-5', 'builds-on', 'INV-13'], // another link word to the same target
  ['inv/SP-6', 'serves', 'inv/R2'], // the serves link moved to R1
  ['INV-60', 'builds-on', 'INV-13'], // a specs/ paragraph names another target
  ['INV-61', 'serves', 'inv/R1'], // a specs/ paragraph is deleted
  ['INV-61', 'builds-on', 'INV-13'],
  ['ADR-4', 'decides', 'INV-13'], // an ADR decides one ID less
  ['src/count.js', 'implements', 'INV-13'], // an output implements one ID less
  ['test/count.test.js', 'verifies', 'INV-13'], // an output entry is gone
  ['inv/R2', 'from', WORDS], // a requirement's marker dropped from:
];
// The bindings whose links are still declared after dropLinks.
const KEPT = [
  ['inv/SP-1', 'serves', 'inv/R1'],
  ['inv/SP-1', 'builds-on', 'INV-12'],
  ['inv/SP-2', 'serves', 'inv/R1'],
  ['inv/SP-4', 'serves', 'inv/R1'],
  ['inv/SP-4', 'builds-on', 'INV-13'],
  ['inv/SP-5', 'serves', 'inv/R1'],
  ['inv/SP-6', 'builds-on', 'INV-41'],
  ['INV-60', 'serves', 'inv/R1'],
  ['INV-62', 'serves', 'inv/R1'],
  ['INV-62', 'builds-on', 'INV-13'],
  ['ADR-4', 'decides', 'INV-12'],
  ['ADR-4', 'source', 'inv/D1'],
  ['ADR-5', 'decides', 'INV-13'],
  ['ADR-5', 'source', 'inv/D1'],
  ['src/lines.js', 'implements', 'INV-13'],
  ['src/count.js', 'implements', 'INV-12'],
  ['docs/export.md', 'documents', 'INV-13'],
  ['inv/R1', 'from', WORDS],
];
// The links that dropLinks declares new.
const NEW = [
  ['inv/SP-2', 'builds-on', 'INV-41'],
  ['inv/SP-5', 'changes', 'INV-13'],
  ['inv/SP-6', 'serves', 'inv/R1'],
  ['INV-60', 'builds-on', 'INV-41'],
];
// The holders whose links are all still declared: no line reports one of their bindings as removed.
const UNTOUCHED = ['inv/SP-4', 'INV-62', 'ADR-5', 'src/lines.js', 'docs/export.md', 'inv/R1'];

function dropLinks(dir) {
  editFile(dir, CS, '<!-- SP-1 rule serves:R1 builds-on:INV-12,INV-13 -->', '<!-- SP-1 rule serves:R1 builds-on:INV-12 -->');
  editFile(dir, CS, '<!-- SP-2 rule serves:R1 builds-on:INV-13 -->', '<!-- SP-2 rule serves:R1 builds-on:INV-41 -->');
  editFile(dir, CS, `<!-- SP-3 rule serves:R1 builds-on:INV-13 -->\n\n${SP[3]}\n\n`, '');
  editFile(dir, CS, '<!-- SP-5 rule serves:R1 builds-on:INV-13 -->', '<!-- SP-5 rule serves:R1 changes:INV-13 -->');
  editFile(dir, CS, '<!-- SP-6 rule serves:R2 builds-on:INV-41 -->', '<!-- SP-6 rule serves:R1 builds-on:INV-41 -->');
  editFile(dir, SPEC, '<!-- INV-60 rule serves:inv/R1 builds-on:INV-13 -->', '<!-- INV-60 rule serves:inv/R1 builds-on:INV-41 -->');
  editFile(dir, SPEC, `<!-- INV-61 rule serves:inv/R1 builds-on:INV-13 -->\n\n${INV[61]}\n\n`, '');
  editFile(dir, ADR4, 'decides:INV-12,INV-13', 'decides:INV-12');
  editRecord(dir, 'inv', (rec) => {
    rec.outputs = [
      { file: 'src/lines.js', implements: ['INV-13'] },
      { file: 'src/count.js', implements: ['INV-12'] },
      { file: 'docs/export.md', documents: ['INV-13'] },
    ];
  });
  editRequest(dir, 'inv', `<!-- R2 from:${WORDS_FILE} -->`, '<!-- R2 -->');
}

test('R1 world: before the links are dropped, every binding of GONE and KEPT is in the record of inv', (t) => {
  const dir = linked(t);
  const rec = record(dir, 'inv');
  for (const b of [...GONE, ...KEPT]) oneBinding(rec, b);
});

test('R1: al index removes the binding of each link that no marker and no outputs: entry declares any more, and names each one on a line that says removed', (t) => {
  const dir = linked(t);
  dropLinks(dir);
  const r = index(dir);
  const rec = record(dir, 'inv');
  for (const b of GONE) {
    noBinding(rec, b, 'after al index, as its link is no longer declared');
    reportsRemoved(r, b);
  }
});

test('R1: a link that is still declared keeps its binding, unchanged, also when its holder and its target changed in the same run; the new links are bound; no line reports a binding of a holder whose links all stay as removed', (t) => {
  const dir = linked(t);
  const before = record(dir, 'inv');
  const kept = new Map(KEPT.map((b) => [b.join(' '), oneBinding(before, b)]));
  dropLinks(dir);
  editFile(dir, CS, SP[4], 'An export MUST show the line count in its first line.');
  editFile(dir, SPEC, 'An invoice MUST have at least one line.', 'An invoice MUST have at least one line with an amount.');
  const r = index(dir);
  const rec = record(dir, 'inv');
  for (const b of KEPT) assert.deepEqual(oneBinding(rec, b), kept.get(b.join(' ')), `${b.join(' ')} unchanged`);
  for (const b of NEW) oneBinding(rec, b);
  for (const holder of UNTOUCHED) namesNoRemoval(r, holder, before);
});

test('R1: the next al index removes nothing more, says no removal for the bindings already gone, and leaves every file the same', (t) => {
  const dir = linked(t);
  dropLinks(dir);
  index(dir);
  const first = tree(dir);
  const r = index(dir);
  for (const b of GONE) assert.ok(!namesRemoved(r, b), `${b.join(' ')} is not reported again:\n${show(r)}`);
  assert.deepEqual(tree(dir), first, 'a second al index writes nothing');
});

test('R1: the supersedes: link of a new ADR and the decides: and source: links that the superseded ADR still declares keep their bindings, in a run that removes another binding', (t) => {
  const dir = linked(t);
  write(dir, ADR6, adr('ADR-6', 'decides:INV-13 source:inv/D1 supersedes:ADR-5', 'Line totals'));
  editFile(dir, ADR5, 'Status: accepted', 'Status: superseded by ADR-6');
  index(dir);
  commitAll(dir, 'ADR-6 supersedes ADR-5');
  const stays = [
    ['ADR-6', 'supersedes', 'ADR-5'], ['ADR-6', 'decides', 'INV-13'], ['ADR-6', 'source', 'inv/D1'],
    ['ADR-5', 'decides', 'INV-13'], ['ADR-5', 'source', 'inv/D1'],
  ];
  const before = record(dir, 'inv');
  const kept = new Map(stays.map((b) => [b.join(' '), oneBinding(before, b)]));
  editFile(dir, CS, '<!-- SP-2 rule serves:R1 builds-on:INV-13 -->', '<!-- SP-2 rule serves:R1 -->');
  const r = index(dir);
  const rec = record(dir, 'inv');
  noBinding(rec, ['inv/SP-2', 'builds-on', 'INV-13'], 'the control: its link is gone');
  reportsRemoved(r, ['inv/SP-2', 'builds-on', 'INV-13']);
  for (const b of stays) assert.deepEqual(oneBinding(rec, b), kept.get(b.join(' ')), `${b.join(' ')} unchanged`);
  for (const holder of ['ADR-5', 'ADR-6']) namesNoRemoval(r, holder, before);
});

test('R1: a link declared at the base whose binding was lost stays "binding unknown" and gets no binding, in a run that removes another binding', (t) => {
  const dir = baseProject(t, { branch: null });
  newRequest(dir, 'inv');
  appendSection(dir, 'inv', organized([R1]));
  write(dir, CS, doc([
    ['SP-1 rule serves:R1 builds-on:INV-12', SP[1]],
    ['SP-2 rule serves:R1 builds-on:INV-13', SP[2]],
  ]));
  index(dir);
  commitAll(dir, 'the request and its bindings');
  git(dir, 'checkout', '-q', '-b', 'feature');
  editRecord(dir, 'inv', (rec) => {
    rec.bindings = rec.bindings.filter((b) => !(b.holder === 'inv/SP-1' && b.link === 'builds-on'));
  });
  editFile(dir, CS, '<!-- SP-2 rule serves:R1 builds-on:INV-13 -->', '<!-- SP-2 rule serves:R1 -->');
  for (let run = 1; run <= 2; run += 1) {
    const r = index(dir);
    const rec = record(dir, 'inv');
    assert.match(r.stdout, /^binding unknown: inv\/SP-1 builds-on INV-12$/m, `run ${run}:\n${show(r)}`);
    noBinding(rec, ['inv/SP-1', 'builds-on', 'INV-12'], `run ${run}: a lost binding is never filled with today's value`);
    noBinding(rec, ['inv/SP-2', 'builds-on', 'INV-13'], `run ${run}: its link is gone`);
    oneBinding(rec, ['inv/SP-2', 'serves', 'inv/R1']);
    if (run === 1) reportsRemoved(r, ['inv/SP-2', 'builds-on', 'INV-13']);
  }
});

// --- archived requests

// main: config, specs/invoices.md. The request old, with a change spec, the
// specs/ paragraph INV-70 and a declared output, concluded and so archived.
// Then the open request inv with SP-1. Branch feature; committed. With
// `atBase`, old is concluded and committed on main before the branch
// feature, so it is archived at the base (#110: a request that the branch
// itself concludes is checked).
const OLD_SP1 = 'An export MUST hold one row per invoice line.';
const OLD_INV70 = 'An export MUST hold one row per invoice line, in the order of the lines.';
function archived(t, { atBase = false } = {}) {
  const dir = baseProject(t, atBase ? { branch: null } : {});
  newRequest(dir, 'old');
  appendSection(dir, 'old', organized([req('R1', 'Rows', 'One row per invoice line.', [WORDS_FILE])]));
  write(dir, 'requests/old/spec.md', doc([
    ['SP-1 rule serves:R1 builds-on:INV-13', OLD_SP1],
    ['SP-2 note builds-on:INV-12', 'One PR.'],
  ]));
  write(dir, SPEC, `${read(dir, SPEC)}\n${doc([['INV-70 rule serves:old/R1 builds-on:INV-13', OLD_INV70]])}`);
  write(dir, 'src/rows.js', 'export const rows = 1;\n');
  editRecord(dir, 'old', (rec) => { rec.outputs = [{ file: 'src/rows.js', implements: ['INV-13'] }]; });
  index(dir);
  ok(dir, ['record', 'old', 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
  editRecord(dir, 'old', (rec) => { rec.dispositions = [{ source: 'old/SP-1', disposition: 'incorporated', spec: 'INV-70' }]; });
  editFile(dir, SPEC, OLD_INV70, OLD_SP1);
  index(dir);
  ok(dir, ['conclude', 'old', '--yes']);
  if (atBase) {
    index(dir);
    commitAll(dir, 'Tier: 2 — old, concluded');
    git(dir, 'checkout', '-q', '-b', 'feature');
  }
  newRequest(dir, 'inv');
  appendSection(dir, 'inv', organized([R1]));
  write(dir, CS, doc([['SP-1 rule serves:R1 builds-on:INV-13', SP[1]]]));
  index(dir);
  commitAll(dir, atBase ? 'Tier: 2 — inv' : 'Tier: 2 — old, concluded; inv');
  return dir;
}

test('R1: in an archived request\'s record, the binding of a link that no marker declares any more is removed and named; the links that the archived change spec, request.md, outputs: and specs/ still declare keep their bindings', (t) => {
  const dir = archived(t);
  const before = record(dir, 'old');
  assert.equal(before.status, 'concluded', 'old is archived');
  const kept = [
    ['old/SP-1', 'serves', 'old/R1'], ['old/SP-1', 'builds-on', 'INV-13'], ['old/SP-2', 'builds-on', 'INV-12'],
    ['INV-70', 'serves', 'old/R1'], ['old/R1', 'from', `old/${WORDS_FILE}`], ['src/rows.js', 'implements', 'INV-13'],
  ];
  const keptBefore = new Map(kept.map((b) => [b.join(' '), oneBinding(before, b)]));
  oneBinding(before, ['INV-70', 'builds-on', 'INV-13']);
  editFile(dir, SPEC, '<!-- INV-70 rule serves:old/R1 builds-on:INV-13 -->', '<!-- INV-70 rule serves:old/R1 -->');
  const r = index(dir);
  const rec = record(dir, 'old');
  noBinding(rec, ['INV-70', 'builds-on', 'INV-13'], 'in the archived record, after al index');
  reportsRemoved(r, ['INV-70', 'builds-on', 'INV-13']);
  for (const b of kept) assert.deepEqual(oneBinding(rec, b), keptBefore.get(b.join(' ')), `${b.join(' ')} unchanged`);
  for (const holder of ['old/SP-1', 'old/SP-2', 'src/rows.js', 'old/R1']) namesNoRemoval(r, holder, before);
});

// --- a file that al index cannot read

// main: config with specs/invoices.md and specs/extra.md, ADR-3. Branch
// feature: the requests inv (R1, D1, a change spec, ADR-4) and other;
// EXT-1 in specs/extra.md; indexed and committed. Then SP-2 drops its link
// to INV-13, so a run that reads every file removes that one binding.
const EXTRA = doc([['EXT-1 rule serves:inv/R1 builds-on:INV-13', 'An extra MUST have one line.']]);
const EXT_BINDINGS = [['EXT-1', 'serves', 'inv/R1'], ['EXT-1', 'builds-on', 'INV-13']];
const SP2_GONE = ['inv/SP-2', 'builds-on', 'INV-13'];
function readable(t) {
  const dir = baseProject(t, { branch: null });
  writeConfig(dir, [{ file: SPEC, prefix: 'INV' }, { file: 'specs/extra.md', prefix: 'EXT' }]);
  write(dir, 'specs/extra.md', '<!-- EXT-0 note -->\n\n# Extra\n');
  commitAll(dir, 'the extra doc');
  git(dir, 'checkout', '-q', '-b', 'feature');
  write(dir, 'specs/extra.md', `${read(dir, 'specs/extra.md')}\n${EXTRA}`);
  newRequest(dir, 'inv');
  appendSection(dir, 'inv', organized([R1]));
  ok(dir, ['record', 'inv', 'decision', '--source', 'owner', '--text', 'Lines are checked on export.', '--clarifies', 'R1', '--yes']);
  write(dir, CS, doc([
    ['SP-1 rule serves:R1 builds-on:INV-13', SP[1]],
    ['SP-2 rule serves:R1 builds-on:INV-13', SP[2]],
  ]));
  write(dir, ADR4, adr('ADR-4', 'decides:INV-13 source:inv/D1', 'Line rules'));
  newRequest(dir, 'other');
  appendSection(dir, 'other', organized([req('R1', 'Yearly ZIP', 'A user MUST be able to download a year as one ZIP file.')]));
  index(dir);
  commitAll(dir, 'The requests inv and other');
  editFile(dir, CS, '<!-- SP-2 rule serves:R1 builds-on:INV-13 -->', '<!-- SP-2 rule serves:R1 -->');
  return dir;
}

// A run that could not read a file: no binding is removed, and the output
// names the file and says that no binding was removed.
function removesNothing(dir, r, file, before) {
  assert.deepEqual(record(dir, 'inv').bindings, before.bindings, `no binding of inv changes in this run:\n${show(r)}`);
  assert.ok(r.stdout.includes(file), `the output names ${file}:\n${show(r)}`);
  assert.ok(removalLines(r).length > 0, `a line says why no binding was removed:\n${show(r)}`);
  assert.ok(!namesRemoved(r, SP2_GONE), `no line reports ${SP2_GONE.join(' ')} as removed:\n${show(r)}`);
}

// The next run that reads every file removes the gone link, and only it.
function removesAfterFix(dir) {
  const r = index(dir);
  const rec = record(dir, 'inv');
  noBinding(rec, SP2_GONE, 'once every file can be read');
  reportsRemoved(r, SP2_GONE);
  for (const b of EXT_BINDINGS) oneBinding(rec, b);
  oneBinding(rec, ['ADR-4', 'decides', 'INV-13']);
  oneBinding(rec, ['inv/SP-1', 'builds-on', 'INV-13']);
}

test('R1 safety: a doc that config names is reached through a symlink: al index removes no binding in that run and says why; the next run with the doc back removes the gone link', (t) => {
  const dir = readable(t);
  const before = record(dir, 'inv');
  const text = read(dir, 'specs/extra.md');
  const out = join(dirname(dir), `${dir.split('/').pop()}-extra.md`);
  writeFileSync(out, text);
  rmSync(join(dir, 'specs/extra.md'));
  symlinkSync(out, join(dir, 'specs/extra.md'));
  t.after(() => rmSync(out, { force: true }));
  const r = index(dir);
  removesNothing(dir, r, 'specs/extra.md', before);
  for (const b of EXT_BINDINGS) assert.ok(!namesRemoved(r, b), `${b.join(' ')} never looks removed:\n${show(r)}`);
  rmSync(join(dir, 'specs/extra.md'));
  write(dir, 'specs/extra.md', text);
  removesAfterFix(dir);
});

test('R1 safety: config names a doc outside the repository: al index removes no binding in that run and says why; the next run without it removes the gone link', (t) => {
  const dir = readable(t);
  const before = record(dir, 'inv');
  const out = join(dirname(dir), `${dir.split('/').pop()}-outside.md`);
  writeFileSync(out, doc([['OUT-1 rule builds-on:INV-13', 'Outside text.']]));
  t.after(() => rmSync(out, { force: true }));
  const rel = `../${out.split('/').pop()}`;
  const docs = [{ file: SPEC, prefix: 'INV' }, { file: 'specs/extra.md', prefix: 'EXT' }];
  writeConfig(dir, [...docs, { file: rel, prefix: 'OUT' }]);
  const r = index(dir);
  removesNothing(dir, r, rel, before);
  writeConfig(dir, docs);
  removesAfterFix(dir);
});

test('R1 safety: another request\'s record is not valid YAML: al index removes no binding in that run and says why; the next run with the record back removes the gone link', (t) => {
  const dir = readable(t);
  const before = record(dir, 'inv');
  const good = read(dir, recordPath('other'));
  write(dir, recordPath('other'), `${good}bindings: [\n`);
  const r = al(dir, ['index']);
  assert.doesNotMatch(r.stdout + r.stderr, /internal error/, show(r));
  removesNothing(dir, r, recordPath('other'), before);
  write(dir, recordPath('other'), good);
  removesAfterFix(dir);
});

test('R1 safety: an ADR reached through a symlink never looks like removed links: its bindings stay and no removal line names them', (t) => {
  const dir = readable(t);
  const out = join(dirname(dir), `${dir.split('/').pop()}-adr.md`);
  writeFileSync(out, read(dir, ADR4));
  rmSync(join(dir, ADR4));
  symlinkSync(out, join(dir, ADR4));
  t.after(() => rmSync(out, { force: true }));
  const r = al(dir, ['index']);
  assert.doesNotMatch(r.stdout + r.stderr, /internal error/, show(r));
  const rec = record(dir, 'inv');
  for (const b of [['ADR-4', 'decides', 'INV-13'], ['ADR-4', 'source', 'inv/D1']]) {
    oneBinding(rec, b);
    assert.ok(!namesRemoved(r, b), `${b.join(' ')} never looks removed:\n${show(r)}`);
  }
});

test('R1 safety: a change spec reached through a symlink never looks like removed links: its bindings stay and no removal line names them', (t) => {
  const dir = readable(t);
  const out = join(dirname(dir), `${dir.split('/').pop()}-spec.md`);
  writeFileSync(out, read(dir, CS));
  rmSync(join(dir, CS));
  symlinkSync(out, join(dir, CS));
  t.after(() => rmSync(out, { force: true }));
  const r = al(dir, ['index']);
  assert.doesNotMatch(r.stdout + r.stderr, /internal error/, show(r));
  const rec = record(dir, 'inv');
  for (const b of [['inv/SP-1', 'serves', 'inv/R1'], ['inv/SP-1', 'builds-on', 'INV-13'], ['inv/SP-2', 'serves', 'inv/R1']]) {
    oneBinding(rec, b);
    assert.ok(!namesRemoved(r, b), `${b.join(' ')} never looks removed:\n${show(r)}`);
  }
});

// --- a file or folder that exists but cannot be read (mode 000)

// root reads a file or lists a folder whatever its mode, so a test that runs
// as root cannot make EACCES; these tests are skipped then.
const ROOT = process.getuid?.() === 0;
const SKIP_ROOT = ROOT && 'runs as root: root reads a file whatever its mode, so EACCES cannot be made';

// Runs fn while rel (a file or a folder) has mode 000, then gives the mode back.
// t.after gives it back too, so the temp dir can be removed if fn throws.
function unreadable(t, dir, rel, fn) {
  const path = join(dir, rel);
  const mode = statSync(path).mode & 0o777;
  t.after(() => { try { chmodSync(path, mode); } catch { /* already removed */ } });
  chmodSync(path, 0o000);
  try {
    return fn();
  } finally {
    chmodSync(path, mode);
  }
}

// One al index while a file it needs cannot be read. It removes no binding:
// either it stops (exit 2, an "al: " line that names the file; an
// "al: internal error: EACCES ..." line counts, as it writes nothing), or it
// runs (exit 0) and its output names the file and says why no binding was
// removed. names: the records to compare.
function indexRemovesNothing(t, dir, rel, names, gone) {
  const before = Object.fromEntries(names.map((n) => [n, record(dir, n).bindings]));
  const r = unreadable(t, dir, rel, () => al(dir, ['index']));
  const out = r.stdout + r.stderr;
  assert.ok(r.code === 0 || r.code === 2, show(r));
  for (const n of names) assert.deepEqual(record(dir, n).bindings, before[n], `no binding of ${n} changes in this run:\n${show(r)}`);
  assert.ok(out.includes(rel), `the output names ${rel}:\n${show(r)}`);
  if (r.code === 0) assert.ok(removalLines(r).length > 0, `a line says why no binding was removed:\n${show(r)}`);
  else assert.ok(out.split('\n').some((l) => l.startsWith('al: ') && l.includes(rel)), `an "al: " line that names ${rel}:\n${show(r)}`);
  assert.ok(!namesRemoved(r, gone), `no line reports ${gone.join(' ')} as removed:\n${show(r)}`);
  for (const n of names) {
    for (const b of before[n]) {
      const found = [b.holder, b.link, b.target];
      assert.ok(!namesRemoved(r, found), `${found.join(' ')} never looks removed:\n${show(r)}`);
    }
  }
  return r;
}

for (const [what, rel] of [
  ['an ADR (decides:INV-13 source:inv/D1)', ADR4],
  ['a spec doc that config names', 'specs/extra.md'],
  ['an open change spec', CS],
  ['an open request.md with from:', 'requests/inv/request.md'],
  ['the folder specs/adr/, which cannot be listed', 'specs/adr'],
]) {
  test(`R1 safety: ${what} exists but cannot be read (mode 000): al index removes no binding in that run and says why; the next run that reads it removes the gone link`, { skip: SKIP_ROOT }, (t) => {
    const dir = readable(t);
    indexRemovesNothing(t, dir, rel, ['inv', 'other'], SP2_GONE);
    removesAfterFix(dir);
  });
}

// The archived world, and a gone link in the archived record of old.
const INV70_GONE = ['INV-70', 'builds-on', 'INV-13'];
function archivedGone(t) {
  const dir = archived(t);
  editFile(dir, SPEC, '<!-- INV-70 rule serves:old/R1 builds-on:INV-13 -->', '<!-- INV-70 rule serves:old/R1 -->');
  return dir;
}

for (const [what, rel] of [
  ['an archived request.md with from:', 'requests/archive/old/request.md'],
  ['an archived change spec', 'requests/archive/old/spec.md'],
  ['the folder requests/archive/, which cannot be listed', 'requests/archive'],
]) {
  test(`R1 safety: ${what} exists but cannot be read (mode 000): al index removes no binding in that run and says why; the next run that reads it removes the gone link`, { skip: SKIP_ROOT }, (t) => {
    const dir = archivedGone(t);
    indexRemovesNothing(t, dir, rel, ['old', 'inv'], INV70_GONE);
    const r = index(dir);
    const rec = record(dir, 'old');
    noBinding(rec, INV70_GONE, 'once every file can be read');
    reportsRemoved(r, INV70_GONE);
    for (const b of [['old/SP-1', 'builds-on', 'INV-13'], ['old/R1', 'from', `old/${WORDS_FILE}`], ['INV-70', 'serves', 'old/R1']]) oneBinding(rec, b);
  });
}

// --- a request record that declares links by its outputs: cannot be read

// main: config, specs/invoices.md. Branch feature: the requests inv and
// other; both records declare src/lines.js implements INV-13 in outputs:.
// Indexed (other concluded and archived, when archive is set) and committed.
// Then inv's outputs: drops the entry; other still declares the same link.
const LINES = ['src/lines.js', 'implements', 'INV-13'];
function sharedOutput(t, { archive }) {
  const dir = baseProject(t);
  newRequest(dir, 'inv');
  appendSection(dir, 'inv', organized([R1]));
  newRequest(dir, 'other');
  appendSection(dir, 'other', organized([req('R1', 'Yearly ZIP', 'A user MUST be able to download a year as one ZIP file.')]));
  write(dir, 'src/lines.js', 'export const minLines = 1;\n');
  for (const name of ['inv', 'other']) editRecord(dir, name, (rec) => { rec.outputs = [{ file: 'src/lines.js', implements: ['INV-13'] }]; });
  index(dir);
  if (archive) {
    ok(dir, ['record', 'other', 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
    // #72: the close rule asks a declared link for R1; a close line says where it is met.
    ok(dir, ['record', 'other', 'close', '--on', 'R1', '--reason', 'The shared output meets it; no lasting paragraph.', '--yes']);
    index(dir);
    ok(dir, ['conclude', 'other', '--yes']);
  }
  commitAll(dir, 'The requests inv and other, with one shared output');
  oneBinding(record(dir, 'inv'), LINES);
  oneBinding(record(dir, 'other'), LINES);
  editRecord(dir, 'inv', (rec) => { rec.outputs = []; });
  return dir;
}

for (const archive of [false, true]) {
  const kind = archive ? 'an archived' : 'an open';
  test(`R1 safety: the record of ${kind} request that declares a link by outputs: cannot be read (mode 000): al index removes no binding and names the record on its "not removed" line; readable again, the link that it still declares keeps its binding`, { skip: SKIP_ROOT }, (t) => {
    const dir = sharedOutput(t, { archive });
    const rel = recordPath('other');
    const before = record(dir, 'inv').bindings;
    const r = unreadable(t, dir, rel, () => al(dir, ['index']));
    const lines = (r.stdout + r.stderr).split('\n');
    assert.ok(r.code === 0 || r.code === 2, show(r));
    assert.deepEqual(record(dir, 'inv').bindings, before, `no binding of inv changes while ${rel} cannot be read:\n${show(r)}`);
    if (r.code === 0) {
      assert.ok(lines.some((l) => /remov/i.test(l) && l.includes(rel)), `a line names ${rel} and says why no binding was removed:\n${show(r)}`);
    } else {
      assert.ok(lines.some((l) => l.startsWith('al: ') && l.includes(rel)), `an "al: " line that names ${rel}:\n${show(r)}`);
    }
    assert.ok(!namesRemoved(r, LINES), `${LINES.join(' ')} is not reported as removed:\n${show(r)}`);
    // Readable again: other still declares the same holder, link and target.
    const kept = oneBinding(record(dir, 'inv'), LINES);
    const again = index(dir);
    assert.deepEqual(oneBinding(record(dir, 'inv'), LINES), kept, `other's outputs: still declares ${LINES.join(' ')}, so inv keeps its binding:\n${show(again)}`);
    assert.ok(!namesRemoved(again, LINES), `${LINES.join(' ')} is not reported as removed:\n${show(again)}`);
  });
}

// --- a superseded disposition loses its evidence
//
// #72 (LD-58, LD-9): al no longer checks dispositions. An old record that
// holds one stays readable: al check gives no disposition finding, and
// al context --audit shows it as "recorded; not checked". The removal of the
// later paragraph's changes: binding is reported as before.

// main: config, specs/invoices.md. Branch feature: the request first, its
// SP-1 incorporated as INV-70; then the request second, whose SP-1
// changes:INV-70 is bound while INV-70 holds first's text; INV-70 replaced by
// second's text, second/SP-1 incorporated, first/SP-1 superseded by it.
const TEXT_A = 'An export MUST hold one row per invoice line.';
const TEXT_B = 'An export MUST hold one row per invoice line, and one total row.';
function superseded(t) {
  const dir = baseProject(t);
  newRequest(dir, 'first');
  appendSection(dir, 'first', organized([req('R1', 'Rows', 'One row per invoice line.')]));
  write(dir, 'requests/first/spec.md', doc([['SP-1 rule serves:R1', TEXT_A]]));
  index(dir);
  ok(dir, ['record', 'first', 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
  write(dir, SPEC, `${read(dir, SPEC)}\n${doc([['INV-70 rule serves:first/R1', TEXT_A]])}`);
  editRecord(dir, 'first', (rec) => { rec.dispositions = [{ source: 'first/SP-1', disposition: 'incorporated', spec: 'INV-70' }]; });
  index(dir);
  commitAll(dir, 'Tier: 2 — first');
  newRequest(dir, 'second');
  appendSection(dir, 'second', organized([req('R1', 'A total row', 'One total row.')]));
  write(dir, 'requests/second/spec.md', doc([['SP-1 rule serves:R1 changes:INV-70', TEXT_B]]));
  index(dir);
  ok(dir, ['record', 'second', 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
  editFile(dir, SPEC, `<!-- INV-70 rule serves:first/R1 -->\n\n${TEXT_A}`, `<!-- INV-70 rule serves:second/R1 -->\n\n${TEXT_B}`);
  editRecord(dir, 'second', (rec) => { rec.dispositions = [{ source: 'second/SP-1', disposition: 'incorporated', spec: 'INV-70' }]; });
  editRecord(dir, 'first', (rec) => { Object.assign(rec.dispositions[0], { disposition: 'superseded', by: 'second/SP-1' }); });
  index(dir);
  commitAll(dir, 'Tier: 2 — second');
  return dir;
}

const dispositionFindings = (r) => r.findings.filter((f) => f.code === 'disposition' || f.code === 'disposition-pending');
const RECORDED = /^Disp\.\s+first\/SP-1\b.*\bsuperseded INV-70\b.*\bby second\/SP-1: recorded; not checked$/m;

test('R1: an old superseded disposition whose later paragraph drops its changes: link: al index removes that binding; no disposition finding, and al context --audit shows it as "recorded; not checked", before and after', (t) => {
  const dir = superseded(t);
  let r = check(dir);
  assert.deepEqual(dispositionFindings(r), [], show(r));
  let audit = ok(dir, ['context', 'first', '--audit']);
  assert.match(audit.stdout, RECORDED, show(audit));
  // second/SP-1 drops changes:INV-70.
  editFile(dir, 'requests/second/spec.md', '<!-- SP-1 rule serves:R1 changes:INV-70 -->', '<!-- SP-1 rule serves:R1 -->');
  const ix = index(dir);
  noBinding(record(dir, 'second'), ['second/SP-1', 'changes', 'INV-70'], 'its link is gone');
  reportsRemoved(ix, ['second/SP-1', 'changes', 'INV-70']);
  r = check(dir);
  assert.deepEqual(dispositionFindings(r), [], show(r));
  assert.equal(r.code, 0, show(r));
  audit = ok(dir, ['context', 'first', '--audit']);
  assert.match(audit.stdout, RECORDED, show(audit));
});

// ============================================================================
// R2: the world of the changed holders.
//
// main: config, specs/invoices.md, ADR-3. Branch feature: the request inv
// with R1 (from: the owner's words, signed) and D1; a change spec SP-1 to
// SP-3; INV-60 in specs/; ADR-4, superseded by ADR-5 (both name inv/D1); a
// declared output. Indexed, signed and committed: al check --strict exits 0.
const R2SP = {
  1: 'An export MUST hold one row per invoice line.',
  2: 'An export MUST name the invoice number.',
  3: 'An export MUST name the expiry time of its link.',
};
const INV60 = 'A credit note MUST have at least one line.';

function holders(t) {
  const dir = baseProject(t);
  newRequest(dir, 'inv');
  appendSection(dir, 'inv', organized([R1]));
  ok(dir, ['record', 'inv', 'decision', '--source', 'owner', '--text', 'Lines are checked on export.', '--clarifies', 'R1', '--yes']);
  write(dir, CS, doc([
    ['SP-1 rule serves:R1 builds-on:INV-13', R2SP[1]],
    ['SP-2 rule serves:R1 builds-on:INV-12', R2SP[2]],
    ['SP-3 rule serves:R1 builds-on:INV-41', R2SP[3]],
  ]));
  write(dir, SPEC, `${read(dir, SPEC)}\n${doc([['INV-60 rule serves:inv/R1 builds-on:INV-13', INV60]])}`);
  write(dir, ADR4, adr('ADR-4', 'decides:INV-13 source:inv/D1', 'Line rules', 'superseded by ADR-5'));
  write(dir, ADR5, adr('ADR-5', 'decides:INV-13 source:inv/D1 supersedes:ADR-4', 'Line checks'));
  write(dir, 'src/lines.js', 'export const minLines = 1;\n');
  editRecord(dir, 'inv', (rec) => { rec.outputs = [{ file: 'src/lines.js', implements: ['INV-13'] }]; });
  index(dir);
  ok(dir, ['record', 'inv', 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
  index(dir);
  commitAll(dir, 'Tier: 2 — inv');
  return dir;
}

// The holders change their text: a change spec paragraph, a specs/
// paragraph, an ADR and a superseded ADR. Their markers stay.
function changeHolders(dir) {
  editFile(dir, CS, R2SP[1], 'An export MUST hold one row per invoice line, in line order.');
  editFile(dir, SPEC, INV60, 'A credit note MUST have at least one line with an amount.');
  editFile(dir, ADR5, '# ADR-5: Line checks', '# ADR-5: Line checks on export');
  editFile(dir, ADR4, '# ADR-4: Line rules', '# ADR-4: Line rules for export');
}
// The bindings whose holder changeHolders changes: one holder-changed each.
const CHANGED = [
  ['inv/SP-1', 'serves', 'inv/R1'], ['inv/SP-1', 'builds-on', 'INV-13'],
  ['INV-60', 'serves', 'inv/R1'], ['INV-60', 'builds-on', 'INV-13'],
  ['ADR-5', 'decides', 'INV-13'], ['ADR-5', 'source', 'inv/D1'], ['ADR-5', 'supersedes', 'ADR-4'],
  ['ADR-4', 'decides', 'INV-13'], ['ADR-4', 'source', 'inv/D1'],
];

const holderChangedAll = (r) => r.findings.filter((f) => f.code === 'holder-changed');
// The message names the target; a serves target may be named by its short ID
// (R1 for inv/R1), as the stale-base message of a serves link does.
const namesTarget = (msg, link, target) => token(msg, target) || (link === 'serves' && token(msg, target.split('/').pop()));
const holderChanged = (r, [holder, link, target]) =>
  holderChangedAll(r).filter((f) => f.id === holder && token(f.msg, link) && namesTarget(f.msg, link, target));
const staleFor = (r, [holder, link, target]) =>
  r.findings.filter((f) => f.code === 'stale-base' && f.id === holder && f.msg.startsWith(`${link} ${target},`));

// The judgement on holder-changed for <holder>, in the record of inv (#88).
const judge = (dir, holder) =>
  ok(dir, ['record', 'inv', 'judgement', '--hint', 'holder-changed', '--on', holder, '--reason', `${holder} was reworded; its links still hold.`, '--yes']);
// One holder-changed hint for the binding; its message names the link and the judgement command.
function hints(r, b) {
  const found = holderChanged(r, b);
  assert.equal(found.length, 1, `one holder-changed on ${b.join(' ')} (its message names ${b[1]} ${b[2]}):\n${show(r)}`);
  assert.equal(found[0].severity, 'hint', show(r));
  const command = `al record inv judgement --hint holder-changed --on ${b[0]} --reason <why>`;
  assert.ok(token(found[0].msg, command), `the message names ${command}:\n${show(r)}`);
  assert.ok(!found[0].msg.includes('--align'), `the message does not name --align:\n${show(r)}`);
}
function noHint(r, holder) {
  const found = holderChangedAll(r).filter((f) => f.id === holder);
  assert.deepEqual(found, [], `no holder-changed on ${holder}:\n${show(r)}`);
}

test('R2 world: before any holder changes, al check and al check --strict exit 0 and give no holder-changed', (t) => {
  const dir = holders(t);
  for (const args of [[], ['--strict']]) {
    const r = check(dir, ...args);
    assert.equal(r.code, 0, show(r));
    assert.deepEqual(holderChangedAll(r), [], show(r));
    assert.deepEqual(r.findings.filter((f) => f.severity === 'not ok'), [], show(r));
  }
});

test('R2: a changed holder paragraph (change spec, specs/, ADR, superseded ADR) gives one holder-changed hint per binding, naming the link and the judgement command; before and after a plain al index', (t) => {
  const dir = holders(t);
  changeHolders(dir);
  for (const when of ['before al index', 'after al index']) {
    if (when === 'after al index') index(dir);
    const r = check(dir);
    for (const b of CHANGED) hints(r, b);
    assert.equal(holderChangedAll(r).length, CHANGED.length, `${when}: one holder-changed per changed binding, no more:\n${show(r)}`);
    for (const holder of ['inv/SP-2', 'inv/SP-3', 'inv/R1', 'src/lines.js']) noHint(r, holder);
  }
});

test('R2: a plain al index (twice) does not clear holder-changed; a judgement on <holder> clears that holder\'s hints and leaves the others', (t) => {
  const dir = holders(t);
  changeHolders(dir);
  index(dir);
  index(dir);
  let r = check(dir);
  assert.equal(holderChangedAll(r).length, CHANGED.length, show(r));
  let left = CHANGED;
  for (const holder of ['inv/SP-1', 'INV-60', 'ADR-5', 'ADR-4']) {
    judge(dir, holder);
    left = left.filter((b) => b[0] !== holder);
    r = check(dir);
    noHint(r, holder);
    for (const b of left) hints(r, b);
    assert.equal(holderChangedAll(r).length, left.length, `after the judgement on ${holder}:\n${show(r)}`);
  }
});

test('R2: out of scope: a changed output file and a changed requirement (its from: binding) give no holder-changed; a changed change spec paragraph still does', (t) => {
  const dir = holders(t);
  write(dir, 'src/lines.js', 'export const minLines = 2;\n');
  editRequest(dir, 'inv', R1.text, R1b.text);
  editFile(dir, CS, R2SP[1], 'An export MUST hold one row per invoice line, in line order.');
  const r = check(dir);
  noHint(r, 'src/lines.js');
  assert.deepEqual(holderChangedAll(r).filter((f) => token(f.line, 'src/lines.js')), [], show(r));
  noHint(r, 'inv/R1');
  hints(r, ['inv/SP-1', 'serves', 'inv/R1']);
  hints(r, ['inv/SP-1', 'builds-on', 'INV-13']);
  assert.equal(holderChangedAll(r).length, 2, show(r));
});

test('R2: out of scope: the holders of an archived request\'s bindings (an archived change spec paragraph, a specs/ paragraph) change: no holder-changed; the open request\'s changed paragraph gets them', (t) => {
  const dir = archived(t, { atBase: true });
  editFile(dir, 'requests/archive/old/spec.md', OLD_SP1, 'An export MUST hold one row per line of an invoice.');
  editFile(dir, SPEC, `<!-- INV-70 rule serves:old/R1 builds-on:INV-13 -->\n\n${OLD_SP1}`,
    '<!-- INV-70 rule serves:old/R1 builds-on:INV-13 -->\n\nAn export MUST hold one row per line of an invoice.');
  editFile(dir, CS, SP[1], 'An export MUST hold one row per invoice line, in line order.');
  const r = check(dir);
  noHint(r, 'old/SP-1');
  noHint(r, 'INV-70');
  hints(r, ['inv/SP-1', 'serves', 'inv/R1']);
  hints(r, ['inv/SP-1', 'builds-on', 'INV-13']);
  assert.equal(holderChangedAll(r).length, 2, show(r));
});

test('R2: a changed holder that no longer declares a link gets no holder-changed for it, before and after al index; its link that it still declares does', (t) => {
  const dir = holders(t);
  editFile(dir, CS, `<!-- SP-1 rule serves:R1 builds-on:INV-13 -->\n\n${R2SP[1]}`,
    '<!-- SP-1 rule serves:R1 -->\n\nAn export MUST hold one row per invoice line, in line order.');
  for (const when of ['before al index', 'after al index']) {
    if (when === 'after al index') index(dir);
    const r = check(dir);
    assert.deepEqual(holderChanged(r, ['inv/SP-1', 'builds-on', 'INV-13']), [], `${when}: the link is not declared:\n${show(r)}`);
    hints(r, ['inv/SP-1', 'serves', 'inv/R1']);
    assert.equal(holderChangedAll(r).length, 1, `${when}:\n${show(r)}`);
  }
});

test('R2: a changed target gives stale-base only, a changed holder gives holder-changed only, and both changed give both', (t) => {
  const dir = holders(t);
  editFile(dir, SPEC, 'An invoice has a number', 'An invoice has a unique number'); // INV-12: the target of SP-2
  editFile(dir, CS, R2SP[3], 'An export MUST name the expiry time of its link, in UTC.'); // SP-3: a holder
  editFile(dir, SPEC, 'An invoice MUST have at least one line.', 'An invoice MUST have at least one line with an amount.'); // INV-13
  editFile(dir, CS, R2SP[1], 'An export MUST hold one row per invoice line, in line order.'); // SP-1
  const r = check(dir);
  // The stale-base of today: on a changed target only.
  assert.equal(staleFor(r, ['inv/SP-2', 'builds-on', 'INV-12']).length, 1, show(r));
  assert.equal(staleFor(r, ['inv/SP-1', 'builds-on', 'INV-13']).length, 1, show(r));
  assert.deepEqual(r.findings.filter((f) => f.code === 'stale-base' && f.id === 'inv/SP-3'), [], show(r));
  // Target only: no holder-changed.
  noHint(r, 'inv/SP-2');
  // Holder only, and both.
  hints(r, ['inv/SP-3', 'builds-on', 'INV-41']);
  hints(r, ['inv/SP-3', 'serves', 'inv/R1']);
  hints(r, ['inv/SP-1', 'builds-on', 'INV-13']);
});

test('R2 and R1: nothing new blocks: with only holder-changed hints and a removed binding, al check and al check --strict exit 0, and each holder-changed is a hint in both modes', (t) => {
  const dir = holders(t);
  changeHolders(dir);
  editFile(dir, CS, '<!-- SP-2 rule serves:R1 builds-on:INV-12 -->', '<!-- SP-2 rule serves:R1 -->');
  const ix = index(dir);
  reportsRemoved(ix, ['inv/SP-2', 'builds-on', 'INV-12']);
  for (const args of [[], ['--strict']]) {
    const r = check(dir, ...args);
    assert.equal(r.code, 0, show(r));
    assert.deepEqual(r.findings.filter((f) => f.severity === 'not ok'), [], show(r));
    for (const b of CHANGED) hints(r, b);
    assert.ok(holderChangedAll(r).every((f) => f.severity === 'hint'), show(r));
  }
});

// --- R2: holder-changed only where a judgement can move the binding

// INV-13 is deleted from specs/ while inv/SP-1 keeps builds-on:INV-13, and
// SP-1's text changes. The binding's target does not resolve now, so no
// judgement can move it: no holder-changed for it. SP-1 serves inv/R1 resolves.
const deleteInv13 = (dir) => editFile(dir, SPEC, '<!-- INV-13 rule -->\n\nAn invoice MUST have at least one line.\n\n', '');
function targetGone(dir) {
  deleteInv13(dir);
  editFile(dir, CS, R2SP[1], 'An export MUST hold one row per invoice line, in line order.');
}

test('R2: a binding whose target does not resolve now (INV-13 deleted) gets no holder-changed; the holder\'s link that resolves does, and a judgement clears it', (t) => {
  const dir = holders(t);
  targetGone(dir);
  const r = check(dir);
  assert.deepEqual(holderChanged(r, ['inv/SP-1', 'builds-on', 'INV-13']), [], `no holder-changed for a target that is gone:\n${show(r)}`);
  hints(r, ['inv/SP-1', 'serves', 'inv/R1']);
  judge(dir, 'inv/SP-1');
  const after = check(dir);
  noHint(after, 'inv/SP-1');
});

// The holders world as a central repo (its config lists outputs, here one
// absent clone), with the request other (R1) and two more paragraphs:
// SP-4 builds on central:INV-13, which al index binds, and a judgement moves, in a central
// repo; SP-5 serves R1 and other/R1. Indexed and committed.
const R2SP4 = 'An export MUST show the invoice total in its last row.';
const R2SP5 = 'An export MUST be the same for an invoice and its credit notes.';
function scoped(t) {
  const dir = holders(t);
  writeYaml(dir, '.assuredloop/config.yaml', { ...readYaml(dir, '.assuredloop/config.yaml'), repo: 'invoicer', outputs: [{ name: 'invoicer-web', path: '../invoicer-web' }] });
  newRequest(dir, 'other');
  appendSection(dir, 'other', organized([req('R1', 'Credit notes', 'A user MUST be able to issue a credit note.')]));
  write(dir, CS, `${read(dir, CS)}\n${doc([
    ['SP-4 rule serves:R1 builds-on:central:INV-13', R2SP4],
    ['SP-5 rule serves:R1,other/R1', R2SP5],
  ])}`);
  index(dir);
  commitAll(dir, 'A central repo; the request other; SP-4 and SP-5');
  const rec = record(dir, 'inv');
  oneBinding(rec, ['inv/SP-4', 'builds-on', 'central:INV-13']);
  oneBinding(rec, ['inv/SP-5', 'serves', 'other/R1']);
  return dir;
}
const changeSp4 = (dir) => editFile(dir, CS, R2SP4, 'An export MUST show the invoice total in its last row, with the currency.');
const changeSp5 = (dir) => editFile(dir, CS, R2SP5, 'An export MUST be the same for an invoice and each of its credit notes.');
// other's record is deleted; requests/other/request.md still holds R1.
const otherRecordGone = (dir) => rmSync(join(dir, recordPath('other')));

test('R2: in a central repo, a changed holder with builds-on:central:INV-13 gets holder-changed for it, and a judgement clears it', (t) => {
  const dir = scoped(t);
  changeSp4(dir);
  const r = check(dir);
  hints(r, ['inv/SP-4', 'builds-on', 'central:INV-13']);
  hints(r, ['inv/SP-4', 'serves', 'inv/R1']);
  judge(dir, 'inv/SP-4');
  noHint(check(dir), 'inv/SP-4');
});

test('R2: a requirement target whose request\'s record is gone (other/R1) gets no holder-changed; the holder\'s link to inv/R1 does, and a judgement clears it', (t) => {
  const dir = scoped(t);
  otherRecordGone(dir);
  changeSp5(dir);
  const r = check(dir);
  assert.deepEqual(holderChanged(r, ['inv/SP-5', 'serves', 'other/R1']), [], `no holder-changed for a target that a judgement cannot find:\n${show(r)}`);
  hints(r, ['inv/SP-5', 'serves', 'inv/R1']);
  judge(dir, 'inv/SP-5');
  noHint(check(dir), 'inv/SP-5');
});

test('R2 guard: after a judgement on each holder that has holder-changed, al check gives no holder-changed at all (holders changed; INV-13, the target of several, deleted; a central: target; a requirement whose record is gone)', (t) => {
  const dir = scoped(t);
  changeHolders(dir);
  changeSp4(dir);
  changeSp5(dir);
  deleteInv13(dir);
  otherRecordGone(dir);
  index(dir);
  const r = check(dir);
  const named = [...new Set(holderChangedAll(r).map((f) => f.id))];
  assert.ok(named.length > 0, `some holder-changed to start with:\n${show(r)}`);
  for (const holder of named) judge(dir, holder);
  const after = check(dir);
  assert.deepEqual(holderChangedAll(after), [], `no holder-changed once each named holder is judged (${named.join(', ')}):\n${show(after)}`);
});
