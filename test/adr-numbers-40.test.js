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
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { check } from './helpers/invoicer.js';
import { exportRows } from './helpers/search.js';
import {
  al, appendSection, bindingsOf, commitAll, doc, editFile, git, hashOf, index, move, newRequest, ok, organized, project, record, req, show,
  write, writeConfig,
} from './helpers/project.js';

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
      // The place of the ADR's heading text, then its status (#74).
      assert.ok(line.includes(`ADR-${n} (${file}:5, accepted)`), show(r));
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
      assert.ok(line.includes('ADR-3 (specs/adr/0003-a.md:5, accepted)'), line);
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
      assert.ok(line.includes(`ADR-1 (specs/adr/001-a.md:5, ${first})`), show(r));
      assert.doesNotMatch(line, new RegExp(`\\bADR-1 \\([^)]*\\b${second}\\)`), show(r));
    });

    test(`0040-a.md ${first}, 0040-b.md ${second}: \`al context INV-2\` shows ADR-40 (${first}), from 0040-a.md`, (t) => {
      const dir = world(t, {
        'specs/adr/0040-a.md': adr(40, first, 'Alpha'),
        'specs/adr/0040-b.md': adr(40, second, 'Beta'),
      });
      const { line, r } = governed(dir);
      assert.ok(line.includes(`ADR-40 (specs/adr/0040-a.md:5, ${first})`), show(r));
      assert.doesNotMatch(line, new RegExp(`\\bADR-40 \\([^)]*\\b${second}\\)`), show(r));
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

// =====================================================================
// The checks of one ADR file run on each file of a number (DES-113). Each
// test checks that the finding is at the file that earns it, and not at the
// other file of the same number.

// main: config, the spec and the files `base`, committed; then the branch
// feature.
function baseWorld(t, base, { inv2 = 'An invoice MUST be sent to the customer.' } = {}) {
  const dir = world(t, {}, { inv2 });
  git(dir, 'checkout', '-q', 'main');
  for (const [file, text] of Object.entries(base)) write(dir, file, text);
  commitAll(dir, 'base ADRs');
  git(dir, 'checkout', '-q', 'feature');
  git(dir, 'merge', '-q', '--ff-only', 'main');
  return dir;
}

const none = (r, code, file) => assert.deepEqual(at(r, code, file).map((f) => f.line), [], `no ${code} at ${file}:\n${show(r)}`);
function hintAt(r, code, file) {
  const found = at(r, code, file);
  assert.ok(found.length >= 1, `hint ${code} at ${file}:\n${show(r)}`);
  assert.ok(found.every((f) => f.severity === 'hint'), `${code} at ${file} is a hint:\n${show(r)}`);
  return found;
}
function notOkAt(r, code, file) {
  const found = at(r, code, file);
  assert.ok(found.length >= 1, `not ok ${code} at ${file}:\n${show(r)}`);
  assert.ok(found.every((f) => f.severity === 'not ok'), `${code} at ${file} is not ok:\n${show(r)}`);
  return found;
}

describe('#40: the checks of one ADR file on each file of a number', () => {
  const A40 = 'specs/adr/0040-a.md';
  const B40 = 'specs/adr/0040-b.md';
  const A1 = 'specs/adr/001-a.md';
  const B1 = 'specs/adr/1-b.md';
  const TWO40 = { [A40]: adr(40, 'accepted', 'Alpha'), [B40]: adr(40, 'accepted', 'Beta') };

  // adr-changed: each file is compared with the same file at the base.
  test('control: 0040-a.md and 0040-b.md accepted at the base, no change on the branch: no adr-changed', (t) => {
    const r = hintsOnly(baseWorld(t, TWO40));
    assert.deepEqual(r.findings.filter((f) => f.code === 'adr-changed').map((f) => f.line), [], show(r));
  });

  test('adr-changed on the second file: only the text of 0040-b.md changes: hint adr-changed at 0040-b.md, none at 0040-a.md', (t) => {
    const dir = baseWorld(t, TWO40);
    editFile(dir, B40, 'Context: Beta.', 'Context: Beta, and more.');
    const r = hintsOnly(dir);
    hintAt(r, 'adr-changed', B40);
    none(r, 'adr-changed', A40);
  });

  test('adr-changed on the first file: only the text of 0040-a.md changes: hint adr-changed at 0040-a.md, none at 0040-b.md', (t) => {
    const dir = baseWorld(t, TWO40);
    editFile(dir, A40, 'Context: Alpha.', 'Context: Alpha, and more.');
    const r = hintsOnly(dir);
    hintAt(r, 'adr-changed', A40);
    none(r, 'adr-changed', B40);
  });

  // 0040-a.md did not change, so no hint may point at it as if it had. The
  // hint must name the deleted 0040-b.md, at its path or in its message.
  test('adr-changed on a deleted second file: 0040-b.md deleted on the branch: a hint adr-changed that names 0040-b.md, none at 0040-a.md', (t) => {
    const dir = baseWorld(t, TWO40);
    rmSync(join(dir, B40));
    const r = hintsOnly(dir);
    const found = r.findings.filter((f) => f.code === 'adr-changed' && f.line.includes('0040-b.md'));
    assert.ok(found.length >= 1, `a hint adr-changed that names 0040-b.md:\n${show(r)}`);
    assert.ok(found.every((f) => f.severity === 'hint'), show(r));
    none(r, 'adr-changed', A40);
  });

  // adr-links: a proposed or accepted ADR with no source or no decides link.
  test('adr-links on the second file: 1-b.md accepted with no source: hint adr-links at 1-b.md, none at 001-a.md', (t) => {
    const r = hintsOnly(world(t, {
      [A1]: adr(1, 'accepted', 'Alpha'),
      [B1]: adr(1, 'accepted', 'Beta', { links: 'decides:INV-2' }),
    }));
    hintAt(r, 'adr-links', B1);
    none(r, 'adr-links', A1);
  });

  // adr-supersede: ADR-m's marker has supersedes:ADR-n, and ADR-n's status
  // line does not name ADR-m.
  test('adr-supersede on the second file: 1-b.md supersedes:ADR-5 and 005-x.md is accepted: hint adr-supersede at 1-b.md, none at 001-a.md', (t) => {
    const r = hintsOnly(world(t, {
      'specs/adr/005-x.md': adr(5, 'accepted', 'Five'),
      [A1]: adr(1, 'accepted', 'Alpha'),
      [B1]: adr(1, 'accepted', 'Beta', { links: 'decides:INV-2 source:INV-2 supersedes:ADR-5' }),
    }));
    hintAt(r, 'adr-supersede', B1);
    none(r, 'adr-supersede', A1);
  });

  test('control: the same world with 005-x.md "superseded by ADR-1": no adr-supersede at 1-b.md', (t) => {
    const r = check(world(t, {
      'specs/adr/005-x.md': adr(5, 'superseded by ADR-1', 'Five'),
      [A1]: adr(1, 'accepted', 'Alpha'),
      [B1]: adr(1, 'accepted', 'Beta', { links: 'decides:INV-2 source:INV-2 supersedes:ADR-5' }),
    }));
    none(r, 'adr-supersede', B1);
  });

  // superseded-status: an existing not ok rule, run on the second file.
  test('superseded-status on the second file: 1-b.md says "Status: superseded" with no "by": not ok superseded-status at 1-b.md, none at 001-a.md', (t) => {
    const dir = world(t, {
      [A1]: adr(1, 'accepted', 'Alpha'),
      [B1]: adr(1, 'superseded', 'Beta'),
    });
    const r = check(dir);
    assert.equal(r.code, 0, `plain al check exits 0:\n${show(r)}`);
    notOkAt(r, 'superseded-status', B1);
    none(r, 'superseded-status', A1);
    const strict = check(dir, '--strict');
    assert.equal(strict.code, 1, `--strict exits 1 on the not ok:\n${show(strict)}`);
  });

  // superseded-cited in the second file's own text.
  test('superseded-cited, exempt: 1-b.md (accepted, supersedes:ADR-5) cites ADR-5, superseded by ADR-1: no superseded-cited at 1-b.md', (t) => {
    const r = check(world(t, {
      'specs/adr/005-x.md': adr(5, 'superseded by ADR-1', 'Five'),
      [A1]: adr(1, 'accepted', 'Alpha'),
      [B1]: adr(1, 'accepted', 'Beta', { links: 'decides:INV-2 source:INV-2 supersedes:ADR-5', text: 'Context: this replaces ADR-5.' }),
    }));
    // This world must read 1-b.md, else the test proves nothing.
    assert.equal(linesOf(r, 'adr-number').length, 1, `one adr-number line:\n${show(r)}`);
    none(r, 'superseded-cited', B1);
  });

  test('superseded-cited in the second file: 1-b.md (accepted) cites ADR-7, superseded by ADR-8: not ok superseded-cited at 1-b.md, none at 001-a.md', (t) => {
    const r = check(world(t, {
      'specs/adr/007-p.md': adr(7, 'superseded by ADR-8', 'Paper'),
      'specs/adr/008-q.md': adr(8, 'accepted', 'Fax', { links: 'decides:INV-2 source:INV-2 supersedes:ADR-7' }),
      [A1]: adr(1, 'accepted', 'Alpha'),
      [B1]: adr(1, 'accepted', 'Beta', { text: 'Context: as ADR-7 said.' }),
    }));
    assert.equal(r.code, 0, `plain al check exits 0:\n${show(r)}`);
    notOkAt(r, 'superseded-cited', B1);
    none(r, 'superseded-cited', A1);
  });
});

// =====================================================================
// adr-changed when the number has one file at the base and one file now
// (DES-113): al compares those two files, also after a rename. A new file
// beside the one file of a number has nothing to compare with.

describe('#40: adr-changed after a rename, and for a new file of a number', () => {
  const A40 = 'specs/adr/0040-a.md';
  const R40 = 'specs/adr/040-a.md';
  const C40 = 'specs/adr/40-c.md';
  const ONE40 = { [A40]: adr(40, 'accepted', 'Alpha') };
  const changed = (r) => r.findings.filter((f) => f.code === 'adr-changed');

  test('0040-a.md renamed to 040-a.md, its text unchanged: no adr-changed', (t) => {
    const dir = baseWorld(t, ONE40);
    move(dir, A40, R40);
    const r = hintsOnly(dir);
    assert.deepEqual(changed(r).map((f) => f.line), [], show(r));
  });

  test('0040-a.md renamed to 040-a.md with a changed text: a "text changed" hint adr-changed at 040-a.md, and no "file is gone" hint', (t) => {
    const dir = baseWorld(t, ONE40);
    move(dir, A40, R40);
    editFile(dir, R40, 'Context: Alpha.', 'Context: Alpha, and more.');
    const r = hintsOnly(dir);
    const found = hintAt(r, 'adr-changed', R40);
    assert.ok(found.some((f) => /text changed/.test(f.msg)), `a "text changed" message at 040-a.md:\n${show(r)}`);
    assert.deepEqual(changed(r).filter((f) => /file is gone/.test(f.msg)).map((f) => f.line), [], `no "file is gone" hint:\n${show(r)}`);
  });

  test('control: 0040-a.md deleted and no other file of ADR-40: the "file is gone" hint adr-changed at 0040-a.md', (t) => {
    const dir = baseWorld(t, ONE40);
    rmSync(join(dir, A40));
    const r = hintsOnly(dir);
    const found = hintAt(r, 'adr-changed', A40);
    assert.ok(found.some((f) => /file is gone/.test(f.msg)), `a "file is gone" message:\n${show(r)}`);
  });

  test('40-c.md added beside an unchanged 0040-a.md, with other text: no adr-changed at either file, and one adr-number line that names both', (t) => {
    const dir = baseWorld(t, ONE40);
    write(dir, C40, adr(40, 'accepted', 'Gamma'));
    const r = hintsOnly(dir);
    none(r, 'adr-changed', A40);
    none(r, 'adr-changed', C40);
    assert.deepEqual(changed(r).map((f) => f.line), [], `no adr-changed at all:\n${show(r)}`);
    const found = linesOf(r, 'adr-number');
    assert.equal(found.length, 1, `one adr-number line:\n${show(r)}`);
    assert.ok(found[0].includes('0040-a.md') && found[0].includes('40-c.md'), `it names both files:\n${show(r)}`);
  });
});

// =====================================================================
// A binding to ADR-<n> uses the first file of the number in name order
// (DES-113: a link that names the ADR). The spec paragraph INV-2 serves the
// open request inv and is governed by ADR-1, so inv's record holds the
// binding INV-2 governed-by ADR-1. A binding whose target changed since it
// was bound gives hint stale-base on the holder; its message starts with
// "<link> <target>,".

describe('#40: a binding to ADR-1 uses the first file of ADR-1', () => {
  const A1 = 'specs/adr/001-a.md';
  const B1 = 'specs/adr/1-b.md';
  const stale = (r) => r.findings.filter((f) => f.code === 'stale-base' && f.id === 'INV-2' && f.msg.startsWith('governed-by ADR-1,'));

  // main: config, the spec, 001-a.md and 1-b.md (both ADR-1, accepted), the
  // request inv with R1; indexed and committed. Then the branch feature.
  function bound(t) {
    const dir = project(t);
    writeConfig(dir);
    write(dir, SPEC, doc([
      ['INV-1 note', '# Invoices'],
      ['INV-2 rule serves:inv/R1 governed-by:ADR-1', 'An invoice MUST be sent to the customer.'],
    ]));
    write(dir, A1, adr(1, 'accepted', 'Alpha'));
    write(dir, B1, adr(1, 'accepted', 'Beta'));
    newRequest(dir, 'inv');
    appendSection(dir, 'inv', organized([req('R1', 'Send invoices', 'An invoice MUST reach the customer.')]));
    index(dir);
    commitAll(dir, 'base');
    git(dir, 'checkout', '-q', '-b', 'feature');
    return dir;
  }

  test('the binding INV-2 governed-by ADR-1 is recorded with the hash of the heading of 001-a.md, not of 1-b.md', (t) => {
    const dir = bound(t);
    const found = bindingsOf(record(dir, 'inv'), 'INV-2', 'governed-by', 'ADR-1');
    assert.equal(found.length, 1, `one binding INV-2 governed-by ADR-1 in the record of inv:\n${JSON.stringify(record(dir, 'inv').bindings, null, 1)}`);
    assert.notEqual(hashOf(dir, A1, 'ADR-1'), hashOf(dir, B1, 'ADR-1'), 'the two headings differ');
    assert.equal(found[0].target_sha256, hashOf(dir, A1, 'ADR-1'), 'the target hash is of 001-a.md');
  });

  test('only the heading of 001-a.md (the first file) changes: hint stale-base on INV-2 for governed-by ADR-1', (t) => {
    const dir = bound(t);
    editFile(dir, A1, '# ADR-1: Alpha', '# ADR-1: Alpha, reworded');
    index(dir);
    const r = check(dir);
    assert.equal(r.code, 0, show(r));
    const found = stale(r);
    assert.equal(found.length, 1, `one stale-base on INV-2 for governed-by ADR-1:\n${show(r)}`);
    assert.equal(found[0].severity, 'hint', show(r));
  });

  test('only the heading of 1-b.md (the second file) changes: no stale-base on INV-2 for governed-by ADR-1', (t) => {
    const dir = bound(t);
    editFile(dir, B1, '# ADR-1: Beta', '# ADR-1: Beta, reworded');
    index(dir);
    const r = check(dir);
    assert.equal(r.code, 0, show(r));
    // This world must still hold the binding, else the test proves nothing.
    assert.equal(bindingsOf(record(dir, 'inv'), 'INV-2', 'governed-by', 'ADR-1').length, 1, 'the binding is still recorded');
    assert.deepEqual(stale(r).map((f) => f.line), [], show(r));
  });
});

// =====================================================================
// Other places that read the ADR files: al export, the phrases: of config,
// and the bindings of a link that only the second file of a number declares.

describe('#40: al export reads 001-x.md as an ADR', () => {
  test('001-x.md (accepted) gives the rows ADR-1 and ADR-1-1 with role baseline and source type adr, as 0002-y.md does; adr-1.md gives no row', (t) => {
    const dir = project(t);
    writeConfig(dir);
    write(dir, SPEC, doc([['INV-1 note', '# Invoices'], ['INV-2 rule', 'An invoice MUST be sent to the customer.']]));
    write(dir, 'specs/adr/001-x.md', adr(1, 'accepted', 'One'));
    write(dir, 'specs/adr/0002-y.md', adr(2, 'accepted', 'Two'));
    write(dir, 'specs/adr/adr-1.md', adr(9, 'accepted', 'Not an ADR'));
    index(dir);
    commitAll(dir, 'base');
    const { rows } = exportRows(dir);
    const of = (file) => rows.filter((r) => r.doc_or_request === file).map((r) => [r.id, r.role, r.source_type, r.file]);
    // The four-digit control, as test/export.test.js has it.
    assert.deepEqual(of('specs/adr/0002-y.md'),
      [['ADR-2', 'baseline', 'adr', 'specs/adr/0002-y.md'], ['ADR-2-1', 'baseline', 'adr', 'specs/adr/0002-y.md']]);
    assert.deepEqual(of('specs/adr/001-x.md'),
      [['ADR-1', 'baseline', 'adr', 'specs/adr/001-x.md'], ['ADR-1-1', 'baseline', 'adr', 'specs/adr/001-x.md']]);
    assert.deepEqual(rows.filter((r) => r.doc_or_request === 'specs/adr/adr-1.md' || r.file === 'specs/adr/adr-1.md').map((r) => r.id), [],
      'adr-1.md gives no row');
    assert.deepEqual(rows.filter((r) => r.id === 'ADR-9' || r.id === 'ADR-9-1').map((r) => r.id), [], 'no row has the IDs of adr-1.md');
  });
});

describe('#40: phrases: match in each file of a number', () => {
  const A1 = 'specs/adr/001-a.md';
  const B1 = 'specs/adr/1-b.md';
  const phraseAt = (r, file) => r.findings.filter((f) => f.code === 'phrase' && f.file === file);
  function phrased(t, files) {
    const dir = world(t, files);
    writeConfig(dir, undefined, { phrases: ['the requester'] });
    return check(dir);
  }

  test('a phrase only in 1-b.md (the second file of ADR-1): hint phrase at 1-b.md, none at 001-a.md', (t) => {
    const r = phrased(t, {
      [A1]: adr(1, 'accepted', 'Alpha'),
      [B1]: adr(1, 'accepted', 'Beta', { text: 'Context: the requester wants it.' }),
    });
    assert.equal(r.code, 0, show(r));
    const found = phraseAt(r, B1);
    assert.ok(found.length >= 1, `hint phrase at 1-b.md:\n${show(r)}`);
    assert.ok(found.every((f) => f.severity === 'hint'), show(r));
    assert.deepEqual(phraseAt(r, A1).map((f) => f.line), [], show(r));
  });

  test('control: a phrase only in 001-a.md: hint phrase at 001-a.md, none at 1-b.md', (t) => {
    const r = phrased(t, {
      [A1]: adr(1, 'accepted', 'Alpha', { text: 'Context: the requester wants it.' }),
      [B1]: adr(1, 'accepted', 'Beta'),
    });
    assert.ok(phraseAt(r, A1).length >= 1, `hint phrase at 001-a.md:\n${show(r)}`);
    assert.deepEqual(phraseAt(r, B1).map((f) => f.line), [], show(r));
  });
});

// The heading marker of 1-b.md has source:inv/D1, and the one of 001-a.md
// does not. So the record of the open request inv holds the binding
// ADR-1 source inv/D1, and only 1-b.md declares it. al index removes a
// binding whose link no marker declares any more, and names it on a line
// that says "removed" (#11 R1).
describe('#40: a link that only the second file of a number declares', () => {
  const A1 = 'specs/adr/001-a.md';
  const B1 = 'specs/adr/1-b.md';
  const B = ['ADR-1', 'source', 'inv/D1'];
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const token = (s, w) => new RegExp(`(^|[^\\w/.-])${esc(w)}($|[^\\w/-])`).test(s);
  const removedLines = (r) => r.stdout.split('\n').filter((l) => /remov/i.test(l) && B.every((w) => token(l, w)));
  const held = (dir) => bindingsOf(record(dir, 'inv'), ...B);

  // main: config, the spec, the request inv with R1 and D1, 001-a.md and
  // 1-b.md; indexed and committed. Then the branch feature.
  function declared(t) {
    const dir = project(t);
    writeConfig(dir);
    write(dir, SPEC, doc([['INV-1 note', '# Invoices'], ['INV-2 rule', 'An invoice MUST be sent to the customer.']]));
    newRequest(dir, 'inv');
    appendSection(dir, 'inv', organized([req('R1', 'Send invoices', 'An invoice MUST reach the customer.')]));
    ok(dir, ['record', 'inv', 'decision', '--source', 'owner', '--text', 'Invoices go by email.', '--clarifies', 'R1', '--yes']);
    write(dir, A1, adr(1, 'accepted', 'Alpha'));
    write(dir, B1, adr(1, 'accepted', 'Beta', { links: 'decides:INV-2 source:inv/D1' }));
    index(dir);
    commitAll(dir, 'base');
    git(dir, 'checkout', '-q', '-b', 'feature');
    return dir;
  }

  test('the binding ADR-1 source inv/D1 is recorded on main', (t) => {
    const dir = declared(t);
    assert.equal(held(dir).length, 1, `one binding ADR-1 source inv/D1:\n${JSON.stringify(record(dir, 'inv').bindings, null, 1)}`);
  });

  test('nothing changes on the branch: al index removes no binding of ADR-1 source inv/D1, and al check gives no binding hint on ADR-1', (t) => {
    const dir = declared(t);
    const ix = index(dir);
    assert.deepEqual(removedLines(ix), [], `no removal line for ${B.join(' ')}:\n${show(ix)}`);
    assert.equal(held(dir).length, 1, 'the binding is still recorded');
    const r = check(dir);
    assert.equal(r.code, 0, show(r));
    const bindingHints = r.findings.filter((f) => ['stale-base', 'holder-changed'].includes(f.code) && f.id === 'ADR-1');
    assert.deepEqual(bindingHints.map((f) => f.line), [], `no stale-base and no holder-changed on ADR-1:\n${show(r)}`);
    assert.deepEqual(r.findings.filter((f) => f.id === 'ADR-1' && f.msg.includes('inv/D1')).map((f) => f.line), [],
      `no finding on ADR-1 about inv/D1:\n${show(r)}`);
  });

  test('control: source:inv/D1 removed from 1-b.md: al index removes the binding and names it on a removal line', (t) => {
    const dir = declared(t);
    editFile(dir, B1, 'decides:INV-2 source:inv/D1', 'decides:INV-2 source:INV-2');
    const ix = index(dir);
    assert.ok(removedLines(ix).length >= 1, `a removal line for ${B.join(' ')}:\n${show(ix)}`);
    assert.equal(held(dir).length, 0, 'the binding is gone');
  });

  // holder-changed (#11 R2): the holder of ADR-1 source inv/D1 is the
  // heading of 1-b.md, the paragraph that declares the link (DES-113). Its
  // message starts with "<link> <target>:". Checked before and after a plain
  // al index, which does not clear it.
  const holderChanged = (r) => r.findings.filter((f) => f.code === 'holder-changed' && f.id === 'ADR-1' && f.msg.startsWith('source inv/D1'));

  test('only the heading text of 1-b.md changes: one holder-changed on ADR-1 for source inv/D1, at 1-b.md, none at 001-a.md', (t) => {
    const dir = declared(t);
    editFile(dir, B1, '# ADR-1: Beta', '# ADR-1: Beta, reworded');
    for (const when of ['before al index', 'after al index']) {
      if (when === 'after al index') index(dir);
      const r = check(dir);
      assert.equal(r.code, 0, show(r));
      const found = holderChanged(r);
      assert.equal(found.length, 1, `${when}: one holder-changed on ADR-1 for source inv/D1:\n${show(r)}`);
      assert.equal(found[0].severity, 'hint', show(r));
      assert.equal(found[0].file, B1, `${when}: it is at 1-b.md:\n${show(r)}`);
      assert.deepEqual(r.findings.filter((f) => f.code === 'holder-changed' && f.file === A1).map((f) => f.line), [],
        `${when}: no holder-changed at 001-a.md:\n${show(r)}`);
    }
  });

  test('only the heading text of 001-a.md changes: no holder-changed on ADR-1 for source inv/D1', (t) => {
    const dir = declared(t);
    editFile(dir, A1, '# ADR-1: Alpha', '# ADR-1: Alpha, reworded');
    for (const when of ['before al index', 'after al index']) {
      if (when === 'after al index') index(dir);
      const r = check(dir);
      assert.equal(r.code, 0, show(r));
      assert.deepEqual(holderChanged(r).map((f) => f.line), [], `${when}: no holder-changed for source inv/D1:\n${show(r)}`);
    }
    // This world must still hold the binding, else the test proves nothing.
    assert.equal(held(dir).length, 1, 'the binding is still recorded');
  });
});

// Both headings of ADR-1 declare decides:INV-2 and source:inv/D1, so both
// name the request inv. The holder of a link is the paragraph with the bound
// text; else the paragraph that declares the link and names the request;
// when more than one is left, the hint says that it is unclear and names
// each file (DES-113).
describe('#40: a link that both files of a number declare', () => {
  const A1 = 'specs/adr/001-a.md';
  const B1 = 'specs/adr/1-b.md';
  const LINKS = 'decides:INV-2 source:inv/D1';
  const decides = (r) => r.findings.filter((f) => f.code === 'holder-changed' && f.id === 'ADR-1' && f.msg.startsWith('decides INV-2'));

  function both(t) {
    const dir = project(t);
    writeConfig(dir);
    write(dir, SPEC, doc([['INV-1 note', '# Invoices'], ['INV-2 rule', 'An invoice MUST be sent to the customer.']]));
    newRequest(dir, 'inv');
    appendSection(dir, 'inv', organized([req('R1', 'Send invoices', 'An invoice MUST reach the customer.')]));
    ok(dir, ['record', 'inv', 'decision', '--source', 'owner', '--text', 'Invoices go by email.', '--clarifies', 'R1', '--yes']);
    write(dir, A1, adr(1, 'accepted', 'Alpha', { links: LINKS }));
    write(dir, B1, adr(1, 'accepted', 'Beta', { links: LINKS }));
    index(dir);
    commitAll(dir, 'base');
    git(dir, 'checkout', '-q', '-b', 'feature');
    return dir;
  }

  test('both heading texts change: exactly one holder-changed on ADR-1 for decides INV-2, that says it is unclear and names 001-a.md and 1-b.md', (t) => {
    const dir = both(t);
    assert.equal(bindingsOf(record(dir, 'inv'), 'ADR-1', 'decides', 'INV-2').length, 1, 'one binding ADR-1 decides INV-2');
    editFile(dir, A1, '# ADR-1: Alpha', '# ADR-1: Alpha, reworded');
    editFile(dir, B1, '# ADR-1: Beta', '# ADR-1: Beta, reworded');
    const r = check(dir);
    assert.equal(r.code, 0, show(r));
    const found = decides(r);
    assert.equal(found.length, 1, `exactly one holder-changed on ADR-1 for decides INV-2:\n${show(r)}`);
    assert.equal(found[0].severity, 'hint', show(r));
    assert.match(found[0].msg, /unclear/i, `its message says that it is unclear:\n${show(r)}`);
    assert.ok(found[0].line.includes(A1) && found[0].line.includes(B1), `it names ${A1} and ${B1}:\n${show(r)}`);
  });

  test('control: only the heading text of 1-b.md changes: no holder-changed at 001-a.md', (t) => {
    const dir = both(t);
    editFile(dir, B1, '# ADR-1: Beta', '# ADR-1: Beta, reworded');
    const r = check(dir);
    assert.equal(r.code, 0, show(r));
    assert.deepEqual(r.findings.filter((f) => f.code === 'holder-changed' && f.file === A1).map((f) => f.line), [],
      `no holder-changed at 001-a.md, which did not change:\n${show(r)}`);
  });

  // The paragraph with the bound text is the holder, also when both
  // paragraphs declare the link and name the request. #88: a judgement
  // needs a hint (al index --align, which moved a binding with no hint, is
  // removed), so both headings change: that gives the "unclear"
  // holder-changed, and the judgement on ADR-1 clears it.
  test('both headings change, and a holder-changed judgement on ADR-1 binds the text of one file (#88): no holder-changed for decides INV-2, before and after a commit, and after an edit of the other file', (t) => {
    const dir = both(t);
    editFile(dir, A1, '# ADR-1: Alpha', '# ADR-1: Alpha, reworded');
    editFile(dir, B1, '# ADR-1: Beta', '# ADR-1: Beta, reworded');
    const before = check(dir);
    assert.equal(decides(before).length, 1, `the premise: one holder-changed on ADR-1 for decides INV-2:\n${show(before)}`);
    ok(dir, ['record', 'inv', 'judgement', '--hint', 'holder-changed', '--on', 'ADR-1', '--reason', 'Reworded; ADR-1 still decides INV-2.', '--yes']);
    index(dir);
    // The binding holds the text of now of one of the two files, which differ.
    const found = bindingsOf(record(dir, 'inv'), 'ADR-1', 'decides', 'INV-2');
    assert.equal(found.length, 1, 'one binding ADR-1 decides INV-2');
    assert.notEqual(hashOf(dir, A1, 'ADR-1'), hashOf(dir, B1, 'ADR-1'), 'the two headings differ');
    const bound = [A1, B1].find((f) => hashOf(dir, f, 'ADR-1') === found[0].holder_sha256);
    assert.ok(bound, `the binding holds the text of now of ${A1} or ${B1}`);
    const r = check(dir);
    assert.equal(r.code, 0, show(r));
    assert.deepEqual(decides(r).map((f) => f.line), [], `no holder-changed on ADR-1 for decides INV-2:\n${show(r)}`);
    commitAll(dir, 'reword both files, with the judgement');
    const again = check(dir);
    assert.equal(again.code, 0, show(again));
    assert.deepEqual(decides(again).map((f) => f.line), [], `after the commit, no holder-changed on ADR-1 for decides INV-2:\n${show(again)}`);
    assert.deepEqual(again.findings.filter((f) => f.code === 'holder-changed' && f.id === 'ADR-1').map((f) => f.line), [],
      `after the commit, no holder-changed on ADR-1 in either file:\n${show(again)}`);
    // The other file changes again; the file with the bound text is unchanged, so it is the holder.
    const other = bound === A1 ? B1 : A1;
    const heading = other === A1 ? '# ADR-1: Alpha, reworded' : '# ADR-1: Beta, reworded';
    editFile(dir, other, heading, `${heading} once more`);
    const last = check(dir);
    assert.equal(last.code, 0, show(last));
    assert.deepEqual(decides(last).map((f) => f.line), [], `an edit of ${other}, which does not hold the bound text, gives no holder-changed for decides INV-2:\n${show(last)}`);
  });
});

// =====================================================================
// Regression tests from the review of #40.

// A link to a paragraph ADR-<n>-<k> looks ADR-<n> up by its number, so it
// uses the first file of the number in name order (DES-113). al index and
// al check agree on it: a paragraph that only the second file has is not a
// target. al index then does not bind it and names it on a "not bound:"
// line; al check gives hint unresolved-link on the holder.
describe('#40: a link to ADR-1-<k> uses the first file of ADR-1', () => {
  const A1 = 'specs/adr/001-a.md';
  const B1 = 'specs/adr/1-b.md';
  const A1_TEXT = `Status: accepted\n\n${doc([['ADR-1 choice decides:INV-2 source:INV-2', '# ADR-1: Alpha'], ['ADR-1-1 rationale', 'Context: Alpha.']])}`;
  const B1_TEXT = `Status: accepted\n\n${doc([['ADR-1 choice decides:INV-2 source:INV-2', '# ADR-1: Beta'], ['ADR-1-2 rationale', 'Context: Beta.']])}`;

  function linkTo(t, target) {
    const dir = project(t);
    writeConfig(dir);
    write(dir, SPEC, doc([['INV-1 note', '# Invoices'], [`INV-2 rule serves:inv/R1 governed-by:${target}`, 'An invoice MUST be sent to the customer.']]));
    newRequest(dir, 'inv');
    appendSection(dir, 'inv', organized([req('R1', 'Send invoices', 'An invoice MUST reach the customer.')]));
    write(dir, A1, A1_TEXT);
    write(dir, B1, B1_TEXT);
    const ix = index(dir);
    return { dir, ix };
  }
  const unresolved = (r, target) => r.findings.filter((f) => f.code === 'unresolved-link' && f.id === 'INV-2' && f.line.includes(target));

  test('governed-by:ADR-1-2, a paragraph of 1-b.md only: al index does not bind it and says "not bound", and al check gives hint unresolved-link on INV-2', (t) => {
    const { dir, ix } = linkTo(t, 'ADR-1-2');
    assert.deepEqual(bindingsOf(record(dir, 'inv'), 'INV-2', 'governed-by', 'ADR-1-2').map((b) => b.target_sha256), [],
      `no binding INV-2 governed-by ADR-1-2:\n${show(ix)}`);
    assert.ok(ix.stdout.split('\n').some((l) => l.startsWith('not bound:') && l.includes('INV-2') && l.includes('ADR-1-2')),
      `a "not bound:" line for INV-2 governed-by ADR-1-2:\n${show(ix)}`);
    const r = check(dir);
    assert.equal(r.code, 0, show(r));
    const found = unresolved(r, 'ADR-1-2');
    assert.ok(found.length >= 1, `hint unresolved-link on INV-2 for ADR-1-2:\n${show(r)}`);
    assert.ok(found.every((f) => f.severity === 'hint'), show(r));
  });

  test('control: governed-by:ADR-1-1, a paragraph of 001-a.md (the first file): bound to its text, and no unresolved-link', (t) => {
    const { dir, ix } = linkTo(t, 'ADR-1-1');
    const found = bindingsOf(record(dir, 'inv'), 'INV-2', 'governed-by', 'ADR-1-1');
    assert.equal(found.length, 1, `one binding INV-2 governed-by ADR-1-1:\n${show(ix)}`);
    assert.equal(found[0].target_sha256, hashOf(dir, A1, 'ADR-1-1'), 'the target hash is of ADR-1-1 in 001-a.md');
    const r = check(dir);
    assert.deepEqual(r.findings.filter((f) => f.code === 'unresolved-link').map((f) => f.line), [], show(r));
  });
});

// The number is the exact value of the digits (R1), also past 2^53.
describe('#40: the exact value of a long digit run', () => {
  const N2 = '9007199254740992';
  const N3 = '9007199254740993';
  const F2 = `specs/adr/${N2}-x.md`;
  const F3 = `specs/adr/${N3}-x.md`;

  test(`${N2}-x.md and ${N3}-x.md are two numbers: no adr-number, no adr-links, no adr-status`, (t) => {
    const r = hintsOnly(world(t, { [F2]: adr(N2, 'accepted', 'Two'), [F3]: adr(N3, 'accepted', 'Three') }));
    assert.deepEqual(linesOf(r, 'adr-number'), [], show(r));
    assert.deepEqual(r.findings.filter((f) => ['adr-links', 'adr-status'].includes(f.code)).map((f) => f.line), [], show(r));
  });

  test(`a citation of ADR-${N3}, superseded by ADR-5, is not ok superseded-cited; a citation of the accepted ADR-${N2} is not`, (t) => {
    const dir = world(t, {
      [F2]: adr(N2, 'accepted', 'Two'),
      [F3]: adr(N3, 'superseded by ADR-5', 'Three'),
      'specs/adr/005-y.md': adr(5, 'accepted', 'Five', { links: `decides:INV-2 source:INV-2 supersedes:ADR-${N3}` }),
    });
    write(dir, SPEC, doc([
      ['INV-1 note', '# Invoices'],
      ['INV-2 rule', `An invoice MUST be sent to the customer, as ADR-${N3} says.`],
      ['INV-3 rule', `An invoice MUST have a number, as ADR-${N2} says.`],
    ]));
    const r = check(dir);
    assert.equal(r.code, 0, show(r));
    const cited = (id) => r.findings.filter((f) => f.code === 'superseded-cited' && f.id === id);
    assert.ok(cited('INV-2').length >= 1, `not ok superseded-cited on INV-2:\n${show(r)}`);
    assert.ok(cited('INV-2').every((f) => f.severity === 'not ok'), show(r));
    assert.ok(cited('INV-2').some((f) => f.line.includes(`ADR-${N3}`)), `it names ADR-${N3}:\n${show(r)}`);
    assert.deepEqual(cited('INV-3').map((f) => f.line), [], `no superseded-cited on INV-3:\n${show(r)}`);
  });

  test('leading zeros drop: 00012345678901234567-x.md is ADR-12345678901234567', (t) => {
    const file = 'specs/adr/00012345678901234567-x.md';
    const r = hintsOnly(world(t, { [file]: adr('12345678901234567', 'bogus', 'Long') }));
    statusHint(r, file, 'ADR-12345678901234567');
  });

  // The status line and the supersedes: link name long numbers exactly.
  // 9007199254740995 is not a double: Number() makes it 9007199254740996.
  test(`${N3}-x.md "superseded by ADR-9007199254740995", which supersedes:ADR-${N3}: no adr-supersede, no superseded-status, no adr-number; --strict exits 0`, (t) => {
    const N4 = '9007199254740995';
    const r = hintsOnly(world(t, {
      [F2]: adr(N2, 'accepted', 'Two'),
      [F3]: adr(N3, `superseded by ADR-${N4}`, 'Three'),
      [`specs/adr/${N4}-y.md`]: adr(N4, 'accepted', 'Four', { links: `decides:INV-2 source:INV-2 supersedes:ADR-${N3}` }),
    }));
    assert.deepEqual(r.findings.filter((f) => ['adr-supersede', 'superseded-status'].includes(f.code)).map((f) => f.line), [], show(r));
    assert.deepEqual(linesOf(r, 'adr-number'), [], show(r));
  });
});
