// bin/al-v4.js: `spec`, `spec --add-ids` and `check`, run in throwaway git
// repos. Written from the T8 interface (issue #174) and design.md 3 and 13.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown } from '../../src/v4/markers.js';
import { loadConfig } from '../../src/v4/config.js';
import { makeRepo as makeBareRepo, addRequest, runV4, lines, assertFrame, show } from './helpers/repo.js';

// Spec docs here use serves:inv/R<n> (design.md 3: in specs/, a link names
// the request), so each repo holds requests/inv/request.md.
function makeRepo(t, opts) {
  const repo = makeBareRepo(t, opts);
  addRequest(repo);
  repo.commit('request inv');
  return repo;
}

const doc = (...ls) => ls.join('\n') + '\n';

// A clean doc: every paragraph has an ID, a kind and the links it needs.
// Markers on lines 1, 5, 9, 13, 17; the file has 19 lines.
const CLEAN = doc(
  '<!-- INV-1 note -->', '', '# Invoices', '',
  '<!-- INV-2 purpose serves:inv/R1 -->', '', 'Invoicer sends invoices.', '',
  '<!-- INV-3 note -->', '', '## Export', '',
  '<!-- INV-4 rule serves:inv/R2 -->', '', 'The export link MUST expire.', '',
  '<!-- INV-5 rule serves:inv/R2 -->', '', 'A link is signed.',
);

const has = (r, line) => lines(r.stdout).includes(line);
const startsWith = (r, prefix) => lines(r.stdout).filter((l) => l.startsWith(prefix));
const assertLine = (r, line) => assert.ok(has(r, line), `line ${JSON.stringify(line)} expected:\n${show(r)}`);
const assertNoLine = (r, line) => assert.ok(!has(r, line), `line ${JSON.stringify(line)} not expected:\n${show(r)}`);
const assertStarts = (r, prefix, n = 1) => assert.equal(startsWith(r, prefix).length, n,
  `${n} line(s) starting ${JSON.stringify(prefix)} expected:\n${show(r)}`);
const assertError = (r) => {
  assert.equal(r.code, 2, show(r));
  assert.match(r.stdout + r.stderr, /^al: \S/m, show(r));
};

describe('al spec', () => {
  test('lists each doc: its path, then two spaces, the display number, two spaces, the kind or -', (t) => {
    const repo = makeRepo(t);
    repo.write('specs/inv.md', CLEAN + doc('', '<!-- INV-6 -->', '', 'Untyped.'));
    repo.commit('spec');
    const r = runV4(repo.dir, ['spec']);
    assert.equal(r.code, 0, show(r));
    const ls = lines(r.stdout);
    const at = ls.indexOf('specs/inv.md');
    assert.ok(at >= 0, show(r));
    assert.deepEqual(ls.slice(at, at + 7), [
      'specs/inv.md',
      '  INV-1 (0, Invoices)  note',
      '  INV-2 (0:1, in Invoices)  purpose',
      '  INV-3 (1, Export)  note',
      '  INV-4 (1:1, in Export)  rule',
      '  INV-5 (1:2, in Export)  rule',
      '  INV-6 (1:3, in Export)  -',
    ]);
    assertFrame(r.stdout);
  });

  test('the docs in scope: the spec root without specs/adr/, the docs list, and each request spec', (t) => {
    const repo = makeRepo(t);
    repo.write('.assuredloop/config.yaml', 'docs:\n  - file: guide/use.md\n    prefix: USE\n');
    repo.write('specs/inv.md', '<!-- INV-1 note -->\n\n# Invoices\n');
    repo.write('specs/sub/more.md', '<!-- INV-2 note -->\n\n# More\n');
    repo.write('specs/adr/0001-pick.md', '<!-- ADR-1 note -->\n\n# Pick\n');
    repo.write('specs/notes.txt', '<!-- TXT-1 note -->\n\nNot a doc.\n');
    repo.write('guide/use.md', '<!-- USE-1 note -->\n\n# Use\n');
    repo.write('guide/other.md', '<!-- OTH-1 note -->\n\n# Other\n');
    repo.write('requests/totals/spec.md', '<!-- SP-1 note -->\n\n# Totals\n');
    repo.write('NOTES.md', '<!-- NOTE-1 note -->\n\n# Notes\n');
    repo.commit('docs');
    const r = runV4(repo.dir, ['spec']);
    assert.equal(r.code, 0, show(r));
    for (const path of ['specs/inv.md', 'specs/sub/more.md', 'guide/use.md', 'requests/totals/spec.md']) assertLine(r, path);
    for (const id of ['INV-1', 'INV-2', 'USE-1', 'SP-1']) assert.ok(r.stdout.includes(`  ${id} (`), `${id}:\n${show(r)}`);
    for (const id of ['ADR-1', 'TXT-1', 'OTH-1', 'NOTE-1']) assert.ok(!r.stdout.includes(id), `${id} is out of scope:\n${show(r)}`);
  });

  test('root in config.yaml moves the spec root', (t) => {
    const repo = makeRepo(t);
    repo.write('.assuredloop/config.yaml', 'root: design\n');
    repo.write('design/a.md', '<!-- DES-1 note -->\n\n# A\n');
    repo.write('specs/b.md', '<!-- SPB-1 note -->\n\n# B\n');
    const r = runV4(repo.dir, ['spec']);
    assert.equal(r.code, 0, show(r));
    assertLine(r, 'design/a.md');
    assert.ok(!r.stdout.includes('SPB-1'), show(r));
  });

  test('with files given, lists only those files', (t) => {
    const repo = makeRepo(t);
    repo.write('specs/inv.md', CLEAN);
    repo.write('specs/other.md', '<!-- OTH-1 note -->\n\n# Other\n');
    const r = runV4(repo.dir, ['spec', 'specs/other.md']);
    assert.equal(r.code, 0, show(r));
    assertLine(r, 'specs/other.md');
    assertLine(r, '  OTH-1 (0, Other)  note');
    assert.ok(!r.stdout.includes('INV-1'), show(r));
  });
});

