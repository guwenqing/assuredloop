// Issue #42: a changed heading text is a change of the heading paragraph
// only. The paragraphs below it are not Moved for that reason. Where a
// heading carries an ID, the heading path compared for Moved uses that ID;
// a heading with no ID keeps the text rule. A real move (another file,
// another parent heading, another order) is still Moved. Written from the
// requirement and the public interface (parseMarkdown, diffParagraphs,
// `al check`).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parseMarkdown } from '../src/markers.js';
import { diffParagraphs } from '../src/ids.js';
import { makeRepo, addRequest, runV4, lines, show } from './helpers/repo.js';
import { changeLines78 } from './helpers/as-78.js';

const doc = (...ls) => ls.join('\n') + '\n';
const parse = (text, file = 'specs/a.md') => parseMarkdown(text, file).paragraphs;
const changesOf = (r) => Object.fromEntries(r.map((e) => [e.id, e.changes]));
const diffText = (baseText, headText) => changesOf(diffParagraphs(parse(baseText), parse(headText)));

// An H1 (A-1) and an H2 (A-4) that carry IDs, with two paragraphs below each.
const titled = (h1, h2) => doc(
  '<!-- A-1 note -->', '', `# ${h1}`, '',
  '<!-- A-2 rule -->', '', 'Text two.', '',
  '<!-- A-3 rule -->', '', 'Text three.', '',
  '<!-- A-4 note -->', '', `## ${h2}`, '',
  '<!-- A-5 rule -->', '', 'Text five.', '',
  '<!-- A-6 rule -->', '', 'Text six.',
);
const BASE = titled('Exports', 'Formats');

describe('diffParagraphs on parsed text: a renamed heading with an ID', () => {
  test('renaming an H1 and an H2 that carry IDs: only the two headings are Changed, nothing is Moved', () => {
    assert.deepEqual(diffText(BASE, titled('Data exports', 'File formats')), {
      'A-1': ['Changed'], 'A-2': [], 'A-3': [], 'A-4': ['Changed'], 'A-5': [], 'A-6': [],
    });
  });

  test('renaming the H1 only: the H1 is Changed, the H2 and every paragraph below have no change', () => {
    assert.deepEqual(diffText(BASE, titled('Data exports', 'Formats')), {
      'A-1': ['Changed'], 'A-2': [], 'A-3': [], 'A-4': [], 'A-5': [], 'A-6': [],
    });
  });

  test('a changed paragraph text below a renamed heading is Changed only', () => {
    const head = titled('Data exports', 'Formats').replace('Text three.', 'Text three, reworded.');
    assert.deepEqual(diffText(BASE, head), {
      'A-1': ['Changed'], 'A-2': [], 'A-3': ['Changed'], 'A-4': [], 'A-5': [], 'A-6': [],
    });
  });

  test('a renamed heading and a real move in the same change: the heading is Changed, the moved paragraph is Moved, no other change', () => {
    // A-3 goes from below the H1 (A-1) to below the H2 (A-4).
    const head = doc(
      '<!-- A-1 note -->', '', '# Data exports', '',
      '<!-- A-2 rule -->', '', 'Text two.', '',
      '<!-- A-4 note -->', '', '## File formats', '',
      '<!-- A-5 rule -->', '', 'Text five.', '',
      '<!-- A-3 rule -->', '', 'Text three.', '',
      '<!-- A-6 rule -->', '', 'Text six.',
    );
    assert.deepEqual(diffText(BASE, head), {
      'A-1': ['Changed'], 'A-2': [], 'A-3': ['Moved'], 'A-4': ['Changed'], 'A-5': [], 'A-6': [],
    });
  });

  test('a paragraph under a heading with the same text but another ID is under another heading: Moved', () => {
    // Two H2s with the same text. Removing the second heading (A-4) puts A-5
    // under the first one (A-2). The heading texts on its path stay the same
    // and the order of the kept IDs stays the same; only the parent ID changes.
    const base = doc(
      '<!-- A-1 note -->', '', '# Exports', '',
      '<!-- A-2 note -->', '', '## Notes', '',
      '<!-- A-3 rule -->', '', 'Text three.', '',
      '<!-- A-4 note -->', '', '## Notes', '',
      '<!-- A-5 rule -->', '', 'Text five.',
    );
    const head = doc(
      '<!-- A-1 note -->', '', '# Exports', '',
      '<!-- A-2 note -->', '', '## Notes', '',
      '<!-- A-3 rule -->', '', 'Text three.', '',
      '<!-- A-5 rule -->', '', 'Text five.',
    );
    assert.deepEqual(diffText(base, head), {
      'A-1': [], 'A-2': [], 'A-3': [], 'A-5': ['Moved'], 'A-4': ['Removed'],
    });
  });
});

