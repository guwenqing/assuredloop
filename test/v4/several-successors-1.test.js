// #1: a superseded ADR's status line that names several ADRs that supersede
// it (requests/several-successors, R1; the spec paragraph SCH-37, schema.md
// section 5).
//
// - The status line may name a list: `Status: superseded by ADR-2, ADR-3`,
//   `... ADR-2 and ADR-3`, and longer lists with a comma, the word `and`, or a
//   comma then `and` between the ADRs. Each listed ADR exists and its marker
//   has supersedes: for the superseded ADR; else not ok superseded-status,
//   one for each listed ADR that fails, naming it. Text after the list means
//   the line names no ADR.
// - superseded-cited: a current place that names the superseded ADR passes
//   when it names at least one listed successor, directly or through a chain.
//   Each listed successor, and the chain above it, is exempt.
//
// The messages are not pinned: the tests check severity, code, ID, and the
// ADR that the message names. Nothing here reads the code under test.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { check, keys } from './helpers/invoicer.js';
import { commitAll, doc, editFile, git, newRequest, project, show, write, writeConfig } from './helpers/project.js';

const notOk = (r) => r.findings.filter((f) => f.severity === 'not ok');
const notOkKeys = (r) => keys(notOk(r));
const coded = (r, code) => r.findings.filter((f) => f.code === code);
const onlyNotOk = (r, expected) => assert.deepEqual(notOkKeys(r), [...expected].sort(), show(r));

// Plain exit 0; --strict exit 1 exactly when a not ok prints; the same
// findings, with the same severities, in both modes.
function both(dir) {
  const plain = check(dir);
  const strict = check(dir, '--strict');
  assert.equal(plain.code, 0, show(plain));
  assert.deepEqual(keys(strict.findings), keys(plain.findings), `the same findings and severities in both modes:\n${show(plain)}\n${show(strict)}`);
  assert.equal(strict.code, notOk(strict).length ? 1 : 0, show(strict));
  return plain;
}

// =====================================================================
// The world.
//
// main: ADR-1 superseded by ADR-2, ADR-3. ADR-2 (supersedes:ADR-1) is itself
// superseded by ADR-4 (accepted, supersedes:ADR-2): a chain. ADR-3 (accepted,
// supersedes:ADR-1). ADR-5 accepted, outside the chain. The successors
// ADR-3 and ADR-4 name ADR-1 alone in their text (exempt). The spec INV-2 is
// governed by ADR-3 and ADR-4. The open request inv has a tasks.md.

const SPEC = 'specs/invoices.md';
const ADR1 = 'specs/adr/0001-paper.md';
const ADR2 = 'specs/adr/0002-pdf.md';
const ADR3 = 'specs/adr/0003-email.md';
const ADR4 = 'specs/adr/0004-portal.md';
const ADR5 = 'specs/adr/0005-numbers.md';
const ADR6 = 'specs/adr/0006-print-shop.md';
const NAME = 'inv';
const TASKS = `requests/${NAME}/tasks.md`;
const STATUS1 = 'Status: superseded by ADR-2, ADR-3\n';
const INV2_MARKER = '<!-- INV-2 rule governed-by:ADR-3,ADR-4 -->';
const INV3_TEXT = 'Invoices are sent by email.';
const ADR3_TEXT = 'Context: ADR-1 was slow.';
const ADR4_TEXT = 'Context: ADR-1 was paper; a PDF alone was not enough.';
const ADR5_TEXT = 'Context: numbers have no gaps.';
const adr = (status, marker, heading, text) => `Status: ${status}\n\n${doc([[marker, heading], [`${marker.split(' ')[0]}-1 rationale`, text]])}`;
const ADRS = {
  [ADR1]: adr('superseded by ADR-2, ADR-3', 'ADR-1 choice decides:INV-2', '# ADR-1: Paper invoices', 'Context: invoices were printed and posted.'),
  [ADR2]: adr('superseded by ADR-4', 'ADR-2 choice decides:INV-2 supersedes:ADR-1', '# ADR-2: PDF invoices', 'Context: ADR-1 cost too much postage.'),
  [ADR3]: adr('accepted', 'ADR-3 choice decides:INV-2 supersedes:ADR-1', '# ADR-3: Invoices by email', ADR3_TEXT),
  [ADR4]: adr('accepted', 'ADR-4 choice decides:INV-2 supersedes:ADR-2', '# ADR-4: Invoices on a portal', ADR4_TEXT),
  [ADR5]: adr('accepted', 'ADR-5 choice decides:INV-2', '# ADR-5: Sequential numbers', ADR5_TEXT),
};
// A third successor of ADR-1, for the longer lists.
const ADR6_TEXT = adr('accepted', 'ADR-6 choice decides:INV-2 supersedes:ADR-1', '# ADR-6: A print shop', 'Context: some customers still want paper.');

