// The rerank method of `al search` (LD-32), as bench-28 measured it: word
// search gives its top 30, a reranker scores them, and its order replaces the
// order of those 30. A reranker scores with its rerank head where its file
// has one, and from P(yes) / (P(yes) + P(no)) of the next token where it has
// none. The score functions take a running llama-server (llama.js) or the
// transformers.js library.
export const TOP = 30;
export const INSTRUCTION = 'Given the title and description of a code change, retrieve the files and spec paragraphs that the change touches';

// The first TOP hits in the reranker's order, highest score first (equal
// scores keep the word order), then the other hits as they were.
export async function rerank(query, hits, score) {
  if (!hits.length) return [];
  const top = hits.slice(0, TOP);
  const s = await score(query, top.map((h) => h.text));
  const order = top.map((h, i) => [h, s[i], i]).sort((a, b) => b[1] - a[1] || a[2] - b[2]).map(([h]) => h);
  return [...order, ...hits.slice(TOP)];
}

// The Qwen3-Reranker prompt of its model card, with the measured instruction.
const SYSTEM = 'Judge whether the Document meets the requirements based on the Query and the Instruct provided. Note that the answer can only be "yes" or "no".';
const prompt = (q, d) => `<|im_start|>system\n${SYSTEM}<|im_end|>\n<|im_start|>user\n<Instruct>: ${INSTRUCTION}\n<Query>: ${q}\n<Document>: ${d}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n`;

// A document cut to its first 512 tokens, by the server's own tokenizer.
async function cutOn(srv, text) {
  const { tokens } = await srv.post('/tokenize', { content: text, add_special: false, parse_special: false });
  return (await srv.post('/detokenize', { tokens: tokens.slice(0, 512) })).content;
}

// A GGUF file with a rerank head: one /v1/rerank request for all documents.
export function llamaHead(srv) {
  return async (query, texts) => {
    const documents = [];
    for (const t of texts) documents.push(await cutOn(srv, t));
    const { results } = await srv.post('/v1/rerank', { query, documents, top_n: documents.length });
    const by = new Map(results.map((r) => [r.index, r.relevance_score]));
    return documents.map((_, i) => by.get(i));
  };
}

// P(yes) / (P(yes) + P(no)) from the top log probabilities of the next token.
// A token not among them counts as -1e9: no "yes" gives 0, no "no" gives 1.
function yesShare(top) {
  const lp = {};
  for (const t of top ?? []) {
    if (t.token === 'yes' || t.token === 'no') lp[t.token] = 'logprob' in t ? t.logprob : Math.log(Math.max(t.prob, 1e-30));
  }
  const y = Math.exp(lp.yes ?? -1e9);
  const n = Math.exp(lp.no ?? -1e9);
  return y + n > 0 ? y / (y + n) : 0;
}

const PARALLEL = 8;

// A GGUF file with no rerank head: one /completion for each document, 8 at a time.
export function llamaYesNo(srv) {
  return async (query, texts) => {
    const docs = [];
    for (const t of texts) docs.push(await cutOn(srv, t));
    const out = new Array(docs.length);
    let next = 0;
    async function worker() {
      while (next < docs.length) {
        const i = next++;
        const r = await srv.post('/completion', { prompt: prompt(query, docs[i]), n_predict: 1, n_probs: 50, temperature: 0, cache_prompt: false, post_sampling_probs: false });
        const p = r.completion_probabilities?.[0];
        out[i] = yesShare(p?.top_logprobs ?? p?.top_probs);
      }
    }
    await Promise.all(Array.from({ length: Math.min(PARALLEL, docs.length) }, worker));
    return out;
  };
}

// The transformers.js tokenizer and model, loaded once, at the revision that was measured.
function loader(lib, { repo, revision, dtype }, Model) {
  let loaded = null;
  return () => {
    loaded ??= (async () => {
      lib.env.remotePathTemplate = `{model}/resolve/${revision}/`;
      const tok = await lib.AutoTokenizer.from_pretrained(repo);
      const model = await lib[Model].from_pretrained(repo, { dtype });
      return { tok, model };
    })();
    return loaded;
  };
}
const cutTok = (tok, d) => tok.decode(tok.encode(d, { add_special_tokens: false }).slice(0, 512));
const int64 = (lib, rows, B, L) => {
  const a = new BigInt64Array(B * L);
  rows.forEach((r, b) => r.forEach((v, j) => { a[b * L + j] = BigInt(v); }));
  return new lib.Tensor('int64', a, [B, L]);
};

// ms-marco-MiniLM: a classification head over [CLS] query [SEP] document [SEP],
// at most 512 tokens, the query at most 200; one batch for all documents.
export function tjsHead(lib, opts) {
  const load = loader(lib, opts, 'AutoModelForSequenceClassification');
  return async (query, texts) => {
    const { tok, model } = await load();
    const [cls, sep] = tok.encode('', { add_special_tokens: true });
    const q = tok.encode(query, { add_special_tokens: false }).slice(0, 200);
    const ids = [];
    const types = [];
    for (const t of texts) {
      const d = tok.encode(cutTok(tok, t), { add_special_tokens: false }).slice(0, 512 - 3 - q.length);
      ids.push([cls, ...q, sep, ...d, sep]);
      types.push([...new Array(q.length + 2).fill(0), ...new Array(d.length + 1).fill(1)]);
    }
    const B = ids.length;
    const L = Math.max(...ids.map((r) => r.length));
    const out = await model({ input_ids: int64(lib, ids, B, L), attention_mask: int64(lib, ids.map((r) => r.map(() => 1)), B, L), token_type_ids: int64(lib, types, B, L) });
    return Array.from(out.logits.data, Number).slice(0, B);
  };
}

// Qwen3-Reranker-0.6B ONNX: no head; the yes and no logits at the last position, one document at a time.
export function tjsYesNo(lib, opts) {
  const load = loader(lib, opts, 'AutoModelForCausalLM');
  return async (query, texts) => {
    const { tok, model } = await load();
    const y = tok.encode('yes', { add_special_tokens: false });
    const n = tok.encode('no', { add_special_tokens: false });
    if (y.length !== 1 || n.length !== 1) throw new Error(`"yes" and "no" are not single tokens of ${opts.repo}: ${y} ${n}`);
    const out = [];
    for (const t of texts) {
      const { logits } = await model(tok(prompt(query, cutTok(tok, t)), { add_special_tokens: false }));
      const [, L, V] = logits.dims;
      const ly = Number(logits.data[(L - 1) * V + y[0]]);
      const ln = Number(logits.data[(L - 1) * V + n[0]]);
      const m = Math.max(ly, ln);
      out.push(Math.exp(ly - m) / (Math.exp(ly - m) + Math.exp(ln - m)));
    }
    return out;
  };
}
