// #239: hints from the linked issues, and phrases for the review
// (requests/issue-hints/request.md R1 and R2, decisions D1 to D8; the change
// spec requests/issue-hints/spec.md SP-4 to SP-21).
//
// - R1: `al check --issues` reads, through `gh`, the GitHub issues that the
//   tasks of each open request name, and gives the hints issue-superseded,
//   issue-bare-ref, issue-not-sub, phrase and issue-unread. Without
//   --issues it reads no issue.
// - R2: the `phrases:` of .assuredloop/config.yaml give the hint `phrase` in
//   the spec docs, the ADRs and the open requests (not origin/, not archived
//   requests), and with --issues in the issues. A bad `phrases:` is a refusal.
//
// No test reaches the network (D1): each run has a PATH with a fake `gh`
// that this file writes, and the system folders (for git) only. The fake
// answers `gh repo view` and `gh issue view` from data that each test sets,
// and logs each call, so a test can check which calls al made.
// Nothing here reads the code under test.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findings, keys } from './helpers/invoicer.js';
import {
  al, commitAll, doc, editRecord, git, move, newRequest, ok, read, refused, show, write, writeYaml,
} from './helpers/project.js';

// The system folders: git is there, gh is not (checked below).
const SAFE_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
const ghInSafePath = spawnSync('/bin/sh', ['-c', 'command -v gh'], { env: { PATH: SAFE_PATH }, encoding: 'utf8' }).stdout.trim();

const NAME = 'inv';
const OWN = 'acme/invoicer';
const OWN_ISSUE = 'https://github.com/acme/invoicer/issues/7';
const SPEC = 'specs/invoices.md';
const REQUEST_MD = `requests/${NAME}/request.md`;
const NEW_CODES = ['issue-superseded', 'issue-bare-ref', 'issue-not-sub', 'issue-unread', 'phrase'];
const FIELDS = ['number', 'url', 'body', 'comments', 'parent'];
const FIELDS_NO_PARENT = ['number', 'url', 'body', 'comments'];
const AUTH = 'To get started with GitHub CLI, please run:  gh auth login\nAlternatively, populate the GH_TOKEN environment variable with a GitHub API authentication token.';

// =====================================================================
// The fake gh.

// The script: it logs {args, cwd, prompt} as one JSON line, then answers
// from the data file. Data: {down, repos: {<folder>: "owner/repo" | {fail}},
// issues: {"owner/repo#n": {body, comments: [{body, hidden}], parent: "owner/repo#n" | null} | {fail}},
// noParent: ["owner/repo"]}. Its JSON has the shape of gh 2.102.
const fakeSource = (dataFile, logFile) => `
const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(logFile)}, JSON.stringify({ args, cwd: fs.realpathSync(process.cwd()), prompt: process.env.GH_PROMPT_DISABLED ?? null }) + '\\n');
const data = JSON.parse(fs.readFileSync(${JSON.stringify(dataFile)}, 'utf8'));
const fail = (msg, code = 1) => { process.stderr.write(msg + '\\n'); process.exit(code); };
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const fields = (flag('--json') ?? '').split(',').filter(Boolean);
const out = (full) => {
  const o = {};
  for (const f of [...fields].sort()) {
    if (!(f in full)) fail('Unknown JSON field: "' + f + '"');
    o[f] = full[f];
  }
  process.stdout.write(JSON.stringify(o) + '\\n');
  process.exit(0);
};
if (data.down) fail(data.down, 4);
if (args[0] === 'repo' && args[1] === 'view') {
  const r = (data.repos ?? {})[fs.realpathSync(process.cwd())];
  if (r === undefined) fail('none of the git remotes configured for this repository point to a known GitHub host. To tell gh about a new GitHub host, please use \`gh auth login\`');
  if (typeof r === 'object') fail(r.fail);
  out({ nameWithOwner: r, name: r.split('/')[1], url: 'https://github.com/' + r });
}
if (args[0] === 'issue' && args[1] === 'view') {
  const n = Number(args[2]);
  const repo = flag('--repo');
  if ((data.noParent ?? []).includes(repo) && fields.includes('parent')) {
    fail('Unknown JSON field: "parent"\\nAvailable fields:\\n  body\\n  comments\\n  number\\n  url');
  }
  const issue = (data.issues ?? {})[repo + '#' + n];
  if (!issue) fail('GraphQL: Could not resolve to an issue or pull request with the number of ' + n + '. (repository.issue)');
  if (issue.fail) fail(issue.fail);
  const url = 'https://github.com/' + repo + '/issues/' + n;
  const parent = issue.parent ? (() => {
    const [pr, pn] = issue.parent.split('#');
    return { id: 'I_' + pn, number: Number(pn), title: 'Issue ' + pn, url: 'https://github.com/' + pr + '/issues/' + pn, state: 'OPEN', repository: { nameWithOwner: pr } };
  })() : null;
  const comments = (issue.comments ?? []).map((c, i) => ({
    author: { login: 'someone' }, authorAssociation: 'NONE', body: c.body, createdAt: '2026-05-01T00:00:00Z',
    id: 'IC_' + n + '_' + (i + 1), includesCreatedEdit: false, isMinimized: !!c.hidden, minimizedReason: c.hidden ? 'OFF_TOPIC' : '',
    reactionGroups: [], url: url + '#issuecomment-' + (n * 100 + i + 1), viewerDidAuthor: false,
  }));
  out({ number: n, url, body: issue.body ?? '', comments, parent, title: 'Issue ' + n, state: 'OPEN' });
}
fail('unknown command: ' + args.join(' '));
`;

function fakeGh(t, data = {}) {
  const bin = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-239-gh-'));
  t.after(() => rmSync(bin, { recursive: true, force: true }));
  const dataFile = join(bin, 'data.json');
  const logFile = join(bin, 'calls.jsonl');
  const set = (d) => writeFileSync(dataFile, JSON.stringify(d));
  set(data);
  writeFileSync(join(bin, 'gh'), `#!${process.execPath}\n${fakeSource(dataFile, logFile)}`);
  chmodSync(join(bin, 'gh'), 0o755);
  const calls = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  return { env: { PATH: `${bin}:${SAFE_PATH}` }, set, calls, clear: () => rmSync(logFile, { force: true }) };
}