function world(t) {
  const dir = project(t);
  writeConfig(dir);
  write(dir, SPEC, doc([
    ['INV-1 note', '# Invoices'],
    ['INV-2 rule governed-by:ADR-3,ADR-4', 'An invoice MUST be sent by email or on the portal.'],
    ['INV-3 note', INV3_TEXT],
  ]));
  for (const [file, text] of Object.entries(ADRS)) write(dir, file, text);
  newRequest(dir, NAME, 'the owner says: send invoices by email.\n');
  write(dir, TASKS, '# Tasks\n\n- T1 Send invoices by email.\n');
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  return dir;
}

const setStatus = (dir, status) => editFile(dir, ADR1, STATUS1, `Status: ${status}\n`);
const setInv2 = (dir, marker) => editFile(dir, SPEC, INV2_MARKER, `<!-- ${marker} -->`);
const setInv3 = (dir, text) => editFile(dir, SPEC, INV3_TEXT, text);

const statusOf = (r) => notOk(r).filter((f) => f.code === 'superseded-status');
const cited = (r) => notOk(r).filter((f) => f.code === 'superseded-cited');
const noneNotOk = (r) => assert.deepEqual(notOk(r).map((f) => f.line), [], show(r));
// Exactly one not ok superseded-cited, at file, on id, naming adr; nothing else not ok.
function citedOnce(r, { file, id, adr: n }) {
  const found = cited(r);
  assert.equal(found.length, 1, `one not ok superseded-cited:\n${show(r)}`);
  const f = found[0];
  assert.equal(f.file, file, show(r));
  if (Array.isArray(id)) assert.ok(id.includes(f.id), `the id is one of ${id.join(', ')}:\n${show(r)}`);
  else assert.equal(f.id, id, show(r));
  assert.match(f.msg, new RegExp(`\\b${n}\\b`), `the message names ${n}:\n${show(r)}`);
  assert.deepEqual(notOk(r).filter((x) => x.code !== 'superseded-cited').map((x) => x.line), [], show(r));
  return f;
}
// The not ok superseded-status lines on ADR-1, one for each ADR in names, each
// message naming its own ADR; nothing else not ok.
function statusFor(r, names) {
  onlyNotOk(r, ['not ok superseded-status ADR-1']);
  const found = statusOf(r);
  assert.equal(found.length, names.length, `${names.length} not ok superseded-status:\n${show(r)}`);
  for (const n of names) {
    assert.equal(found.filter((f) => new RegExp(`\\b${n}\\b`).test(f.msg)).length, 1, `one message names ${n}:\n${show(r)}`);
  }
}

// =====================================================================
// The status line.

