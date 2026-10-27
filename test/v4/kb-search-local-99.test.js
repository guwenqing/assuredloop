// #99 (kb-search/R10; light-design LD-32; LD-37 "local with a model whose
// library is missing" and "the download size shown before a fetch"):
// `search: local` and `search: {local: <row>}`.
// - `local` is word search (level 1), even with the library in the project:
//   the library's pipeline is never called. `--level 2` is refused.
// - `{local: <row>}` with the library: level 2 with that row, for each of the
//   11 rows this version runs. The Level line names the row; the stand-in
//   (helpers/search.js) sees the row's model repo, its dtype and its device
//   (cpu, webgpu or coreml). Each row embeds as it was measured (DES-80):
//   tokenizer.encode, the cut to 512 ids, padding by hand, and the
//   pipeline's model (kb-search-embed-99.test.js tests the recipe).
// - A row that does not fit this computer still runs, with a Not known item
//   that says what it needs and what the computer has.
// - Without the library: level 1, a Fallback line, and the Not known line
//   with npm install and @huggingface/transformers@4.3.1 (level2-peer/R1).
// - Before a fetch: when the model file is not in the library's cache, al
//   writes `al: fetching the model <row> (<n> MB), once` to standard error
//   before it calls pipeline; when the file is there, no such line.
// Level 2 runs on a fake Mac with room for every row (helpers/kb-search.js).
// Built from the issue and the public interface only; nothing here reads src/.
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MODEL, REVISION, ROW, TRANSFORMERS, TRANSFORMERS_VERSION, WITH_MODEL, besideAl, callsOf, embedded, installEmbedder,
  familyOf, runOk, runRefused, search, show, smallRepo,
} from './helpers/search.js';
import { HUGE_MAC, RUNNABLE, SMALL_MAC, checkRecipe, fakeComputer, noChoice } from './helpers/kb-search.js';

const LEVEL1_LINE = 'Level     1 (full text, SQLite FTS5)';
const level2Line = (row) => `Level     2 (hybrid: full text and ${row})`;
const fetchLine = (row, mb) => `al: fetching the model ${row} (${mb} MB), once`;
const MARK = 'stand-in: pipeline called';
const INSTALL = `${TRANSFORMERS}@${TRANSFORMERS_VERSION}`;
const idRoles = (out) => out.hits.map((h) => `${h.id} v${h.version} ${h.role}`);
// The model repo of each model, and the device of each runtime.
const MODEL_OF = {
  'bge-small-en-v1.5': 'Xenova/bge-small-en-v1.5',
  'embeddinggemma-300m': 'onnx-community/embeddinggemma-300m-ONNX',
  'qwen3-embedding-0.6b': 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
};
const DEVICE_OF = { 'tjs-cpu': 'cpu', 'tjs-webgpu': 'webgpu', 'tjs-coreml': 'coreml' };

// A small repo with the setting, the stand-in with its logs, and a fake Mac.
function repo(t, setting, standIn = {}) {
  const { dir } = smallRepo(t, { search: setting });
  const calls = join(dir, '.git', 'embed-calls.log');
  const log = join(dir, '.git', 'embed-test.log');
  const pkg = standIn === null ? null : installEmbedder(dir, { calls, log, ...standIn });
  const pc = fakeComputer(join(dir, '.git', 'fake-computer'), HUGE_MAC);
  return { dir, calls, log, pkg, opts: { nodeArgs: pc.nodeArgs, env: pc.env } };
}