// The unmarked doc used by the --add-ids tests: 5 blocks. The list, table,
// fence and quote belong to "The export has:".
const UNMARKED_BLOCKS = [
  '# Invoices',
  'Invoicer sends invoices.',
  '## Export',
  [
    'The export has:', '',
    '- one row per invoice', '- a total', '',
    '| a | b |', '|---|---|', '| 1 | 2 |', '',
    '```js', '// <!-- EX-1 rule -->', '## not a heading', '```', '',
    '> A quote.',
  ].join('\n'),
  'Closing words.',
];
const UNMARKED = UNMARKED_BLOCKS.join('\n\n') + '\n';
const MARKER = /^<!-- +([A-Z][A-Z0-9]*-[0-9]+)( +[^ ]+)* +--> *$/;
const NO_MARK_LINTS = ['no-id', 'no-blank-before', 'no-blank-after', 'duplicate-id'];

const addIds = (repo, file, ...rest) => runV4(repo.dir, ['spec', '--add-ids', file, ...rest]);

// Drop each marker line and the blank line after it.
function stripMarkers(text) {
  const ls = text.split('\n');
  const out = [];
  for (let i = 0; i < ls.length; i++) {
    if (MARKER.test(ls[i]) && ls[i + 1] === '') { i++; continue; }
    out.push(ls[i]);
  }
  return out.join('\n');
}

function assertNothingWritten(repo, file, before) {
  if (before === undefined) assert.ok(!repo.exists(file), `${file} should not be written`);
  else assert.equal(repo.read(file), before);
  assert.ok(!repo.exists('.assuredloop/config.yaml'), 'config.yaml should not be written');
  assert.ok(!repo.exists('.assuredloop/schema.yaml'), 'schema.yaml should not be written');
}

