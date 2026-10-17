// #238: the findings of al check are hints for the review, except a few
// exact rules that block (requests/hints-and-blocks/request.md, R1 to R5 and
// the architect's decisions D1 to D8).
//
// - R1: a rewritten ADR is a hint with one fixed message; al index --align
//   clears stale-base on bindings to a rewritten superseded ADR.
// - R2: each finding has one severity in every mode; --strict sets only the
//   exit code. Only signoff-coverage, unsigned-requirement, record-evidence,
//   superseded-cited, superseded-status, record-unreadable and spec-root are
//   not ok.
// - R3: not ok unsigned-requirement, from the request records.
// - R4: not ok record-evidence, from the request records.
// - R5: not ok superseded-cited and superseded-status, from the ADRs.
//
// The R3 and R4 records here are written by hand as fixture data, with the
// hashes computed in this file (the architect's rule: no new calls of
// `al record ... signoff`). Other states are invoicer worlds, or throwaway
// repos built here.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { stringify } from 'yaml';
import { check, invoicer, keys } from './helpers/invoicer.js';
import {
  commitAll, doc, editFile, git, move, newRequest, ok, organized, project, read, recordPath, req, sha, show, signedText,
  write, writeConfig,
} from './helpers/project.js';

// The blocking codes (R2, D2) and the not ok lines of a run.
const BLOCKING = ['signoff-coverage', 'unsigned-requirement', 'record-evidence', 'superseded-cited', 'superseded-status', 'record-unreadable', 'spec-root'];
const notOk = (r) => r.findings.filter((f) => f.severity === 'not ok');
const notOkKeys = (r) => keys(notOk(r));
const coded = (r, code) => r.findings.filter((f) => f.code === code);
const onlyNotOk = (r, expected) => assert.deepEqual(notOkKeys(r), [...expected].sort(), show(r));

// Plain exit 0; --strict exit 1 exactly when a not ok prints; the same
// findings, with the same severities, in both modes.
function both(dir) {
  const plain = check(dir);
  const strict = check(dir, '--strict');
  assert.equal(plain.code, 0, show(plain));
  assert.deepEqual(keys(strict.findings), keys(plain.findings), `the same findings and severities in both modes:\n${show(plain)}\n${show(strict)}`);
  assert.equal(strict.code, notOk(strict).length ? 1 : 0, show(strict));
  return plain;
}

// =====================================================================
// R3 and R4: a request `inv` written by hand.

const NAME = 'inv';
const WORDS = '2026-05-04-owner-words.md';
const SIGNOFF = '2026-05-05-signoff.md';
const OWNER_TEXT = 'every invoice needs at least one line.\nsay it plainly.\n';
const R1 = req('R1', 'One line at least', 'An invoice MUST have at least one line.');
const R1_OLD = req('R1', 'One line at least', 'An invoice SHOULD have a line.');
const R2 = req('R2', 'A total', 'An invoice MUST show its total.');
const SECTION = organized([R1]);
const SIGNED = signedText(SECTION);

// A snapshot: header lines, the separator line, the text (as al new and al record write it).
const snapshot = (header, separator, text) => `${header.join('\n')}\n${separator}\n${text}`;
const wordsSnapshot = (text = OWNER_TEXT, header = ['Source: email from the owner', 'Fetched: 2026-05-04T09:30Z']) =>
  snapshot([...header, `SHA-256: ${sha(text)}`], '---', text);
const signoffSnapshot = (text = SIGNED, header = ['Source: email from the owner', "Owner's words: yes, R1 as written", 'Fetched: 2026-05-05T09:30Z']) =>
  snapshot([...header, `SHA-256: ${sha(text)}   (of the signed text below)`], '--- signed text ---', text);

const requestMd = (section = SECTION) => `# Inv
Tier: 1 · Status: open

## Owner's words and dialog

- 2026-05-04 the owner's words, snapshot origin/${WORDS}

${section}`;

const S1 = () => ({
  id: 'S1', file: SIGNOFF, sha256: sha(SIGNED), signed: '2026-05-05T09:30Z', source: 'email from the owner',
  words: 'yes, R1 as written', covers: [{ id: 'R1', version: 1, sha256: R1.sha256 }],
});
// A record that R3 and R4 accept: R1 version 1 signed in S1, both snapshots intact.
const goodRecord = (change = () => {}) => {
  const rec = {
    schema: 'assuredloop/1', request: NAME, tier: '1', status: 'open',
    sources: [{ file: WORDS, kind: 'owner-words', sha256: sha(OWNER_TEXT), taken: '2026-05-04T09:30Z' }],
    requirements: [{ id: 'R1', version: 1, sha256: R1.sha256, title: R1.title }],
    signoff: [S1()],
    decisions: [], tasks: [], bindings: [], dispositions: [],
  };
  change(rec);
  return rec;
};

// main: the config and a spec with no request; the branch `feature`: the
// request inv with its snapshots and its record, committed. `place` is the
// request folder; `files` maps a path in it to text; `yaml` is the record's
// text (else stringify(record)).
function signedWorld(t, { record = goodRecord(), yaml, md = requestMd(), files = {}, archived = false, words = wordsSnapshot(), signoff = signoffSnapshot() } = {}) {
  const dir = project(t);
  writeConfig(dir);
  write(dir, 'specs/invoices.md', doc([['INV-1 note', '# Invoices'], ['INV-2 rule', 'An invoice MUST have at least one line.']]));
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  const place = archived ? `requests/archive/${NAME}` : `requests/${NAME}`;
  write(dir, `${place}/request.md`, md);
  if (words !== null) write(dir, `${place}/origin/${WORDS}`, words);
  if (signoff !== null) write(dir, `${place}/origin/${SIGNOFF}`, signoff);
  for (const [rel, text] of Object.entries(files)) write(dir, `${place}/${rel}`, text);
  write(dir, recordPath(NAME), yaml ?? stringify(archived ? { ...record, status: 'concluded' } : record));
  commitAll(dir, `Request ${NAME}\n\nTier: 1 — ${NAME}`);
  return dir;
}

const unsignedIds = (r) => notOk(r).filter((f) => f.code === 'unsigned-requirement').map((f) => f.id);
// Some not ok unsigned-requirement line names one of ids, and every not ok line has one of codes.
function unsignedAmong(r, ids, codes = ['unsigned-requirement']) {
  assert.ok(unsignedIds(r).some((id) => ids.includes(id)), `a not ok unsigned-requirement on one of ${ids.join(', ')}:\n${show(r)}`);
  assert.deepEqual(notOk(r).filter((f) => !codes.includes(f.code)).map((f) => f.line), [], `no not ok but ${codes.join(', ')}:\n${show(r)}`);
}
const inRequest = (id) => id === NAME || id.startsWith(`${NAME}/`);

