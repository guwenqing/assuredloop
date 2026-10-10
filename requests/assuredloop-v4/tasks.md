# AssuredLoop v4: tasks

The current design is `spec.md` in this folder, this request's change spec:
`design.md` became its sections 1-17, and `schema.md` its last sections
(D19). "design.md N" below means section N of spec.md, and "schema.md N" its
section N under "AssuredLoop v4: the model from input to output". Where they
differ from anything else, they hold.

This list is our own way of working, not a rule of the tool (owner input
136): the definite list of tasks for this request. The architect opens issues
for the developers, each a higher summary of one or more tasks (see "Issues"
at the end). A developer can start from a task here alone: it says what is
wanted, its boundary, the requirement it delivers, its check, and the
sections to read.

Order (owner inputs 117-118, 135): validation first (T1-T6), then the build
(T7-T17). The build starts after T6, because validation can change rules.
T18, the release, is a separate follow-on outside this request, because
publishing needs the owner's yes.

Completion: this request is complete only when T1-T17 are done and every
runtime check that T6 defers has a result. `al conclude` passing is
necessary for that, not proof of it: the tool does not check this task list.

## Validation

### T1 Fixtures
- **Wanted:** a tiny central repo and three output repos, and one non-code
  project (a report with a citation review), with v4 records written by hand
  as the design says: markers, kinds, links, request records with bindings
  and dispositions, per-doc records with AI hints, results with declared
  inputs.
- **Boundary:** hand-written files in a scratch folder; no tool code; no
  change to any real adopter.
- **Delivers:** the evidence for R1, R2, R8, R14 (input to T3-T5).
- **Check:** the requests and the specs are in the central repo; every link
  kind of `schema.md` section 6 appears across the fixture set as a whole
  (not in each repo); the architect can read every record kind of
  `schema.md` section 8 in the fixtures.
- **Read:** design.md 2 (One change, and the consolidated spec), 3 (IDs,
  kinds and links), 4 (The change spec honors the consolidated spec), 5
  (Consolidation and the close rule), 10 (Records), 12 (One central spec
  repo, and output repos); schema.md 3 (IDs in the text), 6 (The links), 7
  (Where the model lives), 8 (A worked example as records).

### T2 Golden questions, defects and controls
- **Wanted:** 20-30 real review questions, each with its expected paragraph
  IDs and right answer, some held out from whoever writes the records; the
  planted defects and a clean control of the same shape for each.
- **Boundary:** questions and expected answers only; no tool code.
- **Delivers:** the measures for R12 (and the cases of R5-R10).
- **Check:** each defect and case listed in design.md 15 has a question or a
  planted defect, with its control; the held-out set is stored apart.
- **Read:** design.md 15 (Validation, before the build), 11 (Search and the
  export), 9 (Checks of rules, and results).

### T3 Simulation
- **Wanted:** agents play the owner, the developer and the reviewer through
  the cases of design.md 15 on the T1 fixtures, in three arms: today's
  records, a lighter model (same texts and IDs, fewer declarations), and the
  full model. Record the catch rate, false alarms, right answers, reviewer
  time, and the cost of the records across all agents against the flexible
  20% target.
- **Boundary:** a written model of the rules is allowed and must say it is a
  model, not a product test; no change to `src/`.
- **Delivers:** the evidence for R4-R7, R9, R11, R12.
- **Check:** a report with the numbers per arm, per case and per path (small
  changes, epics, owner questions and sign-offs apart), and the raw logs.
- **Read:** design.md 1 (Intent), 5, 6 (Sign-off), 7 (Paths for each kind of
  work), 9, 15; schema.md 9 (What the graph lets the tool say).

### T4 OpenSpec replay
- **Wanted:** 5-10 real archived changes of OpenSpec (Fission-AI/OpenSpec)
  converted by hand into the model; the golden-question method applied to
  them in the three arms of design.md 15 (today's records, the lighter arm,
  the full model); formatting-only differences under exact equality counted.
- **Boundary:** read OpenSpec only; work in a scratch copy; choose changes of
  different sizes and say why each was chosen.
- **Delivers:** evidence for R1, R2, R5, R12 on real history.
- **Check:** a report with the conversion cost per change, the equality
  cases that needed a wording or typo claim, and the answers in all three
  arms.
