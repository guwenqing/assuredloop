// #68: the map of a change (requests/light-design/request.md v4/R5 version 2,
// signed; spec LD-54, LD-55, LD-15, LD-56, LD-61, LD-60). Written from the
// requirement and the public interface only. The consolidation judgement
// and al conclude are in consolidation-68.test.js.
//
// - The map is one section of `al check`, after the review section, for each
//   open request that is the change's own (as the list of #58 reads it) and
//   that is not a spike and whose tier is not 0, 1 or 1d. Its lines:
//     map: no change selected: no base (no main branch, or no commit)
//     map: no change selected: nothing changed against the base <7>
//     map: no open change of path 2 or 3 is this change's own
//   or the header
//     map: the change against its base <7> (own changes: <name>[, <name>]), from facts only
//   then, in this order:
//     map spec <ID> · <file>:<line> · <added|changed|removed>; named by <refs>
//       <refs>: `<name>/<CID> changes`, `<name>/<CID> removes`,
//       `<name>/<CID> builds-on`, `judgement <note>:<line>`, joined by ", ";
//       or `no change paragraph`. Another open request's changes or removes
//       link adds `; open proposal: <other>/<CID> changes it` (or removes it).
//       Only paragraphs in specs/, not ADRs. A removed paragraph has its
//       place at the base.
//     map link <name>/<CID> <changes|removes> <ID> · <change spec file>:<line> · <state>
//       <state>: unchanged since the link, changed since the link, removed,
//       or `not known: the link has no binding (run al index)`.
//     map consolidation <name>/<CID> · <change spec file>:<line> · <fact>
//   Two or more lines of one kind with the same fact are one line, at the
//   place of the first:
//     map <spec|link|consolidation> · <n> <spec paragraphs|links|change paragraphs> · <fact>: <ID> (<place>), ...
// - The states are facts: "unchanged since the link" = the named paragraph
//   has the version that it had when the change first linked it. A lost
//   edit and a revert to the linked text show as unchanged. A link and an
//   edit in one commit before the first al index: al index binds the base
//   text, so "changed since the link".
// - Hints: `hint map-unnamed <file>:<line> <ID> ...` for a spec paragraph of
//   the map that no own change paragraph names by changes or removes and no
//   consolidation judgement names; `hint map-consolidation <change spec
//   file> <name> ...` naming each change paragraph that goes into specs/
//   with no current consolidation judgement.
// - The parallel-work hint (stale-base): the change's own edit of a
//   paragraph that it names by `changes` gives none after al index; a later
//   edit by other work gives it, as today.
// - No exit code change and no new `not ok`; `al check` writes nothing.
//
// The interface says only "<file>:<line>" for a place, so a test takes the
// marker line or the first line of the text. No model and no network.
// Nothing here reads src/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  al, appendSection, commitAll, doc, git, index, newRequest, ok, organized, read, req, write, writeConfig, writesNothing,
} from './helpers/project.js';
import {
  CS, NAME, NOTE, SPEC, T12, T13, T41, addSpec, assertSpec, base7, check, claim, editSpec, entries, entry, headerLine,
  hintLines, jref, judged, kindOrder, mapHead, mapHints, mapLines, noEntry, noUnnamedHint, note, notOkLines,
  openRequest, places, placed, removeSpec, show, staleBase, unnamedHint, world,
} from './helpers/map-68.js';

const SP1 = ['SP-1 rule serves:R1 changes:INV-41', 'A shared export link lives for 24 hours.'];
const SP2 = ['SP-2 plan', 'One PR: the link, then the email.'];
const N41 = 'The export link MUST expire 24 hours after it is created.';
const N41b = 'The export link MUST expire 48 hours after it is created.';

const ADR = 'specs/adr/0003-signed-links.md';
const link = (r, holder, verb, target) => entry(r, 'link', `${holder} ${verb} ${target}`);

// =====================================================================
// Line 2: the state of each link (LD-56, LD-61)