describe('R3: an unsigned requirement version is not ok unsigned-requirement', () => {
  test('control: R1 version 1 covered by a valid S1: no not ok; plain and --strict exit 0', (t) => {
    const r = both(signedWorld(t));
    onlyNotOk(r, []);
    assert.deepEqual(coded(r, 'unsigned-requirement'), [], show(r));
    assert.deepEqual(coded(r, 'record-evidence'), [], show(r));
    assert.equal(check(signedWorld(t), '--strict').code, 0);
  });

  test('no sign-off at all: not ok unsigned-requirement inv/R1, and only that; plain exits 0, --strict exits 1', (t) => {
    const dir = signedWorld(t, { record: goodRecord((rec) => { rec.signoff = []; }) });
    const r = both(dir);
    onlyNotOk(r, ['not ok unsigned-requirement inv/R1']);
    assert.equal(check(dir, '--strict').code, 1);
  });

  test('the covers entry names version 2 of R1, whose latest version is 1: not ok on inv/R1', (t) => {
    const r = both(signedWorld(t, { record: goodRecord((rec) => { rec.signoff[0].covers[0].version = 2; }) }));
    onlyNotOk(r, ['not ok unsigned-requirement inv/R1']);
  });

  test('the covers entry names R2 instead of R1: not ok on inv/R1', (t) => {
    const r = both(signedWorld(t, { record: goodRecord((rec) => { rec.signoff[0].covers[0].id = 'R2'; }) }));
    assert.ok(unsignedIds(r).includes('inv/R1'), show(r));
  });

  test('the covers sha256 is the right hash in upper case: no case folding, not ok on inv/R1', (t) => {
    const r = both(signedWorld(t, { record: goodRecord((rec) => { rec.signoff[0].covers[0].sha256 = R1.sha256.toUpperCase(); }) }));
    onlyNotOk(r, ['not ok unsigned-requirement inv/R1']);
  });

  test('the covers sha256 is another text\'s hash: not ok on inv/R1', (t) => {
    const r = both(signedWorld(t, { record: goodRecord((rec) => { rec.signoff[0].covers[0].sha256 = R1_OLD.sha256; }) }));
    onlyNotOk(r, ['not ok unsigned-requirement inv/R1']);
  });

  // R1 has versions 1 (R1_OLD) and 2 (R1, the text in request.md).
  const twoVersions = (order, covered) => goodRecord((rec) => {
    const v1 = { id: 'R1', version: 1, sha256: R1_OLD.sha256, title: R1.title };
    const v2 = { id: 'R1', version: 2, sha256: R1.sha256, title: R1.title };
    rec.requirements = order === 'v1 first' ? [v1, v2] : [v2, v1];
    rec.signoff[0].covers = [covered === 1 ? { id: 'R1', version: 1, sha256: R1_OLD.sha256 } : { id: 'R1', version: 2, sha256: R1.sha256 }];
  });

  test('the latest version is the highest: a sign-off of version 1 only, with version 2 recorded, is not ok on inv/R1, in either entry order', (t) => {
    for (const order of ['v1 first', 'v2 first']) {
      const r = both(signedWorld(t, { record: twoVersions(order, 1) }));
      onlyNotOk(r, ['not ok unsigned-requirement inv/R1']);
    }
  });

  test('control: a sign-off of version 2, the highest, is valid in either entry order', (t) => {
    for (const order of ['v1 first', 'v2 first']) {
      onlyNotOk(both(signedWorld(t, { record: twoVersions(order, 2) })), []);
    }
  });

  test('control: the sign-off file written as origin/<file> is valid', (t) => {
    const r = both(signedWorld(t, { record: goodRecord((rec) => { rec.signoff[0].file = `origin/${SIGNOFF}`; }) }));
    onlyNotOk(r, []);
  });

  for (const [what, file, files] of [
    ['in the request folder, outside origin/ (../<file>)', `../${SIGNOFF}`, { [SIGNOFF]: signoffSnapshot() }],
    ['in a folder under origin/ (sub/<file>)', `sub/${SIGNOFF}`, { [`origin/sub/${SIGNOFF}`]: signoffSnapshot() }],
    ['named through .. though it reaches origin/<file> (../origin/<file>)', `../origin/${SIGNOFF}`, {}],
    ['that does not exist', '2026-05-06-signoff.md', {}],
  ]) {
    test(`a sign-off file ${what}: the sign-off is not valid, not ok unsigned-requirement`, (t) => {
      const r = both(signedWorld(t, { files, record: goodRecord((rec) => { rec.signoff[0].file = file; }) }));
      unsignedAmong(r, ['inv/R1', 'inv/S1'], ['unsigned-requirement', 'record-evidence']);
    });
  }

  test('the sign-off file\'s signed text changed: not ok unsigned-requirement, and not ok record-evidence on the file (R4)', (t) => {
    const changed = signoffSnapshot().replace('An invoice MUST have at least one line.', 'An invoice MUST have at least two lines.');
    const r = both(signedWorld(t, { signoff: changed }));
    unsignedAmong(r, ['inv/R1', 'inv/S1'], ['unsigned-requirement', 'record-evidence']);
    assert.ok(notOkKeys(r).includes(`not ok record-evidence inv/${SIGNOFF}`), show(r));
  });

  test('control: only the sign-off file\'s header changed (Source and Fetched lines): no not ok', (t) => {
    const header = ['Source: a call with the owner', "Owner's words: yes, R1 as written", 'Fetched: 2026-05-06T10:00Z'];
    onlyNotOk(both(signedWorld(t, { signoff: signoffSnapshot(SIGNED, header) })), []);
  });

  for (const [what, change] of [
    ['no signed time', (s) => { delete s.signed; }],
    ['no words', (s) => { delete s.words; }],
    ['empty words', (s) => { s.words = ''; }],
  ]) {
    test(`a sign-off with ${what}: not valid, not ok unsigned-requirement`, (t) => {
      const r = both(signedWorld(t, { record: goodRecord((rec) => change(rec.signoff[0])) }));
      unsignedAmong(r, ['inv/R1', 'inv/S1']);
    });
  }

  // An entry that cannot be read is not ok, never skipped: each one is added
  // beside the valid R1 version 1 and S1, so a check that skips it finds nothing.
  for (const [what, entry] of [
    ['a version 0', { id: 'R1', version: 0, sha256: R1.sha256 }],
    ['a version -1', { id: 'R1', version: -1, sha256: R1.sha256 }],
    ['a version 1.5', { id: 'R1', version: 1.5, sha256: R1.sha256 }],
    ['a version that is a word', { id: 'R1', version: 'one', sha256: R1.sha256 }],
    ['no version', { id: 'R1', sha256: R1.sha256 }],
    ['no sha256', { id: 'R1', version: 3 }],
  ]) {
    test(`a requirement entry of R1 with ${what} cannot be read: not ok unsigned-requirement inv/R1`, (t) => {
      const r = both(signedWorld(t, { record: goodRecord((rec) => { rec.requirements.push(entry); }) }));
      unsignedAmong(r, ['inv/R1']);
    });
  }

  for (const [what, entry] of [
    ['with no id', { version: 1, sha256: R1.sha256 }],
    ['that is not a mapping', 'R1 version 1'],
  ]) {
    test(`a requirement entry ${what} cannot be read: not ok unsigned-requirement`, (t) => {
      const r = both(signedWorld(t, { record: goodRecord((rec) => { rec.requirements.push(entry); }) }));
      assert.ok(unsignedIds(r).some(inRequest), `a not ok unsigned-requirement in ${NAME}:\n${show(r)}`);
      assert.deepEqual(notOk(r).filter((f) => f.code !== 'unsigned-requirement').map((f) => f.line), [], show(r));
    });
  }

  // A second sign-off S2 beside the valid S1.
  for (const [what, change] of [
    ['no file', (s) => { delete s.file; }],
    ['no sha256', (s) => { delete s.sha256; }],
    ['no covers', (s) => { delete s.covers; }],
    ['covers that is not a list', (s) => { s.covers = 'R1'; }],
    ['a covers entry with no version', (s) => { s.covers = [{ id: 'R1', sha256: R1.sha256 }]; }],
    ['a covers entry with no sha256', (s) => { s.covers = [{ id: 'R1', version: 1 }]; }],
    ['a covers entry with no id', (s) => { s.covers = [{ version: 1, sha256: R1.sha256 }]; }],
  ]) {
    test(`a sign-off entry S2 with ${what} cannot be read: not ok unsigned-requirement inv/S2`, (t) => {
      const record = goodRecord((rec) => {
        const s2 = { ...S1(), id: 'S2', covers: [{ id: 'R1', version: 1, sha256: R1.sha256 }] };
        change(s2);
        rec.signoff.push(s2);
      });
      const r = both(signedWorld(t, { record }));
      unsignedAmong(r, ['inv/S2'], ['unsigned-requirement', 'record-evidence']);
    });
  }

  test('a sign-off entry that is not a mapping cannot be read: not ok unsigned-requirement', (t) => {
    const r = both(signedWorld(t, { record: goodRecord((rec) => { rec.signoff.push('S2 signed'); }) }));
    assert.ok(unsignedIds(r).some(inRequest), show(r));
  });

  // request.md and the record.
  test('R1 edited in request.md after the sign-off, before al index: its text is no recorded version, not ok on inv/R1', (t) => {
    const dir = signedWorld(t);
    editFile(dir, `requests/${NAME}/request.md`, 'MUST have at least one line.', 'MUST have at least two lines.');
    onlyNotOk(both(dir), ['not ok unsigned-requirement inv/R1']);
  });

  test('R1 edited in request.md after the sign-off, then al index: the new version 2 is not signed, not ok on inv/R1', (t) => {
    const dir = signedWorld(t);
    editFile(dir, `requests/${NAME}/request.md`, 'MUST have at least one line.', 'MUST have at least two lines.');
    ok(dir, ['index']);
    onlyNotOk(both(dir), ['not ok unsigned-requirement inv/R1']);
  });

  test('control: al index with request.md unchanged keeps R1 signed: no not ok', (t) => {
    const dir = signedWorld(t);
    ok(dir, ['index']);
    onlyNotOk(both(dir), []);
  });

  test('R2 written in request.md with no recorded version: not ok on inv/R2, before and after al index; R1 stays signed', (t) => {
    const dir = signedWorld(t, { md: requestMd(organized([R1, R2])) });
    onlyNotOk(both(dir), ['not ok unsigned-requirement inv/R2']);
    ok(dir, ['index']);
    onlyNotOk(both(dir), ['not ok unsigned-requirement inv/R2']);
  });

  test('an archived request: no sign-off is not ok on inv/R1 (control: the signed archived request has no not ok)', (t) => {
    onlyNotOk(both(signedWorld(t, { archived: true })), []);
    const r = both(signedWorld(t, { archived: true, record: goodRecord((rec) => { rec.signoff = []; }) }));
    onlyNotOk(r, ['not ok unsigned-requirement inv/R1']);
  });

  // The layout does not count: block mappings with 2 or 4 spaces, sequences
  // not indented, and flow mappings give the same result.
  const LAYOUTS = {
    'block, 2 spaces': (rec) => stringify(rec),
    'block, 4 spaces': (rec) => stringify(rec, { indent: 4 }),
    'block, sequences not indented': (rec) => stringify(rec, { indentSeq: false }),
    flow: (rec) => stringify(rec, { collectionStyle: 'flow' }),
  };

  test('the same valid record in four YAML layouts: no not ok in each', (t) => {
    const texts = Object.values(LAYOUTS).map((f) => f(goodRecord()));
    assert.equal(new Set(texts).size, texts.length, 'four different texts');
    for (const [name, f] of Object.entries(LAYOUTS)) {
      const r = both(signedWorld(t, { yaml: f(goodRecord()) }));
      assert.deepEqual(notOkKeys(r), [], `${name}:\n${show(r)}`);
    }
  });

  test('the same record with an upper-case covers hash in four YAML layouts: the same not ok on inv/R1 in each', (t) => {
    const bad = goodRecord((rec) => { rec.signoff[0].covers[0].sha256 = R1.sha256.toUpperCase(); });
    for (const [name, f] of Object.entries(LAYOUTS)) {
      const r = both(signedWorld(t, { yaml: f(bad) }));
      assert.deepEqual(notOkKeys(r), ['not ok unsigned-requirement inv/R1'], `${name}:\n${show(r)}`);
    }
  });

  test('the same record with no sign-off words in four YAML layouts: the same findings in each', (t) => {
    const bad = goodRecord((rec) => { delete rec.signoff[0].words; });
    const seen = Object.entries(LAYOUTS).map(([name, f]) => [name, notOkKeys(both(signedWorld(t, { yaml: f(bad) })))]);
    assert.ok(seen[0][1].length > 0, JSON.stringify(seen));
    for (const [name, k] of seen) assert.deepEqual(k, seen[0][1], `${name} as ${seen[0][0]}`);
  });

  test('a record that is not YAML: not ok record-unreadable inv', (t) => {
    const r = both(signedWorld(t, { yaml: 'request: inv\nrequirements: [ {id: R1\n  - : :\n' }));
    assert.ok(notOkKeys(r).includes(`not ok record-unreadable ${NAME}`), show(r));
  });

  test('a record that is YAML but not a mapping: not ok record-unreadable inv', (t) => {
    const r = both(signedWorld(t, { yaml: '- request: inv\n- requirements: []\n' }));
    assert.ok(notOkKeys(r).includes(`not ok record-unreadable ${NAME}`), show(r));
  });
});

