// #115: in the map listing of `al check --full`, a link from a paragraph of
// the request that the branch concludes to another paragraph of that request
// shows its target, before and after `al conclude <name> --yes` moves the
// request to requests/archive/<name>/. A link to a specs/ paragraph in the
// same block stays as it is. A request archived at the base is not listed.
// Written from the issue and the coordinator's cases, through the al command
// only. Nothing here reads the code under test.
//
// The world (path 2): main has specs/invoices.md (INV-12 data). The branch
// feature makes the request share, with R1 signed, a close line on R1, and a
// change spec with two paragraphs:
//   SP-1 component serves:R1
//   SP-2 component serves:R1 builds-on:SP-1 builds-on:INV-12
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from './helpers/map-68.js';
import { al, commitAll, editFile, git, index, ok, show, write } from './helpers/project.js';

const NAME = M.NAME;
const OPEN_DIR = `requests/${NAME}/`;
const ARCHIVE_DIR = `requests/archive/${NAME}/`;
const TIER = `Tier: 2 — ${NAME}`;
const SP1 = 'The exporter writes one file a month.';
const SP2 = 'The file names the month.';

// The link lines of SP-2's block, each with the indented text that follows it.
const OWN_LINK = ['  builds on SP-1 (component):', `    ${SP1}`];
const NOT_FOUND = '  builds on SP-1: not found';
const SPEC_LINK = ['  builds on INV-12 (data):', `    ${M.T12}`];

const atNewPaths = (line) => line.replaceAll(OPEN_DIR, ARCHIVE_DIR);

function world(t) {
  const dir = M.world(t, [
    ['SP-1 component serves:R1', SP1],
    ['SP-2 component serves:R1 builds-on:SP-1 builds-on:INV-12', SP2],
  ]);
  ok(dir, ['record', NAME, 'close', '--on', 'R1', '--reason', 'Met by the export code.', '--yes']);
  index(dir);
  commitAll(dir, `${NAME}: close R1\n\n${TIER}`);
  return dir;
}

function full(dir) {
  const r = al(dir, ['check', '--full']);
  assert.equal(r.code, 0, show(r));
  return r;
}

// The block of `map paragraph share/<id>`: its first line and the indented
// lines after it. [] when the map does not list it.
function block(r, id) {
  const ls = r.stdout.split('\n');
  const at = ls.findIndex((l) => l.startsWith(`map paragraph ${NAME}/${id} `));
  if (at < 0) return [];
  const out = [ls[at]];
  for (let i = at + 1; i < ls.length && ls[i].startsWith(' '); i += 1) out.push(ls[i]);
  return out;
}

// True when the two lines of `pair` come one after the other in `lines`.
const hasPair = (lines, [head, text]) => lines.some((l, i) => l === head && lines[i + 1] === text);

function concludeHere(dir, commit) {
  const r = ok(dir, ['conclude', NAME, '--yes']);
  assert.match(r.stdout, new RegExp(`^Concluded ${NAME}: `, 'm'), show(r));
  index(dir);
  if (commit) commitAll(dir, `Conclude ${NAME}\n\n${TIER}`);
}

const MOMENTS = [['uncommitted', false], ['committed', true]];