describe('al spec --add-ids', () => {
  test('without --yes: says how many it would mark and writes nothing', (t) => {
    const repo = makeRepo(t);
    repo.write('specs/inv.md', UNMARKED);
    repo.commit('unmarked');
    const r = addIds(repo, 'specs/inv.md', '--prefix', 'INV');
    assert.equal(r.code, 0, show(r));
    assertLine(r, 'Would mark 5 paragraph(s) in specs/inv.md');
    assertFrame(r.stdout);
    assertNothingWritten(repo, 'specs/inv.md', UNMARKED);
  });

  test('with --yes: marks every block, headings get note, the text of each block is unchanged', (t) => {
    const repo = makeRepo(t);
    repo.write('specs/inv.md', UNMARKED);
    repo.commit('unmarked');
    const r = addIds(repo, 'specs/inv.md', '--prefix', 'INV', '--yes');
    assert.equal(r.code, 0, show(r));
    assertLine(r, 'Marked 5 paragraph(s) in specs/inv.md');
    assertFrame(r.stdout);
    const after = repo.read('specs/inv.md');
    const parsed = parseMarkdown(after, 'specs/inv.md');
    // Ambiguity: new numbers are given in file order.
    assert.deepEqual(parsed.paragraphs.map((p) => p.id), ['INV-1', 'INV-2', 'INV-3', 'INV-4', 'INV-5']);
    assert.deepEqual(parsed.paragraphs.map((p) => p.kind), ['note', null, 'note', null, null]);
    assert.deepEqual(parsed.paragraphs.map((p) => p.text), UNMARKED_BLOCKS);
    assert.deepEqual(parsed.lints.filter((l) => NO_MARK_LINTS.includes(l.code)), []);
    assert.equal(stripMarkers(after), UNMARKED);
  });

  test('blocks with no blank line between them get the blank lines a marker needs', (t) => {
    const repo = makeRepo(t);
    repo.write('specs/inv.md', '# Invoices\nIntro.\n## Export\nBody.\n');
    const r = addIds(repo, 'specs/inv.md', '--prefix', 'INV', '--yes');
    assert.equal(r.code, 0, show(r));
    assertLine(r, 'Marked 4 paragraph(s) in specs/inv.md');
    const parsed = parseMarkdown(repo.read('specs/inv.md'), 'specs/inv.md');
    assert.deepEqual(parsed.paragraphs.map((p) => p.text), ['# Invoices', 'Intro.', '## Export', 'Body.']);
    assert.deepEqual(parsed.paragraphs.map((p) => p.kind), ['note', null, 'note', null]);
    assert.deepEqual(parsed.lints.filter((l) => NO_MARK_LINTS.includes(l.code)), []);
  });

  test('writes config.yaml and schema.yaml when absent, with the doc and its prefix in docs', (t) => {
    const repo = makeRepo(t);
    repo.write('specs/inv.md', UNMARKED);
    assert.equal(addIds(repo, 'specs/inv.md', '--prefix', 'INV', '--yes').code, 0);
    assert.ok(repo.exists('.assuredloop/config.yaml'));
    assert.ok(repo.exists('.assuredloop/schema.yaml'));
    const c = loadConfig(repo.dir);
    assert.ok(c.docs.some((d) => d.file === 'specs/inv.md' && d.prefix === 'INV'), JSON.stringify(c));
  });

  test('a second run marks 0 and leaves the file as it is, with or without --prefix', (t) => {
    const repo = makeRepo(t);
    repo.write('specs/inv.md', UNMARKED);
    assert.equal(addIds(repo, 'specs/inv.md', '--prefix', 'INV', '--yes').code, 0);
    const once = repo.read('specs/inv.md');
    const preview = addIds(repo, 'specs/inv.md', '--prefix', 'INV');
    assert.equal(preview.code, 0, show(preview));
    assertLine(preview, 'Would mark 0 paragraph(s) in specs/inv.md');
    const again = addIds(repo, 'specs/inv.md', '--yes');
    assert.equal(again.code, 0, show(again));
    assertLine(again, 'Marked 0 paragraph(s) in specs/inv.md');
    assert.equal(repo.read('specs/inv.md'), once);
  });

  test('keeps existing markers and numbers new blocks above the highest in the file', (t) => {
    const repo = makeRepo(t);
    repo.write('specs/inv.md', doc('# Invoices', '', '<!-- INV-7 rule serves:inv/R1 builds-on:INV-2 -->', '', 'Kept rule.', '', '## Export', '', 'New text.'));
    const r = addIds(repo, 'specs/inv.md', '--prefix', 'INV', '--yes');
    assert.equal(r.code, 0, show(r));
    assertLine(r, 'Marked 3 paragraph(s) in specs/inv.md');
    const after = repo.read('specs/inv.md');
    assert.ok(after.includes('<!-- INV-7 rule serves:inv/R1 builds-on:INV-2 -->\n\nKept rule.\n'), after);
    const ps = parseMarkdown(after, 'specs/inv.md').paragraphs;
    assert.deepEqual(ps.map((p) => p.id), ['INV-8', 'INV-7', 'INV-9', 'INV-10']);
    assert.deepEqual(ps.map((p) => p.text), ['# Invoices', 'Kept rule.', '## Export', 'New text.']);
  });

  test('never gives a number used in an earlier commit, even when that ID is gone now', (t) => {
    const repo = makeRepo(t);
    repo.write('specs/inv.md', doc('<!-- INV-1 note -->', '', '# Invoices', '', '<!-- INV-9 note -->', '', 'Old text.'));
    repo.commit('INV-9 added');
    repo.write('specs/inv.md', doc('<!-- INV-1 note -->', '', '# Invoices'));
    repo.commit('INV-9 removed');
    repo.write('specs/inv.md', doc('<!-- INV-1 note -->', '', '# Invoices', '', 'New text.'));
    const r = addIds(repo, 'specs/inv.md', '--prefix', 'INV', '--yes');
    assert.equal(r.code, 0, show(r));
    assert.deepEqual(parseMarkdown(repo.read('specs/inv.md'), 'specs/inv.md').paragraphs.map((p) => p.id), ['INV-1', 'INV-10']);
  });

  // The clarification from the developer: --add-ids never renumbers an
  // existing marker, so a duplicate that was there before stays.
  test('an existing duplicate ID is kept, not renumbered', (t) => {
    const repo = makeRepo(t);
    const before = doc('<!-- INV-1 note -->', '', 'One.', '', '<!-- INV-1 note -->', '', 'Two.', '', 'Three.');
    repo.write('specs/inv.md', before);
    const r = addIds(repo, 'specs/inv.md', '--prefix', 'INV', '--yes');
    assert.equal(r.code, 0, show(r));
    assertLine(r, 'Marked 1 paragraph(s) in specs/inv.md');
    assert.deepEqual(parseMarkdown(repo.read('specs/inv.md'), 'specs/inv.md').paragraphs.map((p) => p.id), ['INV-1', 'INV-1', 'INV-2']);
  });

  test('takes the prefix from config docs when the file is listed there', (t) => {
    const repo = makeRepo(t);
    const config = 'docs:\n  - file: guide/use.md\n    prefix: USE\n';
    repo.write('.assuredloop/config.yaml', config);
    repo.write('guide/use.md', '# Use\n\nRun it.\n');
    const r = addIds(repo, 'guide/use.md', '--yes');
    assert.equal(r.code, 0, show(r));
    assertLine(r, 'Marked 2 paragraph(s) in guide/use.md');
    assert.deepEqual(parseMarkdown(repo.read('guide/use.md'), 'guide/use.md').paragraphs.map((p) => p.id), ['USE-1', 'USE-2']);
    assert.ok(loadConfig(repo.dir).docs.some((d) => d.file === 'guide/use.md' && d.prefix === 'USE'));
  });

  test('a --prefix equal to the listed one is accepted', (t) => {
    const repo = makeRepo(t);
    repo.write('.assuredloop/config.yaml', 'docs:\n  - file: guide/use.md\n    prefix: USE\n');
    repo.write('guide/use.md', '# Use\n');
    const r = addIds(repo, 'guide/use.md', '--prefix', 'USE', '--yes');
    assert.equal(r.code, 0, show(r));
    assert.ok(repo.read('guide/use.md').includes('USE-1'));
  });

  test('a --prefix that differs from the listed one is an error and writes nothing', (t) => {
    const repo = makeRepo(t);
    const config = 'docs:\n  - file: guide/use.md\n    prefix: USE\n';
    repo.write('.assuredloop/config.yaml', config);
    repo.write('guide/use.md', '# Use\n');
    const r = addIds(repo, 'guide/use.md', '--prefix', 'GUI', '--yes');
    assertError(r);
    assertFrame(r.stdout);
    assert.equal(repo.read('guide/use.md'), '# Use\n');
    assert.equal(repo.read('.assuredloop/config.yaml'), config);
    assert.ok(!repo.exists('.assuredloop/schema.yaml'));
  });

  test('a request spec takes the prefix SP without --prefix', (t) => {
    const repo = makeRepo(t);
    repo.write('requests/totals/spec.md', '# Totals\n\nAdd a total line.\n');
    const r = addIds(repo, 'requests/totals/spec.md', '--yes');
    assert.equal(r.code, 0, show(r));
    assertLine(r, 'Marked 2 paragraph(s) in requests/totals/spec.md');
    assert.deepEqual(parseMarkdown(repo.read('requests/totals/spec.md'), 'requests/totals/spec.md').paragraphs.map((p) => p.id), ['SP-1', 'SP-2']);
  });

  test('a file that is neither listed nor a request spec needs --prefix', (t) => {
    const repo = makeRepo(t);
    repo.write('specs/inv.md', UNMARKED);
    assertError(addIds(repo, 'specs/inv.md', '--yes'));
    assertNothingWritten(repo, 'specs/inv.md', UNMARKED);
  });

  for (const bad of ['inv', '1NV', 'IN-V', 'In', '']) {
    test(`--prefix ${JSON.stringify(bad)} is an error and writes nothing`, (t) => {
      const repo = makeRepo(t);
      repo.write('specs/inv.md', UNMARKED);
      assertError(addIds(repo, 'specs/inv.md', '--prefix', bad, '--yes'));
      assertNothingWritten(repo, 'specs/inv.md', UNMARKED);
    });
  }

  test('a prefix of capital letters and digits starting with a letter is accepted', (t) => {
    const repo = makeRepo(t);
    repo.write('specs/inv.md', '# Invoices\n');
    const r = addIds(repo, 'specs/inv.md', '--prefix', 'V2X', '--yes');
    assert.equal(r.code, 0, show(r));
    assert.deepEqual(parseMarkdown(repo.read('specs/inv.md'), 'specs/inv.md').paragraphs.map((p) => p.id), ['V2X-1']);
  });

  test('a file that does not exist is an error and writes nothing', (t) => {
    const repo = makeRepo(t);
    assertError(addIds(repo, 'specs/none.md', '--prefix', 'INV', '--yes'));
    assertNothingWritten(repo, 'specs/none.md');
  });

  test('a file that is not .md is an error and writes nothing', (t) => {
    const repo = makeRepo(t);
    repo.write('specs/notes.txt', 'Some notes.\n');
    assertError(addIds(repo, 'specs/notes.txt', '--prefix', 'INV', '--yes'));
    assertNothingWritten(repo, 'specs/notes.txt', 'Some notes.\n');
  });

  test('a file under specs/adr/ is an error and writes nothing', (t) => {
    const repo = makeRepo(t);
    repo.write('specs/adr/0001-pick.md', '# Pick\n\nWe pick A.\n');
    assertError(addIds(repo, 'specs/adr/0001-pick.md', '--prefix', 'ADR', '--yes'));
    assertNothingWritten(repo, 'specs/adr/0001-pick.md', '# Pick\n\nWe pick A.\n');
  });
});