describe('R4: changed record evidence is not ok record-evidence', () => {
  test('the owner\'s words snapshot changed after its --- line: not ok record-evidence inv/<file>, and only that', (t) => {
    const r = both(signedWorld(t, { words: wordsSnapshot().replace('say it plainly.', 'say it loudly.') }));
    onlyNotOk(r, [`not ok record-evidence inv/${WORDS}`]);
  });

  test('control: only the header of the owner\'s words snapshot changed: no not ok (the text after --- is what is hashed)', (t) => {
    const header = ['Source: a chat with the owner', 'Fetched: 2026-05-07T08:00Z'];
    onlyNotOk(both(signedWorld(t, { words: wordsSnapshot(OWNER_TEXT, header) })), []);
  });

  test('the owner\'s words snapshot is missing: not ok record-evidence inv/<file>', (t) => {
    onlyNotOk(both(signedWorld(t, { words: null })), [`not ok record-evidence inv/${WORDS}`]);
  });

  test('a sources entry with no sha256: not ok record-evidence inv/<file>', (t) => {
    const r = both(signedWorld(t, { record: goodRecord((rec) => { delete rec.sources[0].sha256; }) }));
    onlyNotOk(r, [`not ok record-evidence inv/${WORDS}`]);
  });

  test('a sources entry with no file: not ok record-evidence', (t) => {
    const r = both(signedWorld(t, { record: goodRecord((rec) => { delete rec.sources[0].file; }) }));
    assert.ok(notOk(r).some((f) => f.code === 'record-evidence' && inRequest(f.id)), show(r));
    assert.deepEqual(notOk(r).filter((f) => f.code !== 'record-evidence').map((f) => f.line), [], show(r));
  });

  test('the sign-off file, written as origin/<file>, changed: the finding names the file as written', (t) => {
    const changed = signoffSnapshot().replace('An invoice MUST have at least one line.', 'An invoice MUST have at least two lines.');
    const r = both(signedWorld(t, { signoff: changed, record: goodRecord((rec) => { rec.signoff[0].file = `origin/${SIGNOFF}`; }) }));
    assert.ok(notOkKeys(r).includes(`not ok record-evidence inv/origin/${SIGNOFF}`), show(r));
  });

  test('the sign-off file is missing: not ok record-evidence inv/<file>', (t) => {
    const r = both(signedWorld(t, { signoff: null }));
    assert.ok(notOkKeys(r).includes(`not ok record-evidence inv/${SIGNOFF}`), show(r));
  });

  // The hash is of the bytes after the FIRST line that is ---.
  const TWO_PARTS = 'first part.\n---\nsecond part.\n';
  test('owner\'s words whose text holds a later --- line: hashed after the first --- line, no not ok', (t) => {
    const r = both(signedWorld(t, { words: wordsSnapshot(TWO_PARTS), record: goodRecord((rec) => { rec.sources[0].sha256 = sha(TWO_PARTS); }) }));
    onlyNotOk(r, []);
  });

  test('control: the same file with the record hash of the text after the later --- line: not ok record-evidence', (t) => {
    const r = both(signedWorld(t, { words: wordsSnapshot(TWO_PARTS), record: goodRecord((rec) => { rec.sources[0].sha256 = sha('second part.\n'); }) }));
    onlyNotOk(r, [`not ok record-evidence inv/${WORDS}`]);
  });

  test('an archived request with a changed origin file: not ok record-evidence (control: unchanged, no not ok)', (t) => {
    onlyNotOk(both(signedWorld(t, { archived: true })), []);
    const r = both(signedWorld(t, { archived: true, words: wordsSnapshot().replace('say it plainly.', 'say it loudly.') }));
    onlyNotOk(r, [`not ok record-evidence inv/${WORDS}`]);
  });

  test('a result whose declared input changed is not record evidence: d05 keeps the info result line and has no record-evidence', (t) => {
    const r = both(invoicer(t, 'd05', 'defect'));
    assert.ok(r.findings.some((f) => f.code === 'result' && f.severity === 'info' && f.msg.includes('does not apply to the current text')), show(r));
    assert.deepEqual(coded(r, 'record-evidence'), [], show(r));
  });
});

