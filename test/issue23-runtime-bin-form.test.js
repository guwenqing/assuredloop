import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { makeRuntimeFixture, runInit } from './fixtures/issue23-runtime/helpers.mjs';

for (const [form, bin] of [
  ['object with leading dot', { assuredloop: './src/cli.js' }],
  ['string with leading dot', './src/cli.js'],
  ['plain string', 'src/cli.js'],
]) {
  test(`issue23 runtime: ordinary installed npm bin supports ${form}`, async (t) => {
    const f = await makeRuntimeFixture(t, { layout: 'local-installed' });
    const packagePath = path.join(f.toolkit, 'package.json');
    const pkg = JSON.parse(await readFile(packagePath, 'utf8'));
    pkg.bin = bin;
    await writeFile(packagePath, JSON.stringify(pkg));
    const checked = await runInit(f);
    assert.equal(checked.exit, 0, JSON.stringify({ status: checked.value?.status, code: checked.value?.code, message: checked.value?.message, stderr: checked.stderr }));
    assert.equal(checked.value.status, 'preview');
    assert.notEqual(checked.value.runtime?.mode, 'linked-development');
    assert.notEqual(checked.value.runtime?.toolkit_verification, 'not-performed');
  });
}
