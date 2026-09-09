import test from 'node:test';
import assert from 'node:assert/strict';
import { exportCalendarCsv, formatCalendarDate } from '../../src/export/calendar.csv.js';

test('formats the same UTC date using the requested locale', () => {
  const value = '2026-03-08T15:00:00.000Z';
  assert.equal(formatCalendarDate(value, 'en-CA'), '2026-03-08');
  assert.equal(formatCalendarDate(value, 'en-US'), '03/08/2026');
});

test('keeps event order and default locale in the CSV', () => {
  const csv = exportCalendarCsv([
    { date: '2026-03-08T15:00:00.000Z', title: 'First' },
    { date: '2026-03-09T15:00:00.000Z', title: 'Second' }
  ]);
  assert.equal(csv, 'date,title\n2026-03-08,First\n2026-03-09,Second');
});
