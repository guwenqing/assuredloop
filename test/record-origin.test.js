// al-v4 record <name> origin: a new snapshot of the owner's words (#175).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY, STAMP, assertSnapshot, move, newRequest, ok, project, read, record, refused, sha, write, writesNothing,
} from './helpers/project.js';

const URL1 = 'https://GitHub.com/Acme/shop/issues/42';
const SLUG1 = 'github-com-acme-shop-issues-42';
const MORE = 'Also, the link should not work forever.\n';
const FETCHED = '2026-05-06T10:00Z';

test('record origin without --yes prints and writes nothing', (t) => {
  const dir = project(t);
  newRequest(dir, 'inv');
  writesNothing(dir, ['record', 'inv', 'origin', '--url', URL1, '--from', '-'], { input: MORE });
});

test('record origin --yes writes the snapshot named by day and URL slug, and appends a source', (t) => {
  const dir = project(t);
  newRequest(dir, 'inv');
  const first = record(dir, 'inv').sources[0];
  ok(dir, ['record', 'inv', 'origin', '--url', URL1, '--from', '-', '--fetched', FETCHED, '--yes'], { input: MORE });

  const file = `2026-05-06-${SLUG1}.md`;
  assertSnapshot(read(dir, `requests/inv/origin/${file}`), { source: URL1, text: MORE, fetched: FETCHED });
  const { sources } = record(dir, 'inv');
  assert.equal(sources.length, 2);
  assert.deepEqual(sources[0], first, 'an earlier source is never changed');
  assert.deepEqual(sources[1], { file, kind: 'owner-words', sha256: sha(MORE), taken: FETCHED, url: URL1 });
});

test('record origin reads a file, takes now without --fetched, and adds -2, -3 when the name is taken', (t) => {
  const dir = project(t);
  newRequest(dir, 'inv');
  write(dir, 'more.txt', MORE);
  const url = 'http://example.com/Notes';
  ok(dir, ['record', 'inv', 'origin', '--url', url, '--from', 'more.txt', '--yes']);
  ok(dir, ['record', 'inv', 'origin', '--url', url, '--from', '-', '--yes'], { input: 'Second.\n' });
  ok(dir, ['record', 'inv', 'origin', '--url', url, '--from', '-', '--yes'], { input: 'Third.\n' });

  const base = `${DAY}-example-com-notes`;
  assertSnapshot(read(dir, `requests/inv/origin/${base}.md`), { source: url, text: MORE, fetched: STAMP });
  assertSnapshot(read(dir, `requests/inv/origin/${base}-2.md`), { source: url, text: 'Second.\n', fetched: STAMP });
  assertSnapshot(read(dir, `requests/inv/origin/${base}-3.md`), { source: url, text: 'Third.\n', fetched: STAMP });
  const { sources } = record(dir, 'inv');
  assert.deepEqual(sources.slice(1), [
    { file: `${base}.md`, kind: 'owner-words', sha256: sha(MORE), taken: STAMP, url },
    { file: `${base}-2.md`, kind: 'owner-words', sha256: sha('Second.\n'), taken: STAMP, url },
    { file: `${base}-3.md`, kind: 'owner-words', sha256: sha('Third.\n'), taken: STAMP, url },
  ]);
});

test('record origin refuses an archived request, a missing request and a missing --url', (t) => {
  const dir = project(t);
  newRequest(dir, 'inv');
  refused(dir, ['record', 'nope', 'origin', '--url', URL1, '--from', '-', '--yes'], { input: MORE });
  refused(dir, ['record', 'inv', 'origin', '--from', '-', '--yes'], { input: MORE });
  move(dir, 'requests/inv', 'requests/archive/inv');
  refused(dir, ['record', 'inv', 'origin', '--url', URL1, '--from', '-', '--yes'], { input: MORE });
});
