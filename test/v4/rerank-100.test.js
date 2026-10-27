// Issue #100: the rerank method (src/v4/rerank.js). Built from the issue,
// kb-search/R10 and the module's public interface only. Nothing here reads
// src/. Word search gives its top 30; a reranker scores them, and its order
// replaces the order of those 30. The llama.cpp scorers run against a fake
// llama-server; the transformers.js scorers against a fake library object
// (helpers/llama.js). No model, no download, no network beyond 127.0.0.1.
// The module is imported in each test, so that the self-check of the fakes
// runs while the module does not exist yet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLS, SEP, codes, fakeLibrary, startFake } from './helpers/llama.js';

const rerankJs = () => import('../../src/v4/rerank.js');

const INSTRUCTION = 'Given the title and description of a code change, retrieve the files and spec paragraphs that the change touches';
const prompt = (query, doc) => `<|im_start|>system\nJudge whether the Document meets the requirements based on the Query and the Instruct provided. Note that the answer can only be "yes" or "no".<|im_end|>\n<|im_start|>user\n<Instruct>: ${INSTRUCTION}\n<Query>: ${query}\n<Document>: ${doc}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n`;
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} is not ${b}`);
const nearAll = (as, bs) => {
  assert.equal(as.length, bs.length, `${as.length} scores, not ${bs.length}`);
  as.forEach((a, i) => near(a, bs[i], `score ${i}`));
};

// --- the fakes themselves (need no module)

test('#100 self-check: the fake server answers /v1/rerank out of order and /completion with log probabilities; the fake library loads and tokenizes', async (t) => {
  const { srv } = await startFake(t, { rerankScores: [0.1, 0.9], yesno: { d: { yes: -0.5, no: -1.5 } } });
  const rr = await srv.post('/v1/rerank', { query: 'q', documents: ['a', 'b'], top_n: 2 });
  assert.deepEqual(rr.results.map((r) => r.index), [1, 0]);
  const c = await srv.post('/completion', { prompt: prompt('q', 'd'), n_predict: 1, n_probs: 50 });
  assert.deepEqual(c.completion_probabilities[0].top_logprobs.map((e) => [e.token, e.logprob]), [['yes', -0.5], ['no', -1.5], ['maybe', -5]]);
  const lib = fakeLibrary();
  const tok = await lib.AutoTokenizer.from_pretrained('r');
  assert.deepEqual(tok.encode('ab', { add_special_tokens: true }), [CLS, 97, 98, SEP]);
  assert.equal(tok.decode([CLS, 97, 98, SEP]), 'ab');
  assert.deepEqual(tok.encode('yes', { add_special_tokens: false }), [7]);
});

// --- constants

test('#100 TOP is 30, and INSTRUCTION is the measured instruction', async () => {
  const R = await rerankJs();
  assert.equal(R.TOP, 30);
  assert.equal(R.INSTRUCTION, INSTRUCTION);
});

// --- rerank

const hitsOf = (n) => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, text: `text ${i}`, rank: i + 1 }));

test('#100 rerank: 40 hits; score is called once with the 30 first texts; those 30 are ordered by score, equal scores in word order; hits 31-40 are unchanged', async () => {
  const R = await rerankJs();
  const hits = hitsOf(40);
  const before = hits.map((h) => h.key);
  const calls = [];
  // Scores with ties: hit i scores (i * 7) % 5.
  const score = async (query, texts) => { calls.push([query, texts]); return texts.map((_, i) => (i * 7) % 5); };
  const out = await R.rerank('the query', hits, score);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'the query');
  assert.deepEqual(calls[0][1], hits.slice(0, 30).map((h) => h.text));
  const top = Array.from({ length: 30 }, (_, i) => i);
  // The expected order, written out by score: 4s, 3s, 2s, 1s, 0s, each in word order.
  const byScore = [4, 3, 2, 1, 0].flatMap((s) => top.filter((i) => (i * 7) % 5 === s));
  assert.deepEqual(out.map((h) => h.key), [...byScore.map((i) => `k${i}`), ...hits.slice(30).map((h) => h.key)]);
  assert.equal(out[0], hits[byScore[0]], 'the hits are the same objects');
  assert.deepEqual(out.slice(30), hits.slice(30));
  assert.notEqual(out, hits, 'a new array');
  assert.deepEqual(hits.map((h) => h.key), before, 'the input is not reordered');
});

test('#100 rerank: fewer than 30 hits are all scored and ordered; equal scores keep their word order', async () => {
  const R = await rerankJs();
  const hits = hitsOf(5);
  const calls = [];
  const out = await R.rerank('q', hits, async (q, texts) => { calls.push(texts); return [0.2, 0.9, 0.2, 0.5, 0.9]; });
  assert.deepEqual(calls, [hits.map((h) => h.text)]);
  assert.deepEqual(out.map((h) => h.key), ['k1', 'k4', 'k3', 'k0', 'k2']);
});

test('#100 rerank: exactly 30 hits are all scored', async () => {
  const R = await rerankJs();
  const hits = hitsOf(30);
  const out = await R.rerank('q', hits, async (q, texts) => texts.map((_, i) => i));
  assert.deepEqual(out.map((h) => h.key), hits.map((h) => h.key).reverse());
});

test('#100 rerank: no hits give [] and score is not called', async () => {
  const R = await rerankJs();
  let called = false;
  assert.deepEqual(await R.rerank('q', [], async () => { called = true; return []; }), []);
  assert.equal(called, false);
});

// --- llamaHead

test('#100 llamaHead: each document cut to 512 tokens by /tokenize and /detokenize; one /v1/rerank with top_n; the scores by index', async (t) => {
  const R = await rerankJs();
  const { srv, fake } = await startFake(t, { tok: { prefix: [CLS], suffix: [SEP] }, rerankScores: [0.1, 0.9, 0.5] });
  const long = 'z'.repeat(600);
  const docs = ['first doc', long, 'third doc'];
  const scores = await R.llamaHead(srv)('the query', docs);
  nearAll(scores, [0.1, 0.9, 0.5]);
  const toks = fake.requests('/tokenize').map((r) => r.body);
  for (const content of docs) {
    assert.ok(toks.some((b) => JSON.stringify(b) === JSON.stringify({ content, add_special: false, parse_special: false })),
      `a /tokenize of ${content.slice(0, 20)} with add_special false, parse_special false`);
  }
  const detok = fake.requests('/detokenize').map((r) => r.body.tokens);
  assert.ok(detok.some((x) => JSON.stringify(x) === JSON.stringify(codes('z'.repeat(512)))), 'the long document: its first 512 tokens go to /detokenize');
  const rr = fake.requests('/v1/rerank');
  assert.equal(rr.length, 1, 'one /v1/rerank');
  assert.deepEqual(rr[0].body, { query: 'the query', documents: ['first doc', 'z'.repeat(512), 'third doc'], top_n: 3 });
});

// --- llamaYesNo

test('#100 llamaYesNo: the exact prompt and request; P(yes) / (P(yes) + P(no)) from logprobs and from probs; a missing yes gives 0, a missing no 1, neither 0', async (t) => {
  const R = await rerankJs();
  const long = 'y'.repeat(600);
  const { srv, fake } = await startFake(t, {
    yesno: {
      'logprob doc': { yes: -0.5, no: -1.5 },
      'prob doc': { yes: 0.6, no: 0.2, as: 'probs' },
      'no yes doc': { yes: null, no: -1 },
      'no no doc': { yes: -1, no: null },
      'neither doc': { yes: null, no: null },
      [long.slice(0, 512)]: { yes: -2, no: -1 },
    },
  });
  const docs = ['logprob doc', 'prob doc', 'no yes doc', 'no no doc', 'neither doc', long];
  const scores = await R.llamaYesNo(srv)('the query', docs);
  const s = (y, n) => Math.exp(y) / (Math.exp(y) + Math.exp(n));
  nearAll(scores, [s(-0.5, -1.5), 0.6 / (0.6 + 0.2), 0, 1, 0, s(-2, -1)]);
  const bodies = fake.requests('/completion').map((r) => r.body);
  assert.equal(bodies.length, docs.length, 'one /completion for each document');
  for (const doc of ['logprob doc', 'prob doc', 'no yes doc', 'no no doc', 'neither doc', long.slice(0, 512)]) {
    const want = { prompt: prompt('the query', doc), n_predict: 1, n_probs: 50, temperature: 0, cache_prompt: false, post_sampling_probs: false };
    assert.ok(bodies.some((b) => JSON.stringify(b) === JSON.stringify(want)), `the request for ${doc.slice(0, 20)}: ${JSON.stringify(bodies.find((b) => b.prompt.includes(doc.slice(0, 20))))}`);
  }
  const toks = fake.requests('/tokenize').map((r) => r.body);
  assert.ok(toks.some((b) => b.content === long && b.add_special === false && b.parse_special === false), 'the documents are cut as in llamaHead');
});

test('#100 llamaYesNo: 30 documents; never more than 8 /completion requests in flight', async (t) => {
  const R = await rerankJs();
  const { srv, fake } = await startFake(t, { completionDelayMs: 150 });
  const docs = Array.from({ length: 30 }, (_, i) => `document ${i}`);
  const scores = await R.llamaYesNo(srv)('q', docs);
  assert.equal(scores.length, 30);
  assert.equal(fake.requests('/completion').length, 30);
  const most = fake.maxInFlight('/completion');
  assert.ok(most >= 1 && most <= 8, `at most 8 in flight: ${most}`);
});

// --- tjsHead and tjsYesNo

const OPTS = { repo: 'example/reranker', revision: 'fedcba9876543210fedcba9876543210fedcba98', dtype: 'q8' };
const TEMPLATE = `{model}/resolve/${OPTS.revision}/`;
const rowsOf = (tensor) => {
  const [B, L] = tensor.dims;
  return Array.from({ length: B }, (_, b) => [...tensor.data.slice(b * L, (b + 1) * L)].map(Number));
};

test('#100 tjsHead: loads once with remotePathTemplate set; one batch; [cls, q, sep, d, sep] with token types, padding and mask; the score of each document', async () => {
  const R = await rerankJs();
  const lib = fakeLibrary();
  const score = R.tjsHead(lib, OPTS);
  const query = 'q'.repeat(250);
  const long = 'z'.repeat(600);
  const scores = await score(query, [long, 'short doc']);
  const q = codes('q'.repeat(200));
  const d0 = codes('z'.repeat(512 - 3 - 200));
  const d1 = codes('short doc');
  const row0 = [CLS, ...q, SEP, ...d0, SEP];
  const row1 = [CLS, ...q, SEP, ...d1, SEP];
  assert.equal(row0.length, 512);
  const heads = lib.calls.filter((c) => c.call === 'head');
  assert.equal(heads.length, 1, 'one batch for all documents');
  const { input_ids: ids, attention_mask: mask, token_type_ids: types } = heads[0].inputs;
  for (const [name, x] of [['input_ids', ids], ['attention_mask', mask], ['token_type_ids', types]]) {
    assert.ok(x instanceof lib.Tensor, `${name} is a lib.Tensor`);
    assert.equal(x.type, 'int64', name);
    assert.ok(x.data instanceof BigInt64Array, `${name} holds a BigInt64Array`);
    assert.deepEqual(x.dims, [2, 512], name);
  }
  const pad = 512 - row1.length;
  assert.deepEqual(rowsOf(ids), [row0, [...row1, ...Array(pad).fill(0)]]);
  assert.deepEqual(rowsOf(mask), [Array(512).fill(1), [...Array(row1.length).fill(1), ...Array(pad).fill(0)]]);
  // The token types of the real tokens: 0 for cls, q and sep, then 1. The pad is not checked.
  const t = rowsOf(types);
  assert.deepEqual(t[0], [...Array(202).fill(0), ...Array(310).fill(1)]);
  assert.deepEqual(t[1].slice(0, row1.length), [...Array(202).fill(0), ...Array(d1.length + 1).fill(1)]);
  // The fake head scores a row by its count of real tokens / 1000.
  nearAll(scores, [512 / 1000, row1.length / 1000]);
  // A second call does not load again; a short query is not cut.
  const again = await score('find', ['a doc']);
  nearAll(again, [(1 + 4 + 1 + 5 + 1) / 1000]);
  const loads = lib.calls.filter((c) => c.call.startsWith('Auto'));
  assert.equal(loads.filter((c) => c.call === 'AutoTokenizer').length, 1);
  assert.equal(loads.filter((c) => c.call === 'AutoModelForSequenceClassification').length, 1);
  assert.equal(loads.filter((c) => c.call === 'AutoModelForCausalLM').length, 0);
  for (const c of loads) {
    assert.equal(c.args[0], OPTS.repo);
    assert.equal(c.remotePathTemplate, TEMPLATE, `remotePathTemplate is set before ${c.call}.from_pretrained`);
  }
  assert.deepEqual(loads.find((c) => c.call === 'AutoModelForSequenceClassification').args[1], { dtype: 'q8' });
});

test('#100 tjsYesNo: loads once with remotePathTemplate set; one call per document with the exact prompt; the score from the last position', async () => {
  const R = await rerankJs();
  const long = 'y'.repeat(600);
  const values = { alpha: { yes: 2, no: 0 }, beta: { yes: -1, no: 1 }, [long.slice(0, 512)]: { yes: 0.5, no: 0.5 } };
  const lib = fakeLibrary({
    yesno: (p) => values[p.split('<Document>: ')[1].split('<|im_end|>')[0]],
  });
  const score = R.tjsYesNo(lib, { ...OPTS, dtype: 'fp32' });
  const scores = await score('the query', ['alpha', 'beta', long]);
  const s = (y, n) => Math.exp(y) / (Math.exp(y) + Math.exp(n));
  nearAll(scores, [s(2, 0), s(-1, 1), 0.5]);
  const toks = lib.calls.filter((c) => c.call === 'tok');
  assert.deepEqual(toks.map((c) => c.text), ['alpha', 'beta', long.slice(0, 512)].map((d) => prompt('the query', d)));
  for (const c of toks) assert.deepEqual(c.opts, { add_special_tokens: false });
  const runs = lib.calls.filter((c) => c.call === 'causal');
  assert.equal(runs.length, 3, 'one model call per document');
  runs.forEach((r, i) => assert.equal(r.enc, toks[i].enc, 'the model gets what the tokenizer gave'));
  await score('again', ['alpha']);
  const loads = lib.calls.filter((c) => c.call.startsWith('Auto'));
  assert.equal(loads.filter((c) => c.call === 'AutoTokenizer').length, 1);
  assert.equal(loads.filter((c) => c.call === 'AutoModelForCausalLM').length, 1);
  assert.equal(loads.filter((c) => c.call === 'AutoModelForSequenceClassification').length, 0);
  for (const c of loads) {
    assert.equal(c.args[0], OPTS.repo);
    assert.equal(c.remotePathTemplate, TEMPLATE, `remotePathTemplate is set before ${c.call}.from_pretrained`);
  }
  assert.deepEqual(loads.find((c) => c.call === 'AutoModelForCausalLM').args[1], { dtype: 'fp32' });
});

for (const [word, words] of [['yes', { yes: [7, 9], no: [8] }], ['no', { yes: [7], no: [8, 9] }]]) {
  test(`#100 tjsYesNo: "${word}" that is not one token throws`, async () => {
    const R = await rerankJs();
    const lib = fakeLibrary({ words, yesno: () => ({ yes: 0, no: 0 }) });
    await assert.rejects(async () => R.tjsYesNo(lib, OPTS)('q', ['doc']));
  });
}
