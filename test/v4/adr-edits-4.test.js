// #4 R1 and R2: hints for the marker lines and the status lines of ADRs.
// R1 part a: the heading marker of an accepted ADR may change only by added
// links; any other change is hint adr-changed. R1 part b: a marker line that
// holds more than links is hint adr-marker, on any ADR, changed or not.
// R2: an ADR whose first line is not a known status is hint adr-status.
// Nothing here blocks: no new not ok, and --strict exits as before.
// States of the invoicer world: cases adr-edits (arms), adr-edits-pre,
// adr-edits-unchanged, and the existing clean, adr-accepted and adr-links.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, invoicer } from './helpers/invoicer.js';
import { show } from './helpers/project.js';

const run = (t, name, arm, ...args) => check(invoicer(t, name, arm), ...args);
const all = (r, severity, code, id) => r.findings.filter((f) => f.severity === severity && f.code === code && f.id === id);
const coded = (r, code, id) => r.findings.filter((f) => f.code === code && (id === undefined || f.id === id));
const notOk = (r) => r.findings.filter((f) => f.severity === 'not ok');

const ADR2 = 'specs/adr/0002-csv-not-xlsx.md';
const ADR3 = 'specs/adr/0003-signed-urls.md';
const ADR5 = 'specs/adr/0005-pdf-invoices.md';
const ADR6 = 'specs/adr/0006-iso-dates.md';
const ADR7 = 'specs/adr/0007-time-zones.md';
const ADR8 = 'specs/adr/0008-local-dates.md';

// At least one hint with this code on id, and no not ok with it.
function hinted(r, code, id) {
  const found = all(r, 'hint', code, id);
  assert.ok(found.length >= 1, `a "hint ${code}" line on ${id}:\n${show(r)}`);
  assert.deepEqual(all(r, 'not ok', code, id), [], `no "not ok ${code}" line on ${id}:\n${show(r)}`);
  return found;
}
function none(r, code, id) {
  assert.deepEqual(coded(r, code, id).map((f) => f.line), [], `no ${code} on ${id}:\n${show(r)}`);
}
// The hint is at file:line.
function at(r, found, file, line) {
  assert.ok(found.some((f) => f.file === file && f.at === line), `at ${file}:${line}:\n${show(r)}`);
}

// --- R1 part a: a changed heading marker of an accepted or superseded ADR

test("the issue's example: a token that hides text appended to ADR-2's heading marker, all links kept: hint adr-changed on ADR-2", (t) => {
  hinted(run(t, 'adr-edits', 'hidden'), 'adr-changed', 'ADR-2');
});

test('links added only (a new token in the middle, a new item in decides:): no adr-changed and no adr-marker on ADR-2', (t) => {
  const r = run(t, 'adr-edits', 'added');
  none(r, 'adr-changed', 'ADR-2');
  none(r, 'adr-marker', 'ADR-2');
});

const changedArms = {
  word: ['ADR-2', 'a word that is not a kind added'],
  kind2: ['ADR-2', 'a second kind added'],
  unknown: ['ADR-2', 'the token extra:x added'],
  reorder: ['ADR-2', 'the two link tokens swapped'],
  items: ['ADR-4', 'the items of decides:EXP-4,EXP-6 swapped'],
  kind: ['ADR-2', 'the kind changed, choice to rule'],
  removed: ['ADR-2', 'the source: link removed'],
  arrow: ['ADR-2', '"-->" and "<!--" put into the existing source: item'],
  addeditem: ['ADR-2', 'an added decides: item that holds "<!--" and "-->"'],
  addedtoken: ['ADR-2', 'an added for: token that holds "-->" and "<!--"'],
};
for (const [arm, [id, what]] of Object.entries(changedArms)) {
  test(`accepted ${id}, ${what} (arm ${arm}): hint adr-changed on ${id}`, (t) => {
    hinted(run(t, 'adr-edits', arm), 'adr-changed', id);
  });
}

test("the superseded ADR-3 gets the issue's example token: hint adr-changed and hint adr-marker on ADR-3", (t) => {
  const r = run(t, 'adr-edits', 'frozen');
  hinted(r, 'adr-changed', 'ADR-3');
  at(r, hinted(r, 'adr-marker', 'ADR-3'), ADR3, 3);
});

// --- R1 part b: a marker line that holds more than links

const markerArms = {
  hidden: "the issue's example token",
  word: 'a word that is not a kind',
  kind2: 'a second kind',
  unknown: 'the unknown link word extra:',
  arrow: 'a "-->" and a "<!--" in a link item',
  addeditem: 'a "<!--" and a "-->" in an added item',
  addedtoken: 'a "-->" and a "<!--" in an added token',
};
for (const [arm, what] of Object.entries(markerArms)) {
  test(`ADR-2's heading marker with ${what} (arm ${arm}): hint adr-marker on ADR-2 at its marker line`, (t) => {
    const r = run(t, 'adr-edits', arm);
    at(r, hinted(r, 'adr-marker', 'ADR-2'), ADR2, 3);
  });
}

