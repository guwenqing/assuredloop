// #74: answers that a reader can check, and the complete `al context <ID>`
// (requests/light-resign/request.md R1, signed; spec LD-18, LD-19, LD-25,
// LD-47 and section 4a of requests/light-design). Written from the
// requirement and the public interface only. Nothing here reads src/ or bin/.
//
// - The place of an item is `<file>:<line>`, where <line> is the first line
//   of the item's text, never its marker line: for a paragraph, the first
//   non-blank line after its marker; for an ADR, the first text line after
//   its head marker; for a requirement, its `### R<n>` heading; for a
//   decision, its `- D<n>, ...` entry under `## Decisions`.
// - In a list of IDs, the place follows the ID: `<ID> (<file>:<line>)`, and
//   other words for the ID may follow after a comma inside the parentheses.
//   An item with no text line shows `<ID> (<file>: no text line)`.
// - Paragraph view: the head line names the text line; a Status line; places
//   on Serves, Links, Linked, Governed and Open; an Open line also for a
//   change-spec paragraph; Cited lines.
// - ADR view: places on Replaced, Decides and Open. Requirement view: places
//   on Served and Open.
// - Cited: one line for each file that names the ID as a whole word, with the
//   exact count and every line number; current files first, then historical,
//   each group by path; never "N more". `--full` adds each citing line:
//   `  <file>:<n>: <text>`. The paragraph's own marker line is not counted.
// - Request view: a Records line; places on the R, Decision and close lines;
//   `no line in requests/<name>/request.md` for a decision only in the record.
// - Project view: a Records line after the Request lines.
// - al check: a finding about a paragraph's text names its text line; a lint
//   about the marker names the marker line; ` · places: <ID> <file>:<line>,
//   ...` after the message; a base-only paragraph shows `<file>:<line> at the
//   base <sha7>`; the change lines name the text line; the list's "open
//   proposal" names the place of the proposal.
//
// No model and no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  al, appendSection, baseProject, commitAll, doc, editFile, editRecord, editRequest, git, move, newRequest, ok, organized,
  project, read, req, show, write, writeConfig, INVOICES,
} from './helpers/project.js';
import { word } from './helpers/views.js';
import { changeLines78 } from './helpers/as-78.js';

const SPEC = 'specs/invoices.md';
const ADR1 = 'specs/adr/0001-xlsx.md';
const ADR2 = 'specs/adr/0002-csv.md';
const PDF_SPEC = 'requests/pdf/spec.md';
const OTHER_SPEC = 'requests/other/spec.md';
const PDF_MD = 'requests/pdf/request.md';
const T12 = 'An invoice has a number, a customer, lines, a total and a paid date.';
const T13 = 'An invoice MUST have at least one line.';
const T41 = 'The export link MUST expire 30 minutes after the email is sent.';
const R1 = req('R1', 'Monthly CSV', 'A user MUST be able to download one month as one CSV file.');
const R2 = req('R2', 'Yearly ZIP', 'A user MUST be able to download one year as one ZIP file.');

const adr = (status, marker, heading, more = []) => `Status: ${status}\n\n${doc([[marker, heading], ...more])}`;

// The 1-based line of the exact line `text` in a file's content.
function lineIn(content, text, what = 'the file') {
  const at = content.split('\n').indexOf(text);
  assert.ok(at >= 0, `${what} has the line ${JSON.stringify(text)}`);
  return at + 1;
}
const lineOf = (dir, file, text) => lineIn(read(dir, file), text, file);
const place = (dir, file, text) => `${file}:${lineOf(dir, file, text)}`;

// The line numbers of a file that name the ID as a whole word, less `skip`.
function citing(dir, file, id, skip = []) {
  const re = word(id);
  return read(dir, file).split('\n')
    .map((l, i) => (re.test(l) ? i + 1 : 0))
    .filter((n) => n > 0 && !skip.includes(n));
}
// The Cited line of a file, as the contract gives it.
const citedLine = (group, file, ns) => `Cited     ${group} ${file}: ${ns.length} line${ns.length === 1 ? '' : 's'}: ${ns.join(', ')}`;

const context = (dir, ...args) => ok(dir, ['context', ...args]);
const outLines = (r) => r.stdout.split('\n');
// The one line that starts with the label.
function labelled(r, label) {
  const found = outLines(r).filter((l) => l.startsWith(label));
  assert.equal(found.length, 1, `one line that starts with "${label}":\n${show(r)}`);
  return found[0];
}
// Every line that starts with the label, in order.
const allLabelled = (r, label) => outLines(r).filter((l) => l.startsWith(label));

// --- the paragraph world
//
// specs/invoices.md: INV-1, INV-12, INV-13, INV-41 (baseProject), then
// INV-60 (rule, builds on INV-12) and INV-61 (rationale, explains INV-12).
// ADR-1 (superseded by ADR-2) decides INV-12; ADR-2 (accepted) supersedes
// ADR-1 and decides INV-12 and INV-13. The open request pdf: R1 signed in
// S1; its spec has SP-1 (serves R1, changes INV-12), SP-2 (builds on SP-1)
// and SP-3 (serves R1, changes ADR-2). The open request other: its SP-1
// changes INV-12. src/export.js names pdf/R1 on line 1.
const T60 = 'An export MUST be a CSV file.';
const T61 = 'Why: every invoice needs its data.';
const TSP1 = 'A year is one ZIP of months.';
const TSP2 = 'Each month in the ZIP is one CSV file.';
const TSP3 = 'The ZIP holds CSV files only.';
const TOTHER = 'An invoice also has a currency.';

