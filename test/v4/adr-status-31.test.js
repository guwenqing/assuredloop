// #31: a changed status line of an ADR, and the reverse check of a
// supersedes: link (the spec paragraphs SCH-22 and SCH-37, schema.md
// section 5).
//
// Part 1 (SCH-22). The check compares each ADR on the branch with the same
// ADR at the base. For an ADR that was accepted or superseded at the base:
// - A step forward gives no finding: accepted to superseded by one or more
//   ADRs, or a superseded-by list that only gains ADRs. Proposed to accepted
//   gives none too.
// - A change of form only (the same status and the same set of ADRs, in
//   another order, or with "," in place of "and") gives no adr-changed.
// - Any other change of the status line gives hint adr-changed on that ADR.
//   Its message names the old and the new status.
// - An unknown status line keeps its own hint, adr-status. A changed body
//   text still gives adr-changed.
//
// Part 2 (SCH-37). When ADR-m's heading marker has supersedes:ADR-n, and
// ADR-n is superseded but its status line does not name ADR-m, the check
// gives hint adr-supersede on ADR-m. Its message names ADR-m. This does not
// compare with the base. When ADR-n is still accepted, the hint fires as
// before.
//
// Nothing new blocks: no not ok, and --strict exits 0.
//
// The full messages are not pinned. Nothing here reads the code under test.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { check, keys } from './helpers/invoicer.js';
import { commitAll, doc, editFile, git, project, show, write, writeConfig } from './helpers/project.js';

const notOk = (r) => r.findings.filter((f) => f.severity === 'not ok');
const coded = (r, code, id) => r.findings.filter((f) => f.code === code && f.id === id);
const hintsOf = (r, code, id) => r.findings.filter((f) => f.severity === 'hint' && f.code === code && f.id === id);
const names = (msg, word) => new RegExp(`\\b${word}\\b`).test(msg);

// Plain exit 0; --strict exit 0 with no not ok; the same findings in both modes.
function both(dir) {
  const plain = check(dir);
  const strict = check(dir, '--strict');
  assert.equal(plain.code, 0, show(plain));
  assert.deepEqual(notOk(plain).map((f) => f.line), [], `no not ok:\n${show(plain)}`);
  assert.deepEqual(keys(strict.findings), keys(plain.findings), `the same findings in both modes:\n${show(plain)}\n${show(strict)}`);
  assert.equal(strict.code, 0, `--strict exits 0 when only hints print:\n${show(strict)}`);
  return plain;
}

// At least one hint with this code on id, and no not ok with it.
function hinted(r, code, id) {
  const found = hintsOf(r, code, id);
  assert.ok(found.length >= 1, `a "hint ${code}" line on ${id}:\n${show(r)}`);
  assert.deepEqual(coded(r, code, id).filter((f) => f.severity === 'not ok').map((f) => f.line), [], show(r));
  return found;
}
function none(r, code, id) {
  assert.deepEqual(coded(r, code, id).map((f) => f.line), [], `no ${code} on ${id}:\n${show(r)}`);
}
// One of the hints names each of the words in its message.
function messageNames(r, found, words) {
  assert.ok(found.some((f) => words.every((w) => names(f.msg, w))), `a message that names ${words.join(', ')}:\n${show(r)}`);
}

// =====================================================================
// The world.
//
// main: ADR-1 accepted. ADR-5 proposed. ADR-7 superseded by ADR-8 (accepted,
// supersedes:ADR-7). ADR-11 superseded by ADR-12, ADR-13 (each accepted,
// supersedes:ADR-11). The spec INV-2 is what they decide. No ADR text names
// another ADR. Then the branch feature, with no change yet.

