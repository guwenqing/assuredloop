// #58: `al context <ID>` for an ADR and for a requirement (spec LD-18 of
// requests/light-design; the list of R1 points to it). Written from the
// public interface only:
//
//   ADR       ADR-2 · <status> · <file>:<line>: <heading text>
//   Replaced  <supersedes ADR-1 (<place>), ... | replaces no ADR> · <superseded by ADR-5 (<place>) | not replaced>
//   Decides   <IDs, each with its (<place>), joined by ", " | nothing>
//   Linked    <as for a paragraph>
//   Open      <name>/<SP-n> (<place>) <word> it, ... | no open change names it
//   Cited     <current|historical> <file>: <n> line[s]: <l1>, <l2>, ...   (one line for each file) | nowhere
//
//   Requirement <name>/R1 version <v> · <signed in S1 | changed since S1 | not signed> · requests/<name>/request.md:<line>: <title>: <body>
//   Signed    <last signed: version <v> in S<n> (only al's record .assuredloop/records/requests/<name>.yaml holds this) | never signed>
//   Served    <by <IDs, each with its (<place>)> (declared serves links) | by no paragraph>
//   Open      <...>
//   Cited     <...>
//
// Cited: each file that names the ID as a whole word, with every line that
// names it (#74), .assuredloop/ left out. <place> is <file>:<line> of the
// item's text (#74). Historical: a file under requests/archive/, an
// origin/ snapshot, or a superseded ADR; every other place is current.
// An unknown ID: exit 2 and `al: <ID>: no such ID`. No model, no network.
// Nothing here reads src/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  al, appendSection, baseProject, doc, editFile, editRecord, move, newRequest, ok, organized, read, refused, req, show, write,
} from './helpers/project.js';

const SPEC = 'specs/invoices.md';
const ADR1 = 'specs/adr/0001-xlsx.md';
const ADR2 = 'specs/adr/0002-csv.md';
const ADR3 = 'specs/adr/0003-signed-links.md';
const R1 = req('R1', 'Monthly CSV', 'A user MUST be able to download one month as one CSV file.');
const R2 = req('R2', 'Yearly ZIP', 'A user MUST be able to download one year as one ZIP file.');

const adr = (status, marker, heading, more = []) => `Status: ${status}\n\n${doc([[marker, heading], ...more])}`;

function lineOf(dir, file, text) {
  const at = read(dir, file).split('\n').indexOf(text);
  assert.ok(at >= 0, `${file} has the line ${JSON.stringify(text)}`);
  return at + 1;
}

const context = (dir, id) => ok(dir, ['context', id]);
// The one line that starts with the label (padded as in the interface).
function labelled(r, label) {
  const found = r.stdout.split('\n').filter((l) => l.startsWith(label));
  assert.equal(found.length, 1, `one line that starts with "${label}":\n${show(r)}`);
  return found[0];
}

// The places of the Cited lines, as <file>:<line>: {current: [...], historical: [...]}.
// Each Cited line is `Cited     <current|historical> <file>: <n> line[s]: <l1>, ...` (#74).
function cited(r) {
  const found = r.stdout.split('\n').filter((l) => l.startsWith('Cited     '));
  assert.ok(found.length >= 1, `a Cited line:\n${show(r)}`);
  const out = { current: [], historical: [] };
  if (found.length === 1 && found[0] === 'Cited     nowhere') return out;
  for (const line of found) {
    const m = /^Cited {5}(current|historical) (\S+): (\d+) lines?: (\d+(?:, \d+)*)$/.exec(line);
    assert.ok(m, `a Cited line of one file: ${line}\n${show(r)}`);
    const ns = m[4].split(', ');
    assert.equal(ns.length, Number(m[3]), `the count is the number of lines: ${line}\n${show(r)}`);
    for (const n of ns) out[m[1]].push(`${m[2]}:${n}`);
  }
  return out;
}

// Concludes a request by hand: the folder moves to requests/archive/.
function archive(dir, name) {
  editFile(dir, `requests/${name}/request.md`, 'Status: open', 'Status: concluded');
  move(dir, `requests/${name}`, `requests/archive/${name}`);
  editRecord(dir, name, (rec) => { rec.status = 'concluded'; });
}

// --- the ADR world
//
// ADR-1 (superseded by ADR-2) decides INV-12. ADR-2 (accepted) supersedes
// ADR-1 and decides INV-12 and INV-13. ADR-3 (accepted, from baseProject)
// decides nothing. ADR-2 is named by: INV-60 in specs/invoices.md (current),
// src/export.js line 2 (current), the archived request old-xlsx
// (historical), and ADR-1's status line (a superseded ADR: historical). The
// open request pdf has SP-1, which changes ADR-2.
function adrWorld(t) {
  const dir = baseProject(t);
  write(dir, ADR1, adr('superseded by ADR-2', 'ADR-1 choice decides:INV-12', '# ADR-1: XLSX files'));
  write(dir, ADR2, adr('accepted', 'ADR-2 choice supersedes:ADR-1 decides:INV-12,INV-13', '# ADR-2: CSV files',
    [['ADR-2-1 rationale', 'Context: every spreadsheet reads CSV.']]));
  write(dir, SPEC, `${read(dir, SPEC)}\n${doc([['INV-60 rule', 'An export MUST be a CSV file, as ADR-2 decides.']])}`);
  write(dir, 'src/export.js', 'export const type = "csv";\n// ADR-2: CSV, not XLSX\n');
  newRequest(dir, 'old-xlsx');
  write(dir, 'requests/old-xlsx/request.md', `${read(dir, 'requests/old-xlsx/request.md')}\nThe old export followed ADR-2.\n`);
  archive(dir, 'old-xlsx');
  newRequest(dir, 'pdf');
  appendSection(dir, 'pdf', organized([R2]));
  write(dir, 'requests/pdf/spec.md', doc([['SP-1 choice serves:R2 changes:ADR-2', 'A year is one ZIP of CSV files.']]));
  ok(dir, ['index']);
  return dir;
}

