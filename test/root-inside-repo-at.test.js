// [SPC-1][VW-8] the working tree and `--at` agree on where the root may be: a
// root that is a symlink in that commit's tree (any part of its path), or the
// repo top itself (`.`), is refused in both views.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { makeRepo, runAl } from './helpers/fixture.js';
import { lines } from './helpers/output.js';

const OUTSIDE = '## Outside heading\nThe outside body sentence.\n';
const OUTSIDE_NAME = 'outside-notes.md';

// A repo and, next to it, a real folder `outside/` holding outside-notes.md and sub/outside-notes.md.
function repoWithSibling(t) {
  const repo = makeRepo(t);
  const outsideDir = join(dirname(repo.dir), 'outside');
  mkdirSync(join(outsideDir, 'sub'), { recursive: true });
  writeFileSync(join(outsideDir, OUTSIDE_NAME), OUTSIDE);
  writeFileSync(join(outsideDir, 'sub', OUTSIDE_NAME), OUTSIDE);
  return { repo, outsideDir };
}

function assertRefused(r, { root, absent = [] } = {}) {
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.ok(r.stdout.includes('root must be inside this repo'), r.stdout);
  if (root) assert.ok(r.stdout.includes(root), `should name the configured root ${root}:\n${r.stdout}`);
  for (const s of absent) assert.ok(!r.stdout.includes(s), `should not show ${s}:\n${r.stdout}`);
  const ls = lines(r.stdout);
  assert.match(ls.at(-2) ?? '', /^Next/, r.stdout);
  assert.match(ls.at(-1) ?? '', /^Not known/, r.stdout);
}

const VIEWS = (at) => [['spec'], ['spec', '--list'], ['spec', '--at', at], ['spec', '--list', '--at', at]];

for (const [kind, root, linkAt] of [
  ['root: link, a committed symlink to an outside folder', 'link', 'link'],
  ['root: link/sub, a path through a committed symlink to an outside folder', 'link/sub', 'link'],
]) {
  test(`[SPC-1][VW-8] ${kind}: spec and --list refuse it in the working tree and --at HEAD alike`, (t) => {
    const { repo, outsideDir } = repoWithSibling(t);
    symlinkSync(outsideDir, join(repo.dir, linkAt));
    repo.write('.assuredloop', `root: ${root}\n`);
    repo.commit('root through a symlink');
    assert.equal(repo.git(['ls-files', '-s', linkAt]).split(' ')[0], '120000', 'the fixture commits a symlink');
    for (const args of VIEWS('HEAD')) {
      assertRefused(runAl(repo.dir, args), { root, absent: ['The outside body sentence.', OUTSIDE_NAME, 'no baseline yet'] });
    }
    assert.equal(repo.git(['status', '--porcelain']), '', 'nothing written');
  });
}

test('[SPC-1][VW-8] spec --at an older commit whose tree has root: link as a symlink is refused, though the working tree no longer has the link', (t) => {
  const { repo, outsideDir } = repoWithSibling(t);
  symlinkSync(outsideDir, join(repo.dir, 'link'));
  repo.write('.assuredloop', 'root: link\n');
  const c1 = repo.commit('root through a symlink', { date: '2026-09-20T10:00:00Z' });
  repo.git(['rm', '-q', 'link', '.assuredloop']);
  repo.write('specs/in.md', '## [IN-1] Inside\nThe inside body sentence.\n');
  repo.commit('default root', { date: '2026-09-21T10:00:00Z' });
  for (const args of [['spec', '--at', c1], ['spec', '--list', '--at', c1]]) {
    assertRefused(runAl(repo.dir, args), { root: 'link', absent: ['no baseline yet', 'The outside body sentence.'] });
  }
  // Contrast: the working tree reads specs/.
  const now = runAl(repo.dir, ['spec']);
  assert.equal(now.code, 0, now.stdout + now.stderr);
  assert.ok(now.stdout.includes('The inside body sentence.'), now.stdout);
});

for (const root of ['.', './']) {
  test(`[SPC-1][VW-8] root: ${root} (the repo top itself) is refused by spec and --list, in the working tree and --at HEAD alike`, (t) => {
    const repo = makeRepo(t);
    repo.write('.assuredloop', `root: ${root}\n`);
    repo.write('notes.md', '## Top notes\nThe top-level body sentence.\n');
    repo.write('specs/in.md', '## [IN-1] Inside\nThe inside body sentence.\n');
    repo.commit('root at the repo top');
    for (const args of VIEWS('HEAD')) {
      assertRefused(runAl(repo.dir, args), {
        absent: ['The top-level body sentence.', 'Top notes', 'notes.md', 'The inside body sentence.', 'IN-1'],
      });
    }
    assert.equal(repo.git(['status', '--porcelain']), '', 'nothing written');
  });
}

test('[SPC-1] root: . is refused by --add-ids too, and the file stays unchanged', (t) => {
  const repo = makeRepo(t);
  repo.write('.assuredloop', 'root: .\n');
  repo.write('notes.md', '## Top notes\n');
  repo.commit('root at the repo top');
  for (const extra of [[], ['--yes']]) {
    assertRefused(runAl(repo.dir, ['spec', '--add-ids', 'notes.md', '--prefix', 'INV', ...extra]));
    assert.equal(repo.read('notes.md').toString('utf8'), '## Top notes\n');
    assert.equal(repo.git(['status', '--porcelain']), '', 'nothing written');
  }
});

test('[SPC-1][VW-8] contrast: a committed root: docs/spec works with --at HEAD and --list --at HEAD', (t) => {
  const repo = makeRepo(t);
  repo.write('.assuredloop', 'root: docs/spec\n');
  repo.write('docs/spec/x.md', '## [DOC-1] Docs heading\nThe docs body sentence.\n');
  repo.commit('root inside the repo');
  const at = runAl(repo.dir, ['spec', '--at', 'HEAD']);
  assert.equal(at.code, 0, at.stdout + at.stderr);
  assert.ok(at.stdout.includes('The docs body sentence.'), at.stdout);
  assert.ok(!at.stdout.includes('root must be inside this repo'), at.stdout);
  const list = runAl(repo.dir, ['spec', '--list', '--at', 'HEAD']);
  assert.equal(list.code, 0, list.stdout + list.stderr);
  assert.ok(list.stdout.includes('DOC-1') && list.stdout.includes('Docs heading'), list.stdout);
});
