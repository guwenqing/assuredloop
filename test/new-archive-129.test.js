// #129: `al new archive` refuses in each project, with or without a
// requests/archive/ folder. requests/archive/ is where a concluded request
// goes, so the name is reserved. Written from the issue and the public
// interface only: the al command, its output, its exit code and the files that
// it writes. Nothing here reads src/. No model and no network.
//
// The issue leaves the words of the refusal to the developer. So these tests
// assert only three things about the words. The output says "reserved". The
// output says "archive". The Next line names `al new` with another name, as the
// refusal of a used name does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  al, baseProject, commitAll, exists, git, newRequest, ok, project, read, record, recordPath, refused, show, tree, write,
} from './helpers/project.js';

const WORDS = 'The owner wants an archive of the old invoices.\n';
const CONCLUDED = 'done-one';
const UNREADABLE = /^not ok record-unreadable/m;

// A project with config and a spec on a base commit, and no requests/ folder.
const noArchive = (t) => baseProject(t);

// A project in which `al conclude` moved a request to requests/archive/.
function withArchive(t) {
  const dir = baseProject(t);
  newRequest(dir, CONCLUDED);
  commitAll(dir, `Open ${CONCLUDED}`);
  ok(dir, ['conclude', CONCLUDED, '--yes']);
  commitAll(dir, `Conclude ${CONCLUDED}`);
  assert.ok(exists(dir, `requests/archive/${CONCLUDED}/request.md`), 'the request is in the archive folder');
  return dir;
}

const WORLDS = [['no requests/archive/ folder', noArchive], ['a requests/archive/ folder', withArchive]];

// The exit code of another refused name: a used name, in its own project.
function usedNameCode(t) {
  const dir = project(t);
  newRequest(dir, 'taken');
  return refused(dir, ['new', 'taken', '--from', '-'], { input: WORDS }).code;
}

// Runs `al new archive` with `options`. It must refuse with the code of a used
// name, say why and what comes next, and change nothing. It returns the run.
function refusesArchive(t, dir, options, runOptions) {
  const code = usedNameCode(t);
  const before = tree(dir);
  const status = git(dir, 'status', '--porcelain');
  const hadRequests = exists(dir, 'requests');
  const hadArchive = exists(dir, 'requests/archive');
  const hadStore = exists(dir, '.assuredloop/records/requests');

  const r = al(dir, ['new', 'archive', ...options], runOptions);

  assert.equal(r.code, code, `the exit code of a used name:\n${show(r)}`);
  assert.notEqual(r.code, 0, show(r));
  assert.match(r.stdout, /^al: /m, show(r));
  assert.match(r.stdout, /\breserved\b/i, `the refusal says that the name is reserved:\n${show(r)}`);
  assert.match(r.stdout, /\barchive\b/, `the refusal names archive:\n${show(r)}`);
  assert.match(r.stdout, /^Next\s+.*\bal new (?!archive(\s|$))\S/m, `the next step is al new with another name:\n${show(r)}`);

  assert.deepEqual(tree(dir), before, `a refusal writes nothing:\n${show(r)}`);
  assert.equal(git(dir, 'status', '--porcelain'), status, `git status is unchanged:\n${show(r)}`);
  assert.equal(exists(dir, 'requests'), hadRequests, `requests/ is as it was:\n${show(r)}`);
  assert.equal(exists(dir, 'requests/archive'), hadArchive, `requests/archive/ is as it was:\n${show(r)}`);
  assert.equal(exists(dir, '.assuredloop/records/requests'), hadStore, `the records folder is as it was:\n${show(r)}`);
  assert.ok(!exists(dir, 'requests/archive/request.md'), `no request.md in the archive folder:\n${show(r)}`);
  assert.ok(!exists(dir, 'requests/archive/origin'), `no origin/ in the archive folder:\n${show(r)}`);
  assert.ok(!exists(dir, recordPath('archive')), `no record for archive:\n${show(r)}`);
  return r;
}

const fromFile = (dir) => {
  write(dir, 'notes/words.txt', WORDS);
  commitAll(dir, 'The words');
  return ['--from', 'notes/words.txt'];
};

// --- 1: a project with no requests/archive/ folder

test('1: with no requests/archive/ folder, al new archive --from <file> refuses and writes nothing', (t) => {
  const dir = noArchive(t);
  const options = fromFile(dir);
  assert.ok(!exists(dir, 'requests/archive'), 'the project has no archive folder');
  refusesArchive(t, dir, options);
});

test('1: a new git project with no commit also refuses and writes nothing', (t) => {
  const dir = project(t);
  write(dir, 'words.txt', WORDS);
  refusesArchive(t, dir, ['--from', 'words.txt']);
});

test('1: a project with an open request and no archive folder also refuses', (t) => {
  const dir = noArchive(t);
  newRequest(dir, 'open-one');
  const options = fromFile(dir);
  refusesArchive(t, dir, options);
  assert.equal(record(dir, 'open-one').status, 'open', 'the open request stays open');
});

// --- 2: a project with requests/archive/ that holds a concluded request

