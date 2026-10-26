// #3: the saved items name each request's own item (requests/own-item/
// request.md R1, signed; the change spec requests/own-item/spec.md SP-4,
// SP-5 and SP-7 to SP-12).
//
// - The folder of `al check --issues <folder>` may hold
//   assuredloop-requests.json: {"format": "assuredloop-items/1",
//   "requests": {"<request>": "<its own item>"}}. al takes a request's own
//   item only from it, never from an origin source's url (SP-5, SP-7).
// - When the folder names no own item for a request, issue-not-sub is not
//   given for that request's items, and the Not known line says so once for
//   that request (SP-5, SP-7).
// - The file is not an item (SP-9, SP-10). A file that is not valid gets one
//   issue-unread and is ignored as a whole (SP-9).
// - Without --issues nothing changes (SP-5).
// - The README gives the two JSON Schemas of SP-11 and SP-12.
//
// Nothing here reads the code under test: the tests run `node bin/al.js`
// (the helpers' BIN) in throwaway repos, and read README.md.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findings, keys } from './helpers/invoicer.js';
import {
  BIN, EPOCH, REPO, al, commitAll, doc, editRecord, git, move, newRequest, ok, show, write, writeYaml,
} from './helpers/project.js';

const NAME = 'inv';
const OWN = 'acme/invoicer';
const OWN_REMOTE = 'git@github.com:acme/invoicer.git';
const OWN_ITEM = 'https://github.com/acme/invoicer/issues/7';
const SPEC = 'specs/invoices.md';
const FOLDER = '../items';
const ISSUES = ['--issues', FOLDER];
const OWN_ITEMS = 'assuredloop-requests.json';
const FORMAT = 'assuredloop-items/1';

// =====================================================================
// Items, in the shape that `gh issue view --json number,url,body,comments,parent`
// prints, as in issue-hints-239.test.js.

const ghUrl = (repo, n) => `https://github.com/${repo}/issues/${n}`;
const ghParent = (key) => {
  const [repo, n] = key.split('#');
  return { id: `I_${n}`, number: Number(n), repository: { nameWithOwner: repo }, state: 'OPEN', title: `Issue ${n}`, url: ghUrl(repo, Number(n)) };
};
// A GitHub item; parent: "owner/repo#n", null, or 'absent' for no parent field.
function ghItem(repo, n, { body = 'Nothing to hint.\n', parent = `${OWN}#7` } = {}) {
  const item = { body, comments: [], number: n, url: ghUrl(repo, n) };
  if (parent !== 'absent') item.parent = parent === null ? null : ghParent(parent);
  return item;
}
const own = (n, opts) => ghItem(OWN, n, opts);
// An item of another tracker.
const proj = (ref, parent, extra = {}) => ({ ref, repository: 'PROJ', body: `${ref}.\n`, parent, ...extra });

// =====================================================================
// The world: <root>/invoicer, a git repo whose origin remote is
// git@github.com:acme/invoicer.git (unless remote says otherwise), with the
// config, a spec, and the open request inv with `tasks` and an origin source
// for each url of `origins`. <root>/items is the folder of items; it holds no
// file of own items until a test writes one. Optional: a second open request
// with its tasks; an archived request `old`.

function initRepo(dir, remote) {
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.name', 'Fixture Author');
  git(dir, 'config', 'user.email', 'author@example.invalid');
  git(dir, 'config', 'commit.gpgsign', 'false');
  if (remote) git(dir, 'remote', 'add', 'origin', remote);
}

// An origin source with this url, through the public command.
const addOrigin = (dir, name, url, text = 'The item as the owner filed it.\n') =>
  ok(dir, ['record', name, 'origin', '--url', url, '--from', '-', '--yes'], { input: text });

function world(t, { tasks = [{ id: 'T1', ref: '#31' }], remote = OWN_REMOTE, origins = [], second = null, archived = null } = {}) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-own-item-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, 'invoicer');
  const items = join(root, 'items');
  mkdirSync(items);
  initRepo(dir, remote);
  writeYaml(dir, '.assuredloop/config.yaml', { docs: [{ file: SPEC, prefix: 'INV' }] });
  write(dir, SPEC, doc([['INV-1 note', '# Invoices'], ['INV-2 rule', 'An invoice MUST be sent by email.']]));
  newRequest(dir, NAME, 'The owner wants the requester to see each invoice.\n');
  for (const url of origins) addOrigin(dir, NAME, url);
  editRecord(dir, NAME, (rec) => { rec.tasks = tasks; });
  if (second) {
    newRequest(dir, second.name, `The owner wants ${second.name}.\n`);
    editRecord(dir, second.name, (rec) => { rec.tasks = second.tasks; });
  }
  if (archived) {
    newRequest(dir, 'old', 'The owner wanted old things.\n');
    editRecord(dir, 'old', (rec) => { rec.tasks = archived.tasks ?? []; rec.status = 'concluded'; });
    move(dir, 'requests/old', 'requests/archive/old');
  }
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  return { root, dir, items };
}

