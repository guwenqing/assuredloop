// Readers for the list of #58 in the output of `al check` (what is in force
// for a change), for file-scope-58.test.js and design-outputs-58.test.js.
// Nothing here reads the code under test.
import assert from 'node:assert/strict';
import { al, read, show } from './project.js';

export { show };

// `al check` with these arguments; exit 0.
export function check(dir, ...args) {
  const r = al(dir, ['check', ...args]);
  assert.equal(r.code, 0, show(r));
  return r;
}

export const out = (r) => r.stdout.split('\n');
export const GROUPED = /^(\d+) further items in force: (\d+) with no known scope: (.*); (\d+) with a scope that does not match this change: (.*)$/;
export const isGroupedFull = (l) => /^in force \S+ grouped, /.test(l);
// The shown `in force` lines (not the --full lines of grouped items).
export const shown = (r) => out(r).filter((l) => l.startsWith('in force ') && !isGroupedFull(l));
export const idOf = (l) => l.split(' ')[2];

export function inForce(r, id) {
  const found = shown(r).filter((l) => l.startsWith(`in force ${id} `));
  assert.equal(found.length, 1, `one "in force ${id} " line:\n${show(r)}`);
  return found[0];
}
export function notInForce(r, id) {
  assert.deepEqual(shown(r).filter((l) => l.startsWith(`in force ${id} `)), [], `no shown "in force ${id} " line:\n${show(r)}`);
}
export function proposed(r, what) {
  const found = out(r).filter((l) => l.startsWith(`proposed ${what} `));
  assert.equal(found.length, 1, `one "proposed ${what} " line:\n${show(r)}`);
  return found[0];
}
export function notProposed(r, what) {
  assert.deepEqual(out(r).filter((l) => l.startsWith(`proposed ${what} `)), [], `no "proposed ${what} " line:\n${show(r)}`);
}
export function oneLine(r, prefix) {
  const found = out(r).filter((l) => l.startsWith(prefix));
  assert.equal(found.length, 1, `one line that starts with "${prefix}":\n${show(r)}`);
  return found[0];
}

// The grouped line, read; its counts must agree with its lists.
export function grouped(r) {
  const found = out(r).filter((l) => GROUPED.test(l));
  assert.equal(found.length, 1, `one grouped line "<N> further items in force: ...":\n${show(r)}`);
  const m = GROUPED.exec(found[0]);
  const ids = (s) => (s === 'none' ? [] : s.split(', '));
  const g = { line: found[0], n: Number(m[1]), u: Number(m[2]), unknown: ids(m[3]), k: Number(m[4]), mismatch: ids(m[5]) };
  assert.equal(g.u, g.unknown.length, `U is the number of IDs named:\n${show(r)}`);
  assert.equal(g.k, g.mismatch.length, `K is the number of IDs named:\n${show(r)}`);
  assert.equal(g.n, g.u + g.k, `N = U + K:\n${show(r)}`);
  return g;
}

export const hintCodes = (r) => [...new Set(out(r).map((l) => /^hint (\S+) /.exec(l)?.[1]).filter(Boolean))].sort();
export const hintLines = (r, code) => out(r).filter((l) => l.startsWith(`hint ${code} `));

// The 1-based number of the first line of file that is exactly text.
export function lineOf(dir, file, text) {
  const at = read(dir, file).split('\n').indexOf(text);
  assert.ok(at >= 0, `${file} has the line ${JSON.stringify(text)}`);
  return at + 1;
}
