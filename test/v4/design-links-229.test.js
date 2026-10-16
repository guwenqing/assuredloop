// Hints for design links and task references, and the Linked line of
// al context <ID> (#229, requests/design-links R1). Written from the
// requirement, the architect's decisions and the public interface only:
//
// - `hint design-link requests/<name>/spec.md:<line> <name>/SP-<n> <message>`:
//   a design (component, interface, data, flow, choice) or approach paragraph
//   of an open request's change spec serves a requirement that has promise
//   paragraphs (purpose, scope, rule, limit, definition) in the same change
//   spec, and has no builds-on or changes link to any of them. One finding per
//   (paragraph, requirement) pair; the message names the requirement and its
//   promise paragraphs.
// - `hint unknown-task requests/<name>/spec.md:<line> <name>/SP-<n> <message>`:
//   a `for:<task>` that names no task in the record. A project with no task
//   in any request record gets no hint.
// - Both stay hints under --strict and do not change its exit code.
// - al context <ID>: `Linked    <ID> builds on it · <ID> explains it · ...`,
//   or `Linked    no paragraph builds on, explains or illustrates it`.
//
// Each "does not fire" test has a control in the same fixture that fires.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check } from './helpers/invoicer.js';
import {
  WORDS_FILE, appendSection, baseProject, commitAll, doc, editFile, editRecord, git, index, move, newRequest, ok,
  organized, project, read, req, write, writeConfig,
} from './helpers/project.js';
import { lines, show, view, word } from './helpers/views.js';

const R1 = req('R1', 'One month', 'A user MUST be able to download one month as one CSV file.', [WORDS_FILE]);
const R2 = req('R2', 'A link that expires', 'The email link MUST stop working after a short time.', [WORDS_FILE]);
const R3 = req('R3', 'A total', 'The export SHOULD show the total of the month.', [WORDS_FILE]);
const R4 = req('R4', 'A header', 'The export MAY start with a header row.', [WORDS_FILE]);

const SPEC = 'specs/invoices.md';
const cs = (name) => `requests/${name}/spec.md`;
const claim = (name) => `Tier: 2 — ${name}`;

// A tier 2 request with its organized requirement and change spec.
function request(dir, name, reqs, paras) {
  newRequest(dir, name, `The owner wants ${name}.\n`, ['--tier', '2']);
  appendSection(dir, name, organized(reqs));
  write(dir, cs(name), doc(paras));
}

// Appends paragraphs to specs/invoices.md.
const addToSpec = (dir, paras) => write(dir, SPEC, `${read(dir, SPEC)}\n${doc(paras)}`);

// Concludes a request by hand, as the invoicer world does: the folder moves to
// requests/archive/, and the record and the header say concluded.
function archive(dir, name) {
  editFile(dir, `requests/${name}/request.md`, 'Status: open', 'Status: concluded');
  move(dir, `requests/${name}`, `requests/archive/${name}`);
  editRecord(dir, name, (rec) => { rec.status = 'concluded'; });
}

// The 1-based line of a paragraph's marker in a file.
function markerLine(dir, file, id) {
  const ls = read(dir, file).split('\n');
  const at = ls.findIndex((l) => new RegExp(`^<!-- ${id} `).test(l));
  assert.ok(at >= 0, `${file} has the marker of ${id}`);
  return at + 1;
}

const of = (r, code, id) => r.findings.filter((f) => f.code === code && f.id === id);
const one = (r, code, id) => {
  const found = of(r, code, id);
  assert.equal(found.length, 1, `one ${code} finding on ${id}:\n${show(r)}`);
  return found[0];
};
const none = (r, code, id) => assert.deepEqual(of(r, code, id).map((f) => f.line), [], `no ${code} on ${id}:\n${show(r)}`);

