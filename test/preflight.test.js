import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { applyInitialization, planInitialization } from '../src/adoption.js';
import { githubPreflight, nativeTools } from '../src/native.js';
import {
  execFile,
  makeGitFixture,
  makePackageFixture,
  makeConfig,
  readJson,
  writeJson,
} from './fixtures/adoption/helpers.js';

const execFileDirect = promisify(execFileCallback);
const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname);
const nodeBin = path.dirname(process.execPath);

async function expectCode(operation, code, reason) {
  const error = await expectError(operation, code, reason);
  return error;
}

async function expectError(operation, code, reason) {
  let captured;
  await assert.rejects(operation, (error) => {
    captured = error;
    assert.equal(error?.code, code);
    if (reason) assert.equal(error?.details?.reason, reason);
    return true;
  });
  return captured;
}

async function withPath(value, operation, extra = {}) {
  const previous = { PATH: process.env.PATH };
  for (const key of Object.keys(extra)) previous[key] = process.env[key];
  process.env.PATH = value;
  for (const [key, setting] of Object.entries(extra)) {
    if (setting === undefined) delete process.env[key];
    else process.env[key] = setting;
  }
  try {
    return await operation();
  } finally {
    if (previous.PATH === undefined) delete process.env.PATH;
    else process.env.PATH = previous.PATH;
    for (const [key, setting] of Object.entries(previous)) {
      if (key === 'PATH') continue;
      if (setting === undefined) delete process.env[key];
      else process.env[key] = setting;
    }
  }
}

async function makeGhFixture(t, {
  version = '2.88.0',
  mode = 'labels-missing',
} = {}) {
  const bin = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-gh-bin-'));
  const log = path.join(bin, 'commands.log');
  const labels = [[{ name: 'type:request' }, { name: 'type:task' }]];
  const behavior = JSON.stringify({ version, mode, labels });
  const script = `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
const behavior = ${behavior};
const args = process.argv.slice(2);
appendFileSync(process.env.MOCK_GH_LOG, JSON.stringify(args) + '\\n');
if (args[0] === '--version') {
  console.log('gh version ' + behavior.version);
} else if (args[0] === 'auth') {
  if (behavior.mode === 'auth-fails') {
    console.error('not logged in');
    process.exitCode = 1;
  }
} else if (args[0] === 'api') {
  if (behavior.mode === 'forbidden') {
    console.error('HTTP 403 Forbidden');
    process.exitCode = 1;
  } else if (behavior.mode === 'rate-limited') {
    console.error('HTTP 429 rate limit exceeded\\nRetry-After: 120\\nX-RateLimit-Reset: 1893456000');
    process.exitCode = 1;
  } else if (args[1]?.endsWith('/labels?per_page=100')) {
    console.log(JSON.stringify(behavior.labels));
  } else {
    console.log(JSON.stringify({ full_name: args[1]?.replace(/^repos\\//, '') }));
  }
}
`;
  const executable = path.join(bin, 'gh');
  await writeFile(executable, script, { mode: 0o755 });
  await chmod(executable, 0o755);
  t.after(() => rm(bin, { recursive: true, force: true }));
  return { bin, log, env: { ...process.env, PATH: `${bin}:${nodeBin}:/usr/bin:/bin`, MOCK_GH_LOG: log } };
}

async function makeScenario(t) {
  const source = await makeGitFixture({
    prefix: 'assuredloop-preflight-source-',
    files: { 'openspec/specs/workflow/spec.md': '# Workflow contract\n' },
  });
  const packageFixture = await makePackageFixture({
    sourceRef: {
      repository: 'framework/source',
      revision: source.revision,
      path: 'openspec/specs',
    },
    contractFiles: { 'workflow/spec.md': '# Workflow contract\n' },
  });
  const target = await makeGitFixture({
    prefix: 'assuredloop-preflight-target-',
    remote: 'https://github.com/example/preflight-consumer.git',
    files: {
      'README.md': '# Consumer\n',
      'openspec/config.yaml': 'schema: spec-driven\n',
      'openspec/specs/product/spec.md': '# Product\n',
    },
  });
  const config = makeConfig(packageFixture.metadata, { repository: 'example/preflight-consumer' });
  t.after(async () => {
    await Promise.all([
      rm(source.root, { recursive: true, force: true }),
      rm(packageFixture.root, { recursive: true, force: true }),
      rm(target.root, { recursive: true, force: true }),
    ]);
  });
  return { source, packageFixture, target, config };
}

test('GitHub preflight reports a missing gh binary without installing or logging in', async () => {
  await withPath(path.join(os.tmpdir(), 'assuredloop-no-gh'), () =>
    expectCode(
      () => githubPreflight('example/project', { type: {} }, false),
      'tool-unavailable',
      'missing-binary',
    ));
});

