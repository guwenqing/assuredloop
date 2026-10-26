// #22: the base of a branch is the later of two merge-bases: HEAD with the
// local `main`, and HEAD with `origin/main`. "Later" means the other one is
// its ancestor. A local main that is behind origin/main gives the origin/main
// base; a local main with commits not pushed gives the local base. When the two
// diverge, the local main gives the base. Only main and origin/main count:
// another remote, such as upstream/main, does not. al never fetches: it reads
// only the refs that are already in the clone. The Read line of al check and
// of al conclude names the ref that gave the base.
//
// Each test makes origin/main with `git update-ref`, as a fetch leaves it.
// The shape of the issue: commit A on main; commit B on main after A, with
// the change that is already merged; origin/main at B; the local main put
// back to A; the branch pr2 cut from origin/main, with only README.md changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeBase } from '../../src/v4/git.js';
import {
  al, appendSection, baseProject, commitAll, editFile, git, index, newRequest, organized, project, record, req, show, write,
  writeConfig,
} from './helpers/project.js';
import { changeLines78, outsideOk } from './helpers/as-78.js';

const SPEC = 'specs/invoices.md';
const ADR = 'specs/adr/0003-signed-links.md';
const NAME = 'change';
const R1 = req('R1', 'Lines on every invoice', 'Every invoice MUST have at least one line, paid or not.');

// The changes that a test merges on origin/main (or commits on a branch).
const adrEdit = (dir) => editFile(dir, ADR, 'Context: a link must not be guessed.', 'Context: a link must never be guessed.');
const idRemoved = (dir) => editFile(dir, SPEC, '<!-- INV-41 rule -->\n\nThe export link MUST expire 30 minutes after the email is sent.\n', '');
const ruleEdit = (dir) => editFile(dir, SPEC, 'An invoice MUST have at least one line.', 'An invoice MUST have at least one line, paid or not.');
const linkAdded = (dir) => editFile(dir, SPEC, '<!-- INV-13 rule -->', `<!-- INV-13 rule serves:${NAME}/R1 -->`);

// An open request `change` with R1, indexed, for the tests of conclude and index.
function withRequest(dir) {
  newRequest(dir, NAME, 'Every invoice needs a line.\n', ['--tier', '1']);
  appendSection(dir, NAME, organized([R1]));
  index(dir);
}

const head = (dir) => git(dir, 'rev-parse', 'HEAD');

// Commit A on main (baseProject, then `setup`), and the branch pr2 with only
// README.md changed. With `merged`, commit B on main holds that change, and
// origin/main is at B; the local main goes back to A; pr2 is cut from
// origin/main. With `origin: false`, origin/main is then removed, so only the
// local main is left: the old behaviour.
function behind(t, merged, { setup = () => {}, origin = true } = {}) {
  const dir = baseProject(t, { branch: null });
  setup(dir);
  const a = git(dir, 'status', '--porcelain') ? commitAll(dir, 'the setup') : head(dir);
  merged(dir);
  const b = commitAll(dir, 'the change, merged on origin/main');
  git(dir, 'update-ref', 'refs/remotes/origin/main', b);
  git(dir, 'reset', '-q', '--hard', a);
  git(dir, 'checkout', '-q', '-b', 'pr2', b);
  if (!origin) git(dir, 'update-ref', '-d', 'refs/remotes/origin/main');
  write(dir, 'README.md', 'A readme.\n');
  commitAll(dir, 'only the readme');
  return { dir, a, b };
}

// The Read line of a run, as a pattern: the short sha of `base` and the ref.
const readLine = (base, ref) => new RegExp(`^Read {6}working tree · base ${base.slice(0, 7)} \\(merge-base with ${ref.replace('/', '\\/')}\\)$`, 'm');
// Any Read line with a base, to show which ref it names.
const READ_ANY = /^Read {6}working tree · base [0-9a-f]+ \(merge-base with (main|origin\/main)\)$/m;

// The lines of a run's stdout that hold `part`, other than the ok line,
// which names each check that found nothing (#78).
const linesWith = (r, part) => outsideOk(r.stdout, part);

function check(dir, ...args) {
  const r = al(dir, ['check', ...args]);
  assert.equal(r.code, 0, `al check exits 0 (#22 R7):\n${show(r)}`);
  return r;
}

// --- the issue: local main behind origin/main

