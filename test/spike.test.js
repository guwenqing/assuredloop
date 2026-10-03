// Issue #128 [REC-10][REC-1]: a spike (tier S) is a signed organized question
// and `findings.md`, which starts with its Answer; no spec change. Tier 0,
// hints only: for a tier-S request, a note in al context <name>, in al check,
// and a "note:" line in al conclude <name> (preview and --yes) when
// findings.md is missing, when it does not start with its Answer (its first
// non-blank line, after any leading "#" marks and spaces, begins with the
// word Answer), and when the request edits the baseline. conclude still
// concludes: exit 0, the Outcome, Status: concluded, the folder archived
// [STA-7]. No such note for a request of another tier, nor for a good spike.
// Through the real CLI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, runAl } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';
import { ENV, addRequest, both, outcome } from './helpers/request.js';
import { file } from './helpers/links.js';
import { check, hint, message, noHint } from './helpers/hints.js';

const A1 = '## [A-1] Import\nThe CSV import MUST finish within a minute for 100 MB.\n';
const A1B = '## [A-1] Import\nThe CSV import MUST finish within a minute for 1 GB.\n';
const A2 = '## [A-2] Errors\nA bad row MUST be reported with its line number.\n';
const QUESTION = '\n## Organized question\n\nIs the CSV import fast enough for a 1 GB file? ' +
  'A useful answer is a timing on a real file. Out: other formats.\n';

const NAME = 'csv-speed';
const DIR = `requests/${NAME}`;
const ARCHIVE = `requests/archive/${NAME}`;
const MISSING = 'no findings.md';
const NOT_FIRST = 'findings.md does not start with its Answer';
const BASELINE = 'edits the baseline';

const GOOD = '# Answer\n\nYes: 1 GB imports in 41 seconds.\n\n## How we measured\n\nOne run on a laptop.\n';
const TITLE_FIRST = '# CSV speed findings\n\nWe timed the import.\n\n## Answer\n\nYes: 41 seconds.\n';

const al = (repo, args, input) => runAl(repo.dir, args, { input, env: ENV });
const ok = (r, what) => assert.equal(r.code, 0, `${what} should exit 0:\n${both(r)}`);
const read = (repo, rel) => repo.read(rel).toString();
function context(repo, ...args) {
  const r = al(repo, ['context', ...args]);
  ok(r, `context ${args.join(' ')}`);
  assertFrame(r.stdout);
  return r.stdout;
}
// al conclude <name> [--yes]: exit 0, three lines or fewer under the frame [STA-7].
function conclude(repo, ...args) {
  const r = al(repo, ['conclude', NAME, ...args]);
  ok(r, `conclude ${NAME} ${args.join(' ')}`);
  assertFrame(r.stdout);
  assert.ok(lines(r.stdout).length <= 6, `three lines or fewer under the frame:\n${r.stdout}`);
  return r.stdout;
}
// conclude's "note:" line naming the request and `text`.
function concludeNote(out, text) {
  const line = lines(out).find((l) => l.startsWith('note: ') && l.includes(NAME) && l.includes(text));
  assert.ok(line, `expected a "note: " line with ${NAME} and "${text}":\n${out}`);
  return line;
}
// None of the three spike notes for `name`, as a hint or a conclude note line.
function noSpikeNotes(out, name = NAME) {
  for (const text of [MISSING, NOT_FIRST, BASELINE]) noHint(out, name, text);
}

