// Issue #138, item 1 [SPC-1] [SPC-3] [HNT-3] [LNK-3] [REC-1]: the walk over
// the working tree descends only into real folders, never through a
// symlinked one. A symlinked folder under the root does not bring an outside
// file into the baseline, two that loop back (specs/a -> ., specs/b -> .)
// do not make spec, context or check hang, and one (specs/b -> .) does not
// copy each section into a duplicate ID that blocks consolidate. The same
// holds for a `results:` folder and for requests/. No read goes through a
// symlinked folder anywhere on the path below the repo top: not
// requests/archive, not requests itself, not a request's origin/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { makeRepo, runAl } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { addRequest, both, lineWith, requestText } from './helpers/request.js';
import { labelled } from './helpers/links.js';
import { check, checkHints, message } from './helpers/hints.js';
import { tap } from './helpers/evidence.js';
import { assertFinished, timed } from './helpers/bounded.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const NEW1 = '## [NEW-1] Credit notes\nA credit note MUST name its invoice.\n';
const OUT = '## [OUT-1] Outside heading\nThe outside body sentence.\n';

// A folder beside the repo (outside it, removed with it), holding `files`.
function outside(repo, files) {
  const dir = join(dirname(repo.dir), 'outside');
  mkdirSync(dir);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

const assertLink = (repo, path) =>
  assert.match(repo.git(['ls-files', '-s', path]), /^120000 /, `the fixture: ${path} is committed as a symlink`);

test('#138 [SPC-1] a committed specs/shared -> <folder outside the repo>: al spec and spec --list show the baseline but not the outside file\'s section; exit 0', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  symlinkSync(outside(repo, { 'x.md': OUT }), join(repo.dir, 'specs', 'shared'));
  repo.commit('specs/shared links out of the repo');
  assertLink(repo, 'specs/shared');
  for (const args of [['spec'], ['spec', '--list']]) {
    const r = runAl(repo.dir, args);
    assert.equal(r.code, 0, `${args.join(' ')}:\n${both(r)}`);
    assert.ok(r.stdout.includes('INV-1'), `the baseline is shown:\n${r.stdout}`);
    assert.ok(!r.stdout.includes('OUT-1') && !r.stdout.includes('The outside body sentence.') && !r.stdout.includes('specs/shared/'),
      `${args.join(' ')} should not read through specs/shared:\n${r.stdout}`);
  }
});

test('#138 [SPC-1][HNT-3] specs/a -> . and specs/b -> .: al spec, al context and al check each finish (bounded) and exit 0', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  symlinkSync('.', join(repo.dir, 'specs', 'a'));
  symlinkSync('.', join(repo.dir, 'specs', 'b'));
  repo.commit('two loops in specs');
  assertLink(repo, 'specs/a');
  for (const args of [['spec'], ['context'], ['check']]) {
    const r = timed(repo.dir, args);
    assertFinished(r, args);
    assert.equal(r.code, 0, `${args.join(' ')}:\n${both(r)}`);
  }
});

// Main: the baseline INV-1, specs/b -> ., and the signed request pending
// holding a pending [NEW-1]@1 add in specs/new.md.
function oneLoop(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  symlinkSync('.', join(repo.dir, 'specs', 'b'));
  addRequest(repo, 'pending', [block('[NEW-1]@1 add in specs/new.md   for R1', { now: NEW1 })]);
  repo.commit('pending: request; specs/b loops', { date: '2026-09-21T12:00:00Z' });
  assertLink(repo, 'specs/b');
  return repo;
}

test('#138 [SPC-3] one specs/b -> .: al check --all gives no "duplicate ID" not ok, and al spec names no file under specs/b/', (t) => {
  const repo = oneLoop(t);
  const out = check(repo, '--all');
  const dup = checkHints(out).find((l) => /duplicate/i.test(l));
  assert.ok(!dup, `INV-1 is in one file only:\n${out}`);
  const r = runAl(repo.dir, ['spec']);
  assert.equal(r.code, 0, both(r));
  assert.ok(!r.stdout.includes('specs/b/'), `spec should not read through specs/b:\n${r.stdout}`);
});