test('local main behind origin/main: an ADR change merged there gives no adr-changed; Read names origin/main', (t) => {
  const { dir, b } = behind(t, adrEdit);
  const r = check(dir);
  assert.deepEqual(linesWith(r, 'adr-changed'), [], show(r));
  assert.match(r.stdout, readLine(b, 'origin/main'), show(r));
});

test('control: with no origin/main, the same change gives adr-changed on ADR-3; Read names main', (t) => {
  const { dir, a } = behind(t, adrEdit, { origin: false });
  const r = check(dir);
  assert.equal(linesWith(r, `hint adr-changed ${ADR}:`).length, 1, show(r));
  assert.match(r.stdout, readLine(a, 'main'), show(r));
});

test('local main behind origin/main: an ID removed by a merged change is not lost on the branch', (t) => {
  const { dir, b } = behind(t, idRemoved);
  const r = al(dir, ['check', '--strict']);
  // No lost-id lint, no "Removed" paragraph change and no signoff-coverage on INV-41.
  assert.deepEqual(linesWith(r, 'INV-41'), [], show(r));
  assert.match(r.stdout, readLine(b, 'origin/main'), show(r));
  // What is left is hints only, so --strict exits 0.
  assert.equal(r.code, 0, show(r));
});

test('control: with no origin/main, the removed ID is a lost-id hint and a Removed change', (t) => {
  const { dir, a } = behind(t, idRemoved, { origin: false });
  const r = check(dir);
  assert.equal(linesWith(r, `hint lost-id ${SPEC}:`).filter((l) => l.includes('INV-41 was in specs/invoices.md at the base and is gone')).length, 1, show(r));
  // A removed paragraph is named at its text line at the base (#74).
  // #78: the change line is a map paragraph line.
  assert.ok(changeLines78(r.stdout).includes(`${SPEC}:15 at the base ${a.slice(0, 7)} INV-41 Removed`), show(r));
  assert.match(r.stdout, readLine(a, 'main'), show(r));
});

// --- the other shapes of main and origin/main

test('control: local main ahead of origin/main (commits not pushed): the local merge-base is the base; Read names main', (t) => {
  const dir = baseProject(t, { branch: null });
  const a = head(dir);
  git(dir, 'update-ref', 'refs/remotes/origin/main', a);
  adrEdit(dir);
  const c = commitAll(dir, 'on the local main, not pushed');
  git(dir, 'checkout', '-q', '-b', 'pr2');
  write(dir, 'README.md', 'A readme.\n');
  commitAll(dir, 'only the readme');
  assert.equal(mergeBase(dir), c);
  const r = check(dir);
  assert.deepEqual(linesWith(r, 'adr-changed'), [], show(r));
  assert.match(r.stdout, readLine(c, 'main'), show(r));
});

test('control: main and origin/main diverged: the local main gives the base; Read names main', (t) => {
  // origin/main: A -> B (the ADR change). Local main: A -> C (INV-41 removed).
  // pr2 holds both: C with B merged in. Neither merge-base is an ancestor of the other.
  const dir = baseProject(t, { branch: null });
  const a = head(dir);
  adrEdit(dir);
  const b = commitAll(dir, 'on origin/main');
  git(dir, 'update-ref', 'refs/remotes/origin/main', b);
  git(dir, 'reset', '-q', '--hard', a);
  idRemoved(dir);
  const c = commitAll(dir, 'on the local main, not pushed');
  git(dir, 'checkout', '-q', '-b', 'pr2');
  git(dir, 'merge', '-q', '--no-ff', '-m', 'merge origin/main', 'origin/main');
  assert.equal(git(dir, 'merge-base', 'HEAD', 'origin/main'), b);
  assert.equal(git(dir, 'merge-base', 'HEAD', 'main'), c);
  assert.equal(mergeBase(dir), c);
  const r = check(dir);
  // Against C, the ADR change from B is a change of the branch.
  assert.equal(linesWith(r, `hint adr-changed ${ADR}:`).length, 1, show(r));
  assert.match(r.stdout, readLine(c, 'main'), show(r));
});