test('#58 al context ADR-2: the ADR line names its status, its file and the line of its heading text, and the whole text of the ADR (round 3)', (t) => {
  const dir = adrWorld(t);
  const r = context(dir, 'ADR-2');
  const line = labelled(r, 'ADR       ');
  assert.ok(line.startsWith(`ADR       ADR-2 · accepted · ${ADR2}:5: `), show(r));
  assert.ok(line.endsWith(': # ADR-2: CSV files Context: every spreadsheet reads CSV.'), `the whole text of ADR-2:\n${show(r)}`);
});

test('#58 al context ADR-2: "Replaced  supersedes ADR-1 · not replaced" and "Decides   INV-12, INV-13"', (t) => {
  const dir = adrWorld(t);
  const r = context(dir, 'ADR-2');
  assert.equal(labelled(r, 'Replaced  '), `Replaced  supersedes ADR-1 (${ADR1}:5) · not replaced`, show(r));
  assert.equal(labelled(r, 'Decides   '), `Decides   INV-12 (${SPEC}:7), INV-13 (${SPEC}:11)`, show(r));
  labelled(r, 'Linked    ');
});

test('#58 al context ADR-1, a superseded ADR: its status says superseded, and "Replaced  replaces no ADR · superseded by ADR-2"', (t) => {
  const dir = adrWorld(t);
  const r = context(dir, 'ADR-1');
  assert.ok(labelled(r, 'ADR       ').startsWith('ADR       ADR-1 · superseded'), show(r));
  assert.equal(labelled(r, 'Replaced  '), `Replaced  replaces no ADR · superseded by ADR-2 (${ADR2}:5)`, show(r));
  assert.equal(labelled(r, 'Decides   '), `Decides   INV-12 (${SPEC}:7)`, show(r));
});

test('#58 al context ADR-3: "Decides   nothing", "replaces no ADR · not replaced", and "Open      no open change names it"', (t) => {
  const dir = adrWorld(t);
  const r = context(dir, 'ADR-3');
  assert.ok(labelled(r, 'ADR       ').startsWith(`ADR       ADR-3 · accepted · ${ADR3}:5: `), show(r));
  assert.equal(labelled(r, 'Replaced  '), 'Replaced  replaces no ADR · not replaced', show(r));
  assert.equal(labelled(r, 'Decides   '), 'Decides   nothing', show(r));
  assert.equal(labelled(r, 'Open      '), 'Open      no open change names it', show(r));
});

test('#58 al context ADR-2: the Open line names the open paragraph pdf/SP-1 that changes it', (t) => {
  const dir = adrWorld(t);
  const r = context(dir, 'ADR-2');
  assert.ok(labelled(r, 'Open      ').includes('pdf/SP-1 (requests/pdf/spec.md:3) changes it'), show(r));
});

test('#58 al context ADR-2: Cited marks specs/ and code as current, and an archived request and a superseded ADR as historical; never .assuredloop/', (t) => {
  const dir = adrWorld(t);
  const r = context(dir, 'ADR-2');
  const c = cited(r);
  const spec = `${SPEC}:${lineOf(dir, SPEC, 'An export MUST be a CSV file, as ADR-2 decides.')}`;
  const archived = `requests/archive/old-xlsx/request.md:${lineOf(dir, 'requests/archive/old-xlsx/request.md', 'The old export followed ADR-2.')}`;
  assert.ok(c.current.includes(spec), `current: ${spec}:\n${show(r)}`);
  assert.ok(c.current.includes('src/export.js:2'), `current: src/export.js:2:\n${show(r)}`);
  assert.ok(c.historical.includes(archived), `historical: ${archived}:\n${show(r)}`);
  assert.ok(c.historical.includes(`${ADR1}:1`), `historical: ${ADR1}:1 (a superseded ADR):\n${show(r)}`);
  for (const p of [spec, 'src/export.js:2']) assert.ok(!c.historical.includes(p), `${p} is not historical:\n${show(r)}`);
  assert.ok(!c.current.includes(archived) && !c.current.includes(`${ADR1}:1`), `no historical place is current:\n${show(r)}`);
  assert.deepEqual([...c.current, ...c.historical].filter((p) => p.startsWith('.assuredloop/')), [], show(r));
  // #74: the ADR's own file counts (current here), but not its own paragraphs' marker lines.
  assert.ok(c.current.includes(`${ADR2}:5`), `current: ${ADR2}:5, its heading:\n${show(r)}`);
  assert.ok(![...c.current, ...c.historical].includes(`${ADR2}:3`), `not ${ADR2}:3, its own marker:\n${show(r)}`);
});

