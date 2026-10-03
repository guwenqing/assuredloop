// Issue #140, hints that are missing, hidden or worded apart from check's.
// Built from the issue's items and the architect's rulings; nothing here
// reads the code under test.
// (6) al spec shows each duplicate ID with check's own text, at most three,
//     the last ending "; <N> more hidden, al check --all" [HNT-1] [SPC-3].
// (11) The state phrases keep their word: "waiting on <block>", "carried by
//     <block>", in al spec --list and in al context <name> --audit [STA-2].
// (14b) A pending add whose ID was used before (in the baseline in an
//     earlier commit, or in an archived request's change.md) is not ok,
//     owned by its request, citing [SPC-3] and naming the next free ID.
// (17) A Tier: S claim whose branch edits a baseline section's text gets the
//     not ok a tier-0 claim gets; an ID-only edit, a move, or a non-.md file
//     under the root does not [REC-10] [REC-11].
// (18) An `add in <path>` whose path is not a .md file under the root is not
//     ok in check, owned by its request, naming the block and [SPC-5].
// (26) A level-only change to the second heading with no ID delivers nothing
//     for a blocked request: [SPC-4] leaves the `#` count out [REC-6].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, runAl } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { ENV, ORG, addRequest, both } from './helpers/request.js';
import { file } from './helpers/links.js';
import { assertCounts, check, checkHints, hint, kindOf, message, noHint, strict, viewHints } from './helpers/hints.js';

const ok = (r, what) => assert.equal(r.code, 0, `${what}:\n${both(r)}`);
const al = (repo, ...args) => runAl(repo.dir, args, { env: ENV });
const notOks = (out) => checkHints(out).filter((l) => kindOf(l) === 'not ok');

// --- (6) duplicate IDs in al spec ---

const dup = (n, where) => `## [DUP-${n}] Rule ${n}\nRule ${n} holds in ${where}.\n`;
const FIVE = [1, 2, 3, 4, 5];

test('#140 item 6 [HNT-1][SPC-3] five duplicate IDs: al spec and al spec --list each show three, with check\'s own text, the last ending "; 2 more hidden, al check --all"; al check --all shows all five', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/a.md', file(...FIVE.map((n) => dup(n, 'a'))));
  repo.write('specs/b.md', file(...FIVE.map((n) => dup(n, 'b'))));
  repo.commit('Baseline', { date: '2026-09-20T12:00:00Z' });

  const all = checkHints(check(repo, '--all')).filter((l) => l.includes('duplicate ID'));
  for (const n of FIVE) {
    assert.ok(all.some((l) => l.startsWith(`not ok: duplicate ID [DUP-${n}] in specs/a.md:`) && l.includes(' and specs/b.md:')),
      `check --all should show DUP-${n}:\n${all.join('\n')}`);
  }
  assert.equal(all.length, 5, all.join('\n'));

  const MORE = '; 2 more hidden, al check --all';
  for (const args of [[], ['--list']]) {
    const r = al(repo, 'spec', ...args);
    ok(r, `spec ${args.join(' ')}`);
    assertFrame(r.stdout);
    const shown = viewHints(r.stdout).map((l) => l.slice(l.indexOf('not ok:'))).filter((l) => l.includes('duplicate ID'));
    assert.equal(shown.length, 3, `spec ${args.join(' ')}: three duplicate hints:\n${r.stdout}`);
    assert.ok(shown[2].endsWith(MORE), `spec ${args.join(' ')}: the third ends "${MORE}":\n${shown[2]}`);
    const texts = [shown[0], shown[1], shown[2].slice(0, -MORE.length)];
    for (const text of texts) assert.ok(all.includes(text), `spec ${args.join(' ')}: each hint has check's text; not in check:\n${text}\ncheck:\n${all.join('\n')}`);
    assert.equal(new Set(texts).size, 3, `three different IDs:\n${texts.join('\n')}`);
    assert.doesNotMatch(r.stdout, /more duplicate IDs hidden/, `the old line, with no way to see them:\n${r.stdout}`);
  }
});