const flagOf = (args, name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const issueCalls = (gh) => gh.calls().filter((c) => c.args[0] === 'issue');
// The issues that al ran `gh issue view` for, as "owner/repo#n", in call order.
const viewed = (gh) => issueCalls(gh).map((c) => `${flagOf(c.args, '--repo')}#${c.args[2]}`);
const fieldsOf = (c) => (flagOf(c.args, '--json') ?? '').split(',').sort();

// =====================================================================
// The world: <root>/invoicer, a git repo with the config, a spec with an ADR
// chain (ADR-1 superseded by ADR-2, superseded by ADR-3, accepted), and the
// open request inv. Its own issue is acme/invoicer#7 (an origin source with
// that url), unless ownIssue says otherwise. Its record has `tasks`.
// Optional: <root>/web, an output repo named `web` in the config; a second
// open request; an archived request `old` with its own tasks.

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

function initRepo(dir) {
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.name', 'Fixture Author');
  git(dir, 'config', 'user.email', 'author@example.invalid');
  git(dir, 'config', 'commit.gpgsign', 'false');
}

// An origin source with this url, through the public command; no gh on PATH.
const addOrigin = (dir, name, url, text = 'The issue as the owner filed it.\n') =>
  ok(dir, ['record', name, 'origin', '--url', url, '--from', '-', '--yes'], { input: text, env: { PATH: SAFE_PATH } });

function world(t, {
  tasks = [{ id: 'T1', ref: 'issue #31' }], ownIssue = OWN_ISSUE, outputs = false, config = {}, archived = null, second = null,
} = {}) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-239-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, 'invoicer');
  const web = join(root, 'web');
  initRepo(dir);
  const cfg = { docs: [{ file: SPEC, prefix: 'INV' }], ...config };
  if (outputs) {
    initRepo(web);
    write(web, 'README.md', '# Web\n');
    commitAll(web, 'Start the web repo');
    Object.assign(cfg, { repo: 'invoicer', outputs: [{ name: 'web', path: '../web' }] });
  }
  writeYaml(dir, '.assuredloop/config.yaml', cfg);
  write(dir, SPEC, specText());
  for (const [file, text] of Object.entries(ADRS)) write(dir, file, text);
  newRequest(dir, NAME, WORDS);
  if (ownIssue) addOrigin(dir, NAME, ownIssue);
  editRecord(dir, NAME, (rec) => { rec.tasks = tasks; });
  if (second) {
    newRequest(dir, second.name, `The owner wants ${second.name}.\n`);
    if (second.ownIssue) addOrigin(dir, second.name, second.ownIssue);
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
  return { root, dir, web };
}

// The fake's data for a world: this checkout is acme/invoicer, and web is acme/web.
const dataFor = (w, extra = {}) => ({ repos: { [w.dir]: OWN, [w.web]: 'acme/web' }, ...extra });

// One run of al check with the fake gh on PATH.
function check(dir, gh, ...args) {
  const r = al(dir, ['check', ...args], { env: gh.env });
  return { ...r, findings: findings(r.stdout) };
}
// A run that must exit 0 and must not refuse.
function checked(dir, gh, ...args) {
  const r = check(dir, gh, ...args);
  assert.equal(r.code, 0, show(r));
  assert.doesNotMatch(r.stdout, /^al: /m, show(r));
  return r;
}

const coded = (r, code) => r.findings.filter((f) => f.code === code);
const newFindings = (r) => r.findings.filter((f) => NEW_CODES.includes(f.code));
const notOk = (r) => r.findings.filter((f) => f.severity === 'not ok');
const notKnown = (r) => r.stdout.split('\n').find((l) => l.startsWith('Not known')) ?? '';
const infoIssues = (r) => r.findings.filter((f) => f.severity === 'info' && f.code === 'issues');
const infoLine = (read, of) => `read ${read} of ${of} issues that the tasks of the open requests name`;
function assertInfo(r, read, of) {
  const found = infoIssues(r);
  assert.equal(found.length, 1, `one info issues line:\n${show(r)}`);
  assert.equal(found[0].file, '-', show(r));
  assert.equal(found[0].id, '-', show(r));
  assert.equal(found[0].msg, infoLine(read, of), show(r));
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
// The one finding of code at file (and at line, when given).
function one(r, code, file, at) {
  const found = coded(r, code).filter((f) => f.file === file && (at === undefined || f.at === at));
  assert.equal(found.length, 1, `one ${code} at ${file}${at === undefined ? '' : `:${at}`}:\n${show(r)}`);
  assert.equal(found[0].severity, 'hint', show(r));
  return found[0];
}

test('the test setup: the system folders hold no gh, so only the fake gh can run', () => {
  assert.equal(ghInSafePath, '', `a gh in ${SAFE_PATH} would let a test reach the network`);
});

// =====================================================================
// R1: which issues, and when al reads them.

describe('R1 (SP-5, SP-13): without --issues, al check reads no issue', () => {
  test('tasks name issues, plain al check: no gh call at all, no issue finding, no info issues line; Not known says that the issues were not read and that al check --issues reads them', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: 'issue #31' }, { id: 'T2', ref: 'acme/web#5' }] });
    const gh = fakeGh(t, dataFor(w, { issues: { [`${OWN}#31`]: { body: 'We keep ADR-1.\n' }, 'acme/web#5': { body: 'See (#12).\n' } } }));
    for (const args of [[], ['--strict']]) {
      const r = check(w.dir, gh, ...args);
      assert.notEqual(r.code, 2, show(r));
      assert.deepEqual(gh.calls(), [], `no gh call without --issues:\n${show(r)}`);
      assert.deepEqual(newFindings(r).map((f) => f.line), [], show(r));
      assert.deepEqual(infoIssues(r), [], show(r));
      assert.match(notKnown(r), /al check --issues/, show(r));
    }
  });
});

