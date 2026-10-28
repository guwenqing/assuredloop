// #78: al check runs al index first, so al index must not crash on a derived
// doc record (.assuredloop/records/specs/<file>.md.yaml) whose `paragraphs`
// is not a YAML list. Such a record follows the rule of #245 for a doc
// record that al index cannot read: al index rebuilds it from the doc and
// prints
//   hints dropped: <record> could not be read, so it was rebuilt with no hints
// al check prints the same text as one `index hints dropped: ` line, exits 0
// and still prints its other output. A valid record keeps its hints.
//
// Written from the requirement and the public interface only. Nothing here
// reads src/. No model and no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  al, baseProject, commitAll, docRecord, docRecordPath, git, index, read, readYaml, show, write, writeYaml,
} from './helpers/project.js';

const SPEC = 'specs/invoices.md';
const RECORD = docRecordPath(SPEC);
const DROPPED = `hints dropped: ${RECORD} could not be read, so it was rebuilt with no hints`;

const lines = (r) => r.stdout.split('\n');
// The IDs of the marked paragraphs of the doc, in order.
const markedIds = (dir) => [...read(dir, SPEC).matchAll(/^<!-- (\S+)/gm)].map((m) => m[1]);

// The base of baseProject on main, indexed and committed, then the branch
// feature with one source commit, so that al check has a change. Then
// `change` edits the doc record, uncommitted.
function world(t, change) {
  const dir = baseProject(t, { branch: null });
  index(dir);
  commitAll(dir, 'records');
  git(dir, 'checkout', '-q', '-b', 'feature');
  write(dir, 'src/share.js', 'export const hours = 24;\n');
  commitAll(dir, 'a source change\n\nTier: 0 — restores INV-41');
  if (change) {
    const rec = readYaml(dir, RECORD);
    change(rec);
    writeYaml(dir, RECORD, rec);
  }
  return dir;
}

function run(dir, args) {
  const r = al(dir, args);
  assert.equal(r.code, 0, show(r));
  assert.doesNotMatch(r.stdout + r.stderr, /internal error/, show(r));
  return r;
}

// The record was rebuilt: paragraphs is a list with one entry for each marked paragraph.
function rebuilt(dir, r) {
  const rec = docRecord(dir, SPEC);
  assert.ok(Array.isArray(rec.paragraphs), `paragraphs is a list:\n${read(dir, RECORD)}\n${show(r)}`);
  assert.deepEqual(rec.paragraphs.map((p) => p.id), markedIds(dir), `one entry for each marked paragraph:\n${read(dir, RECORD)}`);
}

for (const [what, value] of [['a string', 'bad'], ['a mapping', { id: 'INV-12' }]]) {
  test(`#78 al index on a doc record whose paragraphs is ${what}: exit 0, the "hints dropped" line, the record rebuilt`, (t) => {
    const dir = world(t, (rec) => { rec.paragraphs = value; });
    const r = run(dir, ['index']);
    assert.ok(lines(r).includes(DROPPED), `the line "${DROPPED}":\n${show(r)}`);
    rebuilt(dir, r);
  });

  test(`#78 al check on a doc record whose paragraphs is ${what}: exit 0, one "index hints dropped" line, the other output, the record rebuilt`, (t) => {
    const dir = world(t, (rec) => { rec.paragraphs = value; });
    const r = run(dir, ['check']);
    assert.deepEqual(lines(r).filter((l) => l.startsWith('index hints dropped: ')), [`index ${DROPPED}`], `one "index hints dropped: " line:\n${show(r)}`);
    assert.equal(lines(r).filter((l) => l.startsWith('ok: nothing found by ')).length, 1, `the ok line:\n${show(r)}`);
    assert.equal(lines(r).filter((l) => l.startsWith('map: ')).length, 1, `the map line:\n${show(r)}`);
    rebuilt(dir, r);
  });
}

test('#78 control: a valid doc record whose paragraph has a hint keeps it, with no "hints dropped" line in al check or al index', (t) => {
  let hint;
  const dir = world(t, (rec) => {
    const p = rec.paragraphs.find((x) => x.id === 'INV-12');
    hint = { basis_sha256: p.text_sha256, summary: 'An invoice has a number.' };
    p.hint = hint;
  });
  const ck = run(dir, ['check']);
  assert.deepEqual(lines(ck).filter((l) => l.startsWith('index hints dropped: ')), [], show(ck));
  assert.deepEqual(docRecord(dir, SPEC).paragraphs.find((p) => p.id === 'INV-12').hint, hint, `INV-12 keeps its hint:\n${show(ck)}`);
  const ix = run(dir, ['index']);
  assert.deepEqual(lines(ix).filter((l) => l.startsWith('hints dropped: ')), [], show(ix));
  assert.deepEqual(docRecord(dir, SPEC).paragraphs.find((p) => p.id === 'INV-12').hint, hint, `INV-12 keeps its hint:\n${show(ix)}`);
});
