// Helpers for the tests of the rerank method through `al search` (#100,
// stage 2): a world of 40 paragraphs that word search finds by one word, the
// score of each paragraph, the order that a reranker must give, a stand-in
// @huggingface/transformers for the transformers.js rerankers, and the
// environment of a fake llama-server. Nothing here reads src/.
import assert from 'node:assert/strict';
import { closeSync, existsSync, ftruncateSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { commitAll, doc, project, write, writeConfig } from './project.js';
import { TRANSFORMERS, TRANSFORMERS_VERSION, runOk, show, smallRepo } from './search.js';

// --- the measured table, as al gives it

// The rows of `al search --json` with no setting, by name, from a fake Mac
// with room for every row. Read once; the temp repo is removed at once.
let table = null;
export function tableOf(fakeComputer, computer) {
  if (table) return table;
  const cleanups = [];
  try {
    const { dir } = smallRepo({ after: (fn) => cleanups.push(fn) }, { search: null });
    const pc = fakeComputer(join(dir, '.git', 'fake-computer'), computer);
    const r = runOk(dir, ['search', 'export', 'link', '--json'], { nodeArgs: pc.nodeArgs, env: pc.env });
    let out;
    try { out = JSON.parse(r.stdout); } catch { assert.fail(`--json gives one JSON object:\n${show(r)}`); }
    table = new Map(out.rows.map((x) => [x.name, x]));
  } finally {
    for (const fn of cleanups) fn();
  }
  return table;
}

// The one model file of a row: { path, bytes }.
export function fileOf(row) {
  assert.equal(row.files?.length, 1, `${row.name}: one model file: ${JSON.stringify(row.files)}`);
  return row.files[0];
}

// A file of `bytes` zero bytes, made sparse.
export function sparse(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, 'w');
  ftruncateSync(fd, bytes);
  closeSync(fd);
}

// PATH with no folder that holds `name`.
export const pathWithout = (name, path) => path.split(delimiter).filter((d) => d && !existsSync(join(d, name))).join(delimiter);

// --- the world: 40 paragraphs with the word "invoice"

export const COUNT = 40;
// The marker word of paragraph k (1 to 40): RUL-(k + 1) holds mk01 to mk40.
export const mark = (k) => `mk${String(k).padStart(2, '0')}`;
// The score of paragraph k: 0.1 to 0.9, with ties.
export const pOf = (k) => Math.round((0.1 + 0.1 * ((k * 7) % 9)) * 10) / 10;
export const SCORE_BY = Array.from({ length: COUNT }, (_, i) => [mark(i + 1), pOf(i + 1)]);
const markOf = (hit) => {
  const m = String(hit.text).match(/\bmk(\d\d)\b/);
  assert.ok(m, `the hit has a marker: ${hit.id} ${String(hit.text).slice(0, 80)}`);
  return Number(m[1]);
};
export const scoreOfHit = (hit) => pOf(markOf(hit));

// A repo whose spec has RUL-1 (a heading) and RUL-2 to RUL-41, each with the
// word "invoice", its marker, and a length that changes with k. The setting
// is committed in the config.
export function invoiceWorld(t, setting) {
  const dir = project(t);
  write(dir, '.gitignore', 'node_modules/\n');
  writeConfig(dir, [{ file: 'specs/rules.md', prefix: 'RUL' }], { repo: 'acme', search: setting });
  const paras = [['RUL-1 note', '# Rules']];
  for (let k = 1; k <= COUNT; k += 1) {
    paras.push([`RUL-${k + 1} rule`, `Each invoice of kind ${mark(k)} MUST ${'carry a number and '.repeat(1 + (k % 5))}a date.`]);
  }
  write(dir, 'specs/rules.md', doc(paras));
  commitAll(dir, 'A: the rules');
  return dir;
}

// The order that a reranker gives: the first 30 word hits sorted by score,
// highest first, equal scores in word order; then the other hits as they are.
export function reranked(wordHits) {
  const top = wordHits.slice(0, 30).map((h, i) => ({ h, i, s: scoreOfHit(h) }));
  top.sort((a, b) => b.s - a.s || a.i - b.i);
  return [...top.map((x) => x.h), ...wordHits.slice(30)];
}

// --- a stand-in @huggingface/transformers for the reranker rows

// The ids of its tokenizer: one per code point, CLS and SEP around a text
// when add_special_tokens is not false, and one id each for the whole texts
// "yes" and "no" (YES and NO), so the causal model's logits stay small.
export const CLS = 1_200_101;
export const SEP = 1_200_102;
export const YES = 5;
export const NO = 6;
export const VOCAB = 8;

