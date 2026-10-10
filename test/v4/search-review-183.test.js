// Regression tests for four defects that the review of PR #183 found (#181,
// T13-T14; design.md 11 and decision D11). Each runs through the public
// commands at the levels named in the review.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commitAll, doc, git, project, write, writeConfig } from './helpers/project.js';
import {
  A_TEXT, SMALL_SPEC, clearLog, embedded, exportRows, oneRow, search, smallRepo,
} from './helpers/search.js';

const idRoles = (out) => out.hits.map((h) => `${h.id} v${h.version} ${h.role}`);
const SPEC = 'specs/exports.md';
const EXP9 = 'A yearly archive MUST hold twelve monthly files.';

// 1. The history shown is the first-parent history up to the selected
// commit: the index keeps every row it indexed, but a query shows only the
// versions on that history.
for (const level of [0, 1, 2]) {
  test(`review 183 #1, level ${level}: --history --at A shows no version that appears only after A`, (t) => {
    const { dir, A } = smallRepo(t, { embedder: level === 2 ? {} : null });
    write(dir, SPEC, `${SMALL_SPEC}\n${doc([['EXP-9 rule', EXP9]])}`);
    const B = commitAll(dir, 'B: EXP-9 added');
    const atB = search(dir, ['--id', 'EXP-9', '--history'], { level });
    assert.deepEqual(idRoles(atB), ['EXP-9 v1 baseline'], 'at B, EXP-9 is current (and the index now holds B)');
    assert.equal(atB.commit, B);
    const byId = search(dir, ['--id', 'EXP-9', '--history', '--at', A], { level });
    assert.equal(byId.commit, A);
    assert.deepEqual(byId.hits, [], `EXP-9 is not on the history up to A:\n${idRoles(byId).join('\n')}`);
    const byWords = search(dir, ['yearly', 'archive', '--history', '--at', A], { level });
    assert.ok(!byWords.hits.some((h) => h.id === 'EXP-9'), `no EXP-9 by its words at A:\n${idRoles(byWords).join('\n')}`);
  });
}

// 2. A heading rename refreshes the chunks under it: the chunk header (file
// title, heading path, kind, ID) is part of the indexed and embedded text.
for (const level of [1, 2]) {
  test(`review 183 #2, level ${level}: a renamed heading refreshes the chunks of its unchanged children`, (t) => {
    const { dir, log } = smallRepo(t, { embedder: level === 2 ? {} : null });
    search(dir, ['export', 'link'], { level });
    write(dir, SPEC, SMALL_SPEC.replace('## Export links', '## Quasar navigation'));
    commitAll(dir, 'B: the heading renamed');
    if (log) clearLog(log);
    const out = search(dir, ['quasar', '--limit', '50'], { level });
    const ids = out.hits.map((h) => h.id);
    for (const id of ['EXP-3', 'EXP-4', 'EXP-5']) assert.ok(ids.includes(id), `${id} is found by its new heading:\n${idRoles(out).join('\n')}`);
    const l0 = search(dir, ['quasar', '--limit', '50'], { level: 0 }).hits.map((h) => h.id);
    const rebuilt = search(dir, ['quasar', '--limit', '50', '--rebuild'], { level }).hits.map((h) => h.id);
    for (const id of ['EXP-4', 'EXP-5']) {
      assert.ok(l0.includes(id), `level 0 finds ${id} too`);
      assert.ok(rebuilt.includes(id), `--rebuild finds ${id} too`);
    }
    if (log) {
      // The log of the refresh only: it was cleared before the search after the commit.
      const sent = embedded(log);
      for (const text of [A_TEXT.exp4, A_TEXT.exp5]) {
        assert.ok(sent.some((x) => x.includes(text) && x.includes('Quasar navigation')),
          `the child "${text.slice(0, 30)}..." is embedded again with its new heading`);
      }
    }
  });
}

