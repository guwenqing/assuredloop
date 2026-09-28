// The tier claim [REC-11][REC-10]: the last `Tier: <x> — <claim>` line in the
// commit messages over main..HEAD. check shows it on a Tier line, with its
// evidence: the baseline sections the branch edits, and the sections near the
// changed code [LNK-1]. A tier-0 claim with a baseline edit is a "not ok" no
// request owns, so check --strict exits 1 [HNT-3]; no Tier line at all is a
// note [HNT-2]. The review view's intent part shows the claim [VW-4].
// Acceptance C4 (the tier-claim fixtures).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { addRequest, both, hasId } from './helpers/request.js';
import { file, indexOf } from './helpers/links.js';
import { assertCounts, check, checkHints, hint, kindOf, message, noHint, strict } from './helpers/hints.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const INV4 = '## [INV-4] Separator\nThe CSV separator is a comma.\n';
const EXPORT = (sep) => `// [INV-4] Separator\nexport const separator = "${sep}";\n`;

// Main: the baseline INV-1, INV-3 and INV-4; src/export.js under an [INV-4]
// marker; iso-dates, a signed tier-1 amend with no change.md. HEAD is the
// branch work.
function base(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0, INV4));
  repo.write('src/export.js', EXPORT(','));
  addRequest(repo, 'iso-dates', null, { line: 'Type: bug · Tier: 1 · Status: open' });
  repo.commit('Initial spec, code and iso-dates', { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  return repo;
}
const editCode = (repo) => repo.write('src/export.js', EXPORT(';'));
const editBaseline = (repo) => repo.write('specs/invoices.md', file(INV1, S1, INV4));

// The line starting with Tier.
function tierLine(out) {
  const line = lines(out).find((l) => /^Tier\b/.test(l));
  assert.ok(line, `expected a line starting with Tier:\n${out}`);
  return line;
}
const notOks = (out) => checkHints(out).filter((l) => kindOf(l) === 'not ok');
// The lines that are not hints: a hint naming the section is not the claim's evidence.
const evidence = (out) => lines(out).filter((l) => !kindOf(l));

test('C4 [REC-11] check shows the claim on a Tier line; a tier-0 claim on a code-only change is fine, and its evidence names INV-4, the section near the changed code', (t) => {
  const repo = base(t);
  editCode(repo);
  repo.commit(message('Restore the comma', { tier: '0 — restores the comma separator; no promise changes' }), { date: '2026-09-21T12:00:00Z' });
  const out = check(repo, '--all');
  const line = tierLine(out);
  assert.ok(line.includes('restores the comma separator; no promise changes') && /\b0\b/.test(line), `the Tier line holds the claim:\n${out}`);
  assert.ok(evidence(out).some((l) => hasId(l, 'INV-4')), `the evidence names INV-4, the section near src/export.js:\n${out}`);
  noHint(out, 'tier 0');
  noHint(out, 'no Tier line');
  strict(repo, 0);
});

test('C4 [REC-11][HNT-3] a tier-0 claim with a baseline edit is not ok, counting, and check --strict exits 1; the evidence names INV-3, the section it edits', (t) => {
  const repo = base(t);
  editBaseline(repo);
  repo.commit(message('Tidy the dates wording', { tier: '0 — tidy the dates wording' }), { date: '2026-09-21T12:00:00Z' });
  const out = check(repo, '--all');
  assert.ok(tierLine(out).includes('tidy the dates wording'), `the Tier line holds the claim:\n${out}`);
  assertCounts(hint(out, 'not ok', 'tier 0', 'main..HEAD', 'INV-3'));
  assert.ok(evidence(out).some((l) => hasId(l, 'INV-3')), `the evidence names INV-3, the baseline section edited:\n${out}`);
  strict(repo, 1);
});

test('C4 [REC-11][HNT-2] no Tier line in any commit is a note; the same branch with a Tier line has none', (t) => {
  const repo = base(t);
  editCode(repo);
  repo.commit('Restore the comma', { date: '2026-09-21T12:00:00Z' });
  assert.ok(!repo.git(['log', '--format=%B', 'main..HEAD']).includes('Tier:'), 'the fixture: no Tier line');
  const out = check(repo, '--all');
  hint(out, 'note', 'no Tier line', 'main..HEAD');
  noHint(out, 'tier 0');
  strict(repo, 0);

  repo.git(['commit', '-q', '--amend', '-m', message('Restore the comma', { tier: '0 — restores the comma separator' })], { date: '2026-09-21T12:00:00Z' });
  noHint(check(repo, '--all'), 'no Tier line');
});

test('C4 [REC-10][REC-11] a tier-1 claim with a baseline edit and its signed request passes: no not ok, no hotfix note (no one holds INV-3), check --strict exits 0, and the Tier line holds the claim', (t) => {
  const repo = base(t);
  editBaseline(repo);
  repo.commit(message('ISO dates', { request: 'iso-dates', tier: '1 — dates show in ISO 8601' }), { date: '2026-09-21T12:00:00Z' });
  const out = check(repo, '--all');
  assert.deepEqual(notOks(out), [], `no not ok:\n${out}`);
  noHint(out, 'hotfix');
  const line = tierLine(out);
  assert.ok(line.includes('dates show in ISO 8601') && /\b1\b/.test(line), `the Tier line holds the claim:\n${out}`);
  strict(repo, 0);
});

test('C4 [REC-11] the claim is the last Tier line over main..HEAD: tier 0 then tier 1 is tier 1 (no flag); tier 1 then tier 0 is tier 0 (flagged)', (t) => {
  const cases = [
    [['0 — tidy the dates wording', '1 — dates show in ISO 8601'], 'dates show in ISO 8601', 'tidy the dates wording', 0],
    [['1 — dates show in ISO 8601', '0 — tidy the dates wording'], 'tidy the dates wording', 'dates show in ISO 8601', 1],
  ];
  for (const [[first, last], shown, hidden, code] of cases) {
    const repo = base(t);
    editBaseline(repo);
    repo.commit(message('Dates', { request: 'iso-dates', tier: first }), { date: '2026-09-21T12:00:00Z' });
    repo.write('src/dates.js', 'export const format = "iso";\n');
    repo.commit(message('Dates in code', { request: 'iso-dates', tier: last }), { date: '2026-09-22T12:00:00Z' });
    const out = check(repo, '--all');
    const line = tierLine(out);
    assert.ok(line.includes(shown) && !line.includes(hidden), `the Tier line holds the last claim, "${shown}":\n${out}`);
    if (code) assertCounts(hint(out, 'not ok', 'tier 0'));
    else noHint(out, 'tier 0');
    strict(repo, code);
  }
});

test('C4 [VW-4][REC-11] context --diff --for review shows the tier claim in its intent part', (t) => {
  const repo = base(t);
  editBaseline(repo);
  repo.commit(message('ISO dates', { request: 'iso-dates', tier: '1 — dates show in ISO 8601' }), { date: '2026-09-21T12:00:00Z' });
  const r = runAl(repo.dir, ['context', '--diff', 'main...HEAD', '--for', 'review']);
  assert.equal(r.code, 0, both(r));
  const ls = lines(r.stdout);
  const i = indexOf(ls, /^[#\s]*Intent\b/i);
  const e = indexOf(ls, /^[#\s]*Evidence\b/i, i + 1);
  assert.ok(i >= 0 && e > i, `expected an Intent part, then an Evidence part:\n${r.stdout}`);
  assert.ok(ls.slice(i, e).some((l) => l.includes('dates show in ISO 8601')), `the intent part shows the claim:\n${r.stdout}`);
});
