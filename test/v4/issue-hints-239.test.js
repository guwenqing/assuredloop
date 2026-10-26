// #239: hints from the linked work items, and phrases for the review
// (requests/issue-hints/request.md R1 and R2, signed; decisions D6, D7 and
// D9 to D13; the change spec requests/issue-hints/spec.md SP-4 to SP-24).
//
// - R1: `al check --issues <folder>` reads the work items that the caller
//   saved in <folder> (*.json, gh's fields), for the tasks of the open
//   requests, and gives the hints issue-missing, issue-superseded,
//   issue-bare-ref, issue-not-sub, issue-unread and phrase. `al check`
//   never contacts a tracker. Without --issues it reads no item, and a
//   project with no tracker gets the same output as on main (D13).
// - R2: the `phrases:` of .assuredloop/config.yaml give the hint `phrase` in
//   the spec docs, the ADRs and the open requests (not origin/, not archived
//   requests, not the records), and with --issues in the items. A bad
//   `phrases:` is a refusal.
//
// #3 (requests/own-item/spec.md SP-7 to SP-9): the request's own item comes
// only from the file assuredloop-requests.json in the folder, never from an
// origin source. The tests here set it through that file; the new rules have
// their own tests in own-item-3.test.js.
//
// Each run has a PATH with a fake `gh` that only logs, and a folder of links
// to git and node only. Every run checks that al did not run gh (D9).
// Nothing here reads the code under test.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findings, invoicer, keys } from './helpers/invoicer.js';
import {
  BIN, EPOCH, REPO, al, commitAll, doc, editRecord, git, move, newRequest, ok, read, recordPath, refused, show, write, writeYaml,
} from './helpers/project.js';

// A folder that holds only links to the tools that al needs (git, node),
// so that no real gh can be on the PATH of a run, on any machine. A run's
// PATH is <the logging fake gh>:<this folder>, or this folder alone.
const TOOLS = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-239-tools-'));
process.on('exit', () => rmSync(TOOLS, { recursive: true, force: true }));
const gitPath = spawnSync('/bin/sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
assert.ok(gitPath, 'git is on the PATH of the test process');
symlinkSync(gitPath, join(TOOLS, 'git'));
symlinkSync(process.execPath, join(TOOLS, 'node'));
const SAFE_PATH = TOOLS;
const ghIn = (path) => spawnSync('/bin/sh', ['-c', 'command -v gh'], { env: { PATH: path }, encoding: 'utf8' }).stdout.trim();

const NAME = 'inv';
const OWN = 'acme/invoicer';
const OWN_REMOTE = 'git@github.com:acme/invoicer.git';
const OWN_ITEM = 'https://github.com/acme/invoicer/issues/7';
const SPEC = 'specs/invoices.md';
const REQUEST_MD = `requests/${NAME}/request.md`;
const FOLDER = '../items';
const ISSUES = ['--issues', FOLDER];
const NEW_CODES = ['issue-missing', 'issue-superseded', 'issue-bare-ref', 'issue-not-sub', 'issue-unread', 'phrase'];

// =====================================================================
// The fake gh: it only logs its calls. al must never run it (D9).

function fakeGh() {
  const bin = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-239-gh-'));
  const log = join(bin, 'calls.log');
  writeFileSync(join(bin, 'gh'), `#!/bin/sh\necho "$@" >> '${log}'\necho 'the fake gh: al must not run gh' >&2\nexit 1\n`);
  chmodSync(join(bin, 'gh'), 0o755);
  return { bin, env: { PATH: `${bin}:${SAFE_PATH}` }, calls: () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []) };
}

// =====================================================================
// Items, in the shape that `gh issue view --json number,url,body,comments,parent`
// prints (gh 2.102: the comment fields seen in a real call, the parent fields
// taken from the gh binary), and items of another tracker (SP-11).

const ghUrl = (repo, n, host = 'github.com') => `https://${host}/${repo}/issues/${n}`;
const ghParent = (key, host = 'github.com') => {
  const [repo, n] = key.split('#');
  return { id: `I_${n}`, number: Number(n), repository: { nameWithOwner: repo }, state: 'OPEN', title: `Issue ${n}`, url: ghUrl(repo, Number(n), host) };
};
// A GitHub item; parent: "owner/repo#n", null, or 'absent' for no parent field.
function ghItem(repo, n, { body = 'Nothing to hint.\n', comments = [], parent = `${OWN}#7`, host = 'github.com' } = {}) {
  const url = ghUrl(repo, n, host);
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
  if (parent !== 'absent') item.parent = parent === null ? null : ghParent(parent, host);
  return item;
}
const own = (n, opts) => ghItem(OWN, n, opts);

// =====================================================================
// The world: <root>/invoicer, a git repo whose origin remote is
// git@github.com:acme/invoicer.git (unless remote says otherwise), with the
// config, a spec with an ADR chain (ADR-1 superseded by ADR-2, superseded by
// ADR-3, accepted), and the open request inv. Its own item is
// acme/invoicer#7, unless ownItem says otherwise: the file
// <root>/items/assuredloop-requests.json names it (SP-7, SP-8 of #3). Its
// record has `tasks`, and an origin source for each url of `origins`.
// <root>/items is the folder of items. Optional: <root>/web, an output repo
// named `web` in the config; a second open request (its own item in the same
// file); an archived request `old` with its own tasks.

const adrFile = (status, marker, heading, rationale) => `Status: ${status}\n\n${doc([[marker, heading], [`${marker.split(' ')[0]}-1 rationale`, rationale]])}`;
const ADRS = {
  'specs/adr/0001-paper.md': adrFile('superseded by ADR-2', 'ADR-1 choice decides:INV-2', '# ADR-1: Paper invoices', 'Context: invoices were posted.'),
  'specs/adr/0002-pdf.md': adrFile('superseded by ADR-3', 'ADR-2 choice decides:INV-2 supersedes:ADR-1', '# ADR-2: PDF invoices', 'Context: postage cost too much.'),
  'specs/adr/0003-email.md': adrFile('accepted', 'ADR-3 choice decides:INV-2 supersedes:ADR-2', '# ADR-3: Invoices by email', 'Context: a PDF alone was not enough.'),
};
const ADR3 = 'specs/adr/0003-email.md';
const INV3 = 'Invoices are sent by email.';
const specText = (inv3 = INV3) => doc([
  ['INV-1 note', '# Invoices'],
  ['INV-2 rule governed-by:ADR-3', 'An invoice MUST be sent by email.'],
  ['INV-3 note', inv3],
]);
const WORDS = 'The owner wants the requester to see each invoice.\n';

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
  ok(dir, ['record', name, 'origin', '--url', url, '--from', '-', '--yes'], { input: text, env: { PATH: SAFE_PATH } });

// The file of own items in the folder (#3, SP-8): {request name: its own item}.
const OWN_ITEMS = 'assuredloop-requests.json';
const ownItems = (w, requests) =>
  write(w.items, OWN_ITEMS, `${JSON.stringify({ format: 'assuredloop-items/1', requests }, null, 2)}\n`);
// How many times the Not known line says that it does not know whether the
// items of the request are children of its own item (#3, SP-5: once).
const ownItemUnknown = (r, name) => notKnown(r).split(`whether the items of ${name} are children of its own item:`).length - 1;

