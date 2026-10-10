// T12 (#180): al check in an output repo looks up the central IDs of the files
// that the branch changed in the central repo at its selected commit
// (interface-180.md 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
import { commit, rev, world } from './helpers/cross-repo.js';
import { al, git, read, show, write } from './helpers/project.js';

const CITES = /^(info cites|hint unresolved-central) /;
const citeLines = (r) => r.stdout.split('\n').filter((l) => CITES.test(l));
const notKnown = (r) => r.stdout.split('\n').find((l) => l.startsWith('Not known'));
// A test that a file gives no line first makes sure that the check looks up
// central IDs at all: docs/feature.md, a changed file, gives its line.
const looksUp = (r) => assert.ok(citeLines(r).some((l) => l.startsWith('info cites docs/feature.md:3 central:EXP-4 ')), show(r));

// The display number and kind of a spec paragraph, from the central record.
function shown(central, id) {
  const p = parse(read(central, '.assuredloop/records/specs/exports.md.yaml')).paragraphs.find((x) => x.id === id);
  assert.ok(p?.display, `${id} has a display number in the central record`);
  return `${p.display} ${p.kind ?? '-'}`;
}

const FEATURE = '# Faster links\n\nThe new link time follows central:EXP-4.\nIt needs central:EXP-20 first.\nRequirement: central:invoice-exports/R2.\n';

// invoicer-web on the branch feature, cut from main: docs/feature.md committed;
// test/export-link.test.js changed and not committed; notes/todo.md untracked;
// build/out.js ignored; .assuredloop/notes.md changed. Not changed: src/,
// docs/link.md (which names central:EXP-99).
function feature(w) {
  git(w.web, 'checkout', '-q', '-b', 'feature');
  write(w.web, '.gitignore', 'build/\n');
  write(w.web, 'docs/feature.md', FEATURE);
  commit(w.web, 'Faster links');
  const testFile = read(w.web, 'test/export-link.test.js');
  write(w.web, 'test/export-link.test.js', `${testFile}// Also central:EXP-6.\n`);
  write(w.web, 'notes/todo.md', 'Check central:EXP-6.\n');
  write(w.web, 'build/out.js', '// central:EXP-4\n');
  write(w.web, '.assuredloop/notes.md', 'Ask about central:EXP-3.\n');
  return { testLine: testFile.split('\n').length };
}

let shared = null;
function checked() {
  if (shared) return shared;
  const w = world(null);
  const { testLine } = feature(w);
  shared = { w, testLine, r: al(w.web, ['check']), strict: al(w.web, ['check', '--strict']), at: rev(w.central).slice(0, 7) };
  return shared;
}

test('a central ID that is found: info cites <file>:<line> central:<ID> <display number> <kind>', () => {
  const { w, r } = checked();
  assert.ok(citeLines(r).includes(`info cites docs/feature.md:3 central:EXP-4 ${shown(w.central, 'EXP-4')}`), show(r));
});

test('a central ID that is not found: hint unresolved-central, with the first 7 of the central sha', () => {
  const { r, at } = checked();
  assert.ok(citeLines(r).includes(`hint unresolved-central docs/feature.md:4 central:EXP-20 not in the central repo at ${at}`), show(r));
});

test('a request-local central ID is looked up too', () => {
  const { r } = checked();
  const found = citeLines(r).filter((l) => l.startsWith('info cites docs/feature.md:5 central:invoice-exports/R2 '));
  assert.equal(found.length, 1, show(r));
});

test('an uncommitted change to a tracked file counts as changed', () => {
  const { w, r, testLine } = checked();
  const lines = citeLines(r);
  assert.ok(lines.includes(`info cites test/export-link.test.js:1 central:EXP-4 ${shown(w.central, 'EXP-4')}`), show(r));
  assert.ok(lines.includes(`info cites test/export-link.test.js:${testLine} central:EXP-6 ${shown(w.central, 'EXP-6')}`), show(r));
});

test('an untracked file that is not ignored is seen', () => {
  const { w, r } = checked();
  assert.ok(citeLines(r).includes(`info cites notes/todo.md:1 central:EXP-6 ${shown(w.central, 'EXP-6')}`), show(r));
});

test('an ignored file is not seen', () => {
  const { r } = checked();
  looksUp(r);
  assert.deepEqual(citeLines(r).filter((l) => l.includes(' build/')), [], show(r));
});

test('nothing under .assuredloop/ is seen', () => {
  const { r } = checked();
  looksUp(r);
  assert.deepEqual(citeLines(r).filter((l) => l.includes(' .assuredloop/') || l.includes('central:EXP-3')), [], show(r));
});

test('a file that the branch did not change gives no line, even when it cites an ID', () => {
  const { r } = checked();
  looksUp(r);
  assert.deepEqual(citeLines(r).filter((l) => l.includes(' src/') || l.includes(' docs/link.md')), [], show(r));
});

test('these are all the cites lines', () => {
  const { r, testLine } = checked();
  assert.deepEqual(citeLines(r).map((l) => l.split(' ').slice(0, 4).join(' ')).sort(), [
    'hint unresolved-central docs/feature.md:4 central:EXP-20',
    'info cites docs/feature.md:3 central:EXP-4',
    'info cites docs/feature.md:5 central:invoice-exports/R2',
    'info cites notes/todo.md:1 central:EXP-6',
    'info cites test/export-link.test.js:1 central:EXP-4',
    `info cites test/export-link.test.js:${testLine} central:EXP-6`,
  ].sort(), show(r));
});

