// #59 (C7): a work item that changed after the change relied on it
// (requests/light-design R3, signed; the design LD-22, with LD-12 and LD-11).
//
// - R3: when a task's work item says something different from what it said
//   when the change first relied on it (at the sign-off, or when the request
//   first named the item), `al check` MUST give a hint that names the item,
//   until someone confirms that the change was read. When `al` cannot tell,
//   it MUST say so, and MUST NOT report the item as unchanged. `al` works
//   this out by itself; no person and no AI writes or reads what it keeps.
// - The interface these tests use: `al index --issues <folder>` keeps the
//   item's text (its body and each comment that is not minimized, in order;
//   not its state) at the moment that is now: "named" (the request names the
//   item in the uncommitted edit) or "S<n>" (the first sign-off after the
//   naming, in the working tree and not at HEAD). `al check --issues
//   <folder>` gives `hint issue-changed <where> <request>/<task> <message>`:
//   "changed", or "not known" when no text was kept at the moment of
//   reliance or the item cannot be read. A CLOSED item gives it as `info`
//   (LD-11). `al record <name> judgement --hint issue-changed --on <item>
//   --reason <line> --issues <folder> [--yes]` confirms that the change was
//   read (LD-12); the hint comes back when the item changes again.
//
// The tests never read or write what al keeps (R3): they look only at the
// output of the commands. Each run has a PATH with a fake `gh` that only
// logs, and a folder of links to git and node only; every run checks that
// al did not run gh. Nothing here reads the code under test.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findings } from './helpers/invoicer.js';
import {
  WORDS_FILE, al, appendSection, commitAll, doc, editRecord, git, move, organized, read, refused, req, show, write, writeYaml,
  writesNothing,
} from './helpers/project.js';

// A folder that holds only links to git and node, so no real gh is on PATH.
const TOOLS = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-59-tools-'));
process.on('exit', () => rmSync(TOOLS, { recursive: true, force: true }));
const gitPath = spawnSync('/bin/sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
assert.ok(gitPath, 'git is on the PATH of the test process');
symlinkSync(gitPath, join(TOOLS, 'git'));
symlinkSync(process.execPath, join(TOOLS, 'node'));
const ghIn = (path) => spawnSync('/bin/sh', ['-c', 'command -v gh'], { env: { PATH: path }, encoding: 'utf8' }).stdout.trim();

const NAME = 'inv';
const OWN = 'acme/invoicer';
const SPEC = 'specs/invoices.md';
const REQUEST_MD = `requests/${NAME}/request.md`;
const FOLDER = '../items';
const ISSUES = ['--issues', FOLDER];
const CODE = 'issue-changed';

// The fake gh: it only logs its calls. al must never run it.
function fakeGh() {
  const bin = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-59-gh-'));
  const log = join(bin, 'calls.log');
  writeFileSync(join(bin, 'gh'), `#!/bin/sh\necho "$@" >> '${log}'\necho 'the fake gh: al must not run gh' >&2\nexit 1\n`);
  chmodSync(join(bin, 'gh'), 0o755);
  return { bin, env: { PATH: `${bin}:${TOOLS}` }, calls: () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []) };
}

// An item in the shape of `gh issue view --json number,url,body,comments,parent,state`.
// A comment is {body, hidden}; hidden gives isMinimized true.
function item(n, { body = 'Build the export.\n', comments = [], state = 'OPEN', repo = OWN } = {}) {
  const url = `https://github.com/${repo}/issues/${n}`;
  return {
    body,
    comments: comments.map((c, i) => ({
      author: { login: 'someone' }, authorAssociation: 'NONE', body: c.body, createdAt: '2026-05-01T00:00:00Z',
      id: `IC_${n}_${i + 1}`, includesCreatedEdit: false, isMinimized: !!c.hidden, minimizedReason: c.hidden ? 'OFF_TOPIC' : '',
      reactionGroups: [], url: `${url}#issuecomment-${n * 100 + i + 1}`, viewerDidAuthor: false,
    })),
    number: n,
    parent: null,
    state,
    url,
  };
}