function world(t, {
  tasks = [{ id: 'T1', ref: 'issue #31' }], ownItem = OWN_ITEM, origins = [], remote = OWN_REMOTE, outputs = false, config = {}, archived = null, second = null,
} = {}) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-239-'));
  const gh = fakeGh();
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(gh.bin, { recursive: true, force: true });
  });
  const dir = join(root, 'invoicer');
  const web = join(root, 'web');
  const items = join(root, 'items');
  mkdirSync(items);
  initRepo(dir, remote);
  const cfg = { docs: [{ file: SPEC, prefix: 'INV' }], ...config };
  if (outputs) {
    initRepo(web, 'https://github.com/acme/web.git');
    write(web, 'README.md', '# Web\n');
    commitAll(web, 'Start the web repo');
    Object.assign(cfg, { repo: 'invoicer', outputs: [{ name: 'web', path: '../web' }] });
  }
  writeYaml(dir, '.assuredloop/config.yaml', cfg);
  write(dir, SPEC, specText());
  for (const [file, text] of Object.entries(ADRS)) write(dir, file, text);
  newRequest(dir, NAME, WORDS);
  for (const url of origins) addOrigin(dir, NAME, url);
  editRecord(dir, NAME, (rec) => { rec.tasks = tasks; });
  if (second) {
    newRequest(dir, second.name, `The owner wants ${second.name}.\n`);
    editRecord(dir, second.name, (rec) => { rec.tasks = second.tasks; });
  }
  if (archived) {
    newRequest(dir, 'old', WORDS);
    write(dir, 'requests/old/request.md', `${read(dir, 'requests/old/request.md')}\n${archived.text ?? ''}\n`);
    editRecord(dir, 'old', (rec) => { rec.tasks = archived.tasks ?? []; rec.status = 'concluded'; });
    move(dir, 'requests/old', 'requests/archive/old');
  }
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  const w = { root, dir, web, items, gh };
  const named = {};
  if (ownItem) named[NAME] = ownItem;
  if (second?.ownItem) named[second.name] = second.ownItem;
  if (Object.keys(named).length) ownItems(w, named);
  return w;
}

// Item files in the folder: {file name: an item, a list, or a string as written}.
function save(w, files) {
  for (const [name, value] of Object.entries(files)) {
    write(w.items, name, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
  }
}

// One run of al check in the world, with the logging gh first on PATH; al never runs gh.
function check(w, ...args) {
  const r = al(w.dir, ['check', ...args], { env: w.gh.env });
  assert.deepEqual(w.gh.calls(), [], `al ran gh:\n${show(r)}`);
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
const newFindings = (r) => r.findings.filter((f) => NEW_CODES.includes(f.code));
const notOk = (r) => r.findings.filter((f) => f.severity === 'not ok');
const notKnown = (r) => r.stdout.split('\n').find((l) => l.startsWith('Not known')) ?? '';
const infoIssues = (r) => r.findings.filter((f) => f.severity === 'info' && f.code === 'issues');
function assertInfo(r, c, folder = FOLDER) {
  const found = infoIssues(r);
  assert.equal(found.length, 1, `one info issues line:\n${show(r)}`);
  assert.equal(found[0].file, '-', show(r));
  assert.equal(found[0].id, '-', show(r));
  assert.equal(found[0].msg, `checked ${c} items for the tasks of the open requests, from ${folder}`, show(r));
}
// The 1-based line of the nth occurrence (from 0) of needle in text.
function lineOf(text, needle, nth = 0) {
  let at = -1;
  for (let i = 0; i <= nth; i++) {
    at = text.indexOf(needle, at + 1);
    assert.ok(at >= 0, `"${needle}" occurs ${nth + 1} times in:\n${text}`);
  }
  return text.slice(0, at).split('\n').length;
}
// The one finding of code at file (and at line, when given; null for no line).
function one(r, code, file, at) {
  const found = coded(r, code).filter((f) => f.file === file && (at === undefined || f.at === at));
  assert.equal(found.length, 1, `one ${code} at ${file}${at === undefined ? '' : `:${at}`}:\n${show(r)}`);
  assert.equal(found[0].severity, 'hint', show(r));
  return found[0];
}
const where = (f) => (f.at === null ? f.file : `${f.file}:${f.at}`);
const sorted = (list) => [...list].sort();

test('the test setup: the tools folder holds git and no gh; with the fake first on PATH, gh is the fake', (t) => {
  assert.equal(ghIn(SAFE_PATH), '', `a gh in ${SAFE_PATH} would hide a gh call`);
  assert.equal(spawnSync('git', ['--version'], { env: { PATH: SAFE_PATH }, encoding: 'utf8' }).status, 0, 'git runs from the tools folder');
  const gh = fakeGh();
  t.after(() => rmSync(gh.bin, { recursive: true, force: true }));
  assert.equal(ghIn(gh.env.PATH), join(gh.bin, 'gh'));
});

// =====================================================================
// R1: without --issues, and D13.

describe('R1 (SP-5): without --issues, al check reads no item and gives no line about items', () => {
  test('tasks name items, and the folder holds them with ADR-1 and bare refs: plain and --strict give no item finding and no info issues line', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: 'issue #31' }, { id: 'T2', ref: 'acme/web#5' }, { id: 'T3', ref: 'acme/web#6' }] });
    save(w, { 'a.json': own(31, { body: 'We keep ADR-1.\n', parent: null }), 'b.json': ghItem('acme/web', 5, { body: 'See (#12).\n' }) });
    for (const args of [[], ['--strict']]) {
      const r = check(w, ...args);
      assert.notEqual(r.code, 2, show(r));
      assert.deepEqual(newFindings(r).map((f) => f.line), [], show(r));
      assert.deepEqual(infoIssues(r), [], show(r));
    }
    // Control: the same world with --issues gives item findings.
    assert.ok(newFindings(checked(w, ...ISSUES)).length > 0);
  });
});

// The al of main (the merge-base of HEAD and origin/main), from git archive,
// with this clone's node_modules linked in. Built once in this test process.
let mainBin = null;
function mainAl() {
  if (mainBin) return mainBin;
  let base;
  try { base = git(REPO, 'merge-base', 'HEAD', 'origin/main'); } catch { base = git(REPO, 'merge-base', 'HEAD', 'main'); }
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-239-main-'));
  process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
  const r = spawnSync('/bin/sh', ['-c', `git -C '${REPO}' archive '${base}' | tar -x -C '${dir}'`], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'));
  mainBin = join(dir, 'bin/al.js');
  assert.ok(existsSync(mainBin), mainBin);
  return mainBin;
}
// The environment of the al helper, for both binaries.
function runBin(bin, dir, args, path) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_') && k !== 'SOURCE_DATE_EPOCH') env[k] = v;
  Object.assign(env, {
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', SOURCE_DATE_EPOCH: String(EPOCH), PATH: path,
  });
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
// #68: al check prints the map of the change, which main did not print: one
// block of lines right after the list block and right before the Read line. Its
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
  assert.ok(LIST_LINE.test(ls[at[0] - 1] ?? ''), `the map comes right after the list block:\n${stdout}`);
  assert.match(ls[at.at(-1) + 1] ?? '', /^Read /, `the map comes right before the Read line:\n${stdout}`);
  const firstList = ls.findIndex((l) => LIST_LINE.test(l));
  for (const i of hints) assert.ok(i < firstList, `a map hint is a findings line, before the list:\n${stdout}`);
  return { rest: ls.filter((_, i) => !at.includes(i) && !hints.includes(i)).join('\n'), map: at.map((i) => ls[i]) };
}
// Every line that main printed, in the same order, and the same exit code;
// the list of #58 is there (its grouped line or its "no change selected"
// line), and, once main prints a list too, it is the same list. The map of
// #68 is taken out first.
function sameAsMainOutput(here, main, args) {
  const hm = withoutMap(here.stdout);
  const mm = withoutMap(main.stdout);
  assert.ok(hm.map.length > 0, `al ${args.join(' ')}: the map of #68:\n${here.stdout}`);
  if (mm.map.length > 0) assert.deepEqual(hm.map, mm.map, `al ${args.join(' ')}: the same map as on main`);
  const h = withoutList(hm.rest);
  const m = withoutList(mm.rest);
  assert.equal(h.rest, m.rest, `al ${args.join(' ')}: the same output as on main, but the list of #58`);
  assert.ok(h.list.some((l) => /^(list: no change selected: |\d+ further items in force: )/.test(l)), `al ${args.join(' ')}: the list of #58:\n${here.stdout}`);
  if (m.list.length > 0) assert.deepEqual(h.list, m.list, `al ${args.join(' ')}: the same list as on main`);
  assert.equal(here.code, main.code, `al ${args.join(' ')}: the same exit code as on main`);
}
function sameAsMain(t, dir, path) {
  for (const args of [['check'], ['check', '--strict']]) {
    const here = runBin(BIN, dir, args, path);
    const main = runBin(mainAl(), dir, args, path);
    sameAsMainOutput(here, main, args);
  }
}

