<!-- SP-1 note -->

# Level 2 search with no package of ours: the change spec

<!-- SP-2 note -->

This change serves R1 in `request.md`. It moves level 2 search into `al`,
and names the embedding model's library as an optional peer dependency.

<!-- SP-3 rule serves:R1 changes:DES-65 -->

**The search levels** (input 130):

| Level | Setup | Status |
|---|---|---|
| 0 | No index: `al`'s exact views and the agent's grep. | always there |
| 1 | Local full text: `al export` into a SQLite FTS5 (BM25) index, with the ID in its own exact column. | built in |
| 2 | Local hybrid: level 1 plus a small local embedding model; vectors stored beside the text; word and vector results fused (reciprocal rank fusion); the same roles and queries. | **default** |
| 3 | Mixed: the local index of level 2, with embeddings from a hosted service, preferably on Google Cloud; a hosted shared index may follow. | future |

- One search command answers at the strongest level that is installed, falls
  back 2 → 1 → 0 by itself, and says which level answered. Every level keeps
  exact-ID lookup, the roles, the commit identity and the history scope; only
  the strength changes.
- Level 1 needs no new dependency: Node's built-in `node:sqlite` has FTS5
  (checked on Node 24.21.0 and 26.11.1, with SQLite 3.53.4). It lives in `al`
  itself, as `al search`, and stays deterministic and offline. The package
  declares Node 24 or newer, and CI tests level 1 on Node 24.
- Level 2 adds an embedding model, whose library the user installs (below).
  Without the library, `al search` answers at level 1, and a `Not known` line
  says how to add level 2.
- The fusion is reciprocal rank fusion over the rows that have vectors. A row
  with no vector keeps its level 1 place, because the vector list gives it no
  vote and must not push it down.
  Candidate models: bge-small-en-v1.5 (MIT) or EmbeddingGemma-300M; a
  multilingual one (Qwen3-Embedding-0.6B) for specs not in English. At this
  size a plain scan of the stored vectors is fast enough, so no vector
  database is needed (an estimate: 20,000 rows of 384 numbers per query).
  The only data that leaves the machine is the model download.
- Level 2 stays optional, because it costs every user a model download and a
  native runtime, and CI needs no search (input 131: "if it is not costing a
  lot, optional is good for user"). The recommended install includes it, so
  level 2 is the default in practice.
- Level 3 is future work. Candidates on Google Cloud: Gemini or Vertex AI
  embeddings for the mixed setup; later a hosted index (for example Vertex AI
  RAG Engine, Vertex AI Vector Search, or pgvector on Cloud SQL or AlloyDB).
  Prices and data terms are not checked yet.
- All levels read the same export and rebuild the same way, so a user moves
  between levels with no change to the records.
- The tool's tests run the search tests at levels 0, 1 and 2: level 2 with a
  small fixed test embedder for exact results, plus one smoke test with a real
  model. Validation compares level 1 with level 2 on the golden questions, so
  the default is checked, not assumed.
- The first check (T14): on 8 held-out questions over the small invoicer
  fixture, level 2 equalled level 1, with recall of 29% in the top 5 and 58%
  in the top 10. So level 2 showed no measured gain at that size. It stays
  the default (input 130), and it is measured again on a larger real corpus
  before the release.

<!-- SP-6 component serves:R1,assuredloop-v4/R10 builds-on:SP-3 -->

Where level 2 lives: its code is in `al`; its library,
`@huggingface/transformers` pinned at 4.3.1, is not our code and is no
package of ours. `al` names the library as an optional peer dependency, so
npm installs it only when the user asks:
`npm install --global @assuredloop/cli @huggingface/transformers@4.3.1`.
`al` finds it by normal Node resolution: the project first, then beside
`al`. Only `al search` loads it, at its first embed.

<!-- SP-4 approach serves:R1 builds-on:SP-3 -->

How this change is built: the level 2 code of `packages/search/index.js`
moves into `src/v4/level2.js`. `al search` resolves the library's path to
choose the level, and imports the library only at the first embed. The tests
put a stand-in `@huggingface/transformers` with a fixed test embedder into
the test project's `node_modules/`. The real-model smoke test runs only when
the library resolves from the repo, so CI does not download it.

<!-- SP-5 plan serves:R1 -->

The plan, in one PR (issue #212):
1. Move the code, add the peer dependency, and remove `packages/search/`.
2. Return `publish.yml` to one package, and take the cache fill for the
   search package out of `test.yml` and `publish.yml`.
3. Give the README its two install lines, and set the version to 0.2.1.
4. Consolidate SP-3 into `specs/design.md` as `DES-65`, and SP-6 as a new
   design paragraph after it.
