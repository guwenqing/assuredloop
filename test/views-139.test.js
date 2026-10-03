// Issue #139: the review and audit views show less, or something different,
// from what the records hold. Through the real CLI:
// (1) [VW-4] the review evidence reads Amends: for a tier-1 requirement, and
// says what was searched when nothing is found; (2) [VW-4] a file changed in
// a commit that maps to a served request is not Unlinked; (3) [VW-4][VW-2]
// the review Blocks line names every block's section ID, and a tier-1
// request's changed sections; (4) [VW-4] the review serves what check
// serves; (5) [VW-7][STA-8][VW-6] the audit has Section lines for a tier-1
// request and never re-judges an archived block against today's baseline;
// (6) [VW-7][REC-5] the audit of an inheriting child shows its sign-off
// through the parent; (7) [VW-5] a consolidated "remove, was first in
// <path>" shows under that file in al spec --list; (8) [VW-4][REC-10][REC-11]
// a section moved unchanged between files is shown once, as a move, by
// context --diff, its review mode and check's Evidence; (9) [HNT-2] an open
// request's Amends: citing an unknown ID is not ok; (11) [VW-9] context
// --diff says its results come from the working tree; (12) [VW-3] context
// <ID> of an uncommitted section says so instead of an empty Shaped by line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, runAl } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { ENV, ORG, addRequest, both, hasId, lineWith, statusLine } from './helpers/request.js';
import { assertDiffFrame, contextDiff, contextOf, file, indexOf, labelled, says, squashMerge } from './helpers/links.js';
import { check, hint, message } from './helpers/hints.js';
import { short } from './helpers/evidence.js';

const al = (repo, ...args) => runAl(repo.dir, args, { env: ENV });
const ok = (r, what = '') => assert.equal(r.code, 0, `${what}\n${both(r)}`);
const startingWith = (out, label) => lines(out).find((l) => new RegExp(`^${label}\\b`).test(l));
const TIER1 = 'Type: story · Tier: 1 · Status: open';
const oneLine = (...rs) => `## Organized requirement\n\n${rs.join('\n')}\n`;

// The IDs a text names, an en-dash run such as INV-11–18 read as each ID in it.
function idsIn(text) {
  const out = new Set();
  for (const m of text.matchAll(/\b([A-Z][A-Z0-9]*-(?:\d+\.)*)(\d+)(?:@\d+)?(?:–(\d+))?/g)) {
    for (let n = Number(m[2]); n <= Number(m[3] ?? m[2]); n++) out.add(`${m[1]}${n}`);
  }
  return out;
}
// The state a Blocks line gives `id`: in the grouped form "<count> <state>:
// <ids>", its group's state; else whether `says` pairs it with `state`.
function blockSays(line, id, state) {
  const groups = line.replace(/^Blocks\s+/, '').split(' · ').map((g) => g.match(/^(\d+) (.+?): (.+)$/));
  if (groups.every(Boolean)) return groups.some((g) => g[2] === state && idsIn(g[3]).has(id));
  return says(line, id, state);
}

