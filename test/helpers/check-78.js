// Fixtures and readers for #78: al check as the one command for a change and
// its review (check-78.test.js, check-map-78.test.js,
// check-moments-78.test.js). Nothing here reads the code under test: only
// the command, its output, git and the files that al writes.
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  al, commitAll, doc, editRecord, git, index, ok, project, show, write, writeConfig,
} from './project.js';

export { show };

export const out = (r) => r.stdout.split('\n');

// A temp folder, removed when the test ends.
export function tempRoot(t, prefix = 'al-v4-78-') {
  const root = mkdtempSync(join(realpathSync(tmpdir()), prefix));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

// `al check ...args` that exits 0.
export function check(dir, ...args) {
  const r = al(dir, ['check', ...args]);
  assert.equal(r.code, 0, show(r));
  return r;
}

// --- the records line

const RECORDS = /^records: al check wrote (.+); commit them with this change$/;
export const recordsLines = (r) => out(r).filter((l) => l.startsWith('records: '));

// The paths that the one `records:` line names, sorted.
export function recordsWritten(r) {
  const ls = recordsLines(r);
  assert.equal(ls.length, 1, `one "records: " line:\n${show(r)}`);
  const m = RECORDS.exec(ls[0]);
  assert.ok(m, `the line "records: al check wrote <path>, <path>; commit them with this change":\n${ls[0]}\n${show(r)}`);
  return m[1].split(', ').sort();
}
export function noRecordsLine(r) {
  assert.deepEqual(recordsLines(r), [], `no "records: " line:\n${show(r)}`);
}

// The record files that differ from HEAD: changed, deleted or new, sorted.
export function changedRecords(dir) {
  const listed = git(dir, 'ls-files', '-m', '-d', '-o', '--exclude-standard', '--', '.assuredloop/records');
  return [...new Set(listed.split('\n').filter(Boolean))].sort();
}

// --- the lines of al index inside al check

export const INDEX_KINDS = [
  'kept', 'bound', 'not bound', 'binding unknown', 'removed', 'not removed', 'not kept', 'not indexed', 'not read',
  'hints dropped', 'refresh hint',
];
export const indexLines = (r, kind) => out(r).filter((l) => l.startsWith(`index ${kind}: `));

// The one `index <kind>: ` line.
export function indexLine(r, kind) {
  const ls = indexLines(r, kind);
  assert.equal(ls.length, 1, `one "index ${kind}: " line:\n${show(r)}`);
  return ls[0];
}

// --- the ok line (LD-41)

const OK = /^ok: nothing found by ([a-z0-9-]+(?:, [a-z0-9-]+)*)$/;

// The codes of the one `ok: nothing found by ...` line.
export function okCodes(r) {
  const ls = out(r).filter((l) => l.startsWith('ok: '));
  assert.equal(ls.length, 1, `one "ok: " line:\n${show(r)}`);
  const m = OK.exec(ls[0]);
  assert.ok(m, `the line "ok: nothing found by <code>, <code>, ...":\n${ls[0]}\n${show(r)}`);
  const codes = m[1].split(', ');
  assert.equal(new Set(codes).size, codes.length, `each code once:\n${ls[0]}`);
  return codes;
}

// The codes of the hint and not ok lines.
export const findingCodes = (r) => [...new Set(out(r)
  .map((l) => /^(?:hint|not ok) (\S+) /.exec(l))
  .filter(Boolean)
  .map((m) => m[1]))];

// --- the map's paragraph lines (point 8 of the interface)

const PARA = /^map paragraph (\S+) · (.+?) · (\S+) · (.+)$/;
const PARA_GROUP = /^map paragraph · (\d+) paragraphs · ([^:]+): (.+)$/;

export const paragraphLines = (r) => out(r).filter((l) => l.startsWith('map paragraph '));

// Every paragraph entry of the map, single or grouped:
// {id, place, kind, change, grouped, line}. A grouped line must count its IDs.
export function paragraphEntries(r) {
  const list = [];
  for (const line of paragraphLines(r)) {
    const g = PARA_GROUP.exec(line);
    if (g) {
      const items = [...g[3].matchAll(/(\S+) (\S+) \(([^()]+)\)(?:, |$)/g)];
      assert.equal(items.length, Number(g[1]), `a grouped line names as many paragraphs as its count:\n${line}\n${show(r)}`);
      assert.ok(items.length >= 2, `a group has two or more paragraphs:\n${line}`);
      for (const [, id, kind, place] of items) list.push({ id, kind, place, change: g[2], grouped: true, line });
      continue;
    }
    const m = PARA.exec(line);
    assert.ok(m, `a map paragraph line in a known form:\n${line}\n${show(r)}`);
    list.push({ id: m[1], place: m[2], kind: m[3], change: m[4], grouped: false, line });
  }
  return list;
}

// The one paragraph entry of id.
export function paragraphEntry(r, id) {
  const found = paragraphEntries(r).filter((e) => e.id === id);
  assert.equal(found.length, 1, `one map paragraph entry for ${id}:\n${show(r)}`);
  return found[0];
}
export function noParagraphEntry(r, id) {
  assert.deepEqual(paragraphEntries(r).filter((e) => e.id === id), [], `no map paragraph entry for ${id}:\n${show(r)}`);
}

// The paragraph lines come after the map's first line and before the Read line.
export function paragraphsInMap(r) {
  const ls = out(r);
  const head = ls.findIndex((l) => l.startsWith('map: '));
  assert.ok(head >= 0, `a "map: " line:\n${show(r)}`);
  const readAt = ls.findIndex((l) => /^Read {6}/.test(l));
  for (const l of paragraphLines(r)) {
    const i = ls.indexOf(l);
    assert.ok(i > head, `a paragraph line comes after the map's first line:\n${l}\n${show(r)}`);
    if (readAt >= 0) assert.ok(i < readAt, `a paragraph line comes before the Read line:\n${l}\n${show(r)}`);
  }
}

// The indented lines right under the first line that starts with `start`,
// trimmed (--full).
export function under(r, start) {
  const ls = out(r);
  const at = ls.findIndex((l) => l.startsWith(start));
  assert.ok(at >= 0, `a line that starts with ${JSON.stringify(start)}:\n${show(r)}`);
  const block = [];
  for (let i = at + 1; i < ls.length && /^\s+\S/.test(ls[i]); i++) block.push(ls[i].trim());
  return block;
}

// In a block: a line that matches `head`, and `text` on a later line.
export function followedBy(r, block, head, text) {
  const h = block.findIndex((l) => (head instanceof RegExp ? head.test(l) : l === head));
  assert.ok(h >= 0, `a line ${head} in the block:\n${block.join('\n')}\n${show(r)}`);
  assert.ok(block.slice(h + 1).includes(text), `${JSON.stringify(text)} after ${head}:\n${block.join('\n')}\n${show(r)}`);
  return h;
}

// --- clones

let clones = 0;

// A clone of dir: `git clone [--depth N] [--no-single-branch] --branch <branch> file://<dir>`,
// in root (a temp folder by default). `main` makes a local branch main at
// that revision (a sha, or origin/main).
export function cloneOf(t, dir, { branch, depth, noSingle = false, main, root } = {}) {
  const at = root ?? tempRoot(t, 'al-v4-78-clone-');
  const c = join(at, `clone-${++clones}`);
  const args = ['clone', '-q'];
  if (depth) args.push('--depth', String(depth));
  if (noSingle) args.push('--no-single-branch');
  args.push('--branch', branch, `file://${dir}`, c);
  git(at, ...args);
  if (main) git(c, 'branch', '-f', 'main', main);
  return c;
}

// A merge commit of `from` into main's tip on a third branch (as GitHub's
// refs/pull/N/merge): {merge, mainTip}. Leaves the repo on that branch.
export function mergeRef(dir, { name = 'pr-merge', from = 'feature' } = {}) {
  git(dir, 'checkout', '-q', 'main');
  git(dir, 'checkout', '-q', '-b', name);
  git(dir, 'merge', '-q', '--no-ff', '-m', `Merge ${from} into main`, from);
  return { merge: git(dir, 'rev-parse', 'HEAD'), mainTip: git(dir, 'rev-parse', 'main') };
}

export const isShallow = (dir) => git(dir, 'rev-parse', '--is-shallow-repository') === 'true';

// A copy of a whole folder, .git included, in a new temp folder.
export function copyOf(t, dir) {
  const c = join(tempRoot(t, 'al-v4-78-copy-'), 'copy');
  cpSync(dir, c, { recursive: true, verbatimSymlinks: true });
  return c;
}

// --- a change with no finding (LD-41)

// main: a spec with explain and note paragraphs only, indexed and committed.
// The branch feature: one source file, committed with a Tier claim.
export const QUIET = doc([
  ['INV-1 note', '# Invoices'],
  ['INV-2 rationale', 'Invoices go by email.'],
  ['INV-4 example', 'One line of 10.00.'],
]);
export function quietChange(t, { spec = QUIET } = {}) {
  const dir = project(t);
  writeConfig(dir);
  write(dir, 'specs/invoices.md', spec);
  index(dir);
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  write(dir, 'src/a.js', 'export const a = 1;\n');
  commitAll(dir, 'Refactor the reader\n\nTier: 0 — refactor');
  return dir;
}

// --- saved work items (C7)

export const ITEMS = '../items';

// <root>/repo, a git repo with origin acme/invoicer and a spec on main, then
// the branch feature; the items folder is <root>/items.
export function itemsWorld(t) {
  const root = tempRoot(t, 'al-v4-78-items-');
  const dir = join(root, 'repo');
  const items = join(root, 'items');
  mkdirSync(dir);
  mkdirSync(items);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.name', 'Fixture Author');
  git(dir, 'config', 'user.email', 'author@example.invalid');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'remote', 'add', 'origin', 'git@github.com:acme/invoicer.git');
  writeConfig(dir);
  write(dir, 'specs/invoices.md', QUIET);
  index(dir);
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  return { root, dir, items };
}

