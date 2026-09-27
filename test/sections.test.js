// [SPC-2] what a section and an ID are; [SPC-4] when two sections are the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSections, sameSection } from '../src/sections.js';

const shape = (s) => ({ id: s.id, level: s.level, title: s.title, text: s.text, line: s.line });

test('[SPC-2] a sub-heading starts its own section: the parent\'s text stops before it; line, level, title and text are exact', () => {
  const doc =
    '# Invoices\n' +            // 1
    '\n' +
    'Intro.\n' +
    '\n' +
    '## [INV-3] Dates\n' +      // 5
    '\n' +
    'Dates are ISO.\n' +
    '\n' +
    '### [INV-3.1] Time zones\n' + // 9
    '\n' +
    'UTC only.\n' +
    '## [INV-4] Format\n' +     // 12
    'PDF.\n';
  assert.deepEqual(parseSections(doc).map(shape), [
    { id: null, level: 1, title: 'Invoices', text: '# Invoices\n\nIntro.\n\n', line: 1 },
    { id: 'INV-3', level: 2, title: 'Dates', text: '## [INV-3] Dates\n\nDates are ISO.\n\n', line: 5 },
    { id: 'INV-3.1', level: 3, title: 'Time zones', text: '### [INV-3.1] Time zones\n\nUTC only.\n', line: 9 },
    { id: 'INV-4', level: 2, title: 'Format', text: '## [INV-4] Format\nPDF.\n', line: 12 },
  ]);
});

test('[SPC-2] the ID is the bracketed [A-Z][A-Z0-9]*-n(.n)* token at the start of the heading, and nothing else', () => {
  const cases = [
    ['## [INV-3] Dates', 'INV-3', 'Dates'],
    ['## [INV-3.1] Sub', 'INV-3.1', 'Sub'],
    ['## [INV-3.1.2] Deeper', 'INV-3.1.2', 'Deeper'],
    ['## [A1B2-10] Mixed prefix', 'A1B2-10', 'Mixed prefix'],
    ['## UTF-8 notes', null, 'UTF-8 notes'],
    ['## COVID-19', null, 'COVID-19'],
    ['## [inv-3] x', null, '[inv-3] x'],
    ['## Dates [INV-3]', null, 'Dates [INV-3]'],
    ['## [INV3] no dash', null, '[INV3] no dash'],
    ['## [INV-] no number', null, '[INV-] no number'],
    ['## [INV-3a] letter after', null, '[INV-3a] letter after'],
    ['## [INV-3.] trailing dot', null, '[INV-3.] trailing dot'],
    ['## [3INV-1] digit first', null, '[3INV-1] digit first'],
  ];
  for (const [heading, id, title] of cases) {
    const got = parseSections(`${heading}\nBody.\n`);
    assert.equal(got.length, 1, heading);
    assert.equal(got[0].id, id, heading);
    assert.equal(got[0].title, title, heading);
  }
});

test('[SPC-2] INV-3 and INV-3.1 are two different IDs', () => {
  const got = parseSections('## [INV-3] Parent\na\n## [INV-3.1] Child\nb\n');
  assert.deepEqual(got.map((s) => s.id), ['INV-3', 'INV-3.1']);
});

test('[SPC-2] ATX heading forms: 0-3 spaces of indent, 1-6 #, then a space, a tab or end of line', () => {
  const heading = [
    ['## Two', 2, 'Two'],
    ['   ## Three spaces', 2, 'Three spaces'],
    ['###### Six', 6, 'Six'],
    ['#\tTab', 1, 'Tab'],
    ['#', 1, ''],
  ];
  for (const [line, level, title] of heading) {
    const got = parseSections(`# [DOC-1] Top\nBody.\n${line}\nAfter.\n`);
    assert.equal(got.length, 2, `${JSON.stringify(line)} should be a heading`);
    assert.equal(got[1].level, level, line);
    assert.equal(got[1].title, title, line);
    assert.equal(got[1].line, 3, line);
  }
  const notHeading = ['#hashtag', '####### seven', '    ## four spaces'];
  for (const line of notHeading) {
    const doc = `# [DOC-1] Top\nBody.\n\n${line}\nAfter.\n`;
    const got = parseSections(doc);
    assert.equal(got.length, 1, `${JSON.stringify(line)} should not be a heading`);
    assert.equal(got[0].text, doc, line);
  }
});