test('#58 al context ADR-99, an unknown ADR: exit 2 and "al: ADR-99: no such ID"', (t) => {
  const dir = adrWorld(t);
  const r = refused(dir, ['context', 'ADR-99']);
  assert.match(r.stdout, /^al: ADR-99: no such ID$/m, show(r));
});

// --- the requirement world
//
// The open request csv-export: R1, signed in S1; R2, added after the
// sign-off and indexed, never signed. Its change spec has SP-1, which serves
// R1. src/export.js names csv-export/R1 on line 1.
function reqWorld(t) {
  const dir = baseProject(t);
  newRequest(dir, 'csv-export');
  appendSection(dir, 'csv-export', organized([R1]));
  ok(dir, ['record', 'csv-export', 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
  editFile(dir, 'requests/csv-export/request.md', 'Signed off:', `${R2.block}\nSigned off:`);
  write(dir, 'requests/csv-export/spec.md', doc([['SP-1 rule serves:R1', 'An export MUST hold one month.']]));
  write(dir, 'src/export.js', '// csv-export/R1: one month\n');
  ok(dir, ['index']);
  return dir;
}
const MD = 'requests/csv-export/request.md';
const word = (id) => new RegExp(`(?<![\\w-])${id}(?![\\w-])`);

test('#58 al context csv-export/R1: "Requirement csv-export/R1 version 1 · signed in S1 · <file>:<line>: <title>: <body>", and "Signed    last signed: version 1 in S1 (only al\'s record ... holds this)"', (t) => {
  const dir = reqWorld(t);
  const r = context(dir, 'csv-export/R1');
  assert.equal(labelled(r, 'Requirement '),
    `Requirement csv-export/R1 version 1 · signed in S1 · ${MD}:${lineOf(dir, MD, '### R1 Monthly CSV')}: Monthly CSV: A user MUST be able to download one month as one CSV file.`, show(r));
  assert.equal(labelled(r, 'Signed    '), "Signed    last signed: version 1 in S1 (only al's record .assuredloop/records/requests/csv-export.yaml holds this)", show(r));
});

test('#58 al context csv-export/R1: "Served    by" names SP-1, its declared serves link; Open and Cited lines; Cited has src/export.js:1 as current', (t) => {
  const dir = reqWorld(t);
  const r = context(dir, 'csv-export/R1');
  const served = labelled(r, 'Served    ');
  assert.ok(served.startsWith('Served    by '), show(r));
  assert.match(served, word('SP-1'), show(r));
  labelled(r, 'Open      ');
  assert.ok(cited(r).current.includes('src/export.js:1'), show(r));
});

test('#58 al context csv-export/R2, never signed and not served: "not signed", "Signed    never signed", "Served    by no paragraph"', (t) => {
  const dir = reqWorld(t);
  const r = context(dir, 'csv-export/R2');
  const line = labelled(r, 'Requirement ');
  assert.ok(line.startsWith('Requirement csv-export/R2 version '), show(r));
  assert.ok(line.includes(` · not signed · ${MD}:${lineOf(dir, MD, '### R2 Yearly ZIP')}: Yearly ZIP: A user MUST be able to download one year as one ZIP file.`), show(r));
  assert.equal(labelled(r, 'Signed    '), 'Signed    never signed', show(r));
  assert.equal(labelled(r, 'Served    '), 'Served    by no paragraph', show(r));
});

test('#58 al context csv-export/R1 after its text changed: "version 2 · changed since S1", and "Signed    last signed: version 1 in S1 (only al\'s record ... holds this)"', (t) => {
  const dir = reqWorld(t);
  editFile(dir, MD, 'one CSV file.', 'one CSV file per month.');
  ok(dir, ['index']);
  const r = context(dir, 'csv-export/R1');
  assert.ok(labelled(r, 'Requirement ').startsWith(`Requirement csv-export/R1 version 2 · changed since S1 · ${MD}:`), show(r));
  assert.equal(labelled(r, 'Signed    '), "Signed    last signed: version 1 in S1 (only al's record .assuredloop/records/requests/csv-export.yaml holds this)", show(r));
});

test('#58 al context csv-export/R9, an unknown requirement: exit 2 and "al: csv-export/R9: no such ID"', (t) => {
  const dir = reqWorld(t);
  const r = refused(dir, ['context', 'csv-export/R9']);
  assert.match(r.stdout, /^al: csv-export\/R9: no such ID$/m, show(r));
});

test('#58 al context <ID> for a paragraph still answers as today (exit 0, the Paragraph line)', (t) => {
  const dir = reqWorld(t);
  const r = al(dir, ['context', 'INV-41']);
  assert.equal(r.code, 0, show(r));
  assert.match(r.stdout, /^Paragraph INV-41 /m, show(r));
});