describe('R3 and R4 in the invoicer world (records written by al record)', () => {
  test('the base world: no unsigned-requirement, record-evidence, superseded-cited or superseded-status, and no not ok at all', (t) => {
    const r = both(invoicer(t, 'clean'));
    onlyNotOk(r, []);
    for (const code of ['unsigned-requirement', 'record-evidence', 'superseded-cited', 'superseded-status', 'record-unreadable']) {
      assert.deepEqual(coded(r, code), [], show(r));
    }
  });

  test('spike-q2: Q1 changed after its sign-off and nobody signed the new version: not ok unsigned-requirement link-expiry-spike/Q1', (t) => {
    const r = both(invoicer(t, 'spike-q2'));
    assert.ok(notOkKeys(r).includes('not ok unsigned-requirement link-expiry-spike/Q1'), show(r));
  });

  test('control: cr-45, where R2 version 2 is signed: no unsigned-requirement on invoice-exports/R2', (t) => {
    const r = both(invoicer(t, 'cr-45'));
    assert.deepEqual(coded(r, 'unsigned-requirement'), [], show(r));
  });

  test('conclude-unsigned: late-fees/R1 is not signed: not ok unsigned-requirement beside the existing signoff-coverage lines', (t) => {
    const r = both(invoicer(t, 'conclude-unsigned'));
    onlyNotOk(r, ['not ok signoff-coverage EXP-9', 'not ok signoff-coverage late-fees/SP-2', 'not ok unsigned-requirement late-fees/R1']);
  });
});

