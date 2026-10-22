// #33: closed work items (requests/closed-items/request.md R1).
//
// - R1: a saved work item MAY say whether it is open or closed. For a closed
//   item, `al check --issues` gives a citation of a superseded ADR as
//   information, not as a hint. An item that does not say counts as open.
//   Out: the other hints on work items stay as they are.
//
// The boundary that the architect set for R1:
// - The item format assuredloop-items/1 gets an optional field `state`, with
//   the values OPEN or CLOSED, as `gh issue view --json state` gives them.
//   Other trackers map their states to these two. The README gives it in the
//   item's JSON Schema and in the `gh issue view ... --json` command.
// - An item with "state": "CLOSED" gets its issue-superseded findings as
//   `info`, with the same code, place, ID and text as the hint would have.
//   OPEN, or no `state`: `hint`, as in 3.1.0.
// - Any other `state` value ("closed", true, null, a number) is a value of
//   the wrong type: the field counts as absent, the item is still read and
//   gets no issue-unread, so it counts as open.
// - issue-missing, issue-bare-ref, issue-not-sub and phrase do not change for
//   a closed item: they stay hints.
// - Nothing new blocks: the exit code of `al check` and `al check --strict`
//   is the same as for the same project with no superseded citation.
//
// Nothing here reads the code under test: the tests run `node bin/al.js`
// (the helpers' BIN) in throwaway repos, and read README.md.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findings } from './helpers/invoicer.js';
import {
  REPO, al, commitAll, doc, editRecord, git, newRequest, show, write, writeYaml,
} from './helpers/project.js';

const NAME = 'inv';
const OWN = 'acme/invoicer';
const OWN_REMOTE = 'git@github.com:acme/invoicer.git';
const OWN_ITEM = 'https://github.com/acme/invoicer/issues/7';
const SPEC = 'specs/invoices.md';
const FOLDER = '../items';
const ISSUES = ['--issues', FOLDER];
const OWN_ITEMS = 'assuredloop-requests.json';
const ITEM_CODES = ['issue-missing', 'issue-superseded', 'issue-bare-ref', 'issue-not-sub', 'issue-unread', 'phrase'];

// =====================================================================
// Items, in the shape that `gh issue view --json number,url,body,comments,parent,state`
// prints, as in issue-hints-239.test.js. state: 'OPEN', 'CLOSED', any other
// value as written, or 'absent' (the default) for no state field.

const ghUrl = (repo, n) => `https://github.com/${repo}/issues/${n}`;
const ghParent = (key) => {
  const [repo, n] = key.split('#');
  return { id: `I_${n}`, number: Number(n), repository: { nameWithOwner: repo }, state: 'OPEN', title: `Issue ${n}`, url: ghUrl(repo, Number(n)) };
};
function ghItem(repo, n, { body = 'Nothing to hint.\n', comments = [], parent = `${OWN}#7`, state = 'absent' } = {}) {
  const url = ghUrl(repo, n);
  const item = {
    body,
    comments: comments.map((c, i) => ({
      author: { login: 'someone' }, authorAssociation: 'NONE', body: c.body, createdAt: '2026-05-01T00:00:00Z',
      id: `IC_${n}_${i + 1}`, includesCreatedEdit: false, isMinimized: !!c.hidden, minimizedReason: c.hidden ? 'OFF_TOPIC' : '',
      reactionGroups: [], url: `${url}#issuecomment-${n * 100 + i + 1}`, viewerDidAuthor: false,
    })),
    number: n,
    url,
  };
  if (parent !== 'absent') item.parent = parent === null ? null : ghParent(parent);
  if (state !== 'absent') item.state = state;
  return item;
}
const own = (n, opts) => ghItem(OWN, n, opts);
// An item of another tracker, with its state mapped to OPEN or CLOSED.
function projItem(ref, { body = `${ref}.\n`, comments = [], state = 'absent' } = {}) {
  const item = { ref, repository: 'PROJ', body, comments: comments.map((c) => ({ body: c.body, isMinimized: !!c.hidden })), parent: null };
  if (state !== 'absent') item.state = state;
  return item;
}

