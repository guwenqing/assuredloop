// Helpers for the T11 view and conclude tests (#179): run a command in a state
// of the invoicer world and find the lines that hold given facts.
import assert from 'node:assert/strict';
import { al, show, tree } from './project.js';

export { show };

// An ID as a whole word: SP-1 does not match SP-10; invoice-exports/SP-1 matches SP-1.
export const word = (id) => new RegExp(`(?<![\\w-])${id.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?![\\w-])`);

const matches = (line, part) => (part instanceof RegExp ? part.test(line) : line.includes(part));
export const lines = (r) => r.stdout.split('\n');
export const linesWith = (r, ...parts) => lines(r).filter((l) => parts.every((p) => matches(l, p)));
const describe = (parts) => parts.map(String).join(' & ');

export function has(r, ...parts) {
  const found = linesWith(r, ...parts);
  assert.ok(found.length >= 1, `a line with ${describe(parts)}:\n${show(r)}`);
  return found[0];
}
export function hasNot(r, ...parts) {
  assert.deepEqual(linesWith(r, ...parts), [], `no line with ${describe(parts)}:\n${show(r)}`);
}

// A view: exit 0, nothing written, and the closing Read, Next and Not known lines.
export function view(dir, args) {
  const before = tree(dir);
  const r = al(dir, args);
  assert.equal(r.code, 0, show(r));
  assert.deepEqual(tree(dir), before, `a view writes nothing:\n${show(r)}`);
  const ls = r.stdout.replace(/\n+$/, '').split('\n');
  assert.match(ls.at(-3) ?? '', /^Read {6}\S/, `Read line:\n${show(r)}`);
  assert.match(ls.at(-2) ?? '', /^Next {6}\S/, `Next line:\n${show(r)}`);
  assert.match(ls.at(-1) ?? '', /^Not known \S/, `Not known line:\n${show(r)}`);
  return r;
}

// `al-v4 conclude`: the run, and whether it wrote anything.
export function conclude(dir, ...args) {
  const before = tree(dir);
  const r = al(dir, ['conclude', ...args]);
  const wrote = JSON.stringify(tree(dir)) !== JSON.stringify(before);
  return { ...r, wrote, refused: lines(r).filter((l) => l.startsWith('refused: ')) };
}
