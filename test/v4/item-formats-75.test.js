// #75: saved work items in YAML and in Markdown, and work items out of the
// CI token's reach (requests/light-design/spec.md LD-39, LD-48, LD-22).
//
// - LD-39: "Saved work items may be YAML or JSON." "Work items out of the CI
//   token's reach (#38, Q9, Q19): a setting names them, and `al` gives one
//   info line for them, in place of a hint for each."
// - LD-48: "In the request's `request.md` or in a saved work item in
//   Markdown, a design line is a line that starts with `Design:` [...]. In a
//   saved work item in YAML or JSON, it is the field `design`, with one path
//   or a list of paths."
// - LD-22 (C7): the kept text of an item is "the item's body and each
//   comment that is not minimized, in order, with line ends made LF; its
//   state is not text."
//
// The interface these tests use, as agreed with the architect for #75:
//
// A. YAML. `al check --issues <folder>`, `al index --issues` and
//    `al record ... judgement --issues` read items from the `.yaml` and
//    `.yml` files of the folder, with the fields of a JSON item. A file
//    holds one item or a list of items. A file that is not valid YAML gives
//    `hint issue-unread <folder>/<file> - not read: ...`; an entry that is
//    not an item gives issue-unread as for JSON. Each check gives the same
//    result for the same item in YAML as in JSON.
// B. Markdown. Every `.md` file of the folder is read as an item:
//      URL: https://github.com/acme/invoicer/issues/31
//      State: OPEN
//      Parent: https://github.com/acme/invoicer/issues/30
//
//      Build the CSV export of invoices (ADR-3).
//
//      Design: docs/rfc/0018-export.md
//
//      ## Comment 1
//
//      The first PR is up.
//
//      ## Comment 2 (minimized)
//
//      An off-topic remark.
//    A header (keys URL, Number, Repository, Ref, State, Parent, case
//    ignored) up to the first blank line; the body up to the first comment
//    heading outside fenced code; `## Comment <k>` or
//    `## Comment <k> (minimized)`, k from 1 in order. Parent: a URL gives
//    {url}, `#n` gives {number}, `none` gives null, other text gives {ref};
//    no Parent line means no parent field. Blank lines at the start and the
//    end of the body and of each comment are dropped. A file that is not an
//    item gets issue-unread with the reason.
// C. The same item in two files, in any formats: the files are read in one
//    name order across all formats; the first is checked; the other copy
//    counts in the Not known line as an item that no task names.
// D. `items-out-of-reach:` in .assuredloop/config.yaml: a list of
//    repositories (`owner/repo`) and items (as a task's ref writes them).
//    With --issues, a task's item that it names and that is not in the
//    folder gets no issue-missing and no issue-changed "not known"; one line
//    names them all:
//      info issues-out-of-reach - - <n> items out of the CI token's reach (items-out-of-reach in .assuredloop/config.yaml) are not in <folder>, so they are not checked, and al cannot tell whether they changed since the change relied on them: <item> (<request>/<task>, ...), ...
//    A value that is not a list of non-empty texts stops `al check` with
//    exit 2.
//
// A JSON item is the control for each YAML and Markdown case. Each run has a
// PATH with a fake `gh` that only logs, and a folder of links to git and node
// only; every run checks that al did not run gh. No model. Nothing here reads
// the code under test.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { findings } from './helpers/invoicer.js';
import {
  al, baseProject, commitAll, doc, editRecord, git, newRequest, refused, show, write, writeYaml,
} from './helpers/project.js';
import { check as listCheck, notProposed, proposed } from './helpers/list-58.js';

// A folder that holds only links to git and node, so no real gh is on PATH.
const TOOLS = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-75-tools-'));
process.on('exit', () => rmSync(TOOLS, { recursive: true, force: true }));
const gitPath = spawnSync('/bin/sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
assert.ok(gitPath, 'git is on the PATH of the test process');
symlinkSync(gitPath, join(TOOLS, 'git'));
symlinkSync(process.execPath, join(TOOLS, 'node'));
const ghIn = (path) => spawnSync('/bin/sh', ['-c', 'command -v gh'], { env: { PATH: path }, encoding: 'utf8' }).stdout.trim();

const NAME = 'inv';
const OWN = 'acme/invoicer';
const OWN_REMOTE = 'git@github.com:acme/invoicer.git';
const OWN_ITEM = 'https://github.com/acme/invoicer/issues/7';
const SPEC = 'specs/invoices.md';
const FOLDER = '../items';
const ISSUES = ['--issues', FOLDER];
const CONFIG = '.assuredloop/config.yaml';

// =====================================================================
// The fake gh: it only logs its calls. al must never run it.

function fakeGh() {
  const bin = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-75-gh-'));
  const log = join(bin, 'calls.log');
  writeFileSync(join(bin, 'gh'), `#!/bin/sh\necho "$@" >> '${log}'\necho 'the fake gh: al must not run gh' >&2\nexit 1\n`);
  chmodSync(join(bin, 'gh'), 0o755);
  return { bin, env: { PATH: `${bin}:${TOOLS}` }, calls: () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []) };
}

// =====================================================================
// Items in the shape of `gh issue view --json number,url,body,comments,parent,state`,
// and items of another tracker.

const ghUrl = (repo, n) => `https://github.com/${repo}/issues/${n}`;
const ghParent = (key) => {
  const [repo, n] = key.split('#');
  return { id: `I_${n}`, number: Number(n), repository: { nameWithOwner: repo }, state: 'OPEN', title: `Issue ${n}`, url: ghUrl(repo, Number(n)) };
};
// A GitHub item; parent: "owner/repo#n", null, or 'absent' for no parent field.
// A comment is {body, hidden}; hidden gives isMinimized true.
function ghItem(repo, n, { body = 'Nothing to hint.\n', comments = [], parent = `${OWN}#7`, state } = {}) {
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
  if (state) item.state = state;
  return item;
}
const own = (n, opts) => ghItem(OWN, n, opts);

// The Markdown form of an item (B): the header, a blank line, the body, and
// each comment under its heading. Trailing line ends of a text are left out.
const trimEnd = (text) => text.replace(/\n+$/, '');
function parentText(p) {
  if (p === null) return 'none';
  if (p.url) return p.url;
  if (p.ref) return p.ref;
  return `#${p.number}`;
}
function md(item) {
  const head = [];
  if (item.url) head.push(`URL: ${item.url}`);
  if (item.number !== undefined && !item.url) head.push(`Number: ${item.number}`);
  if (item.repository) head.push(`Repository: ${item.repository}`);
  if (item.ref) head.push(`Ref: ${item.ref}`);
  if (item.state) head.push(`State: ${item.state}`);
  if ('parent' in item) head.push(`Parent: ${parentText(item.parent)}`);
  const parts = [head.join('\n'), trimEnd(item.body)];
  (item.comments ?? []).forEach((c, i) => parts.push(`## Comment ${i + 1}${c.isMinimized ? ' (minimized)' : ''}`, trimEnd(c.body)));
  return `${parts.join('\n\n')}\n`;
}