test('2: with a concluded request in requests/archive/, al new archive --from <file> refuses and writes nothing', (t) => {
  const dir = withArchive(t);
  const options = fromFile(dir);
  const concluded = read(dir, `requests/archive/${CONCLUDED}/request.md`);
  refusesArchive(t, dir, options);
  assert.equal(read(dir, `requests/archive/${CONCLUDED}/request.md`), concluded, 'the concluded request is as it was');
});

test('2: the refusal is the same text with and without requests/archive/', (t) => {
  const without = noArchive(t);
  const within = withArchive(t);
  const a = refusesArchive(t, without, fromFile(without));
  const b = refusesArchive(t, within, fromFile(within));
  assert.equal(b.stdout, a.stdout, `the same refusal in both projects:\n${show(a)}\n${show(b)}`);
  assert.equal(b.stderr, a.stderr, `the same standard error in both projects:\n${show(a)}\n${show(b)}`);
});

// --- 3: al check after the refused command

function checkStaysAsItWas(t, world) {
  const dir = world(t);
  const options = fromFile(dir);
  // The first check can write its own files. The second is the one to compare.
  ok(dir, ['check']);
  const before = al(dir, ['check']);
  assert.doesNotMatch(before.stdout, UNREADABLE, show(before));
  al(dir, ['new', 'archive', ...options]);
  const after = al(dir, ['check']);
  assert.doesNotMatch(after.stdout, UNREADABLE, `the project stays readable:\n${show(after)}`);
  assert.equal(after.code, before.code, `the exit code of al check:\n${show(before)}\n${show(after)}`);
  assert.equal(after.stdout, before.stdout, `the output of al check:\n${show(before)}\n${show(after)}`);
}

test('3: with no requests/archive/ folder, al check after the command stays as it was', (t) => {
  checkStaysAsItWas(t, noArchive);
});

test('3 (guard): with a requests/archive/ folder, al check after the command stays as it was', (t) => {
  checkStaysAsItWas(t, withArchive);
});

// --- 4: each input form

for (const [where, world] of WORLDS) {
  test(`4: --from <file> refuses, with ${where}`, (t) => {
    const dir = world(t);
    refusesArchive(t, dir, fromFile(dir));
  });

  test(`4: --from - on standard input refuses, with ${where}`, (t) => {
    refusesArchive(t, world(t), ['--from', '-'], { input: WORDS });
  });

  test(`4: no --from at all refuses for the name first, with ${where}`, (t) => {
    refusesArchive(t, world(t), []);
  });

  test(`4: a --tier and a --title do not change the refusal, with ${where}`, (t) => {
    const dir = world(t);
    const options = fromFile(dir);
    refusesArchive(t, dir, [...options, '--tier', '2', '--title', 'The archive']);
    refusesArchive(t, dir, ['--from', '-', '--tier', '1d', '--title', 'The archive'], { input: WORDS });
  });

  test(`4: options before the name do not change the refusal, with ${where}`, (t) => {
    const dir = world(t);
    const options = fromFile(dir);
    const code = usedNameCode(t);
    const before = tree(dir);
    const r = al(dir, ['new', ...options, '--tier', '2', 'archive']);
    assert.equal(r.code, code, show(r));
    assert.match(r.stdout, /\breserved\b/i, show(r));
    assert.deepEqual(tree(dir), before, `a refusal writes nothing:\n${show(r)}`);
  });
}

// --- 5: guards

for (const name of ['archive-2', 'archives', 'my-archive']) {
  for (const [where, world] of WORLDS) {
    test(`5 (guard): ${name} is still accepted and is an open request that al check reads, with ${where}`, (t) => {
      const dir = world(t);
      newRequest(dir, name, WORDS);
      assert.ok(exists(dir, `requests/${name}/request.md`), 'the request is in its own folder');
      assert.equal(record(dir, name).status, 'open');
      const r = al(dir, ['check']);
      assert.doesNotMatch(r.stdout, UNREADABLE, show(r));
      assert.match(r.stdout, new RegExp(`^review note requests/${name}/review\\.md:`, 'm'), `al check reads it as open:\n${show(r)}`);
      assert.match(r.stdout, new RegExp(`^map: .*own changes: [^)]*\\b${name}\\b`, 'm'), `al check names it:\n${show(r)}`);
    });
  }
}

test('5 (guard): a bad name keeps its refusal, and does not say reserved', (t) => {
  const dir = noArchive(t);
  for (const name of ['Archive', 'ARCHIVE', 'archive/', 'archive/x', '../archive']) {
    const r = refused(dir, ['new', name, '--from', '-'], { input: WORDS });
    assert.match(r.stdout, /^al: bad request name /m, show(r));
    assert.doesNotMatch(r.stdout, /\breserved\b/i, show(r));
  }
});

test('5 (guard): a used name keeps its refusal, and does not say reserved', (t) => {
  const dir = withArchive(t);
  newRequest(dir, 'taken');
  for (const [name, place] of [['taken', 'requests/taken'], [CONCLUDED, `requests/archive/${CONCLUDED}`]]) {
    const r = refused(dir, ['new', name, '--from', '-'], { input: WORDS });
    assert.match(r.stdout, new RegExp(`^al: the name ${name} is already used \\(${place}\\)`, 'm'), show(r));
    assert.match(r.stdout, /^Next\s+al new <another name>/m, show(r));
    assert.doesNotMatch(r.stdout, /\breserved\b/i, show(r));
  }
});
