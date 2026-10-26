// #78: no moment is invented when al check runs al index
// (requests/light-design/spec.md LD-22 for C7's kept text, LD-28 and LD-66
// for C8's judgement identities, LD-56 and LD-61 for the bindings of the
// map, LD-16: al check refreshes the records).
//
// The interface these tests use, as agreed for #78:
// - al keeps a fact "at a moment that is now" only for what the working
//   tree adds against HEAD. For what HEAD already holds with no record, it
//   takes the moment from the branch history: the earliest commit of
//   base..HEAD that holds it. When the history cannot tell (a shallow
//   clone), the fact stays "not known".
// - C7: an item named by a task that was committed with no kept text: on a
//   clean checkout, al check --issues keeps nothing for it, and the hint
//   says "not known", never "unchanged".
// - C8: a judgement committed with no identity takes the identity of the
//   commit that first held it, so a later commit of a source file shows it
//   as `stale: judged at <sha7 of that commit>`; in a shallow clone it is
//   `not known when judged`, never current.
// - Bindings: a builds-on link committed with no binding is bound from the
//   commit that first declared it, so a later change of its target gives
//   the stale-base hint ("changed since it was bound"); a changes link binds
//   the target's text at the base, so the map says "changed since the link".
//   In a shallow clone no binding is written for them, and the map line
//   says `not known: the link has no binding`.
// - The CI fixture: a merge commit of the branch into main's tip, checked
//   out with main at main's tip: the parallel-work hint of other work on
//   main stays, no own edit comes from the merge commit, and a shallow
//   clone of the merge commit gives "not known", never a binding.
// - The ordinary flow: an edit and al check before the commit keep the
//   facts at now, and a `records:` line names the record file.
//
// Each clean checkout is a `git clone` of the fixture repo, so HEAD is the
// working tree and the records are as committed. A shallow clone is made two
// ways: `git clone --depth 1` of the branch (main at depth 1 too, so there is
// no common history and no base), and `git clone --depth 2` of a merge commit
// of the branch into main (main's tip is the first parent, so the base is
// known, while the branch's own earlier commits are cut off).
//
// Written from the requirement and the public interface only. Nothing here
// reads src/. No model and no network.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendSection, binding, bindingsOf, commitAll, doc, editFile, git, hashOf, index, newRequest, ok, organized, record,
  sha, write,
} from './helpers/project.js';
import {
  CS, NAME, NOTE, R1, SPEC, T12, T41, addSpec, claim, editSpec, entries, judged, note, openRequest, staleBase, world,
} from './helpers/map-68.js';
import {
  INV_CLAIM, ITEMS, assertChanged, assertNotKnown, check, cloneOf, isShallow, itemsWorld, mergeRef, nameItem, out,
  recordsWritten, saveItem, show,
} from './helpers/check-78.js';

const SP1 = ['SP-1 rule serves:R1 changes:INV-41', 'A shared export link lives for 24 hours.'];
const SP2 = ['SP-2 plan', 'One PR: the link, then the email.'];
const SP3 = ['SP-3 data serves:R1 builds-on:INV-12', 'An export names the number of each invoice.'];
const N41 = 'The export link MUST expire 24 hours after it is created.';
const N12 = 'An invoice has a number, a customer, a currency, lines, a total and a paid date.';
const recordFile = `.assuredloop/records/requests/${NAME}.yaml`;

// The map link line of holder/verb/target, if any.
const linkLines = (r, id) => entries(r).filter((e) => e.kind === 'link' && e.id === id);
// When the map shows the link, it says "not known: the link has no binding".
function linkNotKnown(r, id) {
  for (const e of linkLines(r, id)) {
    assert.ok(e.fact.startsWith('not known: the link has no binding'), `${id}: "not known: the link has no binding", not ${e.fact}:\n${show(r)}`);
  }
}
function oneLinkNotKnown(r, id) {
  assert.equal(linkLines(r, id).length, 1, `one map link line for ${id}:\n${show(r)}`);
  linkNotKnown(r, id);
}
const noBinding = (dir, holder, link, target, r) =>
  assert.deepEqual(bindingsOf(record(dir, NAME), holder, link, target), [], `no binding ${holder} ${link} ${target} is written:\n${show(r)}`);

