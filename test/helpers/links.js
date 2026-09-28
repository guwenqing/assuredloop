// Git fixtures and output readers for the part-6 link tests [LNK-1] [LNK-2]
// [VW-3] [VW-4] [VW-6]: blame as git itself gives it (so a test can show its
// fixture holds the history it claims), a squash merge with git's default
// message, and the labelled blocks of a view. Nothing here reads the code
// under test.
import assert from 'node:assert/strict';
import { runAl } from './fixture.js';
import { assertFrame, lines } from './output.js';

export const file = (...sections) => sections.join('\n');

// The commit git blame gives each line from-to of `path` at `rev`, with `flags`.
export function blamed(repo, rev, path, [from, to], flags = []) {
  const out = repo.git(['blame', ...flags, '--porcelain', '-L', `${from},${to}`, rev, '--', path]);
  return out.split('\n').filter((l) => /^[0-9a-f]{40} \d+ \d+/.test(l)).map((l) => l.slice(0, 40));
}

// Every line from-to blamed to `commit`.
export function assertBlamed(repo, rev, path, range, flags, commit) {
  const got = blamed(repo, rev, path, range, flags);
  assert.ok(got.length > 0 && got.every((c) => c === commit),
    `the fixture: blame ${flags.join(' ')} of ${path}:${range.join('-')} at ${rev} should give ${commit.slice(0, 7)}, got ${got.map((c) => c.slice(0, 7))}`);
}

// git merge --squash `branch` into the current branch, committed with git's
// default message (each branch commit's message indented by four spaces).
export function squashMerge(repo, branch, date) {
  repo.git(['merge', '-q', '--squash', branch]);
  repo.git(['commit', '-q', '--no-edit'], { date });
  return repo.head();
}

export const contextDiff = (repo, range, ...args) => runAl(repo.dir, ['context', '--diff', range, ...args]);
export const contextOf = (repo, arg) => runAl(repo.dir, ['context', arg]);

// The Read line of a view over a range is left open, beyond naming main.
export const assertDiffFrame = (stdout, main = 'local main') => assertFrame(stdout, { read: main, main });

// A label's block: each line that starts with `label` (after any '#' or
// spaces), with the lines after it that start with a space, '-', '*' or '·'.
export function labelled(stdout, label) {
  const ls = lines(stdout);
  const start = new RegExp(`^[#\\s]*${label}\\b`);
  const out = [];
  for (let i = 0; i < ls.length; i++) {
    if (!start.test(ls[i])) continue;
    out.push(ls[i]);
    while (i + 1 < ls.length && /^[\s\-*·]/.test(ls[i + 1]) && !start.test(ls[i + 1])) out.push(ls[++i]);
  }
  return out.join('\n');
}

// Whether a line of `text` holds `id`, then `word` before the next ID on that
// line: "INV-3 consolidated · INV-7 pending" says INV-7 is pending, not INV-3.
const ID_TOKEN = /[A-Z][A-Z0-9]*-\d+(?:\.\d+)*/g;
export function says(text, id, word) {
  const re = word instanceof RegExp ? word : new RegExp(`\\b${word}\\b`);
  return lines(text).some((line) => {
    const at = [...line.matchAll(ID_TOKEN)];
    return at.some((m, i) => m[0] === id && re.test(line.slice(m.index, at[i + 1]?.index)));
  });
}

// The index of the first of the lines `ls` at or after `from` that matches `re`, or -1.
export const indexOf = (ls, re, from = 0) => {
  const i = ls.slice(from).findIndex((l) => re.test(l));
  return i < 0 ? -1 : i + from;
};
