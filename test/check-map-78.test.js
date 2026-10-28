// #78: the changed paragraphs as part of the map of al check, and
// al check --full in the place of the review view
// (requests/light-design/spec.md LD-63: the review view becomes the list and
// the map of al check; LD-56 the map; LD-18 --full;
// requests/light-resign/request.md R1: group repeated lines, never leave one
// out, show everything on request).
//
// The interface these tests use, as agreed for #78:
// - One line for each changed paragraph (spec, an open change spec, an ADR),
//   after the map's first line:
//     map paragraph <ID> · <file>:<line> · <kind> · <change>
//   <ID> is <request>/<ID> for a change spec paragraph. <change> is New,
//   Changed, Moved, Removed (joined by + when several, e.g. Changed+Moved),
//   or for a change of the kind only `kind <old> -> <new>`. A removed
//   paragraph's place is at the base: `<file>:<line> at the base <sha7>`.
//   Two or more of the same <change> are one line:
//     map paragraph · <n> paragraphs · <change>: <ID> <kind> (<place>), ...
//   With --full each paragraph has its own line, never grouped.
// - `al check --full` adds, indented under each changed paragraph's line:
//   its text; for each serves link `serves <key> <version>: <sign state>`
//   and the requirement's text; for each builds-on, changes, removes link
//   `builds on <ID> (<kind>):` / `changes <ID> (<kind>):` /
//   `removes <ID> (<kind>):` and the target's text at the base, or
//   `<word> <ID>: not found`; for a spec paragraph
//   `governed by ADR-<n> (<status>)`, with `; no source:` before the `)`
//   when that ADR has no source: link.
//
// The interface says only "<file>:<line>" for a place, so a test takes the
// marker line or the first line of the text. The indentation is not counted.
// Written from the requirement and the public interface only. Nothing here
// reads src/. No model and no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doc, editFile, git, read, req, write } from './helpers/project.js';
import {
  CS, NAME, SPEC, T12, T13, T41, addSpec, editSpec, places, removeSpec, world,
} from './helpers/map-68.js';
import {
  check, followedBy, noParagraphEntry, out, paragraphEntries, paragraphEntry, paragraphLines, paragraphsInMap, show, under,
} from './helpers/check-78.js';

const SP1 = ['SP-1 rule serves:R1 changes:INV-41', 'A shared export link lives for 24 hours.'];
const SP2 = ['SP-2 plan', 'One PR: the link, then the email.'];
const SP3 = ['SP-3 data serves:R1 builds-on:INV-12', 'An export names the number of each invoice.'];
const N41 = 'The export link MUST expire 24 hours after it is created.';
const N12 = 'An invoice has a number, a customer, a currency, lines, a total and a paid date.';
const ADR = 'specs/adr/0003-signed-links.md';
const R1_BODY = 'A shared export link MUST live for 24 hours, and the email MUST carry only the link.';

const base7 = (dir) => git(dir, 'merge-base', 'main', 'HEAD').slice(0, 7);

// The entry of id: its place is one of `at`, its kind and its change.
function assertParagraph(r, id, { at, kind, change }) {
  const e = paragraphEntry(r, id);
  assert.ok(at.includes(e.place), `${id} at ${at.join(' or ')}, not ${e.place}:\n${e.line}\n${show(r)}`);
  if (kind) assert.equal(e.kind, kind, `${id} is a ${kind} paragraph:\n${e.line}\n${show(r)}`);
  assert.equal(e.change, change, `${id} is ${change}:\n${e.line}\n${show(r)}`);
  return e;
}

// =====================================================================
// Point 8: the paragraph lines of the map

test('#78 the map names each changed paragraph: a changed spec paragraph on its own line, three new change spec paragraphs as <request>/<ID> in one grouped line', (t) => {
  const dir = world(t, [SP1, SP2]);
  write(dir, CS, doc([SP1, SP2, SP3]));
  editSpec(dir, 'INV-41', 'rule', T41, N41);
  const r = check(dir);
  paragraphsInMap(r);
  const e41 = assertParagraph(r, 'INV-41', { at: places(dir, SPEC, 'INV-41'), kind: 'rule', change: 'Changed' });
  assert.equal(e41.grouped, false, show(r));
  const kinds = { 'share/SP-1': 'rule', 'share/SP-2': 'plan', 'share/SP-3': 'data' };
  for (const [id, kind] of Object.entries(kinds)) {
    const e = assertParagraph(r, id, { at: places(dir, CS, id.split('/')[1]), kind, change: 'New' });
    assert.equal(e.grouped, true, `two or more New paragraphs are one line:\n${show(r)}`);
  }
  assert.equal(paragraphLines(r).filter((l) => l.startsWith('map paragraph · 3 paragraphs · New: ')).length, 1, show(r));
  for (const id of ['INV-12', 'INV-13', 'INV-1', 'share/SP-4']) noParagraphEntry(r, id);
});

