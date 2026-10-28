// A paragraph that applies a promise (#13, requests/applied-promise R1).
// Written from the requirement, the architect's boundary and the public
// interface only:
//
// - A non-promise paragraph that holds a requirement word gets
//   `hint promise-kind <where> <id> promise kind? ...` today.
// - When its marker has a `builds-on:` link to a paragraph that exists and is
//   a promise kind (purpose, scope, rule, limit, definition), `al check` gives
//   no promise-kind finding for it. In `specs/` and in a change spec, where
//   `builds-on:SP-n` names a paragraph of the same change spec.
// - A builds-on to another kind, or to an ID that does not resolve, keeps the
//   hint. The unresolved-link hint stays too.
// - Every other hint on the paragraph stays (near-match, design-link).
// - Nothing new blocks: the `not ok` lines and the exit code do not change,
//   with or without --strict.
//
// The state is the case applied-promise of the invoicer world
// (test/fixtures/invoicer/cases/applied-promise.yaml). Its two arms add the
// same paragraphs; only arm `linked` has the builds-on links. Each "no hint"
// test has a control that gives the hint, in the same state or in arm
// `unlinked`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, invoicer, minus } from './helpers/invoicer.js';
import {
  INVOICES, WORDS_FILE, appendSection, commitAll, doc, git, index, newRequest, organized, project, read, req, show, write, writeConfig,
} from './helpers/project.js';

const run = (t, arm, ...args) => check(invoicer(t, 'applied-promise', arm), ...args);
const of = (r, code, id) => r.findings.filter((f) => f.code === code && f.id === id);
const none = (r, code, id) => assert.deepEqual(of(r, code, id).map((f) => f.line), [], `no ${code} on ${id}:\n${show(r)}`);
const one = (r, code, id) => {
  const found = of(r, code, id);
  assert.equal(found.length, 1, `one ${code} finding on ${id}:\n${show(r)}`);
  assert.equal(found[0].severity, 'hint', show(r));
  return found[0];
};
const promiseKind = (r, id) => {
  const f = one(r, 'promise-kind', id);
  assert.ok(f.msg.includes('promise kind?'), show(r));
  return f;
};

const RE = 'reminder-emails';
// The new paragraphs of the case, each with its builds-on target in arm `linked`.
const APPLIES = { 'EXP-20': 'EXP-4 (rule)', 'EXP-21': 'INV-4 (limit)', 'EXP-22': 'INV-6 (definition)', 'EXP-23': 'INV-2 (purpose)', 'EXP-24': 'INV-3 (scope)' };
const ALL = [
  'EXP-20', 'EXP-21', 'EXP-22', 'EXP-23', 'EXP-24', 'EXP-25', 'EXP-26', 'EXP-27', 'EXP-28',
  `${RE}/SP-6`, `${RE}/SP-7`, `${RE}/SP-8`, `${RE}/SP-9`, `${RE}/SP-10`, `${RE}/SP-11`,
];

test('control: with no builds-on link, each new paragraph that holds a requirement word gets promise kind?', (t) => {
  const r = run(t, 'unlinked');
  for (const id of ALL) promiseKind(r, id);
});

test('specs/: a flow that holds never and builds on the rule EXP-4 gets no promise kind?', (t) => {
  const r = run(t, 'linked');
  none(r, 'promise-kind', 'EXP-20');
  // control in the same state: a builds-on to a component keeps the hint
  promiseKind(r, 'EXP-25');
});

test('specs/: each promise kind counts as the target: rule, limit, definition, purpose, scope', (t) => {
  const r = run(t, 'linked');
  for (const [id, target] of Object.entries(APPLIES)) {
    assert.deepEqual(of(r, 'promise-kind', id).map((f) => f.line), [], `no promise-kind on ${id}, which builds on ${target}:\n${show(r)}`);
  }
  promiseKind(r, 'EXP-25');
});

test('specs/: a builds-on to a component (EXP-6) or a rationale (EXP-5) keeps promise kind?', (t) => {
  const r = run(t, 'linked');
  promiseKind(r, 'EXP-25');
  promiseKind(r, 'EXP-26');
});