test('#68 a named paragraph unchanged: the header, no spec line for it, and its link "unchanged since the link"', (t) => {
  const dir = world(t, [SP1, SP2]);
  const r = check(dir);
  assert.equal(mapHead(r), headerLine(dir, NAME), show(r));
  noEntry(r, 'spec', 'INV-41');
  const e = link(r, 'share/SP-1', 'changes', 'INV-41');
  placed(r, e, places(dir, CS, 'SP-1'));
  assert.equal(e.fact, 'unchanged since the link', show(r));
  assert.deepEqual(entries(r).filter((x) => x.kind === 'link').map((x) => x.id), ['share/SP-1 changes INV-41'], `a link line for each changes or removes link only:\n${show(r)}`);
  kindOrder(r);
});

test('#68 a named paragraph changed: "map spec INV-41 ... changed; named by share/SP-1 changes" and the link "changed since the link"', (t) => {
  const dir = world(t, [SP1, SP2]);
  editSpec(dir, 'INV-41', 'rule', T41, N41);
  index(dir);
  commitAll(dir, `${NAME}: INV-41 lives 24 hours`);
  const r = check(dir);
  assert.equal(mapHead(r), headerLine(dir, NAME), show(r));
  assertSpec(r, 'INV-41', { what: 'changed', refs: ['share/SP-1 changes'], at: places(dir, SPEC, 'INV-41') });
  assert.equal(link(r, 'share/SP-1', 'changes', 'INV-41').fact, 'changed since the link', show(r));
  kindOrder(r);
});

test('#68 a named paragraph whose edit is lost in a later commit (back to the linked text): "unchanged since the link", and no spec line', (t) => {
  const dir = world(t, [SP1, SP2]);
  editSpec(dir, 'INV-41', 'rule', T41, N41);
  commitAll(dir, `${NAME}: INV-41 lives 24 hours`);
  index(dir);
  commitAll(dir, `${NAME}: records`);
  assert.equal(link(check(dir), 'share/SP-1', 'changes', 'INV-41').fact, 'changed since the link', 'control: changed before the loss');
  // A later commit puts the base file back: the edit is lost.
  git(dir, 'checkout', 'main', '--', SPEC);
  commitAll(dir, `${NAME}: a merge that lost the edit`);
  index(dir);
  commitAll(dir, `${NAME}: records`);
  const r = check(dir);
  assert.equal(link(r, 'share/SP-1', 'changes', 'INV-41').fact, 'unchanged since the link', show(r));
  noEntry(r, 'spec', 'INV-41');
});

test('#68 a named paragraph reverted to the linked text (git revert of the edit): "unchanged since the link"', (t) => {
  const dir = world(t, [SP1, SP2]);
  editSpec(dir, 'INV-41', 'rule', T41, N41);
  const edit = commitAll(dir, `${NAME}: INV-41 lives 24 hours`);
  index(dir);
  commitAll(dir, `${NAME}: records`);
  git(dir, 'revert', '--no-edit', edit);
  index(dir);
  commitAll(dir, `${NAME}: records after the revert`);
  const r = check(dir);
  assert.equal(mapHead(r), headerLine(dir, NAME), show(r));
  assert.equal(link(r, 'share/SP-1', 'changes', 'INV-41').fact, 'unchanged since the link', show(r));
  noEntry(r, 'spec', 'INV-41');
});

test('#68 a named paragraph removed: the spec line "removed; named by share/SP-3 removes" at its place at the base; the removes link and a changes link are "removed"', (t) => {
  const dir = world(t, [SP1, SP2, ['SP-3 limit serves:R1 removes:INV-13', 'An invoice may have no line now.']]);
  const base = git(dir, 'merge-base', 'main', 'HEAD');
  removeSpec(dir, 'INV-13', T13);
  removeSpec(dir, 'INV-41', T41);
  index(dir);
  commitAll(dir, `${NAME}: INV-13 and INV-41 go`);
  const r = check(dir);
  assertSpec(r, 'INV-13', { what: 'removed', refs: ['share/SP-3 removes'], at: places(dir, SPEC, 'INV-13', base) });
  assertSpec(r, 'INV-41', { what: 'removed', refs: ['share/SP-1 changes'], at: places(dir, SPEC, 'INV-41', base) });
  const rm = link(r, 'share/SP-3', 'removes', 'INV-13');
  placed(r, rm, places(dir, CS, 'SP-3'));
  assert.equal(rm.fact, 'removed', show(r));
  assert.equal(link(r, 'share/SP-1', 'changes', 'INV-41').fact, 'removed', show(r));
  kindOrder(r);
});