test('#78 two changed spec paragraphs are one line "map paragraph · 2 paragraphs · Changed: ..."', (t) => {
  const dir = world(t, [SP1, SP2]);
  editSpec(dir, 'INV-41', 'rule', T41, N41);
  editSpec(dir, 'INV-12', 'data', T12, N12, { serves: null });
  const r = check(dir);
  paragraphsInMap(r);
  for (const [id, kind] of [['INV-12', 'data'], ['INV-41', 'rule']]) {
    const e = assertParagraph(r, id, { at: places(dir, SPEC, id), kind, change: 'Changed' });
    assert.equal(e.grouped, true, show(r));
    assert.match(e.line, /^map paragraph · 2 paragraphs · Changed: /, show(r));
  }
});

test('#78 a removed paragraph: its place is at the base, "<file>:<line> at the base <sha7>", and its change is Removed', (t) => {
  const dir = world(t, [SP1, SP2, ['SP-3 limit serves:R1 removes:INV-13', 'An invoice may have no line now.']]);
  const base = git(dir, 'merge-base', 'main', 'HEAD');
  removeSpec(dir, 'INV-13', T13);
  const r = check(dir);
  paragraphsInMap(r);
  const at = places(dir, SPEC, 'INV-13', base).map((p) => `${p} at the base ${base7(dir)}`);
  assertParagraph(r, 'INV-13', { at, kind: 'rule', change: 'Removed' });
});

test('#78 a paragraph moved under another heading is Moved; moved and reworded is Changed+Moved; a new heading is New', (t) => {
  const dir = world(t, [SP1, SP2]);
  const moveUnder = (text41) => {
    removeSpec(dir, 'INV-41', T41);
    addSpec(dir, 'INV-50 note', '## Links');
    addSpec(dir, 'INV-41 rule', text41);
    assert.equal(read(dir, SPEC).split('<!-- INV-41 ').length, 2, 'the fixture: INV-41 once');
  };
  moveUnder(T41);
  let r = check(dir);
  paragraphsInMap(r);
  assertParagraph(r, 'INV-41', { at: places(dir, SPEC, 'INV-41'), kind: 'rule', change: 'Moved' });
  assertParagraph(r, 'INV-50', { at: places(dir, SPEC, 'INV-50'), kind: 'note', change: 'New' });

  git(dir, 'checkout', '-q', '--', SPEC);
  moveUnder(N41);
  r = check(dir);
  assertParagraph(r, 'INV-41', { at: places(dir, SPEC, 'INV-41'), kind: 'rule', change: 'Changed+Moved' });
});

test('#78 a change of the kind only: "kind rule -> limit"', (t) => {
  const dir = world(t, [SP1, SP2]);
  editFile(dir, SPEC, '<!-- INV-13 rule -->', '<!-- INV-13 limit -->');
  const r = check(dir);
  paragraphsInMap(r);
  assertParagraph(r, 'INV-13', { at: places(dir, SPEC, 'INV-13'), change: 'kind rule -> limit' });
});

test('#78 a changed ADR paragraph has its line in the map', (t) => {
  const dir = world(t, [SP1, SP2]);
  editFile(dir, ADR, 'Context: a link must not be guessed.', 'Context: a link must never be guessed.');
  const r = check(dir);
  paragraphsInMap(r);
  const adr = paragraphEntries(r).filter((e) => /^ADR-3(-1)?$/.test(e.id));
  assert.equal(adr.length, 1, `one map paragraph entry for the changed ADR paragraph:\n${show(r)}`);
  assert.equal(adr[0].change, 'Changed', show(r));
  assert.ok(adr[0].place.startsWith(`${ADR}:`), show(r));
});

test('#78 --full: each paragraph has its own line, never grouped', (t) => {
  const dir = world(t, [SP1, SP2]);
  write(dir, CS, doc([SP1, SP2, SP3]));
  editSpec(dir, 'INV-41', 'rule', T41, N41);
  editSpec(dir, 'INV-12', 'data', T12, N12, { serves: null });
  const r = check(dir, '--full');
  paragraphsInMap(r);
  assert.deepEqual(paragraphLines(r).filter((l) => l.startsWith('map paragraph · ')), [], `no grouped line with --full:\n${show(r)}`);
  for (const id of ['share/SP-1', 'share/SP-2', 'share/SP-3']) assertParagraph(r, id, { at: places(dir, CS, id.split('/')[1]), change: 'New' });
  for (const id of ['INV-12', 'INV-41']) assertParagraph(r, id, { at: places(dir, SPEC, id), change: 'Changed' });
});

// =====================================================================
// Point 9: --full shows what the review view showed

