// The Outcome's Added, Modified and Removed lists for a request with no
// change.md (tier 1) [REC-9] (tier 0, the architect's ruling): conclude
// fills them from the baseline itself, comparing the baseline at the
// request's fork (the merge base of the branch with main) with the one in
// the working tree it concludes: there at the fork and changed now is
// Modified; not there at the fork and there now, Added; there at the fork
// and gone now, Removed. The lists come from that diff, not from the
// Amends: line: a named section the branch did not change is in none of
// them, and a changed section the line does not name is still listed. check
// notes each mismatch between the diff and the Amends: line [HNT-2]. A
// section changed only on main, merged into the branch, is in the merge
// base, so it is not the request's. A tier-2 request still takes the lists
// from its change.md blocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { block } from './helpers/change.js';
import { ENV, addRequest, both, outcome } from './helpers/request.js';
import { file } from './helpers/links.js';
import { check, hint, message, noHint } from './helpers/hints.js';

const sec = (id, text) => `## [${id}] Rule ${id}\n${text}\n`;
const A1 = sec('A-1', 'The view MAY group repeated output.');
const A1B = sec('A-1', 'The view MAY group repeated output, and MUST NOT leave a section out.');
const A2 = sec('A-2', 'Groups keep their first-seen order.');
const A2B = sec('A-2', 'Groups keep their first-seen order, and empty ones are left out.');
const A3 = sec('A-3', 'Runs of IDs are written with an en dash.');
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
const organized = (amends) => `## Organized requirement\n\n### R1 Grouping\nThe view MAY group repeated output. Amends: ${amends}\n`;

const al = (repo, ...args) => runAl(repo.dir, args, { env: ENV });
const ok = (r, what) => assert.equal(r.code, 0, `${what}:\n${both(r)}`);
const tierOf = (line) => line.match(/Tier: (\S+)/)[1];

// Main: specs/rules.md holding `baseline`, and the request `name`, signed
// with `org` (and `blocks` in change.md, when given). The branch `name`
// runs `onBranch` (the edits), consolidates when there are blocks,
// concludes with the tool, and commits. Returns { repo, lists }: the
// Outcome's Added, Modified and Removed lines.
function concluded(t, { name = 'grouping', line = TIER1, org, blocks = null, baseline, onBranch }) {
  const repo = makeRepo(t);
  repo.write('specs/rules.md', baseline);
  addRequest(repo, name, blocks, { line, org, signedText: org, decisions: '' });
  repo.commit(message(`${name}: request`, { request: name, tier: `${tierOf(line)} — ${name}` }), { date: '2026-09-28T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', name]);
  onBranch(repo);
  if (blocks) ok(al(repo, 'consolidate', name, '--yes'), 'consolidate');
  ok(al(repo, 'conclude', name, '--yes'), 'conclude');
  repo.commit(message(`${name}: conclude`, { request: name, tier: `${tierOf(line)} — ${name}` }), { date: '2026-09-30T12:00:00Z' });
  const { generated } = outcome(repo.read(`requests/archive/${name}/request.md`).toString());
  const lists = ['Added', 'Modified', 'Removed'].map((k) => {
    const l = generated.find((g) => g.startsWith(`- ${k}:`));
    assert.ok(l, `the Outcome should have a "- ${k}:" line:\n${generated.join('\n')}`);
    return l;
  });
  return { repo, lists };
}
// Write the baseline on the branch and commit it for the request.
const edit = (baseline) => (repo) => {
  repo.write('specs/rules.md', baseline);
  repo.commit(message('The amend', { request: 'grouping', tier: '1 — grouping' }), { date: '2026-09-29T12:00:00Z' });
};

test('[REC-9] 1: a tier-1 request with "Amends: [VW-2], [VW-6]" whose branch edits both: Modified [VW-2], [VW-6]; Added and Removed none', (t) => {
  const { repo, lists } = concluded(t, { org: organized('[VW-2], [VW-6]'), baseline: file(VW2, VW6), onBranch: edit(file(VW2B, VW6B)) });
  assert.deepEqual(lists, ['- Added: none', '- Modified: [VW-2], [VW-6]', '- Removed: none']);
  noHint(check(repo, '--all'), 'note', /Amends/);
});