const R1 = req('R1', 'Monthly CSV download', 'A user MUST be able to download one month as one CSV file.', [WORDS_FILE]);
const SECTION = organized([R1]);

// The world: <root>/invoicer, a git repo with origin acme/invoicer, the
// config and a spec committed on main, then the branch `feature`. The items
// folder is <root>/items. The request is not there yet: name() adds it.
function world(t) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-59-'));
  const gh = fakeGh();
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(gh.bin, { recursive: true, force: true });
  });
  const dir = join(root, 'invoicer');
  const items = join(root, 'items');
  mkdirSync(items);
  mkdirSync(dir);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.name', 'Fixture Author');
  git(dir, 'config', 'user.email', 'author@example.invalid');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'remote', 'add', 'origin', 'git@github.com:acme/invoicer.git');
  writeYaml(dir, '.assuredloop/config.yaml', { docs: [{ file: SPEC, prefix: 'INV' }] });
  write(dir, SPEC, doc([['INV-1 note', '# Invoices'], ['INV-2 rule', 'An invoice MUST have at least one line.']]));
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  return { root, dir, items, gh };
}

// One run of al in the world, with the logging gh first on PATH.
function run(w, args, { input = '' } = {}) {
  const r = al(w.dir, args, { input, env: w.gh.env });
  assert.deepEqual(w.gh.calls(), [], `al ran gh:\n${show(r)}`);
  return r;
}
function okRun(w, args, opts) {
  const r = run(w, args, opts);
  assert.equal(r.code, 0, show(r));
  return r;
}

// The request inv, with tasks; with section, also an organized requirement to sign.
function name(w, tasks = [{ id: 'T1', ref: '#5' }], { section = false } = {}) {
  okRun(w, ['new', NAME, '--from', '-'], { input: 'The owner wants the monthly export.\n' });
  if (section) appendSection(w.dir, NAME, SECTION);
  editRecord(w.dir, NAME, (rec) => { rec.tasks = tasks; });
}

