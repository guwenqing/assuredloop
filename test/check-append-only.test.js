// al check, append-only per commit [REC-12]: over main..HEAD (main is
// origin/main when it exists, else local main), each commit against its first
// parent. The entries of "Owner's words and dialog" and "Decisions" only grow
// at the end; a file in a request's origin/ never changes or goes; nothing
// changes under a request archived on main. The move to requests/archive/ is
// fine, and a request archived only on this branch may still be edited [REC-1].
// check exits 0 [HNT-3]. Acceptance C7.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, addOrigin, runAl } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';
import { ORG, addRequest, both } from './helpers/request.js';

const DIR = 'requests/inv';
const MD = `${DIR}/request.md`;
const WORDS_FILE = `${DIR}/origin/2026-09-20-owner-words.md`;
const W1 = '- 2026-09-20 owner chat, snapshot origin/2026-09-20-owner-words.md\n';
const W2 = '- 2026-09-20 AI asked: one invoice or a period? Owner: one invoice\n  for now.\n';
const W3 = '- 2026-09-24 owner: "the email link can wait".\n';
const D1 = '- D1, 2026-09-21. Source: the owner. CSV only for now.\n';
const D2 = '- D2, 2026-09-22. Source: the owner. Dates in ISO 8601,\n  with the zone.\n';
const D3 = '- D3, 2026-09-24. Source: the owner. The email link waits.\n';

// request.md with these Owner's words and Decisions entries, then `rest`.
const requestMd = ({ words = [W1, W2], decisions = [D1, D2], status = 'open', rest = '' } = {}) =>
  `# Invoices\nType: story · Tier: 2 · Status: ${status}\n\n## Owner's words and dialog\n\n${words.join('')}\n` +
  `${ORG}Signed off: 2026-09-21 owner, origin/2026-09-21-signoff.md\n\n## Decisions\n\n${decisions.join('')}${rest}`;
const OUTCOME = '\n## Outcome\n\n- R1 Invoice export: in no section\n- Decisions: D1, D2\n- Agent rulings: none\n\nNotes:\n';

