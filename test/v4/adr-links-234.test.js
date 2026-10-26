// #234 R1, trace links on ADRs: links added to an accepted ADR's heading
// marker, the finding adr-links for a proposed or accepted ADR with no source:
// or no decides:, and the review view's mark on an ADR with no source:.
// States of the invoicer world: cases adr-links-pre, adr-links,
// adr-links-nomarker, adr-governs-nosource-pre, adr-governs-nosource, and the
// existing clean, adr-governs and adr-history.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, invoicer } from './helpers/invoicer.js';
import { show } from './helpers/project.js';
import { lines, view } from './helpers/views.js';

const run = (t, name, arm, ...args) => check(invoicer(t, name, arm), ...args);
const all = (r, severity, code, id) => r.findings.filter((f) => f.severity === severity && f.code === code && f.id === id);
const coded = (r, code, id) => r.findings.filter((f) => f.code === code && (id === undefined || f.id === id));
const notOk = (r) => r.findings.filter((f) => f.severity === 'not ok');

const ADR1 = 'specs/adr/0001-gap-free-numbers.md';
const ADR2 = 'specs/adr/0002-csv-not-xlsx.md';
const ADR5 = 'specs/adr/0005-pdf-invoices.md';

// The one adr-links finding on id, with the given severity.
function links(r, severity, id) {
  const found = coded(r, 'adr-links', id);
  assert.equal(found.length, 1, `one adr-links line on ${id}:\n${show(r)}`);
  assert.equal(found[0].severity, severity, `adr-links on ${id} is ${severity}:\n${show(r)}`);
  return found[0];
}
// The message names what is missing, and only that.
function missing(r, f, { source, decides }) {
  assert.equal(f.msg.includes('no source:'), source, `"no source:" ${source ? 'in' : 'not in'} the message:\n${f.line}\n${show(r)}`);
  assert.equal(f.msg.includes('no decides:'), decides, `"no decides:" ${decides ? 'in' : 'not in'} the message:\n${f.line}\n${show(r)}`);
}
// #238 R1: a changed ADR is a hint, never not ok.
const changed = (r, id) => all(r, 'hint', 'adr-changed', id);
function isChanged(r, id) {
  assert.ok(changed(r, id).length >= 1, `a "hint adr-changed" line on ${id}:\n${show(r)}`);
  assert.deepEqual(all(r, 'not ok', 'adr-changed', id), [], `no "not ok adr-changed" line on ${id}:\n${show(r)}`);
}
function notChanged(r, id) {
  assert.deepEqual(coded(r, 'adr-changed', id), [], `no adr-changed on ${id}:\n${show(r)}`);
}

// --- 1. links added to an accepted ADR's heading marker

test('a source: link added after decides: on an accepted ADR: no adr-changed (control: a changed target fires)', (t) => {
  notChanged(run(t, 'adr-links', 'word'), 'ADR-2');
  isChanged(run(t, 'adr-links', 'retarget'), 'ADR-2');
});

test('a source: link added before decides: (the order of the tokens does not count): no adr-changed', (t) => {
  notChanged(run(t, 'adr-links', 'order'), 'ADR-2');
  isChanged(run(t, 'adr-links', 'retarget'), 'ADR-2');
});

test('a new target in an existing word (decides:EXP-2 -> decides:EXP-2,EXP-4): no adr-changed', (t) => {
  notChanged(run(t, 'adr-links', 'target'), 'ADR-2');
  isChanged(run(t, 'adr-links', 'retarget'), 'ADR-2');
});

test('the Status line changes to superseded and a link is added in the same range: no adr-changed', (t) => {
  notChanged(run(t, 'adr-links', 'status'), 'ADR-2');
  isChanged(run(t, 'adr-links', 'text'), 'ADR-2');
});

test('a link target removed from an accepted ADR (decides:EXP-4,EXP-6 -> decides:EXP-4): hint adr-changed on ADR-4', (t) => {
  isChanged(run(t, 'adr-links', 'removed'), 'ADR-4');
});

test('a link word replaced by another (source: removed, decides: added): hint adr-changed on ADR-1', (t) => {
  isChanged(run(t, 'adr-links', 'swapped'), 'ADR-1');
});

