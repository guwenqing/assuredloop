// #78: al check runs al index first, so al index must not crash on a request
// record whose list (requirements, bindings, reviewed, items) is not a YAML
// list. al index skips that record: it writes nothing to it, exits 0 and
// prints one line
//   not read: <record> is not a valid record: its <key> is not a list
// al check prints the same text as one `index not read: ` line, exits 0, and
// still reports the record by its own checks. Before the fix, al index
// stopped with "al: internal error: TypeError".
//
// Written from the requirement and the public interface only. Nothing here
// reads src/. No model and no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  al, appendSection, baseProject, commitAll, editRecord, index, newRequest, organized, recordPath, req, show,
} from './helpers/project.js';

const NAME = 'inv';
const RECORD = recordPath(NAME);
const R1 = req('R1', 'One line at least', 'An invoice MUST have at least one line.');

const lines = (r) => r.stdout.split('\n');
const bytes = (dir) => readFileSync(join(dir, RECORD));
const notRead = (key) => `not read: ${RECORD} is not a valid record: its ${key} is not a list`;

// A request with R1 in request.md, indexed and committed. Then the record is
// changed by `change`, if one is given.
function world(t, change) {
  const dir = baseProject(t);
  newRequest(dir, NAME);
  appendSection(dir, NAME, organized([R1]));
  index(dir);
  commitAll(dir, 'the request');
  if (change) editRecord(dir, NAME, change);
  return dir;
}

// Exit 0, and no crash line.
function runs(dir, args) {
  const r = al(dir, args);
  assert.equal(r.code, 0, show(r));
  assert.doesNotMatch(r.stdout + r.stderr, /internal error/, show(r));
  return r;
}

// 1 and 2: al index skips the record, prints the line and writes nothing to it.
for (const [key, what, value] of [
  ['requirements', 'a string', 'just a string'],
  ['requirements', 'a mapping', { id: 'R1', version: 1 }],
  ['bindings', 'a string', 'just a string'],
  ['reviewed', 'a string', 'just a string'],
  ['items', 'a string', 'just a string'],
]) {
  test(`#78 al index on a record whose ${key} is ${what}: exit 0, the "not read" line names ${key}, the record bytes are unchanged`, (t) => {
    const dir = world(t, (rec) => { rec[key] = value; });
    const before = bytes(dir);
    const r = runs(dir, ['index']);
    assert.ok(lines(r).includes(notRead(key)), `the line "${notRead(key)}":\n${show(r)}`);
    assert.deepEqual(bytes(dir), before, `al index writes nothing to ${RECORD}:\n${show(r)}`);
  });
}

// 3: al check, which runs al index first, on a record whose requirements is not a list.
for (const [what, value] of [['a string', 'just a string'], ['a mapping', { id: 'R1', version: 1 }]]) {
  test(`#78 al check on a record whose requirements is ${what}: exit 0, one "index not read" line, not ok unsigned-requirement in ${NAME}, the record bytes are unchanged`, (t) => {
    const dir = world(t, (rec) => { rec.requirements = value; });
    const before = bytes(dir);
    const r = runs(dir, ['check']);
    const found = lines(r).filter((l) => l.startsWith('index not read: '));
    assert.deepEqual(found, [`index ${notRead('requirements')}`], `one "index not read: " line:\n${show(r)}`);
    const unsigned = lines(r).filter((l) => /^not ok unsigned-requirement \S+ inv(\/\S*)? /.test(l));
    assert.ok(unsigned.length > 0, `a not ok unsigned-requirement in ${NAME}:\n${show(r)}`);
    assert.deepEqual(bytes(dir), before, `al check writes nothing to ${RECORD}:\n${show(r)}`);
  });
}

// 4: the control. The same world with a valid record has no "not read" line.
test('#78 control: a valid record gives no "not read" line in al index or in al check', (t) => {
  const dir = world(t);
  const ix = runs(dir, ['index']);
  assert.deepEqual(lines(ix).filter((l) => l.startsWith('not read: ')), [], show(ix));
  const ck = runs(dir, ['check']);
  assert.deepEqual(lines(ck).filter((l) => l.startsWith('index not read: ')), [], show(ck));
});
