// Validation fixes, PR 8 (tier 0):
// #101 [VW-8]: historical reads see every file name as git stores it: a
// baseline file named with non-ASCII letters (specs/café.md) or a double
// quote (specs/a"b.md), which git quotes, is read under --at and by the
// audit's history like any other.
// #107 [VW-7] [VW-8]: the audit reads each past tree with that tree's own
// root, so moving the baseline root (root: in .assuredloop) keeps a
// section's earlier history; only an old .assuredloop's root: line matters,
// and a bad tests: or results: line there does not abort the audit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { both } from './helpers/request.js';
import { short } from './helpers/evidence.js';

const UNI = '## [UNI-1] Unicode file\nThe tool MUST read this.\n';
const QUO = '## [QUO-1] Quoted file\nThe tool MUST read this too.\n';

const al = (repo, ...args) => runAl(repo.dir, args);
const ok = (r, what) => assert.equal(r.code, 0, `${what}:\n${both(r)}`);

// --- #101 ---

function named(t) {
  const repo = makeRepo(t);
  repo.write('specs/café.md', UNI);
  repo.write('specs/a"b.md', QUO);
  const added = repo.commit('Two baseline files with names git quotes', { date: '2026-09-21T12:00:00Z' });
  assert.match(repo.git(['ls-tree', '--name-only', '-r', 'HEAD', 'specs']), /^"/m, 'the fixture: git quotes these names');
  return { repo, added };
}

test('#101 [VW-8] pin: al spec --list on the working tree lists specs/café.md with UNI-1 and specs/a"b.md with QUO-1', (t) => {
  const { repo } = named(t);
  const r = al(repo, 'spec', '--list');
  ok(r, 'spec --list');
  for (const s of ['specs/café.md', 'UNI-1', 'specs/a"b.md', 'QUO-1']) assert.ok(r.stdout.includes(s), `${s}:\n${r.stdout}`);
});

test('#101 [VW-8] al spec --list --at HEAD lists specs/café.md with UNI-1 and specs/a"b.md with QUO-1, not "no baseline yet"', (t) => {
  const { repo } = named(t);
  const r = al(repo, 'spec', '--list', '--at', 'HEAD');
  ok(r, 'spec --list --at HEAD');
  assert.ok(!r.stdout.includes('no baseline yet'), `HEAD holds a baseline:\n${r.stdout}`);
  for (const s of ['specs/café.md', 'UNI-1', 'specs/a"b.md', 'QUO-1']) assert.ok(r.stdout.includes(s), `${s}:\n${r.stdout}`);
});

test('#101 [VW-8] al context UNI-1 --at HEAD and al context QUO-1 --at HEAD find each section in its file', (t) => {
  const { repo } = named(t);
  for (const [id, path] of [['UNI-1', 'specs/café.md'], ['QUO-1', 'specs/a"b.md']]) {
    const r = al(repo, 'context', id, '--at', 'HEAD');
    ok(r, `context ${id} --at HEAD`);
    assert.ok(lines(r.stdout).some((l) => l.includes(id) && l.includes(path)), `${id} in ${path}:\n${r.stdout}`);
    assert.doesNotMatch(r.stdout, /not found|not in the baseline/, r.stdout);
  }
});

test('#101 [VW-7] al context UNI-1 --audit reads the history of specs/café.md: it names the commit that added UNI-1', (t) => {
  const { repo, added } = named(t);
  for (const id of ['UNI-1', 'QUO-1']) {
    const r = al(repo, 'context', id, '--audit');
    ok(r, `context ${id} --audit`);
    assert.doesNotMatch(r.stdout, /not found|not in the baseline/, r.stdout);
    assert.ok(r.stdout.includes(short(added)), `${id}'s history names ${short(added)}:\n${r.stdout}`);
  }
});

// --- #107 ---

// INV-1 in specs/rules.md with promise A (commit a), then B (commit b);
// then specs/ moved to promises/ with `root: promises` (commit m). The first
// tree's .assuredloop is `first`.
function moved(t, first = null) {
  const repo = makeRepo(t);
  repo.write('specs/rules.md', '## [INV-1] Rule\nThe product MUST do A.\n');
  if (first !== null) repo.write('.assuredloop', first);
  const a = repo.commit('Original A promise', { date: '2026-09-20T12:00:00Z' });
  repo.write('specs/rules.md', '## [INV-1] Rule\nThe product MUST do B.\n');
  const b = repo.commit('Change to B promise', { date: '2026-09-21T12:00:00Z' });
  repo.git(['mv', 'specs', 'promises']);
  repo.write('.assuredloop', 'root: promises\n');
  const m = repo.commit('Move baseline root', { date: '2026-09-22T12:00:00Z' });
  if (first === null) {
    const spec = al(repo, 'spec', '--at', a);
    assert.ok(spec.stdout.includes('The product MUST do A.'), `the fixture: spec --at the first commit reads promise A from specs/:\n${both(spec)}`);
  }
  return { repo, a, b, m };
}

test('#107 [VW-7][VW-8] after specs/ moved to promises/ (root: promises), al context INV-1 --audit still shows the two earlier changes, A and B, not only the move', (t) => {
  const { repo, a, b, m } = moved(t);
  const r = al(repo, 'context', 'INV-1', '--audit');
  ok(r, 'context INV-1 --audit');
  for (const [sha, what] of [[a, 'Original A promise'], [b, 'Change to B promise'], [m, 'the move']]) {
    assert.ok(r.stdout.includes(short(sha)), `the audit should name ${what}, ${short(sha)}:\n${r.stdout}`);
  }
});

test('#107 [VW-7] only the root: line of an old .assuredloop matters: an old tree whose .assuredloop has a bad tests: and results: line does not abort the audit, which still shows A and B', (t) => {
  const { repo, a, b } = moved(t, 'tests: ../outside\nresults: /etc\n');
  const r = al(repo, 'context', 'INV-1', '--audit');
  ok(r, 'context INV-1 --audit');
  for (const [sha, what] of [[a, 'Original A promise'], [b, 'Change to B promise']]) {
    assert.ok(r.stdout.includes(short(sha)), `the audit should name ${what}, ${short(sha)}:\n${r.stdout}`);
  }
});