// Writes the stand-in into `pkg`. It has what the rerankers use:
// AutoTokenizer, AutoModelForSequenceClassification and AutoModelForCausalLM
// (each with from_pretrained), Tensor and env (with cacheDir), and a
// pipeline that only records its call.
// - The head model scores row b by the text of its ids: the p of SCORE_BY
//   (scoreBy) for the first marker in it, else 0.01.
// - The causal model gives logits of dims [1, L, VOCAB]; at the last
//   position "yes" is log(p) and "no" is log(1 - p) for the document in the
//   prompt; at the first position other values.
// `calls`: a file with one JSON line for each call: from_pretrained (with
// the repo, the options and the settings of env at that time), tokenizer,
// encode, head and causal (with the inputs as { type, array, dims, rows }).
// `stderrMark`: from_pretrained writes `stand-in: from_pretrained called` to
// standard error.
// mode 'load-throws': the import throws.
export function rerankStandIn(pkg, { calls = null, stderrMark = false, scoreBy = SCORE_BY, mode = 'ok' } = {}) {
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, 'package.json'), `${JSON.stringify({
    name: TRANSFORMERS, version: TRANSFORMERS_VERSION, private: true, description: 'a test stand-in for the rerankers',
    type: 'module', main: 'index.js', exports: './index.js',
  }, null, 2)}\n`);
  writeFileSync(join(pkg, 'index.js'), `// A test stand-in (#100): the reranker part of @huggingface/transformers.
import { appendFileSync } from 'node:fs';
${mode === 'load-throws' ? "throw new Error('test stand-in: it does not load');" : ''}
const CALLS = ${JSON.stringify(calls)};
const SCORE_BY = ${JSON.stringify(scoreBy)};
const [CLS, SEP, YES, NO, VOCAB] = ${JSON.stringify([CLS, SEP, YES, NO, VOCAB])};
const call = (x) => { if (CALLS) appendFileSync(CALLS, JSON.stringify(x) + '\\n'); };
const scoreOf = (text) => { const hit = SCORE_BY.find(([w]) => text.includes(w)); return hit ? hit[1] : 0.01; };
export class Tensor {
  constructor(type, data, dims) { this.type = type; this.data = data; this.dims = dims; this.size = data.length; }
}
const rowsOf = (x) => {
  if (!x || !x.data || !Array.isArray(x.dims)) return [];
  const L = x.dims[x.dims.length - 1];
  const B = x.data.length / L;
  return Array.from({ length: B }, (_, b) => Array.from(x.data.slice(b * L, (b + 1) * L), Number));
};
const describe = (x) => ({ isTensor: x instanceof Tensor, type: x?.type ?? null, array: x?.data?.constructor?.name ?? null, dims: x?.dims ?? null, rows: rowsOf(x) });
const HERE = ${JSON.stringify(join(pkg, '/'))};
export const env = {
  allowRemoteModels: true, remoteHost: 'https://huggingface.co/', remotePathTemplate: '{model}/resolve/{revision}/',
  allowLocalModels: true, localModelPath: HERE + 'models/', useFSCache: true, cacheDir: HERE + '.cache/',
  fetch: globalThis.fetch,
};
const settings = () => Object.fromEntries(Object.entries(env).filter(([, v]) => typeof v !== 'function'));
const textOf = (ids) => String.fromCodePoint(...ids.filter((x) => x > 31 && x <= 0x10ffff));
const encode = (text, options) => {
  call({ call: 'encode', text: String(text).slice(0, 200), options: options ?? null });
  const special = options?.add_special_tokens !== false;
  if (!special && text === 'yes') return [YES];
  if (!special && text === 'no') return [NO];
  const core = [...String(text)].map((c) => c.codePointAt(0));
  return special ? [CLS, ...core, SEP] : core;
};
const tokenizer = (text, options) => {
  call({ call: 'tokenizer', text: String(text).slice(0, 200), options: options ?? null });
  const ids = encode(text, options);
  return {
    input_ids: new Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
    attention_mask: new Tensor('int64', BigInt64Array.from(ids.map(() => 1n)), [1, ids.length]),
  };
};
tokenizer.encode = encode;
tokenizer.decode = (ids) => textOf(Array.from(ids, Number));
const loaded = (name, model) => ({
  from_pretrained: async (repo, options) => {
    call({ call: 'from_pretrained', name, repo, options: options ?? null, env: settings() });
    ${stderrMark ? "process.stderr.write('stand-in: from_pretrained called\\n');" : ''}
    return model;
  },
});
const head = async (inputs) => {
  const ids = describe(inputs?.input_ids);
  call({ call: 'head', keys: Object.keys(inputs ?? {}), input_ids: ids, attention_mask: describe(inputs?.attention_mask), token_type_ids: describe(inputs?.token_type_ids) });
  const scores = ids.rows.map((r) => scoreOf(textOf(r)));
  return { logits: new Tensor('float32', Float32Array.from(scores), [scores.length, 1]) };
};
const causal = async (enc) => {
  const ids = describe(enc?.input_ids);
  const row = ids.rows[0] ?? [];
  const text = textOf(row);
  call({ call: 'causal', length: row.length, text: text.slice(0, 2000) });
  const doc = text.split('<Document>: ')[1]?.split('<|im_end|>')[0] ?? '';
  const p = scoreOf(doc);
  const L = row.length;
  const data = new Float32Array(L * VOCAB);
  data[YES] = 9; data[NO] = -9;
  data[(L - 1) * VOCAB + YES] = Math.log(p);
  data[(L - 1) * VOCAB + NO] = Math.log(1 - p);
  return { logits: new Tensor('float32', data, [1, L, VOCAB]) };
};
export const AutoTokenizer = loaded('AutoTokenizer', tokenizer);
export const AutoModelForSequenceClassification = loaded('AutoModelForSequenceClassification', head);
export const AutoModelForCausalLM = loaded('AutoModelForCausalLM', causal);
export async function pipeline(task, model, options) {
  call({ call: 'pipeline', task, model, options: options ?? null });
  throw new Error('test stand-in: no pipeline for a reranker row');
}
`);
  return pkg;
}

// Writes the stand-in into <dir>/node_modules/@huggingface/transformers/.
export const installReranker = (dir, opts) => rerankStandIn(join(dir, 'node_modules', TRANSFORMERS), opts);
