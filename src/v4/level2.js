// Level 2 of `al search` (design.md 11): the embedding model and the vectors.
// `al search` gives it the rows to embed and a query, and it answers with the
// row keys ranked by similarity; search.js fuses that list with its full-text
// list. The model is the row of the measured table (models.js) that the
// `search` setting names.
//
// The vectors live beside al's index, in <dir>/vectors.sqlite. Only new or
// changed rows are embedded; a change of model embeds everything again.
// The model's library, @huggingface/transformers, is an optional peer
// dependency: it is found by normal Node resolution (the project first, then
// beside al) and imported only at the first embed, so no other command and no
// search without words loads it.
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { EMBEDS } from './models.js';

const BATCH = 32;

// node:sqlite is imported here, not at load, so a Node without it still
// loads this file and falls back by search.js's own check.
async function open(dir) {
  const { DatabaseSync } = await import('node:sqlite');
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, 'vectors.sqlite'));
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
    CREATE TABLE IF NOT EXISTS vectors (key TEXT PRIMARY KEY, sha256 TEXT NOT NULL, vec BLOB NOT NULL);
  `);
  return db;
}

// A vector as unit length, so a dot product is the cosine.
function unit(v) {
  const a = Float32Array.from(v);
  let n = 0;
  for (const x of a) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < a.length; i++) a[i] /= n;
  return a;
}
const blob = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const vector = (b) => new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));

async function embedAll(embed, texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const part = texts.slice(i, i + BATCH);
    const vs = await embed(part);
    if (!Array.isArray(vs) || vs.length !== part.length) throw new Error(`the model gave ${vs?.length ?? 'no'} vectors for ${part.length} texts`);
    out.push(...vs.map(unit));
  }
  if (out.some((v) => v.length !== out[0].length)) throw new Error('the model gave vectors of different lengths');
  return out;
}

// A level-2 object: `model` names it in al's output, and `key` (default
// `model`) in the stored vectors; `embed(texts)` gives one vector per text.
// `queryPrefix` is put before a query, `rowPrefix` before each row.
function createLevel2({ model, key = model, embed, queryPrefix = '', rowPrefix = '' }) {
  if (typeof model !== 'string' || !model) throw new Error('createLevel2 needs a model name');
  if (typeof embed !== 'function') throw new Error('createLevel2 needs an embed function');
  return {
    model,

    // Makes the stored vectors match `rows` ([{ key, sha256, text }]):
    // embeds the new and changed rows and removes the others.
    async refresh({ dir, rows }) {
      const db = await open(dir);
      try {
        if (db.prepare("SELECT v FROM meta WHERE k = 'model'").get()?.v !== key) {
          db.exec('DELETE FROM vectors');
          db.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('model', ?)").run(key);
        }
        const have = new Map(db.prepare('SELECT key, sha256 FROM vectors').all().map((x) => [x.key, x.sha256]));
        const want = new Map(rows.map((r) => [r.key, r]));
        const todo = rows.filter((r) => have.get(r.key) !== r.sha256);
        const vs = await embedAll(embed, todo.map((r) => `${rowPrefix}${r.text}`));
        db.exec('BEGIN');
        const del = db.prepare('DELETE FROM vectors WHERE key = ?');
        let removed = 0;
        for (const k of have.keys()) if (!want.has(k)) { del.run(k); removed += 1; }
        const put = db.prepare('INSERT OR REPLACE INTO vectors (key, sha256, vec) VALUES (?, ?, ?)');
        todo.forEach((r, i) => put.run(r.key, r.sha256, blob(vs[i])));
        db.exec('COMMIT');
        return { embedded: todo.length, removed };
      } finally {
        db.close();
      }
    },

    // The `keys` ranked by similarity to `query`, best first, at most `k`.
    // A plain scan of the stored vectors: no vector database is needed at
    // this size (design.md 11).
    async rank({ dir, query, keys, k }) {
      const [q] = await embedAll(embed, [`${queryPrefix}${query}`]);
      const db = await open(dir);
      try {
        const wanted = new Set(keys);
        const scored = [];
        for (const { key, vec } of db.prepare('SELECT key, vec FROM vectors').all()) {
          if (!wanted.has(key)) continue;
          const v = vector(vec);
          if (v.length !== q.length) throw new Error('the stored vectors and the query differ in length');
          let s = 0;
          for (let i = 0; i < v.length; i++) s += v[i] * q[i];
          scored.push([key, s]);
        }
        scored.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
        return scored.slice(0, k).map(([key]) => key);
      } finally {
        db.close();
      }
    },
  };
}

export const LIBRARY = '@huggingface/transformers';
const VERSION = '4.3.1';
export const INSTALL = `npm install --global @assuredloop/cli ${LIBRARY}@${VERSION}`;

// The library's path by normal Node resolution: from the project, then
// beside al. Null when neither has it.
export function findLibrary(top) {
  for (const from of [join(top, 'package.json'), import.meta.url]) {
    try { return createRequire(from).resolve(LIBRARY); } catch { /* not here */ }
  }
  return null;
}

// The rows were measured (#28) with the library's tokenizer and model, not
// its pipeline: the pipeline's own cut drops the closing special token. So
// a text of more than MAX ids keeps its first MAX - 1 ids and its last one.
const MAX = 512;

// Level 2 with the library at `path` and the measured `row`, whose model is
// pinned by its commit and loaded with the row's precision and device. The
// library is imported at the first embed. Before it fetches the model, al
// writes the download size to standard error.
export function level2(path, row) {
  const [model, precision, runtime] = row.name.split(' ');
  const how = EMBEDS[model];
  let extractor = null;
  let Tensor = null;
  async function load() {
    try {
      // The path is the library's require entry; its exports may come as a default.
      const mod = await import(pathToFileURL(path).href);
      const pipeline = mod.pipeline ?? mod.default?.pipeline;
      const env = mod.env ?? mod.default?.env;
      Tensor = mod.Tensor ?? mod.default?.Tensor;
      if (typeof pipeline !== 'function') throw new Error(`${path} has no pipeline function`);
      // The library's pipeline() looks for some files at revision main,
      // whatever its revision option says, and so asks the network on each
      // load (#39). So the revision goes into every remote URL instead, and
      // into the cache folder, as the cache's keys do not name it.
      env.remotePathTemplate = `{model}/resolve/${row.commit}/`;
      if (basename(env.cacheDir) !== row.commit) env.cacheDir = join(env.cacheDir, row.commit);
      // The library keeps a file at <cacheDir>/<model repo>/<file>.
      if (row.files.some(([file]) => !existsSync(join(env.cacheDir, ...row.repo.split('/'), ...file.split('/'))))) {
        const mb = Math.round(row.files.reduce((s, [, bytes]) => s + bytes, 0) / 1e6);
        process.stderr.write(`al: fetching the model ${row.name} (${mb} MB), once\n`);
      }
      extractor = await pipeline('feature-extraction', row.repo, { dtype: precision, device: runtime.slice('tjs-'.length) });
    } catch (e) {
      throw new Error(`the model ${row.repo} did not load: ${e.message ?? e}`);
    }
  }
  // One batch, as it was measured: each text's ids with their special tokens,
  // cut to MAX; padded by hand to the longest; the model called once; the
  // vector read where the model keeps it. The library adds token_type_ids
  // where a model needs them.
  async function embed(texts) {
    if (!extractor) await load();
    const { tokenizer } = extractor;
    const ids = texts.map((t) => {
      const x = tokenizer.encode(t);
      return x.length > MAX ? [...x.slice(0, MAX - 1), x[x.length - 1]] : x;
    });
    const B = ids.length;
    const L = Math.max(...ids.map((x) => x.length));
    const input = new BigInt64Array(B * L).fill(BigInt(tokenizer.pad_token_id ?? 0));
    const mask = new BigInt64Array(B * L);
    ids.forEach((x, b) => {
      const o = b * L + (how.left ? L - x.length : 0);
      x.forEach((v, j) => { input[o + j] = BigInt(v); mask[o + j] = 1n; });
    });
    const out = await extractor.model({ input_ids: new Tensor('int64', input, [B, L]), attention_mask: new Tensor('int64', mask, [B, L]) });
    if (how.pool === 'sentence_embedding') {
      const e = out.sentence_embedding;
      const D = e.dims[1];
      return ids.map((_, b) => Array.from(e.data.subarray(b * D, (b + 1) * D)));
    }
    const h = out.last_hidden_state;
    const D = h.dims[2];
    return ids.map((x, b) => {
      const t = how.pool === 'first' ? 0 : how.left ? L - 1 : x.length - 1;
      const o = (b * L + t) * D;
      return Array.from(h.data.subarray(o, o + D));
    });
  }
  return createLevel2({ model: row.name, key: `${row.name}@${row.commit}`, embed, queryPrefix: how.query, rowPrefix: how.row });
}
