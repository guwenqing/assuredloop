// Issue #142: one source for rules that were written in several places.
// Where the copies disagreed on odd records, the architect chose one
// behaviour; each test here pins one of them, through the CLI only:
// 1. A duplicate ID in the baseline [SPC-2] [SPC-3]: every reader that maps
//    sections by ID takes the FIRST copy (files in path order, then order
//    within a file): check's Evidence line [REC-11], conclude's Added,
//    Modified and Removed for a tier-1 request [REC-9], and the archived
//    view's "as at conclusion" [VW-6].
// 2. A Status line's value is read whole: everything after `Status:` up to the
//    next `·` (or the line's end), trimmed [VW-1] [REC-8].
// 3. A record's `## <title>` heading is any line matching ^##\s+<title>\s*$,
//    so more spaces, or a CRLF ending, still name it: conclude regenerates
//    the Outcome in place [REC-9] [STA-7], and --audit shows it [VW-7].
// 4. One message for an origin/ file that is not a valid snapshot [REC-3]
//    [HNT-2]: `it needs Source, Fetched and SHA-256, then a --- line`.
// 5. An archived tier-1 request lists its sections from its Outcome's Added,
//    Modified and Removed lines, by the ID grammar [SPC-2] only [VW-6].
// Built from the issue and the architect's rulings; nothing here reads the
// code under test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl, sha256 } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { ENV, addRequest, both, outcome } from './helpers/request.js';
import { file } from './helpers/links.js';
import { check, hint, message } from './helpers/hints.js';
import { stateOf } from './helpers/grouped.js';

const al = (repo, ...args) => runAl(repo.dir, args, { env: ENV });
const ok = (r, what) => assert.equal(r.code, 0, `${what}:\n${both(r)}`);
function context(repo, ...args) {
  const r = al(repo, 'context', ...args);
  ok(r, `context ${args.join(' ')}`);
  return r.stdout;
}

const TIER1 = 'Type: story · Tier: 1 · Status: open';

// --- 1. A duplicate ID: the first copy wins ---

const sec = (id, title, text) => `## [${id}] ${title}\n${text}\n`;
const A1 = sec('A-1', 'Grouping', 'The view MAY group repeated output.');
const A1B = sec('A-1', 'Grouping', 'The view MAY group repeated output, and MUST NOT leave a section out.');
const DUP = sec('A-1', 'Order', 'Groups keep their first-seen order.');
const DUPB = sec('A-1', 'Order', 'Groups keep their first-seen order, and empty ones are left out.');
const A2 = sec('A-2', 'Dashes', 'Runs of IDs are written with an en dash.');
const A2B = sec('A-2', 'Dashes', 'Runs of IDs are written with an en dash, never a hyphen.');