// =====================================================================
// R5: citations of a superseded ADR, and the status line.
//
// main: ADR-1 superseded by ADR-2, superseded by ADR-3 (accepted): a chain.
// ADR-4 accepted, with a History section; ADR-5 proposed; ADR-6 superseded by
// ADR-7 (accepted). The spec INV-2 is governed by ADR-3. The open request
// inv names ADR-1 only in its Decisions section and in origin/; the archived
// request old names ADR-1. Nothing in it breaks R5.

const SPEC = 'specs/invoices.md';
const INV2_MARKER = '<!-- INV-2 rule governed-by:ADR-3 -->';
const INV3_TEXT = 'Invoices are sent by email.';
const adr = (status, marker, heading, paras, tail = '') => `Status: ${status}\n\n${doc([[marker, heading], ...paras])}${tail}`;
const ADRS = {
  'specs/adr/0001-paper.md': adr('superseded by ADR-2', 'ADR-1 choice decides:INV-2', '# ADR-1: Paper invoices',
    [['ADR-1-1 rationale', 'Context: invoices were printed and posted.']]),
  'specs/adr/0002-pdf.md': adr('superseded by ADR-3', 'ADR-2 choice decides:INV-2 supersedes:ADR-1', '# ADR-2: PDF invoices',
    [['ADR-2-1 rationale', 'Context: ADR-1 cost too much postage.']]),
  'specs/adr/0003-email.md': adr('accepted', 'ADR-3 choice decides:INV-2 supersedes:ADR-2', '# ADR-3: Invoices by email',
    [['ADR-3-1 rationale', 'Context: ADR-1 was paper; a PDF alone was not enough.']]),
  'specs/adr/0004-numbers.md': adr('accepted', 'ADR-4 choice decides:INV-2', '# ADR-4: Sequential numbers',
    [['ADR-4-1 rationale', 'Context: numbers have no gaps.']],
    '\n## History\n\nWritten in the time of ADR-1.\n'),
  'specs/adr/0005-stream.md': adr('proposed', 'ADR-5 choice decides:INV-2', '# ADR-5: Stream the export',
    [['ADR-5-1 rationale', 'Context: large exports.']]),
  'specs/adr/0006-fax.md': adr('superseded by ADR-7', 'ADR-6 choice decides:INV-2', '# ADR-6: Fax copies',
    [['ADR-6-1 rationale', 'Context: unlike ADR-1, a fax was instant.']]),
  'specs/adr/0007-no-fax.md': adr('accepted', 'ADR-7 choice decides:INV-2 supersedes:ADR-6', '# ADR-7: No fax',
    [['ADR-7-1 rationale', 'Context: ADR-6 is gone.']]),
};
const ADR4 = 'specs/adr/0004-numbers.md';
const REQUEST_MD = `requests/${NAME}/request.md`;
const DECISIONS = '## Decisions\n\n- D1, 2026-05-04. Source: owner. ADR-1 is history.\n';

function adrWorld(t) {
  const dir = project(t);
  writeConfig(dir);
  write(dir, SPEC, doc([
    ['INV-1 note', '# Invoices'],
    ['INV-2 rule governed-by:ADR-3', 'An invoice MUST be sent by email.'],
    ['INV-3 note', INV3_TEXT],
  ]));
  for (const [file, text] of Object.entries(ADRS)) write(dir, file, text);
  newRequest(dir, NAME, 'the owner says: ADR-1 is old, we want email.\n');
  write(dir, REQUEST_MD, `${read(dir, REQUEST_MD)}\n${DECISIONS}`);
  write(dir, `requests/${NAME}/spec.md`, doc([['SP-1 note', '# Inv: the change']]));
  write(dir, `requests/${NAME}/tasks.md`, '# Tasks\n\n- T1 Send invoices by email.\n');
  newRequest(dir, 'old', 'the owner says: keep paper.\n');
  write(dir, 'requests/old/request.md', `${read(dir, 'requests/old/request.md')}\nWe used ADR-1 then.\n`);
  move(dir, 'requests/old', 'requests/archive/old');
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  return dir;
}

const cited = (r) => notOk(r).filter((f) => f.code === 'superseded-cited');
// Exactly one not ok superseded-cited, at file, on id, naming adr; nothing else not ok.
function citedOnce(r, { file, id, adr: n }) {
  const found = cited(r);
  assert.equal(found.length, 1, `one not ok superseded-cited:\n${show(r)}`);
  const f = found[0];
  assert.equal(f.file, file, show(r));
  assert.ok(Number.isInteger(f.at) && f.at > 0, `a line number:\n${show(r)}`);
  if (Array.isArray(id)) assert.ok(id.includes(f.id), `the id is one of ${id.join(', ')}:\n${show(r)}`);
  else assert.equal(f.id, id, show(r));
  assert.match(f.msg, new RegExp(`\\b${n}\\b`), `the message names ${n}:\n${show(r)}`);
  assert.deepEqual(notOk(r).filter((x) => x.code !== 'superseded-cited').map((x) => x.line), [], show(r));
  return f;
}
const noneCited = (r) => assert.deepEqual(notOk(r).map((f) => f.line), [], show(r));
const setInv2 = (dir, marker) => editFile(dir, SPEC, INV2_MARKER, `<!-- ${marker} -->`);
const setInv3 = (dir, text) => editFile(dir, SPEC, INV3_TEXT, text);

