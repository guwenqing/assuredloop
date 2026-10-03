// Issue #136: holes in what counts as signed, part 1 of 3 (the others are
// signed-holes-record.test.js and signed-holes-retained.test.js). Each is the
// tool not doing what specs/ already say, driven through the real CLI:
// (1) [REC-4][REC-5] a one-line `R<n>:` inside a fenced block (``` or ~~~) is
//     not a requirement: it is plain text of the part it sits in, and a
//     fenced `Amends:` names nothing;
// (4) [REC-8][REC-5] a part names a child only as `request <name>`, or ending
//     with `: request <name>`; one reader serves the child's inheritance, the
//     parent's view, check and conclude;
// (8) [REC-4] a MUST, SHOULD or MAY line in the organized section outside any
//     requirement is said to be not read as one (a note).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { ENV, ORG, addRequest, assertRefused, both, outcome } from './helpers/request.js';
import { file } from './helpers/links.js';
import { check, hint, message, noHint, strict } from './helpers/hints.js';

const TIER1 = 'Type: story · Tier: 1 · Status: open';
const TIER2 = 'Type: story · Tier: 2 · Status: open';
const A1 = '## [A-1] Promise\nThe promise MUST say old.\n';
const A1B = '## [A-1] Promise\nThe promise MUST say new.\n';
const A2 = '## [A-2] Order\nThe order MUST be old.\n';
const A2B = '## [A-2] Order\nThe order MUST be new.\n';

const al = (repo, ...args) => runAl(repo.dir, args, { env: ENV });
const ok = (r, what) => assert.equal(r.code, 0, `${what}:\n${both(r)}`);
const status = (repo) => repo.git(['status', '--porcelain', '--untracked-files=all']);
const clean = (repo) => assert.equal(status(repo), '', 'nothing should be written');
function context(repo, ...args) {
  const r = al(repo, 'context', ...args);
  ok(r, `context ${args.join(' ')}`);
  return r.stdout;
}
const firstLine = (out) => lines(out)[0];
const requireLine = (out) => lines(out).find((l) => /^Require\b/.test(l)) ?? '';
const org = (...ls) => `\n## Organized requirement\n\n${ls.join('\n')}\n`;

// The request `name`, unsigned and with no Signed off line, holding `organized`
// (and a change.md of `blocks` when given).
function child(repo, name, organized, blocks = null) {
  addRequest(repo, name, blocks, { line: TIER2, org: organized, signed: false, decisions: '' });
  const md = `requests/${name}/request.md`;
  repo.write(md, repo.read(md).toString().replace(/^Signed off: .*\n/m, ''));
}
// The signed tier-1 request `name` (its organized section `organized`, signed
// as it stands) whose ## Parts holds `part`.
function parent(repo, name, part, organized = ORG) {
  addRequest(repo, name, null, { line: TIER1, org: organized, signedText: organized, decisions: '', rest: `\n## Parts\n\n${part}\n` });
}

// On a branch of main (specs/rules.md with A-1 and A-2): al new promise --tier
// 1, the organized section `organized` appended and signed with al record
// signoff --yes, then `after` written as the baseline. Returns the repo.
function signedTier1(t, organized, after) {
  const repo = makeRepo(t);
  repo.write('specs/rules.md', file(A1, A2));
  repo.commit('Baseline');
  repo.git(['checkout', '-q', '-b', 'promise']);
  ok(runAl(repo.dir, ['new', 'promise', '--tier', '1', '--from', '-'], { input: 'Make the promise say new.\n', env: ENV }), 'new');
  const md = 'requests/promise/request.md';
  repo.write(md, repo.read(md).toString() + organized);
  ok(al(repo, 'record', 'promise', 'signoff', '--source', 'chat with the owner', '--yes'), 'record signoff');
  repo.write('specs/rules.md', after);
  return repo;
}

// --- (1) a one-line R<n>: inside a fence ---

const W1 = '## [W-1] Wire\nEach line on the wire MUST start with its label.\n';
const W1B = '## [W-1] Wire\nEach line on the wire MUST start with its label and a colon.\n';
// The signed requirement, holding a fenced example line `<label>: wire text`.
const WIRE = (label) => '## Organized requirement\n\n### R1 Wire format\nEach line on the wire MUST start with its label, as in:\n\n' +
  '```\n' + `${label}: wire text\n` + '```\n\nOut: binary framing.\n';