describe('R1 (SP-5, D13): a project with no tracker gets, without --issues, exactly the output of main', () => {
  test('the world with no tasks and no origin remote', (t) => {
    const w = world(t, { tasks: [], ownItem: null, remote: null });
    sameAsMain(t, w.dir, w.gh.env.PATH);
    assert.deepEqual(w.gh.calls(), []);
  });

  test('the world with no tasks, with an origin remote and an issue url as an origin source', (t) => {
    const w = world(t, { tasks: [], origins: [OWN_ITEM] });
    sameAsMain(t, w.dir, w.gh.env.PATH);
    assert.deepEqual(w.gh.calls(), []);
  });

  test('the invoicer worlds clean and d05 (defect), with many other findings', (t) => {
    const gh = fakeGh();
    t.after(() => rmSync(gh.bin, { recursive: true, force: true }));
    sameAsMain(t, invoicer(t, 'clean'), gh.env.PATH);
    sameAsMain(t, invoicer(t, 'd05', 'defect'), gh.env.PATH);
    assert.deepEqual(gh.calls(), []);
  });

  test('tasks that name items, without --issues: the same output as on main (SP-5: no line about items)', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: 'issue #31' }, { id: 'T2', ref: 'PROJ-12' }] });
    save(w, { 'a.json': own(31, { body: 'We keep ADR-1.\n' }) });
    sameAsMain(t, w.dir, w.gh.env.PATH);
    assert.deepEqual(w.gh.calls(), []);
  });
});

// =====================================================================
// R1: which items (SP-8, SP-9, SP-12).

describe('R1 (SP-8, SP-9): the items that the tasks name', () => {
  test('each form of SP-8 names its item: #n, owner/repo#n, a URL on any host, <name>#n of an outputs: entry, and the ref of an item as a whole word', (t) => {
    const w = world(t, {
      outputs: true,
      tasks: [
        { id: 'T1', ref: 'tasks.md T1; issue #31' },
        { id: 'T2', ref: 'acme/other#4' },
        { id: 'T3', ref: 'https://github.example.com/acme/other/issues/9' },
        { id: 'T4', ref: 'web#5' },
        { id: 'T5', ref: 'Build the export, PROJ-12.' },
      ],
    });
    const body = 'We keep ADR-1.\n';
    save(w, {
      'invoicer-31.json': own(31, { body }),
      'other-4.json': ghItem('acme/other', 4, { body }),
      'other-9.json': ghItem('acme/other', 9, { body, host: 'github.example.com' }),
      'web-5.json': ghItem('acme/web', 5, { body }),
      'proj-12.json': { ref: 'PROJ-12', repository: 'PROJ', body, parent: null },
    });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(sorted(coded(r, 'issue-superseded').map((f) => `${f.file} ${f.id}`)), sorted([
      `${OWN}#31 ${NAME}/T1`, `acme/other#4 ${NAME}/T2`, `acme/other#9 ${NAME}/T3`, `acme/web#5 ${NAME}/T4`, `PROJ-12 ${NAME}/T5`,
    ]), show(r));
    assert.deepEqual(coded(r, 'issue-missing'), [], show(r));
    assertInfo(r, 5);
  });

  test('a task whose ref names no item in the folder gets issue-missing at the request\'s record: a title, PROJ-123 (not the whole word PROJ-12), mobile#6 (a name the config does not list)', (t) => {
    const w = world(t, {
      tasks: [{ id: 'T1', ref: '#31' }, { id: 'T2', ref: 'Send the reminder' }, { id: 'T3', ref: 'PROJ-123' }, { id: 'T4', ref: 'mobile#6' }],
    });
    save(w, { 'a.json': own(31), 'b.json': { ref: 'PROJ-12', repository: 'PROJ', body: 'x\n' }, 'c.json': own(6) });
    const r = checked(w, ...ISSUES);
    const missing = coded(r, 'issue-missing');
    assert.deepEqual(sorted(missing.map((f) => f.id)), [`${NAME}/T2`, `${NAME}/T3`, `${NAME}/T4`], show(r));
    for (const f of missing) {
      assert.equal(f.file, recordPath(NAME), show(r));
      assert.equal(f.severity, 'hint', show(r));
    }
  });

  test('an item that a task names and that is not in the folder: issue-missing at the reference as the task wrote it', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: '#31' }, { id: 'T2', ref: 'acme/web#5' }, { id: 'T3', ref: 'https://github.com/acme/web/issues/8' }] });
    save(w, { 'a.json': own(31) });
    const r = checked(w, ...ISSUES);
    assert.equal(one(r, 'issue-missing', 'acme/web#5').id, `${NAME}/T2`, show(r));
    assert.equal(one(r, 'issue-missing', 'https://github.com/acme/web/issues/8').id, `${NAME}/T3`, show(r));
    assert.equal(coded(r, 'issue-missing').length, 2, show(r));
    assertInfo(r, 1);
  });

  test('an item that two tasks name, and two references in one ref, are checked once; its hints carry the ID of the first task', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: 'issue #31; issue #32' }, { id: 'T2', ref: '#31' }, { id: 'T3', ref: 'https://github.com/acme/invoicer/issues/32' }] });
    save(w, { 'a.json': own(31, { body: 'We keep ADR-1.\n' }), 'b.json': own(32) });
    const r = checked(w, ...ISSUES);
    assert.equal(one(r, 'issue-superseded', `${OWN}#31`, 1).id, `${NAME}/T1`, show(r));
    assert.equal(coded(r, 'issue-superseded').length, 1, show(r));
    assertInfo(r, 2);
  });

  test('an archived request is history: its tasks are not read, so its item gets no hint and its missing item no issue-missing', (t) => {
    const w = world(t, { archived: { tasks: [{ id: 'T1', ref: 'issue #40' }, { id: 'T2', ref: 'issue #41' }] } });
    save(w, { 'a.json': own(31), 'b.json': own(40, { body: 'We keep ADR-1.\n', parent: null }) });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(newFindings(r).map((f) => f.line), [], show(r));
    assertInfo(r, 1);
  });

  test('the items that no task names are not checked, and the Not known line counts them', (t) => {
    const w = world(t);
    save(w, { 'a.json': own(31) });
    const control = checked(w, ...ISSUES);
    save(w, { 'b.json': own(50, { body: 'We keep ADR-1.\n', parent: null }), 'c.json': ghItem('acme/web', 51, { body: 'See (#12).\n' }) });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(newFindings(r).map((f) => f.line), [], show(r));
    assertInfo(r, 1);
    assert.notEqual(notKnown(r), notKnown(control), show(r));
    assert.match(notKnown(r), /\b2\b/, `the Not known line counts the 2 items:\n${show(r)}`);
  });
});

describe('R1 (SP-11, SP-12): the folder and the format of an item', () => {
  test('a file that holds a list of items, as gh issue list prints it: each item is checked', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: '#31' }, { id: 'T2', ref: 'PROJ-12' }] });
    save(w, { 'list.json': [own(31, { body: 'We keep ADR-1.\n' }), { ref: 'PROJ-12', repository: 'PROJ', body: 'Intro.\n\nWe keep ADR-1.\n' }] });
    const r = checked(w, ...ISSUES);
    one(r, 'issue-superseded', `${OWN}#31`, 1);
    one(r, 'issue-superseded', 'PROJ-12', 3);
    assertInfo(r, 2);
  });

  test('an item with a number and a repository, and no url, has the key owner/repo#n', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: 'acme/web#5' }] });
    save(w, { 'a.json': { number: 5, repository: 'acme/web', body: 'We keep ADR-1.\n' } });
    const r = checked(w, ...ISSUES);
    one(r, 'issue-superseded', 'acme/web#5', 1);
    assertInfo(r, 1);
  });

  test('only *.json files of the folder are read, not its subfolders: an item in sub/ or in a .txt file is missing', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: '#31' }, { id: 'T2', ref: '#33' }, { id: 'T3', ref: '#34' }] });
    save(w, { 'a.json': own(31), 'sub/b.json': own(33), 'c.txt': own(34) });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(sorted(coded(r, 'issue-missing').map((f) => f.id)), [`${NAME}/T2`, `${NAME}/T3`], show(r));
    assertInfo(r, 1);
  });

  test('a file that is not valid JSON: issue-unread at the file, the Not known line names it; the other files are read; exit 0, plain and --strict', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: '#31' }] });
    save(w, { 'a.json': own(31, { body: 'We keep ADR-1.\n' }), 'bad.json': '{"number": 32, "body": \n' });
    for (const args of [ISSUES, [...ISSUES, '--strict']]) {
      const r = checked(w, ...args);
      const unread = coded(r, 'issue-unread');
      assert.equal(unread.length, 1, show(r));
      assert.ok(unread[0].file.endsWith('bad.json'), show(r));
      assert.equal(unread[0].severity, 'hint', show(r));
      assert.ok(notKnown(r).includes('bad.json'), show(r));
      one(r, 'issue-superseded', `${OWN}#31`, 1);
    }
  });

  test('entries that are not items (no body; a number with no repository; not an object): issue-unread at the file', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: '#31' }] });
    save(w, {
      'a.json': own(31),
      'nobody.json': { number: 40, url: ghUrl(OWN, 40) },
      'norepo.json': { number: 41, body: 'x\n' },
      'list.json': [42, 'text'],
    });
    const r = checked(w, ...ISSUES);
    const unread = coded(r, 'issue-unread');
    for (const name of ['nobody.json', 'norepo.json', 'list.json']) {
      assert.ok(unread.some((f) => f.file.endsWith(name)), `issue-unread at ${name}:\n${show(r)}`);
      assert.ok(notKnown(r).includes(name), show(r));
    }
    assertInfo(r, 1);
  });

  test('a folder that is not there: a refusal, exit 2, with a line that names it', (t) => {
    const w = world(t);
    const r = refused(w.dir, ['check', '--issues', '../nope'], { env: w.gh.env });
    assert.match(r.stdout.split('\n').find((l) => l.startsWith('al: ')), /\.\.\/nope/, show(r));
    assert.deepEqual(w.gh.calls(), []);
  });

  test('a folder with no file: each named item is missing; info checked 0 items', (t) => {
    const w = world(t);
    const r = checked(w, ...ISSUES);
    assert.equal(coded(r, 'issue-missing').length, 1, show(r));
    assertInfo(r, 0);
  });
});

