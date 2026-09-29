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
import { check, checkHints, hint, kindOf, message, noHint } from './helpers/hints.js';

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
  if (blocks?.length) ok(al(repo, 'consolidate', name, '--yes'), 'consolidate');
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

// --- PR #94 review: the request's own work, and the fallback only without change.md ---

// The Outcome's list line `kind` of the archived request `name`.
const listOf = (repo, name, kind) => {
  const { generated } = outcome(repo.read(`requests/archive/${name}/request.md`).toString());
  return generated.find((g) => g.startsWith(`- ${kind}:`));
};

// Main: grouping (Amends: [A-1]) and exporting (Amends: [A-2]), both signed
// tier-1. On the branch `both`: the A-1 edit committed for grouping, then
// grouping concluded and committed; the A-2 edit committed for exporting,
// then exporting concluded and committed.
function twoRequests(t) {
  const repo = makeRepo(t);
  repo.write('specs/rules.md', file(A1, A2));
  for (const [name, id] of [['grouping', 'A-1'], ['exporting', 'A-2']]) {
    const org = organized(`[${id}]`);
    addRequest(repo, name, null, { line: TIER1, org, signedText: org, decisions: '' });
  }
  repo.commit('Two requests', { date: '2026-09-28T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'both']);
  const step = (name, baseline, day) => {
    repo.write('specs/rules.md', baseline);
    repo.commit(message(`${name}: the amend`, { request: name, tier: `1 — ${name}` }), { date: `2026-09-${day}T12:00:00Z` });
    ok(al(repo, 'conclude', name, '--yes'), `conclude ${name}`);
    repo.commit(message(`${name}: conclude`, { request: name, tier: `1 — ${name}` }), { date: `2026-09-${day}T13:00:00Z` });
  };
  step('grouping', file(A1B, A2), '29');
  step('exporting', file(A1B, A2B), '30');
  return repo;
}

test('[REC-9][LNK-2] PR #94: two tier-1 requests concluded on one branch each list only their own work: grouping Modified [A-1], exporting Modified [A-2]; check gives neither a note for the other\'s section', (t) => {
  const repo = twoRequests(t);
  assert.equal(listOf(repo, 'grouping', 'Modified'), '- Modified: [A-1]');
  assert.equal(listOf(repo, 'exporting', 'Modified'), '- Modified: [A-2]');
  const out = check(repo, '--all');
  noHint(out, 'note', 'exporting', 'A-1', /Amends/);
  noHint(out, 'note', 'grouping', 'A-2', /Amends/);
});

test('[REC-9] PR #94 pin: the baseline edited and concluded before the edit is committed, as the quick path does: the Outcome still lists it, Modified [A-1]', (t) => {
  const { lists } = concluded(t, { org: organized('[A-1]'), baseline: file(A1, A2), onBranch: (repo) => repo.write('specs/rules.md', file(A1B, A2)) });
  assert.deepEqual(lists, ['- Added: none', '- Modified: [A-1]', '- Removed: none']);
});

test('[REC-9][HNT-2] PR #94: the fallback is for a request with no change.md, not an empty one: a signed tier-2 request whose change.md has no blocks, on a branch that edits A-1 outside any block, keeps Modified none and gets no Amends: note', (t) => {
  const { repo, lists } = concluded(t, {
    line: TIER2, org: organized('[A-2]'), blocks: [], baseline: file(A1, A2), onBranch: edit(file(A1B, A2)),
  });
  assert.ok(repo.read('requests/archive/grouping/change.md').toString().includes('## Spec changes'), 'the fixture: change.md with an empty ## Spec changes');
  assert.deepEqual(lists, ['- Added: none', '- Modified: none', '- Removed: none']);
  noHint(check(repo, '--all'), 'note', /Amends/);
});

// --- PR #94 re-review: "did not change" is about the section; --at reads history up to X ---

test('[HNT-2] PR #94: A-1 edited and grouping concluded, the edit not yet committed: check gives no note that its Amends: names [A-1] "which did not change"; nor once the same bytes are committed', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/rules.md', file(A1, A2));
  const org = organized('[A-1]');
  addRequest(repo, 'grouping', null, { line: TIER1, org, signedText: org, decisions: '' });
  repo.commit(message('grouping: request', { request: 'grouping', tier: '1 — grouping' }), { date: '2026-09-28T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'grouping']);
  repo.write('specs/rules.md', file(A1B, A2));
  ok(al(repo, 'conclude', 'grouping', '--yes'), 'conclude');
  assert.notEqual(repo.git(['status', '--porcelain', '--', 'specs/rules.md']), '', 'the fixture: the A-1 edit is not committed');
  noHint(check(repo, '--all'), 'note', 'A-1', /Amends/);
  repo.commit(message('grouping: amend and conclude', { request: 'grouping', tier: '1 — grouping' }), { date: '2026-09-29T12:00:00Z' });
  noHint(check(repo, '--all'), 'note', 'A-1', /Amends/);
});

test('[VW-8][HNT-2] PR #94: check --at X scans the commits from the fork to X only: a later commit that edits A-2 for grouping does not add a "grouping changes [A-2]" note to the same check --all --at X', (t) => {
  const repo = twoRequests(t);
  const x = repo.head();
  const atX = () => {
    const r = runAl(repo.dir, ['check', '--all', '--at', x]);
    assert.equal(r.code, 0, both(r));
    const read = r.stdout.split('\n').find((l) => /^Read\b/.test(l));
    assert.ok(read && read.includes(x.slice(0, 7)), `the Read line should name ${x.slice(0, 7)}:\n${r.stdout}`);
    return { out: r.stdout, read };
  };
  const before = atX();
  assert.deepEqual(checkHints(before.out).filter((l) => kindOf(l) === 'note' && /Amends/.test(l)), [], `no Amends: note at X:\n${before.out}`);
  repo.write('specs/rules.md', file(A1B, sec('A-2', 'Groups keep their first-seen order, always.')));
  repo.commit(message('grouping: A-2 too', { request: 'grouping', tier: '1 — grouping' }), { date: '2026-10-01T12:00:00Z' });
  const after = atX();
  assert.deepEqual(checkHints(after.out).filter((l) => kindOf(l) === 'note' && /Amends/.test(l)), [], `a commit after X changes nothing at X:\n${after.out}`);
  assert.equal(after.read, before.read, 'both runs read the same commit');
});