// --- the design-link world
//
// Request y: R1, R2; its change spec has SP-1, a rule that serves y's R2.
// Request x: R1-R4; specs/ gets INV-50 (a rule that serves x/R3) and INV-51
// (a component that serves x/R1 and links to none of x's promise paragraphs).
const X_SPEC = [
  ['SP-1 rule serves:R1', 'An export MUST hold the invoices of one calendar month.'],
  ['SP-2 component serves:R1 builds-on:SP-1', 'The month reader loads the invoices of the month.'],
  ['SP-3 component serves:R1 builds-on:x/SP-1', 'The CSV writer turns invoices into rows.'],
  ['SP-4 approach serves:R1 changes:SP-1', 'Build the month reader first, then the writer.'],
  ['SP-5 interface serves:R1,R2 builds-on:SP-1', 'GET /exports/<month> answers with a link by email.'],
  ['SP-6 limit serves:R2', 'The email link MUST stop working 30 minutes after it is sent.'],
  ['SP-7 definition serves:R2', 'The send time is the time the mail server accepts the email.'],
  ['SP-8 data serves:R2 builds-on:SP-7', 'A link row holds a token and its send time.'],
  ['SP-9 component serves:R1', 'The export queue runs one export at a time.'],
  ['SP-10 interface serves:R1 builds-on:INV-12', 'The writer takes a list of invoice numbers.'],
  ['SP-11 data serves:R1 builds-on:INV-12', 'A CSV row holds the number, customer and total.'],
  ['SP-12 flow serves:R1 builds-on:INV-13', 'The reader passes each invoice to the writer in order.'],
  ['SP-13 choice serves:R1 builds-on:INV-13', 'We stream the rows rather than build the file in memory.'],
  ['SP-14 approach serves:R1 builds-on:INV-12', 'Ship the writer behind a flag.'],
  ['SP-15 component serves:R3 builds-on:INV-12', 'The total cell sums the line amounts.'],
  ['SP-16 component serves:y/R2 builds-on:INV-12', 'The y side uses the same reader.'],
  ['SP-17 rule serves:y/R1', 'A y export MUST name its month in the file name.'],
  ['SP-18 component serves:y/R1 builds-on:INV-12', 'The file namer formats the month as YYYY-MM.'],
  ['SP-19 component serves:y/R1 builds-on:SP-17', 'The file namer is called by the writer.'],
  ['SP-20 rule serves:R4', 'The header row MUST name each column.'],
  ['SP-21 purpose serves:R4', 'A header row makes the file readable by people.'],
  ['SP-22 scope serves:R4', 'The header applies to CSV exports only.'],
  ['SP-23 limit serves:R4', 'A header name MUST be at most 40 characters.'],
  ['SP-24 definition serves:R4', 'A column is one field of a CSV row.'],
  ['SP-25 rationale serves:R4', 'Spreadsheet users asked for names on the columns.'],
  ['SP-26 example serves:R4', 'number,customer,total'],
  ['SP-27 open serves:R4', 'Should the header be translated?'],
  ['SP-28 note serves:R4', '## The header'],
  ['SP-29 plan serves:R4', 'Add the header after the writer ships.'],
  ['SP-30 step serves:R4', 'Write the header line before the first row.'],
  ['SP-31 migration serves:R4', 'Old exports keep no header.'],
  ['SP-32 component serves:R4 builds-on:INV-12', 'The header writer prints the column names.'],
];

function designWorld(t) {
  const dir = baseProject(t);
  request(dir, 'y', [R1, R2], [['SP-1 rule serves:R2', 'A y link MUST be sent once.']]);
  request(dir, 'x', [R1, R2, R3, R4], X_SPEC);
  addToSpec(dir, [
    ['INV-50 rule serves:x/R3', 'An export MUST show the total of the month.'],
    ['INV-51 component serves:x/R1 builds-on:INV-12', 'The invoice store answers queries by month.'],
  ]);
  index(dir);
  commitAll(dir, `x and y\n\n${claim('x')}`);
  return dir;
}