// =====================================================================
// The world: <root>/invoicer, a git repo whose origin remote is
// git@github.com:acme/invoicer.git, with a spec and the ADR chain ADR-1
// superseded by ADR-2, superseded by ADR-3 (accepted), and the open request
// inv with `tasks`. Its own item is acme/invoicer#7, through the file of own
// items in <root>/items, the folder of items.

const adrFile = (status, marker, heading, rationale) => `Status: ${status}\n\n${doc([[marker, heading], [`${marker.split(' ')[0]}-1 rationale`, rationale]])}`;
const ADRS = {
  'specs/adr/0001-paper.md': adrFile('superseded by ADR-2', 'ADR-1 choice decides:INV-2', '# ADR-1: Paper invoices', 'Context: invoices were posted.'),
  'specs/adr/0002-pdf.md': adrFile('superseded by ADR-3', 'ADR-2 choice decides:INV-2 supersedes:ADR-1', '# ADR-2: PDF invoices', 'Context: postage cost too much.'),
  'specs/adr/0003-email.md': adrFile('accepted', 'ADR-3 choice decides:INV-2 supersedes:ADR-2', '# ADR-3: Invoices by email', 'Context: a PDF alone was not enough.'),
};
const specText = (inv3 = 'Invoices are sent by email.') => doc([
  ['INV-1 note', '# Invoices'],
  ['INV-2 rule governed-by:ADR-3', 'An invoice MUST be sent by email.'],
  ['INV-3 note', inv3],
]);

function world(t, { tasks = [{ id: 'T1', ref: 'issue #31' }], config = {}, spec } = {}) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-33-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, 'invoicer');
  const items = join(root, 'items');
  mkdirSync(items);
  mkdirSync(dir);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.name', 'Fixture Author');
  git(dir, 'config', 'user.email', 'author@example.invalid');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'remote', 'add', 'origin', OWN_REMOTE);
  writeYaml(dir, '.assuredloop/config.yaml', { docs: [{ file: SPEC, prefix: 'INV' }], ...config });
  write(dir, SPEC, specText(spec));
  for (const [file, text] of Object.entries(ADRS)) write(dir, file, text);
  newRequest(dir, NAME, 'The owner wants the requester to see each invoice.\n');
  editRecord(dir, NAME, (rec) => { rec.tasks = tasks; });
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  write(items, OWN_ITEMS, `${JSON.stringify({ format: 'assuredloop-items/1', requests: { [NAME]: OWN_ITEM } }, null, 2)}\n`);
  return { root, dir, items };
}

