// One smoke test of level 2 with the real model (#181, T14; design.md 11:
// "plus one smoke test with a real model"). Moved here from
// packages/search/test/smoke.test.js by #212. It runs `al search` end to end
// with the real @huggingface/transformers, which al finds beside itself. It
// runs only when that library resolves from the repo top (installed there by
// hand, for example `npm install --no-save @huggingface/transformers@4.3.1`),
// and skips otherwise, as in CI. The first run downloads the model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { LEVEL2_LINE, REPO, TRANSFORMERS, runOk, search, show, smallRepo } from './helpers/search.js';

const TEN_MINUTES = 600_000;
const installed = (() => {
  try {
    createRequire(join(REPO, 'package.json')).resolve(TRANSFORMERS);
    return true;
  } catch {
    return false;
  }
})();

test('level 2 with the real model: al search answers at level 2 and finds the paragraph by its meaning', {
  skip: installed ? false : `${TRANSFORMERS} does not resolve from the repo top: install it there to run the real-model smoke test`,
  timeout: TEN_MINUTES,
}, (t) => {
  const { dir } = smallRepo(t);
  assert.ok(!existsSync(join(dir, 'node_modules')), 'the fixture: the project has no node_modules, so al uses the library beside itself');

  const out = search(dir, ['how', 'long', 'does', 'the', 'emailed', 'download', 'URL', 'keep', 'working'], { timeout: TEN_MINUTES });
  assert.equal(out.level, 2, `level 2 answered (fallback: ${out.fallback})`);
  assert.equal(out.fallback, null);
  assert.ok(out.hits.some((h) => h.id === 'EXP-4' && h.role === 'baseline'), out.hits.map((h) => h.id).join(', '));
  const r = runOk(dir, ['search', 'link', 'lifetime'], { timeout: TEN_MINUTES });
  assert.equal(r.stdout.split('\n')[0], LEVEL2_LINE, show(r));
});