// The download of each row that fits the fake Mac, from the output with no setting.
let downloads = null;
before(() => {
  const holder = { after: () => {} };
  const cleanups = [];
  holder.after = (fn) => cleanups.push(fn);
  try {
    const { dir } = smallRepo(holder, { search: null });
    const pc = fakeComputer(join(dir, '.git', 'fake-computer'), HUGE_MAC);
    const r = runOk(dir, ['search', 'export', 'link'], { nodeArgs: pc.nodeArgs, env: pc.env });
    downloads = new Map(noChoice(r.stdout).fit.map((f) => [f.row, f.download]));
  } catch (error) {
    downloads = error;
  } finally {
    for (const fn of cleanups) fn();
  }
});
function downloadOf(row) {
  if (downloads instanceof Error) throw downloads;
  assert.ok(downloads.has(row), `the output with no setting gives the download of ${row} on a Mac with 128 GB: ${[...downloads.keys()].join(', ')}`);
  return downloads.get(row);
}

// --- local: word search alone

test('#99 search: local answers with word search (level 1), and does not call the library though it is in the project', (t) => {
  const f = repo(t, 'local');
  const r = runOk(f.dir, ['search', 'export', 'link'], f.opts);
  assert.equal(r.stdout.split('\n')[0], LEVEL1_LINE, show(r));
  assert.ok(!/^Fallback\b/m.test(r.stdout), `local is the choice, not a fallback:\n${show(r)}`);
  const out = search(f.dir, ['export', 'link'], f.opts);
  assert.equal(out.level, 1);
  assert.equal(out.fallback, null);
  assert.ok(idRoles(out).includes('EXP-4 v1 baseline'), idRoles(out).join('\n'));
  assert.deepEqual(callsOf(f.calls), [], 'the library\'s pipeline was not called');
  assert.deepEqual(embedded(f.log), [], 'nothing was embedded');
  assert.ok(!r.stderr.includes('al: fetching the model'), `no fetch with local:\n${show(r)}`);
});

test('#99 search: local keeps the queries and options of level 1: --id, --change, --history, --level 0', (t) => {
  const f = repo(t, 'local');
  assert.deepEqual(idRoles(search(f.dir, ['--id', 'EXP-4'], f.opts)), ['EXP-4 v1 baseline']);
  assert.ok(idRoles(search(f.dir, ['expired', '--change', 'links'], f.opts)).includes('links/SP-2 v1 proposal'));
  assert.equal(search(f.dir, ['export', 'link'], { ...f.opts, level: 0 }).level, 0);
  assert.equal(search(f.dir, ['export', 'link'], { ...f.opts, level: 1 }).level, 1);
});

test('#99 search: local refuses --level 2 (exit 2)', (t) => {
  const f = repo(t, 'local');
  runRefused(f.dir, ['search', 'export', 'link', '--level', '2'], f.opts);
  assert.deepEqual(callsOf(f.calls), [], 'the library\'s pipeline was not called');
});

// --- local with a row

for (const row of RUNNABLE) {
  test(`#99 search: {local: ${row}} with the library: level 2 with that row; the library is called with its model and dtype`, (t) => {
    const f = repo(t, { local: row });
    const [model, precision, runtime] = row.split(' ');
    const r = runOk(f.dir, ['search', 'export', 'link'], f.opts);
    assert.equal(r.stdout.split('\n')[0], level2Line(row), show(r));
    assert.ok(!/^Fallback\b/m.test(r.stdout), show(r));
    const out = search(f.dir, ['export', 'link'], f.opts);
    assert.equal(out.level, 2, `level 2 answered (fallback: ${out.fallback})`);
    assert.equal(out.fallback, null);
    assert.ok(idRoles(out).includes('EXP-4 v1 baseline'), idRoles(out).join('\n'));
    const pipes = callsOf(f.calls).filter((c) => c.call === 'pipeline');
    assert.ok(pipes.length > 0, 'pipeline was called');
    for (const p of pipes) {
      assert.equal(p.task, 'feature-extraction');
      assert.equal(p.model, MODEL_OF[model], `the model repo of ${row}`);
      assert.equal(p.options?.dtype, precision, `the dtype of ${row}: ${JSON.stringify(p.options)}`);
      assert.equal(p.options?.device, DEVICE_OF[runtime], `the device of ${row}: ${JSON.stringify(p.options)}`);
    }
    const all = callsOf(f.calls);
    assert.ok(embedded(f.log).length > 0, `${row}: rows and the query were embedded`);
    // #99 (DES-80): every row embeds as it was measured: tokenizer.encode,
    // the cut, padding by hand, and the pipeline's model; never the
    // extractor's pooling (helpers/kb-search.js, checkRecipe).
    const models = all.filter((c) => c.call === 'model');
    assert.ok(models.length > 0 && models.every((c) => c.count >= 1), `${row} embeds through the pipeline's model: ${JSON.stringify(all).slice(0, 2000)}`);
    checkRecipe(f.calls, familyOf(MODEL_OF[model]));
    if (row === ROW) {
      assert.equal(pipes[0].model, MODEL);
      assert.ok(pipes[0].options?.revision === REVISION || JSON.stringify(pipes[0].env).includes(REVISION), 'the pinned revision');
    }
    assert.ok(r.stderr.includes(fetchLine(row, downloadOf(row))), `the download size before the first fetch:\n${show(r)}`);
  });
}