// Item files in the folder: {file name: an item, a list, or a string as written}.
function save(w, files) {
  for (const [name, value] of Object.entries(files)) {
    write(w.items, name, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
  }
}
// The file of own items: {request: its own item}, or a string as written.
const ownItems = (w, requests) => save(w, { [OWN_ITEMS]: { format: FORMAT, requests } });

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
const where = (f) => (f.at === null ? f.file : `${f.file}:${f.at}`);
const sorted = (list) => [...list].sort();
const notSub = (r) => sorted(coded(r, 'issue-not-sub').map((f) => `${where(f)} ${f.id}`));
const notKnown = (r) => r.stdout.split('\n').find((l) => l.startsWith('Not known')) ?? '';
// How many times the Not known line says that it does not know whether the
// items of the request are children of its own item (SP-5: once). The reason
// after the colon is free.
const ownItemUnknown = (r, name) => notKnown(r).split(`whether the items of ${name} are children of its own item:`).length - 1;
function assertInfo(r, c, folder = FOLDER) {
  const found = r.findings.filter((f) => f.severity === 'info' && f.code === 'issues');
  assert.equal(found.length, 1, `one info issues line:\n${show(r)}`);
  assert.equal(found[0].msg, `checked ${c} items for the tasks of the open requests, from ${folder}`, show(r));
}

// =====================================================================
// SP-7, SP-8: the file names the own item.

describe('#3 (SP-7, SP-8): the file of own items names the request\'s own item', () => {
  // Tasks name #31 (parent #7), #32 (parent null), #33 (parent #8) and #7 itself (parent null).
  const tasks = [{ id: 'T1', ref: '#31' }, { id: 'T2', ref: '#32' }, { id: 'T3', ref: '#33' }, { id: 'T4', ref: '#7' }];
  const files = {
    '31.json': own(31), '32.json': own(32, { parent: null }), '33.json': own(33, { parent: `${OWN}#8` }), '7.json': own(7, { parent: null }),
  };

  for (const value of [OWN_ITEM, `${OWN}#7`, '#7']) {
    test(`the value ${JSON.stringify(value)} names acme/invoicer#7: #32 and #33 get issue-not-sub; #31 (its child) and #7 itself get none; no Not known line about the own item`, (t) => {
      const w = world(t, { tasks });
      save(w, files);
      // Control: with no file, no item gets issue-not-sub.
      const control = checked(w, ...ISSUES);
      assert.deepEqual(notSub(control), [], show(control));
      ownItems(w, { [NAME]: value });
      const r = checked(w, ...ISSUES);
      assert.deepEqual(notSub(r), [`${OWN}#32 ${NAME}/T2`, `${OWN}#33 ${NAME}/T3`], show(r));
      for (const f of coded(r, 'issue-not-sub')) assert.equal(f.severity, 'hint', show(r));
      assert.equal(ownItemUnknown(r, NAME), 0, show(r));
      assertInfo(r, 4);
    });
  }

  test('another tracker\'s own item PROJ-1, not in the folder: the value is its ref; a parent {ref: PROJ-1} or a url that holds PROJ-1 as a whole word is the own item; {ref: PROJ-9} and a url with PROJ-10 are not', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: 'PROJ-12' }, { id: 'T2', ref: 'PROJ-13' }, { id: 'T3', ref: 'PROJ-14' }, { id: 'T4', ref: 'PROJ-15' }] });
    save(w, {
      'proj.json': [
        proj('PROJ-12', { ref: 'PROJ-1' }),
        proj('PROJ-13', { ref: 'PROJ-9' }),
        proj('PROJ-14', { url: 'https://tracker.example.test/browse/PROJ-1' }),
        proj('PROJ-15', { url: 'https://tracker.example.test/browse/PROJ-10' }),
      ],
    });
    ownItems(w, { [NAME]: 'PROJ-1' });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(notSub(r), [`PROJ-13 ${NAME}/T2`, `PROJ-15 ${NAME}/T4`], show(r));
    assert.deepEqual(coded(r, 'issue-missing'), [], show(r));
    assert.equal(ownItemUnknown(r, NAME), 0, show(r));
    assertInfo(r, 4);
  });

  test('a parent url equal to the value names the own item, also when no item in the folder has that url: value .../i/10001; parent {url: .../i/10001} none, parent {url: .../i/10002} one', (t) => {
    const I10001 = 'https://tracker.example.test/i/10001';
    const w = world(t, { tasks: [{ id: 'T1', ref: 'PROJ-12' }, { id: 'T2', ref: 'PROJ-13' }] });
    save(w, {
      'proj.json': [proj('PROJ-12', { url: I10001, number: 10001 }), proj('PROJ-13', { url: 'https://tracker.example.test/i/10002', number: 10002 })],
    });
    ownItems(w, { [NAME]: I10001 });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(notSub(r), [`PROJ-13 ${NAME}/T2`], show(r));
  });

  test('the own item itself gets no issue-not-sub: value PROJ-1, and a task names PROJ-1, in the folder with parent null; control: PROJ-2 with parent null gets one', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: 'PROJ-1' }, { id: 'T2', ref: 'PROJ-2' }] });
    save(w, { 'proj.json': [proj('PROJ-1', null), proj('PROJ-2', null)] });
    ownItems(w, { [NAME]: 'PROJ-1' });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(notSub(r), [`PROJ-2 ${NAME}/T2`], show(r));
  });

  test('a value #n when the request\'s own repository is not known (no origin remote): no issue-not-sub, and the Not known line says so once; control: with the remote, #32 gets one', (t) => {
    const tasks2 = [{ id: 'T1', ref: `${OWN}#31` }, { id: 'T2', ref: `${OWN}#32` }];
    const files2 = { '31.json': own(31), '32.json': own(32, { parent: null }) };
    const c = world(t, { tasks: tasks2 });
    save(c, files2);
    ownItems(c, { [NAME]: '#7' });
    const control = checked(c, ...ISSUES);
    assert.deepEqual(notSub(control), [`${OWN}#32 ${NAME}/T2`], show(control));
    const w = world(t, { tasks: tasks2, remote: null });
    save(w, files2);
    ownItems(w, { [NAME]: '#7' });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(notSub(r), [], show(r));
    assert.equal(ownItemUnknown(r, NAME), 1, `the Not known line says once that the own item of ${NAME} is not known:\n${show(r)}`);
    assertInfo(r, 2);
  });
});

