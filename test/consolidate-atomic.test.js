// [STA-4] consolidate writes atomically (the architect's ruling 5): a write
// that fails partway leaves the whole baseline as it was, with no temporary
// file left behind, and a write never goes through something already sitting
// at its temporary name. The temporary name is `.<file>.al-<pid>` beside each
// target. Two tests call consolidate in-process, so that `process.pid` is the
// pid it uses and a rename can be made to fail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { makeRepo, tempDir, runAl } from './helpers/fixture.js';
import { block } from './helpers/change.js';
import { ENV, addRequest, both } from './helpers/request.js';

const A0 = '## [INV-1] Totals\nTotals show two decimals.\n';
const A1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const B = '## [INV-2] Format\nThe export format is CSV.\n';
const NEW = '## [INV-8] Export page\nThe invoice page MUST offer the export.\n';

// A committed repo: specs/a.md holding A0 and B, the signed request `inv`
// holding `blocks`; `before(repo)` runs just before the commit.
function setup(t, blocks, before) {
  const repo = makeRepo(t);
  repo.write('specs/a.md', `${A0}\n${B}`);
  addRequest(repo, 'inv', blocks);
  if (before) before(repo);
  repo.commit('setup');
  return repo;
}
const MODIFY = block('[INV-1]@1 modify', { was: A0, now: A1 });
const read = (repo, rel) => readFileSync(join(repo.dir, rel), 'utf8');
const clean = (repo) => assert.equal(repo.git(['status', '--porcelain']), '', 'the working tree should be as committed');
// Every `.<name>.al-<pid>` under specs/, at any depth.
const temps = (repo) => readdirSync(join(repo.dir, 'specs'), { recursive: true }).filter((f) => /(^|\/)\.[^/]*\.al-\d+$/.test(f));

async function inProcess(repo) {
  const { consolidate } = await import('../src/consolidate.js');
  return consolidate({ top: repo.dir, cwd: repo.dir, args: ['inv'], opts: { yes: true } });
}
// What the call threw (null when it returned), so the files can be checked first.
async function thrown(repo) {
  try { await inProcess(repo); return null; } catch (e) { return e; }
}
async function assertFail(e) {
  const { Fail } = await import('../src/git.js');
  assert.ok(e instanceof Fail, `consolidate should throw a Fail (exit 2); it ${e ? `threw ${e.name}: ${e.message}` : 'returned'}`);
}

test('[STA-4] a write never goes through a symlink already at its temporary name: consolidate fails, the outside file and specs/a.md are unchanged, the link is left; without it, the Now is written', async (t) => {
  const outside = join(tempDir(t), 'outside.md');
  writeFileSync(outside, '## Outside\nNot ours.\n');
  const repo = setup(t, [MODIFY]);
  const link = join(repo.dir, 'specs', `.a.md.al-${process.pid}`);
  symlinkSync(outside, link);

  const e = await thrown(repo);
  assert.equal(readFileSync(outside, 'utf8'), '## Outside\nNot ours.\n', 'the file outside the repo must stay byte-identical');
  assert.equal(read(repo, 'specs/a.md'), `${A0}\n${B}`);
  assert.ok(lstatSync(join(repo.dir, 'specs/a.md')).isFile() && !lstatSync(join(repo.dir, 'specs/a.md')).isSymbolicLink(), 'specs/a.md stays a regular file');
  assert.ok(lstatSync(link).isSymbolicLink() && readlinkSync(link) === outside, 'the planted symlink is left as it was');
  await assertFail(e);

  // The contrast: with nothing at the temporary name, the same call writes.
  rmSync(link);
  await inProcess(repo);
  assert.equal(read(repo, 'specs/a.md'), `${A1}\n${B}`);
  assert.deepEqual(temps(repo), []);
});

test('[STA-4] a consolidation that fails on its second file (add in a path that is a folder) exits 2 and leaves the first file as it was, with no temporary file; without the folder both are written', (t) => {
  const blocks = [MODIFY, block('[INV-8]@1 add in specs/z.md', { now: NEW })];
  const repo = setup(t, blocks, (r) => r.write('specs/z.md/keep.txt', 'a folder named z.md\n'));
  const r = runAl(repo.dir, ['consolidate', 'inv', '--yes'], { env: ENV });
  assert.equal(r.code, 2, both(r));
  assert.equal(read(repo, 'specs/a.md'), `${A0}\n${B}`, 'specs/a.md is byte-identical');
  assert.deepEqual(temps(repo), [], 'no temporary file is left');
  clean(repo);

  // The contrast: without the folder, both files are written.
  const plain = setup(t, blocks);
  const ok = runAl(plain.dir, ['consolidate', 'inv', '--yes'], { env: ENV });
  assert.equal(ok.code, 0, both(ok));
  assert.equal(read(plain, 'specs/a.md'), `${A1}\n${B}`);
  assert.equal(read(plain, 'specs/z.md'), NEW);
});

test('[STA-4] a rename that fails partway (the second one, EIO): consolidate fails, every baseline file is byte-identical, the new file does not exist, no temporary file is left; unpatched, both are written', async (t) => {
  const blocks = [MODIFY, block('[INV-8]@1 add in specs/new.md', { now: NEW })];
  const repo = setup(t, blocks, (r) => r.write('specs/b.md', B.replace('INV-2', 'INV-9')));
  const before = { 'specs/a.md': read(repo, 'specs/a.md'), 'specs/b.md': read(repo, 'specs/b.md') };

  // node:fs as CommonJS sees it, so the patch reaches the ESM named exports too.
  const fs = createRequire(import.meta.url)('node:fs');
  const real = fs.renameSync;
  let calls = 0;
  fs.renameSync = function renameSync(...args) {
    calls += 1;
    if (calls === 2) throw Object.assign(new Error('EIO: i/o error, rename'), { code: 'EIO', errno: -5, syscall: 'rename' });
    return real.apply(this, args);
  };
  syncBuiltinESMExports();
  const restore = () => { fs.renameSync = real; syncBuiltinESMExports(); };
  t.after(restore);
  let e;
  try {
    e = await thrown(repo);
  } finally {
    restore();
  }
  assert.ok(calls >= 2, `the fixture: consolidate should rename each of its two files into place (renames seen: ${calls})`);
  for (const [rel, bytes] of Object.entries(before)) assert.equal(read(repo, rel), bytes, `${rel} is byte-identical`);
  assert.ok(!existsSync(join(repo.dir, 'specs/new.md')), 'the new file does not exist');
  assert.deepEqual(temps(repo), [], 'no temporary file is left');
  clean(repo);
  await assertFail(e);

  // The contrast: with renames working, the same call writes both.
  await inProcess(repo);
  assert.equal(read(repo, 'specs/a.md'), `${A1}\n${B}`);
  assert.equal(read(repo, 'specs/new.md'), NEW);
});