test('a link target changed (decides:EXP-2 -> decides:EXP-4): hint adr-changed on ADR-2', (t) => {
  isChanged(run(t, 'adr-links', 'retarget'), 'ADR-2');
});

test('the kind changed (choice -> rule) with a link added: hint adr-changed on ADR-2', (t) => {
  isChanged(run(t, 'adr-links', 'kind'), 'ADR-2');
});

test('a link added and one word of the decision text changed: hint adr-changed on ADR-2', (t) => {
  isChanged(run(t, 'adr-links', 'text'), 'ADR-2');
});

test('a link added to the marker of another paragraph (ADR-2-2): hint adr-changed on ADR-2', (t) => {
  isChanged(run(t, 'adr-links', 'para'), 'ADR-2');
});

test('a link added to an ADR that was superseded at the base: still hint adr-changed on ADR-3 (control: the same on an accepted ADR does not fire)', (t) => {
  isChanged(run(t, 'adr-links', 'frozen'), 'ADR-3');
  notChanged(run(t, 'adr-links', 'word'), 'ADR-2');
});

test('a proposed ADR gets a link and a changed text: no adr-changed (control: the same on an accepted ADR fires)', (t) => {
  notChanged(run(t, 'adr-links', 'proposed'), 'ADR-5');
  isChanged(run(t, 'adr-links', 'text'), 'ADR-2');
});

// --- 2. missing links: the finding adr-links

test('ADRs with missing links, a PR that changes no ADR: one hint adr-links on each proposed or accepted ADR, naming what is missing, at its marker line; exit 0', (t) => {
  const r = run(t, 'adr-links', 'untouched');
  assert.equal(r.code, 0, show(r));
  const one = links(r, 'hint', 'ADR-1');
  missing(r, one, { source: false, decides: true });
  assert.equal(one.file, ADR1, show(r));
  assert.equal(one.at, 3, show(r));
  const two = links(r, 'hint', 'ADR-2');
  missing(r, two, { source: true, decides: false });
  assert.equal(two.file, ADR2, show(r));
  assert.equal(two.at, 3, show(r));
  const five = links(r, 'hint', 'ADR-5');
  missing(r, five, { source: true, decides: true });
  assert.equal(five.file, ADR5, show(r));
  assert.equal(five.at, 3, show(r));
  assert.deepEqual(coded(r, 'adr-links', 'ADR-3'), [], `the superseded ADR-3 gets no adr-links:\n${show(r)}`);
  assert.deepEqual(coded(r, 'adr-links', 'ADR-4'), [], `ADR-4 has both links:\n${show(r)}`);
});

test('--strict: adr-links stays a hint and the exit is 0 (#238 R2; control: clean --strict exits 0 with no adr-links)', (t) => {
  const r = run(t, 'adr-links', 'untouched', '--strict');
  assert.equal(r.code, 0, show(r));
  for (const id of ['ADR-1', 'ADR-2', 'ADR-5']) links(r, 'hint', id);
  assert.deepEqual(notOk(r).map((f) => f.line), [], `nothing is not ok:\n${show(r)}`);
  assert.deepEqual(coded(r, 'adr-links', 'ADR-3'), [], show(r));
  const clean = run(t, 'clean', undefined, '--strict');
  assert.equal(clean.code, 0, show(clean));
  assert.deepEqual(coded(clean, 'adr-links'), [], show(clean));
});

test('the base world (every ADR has source: and decides:): no adr-links (control: the world with missing links fires)', (t) => {
  const clean = run(t, 'clean');
  assert.deepEqual(coded(clean, 'adr-links'), [], show(clean));
  links(run(t, 'adr-links', 'untouched'), 'hint', 'ADR-2');
});

test('an ADR that gets its missing source: link: no adr-links on it; ADR-1 still gets one', (t) => {
  const r = run(t, 'adr-links', 'word');
  assert.deepEqual(coded(r, 'adr-links', 'ADR-2'), [], show(r));
  missing(r, links(r, 'hint', 'ADR-1'), { source: false, decides: true });
});

test('an ADR with a missing link that becomes superseded in the working tree: no adr-links on it; ADR-1 still gets one', (t) => {
  const r = run(t, 'adr-links', 'superseded');
  assert.deepEqual(coded(r, 'adr-links', 'ADR-2'), [], show(r));
  links(r, 'hint', 'ADR-1');
});

