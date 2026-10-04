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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, cloneRepo, runAl } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { both } from './helpers/request.js';
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