// Item files in the folder: {file name: an item, a list, or a string as written}.
function save(w, files) {
  for (const [name, value] of Object.entries(files)) {
    write(w.items, name, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
  }
}

function check(w, ...args) {
  const r = al(w.dir, ['check', ...args]);
  return { ...r, findings: findings(r.stdout) };
}
// A run that must exit 0 and must not refuse.
function checked(w, ...args) {
  const r = check(w, ...args);
  assert.equal(r.code, 0, show(r));
  assert.doesNotMatch(r.stdout, /^al: /m, show(r));
  return r;
}

const coded = (r, code) => r.findings.filter((f) => f.code === code);
const graded = (r, severity, code) => r.findings.filter((f) => f.severity === severity && f.code === code);
const itemFindings = (r) => r.findings.filter((f) => ITEM_CODES.includes(f.code));
const notOk = (r) => r.findings.filter((f) => f.severity === 'not ok');
const where = (f) => (f.at === null ? f.file : `${f.file}:${f.at}`);
const sorted = (list) => [...list].sort();
// The finding line without its severity: code, place, ID and text.
const rest = (f) => f.line.replace(/^(not ok|hint|info) /, '');
function checkedItems(r, c) {
  const found = graded(r, 'info', 'issues');
  assert.equal(found.length, 1, `one info issues line:\n${show(r)}`);
  assert.equal(found[0].msg, `checked ${c} items for the tasks of the open requests, from ${FOLDER}`, show(r));
}

// The issue-superseded findings of the open run and of the closed run, for
// the same world with only the state changed: the closed run has each one as
// info, at the same place, with the same ID and text, and no hint.
function assertInfoForHints(open, closed) {
  const hints = coded(open, 'issue-superseded');
  assert.ok(hints.length > 0, `control: the open item gets issue-superseded:\n${show(open)}`);
  for (const f of hints) assert.equal(f.severity, 'hint', show(open));
  assert.deepEqual(graded(closed, 'hint', 'issue-superseded').map((f) => f.line), [], `a closed item gets no hint issue-superseded:\n${show(closed)}`);
  const infos = graded(closed, 'info', 'issue-superseded');
  assert.deepEqual(sorted(infos.map(rest)), sorted(hints.map(rest)), `the closed item gets info issue-superseded with the code, place, ID and text of the hint:\n${show(open)}\n${show(closed)}`);
  assert.deepEqual(coded(closed, 'issue-superseded').length, hints.length, show(closed));
  return infos;
}

// =====================================================================
// R1: a closed item's citation of a superseded ADR is info.

describe('closed-items R1: a CLOSED item gets issue-superseded as info, not as a hint', () => {
  test('the body names ADR-1 alone: info issue-superseded at acme/invoicer#31:3, ID inv/T1, naming ADR-1, with the text of the hint; no hint issue-superseded', (t) => {
    const w = world(t);
    const body = 'Some intro.\n\nWe keep\nthe old ADR-1 for now.\n';
    save(w, { 'a.json': own(31, { body, state: 'OPEN' }) });
    const open = checked(w, ...ISSUES);
    save(w, { 'a.json': own(31, { body, state: 'CLOSED' }) });
    const closed = checked(w, ...ISSUES);
    const [f] = assertInfoForHints(open, closed);
    assert.equal(where(f), `${OWN}#31:3`, show(closed));
    assert.equal(f.id, `${NAME}/T1`, show(closed));
    assert.match(f.msg, /\bADR-1\b/, show(closed));
    assert.deepEqual(notOk(closed).map((x) => x.line), [], show(closed));
    checkedItems(closed, 1);
  });

  test('a visible comment of a closed item names ADR-1 alone: info at acme/invoicer#31/comment-3:3 (k counts the hidden comment 2), with the text of the hint; no hint', (t) => {
    const w = world(t);
    const comments = [{ body: 'Agreed.\n' }, { body: 'We keep ADR-1.\n', hidden: true }, { body: 'Thanks.\n\nWe keep ADR-1.\n' }];
    save(w, { 'a.json': own(31, { comments, state: 'OPEN' }) });
    const open = checked(w, ...ISSUES);
    save(w, { 'a.json': own(31, { comments, state: 'CLOSED' }) });
    const closed = checked(w, ...ISSUES);
    const infos = assertInfoForHints(open, closed);
    assert.deepEqual(infos.map((f) => `${where(f)} ${f.id}`), [`${OWN}#31/comment-3:3 ${NAME}/T1`], show(closed));
  });

  test('a closed item that cites in its body and in a comment: both are info, each at its own place', (t) => {
    const w = world(t);
    const opts = { body: 'We keep ADR-1.\n', comments: [{ body: 'Yes,\nwe keep ADR-1.\n' }] };
    save(w, { 'a.json': own(31, { ...opts, state: 'OPEN' }) });
    const open = checked(w, ...ISSUES);
    save(w, { 'a.json': own(31, { ...opts, state: 'CLOSED' }) });
    const closed = checked(w, ...ISSUES);
    const infos = assertInfoForHints(open, closed);
    assert.deepEqual(sorted(infos.map(where)), sorted([`${OWN}#31:1`, `${OWN}#31/comment-1:1`]), show(closed));
  });

  test('the chain: a closed item that names ADR-1 with ADR-2 gets one info, naming ADR-2, as the hint would', (t) => {
    const w = world(t);
    save(w, { 'a.json': own(31, { body: 'ADR-1 gave way to ADR-2.\n', state: 'OPEN' }) });
    const open = checked(w, ...ISSUES);
    save(w, { 'a.json': own(31, { body: 'ADR-1 gave way to ADR-2.\n', state: 'CLOSED' }) });
    const closed = checked(w, ...ISSUES);
    const infos = assertInfoForHints(open, closed);
    assert.equal(infos.length, 1, show(closed));
    assert.match(infos[0].msg, /\bADR-2\b/, show(closed));
  });

  test('another tracker\'s item with state CLOSED (its state mapped): info at PROJ-12:<line> and PROJ-12/comment-1:<line>; no hint', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: 'PROJ-12' }] });
    const opts = { body: 'Intro.\n\nWe keep ADR-1.\n', comments: [{ body: 'We keep ADR-1.' }] };
    save(w, { 'a.json': projItem('PROJ-12', { ...opts, state: 'OPEN' }) });
    const open = checked(w, ...ISSUES);
    save(w, { 'a.json': projItem('PROJ-12', { ...opts, state: 'CLOSED' }) });
    const closed = checked(w, ...ISSUES);
    const infos = assertInfoForHints(open, closed);
    assert.deepEqual(sorted(infos.map((f) => `${where(f)} ${f.id}`)), sorted([`PROJ-12:3 ${NAME}/T1`, `PROJ-12/comment-1:1 ${NAME}/T1`]), show(closed));
  });

  test('the state belongs to each item: in one run, closed #31 gets info and open #32 and #33 (no state) get hints; in a list file too', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: '#31' }, { id: 'T2', ref: '#32' }, { id: 'T3', ref: '#33' }, { id: 'T4', ref: '#34' }, { id: 'T5', ref: '#35' }] });
    const body = 'We keep ADR-1.\n';
    save(w, {
      'a.json': own(31, { body, state: 'CLOSED' }),
      'b.json': own(32, { body, state: 'OPEN' }),
      'c.json': own(33, { body }),
      'list.json': [own(34, { body, state: 'CLOSED' }), own(35, { body, state: 'OPEN' })],
    });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(sorted(coded(r, 'issue-superseded').map((f) => `${f.severity} ${where(f)} ${f.id}`)), sorted([
      `info ${OWN}#31:1 ${NAME}/T1`,
      `hint ${OWN}#32:1 ${NAME}/T2`,
      `hint ${OWN}#33:1 ${NAME}/T3`,
      `info ${OWN}#34:1 ${NAME}/T4`,
      `hint ${OWN}#35:1 ${NAME}/T5`,
    ]), show(r));
    checkedItems(r, 5);
  });

  test('--strict: a closed item\'s citation is info too, the same lines as without --strict', (t) => {
    const w = world(t);
    save(w, { 'a.json': own(31, { body: 'We keep ADR-1.\n', state: 'CLOSED' }) });
    const plain = checked(w, ...ISSUES);
    const strict = check(w, '--strict', ...ISSUES);
    assert.deepEqual(graded(strict, 'hint', 'issue-superseded'), [], show(strict));
    assert.deepEqual(graded(strict, 'not ok', 'issue-superseded'), [], show(strict));
    assert.deepEqual(graded(strict, 'info', 'issue-superseded').map((f) => f.line), graded(plain, 'info', 'issue-superseded').map((f) => f.line), show(strict));
    assert.equal(graded(strict, 'info', 'issue-superseded').length, 1, show(strict));
  });
});