// The judgement lines of the review section.
const judgements = (r, id) => out(r).filter((l) => l.startsWith(`judgement ${id} version `));
// No judgement is current; each one that shows is "not known when judged".
function neverCurrent(r, id) {
  for (const l of judgements(r, id)) {
    assert.ok(!l.endsWith(' · current'), `never current:\n${l}\n${show(r)}`);
    assert.ok(l.endsWith(' · not known when judged'), `"not known when judged":\n${l}\n${show(r)}`);
  }
}

// =====================================================================
// a. C7 (LD-22)

describe('C7: an item named in a commit with no kept text', () => {
  // The request inv names item #5 in a commit; al index --issues never ran.
  function namedNotKept(t) {
    const w = itemsWorld(t);
    saveItem(w, 5);
    nameItem(w);
    commitAll(w.dir, INV_CLAIM);
    return w;
  }

  test('#78 a clean checkout: al check --issues says "not known" for the item, and again on a second run: it kept no text at now', (t) => {
    const w = namedNotKept(t);
    const c = cloneOf(t, w.dir, { branch: 'feature', main: 'origin/main', root: w.root });
    assertNotKnown(check(c, '--issues', ITEMS));
    assertNotKnown(check(c, '--issues', ITEMS));
  });

  test('#78 a clean checkout, then the item changes: still "not known", never "changed" from a text kept at the checkout', (t) => {
    const w = namedNotKept(t);
    const c = cloneOf(t, w.dir, { branch: 'feature', main: 'origin/main', root: w.root });
    check(c, '--issues', ITEMS);
    saveItem(w, 5, 'Build the export as JSON.\n');
    assertNotKnown(check(c, '--issues', ITEMS));
  });

  test('#78 in the working tree of the fixture repo too: an item named at HEAD with no kept text stays "not known" after al check', (t) => {
    const w = namedNotKept(t);
    check(w.dir, '--issues', ITEMS);
    saveItem(w, 5, 'Build the export as JSON.\n');
    assertNotKnown(check(w.dir, '--issues', ITEMS));
  });
});

// =====================================================================
// b. C8 (LD-28, LD-66)

describe('C8: a judgement committed with no identity', () => {
  const J41 = 'INV-41 complies: the link expires 30 minutes after the email.';
  const J41_ITEMS = [J41, 'Item: "MUST expire 30 minutes after the email is sent"', 'Code (src/export.js): "export const ttl = 30;"', 'Test: tests not examined'];

  // B: the source and the note, committed with no al index. C: a later
  // commit of another source file. Returns {b, c}.
  function judgedNotKept(t) {
    const dir = world(t, [SP1, SP2]);
    write(dir, 'src/export.js', 'export const ttl = 30;\n');
    note(dir, judged(...J41_ITEMS));
    const b = commitAll(dir, `${NAME}: the export and the review`);
    write(dir, 'src/util.js', 'export const one = 1;\n');
    const c = commitAll(dir, `${NAME}: util`);
    return { dir, b, c };
  }

  test('#78 a clean checkout: al check gives the judgement the identity of the commit that first held it, so it is "stale: judged at <B>", not current', (t) => {
    const { dir, b } = judgedNotKept(t);
    const c = cloneOf(t, dir, { branch: 'feature', main: 'origin/main' });
    const r = check(c);
    const ls = judgements(r, 'INV-41');
    assert.equal(ls.length, 1, `one judgement line for INV-41:\n${show(r)}`);
    assert.ok(ls[0].endsWith(` · stale: judged at ${b.slice(0, 7)}`), `stale at the commit that first held the note:\n${show(r)}`);
    assert.ok(recordsWritten(r).includes(recordFile), `the identity is written to the request record:\n${show(r)}`);
    // A second run keeps that identity.
    const again = check(c);
    assert.ok(judgements(again, 'INV-41')[0].endsWith(` · stale: judged at ${b.slice(0, 7)}`), show(again));
  });

  test('#78 a shallow clone of the merge commit (the branch\'s earlier commits cut off, the base known): "not known when judged", never current', (t) => {
    const { dir } = judgedNotKept(t);
    const { mainTip } = mergeRef(dir);
    const c = cloneOf(t, dir, { branch: 'pr-merge', depth: 2, main: mainTip });
    assert.ok(isShallow(c), 'the fixture: a shallow clone');
    assert.equal(git(c, 'merge-base', 'main', 'HEAD'), mainTip, 'the fixture: the base is main\'s tip');
    const r = check(c);
    assert.equal(judgements(r, 'INV-41').length, 1, `one judgement line for INV-41:\n${show(r)}`);
    neverCurrent(r, 'INV-41');
    neverCurrent(check(c), 'INV-41');
  });

  test('#78 a shallow clone of the branch (git clone --depth 1): no judgement is current', (t) => {
    const { dir } = judgedNotKept(t);
    const c = cloneOf(t, dir, { branch: 'feature', depth: 1, noSingle: true, main: 'origin/main' });
    assert.ok(isShallow(c), 'the fixture: a shallow clone');
    neverCurrent(check(c), 'INV-41');
  });
});