// The text of a file of the folder, by its extension: JSON, YAML or Markdown;
// a string is written as it is.
function textFor(file, value) {
  if (typeof value === 'string') return value;
  if (file.endsWith('.json')) return `${JSON.stringify(value, null, 2)}\n`;
  if (file.endsWith('.yaml') || file.endsWith('.yml')) return stringify(value);
  if (file.endsWith('.md')) return md(value);
  throw new Error(`no format for ${file}`);
}

// =====================================================================
// The world: <root>/invoicer, a git repo whose origin is
// git@github.com:acme/invoicer.git, with the config, a spec with an ADR
// chain (ADR-1 superseded by ADR-2, superseded by ADR-3, accepted), and the
// open request inv with `tasks` (and an optional second request), committed
// on main; then the branch feature. <root>/items is the folder of items; its
// assuredloop-requests.json names acme/invoicer#7 as the own item of inv,
// unless ownItem says otherwise. With outputs, <root>/web is an output repo
// named `web` (origin acme/web).

const adrFile = (status, marker, heading, rationale) => `Status: ${status}\n\n${doc([[marker, heading], [`${marker.split(' ')[0]}-1 rationale`, rationale]])}`;
const ADRS = {
  'specs/adr/0001-paper.md': adrFile('superseded by ADR-2', 'ADR-1 choice decides:INV-2', '# ADR-1: Paper invoices', 'Context: invoices were posted.'),
  'specs/adr/0002-pdf.md': adrFile('superseded by ADR-3', 'ADR-2 choice decides:INV-2 supersedes:ADR-1', '# ADR-2: PDF invoices', 'Context: postage cost too much.'),
  'specs/adr/0003-email.md': adrFile('accepted', 'ADR-3 choice decides:INV-2 supersedes:ADR-2', '# ADR-3: Invoices by email', 'Context: a PDF alone was not enough.'),
};
const SPEC_TEXT = doc([
  ['INV-1 note', '# Invoices'],
  ['INV-2 rule governed-by:ADR-3', 'An invoice MUST be sent by email.'],
  ['INV-3 note', 'Invoices are sent by email.'],
]);

function initRepo(dir, remote) {
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.name', 'Fixture Author');
  git(dir, 'config', 'user.email', 'author@example.invalid');
  git(dir, 'config', 'commit.gpgsign', 'false');
  if (remote) git(dir, 'remote', 'add', 'origin', remote);
}

const ownItems = (w, requests) =>
  write(w.items, 'assuredloop-requests.json', `${JSON.stringify({ format: 'assuredloop-items/1', requests }, null, 2)}\n`);

function world(t, { tasks = [{ id: 'T1', ref: '#31' }], ownItem = OWN_ITEM, config = {}, second = null, outputs = false } = {}) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-75-'));
  const gh = fakeGh();
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(gh.bin, { recursive: true, force: true });
  });
  const dir = join(root, 'invoicer');
  const items = join(root, 'items');
  mkdirSync(items);
  initRepo(dir, OWN_REMOTE);
  const cfg = { docs: [{ file: SPEC, prefix: 'INV' }], ...config };
  if (outputs) {
    const web = join(root, 'web');
    initRepo(web, 'https://github.com/acme/web.git');
    write(web, 'README.md', '# Web\n');
    commitAll(web, 'Start the web repo');
    Object.assign(cfg, { repo: 'invoicer', outputs: [{ name: 'web', path: '../web' }] });
  }
  writeYaml(dir, CONFIG, cfg);
  write(dir, SPEC, SPEC_TEXT);
  for (const [file, text] of Object.entries(ADRS)) write(dir, file, text);
  newRequest(dir, NAME, 'The owner wants the requester to see each invoice.\n');
  editRecord(dir, NAME, (rec) => { rec.tasks = tasks; });
  if (second) {
    newRequest(dir, second.name, `The owner wants ${second.name}.\n`);
    editRecord(dir, second.name, (rec) => { rec.tasks = second.tasks; });
  }
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  const w = { root, dir, items, gh };
  if (ownItem) ownItems(w, { [NAME]: ownItem });
  return w;
}

// Item files in the folder: {file name: an item, a list, or a string as written}.
function save(w, files) {
  for (const [file, value] of Object.entries(files)) write(w.items, file, textFor(file, value));
}
// Removes every item file of the folder (not assuredloop-requests.json).
function clear(w, ...files) {
  for (const file of files) rmSync(join(w.items, file));
}

// One run of al in the world, with the logging gh first on PATH; al never runs gh.
function run(w, args) {
  const r = al(w.dir, args, { env: w.gh.env });
  assert.deepEqual(w.gh.calls(), [], `al ran gh:\n${show(r)}`);
  return r;
}
function okRun(w, args) {
  const r = run(w, args);
  assert.equal(r.code, 0, show(r));
  return r;
}
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

const coded = (r, code) => r.findings.filter((f) => f.code === code);
const notKnown = (r) => r.stdout.split('\n').find((l) => l.startsWith('Not known')) ?? '';
const where = (f) => (f.at === null ? f.file : `${f.file}:${f.at}`);
const sorted = (list) => [...list].sort();

// The one finding of code at file (and at line, when given; null for no line).
function one(r, code, file, at, severity = 'hint') {
  const found = coded(r, code).filter((f) => f.file === file && (at === undefined || f.at === at));
  assert.equal(found.length, 1, `one ${code} at ${file}${at === undefined ? '' : `:${at}`}:\n${show(r)}`);
  assert.equal(found[0].severity, severity, show(r));
  return found[0];
}

// The same result: the same exit code, and the same output, line for line,
// once each file name of the first run is changed to the file name of the
// second run ([from, to] pairs).
function assertSame(first, second, renames = [], what = '') {
  let text = first.stdout;
  for (const [from, to] of renames) text = text.split(from).join(to);
  assert.equal(second.code, first.code, `${what}: the same exit code\n${show(first)}\n${show(second)}`);
  assert.equal(second.stdout, text, `${what}: the same output as the JSON control\n--- the JSON control\n${show(first)}\n--- this run\n${show(second)}`);
}

// The unread finding at <folder>/<file>: a hint, ID -, "not read: <reason>".
function unread(r, file) {
  const found = coded(r, 'issue-unread').filter((f) => f.file === `${FOLDER}/${file}`);
  assert.equal(found.length >= 1, true, `issue-unread at ${FOLDER}/${file}:\n${show(r)}`);
  for (const f of found) {
    assert.equal(f.severity, 'hint', show(r));
    assert.equal(f.id, '-', show(r));
    assert.ok(f.msg.startsWith('not read: ') && f.msg.length > 'not read: '.length, `"not read: <reason>":\n${show(r)}`);
  }
  assert.ok(notKnown(r).includes(`${FOLDER}/${file}`), `the Not known line names ${file}:\n${show(r)}`);
  return found;
}

// Whether a line names item n: <repo>#n, #n, or its URL.
const namesItem = (line, n) => new RegExp(`(#|/issues/)${n}(?!\\d)`).test(line);
const changedFor = (r, n) => coded(r, 'issue-changed').filter((f) => namesItem(f.line, n));
function assertChanged(r, n) {
  const found = changedFor(r, n);
  assert.equal(found.length, 1, `one issue-changed line for #${n}:\n${show(r)}`);
  assert.match(found[0].msg, /changed/i, show(r));
  assert.doesNotMatch(found[0].msg, /not known/i, `"changed", not "not known":\n${show(r)}`);
}
const assertNoChange = (r, n) => assert.deepEqual(changedFor(r, n).map((f) => f.line), [], `no issue-changed line for #${n}:\n${show(r)}`);

