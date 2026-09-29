// A requirement's fate from its Amends: line (tier 0, the architect's
// ruling): a tier-1 record names the sections it amends with `Amends: [ID],
// [ID]` in its organized requirement, and those sections count as that
// requirement's sections, in conclude's Outcome [REC-9] ("each
// requirement's fate (in which sections, or in none)") and for check's note
// "a requirement in no section at conclusion" [HNT-2]. An Amends: line
// inside R<n>'s sub-section counts for R<n> only; one elsewhere in the
// organized section (before the first R, or after Out:/Assumed:) counts for
// every R. A tier-2 request still takes each fate from `for R<n>` on its
// change.md blocks; when both apply, the IDs are listed together, each once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { block } from './helpers/change.js';
import { ENV, addRequest, both, outcome } from './helpers/request.js';
import { file } from './helpers/links.js';
import { check, hint, message, noHint } from './helpers/hints.js';

const A1 = '## [A-1] Grouping\nThe view MAY group repeated output.\n';
const A1B = '## [A-1] Grouping\nThe view MAY group repeated output, and MUST NOT leave a section out.\n';
const VW2 = '## [VW-2] Where a request stands\n`al context <name>` MUST print twelve lines or fewer.\n';
const VW2B = '## [VW-2] Where a request stands\n`al context <name>` MUST print twelve lines or fewer, grouped.\n';
const VW6 = '## [VW-6] Archived requests\nAn archived request MUST show each of its sections.\n';
const VW6B = '## [VW-6] Archived requests\nAn archived request MUST show each of its sections, grouped.\n';
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const INV1B = '## [INV-1] Totals\nTotals MUST show two decimals, rounded half up.\n';

const TIER1 = 'Type: story · Tier: 1 · Status: open';
const TIER2 = 'Type: story · Tier: 2 · Status: open';
const org = (body) => `## Organized requirement\n\n${body}`;

const al = (repo, ...args) => runAl(repo.dir, args, { env: ENV });
const ok = (r, what) => assert.equal(r.code, 0, `${what}:\n${both(r)}`);

// Main: `baseline` in specs/views.md, and the signed request `name` with
// the organized requirement `organized` (and `blocks` in change.md, when
// given). The branch writes `after` as the baseline (the amend), concludes
// the request with the tool, and commits. Returns { repo, generated }: the
// Outcome's generated lines.
function concluded(t, { name = 'grouping', line = TIER1, organized, blocks = null, baseline, after }) {
  const repo = makeRepo(t);
  repo.write('specs/views.md', baseline);
  addRequest(repo, name, blocks, { line, org: organized, signedText: organized, decisions: '' });
  repo.commit(message(`${name}: request`, { request: name, tier: `${line.match(/Tier: (\S+)/)[1]} — ${name}` }), { date: '2026-09-28T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', name]);
  repo.write('specs/views.md', after);
  if (blocks) ok(al(repo, 'consolidate', name, '--yes'), 'consolidate');
  ok(al(repo, 'conclude', name, '--yes'), 'conclude');
  repo.commit(message(`${name}: amend and conclude`, { request: name, tier: `${line.match(/Tier: (\S+)/)[1]} — ${name}` }), { date: '2026-09-29T12:00:00Z' });
  const md = repo.read(`requests/archive/${name}/request.md`).toString();
  return { repo, generated: outcome(md).generated };
}
// The Outcome line of R<n>.
function fate(generated, n) {
  const line = generated.find((l) => l.startsWith(`- R${n} `));
  assert.ok(line, `the Outcome should have a line for R${n}:\n${generated.join('\n')}`);
  return line;
}
// The section IDs an Outcome line names.
const idsOf = (line) => [...line.matchAll(/\[([A-Z][A-Z0-9]*-\d+(?:\.\d+)*)\]/g)].map((m) => m[1]);

// --- a tier-1 request: R1 amends VW-2 and VW-6 ---

const R1_AMENDS = org('### R1 Grouped by default\n`al context <name>` MAY group repeated output, but MUST NOT leave out a section.\n\n' +
  'Amends: [VW-2], [VW-6]\n\nOut: `--audit`.\n');
const twoSections = (t) => concluded(t, { organized: R1_AMENDS, baseline: file(VW2, VW6), after: file(VW2B, VW6B) });

test('[REC-9] a tier-1 request whose R1 says "Amends: [VW-2], [VW-6]" concludes with "- R1 Grouped by default: in [VW-2], [VW-6]", not in no section', (t) => {
  const { generated } = twoSections(t);
  assert.equal(fate(generated, 1), '- R1 Grouped by default: in [VW-2], [VW-6]');
});

test('[HNT-2] check on the branch that archives that tier-1 request gives no "in no section" note for R1', (t) => {
  const { repo } = twoSections(t);
  noHint(check(repo, '--all'), 'in no section');
});

test('[HNT-2][REC-9] contrast: the same tier-1 request with no Amends: line is "in no section" in the Outcome and gets the note', (t) => {
  const organized = org('### R1 Grouped by default\n`al context <name>` MAY group repeated output, but MUST NOT leave out a section.\n\nOut: `--audit`.\n');
  const { repo, generated } = concluded(t, { organized, baseline: file(VW2, VW6), after: file(VW2B, VW6B) });
  assert.equal(fate(generated, 1), '- R1 Grouped by default: in no section');
  hint(check(repo, '--all'), 'note', 'in no section', /\bR1\b/);
});

// --- where the Amends: line sits ---

