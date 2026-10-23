// One smoke test of level 2 with the real model (#181, T14; design.md 11:
// "plus one smoke test with a real model"). Moved here from
// packages/search/test/smoke.test.js by #212. It runs `al search` end to end
// with the real @huggingface/transformers, which al finds beside itself. It
// runs only when that library resolves from the repo top (installed there by
// hand: `npm install --no-save --save-peer @huggingface/transformers@4.3.1`;
// without --save-peer npm installs nothing, as the library is the repo's own
// peer), and skips otherwise, as in test.yml. With AL_REQUIRE_REAL_MODEL=1, as
// in publish.yml's test job, it never skips: it fails when the library or the
// model does not load (#220). The first run downloads the model.
//
// #39: after that first search, the test runs al search once more with the
// network blocked (helpers/search.js, netGuard): level 2 must answer from the
// local cache, with no network attempt at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  LEVEL2_LINE, REPO, TRANSFORMERS, netAttempts, netGuard, runOk, search, show, smallRepo,
} from './helpers/search.js';

const TEN_MINUTES = 600_000;
const required = process.env.AL_REQUIRE_REAL_MODEL === '1';
const installed = (() => {
  try {
    createRequire(join(REPO, 'package.json')).resolve(TRANSFORMERS);
    return true;
  } catch {
    return false;
  }
})();

test('level 2 with the real model: al search answers at level 2 and finds the paragraph by its meaning', {
  skip: installed || required ? false : `${TRANSFORMERS} does not resolve from the repo top: install it there to run the real-model smoke test`,
  timeout: TEN_MINUTES,
}, (t) => {
  assert.ok(installed, `${TRANSFORMERS} does not resolve from the repo top, and AL_REQUIRE_REAL_MODEL=1 asks for the real model`);
  const { dir } = smallRepo(t);
  assert.ok(!existsSync(join(dir, 'node_modules')), 'the fixture: the project has no node_modules, so al uses the library beside itself');

  const out = search(dir, ['how', 'long', 'does', 'the', 'emailed', 'download', 'URL', 'keep', 'working'], { timeout: TEN_MINUTES });
  assert.equal(out.level, 2, `level 2 answered (fallback: ${out.fallback})`);
  assert.equal(out.fallback, null);
  assert.ok(out.hits.some((h) => h.id === 'EXP-4' && h.role === 'baseline'), out.hits.map((h) => h.id).join(', '));
  const r = runOk(dir, ['search', 'link', 'lifetime'], { timeout: TEN_MINUTES });
  assert.equal(r.stdout.split('\n')[0], LEVEL2_LINE, show(r));

  // #39: once more, with the network blocked. The model is in the cache now.
  const log = join(dir, '.git', 'network.log');
  const guard = netGuard(join(dir, '.git', 'no-network.mjs'), { log, mode: 'block' });
  const off = search(dir, ['when', 'does', 'the', 'emailed', 'download', 'URL', 'stop', 'working'], {
    nodeArgs: ['--import', pathToFileURL(guard).href], timeout: TEN_MINUTES,
  });
  const attempts = netAttempts(log);
  assert.deepEqual(attempts, [], `with the model in the cache, level 2 makes no network attempt:\n${attempts.map((a) => `${a.road} ${a.target}`).join('\n')}`);
  assert.equal(off.level, 2, `level 2 answered with the network blocked (fallback: ${off.fallback})`);
  assert.equal(off.fallback, null);
  assert.ok(off.hits.some((h) => h.id === 'EXP-4' && h.role === 'baseline'), off.hits.map((h) => h.id).join(', '));
});