test('GitHub preflight rejects an unsupported gh version', async (t) => {
  const fixture = await makeGhFixture(t, { version: '2.87.0' });
  await withPath(fixture.env.PATH, () =>
    expectCode(
      () => githubPreflight('example/project', { type: {} }, false),
      'tool-unavailable',
      'unsupported-version',
    ), { MOCK_GH_LOG: fixture.log });
  const commands = (await readFile(fixture.log, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(commands, [['--version']]);
});

test('GitHub preflight reports unauthenticated access explicitly', async (t) => {
  const fixture = await makeGhFixture(t, { mode: 'auth-fails' });
  await withPath(fixture.env.PATH, () =>
    expectCode(
      () => githubPreflight('example/project', { type: {} }, false),
      'tool-unavailable',
      'authentication-required',
    ), { MOCK_GH_LOG: fixture.log });
  const commands = (await readFile(fixture.log, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(commands, [['--version'], ['auth', 'status', '--hostname', 'github.com']]);
});

test('GitHub preflight distinguishes denied and rate-limited repository access', async (t) => {
  const denied = await makeGhFixture(t, { mode: 'forbidden' });
  await withPath(denied.env.PATH, () =>
    expectCode(
      () => githubPreflight('example/project', { type: {} }, false),
      'tool-unavailable',
      'insufficient-access',
    ), { MOCK_GH_LOG: denied.log });

  const limited = await makeGhFixture(t, { mode: 'rate-limited' });
  const limitedError = await withPath(limited.env.PATH, () =>
    expectError(
      () => githubPreflight('example/project', { type: {} }, false),
      'tool-unavailable',
      'rate-limited',
    ), { MOCK_GH_LOG: limited.log });
  assert.equal(limitedError.details.retry_after_seconds, 120);
  assert.equal(limitedError.details.retry_at, '2030-01-01T00:00:00.000Z');
});

test('local-only preflight skips gh and reports missing labels without mutation commands', async (t) => {
  const local = await withPath(path.join(os.tmpdir(), 'assuredloop-no-gh-local'), () =>
    githubPreflight('example/project', { type: { request: 'type:request' } }, true));
  assert.ok(local.some((diagnostic) => diagnostic.code === 'github-skipped'));

  const fixture = await makeGhFixture(t, { mode: 'labels-missing' });
  const diagnostics = await withPath(fixture.env.PATH, () =>
    githubPreflight('example/project', {
      type: {
        request: 'type:request',
        epic: 'type:epic',
        task: 'type:task',
        bug: 'type:bug',
        spike: 'type:spike',
      },
    }, false), { MOCK_GH_LOG: fixture.log });
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, 'labels-missing');
  assert.deepEqual(diagnostics[0].labels, ['type:epic', 'type:bug', 'type:spike']);
  const commands = (await readFile(fixture.log, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(commands.map((args) => args.slice(0, 2)), [
    ['--version'],
    ['auth', 'status'],
    ['api', 'repos/example/project'],
    ['api', 'repos/example/project/labels?per_page=100'],
  ]);
  assert.equal(commands.some((args) => args.includes('--method') || args.includes('POST')), false);
});

test('native registry version and shape incompatibilities are explicit in an isolated runtime copy', async (t) => {
  async function probe({ version, registry }) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-native-probe-'));
    const sourceDir = path.join(root, 'src');
    const packageDir = path.join(root, 'node_modules/@fission-ai/openspec');
    await mkdir(sourceDir, { recursive: true });
    await mkdir(path.join(packageDir, 'dist/core'), { recursive: true });
    await copyFile(path.join(repositoryRoot, 'src/native.js'), path.join(sourceDir, 'native.js'));
    await copyFile(path.join(repositoryRoot, 'src/files.js'), path.join(sourceDir, 'files.js'));
    await writeJson(path.join(root, 'package.json'), { type: 'module' });
    await writeJson(path.join(packageDir, 'package.json'), {
      name: '@fission-ai/openspec',
      version,
      type: 'module',
      main: 'dist/index.js',
    });
    await writeFile(path.join(packageDir, 'dist/index.js'), 'export {};\n');
    await writeFile(path.join(packageDir, 'dist/core/config.js'), `${registry}\n`);
    const script = path.join(root, 'probe.mjs');
    await writeFile(script, `import { nativeTools } from './src/native.js';
try {
  await nativeTools();
  console.log(JSON.stringify({ ok: true }));
} catch (error) {
  console.log(JSON.stringify({ ok: false, code: error.code, message: error.message }));
}
`);
    t.after(() => rm(root, { recursive: true, force: true }));
    const { stdout } = await execFile(process.execPath, [script], { cwd: root });
    return JSON.parse(stdout);
  }

  const old = await probe({ version: '1.11.0', registry: 'export const AI_TOOLS = [];'});
  assert.equal(old.ok, false);
  assert.equal(old.code, 'compatibility-error');
  assert.match(old.message, /version|1\.11\.0/i);
  const malformed = await probe({ version: '1.12.0', registry: 'export const AI_TOOLS = {};'});
  assert.equal(malformed.ok, false);
  assert.equal(malformed.code, 'compatibility-error');
  assert.match(malformed.message, /registry shape/i);
});

test('apply rejects target changes after preview and leaves absent artifacts untouched', async (t) => {
  const { packageFixture, target, config } = await makeScenario(t);
  const plan = await planInitialization({ targetRoot: target.root, config, packageRoot: packageFixture.root, localOnly: true });
  await writeJson(path.join(target.root, '.assuredloop/config.json'), { changed: true });
  await assert.rejects(
    () => applyInitialization(plan),
    (error) => error?.code === 'file-conflict',
  );
  await assert.rejects(readFile(path.join(target.root, '.gemini/skills/assuredloop-adopt/SKILL.md')));
  assert.deepEqual(await readJson(path.join(target.root, '.assuredloop/config.json')), { changed: true });
});

test('target package source references are checked independently of version text', async (t) => {
  const { packageFixture, target, config } = await makeScenario(t);
  const wrongSource = structuredClone(config);
  wrongSource.project.workflow.source_ref.revision = '0'.repeat(40);
  await expectCode(
    () => planInitialization({ targetRoot: target.root, config: wrongSource, packageRoot: packageFixture.root, localOnly: true }),
    'version-mismatch',
  );
});

test('nativeTools resolves the pinned registry and exposes the selected native roots', async () => {
  const tools = await nativeTools();
  assert.ok(tools.some((tool) => tool.value === 'gemini' && tool.skillsDir === '.gemini'));
  assert.ok(tools.some((tool) => tool.value === 'codex' && tool.skillsDir === '.agents'));
});