// =====================================================================
// SP-5, SP-7: an origin source names no own item.

describe('#3 (SP-5, SP-7): an origin source\'s url does not name the own item', () => {
  const FREE = 'a work session for acme/invoicer#46';
  const tasks = [{ id: 'T1', ref: '#41' }, { id: 'T2', ref: '#42' }];
  const files = { '41.json': own(41, { parent: `${OWN}#40` }), '42.json': own(42, { parent: `${OWN}#40` }) };
  const names46 = (r) => r.findings.filter((f) => f.line.includes('#46'));

  test(`issue #3: a source url of free text "${FREE}", the file names acme/invoicer#40, and each task's item is a child of #40: no issue-not-sub, and no finding names #46`, (t) => {
    const w = world(t, { tasks, origins: [FREE] });
    save(w, files);
    ownItems(w, { [NAME]: ghUrl(OWN, 40) });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(notSub(r), [], show(r));
    assert.deepEqual(names46(r).map((f) => f.line), [], show(r));
    assert.equal(ownItemUnknown(r, NAME), 0, show(r));
    assertInfo(r, 2);
  });

  test(`issue #3 with no file of own items: the source url "${FREE}" gives no own item: no issue-not-sub, no finding names #46, and the Not known line says once that the own item is not known`, (t) => {
    const w = world(t, { tasks, origins: [FREE] });
    save(w, files);
    const r = checked(w, ...ISSUES);
    assert.deepEqual(notSub(r), [], show(r));
    assert.deepEqual(names46(r).map((f) => f.line), [], show(r));
    assert.equal(ownItemUnknown(r, NAME), 1, show(r));
  });

  test('a source url that is an issue url changes nothing: the file names #7 and a source names issue 8: #33 (parent #8) gets issue-not-sub, #31 (parent #7) none; the same as with no source', (t) => {
    const t2 = [{ id: 'T1', ref: '#31' }, { id: 'T2', ref: '#33' }];
    const f2 = { '31.json': own(31), '33.json': own(33, { parent: `${OWN}#8` }) };
    for (const origins of [[ghUrl(OWN, 8)], []]) {
      const w = world(t, { tasks: t2, origins });
      save(w, f2);
      ownItems(w, { [NAME]: OWN_ITEM });
      const r = checked(w, ...ISSUES);
      assert.deepEqual(notSub(r), [`${OWN}#33 ${NAME}/T2`], `origins ${JSON.stringify(origins)}:\n${show(r)}`);
    }
  });
});

// =====================================================================
// SP-5, SP-7: when the folder names no own item, Not known says so once per request.

