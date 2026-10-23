// #40: the number of an ADR file (adr-numbers/R1; DES-78, DES-113, SCH-7).
//
// - A Markdown file in specs/adr/ is an ADR when its name starts with one or
//   more digits and a dash. Its number is the value of those digits:
//   001-x.md is ADR-1, 0040-y.md is ADR-40, 12345-z.md is ADR-12345. A name
//   with no digits before the dash is not an ADR.
// - Two ADR files with the same number: al reads each file and runs the
//   checks of one ADR file on each (adr-status, adr-marker, ...). Where al
//   looks an ADR up by its number (a link, a citation, a status line, a
//   supersedes:), it uses the first of those files in name order. The hint
//   adr-number names each file of the number and the file that al uses.
// - When specs/adr/ holds Markdown files and al reads none of them as an
//   ADR, al check gives the hint adr-none once, and only then.
// - No exit code changes and no new not ok: the two new findings are hints.
//
// "Read as an ADR" is shown by checks that already exist: hint adr-status on
// a first line that is not a known status, hint adr-marker on an unknown
// token, not ok superseded-cited on a citation, and the "Governed" line of
// `al context <ID>`, which names each ADR that decides a paragraph and its
// status. The full messages of the new hints are not pinned. Nothing here
// reads the code under test.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { check } from './helpers/invoicer.js';
import { al, commitAll, doc, git, project, show, write, writeConfig } from './helpers/project.js';

const SPEC = 'specs/invoices.md';
const DIR = 'specs/adr';

const notOk = (r) => r.findings.filter((f) => f.severity === 'not ok');
const at = (r, code, file) => r.findings.filter((f) => f.code === code && f.file === file);
const linesOf = (r, code) => r.stdout.split('\n').filter((l) => new RegExp(`^(not ok|hint|info) ${code} `).test(l));
const nameOf = (file) => file.split('/').pop();

// An ADR file: its first line, then a heading paragraph with the marker
// `ADR-<n> choice <links>` and one rationale paragraph.
const adr = (n, status, title, { links = `decides:INV-2 source:INV-2`, extra = '', text = `Context: ${title}.` } = {}) =>
  `Status: ${status}\n\n${doc([[`ADR-${n} choice ${links}${extra}`, `# ADR-${n}: ${title}`], [`ADR-${n}-1 rationale`, text]])}`;

// main: config and the spec (INV-2 is what the ADRs decide), committed; then
// the branch feature. A test writes its ADR files on the branch. `inv2` sets
// INV-2's text.
function world(t, files = {}, { inv2 = 'An invoice MUST be sent to the customer.' } = {}) {
  const dir = project(t);
  writeConfig(dir);
  write(dir, SPEC, doc([
    ['INV-1 note', '# Invoices'],
    ['INV-2 rule', inv2],
  ]));
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  for (const [file, text] of Object.entries(files)) write(dir, file, text);
  return dir;
}

// Plain exit 0; --strict exit 0; no not ok.
function hintsOnly(dir) {
  const plain = check(dir);
  const strict = check(dir, '--strict');
  assert.equal(plain.code, 0, show(plain));
  assert.deepEqual(notOk(plain).map((f) => f.line), [], `no not ok:\n${show(plain)}`);
  assert.equal(strict.code, 0, `--strict exits 0 when only hints print:\n${show(strict)}`);
  return plain;
}

// The "Governed" line of `al context INV-2`.
function governed(dir) {
  const r = al(dir, ['context', 'INV-2']);
  assert.equal(r.code, 0, show(r));
  const line = r.stdout.split('\n').find((l) => l.startsWith('Governed'));
  assert.ok(line, `a Governed line:\n${show(r)}`);
  return { line, r };
}

// One hint adr-status at this file, with this ADR ID.
function statusHint(r, file, id) {
  const found = at(r, 'adr-status', file);
  assert.equal(found.length, 1, `one adr-status at ${file}:\n${show(r)}`);
  assert.equal(found[0].severity, 'hint', show(r));
  assert.equal(found[0].id, id, `the adr-status at ${file} is on ${id}:\n${show(r)}`);
}

// =====================================================================