test('#140 item 6 [HNT-1][SPC-3] three duplicate IDs: al spec shows all three with check\'s own text and no "more hidden"', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/a.md', file(...[1, 2, 3].map((n) => dup(n, 'a'))));
  repo.write('specs/b.md', file(...[1, 2, 3].map((n) => dup(n, 'b'))));
  repo.commit('Baseline', { date: '2026-09-20T12:00:00Z' });
  const all = checkHints(check(repo, '--all')).filter((l) => l.includes('duplicate ID'));
  const r = al(repo, 'spec');
  ok(r, 'spec');
  const shown = viewHints(r.stdout).map((l) => l.slice(l.indexOf('not ok:'))).filter((l) => l.includes('duplicate ID'));
  assert.deepEqual([...shown].sort(), [...all].sort(), r.stdout);
  assert.doesNotMatch(r.stdout, /more hidden/, r.stdout);
});

// --- (11) waiting on, carried by ---

const EX0 = '## [EX-0] Anchor\nThe anchor MUST remain.\n';
const OLD = '## [EX-1] Example\nThe example is old.\n';
const NEW = '## [EX-1] Example\nThe example MUST be new.\n';
const NEWER = '## [EX-1] Example\nThe example MUST be newer.\n';

// [STA-2]'s example: a changes EX-1 from OLD to NEW, b builds on it from NEW to NEWER; the baseline holds `text`.
function chain(t, text) {
  const repo = makeRepo(t);
  repo.write('specs/ex.md', file(EX0, text));
  addRequest(repo, 'a', [block('[EX-1]@1 modify   for R1', { was: OLD, now: NEW })]);
  addRequest(repo, 'b', [block('[EX-1]@1 modify   builds on a/EX-1@1   for R1', { was: NEW, now: NEWER })]);
  repo.commit('a and b', { date: '2026-09-21T12:00:00Z' });
  return repo;
}

for (const [label, text, phrase, owner] of [
  ['the baseline at OLD: b/EX-1@1 waiting on a/EX-1@1', OLD, 'b/EX-1@1 waiting on a/EX-1@1', 'b'],
  ['the baseline at NEWER: a/EX-1@1 carried by b/EX-1@1', NEWER, 'a/EX-1@1 carried by b/EX-1@1', 'a'],
]) {
  test(`#140 item 11 [STA-2][VW-5][VW-7] ${label}, in al spec --list and in al context ${owner} --audit`, (t) => {
    const repo = chain(t, text);
    const list = al(repo, 'spec', '--list');
    ok(list, 'spec --list');
    assert.ok(list.stdout.includes(phrase), `spec --list should read "${phrase}":\n${list.stdout}`);
    const audit = al(repo, 'context', owner, '--audit');
    ok(audit, `context ${owner} --audit`);
    assert.ok(audit.stdout.includes(phrase), `context ${owner} --audit should read "${phrase}":\n${audit.stdout}`);
    for (const out of [list.stdout, audit.stdout]) assert.doesNotMatch(out, /\b(waiting|carried) [ab]\/EX-1@1/, `the phrase keeps its word:\n${out}`);
  });
}

// --- (14b) a pending add of an ID used before ---

const PAY = (n, text = `Payments rule ${n} holds.`) => `## [PAY-${n}] Rule ${n}\n${text}\n`;
const PAY_NEW = (n) => PAY(n, `Refunds MUST follow rule ${n}.`);

// Main: `history` (a list of { path: text } commits); the branch work then
// adds refunds, signed, holding `[PAY-<n>]@1 add in specs/pay.md`, with a Request line.
function reuse(t, history, n) {
  const repo = makeRepo(t);
  history.forEach((files, i) => {
    for (const [path, text] of Object.entries(files)) repo.write(path, text);
    repo.commit(`Payments ${i + 1}`, { date: `2026-09-2${i}T12:00:00Z` });
  });
  repo.git(['checkout', '-q', '-b', 'work']);
  addRequest(repo, 'refunds', [block(`[PAY-${n}]@1 add in specs/pay.md   for R1`, { now: PAY_NEW(n) })]);
  repo.commit(message('refunds: request and change spec', { request: 'refunds', tier: '2 — refunds' }), { date: '2026-09-25T12:00:00Z' });
  return repo;
}
// PAY-3 in the baseline, then removed: the highest ever used is 3.
const REMOVED = [{ 'specs/pay.md': file(PAY(1), PAY(2), PAY(3)) }, { 'specs/pay.md': file(PAY(1), PAY(2)) }];
// PAY-5 only in an archived (dropped) request's change.md: the highest ever used is 5.
const ARCHIVED = (repo) => addRequest(repo, 'old-pay', [block('[PAY-5]@1 add in specs/pay.md   Dropped 2026-09-26 (D4)   for R1', { now: PAY(5) })],
  { dir: 'requests/archive/old-pay', status: 'dropped' });

