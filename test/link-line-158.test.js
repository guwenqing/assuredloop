// Issue #158 (tier 0): when an [ID] is named on a changed line, the rough
// link [LNK-1] gives the line (or lines) of the changed block that name the
// ID, not the block's first line. Both places that show it: the al check note
// "<code> changed, but its linked tests did not: 1 naming [X] (<file>:<line>:
// names [X] …)" and the al context --diff line "<file>:<line>  names [X] …".
// Every line number given for the ID must be a line inside the changed block
// whose text at the head names the ID; whether the first such line or each of
// them is given is left open. When no changed line names an ID, the link
// still gives the change's own line with the distance to the [ID] above it.
// Built from the issue and the public output; nothing here reads the code
// under test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { both } from './helpers/request.js';
import { check, hint, message } from './helpers/hints.js';
import { assertDiffFrame, contextDiff } from './helpers/links.js';

const CODE = 'src/shapes.js';
const TEST = 'test/shapes.test.js';
const NOTE = 'changed, but its linked tests did not';
const SPEC = '## [SHP-1] Sizes\nSizes MUST never be negative.\n\n## [SHP-2] Perimeter\nThe perimeter MUST add all four sides.\n';
const jsTest = (name) => ["import { test } from 'node:test';", "import assert from 'node:assert/strict';", '',
  `test('${name}', () => {`, '  assert.equal(1, 1);', '});'].join('\n') + '\n';

