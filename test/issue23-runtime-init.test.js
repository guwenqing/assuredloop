import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { makeRuntimeFixture, runInit, auditReads, auditCommands } from './fixtures/issue23-runtime/helpers.mjs';

function linkedNotice(result) { assert.deepEqual(result.value.runtime, { mode: 'linked-development', toolkit_verification: 'not-performed' }); }

for (const layout of ['local-linked', 'global-linked', 'local-installed', 'global-installed', 'direct']) {
  test(`issue23 runtime: ${layout} ${layout.endsWith('linked') ? 'omits' : 'retains'} packaged contract integrity reads`, async (t) => {
    const f = await makeRuntimeFixture(t, { layout });
    const checked = await runInit(f, { instrument: true });
    const reads = await auditReads(f);
    if (f.linked) {
      assert.equal(checked.exit, 0, JSON.stringify({ exit: checked.exit, status: checked.value?.status, code: checked.value?.code, message: checked.value?.message, stderr: checked.stderr }));
      assert.equal(checked.value.status, 'preview');
      assert.deepEqual(reads, [], 'linked init must not read packaged contract bytes for integrity verification');
      const commands = await auditCommands(f);
      assert.ok(commands.some((entry) => entry.command === 'git'), 'consumer Git binding reads still occur');
      assert.ok(commands.every((entry) => entry.command !== 'npm' && (entry.command !== 'git' || entry.args.includes(f.target.root))), 'no toolkit pack, dependency, source or Git-cleanliness audit command');
      linkedNotice(checked);
    } else {
      assert.notEqual(checked.exit, 0, JSON.stringify({ exit: checked.exit, status: checked.value?.status, code: checked.value?.code, message: checked.value?.message, stderr: checked.stderr }));
      assert.ok(reads.length, 'nonlinked init must still reach the real packaged-contract read boundary');
      assert.match(checked.value.message, /Independent sentinel/);
    }
  });
}

for (const layout of ['local-linked', 'local-installed', 'direct']) {
  for (const variant of ['changed-contract', 'release-mismatch']) {
    test(`issue23 runtime: ${layout} ${variant} respects the runtime-specific gate`, async (t) => {
      const f = await makeRuntimeFixture(t, { layout });
      if (variant === 'changed-contract') {
        const asset = path.join(f.toolkit, 'contracts', f.metadata.files[0].path);
        await writeFile(asset, `${await readFile(asset, 'utf8')}\nMutable development note.\n`);
      } else { f.config.project.workflow.version = '9.9.9'; await f.saveConfig(); }
      const checked = await runInit(f);
      if (f.linked) {
        assert.equal(checked.exit, 0, JSON.stringify({ exit: checked.exit, status: checked.value?.status, code: checked.value?.code, message: checked.value?.message, stderr: checked.stderr }));
        assert.equal(checked.value.status, 'preview');
        linkedNotice(checked);
        const configFile = checked.value.files.find((entry) => entry.path === '.assuredloop/config.json');
        assert.deepEqual(JSON.parse(configFile.content).project.workflow, f.config.project.workflow, 'declared binding stays unchanged');
      } else {
        assert.notEqual(checked.exit, 0);
        assert.equal(checked.value.code, variant === 'changed-contract' ? 'contract-invalid' : 'version-mismatch');
      }
    });
  }
}

test('issue23 runtime: linked apply retains one observation and declared consumer binding', async (t) => {
  const f = await makeRuntimeFixture(t);
  f.config.project.workflow.version = '9.9.9'; await f.saveConfig();
  const checked = await runInit(f, { apply: true });
  assert.equal(checked.exit, 0, JSON.stringify({ exit: checked.exit, status: checked.value?.status, code: checked.value?.code, message: checked.value?.message, stderr: checked.stderr }));
  assert.equal(checked.value.status, 'applied');
  linkedNotice(checked);
  assert.equal((checked.stdout.match(/"linked-development"/g) || []).length, 1);
  assert.deepEqual(JSON.parse(await readFile(path.join(f.target.root, '.assuredloop/config.json'), 'utf8')), f.config);
  assert.equal(await readFile(path.join(f.target.root, 'README.md'), 'utf8'), '# Keep consumer content\n');
});

for (const variant of ['bad-config', 'wrong-origin', 'missing-native-context', 'native-root-owner', 'file-conflict', 'escaping-openspec-root', 'linked-skill-root', 'missing-skill-assets']) {
  test(`issue23 runtime: linked init still rejects ${variant}`, async (t) => {
    const f = await makeRuntimeFixture(t);
    if (variant === 'bad-config') delete f.config.project.review;
    if (variant === 'wrong-origin') f.config.repository.name = 'different/consumer';
    if (variant === 'missing-native-context') await rm(path.join(f.target.root, 'openspec/config.yaml'));
    if (variant === 'native-root-owner') {
      await mkdir(path.join(f.target.root, '.gemini/skills'), { recursive: true });
      await writeFile(path.join(f.target.root, '.gemini/skills/.openspec-target'), 'a-different-tool\n');
    }
    if (variant === 'file-conflict') {
      await mkdir(path.join(f.target.root, '.assuredloop'), { recursive: true });
      await writeFile(path.join(f.target.root, '.assuredloop/config.json'), 'Consumer-owned conflicting configuration.\n');
    }
    if (variant === 'escaping-openspec-root') f.config.repository.openspec_root = '../outside';
    if (variant === 'linked-skill-root') await symlink(f.root, path.join(f.target.root, '.gemini'), 'dir');
    if (variant === 'missing-skill-assets') await rm(path.join(f.toolkit, 'skills'), { recursive: true });
    await f.saveConfig();
    const checked = await runInit(f);
    assert.notEqual(checked.exit, 0, JSON.stringify({ exit: checked.exit, status: checked.value?.status, code: checked.value?.code, message: checked.value?.message, stderr: checked.stderr }));
    assert.notEqual(checked.value?.status, 'preview');
    if (variant === 'bad-config' || variant === 'wrong-origin' || variant === 'missing-native-context') assert.equal(checked.value.code, 'binding-invalid');
    if (variant === 'native-root-owner') assert.equal(checked.value.code, 'compatibility-error');
    if (variant === 'file-conflict') assert.equal(checked.value.code, 'file-conflict');
    if (variant === 'escaping-openspec-root' || variant === 'linked-skill-root') assert.equal(checked.value.code, 'path-unsafe');
  });
}
