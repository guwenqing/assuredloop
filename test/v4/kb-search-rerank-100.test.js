// #100 (kb-search/R10): the transformers.js reranker rows through `al
// search`, and the recommendation of a reranker row.
// - ms-marco-minilm-l-6-v2 fp32, q8 and q4 tjs-cpu (a classification head)
//   and qwen3-reranker-0.6b q8 and q4 tjs-cpu (no head): word search gives
//   its top 30; the reranker scores them; its order replaces the order of
//   those 30; then --limit cuts; an exact ID stays first (points 6, 14).
// - Without the library: word search, with #99's Fallback and install line
//   (point 15).
// - Before the library fetches the model files: #99's line on standard
//   error (point 16).
// - The recommendation (#99's rule) takes the llama and reranker rows: a
//   computer that fits a reranker row gets it when the rule picks it (point 4).
//   The rule keeps only the rows that take at most 10 s for each search; a
//   pick that the cap removes is named in a clause, and in recommend.capped.
// A stand-in @huggingface/transformers (helpers/rerank.js) scores each
// paragraph by its marker word. Built from the issue and the public
// interface only; nothing here reads src/. No model, no download, no network.
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { TRANSFORMERS, TRANSFORMERS_VERSION, besideAl, callsOf, runOk, search, show, smallRepo } from './helpers/search.js';
import {
  BIG_MAC, FULL_DISK, HUGE_MAC, INTEL_MAC, LINUX, NO_MEMORY, SMALL_MAC, capClause, cappedRow, fakeComputer, labelled, ruleRow,
} from './helpers/kb-search.js';
import { fileOf, installReranker, invoiceWorld, reranked, sparse, tableOf } from './helpers/rerank.js';

const reranks = (row) => `Level     2 (full text, reranked by ${row})`;
const fetchLine = (row, mb) => `al: fetching the model ${row} (${mb} MB), once`;
const MARK = 'stand-in: from_pretrained called';
const INSTALL = `${TRANSFORMERS}@${TRANSFORMERS_VERSION}`;
// The start of a local recommendation (#100: the words after "none" depend on the cap).
const RECOMMEND_LOCAL = 'Recommend local: of the rows that this al can run and that fit this computer, none';

const ROWS = [
  ['ms-marco-minilm-l-6-v2 fp32 tjs-cpu', 'head'],
  ['ms-marco-minilm-l-6-v2 q8 tjs-cpu', 'head'],
  ['ms-marco-minilm-l-6-v2 q4 tjs-cpu', 'head'],
  ['qwen3-reranker-0.6b q8 tjs-cpu', 'yes/no'],
  ['qwen3-reranker-0.6b q4 tjs-cpu', 'yes/no'],
];

let TABLE = null;
before(() => { TABLE = tableOf(fakeComputer, BIG_MAC); });
const rowOf = (name) => {
  assert.ok(TABLE.has(name), `the table has ${name}`);
  return TABLE.get(name);
};
const jsonOf = (r) => {
  try { return JSON.parse(r.stdout); } catch { return assert.fail(`--json gives one JSON object:\n${show(r)}`); }
};

// The invoice world with the setting, the stand-in with its calls file, and a fake Mac with room.
function world(t, rowName, standIn = {}) {
  const dir = invoiceWorld(t, { local: rowName });
  const calls = join(dir, '.git', 'rerank-calls.log');
  const pkg = standIn === null ? null : installReranker(dir, { calls, ...standIn });
  const pc = fakeComputer(join(dir, '.git', 'fake-computer'), HUGE_MAC);
  return { dir, calls, pkg, opts: { nodeArgs: pc.nodeArgs, env: pc.env } };
}

// --- the order (points 6, 14)

