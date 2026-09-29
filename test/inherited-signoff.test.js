// Validation fixes, PR 5 (tier 0), [REC-5]: a child request that copies
// some of its parent's signed requirements word for word inherits the
// parent's latest sign-off for them, and nothing makes that depend on the
// parent staying open.
// #99: the inheritance holds after the parent is concluded or dropped; when
// an open and an archived request both name the child in their Parts, the
// open one is the parent.
// #103 [VW-4]: the review intent says an inheriting child is signed, and
// shows the child's own parts, each with its source ("through <parent>,
// origin/<file>"), not the parent's whole signed text.
// And check's "reached main before its first sign-off" note takes the
// parent's sign-off as an inheriting child's first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { ENV, addRequest, both } from './helpers/request.js';
import { assertDiffFrame, contextDiff, indexOf } from './helpers/links.js';
import { check, hint, message, noHint } from './helpers/hints.js';

const TIER1 = 'Type: story · Tier: 1 · Status: open';
const R1 = '### R1 Invoice export\nA customer MUST be able to export one invoice as CSV from the invoice page.\n';
const R2 = '### R2 Date format\nDates in the export MUST use ISO 8601.\n';
const R3 = '### R3 Email link\nThe invoice email MUST carry a link to the same CSV download.\n';
const ORG = `## Organized requirement\n\n${R1}\n${R2}\n${R3}\nOut: PDF export.\n`;
const ORG_B = ORG.replace('as CSV from the invoice page', 'as CSV or PDF from the invoice page');
const PARTS = '\n## Parts\n\n1. request child\n';
const D1 = '\n## Decisions\n\n- D1, 2026-09-22. Source: the owner. Drop the parent.\n';
// The child copies the parent's R3 word for word, as its R1.
const COPIED = `## Organized requirement\n\n${R3.replace('### R3', '### R1')}\nOut: PDF export.\n`;

const al = (repo, ...args) => runAl(repo.dir, args, { env: ENV });
const ok = (r, what) => assert.equal(r.code, 0, `${what}:\n${both(r)}`);

// The signed parent `name` (text `org`, Parts naming child, decisions
// `decisions`), in `dir`.
function parent(repo, { name = 'parent', org = ORG, dir = `requests/${name}`, status = 'open', decisions = '' } = {}) {
  addRequest(repo, name, null, { dir, status, line: TIER1.replace('open', status), org, signedText: org, decisions, rest: PARTS });
}
// The child, unsigned and with no Signed off line, holding `org`.
function child(repo, org = ORG) {
  addRequest(repo, 'child', null, { line: TIER1, org, signed: false, decisions: '' });
  const md = 'requests/child/request.md';
  repo.write(md, repo.read(md).toString().replace(/^Signed off: .*\n/m, ''));
}
function context(repo, name) {
  const r = al(repo, 'context', name);
  ok(r, `context ${name}`);
  return r.stdout;
}
function assertInherits(out, from) {
  assert.doesNotMatch(lines(out)[0], /^BLOCKED/, `the child inherits the sign-off:\n${out}`);
  assert.ok(lines(out).some((l) => /^Require\b/.test(l) && l.includes(from)), `the Require line names ${from}:\n${out}`);
}

// --- #99: the parent concluded, dropped, or archived beside an open one ---

test('#99 [REC-5] after al conclude parent --yes, the child still reads signed through parent, not BLOCKED; conclude child is not refused for sign-off', (t) => {
  const repo = makeRepo(t);
  parent(repo);
  child(repo);
  repo.commit('parent and child', { date: '2026-09-21T12:00:00Z' });
  assertInherits(context(repo, 'child'), 'parent');
  ok(al(repo, 'conclude', 'parent', '--yes'), 'conclude parent');
  repo.commit('Conclude parent', { date: '2026-09-22T12:00:00Z' });
  assertInherits(context(repo, 'child'), 'parent');
  const r = al(repo, 'conclude', 'child');
  assert.equal(r.code, 0, `conclude child (a preview) is not refused:\n${both(r)}`);
});

test('#99 [REC-5] a parent concluded --dropped D1 still passes its signed words down: the child reads signed through parent', (t) => {
  const repo = makeRepo(t);
  parent(repo, { decisions: D1 });
  child(repo);
  repo.commit('parent and child', { date: '2026-09-21T12:00:00Z' });
  ok(al(repo, 'conclude', 'parent', '--dropped', 'D1', '--yes'), 'conclude parent --dropped');
  repo.commit('Drop parent', { date: '2026-09-22T12:00:00Z' });
  assertInherits(context(repo, 'child'), 'parent');
});