test('[REC-9] 2: "Amends: [A-2], [A-3]", the branch removes A-2 and adds A-3: Added [A-3], Removed [A-2], Modified none', (t) => {
  const { lists } = concluded(t, { org: organized('[A-2], [A-3]'), baseline: file(A1, A2), onBranch: edit(file(A1, A3)) });
  assert.deepEqual(lists, ['- Added: [A-3]', '- Modified: none', '- Removed: [A-2]']);
});

test('[REC-9][HNT-2] 3: the Amends: line alone is not trusted: "Amends: [A-1], [A-2]", the branch changes A-1 only: Modified [A-1], A-2 in no list; check notes that A-2 did not change', (t) => {
  const { repo, lists } = concluded(t, { org: organized('[A-1], [A-2]'), baseline: file(A1, A2), onBranch: edit(file(A1B, A2)) });
  assert.deepEqual(lists, ['- Added: none', '- Modified: [A-1]', '- Removed: none']);
  hint(check(repo, '--all'), 'note', 'A-2', /Amends/);
});

test('[REC-9][HNT-2] 4: a changed section the Amends: line does not name is listed from the diff: "Amends: [A-1]", the branch changes A-1 and A-2: Modified [A-1], [A-2]; check notes that A-2 is changed but not named', (t) => {
  const { repo, lists } = concluded(t, { org: organized('[A-1]'), baseline: file(A1, A2), onBranch: edit(file(A1B, A2B)) });
  assert.deepEqual(lists, ['- Added: none', '- Modified: [A-1], [A-2]', '- Removed: none']);
  const out = check(repo, '--all');
  hint(out, 'note', 'A-2', /Amends/);
  noHint(out, 'note', 'A-1', /Amends/);
});

test('[REC-9] 5: main changes A-2 after the fork and is merged into the branch: A-2 is in the merge base, not the request\'s: Modified [A-1] only', (t) => {
  const { lists } = concluded(t, {
    org: organized('[A-1]'), baseline: file(A1, A2),
    onBranch: (repo) => {
      edit(file(A1B, A2))(repo);
      repo.git(['checkout', '-q', 'main']);
      repo.write('specs/rules.md', file(A1, A2B));
      repo.commit('A hotfix to A-2 on main', { date: '2026-09-29T13:00:00Z' });
      repo.git(['checkout', '-q', 'grouping']);
      repo.git(['merge', '-q', '--no-edit', 'main'], { date: '2026-09-29T14:00:00Z' });
      assert.equal(repo.read('specs/rules.md').toString(), file(A1B, A2B), 'the fixture: the branch holds both changes');
      assert.equal(repo.git(['merge-base', 'HEAD', 'main']), repo.git(['rev-parse', 'main']), 'the fixture: the fork is main\'s head');
    },
  });
  assert.deepEqual(lists, ['- Added: none', '- Modified: [A-1]', '- Removed: none']);
});

test('[REC-9] 6: contrast, unchanged: a tier-2 request takes the lists from its change.md blocks, not the diff: a for R1 block on INV-3 is Modified; INV-1, edited on the branch outside any block, is not listed', (t) => {
  const org2 = '## Organized requirement\n\n### R1 Dates\nDates MUST show in ISO 8601.\n';
  const { lists } = concluded(t, {
    name: 'iso-dates', line: TIER2, org: org2,
    blocks: [block('[INV-3]@1 modify   for R1', { was: S0, now: S1 })],
    baseline: file(INV1, S0),
    onBranch: (repo) => repo.write('specs/rules.md', file(INV1B, S0)),
  });
  assert.deepEqual(lists, ['- Added: none', '- Modified: [INV-3]', '- Removed: none']);
});
