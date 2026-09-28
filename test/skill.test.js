// The skill, skills/assuredloop/SKILL.md [TL-4], acceptance C9: YAML
// frontmatter between two `---` lines, with `name: assuredloop` and a
// description; a body (every line after the closing `---`, blank lines
// included) of 40 lines or fewer; the body's first `## ` heading is
// "## Quick path (tiers 0 and 1)", and the quick path (that heading line
// through the line before the next `## ` heading, or the end, not counting
// the blank lines just before that heading or the end) is 15 lines or fewer.
// Every `al <command> ...` in an inline code span or a fenced block names one
// of the seven commands [TL-1], and the CLI takes every --flag it passes:
// run in a throwaway repo, al never answers "Unknown option" for it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRepo, runAl } from './helpers/fixture.js';
import { both } from './helpers/request.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKILL = 'skills/assuredloop/SKILL.md';
const SEVEN = ['new', 'context', 'spec', 'check', 'record', 'consolidate', 'conclude'];
const QUICK = '## Quick path (tiers 0 and 1)';

const text = () => readFileSync(join(ROOT, SKILL), 'utf8');
// The file's lines; a final newline does not make an extra line.
const linesOf = (s) => s.replace(/\n$/, '').split('\n');

// { front, body }: the frontmatter lines, and every line after the closing ---.
function parts() {
  const ls = linesOf(text());
  assert.equal(ls[0], '---', `${SKILL} should start with a --- line`);
  const close = ls.indexOf('---', 1);
  assert.ok(close > 0, `${SKILL} should close its frontmatter with a --- line`);
  return { front: ls.slice(1, close), body: ls.slice(close + 1) };
}

// The indexes of the body's `## ` headings, outside fenced blocks.
function h2(body) {
  const at = [];
  let fenced = false;
  body.forEach((l, i) => {
    if (/^(```|~~~)/.test(l)) fenced = !fenced;
    else if (!fenced && l.startsWith('## ')) at.push(i);
  });
  return at;
}

// Every `al ...` command in the skill's inline code spans and fenced lines,
// cut at `;`, `&&`, `||` or a ` | ` between commands.
function commands() {
  const snippets = [];
  let fenced = false;
  for (const l of linesOf(text())) {
    if (/^\s*(```|~~~)/.test(l)) { fenced = !fenced; continue; }
    if (fenced) snippets.push(l);
    else for (const m of l.matchAll(/`([^`\n]+)`/g)) snippets.push(m[1]);
  }
  const out = [];
  for (const s of snippets) {
    for (const piece of s.split(/;|&&|\|\||\s\|\s/)) {
      const m = piece.match(/(?:^|[\s($])al\s+(\S+)(.*)$/);
      if (m) out.push({ command: m[1], rest: m[2], source: piece.trim() });
    }
  }
  return out;
}

test('C9 [TL-4] the skill has frontmatter with name: assuredloop and a description', () => {
  const { front } = parts();
  assert.ok(front.includes('name: assuredloop'), `the frontmatter should hold "name: assuredloop":\n${front.join('\n')}`);
  assert.ok(front.some((l) => /^description:/.test(l)), `the frontmatter should hold a description:\n${front.join('\n')}`);
});

test('C9 [TL-4] the skill\'s body, every line after the frontmatter, blank lines included, is 40 lines or fewer', () => {
  const { body } = parts();
  assert.ok(body.length <= 40, `the body is ${body.length} lines`);
});

test('C9 [TL-4] the body opens with the quick path: its first ## heading is "## Quick path (tiers 0 and 1)", and the quick path is 15 lines or fewer', () => {
  const { body } = parts();
  const heads = h2(body);
  assert.ok(heads.length > 0, 'the body should have a ## heading');
  assert.equal(body[heads[0]], QUICK);
  const quick = body.slice(heads[0], heads[1] ?? body.length);
  while (quick.length && quick.at(-1).trim() === '') quick.pop();
  assert.ok(quick.length <= 15, `the quick path is ${quick.length} lines:\n${quick.join('\n')}`);
});

test('C9 [TL-1][TL-4] every al command in the skill names one of the seven commands', () => {
  const found = commands();
  assert.ok(found.length > 0, `${SKILL} should show at least one al command`);
  for (const { command, source } of found) {
    assert.ok(SEVEN.includes(command), `"${source}" names ${command}, not one of ${SEVEN.join(', ')}`);
  }
});

test('C9 [TL-1][TL-4] the CLI takes every --flag the skill passes: al never answers "Unknown option", for the command as written or for the flag alone', (t) => {
  const repo = makeRepo(t);
  const found = commands().filter(({ command }) => SEVEN.includes(command));
  let flags = 0;
  // How the CLI answers an option it does not take; shown to hold for each command first.
  const rejected = (r) => /unknown option/i.test(both(r));
  for (const command of SEVEN) {
    const r = runAl(repo.dir, [command, '--no-such-flag']);
    assert.ok(r.code === 2 && rejected(r), `the check itself: al ${command} --no-such-flag should answer "Unknown option":\n${both(r)}`);
  }
  for (const { command, rest, source } of found) {
    // As written: placeholders and brackets kept as plain words, [--x] opened.
    const words = rest.replace(/[[\]]/g, ' ').split(/\s+/).filter(Boolean);
    const r = runAl(repo.dir, [command, ...words]);
    assert.ok(!rejected(r), `"${source}" is rejected:\n${both(r)}`);
    for (const flag of rest.match(/(?<![\w-])--[a-z][a-z-]*/g) ?? []) {
      flags++;
      const alone = runAl(repo.dir, [command, flag]);
      assert.ok(!rejected(alone), `al ${command} ${flag} (from "${source}") is rejected:\n${both(alone)}`);
    }
  }
  assert.ok(flags > 0, `${SKILL} should pass at least one --flag (--yes, at least)`);
});