test('#99 search: {local: <row>}: --level 1 and --level 0 still answer, and do not call the library', (t) => {
  const f = repo(t, WITH_MODEL);
  for (const level of [1, 0]) assert.equal(search(f.dir, ['export', 'link'], { ...f.opts, level }).level, level);
  assert.deepEqual(callsOf(f.calls), [], 'the library\'s pipeline was not called');
  assert.equal(search(f.dir, ['export', 'link', '--level', '2'], f.opts).level, 2, '--level 2 is the row of the setting');
});

test('#99 a row that does not fit this computer still runs (every choice works), and a Not known item says what it needs and what the computer has', (t) => {
  const row = 'bge-small-en-v1.5 fp32 tjs-coreml';
  const f = repo(t, { local: row });
  const pc = fakeComputer(join(f.dir, '.git', 'small-mac'), SMALL_MAC);
  const opts = { nodeArgs: pc.nodeArgs, env: pc.env };
  const r = runOk(f.dir, ['search', 'export', 'link'], opts);
  assert.equal(r.stdout.split('\n')[0], level2Line(row), show(r));
  const esc = row.replace(/\./g, '\\.');
  const need = new RegExp(`${esc} needs \\d+\\.\\d GB of memory \\(\\+1 GB\\) and \\d+ MB of disk; this computer has 16\\.0 GB available and 500\\.0 GB free`);
  const ls = r.stdout.split('\n');
  const at = ls.findIndex((l) => /^Not known\b/.test(l));
  assert.ok(at >= 0 && need.test(ls.slice(at).join('\n')), `the Not known item:\n${show(r)}`);
  const out = search(f.dir, ['export', 'link'], opts);
  assert.equal(out.level, 2);
  assert.ok(out.not_known.some((x) => need.test(x)), JSON.stringify(out.not_known));
  const fits = runOk(f.dir, ['search', 'export', 'link'], f.opts);
  assert.ok(!need.test(fits.stdout) && !fits.stdout.includes(`${row} needs`), `on a computer that fits it, no such item:\n${show(fits)}`);
});

// --- without the library

test('#99 search: {local: <row>} without the library: level 1, a Fallback line, and Not known says npm install @huggingface/transformers@4.3.1', (t) => {
  if (besideAl()) { t.skip('@huggingface/transformers resolves beside bin/al.js, so "not installed" cannot be shown here'); return; }
  const f = repo(t, WITH_MODEL, null);
  const r = runOk(f.dir, ['search', 'export', 'link'], f.opts);
  const ls = r.stdout.split('\n');
  assert.equal(ls[0], LEVEL1_LINE, show(r));
  assert.ok(ls.some((l) => /^Fallback\s+\S/.test(l)), show(r));
  const at = ls.findIndex((l) => /^Not known\b/.test(l));
  const nk = ls.slice(at).join('\n');
  assert.ok(at >= 0 && /\bnpm install\b/.test(nk) && nk.includes(INSTALL), `Not known names npm install and ${INSTALL}:\n${show(r)}`);
  const out = search(f.dir, ['export', 'link'], f.opts);
  assert.equal(out.level, 1);
  assert.ok(idRoles(out).includes('EXP-4 v1 baseline'), 'word search still answers');
});