// A world with links of each kind: SP-1 changes INV-41, SP-3 builds-on
// INV-12, SP-4 removes INV-13, SP-5 builds-on a paragraph that is not there,
// SP-6 serves the unsigned R2; INV-41 edited, governed by ADR-3 (which has
// no source: link).
function fullWorld(t) {
  const dir = world(t, [SP1, SP2]);
  const R2 = req('R2', 'Yearly ZIP', 'A user MUST be able to download one year as one ZIP file.');
  const md = read(dir, `requests/${NAME}/request.md`);
  write(dir, `requests/${NAME}/request.md`, `${md.replace(/\n*$/, '\n')}\n${R2.block}`);
  write(dir, CS, doc([
    SP1, SP2, SP3,
    ['SP-4 limit serves:R1 removes:INV-13', 'An invoice may have no line now.'],
    ['SP-5 data serves:R1 builds-on:INV-99', 'An export names its batch.'],
    ['SP-6 rule serves:R2', 'A yearly ZIP holds every invoice of the year.'],
  ]));
  editFile(dir, SPEC, `<!-- INV-41 rule -->\n\n${T41}`, `<!-- INV-41 rule serves:share/R1 governed-by:ADR-3 -->\n\n${N41}`);
  return dir;
}

test('#78 --full: a change spec paragraph shows its text, each requirement that it serves with its sign state and text, and the text at the base of each paragraph that it changes, builds on or removes', (t) => {
  const dir = fullWorld(t);
  const r = check(dir, '--full');

  const sp1 = under(r, 'map paragraph share/SP-1 · ');
  assert.ok(sp1.includes(SP1[1]), `SP-1's text:\n${sp1.join('\n')}\n${show(r)}`);
  followedBy(r, sp1, /^serves share\/R1 (version )?v?1: signed in S1$/, R1_BODY);
  followedBy(r, sp1, 'changes INV-41 (rule):', T41);
  assert.ok(!sp1.includes(N41), `the text of INV-41 at the base, not at the head:\n${sp1.join('\n')}`);

  const sp3 = under(r, 'map paragraph share/SP-3 · ');
  assert.ok(sp3.includes(SP3[1]), show(r));
  followedBy(r, sp3, /^serves share\/R1 (version )?v?1: signed in S1$/, R1_BODY);
  followedBy(r, sp3, 'builds on INV-12 (data):', T12);

  const sp4 = under(r, 'map paragraph share/SP-4 · ');
  followedBy(r, sp4, 'removes INV-13 (rule):', T13);

  const sp5 = under(r, 'map paragraph share/SP-5 · ');
  assert.ok(sp5.includes('builds on INV-99: not found'), `a link to a paragraph that is not there:\n${sp5.join('\n')}\n${show(r)}`);

  const sp6 = under(r, 'map paragraph share/SP-6 · ');
  assert.ok(sp6.some((l) => /^serves share\/R2\b.*: not signed$/.test(l)), `the unsigned R2:\n${sp6.join('\n')}\n${show(r)}`);
  assert.ok(sp6.includes('A user MUST be able to download one year as one ZIP file.'), `R2's text:\n${sp6.join('\n')}\n${show(r)}`);
});

test('#78 --full: a changed spec paragraph shows its text and "governed by ADR-3 (accepted; no source:)" for the ADR that it names by governed-by', (t) => {
  const dir = fullWorld(t);
  const r = check(dir, '--full');
  const inv41 = under(r, 'map paragraph INV-41 · ');
  assert.ok(inv41.includes(N41), `INV-41's text at the head:\n${inv41.join('\n')}\n${show(r)}`);
  assert.ok(inv41.includes('governed by ADR-3 (accepted; no source:)'), `the governing ADR, marked:\n${inv41.join('\n')}\n${show(r)}`);
  assert.ok(!inv41.includes('governed by ADR-3 (accepted)'), show(r));
});

test('#78 --full: an ADR with a source: link is "governed by ADR-3 (accepted)", with no mark', (t) => {
  const dir = world(t, [SP1, SP2], {
    onMain: (d) => {
      editFile(d, ADR, '<!-- ADR-3 choice -->', '<!-- ADR-3 choice decides:INV-41 source:share/S1 -->');
    },
  });
  editSpec(dir, 'INV-41', 'rule', T41, N41);
  const r = check(dir, '--full');
  const inv41 = under(r, 'map paragraph INV-41 · ');
  assert.ok(inv41.includes('governed by ADR-3 (accepted)'), `the ADR that decides INV-41:\n${inv41.join('\n')}\n${show(r)}`);
  assert.deepEqual(inv41.filter((l) => l.includes('no source:')), [], show(r));
});

test('#78 without --full: the paragraph lines have no text under them', (t) => {
  const dir = fullWorld(t);
  const r = check(dir);
  const ls = out(r);
  for (const l of paragraphLines(r)) {
    const next = ls[ls.indexOf(l) + 1] ?? '';
    assert.doesNotMatch(next, /^\s+\S/, `no indented line under ${l}:\n${show(r)}`);
  }
});

test('#78 an added spec paragraph is New in the map', (t) => {
  const dir = world(t, [SP1, SP2]);
  addSpec(dir, 'INV-43 data', 'A shared link has a creation time.');
  const r = check(dir);
  assertParagraph(r, 'INV-43', { at: places(dir, SPEC, 'INV-43'), kind: 'data', change: 'New' });
});