describe('al check --full: a link between two paragraphs of the request that the branch concludes shows its target', () => {
  test('before the move: SP-2 is listed in the map, and its link line is "builds on SP-1 (component):" with SP-1\'s text, not "not found"', (t) => {
    const dir = world(t);
    const r = full(dir);
    const b = block(r, 'SP-2');
    assert.ok(b.length > 0, `SP-2 is listed in the map:\n${show(r)}`);
    assert.ok(b[0].startsWith(`map paragraph ${NAME}/SP-2 · ${OPEN_DIR}spec.md:`), b.join('\n'));
    assert.ok(!b.includes(NOT_FOUND), `no "builds on SP-1: not found":\n${b.join('\n')}`);
    assert.ok(hasPair(b, OWN_LINK), `the link line of SP-1 with its text:\n${b.join('\n')}`);
  });

  for (const [moment, commit] of MOMENTS) {
    test(`after al conclude --yes and al index (${moment}): the same link line, found; the block is as before the move, at the new paths`, (t) => {
      const dir = world(t);
      const before = block(full(dir), 'SP-2');
      concludeHere(dir, commit);
      const r = full(dir);
      const b = block(r, 'SP-2');
      assert.ok(b.length > 0, `SP-2 is listed in the map:\n${show(r)}`);
      assert.ok(b[0].startsWith(`map paragraph ${NAME}/SP-2 · ${ARCHIVE_DIR}spec.md:`), b.join('\n'));
      assert.ok(!b.includes(NOT_FOUND), `no "builds on SP-1: not found":\n${b.join('\n')}`);
      assert.ok(hasPair(b, OWN_LINK), `the link line of SP-1 with its text:\n${b.join('\n')}`);
      assert.deepEqual(b, before.map(atNewPaths), `the block before the move, at the new paths:\n${before.join('\n')}`);
    });
  }

  test('the link to the specs/ paragraph INV-12 in the same block keeps its line, before and after the move (uncommitted and committed)', (t) => {
    const dir = world(t);
    const b0 = block(full(dir), 'SP-2');
    assert.ok(hasPair(b0, SPEC_LINK), `before the move:\n${b0.join('\n')}`);
    concludeHere(dir, false);
    const b1 = block(full(dir), 'SP-2');
    assert.ok(hasPair(b1, SPEC_LINK), `after the move (uncommitted):\n${b1.join('\n')}`);
    commitAll(dir, `Conclude ${NAME}\n\n${TIER}`);
    const b2 = block(full(dir), 'SP-2');
    assert.ok(hasPair(b2, SPEC_LINK), `after the move (committed):\n${b2.join('\n')}`);
  });

  test('control: share concluded on the branch earlier and merged into main; on the branch next, the --full map lists no paragraph of share', (t) => {
    const dir = world(t);
    git(dir, 'branch', '-q', '-m', 'earlier');
    concludeHere(dir, true);
    git(dir, 'checkout', '-q', 'main');
    git(dir, 'merge', '-q', '--no-ff', '-m', 'Merge the branch earlier', 'earlier');
    git(dir, 'checkout', '-q', '-b', 'next');
    write(dir, 'README.md', 'notes\n');
    for (const when of ['uncommitted', 'committed']) {
      if (when === 'committed') commitAll(dir, 'Notes\n\nTier: 0 — notes only');
      const r = full(dir);
      const listed = r.stdout.split('\n').filter((l) => l.startsWith(`map paragraph ${NAME}/`));
      assert.deepEqual(listed, [], `${when}:\n${show(r)}`);
    }
  });
});

// =====================================================================
// DES-132: the --full map shows the text at the base of each paragraph that a
// paragraph builds on. That holds for a target in the request's own change
// spec too. Here share is open at the base: the branch feature made it and
// was merged into main. The branch next edits the text of SP-1 and of SP-2.
// A specs/ target that the branch edits already shows its base text, in the
// same form.

const SP1_EDITED = 'The exporter writes one file a week.';
const SP2_EDITED = 'The file names the week.';
const BASE_LINK = ['  builds on SP-1 (component):', `    ${SP1}`];
const EDITED_LINK = ['  builds on SP-1 (component):', `    ${SP1_EDITED}`];

function openAtBase(t) {
  const dir = world(t);
  git(dir, 'checkout', '-q', 'main');
  git(dir, 'merge', '-q', '--no-ff', '-m', 'Merge the branch feature', 'feature');
  git(dir, 'checkout', '-q', '-b', 'next');
  editFile(dir, `${OPEN_DIR}spec.md`, SP1, SP1_EDITED);
  editFile(dir, `${OPEN_DIR}spec.md`, SP2, SP2_EDITED);
  index(dir);
  return dir;
}

function baseTextOf(r, when) {
  const b = block(r, 'SP-2');
  assert.ok(b.length > 0, `SP-2 is listed in the map (${when}):\n${show(r)}`);
  assert.ok(b.includes(`    ${SP2_EDITED}`), `SP-2's own text is the edited text (${when}):\n${b.join('\n')}`);
  assert.ok(!hasPair(b, EDITED_LINK), `the link line of SP-1 is not followed by the edited text (${when}):\n${b.join('\n')}`);
  assert.ok(hasPair(b, BASE_LINK), `the link line of SP-1 is followed by SP-1's text at the base (${when}):\n${b.join('\n')}`);
  assert.ok(hasPair(b, SPEC_LINK), `the link to INV-12 keeps its line (${when}):\n${b.join('\n')}`);
  return b;
}

