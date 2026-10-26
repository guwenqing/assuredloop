// #2: no stale-base for a binding whose link is gone. al check gives the
// stale-base hint for a binding whose target changed since it was bound, but
// only while the holder still declares that link (the same link word and the
// same target). A holder that dropped the link, changed its link word, or is
// gone gets no stale-base for the old binding. Since #11 (R1), al index
// removes the old binding and names it in its output; git history keeps it
// (DES-38). al index --align does not bring it back.
//
// Each test has a control in the same state that still fires: a holder that
// still declares a link to the target that changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { check } from './helpers/invoicer.js';
import {
  al, appendSection, baseProject, bindingsOf, commitAll, doc, editFile, editRecord, index, newRequest, ok, organized,
  read, record, recordPath, req, show, write,
} from './helpers/project.js';

const SPEC = 'specs/invoices.md';
const CS = 'requests/inv/spec.md';
const ADR4 = 'specs/adr/0004-line-rules.md';
const ADR5 = 'specs/adr/0005-line-checks.md';
const R1 = req('R1', 'Monthly CSV download', 'A user MUST be able to download one month as one CSV file.');

// The target that changes in every test: INV-13 of specs/invoices.md.
const INV13 = 'An invoice MUST have at least one line.';
const INV13b = 'An invoice MUST have at least one line with an amount.';

const SP = {
  1: 'An export MUST hold one row per invoice line.',
  2: 'An export MUST skip an invoice with no line.',
  3: 'An export MUST count the lines of each invoice.',
  4: 'An export MUST show the line count in its header.',
  5: 'An export MUST name each line by its position.',
};
const INV = {
  60: 'A credit note MUST have at least one line.',
  61: 'A draft invoice MAY have no line.',
  62: 'A line MUST belong to one invoice.',
};

// Holders of a link to INV-13, as first indexed. Each "gone" holder has a
// control that keeps the same link: SP-4 (change spec), INV-62 (specs/),
// ADR-5 (ADR) and the output src/lines.js.
const CHANGE_SPEC = doc([
  ['SP-1 rule serves:R1 builds-on:INV-12', SP[1]],
  ['SP-2 rule serves:R1 builds-on:INV-13', SP[2]],
  ['SP-3 rule serves:R1 builds-on:INV-13', SP[3]],
  ['SP-4 rule serves:R1 builds-on:INV-13', SP[4]],
  ['SP-5 rule serves:R1 builds-on:INV-13', SP[5]],
]);
const SPEC_MORE = doc([
  ['INV-60 rule serves:inv/R1 builds-on:INV-13', INV[60]],
  ['INV-61 rule serves:inv/R1 builds-on:INV-13', INV[61]],
  ['INV-62 rule serves:inv/R1 builds-on:INV-13', INV[62]],
]);
const adr = (id, links, title) => `Status: accepted\n\n${doc([[`${id} choice ${links}`, `# ${id}: ${title}`]])}`;

// main: config, specs/invoices.md, ADR-3. Branch feature: the request inv
// with R1 and D1, a change spec, three more specs/ paragraphs, two ADRs and
// two declared outputs, each with a link to INV-13; indexed and committed.
function linked(t) {
  const dir = baseProject(t);
  newRequest(dir, 'inv');
  appendSection(dir, 'inv', organized([R1]));
  ok(dir, ['record', 'inv', 'decision', '--source', 'owner', '--text', 'Lines are checked on export.', '--clarifies', 'R1', '--yes']);
  write(dir, CS, CHANGE_SPEC);
  write(dir, SPEC, `${read(dir, SPEC)}\n${SPEC_MORE}`);
  write(dir, ADR4, adr('ADR-4', 'decides:INV-12,INV-13 source:inv/D1', 'Line rules'));
  write(dir, ADR5, adr('ADR-5', 'decides:INV-13 source:inv/D1', 'Line checks'));
  write(dir, 'src/lines.js', 'export const minLines = 1;\n');
  write(dir, 'src/count.js', 'export const count = (inv) => inv.lines.length;\n');
  editRecord(dir, 'inv', (rec) => {
    rec.outputs = [
      { file: 'src/lines.js', implements: ['INV-13'] },
      { file: 'src/count.js', implements: ['INV-12', 'INV-13'] },
    ];
  });
  index(dir);
  commitAll(dir, 'The request inv and its links');
  return dir;
}