// =====================================================================
// R1: issue-superseded (the rule of hints-and-blocks R5, schema.md 5).

describe('R1 (SP-4, SP-13): issue-superseded, an item that names a superseded ADR without the ADR that supersedes it', () => {
  test('the body names ADR-1 alone: hint at acme/invoicer#31:<the first line of the paragraph>, ID inv/T1, naming ADR-1; a hint, not not ok', (t) => {
    const w = world(t);
    save(w, { 'a.json': own(31, { body: 'Some intro.\n\nWe keep\nthe old ADR-1 for now.\n' }) });
    const r = checked(w, ...ISSUES);
    const f = one(r, 'issue-superseded', `${OWN}#31`, 3);
    assert.equal(f.id, `${NAME}/T1`, show(r));
    assert.match(f.msg, /\bADR-1\b/, show(r));
    assert.deepEqual(notOk(r).map((x) => x.line), [], show(r));
  });

  test('control: ADR-1 with its successors ADR-2 and ADR-3 in the same paragraph: none; ADR-10 names no ADR-1', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: '#31' }, { id: 'T2', ref: '#32' }] });
    save(w, { 'a.json': own(31, { body: 'ADR-1 gave way to ADR-2,\nand ADR-2 to ADR-3.\n' }), 'b.json': own(32, { body: 'ADR-10 is not written yet.\n' }) });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(coded(r, 'issue-superseded'), [], show(r));
    assertInfo(r, 2);
  });

  test('the successor in another paragraph does not count: one hint, at the paragraph of ADR-1', (t) => {
    const w = world(t);
    save(w, { 'a.json': own(31, { body: 'We keep ADR-1.\n\nADR-2 and ADR-3 came later.\n' }) });
    const r = checked(w, ...ISSUES);
    assert.equal(coded(r, 'issue-superseded').length, 1, show(r));
    assert.match(one(r, 'issue-superseded', `${OWN}#31`, 1).msg, /\bADR-1\b/, show(r));
  });

  test('the chain: ADR-1 with ADR-2 names ADR-2, which ADR-3 supersedes: one hint, naming ADR-2', (t) => {
    const w = world(t);
    save(w, { 'a.json': own(31, { body: 'ADR-1 gave way to ADR-2.\n' }) });
    const r = checked(w, ...ISSUES);
    assert.equal(coded(r, 'issue-superseded').length, 1, show(r));
    assert.match(one(r, 'issue-superseded', `${OWN}#31`, 1).msg, /\bADR-2\b/, show(r));
  });

  test('a visible comment names ADR-1 alone: hint at acme/invoicer#31/comment-3:<line>, where k counts the hidden comment 2; the same text in the hidden comment 2 gives none', (t) => {
    const w = world(t);
    save(w, { 'a.json': own(31, { comments: [{ body: 'Agreed.\n' }, { body: 'We keep ADR-1.\n', hidden: true }, { body: 'Thanks.\n\nWe keep ADR-1.\n' }] }) });
    const r = checked(w, ...ISSUES);
    assert.equal(coded(r, 'issue-superseded').length, 1, show(r));
    assert.equal(one(r, 'issue-superseded', `${OWN}#31/comment-3`, 3).id, `${NAME}/T1`, show(r));
  });

  test('a comment of another tracker\'s item, with isMinimized false: hint at PROJ-12/comment-1:<line>', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: 'PROJ-12' }] });
    save(w, { 'a.json': { ref: 'PROJ-12', repository: 'PROJ', body: 'Build it.\n', comments: [{ body: 'We keep ADR-1.', isMinimized: false }] } });
    const r = checked(w, ...ISSUES);
    one(r, 'issue-superseded', 'PROJ-12/comment-1', 1);
  });
});

// several-successors/R1 (SCH-37): ADR-1 superseded by two ADRs. The items
// follow every listed successor, as the spec does.
describe('several-successors/R1 (SCH-37): issue-superseded with a status line that names several ADRs', () => {
  test('ADR-1 superseded by ADR-2, ADR-4: an item that names ADR-1 and only ADR-4 gives none; one that names neither successor gives the hint, naming ADR-1', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: '#31' }, { id: 'T2', ref: '#32' }] });
    write(w.dir, 'specs/adr/0001-paper.md', adrFile('superseded by ADR-2, ADR-4', 'ADR-1 choice decides:INV-2', '# ADR-1: Paper invoices', 'Context: invoices were posted.'));
    write(w.dir, 'specs/adr/0004-portal.md', adrFile('accepted', 'ADR-4 choice decides:INV-2 supersedes:ADR-1', '# ADR-4: Invoices on a portal', 'Context: customers want a portal.'));
    save(w, { 'a.json': own(31, { body: 'ADR-1 gave way to ADR-4.\n' }), 'b.json': own(32, { body: 'We keep ADR-1.\n' }) });
    const r = checked(w, ...ISSUES);
    assert.equal(coded(r, 'issue-superseded').length, 1, show(r));
    assert.match(one(r, 'issue-superseded', `${OWN}#32`, 1).msg, /\bADR-1\b/, show(r));
    assert.deepEqual(notOk(r).map((x) => x.line), [], show(r));
    assertInfo(r, 2);
  });
});

// =====================================================================
// R1: issue-bare-ref (SP-13, SP-14, SP-22).

const NOT_BARE = [
  'In a#12 a letter comes first.',
  'In 9#12 a digit comes first.',
  'In _#12 an underscore comes first.',
  'In -#12 a hyphen comes first.',
  'In acme/invoicer#12 a repository comes first.',
  'In web#12 a name comes first.',
  'In ##12 a hash comes first.',
  'In &#12; an ampersand comes first.',
  'In #abc no digit comes after.',
].join('\n');
const BARE = '#12 and (#13) are the cause.\nNo reference here.\nSee (#14).\n';