for (const [rowName, kind] of ROWS) {
  test(`#100 search: {local: ${rowName}} (${kind === 'head' ? 'a classification head' : 'no head'}): the top 30 word hits are reordered by the reranker's scores; hits 31-40 keep their place`, (t) => {
    const f = world(t, rowName);
    const [, precision] = rowName.split(' ');
    const row = rowOf(rowName);
    const words = search(f.dir, ['invoice', '--limit', '50'], { ...f.opts, level: 1 });
    assert.equal(words.hits.length, 40, `the fixture: word search finds the 40 paragraphs: ${words.hits.map((h) => h.id).join(' ')}`);
    assert.deepEqual(callsOf(f.calls), [], 'level 1 does not load the library');
    const r = runOk(f.dir, ['search', 'invoice', '--limit', '50'], f.opts);
    assert.equal(r.stdout.split('\n')[0], reranks(rowName), show(r));
    assert.ok(!/^Fallback\b/m.test(r.stdout), show(r));
    const out = search(f.dir, ['invoice', '--limit', '50'], f.opts);
    assert.equal(out.level, 2, `level 2 answered (fallback: ${out.fallback})`);
    assert.deepEqual(out.hits.map((h) => h.id), reranked(words.hits).map((h) => h.id), 'the reranker\'s order of the top 30, then hits 31-40');
    const all = callsOf(f.calls);
    assert.deepEqual(all.filter((c) => c.call === 'pipeline'), [], 'no pipeline: no index of vectors for a reranker row');
    const loads = all.filter((c) => c.call === 'from_pretrained');
    const model = kind === 'head' ? 'AutoModelForSequenceClassification' : 'AutoModelForCausalLM';
    assert.ok(loads.some((c) => c.name === 'AutoTokenizer'), `the tokenizer is loaded: ${JSON.stringify(loads)}`);
    assert.ok(loads.some((c) => c.name === model), `${model} is loaded: ${JSON.stringify(loads)}`);
    assert.ok(!loads.some((c) => c.name === (kind === 'head' ? 'AutoModelForCausalLM' : 'AutoModelForSequenceClassification')), 'not the other model class');
    for (const c of loads) {
      assert.equal(c.repo, row.repo, `${c.name}: the row's model repo`);
      assert.equal(c.env.remotePathTemplate, `{model}/resolve/${row.commit}/`, `${c.name}: pinned to the row's commit before it loads`);
      if (c.name === model) assert.equal(c.options?.dtype, precision, `${c.name}: the dtype of the row: ${JSON.stringify(c.options)}`);
    }
    const texts = (xs) => new Set(xs.map((x) => String(x).match(/mk\d\d/)?.[0]));
    const top30 = texts(words.hits.slice(0, 30).map((h) => h.text));
    if (kind === 'head') {
      const heads = all.filter((c) => c.call === 'head');
      assert.equal(heads.length, 2, 'one batch for each of the two searches');
      for (const h of heads) {
        assert.equal(h.input_ids.dims[0], 30, 'a batch of the 30 top hits');
        assert.deepEqual(texts(h.input_ids.rows.map((ids) => String.fromCodePoint(...ids.filter((x) => x > 31 && x <= 0x10ffff)))), top30);
      }
    } else {
      const runs = all.filter((c) => c.call === 'causal');
      assert.equal(runs.length, 60, 'one model call for each document, 30 for each search');
      assert.deepEqual(texts(runs.map((c) => c.text.split('<Document>: ')[1])), top30);
    }
  });
}

for (const [rowName] of [ROWS[1], ROWS[4]]) {
  test(`#100 search: {local: ${rowName}}: --limit cuts after the rerank, and an exact ID stays first`, (t) => {
    const f = world(t, rowName);
    const words = search(f.dir, ['invoice', '--limit', '50'], { ...f.opts, level: 1 });
    const five = search(f.dir, ['invoice', '--limit', '5'], f.opts);
    assert.equal(five.level, 2, `level 2 answered (fallback: ${five.fallback})`);
    assert.deepEqual(five.hits.map((h) => h.id), reranked(words.hits).slice(0, 5).map((h) => h.id));
    // RUL-41 holds mk40, which the reranker scores 0.2.
    const id = search(f.dir, ['RUL-41', 'invoice', '--limit', '50'], f.opts);
    assert.equal(id.hits[0]?.id, 'RUL-41', id.hits.map((h) => h.id).join(' '));
    assert.equal(id.hits[0].exact, true);
  });
}

test('#100 search: {local: ms-marco-minilm-l-6-v2 q8 tjs-cpu}: --level 1, --level 0 and --id with no words do not load the library', (t) => {
  const f = world(t, ROWS[1][0]);
  for (const level of [1, 0]) assert.equal(search(f.dir, ['invoice'], { ...f.opts, level }).level, level);
  assert.equal(search(f.dir, ['--id', 'RUL-4'], f.opts).hits[0]?.id, 'RUL-4');
  assert.deepEqual(callsOf(f.calls), [], 'the library was not loaded');
});