test('a builds-on to an ID that does not exist keeps promise kind?, and the unresolved-link hint is there', (t) => {
  const r = run(t, 'linked');
  promiseKind(r, 'EXP-27');
  assert.ok(one(r, 'unresolved-link', 'EXP-27').msg.includes('EXP-99'), show(r));
  promiseKind(r, `${RE}/SP-11`);
  assert.ok(one(r, 'unresolved-link', `${RE}/SP-11`).msg.includes('SP-99'), show(r));
});

test('specs/: builds-on:EXP-6,EXP-4 (a component and a rule) links to the rule, so no promise kind?', (t) => {
  const r = run(t, 'linked');
  none(r, 'promise-kind', 'EXP-28');
  promiseKind(r, 'EXP-25');
});

test('change spec: a flow that builds on the rule SP-2, and a component that builds on the definition SP-3, of the same change spec get no promise kind?', (t) => {
  const r = run(t, 'linked');
  none(r, 'promise-kind', `${RE}/SP-6`);
  none(r, 'promise-kind', `${RE}/SP-8`);
  // control in the same state: a builds-on to a flow of the same change spec
  promiseKind(r, `${RE}/SP-9`);
});

test('change spec: an approach that builds on the rule INV-10 in specs/ gets no promise kind?', (t) => {
  const r = run(t, 'linked');
  none(r, 'promise-kind', `${RE}/SP-7`);
  promiseKind(r, `${RE}/SP-9`);
});

test('change spec: a builds-on to the flow SP-4 of the same change spec keeps promise kind?', (t) => {
  const r = run(t, 'linked');
  promiseKind(r, `${RE}/SP-9`);
});

test('other hints stay: SP-10 keeps "does this change INV-11?" and "which promise does it keep?" when promise kind? goes', (t) => {
  const r = run(t, 'linked');
  none(r, 'promise-kind', `${RE}/SP-10`);
  assert.ok(one(r, 'near-match', `${RE}/SP-10`).msg.includes('does this change INV-11?'), show(r));
  assert.ok(one(r, 'design-link', `${RE}/SP-10`).msg.includes('which promise does it keep?'), show(r));
  // SP-7 builds on a promise in specs/ only, so its design-link hint stays too
  assert.ok(one(r, 'design-link', `${RE}/SP-7`).msg.includes('which promise does it keep?'), show(r));
  // control: without the link, SP-10 has all three
  const u = run(t, 'unlinked');
  promiseKind(u, `${RE}/SP-10`);
  one(u, 'near-match', `${RE}/SP-10`);
  one(u, 'design-link', `${RE}/SP-10`);
});

test('the links change only promise kind? on the paragraphs that apply a promise, and the hints that the links themselves decide', (t) => {
  const linked = run(t, 'linked');
  const unlinked = run(t, 'unlinked');
  // Gone with the links: promise kind? on each paragraph that builds on a
  // promise, and design-link on SP-6 and SP-8, which build on a promise of
  // their own change spec.
  assert.deepEqual(minus(unlinked.findings, linked.findings), [
    'hint design-link reminder-emails/SP-6',
    'hint design-link reminder-emails/SP-8',
    'hint promise-kind EXP-20',
    'hint promise-kind EXP-21',
    'hint promise-kind EXP-22',
    'hint promise-kind EXP-23',
    'hint promise-kind EXP-24',
    'hint promise-kind EXP-28',
    'hint promise-kind reminder-emails/SP-10',
    'hint promise-kind reminder-emails/SP-6',
    'hint promise-kind reminder-emails/SP-7',
    'hint promise-kind reminder-emails/SP-8',
  ], `unlinked:\n${show(unlinked)}\nlinked:\n${show(linked)}`);
  // New with the links: only the hints on the links that do not resolve.
  assert.deepEqual(minus(linked.findings, unlinked.findings), [
    'hint unresolved-link EXP-27',
    'hint unresolved-link reminder-emails/SP-11',
  ], `unlinked:\n${show(unlinked)}\nlinked:\n${show(linked)}`);
});