describe('R1 (SP-4, SP-14): issue-bare-ref, a bare #n in an item of another repository', () => {
  test('an item of acme/web: one hint for each line that holds a bare #n, at acme/web#5:<line>, ID inv/T1; control: the same body in an item of the request\'s own repository gives none', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: 'acme/web#5' }, { id: 'T2', ref: '#31' }] });
    save(w, { 'a.json': ghItem('acme/web', 5, { body: BARE }), 'b.json': own(31, { body: BARE }) });
    const r = checked(w, ...ISSUES);
    const found = coded(r, 'issue-bare-ref');
    assert.deepEqual(sorted(found.map(where)), ['acme/web#5:1', 'acme/web#5:3'], show(r));
    for (const f of found) {
      assert.equal(f.id, `${NAME}/T1`, show(r));
      assert.equal(f.severity, 'hint', show(r));
    }
  });

  test('not bare: #n after a letter, a digit, _, -, /, # or &, and # with no digit: none; control: a bare (#14) added gives one, at its line', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: 'acme/web#5' }] });
    save(w, { 'a.json': ghItem('acme/web', 5, { body: `${NOT_BARE}\n` }) });
    assert.deepEqual(coded(checked(w, ...ISSUES), 'issue-bare-ref'), []);
    save(w, { 'a.json': ghItem('acme/web', 5, { body: `${NOT_BARE}\nSee (#14).\n` }) });
    one(checked(w, ...ISSUES), 'issue-bare-ref', 'acme/web#5', 10);
  });

  test('a bare #12 in a visible comment: hint at acme/web#5/comment-2:<line>; in the hidden comment 1: none', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: 'https://github.com/acme/web/issues/5' }] });
    save(w, { 'a.json': ghItem('acme/web', 5, { comments: [{ body: 'Old: (#11).\n', hidden: true }, { body: 'Now:\nsee (#12).\n' }] }) });
    const r = checked(w, ...ISSUES);
    assert.equal(coded(r, 'issue-bare-ref').length, 1, show(r));
    one(r, 'issue-bare-ref', 'acme/web#5/comment-2', 2);
  });

  test('the same repository ignoring case: origin git@github.com:Acme/Invoicer.git and an item of acme/invoicer: none; control: an item of acme/web: one', (t) => {
    const w = world(t, { remote: 'git@github.com:Acme/Invoicer.git', tasks: [{ id: 'T1', ref: '#31' }, { id: 'T2', ref: 'acme/web#5' }] });
    save(w, { 'a.json': own(31, { body: 'See (#12).\n' }), 'b.json': ghItem('acme/web', 5, { body: 'See (#12).\n' }) });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(coded(r, 'issue-bare-ref').map(where), ['acme/web#5:1'], show(r));
  });

  for (const remote of ['git@github.example.com:acme/invoicer.git', 'https://github.example.com/acme/invoicer.git', 'ssh://git@github.example.com/acme/invoicer.git']) {
    test(`GitHub Enterprise, origin ${remote}: an item of acme/web on that host gets the hint; an item of acme/invoicer on that host gets none`, (t) => {
      const w = world(t, {
        remote,
        ownItem: 'https://github.example.com/acme/invoicer/issues/7',
        tasks: [{ id: 'T1', ref: 'https://github.example.com/acme/invoicer/issues/31' }, { id: 'T2', ref: 'https://github.example.com/acme/web/issues/5' }],
      });
      const host = 'github.example.com';
      save(w, {
        'a.json': ghItem(OWN, 31, { body: 'See (#12).\n', host, parent: `${OWN}#7` }),
        'b.json': ghItem('acme/web', 5, { body: 'See (#12).\n', host, parent: `${OWN}#7` }),
      });
      const r = checked(w, ...ISSUES);
      assert.deepEqual(coded(r, 'issue-bare-ref').map(where), ['acme/web#5:1'], show(r));
      assert.deepEqual(coded(r, 'issue-missing'), [], show(r));
      assert.deepEqual(coded(r, 'issue-not-sub'), [], show(r));
      assert.equal(ownItemUnknown(r, NAME), 0, `the own item is known:\n${show(r)}`);
    });
  }

  test('the request\'s own repository is not known (no origin remote; a remote in none of the three forms): no issue-bare-ref, and the Not known line says why', (t) => {
    const tasks = [{ id: 'T1', ref: 'acme/web#5' }];
    const files = { 'a.json': ghItem('acme/web', 5, { body: 'See (#12).\n' }) };
    const w0 = world(t, { tasks });
    save(w0, files);
    const control = checked(w0, ...ISSUES);
    one(control, 'issue-bare-ref', 'acme/web#5', 1);
    for (const remote of [null, '/srv/git/invoicer.git']) {
      const w = world(t, { tasks, remote });
      save(w, files);
      const r = checked(w, ...ISSUES);
      assert.deepEqual(coded(r, 'issue-bare-ref'), [], `remote ${remote}:\n${show(r)}`);
      assertInfo(r, 1);
      assert.notEqual(notKnown(r), notKnown(control), `the Not known line says why there is no issue-bare-ref:\n${show(r)}`);
    }
  });

  test('an item\'s repository is not known (a ref, no repository, no url): no issue-bare-ref, and the Not known line says why; control: with repository acme/web, one', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: 'PROJ-12' }] });
    save(w, { 'a.json': { ref: 'PROJ-12', repository: 'acme/web', body: 'See (#12).\n' } });
    const control = checked(w, ...ISSUES);
    one(control, 'issue-bare-ref', 'PROJ-12', 1);
    save(w, { 'a.json': { ref: 'PROJ-12', body: 'See (#12).\n' } });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(coded(r, 'issue-bare-ref'), [], show(r));
    assertInfo(r, 1);
    assert.notEqual(notKnown(r), notKnown(control), `the Not known line says why:\n${show(r)}`);
  });
});

// =====================================================================
// R1: issue-not-sub (SP-10, SP-13).

