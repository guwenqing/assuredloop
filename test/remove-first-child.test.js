// Issue #131 (tier 0) [STA-4]: a remove's recorded anchor says where the
// section was. `### [ID]@n remove, was after [X]` holds when [X] is the
// nearest section before [ID] at [ID]'s own level (as #124), or when [X] is
// [ID]'s parent, the nearest shallower heading before it, and [ID] is its
// first sub-section. --revert puts the section back: when [X] is shallower
// than [ID], first under [X], after [X]'s own text and before its first
// sub-section; otherwise, as today, after [X] and the deeper headings under
// it. Any other anchor is still refused (#124): consolidate exits 1, naming
// the block, writing nothing; check gives a not ok naming the block, owned by
// its request; --strict exits 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { ENV, addRequest, both } from './helpers/request.js';
import { file } from './helpers/links.js';
import { assertCounts, check, checkHints, hint, kindOf, message, strict } from './helpers/hints.js';

// A section with a body of two paragraphs, so "after the parent's own text"
// is more than its heading line.
const sec = (id, h) => `${h} [${id}] Rule ${id}\nRule ${id} MUST hold.\n\nMore on ${id}: it SHOULD read well.\n`;
const A1 = sec('A-1', '##');
const A11 = sec('A-1.1', '###');
const A111 = sec('A-1.1.1', '####');
const A112 = sec('A-1.1.2', '####');
const A12 = sec('A-1.2', '###');
const A2 = sec('A-2', '##');
const A21 = sec('A-2.1', '###');
const A22 = sec('A-2.2', '###');