// =====================================================================
// R1: an item that does not say, or says OPEN, counts as open.

describe('closed-items R1: an OPEN item, and an item with no state, get issue-superseded as a hint, as in 3.1.0', () => {
  for (const [label, state] of [['state OPEN', 'OPEN'], ['no state field', 'absent']]) {
    test(`${label}: hint issue-superseded at acme/invoicer#31:3 and at acme/invoicer#31/comment-1:1, ID inv/T1; no info issue-superseded`, (t) => {
      const w = world(t);
      save(w, { 'a.json': own(31, { body: 'Some intro.\n\nWe keep\nthe old ADR-1 for now.\n', comments: [{ body: 'We keep ADR-1.\n' }], state }) });
      const r = checked(w, ...ISSUES);
      assert.deepEqual(sorted(coded(r, 'issue-superseded').map((f) => `${f.severity} ${where(f)} ${f.id}`)), sorted([
        `hint ${OWN}#31:3 ${NAME}/T1`,
        `hint ${OWN}#31/comment-1:1 ${NAME}/T1`,
      ]), show(r));
      checkedItems(r, 1);
    });
  }
});

describe('closed-items R1: a state that is not OPEN or CLOSED is of the wrong type: the item is read, gets no issue-unread, and counts as open', () => {
  const WRONG = [['"closed"', 'closed'], ['"Closed"', 'Closed'], ['"CLOSED " (a space after)', 'CLOSED '], ['"MERGED"', 'MERGED'], ['""', ''],
    ['true', true], ['false', false], ['null', null], ['0', 0], ['1', 1], ['["CLOSED"]', ['CLOSED']], ['{"state": "CLOSED"}', { state: 'CLOSED' }]];
  for (const [label, state] of WRONG) {
    test(`state ${label}: hint issue-superseded at acme/invoicer#31:1, no info issue-superseded, no issue-unread; the item is counted as checked`, (t) => {
      const w = world(t);
      save(w, { 'a.json': own(31, { body: 'We keep ADR-1.\n', state }) });
      const r = checked(w, ...ISSUES);
      assert.deepEqual(coded(r, 'issue-superseded').map((f) => `${f.severity} ${where(f)} ${f.id}`), [`hint ${OWN}#31:1 ${NAME}/T1`], show(r));
      assert.deepEqual(coded(r, 'issue-unread'), [], show(r));
      assert.deepEqual(coded(r, 'issue-missing'), [], show(r));
      checkedItems(r, 1);
    });
  }
});

