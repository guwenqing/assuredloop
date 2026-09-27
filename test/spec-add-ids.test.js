// `al spec --add-ids <file> --prefix <PREFIX> [--yes]`: numbers the headings
// that have no ID [SPC-2], one more than the highest ever used, never reusing
// one [SPC-3].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { makeRepo, cloneRepo, runAl } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';

const addIds = (cwd, file, ...rest) => runAl(cwd, ['spec', '--add-ids', file, '--prefix', 'INV', ...rest]);
const text = (repo, rel) => repo.read(rel).toString('utf8');

function assertWrote(repo, r, rel, expected) {
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(text(repo, rel), expected);
}

test('[SPC-3] numbering file B after file A holds INV-1..3 starts at INV-4, H1 included, in file order', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/a.md', '# [INV-1] A\n## [INV-2] x\n## [INV-3] y\n');
  repo.write('specs/b.md', '# B title\nIntro.\n## Dates\nd\n## Format\nf\n');
  repo.commit('two files');
  const r = addIds(repo.dir, 'specs/b.md', '--yes');
  assertWrote(repo, r, 'specs/b.md', '# [INV-4] B title\nIntro.\n## [INV-5] Dates\nd\n## [INV-6] Format\nf\n');
  for (const l of ['# [INV-4] B title', '## [INV-5] Dates', '## [INV-6] Format']) assert.ok(r.stdout.includes(l), `${l}:\n${r.stdout}`);
  assert.equal(text(repo, 'specs/a.md'), '# [INV-1] A\n## [INV-2] x\n## [INV-3] y\n');
  assertFrame(r.stdout);
});

test('[SPC-3] an ID in a root file that is only in the working tree, not committed, is not reused', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/b.md', '## Dates\nd\n');
  repo.commit('b');
  repo.write('specs/a.md', '## [INV-5] Uncommitted\n');
  assertWrote(repo, addIds(repo.dir, 'specs/b.md', '--yes'), 'specs/b.md', '## [INV-6] Dates\nd\n');
});

test('[SPC-3] an ID deleted from the root in history is not reused', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/old.md', '## [INV-7] Old\ngone later\n');
  repo.commit('INV-7 added');
  repo.git(['rm', '-q', 'specs/old.md']);
  repo.write('specs/b.md', '## [INV-2] Kept\n## New\n');
  repo.commit('INV-7 removed');
  assertWrote(repo, addIds(repo.dir, 'specs/b.md', '--yes'), 'specs/b.md', '## [INV-2] Kept\n## [INV-8] New\n');
});

test('[SPC-3] an ID that exists only on another branch is not reused', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/b.md', '## [INV-2] Kept\n## New\n');
  repo.commit('main');
  repo.git(['checkout', '-q', '-b', 'other']);
  repo.write('specs/c.md', '## [INV-12] Concurrent add\n');
  repo.commit('on other');
  repo.git(['checkout', '-q', 'main']);
  assertWrote(repo, addIds(repo.dir, 'specs/b.md', '--yes'), 'specs/b.md', '## [INV-2] Kept\n## [INV-13] New\n');
});

test('[SPC-3] an ID only in an open request\'s change.md in the working tree is not reused', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/b.md', '## New\n');
  repo.commit('b');
  repo.write('requests/totals/change.md',
    '# Totals\n\n## Spec changes\n\n### [INV-9]@1 add in specs/invoices.md   for R1\nNow:\n\n    ## [INV-9] Totals\n    Sum of lines.\n');
  assertWrote(repo, addIds(repo.dir, 'specs/b.md', '--yes'), 'specs/b.md', '## [INV-10] New\n');
});

test('[SPC-3] an ID only in an archived request\'s change.md is not reused', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/b.md', '## New\n');
  repo.write('requests/archive/old-req/change.md',
    '## Spec changes\n\n### [INV-15]@1 add in specs/invoices.md\nNow:\n\n    ## [INV-15] Retired\n');
  repo.commit('archived');
  assertWrote(repo, addIds(repo.dir, 'specs/b.md', '--yes'), 'specs/b.md', '## [INV-16] New\n');
});

test('[SPC-3] an ID only in a request\'s change.md that is gone from the working tree, only in history, is not reused', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/b.md', '## New\n');
  repo.write('requests/dropped/change.md', '### [INV-20]@1 add in specs/invoices.md\nNow:\n\n    ## [INV-20] Dropped\n');
  repo.commit('request');
  repo.git(['rm', '-q', '-r', 'requests/dropped']);
  repo.commit('request removed');
  assertWrote(repo, addIds(repo.dir, 'specs/b.md', '--yes'), 'specs/b.md', '## [INV-21] New\n');
});