test('#140 item 14b [SPC-3][HNT-2][HNT-3] a pending add of PAY-3, which the baseline held in an earlier commit and no longer does, is not ok citing [SPC-3], naming the next free ID PAY-4; it counts, check --strict exits 1', (t) => {
  const repo = reuse(t, REMOVED, 3);
  assert.ok(!repo.read('specs/pay.md').toString().includes('[PAY-3]'), 'the fixture: PAY-3 is in history only');
  const line = hint(check(repo, '--all'), 'not ok', 'PAY-3', '[SPC-3]');
  assert.match(line, /\bPAY-4\b/, `the not ok should name the next free ID, PAY-4:\n${line}`);
  assert.ok(line.includes('refunds'), `the not ok should name its request:\n${line}`);
  assertCounts(line);
  strict(repo, 1);
});

test('#140 item 14b [SPC-3] contrast: the same history, a pending add of PAY-4 (one more than the highest ever used) draws no such not ok, and check --strict exits 0', (t) => {
  const repo = reuse(t, REMOVED, 4);
  const out = check(repo, '--all');
  noHint(out, 'not ok', '[SPC-3]');
  assert.deepEqual(notOks(out), [], `no not ok:\n${out}`);
  strict(repo, 0);
});

// PAY-4 only mentioned in a section's body ("see [PAY-4]"), never a heading:
// still in the baseline, or there in an earlier commit and edited out since.
const MENTION = PAY(2, 'Payments rule 2 holds; see [PAY-4].');
for (const [label, history] of [
  ['in the baseline now', [{ 'specs/pay.md': file(PAY(1), MENTION) }]],
  ['in an earlier commit only', [{ 'specs/pay.md': file(PAY(1), MENTION) }, { 'specs/pay.md': file(PAY(1), PAY(2)) }]],
]) {
  test(`#140 item 14b [SPC-3] contrast: [PAY-4] only mentioned in a section's body (${label}), never heading a section: a pending add of PAY-4 draws no [SPC-3] reuse not ok, and check --strict exits 0`, (t) => {
    const repo = reuse(t, history, 4);
    const out = check(repo, '--all');
    noHint(out, 'not ok', '[SPC-3]');
    assert.deepEqual(notOks(out), [], `no not ok:\n${out}`);
    strict(repo, 0);
  });
}

// A heading inside code is not a section [SPC-2]: `## [PAY-3] …` held only in
// a fenced block, or only as four-space indented code, in an earlier commit.
const CODE_HEADING = '## [PAY-3] Old rule\nPayments rule 3 held.';
const IN_CODE = {
  'a fenced code block': PAY(1, `Payments rule 1 holds. An old draft read:\n\n\`\`\`\n${CODE_HEADING}\n\`\`\``),
  'four-space indented code': PAY(1, `Payments rule 1 holds. An old draft read:\n\n${CODE_HEADING.split('\n').map((l) => `    ${l}`).join('\n')}`),
};
for (const [label, text] of Object.entries(IN_CODE)) {
  test(`#140 item 14b [SPC-2][SPC-3] contrast: ## [PAY-3] only inside ${label} in an earlier commit, never a heading: al spec --list there shows no PAY-3, and a pending add of PAY-3 draws no [SPC-3] reuse not ok; check --strict exits 0`, (t) => {
    const repo = reuse(t, [{ 'specs/pay.md': file(text, PAY(2)) }, { 'specs/pay.md': file(PAY(1), PAY(2)) }], 3);
    const first = repo.git(['rev-list', '--max-parents=0', 'main']).split('\n')[0];
    const earlier = repo.git(['log', '--format=%H', '--', 'specs/pay.md']).split('\n').at(-1);
    assert.notEqual(earlier, first, 'the fixture: the code heading is in a commit of its own');
    const list = al(repo, 'spec', '--list', '--at', earlier);
    ok(list, 'spec --list --at the earlier commit');
    assert.ok(list.stdout.includes('PAY-1') && !list.stdout.includes('PAY-3'), `PAY-3 in code is no section:\n${list.stdout}`);
    const out = check(repo, '--all');
    noHint(out, 'not ok', '[SPC-3]');
    assert.deepEqual(notOks(out), [], `no not ok:\n${out}`);
    strict(repo, 0);
  });
}

