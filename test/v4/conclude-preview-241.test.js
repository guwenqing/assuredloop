// al conclude <name> without --yes is a preview of --yes (#241): the preview
// and --yes run the same refusals, in the same order, with the same message
// and the same exit code; only the writing differs. For each refusal of
// conclude, both runs give the same exit code and the same stdout, and
// neither changes the project. A control still previews and then concludes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, renameSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { invoicer } from './helpers/invoicer.js';
import {
  al, baseProject, commitAll, exists, git, newRequest, read, readYaml, recordPath, show, tree, write,
} from './helpers/project.js';

const NAME = 'tidy-up';

// A v4 project on the branch `feature` with one open request, made by al new
// and committed; with nothing more, it would conclude.
function open(t, name = NAME) {
  const dir = baseProject(t);
  newRequest(dir, name);
  commitAll(dir, `request ${name}`);
  return dir;
}

// Runs conclude without and with --yes. Each run must leave the project as it
// was (file tree and git status), and the two runs must refuse alike.
function refusesAlike(dir, args, { code, message }) {
  const before = tree(dir);
  const status = git(dir, 'status', '--porcelain');
  const preview = al(dir, ['conclude', ...args]);
  assert.deepEqual(tree(dir), before, `the preview writes nothing:\n${show(preview)}`);
  const yes = al(dir, ['conclude', ...args, '--yes']);
  assert.deepEqual(tree(dir), before, `a refused --yes writes nothing:\n${show(yes)}`);
  assert.equal(git(dir, 'status', '--porcelain'), status, `git status is unchanged:\n${show(preview)}\n${show(yes)}`);
  const both = `\n${show(preview)}\n${show(yes)}`;
  assert.equal(preview.code, yes.code, `the preview and --yes exit with the same code:${both}`);
  assert.equal(preview.stdout, yes.stdout, `the preview and --yes print the same refusal:${both}`);
  assert.equal(preview.stderr, '', both);
  assert.equal(yes.stderr, '', both);
  if (code !== undefined) assert.equal(yes.code, code, both);
  if (message) assert.match(yes.stdout, message, both);
  assert.doesNotMatch(preview.stdout, /^Would conclude /m, both);
  return { preview, yes };
}

const AL_LINE = /^al: /m;

test('control: a request that would conclude previews with exit 0 and "Would conclude", and --yes concludes it', (t) => {
  const dir = open(t);
  const before = tree(dir);
  const preview = al(dir, ['conclude', NAME]);
  assert.equal(preview.code, 0, show(preview));
  assert.match(preview.stdout, new RegExp(`^Would conclude ${NAME}: `, 'm'), show(preview));
  assert.deepEqual(tree(dir), before, `the preview writes nothing:\n${show(preview)}`);
  const yes = al(dir, ['conclude', NAME, '--yes']);
  assert.equal(yes.code, 0, show(yes));
  assert.match(yes.stdout, new RegExp(`^Concluded ${NAME}: `, 'm'), show(yes));
  assert.ok(!exists(dir, `requests/${NAME}`), 'the open folder is gone');
  assert.match(read(dir, `requests/archive/${NAME}/request.md`), /Status: concluded/);
  assert.equal(readYaml(dir, recordPath(NAME)).status, 'concluded');
});

test('refusal 1, a bad request name: the preview and --yes refuse alike (exit 2)', (t) => {
  const dir = open(t);
  refusesAlike(dir, ['Bad_Name'], { code: 2, message: /^al: "Bad_Name" is not a request name$/m });
  refusesAlike(dir, [], { code: 2, message: /^al: "" is not a request name$/m });
});

test('refusal 2, no request with that name: the preview and --yes refuse alike (exit 2)', (t) => {
  refusesAlike(open(t), ['no-such-request'], { code: 2, message: /^al: no request named no-such-request$/m });
});

test('refusal 3, the request is already archived: the preview and --yes refuse alike (exit 2)', (t) => {
  const dir = open(t);
  newRequest(dir, 'old-one');
  mkdirSync(join(dir, 'requests/archive'), { recursive: true });
  renameSync(join(dir, 'requests/old-one'), join(dir, 'requests/archive/old-one'));
  commitAll(dir, 'archive old-one');
  refusesAlike(dir, ['old-one'], { code: 2, message: /^al: old-one is already archived/m });
});

test('refusal 4, the close rule: a paragraph with no valid disposition; the preview and --yes refuse alike (exit 1)', (t) => {
  const { preview } = refusesAlike(invoicer(t, 'd06', 'defect'), ['invoice-exports'], { code: 1, message: /^refused: .*invoice-exports\/SP-10/m });
  assert.ok(preview.stdout.split('\n').filter((l) => l.startsWith('refused: ')).length >= 1, show(preview));
});

test('refusal 4, the close rule: a promise change with no signed requirement; the preview and --yes refuse alike (exit 1)', (t) => {
  refusesAlike(invoicer(t, 'conclude-unsigned'), ['late-fees'], { code: 1, message: /^refused: a promise change with no signed requirement.*late-fees\/SP-2/m });
});

test('refusal 4, the close rule: an unsigned spike question; the preview and --yes refuse alike (exit 1)', (t) => {
  refusesAlike(invoicer(t, 'spike-q2'), ['link-expiry-spike'], { code: 1, message: /^refused: .*link-expiry-spike\/Q1/m });
});

test('refusal 5, requests/archive/<name> already exists: the preview and --yes refuse alike (exit 2)', (t) => {
  const dir = open(t);
  write(dir, `requests/archive/${NAME}/request.md`, '# tidy-up\nStatus: concluded\n');
  commitAll(dir, 'an archive folder of the same name');
  refusesAlike(dir, [NAME], { code: 2, message: new RegExp(`^al: requests/archive/${NAME} already exists`, 'm') });
});

