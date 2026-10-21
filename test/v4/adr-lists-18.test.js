// #18: ADRs named with a space, in a list, or in a range (requests/adr-lists,
// R1; the spec paragraph SCH-37, schema.md section 5).
//
// - A paragraph also names an ADR when it writes the number after "ADR" or
//   "ADRs" with a space: `ADR 0040` and `ADR 40` both name ADR-40.
// - A list joins numbers with commas, "and", or ", and": `ADRs 0003, 0005 and
//   0040` names each one. A list after "ADR" (singular) counts too.
// - A range names each number from the first to the last: `ADRs 0003 to 0005`
//   names ADR-4 too. A long range is checked against the ADRs that exist: it
//   finishes quickly.
// - A number without "ADR" or "ADRs" before it names nothing.
// - The rule on a citation of a superseded ADR applies to each ADR named in
//   these ways: not ok superseded-cited, as for `ADR-n`. A successor named in
//   a new form counts. Exempt places stay exempt. `ADR-n` works as before.
// - The architect's defaults (confirmed): a list or range that starts with an
//   `ADR-n` ID counts; items after "ADRs" may be written `ADR-n`; "or" and a
//   dash range do not join beyond the first number; a reversed range names
//   only its two ends; only "ADR"/"ADRs" in capitals.
//
// The messages are not pinned: the tests check severity, code, place, and the
// ADR that the message names (as its ID, `ADR-n`). Nothing here reads the
// code under test.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { check, keys } from './helpers/invoicer.js';
import { commitAll, doc, editFile, git, move, newRequest, project, read, show, write, writeConfig } from './helpers/project.js';

const notOk = (r) => r.findings.filter((f) => f.severity === 'not ok');

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
// main: ADR-1 superseded by ADR-2 (accepted, supersedes:ADR-1). ADR-3
// accepted. ADR-4 superseded by ADR-6 (accepted, supersedes:ADR-4). ADR-5
// proposed. ADR-40 superseded by ADR-41 (accepted, supersedes:ADR-40). The
// spec INV-3 is the paragraph under test. The open request inv has a
// tasks.md; its owner's words (in origin/) cite ADR 0040 and ADRs 0003 to
// 0005. Nothing in the base world breaks SCH-37.

const SPEC = 'specs/invoices.md';
const ADR1 = 'specs/adr/0001-paper.md';
const ADR2 = 'specs/adr/0002-pdf.md';
const ADR3 = 'specs/adr/0003-numbers.md';
const ADR4 = 'specs/adr/0004-fax.md';
const ADR5 = 'specs/adr/0005-stream.md';
const ADR6 = 'specs/adr/0006-no-fax.md';
const ADR40 = 'specs/adr/0040-paper-copies.md';
const ADR41 = 'specs/adr/0041-no-paper-copies.md';
const NAME = 'inv';
const TASKS = `requests/${NAME}/tasks.md`;
const REQUEST_MD = `requests/${NAME}/request.md`;
const INV3_TEXT = 'Invoices are sent by email.';
const ADR2_TEXT = 'Context: postage cost too much.';
const ADR3_TEXT = 'Context: numbers have no gaps.';
const ADR5_TEXT = 'Context: large exports.';
const ADR6_TEXT = 'Context: nobody has a fax line.';
const ADR41_TEXT = 'Context: customers print the PDF.';
const ADR1_TEXT = 'Context: invoices were printed and posted.';
// Names ADR-40 and ADR-4 (both superseded) in the new forms, and no successor.
const EXEMPT_TEXT = 'ADR 0040 is history, and so are ADRs 0003 to 0005.';

