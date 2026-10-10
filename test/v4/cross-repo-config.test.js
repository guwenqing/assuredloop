// T12 (#180): the outputs: entries of the central config, as crossRepo(top)
// gives them back in `repos` (interface-180.md 1 and 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { invoicer } from './helpers/invoicer.js';
import { centralConfig, crossRepo, MOBILE_URL, rev, world } from './helpers/cross-repo.js';
import { git } from './helpers/project.js';

// One world, read by every test of this file: the central config lists one
// clone under several names, and the entries that cannot be resolved.
let shared = null;
async function variants() {
  if (shared) return shared;
  const w = world(null);
  const { A, main } = w.shas.web;
  git(w.web, 'tag', 'v1', A);
  mkdirSync(join(w.root, 'plain'));
  writeFileSync(join(w.root, 'plain', 'README.md'), 'Not a git repository.\n');
  centralConfig(w.central, [
    { name: 'web-main', path: '../invoicer-web', commit: 'main' },
    { name: 'web-tag', path: '../invoicer-web', commit: 'v1' },
    { name: 'web-short', path: '../invoicer-web', commit: A.slice(0, 7) },
    { name: 'web-full', path: '../invoicer-web', commit: A },
    { name: 'web-head', path: '../invoicer-web' },
    { name: 'web-abs', path: w.web, commit: 'main' },
    { name: 'no-path', url: MOBILE_URL },
    { name: 'missing', url: MOBILE_URL, path: '../invoicer-mobile' },
    { name: 'not-git', path: '../plain' },
    { name: 'bad-branch', path: '../invoicer-web', commit: 'no-such-branch' },
    { name: 'bad-hash', path: '../invoicer-web', commit: '0000000' },
  ]);
  const out = await crossRepo(w.central);
  shared = { w, A, main, out, entry: (name) => out.repos.find((r) => r.name === name) };
  return shared;
}

const resolved = (name, path, commit, sha) => ({ name, path, url: null, commit, sha, unknown: null });

test('repos has one entry per outputs: entry, in config order', async () => {
  const { out } = await variants();
  assert.deepEqual(out.repos.map((r) => r.name),
    ['web-main', 'web-tag', 'web-short', 'web-full', 'web-head', 'web-abs', 'no-path', 'missing', 'not-git', 'bad-branch', 'bad-hash']);
});

test('a branch resolves to the full hash of its tip in the clone', async () => {
  const { entry, main } = await variants();
  assert.deepEqual(entry('web-main'), resolved('web-main', '../invoicer-web', 'main', main));
});

test('a tag resolves to the full hash of its commit', async () => {
  const { entry, A } = await variants();
  assert.deepEqual(entry('web-tag'), resolved('web-tag', '../invoicer-web', 'v1', A));
});

test('a short hash resolves to the full hash', async () => {
  const { entry, A } = await variants();
  assert.deepEqual(entry('web-short'), resolved('web-short', '../invoicer-web', A.slice(0, 7), A));
});

test('a short and a full hash of one commit resolve to the same sha', async () => {
  const { entry, A } = await variants();
  assert.deepEqual(entry('web-full'), resolved('web-full', '../invoicer-web', A, A));
  assert.equal(entry('web-short').sha, entry('web-full').sha);
});

test('with no commit: commit HEAD, resolved to the HEAD of the clone', async () => {
  const { entry, w } = await variants();
  assert.deepEqual(entry('web-head'), resolved('web-head', '../invoicer-web', 'HEAD', rev(w.web)));
});

test('an absolute path is read like a relative one', async () => {
  const { entry, w, main } = await variants();
  assert.deepEqual(entry('web-abs'), resolved('web-abs', w.web, 'main', main));
});

// An unknown entry: sha null, and the reason as text (its words are left open).
function assertUnknown(r, expect) {
  assert.ok(r, 'the entry is listed');
  const { unknown, ...rest } = r;
  assert.deepEqual(rest, expect);
  assert.equal(typeof unknown, 'string', JSON.stringify(r));
  assert.ok(unknown.length > 0, 'a reason is given');
}

test('an entry with no path is unknown: al never fetches the url', async () => {
  const { entry } = await variants();
  assertUnknown(entry('no-path'), { name: 'no-path', path: null, url: MOBILE_URL, commit: 'HEAD', sha: null });
});

test('a path that does not exist is unknown', async () => {
  const { entry } = await variants();
  assertUnknown(entry('missing'), { name: 'missing', path: '../invoicer-mobile', url: MOBILE_URL, commit: 'HEAD', sha: null });
});

test('a path that is not a git repository is unknown', async () => {
  const { entry } = await variants();
  assertUnknown(entry('not-git'), { name: 'not-git', path: '../plain', url: null, commit: 'HEAD', sha: null });
});

test('a branch that is not in the clone is unknown', async () => {
  const { entry } = await variants();
  assertUnknown(entry('bad-branch'), { name: 'bad-branch', path: '../invoicer-web', url: null, commit: 'no-such-branch', sha: null });
});

test('a short hash that is not in the clone is unknown', async () => {
  const { entry } = await variants();
  assertUnknown(entry('bad-hash'), { name: 'bad-hash', path: '../invoicer-web', url: null, commit: '0000000', sha: null });
});

test('with no outputs: in config, repos, links and results are empty lists', async (t) => {
  const dir = invoicer(t, 'clean');
  assert.deepEqual(await crossRepo(dir), { repos: [], links: [], results: [] });
});