describe('R1 (SP-11): how al reads an issue', () => {
  test('one issue with nothing to hint: al runs gh repo view and gh issue view only, as SP-11 names them, each with GH_PROMPT_DISABLED=1; no issue finding; info read 1 of 1', (t) => {
    const w = world(t);
    const gh = fakeGh(t, dataFor(w, { issues: { [`${OWN}#31`]: { body: 'Send invoices by email.\n', parent: `${OWN}#7` } } }));
    const r = checked(w.dir, gh, '--issues');
    assert.deepEqual(newFindings(r).map((f) => f.line), [], show(r));
    assertInfo(r, 1, 1);
    const calls = gh.calls();
    assert.ok(calls.length > 0, `al ran gh:\n${show(r)}`);
    for (const c of calls) {
      assert.equal(c.prompt, '1', `GH_PROMPT_DISABLED=1 on ${c.args.join(' ')}`);
      if (c.args[0] === 'repo') {
        assert.deepEqual(c.args, ['repo', 'view', '--json', 'nameWithOwner'], `a read command only: ${c.args.join(' ')}`);
      } else {
        assert.deepEqual(c.args.slice(0, 2), ['issue', 'view'], `a read command only: ${c.args.join(' ')}`);
        assert.equal(c.args.length, 7, c.args.join(' '));
        assert.equal(flagOf(c.args, '--repo'), OWN, c.args.join(' '));
        assert.deepEqual(fieldsOf(c), [...FIELDS].sort(), c.args.join(' '));
      }
    }
    assert.ok(calls.some((c) => c.args[0] === 'repo' && c.cwd === w.dir), `gh repo view in this checkout:\n${JSON.stringify(calls)}`);
    assert.deepEqual(viewed(gh), [`${OWN}#31`]);
  });
});

describe('R1 (SP-8, SP-9): the issues that the tasks name', () => {
  test('each form of SP-8 names its issue: #n, owner/repo#n, an issue URL, <name>#n of an outputs: entry; a title, a file line and <name>#n of a name that the config does not list name none', (t) => {
    const w = world(t, {
      outputs: true,
      tasks: [
        { id: 'T1', ref: 'tasks.md T1; issue #31' },
        { id: 'T2', ref: 'acme/other#4' },
        { id: 'T3', ref: 'https://github.com/acme/other/issues/9' },
        { id: 'T4', ref: 'web#5' },
        { id: 'T5', ref: 'tasks.md T5' },
        { id: 'T6', ref: 'Send the reminder' },
        { id: 'T7', ref: 'mobile#6' },
      ],
    });
    const plain = { body: 'Nothing to hint.\n', parent: `${OWN}#7` };
    const gh = fakeGh(t, dataFor(w, { issues: { [`${OWN}#31`]: plain, 'acme/other#4': plain, 'acme/other#9': plain, 'acme/web#5': plain, [`${OWN}#6`]: plain, 'acme/web#6': plain } }));
    const r = checked(w.dir, gh, '--issues');
    assert.deepEqual([...viewed(gh)].sort(), ['acme/other#4', 'acme/other#9', `${OWN}#31`, 'acme/web#5'].sort(), show(r));
    assert.ok(gh.calls().some((c) => c.args[0] === 'repo' && c.cwd === w.web), `gh repo view in the folder of web's path:\n${JSON.stringify(gh.calls())}`);
    assertInfo(r, 4, 4);
  });

  test('an issue that two tasks name, and two references in one ref, are read once; its hints carry the ID of the first task', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: 'issue #31; issue #32' }, { id: 'T2', ref: '#31' }, { id: 'T3', ref: 'https://github.com/acme/invoicer/issues/32' }] });
    const gh = fakeGh(t, dataFor(w, { issues: { [`${OWN}#31`]: { body: 'We keep ADR-1.\n', parent: `${OWN}#7` }, [`${OWN}#32`]: { body: 'Fine.\n', parent: `${OWN}#7` } } }));
    const r = checked(w.dir, gh, '--issues');
    assert.deepEqual([...viewed(gh)].sort(), [`${OWN}#31`, `${OWN}#32`], show(r));
    assert.equal(one(r, 'issue-superseded', `${OWN}#31`, 1).id, `${NAME}/T1`, show(r));
    assertInfo(r, 2, 2);
  });

  test('an archived request is history: the issues of its tasks are not read; the open request\'s are', (t) => {
    const w = world(t, { archived: { tasks: [{ id: 'T1', ref: 'issue #40' }] } });
    const gh = fakeGh(t, dataFor(w, { issues: { [`${OWN}#31`]: { body: 'Fine.\n', parent: `${OWN}#7` }, [`${OWN}#40`]: { body: 'We keep ADR-1.\n', parent: null } } }));
    const r = checked(w.dir, gh, '--issues');
    assert.deepEqual(viewed(gh), [`${OWN}#31`], show(r));
    assert.deepEqual(newFindings(r).map((f) => f.line), [], show(r));
    assertInfo(r, 1, 1);
  });
});

// =====================================================================
// R1: issue-superseded (the rule of hints-and-blocks R5, schema.md 5).