// =====================================================================
// R1, Out: the other item hints stay as they are for a closed item.

describe('closed-items R1 (Out): the other hints on a closed item stay hints', () => {
  test('a world with each item code, all items OPEN and then all CLOSED: every finding other than issue-superseded is the same line; issue-missing, issue-bare-ref, issue-not-sub, phrase and issue-unread stay hints', (t) => {
    const w = world(t, {
      config: { phrases: ['the requester'] },
      tasks: [{ id: 'T1', ref: 'issue #31' }, { id: 'T2', ref: 'acme/web#5' }, { id: 'T3', ref: 'acme/web#9' }, { id: 'T4', ref: 'PROJ-12' }],
    });
    const items = (state) => ({
      'a.json': own(31, { body: 'We keep ADR-1.\n', parent: null, state, comments: [{ body: 'The requester\nsaw (#12).\n' }] }),
      'b.json': ghItem('acme/web', 5, { body: 'See (#12).\nThe requester asked.\nWe keep ADR-1.\n', state }),
      'c.json': projItem('PROJ-12', { body: 'The requester wants it.\n', state }),
      'bad.json': 'not json\n',
    });
    save(w, items('OPEN'));
    const open = checked(w, ...ISSUES);
    save(w, items('CLOSED'));
    const closed = checked(w, ...ISSUES);
    for (const code of ['issue-missing', 'issue-bare-ref', 'issue-not-sub', 'phrase', 'issue-unread']) {
      const found = coded(closed, code);
      assert.ok(found.length > 0, `${code} is given for the closed items:\n${show(closed)}`);
      for (const f of found) assert.equal(f.severity, 'hint', `${code} stays a hint:\n${show(closed)}`);
    }
    const others = (r) => sorted(r.findings.filter((f) => f.code !== 'issue-superseded').map((f) => f.line));
    assert.deepEqual(others(closed), others(open), `only issue-superseded changes:\n${show(open)}\n${show(closed)}`);
    assertInfoForHints(open, closed);
    assert.deepEqual(notOk(closed).map((f) => f.line), [], show(closed));
  });

  test('a closed item of another repository with a bare #12: hint issue-bare-ref at acme/web#5:1', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: 'acme/web#5' }] });
    save(w, { 'a.json': ghItem('acme/web', 5, { body: 'See (#12).\n', state: 'CLOSED' }) });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(coded(r, 'issue-bare-ref').map((f) => `${f.severity} ${where(f)} ${f.id}`), [`hint acme/web#5:1 ${NAME}/T1`], show(r));
  });

  test('a closed item that is not a child of the own item (parent null): hint issue-not-sub at acme/invoicer#32', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: '#32' }] });
    save(w, { 'a.json': own(32, { parent: null, state: 'CLOSED' }) });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(coded(r, 'issue-not-sub').map((f) => `${f.severity} ${where(f)} ${f.id}`), [`hint ${OWN}#32 ${NAME}/T1`], show(r));
  });

  test('a phrase in a closed item\'s body: hint phrase at acme/invoicer#31:2, ID inv/T1', (t) => {
    const w = world(t, { config: { phrases: ['the requester'] } });
    save(w, { 'a.json': own(31, { body: 'Intro.\nThe requester asked.\n', state: 'CLOSED' }) });
    const r = checked(w, ...ISSUES);
    const found = coded(r, 'phrase').filter((f) => f.file.includes('#'));
    assert.deepEqual(found.map((f) => `${f.severity} ${where(f)} ${f.id}`), [`hint ${OWN}#31:2 ${NAME}/T1`], show(r));
  });

  test('issue-missing is unaffected: a task that names a missing item beside a closed item gets hint issue-missing at acme/web#5', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: '#31' }, { id: 'T2', ref: 'acme/web#5' }] });
    save(w, { 'a.json': own(31, { state: 'CLOSED' }) });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(coded(r, 'issue-missing').map((f) => `${f.severity} ${where(f)} ${f.id}`), [`hint acme/web#5 ${NAME}/T2`], show(r));
    checkedItems(r, 1);
  });
});