// --- without the library (point 15)

for (const [rowName] of [ROWS[1], ROWS[3]]) {
  test(`#100 search: {local: ${rowName}} without the library: word search, a Fallback line, and Not known says npm install ${INSTALL}`, (t) => {
    if (besideAl()) { t.skip('@huggingface/transformers resolves beside bin/al.js, so "not installed" cannot be shown here'); return; }
    const f = world(t, rowName, null);
    const r = runOk(f.dir, ['search', 'invoice'], f.opts);
    const ls = r.stdout.split('\n');
    assert.match(ls[0], /^Level\s+1\b/, show(r));
    assert.ok(ls.some((l) => /^Fallback\s+\S/.test(l)), show(r));
    const at = ls.findIndex((l) => /^Not known\b/.test(l));
    const nk = at < 0 ? '' : ls.slice(at).join('\n');
    assert.ok(/\bnpm install\b/.test(nk) && nk.includes(INSTALL), `Not known names npm install and ${INSTALL}:\n${show(r)}`);
    const out = search(f.dir, ['invoice'], f.opts);
    assert.equal(out.level, 1);
    assert.ok(out.hits.length > 0, 'word search still answers');
  });
}

// --- the size before a fetch (point 16)

for (const [rowName] of [ROWS[1], ROWS[4]]) {
  test(`#100 search: {local: ${rowName}}: before the library fetches the model file, al writes its size to standard error`, (t) => {
    const f = world(t, rowName, { stderrMark: true });
    const mb = Math.round(rowOf(rowName).download / 1e6);
    const r = runOk(f.dir, ['search', 'invoice'], f.opts);
    const line = fetchLine(rowName, mb);
    const at = r.stderr.indexOf(line);
    assert.ok(at >= 0, `standard error has "${line}":\n${show(r)}`);
    const mark = r.stderr.indexOf(MARK);
    assert.ok(mark >= 0, `the fixture: the stand-in marks its from_pretrained call:\n${show(r)}`);
    assert.ok(at < mark, `the line comes before the library loads:\n${r.stderr}`);
    assert.equal(r.stderr.split(line).length, 2, 'the line once');
    assert.ok(!r.stdout.includes('al: fetching'), 'the line is on standard error');
  });

  // The model file in the stand-in's cache, as #99 places it:
  // <env.cacheDir>/<commit>/<model repo>/<file>.
  test(`#100 search: {local: ${rowName}} with the model file in the cache at the pinned commit: no fetch line`, (t) => {
    const f = world(t, rowName, { stderrMark: true });
    const row = rowOf(rowName);
    sparse(join(f.pkg, '.cache', row.commit, ...row.repo.split('/'), ...fileOf(row).path.split('/')), 16);
    const r = runOk(f.dir, ['search', 'invoice'], f.opts);
    assert.ok(r.stderr.includes(MARK), `the fixture: the library was loaded:\n${show(r)}`);
    assert.ok(!r.stderr.includes('al: fetching the model'), `the file is there, so no fetch line:\n${show(r)}`);
    assert.equal(r.stdout.split('\n')[0], reranks(rowName), show(r));
  });
}

// --- the recommendation (point 4)

// The answer with no setting on a fake computer: the text and --json.
function noSetting(t, computer) {
  const { dir } = smallRepo(t, { search: null });
  const pc = fakeComputer(join(dir, '.git', 'fake-computer'), computer);
  const opts = { nodeArgs: pc.nodeArgs, env: pc.env };
  const r = runOk(dir, ['search', 'export', 'link'], opts);
  return { r, out: jsonOf(runOk(dir, ['search', 'export', 'link', '--json'], opts)) };
}

const CAP_REASON = 'the smallest download within 0.05 of the best recall among the rows that fit and take at most 10 s for each search';
const LINUX_RECOMMEND = 'Recommend local: of the rows that this al can run and that fit this computer, none that takes at most 10 s for each search has a gain whose interval is above zero; qwen3-reranker-0.6b q4 tjs-cpu gains +0.066 but takes about 23 s for each search';

