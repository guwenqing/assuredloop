// al spec --add-ids writes the adoption record, and al check reads it on the
// branch (#196, T17; design.md 5 and 14, decisions D8, D9 and D16). Written
// from the requirement of issue #196 and the public commands, not from the
// code. The text hash oracle is the text_sha256 that `al index` writes in the
// per-doc record; the tests do not compute it themselves.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import {
  al, commitAll, docRecord, editFile, exists, git, index, ok, project, read, readYaml, refused, show, write,
  writeConfig, writeYaml, writesNothing,
} from './helpers/project.js';
import { check } from './helpers/invoicer.js';

const SPEC = 'specs/invoices.md';
const ADOPTION = '.assuredloop/records/requests/adoption.yaml';
const ADOPTION_MD = 'requests/archive/adoption/request.md';
const HEX40 = /^[0-9a-f]{40}$/;

// The unmarked spec. --add-ids --prefix INV marks it in file order:
// INV-1 heading, INV-2 data text, INV-3 heading, INV-4 rule, INV-5 rule.
const UNMARKED = [
  '# Invoices',
  'An invoice has a number, a customer, lines and a total.',
  '## Rules',
  'An invoice MUST have at least one line.',
  'The export link MUST expire 30 minutes after the email is sent.',
].join('\n\n') + '\n';
const ALL = ['INV-1', 'INV-2', 'INV-3', 'INV-4', 'INV-5'];

const addIds = (dir, file = SPEC, ...rest) => al(dir, ['spec', '--add-ids', file, '--prefix', 'INV', ...rest]);
const adopt = (dir, file = SPEC, ...rest) => ok(dir, ['spec', '--add-ids', file, '--prefix', 'INV', '--yes', ...rest]);
const dispositions = (dir) => readYaml(dir, ADOPTION).dispositions;
const outLines = (r) => r.stdout.split('\n');

// The text hash of each ID, as `al index` writes it in the per-doc record.
function hashes(dir, file = SPEC) {
  index(dir);
  return Object.fromEntries((docRecord(dir, file).paragraphs ?? []).map((p) => [p.id, p.text_sha256]));
}

// The entry the requirement asks for, for one marked paragraph.
const entry = (id, commit, hash) => ({ source: 'adoption', disposition: 'incorporated', spec: id, commit, spec_sha256: hash });

// A repo with the unmarked spec committed on main.
function unmarkedRepo(t, text = UNMARKED) {
  const dir = project(t);
  write(dir, SPEC, text);
  commitAll(dir, 'the spec, before AssuredLoop');
  return dir;
}

