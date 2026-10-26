// #78: al check as the one command for a change and its review
// (requests/light-design/spec.md LD-18, LD-63, LD-41, LD-16, LD-25, LD-20
// step 7; requests/light-resign/request.md R1: group repeated lines, never
// leave one out). The map's paragraph lines and --full are in
// check-map-78.test.js; the moments that al keeps (no moment is invented) in
// check-moments-78.test.js.
//
// The interface these tests use, as agreed for #78:
// - `al check` runs `al index` first (with the same --issues <folder>), then
//   checks. When it writes or changes a record file under
//   .assuredloop/records/, it prints one line
//     records: al check wrote <path>, <path>; commit them with this change
//   naming each written file; no such line when no record changed. The other
//   lines of al index show as one line per kind, `index <kind>: ...`, each
//   naming every entry, never "N more"; a link is named
//   `<holder> <link> <target>`. `al index` stays a command.
// - `al check --at <commit>` answers as of that commit (spec, records and
//   change read from git; the base is the merge-base of that commit with
//   main) and writes nothing; no `records:` line.
// - `al check --all` is the audit: every item in force on its own line,
//   `in force <ID> <basis> · <file>:<line> · <what>: <text>`, basis `audit`
//   for an item that the change does not touch; no item only in a grouped
//   line; it works with no change selected; al adds no judgement.
// - On a change with no finding: the list, the map, and one line
//   `ok: nothing found by <code>, <code>, ...` naming each check that ran and
//   found nothing; a code that gave a finding is not in it; without --issues
//   no issue code. `ok: no marker lint` is gone.
// - `Next` only when it names a step that follows from this answer's facts.
// - The Not known line names each fact once.
// - `al context --diff <range> [--for review]` refuses (exit 2) with a
//   message that contains "the review view is now al check".
//
// Written from the requirement and the public interface only. Nothing here
// reads src/. No model and no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  al, appendSection, baseProject, binding, commitAll, doc, git, index, newRequest, ok, organized, record, refused,
  sha, tree, write, writesNothing,
} from './helpers/project.js';
import {
  CS, NAME, R1, SPEC, T12, T13, T41, editSpec, places, world,
} from './helpers/map-68.js';
import {
  INDEX_KINDS, INV_CLAIM, ITEMS, QUIET, assertChanged, changedRecords, check, copyOf, findingCodes, indexLine, indexLines,
  itemsWorld, nameItem, noRecordsLine, okCodes, out, quietChange, recordsWritten, saveItem, show,
} from './helpers/check-78.js';

const SP1 = ['SP-1 rule serves:R1 changes:INV-41', 'A shared export link lives for 24 hours.'];
const SP2 = ['SP-2 plan', 'One PR: the link, then the email.'];
const SP3 = ['SP-3 data serves:R1 builds-on:INV-12', 'An export names the number of each invoice.'];
const N41 = 'The export link MUST expire 24 hours after it is created.';

const recordFile = `.assuredloop/records/requests/${NAME}.yaml`;
const noNMore = (r) => assert.deepEqual(out(r).filter((l) => /\b\d+ more\b/.test(l)), [], `no "N more":\n${show(r)}`);

// =====================================================================
// 1. al check runs al index (LD-63, LD-16)

test('#78 al check runs al index: a new builds-on link is bound, one "records:" line names each record file that changed, and an "index bound:" line names the link', (t) => {
  const dir = world(t, [SP1, SP2]);
  assert.deepEqual(changedRecords(dir), [], 'the fixture starts with every record committed');
  write(dir, CS, doc([SP1, SP2, SP3]));
  const r = check(dir);
  const b = binding(record(dir, NAME), 'share/SP-3', 'builds-on', 'INV-12');
  assert.equal(b.target_sha256, sha(T12), `al check bound the link to the text of INV-12:\n${show(r)}`);
  const changed = changedRecords(dir);
  assert.ok(changed.includes(recordFile), `the request record changed:\n${changed.join('\n')}`);
  assert.deepEqual(recordsWritten(r), changed, `the records line names each record file that changed:\n${show(r)}`);
  const bound = indexLine(r, 'bound');
  assert.ok(bound.includes('share/SP-3 builds-on INV-12'), `the bound line names the link:\n${show(r)}`);
  assert.ok(bound.includes('share/SP-3 serves share/R1'), `the bound line names each link that al bound:\n${show(r)}`);
  assert.deepEqual(out(r).filter((l) => /^(Wrote |No record changed)/.test(l)), [], `al index's write line is the records line:\n${show(r)}`);
  noNMore(r);
});