describe('#3 (SP-5, SP-7): when the folder names no own item for a request, no issue-not-sub for its items, and one Not known entry for that request', () => {
  const tasks = [{ id: 'T1', ref: '#31' }, { id: 'T2', ref: '#32' }, { id: 'T3', ref: 'issue #33' }];
  const files = { '31.json': own(31, { parent: null }), '32.json': own(32, { parent: null }), '33.json': own(33, { parent: `${OWN}#9` }) };

  test('no file: three tasks and three items that are not children of #7: no issue-not-sub, and one Not known entry for inv, not one for each task or item', (t) => {
    const w = world(t, { tasks, origins: [OWN_ITEM] });
    save(w, files);
    const r = checked(w, ...ISSUES);
    assert.deepEqual(notSub(r), [], show(r));
    assert.equal(ownItemUnknown(r, NAME), 1, show(r));
    // Control: with the file, each of the three gets one.
    ownItems(w, { [NAME]: OWN_ITEM });
    const c = checked(w, ...ISSUES);
    assert.deepEqual(notSub(c), [`${OWN}#31 ${NAME}/T1`, `${OWN}#32 ${NAME}/T2`, `${OWN}#33 ${NAME}/T3`], show(c));
    assert.equal(ownItemUnknown(c, NAME), 0, show(c));
  });

  test('the file does not list the request: the file names the own item of pay only; inv gets no issue-not-sub and one Not known entry; pay gets its issue-not-sub and no entry', (t) => {
    const w = world(t, { tasks, second: { name: 'pay', tasks: [{ id: 'T1', ref: '#34' }, { id: 'T2', ref: '#35' }] } });
    save(w, { ...files, '34.json': own(34, { parent: `${OWN}#8` }), '35.json': own(35, { parent: null }) });
    ownItems(w, { pay: ghUrl(OWN, 8) });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(notSub(r), [`${OWN}#35 pay/T2`], show(r));
    assert.equal(ownItemUnknown(r, NAME), 1, show(r));
    assert.equal(ownItemUnknown(r, 'pay'), 0, show(r));
  });

  // The review of #3: the entry does not depend on whether a task's item is
  // in the folder. It is there for each open request with a task that has a
  // ref, and not for one with no such task (nothing to check).
  for (const ref of ['#31', `${OWN}#31`]) {
    for (const [what, files] of [['an empty folder', {}], ['a folder without that item', { '50.json': own(50, { parent: null }) }]]) {
      test(`a task names ${ref}, not in the folder (${what}), and no file: issue-missing as before, and one Not known entry for inv`, (t) => {
        const w = world(t, { tasks: [{ id: 'T1', ref }] });
        save(w, files);
        const r = checked(w, ...ISSUES);
        assert.equal(coded(r, 'issue-missing').length, 1, show(r));
        assert.equal(coded(r, 'issue-missing')[0].id, `${NAME}/T1`, show(r));
        assert.equal(ownItemUnknown(r, NAME), 1, `the Not known line says once that the own item of ${NAME} is not known:\n${show(r)}`);
      });
    }
  }

  test('a task names #31, not in the folder, and the file lists only pay: issue-missing for inv, one Not known entry for inv, none for pay', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: '#31' }], second: { name: 'pay', tasks: [{ id: 'T1', ref: '#34' }] } });
    save(w, { '34.json': own(34, { parent: `${OWN}#8` }) });
    ownItems(w, { pay: ghUrl(OWN, 8) });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(coded(r, 'issue-missing').map((f) => f.id), [`${NAME}/T1`], show(r));
    assert.equal(ownItemUnknown(r, NAME), 1, `the Not known line says once that the own item of ${NAME} is not known:\n${show(r)}`);
    assert.equal(ownItemUnknown(r, 'pay'), 0, show(r));
  });

  test('control: an open request with no tasks, or with a task that has no ref, gets no Not known entry about its own item, with no file', (t) => {
    for (const tasks of [[], [{ id: 'T1' }]]) {
      const w = world(t, { tasks });
      save(w, { '50.json': own(50, { parent: null }) });
      const r = checked(w, ...ISSUES);
      assert.equal(ownItemUnknown(r, NAME), 0, `tasks ${JSON.stringify(tasks)}:\n${show(r)}`);
    }
  });

  test('two requests and no file: one Not known entry for each request', (t) => {
    const w = world(t, { tasks, second: { name: 'pay', tasks: [{ id: 'T1', ref: '#34' }, { id: 'T2', ref: '#31' }] } });
    save(w, { ...files, '34.json': own(34, { parent: null }) });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(notSub(r), [], show(r));
    assert.equal(ownItemUnknown(r, NAME), 1, show(r));
    assert.equal(ownItemUnknown(r, 'pay'), 1, show(r));
  });
});

// =====================================================================
// SP-9, SP-10: the file is not an item.