describe('R5: a current place that names a superseded ADR names the ADR that supersedes it', () => {
  test('control: the base world (the chain, its exemptions) has no not ok; plain and --strict exit 0', (t) => {
    const dir = adrWorld(t);
    noneCited(both(dir));
    assert.equal(check(dir, '--strict').code, 0);
  });

  test('a spec marker governed-by:ADR-1 with no ADR-2: not ok superseded-cited on INV-2; plain exits 0, --strict exits 1', (t) => {
    const dir = adrWorld(t);
    setInv2(dir, 'INV-2 rule governed-by:ADR-1');
    citedOnce(both(dir), { file: SPEC, id: 'INV-2', adr: 'ADR-1' });
    assert.equal(check(dir, '--strict').code, 1);
  });

  test('the chain: governed-by:ADR-1,ADR-2 names ADR-2, which ADR-3 supersedes: not ok, naming ADR-2', (t) => {
    const dir = adrWorld(t);
    setInv2(dir, 'INV-2 rule governed-by:ADR-1,ADR-2');
    citedOnce(both(dir), { file: SPEC, id: 'INV-2', adr: 'ADR-2' });
  });

  test('control: the whole chain in one marker (governed-by:ADR-1,ADR-2,ADR-3): no not ok', (t) => {
    const dir = adrWorld(t);
    setInv2(dir, 'INV-2 rule governed-by:ADR-1,ADR-2,ADR-3');
    noneCited(both(dir));
  });

  test('control: governed-by:ADR-2,ADR-3: no not ok', (t) => {
    const dir = adrWorld(t);
    setInv2(dir, 'INV-2 rule governed-by:ADR-2,ADR-3');
    noneCited(both(dir));
  });

  test('a link to a paragraph of ADR-1 (builds-on:ADR-1-1) names ADR-1: not ok on INV-2', (t) => {
    const dir = adrWorld(t);
    setInv2(dir, 'INV-2 rule governed-by:ADR-3 builds-on:ADR-1-1');
    citedOnce(both(dir), { file: SPEC, id: 'INV-2', adr: 'ADR-1' });
  });

  test('control: the successor in another link word of the same marker counts (governed-by:ADR-3 builds-on:ADR-2-1)', (t) => {
    const dir = adrWorld(t);
    setInv2(dir, 'INV-2 rule governed-by:ADR-3 builds-on:ADR-2-1');
    noneCited(both(dir));
  });

  test('a link to ADR-1 whose successors are named only in the paragraph text: still not ok (for a link, the successor is in the same marker)', (t) => {
    const dir = adrWorld(t);
    setInv2(dir, 'INV-2 rule governed-by:ADR-1');
    editFile(dir, SPEC, 'An invoice MUST be sent by email.', 'An invoice MUST be sent by email (ADR-2, ADR-3).');
    const found = cited(both(dir));
    assert.ok(found.some((f) => f.id === 'INV-2' && /\bADR-1\b/.test(f.msg)), show(both(dir)));
  });

  test('a word ADR-1 in a spec paragraph\'s text, with ADR-2 and ADR-3 only in its marker: not ok (for a word, the successor is in the same text)', (t) => {
    const dir = adrWorld(t);
    editFile(dir, SPEC, '<!-- INV-3 note -->', '<!-- INV-3 note governed-by:ADR-2,ADR-3 -->');
    setInv3(dir, 'Invoices were posted under ADR-1.');
    citedOnce(both(dir), { file: SPEC, id: 'INV-3', adr: 'ADR-1' });
  });

  test('a word ADR-1-1 names ADR-1: not ok on INV-3', (t) => {
    const dir = adrWorld(t);
    setInv3(dir, 'See ADR-1-1 for the posting cost.');
    citedOnce(both(dir), { file: SPEC, id: 'INV-3', adr: 'ADR-1' });
  });

  test('control: a text that names ADR-1, ADR-2 and ADR-3 in the same paragraph: no not ok', (t) => {
    const dir = adrWorld(t);
    setInv3(dir, 'ADR-1 gave way to ADR-2, and ADR-2 to ADR-3.');
    noneCited(both(dir));
  });

  test('control: ADR-10 and ADR-11 do not name ADR-1', (t) => {
    const dir = adrWorld(t);
    setInv3(dir, 'ADR-10 and ADR-11 are not written yet.');
    assert.deepEqual(cited(both(dir)), [], show(both(dir)));
  });

  test('an accepted ADR outside the chain (ADR-4) whose text names ADR-1: not ok, at the ADR file', (t) => {
    const dir = adrWorld(t);
    editFile(dir, ADR4, 'Context: numbers have no gaps.', 'Context: numbers have no gaps, as in ADR-1.');
    citedOnce(both(dir), { file: ADR4, id: 'ADR-4-1', adr: 'ADR-1' });
  });

  test('an accepted ADR\'s marker that links to ADR-2-1: not ok, naming ADR-2 (control: a link to ADR-3-1 is no finding)', (t) => {
    const dir = adrWorld(t);
    editFile(dir, ADR4, '<!-- ADR-4-1 rationale -->', '<!-- ADR-4-1 rationale explains:ADR-2-1 -->');
    citedOnce(both(dir), { file: ADR4, id: 'ADR-4-1', adr: 'ADR-2' });
    const control = adrWorld(t);
    editFile(control, ADR4, '<!-- ADR-4-1 rationale -->', '<!-- ADR-4-1 rationale explains:ADR-3-1 -->');
    noneCited(both(control));
  });

  test('a proposed ADR (ADR-5) is a current place: its text names ADR-2 alone, not ok', (t) => {
    const dir = adrWorld(t);
    editFile(dir, 'specs/adr/0005-stream.md', 'Context: large exports.', 'Context: large exports, unlike ADR-2.');
    citedOnce(both(dir), { file: 'specs/adr/0005-stream.md', id: 'ADR-5-1', adr: 'ADR-2' });
  });

  test('exempt: an ADR\'s History section (control: the same paragraph above the History heading is not ok)', (t) => {
    // The base world has "Written in the time of ADR-1." under ADR-4's ## History.
    noneCited(both(adrWorld(t)));
    const dir = adrWorld(t);
    editFile(dir, ADR4, '\n## History\n\nWritten in the time of ADR-1.\n', '\nWritten in the time of ADR-1.\n\n## History\n\nNone.\n');
    const f = citedOnce(both(dir), { file: ADR4, id: ['ADR-4-1', '-'], adr: 'ADR-1' });
    assert.equal(f.file, ADR4);
  });

  test('exempt: an ADR that supersedes it through the chain (ADR-3 names ADR-1 alone; control: ADR-4 naming ADR-1 alone is not ok)', (t) => {
    // The base world has "Context: ADR-1 was paper; ..." in ADR-3.
    noneCited(both(adrWorld(t)));
    const dir = adrWorld(t);
    editFile(dir, ADR4, 'Context: numbers have no gaps.', 'Context: ADR-1 was paper.');
    citedOnce(both(dir), { file: ADR4, id: 'ADR-4-1', adr: 'ADR-1' });
  });

  test('exempt: a superseded ADR (ADR-6 names ADR-1; control: the same ADR-6 accepted is not ok)', (t) => {
    noneCited(both(adrWorld(t)));
    const dir = adrWorld(t);
    editFile(dir, 'specs/adr/0006-fax.md', 'Status: superseded by ADR-7\n', 'Status: accepted\n');
    citedOnce(both(dir), { file: 'specs/adr/0006-fax.md', id: 'ADR-6-1', adr: 'ADR-1' });
  });

  test('exempt: a request\'s Decisions section (control: the same line above it in request.md is not ok)', (t) => {
    noneCited(both(adrWorld(t)));
    const dir = adrWorld(t);
    editFile(dir, REQUEST_MD, DECISIONS, `We keep ADR-1 for now.\n\n${DECISIONS}`);
    citedOnce(both(dir), { file: REQUEST_MD, id: '-', adr: 'ADR-1' });
  });

  test('an open request\'s change spec paragraph that names ADR-2 alone: not ok', (t) => {
    const dir = adrWorld(t);
    write(dir, `requests/${NAME}/spec.md`, doc([['SP-1 note', '# Inv: the change'], ['SP-2 note', 'This change follows ADR-2.']]));
    citedOnce(both(dir), { file: `requests/${NAME}/spec.md`, id: ['SP-2', `${NAME}/SP-2`], adr: 'ADR-2' });
  });

  test('an open request\'s tasks.md that names ADR-2 alone: not ok (control: with ADR-3 in the same paragraph, no finding)', (t) => {
    const dir = adrWorld(t);
    write(dir, `requests/${NAME}/tasks.md`, '# Tasks\n\n- T1 Send invoices as in ADR-2.\n');
    citedOnce(both(dir), { file: `requests/${NAME}/tasks.md`, id: '-', adr: 'ADR-2' });
    const control = adrWorld(t);
    write(control, `requests/${NAME}/tasks.md`, '# Tasks\n\n- T1 Send invoices as in ADR-2, now ADR-3.\n');
    noneCited(both(control));
  });

  test('exempt: origin files and archived requests (control: the archived request moved back to requests/ is not ok)', (t) => {
    // The base world: origin/ of inv names ADR-1; requests/archive/old/request.md names ADR-1.
    noneCited(both(adrWorld(t)));
    const dir = adrWorld(t);
    move(dir, 'requests/archive/old', 'requests/old');
    citedOnce(both(dir), { file: 'requests/old/request.md', id: '-', adr: 'ADR-1' });
  });

  test('control: another chain, governed-by:ADR-6,ADR-7, names the superseded ADR-6 with its successor: no not ok', (t) => {
    const dir = adrWorld(t);
    setInv2(dir, 'INV-2 rule governed-by:ADR-6,ADR-7');
    noneCited(both(dir));
  });
});