test('design-link: a design paragraph that serves R1 with no link to R1\'s promise SP-1 gets one hint, at its marker line, naming x/R1 and SP-1', (t) => {
  const dir = designWorld(t);
  const r = check(dir);
  const f = one(r, 'design-link', 'x/SP-9');
  assert.equal(f.severity, 'hint', show(r));
  assert.equal(f.file, cs('x'), show(r));
  assert.equal(f.at, markerLine(dir, cs('x'), 'SP-9'), `the marker line of SP-9:\n${show(r)}`);
  assert.match(f.msg, word('x/R1'), show(r));
  assert.match(f.msg, word('SP-1'), show(r));
});

test('design-link: fires for each design kind (component, interface, data, flow, choice) and approach', (t) => {
  const r = check(designWorld(t));
  for (const id of ['SP-9', 'SP-10', 'SP-11', 'SP-12', 'SP-13', 'SP-14', 'SP-32']) {
    const f = one(r, 'design-link', `x/${id}`);
    assert.equal(f.severity, 'hint', show(r));
  }
  assert.match(one(r, 'design-link', 'x/SP-32').msg, word('x/R4'), show(r));
});

test('design-link: builds-on:SP-1, builds-on:x/SP-1 or changes:SP-1 is enough; a link to one of two promise paragraphs is enough', (t) => {
  const r = check(designWorld(t));
  for (const id of ['SP-2', 'SP-3', 'SP-4', 'SP-8']) none(r, 'design-link', `x/${id}`);
  // control in the same state
  one(r, 'design-link', 'x/SP-9');
});

test('builds-on to a promise paragraph of the same change spec is a valid link: no unresolved-link (bare and qualified)', (t) => {
  const r = check(designWorld(t));
  for (const id of ['SP-2', 'SP-3', 'SP-5', 'SP-8', 'SP-19']) {
    for (const code of ['unresolved-link']) {
      assert.deepEqual(r.findings.filter((f) => f.code === code && word(id).test(f.id) && f.file === cs('x')).map((f) => f.line), [], show(r));
    }
  }
});

test('design-link: a paragraph that serves R1 and R2 and links only to R1\'s promise gets one hint, for x/R2, naming SP-6 and SP-7', (t) => {
  const r = check(designWorld(t));
  const f = one(r, 'design-link', 'x/SP-5');
  assert.equal(f.severity, 'hint', show(r));
  assert.match(f.msg, word('x/R2'), show(r));
  assert.doesNotMatch(f.msg, word('x/R1'), show(r));
  assert.match(f.msg, word('SP-6'), show(r));
  assert.match(f.msg, word('SP-7'), show(r));
  assert.doesNotMatch(f.msg, word('SP-1'), `SP-1 is R1's promise, not R2's:\n${show(r)}`);
});

test('design-link: serves:y/R1 uses the promise paragraphs of this change spec that serve y/R1', (t) => {
  const r = check(designWorld(t));
  const f = one(r, 'design-link', 'x/SP-18');
  assert.equal(f.severity, 'hint', show(r));
  assert.match(f.msg, word('y/R1'), show(r));
  assert.match(f.msg, word('SP-17'), show(r));
  none(r, 'design-link', 'x/SP-19');
});

test('design-link: no hint when the requirement\'s promise paragraphs are only in specs/ or only in another request\'s change spec', (t) => {
  const r = check(designWorld(t));
  none(r, 'design-link', 'x/SP-15'); // x/R3: its promise is INV-50 in specs/
  none(r, 'design-link', 'x/SP-16'); // y/R2: its promise is y/SP-1 in y's change spec
  none(r, 'design-link', 'y/SP-1');
  one(r, 'design-link', 'x/SP-18'); // control: y/R1 has a promise in x's change spec
});

test('design-link: no hint on a design paragraph in specs/ (INV-51 serves x/R1 and links to no promise of x)', (t) => {
  const r = check(designWorld(t));
  none(r, 'design-link', 'INV-51');
  assert.deepEqual(r.findings.filter((f) => f.code === 'design-link' && f.file === SPEC).map((f) => f.line), [], show(r));
  one(r, 'design-link', 'x/SP-9'); // control: the same requirement, in the change spec
});

