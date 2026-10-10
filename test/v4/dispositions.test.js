// Dispositions: index fills the hashes once and never changes them (#175).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendSection, baseProject, doc, editFile, editRecord, editRequest, hashOf, index, newRequest, organized, record,
  req, write,
} from './helpers/project.js';

const SPEC = 'specs/invoices.md';
const CS = 'requests/inv/spec.md';

test('index fills source_sha256, and spec_sha256 for incorporated, once; a present hash is never changed', (t) => {
  const dir = baseProject(t);
  newRequest(dir, 'inv');
  write(dir, CS, doc([
    ['SP-1 rule changes:INV-41', 'The export link MUST expire 30 minutes after the email is sent.'],
    ['SP-2 rule', 'An export MUST be a CSV file.'],
    ['SP-3 rule', 'An export MUST name the month.'],
  ]));
  const typed = 'b'.repeat(64);
  editRecord(dir, 'inv', (rec) => {
    rec.dispositions = [
      { source: 'inv/SP-1', disposition: 'incorporated', spec: 'INV-41' },
      { source: 'inv/SP-2', disposition: 'pending' },
      { source: 'inv/SP-3', source_sha256: typed, disposition: 'incorporated', spec: 'INV-13', spec_sha256: typed },
    ];
  });
  index(dir);
  const sp = (id) => hashOf(dir, CS, id);
  const filled = [
    { source: 'inv/SP-1', disposition: 'incorporated', spec: 'INV-41', source_sha256: sp('SP-1'), spec_sha256: hashOf(dir, SPEC, 'INV-41') },
    { source: 'inv/SP-2', disposition: 'pending', source_sha256: sp('SP-2') },
    { source: 'inv/SP-3', source_sha256: typed, disposition: 'incorporated', spec: 'INV-13', spec_sha256: typed },
  ];
  assert.deepEqual(record(dir, 'inv').dispositions, filled);

  editFile(dir, CS, '30 minutes after the email', '20 minutes after the email');
  editFile(dir, CS, 'MUST be a CSV file', 'MUST be one CSV file');
  editFile(dir, SPEC, 'MUST expire 30 minutes', 'MUST expire 20 minutes');
  index(dir);
  assert.notEqual(hashOf(dir, CS, 'SP-1'), filled[0].source_sha256, 'the source did change');
  assert.deepEqual(record(dir, 'inv').dispositions, filled, 'the filled hashes never change');
});

test('a disposition from a requirement takes its latest version hash once; one from adoption gets no source hash', (t) => {
  const dir = baseProject(t);
  newRequest(dir, 'inv');
  const R2 = req('R2', 'An email link that expires', 'The link MUST stop working after a short time.');
  const R2b = req('R2', 'An email link that expires', 'The link MUST stop working after 30 minutes.');
  appendSection(dir, 'inv', organized([R2]));
  editRecord(dir, 'inv', (rec) => {
    rec.dispositions = [
      { source: 'inv/R2', disposition: 'incorporated', spec: 'INV-41' },
      { source: 'adoption', disposition: 'incorporated', spec: 'INV-41' },
    ];
  });
  const r = index(dir);
  assert.doesNotMatch(r.stdout, /adoption/, 'no line about the adoption entry');
  const inv41 = hashOf(dir, SPEC, 'INV-41');
  const latest = record(dir, 'inv').requirements.filter((v) => v.id === 'R2').at(-1);
  assert.equal(latest.sha256, R2.sha256);
  const filled = [
    { source: 'inv/R2', disposition: 'incorporated', spec: 'INV-41', source_sha256: R2.sha256, spec_sha256: inv41 },
    { source: 'adoption', disposition: 'incorporated', spec: 'INV-41', spec_sha256: inv41 },
  ];
  assert.deepEqual(record(dir, 'inv').dispositions, filled);

  editRequest(dir, 'inv', R2.text, R2b.text);
  const again = index(dir);
  assert.doesNotMatch(again.stdout, /adoption/);
  const rec = record(dir, 'inv');
  assert.equal(rec.requirements.at(-1).sha256, R2b.sha256, 'R2 has a new version');
  assert.deepEqual(rec.dispositions, filled, 'the filled hashes never change');
});