describe('R1 (SP-4, SP-10): issue-not-sub, an item that is not a child of the request\'s own item', () => {
  test('own item acme/invoicer#7: #31 (its child) none; #32 (parent null), #33 (parent #8), #34 (parent acme/other#7) one hint each, at the key; #7 itself none', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: '#31' }, { id: 'T2', ref: '#32' }, { id: 'T3', ref: '#33' }, { id: 'T4', ref: '#7' }, { id: 'T5', ref: '#34' }] });
    save(w, {
      '31.json': own(31), '32.json': own(32, { parent: null }), '33.json': own(33, { parent: `${OWN}#8` }),
      '7.json': own(7, { parent: null }), '34.json': own(34, { parent: 'acme/other#7' }),
    });
    const r = checked(w, ...ISSUES);
    const found = coded(r, 'issue-not-sub');
    assert.deepEqual(sorted(found.map((f) => `${where(f)} ${f.id}`)), sorted([`${OWN}#32 ${NAME}/T2`, `${OWN}#33 ${NAME}/T3`, `${OWN}#34 ${NAME}/T5`]), show(r));
    for (const f of found) assert.equal(f.severity, 'hint', show(r));
    assertInfo(r, 5);
  });

  test('a parent named by its number only is in the item\'s repository: {number: 7} is a child, {number: 8} is not', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: '#31' }, { id: 'T2', ref: '#32' }] });
    save(w, { 'a.json': { ...own(31), parent: { number: 7 } }, 'b.json': { ...own(32), parent: { number: 8 } } });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(coded(r, 'issue-not-sub').map((f) => `${where(f)} ${f.id}`), [`${OWN}#32 ${NAME}/T2`], show(r));
  });

  test('#3: an origin source url names no own item: sources with a note url, issue 7 and issue 8, and no file of own items: no issue-not-sub, and the Not known line says so once; control: the file names issue 7, then issue 8', (t) => {
    const w = world(t, {
      ownItem: null,
      origins: ['https://example.com/notes', OWN_ITEM, 'https://github.com/acme/invoicer/issues/8'],
      tasks: [{ id: 'T1', ref: '#31' }, { id: 'T2', ref: '#33' }],
    });
    save(w, { 'a.json': own(31), 'b.json': own(33, { parent: `${OWN}#8` }) });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(coded(r, 'issue-not-sub'), [], `no source url names the own item:\n${show(r)}`);
    assert.equal(ownItemUnknown(r, NAME), 1, `the Not known line says once that the own item of ${NAME} is not known:\n${show(r)}`);
    // Controls: the file names the own item, and the sources change nothing.
    ownItems(w, { [NAME]: OWN_ITEM });
    const c7 = checked(w, ...ISSUES);
    assert.deepEqual(coded(c7, 'issue-not-sub').map((f) => f.id), [`${NAME}/T2`], show(c7));
    assert.equal(ownItemUnknown(c7, NAME), 0, show(c7));
    ownItems(w, { [NAME]: 'https://github.com/acme/invoicer/issues/8' });
    const c8 = checked(w, ...ISSUES);
    assert.deepEqual(coded(c8, 'issue-not-sub').map((f) => f.id), [`${NAME}/T1`], show(c8));
  });

  test('#3: a value in the form owner/repo#n names the own item; a source url in that form names none', (t) => {
    const w = world(t, { ownItem: null, origins: ['https://example.com/notes'], tasks: [{ id: 'T1', ref: '#31' }, { id: 'T2', ref: '#32' }] });
    editRecord(w.dir, NAME, (rec) => { rec.sources.at(-1).url = `${OWN}#7`; });
    save(w, { 'a.json': own(31), 'b.json': own(32, { parent: null }) });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(coded(r, 'issue-not-sub'), [], `the source url ${OWN}#7 names no own item:\n${show(r)}`);
    assert.equal(ownItemUnknown(r, NAME), 1, show(r));
    ownItems(w, { [NAME]: `${OWN}#7` });
    const c = checked(w, ...ISSUES);
    assert.deepEqual(coded(c, 'issue-not-sub').map((f) => f.id), [`${NAME}/T2`], show(c));
  });

  test('the folder names no own item (no file of own items): no issue-not-sub, and the Not known line says so once (control: with the file, #32 gets one)', (t) => {
    const tasks = [{ id: 'T1', ref: '#32' }];
    const files = { 'a.json': own(32, { parent: null }) };
    const w0 = world(t, { tasks });
    save(w0, files);
    const control = checked(w0, ...ISSUES);
    assert.equal(coded(control, 'issue-not-sub').length, 1, show(control));
    assert.equal(ownItemUnknown(control, NAME), 0, show(control));
    const w = world(t, { tasks, ownItem: null });
    save(w, files);
    const r = checked(w, ...ISSUES);
    assert.deepEqual(coded(r, 'issue-not-sub'), [], show(r));
    assertInfo(r, 1);
    assert.notEqual(notKnown(r), notKnown(control), `the Not known line says why:\n${show(r)}`);
    assert.equal(ownItemUnknown(r, NAME), 1, show(r));
  });

  test('an item with no parent field says nothing about its parent: no issue-not-sub, and the Not known line says so (control: parent null gives one)', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: '#32' }] });
    save(w, { 'a.json': own(32, { parent: null }) });
    const control = checked(w, ...ISSUES);
    one(control, 'issue-not-sub', `${OWN}#32`, null);
    save(w, { 'a.json': own(32, { parent: 'absent' }) });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(coded(r, 'issue-not-sub'), [], show(r));
    assertInfo(r, 1);
    assert.notEqual(notKnown(r), notKnown(control), `the Not known line says why:\n${show(r)}`);
  });

  test('two open requests name the same item: issue-not-sub once for each request, with the ID of that request\'s first task that names it', (t) => {
    const w = world(t, {
      tasks: [{ id: 'T1', ref: '#32' }, { id: 'T2', ref: '#31' }, { id: 'T3', ref: 'issue #31' }],
      second: { name: 'pay', ownItem: 'https://github.com/acme/invoicer/issues/8', tasks: [{ id: 'T1', ref: 'issue #31' }] },
    });
    save(w, { 'a.json': own(31, { parent: null }), 'b.json': own(32) });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(sorted(coded(r, 'issue-not-sub').map((f) => `${where(f)} ${f.id}`)), [`${OWN}#31 ${NAME}/T2`, `${OWN}#31 pay/T1`], show(r));
    assertInfo(r, 2);
  });

  test('another tracker: the own item PROJ-1 (a value, a url, that holds its ref); PROJ-12 with parent {ref: PROJ-1} none; PROJ-13 with parent {ref: PROJ-9} one, at PROJ-13', (t) => {
    const w = world(t, { ownItem: 'https://tracker.example.com/browse/PROJ-1', tasks: [{ id: 'T1', ref: 'PROJ-12' }, { id: 'T2', ref: 'Build PROJ-13 next' }] });
    save(w, {
      'proj.json': [
        { ref: 'PROJ-1', repository: 'PROJ', body: 'The epic.\n', parent: null },
        { ref: 'PROJ-12', repository: 'PROJ', body: 'Build the export.\n', parent: { ref: 'PROJ-1' } },
        { ref: 'PROJ-13', repository: 'PROJ', body: 'Build the import.\n', parent: { ref: 'PROJ-9' } },
      ],
    });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(coded(r, 'issue-not-sub').map((f) => `${where(f)} ${f.id}`), [`PROJ-13 ${NAME}/T2`], show(r));
    assert.deepEqual(coded(r, 'issue-missing'), [], show(r));
    assertInfo(r, 2);
  });

  // Clause B (review of PR #243): a parent's url names the own item when it is
  // the own item's url, the value that names the own item in the file of own
  // items (#3, SP-7; it was the url of the origin source), a url that holds
  // the own item's ref as a whole word, or a form of SP-8. Then the item is a
  // child, also when the parent's number names another item.
  const OWN_PROJ = 'https://tracker.example.test/browse/PROJ-1';
  const projWorld = (t, parent, extra = []) => {
    const w = world(t, { ownItem: OWN_PROJ, tasks: [{ id: 'T1', ref: 'PROJ-12' }] });
    save(w, {
      'proj.json': [
        { ref: 'PROJ-1', repository: 'PROJ', body: 'request' },
        { ref: 'PROJ-12', repository: 'PROJ', body: 'task', parent },
        ...extra,
      ],
    });
    return w;
  };

  test('B1: the parent of PROJ-12 is {url: the value that names the own item PROJ-1, number: 1}: a child, no issue-not-sub', (t) => {
    const w = projWorld(t, { url: OWN_PROJ, number: 1 });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(coded(r, 'issue-not-sub'), [], show(r));
    assert.deepEqual(coded(r, 'issue-missing'), [], show(r));
    assert.equal(ownItemUnknown(r, NAME), 0, `the own item is known:\n${show(r)}`);
  });

  test('B2: the parent of PROJ-12 is {url: .../browse/PROJ-2, number: 2}, and PROJ-2 is in the folder: one issue-not-sub at PROJ-12, ID inv/T1', (t) => {
    const w = projWorld(t, { url: 'https://tracker.example.test/browse/PROJ-2', number: 2 }, [{ ref: 'PROJ-2', repository: 'PROJ', body: 'other' }]);
    const r = checked(w, ...ISSUES);
    assert.deepEqual(coded(r, 'issue-not-sub').map((f) => `${where(f)} ${f.id} ${f.severity}`), [`PROJ-12 ${NAME}/T1 hint`], show(r));
  });

  test('B3: a GitHub parent whose url is the own item\'s url, with the number of another item (#8, in the folder): a child, no issue-not-sub', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: '#31' }] });
    save(w, { 'a.json': { ...own(31), parent: { number: 8, url: OWN_ITEM } }, 'b.json': own(8, { parent: null }) });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(coded(r, 'issue-not-sub'), [], show(r));
    assert.equal(ownItemUnknown(r, NAME), 0, `the own item is known:\n${show(r)}`);
  });

  // B4 and B5 keep the two ways apart: a parent url that equals the own
  // item's url and holds no ref (B4), and a parent url that holds the ref
  // and equals neither the own item's url nor the value (B5). In B4 the value
  // is PROJ-1, the ref of the own item (#3: a url value names an item only in
  // a form of SP-8 or by a ref that it holds).
  const I10001 = 'https://tracker.example.test/i/10001';
  const I10002 = 'https://tracker.example.test/i/10002';

  test('B4: the parent url equals the own item\'s url (not the value PROJ-1) and holds no ref: a child, no issue-not-sub; control: the url of another item, PROJ-2, gives one', (t) => {
    const ownProj = { ref: 'PROJ-1', repository: 'PROJ', url: I10001, body: 'request' };
    const w = world(t, { ownItem: 'PROJ-1', tasks: [{ id: 'T1', ref: 'PROJ-12' }] });
    save(w, { 'proj.json': [ownProj, { ref: 'PROJ-12', repository: 'PROJ', body: 'task', parent: { url: I10001, number: 10001 } }] });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(coded(r, 'issue-not-sub'), [], show(r));
    assert.deepEqual(coded(r, 'issue-missing'), [], show(r));

    const c = world(t, { ownItem: 'PROJ-1', tasks: [{ id: 'T1', ref: 'PROJ-12' }] });
    save(c, {
      'proj.json': [
        ownProj,
        { ref: 'PROJ-12', repository: 'PROJ', body: 'task', parent: { url: I10002, number: 10002 } },
        { ref: 'PROJ-2', repository: 'PROJ', url: I10002, body: 'other' },
      ],
    });
    const rc = checked(c, ...ISSUES);
    assert.deepEqual(coded(rc, 'issue-not-sub').map((f) => `${where(f)} ${f.id} ${f.severity}`), [`PROJ-12 ${NAME}/T1 hint`], show(rc));
  });

  test('B5: the parent url holds the own item\'s ref PROJ-1 as a whole word and equals neither the own item\'s url (it has none) nor the value (.../browse/PROJ-1): a child, no issue-not-sub', (t) => {
    const w = world(t, { ownItem: 'https://tracker.example.test/browse/PROJ-1', tasks: [{ id: 'T1', ref: 'PROJ-12' }] });
    save(w, {
      'proj.json': [
        { ref: 'PROJ-1', repository: 'PROJ', body: 'request' },
        { ref: 'PROJ-12', repository: 'PROJ', body: 'task', parent: { url: 'https://tracker.example.test/browse/PROJ-1?focusedId=5', number: 1 } },
      ],
    });
    const r = checked(w, ...ISSUES);
    assert.deepEqual(coded(r, 'issue-not-sub'), [], show(r));
    assert.deepEqual(coded(r, 'issue-missing'), [], show(r));
    assert.equal(ownItemUnknown(r, NAME), 0, `the own item is known:\n${show(r)}`);
  });
});