test('design-link: no hint on promise, informative, note or change-only kinds; a component beside them fires', (t) => {
  const r = check(designWorld(t));
  for (let n = 20; n <= 31; n++) none(r, 'design-link', `x/SP-${n}`);
  for (const id of ['SP-1', 'SP-6', 'SP-7', 'SP-17']) none(r, 'design-link', `x/${id}`);
  const f = one(r, 'design-link', 'x/SP-32');
  for (const id of ['SP-20', 'SP-21', 'SP-22', 'SP-23', 'SP-24']) assert.match(f.msg, word(id), `R4's promise ${id}:\n${show(r)}`);
  for (const id of ['SP-25', 'SP-26', 'SP-27', 'SP-28', 'SP-29', 'SP-30', 'SP-31']) {
    assert.doesNotMatch(f.msg, word(id), `${id} is not a promise paragraph:\n${show(r)}`);
  }
});

test('design-link: exactly the expected findings in the design world', (t) => {
  const r = check(designWorld(t));
  const ids = r.findings.filter((f) => f.code === 'design-link').map((f) => f.id).sort();
  assert.deepEqual(ids, ['x/SP-10', 'x/SP-11', 'x/SP-12', 'x/SP-13', 'x/SP-14', 'x/SP-18', 'x/SP-32', 'x/SP-5', 'x/SP-9'].sort(), show(r));
  assert.equal(r.code, 0, show(r));
});

test('design-link: no hint in a concluded (archived) request; the same paragraph in an open request fires', (t) => {
  const dir = baseProject(t);
  const paras = [
    ['SP-1 rule serves:R1', 'An export MUST hold the invoices of one calendar month.'],
    ['SP-2 component serves:R1 builds-on:INV-12', 'The month reader loads the invoices of the month.'],
  ];
  request(dir, 'open1', [R1], paras);
  request(dir, 'done1', [R1], paras);
  index(dir);
  archive(dir, 'done1');
  index(dir);
  commitAll(dir, `open1 and done1\n\n${claim('open1')}`);
  const r = check(dir);
  assert.equal(one(r, 'design-link', 'open1/SP-2').severity, 'hint', show(r));
  none(r, 'design-link', 'done1/SP-2');
  assert.deepEqual(r.findings.filter((f) => f.code === 'design-link' && f.file.includes('archive')).map((f) => f.line), [], show(r));
});

// --- the task world
//
// x has tasks T1, T2; y has T5.
function taskWorld(t) {
  const dir = baseProject(t);
  request(dir, 'x', [R1], [
    ['SP-1 step for:T2', 'Build the month reader.'],
    ['SP-2 step for:T9', 'Build the CSV writer.'],
    ['SP-3 step for:y/T5', 'Reuse the y reader.'],
    ['SP-4 step for:y/T6', 'Reuse the y namer.'],
    ['SP-5 step for:T5', 'Ship the export page.'],
    ['SP-6 step for:x/T1', 'Write the export tests.'],
  ]);
  request(dir, 'y', [R1], [
    ['SP-1 step for:T5', 'Build the y reader.'],
    ['SP-2 step for:T1', 'Build the y namer.'],
  ]);
  index(dir);
  editRecord(dir, 'x', (rec) => {
    rec.tasks = [{ id: 'T1', ref: 'tasks.md T1', delivers: ['R1'] }, { id: 'T2', ref: 'tasks.md T2; issue #31', delivers: ['R1'] }];
  });
  editRecord(dir, 'y', (rec) => { rec.tasks = [{ id: 'T5', ref: 'tasks.md T5', delivers: ['R1'] }]; });
  index(dir);
  commitAll(dir, `x and y\n\n${claim('x')}`);
  return dir;
}