- **Read:** design.md 3, 5 (the equality rule), 15.
- **Done:** #171, PR #173; the chosen changes are in validation.md B3.

### T5 Private adopter on a scratch copy
- **Wanted:** the open request of a private adopter converted by hand on a
  scratch copy; the fresh-reader test, in the three arms of design.md 15: a
  fresh reader recovers three separate facts (a PR merged, a proof not run, a
  part still open) and names the evidence that is not available.
- **Boundary:** no change to the adopter's repo; nothing from it is copied
  into this public repo. This task cannot start from this file alone: its
  start prompt, from the architect, names the adopter, the request, the
  pinned commit and where the private evidence is.
- **Delivers:** evidence for R1, R8, R9.
- **Check:** the fresh reader's answers against the facts, in all three
  arms.
- **Read:** design.md 9 (results and applicability), 14 (Migration and
  adoption), 15.

### T6 Validation report and decision (the architect)
- **Wanted:** one report that decides the model from the T3-T5 evidence
  only: which rules helped a reviewer answer a question or catch a defect, at
  what cost; which rules go. Update design.md and schema.md to match. If a
  need in the signed requirement must change, the owner signs again. List
  each runtime check of design.md 15 that the model cannot measure, with the
  task that will run it: real search fallback (T14); every role through the
  change-context query at levels 0-2 (T13, T14); level 1 on the minimum Node
  version (T7, T13); the record commands end to end (T9); the ADR checks
  (T10); an absent clone and an unavailable commit (T12); the scale timings
  (T15); marker preservation when agents rewrite text (T16). All of them
  need a result before this request is complete.
- **Boundary:** no build code. No timing of the old `al` counts as a v4
  measurement, and no rule model counts as a product run.
- **Delivers:** R12.
- **Check:** each rule of design.md is kept or dropped with its evidence;
  each deferred runtime check is named with its task; the owner has seen the
  report.
- **Read:** design.md 15; the T3-T5 reports.

## Build

### T7 Bootstrap and release plan (the architect)
- **Wanted:** how this repo moves from 0.1.0 records to v4 records; the
  minimum Node version (level 1 search needs FTS5 in `node:sqlite` on Node
  24); the plan for a breaking release, which T18 carries out as a separate
  follow-on after this request concludes; any change to T15's criteria,
  made before the run and recorded.
- **Boundary:** a plan only; publishing needs the owner's yes.
- **Delivers:** R9 (history before v4).
- **Check:** the plan names each step and who does it; the Node 24 test has
  run.
- **Read:** design.md 11 (the search levels), 14, 15.
- **Done:** the plan is design.md 17 (Building v4). The Node 24 test ran on
  2026-10-10: the official Node 24.21.0 (darwin-arm64, checksum verified
  against its SHASUMS256.txt) created a `node:sqlite` FTS5 table and matched a
  query (SQLite 3.53.4). So the minimum stays Node 24; T13 keeps a test of it
  in CI. T15's criteria are unchanged.

### T8 Schema and markers
- **Wanted:** `.assuredloop/` with `config.yaml` and `schema.yaml`; the
  leading marker with its blank line; flat sequential IDs and computed display
  numbers; kinds and links in the marker; the ID lints (missing, duplicate,
  lost, used again); the per-paragraph hash list and the derived change kinds
  (Changed, Moved, New, Removed); `al spec --add-ids` marks every paragraph.
- **Boundary:** the marker lints belong here (missing ID, duplicate, lost,
  used again, kind present); the checks that read records belong to T10; no
  records or search yet.
- **Delivers:** R1, R2.
- **Check:** tests written by someone other than the developer, through the
  public interface, cover each rule of the sections read.
- **Read:** design.md 2, 3 (IDs, kinds and links), 13 (Commands); schema.md 3
  (IDs in the text), 4 (The kinds of paragraph).

### T9 Records and bindings
- **Wanted:** the request record (sources and requirement versions,
  sign-offs, decisions, task references, frozen bindings with both hashes,
  dispositions by source version); per-doc records (regenerable fields, AI
  hints with their source hash, the quote form); `al index` and
  `--align <ID>`; a pinned YAML library. Also the v4 updates to `al new` and
  `al record origin|signoff|decision`: they write sources and requirement
  versions into the new records. Also ADR storage in `specs/adr/` and its
  links (`decides`, `source`, `supersedes`).
