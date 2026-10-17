// The frame of a sign-off (#216): a change after a sign-off to the part of the
// signed section that is outside every requirement (the intro, the Out: text,
// the Assumed: text) makes every requirement of the section unsigned, until a
// new sign-off covers the new text. A change to one requirement, or a new
// requirement, does not unsign another requirement. Marker lines and the
// Signed off: line are no part of it. Each place that reports sign-off state
// says so: al context <name>, al context <ID>, al check --strict, al conclude.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WORDS_FILE, appendSection, commitAll, doc, editFile, editRequest, git, index, newRequest, ok, organized, project,
  req, write, writeConfig,
} from './helpers/project.js';
import { check } from './helpers/invoicer.js';
import { conclude, has, show, view, word } from './helpers/views.js';

const SPEC = 'specs/invoices.md';
const R1 = req('R1', 'Monthly CSV download', 'A user MUST be able to download one month as one CSV file.', [WORDS_FILE]);
const R2 = req('R2', 'An email link that expires', 'The link MUST stop working after a short time.', [WORDS_FILE]);
const INTRO = 'What the owner wants.';
const OUT = 'Out: tax reports.';
const ASSUMED = 'Assumed: one currency.';
const SECTION = organized([R1, R2], { intro: INTRO, tail: `\n${OUT}\n\n${ASSUMED}\n` });

// Main: the config and a spec with two rules. Branch feature: the request inv
// with R1 and R2, signed in S1; then INV-41 changed to serve inv/R1 and INV-42
// changed to serve inv/R2 (path 1), and indexed. Nothing else is not ok.
function signed(t) {
  const dir = project(t);
  writeConfig(dir);
  write(dir, SPEC, doc([
    ['INV-1 note', '# Invoices'],
    ['INV-41 rule', 'The export link MUST expire 30 minutes after the email is sent.'],
    ['INV-42 rule', 'An export MUST name the invoice number.'],
  ]));
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  newRequest(dir, 'inv');
  appendSection(dir, 'inv', SECTION);
  // #238 R3: a valid sign-off records the signer's words.
  ok(dir, ['record', 'inv', 'signoff', '--source', 'email from the owner', '--words', 'yes, R1 and R2', '--yes']);
  editFile(dir, SPEC, '<!-- INV-41 rule -->\n\nThe export link MUST expire 30 minutes',
    '<!-- INV-41 rule serves:inv/R1 -->\n\nThe export link MUST expire 20 minutes');
  editFile(dir, SPEC, '<!-- INV-42 rule -->\n\nAn export MUST name the invoice number.',
    '<!-- INV-42 rule serves:inv/R2 -->\n\nAn export MUST show the invoice number.');
  index(dir);
  return dir;
}

// The line of `al context inv` for a requirement, e.g. "  R1 version 1 (...): signed in S1".
const reqLine = (dir, id) => has(view(dir, ['context', 'inv']), new RegExp(`^  ${id} version \\d+ \\(`));
// The Serves line of `al context <ID>`.
const servesLine = (dir, id) => has(view(dir, ['context', id]), /^Serves /);
const coverage = (r, id) => r.findings.filter((f) => f.severity === 'not ok' && f.code === 'signoff-coverage' && f.id === id);

function signedIn(dir, s, ...ids) {
  for (const id of ids) {
    const line = reqLine(dir, id);
    assert.match(line, new RegExp(`: signed in ${s}$`), line);
  }
}
function changedSince(dir, s, ...ids) {
  for (const id of ids) {
    const line = reqLine(dir, id);
    assert.match(line, new RegExp(`: changed since ${s}$`), line);
    assert.doesNotMatch(line, /signed in/, line);
  }
}
// check --strict: exit 0 and no signoff-coverage at all.
function checkPasses(dir) {
  const r = check(dir, '--strict');
  assert.deepEqual(r.findings.filter((f) => f.code === 'signoff-coverage'), [], show(r));
  assert.equal(r.code, 0, show(r));
}
function wouldConclude(dir) {
  const r = conclude(dir, 'inv');
  assert.equal(r.code, 0, show(r));
  assert.deepEqual(r.refused, [], show(r));
  assert.equal(r.wrote, false, show(r));
  assert.match(r.stdout, /^Would conclude inv: /m, show(r));
}
// conclude refuses, a refused line names each of ids, and none names any of others.
function concludeRefuses(dir, ids, others = []) {
  const r = conclude(dir, 'inv');
  assert.equal(r.code, 1, show(r));
  assert.equal(r.wrote, false, show(r));
  assert.doesNotMatch(r.stdout, /^Would conclude/m, show(r));
  for (const id of ids) assert.ok(r.refused.some((l) => word(id).test(l)), `a refused line names ${id}:\n${show(r)}`);
  for (const id of others) assert.ok(!r.refused.some((l) => word(id).test(l)), `no refused line names ${id}:\n${show(r)}`);
}