// =====================================================================
// Clause A (SP-22, review of PR #243): no output of al check shows the user
// name or the password of a remote URL.

describe('R1 (SP-22): al check never shows the user name or the password of the origin remote', () => {
  const SECRET_REMOTE = 'https://USER:REVIEW_DUMMY_TOKEN@git.example.test/scm/acme/invoicer.git';

  test('A1: origin https://USER:REVIEW_DUMMY_TOKEN@git.example.test/scm/acme/invoicer.git: no stdout or stderr of al check (with or without --issues, plain or --strict) holds USER or REVIEW_DUMMY_TOKEN', (t) => {
    const w = world(t, { remote: SECRET_REMOTE });
    save(w, { 'a.json': own(31) });
    for (const args of [ISSUES, [...ISSUES, '--strict'], [], ['--strict']]) {
      const x = check(w, ...args);
      assert.equal(x.code, 0, show(x));
      for (const secret of ['USER', 'REVIEW_DUMMY_TOKEN']) {
        assert.ok(!x.stdout.includes(secret), `stdout of al check ${args.join(' ')} holds ${secret}:\n${show(x)}`);
        assert.ok(!x.stderr.includes(secret), `stderr of al check ${args.join(' ')} holds ${secret}:\n${show(x)}`);
      }
    }
  });

  test('A2: that origin names no owner/repo (three path parts): #31 gets issue-missing at #31, a hint, and the Not known line says that the own repository is not known (control: the same world with origin git@github.com:acme/invoicer.git)', (t) => {
    // The folder is empty in both worlds, so the Not known lines differ only by what al knows of the own repository.
    const control = world(t);
    const c = checked(control, ...ISSUES);
    const w = world(t, { remote: SECRET_REMOTE });
    const r = checked(w, ...ISSUES);
    const missing = one(r, 'issue-missing', '#31');
    assert.equal(missing.id, `${NAME}/T1`, show(r));
    assert.notEqual(notKnown(r), notKnown(c), `the Not known line says that the own repository is not known:\n${show(r)}\n${show(c)}`);
  });

  // A3 and A4: other remotes that git stores as they are written (checked
  // with git remote add and git remote get-url). The item folder is empty.
  const noSecrets = (remote, secrets) => (t) => {
    const w = world(t, { remote });
    for (const args of [ISSUES, [...ISSUES, '--strict'], [], ['--strict']]) {
      const x = check(w, ...args);
      assert.equal(x.code, 0, show(x));
      for (const secret of secrets) {
        assert.ok(!x.stdout.includes(secret), `stdout of al check ${args.join(' ')} holds ${secret}:\n${show(x)}`);
        assert.ok(!x.stderr.includes(secret), `stderr of al check ${args.join(' ')} holds ${secret}:\n${show(x)}`);
      }
      if (args[0] === '--issues') {
        const missing = one(x, 'issue-missing', '#31');
        assert.equal(missing.id, `${NAME}/T1`, show(x));
      }
    }
  };

  test('A3: origin https://USER:FIRST_DUMMY_SECRET@SECOND_DUMMY_SECRET@git.example.test/scm/acme/invoicer.git (two @): no output holds USER, FIRST_DUMMY_SECRET or SECOND_DUMMY_SECRET; #31 gets issue-missing at #31, ID inv/T1',
    noSecrets('https://USER:FIRST_DUMMY_SECRET@SECOND_DUMMY_SECRET@git.example.test/scm/acme/invoicer.git', ['USER', 'FIRST_DUMMY_SECRET', 'SECOND_DUMMY_SECRET']));

  test('A4: the scp-like origin USER:SCP_DUMMY_SECRET@git.example.test:scm/acme/invoicer.git: no output holds USER or SCP_DUMMY_SECRET; #31 gets issue-missing at #31, ID inv/T1',
    noSecrets('USER:SCP_DUMMY_SECRET@git.example.test:scm/acme/invoicer.git', ['USER', 'SCP_DUMMY_SECRET']));
});

// =====================================================================
// R1 and R2: every new finding is a hint in every mode (SP-5, SP-19).

describe('R1, R2 (SP-5, SP-17, SP-19): every new finding is a hint in every mode', () => {
  test('a world with each new code: each is a hint; --strict gives the same findings; both exit 0', (t) => {
    const w = world(t, {
      config: { phrases: ['the requester'] },
      tasks: [{ id: 'T1', ref: 'issue #31' }, { id: 'T2', ref: 'acme/web#5' }, { id: 'T3', ref: 'acme/web#9' }],
    });
    write(w.dir, SPEC, specText('The requester wants email.'));
    save(w, {
      'a.json': own(31, { body: 'We keep ADR-1.\n', parent: null }),
      'b.json': ghItem('acme/web', 5, { body: 'See (#12).\nThe requester asked.\n' }),
      'bad.json': 'not json\n',
    });
    const plain = check(w, ...ISSUES);
    const strict = check(w, ...ISSUES, '--strict');
    assert.equal(plain.code, 0, show(plain));
    for (const code of NEW_CODES) assert.ok(coded(plain, code).length > 0, `${code} is given:\n${show(plain)}`);
    for (const f of newFindings(plain)) assert.equal(f.severity, 'hint', show(plain));
    assert.deepEqual(keys(strict.findings), keys(plain.findings), `the same findings in both modes:\n${show(plain)}\n${show(strict)}`);
    assert.deepEqual(notOk(plain), [], show(plain));
    assert.equal(strict.code, 0, `no new finding sets the exit code:\n${show(strict)}`);
  });
});

// =====================================================================
// R2: phrases for the review (SP-17, SP-18, D6).

const phraseWorld = (t, phrases, extra = {}) => world(t, { tasks: [], config: phrases === undefined ? {} : { phrases }, ...extra });
const phraseFindings = (r) => coded(r, 'phrase');