const SPEC = 'specs/invoices.md';
const ADR1 = 'specs/adr/0001-pdf.md';
const ADR2 = 'specs/adr/0002-portal.md';
const ADR3 = 'specs/adr/0003-email.md';
const ADR5 = 'specs/adr/0005-stream.md';
const ADR7 = 'specs/adr/0007-paper.md';
const ADR8 = 'specs/adr/0008-fax.md';
const ADR9 = 'specs/adr/0009-print-shop.md';
const ADR11 = 'specs/adr/0011-numbers.md';
const ADR12 = 'specs/adr/0012-prefixes.md';
const ADR13 = 'specs/adr/0013-years.md';
const ADR1_TEXT = 'Context: customers want a file.';

const adr = (status, marker, heading, text) => `Status: ${status}\n\n${doc([[marker, heading], [`${marker.split(' ')[0]}-1 rationale`, text]])}`;
const BASE = {
  [ADR1]: adr('accepted', 'ADR-1 choice decides:INV-2', '# ADR-1: PDF invoices', ADR1_TEXT),
  [ADR5]: adr('proposed', 'ADR-5 choice decides:INV-2', '# ADR-5: Stream the export', 'Context: large exports.'),
  [ADR7]: adr('superseded by ADR-8', 'ADR-7 choice decides:INV-2', '# ADR-7: Paper invoices', 'Context: invoices were posted.'),
  [ADR8]: adr('accepted', 'ADR-8 choice decides:INV-2 supersedes:ADR-7', '# ADR-8: Fax invoices', 'Context: postage cost too much.'),
  [ADR11]: adr('superseded by ADR-12, ADR-13', 'ADR-11 choice decides:INV-2', '# ADR-11: Plain numbers', 'Context: numbers have no gaps.'),
  [ADR12]: adr('accepted', 'ADR-12 choice decides:INV-2 supersedes:ADR-11', '# ADR-12: Number prefixes', 'Context: each shop has a prefix.'),
  [ADR13]: adr('accepted', 'ADR-13 choice decides:INV-2 supersedes:ADR-11', '# ADR-13: Year in numbers', 'Context: numbers restart each year.'),
};
// New ADRs that a branch may add.
const NEW_ADR2 = adr('accepted', 'ADR-2 choice decides:INV-2 supersedes:ADR-1', '# ADR-2: Portal invoices', 'Context: customers log in.');
const NEW_ADR3 = adr('accepted', 'ADR-3 choice decides:INV-2 supersedes:ADR-1', '# ADR-3: Email invoices', 'Context: customers read email.');
const NEW_ADR9 = adr('accepted', 'ADR-9 choice decides:INV-2 supersedes:ADR-7', '# ADR-9: A print shop', 'Context: some customers want paper.');

function world(t, extra = {}) {
  const dir = project(t);
  writeConfig(dir);
  write(dir, SPEC, doc([
    ['INV-1 note', '# Invoices'],
    ['INV-2 rule', 'An invoice MUST be sent to the customer.'],
  ]));
  for (const [file, text] of Object.entries({ ...BASE, ...extra })) write(dir, file, text);
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  return dir;
}

// Sets the first line (the status line) of an ADR file.
const setStatus = (dir, file, from, to) => editFile(dir, file, `Status: ${from}\n`, `Status: ${to}\n`);

// =====================================================================

describe('#31: the base world', () => {
  test('control: the base world has no not ok, no adr-changed and no adr-supersede; plain and --strict exit 0', (t) => {
    const r = both(world(t));
    for (const id of ['ADR-1', 'ADR-5', 'ADR-7', 'ADR-8', 'ADR-11', 'ADR-12', 'ADR-13']) {
      none(r, 'adr-changed', id);
      none(r, 'adr-supersede', id);
    }
  });
});