// A repo with CLEAN on main, then a feature branch.
function featureRepo(t, mainText = CLEAN) {
  const repo = makeRepo(t);
  repo.write('specs/inv.md', mainText);
  repo.commit('spec on main');
  repo.git(['checkout', '-q', '-b', 'feature']);
  return repo;
}
const check = (repo, ...args) => runV4(repo.dir, ['check', ...args]);
const lintLines = (r) => lines(r.stdout).filter((l) => /^(not ok|hint) /.test(l));

describe('al check', () => {
  test('a clean branch with no change: ok: no marker lint, no change line, exit 0 also with --strict', (t) => {
    const repo = featureRepo(t);
    const r = check(repo);
    assert.equal(r.code, 0, show(r));
    assertLine(r, 'ok: no marker lint');
    assert.deepEqual(lintLines(r), []);
    assert.deepEqual(startsWith(r, 'specs/inv.md '), []);
    assertFrame(r.stdout);
    const s = check(repo, '--strict');
    assert.equal(s.code, 0, show(s));
    assertLine(s, 'ok: no marker lint');
  });

  test('change lines: Changed (committed) and New (working tree only); unchanged IDs get no line', (t) => {
    const repo = featureRepo(t);
    repo.write('specs/inv.md', CLEAN.replace('The export link MUST expire.', 'The export link MUST expire in 30 minutes.'));
    repo.commit('reword INV-4');
    repo.write('specs/inv.md', repo.read('specs/inv.md') + doc('', '<!-- INV-6 rule serves:inv/R3 -->', '', 'A link is used once.'));
    const r = check(repo);
    assert.equal(r.code, 0, show(r));
    assertLine(r, 'specs/inv.md INV-4 Changed');
    assertLine(r, 'specs/inv.md INV-6 New');
    for (const id of ['INV-1', 'INV-2', 'INV-3', 'INV-5']) assertStarts(r, `specs/inv.md ${id} `, 0);
    assertLine(r, 'ok: no marker lint');
  });

  test('change lines: Moved, and Changed+Moved joined by +', (t) => {
    const repo = featureRepo(t);
    const moved = doc(
      '<!-- INV-1 note -->', '', '# Invoices', '',
      '<!-- INV-2 purpose serves:inv/R1 -->', '', 'Invoicer sends invoices.', '',
      '<!-- INV-5 rule serves:inv/R2 -->', '', 'A link is signed with a key.', '',
      '<!-- INV-3 note -->', '', '## Export', '',
      '<!-- INV-4 rule serves:inv/R2 -->', '', 'The export link MUST expire.',
    );
    repo.write('specs/inv.md', moved);
    const r = check(repo);
    assert.equal(r.code, 0, show(r));
    assertLine(r, 'specs/inv.md INV-5 Changed+Moved');
    for (const id of ['INV-1', 'INV-2', 'INV-3', 'INV-4']) assertStarts(r, `specs/inv.md ${id} `, 0);

    repo.write('specs/inv.md', moved.replace('A link is signed with a key.', 'A link is signed.'));
    const m = check(repo);
    assertLine(m, 'specs/inv.md INV-5 Moved');
  });

  test('each lint prints as <severity> <code> <file>:<line> <id or -> <message>', (t) => {
    const bad = doc(
      '<!-- INV-1 note -->', '', '# Invoices', '',
      '<!-- INV-2 purpose serves:inv/R1 -->', 'Invoicer sends invoices.', '',
      'Stray paragraph.', '',
      '<!-- INV-3 -->', '', 'Untyped.',
    );
    const repo = featureRepo(t, bad);
    const r = check(repo);
    assert.equal(r.code, 0, show(r));
    const ls = lintLines(r);
    assert.equal(ls.length, 3, show(r));
    assert.match(ls.find((l) => l.includes(' no-blank-after ')) ?? '', /^not ok no-blank-after specs\/inv\.md:5 INV-2 \S/, show(r));
    assert.match(ls.find((l) => l.includes(' no-id ')) ?? '', /^not ok no-id specs\/inv\.md:8 - \S/, show(r));
    assert.match(ls.find((l) => l.includes(' no-kind ')) ?? '', /^hint no-kind specs\/inv\.md:10 INV-3 \S/, show(r));
    assertNoLine(r, 'ok: no marker lint');
    assertFrame(r.stdout);
  });

  test('--strict prints every hint as not ok and exits 1', (t) => {
    const repo = featureRepo(t, CLEAN + doc('', '<!-- INV-6 rule -->', '', 'A rule with no link.', '', '<!-- INV-7 -->', '', 'Untyped.'));
    const plain = check(repo);
    assert.equal(plain.code, 0, show(plain));
    assert.match(lintLines(plain).find((l) => l.includes(' no-link ')) ?? '', /^hint no-link specs\/inv\.md:21 INV-6 \S/, show(plain));
    assert.match(lintLines(plain).find((l) => l.includes(' no-kind ')) ?? '', /^hint no-kind specs\/inv\.md:25 INV-7 \S/, show(plain));
    const strict = check(repo, '--strict');
    assert.equal(strict.code, 1, show(strict));
    const ls = lintLines(strict);
    assert.equal(ls.length, 2, show(strict));
    assert.match(ls.find((l) => l.includes(' no-link ')) ?? '', /^not ok no-link specs\/inv\.md:21 INV-6 \S/, show(strict));
    assert.match(ls.find((l) => l.includes(' no-kind ')) ?? '', /^not ok no-kind specs\/inv\.md:25 INV-7 \S/, show(strict));
    assertNoLine(strict, 'ok: no marker lint');
  });

  // duplicate-heading is a hint (design.md section 3, PR #176).
  test('duplicate-heading prints as a hint, and as not ok with exit 1 under --strict', (t) => {
    const repo = featureRepo(t, CLEAN + doc('', '<!-- INV-6 note -->', '', '## Export ##'));
    const plain = check(repo);
    assert.equal(plain.code, 0, show(plain));
    assert.deepEqual(lintLines(plain).map((l) => l.replace(/ INV-6 .*/, ' INV-6')), ['hint duplicate-heading specs/inv.md:21 INV-6'], show(plain));
    const strict = check(repo, '--strict');
    assert.equal(strict.code, 1, show(strict));
    assert.deepEqual(lintLines(strict).map((l) => l.replace(/ INV-6 .*/, ' INV-6')), ['not ok duplicate-heading specs/inv.md:21 INV-6'], show(strict));
  });

  test('--strict exits 1 on a not ok lint; without it the exit is 0', (t) => {
    const repo = featureRepo(t, doc('<!-- INV-1 note -->', 'Text.'));
    assert.equal(check(repo).code, 0);
    assert.equal(check(repo, '--strict').code, 1);
  });

  test('lost-id: an ID of the base that is gone at head, with a Removed change line', (t) => {
    const repo = featureRepo(t);
    repo.write('specs/inv.md', CLEAN.replace(doc('', '<!-- INV-5 rule serves:inv/R2 -->', '', 'A link is signed.'), '\n'));
    repo.commit('drop INV-5');
    const r = check(repo);
    assert.equal(r.code, 0, show(r));
    assertStarts(r, 'not ok lost-id specs/inv.md:', 1);
    assert.match(startsWith(r, 'not ok lost-id ')[0], /^not ok lost-id specs\/inv\.md:\d+ INV-5 \S/);
    assertLine(r, 'specs/inv.md INV-5 Removed');
    assert.equal(check(repo, '--strict').code, 1);
  });

  test('a removal declared by removes: in a change spec at head is not lost-id', (t) => {
    const repo = featureRepo(t);
    repo.write('specs/inv.md', CLEAN.replace(doc('', '<!-- INV-5 rule serves:inv/R2 -->', '', 'A link is signed.'), '\n'));
    repo.write('requests/unsign/spec.md', '<!-- SP-1 plan removes:INV-5 -->\n\nDrop the signed-link rule.\n');
    const r = check(repo);
    assert.equal(r.code, 0, show(r));
    assert.ok(!r.stdout.includes('lost-id'), show(r));
    assertLine(r, 'specs/inv.md INV-5 Removed');
    assertLine(r, 'ok: no marker lint');
  });

  test('an ID moved to another doc of the same scope is not lost-id', (t) => {
    const repo = featureRepo(t);
    repo.write('specs/inv.md', CLEAN.replace(doc('', '<!-- INV-5 rule serves:inv/R2 -->', '', 'A link is signed.'), '\n'));
    repo.write('specs/links.md', '<!-- INV-5 rule serves:inv/R2 -->\n\nA link is signed.\n');
    const r = check(repo);
    assert.equal(r.code, 0, show(r));
    assert.ok(!r.stdout.includes('lost-id'), show(r));
    assertLine(r, 'specs/links.md INV-5 Moved');
    assertLine(r, 'ok: no marker lint');
  });

  test('used-again: an ID removed on main before the base, added back on the branch', (t) => {
    const repo = makeRepo(t);
    repo.write('specs/inv.md', CLEAN + doc('', '<!-- INV-6 rule serves:inv/R2 -->', '', 'An old rule.'));
    repo.commit('INV-6 added');
    repo.write('specs/inv.md', CLEAN);
    repo.commit('INV-6 removed');
    repo.git(['checkout', '-q', '-b', 'feature']);
    repo.write('specs/inv.md', CLEAN + doc('', '<!-- INV-6 rule serves:inv/R2 -->', '', 'A new rule.', '', '<!-- INV-7 rule serves:inv/R2 -->', '', 'A fresh rule.'));
    const r = check(repo);
    assert.equal(r.code, 0, show(r));
    assertStarts(r, 'not ok used-again ', 1);
    assert.match(startsWith(r, 'not ok used-again ')[0], /^not ok used-again specs\/inv\.md:21 INV-6 \S/);
    assertLine(r, 'specs/inv.md INV-6 New');
    assertLine(r, 'specs/inv.md INV-7 New');
  });

  test('duplicate-id: one ID in two docs of the global scope', (t) => {
    const repo = featureRepo(t);
    repo.write('specs/other.md', '<!-- INV-2 note -->\n\nAnother paragraph.\n');
    const r = check(repo);
    assert.equal(r.code, 0, show(r));
    const dup = startsWith(r, 'not ok duplicate-id ');
    assert.equal(dup.length, 1, show(r));
    assert.match(dup[0], /^not ok duplicate-id specs\/(inv|other)\.md:\d+ INV-2 \S/);
  });

  test('control: two request specs each with SP-1 are two scopes, no duplicate-id', (t) => {
    const repo = featureRepo(t);
    repo.write('requests/one/spec.md', '<!-- SP-1 plan -->\n\nStep one.\n');
    repo.write('requests/two/spec.md', '<!-- SP-1 plan -->\n\nStep two.\n');
    const r = check(repo);
    assert.equal(r.code, 0, show(r));
    assert.ok(!r.stdout.includes('duplicate-id'), show(r));
    assertLine(r, 'ok: no marker lint');
  });

  test('check reads the docs in scope only', (t) => {
    const repo = featureRepo(t);
    repo.write('.assuredloop/config.yaml', 'docs:\n  - file: guide/use.md\n    prefix: USE\n');
    repo.write('guide/use.md', '<!-- USE-1 -->\n\nRun it.\n');
    repo.write('requests/totals/spec.md', '<!-- SP-1 -->\n\nAdd a total.\n');
    repo.write('specs/adr/0001-pick.md', '<!-- ADR-1 -->\n\nWe pick A.\n');
    repo.write('NOTES.md', '<!-- NOTE-1 -->\n\nA note.\n');
    const r = check(repo);
    assert.equal(r.code, 0, show(r));
    assert.match(startsWith(r, 'hint no-kind guide/use.md:')[0] ?? '', /^hint no-kind guide\/use\.md:1 USE-1 \S/, show(r));
    assert.match(startsWith(r, 'hint no-kind requests/totals/spec.md:')[0] ?? '', /^hint no-kind requests\/totals\/spec\.md:1 SP-1 \S/, show(r));
    assert.ok(!r.stdout.includes('ADR-1'), show(r));
    assert.ok(!r.stdout.includes('NOTE-1'), show(r));
  });

  test('with no main branch, lost-id and used-again are not checked and Not known says so', (t) => {
    const repo = makeRepo(t, { branch: 'trunk' });
    repo.write('specs/inv.md', CLEAN);
    repo.commit('spec');
    repo.write('specs/inv.md', CLEAN.replace(doc('', '<!-- INV-5 rule serves:inv/R2 -->', '', 'A link is signed.'), '\n') + doc('', '<!-- INV-6 -->', '', 'Untyped.'));
    repo.commit('drop INV-5, add INV-6');
    const r = check(repo);
    assert.equal(r.code, 0, show(r));
    assert.ok(!r.stdout.includes('lost-id'), show(r));
    assertStarts(r, 'hint no-kind specs/inv.md:', 1);
    assertFrame(r.stdout);
    const notKnown = lines(r.stdout).at(-1);
    assert.match(notKnown, /lost/i, show(r));
    assert.match(notKnown, /used.again/i, show(r));
  });

  test('with no base commit (a branch with no history in common with main), Not known says lost is not checked', (t) => {
    const repo = makeRepo(t);
    repo.git(['checkout', '-q', '--orphan', 'solo']);
    repo.write('specs/inv.md', CLEAN);
    repo.commit('solo spec');
    const r = check(repo);
    assert.equal(r.code, 0, show(r));
    assertFrame(r.stdout);
    assert.match(lines(r.stdout).at(-1), /lost/i, show(r));
  });

  test('control: with a base, Not known does not say lost is not checked', (t) => {
    const repo = featureRepo(t);
    const r = check(repo);
    assert.doesNotMatch(lines(r.stdout).at(-1), /lost/i, show(r));
  });
});