test('[SPC-3] other prefixes do not count: [INVX-9] and [ABC-9] do not raise INV', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/a.md', '## [INVX-9] a\n## [ABC-9] b\n## [INV-2] c\n');
  repo.write('specs/b.md', '## New\n');
  repo.commit('prefixes');
  assertWrote(repo, addIds(repo.dir, 'specs/b.md', '--yes'), 'specs/b.md', '## [INV-3] New\n');
});

test('[SPC-3] a dotted ID counts by its first number: [INV-7.2] means the next is INV-8', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/a.md', '## [INV-3] Parent\n### [INV-7.2] Sub\n');
  repo.write('specs/b.md', '## New\n');
  repo.commit('dotted');
  assertWrote(repo, addIds(repo.dir, 'specs/b.md', '--yes'), 'specs/b.md', '## [INV-8] New\n');
  assert.equal(text(repo, 'specs/a.md'), '## [INV-3] Parent\n### [INV-7.2] Sub\n');
});

test('[SPC-3] with no ID of the prefix anywhere, numbering starts at 1', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/b.md', '# Title\n## Dates\n');
  repo.commit('fresh');
  assertWrote(repo, addIds(repo.dir, 'specs/b.md', '--yes'), 'specs/b.md', '# [INV-1] Title\n## [INV-2] Dates\n');
});

test('[SPC-2] only headings without an ID change: existing IDs, code-block # lines and every other byte stay as they were', (t) => {
  const repo = makeRepo(t);
  const before =
    'Preamble text.\n' +
    '\n' +
    '# Guide\n' +
    'Intro line with trailing spaces.   \n' +
    '## [INV-2] Kept\n' +
    'Body\twith a tab.\n' +
    '```md\n' +
    '## Not a heading in code\n' +
    '```\n' +
    '~~~\n' +
    '# Nor in tildes\n' +
    '~~~\n' +
    '\n' +
    '    # indented code, not a heading\n' +
    '\n' +
    '### Deep\n' +
    '#hashtag stays\n' +
    '   ## Indented heading\n' +
    '## Last\n' +
    'no final newline';
  const after = before
    .replace('# Guide\n', '# [INV-3] Guide\n')
    .replace('### Deep\n', '### [INV-4] Deep\n')
    .replace('   ## Indented heading\n', '   ## [INV-5] Indented heading\n')
    .replace('## Last\n', '## [INV-6] Last\n');
  repo.write('specs/guide.md', before);
  repo.commit('guide');
  assertWrote(repo, addIds(repo.dir, 'specs/guide.md', '--yes'), 'specs/guide.md', after);
});

test('[SPC-2] without --yes it prints what it would change and writes nothing; with --yes it writes', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/b.md', '## [INV-3] Old\n## Dates\nd\n');
  repo.commit('b');
  const dry = addIds(repo.dir, 'specs/b.md');
  assert.equal(dry.code, 0, dry.stdout + dry.stderr);
  assert.ok(dry.stdout.includes('## [INV-4] Dates'), dry.stdout);
  assert.equal(text(repo, 'specs/b.md'), '## [INV-3] Old\n## Dates\nd\n');
  assert.equal(repo.git(['status', '--porcelain']), '', 'nothing written');
  assertFrame(dry.stdout);

  const yes = addIds(repo.dir, 'specs/b.md', '--yes');
  assertWrote(repo, yes, 'specs/b.md', '## [INV-3] Old\n## [INV-4] Dates\nd\n');
  assert.ok(yes.stdout.includes('## [INV-4] Dates'), yes.stdout);
});

test('[SPC-2] the file path is relative to the current directory', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/b.md', '## Dates\n');
  repo.commit('b');
  assertWrote(repo, addIds(join(repo.dir, 'specs'), 'b.md', '--yes'), 'specs/b.md', '## [INV-1] Dates\n');
});

test('[SPC-2] when every heading already has an ID there is nothing to number: nothing written, exit 0', (t) => {
  const repo = makeRepo(t);
  const all = '# [INV-1] T\n## [INV-2] D\n```\n## in code\n```\n';
  repo.write('specs/b.md', all);
  repo.commit('b');
  for (const extra of [[], ['--yes']]) {
    const r = addIds(repo.dir, 'specs/b.md', ...extra);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.ok(!r.stdout.includes('[INV-3]'), r.stdout);
    assert.equal(text(repo, 'specs/b.md'), all);
    assert.equal(repo.git(['status', '--porcelain']), '', 'nothing written');
    assertFrame(r.stdout);
  }
});

