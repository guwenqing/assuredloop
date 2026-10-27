// #99, second round (DES-80: "The model is the row that the setting names:
// its model repo pinned by its commit, with the row's precision and device,
// embedded as the row was measured"). The rows were measured with one
// recipe (the bench of issue #28):
// 1. each text (with the row's prefix) goes through the pipeline's
//    tokenizer.encode, with its special tokens and no truncation;
// 2. a list of more than 512 ids is cut to the first 511 ids and the last;
// 3. a batch is padded by hand to its longest list with the tokenizer's
//    pad_token_id (0 when it has none): on the left for Qwen3-Embedding, on
//    the right for bge-small and EmbeddingGemma;
// 4. the model is called once per batch with input_ids and attention_mask,
//    each a Tensor('int64', BigInt64Array, [B, L]);
// 5. the vector of a text is sentence_embedding for EmbeddingGemma,
//    last_hidden_state at the last real position for Qwen3, and
//    last_hidden_state at position 0 (the CLS token) for bge-small.
// The stand-in library (helpers/search.js) records each call, and its model
// puts a text's meaning only at the documented place, so a search ranks by
// meaning only when al reads that place. checkRecipe (helpers/kb-search.js)
// checks steps 1 to 4. Built from the spec and the public interface only;
// nothing here reads src/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { commitAll, doc, project, write, writeConfig } from './helpers/project.js';
import { callsOf, cutIds, installEmbedder, runOk, search, show, standInIds } from './helpers/search.js';
import { HUGE_MAC, checkRecipe, fakeComputer } from './helpers/kb-search.js';

// One row of each model.
const ROWS = [
  ['bge', 'bge-small-en-v1.5 q8 tjs-cpu'],
  ['gemma', 'embeddinggemma-300m q8 tjs-cpu'],
  ['qwen', 'qwen3-embedding-0.6b q4 tjs-cpu'],
];

// A text of more than 512 words, with no word of a concept.
const LONG = `Rule start ${Array.from({ length: 600 }, (_, i) => `w${i + 1}`).join(' ')} rule end.`;

// Each rule has the word of one concept of the stand-in (helpers/search.js,
// CONCEPTS). The queries below use another word of the same concept, which
// no text has, so only the vectors can find the rule.
const RULES = doc([
  ['RUL-1 note', '# Rules'],
  ['RUL-2 rule', 'Each token MUST be secret.'],
  ['RUL-3 rule', 'Each CSV file MUST have a header row.'],
  ['RUL-4 rule', 'The link MUST expire after one hour.'],
  ['RUL-5 rule', LONG],
  ['RUL-6 rule', 'Each invoice MUST have a number.'],
  ['RUL-7 rule', 'A reminder MUST go out each week.'],
]);
const QUERIES = [['url', 'RUL-4'], ['bill', 'RUL-6'], ['spreadsheet', 'RUL-3']];

// A repo whose setting names the row, with the stand-in and a fake Mac with room.
function repo(t, row, standIn = {}) {
  const dir = project(t);
  write(dir, '.gitignore', 'node_modules/\n');
  writeConfig(dir, [{ file: 'specs/rules.md', prefix: 'RUL' }], { repo: 'acme', search: { local: row } });
  write(dir, 'specs/rules.md', RULES);
  commitAll(dir, 'A: the rules');
  const calls = join(dir, '.git', 'embed-calls.log');
  const log = join(dir, '.git', 'embed-test.log');
  installEmbedder(dir, { calls, log, ...standIn });
  const pc = fakeComputer(join(dir, '.git', 'fake-computer'), HUGE_MAC);
  return { dir, calls, log, opts: { nodeArgs: pc.nodeArgs, env: pc.env } };
}

for (const [family, row] of ROWS) {
  test(`#99 ${row}: each text is encoded with no truncation, cut to 511 ids and the last, padded on the ${family === 'qwen' ? 'left' : 'right'} with the pad id, and given to the model as int64 tensors`, (t) => {
    const f = repo(t, row);
    const out = search(f.dir, ['url'], f.opts);
    assert.equal(out.level, 2, `level 2 answered (fallback: ${out.fallback})`);
    const { encodes, reached } = checkRecipe(f.calls, family);
    const long = encodes.filter((e) => standInIds(e.text, family).length > 512);
    assert.ok(long.length > 0, 'the fixture: RUL-5 has more than 512 ids');
    for (const e of long) {
      const all = standInIds(e.text, family);
      const cut = cutIds(all);
      assert.equal(cut.length, 512);
      assert.deepEqual(cut, [...all.slice(0, 511), all[all.length - 1]], 'the first 511 ids and the last');
      assert.ok(reached.some((r) => r.length === 512 && r.join(',') === cut.join(',')), 'the long text reaches the model as exactly those 512 ids');
    }
    const short = encodes.filter((e) => standInIds(e.text, family).length <= 512);
    assert.ok(short.length > 0, 'the fixture: short texts too');
    for (const e of short) {
      const ids = standInIds(e.text, family).join(',');
      assert.ok(reached.some((r) => r.join(',') === ids), `a short text reaches the model whole: ${e.text.slice(0, 80)}`);
    }
  });

  test(`#99 ${row}: al uses the vector at the documented place (${{ bge: 'last_hidden_state at position 0', gemma: 'sentence_embedding', qwen: 'last_hidden_state at the last real position' }[family]}): each query finds its rule by meaning first`, (t) => {
    const f = repo(t, row);
    for (const [word, id] of QUERIES) {
      const words = search(f.dir, [word], { ...f.opts, level: 1 });
      assert.deepEqual(words.hits.filter((h) => h.role !== 'file'), [], `the fixture: no text has the word ${word}`);
      const out = search(f.dir, [word], f.opts);
      assert.equal(out.level, 2, `level 2 answered (fallback: ${out.fallback})`);
      assert.equal(out.hits[0]?.id, id, `"${word}" finds ${id} first, by the vector at the documented place:\n${out.hits.map((h) => `${h.id} ${h.role}`).join('\n')}`);
    }
    // The ranks come from the model's outputs, not from the extractor's pooling.
    const all = callsOf(f.calls);
    assert.ok(all.some((c) => c.call === 'model'), 'the model was called');
    assert.deepEqual(all.filter((c) => c.call === 'extract'), [], 'no text went through extractor(texts, { pooling })');
  });
}

for (const [family, row] of ROWS.filter(([fam]) => fam !== 'gemma')) {
  test(`#99 ${row}: a tokenizer with no pad_token_id pads with 0`, (t) => {
    const f = repo(t, row, { padTokenId: null });
    const r = runOk(f.dir, ['search', 'url'], f.opts);
    assert.match(r.stdout.split('\n')[0], /^Level\s+2\b/, show(r));
    checkRecipe(f.calls, family, { pad: null });
  });
}

test('#99 EmbeddingGemma: a tokenizer with no pad_token_id pads with 0', (t) => {
  const f = repo(t, 'embeddinggemma-300m fp32 tjs-cpu', { padTokenId: null });
  const r = runOk(f.dir, ['search', 'url'], f.opts);
  assert.match(r.stdout.split('\n')[0], /^Level\s+2\b/, show(r));
  checkRecipe(f.calls, 'gemma', { pad: null });
});