test('nothing new blocks: the not ok lines and the exit code are the same with and without the links, with and without --strict', (t) => {
  for (const args of [[], ['--strict']]) {
    const linked = run(t, 'linked', ...args);
    const unlinked = run(t, 'unlinked', ...args);
    const notOk = (r) => r.findings.filter((f) => f.severity === 'not ok').map((f) => f.line);
    assert.deepEqual(notOk(linked), notOk(unlinked), `${args.join(' ')}\nunlinked:\n${show(unlinked)}\nlinked:\n${show(linked)}`);
    assert.equal(linked.code, unlinked.code, `${args.join(' ')}\nunlinked:\n${show(unlinked)}\nlinked:\n${show(linked)}`);
    // the state has no not ok, so the check passes in both arms
    assert.deepEqual(notOk(linked), [], show(linked));
    assert.equal(linked.code, 0, show(linked));
  }
});

// --- a central repo: central:X means this repo's own X (DES-69)
//
// The central repo lists one output repo (a sibling clone) in its config. So
// builds-on:central:INV-13 names its own rule INV-13. With { central: false },
// the config lists no outputs, so central:INV-13 names another repo's INV-13,
// not a local paragraph. Built as in test/design-links-229.test.js.
//
// specs/invoices.md has INV-12 (data), INV-13 (rule) and INV-41 (rule). The
// branch adds, each with a requirement word:
//   INV-80 flow       builds-on:central:INV-13 (a rule)
//   INV-81 flow       builds-on:central:INV-12 (data)
//   INV-82 flow       builds-on:INV-13 (a rule, a plain link)
//   x/SP-2 component  builds-on:central:INV-41 (a rule in specs/)
//   x/SP-3 component  builds-on:central:INV-12 (data in specs/)
const SPEC = 'specs/invoices.md';
const R1 = req('R1', 'One month', 'A user MUST be able to download one month as one CSV file.', [WORDS_FILE]);

function centralWorld(t, { central = true } = {}) {
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
  write(dir, SPEC, `${read(dir, SPEC)}\n${doc([
    ['INV-80 flow builds-on:central:INV-13', 'The invoice form never saves an invoice with no line.'],
    ['INV-81 flow builds-on:central:INV-12', 'The invoice form never saves an invoice with no customer.'],
    ['INV-82 flow builds-on:INV-13', 'The import never accepts an invoice with no line.'],
  ])}`);
  newRequest(dir, 'x', 'The owner wants x.\n', ['--tier', '2']);
  appendSection(dir, 'x', organized([R1]));
  write(dir, 'requests/x/spec.md', doc([
    ['SP-1 rule serves:R1', 'An export MUST hold the invoices of one calendar month.'],
    ['SP-2 component serves:R1 builds-on:central:INV-41', 'The link service MUST refuse a link that is older than 30 minutes.'],
    ['SP-3 component serves:R1 builds-on:central:INV-12', 'The month reader MUST read the paid date of each invoice.'],
  ]));
  index(dir);
  commitAll(dir, 'x\n\nTier: 2 — x');
  return dir;
}

test('central repo: a flow that holds never and builds on central:INV-13, its own rule, gets no promise kind?', (t) => {
  const dir = centralWorld(t);
  assert.ok(/outputs/.test(read(dir, '.assuredloop/config.yaml')), 'the config lists outputs');
  const r = check(dir);
  none(r, 'promise-kind', 'INV-80');
  // controls in the same state: central:INV-12 is data, so the hint stays
  promiseKind(r, 'INV-81');
  // the plain link builds-on:INV-13 gives no hint, as central:INV-13 must not
  none(r, 'promise-kind', 'INV-82');
});

test('central repo: a change spec component that builds on central:INV-41, a rule in specs/, gets no promise kind?', (t) => {
  const r = check(centralWorld(t));
  none(r, 'promise-kind', 'x/SP-2');
  // control in the same state: central:INV-12 is data, so the hint stays
  promiseKind(r, 'x/SP-3');
});

test('not central (no outputs in the config): builds-on:central:INV-13 names no local paragraph, so promise kind? stays', (t) => {
  const dir = centralWorld(t, { central: false });
  assert.ok(!/outputs/.test(read(dir, '.assuredloop/config.yaml')), 'the config lists no outputs');
  const r = check(dir);
  promiseKind(r, 'INV-80');
  promiseKind(r, 'INV-81');
  promiseKind(r, 'x/SP-2');
  promiseKind(r, 'x/SP-3');
  // the same repo with the plain link: no hint
  none(r, 'promise-kind', 'INV-82');
});
