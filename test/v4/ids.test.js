// src/v4/ids.js: diffParagraphs(base, head) and idLints(base, head, opts).
// Paragraphs are built by hand in the shape parseMarkdown returns, so these
// tests do not depend on the parser.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { diffParagraphs, idLints } from '../../src/v4/ids.js';

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const LINK_KEYS = ['serves', 'buildsOn', 'changes', 'removes', 'explains', 'illustrates',
  'resolvedBy', 'governedBy', 'decides', 'for', 'supersedes', 'source'];

// A paragraph: `text` defaults to "Text of <id>.", `file` to specs/a.md,
// `headingPath` to ['Title'].
function p(id, { text = `Text of ${id}.`, file = 'specs/a.md', headingPath = ['Title'], line = 1 } = {}) {
  return {
    id, kind: 'note', links: Object.fromEntries(LINK_KEYS.map((k) => [k, []])),
    text, sha256: sha(text), line, headingPath, displayNumber: `${id} (0:1, in Title)`, file,
  };
}
// Paragraphs with lines 1, 5, 9, ... in one file.
const seq = (idList, opts = {}) => idList.map((id, i) => p(id, { line: 1 + 4 * i, ...opts }));

const entry = (r, id) => r.find((e) => e.id === id);
const changesOf = (r) => Object.fromEntries(r.map((e) => [e.id, e.changes]));