describe('#3 (SP-9, SP-10): the file of own items is not read as an item', () => {
  test('a valid file gets no issue-unread, the Not known line does not name it, and it counts neither in the info line nor as an item that no task names', (t) => {
    const w = world(t);
    save(w, { '31.json': own(31), '50.json': own(50, { parent: null }) });
    ownItems(w, { [NAME]: OWN_ITEM });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(coded(r, 'issue-unread'), [], show(r));
    assert.ok(!notKnown(r).includes(OWN_ITEMS), `the Not known line names ${OWN_ITEMS}:\n${show(r)}`);
    assertInfo(r, 1);
    // One item (#50) is in the folder and named by no task; the file is not a second one.
    const unnamed = /(\d+) items? [^;]*no task names/.exec(notKnown(r));
    assert.ok(unnamed, `the Not known line counts the items that no task names:\n${show(r)}`);
    assert.equal(unnamed[1], '1', show(r));
  });

  test('a key that names no open request is ignored: with keys nosuch and old (an archived request) added, the output is that of the file with inv alone; inv\'s own item holds', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: '#31' }, { id: 'T2', ref: '#32' }], archived: { tasks: [{ id: 'T1', ref: '#33' }] } });
    save(w, { '31.json': own(31), '32.json': own(32, { parent: null }), '33.json': own(33, { parent: null }) });
    ownItems(w, { [NAME]: OWN_ITEM });
    const alone = checked(w, ...ISSUES);
    assert.deepEqual(notSub(alone), [`${OWN}#32 ${NAME}/T2`], show(alone));
    ownItems(w, { nosuch: ghUrl(OWN, 8), [NAME]: OWN_ITEM, old: ghUrl(OWN, 9) });
    const r = checked(w, ...ISSUES);
    assert.equal(r.stdout, alone.stdout, `the keys nosuch and old change nothing:\n${show(r)}\n${show(alone)}`);
    assert.deepEqual(coded(r, 'issue-unread'), [], show(r));
    assert.ok(!notKnown(r).includes('nosuch'), show(r));
  });
});

// =====================================================================
// SP-9: a file that is not valid is ignored as a whole.

describe('#3 (SP-9): a file of own items that is not valid gets one issue-unread and is ignored as a whole; al check goes on', () => {
  const good = { [NAME]: OWN_ITEM, pay: ghUrl(OWN, 8) };
  const INVALID = {
    'not valid JSON': `{"format": "${FORMAT}", "requests": {"inv": "${OWN_ITEM}"`,
    'another format': { format: 'assuredloop-items/2', requests: good },
    'no format': { requests: good },
    'a format that is not text': { format: 1, requests: good },
    'another field': { format: FORMAT, requests: good, note: 'saved by hand' },
    'no requests': { format: FORMAT },
    'requests a list': { format: FORMAT, requests: [OWN_ITEM] },
    'requests a text': { format: FORMAT, requests: OWN_ITEM },
    'requests null': { format: FORMAT, requests: null },
    'a value that is a number (pay)': { format: FORMAT, requests: { [NAME]: OWN_ITEM, pay: 8 } },
    'a value that is empty (pay)': { format: FORMAT, requests: { [NAME]: OWN_ITEM, pay: '' } },
    'a value that is null (pay)': { format: FORMAT, requests: { [NAME]: OWN_ITEM, pay: null } },
    'a value that is an object (pay)': { format: FORMAT, requests: { [NAME]: OWN_ITEM, pay: { url: ghUrl(OWN, 8) } } },
    'a list, not an object': [{ format: FORMAT, requests: good }],
    'a text, not an object': `"${FORMAT}"\n`,
  };
  // inv: #31 (child of #7), #32 (parent null), #99 (not in the folder).
  // pay: #34 (child of #8), #35 (parent null).
  const opts = {
    tasks: [{ id: 'T1', ref: '#31' }, { id: 'T2', ref: '#32' }, { id: 'T3', ref: '#99' }],
    second: { name: 'pay', tasks: [{ id: 'T1', ref: '#34' }, { id: 'T2', ref: '#35' }] },
  };
  const files = {
    '31.json': own(31), '32.json': own(32, { parent: null }), '34.json': own(34, { parent: `${OWN}#8` }), '35.json': own(35, { parent: null }),
  };
  const unreadAt = (r, folder = FOLDER) => coded(r, 'issue-unread').filter((f) => f.file === `${folder}/${OWN_ITEMS}`);

  test('control: the valid file gives issue-not-sub for #32 (inv) and #35 (pay), and no issue-unread', (t) => {
    const w = world(t, opts);
    save(w, files);
    ownItems(w, good);
    const r = checked(w, ...ISSUES);
    assert.deepEqual(notSub(r), [`${OWN}#32 ${NAME}/T2`, `${OWN}#35 pay/T2`], show(r));
    assert.deepEqual(coded(r, 'issue-unread'), [], show(r));
  });

  test('each file that is not valid: one issue-unread at ../items/assuredloop-requests.json, ID -, a hint; no issue-not-sub; one Not known entry for each request; the other findings and the exit code are those of no file, plain and --strict', (t) => {
    const w = world(t, opts);
    save(w, files);
    const none = { plain: checked(w, ...ISSUES), strict: check(w, ...ISSUES, '--strict') };
    // The run with no file goes on to its end: #99 is missing, and the info line is there.
    assert.equal(coded(none.plain, 'issue-missing').length, 1, show(none.plain));
    assertInfo(none.plain, 4);
    const bad = [];
    for (const [what, value] of Object.entries(INVALID)) {
      save(w, { [OWN_ITEMS]: value });
      for (const [mode, args] of [['plain', ISSUES], ['strict', [...ISSUES, '--strict']]]) {
        const r = check(w, ...args);
        const base = none[mode];
        const fail = (msg) => bad.push(`${what}, ${mode}: ${msg}\n${show(r)}`);
        if (r.code !== base.code) fail(`exit ${r.code}, not ${base.code} as with no file`);
        if (/^al: /m.test(r.stdout)) fail('a refusal');
        const unread = unreadAt(r);
        if (unread.length !== 1) fail(`${unread.length} issue-unread at ${FOLDER}/${OWN_ITEMS}, not 1`);
        else if (unread[0].id !== '-' || unread[0].severity !== 'hint') fail(`the issue-unread is ${unread[0].severity} with ID ${unread[0].id}`);
        if (coded(r, 'issue-not-sub').length) fail('issue-not-sub given: the file was not ignored as a whole');
        for (const name of [NAME, 'pay']) if (ownItemUnknown(r, name) !== 1) fail(`${ownItemUnknown(r, name)} Not known entries for ${name}, not 1`);
        const others = r.findings.filter((f) => !(f.code === 'issue-unread' && f.file === `${FOLDER}/${OWN_ITEMS}`));
        if (JSON.stringify(keys(others)) !== JSON.stringify(keys(base.findings))) fail(`other findings ${JSON.stringify(keys(others))}, not ${JSON.stringify(keys(base.findings))}`);
        if (JSON.stringify(sorted(others.map((f) => f.line))) !== JSON.stringify(sorted(base.findings.map((f) => f.line)))) fail('the other finding lines differ from those with no file');
      }
    }
    assert.deepEqual(bad, []);
    assert.equal(none.plain.code, 0, show(none.plain));
    assert.equal(none.strict.code, 0, show(none.strict));
  });

  test('the issue-unread is at the folder as the caller wrote it: an absolute folder', (t) => {
    const w = world(t, opts);
    save(w, { ...files, [OWN_ITEMS]: { format: 'assuredloop-items/2', requests: good } });
    const r = checked(w, '--issues', w.items);
    assert.equal(unreadAt(r, w.items).length, 1, show(r));
    assert.deepEqual(coded(r, 'issue-not-sub'), [], show(r));
    assertInfo(r, 4, w.items);
  });
});

