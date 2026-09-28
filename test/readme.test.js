// The tool's documentation, README.md at the repo root [TL-3] [TL-4]: a
// section "What is enforced, and by whom" holding a Markdown table whose
// header row is exactly "The tool checks", "The skill asks", "The owner
// decides", with at least one row, and no row about the way of working
// (tests-first belongs to the bots); and a section "Install" holding a fenced
// block of one line, the line a project adds to its AGENTS.md, naming the
// skill skills/assuredloop/SKILL.md, which exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKILL = 'skills/assuredloop/SKILL.md';

const readme = () => readFileSync(join(ROOT, 'README.md'), 'utf8');

// The lines of the section under the ATX heading whose text is `title`, up
// to the next heading of any level (lines inside fenced blocks are not
// headings).
function section(text, title) {
  const ls = text.split('\n');
  const at = ls.findIndex((l) => /^#{1,6} /.test(l) && l.replace(/^#{1,6} /, '').trim() === title);
  assert.ok(at >= 0, `README.md should have a heading "${title}":\n${text}`);
  const out = [];
  let fenced = false;
  for (const l of ls.slice(at + 1)) {
    if (/^(```|~~~)/.test(l)) fenced = !fenced;
    if (!fenced && /^#{1,6} /.test(l)) break;
    out.push(l);
  }
  return out;
}

// A table row's cells, the outer pipes dropped and each cell trimmed.
const cells = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

// The first Markdown table in `ls`: its header cells and its body rows' cells.
function table(ls) {
  const start = ls.findIndex((l) => l.trim().startsWith('|'));
  assert.ok(start >= 0, `expected a Markdown table:\n${ls.join('\n')}`);
  const rows = [];
  for (const l of ls.slice(start)) {
    if (!l.trim().startsWith('|')) break;
    rows.push(l);
  }
  assert.ok(rows.length >= 2 && cells(rows[1]).every((c) => /^:?-{3,}:?$/.test(c)),
    `the header row should be followed by a delimiter row (| --- | --- | --- |):\n${rows.join('\n')}`);
  return { header: cells(rows[0]), body: rows.slice(2).map(cells) };
}

test('[TL-3] README.md has "What is enforced, and by whom": a table with exactly the columns The tool checks, The skill asks, The owner decides, and at least one row', () => {
  const { header, body } = table(section(readme(), 'What is enforced, and by whom'));
  assert.deepEqual(header, ['The tool checks', 'The skill asks', 'The owner decides']);
  assert.ok(body.length >= 1, 'the table should have at least one row');
  for (const row of body) assert.equal(row.length, 3, `each row should have three cells: ${JSON.stringify(row)}`);
  assert.ok(body.some((row) => row.some((c) => c !== '')), 'at least one row should say something');
});

test('[TL-3] the way of working is out of the table: no row names tests-first or TDD', () => {
  const { body } = table(section(readme(), 'What is enforced, and by whom'));
  for (const row of body) {
    assert.doesNotMatch(row.join(' | '), /\btests?[- ]first\b|\bTDD\b/i, `the way of working belongs to the bots:\n${row.join(' | ')}`);
  }
});

test('[TL-4] README.md has "Install": one fenced block of exactly one line, the line for AGENTS.md, naming skills/assuredloop/SKILL.md, which exists', () => {
  const ls = section(readme(), 'Install');
  const open = ls.findIndex((l) => /^(```|~~~)/.test(l));
  assert.ok(open >= 0, `the Install section should hold a fenced code block:\n${ls.join('\n')}`);
  const fence = ls[open].match(/^(```|~~~)/)[1];
  const close = ls.findIndex((l, i) => i > open && l.startsWith(fence));
  assert.ok(close > open, `the fenced block should be closed:\n${ls.join('\n')}`);
  const inside = ls.slice(open + 1, close);
  assert.equal(inside.length, 1, `the fenced block should hold exactly one line:\n${inside.join('\n')}`);
  assert.ok(inside[0].includes(SKILL), `the line should name ${SKILL}: ${inside[0]}`);
  assert.ok(existsSync(join(ROOT, SKILL)), `${SKILL} should exist`);
});