// =====================================================================
// R1: nothing new blocks.

describe('closed-items R1: nothing new blocks, in any mode', () => {
  test('a closed item that cites ADR-1: al check --issues and al check --strict --issues exit as the same project with no citation does (0), with no not ok', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: '#31' }, { id: 'T2', ref: '#32' }] });
    save(w, { 'a.json': own(31, { state: 'CLOSED' }), 'b.json': own(32, { body: 'Done (ADR-1 gave way to ADR-2,\nand ADR-2 to ADR-3).\n', state: 'CLOSED' }) });
    const clean = { plain: check(w, ...ISSUES), strict: check(w, '--strict', ...ISSUES) };
    assert.deepEqual(coded(clean.plain, 'issue-superseded'), [], `control: no citation:\n${show(clean.plain)}`);
    save(w, { 'a.json': own(31, { body: 'We keep ADR-1.\n', comments: [{ body: 'Still ADR-1.\n' }], state: 'CLOSED' }) });
    for (const [mode, args] of [['plain', ISSUES], ['strict', ['--strict', ...ISSUES]]]) {
      const r = check(w, ...args);
      assert.equal(graded(r, 'info', 'issue-superseded').length, 2, show(r));
      assert.equal(r.code, clean[mode].code, `al check ${args.join(' ')}: the exit code of the project with no citation:\n${show(clean[mode])}\n${show(r)}`);
      assert.equal(r.code, 0, show(r));
      assert.deepEqual(notOk(r).map((f) => f.line), [], show(r));
    }
  });

  test('a closed item\'s citation and an open item\'s citation together: both modes exit 0, as with the open item\'s citation alone', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: '#31' }, { id: 'T2', ref: '#32' }] });
    save(w, { 'a.json': own(31, { state: 'CLOSED' }), 'b.json': own(32, { body: 'We keep ADR-1.\n', state: 'OPEN' }) });
    const before = { plain: check(w, ...ISSUES), strict: check(w, '--strict', ...ISSUES) };
    save(w, { 'a.json': own(31, { body: 'We keep ADR-1.\n', state: 'CLOSED' }) });
    for (const [mode, args] of [['plain', ISSUES], ['strict', ['--strict', ...ISSUES]]]) {
      const r = check(w, ...args);
      assert.equal(graded(r, 'info', 'issue-superseded').length, 1, show(r));
      assert.equal(graded(r, 'hint', 'issue-superseded').length, 1, show(r));
      assert.equal(r.code, before[mode].code, show(r));
      assert.equal(r.code, 0, show(r));
    }
  });
});