// The bindings to INV-13 that each test is about, as [holder, link, target].
const GONE = {
  relinked: [['inv/SP-2', 'builds-on', 'INV-13'], ['INV-60', 'builds-on', 'INV-13']],
  deleted: [['inv/SP-3', 'builds-on', 'INV-13'], ['INV-61', 'builds-on', 'INV-13']],
  adr: [['ADR-4', 'decides', 'INV-13']],
  output: [['src/count.js', 'implements', 'INV-13']],
  word: [['inv/SP-5', 'builds-on', 'INV-13']],
};
const CONTROLS = [
  ['inv/SP-4', 'builds-on', 'INV-13'],
  ['INV-62', 'builds-on', 'INV-13'],
  ['ADR-5', 'decides', 'INV-13'],
  ['src/lines.js', 'implements', 'INV-13'],
];

// The holders drop their links to INV-13, in each way.
function dropLinks(dir) {
  // A changed link: the marker now names another target.
  editFile(dir, CS, '<!-- SP-2 rule serves:R1 builds-on:INV-13 -->', '<!-- SP-2 rule serves:R1 builds-on:INV-41 -->');
  editFile(dir, SPEC, '<!-- INV-60 rule serves:inv/R1 builds-on:INV-13 -->', '<!-- INV-60 rule serves:inv/R1 builds-on:INV-41 -->');
  // A gone holder: the paragraph, its marker and its text, are deleted.
  editFile(dir, CS, `<!-- SP-3 rule serves:R1 builds-on:INV-13 -->\n\n${SP[3]}\n\n`, '');
  editFile(dir, SPEC, `<!-- INV-61 rule serves:inv/R1 builds-on:INV-13 -->\n\n${INV[61]}\n\n`, '');
  // The same target with another link word.
  editFile(dir, CS, '<!-- SP-5 rule serves:R1 builds-on:INV-13 -->', '<!-- SP-5 rule serves:R1 changes:INV-13 -->');
  // An ADR that no longer decides INV-13.
  editFile(dir, ADR4, 'decides:INV-12,INV-13', 'decides:INV-12');
  // A declared output that no longer implements INV-13.
  editRecord(dir, 'inv', (rec) => {
    rec.outputs.find((o) => o.file === 'src/count.js').implements = ['INV-12'];
  });
}

const changeTarget = (dir) => editFile(dir, SPEC, INV13, INV13b);

// The state of every test: linked, the links dropped and indexed, then
// INV-13 changed and indexed again.
function goneAndChanged(t) {
  const dir = linked(t);
  dropLinks(dir);
  index(dir);
  changeTarget(dir);
  index(dir);
  return dir;
}

// The stale-base findings on holder for `link target` (the message starts
// with them, as "builds-on INV-13, which changed since it was bound").
const staleFor = (r, [holder, link, target]) =>
  r.findings.filter((f) => f.code === 'stale-base' && f.id === holder && f.msg.startsWith(`${link} ${target},`));

function fires(r, b) {
  const found = staleFor(r, b);
  assert.equal(found.length, 1, `control: one stale-base on ${b.join(' ')}:\n${show(r)}`);
  assert.equal(found[0].severity, 'hint', show(r));
}
const silent = (r, b) => assert.deepEqual(staleFor(r, b), [], `no stale-base on ${b.join(' ')}, whose link is gone:\n${show(r)}`);

const oneBinding = (rec, [holder, link, target]) => {
  const found = bindingsOf(rec, holder, link, target);
  assert.equal(found.length, 1, `one binding ${holder} ${link} ${target}; bindings:\n${stringify(rec.bindings)}`);
  return found[0];
};