describe('diffParagraphs', () => {
  test('no paragraphs on either side gives no entries', () => {
    assert.deepEqual(diffParagraphs([], []), []);
  });

  test('unchanged paragraphs give one entry each with changes []', () => {
    const base = seq(['A-1', 'A-2', 'A-3']);
    const head = seq(['A-1', 'A-2', 'A-3']);
    assert.deepEqual(diffParagraphs(base, head), base.map((x) => ({
      id: x.id, file: 'specs/a.md', sha256: x.sha256, baseSha256: x.sha256, changes: [],
    })));
  });

  test('a line number change alone is not a change', () => {
    const base = [p('A-1', { line: 1 }), p('A-2', { line: 5 })];
    const head = [p('A-1', { line: 3 }), p('A-2', { line: 9 })];
    assert.deepEqual(changesOf(diffParagraphs(base, head)), { 'A-1': [], 'A-2': [] });
  });

  test('New: an ID only in head, alone, with baseSha256 null', () => {
    const head = [p('A-1'), p('A-2', { file: 'specs/b.md' })];
    const r = diffParagraphs([p('A-1')], head);
    assert.deepEqual(entry(r, 'A-2'), { id: 'A-2', file: 'specs/b.md', sha256: head[1].sha256, baseSha256: null, changes: ['New'] });
    assert.deepEqual(entry(r, 'A-1').changes, []);
  });

  test('Removed: an ID only in base, alone, with sha256 null and the base file', () => {
    const base = [p('A-1'), p('A-2', { file: 'specs/b.md' })];
    const r = diffParagraphs(base, [p('A-1')]);
    assert.deepEqual(entry(r, 'A-2'), { id: 'A-2', file: 'specs/b.md', sha256: null, baseSha256: base[1].sha256, changes: ['Removed'] });
  });

  test('Changed: the text hash differs, both hashes given', () => {
    const base = seq(['A-1', 'A-2']);
    const head = [base[0], p('A-2', { text: 'New words.', line: 5 })];
    const r = diffParagraphs(base, head);
    assert.deepEqual(entry(r, 'A-2'), { id: 'A-2', file: 'specs/a.md', sha256: sha('New words.'), baseSha256: base[1].sha256, changes: ['Changed'] });
    assert.deepEqual(entry(r, 'A-1').changes, []);
  });

  test('Moved: the paragraph is in another file; file is the head file', () => {
    const base = [p('A-1'), p('A-2')];
    const head = [p('A-1'), p('A-2', { file: 'specs/b.md' })];
    const r = diffParagraphs(base, head);
    assert.deepEqual(entry(r, 'A-2'), { id: 'A-2', file: 'specs/b.md', sha256: base[1].sha256, baseSha256: base[1].sha256, changes: ['Moved'] });
    assert.deepEqual(entry(r, 'A-1').changes, []);
  });

  test('Moved: the paragraph has another headingPath', () => {
    const base = [p('A-1', { headingPath: ['T', 'X'] }), p('A-2', { headingPath: ['T', 'X'] })];
    const head = [p('A-1', { headingPath: ['T', 'X'] }), p('A-2', { headingPath: ['T', 'Y'] })];
    assert.deepEqual(changesOf(diffParagraphs(base, head)), { 'A-1': [], 'A-2': ['Moved'] });
  });

  test('Moved by order: only the minimum set moves, the paragraphs it passed stay', () => {
    const base = seq(['A-1', 'A-2', 'A-3', 'A-4', 'A-5']);
    const head = seq(['A-1', 'A-3', 'A-4', 'A-5', 'A-2']);
    assert.deepEqual(changesOf(diffParagraphs(base, head)),
      { 'A-1': [], 'A-2': ['Moved'], 'A-3': [], 'A-4': [], 'A-5': [] });
  });

  test('Moved by order: a paragraph moved to the top moves alone', () => {
    const base = seq(['A-1', 'A-2', 'A-3', 'A-4']);
    const head = seq(['A-4', 'A-1', 'A-2', 'A-3']);
    assert.deepEqual(changesOf(diffParagraphs(base, head)), { 'A-1': [], 'A-2': [], 'A-3': [], 'A-4': ['Moved'] });
  });

  test('Moved by order: two paragraphs swapped across a longer kept run, only the two move', () => {
    const base = seq(['A-1', 'A-2', 'A-3', 'A-4', 'A-5', 'A-6']);
    const head = seq(['A-1', 'A-5', 'A-3', 'A-4', 'A-2', 'A-6']);
    const c = changesOf(diffParagraphs(base, head));
    assert.deepEqual(c, { 'A-1': [], 'A-2': ['Moved'], 'A-3': [], 'A-4': [], 'A-5': ['Moved'], 'A-6': [] });
  });

  test('order counts only IDs kept in both: a removal and an addition move nothing', () => {
    const base = seq(['A-1', 'A-9', 'A-2', 'A-3']);
    const head = seq(['A-1', 'A-2', 'A-3', 'A-10']);
    assert.deepEqual(changesOf(diffParagraphs(base, head)),
      { 'A-1': [], 'A-2': [], 'A-3': [], 'A-10': ['New'], 'A-9': ['Removed'] });
  });

  test('Changed and Moved together', () => {
    const base = seq(['A-1', 'A-2', 'A-3']);
    const head = [p('A-2', { line: 1 }), p('A-3', { line: 5 }), p('A-1', { text: 'Reworded.', line: 9 })];
    const r = diffParagraphs(base, head);
    assert.deepEqual(entry(r, 'A-1').changes, ['Changed', 'Moved']);
    assert.deepEqual(entry(r, 'A-2').changes, []);
    assert.deepEqual(entry(r, 'A-3').changes, []);
  });

  test('Changed and Moved together, by file', () => {
    const base = [p('A-1')];
    const head = [p('A-1', { file: 'specs/b.md', text: 'Reworded.' })];
    assert.deepEqual(diffParagraphs(base, head), [
      { id: 'A-1', file: 'specs/b.md', sha256: sha('Reworded.'), baseSha256: base[0].sha256, changes: ['Changed', 'Moved'] },
    ]);
  });

  test('entries come in head order, then the removed IDs in base order', () => {
    const base = seq(['A-7', 'A-1', 'A-8', 'A-2']);
    const head = seq(['A-9', 'A-1', 'A-2', 'A-3']);
    assert.deepEqual(diffParagraphs(base, head).map((e) => e.id), ['A-9', 'A-1', 'A-2', 'A-3', 'A-7', 'A-8']);
  });

  test('paragraphs of several files of one scope are diffed together', () => {
    const base = [p('A-1', { file: 'specs/a.md' }), p('A-2', { file: 'specs/b.md' })];
    const head = [p('A-1', { file: 'specs/a.md' }), p('A-2', { file: 'specs/b.md', text: 'Edited.' })];
    const r = diffParagraphs(base, head);
    assert.deepEqual(r.map((e) => [e.id, e.file, e.changes]), [['A-1', 'specs/a.md', []], ['A-2', 'specs/b.md', ['Changed']]]);
  });
});