// Gaps found by the hand mutation check (coordinator, after the first run).
describe('al spec --add-ids: numbers are per prefix', () => {
  test('another doc of the same scope with another prefix and higher numbers does not raise the number', (t) => {
    const repo = makeRepo(t);
    repo.write('.assuredloop/config.yaml', 'docs:\n  - file: specs/a.md\n    prefix: A\n  - file: specs/b.md\n    prefix: B\n');
    repo.write('specs/a.md', doc('<!-- A-1 note -->', '', '# Alpha', '', '<!-- A-2 note -->', '', 'One.', '', 'New block.'));
    repo.write('specs/b.md', doc('<!-- B-1 note -->', '', '# Beta', '', '<!-- B-9 note -->', '', 'Nine.'));
    repo.commit('two docs');
    const r = addIds(repo, 'specs/a.md', '--yes');
    assert.equal(r.code, 0, show(r));
    assertLine(r, 'Marked 1 paragraph(s) in specs/a.md');
    assert.deepEqual(parseMarkdown(repo.read('specs/a.md'), 'specs/a.md').paragraphs.map((p) => p.id), ['A-1', 'A-2', 'A-3']);
  });

  test('an ID of another prefix removed in an earlier commit does not raise the number', (t) => {
    const repo = makeRepo(t);
    repo.write('.assuredloop/config.yaml', 'docs:\n  - file: specs/a.md\n    prefix: A\n  - file: specs/b.md\n    prefix: B\n');
    repo.write('specs/a.md', doc('<!-- A-1 note -->', '', '# Alpha'));
    repo.write('specs/b.md', doc('<!-- B-1 note -->', '', '# Beta', '', '<!-- B-12 note -->', '', 'Twelve.'));
    repo.commit('B-12 added');
    repo.remove('specs/b.md');
    repo.commit('b removed');
    repo.write('specs/a.md', doc('<!-- A-1 note -->', '', '# Alpha', '', 'New block.'));
    const r = addIds(repo, 'specs/a.md', '--yes');
    assert.equal(r.code, 0, show(r));
    assert.deepEqual(parseMarkdown(repo.read('specs/a.md'), 'specs/a.md').paragraphs.map((p) => p.id), ['A-1', 'A-2']);
  });
});