// Main: the spec, then CODE as `before`, then TEST (naming `id`) in a commit
// of its own, so it is linked to CODE only through the ID. The branch `work`
// sets CODE to `after`; TEST does not change.
function fixture(t, before, after, id) {
  const repo = makeRepo(t);
  repo.write('specs/shapes.md', SPEC);
  repo.commit('Shape rules', { date: '2026-09-01T12:00:00Z' });
  repo.write(CODE, before);
  repo.commit('Shapes', { date: '2026-09-02T12:00:00Z' });
  repo.write(TEST, jsTest(`[${id}] shapes keep their rules`));
  repo.commit('Shape tests', { date: '2026-09-03T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write(CODE, after);
  repo.commit(message('Shapes change', { tier: '0 — shapes' }), { date: '2026-09-21T12:00:00Z' });
  return repo;
}

// The new-side hunks of CODE between main and work, as git diff -U0 gives
// them: [{ start, count }].
const hunks = (repo) => repo.git(['diff', '-U0', 'main', 'work', '--', CODE]).split('\n')
  .map((l) => l.match(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/)).filter(Boolean)
  .map((m) => ({ start: Number(m[1]), count: Number(m[2] ?? 1) }));

// The line numbers given after each "src/shapes.js:" in `text`: a number, a
// list (4, 6 or 4 and 6) or a range (4-6, each number in it counted).
function numbersGiven(text) {
  const out = [];
  for (const m of text.matchAll(/src\/shapes\.js:(\d+(?:\s*(?:,|and|-|–)\s*\d+)*)/g)) {
    for (const part of m[1].split(/\s*(?:,|and)\s*/)) {
      const [a, b] = part.split(/\s*[-–]\s*/).map(Number);
      for (let n = a; n <= (b ?? a); n++) out.push(n);
    }
  }
  return out;
}

// Every number given points into the one changed block at a line whose text
// at the head names [id], at least one is given, and the block's first line
// (which names no ID) is not given.
function assertNamesId(repo, given, id, where) {
  const text = repo.read(CODE).toString().split('\n');
  const [h] = hunks(repo);
  assert.ok(given.length > 0, `${where}: expected a ${CODE}:<line> for [${id}]`);
  for (const n of given) {
    assert.ok(n >= h.start && n < h.start + h.count, `${where}: ${CODE}:${n} should be inside the changed block, lines ${h.start}-${h.start + h.count - 1}`);
    assert.ok((text[n - 1] ?? '').includes(`[${id}]`), `${where}: ${CODE}:${n} should name [${id}], but line ${n} is ${JSON.stringify(text[n - 1])}`);
  }
  assert.ok(!given.includes(h.start), `${where}: gave the block's first line, ${CODE}:${h.start}, which names no ID`);
}

// The al check note for CODE: the numbers it gives inside "naming [id] (…)".
function checkNumbers(repo, id) {
  const line = hint(check(repo), 'note', NOTE, CODE, `naming [${id}]`);
  assert.ok(line.includes(TEST), `the note should name ${TEST}:\n${line}`);
  const inside = line.slice(line.indexOf(`naming [${id}]`)).match(/\(([^)]*)\)/);
  assert.ok(inside, `the note should say how ${CODE} reaches [${id}], in parentheses:\n${line}`);
  assert.doesNotMatch(inside[1], /\babove\b/, `the ID is on a changed line, not above it:\n${line}`);
  return { line, given: numbersGiven(inside[1]) };
}

// The al context --diff lines for CODE that name [id]: the numbers they give.
function diffNumbers(repo, id) {
  const r = contextDiff(repo, 'main...HEAD');
  assert.equal(r.code, 0, both(r));
  assertDiffFrame(r.stdout);
  const ls = lines(r.stdout).filter((l) => l.includes(`${CODE}:`) && l.includes(`names [${id}]`));
  assert.ok(ls.length > 0, `expected a line "${CODE}:<line>  names [${id}] …":\n${r.stdout}`);
  for (const l of ls) assert.doesNotMatch(l, /\babove\b/, `the ID is on a changed line, not above it:\n${l}`);
  return { out: r.stdout, given: ls.flatMap(numbersGiven) };
}

// An added block: its first line (2) names no ID; line 4 names [SHP-2].
const AREA = 'export const area = (w, h) => w * h;\n';
const ADDED = AREA + [
  'export function perimeter(w, h) {', // 2
  '  const sides = [w, h, w, h];', // 3
  '  // [SHP-2] adds all four sides', // 4
  '  return sides.reduce((a, b) => a + b, 0);', // 5
  '}', // 6
].join('\n') + '\n';

// The same block with [SHP-2] on lines 3 and 5.
const ADDED_TWICE = AREA + [
  'export function perimeter(w, h) {', // 2
  '  const sides = [w, h, w, h]; // [SHP-2] four sides', // 3
  '  // all of them added',
  '  return sides.reduce((a, b) => a + b, 0); // [SHP-2]', // 5
  '}',
].join('\n') + '\n';

// A changed block (old lines 2-3 replaced by new lines 2-3): line 2 names no
// ID; line 3 names [SHP-1].
const SIZED = (width, height) => ['export function area(w, h) {', width, height, '  return width * height;', '}'].join('\n') + '\n';
const BEFORE_SIZED = SIZED('  const width = w;', '  const height = h;');
const AFTER_SIZED = SIZED('  const width = Math.abs(w);', '  const height = Math.abs(h); // [SHP-1] never negative');

const assertHunks = (repo, want) => assert.deepEqual(hunks(repo), want, `the fixture: ${CODE} has one changed block`);

test('#158 [LNK-1] al check: an added block whose first line names no ID and whose line 4 names [SHP-2]: the note gives src/shapes.js:4, a line naming [SHP-2], not the block\'s first line 2', (t) => {
  const repo = fixture(t, AREA, ADDED, 'SHP-2');
  assertHunks(repo, [{ start: 2, count: 5 }]);
  const { line, given } = checkNumbers(repo, 'SHP-2');
  assertNamesId(repo, given, 'SHP-2', `the note\n${line}\n`);
});

test('#158 [LNK-1] al check: [SHP-2] on lines 3 and 5 of an added block: every line the note gives names [SHP-2]', (t) => {
  const repo = fixture(t, AREA, ADDED_TWICE, 'SHP-2');
  assertHunks(repo, [{ start: 2, count: 5 }]);
  const { line, given } = checkNumbers(repo, 'SHP-2');
  assertNamesId(repo, given, 'SHP-2', `the note\n${line}\n`);
});

test('#158 [LNK-1] al context --diff: an added block whose first line names no ID and whose line 4 names [SHP-2]: the link gives src/shapes.js:4, not the block\'s first line 2', (t) => {
  const repo = fixture(t, AREA, ADDED, 'SHP-2');
  assertHunks(repo, [{ start: 2, count: 5 }]);
  const { out, given } = diffNumbers(repo, 'SHP-2');
  assertNamesId(repo, given, 'SHP-2', `al context --diff\n${out}\n`);
});

test('#158 [LNK-1] al context --diff: a changed block (lines 2-3) whose first line names no ID and whose line 3 names [SHP-1]: the link gives src/shapes.js:3, not 2', (t) => {
  const repo = fixture(t, BEFORE_SIZED, AFTER_SIZED, 'SHP-1');
  assertHunks(repo, [{ start: 2, count: 2 }]);
  assert.equal(repo.git(['diff', '--numstat', 'main', 'work', '--', CODE]), `2\t2\t${CODE}`, 'the fixture: two lines changed, none purely added');
  const { out, given } = diffNumbers(repo, 'SHP-1');
  assertNamesId(repo, given, 'SHP-1', `al context --diff\n${out}\n`);
});

test('#158 [LNK-1] al context --diff: [SHP-2] on lines 3 and 5 of an added block: every line the link gives names [SHP-2]', (t) => {
  const repo = fixture(t, AREA, ADDED_TWICE, 'SHP-2');
  assertHunks(repo, [{ start: 2, count: 5 }]);
  const { out, given } = diffNumbers(repo, 'SHP-2');
  assertNamesId(repo, given, 'SHP-2', `al context --diff\n${out}\n`);
});

test('#158 [LNK-1] control: no changed line names an ID: the link still gives the change\'s own line (4) with the distance to [SHP-2] on line 3 above it, "1 line above"', (t) => {
  const before = AREA + 'export function perimeter(w, h) {\n  // [SHP-2] adds all four sides\n  const sides = [w, h, w, h];\n  return sides.reduce((a, b) => a + b, 0);\n}\n';
  const after = before.replace('const sides = [w, h, w, h];', 'const sides = [w, h, h, w];');
  const repo = fixture(t, before, after, 'SHP-2');
  assertHunks(repo, [{ start: 4, count: 1 }]);
  const r = contextDiff(repo, 'main...HEAD');
  assert.equal(r.code, 0, both(r));
  const ls = lines(r.stdout).filter((l) => l.includes(`${CODE}:`) && l.includes('names [SHP-2]'));
  assert.ok(ls.some((l) => numbersGiven(l).includes(4) && /\b1 line above\b/.test(l)),
    `expected "${CODE}:4  names [SHP-2], 1 line above":\n${r.stdout}`);
});
