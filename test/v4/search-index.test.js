// The search index (#181, T13; design.md 11, "A rebuild compares paragraph
// hashes with an index manifest ..."; interface.md "The index"): where it is,
// the current and the history index, the refresh, and --rebuild.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { commitAll, doc, git, write } from './helpers/project.js';
import { A_TEXT, SMALL_SPEC, indexFile, key, search, smallRepo } from './helpers/search.js';

const idRoles = (out) => out.hits.map((h) => `${h.id} v${h.version} ${h.role}`);
const has = (out, want) => assert.ok(idRoles(out).includes(want), `${want} in:\n${idRoles(out).join('\n')}`);
const lacks = (out, id) => assert.ok(!out.hits.some((h) => h.id === id), `${id} is not a hit:\n${idRoles(out).join('\n')}`);
const WITHOUT_EXP5 = SMALL_SPEC.replace(`<!-- EXP-5 rationale explains:EXP-4 -->\n\n${A_TEXT.exp5}\n`, '').replace(/\n+$/, '\n');

test('level 1 keeps one index file in the git dir; nothing in the working tree', (t) => {
  const { dir } = smallRepo(t);
  const before = git(dir, 'status', '--porcelain', '--ignored');
  search(dir, ['export', 'link'], { level: 1 });
  assert.ok(existsSync(indexFile(dir)), `the index is at ${indexFile(dir)}`);
  assert.match(indexFile(dir), /\/\.git\/assuredloop\/search\.sqlite$/, 'in a plain clone, .git/assuredloop/search.sqlite');
  assert.equal(git(dir, 'status', '--porcelain', '--ignored'), before, 'nothing new in the working tree, not even an ignored file');
});

test('level 0 builds no index', (t) => {
  const { dir } = smallRepo(t);
  const out = search(dir, ['export', 'link'], { level: 0 });
  assert.equal(out.level, 0);
  has(out, 'EXP-4 v1 baseline');
  assert.ok(!existsSync(indexFile(dir)), 'no index file at level 0');
});

for (const level of [1, 2]) {
  const embedder = level === 2 ? {} : null;

  test(`level ${level}: a commit that removes a paragraph removes it from the current index; the history index keeps it`, (t) => {
    const { dir, A } = smallRepo(t, { embedder });
    const first = search(dir, ['forwarded'], { level });
    assert.equal(first.level, level);
    has(first, 'EXP-5 v1 baseline');
    write(dir, 'specs/exports.md', WITHOUT_EXP5);
    const B = commitAll(dir, 'B: EXP-5 removed');
    const now = search(dir, ['forwarded'], { level });
    assert.equal(now.commit, B, 'the index was brought to the new HEAD');
    lacks(now, 'EXP-5');
    has(search(dir, ['export', 'link'], { level }), 'EXP-4 v1 baseline');
    const hist = search(dir, ['forwarded', '--history'], { level });
    has(hist, 'EXP-5 v1 history');
    const row = hist.hits.find((h) => h.id === 'EXP-5');
    assert.equal(row.valid_from, A);
    assert.equal(row.superseded_by, B);
    assert.equal(row.commit, A);
  });

  test(`level ${level}: a changed paragraph: the new text is current, the old one is history only`, (t) => {
    const { dir } = smallRepo(t, { embedder });
    has(search(dir, ['forwarded'], { level }), 'EXP-5 v1 baseline');
    write(dir, 'specs/exports.md', SMALL_SPEC.replace(A_TEXT.exp5, 'Thirty minutes is enough, and a shared copy soon stops working.'));
    commitAll(dir, 'B: EXP-5 changed');
    const now = search(dir, ['forwarded'], { level });
    assert.ok(!now.hits.some((h) => h.id === 'EXP-5' && h.version === 1), idRoles(now).join('\n'));
    has(search(dir, ['shared', 'copy'], { level }), 'EXP-5 v2 baseline');
    has(search(dir, ['forwarded', '--history'], { level }), 'EXP-5 v1 history');
  });

  test(`level ${level}: the index follows HEAD back after a reset, and --at selects an older commit`, (t) => {
    const { dir, A } = smallRepo(t, { embedder });
    write(dir, 'specs/exports.md', WITHOUT_EXP5);
    commitAll(dir, 'B: EXP-5 removed');
    lacks(search(dir, ['forwarded'], { level }), 'EXP-5');
    const atA = search(dir, ['forwarded', '--at', A], { level });
    assert.equal(atA.commit, A);
    has(atA, 'EXP-5 v1 baseline');
    lacks(search(dir, ['forwarded'], { level }), 'EXP-5');
    git(dir, 'reset', '-q', '--hard', A);
    const back = search(dir, ['forwarded'], { level });
    assert.equal(back.commit, A);
    has(back, 'EXP-5 v1 baseline');
  });

  test(`level ${level}: --rebuild gives the same answer as the refreshed index`, (t) => {
    const { dir } = smallRepo(t, { embedder });
    write(dir, 'specs/exports.md', WITHOUT_EXP5);
    commitAll(dir, 'B');
    const q = ['export', 'link', '--change', 'links', '--history', '--limit', '50'];
    const keys = (out) => out.hits.map((h) => `${key(h)} ${h.role}`).sort();
    const refreshed = search(dir, q, { level });
    const rebuilt = search(dir, [...q, '--rebuild'], { level });
    assert.equal(rebuilt.level, level);
    assert.deepEqual(keys(rebuilt), keys(refreshed));
    assert.ok(existsSync(indexFile(dir)));
  });

  test(`level ${level}: a new spec doc in a later commit is indexed by the refresh`, (t) => {
    const { dir } = smallRepo(t, { embedder });
    search(dir, ['export', 'link'], { level });
    write(dir, '.assuredloop/config.yaml', 'repo: acme\ndocs:\n  - {file: specs/exports.md, prefix: EXP}\n  - {file: specs/billing.md, prefix: BIL}\n');
    write(dir, 'specs/billing.md', doc([['BIL-1 note', '# Billing'], ['BIL-2 rule', 'A quarterly statement MUST list every payment.']]));
    commitAll(dir, 'B: billing');
    has(search(dir, ['quarterly', 'statement'], { level }), 'BIL-2 v1 baseline');
  });
}