describe('idLints', () => {
  const lintsOf = (r, code) => r.filter((l) => l.code === code);

  test('no change gives no lint', () => {
    const base = seq(['A-1', 'A-2']);
    assert.deepEqual(idLints(base, seq(['A-1', 'A-2']), {}), []);
  });

  test('the options object may be left out', () => {
    assert.deepEqual(idLints(seq(['A-1']), seq(['A-1'])), []);
  });

  test('lost-id: an ID in base that is not in head', () => {
    const base = [p('A-1'), p('A-2', { file: 'specs/b.md', line: 5 })];
    const r = idLints(base, [p('A-1')], {});
    assert.equal(r.length, 1, JSON.stringify(r));
    assert.equal(r[0].code, 'lost-id');
    assert.equal(r[0].severity, 'not ok');
    assert.equal(r[0].id, 'A-2');
    // Ambiguity: a lost ID has no head place; the lint names the base file.
    assert.equal(r[0].file, 'specs/b.md');
    assert.equal(typeof r[0].line, 'number');
    assert.ok(r[0].message.length > 0);
  });

  test('a removal declared by removes is not lost-id', () => {
    const base = seq(['A-1', 'A-2', 'A-3']);
    const head = seq(['A-1']);
    const r = idLints(base, head, { removes: ['A-2'] });
    assert.deepEqual(r.map((l) => [l.code, l.id]), [['lost-id', 'A-3']]);
  });

  test('a move to another file of the same scope is not lost-id', () => {
    const base = [p('A-1'), p('A-2')];
    const head = [p('A-1'), p('A-2', { file: 'specs/b.md' })];
    assert.deepEqual(idLints(base, head, {}), []);
  });

  test('used-again: an ID in head, not in base, and in everUsed', () => {
    const base = seq(['A-1']);
    const head = [p('A-1'), p('A-5', { file: 'specs/b.md', line: 9 }), p('A-6', { line: 13 })];
    const r = idLints(base, head, { everUsed: ['A-1', 'A-5'] });
    assert.equal(r.length, 1, JSON.stringify(r));
    assert.deepEqual({ code: r[0].code, severity: r[0].severity, id: r[0].id, file: r[0].file, line: r[0].line },
      { code: 'used-again', severity: 'not ok', id: 'A-5', file: 'specs/b.md', line: 9 });
  });

  test('control: an ID in base, in head and in everUsed is not used-again', () => {
    assert.deepEqual(idLints(seq(['A-1', 'A-2']), seq(['A-1', 'A-2']), { everUsed: ['A-1', 'A-2'] }), []);
  });

  test('duplicate-id: an ID in head in two different files, on the extra file', () => {
    const base = [p('A-1')];
    const head = [p('A-1', { file: 'specs/a.md', line: 1 }), p('A-1', { file: 'specs/b.md', line: 7 })];
    const r = lintsOf(idLints(base, head, {}), 'duplicate-id');
    assert.equal(r.length, 1, JSON.stringify(r));
    assert.deepEqual({ severity: r[0].severity, id: r[0].id, file: r[0].file, line: r[0].line },
      { severity: 'not ok', id: 'A-1', file: 'specs/b.md', line: 7 });
  });

  test('duplicate-id: once per extra file', () => {
    const head = [p('A-1', { file: 'specs/a.md' }), p('A-1', { file: 'specs/b.md' }), p('A-1', { file: 'specs/c.md' })];
    const r = lintsOf(idLints([p('A-1')], head, {}), 'duplicate-id');
    assert.deepEqual(r.map((l) => l.file).sort(), ['specs/b.md', 'specs/c.md']);
  });

  // The same ID twice in one file is parseMarkdown's duplicate-id; idLints
  // flags only "two different files".
  test('control: the same ID twice in one file, or two IDs in two files, is not idLints duplicate-id', () => {
    const same = [p('A-1', { line: 1 }), p('A-1', { line: 5 })];
    assert.deepEqual(lintsOf(idLints([p('A-1')], same, {}), 'duplicate-id'), []);
    const two = [p('A-1', { file: 'specs/a.md' }), p('A-2', { file: 'specs/b.md' })];
    assert.deepEqual(idLints(two, two, {}), []);
  });
});
