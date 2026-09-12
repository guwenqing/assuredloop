import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile as callback } from 'node:child_process';
import { promisify } from 'node:util';
import { symlink, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { makeRuntimeFixture } from './fixtures/issue23-runtime/helpers.mjs';

const exec = promisify(callback);

// Load the real CLI while controlling its lexical invocation context. Unlike an
// OS-rejected executable, these cases reach the product's resolver boundary.
for (const variant of ['matching-module', 'cycle', 'dangling', 'different-module']) {
  test(`issue23 runtime: loaded CLI checks ${variant} invocation context`, async (t) => {
    const f = await makeRuntimeFixture(t, { layout: 'direct' });
    const modulePath = path.join(f.toolkit, 'src/cli.js');
    let invokedPath = modulePath;
    if (variant === 'cycle') {
      invokedPath = path.join(f.root, 'entry-a');
      const other = path.join(f.root, 'entry-b');
      await symlink(other, invokedPath);
      await symlink(invokedPath, other);
    }
    if (variant === 'dangling') {
      invokedPath = path.join(f.root, 'missing-entry');
      await symlink(path.join(f.root, 'missing-target'), invokedPath);
    }
    if (variant === 'different-module') {
      invokedPath = path.join(f.root, 'different-cli.js');
      await writeFile(invokedPath, '// A different executable cannot select this loaded package.\n');
    }
    const argv = [process.execPath, invokedPath, 'init', '--target', f.target.root, '--config', f.configPath, '--local-only'];
    const script = `process.argv = ${JSON.stringify(argv)}; await import(${JSON.stringify(pathToFileURL(modulePath).href)});`;
    let result;
    try { result = { ...await exec(process.execPath, ['--input-type=module', '-e', script], { timeout: 15000, maxBuffer: 4 * 1024 * 1024 }), exit: 0 }; }
    catch (error) { result = { stdout: error.stdout ?? '', stderr: error.stderr ?? '', exit: error.code }; }
    assert.ok(result.stdout.trim(), `Loaded CLI must report selection failure itself: ${result.stderr}`);
    const value = JSON.parse(result.stdout);
    if (variant === 'matching-module') {
      assert.equal(result.exit, 0, JSON.stringify({ status: value.status, code: value.code }));
      assert.equal(value.status, 'preview');
      assert.notEqual(value.runtime?.mode, 'linked-development');
    } else {
      assert.notEqual(result.exit, 0, JSON.stringify({ status: value.status, code: value.code }));
      assert.equal(value.status, 'error');
      assert.ok(value.code, 'unresolved selection is an explicit diagnostic');
    }
  });
}