test('unknown-task: for:T9 names no task of x: one hint at its marker line, naming for:T9', (t) => {
  const dir = taskWorld(t);
  const r = check(dir);
  const f = one(r, 'unknown-task', 'x/SP-2');
  assert.equal(f.severity, 'hint', show(r));
  assert.equal(f.file, cs('x'), show(r));
  assert.equal(f.at, markerLine(dir, cs('x'), 'SP-2'), show(r));
  assert.ok(f.msg.includes('for:T9'), show(r));
});

test('unknown-task: for:T2, for:x/T1 and for:y/T5 name tasks in the records: no hint', (t) => {
  const r = check(taskWorld(t));
  for (const id of ['x/SP-1', 'x/SP-3', 'x/SP-6', 'y/SP-1']) none(r, 'unknown-task', id);
  one(r, 'unknown-task', 'x/SP-2'); // control
});

test('unknown-task: for:y/T6 names no task of y: a hint naming for:y/T6', (t) => {
  const r = check(taskWorld(t));
  const f = one(r, 'unknown-task', 'x/SP-4');
  assert.equal(f.severity, 'hint', show(r));
  assert.ok(f.msg.includes('for:y/T6'), show(r));
});

test('unknown-task: a bare task names the paragraph\'s own request: for:T5 in x and for:T1 in y each get a hint', (t) => {
  const r = check(taskWorld(t));
  assert.ok(one(r, 'unknown-task', 'x/SP-5').msg.includes('for:T5'), show(r));
  const y = one(r, 'unknown-task', 'y/SP-2');
  assert.equal(y.file, cs('y'), show(r));
  assert.ok(y.msg.includes('for:T1'), show(r));
});

test('unknown-task: exactly the expected findings in the task world, and the check exits 0', (t) => {
  const r = check(taskWorld(t));
  const ids = r.findings.filter((f) => f.code === 'unknown-task').map((f) => f.id).sort();
  assert.deepEqual(ids, ['x/SP-2', 'x/SP-4', 'x/SP-5', 'y/SP-2'].sort(), show(r));
  assert.equal(r.code, 0, show(r));
});

test('unknown-task: a project with no tasks gets no hint (also with tasks: []); a task in an archived request\'s record turns the hint on', (t) => {
  const dir = baseProject(t);
  request(dir, 'x', [R1], [['SP-1 step for:T9', 'Build the CSV writer.']]);
  request(dir, 'old', [R1], [['SP-1 step for:T3', 'Build the old reader.']]);
  index(dir);
  archive(dir, 'old');
  editRecord(dir, 'x', (rec) => { rec.tasks = []; });
  index(dir);
  commitAll(dir, `x\n\n${claim('x')}`);
  const before = check(dir);
  none(before, 'unknown-task', 'x/SP-1');
  assert.deepEqual(before.findings.filter((f) => f.code === 'unknown-task').map((f) => f.line), [], show(before));

  // control: the archived request's record gets a task; the project now uses tasks
  editRecord(dir, 'old', (rec) => { rec.tasks = [{ id: 'T3', ref: 'tasks.md T3', delivers: ['R1'] }]; });
  index(dir);
  commitAll(dir, `old has a task\n\n${claim('x')}`);
  const after = check(dir);
  const f = one(after, 'unknown-task', 'x/SP-1');
  assert.equal(f.severity, 'hint', show(after));
  assert.ok(f.msg.includes('for:T9'), show(after));
});