test('#78 a second al check right after the first, with nothing changed: no "records:" line, and nothing written', (t) => {
  const dir = world(t, [SP1, SP2]);
  write(dir, CS, doc([SP1, SP2, SP3]));
  recordsWritten(check(dir));
  const again = writesNothing(dir, ['check']);
  noRecordsLine(again);
  // And with every record committed: still no line.
  commitAll(dir, `${NAME}: SP-3 and its records`);
  noRecordsLine(writesNothing(dir, ['check']));
});

test('#78 al check writes the records that al index writes; al index stays a command', (t) => {
  const dir = world(t, [SP1, SP2]);
  write(dir, CS, doc([SP1, SP2, SP3]));
  editSpec(dir, 'INV-41', 'rule', T41, N41);
  const twin = copyOf(t, dir);
  const r = check(dir);
  ok(twin, ['index']);
  const records = (d) => Object.fromEntries(Object.entries(tree(d)).filter(([p]) => p.startsWith('.assuredloop/records/')));
  assert.deepEqual(records(dir), records(twin), `al check and al index write the same records:\n${show(r)}`);
  assert.deepEqual(recordsWritten(r), changedRecords(dir), show(r));
});

test('#78 the lines of al index in al check: one line for each kind, each naming every entry (twelve links bound, two removed, one not bound), never "N more"', (t) => {
  const dir = world(t, [SP1, SP2, SP3]);
  // Six new paragraphs, each with a serves and a builds-on link: twelve links.
  const many = [1, 2, 3, 4, 5, 6].map((n) => [`SP-${10 + n} data serves:R1 builds-on:INV-12`, `Export field ${n} is named in the header.`]);
  write(dir, CS, doc([SP1, SP2, ...many]));
  let r = check(dir);
  const bound = indexLine(r, 'bound');
  for (let n = 11; n <= 16; n++) {
    for (const link of [`share/SP-${n} serves share/R1`, `share/SP-${n} builds-on INV-12`]) {
      assert.ok(bound.includes(link), `the bound line names ${link}:\n${show(r)}`);
    }
  }
  noNMore(r);
  commitAll(dir, `${NAME}: six fields`);

  // SP-3 is gone (two links removed) and SP-2 names a paragraph that is not there.
  write(dir, CS, doc([SP1, ['SP-2 plan builds-on:INV-99', 'One PR.'], ...many]));
  r = check(dir);
  const removed = indexLine(r, 'removed');
  assert.ok(removed.includes('share/SP-3 serves share/R1'), `the removed line names each removed link:\n${show(r)}`);
  assert.ok(removed.includes('share/SP-3 builds-on INV-12'), `the removed line names each removed link:\n${show(r)}`);
  assert.ok(indexLine(r, 'not bound').includes('share/SP-2 builds-on INV-99'), show(r));
  for (const kind of INDEX_KINDS) assert.ok(indexLines(r, kind).length <= 1, `at most one "index ${kind}: " line:\n${show(r)}`);
  assert.deepEqual(out(r).filter((l) => /^(removed|not bound|bound|kept): /.test(l)), [], `al index's lines show with "index ":\n${show(r)}`);
  noNMore(r);
});

test('#78 al check --issues runs al index --issues: an item named in this edit keeps its text at now, so a later change of the item gives "changed", not "not known"', (t) => {
  const w = itemsWorld(t);
  saveItem(w, 5);
  nameItem(w);
  const first = check(w.dir, '--issues', ITEMS);
  assert.ok(recordsWritten(first).includes('.assuredloop/records/requests/inv.yaml'), `the request record is written:\n${show(first)}`);
  commitAll(w.dir, INV_CLAIM);
  saveItem(w, 5, 'Build the export as JSON.\n');
  assertChanged(check(w.dir, '--issues', ITEMS));
});

