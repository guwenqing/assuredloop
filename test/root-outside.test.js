// [SPC-2] the tool never writes outside the repo, whatever the configured root:
// a root configured outside the repo, or a target path that leaves it, is exit 2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { makeRepo, runAl } from './helpers/fixture.js';
import { lines } from './helpers/output.js';

const OUTSIDE = '## Outside\n';

// A repo and, next to it, a real folder `outside/` holding x.md.
function repoWithSibling(t) {
  const repo = makeRepo(t);
  const outsideFile = join(dirname(repo.dir), 'outside', 'x.md');
  mkdirSync(dirname(outsideFile));
  writeFileSync(outsideFile, OUTSIDE);
  return { repo, outsideFile };
}

function assertRefused(repo, r, outsideFile) {
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.equal(readFileSync(outsideFile, 'utf8'), OUTSIDE, 'the file outside the repo must stay byte-identical');
  assert.equal(repo.git(['status', '--porcelain']), '', 'nothing written in the repo');
  const ls = lines(r.stdout);
  assert.match(ls.at(-2) ?? '', /^Next/, r.stdout);
  assert.match(ls.at(-1) ?? '', /^Not known/, r.stdout);
}

test('[SPC-2] a root configured outside the repo (root: ../outside) is refused: --add-ids exits 2 and the sibling file is unchanged, with or without --yes', (t) => {
  const { repo, outsideFile } = repoWithSibling(t);
  repo.write('.assuredloop', 'root: ../outside\n');
  repo.commit('root outside the repo');
  for (const extra of [[], ['--yes']]) {
    assertRefused(repo, runAl(repo.dir, ['spec', '--add-ids', '../outside/x.md', '--prefix', 'INV', ...extra]), outsideFile);
  }
});

test('[SPC-2] with the default root, a target path that leaves the repo (../outside/x.md) is refused, with or without --yes', (t) => {
  const { repo, outsideFile } = repoWithSibling(t);
  repo.write('specs/real.md', '## Real\n');
  repo.commit('default root');
  for (const extra of [[], ['--yes']]) {
    assertRefused(repo, runAl(repo.dir, ['spec', '--add-ids', '../outside/x.md', '--prefix', 'INV', ...extra]), outsideFile);
  }
  // Contrast: a file under the default root is numbered.
  const ok = runAl(repo.dir, ['spec', '--add-ids', 'specs/real.md', '--prefix', 'INV', '--yes']);
  assert.equal(ok.code, 0, ok.stdout + ok.stderr);
  assert.equal(repo.read('specs/real.md').toString('utf8'), '## [INV-1] Real\n');
});

test('[SPC-2] contrast: a configured root inside the repo (root: docs/spec) still numbers, and the sibling file is untouched', (t) => {
  const { repo, outsideFile } = repoWithSibling(t);
  repo.write('.assuredloop', 'root: docs/spec\n');
  repo.write('docs/spec/x.md', '## Inside\n');
  repo.commit('root inside the repo');
  const r = runAl(repo.dir, ['spec', '--add-ids', 'docs/spec/x.md', '--prefix', 'INV', '--yes']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(repo.read('docs/spec/x.md').toString('utf8'), '## [INV-1] Inside\n');
  assert.equal(readFileSync(outsideFile, 'utf8'), OUTSIDE);
});
