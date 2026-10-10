// src/v4/markers.js: parseMarkdown(text, file, options?), KINDS, groupOf.
// Written from the T8 interface (issue #174), design.md section 3 and
// schema.md sections 3 and 4.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parseMarkdown, KINDS, groupOf } from '../../src/v4/markers.js';

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const doc = (...ls) => ls.join('\n') + '\n';
const F = 'specs/inv.md';

const LINK_KEYS = ['serves', 'buildsOn', 'changes', 'removes', 'explains', 'illustrates',
  'resolvedBy', 'governedBy', 'decides', 'for', 'supersedes', 'source'];
const noLinks = () => Object.fromEntries(LINK_KEYS.map((k) => [k, []]));
const links = (over) => ({ ...noLinks(), ...over });

const codes = (lints) => lints.map((l) => l.code);
const byCode = (lints, code) => lints.filter((l) => l.code === code);
const ids = (r) => r.paragraphs.map((p) => p.id);

function assertLint(lints, { code, severity, id, line }) {
  const found = lints.filter((l) => l.code === code && l.id === id && l.line === line);
  assert.equal(found.length, 1, `one ${code} lint for ${id} at line ${line} expected, got:\n${JSON.stringify(lints, null, 2)}`);
  assert.equal(found[0].severity, severity);
  assert.equal(found[0].file, F);
  assert.equal(typeof found[0].message, 'string');
  assert.ok(found[0].message.length > 0, 'a lint has a message');
}

// A doc with a single leading H1 (a title), H2 and H3, a repeated H3 text
// under two parents, and a closing run of # on one heading. No lint.
const TITLED = doc(
  '<!-- INV-1 note -->', //            1
  '',
  '# Invoices', //                      3
  '',
  '<!-- INV-2 purpose serves:R1 -->', // 5
  '',
  'Invoicer sends invoices.', //        7
  '',
  '<!-- INV-3 note -->', //            9
  '',
  '## Export',
  '',
  '<!-- INV-4 rule serves:R2 -->', //  13
  '',
  'The export link MUST expire.',
  '',
  '<!-- INV-5 note -->', //            17
  '',
  '### Links',
  '',
  '<!-- INV-6 rule serves:R2 -->', //  21
  '',
  'A link is signed.',
  'It names the invoice.',
  '',
  '<!-- INV-7 example illustrates:INV-6 -->', // 26
  '',
  'For example, a link to invoice 7.',
  '',
  '<!-- INV-8 note -->', //            30
  '',
  '##   Import  ##',
  '',
  '<!-- INV-9 scope serves:R3 -->', // 34
  '',
  'Import covers CSV.',
  '',
  '<!-- INV-10 note -->', //           38
  '',
  '### Links',
  '',
  '<!-- INV-11 limit serves:R3 -->', // 42
  '',
  'Import does not follow links.',
);

const TITLED_EXPECTED = [
  { id: 'INV-1', kind: 'note', text: '# Invoices', line: 1, headingPath: ['Invoices'], displayNumber: 'INV-1 (0, Invoices)' },
  { id: 'INV-2', kind: 'purpose', text: 'Invoicer sends invoices.', line: 5, headingPath: ['Invoices'], displayNumber: 'INV-2 (0:1, in Invoices)' },
  { id: 'INV-3', kind: 'note', text: '## Export', line: 9, headingPath: ['Invoices', 'Export'], displayNumber: 'INV-3 (1, Export)' },
  { id: 'INV-4', kind: 'rule', text: 'The export link MUST expire.', line: 13, headingPath: ['Invoices', 'Export'], displayNumber: 'INV-4 (1:1, in Export)' },
  { id: 'INV-5', kind: 'note', text: '### Links', line: 17, headingPath: ['Invoices', 'Export', 'Links'], displayNumber: 'INV-5 (1.1, Links)' },
  { id: 'INV-6', kind: 'rule', text: 'A link is signed.\nIt names the invoice.', line: 21, headingPath: ['Invoices', 'Export', 'Links'], displayNumber: 'INV-6 (1.1:1, in Links)' },
  { id: 'INV-7', kind: 'example', text: 'For example, a link to invoice 7.', line: 26, headingPath: ['Invoices', 'Export', 'Links'], displayNumber: 'INV-7 (1.1:2, in Links)' },
  { id: 'INV-8', kind: 'note', text: '##   Import  ##', line: 30, headingPath: ['Invoices', 'Import'], displayNumber: 'INV-8 (2, Import)' },
  { id: 'INV-9', kind: 'scope', text: 'Import covers CSV.', line: 34, headingPath: ['Invoices', 'Import'], displayNumber: 'INV-9 (2:1, in Import)' },
  { id: 'INV-10', kind: 'note', text: '### Links', line: 38, headingPath: ['Invoices', 'Import', 'Links'], displayNumber: 'INV-10 (2.1, Links)' },
  { id: 'INV-11', kind: 'limit', text: 'Import does not follow links.', line: 42, headingPath: ['Invoices', 'Import', 'Links'], displayNumber: 'INV-11 (2.1:1, in Links)' },
];