test('[SPC-2] # lines inside fenced (``` and ~~~) and indented code are not headings', () => {
  const first =
    '# [DOC-1] Title\n' +
    'Before.\n' +
    '\n' +
    '```md\n' +
    '## [X-1] Inside backticks\n' +
    '~~~\n' +
    '# still inside: ~~~ does not close a ``` fence\n' +
    '```\n' +
    '\n' +
    '~~~\n' +
    '# Inside tildes\n' +
    '~~~\n' +
    '\n' +
    '    ## Indented code\n' +
    '\n';
  const second = '## [DOC-2] After\nText.\n';
  const got = parseSections(first + second);
  assert.deepEqual(got.map(shape), [
    { id: 'DOC-1', level: 1, title: 'Title', text: first, line: 1 },
    { id: 'DOC-2', level: 2, title: 'After', text: second, line: 16 },
  ]);
});

test('[SPC-2] repeated headings are separate sections: two "## Notes" with no ID, two IDs with one title', () => {
  const got = parseSections('## Notes\nOne.\n## Notes\nTwo.\n## [A-1] Same\nx\n## [A-2] Same\ny\n');
  assert.deepEqual(got.map(shape), [
    { id: null, level: 2, title: 'Notes', text: '## Notes\nOne.\n', line: 1 },
    { id: null, level: 2, title: 'Notes', text: '## Notes\nTwo.\n', line: 3 },
    { id: 'A-1', level: 2, title: 'Same', text: '## [A-1] Same\nx\n', line: 5 },
    { id: 'A-2', level: 2, title: 'Same', text: '## [A-2] Same\ny\n', line: 7 },
  ]);
});

test('[SPC-2] text before the first heading belongs to no section; a file with no heading has none', () => {
  const got = parseSections('Preamble.\n\n# [DOC-1] T\nBody.\n');
  assert.deepEqual(got.map(shape), [
    { id: 'DOC-1', level: 1, title: 'T', text: '# [DOC-1] T\nBody.\n', line: 3 },
  ]);
  assert.deepEqual(parseSections('Just prose.\nNo heading at all.\n'), []);
});

// A section with a paragraph of two lines, a fenced example and a list.
const BASE =
  '## [INV-3] Dates\n' +
  'Dates are ISO 8601.\n' +
  'Times are UTC.\n' +
  '\n' +
  '```js\n' +
  'if (x) {\n' +
  '  y();\n' +
  '}\n' +
  '```\n' +
  '\n' +
  '- one\n' +
  '- two\n';

test('[SPC-4] sections that differ only in what is normalized are the same', () => {
  const equal = {
    'identical': BASE,
    'CRLF line endings': BASE.replace(/\n/g, '\r\n'),
    'trailing spaces and tabs': BASE.replace('Dates are ISO 8601.\n', 'Dates are ISO 8601.  \n')
      .replace('  y();\n', '  y(); \t\n').replace('- two\n', '- two\t\n'),
    'blank lines at start and end': '\n\n' + BASE + '\n\n  \n',
    'blank lines between heading and body': BASE.replace('## [INV-3] Dates\n', '## [INV-3] Dates\n\n\n'),
    'number of # in the heading': BASE.replace('## [INV-3] Dates', '#### [INV-3] Dates'),
  };
  for (const [what, other] of Object.entries(equal)) {
    assert.equal(sameSection(BASE, other), true, what);
  }
});

test('[SPC-4] code indentation, list structure, words and inner blank lines are compared exactly', () => {
  const different = {
    'indentation inside a fenced example (same tokens)': BASE.replace('  y();\n', '    y();\n'),
    'tab for spaces inside a fenced example': BASE.replace('  y();\n', '\ty();\n'),
    'list marker': BASE.replace('- one\n- two\n', '* one\n* two\n'),
    'list nesting': BASE.replace('- two\n', '  - two\n'),
    'a changed word': BASE.replace('ISO 8601', 'RFC 3339'),
    'a blank line added inside the body': BASE.replace('ISO 8601.\nTimes', 'ISO 8601.\n\nTimes'),
    'a changed heading title': BASE.replace('Dates\n', 'Days\n'),
  };
  for (const [what, other] of Object.entries(different)) {
    assert.notEqual(other, BASE, `fixture for ${what} must differ`);
    assert.equal(sameSection(BASE, other), false, what);
  }
});