// 3. An incremental refresh resumes only from the selected first-parent
// chain: a text seen only on a merged side branch is no version.
test('review 183 #3, level 1: after a merged side branch, the current version is the export\'s and the rebuild\'s', (t) => {
  const dir = project(t);
  writeConfig(dir, [{ file: SPEC, prefix: 'EXP' }], { repo: 'acme' });
  const spec = (minutes) => doc([
    ['EXP-1 note', '# Exports'],
    ['EXP-3 note', '## Export links'],
    ['EXP-4 rule', `The export link MUST expire ${minutes} minutes after the email is sent.`],
  ]);
  write(dir, SPEC, spec(30));
  commitAll(dir, 'A: 30 minutes');
  search(dir, ['--id', 'EXP-4'], { level: 1 });
  git(dir, 'checkout', '-q', '-b', 'side');
  write(dir, SPEC, spec(20));
  commitAll(dir, 'S1: 20 minutes');
  write(dir, SPEC, spec(45));
  commitAll(dir, 'S2: 45 minutes');
  search(dir, ['--id', 'EXP-4'], { level: 1 }); // the index now holds the side branch
  git(dir, 'checkout', '-q', 'main');
  git(dir, 'merge', '-q', '--no-ff', '-m', 'M: merge side', 'side');
  const fromExport = oneRow(exportRows(dir).rows.filter((r) => r.role === 'baseline'), 'EXP-4');
  assert.equal(fromExport.version, 2, 'the 20-minute draft is not on main\'s first-parent chain');
  const refreshed = search(dir, ['--id', 'EXP-4'], { level: 1 });
  assert.deepEqual(refreshed.hits.map((h) => [h.version, h.text]), [[2, fromExport.text]], 'the refreshed index agrees with the export');
  const rebuilt = search(dir, ['--id', 'EXP-4', '--rebuild'], { level: 1 });
  assert.deepEqual(rebuilt.hits.map((h) => h.version), [2], 'and with --rebuild');
});

// 4. --history --section: the section of a past version is built from the
// file at that version's commit.
for (const level of [0, 1]) {
  test(`review 183 #4, level ${level}: the section of a past version holds its heading and siblings as they were`, (t) => {
    const { dir, A } = smallRepo(t);
    const changed = 'The export link MUST expire 20 minutes after the email is sent.';
    write(dir, SPEC, SMALL_SPEC.replace(A_TEXT.exp4, changed));
    commitAll(dir, 'B: EXP-4 changed');
    const out = search(dir, ['--id', 'EXP-4', '--history', '--section'], { level });
    const old = out.hits.find((h) => h.version === 1);
    assert.ok(old, `EXP-4 v1 is a hit:\n${idRoles(out).join('\n')}`);
    assert.equal(old.role, 'history');
    assert.equal(old.commit, A);
    assert.ok(Array.isArray(old.section), 'the past version has a section');
    const sec = new Map(old.section.map((r) => [r.id, r]));
    assert.ok(sec.has('EXP-3'), `the heading is in the section: ${[...sec.keys()].join(', ')}`);
    assert.equal(sec.get('EXP-4')?.text, A_TEXT.exp4, 'EXP-4 as it was at A');
    assert.equal(sec.get('EXP-5')?.text, A_TEXT.exp5, 'EXP-5 as it was at A');
    assert.ok(!old.section.some((r) => r.text === changed), 'nothing of B in the section of the A version');
    const ids = old.section.map((r) => r.id);
    assert.ok(ids.indexOf('EXP-3') < ids.indexOf('EXP-4') && ids.indexOf('EXP-4') < ids.indexOf('EXP-5'), `file order: ${ids.join(', ')}`);
  });
}

// 5. The section of a past hit is the section as it was at the hit's commit:
// each row shows that commit, the heading path and the line as they were, and
// the role history (a history query never shows a history row as current).
for (const level of [0, 1]) {
  test(`review 183 #5, level ${level}: each section row of a past version is the row as it was, at its commit, as history`, (t) => {
    const { dir, A } = smallRepo(t);
    const atA = new Map(exportRows(dir).rows.map((r) => [r.id, r]));
    const changed = 'The export link MUST expire 45 minutes after the email is sent.';
    write(dir, SPEC, SMALL_SPEC.replace('## Export links', '## Quasar navigation').replace(A_TEXT.exp4, changed));
    commitAll(dir, 'B: heading renamed, EXP-4 changed');
    search(dir, ['--id', 'EXP-4'], { level }); // the index is refreshed at B
    const out = search(dir, ['--id', 'EXP-4', '--history', '--section'], { level });
    const old = out.hits.find((h) => h.version === 1);
    assert.ok(old, `EXP-4 v1 is a hit:\n${idRoles(out).join('\n')}`);
    assert.equal(old.commit, A);
    const ids = old.section.map((r) => r.id);
    for (const id of ['EXP-3', 'EXP-4', 'EXP-5']) assert.ok(ids.includes(id), `${id} is in the section: ${ids.join(', ')}`);
    for (const r of old.section) {
      const then = atA.get(r.id);
      assert.ok(then, `${r.id} was a row at A`);
      assert.equal(r.commit, A, `${r.id}: the commit of the section is A`);
      assert.equal(r.role, 'history', `${r.id}: a row of a past section is shown as history, not ${r.role}`);
      assert.deepEqual(r.heading_path, then.heading_path, `${r.id}: the heading path as at A`);
      assert.ok(!r.heading_path.includes('Quasar navigation'), `${r.id}: no heading of B`);
      assert.equal(r.line, then.line, `${r.id}: the line as at A`);
      assert.equal(r.text, then.text, `${r.id}: the text as at A`);
    }
  });
}
