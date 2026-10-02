// spec-text-fixes R3 (#106 part b), signed: "A change MUST be able to remove
// the first section of a spec file, and undoing that removal MUST put the
// section back first in that file." The form [SPC-5] will list:
// `### [ID]@n remove, was first in <path>`, with a Was: and no Now:, beside
// `remove, was after [ID]`. consolidate writes the removal [STA-4];
// consolidate --revert puts the Was back as the file's first section, after
// any text before its first heading, creating the file if it is gone. A bare
// `remove`, and `remove, was first` with no path, stay faults.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, runAl } from './helpers/fixture.js';
import { block } from './helpers/change.js';
import { ENV, addRequest, both } from './helpers/request.js';
import { file } from './helpers/links.js';
import { check, checkHints, hint, kindOf, message } from './helpers/hints.js';

const ONLY1 = '## [ONLY-1] Only\nMUST exist.\n';
const A1 = '## [A-1] First\nThe first MUST hold.\n';
const A2 = '## [A-2] Second\nThe second MUST hold.\n';
const OTHER = '## [OTHER-1] Other\nThe other MUST hold.\n';

const al = (repo, ...args) => runAl(repo.dir, args, { env: ENV });
const ok = (r, what) => assert.equal(r.code, 0, `${what}:\n${both(r)}`);
const read = (repo, path) => (existsSync(join(repo.dir, path)) ? repo.read(path).toString() : null);
const headings = (text) => (text ?? '').split('\n').filter((l) => /^#{1,6} /.test(l));

// Main: `files` ({ path: text }) and the signed request `remove`. The
// branch `work` commits its change.md of `blocks`, with a Request: line.
function served(t, files, blocks) {
  const repo = makeRepo(t);
  for (const [path, text] of Object.entries(files)) repo.write(path, text);
  addRequest(repo, 'remove', null);
  repo.commit('Baseline and request', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  addRequest(repo, 'remove', blocks);
  repo.commit(message('remove: change spec', { request: 'remove', tier: '1 — remove' }), { date: '2026-09-22T12:00:00Z' });
  return repo;
}
// consolidate remove --yes, committed.
function consolidated(repo) {
  ok(al(repo, 'consolidate', 'remove', '--yes'), 'consolidate');
  repo.commit(message('Consolidate', { request: 'remove', tier: '1 — remove' }), { date: '2026-09-23T12:00:00Z' });
}

const ONLY = block('[ONLY-1]@1 remove, was first in specs/only.md   for R1', { was: ONLY1 });
const FIRST_OF_TWO = block('[A-1]@1 remove, was first in specs/two.md   for R1', { was: A1 });

// --- the form is valid ---

test('R3 [SPC-5] "remove, was first in specs/only.md" with a Was: and no Now: is no fault: check gives no not ok naming ONLY-1@1', (t) => {
  const repo = served(t, { 'specs/only.md': ONLY1 }, [ONLY]);
  const out = check(repo, '--all');
  assert.deepEqual(checkHints(out).filter((l) => kindOf(l) === 'not ok' && l.includes('ONLY-1')), [], `no not ok:\n${out}`);
});

test('R3 [SPC-5] still faults: a bare "remove" and "remove, was first" with no path each give a not ok naming the block', (t) => {
  for (const head of ['[ONLY-1]@1 remove   for R1', '[ONLY-1]@1 remove, was first   for R1']) {
    const repo = served(t, { 'specs/only.md': ONLY1 }, [block(head, { was: ONLY1 })]);
    hint(check(repo, '--all'), 'not ok', 'ONLY-1@1');
  }
});

// --- #106: the file's only section ---

test('R3 [STA-4] #106: specs/only.md holds only [ONLY-1]; consolidate --yes removes it, leaving the file with no sections', (t) => {
  const repo = served(t, { 'specs/only.md': ONLY1 }, [ONLY]);
  ok(al(repo, 'consolidate', 'remove', '--yes'), 'consolidate');
  assert.deepEqual(headings(read(repo, 'specs/only.md')), [], `no sections left:\n${read(repo, 'specs/only.md')}`);
});

test('R3 [STA-4] #106: consolidate --revert ONLY-1 --yes puts the Was back as the first section of specs/only.md', (t) => {
  const repo = served(t, { 'specs/only.md': ONLY1 }, [ONLY]);
  consolidated(repo);
  ok(al(repo, 'consolidate', 'remove', '--revert', 'ONLY-1', '--yes'), 'revert');
  assert.equal((read(repo, 'specs/only.md') ?? '').trim(), ONLY1.trim());
});

test('R3 [STA-4] revert with other sections now in the file: ONLY-1 goes before them, after the text before the first heading', (t) => {
  const repo = served(t, { 'specs/only.md': ONLY1 }, [ONLY]);
  consolidated(repo);
  repo.write('specs/only.md', `Notes on this file.\n\n${OTHER}`);
  repo.commit('Another section', { date: '2026-09-24T12:00:00Z' });
  ok(al(repo, 'consolidate', 'remove', '--revert', 'ONLY-1', '--yes'), 'revert');
  const text = read(repo, 'specs/only.md');
  assert.deepEqual(headings(text), ['## [ONLY-1] Only', '## [OTHER-1] Other'], `ONLY-1 first:\n${text}`);
  assert.ok(text.indexOf('Notes on this file.') < text.indexOf('[ONLY-1]'), `after the text before the first heading:\n${text}`);
});

test('R3 [STA-4] revert when the file is gone: specs/only.md is created holding the section', (t) => {
  const repo = served(t, { 'specs/only.md': ONLY1 }, [ONLY]);
  consolidated(repo);
  if (existsSync(join(repo.dir, 'specs/only.md'))) {
    repo.git(['rm', '-q', 'specs/only.md']);
    repo.commit('The empty file goes', { date: '2026-09-24T12:00:00Z' });
  }
  ok(al(repo, 'consolidate', 'remove', '--revert', 'ONLY-1', '--yes'), 'revert');
  assert.equal((read(repo, 'specs/only.md') ?? '').trim(), ONLY1.trim());
});

test('R3 [STA-7] conclude after the removal is consolidated concludes as usual', (t) => {
  const repo = served(t, { 'specs/only.md': ONLY1 }, [ONLY]);
  consolidated(repo);
  ok(al(repo, 'conclude', 'remove', '--yes'), 'conclude');
  assert.ok(existsSync(join(repo.dir, 'requests/archive/remove/request.md')), 'archived');
});

// --- the first of two sections ---

test('R3 [STA-4] the first of two sections: consolidate removes A-1, leaving A-2; --revert A-1 puts it back before A-2', (t) => {
  const repo = served(t, { 'specs/two.md': file(A1, A2) }, [FIRST_OF_TWO]);
  consolidated(repo);
  assert.deepEqual(headings(read(repo, 'specs/two.md')), ['## [A-2] Second'], read(repo, 'specs/two.md'));
  ok(al(repo, 'consolidate', 'remove', '--revert', 'A-1', '--yes'), 'revert');
  assert.deepEqual(headings(read(repo, 'specs/two.md')), ['## [A-1] First', '## [A-2] Second'], read(repo, 'specs/two.md'));
});

// --- contrast ---

test('R3 contrast, as today: "remove, was after [A-1]" removes A-2, and --revert A-2 puts it back after A-1', (t) => {
  const repo = served(t, { 'specs/two.md': file(A1, A2) }, [block('[A-2]@1 remove, was after [A-1]   for R1', { was: A2 })]);
  consolidated(repo);
  assert.deepEqual(headings(read(repo, 'specs/two.md')), ['## [A-1] First'], read(repo, 'specs/two.md'));
  ok(al(repo, 'consolidate', 'remove', '--revert', 'A-2', '--yes'), 'revert');
  assert.deepEqual(headings(read(repo, 'specs/two.md')), ['## [A-1] First', '## [A-2] Second'], read(repo, 'specs/two.md'));
});

// --- PR #123 review: "was first in <path>" is checked against the baseline ---

const status = (repo) => repo.git(['status', '--porcelain', '--untracked-files=all']);
const CLAIMS = {
  'A-2, the second section of specs/two.md': {
    files: { 'specs/two.md': file(A1, A2) },
    block: block('[A-2]@1 remove, was first in specs/two.md   for R1', { was: A2 }),
  },
  'A-2, which lives in specs/other.md, not in specs/two.md': {
    files: { 'specs/two.md': A1, 'specs/other.md': A2 },
    block: block('[A-2]@1 remove, was first in specs/two.md   for R1', { was: A2 }),
  },
};

for (const [label, { files, block: claim }] of Object.entries(CLAIMS)) {
  test(`R3 PR #123 [SPC-5][STA-4] "remove, was first in specs/two.md" for ${label}: consolidate --yes refuses, exit 1, the baseline byte for byte`, (t) => {
    const repo = served(t, files, [claim]);
    const r = al(repo, 'consolidate', 'remove', '--yes');
    assert.equal(r.code, 1, `consolidate should refuse:\n${both(r)}`);
    assert.equal(status(repo), '', 'nothing written');
    for (const [path, text] of Object.entries(files)) assert.equal(read(repo, path), text, `${path} byte for byte`);
  });
}