test('it exits 0 with an unresolved central ID', () => {
  const { r } = checked();
  assert.ok(citeLines(r).some((l) => l.startsWith('hint unresolved-central ')), show(r));
  assert.equal(r.code, 0, show(r));
});

test('--strict does not raise these hints: exit 0, and the hint stays a hint', () => {
  const { strict, at } = checked();
  assert.equal(strict.code, 0, show(strict));
  assert.ok(citeLines(strict).includes(`hint unresolved-central docs/feature.md:4 central:EXP-20 not in the central repo at ${at}`), show(strict));
});

// --- the central repo at its selected commit

const EXP20 = '\n<!-- EXP-20 rule serves:invoice-exports/R2 -->\n\nThe export link MUST work once.\n';

test("a paragraph only in the central repo's working tree is not found", (t) => {
  const w = world(t);
  feature(w);
  write(w.central, 'specs/exports.md', `${read(w.central, 'specs/exports.md')}${EXP20}`);
  const r = al(w.web, ['check']);
  assert.ok(citeLines(r).includes(`hint unresolved-central docs/feature.md:4 central:EXP-20 not in the central repo at ${rev(w.central).slice(0, 7)}`), show(r));
});

test('the central repo is read at its pinned commit, not at a later one', (t) => {
  const w = world(t);
  feature(w);
  write(w.central, 'specs/exports.md', `${read(w.central, 'specs/exports.md')}${EXP20}`);
  commit(w.central, 'Add EXP-20');
  const main = rev(w.central, 'main');
  write(w.web, '.assuredloop/config.yaml', 'repo: invoicer-web\ncentral: {path: ../invoicer, commit: main}\n');
  const pinned = al(w.web, ['check']);
  assert.ok(citeLines(pinned).includes(`hint unresolved-central docs/feature.md:4 central:EXP-20 not in the central repo at ${main.slice(0, 7)}`), show(pinned));
  write(w.web, '.assuredloop/config.yaml', 'repo: invoicer-web\ncentral: {path: ../invoicer}\n');
  const head = al(w.web, ['check']);
  assert.ok(citeLines(head).some((l) => l.startsWith('info cites docs/feature.md:4 central:EXP-20 ')), show(head));
});

// --- the central repo unknown

function centralUnknown(t, centralLine) {
  const w = world(t);
  feature(w);
  write(w.web, '.assuredloop/config.yaml', `repo: invoicer-web\ncentral: ${centralLine}\n`);
  const r = al(w.web, ['check']);
  assert.equal(r.code, 0, show(r));
  const unknown = r.stdout.split('\n').filter((l) => l.startsWith('unknown: the central repo: '));
  assert.equal(unknown.length, 1, show(r));
  assert.ok(unknown[0].length > 'unknown: the central repo: '.length, 'a reason is given');
  assert.match(notKnown(r) ?? '', /central/, show(r));
  assert.deepEqual(citeLines(r), [], show(r));
}

test('central path does not exist: the unknown line, a Not known line, no cites lines, exit 0', (t) => {
  centralUnknown(t, '{path: ../nowhere}');
});

test('central commit does not resolve: the unknown line, a Not known line, no cites lines, exit 0', (t) => {
  centralUnknown(t, '{path: ../invoicer, commit: no-such-branch}');
});

// --- no base

test('with no main branch, every file of the working tree is looked up, and a Not known line says there is no base', (t) => {
  const w = world(t);
  git(w.web, 'branch', '-m', 'main', 'trunk');
  write(w.web, 'notes/todo.md', 'Check central:EXP-6.\n');
  const r = al(w.web, ['check']);
  assert.equal(r.code, 0, show(r));
  const at = rev(w.central).slice(0, 7);
  const lines = citeLines(r);
  for (const l of [
    `info cites src/export-link.js:1 central:EXP-4 ${shown(w.central, 'EXP-4')}`,
    `info cites src/export-link.js:1 central:EXP-6 ${shown(w.central, 'EXP-6')}`,
    `info cites test/export-link.test.js:1 central:EXP-4 ${shown(w.central, 'EXP-4')}`,
    `info cites notes/todo.md:1 central:EXP-6 ${shown(w.central, 'EXP-6')}`,
    `hint unresolved-central docs/link.md:6 central:EXP-99 not in the central repo at ${at}`,
  ]) assert.ok(lines.includes(l), `${l}\n${show(r)}`);
  assert.deepEqual(lines.filter((l) => l.includes(' .assuredloop/')), [], show(r));
  assert.match(notKnown(r) ?? '', /no base/, show(r));
});

// --- with no central: in config, al check behaves as before

test('with no central: in config, al check gives no cites line and no unknown line', (t) => {
  const w = world(t);
  feature(w);
  write(w.web, '.assuredloop/config.yaml', 'repo: invoicer-web\n');
  const r = al(w.web, ['check']);
  assert.equal(r.code, 0, show(r));
  assert.deepEqual(citeLines(r), [], show(r));
  assert.deepEqual(r.stdout.split('\n').filter((l) => l.startsWith('unknown:')), [], show(r));
});