const adr = (status, marker, heading, text) => `Status: ${status}\n\n${doc([[marker, heading], [`${marker.split(' ')[0]}-1 rationale`, text]])}`;
const ADRS = {
  [ADR1]: adr('superseded by ADR-2', 'ADR-1 choice decides:INV-2', '# ADR-1: Paper invoices', ADR1_TEXT),
  [ADR2]: adr('accepted', 'ADR-2 choice decides:INV-2 supersedes:ADR-1', '# ADR-2: PDF invoices', ADR2_TEXT),
  [ADR3]: adr('accepted', 'ADR-3 choice decides:INV-2', '# ADR-3: Sequential numbers', ADR3_TEXT),
  [ADR4]: adr('superseded by ADR-6', 'ADR-4 choice decides:INV-2', '# ADR-4: Fax copies', 'Context: a fax was instant.'),
  [ADR5]: adr('proposed', 'ADR-5 choice decides:INV-2', '# ADR-5: Stream the export', ADR5_TEXT),
  [ADR6]: adr('accepted', 'ADR-6 choice decides:INV-2 supersedes:ADR-4', '# ADR-6: No fax copies', ADR6_TEXT),
  [ADR40]: adr('superseded by ADR-41', 'ADR-40 choice decides:INV-2', '# ADR-40: Paper copies', 'Context: some customers want paper.'),
  [ADR41]: adr('accepted', 'ADR-41 choice decides:INV-2 supersedes:ADR-40', '# ADR-41: No paper copies', ADR41_TEXT),
};

function world(t) {
  const dir = project(t);
  writeConfig(dir);
  write(dir, SPEC, doc([
    ['INV-1 note', '# Invoices'],
    ['INV-2 rule governed-by:ADR-2', 'An invoice MUST be sent as a PDF.'],
    ['INV-3 note', INV3_TEXT],
  ]));
  for (const [file, text] of Object.entries(ADRS)) write(dir, file, text);
  newRequest(dir, NAME, `the owner says: ${EXEMPT_TEXT}\n`);
  write(dir, TASKS, '# Tasks\n\n- T1 Send invoices as a PDF.\n');
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  return dir;
}

const setInv3 = (dir, text) => editFile(dir, SPEC, INV3_TEXT, text);

const SUPERSEDED = ['ADR-1', 'ADR-4', 'ADR-40'];
const cited = (r) => notOk(r).filter((f) => f.code === 'superseded-cited');
const names = (msg, n) => new RegExp(`\\b${n}\\b`).test(msg);
const noneNotOk = (r) => assert.deepEqual(notOk(r).map((f) => f.line), [], show(r));

// The not ok superseded-cited findings are all at file, on id (or one of the
// ids), and together they name exactly the superseded ADRs in adrs; nothing
// else is not ok. One finding for each ADR, or one finding that names them
// all: either passes.
function citedAt(r, { file, id, adrs }) {
  const found = cited(r);
  assert.ok(found.length >= 1, `a not ok superseded-cited:\n${show(r)}`);
  for (const f of found) {
    assert.equal(f.file, file, show(r));
    if (Array.isArray(id)) assert.ok(id.includes(f.id), `the id is one of ${id.join(', ')}:\n${show(r)}`);
    else assert.equal(f.id, id, show(r));
  }
  const named = SUPERSEDED.filter((n) => found.some((f) => names(f.msg, n)));
  assert.deepEqual(named, [...adrs].sort((a, b) => SUPERSEDED.indexOf(a) - SUPERSEDED.indexOf(b)), `the messages name ${adrs.join(', ')}:\n${show(r)}`);
  assert.deepEqual(notOk(r).filter((x) => x.code !== 'superseded-cited').map((x) => x.line), [], show(r));
}
const citedInv3 = (r, adrs) => citedAt(r, { file: SPEC, id: 'INV-3', adrs });

// =====================================================================