// Item n in the shape of `gh issue view --json number,url,body,comments,parent,state`.
export function saveItem(w, n, body = 'Build the export.\n') {
  const url = `https://github.com/acme/invoicer/issues/${n}`;
  write(w.items, `invoicer-${n}.json`, `${JSON.stringify({ body, comments: [], number: n, parent: null, state: 'OPEN', url }, null, 2)}\n`);
}

// The request inv with task T1 on item #5, not committed.
export function nameItem(w) {
  ok(w.dir, ['new', 'inv', '--from', '-'], { input: 'The owner wants the monthly export.\n' });
  editRecord(w.dir, 'inv', (rec) => { rec.tasks = [{ id: 'T1', ref: '#5' }]; });
}
export const INV_CLAIM = 'inv: name the item\n\nTier: 1 — inv';

// The issue-changed lines for item #5.
export const issueLines = (r) => out(r).filter((l) => l.startsWith('hint issue-changed ') && /(#|\/issues\/)5(?!\d)/.test(l));

// The one issue-changed hint for #5: "not known", never "unchanged".
export function assertNotKnown(r) {
  const ls = issueLines(r);
  assert.equal(ls.length, 1, `one issue-changed hint for #5:\n${show(r)}`);
  assert.match(ls[0], /not known/, `"not known":\n${show(r)}`);
  assert.doesNotMatch(ls[0], /\bunchanged\b/, `never "unchanged":\n${show(r)}`);
  return ls[0];
}
// The one issue-changed hint for #5: "changed", not "not known".
export function assertChanged(r) {
  const ls = issueLines(r);
  assert.equal(ls.length, 1, `one issue-changed hint for #5:\n${show(r)}`);
  assert.match(ls[0], /changed/, show(r));
  assert.doesNotMatch(ls[0], /not known/, `a kept text gives "changed", not "not known":\n${show(r)}`);
  return ls[0];
}