describe('paragraph fields', () => {
  // Ambiguity: `text` of a heading paragraph is read as the raw line, with its
  // # marks (only headingPath is said to drop them), and a paragraph's text
  // has no final newline (trailing blank lines are dropped; lines join on LF).
  // Ambiguity: displayNumber holds the whole shown string, ID included, as in
  // decision 4 ("INV-41 (2.3:4, in Export links)").
  test('a titled doc: id, kind, text, line, headingPath, displayNumber, file, sha256 of each paragraph', () => {
    const r = parseMarkdown(TITLED, F);
    assert.deepEqual(r.lints, []);
    assert.deepEqual(ids(r), TITLED_EXPECTED.map((e) => e.id));
    r.paragraphs.forEach((p, i) => {
      const e = TITLED_EXPECTED[i];
      assert.equal(p.id, e.id);
      assert.equal(p.kind, e.kind, e.id);
      assert.equal(p.text, e.text, e.id);
      assert.equal(p.line, e.line, e.id);
      assert.deepEqual(p.headingPath, e.headingPath, e.id);
      assert.equal(p.displayNumber, e.displayNumber, e.id);
      assert.equal(p.file, F, e.id);
      assert.equal(p.sha256, sha(e.text), e.id);
      assert.match(p.sha256, /^[0-9a-f]{64}$/);
    });
  });

  test('links of the titled doc are filled from the marker, all twelve keys present', () => {
    const r = parseMarkdown(TITLED, F);
    assert.deepEqual(r.paragraphs[0].links, noLinks());
    assert.deepEqual(r.paragraphs[1].links, links({ serves: ['R1'] }));
    assert.deepEqual(r.paragraphs[6].links, links({ illustrates: ['INV-6'] }));
  });

  test('a doc without a title (two H1): H1 is 1, H2 is 1.1, text before any heading is "in the top"', () => {
    const r = parseMarkdown(doc(
      '<!-- TOP-1 note -->', '', 'Text before any heading.', '',
      '<!-- TOP-2 note -->', '', '# Alpha', '',
      '<!-- TOP-3 note -->', '', '## Beta', '',
      '<!-- TOP-4 note -->', '', 'Beta text.', '',
      '<!-- TOP-5 note -->', '', 'More beta text.', '',
      '<!-- TOP-6 note -->', '', '# Gamma', '',
      '<!-- TOP-7 note -->', '', 'Gamma text.',
    ), F);
    assert.deepEqual(r.lints, []);
    assert.deepEqual(r.paragraphs.map((p) => p.displayNumber), [
      'TOP-1 (0:1, in the top)',
      'TOP-2 (1, Alpha)',
      'TOP-3 (1.1, Beta)',
      'TOP-4 (1.1:1, in Beta)',
      'TOP-5 (1.1:2, in Beta)',
      'TOP-6 (2, Gamma)',
      'TOP-7 (2:1, in Gamma)',
    ]);
    assert.deepEqual(r.paragraphs.map((p) => p.headingPath), [
      [], ['Alpha'], ['Alpha', 'Beta'], ['Alpha', 'Beta'], ['Alpha', 'Beta'], ['Gamma'], ['Gamma'],
    ]);
  });

  test('the H1 is a title only when no other H1 follows: with a later H1 the first H1 is numbered 1', () => {
    const titled = parseMarkdown(doc('<!-- A-1 note -->', '', '# One', '', '<!-- A-2 note -->', '', '## Two'), F);
    assert.deepEqual(titled.paragraphs.map((p) => p.displayNumber), ['A-1 (0, One)', 'A-2 (1, Two)']);
    const untitled = parseMarkdown(doc('<!-- A-1 note -->', '', '# One', '', '<!-- A-2 note -->', '', '## Two', '',
      '<!-- A-3 note -->', '', '# Three'), F);
    assert.deepEqual(untitled.paragraphs.map((p) => p.displayNumber), ['A-1 (1, One)', 'A-2 (1.1, Two)', 'A-3 (2, Three)']);
  });

  test('a list, a table, a fenced block, a quote and indented lines stay with the paragraph that introduces them', () => {
    const body = [
      'The export has:',
      '',
      '- one row per invoice',
      '- a total',
      '',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '```js',
      '# not a heading',
      '',
      'not a new paragraph',
      '```',
      '',
      '> A quote.',
      '',
      '    indented code',
    ].join('\n');
    const r = parseMarkdown(doc('<!-- A-1 rule serves:R1 -->', '', body, '', '<!-- A-2 note -->', '', 'Next.'), F);
    assert.deepEqual(r.lints, []);
    assert.deepEqual(ids(r), ['A-1', 'A-2']);
    assert.equal(r.paragraphs[0].text, body);
    assert.equal(r.paragraphs[0].sha256, sha(body));
    assert.equal(r.paragraphs[1].text, 'Next.');
    assert.equal(r.paragraphs[1].line, 22);
  });

  test('extra blank lines after the marker and before the next marker are not part of the text', () => {
    const r = parseMarkdown('<!-- A-1 note -->\n\n\nBody.\n\n\n\n<!-- A-2 note -->\n\nTail.\n', F);
    assert.deepEqual(r.lints, []);
    assert.equal(r.paragraphs[0].text, 'Body.');
    assert.equal(r.paragraphs[0].sha256, sha('Body.'));
    assert.equal(r.paragraphs[1].line, 8);
  });

  test('a file that does not end in a newline gives the same text', () => {
    const r = parseMarkdown('<!-- A-1 note -->\n\nBody.', F);
    assert.deepEqual(r.lints, []);
    assert.equal(r.paragraphs[0].text, 'Body.');
  });

  test('CRLF input gives the same paragraphs and lints as LF input; text has no CR', () => {
    const lf = parseMarkdown(TITLED, F);
    const crlf = parseMarkdown(TITLED.replace(/\n/g, '\r\n'), F);
    assert.deepEqual(crlf, lf);
    for (const p of crlf.paragraphs) assert.ok(!p.text.includes('\r'), p.id);
    assert.equal(crlf.paragraphs[5].sha256, sha('A link is signed.\nIt names the invoice.'));
  });

  test('CRLF input with a lint reports it at the same line as LF input', () => {
    const text = doc('<!-- A-1 note -->', 'Body.');
    assert.deepEqual(parseMarkdown(text.replace(/\n/g, '\r\n'), F).lints, parseMarkdown(text, F).lints);
    assert.deepEqual(codes(parseMarkdown(text.replace(/\n/g, '\r\n'), F).lints), ['no-blank-after']);
  });

  test('the hash changes when the text changes and not when only the marker changes', () => {
    const a = parseMarkdown('<!-- A-1 rule serves:R1 -->\n\nThe link expires.\n', F).paragraphs[0];
    const b = parseMarkdown('<!-- A-1 limit serves:R2 builds-on:B-3 -->\n\nThe link expires.\n', F).paragraphs[0];
    const c = parseMarkdown('<!-- A-1 rule serves:R1 -->\n\nThe link expires soon.\n', F).paragraphs[0];
    assert.equal(a.sha256, b.sha256);
    assert.notEqual(a.sha256, c.sha256);
    assert.equal(c.sha256, sha('The link expires soon.'));
  });
});

