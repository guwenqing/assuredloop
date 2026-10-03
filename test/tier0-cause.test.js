// Issue #156: a tier-0 (or tier-S) claim whose baseline edit is more than a
// move or an added ID is `not ok` [REC-10][REC-11], and the hint MUST name
// what it is about [HNT-1]. When the cause is not a changed, added or removed
// ID-bearing section, the not ok names it: the file and what changed. The
// wording, agreed for #156:
//   the claim is tier <0|S>, but <range> edits the baseline: <causes>
// IDs first, comma-joined ("[R-1], [R-4]"), then each other cause, joined
// with "; ", as "<file>, <what>", where <what> is one of
//   its intro text changed                   (text before the first heading)
//   a new heading without an ID: <heading>   (matches no section before)
//   the text under <heading> changed         (same file, same heading text)
//   a heading without an ID removed: <heading>
// <heading> is the heading line as written ("# Dates"), <file> the
// repo-relative path after (for a removal, the file it was in). The command
// stays al context --diff <range>, and al check --strict still exits 1.
// Moving a section unchanged into a new file, and giving an ID to a heading
// that had none, stay clean. Built from the spec text, the agreed wording and
// the CLI; nothing here reads the code under test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addOrigin, makeRepo, runAl } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { hasId } from './helpers/request.js';
import { file } from './helpers/links.js';
import { assertCounts, check, checkHints, hint, kindOf, message, noHint, strict } from './helpers/hints.js';

const R1 = '## [R-1] Totals\nTotals show two decimals.\n';
const R1_CHANGED = '## [R-1] Totals\nTotals show three decimals.\n';
const R3 = '## [R-3] Dates\nDates show in ISO 8601.\n';
const R4 = '## [R-4] Names\nNames show in full.\n';
const R4_CHANGED = '## [R-4] Names\nNames show as initials.\n';
const TITLE = '# Dates\n';
const INTRO = 'These promises cover how dates show.\n';
const TIER0 = '0 — splits the dates rules into their own file; no promise changes';
const TIERS = 'S — which date formats customers use; no spec change';