test('control: both merge-bases are the same commit: that commit is the base', (t) => {
  // Local main and origin/main diverged after A; pr2 is cut from A.
  const dir = baseProject(t, { branch: null });
  const a = head(dir);
  adrEdit(dir);
  git(dir, 'update-ref', 'refs/remotes/origin/main', commitAll(dir, 'on origin/main'));
  git(dir, 'reset', '-q', '--hard', a);
  idRemoved(dir);
  commitAll(dir, 'on the local main');
  git(dir, 'checkout', '-q', '-b', 'pr2', a);
  write(dir, 'README.md', 'A readme.\n');
  commitAll(dir, 'only the readme');
  assert.equal(mergeBase(dir), a);
  const r = check(dir);
  assert.match(r.stdout, READ_ANY, show(r));
  assert.equal(READ_ANY.exec(r.stdout)[0].includes(` base ${a.slice(0, 7)} `), true, show(r));
});

test('control: only origin/main, no local main: the base is the merge-base with origin/main', (t) => {
  const dir = baseProject(t, { branch: null });
  const a = head(dir);
  git(dir, 'branch', '-m', 'main', 'trunk');
  git(dir, 'update-ref', 'refs/remotes/origin/main', a);
  git(dir, 'checkout', '-q', '-b', 'pr2');
  adrEdit(dir);
  commitAll(dir, 'the ADR change on the branch');
  assert.equal(mergeBase(dir), a);
  const r = check(dir);
  assert.equal(linesWith(r, `hint adr-changed ${ADR}:`).length, 1, show(r));
  assert.match(r.stdout, READ_ANY, show(r));
});

test('only origin/main, no local main: the Read line names origin/main, the ref that gave the base', (t) => {
  const dir = baseProject(t, { branch: null });
  const a = head(dir);
  git(dir, 'branch', '-m', 'main', 'trunk');
  git(dir, 'update-ref', 'refs/remotes/origin/main', a);
  git(dir, 'checkout', '-q', '-b', 'pr2');
  write(dir, 'README.md', 'A readme.\n');
  commitAll(dir, 'only the readme');
  const r = check(dir);
  assert.match(r.stdout, readLine(a, 'origin/main'), show(r));
});

test('control: only the local main: the base is the merge-base with main; Read names main', (t) => {
  const dir = baseProject(t);
  const a = git(dir, 'rev-parse', 'main');
  adrEdit(dir);
  commitAll(dir, 'the ADR change on the branch');
  assert.equal(mergeBase(dir), a);
  const r = check(dir);
  assert.equal(linesWith(r, `hint adr-changed ${ADR}:`).length, 1, show(r));
  assert.match(r.stdout, readLine(a, 'main'), show(r));
});

test('control: no main and no origin/main: no base', (t) => {
  const dir = baseProject(t, { branch: null });
  git(dir, 'branch', '-m', 'main', 'trunk');
  assert.equal(mergeBase(dir), null);
  const r = check(dir);
  assert.match(r.stdout, /^Read {6}working tree · no base$/m, show(r));
});

test('control: an upstream/main that is ahead does not change the base', (t) => {
  // main and origin/main at A; upstream/main at B, with the ADR change; pr2 cut from B.
  const dir = baseProject(t, { branch: null });
  const a = head(dir);
  git(dir, 'update-ref', 'refs/remotes/origin/main', a);
  adrEdit(dir);
  const b = commitAll(dir, 'on upstream/main');
  git(dir, 'update-ref', 'refs/remotes/upstream/main', b);
  git(dir, 'reset', '-q', '--hard', a);
  git(dir, 'checkout', '-q', '-b', 'pr2', b);
  write(dir, 'README.md', 'A readme.\n');
  commitAll(dir, 'only the readme');
  assert.equal(mergeBase(dir), a);
  const r = check(dir);
  assert.equal(linesWith(r, `hint adr-changed ${ADR}:`).length, 1, show(r));
  assert.doesNotMatch(r.stdout, /merge-base with upstream/, show(r));
  assert.match(r.stdout, READ_ANY, show(r));
  assert.equal(READ_ANY.exec(r.stdout)[0].includes(` base ${a.slice(0, 7)} `), true, show(r));
});

// --- mergeBase(top)

test('mergeBase: local main behind origin/main gives the merge-base with origin/main', (t) => {
  const { dir, b } = behind(t, adrEdit);
  assert.equal(git(dir, 'merge-base', 'HEAD', 'main'), git(dir, 'rev-parse', 'main'));
  assert.equal(mergeBase(dir), b);
});

test('control: mergeBase with no origin/main gives the merge-base with main', (t) => {
  const { dir, a } = behind(t, adrEdit, { origin: false });
  assert.equal(mergeBase(dir), a);
});

