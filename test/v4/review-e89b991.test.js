// Regression tests for the four findings of the review of e89b991 (#179,
// reviewer-179), each with its control, through the commands. Findings 1 and 2
// use states of the invoicer world (cases spaced-pre, remove-spaced*,
// abandon-decided-*); 3 and 4 use the cross-repo world of #185.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invoicer } from './helpers/invoicer.js';
import { blobSha, commit, rev, world } from './helpers/cross-repo.js';
import { git, read, readYaml, write, writeYaml } from './helpers/project.js';
import { conclude, has, hasNot, show, view, word } from './helpers/views.js';

const s7 = (sha) => sha.slice(0, 7);
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const refusesNaming = (r, id) => {
  assert.equal(r.code, 1, show(r));
  assert.equal(r.wrote, false, show(r));
  assert.ok(r.refused.some((l) => word(id).test(l)), `a refused line names ${id}:\n${show(r)}`);
};
const wouldConclude = (r, name) => {
  assert.equal(r.code, 0, show(r));
  assert.deepEqual(r.refused, [], show(r));
  assert.match(r.stdout, new RegExp(`^Would conclude ${name}: `, 'm'), show(r));
};

// --- 1. a promise removal whose marker had extra spaces (design.md 5)

test('1: INV-99 (marker "<!--   INV-99   limit   -->") removed on main earlier, R1 unsigned: conclude refuses on drop-spaced/SP-1', (t) => {
  const dir = invoicer(t, 'remove-spaced-merged-unsigned');
  assert.ok(!read(dir, 'specs/invoices.md').includes('INV-99'), 'INV-99 is gone');
  assert.ok(!git(dir, 'show', 'main:specs/invoices.md').includes('INV-99'), 'INV-99 is gone at main too');
  refusesNaming(conclude(dir, 'drop-spaced'), 'drop-spaced/SP-1');
});

test('1 control: the same removal merged earlier with R1 signed would conclude', (t) => {
  wouldConclude(conclude(invoicer(t, 'remove-spaced-merged-signed'), 'drop-spaced'), 'drop-spaced');
});

test('1: the same removal on the closing branch itself, R1 unsigned: conclude refuses on drop-spaced/SP-1', (t) => {
  refusesNaming(conclude(invoicer(t, 'remove-spaced', 'unsigned'), 'drop-spaced', '--yes'), 'drop-spaced/SP-1');
});

// --- 2. an owner decision to drop work with no kept effect (design.md 6)

test('2: a decision to drop SP-2, whose text never entered specs/: valid, no kept effect claimed, conclude would conclude', (t) => {
  const dir = invoicer(t, 'abandon-decided-dropped');
  const r = view(dir, ['context', 'csv-bom']);
  const line = has(r, word('SP-2'), /abandoned/);
  assert.doesNotMatch(line, /not valid/, show(r));
  hasNot(r, word('SP-2'), /\bkeeps?\b|\bkept\b/i);
  wouldConclude(conclude(dir, 'csv-bom'), 'csv-bom');
});

test('2 control: the same decision while SP-2\'s text is in specs/ (EXP-9) and R1 is unsigned: conclude refuses', (t) => {
  refusesNaming(conclude(invoicer(t, 'abandon-decided-kept'), 'csv-bom'), 'csv-bom/SP-2');
});

// --- 3. an output repo's review file named by a result is a check (design.md 9)

const REVIEW = 'reviews/monthly-export.md';

function withReview(t, { result }) {
  const w = world(t);
  write(w.web, REVIEW, 'Review of central:EXP-2: one month downloads as one CSV file. Passed.\n');
  const at = commit(w.web, 'Review the monthly export');
  if (result) {
    writeYaml(w.web, '.assuredloop/results/monthly-export-review.yaml',
      { check: REVIEW, outcome: 'pass', commit: at, inputs: [{ file: REVIEW, sha256: blobSha(w.web, at, REVIEW) }] });
    commit(w.web, 'Record the monthly export review');
  }
  return { w, at };
}

