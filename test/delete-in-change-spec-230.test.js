// al check and a paragraph deleted from an open request's change spec (#230).
// R1: in an open request's change spec, deleting a paragraph is ordinary
// editing, and `al check --strict` does not fail on it. An ID is still never
// used again. In specs/, a removal still needs removes:.
//
// The architect's decisions: D1, a lost ID in the change spec of an open
// request is a hint, also under --strict; D2, in specs/ it stays not ok; D3,
// used-again, no-id and unresolved-link stay not ok in every scope; D4, the
// hint names each disposition and wording decision of the request that names
// the deleted ID. #72 (LD-58) removed the dispositions and the wording
// decisions, so the hint names none; an old record that holds them is read
// with no error.
//
// #238 R2 changes D2 and D3: lost-id, used-again, no-id and unresolved-link
// are hints in every scope and every mode, so --strict exits 0 on them.
//
// Each test builds a throwaway git repo: main holds the spec and the request,
// the branch `feature` changes the working tree, and al check compares it
// with the merge-base.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  al, commitAll, doc, editRecord, git, newRequest, ok, project, read, show, write, writeConfig,
} from './helpers/project.js';

const NAME = 'exp';
const SPEC = `requests/${NAME}/spec.md`;
const SPECS = 'specs/invoices.md';

// A spec doc of notes only, so that --strict has nothing to say about it.
// Markers on lines 1, 5 and 9.
const INVOICES = doc([
  ['INV-1 note', '# Invoices'],
  ['INV-2 note', 'Invoices are sent each month.'],
  ['INV-3 note', 'Each invoice has lines.'],
]);
const INV3 = '<!-- INV-3 note -->\n\nEach invoice has lines.\n';

// The change spec: plan paragraphs, which need no link. Markers on lines
// 1, 5, 9 and 13.
const PARAS = [
  ['SP-1 note', '# Exports'],
  ['SP-2 plan', 'Step one: add the route.'],
  ['SP-3 plan', 'Step two: add the button.'],
  ['SP-4 plan', 'Step three: write the docs.'],
];
const changeSpec = (paras = PARAS) => doc(paras);
const without = (...ids) => PARAS.filter(([m]) => !ids.includes(m.split(' ')[0]));

const HINT_TAIL = 'If that is on purpose, nothing more is needed: the ID is retired and never used again.';
// The one lost-id hint line of item 1. After the message, the place of the
// deleted paragraph's text at the base (#74): its marker line + 2.
const hintLine = (dir, name, line, id, facts = []) =>
  `hint lost-id requests/${name}/spec.md:${line} ${id} ${name}/${id} is deleted${facts.length ? `; ${facts.join('; ')}` : ''}. ${HINT_TAIL}`
  + ` · places: ${name}/${id} at the base ${git(dir, 'rev-parse', '--short=7', 'main')} requests/${name}/spec.md:${line + 2}`;

const lines = (r) => r.stdout.split('\n');
const coded = (r, code) => lines(r).filter((l) => new RegExp(`^(not ok|hint|info) ${code} `).test(l));
const notOk = (r) => lines(r).filter((l) => l.startsWith('not ok '));
const check = (dir, ...args) => al(dir, ['check', ...args]);

// main: the config, specs/invoices.md and the open request `exp` with its
// change spec, committed; then the branch `feature`.
function repo(t, { requests = [NAME], specs = INVOICES } = {}) {
  const dir = project(t);
  writeConfig(dir);
  write(dir, SPECS, specs);
  commitAll(dir, 'base');
  for (const name of requests) {
    newRequest(dir, name, `The owner wants ${name}.\n`, ['--tier', '2']);
    write(dir, `requests/${name}/spec.md`, changeSpec());
  }
  ok(dir, ['index']);
  commitAll(dir, `requests\n\nTier: 2 — ${requests.join(', ')}`);
  git(dir, 'checkout', '-q', '-b', 'feature');
  return dir;
}

// The marker IDs of a file, in file order.
const markerIds = (text) => [...text.matchAll(/^<!-- +([A-Z][A-Z0-9]*-[0-9]+)\b.*-->\s*$/gm)].map((m) => m[1]);

// --- item 1 and D1: a lost ID in an open request's change spec is a hint

test('1: SP-3 deleted from an open change spec: exactly one line, the hint, with no facts; exit 0', (t) => {
  const dir = repo(t);
  write(dir, SPEC, changeSpec(without('SP-3')));
  const r = check(dir);
  assert.equal(r.code, 0, show(r));
  assert.deepEqual(coded(r, 'lost-id'), [hintLine(dir, NAME, 9, 'SP-3')], show(r));
  assert.deepEqual(notOk(r), [], show(r));
});