describe('al check: used-again from history', () => {
  // In a diff, a removed line "-- note" shows as "--- note" and an added line
  // "++ x" shows as "+++ x", which look like file headers.
  test('lines that start with "-- " or "++ " near the marker do not hide a used ID', (t) => {
    const repo = makeRepo(t);
    repo.write('specs/inv.md', CLEAN + doc('', '<!-- INV-6 rule serves:inv/R2 -->', '', 'An old rule.', '-- note', '++ x'));
    repo.commit('INV-6 added with -- and ++ lines');
    repo.write('specs/inv.md', CLEAN);
    repo.commit('INV-6 removed with its lines');
    repo.git(['checkout', '-q', '-b', 'feature']);
    repo.write('specs/inv.md', CLEAN + doc('', '<!-- INV-6 rule serves:inv/R2 -->', '', 'A new rule.'));
    const r = check(repo);
    assert.equal(r.code, 0, show(r));
    assertStarts(r, 'not ok used-again ', 1);
    assert.match(startsWith(r, 'not ok used-again ')[0], /^not ok used-again specs\/inv\.md:21 INV-6 \S/);
  });

  // The marker comes after the header-like line in the same hunk: in the
  // adding commit "+++ x" is before the added INV-6 marker, and in the
  // removing commit "--- note" is before the removed INV-6 marker.
  test('a marker added and removed right after a "++ " or "-- " line in the same hunk is still used', (t) => {
    const repo = makeRepo(t);
    const upToInv4 = CLEAN.split('\n').slice(0, 15).join('\n') + '\n';
    repo.write('specs/inv.md', CLEAN);
    repo.commit('INV-1..5');
    repo.write('specs/inv.md', CLEAN + doc('++ x', '-- note', '', '<!-- INV-6 rule serves:inv/R2 -->', '', 'Six.'));
    repo.commit('INV-5 gets ++ and -- lines, INV-6 added right after');
    repo.write('specs/inv.md', upToInv4);
    repo.commit('INV-5 and INV-6 removed in one run');
    repo.git(['checkout', '-q', '-b', 'feature']);
    repo.write('specs/inv.md', upToInv4 + doc('', '<!-- INV-6 rule serves:inv/R2 -->', '', 'Six again.'));
    const r = check(repo);
    assert.equal(r.code, 0, show(r));
    assertStarts(r, 'not ok used-again ', 1);
    assert.match(startsWith(r, 'not ok used-again ')[0], /^not ok used-again specs\/inv\.md:17 INV-6 \S/);
  });

  test('a marker that was only ever in a file outside the scope does not count as used', (t) => {
    const repo = makeRepo(t);
    repo.write('specs/inv.md', CLEAN);
    repo.write('docs/guide.md', doc('<!-- INV-6 note -->', '', 'A guide paragraph.'));
    repo.commit('guide outside the scope');
    repo.remove('docs/guide.md');
    repo.commit('guide removed');
    repo.git(['checkout', '-q', '-b', 'feature']);
    repo.write('specs/inv.md', CLEAN + doc('', '<!-- INV-6 rule serves:inv/R2 -->', '', 'A new rule.'));
    const r = check(repo);
    assert.equal(r.code, 0, show(r));
    assert.ok(!r.stdout.includes('used-again'), show(r));
    assertLine(r, 'specs/inv.md INV-6 New');
    assertLine(r, 'ok: no marker lint');
  });
});