describe('#40: a name that starts with one or more digits and a dash is an ADR; the digits are its number', () => {
  const NAMES = [
    ['specs/adr/001-x.md', 1],
    ['specs/adr/0040-y.md', 40],
    ['specs/adr/12345-z.md', 12345],
    ['specs/adr/7-q.md', 7],
  ];

  for (const [file, n] of NAMES) {
    test(`${nameOf(file)} is ADR-${n}: a bad first line gives hint adr-status on ADR-${n} at ${file}`, (t) => {
      const dir = world(t, { [file]: adr(n, 'bogus', `Number ${n}`) });
      const r = hintsOnly(dir);
      statusHint(r, file, `ADR-${n}`);
    });

    test(`${nameOf(file)} is ADR-${n}: \`al context INV-2\` names ADR-${n} (accepted) as governing INV-2`, (t) => {
      const dir = world(t, { [file]: adr(n, 'accepted', `Number ${n}`) });
      const { line, r } = governed(dir);
      assert.match(line, new RegExp(`\\bADR-${n} \\(accepted\\)`), show(r));
    });
  }

  test('001-x.md is ADR-1: INV-2 that cites ADR-1, superseded by ADR-2 (002-y.md), gives not ok superseded-cited on INV-2', (t) => {
    const dir = world(t, {
      'specs/adr/001-x.md': adr(1, 'superseded by ADR-2', 'Paper'),
      'specs/adr/002-y.md': adr(2, 'accepted', 'Fax', { links: 'decides:INV-2 source:INV-2 supersedes:ADR-1' }),
    }, { inv2: 'An invoice MUST be sent to the customer, as ADR-1 says.' });
    const r = check(dir);
    const found = r.findings.filter((f) => f.code === 'superseded-cited' && f.id === 'INV-2');
    assert.ok(found.length >= 1, `not ok superseded-cited on INV-2:\n${show(r)}`);
    assert.equal(found[0].severity, 'not ok', show(r));
  });

  test('control: the same world with a successor that also cites ADR-2: no superseded-cited on INV-2', (t) => {
    const dir = world(t, {
      'specs/adr/001-x.md': adr(1, 'superseded by ADR-2', 'Paper'),
      'specs/adr/002-y.md': adr(2, 'accepted', 'Fax', { links: 'decides:INV-2 source:INV-2 supersedes:ADR-1' }),
    }, { inv2: 'An invoice MUST be sent to the customer, as ADR-1 and ADR-2 say.' });
    const r = check(dir);
    assert.deepEqual(r.findings.filter((f) => f.code === 'superseded-cited').map((f) => f.line), [], show(r));
  });
});

describe('#40: a name with no digits before the dash is not an ADR', () => {
  const NOT_ADR = ['specs/adr/adr-1.md', 'specs/adr/x-001.md', 'specs/adr/001.md', 'specs/adr/a1-x.md'];

  for (const file of NOT_ADR) {
    test(`control: ${nameOf(file)} next to a valid 0003-a.md is not read: no finding at it, and ADR-9 does not govern INV-2`, (t) => {
      const dir = world(t, {
        'specs/adr/0003-a.md': adr(3, 'accepted', 'Valid'),
        [file]: adr(9, 'bogus', 'Not an ADR', { extra: ' frobnicate' }),
      });
      const r = hintsOnly(dir);
      assert.deepEqual(r.findings.filter((f) => f.file === file).map((f) => f.line), [], show(r));
      assert.deepEqual(r.findings.filter((f) => f.id === 'ADR-9').map((f) => f.line), [], show(r));
      const { line } = governed(dir);
      assert.doesNotMatch(line, /\bADR-9\b/, line);
      assert.match(line, /\bADR-3 \(accepted\)/, line);
    });
  }
});

// =====================================================================

