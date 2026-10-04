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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { makeRepo, cloneRepo, runAl, git, tempDir } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { addRequest, both, lineWith } from './helpers/request.js';
import { labelled } from './helpers/links.js';
import { assertCheckFrame, hint, message } from './helpers/hints.js';
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
// Request: dates and adds src/work.js.
function requestLine(t) {
  const repo = makeRepo(t);
  repo.write('specs/panel.md', P1);
  addRequest(repo, 'dates', null, { signed: false, decisions: '' });
  repo.commit('dates request', { date: '2026-09-01T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'pr']);
  repo.write('src/work.js', 'export const answer = 42;\n');
  const head = repo.commit(message('work', { request: 'dates', tier: '2 — implement dates' }), { date: '2026-09-02T12:00:00Z' });
  assert.equal(repo.git(['show', '--name-only', '--format=', head]), 'src/work.js', 'the fixture: the head adds src/work.js');
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

test('[VW-9] #162 check: a Request: line at the shallow boundary: the blocked-delivery not ok for dates a full clone gives is still given', (t) => {
  const { repo, head } = requestLine(t);
  const full = runAl(prClone(t, repo, head, { shallow: false }).dir, ['check', '--all']);
  assert.equal(full.code, 0, both(full));
  hint(full.stdout, 'not ok', ...BLOCKED);
  const r = runAl(prClone(t, repo, head, { shallow: true }).dir, ['check', '--all']);
  assert.equal(r.code, 0, both(r));
  assertCheckFrame(r.stdout, 'origin/main');
  hint(r.stdout, 'not ok', ...BLOCKED);
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