describe('#31 part 1 (SCH-22): a step forward gives no finding', () => {
  test('control: accepted ADR-1 to "superseded by ADR-2", with a new ADR-2 that supersedes it: no adr-changed on ADR-1', (t) => {
    const dir = world(t);
    setStatus(dir, ADR1, 'accepted', 'superseded by ADR-2');
    write(dir, ADR2, NEW_ADR2);
    none(both(dir), 'adr-changed', 'ADR-1');
  });

  test('control: accepted ADR-1 to "superseded by ADR-2, ADR-3", with new ADR-2 and ADR-3: no adr-changed on ADR-1', (t) => {
    const dir = world(t);
    setStatus(dir, ADR1, 'accepted', 'superseded by ADR-2, ADR-3');
    write(dir, ADR2, NEW_ADR2);
    write(dir, ADR3, NEW_ADR3);
    none(both(dir), 'adr-changed', 'ADR-1');
  });

  test('control: "superseded by ADR-8" to "superseded by ADR-8, ADR-9" (the list only gains ADR-9): no adr-changed on ADR-7', (t) => {
    const dir = world(t);
    setStatus(dir, ADR7, 'superseded by ADR-8', 'superseded by ADR-8, ADR-9');
    write(dir, ADR9, NEW_ADR9);
    none(both(dir), 'adr-changed', 'ADR-7');
  });

  test('control: "superseded by ADR-8" to "superseded by ADR-8 and ADR-9": no adr-changed on ADR-7', (t) => {
    const dir = world(t);
    setStatus(dir, ADR7, 'superseded by ADR-8', 'superseded by ADR-8 and ADR-9');
    write(dir, ADR9, NEW_ADR9);
    none(both(dir), 'adr-changed', 'ADR-7');
  });

  test('control: proposed ADR-5 to accepted: no adr-changed on ADR-5', (t) => {
    const dir = world(t);
    setStatus(dir, ADR5, 'proposed', 'accepted');
    none(both(dir), 'adr-changed', 'ADR-5');
  });
});

describe('#31 part 1 (SCH-22): a change of form only gives no adr-changed', () => {
  for (const to of ['superseded by ADR-13, ADR-12', 'superseded by ADR-12 and ADR-13', 'superseded by ADR-13 and ADR-12']) {
    test(`control: "superseded by ADR-12, ADR-13" to "${to}": no adr-changed on ADR-11`, (t) => {
      const dir = world(t);
      setStatus(dir, ADR11, 'superseded by ADR-12, ADR-13', to);
      none(both(dir), 'adr-changed', 'ADR-11');
    });
  }
});

describe('#31 part 1 (SCH-22): any other change of the status line gives hint adr-changed', () => {
  test('accepted ADR-1 to proposed: hint adr-changed on ADR-1; the message names "accepted" and "proposed"', (t) => {
    const dir = world(t);
    setStatus(dir, ADR1, 'accepted', 'proposed');
    const r = both(dir);
    messageNames(r, hinted(r, 'adr-changed', 'ADR-1'), ['accepted', 'proposed']);
  });

  test('superseded ADR-7 to accepted: hint adr-changed on ADR-7; the message names "superseded" and "accepted"', (t) => {
    const dir = world(t);
    setStatus(dir, ADR7, 'superseded by ADR-8', 'accepted');
    const r = both(dir);
    messageNames(r, hinted(r, 'adr-changed', 'ADR-7'), ['superseded', 'accepted']);
  });

  test('superseded ADR-7 to proposed: hint adr-changed on ADR-7; the message names "superseded" and "proposed"', (t) => {
    const dir = world(t);
    setStatus(dir, ADR7, 'superseded by ADR-8', 'proposed');
    const r = both(dir);
    messageNames(r, hinted(r, 'adr-changed', 'ADR-7'), ['superseded', 'proposed']);
  });

  test('a superseded-by list that loses an ADR, "ADR-12, ADR-13" to "ADR-12": hint adr-changed on ADR-11; the message names ADR-12 and ADR-13', (t) => {
    const dir = world(t);
    setStatus(dir, ADR11, 'superseded by ADR-12, ADR-13', 'superseded by ADR-12');
    const r = both(dir);
    messageNames(r, hinted(r, 'adr-changed', 'ADR-11'), ['ADR-12', 'ADR-13']);
  });

  test('a list that names another ADR in place of one, "ADR-8" to "ADR-9": hint adr-changed on ADR-7; the message names ADR-8 and ADR-9', (t) => {
    const dir = world(t);
    setStatus(dir, ADR7, 'superseded by ADR-8', 'superseded by ADR-9');
    write(dir, ADR9, NEW_ADR9);
    const r = both(dir);
    messageNames(r, hinted(r, 'adr-changed', 'ADR-7'), ['ADR-8', 'ADR-9']);
  });

  test('the status line and the body text both change, accepted ADR-1 to proposed: at least one hint adr-changed on ADR-1', (t) => {
    const dir = world(t);
    setStatus(dir, ADR1, 'accepted', 'proposed');
    editFile(dir, ADR1, ADR1_TEXT, 'Context: customers want a file they can print.');
    hinted(both(dir), 'adr-changed', 'ADR-1');
  });

  test('control: an unknown status line, accepted ADR-1 to "Status: rejected": hint adr-status on ADR-1', (t) => {
    const dir = world(t);
    setStatus(dir, ADR1, 'accepted', 'rejected');
    hinted(both(dir), 'adr-status', 'ADR-1');
  });

  test('control: a changed body text with the status line unchanged: hint adr-changed on ADR-1', (t) => {
    const dir = world(t);
    editFile(dir, ADR1, ADR1_TEXT, 'Context: customers want a file they can print.');
    hinted(both(dir), 'adr-changed', 'ADR-1');
  });
});