test('mergeBase: on main itself, behind origin/main, the base is HEAD', (t) => {
  // HEAD is the local main at A; origin/main is at B. Both merge-bases are A.
  const dir = baseProject(t, { branch: null });
  const a = head(dir);
  adrEdit(dir);
  git(dir, 'update-ref', 'refs/remotes/origin/main', commitAll(dir, 'on origin/main'));
  git(dir, 'reset', '-q', '--hard', a);
  assert.equal(mergeBase(dir), a);
});

// --- al conclude, al context and al index take the same base

test('al conclude: a promise change merged on origin/main is not a change of the branch; Read names origin/main', (t) => {
  const { dir, b } = behind(t, ruleEdit, { setup: withRequest });
  const r = al(dir, ['conclude', NAME]);
  assert.equal(r.code, 0, show(r));
  assert.deepEqual(linesWith(r, 'refused: '), [], show(r));
  assert.match(r.stdout, new RegExp(`^Would conclude ${NAME}: `, 'm'), show(r));
  assert.match(r.stdout, readLine(b, 'origin/main'), show(r));
});

test('control: al conclude with no origin/main refuses on the rule change, naming INV-13; Read names main', (t) => {
  const { dir, a } = behind(t, ruleEdit, { setup: withRequest, origin: false });
  const r = al(dir, ['conclude', NAME]);
  assert.equal(r.code, 1, show(r));
  assert.ok(linesWith(r, 'refused: ').some((l) => /(?<![\w-])INV-13(?![\w-])/.test(l)), show(r));
  assert.match(r.stdout, readLine(a, 'main'), show(r));
});

test('al context <ID>: a rule change merged on origin/main gives no signoff-coverage hint on INV-13', (t) => {
  const { dir } = behind(t, ruleEdit, { setup: withRequest });
  const r = al(dir, ['context', 'INV-13']);
  assert.equal(r.code, 0, show(r));
  assert.deepEqual(linesWith(r, 'signoff-coverage'), [], show(r));
});

test('control: al context <ID> with no origin/main shows the signoff-coverage on INV-13', (t) => {
  const { dir } = behind(t, ruleEdit, { setup: withRequest, origin: false });
  const r = al(dir, ['context', 'INV-13']);
  assert.equal(r.code, 0, show(r));
  assert.equal(linesWith(r, 'not ok signoff-coverage').filter((l) => l.includes(' INV-13 ')).length, 1, show(r));
});

test('al index: a link merged on origin/main with no binding is at the base: "binding unknown", not bound', (t) => {
  const { dir } = behind(t, linkAdded, { setup: withRequest });
  const r = index(dir);
  assert.equal(linesWith(r, `binding unknown: INV-13 serves ${NAME}/R1`).length, 1, show(r));
  assert.deepEqual(record(dir, NAME).bindings ?? [], [], show(r));
});

test('control: al index with no origin/main binds the same link as new', (t) => {
  const { dir } = behind(t, linkAdded, { setup: withRequest, origin: false });
  const r = index(dir);
  assert.deepEqual(linesWith(r, 'binding unknown'), [], show(r));
  assert.equal((record(dir, NAME).bindings ?? []).filter((x) => x.holder === 'INV-13' && x.target === `${NAME}/R1`).length, 1, show(r));
});

test('control: al index with only main says "binding unknown" for a committed link with no binding', (t) => {
  // The line format of the test above, as al gives it today.
  const dir = baseProject(t, { branch: null });
  withRequest(dir);
  linkAdded(dir);
  commitAll(dir, 'the link, with no binding');
  git(dir, 'checkout', '-q', '-b', 'pr2');
  const r = index(dir);
  assert.equal(linesWith(r, `binding unknown: INV-13 serves ${NAME}/R1`).length, 1, show(r));
});

// --- al check in an output repo: the central IDs of the files changed since the base