- **Boundary:** records, record commands and indexing only; checks that read
  them are T10.
- **Delivers:** R1, R3, R5, R6, R8.
- **Check:** independent tests; indexing twice never advances a binding; a
  lost binding stays "unknown"; one end-to-end check through the public
  commands: create a request, add source text, sign the exact requirement
  version, record a decision, and index it; an ADR with its links indexed.
- **Read:** design.md 4 (The change spec honors the consolidated spec), 5
  (Dispositions), 6 (the requirement changes too), 10 (Records), 13
  (Commands); schema.md 5 (ADRs), 6 (The links), 7 (Where the model lives),
  8.

### T10 Checks
- **Wanted:** sign-off coverage for promise kinds; path claims against kinds
  and hashes; typo claims with meaning-sensitive marks; exact equality;
  dispositions and the close rule with versions and chains; overlaps and
  stale bases; requirement words in non-promise kinds; near matches; result
  applicability ("declared inputs unchanged"); the ADR checks (a change to an accepted ADR's text is `not ok`;
  a broken supersede link; the hint on a paragraph that an ADR governs);
  opt-in `--strict`.
- **Boundary:** hints by default; no block outside `al conclude` and opt-in
  `--strict`; no AI calls.
- **Delivers:** R4, R5, R6, R7, R11.
- **Check:** independent tests, one for each planted defect and its clean
  control from T2, and for each ADR case of schema.md 5.
- **Read:** design.md 3 (What the script checks), 4, 5, 6 (Sign-off), 7
  (Paths for each kind of work), 9 (Checks of rules, and results); schema.md
  5 (ADRs).

### T11 Views
- **Wanted:** `al context` (status, dispositions, coverage per section,
  hints, what is not checked); the review view
  (`al context --diff ... --for review`); the ADRs that govern a paragraph;
  `--audit`; `--at` on v4 commits; `al conclude` with its three conditions
  and the outcome.
- **Boundary:** `al conclude` is the only command that refuses.
- **Delivers:** R5, R9.
- **Check:** independent tests; the T3 reviewer questions answered from these
  views.
- **Read:** design.md 1 (What v4 is not), 5 (The close rule), 9, 13;
  schema.md 5 (ADRs).

### T12 Cross-repo
- **Wanted:** the central repo and output repos in `config.yaml`; qualified
  IDs; every link kind from output repos (cites, implements, verifies,
  documents, PR references, results); commit bindings; "unknown" when a repo
  or commit is absent; central-ID lookup from an output repo.
- **Boundary:** the spec stays in the central repo; implementation specs in
  output repos are later work.
- **Delivers:** R8, R13.
- **Check:** independent tests on one central repo with three output repos,
  an absent clone and an unavailable commit.
- **Read:** design.md 12 (One central spec repo, and output repos), 9
  (results across repos); schema.md 6 (qualified IDs), 8.

### T13 Export and search level 1
- **Wanted:** `al export` (one JSONL row per paragraph version, with roles,
  versions, edges and commits); `al search` on `node:sqlite` FTS5 with the
  exact ID column; the three queries with role precedence; current and
  history indexes; rebuild with a manifest and deletes from the current index
  only.
- **Boundary:** no embeddings; no network; no check depends on search.
- **Delivers:** R10, R13.
- **Check:** independent tests at levels 0 and 1; the T2 retrieval questions
  measured by recall of the expected IDs.
- **Read:** design.md 11 (Search and the export).

### T14 Search level 2
- **Wanted:** the optional package with a local embedding model, vectors
  beside the text, reciprocal rank fusion, fallback 2 → 1 → 0 with the level
  shown; tests at levels 0, 1 and 2 (a fixed test embedder, plus one smoke
  test with a real model).
- **Boundary:** a separate optional package; `al` itself keeps no AI and no
  network.
- **Delivers:** R10.
- **Check:** independent tests; level 1 against level 2 on the golden
  questions.
- **Read:** design.md 11 (The search levels).

