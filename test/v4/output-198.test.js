// Output bugs of #198 (T16 report, section 6, gaps 3 and 5; design.md 5 "Path
// 1 and adoption", 7). Output only: what is checked and refused stays.
// 1. On a path-1 request (no change spec; the PR edits specs/ directly),
//    `al-v4 conclude <name> --yes` writes an Outcome that names, for each
//    requirement R<n>, the spec paragraphs whose marker says
//    `serves:<name>/R<n>`. A requirement that nothing serves still says so.
// 2. `al-v4 check` ends with a Next line. When no `not ok` line printed,
//    Next does not tell the user to fix a not ok; it names what to do for
//    what printed. When a `not ok` printed, Next still says to fix it.
// Only the command, its output and the files it writes are read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invoicer, check } from './helpers/invoicer.js';
import { world } from './helpers/cross-repo.js';
import { al, baseProject, editFile, git, write, newRequest, ok, organized, appendSection, read, req, show } from './helpers/project.js';
import { word } from './helpers/views.js';

// --- 1. the path-1 Outcome

const NAME = 'invoice-copies';

// The world of d01 control: on the branch pr, specs/invoices.md has INV-6
// serves:small-remainders/R1 and INV-13 serves:invoice-numbers/R1, both of
// other requests. Here a new path-1 request, signed, whose R1 is served by
// INV-10 and INV-11, R2 by INV-4, and R3 by nothing.
function pathOne(t) {
  const dir = invoicer(t, 'd01', 'control');
  newRequest(dir, NAME, 'send copies of invoices, and keep the limit.\n', ['--tier', '1']);
  appendSection(dir, NAME, organized([
    req('R1', 'Copies of each invoice', 'Invoicer MUST send a copy of each invoice to the business.'),
    req('R2', 'The limit stays', 'The limit on invoices stays as it is.'),
    req('R3', 'A later wish', 'Something that no spec paragraph serves yet.'),
  ]));
  ok(dir, ['record', NAME, 'signoff', '--source', 'the project chat', '--words', 'ok sign', '--yes']);
  editFile(dir, 'specs/invoices.md', '<!-- INV-10 rule -->', `<!-- INV-10 rule serves:${NAME}/R1 -->`);
  editFile(dir, 'specs/invoices.md', '<!-- INV-11 rule -->', `<!-- INV-11 rule serves:${NAME}/R1 -->`);
  editFile(dir, 'specs/invoices.md', '<!-- INV-4 limit -->', `<!-- INV-4 limit serves:${NAME}/R2 -->`);
  ok(dir, ['index']);
  return dir;
}

// The Outcome of the archived request, after a conclude --yes that concluded.
function concludedOutcome(dir) {
  const r = al(dir, ['conclude', NAME, '--yes']);
  assert.equal(r.code, 0, show(r));
  assert.doesNotMatch(r.stdout, /^refused: /m, show(r));
  const md = read(dir, `requests/archive/${NAME}/request.md`);
  const at = md.indexOf('## Outcome');
  assert.ok(at >= 0, `an Outcome section:\n${md}`);
  return md.slice(at);
}

