import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { git, makeGitFixture } from './fixtures/adoption/helpers.js';

const execFile = promisify(execFileCallback);
const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname);
const cliPath = path.join(repositoryRoot, 'src', 'cli.js');

async function runCli(args, options) {
  try {
    const result = await execFile(process.execPath, [cliPath, ...args], options);
    return { ...result, exitCode: 0 };
  } catch (error) {
    return {
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
      exitCode: error.code,
    };
  }
}

test('check local-only emits an incomplete structured diagnostic without target or remote writes', async (t) => {
  const target = await makeGitFixture({
    prefix: 'assuredloop-check-entry-',
    remote: 'https://github.com/example/consumer.git',
    files: { 'README.md': '# bound consumer\n' },
  });
  t.after(() => rm(target.root, { recursive: true, force: true }));
  const statusBefore = (await git(target.root, ['status', '--porcelain'])).stdout;
  const remoteBefore = (await git(target.root, ['remote', 'get-url', 'origin'])).stdout.trim();
  const env = {
    ...process.env,
    PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`,
    GH_HOST: 'enterprise.example.invalid',
  };

  const result = await runCli([
    'check',
    '--target', target.root,
    '--work', 'example/consumer#7',
    '--local-only',
  ], { env });

  const diagnostic = JSON.parse(result.stdout.trim());
  assert.equal(diagnostic.operation, 'check');
  assert.equal(diagnostic.mode, 'local-only');
  assert.equal(diagnostic.status, 'incomplete');
  assert.ok(Array.isArray(diagnostic.findings));
  assert.ok(diagnostic.findings.some((finding) => finding.code === 'github-skipped'));
  assert.equal(diagnostic.status, 'incomplete');
  assert.equal(await git(target.root, ['status', '--porcelain']).then(({ stdout }) => stdout), statusBefore);
  assert.equal((await git(target.root, ['remote', 'get-url', 'origin'])).stdout.trim(), remoteBefore);
  assert.equal(await readFile(path.join(target.root, 'README.md'), 'utf8'), '# bound consumer\n');
});