test('1: under --strict the line stays hint, and with nothing else not ok the exit is 0, with no removes:', (t) => {
  const dir = repo(t);
  write(dir, SPEC, changeSpec(without('SP-3')));
  // A guard: the base state is clean under --strict.
  git(dir, 'stash', '-q');
  const before = check(dir, '--strict');
  assert.equal(before.code, 0, `the fixture is clean before the deletion:\n${show(before)}`);
  git(dir, 'stash', 'pop', '-q');
  const r = check(dir, '--strict');
  assert.deepEqual(coded(r, 'lost-id'), [hintLine(dir, NAME, 9, 'SP-3')], show(r));
  assert.deepEqual(notOk(r), [], show(r));
  assert.equal(r.code, 0, show(r));
  assert.ok(!read(dir, SPEC).includes('removes:'), 'no removes: anywhere in the change spec');
});

test('1: the same holds when the deletion is committed on the branch', (t) => {
  const dir = repo(t);
  write(dir, SPEC, changeSpec(without('SP-3')));
  commitAll(dir, `Drop SP-3\n\nTier: 2 — ${NAME}`);
  const r = check(dir, '--strict');
  assert.deepEqual(coded(r, 'lost-id'), [hintLine(dir, NAME, 9, 'SP-3')], show(r));
  assert.deepEqual(notOk(r), [], show(r));
  assert.equal(r.code, 0, show(r));
});

test('1: the line is the marker line in the base file: SP-4 deleted is line 13', (t) => {
  const dir = repo(t);
  write(dir, SPEC, changeSpec(without('SP-4')));
  const r = check(dir, '--strict');
  assert.deepEqual(coded(r, 'lost-id'), [hintLine(dir, NAME, 13, 'SP-4')], show(r));
  assert.equal(r.code, 0, show(r));
});

test('1 + D2 control: in the same run, a specs/ loss with no removes: is still lost-id, a hint (#238), exit 0 under --strict', (t) => {
  const dir = repo(t);
  write(dir, SPEC, changeSpec(without('SP-3')));
  write(dir, SPECS, INVOICES.replace(`\n${INV3}`, ''));
  assert.ok(!read(dir, SPECS).includes('INV-3'), 'INV-3 is gone from specs/');
  for (const args of [[], ['--strict']]) {
    const r = check(dir, ...args);
    const lost = coded(r, 'lost-id');
    assert.equal(lost.length, 2, show(r));
    assert.ok(lost.includes(hintLine(dir, NAME, 9, 'SP-3')), show(r));
    assert.match(lost.find((l) => l.includes(' INV-3 ')) ?? '', /^hint lost-id specs\/invoices\.md:9 INV-3 \S/, show(r));
    assert.equal(r.code, 0, show(r));
  }
});

test('1: two open requests each delete SP-3: one hint each, each with its own name and facts only', (t) => {
  const dir = repo(t, { requests: [NAME, 'other'] });
  write(dir, SPEC, changeSpec(without('SP-3')));
  write(dir, 'requests/other/spec.md', changeSpec(without('SP-3')));
  editRecord(dir, NAME, (rec) => {
    rec.dispositions = [{ source: `${NAME}/SP-3`, disposition: 'incorporated', spec: 'INV-2' }];
  });
  editRecord(dir, 'other', (rec) => {
    rec.dispositions = [{ source: 'other/SP-3', disposition: 'removed', spec: 'INV-3' }];
  });
  const r = check(dir);
  // #72: the old dispositions are not named.
  assert.deepEqual(coded(r, 'lost-id').sort(), [
    hintLine(dir, NAME, 9, 'SP-3'),
    hintLine(dir, 'other', 9, 'SP-3'),
  ].sort(), show(r));
});

// --- item 2: a change spec already archived at the base is not an open request's