describe('diffParagraphs on parsed text: a deeper heading before a shallower one', () => {
  // # T / ## A / ### A1 / a paragraph / ## B / P. Every heading carries an ID.
  const deep = (a1) => doc(
    '<!-- D-1 note -->', '', '# T', '',
    '<!-- D-2 note -->', '', '## A', '',
    ...(a1 === null ? [] : ['<!-- D-3 note -->', '', `### ${a1}`, '']),
    '<!-- D-4 rule -->', '', 'Text under A1.', '',
    '<!-- D-5 note -->', '', '## B', '',
    '<!-- D-6 rule -->', '', 'Text P under B.',
  );

  test('the ### A1 heading renamed: only A1 is Changed; P under ## B has no change', () => {
    assert.deepEqual(diffText(deep('A1'), deep('A1 renamed')), {
      'D-1': [], 'D-2': [], 'D-3': ['Changed'], 'D-4': [], 'D-5': [], 'D-6': [],
    });
  });

  test('the ### A1 heading paragraph removed: A1 is Removed; P under ## B has no change', () => {
    const c = diffText(deep('A1'), deep(null));
    assert.deepEqual(c['D-3'], ['Removed']);
    assert.deepEqual(c['D-5'], []);
    assert.deepEqual(c['D-6'], [], `P must keep its place: ${JSON.stringify(c)}`);
    assert.deepEqual(c['D-1'], []);
    assert.deepEqual(c['D-2'], []);
  });

  test('a level-3 heading directly after a level-1 heading (a skipped level), renamed, moves nothing', () => {
    const skip = (h3) => doc(
      '<!-- S-1 note -->', '', '# T', '',
      '<!-- S-2 note -->', '', `### ${h3}`, '',
      '<!-- S-3 rule -->', '', 'Text under the level-3 heading.', '',
      '<!-- S-4 note -->', '', '## B', '',
      '<!-- S-5 rule -->', '', 'Text under B.',
    );
    assert.deepEqual(diffText(skip('Deep'), skip('Deep renamed')), {
      'S-1': [], 'S-2': ['Changed'], 'S-3': [], 'S-4': [], 'S-5': [],
    });
  });
});

describe('diffParagraphs: behaviour that #42 keeps', () => {
  test('a paragraph moved under another heading with an ID is Moved, and nothing else changes', () => {
    // A-2 goes from below the H1 (A-1) to the end, below the H2 (A-4).
    const head = doc(
      '<!-- A-1 note -->', '', '# Exports', '',
      '<!-- A-3 rule -->', '', 'Text three.', '',
      '<!-- A-4 note -->', '', '## Formats', '',
      '<!-- A-5 rule -->', '', 'Text five.', '',
      '<!-- A-6 rule -->', '', 'Text six.', '',
      '<!-- A-2 rule -->', '', 'Text two.',
    );
    assert.deepEqual(diffText(BASE, head), {
      'A-1': [], 'A-2': ['Moved'], 'A-3': [], 'A-4': [], 'A-5': [], 'A-6': [],
    });
  });

  test('a paragraph moved to another file is Moved, with the head file', () => {
    const baseParas = parse(BASE);
    const headA = parse(doc(
      '<!-- A-1 note -->', '', '# Exports', '',
      '<!-- A-2 rule -->', '', 'Text two.', '',
      '<!-- A-4 note -->', '', '## Formats', '',
      '<!-- A-5 rule -->', '', 'Text five.', '',
      '<!-- A-6 rule -->', '', 'Text six.',
    ));
    const headB = parse(doc(
      '<!-- B-1 note -->', '', '# Exports', '',
      '<!-- A-3 rule -->', '', 'Text three.',
    ), 'specs/b.md');
    const r = diffParagraphs(baseParas, [...headA, ...headB]);
    assert.deepEqual(changesOf(r), {
      'A-1': [], 'A-2': [], 'A-4': [], 'A-5': [], 'A-6': [], 'B-1': ['New'], 'A-3': ['Moved'],
    });
    assert.equal(r.find((e) => e.id === 'A-3').file, 'specs/b.md');
  });

  test('a heading with no ID inside a marked paragraph, renamed: that paragraph is Changed, no other change', () => {
    const withLoose = (h) => doc(
      '<!-- A-1 note -->', '', '# Exports', '',
      '<!-- A-2 rule -->', '', 'Text two.', '', `## ${h}`, '', 'More of two.', '',
      '<!-- A-3 rule -->', '', 'Text three.', '',
      '<!-- A-4 rule -->', '', 'Text four.',
    );
    assert.deepEqual(diffText(withLoose('Loose'), withLoose('Loose renamed')), {
      'A-1': [], 'A-2': ['Changed'], 'A-3': [], 'A-4': [],
    });
  });

  test('hand-built paragraphs with only a headingPath (no heading ID) keep the text rule: another headingPath is Moved', () => {
    const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
    const p = (id, headingPath) => ({
      id, kind: 'note', links: {}, text: `Text of ${id}.`, sha256: sha(`Text of ${id}.`),
      line: 1, headingPath, displayNumber: `${id} (0:1)`, file: 'specs/a.md',
    });
    const base = [p('A-1', ['Exports']), p('A-2', ['Exports', 'Formats']), p('A-3', ['Exports', 'Formats'])];
    const head = [p('A-1', ['Exports']), p('A-2', ['Data exports', 'Formats']), p('A-3', ['Exports', 'Formats'])];
    assert.deepEqual(changesOf(diffParagraphs(base, head)), { 'A-1': [], 'A-2': ['Moved'], 'A-3': [] });
  });

  test('parseMarkdown keeps the heading texts in headingPath', () => {
    const ps = parse(titled('Data exports', 'File formats'));
    assert.deepEqual(ps.map((x) => [x.id, x.headingPath]), [
      ['A-1', ['Data exports']],
      ['A-2', ['Data exports']],
      ['A-3', ['Data exports']],
      ['A-4', ['Data exports', 'File formats']],
      ['A-5', ['Data exports', 'File formats']],
      ['A-6', ['Data exports', 'File formats']],
    ]);
  });
});

