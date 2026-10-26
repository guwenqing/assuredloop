// #64 (C8): the evidence check of review judgements
// (requests/light-design/request.md R2, signed; spec LD-27, LD-44, LD-28,
// LD-29, LD-12; the own request of LD-24 and the output repos of LD-25 and
// LD-48). Written from the requirement and the public interface only:
//
// - The review writes its judgements in requests/<name>/review.md, beside
//   the change spec of each open request that is the change's own. One
//   judgement is one top-level Markdown list item:
//     - <ID> <verdict>: <reason in one sentence>
//       - Item: "<quote>"
//       - Code (<path>): "<quote>"          (`, base` after the path: the base)
//       - Code (<repo>:<path>): "<quote>"   (an output repo of the config)
//       - Test (<path>): "<quote>"
//       - Test: no test found               (or: Test: tests not examined)
//   Verdict: complies, violates, unclear or not applicable. A quote is the
//   text between the first and the last double quote. It matches word for
//   word, with each run of white space taken as one space.
// - `al index` keeps the identity of each judgement in al's own records:
//   in each repo, the base commit and a hash of the change from the base
//   (review notes and .assuredloop/ left out), and the item's version.
//   `al check` writes nothing.
// - `al check`, after the `list limits:` line, for each own request:
//     review note requests/<name>/review.md: none
//   or
//     review note requests/<name>/review.md: <N> judgements, <C> current, <S> stale, <K> not known when judged, <U> identity not kept, <R> not read
//     judgement <ID> version <v> <verdict> · requests/<name>/review.md:<line> · <results> · <identity>
//     judgement not read · requests/<name>/review.md:<line>: <its first words>
//   <v>: the first 12 hex of the item's text hash, v<n> for R<n>, or none.
//   <results>: `item quote found; item <state>` (or `item quote not found;
//   item <state>`, `item not found`, `no item quote; item <state>`), then
//   each Code/Test line in note order: `code quote found (<where>)`,
//   `code quote not found (<where>)`, `test quote found (<where>)`,
//   `test quote not found (<where>)`, `no test found`, `tests not examined`.
//   <state>: in force, proposed by this change, draft, replaced, not in force.
//   <identity>: current, `stale: judged at <7 hex>`, not known when judged,
//   or `identity not kept: run al index`.
// - All of it is a hint for the review: no exit code change, no new `not ok`
//   or `hint` line, and no change to a refusal of `al conclude`. al never
//   prints "complies" for a quote that it found.
//
// The item's text hash is read here from the per-doc record's text_sha256
// (written by `al index`). For an ADR the test only asks for 12 hex.
// No model and no network. Nothing here reads src/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  al, appendSection, baseProject, commitAll, doc, editFile, git, hashOf, index, newRequest, ok, organized, read, req,
  sha, show, write, writeConfig, writesNothing, INVOICES, ADR3,
} from './helpers/project.js';
import { conclude } from './helpers/views.js';
import { grouped, inForce, lineOf, out } from './helpers/list-58.js';

const SPEC = 'specs/invoices.md';
const NAME = 'csv-export';
const NOTE = `requests/${NAME}/review.md`;
const R1 = req('R1', 'Monthly CSV', 'A user MUST be able to download one month as one CSV file.');
const R2 = req('R2', 'Yearly ZIP', 'A user MUST be able to download one year as one ZIP file.');

// --- fixtures

const adr = (status, marker, heading) => `Status: ${status}\n\n${doc([[marker, heading]])}`;

// The base of baseProject, plus INV-50 (a rule whose text is wrapped on two
// lines) and what `extra` adds, indexed and committed on main. Then the
// branch feature, with the open request csv-export: R1 signed, and a change
// spec with SP-2 approach and SP-4 component; indexed and committed. HEAD is
// that commit.
function world(t, extra) {
  const dir = baseProject(t, { branch: null });
  write(dir, SPEC, `${INVOICES}\n${doc([['INV-50 rule', 'An invoice total MUST equal\nthe sum of its lines.']])}`);
  if (extra) extra(dir);
  index(dir);
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  ownRequest(dir);
  return dir;
}

