// #99 (kb-search/R10; light-design LD-32, LD-45, LD-64; LD-37 "a fresh
// setup with own, local and none"): `al search` follows the `search` setting
// of .assuredloop/config.yaml.
// - No setting (LD-64): exit 0; it searches and indexes nothing, and gives
//   the computer, the project, the choices with what each costs here, the
//   measured table (each of its 42 rows named once: fits, not fit, not yet or
//   excluded), its limits, and the recommendation. --full gives each row on
//   its own line; --json gives one object with all 42 rows.
// - The fit rule and the recommendation on fake computers (a preload and a
//   fake vm_stat, helpers/kb-search.js): memory, disk and the Apple GPU.
// - `own` and `none`: exit 0, no hits, nothing indexed, and what to do.
// - A wrong form, an unknown row, a row this version cannot run yet, and an
//   excluded row: exit 2 with an `al: ` line.
// Built from the issue and the public interface only; nothing here reads src/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { git, tree, writeYaml, readYaml } from './helpers/project.js';
import {
  ROW, callsOf, embedded, installEmbedder, run, runOk, runRefused, show, smallRepo,
} from './helpers/search.js';
import {
  ALL_ROWS, BIG_MAC, EXCLUDED, FULL_DISK, INTEL_MAC, LINUX, NOT_YET, NO_MEMORY, RUNNABLE, SMALL_MAC,
  fakeComputer, labelled, namedIn, needsGpu, noChoice,
} from './helpers/kb-search.js';