describe('R5: a superseded ADR\'s status line', () => {
  const ADR1 = 'specs/adr/0001-paper.md';
  for (const [what, status] of [
    ['a bare "Status: superseded"', 'superseded'],
    ['a status that names an ADR that does not exist (ADR-9)', 'superseded by ADR-9'],
    ['a status that names ADR-4, whose marker has no supersedes:ADR-1', 'superseded by ADR-4'],
  ]) {
    test(`${what}: not ok superseded-status ADR-1, and only that`, (t) => {
      const dir = adrWorld(t);
      editFile(dir, ADR1, 'Status: superseded by ADR-2\n', `Status: ${status}\n`);
      onlyNotOk(both(dir), ['not ok superseded-status ADR-1']);
      assert.equal(check(dir, '--strict').code, 1);
    });
  }

  test('ADR-2 loses supersedes:ADR-1 from its marker while ADR-1 says superseded by ADR-2: not ok superseded-status ADR-1', (t) => {
    const dir = adrWorld(t);
    editFile(dir, 'specs/adr/0002-pdf.md', 'decides:INV-2 supersedes:ADR-1 -->', 'decides:INV-2 -->');
    assert.ok(notOkKeys(both(dir)).includes('not ok superseded-status ADR-1'), show(check(dir)));
  });

  test('control: "Status: superseded by ADR-2" with supersedes:ADR-1 in ADR-2\'s marker: no superseded-status', (t) => {
    assert.deepEqual(coded(both(adrWorld(t)), 'superseded-status'), []);
  });
});

// =====================================================================
// R1: a rewrite that keeps the meaning.

const R1_MESSAGE = (n) => `ADR-${n}'s text changed: check that its decision is unchanged; if the decision changed, write a new ADR that supersedes it`;
function adrChanged(r, n) {
  const found = coded(r, 'adr-changed').filter((f) => f.id === `ADR-${n}`);
  assert.equal(found.length, 1, `one adr-changed line on ADR-${n}:\n${show(r)}`);
  assert.equal(found[0].severity, 'hint', show(r));
  return found[0];
}
const hasR1Message = (r, f, n) => assert.equal(f.msg.replace(/\.$/, ''), R1_MESSAGE(n), show(r));

describe('R1: a changed ADR is a hint with one message', () => {
  for (const [name, arm, n, what] of [
    ['adr-accepted', 'text', 2, 'the decision text of an accepted ADR'],
    ['adr-links', 'retarget', 2, 'a link target of an accepted ADR'],
    ['adr-links', 'removed', 4, 'a link target removed from an accepted ADR'],
    ['adr-links', 'kind', 2, 'the kind of an accepted ADR'],
    ['adr-links', 'frozen', 3, 'a link added to an ADR superseded at the base'],
  ]) {
    test(`${what} changed (${name} ${arm}): hint adr-changed on ADR-${n} with the R1 message, also under --strict`, (t) => {
      const dir = invoicer(t, name, arm);
      const r = both(dir);
      hasR1Message(r, adrChanged(r, n), n);
      const strict = check(dir, '--strict');
      hasR1Message(strict, adrChanged(strict, n), n);
      assert.deepEqual(notOk(r).filter((f) => f.code === 'adr-changed'), [], show(r));
    });
  }

  test('a deleted ADR file (adr-accepted deleted): hint adr-changed on ADR-2 with its own message, which says the file is gone', (t) => {
    const r = both(invoicer(t, 'adr-accepted', 'deleted'));
    assert.match(adrChanged(r, 2).msg, /file is gone/, show(r));
  });

  test('control: links only added to an accepted ADR\'s heading marker (adr-links word): no adr-changed', (t) => {
    const r = both(invoicer(t, 'adr-links', 'word'));
    assert.deepEqual(coded(r, 'adr-changed'), [], show(r));
  });

  test('adr-accepted text: nothing is not ok, so --strict exits 0', (t) => {
    const dir = invoicer(t, 'adr-accepted', 'text');
    onlyNotOk(both(dir), []);
    assert.equal(check(dir, '--strict').code, 0);
  });
});

