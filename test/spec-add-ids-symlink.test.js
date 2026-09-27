// [SPC-2] `al spec --add-ids` writes only a regular file that really lies under
// the baseline root: a file reached through a symlink is misuse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symlinkSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, tempDir, runAl } from './helpers/fixture.js';
import { lines } from './helpers/output.js';

const OUTSIDE = '# Outside title\n## Dates\nd\n';

function assertRefused(repo, r, outsidePath) {
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.equal(readFileSync(outsidePath, 'utf8'), OUTSIDE, 'the file outside the repo must stay byte-identical');
  assert.equal(repo.git(['status', '--porcelain']), '', 'nothing written in the repo');
  const ls = lines(r.stdout);
  assert.ok(ls.length >= 2, r.stdout);
  assert.match(ls.at(-2), /^Next/, r.stdout);
  assert.match(ls.at(-1), /^Not known/, r.stdout);
}

test('[SPC-2] --add-ids on a committed symlink under the root to a .md file outside the repo exits 2 and writes nothing, with or without --yes', (t) => {
  const outside = join(tempDir(t), 'outside.md');
  writeFileSync(outside, OUTSIDE);
  const repo = makeRepo(t);
  repo.write('specs/real.md', '## Real\n');
  symlinkSync(outside,join(repo.dir, 'specs', 'link.md'));
  repo.commit('symlinked file');
  assert.equal(repo.git(['ls-files', '-s', 'specs/link.md']).split(' ')[0], '120000', 'the fixture commits a symlink');

  for (const extra of [[], ['--yes']]) {
    assertRefused(repo, runAl(repo.dir, ['spec', '--add-ids', 'specs/link.md', '--prefix', 'INV', ...extra]), outside);
  }

  // Contrast: a regular file under the root in the same repo is numbered.
  const ok = runAl(repo.dir, ['spec', '--add-ids', 'specs/real.md', '--prefix', 'INV', '--yes']);
  assert.equal(ok.code, 0, ok.stdout + ok.stderr);
  assert.equal(repo.read('specs/real.md').toString('utf8'), '## [INV-1] Real\n');
});

test('[SPC-2] --add-ids on a file reached through a symlinked directory under the root exits 2 and writes nothing, with or without --yes', (t) => {
  const outDir = join(tempDir(t), 'outside-dir');
  mkdirSync(outDir);
  const outside = join(outDir, 'x.md');
  writeFileSync(outside, OUTSIDE);
  const repo = makeRepo(t);
  repo.write('specs/real.md', '## Real\n');
  symlinkSync(outDir, join(repo.dir, 'specs', 'sub'));
  repo.commit('symlinked dir');
  assert.equal(repo.git(['ls-files', '-s', 'specs/sub']).split(' ')[0], '120000', 'the fixture commits a symlink');

  for (const extra of [[], ['--yes']]) {
    assertRefused(repo, runAl(repo.dir, ['spec', '--add-ids', 'specs/sub/x.md', '--prefix', 'INV', ...extra]), outside);
  }

  // Contrast: a regular file under the root in the same repo is numbered.
  const ok = runAl(repo.dir, ['spec', '--add-ids', 'specs/real.md', '--prefix', 'INV', '--yes']);
  assert.equal(ok.code, 0, ok.stdout + ok.stderr);
  assert.equal(repo.read('specs/real.md').toString('utf8'), '## [INV-1] Real\n');
});