test('the world: before the links are dropped, every holder is bound to INV-13, and a changed INV-13 gives each a stale-base', (t) => {
  const dir = linked(t);
  const rec = record(dir, 'inv');
  for (const b of [...Object.values(GONE).flat(), ...CONTROLS]) oneBinding(rec, b);
  changeTarget(dir);
  index(dir);
  const r = check(dir);
  for (const b of [...Object.values(GONE).flat(), ...CONTROLS]) fires(r, b);
});

test('a changed link: no stale-base for the old binding of a change spec paragraph (inv/SP-2) or a specs/ paragraph (INV-60) that now builds on INV-41; the controls still fire', (t) => {
  const r = check(goneAndChanged(t));
  for (const b of GONE.relinked) silent(r, b);
  for (const b of CONTROLS) fires(r, b);
});

test('a gone holder: no stale-base for the binding of a deleted change spec paragraph (inv/SP-3) or a deleted specs/ paragraph (INV-61); the controls still fire', (t) => {
  const r = check(goneAndChanged(t));
  for (const b of GONE.deleted) silent(r, b);
  for (const b of CONTROLS) fires(r, b);
});

test('another link word to the same target: no stale-base for inv/SP-5 builds-on INV-13 once its marker says changes:INV-13; its changes binding is kept and, as the own branch changed INV-13, gives no stale-base (LD-61)', (t) => {
  const dir = goneAndChanged(t);
  const r = check(dir);
  for (const b of GONE.word) silent(r, b);
  oneBinding(record(dir, 'inv'), ['inv/SP-5', 'changes', 'INV-13']);
  // LD-61 (#68): INV-13 is changed on the branch of the request inv itself,
  // and inv/SP-5 names it by changes. al index keeps the version that the
  // change's own branch gave INV-13, so this own edit gives no stale-base.
  assert.deepEqual(staleFor(r, ['inv/SP-5', 'changes', 'INV-13']), [], `no stale-base on the own edit of INV-13 (LD-61):\n${show(r)}`);
  for (const b of CONTROLS) fires(r, b);
});

test('an ADR that no longer decides INV-13 (ADR-4): no stale-base for its old binding; ADR-5, which still decides it, fires', (t) => {
  const r = check(goneAndChanged(t));
  for (const b of GONE.adr) silent(r, b);
  fires(r, ['ADR-5', 'decides', 'INV-13']);
});

test('a declared output that no longer implements INV-13 (src/count.js): no stale-base for its old binding; src/lines.js, which still does, fires', (t) => {
  const r = check(goneAndChanged(t));
  for (const b of GONE.output) silent(r, b);
  fires(r, ['src/lines.js', 'implements', 'INV-13']);
});

// A line of al index's output that says the binding [holder, link, target]
// was removed (#11 R1): it names all three and has a word like "removed".
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const token = (s, w) => new RegExp(`(^|[^\\w/.-])${esc(w)}($|[^\\w/-])`).test(s);
const namesRemoved = (r, [holder, link, target]) => r.stdout.split('\n')
  .some((l) => /remov/i.test(l) && token(l, holder) && token(l, link) && token(l, target));