// Main: specs/rules.md holding A-1 and A-2. On the branch csv-speed: al new
// csv-speed --tier S, the organized question appended, signed with al record
// signoff --yes, `findings` (when given) as findings.md, all committed with
// "Request: csv-speed".
function spike(t, { findings } = {}) {
  const repo = makeRepo(t);
  repo.write('specs/rules.md', file(A1, A2));
  repo.commit('Baseline', { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', NAME]);
  ok(al(repo, ['new', NAME, '--tier', 'S', '--from', '-'], 'Is the CSV import fast enough for big files?\n'), 'new');
  const md = `${DIR}/request.md`;
  repo.write(md, read(repo, md) + QUESTION);
  ok(al(repo, ['record', NAME, 'signoff', '--source', 'chat with the owner', '--yes']), 'record signoff');
  if (findings !== undefined) repo.write(`${DIR}/findings.md`, findings);
  repo.commit(message('Ask whether the CSV import is fast enough', { request: NAME, tier: 'S — csv speed' }), { date: '2026-09-24T12:00:00Z' });
  const text = read(repo, md);
  assert.match(text, /^Tier: S · Status: open$/m, `the fixture: a tier-S request, open:\n${text}`);
  assert.match(text, /^Signed off: \d{4}-\d\d-\d\d /m, `the fixture: signed:\n${text}`);
  assert.equal(existsSync(join(repo.dir, DIR, 'findings.md')), findings !== undefined, 'the fixture: findings.md as given');
  assert.doesNotMatch(lines(context(repo, NAME))[0], /^BLOCKED/, 'the fixture: not blocked');
  return repo;
}
// A commit on the branch that changes A-1, with "Request: <request>".
function editBaseline(repo, request = NAME) {
  repo.write('specs/rules.md', file(A1B, A2));
  repo.commit(message('Raise the import target to 1 GB', { request, tier: 'S — csv speed' }), { date: '2026-09-25T12:00:00Z' });
  assert.ok(repo.git(['diff', '--name-only', 'main..HEAD']).split('\n').includes('specs/rules.md'), 'the fixture: the branch changes specs/rules.md');
}
// Archived as concluded, with every file moved, findings.md as `findings`.
function assertConcluded(repo, findings) {
  assert.ok(!existsSync(join(repo.dir, DIR)), `${DIR}/ should be gone`);
  const md = read(repo, `${ARCHIVE}/request.md`);
  assert.match(md, /^Tier: S · Status: concluded$/m, `Status: concluded:\n${md}`);
  outcome(md);
  assert.equal(existsSync(join(repo.dir, ARCHIVE, 'findings.md')), findings !== undefined, 'findings.md archived as it was');
  if (findings !== undefined) assert.equal(read(repo, `${ARCHIVE}/findings.md`), findings);
}

// --- no findings.md ---

test('#128 [REC-10] a signed spike with no findings.md: context csv-speed gives a note, "no findings.md", naming a command', (t) => {
  const repo = spike(t);
  hint(context(repo, NAME), 'note', NAME, MISSING);
});

test('#128 [REC-10] a signed spike with no findings.md: al check gives a note, "no findings.md"', (t) => {
  const repo = spike(t);
  hint(check(repo), 'note', NAME, MISSING);
});

test('#128 [REC-10][STA-7] a signed spike with no findings.md: conclude without --yes prints a "note:" line, exits 0 and writes nothing', (t) => {
  const repo = spike(t);
  const out = conclude(repo);
  concludeNote(out, MISSING);
  assert.ok(lines(out).some((l) => l.startsWith('Would')), `still a "Would" line:\n${out}`);
  assert.equal(repo.git(['status', '--porcelain']), '', 'nothing should be written');
});

test('#128 [REC-10][STA-7] a signed spike with no findings.md: conclude --yes prints the "note:" line and still concludes: Outcome, Status: concluded, archived', (t) => {
  const repo = spike(t);
  concludeNote(conclude(repo, '--yes'), MISSING);
  assertConcluded(repo);
});

test('#128 [REC-10][STA-7] today\'s behaviour kept: a signed spike with no findings.md still concludes with --yes, exit 0, and is archived', (t) => {
  const repo = spike(t);
  conclude(repo, '--yes');
  assertConcluded(repo);
});

test('#128 [REC-10] a spike written by hand, "Type: spike · Tier: S · Status: open", with no findings.md: context and check give the note', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/rules.md', file(A1, A2));
  repo.commit('Baseline', { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', NAME]);
  const org = QUESTION.trimStart();
  addRequest(repo, NAME, null, { line: 'Type: spike · Tier: S · Status: open', org, signedText: org, decisions: '' });
  repo.commit(message('Ask', { request: NAME, tier: 'S — csv speed' }), { date: '2026-09-24T12:00:00Z' });
  hint(context(repo, NAME, '--all'), 'note', NAME, MISSING);
  hint(check(repo, '--all'), 'note', NAME, MISSING);
});

// --- findings.md that does not start with its Answer ---

const NOT_FIRSTS = {
  'a title heading first, "## Answer" later': TITLE_FIRST,
  'prose first, "## Answer" later': 'We timed the import on a 1 GB file.\n\n## Answer\n\nYes: 41 seconds.\n',
  'an empty findings.md': '',
};

for (const [label, findings] of Object.entries(NOT_FIRSTS)) {
  test(`#128 [REC-10] findings.md with ${label}: a note, "findings.md does not start with its Answer", in context, check and conclude; no "no findings.md"`, (t) => {
    const repo = spike(t, { findings });
    const ctx = context(repo, NAME, '--all');
    hint(ctx, 'note', NAME, NOT_FIRST);
    noHint(ctx, NAME, MISSING);
    hint(check(repo, '--all'), 'note', NAME, NOT_FIRST);
    concludeNote(conclude(repo), NOT_FIRST);
  });
}

test('#128 [REC-10][STA-7] findings.md with its Answer later: conclude --yes prints the note and still concludes', (t) => {
  const repo = spike(t, { findings: TITLE_FIRST });
  concludeNote(conclude(repo, '--yes'), NOT_FIRST);
  assertConcluded(repo, TITLE_FIRST);
});

// --- a good spike ---

const GOODS = {
  '"# Answer"': GOOD,
  '"## Answer: yes"': '## Answer: yes\n\n1 GB imports in 41 seconds.\n',
  '"Answer: yes, 3x faster", no heading': 'Answer: yes, 3x faster.\n\nHow we measured: one run.\n',
  'blank lines, then "# Answer"': '\n\n# Answer\n\nYes.\n',
};

for (const [label, findings] of Object.entries(GOODS)) {
  test(`#128 [REC-10] a good spike, findings.md starting ${label}, no baseline edit: no spike note in context, check or conclude`, (t) => {
    const repo = spike(t, { findings });
    noSpikeNotes(context(repo, NAME, '--all'));
    noSpikeNotes(check(repo, '--all'));
    noSpikeNotes(conclude(repo));
  });
}

test('#128 [REC-10][STA-7] a good spike: conclude --yes gives no spike note, writes the Outcome, sets Status: concluded and archives the folder with findings.md', (t) => {
  const repo = spike(t, { findings: GOOD });
  noSpikeNotes(conclude(repo, '--yes'));
  assertConcluded(repo, GOOD);
});

// --- a spike that edits the baseline ---

test('#128 [REC-10] a spike whose branch changes A-1 in a commit with "Request: csv-speed": a note, "edits the baseline", in context and check', (t) => {
  const repo = spike(t, { findings: GOOD });
  editBaseline(repo);
  hint(context(repo, NAME, '--all'), 'note', NAME, BASELINE);
  hint(check(repo, '--all'), 'note', NAME, BASELINE);
});

test('#128 [REC-10][STA-7] a spike whose branch changes A-1 with "Request: csv-speed": conclude prints the note, preview and --yes, and still concludes', (t) => {
  const repo = spike(t, { findings: GOOD });
  editBaseline(repo);
  concludeNote(conclude(repo), BASELINE);
  concludeNote(conclude(repo, '--yes'), BASELINE);
  assertConcluded(repo, GOOD);
});

test('#128 [REC-10] a spike with an uncommitted change to A-1 in the working tree: conclude prints "edits the baseline"', (t) => {
  const repo = spike(t, { findings: GOOD });
  repo.write('specs/rules.md', file(A1B, A2));
  concludeNote(conclude(repo), BASELINE);
});

test('#128 [REC-10][LNK-2] contrast: the branch changes A-1 for another request ("Request: other"): no "edits the baseline" note for csv-speed', (t) => {
  const repo = spike(t, { findings: GOOD });
  const org = '## Organized requirement\n\nR1: The CSV import MUST finish within a minute for 1 GB. Amends: [A-1]\n';
  addRequest(repo, 'other', null, { line: 'Type: story · Tier: 1 · Status: open', org, signedText: org, decisions: '' });
  repo.commit(message('other: request', { request: 'other', tier: '1 — other' }), { date: '2026-09-24T13:00:00Z' });
  editBaseline(repo, 'other');
  noHint(context(repo, NAME, '--all'), NAME, BASELINE);
  noHint(check(repo, '--all'), NAME, BASELINE);
  noSpikeNotes(conclude(repo));
});

// --- archived on the branch ---

test('#128 [REC-10][STA-8] a spike this branch archives with no findings.md: al check gives the note "no findings.md"', (t) => {
  const repo = spike(t);
  conclude(repo, '--yes');
  repo.commit(message('Conclude csv-speed', { request: NAME, tier: 'S — csv speed' }), { date: '2026-09-26T12:00:00Z' });
  assert.ok(existsSync(join(repo.dir, ARCHIVE, 'request.md')), 'the fixture: archived on the branch');
  hint(check(repo, '--all'), 'note', NAME, MISSING);
});

test('#128 [REC-10][STA-8] a spike this branch archives whose findings.md has its Answer later: al check gives the note', (t) => {
  const repo = spike(t, { findings: TITLE_FIRST });
  conclude(repo, '--yes');
  repo.commit(message('Conclude csv-speed', { request: NAME, tier: 'S — csv speed' }), { date: '2026-09-26T12:00:00Z' });
  hint(check(repo, '--all'), 'note', NAME, NOT_FIRST);
});

test('#128 [REC-10][STA-8] a spike this branch archives that edited A-1 with "Request: csv-speed": al check gives "edits the baseline"', (t) => {
  const repo = spike(t, { findings: GOOD });
  editBaseline(repo);
  conclude(repo, '--yes');
  repo.commit(message('Conclude csv-speed', { request: NAME, tier: 'S — csv speed' }), { date: '2026-09-26T12:00:00Z' });
  hint(check(repo, '--all'), 'note', NAME, BASELINE);
});

test('#128 [REC-10][STA-8] a good spike this branch archives: no spike note in al check', (t) => {
  const repo = spike(t, { findings: GOOD });
  conclude(repo, '--yes');
  repo.commit(message('Conclude csv-speed', { request: NAME, tier: 'S — csv speed' }), { date: '2026-09-26T12:00:00Z' });
  noSpikeNotes(check(repo, '--all'));
});

// --- not a spike ---

test('#128 [REC-10] a tier-1 request with no findings.md whose branch edits A-1: no spike note in context, check or conclude, and it concludes', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/rules.md', file(A1, A2));
  repo.commit('Baseline', { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', NAME]);
  ok(al(repo, ['new', NAME, '--tier', '1', '--from', '-'], 'Make the import handle 1 GB.\n'), 'new');
  const md = `${DIR}/request.md`;
  repo.write(md, read(repo, md) + '\n## Organized requirement\n\nR1: The CSV import MUST finish within a minute for 1 GB. Amends: [A-1]\n');
  ok(al(repo, ['record', NAME, 'signoff', '--source', 'chat with the owner', '--yes']), 'record signoff');
  repo.commit(message('csv-speed: request', { request: NAME, tier: '1 — csv speed' }), { date: '2026-09-24T12:00:00Z' });
  repo.write('specs/rules.md', file(A1B, A2));
  repo.commit(message('Raise the import target to 1 GB', { request: NAME, tier: '1 — csv speed' }), { date: '2026-09-25T12:00:00Z' });
  assert.match(read(repo, md), /^Tier: 1 · Status: open$/m, 'the fixture: tier 1');
  noSpikeNotes(context(repo, NAME, '--all'));
  noSpikeNotes(check(repo, '--all'));
  noSpikeNotes(conclude(repo));
  noSpikeNotes(conclude(repo, '--yes'));
  assert.match(read(repo, `${ARCHIVE}/request.md`), /^Tier: 1 · Status: concluded$/m);
});