### T15 Scale run
- **Wanted:** 1,000 generated requests and 20 repos; the time of `al check`,
  of a full and an incremental index, of removal from the current index; kept
  history.
- **Boundary:** generated data only.
- **Delivers:** R13.
- **Check:** a report with the timings against these criteria, on the
  reference machine (an Apple-silicon laptop with 16 GB): `al check` on a PR
  within 10 s at 1,000 requests; `al search` answers within 2 s across 20
  repos; an incremental index after a merge within 2 minutes; a full level 1
  rebuild within 15 minutes. The architect may revise these in T7 before the
  run, and records any change. The report names the machine and its load when
  the run is on another machine. The cost account moved to T16, because it
  needs agents that follow the v4 skill (the architect, 2026-10-10).
- **Read:** design.md 11 (Scale), 15, 16 (Cost).

### T16 Skill and docs
- **Wanted:** SKILL.md and README for v4: the paths, no Was/Now copies, no
  `consolidate`, the search levels, the adoption guide (markers change bytes,
  so a byte-bound sign-off needs renewal).
- **Boundary:** describe the tool; do not prescribe a way of working.
- **Delivers:** R7, R11, R14.
- **Check:** a fresh agent follows the skill through each path on a fixture;
  the whole cost account of design.md 16 on real agent runs (record creation,
  reading, corrections, indexing and review, across every agent), with small
  changes and epics apart, against the flexible target; marker preservation
  by agents, measured apart from the lint.
- **Read:** design.md 1, 7, 11, 14, 16 (Cost).

### T17 The v4 spec
- **Wanted:** the consolidated v4 spec in `specs/`, with markers, from
  design.md; each change paragraph of this request with its disposition,
  prepared and checked. Also the switch of design.md 17: the command becomes
  v4, this repo's spec and records become v4, the v1 code goes, and `yaml`
  moves to `dependencies`; the v4 skill and README of T16 move into place;
  and `al spec --add-ids` writes the adoption record (design.md 14).
- **Boundary:** the spec states promises and lasting design; history stays in
  this request.
- **Delivers:** R1, R5.
- **Check:** `al conclude assuredloop-v4` passes its three conditions. That
  is necessary for completion, not proof of it (see "Completion" above).
- **Read:** design.md 2, 3, 5.

### T18 Release (the architect; a follow-on outside this request)
- **Wanted:** the breaking release of v4, after this request concludes.
- **Boundary:** a separate follow-on, not part of this request's completion;
  publishing needs the owner's yes.
- **Delivers:** the release of R1-R14.
- **Check:** the owner's yes is recorded; the release workflow passes.
- **Read:** the T7 plan.

## Issues

The architect opens these issues for the developers, each a higher summary
of its tasks. An open issue is not always ready to start: the last column
says what it needs first.

| Issue | Tasks | Opened | Ready to start when |
|---|---|---|---|
| A. Validation: fixtures, questions and simulation | T1-T3 | #170 | done (PR #172) |
| B. Validation: OpenSpec replay and the private adopter | T4-T5 | #171 | done (PR #173) |
| C. Schema and markers | T8 | #174 | done (PR #177) |
| D. Records and bindings | T9 | #175 | done (PR #178) |
| E. Checks and views | T10-T11 | #179 | done (PR #184) |
| F. Cross-repo links | T12 | #180 | done (PR #185) |
| G. Export and search levels 1-2 | T13-T14 | #181 | done (PR #183) |
| T9 gaps: `new --tier 1d`, extra positional arguments | T9 | #182 | done (PR #187) |
| Export and search across the output repos | T13 with T12 | #186 | done (PR #192) |
| `al check` reads files at a commit in one git process | T15's finding | #190 | after the first scale run |
| H1. Scale run timings | T15 | #188 | generator and harness now; the measured run after #186 and #190 |
| H2. Skill, docs and the cost account | T16 | #193 | E is done |
| H3. The v4 spec and the switch | T17 | #196 | E is done; design.md holds the build decisions |

H was split into H1-H3 (the architect, 2026-10-10), because its tasks depend
on different issues. Up to three developers work at once (owner input 150).

T6 and T7 are the architect's. T18 is the architect's follow-on, outside
this request.