// =====================================================================
// 2. --at <commit> (LD-18, LD-46)

// The lines that say what al found and what the list and the map show.
const facts = (r) => out(r).filter((l) => /^(hint |not ok |in force |proposed |map |map: |review note |judgement |\d+ further items)/.test(l));

test('#78 al check --at <commit> answers as of that commit: a dirty edit of the working tree does not show, nothing is written, no "records:" line, and the answer is that of a clean checkout of the commit', (t) => {
  const dir = world(t, [SP1, SP2]);
  const a = git(dir, 'rev-parse', 'HEAD');
  editSpec(dir, 'INV-41', 'rule', T41, N41);
  write(dir, CS, doc([SP1, SP2, SP3]));
  const r = writesNothing(dir, ['check', '--at', a]);
  noRecordsLine(r);
  assert.deepEqual(out(r).filter((l) => l.includes(N41) || /\bSP-3\b/.test(l)), [], `the working tree does not show:\n${show(r)}`);
  assert.deepEqual(out(r).filter((l) => l.startsWith('hint stale-base ')), [], show(r));
  const links = places(dir, CS, 'SP-1').map((p) => `map link share/SP-1 changes INV-41 · ${p} · unchanged since the link`);
  assert.ok(out(r).some((l) => links.includes(l)), `the link as at the commit, one of:\n${links.join('\n')}\n${show(r)}`);

  // The same facts as al check on a clean checkout of that commit.
  const c = copyOf(t, dir);
  git(c, 'checkout', '-q', '--', '.');
  git(c, 'clean', '-q', '-f', '-d');
  const clean = check(c);
  assert.deepEqual(facts(r), facts(clean), `--at answers as a checkout of the commit:\n${show(r)}\n${show(clean)}`);
});

