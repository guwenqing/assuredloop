// Issue #102 [VW-6] (context-all, R1): an archived request with no
// change.md (a tier-1 record) shows its sections in al context <name> like
// any archived request, grouped by what [VW-6] says of each, and one per
// line with --all. Its sections are the baseline sections its own work
// changed, as the Outcome derives them (#94): changed by commits that map to
// it [LNK-2] (a Request: line, or its folder), merges left out, up to the
// commit viewed; not taken from its Amends: line. --at a commit before a
// later change reads "as at conclusion" [VW-8].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';
import { ENV, addRequest, both } from './helpers/request.js';
import { file } from './helpers/links.js';
import { message } from './helpers/hints.js';
import { stateOf } from './helpers/grouped.js';

const VW1 = '## [VW-1] Where the project stands\n`al context` MUST list the open requests.\n';
const VW2 = '## [VW-2] Where a request stands\n`al context <name>` MUST print twelve lines or fewer.\n';
const VW2B = '## [VW-2] Where a request stands\n`al context <name>` MUST print twelve lines or fewer, grouped.\n';
const VW2C = '## [VW-2] Where a request stands\n`al context <name>` MUST print twelve lines or fewer, grouped by state.\n';
const VW6 = '## [VW-6] Archived requests\nAn archived request MUST show each of its sections.\n';
const VW6B = '## [VW-6] Archived requests\nAn archived request MUST show each of its sections, grouped.\n';

const TIER1 = 'Type: story · Tier: 1 · Status: open';
const organized = (amends) => '## Organized requirement\n\n### R1 Grouped by default\n' +
  '`al context <name>` MAY group repeated output, but MUST NOT leave out a section.\n\n' +
  `Amends: ${amends}\n\nOut: \`--audit\`.\n\nAssumed:\n- \`--all\` is the verbose mode.\n`;

const al = (repo, ...args) => runAl(repo.dir, args, { env: ENV });
const ok = (r, what) => assert.equal(r.code, 0, `${what}:\n${both(r)}`);
function context(repo, ...args) {
  const r = al(repo, 'context', ...args);
  ok(r, `context ${args.join(' ')}`);
  return r.stdout;
}

// Main: specs/views.md with VW-1, VW-2 and VW-6, and the signed tier-1
// request grouping (no change.md) with `Amends: <amends>`. Its branch edits
// VW-2 and VW-6 in a commit with `Request: grouping`, concludes it with the
// tool, commits, and merges into main with --no-ff (the concluding commit).
// Returns { repo, concluded }.
function tier1(t, { amends = '[VW-2], [VW-6]' } = {}) {
  const repo = makeRepo(t);
  repo.write('specs/views.md', file(VW1, VW2, VW6));
  const org = organized(amends);
  addRequest(repo, 'grouping', null, { line: TIER1, org, signedText: org, decisions: '' });
  repo.commit('grouping: request', { date: '2026-09-28T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'grouping']);
  repo.write('specs/views.md', file(VW1, VW2B, VW6B));
  repo.commit(message('Group the context lines', { request: 'grouping', tier: '1 — grouping' }), { date: '2026-09-29T12:00:00Z' });
  ok(al(repo, 'conclude', 'grouping', '--yes'), 'conclude');
  repo.commit(message('Conclude grouping', { request: 'grouping', tier: '1 — grouping' }), { date: '2026-09-29T13:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  repo.git(['merge', '-q', '--no-ff', '--no-edit', 'grouping'], { date: '2026-09-29T14:00:00Z' });
  const concluded = repo.head();
  assert.equal(repo.git(['log', '--diff-filter=A', '--first-parent', '--format=%H', '--', 'requests/archive/grouping/request.md']), concluded,
    'the fixture: the merge brought the archived request.md to main');
  return { repo, concluded };
}
// A later request, `later`, changes VW-2 on main on 2026-10-05.
function laterChange(repo) {
  addRequest(repo, 'later', null, { line: TIER1 });
  repo.write('specs/views.md', file(VW1, VW2C, VW6B));
  return repo.commit(message('Group by state', { request: 'later', tier: '1 — later' }), { date: '2026-10-05T12:00:00Z' });
}

test('#102 [VW-6] an archived tier-1 request, nothing changed since: the Sections line groups VW-2 and VW-6 as at conclusion; VW-1, which it did not change, is not listed', (t) => {
  const { repo } = tier1(t);
  const out = context(repo, 'grouping');
  assertFrame(out);
  assert.equal(stateOf(out, 'Sections', 'VW-2'), 'as at conclusion', out);
  assert.equal(stateOf(out, 'Sections', 'VW-6'), 'as at conclusion', out);
  assert.equal(stateOf(out, 'Sections', 'VW-1'), null, `VW-1 is not the request's:\n${out}`);
});

test('#102 [VW-6] --all: one section per line, "VW-2 as at conclusion" and "VW-6 as at conclusion"', (t) => {
  const { repo } = tier1(t);
  const out = context(repo, 'grouping', '--all');
  for (const id of ['VW-2', 'VW-6']) {
    assert.ok(lines(out).some((l) => l.replace(/^Sections\s+/, '').trim() === `${id} as at conclusion`), `a line "${id} as at conclusion":\n${out}`);
  }
});

test('#102 [VW-6][LNK-2] a later request changes VW-2: VW-2 reads "since changed by later (2026-10-05)", VW-6 still as at conclusion', (t) => {
  const { repo } = tier1(t);
  laterChange(repo);
  const out = context(repo, 'grouping');
  assert.match(stateOf(out, 'Sections', 'VW-2') ?? '', /^since changed by later \(2026-10-05/, out);
  assert.equal(stateOf(out, 'Sections', 'VW-6'), 'as at conclusion', out);
});

test('#102 [VW-6][VW-8] --at the concluding commit, before the later change: VW-2 reads as at conclusion', (t) => {
  const { repo, concluded } = tier1(t);
  laterChange(repo);
  const out = context(repo, 'grouping', '--at', concluded);
  assert.equal(stateOf(out, 'Sections', 'VW-2'), 'as at conclusion', out);
  assert.ok(!out.includes('since changed by later'), out);
});

test('#102 [VW-6] the sections come from the request\'s own work, not its Amends: line: "Amends: [VW-1], [VW-2]", its work changes VW-2 and VW-6: VW-2 and VW-6 listed, VW-1 not', (t) => {
  const { repo } = tier1(t, { amends: '[VW-1], [VW-2]' });
  const out = context(repo, 'grouping');
  assert.equal(stateOf(out, 'Sections', 'VW-2'), 'as at conclusion', out);
  assert.equal(stateOf(out, 'Sections', 'VW-6'), 'as at conclusion', `VW-6 is its work, though Amends: does not name it:\n${out}`);
  assert.equal(stateOf(out, 'Sections', 'VW-1'), null, `VW-1 is named by Amends: but not changed:\n${out}`);
});
