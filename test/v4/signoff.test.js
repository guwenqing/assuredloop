// al-v4 record <name> signoff (#175).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY, STAMP, WORDS_FILE, appendSection, assertSnapshot, editRecord, editRequest, move, newRequest, ok, organized,
  project, read, record, refused, req, sectionNow, sha, signedText, writesNothing,
} from './helpers/project.js';

const R1 = req('R1', 'Monthly CSV download', 'A user MUST be able to download one month as one CSV file.', [WORDS_FILE]);
const R2 = req('R2', 'An email link that expires', 'The link MUST stop working after a short time.', [WORDS_FILE]);
const SECTION = organized([R1, R2], { tail: '\nOut: tax reports.\n' });
const SOURCE = 'email from the owner, 2026-05-04';

function drafted(t, section = SECTION) {
  const dir = project(t);
  newRequest(dir, 'inv');
  appendSection(dir, 'inv', section);
  return dir;
}

const signedOffLines = (dir) => read(dir, 'requests/inv/request.md').split('\n').filter((l) => l.startsWith('Signed off:'));
const lastLine = (dir) => read(dir, 'requests/inv/request.md').trimEnd().split('\n').at(-1);

test('signoff --yes appends versions, writes the snapshot, the S1 entry and the Signed off line', (t) => {
  const dir = drafted(t);
  const signed = signedText(SECTION);
  assert.ok(!signed.includes('<!--'), 'the test text has no marker left');
  ok(dir, ['record', 'inv', 'signoff', '--source', SOURCE, '--yes']);

  const rec = record(dir, 'inv');
  assert.deepEqual(rec.requirements, [
    { id: 'R1', version: 1, sha256: R1.sha256, title: R1.title },
    { id: 'R2', version: 1, sha256: R2.sha256, title: R2.title },
  ], 'signoff appends the versions without an index');
  assertSnapshot(read(dir, `requests/inv/origin/${DAY}-signoff.md`),
    { source: SOURCE, text: signed, fetched: STAMP, signoff: true });
  assert.deepEqual(rec.signoff, [{
    id: 'S1',
    file: `${DAY}-signoff.md`,
    sha256: sha(signed),
    signed: STAMP,
    source: SOURCE,
    covers: [
      { id: 'R1', version: 1, sha256: R1.sha256 },
      { id: 'R2', version: 1, sha256: R2.sha256 },
    ],
  }]);
  assert.deepEqual(signedOffLines(dir), [`Signed off: ${DAY} owner, origin/${DAY}-signoff.md`]);
  assert.equal(lastLine(dir), `Signed off: ${DAY} owner, origin/${DAY}-signoff.md`, 'at the end of the organized section');
});

test('signoff without --yes prints the text to sign and writes nothing', (t) => {
  const dir = drafted(t);
  const r = writesNothing(dir, ['record', 'inv', 'signoff', '--source', SOURCE]);
  assert.ok(r.stdout.includes('### R1 Monthly CSV download'), r.stdout);
  assert.ok(r.stdout.includes('### R2 An email link that expires'), r.stdout);
});

test('nothing to sign when the latest sign-off covers the same requirements and the same signed text', (t) => {
  const dir = drafted(t);
  ok(dir, ['record', 'inv', 'signoff', '--source', SOURCE, '--yes']);
  let r = writesNothing(dir, ['record', 'inv', 'signoff', '--source', SOURCE, '--yes']);
  assert.match(r.stdout, /nothing to sign/);
  r = writesNothing(dir, ['record', 'inv', 'signoff', '--source', SOURCE]);
  assert.match(r.stdout, /nothing to sign/);

  // A from: marker is no part of the signed text nor of a requirement's text.
  editRequest(dir, 'inv', `<!-- R2 from:${WORDS_FILE} -->`, '<!-- R2 -->');
  r = writesNothing(dir, ['record', 'inv', 'signoff', '--source', SOURCE, '--yes']);
  assert.match(r.stdout, /nothing to sign/);
});