describe('R2 (SP-17, SP-18): the hint phrase', () => {
  test('no phrases: key, or an empty list: no phrase finding (control: the same text with the phrase listed gives one)', (t) => {
    for (const phrases of [undefined, []]) {
      const w = phraseWorld(t, phrases);
      write(w.dir, SPEC, specText('Mail goes to the requester.'));
      assert.deepEqual(phraseFindings(checked(w)), [], `phrases: ${JSON.stringify(phrases)}`);
    }
    const w = phraseWorld(t, ['the requester']);
    write(w.dir, SPEC, specText('Mail goes to the requester.'));
    one(checked(w), 'phrase', SPEC, lineOf(read(w.dir, SPEC), 'the requester'));
  });

  test('a phrase matches ignoring case, at the file and line of the match, with the ID -; the hint names the entry and the text that matched', (t) => {
    const w = phraseWorld(t, ['the requester']);
    write(w.dir, SPEC, specText('Mail goes to The Requester.'));
    const r = checked(w);
    const f = one(r, 'phrase', SPEC, lineOf(read(w.dir, SPEC), 'The Requester'));
    assert.equal(f.id, '-', show(r));
    assert.ok(f.msg.includes('the requester'), `the entry:\n${show(r)}`);
    assert.ok(f.msg.includes('The Requester'), `the text that matched:\n${show(r)}`);
  });

  test('a space in a phrase matches any run of white space, a line break too: the hint is at the line where the match starts', (t) => {
    const w = phraseWorld(t, ['the requester']);
    write(w.dir, SPEC, specText('Mail goes to the\nrequester by email, and a copy to the \t  requester\'s bank.'));
    const text = read(w.dir, SPEC);
    const r = checked(w);
    const found = phraseFindings(r);
    assert.equal(found.length, 2, show(r));
    for (const f of found) assert.equal(f.file, SPEC, show(r));
    assert.deepEqual(found.map((f) => f.at).sort((a, b) => a - b), [lineOf(text, 'the\nrequester'), lineOf(text, 'the \t')].sort((a, b) => a - b), show(r));
  });

  test('a phrase is matched as text, not as a pattern: "a.b" does not match "axb"; "cost (net)" matches "Cost (net)"', (t) => {
    const w = phraseWorld(t, ['a.b', 'cost (net)']);
    write(w.dir, SPEC, specText('Write axb here.\nThe Cost (net) is shown.'));
    const r = checked(w);
    const found = phraseFindings(r);
    assert.equal(found.length, 1, show(r));
    assert.equal(found[0].at, lineOf(read(w.dir, SPEC), 'The Cost (net)'), show(r));
    assert.ok(found[0].msg.includes('cost (net)'), show(r));
  });

  test('each match is one hint: two matches give two hints, at their lines', (t) => {
    const w = phraseWorld(t, ['the requester']);
    write(w.dir, SPEC, specText('Mail goes to the requester.\nThen the requester pays.'));
    const text = read(w.dir, SPEC);
    const r = checked(w);
    assert.deepEqual(phraseFindings(r).map((f) => f.at).sort((a, b) => a - b), [lineOf(text, 'the requester', 0), lineOf(text, 'the requester', 1)], show(r));
  });

  test('a pattern is a regular expression matched as written: "Avery (asked|wants)" matches "Avery wants" and not "avery wants"; \\s+ matches across a line break', (t) => {
    const w = phraseWorld(t, [{ pattern: 'Avery (asked|wants)' }, { pattern: 'Lisa\\s+agreed' }]);
    write(w.dir, REQUEST_MD, `${read(w.dir, REQUEST_MD)}\nAvery wants it now.\nBut avery wants it later.\nLisa\nagreed.\n`);
    const text = read(w.dir, REQUEST_MD);
    const r = checked(w);
    const found = phraseFindings(r);
    assert.deepEqual(sorted(found.map(where)), sorted([`${REQUEST_MD}:${lineOf(text, 'Avery wants')}`, `${REQUEST_MD}:${lineOf(text, 'Lisa\nagreed')}`]), show(r));
    const avery = found.find((f) => f.at === lineOf(text, 'Avery wants'));
    assert.ok(avery.msg.includes('Avery (asked|wants)'), `the entry:\n${show(r)}`);
    assert.ok(avery.msg.includes('Avery wants'), `the text that matched:\n${show(r)}`);
  });

  test('a match of no characters is not counted: \\b gives no hint; (?:QZQ)* gives one hint, for the one QZQ', (t) => {
    const w = phraseWorld(t, [{ pattern: '\\b' }, { pattern: '(?:QZQ)*' }]);
    write(w.dir, SPEC, specText('Mail goes to\nthe code QZQ by email.'));
    const r = checked(w);
    const found = phraseFindings(r);
    assert.equal(found.length, 1, `only the one QZQ is a match of some characters:\n${show(r)}`);
    assert.equal(where(found[0]), `${SPEC}:${lineOf(read(w.dir, SPEC), 'QZQ')}`, show(r));
  });

  test('the places read: the spec docs, the ADRs, and each Markdown file of an open request; not its origin/ folder, an archived request or the records', (t) => {
    const w = phraseWorld(t, ['the requester'], { archived: { text: 'Ask the requester first.' } });
    // Preconditions: the owner's words in origin/ name the requester; request.md does not yet.
    assert.ok(read(w.dir, `requests/${NAME}/origin/2026-05-04-owner-words.md`).includes('the requester'));
    assert.ok(!read(w.dir, REQUEST_MD).toLowerCase().includes('the requester'), read(w.dir, REQUEST_MD));
    // A task in the request record names the requester too.
    editRecord(w.dir, NAME, (rec) => { rec.tasks = [{ id: 'T1', ref: 'Ask the requester' }]; });
    write(w.dir, SPEC, specText('Mail goes to the requester.'));
    write(w.dir, ADR3, ADRS[ADR3].replace('Context: a PDF alone was not enough.', 'Context: the requester wanted email.'));
    write(w.dir, REQUEST_MD, `${read(w.dir, REQUEST_MD)}\nAsk the requester.\n`);
    write(w.dir, `requests/${NAME}/spec.md`, doc([['SP-1 note', '# Inv: the change'], ['SP-2 note', 'The requester signs.']]));
    write(w.dir, `requests/${NAME}/notes/plan.md`, '# Plan\n\nCall the requester.\n');
    const r = checked(w);
    const at = (file, needle) => `${file}:${lineOf(read(w.dir, file), needle)}`;
    assert.deepEqual(sorted(phraseFindings(r).map(where)), sorted([
      at(SPEC, 'the requester'),
      at(ADR3, 'the requester'),
      at(REQUEST_MD, 'the requester'),
      at(`requests/${NAME}/spec.md`, 'The requester'),
      at(`requests/${NAME}/notes/plan.md`, 'the requester'),
    ]), `no hint in origin/, requests/archive/ or .assuredloop/records/:\n${show(r)}`);
  });

  test('with --issues, a phrase in an item\'s body and in a visible comment: a hint at the item and line, ID inv/T1; not in a hidden comment; not in an item that no task names; without --issues: none from the items', (t) => {
    const w = world(t, { config: { phrases: ['the requester'] } });
    save(w, {
      'a.json': own(31, { body: 'Intro.\nThe requester asked.\n', comments: [{ body: 'Old: the requester.\n', hidden: true }, { body: 'Yes,\nthe\nrequester did.\n' }] }),
      'b.json': own(60, { body: 'the requester\n' }),
    });
    const r = checked(w, ...ISSUES);
    const found = phraseFindings(r).filter((f) => f.file.includes('#'));
    assert.deepEqual(sorted(found.map(where)), sorted([`${OWN}#31:2`, `${OWN}#31/comment-2:2`]), show(r));
    for (const f of found) {
      assert.equal(f.id, `${NAME}/T1`, show(r));
      assert.equal(f.severity, 'hint', show(r));
    }
    const plain = checked(w);
    assert.deepEqual(phraseFindings(plain).filter((f) => f.file.includes('#')), [], show(plain));
  });
});

describe('R2 (SP-18, D6): a bad phrases: is a refusal, exit 2, that names the entry', () => {
  const refusedFor = (t, phrases) => {
    const w = phraseWorld(t, phrases);
    const r = refused(w.dir, ['check'], { env: w.gh.env });
    const line = r.stdout.split('\n').find((l) => l.startsWith('al: '));
    assert.match(line, /phrases/, show(r));
    return { r, line };
  };

  test('phrases: that is not a list (a string, a mapping): refused', (t) => {
    refusedFor(t, 'the requester');
    refusedFor(t, { pattern: 'Avery' });
  });

  test('an entry that is neither a phrase nor a mapping with a pattern (a number, a mapping with no pattern, a list): refused', (t) => {
    refusedFor(t, ['the requester', 42]);
    refusedFor(t, ['the requester', { regex: 'Avery' }]);
    refusedFor(t, [['the requester']]);
  });

  test('an empty phrase or an empty pattern: refused', (t) => {
    refusedFor(t, ['the requester', '']);
    refusedFor(t, [{ pattern: '' }]);
  });

  test('a pattern that is not a valid regular expression: refused, and the line names it', (t) => {
    const { r, line } = refusedFor(t, ['the requester', { pattern: 'Avery (asked' }]);
    assert.ok(line.includes('Avery (asked'), show(r));
  });
});