// =====================================================================
// SP-5: without --issues, nothing changes.

// The al of main (the merge-base of HEAD and origin/main), from git archive,
// with this clone's node_modules linked in, as in issue-hints-239.test.js.
let mainBin = null;
function mainAl() {
  if (mainBin) return mainBin;
  let base;
  try { base = git(REPO, 'merge-base', 'HEAD', 'origin/main'); } catch { base = git(REPO, 'merge-base', 'HEAD', 'main'); }
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-own-item-main-'));
  process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
  const r = spawnSync('/bin/sh', ['-c', `git -C '${REPO}' archive '${base}' | tar -x -C '${dir}'`], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'));
  mainBin = join(dir, 'bin/al.js');
  assert.ok(existsSync(mainBin), mainBin);
  return mainBin;
}
function runBin(bin, dir, args) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_') && k !== 'SOURCE_DATE_EPOCH') env[k] = v;
  Object.assign(env, { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', SOURCE_DATE_EPOCH: String(EPOCH) });
  const r = spawnSync(process.execPath, [bin, ...args], { cwd: dir, env, encoding: 'utf8', timeout: 30_000 });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

// #58: al check prints the list of what is in force, which main did not
// print: one block of lines after the findings, right before the Read line.
const LIST_LINE = /^(list: |list basis: |list limits: |in force |proposed |\d+ further items in force: )/;
// The output without the list block, and the block. When there is a block,
// it must be one run of lines right before the Read line.
function withoutList(stdout) {
  const ls = stdout.split('\n');
  const at = ls.flatMap((l, i) => (LIST_LINE.test(l) ? [i] : []));
  if (at.length === 0) return { rest: stdout, list: [] };
  assert.equal(at.at(-1) - at[0] + 1, at.length, `the list is one block:\n${stdout}`);
  assert.match(ls[at.at(-1) + 1] ?? '', /^Read /, `the list comes right before the Read line:\n${stdout}`);
  return { rest: ls.filter((_, i) => !at.includes(i)).join('\n'), list: at.map((i) => ls[i]) };
}
// #64: al check prints the review section of each own request, which main
// did not print: one block of lines right after the list block and right
// before the Read line.
const REVIEW_LINE = /^(review note |judgement )/;
// The output without the review block, and the block.
function withoutReview(stdout) {
  const ls = stdout.split('\n');
  const at = ls.flatMap((l, i) => (REVIEW_LINE.test(l) ? [i] : []));
  if (at.length === 0) return { rest: stdout, review: [] };
  assert.equal(at.at(-1) - at[0] + 1, at.length, `the review section is one block:\n${stdout}`);
  assert.match(ls[at[0] - 1] ?? '', LIST_LINE, `the review section comes right after the list block:\n${stdout}`);
  assert.match(ls[at.at(-1) + 1] ?? '', /^Read /, `the review section comes right before the Read line:\n${stdout}`);
  return { rest: ls.filter((_, i) => !at.includes(i)).join('\n'), review: at.map((i) => ls[i]) };
}
// #68: al check prints the map of the change, which main did not print: one
// block of lines right after the review block (or the list block when there is none) and right before the Read line. Its
// first line is its one "map: " line. The map's two hints, map-unnamed and
// map-consolidation, are new findings lines among the others, before the list.
const MAP_LINE = /^(map: |map )/;
const MAP_HINT = /^hint map-(unnamed|consolidation) /;
// The output without the map block and the map's hints.
function withoutMap(stdout) {
  const ls = stdout.split('\n');
  const at = ls.flatMap((l, i) => (MAP_LINE.test(l) ? [i] : []));
  const hints = ls.flatMap((l, i) => (MAP_HINT.test(l) ? [i] : []));
  if (at.length === 0 && hints.length === 0) return { rest: stdout, map: [] };
  assert.equal(at.filter((i) => ls[i].startsWith('map: ')).length, 1, `one "map: " line:\n${stdout}`);
  assert.ok(ls[at[0]].startsWith('map: '), `the map starts with its "map: " line:\n${stdout}`);
  assert.equal(at.at(-1) - at[0] + 1, at.length, `the map is one block:\n${stdout}`);
  assert.ok(REVIEW_LINE.test(ls[at[0] - 1] ?? '') || LIST_LINE.test(ls[at[0] - 1] ?? ''), `the map comes right after the review block (or the list block when there is none):\n${stdout}`);
  assert.match(ls[at.at(-1) + 1] ?? '', /^Read /, `the map comes right before the Read line:\n${stdout}`);
  const firstList = ls.findIndex((l) => LIST_LINE.test(l));
  for (const i of hints) assert.ok(i < firstList, `a map hint is a findings line, before the list:\n${stdout}`);
  return { rest: ls.filter((_, i) => !at.includes(i) && !hints.includes(i)).join('\n'), map: at.map((i) => ls[i]) };
}
// Every line that main printed, in the same order, and the same exit code;
// the list of #58 is there (its grouped line or its "no change selected"
// line), and, once main prints a list too, it is the same list. The map of
// #68 and the review section of #64 are taken out first; once main prints a
// review section too, it is the same.
// #74 adds ` · places: <ID> <file>:<line>, ...` after the message of a
// finding; a main from before #74 does not print it, so it is taken out of
// both outputs.
const withoutPlaces = (stdout) => stdout.replace(/ · places: .*$/gm, '');
function sameAsMainOutput(here, main, args) {
  const hm = withoutMap(withoutPlaces(here.stdout));
  const mm = withoutMap(withoutPlaces(main.stdout));
  assert.ok(hm.map.length > 0, `al ${args.join(' ')}: the map of #68:\n${here.stdout}`);
  if (mm.map.length > 0) assert.deepEqual(hm.map, mm.map, `al ${args.join(' ')}: the same map as on main`);
  const hr = withoutReview(hm.rest);
  const mr = withoutReview(mm.rest);
  if (mr.review.length > 0) assert.deepEqual(hr.review, mr.review, `al ${args.join(' ')}: the same review section as on main`);
  const h = withoutList(hr.rest);
  const m = withoutList(mr.rest);
  assert.equal(h.rest, m.rest, `al ${args.join(' ')}: the same output as on main, but the list of #58`);
  assert.ok(h.list.some((l) => /^(list: no change selected: |\d+ further items in force: )/.test(l)), `al ${args.join(' ')}: the list of #58:\n${here.stdout}`);
  if (m.list.length > 0) assert.deepEqual(h.list, m.list, `al ${args.join(' ')}: the same list as on main`);
  assert.equal(here.code, main.code, `al ${args.join(' ')}: the same exit code as on main`);
}
describe('#3 (SP-5): without --issues, al check gives the output of main, with a file of own items anywhere', () => {
  test('files of own items in the folder of items, in the repo root and in the request\'s folder, and a free-text source url: al check and al check --strict give the output and the exit code of main', (t) => {
    const w = world(t, { origins: ['a work session for acme/invoicer#46'] });
    save(w, { '31.json': own(31, { parent: null }) });
    ownItems(w, { [NAME]: OWN_ITEM });
    const text = `${JSON.stringify({ format: FORMAT, requests: { [NAME]: OWN_ITEM } })}\n`;
    write(w.dir, OWN_ITEMS, text);
    write(w.dir, `requests/${NAME}/${OWN_ITEMS}`, text);
    for (const args of [['check'], ['check', '--strict']]) {
      const here = runBin(BIN, w.dir, args);
      const main = runBin(mainAl(), w.dir, args);
      sameAsMainOutput(here, main, args);
      assert.doesNotMatch(here.stdout, /issue-|info issues/, here.stdout);
    }
  });

  test('a file of own items in the folder of items only: al check gives the same output with and without it', (t) => {
    const w = world(t);
    save(w, { '31.json': own(31, { parent: null }) });
    const without = runBin(BIN, w.dir, ['check']);
    ownItems(w, { [NAME]: OWN_ITEM });
    const withFile = runBin(BIN, w.dir, ['check']);
    assert.equal(withFile.stdout, without.stdout);
    assert.equal(withFile.code, without.code);
  });
});

// =====================================================================
// SP-11, SP-12: the README gives the two JSON Schemas.

// The two schemas, as the change spec gives them (SP-11, then SP-12). The
// spec is read where it is now, or in the archive once the request is concluded.
function specSchemas() {
  const rel = ['requests/own-item/spec.md', 'requests/archive/own-item/spec.md'].find((r) => existsSync(join(REPO, r)));
  assert.ok(rel, 'the change spec of own-item is in requests/ or requests/archive/');
  const found = jsonBlocks(readFileSync(join(REPO, rel), 'utf8')).map((b) => JSON.parse(b)).filter((p) => '$schema' in p);
  assert.equal(found.length, 2, `${rel} gives two JSON Schemas`);
  const [item, requests] = found;
  assert.equal(item.title, 'an item file: one item, or a list of items', rel);
  assert.equal(requests.title, OWN_ITEMS, rel);
  return { item, requests };
}

// The README section "Hints from the linked work items", up to the next ## heading.
function readmeSection() {
  const md = readFileSync(join(REPO, 'README.md'), 'utf8');
  const at = md.indexOf('\n## Hints from the linked work items\n');
  assert.ok(at >= 0, 'README.md has the section "Hints from the linked work items"');
  const rest = md.slice(at + 1);
  const end = rest.indexOf('\n## ', 1);
  return end < 0 ? rest : rest.slice(0, end + 1);
}
// The text of each ```json fenced block of the section.
const jsonBlocks = (section) => [...section.matchAll(/^```json[ \t]*\n([\s\S]*?)^```[ \t]*$/gm)].map((m) => m[1]);

describe('#3 (SP-11, SP-12): the README gives the JSON Schema of each kind of file', () => {
  test('the section holds a JSON block that is the schema of an item file (SP-11), and one that is the schema of assuredloop-requests.json (SP-12), each valid JSON', () => {
    const { item, requests } = specSchemas();
    const blocks = jsonBlocks(readmeSection());
    const parsed = blocks.map((b) => { try { return JSON.parse(b); } catch { return undefined; } });
    const schemas = parsed.filter((p) => p && typeof p === 'object' && !Array.isArray(p) && '$schema' in p);
    const has = (schema) => schemas.some((s) => { try { assert.deepEqual(s, schema); return true; } catch { return false; } });
    // closed-items R1 (#33) adds one optional item property, state, with the
    // values OPEN and CLOSED. Without that one property, the README's item
    // schema is SP-11 exactly; closed-items-33.test.js checks state itself.
    const withoutState = (s) => {
      const props = s?.$defs?.item?.properties;
      if (!props || !('state' in props)) return s;
      const copy = structuredClone(s);
      delete copy.$defs.item.properties.state;
      return copy;
    };
    const hasItem = schemas.some((s) => { try { assert.deepEqual(withoutState(s), item); return true; } catch { return false; } });
    assert.ok(hasItem, `the README section holds the item schema of SP-11 (plus only the state of closed-items R1); its JSON Schema blocks:\n${JSON.stringify(schemas, null, 2)}`);
    assert.ok(has(requests), `the README section holds the schema of ${OWN_ITEMS} of SP-12; its JSON Schema blocks:\n${JSON.stringify(schemas, null, 2)}`);
    // Each block that looks like a schema is valid JSON.
    blocks.forEach((b, i) => { if (b.includes('"$schema"')) assert.notEqual(parsed[i], undefined, `a schema block that is not valid JSON:\n${b}`); });
  });

  test('the section names assuredloop-requests.json and its format, still holds the gh issue view commands, and no longer takes the own item from an origin source url', () => {
    const section = readmeSection();
    assert.ok(section.includes(OWN_ITEMS), section);
    assert.ok(section.includes(FORMAT), section);
    assert.match(section, /gh issue view \d+ --repo \S+ \\\n\s*--json number,url,body,comments,parent/, section);
    assert.doesNotMatch(section, /the item that the `url` of an origin source\s+names/, section);
  });
});
