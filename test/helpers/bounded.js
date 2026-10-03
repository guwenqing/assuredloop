// A run of the CLI with a hard limit on its time, for the tests of input that
// must not make a read hang or take long (#138). Nothing here reads the code
// under test.
import assert from 'node:assert/strict';
import { runAl } from './fixture.js';

// Generous: a loaded machine runs a plain check in a few seconds; a hang or
// a quadratic read of the fixtures' input takes minutes.
export const LIMIT = 30_000;

// al ...args in `cwd`, killed after `limit` ms; with the time it took.
export function timed(cwd, args, { limit = LIMIT, ...opts } = {}) {
  const start = Date.now();
  const r = runAl(cwd, args, { ...opts, timeout: limit });
  return { ...r, ms: Date.now() - start };
}

// It finished on its own, within `limit`, and did not crash.
export function assertFinished(r, args, limit = LIMIT) {
  assert.ok(r.signal === null && r.code !== null,
    `al ${args.join(' ')} was killed after ${r.ms} ms (signal ${r.signal}): it hangs or takes too long`);
  assert.ok(r.ms < limit, `al ${args.join(' ')} took ${r.ms} ms, over ${limit} ms`);
  assert.doesNotMatch(r.stderr, /internal error/, `al ${args.join(' ')} crashed:\n${r.stderr}`);
}