describe('adr-lists/R1 (SCH-37): the base world', () => {
  test('control: the base world (the chains, the origin words) has no not ok; plain and --strict exit 0', (t) => {
    const dir = world(t);
    assert.match(read(dir, REQUEST_MD), /origin\//, 'the request has an origin snapshot');
    noneNotOk(both(dir));
    assert.equal(check(dir, '--strict').code, 0);
  });
});

describe('adr-lists/R1 (SCH-37): "ADR" and a space before the number', () => {
  test('a spec paragraph that cites "ADR 0040" alone: not ok superseded-cited on INV-3, naming ADR-40; --strict exits 1', (t) => {
    const dir = world(t);
    setInv3(dir, 'Paper copies follow ADR 0040.');
    citedInv3(both(dir), ['ADR-40']);
    assert.equal(check(dir, '--strict').code, 1);
  });

  test('"ADR 40" (no leading zeros) names ADR-40 too: not ok on INV-3, naming ADR-40', (t) => {
    const dir = world(t);
    setInv3(dir, 'Paper copies follow ADR 40.');
    citedInv3(both(dir), ['ADR-40']);
  });

  test('"ADR 0004" names ADR-4, not ADR-40: not ok on INV-3, naming ADR-4 only', (t) => {
    const dir = world(t);
    setInv3(dir, 'Fax copies follow ADR 0004.');
    citedInv3(both(dir), ['ADR-4']);
  });

  test('"ADR 0040" with the successor written "ADR 0041": no not ok', (t) => {
    const dir = world(t);
    setInv3(dir, 'Paper copies followed ADR 0040; now ADR 0041 holds.');
    noneNotOk(both(dir));
  });

  test('"ADR-40" with the successor written "ADR 41" (a successor named in the new form counts): no not ok', (t) => {
    const dir = world(t);
    setInv3(dir, 'Paper copies followed ADR-40; now ADR 41 holds.');
    noneNotOk(both(dir));
  });

  test('"ADR 0040" with the successor written "ADR-41": no not ok', (t) => {
    const dir = world(t);
    setInv3(dir, 'Paper copies followed ADR 0040; now ADR-41 holds.');
    noneNotOk(both(dir));
  });

  test('"ADR 0040" with ADR-3, which does not supersede it: not ok on INV-3, naming ADR-40', (t) => {
    const dir = world(t);
    setInv3(dir, 'Paper copies follow ADR 0040, with ADR 0003 numbers.');
    citedInv3(both(dir), ['ADR-40']);
  });
});

describe('adr-lists/R1 (SCH-37): a list after "ADRs" or "ADR"', () => {
  test('"ADRs 0003, 0005 and 0040": not ok on INV-3, naming ADR-40', (t) => {
    const dir = world(t);
    setInv3(dir, 'See ADRs 0003, 0005 and 0040.');
    citedInv3(both(dir), ['ADR-40']);
  });

  for (const list of ['ADRs 0003, 0040', 'ADRs 0003 and 0040', 'ADRs 0003, 0005, and 0040', 'ADRs 0003 and 0005 and 0040', 'ADRs 3, 5 and 40']) {
    test(`the list ${JSON.stringify(list)} names its last item, ADR-40: not ok on INV-3, naming ADR-40`, (t) => {
      const dir = world(t);
      setInv3(dir, `See ${list}.`);
      citedInv3(both(dir), ['ADR-40']);
    });
  }

  test('each item of a list is named: "ADRs 0001, 0003 and 0040": not ok on INV-3, naming ADR-1 and ADR-40', (t) => {
    const dir = world(t);
    setInv3(dir, 'See ADRs 0001, 0003 and 0040.');
    citedInv3(both(dir), ['ADR-1', 'ADR-40']);
  });

  test('a list after "ADR" (singular), "ADR 0003 and 0040": not ok on INV-3, naming ADR-40', (t) => {
    const dir = world(t);
    setInv3(dir, 'See ADR 0003 and 0040.');
    citedInv3(both(dir), ['ADR-40']);
  });

  test('"ADRs 0001 and 0002" (the successor ADR-2 in the same list): no not ok', (t) => {
    const dir = world(t);
    setInv3(dir, 'See ADRs 0001 and 0002.');
    noneNotOk(both(dir));
  });

  test('"ADR-1", with the successor in a list "ADRs 0003 and 0002": no not ok', (t) => {
    const dir = world(t);
    setInv3(dir, 'ADR-1 is gone; see ADRs 0003 and 0002.');
    noneNotOk(both(dir));
  });
});

describe('adr-lists/R1 (SCH-37): a range after "ADRs" or "ADR"', () => {
  test('"ADRs 0003 to 0005" names ADR-4 in its middle: not ok on INV-3, naming ADR-4', (t) => {
    const dir = world(t);
    setInv3(dir, 'See ADRs 0003 to 0005.');
    citedInv3(both(dir), ['ADR-4']);
  });

  test('"ADRs 3 to 5" (no leading zeros): not ok on INV-3, naming ADR-4', (t) => {
    const dir = world(t);
    setInv3(dir, 'See ADRs 3 to 5.');
    citedInv3(both(dir), ['ADR-4']);
  });

  test('a range whose last number is superseded, "ADRs 0003 to 0004": not ok on INV-3, naming ADR-4', (t) => {
    const dir = world(t);
    setInv3(dir, 'See ADRs 0003 to 0004.');
    citedInv3(both(dir), ['ADR-4']);
  });

  test('a range after "ADR" (singular), "ADR 0003 to 0005": not ok on INV-3, naming ADR-4', (t) => {
    const dir = world(t);
    setInv3(dir, 'See ADR 0003 to 0005.');
    citedInv3(both(dir), ['ADR-4']);
  });

  test('a range that covers the successor, "ADRs 0004 to 0006": no not ok', (t) => {
    const dir = world(t);
    setInv3(dir, 'See ADRs 0004 to 0006.');
    noneNotOk(both(dir));
  });

  test('"ADR-4", with the successor in a range "ADRs 0005 to 0006": no not ok', (t) => {
    const dir = world(t);
    setInv3(dir, 'ADR-4 is gone; see ADRs 0005 to 0006.');
    noneNotOk(both(dir));
  });

  test('a long range, "ADRs 50 to 999999999", finishes quickly and names the ADR-100 inside it, whose successor ADR-7 is outside: not ok on INV-3, naming ADR-100', (t) => {
    const dir = world(t);
    write(dir, 'specs/adr/0007-portal.md', adr('accepted', 'ADR-7 choice decides:INV-2 supersedes:ADR-100', '# ADR-7: A portal', 'Context: customers want a portal.'));
    write(dir, 'specs/adr/0100-letters.md', adr('superseded by ADR-7', 'ADR-100 choice decides:INV-2', '# ADR-100: Letters', 'Context: letters were slow.'));
    setInv3(dir, 'See ADRs 50 to 999999999.');
    const started = Date.now();
    const r = check(dir);
    const ms = Date.now() - started;
    assert.equal(r.signal, null, `al check was not killed:\n${show(r)}`);
    assert.ok(ms < 10_000, `al check took ${ms} ms; it must finish in under 10 s:\n${show(r)}`);
    assert.equal(r.code, 0, show(r));
    const found = cited(r);
    assert.equal(found.length, 1, `one not ok superseded-cited:\n${show(r)}`);
    assert.equal(found[0].file, SPEC, show(r));
    assert.equal(found[0].id, 'INV-3', show(r));
    assert.ok(names(found[0].msg, 'ADR-100'), `the message names ADR-100:\n${show(r)}`);
    assert.deepEqual(notOk(r).filter((x) => x.code !== 'superseded-cited').map((x) => x.line), [], show(r));
  });

  test('control: a long range, "ADRs 1 to 999999999", that covers each successor: no not ok, and it finishes quickly', (t) => {
    const dir = world(t);
    setInv3(dir, 'See ADRs 1 to 999999999.');
    const started = Date.now();
    const r = check(dir);
    const ms = Date.now() - started;
    assert.equal(r.signal, null, `al check was not killed:\n${show(r)}`);
    assert.ok(ms < 10_000, `al check took ${ms} ms; it must finish in under 10 s:\n${show(r)}`);
    assert.equal(r.code, 0, show(r));
    noneNotOk(r);
  });
});

describe('adr-lists/R1 (SCH-37): a number without "ADR" or "ADRs" before it names nothing', () => {
  for (const text of ['See 0040.', '0040', 'Numbers 0003 to 0005 are taken.', '0040, 0004 and 0001 are page numbers.']) {
    test(`${JSON.stringify(text)}: no not ok`, (t) => {
      const dir = world(t);
      setInv3(dir, text);
      noneNotOk(both(dir));
    });
  }

  test('"ADR-40", with the successor as a bare number "see 0041": not ok on INV-3, naming ADR-40', (t) => {
    const dir = world(t);
    setInv3(dir, 'ADR-40 was replaced; see 0041.');
    citedInv3(both(dir), ['ADR-40']);
  });

  for (const text of ['ADRs live in the spec folder.', 'ADRs live in the spec folder; 0040 is the newest.', 'The ADR text 0040 is long.', 'An ADR is short.']) {
    test(`a word "ADR" or "ADRs" not followed by a number, ${JSON.stringify(text)}: no not ok`, (t) => {
      const dir = world(t);
      setInv3(dir, text);
      noneNotOk(both(dir));
    });
  }
});

describe('adr-lists/R1 (SCH-37): each current place', () => {
  test('an open request\'s tasks.md that cites "ADR 0040": not ok at tasks.md, naming ADR-40 (control: with "ADR 0041" too, no not ok)', (t) => {
    const dir = world(t);
    write(dir, TASKS, '# Tasks\n\n- T1 Print paper copies as in ADR 0040.\n');
    citedAt(both(dir), { file: TASKS, id: '-', adrs: ['ADR-40'] });
    const control = world(t);
    write(control, TASKS, '# Tasks\n\n- T1 Print paper copies as in ADR 0040, now ADR 0041.\n');
    noneNotOk(both(control));
  });

  test('an open request\'s request.md that cites "ADRs 0003 to 0005": not ok at request.md, naming ADR-4', (t) => {
    const dir = world(t);
    write(dir, REQUEST_MD, `${read(dir, REQUEST_MD)}\nWe keep ADRs 0003 to 0005 for now.\n`);
    citedAt(both(dir), { file: REQUEST_MD, id: '-', adrs: ['ADR-4'] });
  });

  test('an accepted ADR outside the chains (ADR-3) that cites "ADRs 0003, 0005 and 0040": not ok at the ADR file, naming ADR-40', (t) => {
    const dir = world(t);
    editFile(dir, ADR3, ADR3_TEXT, 'Context: numbers have no gaps, as in ADRs 0003, 0005 and 0040.');
    citedAt(both(dir), { file: ADR3, id: 'ADR-3-1', adrs: ['ADR-40'] });
  });

  test('a proposed ADR (ADR-5) that cites "ADR 0004": not ok at the ADR file, naming ADR-4', (t) => {
    const dir = world(t);
    editFile(dir, ADR5, ADR5_TEXT, 'Context: large exports, unlike ADR 0004.');
    citedAt(both(dir), { file: ADR5, id: 'ADR-5-1', adrs: ['ADR-4'] });
  });
});

describe('adr-lists/R1 (SCH-37): exempt places stay exempt for the new forms', () => {
  test('exempt: an ADR\'s History section (control: the same text in ADR-3\'s rationale is not ok)', (t) => {
    const dir = world(t);
    write(dir, ADR3, `${read(dir, ADR3)}\n## History\n\n${EXEMPT_TEXT}\n`);
    noneNotOk(both(dir));
    const control = world(t);
    editFile(control, ADR3, ADR3_TEXT, EXEMPT_TEXT);
    citedAt(both(control), { file: ADR3, id: 'ADR-3-1', adrs: ['ADR-4', 'ADR-40'] });
  });

  test('exempt: a request\'s Decisions section (control: the same line above it in request.md is not ok)', (t) => {
    const decisions = `## Decisions\n\n- D1, 2026-05-04. Source: owner. ${EXEMPT_TEXT}\n`;
    const dir = world(t);
    write(dir, REQUEST_MD, `${read(dir, REQUEST_MD)}\n${decisions}`);
    noneNotOk(both(dir));
    const control = world(t);
    write(control, REQUEST_MD, `${read(control, REQUEST_MD)}\n${EXEMPT_TEXT}\n\n${decisions}`);
    citedAt(both(control), { file: REQUEST_MD, id: '-', adrs: ['ADR-4', 'ADR-40'] });
  });

  test('exempt: origin files (the base world\'s owner words; another file under origin/), control: the same text in tasks.md is not ok', (t) => {
    const dir = world(t);
    write(dir, `requests/${NAME}/origin/notes.md`, `${EXEMPT_TEXT}\n`);
    noneNotOk(both(dir));
    const control = world(t);
    write(control, TASKS, `# Tasks\n\n- T1 ${EXEMPT_TEXT}\n`);
    citedAt(both(control), { file: TASKS, id: '-', adrs: ['ADR-4', 'ADR-40'] });
  });

  test('exempt: an archived request (control: the same request moved back to requests/ is not ok)', (t) => {
    const archived = (t2) => {
      const dir = world(t2);
      newRequest(dir, 'old', 'the owner says: keep paper.\n');
      write(dir, 'requests/old/request.md', `${read(dir, 'requests/old/request.md')}\n${EXEMPT_TEXT}\n`);
      move(dir, 'requests/old', 'requests/archive/old');
      return dir;
    };
    noneNotOk(both(archived(t)));
    const control = archived(t);
    move(control, 'requests/archive/old', 'requests/old');
    citedAt(both(control), { file: 'requests/old/request.md', id: '-', adrs: ['ADR-4', 'ADR-40'] });
  });

  test('exempt: an ADR that supersedes it (ADR-6 cites "ADRs 0003 to 0005"; control: the same text in ADR-3 is not ok)', (t) => {
    const text = 'Context: ADRs 0003 to 0005 needed a fax line.';
    const dir = world(t);
    editFile(dir, ADR6, ADR6_TEXT, text);
    noneNotOk(both(dir));
    const control = world(t);
    editFile(control, ADR3, ADR3_TEXT, text);
    citedAt(both(control), { file: ADR3, id: 'ADR-3-1', adrs: ['ADR-4'] });
  });

  test('exempt: ADR-41, which supersedes ADR-40, cites "ADR 0040" (control: the same text in ADR-3 is not ok)', (t) => {
    const text = 'Context: ADR 0040 was paper.';
    const dir = world(t);
    editFile(dir, ADR41, ADR41_TEXT, text);
    noneNotOk(both(dir));
    const control = world(t);
    editFile(control, ADR3, ADR3_TEXT, text);
    citedAt(both(control), { file: ADR3, id: 'ADR-3-1', adrs: ['ADR-40'] });
  });

  test('exempt: a superseded ADR (ADR-1 cites "ADR 0040" and "ADRs 0003 to 0005"; control: the same text in ADR-3 is not ok)', (t) => {
    const dir = world(t);
    editFile(dir, ADR1, ADR1_TEXT, EXEMPT_TEXT);
    noneNotOk(both(dir));
    const control = world(t);
    editFile(control, ADR3, ADR3_TEXT, EXEMPT_TEXT);
    citedAt(both(control), { file: ADR3, id: 'ADR-3-1', adrs: ['ADR-4', 'ADR-40'] });
  });
});

describe('adr-lists/R1 (SCH-37): "ADR-n" works as before', () => {
  test('"ADR-40" alone: not ok on INV-3, naming ADR-40', (t) => {
    const dir = world(t);
    setInv3(dir, 'Paper copies follow ADR-40.');
    citedInv3(both(dir), ['ADR-40']);
  });

  test('"ADR-40" and "ADR-41": no not ok', (t) => {
    const dir = world(t);
    setInv3(dir, 'ADR-40 gave way to ADR-41.');
    noneNotOk(both(dir));
  });

  test('"ADR-4-1" names ADR-4: not ok on INV-3, naming ADR-4', (t) => {
    const dir = world(t);
    setInv3(dir, 'See ADR-4-1 for the fax line.');
    citedInv3(both(dir), ['ADR-4']);
  });

  test('"ADR-1" and "ADR-40" in one paragraph, no successor: not ok on INV-3, naming ADR-1 and ADR-40', (t) => {
    const dir = world(t);
    setInv3(dir, 'Paper under ADR-1; copies under ADR-40.');
    citedInv3(both(dir), ['ADR-1', 'ADR-40']);
  });
});

// =====================================================================
// The architect's defaults (confirmed). Each is its own test.

describe('adr-lists/R1 default 1: a list or range that starts with an "ADR-n" ID counts', () => {
  test('"ADR-3, 5 and 40" names ADR-40: not ok on INV-3, naming ADR-40', (t) => {
    const dir = world(t);
    setInv3(dir, 'See ADR-3, 5 and 40.');
    citedInv3(both(dir), ['ADR-40']);
  });

  test('"ADR-3 to ADR-5" names ADR-4: not ok on INV-3, naming ADR-4', (t) => {
    const dir = world(t);
    setInv3(dir, 'See ADR-3 to ADR-5.');
    citedInv3(both(dir), ['ADR-4']);
  });

  test('"ADR-3 to 5" names ADR-4: not ok on INV-3, naming ADR-4', (t) => {
    const dir = world(t);
    setInv3(dir, 'See ADR-3 to 5.');
    citedInv3(both(dir), ['ADR-4']);
  });

  test('"ADR-40 and 41" names the successor ADR-41: no not ok', (t) => {
    const dir = world(t);
    setInv3(dir, 'See ADR-40 and 41.');
    noneNotOk(both(dir));
  });
});

describe('adr-lists/R1 default 2: items after "ADRs" may be written "ADR-n"', () => {
  test('"ADRs 0003, ADR-5 and 0040": the list goes on past ADR-5 and names ADR-40: not ok on INV-3, naming ADR-40', (t) => {
    const dir = world(t);
    setInv3(dir, 'See ADRs 0003, ADR-5 and 0040.');
    citedInv3(both(dir), ['ADR-40']);
  });

  test('"ADRs 0040 and ADR-41": no not ok', (t) => {
    const dir = world(t);
    setInv3(dir, 'See ADRs 0040 and ADR-41.');
    noneNotOk(both(dir));
  });
});

describe('adr-lists/R1 default 3: "or" and a dash range do not join beyond the first number', () => {
  test('"ADRs 0040 or 0041" names ADR-40 only, not its successor: not ok on INV-3, naming ADR-40', (t) => {
    const dir = world(t);
    setInv3(dir, 'See ADRs 0040 or 0041.');
    citedInv3(both(dir), ['ADR-40']);
  });

  test('"ADRs 0003 or 0040" does not name ADR-40: no not ok', (t) => {
    const dir = world(t);
    setInv3(dir, 'See ADRs 0003 or 0040.');
    noneNotOk(both(dir));
  });

  test('"ADRs 0003-0005" does not name ADR-4: no not ok', (t) => {
    const dir = world(t);
    setInv3(dir, 'See ADRs 0003-0005.');
    noneNotOk(both(dir));
  });
});

describe('adr-lists/R1 default 4: a reversed range names only its two ends', () => {
  test('"ADRs 5 to 3" does not name ADR-4: no not ok', (t) => {
    const dir = world(t);
    setInv3(dir, 'See ADRs 5 to 3.');
    noneNotOk(both(dir));
  });

  test('"ADRs 5 to 4" names its end ADR-4: not ok on INV-3, naming ADR-4', (t) => {
    const dir = world(t);
    setInv3(dir, 'See ADRs 5 to 4.');
    citedInv3(both(dir), ['ADR-4']);
  });
});

describe('adr-lists/R1 default 5: only "ADR" and "ADRs" in capitals', () => {
  for (const text of ['See adr 40.', 'See adrs 0003 to 0005.', 'See Adr 0040.', 'See Adrs 0003, 0005 and 0040.']) {
    test(`${JSON.stringify(text)} names nothing: no not ok`, (t) => {
      const dir = world(t);
      setInv3(dir, text);
      noneNotOk(both(dir));
    });
  }

  test('control: "ADR-40" with the successor written "adr 41": not ok on INV-3, naming ADR-40', (t) => {
    const dir = world(t);
    setInv3(dir, 'ADR-40 gave way to adr 41.');
    citedInv3(both(dir), ['ADR-40']);
  });
});