// Main holds the signed request `inv`; HEAD is the branch `feature` from it.
function base(t) {
  const repo = makeRepo(t);
  addRequest(repo, 'inv', null);
  repo.write(MD, requestMd());
  repo.commit('open inv', { date: '2026-09-21T10:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'feature']);
  return repo;
}
const commit = (repo, message) => repo.commit(message);
const edit = (repo, opts, message) => { repo.write(MD, requestMd(opts)); return commit(repo, message); };

// check exits 0, says what it protects, and passes the [VW-9] frame.
function check(repo, main = 'local main') {
  const r = runAl(repo.dir, ['check']);
  assert.equal(r.code, 0, both(r));
  assert.ok(lines(r.stdout).some((l) => l.includes('protects a PR only when check runs on it')),
    `a line should say it protects a PR only when check runs on it:\n${r.stdout}`);
  assertFrame(r.stdout, { main });
  return r;
}
const notOkLine = (r, id, path = '') => lines(r.stdout).find((l) => l.includes('not ok') && l.includes(id.slice(0, 7)) && l.includes(path));
const assertNotOkAt = (r, id, path) => assert.ok(notOkLine(r, id, path), `expected a "not ok" line naming ${id.slice(0, 7)} and ${path}:\n${r.stdout}`);
const assertFine = (r, id) => assert.ok(!notOkLine(r, id), `commit ${id.slice(0, 7)} should not be "not ok":\n${r.stdout}`);

// One edit each, all "not ok" on the commit that makes it.
const EDITS = {
  'a Decisions entry edited': { decisions: [D1.replace('CSV only', 'CSV and PDF'), D2] },
  'a Decisions entry\'s continuation line edited': { decisions: [D1, D2.replace('with the zone', 'with the offset')] },
  'a Decisions entry removed': { decisions: [D1] },
  'two Decisions entries swapped': { decisions: [D2, D1] },
  'a Decisions entry inserted before the old ones': { decisions: [D3, D1, D2] },
  'an Owner\'s words entry\'s continuation line edited': { words: [W1, W2.replace('for now', 'for this year')] },
  'an Owner\'s words entry removed': { words: [W2] },
};

for (const [label, opts] of Object.entries(EDITS)) {
  test(`C7 [REC-12] check: ${label} is "not ok" on a line naming the commit and ${MD}; exit 0`, (t) => {
    const repo = base(t);
    const c = edit(repo, opts, label);
    assertNotOkAt(check(repo), c, MD);
  });
}

test('C7 [REC-12] check: entries appended to both lists, and a new Parts section, are fine; a later edit of an appended entry is not', (t) => {
  const repo = base(t);
  const parts = '\n## Parts\n\n1. CSV export\n2. Email link\n';
  const c = edit(repo, { words: [W1, W2, W3], decisions: [D1, D2, D3], rest: parts }, 'append');
  const later = edit(repo, { words: [W1, W2, W3], decisions: [D1, D2, D3.replace('waits', 'is dropped')], rest: parts }, 'edit D3');
  const r = check(repo);
  assertFine(r, c);
  assertNotOkAt(r, later, MD);
});

test('C7 [REC-12] check: a file in origin/ changed or deleted is "not ok"; a new one is fine, until a later commit changes it', (t) => {
  const repo = base(t);
  repo.write(`${DIR}/origin/2026-09-24-issue-31.md`, 'Source: https://example.com/31\nFetched: 2026-09-24T10:00Z\nSHA-256: 0\n---\nx\n');
  const added = commit(repo, 'new snapshot');
  repo.write(`${DIR}/origin/2026-09-24-issue-31.md`, 'Source: https://example.com/31\nFetched: 2026-09-24T10:00Z\nSHA-256: 0\n---\ny\n');
  const changedNew = commit(repo, 'change the new snapshot');
  repo.write(WORDS_FILE, `${repo.read(WORDS_FILE).toString()}more words\n`);
  const changed = commit(repo, 'change the owner\'s words snapshot');
  rmSync(join(repo.dir, `${DIR}/origin/2026-09-21-signoff.md`));
  const deleted = commit(repo, 'delete the sign-off');

  const r = check(repo);
  assertFine(r, added);
  assertNotOkAt(r, changedNew, `${DIR}/origin/2026-09-24-issue-31.md`);
  assertNotOkAt(r, changed, WORDS_FILE);
  assertNotOkAt(r, deleted, `${DIR}/origin/2026-09-21-signoff.md`);
});

test('C7 [REC-12] check: an edit undone in a later commit is still reported, for the commit that made it', (t) => {
  const repo = base(t);
  const made = edit(repo, { decisions: [D1.replace('CSV only', 'CSV and PDF'), D2] }, 'edit D1');
  edit(repo, {}, 'undo');
  assert.equal(repo.git(['diff', 'main', 'HEAD', '--', MD]), '', 'the final state equals main');
  assertNotOkAt(check(repo), made, MD);
});

test('C7 [REC-12] check reads only main..HEAD: an edit already in main\'s history is not reported, nor anything on main itself', (t) => {
  const repo = makeRepo(t);
  addRequest(repo, 'inv', null);
  repo.write(MD, requestMd());
  commit(repo, 'open inv');
  const onMain = edit(repo, { decisions: [D1.replace('CSV only', 'CSV and PDF'), D2] }, 'edit D1 on main');
  assertFine(check(repo), onMain);

  repo.git(['checkout', '-q', '-b', 'feature']);
  const appended = edit(repo, { decisions: [D1.replace('CSV only', 'CSV and PDF'), D2, D3] }, 'append D3');
  const edited = edit(repo, { decisions: [D1.replace('CSV only', 'CSV and PDF'), D2.replace('with the zone', 'with the offset'), D3] }, 'edit D2');
  const r = check(repo);
  assertFine(r, onMain);
  assertFine(r, appended);
  assertNotOkAt(r, edited, MD);
});

test('C7 [REC-12] check uses origin/main when it exists: a commit on local main that origin/main lacks is checked', (t) => {
  const repo = makeRepo(t);
  addRequest(repo, 'inv', null);
  repo.write(MD, requestMd());
  commit(repo, 'open inv');
  addOrigin(t, repo);
  const unpushed = edit(repo, { decisions: [D1.replace('CSV only', 'CSV and PDF'), D2] }, 'edit D1, not pushed');
  assertNotOkAt(check(repo, 'origin/main'), unpushed, MD);
});

// The request archived on main: requests/archive/done/, with Notes in its Outcome.
function archivedOnMain(t) {
  const repo = makeRepo(t);
  addRequest(repo, 'done', null, { dir: 'requests/archive/done' });
  repo.write('requests/archive/done/request.md', requestMd({ status: 'concluded', rest: OUTCOME }));
  commit(repo, 'done, archived');
  repo.git(['checkout', '-q', '-b', 'feature']);
  return repo;
}

test('C7 [REC-12][REC-1] check: any change under a request archived on main is "not ok", its Outcome notes and a new origin/ file too', (t) => {
  const repo = archivedOnMain(t);
  const md = 'requests/archive/done/request.md';
  repo.write(md, `${repo.read(md).toString()}The owner asked for PDF later.\n`);
  const notes = commit(repo, 'notes on done');
  const late = 'requests/archive/done/origin/2026-09-30-late.md';
  repo.write(late, 'Source: https://example.com/late\nFetched: 2026-09-30T10:00Z\nSHA-256: 0\n---\nlate\n');
  const added = commit(repo, 'a late snapshot for done');

  const r = check(repo);
  assertNotOkAt(r, notes, md);
  assertNotOkAt(r, added, late);
});

test('C7 [REC-12][REC-1] check: archiving on this branch (the move, the Status, the Outcome) is fine, and so are later notes; its decisions and origin/ files stay append-only', (t) => {
  const repo = base(t);
  mkdirSync(join(repo.dir, 'requests/archive'), { recursive: true });
  repo.git(['mv', DIR, 'requests/archive/inv']);
  const archived = 'requests/archive/inv/request.md';
  repo.write(archived, requestMd({ status: 'concluded', rest: OUTCOME }));
  const moved = commit(repo, 'conclude inv');
  repo.write(archived, requestMd({ status: 'concluded', rest: `${OUTCOME}The owner asked for PDF later.\n` }));
  const notes = commit(repo, 'notes');
  repo.write(archived, requestMd({ status: 'concluded', decisions: [D1.replace('CSV only', 'CSV and PDF'), D2], rest: `${OUTCOME}The owner asked for PDF later.\n` }));
  const decision = commit(repo, 'edit D1 after archiving');
  const words = 'requests/archive/inv/origin/2026-09-20-owner-words.md';
  repo.write(words, `${repo.read(words).toString()}more words\n`);
  const origin = commit(repo, 'edit the snapshot after archiving');

  const r = check(repo);
  assertFine(r, moved);
  assertFine(r, notes);
  assertNotOkAt(r, decision, archived);
  assertNotOkAt(r, origin, words);
});

test('C7 [REC-12] check: the move to requests/archive/ that also edits an origin/ file in the same commit is "not ok"', (t) => {
  const repo = base(t);
  mkdirSync(join(repo.dir, 'requests/archive'), { recursive: true });
  repo.git(['mv', DIR, 'requests/archive/inv']);
  repo.write('requests/archive/inv/request.md', requestMd({ status: 'concluded', rest: OUTCOME }));
  const words = 'requests/archive/inv/origin/2026-09-20-owner-words.md';
  repo.write(words, `${repo.read(words).toString()}more words\n`);
  const c = commit(repo, 'conclude inv, and edit the snapshot');
  assertNotOkAt(check(repo), c, 'origin/2026-09-20-owner-words.md');
});

test('C7 [REC-12] check reads non-ASCII names in origin/: an edit and a deletion are "not ok", naming the file as it is, not git-quoted; a new one is fine', (t) => {
  const snap = (text) => `Source: chat with the owner\nFetched: 2026-09-20T09:00Z\nSHA-256: 0\n---\n${text}\n`;
  const repo = makeRepo(t);
  addRequest(repo, 'inv', null);
  repo.write(MD, requestMd());
  repo.write(`${DIR}/origin/é.md`, snap('résumé'));
  repo.write(`${DIR}/origin/ü.md`, snap('über'));
  commit(repo, 'open inv');
  repo.git(['checkout', '-q', '-b', 'feature']);
  repo.write(`${DIR}/origin/ñ.md`, snap('año'));
  const added = commit(repo, 'a new snapshot, ñ.md');
  repo.write(`${DIR}/origin/é.md`, snap('résumé, edited'));
  const edited = commit(repo, 'edit é.md');
  rmSync(join(repo.dir, `${DIR}/origin/ü.md`));
  const deleted = commit(repo, 'delete ü.md');

  const r = check(repo);
  assertFine(r, added);
  assertNotOkAt(r, edited, 'origin/é.md');
  assertNotOkAt(r, deleted, 'origin/ü.md');
});