test('#78 al check --at <commit> reads the records from git: a sign-off that is in the working tree but not committed is not used', (t) => {
  const dir = world(t, null, { link: false });
  newRequest(dir, NAME, `The owner wants ${NAME}.\n`, ['--tier', '2']);
  appendSection(dir, NAME, organized([R1]));
  write(dir, CS, doc([SP1, SP2]));
  index(dir);
  const a = commitAll(dir, `${NAME}: the request\n\nTier: 2 — ${NAME}`);
  ok(dir, ['record', NAME, 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
  const now = check(dir);
  assert.ok(out(now).some((l) => l.includes('signed in S1')), `control: the working tree has the sign-off:\n${show(now)}`);
  const r = writesNothing(dir, ['check', '--at', a]);
  noRecordsLine(r);
  assert.deepEqual(out(r).filter((l) => l.includes('signed in S1')), [], `the uncommitted sign-off is not used:\n${show(r)}`);
});

test('#78 al check --at <commit>: the base is the merge-base of that commit with main, not of HEAD', (t) => {
  const dir = world(t, [SP1, SP2]);
  const a = git(dir, 'rev-parse', 'HEAD');
  // main moves on, and the branch merges main: HEAD has a newer merge-base.
  git(dir, 'checkout', '-q', 'main');
  write(dir, 'src/other.js', 'export const other = 1;\n');
  commitAll(dir, 'other work');
  git(dir, 'checkout', '-q', 'feature');
  git(dir, 'merge', '-q', '--no-ff', '-m', 'Merge main', 'main');
  const atBase = git(dir, 'merge-base', 'main', a).slice(0, 7);
  const headBase = git(dir, 'merge-base', 'main', 'HEAD').slice(0, 7);
  assert.notEqual(atBase, headBase, 'the fixture: the two merge-bases differ');
  const r = writesNothing(dir, ['check', '--at', a]);
  const head = out(r).find((l) => l.startsWith('map: '));
  assert.equal(head, `map: the change against its base ${atBase} (own changes: ${NAME}), from facts only`, show(r));
});

// =====================================================================
// 3. --all: the audit (LD-18, LD-20 step 7, LD-25)

const ALL_LINE = (id, basis, place, what, text) => `in force ${id} ${basis} · ${place} · ${what}: ${text}`;

function auditLine(r, dir, id, what, text, file = SPEC) {
  const options = places(dir, file, id).map((p) => ALL_LINE(id, 'audit', p, what, text));
  assert.ok(out(r).some((l) => options.includes(l)), `one of:\n${options.join('\n')}\n${show(r)}`);
}

function noGroupedItems(r) {
  for (const l of out(r).filter((x) => /^\d+ further items in force/.test(x))) {
    assert.match(l, /^0 further items in force/, `no item only in a grouped line:\n${show(r)}`);
  }
}
const noJudgement = (r) => assert.deepEqual(out(r).filter((l) => /\b(complies|violates|not applicable)\b/.test(l)), [], `al adds no judgement:\n${show(r)}`);

test('#78 al check --all: every item in force on its own line; an item that the change does not touch has basis "audit"; the cited one keeps its basis', (t) => {
  const dir = world(t, [SP1, SP2]);
  const r = check(dir, '--all');
  auditLine(r, dir, 'INV-12', 'data', T12);
  auditLine(r, dir, 'INV-13', 'rule', T13);
  const adr = out(r).filter((l) => l.startsWith('in force ADR-3 '));
  assert.equal(adr.length, 1, `ADR-3 on its own line:\n${show(r)}`);
  assert.match(adr[0], /^in force ADR-3 audit · specs\/adr\/0003-signed-links\.md:\d+ · .+: .+$/, show(r));
  const inv41 = out(r).filter((l) => l.startsWith('in force INV-41 '));
  assert.equal(inv41.length, 1, `INV-41 once:\n${show(r)}`);
  assert.match(inv41[0], /^in force INV-41 cited\b/, `the cited item keeps its basis:\n${show(r)}`);
  for (const id of ['INV-12', 'INV-13', 'INV-41', 'ADR-3']) {
    assert.equal(out(r).filter((l) => l.startsWith(`in force ${id} `)).length, 1, `${id} once:\n${show(r)}`);
  }
  assert.deepEqual(out(r).filter((l) => l.startsWith('in force INV-1 ')), [], `a note is not in force:\n${show(r)}`);
  noGroupedItems(r);
  noJudgement(r);
});

test('#78 al check --all with no change selected: every item in force has basis "audit"', (t) => {
  const dir = baseProject(t);
  const r = check(dir, '--all');
  auditLine(r, dir, 'INV-12', 'data', T12);
  auditLine(r, dir, 'INV-13', 'rule', T13);
  auditLine(r, dir, 'INV-41', 'rule', T41);
  assert.equal(out(r).filter((l) => /^in force ADR-3 audit · /.test(l)).length, 1, show(r));
  noGroupedItems(r);
  noJudgement(r);
});

// =====================================================================
// 4. An ordinary change (LD-41)

test('#78 a change with no finding: the list, the map, and one "ok: nothing found by ..." line that names the checks; no hint, no not ok, no "ok: no marker lint"', (t) => {
  const dir = quietChange(t);
  const r = check(dir);
  assert.deepEqual(out(r).filter((l) => /^(hint|not ok) /.test(l)), [], `the fixture has no finding:\n${show(r)}`);
  const codes = okCodes(r);
  for (const code of ['lost-id', 'no-link']) assert.ok(codes.includes(code), `the ok line names ${code}:\n${show(r)}`);
  assert.deepEqual(codes.filter((c) => c.startsWith('issue')), [], `without --issues, no issue code (C7 does not run):\n${show(r)}`);
  assert.ok(!out(r).includes('ok: no marker lint'), `the old line is gone:\n${show(r)}`);
  assert.ok(out(r).some((l) => /^\d+ further items in force|^list(:| basis:| limits:)/.test(l)), `the list:\n${show(r)}`);
  assert.equal(out(r).filter((l) => l.startsWith('map: ')).length, 1, `the map:\n${show(r)}`);
});

test('#78 a code that gave a finding in this run is not in the ok line; the codes that found nothing are', (t) => {
  const dir = quietChange(t, { spec: `${QUIET}\n${doc([['INV-3 rule', 'An invoice MUST have a line.']])}` });
  const r = check(dir);
  const found = findingCodes(r);
  assert.ok(found.includes('no-link'), `the fixture: INV-3 is a rule with no link:\n${show(r)}`);
  const codes = okCodes(r);
  for (const code of found) assert.ok(!codes.includes(code), `${code} gave a finding, so it is not in the ok line:\n${show(r)}`);
  assert.ok(codes.includes('lost-id'), show(r));
});

test('#78 with --issues, C7 runs: issue-changed is in the ok line while the item is as kept, and not once the item changed', (t) => {
  const w = itemsWorld(t);
  saveItem(w, 5);
  nameItem(w);
  ok(w.dir, ['index', '--issues', ITEMS]);
  commitAll(w.dir, INV_CLAIM);
  let r = check(w.dir, '--issues', ITEMS);
  assert.ok(okCodes(r).includes('issue-changed'), `C7 ran and found nothing:\n${show(r)}`);
  saveItem(w, 5, 'Build the export as JSON.\n');
  r = check(w.dir, '--issues', ITEMS);
  assertChanged(r);
  assert.ok(!okCodes(r).includes('issue-changed'), show(r));
});

// =====================================================================
// 5. Next only where it helps (LD-18)

test('#78 Next: no "Next" line on a change with no finding; a change with a hint still gets one', (t) => {
  const quiet = check(quietChange(t));
  assert.deepEqual(out(quiet).filter((l) => /^Next\b/.test(l)), [], `no Next line:\n${show(quiet)}`);
  const hinted = check(quietChange(t, { spec: `${QUIET}\n${doc([['INV-3 rule', 'An invoice MUST have a line.']])}` }));
  assert.equal(out(hinted).filter((l) => /^Next\b/.test(l)).length, 1, `control: a hint to deal with gives a Next line:\n${show(hinted)}`);
});

// =====================================================================
// 6. Not known: each fact once

function eachFactOnce(r) {
  const ls = out(r).filter((l) => /^Not known\b/.test(l));
  assert.equal(ls.length, 1, `one Not known line:\n${show(r)}`);
  assert.equal(r.stdout.split('whether each kind is right').length - 1, 1, `"whether each kind is right" once:\n${show(r)}`);
  const clauses = ls[0].replace(/^Not known\s+/, '').split(/[;,] /).map((c) => c.replace(/\s*\(the review judges these?\)$/, '').trim());
  assert.equal(new Set(clauses).size, clauses.length, `each fact once:\n${ls[0]}`);
}

test('#78 Not known names each fact once: "whether each kind is right" once in al check, al check --full and al check --all on a change', (t) => {
  const dir = world(t, [SP1, SP2, SP3]);
  editSpec(dir, 'INV-41', 'rule', T41, N41);
  for (const args of [[], ['--full'], ['--all']]) eachFactOnce(check(dir, ...args));
});

// =====================================================================
// 7. The review view goes (LD-63)

test('#78 the review view goes: al context --diff <range> --for review and al context --diff <range> refuse with "the review view is now al check"', (t) => {
  const dir = world(t, [SP1, SP2]);
  editSpec(dir, 'INV-41', 'rule', T41, N41);
  index(dir);
  commitAll(dir, `${NAME}: INV-41`);
  for (const args of [
    ['context', '--diff', 'main...HEAD', '--for', 'review'],
    ['context', '--diff', 'main...HEAD'],
    ['context', '--diff', `${git(dir, 'rev-parse', 'main')}..HEAD`, '--for', 'review'],
  ]) {
    const r = refused(dir, args);
    assert.match(r.stdout, /the review view is now al check/, show(r));
  }
});