test('#140 item 14b [SPC-3] contrast: an archived request\'s change.md whose block Now holds a fenced example "## [PAY-5] …", while no block heading names PAY-5: a pending add of PAY-5 draws no [SPC-3] reuse not ok; check --strict exits 0', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/pay.md', file(PAY(1), PAY(2)));
  const example = PAY(2, 'Payments rule 2 holds. A later rule would read:\n\n```\n## [PAY-5] Example\nAn example rule.\n```');
  addRequest(repo, 'old-pay', [block('[PAY-2]@1 modify   Dropped 2026-09-26 (D4)   for R1', { was: PAY(2), now: example })],
    { dir: 'requests/archive/old-pay', status: 'dropped' });
  repo.commit('Payments, and old-pay archived', { date: '2026-09-20T12:00:00Z' });
  assert.ok(repo.read('requests/archive/old-pay/change.md').toString().includes('## [PAY-5] Example'), 'the fixture: the example is in the archived change.md');
  repo.git(['checkout', '-q', '-b', 'work']);
  addRequest(repo, 'refunds', [block('[PAY-5]@1 add in specs/pay.md   for R1', { now: PAY_NEW(5) })]);
  repo.commit(message('refunds: request and change spec', { request: 'refunds', tier: '2 — refunds' }), { date: '2026-09-25T12:00:00Z' });
  const out = check(repo, '--all');
  noHint(out, 'not ok', '[SPC-3]');
  assert.deepEqual(notOks(out), [], `no not ok:\n${out}`);
  strict(repo, 0);
});

// A file name git quotes in its diff headers (non-ASCII): PAY-3 headed a
// section in specs/café.md, which was removed since. Each commit is
// { path: text }, null removing the file; then the branch adds PAY-3.
function quoted(t, history) {
  const repo = makeRepo(t);
  history.forEach((files, i) => {
    for (const [path, text] of Object.entries(files)) {
      if (text === null) repo.git(['rm', '-q', path]);
      else repo.write(path, text);
    }
    repo.commit(`Payments ${i + 1}`, { date: `2026-09-2${i}T12:00:00Z` });
  });
  repo.git(['checkout', '-q', '-b', 'work']);
  addRequest(repo, 'refunds', [block('[PAY-3]@1 add in specs/pay.md   for R1', { now: PAY_NEW(3) })]);
  repo.commit(message('refunds: request and change spec', { request: 'refunds', tier: '2 — refunds' }), { date: '2026-09-25T12:00:00Z' });
  return repo;
}
const REUSED3 = ['not ok', 'PAY-3', '[SPC-3]'];

for (const name of ['café', 'old']) {
  test(`#140 item 14b ${name === 'old' ? 'pin ' : ''}[SPC-3][HNT-3] PAY-3 headed a section in specs/${name}.md, removed since${name === 'café' ? ' (a name git quotes in diff headers)' : ''}: a pending add of PAY-3 is not ok citing [SPC-3], naming specs/${name}.md; check --strict exits 1`, (t) => {
    const repo = quoted(t, [{ 'specs/pay.md': file(PAY(1), PAY(2)) }, { [`specs/${name}.md`]: PAY(3) }, { [`specs/${name}.md`]: null }]);
    assert.ok(repo.git(['log', '-p', '--format=', '--', 'specs']).includes('diff --git "a/specs/caf') === (name === 'café'),
      'the fixture: git quotes the name in its diff header only for café');
    const line = hint(check(repo, '--all'), ...REUSED3, `specs/${name}.md`);
    assertCounts(line);
    strict(repo, 1);
  });
}