describe('#40: two ADR files with the same number', () => {
  test('001-a.md and 1-b.md are both ADR-1: one hint adr-number that names both files', (t) => {
    const dir = world(t, {
      'specs/adr/001-a.md': adr(1, 'accepted', 'Alpha'),
      'specs/adr/1-b.md': adr(1, 'accepted', 'Beta'),
    });
    const r = hintsOnly(dir);
    const found = linesOf(r, 'adr-number');
    assert.equal(found.length, 1, `one adr-number line:\n${show(r)}`);
    assert.match(found[0], /^hint adr-number /, show(r));
    assert.ok(found[0].includes('001-a.md'), `it names 001-a.md:\n${show(r)}`);
    assert.ok(found[0].includes('1-b.md'), `it names 1-b.md:\n${show(r)}`);
  });

  test('0040-a.md and 0040-b.md are both ADR-40: one hint adr-number that names both files', (t) => {
    const dir = world(t, {
      'specs/adr/0040-a.md': adr(40, 'accepted', 'Alpha'),
      'specs/adr/0040-b.md': adr(40, 'accepted', 'Beta'),
    });
    const r = hintsOnly(dir);
    const found = linesOf(r, 'adr-number');
    assert.equal(found.length, 1, `one adr-number line:\n${show(r)}`);
    assert.match(found[0], /^hint adr-number /, show(r));
    assert.ok(found[0].includes('0040-a.md') && found[0].includes('0040-b.md'), `it names both files:\n${show(r)}`);
  });

  test('three files of ADR-1 (001-c.md, 01-b.md, 1-a.md): one hint adr-number that names all three', (t) => {
    const dir = world(t, {
      'specs/adr/001-c.md': adr(1, 'accepted', 'Gamma'),
      'specs/adr/01-b.md': adr(1, 'accepted', 'Beta'),
      'specs/adr/1-a.md': adr(1, 'accepted', 'Alpha'),
    });
    const r = hintsOnly(dir);
    const found = linesOf(r, 'adr-number');
    assert.equal(found.length, 1, `one adr-number line:\n${show(r)}`);
    for (const name of ['001-c.md', '01-b.md', '1-a.md']) assert.ok(found[0].includes(name), `it names ${name}:\n${show(r)}`);
  });

  test('two numbers each in two files (001-a.md, 1-b.md; 0040-a.md, 0040-b.md): one adr-number line for each number', (t) => {
    const dir = world(t, {
      'specs/adr/001-a.md': adr(1, 'accepted', 'Alpha'),
      'specs/adr/1-b.md': adr(1, 'accepted', 'Beta'),
      'specs/adr/0040-a.md': adr(40, 'accepted', 'Forty A'),
      'specs/adr/0040-b.md': adr(40, 'accepted', 'Forty B'),
      'specs/adr/0002-c.md': adr(2, 'accepted', 'Alone'),
    });
    const r = hintsOnly(dir);
    const found = linesOf(r, 'adr-number');
    assert.equal(found.length, 2, `two adr-number lines:\n${show(r)}`);
    const one = found.filter((l) => l.includes('001-a.md') && l.includes('1-b.md'));
    const forty = found.filter((l) => l.includes('0040-a.md') && l.includes('0040-b.md'));
    assert.equal(one.length, 1, `one line names 001-a.md and 1-b.md:\n${show(r)}`);
    assert.equal(forty.length, 1, `one line names 0040-a.md and 0040-b.md:\n${show(r)}`);
    assert.ok(!one[0].includes('0040-'), `the ADR-1 line names no ADR-40 file:\n${show(r)}`);
    assert.ok(!found.some((l) => l.includes('0002-c.md')), `no adr-number line names 0002-c.md:\n${show(r)}`);
  });

  test('control: one file for each number (001-a.md, 0002-b.md, 40-c.md): no adr-number line', (t) => {
    const dir = world(t, {
      'specs/adr/001-a.md': adr(1, 'accepted', 'Alpha'),
      'specs/adr/0002-b.md': adr(2, 'accepted', 'Beta'),
      'specs/adr/40-c.md': adr(40, 'accepted', 'Forty'),
    });
    const r = hintsOnly(dir);
    assert.deepEqual(linesOf(r, 'adr-number'), [], show(r));
  });

  test('each file of ADR-1 is read: a bad first line in 001-a.md and in 1-b.md gives hint adr-status at each file', (t) => {
    const dir = world(t, {
      'specs/adr/001-a.md': adr(1, 'bogus', 'Alpha'),
      'specs/adr/1-b.md': adr(1, 'wrong', 'Beta'),
    });
    const r = hintsOnly(dir);
    statusHint(r, 'specs/adr/001-a.md', 'ADR-1');
    statusHint(r, 'specs/adr/1-b.md', 'ADR-1');
  });

  test('each file of ADR-40 is read: a bad first line in 0040-a.md and in 0040-b.md gives hint adr-status at each file', (t) => {
    const dir = world(t, {
      'specs/adr/0040-a.md': adr(40, 'bogus', 'Alpha'),
      'specs/adr/0040-b.md': adr(40, 'wrong', 'Beta'),
    });
    const r = hintsOnly(dir);
    statusHint(r, 'specs/adr/0040-a.md', 'ADR-40');
    statusHint(r, 'specs/adr/0040-b.md', 'ADR-40');
  });

  test('the second file in name order is read: an unknown marker token in 1-b.md gives hint adr-marker at 1-b.md only', (t) => {
    const dir = world(t, {
      'specs/adr/001-a.md': adr(1, 'accepted', 'Alpha'),
      'specs/adr/1-b.md': adr(1, 'accepted', 'Beta', { extra: ' frobnicate' }),
    });
    const r = hintsOnly(dir);
    const found = at(r, 'adr-marker', 'specs/adr/1-b.md');
    assert.ok(found.length >= 1, `hint adr-marker at specs/adr/1-b.md:\n${show(r)}`);
    assert.ok(found.every((f) => f.severity === 'hint'), show(r));
    assert.deepEqual(at(r, 'adr-marker', 'specs/adr/001-a.md').map((f) => f.line), [], show(r));
  });

  // The lookup by number uses the first file in name order. Each pair of
  // tests swaps the two statuses, so that "the last file" or "any file"
  // fails one of them.
  for (const [first, second] of [['accepted', 'proposed'], ['proposed', 'accepted']]) {
    test(`001-a.md ${first}, 1-b.md ${second}: \`al context INV-2\` shows ADR-1 (${first}), from 001-a.md`, (t) => {
      const dir = world(t, {
        'specs/adr/001-a.md': adr(1, first, 'Alpha'),
        'specs/adr/1-b.md': adr(1, second, 'Beta'),
      });
      const { line, r } = governed(dir);
      assert.match(line, new RegExp(`\\bADR-1 \\(${first}\\)`), show(r));
      assert.doesNotMatch(line, new RegExp(`\\bADR-1 \\(${second}\\)`), show(r));
    });

    test(`0040-a.md ${first}, 0040-b.md ${second}: \`al context INV-2\` shows ADR-40 (${first}), from 0040-a.md`, (t) => {
      const dir = world(t, {
        'specs/adr/0040-a.md': adr(40, first, 'Alpha'),
        'specs/adr/0040-b.md': adr(40, second, 'Beta'),
      });
      const { line, r } = governed(dir);
      assert.match(line, new RegExp(`\\bADR-40 \\(${first}\\)`), show(r));
      assert.doesNotMatch(line, new RegExp(`\\bADR-40 \\(${second}\\)`), show(r));
    });
  }

  // A citation of ADR-1 in INV-2 looks ADR-1 up by its number. ADR-2
  // (002-c.md) supersedes ADR-1.
  const SUCCESSOR = adr(2, 'accepted', 'Fax', { links: 'decides:INV-2 source:INV-2 supersedes:ADR-1' });
  const CITES = { inv2: 'An invoice MUST be sent to the customer, as ADR-1 says.' };

  test('001-a.md superseded by ADR-2, 1-b.md accepted: a citation of ADR-1 uses 001-a.md, so not ok superseded-cited on INV-2', (t) => {
    const dir = world(t, {
      'specs/adr/001-a.md': adr(1, 'superseded by ADR-2', 'Paper'),
      'specs/adr/1-b.md': adr(1, 'accepted', 'Post'),
      'specs/adr/002-c.md': SUCCESSOR,
    }, CITES);
    const r = check(dir);
    const found = r.findings.filter((f) => f.code === 'superseded-cited' && f.id === 'INV-2');
    assert.ok(found.length >= 1, `not ok superseded-cited on INV-2:\n${show(r)}`);
    assert.equal(found[0].severity, 'not ok', show(r));
  });

  test('001-a.md accepted, 1-b.md superseded by ADR-2: a citation of ADR-1 uses 001-a.md, so no superseded-cited on INV-2', (t) => {
    const dir = world(t, {
      'specs/adr/001-a.md': adr(1, 'accepted', 'Paper'),
      'specs/adr/1-b.md': adr(1, 'superseded by ADR-2', 'Post'),
      'specs/adr/002-c.md': SUCCESSOR,
    }, CITES);
    const r = check(dir);
    // This world must read the ADR files, else the test proves nothing.
    assert.equal(linesOf(r, 'adr-number').length, 1, `one adr-number line:\n${show(r)}`);
    assert.deepEqual(r.findings.filter((f) => f.code === 'superseded-cited' && f.id === 'INV-2').map((f) => f.line), [], show(r));
  });
});