describe('R1 (SP-4): issue-superseded, an issue that names a superseded ADR without the ADR that supersedes it', () => {
  test('the body names ADR-1 alone: hint issue-superseded at acme/invoicer#31:<line>, ID inv/T1, naming ADR-1; a hint, not not ok', (t) => {
    const w = world(t);
    const gh = fakeGh(t, dataFor(w, { issues: { [`${OWN}#31`]: { body: 'Some intro.\n\nWe keep ADR-1 for now.\n', parent: `${OWN}#7` } } }));
    const r = checked(w.dir, gh, '--issues');
    const f = one(r, 'issue-superseded', `${OWN}#31`, 3);
    assert.equal(f.id, `${NAME}/T1`, show(r));
    assert.match(f.msg, /\bADR-1\b/, show(r));
    assert.deepEqual(notOk(r).map((x) => x.line), [], show(r));
  });

  test('control: ADR-1 with its successors ADR-2 and ADR-3 in the same paragraph: no issue-superseded; ADR-10 names no ADR-1', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: '#31' }, { id: 'T2', ref: '#32' }] });
    const gh = fakeGh(t, dataFor(w, {
      issues: {
        [`${OWN}#31`]: { body: 'ADR-1 gave way to ADR-2,\nand ADR-2 to ADR-3.\n', parent: `${OWN}#7` },
        [`${OWN}#32`]: { body: 'ADR-10 is not written yet.\n', parent: `${OWN}#7` },
      },
    }));
    const r = checked(w.dir, gh, '--issues');
    assert.deepEqual(coded(r, 'issue-superseded'), [], show(r));
    assertInfo(r, 2, 2);
  });

  test('the successor in another paragraph does not count (a word needs it in the same paragraph): hint at the line of ADR-1', (t) => {
    const w = world(t);
    const gh = fakeGh(t, dataFor(w, { issues: { [`${OWN}#31`]: { body: 'We keep ADR-1.\n\nADR-2 and ADR-3 came later.\n', parent: `${OWN}#7` } } }));
    const r = checked(w.dir, gh, '--issues');
    const found = coded(r, 'issue-superseded');
    assert.equal(found.length, 1, show(r));
    assert.equal(found[0].file, `${OWN}#31`, show(r));
    assert.equal(found[0].at, 1, show(r));
    assert.match(found[0].msg, /\bADR-1\b/, show(r));
  });

  test('the chain: ADR-1 with ADR-2 names ADR-2, which ADR-3 supersedes: one hint, naming ADR-2', (t) => {
    const w = world(t);
    const gh = fakeGh(t, dataFor(w, { issues: { [`${OWN}#31`]: { body: 'ADR-1 gave way to ADR-2.\n', parent: `${OWN}#7` } } }));
    const r = checked(w.dir, gh, '--issues');
    const found = coded(r, 'issue-superseded');
    assert.equal(found.length, 1, show(r));
    assert.match(found[0].msg, /\bADR-2\b/, show(r));
    assert.equal(found[0].severity, 'hint', show(r));
  });

  test('a visible comment names ADR-1 alone: hint at acme/invoicer#31/comment-3:<line>, where k counts the hidden comment 2 too; the same text in the minimized comment 2 gives none', (t) => {
    const w = world(t);
    const gh = fakeGh(t, dataFor(w, {
      issues: {
        [`${OWN}#31`]: {
          body: 'Send invoices by email.\n',
          parent: `${OWN}#7`,
          comments: [{ body: 'Agreed.\n' }, { body: 'We keep ADR-1.\n', hidden: true }, { body: 'Thanks.\n\nWe keep ADR-1.\n' }],
        },
      },
    }));
    const r = checked(w.dir, gh, '--issues');
    const found = coded(r, 'issue-superseded');
    assert.equal(found.length, 1, show(r));
    assert.equal(found[0].file, `${OWN}#31/comment-3`, show(r));
    assert.equal(found[0].at, 3, show(r));
    assert.equal(found[0].id, `${NAME}/T1`, show(r));
  });

  test('control: ADR-1 only in a minimized comment: no issue-superseded, and the issue is read', (t) => {
    const w = world(t);
    const gh = fakeGh(t, dataFor(w, {
      issues: { [`${OWN}#31`]: { body: 'Send invoices by email.\n', parent: `${OWN}#7`, comments: [{ body: 'We keep ADR-1.\n', hidden: true }] } },
    }));
    const r = checked(w.dir, gh, '--issues');
    assert.deepEqual(coded(r, 'issue-superseded'), [], show(r));
    assertInfo(r, 1, 1);
  });
});

// =====================================================================
// R1: issue-bare-ref (SP-14).

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

describe('R1 (SP-4, SP-14): issue-bare-ref, a bare #n in an issue of another repository', () => {
  test('an issue of acme/web holds bare #12 and (#13): hint issue-bare-ref at acme/web#5, on those lines, ID inv/T1; control: the same body in an issue of the request\'s own repository gives none', (t) => {
    const body = '#12 is the cause.\nSee (#13) too.\n';
    const w = world(t, { tasks: [{ id: 'T1', ref: 'acme/web#5' }, { id: 'T2', ref: '#31' }] });
    const gh = fakeGh(t, dataFor(w, { issues: { 'acme/web#5': { body, parent: `${OWN}#7` }, [`${OWN}#31`]: { body, parent: `${OWN}#7` } } }));
    const r = checked(w.dir, gh, '--issues');
    const found = coded(r, 'issue-bare-ref');
    assert.ok(found.length >= 1, show(r));
    for (const f of found) {
      assert.equal(f.file, 'acme/web#5', `no issue-bare-ref in the request's own repository:\n${show(r)}`);
      assert.ok([1, 2].includes(f.at), show(r));
      assert.equal(f.id, `${NAME}/T1`, show(r));
      assert.equal(f.severity, 'hint', show(r));
    }
  });

  test('not bare: #n after a letter, a digit, _, -, /, # or &, and # with no digit: no issue-bare-ref; control: a bare (#14) added to the same body gives one', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: 'acme/web#5' }] });
    const gh = fakeGh(t, dataFor(w, { issues: { 'acme/web#5': { body: `${NOT_BARE}\n`, parent: `${OWN}#7` } } }));
    const r = checked(w.dir, gh, '--issues');
    assert.deepEqual(coded(r, 'issue-bare-ref'), [], show(r));
    gh.set(dataFor(w, { issues: { 'acme/web#5': { body: `${NOT_BARE}\nSee (#14).\n`, parent: `${OWN}#7` } } }));
    const control = checked(w.dir, gh, '--issues');
    one(control, 'issue-bare-ref', 'acme/web#5', 10);
  });

  test('a bare #12 in a visible comment of an issue of acme/web: hint at acme/web#5/comment-2:<line>; in the minimized comment 1: none', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: 'https://github.com/acme/web/issues/5' }] });
    const gh = fakeGh(t, dataFor(w, {
      issues: { 'acme/web#5': { body: 'Nothing here.\n', parent: `${OWN}#7`, comments: [{ body: 'Old: (#11).\n', hidden: true }, { body: 'Now:\nsee (#12).\n' }] } },
    }));
    const r = checked(w.dir, gh, '--issues');
    const found = coded(r, 'issue-bare-ref');
    assert.equal(found.length, 1, show(r));
    assert.equal(found[0].file, 'acme/web#5/comment-2', show(r));
    assert.equal(found[0].at, 2, show(r));
  });

  test('gh repo view fails for this checkout: the #n issue is not read and gets issue-unread; the issue-bare-ref check is not made; the Not known line says so and names #31', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: 'issue #31' }, { id: 'T2', ref: 'acme/web#5' }] });
    const issues = { [`${OWN}#31`]: { body: 'Fine.\n', parent: `${OWN}#7` }, 'acme/web#5': { body: 'See (#12).\n', parent: `${OWN}#7` } };
    const gh = fakeGh(t, dataFor(w, { issues }));
    const control = checked(w.dir, gh, '--issues');
    one(control, 'issue-bare-ref', 'acme/web#5', 1);
    gh.clear();
    gh.set({ repos: { [w.dir]: { fail: 'none of the git remotes configured for this repository point to a known GitHub host' } }, issues });
    const r = checked(w.dir, gh, '--issues');
    assert.ok(!viewed(gh).some((v) => v.endsWith('#31')), `issue 31 is not read:\n${JSON.stringify(gh.calls())}`);
    assert.ok(viewed(gh).includes('acme/web#5'), `acme/web#5 is still read:\n${show(r)}`);
    assert.deepEqual(coded(r, 'issue-bare-ref'), [], show(r));
    const unread = coded(r, 'issue-unread');
    assert.ok(unread.some((f) => f.id === `${NAME}/T1` && f.severity === 'hint'), show(r));
    assert.match(notKnown(r), /#31\b/, show(r));
    assert.notEqual(notKnown(r), notKnown(control), `the Not known line says that the bare-ref check was not made:\n${show(r)}`);
  });
});

