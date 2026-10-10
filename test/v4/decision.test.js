// al-v4 record <name> decision (#175).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY, editRecord, move, newRequest, ok, project, read, record, refused, sha, write, writesNothing,
} from './helpers/project.js';

const TEXT = '30 minutes is long enough for the email link.';
const lines = (dir) => read(dir, 'requests/inv/request.md').split('\n');
const lastLine = (dir) => read(dir, 'requests/inv/request.md').trimEnd().split('\n').at(-1);

test('decision --yes adds ## Decisions at the end with the D1 line, and the record entry', (t) => {
  const dir = project(t);
  newRequest(dir, 'inv');
  ok(dir, ['record', 'inv', 'decision', '--source', 'owner', '--text', TEXT, '--clarifies', 'R2', '--yes']);
  const line = `- D1, ${DAY}. Source: owner. ${TEXT}`;
  const all = lines(dir);
  assert.ok(all.includes('## Decisions'));
  assert.ok(all.indexOf('## Decisions') < all.indexOf(line));
  assert.equal(lastLine(dir), line);
  assert.deepEqual(record(dir, 'inv').decisions,
    [{ id: 'D1', date: DAY, source: 'owner', text: TEXT, sha256: sha(TEXT), clarifies: ['R2'] }]);
});

test('decision without --clarifies has no clarifies; a list is split; D2 follows D1', (t) => {
  const dir = project(t);
  newRequest(dir, 'inv');
  ok(dir, ['record', 'inv', 'decision', '--source', 'owner', '--text', 'First.', '--yes']);
  ok(dir, ['record', 'inv', 'decision', '--source', 'architect', '--text', 'Second.', '--clarifies', 'R2,R3', '--yes']);
  assert.deepEqual(record(dir, 'inv').decisions, [
    { id: 'D1', date: DAY, source: 'owner', text: 'First.', sha256: sha('First.') },
    { id: 'D2', date: DAY, source: 'architect', text: 'Second.', sha256: sha('Second.'), clarifies: ['R2', 'R3'] },
  ]);
  const all = lines(dir);
  assert.equal(all.filter((l) => l === '## Decisions').length, 1);
  assert.ok(all.indexOf(`- D1, ${DAY}. Source: owner. First.`) < all.indexOf(`- D2, ${DAY}. Source: architect. Second.`));
});

test('the D number counts the decisions in request.md; the line goes last in ## Decisions', (t) => {
  const dir = project(t);
  newRequest(dir, 'inv');
  const md = read(dir, 'requests/inv/request.md');
  write(dir, 'requests/inv/request.md',
    `${md}\n## Decisions\n\n- D3, 2026-04-01. Source: owner. Earlier.\n\n## Notes\n\nA note.\n`);
  ok(dir, ['record', 'inv', 'decision', '--source', 'owner', '--text', TEXT, '--yes']);
  const all = lines(dir);
  const d4 = all.indexOf(`- D4, ${DAY}. Source: owner. ${TEXT}`);
  assert.ok(d4 > all.indexOf('- D3, 2026-04-01. Source: owner. Earlier.'), all.join('\n'));
  assert.ok(d4 < all.indexOf('## Notes'), all.join('\n'));
  assert.equal(all.filter((l) => l === '## Decisions').length, 1);
  assert.deepEqual(record(dir, 'inv').decisions.map((d) => d.id), ['D4']);
});

test('the D number counts the decisions in the record', (t) => {
  const dir = project(t);
  newRequest(dir, 'inv');
  editRecord(dir, 'inv', (rec) => {
    rec.decisions.push({ id: 'D5', date: '2026-04-01', source: 'owner', text: 'Old.', sha256: sha('Old.') });
  });
  ok(dir, ['record', 'inv', 'decision', '--source', 'owner', '--text', TEXT, '--yes']);
  assert.deepEqual(record(dir, 'inv').decisions.map((d) => d.id), ['D5', 'D6']);
  assert.ok(lines(dir).includes(`- D6, ${DAY}. Source: owner. ${TEXT}`));
});

test('decision without --yes prints the entry and writes nothing', (t) => {
  const dir = project(t);
  newRequest(dir, 'inv');
  const r = writesNothing(dir, ['record', 'inv', 'decision', '--source', 'owner', '--text', TEXT]);
  assert.ok(r.stdout.includes(TEXT), r.stdout);
});

test('decision refuses no --source, no --text, a line break, and an archived request', (t) => {
  const dir = project(t);
  newRequest(dir, 'inv');
  refused(dir, ['record', 'inv', 'decision', '--text', TEXT, '--yes']);
  refused(dir, ['record', 'inv', 'decision', '--source', 'owner', '--yes']);
  refused(dir, ['record', 'inv', 'decision', '--source', 'owner', '--text', 'Line one.\nLine two.', '--yes']);
  refused(dir, ['record', 'inv', 'decision', '--source', 'owner\nand more', '--text', TEXT, '--yes']);
  move(dir, 'requests/inv', 'requests/archive/inv');
  refused(dir, ['record', 'inv', 'decision', '--source', 'owner', '--text', TEXT, '--yes']);
});