// The review view split at its Intent and Evidence lines.
function review(repo) {
  const r = contextDiff(repo, 'main...HEAD', '--for', 'review');
  ok(r, 'context --diff main...HEAD --for review');
  assertDiffFrame(r.stdout);
  const ls = lines(r.stdout);
  const i = indexOf(ls, /^[#\s]*Intent\b/i);
  assert.ok(i >= 0, `expected an Intent line or header:\n${r.stdout}`);
  const e = indexOf(ls, /^[#\s]*Evidence\b/i, i + 1);
  assert.ok(e > i, `expected an Evidence line or header after the Intent one:\n${r.stdout}`);
  return { out: r.stdout, intent: ls.slice(i, e), evidence: ls.slice(e) };
}
const blocksLine = (out, intent) => {
  const b = labelled(intent.join('\n'), 'Blocks');
  assert.ok(b, `expected a Blocks line in the intent part:\n${out}`);
  return b;
};

// --- (1) and (3): a tier-1 request in the review view ---

const A1 = '## [A-1] Promise\nThe promise MUST say old.\n';
const A1B = '## [A-1] Promise\nThe promise MUST say new.\n';
const A2 = '## [A-2] Order\nThe order MUST be old.\n';
const PROMISE = (word) => `// [A-1] Promise\nexport const promise = '${word}';\n`;

// Main: specs/rules.md with A-1 and A-2 and the signed tier-1 request
// promise (R1 amends A-1, R2 amends A-2; no change.md), then src/promise.js
// under an [A-1] marker in a commit of its own, so it never changed together
// with A-2. The branch changes A-1 in a commit with "Request: promise", then
// src/promise.js under its marker in a commit with no Request line, so only
// the [A-1] marker links it.
function tierOne(t) {
  const repo = makeRepo(t);
  repo.write('specs/rules.md', file(A1, A2));
  const org = oneLine('R1: The promise MUST say new. Amends: [A-1]', 'R2: The order MUST stay old. Amends: [A-2]');
  addRequest(repo, 'promise', null, { line: TIER1, org, signedText: org, decisions: '' });
  repo.commit('Baseline and request', { date: '2026-09-21T12:00:00Z' });
  repo.write('src/promise.js', PROMISE('old'));
  repo.commit('Promise code', { date: '2026-09-21T13:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'promise']);
  repo.write('specs/rules.md', file(A1B, A2));
  repo.commit(message('The promise says new', { request: 'promise', tier: '1 — promise' }), { date: '2026-09-22T12:00:00Z' });
  repo.write('src/promise.js', PROMISE('new'));
  repo.commit(message('Code for the new promise', { tier: '1 — promise' }), { date: '2026-09-22T13:00:00Z' });
  return repo;
}

test('#139 (1) [VW-4][REC-4] --for review, evidence of a tier-1 request: R1, "Amends: [A-1]", lists src/promise.js, changed under its [A-1] marker; src/promise.js is not on the Unlinked line', (t) => {
  const { out, evidence } = review(tierOne(t));
  const r1 = indexOf(evidence, /\bR1\b/);
  const r2 = indexOf(evidence, /\bR2\b/, r1 + 1);
  assert.ok(r1 >= 0 && r2 > r1, `the evidence part lists R1, then R2:\n${out}`);
  assert.ok(evidence.slice(r1 + 1, r2).some((l) => l.includes('src/promise.js')), `R1's evidence names src/promise.js, which names [A-1]:\n${out}`);
  const unlinked = labelled(evidence.join('\n'), 'Unlinked');
  assert.ok(unlinked, `expected an Unlinked line:\n${out}`);
  assert.ok(!unlinked.includes('src/promise.js'), `src/promise.js names [A-1], which promise amends; it is not unlinked:\n${out}`);
});

test('#139 (1) [VW-4] --for review, evidence: R2, with no linked file, says what was searched ("no linked code or test file among the changed files"), not a bare "none found"', (t) => {
  const { out, evidence } = review(tierOne(t));
  const r2 = indexOf(evidence, /\bR2\b/);
  const end = indexOf(evidence, /^Unlinked\b/, r2 + 1);
  assert.ok(r2 >= 0 && end > r2, `the evidence part lists R2, then the Unlinked line:\n${out}`);
  const part = evidence.slice(r2, end).join('\n');
  assert.ok(part.includes('no linked code or test file among the changed files'), `R2 says what was searched:\n${out}`);
  assert.ok(!part.includes('none found'), `not a bare "none found":\n${out}`);
});

test('#139 (3) [VW-4] --for review, intent of a tier-1 request (no change.md) that amends A-1, which the branch changes: the Blocks line names A-1, not "none changed"', (t) => {
  const { out, intent } = review(tierOne(t));
  const b = blocksLine(out, intent);
  assert.ok(hasId(b, 'A-1'), `the Blocks line names A-1, changed for promise:\n${out}`);
  assert.ok(!b.includes('none changed'), `the branch changed A-1 for promise:\n${out}`);
});

// --- (3) eight consolidated blocks ---

const W = (n) => `## [INV-${n}] Rule ${n}\nRule ${n} holds.\n`;
const N = (n) => `## [INV-${n}] Rule ${n}\nRule ${n} MUST hold.\n`;

test('#139 (3) [VW-4][VW-2] --for review, intent: eight blocks the branch consolidates are each named on the Blocks line with their state, none left out', (t) => {
  const ns = [11, 12, 13, 14, 15, 16, 17, 18];
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(...ns.map(W)));
  addRequest(repo, 'big-change', ns.map((n) => block(`[INV-${n}]@1 modify   for R1`, { was: W(n), now: N(n) })));
  repo.commit('Records', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'big']);
  repo.write('specs/invoices.md', file(...ns.map(N)));
  repo.commit(message('Eight rules', { request: 'big-change', tier: '2 — big-change' }), { date: '2026-09-22T12:00:00Z' });

  const { out, intent } = review(repo);
  const b = blocksLine(out, intent);
  for (const n of ns) assert.ok(blockSays(b, `INV-${n}`, 'consolidated'), `the Blocks line names INV-${n}, consolidated:\n${out}`);
});

// --- (2) a file changed in a served request's commit ---

test('#139 (2) [VW-4][LNK-2] --for review: src/new.js, created in a commit with "Request: t2", is not Unlinked; src/stray.js, from a commit with no request, is', (t) => {
  const B1 = '## [B-1] Rule\nThe rule holds.\n';
  const B1B = '## [B-1] Rule\nThe rule MUST hold.\n';
  const repo = makeRepo(t);
  repo.write('specs/rules.md', B1);
  addRequest(repo, 't2', [block('[B-1]@1 modify   for R1', { was: B1, now: B1B })]);
  repo.commit('Records', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('specs/rules.md', B1B);
  repo.write('src/new.js', 'export const fresh = true;\n');
  repo.commit(message('The rule, and its code', { request: 't2', tier: '2 — t2' }), { date: '2026-09-22T12:00:00Z' });
  repo.write('src/stray.js', 'export const stray = true;\n');
  repo.commit(message('A stray file', { tier: '2 — t2' }), { date: '2026-09-22T13:00:00Z' });

  const { out, evidence } = review(repo);
  const unlinked = labelled(evidence.join('\n'), 'Unlinked');
  assert.ok(unlinked, `expected an Unlinked line:\n${out}`);
  assert.ok(unlinked.includes('src/stray.js'), `the fixture: src/stray.js maps to no request, and is unlinked:\n${out}`);
  assert.ok(!unlinked.includes('src/new.js'), `src/new.js came in a commit of t2, a served request:\n${out}`);
});

// --- (4) the review serves what check serves ---

test('#139 (4) [VW-4][LNK-2] a "Request: a" commit that edits requests/b/: check serves a and b, and so does the review view\'s Serves line', (t) => {
  const repo = makeRepo(t);
  addRequest(repo, 'a', null, { decisions: '' });
  addRequest(repo, 'b', null, { decisions: '' });
  repo.commit('Records', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('src/a.js', 'export const a = 1;\n');
  const md = 'requests/b/request.md';
  repo.write(md, `${repo.read(md).toString()}\n## Decisions\n\n- D1, 2026-09-22. Source: the owner. CSV only for now.\n`);
  repo.commit(message('Work for a, a decision for b', { request: 'a', tier: '2 — a' }), { date: '2026-09-22T12:00:00Z' });

  // The request n as a whole name on the Serves line.
  const serving = (line, n) => new RegExp(`(^Serves\\s+|[^\\w-])${n}\\b(?!-)`).test(line ?? '');
  const served = startingWith(check(repo), 'Serves');
  assert.ok(serving(served, 'a') && serving(served, 'b'), `the fixture: check serves a and b:\n${served}`);
  const { out } = review(repo);
  const serves = startingWith(out, 'Serves');
  assert.ok(serves, `expected a Serves line:\n${out}`);
  for (const n of ['a', 'b']) assert.ok(serving(serves, n), `the review serves ${n}, as check does:\n${out}`);
});

// --- (5) the audit of a tier-1 request, and of an archived one changed since ---

const VW1 = '## [VW-1] Where the project stands\n`al context` MUST list the open requests.\n';
const VW2 = '## [VW-2] Where a request stands\n`al context <name>` MUST print twelve lines or fewer.\n';
const VW2B = '## [VW-2] Where a request stands\n`al context <name>` MUST print twelve lines or fewer, grouped.\n';
const VW6 = '## [VW-6] Archived requests\nAn archived request MUST show each of its sections.\n';
const VW6B = '## [VW-6] Archived requests\nAn archived request MUST show each of its sections, grouped.\n';

// As tier1-archive.test.js: the signed tier-1 request grouping (no
// change.md) amends VW-2 and VW-6; its branch changes both, concludes with
// the tool, and merges into main with --no-ff.
function grouping(t) {
  const repo = makeRepo(t);
  repo.write('specs/views.md', file(VW1, VW2, VW6));
  const org = '## Organized requirement\n\n### R1 Grouped by default\n`al context <name>` MAY group repeated output, but MUST NOT leave out a section.\n\n' +
    'Amends: [VW-2], [VW-6]\n';
  addRequest(repo, 'grouping', null, { line: TIER1, org, signedText: org, decisions: '' });
  repo.commit('grouping: request', { date: '2026-09-28T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'grouping']);
  repo.write('specs/views.md', file(VW1, VW2B, VW6B));
  const edit = repo.commit(message('Group the context lines', { request: 'grouping', tier: '1 — grouping' }), { date: '2026-09-29T12:00:00Z' });
  ok(al(repo, 'conclude', 'grouping', '--yes'), 'conclude');
  repo.commit(message('Conclude grouping', { request: 'grouping', tier: '1 — grouping' }), { date: '2026-09-29T13:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  repo.git(['merge', '-q', '--no-ff', '--no-edit', 'grouping'], { date: '2026-09-29T14:00:00Z' });
  return { repo, edit, merge: repo.head() };
}
const sectionLines = (out) => lines(out).filter((l) => /^Section\b/.test(l));

test('#139 (5) [VW-7] audit of a concluded tier-1 request: a Section line for each section its work changed, VW-2 and VW-6, naming where it reached main; none for VW-1', (t) => {
  const { repo, edit, merge } = grouping(t);
  const r = al(repo, 'context', 'grouping', '--audit');
  ok(r, 'context grouping --audit');
  assertFrame(r.stdout);
  const ss = sectionLines(r.stdout);
  for (const id of ['VW-2', 'VW-6']) {
    const s = ss.find((l) => hasId(l, id));
    assert.ok(s, `a Section line for ${id}:\n${r.stdout}`);
    // The merge brought it to main's first-parent line; the branch commit wrote it. Either names when.
    assert.ok(s.includes(short(merge)) || s.includes(short(edit)), `the Section line for ${id} names the commit that brought it to main:\n${r.stdout}`);
  }
  assert.ok(!ss.some((l) => hasId(l, 'VW-1')), `grouping did not change VW-1:\n${r.stdout}`);
});

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const S2 = '## [INV-3] Dates\nDates MUST show in ISO 8601, with the time zone.\n';
const INV7 = '## [INV-7] CSV rows\nOne row per line item.\n';

// As archived-view.test.js: iso-dates (INV-3, INV-7) consolidated and
// archived on a branch that main takes as a squash; then tz-dates changes
// INV-3 on main.
function changedSince(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  addRequest(repo, 'iso-dates', [
    block('[INV-3]@1 modify   for R2', { was: S0, now: S1 }),
    block('[INV-7]@1 add in specs/invoices.md   for R1', { now: INV7 }),
  ], { decisions: '' });
  repo.commit('iso-dates: request\n\nRequest: iso-dates', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'iso-dates-part-1']);
  repo.write('specs/invoices.md', file(INV1, S1, INV7));
  mkdirSync(join(repo.dir, 'requests/archive'), { recursive: true });
  repo.git(['mv', 'requests/iso-dates', 'requests/archive/iso-dates']);
  const md = repo.read('requests/archive/iso-dates/request.md').toString().replace('Status: open', 'Status: concluded');
  repo.write('requests/archive/iso-dates/request.md', `${md}\n## Outcome\n\n- R1 Invoice export: in [INV-7]\n- R2 Dates: in [INV-3]\n` +
    '- R3 Email link: in no section\n- Added: [INV-7]\n- Modified: [INV-3]\n- Removed: none\n- Dropped: none\n- Kept: none\n');
  repo.commit('Consolidate and conclude\n\nRequest: iso-dates', { date: '2026-09-22T12:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  squashMerge(repo, 'iso-dates-part-1', '2026-09-23T12:00:00Z');
  repo.git(['branch', '-q', '-D', 'iso-dates-part-1']);
  addRequest(repo, 'tz-dates', [block('[INV-3]@1 modify   for R2', { was: S1, now: S2 })], { line: `${statusLine('open')} · Follows: iso-dates` });
  repo.write('specs/invoices.md', file(INV1, S2, INV7));
  repo.commit('Time zone in dates\n\nRequest: tz-dates', { date: '2026-10-05T12:00:00Z' });
  return repo;
}

test('#139 (5) [VW-7][STA-8][VW-6] audit of an archived request whose INV-3 tz-dates changed since: its Section line says "since changed by tz-dates", as context does, and no line says "differs"', (t) => {
  const repo = changedSince(t);
  const ctx = al(repo, 'context', 'iso-dates');
  ok(ctx, 'context iso-dates');
  assert.ok(lineWith(ctx.stdout, /since changed by tz-dates/), `the fixture: context says INV-3 was since changed by tz-dates:\n${ctx.stdout}`);
  const r = al(repo, 'context', 'iso-dates', '--audit');
  ok(r, 'context iso-dates --audit');
  const s = sectionLines(r.stdout).find((l) => hasId(l, 'INV-3'));
  assert.ok(s, `a Section line for INV-3:\n${r.stdout}`);
  assert.ok(s.includes('since changed by tz-dates'), `INV-3 since changed by tz-dates:\n${r.stdout}`);
  assert.ok(!lines(r.stdout).some((l) => /\bdiffers\b/.test(l)), `an archived request is not judged against today's baseline:\n${r.stdout}`);
});

// --- (6) the audit of a child that inherits its parent's sign-off ---

const PARENT_SIGNOFF = 'requests/invoices/origin/2026-09-21-signoff.md';
// invoices (signed ORG, Parts naming child), then child, which copies
// invoices' R3 word for word as its R1 and has no sign-off of its own.
function inheriting(t) {
  const R3 = '### R3 Email link\nThe invoice email MUST carry a link to the CSV.\n';
  const copied = `## Organized requirement\n\n${R3.replace('### R3', '### R1')}`;
  const repo = makeRepo(t);
  addRequest(repo, 'invoices', null, { line: TIER1, decisions: '', rest: '\n## Parts\n\n1. request child\n' });
  repo.commit('The parent', { date: '2026-09-21T12:00:00Z' });
  addRequest(repo, 'child', null, { line: TIER1, org: copied, signed: false, decisions: '' });
  const md = 'requests/child/request.md';
  repo.write(md, repo.read(md).toString().replace(/^Signed off: .*\n/m, ''));
  repo.commit('The child', { date: '2026-09-22T12:00:00Z' });
  assert.ok(ORG.includes(R3), 'the fixture: the parent holds R3');
  assert.ok(repo.read(PARENT_SIGNOFF).toString().includes(ORG), 'the fixture: the parent\'s sign-off holds ORG');
  return repo;
}
// The audit's lines that speak of a sign-off and name invoices.
const throughParent = (out) => lines(out).filter((l) => /sign/i.test(l) && l.includes('invoices'));

test('#139 (6) [VW-7][REC-5] audit of a child that copies its parent invoices\' R3 word for word and has no sign-off of its own: it shows the child signed off through invoices', (t) => {
  const repo = inheriting(t);
  const ctx = al(repo, 'context', 'child');
  ok(ctx, 'context child');
  assert.ok(lines(ctx.stdout).some((l) => /^Require\b/.test(l) && l.includes('through invoices')), `the fixture: context says signed off through invoices:\n${ctx.stdout}`);
  const r = al(repo, 'context', 'child', '--audit');
  ok(r, 'context child --audit');
  assert.ok(throughParent(r.stdout).length, `a line shows the child's sign-off through invoices:\n${r.stdout}`);
});

test('#139 (6) [VW-7][REC-5] audit of the inheriting child shows the inherited sign-off as it shows its own: "SHA-256 matches", and the signed text, verbatim', (t) => {
  const r = al(inheriting(t), 'context', 'child', '--audit');
  ok(r, 'context child --audit');
  assert.ok(throughParent(r.stdout).some((l) => l.includes('SHA-256 matches')), `the sign-off through invoices, its SHA-256 re-checked:\n${r.stdout}`);
  // The child's audit shows no organized text of its own, so these lines come from the signed text.
  const shown = lines(r.stdout).map((l) => l.trim());
  for (const l of ORG.split('\n').filter((x) => x.trim())) assert.ok(shown.includes(l), `the signed text's line "${l}":\n${r.stdout}`);
});

test('#139 (6) [VW-7][REC-5] audit of the inheriting child when the parent\'s sign-off no longer matches its SHA-256: the sign-off through invoices is still shown, "not ok"', (t) => {
  const repo = inheriting(t);
  repo.write(PARENT_SIGNOFF, repo.read(PARENT_SIGNOFF).toString().replace('Dates MUST show in ISO 8601.', 'Dates MUST show in RFC 3339.'));
  repo.commit('Edit the parent\'s signed text', { date: '2026-09-23T12:00:00Z' });
  const r = al(repo, 'context', 'child', '--audit');
  ok(r, 'context child --audit');
  assert.ok(throughParent(r.stdout).some((l) => l.includes('not ok')), `the sign-off through invoices, "not ok": it no longer matches its SHA-256:\n${r.stdout}`);
});

// --- (5) a tier-1 request that adds the first baseline section ---

test('#139 (5) [VW-7] audit of a concluded tier-1 request that adds [A-1], the first baseline section of all: its Section line names the main commit where A-1 landed, as context A-1 --audit does', (t) => {
  const repo = makeRepo(t);
  const org = oneLine('R1: The promise MUST say new. Amends: [A-1]');
  addRequest(repo, 'first', null, { line: TIER1, org, signedText: org, decisions: '' });
  repo.commit('first: request', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'first']);
  repo.write('specs/rules.md', A1B);
  repo.commit(message('The first promise', { request: 'first', tier: '1 — first' }), { date: '2026-09-22T12:00:00Z' });
  ok(al(repo, 'conclude', 'first', '--yes'), 'conclude');
  repo.commit(message('Conclude first', { request: 'first', tier: '1 — first' }), { date: '2026-09-22T13:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  repo.git(['merge', '-q', '--no-ff', '--no-edit', 'first'], { date: '2026-09-22T14:00:00Z' });
  const merge = repo.head();
  assert.equal(repo.git(['log', '--format=%H', 'HEAD^1', '--', 'specs']), '', 'the fixture: main had no baseline before the merge');

  const section = al(repo, 'context', 'A-1', '--audit');
  ok(section, 'context A-1 --audit');
  assert.ok(lines(section.stdout).some((l) => /^Changed\b/.test(l) && l.includes(short(merge))), `the fixture: context A-1 --audit names ${short(merge)}:\n${section.stdout}`);
  const r = al(repo, 'context', 'first', '--audit');
  ok(r, 'context first --audit');
  const s = sectionLines(r.stdout).find((l) => hasId(l, 'A-1'));
  assert.ok(s, `a Section line for A-1:\n${r.stdout}`);
  assert.ok(s.includes(short(merge)), `A-1 landed on main at ${short(merge)}:\n${r.stdout}`);
  assert.doesNotMatch(s, /not consolidated/, `A-1 reached main:\n${r.stdout}`);
});

// --- (7) al spec --list and a consolidated "remove, was first in <path>" ---

test('#139 (7) [VW-5] al spec --list: a consolidated "remove, was first in specs/two.md", the file still in the baseline, shows under specs/two.md in the map, never "no file named" or "not in the baseline yet"', (t) => {
  const AAA = '## [AAA-1] Other\nThe other MUST hold.\n';
  const T1 = '## [T-1] First\nThe first MUST hold.\n';
  const T2 = '## [T-2] Second\nThe second MUST hold.\n';
  const repo = makeRepo(t);
  repo.write('specs/aaa.md', AAA);
  repo.write('specs/two.md', file(T1, T2));
  addRequest(repo, 'remove', [block('[T-1]@1 remove, was first in specs/two.md   for R1', { was: T1 })]);
  repo.commit('Baseline and request', { date: '2026-09-21T12:00:00Z' });
  ok(al(repo, 'consolidate', 'remove', '--yes'), 'consolidate');
  assert.ok(!repo.read('specs/two.md').toString().includes('[T-1]'), 'the fixture: T-1 is gone from specs/two.md');
  repo.commit(message('Consolidate', { request: 'remove' }), { date: '2026-09-22T12:00:00Z' });

  const r = al(repo, 'spec', '--list');
  ok(r, 'spec --list');
  const ls = lines(r.stdout);
  assert.ok(!r.stdout.includes('no file named'), `specs/two.md is named in the block:\n${r.stdout}`);
  assert.ok(!r.stdout.includes('not in the baseline yet'), `specs/two.md is in the baseline:\n${r.stdout}`);
  const path = ls.findIndex((l) => l.includes('specs/two.md'));
  const covers = indexOf(ls, /^Covers\b/);
  const held = ls.findIndex((l) => hasId(l, 'T-1'));
  assert.ok(path >= 0 && held > path && (covers < 0 || held < covers), `the T-1 block shows under specs/two.md in the map:\n${r.stdout}`);
});

// --- (8) a section moved unchanged between files ---

// The architect's ruling on #139 item 8: a section moved between baseline
// files with its text unchanged is no text change, but it is shown once, as
// a move naming the old file and the new, never left out and never listed
// twice; check's Evidence names the move.
// Main: specs/a.md holds X-1 and X-2, specs/b.md holds Y-1. The branch moves
// X-2, its text unchanged, to the end of specs/b.md.
function moved(t) {
  const X1 = '## [X-1] First\nThe first MUST hold.\n';
  const X2 = '## [X-2] Second\nThe second MUST hold.\n';
  const Y1 = '## [Y-1] Other\nThe other MUST hold.\n';
  const repo = makeRepo(t);
  repo.write('specs/a.md', file(X1, X2));
  repo.write('specs/b.md', Y1);
  repo.commit('Baseline', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'move']);
  repo.write('specs/a.md', X1);
  repo.write('specs/b.md', file(Y1, X2));
  // The claim does not name X-2, so only the move itself can.
  repo.commit(message('Move a section', { tier: '0 — moves a section; no promise changes' }), { date: '2026-09-22T12:00:00Z' });
  return repo;
}
// The one line naming X-2 is a move naming both files.
function assertMove(ls, out) {
  const named = ls.filter((l) => hasId(l, 'X-2'));
  assert.equal(named.length, 1, `X-2 is shown once, got ${named.length} lines:\n${out}`);
  assert.match(named[0], /\bmoved\b/, `X-2 is shown as a move:\n${out}`);
  assert.ok(named[0].includes('specs/a.md') && named[0].includes('specs/b.md'), `the move names both files:\n${out}`);
}

test('#139 (8) [VW-4][REC-10] context --diff: X-2, moved from specs/a.md to specs/b.md with its text unchanged, is one Changes entry, a move naming both files, not two', (t) => {
  const r = contextDiff(moved(t), 'main...HEAD');
  ok(r, 'context --diff main...HEAD');
  assertDiffFrame(r.stdout);
  const changes = labelled(r.stdout, 'Changes');
  assert.ok(changes, `expected a Changes line:\n${r.stdout}`);
  assertMove(lines(changes), r.stdout);
});

test('#139 (8) [VW-4][REC-10] context --diff --for review: the moved X-2 is named on one line, as a move naming both files, and on no other line', (t) => {
  const { out } = review(moved(t));
  assertMove(lines(out), out);
});

test('#139 (8) [REC-11][REC-10] check: the Evidence line names the move of X-2, not "edits no baseline section"', (t) => {
  const out = check(moved(t));
  const evidence = startingWith(out, 'Evidence');
  assert.ok(evidence, `expected an Evidence line:\n${out}`);
  assert.ok(hasId(evidence, 'X-2') && /\bmove[sd]?\b/.test(evidence), `the Evidence line names the move of X-2:\n${out}`);
  assert.ok(!evidence.includes('edits no baseline section'), `the branch moves X-2; it is not left out:\n${out}`);
});

// --- (9) Amends: citing an ID that does not exist ---

test('#139 (9) [HNT-2] an open request whose organized requirement says "Amends: [NOPE-9]", an ID in no section or block: check gives a not ok naming NOPE-9', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/rules.md', A1);
  const org = oneLine('R1: The promise MUST say new. Amends: [NOPE-9]');
  addRequest(repo, 'promise', null, { line: TIER1, org, signedText: org, decisions: '' });
  repo.commit('Baseline and request', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'promise']);
  repo.write('src/promise.js', PROMISE('new'));
  repo.commit(message('Code', { request: 'promise', tier: '1 — promise' }), { date: '2026-09-22T12:00:00Z' });
  hint(check(repo, '--all'), 'not ok', 'NOPE-9');
});

// --- (11) context --diff reads its results from the working tree ---

test('#139 (11) [VW-9][LNK-3] context --diff: its Read line, or its Not known line, says the test results are read from the working tree', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/rules.md', A1);
  repo.write('.assuredloop', 'results: results/ci.tap\n');
  repo.commit('Baseline', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('src/promise.js', PROMISE('new'));
  const head = repo.commit(message('Code', { tier: '0 — code' }), { date: '2026-09-22T12:00:00Z' });
  repo.write('results/ci.tap', `TAP version 13\n# revision: ${head}\nok 1 - rounds\n1..1\n`);

  const r = contextDiff(repo, 'main...HEAD');
  ok(r, 'context --diff main...HEAD');
  assertDiffFrame(r.stdout);
  assert.ok(lines(r.stdout).some((l) => l.includes('results/ci.tap')), `the fixture: the view reads results/ci.tap:\n${r.stdout}`);
  const frame = lines(r.stdout).filter((l) => /^(Read|Not known)\b/.test(l));
  assert.ok(frame.some((l) => /\bresults?\b/i.test(l) && l.includes('working tree')), `the Read or Not known line says results come from the working tree:\n${r.stdout}`);
});

// --- (12) context <ID> of a section not committed yet ---

test('#139 (12) [VW-3] context <ID> of a section in the working tree, not committed: no empty Shaped by line; it says the section is not committed yet', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/rules.md', A1);
  repo.commit('Baseline', { date: '2026-09-21T12:00:00Z' });
  repo.write('specs/rules.md', file(A1, A2));

  const r = contextOf(repo, 'A-2');
  ok(r, 'context A-2');
  assertFrame(r.stdout);
  assert.ok(r.stdout.includes('The order MUST be old.'), `the fixture: A-2 is read from the working tree:\n${r.stdout}`);
  assert.ok(!lines(r.stdout).some((l) => /^Shaped by\s*$/.test(l)), `no empty Shaped by line:\n${r.stdout}`);
  assert.match(r.stdout, /not committed/, `it says A-2 is not committed yet:\n${r.stdout}`);
});
