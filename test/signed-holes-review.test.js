// Issue #136, three cases from the review of PR #144, driven through the
// real CLI:
// (A) [REC-8][REC-5] Parts are read outside fenced code only: a fenced
//     example holding "## Parts" and "1. request child" names no child, so
//     the child inherits no sign-off;
// (B) [REC-6][HNT-2] a blocked request's Dropped, reverted section delivers
//     nothing, but a baseline change to another section in a commit carrying
//     its Request line still delivers work;
// (C) [REC-6][STA-4] a plain `consolidate --revert` on a blocked request,
//     with no Dropped marker and no other work, leaves nothing applied, so it
//     delivers no work.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { ENV, addRequest, assertRefused, both } from './helpers/request.js';
import { file } from './helpers/links.js';
import { assertCounts, check, hint, message, noHint, strict } from './helpers/hints.js';

const TIER2 = 'Type: story · Tier: 2 · Status: open';
const A0 = '## [A-1] Promise\nThe promise MUST be old.\n';
const A1 = '## [A-1] Promise\nThe promise MUST be new.\n';
const B0 = '## [A-2] Other\nThe other MUST be old.\n';
const B1 = '## [A-2] Other\nThe other MUST be changed.\n';
const ORG = '## Organized requirement\n\n### R1 Promise\nThe promise MUST be new.\n';

const al = (repo, ...args) => runAl(repo.dir, args, { env: ENV });
const ok = (r, what) => assert.equal(r.code, 0, `${what}:\n${both(r)}`);
const status = (repo) => repo.git(['status', '--porcelain', '--untracked-files=all']);
function context(repo, name) {
  const r = al(repo, 'context', name);
  ok(r, `context ${name}`);
  return r.stdout;
}
const firstLine = (out) => lines(out)[0];

// --- (A) a fenced "## Parts" names no child ---

// The parent's R1 shows a fenced example of a Parts section; its R2 is the promise.
const PARENT_ORG = '## Organized requirement\n\n### R1 Example\nDocumentation MUST show this example:\n\n' +
  '```\n## Parts\n1. request child\n## End of example\n```\n\n### R2 Promise\nThe promise MUST be new.\n';

test('#136 (A) [REC-8][REC-5] a signed parent with no ## Parts, only a fenced example holding "## Parts" and "1. request child"; the child copies its R2 as R1: context child is BLOCKED, awaiting sign-off, and consolidate child --yes refuses and writes nothing', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/rules.md', file('# Rules\n', A0));
  addRequest(repo, 'parent', null, { line: TIER2, org: PARENT_ORG, signedText: PARENT_ORG, decisions: '' });
  addRequest(repo, 'child', [block('[A-1]@1 modify   for R1', { was: A0, now: A1 })], { line: TIER2, org: ORG, signed: false, decisions: '' });
  const md = 'requests/child/request.md';
  repo.write(md, repo.read(md).toString().replace(/^Signed off: .*\n/m, ''));
  repo.commit('parent and child', { date: '2026-09-21T12:00:00Z' });
  assert.ok(!/^## Parts\s*$/m.test(repo.read('requests/parent/request.md').toString().replace(/```[\s\S]*?```/g, '')),
    'the fixture: the parent has no ## Parts outside the fence');

  const out = context(repo, 'child');
  assert.match(firstLine(out), /^BLOCKED/, `a fenced "1. request child" names no child, so nothing is inherited:\n${out}`);
  assert.match(firstLine(out), /awaiting/i, `awaiting sign-off:\n${out}`);
  assertRefused(al(repo, 'consolidate', 'child', '--yes'), 'blocked');
  assert.equal(repo.read('specs/rules.md').toString(), file('# Rules\n', A0), 'A-1 is not written');
  assert.equal(status(repo), '', 'nothing should be written');
});

// --- (B) and (C): a revert on a blocked request ---

// Main: specs/rules.md with A-1 and A-2; x (signed) holds A-1 (old to new
// for R1), consolidated and committed with Request: x. On the branch: x's R1
// changes (x is blocked), al consolidate x --revert A-1 --yes, then when
// `drop` the block is marked Dropped (D2, the owner's), when `other` A-2 is
// changed too; all committed with Request: x.
function revertedOnBranch(t, { drop = false, other = false } = {}) {
  const repo = makeRepo(t);
  repo.write('specs/rules.md', file('# Rules\n', A0, B0));
  repo.commit('Baseline', { date: '2026-09-20T12:00:00Z' });
  addRequest(repo, 'x', [block('[A-1]@1 modify   for R1', { was: A0, now: A1 })],
    { line: TIER2, org: ORG, signedText: ORG, decisions: '\n## Decisions\n\n- D1, 2026-09-21. Source: the owner. The promise is new.\n' });
  repo.commit('x: request, signed', { date: '2026-09-21T12:00:00Z' });
  ok(al(repo, 'consolidate', 'x', '--yes'), 'consolidate x');
  repo.commit(message('Consolidate x', { request: 'x', tier: '2 — promise' }), { date: '2026-09-21T13:00:00Z' });
  assert.equal(repo.read('specs/rules.md').toString(), file('# Rules\n', A1, B0), 'the fixture: A-1 consolidated on main');

  repo.git(['checkout', '-q', '-b', 'work']);
  const md = 'requests/x/request.md';
  let text = repo.read(md).toString().replace('The promise MUST be new.', 'The promise MUST be new, and visible.');
  if (drop) text += '- D2, 2026-09-24. Source: the owner. Drop the promise change.\n';
  repo.write(md, text);
  assert.match(firstLine(context(repo, 'x')), /^BLOCKED/, 'the fixture: x is blocked');
  ok(al(repo, 'consolidate', 'x', '--revert', 'A-1', '--yes'), 'consolidate --revert');
  if (drop) {
    const change = 'requests/x/change.md';
    const heading = '### [A-1]@1 modify   for R1\n';
    assert.ok(repo.read(change).toString().includes(heading), 'the fixture: the block heading');
    repo.write(change, repo.read(change).toString().replace(heading, '### [A-1]@1 modify   for R1   Dropped 2026-09-24 (D2)\n'));
  }
  if (other) repo.write('specs/rules.md', repo.read('specs/rules.md').toString().replace(B0, B1));
  repo.commit(message('Revert x', { request: 'x', tier: '2 — promise' }), { date: '2026-09-24T12:00:00Z' });
  assert.equal(repo.read('specs/rules.md').toString(), file('# Rules\n', A0, other ? B1 : B0), 'the fixture: A-1 back to its "was"');
  assert.match(firstLine(context(repo, 'x')), /^BLOCKED/, 'the fixture: x is still blocked');
  return repo;
}

test('#136 (B) [REC-6][HNT-2] blocked x: A-1 Dropped and reverted, and the same Request: x commit changes A-2, which no block of x holds: not ok "this branch delivers work for x, which is blocked"; check --strict exits 1', (t) => {
  const repo = revertedOnBranch(t, { drop: true, other: true });
  assertCounts(hint(check(repo, '--all'), 'not ok', /delivers work for x\b/, 'blocked'));
  strict(repo, 1);
});

test('#136 (C) [REC-6][STA-4] blocked x: the branch only runs al consolidate x --revert A-1 --yes (no Dropped marker, no other work), committed with Request: x: no "delivers work for x" not ok; check --strict exits 0', (t) => {
  const repo = revertedOnBranch(t);
  noHint(check(repo, '--all'), 'not ok', 'delivers work for');
  strict(repo, 0);
});