// =====================================================================
// R1: issue-not-sub (SP-10, SP-12, D3).

describe('R1 (SP-4, SP-10): issue-not-sub, an issue that is not a sub-issue of the request\'s own issue', () => {
  test('own issue acme/invoicer#7: #31 (its sub-issue) none; #32 (no parent), #33 (parent #8) and #34 (parent acme/other#7) one hint each; #7 itself none', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: '#31' }, { id: 'T2', ref: '#32' }, { id: 'T3', ref: '#33' }, { id: 'T4', ref: '#7' }, { id: 'T5', ref: '#34' }] });
    const gh = fakeGh(t, dataFor(w, {
      issues: {
        [`${OWN}#31`]: { body: 'a\n', parent: `${OWN}#7` },
        [`${OWN}#32`]: { body: 'b\n', parent: null },
        [`${OWN}#33`]: { body: 'c\n', parent: `${OWN}#8` },
        [`${OWN}#7`]: { body: 'd\n', parent: null },
        [`${OWN}#34`]: { body: 'e\n', parent: 'acme/other#7' },
      },
    }));
    const r = checked(w.dir, gh, '--issues');
    const found = coded(r, 'issue-not-sub');
    const on = (n) => found.filter((f) => f.line.includes(`${OWN}#${n} `) || f.line.includes(`${OWN}#${n}:`));
    for (const [n, task] of [[32, 'T2'], [33, 'T3'], [34, 'T5']]) {
      assert.equal(on(n).length, 1, `one issue-not-sub for #${n}:\n${show(r)}`);
      assert.equal(on(n)[0].id, `${NAME}/${task}`, show(r));
      assert.equal(on(n)[0].severity, 'hint', show(r));
    }
    assert.equal(found.length, 3, `no issue-not-sub for #31 or for the own issue #7:\n${show(r)}`);
    assertInfo(r, 5, 5);
  });

  test('the own issue is the first source whose url is an issue: a url that is not an issue is passed over, and a later issue url is not the own issue', (t) => {
    const w = world(t, { ownIssue: null, tasks: [{ id: 'T1', ref: '#31' }, { id: 'T2', ref: '#33' }] });
    addOrigin(w.dir, NAME, 'https://example.com/notes', 'Notes.\n');
    addOrigin(w.dir, NAME, OWN_ISSUE, 'The issue.\n');
    addOrigin(w.dir, NAME, 'https://github.com/acme/invoicer/issues/8', 'Another issue.\n');
    const gh = fakeGh(t, dataFor(w, { issues: { [`${OWN}#31`]: { body: 'a\n', parent: `${OWN}#7` }, [`${OWN}#33`]: { body: 'c\n', parent: `${OWN}#8` } } }));
    const r = checked(w.dir, gh, '--issues');
    const found = coded(r, 'issue-not-sub');
    assert.equal(found.length, 1, show(r));
    assert.equal(found[0].id, `${NAME}/T2`, show(r));
  });

  test('a source url in the form owner/repo#n names the own issue too', (t) => {
    const w = world(t, { ownIssue: null, tasks: [{ id: 'T1', ref: '#31' }, { id: 'T2', ref: '#32' }] });
    addOrigin(w.dir, NAME, 'https://example.com/notes', 'Notes.\n');
    editRecord(w.dir, NAME, (rec) => { rec.sources.at(-1).url = `${OWN}#7`; });
    const gh = fakeGh(t, dataFor(w, { issues: { [`${OWN}#31`]: { body: 'a\n', parent: `${OWN}#7` }, [`${OWN}#32`]: { body: 'b\n', parent: null } } }));
    const r = checked(w.dir, gh, '--issues');
    const found = coded(r, 'issue-not-sub');
    assert.equal(found.length, 1, show(r));
    assert.equal(found[0].id, `${NAME}/T2`, show(r));
  });

  test('no source names an own issue: no issue-not-sub, and the Not known line says so (control: with the own issue, #32 gets one)', (t) => {
    const tasks = [{ id: 'T1', ref: '#32' }];
    const issues = { [`${OWN}#32`]: { body: 'b\n', parent: null } };
    const w0 = world(t, { tasks });
    const gh0 = fakeGh(t, dataFor(w0, { issues }));
    const control = checked(w0.dir, gh0, '--issues');
    assert.equal(coded(control, 'issue-not-sub').length, 1, show(control));
    const w = world(t, { tasks, ownIssue: null });
    const gh = fakeGh(t, dataFor(w, { issues }));
    const r = checked(w.dir, gh, '--issues');
    assert.deepEqual(coded(r, 'issue-not-sub'), [], show(r));
    assertInfo(r, 1, 1);
    assert.notEqual(notKnown(r), notKnown(control), `the Not known line says why there is no issue-not-sub:\n${show(r)}`);
  });

  test('gh refuses the field parent for acme/web: al runs the same call again without parent; no issue-not-sub for its issue, which is still read; acme/invoicer is not affected; Not known says so', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: 'acme/web#5' }, { id: 'T2', ref: '#32' }] });
    const issues = { 'acme/web#5': { body: 'See (#12).\n', parent: null }, [`${OWN}#32`]: { body: 'b\n', parent: null } };
    const gh = fakeGh(t, dataFor(w, { issues }));
    const control = checked(w.dir, gh, '--issues');
    assert.equal(coded(control, 'issue-not-sub').length, 2, show(control));
    gh.clear();
    gh.set(dataFor(w, { issues, noParent: ['acme/web'] }));
    const r = checked(w.dir, gh, '--issues');
    const webCalls = issueCalls(gh).filter((c) => flagOf(c.args, '--repo') === 'acme/web');
    assert.deepEqual(webCalls.map(fieldsOf), [[...FIELDS].sort(), [...FIELDS_NO_PARENT].sort()], `the call, then the same call without parent:\n${JSON.stringify(webCalls)}`);
    assert.deepEqual(webCalls[1].args.slice(0, 5), ['issue', 'view', '5', '--repo', 'acme/web']);
    const notSub = coded(r, 'issue-not-sub');
    assert.equal(notSub.length, 1, show(r));
    assert.equal(notSub[0].id, `${NAME}/T2`, show(r));
    assert.deepEqual(coded(r, 'issue-unread'), [], `the issue is read without parent:\n${show(r)}`);
    one(r, 'issue-bare-ref', 'acme/web#5', 1);
    assertInfo(r, 2, 2);
    assert.notEqual(notKnown(r), notKnown(control), `the Not known line says that acme/web gives no sub-issue data:\n${show(r)}`);
  });

  test('two open requests name the same issue: it is read once, and issue-not-sub is given once for each request', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: '#31' }], second: { name: 'pay', ownIssue: 'https://github.com/acme/invoicer/issues/8', tasks: [{ id: 'T1', ref: 'issue #31' }] } });
    const gh = fakeGh(t, dataFor(w, { issues: { [`${OWN}#31`]: { body: 'a\n', parent: null } } }));
    const r = checked(w.dir, gh, '--issues');
    assert.deepEqual(viewed(gh), [`${OWN}#31`], show(r));
    assert.equal(coded(r, 'issue-not-sub').length, 2, show(r));
    assertInfo(r, 1, 1);
  });
});