// Item files in the folder: {file name: an item, or a string as written}.
function save(w, files) {
  for (const [file, value] of Object.entries(files)) {
    write(w.items, file, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
  }
}
const saveItem = (w, n, opts) => save(w, { [`invoicer-${n}.json`]: item(n, opts) });

const indexIssues = (w) => okRun(w, ['index', ...ISSUES]);
const signoff = (w) => okRun(w, ['record', NAME, 'signoff', '--source', 'email from the owner', '--words', 'Yes, sign it', '--yes']);
const judge = (w, on, extra = ['--yes']) =>
  okRun(w, ['record', NAME, 'judgement', '--hint', CODE, '--on', on, '--reason', 'Read the change; the task still holds.', ...ISSUES, ...extra]);

function check(w, ...args) {
  const r = run(w, ['check', ...args]);
  return { ...r, findings: findings(r.stdout) };
}
// A run that must exit 0 and must not refuse.
function checked(w, ...args) {
  const r = check(w, ...args);
  assert.equal(r.code, 0, show(r));
  assert.doesNotMatch(r.stdout, /^al: /m, show(r));
  return r;
}
const notKnown = (r) => r.stdout.split('\n').find((l) => l.startsWith('Not known')) ?? '';

// Whether a line names item n of acme/invoicer: acme/invoicer#n, #n, or its URL.
const namesItem = (line, n) => new RegExp(`(#|/issues/)${n}(?!\\d)`).test(line);
const changedLines = (r) => r.findings.filter((f) => f.code === CODE);
const forItem = (r, n) => changedLines(r).filter((f) => namesItem(f.line, n));
// The one issue-changed finding for item n, with its severity.
function one(r, n, severity = 'hint') {
  const found = forItem(r, n);
  assert.equal(found.length, 1, `one ${CODE} line for #${n}:\n${show(r)}`);
  assert.equal(found[0].severity, severity, show(r));
  assert.equal(found[0].id.split('/')[0], NAME, `the ID is <request>/<task>:\n${show(r)}`);
  return found[0];
}
function assertChanged(r, n, severity = 'hint') {
  const f = one(r, n, severity);
  assert.match(f.msg, /changed/i, show(r));
  assert.doesNotMatch(f.msg, /not known/i, `a changed item is not "not known":\n${show(r)}`);
  return f;
}
function assertNotKnown(r, n, severity = 'hint') {
  const f = one(r, n, severity);
  assert.match(f.msg, /not known/i, show(r));
  return f;
}
const assertNone = (r, n) => assert.deepEqual(forItem(r, n).map((f) => f.line), [], `no ${CODE} line for #${n}:\n${show(r)}`);

// The usual start: item #5 saved, the request names it, `al index --issues`
// keeps its text at "named", and the commit.
function namedAndKept(w, opts = {}, tasks = [{ id: 'T1', ref: '#5' }]) {
  saveItem(w, 5, opts);
  name(w, tasks);
  indexIssues(w);
  commitAll(w.dir, 'name the item');
}

test('the test setup: the tools folder holds git and no gh; with the fake first on PATH, gh is the fake', (t) => {
  assert.equal(ghIn(TOOLS), '', `a gh in ${TOOLS} would hide a gh call`);
  const gh = fakeGh();
  t.after(() => rmSync(gh.bin, { recursive: true, force: true }));
  assert.equal(ghIn(gh.env.PATH), join(gh.bin, 'gh'));
});

// =====================================================================

describe('R3: an item that did not change gives no hint', () => {
  test('named, indexed with --issues, committed, the item as it was: no issue-changed line, exit 0; al index --issues does not change request.md', (t) => {
    const w = world(t);
    saveItem(w, 5);
    name(w);
    okRun(w, ['index']);
    const before = read(w.dir, REQUEST_MD);
    indexIssues(w);
    assert.equal(read(w.dir, REQUEST_MD), before, 'al index --issues does not change request.md');
    commitAll(w.dir, 'name the item');
    const r = checked(w, ...ISSUES);
    assert.deepEqual(changedLines(r).map((f) => f.line), [], show(r));
  });

  test('a change of the state alone (OPEN to CLOSED) is no change of the text: no issue-changed line', (t) => {
    const w = world(t);
    namedAndKept(w);
    saveItem(w, 5, { state: 'CLOSED' });
    const r = checked(w, ...ISSUES);
    assertNone(r, 5);
  });

  test('without --issues: no issue-changed line, also for a changed item; the Not known line says that al cannot tell whether the work items changed', (t) => {
    const w = world(t);
    saveItem(w, 5);
    name(w);
    commitAll(w.dir, 'name the item');
    saveItem(w, 5, { body: 'Build the export as JSON.\n' });
    const r = checked(w);
    assert.deepEqual(changedLines(r).map((f) => f.line), [], show(r));
    // One clause of the Not known line names the items and "changed".
    assert.ok(notKnown(r).split(';').some((c) => /item/i.test(c) && /changed/i.test(c)), show(r));
  });
});

describe('R3: an item that changed after the request first named it', () => {
  test('the body changed: a hint that names the item, with "changed"', (t) => {
    const w = world(t);
    namedAndKept(w);
    saveItem(w, 5, { body: 'Build the export as JSON.\n' });
    const r = checked(w, ...ISSUES);
    const f = assertChanged(r, 5);
    assert.equal(f.id, `${NAME}/T1`, show(r));
    assert.equal(changedLines(r).length, 1, show(r));
  });

  test('two tasks name the changed item, and a second item did not change: one hint, for the changed item only', (t) => {
    const w = world(t);
    saveItem(w, 6);
    namedAndKept(w, {}, [{ id: 'T1', ref: '#5' }, { id: 'T2', ref: 'https://github.com/acme/invoicer/issues/5' }, { id: 'T3', ref: '#6' }]);
    saveItem(w, 5, { body: 'Build the export as JSON.\n' });
    const r = checked(w, ...ISSUES);
    assertChanged(r, 5);
    assertNone(r, 6);
    assert.equal(changedLines(r).length, 1, `one hint per item:\n${show(r)}`);
  });

  test('a comment added, then a comment edited, with the body the same: a hint each time', (t) => {
    const w = world(t);
    namedAndKept(w, { comments: [{ body: 'Agreed.\n' }] });
    saveItem(w, 5, { comments: [{ body: 'Agreed.\n' }, { body: 'Also add a total line.\n' }] });
    assertChanged(checked(w, ...ISSUES), 5);
    saveItem(w, 5, { comments: [{ body: 'Agreed, but only for paid invoices.\n' }] });
    assertChanged(checked(w, ...ISSUES), 5);
  });

  test('a minimized comment is not text: its edit, or a new minimized comment, gives no hint', (t) => {
    const w = world(t);
    namedAndKept(w, { comments: [{ body: 'Agreed.\n' }, { body: 'Spam.\n', hidden: true }] });
    saveItem(w, 5, { comments: [{ body: 'Agreed.\n' }, { body: 'Other spam.\n', hidden: true }] });
    assertNone(checked(w, ...ISSUES), 5);
    saveItem(w, 5, { comments: [{ body: 'Agreed.\n' }, { body: 'Other spam.\n', hidden: true }, { body: 'More spam.\n', hidden: true }] });
    assertNone(checked(w, ...ISSUES), 5);
  });
});

describe('R3: an item that changed after the sign-off (the moment of reliance is the first sign-off after the naming)', () => {
  test('named and committed, then the sign-off, al index --issues and the commit; then the body changed: hint "changed"', (t) => {
    const w = world(t);
    saveItem(w, 5);
    name(w, undefined, { section: true });
    commitAll(w.dir, 'name the item');
    signoff(w);
    indexIssues(w);
    commitAll(w.dir, 'sign off');
    assertNone(checked(w, ...ISSUES), 5);
    saveItem(w, 5, { body: 'Build the export as JSON.\n' });
    assertChanged(checked(w, ...ISSUES), 5);
  });

  test('the text kept at the sign-off replaces the text kept at the naming: changed between the naming and the sign-off gives no hint; changed after the sign-off gives one', (t) => {
    const w = world(t);
    saveItem(w, 5);
    name(w, undefined, { section: true });
    indexIssues(w);
    commitAll(w.dir, 'name the item');
    saveItem(w, 5, { body: 'Build the export as CSV, one file per month.\n' });
    signoff(w);
    indexIssues(w);
    commitAll(w.dir, 'sign off');
    assertNone(checked(w, ...ISSUES), 5);
    saveItem(w, 5, { body: 'Build the export as JSON.\n' });
    assertChanged(checked(w, ...ISSUES), 5);
  });

  test('a text kept at the naming, and no text kept at the sign-off: "not known", although the item did not change', (t) => {
    const w = world(t);
    saveItem(w, 5);
    name(w, undefined, { section: true });
    indexIssues(w);
    commitAll(w.dir, 'name the item');
    signoff(w);
    commitAll(w.dir, 'sign off');
    assertNotKnown(checked(w, ...ISSUES), 5);
  });
});

describe('R3: when al cannot tell, it says so, and never reports the item as unchanged', () => {
  test('named in an earlier commit with no al index --issues: "not known"', (t) => {
    const w = world(t);
    saveItem(w, 5);
    name(w);
    commitAll(w.dir, 'name the item');
    assertNotKnown(checked(w, ...ISSUES), 5);
  });

  test('named and committed, then al index --issues after the commit: al keeps no text for a moment that is past, so "not known"', (t) => {
    const w = world(t);
    saveItem(w, 5);
    name(w);
    commitAll(w.dir, 'name the item');
    indexIssues(w);
    commitAll(w.dir, 'index');
    assertNotKnown(checked(w, ...ISSUES), 5);
  });

  test('a task names an item that is not in the folder: "not known" for it (issue-missing may also be there)', (t) => {
    const w = world(t);
    saveItem(w, 5);
    name(w, [{ id: 'T1', ref: '#5' }, { id: 'T2', ref: '#9' }]);
    indexIssues(w);
    commitAll(w.dir, 'name the items');
    const r = checked(w, ...ISSUES);
    assertNotKnown(r, 9);
    assertNone(r, 5);
  });

  test('a kept item that is gone from the folder: "not known"', (t) => {
    const w = world(t);
    namedAndKept(w);
    rmSync(join(w.items, 'invoicer-5.json'));
    assertNotKnown(checked(w, ...ISSUES), 5);
  });

  test('a kept item whose file is now not valid JSON: "not known" (issue-unread may also be there)', (t) => {
    const w = world(t);
    namedAndKept(w);
    save(w, { 'invoicer-5.json': '{"number": 5, "body": \n' });
    assertNotKnown(checked(w, ...ISSUES), 5);
  });
});

describe('LD-12: a recorded judgement confirms that the change was read', () => {
  test('a judgement clears the "changed" hint, in the working tree and after the commit; a new change brings the hint back', (t) => {
    const w = world(t);
    namedAndKept(w);
    saveItem(w, 5, { body: 'Build the export as JSON.\n' });
    assertChanged(checked(w, ...ISSUES), 5);
    judge(w, '#5');
    assertNone(checked(w, ...ISSUES), 5);
    commitAll(w.dir, 'the change of #5 was read');
    assertNone(checked(w, ...ISSUES), 5);
    saveItem(w, 5, { body: 'Build the export as JSON and XML.\n' });
    assertChanged(checked(w, ...ISSUES), 5);
  });

  test('a judgement clears a "not known"; a later change brings a hint back', (t) => {
    const w = world(t);
    saveItem(w, 5);
    name(w);
    commitAll(w.dir, 'name the item');
    assertNotKnown(checked(w, ...ISSUES), 5);
    judge(w, '#5');
    assertNone(checked(w, ...ISSUES), 5);
    commitAll(w.dir, 'the item was read');
    assertNone(checked(w, ...ISSUES), 5);
    saveItem(w, 5, { body: 'Build the export as JSON.\n' });
    assertChanged(checked(w, ...ISSUES), 5);
  });

  test('a judgement on a comment change clears it; an edit of that comment brings the hint back', (t) => {
    const w = world(t);
    namedAndKept(w);
    saveItem(w, 5, { comments: [{ body: 'Also add a total line.\n' }] });
    assertChanged(checked(w, ...ISSUES), 5);
    judge(w, '#5');
    assertNone(checked(w, ...ISSUES), 5);
    saveItem(w, 5, { comments: [{ body: 'Also add a total line and a tax line.\n' }] });
    assertChanged(checked(w, ...ISSUES), 5);
  });

  for (const on of [`${OWN}#5`, 'https://github.com/acme/invoicer/issues/5']) {
    test(`--on takes the forms of a task's ref: ${on} clears the hint of #5`, (t) => {
      const w = world(t);
      namedAndKept(w);
      saveItem(w, 5, { body: 'Build the export as JSON.\n' });
      judge(w, on);
      assertNone(checked(w, ...ISSUES), 5);
    });
  }

  test('a judgement on one item does not clear the hint of another', (t) => {
    const w = world(t);
    saveItem(w, 6);
    namedAndKept(w, {}, [{ id: 'T1', ref: '#5' }, { id: 'T2', ref: '#6' }]);
    saveItem(w, 5, { body: 'Build the export as JSON.\n' });
    saveItem(w, 6, { body: 'Send the reminder twice.\n' });
    judge(w, '#5');
    const r = checked(w, ...ISSUES);
    assertNone(r, 5);
    assertChanged(r, 6);
  });

  test('without --yes, the judgement writes nothing, and the hint stays', (t) => {
    const w = world(t);
    namedAndKept(w);
    saveItem(w, 5, { body: 'Build the export as JSON.\n' });
    const r = writesNothing(w.dir, ['record', NAME, 'judgement', '--hint', CODE, '--on', '#5', '--reason', 'Read the change.', ...ISSUES], { env: w.gh.env });
    assert.deepEqual(w.gh.calls(), [], show(r));
    assertChanged(checked(w, ...ISSUES), 5);
  });

  test('--hint with another code is refused (exit 2, an al: line, nothing written); so is a judgement with no --reason', (t) => {
    const w = world(t);
    namedAndKept(w);
    saveItem(w, 5, { body: 'Build the export as JSON.\n' });
    const env = { env: w.gh.env };
    refused(w.dir, ['record', NAME, 'judgement', '--hint', 'issue-missing', '--on', '#5', '--reason', 'Read it.', ...ISSUES, '--yes'], env);
    refused(w.dir, ['record', NAME, 'judgement', '--hint', CODE, '--on', '#5', ...ISSUES, '--yes'], env);
    assert.deepEqual(w.gh.calls(), []);
    assertChanged(checked(w, ...ISSUES), 5);
  });
});

describe('LD-11: a closed item and an archived request are judged by what held when written', () => {
  test('a CLOSED item that changed: info issue-changed, not a hint', (t) => {
    const w = world(t);
    namedAndKept(w, { state: 'CLOSED' });
    saveItem(w, 5, { body: 'Build the export as JSON.\n', state: 'CLOSED' });
    assertChanged(checked(w, ...ISSUES), 5, 'info');
  });

  test('an item kept while OPEN, then closed with a changed body: info issue-changed, not a hint', (t) => {
    const w = world(t);
    namedAndKept(w);
    saveItem(w, 5, { body: 'Build the export as JSON.\n', state: 'CLOSED' });
    assertChanged(checked(w, ...ISSUES), 5, 'info');
  });

  test('an archived request: its tasks are not checked, so its changed item gives no issue-changed line', (t) => {
    const w = world(t);
    namedAndKept(w);
    editRecord(w.dir, NAME, (rec) => { rec.status = 'concluded'; });
    move(w.dir, `requests/${NAME}`, `requests/archive/${NAME}`);
    commitAll(w.dir, 'archive the request');
    saveItem(w, 5, { body: 'Build the export as JSON.\n' });
    const r = check(w, ...ISSUES);
    assert.notEqual(r.code, 2, show(r));
    assertNone(r, 5);
  });
});

describe('R3: issue-changed is a hint only; it does not change the exit code of al check --strict', () => {
  test('a changed item: no not ok issue-changed, and --strict exits with the same code as with the item as it was', (t) => {
    const w = world(t);
    namedAndKept(w);
    const clean = check(w, ...ISSUES, '--strict');
    assert.notEqual(clean.code, 2, show(clean));
    saveItem(w, 5, { body: 'Build the export as JSON.\n' });
    const r = check(w, ...ISSUES, '--strict');
    assertChanged(r, 5);
    assert.ok(!r.findings.some((f) => f.severity === 'not ok' && f.code === CODE), show(r));
    assert.equal(r.code, clean.code, `issue-changed does not change the exit code:\n${show(clean)}\n${show(r)}`);
  });

  test('a "not known" item: no not ok issue-changed, and --strict exits with the same code as without --issues', (t) => {
    const w = world(t);
    saveItem(w, 5);
    name(w);
    commitAll(w.dir, 'name the item');
    const plain = check(w, '--strict');
    assert.notEqual(plain.code, 2, show(plain));
    const r = check(w, ...ISSUES, '--strict');
    assertNotKnown(r, 5);
    assert.ok(!r.findings.some((f) => f.severity === 'not ok' && f.code === CODE), show(r));
    assert.equal(r.code, plain.code, `issue-changed does not change the exit code:\n${show(plain)}\n${show(r)}`);
  });
});

describe('al never runs gh', () => {
  test('index --issues, check --issues, a judgement preview and a judgement: the fake gh log stays empty', (t) => {
    const w = world(t);
    namedAndKept(w);
    saveItem(w, 5, { body: 'Build the export as JSON.\n' });
    checked(w, ...ISSUES);
    run(w, ['check', ...ISSUES, '--strict']);
    run(w, ['record', NAME, 'judgement', '--hint', CODE, '--on', '#5', '--reason', 'Read it.', ...ISSUES]);
    judge(w, '#5');
    indexIssues(w);
    assert.deepEqual(w.gh.calls(), []);
  });
});