test('3: invoicer-web/reviews/monthly-export.md, named by a web result, is a check of EXP-2 with its Result line and coverage', (t) => {
  const { w, at } = withReview(t, { result: true });
  const r = view(w.central, ['context', 'EXP-2']);
  has(r, `invoicer-web/${REVIEW} cites it (at invoicer-web@${s7(rev(w.web, 'main'))})`);
  hasNot(r, /check/i, /\bnone\b/);
  has(r, /^\s*Result\b/, /invoicer-web/, new RegExp(`declared inputs unchanged since invoicer-web@${s7(at)}`));
  const c = view(w.central, ['context', 'invoice-exports']);
  assert.match(has(c, 'specs/exports.md', /\bExports\b/, /rules?,/), /\b2 rules, 1 with a check, 1 without\b/, show(c));
  has(c, word('EXP-2'), `invoicer-web/${REVIEW}`);
});

test('3 control: the same review file with no result naming it is no check, and is listed apart', (t) => {
  const { w } = withReview(t, { result: false });
  const r = view(w.central, ['context', 'EXP-2']);
  has(r, /check/i, /\bnone\b/);
  has(r, `invoicer-web/${REVIEW}`);
  hasNot(r, `invoicer-web/${REVIEW} cites it (at`);
  hasNot(r, /^\s*Result\b/);
});

// --- 4. task PR facts read main, then origin/main (design.md 8)

// The text after a PR reference on its Task line, up to the next PR reference.
function prFact(r, task, pr) {
  const line = has(r, /^Task\b/, new RegExp(`(?<![\\w-])${task}(?![\\w-])`));
  const m = new RegExp(`(?<![\\w#-])${esc(pr)}(?!\\d)`).exec(line);
  assert.ok(m, `the ${task} line names ${pr}:\n${line}`);
  const rest = line.slice(m.index + m[0].length);
  const next = /(?<![\w-])(?:[\w-]+)?#\d+/.exec(rest);
  return { line, fact: next ? rest.slice(0, next.index) : rest };
}

// The central repo with T1 also naming #10 (the adoption commit "... (#10)" on
// main) and #99, whose only commit is on the feature branch.
function featureClone(t, { origin }) {
  const w = world(t);
  const main = rev(w.central, 'main');
  const adopt = git(w.central, 'log', '--first-parent', '--format=%H', '--grep=(#10)$', 'main');
  if (origin) git(w.central, 'update-ref', 'refs/remotes/origin/main', main);
  git(w.central, 'branch', '-D', 'main');
  const rel = '.assuredloop/records/requests/invoice-exports.yaml';
  const rec = readYaml(w.central, rel);
  rec.tasks.find((x) => x.id === 'T1').prs.push('#10', '#99');
  writeYaml(w.central, rel, rec);
  const feature = commit(w.central, 'Prepare the monthly exports (#99)');
  return { w, adopt, feature };
}

test('4: no local main: a PR whose commit is only on the feature branch is not merged; "no merge found" names origin/main', (t) => {
  const { w, feature } = featureClone(t, { origin: true });
  const r = view(w.central, ['context', 'invoice-exports']);
  const { fact } = prFact(r, 'T1', '#99');
  assert.doesNotMatch(fact, /merged at/, show(r));
  assert.doesNotMatch(fact, new RegExp(s7(feature)), show(r));
  assert.match(fact, /no merge found/, show(r));
  assert.match(fact, /origin\/main/, show(r));
});

test('4 control: no local main: a PR whose squash commit is on origin/main is merged at its commit', (t) => {
  const { w, adopt } = featureClone(t, { origin: true });
  const r = view(w.central, ['context', 'invoice-exports']);
  assert.match(prFact(r, 'T1', '#10').fact, new RegExp(`merged at ${s7(adopt)}`), show(r));
});

test('4: no main and no origin/main: the Task line says the merge facts were read without a main branch, never a plain merged at', (t) => {
  const { w } = featureClone(t, { origin: false });
  const r = view(w.central, ['context', 'invoice-exports']);
  for (const pr of ['#10', '#99']) {
    const { line } = prFact(r, 'T1', pr);
    assert.match(line, /without a main|no main/i, `${pr}: the line states the limit:\n${show(r)}`);
  }
});