// --- --strict
//
// A project where nothing else is not ok under --strict: its specs hold only
// note paragraphs, R1 is signed, and the only hints are the two new ones.
function strictWorld(t) {
  const dir = project(t);
  writeConfig(dir);
  write(dir, SPEC, doc([['INV-1 note', '# Invoices'], ['INV-2 note', 'This file holds the invoice promises.']]));
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  request(dir, 'x', [R1], [
    ['SP-1 rule serves:R1', 'An export MUST hold the invoices of one calendar month.'],
    ['SP-2 component serves:R1', 'The month reader loads the invoices of the month.'],
    ['SP-3 component serves:R1 builds-on:SP-1', 'The CSV writer turns invoices into rows.'],
    ['SP-4 step for:T9', 'Build the CSV writer.'],
    ['SP-5 step for:T1', 'Build the month reader.'],
  ]);
  index(dir);
  editRecord(dir, 'x', (rec) => { rec.tasks = [{ id: 'T1', ref: 'tasks.md T1', delivers: ['R1'] }]; });
  ok(dir, ['record', 'x', 'signoff', '--source', 'email from the owner, 2026-05-04', '--yes']);
  index(dir);
  commitAll(dir, `x\n\n${claim('x')}`);
  return dir;
}

test('--strict: design-link and unknown-task stay hints, and alone they leave the exit code 0', (t) => {
  const dir = strictWorld(t);
  for (const args of [[], ['--strict']]) {
    const r = check(dir, ...args);
    assert.equal(one(r, 'design-link', 'x/SP-2').severity, 'hint', show(r));
    assert.equal(one(r, 'unknown-task', 'x/SP-4').severity, 'hint', show(r));
    none(r, 'design-link', 'x/SP-3');
    none(r, 'unknown-task', 'x/SP-5');
    assert.deepEqual(r.findings.filter((f) => f.severity === 'not ok').map((f) => f.line), [], `nothing else is not ok:\n${show(r)}`);
    assert.equal(r.code, 0, show(r));
  }
});

test('--strict: in the design and task worlds the new findings are hints, never not ok', (t) => {
  for (const [world, codes] of [[designWorld, ['design-link']], [taskWorld, ['unknown-task']]]) {
    const r = check(world(t), '--strict');
    for (const code of codes) {
      const found = r.findings.filter((f) => f.code === code);
      assert.ok(found.length > 0, `some ${code} findings:\n${show(r)}`);
      assert.deepEqual(found.filter((f) => f.severity !== 'hint').map((f) => f.line), [], show(r));
    }
  }
});

// --- al context <ID>: the Linked line

// specs/ gets INV-70 (explains INV-12), INV-71 (illustrates INV-12) and INV-72
// (builds on and illustrates INV-13). x's change spec links to INV-12, INV-13
// and its own SP-1. The archived request old builds on INV-12.
function contextWorld(t) {
  const dir = baseProject(t);
  request(dir, 'old', [R1], [
    ['SP-1 rule serves:R1', 'An old export MUST hold one year.'],
    ['SP-2 component serves:R1 builds-on:SP-1,INV-12', 'The old reader loads one year.'],
  ]);
  index(dir);
  archive(dir, 'old');
  addToSpec(dir, [
    ['INV-70 rationale explains:INV-12', 'The paid date tells the export which month an invoice is in.'],
    ['INV-71 example illustrates:INV-12', 'Invoice 2026-0042 for ACME, two lines, total 120.00, paid 2026-04-30.'],
    ['INV-72 example builds-on:INV-13 illustrates:INV-13', 'An invoice with no line is refused: "add a line first".'],
  ]);
  request(dir, 'x', [R1], [
    ['SP-1 rule serves:R1', 'An export MUST hold the invoices of one calendar month.'],
    ['SP-2 component serves:R1 builds-on:SP-1,INV-12', 'The month reader loads the invoices of the month.'],
    ['SP-3 rationale explains:SP-1', 'Owners close their books by month.'],
    ['SP-4 example illustrates:x/SP-1', 'The export for 2026-04 holds the invoices paid in April 2026.'],
    ['SP-5 rationale explains:INV-12', 'The total is read, not computed again.'],
    ['SP-6 rule serves:R1 changes:INV-13', 'An invoice MUST have at least one line with an amount.'],
  ]);
  index(dir);
  commitAll(dir, `x\n\n${claim('x')}`);
  return dir;
}

