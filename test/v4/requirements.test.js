// Requirement text and versions in the request record (#175).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WORDS_FILE, appendSection, editRequest, index, newRequest, organized, project, read, record, req, sha, write,
} from './helpers/project.js';

const R1 = req('R1', 'Monthly CSV download', 'A user MUST be able to download one month as one CSV file.', [WORDS_FILE]);
const R2 = req('R2', 'An email link that expires', 'The link MUST stop working after a short time.', [WORDS_FILE]);

const version = (r, v) => ({ id: r.id, version: v, sha256: r.sha256, title: r.title });

test('index appends version 1 of each requirement of a draft (no sign-off)', (t) => {
  const dir = project(t);
  newRequest(dir, 'inv');
  appendSection(dir, 'inv', organized([R1, R2]));
  index(dir);
  const rec = record(dir, 'inv');
  assert.deepEqual(rec.requirements, [version(R1, 1), version(R2, 1)]);
  assert.deepEqual(rec.signoff, []);
});

test('a changed requirement gets a new version; old entries are never edited; a second index adds none', (t) => {
  const dir = project(t);
  newRequest(dir, 'inv');
  appendSection(dir, 'inv', organized([R1, R2]));
  index(dir);

  const R2b = req('R2', 'An email link that expires', 'The link MUST stop working after 30 minutes.', [WORDS_FILE]);
  editRequest(dir, 'inv', R2.text, R2b.text);
  index(dir);
  assert.deepEqual(record(dir, 'inv').requirements, [version(R1, 1), version(R2, 1), version(R2b, 2)]);

  index(dir);
  assert.deepEqual(record(dir, 'inv').requirements, [version(R1, 1), version(R2, 1), version(R2b, 2)]);

  const R2c = req('R2', 'A link that expires', 'The link MUST stop working after 30 minutes.', [WORDS_FILE]);
  editRequest(dir, 'inv', R2b.text, R2c.text);
  index(dir);
  assert.deepEqual(record(dir, 'inv').requirements,
    [version(R1, 1), version(R2, 1), version(R2b, 2), version(R2c, 3)], 'a new title is a new text, so a new version');
});

test('a requirement removed from request.md keeps its versions', (t) => {
  const dir = project(t);
  newRequest(dir, 'inv');
  appendSection(dir, 'inv', organized([R1, R2]));
  index(dir);
  editRequest(dir, 'inv', `${R1.block}\n`, '');
  index(dir);
  assert.deepEqual(record(dir, 'inv').requirements, [version(R1, 1), version(R2, 1)]);
});

test('requirement text: heading to the next heading, Out:, Assumed: or Signed off: line; no markers; CRLF made LF', (t) => {
  const dir = project(t);
  newRequest(dir, 'inv');
  const md = read(dir, 'requests/inv/request.md');
  const section = [
    '## Organized requirement',
    '',
    'Intro text.',
    '',
    `<!-- R1 from:${WORDS_FILE} -->`,
    '',
    '### R1 Monthly CSV download',
    'A user MUST be able to download one month as one CSV file.',
    '',
    'The file MUST use commas.',
    '',
    '<!-- R2 -->',
    '',
    '### R2 An email link that expires',
    'The link MUST stop working after a short time.',
    '',
    'Assumed: the email arrives.',
    '',
    '<!-- R3 -->',
    '',
    '### R3 ISO dates',
    'Every date MUST be ISO 8601.',
    'Out: tax reports.',
    '',
  ].join('\r\n');
  write(dir, 'requests/inv/request.md', `${md}\n${section}`);
  index(dir);
  const t1 = '### R1 Monthly CSV download\nA user MUST be able to download one month as one CSV file.\n\nThe file MUST use commas.\n';
  const t2 = '### R2 An email link that expires\nThe link MUST stop working after a short time.\n';
  const t3 = '### R3 ISO dates\nEvery date MUST be ISO 8601.\n';
  assert.deepEqual(record(dir, 'inv').requirements, [
    { id: 'R1', version: 1, sha256: sha(t1), title: 'Monthly CSV download' },
    { id: 'R2', version: 1, sha256: sha(t2), title: 'An email link that expires' },
    { id: 'R3', version: 1, sha256: sha(t3), title: 'ISO dates' },
  ]);
});

test('a change to a from: marker only is no new version', (t) => {
  const dir = project(t);
  newRequest(dir, 'inv');
  appendSection(dir, 'inv', organized([R1, R2]));
  index(dir);
  editRequest(dir, 'inv', `<!-- R2 from:${WORDS_FILE} -->`, '<!-- R2 -->');
  index(dir);
  assert.deepEqual(record(dir, 'inv').requirements, [version(R1, 1), version(R2, 1)]);
});

test('an organized question: Q<n> gets versions too', (t) => {
  const dir = project(t);
  newRequest(dir, 'spike-a', 'Can we sign links?\n', ['--tier', 'S']);
  const Q1 = req('Q1', 'Signed links', 'Can a signed link replace the token table?');
  appendSection(dir, 'spike-a', organized([Q1], { heading: '## Organized question' }));
  index(dir);
  assert.deepEqual(record(dir, 'spike-a').requirements, [version(Q1, 1)]);
});
