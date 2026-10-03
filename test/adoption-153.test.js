// Issue #153, findings from adopting AssuredLoop in another repo. Built from
// the issue and the architect's rulings on it (tier 0, no spec change);
// nothing here reads the code under test.
// (1) Pin and version: `al --version` and `al -v` exit 0 from any folder;
//     the first line is `al <version> · <sha7> · <folder>` when the tool's
//     install folder is the top of a git checkout, else `al <version> · not
//     a git checkout: <folder>`; the version is package.json's, `unreleased`
//     while it has none; then the [VW-9] Next and Not known lines. README's
//     Install says how to pin: `node <clone>/bin/al.js` from a clone at the
//     SHA, or `npm install --global <clone>`, which the global `al` then
//     follows; and it names `al --version`.
// (2) An ADR's `Status:` is read anywhere in its header (the lines before
//     its first `##` heading), not only at a line's start, and never in its
//     body [LNK-4]. A hint never offers to add a line the record already has.
//     A header line that changes only in its status text is a status-only
//     edit.
// (3) The note "<code> changed, but its linked tests did not" names at most
//     three tests in the default view, then "and N more; al check --all lists
//     them"; --all names them all [HNT-1]. It says how they are linked:
//     "changed together", directly or through the section ID the code
//     changed together with [LNK-1].
// (4) A change to an ADR file a test is linked to (changed together in an
//     earlier commit) counts as a linked change for the note "<test> changed
//     its assertions (a → b) with no linked code or spec change" [LNK-3]
//     [LNK-4].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, makeRepo, tempDir } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { check, checkHints, hint, kindOf, message, noHint } from './helpers/hints.js';

const notOks = (out) => checkHints(out).filter((l) => kindOf(l) === 'not ok');

// --- (1) pin and version ---

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATE = '2026-09-30T12:00:00Z';

// A copy of the tool (bin/, src/ and package.json) in `dir`, with
// package.json's "version" set to `version` when given; returns its real path.
function toolCopy(dir, { version } = {}) {
  mkdirSync(dir, { recursive: true });
  for (const p of ['bin', 'src', 'package.json']) cpSync(join(ROOT, p), join(dir, p), { recursive: true });
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  assert.equal(pkg.version, undefined, 'the fixture: the repo\'s package.json has no "version" field');
  if (version) writeFileSync(join(dir, 'package.json'), JSON.stringify({ ...pkg, version }, null, 2) + '\n');
  return realpathSync(dir);
}

// The environment without anything that points git at another repo or config.
function env() {
  const e = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) e[k] = v;
  return { ...e, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
}

// `node <copy>/bin/al.js <flag>` run in `cwd`, with `extra` added to the
// environment: exit 0, ending with Next then Not known; its first line.
function version(copy, cwd, flag = '--version', extra = {}) {
  const r = spawnSync(process.execPath, [join(copy, 'bin', 'al.js'), flag], { cwd, env: { ...env(), ...extra }, encoding: 'utf8' });
  const both = `${r.stdout}\n${r.stderr}`;
  assert.equal(r.status, 0, `al ${flag} should exit 0:\n${both}`);
  const ls = lines(r.stdout);
  assert.ok(ls.length >= 3, `al ${flag}: the version line, then Next and Not known:\n${both}`);
  assert.match(ls.at(-2), /^Next/, `second last line should start with Next:\n${r.stdout}`);
  assert.match(ls.at(-1), /^Not known/, `last line should start with Not known:\n${r.stdout}`);
  return ls[0];
}

// A folder that is no git repo, to run from.
function nowhere(t) {
  const dir = join(tempDir(t), 'elsewhere');
  mkdirSync(dir);
  assert.equal(spawnSync('git', ['rev-parse', '--git-dir'], { cwd: dir, env: env() }).status, 128, 'the fixture: the cwd is no git repo');
  return dir;
}

test('#153 (1) al --version and al -v, from a folder that is no git repo, in a copy of the tool that is no git checkout: exit 0, the first line "al unreleased · not a git checkout: <folder>", then Next and Not known', (t) => {
  const copy = toolCopy(join(tempDir(t), 'tool'));
  const cwd = nowhere(t);
  for (const flag of ['--version', '-v']) {
    assert.equal(version(copy, cwd, flag), `al unreleased · not a git checkout: ${copy}`);
  }
});