const SEARCH_LINE = 'Search    no choice is set: al search searches nothing until .assuredloop/config.yaml sets search (LD-64)';
const OWN_CHOICE = "Choice    own: the team's knowledge base, an MCP server or a skill; al export gives it al's rows; al does not search";
const LOCAL_CHOICE = /^Choice    local: word search \(SQLite FTS5\); no download; first index about \d+ s \(estimate from the measured word-index speed\); recall@10 0\.335 \[0\.25-0\.42\]$/;
const MODEL_CHOICE = /^Choice    local with a model: word search and one row of the measured table; the (\d+) rows? that fits? this computer:$/;
const NOT_FIT = /^Not fit   (\d+) rows? needs? more than this computer has: \S/;
const NOT_YET_LINE = /^Not yet   26 rows this version cannot run yet \(#100: the llama\.cpp runtime and reranking\): \S/;
const EXCLUDED_LINE = /^Excluded  5 rows: \S/;
const NONE_CHOICE = 'Choice    none: no search; the agent reads the files (grep)';
const LIMITS = 'Limits    measured for issue #28 on one Mac (Apple M5 Pro, 64 GB, macOS), 2026-10-21 to 2026-10-23; 50 questions from one repo;';
const RECOMMEND = 'Recommend local: of the rows that this al can run and that fit this computer, none has a gain whose interval is above zero; 12 rows that this version cannot run yet have one (al search --full)';
const SET_IT = 'Set it    write one line in .assuredloop/config.yaml and commit it: search: local · search: {local: <row>} · search: {own: <name>} · search: none';
const NEXT = 'Next      write the search line in .assuredloop/config.yaml, commit it, then al search <words>';
const PROJECT = /^Project   (\d+) paragraphs to embed, about (\d+) tokens \(estimate: bytes \/ 4\) · (\d+) files in (\d+) repo\(s\)$/;
const NOT_A_CHOICE = /^al: \.assuredloop\/config\.yaml: search: (.+) is not a choice; give none, local, \{local: <row>\} or \{own: <name>\}$/m;
const HIT = /^\s*\d+\. /;

// The search index folder, by git.
const indexDir = (dir) => resolve(dir, git(dir, 'rev-parse', '--git-path', 'assuredloop'));

// smallRepo with no setting (or the one given), the stand-in installed with
// its logs, and a fake computer in the git dir.
function fresh(t, { setting = null, computer = BIG_MAC } = {}) {
  const { dir } = smallRepo(t, { search: setting });
  const log = join(dir, '.git', 'embed-test.log');
  const calls = join(dir, '.git', 'embed-calls.log');
  installEmbedder(dir, { log, calls });
  const pc = fakeComputer(join(dir, '.git', 'fake-computer'), computer);
  const opts = { nodeArgs: pc.nodeArgs, env: pc.env };
  return { dir, log, calls, pc, opts };
}

// Nothing indexed, nothing embedded, the library never called, nothing written.
function searchedNothing(f, before) {
  assert.ok(!existsSync(indexDir(f.dir)), `no index folder at ${indexDir(f.dir)}`);
  assert.deepEqual(embedded(f.log), [], 'nothing was embedded');
  assert.deepEqual(callsOf(f.calls), [], 'the library\'s pipeline was not called');
  assert.deepEqual(tree(f.dir), before, 'nothing was written in the working tree');
}

const jsonOf = (r) => {
  try { return JSON.parse(r.stdout); } catch { return assert.fail(`--json gives one JSON object:\n${show(r)}`); }
};

// The rows of --json by name.
function jsonRows(out) {
  assert.ok(Array.isArray(out.rows), `rows is a list: ${JSON.stringify(out).slice(0, 400)}`);
  return new Map(out.rows.map((r) => [r.name, r]));
}

// The fit rule, checked against the Computer line and the --json states.
function fitRule(o, rowsByName, pc) {
  assert.equal(o.computer.memory, pc.memory, `the Computer line gives the available memory of the fake computer (${pc.memory} GB)`);
  assert.equal(o.computer.disk, Math.round(pc.disk * 10) / 10, `the Computer line gives the free disk of the fake computer (${pc.disk} GB)`);
  assert.equal(o.computer.gpu, pc.gpu, `Apple GPU ${pc.gpu ? 'yes' : 'no'}`);
  for (const f of o.fit) {
    assert.ok(RUNNABLE.includes(f.row), `${f.row}: only a row this version runs is in the fit list`);
    assert.ok(f.memory + 1 <= o.computer.memory + 0.1, `${f.row}: its memory ${f.memory} GB + 1 GB fits ${o.computer.memory} GB`);
    assert.ok(f.download / 1000 <= o.computer.disk + 0.1, `${f.row}: its download ${f.download} MB fits ${o.computer.disk} GB of free disk`);
    if (!pc.gpu) assert.ok(!needsGpu(f.row), `${f.row} needs an Apple GPU, and this computer has none`);
    assert.equal(rowsByName.get(f.row)?.state, 'fits', `${f.row}: --json says fits`);
  }
  const fitNames = o.fit.map((f) => f.row);
  for (const row of RUNNABLE) {
    const state = rowsByName.get(row)?.state;
    assert.ok(['fits', 'not-fit'].includes(state), `${row}: a row this version runs fits or does not: ${state}`);
    if (state === 'fits') assert.ok(fitNames.includes(row), `${row} fits (--json), so the fit list names it`);
    else {
      assert.ok(!fitNames.includes(row), `${row} does not fit, so the fit list does not name it`);
      assert.ok(o.notFit && namedIn(o.notFit.text, row), `${row} is named in the Not fit line:\n${o.notFit?.line}`);
    }
  }
  if (o.notFit === null) assert.ok(RUNNABLE.every((r) => fitNames.includes(r)), 'no Not fit line only when every row fits');
  else {
    const m = o.notFit.line.match(NOT_FIT);
    assert.ok(m, `the Not fit line in the documented form:\n${o.notFit.line}`);
    assert.equal(Number(m[1]), RUNNABLE.filter((r) => rowsByName.get(r)?.state === 'not-fit').length, 'the count of the rows that do not fit');
  }
}

// --- no setting

test('#99 no setting: al search <words> exits 0, gives the documented lines in order, and searches and indexes nothing', (t) => {
  const f = fresh(t);
  const before = tree(f.dir);
  const r = runOk(f.dir, ['search', 'export', 'link'], f.opts);
  const o = noChoice(r.stdout);
  const expected = ['Search', 'Computer', 'Project', 'Choice', 'Choice', 'Choice', ...(o.notFit ? ['Not fit'] : []),
    'Not yet', 'Excluded', 'Choice', 'Limits', 'Recommend', 'Set it', 'Read', 'Next', 'Not known'];
  assert.deepEqual(o.labels, expected, `the lines in the documented order:\n${show(r)}`);
  const line = (i) => o.ls[i].line;
  assert.equal(line(0), SEARCH_LINE, show(r));
  assert.equal(line(3), OWN_CHOICE, show(r));
  assert.match(line(4), LOCAL_CHOICE, show(r));
  const m = line(5).match(MODEL_CHOICE);
  assert.ok(m, `the Choice line of a local model:\n${show(r)}`);
  assert.equal(Number(m[1]), o.fit.length, 'the count is the number of fit row lines');
  const after = o.ls.slice(6 + (o.notFit ? 1 : 0));
  assert.match(after[0].line, NOT_YET_LINE, show(r));
  assert.match(after[1].line, EXCLUDED_LINE, show(r));
  assert.equal(after[2].line, NONE_CHOICE, show(r));
  assert.ok(after[3].line.startsWith(LIMITS), `the Limits line starts "${LIMITS}":\n${show(r)}`);
  const limits = [after[3].line, ...after[3].more].join(' ');
  assert.ok(limits.includes('sizes in MB and GB of 10^6 and 10^9 bytes'), `the Limits line says the units:\n${limits}`);
  assert.ok(limits.includes('available memory changes from moment to moment'), `the Limits line says that memory changes:\n${limits}`);
  assert.equal(after[4].line, RECOMMEND, show(r));
  assert.equal(after[5].line, SET_IT, show(r));
  assert.match(after[6].line, /^Read {6}\S/, show(r));
  assert.equal(after[7].line, NEXT, show(r));
  assert.match(after[8].line, /^Not known \S/, show(r));
  assert.ok(!r.stdout.split('\n').some((l) => HIT.test(l)), `no hit:\n${show(r)}`);
  assert.ok(!/^Level\b/m.test(r.stdout), `no Level line: nothing was searched:\n${show(r)}`);
  searchedNothing(f, before);
});

test('#99 no setting: the known figures of word search and of bge-small-en-v1.5 q8 tjs-cpu', (t) => {
  const f = fresh(t);
  const o = noChoice(runOk(f.dir, ['search', 'export', 'link'], f.opts).stdout);
  const q8 = o.fit.find((x) => x.row === ROW);
  assert.ok(q8, `${ROW} fits a Mac with 64 GB and 500 GB free:\n${(o.withModel?.more ?? []).join('\n')}`);
  assert.equal(q8.download, 34, q8.line);
  assert.equal(q8.recall, '0.340', q8.line);
  assert.deepEqual(q8.interval, ['0.26', '0.42'], q8.line);
  assert.equal(q8.gain, '+0.004', q8.line);
  assert.deepEqual(q8.gainInterval, ['-0.053', '+0.062'], q8.line);
});

test('#99 no setting: each of the 42 rows is named in its place, and none is left out; --json has all 42 with their states', (t) => {
  for (const computer of [BIG_MAC, SMALL_MAC, LINUX]) {
    const f = fresh(t, { computer });
    const r = runOk(f.dir, ['search', 'export', 'link'], f.opts);
    const o = noChoice(r.stdout);
    const out = jsonOf(runOk(f.dir, ['search', 'export', 'link', '--json'], f.opts));
    const byName = jsonRows(out);
    assert.equal(out.rows.length, 42, `rows has all 42, never grouped: ${out.rows.length}`);
    assert.deepEqual([...byName.keys()].sort(), [...ALL_ROWS].sort(), 'the names of the 42 rows');
    for (const row of NOT_YET) {
      assert.equal(byName.get(row).state, 'not-yet', row);
      assert.ok(namedIn(o.notYet.text, row), `${row} is named in the Not yet line:\n${o.notYet.line}`);
      assert.ok(!o.fit.some((x) => x.row === row), `${row} is not in the fit list`);
    }
    for (const [row, reason] of Object.entries(EXCLUDED)) {
      assert.equal(byName.get(row).state, 'excluded', row);
      assert.match(String(byName.get(row).reason), reason, `${row}: its reason in --json`);
      assert.ok(namedIn(o.excluded.text, row), `${row} is named in the Excluded line:\n${o.excluded.line}`);
      assert.ok(!o.fit.some((x) => x.row === row), `${row} is not in the fit list`);
    }
    assert.match(o.excluded.text, /drift/i, 'the Excluded line gives the drift reason');
    assert.match(o.excluded.text, /NaN/, 'the Excluded line gives the NaN reason');
    assert.match(o.excluded.text, /EmbeddingGemma/, 'the Excluded line gives the EmbeddingGemma reason');
    for (const row of out.rows) {
      assert.ok(['fits', 'not-fit', 'not-yet', 'excluded'].includes(row.state), `${row.name}: state ${row.state}`);
      if (row.state !== 'fits') assert.ok(typeof row.reason === 'string' && row.reason.length > 0, `${row.name}: a reason`);
    }
    fitRule(o, byName, f.pc);
  }
});

test('#99 no setting: --json is one object with setting null, the computer, the project, 42 rows, the limits, the recommendation and no hits', (t) => {
  const f = fresh(t);
  const before = tree(f.dir);
  const out = jsonOf(runOk(f.dir, ['search', 'export', 'link', '--json'], f.opts));
  for (const k of ['setting', 'computer', 'project', 'rows', 'limits', 'recommend', 'hits']) assert.ok(Object.hasOwn(out, k), `--json has ${k}`);
  assert.equal(out.setting, null);
  assert.equal(typeof out.computer, 'object');
  assert.equal(typeof out.project, 'object');
  assert.ok(Array.isArray(out.limits) && out.limits.length > 0, 'limits is a list of texts');
  assert.deepEqual(out.hits, []);
  assert.equal(out.recommend?.choice, 'local');
  assert.equal(out.recommend?.row, null);
  assert.ok(typeof out.recommend?.reason === 'string' && out.recommend.reason.length > 0, 'the recommendation gives its reason');
  assert.equal(out.rows.length, 42);
  searchedNothing(f, before);
});

test('#99 no setting: --full gives each of the 42 rows on its own line, with the reason of its group', (t) => {
  const f = fresh(t, { computer: SMALL_MAC });
  const r = runOk(f.dir, ['search', 'export', 'link', '--full'], f.opts);
  const ls = r.stdout.split('\n');
  const byName = jsonRows(jsonOf(runOk(f.dir, ['search', 'export', 'link', '--full', '--json'], f.opts)));
  for (const row of ALL_ROWS) {
    const mine = ls.filter((l) => l.includes(row));
    assert.ok(mine.length > 0, `${row} has its own line in --full:\n${show(r)}`);
    const text = mine.join('\n');
    const state = byName.get(row)?.state;
    if (state === 'excluded') assert.match(text, EXCLUDED[row], `${row}: its reason`);
    if (state === 'not-yet') assert.match(text, /#100|cannot run/, `${row}: this version cannot run it yet`);
    if (state === 'not-fit') assert.match(text, /memory|disk|GPU/i, `${row}: what does not fit`);
    if (state === 'fits') assert.match(text, /download \d+ MB/, `${row}: its figures`);
  }
  assert.equal(byName.get('bge-small-en-v1.5 fp32 tjs-coreml')?.state, 'not-fit', 'the fixture: 16 GB does not fit the CoreML row');
});

test('#99 no setting: the Project line counts the paragraphs to embed and the tracked files', (t) => {
  const f = fresh(t);
  const r = runOk(f.dir, ['search', 'export', 'link'], f.opts);
  const line = labelled(r.stdout).find((l) => l.label === 'Project');
  const m = line?.line.match(PROJECT);
  assert.ok(m, `the Project line in the documented form:\n${show(r)}`);
  // specs/exports.md has EXP-1 to EXP-5; the open request links has SP-1 and SP-2.
  assert.equal(Number(m[1]), 7, 'paragraphs with a marker in the configured doc and the open request\'s spec.md');
  assert.ok(Number(m[2]) > 0, 'some tokens');
  const files = git(f.dir, 'ls-tree', '-r', '--name-only', 'HEAD').split('\n').filter(Boolean).length;
  assert.equal(Number(m[3]), files, 'the files that git tracks at the selected commit');
  assert.equal(Number(m[4]), 1, 'one repo');
});

test('#99 no setting: --id gives no row either, and indexes nothing', (t) => {
  const f = fresh(t);
  const before = tree(f.dir);
  const r = runOk(f.dir, ['search', '--id', 'EXP-4'], f.opts);
  assert.equal(r.stdout.split('\n')[0], SEARCH_LINE, show(r));
  assert.ok(!r.stdout.split('\n').some((l) => HIT.test(l)), `no hit:\n${show(r)}`);
  const out = jsonOf(runOk(f.dir, ['search', '--id', 'EXP-4', '--json'], f.opts));
  assert.deepEqual(out.hits, []);
  assert.equal(out.setting, null);
  searchedNothing(f, before);
});

// --- the fit rule and the recommendation on several computers

const COMPUTERS = [
  ['a Mac with 64 GB and an Apple GPU', BIG_MAC],
  ['a Mac with 16 GB', SMALL_MAC],
  ['an Intel Mac (no Apple GPU)', INTEL_MAC],
  ['a Linux computer (no Apple GPU)', LINUX],
  ['a full disk', FULL_DISK],
  ['half a GB of memory', NO_MEMORY],
];
for (const [name, computer] of COMPUTERS) {
  test(`#99 no setting, ${name}: the rows that fit follow the fit rule, and the recommendation is local`, (t) => {
    const f = fresh(t, { computer });
    const r = runOk(f.dir, ['search', 'export', 'link'], f.opts);
    const o = noChoice(r.stdout);
    const out = jsonOf(runOk(f.dir, ['search', 'export', 'link', '--json'], f.opts));
    fitRule(o, jsonRows(out), f.pc);
    assert.ok(r.stdout.split('\n').includes(RECOMMEND), `the recommendation is local:\n${show(r)}`);
    assert.deepEqual([out.recommend?.choice, out.recommend?.row], ['local', null]);
    assert.ok(!/^Recommend\s+(own|none)\b/m.test(r.stdout), 'al never recommends own or none');
  });
}

test('#99 the fit rule: the CoreML row (about 28.1 GB) fits 64 GB with an Apple GPU, not 16 GB; the GPU rows need an Apple GPU; a full disk or too little memory fits no row', (t) => {
  const coreml = 'bge-small-en-v1.5 fp32 tjs-coreml';
  const states = (computer) => {
    const f = fresh(t, { computer });
    const r = runOk(f.dir, ['search', 'export', 'link'], f.opts);
    return { o: noChoice(r.stdout), rows: jsonRows(jsonOf(runOk(f.dir, ['search', 'export', 'link', '--json'], f.opts))), r };
  };
  const big = states(BIG_MAC);
  assert.equal(big.rows.get(coreml).state, 'fits', show(big.r));
  const line = big.o.fit.find((x) => x.row === coreml);
  assert.ok(line && line.memory >= 27.5 && line.memory <= 28.7, `about 28.1 GB of memory: ${line?.line}`);
  const small = states(SMALL_MAC);
  assert.equal(small.rows.get(coreml).state, 'not-fit', show(small.r));
  assert.match(small.o.notFit.line, /memory/i, `the Not fit line says what does not fit:\n${small.o.notFit.line}`);
  for (const computer of [INTEL_MAC, LINUX]) {
    const s = states(computer);
    for (const row of RUNNABLE.filter(needsGpu)) assert.equal(s.rows.get(row).state, 'not-fit', `${row} needs an Apple GPU`);
    assert.match(s.o.notFit.line, /GPU/, `the Not fit line says that the GPU is missing:\n${s.o.notFit.line}`);
    for (const row of RUNNABLE.filter((x) => !needsGpu(x) && x !== coreml)) {
      assert.equal(s.rows.get(row).state, 'fits', `${row} needs no GPU, and 64 GB and 500 GB fit it`);
    }
  }
  const disk = states(FULL_DISK);
  for (const row of RUNNABLE) assert.equal(disk.rows.get(row).state, 'not-fit', `${row}: 5 MB of free disk fits no download`);
  assert.match(disk.o.notFit.line, /disk/i, disk.o.notFit.line);
  const memory = states(NO_MEMORY);
  for (const row of RUNNABLE) assert.equal(memory.rows.get(row).state, 'not-fit', `${row}: half a GB is less than 1 GB more than any row needs`);
  assert.match(memory.o.notFit.line, /memory/i, memory.o.notFit.line);
});

test('#99 no setting, no node:sqlite: the Computer line says so, and the recommendation is still local', (t) => {
  const f = fresh(t);
  const nodeArgs = [...f.opts.nodeArgs, '--no-experimental-sqlite'];
  const r = runOk(f.dir, ['search', 'export', 'link'], { ...f.opts, nodeArgs });
  const o = noChoice(r.stdout);
  assert.equal(o.computer.fts5, false, show(r));
  assert.match(r.stdout, /^Recommend local\b/m, show(r));
});

// --- own and none

test('#99 search: {own: team-kb}: exit 0, no hits, nothing indexed; it names the knowledge base and says to ask it', (t) => {
  const f = fresh(t, { setting: { own: 'team-kb' } });
  const before = tree(f.dir);
  const r = runOk(f.dir, ['search', 'export', 'link'], f.opts);
  const ls = r.stdout.split('\n');
  assert.ok(ls.includes('Search    own: team-kb; al does not search here; ask team-kb'), show(r));
  assert.ok(ls.includes("Next      ask team-kb; al export gives it al's rows"), show(r));
  assert.ok(!ls.some((l) => HIT.test(l)), `no hit:\n${show(r)}`);
  const id = runOk(f.dir, ['search', '--id', 'EXP-4'], f.opts);
  assert.ok(!id.stdout.split('\n').some((l) => HIT.test(l)), `--id gives no row:\n${show(id)}`);
  const next = id.stdout.split('\n').find((l) => l.startsWith('Next      '));
  assert.ok(next && next.includes('al context EXP-4'), `Next names al context EXP-4:\n${show(id)}`);
  searchedNothing(f, before);
});

test('#99 search: none: exit 0, no hits, nothing indexed; it says to read the files', (t) => {
  const f = fresh(t, { setting: 'none' });
  const before = tree(f.dir);
  const r = runOk(f.dir, ['search', 'export', 'link'], f.opts);
  const ls = r.stdout.split('\n');
  assert.ok(ls.includes('Search    none: this project uses no search; read the files (grep)'), show(r));
  assert.ok(ls.includes('Next      grep the files; for one ID, al context <ID>'), show(r));
  assert.ok(!ls.some((l) => HIT.test(l)), `no hit:\n${show(r)}`);
  const id = runOk(f.dir, ['search', '--id', 'EXP-4'], f.opts);
  assert.ok(!id.stdout.split('\n').some((l) => HIT.test(l)), `--id gives no row:\n${show(id)}`);
  searchedNothing(f, before);
});

// --- wrong forms

// Sets `search` in the committed config of a fresh repo.
function withSetting(t, value) {
  const f = fresh(t, { setting: value });
  assert.deepEqual(readYaml(f.dir, '.assuredloop/config.yaml').search, value, 'the fixture: the setting is in the config');
  return f;
}

for (const [name, value, shown] of [
  ['a bare own', 'own', 'own'],
  ['a number', 3, '3'],
  ['a list', ['local'], null],
  ['a map with another key', { remote: 'team-kb' }, null],
  ['a map with two keys', { local: ROW, own: 'team-kb' }, null],
]) {
  test(`#99 search: ${JSON.stringify(value)} (${name}) is not a choice: al search exits 2 with the al: line`, (t) => {
    const f = withSetting(t, value);
    const before = tree(f.dir);
    const r = runRefused(f.dir, ['search', 'export', 'link'], f.opts);
    const m = r.stdout.match(NOT_A_CHOICE);
    assert.ok(m, `the al: line names the file and the four choices:\n${show(r)}`);
    if (shown) assert.equal(m[1], shown, 'the al: line gives the value');
    searchedNothing(f, before);
  });
}

for (const row of ['all-minilm-l6-v2 fp32 tjs-cpu', 'BGE-small-en-v1.5 q8 tjs-cpu', 'bge-small-en-v1.5 q8']) {
  test(`#99 search: {local: ${row}} names no measured row: al search exits 2 and lists the 11 rows this version runs`, (t) => {
    const f = withSetting(t, { local: row });
    const before = tree(f.dir);
    const r = runRefused(f.dir, ['search', 'export', 'link'], f.opts);
    const al = r.stdout.split('\n').find((l) => l.startsWith('al: '));
    assert.match(al, /no measured row/, show(r));
    for (const x of RUNNABLE) assert.ok(namedIn(r.stdout, x), `${x} is listed:\n${show(r)}`);
    searchedNothing(f, before);
  });
}

for (const row of ['qwen3-embedding-4b q8_0 llama-metal', 'ms-marco-minilm-l-6-v2 q8 tjs-cpu', 'qwen3-reranker-0.6b q4 tjs-cpu']) {
  test(`#99 search: {local: ${row}} is a row this version cannot run yet: al search exits 2 and names #100`, (t) => {
    const f = withSetting(t, { local: row });
    const before = tree(f.dir);
    const r = runRefused(f.dir, ['search', 'export', 'link'], f.opts);
    const al = r.stdout.split('\n').find((l) => l.startsWith('al: '));
    assert.ok(al.includes(`this version cannot run ${row} yet`), show(r));
    assert.ok(al.includes('#100'), show(r));
    searchedNothing(f, before);
  });
}

for (const [row, reason] of Object.entries(EXCLUDED)) {
  test(`#99 search: {local: ${row}} is an excluded row: al search exits 2 with its reason`, (t) => {
    const f = withSetting(t, { local: row });
    const before = tree(f.dir);
    const r = runRefused(f.dir, ['search', 'export', 'link'], f.opts);
    const al = r.stdout.split('\n').find((l) => l.startsWith('al: '));
    assert.ok(al.includes(`${row} is excluded`), show(r));
    assert.match(al, reason, show(r));
    searchedNothing(f, before);
  });
}

test('#99 the setting is read as written: a wrong form refuses al search, and the right form in its place answers', (t) => {
  const f = withSetting(t, 'own');
  runRefused(f.dir, ['search', 'export', 'link'], f.opts);
  const cfg = readYaml(f.dir, '.assuredloop/config.yaml');
  writeYaml(f.dir, '.assuredloop/config.yaml', { ...cfg, search: 'local' });
  git(f.dir, 'commit', '-q', '-am', 'search: local');
  const r = run(f.dir, ['search', 'export', 'link'], f.opts);
  assert.equal(r.code, 0, show(r));
  assert.match(r.stdout.split('\n')[0], /^Level\s+1\b/, show(r));
});