function ownRequest(dir) {
  newRequest(dir, NAME);
  appendSection(dir, NAME, organized([R1]));
  ok(dir, ['record', NAME, 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
  write(dir, `requests/${NAME}/spec.md`, doc([
    ['SP-2 approach serves:R1', 'Build the month reader first.'],
    ['SP-4 component serves:R1', 'The month reader loads the invoices of a month.'],
  ]));
  index(dir);
  commitAll(dir, `${NAME}: the request`);
}

// The source of the change, at the head.
const EXPORT_JS = [
  'export const ttl = 30;',
  'export const message =',
  "  'link expired';",
  'const greet = "hi";',
  'export function check(link) {',
  '  if  (link.age > 30)   return message;',
  '}',
  '',
].join('\n');
const EXPORT_TEST = "import assert from 'node:assert/strict';\nassert.equal(ttl, 30);\n";

// src/export.js and its test, committed as one commit; returns that commit.
function sourceCommit(dir, message = `${NAME}: the export`) {
  write(dir, 'src/export.js', EXPORT_JS);
  write(dir, 'src/util.js', 'export const one = 1;\n');
  write(dir, 'test/export.test.js', EXPORT_TEST);
  return commitAll(dir, message);
}

// A judgement as the review writes it: the first line, then its evidence lines.
const judged = (first, ...evidence) => [`- ${first}`, ...evidence.map((e) => `  - ${e}`)].join('\n');
// The note: a heading, a free paragraph, and the judgements.
const note = (dir, ...items) => write(dir, NOTE, `# Review of ${NAME}\n\nFree text that al does not read.\n\n${items.join('\n')}\n`);

// The judgement on INV-41 used for the identity tests.
const J41 = 'INV-41 complies: the link expires 30 minutes after the email.';
const J41_ITEMS = [J41, 'Item: "MUST expire 30 minutes after the email is sent"', 'Code (src/export.js): "export const ttl = 30;"', 'Test: tests not examined'];

const short = (dir, rev = 'HEAD') => git(dir, 'rev-parse', rev).slice(0, 7);
const v12 = (dir, file, id) => hashOf(dir, file, id).slice(0, 12);
const at = (dir, first) => lineOf(dir, NOTE, `- ${first}`);

// Commits only the note and al's records.
function commitNoteAndRecords(dir, message = `${NAME}: the review note`) {
  git(dir, 'add', '-A', '--', NOTE, '.assuredloop');
  git(dir, 'commit', '-q', '-m', message);
  return git(dir, 'rev-parse', 'HEAD');
}

// --- reading the output

function check(dir, ...args) {
  const r = al(dir, ['check', ...args]);
  assert.equal(r.code, 0, show(r));
  return r;
}

const HEADER = (name) => `review note requests/${name}/review.md: `;
const header = ({ n, c = 0, s = 0, k = 0, u = 0, r = 0 }, name = NAME) =>
  `${HEADER(name)}${n} judgements, ${c} current, ${s} stale, ${k} not known when judged, ${u} identity not kept, ${r} not read`;

// The one header line of the note of <name>; it comes after the `list limits:` line.
function headerLine(r, name = NAME) {
  const ls = out(r);
  const found = ls.filter((l) => l.startsWith(HEADER(name)));
  assert.equal(found.length, 1, `one line "${HEADER(name)}...":\n${show(r)}`);
  const limits = ls.findIndex((l) => l.startsWith('list limits: '));
  assert.ok(limits >= 0, `a list limits line:\n${show(r)}`);
  assert.ok(ls.indexOf(found[0]) > limits, `the review section comes after the list limits line:\n${show(r)}`);
  return found[0];
}

const judgementLines = (r) => out(r).filter((l) => l.startsWith('judgement '));
const ID = (id) => `judgement ${id} version `;

// The one judgement line of <id> (a note with one judgement of <id>).
function judgement(r, id) {
  const found = judgementLines(r).filter((l) => l.startsWith(ID(id)));
  assert.equal(found.length, 1, `one line "${ID(id)}...":\n${show(r)}`);
  return found[0];
}

// The line that al must print for a judgement.
const line = ({ id, v, verdict, at: l, results, identity }) =>
  `judgement ${id} version ${v} ${verdict} · ${NOTE}:${l} · ${results.join(' · ')} · ${identity}`;

const has = (r, want) => assert.ok(out(r).includes(want), `the line\n${want}\n${show(r)}`);

// al never says "complies" itself: the word shows only as the verdict token
// of a judgement line, right after the version.
function noAlComplies(r) {
  for (const l of out(r).filter((x) => /complies/.test(x))) {
    const m = /^judgement \S+ version \S+ complies · (.*)$/.exec(l);
    assert.ok(m, `"complies" only as a verdict token:\n${l}\n${show(r)}`);
    assert.doesNotMatch(m[1], /complies/, `"complies" only as a verdict token:\n${l}\n${show(r)}`);
  }
}

const notOkLines = (r) => out(r).filter((l) => l.startsWith('not ok '));
const hintLines = (r) => out(r).filter((l) => l.startsWith('hint '));

// =====================================================================
// The identity of a judgement (LD-28)

test('#64 LD-28 sequence: judged at head A; commit B of the note and records stays current; commit C of a source file is stale at A; a renewed review, al index, commit D is current', (t) => {
  const dir = world(t);
  const a = sourceCommit(dir);
  note(dir, judged(...J41_ITEMS));
  index(dir);
  const want = (identity, first = J41) => line({
    id: 'INV-41', v: v12(dir, SPEC, 'INV-41'), verdict: 'complies', at: at(dir, first),
    results: ['item quote found; item in force', 'code quote found (src/export.js)', 'tests not examined'], identity,
  });

  let r = check(dir);
  assert.equal(headerLine(r), header({ n: 1, c: 1 }), show(r));
  has(r, want('current'));
  noAlComplies(r);

  commitNoteAndRecords(dir);
  r = check(dir);
  assert.equal(headerLine(r), header({ n: 1, c: 1 }), `B saves the note and the records only:\n${show(r)}`);
  has(r, want('current'));

  write(dir, 'src/util.js', 'export const one = 1;\nexport const two = 2;\n');
  commitAll(dir, `${NAME}: two`);
  r = check(dir);
  assert.equal(headerLine(r), header({ n: 1, s: 1 }), `C changes a file that no quote names:\n${show(r)}`);
  has(r, want(`stale: judged at ${a.slice(0, 7)}`));

  // al index again on the unchanged judgement keeps the old identity.
  index(dir);
  r = check(dir);
  has(r, want(`stale: judged at ${a.slice(0, 7)}`));

  // The renewed review rewrites the reason: a new judgement.
  const renewed = 'INV-41 complies: the ttl constant is 30 minutes.';
  editFile(dir, NOTE, `- ${J41}`, `- ${renewed}`);
  index(dir);
  r = check(dir);
  assert.equal(headerLine(r), header({ n: 1, c: 1 }), show(r));
  has(r, want('current', renewed));

  commitNoteAndRecords(dir, `${NAME}: the renewed review`);
  r = check(dir);
  assert.equal(headerLine(r), header({ n: 1, c: 1 }), `D saves the renewed note:\n${show(r)}`);
  has(r, want('current', renewed));
});

test('#64 LD-28: a note committed in B before al index ever ran; al index at a later commit with no other change: current', (t) => {
  const dir = world(t);
  write(dir, 'src/export.js', EXPORT_JS);
  note(dir, judged(...J41_ITEMS));
  commitAll(dir, `${NAME}: the export and the review`);
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'later');
  index(dir);
  const r = check(dir);
  assert.equal(headerLine(r), header({ n: 1, c: 1 }), show(r));
  assert.ok(judgement(r, 'INV-41').endsWith(' · current'), show(r));
});

test('#64 LD-28: a note committed in B, a source change committed after B, then al index: "stale: judged at <B>"', (t) => {
  const dir = world(t);
  write(dir, 'src/export.js', EXPORT_JS);
  note(dir, judged(...J41_ITEMS));
  const b = commitAll(dir, `${NAME}: the export and the review`);
  write(dir, 'src/util.js', 'export const one = 1;\n');
  commitAll(dir, `${NAME}: util`);
  index(dir);
  const r = check(dir);
  assert.equal(headerLine(r), header({ n: 1, s: 1 }), show(r));
  assert.ok(judgement(r, 'INV-41').endsWith(` · stale: judged at ${b.slice(0, 7)}`), show(r));
});

test('#64 LD-28: an item version change (the judged item edited, the quote still there) makes the judgement stale, and the version is the new one', (t) => {
  // Note: the edit of specs/invoices.md also changes the change itself, so
  // this test cannot tell the two causes apart.
  const dir = world(t);
  const a = sourceCommit(dir);
  note(dir, judged(...J41_ITEMS));
  index(dir);
  const before = v12(dir, SPEC, 'INV-41');
  assert.ok(judgement(check(dir), 'INV-41').endsWith(' · current'), 'control: current before the edit');
  editFile(dir, SPEC, 'after the email is sent.', 'after the email is sent, or at midnight.');
  index(dir);
  const after = v12(dir, SPEC, 'INV-41');
  assert.notEqual(after, before, 'fixture: the item text changed');
  const r = check(dir);
  assert.equal(judgement(r, 'INV-41'), line({
    id: 'INV-41', v: after, verdict: 'complies', at: at(dir, J41),
    results: ['item quote found; item in force', 'code quote found (src/export.js)', 'tests not examined'],
    identity: `stale: judged at ${a.slice(0, 7)}`,
  }), show(r));
});

test('#64 LD-28: a judgement with no al index run: "identity not kept: run al index", and the header counts it', (t) => {
  const dir = world(t);
  sourceCommit(dir);
  note(dir, judged(...J41_ITEMS));
  const r = check(dir);
  assert.equal(headerLine(r), header({ n: 1, u: 1 }), show(r));
  assert.equal(judgement(r, 'INV-41'), line({
    id: 'INV-41', v: v12(dir, SPEC, 'INV-41'), verdict: 'complies', at: at(dir, J41),
    results: ['item quote found; item in force', 'code quote found (src/export.js)', 'tests not examined'],
    identity: 'identity not kept: run al index',
  }), show(r));
});

// =====================================================================
// The quotes (LD-27, LD-28)

test('#64 quotes: found across a line wrap, extra spaces and inner double quotes; not found when absent, or when only the case or the punctuation differs; no item quote; Test quotes', (t) => {
  const dir = world(t);
  sourceCommit(dir);
  const before = check(dir);
  const j = {
    wrap: 'INV-41 complies: the message and the age guard follow the link rule.',
    item: 'INV-50 unclear: the total is not computed here.',
    miss: 'INV-13 violates: the export has no line check.',
    exact: 'INV-12 unclear: the fields are not named.',
    none: 'INV-41 not applicable: only the message is shown.',
  };
  note(dir,
    judged(j.wrap,
      'Item: "MUST expire 30 minutes after the email is sent"',
      "Code (src/export.js): \"export const message = 'link expired';\"",
      'Code (src/export.js): "if (link.age > 30) return message;"',
      'Code (src/export.js): "const greet = "hi";"',
      'Test (test/export.test.js): "assert.equal(ttl, 30);"'),
    judged(j.item, 'Item: "MUST equal the sum of its lines"', 'Test: no test found'),
    judged(j.miss,
      'Item: "MUST have at least two lines"',
      'Code (src/export.js): "export const ttl = 31;"',
      'Code (src/missing.js): "export const ttl = 30;"',
      'Test (test/export.test.js): "assert.equal(ttl, 31);"'),
    judged(j.exact,
      'Item: "an invoice has a number"',
      "Code (src/export.js): \"message = 'link expired',\"",
      'Code (src/export.js): "EXPORT const ttl = 30;"'),
    judged(j.none, 'Code (src/export.js): "return message;"', 'Test: tests not examined'));
  const r = check(dir);
  const u = 'identity not kept: run al index';
  assert.equal(headerLine(r), header({ n: 5, u: 5 }), show(r));
  assert.deepEqual(judgementLines(r), [
    line({ id: 'INV-41', v: v12(dir, SPEC, 'INV-41'), verdict: 'complies', at: at(dir, j.wrap), identity: u, results: [
      'item quote found; item in force', 'code quote found (src/export.js)', 'code quote found (src/export.js)',
      'code quote found (src/export.js)', 'test quote found (test/export.test.js)'] }),
    line({ id: 'INV-50', v: v12(dir, SPEC, 'INV-50'), verdict: 'unclear', at: at(dir, j.item), identity: u, results: [
      'item quote found; item in force', 'no test found'] }),
    line({ id: 'INV-13', v: v12(dir, SPEC, 'INV-13'), verdict: 'violates', at: at(dir, j.miss), identity: u, results: [
      'item quote not found; item in force', 'code quote not found (src/export.js)', 'code quote not found (src/missing.js)',
      'test quote not found (test/export.test.js)'] }),
    line({ id: 'INV-12', v: v12(dir, SPEC, 'INV-12'), verdict: 'unclear', at: at(dir, j.exact), identity: u, results: [
      'item quote not found; item in force', 'code quote not found (src/export.js)', 'code quote not found (src/export.js)'] }),
    line({ id: 'INV-41', v: v12(dir, SPEC, 'INV-41'), verdict: 'not applicable', at: at(dir, j.none), identity: u, results: [
      'no item quote; item in force', 'code quote found (src/export.js)', 'tests not examined'] }),
  ], show(r));
  noAlComplies(r);
  // Hints only: the not ok and hint lines are the same as with no note.
  assert.deepEqual(notOkLines(r), notOkLines(before), show(r));
  assert.deepEqual(hintLines(r), hintLines(before), show(r));
});

test('#64 an item that al cannot find: "item not found", version none', (t) => {
  const dir = world(t);
  sourceCommit(dir);
  const first = 'INV-99 unclear: no such rule is known.';
  note(dir, judged(first, 'Item: "MUST expire"', 'Test: tests not examined'));
  const r = check(dir);
  assert.equal(judgement(r, 'INV-99'), line({
    id: 'INV-99', v: 'none', verdict: 'unclear', at: at(dir, first),
    results: ['item not found', 'tests not examined'], identity: 'identity not kept: run al index',
  }), show(r));
});

test('#64 a removed guard quoted from the base: "code quote found (<path>, base)"; the same quote at the head is not found', (t) => {
  const dir = world(t, (d) => write(d, 'src/guard.js', 'export function send(link) {\n  if (!link.signed) refuse();\n  return link;\n}\n'));
  editFile(dir, 'src/guard.js', '  if (!link.signed) refuse();\n', '');
  commitAll(dir, `${NAME}: no guard`);
  const first = 'INV-41 violates: the guard was removed.';
  note(dir, judged(first,
    'Item: "MUST expire"',
    'Code (src/guard.js, base): "if (!link.signed) refuse();"',
    'Code (src/guard.js): "if (!link.signed) refuse();"',
    'Test: no test found'));
  const r = check(dir);
  assert.equal(judgement(r, 'INV-41'), line({
    id: 'INV-41', v: v12(dir, SPEC, 'INV-41'), verdict: 'violates', at: at(dir, first),
    results: ['item quote found; item in force', 'code quote found (src/guard.js, base)', 'code quote not found (src/guard.js)', 'no test found'],
    identity: 'identity not kept: run al index',
  }), show(r));
});

test('#64 LD-44 a judgement of absence: "Test: no test found" and no Code line gives no quote-not-found result', (t) => {
  const dir = world(t);
  sourceCommit(dir);
  const first = 'INV-13 violates: no code checks the line count.';
  note(dir, judged(first, 'Item: "at least one line"', 'Test: no test found'));
  const r = check(dir);
  const l = judgement(r, 'INV-13');
  assert.equal(l, line({
    id: 'INV-13', v: v12(dir, SPEC, 'INV-13'), verdict: 'violates', at: at(dir, first),
    results: ['item quote found; item in force', 'no test found'], identity: 'identity not kept: run al index',
  }), show(r));
  assert.doesNotMatch(l, /not found \(/, show(r));
});

// =====================================================================
// The item's state (LD-24, LD-42, LD-48)

test('#64 item states: approach is not in force, a superseded ADR is replaced, a proposed ADR and another open request are draft, an accepted ADR is in force; the quote is still checked', (t) => {
  const dir = world(t, (d) => {
    write(d, SPEC, `${read(d, SPEC)}\n${doc([['INV-20 approach', 'Build the reader first.']])}`);
    write(d, 'specs/adr/0005-pdf.md', adr('proposed', 'ADR-5 choice decides:INV-41', '# ADR-5: PDF files'));
    write(d, 'specs/adr/0006-xlsx.md', adr('superseded by ADR-7', 'ADR-6 choice decides:INV-12', '# ADR-6: XLSX files'));
    write(d, 'specs/adr/0007-csv.md', adr('accepted', 'ADR-7 choice supersedes:ADR-6 decides:INV-12', '# ADR-7: CSV files'));
    newRequest(d, 'pdf');
    appendSection(d, 'pdf', organized([R2]));
    write(d, 'requests/pdf/spec.md', doc([['SP-1 rule serves:R2', 'A year MUST be one ZIP file.']]));
  });
  sourceCommit(dir);
  const j = [
    ['INV-20', 'not applicable', 'INV-20 not applicable: the reader order is not code.', 'Build the reader first.', 'item quote found; item not in force'],
    ['ADR-6', 'violates', 'ADR-6 violates: the export writes CSV.', 'XLSX files', 'item quote found; item replaced'],
    ['ADR-6', 'unclear', 'ADR-6 unclear: the quote is wrong on purpose.', 'XLS files', 'item quote not found; item replaced'],
    ['ADR-5', 'unclear', 'ADR-5 unclear: no PDF yet.', 'PDF files', 'item quote found; item draft'],
    ['ADR-7', 'complies', 'ADR-7 complies: the export writes CSV.', 'CSV files', 'item quote found; item in force'],
    ['pdf/SP-1', 'unclear', 'pdf/SP-1 unclear: a year is not exported here.', 'A year MUST be one ZIP file.', 'item quote found; item draft'],
    ['pdf/R2', 'unclear', 'pdf/R2 unclear: a year is not exported here.', 'one year as one ZIP file', 'item quote found; item draft'],
  ];
  note(dir, ...j.map(([, , first, quote]) => judged(first, `Item: "${quote}"`, 'Test: tests not examined')));
  const r = check(dir);
  assert.equal(headerLine(r), header({ n: j.length, u: j.length }), show(r));
  const ls = judgementLines(r);
  assert.equal(ls.length, j.length, show(r));
  const versions = {
    'INV-20': v12(dir, SPEC, 'INV-20'), 'pdf/SP-1': v12(dir, 'requests/pdf/spec.md', 'SP-1'), 'pdf/R2': 'v1',
  };
  j.forEach(([id, verdict, first, , result], i) => {
    const head = `judgement ${id} version `;
    assert.ok(ls[i].startsWith(head), `line ${i + 1} is ${id}:\n${show(r)}`);
    const v = ls[i].slice(head.length).split(' ')[0];
    if (versions[id]) assert.equal(v, versions[id], `the version of ${id}:\n${show(r)}`);
    else assert.match(v, /^[0-9a-f]{12}$/, `the version of ${id}:\n${show(r)}`);
    assert.equal(ls[i], line({ id, v, verdict, at: at(dir, first), results: [result, 'tests not examined'], identity: 'identity not kept: run al index' }), show(r));
  });
  // Guard of the fixture: pdf is not this change's own request.
  assert.deepEqual(out(r).filter((l) => l.startsWith(HEADER('pdf'))), [], show(r));
});

test("#64 item states: the own request's signed R1 (version v1) and its change spec design paragraph are proposed by this change; its approach paragraph is not in force; an unsigned R2 is draft", (t) => {
  const dir = world(t);
  editFile(dir, `requests/${NAME}/request.md`, 'Signed off:', `${R2.block}\nSigned off:`);
  index(dir);
  sourceCommit(dir);
  const cs = `requests/${NAME}/spec.md`;
  const j = [
    ['R1', 'v1', 'R1 complies: one month is one file.', 'download one month as one CSV file', 'item quote found; item proposed by this change'],
    ['SP-4', v12(dir, cs, 'SP-4'), 'SP-4 complies: the reader loads one month.', 'loads the invoices of a month', 'item quote found; item proposed by this change'],
    ['SP-2', v12(dir, cs, 'SP-2'), 'SP-2 unclear: the order is not visible.', 'Build the month reader first.', 'item quote found; item not in force'],
    ['R2', 'v1', 'R2 unclear: a year is not exported here.', 'one year as one ZIP file', 'item quote found; item draft'],
  ];
  note(dir, ...j.map(([, , first, quote]) => judged(first, `Item: "${quote}"`, 'Test: tests not examined')));
  const r = check(dir);
  assert.deepEqual(judgementLines(r), j.map(([id, v, first, , result]) => line({
    id, v, verdict: first.split(' ')[1].replace(':', ''), at: at(dir, first), results: [result, 'tests not examined'],
    identity: 'identity not kept: run al index',
  })), show(r));
  noAlComplies(r);
});

// =====================================================================
// A second repo (LD-25, LD-48)

const WEB = 'invoicer-web';

function initRepo(dir) {
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.name', 'Fixture Author');
  git(dir, 'config', 'user.email', 'author@example.invalid');
  git(dir, 'config', 'commit.gpgsign', 'false');
}

// <root>/invoicer-web: main has src/stream.js; the branch feature (W1) adds
// a line, and its working tree has one more line that is not committed.
// <root>/invoicer: the central repo, with invoicer-web an output repo
// selected at W1; the branch feature with the own request csv-export.
function outputWorld(t, { webFiles = {} } = {}) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-64-outputs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const web = join(root, WEB);
  initRepo(web);
  write(web, '.assuredloop/config.yaml', 'repo: invoicer-web\ncentral: {path: ../invoicer}\n');
  write(web, 'src/stream.js', 'export const rows = 1;\n');
  commitAll(web, 'stream');
  git(web, 'checkout', '-q', '-b', 'feature');
  write(web, 'src/stream.js', 'export const rows = 1;\nexport const total = true;\n');
  for (const [path, text] of Object.entries(webFiles)) write(web, path, text);
  const w1 = commitAll(web, 'the total row');
  write(web, 'src/stream.js', 'export const rows = 1;\nexport const total = true;\nexport const draft = 1;\n');

  const dir = join(root, 'invoicer');
  initRepo(dir);
  const config = (commit) => writeConfig(dir, [{ file: SPEC, prefix: 'INV' }], { repo: 'invoicer', outputs: [{ name: WEB, path: `../${WEB}`, commit }] });
  config(w1);
  write(dir, SPEC, INVOICES);
  write(dir, 'specs/adr/0003-signed-links.md', ADR3);
  index(dir);
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  ownRequest(dir);
  return { dir, web, config };
}

test('#64 a second repo: "Code (invoicer-web:<path>)" is read at the selected commit (head and base); a new commit there, selected by the config, makes the judgement stale', (t) => {
  const { dir, web, config } = outputWorld(t);
  const first = 'INV-12 complies: the stream writes a total row.';
  note(dir, judged(first,
    'Item: "a total and a paid date"',
    `Code (${WEB}:src/stream.js): "export const total = true;"`,
    `Code (${WEB}:src/stream.js, base): "export const rows = 1;"`,
    `Code (${WEB}:src/stream.js): "export const draft = 1;"`,
    `Code (${WEB}:src/stream.js, base): "export const total = true;"`,
    'Test: tests not examined'));
  index(dir);
  const head = short(dir);
  const want = (identity) => line({
    id: 'INV-12', v: v12(dir, SPEC, 'INV-12'), verdict: 'complies', at: at(dir, first), identity, results: [
      'item quote found; item in force',
      `code quote found (${WEB}:src/stream.js)`, `code quote found (${WEB}:src/stream.js, base)`,
      `code quote not found (${WEB}:src/stream.js)`, `code quote not found (${WEB}:src/stream.js, base)`,
      'tests not examined'],
  });
  let r = check(dir);
  assert.equal(judgement(r, 'INV-12'), want('current'), show(r));

  // A new commit in the output repo, selected by the config (a file under
  // .assuredloop/, so the central change is the same).
  write(web, 'src/stream.js', 'export const rows = 1;\nexport const total = true;\nexport const draft = 1;\n');
  const w2 = commitAll(web, 'a draft row');
  config(w2);
  r = check(dir);
  assert.equal(headerLine(r), header({ n: 1, s: 1 }), show(r));
  const l = judgement(r, 'INV-12');
  assert.ok(l.endsWith(` · stale: judged at ${head}`), show(r));
  assert.ok(l.includes(`code quote found (${WEB}:src/stream.js) · `), show(r));
});

// =====================================================================
// What al does not read; no note

test('#64 a top-level item not in the judgement form is shown as "judgement not read" and counted; free text is not read', (t) => {
  const dir = world(t);
  sourceCommit(dir);
  write(dir, NOTE, [
    '# Review',
    '',
    'INV-13 violates: a paragraph, not a list item.',
    '',
    `- ${J41}`,
    '  - Item: "MUST expire"',
    '  - Test: tests not examined',
    '- a loose remark',
    '  - with a sub-item',
    '- INV-41 approves: a verdict word that is not known.',
    '',
  ].join('\n'));
  const r = check(dir);
  assert.equal(headerLine(r), header({ n: 1, u: 1, r: 2 }), show(r));
  const ls = judgementLines(r);
  assert.equal(ls.length, 3, show(r));
  assert.ok(ls[0].startsWith(ID('INV-41')), show(r));
  assert.ok(ls[1].startsWith(`judgement not read · ${NOTE}:${lineOf(dir, NOTE, '- a loose remark')}: a loose`), show(r));
  assert.ok(ls[2].startsWith(`judgement not read · ${NOTE}:${lineOf(dir, NOTE, '- INV-41 approves: a verdict word that is not known.')}: INV-41 approves`), show(r));
  assert.deepEqual(judgementLines(r).filter((l) => l.startsWith(ID('INV-13'))), [], `a paragraph is free text:\n${show(r)}`);
});

test('#64 an own request with no note: "review note requests/csv-export/review.md: none", and no judgement line', (t) => {
  const dir = world(t);
  sourceCommit(dir);
  const r = check(dir);
  assert.equal(headerLine(r), `${HEADER(NAME)}none`, show(r));
  assert.deepEqual(judgementLines(r), [], show(r));
});

// =====================================================================
// Advisory (LD-12, LD-28), writes nothing, the same output

test('#64 advisory: complies judgements on an unsigned requirement change keep the not ok, the --strict exit 1, the plain exit 0, the hints and the refusal of al conclude', (t) => {
  const dir = baseProject(t);
  newRequest(dir, 'late-fees');
  appendSection(dir, 'late-fees', organized([R1]));
  write(dir, 'requests/late-fees/spec.md', doc([['SP-1 rule serves:R1', 'An export MUST hold one month.']]));
  index(dir);
  commitAll(dir, 'late-fees: the request');

  const runs = () => ({ strict: al(dir, ['check', '--strict']), plain: al(dir, ['check']), concl: conclude(dir, 'late-fees') });
  const before = runs();
  assert.equal(before.strict.code, 1, `fixture: a not ok:\n${show(before.strict)}`);
  assert.ok(notOkLines(before.strict).some((l) => l.startsWith('not ok unsigned-requirement ')), show(before.strict));
  assert.equal(before.plain.code, 0, show(before.plain));
  assert.equal(before.concl.code, 1, `fixture: conclude refuses:\n${show(before.concl)}`);
  assert.ok(before.concl.refused.length >= 1, show(before.concl));

  const note64 = 'requests/late-fees/review.md';
  write(dir, note64, [
    '- R1 complies: the requirement is met.',
    '  - Item: "download one month as one CSV file"',
    '  - Test: tests not examined',
    '- SP-1 complies: an export holds one month.',
    '  - Item: "An export MUST hold one month."',
    '  - Test: no test found',
    '',
  ].join('\n'));
  for (const when of ['before al index', 'after al index']) {
    if (when === 'after al index') index(dir);
    const after = runs();
    const lines = judgementLines(after.plain);
    assert.equal(lines.length, 2, `${when}: the judgements are read:\n${show(after.plain)}`);
    assert.ok(lines[0].startsWith('judgement R1 version v1 complies · requests/late-fees/review.md:1 · '), show(after.plain));
    assert.equal(after.strict.code, 1, `${when}: --strict still exits 1:\n${show(after.strict)}`);
    assert.deepEqual(notOkLines(after.strict), notOkLines(before.strict), `${when}: the same not ok lines:\n${show(after.strict)}`);
    assert.deepEqual(hintLines(after.strict), hintLines(before.strict), `${when}: no new hint line:\n${show(after.strict)}`);
    assert.equal(after.plain.code, 0, show(after.plain));
    assert.deepEqual(notOkLines(after.plain), notOkLines(before.plain), show(after.plain));
    assert.equal(after.concl.code, 1, `${when}: conclude still refuses:\n${show(after.concl)}`);
    assert.equal(after.concl.wrote, false, show(after.concl));
    assert.deepEqual(after.concl.refused, before.concl.refused, `${when}: the same refusal:\n${show(after.concl)}`);
    noAlComplies(after.plain);
  }
});

test('#64 al check writes nothing, with a judgement whose identity is not kept and with one whose identity is kept', (t) => {
  const dir = world(t);
  sourceCommit(dir);
  note(dir, judged(...J41_ITEMS));
  let r = writesNothing(dir, ['check']);
  assert.ok(judgement(r, 'INV-41').endsWith(' · identity not kept: run al index'), show(r));
  r = writesNothing(dir, ['check']);
  assert.ok(judgement(r, 'INV-41').endsWith(' · identity not kept: run al index'), `check kept no identity:\n${show(r)}`);
  index(dir);
  r = writesNothing(dir, ['check']);
  assert.ok(judgement(r, 'INV-41').endsWith(' · current'), show(r));
});

test('#64 the same output twice for the same state', (t) => {
  const dir = world(t);
  sourceCommit(dir);
  note(dir,
    judged(...J41_ITEMS),
    judged('INV-13 violates: no code checks the line count.', 'Item: "at least one line"', 'Test: no test found'),
    '- a loose remark');
  index(dir);
  const one = check(dir);
  const two = check(dir);
  assert.equal(two.stdout, one.stdout, show(two));
  assert.equal(headerLine(one), header({ n: 2, c: 2, r: 1 }), show(one));
});

// =====================================================================
// A review note is no citation in the in-force list (the architect's
// decision on #64): an ID that only requests/*/review.md names is not
// shown as "cited (requests/<name>/review.md:...)"; it stays named in the
// grouped line, or on another basis that it has.

test('#64 the in-force list: an ID named only in review.md is not cited and stays in the grouped line; the same ID cited in a source file is cited from that file only', (t) => {
  const dir = world(t);
  sourceCommit(dir);
  note(dir,
    judged('INV-13 violates: no code checks the line count.', 'Item: "at least one line"', 'Test: no test found'),
    judged('ADR-3 unclear: the link is not signed here.', 'Item: "a link must not be guessed"', 'Test: tests not examined'));
  let r = check(dir);
  assert.deepEqual(out(r).filter((l) => l.startsWith('in force ') && l.includes('review.md')), [], `no in force line cites review.md:\n${show(r)}`);
  let g = grouped(r);
  for (const id of ['INV-13', 'ADR-3']) assert.ok(g.unknown.includes(id) || g.mismatch.includes(id), `${id} stays in the grouped line:\n${show(r)}`);

  // Control: INV-13 cited in a source file as well.
  write(dir, 'src/lines.js', '// INV-13: at least one line\n');
  commitAll(dir, `${NAME}: the line rule`);
  r = check(dir);
  assert.ok(inForce(r, 'INV-13').startsWith('in force INV-13 cited (src/lines.js:1) · '), `cited from src/lines.js only:\n${show(r)}`);
  assert.deepEqual(out(r).filter((l) => l.startsWith('in force ') && l.includes('review.md')), [], `no in force line cites review.md:\n${show(r)}`);
  g = grouped(r);
  assert.ok(g.unknown.includes('ADR-3') || g.mismatch.includes('ADR-3'), `ADR-3 stays in the grouped line:\n${show(r)}`);
});

// =====================================================================
// What the identity leaves out and takes in: every requests/*/review.md
// and .assuredloop/ are left out; untracked files that git does not
// ignore are part of the change.

test('#64 identity: the note is left out of the change: a second judgement and an edit of free text keep the first current; al index keeps both; another open request\'s note changing after al index keeps it current', (t) => {
  const dir = world(t, (d) => newRequest(d, 'pdf'));
  sourceCommit(dir);
  note(dir, judged(...J41_ITEMS));
  index(dir);
  let r = check(dir);
  assert.ok(judgement(r, 'INV-41').endsWith(' · current'), show(r));

  // A second judgement and new free text, with no al index.
  const second = 'INV-13 violates: no code checks the line count.';
  write(dir, NOTE, `# Review of ${NAME}, round 2\n\nOther free text.\n\n${judged(...J41_ITEMS)}\n${judged(second, 'Item: "at least one line"', 'Test: no test found')}\n`);
  r = check(dir);
  assert.equal(headerLine(r), header({ n: 2, c: 1, u: 1 }), show(r));
  assert.ok(judgement(r, 'INV-41').endsWith(' · current'), `the edit of the note leaves the first judgement current:\n${show(r)}`);
  assert.ok(judgement(r, 'INV-13').endsWith(' · identity not kept: run al index'), show(r));

  // A note of the other open request, then al index: both current.
  write(dir, 'requests/pdf/review.md', '# Review of pdf\n\nNothing judged yet.\n');
  index(dir);
  r = check(dir);
  assert.equal(headerLine(r), header({ n: 2, c: 2 }), show(r));

  // The other request's note changes after al index.
  write(dir, 'requests/pdf/review.md', '# Review of pdf\n\nStill nothing judged.\n\n- a loose remark\n');
  r = check(dir);
  assert.equal(headerLine(r), header({ n: 2, c: 2 }), `the note of pdf is left out too:\n${show(r)}`);
  assert.ok(judgement(r, 'INV-41').endsWith(' · current'), show(r));
});

test('#64 identity: a new untracked file that git does not ignore makes the judgement stale at the HEAD of al index', (t) => {
  const dir = world(t);
  sourceCommit(dir);
  note(dir, judged(...J41_ITEMS));
  index(dir);
  const head = short(dir);
  assert.ok(judgement(check(dir), 'INV-41').endsWith(' · current'), 'current after al index');
  write(dir, 'src/new.js', 'export const added = true;\n');
  const r = check(dir);
  assert.equal(headerLine(r), header({ n: 1, s: 1 }), show(r));
  assert.ok(judgement(r, 'INV-41').endsWith(` · stale: judged at ${head}`), show(r));
});

test('#64 identity, control: a new file that .gitignore ignores keeps the judgement current', (t) => {
  const dir = world(t);
  write(dir, '.gitignore', 'build/\n');
  commitAll(dir, `${NAME}: ignore build`);
  sourceCommit(dir);
  note(dir, judged(...J41_ITEMS));
  index(dir);
  write(dir, 'build/out.js', 'export const built = true;\n');
  const r = check(dir);
  assert.equal(headerLine(r), header({ n: 1, c: 1 }), show(r));
  assert.ok(judgement(r, 'INV-41').endsWith(' · current'), show(r));
});

// =====================================================================
// Five cases from the review of #64

test('#64 review 1: the identity keeps the requirement version: R1 edited and restored to its exact old text (v3) makes the judgement stale', (t) => {
  const dir = world(t);
  sourceCommit(dir);
  const first = 'R1 complies: one month is one file.';
  note(dir, judged(first, 'Item: "download one month as one CSV file"', 'Test: tests not examined'));
  index(dir);
  const head = short(dir);
  let r = check(dir);
  assert.ok(judgement(r, 'R1').startsWith('judgement R1 version v1 complies · '), show(r));
  assert.ok(judgement(r, 'R1').endsWith(' · current'), show(r));

  const md = `requests/${NAME}/request.md`;
  editFile(dir, md, 'as one CSV file.', 'as one CSV file per month.');
  index(dir);
  editFile(dir, md, 'as one CSV file per month.', 'as one CSV file.');
  index(dir);
  r = check(dir);
  const l = judgement(r, 'R1');
  assert.ok(l.startsWith('judgement R1 version v3 complies · '), `the version is v3:\n${show(r)}`);
  assert.ok(l.endsWith(` · stale: judged at ${head}`), `the same text at another version is stale:\n${show(r)}`);
});

test('#64 review 2: an output repo that cannot be read: "not known: invoicer-web cannot be read (<reason>)", counted as not known when judged', (t) => {
  const dir = world(t, (d) => writeConfig(d, [{ file: SPEC, prefix: 'INV' }], {
    repo: 'invoicer', outputs: [{ name: WEB, path: '../al-v4-64-no-such-clone' }],
  }));
  sourceCommit(dir);
  note(dir, judged(...J41_ITEMS));
  index(dir);
  const r = check(dir);
  assert.equal(headerLine(r), header({ n: 1, k: 1 }), show(r));
  const l = judgement(r, 'INV-41');
  assert.doesNotMatch(l, / · current$/, show(r));
  assert.match(l, / · not known: invoicer-web cannot be read \(.+\)$/, show(r));
});

const RFC_TEXT = 'The stream writer sends one row at a time.';

test('#64 review 3: an item of a named design document (LD-48) is proposed by this change, with the hash of its text as version', (t) => {
  const dir = world(t);
  sourceCommit(dir);
  write(dir, 'docs/rfc.md', doc([['RFC-1 component', RFC_TEXT]]));
  const md = `requests/${NAME}/request.md`;
  write(dir, md, `${read(dir, md).replace(/\n*$/, '\n')}\n## Design\n\nDesign: docs/rfc.md\n`);
  commitAll(dir, `${NAME}: the design`);
  const first = 'RFC-1 complies: the writer sends rows one by one.';
  note(dir, judged(first, 'Item: "sends one row at a time"', 'Test: tests not examined'));
  const r = check(dir);
  assert.equal(judgement(r, 'RFC-1'), line({
    id: 'RFC-1', v: sha(RFC_TEXT).slice(0, 12), verdict: 'complies', at: at(dir, first),
    results: ['item quote found; item proposed by this change', 'tests not examined'], identity: 'identity not kept: run al index',
  }), show(r));
});

test('#64 review 3: an item of a design document in an output repo, read at its selected commit, is proposed by this change', (t) => {
  const { dir } = outputWorld(t, { webFiles: { 'docs/rfc.md': doc([['WEB-1 component', RFC_TEXT]]) } });
  const md = `requests/${NAME}/request.md`;
  write(dir, md, `${read(dir, md).replace(/\n*$/, '\n')}\n## Design\n\nDesign: ${WEB}:docs/rfc.md\n`);
  commitAll(dir, `${NAME}: the design`);
  const first = 'WEB-1 complies: the writer sends rows one by one.';
  note(dir, judged(first, 'Item: "sends one row at a time"', 'Test: tests not examined'));
  const r = check(dir);
  assert.equal(judgement(r, 'WEB-1'), line({
    id: 'WEB-1', v: sha(RFC_TEXT).slice(0, 12), verdict: 'complies', at: at(dir, first),
    results: ['item quote found; item proposed by this change', 'tests not examined'], identity: 'identity not kept: run al index',
  }), show(r));
});

test('#64 review 4: an ordered item and an indented top-level item are judgements; "1) a loose remark" is not read; the usual sub-items stay sub-items', (t) => {
  const dir = world(t);
  sourceCommit(dir);
  const indented = '  - INV-13 violates: no code checks the line count.';
  const ordered = '1. INV-41 complies: the link expires 30 minutes after the email.';
  const loose = '1) a loose remark';
  write(dir, NOTE, [
    '# Review', '', 'Free text.', '',
    indented, '    - Item: "at least one line"', '    - Test: no test found', '',
    ordered, '   - Item: "MUST expire 30 minutes after the email is sent"', '   - Test: tests not examined', '',
    loose, '',
  ].join('\n'));
  let r = check(dir);
  assert.equal(headerLine(r), header({ n: 2, u: 2, r: 1 }), show(r));
  const u = 'identity not kept: run al index';
  const ls = judgementLines(r);
  assert.equal(ls.length, 3, show(r));
  assert.equal(ls[0], line({ id: 'INV-13', v: v12(dir, SPEC, 'INV-13'), verdict: 'violates', at: lineOf(dir, NOTE, indented),
    results: ['item quote found; item in force', 'no test found'], identity: u }), show(r));
  assert.equal(ls[1], line({ id: 'INV-41', v: v12(dir, SPEC, 'INV-41'), verdict: 'complies', at: lineOf(dir, NOTE, ordered),
    results: ['item quote found; item in force', 'tests not examined'], identity: u }), show(r));
  assert.match(ls[2], new RegExp(`^judgement not read · ${NOTE}:${lineOf(dir, NOTE, loose)}: (1\\) )?a loose`), show(r));

  // Control: "- X" with "  - Item:" reads Item as a sub-item of X.
  note(dir, judged(...J41_ITEMS));
  r = check(dir);
  assert.equal(headerLine(r), header({ n: 1, u: 1 }), show(r));
  assert.ok(judgement(r, 'INV-41').includes(' · item quote found; item in force · '), show(r));
});

test('#64 review 5a: a symlink committed with the note before any al index: al index then gives current', (t) => {
  const dir = world(t);
  write(dir, 'src/export.js', EXPORT_JS);
  symlinkSync('export.js', join(dir, 'src/link.js'));
  note(dir, judged(...J41_ITEMS));
  commitAll(dir, `${NAME}: the export, a link and the review`);
  index(dir);
  const r = check(dir);
  assert.equal(headerLine(r), header({ n: 1, c: 1 }), show(r));
  assert.ok(judgement(r, 'INV-41').endsWith(' · current'), show(r));
});

test('#64 review 5b: chmod +x of a file that the change changed, with no content change, makes the judgement stale', (t) => {
  const dir = world(t);
  if (git(dir, 'config', '--bool', 'core.fileMode') === 'false') {
    t.skip('core.fileMode is false in this repo');
    return;
  }
  sourceCommit(dir);
  note(dir, judged(...J41_ITEMS));
  index(dir);
  const head = short(dir);
  assert.ok(judgement(check(dir), 'INV-41').endsWith(' · current'), 'current after al index');
  chmodSync(join(dir, 'src/export.js'), 0o755);
  const r = check(dir);
  assert.equal(headerLine(r), header({ n: 1, s: 1 }), show(r));
  assert.ok(judgement(r, 'INV-41').endsWith(` · stale: judged at ${head}`), show(r));
});

test('#64 review 6: a requirement restored to its old text after its last al index shows a text hash as version and is stale; al index then gives v3, still stale', (t) => {
  const dir = world(t);
  sourceCommit(dir);
  const first = 'R1 complies: one month is one file.';
  note(dir, judged(first, 'Item: "download one month as one CSV file"', 'Test: tests not examined'));
  index(dir);
  const head = short(dir);
  let r = check(dir);
  assert.ok(judgement(r, 'R1').startsWith('judgement R1 version v1 complies · '), show(r));
  assert.ok(judgement(r, 'R1').endsWith(' · current'), show(r));

  const md = `requests/${NAME}/request.md`;
  editFile(dir, md, 'as one CSV file.', 'as one CSV file per month.');
  index(dir);
  // Text A again, with no al index: the latest recorded version (v2) is not the current text.
  editFile(dir, md, 'as one CSV file per month.', 'as one CSV file.');
  r = check(dir);
  let l = judgement(r, 'R1');
  const v = l.slice('judgement R1 version '.length).split(' ')[0];
  assert.notEqual(v, 'v1', `not v1:\n${show(r)}`);
  assert.match(v, /^[0-9a-f]{12}$/, `the first 12 hex of the text hash:\n${show(r)}`);
  assert.doesNotMatch(l, / · current$/, show(r));
  assert.ok(l.endsWith(` · stale: judged at ${head}`), show(r));

  index(dir);
  r = check(dir);
  l = judgement(r, 'R1');
  assert.ok(l.startsWith('judgement R1 version v3 complies · '), `v3 after al index:\n${show(r)}`);
  assert.ok(l.endsWith(` · stale: judged at ${head}`), show(r));
});