// End to end through `al check`, as in issue #42: the only edit is the text
// of the H1 that holds a doc's first ID.
const EXPORTS = (h1, h2 = 'Formats') => doc(
  '<!-- EXP-1 note -->', '', `# ${h1}`, '',
  '<!-- EXP-2 purpose serves:inv/R1 -->', '', 'Invoicer exports invoices.', '',
  '<!-- EXP-3 rule serves:inv/R2 -->', '', 'The export link MUST expire.', '',
  '<!-- EXP-4 note -->', '', `## ${h2}`, '',
  '<!-- EXP-5 rule serves:inv/R2 -->', '', 'A link is signed.', '',
  '<!-- EXP-6 rule serves:inv/R3 -->', '', 'A link is used once.',
);

function featureRepo(t) {
  const repo = makeRepo(t);
  addRequest(repo);
  repo.write('specs/exports.md', EXPORTS('Exports'));
  repo.commit('spec on main');
  repo.git(['checkout', '-q', '-b', 'feature']);
  return repo;
}
const check = (repo, ...args) => runV4(repo.dir, ['check', ...args]);
// A change line names the text line of the paragraph (#74): `specs/exports.md:<line> <ID> <change>`.
// #78: it is now a map paragraph line; read back in that form, and sorted.
const changeLines = (r) => changeLines78(r.stdout);
const lintLines = (r) => lines(r.stdout).filter((l) => /^(not ok|hint) /.test(l));

describe('al check: a renamed heading (#42)', () => {
  test('the H1 title of a doc renamed: one line, the H1 Changed; no other paragraph has a change line', (t) => {
    const repo = featureRepo(t);
    repo.write('specs/exports.md', EXPORTS('Data exports'));
    repo.commit('rename the title');
    const r = check(repo);
    assert.equal(r.code, 0, show(r));
    assert.deepEqual(changeLines(r), ['specs/exports.md:3 EXP-1 Changed'].sort(), show(r));
  });

  test('the H1 and the H2 renamed in the working tree: two Changed lines and nothing else', (t) => {
    const repo = featureRepo(t);
    repo.write('specs/exports.md', EXPORTS('Data exports', 'File formats'));
    const r = check(repo);
    assert.equal(r.code, 0, show(r));
    assert.deepEqual(changeLines(r), ['specs/exports.md:3 EXP-1 Changed', 'specs/exports.md:15 EXP-4 Changed'].sort(), show(r));
  });

  test('a renamed H1 and a real move: the H1 Changed, the moved paragraph Moved, nothing else', (t) => {
    const repo = featureRepo(t);
    // EXP-5 goes up, from below the H2 (EXP-4) to below the H1 (EXP-1).
    repo.write('specs/exports.md', doc(
      '<!-- EXP-1 note -->', '', '# Data exports', '',
      '<!-- EXP-2 purpose serves:inv/R1 -->', '', 'Invoicer exports invoices.', '',
      '<!-- EXP-5 rule serves:inv/R2 -->', '', 'A link is signed.', '',
      '<!-- EXP-3 rule serves:inv/R2 -->', '', 'The export link MUST expire.', '',
      '<!-- EXP-4 note -->', '', '## Formats', '',
      '<!-- EXP-6 rule serves:inv/R3 -->', '', 'A link is used once.',
    ));
    const r = check(repo);
    assert.equal(r.code, 0, show(r));
    assert.deepEqual(changeLines(r), ['specs/exports.md:3 EXP-1 Changed', 'specs/exports.md:11 EXP-5 Moved'].sort(), show(r));
  });

  test('a renamed heading changes no hint, no not ok line and no exit code, also with --strict', (t) => {
    const repo = featureRepo(t);
    const before = check(repo);
    const beforeStrict = check(repo, '--strict');
    repo.write('specs/exports.md', EXPORTS('Data exports', 'File formats'));
    const after = check(repo);
    const afterStrict = check(repo, '--strict');
    assert.equal(before.code, 0, show(before));
    assert.equal(after.code, before.code, show(after));
    assert.equal(afterStrict.code, beforeStrict.code, show(afterStrict));
    assert.deepEqual(lintLines(after), lintLines(before), show(after));
    assert.deepEqual(lintLines(afterStrict), lintLines(beforeStrict), show(afterStrict));
  });
});