// The one Linked line of a context view, as its sorted entries. The label is
// "Linked" padded to 10 columns. The line comes after any Links lines, right
// before the Governed line (a spec ID) or the Checks line (a change-spec ID).
function linked(r) {
  const ls = lines(r);
  const at = ls.findIndex((l) => l.startsWith('Linked'));
  assert.equal(ls.filter((l) => l.startsWith('Linked')).length, 1, `one Linked line:\n${show(r)}`);
  const line = ls[at];
  assert.ok(line.startsWith('Linked    ') && line[10] !== ' ', `the label is 10 columns:\n${show(r)}`);
  const next = /^Paragraph SP-/.test(ls[0]) ? 'Checks    ' : 'Governed  ';
  assert.ok(ls[at + 1]?.startsWith(next), `the line after Linked is ${next.trim()}:\n${show(r)}`);
  assert.ok(ls.slice(at + 1).every((l) => !l.startsWith('Links     ')), `Linked comes after the Links lines:\n${show(r)}`);
  return line.slice(10).split(' · ').sort();
}
const NONE = ['no paragraph builds on, explains or illustrates it'];

test('context INV-12: Linked lists the paragraphs of specs/ and of open change specs that build on, explain or illustrate it', (t) => {
  const dir = contextWorld(t);
  const r = view(dir, ['context', 'INV-12']);
  assert.deepEqual(linked(r), ['INV-70 explains it', 'INV-71 illustrates it', 'x/SP-2 builds on it', 'x/SP-5 explains it'].sort(), show(r));
  assert.doesNotMatch(r.stdout, word('old/SP-2'), `an archived request is not a source:\n${show(r)}`);
});

test('context INV-13: a paragraph with two links to it gives two entries; a changes link is not listed', (t) => {
  const r = view(contextWorld(t), ['context', 'INV-13']);
  assert.deepEqual(linked(r), ['INV-72 builds on it', 'INV-72 illustrates it'], show(r));
});

test('context INV-12 and INV-13: the Open line stays as it was (builds on, changes)', (t) => {
  const dir = contextWorld(t);
  const r12 = view(dir, ['context', 'INV-12']);
  const open12 = lines(r12).filter((l) => l.startsWith('Open      '));
  assert.equal(open12.length, 1, show(r12));
  assert.ok(open12[0].includes('x/SP-2 builds on it'), show(r12));
  const r13 = view(dir, ['context', 'INV-13']);
  const open13 = lines(r13).filter((l) => l.startsWith('Open      '));
  assert.equal(open13.length, 1, show(r13));
  assert.ok(open13[0].includes('x/SP-6 changes it'), show(r13));
});

test('context x/SP-1: Linked lists x/SP-2 builds on it, x/SP-3 explains it, x/SP-4 illustrates it', (t) => {
  const r = view(contextWorld(t), ['context', 'x/SP-1']);
  assert.deepEqual(linked(r), ['x/SP-2 builds on it', 'x/SP-3 explains it', 'x/SP-4 illustrates it'], show(r));
});

test('context: with no such paragraph, Linked says so (a spec ID and a change-spec ID); a linked ID in the same state lists', (t) => {
  const dir = contextWorld(t);
  assert.deepEqual(linked(view(dir, ['context', 'INV-41'])), NONE);
  assert.deepEqual(linked(view(dir, ['context', 'x/SP-2'])), NONE); // it has a Links line
  assert.deepEqual(linked(view(dir, ['context', 'INV-70'])), NONE); // it has a Links line
  assert.notDeepEqual(linked(view(dir, ['context', 'INV-12'])), NONE);
});

test('context INV-12 --at <main>: reads that commit, where no paragraph links to it', (t) => {
  const dir = contextWorld(t);
  const main = git(dir, 'rev-parse', 'main');
  assert.deepEqual(linked(view(dir, ['context', 'INV-12', '--at', main])), NONE);
  assert.ok(linked(view(dir, ['context', 'INV-12', '--at', 'HEAD'])).includes('INV-70 explains it'));
});