test('#11 R1: al index removes the bindings of the gone links and names each one; the controls keep theirs, unchanged, after al index (twice) and after al index --align on the holders', (t) => {
  const dir = linked(t);
  const before = record(dir, 'inv');
  const gone = Object.values(GONE).flat();
  for (const b of gone) oneBinding(before, b);
  const kept = new Map(CONTROLS.map((b) => [b.join(' '), oneBinding(before, b)]));
  const removed = (when) => {
    const rec = record(dir, 'inv');
    for (const b of gone) assert.equal(bindingsOf(rec, ...b).length, 0, `${b.join(' ')} is removed ${when}:\n${stringify(rec.bindings)}`);
    for (const b of CONTROLS) assert.deepEqual(oneBinding(rec, b), kept.get(b.join(' ')), `control ${b.join(' ')} unchanged ${when}`);
  };
  dropLinks(dir);
  const r = index(dir);
  for (const b of gone) assert.ok(namesRemoved(r, b), `al index names the removed binding ${b.join(' ')}:\n${show(r)}`);
  removed('after al index with the links dropped');
  changeTarget(dir);
  const again = index(dir);
  for (const b of gone) assert.ok(!namesRemoved(again, b), `${b.join(' ')} is not reported again:\n${show(again)}`);
  removed('after al index with INV-13 changed');
  // The record file text no longer names a gone binding.
  const text = read(dir, recordPath('inv'));
  for (const [holder, link, target] of gone) {
    assert.doesNotMatch(text, new RegExp(`holder: ${holder.replace('/', '\\/').replace('.', '\\.')}\\n\\s+link: ${link}\\n\\s+target: ${target}\\n`),
      `the record file no longer holds ${holder} ${link} ${target}:\n${text}`);
  }
  // --align on a holder that is still there, but dropped the link.
  for (const holder of ['inv/SP-2', 'INV-60', 'inv/SP-5', 'ADR-4', 'src/count.js']) {
    ok(dir, ['index', '--align', holder]);
    removed(`after al index --align ${holder}`);
  }
  // --align on a gone holder: it may be refused, but it never brings the binding back.
  for (const holder of ['inv/SP-3', 'INV-61']) {
    al(dir, ['index', '--align', holder]);
    removed(`after al index --align ${holder} (a gone holder)`);
  }
});

test('a record whose outputs is a mapping, not a list: al check still gives its findings, with the stale-base on inv/SP-1, which still builds on INV-13', (t) => {
  const dir = baseProject(t);
  newRequest(dir, 'inv');
  appendSection(dir, 'inv', organized([R1]));
  write(dir, CS, doc([['SP-1 rule serves:R1 builds-on:INV-13', SP[1]]]));
  index(dir);
  commitAll(dir, 'The request inv and its link');
  changeTarget(dir);
  editRecord(dir, 'inv', (rec) => {
    rec.outputs = {};
  });
  const r = check(dir);
  assert.ok(r.code === 0 || r.code === 1, `al check gives its report, not an error:\n${show(r)}`);
  assert.doesNotMatch(r.stdout + r.stderr, /internal error/, show(r));
  fires(r, ['inv/SP-1', 'builds-on', 'INV-13']);
});

test('another request\'s record is a symlink to an unchanged copy in the repo: not ok record-unreadable other, and al check still gives the stale-base on inv/SP-1; plain exits 0, --strict exits 1', (t) => {
  const dir = baseProject(t);
  newRequest(dir, 'inv');
  appendSection(dir, 'inv', organized([R1]));
  write(dir, CS, doc([['SP-1 rule serves:R1 builds-on:INV-13', SP[1]]]));
  newRequest(dir, 'other');
  appendSection(dir, 'other', organized([req('R1', 'Yearly ZIP', 'A user MUST be able to download a year as one ZIP file.')]));
  index(dir);
  commitAll(dir, 'The requests inv and other');
  changeTarget(dir);
  // other's record: a symlink to an unchanged copy of itself, inside the repo.
  write(dir, 'copies/other.yaml', read(dir, recordPath('other')));
  rmSync(join(dir, recordPath('other')));
  symlinkSync(join(dir, 'copies/other.yaml'), join(dir, recordPath('other')));
  const r = check(dir);
  assert.equal(r.code, 0, `al check gives its report, and exits 0 by default:\n${show(r)}`);
  assert.doesNotMatch(r.stdout + r.stderr, /internal error/, show(r));
  const unreadable = r.findings.filter((f) => f.code === 'record-unreadable' && f.severity === 'not ok'
    && /(^|[\s/])other(\.yaml|\/|\s|$)/.test(f.line));
  assert.ok(unreadable.length > 0, `a not ok record-unreadable line that names other:\n${show(r)}`);
  fires(r, ['inv/SP-1', 'builds-on', 'INV-13']);
  const strict = check(dir, '--strict');
  assert.equal(strict.code, 1, show(strict));
  fires(strict, ['inv/SP-1', 'builds-on', 'INV-13']);
});