describe('al check --full: a link to a paragraph of the own request that the branch edits shows the target\'s text at the base (DES-132)', () => {
  test('share open at the base; the branch edits SP-1 and SP-2: SP-2\'s block shows SP-1\'s base text, before al conclude --yes (uncommitted and committed) and after it (uncommitted and committed)', (t) => {
    const dir = openAtBase(t);
    baseTextOf(full(dir), 'before the move, uncommitted');
    commitAll(dir, `${NAME}: a file a week\n\n${TIER}`);
    const before = baseTextOf(full(dir), 'before the move, committed');
    concludeHere(dir, false);
    const after = baseTextOf(full(dir), 'after the move, uncommitted');
    assert.ok(after[0].startsWith(`map paragraph ${NAME}/SP-2 · ${ARCHIVE_DIR}spec.md:`), after.join('\n'));
    assert.deepEqual(after.slice(1), before.slice(1), `the block after the move, but for its first line:\n${before.join('\n')}`);
    commitAll(dir, `Conclude ${NAME}\n\n${TIER}`);
    const committed = baseTextOf(full(dir), 'after the move, committed');
    assert.deepEqual(committed, after, 'the block is the same after the commit');
  });
});

// =====================================================================
// DES-132, a deleted target: share is open at the base. The branch next
// deletes SP-1 from the change spec, and edits SP-2's text while SP-2 keeps
// its link to SP-1. The link shows SP-1's text at the base. The link is
// written as builds-on:SP-1 and, as a second form, builds-on:share/SP-1.

const SP1_PARA = `<!-- SP-1 component serves:R1 -->\n\n${SP1}\n\n`;

function deletedAtBranch(t, target) {
  const dir = M.world(t, [
    ['SP-1 component serves:R1', SP1],
    [`SP-2 component serves:R1 builds-on:${target} builds-on:INV-12`, SP2],
  ]);
  ok(dir, ['record', NAME, 'close', '--on', 'R1', '--reason', 'Met by the export code.', '--yes']);
  index(dir);
  commitAll(dir, `${NAME}: close R1\n\n${TIER}`);
  git(dir, 'checkout', '-q', 'main');
  git(dir, 'merge', '-q', '--no-ff', '-m', 'Merge the branch feature', 'feature');
  git(dir, 'checkout', '-q', '-b', 'next');
  editFile(dir, `${OPEN_DIR}spec.md`, SP1_PARA, '');
  editFile(dir, `${OPEN_DIR}spec.md`, SP2, SP2_EDITED);
  index(dir);
  return dir;
}

describe('al check --full: a link to a paragraph of the own request that the branch deletes shows the target\'s text at the base (DES-132)', () => {
  for (const target of ['SP-1', `${NAME}/SP-1`]) {
    test(`builds-on:${target}; the branch deletes SP-1 and edits SP-2: SP-2's block shows "builds on ${target} (component):" with SP-1's base text, before al conclude --yes (uncommitted and committed) and after it (uncommitted and committed)`, (t) => {
      const dir = deletedAtBranch(t, target);
      const link = [`  builds on ${target} (component):`, `    ${SP1}`];
      const blocks = [];
      const at = (when) => {
        const r = full(dir);
        const b = block(r, 'SP-2');
        assert.ok(b.length > 0, `SP-2 is listed in the map (${when}):\n${show(r)}`);
        assert.ok(b.includes(`    ${SP2_EDITED}`), `SP-2's own text is the edited text (${when}):\n${b.join('\n')}`);
        assert.ok(!b.includes(`  builds on ${target}: not found`), `no "builds on ${target}: not found" (${when}):\n${b.join('\n')}`);
        assert.ok(hasPair(b, link), `the link line of ${target} with SP-1's text at the base (${when}):\n${b.join('\n')}`);
        assert.ok(hasPair(b, SPEC_LINK), `the link to INV-12 keeps its line (${when}):\n${b.join('\n')}`);
        blocks.push(b);
      };
      at('before the move, uncommitted');
      commitAll(dir, `${NAME}: no SP-1\n\n${TIER}`);
      at('before the move, committed');
      concludeHere(dir, false);
      at('after the move, uncommitted');
      commitAll(dir, `Conclude ${NAME}\n\n${TIER}`);
      at('after the move, committed');
      assert.ok(blocks[2][0].startsWith(`map paragraph ${NAME}/SP-2 · ${ARCHIVE_DIR}spec.md:`), blocks[2].join('\n'));
      assert.deepEqual(blocks[2].slice(1), blocks[1].slice(1), 'the block after the move, but for its first line');
      assert.deepEqual(blocks[3], blocks[2], 'the block is the same after the commit');
    });
  }
});
