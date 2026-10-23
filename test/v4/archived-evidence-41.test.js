// #41: the records of archived requests, and ADRs that decide a requirement,
// count as evidence.
//
// 1. al index reads the records of archived requests too (DES-26). A binding
//    that an archived request's record holds is held: no "not bound" line and
//    no "binding unknown" line for it, also when the holder names an open
//    request whose record does not hold that link. al binds no new link to an
//    archived request: a link to it that no record holds is still "not bound",
//    and the archived record gains no binding. The summary line says which
//    records it counted:
//    "Indexed <d> docs and <t> request records (<o> open and <a> archived); bound <b> new links".
// 2. The Outcome that al conclude writes (DES-72) lists, under a requirement,
//    each ADR whose heading marker's decides: names it, as
//    "  - ADR-<n>: decides it (<status>)". The line "  - no change paragraph
//    and no spec paragraph serves it" stays only where nothing serves the
//    requirement and no ADR decides it. The preview shows the same lines.
//
// No exit code changes: al index and al conclude --yes exit 0 here. Nothing
// here reads the code under test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stringify } from 'yaml';
import {
  al, appendSection, baseProject, bindingsOf, commitAll, doc, editFile, git, newRequest, ok, organized, read,
  record, req, show, write,
} from './helpers/project.js';

const NAME = 'inv';
const ADR8 = 'specs/adr/0008-csv-files.md';
const ADR9 = 'specs/adr/0009-zip-files.md';
const ADR10 = 'specs/adr/0010-month-names.md';
const SPEC = 'specs/invoices.md';
const NONE = '  - no change paragraph and no spec paragraph serves it';

const adr = (status, marker, heading) => `Status: ${status}\n\n${doc([[marker, heading]])}`;

