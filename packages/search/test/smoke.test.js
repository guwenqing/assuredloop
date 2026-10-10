// One smoke test of level 2 with the real model (#181, T14; design.md 11:
// "plus one smoke test with a real model"). It runs the package's default
// export end to end through `al-v4 search`. It skips only when the package's
// dependencies are not installed (packages/search/node_modules absent), as in
// CI. The first run downloads the model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runOk, search, show, smallRepo } from '../../../test/v4/helpers/search.js';

const PKG = fileURLToPath(new URL('../', import.meta.url));
const installed = existsSync(join(PKG, 'node_modules'));
const TEN_MINUTES = 600_000;

test('level 2 with the real model: al-v4 search answers at level 2 and finds the paragraph by its meaning', {
  skip: installed ? false : 'packages/search/node_modules is absent: run npm install in packages/search to run the real-model smoke test',
  timeout: TEN_MINUTES,
}, (t) => {
  const { dir } = smallRepo(t);
  // The project's @assuredloop/search is the real package's default export.
  const target = join(dir, 'node_modules/@assuredloop/search');
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, 'package.json'), `${JSON.stringify({ name: '@assuredloop/search', version: '0.0.0-smoke', private: true, type: 'module', exports: './index.js' })}\n`);
  writeFileSync(join(target, 'index.js'), `export { default } from ${JSON.stringify(pathToFileURL(join(PKG, 'index.js')).href)};\n`);

  const out = search(dir, ['how', 'long', 'does', 'the', 'emailed', 'download', 'URL', 'keep', 'working'], { timeout: TEN_MINUTES });
  assert.equal(out.level, 2, `level 2 answered (fallback: ${out.fallback})`);
  assert.equal(out.fallback, null);
  assert.ok(out.hits.some((h) => h.id === 'EXP-4' && h.role === 'baseline'), out.hits.map((h) => h.id).join(', '));
  const r = runOk(dir, ['search', 'link', 'lifetime'], { timeout: TEN_MINUTES });
  assert.match(r.stdout.split('\n')[0], /^Level\s+2\b.*bge-small/i, show(r));
});