test('2: SP-3 deleted from a change spec archived at the base stays lost-id, a hint (#238); exit 0 under --strict', (t) => {
  const dir = project(t);
  writeConfig(dir);
  write(dir, SPECS, INVOICES);
  commitAll(dir, 'base');
  newRequest(dir, 'old', 'The owner wanted old.\n', ['--tier', '2']);
  write(dir, 'requests/old/spec.md', changeSpec());
  ok(dir, ['index']);
  commitAll(dir, 'Open old\n\nTier: 2 — old');
  ok(dir, ['conclude', 'old', '--yes']);
  assert.equal(read(dir, 'requests/archive/old/spec.md'), changeSpec(), 'conclude archived the change spec');
  commitAll(dir, 'Close old\n\nTier: 2 — old; closes the request');
  git(dir, 'checkout', '-q', '-b', 'feature');
  write(dir, 'requests/archive/old/spec.md', changeSpec(without('SP-3')));
  for (const args of [[], ['--strict']]) {
    const r = check(dir, ...args);
    const lost = coded(r, 'lost-id');
    assert.equal(lost.length, 1, show(r));
    assert.match(lost[0], /^hint lost-id requests\/archive\/old\/spec\.md:9 SP-3 \S/, show(r));
    assert.equal(r.code, 0, show(r));
  }
});

// --- item 1 and D4: the facts of the request record

test('D4: a record entry that names only another SP gives no facts on SP-3, and adds no other hint for it', (t) => {
  const dir = repo(t);
  ok(dir, ['record', NAME, 'decision', '--source', 'agent', '--text', 'Word SP-2.', '--yes']);
  editRecord(dir, NAME, (rec) => {
    rec.decisions[0].wording = { source: `${NAME}/SP-2`, spec: 'INV-2' };
    rec.dispositions = [{ source: `${NAME}/SP-2`, disposition: 'incorporated', spec: 'INV-2', decision: 'D1' }];
  });
  // A guard: the lines on SP-3 before the deletion, to compare with after.
  const sp3 = (r) => lines(r).filter((l) => /^(not ok|hint|info) /.test(l) && / (exp\/)?SP-3 /.test(l));
  const before = sp3(check(dir));
  write(dir, SPEC, changeSpec(without('SP-3')));
  const r = check(dir);
  assert.deepEqual(coded(r, 'lost-id'), [hintLine(dir, NAME, 9, 'SP-3')], show(r));
  assert.deepEqual(sp3(r).filter((l) => !before.includes(l)), [hintLine(dir, NAME, 9, 'SP-3')],
    `the lost-id hint is the only new line on SP-3:\n${show(r)}`);
});

// --- item 3 and D2: specs/ is unchanged

test('3: INV-3 deleted from specs/ with no removes: is lost-id, a hint (#238); exit 0 under --strict', (t) => {
  const dir = repo(t);
  write(dir, SPECS, INVOICES.replace(`\n${INV3}`, ''));
  const r = check(dir);
  assert.equal(r.code, 0, show(r));
  const lost = coded(r, 'lost-id');
  assert.equal(lost.length, 1, show(r));
  assert.match(lost[0], /^hint lost-id specs\/invoices\.md:9 INV-3 \S/, show(r));
  assert.equal(check(dir, '--strict').code, 0);
});

test('3 control: INV-3 deleted from specs/ with removes:INV-3 in the open change spec gives no lost-id line', (t) => {
  const dir = repo(t);
  write(dir, SPECS, INVOICES.replace(`\n${INV3}`, ''));
  write(dir, SPEC, changeSpec([...PARAS, ['SP-5 plan removes:INV-3', 'Drop the note on lines.']]));
  const r = check(dir);
  assert.equal(r.code, 0, show(r));
  assert.deepEqual(coded(r, 'lost-id'), [], show(r));
});

// --- item 4 and D3: an ID of a change spec is never used again

test('4: SP-3 deleted and merged to main earlier, then added back on the branch: used-again, a hint (#238); exit 0 under --strict', (t) => {
  const dir = repo(t);
  git(dir, 'checkout', '-q', 'main');
  write(dir, SPEC, changeSpec(without('SP-3')));
  commitAll(dir, `Drop SP-3\n\nTier: 2 — ${NAME}`);
  git(dir, 'branch', '-q', '-D', 'feature');
  git(dir, 'checkout', '-q', '-b', 'feature');
  write(dir, SPEC, changeSpec([...without('SP-3'), ['SP-3 plan', 'Step four: a new step.']]));
  const r = check(dir);
  assert.equal(r.code, 0, show(r));
  const again = coded(r, 'used-again');
  assert.equal(again.length, 1, show(r));
  assert.match(again[0], /^hint used-again requests\/exp\/spec\.md:13 (exp\/)?SP-3 \S/, show(r));
  assert.deepEqual(coded(r, 'lost-id'), [], show(r));
  const strict = check(dir, '--strict');
  assert.equal(strict.code, 0, show(strict));
  assert.equal(coded(strict, 'used-again').length, 1, show(strict));
  assert.ok(coded(strict, 'used-again').every((l) => l.startsWith('hint ')), show(strict));
});