// A request with signed requirements and the decision D1 that clarifies R1.
function signedRequest(dir, name, reqs) {
  newRequest(dir, name);
  appendSection(dir, name, organized(reqs));
  ok(dir, ['record', name, 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
  ok(dir, ['record', name, 'decision', '--source', 'owner', '--text', `The first choice for ${name}.`, '--clarifies', 'R1', '--yes']);
}

const REQS = [
  req('R1', 'Monthly CSV', 'A user MUST be able to download one month as one CSV file.'),
  req('R2', 'Yearly ZIP', 'A user MUST be able to download one year as one ZIP file.'),
  req('R3', 'Month names', 'A file name MUST hold the name of its month.'),
];

// The branch feature: the request inv with R1, R2, R3, signed, and D1. ADR-8
// (accepted) decides inv/R1 with source inv/D1; ADR-9 (proposed) decides
// inv/R2 with source inv/D1. Nothing serves or decides R3. Indexed (the
// links are bound in inv's record) and committed.
function linked(t) {
  const dir = baseProject(t);
  signedRequest(dir, NAME, REQS);
  write(dir, ADR8, adr('accepted', `ADR-8 choice decides:${NAME}/R1 source:${NAME}/D1`, '# ADR-8: CSV files'));
  write(dir, ADR9, adr('proposed', `ADR-9 choice decides:${NAME}/R2 source:${NAME}/D1`, '# ADR-9: ZIP files'));
  ok(dir, ['index']);
  commitAll(dir, 'the request inv and its ADRs');
  return dir;
}

// The links that the archived record of inv holds.
const HELD = [
  ['ADR-8', 'decides', `${NAME}/R1`],
  ['ADR-8', 'source', `${NAME}/D1`],
  ['ADR-9', 'decides', `${NAME}/R2`],
  ['ADR-9', 'source', `${NAME}/D1`],
];

// Merges the branch feature into main and starts the branch `next` from it,
// so the base of `next` has every link in its marker.
function toMain(dir, next = 'next') {
  git(dir, 'checkout', '-q', 'main');
  git(dir, 'merge', '-q', '--ff-only', 'feature');
  git(dir, 'checkout', '-q', '-b', next);
}

// linked, then al conclude inv --yes, committed. With base: merged to main,
// on the branch next.
function archived(t, { base = true } = {}) {
  const dir = linked(t);
  const r = al(dir, ['conclude', NAME, '--yes']);
  assert.equal(r.code, 0, show(r));
  commitAll(dir, 'conclude inv');
  if (base) toMain(dir);
  return dir;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
// A "not bound" or "binding unknown" line for [holder, link, target].
const reportLine = ([h, l, to]) => new RegExp(`^(not bound|binding unknown): ${esc(h)} ${esc(l)} ${esc(to)}(:|$)`, 'm');
const notBoundLine = ([h, l, to]) => new RegExp(`^not bound: ${esc(h)} ${esc(l)} ${esc(to)}: no request record holds it$`, 'm');

function notReported(r, links) {
  for (const b of links) assert.doesNotMatch(r.stdout, reportLine(b), `no "not bound" and no "binding unknown" line for ${b.join(' ')}:\n${show(r)}`);
}

// The summary line of al index.
const summary = (r) => r.stdout.split('\n').find((l) => l.startsWith('Indexed ')) ?? '';
function counted(r, { open, archived: arch, bound }) {
  const re = new RegExp(`^Indexed \\d+ docs and ${open + arch} request records \\(${open} open and ${arch} archived\\); bound ${bound} new links$`);
  assert.match(summary(r), re, `the summary line counts ${open} open and ${arch} archived records:\n${show(r)}`);
}

// The lines of the Outcome item of requirement id (its "- R<n> ..." line and
// the lines under it), from text whose Outcome lines start at column `indent`.
function itemOf(text, id, indent = 0) {
  const pad = ' '.repeat(indent);
  const ls = text.split('\n');
  const at = ls.findIndex((l) => l.startsWith(`${pad}- ${id} `));
  assert.ok(at >= 0, `an Outcome item for ${id}:\n${text}`);
  const out = [];
  for (let i = at + 1; i < ls.length && ls[i].startsWith(`${pad}  `); i += 1) out.push(ls[i].slice(indent));
  return out;
}
const outcomeOf = (dir) => {
  const md = read(dir, `requests/archive/${NAME}/request.md`);
  const at = md.indexOf('## Outcome');
  assert.ok(at >= 0, `request.md has an Outcome:\n${md}`);
  return md.slice(at);
};

// --- 1. a binding held in an archived record counts as held

test('al index after al conclude --yes: the ADR links that the archived record holds are neither "not bound" nor "binding unknown"; the record is unchanged; exit 0', (t) => {
  // On the closing branch (the links are new since its base), then on a
  // branch whose base has the links in the marker.
  for (const base of [false, true]) {
    const dir = archived(t, { base });
    const before = record(dir, NAME);
    assert.equal(before.status, 'concluded');
    for (const b of HELD) assert.equal(bindingsOf(before, ...b).length, 1, `the archived record holds ${b.join(' ')}:\n${stringify(before.bindings)}`);
    const r = al(dir, ['index']);
    assert.equal(r.code, 0, show(r));
    notReported(r, HELD);
    assert.deepEqual(record(dir, NAME).bindings, before.bindings, `al index leaves the archived record's bindings as they were:\n${show(r)}`);
    counted(r, { open: 0, archived: 1, bound: 0 });
  }
});

// --- 2. the Outcome shows an ADR that decides a requirement

test('the Outcome of al conclude --yes lists ADR-8 (accepted) under R1 and ADR-9 (proposed) under R2; only R3 says nothing serves it', (t) => {
  const outcome = outcomeOf(archived(t, { base: false }));
  const r1 = itemOf(outcome, 'R1');
  assert.ok(r1.includes('  - ADR-8: decides it (accepted)'), `R1: the line "  - ADR-8: decides it (accepted)":\n${outcome}`);
  assert.ok(!r1.includes(NONE), `R1: no "${NONE.trim()}" line:\n${outcome}`);
  const r2 = itemOf(outcome, 'R2');
  assert.ok(r2.includes('  - ADR-9: decides it (proposed)'), `R2: the line "  - ADR-9: decides it (proposed)":\n${outcome}`);
  assert.ok(!r2.includes(NONE), `R2: no "${NONE.trim()}" line:\n${outcome}`);
  const r3 = itemOf(outcome, 'R3');
  assert.ok(r3.includes(NONE), `R3, which nothing serves or decides: "${NONE.trim()}":\n${outcome}`);
  assert.ok(!r3.some((l) => /ADR-\d+: decides it/.test(l)), `R3: no ADR line:\n${outcome}`);
});

test('the preview (al conclude without --yes) shows the same ADR lines, indented', (t) => {
  const dir = linked(t);
  const r = al(dir, ['conclude', NAME]);
  assert.equal(r.code, 0, show(r));
  assert.match(r.stdout, new RegExp(`^Would conclude ${NAME}: `, 'm'), show(r));
  const r1 = itemOf(r.stdout, 'R1', 2);
  assert.ok(r1.includes('  - ADR-8: decides it (accepted)'), `R1 in the preview: "    - ADR-8: decides it (accepted)":\n${show(r)}`);
  assert.ok(!r1.includes(NONE), `R1 in the preview: no "${NONE.trim()}" line:\n${show(r)}`);
  assert.ok(itemOf(r.stdout, 'R2', 2).includes('  - ADR-9: decides it (proposed)'), show(r));
  assert.ok(itemOf(r.stdout, 'R3', 2).includes(NONE), show(r));
});

// --- 3. al binds no new link to an archived request (passes before the fix too)

test('a new ADR and a new spec paragraph that name the archived inv/R1: still "not bound: ... no request record holds it"; the archived record gains no binding; exit 0', (t) => {
  const dir = archived(t);
  const before = record(dir, NAME);
  write(dir, ADR10, adr('accepted', `ADR-10 choice decides:${NAME}/R1 source:${NAME}/D1`, '# ADR-10: Month names'));
  write(dir, SPEC, `${read(dir, SPEC)}\n${doc([[`INV-70 rule serves:${NAME}/R1`, 'An export MUST name its month.']])}`);
  const r = al(dir, ['index']);
  assert.equal(r.code, 0, show(r));
  for (const b of [['ADR-10', 'decides', `${NAME}/R1`], ['ADR-10', 'source', `${NAME}/D1`], ['INV-70', 'serves', `${NAME}/R1`]]) {
    assert.match(r.stdout, notBoundLine(b), `a "not bound" line for ${b.join(' ')}:\n${show(r)}`);
  }
  assert.deepEqual(record(dir, NAME).bindings, before.bindings, `the archived record gains no binding:\n${show(r)}`);
});

// --- 4. "binding unknown": the holder also names an open request

test('ADR-8 at the base names the archived inv; the branch adds source:other/D1 of the open request other: no "binding unknown" for the links inv\'s record holds', (t) => {
  const dir = archived(t);
  const inv = record(dir, NAME);
  signedRequest(dir, 'other', [req('R1', 'Credit notes', 'A user MUST be able to issue a credit note.')]);
  editFile(dir, ADR8, `source:${NAME}/D1`, `source:${NAME}/D1,other/D1`);
  const r = al(dir, ['index']);
  assert.equal(r.code, 0, show(r));
  notReported(r, HELD);
  const other = record(dir, 'other');
  assert.equal(bindingsOf(other, 'ADR-8', 'source', 'other/D1').length, 1, `the new link ADR-8 source other/D1 is bound in other's record:\n${stringify(other.bindings)}`);
  for (const b of HELD) assert.deepEqual(bindingsOf(other, ...b), [], `other's record gets no copy of ${b.join(' ')}:\n${stringify(other.bindings)}`);
  assert.deepEqual(record(dir, NAME).bindings, inv.bindings, `the archived record is unchanged:\n${show(r)}`);
});

// --- 5. the summary line counts open and archived records

test('the summary line: (3 open and 0 archived) before the archive, (2 open and 1 archived) after it', (t) => {
  const dir = baseProject(t);
  for (const name of [NAME, 'credit-notes', 'reminders']) newRequest(dir, name);
  const first = al(dir, ['index']);
  assert.equal(first.code, 0, show(first));
  counted(first, { open: 3, archived: 0, bound: 0 });
  commitAll(dir, 'three requests');
  const c = al(dir, ['conclude', NAME, '--yes']);
  assert.equal(c.code, 0, show(c));
  commitAll(dir, 'conclude inv');
  const r = al(dir, ['index']);
  assert.equal(r.code, 0, show(r));
  counted(r, { open: 2, archived: 1, bound: 0 });
});

// --- 6. the same for an open request's record (DES-26)

test('ADR-8 at the base is bound in the record of the open request inv; the branch adds source:other/D1 of the open request other: no "binding unknown" for the links inv\'s record holds', (t) => {
  const dir = linked(t);
  toMain(dir);
  const inv = record(dir, NAME);
  assert.equal(inv.status, 'open');
  for (const b of HELD) assert.equal(bindingsOf(inv, ...b).length, 1, `the open record of inv holds ${b.join(' ')}:\n${stringify(inv.bindings)}`);
  signedRequest(dir, 'other', [req('R1', 'Credit notes', 'A user MUST be able to issue a credit note.')]);
  editFile(dir, ADR8, `source:${NAME}/D1`, `source:${NAME}/D1,other/D1`);
  const r = al(dir, ['index']);
  assert.equal(r.code, 0, show(r));
  notReported(r, HELD);
  const other = record(dir, 'other');
  assert.equal(bindingsOf(other, 'ADR-8', 'source', 'other/D1').length, 1, `the new link ADR-8 source other/D1 is bound in other's record:\n${stringify(other.bindings)}`);
  for (const b of HELD) assert.deepEqual(bindingsOf(other, ...b), [], `other's record gets no copy of ${b.join(' ')}:\n${stringify(other.bindings)}`);
  const held = (rec) => (rec.bindings ?? []).filter((b) => HELD.some(([h, l, to]) => b.holder === h && b.link === l && b.target === to));
  assert.deepEqual(held(record(dir, NAME)), held(inv), `inv's record keeps its held bindings as they were:\n${show(r)}`);
});
