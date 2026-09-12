import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { makeRuntimeFixture, runInit, git } from './fixtures/issue23-runtime/helpers.mjs';

for (const layout of ['local-linked', 'global-linked']) for (const scoped of [false, true]) {
  test(`issue23 runtime: ${layout} ${scoped ? 'scoped' : 'unscoped'} package selects linked development once`, async (t) => {
    const f = await makeRuntimeFixture(t, { layout, scoped });
    const checked = await runInit(f);
    assert.equal(checked.exit, 0, JSON.stringify({ exit: checked.exit, status: checked.value?.status, code: checked.value?.code, message: checked.value?.message, stderr: checked.stderr }));
    assert.equal(checked.value.status, 'preview');
    assert.deepEqual(checked.value.runtime, { mode: 'linked-development', toolkit_verification: 'not-performed' });
    assert.equal((checked.stdout.match(/"linked-development"/g) || []).length, 1, 'one operation observation');
    assert.equal((checked.stdout.match(/"not-performed"/g) || []).length, 1, 'do not repeat toolkit exclusion at nested boundaries');
    assert.equal((await git(f.target.root, ['status', '--porcelain'])).stdout, f.statusBefore);
  });
}

for (const layout of ['local-installed', 'global-installed', 'direct']) {
  test(`issue23 runtime: ${layout} has no package-root link exemption`, async (t) => {
    const f = await makeRuntimeFixture(t, { layout });
    const checked = await runInit(f);
    assert.equal(checked.exit, 0, JSON.stringify({ exit: checked.exit, status: checked.value?.status, code: checked.value?.code, message: checked.value?.message, stderr: checked.stderr }));
    assert.equal(checked.value.status, 'preview');
    assert.notEqual(checked.value.runtime?.mode, 'linked-development');
    assert.notEqual(checked.value.runtime?.toolkit_verification, 'not-performed');
  });
}

for (const variant of ['dangling', 'cycle']) {
  test(`issue23 runtime: ${variant} selected package link fails explicitly`, async (t) => {
    const f = await makeRuntimeFixture(t);
    await rm(f.selectedPackage);
    const missing = path.join(f.root, 'missing-package');
    if (variant === 'cycle') await symlink(f.selectedPackage, missing, 'dir');
    await symlink(missing, f.selectedPackage, 'dir');
    const checked = await runInit(f);
    assert.notEqual(checked.exit, 0);
    assert.ok(checked.stderr || checked.value?.code || typeof checked.exit === 'string', 'unexecutable links remain explicit process failures');
    assert.notEqual(checked.value?.status, 'preview');
  });
}

test('issue23 runtime: malformed selected package metadata fails rather than claiming linked success', async (t) => {
  const f = await makeRuntimeFixture(t);
  await writeFile(path.join(f.toolkit, 'package.json'), '{ invalid package metadata');
  const checked = await runInit(f);
  assert.notEqual(checked.exit, 0);
  assert.ok(checked.stderr || checked.value?.code);
});

test('issue23 runtime: consumer configuration cannot request its own linked exemption', async (t) => {
  const f = await makeRuntimeFixture(t, { layout: 'local-installed' });
  f.config.runtime = { mode: 'linked-development', toolkit_verification: 'not-performed' };
  await f.saveConfig();
  const checked = await runInit(f);
  assert.notEqual(checked.exit, 0);
  assert.equal(checked.value.code, 'binding-invalid');
  assert.notEqual(checked.value.runtime?.mode, 'linked-development');
});

for (const variant of ['package-name-mismatch', 'escaping-bin']) {
  test(`issue23 runtime: executable package relationship rejects ${variant}`, async (t) => {
    const f = await makeRuntimeFixture(t);
    const packagePath = path.join(f.toolkit, 'package.json');
    const pkg = JSON.parse(await readFile(packagePath, 'utf8'));
    if (variant === 'package-name-mismatch') {
      pkg.name = 'different-package';
      f.metadata.name = pkg.name;
      f.config.project.workflow.name = pkg.name;
      await writeFile(path.join(f.toolkit, 'contracts/metadata.json'), JSON.stringify(f.metadata));
      await f.saveConfig();
    } else pkg.bin.assuredloop = '../outside/cli.js';
    await writeFile(packagePath, JSON.stringify(pkg));
    const checked = await runInit(f);
    assert.notEqual(checked.exit, 0, JSON.stringify({ status: checked.value?.status, code: checked.value?.code }));
    assert.notEqual(checked.value?.status, 'preview');
  });
}