describe('several-successors/R1 (SCH-37): a status line that names several ADRs', () => {
  test('control: a one-ADR status line, "superseded by ADR-3": no not ok', (t) => {
    const dir = world(t);
    setStatus(dir, 'superseded by ADR-3');
    noneNotOk(both(dir));
  });

  test('the comma form, "superseded by ADR-2, ADR-3", both with supersedes:ADR-1: no not ok; --strict exits 0', (t) => {
    const dir = world(t);
    noneNotOk(both(dir));
    assert.equal(check(dir, '--strict').code, 0);
  });

  test('the and form, "superseded by ADR-2 and ADR-3": no not ok', (t) => {
    const dir = world(t);
    setStatus(dir, 'superseded by ADR-2 and ADR-3');
    noneNotOk(both(dir));
  });

  for (const list of ['ADR-2, ADR-3, ADR-6', 'ADR-2, ADR-3 and ADR-6', 'ADR-2, ADR-3, and ADR-6', 'ADR-2 and ADR-3 and ADR-6', 'ADR-2 ,\tADR-3  and\tADR-6']) {
    test(`a three-ADR list, ${JSON.stringify(`superseded by ${list}`)}, each with supersedes:ADR-1: no not ok`, (t) => {
      const dir = world(t);
      write(dir, ADR6, ADR6_TEXT);
      setStatus(dir, `superseded by ${list}`);
      noneNotOk(both(dir));
    });
  }

  test('a listed ADR that does not exist ("ADR-2, ADR-9"): one not ok superseded-status ADR-1, naming ADR-9', (t) => {
    const dir = world(t);
    setStatus(dir, 'superseded by ADR-2, ADR-9');
    statusFor(both(dir), ['ADR-9']);
    assert.equal(check(dir, '--strict').code, 1);
  });

  test('a listed ADR whose marker has no supersedes:ADR-1 ("ADR-2, ADR-5"): one not ok superseded-status ADR-1, naming ADR-5', (t) => {
    const dir = world(t);
    setStatus(dir, 'superseded by ADR-2, ADR-5');
    statusFor(both(dir), ['ADR-5']);
  });

  test('the bad ADR first in the list ("ADR-5 and ADR-3"): one not ok superseded-status ADR-1, naming ADR-5', (t) => {
    const dir = world(t);
    setStatus(dir, 'superseded by ADR-5 and ADR-3');
    statusFor(both(dir), ['ADR-5']);
  });

  test('ADR-3 loses supersedes:ADR-1 from its marker while ADR-1 lists it: one not ok superseded-status ADR-1, naming ADR-3', (t) => {
    const dir = world(t);
    editFile(dir, ADR3, 'decides:INV-2 supersedes:ADR-1 -->', 'decides:INV-2 -->');
    editFile(dir, ADR3, ADR3_TEXT, 'Context: email is fast.');
    statusFor(both(dir), ['ADR-3']);
  });

  test('two bad listed ADRs ("ADR-9, ADR-5"): two not ok superseded-status ADR-1, one naming ADR-9, one naming ADR-5', (t) => {
    const dir = world(t);
    setStatus(dir, 'superseded by ADR-9, ADR-5');
    statusFor(both(dir), ['ADR-9', 'ADR-5']);
  });

  test('two bad among three ("ADR-2, ADR-9 and ADR-5"): two not ok superseded-status ADR-1, naming ADR-9 and ADR-5', (t) => {
    const dir = world(t);
    setStatus(dir, 'superseded by ADR-2, ADR-9 and ADR-5');
    statusFor(both(dir), ['ADR-9', 'ADR-5']);
  });

  for (const status of ['superseded by ADR-2, ADR-3 for now', 'superseded by ADR-2 and ADR-3 (see the history)']) {
    test(`text after the list, ${JSON.stringify(`Status: ${status}`)}: one not ok superseded-status ADR-1, which says the line does not say by which ADR`, (t) => {
      const dir = world(t);
      setStatus(dir, status);
      const r = both(dir);
      onlyNotOk(r, ['not ok superseded-status ADR-1']);
      assert.equal(statusOf(r).length, 1, show(r));
      assert.match(statusOf(r)[0].msg, /by which ADR/, show(r));
    });
  }
});

// =====================================================================
// superseded-cited follows every listed successor.

