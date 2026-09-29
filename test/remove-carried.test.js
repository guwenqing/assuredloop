// Issue #100 [STA-2] row 3, read as row 2 reads a remove; [STA-7] [STA-6]:
// a block is carried by a successor that reaches it through valid links.
// When that successor is a remove, "the baseline equals its now" means the
// ID is absent everywhere in the root, as a remove itself is consolidated
// when its ID is absent. A carried section can be concluded, and is never
// reverted, only kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, runAl } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { ENV, addRequest, both } from './helpers/request.js';
import { file } from './helpers/links.js';

const EX0 = '## [EX-0] Anchor\nThe anchor MUST remain.\n';
const OLD = '## [EX-1] Example\nThe example is old.\n';
const NEW = '## [EX-1] Example\nThe example MUST be new.\n';
const NEWER = '## [EX-1] Example\nThe example MUST be newer.\n';

const al = (repo, ...args) => runAl(repo.dir, args, { env: ENV });
const ok = (r, what) => assert.equal(r.code, 0, `${what}:\n${both(r)}`);
const status = (repo) => repo.git(['status', '--porcelain', '--untracked-files=all']);
function context(repo, name) {
  const r = al(repo, 'context', name);
  ok(r, `context ${name}`);
  return r.stdout;
}
// The line of `out` naming EX-1 with a state (the Spec line, or a line under it).
const ex1 = (out) => lines(out).find((l) => /\bEX-1\b/.test(l) && /^(Spec|\s)/.test(l)) ?? '';

const FIRST = block('[EX-1]@1 modify   for R1', { was: OLD, now: NEW });
const REMOVE = block('[EX-1]@1 remove, was after [EX-0]   builds on first/EX-1@1   for R1', { was: NEW });

// Main: specs/ex.md with EX-0 and EX-1 at NEW; the signed requests first
// (`FIRST`) and second (`successor`), committed. When `consolidated`, al
// consolidate second --yes, committed.
function chain(t, successor = REMOVE, { consolidated = true } = {}) {
  const repo = makeRepo(t);
  repo.write('specs/ex.md', file(EX0, NEW));
  addRequest(repo, 'first', [FIRST]);
  addRequest(repo, 'second', [successor]);
  repo.commit('first and second', { date: '2026-09-21T12:00:00Z' });
  if (consolidated) {
    ok(al(repo, 'consolidate', 'second', '--yes'), 'consolidate second');
    repo.commit('Consolidate second', { date: '2026-09-22T12:00:00Z' });
  }
  return repo;
}

test('#100 [STA-2] after al consolidate second --yes removes EX-1: context first shows EX-1 carried by second/EX-1@1, not "not found"', (t) => {
  const repo = chain(t);
  assert.ok(!repo.read('specs/ex.md').toString().includes('[EX-1]'), 'the fixture: EX-1 removed');
  const line = ex1(context(repo, 'first'));
  assert.match(line, /\bcarried by second\/EX-1@1\b/, `EX-1 carried by second/EX-1@1:\n${line}`);
  assert.doesNotMatch(line, /not found/, line);
});

test('#100 [STA-7] conclude first is not refused for EX-1, carried by the remove; with --yes it concludes', (t) => {
  const repo = chain(t);
  ok(al(repo, 'conclude', 'first'), 'conclude first (a preview)');
  ok(al(repo, 'conclude', 'first', '--yes'), 'conclude first --yes');
  assert.ok(existsSync(join(repo.dir, 'requests/archive/first/request.md')), 'first is archived');
});

test('#100 [STA-6] a section carried by the remove is never reverted: consolidate first --revert EX-1 --yes refuses, exit 1, and writes nothing', (t) => {
  const repo = chain(t);
  const r = al(repo, 'consolidate', 'first', '--revert', 'EX-1', '--yes');
  assert.equal(r.code, 1, `revert should refuse:\n${both(r)}`);
  assert.equal(status(repo), '', 'nothing written');
});

// --- contrasts ---

test('#100 contrast: the same remove while EX-1 is still in the baseline: second is pending, first is not carried', (t) => {
  const repo = chain(t, REMOVE, { consolidated: false });
  assert.doesNotMatch(ex1(context(repo, 'first')), /carried/, context(repo, 'first'));
  assert.match(ex1(context(repo, 'second')), /\bpending\b/, context(repo, 'second'));
});

test('#100 contrast, as today: a modify successor built on first, consolidated, carries it', (t) => {
  const repo = chain(t, block('[EX-1]@1 modify   builds on first/EX-1@1   for R1', { was: NEW, now: NEWER }));
  assert.match(ex1(context(repo, 'first')), /\bcarried by second\/EX-1@1\b/, context(repo, 'first'));
});

test('#100 contrast: a remove that does not build on first, consolidated, does not carry it', (t) => {
  const repo = chain(t, block('[EX-1]@1 remove, was after [EX-0]   for R1', { was: NEW }));
  assert.ok(!repo.read('specs/ex.md').toString().includes('[EX-1]'), 'the fixture: EX-1 removed');
  assert.doesNotMatch(ex1(context(repo, 'first')), /carried/, context(repo, 'first'));
});

// --- PR #121 review: a successor carries a block only when it holds the same section ---

test('PR #121 [STA-2] a remove of another ID, EX-2, built on first/EX-1@1 with a Was copying EX-1\'s now, never carries EX-1: context first does not read "carried by second/EX-2@1"; conclude first --yes refuses, exit 1, files unchanged', (t) => {
  const EX2 = '## [EX-2] Other\nThe other MUST stay.\n';
  const repo = makeRepo(t);
  repo.write('specs/ex.md', file(EX0, EX2));
  addRequest(repo, 'first', [FIRST]);
  addRequest(repo, 'second', [block('[EX-2]@1 remove, was after [EX-0]   builds on first/EX-1@1   for R1', { was: NEW })]);
  repo.commit('first and second', { date: '2026-09-21T12:00:00Z' });
  const spec = repo.read('specs/ex.md').toString();
  assert.ok(spec.includes('[EX-2]') && !spec.includes('[EX-1]'), 'the fixture: EX-2 in the baseline, EX-1 absent');
  const line = ex1(context(repo, 'first'));
  assert.doesNotMatch(line, /carried/, `EX-1 is not carried by a block of another section:\n${line}`);
  const r = al(repo, 'conclude', 'first', '--yes');
  assert.equal(r.code, 1, `conclude first should refuse:\n${both(r)}`);
  assert.equal(status(repo), '', 'nothing written, first not archived');
});
