// Checks central:EXP-4: the link stops working 30 minutes after sending.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueLink, openLink } from '../src/export-link.js';

test('a link works before 30 minutes and not after', () => {
  const store = new Map();
  const url = issueLink(store, 'e1', 0);
  const token = new URL(url, 'http://x').searchParams.get('token');
  assert.equal(openLink(new Map(store), token, 29 * 60_000), 'e1');
  assert.equal(openLink(store, token, 30 * 60_000), null);
});