describe('several-successors/R1 (SCH-37): a current place that names ADR-1 names at least one ADR that supersedes it', () => {
  test('a spec paragraph that names ADR-1 and only the second successor, ADR-3: no not ok', (t) => {
    const dir = world(t);
    setInv3(dir, 'Invoices were posted under ADR-1; now ADR-3 sends them by email.');
    noneNotOk(both(dir));
  });

  test('a spec paragraph that names ADR-1 and the successor\'s successor, ADR-4 (the chain through ADR-2): no not ok', (t) => {
    const dir = world(t);
    setInv3(dir, 'Invoices were posted under ADR-1; now ADR-4 puts them on the portal.');
    noneNotOk(both(dir));
  });

  test('a spec paragraph that names ADR-1 alone: not ok superseded-cited on INV-3, naming ADR-1', (t) => {
    const dir = world(t);
    setInv3(dir, 'Invoices were posted under ADR-1.');
    citedOnce(both(dir), { file: SPEC, id: 'INV-3', adr: 'ADR-1' });
  });

  test('a spec paragraph that names ADR-1 and ADR-5, which does not supersede it: not ok superseded-cited on INV-3, naming ADR-1', (t) => {
    const dir = world(t);
    setInv3(dir, 'Invoices were posted under ADR-1, with ADR-5 numbers.');
    citedOnce(both(dir), { file: SPEC, id: 'INV-3', adr: 'ADR-1' });
  });

  test('a spec paragraph that names ADR-1 and the first successor ADR-2 only: not ok, naming ADR-2, which ADR-4 supersedes', (t) => {
    const dir = world(t);
    setInv3(dir, 'ADR-1 gave way to ADR-2.');
    citedOnce(both(dir), { file: SPEC, id: 'INV-3', adr: 'ADR-2' });
  });

  test('an ADR that the status line names counts as a successor without supersedes: ("ADR-2, ADR-5"; a paragraph names ADR-1 and only ADR-5): superseded-status naming ADR-5, and no superseded-cited', (t) => {
    const dir = world(t);
    setStatus(dir, 'superseded by ADR-2, ADR-5');
    setInv3(dir, 'Invoices were posted under ADR-1; ADR-5 numbers them now.');
    const r = both(dir);
    assert.deepEqual(cited(r), [], show(r));
    statusFor(r, ['ADR-5']);
  });

  test('a marker link governed-by:ADR-1,ADR-3 (one listed successor): no not ok', (t) => {
    const dir = world(t);
    setInv2(dir, 'INV-2 rule governed-by:ADR-1,ADR-3');
    noneNotOk(both(dir));
  });

  test('a marker link governed-by:ADR-1,ADR-4 (a successor through the chain): no not ok', (t) => {
    const dir = world(t);
    setInv2(dir, 'INV-2 rule governed-by:ADR-1,ADR-4');
    noneNotOk(both(dir));
  });

  test('a marker link governed-by:ADR-1,ADR-5 (no successor): not ok superseded-cited on INV-2, naming ADR-1', (t) => {
    const dir = world(t);
    setInv2(dir, 'INV-2 rule governed-by:ADR-1,ADR-5');
    citedOnce(both(dir), { file: SPEC, id: 'INV-2', adr: 'ADR-1' });
  });

  test('an open request\'s tasks.md that names ADR-1 and ADR-3: no not ok (control: ADR-1 alone is not ok)', (t) => {
    const dir = world(t);
    write(dir, TASKS, '# Tasks\n\n- T1 Replace ADR-1 with ADR-3.\n');
    noneNotOk(both(dir));
    const control = world(t);
    write(control, TASKS, '# Tasks\n\n- T1 Replace ADR-1.\n');
    citedOnce(both(control), { file: TASKS, id: '-', adr: 'ADR-1' });
  });

  test('an accepted ADR outside the chain (ADR-5) that names ADR-1 and ADR-3: no not ok (control: ADR-1 alone is not ok, at the ADR file)', (t) => {
    const dir = world(t);
    editFile(dir, ADR5, ADR5_TEXT, 'Context: numbers have no gaps, as in ADR-1 and ADR-3.');
    noneNotOk(both(dir));
    const control = world(t);
    editFile(control, ADR5, ADR5_TEXT, 'Context: numbers have no gaps, as in ADR-1.');
    citedOnce(both(control), { file: ADR5, id: 'ADR-5-1', adr: 'ADR-1' });
  });
});