// PAY-3 headed a section in specs/merge.md, brought in by a merge commit only
// (`inMerge`), or by an ordinary commit on main. The branch work adds refunds
// with a pending add of PAY-3, and removes specs/merge.md in the working tree
// only, so no later commit's old side shows PAY-3.
function mergeOnly(t, inMerge) {
  const repo = makeRepo(t);
  repo.write('specs/pay.md', PAY(1));
  repo.commit('Payments', { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'feature']);
  repo.write('src/feature.js', 'export const feature = 1;\n');
  repo.commit('Feature', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  repo.write('src/main.js', 'export const main = 1;\n');
  if (!inMerge) repo.write('specs/merge.md', PAY(3));
  repo.commit('Main', { date: '2026-09-21T13:00:00Z' });
  repo.git(['merge', '-q', '--no-ff', '--no-commit', 'feature'], { date: '2026-09-22T12:00:00Z' });
  if (inMerge) repo.write('specs/merge.md', PAY(3));
  repo.git(['add', '-A']);
  repo.git(['commit', '-q', '--no-edit'], { date: '2026-09-22T12:00:00Z' });
  const added = repo.git(['log', '--format=%P', '--diff-filter=A', '-m', '--first-parent', '--', 'specs/merge.md']).split('\n')[0];
  assert.equal(added.split(' ').length, inMerge ? 2 : 1, `the fixture: specs/merge.md came ${inMerge ? 'in the merge commit only' : 'in an ordinary commit'}`);
  const list = al(repo, 'spec', '--list');
  ok(list, 'spec --list on main');
  assert.ok(list.stdout.includes('PAY-3'), `the fixture: main's baseline holds PAY-3:\n${list.stdout}`);
  repo.git(['checkout', '-q', '-b', 'work']);
  addRequest(repo, 'refunds', [block('[PAY-3]@1 add in specs/pay.md   for R1', { now: PAY_NEW(3) })]);
  repo.commit(message('refunds: request and change spec', { request: 'refunds', tier: '2 — refunds' }), { date: '2026-09-25T12:00:00Z' });
  rmSync(join(repo.dir, 'specs/merge.md'));
  return repo;
}

for (const inMerge of [true, false]) {
  test(`#140 item 14b ${inMerge ? '' : 'pin '}[SPC-3][HNT-3] PAY-3 headed a section in specs/merge.md, brought in ${inMerge ? 'by a merge commit only' : 'by an ordinary commit on main'}, removed in the working tree: a pending add of PAY-3 is not ok citing [SPC-3], naming specs/merge.md; check --strict exits 1`, (t) => {
    const repo = mergeOnly(t, inMerge);
    const line = hint(check(repo, '--all'), ...REUSED3, 'specs/merge.md');
    assertCounts(line);
    strict(repo, 1);
  });
}

// With core.quotePath false, git still C-quotes a path holding a tab, a double
// quote or a backslash, and leaves an emoji (outside the BMP) literal in it:
// diff --git "a/specs/😀\t.md" … PAY-3 headed a section in such a file, removed
// since. Each: the file name, and how a hint line shows it (the output escapes
// every control character but a tab, so the tab stays as it is).
for (const [label, name, shown] of [
  ['an emoji and a tab', '😀\t', '😀\t'],
  ['an emoji and a double quote', '😀"', '😀"'],
]) {
  test(`#140 item 14b [SPC-3][HNT-3] PAY-3 headed a section in a file whose name holds ${label}, quoted by git with the emoji literal, removed since: a pending add of PAY-3 is not ok citing [SPC-3], naming specs/${JSON.stringify(shown).slice(1, -1)}.md exactly, the emoji intact; check --strict exits 1`, (t) => {
    const repo = makeRepo(t);
    repo.git(['config', 'core.quotePath', 'false']);
    const path = `specs/${name}.md`;
    repo.write('specs/pay.md', PAY(1));
    repo.commit('Payments', { date: '2026-09-20T12:00:00Z' });
    repo.write(path, PAY(3));
    repo.commit('Payments 2', { date: '2026-09-21T12:00:00Z' });
    repo.git(['rm', '-q', path]);
    repo.commit('Payments 3', { date: '2026-09-22T12:00:00Z' });
    assert.ok(repo.git(['log', '-p', '--format=', '--', 'specs']).includes('diff --git "a/specs/😀'), 'the fixture: git quotes the path and leaves the emoji literal');
    repo.git(['checkout', '-q', '-b', 'work']);
    addRequest(repo, 'refunds', [block('[PAY-3]@1 add in specs/pay.md   for R1', { now: PAY_NEW(3) })]);
    repo.commit(message('refunds: request and change spec', { request: 'refunds', tier: '2 — refunds' }), { date: '2026-09-25T12:00:00Z' });
    const out = check(repo, '--all');
    assert.doesNotMatch(out, /\uFFFD/, `no replacement character:\n${out}`);
    const line = hint(out, ...REUSED3, `specs/${shown}.md`);
    assertCounts(line);
    strict(repo, 1);
  });
}

test('#140 item 14b [SPC-1][SPC-3] a baseline file named specs/change.md is a baseline file: PAY-3 headed a section there, removed since; a pending add of PAY-3 is not ok citing [SPC-3], naming specs/change.md; check --strict exits 1', (t) => {
  const repo = quoted(t, [{ 'specs/base.md': PAY(1) }, { 'specs/change.md': PAY(3) }, { 'specs/change.md': null }]);
  const added = repo.git(['log', '--format=%H', '--diff-filter=A', '--', 'specs/change.md']);
  const list = al(repo, 'spec', '--list', '--at', added);
  ok(list, 'spec --list --at the commit that added specs/change.md');
  assert.ok(list.stdout.includes('specs/change.md') && list.stdout.includes('PAY-3'), `the fixture: PAY-3 is a baseline section there:\n${list.stdout}`);
  const line = hint(check(repo, '--all'), ...REUSED3, 'specs/change.md');
  assertCounts(line);
  strict(repo, 1);
});

test('#140 item 14b [SPC-3] specs/base.md (PAY-1) and specs/café.md (PAY-3) added in one commit, café.md removed since: the reuse not ok names specs/café.md, never specs/base.md', (t) => {
  const repo = quoted(t, [{ 'specs/base.md': PAY(1), 'specs/café.md': PAY(3) }, { 'specs/café.md': null }]);
  const line = hint(check(repo, '--all'), ...REUSED3, 'specs/café.md');
  assert.ok(!line.includes('specs/base.md'), `PAY-3 never headed a section in specs/base.md:\n${line}`);
  assertCounts(line);
  strict(repo, 1);
});

// A block heading inside a fenced Was or Now is not a block: old's real block
// is OLD-1@1, its Now fenced with four backticks around a three-backtick
// example that holds the line `### [PAY-3]@1 add in specs/new.md`.
const OLD1 = '## [OLD-1] Rule\nThe old rule holds.\n';
const FENCED_EXAMPLE = '# Change\n\nWhy: an example of a change block.\n\n## Spec changes\n\n' +
  '### [OLD-1]@1 modify   Dropped 2026-09-26 (D4)   for R1\nWas:\n\n````\n' + OLD1 + '````\n\nNow:\n\n````\n' +
  '## [OLD-1] Rule\nThe old rule holds. An example change block follows:\n\n```md\n' +
  '### [PAY-3]@1 add in specs/new.md\nNow:\n    ## [PAY-3] Example\n    Only a code sample.\n```\n````\n';

test('#140 item 14b [SPC-3][SPC-5] contrast: an archived request whose change.md holds "### [PAY-3]@1 add in specs/new.md" only inside a fenced Now never held PAY-3: record section PAY-3 --builds-on old says "old holds no block for [PAY-3]", and a pending add of PAY-3 draws no [SPC-3] reuse not ok; check --strict exits 0', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/pay.md', file(PAY(1), PAY(2)));
  repo.write('specs/old.md', OLD1);
  addRequest(repo, 'old', null, { dir: 'requests/archive/old', status: 'dropped' });
  repo.write('requests/archive/old/change.md', FENCED_EXAMPLE);
  addRequest(repo, 'payouts', null);
  repo.commit('Payments; old archived; payouts', { date: '2026-09-20T12:00:00Z' });

  const r = al(repo, 'record', 'payouts', 'section', 'PAY-3', '--builds-on', 'old');
  assert.equal(r.code, 2, both(r));
  assert.ok(both(r).includes('old holds no block for [PAY-3]'), `the fixture: old holds no PAY-3 block:\n${both(r)}`);

  repo.git(['checkout', '-q', '-b', 'work']);
  addRequest(repo, 'refunds', [block('[PAY-3]@1 add in specs/pay.md   for R1', { now: PAY_NEW(3) })]);
  repo.commit(message('refunds: request and change spec', { request: 'refunds', tier: '2 — refunds' }), { date: '2026-09-25T12:00:00Z' });
  const out = check(repo, '--all');
  noHint(out, 'not ok', '[SPC-3]');
  assert.deepEqual(notOks(out), [], `no not ok:\n${out}`);
  strict(repo, 0);
});