describe('R1: al index --align clears stale-base on bindings to a rewritten superseded ADR', () => {
  // The clean world merged on main, with three holders bound to the
  // superseded ADR-3: the change spec paragraph invoice-exports/SP-6
  // (builds-on:ADR-3,ADR-4), the spec paragraph EXP-6 (builds-on:ADR-3,ADR-4)
  // and ADR-4 (supersedes:ADR-3). The branch pr2 rewrites ADR-3's heading.
  const HOLDERS = ['invoice-exports/SP-6', 'EXP-6', 'ADR-4'];
  function rewritten(t) {
    const dir = invoicer(t, 'clean');
    editFile(dir, 'requests/invoice-exports/spec.md', '<!-- SP-6 rule serves:R2 -->', '<!-- SP-6 rule serves:R2 builds-on:ADR-3,ADR-4 -->');
    editFile(dir, 'specs/exports.md', '<!-- EXP-6 component serves:invoice-exports/R2 governed-by:ADR-4 -->',
      '<!-- EXP-6 component serves:invoice-exports/R2 governed-by:ADR-4 builds-on:ADR-3,ADR-4 -->');
    ok(dir, ['index']);
    commitAll(dir, 'Bind to ADR-3\n\nTier: 2 — invoice-exports');
    git(dir, 'checkout', '-q', 'main');
    git(dir, 'merge', '-q', '--ff-only', 'pr');
    git(dir, 'checkout', '-q', '-b', 'pr2');
    editFile(dir, 'specs/adr/0003-signed-urls.md', '# ADR-3: Export links are signed URLs', '# ADR-3: Export links are URLs signed by the server');
    ok(dir, ['index']);
    return dir;
  }
  const stale = (r) => coded(r, 'stale-base').map((f) => f.id).sort();

  test('after the rewrite: stale-base on each holder, all hints; ADR-3 gets the R1 adr-changed hint; nothing is not ok', (t) => {
    const r = both(rewritten(t));
    assert.deepEqual(stale(r), [...HOLDERS].sort(), show(r));
    assert.ok(coded(r, 'stale-base').every((f) => f.severity === 'hint'), show(r));
    hasR1Message(r, adrChanged(r, 3), 3);
    onlyNotOk(r, []);
  });

  test('al index --align on each holder in turn clears its stale-base hint, and only its own', (t) => {
    const dir = rewritten(t);
    const left = [...HOLDERS];
    for (const holder of HOLDERS) {
      ok(dir, ['index', '--align', holder]);
      left.splice(left.indexOf(holder), 1);
      const r = check(dir);
      assert.deepEqual(stale(r), [...left].sort(), `after --align ${holder}:\n${show(r)}`);
    }
  });
});

// =====================================================================
// R2: every other finding is a hint in every mode.

describe('R2: findings that are hints stay hints under --strict', () => {
  // One spec doc with each marker lint.
  const LINTED = [
    '<!-- A-1 note -->', '', '# Alpha', '',
    'A stray paragraph with no marker.', '',
    '<!-- A-2 rule -->', '', 'A rule with no link.', '',
    '<!-- A-3 -->', '', 'A paragraph with no kind.', '',
    '<!-- A-4 bogus -->', '', 'A paragraph with an unknown kind.', '',
    '<!-- A-5 note frobs:A-1 -->', '', 'A paragraph with an unknown link word.', '',
    '<!-- A-6 note -->', 'A paragraph right under its marker.', '',
    'A paragraph right above a marker.', '<!-- A-7 note -->', '', 'After it.', '',
    '<!-- A-2 note -->', '', 'The ID A-2 again.', '',
    '<!-- A-8 note explains:A-99 -->', '', 'A link to an ID that does not exist.', '',
    '<!-- A-9 note -->', '', '# Alpha', '',
  ].join('\n');
  const CODES = ['no-id', 'no-link', 'no-kind', 'unknown-kind', 'unknown-link', 'no-blank-after', 'no-blank-before', 'duplicate-id', 'duplicate-heading', 'unresolved-link'];

  function linted(t) {
    const dir = project(t);
    writeConfig(dir, [{ file: 'specs/a.md', prefix: 'A' }]);
    write(dir, 'specs/a.md', '<!-- A-1 note -->\n\n# Alpha\n');
    commitAll(dir, 'base');
    git(dir, 'checkout', '-q', '-b', 'feature');
    write(dir, 'specs/a.md', `${LINTED}\n`);
    return dir;
  }

  test('each marker lint and unresolved-link is a hint, plain and --strict; --strict exits 0', (t) => {
    const dir = linted(t);
    const plain = both(dir);
    const strict = check(dir, '--strict');
    for (const r of [plain, strict]) {
      for (const code of CODES) {
        const found = coded(r, code);
        assert.ok(found.length >= 1, `a ${code} line:\n${show(r)}`);
        assert.deepEqual(found.filter((f) => f.severity !== 'hint').map((f) => f.line), [], `${code} is a hint:\n${show(r)}`);
      }
    }
    assert.equal(strict.code, 0, show(strict));
  });

  for (const [name, arm, code, id] of [
    ['d09', 'defect', 'path-claim', 'INV-4'],
    ['adr-links', 'untouched', 'adr-links', 'ADR-1'],
    ['cr-revert', undefined, 'disposition', 'reminder-emails/SP-2'],
    ['adr-supersede', 'missing', 'unresolved-link', 'ADR-5'],
    ['cr-abandon-m9', undefined, 'lost-id', 'EXP-9'],
  ]) {
    test(`${name}${arm ? ` ${arm}` : ''}: ${code} on ${id} is a hint, plain and --strict`, (t) => {
      const dir = invoicer(t, name, arm);
      for (const r of [both(dir), check(dir, '--strict')]) {
        const found = coded(r, code).filter((f) => f.id === id);
        assert.ok(found.length >= 1, `a ${code} line on ${id}:\n${show(r)}`);
        assert.deepEqual(found.filter((f) => f.severity !== 'hint').map((f) => f.line), [], show(r));
      }
    });
  }

  test('every not ok line that prints in these worlds has a blocking code', (t) => {
    for (const [name, arm] of [['d09', 'defect'], ['d01', 'defect'], ['adoption-gap', 'new'], ['cr-abandon-m9'], ['spike-q2'], ['conclude-unsigned']]) {
      const r = check(invoicer(t, name, arm), '--strict');
      assert.deepEqual(notOk(r).filter((f) => !BLOCKING.includes(f.code)).map((f) => f.line), [], `${name}:\n${show(r)}`);
    }
  });

  test('exit codes: a blocking finding exits 0 plain and 1 with --strict; hints alone exit 0 in both', (t) => {
    const blocked = signedWorld(t, { record: goodRecord((rec) => { rec.signoff = []; }) });
    assert.equal(check(blocked).code, 0);
    assert.equal(check(blocked, '--strict').code, 1);
    const hinted = linted(t);
    assert.equal(check(hinted).code, 0);
    assert.equal(check(hinted, '--strict').code, 0);
  });
});