// The Outcome's item for a requirement: its "- R<n> ..." line and the lines
// under it, up to the next top-level "- " item.
function item(outcome, id) {
  const ls = outcome.split('\n');
  const at = ls.findIndex((l) => new RegExp(`^- ${id}\\b`).test(l));
  assert.ok(at >= 0, `an Outcome item for ${id}:\n${outcome}`);
  let end = ls.findIndex((l, i) => i > at && /^(- |#)/.test(l));
  if (end < 0) end = ls.length;
  return ls.slice(at, end).join('\n');
}

const NOTHING = /\b(no|nothing)\b[^\n]*\bserves? it\b/i;

test('path 1: the Outcome names the spec paragraphs that serve each requirement', (t) => {
  const outcome = concludedOutcome(pathOne(t));
  const r1 = item(outcome, 'R1');
  for (const id of ['INV-10', 'INV-11']) assert.match(r1, word(id), `R1 names ${id}, which serves:${NAME}/R1:\n${outcome}`);
  assert.doesNotMatch(r1, NOTHING, `R1 is served, by INV-10 and INV-11:\n${outcome}`);
  assert.doesNotMatch(r1, word('INV-4'), `INV-4 serves R2, not R1:\n${outcome}`);
  const r2 = item(outcome, 'R2');
  assert.match(r2, word('INV-4'), `R2 names INV-4, which serves:${NAME}/R2:\n${outcome}`);
  assert.doesNotMatch(r2, NOTHING, `R2 is served, by INV-4:\n${outcome}`);
  for (const id of ['INV-10', 'INV-11']) assert.doesNotMatch(r2, word(id), `${id} serves R1, not R2:\n${outcome}`);
  for (const id of ['INV-6', 'INV-13']) {
    assert.doesNotMatch(outcome, word(id), `${id} serves another request's R1:\n${outcome}`);
  }
});

test('path 1 control: a requirement that no spec paragraph serves still says that nothing serves it', (t) => {
  const outcome = concludedOutcome(pathOne(t));
  const r3 = item(outcome, 'R3');
  assert.match(r3, NOTHING, `R3 has no paragraph that serves it:\n${outcome}`);
  assert.doesNotMatch(r3, /\bINV-\d+\b/, `R3 names no spec paragraph:\n${outcome}`);
});

// --- 2. the Next line of al-v4 check

function nextLine(r) {
  const ls = r.stdout.replace(/\n+$/, '').split('\n');
  const next = ls.at(-2) ?? '';
  assert.match(next, /^Next {6}\S/, `the second last line is Next:\n${show(r)}`);
  return next;
}
const printsNotOk = (r) => r.findings.some((f) => f.severity === 'not ok');
const printsHint = (r) => r.findings.some((f) => f.severity === 'hint');

test('check: when the only findings are marker hints (no-link), Next does not say to fix a not ok', (t) => {
  // A spec with promise paragraphs and no links: three hints no-link, no not ok.
  const r = check(baseProject(t));
  assert.equal(r.code, 0, show(r));
  assert.ok(printsHint(r) && !printsNotOk(r), `hints only:\n${show(r)}`);
  const next = nextLine(r);
  assert.doesNotMatch(next, /not ok/i, `no not ok printed:\n${show(r)}`);
  assert.match(next, /\bhints?\b/, `Next names what to do for the hints:\n${show(r)}`);
});

test('check: when the only hint is from the records (stale-base, d07 defect), Next does not say to deal with a not ok', (t) => {
  const r = check(invoicer(t, 'd07', 'defect'));
  assert.equal(r.code, 0, show(r));
  assert.ok(printsHint(r) && !printsNotOk(r), `hints and info only:\n${show(r)}`);
  const next = nextLine(r);
  assert.doesNotMatch(next, /not ok/i, `no not ok printed:\n${show(r)}`);
  assert.match(next, /\bhints?\b/, `Next names what to do for the hint:\n${show(r)}`);
});

test('check control: when a not ok prints, Next still says to fix it', (t) => {
  // The same hints, raised to not ok by --strict.
  const strict = check(baseProject(t), '--strict');
  assert.ok(printsNotOk(strict), show(strict));
  assert.match(nextLine(strict), /not ok/, `a not ok printed:\n${show(strict)}`);
  // A marker hint with a not ok from the records (adoption-gap new).
  const mixed = check(invoicer(t, 'adoption-gap', 'new'));
  assert.ok(printsNotOk(mixed) && printsHint(mixed), show(mixed));
  assert.match(nextLine(mixed), /not ok/, `a not ok printed:\n${show(mixed)}`);
  // A not ok from the records only (d01 defect: signoff-coverage).
  const records = check(invoicer(t, 'd01', 'defect'));
  assert.ok(printsNotOk(records), show(records));
  assert.match(nextLine(records), /not ok/, `a not ok printed:\n${show(records)}`);
});

// --- 2, in an output repo: the hint for a central ID that does not resolve
// (review of PR #203). invoicer-web of the cross-repo world, on a branch
// feature cut from main, with docs/feature.md written and not committed (so
// no path-claim hint prints: the branch has no commit).

function outputBranch(t, line) {
  const w = world(t);
  git(w.web, 'checkout', '-q', '-b', 'feature');
  write(w.web, 'docs/feature.md', `# Feature\n\n${line}\n`);
  return { w, r: check(w.web), strict: check(w.web, '--strict') };
}
const cites = (r) => r.stdout.split('\n').filter((l) => /^(info cites|hint unresolved-central) /.test(l));

test('check in an output repo: when the only hint is unresolved-central, Next names the hint', (t) => {
  const { r, strict } = outputBranch(t, 'The link requires central:EXP-20.');
  assert.ok(cites(r).some((l) => l.startsWith('hint unresolved-central docs/feature.md:3 central:EXP-20 ')), show(r));
  assert.ok(!printsNotOk(r), `no not ok:\n${show(r)}`);
  assert.deepEqual(r.findings.filter((f) => f.severity === 'hint').map((f) => f.code), ['unresolved-central'], `the only hint:\n${show(r)}`);
  assert.equal(r.code, 0, show(r));
  assert.equal(strict.code, 0, `the hint stays a hint under --strict; the exit does not change:\n${show(strict)}`);
  const next = nextLine(r);
  assert.doesNotMatch(next, /not ok/i, `no not ok printed:\n${show(r)}`);
  assert.match(next, /\bhints?\b/, `Next names what to do for the hint:\n${show(r)}`);
});

test('check in an output repo control: a central ID that resolves prints no hint, and Next asks for nothing on a hint', (t) => {
  const { r, strict } = outputBranch(t, 'The link follows central:EXP-4.');
  assert.ok(cites(r).some((l) => l.startsWith('info cites docs/feature.md:3 central:EXP-4 ')), `the lookup ran:\n${show(r)}`);
  assert.ok(!cites(r).some((l) => l.startsWith('hint unresolved-central ')), show(r));
  assert.equal(r.code, 0, show(r));
  assert.equal(strict.code, 0, show(strict));
  assert.ok(!printsHint(r) && !printsNotOk(r), `no hint and no not ok:\n${show(r)}`);
  assert.doesNotMatch(nextLine(r), /\bhints?\b|not ok/i, `nothing to deal with printed:\n${show(r)}`);
});