test('#140 item 14b [SPC-3][HNT-3] a pending add of PAY-5, an ID only an archived request\'s change.md used, is not ok citing [SPC-3], naming PAY-6; a pending add of PAY-6 is not', (t) => {
  const build = (n) => {
    const repo = makeRepo(t);
    repo.write('specs/pay.md', file(PAY(1), PAY(2)));
    ARCHIVED(repo);
    repo.commit('Payments, and old-pay archived', { date: '2026-09-20T12:00:00Z' });
    repo.git(['checkout', '-q', '-b', 'work']);
    addRequest(repo, 'refunds', [block(`[PAY-${n}]@1 add in specs/pay.md   for R1`, { now: PAY_NEW(n) })]);
    repo.commit(message('refunds: request and change spec', { request: 'refunds', tier: '2 — refunds' }), { date: '2026-09-25T12:00:00Z' });
    return repo;
  };
  const used = build(5);
  const line = hint(check(used, '--all'), 'not ok', 'PAY-5', '[SPC-3]');
  assert.match(line, /\bPAY-6\b/, `the not ok should name the next free ID, PAY-6:\n${line}`);
  assertCounts(line);
  strict(used, 1);

  const fresh = build(6);
  noHint(check(fresh, '--all'), 'not ok', '[SPC-3]');
  strict(fresh, 0);
});