test('the test setup: the tools folder holds git and no gh; with the fake first on PATH, gh is the fake', (t) => {
  assert.equal(ghIn(TOOLS), '', `a gh in ${TOOLS} would hide a gh call`);
  const gh = fakeGh();
  t.after(() => rmSync(gh.bin, { recursive: true, force: true }));
  assert.equal(ghIn(gh.env.PATH), join(gh.bin, 'gh'));
});

test('the test setup: the Markdown writer gives the form of B for the example item', () => {
  const text = md({
    url: 'https://github.com/acme/invoicer/issues/31',
    state: 'OPEN',
    parent: { url: 'https://github.com/acme/invoicer/issues/30' },
    body: 'Build the CSV export of invoices (ADR-3).\n\nDesign: docs/rfc/0018-export.md',
    comments: [{ body: 'The first PR is up.', isMinimized: false }, { body: 'An off-topic remark.', isMinimized: true }],
  });
  assert.equal(text, EXAMPLE_MD);
});

// =====================================================================
// A and B: each hint is the same for the same item in YAML, in Markdown and in JSON.

const BARE = '#12 and (#13) are the cause.\nNo reference here.\nSee (#14).\nThe requester asked.\n';
// Items that give each hint: issue-superseded in the body and in comment 3
// (after the minimized comment 2), issue-not-sub (parent null; parent #8),
// issue-bare-ref and phrase (acme/web#5), a closed item's issue-superseded
// as info (PROJ-12), and issue-missing (acme/web#9 is in no file).
const ALL_TASKS = [
  { id: 'T1', ref: '#31' }, { id: 'T2', ref: 'acme/web#5' }, { id: 'T3', ref: 'acme/web#9' }, { id: 'T4', ref: 'PROJ-12' }, { id: 'T5', ref: '#33' },
];
const I31 = own(31, {
  body: 'Intro.\n\nWe keep\nthe old ADR-1 for now.\n',
  parent: null,
  comments: [{ body: 'Agreed.\n' }, { body: 'We keep ADR-1.\n', hidden: true }, { body: 'Thanks.\n\nWe keep ADR-1.\n' }],
});
const W5 = ghItem('acme/web', 5, { body: BARE });
const P12 = { ref: 'PROJ-12', repository: 'PROJ', body: 'We keep ADR-2.\n', state: 'CLOSED', parent: { ref: 'PROJ-1' } };
const I33 = { ...own(33, { body: 'Build the import.\n' }), parent: { number: 8 } };

function allHints(t) {
  return world(t, { tasks: ALL_TASKS, config: { phrases: ['the requester'] } });
}
// The JSON control: each hint is given (so the comparison is not empty).
function jsonControl(w) {
  save(w, { 'a.json': I31, 'b.json': W5, 'c.json': [P12, I33] });
  const r = checked(w, ...ISSUES);
  one(r, 'issue-superseded', `${OWN}#31`, 3);
  one(r, 'issue-superseded', `${OWN}#31/comment-3`, 3);
  assert.equal(coded(r, 'issue-superseded').filter((f) => f.file.startsWith(`${OWN}#31`)).length, 2, show(r));
  one(r, 'issue-superseded', 'PROJ-12', 1, 'info');
  one(r, 'issue-not-sub', `${OWN}#31`, null);
  one(r, 'issue-not-sub', `${OWN}#33`, null);
  assert.deepEqual(sorted(coded(r, 'issue-bare-ref').map(where)), ['acme/web#5:1', 'acme/web#5:3'], show(r));
  one(r, 'phrase', 'acme/web#5', 4);
  one(r, 'issue-missing', 'acme/web#9');
  assert.deepEqual(coded(r, 'issue-unread'), [], show(r));
  clear(w, 'a.json', 'b.json', 'c.json');
  return r;
}

describe('A (LD-39): an item in a .yaml or .yml file gives the same result as the same item in JSON', () => {
  test('issue-superseded (body, comment k, closed as info), issue-not-sub, issue-bare-ref, phrase, issue-missing, issue-changed and the info line: the same output, line for line', (t) => {
    const w = allHints(t);
    const control = jsonControl(w);
    save(w, { 'a.yaml': I31, 'b.yml': W5, 'c.yaml': [P12, I33] });
    assertSame(control, checked(w, ...ISSUES), [], 'YAML');
  });

  test('a .yaml file that holds a list of items and a .yml file that holds one item: each item is read (no issue-missing)', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: '#31' }, { id: 'T2', ref: 'PROJ-12' }, { id: 'T3', ref: 'acme/web#5' }] });
    const list = [own(31, { body: 'We keep ADR-1.\n' }), { ref: 'PROJ-12', repository: 'PROJ', body: 'Intro.\n\nWe keep ADR-1.\n' }];
    save(w, { 'list.json': list, 'web.json': { number: 5, repository: 'acme/web', body: 'We keep ADR-1.\n' } });
    const control = checked(w, ...ISSUES);
    assert.deepEqual(coded(control, 'issue-missing'), [], show(control));
    one(control, 'issue-superseded', 'PROJ-12', 3);
    clear(w, 'list.json', 'web.json');
    save(w, { 'list.yaml': list, 'web.yml': { number: 5, repository: 'acme/web', body: 'We keep ADR-1.\n' } });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(coded(r, 'issue-missing'), [], show(r));
    one(r, 'issue-superseded', `${OWN}#31`, 1);
    one(r, 'issue-superseded', 'PROJ-12', 3);
    one(r, 'issue-superseded', 'acme/web#5', 1);
    assertSame(control, r, [], 'YAML list');
  });

  test('a file that is not valid YAML: issue-unread at <folder>/<file>, "not read:" and YAML, the Not known line names it; the other files are read (control: a bad JSON file)', (t) => {
    const w = world(t);
    save(w, { 'a.json': own(31, { body: 'We keep ADR-1.\n' }), 'bad.json': '{"number": 32, "body": \n' });
    const control = checked(w, ...ISSUES);
    assert.equal(unread(control, 'bad.json')[0].line, `hint issue-unread ${FOLDER}/bad.json - not read: it is not valid JSON`, show(control));
    one(control, 'issue-superseded', `${OWN}#31`, 1);
    clear(w, 'a.json', 'bad.json');
    save(w, { 'a.yaml': own(31, { body: 'We keep ADR-1.\n' }), 'bad.yaml': 'number: 32\nbody: [unclosed\n  - x: : y\n' });
    const r = checked(w, ...ISSUES);
    const found = unread(r, 'bad.yaml');
    assert.equal(found.length, 1, show(r));
    assert.match(found[0].msg, /YAML/, `the reason names YAML:\n${show(r)}`);
    one(r, 'issue-superseded', `${OWN}#31`, 1);
    assert.equal(coded(r, 'issue-unread').length, 1, show(r));
  });

  test('entries that are not items, in YAML: issue-unread with the same reasons as the same entries in JSON', (t) => {
    const w = world(t);
    const files = { nobody: { number: 40, url: ghUrl(OWN, 40) }, norepo: { number: 41, body: 'x\n' }, list: [42, 'text', { number: 43, url: ghUrl(OWN, 43) }], text: 'just text' };
    const json = Object.fromEntries(Object.entries(files).map(([k, v]) => [`${k}.json`, k === 'text' ? '"just text"\n' : v]));
    save(w, { 'a.json': own(31), ...json });
    const control = checked(w, ...ISSUES);
    const reasons = (r, ext) => Object.keys(files).map((k) => unread(r, `${k}.${ext}`).map((f) => f.msg));
    const want = reasons(control, 'json');
    clear(w, 'a.json', ...Object.keys(json));
    save(w, { 'a.yaml': own(31), ...Object.fromEntries(Object.entries(files).map(([k, v]) => [`${k}.yaml`, k === 'text' ? 'just text\n' : v])) });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(reasons(r, 'yaml'), want, show(r));
    assert.deepEqual(coded(r, 'issue-missing'), [], `#31 is read:\n${show(r)}`);
  });
});

