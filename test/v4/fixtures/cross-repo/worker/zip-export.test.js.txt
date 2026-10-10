// Checks central:invoice-exports/SP-10: a yearly ZIP is named for its year.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipName } from '../src/zip-export.js';

test('a yearly ZIP is named for its year', () => {
  assert.equal(zipName(2026), '2026.zip');
});