test('a proposed ADR that gets source: but no decides: link: adr-links names only the decides: link', (t) => {
  const r = run(t, 'adr-links', 'proposed');
  missing(r, links(r, 'hint', 'ADR-5'), { source: false, decides: true });
});

test('an accepted ADR with no ADR-<n> marker at all: adr-links on it, at the file alone, naming both links', (t) => {
  const r = run(t, 'adr-links-nomarker');
  assert.equal(r.code, 0, show(r));
  const f = links(r, 'hint', 'ADR-5');
  assert.equal(f.file, 'specs/adr/0005-no-marker.md', show(r));
  assert.equal(f.at, null, `no line number:\n${show(r)}`);
  missing(r, f, { source: true, decides: true });
  const strict = run(t, 'adr-links-nomarker', undefined, '--strict');
  assert.equal(strict.code, 0, show(strict));
  links(strict, 'hint', 'ADR-5');
});

test('adr-history: the accepted ADR-6 has no decides: and gets adr-links; the superseded ADR-5 gets none', (t) => {
  const r = run(t, 'adr-history');
  missing(r, links(r, 'hint', 'ADR-6'), { source: false, decides: true });
  assert.deepEqual(coded(r, 'adr-links', 'ADR-5'), [], show(r));
});

// --- 3. al check --full marks an ADR with no source: (the review view before #78)

// #78 removed the review view; al check --full shows the governed line under
// each changed paragraph. al check names the missing source: by its
// adr-links hint (the next test), not by a mark on the adr-governs hint.
const review = (t, name, arm) => view(invoicer(t, name, arm), ['check', '--full']);
const GOVERNED = '  governed by ADR-4 (accepted)';
const GOVERNED_NO_SOURCE = '  governed by ADR-4 (accepted; no source:)';
// The map block: from its "map: " line to the Read line.
const mapBlock = (ls) => ls.slice(ls.findIndex((l) => l.startsWith('map: ')), ls.findIndex((l) => l.startsWith('Read ')));

test('check --full, ADR-4 with no source: the governed line says so', (t) => {
  const r = review(t, 'adr-governs-nosource');
  const ls = lines(r);
  assert.ok(ls.includes(GOVERNED_NO_SOURCE), `the line ${JSON.stringify(GOVERNED_NO_SOURCE)}:\n${show(r)}`);
  assert.ok(!ls.includes(GOVERNED), show(r));
});

test('check --full, ADR-4 with a source: link (adr-governs decided): the governed line exactly as before, no "no source:"', (t) => {
  const r = review(t, 'adr-governs', 'decided');
  const ls = lines(r);
  assert.ok(ls.includes(GOVERNED), `the line ${JSON.stringify(GOVERNED)}:\n${show(r)}`);
  assert.deepEqual(ls.filter((l) => l.includes('no source:')), [], show(r));
  const marked = review(t, 'adr-governs-nosource');
  assert.ok(lines(marked).includes(GOVERNED_NO_SOURCE), show(marked));
});

test('check --full: nothing else is added to the map; with the mark taken back from the governed line, the map equals the control map', (t) => {
  const marked = review(t, 'adr-governs-nosource');
  const plain = review(t, 'adr-governs', 'decided');
  const ls = mapBlock(lines(marked));
  assert.ok(ls.includes(GOVERNED_NO_SOURCE), show(marked));
  assert.deepEqual(ls.map((l) => (l === GOVERNED_NO_SOURCE ? GOVERNED : l)), mapBlock(lines(plain)), `${show(marked)}\n${show(plain)}`);
});

test("al check in the same world: its adr-governs line has no '; ADR-4 has no source:' ending, and ADR-4 gets adr-links (no source:)", (t) => {
  const r = run(t, 'adr-governs-nosource');
  const governs = all(r, 'hint', 'adr-governs', 'EXP-6');
  assert.equal(governs.length, 1, show(r));
  assert.equal(governs[0].msg, 'check that ADR-4 still holds · places: ADR-4 specs/adr/0004-one-time-tokens.md:5', show(r));
  missing(r, links(r, 'hint', 'ADR-4'), { source: true, decides: false });
});