describe('al spec --add-ids --yes writes the adoption record', () => {
  test('one disposition per marked paragraph, in file order: source adoption, incorporated, the ID, the full HEAD commit, the text hash', (t) => {
    const dir = unmarkedRepo(t);
    const head = git(dir, 'rev-parse', 'HEAD');
    assert.match(head, HEX40);
    const r = adopt(dir);
    const got = dispositions(dir);
    const h = hashes(dir);
    assert.deepEqual(got, ALL.map((id) => entry(id, head, h[id])), show(r));
  });

  test('a new record is a map with schema assuredloop/1, request adoption, status concluded and the dispositions list', (t) => {
    const dir = unmarkedRepo(t);
    const r = adopt(dir);
    assert.ok(exists(dir, ADOPTION), show(r));
    const rec = readYaml(dir, ADOPTION);
    assert.equal(rec.schema, 'assuredloop/1');
    assert.equal(rec.request, 'adoption');
    assert.equal(rec.status, 'concluded');
    assert.ok(Array.isArray(rec.dispositions), JSON.stringify(rec));
    assert.equal(rec.dispositions.length, ALL.length, JSON.stringify(rec));
  });

  test('writes requests/archive/adoption/request.md with a heading when it is absent', (t) => {
    const dir = unmarkedRepo(t);
    const r = adopt(dir);
    assert.ok(exists(dir, ADOPTION_MD), show(r));
    assert.match(read(dir, ADOPTION_MD), /^#+ \S/m);
  });

  test('never changes an existing requests/archive/adoption/request.md', (t) => {
    const dir = project(t);
    const own = '# Adoption\n\nOur own words about the adoption, kept as they are.  \n';
    write(dir, SPEC, UNMARKED);
    write(dir, ADOPTION_MD, own);
    commitAll(dir, 'spec and our own adoption note');
    const r = adopt(dir);
    assert.equal(read(dir, ADOPTION_MD), own, show(r));
    assert.equal(dispositions(dir).length, ALL.length, show(r));
  });

  test('a paragraph that already had a marker gets no entry; only the paragraphs this run marked do', (t) => {
    const text = [
      '<!-- INV-1 note -->', '', '# Invoices', '',
      '<!-- INV-2 data -->', '', 'An invoice has a number.', '',
      'An invoice MUST have at least one line.', '',
      '## Rules', '',
      'The export link MUST expire.', '',
    ].join('\n');
    const dir = unmarkedRepo(t, text);
    const head = git(dir, 'rev-parse', 'HEAD');
    const r = adopt(dir);
    const h = hashes(dir);
    assert.deepEqual(dispositions(dir), ['INV-3', 'INV-4', 'INV-5'].map((id) => entry(id, head, h[id])), show(r));
  });

  test('a second run on another file appends, and the entries already there stay byte for byte', (t) => {
    const dir = project(t);
    write(dir, 'specs/a.md', '# Alpha\n\nAlpha text.\n');
    write(dir, 'specs/b.md', '# Beta\n\nBeta text.\n\nBeta MUST hold.\n');
    commitAll(dir, 'two unmarked docs');
    ok(dir, ['spec', '--add-ids', 'specs/a.md', '--prefix', 'A', '--yes']);
    const first = read(dir, ADOPTION);
    const firstEntries = parse(first).dispositions;
    assert.equal(firstEntries.length, 2, first);
    const head = commitAll(dir, 'adopt a.md');
    const r = ok(dir, ['spec', '--add-ids', 'specs/b.md', '--prefix', 'B', '--yes']);
    const second = read(dir, ADOPTION);
    assert.ok(second.startsWith(first), `the old bytes are kept and the new entries come after them:\n--- first\n${first}--- second\n${second}`);
    const all = parse(second).dispositions;
    assert.deepEqual(all.slice(0, 2), firstEntries, show(r));
    const h = hashes(dir, 'specs/b.md');
    assert.deepEqual(all.slice(2), ['B-1', 'B-2', 'B-3'].map((id) => entry(id, head, h[id])), show(r));
  });

  test('a paragraph edited in the working tree and not committed gets no entry, and the output names it as not adopted', (t) => {
    const dir = unmarkedRepo(t);
    const head = git(dir, 'rev-parse', 'HEAD');
    editFile(dir, SPEC, 'at least one line', 'at least two lines');
    const r = adopt(dir);
    const h = hashes(dir);
    assert.deepEqual(dispositions(dir), ['INV-1', 'INV-2', 'INV-3', 'INV-5'].map((id) => entry(id, head, h[id])), show(r));
    assert.ok(outLines(r).some((l) => l.includes('INV-4') && /not adopted/i.test(l)), `a line names INV-4 as not adopted:\n${show(r)}`);
    for (const id of ['INV-1', 'INV-2', 'INV-3', 'INV-5']) {
      assert.ok(!outLines(r).some((l) => new RegExp(`\\b${id}\\b`).test(l) && /not adopted/i.test(l)), `${id} is adopted:\n${show(r)}`);
    }
  });

  test('a paragraph added in the working tree and not committed gets no entry, and the output names it as not adopted', (t) => {
    const dir = unmarkedRepo(t);
    const head = git(dir, 'rev-parse', 'HEAD');
    write(dir, SPEC, `${UNMARKED}\nA paid invoice MUST NOT change.\n`);
    const r = adopt(dir);
    const h = hashes(dir);
    assert.ok(h['INV-6'], `INV-6 is the added paragraph:\n${read(dir, SPEC)}`);
    assert.deepEqual(dispositions(dir), ALL.map((id) => entry(id, head, h[id])), show(r));
    assert.ok(outLines(r).some((l) => l.includes('INV-6') && /not adopted/i.test(l)), `a line names INV-6 as not adopted:\n${show(r)}`);
  });

  test('without --yes nothing is written: no doc change, no record, no request.md', (t) => {
    const dir = unmarkedRepo(t);
    writesNothing(dir, ['spec', '--add-ids', SPEC, '--prefix', 'INV']);
    assert.ok(!exists(dir, ADOPTION));
    assert.ok(!exists(dir, ADOPTION_MD));
  });

  test('in a repo with no commit yet: the file is marked, no adoption record and no request.md, and the output says no adoption record was written', (t) => {
    const dir = project(t);
    write(dir, SPEC, UNMARKED);
    const r = adopt(dir);
    assert.match(read(dir, SPEC), /^<!-- INV-1 note -->$/m, show(r));
    assert.match(read(dir, SPEC), /^<!-- INV-5 -->$/m, show(r));
    assert.ok(!exists(dir, ADOPTION), show(r));
    assert.ok(!exists(dir, ADOPTION_MD), show(r));
    assert.ok(outLines(r).some((l) => /adoption record/i.test(l) && /\b(no|not)\b/i.test(l)),
      `a line says that no adoption record was written:\n${show(r)}`);
  });

  test('an open request named adoption makes it refuse: exit 2, an al: line, nothing written', (t) => {
    const dir = project(t);
    write(dir, SPEC, UNMARKED);
    write(dir, 'requests/adoption/request.md', '# Adoption\n\nAn open request that has the name adoption.\n');
    commitAll(dir, 'spec and an open request named adoption');
    refused(dir, ['spec', '--add-ids', SPEC, '--prefix', 'INV', '--yes']);
  });

  test('a later al index keeps the adoption entries unchanged, also after a text edit (D8)', (t) => {
    const dir = unmarkedRepo(t);
    adopt(dir);
    const before = dispositions(dir);
    index(dir);
    assert.deepEqual(dispositions(dir), before);
    editFile(dir, SPEC, 'at least one line', 'at least two lines');
    commitAll(dir, 'edit INV-4');
    index(dir);
    assert.deepEqual(dispositions(dir), before);
  });
});

// --- al check on the adopting branch (T16 gap 1)

const CLAIM = 'Adopt AssuredLoop: al spec --add-ids\n\nTier: 0 — adds paragraph IDs; no promise changes';
const PROMISE_CODES = ['signoff-coverage', 'path-claim'];

// main: the v4 config and the unmarked spec. Then the branch `feature`.
function adoptionBase(t) {
  const dir = project(t);
  writeConfig(dir);
  write(dir, SPEC, UNMARKED);
  commitAll(dir, 'the v4 config and the spec, before IDs');
  git(dir, 'checkout', '-q', '-b', 'feature');
  return dir;
}

// The kinds set by hand in the markers that --add-ids wrote.
function setKinds(dir, kinds = { 'INV-2': 'data', 'INV-4': 'rule', 'INV-5': 'rule' }) {
  for (const [id, kind] of Object.entries(kinds)) editFile(dir, SPEC, `<!-- ${id} -->`, `<!-- ${id} ${kind} -->`);
}

// The adoption record by hand in the T9 format (D16), naming each ID with the
// given hash and the HEAD commit, so these tests do not depend on what
// --add-ids writes. It replaces any record that --add-ids wrote.
function handRecord(dir, named) {
  const head = git(dir, 'rev-parse', 'HEAD');
  writeYaml(dir, ADOPTION, {
    schema: 'assuredloop/1', request: 'adoption', status: 'concluded',
    dispositions: Object.entries(named).map(([id, hash]) => entry(id, head, hash)),
  });
  if (!exists(dir, ADOPTION_MD)) write(dir, ADOPTION_MD, '# Adoption\n\nThe paragraphs of specs/invoices.md as adopted.\n');
}
const pick = (h, ids) => Object.fromEntries(ids.map((id) => [id, h[id]]));

const notOk = (r, id) => r.findings.filter((f) => f.severity === 'not ok' && f.id === id);
const noLink = (r, id) => r.findings.filter((f) => f.code === 'no-link' && f.id === id);
const assertPromiseFindings = (r, id) => {
  for (const code of PROMISE_CODES) {
    assert.ok(r.findings.some((f) => f.severity === 'not ok' && f.code === code && f.id === id), `not ok ${code} ${id}:\n${show(r)}`);
  }
};
const assertClean = (r, ids) => {
  for (const id of ids) {
    assert.deepEqual(notOk(r, id), [], `no not ok for ${id}:\n${show(r)}`);
    assert.deepEqual(noLink(r, id), [], `no no-link for ${id}:\n${show(r)}`);
  }
};
// A hint with the ID that says the adoption record does not match the base.
const assertMismatchHint = (r, id) => assert.ok(
  r.findings.some((f) => f.severity === 'hint' && f.id === id && /adopt/i.test(f.line) && /\bbase\b/i.test(f.line)),
  `a hint for ${id} says the adoption record does not match the base:\n${show(r)}`,
);

describe('al check reads the adoption record on the branch', () => {
  test('a branch that adopts an unmarked spec: no not ok and no no-link for the adopted paragraphs, --strict exits 0', (t) => {
    const dir = adoptionBase(t);
    adopt(dir);
    setKinds(dir);
    commitAll(dir, CLAIM);
    const r = check(dir);
    assert.equal(r.code, 0, show(r));
    assertClean(r, ALL);
    const strict = check(dir, '--strict');
    assert.equal(strict.code, 0, show(strict));
    assertClean(strict, ALL);
  });

  test('control: the same marked branch with no adoption record still gives signoff-coverage and path-claim not ok', (t) => {
    const dir = adoptionBase(t);
    adopt(dir);
    setKinds(dir);
    for (const rel of [ADOPTION, ADOPTION_MD]) rmSync(join(dir, rel), { force: true });
    assert.ok(!exists(dir, ADOPTION));
    commitAll(dir, CLAIM);
    const r = check(dir);
    for (const id of ['INV-4', 'INV-5']) assertPromiseFindings(r, id);
    assert.equal(check(dir, '--strict').code, 1, show(r));
  });

  test('a promise paragraph whose text the branch also changed is not adopted, even when the record names its new hash', (t) => {
    const dir = adoptionBase(t);
    adopt(dir);
    setKinds(dir);
    const atBase = hashes(dir);
    editFile(dir, SPEC, 'at least one line', 'at least two lines');
    const now = hashes(dir);
    assert.notEqual(now['INV-4'], atBase['INV-4']);
    handRecord(dir, { ...pick(atBase, ALL), 'INV-4': now['INV-4'] });
    commitAll(dir, CLAIM);
    const r = check(dir);
    assertPromiseFindings(r, 'INV-4');
    assertMismatchHint(r, 'INV-4');
    assertClean(r, ['INV-1', 'INV-2', 'INV-3', 'INV-5']);
    assert.equal(check(dir, '--strict').code, 1, show(r));
  });

  test('a promise paragraph edited after adoption, with the record still naming the base hash, gets its findings', (t) => {
    const dir = adoptionBase(t);
    adopt(dir);
    setKinds(dir);
    handRecord(dir, pick(hashes(dir), ALL));
    editFile(dir, SPEC, 'at least one line', 'at least two lines');
    commitAll(dir, CLAIM);
    const r = check(dir);
    assertPromiseFindings(r, 'INV-4');
    assertClean(r, ['INV-1', 'INV-2', 'INV-3', 'INV-5']);
  });

  test('a promise paragraph that is new on the branch and named in the record is not adopted', (t) => {
    const dir = adoptionBase(t);
    write(dir, SPEC, `${UNMARKED}\nA paid invoice MUST NOT change.\n`);
    adopt(dir);
    setKinds(dir, { 'INV-2': 'data', 'INV-4': 'rule', 'INV-5': 'rule', 'INV-6': 'rule' });
    handRecord(dir, pick(hashes(dir), [...ALL, 'INV-6']));
    commitAll(dir, CLAIM);
    const r = check(dir);
    assertPromiseFindings(r, 'INV-6');
    assertMismatchHint(r, 'INV-6');
    assertClean(r, ALL);
  });

  test('control: a spec marked and adopted at the base behaves as before for a normal edit of a promise paragraph', (t) => {
    const dir = project(t);
    writeConfig(dir);
    write(dir, SPEC, UNMARKED);
    commitAll(dir, 'the spec, before IDs');
    adopt(dir);
    setKinds(dir);
    handRecord(dir, pick(hashes(dir), ALL));
    commitAll(dir, CLAIM);
    git(dir, 'checkout', '-q', '-b', 'feature');
    editFile(dir, SPEC, 'at least one line', 'at least two lines');
    commitAll(dir, 'Two lines\n\nTier: 0 — fixes INV-4');
    const r = check(dir);
    assertPromiseFindings(r, 'INV-4');
    assertClean(r, ['INV-1', 'INV-2', 'INV-3', 'INV-5']);
  });
});

describe('the adoption record is only for spec paragraphs', () => {
  test('--add-ids on a change spec (requests/<name>/spec.md) marks it with SP IDs and writes no adoption record; on a specs/ file of the same repo it does', (t) => {
    const dir = project(t);
    const CHANGE = 'requests/totals/spec.md';
    write(dir, CHANGE, '# Totals\n\nAdd a total line.\n\nThe total MUST equal the sum of the lines.\n');
    write(dir, SPEC, UNMARKED);
    commitAll(dir, 'a change spec and a spec, both unmarked');
    const r = ok(dir, ['spec', '--add-ids', CHANGE, '--yes']);
    const marked = read(dir, CHANGE);
    for (const id of ['SP-1', 'SP-2', 'SP-3']) assert.match(marked, new RegExp(`^<!-- ${id}( [^ ]+)* -->$`, 'm'), show(r));
    assert.ok(!exists(dir, ADOPTION), `no adoption record for a change spec:\n${show(r)}`);
    assert.ok(!exists(dir, ADOPTION_MD), `no adoption request.md for a change spec:\n${show(r)}`);
    assert.ok(!outLines(r).some((l) => /adopt/i.test(l) && /\bSP-\d+\b/.test(l)), `no line names an adoption entry:\n${show(r)}`);

    // Control: the same run on the specs/ file writes the record, with INV entries only.
    const s = adopt(dir);
    assert.ok(exists(dir, ADOPTION), show(s));
    assert.deepEqual(dispositions(dir).map((d) => d.spec), ALL, show(s));
  });
});

// --- review of PR #200: one base block covers at most one adopted paragraph.

const CREDIT = 'A credit note MUST have two lines.';
const SALE = 'A sale MUST have one line.';
// INV-1 heading, INV-2 and INV-3 the two rules, in file order.
const twoRules = (a, b) => `# Invoices\n\n${a}\n\n${b}\n`;
const RULES = { 'INV-2': 'rule', 'INV-3': 'rule' };
const hasPromiseFindings = (r, id) => PROMISE_CODES.every((code) => r.findings.some((f) => f.severity === 'not ok' && f.code === code && f.id === id));

// main: the v4 config and the spec with the two rules; then the branch `feature`.
function rulesBase(t, a, b) {
  const dir = project(t);
  writeConfig(dir);
  write(dir, SPEC, twoRules(a, b));
  commitAll(dir, 'the v4 config and the spec, before IDs');
  git(dir, 'checkout', '-q', '-b', 'feature');
  return dir;
}

describe('one base block covers at most one adopted paragraph', () => {
  test('--add-ids: two equal paragraphs in the working tree and that text once at HEAD give one adoption entry, and the other is named not adopted', (t) => {
    const dir = rulesBase(t, CREDIT, SALE);
    write(dir, SPEC, twoRules(SALE, SALE));
    const r = adopt(dir);
    const specs = dispositions(dir).map((d) => d.spec);
    assert.ok(specs.includes('INV-1'), show(r));
    const adopted = ['INV-2', 'INV-3'].filter((id) => specs.includes(id));
    assert.equal(adopted.length, 1, `one of INV-2 and INV-3 is adopted, not ${JSON.stringify(adopted)}:\n${show(r)}`);
    const other = adopted[0] === 'INV-2' ? 'INV-3' : 'INV-2';
    assert.ok(outLines(r).some((l) => new RegExp(`\\b${other}\\b`).test(l) && /not adopted/i.test(l)), `a line names ${other} as not adopted:\n${show(r)}`);
  });

  test('check: a paragraph edited on the branch to equal another adopted text gets signoff-coverage and path-claim not ok, --strict exits 1', (t) => {
    const dir = rulesBase(t, CREDIT, SALE);
    editFile(dir, SPEC, CREDIT, SALE);
    adopt(dir);
    setKinds(dir, RULES);
    commitAll(dir, CLAIM);
    const r = check(dir);
    assert.ok(['INV-2', 'INV-3'].some((id) => hasPromiseFindings(r, id)), `one of the two equal rules gets its not ok findings:\n${show(r)}`);
    assertClean(r, ['INV-1']);
    assert.equal(check(dir, '--strict').code, 1, show(r));
  });

  test('check: the same, when the adoption record names both equal paragraphs with the same hash', (t) => {
    const dir = rulesBase(t, CREDIT, SALE);
    editFile(dir, SPEC, CREDIT, SALE);
    adopt(dir);
    setKinds(dir, RULES);
    const h = hashes(dir);
    assert.equal(h['INV-2'], h['INV-3'], 'the two paragraphs have equal text');
    handRecord(dir, pick(h, ['INV-1', 'INV-2', 'INV-3']));
    commitAll(dir, CLAIM);
    const r = check(dir);
    assert.ok(['INV-2', 'INV-3'].some((id) => hasPromiseFindings(r, id)), `one of the two equal rules gets its not ok findings:\n${show(r)}`);
    assertClean(r, ['INV-1']);
    assert.equal(check(dir, '--strict').code, 1, show(r));
  });

  test('control: two equal paragraphs that were two equal blocks at the base are both adopted, with no not ok', (t) => {
    const dir = rulesBase(t, SALE, SALE);
    const r = adopt(dir);
    assert.deepEqual(dispositions(dir).map((d) => d.spec), ['INV-1', 'INV-2', 'INV-3'], show(r));
    setKinds(dir, RULES);
    commitAll(dir, CLAIM);
    const c = check(dir);
    assertClean(c, ['INV-1', 'INV-2', 'INV-3']);
  });
});

// --- review of PR #200: a refusal writes nothing.

describe('an adoption record that does not parse makes --add-ids refuse, and write nothing', () => {
  const BAD = {
    'not valid YAML': 'schema: assuredloop/1\ndispositions: [\n  - {source: adoption\n',
    'not a map': '- source: adoption\n  spec: INV-9\n',
  };
  for (const [what, text] of Object.entries(BAD)) {
    test(`a record that is ${what}: exit 2, an al: line, no file changes; after a repair the same command marks and writes the entries`, (t) => {
      const dir = project(t);
      write(dir, SPEC, UNMARKED);
      write(dir, ADOPTION, text);
      commitAll(dir, `the spec, and an adoption record that is ${what}`);
      const head = git(dir, 'rev-parse', 'HEAD');
      refused(dir, ['spec', '--add-ids', SPEC, '--prefix', 'INV', '--yes']);
      assert.equal(read(dir, SPEC), UNMARKED);
      assert.equal(read(dir, ADOPTION), text);
      assert.ok(!exists(dir, ADOPTION_MD));
      assert.ok(!exists(dir, '.assuredloop/config.yaml'));
      assert.ok(!exists(dir, '.assuredloop/schema.yaml'));

      writeYaml(dir, ADOPTION, { schema: 'assuredloop/1', request: 'adoption', status: 'concluded', dispositions: [] });
      const r = adopt(dir);
      assert.match(read(dir, SPEC), /^<!-- INV-5 -->$/m, show(r));
      const h = hashes(dir);
      assert.deepEqual(dispositions(dir), ALL.map((id) => entry(id, head, h[id])), show(r));
    });
  }
});

// --- review of PR #200 (head 586ad34): a base block whose ID still exists at
// the head belongs to that ID; only the other base blocks can stand for a new
// paragraph.

const RULE_TEXT = 'An invoice MUST have at least one line.';
const MARKED_SPEC = `<!-- INV-1 note -->\n\n# Invoices\n\n<!-- INV-2 rule -->\n\n${RULE_TEXT}\n`;

// main: the v4 config, the marked spec, and an adoption record that names
// INV-1 and INV-2 with their hashes, all committed. Then the branch `feature`.
function adoptedMarkedBase(t) {
  const dir = project(t);
  writeConfig(dir);
  write(dir, SPEC, MARKED_SPEC);
  commitAll(dir, 'the v4 config and the marked spec');
  handRecord(dir, pick(hashes(dir), ['INV-1', 'INV-2']));
  commitAll(dir, 'the adoption record');
  git(dir, 'checkout', '-q', '-b', 'feature');
  return dir;
}

// Adds an entry for id with the HEAD commit, by hand; the other entries stay.
function addEntry(dir, id, hash) {
  const rec = readYaml(dir, ADOPTION);
  rec.dispositions.push(entry(id, git(dir, 'rev-parse', 'HEAD'), hash));
  writeYaml(dir, ADOPTION, rec);
}

const COPY_BEFORE = `<!-- INV-1 note -->\n\n# Invoices\n\n${RULE_TEXT}\n\n<!-- INV-2 rule -->\n\n${RULE_TEXT}\n`;
const COPY_AFTER = `${MARKED_SPEC}\n${RULE_TEXT}\n`;

describe('a copy of a kept paragraph is not adopted', () => {
  for (const [where, text, copyMarked] of [
    ['before', COPY_BEFORE, `<!-- INV-3 -->\n\n${RULE_TEXT}\n\n<!-- INV-2 rule -->`],
    ['after (control)', COPY_AFTER, `<!-- INV-2 rule -->\n\n${RULE_TEXT}\n\n<!-- INV-3 -->\n\n${RULE_TEXT}\n`],
  ]) {
    test(`--add-ids: an unmarked copy of INV-2's text ${where} INV-2 gets INV-3, no entry, and a not adopted line; INV-2's entry stays`, (t) => {
      const dir = adoptedMarkedBase(t);
      const before = dispositions(dir);
      write(dir, SPEC, text);
      const r = adopt(dir);
      assert.ok(read(dir, SPEC).includes(copyMarked), `the copy is INV-3:\n${read(dir, SPEC)}`);
      const now = dispositions(dir);
      assert.deepEqual(now.slice(0, before.length), before, show(r));
      assert.deepEqual(now.filter((d) => d.spec === 'INV-3'), [], show(r));
      assert.ok(outLines(r).some((l) => /\bINV-3\b/.test(l) && /not adopted/i.test(l)), `a line names INV-3 as not adopted:\n${show(r)}`);
    });

    for (const named of [false, true]) {
      test(`check: the copy ${where} INV-2, as rule INV-3${named ? ', named by hand in the adoption record with its hash,' : ''} gets signoff-coverage and path-claim not ok, --strict exits 1; INV-2 has no not ok`, (t) => {
        const dir = adoptedMarkedBase(t);
        write(dir, SPEC, text);
        adopt(dir);
        setKinds(dir, { 'INV-3': 'rule' });
        if (named) addEntry(dir, 'INV-3', hashes(dir)['INV-3']);
        commitAll(dir, CLAIM);
        const r = check(dir);
        assertPromiseFindings(r, 'INV-3');
        assert.deepEqual(notOk(r, 'INV-2'), [], `no not ok for INV-2:\n${show(r)}`);
        assert.equal(check(dir, '--strict').code, 1, show(r));
      });
    }
  }
});

// --- review of b7242a5 on PR #200: a base block whose ID still exists
// anywhere in the spec scope at the head (any spec file) belongs to that ID.
// (An import may stand anywhere at the top level of a module; it is here to
// leave the lines above unchanged.)
import { appendSection, newRequest, organized, req } from './helpers/project.js';

const OTHER = 'specs/other.md';
const LINKED_MARKER = '<!-- INV-2 rule serves:inv/R1 -->';
const HEADING_ONLY = '<!-- INV-1 note -->\n\n# Invoices\n';

// main: the v4 config, the signed request inv with R1, and specs/invoices.md
// with the rule INV-2 that serves inv/R1, indexed and committed. No adoption
// record: INV-2 has its link. Then the branch `feature`.
function linkedBase(t) {
  const dir = project(t);
  writeConfig(dir);
  newRequest(dir, 'inv');
  appendSection(dir, 'inv', organized([req('R1', 'Invoice lines', RULE_TEXT)]));
  ok(dir, ['record', 'inv', 'signoff', '--source', 'email from the owner', '--yes']);
  write(dir, SPEC, `${HEADING_ONLY}\n${LINKED_MARKER}\n\n${RULE_TEXT}\n`);
  index(dir);
  commitAll(dir, 'the signed request inv and the spec with INV-2');
  git(dir, 'checkout', '-q', '-b', 'feature');
  return dir;
}

// The move of INV-2, with its marker and links, into specs/other.md;
// with copy, an unmarked copy of its text stays in specs/invoices.md.
function moveInv2(dir, { copy }) {
  write(dir, OTHER, `${LINKED_MARKER}\n\n${RULE_TEXT}\n`);
  write(dir, SPEC, copy ? `${HEADING_ONLY}\n${RULE_TEXT}\n` : HEADING_ONLY);
}

// Names id in the adoption record by hand with the HEAD commit, and makes the
// record (and its request.md) when there is none.
function nameByHand(dir, id, hash) {
  const rec = exists(dir, ADOPTION) ? readYaml(dir, ADOPTION)
    : { schema: 'assuredloop/1', request: 'adoption', status: 'concluded', dispositions: [] };
  rec.dispositions = [...(rec.dispositions ?? []), entry(id, git(dir, 'rev-parse', 'HEAD'), hash)];
  writeYaml(dir, ADOPTION, rec);
  if (!exists(dir, ADOPTION_MD)) write(dir, ADOPTION_MD, '# Adoption\n\nThe paragraphs as adopted.\n');
}

describe('a copy of a paragraph that moved to another spec file is not adopted', () => {
  test('--add-ids: INV-2 moves to specs/other.md and a copy of its text stays: the copy gets INV-3, no entry, and a not adopted line', (t) => {
    const dir = linkedBase(t);
    moveInv2(dir, { copy: true });
    const r = adopt(dir);
    assert.ok(read(dir, SPEC).includes(`<!-- INV-3 -->\n\n${RULE_TEXT}\n`), `the copy is INV-3:\n${read(dir, SPEC)}`);
    if (exists(dir, ADOPTION)) assert.deepEqual((dispositions(dir) ?? []).filter((d) => d.spec === 'INV-3'), [], show(r));
    assert.ok(outLines(r).some((l) => /\bINV-3\b/.test(l) && /not adopted/i.test(l)), `a line names INV-3 as not adopted:\n${show(r)}`);
  });

  for (const named of [false, true]) {
    test(`check: the copy as rule INV-3${named ? ', named by hand in the adoption record with its hash,' : ''} gets signoff-coverage and path-claim not ok, --strict exits 1`, (t) => {
      const dir = linkedBase(t);
      moveInv2(dir, { copy: true });
      adopt(dir);
      setKinds(dir, { 'INV-3': 'rule' });
      if (named) nameByHand(dir, 'INV-3', hashes(dir)['INV-3']);
      commitAll(dir, CLAIM);
      const r = check(dir);
      assertPromiseFindings(r, 'INV-3');
      assert.equal(check(dir, '--strict').code, 1, show(r));
    });
  }

  test('control: the move of INV-2 to specs/other.md alone gives no not ok for INV-2', (t) => {
    const dir = linkedBase(t);
    moveInv2(dir, { copy: false });
    commitAll(dir, 'Move INV-2\n\nTier: 0 — moves INV-2 to specs/other.md; no promise changes');
    const r = check(dir);
    assert.deepEqual(notOk(r, 'INV-2'), [], `no not ok for INV-2:\n${show(r)}`);
  });
});

// --- review of b7242a5 on PR #200: a valid prefix that looks like a temporary name.

describe('any valid prefix gets its adoption entries', () => {
  for (const prefix of ['UNMARKED', 'INV']) {
    test(`--add-ids --prefix ${prefix}${prefix === 'INV' ? ' (control)' : ''} marks the heading and the rule and writes an adoption entry for each`, (t) => {
      const dir = project(t);
      const file = 'specs/plain.md';
      write(dir, file, `# Plain\n\n${RULE_TEXT}\n`);
      const head = commitAll(dir, 'an unmarked file');
      const r = ok(dir, ['spec', '--add-ids', file, '--prefix', prefix, '--yes']);
      const marked = read(dir, file);
      assert.ok(marked.includes(`<!-- ${prefix}-1 note -->\n\n# Plain\n`), `${marked}\n${show(r)}`);
      assert.ok(marked.includes(`<!-- ${prefix}-2 -->\n\n${RULE_TEXT}\n`), `${marked}\n${show(r)}`);
      const h = hashes(dir, file);
      assert.deepEqual(dispositions(dir), [`${prefix}-1`, `${prefix}-2`].map((id) => entry(id, head, h[id])), show(r));
    });
  }
});