// =====================================================================
// R1: issue-unread (SP-5, SP-12, D5).

describe('R1 (SP-5, SP-12, D5): an issue that al cannot read is a hint, never a refusal', () => {
  const tasks = [{ id: 'T1', ref: 'issue #31' }, { id: 'T2', ref: 'acme/web#5' }];

  test('gh is not on PATH: issue-unread for each issue, the Not known line names each, info read 0 of 2; exit 0 plain and under --strict', (t) => {
    const w = world(t, { tasks });
    const noGh = { env: { PATH: SAFE_PATH } };
    for (const args of [['--issues'], ['--issues', '--strict']]) {
      const r = checked(w.dir, noGh, ...args);
      const unread = coded(r, 'issue-unread');
      assert.deepEqual([...new Set(unread.map((f) => f.id))].sort(), [`${NAME}/T1`, `${NAME}/T2`], show(r));
      for (const f of unread) assert.equal(f.severity, 'hint', show(r));
      assert.match(notKnown(r), /#31\b/, show(r));
      assert.ok(notKnown(r).includes('acme/web#5'), show(r));
      assertInfo(r, 0, 2);
    }
  });

  test('gh is not logged in: issue-unread for each issue, with the first line of what gh wrote as the reason; exit 0', (t) => {
    const w = world(t, { tasks });
    const gh = fakeGh(t, dataFor(w, { down: AUTH }));
    const r = checked(w.dir, gh, '--issues');
    const unread = coded(r, 'issue-unread');
    assert.deepEqual([...new Set(unread.map((f) => f.id))].sort(), [`${NAME}/T1`, `${NAME}/T2`], show(r));
    const web = unread.filter((f) => f.line.includes('acme/web#5'));
    assert.equal(web.length, 1, show(r));
    assert.ok(web[0].msg.includes('To get started with GitHub CLI, please run:  gh auth login'), show(r));
    assert.ok(!r.stdout.includes('Alternatively, populate'), `only the first line of what gh wrote:\n${show(r)}`);
    assertInfo(r, 0, 2);
  });

  test('gh fails for one issue: issue-unread for it with the first line of the error, the Not known line names it, the other issue is read and hinted; exit 0 plain and under --strict', (t) => {
    const w = world(t, { tasks: [{ id: 'T1', ref: 'issue #31' }, { id: 'T2', ref: '#32' }] });
    const error = 'GraphQL: Could not resolve to an issue or pull request with the number of 32. (repository.issue)\nthe second line of the error';
    const gh = fakeGh(t, dataFor(w, { issues: { [`${OWN}#31`]: { body: 'We keep ADR-1.\n', parent: `${OWN}#7` }, [`${OWN}#32`]: { fail: error } } }));
    for (const args of [['--issues'], ['--issues', '--strict']]) {
      const r = checked(w.dir, gh, ...args);
      const unread = coded(r, 'issue-unread');
      assert.equal(unread.length, 1, show(r));
      assert.ok(unread[0].line.includes(`${OWN}#32`), show(r));
      assert.equal(unread[0].id, `${NAME}/T2`, show(r));
      assert.equal(unread[0].severity, 'hint', show(r));
      assert.ok(unread[0].msg.includes('Could not resolve to an issue or pull request with the number of 32'), show(r));
      assert.ok(!r.stdout.includes('the second line of the error'), show(r));
      assert.ok(notKnown(r).includes(`${OWN}#32`), show(r));
      one(r, 'issue-superseded', `${OWN}#31`, 1);
      assertInfo(r, 1, 2);
    }
  });
});

// =====================================================================
// R1 and R2: every new finding is a hint in every mode (SP-5, SP-19).

describe('R1, R2 (SP-5, SP-17, SP-19): every new finding is a hint in every mode', () => {
  test('a world with each new code: each is a hint; --strict gives the same findings with the same severities; both exit 0', (t) => {
    const w = world(t, {
      config: { phrases: ['the requester'] },
      tasks: [{ id: 'T1', ref: 'issue #31' }, { id: 'T2', ref: 'acme/web#5' }, { id: 'T3', ref: '#32' }],
    });
    write(w.dir, SPEC, specText('The requester wants email.'));
    const gh = fakeGh(t, dataFor(w, {
      issues: {
        [`${OWN}#31`]: { body: 'We keep ADR-1.\n', parent: null },
        'acme/web#5': { body: 'See (#12).\nThe requester asked.\n', parent: `${OWN}#7` },
        [`${OWN}#32`]: { fail: 'HTTP 502: Bad Gateway' },
      },
    }));
    const plain = check(w.dir, gh, '--issues');
    const strict = check(w.dir, gh, '--issues', '--strict');
    assert.equal(plain.code, 0, show(plain));
    for (const code of NEW_CODES) assert.ok(coded(plain, code).length > 0, `${code} is given:\n${show(plain)}`);
    for (const f of newFindings(plain)) assert.equal(f.severity, 'hint', show(plain));
    assert.deepEqual(keys(strict.findings), keys(plain.findings), `the same findings in both modes:\n${show(plain)}\n${show(strict)}`);
    assert.deepEqual(notOk(plain), [], show(plain));
    assert.equal(strict.code, 0, `no new finding sets the exit code:\n${show(strict)}`);
    for (const c of gh.calls()) {
      assert.ok(
        (c.args[0] === 'repo' && c.args[1] === 'view') || (c.args[0] === 'issue' && c.args[1] === 'view'),
        `a read command only: gh ${c.args.join(' ')}`,
      );
    }
  });
});

// =====================================================================
// R2: phrases for the review (SP-17, SP-18, D6).

// A world for R2 with no tasks, and these phrases in the config (none when undefined).
const phraseWorld = (t, phrases, extra = {}) => world(t, { tasks: [], config: phrases === undefined ? {} : { phrases }, ...extra });
const phraseFindings = (r) => coded(r, 'phrase');

describe('R2 (SP-17, SP-18): the hint phrase', () => {
  test('no phrases: key, or an empty list: no phrase finding (control: the same text with the phrase listed gives one)', (t) => {
    for (const phrases of [undefined, []]) {
      const w = phraseWorld(t, phrases);
      write(w.dir, SPEC, specText('Mail goes to the requester.'));
      const gh = fakeGh(t, dataFor(w));
      assert.deepEqual(phraseFindings(checked(w.dir, gh)), [], `phrases: ${JSON.stringify(phrases)}`);
    }
    const w = phraseWorld(t, ['the requester']);
    write(w.dir, SPEC, specText('Mail goes to the requester.'));
    const r = checked(w.dir, fakeGh(t, dataFor(w)));
    one(r, 'phrase', SPEC, lineOf(read(w.dir, SPEC), 'the requester'));
  });

  test('a phrase matches ignoring case, at the file and line of the match; the hint names the entry and the text that matched; no gh call without --issues', (t) => {
    const w = phraseWorld(t, ['the requester']);
    write(w.dir, SPEC, specText('Mail goes to The Requester.'));
    const gh = fakeGh(t, dataFor(w));
    const r = checked(w.dir, gh);
    const f = one(r, 'phrase', SPEC, lineOf(read(w.dir, SPEC), 'The Requester'));
    assert.ok(f.msg.includes('the requester'), `the entry:\n${show(r)}`);
    assert.ok(f.msg.includes('The Requester'), `the text that matched:\n${show(r)}`);
    assert.deepEqual(gh.calls(), [], show(r));
  });

  test('a space in a phrase matches any run of white space, a line break too: the hint is at the line where the match starts', (t) => {
    const w = phraseWorld(t, ['the requester']);
    write(w.dir, SPEC, specText('Mail goes to the\nrequester by email, and a copy to the \t  requester\'s bank.'));
    const text = read(w.dir, SPEC);
    const r = checked(w.dir, fakeGh(t, dataFor(w)));
    const found = phraseFindings(r);
    assert.equal(found.length, 2, show(r));
    for (const f of found) assert.equal(f.file, SPEC, show(r));
    assert.deepEqual(found.map((f) => f.at).sort((a, b) => a - b), [lineOf(text, 'the\nrequester'), lineOf(text, 'the \t')].sort((a, b) => a - b), show(r));
  });

  test('a phrase is matched as text, not as a pattern: "a.b" does not match "axb"; "cost (net)" matches "Cost (net)"', (t) => {
    const w = phraseWorld(t, ['a.b', 'cost (net)']);
    write(w.dir, SPEC, specText('Write axb here.\nThe Cost (net) is shown.'));
    const r = checked(w.dir, fakeGh(t, dataFor(w)));
    const found = phraseFindings(r);
    assert.equal(found.length, 1, show(r));
    assert.equal(found[0].at, lineOf(read(w.dir, SPEC), 'The Cost (net)'), show(r));
    assert.ok(found[0].msg.includes('cost (net)'), show(r));
  });

  test('each match is one hint: two matches give two hints, at their lines', (t) => {
    const w = phraseWorld(t, ['the requester']);
    write(w.dir, SPEC, specText('Mail goes to the requester.\nThen the requester pays.'));
    const text = read(w.dir, SPEC);
    const r = checked(w.dir, fakeGh(t, dataFor(w)));
    assert.deepEqual(phraseFindings(r).map((f) => f.at).sort((a, b) => a - b), [lineOf(text, 'the requester', 0), lineOf(text, 'the requester', 1)], show(r));
  });

  test('a pattern is a regular expression matched as written: "Avery (asked|wants)" matches "Avery wants" and not "avery wants"; \\s+ matches across a line break', (t) => {
    const w = phraseWorld(t, [{ pattern: 'Avery (asked|wants)' }, { pattern: 'Lisa\\s+agreed' }]);
    write(w.dir, REQUEST_MD, `${read(w.dir, REQUEST_MD)}\nAvery wants it now.\nBut avery wants it later.\nLisa\nagreed.\n`);
    const text = read(w.dir, REQUEST_MD);
    const r = checked(w.dir, fakeGh(t, dataFor(w)));
    const found = phraseFindings(r);
    assert.deepEqual(found.map((f) => `${f.file}:${f.at}`).sort(), [`${REQUEST_MD}:${lineOf(text, 'Avery wants')}`, `${REQUEST_MD}:${lineOf(text, 'Lisa\nagreed')}`].sort(), show(r));
    const avery = found.find((f) => f.at === lineOf(text, 'Avery wants'));
    assert.ok(avery.msg.includes('Avery (asked|wants)'), `the entry:\n${show(r)}`);
    assert.ok(avery.msg.includes('Avery wants'), `the text that matched:\n${show(r)}`);
  });

  test('a match of no characters is not counted: \\b gives no hint; (?:QZQ)* gives one hint, for the one QZQ', (t) => {
    const w = phraseWorld(t, [{ pattern: '\\b' }, { pattern: '(?:QZQ)*' }]);
    write(w.dir, SPEC, specText('Mail goes to\nthe code QZQ by email.'));
    const r = checked(w.dir, fakeGh(t, dataFor(w)));
    const found = phraseFindings(r);
    assert.equal(found.length, 1, `only the one QZQ is a match of some characters:\n${show(r)}`);
    assert.equal(found[0].file, SPEC, show(r));
    assert.equal(found[0].at, lineOf(read(w.dir, SPEC), 'QZQ'), show(r));
  });

  test('the places read: the spec docs, the ADRs, and each Markdown file of an open request; not its origin/ folder, and not an archived request', (t) => {
    const w = phraseWorld(t, ['the requester'], { archived: { text: 'Ask the requester first.' } });
    // A task title in the request record names the requester too; the records are not a place that is read.
    editRecord(w.dir, NAME, (rec) => { rec.tasks = [{ id: 'T1', ref: 'Ask the requester' }]; });
    // Preconditions: the owner's words in origin/ name the requester; request.md does not yet.
    assert.ok(read(w.dir, `requests/${NAME}/origin/2026-05-04-owner-words.md`).includes('the requester'));
    assert.ok(!read(w.dir, REQUEST_MD).toLowerCase().includes('the requester'), read(w.dir, REQUEST_MD));
    write(w.dir, SPEC, specText('Mail goes to the requester.'));
    write(w.dir, ADR3, ADRS[ADR3].replace('Context: a PDF alone was not enough.', 'Context: the requester wanted email.'));
    write(w.dir, REQUEST_MD, `${read(w.dir, REQUEST_MD)}\nAsk the requester.\n`);
    write(w.dir, `requests/${NAME}/spec.md`, doc([['SP-1 note', '# Inv: the change'], ['SP-2 note', 'The requester signs.']]));
    write(w.dir, `requests/${NAME}/notes/plan.md`, '# Plan\n\nCall the requester.\n');
    const r = checked(w.dir, fakeGh(t, dataFor(w)));
    const at = (file, needle) => `${file}:${lineOf(read(w.dir, file), needle)}`;
    assert.deepEqual(phraseFindings(r).map((f) => `${f.file}:${f.at}`).sort(), [
      at(SPEC, 'the requester'),
      at(ADR3, 'the requester'),
      at(REQUEST_MD, 'the requester'),
      at(`requests/${NAME}/spec.md`, 'The requester'),
      at(`requests/${NAME}/notes/plan.md`, 'the requester'),
    ].sort(), `no hint in origin/ (its owner's words name the requester too), in requests/archive/ or in .assuredloop/records/:\n${show(r)}`);
  });

  test('with --issues, a phrase in an issue\'s body and in a visible comment: a hint at the issue and line, ID inv/T1; not in a minimized comment; without --issues: none from the issue', (t) => {
    const w = world(t, { config: { phrases: ['the requester'] } });
    const gh = fakeGh(t, dataFor(w, {
      issues: {
        [`${OWN}#31`]: {
          body: 'Intro.\nThe requester asked.\n',
          parent: `${OWN}#7`,
          comments: [{ body: 'Old: the requester.\n', hidden: true }, { body: 'Yes,\nthe\nrequester did.\n' }],
        },
      },
    }));
    const r = checked(w.dir, gh, '--issues');
    const found = phraseFindings(r).filter((f) => f.file.startsWith(`${OWN}#31`));
    assert.deepEqual(found.map((f) => `${f.file}:${f.at}`).sort(), [`${OWN}#31:2`, `${OWN}#31/comment-2:2`].sort(), show(r));
    for (const f of found) {
      assert.equal(f.id, `${NAME}/T1`, show(r));
      assert.equal(f.severity, 'hint', show(r));
    }
    gh.clear();
    const plain = checked(w.dir, gh);
    assert.deepEqual(phraseFindings(plain).filter((f) => f.file.includes('#')), [], show(plain));
    assert.deepEqual(gh.calls(), [], show(plain));
  });
});

describe('R2 (SP-18, D6): a bad phrases: is a refusal, exit 2, that names the entry', () => {
  const refusedFor = (t, phrases) => {
    const w = phraseWorld(t, phrases);
    const r = refused(w.dir, ['check'], { env: fakeGh(t, dataFor(w)).env });
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