test('#138 [SPC-3][STA-4] one specs/b -> .: consolidate pending --yes is not refused on duplicate IDs: exit 0, [NEW-1] written to specs/new.md', (t) => {
  const repo = oneLoop(t);
  const r = runAl(repo.dir, ['consolidate', 'pending', '--yes'], { env: { SOURCE_DATE_EPOCH: '1790206200' } });
  assert.equal(r.code, 0, `consolidate should not refuse:\n${both(r)}`);
  assert.doesNotMatch(both(r), /duplicate/i, both(r));
  assert.equal(repo.read('specs/new.md').toString().trim(), NEW1.trim());
});

// Main: the baseline and `results: results`. The branch: one commit, head.
// results/own.tap, at head, is a real file; `links` are { name: target }
// symlinks made under results/ (untracked, as result files are).
function withResults(t, links) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  repo.write('.assuredloop', 'results: results\n');
  repo.commit('Spec and config', { date: '2026-09-01T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  const head = repo.commit(message('Work', { tier: '2 — work' }), { date: '2026-09-02T12:00:00Z' });
  repo.write('results/own.tap', tap(head, [['first', 'ok']]));
  for (const [name, target] of Object.entries(typeof links === 'function' ? links(repo, head) : links)) symlinkSync(target, join(repo.dir, 'results', name));
  return repo;
}

test('#138 [LNK-3] results/ext -> <folder outside the repo> holding a result file: check\'s Results block lists results/own.tap and not the outside file', (t) => {
  const repo = withResults(t, (r, head) => ({ ext: outside(r, { 'outside.tap': tap(head, [['outside', 'ok']]) }) }));
  const b = labelled(check(repo, '--all'), 'Results');
  assert.ok(lineWith(b, 'results/own.tap'), `the real result is listed:\n${b}`);
  assert.ok(!b.includes('outside.tap'), `the walk should not read through results/ext:\n${b}`);
});

test('#138 [LNK-3][HNT-3] results/a -> . and results/b -> .: al check finishes (bounded), exit 0, and lists results/own.tap once', (t) => {
  const repo = withResults(t, { a: '.', b: '.' });
  const r = timed(repo.dir, ['check', '--all']);
  assertFinished(r, ['check', '--all']);
  assert.equal(r.code, 0, both(r));
  const b = labelled(r.stdout, 'Results');
  assert.ok(lineWith(b, 'results/own.tap'), `the real result is listed:\n${b}`);
  assert.ok(!b.includes('results/a/') && !b.includes('results/b/'), `the walk should not read through results/a or results/b:\n${b}`);
});

test('#138 [REC-1] requests/ext -> <folder outside the repo> holding a request.md: not read as a request: al context does not list it, al context ext exits 2 and shows none of it; the real request is listed', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  addRequest(repo, 'inner', null);
  mkdirSync(join(repo.dir, 'requests'), { recursive: true });
  symlinkSync(outside(repo, { 'request.md': '# The outside request\nType: story · Tier: 2 · Status: open\n\n## Owner\'s words and dialog\n\n- 2026-09-20 owner chat\n' }),
    join(repo.dir, 'requests', 'ext'));
  repo.commit('requests/ext links out of the repo');
  assertLink(repo, 'requests/ext');
  const all = runAl(repo.dir, ['context']);
  assert.equal(all.code, 0, both(all));
  assert.ok(lines(all.stdout).some((l) => /^inner\b/.test(l)), `the real request is listed:\n${all.stdout}`);
  assert.ok(!lines(all.stdout).some((l) => /\bext\b/.test(l) || l.includes('The outside request')), `requests/ext is not a request:\n${all.stdout}`);
  const one = runAl(repo.dir, ['context', 'ext']);
  assert.equal(one.code, 2, `ext is no request here:\n${both(one)}`);
  assert.ok(!one.stdout.includes('The outside request'), `nothing read from outside:\n${one.stdout}`);
});