describe('the marker grammar', () => {
  test('every link word fills its own links key', () => {
    const marker = '<!-- A-1 note serves:S builds-on:B changes:C removes:R explains:E illustrates:I '
      + 'resolved-by:RB governed-by:G decides:D for:T supersedes:SU source:SO -->';
    const r = parseMarkdown(`${marker}\n\nBody.\n`, F);
    assert.deepEqual(r.lints, []);
    assert.deepEqual(r.paragraphs[0].links, {
      serves: ['S'], buildsOn: ['B'], changes: ['C'], removes: ['R'], explains: ['E'], illustrates: ['I'],
      resolvedBy: ['RB'], governedBy: ['G'], decides: ['D'], for: ['T'], supersedes: ['SU'], source: ['SO'],
    });
    assert.equal(r.paragraphs[0].kind, 'note');
  });

  test('targets are split on commas and kept as written; a repeated word adds to the same list', () => {
    const r = parseMarkdown('<!-- INV-41 rule serves:invoice-exports/R2,R3 builds-on:INV-12 serves:R4 -->\n\nX.\n', F);
    assert.deepEqual(r.lints, []);
    assert.equal(r.paragraphs[0].id, 'INV-41');
    assert.equal(r.paragraphs[0].kind, 'rule');
    assert.deepEqual(r.paragraphs[0].links, links({ serves: ['invoice-exports/R2', 'R3', 'R4'], buildsOn: ['INV-12'] }));
  });

  test('more than one space between tokens and trailing spaces after --> are allowed', () => {
    const r = parseMarkdown('<!--   A-1   rule   serves:R1   -->   \n\nX.\n', F);
    assert.deepEqual(r.lints, []);
    assert.equal(r.paragraphs[0].id, 'A-1');
    assert.equal(r.paragraphs[0].kind, 'rule');
    assert.deepEqual(r.paragraphs[0].links, links({ serves: ['R1'] }));
  });

  test('an ID with digits in the prefix is an ID', () => {
    const r = parseMarkdown('<!-- V2X-17 note -->\n\nX.\n', F);
    assert.deepEqual(ids(r), ['V2X-17']);
    assert.deepEqual(r.lints, []);
  });

  // A line that does not match the marker grammar is text: it gives no
  // paragraph, so the text it starts has no ID.
  for (const [name, line] of [
    ['leading spaces', '  <!-- A-1 note -->'],
    ['a lower-case ID', '<!-- a-1 note -->'],
    ['an ID with no number', '<!-- A note -->'],
    ['no space after <!--', '<!--A-1 note -->'],
    ['no space before -->', '<!-- A-1 note-->'],
    ['text after -->', '<!-- A-1 note --> more'],
  ]) {
    test(`a line with ${name} is not a marker`, () => {
      const r = parseMarkdown(`${line}\n\nBody.\n`, F);
      assert.deepEqual(r.paragraphs, []);
      assert.ok(codes(r.lints).includes('no-id'), JSON.stringify(r.lints));
    });
  }

  test('a marker inside a ``` fenced block is text, not a marker', () => {
    const body = ['Example:', '', '```markdown', '<!-- A-9 rule serves:R1 -->', '', 'Inner text.', '```'].join('\n');
    const r = parseMarkdown(doc('<!-- A-1 example illustrates:A-2 -->', '', body, '', '<!-- A-2 rule serves:R1 -->', '', 'Rule.'), F);
    assert.deepEqual(r.lints, []);
    assert.deepEqual(ids(r), ['A-1', 'A-2']);
    assert.equal(r.paragraphs[0].text, body);
  });

  test('a marker inside a ~~~ fenced block is text, not a marker', () => {
    const body = ['Example:', '', '~~~', '<!-- A-1 note -->', '', 'Inner text.', '~~~'].join('\n');
    const r = parseMarkdown(doc('<!-- A-1 example illustrates:A-2 -->', '', body, '', '<!-- A-2 rule serves:R1 -->', '', 'Rule.'), F);
    // The A-1 inside the fence would be a duplicate-id if it were read as a marker.
    assert.deepEqual(r.lints, []);
    assert.deepEqual(ids(r), ['A-1', 'A-2']);
    assert.equal(r.paragraphs[0].text, body);
  });

  test('a marker with no kind has kind null and the hint no-kind', () => {
    const r = parseMarkdown('<!-- A-1 -->\n\nBody.\n', F);
    assert.equal(r.paragraphs[0].kind, null);
    assert.deepEqual(codes(r.lints), ['no-kind']);
    assertLint(r.lints, { code: 'no-kind', severity: 'hint', id: 'A-1', line: 1 });
  });

  test('a marker with links and no kind still gives the hint no-kind', () => {
    const r = parseMarkdown('<!-- A-1 serves:R1 -->\n\nBody.\n', F);
    assert.equal(r.paragraphs[0].kind, null);
    assert.deepEqual(r.paragraphs[0].links, links({ serves: ['R1'] }));
    assertLint(r.lints, { code: 'no-kind', severity: 'hint', id: 'A-1', line: 1 });
  });

  test('a bare word that is not a kind is unknown-kind', () => {
    const r = parseMarkdown(doc('<!-- A-1 note -->', '', 'Head.', '', '<!-- A-2 bogus -->', '', 'Body.'), F);
    assertLint(r.lints, { code: 'unknown-kind', severity: 'not ok', id: 'A-2', line: 5 });
    assert.equal(byCode(r.lints, 'unknown-kind').length, 1);
  });

  test('a second bare word is unknown-kind, even when it is a kind', () => {
    const r = parseMarkdown('<!-- A-1 note rule -->\n\nBody.\n', F);
    assertLint(r.lints, { code: 'unknown-kind', severity: 'not ok', id: 'A-1', line: 1 });
  });

  test('control: every kind of the five groups is accepted', () => {
    const all = ['purpose', 'scope', 'rule', 'limit', 'definition', 'rationale', 'example', 'open', 'note',
      'component', 'interface', 'data', 'flow', 'choice', 'approach', 'plan', 'step', 'migration'];
    const text = all.map((k, i) => `<!-- A-${i + 1} ${k} serves:R1 -->\n\nText ${i + 1}.\n`).join('\n');
    const r = parseMarkdown(text, F);
    assert.deepEqual(r.lints, []);
    assert.deepEqual(r.paragraphs.map((p) => p.kind), all);
  });

  test('a link word that is not one of the twelve is unknown-link', () => {
    const r = parseMarkdown(doc('<!-- A-1 note foo:A-2 -->', '', 'Body.', '', '<!-- A-2 note serve:R1 -->', '', 'Two.',
      '', '<!-- A-3 note buildsOn:A-1 -->', '', 'Three.'), F);
    assertLint(r.lints, { code: 'unknown-link', severity: 'not ok', id: 'A-1', line: 1 });
    assertLint(r.lints, { code: 'unknown-link', severity: 'not ok', id: 'A-2', line: 5 });
    // The links key is not a link word: the marker spells it builds-on.
    assertLint(r.lints, { code: 'unknown-link', severity: 'not ok', id: 'A-3', line: 9 });
    assert.equal(byCode(r.lints, 'unknown-link').length, 3);
  });
});