describe('B: an item in a .md file gives the same result as the same item in JSON', () => {
  test('issue-superseded (body, comment k after a minimized comment, closed as info), issue-not-sub, issue-bare-ref, phrase, issue-missing, issue-changed and the info line: the same output, line for line', (t) => {
    const w = allHints(t);
    const control = jsonControl(w);
    save(w, { 'a.md': I31, 'b.md': W5, 'c1.md': P12, 'c2.md': I33 });
    assertSame(control, checked(w, ...ISSUES), [], 'Markdown');
  });

  test('the keys of the header ignore case, and State takes open and closed in any case: the same output as JSON OPEN and CLOSED', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: 'PROJ-12' }, { id: 'T2', ref: '#31' }] });
    const p12 = { ref: 'PROJ-12', repository: 'PROJ', body: 'We keep ADR-1.\n', state: 'CLOSED', parent: null };
    const i31 = { url: ghUrl(OWN, 31), number: 31, body: 'We keep ADR-1.\n', state: 'OPEN', parent: { url: OWN_ITEM } };
    save(w, { 'p.json': p12, 'i.json': i31 });
    const control = checked(w, ...ISSUES);
    one(control, 'issue-superseded', 'PROJ-12', 1, 'info');
    one(control, 'issue-superseded', `${OWN}#31`, 1, 'hint');
    clear(w, 'p.json', 'i.json');
    save(w, {
      'p.md': 'ref: PROJ-12\nREPOSITORY: PROJ\nstate: Closed\nparent: none\n\nWe keep ADR-1.\n',
      'i.md': `url: ${ghUrl(OWN, 31)}\nSTATE: open\nPARENT: ${OWN_ITEM}\n\nWe keep ADR-1.\n`,
    });
    assertSame(control, checked(w, ...ISSUES), [], 'Markdown, keys in other cases');
  });

  test('the identity: a URL; a Number with a Repository; a Ref with a Repository; a Ref alone: the same output as the JSON items', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: '#31' }, { id: 'T2', ref: 'acme/web#5' }, { id: 'T3', ref: 'PROJ-12' }, { id: 'T4', ref: 'PROJ-13' }] });
    const items = {
      url: { url: ghUrl(OWN, 31), body: 'We keep ADR-1.\n', parent: null },
      number: { number: 5, repository: 'acme/web', body: 'See (#12).\n', parent: { url: OWN_ITEM } },
      ref: { ref: 'PROJ-12', repository: 'acme/web', body: 'See (#12).\n' },
      alone: { ref: 'PROJ-13', body: 'See (#12).\nWe keep ADR-1.\n' },
    };
    save(w, Object.fromEntries(Object.entries(items).map(([k, v]) => [`${k}.json`, v])));
    const control = checked(w, ...ISSUES);
    assert.deepEqual(coded(control, 'issue-missing'), [], show(control));
    one(control, 'issue-bare-ref', 'acme/web#5', 1);
    one(control, 'issue-bare-ref', 'PROJ-12', 1);
    one(control, 'issue-superseded', 'PROJ-13', 1);
    clear(w, ...Object.keys(items).map((k) => `${k}.json`));
    save(w, Object.fromEntries(Object.entries(items).map(([k, v]) => [`${k}.md`, v])));
    assertSame(control, checked(w, ...ISSUES), [], 'Markdown identities');
  });

  // Parent: a URL gives {url}; #n gives {number: n}; none gives null; other
  // text gives {ref}; no Parent line gives no parent field.
  const PARENTS = [
    ['the URL of the own item', { url: OWN_ITEM }, `Parent: ${OWN_ITEM}`, 0],
    ['#7, the own item by its number', { number: 7 }, 'Parent: #7', 0],
    ['#8, another item', { number: 8 }, 'Parent: #8', 1],
    ['none', null, 'Parent: none', 1],
    ['the text acme/invoicer#7, a ref', { ref: 'acme/invoicer#7' }, 'Parent: acme/invoicer#7', undefined],
    ['the text PROJ-1, a ref', { ref: 'PROJ-1' }, 'Parent: PROJ-1', undefined],
    ['no Parent line', 'absent', null, 0],
  ];
  for (const [what, parent, line, notSub] of PARENTS) {
    test(`Parent: ${what}: the same output as the JSON item${notSub === undefined ? '' : `, with ${notSub} issue-not-sub`}`, (t) => {
      const w = world(t, { tasks: [{ id: 'T1', ref: '#32' }] });
      const json = { number: 32, url: ghUrl(OWN, 32), body: 'Build the export.\n' };
      if (parent !== 'absent') json.parent = parent;
      save(w, { 'a.json': json });
      const control = checked(w, ...ISSUES);
      if (notSub !== undefined) assert.equal(coded(control, 'issue-not-sub').length, notSub, show(control));
      clear(w, 'a.json');
      save(w, { 'a.md': `URL: ${ghUrl(OWN, 32)}\n${line ? `${line}\n` : ''}\nBuild the export.\n` });
      assertSame(control, checked(w, ...ISSUES), [], `Markdown, Parent: ${what}`);
    });
  }

  test('no Parent line says nothing about the parent: the Not known line differs from the one for Parent: none (control: the same in JSON)', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: '#32' }] });
    save(w, { 'a.json': { url: ghUrl(OWN, 32), body: 'Build the export.\n', parent: null } });
    const jsonNone = checked(w, ...ISSUES);
    one(jsonNone, 'issue-not-sub', `${OWN}#32`, null);
    save(w, { 'a.json': { url: ghUrl(OWN, 32), body: 'Build the export.\n' } });
    const jsonAbsent = checked(w, ...ISSUES);
    assert.deepEqual(coded(jsonAbsent, 'issue-not-sub'), [], show(jsonAbsent));
    assert.notEqual(notKnown(jsonAbsent), notKnown(jsonNone), show(jsonAbsent));
    clear(w, 'a.json');
    save(w, { 'a.md': `URL: ${ghUrl(OWN, 32)}\nParent: none\n\nBuild the export.\n` });
    const withNone = checked(w, ...ISSUES);
    one(withNone, 'issue-not-sub', `${OWN}#32`, null);
    save(w, { 'a.md': `URL: ${ghUrl(OWN, 32)}\n\nBuild the export.\n` });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(coded(r, 'issue-not-sub'), [], show(r));
    assert.notEqual(notKnown(r), notKnown(withNone), `the Not known line says that the parent is not known:\n${show(r)}`);
  });

  test('a comment heading inside fenced code (``` or ~~~) is text; a line that is not exactly a heading is text: the same output as the JSON item', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: '#31' }] });
    const body = 'Steps:\n\n```\n## Comment 1\nnot a comment\n```\n\n## Comment 1: notes\n## Comments\n\nWe keep ADR-1.';
    const comment1 = 'First.\n\n~~~\n## Comment 2\n~~~\n\nWe keep ADR-1.';
    const comment2 = 'Second.\n\nWe keep ADR-1.';
    const item = { url: ghUrl(OWN, 31), parent: { url: OWN_ITEM }, body, comments: [{ body: comment1, isMinimized: false }, { body: comment2, isMinimized: false }] };
    save(w, { 'a.json': item });
    const control = checked(w, ...ISSUES);
    one(control, 'issue-superseded', `${OWN}#31`, 11);
    one(control, 'issue-superseded', `${OWN}#31/comment-1`, 7);
    one(control, 'issue-superseded', `${OWN}#31/comment-2`, 3);
    clear(w, 'a.json');
    save(w, { 'a.md': `URL: ${ghUrl(OWN, 31)}\nParent: ${OWN_ITEM}\n\n${body}\n\n## Comment 1\n\n${comment1}\n\n## Comment 2\n\n${comment2}\n` });
    assertSame(control, checked(w, ...ISSUES), [], 'Markdown with fenced code');
  });

  test('blank lines at the start and the end of the body and of each comment are dropped: hints at the same lines as the JSON item without them', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: '#31' }] });
    const item = { url: ghUrl(OWN, 31), parent: { url: OWN_ITEM }, body: 'Intro.\n\nWe keep ADR-1.', comments: [{ body: 'Thanks.\n\nWe keep ADR-1.', isMinimized: false }] };
    save(w, { 'a.json': item });
    const control = checked(w, ...ISSUES);
    one(control, 'issue-superseded', `${OWN}#31`, 3);
    one(control, 'issue-superseded', `${OWN}#31/comment-1`, 3);
    clear(w, 'a.json');
    save(w, { 'a.md': `URL: ${ghUrl(OWN, 31)}\nParent: ${OWN_ITEM}\n\n\n\nIntro.\n\nWe keep ADR-1.\n\n\n\n## Comment 1\n\n\n\nThanks.\n\nWe keep ADR-1.\n\n\n` });
    assertSame(control, checked(w, ...ISSUES), [], 'Markdown with extra blank lines');
  });

  // Not an item: issue-unread at the file, with a reason; the other files are read.
  const NOT_ITEMS = [
    ['the first line is not a header line', 'first.md', `# Build the export\n\nURL: ${ghUrl(OWN, 40)}\n\nBuild it.\n`, null],
    ['a header line with another key', 'title.md', `URL: ${ghUrl(OWN, 41)}\nTitle: Export\n\nBuild it.\n`, /title/i],
    ['a key twice', 'twice.md', `URL: ${ghUrl(OWN, 42)}\nURL: ${ghUrl(OWN, 43)}\n\nBuild it.\n`, /url/i],
    ['a Number that is not digits', 'number.md', 'Number: 44a\nRepository: acme/invoicer\n\nBuild it.\n', /number/i],
    ['no identity: a State alone', 'state.md', 'State: open\n\nBuild it.\n', null],
    ['no identity: a URL that is not an issue URL', 'notes.md', 'URL: https://example.com/notes/45\n\nBuild it.\n', null],
    ['no identity: a Number with no Repository', 'norepo.md', 'Number: 46\n\nBuild it.\n', null],
    ['a comment number that is not the next one (1, then 3)', 'skip.md', `URL: ${ghUrl(OWN, 47)}\n\nBuild it.\n\n## Comment 1\n\nOne.\n\n## Comment 3\n\nThree.\n`, /comment/i],
    ['a first comment numbered 2', 'two.md', `URL: ${ghUrl(OWN, 48)}\n\nBuild it.\n\n## Comment 2\n\nTwo.\n`, /comment/i],
    ['a README.md with no header', 'README.md', '# Items\n\nThe items of the invoicer, saved for al.\n', null],
  ];
  for (const [what, file, text, word] of NOT_ITEMS) {
    test(`not an item, ${what}: issue-unread at ${FOLDER}/${file}, "not read:" with the reason; the JSON item beside it is read`, (t) => {
      const w = world(t);
      save(w, { 'a.json': own(31, { body: 'We keep ADR-1.\n' }) });
      const control = checked(w, ...ISSUES);
      one(control, 'issue-superseded', `${OWN}#31`, 1);
      save(w, { [file]: text });
      const r = checked(w, ...ISSUES);
      const found = unread(r, file);
      if (word) assert.match(found[0].msg, word, `the reason names it:\n${show(r)}`);
      one(r, 'issue-superseded', `${OWN}#31`, 1);
    });
  }

  test('a valid .md item beside a README.md: the item is read, the README.md gets issue-unread', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: '#31' }] });
    save(w, { 'a.json': own(31, { body: 'We keep ADR-1.\n' }) });
    one(checked(w, ...ISSUES), 'issue-superseded', `${OWN}#31`, 1);
    clear(w, 'a.json');
    save(w, { 'a.md': own(31, { body: 'We keep ADR-1.\n' }), 'README.md': '# Items\n\nSaved for al.\n' });
    const r = checked(w, ...ISSUES);
    one(r, 'issue-superseded', `${OWN}#31`, 1);
    assert.deepEqual(coded(r, 'issue-missing'), [], show(r));
    unread(r, 'README.md');
  });
});