const R1 = '### R1 Grouping\nThe view MAY group repeated output.\n';
const R2 = '### R2 Nothing left out\nThe view MUST NOT leave a section out.\n';
const placed = (t, organized) => concluded(t, { organized, baseline: A1, after: A1B });

test('[REC-9] an Amends: line inside R1\'s sub-section counts for R1 only: R1 in [A-1], R2 in no section; check notes R2 only', (t) => {
  const { repo, generated } = placed(t, org(`${R1}\nAmends: [A-1]\n\n${R2}\nOut: nothing else.\n`));
  assert.equal(fate(generated, 1), '- R1 Grouping: in [A-1]');
  assert.equal(fate(generated, 2), '- R2 Nothing left out: in no section');
  const out = check(repo, '--all');
  hint(out, 'note', 'in no section', /\bR2\b/);
  noHint(out, 'note', 'in no section', /\bR1\b/);
});

test('[REC-9] a standalone Amends: line before ### R1 counts for every R-line: R1 and R2 in [A-1]; check gives no "in no section" note', (t) => {
  const { repo, generated } = placed(t, org(`Amends: [A-1]\n\n${R1}\n${R2}\nOut: nothing else.\n`));
  assert.equal(fate(generated, 1), '- R1 Grouping: in [A-1]');
  assert.equal(fate(generated, 2), '- R2 Nothing left out: in [A-1]');
  noHint(check(repo, '--all'), 'in no section');
});

test('[REC-9] a standalone Amends: line after Out: and Assumed: counts for every R-line: R1 and R2 in [A-1]', (t) => {
  const { generated } = placed(t, org(`${R1}\n${R2}\nOut: nothing else.\n\nAssumed:\n- one view.\n\nAmends: [A-1]\n`));
  assert.equal(fate(generated, 1), '- R1 Grouping: in [A-1]');
  assert.equal(fate(generated, 2), '- R2 Nothing left out: in [A-1]');
});

// --- tier 2: for R<n> on the blocks, with an Amends: line or without ---

const T2_R1 = '### R1 Totals\nTotals MUST show two decimals, rounded half up.\n';
const T2_R2 = '### R2 Dates\nDates MUST show in ISO 8601.\n';
const tier2 = (t, organized) => concluded(t, {
  name: 'iso-dates', line: TIER2, organized,
  blocks: [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })],
  baseline: file(INV1, S0), after: file(INV1B, S0),
});

test('[REC-9] contrast, unchanged: a tier-2 request takes each fate from for R<n> on its blocks: R2 in [INV-3], R1 in no section', (t) => {
  const { generated } = tier2(t, org(`${T2_R1}\n${T2_R2}\nOut: PDF.\n`));
  assert.equal(fate(generated, 2), '- R2 Dates: in [INV-3]');
  assert.equal(fate(generated, 1), '- R1 Totals: in no section');
});

test('[REC-9] both sources: R2 with a for R2 block on INV-3 and "Amends: [INV-1], [INV-3]" under it lists INV-1 and INV-3, each once', (t) => {
  const { generated } = tier2(t, org(`${T2_R1}\n${T2_R2}\nAmends: [INV-1], [INV-3]\n\nOut: PDF.\n`));
  const line = fate(generated, 2);
  assert.match(line, /^- R2 Dates: in \[/, line);
  assert.deepEqual(idsOf(line).sort(), ['INV-1', 'INV-3'], `INV-1 and INV-3, each once:\n${line}`);
  assert.equal(fate(generated, 1), '- R1 Totals: in no section');
});

// --- Amends: anywhere on a line, as the tier-1 skeleton writes it ---

const A2 = '## [A-2] Order\nGroups keep their first-seen order.\n';
const inline = (t, organized) => concluded(t, { organized, baseline: file(A1, A2), after: file(A1B, A2) });

test('[REC-9] "Amends:" at the end of a sentence in R1 counts for R1 only; the IDs are the bracketed ones after it on that line, not [A-2] before it', (t) => {
  const r1 = '### R1 Grouping\nThe view MAY group repeated output, in the order of [A-2]. Amends: [A-1]\n';
  const { generated } = inline(t, org(`${r1}\n${R2}\nOut: nothing else.\n`));
  assert.equal(fate(generated, 1), '- R1 Grouping: in [A-1]');
  assert.equal(fate(generated, 2), '- R2 Nothing left out: in no section');
});

test('[REC-9] "Amends:" at the end of a sentence before ### R1 counts for every R-line: R1 and R2 in [A-1]', (t) => {
  const { generated } = inline(t, org(`The view changes what it prints. Amends: [A-1]\n\n${R1}\n${R2}\nOut: nothing else.\n`));
  assert.equal(fate(generated, 1), '- R1 Grouping: in [A-1]');
  assert.equal(fate(generated, 2), '- R2 Nothing left out: in [A-1]');
});

test('[REC-9] the design\'s tier-1 skeleton: R1 ends its sentence with "Amends: [INV-4]" and concludes "in [INV-4]"', (t) => {
  const INV4 = '## [INV-4] Totals\nAn invoice total MUST show two decimals.\n';
  const INV4B = '## [INV-4] Totals\nAn invoice total MUST show two decimals for every currency, including JPY.\n';
  const r1 = '### R1 Two decimals in JPY\nAn invoice total MUST show two decimals for every currency, including JPY. Amends: [INV-4]\n';
  const { generated } = concluded(t, { name: 'jpy-decimals', organized: org(r1), baseline: INV4, after: INV4B });
  assert.equal(fate(generated, 1), '- R1 Two decimals in JPY: in [INV-4]');
});