// =====================================================================

describe('#40: adr-none, when specs/adr/ holds Markdown files and none is an ADR', () => {
  test('README.md and template.md only: exactly one hint adr-none line', (t) => {
    const dir = world(t, {
      'specs/adr/README.md': 'How we write ADRs.\n',
      'specs/adr/template.md': adr(0, 'proposed', 'Title'),
    });
    const r = hintsOnly(dir);
    const found = linesOf(r, 'adr-none');
    assert.equal(found.length, 1, `one adr-none line:\n${show(r)}`);
    assert.match(found[0], /^hint adr-none /, show(r));
  });

  test('four Markdown files with no ADR name (README.md, template.md, adr-1.md, x-001.md): still one adr-none line', (t) => {
    const dir = world(t, {
      'specs/adr/README.md': 'How we write ADRs.\n',
      'specs/adr/template.md': adr(0, 'proposed', 'Title'),
      'specs/adr/adr-1.md': adr(1, 'accepted', 'One'),
      'specs/adr/x-001.md': adr(1, 'accepted', 'One again'),
    });
    const r = hintsOnly(dir);
    const found = linesOf(r, 'adr-none');
    assert.equal(found.length, 1, `one adr-none line, not one for each file:\n${show(r)}`);
    assert.match(found[0], /^hint adr-none /, show(r));
  });

  test('the adr-none hint is in the committed state too: README.md committed on main, nothing on the branch', (t) => {
    const dir = project(t);
    writeConfig(dir);
    write(dir, SPEC, doc([['INV-1 note', '# Invoices'], ['INV-2 rule', 'An invoice MUST be sent to the customer.']]));
    write(dir, 'specs/adr/README.md', 'How we write ADRs.\n');
    commitAll(dir, 'base');
    git(dir, 'checkout', '-q', '-b', 'feature');
    const r = hintsOnly(dir);
    assert.equal(linesOf(r, 'adr-none').length, 1, `one adr-none line:\n${show(r)}`);
  });

  test('control: an empty specs/adr/: no adr-none', (t) => {
    const dir = world(t);
    mkdirSync(join(dir, DIR), { recursive: true });
    const r = hintsOnly(dir);
    assert.deepEqual(linesOf(r, 'adr-none'), [], show(r));
  });

  test('control: no specs/adr/: no adr-none', (t) => {
    const r = hintsOnly(world(t));
    assert.deepEqual(linesOf(r, 'adr-none'), [], show(r));
  });

  test('control: only files that are not Markdown (notes.txt, 001-x.txt, diagram.png): no adr-none', (t) => {
    const dir = world(t, {
      'specs/adr/notes.txt': 'Notes.\n',
      'specs/adr/001-x.txt': 'Status: accepted\n',
      'specs/adr/diagram.png': 'not really a png\n',
    });
    const r = hintsOnly(dir);
    assert.deepEqual(linesOf(r, 'adr-none'), [], show(r));
  });

  test('control: README.md and a valid 001-x.md: no adr-none', (t) => {
    const dir = world(t, {
      'specs/adr/README.md': 'How we write ADRs.\n',
      'specs/adr/001-x.md': adr(1, 'accepted', 'One'),
    });
    const r = hintsOnly(dir);
    assert.deepEqual(linesOf(r, 'adr-none'), [], show(r));
  });

  test('control: README.md and a valid 0003-a.md: no adr-none', (t) => {
    const dir = world(t, {
      'specs/adr/README.md': 'How we write ADRs.\n',
      'specs/adr/0003-a.md': adr(3, 'accepted', 'Three'),
    });
    const r = hintsOnly(dir);
    assert.deepEqual(linesOf(r, 'adr-none'), [], show(r));
  });
});

// =====================================================================

describe('#40: the new findings are hints; no exit code changes', () => {
  test('with adr-number and adr-status hints only: al check exits 0 and al check --strict exits 0', (t) => {
    const dir = world(t, {
      'specs/adr/001-a.md': adr(1, 'bogus', 'Alpha'),
      'specs/adr/1-b.md': adr(1, 'accepted', 'Beta'),
    });
    const r = hintsOnly(dir);
    assert.equal(linesOf(r, 'adr-number').length, 1, `one adr-number line:\n${show(r)}`);
    assert.ok(linesOf(r, 'adr-number').every((l) => l.startsWith('hint ')), show(r));
    statusHint(r, 'specs/adr/001-a.md', 'ADR-1');
  });

  test('with the adr-none hint only: al check exits 0 and al check --strict exits 0', (t) => {
    const dir = world(t, { 'specs/adr/README.md': 'How we write ADRs.\n' });
    const r = hintsOnly(dir);
    assert.equal(linesOf(r, 'adr-none').length, 1, `one adr-none line:\n${show(r)}`);
    assert.ok(linesOf(r, 'adr-none').every((l) => l.startsWith('hint ')), show(r));
  });
});