// =====================================================================
// A and B, C7 (LD-22): the kept text is the same in each format.

const EXAMPLE_MD = `URL: https://github.com/acme/invoicer/issues/31
State: OPEN
Parent: https://github.com/acme/invoicer/issues/30

Build the CSV export of invoices (ADR-3).

Design: docs/rfc/0018-export.md

## Comment 1

The first PR is up.

## Comment 2 (minimized)

An off-topic remark.
`;
const EXAMPLE_JSON = {
  url: 'https://github.com/acme/invoicer/issues/31',
  state: 'OPEN',
  parent: { url: 'https://github.com/acme/invoicer/issues/30' },
  body: 'Build the CSV export of invoices (ADR-3).\n\nDesign: docs/rfc/0018-export.md',
  comments: [{ body: 'The first PR is up.', isMinimized: false }, { body: 'An off-topic remark.', isMinimized: true }],
};
const C7_ITEM = {
  url: ghUrl(OWN, 5),
  number: 5,
  state: 'OPEN',
  parent: { url: OWN_ITEM },
  body: 'Build the export.\n\nOne file per month.',
  comments: [{ body: 'Agreed.', isMinimized: false }, { body: 'Spam.', isMinimized: true }, { body: 'Also a total line.', isMinimized: false }],
};
const withBody = (item, body) => ({ ...item, body });

