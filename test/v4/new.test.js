// al-v4 new: the snapshot, request.md and the request record (#175).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY, STAMP, WORDS_FILE, assertSnapshot, ok, project, read, record, refused, sha, write, exists,
} from './helpers/project.js';

const WORDS = 'I want to download my invoices as CSV.\nOne file per month.\n';

test('new writes the snapshot, request.md and the record, with the tier as a string', (t) => {
  const dir = project(t);
  write(dir, 'notes/words.txt', WORDS);
  ok(dir, ['new', 'invoice-exports', '--from', 'notes/words.txt', '--title', 'Invoice exports', '--tier', '2']);

  assertSnapshot(read(dir, `requests/invoice-exports/origin/${WORDS_FILE}`),
    { source: 'notes/words.txt', text: WORDS, fetched: STAMP });

  const md = read(dir, 'requests/invoice-exports/request.md');
  assert.equal(md.split('\n')[0], '# Invoice exports');
  assert.match(md, /^Tier: 2 · Status: open$/m);
  const at = md.indexOf("## Owner's words and dialog\n");
  assert.ok(at > 0, md);
  assert.ok(md.slice(at).includes(WORDS_FILE), md);

  assert.deepEqual(record(dir, 'invoice-exports'), {
    schema: 'assuredloop/1',
    request: 'invoice-exports',
    tier: '2',
    status: 'open',
    sources: [{ file: WORDS_FILE, kind: 'owner-words', sha256: sha(WORDS), taken: STAMP }],
    requirements: [],
    signoff: [],
    decisions: [],
    tasks: [],
    bindings: [],
    dispositions: [],
  });
});

test('new reads standard input for -, and leaves the tier out when none is given', (t) => {
  const dir = project(t);
  ok(dir, ['new', 'exports2', '--from', '-'], { input: WORDS });
  assertSnapshot(read(dir, `requests/exports2/origin/${WORDS_FILE}`),
    { source: 'standard input', text: WORDS, fetched: STAMP });
  const md = read(dir, 'requests/exports2/request.md');
  assert.equal(md.split('\n')[0], '# exports2');
  assert.match(md, /^Status: open$/m);
  assert.doesNotMatch(md, /Tier:/);
  const rec = record(dir, 'exports2');
  assert.ok(!('tier' in rec), 'no tier key');
  assert.equal(rec.status, 'open');
});

test('new takes tier S and keeps it a string', (t) => {
  const dir = project(t);
  ok(dir, ['new', 'spike-1', '--from', '-', '--tier', 'S'], { input: WORDS });
  assert.equal(record(dir, 'spike-1').tier, 'S');
  assert.match(read(dir, 'requests/spike-1/request.md'), /^Tier: S · Status: open$/m);
});

test('new refuses a bad name', (t) => {
  const dir = project(t);
  for (const name of ['Invoice', 'a_b', 'a/b', '../escape', '-x', 'a b', '']) {
    refused(dir, ['new', name, '--from', '-'], { input: WORDS });
  }
});

test('new refuses a name already used by a request, an archived request or a record', (t) => {
  const dir = project(t);
  ok(dir, ['new', 'taken', '--from', '-'], { input: WORDS });
  refused(dir, ['new', 'taken', '--from', '-'], { input: WORDS });

  write(dir, 'requests/archive/old-one/request.md', '# old-one\n');
  refused(dir, ['new', 'old-one', '--from', '-'], { input: WORDS });

  write(dir, '.assuredloop/records/requests/rec-only.yaml', 'schema: assuredloop/1\nrequest: rec-only\n');
  refused(dir, ['new', 'rec-only', '--from', '-'], { input: WORDS });
  assert.ok(!exists(dir, 'requests/rec-only'));
});

test('new refuses empty words, from standard input or from a file', (t) => {
  const dir = project(t);
  refused(dir, ['new', 'empty-a', '--from', '-'], { input: '' });
  write(dir, 'empty.txt', '');
  refused(dir, ['new', 'empty-b', '--from', 'empty.txt']);
});

test('new refuses a bad tier and tier 0', (t) => {
  const dir = project(t);
  for (const tier of ['4', 'x', '0']) {
    refused(dir, ['new', 'tiered', '--from', '-', '--tier', tier], { input: WORDS });
  }
});