// --- item 5 and D3: a marker removed while its text stays

// The change spec with SP-3's marker line and the blank line after it gone;
// its text "Step two: add the button." is then on line 9.
const unmarkedSp3 = () => changeSpec().replace('<!-- SP-3 plan -->\n\n', '');

test('5: SP-3\'s marker removed while its text stays: no-id on the text, a hint (#238); exit 0 under --strict', (t) => {
  const dir = repo(t);
  write(dir, SPEC, unmarkedSp3());
  assert.equal(read(dir, SPEC).split('\n')[8], 'Step two: add the button.');
  for (const args of [[], ['--strict']]) {
    const r = check(dir, ...args);
    const noId = coded(r, 'no-id');
    assert.equal(noId.length, 1, show(r));
    assert.match(noId[0], /^hint no-id requests\/exp\/spec\.md:9 - \S/, show(r));
    assert.equal(r.code, 0, show(r));
  }
});

test('5: SP-3\'s marker removed while its text stays: the lost-id line on SP-3 is the hint of item 1, also under --strict', (t) => {
  const dir = repo(t);
  write(dir, SPEC, unmarkedSp3());
  for (const args of [[], ['--strict']]) {
    const r = check(dir, ...args);
    assert.deepEqual(coded(r, 'lost-id'), [hintLine(dir, NAME, 9, 'SP-3')], show(r));
  }
});

// --- item 6 and D3: a link to the deleted ID

test('6: SP-2 says explains:SP-3 and SP-3 is deleted: unresolved-link, a hint (#238); exit 0 under --strict', (t) => {
  const dir = repo(t);
  write(dir, SPEC, changeSpec([PARAS[0], ['SP-2 plan explains:SP-3', 'Step one: add the route.'], PARAS[3]]));
  for (const args of [[], ['--strict']]) {
    const r = check(dir, ...args);
    // The marker lint names the marker line, then the place of SP-2's text and
    // of the deleted SP-3's text at the base (#74).
    const base = git(dir, 'rev-parse', '--short=7', 'main');
    assert.deepEqual(coded(r, 'unresolved-link'),
      [`hint unresolved-link requests/exp/spec.md:5 exp/SP-2 SP-3: no such ID · places: exp/SP-2 requests/exp/spec.md:7, exp/SP-3 at the base ${base} requests/exp/spec.md:11`], show(r));
    assert.equal(r.code, 0, show(r));
  }
});

test('6 control: SP-2 says explains:SP-3 and SP-3 stays: no unresolved-link', (t) => {
  const dir = repo(t);
  write(dir, SPEC, changeSpec([PARAS[0], ['SP-2 plan explains:SP-3', 'Step one: add the route.'], PARAS[2], PARAS[3]]));
  const r = check(dir);
  assert.deepEqual(coded(r, 'unresolved-link'), [], show(r));
});

// --- item 7: al spec --add-ids never gives the deleted ID again

test('7: SP-4, the highest, deleted and committed: --add-ids gives a new paragraph SP-5, never SP-4', (t) => {
  const dir = repo(t);
  write(dir, SPEC, changeSpec(without('SP-4')));
  commitAll(dir, `Drop SP-4\n\nTier: 2 — ${NAME}`);
  write(dir, SPEC, `${changeSpec(without('SP-4'))}\nStep four: test the export.\n`);
  ok(dir, ['spec', '--add-ids', SPEC, '--yes']);
  const text = read(dir, SPEC);
  assert.deepEqual(markerIds(text), ['SP-1', 'SP-2', 'SP-3', 'SP-5'], text);
  assert.match(text, /<!-- SP-5\b[^\n]*-->\n\nStep four: test the export\.\n/, text);
});

test('7: SP-3, not the highest, deleted and committed: --add-ids gives a new paragraph SP-5', (t) => {
  const dir = repo(t);
  write(dir, SPEC, changeSpec(without('SP-3')));
  commitAll(dir, `Drop SP-3\n\nTier: 2 — ${NAME}`);
  write(dir, SPEC, `${changeSpec(without('SP-3'))}\nStep four: test the export.\n`);
  ok(dir, ['spec', '--add-ids', SPEC, '--yes']);
  const text = read(dir, SPEC);
  assert.deepEqual(markerIds(text), ['SP-1', 'SP-2', 'SP-4', 'SP-5'], text);
});