describe('#31 part 2 (SCH-37): a supersedes: link that the status line does not name', () => {
  test('on the branch, not committed: a new ADR-9 with supersedes:ADR-7, and ADR-7 still "superseded by ADR-8": hint adr-supersede on ADR-9 that names ADR-9', (t) => {
    const dir = world(t);
    write(dir, ADR9, NEW_ADR9);
    const r = both(dir);
    messageNames(r, hinted(r, 'adr-supersede', 'ADR-9'), ['ADR-9']);
    none(r, 'adr-supersede', 'ADR-8');
  });

  test('in the tree, not only on a branch: ADR-9 with supersedes:ADR-7 is on main, and the branch changes nothing: hint adr-supersede on ADR-9 that names ADR-9', (t) => {
    const dir = world(t, { [ADR9]: NEW_ADR9 });
    const r = both(dir);
    messageNames(r, hinted(r, 'adr-supersede', 'ADR-9'), ['ADR-9']);
    none(r, 'adr-supersede', 'ADR-8');
  });

  test('on the branch, with ADR-9 committed: hint adr-supersede on ADR-9 that names ADR-9', (t) => {
    const dir = world(t);
    write(dir, ADR9, NEW_ADR9);
    commitAll(dir, 'add ADR-9');
    const r = both(dir);
    messageNames(r, hinted(r, 'adr-supersede', 'ADR-9'), ['ADR-9']);
  });

  test('control: ADR-1 is still accepted and a new ADR-2 has supersedes:ADR-1: hint adr-supersede on ADR-2', (t) => {
    const dir = world(t);
    write(dir, ADR2, NEW_ADR2);
    hinted(both(dir), 'adr-supersede', 'ADR-2');
  });

  test('control: ADR-7\'s line names both, "superseded by ADR-8, ADR-9": no adr-supersede on ADR-8 or ADR-9', (t) => {
    const dir = world(t);
    setStatus(dir, ADR7, 'superseded by ADR-8', 'superseded by ADR-8, ADR-9');
    write(dir, ADR9, NEW_ADR9);
    const r = both(dir);
    none(r, 'adr-supersede', 'ADR-8');
    none(r, 'adr-supersede', 'ADR-9');
  });

  test('control: ADR-11\'s line names ADR-12 and ADR-13: no adr-supersede on ADR-12 or ADR-13', (t) => {
    const r = both(world(t));
    none(r, 'adr-supersede', 'ADR-12');
    none(r, 'adr-supersede', 'ADR-13');
  });
});