test('#153 (1) a copy of the tool at the top of a git checkout: al --version and al -v give "al unreleased · <sha7> · <folder>", the copy\'s own commit, from a non-git folder and from another repo', (t) => {
  const copy = toolCopy(join(tempDir(t), 'tool'));
  git(copy, ['init', '-q']);
  git(copy, ['add', '-A']);
  git(copy, ['commit', '-q', '-m', 'The tool'], { date: DATE });
  const sha = git(copy, ['rev-parse', '--short=7', 'HEAD']);
  assert.equal(sha.length, 7, 'the fixture: a 7-character short SHA');
  const other = makeRepo(t);
  for (const cwd of [nowhere(t), other.dir]) {
    for (const flag of ['--version', '-v']) {
      assert.equal(version(copy, cwd, flag), `al unreleased · ${sha} · ${copy}`, `run from ${cwd}`);
    }
  }
});

test('#153 (1b) the caller\'s environment points git at another repo (GIT_DIR; GIT_DIR and GIT_WORK_TREE): al --version on a copy of the tool at the top of its own git checkout still gives the copy\'s own commit and folder', (t) => {
  const copy = toolCopy(join(tempDir(t), 'tool'));
  git(copy, ['init', '-q']);
  git(copy, ['add', '-A']);
  git(copy, ['commit', '-q', '-m', 'The tool'], { date: DATE });
  const sha = git(copy, ['rev-parse', '--short=7', 'HEAD']);
  const other = makeRepo(t);
  const elsewhere = other.git(['rev-parse', '--short=7', 'HEAD']);
  assert.notEqual(elsewhere, sha, 'the fixture: the other repo is at another commit');
  for (const extra of [{ GIT_DIR: join(other.dir, '.git') }, { GIT_DIR: join(other.dir, '.git'), GIT_WORK_TREE: other.dir }]) {
    for (const cwd of [nowhere(t), other.dir]) {
      assert.equal(version(copy, cwd, '--version', extra), `al unreleased · ${sha} · ${copy}`, `run from ${cwd} with ${JSON.stringify(extra)}`);
    }
  }
});

test('#153 (1) a copy of the tool in a subfolder of another git repo (not its top): "al unreleased · not a git checkout: <folder>"', (t) => {
  const outer = makeRepo(t);
  const copy = toolCopy(join(outer.dir, 'tools', 'al'));
  outer.commit('Vendor the tool', { date: DATE });
  assert.equal(git(copy, ['rev-parse', '--show-toplevel']), outer.dir, 'the fixture: the copy is inside the outer repo, below its top');
  assert.equal(version(copy, nowhere(t)), `al unreleased · not a git checkout: ${copy}`);
});

test('#153 (1) a package.json with "version": "1.2.3": the first line is "al 1.2.3 · not a git checkout: <folder>"', (t) => {
  const copy = toolCopy(join(tempDir(t), 'tool'), { version: '1.2.3' });
  assert.equal(version(copy, nowhere(t)), `al 1.2.3 · not a git checkout: ${copy}`);
});