test('[SPC-3] duplicate IDs in the root are reported "not ok" and it still numbers the file (exit 0)', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/a.md', '## [INV-2] One\n## [INV-2] Two\n');
  repo.write('specs/b.md', '## New\n');
  repo.commit('dup');
  const r = addIds(repo.dir, 'specs/b.md', '--yes');
  assertWrote(repo, r, 'specs/b.md', '## [INV-3] New\n');
  assert.ok(lines(r.stdout).some((l) => l.includes('not ok') && l.includes('INV-2') && l.includes('specs/a.md')),
    `a not ok line naming INV-2 and specs/a.md:\n${r.stdout}`);
});

test('[SPC-2] misuse exits 2 and writes nothing: missing or bad --prefix, a file outside the root or not .md, --at', (t) => {
  const repo = makeRepo(t);
  repo.write('.assuredloop', 'root: docs\n');
  repo.write('docs/b.md', '## Dates\n');
  repo.write('docs/notes.txt', '## Dates\n');
  repo.write('specs/c.md', '## Dates\n');
  repo.write('elsewhere.md', '## Dates\n');
  const head = repo.commit('files');
  const misuse = [
    ['spec', '--add-ids', 'docs/b.md', '--yes'],
    ['spec', '--add-ids', 'docs/b.md', '--prefix', 'inv', '--yes'],
    ['spec', '--add-ids', 'docs/b.md', '--prefix', 'INV-', '--yes'],
    ['spec', '--add-ids', 'docs/b.md', '--prefix', '9A', '--yes'],
    ['spec', '--add-ids', 'docs/b.md', '--prefix', '', '--yes'],
    ['spec', '--add-ids', 'specs/c.md', '--prefix', 'INV', '--yes'],
    ['spec', '--add-ids', 'elsewhere.md', '--prefix', 'INV', '--yes'],
    ['spec', '--add-ids', 'docs/notes.txt', '--prefix', 'INV', '--yes'],
    ['spec', '--add-ids', 'docs/b.md', '--prefix', 'INV', '--yes', '--at', head],
  ];
  for (const args of misuse) {
    const r = runAl(repo.dir, args);
    assert.equal(r.code, 2, `${args.join(' ')}:\n${r.stdout}${r.stderr}`);
    assert.equal(repo.git(['status', '--porcelain']), '', `${args.join(' ')} wrote something`);
  }
  // Contrast: the same file under the configured root, with a good prefix, is numbered.
  assertWrote(repo, addIds(repo.dir, 'docs/b.md', '--yes'), 'docs/b.md', '## [INV-1] Dates\n');
});

// main with an ID in history, and a branch `other`.
function source(t) {
  const repo = makeRepo(t);
  repo.write('specs/old.md', '## [INV-7] Old\n');
  repo.commit('INV-7', { date: '2026-09-20T10:00:00Z' });
  repo.git(['rm', '-q', 'specs/old.md']);
  repo.write('specs/b.md', '## New\n');
  repo.commit('INV-7 removed', { date: '2026-09-21T10:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'other']);
  repo.write('specs/c.md', '## [INV-12] On other\n');
  repo.commit('on other', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  return repo;
}

for (const [kind, opts] of [
  ['a shallow clone (--depth 1 --no-single-branch)', { depth: 1, singleBranch: false }],
  ['a single-branch clone that is not shallow', { singleBranch: true }],
]) {
  test(`[SPC-3] in ${kind}, --add-ids --yes writes nothing, says "history unavailable", suggests git fetch, exits 2`, (t) => {
    const clone = cloneRepo(t, source(t), opts);
    const r = addIds(clone.dir, 'specs/b.md', '--yes');
    assert.equal(r.code, 2, r.stdout + r.stderr);
    assert.ok(r.stdout.includes('history unavailable'), r.stdout);
    const ls = lines(r.stdout);
    assert.match(ls.at(-2), /^Next/, r.stdout);
    assert.match(ls.at(-2), /git fetch/, r.stdout);
    assert.match(ls.at(-1), /^Not known/, r.stdout);
    assert.equal(text(clone, 'specs/b.md'), '## New\n');
    assert.equal(clone.git(['status', '--porcelain']), '', 'nothing written');
  });
}

test('[SPC-3] a full clone allocates past IDs in main\'s history and on the remote\'s other branches', (t) => {
  const clone = cloneRepo(t, source(t));
  assert.equal(clone.git(['rev-parse', '--is-shallow-repository']), 'false');
  const r = addIds(clone.dir, 'specs/b.md', '--yes');
  assertWrote(clone, r, 'specs/b.md', '## [INV-13] New\n');
  assert.ok(!r.stdout.includes('history unavailable'), r.stdout);
});
