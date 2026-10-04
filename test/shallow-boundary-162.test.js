// A commit at the shallow boundary [VW-9] (#162): in a shallow clone, a
// commit whose parent is not in the clone looks, to git, as if it added every
// file in its tree. The tool must not report those files as that commit's
// changes (no false "changes specs/... with no request linked" note); its Not
// known line says "history unavailable" for that commit, naming it by its
// short sha. A commit whose parent is in the clone, and that really changes a
// spec file with no request linked, still gets the note; and in a full clone
// the PR head, which only touched a.txt, gets none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { makeRepo, cloneRepo, runAl, git, tempDir } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { addRequest, both, hasId, lineWith } from './helpers/request.js';
import { labelled } from './helpers/links.js';
import { assertCheckFrame, hint, message, noHint } from './helpers/hints.js';
import { short } from './helpers/evidence.js';

const PANEL = '# Panel\n\n## [P-1] One\nOne thing.\n';
const PANEL2 = '# Panel\n\n## [P-1] One\nOne thing, and a second.\n';

const notKnown = (out) => lines(out).at(-1) ?? '';
// Any line that says something "changes" the spec file.
const claimsPanel = (out) => lines(out).filter((l) => /\bchanges\b/.test(l) && l.includes('specs/panel.md'));

// Upstream: main has c1 (specs/panel.md and a.txt), then m.txt. Branch pr
// forks at c1: "one" appends to a.txt; the head (a Tier: 0 line) appends to
// a.txt again. Branch pr2 forks at c1 the same way, but its head edits
// specs/panel.md instead.
function upstream(t) {
  const repo = makeRepo(t);
  repo.write('specs/panel.md', PANEL);
  repo.write('a.txt', 'a\n');
  const c1 = repo.commit('c1', { date: '2026-09-01T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'pr']);
  repo.write('a.txt', 'a\nb\n');
  const one = repo.commit('one', { date: '2026-09-02T12:00:00Z' });
  repo.write('a.txt', 'a\nb\nc\n');
  const head = repo.commit(message('touch a.txt', { tier: '0 — touch a.txt' }), { date: '2026-09-03T12:00:00Z' });
  assert.equal(repo.git(['show', '--name-only', '--format=', head]), 'a.txt', 'the fixture: the PR head only touches a.txt');
  repo.git(['checkout', '-q', '-b', 'pr2', c1]);
  repo.write('a.txt', 'a\nb\n');
  const one2 = repo.commit('one', { date: '2026-09-02T12:00:00Z' });
  repo.write('specs/panel.md', PANEL2);
  const panelHead = repo.commit(message('edit the panel', { tier: '0 — edit the panel' }), { date: '2026-09-03T13:00:00Z' });
  assert.equal(repo.git(['show', '--name-only', '--format=', panelHead]), 'specs/panel.md', 'the fixture: pr2\'s head only touches specs/panel.md');
  repo.git(['checkout', '-q', 'main']);
  repo.write('m.txt', 'm\n');
  repo.commit('m', { date: '2026-09-04T12:00:00Z' });
  return { repo, one, head, one2, panelHead };
}

// The issue's clone: main and the PR branch at depth 1 each, the PR head
// checked out. `depth` fetches the PR branch that deep instead.
function shallowPr(t, repo, branch, { depth = 1 } = {}) {
  const clone = cloneRepo(t, repo, { depth: 1, singleBranch: false });
  clone.git(['fetch', '-q', '--depth', String(depth), 'origin', branch]);
  clone.git(['checkout', '-q', 'FETCH_HEAD']);
  assert.equal(clone.git(['rev-parse', '--is-shallow-repository']), 'true');
  return clone;
}

function boundary(t) {
  const { repo, head } = upstream(t);
  const clone = shallowPr(t, repo, 'pr');
  assert.equal(clone.head(), head, 'the fixture: the PR head is checked out');
  assert.ok(readFileSync(join(clone.dir, '.git', 'shallow'), 'utf8').includes(head), 'the fixture: the PR head is a shallow boundary');
  assert.throws(() => clone.git(['rev-parse', '--verify', '-q', `${head}^`]), 'the fixture: the PR head\'s parent is not in the clone');
  clone.git(['rev-parse', '--verify', 'origin/main']);
  return { clone, head };
}

test('[VW-9] #162 a shallow clone whose PR head sits at the boundary: check and check --all never say it changes specs/panel.md (it only touched a.txt)', (t) => {
  const { clone, head } = boundary(t);
  for (const args of [['check'], ['check', '--all']]) {
    const r = runAl(clone.dir, args);
    assert.equal(r.code, 0, both(r));
    assertCheckFrame(r.stdout, 'origin/main');
    assert.deepEqual(claimsPanel(r.stdout), [], `${args.join(' ')}: no line should say a commit changes specs/panel.md:\n${r.stdout}`);
    assert.ok(!r.stdout.includes('changes specs/panel.md'), `${args.join(' ')}:\n${r.stdout}`);
    const falseFile = lines(r.stdout).filter((l) => l.includes(short(head)) && /\bchanges\b/.test(l) && /specs\/|README\.md/.test(l));
    assert.deepEqual(falseFile, [], `${args.join(' ')}: no line should say ${short(head)} changes a file it did not change:\n${r.stdout}`);
  }
});

test('[VW-9] #162 a shallow clone whose PR head sits at the boundary: check\'s Not known line says "history unavailable" and names the head\'s short sha', (t) => {
  const { clone, head } = boundary(t);
  for (const args of [['check'], ['check', '--all']]) {
    const r = runAl(clone.dir, args);
    assert.equal(r.code, 0, both(r));
    const nk = notKnown(r.stdout);
    assert.match(nk, /^Not known\b/, r.stdout);
    assert.ok(nk.includes('history unavailable'), `${args.join(' ')}: the Not known line should say "history unavailable":\n${r.stdout}`);
    assert.ok(nk.includes(short(head)), `${args.join(' ')}: the Not known line should name ${short(head)}, the commit whose parent is not in the clone:\n${r.stdout}`);
  }
});

test('[VW-9] #162 a shallow clone whose PR head sits at the boundary: check --strict exits 0', (t) => {
  const { clone } = boundary(t);
  const r = runAl(clone.dir, ['check', '--strict']);
  assert.equal(r.code, 0, `check --strict should exit 0:\n${both(r)}`);
  assertCheckFrame(r.stdout, 'origin/main');
});

test('[VW-9] #162 a shallow clone whose PR head sits at the boundary: context --diff origin/main..HEAD exits 0, never says it changes specs/panel.md, and its Not known line says "history unavailable" naming the short sha', (t) => {
  const { clone, head } = boundary(t);
  const r = runAl(clone.dir, ['context', '--diff', 'origin/main..HEAD']);
  assert.equal(r.code, 0, both(r));
  assert.deepEqual(claimsPanel(r.stdout), [], `no line should say a commit changes specs/panel.md:\n${r.stdout}`);
  assert.ok(!r.stdout.includes('changes specs/panel.md'), r.stdout);
  const nk = notKnown(r.stdout);
  assert.match(nk, /^Not known\b/, r.stdout);
  assert.ok(nk.includes('history unavailable'), `the Not known line should say "history unavailable":\n${r.stdout}`);
  assert.ok(nk.includes(short(head)), `the Not known line should name ${short(head)}:\n${r.stdout}`);
});

test('[VW-9] #162 control: in a shallow clone, a commit whose parent IS in the clone and that edits specs/panel.md with no request linked still gets the note', (t) => {
  const { repo, one2, panelHead } = upstream(t);
  const clone = shallowPr(t, repo, 'pr2', { depth: 2 });
  assert.equal(clone.head(), panelHead, 'the fixture: pr2\'s head is checked out');
  assert.equal(clone.git(['rev-parse', `${panelHead}^`]), one2, 'the fixture: the head\'s parent is in the clone');
  const r = runAl(clone.dir, ['check', '--all']);
  assert.equal(r.code, 0, both(r));
  hint(r.stdout, 'note', short(panelHead), 'changes specs/panel.md', 'no request linked');
});

test('[VW-9] #162 the PR branch fetched two deep: the boundary commit below a real spec edit gets no false note and the Not known line names it; the real edit keeps its note', (t) => {
  const { repo, one2, panelHead } = upstream(t);
  const clone = shallowPr(t, repo, 'pr2', { depth: 2 });
  assert.ok(readFileSync(join(clone.dir, '.git', 'shallow'), 'utf8').includes(one2), 'the fixture: pr2\'s "one" is the shallow boundary');
  const r = runAl(clone.dir, ['check', '--all']);
  assert.equal(r.code, 0, both(r));
  hint(r.stdout, 'note', short(panelHead), 'changes specs/panel.md', 'no request linked');
  const falseNote = lines(r.stdout).filter((l) => l.includes(short(one2)) && /\bchanges\b/.test(l));
  assert.deepEqual(falseNote, [], `${short(one2)} only touched a.txt; no line should say it changes a file:\n${r.stdout}`);
  assert.ok(notKnown(r.stdout).includes(short(one2)), `the Not known line should name ${short(one2)}, whose parent is not in the clone:\n${r.stdout}`);
});

test('[VW-9] #162 control: in a full clone the PR head (only a.txt) gets no "changes specs/panel.md" note', (t) => {
  const { repo, head } = upstream(t);
  const clone = cloneRepo(t, repo);
  clone.git(['checkout', '-q', '-b', 'pr', 'origin/pr']);
  assert.equal(clone.git(['rev-parse', '--is-shallow-repository']), 'false');
  assert.equal(clone.head(), head);
  const r = runAl(clone.dir, ['check', '--all']);
  assert.equal(r.code, 0, both(r));
  assertCheckFrame(r.stdout, 'origin/main');
  assert.deepEqual(claimsPanel(r.stdout), [], r.stdout);
  assert.ok(!r.stdout.includes('history unavailable'), `a full clone has its history:\n${r.stdout}`);
});

// --- From the PR #163 review: an unknown file list is not an empty one ---
// Where a commit's parent is past the shallow boundary, what it changed is
// unknown [VW-9]: the tool must not turn that into a definite absence ("with
// no request", "linked to no served request", no blocked-delivery hint) any
// more than into a definite presence.

const P1 = '## [P-1] Panel\nOne thing.\n';
const review = (dir) => runAl(dir, ['context', '--diff', 'origin/main..HEAD', '--for', 'review']);

// The PR branch checked out in a full clone, or (shallow) in the issue's
// depth-1 clone with origin/main, where its head sits at the boundary.
function prClone(t, repo, head, { shallow }) {
  let clone;
  if (shallow) {
    clone = shallowPr(t, repo, 'pr');
    assert.ok(readFileSync(join(clone.dir, '.git', 'shallow'), 'utf8').includes(head), 'the fixture: the PR head is a shallow boundary');
    assert.throws(() => clone.git(['rev-parse', '--verify', '-q', `${head}^`]), 'the fixture: the PR head\'s parent is not in the clone');
  } else {
    clone = cloneRepo(t, repo);
    clone.git(['checkout', '-q', '-b', 'pr', 'origin/pr']);
    assert.equal(clone.git(['rev-parse', '--is-shallow-repository']), 'false');
  }
  assert.equal(clone.head(), head, 'the fixture: the PR head is checked out');
  return clone;
}

// A, the folder route: `dates` (signed off) is on main; the PR head, with no
// Request: line, adds a Parts section to requests/dates/request.md and adds
// src/dates.js.
function folderRoute(t) {
  const repo = makeRepo(t);
  repo.write('specs/panel.md', P1);
  addRequest(repo, 'dates', null, { decisions: '' });
  repo.commit('dates request\n\nRequest: dates', { date: '2026-09-01T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'pr']);
  repo.write('requests/dates/request.md', repo.read('requests/dates/request.md').toString() + '\n## Parts\n\nPart A: dates code.\n');
  repo.write('src/dates.js', 'export const value = 1;\n');
  const head = repo.commit(message('dates work', { tier: '2 — dates' }), { date: '2026-09-02T12:00:00Z' });
  assert.equal(repo.git(['show', '--name-only', '--format=', head]), 'requests/dates/request.md\nsrc/dates.js', 'the fixture: the head touches the request folder and src/dates.js');
  assert.ok(!repo.git(['log', '-1', '--format=%B', head]).includes('Request:'), 'the fixture: no Request: line');
  repo.git(['checkout', '-q', 'main']);
  return { repo, head };
}

test('[VW-9] #162 review: the folder route at the shallow boundary: Serves does not count the commit as "with no request", and says "history unavailable"', (t) => {
  const { repo, head } = folderRoute(t);
  const r = review(prClone(t, repo, head, { shallow: true }).dir);
  assert.equal(r.code, 0, both(r));
  const serves = labelled(r.stdout, 'Serves');
  assert.ok(serves, `a Serves line:\n${r.stdout}`);
  assert.doesNotMatch(serves, /with no request/, `${short(head)}'s files are unknown, not known to name no request:\n${r.stdout}`);
  assert.ok(serves.includes('history unavailable'), `the Serves line should say "history unavailable" for ${short(head)}:\n${r.stdout}`);
});

test('[VW-9] #162 review: the folder route at the shallow boundary: Unlinked does not list src/dates.js as linked to no served request, and says "history unavailable"', (t) => {
  const { repo, head } = folderRoute(t);
  const r = review(prClone(t, repo, head, { shallow: true }).dir);
  assert.equal(r.code, 0, both(r));
  assert.ok(!lineWith(r.stdout, 'src/dates.js', 'linked to no served request'), `src/dates.js's link is unknown, not absent:\n${r.stdout}`);
  const unlinked = labelled(r.stdout, 'Unlinked');
  assert.ok(unlinked, `an Unlinked line:\n${r.stdout}`);
  assert.ok(unlinked.includes('history unavailable'), `the Unlinked line should say "history unavailable":\n${r.stdout}`);
});

test('[VW-9] #162 review control: the folder route in a full clone: Serves dates (folder) with no unattributed commit, Unlinked none, no "history unavailable"', (t) => {
  const { repo, head } = folderRoute(t);
  const r = review(prClone(t, repo, head, { shallow: false }).dir);
  assert.equal(r.code, 0, both(r));
  const serves = labelled(r.stdout, 'Serves');
  assert.match(serves, /^Serves\s+dates \(folder\)$/, r.stdout);
  assert.match(labelled(r.stdout, 'Unlinked'), /^Unlinked\s+none$/, r.stdout);
  assert.ok(!r.stdout.includes('history unavailable'), r.stdout);
});

// B, a Request: line: `dates` is not signed off; the PR head says
// Request: dates and adds src/work.js. With `merge`, main then moves on and
// the branch merges it (`head` stays the src/work.js commit).
function requestLine(t, { merge = false } = {}) {
  const repo = makeRepo(t);
  repo.write('specs/panel.md', P1);
  addRequest(repo, 'dates', null, { signed: false, decisions: '' });
  repo.commit('dates request', { date: '2026-09-01T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'pr']);
  repo.write('src/work.js', 'export const answer = 42;\n');
  const head = repo.commit(message('work', { request: 'dates', tier: '2 — implement dates' }), { date: '2026-09-02T12:00:00Z' });
  assert.equal(repo.git(['show', '--name-only', '--format=', head]), 'src/work.js', 'the fixture: the head adds src/work.js');
  if (merge) {
    repo.git(['checkout', '-q', 'main']);
    repo.write('main.txt', 'main\n');
    repo.commit('main work', { date: '2026-09-03T12:00:00Z' });
    repo.git(['checkout', '-q', 'pr']);
    repo.git(['merge', '-q', '--no-ff', '-m', message('merge main', { request: 'dates', tier: '2 — implement dates' }), 'main'], { date: '2026-09-04T12:00:00Z' });
  }
  repo.git(['checkout', '-q', 'main']);
  return { repo, head };
}

const BLOCKED = ['delivers work for dates', 'blocked (awaiting owner sign-off)'];

test('[VW-9] #162 review: a Request: line at the shallow boundary: the review does not list src/work.js as linked to no served request', (t) => {
  const { repo, head } = requestLine(t);
  const r = review(prClone(t, repo, head, { shallow: true }).dir);
  assert.equal(r.code, 0, both(r));
  assert.ok(!lineWith(r.stdout, 'src/work.js', 'linked to no served request'), `src/work.js's link is unknown, not absent:\n${r.stdout}`);
});

test('[VW-9] #162 check: a Request: line at the shallow boundary with no merge-base in the clone: what the branch delivers is unknown, so no "delivers work for dates" not ok, and Not known says "history unavailable" naming the commit (a full clone gives the not ok)', (t) => {
  const { repo, head } = requestLine(t);
  const full = runAl(prClone(t, repo, head, { shallow: false }).dir, ['check', '--all']);
  assert.equal(full.code, 0, both(full));
  hint(full.stdout, 'not ok', ...BLOCKED);
  const clone = prClone(t, repo, head, { shallow: true });
  assert.throws(() => clone.git(['merge-base', 'origin/main', 'HEAD']), 'the fixture: no merge-base in the clone');
  const r = runAl(clone.dir, ['check', '--all']);
  assert.equal(r.code, 0, both(r));
  assertCheckFrame(r.stdout, 'origin/main');
  noHint(r.stdout, 'not ok', 'delivers work for dates');
  const nk = notKnown(r.stdout);
  assert.ok(nk.includes('history unavailable'), `the Not known line should say "history unavailable":\n${r.stdout}`);
  assert.ok(nk.includes(short(head)), `the Not known line should name ${short(head)}:\n${r.stdout}`);
});

test('[VW-9] #162 check: a Request: line at the shallow boundary with a known merge-base, its work still in the final state: the blocked-delivery not ok for dates a full clone gives is still given', (t) => {
  const { repo, head } = requestLine(t, { merge: true });
  const full = runAl(prAt(t, repo).dir, ['check', '--all']);
  assert.equal(full.code, 0, both(full));
  const fullLine = hint(full.stdout, 'not ok', ...BLOCKED);
  const clone = prAt(t, repo, 2);
  assert.ok(isBoundary(clone, head), 'the fixture: the src/work.js commit is the shallow boundary');
  const base = clone.git(['merge-base', 'origin/main', 'HEAD']);
  assert.ok(clone.git(['diff', '--name-only', base, 'HEAD']).split('\n').includes('src/work.js'), 'the fixture: the branch leaves src/work.js changed against its fork');
  const r = runAl(clone.dir, ['check', '--all']);
  assert.equal(r.code, 0, both(r));
  assertCheckFrame(r.stdout, 'origin/main');
  assert.ok(lines(r.stdout).includes(fullLine), `the full clone's line should be given:\n${fullLine}\n---\n${r.stdout}`);
});

test('[VW-9] #162 review control: a Request: line in a full clone: Unlinked none, and the blocked-delivery not ok for dates', (t) => {
  const { repo, head } = requestLine(t);
  const r = review(prClone(t, repo, head, { shallow: false }).dir);
  assert.equal(r.code, 0, both(r));
  assert.match(labelled(r.stdout, 'Unlinked'), /^Unlinked\s+none$/, r.stdout);
  hint(r.stdout, 'not ok', ...BLOCKED);
});

// C, a root made by .git/info/grafts in a full repo: git reads it as a root,
// so its files are all of its tree (README.md from the initial commit, and
// specs/panel.md). `how` is 'grafts', 'replace' (git replace --graft) or
// 'root' (a real root commit holding both files).
function rooted(t, how) {
  let dir;
  if (how === 'root') {
    const base = tempDir(t);
    dir = join(base, 'repo');
    git(base, ['init', '-q', dir]);
  } else {
    dir = makeRepo(t).dir;
  }
  const date = '2026-09-01T12:00:00Z';
  const write = (rel, text) => { mkdirSync(join(dir, dirname(rel)), { recursive: true }); writeFileSync(join(dir, rel), text); };
  if (how === 'root') write('README.md', 'fixture\n');
  write('specs/panel.md', P1);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'panel'], { date });
  const sha = git(dir, ['rev-parse', 'HEAD']);
  if (how === 'grafts') write('.git/info/grafts', `${sha}\n`);
  if (how === 'replace') git(dir, ['replace', '--graft', sha]);
  assert.equal(git(dir, ['rev-parse', '--is-shallow-repository']), 'false', 'the fixture: not shallow');
  assert.throws(() => git(dir, ['rev-parse', '--verify', '-q', `${sha}^`]), 'the fixture: git reads the commit as a root');
  assert.equal(git(dir, ['diff-tree', '-r', '--no-commit-id', '--name-only', '--root', sha]), 'README.md\nspecs/panel.md', 'the fixture: as a root, its files are all of its tree');
  return dir;
}

for (const how of ['grafts', 'replace', 'root']) {
  const name = { grafts: 'a root made by .git/info/grafts in a full repo', replace: 'control: a root made by git replace --graft', root: 'control: a real root commit' }[how];
  test(`[VW-9] #162 ${name}: context P-1 keeps the co-change link to README.md, and nothing says "history unavailable"`, (t) => {
    const dir = rooted(t, how);
    const r = runAl(dir, ['context', 'P-1']);
    assert.equal(r.code, 0, both(r));
    assert.ok(lineWith(r.stdout, 'README.md', 'changed together'), `a co-change link to README.md:\n${r.stdout}`);
    assert.ok(!both(r).includes('history unavailable'), both(r));
  });
}

// --- From the second review of PR #163: possibly touched is not delivered ---
// A boundary commit's files are unknown. A read bounded by the branch's final
// state (the files it leaves changed against its fork) treats that commit as
// possibly touching anything there: it neither invents work the final state
// does not hold nor drops work it does hold. A command that writes facts into
// a record refuses rather than write what history cannot establish.

// The PR branch checked out as `pr`: from a full clone, or a shallow one of
// `depth` (main and the branch both at that depth).
function prAt(t, repo, depth) {
  const clone = depth ? cloneRepo(t, repo, { depth, singleBranch: false }) : cloneRepo(t, repo);
  clone.git(['checkout', '-q', '-b', 'pr', 'origin/pr']);
  assert.equal(clone.git(['rev-parse', '--is-shallow-repository']), depth ? 'true' : 'false');
  return clone;
}
const isBoundary = (clone, sha) => readFileSync(join(clone.dir, '.git', 'shallow'), 'utf8').split('\n').includes(sha);
const strictAll = (clone) => runAl(clone.dir, ['check', '--strict', '--all']);

// D, E: `dates` is open and not signed off. D: the PR head is an empty commit
// with Request: dates. E (`record`): the PR's first commit, with Request:
// dates, only appends a Parts section to requests/dates/request.md; then main
// moves on and the branch merges it.
function datesBranch(t, { record }) {
  const repo = makeRepo(t);
  repo.write('specs/panel.md', P1);
  addRequest(repo, 'dates', null, { signed: false, decisions: '' });
  repo.commit('dates request', { date: '2026-09-01T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'pr']);
  if (record) repo.write('requests/dates/request.md', repo.read('requests/dates/request.md').toString() + '\n## Parts\n\nPart A: discussion only.\n');
  const first = repo.commit(message('discussion only', { request: 'dates', tier: '2 — discussion only' }), { date: '2026-09-02T12:00:00Z' });
  if (record) {
    repo.git(['checkout', '-q', 'main']);
    repo.write('main.txt', 'main\n');
    repo.commit('main work', { date: '2026-09-03T12:00:00Z' });
    repo.git(['checkout', '-q', 'pr']);
    repo.git(['merge', '-q', '--no-ff', '-m', message('merge main', { request: 'dates', tier: '2 — discussion only' }), 'main'], { date: '2026-09-04T12:00:00Z' });
  }
  repo.git(['checkout', '-q', 'main']);
  return { repo, first };
}

test('[VW-9] #162 an empty commit with Request: dates (unsigned) at the shallow boundary: check --strict --all exits 0, with no "delivers work for dates" not ok', (t) => {
  const { repo, first } = datesBranch(t, { record: false });
  const clone = prAt(t, repo, 1);
  assert.equal(clone.head(), first);
  assert.ok(isBoundary(clone, first), 'the fixture: the empty commit is the shallow boundary');
  assert.equal(clone.git(['diff', '--name-only', 'origin/main', 'HEAD']), '', 'the fixture: the branch leaves main\'s tree as it is');
  const r = strictAll(clone);
  assert.equal(r.code, 0, `check --strict --all should exit 0:\n${both(r)}`);
  noHint(r.stdout, 'not ok', 'delivers work for dates');
});

test('[VW-9] #162 control: the empty commit with Request: dates in a full clone: check --strict --all exits 0, with no "delivers work for dates" not ok', (t) => {
  const { repo } = datesBranch(t, { record: false });
  const r = strictAll(prAt(t, repo));
  assert.equal(r.code, 0, both(r));
  noHint(r.stdout, 'not ok', 'delivers work for dates');
});

test('[VW-9] #162 a record-only branch whose first commit is the shallow boundary, with a known merge-base: check --strict --all exits 0, with no "delivers work for dates" not ok', (t) => {
  const { repo, first } = datesBranch(t, { record: true });
  const clone = prAt(t, repo, 2);
  assert.ok(isBoundary(clone, first), 'the fixture: the record-only commit is the shallow boundary');
  clone.git(['merge-base', 'origin/main', 'HEAD']);
  assert.equal(clone.git(['diff', '--name-only', 'origin/main', 'HEAD']), 'requests/dates/request.md', 'the fixture: the branch leaves only request.md changed');
  const r = strictAll(clone);
  assert.equal(r.code, 0, `check --strict --all should exit 0:\n${both(r)}`);
  noHint(r.stdout, 'not ok', 'delivers work for dates');
});

test('[VW-9] #162 control: the record-only branch in a full clone: check --strict --all exits 0, with no "delivers work for dates" not ok', (t) => {
  const { repo } = datesBranch(t, { record: true });
  const r = strictAll(prAt(t, repo));
  assert.equal(r.code, 0, both(r));
  noHint(r.stdout, 'not ok', 'delivers work for dates');
});

// F: `panel`, tier 1 and signed off, amends [P-1]. On the PR branch a
// Request: panel commit modifies [P-1]; then main moves on and the branch
// merges it. At depth 2 the merge-base is in the clone and the spec edit's
// commit is the shallow boundary.
const PANEL_ORG = '## Organized requirement\n\nR1: Panel MUST include a second thing. Amends: [P-1]\n';
function panelBranch(t) {
  const repo = makeRepo(t);
  repo.write('specs/panel.md', P1);
  addRequest(repo, 'panel', null, { org: PANEL_ORG, signedText: PANEL_ORG, line: 'Type: story · Tier: 1 · Status: open', decisions: '' });
  repo.commit('signed panel request', { date: '2026-09-01T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'pr']);
  repo.write('specs/panel.md', '## [P-1] Panel\nOne thing and a second.\n');
  const edit = repo.commit(message('change panel', { request: 'panel', tier: '1 — panel' }), { date: '2026-09-02T12:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  repo.write('main.txt', 'main\n');
  repo.commit('main work', { date: '2026-09-03T12:00:00Z' });
  repo.git(['checkout', '-q', 'pr']);
  repo.git(['merge', '-q', '--no-ff', '-m', message('merge main', { request: 'panel', tier: '1 — panel' }), 'main'], { date: '2026-09-04T12:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  return { repo, edit };
}
function panelShallow(t) {
  const { repo, edit } = panelBranch(t);
  const clone = prAt(t, repo, 2);
  assert.ok(isBoundary(clone, edit), 'the fixture: the spec edit\'s commit is the shallow boundary');
  clone.git(['merge-base', 'origin/main', 'HEAD']);
  assert.equal(clone.git(['diff', '--name-only', 'origin/main', 'HEAD']), 'specs/panel.md', 'the fixture: the branch leaves specs/panel.md changed');
  return { clone, edit };
}

test('[VW-9] #162 a tier-1 spec edit at the shallow boundary: the review\'s Blocks line names [P-1] for panel, never "none changed by this branch"', (t) => {
  const { repo } = panelBranch(t);
  const full = review(prAt(t, repo).dir);
  assert.equal(full.code, 0, both(full));
  assert.ok(labelled(full.stdout, 'Blocks').includes('this branch changes [P-1]'), `the full clone's Blocks line:\n${full.stdout}`);
  const { clone } = panelShallow(t);
  const r = review(clone.dir);
  assert.equal(r.code, 0, both(r));
  const blocks = labelled(r.stdout, 'Blocks');
  assert.ok(!blocks.includes('none changed by this branch'), `[P-1] is changed in the branch's final state:\n${r.stdout}`);
  assert.ok(blocks.includes('[P-1]'), `the Blocks line should name [P-1], as the full clone's does ("no change.md; this branch changes [P-1] for it"):\n${r.stdout}`);
});

test('[VW-9] #162 a tier-1 spec edit at the shallow boundary: conclude panel (preview) says "history unavailable" and exits 2', (t) => {
  const { clone } = panelShallow(t);
  const r = runAl(clone.dir, ['conclude', 'panel']);
  assert.equal(r.code, 2, `conclude should refuse:\n${both(r)}`);
  assert.ok(both(r).includes('history unavailable'), both(r));
  assert.doesNotMatch(both(r), /Modified: none/, both(r));
});

test('[VW-9] #162 a tier-1 spec edit at the shallow boundary: conclude panel --yes says "history unavailable", exits 2, and writes nothing', (t) => {
  const { clone } = panelShallow(t);
  const before = readFileSync(join(clone.dir, 'requests/panel/request.md'), 'utf8');
  const r = runAl(clone.dir, ['conclude', 'panel', '--yes']);
  assert.equal(r.code, 2, `conclude --yes should refuse:\n${both(r)}`);
  assert.ok(both(r).includes('history unavailable'), both(r));
  assert.ok(!existsSync(join(clone.dir, 'requests/archive/panel')), 'no requests/archive/panel/');
  assert.equal(readFileSync(join(clone.dir, 'requests/panel/request.md'), 'utf8'), before, 'requests/panel/request.md unchanged');
  assert.equal(clone.git(['status', '--porcelain']), '', 'the work tree is clean');
});

test('[VW-9] #162 control: the tier-1 spec edit in a full clone: conclude panel --yes writes "- Modified: [P-1]"', (t) => {
  const { repo } = panelBranch(t);
  const clone = prAt(t, repo);
  const r = runAl(clone.dir, ['conclude', 'panel', '--yes']);
  assert.equal(r.code, 0, both(r));
  const md = readFileSync(join(clone.dir, 'requests/archive/panel/request.md'), 'utf8');
  assert.ok(lines(md).includes('- Modified: [P-1]'), md);
  assert.ok(!both(r).includes('history unavailable'), both(r));
});

// G: a blocked request's edit to baseline text outside any section with an
// ID. `dates` is open and not signed off; the boundary commit, with Request:
// dates, changes only the intro of specs/panel.md (before its first `## [P-1]`
// heading); then main moves on and the branch merges it. At depth 2 the
// merge-base is in the clone and that commit is the shallow boundary.
function introEdit(t) {
  const repo = makeRepo(t);
  repo.write('specs/panel.md', `# Panel\n\nThe panel shows things.\n\n${P1}`);
  addRequest(repo, 'dates', null, { signed: false, decisions: '' });
  repo.commit('dates request', { date: '2026-09-01T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'pr']);
  repo.write('specs/panel.md', `# Panel\n\nThe panel shows things, and dates.\n\n${P1}`);
  const edit = repo.commit(message('panel intro', { request: 'dates', tier: '2 — panel intro' }), { date: '2026-09-02T12:00:00Z' });
  assert.equal(repo.git(['show', '--name-only', '--format=', edit]), 'specs/panel.md', 'the fixture: the commit touches only specs/panel.md');
  assert.doesNotMatch(repo.git(['show', '--format=', edit]), /^[-+].*\[P-1\]|^[-+]One thing\./m, 'the fixture: the edit is outside [P-1]');
  repo.git(['checkout', '-q', 'main']);
  repo.write('main.txt', 'main\n');
  repo.commit('main work', { date: '2026-09-03T12:00:00Z' });
  repo.git(['checkout', '-q', 'pr']);
  repo.git(['merge', '-q', '--no-ff', '-m', message('merge main', { request: 'dates', tier: '2 — panel intro' }), 'main'], { date: '2026-09-04T12:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  return { repo, edit };
}

test('[VW-9] #162 check: a blocked request\'s edit to spec text outside any ID\'d section, at the shallow boundary with a known merge-base: the blocked-delivery not ok for dates a full clone gives is still given', (t) => {
  const { repo, edit } = introEdit(t);
  const full = runAl(prAt(t, repo).dir, ['check', '--all']);
  assert.equal(full.code, 0, both(full));
  const fullLine = hint(full.stdout, 'not ok', ...BLOCKED);
  const clone = prAt(t, repo, 2);
  assert.ok(isBoundary(clone, edit), 'the fixture: the intro edit\'s commit is the shallow boundary');
  const base = clone.git(['merge-base', 'origin/main', 'HEAD']);
  assert.ok(clone.git(['diff', '--name-only', base, 'HEAD']).split('\n').includes('specs/panel.md'), 'the fixture: the branch leaves specs/panel.md changed against its fork');
  const r = runAl(clone.dir, ['check', '--all']);
  assert.equal(r.code, 0, both(r));
  assertCheckFrame(r.stdout, 'origin/main');
  assert.ok(lines(r.stdout).includes(fullLine), `the full clone's line should be given:\n${fullLine}\n---\n${r.stdout}`);
});

// --- From the third review of PR #163: removals are part of the final state ---
// H: with a known merge-base, a boundary commit's removals are in the
// branch's final state, and a read bounded by it keeps them. Each case runs
// the same command in a full clone and takes its text from that run.

const P12 = '## [P-1] Panel\nFirst requirement.\n\n## [P-2] Second\nSecond requirement.\n';
const RETIRE_ORG = '## Organized requirement\n\nR1: Panel MUST retire its first requirement. Amends: [P-1]\n';

// `kind`: 'deleted-file' (a Request: panel commit deletes specs/panel.md),
// 'removed-section' (it removes [P-1] and leaves [P-2] as it was), or
// 'deleted-code' (a Request: dates commit deletes src/work.js, on main
// before). `panel` is tier 1 and signed off; `dates` is open and unsigned.
// Then main moves on and the branch merges it.
function removal(t, kind) {
  const repo = makeRepo(t);
  repo.write('specs/panel.md', P12);
  const name = kind === 'deleted-code' ? 'dates' : 'panel';
  if (kind === 'deleted-code') {
    repo.write('src/work.js', 'export const answer = 42;\n');
    addRequest(repo, 'dates', null, { signed: false, decisions: '' });
  } else {
    addRequest(repo, 'panel', null, { org: RETIRE_ORG, signedText: RETIRE_ORG, line: 'Type: story · Tier: 1 · Status: open', decisions: '' });
  }
  repo.commit('baseline with request', { date: '2026-09-01T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'pr']);
  if (kind === 'deleted-file') rmSync(join(repo.dir, 'specs/panel.md'));
  if (kind === 'removed-section') repo.write('specs/panel.md', '## [P-2] Second\nSecond requirement.\n');
  if (kind === 'deleted-code') rmSync(join(repo.dir, 'src/work.js'));
  const tier = kind === 'deleted-code' ? '2 — removal' : '1 — removal';
  const edit = repo.commit(message('remove old work', { request: name, tier }), { date: '2026-09-02T12:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  repo.write('main.txt', 'main\n');
  repo.commit('main work', { date: '2026-09-03T12:00:00Z' });
  repo.git(['checkout', '-q', 'pr']);
  repo.git(['merge', '-q', '--no-ff', '-m', message('merge main', { request: name, tier }), 'main'], { date: '2026-09-04T12:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  return { repo, edit };
}
// The depth-2 clone: the removal's commit is the shallow boundary, the
// merge-base is in the clone, and the branch leaves `delta` changed against it.
function removalShallow(t, repo, edit, delta) {
  const clone = prAt(t, repo, 2);
  assert.ok(isBoundary(clone, edit), 'the fixture: the removal\'s commit is the shallow boundary');
  const base = clone.git(['merge-base', 'origin/main', 'HEAD']);
  assert.equal(clone.git(['diff', '--name-status', base, 'HEAD']), delta, 'the fixture: what the branch leaves changed against its fork');
  return clone;
}
const namesIds = (text) => ['P-1', 'P-2'].filter((id) => hasId(text, id));

test('[VW-9] #162 H1 a tier-1 deletion of specs/panel.md at the shallow boundary, known merge-base: the review\'s Blocks line names the removed IDs as a full clone does, never "none changed by this branch"', (t) => {
  const { repo, edit } = removal(t, 'deleted-file');
  const full = review(prAt(t, repo).dir);
  assert.equal(full.code, 0, both(full));
  const fullBlocks = labelled(full.stdout, 'Blocks');
  assert.deepEqual(namesIds(fullBlocks), ['P-1', 'P-2'], `the full clone's Blocks line:\n${full.stdout}`);
  const r = review(removalShallow(t, repo, edit, 'D\tspecs/panel.md').dir);
  assert.equal(r.code, 0, both(r));
  const blocks = labelled(r.stdout, 'Blocks');
  assert.ok(!blocks.includes('none changed by this branch'), `the deletion is in the branch's final state:\n${r.stdout}`);
  assert.deepEqual(namesIds(blocks), namesIds(fullBlocks), `the Blocks line should name what the full clone's does (${fullBlocks}):\n${r.stdout}`);
});

test('[VW-9] #162 H2 a tier-1 removal of [P-1] (with [P-2] left as it was) at the shallow boundary, known merge-base: the review\'s Blocks line names [P-1] as a full clone does', (t) => {
  const { repo, edit } = removal(t, 'removed-section');
  const full = review(prAt(t, repo).dir);
  assert.equal(full.code, 0, both(full));
  const fullBlocks = labelled(full.stdout, 'Blocks');
  assert.deepEqual(namesIds(fullBlocks), ['P-1'], `the full clone's Blocks line:\n${full.stdout}`);
  const r = review(removalShallow(t, repo, edit, 'M\tspecs/panel.md').dir);
  assert.equal(r.code, 0, both(r));
  const blocks = labelled(r.stdout, 'Blocks');
  assert.ok(!blocks.includes('none changed by this branch'), `the removal of [P-1] is in the branch's final state:\n${r.stdout}`);
  assert.deepEqual(namesIds(blocks), namesIds(fullBlocks), `the Blocks line should name what the full clone's does (${fullBlocks}):\n${r.stdout}`);
});

test('[VW-9] #162 H3 a blocked request\'s deletion of src/work.js at the shallow boundary, known merge-base: check --strict --all gives the full clone\'s blocked-delivery not ok for dates and exits 1 as it does', (t) => {
  const { repo, edit } = removal(t, 'deleted-code');
  const full = strictAll(prAt(t, repo));
  assert.equal(full.code, 1, both(full));
  const fullLine = hint(full.stdout, 'not ok', ...BLOCKED);
  const r = strictAll(removalShallow(t, repo, edit, 'D\tsrc/work.js'));
  assert.ok(lines(r.stdout).includes(fullLine), `the full clone's line should be given:\n${fullLine}\n---\n${r.stdout}`);
  assert.equal(r.code, full.code, `check --strict --all should exit ${full.code}, as the full clone does:\n${both(r)}`);
});

// I: conclude with no merge-base. `panel` (tier 1, signed off) amends [P-1];
// the PR's one commit, Request: panel, modifies [P-1]; main does not move.
// In a depth-1 clone the commit is the shallow boundary and no merge-base
// is in the clone.
function panelNoFork(t) {
  const repo = makeRepo(t);
  repo.write('specs/panel.md', P1);
  addRequest(repo, 'panel', null, { org: PANEL_ORG, signedText: PANEL_ORG, line: 'Type: story · Tier: 1 · Status: open', decisions: '' });
  repo.commit('signed panel request', { date: '2026-09-01T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'pr']);
  repo.write('specs/panel.md', '## [P-1] Panel\nOne thing and a second.\n');
  const edit = repo.commit(message('change panel', { request: 'panel', tier: '1 — panel' }), { date: '2026-09-02T12:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  return { repo, edit };
}
function panelNoForkShallow(t) {
  const { repo, edit } = panelNoFork(t);
  const clone = prAt(t, repo, 1);
  assert.ok(isBoundary(clone, edit), 'the fixture: the spec edit\'s commit is the shallow boundary');
  assert.throws(() => clone.git(['merge-base', 'origin/main', 'HEAD']), 'the fixture: no merge-base in the clone');
  return clone;
}

test('[VW-9] #162 I conclude panel (preview) with no merge-base in a depth-1 clone says "history unavailable" and exits 2', (t) => {
  const clone = panelNoForkShallow(t);
  const r = runAl(clone.dir, ['conclude', 'panel']);
  assert.equal(r.code, 2, `conclude should refuse:\n${both(r)}`);
  assert.ok(both(r).includes('history unavailable'), both(r));
  assert.doesNotMatch(both(r), /Modified: none/, both(r));
});

test('[VW-9] #162 I conclude panel --yes with no merge-base in a depth-1 clone says "history unavailable", exits 2, and writes nothing', (t) => {
  const clone = panelNoForkShallow(t);
  const before = readFileSync(join(clone.dir, 'requests/panel/request.md'), 'utf8');
  const r = runAl(clone.dir, ['conclude', 'panel', '--yes']);
  assert.equal(r.code, 2, `conclude --yes should refuse:\n${both(r)}`);
  assert.ok(both(r).includes('history unavailable'), both(r));
  assert.ok(!existsSync(join(clone.dir, 'requests/archive/panel')), 'no requests/archive/panel/');
  assert.equal(readFileSync(join(clone.dir, 'requests/panel/request.md'), 'utf8'), before, 'requests/panel/request.md unchanged');
  assert.equal(clone.git(['status', '--porcelain']), '', 'the work tree is clean');
});

test('[VW-9] #162 I control: the same branch in a full clone: conclude panel --yes writes "- Modified: [P-1]"', (t) => {
  const { repo } = panelNoFork(t);
  const clone = prAt(t, repo);
  const r = runAl(clone.dir, ['conclude', 'panel', '--yes']);
  assert.equal(r.code, 0, both(r));
  const md = readFileSync(join(clone.dir, 'requests/archive/panel/request.md'), 'utf8');
  assert.ok(lines(md).includes('- Modified: [P-1]'), md);
  assert.ok(!both(r).includes('history unavailable'), both(r));
});

// --- J: what the final state holds, through a deletion ---
// `kind`: 'deleted-code' (`dates`, signed off, is open; a Request: dates
// commit deletes src/work.js, on main before) or 'deleted-notes' (`dates` is
// open and unsigned; the baseline has specs/notes.md, a title and a paragraph
// with no section ID; a Request: dates commit deletes it and nothing else).
// Then main moves on and the branch merges it.
function deletion(t, kind) {
  const repo = makeRepo(t);
  repo.write('specs/panel.md', P1);
  if (kind === 'deleted-code') repo.write('src/work.js', 'export const answer = 42;\n');
  if (kind === 'deleted-notes') repo.write('specs/notes.md', '# Notes\n\nThese notes hold no requirement.\n');
  addRequest(repo, 'dates', null, { signed: kind === 'deleted-code', decisions: '' });
  repo.commit('baseline with request', { date: '2026-09-01T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'pr']);
  const gone = kind === 'deleted-code' ? 'src/work.js' : 'specs/notes.md';
  rmSync(join(repo.dir, gone));
  const edit = repo.commit(message('remove old work', { request: 'dates', tier: '2 — removal' }), { date: '2026-09-02T12:00:00Z' });
  assert.equal(repo.git(['show', '--name-status', '--format=', edit]), `D\t${gone}`, 'the fixture: the commit only deletes that file');
  repo.git(['checkout', '-q', 'main']);
  repo.write('main.txt', 'main\n');
  repo.commit('main work', { date: '2026-09-03T12:00:00Z' });
  repo.git(['checkout', '-q', 'pr']);
  repo.git(['merge', '-q', '--no-ff', '-m', message('merge main', { request: 'dates', tier: '2 — removal' }), 'main'], { date: '2026-09-04T12:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  return { repo, edit, gone };
}

test('[VW-9] #162 J1 a Request: dates deletion of src/work.js at the shallow boundary, known merge-base: the review\'s Unlinked line is the full clone\'s (src/work.js is the served request\'s work, not unlinked or unknown)', (t) => {
  const { repo, edit, gone } = deletion(t, 'deleted-code');
  const full = review(prAt(t, repo).dir);
  assert.equal(full.code, 0, both(full));
  const fullUnlinked = labelled(full.stdout, 'Unlinked');
  assert.ok(fullUnlinked, `the full clone's Unlinked line:\n${full.stdout}`);
  assert.ok(!fullUnlinked.includes(gone), `the full clone's Unlinked line leaves src/work.js out:\n${full.stdout}`);
  const r = review(removalShallow(t, repo, edit, `D\t${gone}`).dir);
  assert.equal(r.code, 0, both(r));
  assert.ok(!labelled(r.stdout, 'Unlinked').includes(gone), `src/work.js is the served request's work, as in the full clone (${fullUnlinked}):\n${r.stdout}`);
  assert.ok(!lineWith(r.stdout, gone, 'linked to no served request'), r.stdout);
  // The final state holds only src/work.js's deletion, which a commit of the
  // served request may have made: nothing is left unlinked, or unknown.
  assert.equal(labelled(r.stdout, 'Unlinked'), fullUnlinked, `the Unlinked line should be the full clone's:\n${r.stdout}`);
});

test('[VW-9] #162 J2 a blocked request\'s deletion of specs/notes.md (no section ID) at the shallow boundary, known merge-base: check --all gives the full clone\'s blocked-delivery not ok for dates', (t) => {
  const { repo, edit, gone } = deletion(t, 'deleted-notes');
  const full = runAl(prAt(t, repo).dir, ['check', '--all']);
  assert.equal(full.code, 0, both(full));
  const fullLine = hint(full.stdout, 'not ok', ...BLOCKED);
  const r = runAl(removalShallow(t, repo, edit, `D\t${gone}`).dir, ['check', '--all']);
  assert.equal(r.code, 0, both(r));
  assertCheckFrame(r.stdout, 'origin/main');
  assert.ok(lines(r.stdout).includes(fullLine), `the full clone's line should be given:\n${fullLine}\n---\n${r.stdout}`);
});