// A central repo (baseProject, indexed) and an output repo that names it.
// Commit A in the output repo holds the config; commit B on main adds
// docs/feature.md, which cites central:INV-13; origin/main is at B; the local
// main goes back to A; pr2 is cut from B and changes only README.md, which
// cites central:INV-12. With `origin: false`, origin/main is then removed.
function outputBehind(t, { origin = true } = {}) {
  const central = baseProject(t, { branch: null });
  index(central);
  commitAll(central, 'the records');
  const dir = project(t);
  writeConfig(dir, [], { central: { path: central } });
  const a = commitAll(dir, 'the config');
  write(dir, 'docs/feature.md', 'Lines follow central:INV-13.\n');
  const b = commitAll(dir, 'the citation, merged on origin/main');
  git(dir, 'update-ref', 'refs/remotes/origin/main', b);
  git(dir, 'reset', '-q', '--hard', a);
  git(dir, 'checkout', '-q', '-b', 'pr2', b);
  if (!origin) git(dir, 'update-ref', '-d', 'refs/remotes/origin/main');
  write(dir, 'README.md', 'The data: central:INV-12.\n');
  commitAll(dir, 'only the readme');
  return { dir, a, b };
}

const CITES = /^(info cites|hint unresolved-central) /;
const citeLines = (r) => r.stdout.split('\n').filter((l) => CITES.test(l));

test('output repo, local main behind origin/main: a citation merged on origin/main is not looked up', (t) => {
  const { dir, b } = outputBehind(t);
  const r = check(dir);
  // The lookup runs: README.md, changed on the branch, gives its line.
  assert.ok(citeLines(r).some((l) => l.startsWith('info cites README.md:1 central:INV-12 ')), show(r));
  assert.deepEqual(citeLines(r).filter((l) => l.includes('docs/feature.md')), [], show(r));
  assert.match(r.stdout, readLine(b, 'origin/main'), show(r));
});

test('control: output repo with no origin/main: the citation of docs/feature.md is looked up', (t) => {
  const { dir, a } = outputBehind(t, { origin: false });
  const r = check(dir);
  assert.ok(citeLines(r).some((l) => l.startsWith('info cites README.md:1 central:INV-12 ')), show(r));
  assert.equal(citeLines(r).filter((l) => l.startsWith('info cites docs/feature.md:1 central:INV-13 ')).length, 1, show(r));
  assert.match(r.stdout, readLine(a, 'main'), show(r));
});

// --- al never fetches

const refs = (dir) => git(dir, 'for-each-ref', '--format=%(refname) %(objectname)');

test('an origin remote whose URL does not exist: al check, index, context and conclude work from the local origin/main', (t) => {
  // An ADR change is no promise change, so conclude does not refuse on either base.
  const { dir, b } = behind(t, adrEdit, { setup: withRequest });
  git(dir, 'remote', 'add', 'origin', join(dir, 'no-such-remote.git'));
  const before = refs(dir);
  for (const args of [['check'], ['context'], ['context', NAME], ['conclude', NAME], ['index']]) {
    const r = al(dir, args);
    assert.equal(r.code, 0, show(r));
    assert.equal(r.stderr, '', show(r));
  }
  assert.equal(refs(dir), before, 'al moves no ref');
  assert.equal(git(dir, 'rev-parse', 'refs/remotes/origin/main'), b);
  assert.equal(existsSync(join(dir, '.git/FETCH_HEAD')), false, 'al does not fetch');
  assert.match(check(dir).stdout, readLine(b, 'origin/main'));
});

test('control: a real remote with a newer main: al does not fetch it, and origin/main stays where it was', (t) => {
  const remote = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-remote-'));
  t.after(() => rmSync(remote, { recursive: true, force: true }));
  git(remote, 'init', '-q', '--bare', '-b', 'main');
  const dir = baseProject(t, { branch: null });
  const a = head(dir);
  git(dir, 'remote', 'add', 'origin', remote);
  git(dir, 'push', '-q', 'origin', 'main');
  // The remote's main moves on to B; the clone's origin/main stays at A.
  adrEdit(dir);
  git(dir, 'push', '-q', 'origin', `${commitAll(dir, 'on the remote')}:refs/heads/main`);
  git(dir, 'reset', '-q', '--hard', a);
  git(dir, 'update-ref', 'refs/remotes/origin/main', a);
  git(dir, 'checkout', '-q', '-b', 'pr2');
  write(dir, 'README.md', 'A readme.\n');
  commitAll(dir, 'only the readme');
  const before = refs(dir);
  for (const args of [['check'], ['context'], ['index']]) assert.equal(al(dir, args).code, 0);
  assert.equal(refs(dir), before, 'al moves no ref');
  assert.equal(git(dir, 'rev-parse', 'refs/remotes/origin/main'), a);
  assert.equal(existsSync(join(dir, '.git/FETCH_HEAD')), false, 'al does not fetch');
});
