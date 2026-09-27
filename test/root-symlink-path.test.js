// [SPC-1][VW-8] no part of the root's path may be a symlink, wherever it points
// and whether or not the rest of the path exists; the working tree and `--at`
// refuse it alike.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { makeRepo, runAl } from './helpers/fixture.js';
import { lines } from './helpers/output.js';

const VIEWS = [['spec'], ['spec', '--list'], ['spec', '--at', 'HEAD'], ['spec', '--list', '--at', 'HEAD']];

function assertRefused(r, root, absent) {
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.ok(r.stdout.includes('root must be inside this repo'), r.stdout);
  assert.ok(r.stdout.includes(root), `should name the configured root ${root}:\n${r.stdout}`);
  for (const s of absent) assert.ok(!r.stdout.includes(s), `should not show ${s}:\n${r.stdout}`);
  const ls = lines(r.stdout);
  assert.match(ls.at(-2) ?? '', /^Next/, r.stdout);
  assert.match(ls.at(-1) ?? '', /^Not known/, r.stdout);
}

test('[SPC-1][VW-8] root: link/missing, through a committed symlink to an outside folder with the tail absent, is refused in all four views', (t) => {
  const repo = makeRepo(t);
  const outsideDir = join(dirname(repo.dir), 'outside');
  mkdirSync(outsideDir);
  writeFileSync(join(outsideDir, 'outside-notes.md'), '## Outside heading\nThe outside body sentence.\n');
  symlinkSync(outsideDir, join(repo.dir, 'link'));
  repo.write('.assuredloop', 'root: link/missing\n');
  repo.commit('root through a symlink, tail missing');
  assert.equal(repo.git(['ls-files', '-s', 'link']).split(' ')[0], '120000', 'the fixture commits a symlink');
  for (const args of VIEWS) {
    assertRefused(runAl(repo.dir, args), 'link/missing', ['no baseline yet', 'The outside body sentence.']);
  }
  assert.equal(repo.git(['status', '--porcelain']), '', 'nothing written');
});

test('[SPC-1][VW-8] root: alias, a committed symlink to docs/spec inside the repo, is refused in all four views', (t) => {
  const repo = makeRepo(t);
  repo.write('docs/spec/x.md', '## [DOC-1] Docs heading\nThe docs body sentence.\n');
  symlinkSync('docs/spec', join(repo.dir, 'alias'));
  repo.write('.assuredloop', 'root: alias\n');
  repo.commit('root is a symlink inside the repo');
  assert.equal(repo.git(['ls-files', '-s', 'alias']).split(' ')[0], '120000', 'the fixture commits a symlink');
  for (const args of VIEWS) {
    assertRefused(runAl(repo.dir, args), 'alias', ['The docs body sentence.', 'DOC-1', 'no baseline yet']);
  }
  assert.equal(repo.git(['status', '--porcelain']), '', 'nothing written');
});

test('[SPC-1][VW-8] contrast: root: docs/spec/missing, a real path whose last folder is absent, is "no baseline yet" with exit 0 in all four views', (t) => {
  const repo = makeRepo(t);
  repo.write('docs/spec/x.md', '## [DOC-1] Docs heading\nThe docs body sentence.\n');
  repo.write('.assuredloop', 'root: docs/spec/missing\n');
  repo.commit('root with its last folder absent');
  for (const args of VIEWS) {
    const r = runAl(repo.dir, args);
    assert.equal(r.code, 0, `${args.join(' ')}:\n${r.stdout}${r.stderr}`);
    assert.ok(r.stdout.includes('no baseline yet'), `${args.join(' ')}:\n${r.stdout}`);
    assert.ok(!r.stdout.includes('root must be inside this repo'), `${args.join(' ')}:\n${r.stdout}`);
  }
});