function paragraphWorld(t) {
  const dir = baseProject(t);
  write(dir, ADR1, adr('superseded by ADR-2', 'ADR-1 choice decides:INV-12', '# ADR-1: XLSX files'));
  write(dir, ADR2, adr('accepted', 'ADR-2 choice supersedes:ADR-1 decides:INV-12,INV-13', '# ADR-2: CSV files',
    [['ADR-2-1 rationale', 'Context: every spreadsheet reads CSV.']]));
  write(dir, SPEC, `${read(dir, SPEC)}\n${doc([['INV-60 rule builds-on:INV-12', T60], ['INV-61 rationale explains:INV-12', T61]])}`);
  newRequest(dir, 'pdf');
  appendSection(dir, 'pdf', organized([R1]));
  ok(dir, ['record', 'pdf', 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
  write(dir, PDF_SPEC, doc([
    ['SP-1 rule serves:R1 changes:INV-12', TSP1],
    ['SP-2 rule builds-on:SP-1', TSP2],
    ['SP-3 choice serves:R1 changes:ADR-2', TSP3],
  ]));
  newRequest(dir, 'other');
  write(dir, OTHER_SPEC, doc([['SP-1 rule changes:INV-12', TOTHER]]));
  write(dir, 'src/export.js', '// pdf/R1: one month\n');
  ok(dir, ['index']);
  return dir;
}

// 1. A place beside each ID, and 2. no marker line as a source: the paragraph view.

test('#74 al context INV-12: the head line names the text line of INV-12, not its marker line', (t) => {
  const dir = paragraphWorld(t);
  const r = context(dir, 'INV-12');
  const head = labelled(r, 'Paragraph ');
  const text = place(dir, SPEC, T12);
  const marker = place(dir, SPEC, '<!-- INV-12 data -->');
  assert.ok(head.startsWith('Paragraph INV-12 '), show(r));
  assert.ok(head.endsWith(` · ${text}`), `the head names ${text}:\n${show(r)}`);
  assert.ok(!head.includes(marker), `the head never names the marker line ${marker}:\n${show(r)}`);
});

test('#74 al context pdf/SP-1: the head line names the text line of a change-spec paragraph, not its marker line', (t) => {
  const dir = paragraphWorld(t);
  const r = context(dir, 'pdf/SP-1');
  const head = labelled(r, 'Paragraph ');
  assert.match(head, /^Paragraph (pdf\/)?SP-1 /, show(r));
  assert.ok(head.endsWith(` · ${place(dir, PDF_SPEC, TSP1)}`), show(r));
  assert.ok(!head.endsWith(` · ${PDF_SPEC}:1`), `never the marker line:\n${show(r)}`);
});

test('#74 al context INV-12: Linked, Governed and Open give the place of each ID', (t) => {
  const dir = paragraphWorld(t);
  const r = context(dir, 'INV-12');
  assert.equal(labelled(r, 'Linked    '),
    `Linked    INV-60 (${place(dir, SPEC, T60)}) builds on it · INV-61 (${place(dir, SPEC, T61)}) explains it`, show(r));
  assert.equal(labelled(r, 'Governed  '),
    `Governed  by ADR-1 (${place(dir, ADR1, '# ADR-1: XLSX files')}, superseded: history) · ADR-2 (${place(dir, ADR2, '# ADR-2: CSV files')}, accepted)`, show(r));
  assert.equal(labelled(r, 'Open      '),
    `Open      other/SP-1 (${place(dir, OTHER_SPEC, TOTHER)}) changes it · pdf/SP-1 (${place(dir, PDF_SPEC, TSP1)}) changes it`, show(r));
});

test('#74 al context INV-61 and pdf/SP-1: Links and Serves give the place of each ID', (t) => {
  const dir = paragraphWorld(t);
  const p12 = place(dir, SPEC, T12);
  const r61 = context(dir, 'INV-61');
  assert.equal(labelled(r61, 'Links     '), `Links     explains INV-12 (${p12})`, show(r61));
  const sp1 = context(dir, 'pdf/SP-1');
  assert.equal(labelled(sp1, 'Serves    '),
    `Serves    pdf/R1 (${place(dir, PDF_MD, '### R1 Monthly CSV')}) version 1: signed in S1 (declared)`, show(sp1));
  assert.equal(labelled(sp1, 'Links     '), `Links     changes INV-12 (${p12})`, show(sp1));
});

// 6. The Status line and the Open line of a change-spec paragraph.

test('#74 al context <paragraph>: the Status line says in force, not in force: a <kind> paragraph, or draft in an open request', (t) => {
  const dir = paragraphWorld(t);
  assert.equal(labelled(context(dir, 'INV-12'), 'Status    '), 'Status    in force');
  assert.equal(labelled(context(dir, 'INV-60'), 'Status    '), 'Status    in force');
  assert.equal(labelled(context(dir, 'INV-61'), 'Status    '), 'Status    not in force: a rationale paragraph');
  assert.equal(labelled(context(dir, 'pdf/SP-1'), 'Status    '),
    'Status    draft: in the change spec of open request pdf; not in force');
});

test('#74 al context pdf/SP-1: an Open line names the open paragraph that builds on it, with its place; pdf/SP-3 has none', (t) => {
  const dir = paragraphWorld(t);
  const r = context(dir, 'pdf/SP-1');
  const open = labelled(r, 'Open      ');
  assert.ok(open.includes(`pdf/SP-2 (${place(dir, PDF_SPEC, TSP2)})`), show(r));
  assert.equal(labelled(context(dir, 'pdf/SP-3'), 'Open      '), 'Open      no open change builds on or changes it');
});

// 1. The ADR view and the requirement view.

test('#74 al context ADR-2 and ADR-1: Replaced, Decides and Open give the place of each ID', (t) => {
  const dir = paragraphWorld(t);
  const p1 = place(dir, ADR1, '# ADR-1: XLSX files');
  const p2 = place(dir, ADR2, '# ADR-2: CSV files');
  const r = context(dir, 'ADR-2');
  assert.equal(labelled(r, 'Replaced  '), `Replaced  supersedes ADR-1 (${p1}) · not replaced`, show(r));
  assert.equal(labelled(r, 'Decides   '),
    `Decides   INV-12 (${place(dir, SPEC, T12)}), INV-13 (${place(dir, SPEC, T13)})`, show(r));
  assert.equal(labelled(r, 'Open      '), `Open      pdf/SP-3 (${place(dir, PDF_SPEC, TSP3)}) changes it`, show(r));
  const r1 = context(dir, 'ADR-1');
  assert.equal(labelled(r1, 'Replaced  '), `Replaced  replaces no ADR · superseded by ADR-2 (${p2})`, show(r1));
  assert.equal(labelled(r1, 'Decides   '), `Decides   INV-12 (${place(dir, SPEC, T12)})`, show(r1));
});

test('#74 al context pdf/R1: Served and Open give the place of each serving paragraph', (t) => {
  const dir = paragraphWorld(t);
  const r = context(dir, 'pdf/R1');
  const sp1 = `pdf/SP-1 (${place(dir, PDF_SPEC, TSP1)})`;
  const sp3 = `pdf/SP-3 (${place(dir, PDF_SPEC, TSP3)})`;
  const served = labelled(r, 'Served    ');
  assert.ok(served.startsWith('Served    by ') && served.endsWith(' (declared serves links)'), show(r));
  assert.ok(served.includes(sp1) && served.includes(sp3), `Served names ${sp1} and ${sp3}:\n${show(r)}`);
  const open = labelled(r, 'Open      ');
  assert.ok(open.includes(`${sp1} serves it`) && open.includes(`${sp3} serves it`), show(r));
});

// 5. Cited lines of the ADR and the requirement view.

test('#74 al context ADR-2: one Cited line for each file, current before historical, with the count and each line', (t) => {
  const dir = paragraphWorld(t);
  const r = context(dir, 'ADR-2');
  // The ADR's own file counts too, but not the marker lines of its own paragraphs.
  const ownMarker = lineOf(dir, ADR2, '<!-- ADR-2 choice supersedes:ADR-1 decides:INV-12,INV-13 -->');
  assert.deepEqual(allLabelled(r, 'Cited     '), [
    citedLine('current', PDF_SPEC, citing(dir, PDF_SPEC, 'ADR-2')),
    citedLine('current', ADR2, citing(dir, ADR2, 'ADR-2', [ownMarker])),
    citedLine('historical', ADR1, citing(dir, ADR1, 'ADR-2')),
  ], show(r));
});

test('#74 al context pdf/R1: the Cited line of src/export.js gives its count and line', (t) => {
  const dir = paragraphWorld(t);
  const r = context(dir, 'pdf/R1');
  assert.ok(allLabelled(r, 'Cited     ').includes('Cited     current src/export.js: 1 line: 1'), show(r));
});

// 1. and 2. The findings of al check.

test('#74 al check: an overlap finding names the text line of its paragraph and the place of each other ID', (t) => {
  const dir = paragraphWorld(t);
  const r = ok(dir, ['check']);
  const want = `hint overlap ${place(dir, PDF_SPEC, TSP1)} pdf/SP-1 other/SP-1 also changes INV-12: two open changes change one paragraph; align them`
    + ` · places: other/SP-1 ${place(dir, OTHER_SPEC, TOTHER)}, INV-12 ${place(dir, SPEC, T12)}`;
  assert.ok(outLines(r).includes(want), `the line\n${want}\n${show(r)}`);
  assert.ok(!r.stdout.includes(`hint overlap ${PDF_SPEC}:1 `), `never the marker line of pdf/SP-1:\n${show(r)}`);
});

test('#74 al check: a lint about the marker still names the marker line, and names the place of its own ID', (t) => {
  const dir = paragraphWorld(t);
  const r = ok(dir, ['check']);
  const marker = place(dir, SPEC, '<!-- INV-12 data -->');
  const found = outLines(r).filter((l) => l.startsWith(`hint no-link ${marker} INV-12 `));
  assert.equal(found.length, 1, show(r));
  assert.ok(found[0].endsWith(` · places: INV-12 ${place(dir, SPEC, T12)}`), show(r));
});

// --- a changed and a removed paragraph on the branch

function changedWorld(t) {
  const dir = baseProject(t);
  editFile(dir, SPEC, `\n<!-- INV-41 rule -->\n\n${T41}\n`, '');
  editFile(dir, SPEC, T13, 'An invoice MUST have at least two lines.');
  ok(dir, ['index']);
  commitAll(dir, 'change INV-13, remove INV-41');
  return dir;
}

test('#74 al check: a finding about a changed text names its text line and has no places part when no other ID needs one', (t) => {
  const dir = changedWorld(t);
  const r = ok(dir, ['check']);
  const want = `not ok signoff-coverage ${place(dir, SPEC, 'An invoice MUST have at least two lines.')} INV-13 a rule paragraph is changed with no signed requirement that covers it`;
  assert.ok(outLines(r).includes(want), `the line\n${want}\n${show(r)}`);
});

test('#74 al check: a removed paragraph is named at its text line at the base, in its finding and in its change line', (t) => {
  const dir = changedWorld(t);
  const base = git(dir, 'rev-parse', '--short=7', 'main');
  const at = `${SPEC}:${lineIn(INVOICES, T41)} at the base ${base}`;
  const r = ok(dir, ['check']);
  assert.ok(outLines(r).some((l) => l.startsWith(`not ok signoff-coverage ${at} INV-41 `)), `a finding at ${at}:\n${show(r)}`);
  // #78: the change line is a map paragraph line.
  assert.ok(changeLines78(r.stdout).includes(`${at} INV-41 Removed`), `the change line "${at} INV-41 Removed":\n${show(r)}`);
});

test('#74 al check: the change line of a changed paragraph names its text line', (t) => {
  const dir = changedWorld(t);
  const r = ok(dir, ['check']);
  const at = place(dir, SPEC, 'An invoice MUST have at least two lines.');
  // #78: the change line is a map paragraph line.
  const changes = changeLines78(r.stdout);
  assert.ok(changes.some((l) => l.startsWith(`${at} INV-13 `)), `a change line that starts with "${at} INV-13 ":\n${show(r)}`);
  assert.ok(!changes.some((l) => l.startsWith(`${SPEC} INV-13 `)), `no change line without a line number:\n${show(r)}`);
});

// --- the list's open proposal

test('#74 al check: the list line "open proposal" gives the place of the other request\'s paragraph', (t) => {
  const dir = baseProject(t, { branch: null });
  newRequest(dir, 'pdf');
  appendSection(dir, 'pdf', organized([R2]));
  write(dir, PDF_SPEC, doc([['SP-1 rule serves:R2 changes:INV-13', 'An invoice MUST have at least two lines.']]));
  ok(dir, ['index']);
  commitAll(dir, 'pdf');
  git(dir, 'checkout', '-q', '-b', 'feature');
  write(dir, 'src/export.js', '// INV-13\n');
  ok(dir, ['index']);
  commitAll(dir, 'export');
  const r = ok(dir, ['check']);
  const line = labelled(r, 'in force INV-13 ');
  const want = ` · open proposal: pdf/SP-1 (${place(dir, PDF_SPEC, 'An invoice MUST have at least two lines.')}) changes it`;
  assert.ok(line.includes(want), `the in force line holds "${want}":\n${show(r)}`);
});

// --- 3. the records note, 1. places, and 4. a limit, in the request view

// The open request pdf: R1 signed in S1; D1 in request.md; D2 recorded, then
// its line taken out of request.md; a close line C1 on R1. No Tier: line.
const D1 = '- D1, 2026-05-04. Source: owner. Use CSV.';
function requestWorld(t) {
  const dir = baseProject(t);
  newRequest(dir, 'pdf');
  appendSection(dir, 'pdf', organized([R1]));
  ok(dir, ['record', 'pdf', 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
  ok(dir, ['record', 'pdf', 'decision', '--source', 'owner', '--text', 'Use CSV.', '--yes']);
  ok(dir, ['record', 'pdf', 'decision', '--source', 'architect', '--text', 'Drop XLSX.', '--yes']);
  ok(dir, ['record', 'pdf', 'close', '--on', 'R1', '--reason', 'A one-time setup meets it.', '--yes']);
  editRequest(dir, 'pdf', '- D2, 2026-05-04. Source: architect. Drop XLSX.\n', '');
  ok(dir, ['index']);
  return dir;
}

test('#74 al context pdf: a Records line right after the Request line names the record that alone holds the facts below', (t) => {
  const dir = requestWorld(t);
  const r = context(dir, 'pdf');
  const ls = outLines(r);
  assert.ok(ls[0].startsWith('Request   pdf '), show(r));
  assert.ok(ls[1].startsWith("Records   only al's record .assuredloop/records/requests/pdf.yaml holds "), show(r));
  assert.match(ls[1], /sign-off/, `it names the sign-offs:\n${show(r)}`);
  assert.match(ls[1], /\btier\b/, `request.md has no Tier: line, so it names the tier:\n${show(r)}`);
});

test('#74 al context pdf: the R, Decision and close lines give the place in request.md', (t) => {
  const dir = requestWorld(t);
  const r = context(dir, 'pdf');
  const pR1 = place(dir, PDF_MD, '### R1 Monthly CSV');
  const ls = outLines(r);
  assert.ok(ls.includes(`  R1 version 1 (Monthly CSV) · ${pR1}: signed in S1`), show(r));
  assert.ok(ls.includes(`Decision  D1 · ${place(dir, PDF_MD, D1)} (owner): Use CSV.`), show(r));
  assert.ok(ls.includes(`close C1 pdf/R1 (${pR1}) current: A one-time setup meets it.`), show(r));
});

test('#74 al context pdf: a decision held only in the record says "no line in requests/pdf/request.md"', (t) => {
  const dir = requestWorld(t);
  const r = context(dir, 'pdf');
  assert.ok(outLines(r).includes('Decision  D2 · no line in requests/pdf/request.md (architect): Drop XLSX.'), show(r));
});

test('#74 al context: with an open request, the Records line follows the Request lines', (t) => {
  const dir = requestWorld(t);
  const r = context(dir);
  const ls = outLines(r);
  const last = ls.map((l, i) => (l.startsWith('Request   ') ? i : -1)).filter((i) => i >= 0).at(-1);
  assert.ok(last >= 0, `a Request line:\n${show(r)}`);
  assert.equal(ls[last + 1],
    "Records   only al's records in .assuredloop/records/requests/ hold the tiers and the sign-off states above", show(r));
});

// --- 4. a limit: a paragraph with no text line

test('#74 al context INV-71: a linked paragraph with no text line shows "(<file>: no text line)", never its marker line', (t) => {
  const dir = baseProject(t);
  write(dir, SPEC, `${read(dir, SPEC)}\n<!-- INV-70 note -->\n\n<!-- INV-71 rule builds-on:INV-70 -->\n\nText of INV-71.\n`);
  ok(dir, ['index']);
  const marker = place(dir, SPEC, '<!-- INV-70 note -->');
  const r = context(dir, 'INV-71');
  assert.ok(labelled(r, 'Links     ').includes(`INV-70 (${SPEC}: no text line)`), show(r));
  assert.ok(!r.stdout.includes(marker), `never the marker line ${marker}:\n${show(r)}`);
  const r70 = context(dir, 'INV-70');
  assert.equal(labelled(r70, 'Linked    '), `Linked    INV-71 (${place(dir, SPEC, 'Text of INV-71.')}) builds on it`, show(r70));
});

// --- 5. the grouped Cited lines of a paragraph
//
// INV-12 is named: by its own marker (not counted); by the marker of INV-60
// (builds-on) and by the second text line of INV-60; on 12 lines of
// src/a.js; once in each of src/b1.js .. src/b6.js; on two lines of the
// archived request old (historical); and on two lines of the owner's words
// of the open request zz, in its origin/ snapshot (historical).

// Concludes a request by hand: the folder moves to requests/archive/.
function archive(dir, name) {
  editFile(dir, `requests/${name}/request.md`, 'Status: open', 'Status: concluded');
  move(dir, `requests/${name}`, `requests/archive/${name}`);
  editRecord(dir, name, (rec) => { rec.status = 'concluded'; });
}

const OLD_MD = 'requests/archive/old/request.md';
const ZZ_WORDS = 'requests/zz/origin/2026-05-04-owner-words.md';
const B_FILES = ['src/b1.js', 'src/b2.js', 'src/b3.js', 'src/b4.js', 'src/b5.js', 'src/b6.js'];

function citedWorld(t) {
  const dir = baseProject(t);
  write(dir, SPEC, `${read(dir, SPEC)}\n${doc([['INV-60 rule builds-on:INV-12', `${T60}\nIt holds each field of INV-12.`]])}`);
  const a = [];
  for (let i = 1; i <= 20; i++) a.push(i % 3 === 0 ? `// step ${i}` : `// INV-12 step ${i}`);
  write(dir, 'src/a.js', `${a.join('\n')}\n`);
  B_FILES.forEach((f, i) => write(dir, f, `export const n = ${i};\n// INV-12\n`));
  newRequest(dir, 'old');
  write(dir, 'requests/old/request.md', `${read(dir, 'requests/old/request.md')}\nThe old export followed INV-12.\nINV-12 stays.\n`);
  archive(dir, 'old');
  newRequest(dir, 'zz', 'The owner wants INV-12 kept.\nAnd INV-12 again.\n');
  ok(dir, ['index']);
  return dir;
}

// The Cited lines of INV-12 that the contract gives, in order, as [file, lines, group].
function expectedCitedOf12(dir) {
  const own = lineOf(dir, SPEC, '<!-- INV-12 data -->');
  return [
    [SPEC, citing(dir, SPEC, 'INV-12', [own]), 'current'],
    ['src/a.js', citing(dir, 'src/a.js', 'INV-12'), 'current'],
    ...B_FILES.map((f) => [f, citing(dir, f, 'INV-12'), 'current']),
    [OLD_MD, citing(dir, OLD_MD, 'INV-12'), 'historical'],
    [ZZ_WORDS, citing(dir, ZZ_WORDS, 'INV-12'), 'historical'],
  ];
}

test('#74 al context INV-12: one Cited line for each file, with the exact count and every line; current first; no "more"', (t) => {
  const dir = citedWorld(t);
  const want = expectedCitedOf12(dir);
  assert.equal(want[0][1].length, 2, 'the fixture: specs/invoices.md names INV-12 on two lines besides its own marker');
  assert.equal(want[1][1].length, 14, 'the fixture: src/a.js names INV-12 on 14 lines');
  const r = context(dir, 'INV-12');
  assert.deepEqual(allLabelled(r, 'Cited     '), want.map(([f, ns, g]) => citedLine(g, f, ns)), show(r));
  assert.doesNotMatch(r.stdout, /\bmore\b/i, `no line is left out, so no "more":\n${show(r)}`);
  assert.ok(!r.stdout.includes('  src/a.js:1: '), `no citing text without --full:\n${show(r)}`);
});

test('#74 al context INV-12: its own marker line is not counted, and .assuredloop/ is left out', (t) => {
  const dir = citedWorld(t);
  const own = lineOf(dir, SPEC, '<!-- INV-12 data -->');
  const r = context(dir, 'INV-12');
  const spec = allLabelled(r, 'Cited     ').filter((l) => l.includes(` ${SPEC}: `));
  assert.equal(spec.length, 1, show(r));
  const ns = spec[0].split(': ').at(-1).split(', ').map(Number);
  assert.ok(!ns.includes(own), `the marker line ${own} of INV-12 is not counted:\n${show(r)}`);
  assert.ok(ns.includes(lineOf(dir, SPEC, '<!-- INV-60 rule builds-on:INV-12 -->')), `the marker of INV-60 counts:\n${show(r)}`);
  assert.deepEqual(allLabelled(r, 'Cited     ').filter((l) => l.includes('.assuredloop/')), [], show(r));
});

test('#74 al context INV-12 --full: under each file line, one line for each citing line with its file, line and text', (t) => {
  const dir = citedWorld(t);
  const want = expectedCitedOf12(dir);
  const r = context(dir, 'INV-12', '--full');
  const ls = outLines(r);
  for (const [f, ns, g] of want) {
    const at = ls.indexOf(citedLine(g, f, ns));
    assert.ok(at >= 0, `the Cited line of ${f}:\n${show(r)}`);
    const text = read(dir, f).split('\n');
    assert.deepEqual(ls.slice(at + 1, at + 1 + ns.length), ns.map((n) => `  ${f}:${n}: ${text[n - 1]}`),
      `the citing lines of ${f}:\n${show(r)}`);
  }
});

test('#74 al context takes --full for every form', (t) => {
  const dir = paragraphWorld(t);
  for (const args of [['--full'], ['pdf', '--full'], ['INV-12', '--full'], ['pdf/SP-1', '--full'], ['ADR-2', '--full'], ['pdf/R1', '--full']]) {
    context(dir, ...args);
  }
});

test('#74 al context pdf/SP-1: cited by pdf/SP-1 anywhere and by a bare SP-1 inside requests/pdf/ only', (t) => {
  const dir = baseProject(t);
  newRequest(dir, 'pdf');
  write(dir, PDF_SPEC, doc([['SP-1 rule', TSP1], ['SP-2 rule builds-on:SP-1', 'SP-1 holds for each month.']]));
  write(dir, PDF_MD, `${read(dir, PDF_MD)}\nNote: SP-1 matters.\n`);
  write(dir, 'src/x.js', '// SP-1 is a bare name here\n// pdf/SP-1 names it\n');
  write(dir, 'docs/notes.md', 'SP-1 of something else.\n');
  ok(dir, ['index']);
  const r = context(dir, 'pdf/SP-1');
  assert.deepEqual(allLabelled(r, 'Cited     '), [
    citedLine('current', PDF_MD, [lineOf(dir, PDF_MD, 'Note: SP-1 matters.')]),
    citedLine('current', PDF_SPEC, [lineOf(dir, PDF_SPEC, '<!-- SP-2 rule builds-on:SP-1 -->'), lineOf(dir, PDF_SPEC, 'SP-1 holds for each month.')]),
    citedLine('current', 'src/x.js', [2]),
  ], show(r));
});

// --- 7. --at <commit>: the places as they were at that commit

test('#74 al context INV-12 --at <commit>: the head line and the Linked places are the lines at that commit', (t) => {
  const dir = baseProject(t);
  write(dir, SPEC, `${read(dir, SPEC)}\n${doc([['INV-60 rule builds-on:INV-12', T60]])}`);
  ok(dir, ['index']);
  const c1 = commitAll(dir, 'INV-60');
  const before = git(dir, 'show', `${c1}:${SPEC}`);
  editFile(dir, SPEC, '<!-- INV-12 data -->', '<!-- INV-2 note -->\n\nA new note.\n\n<!-- INV-12 data -->');
  ok(dir, ['index']);
  commitAll(dir, 'INV-2 moves INV-12 down');
  const old12 = `${SPEC}:${lineIn(before, T12)}`;
  const old60 = `${SPEC}:${lineIn(before, T60)}`;
  const now12 = place(dir, SPEC, T12);
  assert.notEqual(old12, now12, 'the fixture moves INV-12 down');

  const r = context(dir, 'INV-12', '--at', c1);
  assert.ok(labelled(r, 'Paragraph ').endsWith(` · ${old12}`), `the head at ${c1} names ${old12}:\n${show(r)}`);
  assert.equal(labelled(r, 'Linked    '), `Linked    INV-60 (${old60}) builds on it`, show(r));

  const now = context(dir, 'INV-12');
  assert.ok(labelled(now, 'Paragraph ').endsWith(` · ${now12}`), show(now));
  assert.equal(labelled(now, 'Linked    '), `Linked    INV-60 (${place(dir, SPEC, T60)}) builds on it`, show(now));
});

// --- the places tail: a bare ID of the finding's own request
//
// A bare ID in a finding that is no spec ID, and that is a paragraph of the
// finding's own open request, gets the request's name. The own request is
// the prefix of the finding's <id>, or else the folder of its <where>.

test('#74 al check: a lint on a change-spec paragraph ends with the place of its text, under its request\'s name', (t) => {
  const dir = baseProject(t);
  newRequest(dir, 'change');
  write(dir, 'requests/change/spec.md', doc([['SP-1 note', '# Changes'], ['SP-3 rule', 'A rule with no link.']]));
  ok(dir, ['index']);
  const r = ok(dir, ['check']);
  const file = 'requests/change/spec.md';
  const want = `hint no-link ${place(dir, file, '<!-- SP-3 rule -->')} SP-3 SP-3 is a rule paragraph with no link`
    + ` · places: change/SP-3 ${place(dir, file, 'A rule with no link.')}`;
  assert.ok(outLines(r).includes(want), `the line\n${want}\n${show(r)}`);
});

test('#74 al check: a bare ID of the own request that is only at the base is named with its request and its place at the base', (t) => {
  const dir = baseProject(t, { branch: null });
  const file = 'requests/exp/spec.md';
  newRequest(dir, 'exp');
  write(dir, file, doc([['SP-1 note', '# Exports'], ['SP-2 plan', 'Step one: add the route.'], ['SP-3 plan', 'Step two: add the button.']]));
  ok(dir, ['index']);
  commitAll(dir, 'exp');
  const atBase = lineOf(dir, file, 'Step two: add the button.');
  git(dir, 'checkout', '-q', '-b', 'feature');
  write(dir, file, doc([['SP-1 note', '# Exports'], ['SP-2 plan explains:SP-3', 'Step one: add the route.']]));
  const base = git(dir, 'rev-parse', '--short=7', 'main');
  const r = ok(dir, ['check']);
  const want = `hint unresolved-link ${place(dir, file, '<!-- SP-2 plan explains:SP-3 -->')} exp/SP-2 SP-3: no such ID`
    + ` · places: exp/SP-2 ${place(dir, file, 'Step one: add the route.')}, exp/SP-3 at the base ${base} ${file}:${atBase}`;
  assert.ok(outLines(r).includes(want), `the line\n${want}\n${show(r)}`);
});

// --- Cited and central:<ID>
//
// In a repo that is not the central repo, a line that names only
// central:INV-12 names another repo's INV-12, so it is no citing place of
// this repo's INV-12. In the central repo it is.

const CENTRAL_SRC = '// central:INV-12 is the invoice data\n// INV-12 is read here\n';

function centralOrNot(t, central) {
  const dir = project(t);
  if (central) {
    const output = project(t);
    write(output, 'README.md', '# An output repository\n');
    commitAll(output, 'The output base');
    writeConfig(dir, [{ file: SPEC, prefix: 'INV' }], {
      repo: 'invoicer',
      outputs: [{ name: 'invoicer-worker', path: `../${output.split('/').at(-1)}`, commit: 'HEAD' }],
    });
  } else {
    writeConfig(dir, [{ file: SPEC, prefix: 'INV' }]);
  }
  write(dir, SPEC, INVOICES);
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  write(dir, 'src/a.js', CENTRAL_SRC);
  ok(dir, ['index']);
  return dir;
}

test('#74 al context INV-12 in a repo that is not central: a line that names only central:INV-12 is no Cited place', (t) => {
  const r = context(centralOrNot(t, false), 'INV-12');
  assert.deepEqual(allLabelled(r, 'Cited     '), [citedLine('current', 'src/a.js', [2])], show(r));
});

test('#74 al context INV-12 in the central repo: a line that names central:INV-12 is a Cited place', (t) => {
  const r = context(centralOrNot(t, true), 'INV-12');
  assert.deepEqual(allLabelled(r, 'Cited     '), [citedLine('current', 'src/a.js', [1, 2])], show(r));
});

// --- the Records line names only the facts that the record holds
//
// In this order, joined as "a, b and c": the tier (when request.md has no
// Tier: line that says it), the sign-offs, the requirement versions, the
// tasks, the close lines. With none of these: "holds no sign-off, task or
// close line".

const recordsLine = (r) => labelled(r, 'Records   ');
const RECORD = "al's record .assuredloop/records/requests/pdf.yaml";

function signedPdf(t, tier = []) {
  const dir = baseProject(t);
  newRequest(dir, 'pdf', 'The owner wants pdf.\n', tier);
  appendSection(dir, 'pdf', organized([R1]));
  ok(dir, ['record', 'pdf', 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
  ok(dir, ['index']);
  return dir;
}

test('#74 al context pdf: with no close line, the Records line does not name close lines', (t) => {
  const r = context(signedPdf(t), 'pdf');
  assert.equal(recordsLine(r), `Records   only ${RECORD} holds the tier, the sign-offs and the requirement versions below`, show(r));
});

test('#74 al context pdf: with a close line, the Records line names the close lines', (t) => {
  const dir = signedPdf(t);
  ok(dir, ['record', 'pdf', 'close', '--on', 'R1', '--reason', 'A one-time setup meets it.', '--yes']);
  ok(dir, ['index']);
  const r = context(dir, 'pdf');
  assert.equal(recordsLine(r),
    `Records   only ${RECORD} holds the tier, the sign-offs, the requirement versions and the close lines below`, show(r));
});

test('#74 al context pdf: with a Tier: line and nothing recorded, "holds no sign-off, task or close line"', (t) => {
  const dir = baseProject(t);
  newRequest(dir, 'pdf', 'The owner wants pdf.\n', ['--tier', '1']);
  ok(dir, ['index']);
  const r = context(dir, 'pdf');
  assert.match(read(dir, PDF_MD), /^Tier: 1/m, 'the fixture: request.md has a Tier: line');
  assert.equal(recordsLine(r), `Records   ${RECORD} holds no sign-off, task or close line`, show(r));
});

// --- a limit: evidence that cannot be read
//
// A committed file with mode 000: git grep reports it on stderr
// ("error: failed to stat '<file>': Permission denied") and goes on. After
// the file lines, Cited gives one line for each report:
//   Cited     not known: <git's message without "error: ">
// With no file line, the first Cited line is "nowhere in the files that
// were read", never the bare "nowhere", and the Checks line ends with
// " · not known: <the messages joined by "; ">". Root reads every file, so
// the tests are skipped there.

const AS_ROOT = process.getuid?.() === 0;
const DENIED = (file) => `failed to stat '${file}': Permission denied`;

// Runs fn with file at mode 000, and gives the mode back before the temp dir goes.
function unreadable(dir, file, fn) {
  chmodSync(join(dir, file), 0o000);
  try {
    return fn();
  } finally {
    chmodSync(join(dir, file), 0o644);
  }
}

function unreadableWorld(t) {
  const dir = baseProject(t);
  write(dir, 'src/a.js', '// INV-13 is read here\n');
  write(dir, 'src/b.js', '// INV-13 is checked here\n');
  ok(dir, ['index']);
  commitAll(dir, 'src');
  return dir;
}

test('#74 al context INV-13: a file that cannot be read gives "Cited     not known: <git\'s message>" after the file lines', { skip: AS_ROOT }, (t) => {
  const dir = unreadableWorld(t);
  const r = unreadable(dir, 'src/b.js', () => context(dir, 'INV-13'));
  const ls = allLabelled(r, 'Cited     ');
  assert.equal(ls[0], citedLine('current', 'src/a.js', [1]), show(r));
  const rest = ls.slice(1);
  assert.ok(rest.length >= 1, `a not known line:\n${show(r)}`);
  assert.deepEqual(rest, [`Cited     not known: ${DENIED('src/b.js')}`], `each message once:\n${show(r)}`);
  // The Checks line names the limit also when a file line is found.
  assert.ok(labelled(r, 'Checks    ').endsWith(` · not known: ${DENIED('src/b.js')}`), show(r));
});

test('#74 al context INV-41: with no file line and an unreadable file, "Cited     nowhere in the files that were read", and the Checks line names the limit', { skip: AS_ROOT }, (t) => {
  const dir = baseProject(t);
  write(dir, 'src/c.js', '// INV-41 is checked here\n');
  ok(dir, ['index']);
  commitAll(dir, 'src');
  const r = unreadable(dir, 'src/c.js', () => context(dir, 'INV-41'));
  const ls = allLabelled(r, 'Cited     ');
  assert.equal(ls[0], 'Cited     nowhere in the files that were read', show(r));
  assert.ok(!ls.includes('Cited     nowhere'), `never the bare "nowhere":\n${show(r)}`);
  assert.deepEqual(ls.slice(1), [`Cited     not known: ${DENIED('src/c.js')}`], `each message once:\n${show(r)}`);
  const checks = labelled(r, 'Checks    ');
  const tail = checks.slice(checks.indexOf(' · not known: ') + ' · not known: '.length);
  assert.ok(checks.includes(' · not known: '), `the Checks line names the limit:\n${show(r)}`);
  assert.deepEqual(tail.split('; '), [DENIED('src/c.js')], show(r));
});

test('#74 al context INV-41: control: with every file readable, "Cited     nowhere" and no limit', (t) => {
  const r = context(baseProject(t), 'INV-41');
  assert.deepEqual(allLabelled(r, 'Cited     '), ['Cited     nowhere'], show(r));
  assert.doesNotMatch(r.stdout, /not known: failed/, show(r));
});

// --- the Task lines of the request view
//
//   Task      T1 (<record path>:<line>) <ref> (a work item: al context does not read it) · delivers R1 (<place>), R4 (<place>)[ · PRs: ...]
// <line> is the `- id: T1` line under `tasks:` in the record. A task with no
// ref has no ref part. A delivered ID that al cannot find shows "(not found)".

const R4 = req('R4', 'ISO dates', 'Every date in an export MUST be ISO 8601.');
const PDF_RECORD = '.assuredloop/records/requests/pdf.yaml';

function taskWorld(t) {
  const dir = baseProject(t);
  newRequest(dir, 'pdf');
  appendSection(dir, 'pdf', organized([R1, R4]));
  ok(dir, ['record', 'pdf', 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
  editRecord(dir, 'pdf', (rec) => {
    rec.tasks = [{ id: 'T1', ref: 'tasks.md T1', delivers: ['R1', 'R4'] }, { id: 'T2', delivers: ['R9'] }];
  });
  ok(dir, ['index']);
  return dir;
}

// The line of a task's `- id: <id>` entry under `tasks:` in the record.
function taskLine(dir, id) {
  const ls = read(dir, PDF_RECORD).split('\n');
  const from = ls.indexOf('tasks:');
  assert.ok(from >= 0, `the record has tasks:\n${ls.join('\n')}`);
  const at = ls.findIndex((l, i) => i > from && new RegExp(`^\\s*- id: ${id}$`).test(l));
  assert.ok(at > from, `the record has the task ${id}`);
  return at + 1;
}

const isTaskLine = (line, prefix) => line === prefix || line.startsWith(`${prefix} · PRs: `);

test('#74 al context pdf: a Task line gives the task\'s place in the record, says that al does not read the work item, and places each delivered requirement', (t) => {
  const dir = taskWorld(t);
  const r = context(dir, 'pdf');
  const want = `Task      T1 (${PDF_RECORD}:${taskLine(dir, 'T1')}) tasks.md T1 (a work item: al context does not read it)`
    + ` · delivers R1 (${place(dir, PDF_MD, '### R1 Monthly CSV')}), R4 (${place(dir, PDF_MD, '### R4 ISO dates')})`;
  const found = outLines(r).filter((l) => l.startsWith('Task      T1 '));
  assert.equal(found.length, 1, show(r));
  assert.ok(isTaskLine(found[0], want), `the line\n${want}\n${show(r)}`);
});

test('#74 al context pdf: a task with no ref has no ref part, and a delivered ID that al cannot find shows "(not found)"', (t) => {
  const dir = taskWorld(t);
  const r = context(dir, 'pdf');
  const want = `Task      T2 (${PDF_RECORD}:${taskLine(dir, 'T2')}) · delivers R9 (not found)`;
  const found = outLines(r).filter((l) => l.startsWith('Task      T2 '));
  assert.equal(found.length, 1, show(r));
  assert.ok(isTaskLine(found[0], want), `the line\n${want}\n${show(r)}`);
});

// --- facts held only in al's records: the paragraph view
//
// Right after the last Serves line, when a Serves line names a requirement
// that al found:
//   Records   only al's record <path> holds the version and the sign-off state on the Serves lines
//   Records   only al's records <path>, <path> hold the versions and the sign-off states on the Serves lines
// (two or more requests; paths in the order of the Serves lines, each once).

const XLS_R1 = req('R1', 'Monthly XLSX', 'A user MUST be able to download one month as one XLSX file.');

function servesWorld(t, serves) {
  const dir = baseProject(t);
  newRequest(dir, 'pdf');
  appendSection(dir, 'pdf', organized([R1, R4]));
  ok(dir, ['record', 'pdf', 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
  newRequest(dir, 'xls');
  appendSection(dir, 'xls', organized([XLS_R1]));
  editFile(dir, SPEC, '<!-- INV-13 rule -->', `<!-- INV-13 rule serves:${serves} -->`);
  ok(dir, ['index']);
  return dir;
}

// The line right after the last Serves line.
function afterServes(r) {
  const ls = outLines(r);
  const last = ls.map((l, i) => (l.startsWith('Serves    ') ? i : -1)).filter((i) => i >= 0).at(-1);
  assert.ok(last >= 0, `a Serves line:\n${show(r)}`);
  return ls[last + 1];
}

test('#74 al context INV-13 that serves pdf/R1: a Records line right after Serves names the one record', (t) => {
  const r = context(servesWorld(t, 'pdf/R1'), 'INV-13');
  assert.equal(afterServes(r),
    `Records   only al's record ${PDF_RECORD} holds the version and the sign-off state on the Serves lines`, show(r));
});

test('#74 al context INV-13 that serves requirements of two requests: the Records line names both records, in the order of the Serves lines, each once', (t) => {
  const r = context(servesWorld(t, 'pdf/R1,pdf/R4,xls/R1'), 'INV-13');
  const names = [];
  for (const l of allLabelled(r, 'Serves    ')) {
    const m = /^Serves {4}([\w-]+)\/R\d+ /.exec(l);
    assert.ok(m, `a Serves line that names a requirement: ${l}\n${show(r)}`);
    if (!names.includes(m[1])) names.push(m[1]);
  }
  assert.deepEqual([...names].sort(), ['pdf', 'xls'], show(r));
  const paths = names.map((n) => `.assuredloop/records/requests/${n}.yaml`).join(', ');
  assert.equal(afterServes(r),
    `Records   only al's records ${paths} hold the versions and the sign-off states on the Serves lines`, show(r));
});

test('#74 al context INV-41: control: no Serves line, no Records line', (t) => {
  const r = context(servesWorld(t, 'pdf/R1'), 'INV-41');
  assert.deepEqual(allLabelled(r, 'Records   '), [], show(r));
});

// --- facts held only in al's records: the project view
//
// "the tiers" only when an open request's request.md has no Tier: line that
// says its tier. A record that is not there adds
// "; not known: the record of <name> (it is not there)".

const PROJECT_RECORDS = "Records   only al's records in .assuredloop/records/requests/ hold";

function tieredWorld(t, { untiered = false } = {}) {
  const dir = baseProject(t);
  newRequest(dir, 'pdf', 'The owner wants pdf.\n', ['--tier', '2']);
  newRequest(dir, 'other', 'The owner wants other.\n', ['--tier', '1']);
  if (untiered) newRequest(dir, 'loose');
  ok(dir, ['index']);
  return dir;
}

test('#74 al context: when every open request has a Tier: line, the Records line does not name the tiers', (t) => {
  const dir = tieredWorld(t);
  assert.match(read(dir, PDF_MD), /^Tier: 2/m, 'the fixture: request.md has a Tier: line');
  const r = context(dir);
  assert.equal(labelled(r, 'Records   '), `${PROJECT_RECORDS} the sign-off states above`, show(r));
});

test('#74 al context: control: an open request with no Tier: line, so the Records line names the tiers', (t) => {
  const r = context(tieredWorld(t, { untiered: true }));
  assert.equal(labelled(r, 'Records   '), `${PROJECT_RECORDS} the tiers and the sign-off states above`, show(r));
});

test('#74 al context: an open request whose record is not there: the Records line ends with "; not known: the record of <name> (it is not there)"', (t) => {
  const dir = tieredWorld(t);
  rmSync(join(dir, '.assuredloop/records/requests/other.yaml'));
  const r = context(dir);
  assert.equal(labelled(r, 'Records   '),
    `${PROJECT_RECORDS} the sign-off states above; not known: the record of other (it is not there)`, show(r));
});

// --- the ADR's own file in Cited
//
// The ADR's own file counts, except the marker lines of its own paragraphs
// (its head marker and each ADR-n-m marker). It is current, or historical
// when the ADR is superseded.

test('#74 al context ADR-2: its heading and a body line of its own file are citing lines; its markers are not; --full shows them', (t) => {
  const dir = baseProject(t);
  const file = 'specs/adr/0002-csv.md';
  write(dir, file, adr('accepted', 'ADR-2 choice decides:INV-12', '# ADR-2: CSV files', [['ADR-2-1 rationale', 'ADR-2 applies to the export.']]));
  ok(dir, ['index']);
  const ns = [lineOf(dir, file, '# ADR-2: CSV files'), lineOf(dir, file, 'ADR-2 applies to the export.')];
  const r = context(dir, 'ADR-2');
  assert.deepEqual(allLabelled(r, 'Cited     '), [citedLine('current', file, ns)], show(r));
  const full = outLines(context(dir, 'ADR-2', '--full'));
  const at = full.indexOf(citedLine('current', file, ns));
  assert.ok(at >= 0, show(r));
  assert.deepEqual(full.slice(at + 1, at + 3), [`  ${file}:${ns[0]}: # ADR-2: CSV files`, `  ${file}:${ns[1]}: ADR-2 applies to the export.`], show(r));
});

test('#74 al context ADR-1, superseded: its own file\'s citing lines are historical', (t) => {
  const dir = paragraphWorld(t);
  const r = context(dir, 'ADR-1');
  const own = citing(dir, ADR1, 'ADR-1', [lineOf(dir, ADR1, '<!-- ADR-1 choice decides:INV-12 -->')]);
  assert.deepEqual(own, [lineOf(dir, ADR1, '# ADR-1: XLSX files')], 'the fixture: its heading names ADR-1');
  assert.ok(allLabelled(r, 'Cited     ').includes(citedLine('historical', ADR1, own)), show(r));
});

// --- a limit: a served request's record that is not there or cannot be read
//
// Right after the Serves lines (after the "only al's record" line, if any),
// for each such record:
//   Records   not known: the record <path> (<reason>), so al cannot check the version and the sign-off state on its Serves lines
// <reason>: "it is not there"; the YAML parser's first message line; or
// "not a mapping". Such a record is never named in the "only al's record"
// line, which names only records that al read.

const XLS_RECORD = '.assuredloop/records/requests/xls.yaml';
const NOT_CHECKED = ', so al cannot check the version and the sign-off state on its Serves lines';
const notKnownRecord = (path, reason) => `Records   not known: the record ${path} (${reason})${NOT_CHECKED}`;

// The Records lines right after the last Serves line, in order.
function recordsAfterServes(r) {
  const ls = outLines(r);
  const last = ls.map((l, i) => (l.startsWith('Serves    ') ? i : -1)).filter((i) => i >= 0).at(-1);
  assert.ok(last >= 0, `a Serves line:\n${show(r)}`);
  const out = [];
  for (let i = last + 1; ls[i]?.startsWith('Records   '); i++) out.push(ls[i]);
  return out;
}

const BAD_RECORDS = [
  ['not there', (dir) => rmSync(join(dir, PDF_RECORD)), 'it is not there'],
  ['a scalar', (dir) => write(dir, PDF_RECORD, 'just a string\n'), 'not a mapping'],
  ['a list', (dir) => write(dir, PDF_RECORD, '- a\n- b\n'), 'not a mapping'],
];

for (const [what, spoil, reason] of BAD_RECORDS) {
  test(`#74 al context INV-13 that serves pdf/R1, with pdf's record ${what}: a not-known Records line, and no "only al's record" line`, (t) => {
    const dir = servesWorld(t, 'pdf/R1');
    spoil(dir);
    const r = context(dir, 'INV-13');
    assert.deepEqual(recordsAfterServes(r), [notKnownRecord(PDF_RECORD, reason)], show(r));
  });
}

test('#74 al context INV-13 that serves pdf/R1, with pdf\'s record invalid YAML: the not-known line gives the parser\'s reason', (t) => {
  const dir = servesWorld(t, 'pdf/R1');
  write(dir, PDF_RECORD, 'requirements: [\n  - id: R1\n');
  const r = context(dir, 'INV-13');
  const ls = recordsAfterServes(r);
  assert.equal(ls.length, 1, show(r));
  const head = `Records   not known: the record ${PDF_RECORD} (`;
  assert.ok(ls[0].startsWith(head) && ls[0].endsWith(`)${NOT_CHECKED}`), show(r));
  assert.ok(ls[0].length > head.length + `)${NOT_CHECKED}`.length, `a reason in the parentheses:\n${show(r)}`);
});

test('#74 al context INV-13 that serves pdf/R1 and xls/R1, with pdf\'s record not there: "only" names xls\'s record alone, then the limit on pdf\'s', (t) => {
  const dir = servesWorld(t, 'pdf/R1,xls/R1');
  rmSync(join(dir, PDF_RECORD));
  const r = context(dir, 'INV-13');
  assert.deepEqual(recordsAfterServes(r), [
    `Records   only al's record ${XLS_RECORD} holds the version and the sign-off state on the Serves lines`,
    notKnownRecord(PDF_RECORD, 'it is not there'),
  ], show(r));
});

// --- citations on a marker line
//
// The marker's own ID (the first ID after "<!--") is no citation; every
// other ID on that line, a link target, is one. In all three views.

function markerWorld(t) {
  const dir = baseProject(t);
  write(dir, 'specs/adr/0002-csv.md', adr('accepted', 'ADR-2 choice decides:INV-12', '# CSV files',
    [['ADR-2-1 rationale explains:ADR-2', 'Context: every spreadsheet reads CSV.']]));
  write(dir, SPEC, `${read(dir, SPEC)}\n${doc([['INV-80 rule builds-on:INV-80', 'An export MUST be built in one pass.']])}`);
  newRequest(dir, 'pdf');
  appendSection(dir, 'pdf', organized([R1]));
  editFile(dir, SPEC, '<!-- INV-13 rule -->', '<!-- INV-13 rule serves:pdf/R1 -->');
  ok(dir, ['index']);
  return dir;
}
const ADR2_CSV = 'specs/adr/0002-csv.md';

test('#74 al context ADR-2: the marker <!-- ADR-2-1 rationale explains:ADR-2 --> in its own file cites ADR-2; --full shows that line', (t) => {
  const dir = markerWorld(t);
  const at = lineOf(dir, ADR2_CSV, '<!-- ADR-2-1 rationale explains:ADR-2 -->');
  assert.ok(!read(dir, ADR2_CSV).split('\n').some((l, i) => i + 1 !== at && i + 1 !== lineOf(dir, ADR2_CSV, '<!-- ADR-2 choice decides:INV-12 -->') && word('ADR-2').test(l)),
    'the fixture: no other line names ADR-2 but its head marker');
  const r = context(dir, 'ADR-2');
  assert.deepEqual(allLabelled(r, 'Cited     '), [citedLine('current', ADR2_CSV, [at])], show(r));
  const full = outLines(context(dir, 'ADR-2', '--full'));
  const i = full.indexOf(citedLine('current', ADR2_CSV, [at]));
  assert.ok(i >= 0, show(r));
  assert.equal(full[i + 1], `  ${ADR2_CSV}:${at}: <!-- ADR-2-1 rationale explains:ADR-2 -->`, show(r));
});

test('#74 al context INV-12: ADR-2\'s head marker <!-- ADR-2 choice decides:INV-12 --> cites INV-12', (t) => {
  const dir = markerWorld(t);
  const r = context(dir, 'INV-12');
  assert.ok(allLabelled(r, 'Cited     ').includes(citedLine('current', ADR2_CSV, [lineOf(dir, ADR2_CSV, '<!-- ADR-2 choice decides:INV-12 -->')])), show(r));
});

test('#74 al context INV-80: its own marker <!-- INV-80 rule builds-on:INV-80 --> is counted once, for the link', (t) => {
  const dir = markerWorld(t);
  const r = context(dir, 'INV-80');
  assert.deepEqual(allLabelled(r, 'Cited     '), [citedLine('current', SPEC, [lineOf(dir, SPEC, '<!-- INV-80 rule builds-on:INV-80 -->')])], show(r));
});

test('#74 al context pdf/R1: the marker <!-- INV-13 rule serves:pdf/R1 --> cites pdf/R1', (t) => {
  const dir = markerWorld(t);
  const r = context(dir, 'pdf/R1');
  assert.ok(allLabelled(r, 'Cited     ').includes(citedLine('current', SPEC, [lineOf(dir, SPEC, '<!-- INV-13 rule serves:pdf/R1 -->')])), show(r));
});

// --- only a real marker declares
//
// The rule "a marker's own ID is no citation" holds only for a line that al
// reads as the marker of a paragraph: in a spec doc, a change spec or an ADR,
// outside fenced code. Any other line that starts like a marker cites the ID.

function lookalikeWorld(t) {
  const dir = baseProject(t);
  write(dir, 'src/view.html', '<!-- INV-12 -->\n<p>Invoices</p>\n');
  write(dir, 'README.md', '# Notes\n\n```markdown\n<!-- INV-12 rule -->\nA paragraph.\n```\n');
  write(dir, SPEC, `${read(dir, SPEC)}\nAn example of a marker:\n\n\`\`\`\n<!-- INV-12 data -->\n\`\`\`\n`);
  ok(dir, ['index']);
  return dir;
}
const citedIn = (r, file) => allLabelled(r, 'Cited     ').filter((l) => l.startsWith(`Cited     current ${file}: `));

test('#74 al context INV-12: <!-- INV-12 --> on line 1 of src/view.html is a citing place', (t) => {
  const dir = lookalikeWorld(t);
  assert.equal(read(dir, 'src/view.html').split('\n')[0], '<!-- INV-12 -->', 'the fixture');
  const r = context(dir, 'INV-12');
  assert.deepEqual(citedIn(r, 'src/view.html'), ['Cited     current src/view.html: 1 line: 1'], show(r));
});

test('#74 al context INV-12: a fenced <!-- INV-12 rule --> on line 4 of README.md is a citing place', (t) => {
  const dir = lookalikeWorld(t);
  assert.equal(read(dir, 'README.md').split('\n')[3], '<!-- INV-12 rule -->', 'the fixture');
  const r = context(dir, 'INV-12');
  assert.deepEqual(citedIn(r, 'README.md'), ['Cited     current README.md: 1 line: 4'], show(r));
});

test('#74 al context INV-12: in specs/invoices.md a fenced <!-- INV-12 data --> cites INV-12; its real marker does not', (t) => {
  const dir = lookalikeWorld(t);
  const ls = read(dir, SPEC).split('\n');
  const real = ls.indexOf('<!-- INV-12 data -->') + 1;
  const fenced = ls.lastIndexOf('<!-- INV-12 data -->') + 1;
  assert.ok(real > 0 && fenced > real && ls[fenced - 2] === '```' && ls[fenced] === '```', 'the fixture: the real marker first, the fenced example last');
  const ns = citing(dir, SPEC, 'INV-12', [real]);
  assert.ok(ns.includes(fenced), 'the fixture');
  const r = context(dir, 'INV-12');
  assert.deepEqual(citedIn(r, SPEC), [citedLine('current', SPEC, ns)], show(r));
});