// The cap does not change the pick: a Mac with an Apple GPU and room gets the
// llama.cpp reranker, which takes about 3.7 s for each search.
for (const [name, computer] of [['a Mac with 64 GB', BIG_MAC], ['a Mac with 16 GB', SMALL_MAC]]) {
  test(`#100 no setting, ${name}: the recommendation is local with qwen3-reranker-0.6b q8_0 llama-metal; the cap of 10 s removes no pick`, (t) => {
    const expected = 'qwen3-reranker-0.6b q8_0 llama-metal';
    const { r, out } = noSetting(t, computer);
    assert.equal(ruleRow(out.rows), expected, 'the fixture: the rule over the figures of --json picks this row');
    assert.equal(cappedRow(out.rows), null, 'the fixture: the rule without the cap picks the same row');
    assert.equal(out.rows.find((x) => x.name === expected).state, 'fits', `${expected} fits this computer`);
    assert.equal(out.recommend?.choice, 'local');
    assert.equal(out.recommend?.row, expected, `--json recommend: ${JSON.stringify(out.recommend)}`);
    assert.equal(out.recommend?.capped, null);
    assert.match(String(out.recommend?.reason), /^gain [+-]\d\.\d{3} \[[+-]\d\.\d{3}, [+-]\d\.\d{3}\] over word search; /, `the reason: ${out.recommend?.reason}`);
    assert.ok(String(out.recommend?.reason).includes(CAP_REASON), `the reason: ${out.recommend?.reason}`);
    const rec = labelled(r.stdout).find((l) => l.label === 'Recommend');
    assert.ok(rec, `a Recommend line:\n${show(r)}`);
    const text = [rec.text, ...rec.more].join(' ');
    assert.ok(text.includes(`local with ${expected}`), `the Recommend line names local with ${expected}:\n${rec.line}`);
    assert.ok(text.includes(CAP_REASON), `the Recommend line gives the reason:\n${rec.line}`);
    assert.ok(!text.includes(' but takes about '), `no clause: the cap removed no pick:\n${rec.line}`);
    assert.ok(!/cannot run/.test(text), `no word about rows that this version cannot run:\n${rec.line}`);
  });
}

// The cap changes the pick: off macOS arm64 the only row with a gain above
// zero is qwen3-reranker-0.6b q4 tjs-cpu, which takes about 23 s for each
// search; so the recommendation is local, with the clause.
for (const [name, computer] of [['a Linux computer', LINUX], ['an Intel Mac', INTEL_MAC]]) {
  test(`#100 no setting, ${name}: the cap removes qwen3-reranker-0.6b q4 tjs-cpu, so the recommendation is local, with the clause`, (t) => {
    const { r, out } = noSetting(t, computer);
    assert.equal(ruleRow(out.rows), null, 'the fixture: no row is left with the cap');
    assert.equal(cappedRow(out.rows)?.name, 'qwen3-reranker-0.6b q4 tjs-cpu', 'the fixture: the rule without the cap picks this row');
    assert.deepEqual([out.recommend?.choice, out.recommend?.row, out.recommend?.capped], ['local', null, 'qwen3-reranker-0.6b q4 tjs-cpu'], JSON.stringify(out.recommend));
    assert.ok(r.stdout.split('\n').includes(LINUX_RECOMMEND), `the Recommend line:\n${show(r)}`);
    assert.equal(LINUX_RECOMMEND.endsWith(capClause(cappedRow(out.rows))), true, 'the fixture: the clause from the figures of --json');
  });
}

for (const [name, computer] of [['a full disk', FULL_DISK], ['half a GB of memory', NO_MEMORY]]) {
  test(`#100 no setting, ${name}: no row fits, so the recommendation is local, with no clause and no word about rows that this version cannot run`, (t) => {
    const { r, out } = noSetting(t, computer);
    assert.equal(ruleRow(out.rows), null, 'the fixture: no row is left by the rule');
    assert.equal(cappedRow(out.rows), null, 'the fixture: no row is left without the cap either');
    assert.deepEqual([out.recommend?.choice, out.recommend?.row, out.recommend?.capped], ['local', null, null]);
    const line = r.stdout.split('\n').find((l) => l.startsWith('Recommend '));
    assert.ok(line && line.startsWith(RECOMMEND_LOCAL) && line.includes('has a gain whose interval is above zero'), `the Recommend line:\n${show(r)}`);
    assert.ok(!line.includes(' but takes about ') && !/cannot run/.test(line), `no clause:\n${show(r)}`);
    assert.equal(line, `${RECOMMEND_LOCAL} has a gain whose interval is above zero`, 'no capped row, so no words about the 10 s cap');
  });
}