// A world with no task at HEAD: the file is saved, the request names the item
// in this edit, `al index --issues` keeps its text, and the commit.
function keptWorld(t, file, item, { ref = '#5', ownItem = OWN_ITEM } = {}) {
  const w = world(t, { tasks: [], ownItem });
  save(w, { [file]: item });
  editRecord(w.dir, NAME, (rec) => { rec.tasks = [{ id: 'T1', ref }]; });
  okRun(w, ['index', ...ISSUES]);
  commitAll(w.dir, 'name the item');
  return w;
}

describe('A and B, C7 (LD-22): the text kept from an item in one format is the same text in another format', () => {
  const pairs = [['invoicer-5.json', 'invoicer-5.yaml'], ['invoicer-5.yaml', 'invoicer-5.json'], ['invoicer-5.json', 'invoicer-5.yml'], ['invoicer-5.json', 'invoicer-5.md'], ['invoicer-5.md', 'invoicer-5.json']];
  for (const [from, to] of pairs) {
    test(`kept from ${from}, the file replaced by the same item in ${to}: no issue-changed; the body changed in ${to}: "changed" (control: the item as it was in ${from})`, (t) => {
      const w = keptWorld(t, from, C7_ITEM);
      assertNoChange(checked(w, ...ISSUES), 5);
      clear(w, from);
      save(w, { [to]: C7_ITEM });
      assertNoChange(checked(w, ...ISSUES), 5);
      save(w, { [to]: withBody(C7_ITEM, 'Build the export as JSON.') });
      assertChanged(checked(w, ...ISSUES), 5);
    });
  }

  test('YAML: kept from YAML, changed in YAML: "changed"; al record judgement --issues reads the YAML item and clears it; a later change brings it back', (t) => {
    const w = keptWorld(t, 'invoicer-5.yaml', C7_ITEM);
    assertNoChange(checked(w, ...ISSUES), 5);
    save(w, { 'invoicer-5.yaml': withBody(C7_ITEM, 'Build the export as JSON.') });
    assertChanged(checked(w, ...ISSUES), 5);
    okRun(w, ['record', NAME, 'judgement', '--hint', 'issue-changed', '--on', '#5', '--reason', 'Read the change; the task still holds.', ...ISSUES, '--yes']);
    assertNoChange(checked(w, ...ISSUES), 5);
    save(w, { 'invoicer-5.yaml': withBody(C7_ITEM, 'Build the export as XML.') });
    assertChanged(checked(w, ...ISSUES), 5);
  });

  test('Markdown: a comment changed gives "changed"; only the minimized comment changed gives none (D4)', (t) => {
    const w = keptWorld(t, 'invoicer-5.md', C7_ITEM);
    assertNoChange(checked(w, ...ISSUES), 5);
    const comments = (bodies) => C7_ITEM.comments.map((c, i) => ({ ...c, body: bodies[i] }));
    save(w, { 'invoicer-5.md': { ...C7_ITEM, comments: comments(['Agreed.', 'Other spam.', 'Also a total line.']) } });
    assertNoChange(checked(w, ...ISSUES), 5);
    save(w, { 'invoicer-5.md': { ...C7_ITEM, comments: comments(['Agreed.', 'Spam.', 'Also a total line and a tax line.']) } });
    assertChanged(checked(w, ...ISSUES), 5);
  });

  for (const [from, to] of [['invoicer-31.json', 'invoicer-31.md'], ['invoicer-31.md', 'invoicer-31.json']]) {
    test(`the example of B: kept from ${from}, replaced by ${to}: no issue-changed, and the same output, line for line; its body changed by one word: "changed"`, (t) => {
      const w = keptWorld(t, from, from.endsWith('.md') ? EXAMPLE_MD : EXAMPLE_JSON, { ref: '#31', ownItem: 'https://github.com/acme/invoicer/issues/30' });
      const control = checked(w, ...ISSUES);
      assertNoChange(control, 31);
      clear(w, from);
      save(w, { [to]: to.endsWith('.md') ? EXAMPLE_MD : EXAMPLE_JSON });
      const r = checked(w, ...ISSUES);
      assertNoChange(r, 31);
      assertSame(control, r, [[from, to]], `the example, ${from} to ${to}`);
      save(w, { [to]: to.endsWith('.md') ? EXAMPLE_MD.replace('CSV export', 'JSON export') : withBody(EXAMPLE_JSON, EXAMPLE_JSON.body.replace('CSV export', 'JSON export')) });
      assertChanged(checked(w, ...ISSUES), 31);
    });
  }

  test('the fenced code and the extra blank lines of a .md item: the same kept text as the JSON item', (t) => {
    const body = 'Steps:\n\n```\n## Comment 1\n```\n\nBuild it.';
    const json = { url: ghUrl(OWN, 5), body, comments: [{ body: 'First.\n\n~~~\n## Comment 2\n~~~', isMinimized: false }] };
    const w = keptWorld(t, 'invoicer-5.json', json);
    assertNoChange(checked(w, ...ISSUES), 5);
    clear(w, 'invoicer-5.json');
    save(w, { 'invoicer-5.md': `URL: ${ghUrl(OWN, 5)}\n\n\n${body}\n\n\n## Comment 1\n\n\nFirst.\n\n~~~\n## Comment 2\n~~~\n\n\n` });
    assertNoChange(checked(w, ...ISSUES), 5);
  });
});

// =====================================================================
// C: the same item in two files, in any formats.

describe('C: the same item in two files is handled as two JSON files with the same item: the first file in name order is checked', () => {
  const ADR1 = own(31, { body: 'We keep ADR-1.\n' });
  const PLAIN = own(31, { body: 'Plain.\n' });

  test('control: a.json with ADR-1 and b.json plain: the hint; a.json plain and b.json with ADR-1: none; the Not known line counts the other copy', (t) => {
    const w = world(t);
    save(w, { 'a.json': ADR1 });
    const single = checked(w, ...ISSUES);
    save(w, { 'b.json': PLAIN });
    const first = checked(w, ...ISSUES);
    one(first, 'issue-superseded', `${OWN}#31`, 1);
    assert.notEqual(notKnown(first), notKnown(single), show(first));
    assert.match(notKnown(first), /1 item in \.\.\/items that no task names/, show(first));
    save(w, { 'a.json': PLAIN, 'b.json': ADR1 });
    assert.deepEqual(coded(checked(w, ...ISSUES), 'issue-superseded'), []);
  });

  // [the names of the three files, their formats in that order]
  for (const names of [['a.md', 'b.json', 'c.yaml'], ['a.yaml', 'b.md', 'c.json'], ['a.json', 'b.yml', 'c.md'], ['x.json', 'x.md', 'x.yaml']]) {
    test(`the order is by file name across formats: ${names.join(', ')}: only the item in ${names[0]} is checked; the same output as three JSON files`, (t) => {
      const w = world(t);
      const jsonNames = ['a.json', 'b.json', 'c.json'];
      for (let at = 0; at < 3; at++) {
        const contents = [PLAIN, PLAIN, PLAIN];
        contents[at] = ADR1;
        save(w, Object.fromEntries(jsonNames.map((n, i) => [n, contents[i]])));
        const control = checked(w, ...ISSUES);
        assert.equal(coded(control, 'issue-superseded').length, at === 0 ? 1 : 0, show(control));
        clear(w, ...jsonNames);
        save(w, Object.fromEntries(names.map((n, i) => [n, contents[i]])));
        const r = checked(w, ...ISSUES);
        assert.equal(coded(r, 'issue-superseded').length, at === 0 ? 1 : 0, `ADR-1 in ${names[at]}: ${at === 0 ? 'the hint' : 'no hint'}:\n${show(r)}`);
        assertSame(control, r, [], `ADR-1 in ${names[at]}`);
        clear(w, ...names);
      }
    });
  }
});

