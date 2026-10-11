<!-- SP-1 note -->

# Promises hold no design detail: the change spec

<!-- SP-2 note -->

This change serves R1 in `request.md`. It moves design detail out of seven
promise paragraphs of `specs/design.md` into new paragraphs of a design kind.
Each promise keeps its meaning. The list of splits is on issue #214.

<!-- SP-3 rule serves:R1 changes:DES-22 -->

**What the script checks** (no AI):
- A paragraph with no ID: `not ok`. A promise or design paragraph with no kind
  or no link: a hint; under opt-in `--strict`, `not ok`. An adopted paragraph
  (section 5) gets no link hint while its text equals the captured text.
- A link to an ID that does not exist: `not ok`. When another change removed
  the target, the link gets the hint "target removed" instead, and the open
  change aligns.
- Two headings with the same text under the same parent (the same heading
  path): a hint. The same text under different parents is valid. Why: the
  OpenSpec CLI caught duplicate requirement names that the v4 model missed
  (validation.md B6).
- Per PR, the ID lint: IDs lost since the base, IDs used twice, and IDs used
  again after removal. Agents can remove comments near the lines they edit
  (claude-code issue #22530), so a lost ID must be caught. A lost ID is at the
  base, absent at the head in every doc of its scope, and named by no
  `removes:`. An ID used again is absent at the base but was used in an
  earlier commit.
- A per-paragraph hash list, from which the script derives each paragraph's
  change in the PR: Changed, Moved, New or Removed.
- A non-promise kind whose text holds requirement words (MUST, SHALL, MUST
  NOT, SHOULD, MAY, never, always): the hint "promise kind?". ISO/IEC
  Directives Part 2 says notes "shall not contain requirements". It is only a
  hint: an example can quote a MUST correctly, and a new promise can hold no
  such word.
- A change paragraph whose text is close to an existing spec paragraph, with
  no `changes` or `builds on` link to it: the hint "does this change
  INV-12?".
- A change of kind from a promise kind to any other kind counts as a promise
  change.
- The exit code is 0 by default, even when `not ok` lines print. Under
  `--strict`, the exit is 1 when any `not ok` prints. `--strict` raises only
  the findings that need no judgment: no kind, no link, an invalid
  disposition, and the marker lints. The hints that need judgment stay hints
  under `--strict`: near match, "promise kind?", the typo mark, overlap,
  stale base, a stale AI hint, an ADR that governs, and a removed target.

<!-- SP-4 choice serves:R1,assuredloop-v4/R2,assuredloop-v4/R11 builds-on:SP-3 -->

Close means a word-set similarity (Dice) of 0.6 or more, one named
constant.

<!-- SP-5 rule serves:R1 changes:DES-58 -->

- `.assuredloop/schema.yaml`: the schema, with a version. The owner and the
  architect design it. A user's extension gets the same careful review.
- `.assuredloop/records/`, committed to git:
  - one record per request: the chain of that change, its bindings (section
    4) and its dispositions (section 5). Mostly that change's own PRs touch
    it.
  - one record per doc: only fields that the script can regenerate (hash
    list, display numbers, derived change kinds), and the AI hints where a
    project uses them.
- On a merge conflict in a per-doc record: run the index again to rebuild the
  regenerable fields. Conflicting optional AI hints may be dropped and shown
  as absent; no AI refresh is required. Bindings are never in a per-doc
  record, so a re-run cannot erase them.
- The developer's agent writes the markers in the PR, and the review reads
  them (input 98). The script writes the derived facts.
- AI hints and declared outputs are optional. A PR never needs them. A
  project fills AI hints only where it uses search level 2 or higher. Why: in
  validation, no AI hint changed a verdict; their own cost was not measured
  (validation.md section 9).
- **AI hints** (summaries, tags, quotes):
  - Each hint records the paragraph hash it was made from. A hint is stale
    when the paragraph's hash differs, even if its quote still matches: a
    kept sentence does not keep the rest of a summary true.
  - Where a project uses hints, the agent refreshes them only for paragraphs
    that the PR changed. An empty or missing hint is an honest state, not a
    defect.
- The kinds and the declared links are checked data, in the limited sense of
  section 3. The AI summaries and tags are hints (input 123).
- Checks give hints by default. A project that wants blocks turns on
  `--strict` in its CI, and the README advises it (input 123).
- The core checks stay deterministic: no AI, network or database calls.

<!-- SP-6 data serves:R1,assuredloop-v4/R10,assuredloop-v4/R12 builds-on:SP-5 -->

A quote is scoped to its paragraph ID and the paragraph's source version.
It holds the exact text by default. It adds `prefix` and `suffix` (the W3C
Web Annotation TextQuoteSelector form) only when the exact text occurs more
than once in that paragraph. A fuzzy re-anchor stays a hint.

<!-- SP-7 choice serves:R1,assuredloop-v4/R10,assuredloop-v4/R12 builds-on:SP-5 -->

The search command may use a local SQLite index (section 11); no check
depends on it. `al` may use a pinned YAML library; zero dependencies is the
least important goal (input 99).

<!-- SP-8 rule serves:R1 changes:DES-64 -->

**Queries:**
- The default query is the current system: `baseline` rows at the selected
  central commit.
- A change-context query, for one selected change, adds its live `proposal`
  and `spike` text, its `source` rows and its `evidence` rows to the default
  query, so all `baseline` rows stay in.
- A history query adds `history` rows, never shown as current promises.
- Each hit shows its role and its commit. All roles stay in the level 1
  full-text index, so they can be found by their words even where level 2
  does not embed them.
- IDs resolve exactly, in their own column, never through search.

<!-- SP-9 component serves:R1,assuredloop-v4/R10 builds-on:SP-8 -->

- A chunk is one paragraph version, the unit that carries the ID, with a fixed
  header (file title, heading path, kind, ID). The parent section is returned
  on request.
- A rebuild compares paragraph hashes with an index manifest (model, chunk
  rule), embeds only new or changed rows, and rebuilds everything when the
  manifest changes. It removes from the current index every row missing from
  the commit's full listing; the history index keeps every version. An
  incremental index walks only each repo's commits after the last one in the
  manifest.
- The index is one SQLite file in the repo's git folder
  (`$(git rev-parse --git-path assuredloop)/search.sqlite`), never committed.
  One index serves the central repo and its output repos.
- No `llms.txt`: it has no measured benefit.

<!-- SP-10 rule serves:R1 changes:DES-65 -->

**The search levels** (input 130):

| Level | Setup | Status |
|---|---|---|
| 0 | No index: `al`'s exact views and the agent's grep. | always there |
| 1 | Local full text: `al export` into an index, with the ID in its own exact column. | built in |
| 2 | Local hybrid: level 1 plus a small local embedding model; vectors stored beside the text; word and vector results fused; the same roles and queries. | **default** |
| 3 | Mixed: the local index of level 2, with embeddings from a hosted service, preferably on Google Cloud; a hosted shared index may follow. | future |

- One search command answers at the strongest level that is installed, falls
  back 2 → 1 → 0 by itself, and says which level answered. Every level keeps
  exact-ID lookup, the roles, the commit identity and the history scope; only
  the strength changes.
- Level 1 needs no new dependency. It lives in `al` itself, as `al search`,
  and stays deterministic and offline.
- Level 2 adds an embedding model, whose library the user installs (below).
  Without the library, `al search` answers at level 1, and a `Not known` line
  says how to add level 2.
- The only data that leaves the machine is the model download.
- Level 2 stays optional, because it costs every user a model download and a
  native runtime, and CI needs no search (input 131: "if it is not costing a
  lot, optional is good for user"). The recommended install includes it, so
  level 2 is the default in practice.
- Level 3 is future work.
- All levels read the same export and rebuild the same way, so a user moves
  between levels with no change to the records.
- The first check (T14): on 8 held-out questions over the small invoicer
  fixture, level 2 equalled level 1, with recall of 29% in the top 5 and 58%
  in the top 10. So level 2 showed no measured gain at that size. It stays
  the default (input 130), and it is measured again on a larger real corpus
  before the release.

<!-- SP-11 component serves:R1,assuredloop-v4/R10 builds-on:SP-10 -->

- Level 1 is a SQLite FTS5 (BM25) index. Node's built-in `node:sqlite` has
  FTS5 (checked on Node 24.21.0 and 26.11.1, with SQLite 3.53.4). The package
  declares Node 24 or newer, and CI tests level 1 on Node 24.
- The fusion is reciprocal rank fusion over the rows that have vectors. A row
  with no vector keeps its level 1 place, because the vector list gives it no
  vote and must not push it down.
  Candidate models: bge-small-en-v1.5 (MIT) or EmbeddingGemma-300M; a
  multilingual one (Qwen3-Embedding-0.6B) for specs not in English. At this
  size a plain scan of the stored vectors is fast enough, so no vector
  database is needed (an estimate: 20,000 rows of 384 numbers per query).
- Level 3: candidates on Google Cloud: Gemini or Vertex AI embeddings for the
  mixed setup; later a hosted index (for example Vertex AI RAG Engine, Vertex
  AI Vector Search, or pgvector on Cloud SQL or AlloyDB). Prices and data
  terms are not checked yet.
- The tool's tests run the search tests at levels 0, 1 and 2: level 2 with a
  small fixed test embedder for exact results, plus one smoke test with a real
  model. Validation compares level 1 with level 2 on the golden questions, so
  the default is checked, not assumed.

<!-- SP-12 rule serves:R1 changes:DES-69 -->

- The central repo holds the spec (`specs/`, `specs/adr/`), the requests and
  the records. Its `config.yaml` lists the output repos, each with a name,
  the path of a local clone, and a selected or pinned commit. A URL is only a
  note for people: `al` never fetches.
- An output repo holds code, tests and user documents only: no spec and no
  requests. Its config names the central repo, so `al` there can resolve
  central IDs for hints.
- Output links to the central spec with qualified IDs, both ways: code and
  tests in an output repo cite central IDs (`central:INV-41`,
  `central:invoice-exports/R3`), and a central request's task names the output
  repo's PR (`invoicer-web#57`). A binding records the output repo's commit,
  so the evidence stays exact.
- The sign-off stays in the central repo. An output-repo PR that changes a
  promise names the central request that covers it; a fix says
  `Tier: 0 — restores central:INV-41`.
- `al` in the central repo derives the cross-repo links (cites, rough links
  from git, results) from local clones of the output repos at known commits. A
  repo that is not present gives "unknown", never a guess.
- The central `config.yaml` lists `outputs:`, each with `name`, `path`, and an
  optional `url` and `commit`. With no `commit`, `al` uses the clone's HEAD and
  shows that commit. An output repo's config names `central: {path, commit}`.
  A repo is the central repo, so that `central:X` means its own X, only when
  its config lists outputs.
- `al` reads another repo only through git at the resolved commit, never its
  working tree, and it never fetches. A repo with no path, no clone or a
  commit that does not resolve is "unknown", with the reason.
- The links from an output repo are those of schema.md 6. A commit message
  that names a central task (`central:<request>/T1`) is a `named by` link.
  Other IDs in commit messages make no link.
- `al` shows "merged at <sha>", or "no merge found" as unknown, never "not
  merged".
- In an output repo, `al check` looks up the central IDs that the branch's
  changed files cite.

<!-- SP-13 flow serves:R1,assuredloop-v4/R8,assuredloop-v4/R13 builds-on:SP-12 -->

Git maps a PR reference such as `invoicer-web#57` to its merge: "Merge pull
request #57", or a subject that ends in "(#57)", in the first-parent history
at the selected commit. One function does this for the central repo and the
output repos.

<!-- SP-14 limit serves:R1 changes:DES-77 -->

- Node 24 or newer.
- Every dependency is pinned, and no release newer than 24 hours is used.

<!-- SP-15 choice serves:R1,assuredloop-v4/R12 builds-on:SP-14 -->

T13 tests `node:sqlite` with FTS5 on the minimum version; if Node 24 lacks
it, the minimum goes up.

<!-- SP-16 rule serves:R1 changes:DES-78 -->

Build decisions (the architect, 2026-10-10, recorded in the build PRs too):
- Which files carry markers: every `*.md` under the spec root except
  `specs/adr/`, which has its own form (below); the files that config's
  `docs:` list names, each with its prefix; and every
  `requests/<name>/spec.md`, with prefix `SP` and IDs local to that request.
  User documents in `docs/` are outputs and carry no markers unless config
  names them.
- Display numbers: a single leading H1 is the title and is not numbered; H2
  is 1, 2, ...; H3 is 1.1, and so on. A paragraph shows as
  "INV-41 (2.3:4, in Export links)".
- ADRs: `specs/adr/NNNN-<slug>.md`, with `Status: proposed|accepted|superseded`
  at the top. The heading's marker holds the ADR's own ID `ADR-<n>` and its
  `decides`, `source` and `supersedes` links; the other paragraphs take
  `ADR-<n>-<k>`.
- A requirement in `request.md` carries a hidden marker too, with its links
  to the owner's words: `<!-- R2 from:<snapshot file name> -->`. Each
  requirement version is kept; a sign-off records the versions it covers,
  and may name what the owner was shown (`presented`) and who wrote the
  owner's words down (`transcribed_by`).

<!-- SP-17 data serves:R1,assuredloop-v4/R2,assuredloop-v4/R3 builds-on:SP-16 -->

A paragraph's hash is the full SHA-256 of its text after line endings are
normalized and the marker framing is removed. The YAML library is `yaml`
2.9.1, pinned.
