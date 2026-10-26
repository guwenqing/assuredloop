// #78: an `al check` run never changes which requests are the change's own
// (requests/light-design/spec.md LD-63; the own requests are defined in
// LD-24). al check takes them from the working tree as it was before its
// index step wrote anything. Its records line keeps two groups apart:
//   records: al check wrote <files>; commit them with this change
//     (the records of the own requests, and the other record files)
//   records: al check also wrote <files> of requests that are not this
//   change's own: their records were not up to date
// Each line shows only when it has a file. Files are joined by ", ".
//
// Written from the requirement and the public interface only. Nothing here
// reads src/. No model and no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  al, appendSection, baseProject, commitAll, git, index, newRequest, organized, read, recordPath, req, show, write,
} from './helpers/project.js';

// A is the request of the change. B is another open request on main.
const A = 'csv-export';
const B = 'zip-archive';
const R1 = req('R1', 'Monthly CSV', 'A user MUST be able to download one month as one CSV file.');
const R2 = req('R2', 'Yearly ZIP', 'A user MUST be able to download one year as one ZIP file.');

const lines = (r) => r.stdout.split('\n');
const bytes = (dir, rel) => readFileSync(join(dir, rel));

const WROTE = /^records: al check wrote (.+); commit them with this change$/;
const ALSO = /^records: al check also wrote (.+) of requests that are not this change's own: their records were not up to date$/;
const MAP = /^map: the change against its base \S+ \(own changes: ([^)]*)\)/;

// The files of each line that matches `re`, all in one list.
function filesOf(r, re) {
  return lines(r).map((l) => re.exec(l)).filter(Boolean).flatMap((m) => m[1].split(', '));
}
const recordsLinesOf = (r, re) => lines(r).filter((l) => re.test(l));

// The own changes that the one map header line names.
function ownOf(r) {
  const found = lines(r).map((l) => MAP.exec(l)).filter(Boolean);
  assert.equal(found.length, 1, `one map header line:\n${show(r)}`);
  return found[0][1].split(', ');
}

// Main holds the open requests A and B, each with R1, indexed and committed.
// With `stale`, B's request.md then gets R2 on main, committed with no al
// index, so B's record is not up to date. Then the branch feature changes a
// file in A's folder (and in B's folder, with `touchB`), and commits it with
// a message that names only A.
function world(t, { stale = true, touchB = false } = {}) {
  const dir = baseProject(t, { branch: null });
  for (const name of [A, B]) {
    newRequest(dir, name);
    appendSection(dir, name, organized([R1]));
  }
  index(dir);
  commitAll(dir, 'two open requests');
  if (stale) {
    const md = `requests/${B}/request.md`;
    write(dir, md, `${read(dir, md)}\n${R2.block}`);
    commitAll(dir, 'a second requirement, not indexed');
  }
  git(dir, 'checkout', '-q', '-b', 'feature');
  write(dir, `requests/${A}/notes.md`, 'A note for the change.\n');
  if (touchB) write(dir, `requests/${B}/notes.md`, 'A note in the other folder.\n');
  commitAll(dir, `${A}: a note`);
  return dir;
}

function check(dir) {
  const r = al(dir, ['check']);
  assert.equal(r.code, 0, show(r));
  return r;
}

// 1. B's record is not up to date, and the change does not touch B.
test(`#78 al check writes the record of a request that is not own: the "also wrote" line names it, and the request stays not own`, (t) => {
  const dir = world(t);
  const before = bytes(dir, recordPath(B));
  const r = check(dir);
  assert.notDeepEqual(bytes(dir, recordPath(B)), before, `al check writes ${recordPath(B)}:\n${show(r)}`);
  assert.equal(recordsLinesOf(r, ALSO).length, 1, `one "records: al check also wrote" line:\n${show(r)}`);
  assert.ok(filesOf(r, ALSO).includes(recordPath(B)), `the "also wrote" line names ${recordPath(B)}:\n${show(r)}`);
  assert.ok(!filesOf(r, WROTE).includes(recordPath(B)), `no "records: al check wrote" line names ${recordPath(B)}:\n${show(r)}`);
  const own = ownOf(r);
  assert.ok(own.includes(A), `the map header names ${A}:\n${show(r)}`);
  assert.ok(!own.includes(B), `the map header does not name ${B}:\n${show(r)}`);
  assert.deepEqual(lines(r).filter((l) => l.startsWith(`proposed ${B}/`)), [], `no "proposed ${B}/" line:\n${show(r)}`);
});

// 2. Control: the change also touches B's folder, so B is own.
test(`#78 control: the change touches B's folder, so B is own and its record is in the "wrote" line, not the "also wrote" line`, (t) => {
  const dir = world(t, { touchB: true });
  const r = check(dir);
  const own = ownOf(r);
  assert.ok(own.includes(A) && own.includes(B), `the map header names ${A} and ${B}:\n${show(r)}`);
  assert.ok(!filesOf(r, ALSO).includes(recordPath(B)), `the "also wrote" line does not name ${recordPath(B)}:\n${show(r)}`);
  const written = git(dir, 'status', '--porcelain', '--', recordPath(B)) !== '';
  if (written) assert.ok(filesOf(r, WROTE).includes(recordPath(B)), `the "wrote" line names ${recordPath(B)}:\n${show(r)}`);
});

// 3. Control: no record is out of date, so there is no "also wrote" line.
test('#78 control: no record is out of date, so there is no "also wrote" line', (t) => {
  const dir = world(t, { stale: false });
  const r = check(dir);
  assert.deepEqual(recordsLinesOf(r, /^records: al check also wrote /), [], show(r));
  assert.ok(!ownOf(r).includes(B), `the map header does not name ${B}:\n${show(r)}`);
});