// The open request p-open (signed ORG) and the archived p-old (signed
// ORG_B) both name child in their Parts; the child holds `org`.
function twoParents(t, org) {
  const repo = makeRepo(t);
  parent(repo, { name: 'p-open', org: ORG });
  parent(repo, { name: 'p-old', org: ORG_B, dir: 'requests/archive/p-old', status: 'concluded' });
  child(repo, org);
  repo.commit('Two parents and a child', { date: '2026-09-21T12:00:00Z' });
  return repo;
}

test('#99 [REC-5] an open and an archived request both name the child: the open one is the parent; a child copying its text reads signed through p-open', (t) => {
  assertInherits(context(twoParents(t, ORG), 'child'), 'p-open');
});

test('#99 [REC-5] an open and an archived request both name the child: a child copying only the archived one\'s text is BLOCKED', (t) => {
  const out = context(twoParents(t, ORG_B), 'child');
  assert.match(lines(out)[0], /^BLOCKED/, `the archived p-old is not the parent while the open p-open names the child:\n${out}`);
});

// --- #103: the review intent for an inheriting child ---

// Main: the open signed parent (Parts: request child) and child holding
// `org`, unsigned. The branch commits child work with `Request: child`.
function reviewed(t, org) {
  const repo = makeRepo(t);
  parent(repo);
  child(repo, org);
  repo.commit('parent and child', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('src/email.js', 'export const link = (inv) => `/invoices/${inv.id}.csv`;\n');
  repo.commit(message('The email link', { request: 'child', tier: '1 — email link' }), { date: '2026-09-22T12:00:00Z' });
  return intentOf(repo);
}
// The review view's Intent part, up to its Evidence part.
function intentOf(repo) {
  const r = contextDiff(repo, 'main...HEAD', '--for', 'review');
  ok(r, 'context --diff --for review');
  assertDiffFrame(r.stdout);
  const ls = lines(r.stdout);
  const i = indexOf(ls, /^[#\s]*Intent\b/i);
  const e = indexOf(ls, /^[#\s]*Evidence\b/i, i + 1);
  assert.ok(i >= 0 && e > i, `an Intent part, then an Evidence part:\n${r.stdout}`);
  return { out: r.stdout, intent: ls.slice(i, e).join('\n') };
}

test('#103 [VW-4][REC-5] --for review, a child signed through its parent: the intent does not say "not signed off"; it shows the child\'s R1 with its source, through parent, origin/2026-09-21-signoff.md', (t) => {
  const { intent } = reviewed(t, COPIED);
  assert.doesNotMatch(intent, /not signed off/i, `the child is signed through its parent:\n${intent}`);
  assert.ok(intent.split('\n').some((l) => /\bR1\b/.test(l) && l.includes('through parent') && l.includes('origin/2026-09-21-signoff.md')),
    `a line for R1 with its source, through parent, origin/2026-09-21-signoff.md:\n${intent}`);
});

test('#103 [VW-4] --for review, a child signed through its parent: the intent does not show the parent\'s whole signed text (its R1 and R2, which the child did not copy)', (t) => {
  const { intent } = reviewed(t, COPIED);
  for (const text of ['A customer MUST be able to export one invoice as CSV', 'Dates in the export MUST use ISO 8601.']) {
    assert.ok(!intent.includes(text), `the parent's text the child did not copy is not shown:\n${intent}`);
  }
});

test('#103 [VW-4] contrast: a child whose text is not in the parent\'s is really unsigned: the intent says not signed off', (t) => {
  const own = '## Organized requirement\n\n### R1 Link expiry\nThe link MUST work for 30 days.\n';
  const { intent } = reviewed(t, own);
  assert.match(intent, /not signed off/i, intent);
});

// --- check: an inheriting child's first sign-off is its parent's ---

test('[REC-10][HNT-2] check: child work that reached main after the parent\'s sign-off, the child having none of its own, is not "before its first sign-off"', (t) => {
  const repo = makeRepo(t);
  parent(repo);
  repo.commit('parent, signed', { date: '2026-09-20T12:00:00Z' });
  child(repo, COPIED);
  repo.commit('child: request', { date: '2026-09-21T12:00:00Z' });
  repo.write('src/email.js', 'export const link = 1;\n');
  repo.commit(message('The email link', { request: 'child', tier: '1 — email link' }), { date: '2026-09-22T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('src/email.js', 'export const link = 2;\n');
  repo.commit(message('The email link, again', { request: 'child', tier: '1 — email link' }), { date: '2026-09-23T12:00:00Z' });
  assertInherits(context(repo, 'child'), 'parent');
  noHint(check(repo, '--all'), 'before its first sign-off');
});

// --- PR #120 review ---

test('PR #120 [REC-5][HNT-2] a parent\'s sign-off counts for a child only where the child inherits it: a child with entirely its own text, whose code reached main before its own sign-off, gets the note "before its first sign-off"', (t) => {
  const own = '## Organized requirement\n\n### R1 Link expiry\nThe link MUST work for 30 days.\n\nOut: renewal.\n\nAssumed:\n- one link per invoice.\n';
  const repo = makeRepo(t);
  parent(repo);
  repo.commit('parent, signed', { date: '2026-09-20T12:00:00Z' });
  child(repo, own);
  repo.commit('child: request', { date: '2026-09-21T12:00:00Z' });
  repo.write('src/expiry.js', 'export const days = 30;\n');
  const early = repo.commit(message('Link expiry', { request: 'child', tier: '1 — expiry' }), { date: '2026-09-22T12:00:00Z' });
  ok(al(repo, 'record', 'child', 'signoff', '--source', 'chat with the owner', '--yes'), 'record child signoff');
  repo.commit(message('Sign off child', { request: 'child', tier: '1 — expiry' }), { date: '2026-09-23T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'more']);
  repo.write('src/expiry.js', 'export const days = 31;\n');
  repo.commit(message('Link expiry, again', { request: 'child', tier: '1 — expiry' }), { date: '2026-09-24T12:00:00Z' });
  hint(check(repo, '--all'), 'note', 'before its first sign-off', early.slice(0, 7));
});

// Main: the request promise, signed with R1 "The promise MUST hold.". The
// branch changes R1 to "The promise MUST now change." and commits code with
// `Request: promise`.
function changedOnBranch(t) {
  const org = '## Organized requirement\n\n### R1 The promise\nThe promise MUST hold.\n\nOut: none.\n';
  const repo = makeRepo(t);
  addRequest(repo, 'promise', null, { line: TIER1, org, signedText: org, decisions: '' });
  repo.commit('promise: request, signed', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  const md = 'requests/promise/request.md';
  repo.write(md, repo.read(md).toString().replace('The promise MUST hold.', 'The promise MUST now change.'));
  repo.write('src/promise.js', 'export const promise = "change";\n');
  repo.commit(message('The promise changes', { request: 'promise', tier: '1 — promise' }), { date: '2026-09-22T12:00:00Z' });
  return repo;
}

test('PR #120 [VW-4][REC-6] --for review, a request whose organized text changed on the branch since its intact sign-off: the intent says it is blocked, with its reason, and keeps the last signed text verbatim with its file', (t) => {
  const { intent } = intentOf(changedOnBranch(t));
  assert.match(intent, /\bblocked\b/i, `the intent says blocked:\n${intent}`);
  assert.match(intent, /changed since/i, `with its reason:\n${intent}`);
  assert.ok(intent.includes('The promise MUST hold.'), `the last signed text, verbatim:\n${intent}`);
  assert.ok(intent.includes('origin/2026-09-21-signoff.md'), `the sign-off file:\n${intent}`);
});

test('PR #120 [VW-4][REC-5] --for review, a blocked child with an inherited part and an unsigned own part: the intent says blocked and still shows R1 through parent, origin/2026-09-21-signoff.md', (t) => {
  const org = `## Organized requirement\n\n${R3.replace('### R3', '### R1')}\n### R2 Link expiry\nThe link MUST work for 30 days.\n\nOut: PDF export.\n`;
  const { intent } = reviewed(t, org);
  assert.match(intent, /\bblocked\b|not signed off/i, `the child is blocked by its unsigned R2:\n${intent}`);
  assert.ok(intent.split('\n').some((l) => /\bR1\b/.test(l) && l.includes('through parent') && l.includes('origin/2026-09-21-signoff.md')),
    `R1 with its source, through parent, origin/2026-09-21-signoff.md:\n${intent}`);
});
