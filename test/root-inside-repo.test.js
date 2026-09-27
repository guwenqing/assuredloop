// [SPC-1] the baseline is on main, so its root lies inside this repo once every
// symlink is resolved. A root outside it: every command that uses the root reads
// nothing, writes nothing and exits 2, naming the root; `--at` reads the same rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { makeRepo, runAl } from './helpers/fixture.js';
import { lines } from './helpers/output.js';

const OUTSIDE = '## Outside heading\nThe outside body sentence.\n';
const OUTSIDE_NAME = 'outside-notes.md';

// A repo and, next to it, a real folder `outside/` holding outside-notes.md.
function repoWithSibling(t) {
  const repo = makeRepo(t);
  const outsideDir = join(dirname(repo.dir), 'outside');
  mkdirSync(outsideDir);
  const outsideFile = join(outsideDir, OUTSIDE_NAME);
  writeFileSync(outsideFile, OUTSIDE);
  repo.write('specs/in.md', '## [IN-1] Inside\nThe inside body sentence.\n');
  return { repo, outsideDir, outsideFile };
}

function assertRootRefused(repo, r, root, outsideFile) {
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.ok(r.stdout.includes('root must be inside this repo'), r.stdout);
  assert.ok(r.stdout.includes(root), `should name the configured root ${root}:\n${r.stdout}`);
  assert.ok(!r.stdout.includes('The outside body sentence.'), `read the outside file:\n${r.stdout}`);
  assert.ok(!r.stdout.includes(OUTSIDE_NAME), `named the outside file:\n${r.stdout}`);
  assert.equal(readFileSync(outsideFile, 'utf8'), OUTSIDE, 'the outside file must stay byte-identical');
  assert.equal(repo.git(['status', '--porcelain']), '', 'nothing written in the repo');
  const ls = lines(r.stdout);
  assert.match(ls.at(-2) ?? '', /^Next/, r.stdout);
  assert.match(ls.at(-1) ?? '', /^Not known/, r.stdout);
}

function assertAddIdsRefused(repo, r, outsideFile) {
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.equal(readFileSync(outsideFile, 'utf8'), OUTSIDE, 'the outside file must stay byte-identical');
  assert.equal(repo.git(['status', '--porcelain']), '', 'nothing written in the repo');
  const ls = lines(r.stdout);
  assert.match(ls.at(-2) ?? '', /^Next/, r.stdout);
  assert.match(ls.at(-1) ?? '', /^Not known/, r.stdout);
}

// Each way of configuring a root that resolves outside the repo.
const OUTSIDE_ROOTS = [
  ['root: ../outside', () => '../outside', () => {}],
  ['root: link, a committed symlink to the sibling folder', () => 'link',
    (repo, outsideDir) => symlinkSync(outsideDir, join(repo.dir, 'link'))],
  ['root: an absolute path to the sibling folder', (outsideDir) => outsideDir, () => {}],
];

for (const [kind, rootOf, setup] of OUTSIDE_ROOTS) {
  test(`[SPC-1] ${kind}: al spec and al spec --list exit 2, say "root must be inside this repo", name the root, and read nothing outside`, (t) => {
    const { repo, outsideDir, outsideFile } = repoWithSibling(t);
    const root = rootOf(outsideDir);
    setup(repo, outsideDir);
    repo.write('.assuredloop', `root: ${root}\n`);
    repo.commit('root outside the repo');
    for (const args of [['spec'], ['spec', '--list']]) {
      assertRootRefused(repo, runAl(repo.dir, args), root, outsideFile);
    }
  });

  test(`[SPC-1] ${kind}: al spec --add-ids on the outside file exits 2 and it stays byte-identical, with or without --yes`, (t) => {
    const { repo, outsideDir, outsideFile } = repoWithSibling(t);
    const root = rootOf(outsideDir);
    setup(repo, outsideDir);
    repo.write('.assuredloop', `root: ${root}\n`);
    repo.commit('root outside the repo');
    const target = root === 'link' ? `link/${OUTSIDE_NAME}` : `../outside/${OUTSIDE_NAME}`;
    for (const extra of [[], ['--yes']]) {
      const r = runAl(repo.dir, ['spec', '--add-ids', target, '--prefix', 'INV', ...extra]);
      assertAddIdsRefused(repo, r, outsideFile);
      assert.ok(r.stdout.includes('root must be inside this repo'), r.stdout);
      assert.ok(r.stdout.includes(root), `should name the configured root ${root}:\n${r.stdout}`);
    }
  });
}

test('[SPC-1][VW-8] spec --at a commit whose .assuredloop says root: ../outside exits 2 and names the root; the working tree with a normal root works', (t) => {
  const { repo, outsideFile } = repoWithSibling(t);
  repo.write('.assuredloop', 'root: ../outside\n');
  const c1 = repo.commit('root outside the repo', { date: '2026-09-20T10:00:00Z' });
  repo.git(['rm', '-q', '.assuredloop']);
  repo.commit('back to the default root', { date: '2026-09-21T10:00:00Z' });

  for (const args of [['spec', '--at', c1], ['spec', '--list', '--at', c1]]) {
    assertRootRefused(repo, runAl(repo.dir, args), '../outside', outsideFile);
  }

  // Contrast: the working tree reads specs/ inside the repo.
  const now = runAl(repo.dir, ['spec']);
  assert.equal(now.code, 0, now.stdout + now.stderr);
  assert.ok(now.stdout.includes('The inside body sentence.'), now.stdout);
  assert.ok(!now.stdout.includes('root must be inside this repo'), now.stdout);
});

test('[SPC-1] contrast: root: docs/spec, a real folder in the repo, works for spec, --list and --add-ids', (t) => {
  const { repo, outsideFile } = repoWithSibling(t);
  repo.write('.assuredloop', 'root: docs/spec\n');
  repo.write('docs/spec/x.md', '## Docs heading\nThe docs body sentence.\n');
  repo.commit('root inside the repo');

  const spec = runAl(repo.dir, ['spec']);
  assert.equal(spec.code, 0, spec.stdout + spec.stderr);
  assert.ok(spec.stdout.includes('The docs body sentence.'), spec.stdout);
  assert.ok(!spec.stdout.includes('root must be inside this repo'), spec.stdout);

  const list = runAl(repo.dir, ['spec', '--list']);
  assert.equal(list.code, 0, list.stdout + list.stderr);
  assert.ok(list.stdout.includes('Docs heading'), list.stdout);

  const add = runAl(repo.dir, ['spec', '--add-ids', 'docs/spec/x.md', '--prefix', 'INV', '--yes']);
  assert.equal(add.code, 0, add.stdout + add.stderr);
  assert.equal(repo.read('docs/spec/x.md').toString('utf8'), '## [INV-1] Docs heading\nThe docs body sentence.\n');
  assert.equal(readFileSync(outsideFile, 'utf8'), OUTSIDE);
});

test('[SPC-1] contrast: the default specs/ with no .assuredloop works', (t) => {
  const { repo } = repoWithSibling(t);
  repo.commit('default root');
  const r = runAl(repo.dir, ['spec']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.ok(r.stdout.includes('The inside body sentence.'), r.stdout);
  assert.ok(!r.stdout.includes('root must be inside this repo'), r.stdout);
});
