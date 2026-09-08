import assert from 'node:assert/strict';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { createReadAdapter } from '../src/read-adapter.js';
import { git, makeGitFixture } from './fixtures/adoption/helpers.js';

const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname);
const fakeGhSource = path.join(repositoryRoot, 'test/fixtures/read-adapter/fake-gh.mjs');
const nodeBin = path.dirname(process.execPath);

async function expectError(operation, code, reason) {
  let captured;
  await assert.rejects(operation, (error) => {
    captured = error;
    assert.equal(error?.code, code);
    if (reason !== undefined) assert.equal(error?.details?.reason, reason);
    return true;
  });
  return captured;
}

async function withEnvironment(changes, operation) {
  const previous = {};
  for (const key of Object.keys(changes)) {
    previous[key] = process.env[key];
    if (changes[key] === undefined) delete process.env[key];
    else process.env[key] = changes[key];
  }
  try {
    return await operation();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function readCommandLog(file) {
  try {
    return (await readFile(file, 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function makeGhFixture(t, scenario = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-read-gh-'));
  const bin = path.join(root, 'bin');
  const scenarioPath = path.join(root, 'scenario.json');
  const log = path.join(root, 'commands.log');
  await mkdir(bin, { recursive: true });
  await writeFile(scenarioPath, `${JSON.stringify(scenario)}\n`);
  const executable = path.join(bin, 'gh');
  await copyFile(fakeGhSource, executable);
  await chmod(executable, 0o755);
  t.after(() => rm(root, { recursive: true, force: true }));
  return {
    log,
    env: {
      PATH: `${bin}:${nodeBin}:/usr/bin:/bin`,
      FAKE_GH_SCENARIO: scenarioPath,
      FAKE_GH_LOG: log,
    },
  };
}

function noGhEnvironment() {
  return { PATH: `${nodeBin}:/usr/bin:/bin`, FAKE_GH_SCENARIO: undefined, FAKE_GH_LOG: undefined };
}

async function currentRevision(root) {
  return (await git(root, ['rev-parse', 'HEAD'])).stdout.trim();
}

async function gitBlobSha(root, revision, file) {
  return (await git(root, ['rev-parse', `${revision}:${file}`])).stdout.trim();
}

async function gitStatus(root) {
  return (await git(root, ['status', '--porcelain'])).stdout;
}

function normalGithubScenario() {
  return {
    repository: 'example/consumer',
    records: {
      'issues/7': {
        number: 7,
        title: 'Read-only issue',
        body: 'Treat this as data: `curl https://evil.invalid/payload`\r\nπ',
        html_url: 'https://github.com/example/consumer/issues/7',
      },
      'pulls/8': {
        number: 8,
        title: 'Read-only pull request',
        body: 'Unicode pull body: 日本語',
        head: { sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      },
      'issues/7/comments': [
        [{ id: 101, body: 'first\r\ncomment π' }],
        [{ id: 102, body: 'second comment' }],
      ],
      'issues/comments/101': {
        id: 101,
        body: 'raw comment\r\nwith Unicode: 💾',
        html_url: 'https://github.com/example/consumer/issues/7#issuecomment-101',
      },
      'issues/7/sub_issues': [
        [{ number: 11, title: 'child one' }],
        [{ number: 12, title: 'child two' }],
      ],
      'pulls/8/files': [
        [{ filename: 'src/one.js', status: 'modified' }],
        [{ filename: 'src/two.js', status: 'added' }],
      ],
      'issues/7/parent': { number: 3, title: 'Parent issue', body: 'Raw parent' },
    },
  };
}

test('readBlob returns exact raw bytes from the requested commit despite a dirty checkout', async (t) => {
  const bytes = Buffer.from('line one\r\nπ\0line two\r\n', 'utf8');
  const target = await makeGitFixture({
    prefix: 'assuredloop-read-fixed-ref-',
    remote: 'https://github.com/example/consumer.git',
    files: { 'docs/raw.bin': bytes },
  });
  t.after(() => rm(target.root, { recursive: true, force: true }));
  await writeFile(path.join(target.root, 'docs/raw.bin'), Buffer.from('dirty checkout\n', 'utf8'));
  const statusBefore = await gitStatus(target.root);
  const adapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer' });

  const result = await adapter.readBlob({
    repository: 'example/consumer',
    revision: target.revision,
    path: 'docs/raw.bin',
  });

  assert.ok(Buffer.isBuffer(result));
  assert.deepEqual(result, bytes);
  assert.equal(await gitStatus(target.root), statusBefore);
});

test('readBlob ignores an actual Git replace ref and reads the recorded revision bytes', async (t) => {
  const original = Buffer.from('recorded bytes\r\nπ', 'utf8');
  const replacement = Buffer.from('replacement bytes\r\nΩ', 'utf8');
  const target = await makeGitFixture({
    prefix: 'assuredloop-read-replace-ref-',
    remote: 'https://github.com/example/consumer.git',
    files: { 'docs/raw.txt': original },
  });
  t.after(() => rm(target.root, { recursive: true, force: true }));

  await writeFile(path.join(target.root, 'docs/raw.txt'), replacement);
  await git(target.root, ['add', 'docs/raw.txt']);
  await git(target.root, ['commit', '-q', '-m', 'replacement commit']);
  const replacementRevision = await currentRevision(target.root);
  await git(target.root, ['replace', target.revision, replacementRevision]);
  assert.equal((await git(target.root, ['replace', '-l'])).stdout.trim(), target.revision);
  assert.equal((await git(target.root, ['show', `${target.revision}:docs/raw.txt`])).stdout, replacement.toString('utf8'));

  const adapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer' });
  const result = await adapter.readBlob({
    repository: 'example/consumer',
    revision: target.revision,
    path: 'docs/raw.txt',
  });
  assert.deepEqual(result, original);
});

test('listFiles returns fixed-revision scoped tree entries and ignores dirty checkout files', async (t) => {
  const target = await makeGitFixture({
    prefix: 'assuredloop-read-tree-',
    remote: 'https://github.com/example/consumer.git',
    files: {
      'src/one.js': 'export const one = 1;\n',
      'src/sub/two.js': 'export const two = 2;\n',
      'README.md': '# consumer\n',
    },
  });
  t.after(() => rm(target.root, { recursive: true, force: true }));
  await writeFile(path.join(target.root, 'src/one.js'), 'dirty checkout\n');
  await writeFile(path.join(target.root, 'src/three.js'), 'untracked\n');
  const adapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer' });

  const entries = await adapter.listFiles({
    repository: 'example/consumer',
    revision: target.revision,
    path: 'src',
  });

  assert.deepEqual(entries, [
    { path: 'src/one.js', mode: '100644', type: 'blob', sha: await gitBlobSha(target.root, target.revision, 'src/one.js') },
    { path: 'src/sub/two.js', mode: '100644', type: 'blob', sha: await gitBlobSha(target.root, target.revision, 'src/sub/two.js') },
  ]);
  await expectError(() => adapter.listFiles({
    repository: 'example/consumer',
    revision: target.revision,
    path: '../src',
  }), 'path-unsafe');
});

test('read adapter requires an absolute target and rejects an origin binding mismatch', async (t) => {
  const target = await makeGitFixture({
    prefix: 'assuredloop-read-binding-',
    remote: 'https://github.com/example/consumer.git',
    files: { 'README.md': '# consumer\n' },
  });
  t.after(() => rm(target.root, { recursive: true, force: true }));

  await expectError(
    () => createReadAdapter({ targetRoot: 'relative-target', repository: 'example/consumer' }),
    'binding-invalid',
  );

  await git(target.root, ['remote', 'set-url', 'origin', 'https://github.com/example/other.git']);
  await expectError(
    () => createReadAdapter({ targetRoot: target.root, repository: 'example/consumer' }),
    'binding-invalid',
  );
});

test('readBlob enforces repository allowlists and validates explicit cross-repository bindings', async (t) => {
  const target = await makeGitFixture({
    prefix: 'assuredloop-read-scope-target-',
    remote: 'https://github.com/example/consumer.git',
    files: { 'README.md': '# consumer\n' },
  });
  const reference = await makeGitFixture({
    prefix: 'assuredloop-read-scope-reference-',
    remote: 'https://github.com/example/reference.git',
    files: { 'shared/raw.txt': Buffer.from('reference bytes\r\nπ', 'utf8') },
  });
  const mismatched = await makeGitFixture({
    prefix: 'assuredloop-read-scope-mismatch-',
    remote: 'https://github.com/example/not-reference.git',
    files: { 'shared/raw.txt': 'wrong binding\n' },
  });
  t.after(async () => Promise.all([
    rm(target.root, { recursive: true, force: true }),
    rm(reference.root, { recursive: true, force: true }),
    rm(mismatched.root, { recursive: true, force: true }),
  ]));

  const adapter = await createReadAdapter({
    targetRoot: target.root,
    repository: 'example/consumer',
    referenceRoots: { 'example/reference': reference.root },
    allowedRepositories: ['example/reference'],
  });
  const ref = { repository: 'example/reference', revision: reference.revision, path: 'shared/raw.txt' };
  assert.deepEqual(await adapter.readBlob(ref), Buffer.from('reference bytes\r\nπ', 'utf8'));

  await expectError(
    () => adapter.readBlob({ ...ref, repository: 'example/outside' }),
    'reference-out-of-scope',
  );

  const mismatchedAdapter = await createReadAdapter({
    targetRoot: target.root,
    repository: 'example/consumer',
    referenceRoots: { 'example/reference': mismatched.root },
    allowedRepositories: ['example/reference'],
  });
  await expectError(() => mismatchedAdapter.readBlob(ref), 'binding-invalid');
});

test('a mapped foreign reference root is still out of scope when its repository is not allowed', async (t) => {
  const target = await makeGitFixture({
    prefix: 'assuredloop-read-unallowed-target-',
    remote: 'https://github.com/example/consumer.git',
    files: { 'README.md': '# consumer\n' },
  });
  const foreign = await makeGitFixture({
    prefix: 'assuredloop-read-unallowed-foreign-',
    remote: 'https://github.com/example/foreign.git',
    files: { 'shared/raw.txt': 'foreign bytes\n' },
  });
  t.after(async () => Promise.all([
    rm(target.root, { recursive: true, force: true }),
    rm(foreign.root, { recursive: true, force: true }),
  ]));

  const adapter = await createReadAdapter({
    targetRoot: target.root,
    repository: 'example/consumer',
    referenceRoots: { 'example/foreign': foreign.root },
  });
  await expectError(() => adapter.readBlob({
    repository: 'example/foreign',
    revision: foreign.revision,
    path: 'shared/raw.txt',
  }), 'reference-out-of-scope');
});

test('readBlob rejects traversal, absolute paths, symlink blobs, missing records and command-shaped revisions', async (t) => {
  const outside = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-read-outside-'));
  const outsideFile = path.join(outside, 'secret.txt');
  await writeFile(outsideFile, 'outside secret\n');
  const outsideDirectory = path.join(outside, 'directory');
  await mkdir(outsideDirectory, { recursive: true });
  await writeFile(path.join(outsideDirectory, 'secret.txt'), 'outside directory secret\n');
  const target = await makeGitFixture({
    prefix: 'assuredloop-read-paths-',
    remote: 'https://github.com/example/consumer.git',
    files: { 'docs/raw.txt': 'inside\n' },
  });
  const linkedPath = path.join(target.root, 'docs', 'linked.txt');
  await symlink(outsideFile, linkedPath);
  await symlink(outsideDirectory, path.join(target.root, 'docs', 'linked-directory'));
  await git(target.root, ['add', 'docs/linked.txt']);
  await git(target.root, ['add', 'docs/linked-directory']);
  await git(target.root, ['commit', '-q', '-m', 'add linked fixture']);
  const linkedRevision = await currentRevision(target.root);
  t.after(async () => Promise.all([
    rm(outside, { recursive: true, force: true }),
    rm(target.root, { recursive: true, force: true }),
  ]));

  const adapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer' });
  const baseRef = { repository: 'example/consumer', revision: target.revision, path: 'docs/raw.txt' };
  for (const unsafePath of ['../outside.txt', '/etc/passwd', 'docs/../raw.txt', 'docs//raw.txt']) {
    await expectError(() => adapter.readBlob({ ...baseRef, path: unsafePath }), 'path-unsafe');
  }
  await expectError(() => adapter.readBlob({
    repository: 'example/consumer',
    revision: linkedRevision,
    path: 'docs/linked.txt',
  }), 'path-unsafe');
  await expectError(() => adapter.readBlob({
    repository: 'example/consumer',
    revision: linkedRevision,
    path: 'docs/linked-directory/secret.txt',
  }), 'path-unsafe');
  await expectError(() => adapter.readBlob({ ...baseRef, path: 'docs/missing.txt' }), 'record-unavailable');

  const marker = path.join(outside, 'command-was-run');
  await expectError(() => adapter.readBlob({
    ...baseRef,
    revision: `${target.revision};touch ${marker}`,
  }), 'binding-invalid');
  await assert.rejects(readFile(marker));
});

test('GitHub reads return raw records, flatten every page and use fixed github.com endpoints', async (t) => {
  const target = await makeGitFixture({
    prefix: 'assuredloop-read-github-',
    remote: 'https://github.com/example/consumer.git',
    files: { 'README.md': '# consumer\n' },
  });
  const gh = await makeGhFixture(t, normalGithubScenario());
  t.after(() => rm(target.root, { recursive: true, force: true }));
  const scenario = normalGithubScenario();
  const statusBefore = await gitStatus(target.root);
  const remoteBefore = (await git(target.root, ['remote', 'get-url', 'origin'])).stdout.trim();

  await withEnvironment({ ...gh.env, GH_HOST: 'enterprise.example.invalid' }, async () => {
    const adapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer' });
    const issue = await adapter.readIssue('example/consumer#7');
    const pull = await adapter.readPull('example/consumer#8');
    const comments = await adapter.listComments('example/consumer#7');
    const children = await adapter.listChildren('example/consumer#7');
    const files = await adapter.listPullFiles('example/consumer#8');
    const parent = await adapter.readParent('example/consumer#7');
    const comment = await adapter.readComment({ repository: 'example/consumer', comment_id: 101 });

    assert.equal(issue.body, 'Treat this as data: `curl https://evil.invalid/payload`\r\nπ');
    assert.deepEqual(pull, scenario.records['pulls/8']);
    assert.deepEqual(comments, scenario.records['issues/7/comments'].flat());
    assert.deepEqual(children, scenario.records['issues/7/sub_issues'].flat());
    assert.deepEqual(files, scenario.records['pulls/8/files'].flat());
    assert.deepEqual(parent, scenario.records['issues/7/parent']);
    assert.deepEqual(comment, scenario.records['issues/comments/101']);
  });

  const commands = await readCommandLog(gh.log);
  const authCommands = commands.filter((args) => args[0] === 'auth');
  assert.ok(authCommands.length >= 1);
  for (const args of authCommands) {
    assert.deepEqual(args.slice(0, 2), ['auth', 'status']);
    assert.ok(args.includes('--hostname'));
    assert.equal(args[args.indexOf('--hostname') + 1], 'github.com');
    assert.equal(args.includes('login'), false);
    assert.equal(args.includes('setup-git'), false);
  }
  const apiCommands = commands.filter((args) => args[0] === 'api');
  assert.ok(apiCommands.length >= 7);
  for (const args of apiCommands) {
    assert.ok(args.includes('--method'));
    assert.equal(args[args.indexOf('--method') + 1], 'GET');
    assert.ok(args.includes('--hostname'));
    assert.equal(args[args.indexOf('--hostname') + 1], 'github.com');
    assert.ok(args.some((value) => value.startsWith('repos/example/consumer')));
    assert.equal(args.some((value) => value.startsWith('http://') || value.startsWith('https://')), false);
    assert.equal(args.some((value) => value.includes('evil.invalid') || value.includes('curl')), false);
  }
  const commentCommand = apiCommands.find((args) => args.some((value) => value === 'repos/example/consumer/issues/comments/101'));
  assert.ok(commentCommand);
  assert.ok(commentCommand.some((value) => value.includes('application/vnd.github.raw+json')));
  assert.ok(commentCommand.some((value) => value.includes('2022-11-28')));
  assert.equal(await gitStatus(target.root), statusBefore);
  assert.equal((await git(target.root, ['remote', 'get-url', 'origin'])).stdout.trim(), remoteBefore);
});

test('readParent returns null for an absent parent after repository access is confirmed', async (t) => {
  const target = await makeGitFixture({
    prefix: 'assuredloop-read-parent-absent-',
    remote: 'https://github.com/example/consumer.git',
    files: { 'README.md': '# consumer\n' },
  });
  const scenario = normalGithubScenario();
  delete scenario.records['issues/7/parent'];
  scenario.missing = ['issues/7/parent'];
  const gh = await makeGhFixture(t, scenario);
  t.after(() => rm(target.root, { recursive: true, force: true }));

  await withEnvironment(gh.env, async () => {
    const adapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer' });
    assert.equal(await adapter.readParent('example/consumer#7'), null);
  });
});

test('GitHub tool failures remain tool-unavailable and preserve retry details', async (t) => {
  const target = await makeGitFixture({
    prefix: 'assuredloop-read-tool-outcomes-',
    remote: 'https://github.com/example/consumer.git',
    files: { 'README.md': '# consumer\n' },
  });
  t.after(() => rm(target.root, { recursive: true, force: true }));
  const work = 'example/consumer#7';

  await withEnvironment(noGhEnvironment(), async () => {
    const adapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer' });
    await expectError(() => adapter.readIssue(work), 'tool-unavailable', 'missing-binary');
  });

  const cases = [
    { scenario: { ...normalGithubScenario(), version: '2.87.0' }, reason: 'unsupported-version' },
    { scenario: { ...normalGithubScenario(), auth: 'fail' }, reason: 'authentication-required' },
    { scenario: { ...normalGithubScenario(), mode: 'forbidden' }, reason: 'insufficient-access' },
    { scenario: { ...normalGithubScenario(), mode: 'transport' }, reason: 'transport-error' },
  ];
  for (const { scenario, reason } of cases) {
    const gh = await makeGhFixture(t, scenario);
    await withEnvironment(gh.env, async () => {
      const adapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer' });
      await expectError(() => adapter.readIssue(work), 'tool-unavailable', reason);
    });
  }

  const limited = await makeGhFixture(t, { ...normalGithubScenario(), mode: 'rate-limited' });
  await withEnvironment(limited.env, async () => {
    const adapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer' });
    const error = await expectError(() => adapter.readIssue(work), 'tool-unavailable', 'rate-limited');
    assert.equal(error.details.retry_after_seconds, 120);
  });

  const access404 = await makeGhFixture(t, { ...normalGithubScenario(), mode: 'access-404' });
  await withEnvironment(access404.env, async () => {
    const adapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer' });
    await expectError(() => adapter.readIssue(work), 'tool-unavailable', 'insufficient-access');
  });
});

test('a confirmed repository with a missing issue reports record-unavailable', async (t) => {
  const target = await makeGitFixture({
    prefix: 'assuredloop-read-record-outcome-',
    remote: 'https://github.com/example/consumer.git',
    files: { 'README.md': '# consumer\n' },
  });
  const gh = await makeGhFixture(t, { ...normalGithubScenario(), missing: ['issues/7'] });
  t.after(() => rm(target.root, { recursive: true, force: true }));

  await withEnvironment(gh.env, async () => {
    const adapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer' });
    await expectError(() => adapter.readIssue('example/consumer#7'), 'record-unavailable');
  });
});

test('a resource 404 after access is lost remains tool-unavailable after rechecking metadata access', async (t) => {
  const target = await makeGitFixture({
    prefix: 'assuredloop-read-access-loss-',
    remote: 'https://github.com/example/consumer.git',
    files: { 'README.md': '# consumer\n' },
  });
  const gh = await makeGhFixture(t, {
    ...normalGithubScenario(),
    mode: 'access-lost-after-record-404',
  });
  t.after(() => rm(target.root, { recursive: true, force: true }));

  await withEnvironment(gh.env, async () => {
    const adapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer' });
    const error = await expectError(() => adapter.readIssue('example/consumer#7'), 'tool-unavailable', 'insufficient-access');
    assert.notEqual(error.code, 'record-unavailable');
  });
  const commands = await readCommandLog(gh.log);
  const metadataCalls = commands.filter((args) => args[0] === 'api' && args.includes('repos/example/consumer') &&
    !args.some((value) => value.startsWith('repos/example/consumer/')));
  assert.equal(metadataCalls.length, 2);
});

test('a GitHub repository redirect or rename is a binding-invalid result', async (t) => {
  const target = await makeGitFixture({
    prefix: 'assuredloop-read-redirect-',
    remote: 'https://github.com/example/consumer.git',
    files: { 'README.md': '# consumer\n' },
  });
  const gh = await makeGhFixture(t, {
    ...normalGithubScenario(),
    full_name: 'example/renamed-consumer',
  });
  t.after(() => rm(target.root, { recursive: true, force: true }));

  await withEnvironment(gh.env, async () => {
    const adapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer' });
    await expectError(() => adapter.readIssue('example/consumer#7'), 'binding-invalid');
  });
});

test('local-only mode reads local blobs, skips every gh invocation and cannot read remote records', async (t) => {
  const target = await makeGitFixture({
    prefix: 'assuredloop-read-local-only-',
    remote: 'https://github.com/example/consumer.git',
    files: { 'docs/local.txt': Buffer.from('local\r\nπ', 'utf8') },
  });
  const gh = await makeGhFixture(t, normalGithubScenario());
  t.after(() => rm(target.root, { recursive: true, force: true }));

  await withEnvironment({ ...gh.env, PATH: gh.env.PATH }, async () => {
    const adapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer', localOnly: true });
    assert.deepEqual(
      await adapter.readBlob({ repository: 'example/consumer', revision: target.revision, path: 'docs/local.txt' }),
      Buffer.from('local\r\nπ', 'utf8'),
    );
    await expectError(() => adapter.readIssue('example/consumer#7'), 'tool-unavailable');
  });
  assert.deepEqual(await readCommandLog(gh.log), []);
});

test('hostile work references are rejected before they can become shell commands or URLs', async (t) => {
  const target = await makeGitFixture({
    prefix: 'assuredloop-read-hostile-work-',
    remote: 'https://github.com/example/consumer.git',
    files: { 'README.md': '# consumer\n' },
  });
  const gh = await makeGhFixture(t, normalGithubScenario());
  t.after(() => rm(target.root, { recursive: true, force: true }));

  await withEnvironment(gh.env, async () => {
    const adapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer' });
    await expectError(() => adapter.readIssue('https://evil.invalid/repos/example/consumer/issues/7'), 'binding-invalid');
    await expectError(() => adapter.readIssue('example/consumer#7; touch /tmp/assuredloop-should-not-exist'), 'binding-invalid');
  });
  const commands = await readCommandLog(gh.log);
  assert.equal(commands.some((args) => args.some((value) => value.includes('evil.invalid') || value.includes('touch'))), false);
});