// Main: specs/wire.md with W-1; the signed parent (Parts: 1. request child,
// its fenced example R9); the unsigned child, a copy of the parent's text with
// the fenced line reading `childLabel`, holding W-1 pending.
function wire(t, childLabel) {
  const repo = makeRepo(t);
  repo.write('specs/wire.md', file('# Wire\n', W1));
  parent(repo, 'parent', '1. request child', WIRE('R9'));
  child(repo, 'child', WIRE(childLabel), [block('[W-1]@1 modify   for R1', { was: W1, now: W1B })]);
  repo.commit('parent and child', { date: '2026-09-21T12:00:00Z' });
  return repo;
}

test('#136 (1) [REC-4][REC-5][REC-6] a child copies the parent\'s signed requirement but changes its fenced example "R9: wire text" to "R8: wire text": context child is BLOCKED, and consolidate child --yes refuses and writes nothing', (t) => {
  const repo = wire(t, 'R8');
  const out = context(repo, 'child');
  assert.match(firstLine(out), /^BLOCKED/, `the fenced line is part of R1's text, which no longer matches the parent's:\n${out}`);
  assert.ok(!requireLine(out).includes('unchanged since'), `not "signed off through parent; unchanged since":\n${out}`);
  assertRefused(al(repo, 'consolidate', 'child', '--yes'), 'blocked');
  clean(repo);
});

test('#136 (1) [REC-5] contrast: a child copying the parent\'s requirement with the fenced example unchanged inherits the sign-off, and consolidate child --yes writes W-1', (t) => {
  const repo = wire(t, 'R9');
  const out = context(repo, 'child');
  assert.doesNotMatch(firstLine(out), /^BLOCKED/, out);
  assert.ok(requireLine(out).includes('through parent'), `signed off through parent:\n${out}`);
  ok(al(repo, 'consolidate', 'child', '--yes'), 'consolidate child');
  assert.equal(repo.read('specs/wire.md').toString(), file('# Wire\n', W1B));
});

test('#136 (1) [REC-4][REC-9] a signed tier-1 request "R1: … Amends: [A-2]", then a ~~~ fenced example "R2: example. Amends: [A-1]"; the branch edits A-2 and concludes: the Outcome has no R2 line, and R1 is in [A-2] only', (t) => {
  const organized = org('R1: The order MUST be new. Amends: [A-2]', '', 'For example:', '', '~~~', 'R2: example. Amends: [A-1]', '~~~');
  const repo = signedTier1(t, organized, file(A1, A2B));
  ok(al(repo, 'conclude', 'promise', '--yes'), 'conclude');
  const { generated } = outcome(repo.read('requests/archive/promise/request.md').toString());
  assert.ok(!generated.some((l) => l.startsWith('- R2')), `a fenced line is not a requirement; no R2 line:\n${generated.join('\n')}`);
  const r1 = generated.find((l) => l.startsWith('- R1 '));
  assert.ok(r1, `the Outcome has R1's line:\n${generated.join('\n')}`);
  assert.match(r1, /: in \[A-2\]$/, `a fenced Amends: names nothing, so R1 is in [A-2] only:\n${r1}`);
});

// --- (4) one clear form for a part naming a child ---

// The parent's R3, copied word for word as the child's R1.
const COPIED = '## Organized requirement\n\n### R1 Email link\nThe invoice email MUST carry a link to the CSV.\n';
const PROSE = '1. The first part is request ccc';
const CLEAR = '1. First part: request ccc';

// Main: the signed parent ppp (ORG) whose part is `part`; the unsigned ccc, copying ppp's R3.
function named(t, part) {
  const repo = makeRepo(t);
  parent(repo, 'ppp', part);
  child(repo, 'ccc', COPIED);
  repo.commit('ppp and ccc', { date: '2026-09-21T12:00:00Z' });
  return repo;
}