test('#153 (1) README.md\'s Install section says how to pin (node <clone>/bin/al.js, no install), that npm install --global makes the global al follow that clone, and names al --version', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const at = readme.search(/^## Install\s*$/m);
  assert.ok(at >= 0, 'README.md should have an "## Install" section');
  const rest = readme.slice(at + 1);
  const end = rest.search(/^## /m);
  const install = end < 0 ? rest : rest.slice(0, end);
  assert.match(install, /node <[^>\n]+>\/bin\/al\.js/, `Install should say to run node <clone>/bin/al.js:\n${install}`);
  assert.ok(install.includes('npm install --global'), `Install should keep npm install --global:\n${install}`);
  assert.match(install, /\bfollow/, `Install should say the global al follows that clone:\n${install}`);
  assert.ok(install.includes('al --version'), `Install should name al --version:\n${install}`);
});

// --- (2) an ADR's Status: in its header ---

// An ADR whose header (before its first ## heading) holds the lines `header`,
// with `body` as its Context.
const record = (n, title, header, body = '- Customers asked.') =>
  `# ADR ${n}: ${title}\n\n${header}\nDecided by: the owner.\n\n## Context\n\n${body}\n\n## Decision\n\n- ${title}.\n`;
const OLD = 'docs/adr/0001-old-way.md';
const NEW = 'docs/adr/0002-new-way.md';
const OLDER = 'docs/adr/0003-older-way.md';
const oldWay = (header, body) => record('0001', 'Old way', header, body);
const newWay = (extra) => record('0002', 'New way', `Date: 2026-09-20.\nStatus: accepted.\n${extra}`);
const ONE_WAY = /one[- ]way/;

// Main holds `base` ({ path: text }); the branch commits `branch`; check --all.
function adrs(t, base, branch) {
  const repo = makeRepo(t);
  for (const [p, text] of Object.entries(base)) repo.write(p, text);
  repo.commit('Decision records', { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  for (const [p, text] of Object.entries(branch)) repo.write(p, text);
  repo.commit(message('The new way', { tier: '0 — decision records' }), { date: '2026-09-21T12:00:00Z' });
  return check(repo, '--all');
}

test('#153 (2) [LNK-4] a Status: mid-line in the header, "Date: 2026-09-19. Status: superseded by [ADR 0002](0002-new-way.md). Some more words.", is read: 0002 saying "Supersedes: ADR 0001" gives no one-way supersede not ok', (t) => {
  const out = adrs(t, { [OLD]: oldWay('Date: 2026-09-19. Status: superseded by [ADR 0002](0002-new-way.md). Some more words.') },
    { [NEW]: newWay('Supersedes: ADR 0001') });
  noHint(out, 'not ok', ONE_WAY);
});

test('#153 (2) [LNK-4] control: the same header line without its Status text gives the one-way supersede not ok', (t) => {
  const out = adrs(t, { [OLD]: oldWay('Date: 2026-09-19. Some more words.') }, { [NEW]: newWay('Supersedes: ADR 0001') });
  hint(out, 'not ok', ONE_WAY, /\b0001\b/);
});

for (const [where, body, pin] of [
  ['starting a line', 'Status: superseded by ADR 0002.', false],
  ['mid-line', '- Its Status: superseded by ADR 0002, some say.', true],
]) {
  test(`#153 (2) [LNK-4] ${pin ? 'control (pin): ' : ''}a Status: in the body, after the first ## heading (${where}), is not the status: 0002 saying "Supersedes: ADR 0001" still gives the one-way supersede not ok`, (t) => {
    const out = adrs(t, { [OLD]: oldWay('Date: 2026-09-19.', body) }, { [NEW]: newWay('Supersedes: ADR 0001') });
    hint(out, 'not ok', ONE_WAY, /\b0001\b/);
  });
}

test('#153 (2) [LNK-4] 0001 has its own line "Status: accepted." and 0002 says "Supersedes: ADR 0001": the one-way not ok does not offer to add a Status: line; it says to set the existing Status: to superseded by 0002', (t) => {
  const out = adrs(t, { [OLD]: oldWay('Date: 2026-09-19.\nStatus: accepted.') }, { [NEW]: newWay('Supersedes: ADR 0001') });
  const line = hint(out, 'not ok', ONE_WAY, /\b0001\b/);
  assert.ok(!line.includes('add "Status:'), `0001 already has a Status: line; the hint should not offer to add one:\n${line}`);
  assert.ok(line.includes('Status:'), `the hint should name the Status: line to change:\n${line}`);
  assert.match(line, /superseded by\b[^;]*\b0002\b/, `the hint should say superseded by 0002:\n${line}`);
});

test('#153 (2) [LNK-4] 0001 says "Status: superseded by ADR 0002" and 0002 already has "Supersedes: ADR 0003" (0003 superseded by 0002): the one-way not ok does not offer to add a Supersedes: line', (t) => {
  const out = adrs(t, {
    [OLD]: oldWay('Date: 2026-09-19.\nStatus: superseded by ADR 0002.'),
    [OLDER]: record('0003', 'Older way', 'Date: 2026-09-18.\nStatus: superseded by ADR 0002.'),
  }, { [NEW]: newWay('Supersedes: ADR 0003') });
  const line = hint(out, 'not ok', ONE_WAY, /\b0001\b/);
  assert.ok(!line.includes('add "Supersedes:'), `0002 already has a Supersedes: line; the hint should not offer to add one:\n${line}`);
  assert.ok(line.includes('Supersedes:'), `the hint should name the Supersedes: line to change:\n${line}`);
  noHint(out, 'not ok', /\b0003\b/);
});

// 0001 accepted at the base with the header line `Date: 2026-09-19. Status:
// accepted`; on the branch that line becomes `line`, and 0002 supersedes it.
const ACCEPTED = 'Date: 2026-09-19. Status: accepted';
const statusEdit = (t, line, body) => adrs(t, { [OLD]: oldWay(ACCEPTED) }, { [OLD]: oldWay(line, body), [NEW]: newWay('Supersedes: ADR 0001') });

test('#153 (2) [LNK-4] an accepted ADR whose header line "Date: 2026-09-19. Status: accepted" changes only in its status text, to "… Status: superseded by ADR 0002", with 0002 superseding it: no not ok (no "edited beyond its Status line", no one-way link)', (t) => {
  const out = statusEdit(t, 'Date: 2026-09-19. Status: superseded by ADR 0002');
  noHint(out, 'not ok', 'edited beyond its Status line');
  assert.deepEqual(notOks(out), [], `no not ok:\n${out}`);
});

for (const [label, line, body] of [
  ['the Date on that line changes too', 'Date: 2026-09-18. Status: superseded by ADR 0002', undefined],
  ['a body line changes too', 'Date: 2026-09-19. Status: superseded by ADR 0002', '- Customers asked, twice.'],
]) {
  test(`#153 (2) [LNK-4] the same status edit where ${label}: not ok, edited beyond its Status line, naming 0001`, (t) => {
    hint(statusEdit(t, line, body), 'not ok', 'edited beyond its Status line', /\b0001\b/);
  });
}

// 0001 accepted at the base with one header line holding the date, the
// status and who decided; on the branch that line becomes `line`.
const ONE_LINE = 'Date: 2026-09-19. Status: accepted. Decided by: the owner.';
const sentenceEdit = (t, line) => adrs(t, { [OLD]: oldWay(ONE_LINE) }, { [OLD]: oldWay(line), [NEW]: newWay('Supersedes: ADR 0001') });

test('#153 (2b) [LNK-4] the status text ends with its sentence: "Date: 2026-09-19. Status: accepted. Decided by: the owner." becoming "… Status: superseded by ADR 0002. Decided by: the agent." is not ok, edited beyond its Status line, naming 0001', (t) => {
  hint(sentenceEdit(t, 'Date: 2026-09-19. Status: superseded by ADR 0002. Decided by: the agent.'), 'not ok', 'edited beyond its Status line', /\b0001\b/);
});

test('#153 (2b) [LNK-4] control: the same line with only its status changed, "… Status: superseded by ADR 0002. Decided by: the owner.", gives no "edited beyond its Status line" and no not ok', (t) => {
  const out = sentenceEdit(t, 'Date: 2026-09-19. Status: superseded by ADR 0002. Decided by: the owner.');
  noHint(out, 'not ok', 'edited beyond its Status line');
  assert.deepEqual(notOks(out), [], `no not ok:\n${out}`);
});

// --- (3) "<code> changed, but its linked tests did not" ---

const NOTE = 'changed, but its linked tests did not';
const TEST_PATH = /\btest\/[\w.-]+\.test\.js\b/g;
// A node:test file: one test called `name` with `n` assert.equal lines.
const jsTest = (name, n = 1) => ["import { test } from 'node:test';", "import assert from 'node:assert/strict';", '',
  `test('${name}', () => {`, ...Array.from({ length: n }, (_, i) => `  assert.equal(${i}, ${i});`), '});'].join('\n') + '\n';
const shapes = (n) => Array.from({ length: n }, (_, i) => `test/shape-${i + 1}.test.js`);

// Main: src/area.js and the tests `tests` added in one commit; the branch
// changes src/area.js only.
function together(t, tests) {
  const repo = makeRepo(t);
  repo.write('src/area.js', 'export const area = (w, h) => w * h;\n');
  tests.forEach((p, i) => repo.write(p, jsTest(`shape ${i + 1}`)));
  repo.commit('Area and its tests', { date: '2026-09-02T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('src/area.js', 'export const area = (w, h) => Math.abs(w * h);\n');
  repo.commit(message('Area is never negative', { tier: '0 — area' }), { date: '2026-09-21T12:00:00Z' });
  return repo;
}
const named = (line) => [...new Set(line.match(TEST_PATH) ?? [])];

test('#153 (3) [HNT-1] src/area.js changed with 8 linked tests that did not: al check names at most 3, then "and N more; al check --all lists them" (N = 8 minus those named); al check --all names all 8 and has no "more"', (t) => {
  const tests = shapes(8);
  const repo = together(t, tests);
  const line = hint(check(repo), 'note', NOTE, 'src/area.js');
  const shown = named(line);
  assert.ok(shown.length >= 1 && shown.length <= 3, `the default view names one to three tests, got ${shown.length}:\n${line}`);
  for (const p of shown) assert.ok(tests.includes(p), `${p} is one of the linked tests:\n${line}`);
  assert.ok(line.includes(`and ${8 - shown.length} more; al check --all lists them`), `the note should say "and ${8 - shown.length} more; al check --all lists them":\n${line}`);

  const all = hint(check(repo, '--all'), 'note', NOTE, 'src/area.js');
  assert.deepEqual(named(all).sort(), [...tests].sort(), `--all names all 8:\n${all}`);
  assert.doesNotMatch(all, /\bmore\b/, `--all has no "more":\n${all}`);
});

test('#153 (3) [HNT-1] control: with 3 linked tests, al check names all three and has no "more"', (t) => {
  const tests = shapes(3);
  const line = hint(check(together(t, tests)), 'note', NOTE, 'src/area.js');
  assert.deepEqual(named(line).sort(), [...tests].sort(), line);
  assert.doesNotMatch(line, /\bmore\b/, line);
});

test('#153 (3) [LNK-1] linked by being changed together in an earlier commit: the note says "changed together"', (t) => {
  const line = hint(check(together(t, shapes(2))), 'note', NOTE, 'src/area.js');
  assert.ok(line.includes('changed together'), `the note should say how the tests are linked, "changed together":\n${line}`);
});

test('#153 (3) [LNK-1] linked through a section ID: README.md changed together with "## [DOC-1] Readme rules" in an earlier commit, the tests name [DOC-1]: the note names [DOC-1] and says "changed together"', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/docs.md', '## [DOC-1] Readme rules\nThe readme MUST say how to install.\n');
  repo.write('README.md', 'fixture\n\nInstall with git clone.\n');
  repo.commit('Readme rules', { date: '2026-09-01T12:00:00Z' });
  repo.write('test/install-doc.test.js', jsTest('[DOC-1] says how to install'));
  repo.write('test/usage-doc.test.js', jsTest('[DOC-1] says how to use it'));
  repo.commit('Tests of the readme rules', { date: '2026-09-02T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('README.md', 'fixture\n\nInstall with git clone, then npm install.\n');
  repo.commit(message('Install', { tier: '0 — install words' }), { date: '2026-09-21T12:00:00Z' });
  const line = hint(check(repo), 'note', NOTE, 'README.md');
  assert.ok(line.includes('[DOC-1]'), `the note should name the section the link goes through, [DOC-1]:\n${line}`);
  assert.ok(line.includes('changed together'), `the note should say how README.md reaches [DOC-1], "changed together":\n${line}`);
});

// --- (4) an assertion change beside a change to a linked ADR ---

const CHANGED = 'changed its assertions';
const HISTORY = 'test/decision-history.test.js';
const KEEP = 'docs/adr/0001-keep-records.md';
const ZONES = 'docs/adr/0002-time-zones.md';
const keep = (d) => record('0001', 'Keep records', 'Date: 2026-09-01.\nStatus: proposed.', `- ${d}`);
const zones = (d) => record('0002', 'Time zones', 'Date: 2026-09-01.\nStatus: proposed.', `- ${d}`);

// Main: the test and 0001 added in one commit; 0002 in a commit of its own.
// The branch changes the test (2 → 3 assertions) in one commit, then each ADR
// of `adrsChanged` in a commit of its own; check --all.
function assertions(t, adrsChanged) {
  const repo = makeRepo(t);
  repo.write(HISTORY, jsTest('decision records keep their history', 2));
  repo.write(KEEP, keep('Records get lost.'));
  const c = repo.commit('Decision records and their test', { date: '2026-09-01T12:00:00Z' });
  assert.deepEqual(repo.git(['show', '--name-only', '--format=', c]).split('\n').sort(), [KEEP, HISTORY].sort(), 'the fixture: the test and 0001 changed together');
  repo.write(ZONES, zones('Dates lack a zone.'));
  repo.commit('Time zones', { date: '2026-09-02T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write(HISTORY, jsTest('decision records keep their history', 3));
  repo.commit(message('One more check', { tier: '0 — records' }), { date: '2026-09-21T12:00:00Z' });
  adrsChanged.forEach((p, i) => {
    repo.write(p, p === KEEP ? keep('Records get lost, and nobody knows why.') : zones('Dates lack a zone, and a day.'));
    repo.commit(message(`Change ${p}`, { tier: '0 — records' }), { date: `2026-09-2${i + 2}T12:00:00Z` });
  });
  const out = check(repo, '--all');
  assert.ok(lines(out).some((l) => l.includes(HISTORY) && l.includes('2 → 3')), `the fixture: the test's assertions went 2 → 3:\n${out}`);
  return out;
}

test('#153 (4) [LNK-3][LNK-4] a test whose assertions changed beside a change to an ADR it changed together with in an earlier commit: no "changed its assertions … with no linked code or spec change" note', (t) => {
  noHint(assertions(t, [KEEP]), HISTORY, CHANGED);
});

test('#153 (4) [LNK-3] control: the same branch without the ADR change gives the note', (t) => {
  hint(assertions(t, []), 'note', HISTORY, CHANGED, 'no linked code or spec change');
});

test('#153 (4) [LNK-4] control: a change to an ADR the test is not linked to (never changed together, no shared ID, another stem) leaves the note', (t) => {
  hint(assertions(t, [ZONES]), 'note', HISTORY, CHANGED, 'no linked code or spec change');
});