describe('the lints of parseMarkdown', () => {
  test('no-id: non-blank text before the first marker', () => {
    const r = parseMarkdown(doc('Stray text.', '', '<!-- A-1 note -->', '', 'Body.'), F);
    assert.deepEqual(codes(r.lints), ['no-id']);
    assertLint(r.lints, { code: 'no-id', severity: 'not ok', id: null, line: 1 });
    assert.deepEqual(ids(r), ['A-1']);
  });

  test('control: blank lines before the first marker give no lint', () => {
    const r = parseMarkdown(doc('', '', '<!-- A-1 note -->', '', 'Body.'), F);
    assert.deepEqual(r.lints, []);
    assert.equal(r.paragraphs[0].line, 3);
  });

  test('no-id: a new prose paragraph after a blank line inside a marked block', () => {
    const r = parseMarkdown(doc('<!-- A-1 note -->', '', 'First.', '', 'Second.'), F);
    assert.deepEqual(codes(r.lints), ['no-id']);
    assertLint(r.lints, { code: 'no-id', severity: 'not ok', id: null, line: 5 });
  });

  test('no-id: a heading line inside a marked block, after a blank line or right after the text', () => {
    const a = parseMarkdown(doc('<!-- A-1 note -->', '', 'First.', '', '## Heading'), F);
    assert.deepEqual(codes(a.lints), ['no-id']);
    assertLint(a.lints, { code: 'no-id', severity: 'not ok', id: null, line: 5 });
    const b = parseMarkdown(doc('<!-- A-1 note -->', '', 'First.', '## Heading'), F);
    assert.deepEqual(codes(b.lints), ['no-id']);
    assertLint(b.lints, { code: 'no-id', severity: 'not ok', id: null, line: 4 });
  });

  test('no-blank-before: the line before a marker is not blank', () => {
    const r = parseMarkdown(doc('<!-- A-1 note -->', '', 'First.', '<!-- A-2 note -->', '', 'Second.'), F);
    assert.deepEqual(codes(r.lints), ['no-blank-before']);
    assertLint(r.lints, { code: 'no-blank-before', severity: 'not ok', id: 'A-2', line: 4 });
    assert.deepEqual(ids(r), ['A-1', 'A-2']);
    assert.equal(r.paragraphs[0].text, 'First.');
  });

  test('control: a marker on line 1 and a marker after a blank line give no no-blank-before', () => {
    const r = parseMarkdown(doc('<!-- A-1 note -->', '', 'First.', '', '<!-- A-2 note -->', '', 'Second.'), F);
    assert.deepEqual(r.lints, []);
  });

  test('no-blank-after: the line after a marker is not blank', () => {
    const r = parseMarkdown(doc('<!-- A-1 note -->', 'First.'), F);
    assert.deepEqual(codes(r.lints), ['no-blank-after']);
    assertLint(r.lints, { code: 'no-blank-after', severity: 'not ok', id: 'A-1', line: 1 });
  });

  test('no-blank-after: the file ends after the marker', () => {
    for (const text of ['<!-- A-1 note -->', '<!-- A-1 note -->\n']) {
      const r = parseMarkdown(text, F);
      assertLint(r.lints, { code: 'no-blank-after', severity: 'not ok', id: 'A-1', line: 1 });
    }
    const r = parseMarkdown(doc('<!-- A-1 note -->', '', 'Body.', '', '<!-- A-2 note -->'), F);
    assertLint(r.lints, { code: 'no-blank-after', severity: 'not ok', id: 'A-2', line: 5 });
    assert.equal(byCode(r.lints, 'no-blank-after').length, 1);
  });

  test('duplicate-id: the second marker with the same ID in one doc', () => {
    const r = parseMarkdown(doc('<!-- A-1 note -->', '', 'First.', '', '<!-- A-1 note -->', '', 'Second.'), F);
    assert.deepEqual(codes(r.lints), ['duplicate-id']);
    assertLint(r.lints, { code: 'duplicate-id', severity: 'not ok', id: 'A-1', line: 5 });
  });

  test('duplicate-id: a third use gives a second lint, each on its own marker', () => {
    const r = parseMarkdown(doc('<!-- A-1 note -->', '', 'One.', '', '<!-- A-1 note -->', '', 'Two.', '', '<!-- A-1 note -->', '', 'Three.'), F);
    assert.deepEqual(byCode(r.lints, 'duplicate-id').map((l) => l.line), [5, 9]);
  });

  test('no-link: a promise or design paragraph with no link at all is a hint', () => {
    const kinds = ['purpose', 'scope', 'rule', 'limit', 'definition', 'component', 'interface', 'data', 'flow', 'choice', 'approach'];
    for (const kind of kinds) {
      const r = parseMarkdown(`<!-- A-1 ${kind} -->\n\nBody.\n`, F);
      assert.deepEqual(codes(r.lints), ['no-link'], kind);
      assertLint(r.lints, { code: 'no-link', severity: 'hint', id: 'A-1', line: 1 });
    }
  });

  test('control: a promise or design paragraph with any link, and other kinds with none, give no no-link', () => {
    for (const marker of ['rule serves:R1', 'approach for:T1', 'definition source:owner', 'component governed-by:ADR-1']) {
      assert.deepEqual(parseMarkdown(`<!-- A-1 ${marker} -->\n\nBody.\n`, F).lints, [], marker);
    }
    for (const kind of ['note', 'rationale', 'example', 'open', 'plan', 'step', 'migration']) {
      assert.deepEqual(parseMarkdown(`<!-- A-1 ${kind} -->\n\nBody.\n`, F).lints, [], kind);
    }
  });

  // design.md section 3 (PR #176, merged) holds over interface.md: two
  // headings with the same heading path are a hint, not "not ok".
  test('duplicate-heading: a heading whose headingPath equals an earlier heading\'s is a hint', () => {
    const r = parseMarkdown(doc('<!-- A-1 note -->', '', '# T', '', '<!-- A-2 note -->', '', '## Same', '',
      '<!-- A-3 note -->', '', '## Same ##'), F);
    assert.deepEqual(codes(r.lints), ['duplicate-heading']);
    assertLint(r.lints, { code: 'duplicate-heading', severity: 'hint', id: 'A-3', line: 9 });
  });

  test('control: the same heading text under different parents is not duplicate-heading', () => {
    // TITLED has "### Links" under "Export" and under "Import".
    assert.deepEqual(byCode(parseMarkdown(TITLED, F).lints, 'duplicate-heading'), []);
  });

  test('every lint names the file passed in, and the id is null only when no ID applies', () => {
    const r = parseMarkdown(doc('Stray.', '', '<!-- A-1 -->', 'Body.'), 'docs/other.md');
    assert.ok(r.lints.length >= 2);
    for (const l of r.lints) assert.equal(l.file, 'docs/other.md');
    assert.equal(r.lints.find((l) => l.code === 'no-id').id, null);
    assert.equal(r.lints.find((l) => l.code === 'no-kind').id, 'A-1');
  });
});

