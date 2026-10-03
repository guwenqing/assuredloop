// Issue #124 (tier 0) [STA-4]: validate everything first; a revert puts a
// remove back after its recorded anchor. `### [ID]@n remove, was after [X]`
// holds only when [X] is the section just before [ID] at [ID]'s own heading
// level: walking back from [ID] in its file, the first section at the same
// level, with no shallower heading in between. --revert puts it back there,
// after [X] and the deeper headings under it. When the anchor does not hold,
// consolidate refuses (exit 1, naming the block, writing nothing) and check
// gives a not ok naming the block, owned by its request. Issue #131 also
// lets [X] be [ID]'s parent when [ID] is its first sub-section; --revert then
// puts it back first under [X] (test/remove-first-child.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { ENV, addRequest, both } from './helpers/request.js';
import { file } from './helpers/links.js';
import { check, checkHints, hint, kindOf, message, strict } from './helpers/hints.js';

const sec = (id, h = '##') => `${h} [${id}] Rule ${id}\nRule ${id} MUST hold.\n`;
const A1 = sec('A-1');
const A2 = sec('A-2');
const A3 = sec('A-3');
const A11 = sec('A-1.1', '###');
const X1 = sec('X-1');

const al = (repo, ...args) => runAl(repo.dir, args, { env: ENV });
const ok = (r, what) => assert.equal(r.code, 0, `${what}:\n${both(r)}`);
const status = (repo) => repo.git(['status', '--porcelain', '--untracked-files=all']);
const headings = (repo, path) => repo.read(path).toString().split('\n').filter((l) => /^#{1,6} /.test(l)).map((l) => l.match(/\[([^\]]+)\]/)[1]);

// Main: `files` and the signed request `remove`. The branch `work` commits
// its change.md of the one block `remove`, with a Request: line.
function served(t, files, removeBlock) {
  const repo = makeRepo(t);
  for (const [path, text] of Object.entries(files)) repo.write(path, text);
  addRequest(repo, 'remove', null);
  repo.commit('Baseline and request', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  addRequest(repo, 'remove', [removeBlock]);
  repo.commit(message('remove: change spec', { request: 'remove', tier: '0 — remove' }), { date: '2026-09-22T12:00:00Z' });
  return repo;
}
const notOks = (out, key) => checkHints(out).filter((l) => kindOf(l) === 'not ok' && l.includes(key));

// The anchor holds: no not ok; consolidate removes it; --revert puts it back where `order` says.
function holds(t, files, key, b, path, order) {
  const repo = served(t, files, b);
  const out = check(repo, '--all');
  assert.deepEqual(notOks(out, key), [], `no not ok naming ${key}:\n${out}`);
  ok(al(repo, 'consolidate', 'remove', '--yes'), 'consolidate');
  assert.ok(!headings(repo, path).includes(key.split('@')[0]), `${key} removed`);
  repo.commit(message('Consolidate', { request: 'remove', tier: '0 — remove' }), { date: '2026-09-23T12:00:00Z' });
  ok(al(repo, 'consolidate', 'remove', '--revert', key.split('@')[0], '--yes'), 'revert');
  assert.deepEqual(headings(repo, path), order, `the revert puts it back after its anchor:\n${repo.read(path)}`);
}
// The anchor does not hold: consolidate refuses, naming the block (on a
// line that also holds each of `says`), writing nothing; check gives a not
// ok naming the block and each of `says`; --strict exits 1.
function refused(t, files, key, b, says = []) {
  const repo = served(t, files, b);
  const r = al(repo, 'consolidate', 'remove', '--yes');
  assert.equal(r.code, 1, `consolidate should refuse:\n${both(r)}`);
  assert.ok(lines(both(r)).some((l) => l.includes(key) && says.every((x) => l.includes(x))),
    `the refusal names ${key}${says.map((x) => ` and "${x}"`).join('')} on one line:\n${both(r)}`);
  assert.equal(status(repo), '', 'nothing written');
  hint(check(repo, '--all'), 'not ok', key, ...says);
  strict(repo, 1);
}

test('#124 [STA-4] 1: a correct anchor: [A-2]@1 remove, was after [A-1], in A-1, A-2, A-3: no not ok; consolidate removes A-2; --revert puts it back between A-1 and A-3', (t) => {
  holds(t, { 'specs/f.md': file(A1, A2, A3) }, 'A-2@1', block('[A-2]@1 remove, was after [A-1]   for R1', { was: A2 }), 'specs/f.md', ['A-1', 'A-2', 'A-3']);
});

test('#124 [STA-4][HNT-3] 2: a wrong but existing anchor: [A-3]@1 remove, was after [A-1], where A-2 is just before A-3: consolidate refuses, naming the block and A-2, the section really before it; a not ok saying the same; --strict exits 1', (t) => {
  refused(t, { 'specs/f.md': file(A1, A2, A3) }, 'A-3@1', block('[A-3]@1 remove, was after [A-1]   for R1', { was: A3 }), ['A-2']);
});

test('#124 [STA-4][HNT-3] 3: an anchor in another file: X-1 is the last section of specs/g.md, A-1 the first of specs/f.md; [A-1]@1 remove, was after [X-1] is refused and a not ok', (t) => {
  refused(t, { 'specs/f.md': file(A1, A2), 'specs/g.md': X1 }, 'A-1@1', block('[A-1]@1 remove, was after [X-1]   for R1', { was: A1 }));
});

const NESTED = { 'specs/f.md': file(A1, A11, A2) };

test('#124 [STA-4] 4: nested: A-1 (##) with its child A-1.1 (###), then A-2 (##): [A-2]@1 remove, was after [A-1] holds, and its revert puts A-2 back after A-1.1', (t) => {
  holds(t, NESTED, 'A-2@1', block('[A-2]@1 remove, was after [A-1]   for R1', { was: A2 }), 'specs/f.md', ['A-1', 'A-1.1', 'A-2']);
});

// #131 replaced the refusal this test stated: a first child names its parent
// as its anchor, and its revert puts it back first under it (more in
// test/remove-first-child.test.js).
test('#124 #131 [STA-4] 4: nested: a first child, [A-1.1]@1 remove, was after [A-1], holds, and its revert puts A-1.1 back first under A-1, before A-2', (t) => {
  holds(t, NESTED, 'A-1.1@1', block('[A-1.1]@1 remove, was after [A-1]   for R1', { was: A11 }), 'specs/f.md', ['A-1', 'A-1.1', 'A-2']);
});

test('#124 contrast, as today: [A-1]@1 remove, was first in specs/f.md still holds for the file\'s first section', (t) => {
  holds(t, { 'specs/f.md': file(A1, A2) }, 'A-1@1', block('[A-1]@1 remove, was first in specs/f.md   for R1', { was: A1 }), 'specs/f.md', ['A-1', 'A-2']);
});
