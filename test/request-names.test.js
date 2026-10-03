// Issue #95 [REC-1] [STA-7]: a request argument is a plain request name, in
// new's grammar (lowercase letters, digits and hyphens, starting with a
// letter or digit), never a path. Anything else (./pending, pending/,
// requests/pending, ../pending, archive/./done, Pending) is refused before
// any lookup: exit 2, nothing written. This holds for every command that
// writes a request's records (record decision, part, signoff, section and
// origin; consolidate, with --section and --revert; conclude, with
// --dropped), and a read resolves the same way. Plain names work as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { makeRepo, runAl } from './helpers/fixture.js';
import { block } from './helpers/change.js';
import { ENV, addRequest, both } from './helpers/request.js';
import { file } from './helpers/links.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const NEW1 = '## [NEW-1] Credit notes\nA credit note MUST name its invoice.\n';
const ALIASES = ['./pending', 'pending/', 'requests/pending', '../pending', 'archive/../pending', 'Pending'];

const al = (repo, args, input) => runAl(repo.dir, args, { input, env: ENV });
const status = (repo) => repo.git(['status', '--porcelain', '--untracked-files=all', '--ignored']);
// Every file under the repo, .git left out, as { path: bytes }.
function tree(dir) {
  const out = {};
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (d === dir && name === '.git') continue;
      if (statSync(p).isDirectory()) walk(p);
      else out[relative(dir, p)] = readFileSync(p).toString('base64');
    }
  };
  walk(dir);
  return out;
}

// Main: specs/invoices.md with INV-1, no specs/new.md; the signed request
// pending (D1-D4 among its decisions) holding a pending
// [NEW-1]@1 add in specs/new.md for R1.
function pending(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1));
  addRequest(repo, 'pending', [block('[NEW-1]@1 add in specs/new.md   for R1', { now: NEW1 })]);
  repo.commit('pending: request', { date: '2026-09-21T12:00:00Z' });
  return repo;
}

// Each form that writes a request's records, for the name `n`: [label, args, stdin].
const FORMS = (n) => [
  ['record decision', ['record', n, 'decision', '--source', 'agent', '--text', 'alias']],
  ['record part', ['record', n, 'part', '--text', 'alias']],
  ['record signoff', ['record', n, 'signoff', '--source', 'chat with the owner']],
  ['record section', ['record', n, 'section', 'INV-1']],
  ['record origin', ['record', n, 'origin', '--url', 'https://example.com/a', '--from', '-'], 'A page.\n'],
  ['consolidate', ['consolidate', n]],
  ['consolidate --section', ['consolidate', n, '--section', 'NEW-1']],
  ['consolidate --revert', ['consolidate', n, '--revert', 'NEW-1']],
  ['conclude', ['conclude', n]],
  ['conclude --dropped', ['conclude', n, '--dropped', 'D4']],
];

// --- #95's two cases ---

test('#95 [STA-7] conclude pending --yes refuses (exit 1: NEW-1 is pending); conclude ./pending --yes is refused too, exit 2: nothing archived, the tree byte for byte', (t) => {
  const repo = pending(t);
  const before = tree(repo.dir);
  const plain = al(repo, ['conclude', 'pending', '--yes']);
  assert.equal(plain.code, 1, `the plain name: refused, NEW-1 pending:\n${both(plain)}`);
  const alias = al(repo, ['conclude', './pending', '--yes']);
  assert.equal(alias.code, 2, `./pending is not a request name:\n${both(alias)}`);
  assert.equal(status(repo), '', 'nothing written');
  assert.deepEqual(tree(repo.dir), before, 'every file as it was');
});

test('#95 [REC-1] requests/archive/done on main: record done decision --yes exits 2 (archived); record archive/./done decision --yes exits 2 too, nothing appended', (t) => {
  const repo = makeRepo(t);
  addRequest(repo, 'done', null, { dir: 'requests/archive/done', status: 'concluded' });
  repo.commit('done: archived', { date: '2026-09-21T12:00:00Z' });
  const md = repo.read('requests/archive/done/request.md').toString();
  const plain = al(repo, ['record', 'done', 'decision', '--source', 'agent', '--text', 'normal', '--yes']);
  assert.equal(plain.code, 2, `the plain name: an archived request is not edited:\n${both(plain)}`);
  const alias = al(repo, ['record', 'archive/./done', 'decision', '--source', 'agent', '--text', 'alias', '--yes']);
  assert.equal(alias.code, 2, `archive/./done is not a request name:\n${both(alias)}`);
  assert.equal(repo.read('requests/archive/done/request.md').toString(), md, 'nothing appended');
  assert.equal(status(repo), '', 'nothing written');
});

// --- every writing form, every alias ---

for (const [label] of FORMS('x')) {
  test(`#95 [REC-1] ${label} --yes with a request argument that is not a plain name (${ALIASES.join(', ')}): exit 2, nothing written`, (t) => {
    const repo = pending(t);
    const before = tree(repo.dir);
    for (const n of ALIASES) {
      const [, args, input] = FORMS(n).find(([l]) => l === label);
      const r = al(repo, [...args, '--yes'], input);
      assert.equal(r.code, 2, `${args.join(' ')} --yes:\n${both(r)}`);
      assert.match(both(r), /is not a request name/, `${args.join(' ')} --yes: refused for its name, not for another reason:\n${both(r)}`);
      assert.equal(status(repo), '', `${n}: nothing written`);
    }
    assert.deepEqual(tree(repo.dir), before, 'every file as it was');
  });
}

test('#95 [REC-1] a read resolves the same way: context with each alias of pending exits 2 and shows no request\'s record', (t) => {
  const repo = pending(t);
  for (const n of ALIASES) {
    const r = al(repo, ['context', n]);
    assert.equal(r.code, 2, `context ${n}:\n${both(r)}`);
    assert.ok(!/^(BLOCKED|\S+\s+Request pending)/m.test(r.stdout), `context ${n} shows no request's record:\n${r.stdout}`);
  }
});

test('#95 contrast: plain names work as before: each writing form on pending without --yes is not refused as a usage error (exit 0 or 1), and context pending exits 0', (t) => {
  const repo = pending(t);
  for (const [label, args, input] of FORMS('pending')) {
    const r = al(repo, args, input);
    assert.ok(r.code === 0 || r.code === 1, `${label}: exit ${r.code}:\n${both(r)}`);
  }
  assert.equal(status(repo), '', 'nothing written without --yes');
  assert.equal(al(repo, ['context', 'pending']).code, 0);
});

test('#95 contrast: consolidate pending --yes writes [NEW-1] into specs/new.md, as before', (t) => {
  const repo = pending(t);
  const r = al(repo, ['consolidate', 'pending', '--yes']);
  assert.equal(r.code, 0, both(r));
  assert.equal(repo.read('specs/new.md').toString().trim(), NEW1.trim());
});