// Main holds `before`; branch `work` commits `after` (null removes the file)
// in one commit claiming `tier`. With `origin`, main is pushed to an origin
// first, so the range is origin/main..HEAD.
function branch(t, before, after, { tier = TIER0, origin = false } = {}) {
  const repo = makeRepo(t);
  for (const [path, text] of Object.entries(before)) repo.write(path, text);
  repo.commit('Baseline', { date: '2026-09-21T12:00:00Z' });
  if (origin) addOrigin(t, repo, { fetchedAt: '2026-09-21T13:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  for (const [path, text] of Object.entries(after)) {
    if (text === null) repo.git(['rm', '-q', path]);
    else repo.write(path, text);
  }
  repo.commit(message('Split the spec', { tier }), { date: '2026-09-22T12:00:00Z' });
  assert.ok(repo.git(['diff', '--name-only', 'main..HEAD']).split('\n').some((p) => p.startsWith('specs/')),
    'the fixture: the branch edits under specs/');
  return repo;
}

const notOks = (out) => checkHints(out).filter((l) => kindOf(l) === 'not ok');

// The one not ok saying the claim is tier `tier`; it names a command and counts.
function tierLine(out, tier) {
  const found = notOks(out).filter((l) => l.includes(`the claim is tier ${tier}`));
  assert.equal(found.length, 1, `expected one not ok saying "the claim is tier ${tier}", got ${found.length}:\n${out}`);
  hint(found[0], 'not ok', `the claim is tier ${tier}`);
  assertCounts(found[0]);
  return found[0];
}

// The causes the line names: the text after "edits the baseline: " and
// before the command, split at "; ". The line keeps its opening words and
// ends with the command al context --diff <range>.
function causesOf(line, tier, range) {
  const head = `not ok: the claim is tier ${tier}, but ${range} edits the baseline: `;
  assert.ok(line.startsWith(head), `the not ok should open ${JSON.stringify(head)}, then name its cause:\n${line}`);
  const command = `al context --diff ${range}`;
  assert.ok(line.endsWith(command), `the not ok should end with the command ${JSON.stringify(command)}:\n${line}`);
  const body = line.slice(head.length, line.length - command.length).replace(/\s*[;·—–-]?\s*$/, '');
  return body.split('; ');
}

// The line names exactly `ids` (first, comma-joined) and `others` (after, in any order).
function assertCauses(line, { tier = '0', range = 'main..HEAD', ids = [], others = [] }) {
  const causes = causesOf(line, tier, range);
  let rest = causes;
  if (ids.length) {
    const named = causes[0].split(', ');
    assert.ok(named.every((n) => /^\[[A-Z][A-Z0-9]*-\d+(\.\d+)*\]$/.test(n)),
      `the IDs come first, as "[R-1], [R-4]", before any other cause:\n${line}`);
    assert.deepEqual([...named].sort(), ids.map((i) => `[${i}]`).sort(), `the IDs named:\n${line}`);
    rest = causes.slice(1);
  }
  assert.deepEqual([...rest].sort(), [...others].sort(), `the causes other than IDs, each "<file>, <what>", joined with "; ":\n${line}`);
}

// --- the issue's case: a new file with a title heading ---

test('#156 [HNT-1][REC-11][REC-10] the issue\'s case: [R-3] moved unchanged from specs/rules.md to a new specs/dates.md that opens with "# Dates": check --strict exits 1, its not ok names "specs/dates.md, a new heading without an ID: # Dates"', (t) => {
  const repo = branch(t, { 'specs/rules.md': file(R1, R3) },
    { 'specs/rules.md': R1, 'specs/dates.md': `${TITLE}\n${R3}` });
  const out = strict(repo, 1);
  const evidence = lines(out).find((l) => /^Evidence\b/.test(l)) ?? '';
  assert.ok(hasId(evidence, 'R-3') && /\bmove[sd]?\b/.test(evidence), `the fixture: the Evidence line names the move of R-3:\n${out}`);
  const line = tierLine(out, '0');
  assertCauses(line, { others: ['specs/dates.md, a new heading without an ID: # Dates'] });
  assert.ok(!hasId(line, 'R-3'), `R-3 moved unchanged; the not ok does not blame it:\n${line}`);
});

test('#156 [HNT-1][REC-11] the issue\'s case over origin/main..HEAD: the not ok reads "the claim is tier 0, but origin/main..HEAD edits the baseline: specs/dates.md, a new heading without an ID: # Dates", with the command al context --diff origin/main..HEAD', (t) => {
  const repo = branch(t, { 'specs/rules.md': file(R1, R3) },
    { 'specs/rules.md': R1, 'specs/dates.md': `${TITLE}\n${R3}` }, { origin: true });
  const r = runAl(repo.dir, ['check', '--strict']);
  assert.equal(r.code, 1, `check --strict should exit 1:\n${r.stdout}\n${r.stderr}`);
  assertCauses(tierLine(r.stdout, '0'), { range: 'origin/main..HEAD', others: ['specs/dates.md, a new heading without an ID: # Dates'] });
});

// --- intro text ---

test('#156 [HNT-1][REC-11] [R-3] moved unchanged into a new specs/dates.md that opens with an intro line: check --strict exits 1, its not ok names "specs/dates.md, its intro text changed"', (t) => {
  const repo = branch(t, { 'specs/rules.md': file(R1, R3) },
    { 'specs/rules.md': R1, 'specs/dates.md': `${INTRO}\n${R3}` });
  const line = tierLine(strict(repo, 1), '0');
  assertCauses(line, { others: ['specs/dates.md, its intro text changed'] });
});

test('#156 [HNT-1][REC-11] the intro line of specs/rules.md changed in place, every section the same: the not ok names "specs/rules.md, its intro text changed"', (t) => {
  const repo = branch(t, { 'specs/rules.md': `${INTRO}\n${file(R1, R3)}` },
    { 'specs/rules.md': `These promises cover how dates and totals show.\n\n${file(R1, R3)}` });
  assertCauses(tierLine(strict(repo, 1), '0'), { others: ['specs/rules.md, its intro text changed'] });
});

test('#156 [HNT-1][REC-11] [R-3] moved unchanged out of specs/old.md, which has an intro line and is removed, into specs/rules.md: the not ok names "specs/old.md, its intro text changed"', (t) => {
  const repo = branch(t, { 'specs/old.md': `${INTRO}\n${R3}`, 'specs/rules.md': R1 },
    { 'specs/old.md': null, 'specs/rules.md': file(R1, R3) });
  assertCauses(tierLine(strict(repo, 1), '0'), { others: ['specs/old.md, its intro text changed'] });
});

// --- with changed ID-bearing sections ---

test('#156 [HNT-1][REC-11] [R-1] changed and a new specs/dates.md with an intro line: the not ok reads "...edits the baseline: [R-1]; specs/dates.md, its intro text changed"', (t) => {
  const repo = branch(t, { 'specs/rules.md': file(R1, R3) },
    { 'specs/rules.md': R1_CHANGED, 'specs/dates.md': `${INTRO}\n${R3}` });
  const line = tierLine(strict(repo, 1), '0');
  assertCauses(line, { ids: ['R-1'], others: ['specs/dates.md, its intro text changed'] });
  assert.ok(line.includes('edits the baseline: [R-1]; specs/dates.md, its intro text changed'), `IDs first, then the file's cause after "; ":\n${line}`);
});

test('#156 [HNT-1][REC-11] [R-1] and [R-4] changed and [R-3] moved into a new specs/dates.md titled "# Dates": the IDs come first, comma-joined, then "specs/dates.md, a new heading without an ID: # Dates"', (t) => {
  const repo = branch(t, { 'specs/rules.md': file(R1, R3, R4) },
    { 'specs/rules.md': file(R1_CHANGED, R4_CHANGED), 'specs/dates.md': `${TITLE}\n${R3}` });
  const line = tierLine(strict(repo, 1), '0');
  assertCauses(line, { ids: ['R-1', 'R-4'], others: ['specs/dates.md, a new heading without an ID: # Dates'] });
});

test('#156 [HNT-1][REC-11] a new specs/dates.md with both an intro line and a "# Dates" title: both causes are named, each as "specs/dates.md, <what>"', (t) => {
  const repo = branch(t, { 'specs/rules.md': file(R1, R3) },
    { 'specs/rules.md': R1, 'specs/dates.md': `${INTRO}\n${TITLE}\n${R3}` });
  assertCauses(tierLine(strict(repo, 1), '0'), {
    others: ['specs/dates.md, its intro text changed', 'specs/dates.md, a new heading without an ID: # Dates'],
  });
});

// --- headings without an ID that were there before ---

test('#156 [HNT-1][REC-11][SPC-4] the text under "# Rules", a heading without an ID in specs/rules.md, changed: the not ok names "specs/rules.md, the text under # Rules changed"', (t) => {
  const repo = branch(t, { 'specs/rules.md': `# Rules\nThese rules cover dates.\n\n${file(R1, R3)}` },
    { 'specs/rules.md': `# Rules\nThese rules cover dates and totals.\n\n${file(R1, R3)}` });
  assertCauses(tierLine(strict(repo, 1), '0'), { others: ['specs/rules.md, the text under # Rules changed'] });
});

test('#156 [HNT-1][REC-11] the heading "# Rules", without an ID, removed from specs/rules.md: the not ok names "specs/rules.md, a heading without an ID removed: # Rules"', (t) => {
  const repo = branch(t, { 'specs/rules.md': `# Rules\n\n${file(R1, R3)}` },
    { 'specs/rules.md': file(R1, R3) });
  assertCauses(tierLine(strict(repo, 1), '0'), { others: ['specs/rules.md, a heading without an ID removed: # Rules'] });
});

test('#156 [HNT-1][REC-11] [R-3] moved unchanged out of specs/old.md, titled "# Old" and removed, into specs/rules.md: the not ok names "specs/old.md, a heading without an ID removed: # Old"', (t) => {
  const repo = branch(t, { 'specs/old.md': `# Old\n\n${R3}`, 'specs/rules.md': R1 },
    { 'specs/old.md': null, 'specs/rules.md': file(R1, R3) });
  assertCauses(tierLine(strict(repo, 1), '0'), { others: ['specs/old.md, a heading without an ID removed: # Old'] });
});

test('#156 [HNT-1][REC-11][SPC-2] "## Dates", without an ID in specs/rules.md, gets the ID [R-5] and its body changes: the not ok names [R-5] and "specs/rules.md, a heading without an ID removed: ## Dates"', (t) => {
  const repo = branch(t, { 'specs/rules.md': file(R1, R4, '## Dates\nDates show in ISO 8601.\n') },
    { 'specs/rules.md': file(R1, R4, "## [R-5] Dates\nDates show in the customer's local format.\n") });
  const line = tierLine(strict(repo, 1), '0');
  assertCauses(line, { ids: ['R-5'], others: ['specs/rules.md, a heading without an ID removed: ## Dates'] });
  assert.ok(line.includes('edits the baseline: [R-5]; specs/rules.md, a heading without an ID removed: ## Dates'), `the ID, then the removal:\n${line}`);
});

// A section without an ID that was there before and matches nothing after is
// always named as removed: no section with an ID, new or old, same title or
// not, accounts for it. A redundant cause is acceptable; a hidden one is not.

test('#156 [HNT-1][REC-11][SPC-2] specs/a.md ("# Dates", no ID) deleted while [R-1] Dates, an ID that already existed, changes its body: the causes are exactly [R-1] and "specs/a.md, a heading without an ID removed: # Dates"', (t) => {
  const repo = branch(t, { 'specs/a.md': '# Dates\nAll dates are ISO.\n', 'specs/b.md': '## [R-1] Dates\nDates use UTC.\n' },
    { 'specs/a.md': null, 'specs/b.md': '## [R-1] Dates\nDates use local time.\n' });
  assertCauses(tierLine(strict(repo, 1), '0'), { ids: ['R-1'], others: ['specs/a.md, a heading without an ID removed: # Dates'] });
});

test('#156 [HNT-1][REC-11][SPC-2] two "## Dates" sections without an ID removed from specs/rules.md and one new [R-5] Dates added: the IDs part is [R-5], and "specs/rules.md, a heading without an ID removed: ## Dates" is named twice, once for each', (t) => {
  const repo = branch(t, { 'specs/rules.md': file(R1, '## Dates\nDates show in ISO 8601.\n', '## Dates\nDates show in UTC.\n') },
    { 'specs/rules.md': file(R1, "## [R-5] Dates\nDates show in the customer's local format and zone.\n") });
  assertCauses(tierLine(strict(repo, 1), '0'), {
    ids: ['R-5'],
    others: ['specs/rules.md, a heading without an ID removed: ## Dates', 'specs/rules.md, a heading without an ID removed: ## Dates'],
  });
});

test('#156 [HNT-1][REC-11][SPC-2] specs/a.md ("# Dates", no ID) deleted while [R-1] in specs/b.md is renamed [R-5], body unchanged: the IDs are [R-1], [R-5] and "specs/a.md, a heading without an ID removed: # Dates" is named', (t) => {
  const repo = branch(t, { 'specs/a.md': '# Dates\nAll dates are ISO.\n', 'specs/b.md': '## [R-1] Dates\nDates use UTC.\n' },
    { 'specs/a.md': null, 'specs/b.md': '## [R-5] Dates\nDates use UTC.\n' });
  assertCauses(tierLine(strict(repo, 1), '0'), { ids: ['R-1', 'R-5'], others: ['specs/a.md, a heading without an ID removed: # Dates'] });
});

test('#156 [HNT-1][REC-11][SPC-2] in one file, specs/rules.md, the "# Dates" section (no ID) deleted and [R-1] renamed [R-5], body unchanged: the IDs are [R-1], [R-5] and "specs/rules.md, a heading without an ID removed: # Dates" is named', (t) => {
  const repo = branch(t, { 'specs/rules.md': '# Dates\nAll dates are ISO.\n\n## [R-1] Dates\nDates use UTC.\n' },
    { 'specs/rules.md': '## [R-5] Dates\nDates use UTC.\n' });
  assertCauses(tierLine(strict(repo, 1), '0'), { ids: ['R-1', 'R-5'], others: ['specs/rules.md, a heading without an ID removed: # Dates'] });
});

// --- a Tier: S claim ---

test('#156 [HNT-1][REC-11][REC-10] a Tier: S claim whose branch moves [R-3] unchanged into a new specs/dates.md titled "# Dates": check --strict exits 1, its not ok reads "the claim is tier S, but main..HEAD edits the baseline: specs/dates.md, a new heading without an ID: # Dates"', (t) => {
  const repo = branch(t, { 'specs/rules.md': file(R1, R3) },
    { 'specs/rules.md': R1, 'specs/dates.md': `${TITLE}\n${R3}` }, { tier: TIERS });
  assertCauses(tierLine(strict(repo, 1), 'S'), { tier: 'S', others: ['specs/dates.md, a new heading without an ID: # Dates'] });
});

// --- contrast: still clean ---

function assertClean(repo) {
  const out = check(repo, '--all');
  noHint(out, 'not ok', /the claim is tier/);
  assert.deepEqual(notOks(out), [], `no not ok:\n${out}`);
  strict(repo, 0);
}

test('#156 [REC-10][REC-11] contrast: [R-3] moved unchanged into a new specs/dates.md with no title and no intro is not flagged, and check --strict exits 0', (t) => {
  assertClean(branch(t, { 'specs/rules.md': file(R1, R3) }, { 'specs/rules.md': R1, 'specs/dates.md': R3 }));
});

test('#156 [REC-10][REC-11][SPC-2] contrast: giving an ID to a heading that had none (al spec --add-ids) is not flagged, and check --strict exits 0', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/rules.md', '## Dates\nDates show in ISO 8601.\n');
  repo.commit('Baseline', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  const r = runAl(repo.dir, ['spec', '--add-ids', 'specs/rules.md', '--prefix', 'R', '--yes']);
  assert.equal(r.code, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(repo.read('specs/rules.md').toString('utf8'), /^## \[R-\d+\] Dates\nDates show in ISO 8601\.\n$/, 'the fixture: add-ids wrote only the ID');
  repo.commit(message('Number the dates rule', { tier: '0 — numbers a heading; no promise changes' }), { date: '2026-09-22T12:00:00Z' });
  assertClean(repo);
});