describe('kinds', () => {
  // design.md section 3 (PR #176, merged) holds over decision 1: note is a
  // group of its own, and approach stays in design.
  test('KINDS holds the five groups of the merged design', () => {
    const sorted = Object.fromEntries(Object.entries(KINDS).map(([g, ks]) => [g, [...ks].sort()]));
    assert.deepEqual(sorted, {
      promise: ['definition', 'limit', 'purpose', 'rule', 'scope'],
      informative: ['example', 'open', 'rationale'],
      note: ['note'],
      design: ['approach', 'choice', 'component', 'data', 'flow', 'interface'],
      'change-only': ['migration', 'plan', 'step'],
    });
  });

  test('groupOf names the group of a kind, or null', () => {
    assert.equal(groupOf('rule'), 'promise');
    assert.equal(groupOf('definition'), 'promise');
    assert.equal(groupOf('note'), 'note');
    assert.equal(groupOf('rationale'), 'informative');
    assert.equal(groupOf('approach'), 'design');
    assert.equal(groupOf('migration'), 'change-only');
    assert.equal(groupOf('bogus'), null);
    assert.equal(groupOf('widget', { custom: ['widget'] }), 'custom');
    assert.equal(groupOf('rule', { custom: ['widget'] }), null);
  });

  test('options.kinds replaces the default kinds', () => {
    const custom = { kinds: { custom: ['widget'], promise: ['rule'] } };
    const a = parseMarkdown('<!-- A-1 widget -->\n\nW.\n', F, custom);
    assert.equal(a.paragraphs[0].kind, 'widget');
    assert.deepEqual(a.lints, []);
    const b = parseMarkdown('<!-- A-1 note -->\n\nN.\n', F, custom);
    assertLint(b.lints, { code: 'unknown-kind', severity: 'not ok', id: 'A-1', line: 1 });
    const c = parseMarkdown('<!-- A-1 rule -->\n\nR.\n', F, custom);
    assert.deepEqual(codes(c.lints), ['no-link']);
    // Control: with the default kinds, widget is unknown.
    assertLint(parseMarkdown('<!-- A-1 widget -->\n\nW.\n', F).lints, { code: 'unknown-kind', severity: 'not ok', id: 'A-1', line: 1 });
  });
});