test('a changed requirement is signed again: S2, a -2 file, the new version covered, one Signed off line', (t) => {
  const dir = drafted(t);
  ok(dir, ['record', 'inv', 'signoff', '--source', SOURCE, '--yes']);
  const s1 = record(dir, 'inv').signoff[0];

  const R2b = req('R2', R2.title, 'The link MUST stop working after 30 minutes.', [WORDS_FILE]);
  editRequest(dir, 'inv', R2.text, R2b.text);
  const signed = signedText(sectionNow(dir, 'inv'));
  assert.ok(!signed.includes('Signed off:'));
  ok(dir, ['record', 'inv', 'signoff', '--source', 'call with the owner', '--yes']);

  const rec = record(dir, 'inv');
  assert.deepEqual(rec.requirements.at(-1), { id: 'R2', version: 2, sha256: R2b.sha256, title: R2.title });
  assert.equal(rec.requirements.length, 3);
  assert.deepEqual(rec.signoff[0], s1, 'S1 is never changed');
  assert.deepEqual(rec.signoff[1], {
    id: 'S2',
    file: `${DAY}-signoff-2.md`,
    sha256: sha(signed),
    signed: STAMP,
    source: 'call with the owner',
    covers: [
      { id: 'R1', version: 1, sha256: R1.sha256 },
      { id: 'R2', version: 2, sha256: R2b.sha256 },
    ],
  });
  assertSnapshot(read(dir, `requests/inv/origin/${DAY}-signoff-2.md`),
    { source: 'call with the owner', text: signed, fetched: STAMP, signoff: true });
  assert.deepEqual(signedOffLines(dir), [`Signed off: ${DAY} owner, origin/${DAY}-signoff-2.md`],
    'the new line replaces the earlier one');
});

test('a change to the intro or an Out: line only needs a new sign-off with the same covers', (t) => {
  const dir = drafted(t);
  ok(dir, ['record', 'inv', 'signoff', '--source', SOURCE, '--yes']);
  editRequest(dir, 'inv', 'Out: tax reports.', 'Out: tax reports and VAT.');
  const signed = signedText(sectionNow(dir, 'inv'));
  ok(dir, ['record', 'inv', 'signoff', '--source', SOURCE, '--yes']);
  const rec = record(dir, 'inv');
  assert.equal(rec.signoff.length, 2);
  assert.equal(rec.signoff[1].sha256, sha(signed));
  assert.deepEqual(rec.signoff[1].covers, rec.signoff[0].covers);
  assert.equal(rec.requirements.length, 2, 'no requirement changed');
});

test('signoff records --words, --presented and --transcribed-by when given', (t) => {
  const dir = drafted(t);
  const words = 'Yes, that is what I want';
  ok(dir, ['record', 'inv', 'signoff', '--source', SOURCE, '--words', words,
    '--presented', 'https://example.com/pr/1', '--transcribed-by', 'agent-7', '--yes']);
  const s = record(dir, 'inv').signoff[0];
  assert.equal(s.words, words);
  assert.equal(s.presented, 'https://example.com/pr/1');
  assert.equal(s.transcribed_by, 'agent-7');
  assertSnapshot(read(dir, `requests/inv/origin/${DAY}-signoff.md`),
    { source: SOURCE, text: signedText(SECTION), fetched: STAMP, signoff: true, words });
});

test('the S number is 1 + the highest S number in the record', (t) => {
  const dir = drafted(t);
  editRecord(dir, 'inv', (rec) => {
    rec.signoff.push({ id: 'S3', file: 'imported.md', sha256: '0'.repeat(64), signed: '2026-01-01T00:00Z', source: 'import', covers: [] });
  });
  ok(dir, ['record', 'inv', 'signoff', '--source', SOURCE, '--yes']);
  const rec = record(dir, 'inv');
  assert.deepEqual(rec.signoff.map((s) => s.id), ['S3', 'S4']);
  assert.equal(rec.signoff[1].file, `${DAY}-signoff.md`);
});

test('signoff of an organized question covers Q1', (t) => {
  const dir = project(t);
  newRequest(dir, 'spike-a', 'Can we sign links?\n', ['--tier', 'S']);
  const Q1 = req('Q1', 'Signed links', 'Can a signed link replace the token table?');
  const section = organized([Q1], { heading: '## Organized question' });
  appendSection(dir, 'spike-a', section);
  ok(dir, ['record', 'spike-a', 'signoff', '--source', SOURCE, '--yes']);
  const s = record(dir, 'spike-a').signoff[0];
  assert.deepEqual(s.covers, [{ id: 'Q1', version: 1, sha256: Q1.sha256 }]);
  assert.equal(s.sha256, sha(signedText(section)));
});

test('signoff refuses no --source, no organized section and an archived request', (t) => {
  const dir = drafted(t);
  refused(dir, ['record', 'inv', 'signoff', '--yes']);

  newRequest(dir, 'bare');
  refused(dir, ['record', 'bare', 'signoff', '--source', SOURCE, '--yes']);

  move(dir, 'requests/inv', 'requests/archive/inv');
  refused(dir, ['record', 'inv', 'signoff', '--source', SOURCE, '--yes']);
});