// --- the download size before a fetch

// The model file of bge-small-en-v1.5 q8 tjs-cpu in the stand-in's cache:
// <env.cacheDir>/<revision>/<model repo>/<file>.
const cached = (pkg) => join(pkg, '.cache', REVISION, ...MODEL.split('/'), 'onnx', 'model_quantized.onnx');

test('#99 before a fetch: al writes the download size of the row to standard error before it calls pipeline', (t) => {
  const f = repo(t, WITH_MODEL, { stderrMark: true });
  const r = runOk(f.dir, ['search', 'export', 'link'], f.opts);
  const line = fetchLine(ROW, 34);
  const at = r.stderr.indexOf(line);
  assert.ok(at >= 0, `standard error has "${line}":\n${show(r)}`);
  const mark = r.stderr.indexOf(MARK);
  assert.ok(mark >= 0, `the fixture: the stand-in marks its pipeline call:\n${show(r)}`);
  assert.ok(at < mark, `the line comes before the pipeline call:\n${r.stderr}`);
  assert.equal(r.stderr.split(line).length, 2, 'the line once');
  assert.ok(!r.stdout.includes('al: fetching'), 'the line is on standard error, not standard output');
});

test('#99 before a fetch: the line comes first also when the model then does not load', (t) => {
  const f = repo(t, WITH_MODEL, { mode: 'pipeline-throws', stderrMark: true });
  const r = runOk(f.dir, ['search', 'export', 'link'], f.opts);
  const at = r.stderr.indexOf(fetchLine(ROW, 34));
  assert.ok(at >= 0 && at < r.stderr.indexOf(MARK), `the line, then the pipeline call:\n${show(r)}`);
  assert.match(r.stdout.split('\n')[0], /^Level\s+1\b/, show(r));
});

test('#99 with the model file in the cache at the pinned revision: no fetch line', (t) => {
  const f = repo(t, WITH_MODEL, { stderrMark: true });
  const file = cached(f.pkg);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, 'a cached model file');
  const r = runOk(f.dir, ['search', 'export', 'link'], f.opts);
  assert.ok(r.stderr.includes(MARK), `the fixture: pipeline was called:\n${show(r)}`);
  assert.ok(!r.stderr.includes('al: fetching the model'), `the file is there, so no fetch line:\n${show(r)}`);
  assert.equal(r.stdout.split('\n')[0], level2Line(ROW), show(r));
});

test('#99 a model file of another revision in the cache is no cached file: the fetch line is shown', (t) => {
  const f = repo(t, WITH_MODEL, { stderrMark: true });
  const other = join(f.pkg, '.cache', 'main', ...MODEL.split('/'), 'onnx', 'model_quantized.onnx');
  const bare = join(f.pkg, '.cache', ...MODEL.split('/'), 'onnx', 'model_quantized.onnx');
  for (const file of [other, bare]) {
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, 'a model file of another revision');
  }
  const r = runOk(f.dir, ['search', 'export', 'link'], f.opts);
  assert.ok(r.stderr.includes(fetchLine(ROW, 34)), `only the pinned revision counts:\n${show(r)}`);
});

test('#99 al search --id (no words) with a row: no fetch line, as the library is not called', (t) => {
  const f = repo(t, WITH_MODEL, { stderrMark: true });
  const r = runOk(f.dir, ['search', '--id', 'EXP-4'], f.opts);
  assert.ok(!r.stderr.includes('al: fetching the model'), show(r));
  assert.ok(!r.stderr.includes(MARK), show(r));
});
