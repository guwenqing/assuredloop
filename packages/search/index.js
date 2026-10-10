// @assuredloop/search: level 2 of `al search` (design.md 11). It holds the
// embedding model and the vectors, which `al` itself never holds: `al` gives
// it the rows to embed and a query, and it answers with the row keys ranked
// by similarity. `al` fuses that list with its full-text list.
//
// The vectors live beside al's index, in <dir>/vectors.sqlite. Only new or
// changed rows are embedded; a change of model embeds everything again.
// Nothing here imports a dependency at load time: the real model's runtime
// is loaded on the first embed.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const BATCH = 32;

function open(dir) {
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

// A level-2 object for `al`: `model` names it in al's output; `embed(texts)`
// gives one vector per text. `queryPrefix` is put before a query only.
export function createLevel2({ model, embed, queryPrefix = '' }) {
  if (typeof model !== 'string' || !model) throw new Error('createLevel2 needs a model name');
  if (typeof embed !== 'function') throw new Error('createLevel2 needs an embed function');
  return {
    model,

    // Makes the stored vectors match `rows` ([{ key, sha256, text }]):
    // embeds the new and changed rows and removes the others.
    async refresh({ dir, rows }) {
      const db = open(dir);
      try {
        if (db.prepare("SELECT v FROM meta WHERE k = 'model'").get()?.v !== model) {
          db.exec('DELETE FROM vectors');
          db.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('model', ?)").run(model);
        }
        const have = new Map(db.prepare('SELECT key, sha256 FROM vectors').all().map((x) => [x.key, x.sha256]));
        const want = new Map(rows.map((r) => [r.key, r]));
        const todo = rows.filter((r) => have.get(r.key) !== r.sha256);
        const vs = await embedAll(embed, todo.map((r) => r.text));
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
      const db = open(dir);
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

// The real model: bge-small-en-v1.5 (MIT), the ONNX port, pinned by revision.
const MODEL = 'Xenova/bge-small-en-v1.5';
const REVISION = 'ea104dacec62c0de699686887e3f920caeb4f3e3';
let extractor = null;

async function embedReal(texts) {
  if (!extractor) {
    const { pipeline } = await import('@huggingface/transformers');
    extractor = await pipeline('feature-extraction', MODEL, { revision: REVISION, dtype: 'q8' });
  }
  // bge takes the first token's vector (CLS pooling).
  const out = await extractor(texts, { pooling: 'cls', normalize: true });
  return out.tolist();
}

export default createLevel2({
  model: `${MODEL}@${REVISION.slice(0, 12)}`,
  embed: embedReal,
  // bge's instruction for a short query that looks for passages.
  queryPrefix: 'Represent this sentence for searching relevant passages: ',
});