for (const arm of ['added', 'reorder', 'kind', 'removed']) {
  test(`a marker that holds only a kind and links (arm ${arm}): no adr-marker on ADR-2`, (t) => {
    none(run(t, 'adr-edits', arm), 'adr-marker', 'ADR-2');
  });
}
test('the items of ADR-4 swapped (clean marker): no adr-marker on ADR-4', (t) => {
  none(run(t, 'adr-edits', 'items'), 'adr-marker', 'ADR-4');
});

test('the base world (every marker clean): no adr-marker at all', (t) => {
  none(run(t, 'clean'), 'adr-marker');
});

test('a PR that changes no ADR: a proposed ADR-5 with extra:x in its heading marker gets hint adr-marker at that line', (t) => {
  const r = run(t, 'adr-edits-unchanged');
  at(r, hinted(r, 'adr-marker', 'ADR-5'), ADR5, 3);
});

test('a PR that changes no ADR: an empty item in a list of links of an ADR-n-k marker gets hint adr-marker at that line', (t) => {
  const r = run(t, 'adr-edits-unchanged');
  at(r, hinted(r, 'adr-marker', 'ADR-6-1'), ADR6, 7); // source:invoice-exports/S1,
  at(r, hinted(r, 'adr-marker', 'ADR-6-2'), ADR6, 11); // decides:,EXP-3
  at(r, hinted(r, 'adr-marker', 'ADR-6-3'), ADR6, 15); // decides:EXP-2,,EXP-3
  at(r, hinted(r, 'adr-marker', 'ADR-6-4'), ADR6, 19); // source:
});

test('a PR that changes no ADR: an ADR-n-k marker with a second kind gets hint adr-marker on ADR-6-5', (t) => {
  const r = run(t, 'adr-edits-unchanged');
  at(r, hinted(r, 'adr-marker', 'ADR-6-5'), ADR6, 24);
});

test('a PR that changes no ADR: an ADR with an unknown status and "<!--" in its heading marker gets hint adr-marker on ADR-7', (t) => {
  const r = run(t, 'adr-edits-unchanged');
  at(r, hinted(r, 'adr-marker', 'ADR-7'), ADR7, 3);
});

test('a PR that changes no ADR: a superseded ADR with "-->" in its heading marker gets hint adr-marker on ADR-8', (t) => {
  const r = run(t, 'adr-edits-unchanged');
  at(r, hinted(r, 'adr-marker', 'ADR-8'), ADR8, 3);
});

test('a PR that changes no ADR: the clean markers get no adr-marker', (t) => {
  const r = run(t, 'adr-edits-unchanged');
  for (const id of ['ADR-5-1', 'ADR-6', 'ADR-6-6', 'ADR-7-1', 'ADR-8-1', 'ADR-1', 'ADR-1-1', 'ADR-2', 'ADR-2-2', 'ADR-3', 'ADR-4', 'ADR-4-3']) {
    none(r, 'adr-marker', id);
  }
});

// --- R2: an ADR without a known status line

const statusArms = {
  nostatus: 'the status line removed',
  draft: 'the status line changed to Status: draft',
  moved: 'the status line moved below the marker',
  blankfirst: 'a blank first line and Status: accepted on line 2',
  trailing: 'text after the status word, Status: accepted (2026-07-01)',
};
for (const [arm, what] of Object.entries(statusArms)) {
  test(`ADR-2 with ${what} (arm ${arm}): hint adr-status on ADR-2 at line 1`, (t) => {
    const r = run(t, 'adr-edits', arm);
    at(r, hinted(r, 'adr-status', 'ADR-2'), ADR2, 1);
  });
}

test('a bare "Status: superseded": hint adr-status on ADR-2, and not ok superseded-status stays', (t) => {
  const r = run(t, 'adr-accepted', 'status');
  at(r, hinted(r, 'adr-status', 'ADR-2'), ADR2, 1);
  assert.ok(all(r, 'not ok', 'superseded-status', 'ADR-2').length >= 1, show(r));
});

test('a PR that changes no ADR: ADR-7 with "Status: draft" on main gets hint adr-status at line 1', (t) => {
  const r = run(t, 'adr-edits-unchanged');
  at(r, hinted(r, 'adr-status', 'ADR-7'), ADR7, 1);
});

test('known status lines (proposed, accepted, superseded by ADR-<n>): no adr-status', (t) => {
  const unchanged = run(t, 'adr-edits-unchanged');
  for (const id of ['ADR-1', 'ADR-2', 'ADR-3', 'ADR-4', 'ADR-5', 'ADR-6', 'ADR-8']) none(unchanged, 'adr-status', id);
  none(run(t, 'clean'), 'adr-status');
  none(run(t, 'adr-links', 'untouched'), 'adr-status', 'ADR-5');
});

// --- nothing new blocks

for (const arm of [...new Set([...Object.keys(changedArms), ...Object.keys(markerArms), ...Object.keys(statusArms), 'frozen'])]) {
  test(`--strict, arm ${arm}: exit 0 and no not ok`, (t) => {
    const r = run(t, 'adr-edits', arm, '--strict');
    assert.equal(r.code, 0, show(r));
    assert.deepEqual(notOk(r).map((f) => f.line), [], show(r));
  });
}