test('#68 the link and the edit in one commit before the first al index: "not known: the link has no binding (run al index)", then al index binds the base text: "changed since the link"', (t) => {
  const dir = world(t, null, { link: false });
  newRequest(dir, NAME, `The owner wants ${NAME}.\n`, ['--tier', '2']);
  appendSection(dir, NAME, organized([req('R1', 'Shared links', 'A shared export link MUST live for 24 hours.')]));
  ok(dir, ['record', NAME, 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
  write(dir, CS, doc([SP1, SP2]));
  editSpec(dir, 'INV-41', 'rule', T41, N41);
  commitAll(dir, claim(NAME));
  // #78: al check runs al index, so the state before al index is read with al check --at.
  let r = check(dir, '--at', 'HEAD');
  assert.equal(mapHead(r), headerLine(dir, NAME), show(r));
  assert.equal(link(r, 'share/SP-1', 'changes', 'INV-41').fact, 'not known: the link has no binding (run al index)', show(r));
  // #78: al check binds the link from the history: the base text too.
  r = check(dir);
  assert.equal(link(r, 'share/SP-1', 'changes', 'INV-41').fact, 'changed since the link', `al check binds the base text, not the edited text:\n${show(r)}`);
  index(dir);
  r = check(dir);
  assert.equal(link(r, 'share/SP-1', 'changes', 'INV-41').fact, 'changed since the link', `al index binds the base text, not the edited text:\n${show(r)}`);
  assertSpec(r, 'INV-41', { what: 'changed', refs: ['share/SP-1 changes'], at: places(dir, SPEC, 'INV-41') });
});

// =====================================================================
// Line 1 and the hint map-unnamed (LD-56, LD-60)

test('#68 a spec paragraph changed that no change paragraph names: "named by no change paragraph" and hint map-unnamed; builds-on alone keeps it; a judgement Spec line or a changes link clears it; an ADR edit is not a spec line', (t) => {
  const dir = world(t, [SP1, SP2]);
  const N12 = 'An invoice has a number, a customer, a currency, lines, a total and a paid date.';
  editSpec(dir, 'INV-12', 'data', T12, N12, { serves: null });
  write(dir, ADR, read(dir, ADR).replace('Context: a link must not be guessed.', 'Context: a link must never be guessed.'));
  index(dir);
  commitAll(dir, `${NAME}: a currency`);

  // A: no change paragraph names INV-12.
  let r = check(dir);
  assertSpec(r, 'INV-12', { what: 'changed', refs: [], at: places(dir, SPEC, 'INV-12') });
  unnamedHint(r, 'INV-12', places(dir, SPEC, 'INV-12'));
  for (const id of ['ADR-3', 'ADR-3-1']) noEntry(r, 'spec', id);
  noUnnamedHint(r, 'INV-41');

  // B: a builds-on link only: still unnamed.
  write(dir, CS, doc([SP1, SP2, ['SP-4 data serves:R1 builds-on:INV-12', 'An export names the currency of each invoice.']]));
  index(dir);
  r = check(dir);
  assertSpec(r, 'INV-12', { what: 'changed', refs: ['share/SP-4 builds-on'], at: places(dir, SPEC, 'INV-12') });
  unnamedHint(r, 'INV-12', places(dir, SPEC, 'INV-12'));

  // C: a consolidation judgement whose Spec line names INV-12 clears it.
  const first = 'SP-4 complies: the currency is now in INV-12.';
  note(dir, judged(first, 'Item: "names the currency of each invoice"', 'Spec (INV-12): "a customer, a currency, lines"'));
  index(dir);
  r = check(dir);
  assertSpec(r, 'INV-12', { what: 'changed', refs: ['share/SP-4 builds-on', jref(dir, first)], at: places(dir, SPEC, 'INV-12') });
  noUnnamedHint(r, 'INV-12');

  // D: no judgement, and a changes link: cleared.
  write(dir, NOTE, `# Review of ${NAME}\n\nNothing judged yet.\n`);
  write(dir, CS, doc([SP1, SP2, ['SP-4 data serves:R1 changes:INV-12', 'An invoice names its currency.']]));
  index(dir);
  r = check(dir);
  assertSpec(r, 'INV-12', { what: 'changed', refs: ['share/SP-4 changes'], at: places(dir, SPEC, 'INV-12') });
  noUnnamedHint(r, 'INV-12');
});

test('#68 an added spec paragraph that a changes link names is not unnamed; one that nothing names is', (t) => {
  const dir = world(t, [SP1, SP2]);
  addSpec(dir, 'INV-42 rule serves:share/R1', 'The email MUST hold the link and no file.');
  addSpec(dir, 'INV-43 data', 'A shared link has a creation time.');
  write(dir, CS, doc([SP1, SP2, ['SP-3 rule serves:R1 changes:INV-42', 'The email carries only the link.']]));
  index(dir);
  commitAll(dir, `${NAME}: INV-42 and INV-43`);
  const r = check(dir);
  assertSpec(r, 'INV-42', { what: 'added', refs: ['share/SP-3 changes'], at: places(dir, SPEC, 'INV-42') });
  assertSpec(r, 'INV-43', { what: 'added', refs: [], at: places(dir, SPEC, 'INV-43') });
  noUnnamedHint(r, 'INV-42');
  unnamedHint(r, 'INV-43', places(dir, SPEC, 'INV-43'));
});

// =====================================================================
// Two open changes on one paragraph (LD-56; the overlap hint of today)

test('#68 two open changes on one paragraph: the spec line names the own link and "open proposal: other/SP-1 changes it"; the overlap hint still shows; the other request has no link line', (t) => {
  const dir = world(t, [SP1, SP2], {
    onMain: (d) => {
      openRequest(d, 'other', [['SP-1 rule serves:R1 changes:INV-41', 'An export link lives for one hour.']]);
    },
  });
  editSpec(dir, 'INV-41', 'rule', T41, N41);
  index(dir);
  commitAll(dir, `${NAME}: INV-41 lives 24 hours`);
  const r = check(dir);
  assert.equal(mapHead(r), headerLine(dir, NAME), `only share is this change's own:\n${show(r)}`);
  assertSpec(r, 'INV-41', {
    what: 'changed', refs: ['share/SP-1 changes'], at: places(dir, SPEC, 'INV-41'), proposal: 'other/SP-1 changes it',
  });
  assert.ok(hintLines(r, 'overlap').some((l) => l.split(' ')[3] === 'share/SP-1'), `today's overlap hint on share/SP-1:\n${show(r)}`);
  assert.deepEqual(entries(r).filter((e) => e.kind !== 'spec' && e.id.startsWith('other/')), [], show(r));
});

// =====================================================================
// The parallel-work hint (LD-61, v4/R6)

// The first PR of share edits INV-41 and merges into main; then other work
// on main edits INV-41 again; then a new branch of the same open request.
function laterEditByOtherWork(dir) {
  git(dir, 'checkout', '-q', 'main');
  git(dir, 'merge', '-q', '--no-ff', '-m', `Merge ${NAME} part 1`, 'feature');
  editSpec(dir, 'INV-41', 'rule', N41, N41b);
  index(dir);
  commitAll(dir, 'other work: INV-41 lives 48 hours');
  git(dir, 'checkout', '-q', '-b', 'feature-2');
  write(dir, 'src/share.js', 'export const hours = 48;\n');
  commitAll(dir, `${NAME}: part 2`);
}

test('#68 parallel work: the own edit of a paragraph named by changes gives no stale-base after al index; a later edit by other work gives stale-base and "changed since the link"', (t) => {
  const dir = world(t, [SP1, SP2]);
  editSpec(dir, 'INV-41', 'rule', T41, N41);
  commitAll(dir, `${NAME}: INV-41 lives 24 hours`);
  index(dir);
  commitAll(dir, `${NAME}: records`);
  let r = check(dir);
  assert.deepEqual(staleBase(r, 'share/SP-1', 'changes', 'INV-41'), [], `the own edit gives no stale-base:\n${show(r)}`);
  assert.equal(link(r, 'share/SP-1', 'changes', 'INV-41').fact, 'changed since the link', show(r));

  laterEditByOtherWork(dir);
  r = check(dir);
  assert.equal(staleBase(r, 'share/SP-1', 'changes', 'INV-41').length, 1, `the later edit by other work gives stale-base:\n${show(r)}`);
  assert.equal(mapHead(r), headerLine(dir, NAME), show(r));
  assert.equal(link(r, 'share/SP-1', 'changes', 'INV-41').fact, 'changed since the link', show(r));
  noEntry(r, 'spec', 'INV-41');
});

// =====================================================================
// Grouping (no line left out)

// The two forms that al may print for a grouped line: every place as the
// marker line, or every place as the first line of the text.
const groupedForms = (kind, noun, fact, items) => [0, 1].map((k) =>
  `map ${kind} · ${items.length} ${noun} · ${fact}: ${items.map(([id, at]) => `${id} (${at[k]})`).join(', ')}`);

test('#68 grouping: two links with the same state are one "map link · 2 links · ..." line; two unnamed spec paragraphs are one "map spec · 2 spec paragraphs · ..." line', (t) => {
  const dir = world(t, [SP1, SP2, ['SP-3 data serves:R1 changes:INV-12', 'An invoice names its currency.']]);
  editSpec(dir, 'INV-13', 'rule', T13, 'An invoice MUST have at least one line with an amount.');
  addSpec(dir, 'INV-43 data', 'A shared link has a creation time.');
  index(dir);
  commitAll(dir, `${NAME}: INV-13 and INV-43`);
  const r = check(dir);
  const ls = mapLines(r);
  const links = groupedForms('link', 'links', 'unchanged since the link', [
    ['share/SP-1 changes INV-41', places(dir, CS, 'SP-1')],
    ['share/SP-3 changes INV-12', places(dir, CS, 'SP-3')],
  ]);
  assert.ok(ls.some((l) => links.includes(l)), `one grouped link line, one of:\n${links.join('\n')}\n${show(r)}`);
  // INV-13 (changed) and INV-43 (added) have different facts, so they are two lines.
  assertSpec(r, 'INV-13', { what: 'changed', refs: [], at: places(dir, SPEC, 'INV-13') });
  assertSpec(r, 'INV-43', { what: 'added', refs: [], at: places(dir, SPEC, 'INV-43') });
  assert.equal(entry(r, 'spec', 'INV-13').grouped, false, show(r));

  // A second unnamed changed paragraph joins INV-13 in one line.
  editSpec(dir, 'INV-12', 'data', T12, 'An invoice has a number, a customer, lines, a total, a paid date and a currency.', { serves: null });
  editSpec(dir, 'INV-41', 'rule', T41, N41);
  write(dir, CS, doc([SP2]));
  index(dir);
  const r2 = check(dir);
  const specs = groupedForms('spec', 'spec paragraphs', 'changed; named by no change paragraph', [
    ['INV-12', places(dir, SPEC, 'INV-12')],
    ['INV-13', places(dir, SPEC, 'INV-13')],
    ['INV-41', places(dir, SPEC, 'INV-41')],
  ]);
  assert.ok(mapLines(r2).some((l) => specs.includes(l)), `one grouped spec line, one of:\n${specs.join('\n')}\n${show(r2)}`);
  for (const id of ['INV-12', 'INV-13', 'INV-41']) unnamedHint(r2, id, places(dir, SPEC, id));
  kindOrder(r2);
});

// =====================================================================
// No exit code change, no new not ok, writes nothing (v4/R5; LD-60)

test('#68 no exit code change: al check --strict exits 0 with both map hints and no not ok; al check exits 0 and writes nothing', (t) => {
  const dir = world(t, [SP1, SP2]);
  editSpec(dir, 'INV-41', 'rule', T41, N41);
  editSpec(dir, 'INV-12', 'data', T12, 'An invoice has a number, a customer, a currency, lines, a total and a paid date.', { serves: null });
  index(dir);
  commitAll(dir, `${NAME}: INV-41 and INV-12`);
  const strict = al(dir, ['check', '--strict']);
  assert.equal(strict.code, 0, show(strict));
  assert.deepEqual(notOkLines(strict), [], show(strict));
  unnamedHint(strict, 'INV-12', places(dir, SPEC, 'INV-12'));
  assert.equal(hintLines(strict, 'map-consolidation').length, 1, `the map-consolidation hint:\n${show(strict)}`);
  const plain = writesNothing(dir, ['check']);
  assert.equal(plain.code, 0, show(plain));
  assert.deepEqual(mapHints(plain), mapHints(strict), show(plain));
  // With a note that holds a judgement, too.
  note(dir, judged('SP-1 complies: the link lives 24 hours.', 'Item: "lives for 24 hours"', `Spec (INV-41): "${N41}"`));
  // #78: al check keeps the identity of the new judgement once, then writes nothing.
  check(dir);
  writesNothing(dir, ['check']);
  const again = al(dir, ['check', '--strict']);
  assert.equal(again.code, 0, show(again));
  assert.deepEqual(notOkLines(again), [], show(again));
});

// =====================================================================
// When there is no map (LD-56: paths 2 and 3 only)

const SPIKE_Q = (id) => ({ id, block: `<!-- ${id} -->\n\n### ${id} Signed links\nCan a signed link replace the token table?\n` });

function spike(dir) {
  newRequest(dir, 'spike-a', 'Can we sign links?\n', ['--tier', 'S']);
  appendSection(dir, 'spike-a', organized([SPIKE_Q('Q1')], { heading: '## Organized question' }));
  ok(dir, ['record', 'spike-a', 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
  write(dir, 'requests/spike-a/spec.md', doc([
    ['SP-1 approach serves:Q1', 'Try an HMAC over the invoice ID.'],
    ['SP-2 rule serves:Q1 changes:INV-41', 'A signed link MUST expire after 30 minutes.'],
  ]));
  index(dir);
}

const NO_OWN = "map: no open change of path 2 or 3 is this change's own";

function noMap(r, reason) {
  assert.equal(mapHead(r), reason, show(r));
  // #78: the map lists the changed paragraphs, also with no own request.
  assert.deepEqual(mapLines(r).filter((l) => !l.startsWith('map paragraph ')), [reason], `only the one-line reason:\n${show(r)}`);
  assert.deepEqual(mapHints(r), [], `no map hint:\n${show(r)}`);
}

test('#68 a spike: only "map: no open change of path 2 or 3 is this change\'s own", and no map hint', (t) => {
  const dir = world(t, null, { link: false });
  spike(dir);
  editSpec(dir, 'INV-12', 'data', T12, 'An invoice has a number, a customer, a currency, lines, a total and a paid date.', { serves: null });
  commitAll(dir, claim('spike-a', 'S'));
  noMap(check(dir), NO_OWN);
});

test('#68 a path-1 change (no own request of path 2 or 3): only the one-line reason, and no map hint', (t) => {
  const dir = world(t, null, { link: false });
  openRequest(dir, 'amend', null, { tier: '1' });
  editSpec(dir, 'INV-41', 'rule', T41, N41, { serves: 'amend/R1' });
  editSpec(dir, 'INV-12', 'data', T12, 'An invoice has a number, a customer, a currency, lines, a total and a paid date.', { serves: null });
  index(dir);
  commitAll(dir, 'amend: INV-41\n\nTier: 1 — amends INV-41');
  noMap(check(dir), NO_OWN);
});

test('#68 a change with no own request (a source file only): only the one-line reason', (t) => {
  const dir = world(t, null, { link: false });
  write(dir, 'src/share.js', 'export const hours = 24;\n');
  commitAll(dir, 'a source change\n\nTier: 0 — restores INV-41');
  noMap(check(dir), NO_OWN);
});

test('#68 a spike and a path-2 request, both own: the header names only the path-2 request; the spike\'s link has no line', (t) => {
  const dir = world(t, [SP1, SP2]);
  spike(dir);
  commitAll(dir, claim('spike-a', 'S'));
  const r = check(dir);
  assert.equal(mapHead(r), headerLine(dir, NAME), show(r));
  noEntry(r, 'link', 'spike-a/SP-2 changes INV-41');
  link(r, 'share/SP-1', 'changes', 'INV-41');
  noEntry(r, 'consolidation', 'spike-a/SP-2');
});

test('#68 no change selected: "nothing changed against the base <7>" on a branch with no change; "no base" with no main branch', (t) => {
  const dir = world(t, null, { link: false });
  let r = check(dir);
  noMap(r, `map: no change selected: nothing changed against the base ${base7(dir)}`);

  const lone = world(t, null, { link: false });
  git(lone, 'branch', '-m', 'main', 'trunk');
  r = check(lone);
  noMap(r, 'map: no change selected: no base (no main branch, or no commit)');
});

// =====================================================================
// A central repo's own `central:` links (DES-69: a repo whose config lists
// outputs is the central repo, and `central:X` there means its own X)

// The link entry of holder, verb and id; the target may be named as id or
// as central:id.
function linkEither(r, holder, verb, id) {
  const ids = [`${holder} ${verb} ${id}`, `${holder} ${verb} central:${id}`];
  const found = entries(r).filter((e) => e.kind === 'link' && ids.includes(e.id));
  assert.equal(found.length, 1, `one map link entry for ${ids.join(' or ')}:\n${show(r)}`);
  return found[0];
}

test('#68 central links in the central repo: changes:central:INV-41 and removes:central:INV-13 have link lines and name their spec lines; builds-on:central:INV-12 names its spec line and leaves it unnamed', (t) => {
  const dir = world(t, [
    ['SP-1 rule serves:R1 changes:central:INV-41', 'A shared export link lives for 24 hours.'],
    ['SP-3 limit serves:R1 removes:central:INV-13', 'An invoice may have no line now.'],
    ['SP-4 data serves:R1 builds-on:central:INV-12', 'An export names the currency of each invoice.'],
    SP2,
  ], {
    // The config lists an output repo (its clone is absent), so this repo is
    // the central repo.
    onMain: (d) => writeConfig(d, [{ file: SPEC, prefix: 'INV' }], {
      repo: 'invoicer', outputs: [{ name: 'invoicer-web', path: '../al-v4-68-no-such-clone' }],
    }),
  });
  const base = git(dir, 'merge-base', 'main', 'HEAD');
  editSpec(dir, 'INV-41', 'rule', T41, N41);
  removeSpec(dir, 'INV-13', T13);
  editSpec(dir, 'INV-12', 'data', T12, 'An invoice has a number, a customer, a currency, lines, a total and a paid date.', { serves: null });
  index(dir);
  commitAll(dir, `${NAME}: INV-41, INV-13 and INV-12`);
  const r = check(dir);
  assert.equal(mapHead(r), headerLine(dir, NAME), show(r));

  const changes = linkEither(r, 'share/SP-1', 'changes', 'INV-41');
  placed(r, changes, places(dir, CS, 'SP-1'));
  assert.equal(changes.fact, 'changed since the link', show(r));
  assertSpec(r, 'INV-41', { what: 'changed', refs: ['share/SP-1 changes'], at: places(dir, SPEC, 'INV-41') });
  noUnnamedHint(r, 'INV-41');

  assert.equal(linkEither(r, 'share/SP-3', 'removes', 'INV-13').fact, 'removed', show(r));
  assertSpec(r, 'INV-13', { what: 'removed', refs: ['share/SP-3 removes'], at: places(dir, SPEC, 'INV-13', base) });
  noUnnamedHint(r, 'INV-13');

  assertSpec(r, 'INV-12', { what: 'changed', refs: ['share/SP-4 builds-on'], at: places(dir, SPEC, 'INV-12') });
  unnamedHint(r, 'INV-12', places(dir, SPEC, 'INV-12'));
  assert.deepEqual(entries(r).filter((e) => e.kind === 'link' && e.id.startsWith('share/SP-4 ')), [], `a builds-on link has no link line:\n${show(r)}`);
});