test('control: with no change after S1, R1 and R2 are signed in S1, check --strict passes, conclude would conclude', (t) => {
  const dir = signed(t);
  signedIn(dir, 'S1', 'R1', 'R2');
  assert.match(servesLine(dir, 'INV-41'), /inv\/R1 version 1: signed in S1/);
  checkPasses(dir);
  wouldConclude(dir);
});

const FRAME = [
  ['the intro', INTRO, 'What the owner wants, for the accountants.'],
  ['the Out: text', OUT, 'Out: all exports.'],
  ['the Assumed: text', ASSUMED, 'Assumed: two currencies.'],
];

for (const [part, from, to] of FRAME) {
  test(`a change to ${part} after S1 unsigns R1 and R2 in context, check --strict and conclude`, (t) => {
    const dir = signed(t);
    editRequest(dir, 'inv', from, to);

    changedSince(dir, 'S1', 'R1', 'R2');
    for (const id of ['INV-41', 'INV-42']) {
      const line = servesLine(dir, id);
      assert.match(line, /changed since S1/, line);
      assert.doesNotMatch(line, /signed in/, line);
    }

    const r = check(dir, '--strict');
    for (const [id, at] of [['INV-41', 5], ['INV-42', 9]]) {
      const found = coverage(r, id);
      assert.equal(found.length, 1, `not ok signoff-coverage ${id}:\n${show(r)}`);
      assert.equal(found[0].file, SPEC, show(r));
      assert.equal(found[0].at, at, show(r));
    }
    assert.equal(r.code, 1, show(r));

    concludeRefuses(dir, ['INV-41', 'INV-42']);
  });
}

test('a new sign-off after the Out: change signs R1 and R2 again in S2: check --strict passes, conclude would conclude', (t) => {
  const dir = signed(t);
  editRequest(dir, 'inv', OUT, 'Out: all exports.');
  ok(dir, ['record', 'inv', 'signoff', '--source', 'call with the owner', '--words', 'yes, sign them again', '--yes']);
  signedIn(dir, 'S2', 'R1', 'R2');
  assert.match(servesLine(dir, 'INV-41'), /inv\/R1 version 1: signed in S2/);
  checkPasses(dir);
  wouldConclude(dir);
});

test('a change to R2 after S1 leaves R1 signed in S1: only INV-42, which serves R2, is not ok and refused', (t) => {
  const dir = signed(t);
  const R2b = req('R2', R2.title, 'The link MUST stop working after 30 minutes.', [WORDS_FILE]);
  editRequest(dir, 'inv', R2.text, R2b.text);
  index(dir);

  signedIn(dir, 'S1', 'R1');
  changedSince(dir, 'S1', 'R2');
  assert.match(servesLine(dir, 'INV-41'), /inv\/R1 version 1: signed in S1/);

  const r = check(dir, '--strict');
  assert.deepEqual(coverage(r, 'INV-41'), [], show(r));
  assert.equal(coverage(r, 'INV-42').length, 1, show(r));
  assert.equal(r.code, 1, show(r));

  concludeRefuses(dir, ['INV-42'], ['INV-41']);
});

// #238 R3: the new R3 has no sign-off, so check gives not ok
// unsigned-requirement inv/R3, and only that; R1 and R2 stay signed.
test('a new requirement R3 after S1 leaves R1 and R2 signed in S1: check --strict has no signoff-coverage, only unsigned-requirement inv/R3; conclude would conclude', (t) => {
  const dir = signed(t);
  const R3 = req('R3', 'ISO dates', 'Every date MUST be ISO 8601.');
  editRequest(dir, 'inv', `\n${OUT}`, `\n${R3.block}\n${OUT}`);
  index(dir);

  signedIn(dir, 'S1', 'R1', 'R2');
  const line = reqLine(dir, 'R3');
  assert.match(line, /: not signed$/, line);
  assert.match(servesLine(dir, 'INV-41'), /inv\/R1 version 1: signed in S1/);
  const r = check(dir, '--strict');
  assert.deepEqual(r.findings.filter((f) => f.code === 'signoff-coverage'), [], show(r));
  assert.deepEqual([...new Set(r.findings.filter((f) => f.severity === 'not ok').map((f) => `${f.code} ${f.id}`))],
    ['unsigned-requirement inv/R3'], show(r));
  assert.equal(r.code, 1, show(r));
  wouldConclude(dir);
});

test('a change to marker lines only after S1 changes nothing: R1 and R2 stay signed in S1', (t) => {
  const dir = signed(t);
  editRequest(dir, 'inv', `<!-- R1 from:${WORDS_FILE} -->`, '<!-- R1 -->');
  editRequest(dir, 'inv', `<!-- R2 from:${WORDS_FILE} -->`, '<!-- R2 -->');
  index(dir);
  signedIn(dir, 'S1', 'R1', 'R2');
  checkPasses(dir);
  wouldConclude(dir);
});