test('refusal 6 (the reported bug), the request has no record file: made by al new, record removed; the preview and --yes refuse alike (exit 2)', (t) => {
  const dir = open(t);
  rmSync(join(dir, recordPath(NAME)));
  refusesAlike(dir, [NAME], { code: 2, message: new RegExp(`^al: ${NAME} has no record \\.assuredloop/records/requests/${NAME}\\.yaml`, 'm') });
});

test('refusal 6 (the reported bug), a request folder with a request.md written by hand and no record: the preview and --yes refuse alike (exit 2)', (t) => {
  const dir = baseProject(t);
  write(dir, `requests/${NAME}/request.md`, `# ${NAME}\nStatus: open\n\nThe owner wants ${NAME}.\n`);
  commitAll(dir, 'a request by hand');
  refusesAlike(dir, [NAME], { code: 2, message: new RegExp(`^al: ${NAME} has no record \\.assuredloop/records/requests/${NAME}\\.yaml`, 'm') });
});

test('refusal 7, the record does not parse as YAML: the preview and --yes refuse alike (exit 2)', (t) => {
  const dir = open(t);
  write(dir, recordPath(NAME), 'schema: [\n');
  commitAll(dir, 'a broken record');
  refusesAlike(dir, [NAME], { code: 2, message: new RegExp(`^al: \\.assuredloop/records/requests/${NAME}\\.yaml is not a valid record`, 'm') });
});

test('refusal 7, the record is not a map: the preview and --yes refuse alike (exit 2)', (t) => {
  const dir = open(t);
  write(dir, recordPath(NAME), '- a\n- b\n');
  commitAll(dir, 'a record that is a list');
  refusesAlike(dir, [NAME], { code: 2, message: new RegExp(`^al: \\.assuredloop/records/requests/${NAME}\\.yaml is not a valid record: not a map`, 'm') });
});

const SYMLINK = /^al: .* is reached through the symlink /m;

test('refusal 8, .assuredloop/records is a symlink to a folder: the preview and --yes refuse alike (exit 2)', (t) => {
  const dir = open(t);
  renameSync(join(dir, '.assuredloop/records'), join(dir, 'real-records'));
  symlinkSync('../real-records', join(dir, '.assuredloop/records'));
  commitAll(dir, 'records through a symlink');
  refusesAlike(dir, [NAME], { code: 2, message: SYMLINK });
});

test('refusal 8, .assuredloop/records/requests is a symlink to a folder: the preview and --yes refuse alike (exit 2)', (t) => {
  const dir = open(t);
  renameSync(join(dir, '.assuredloop/records/requests'), join(dir, 'real-requests'));
  symlinkSync('../../real-requests', join(dir, '.assuredloop/records/requests'));
  commitAll(dir, 'request records through a symlink');
  refusesAlike(dir, [NAME], { code: 2, message: SYMLINK });
});

test('refusal 8, the record file is a symlink to a file: the preview and --yes refuse alike (exit 2)', (t) => {
  const dir = open(t);
  renameSync(join(dir, recordPath(NAME)), join(dir, 'real-record.yaml'));
  symlinkSync('../../../real-record.yaml', join(dir, recordPath(NAME)));
  commitAll(dir, 'the record through a symlink');
  refusesAlike(dir, [NAME], { code: 2, message: SYMLINK });
});

test('refusal 8, requests/archive is a symlink to a folder: the preview and --yes refuse alike (exit 2)', (t) => {
  const dir = open(t);
  mkdirSync(join(dir, 'real-archive'));
  write(dir, 'real-archive/.keep', '');
  symlinkSync('../real-archive', join(dir, 'requests/archive'));
  commitAll(dir, 'the archive through a symlink');
  refusesAlike(dir, [NAME], { code: 2, message: SYMLINK });
});

test('the order: requests/archive/<name> exists and the record is missing; the preview and --yes give the same first refusal', (t) => {
  const dir = open(t);
  rmSync(join(dir, recordPath(NAME)));
  write(dir, `requests/archive/${NAME}/request.md`, '# tidy-up\nStatus: concluded\n');
  commitAll(dir, 'two reasons');
  refusesAlike(dir, [NAME], { code: 2, message: AL_LINE });
});

test('the order: the record is missing and requests/archive is a symlink; the preview and --yes give the same first refusal', (t) => {
  const dir = open(t);
  rmSync(join(dir, recordPath(NAME)));
  mkdirSync(join(dir, 'real-archive'));
  write(dir, 'real-archive/.keep', '');
  symlinkSync('../real-archive', join(dir, 'requests/archive'));
  commitAll(dir, 'two reasons');
  refusesAlike(dir, [NAME], { code: 2, message: AL_LINE });
});

test('the order: the record does not parse and .assuredloop/records/requests is a symlink; the preview and --yes give the same first refusal', (t) => {
  const dir = open(t);
  write(dir, recordPath(NAME), 'schema: [\n');
  renameSync(join(dir, '.assuredloop/records/requests'), join(dir, 'real-requests'));
  symlinkSync('../../real-requests', join(dir, '.assuredloop/records/requests'));
  commitAll(dir, 'two reasons');
  refusesAlike(dir, [NAME], { code: 2, message: AL_LINE });
});

test('the order: the close rule fails and requests/archive/<name> exists; the preview and --yes give the same refusal', (t) => {
  const dir = invoicer(t, 'd06', 'defect');
  write(dir, 'requests/archive/invoice-exports/request.md', '# invoice-exports\nStatus: concluded\n');
  commitAll(dir, 'two reasons');
  refusesAlike(dir, ['invoice-exports'], {});
});