// =====================================================================
// c. Bindings (LD-56, LD-61)

describe('Bindings: links committed with no binding, then the target changed in a later commit', () => {
  // L: the request share, its sign-off and a change spec with SP-1 changes
  // INV-41 and SP-3 builds-on INV-12, committed with no al index (no
  // binding). K: a later commit that changes INV-12 and INV-41.
  function linkedNotBound(t) {
    const dir = world(t, null, { link: false });
    newRequest(dir, NAME, `The owner wants ${NAME}.\n`, ['--tier', '2']);
    appendSection(dir, NAME, organized([R1]));
    ok(dir, ['record', NAME, 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
    write(dir, CS, doc([SP1, SP2, SP3]));
    const l = commitAll(dir, claim(NAME));
    assert.deepEqual(bindingsOf(record(dir, NAME), 'share/SP-3', 'builds-on', 'INV-12'), [], 'the fixture: no binding at L');
    editSpec(dir, 'INV-12', 'data', T12, N12, { serves: null });
    editSpec(dir, 'INV-41', 'rule', T41, N41);
    const k = commitAll(dir, `${NAME}: INV-12 and INV-41`);
    return { dir, l, k };
  }

  test('#78 a clean checkout: the builds-on link is bound from the commit that first declared it, so stale-base shows; the changes link binds the text at the base, so the map says "changed since the link"', (t) => {
    const { dir } = linkedNotBound(t);
    const c = cloneOf(t, dir, { branch: 'feature', main: 'origin/main' });
    const r = check(c);
    const rec = record(c, NAME);
    assert.equal(binding(rec, 'share/SP-3', 'builds-on', 'INV-12').target_sha256, sha(T12), `bound to the text when the link was declared:\n${show(r)}`);
    assert.equal(binding(rec, 'share/SP-1', 'changes', 'INV-41').target_sha256, sha(T41), `bound to the text at the base:\n${show(r)}`);
    const stale = staleBase(r, 'share/SP-3', 'builds-on', 'INV-12');
    assert.equal(stale.length, 1, `the stale-base hint on the builds-on link:\n${show(r)}`);
    assert.match(stale[0], /changed since it was bound/, show(r));
    const link = linkLines(r, 'share/SP-1 changes INV-41');
    assert.equal(link.length, 1, show(r));
    assert.equal(link[0].fact, 'changed since the link', show(r));
    assert.ok(recordsWritten(r).includes(recordFile), show(r));
  });

  test('#78 a shallow clone of the merge commit (the declaring commit cut off, the base known): no binding is written for the links, and the map says "not known: the link has no binding"', (t) => {
    const { dir } = linkedNotBound(t);
    const { mainTip } = mergeRef(dir);
    const c = cloneOf(t, dir, { branch: 'pr-merge', depth: 2, main: mainTip });
    assert.ok(isShallow(c), 'the fixture: a shallow clone');
    assert.equal(git(c, 'merge-base', 'main', 'HEAD'), mainTip, 'the fixture: the base is main\'s tip');
    const r = check(c);
    noBinding(c, 'share/SP-3', 'builds-on', 'INV-12', r);
    noBinding(c, 'share/SP-1', 'changes', 'INV-41', r);
    oneLinkNotKnown(r, 'share/SP-1 changes INV-41');
    assert.deepEqual(staleBase(r, 'share/SP-3', 'builds-on', 'INV-12'), [], `no hint from an invented binding:\n${show(r)}`);
  });

  test('#78 a shallow clone of the branch (git clone --depth 1): no binding is written for the links', (t) => {
    const { dir } = linkedNotBound(t);
    const c = cloneOf(t, dir, { branch: 'feature', depth: 1, noSingle: true, main: 'origin/main' });
    assert.ok(isShallow(c), 'the fixture: a shallow clone');
    const r = check(c);
    noBinding(c, 'share/SP-3', 'builds-on', 'INV-12', r);
    noBinding(c, 'share/SP-1', 'changes', 'INV-41', r);
    linkNotKnown(r, 'share/SP-1 changes INV-41');
  });
});

// =====================================================================
// d. The CI fixture: a merge commit of the branch into main's tip

describe('CI: the merge commit of the branch into main\'s tip', () => {
  // X is INV-60, five lines. The branch adds SP-1 changes INV-60 and edits
  // X's first line (its own consolidation), records not committed. main gets
  // a parallel edit of X's last line (other work). pr-merge is the merge
  // commit of the branch into main's tip.
  const X = ['A shared link MUST expire.', 'It MUST carry a signature.', 'It MUST name the invoice.', 'It MUST be sent by email.', 'It MUST be used once.'];
  const OWN0 = 'A shared link MUST expire after 24 hours.';
  const OTHER4 = 'It MUST be used at most once.';
  const MERGED = [OWN0, ...X.slice(1, 4), OTHER4].join('\n');
  const SPX = ['SP-1 rule serves:R1 changes:INV-60', 'A shared link lives for 24 hours.'];

  function ciWorld(t) {
    const dir = world(t, null, { link: false, onMain: (d) => addSpec(d, 'INV-60 rule', X.join('\n')) });
    newRequest(dir, NAME, `The owner wants ${NAME}.\n`, ['--tier', '2']);
    appendSection(dir, NAME, organized([R1]));
    ok(dir, ['record', NAME, 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
    write(dir, CS, doc([SPX, SP2]));
    editSpec(dir, 'INV-60', 'rule', X[0], OWN0);
    commitAll(dir, claim(NAME));
    git(dir, 'checkout', '-q', 'main');
    editFile(dir, SPEC, X[4], OTHER4);
    index(dir);
    commitAll(dir, 'other work: INV-60 used at most once');
    const refs = mergeRef(dir);
    assert.ok(git(dir, 'show', `${refs.merge}:${SPEC}`).includes(MERGED), 'the fixture: the merge holds both edits of INV-60');
    return { dir, ...refs };
  }

  test('#78 a clean checkout of the merge commit: the parallel-work hint (stale-base on the changes link) stays, and no own edit comes from the merge commit', (t) => {
    const { dir, mainTip } = ciWorld(t);
    const c = cloneOf(t, dir, { branch: 'pr-merge', main: mainTip });
    const r = check(c);
    const stale = staleBase(r, 'share/SP-1', 'changes', 'INV-60');
    assert.equal(stale.length, 1, `the parallel-work hint stays:\n${show(r)}`);
    assert.match(stale[0], /changed since it was bound/, show(r));
    assert.equal(hashOf(c, SPEC, 'INV-60'), sha(MERGED), `the fixture: al check indexed the merged text of INV-60:\n${show(r)}`);
    const own = (record(c, NAME).own_edits ?? []).filter((e) => e.paragraph === 'INV-60');
    assert.deepEqual(own.filter((e) => e.sha256 === sha(MERGED)), [], `no own edit of INV-60 from the merge commit:\n${JSON.stringify(own)}\n${show(r)}`);
    // And on a second run.
    assert.equal(staleBase(check(c), 'share/SP-1', 'changes', 'INV-60').length, 1, 'the hint stays on a second run');
  });

  test('#78 a shallow clone of the merge commit (depth 2): "not known", never a binding', (t) => {
    const { dir, mainTip } = ciWorld(t);
    const c = cloneOf(t, dir, { branch: 'pr-merge', depth: 2, main: mainTip });
    assert.ok(isShallow(c), 'the fixture: a shallow clone');
    const r = check(c);
    noBinding(c, 'share/SP-1', 'changes', 'INV-60', r);
    oneLinkNotKnown(r, 'share/SP-1 changes INV-60');
  });

  test('#78 a shallow clone of the merge commit (depth 1): never a binding', (t) => {
    const { dir } = ciWorld(t);
    const c = cloneOf(t, dir, { branch: 'pr-merge', depth: 1 });
    assert.ok(isShallow(c), 'the fixture: a shallow clone');
    const r = check(c);
    noBinding(c, 'share/SP-1', 'changes', 'INV-60', r);
    linkNotKnown(r, 'share/SP-1 changes INV-60');
  });
});

// =====================================================================
// e. The ordinary flow: facts kept at now

describe('The ordinary flow: an edit and al check before the commit', () => {
  test('#78 a new builds-on link and al check before the commit: the binding is written at now, and the records line names the request record', (t) => {
    const dir = world(t, [SP1, SP2]);
    write(dir, CS, doc([SP1, SP2, SP3]));
    const r = check(dir);
    assert.equal(binding(record(dir, NAME), 'share/SP-3', 'builds-on', 'INV-12').target_sha256, sha(T12), show(r));
    assert.ok(recordsWritten(r).includes(recordFile), show(r));
    commitAll(dir, `${NAME}: SP-3`);
    // A later edit of INV-12 by this branch gives the hint on the builds-on link.
    editSpec(dir, 'INV-12', 'data', T12, N12, { serves: null });
    commitAll(dir, `${NAME}: INV-12`);
    assert.equal(staleBase(check(dir), 'share/SP-3', 'builds-on', 'INV-12').length, 1);
  });

  test('#78 a judgement written and al check before the commit: its identity is kept at now (current), stays current after the commit of the note and records, and a later source commit makes it stale at the head of the first check', (t) => {
    const dir = world(t, [SP1, SP2]);
    write(dir, 'src/export.js', 'export const ttl = 30;\n');
    const a = commitAll(dir, `${NAME}: the export`);
    note(dir, judged('INV-41 complies: the link expires 30 minutes after the email.', 'Item: "MUST expire 30 minutes after the email is sent"', 'Code (src/export.js): "export const ttl = 30;"'));
    let r = check(dir);
    assert.ok(judgements(r, 'INV-41')[0]?.endsWith(' · current'), `kept at now:\n${show(r)}`);
    assert.ok(recordsWritten(r).includes(recordFile), show(r));
    commitAll(dir, `${NAME}: the review note`);
    r = check(dir);
    assert.ok(judgements(r, 'INV-41')[0]?.endsWith(' · current'), `the commit of the note and the records keeps it current:\n${show(r)}`);
    write(dir, 'src/util.js', 'export const one = 1;\n');
    commitAll(dir, `${NAME}: util`);
    r = check(dir);
    assert.ok(judgements(r, 'INV-41')[0]?.endsWith(` · stale: judged at ${a.slice(0, 7)}`), show(r));
  });

  test('#78 an item named in the working tree and al check --issues before the commit: its text is kept at now, so a later change gives "changed"', (t) => {
    const w = itemsWorld(t);
    saveItem(w, 5);
    nameItem(w);
    check(w.dir, '--issues', ITEMS);
    commitAll(w.dir, INV_CLAIM);
    saveItem(w, 5, 'Build the export as JSON.\n');
    assertChanged(check(w.dir, '--issues', ITEMS));
  });

  test('#78 a link and an edit of its target before the first al check: the changes link binds the base text, "changed since the link"; the own edit gives no stale-base', (t) => {
    const dir = world(t, null, { link: false });
    openRequest(dir, NAME, null);
    write(dir, CS, doc([SP1, SP2]));
    editSpec(dir, 'INV-41', 'rule', T41, N41);
    const r = check(dir);
    assert.equal(binding(record(dir, NAME), 'share/SP-1', 'changes', 'INV-41').target_sha256, sha(T41), show(r));
    const link = linkLines(r, 'share/SP-1 changes INV-41');
    assert.equal(link.length, 1, show(r));
    assert.equal(link[0].fact, 'changed since the link', show(r));
    assert.deepEqual(staleBase(r, 'share/SP-1', 'changes', 'INV-41'), [], show(r));
  });
});