test('#136 (4) [REC-8][REC-5] a part reading "The first part is request ccc" names no child: ccc, copying ppp\'s signed R3, does not inherit (BLOCKED, awaiting sign-off), and ppp\'s context shows no note for ccc', (t) => {
  const repo = named(t, PROSE);
  const out = context(repo, 'ccc');
  assert.match(firstLine(out), /^BLOCKED/, `ccc is not ppp's child, so it inherits nothing:\n${out}`);
  assert.match(firstLine(out), /awaiting/i, `awaiting sign-off:\n${out}`);
  noHint(context(repo, 'ppp', '--all'), 'note', 'ccc');
});

test('#136 (4) [REC-8][REC-5] contrast: a part reading "First part: request ccc" names ccc: ccc inherits (not BLOCKED), and ppp\'s context has the note "part 1 names request ccc"', (t) => {
  const repo = named(t, CLEAR);
  const out = context(repo, 'ccc');
  assert.doesNotMatch(firstLine(out), /^BLOCKED/, out);
  assert.ok(requireLine(out).includes('through ppp'), `signed off through ppp:\n${out}`);
  hint(context(repo, 'ppp', '--all'), 'note', 'part 1 names request ccc');
});

test('#136 (4) [REC-8][HNT-2][HNT-3] record part --text "Speed up the request handling" names no child: check has no not ok about "request handling", and check --strict exits 0', (t) => {
  const repo = makeRepo(t);
  addRequest(repo, 'ppp', null, { line: TIER1, decisions: '' });
  repo.commit('ppp: request', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  ok(al(repo, 'record', 'ppp', 'part', '--text', 'Speed up the request handling', '--yes'), 'record part');
  repo.commit(message('A part for ppp', { request: 'ppp', tier: '1 — parts' }), { date: '2026-09-22T12:00:00Z' });
  noHint(check(repo, '--all'), 'not ok', 'handling');
  strict(repo, 0);
});

for (const [form, part, says] of [['prose', PROSE, false], ['clear', CLEAR, true]]) {
  test(`#136 (4) [REC-8][HNT-2] al conclude ppp with ccc open, the part in the ${form} form ("${part}"): ${says ? 'the' : 'no'} "child request ccc is still open" note`, (t) => {
    const repo = named(t, part);
    const r = al(repo, 'conclude', 'ppp');
    ok(r, 'conclude ppp (a preview)');
    const line = lines(r.stdout).find((l) => /still open/.test(l));
    if (says) assert.ok(line && line.includes('child request ccc is still open'), `a note "child request ccc is still open":\n${r.stdout}`);
    else assert.ok(!line, `no "still open" note, since no part names a child:\n${r.stdout}`);
  });
}

// --- (8) a MUST, SHOULD or MAY line outside any requirement ---

// On the branch: promise, signed with `organized`, and A-1 edited, committed with Request: promise.
function unlabelled(t, organized) {
  const repo = signedTier1(t, organized, file(A1B, A2));
  repo.commit(message('The promise says new', { request: 'promise', tier: '1 — promise' }), { date: '2026-09-24T12:00:00Z' });
  return repo;
}
const NOT_READ = 'not read as a requirement';

test('#136 (8) [REC-4][HNT-2] "The promise MUST say new. Amends: [A-1]" in the organized section with no R label: a note in check and in context promise, naming promise and saying "not read as a requirement"; check --strict exits 0', (t) => {
  const repo = unlabelled(t, org('The promise MUST say new. Amends: [A-1]'));
  hint(check(repo, '--all'), 'note', NOT_READ, 'promise');
  hint(context(repo, 'promise', '--all'), 'note', NOT_READ, 'promise');
  strict(repo, 0);
});

const LABELLED = 'R1: The promise MUST say new. Amends: [A-1]';
for (const [label, organized] of [
  ['the same line labelled "R1:"', org(LABELLED)],
  ['a line with MUST in a ``` fence before R1', org('For example:', '', '```', 'The promise MUST say new.', '```', '', LABELLED)],
  ['MAY and MUST in Out: and Assumed: lines before R1', org('Out: anything the owner MAY add later.', '', 'Assumed: the page MUST stay as it is.', '', LABELLED)],
]) {
  test(`#136 (8) [REC-4] contrast: ${label}: no "${NOT_READ}" note`, (t) => {
    const repo = unlabelled(t, organized);
    noHint(check(repo, '--all'), NOT_READ);
    noHint(context(repo, 'promise', '--all'), NOT_READ);
  });
}
