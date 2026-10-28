// Dispositions in an old record (#175; #72, LD-58 and LD-9). #72 removed the
// dispositions from al: al index no longer fills their hashes. An old record
// that holds them stays readable: al index runs on it, and keeps each entry
// with the fields it had, so no fact is lost.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseProject, doc, editRecord, index, newRequest, record, write } from './helpers/project.js';

const CS = 'requests/inv/spec.md';

test('al index on a record with dispositions (incorporated, pending, from adoption) exits 0 and keeps each entry with its fields', (t) => {
  const dir = baseProject(t);
  newRequest(dir, 'inv');
  write(dir, CS, doc([
    ['SP-1 rule changes:INV-41', 'The export link MUST expire 30 minutes after the email is sent.'],
    ['SP-2 rule', 'An export MUST be a CSV file.'],
  ]));
  const typed = 'b'.repeat(64);
  const entries = [
    { source: 'inv/SP-1', disposition: 'incorporated', spec: 'INV-41' },
    { source: 'inv/SP-2', disposition: 'pending' },
    { source: 'inv/SP-1', source_sha256: typed, disposition: 'incorporated', spec: 'INV-13', spec_sha256: typed },
    { source: 'adoption', disposition: 'incorporated', spec: 'INV-41' },
  ];
  editRecord(dir, 'inv', (rec) => { rec.dispositions = entries; });
  index(dir);
  const kept = record(dir, 'inv').dispositions ?? [];
  assert.equal(kept.length, entries.length, `each entry is kept:\n${JSON.stringify(kept, null, 1)}`);
  entries.forEach((e, i) => {
    for (const [k, v] of Object.entries(e)) assert.equal(kept[i][k], v, `entry ${i} keeps ${k}:\n${JSON.stringify(kept, null, 1)}`);
  });
});