// =====================================================================
// The README: the item format and the gh command carry `state`.

// The README section "Hints from the linked work items", up to the next ## heading.
function readmeSection() {
  const md = readFileSync(join(REPO, 'README.md'), 'utf8');
  const at = md.indexOf('\n## Hints from the linked work items\n');
  assert.ok(at >= 0, 'README.md has the section "Hints from the linked work items"');
  const rest = md.slice(at + 1);
  const end = rest.indexOf('\n## ', 1);
  return end < 0 ? rest : rest.slice(0, end + 1);
}
const jsonBlocks = (section) => [...section.matchAll(/^```json[ \t]*\n([\s\S]*?)^```[ \t]*$/gm)].map((m) => m[1]);
function itemSchema() {
  const schemas = jsonBlocks(readmeSection()).map((b) => { try { return JSON.parse(b); } catch { return undefined; } })
    .filter((p) => p && typeof p === 'object' && !Array.isArray(p) && '$schema' in p);
  const found = schemas.filter((s) => s.title === 'an item file: one item, or a list of items');
  assert.equal(found.length, 1, `the README section holds one item file schema:\n${JSON.stringify(schemas, null, 2)}`);
  const item = found[0].$defs?.item;
  assert.ok(item && typeof item === 'object', `the item schema has $defs.item:\n${JSON.stringify(found[0], null, 2)}`);
  return item;
}
// The values that a property schema allows: an enum, a const, or a oneOf/anyOf of those.
function allowed(s) {
  if (!s || typeof s !== 'object') return undefined;
  if (Array.isArray(s.enum)) return s.enum;
  if ('const' in s) return [s.const];
  const alts = s.oneOf ?? s.anyOf;
  if (Array.isArray(alts)) {
    const parts = alts.map(allowed);
    return parts.every(Array.isArray) ? parts.flat() : undefined;
  }
  return undefined;
}

describe('closed-items R1: the README gives the field state', () => {
  test('the item schema has an optional property state, limited to the values OPEN and CLOSED', () => {
    const item = itemSchema();
    const state = item.properties?.state;
    assert.ok(state, `the item schema has a property state:\n${JSON.stringify(item, null, 2)}`);
    assert.deepEqual(sorted(allowed(state) ?? []), ['CLOSED', 'OPEN'], `state allows OPEN and CLOSED only:\n${JSON.stringify(state, null, 2)}`);
    assert.ok(!(item.required ?? []).includes('state'), `state is optional:\n${JSON.stringify(item, null, 2)}`);
  });

  test('each gh issue view command that saves an item (its --json holds body) asks for state', () => {
    const section = readmeSection().replace(/\\\n\s*/g, ' ');
    const commands = [...section.matchAll(/gh issue view [^\n]*?--json\s+([A-Za-z,]+)/g)].map((m) => m[1].split(','));
    const forItems = commands.filter((fields) => fields.includes('body'));
    assert.ok(forItems.length > 0, `the section has a gh issue view command that saves an item:\n${section}`);
    for (const fields of forItems) assert.ok(fields.includes('state'), `--json ${fields.join(',')} holds state:\n${section}`);
  });
});
