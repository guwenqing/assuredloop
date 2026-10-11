// What a sign-off binds does not change when the standard requirement markers
// are added (#196). The standard form (design.md): the marker line
// `<!-- R2 from:<snapshot file> -->`, a blank line, then the `### R2 ...`
// heading. Equality (design.md 5) removes the marker framing: the marker line
// and its blank line. Written from the requirement and the public commands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WORDS_FILE, appendSection, editRequest, newRequest, ok, project, read, record, req, sha, signedText, writesNothing,
} from './helpers/project.js';

const SOURCE = 'email from the owner, 2026-05-04';
const R1 = req('R1', 'Monthly CSV download', 'A user MUST be able to download one month as one CSV file.', [WORDS_FILE]);
const R2 = req('R2', 'An email link that expires',
  'The link MUST stop working after a short time.\n\nThe link is sent by email.', [WORDS_FILE]);

// The organized section with no markers: heading, intro, the requirement
// texts, an Out: line.
const PLAIN = `## Organized requirement\n\nWhat the owner wants.\n\n${R1.text}\n${R2.text}\nOut: tax reports.\n`;
// The same section with the standard marker before each ### R<n> heading.
const markerOf = (r) => `<!-- ${r.id} from:${WORDS_FILE} -->`;
const withMarkers = (text) => text
  .replace(`### R1 ${R1.title}`, `${markerOf(R1)}\n\n### R1 ${R1.title}`)
  .replace(`### R2 ${R2.title}`, `${markerOf(R2)}\n\n### R2 ${R2.title}`);
const MARKED = withMarkers(PLAIN);

const COVERS = [
  { id: 'R1', version: 1, sha256: R1.sha256 },
  { id: 'R2', version: 1, sha256: R2.sha256 },
];

function drafted(t, section) {
  const dir = project(t);
  newRequest(dir, 'inv');
  appendSection(dir, 'inv', section);
  return dir;
}
const sign = (dir, source = SOURCE) => ok(dir, ['record', 'inv', 'signoff', '--source', source, '--yes']);
const preview = (dir) => writesNothing(dir, ['record', 'inv', 'signoff', '--source', SOURCE]);

// Adds the standard markers to request.md, with no other change.
function addMarkers(dir) {
  editRequest(dir, 'inv', `### R1 ${R1.title}`, `${markerOf(R1)}\n\n### R1 ${R1.title}`);
  editRequest(dir, 'inv', `### R2 ${R2.title}`, `${markerOf(R2)}\n\n### R2 ${R2.title}`);
}

test('the fixture: the marked section is the plain one with only the marker line and its blank line added', () => {
  assert.notEqual(MARKED, PLAIN);
  assert.equal(MARKED.replace(/^<!-- R\d+ from:\S+ -->\n\n/gm, ''), PLAIN);
});

test('adding the standard markers to a signed section with no markers leaves nothing to sign, and writes nothing', (t) => {
  const dir = drafted(t, PLAIN);
  sign(dir);
  addMarkers(dir);
  assert.ok(read(dir, 'requests/inv/request.md').includes(`${markerOf(R2)}\n\n### R2 ${R2.title}`));
  const r = preview(dir);
  assert.match(r.stdout, /nothing to sign/);
  const yes = writesNothing(dir, ['record', 'inv', 'signoff', '--source', SOURCE, '--yes']);
  assert.match(yes.stdout, /nothing to sign/);
});

test('the sign-off sha256 of the marked section equals the one of the same section without markers', (t) => {
  const plain = drafted(t, PLAIN);
  const marked = drafted(t, MARKED);
  sign(plain);
  sign(marked);
  const a = record(plain, 'inv').signoff[0];
  const b = record(marked, 'inv').signoff[0];
  assert.equal(b.sha256, a.sha256);
  // The section with no markers is signed as it is today.
  assert.equal(a.sha256, sha(signedText(PLAIN)));
});

test('the covers list keeps the per-requirement hashes of today, for both forms', (t) => {
  const plain = drafted(t, PLAIN);
  const marked = drafted(t, MARKED);
  sign(plain);
  sign(marked);
  assert.deepEqual(record(plain, 'inv').signoff[0].covers, COVERS);
  assert.deepEqual(record(marked, 'inv').signoff[0].covers, COVERS);
});

test('control: a real change of words in a requirement after the markers still needs a new sign-off', (t) => {
  const dir = drafted(t, PLAIN);
  sign(dir);
  addMarkers(dir);
  editRequest(dir, 'inv', 'after a short time.', 'after 30 minutes.');
  const r = preview(dir);
  assert.doesNotMatch(r.stdout, /nothing to sign/);
  sign(dir);
  assert.equal(record(dir, 'inv').signoff.length, 2);
});

test('control: an extra blank line between two paragraphs of a requirement, away from any marker, changes what is signed', (t) => {
  const dir = drafted(t, MARKED);
  sign(dir);
  editRequest(dir, 'inv', 'after a short time.\n\nThe link is sent', 'after a short time.\n\n\nThe link is sent');
  const r = preview(dir);
  assert.doesNotMatch(r.stdout, /nothing to sign/);
  sign(dir);
  const rec = record(dir, 'inv');
  assert.equal(rec.signoff.length, 2);
  assert.notEqual(rec.signoff[1].sha256, rec.signoff[0].sha256);
});