// =====================================================================
// LD-48: the design of a saved work item in YAML and in Markdown.

const LOCAL = 'docs/rfc/0018-local.md';
const BATCH = 'docs/rfc/0017-batch.md';

// The central repo, with two local documents; on the branch, the request
// streaming with the task T1 naming PROJ-12. The items folder is a temp dir.
function designWorld(t) {
  const dir = baseProject(t, { branch: null });
  write(dir, LOCAL, '# Local streaming\n\nThe export streams rows.\n');
  write(dir, BATCH, '# Batch\n\nThe export runs at night.\n');
  commitAll(dir, 'the documents');
  git(dir, 'checkout', '-q', '-b', 'feature');
  newRequest(dir, 'streaming');
  editRecord(dir, 'streaming', (rec) => { rec.tasks = [{ id: 'T1', ref: 'PROJ-12' }]; });
  commitAll(dir, 'streaming');
  const items = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-75-items-'));
  t.after(() => rmSync(items, { recursive: true, force: true }));
  return { dir, items };
}
const fieldLine = (path, items, file) => `proposed ${path} design document · design of work item PROJ-12 (${join(items, file)}) · state unknown · no markers: supporting evidence`;
const bodyLine = (path, items, file) => `proposed ${path} design document · design line in work item PROJ-12 (${join(items, file)}) · state unknown · no markers: supporting evidence`;

describe('LD-48: a saved work item in YAML gives its design by the field design or a Design: line; one in Markdown by a Design: line', () => {
  test('the field design, one path, in YAML: "design of work item PROJ-12 (<folder>/proj-12.yaml)" (control: the same in JSON)', (t) => {
    const { dir, items } = designWorld(t);
    const item = { ref: 'PROJ-12', repository: 'PROJ', body: 'Stream the export.', design: LOCAL };
    write(items, 'proj-12.json', textFor('proj-12.json', item));
    assert.equal(proposed(listCheck(dir, '--issues', items), LOCAL), fieldLine(LOCAL, items, 'proj-12.json'));
    rmSync(join(items, 'proj-12.json'));
    write(items, 'proj-12.yaml', textFor('proj-12.yaml', item));
    const r = listCheck(dir, '--issues', items);
    assert.equal(proposed(r, LOCAL), fieldLine(LOCAL, items, 'proj-12.yaml'), show(r));
  });

  test('the field design, a list of paths, in a .yml file: each path is a proposed design document (control: the same in JSON)', (t) => {
    const { dir, items } = designWorld(t);
    const item = { ref: 'PROJ-12', repository: 'PROJ', body: 'Stream the export.', design: [LOCAL, BATCH] };
    write(items, 'proj-12.json', textFor('proj-12.json', item));
    const control = listCheck(dir, '--issues', items);
    for (const path of [LOCAL, BATCH]) assert.equal(proposed(control, path), fieldLine(path, items, 'proj-12.json'));
    rmSync(join(items, 'proj-12.json'));
    write(items, 'proj-12.yml', textFor('proj-12.yml', item));
    const r = listCheck(dir, '--issues', items);
    for (const path of [LOCAL, BATCH]) assert.equal(proposed(r, path), fieldLine(path, items, 'proj-12.yml'), show(r));
  });

  for (const file of ['proj-12.yaml', 'proj-12.md']) {
    test(`a Design: line in the body of the item in ${file}: "design line in work item PROJ-12 (<folder>/${file})"; an item that no task names (PROJ-13) gives none (control: the same in JSON)`, (t) => {
      const { dir, items } = designWorld(t);
      const p12 = { ref: 'PROJ-12', repository: 'PROJ', body: `Stream the export.\n\nDesign: ${LOCAL}` };
      const p13 = { ref: 'PROJ-13', repository: 'PROJ', body: `Batch the export.\n\nDesign: ${BATCH}` };
      write(items, 'proj-12.json', textFor('proj-12.json', p12));
      write(items, 'proj-13.json', textFor('proj-13.json', p13));
      const control = listCheck(dir, '--issues', items);
      assert.equal(proposed(control, LOCAL), bodyLine(LOCAL, items, 'proj-12.json'));
      notProposed(control, BATCH);
      rmSync(join(items, 'proj-12.json'));
      rmSync(join(items, 'proj-13.json'));
      const ext = file.slice(file.indexOf('.'));
      write(items, file, textFor(file, p12));
      write(items, `proj-13${ext}`, textFor(`proj-13${ext}`, p13));
      const r = listCheck(dir, '--issues', items);
      assert.equal(proposed(r, LOCAL), bodyLine(LOCAL, items, file), show(r));
      notProposed(r, BATCH);
    });
  }
});

// =====================================================================
// D: items out of the CI token's reach.

const REACH_PREFIX = 'info issues-out-of-reach - - ';
const REACH_MIDDLE = ` out of the CI token's reach (items-out-of-reach in .assuredloop/config.yaml) are not in ${FOLDER}, so they are not checked, and al cannot tell whether they changed since the change relied on them: `;
const reachLines = (r) => r.stdout.split('\n').filter((l) => l.startsWith('info issues-out-of-reach '));
function reachLine(r) {
  const found = reachLines(r);
  assert.equal(found.length, 1, `one info issues-out-of-reach line:\n${show(r)}`);
  return found[0];
}
const setReach = (w, value) => {
  const cfg = { docs: [{ file: SPEC, prefix: 'INV' }], ...(w.extraConfig ?? {}) };
  if (value !== undefined) cfg['items-out-of-reach'] = value;
  writeYaml(w.dir, CONFIG, cfg);
};
// The findings that are about the tasks of these IDs: issue-missing and issue-changed.
const aboutTasks = (r, ids) => r.findings.filter((f) => ['issue-missing', 'issue-changed'].includes(f.code) && ids.includes(f.id));

