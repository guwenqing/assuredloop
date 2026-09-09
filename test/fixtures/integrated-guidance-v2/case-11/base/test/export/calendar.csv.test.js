import test from 'node:test';
import assert from 'node:assert/strict';
import { exportCalendarCsv } from '../../src/export/calendar.csv.js';

test('keeps event order and default locale in the CSV', () => {
  const csv = exportCalendarCsv([{ date: '2026-03-08T15:00:00.000Z', title: 'First' }]);
  assert.equal(csv, 'date,title\n2026-03-08,First');
});