// A writer for addRequest into a folder beside the repo (outside it).
function outsideWriter(repo) {
  const dir = join(dirname(repo.dir), 'outside');
  mkdirSync(dir);
  return { dir, write(rel, text) { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); } };
}
const VICTIM = 'Victim outside words';
// Nothing of the outside request's records reaches stdout: its title, a
// sign-off read back, or its signed text.
function assertNothingOutside(r, label) {
  assert.ok(!r.stdout.includes(VICTIM), `${label}: the outside request's title is not shown:\n${r.stdout}`);
  assert.ok(!r.stdout.includes('signed text:') && !r.stdout.includes('Customers keep asking'), `${label}: no outside record is read:\n${r.stdout}`);
}

test('#138 [SPC-1][REC-1] a committed requests/archive -> <folder outside the repo> holding victim/: context does not list victim; context victim and context victim --audit exit 2 and print nothing of it', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  addRequest(repo, 'real', null);
  const out = outsideWriter(repo);
  addRequest(out, 'victim', null, { dir: 'victim', status: 'concluded', title: VICTIM });
  symlinkSync(out.dir, join(repo.dir, 'requests', 'archive'));
  repo.commit('requests/archive links out of the repo');
  assertLink(repo, 'requests/archive');
  const all = runAl(repo.dir, ['context']);
  assert.equal(all.code, 0, both(all));
  assert.ok(lines(all.stdout).some((l) => /^real\b/.test(l)), `the real request is listed:\n${all.stdout}`);
  assert.ok(!all.stdout.includes('victim') && !all.stdout.includes(VICTIM), `victim is not a request here:\n${all.stdout}`);
  for (const args of [['context', 'victim'], ['context', 'victim', '--audit']]) {
    const r = runAl(repo.dir, args);
    assert.equal(r.code, 2, `al ${args.join(' ')}: no such request:\n${both(r)}`);
    assertNothingOutside(r, args.join(' '));
  }
});

test('#138 [SPC-1][REC-1] a committed requests -> <folder outside the repo> holding victim/: context does not list victim; context victim and context victim --audit exit 2 and print nothing of it', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  const out = outsideWriter(repo);
  addRequest(out, 'victim', null, { dir: 'victim', title: VICTIM });
  symlinkSync(out.dir, join(repo.dir, 'requests'));
  repo.commit('requests links out of the repo');
  assertLink(repo, 'requests');
  const all = runAl(repo.dir, ['context']);
  assert.equal(all.code, 0, both(all));
  assert.ok(!all.stdout.includes('victim') && !all.stdout.includes(VICTIM), `victim is not a request here:\n${all.stdout}`);
  for (const args of [['context', 'victim'], ['context', 'victim', '--audit']]) {
    const r = runAl(repo.dir, args);
    assert.equal(r.code, 2, `al ${args.join(' ')}: no such request:\n${both(r)}`);
    assertNothingOutside(r, args.join(' '));
  }
});

test('#138 [SPC-1][REC-5] a real requests/real/ whose committed origin -> <folder outside the repo> holds a valid sign-off of real\'s requirement: real is not signed off from it (BLOCKED, no "signed off" Require line), and context real --audit reads no snapshot from it', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  const out = outsideWriter(repo);
  addRequest(out, 'real', null, { dir: 'x' });
  repo.write('requests/real/request.md', requestText('Request real'));
  symlinkSync(join(out.dir, 'x', 'origin'), join(repo.dir, 'requests', 'real', 'origin'));
  repo.commit('requests/real/origin links out of the repo');
  assertLink(repo, 'requests/real/origin');
  const c = runAl(repo.dir, ['context', 'real']);
  assert.equal(c.code, 0, both(c));
  const require = lines(c.stdout).find((l) => /^Require\b/.test(l)) ?? '';
  assert.ok(!/signed off/.test(require), `real is not signed off from an outside snapshot:\n${c.stdout}`);
  assert.match(c.stdout, /BLOCKED/, `real awaits the owner's sign-off:\n${c.stdout}`);
  const a = runAl(repo.dir, ['context', 'real', '--audit']);
  assert.ok(!a.stdout.includes('signed text:') && !lines(a.stdout).some((l) => /^(Snapshot|Sign-off)\b.*\bmatches\b/.test(l)),
    `--audit reads no snapshot through origin -> outside:\n${a.stdout}`);
});