describe('D: items-out-of-reach in .assuredloop/config.yaml', () => {
  const REACH_TASKS = [
    { id: 'T1', ref: '#31' }, { id: 'T2', ref: 'PROJ-12' }, { id: 'T3', ref: 'zeta/plans#4' }, { id: 'T4', ref: 'acme/web#9' },
    { id: 'T5', ref: 'zeta/plans#4' }, { id: 'T6', ref: 'zeta/plans#6' },
  ];
  const OUT = [`${NAME}/T2`, `${NAME}/T3`, `${NAME}/T5`, 'pay/T1'];
  const reachWorld = (t) => {
    const w = world(t, { tasks: REACH_TASKS, second: { name: 'pay', tasks: [{ id: 'T1', ref: 'PROJ-12' }] } });
    save(w, { 'a.json': own(31), 'zeta-6.json': { number: 6, repository: 'zeta/plans', body: 'We keep ADR-1.\n' } });
    return w;
  };

  test('two items named, not in the folder: no issue-missing and no issue-changed for their tasks; one line that names each item once with its tasks; the item not named still gets issue-missing; the named item in the folder is read (control: no setting)', (t) => {
    const w = reachWorld(t);
    const control = checked(w, ...ISSUES);
    for (const id of OUT) {
      assert.ok(aboutTasks(control, [id]).some((f) => f.code === 'issue-missing'), `control: issue-missing for ${id}:\n${show(control)}`);
      if (id === `${NAME}/T2` || id === `${NAME}/T3`) assert.ok(aboutTasks(control, [id]).some((f) => f.code === 'issue-changed'), `control: issue-changed for ${id}:\n${show(control)}`);
    }
    assert.deepEqual(reachLines(control), [], show(control));
    setReach(w, ['zeta/plans', 'PROJ-12']);
    const r = checked(w, ...ISSUES);
    assert.deepEqual(aboutTasks(r, OUT).map((f) => f.line), [], `no issue-missing and no issue-changed for the items out of reach:\n${show(r)}`);
    assert.equal(reachLine(r), `${REACH_PREFIX}2 items${REACH_MIDDLE}PROJ-12 (${NAME}/T2, pay/T1), zeta/plans#4 (${NAME}/T3, ${NAME}/T5)`, show(r));
    one(r, 'issue-missing', 'acme/web#9');
    one(r, 'issue-superseded', 'zeta/plans#6', 1);
    // The rest of the output is the control's, but the lines about those tasks and the one line.
    const rest = (x) => x.stdout.split('\n').filter((l) => !l.startsWith('info issues-out-of-reach ') && !l.startsWith('Not known')
      && !(findings(l)[0] && ['issue-missing', 'issue-changed'].includes(findings(l)[0].code) && OUT.includes(findings(l)[0].id)));
    assert.deepEqual(rest(r), rest(control), show(r));
  });

  test('without --issues: no issues-out-of-reach line and no line about items', (t) => {
    const w = reachWorld(t);
    setReach(w, ['zeta/plans', 'PROJ-12']);
    const r = checked(w);
    assert.deepEqual(reachLines(r), [], show(r));
    assert.deepEqual(r.findings.filter((f) => f.code.startsWith('issue')).map((f) => f.line), [], show(r));
  });

  test('every item named is in the folder, or the list is empty: no issues-out-of-reach line', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: '#31' }, { id: 'T2', ref: 'acme/web#5' }] });
    save(w, { 'a.json': own(31), 'b.json': ghItem('acme/web', 5, { body: 'See (#12).\n' }) });
    setReach(w, ['acme/web']);
    let r = checked(w, ...ISSUES);
    assert.deepEqual(reachLines(r), [], show(r));
    one(r, 'issue-bare-ref', 'acme/web#5', 1);
    setReach(w, []);
    rmSync(join(w.items, 'b.json'));
    r = checked(w, ...ISSUES);
    assert.deepEqual(reachLines(r), [], show(r));
    one(r, 'issue-missing', 'acme/web#5');
  });

  // Each form of an entry, with a task that writes the item the same way.
  const FORMS = [
    ['#n', '#40', 40, false],
    ['owner/repo#n', 'acme/web#5', 5, false],
    ['<name>#n of an outputs: entry', 'web#5', 5, true],
    ['a URL', 'https://github.com/acme/web/issues/8', 8, false],
    ['another tracker\'s key', 'PROJ-12', null, false],
  ];
  for (const [what, ref, n, outputs] of FORMS) {
    test(`an entry ${what} (${ref}), and a task that names that item, which is not in the folder: the line for 1 item names it; no issue-missing for it (control: no setting)`, (t) => {
      const w = world(t, { tasks: [{ id: 'T1', ref: '#31' }, { id: 'T2', ref }], outputs });
      if (outputs) w.extraConfig = { repo: 'invoicer', outputs: [{ name: 'web', path: '../web' }] };
      save(w, { 'a.json': own(31) });
      const control = checked(w, ...ISSUES);
      assert.ok(aboutTasks(control, [`${NAME}/T2`]).some((f) => f.code === 'issue-missing'), show(control));
      setReach(w, [ref]);
      const r = checked(w, ...ISSUES);
      const line = reachLine(r);
      assert.ok(line.startsWith(`${REACH_PREFIX}1 item`), show(r));
      assert.ok(n === null ? line.includes('PROJ-12') : namesItem(line, n), `the line names the item:\n${show(r)}`);
      assert.ok(line.includes(`${NAME}/T2`), show(r));
      assert.deepEqual(aboutTasks(r, [`${NAME}/T2`]).map((f) => f.line), [], show(r));
    });
  }

  test('an entry owner/repo names every item of it: acme/web#5, its URL form for #8 and web#6 are all out of reach; acme/web#7 in the folder is read as usual', (t) => {
    const tasks = [{ id: 'T1', ref: 'acme/web#5' }, { id: 'T2', ref: 'https://github.com/acme/web/issues/8' }, { id: 'T3', ref: 'web#6' }, { id: 'T4', ref: 'acme/web#7' }];
    const w = world(t, { tasks, outputs: true });
    w.extraConfig = { repo: 'invoicer', outputs: [{ name: 'web', path: '../web' }] };
    save(w, { 'w7.json': ghItem('acme/web', 7, { body: 'See (#12).\n' }) });
    setReach(w, ['acme/web']);
    const r = checked(w, ...ISSUES);
    const line = reachLine(r);
    assert.ok(line.startsWith(`${REACH_PREFIX}3 items${REACH_MIDDLE}`), show(r));
    const list = line.slice(`${REACH_PREFIX}3 items${REACH_MIDDLE}`.length);
    for (const [n, id] of [[5, 'T1'], [8, 'T2'], [6, 'T3']]) {
      assert.ok(namesItem(list, n), `the line names item ${n}:\n${show(r)}`);
      assert.ok(list.includes(`${NAME}/${id}`), `the line names ${NAME}/${id}:\n${show(r)}`);
    }
    assert.ok(!list.includes(`${NAME}/T4`), show(r));
    assert.deepEqual(aboutTasks(r, [`${NAME}/T1`, `${NAME}/T2`, `${NAME}/T3`]).map((f) => f.line), [], show(r));
    one(r, 'issue-bare-ref', 'acme/web#7', 1);
  });

  const BAD = [['a text', 'acme/web'], ['a number in the list', [42]], ['an empty text in the list', ['acme/web', '']], ['a list in the list', [['acme/web']]], ['a mapping', { repo: 'acme/web' }]];
  for (const [what, value] of BAD) {
    test(`a value that is not a list of non-empty texts (${what}): al check stops with exit 2, with and without --issues`, (t) => {
      const w = world(t);
      save(w, { 'a.json': own(31) });
      setReach(w, value);
      for (const args of [ISSUES, []]) {
        refused(w.dir, ['check', ...args], { env: w.gh.env });
        assert.deepEqual(w.gh.calls(), []);
      }
    });
  }
});
