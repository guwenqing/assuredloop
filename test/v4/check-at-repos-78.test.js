// #78: `al check --at <commit>` resolves a repo path in config from the clone
// itself, not from a temporary folder. The central config names its output
// repos by relative paths such as ../invoicer-worker, with the worker pinned
// to a full commit. With that config committed, `al check --at HEAD` shows
// the same `info result invoicer-worker/...` lines as plain `al check`, and
// no line says "no clone at".
//
// The world is the cross-repo world of helpers/cross-repo.js. The output
// repo invoicer-mobile is left out of the config here, because it never has
// a clone. Written from the requirement and the public interface only.
// Nothing here reads src/. No model and no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centralConfig, commit, world, worldOutputs } from './helpers/cross-repo.js';
import { al, show } from './helpers/project.js';

const lines = (r) => r.stdout.split('\n');
const results = (r) => lines(r).filter((l) => l.startsWith('info result invoicer-worker/'));
const noClone = (r) => lines(r).filter((l) => l.includes('no clone at'));

// The central repo with invoicer-web and invoicer-worker (pinned to the full
// commit K5) in its committed config.
function central(t) {
  const w = world(t);
  const K5 = w.shas.worker.K5;
  const outputs = worldOutputs(K5)
    .filter((o) => o.name !== 'invoicer-mobile')
    .map((o) => (o.name === 'invoicer-worker' ? { ...o, commit: K5 } : o));
  assert.ok(outputs.some((o) => o.path === '../invoicer-worker' && o.commit === K5), 'the worker by a relative path, pinned to K5');
  centralConfig(w.central, outputs);
  commit(w.central, 'Pin the worker to its full commit');
  return w.central;
}

function check(dir, ...args) {
  const r = al(dir, ['check', ...args]);
  assert.equal(r.code, 0, show(r));
  return r;
}

test('#78 control: plain al check shows the info result lines of invoicer-worker, and no "no clone at" line', (t) => {
  const r = check(central(t));
  assert.ok(results(r).length > 0, `info result invoicer-worker/ lines:\n${show(r)}`);
  assert.deepEqual(noClone(r), [], show(r));
});

test('#78 al check --at HEAD resolves ../invoicer-worker from the clone: the same info result lines as plain al check, and no "no clone at" line', (t) => {
  const dir = central(t);
  const plain = check(dir);
  const at = check(dir, '--at', 'HEAD');
  assert.ok(results(plain).length > 0, `info result invoicer-worker/ lines in plain al check:\n${show(plain)}`);
  assert.deepEqual(results(at), results(plain), `the same info result lines:\n${show(at)}\n${show(plain)}`);
  assert.deepEqual(noClone(at), [], show(at));
});