const al = (repo, ...args) => runAl(repo.dir, args, { env: ENV });
const ok = (r, what) => assert.equal(r.code, 0, `${what}:\n${both(r)}`);
const status = (repo) => repo.git(['status', '--porcelain', '--untracked-files=all']);
const text = (repo, path) => repo.read(path).toString();
const headings = (t) => t.split('\n').filter((l) => /^#{1,6} /.test(l)).map((l) => l.match(/\[([^\]]+)\]/)[1]);
// The file's non-blank lines: its headings and bodies in order, blank lines aside.
const shape = (t) => t.split('\n').map((l) => l.trimEnd()).filter(Boolean);

// Main: specs/f.md holding `sections`, and the signed request `remove`. The
// branch `work` commits its change.md of the one block `removeBlock`.
function served(t, sections, removeBlock) {
  const repo = makeRepo(t);
  repo.write('specs/f.md', file(...sections));
  addRequest(repo, 'remove', null);
  repo.commit('Baseline and request', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  addRequest(repo, 'remove', [removeBlock]);
  repo.commit(message('remove: change spec', { request: 'remove', tier: '0 — remove' }), { date: '2026-09-22T12:00:00Z' });
  return repo;
}
const notOks = (out, key) => checkHints(out).filter((l) => kindOf(l) === 'not ok' && l.includes(key));

// The anchor holds: no not ok naming the block; consolidate removes the
// section and only it; --revert puts it back where it was, so specs/f.md
// reads as before, heading for heading and line for line. Returns the
// reverted text.
function holds(t, sections, id, anchor) {
  const key = `${id}@1`;
  const was = sections.find((s) => s.includes(`[${id}]`));
  const repo = served(t, sections, block(`[${id}]@1 remove, was after [${anchor}]   for R1`, { was }));
  const before = text(repo, 'specs/f.md');
  const out = check(repo, '--all');
  assert.deepEqual(notOks(out, key), [], `no not ok naming ${key}:\n${out}`);
  ok(al(repo, 'consolidate', 'remove', '--yes'), 'consolidate');
  const removed = text(repo, 'specs/f.md');
  assert.deepEqual(headings(removed), headings(before).filter((x) => x !== id), `only ${id} removed:\n${removed}`);
  repo.commit(message('Consolidate', { request: 'remove', tier: '0 — remove' }), { date: '2026-09-23T12:00:00Z' });
  ok(al(repo, 'consolidate', 'remove', '--revert', id, '--yes'), 'revert');
  const after = text(repo, 'specs/f.md');
  assert.deepEqual(headings(after), headings(before), `the revert puts ${id} back where it was:\n${after}`);
  assert.deepEqual(shape(after), shape(before), `the revert gives back the file as it was, blank lines aside:\n${after}`);
  return after;
}
// The removal made by hand, as consolidate would write it (specs/f.md
// without the section, committed), so the revert is tried on its own; then
// --revert puts it back where it was. Returns the reverted text.
function revertedByHand(t, sections, id, anchor) {
  const was = sections.find((s) => s.includes(`[${id}]`));
  const repo = served(t, sections, block(`[${id}]@1 remove, was after [${anchor}]   for R1`, { was }));
  const before = text(repo, 'specs/f.md');
  repo.write('specs/f.md', file(...sections.filter((s) => s !== was)));
  repo.commit(message('Consolidate', { request: 'remove', tier: '0 — remove' }), { date: '2026-09-23T12:00:00Z' });
  ok(al(repo, 'consolidate', 'remove', '--revert', id, '--yes'), 'revert');
  const after = text(repo, 'specs/f.md');
  assert.deepEqual(headings(after), headings(before), `the revert puts ${id} back where it was:\n${after}`);
  assert.deepEqual(shape(after), shape(before), `the revert gives back the file as it was, blank lines aside:\n${after}`);
  return after;
}
// The anchor does not hold: consolidate refuses, naming the block, writing
// nothing; check gives a not ok naming the block, owned by its request (it
// counts on the branch serving it); --strict exits 1.
function refused(t, sections, id, anchor) {
  const key = `${id}@1`;
  const was = sections.find((s) => s.includes(`[${id}]`));
  const repo = served(t, sections, block(`[${id}]@1 remove, was after [${anchor}]   for R1`, { was }));
  const r = al(repo, 'consolidate', 'remove', '--yes');
  assert.equal(r.code, 1, `consolidate should refuse:\n${both(r)}`);
  assert.ok(lines(both(r)).some((l) => l.includes(key)), `the refusal names ${key}:\n${both(r)}`);
  assert.equal(status(repo), '', 'nothing written');
  assertCounts(hint(check(repo, '--all'), 'not ok', key));
  strict(repo, 1);
}
// Where `line` starts in `t`, failing when it is not there.
const at = (t, line) => {
  const i = t.indexOf(line);
  assert.ok(i >= 0, `"${line}" should be in:\n${t}`);
  return i;
};

// --- a first sub-section, its parent as the anchor ---

test('#131 [STA-4] a first sub-section: in A-1 (##), A-1.1 and A-1.2 (###), A-2 (##), [A-1.1]@1 remove, was after [A-1] holds: no not ok; consolidate removes A-1.1; --revert puts it back first under A-1, before A-1.2', (t) => {
  holds(t, [A1, A11, A12, A2], 'A-1.1', 'A-1');
});

test('#131 [STA-4] the revert puts the first sub-section after its parent\'s own text: A-1\'s two paragraphs stay before "### [A-1.1]", and A-1.1\'s body comes back with it, before "### [A-1.2]"', (t) => {
  const after = holds(t, [A1, A11, A12, A2], 'A-1.1', 'A-1');
  assert.ok(at(after, 'Rule A-1 MUST hold.') < at(after, '### [A-1.1]'), `A-1's first paragraph before A-1.1:\n${after}`);
  assert.ok(at(after, 'More on A-1:') < at(after, '### [A-1.1]'), `A-1's second paragraph before A-1.1:\n${after}`);
  assert.ok(at(after, '### [A-1.1]') < at(after, 'Rule A-1.1 MUST hold.'), `A-1.1's body under its heading:\n${after}`);
  assert.ok(at(after, 'More on A-1.1:') < at(after, '### [A-1.2]'), `A-1.1's body before A-1.2:\n${after}`);
});

test('#131 [STA-4] the only sub-section: in A-1 (##), A-1.1 (###), A-2 (##), [A-1.1]@1 remove, was after [A-1] holds, and its revert puts A-1.1 back between A-1 and A-2', (t) => {
  holds(t, [A1, A11, A2], 'A-1.1', 'A-1');
});

test('#131 [STA-4] a first sub-section of the file\'s second top section: in A-1, A-1.1, A-2, A-2.1, A-2.2, [A-2.1]@1 remove, was after [A-2] holds, and its revert puts A-2.1 back first under A-2, before A-2.2', (t) => {
  holds(t, [A1, A11, A2, A21, A22], 'A-2.1', 'A-2');
});

test('#131 [STA-4] the revert on its own (the removal of A-1.1 made by hand): --revert A-1.1 puts it back first under A-1, after A-1\'s text, before A-1.2, not after A-1\'s whole subtree', (t) => {
  const after = revertedByHand(t, [A1, A11, A12, A2], 'A-1.1', 'A-1');
  assert.ok(at(after, 'More on A-1:') < at(after, '### [A-1.1]'), `A-1's own text before A-1.1:\n${after}`);
});

// --- nested depths ---

test('#131 [STA-4] nested: in A-1 (##), A-1.1 (###), A-1.1.1 and A-1.1.2 (####), A-1.2 (###), A-2 (##), [A-1.1.1]@1 remove, was after [A-1.1] holds; its revert puts A-1.1.1 back first under A-1.1, after A-1.1\'s text, before A-1.1.2', (t) => {
  const after = holds(t, [A1, A11, A111, A112, A12, A2], 'A-1.1.1', 'A-1.1');
  assert.ok(at(after, 'More on A-1.1:') < at(after, '#### [A-1.1.1]'), `A-1.1's own text before A-1.1.1:\n${after}`);
});

test('#131 [STA-4] nested, a later sibling as today: [A-1.1.2]@1 remove, was after [A-1.1.1] holds, and its revert puts A-1.1.2 back after A-1.1.1, before A-1.2', (t) => {
  holds(t, [A1, A11, A111, A112, A12, A2], 'A-1.1.2', 'A-1.1.1');
});

test('#131 [STA-4] nested, the revert on its own (the removal of A-1.1.1 made by hand): --revert A-1.1.1 puts it back first under A-1.1, before A-1.1.2 and A-1.2', (t) => {
  revertedByHand(t, [A1, A11, A111, A112, A12, A2], 'A-1.1.1', 'A-1.1');
});

// --- contrast: a later sibling still goes back after its predecessor's whole subtree ---

test('#131 [STA-4] contrast, as today: [A-1.2]@1 remove, was after [A-1.1], where A-1.1 has sub-sections A-1.1.1 and A-1.1.2: holds, and its revert puts A-1.2 back after A-1.1.2, A-1.1\'s whole subtree, before A-2', (t) => {
  holds(t, [A1, A11, A111, A112, A12, A2], 'A-1.2', 'A-1.1');
});

test('#131 [STA-4] contrast, as today: [A-2]@1 remove, was after [A-1], in A-1, A-1.1, A-1.2, A-2: holds, and its revert puts A-2 back after A-1.2, A-1\'s whole subtree', (t) => {
  holds(t, [A1, A11, A12, A2], 'A-2', 'A-1');
});

// --- a wrong anchor is still refused (#124) ---

test('#131 #124 [STA-4][HNT-3] a later sub-section naming its parent: [A-1.2]@1 remove, was after [A-1], where A-1.1 is before it: refused, a not ok naming the block, owned by its request; --strict exits 1', (t) => {
  refused(t, [A1, A11, A12, A2], 'A-1.2', 'A-1');
});

test('#131 #124 [STA-4][HNT-3] a first sub-section naming its grandparent: [A-1.1.1]@1 remove, was after [A-1], where A-1.1 is its parent: refused, a not ok; --strict exits 1', (t) => {
  refused(t, [A1, A11, A111, A112, A12, A2], 'A-1.1.1', 'A-1');
});

test('#131 #124 [STA-4][HNT-3] a first sub-section naming a section before its parent at the parent\'s level: [A-2.1]@1 remove, was after [A-1], where A-2 is its parent: refused, a not ok; --strict exits 1', (t) => {
  refused(t, [A1, A11, A2, A21, A22], 'A-2.1', 'A-1');
});

test('#131 #124 [STA-4][HNT-3] a first sub-section naming an earlier section at its own level, under another parent: [A-2.1]@1 remove, was after [A-1.1]: refused, a not ok; --strict exits 1', (t) => {
  refused(t, [A1, A11, A2, A21, A22], 'A-2.1', 'A-1.1');
});

test('#131 #124 [STA-4][HNT-3] a first sub-section naming its own later sibling: [A-1.1]@1 remove, was after [A-1.2]: refused, a not ok; --strict exits 1', (t) => {
  refused(t, [A1, A11, A12, A2], 'A-1.1', 'A-1.2');
});