describe('several-successors/R1 (SCH-37): each listed successor, and the chain above it, is exempt', () => {
  test('the second listed successor ADR-3 and the chain ADR-4 each name ADR-1 alone (the base world): no not ok; control: the same text in ADR-5 is not ok', (t) => {
    // The base world has "Context: ADR-1 was slow." in ADR-3 and "Context: ADR-1 was paper; ..." in ADR-4.
    noneNotOk(both(world(t)));
    const dir = world(t);
    editFile(dir, ADR5, ADR5_TEXT, ADR3_TEXT);
    citedOnce(both(dir), { file: ADR5, id: 'ADR-5-1', adr: 'ADR-1' });
  });

  test('the first listed successor ADR-2, accepted, names ADR-1 alone: no not ok', (t) => {
    // ADR-2 accepted; ADR-4 no longer supersedes it, and no longer names ADR-1.
    const dir = world(t);
    editFile(dir, ADR2, 'Status: superseded by ADR-4\n', 'Status: accepted\n');
    editFile(dir, ADR4, 'decides:INV-2 supersedes:ADR-2 -->', 'decides:INV-2 -->');
    editFile(dir, ADR4, ADR4_TEXT, 'Context: customers want a portal.');
    noneNotOk(both(dir));
  });

  test('a third listed successor ADR-6 names ADR-1 alone: no not ok', (t) => {
    const dir = world(t);
    write(dir, ADR6, ADR6_TEXT.replace('Context: some customers still want paper.', 'Context: ADR-1 is back for some customers.'));
    setStatus(dir, 'superseded by ADR-2, ADR-3 and ADR-6');
    noneNotOk(both(dir));
  });
});

// =====================================================================
// A cycle: ADR-1 and ADR-2 each supersede the other. The chain up from ADR-1
// comes back to ADR-1, but ADR-1 is not its own successor: a place that names
// ADR-1 alone names no ADR that supersedes it (as al 1.0.0 gives).

describe('several-successors/R1 (SCH-37): a cycle of superseded ADRs', () => {
  function cycleWorld(t) {
    const dir = project(t);
    writeConfig(dir);
    write(dir, SPEC, doc([
      ['INV-1 note', '# Invoices'],
      ['INV-2 note', 'Invoices are sent by email.'],
    ]));
    write(dir, ADR1, adr('superseded by ADR-2', 'ADR-1 choice decides:INV-2 supersedes:ADR-2', '# ADR-1: Paper invoices', 'Context: invoices were printed and posted.'));
    write(dir, ADR2, adr('superseded by ADR-1', 'ADR-2 choice decides:INV-2 supersedes:ADR-1', '# ADR-2: PDF invoices', 'Context: postage cost too much.'));
    commitAll(dir, 'base');
    git(dir, 'checkout', '-q', '-b', 'feature');
    return dir;
  }

  const setInv2Text = (dir, text) => editFile(dir, SPEC, 'Invoices are sent by email.', text);

  test('ADR-1 and ADR-2 supersede each other; a spec paragraph names ADR-1 alone: not ok superseded-cited on INV-2, naming ADR-1; --strict exits 1', (t) => {
    const dir = cycleWorld(t);
    setInv2Text(dir, 'Invoices were posted under ADR-1.');
    const r = both(dir);
    const found = cited(r).filter((f) => f.file === SPEC && f.id === 'INV-2');
    assert.equal(found.length, 1, `one not ok superseded-cited on INV-2:\n${show(r)}`);
    assert.match(found[0].msg, /\bADR-1\b/, show(r));
    assert.equal(check(dir, '--strict').code, 1);
  });
});