// Main holds the baseline `before` ({ path: text }); the branch `edit`
// commits `after` with a Tier line, so check shows its Evidence line.
function branchEdits(t, before, after) {
  const repo = makeRepo(t);
  for (const [p, text] of Object.entries(before)) repo.write(p, text);
  repo.commit('the baseline', { date: '2026-09-28T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'edit']);
  for (const [p, text] of Object.entries(after)) repo.write(p, text);
  repo.commit(message('Edit a rule', { tier: '1 — rules' }), { date: '2026-09-29T12:00:00Z' });
  return repo;
}
// What check's Evidence line says the branch edits: the text after "edits ",
// up to the next " · ".
function edits(out) {
  const l = lines(out).find((x) => /^Evidence\b/.test(x));
  assert.ok(l, `expected an Evidence line:\n${out}`);
  const m = l.match(/\bedits ([^·]*)/);
  assert.ok(m, `the Evidence line should say what the branch edits:\n${l}`);
  return m[1].trim();
}

const CHECK_CASES = [
  ['one file, the branch edits only the second copy of A-1', { 'specs/rules.md': file(A1, A2, DUP) }, { 'specs/rules.md': file(A1, A2, DUPB) }, 'no baseline section'],
  ['one file, the branch edits only the first copy of A-1', { 'specs/rules.md': file(A1, A2, DUP) }, { 'specs/rules.md': file(A1B, A2, DUP) }, '[A-1]'],
  ['two files, the branch edits only the copy in specs/b.md, later in path order', { 'specs/a.md': file(A1, A2), 'specs/b.md': DUP },
    { 'specs/a.md': file(A1, A2), 'specs/b.md': DUPB }, 'no baseline section'],
  ['two files, the branch edits only the copy in specs/a.md, first in path order', { 'specs/a.md': file(A1, A2), 'specs/b.md': DUP },
    { 'specs/a.md': file(A1B, A2), 'specs/b.md': DUP }, '[A-1]'],
];

CHECK_CASES.forEach(([label, before, after, want], i) => {
  test(`#142 [SPC-2][SPC-3][REC-11] check's Evidence takes the first copy of a duplicate ID: ${label}: "edits ${want}"`, (t) => {
    // Contrast, true today, once: with no duplicate, a branch that edits A-2 gives "edits [A-2]".
    if (i === 0) assert.equal(edits(check(branchEdits(t, { 'specs/rules.md': file(A1, A2) }, { 'specs/rules.md': file(A1, A2B) }), '--all')), '[A-2]');
    const repo = branchEdits(t, before, after);
    const out = check(repo, '--all');
    // Contrast, true today: the duplicate is itself a not ok.
    hint(out, 'not ok', 'A-1', /duplicate/i);
    assert.equal(edits(out), want, `the first copy of A-1 decides whether the branch edits it:\n${out}`);
  });
});

// A signed tier-1 request `grouping` (no change.md) on main with the baseline
// `before`; its branch commits `after` with `Request: grouping`, then
// concludes with the tool. Returns the IDs on the Outcome's Modified line.
const ORG1 = '## Organized requirement\n\n### R1 Dashes\nRuns of IDs MUST use an en dash. Amends: [A-2]\n';
function concludedModified(t, before, after) {
  const repo = makeRepo(t);
  repo.write('specs/rules.md', before);
  addRequest(repo, 'grouping', null, { line: TIER1, org: ORG1, signedText: ORG1, decisions: '' });
  repo.commit(message('grouping: request', { request: 'grouping', tier: '1 — grouping' }), { date: '2026-09-28T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'grouping']);
  repo.write('specs/rules.md', after);
  repo.commit(message('The amend', { request: 'grouping', tier: '1 — grouping' }), { date: '2026-09-29T12:00:00Z' });
  ok(al(repo, 'conclude', 'grouping', '--yes'), 'conclude');
  const { generated } = outcome(repo.read('requests/archive/grouping/request.md').toString());
  const l = generated.find((g) => g.startsWith('- Modified:'));
  assert.ok(l, `the Outcome should have a "- Modified:" line:\n${generated.join('\n')}`);
  return { line: l, ids: [...l.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]).sort() };
}

test('#142 [SPC-2][REC-9][STA-7] conclude, tier 1: the branch edits A-2 and only the second copy of A-1: Modified lists [A-2], not A-1', (t) => {
  const { line, ids } = concludedModified(t, file(A1, A2, DUP), file(A1, A2B, DUPB));
  assert.deepEqual(ids, ['A-2'], `the first copy of A-1 did not change:\n${line}`);
});

test('#142 [SPC-2][REC-9][STA-7] conclude, tier 1: the branch edits A-2 and only the first copy of A-1: Modified lists [A-1] and [A-2]', (t) => {
  const { line, ids } = concludedModified(t, file(A1, A2, DUP), file(A1B, A2B, DUP));
  assert.deepEqual(ids, ['A-1', 'A-2'], `the first copy of A-1 changed:\n${line}`);
});

const VW1 = '## [VW-1] Where the project stands\n`al context` MUST list the open requests.\n';
const VW2 = '## [VW-2] Where a request stands\n`al context <name>` MUST print twelve lines or fewer.\n';
const VW2B = '## [VW-2] Where a request stands\n`al context <name>` MUST print twelve lines or fewer, grouped.\n';
const VW2DUP = '## [VW-2] Where a section stands\n`al context <ID>` MUST show the section\'s text.\n';
const VW6 = '## [VW-6] Archived requests\nAn archived request MUST show each of its sections.\n';
const VW6B = '## [VW-6] Archived requests\nAn archived request MUST show each of its sections, grouped.\n';
const ORG2 = '## Organized requirement\n\n### R1 Grouped by default\n' +
  '`al context <name>` MAY group repeated output, but MUST NOT leave out a section.\n\nAmends: [VW-2], [VW-6]\n';

// Main: specs/views.md with VW-1, VW-2 and VW-6, and the signed tier-1
// request grouping (no change.md). Its branch edits VW-2 and VW-6, concludes
// with the tool, runs `beforeCommit` on the concluded tree, commits, and
// merges into main with --no-ff.
function tier1Archived(t, beforeCommit = () => {}) {
  const repo = makeRepo(t);
  repo.write('specs/views.md', file(VW1, VW2, VW6));
  addRequest(repo, 'grouping', null, { line: TIER1, org: ORG2, signedText: ORG2, decisions: '' });
  repo.commit('grouping: request', { date: '2026-09-28T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'grouping']);
  repo.write('specs/views.md', file(VW1, VW2B, VW6B));
  repo.commit(message('Group the context lines', { request: 'grouping', tier: '1 — grouping' }), { date: '2026-09-29T12:00:00Z' });
  ok(al(repo, 'conclude', 'grouping', '--yes'), 'conclude');
  beforeCommit(repo);
  repo.commit(message('Conclude grouping', { request: 'grouping', tier: '1 — grouping' }), { date: '2026-09-29T13:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  repo.git(['merge', '-q', '--no-ff', '--no-edit', 'grouping'], { date: '2026-09-29T14:00:00Z' });
  return repo;
}

test('#142 [SPC-2][VW-6] an archived tier-1 request: a later commit adds a second copy of VW-2 after the first; the first copy is unchanged, so VW-2 reads "as at conclusion"', (t) => {
  const repo = tier1Archived(t);
  repo.write('specs/views.md', file(VW1, VW2B, VW6B, VW2DUP));
  repo.commit('A second VW-2', { date: '2026-10-05T12:00:00Z' });
  const out = context(repo, 'grouping');
  // Contrast, true today: VW-6, never duplicated, is as at conclusion.
  assert.equal(stateOf(out, 'Sections', 'VW-6'), 'as at conclusion', out);
  assert.equal(stateOf(out, 'Sections', 'VW-2'), 'as at conclusion', `the first copy of VW-2 is the one the request changed, and it has not changed since:\n${out}`);
});

// --- 2. The Status value is read whole ---

test('#142 [VW-1] the project view shows each open request\'s whole Status value: "in-progress" (before a · Follows:), "waiting on legal"; "open" as before', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', '## [INV-1] Totals\nTotals MUST show two decimals.\n');
  addRequest(repo, 'inv', null, { line: TIER1 });
  addRequest(repo, 'csv-export', null, { line: 'Tier: 1 · Status: in-progress · Follows: inv' });
  addRequest(repo, 'dates', null, { line: 'Type: story · Tier: 1 · Status: waiting on legal' });
  repo.commit('three requests');
  const out = context(repo);
  const row = (name) => {
    const l = lines(out).find((x) => x.startsWith(`${name} `));
    assert.ok(l, `expected a row for ${name}:\n${out}`);
    return l;
  };
  // Contrast, true today: a one-word value.
  assert.match(row('inv'), /\bopen\b/, out);
  assert.ok(row('csv-export').includes('in-progress'), `the whole value, up to the next ·:\n${out}`);
  assert.doesNotMatch(row('csv-export'), /Follows/, `the value ends at the next ·:\n${out}`);
  assert.ok(row('dates').includes('waiting on legal'), `the whole value, to the line's end:\n${out}`);
});

test('#142 [REC-8] a part naming an archived child request shows the child\'s whole Status value: "dropped in review"', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', '## [INV-1] Totals\nTotals MUST show two decimals.\n');
  addRequest(repo, 'inv', null, { line: TIER1, rest: '\n## Parts\n\n1. CSV export: request csv-export\n2. Date format: request dates\n' });
  addRequest(repo, 'csv-export', null, { dir: 'requests/archive/csv-export', line: 'Tier: 1 · Status: dropped in review · Follows: inv' });
  addRequest(repo, 'dates', null, { dir: 'requests/archive/dates', line: 'Tier: 1 · Status: concluded' });
  repo.commit('a parent and two archived children');
  const out = context(repo, 'inv', '--all');
  const part = (n, child) => {
    const l = lines(out).find((x) => x.includes(`part ${n} names request ${child}:`));
    assert.ok(l, `expected a note for part ${n}, naming ${child}:\n${out}`);
    return l;
  };
  // Contrast, true today: a one-word value.
  assert.ok(part(2, 'dates').includes('dates: concluded'), out);
  assert.ok(part(1, 'csv-export').includes('csv-export: dropped in review'), `the child's whole Status value:\n${out}`);
});

// --- 3. One form for a `## <title>` heading: ^##\s+<title>\s*$ ---

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const S0 = '## [INV-3] Dates\nDates show in the customer\'s local format.\n';
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const ARCHIVED = 'requests/archive/inv/request.md';
const NOTES = 'Notes:\nThe owner asked for the email link in a later request.\n';
const OUTCOME_HEADING = /^##\s+Outcome\s*$/;

// The request inv, its INV-3 block consolidated, concluded on the branch
// conclude-inv and committed; then its request.md is rewritten by `edit`
// (given the text, with NOTES put in place of the "Notes:" line on) and
// committed. Returns the repo.
function concludedThenEdited(t, edit) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S1));
  addRequest(repo, 'inv', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  repo.commit('setup');
  repo.git(['checkout', '-q', '-b', 'conclude-inv']);
  ok(al(repo, 'conclude', 'inv', '--yes'), 'conclude');
  repo.commit('conclude inv');
  let md = repo.read(ARCHIVED).toString();
  const at = md.search(/^Notes:/m);
  assert.ok(at >= 0, `the fixture: the Outcome conclude wrote has a Notes: line:\n${md}`);
  md = edit(md.slice(0, at) + NOTES);
  repo.write(ARCHIVED, md);
  repo.commit('notes, and the heading rewritten');
  return repo;
}
const twoSpaces = (md) => {
  const out = md.replace(/^## Outcome[ \t]*$/m, '##  Outcome');
  assert.notEqual(out, md, 'the fixture: the heading was rewritten');
  return out;
};
const crlf = (md) => md.replace(/\r?\n/g, '\r\n');
const headings = (md) => md.split('\n').filter((l) => OUTCOME_HEADING.test(l));

// Conclude again keeps one Outcome heading and the Notes: text.
function assertRegenerated(repo) {
  assert.equal(headings(repo.read(ARCHIVED).toString()).length, 1, 'the fixture: one Outcome heading before');
  ok(al(repo, 'conclude', 'inv', '--yes'), 'conclude again');
  const md = repo.read(ARCHIVED).toString();
  assert.ok(md.includes('The owner asked for the email link in a later request.'), `the Notes: text is kept:\n${md}`);
  assert.equal(headings(md).length, 1, `exactly one Outcome heading, the one regenerated in place:\n${md}`);
}
// --audit shows the Outcome's lines, not "none yet".
function assertAuditShowsOutcome(repo) {
  const out = context(repo, 'inv', '--audit');
  assert.ok(!lines(out).some((l) => /^Outcome\s+none yet\b/.test(l)), `the Outcome is there:\n${out}`);
  assert.ok(lines(out).some((l) => l.includes('- Decisions: D1, D3, D4')), `the Outcome's lines are shown:\n${out}`);
}

test('#142 [REC-9][STA-7] conclude again on a request.md whose Outcome is headed "##  Outcome" (two spaces): the Outcome is regenerated in place, one Outcome heading, its Notes: text kept', (t) => {
  // Contrast, true today: under "## Outcome".
  assertRegenerated(concludedThenEdited(t, (md) => md));
  assertRegenerated(concludedThenEdited(t, twoSpaces));
});

test('#142 [VW-7] --audit shows the Outcome headed "##  Outcome" (two spaces), not "none yet"', (t) => {
  // Contrast, true today: under "## Outcome".
  assertAuditShowsOutcome(concludedThenEdited(t, (md) => md));
  assertAuditShowsOutcome(concludedThenEdited(t, twoSpaces));
});

test('#142 [VW-7][REC-9] --audit shows the Outcome of a CRLF request.md ("## Outcome\\r\\n"), not "none yet"', (t) => {
  // Contrast, true today: conclude again already finds that heading.
  assertRegenerated(concludedThenEdited(t, crlf));
  assertAuditShowsOutcome(concludedThenEdited(t, crlf));
});

// --- 4. One message for an origin/ file that is not a valid snapshot ---

const TEXT = '# Export invoices\nPlease let me download a CSV.\n';
const GOOD = '2026-09-20-good.md';
const BAD = '2026-09-21-bad.md';
const INVALID = `it needs Source, Fetched and SHA-256, then a --- line`;

const WANT = `origin/${BAD} of invoice-download is not a valid snapshot: ${INVALID}`;

// A request whose origin/ holds a good snapshot and BAD, which has no --- line.
function badSnapshot(t) {
  const repo = makeRepo(t);
  repo.write('requests/invoice-download/request.md',
    "# Customers can download invoices\nTier: 2 · Status: open\n\n## Owner's words and dialog\n\n- 2026-09-20 issue, snapshot origin/2026-09-20-good.md\n");
  repo.write(`requests/invoice-download/origin/${GOOD}`,
    `Source: https://example.com/issue\nFetched: 2026-09-20T09:00Z\nSHA-256: ${sha256(TEXT)}\n---\n${TEXT}`);
  repo.write(`requests/invoice-download/origin/${BAD}`, `Source: https://example.com/issue\nFetched: 2026-09-21T09:00Z\nSHA-256: ${sha256(TEXT)}\n${TEXT}`);
  repo.commit('a request with a bad snapshot');
  return repo;
}

test(`#142 [REC-3][HNT-2] check says "${WANT}", as record --verify does`, (t) => {
  const repo = badSnapshot(t);
  // Contrast, true today: record --verify already says it.
  const v = runAl(repo.dir, ['record', 'invoice-download', 'origin', '--verify', BAD, '--from', '-', '--fetched', '2026-09-26T09:00Z'], { input: TEXT, env: ENV });
  assert.equal(v.code, 2, both(v));
  assert.ok(both(v).includes(`${BAD} is not a valid snapshot: ${INVALID}`), both(v));

  const checked = hint(check(repo, '--all'), 'not ok', BAD);
  assert.ok(checked.includes(WANT), `check: ${JSON.stringify(WANT)}, got:\n${checked}`);
});

test(`#142 [REC-3][HNT-2][VW-2] context <name> hints "${WANT}"`, (t) => {
  const viewed = hint(context(badSnapshot(t), 'invoice-download', '--all'), 'not ok', BAD);
  assert.ok(viewed.includes(WANT), `context: ${JSON.stringify(WANT)}, got:\n${viewed}`);
});

// --- 5. The ID grammar in an archived tier-1 request's Outcome lists ---

test('#142 [SPC-2][VW-6] an archived tier-1 request lists only section IDs from its Outcome lists: a hand-written [not an id] on the Modified line is not listed', (t) => {
  const repo = tier1Archived(t, (r) => {
    const md = r.read('requests/archive/grouping/request.md').toString();
    const out = md.replace(/^- Modified: (.*)$/m, '- Modified: $1, [not an id]');
    assert.ok(out.includes('[not an id]') && out !== md, `the fixture: [not an id] is on the Modified line:\n${out}`);
    r.write('requests/archive/grouping/request.md', out);
  });
  const out = context(repo, 'grouping');
  // Contrast, true today: the section IDs are listed.
  assert.equal(stateOf(out, 'Sections', 'VW-2'), 'as at conclusion', out);
  assert.equal(stateOf(out, 'Sections', 'VW-6'), 'as at conclusion', out);
  assert.doesNotMatch(out, /not an id/, `only bracketed section IDs count:\n${out}`);
});