test('--strict, a PR that changes no ADR: adr-marker and adr-status stay hints; exit 0 and no not ok', (t) => {
  const r = run(t, 'adr-edits-unchanged', undefined, '--strict');
  for (const id of ['ADR-5', 'ADR-6-1', 'ADR-6-2', 'ADR-6-3', 'ADR-6-4', 'ADR-6-5', 'ADR-7', 'ADR-8']) hinted(r, 'adr-marker', id);
  hinted(r, 'adr-status', 'ADR-7');
  assert.equal(r.code, 0, show(r));
  assert.deepEqual(notOk(r).map((f) => f.line), [], show(r));
});

test("--strict, the issue's example: adr-changed and adr-marker stay hints; exit 0", (t) => {
  const r = run(t, 'adr-edits', 'hidden', '--strict');
  hinted(r, 'adr-changed', 'ADR-2');
  hinted(r, 'adr-marker', 'ADR-2');
  assert.equal(r.code, 0, show(r));
});

test('--strict, a bare "Status: superseded": adr-status stays a hint; the only not ok lines are superseded-status and superseded-cited', (t) => {
  const r = run(t, 'adr-accepted', 'status', '--strict');
  hinted(r, 'adr-status', 'ADR-2');
  assert.deepEqual(notOk(r).filter((f) => !['superseded-status', 'superseded-cited'].includes(f.code)).map((f) => f.line), [], show(r));
});

// --- R1 part b: a line that starts like a marker but is not well formed
// (case adr-edits-malformed: a proposed ADR-5 with source: and decides:)

const malformedArms = {
  arrows: ['ADR-5-1', 7, 'a paragraph marker that ends "-->-->"'],
  open: ['ADR-5-1', 7, 'a paragraph marker that ends "--> <!--"'],
  tail: ['ADR-5', 3, 'text after the "-->" of the heading marker'],
  tight: ['ADR-5-1', 7, 'a paragraph marker with no spaces, "<!--ADR-5-1 rationale-->"'],
  indented: ['ADR-5-1', 7, 'spaces before the "<!--" of a paragraph marker'],
  prefix: ['INV-99', 11, 'a line "<!--INV-99 note-->" with another prefix'],
};
for (const [arm, [id, line, what]] of Object.entries(malformedArms)) {
  test(`malformed marker line, ${what} (arm ${arm}): hint adr-marker on ${id} at that line`, (t) => {
    const r = run(t, 'adr-edits-malformed', arm);
    at(r, hinted(r, 'adr-marker', id), ADR5, line);
  });
  test(`--strict, malformed marker line (arm ${arm}): adr-marker stays a hint; exit 0 and no not ok`, (t) => {
    const r = run(t, 'adr-edits-malformed', arm, '--strict');
    hinted(r, 'adr-marker', id);
    assert.equal(r.code, 0, show(r));
    assert.deepEqual(notOk(r).map((f) => f.line), [], show(r));
  });
}

test('well-formed markers, with or without spaces after "-->" (arms clean, spaces): no adr-marker', (t) => {
  none(run(t, 'adr-edits-malformed', 'clean'), 'adr-marker');
  none(run(t, 'adr-edits-malformed', 'spaces'), 'adr-marker');
});

test('a plain HTML comment and malformed markers inside fenced code (arm control): no adr-marker; --strict exits 0', (t) => {
  none(run(t, 'adr-edits-malformed', 'control'), 'adr-marker');
  const r = run(t, 'adr-edits-malformed', 'control', '--strict');
  assert.equal(r.code, 0, show(r));
  assert.deepEqual(notOk(r).map((f) => f.line), [], show(r));
});

// --- R2 with #1: a status line that names several successors
// (case adr-edits-successors: ADR-4, ADR-5 and ADR-6 each hold supersedes:ADR-3)

const listArms = {
  comma: 'Status: superseded by ADR-4, ADR-5',
  and: 'Status: superseded by ADR-4 and ADR-5',
  three: 'Status: superseded by ADR-4, ADR-5 and ADR-6',
};
for (const [arm, line] of Object.entries(listArms)) {
  test(`ADR-3 with "${line}" (arm ${arm}): no adr-status and no not ok; --strict exits 0`, (t) => {
    const r = run(t, 'adr-edits-successors', arm);
    none(r, 'adr-status');
    assert.deepEqual(notOk(r).map((f) => f.line), [], show(r));
    const strict = run(t, 'adr-edits-successors', arm, '--strict');
    assert.equal(strict.code, 0, show(strict));
    none(strict, 'adr-status');
  });
}

test('ADR-3 with "Status: superseded by ADR-4 or ADR-5" (arm or, not a known form): hint adr-status on ADR-3 at line 1', (t) => {
  const r = run(t, 'adr-edits-successors', 'or');
  at(r, hinted(r, 'adr-status', 'ADR-3'), ADR3, 1);
});
