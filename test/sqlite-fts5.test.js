// node:sqlite has FTS5 (#181, T13; tasks.md T7 and T13: level 1 needs FTS5 in
// node:sqlite on the minimum Node version, 24). CI runs this on Node 24.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

test(`node:sqlite makes an FTS5 table and matches a query (Node ${process.version})`, () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec("CREATE VIRTUAL TABLE chunks USING fts5(id UNINDEXED, text, tokenize = 'porter unicode61')");
    const add = db.prepare('INSERT INTO chunks (id, text) VALUES (?, ?)');
    add.run('EXP-4', 'The export link MUST expire 30 minutes after the email is sent.');
    add.run('EXP-2', 'A user MUST be able to download one month as one CSV file.');
    const hits = db.prepare('SELECT id, bm25(chunks) AS score FROM chunks WHERE chunks MATCH ? ORDER BY score').all('expires');
    assert.deepEqual(hits.map((h) => h.id), ['EXP-4'], 'porter: "expires" matches "expire"');
    assert.equal(typeof hits[0].score, 'number', 'bm25 gives a score');
    const version = db.prepare('SELECT sqlite_version() AS v').get().v;
    assert.match(version, /^3\.\d+/, `SQLite ${version}`);
  } finally {
    db.close();
  }
});