// --- (17) a Tier: S claim with a baseline edit ---

const DATES = '## [TXT-1] Dates\nDates show in ISO 8601.\n';
const DATES_CHANGED = "## [TXT-1] Dates\nDates show in the customer's local format.\n";
const TOTALS = '## [TXT-2] Totals\nTotals show two decimals.\n';
const NAMES = '## [TXT-3] Names\nNames show in full.\n';
const SPIKE = 'S — which date formats customers use; no spec change';

// Main holds `before`; the branch work writes `after` in one commit claiming tier S.
function spike(t, before, after = {}, edit) {
  const repo = makeRepo(t);
  for (const [path, text] of Object.entries(before)) repo.write(path, text);
  repo.commit('Initial spec', { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  for (const [path, text] of Object.entries(after)) repo.write(path, text);
  if (edit) edit(repo);
  repo.commit(message('Date formats', { tier: SPIKE }), { date: '2026-09-21T12:00:00Z' });
  assert.ok(repo.git(['diff', '--name-only', 'main..HEAD']).split('\n').some((p) => p.startsWith('specs/')), 'the fixture: the branch edits under specs/');
  return repo;
}
const TIER_S = ['not ok', 'the claim is tier S', 'edits the baseline'];

test('#140 item 17 [REC-10][REC-11][HNT-3] a Tier: S claim whose branch changes the text of [TXT-1] is not ok, "the claim is tier S, but main..HEAD edits the baseline", naming TXT-1; it counts, check --strict exits 1', (t) => {
  const repo = spike(t, { 'specs/a.md': file(DATES, TOTALS) }, { 'specs/a.md': file(DATES_CHANGED, TOTALS) });
  const line = hint(check(repo, '--all'), ...TIER_S, 'main..HEAD', 'TXT-1');
  assertCounts(line);
  strict(repo, 1);
});

for (const [label, before, after, edit] of [
  ['only adds an ID to a heading (al spec --add-ids)', { 'specs/a.md': '## Dates\nDates show in ISO 8601.\n' }, {},
    (repo) => ok(runAl(repo.dir, ['spec', '--add-ids', 'specs/a.md', '--prefix', 'TXT', '--yes']), 'add-ids')],
  ['only moves [TXT-1] unchanged from specs/a.md to specs/b.md', { 'specs/a.md': file(DATES, TOTALS), 'specs/b.md': NAMES },
    { 'specs/a.md': TOTALS, 'specs/b.md': file(DATES, NAMES) }],
  ['only adds specs/diagram.txt, a file under the root that is not .md', { 'specs/a.md': file(DATES, TOTALS) },
    { 'specs/diagram.txt': 'invoice -> csv\n' }],
]) {
  test(`#140 item 17 [REC-10][REC-11][HNT-3] contrast: a Tier: S claim whose branch ${label} is not flagged, and check --strict exits 0`, (t) => {
    const repo = spike(t, before, after, edit);
    const out = check(repo, '--all');
    assert.ok(lines(out).some((l) => /^Tier\b/.test(l) && l.includes('S —')), `the fixture: the Tier line holds the tier-S claim:\n${out}`);
    noHint(out, 'not ok', /tier S\b/);
    assert.deepEqual(notOks(out), [], `no not ok:\n${out}`);
    strict(repo, 0);
  });
}

// --- (18) an add in a path that is not a .md file under the root ---

const CSV = '## [INV-1] Export\nCSV MUST be available.\n';
const X1 = '## [X-1] Extra\nThe extra MUST be there.\n';

// Main: the baseline and the signed request export; the branch commits its change.md of `blocks`, serving it.
function served(t, blocks) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', CSV);
  addRequest(repo, 'export', null);
  repo.commit('export: request', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  addRequest(repo, 'export', blocks);
  repo.commit(message('export: change spec', { request: 'export', tier: '2 — export' }), { date: '2026-09-22T12:00:00Z' });
  return repo;
}

for (const path of ['docs/x.md', 'specs/x.txt', 'specs/../x.md']) {
  test(`#140 item 18 [SPC-5][HNT-2][HNT-3] a block "### [X-1]@1 add in ${path}" is not ok in check, naming X-1@1 and [SPC-5], owned by export: it counts, check --strict exits 1`, (t) => {
    const repo = served(t, [block(`[X-1]@1 add in ${path}   for R1`, { now: X1 })]);
    const line = hint(check(repo, '--all'), 'not ok', 'X-1@1', '[SPC-5]');
    assertCounts(line);
    strict(repo, 1);
  });
}

test('#140 item 18 [SPC-5] contrast: "### [X-1]@1 add in specs/x.md" gives no not ok, and check --strict exits 0', (t) => {
  const repo = served(t, [block('[X-1]@1 add in specs/x.md   for R1', { now: X1 })]);
  const out = check(repo, '--all');
  assert.deepEqual(notOks(out), [], `no not ok:\n${out}`);
  strict(repo, 0);
});

// --- (26) a level-only change to the second heading with no ID ---

const NOTES = '## Notes\nFirst notes.\n';
const MORE = '## More notes\nSecond notes.\n';
const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';

// Main: specs/a.md with two headings with no ID, and iso-dates, blocked (no
// sign-off). The branch serves iso-dates and writes `more` in place of MORE.
function secondHeading(t, more) {
  const repo = makeRepo(t);
  repo.write('specs/a.md', file(NOTES, INV1, MORE));
  addRequest(repo, 'iso-dates', null, { org: ORG, signed: false });
  repo.commit('Baseline and iso-dates', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('specs/a.md', file(NOTES, INV1, more));
  repo.commit(message('Notes heading', { request: 'iso-dates', tier: '1 — notes heading' }), { date: '2026-09-22T12:00:00Z' });
  return repo;
}
const BLOCKED_DELIVERY = ['not ok', 'delivers work for', 'iso-dates', /\bblocked\b/];

test('#140 item 26 [SPC-4][REC-6][HNT-3] blocked iso-dates\' branch changes only the # count of the second heading with no ID (## More notes becomes ### More notes): it delivers nothing, no "blocked" not ok, check --strict exits 0', (t) => {
  const repo = secondHeading(t, MORE.replace('## More notes', '### More notes'));
  const out = check(repo, '--all');
  noHint(out, ...BLOCKED_DELIVERY);
  strict(repo, 0);
});

test('#140 item 26 [SPC-4][REC-6] contrast: a body change under the second heading with no ID delivers work for blocked iso-dates: not ok, counting, check --strict exits 1', (t) => {
  const repo = secondHeading(t, MORE.replace('Second notes.', 'Second notes, revised.'));
  assertCounts(hint(check(repo, '--all'), ...BLOCKED_DELIVERY));
  strict(repo, 1);
});
