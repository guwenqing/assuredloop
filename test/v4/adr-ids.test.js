// ADR paragraph IDs (architect decision D4 for issue #175, T9): the heading
// of an ADR file has ADR-<n>, its other paragraphs ADR-<n>-<k>. The marker ID
// is [A-Z][A-Z0-9]*-[0-9]+ or ADR-[0-9]+-[0-9]+; only the prefix ADR takes
// the second number. Written before the code.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parseMarkdown } from '../../src/v4/markers.js';
import { diffParagraphs, idLints } from '../../src/v4/ids.js';

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const F = 'specs/adr/0004-pick-a.md';
const doc = (...ls) => ls.join('\n') + '\n';

const ADR = doc(
  '<!-- ADR-4 note -->', '', '# 4. Pick A', '',
  '<!-- ADR-4-1 rationale -->', '', 'Because A is simpler.', '',
  '<!-- ADR-4-2 choice serves:R1 -->', '', 'We pick A.',
);

describe('parseMarkdown and ADR-<n>-<k>', () => {
  test('<!-- ADR-4-1 rationale --> is a marker with id ADR-4-1 and kind rationale', () => {
    const r = parseMarkdown('<!-- ADR-4-1 rationale -->\n\nBecause A is simpler.\n', F);
    assert.deepEqual(r.lints, []);
    assert.equal(r.paragraphs.length, 1);
    assert.equal(r.paragraphs[0].id, 'ADR-4-1');
    assert.equal(r.paragraphs[0].kind, 'rationale');
    assert.equal(r.paragraphs[0].text, 'Because A is simpler.');
  });

  test('an ADR doc with ADR-4, ADR-4-1 and ADR-4-2 gives no duplicate-id and no lint', () => {
    const r = parseMarkdown(ADR, F);
    assert.deepEqual(r.lints, []);
    assert.deepEqual(r.paragraphs.map((p) => [p.id, p.kind, p.line]),
      [['ADR-4', 'note', 1], ['ADR-4-1', 'rationale', 5], ['ADR-4-2', 'choice', 9]]);
  });

  test('ADR-4-1 used twice in one doc is duplicate-id on the second', () => {
    const r = parseMarkdown(doc('<!-- ADR-4-1 rationale -->', '', 'One.', '', '<!-- ADR-4-1 rationale -->', '', 'Two.'), F);
    assert.deepEqual(r.lints.map((l) => [l.code, l.id, l.line]), [['duplicate-id', 'ADR-4-1', 5]]);
  });

  test('control: <!-- ADR-4 note --> is still a marker', () => {
    const r = parseMarkdown('<!-- ADR-4 note -->\n\n# 4. Pick A\n', F);
    assert.deepEqual(r.lints, []);
    assert.deepEqual(r.paragraphs.map((p) => p.id), ['ADR-4']);
  });

  for (const line of ['<!-- INV-4-1 rule -->', '<!-- ADR-4-1-2 note -->', '<!-- XADR-4-1 note -->', '<!-- ADR4-1-1 note -->']) {
    test(`control: ${line} is not a marker, so the doc gives no-id`, () => {
      const r = parseMarkdown(`${line}\n\nText.\n`, 'specs/inv.md');
      assert.deepEqual(r.paragraphs, []);
      assert.ok(r.lints.some((l) => l.code === 'no-id' && l.line === 1), JSON.stringify(r.lints));
    });
  }
});

const LINK_KEYS = ['serves', 'buildsOn', 'changes', 'removes', 'explains', 'illustrates',
  'resolvedBy', 'governedBy', 'decides', 'for', 'supersedes', 'source'];
function p(id, { text = `Text of ${id}.`, file = F, line = 1 } = {}) {
  return {
    id, kind: 'note', links: Object.fromEntries(LINK_KEYS.map((k) => [k, []])),
    text, sha256: sha(text), line, headingPath: ['4. Pick A'], displayNumber: id, file,
  };
}

describe('diffParagraphs and idLints and ADR-<n>-<k>', () => {
  test('diffParagraphs gives ADR-4, ADR-4-1 and ADR-4-2 an entry each', () => {
    const base = [p('ADR-4', { line: 1 }), p('ADR-4-1', { line: 5 })];
    const head = [p('ADR-4', { line: 1 }), p('ADR-4-1', { line: 5, text: 'Reworded.' }), p('ADR-4-2', { line: 9 })];
    assert.deepEqual(diffParagraphs(base, head).map((e) => [e.id, e.changes]),
      [['ADR-4', []], ['ADR-4-1', ['Changed']], ['ADR-4-2', ['New']]]);
  });

  test('idLints: ADR-4-1 gone at head is lost-id, even when ADR-4 stays and removes names ADR-4', () => {
    const base = [p('ADR-4', { line: 1 }), p('ADR-4-1', { line: 5 })];
    const head = [p('ADR-4', { line: 1 })];
    assert.deepEqual(idLints(base, head, { removes: ['ADR-4'] }).map((l) => [l.code, l.id]), [['lost-id', 'ADR-4-1']]);
    assert.deepEqual(idLints(base, head, { removes: ['ADR-4-1'] }), []);
  });

  test('idLints: everUsed ADR-4 does not make a new ADR-4-1 used-again; everUsed ADR-4-1 does', () => {
    const base = [p('ADR-4', { line: 1 })];
    const head = [p('ADR-4', { line: 1 }), p('ADR-4-1', { line: 5 })];
    assert.deepEqual(idLints(base, head, { everUsed: ['ADR-4'] }), []);
    assert.deepEqual(idLints(base, head, { everUsed: ['ADR-4', 'ADR-4-1'] }).map((l) => [l.code, l.id, l.line]),
      [['used-again', 'ADR-4-1', 5]]);
  });

  test('idLints: ADR-4-1 in two files is duplicate-id; ADR-4 in one and ADR-4-1 in another is not', () => {
    const two = [p('ADR-4-1', { file: F }), p('ADR-4-1', { file: 'specs/adr/0005-pick-b.md' })];
    assert.deepEqual(idLints([], two, {}).filter((l) => l.code === 'duplicate-id').map((l) => l.id), ['ADR-4-1']);
    const apart = [p('ADR-4', { file: F }), p('ADR-4-1', { file: 'specs/adr/0005-pick-b.md' })];
    assert.deepEqual(idLints([], apart, {}), []);
  });
});
