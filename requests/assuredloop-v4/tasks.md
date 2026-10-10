# AssuredLoop v4: tasks

The current design is `design.md` and `schema.md` in this folder. Where they
differ from anything else, they hold.

This list is our own way of working, not a rule of the tool (owner input
136): the definite list of tasks for this request. The architect opens issues
for the developers, each a higher summary of one or more tasks (see "Issues"
at the end). A developer can start from a task here alone: it says what is
wanted, its boundary, the requirement it delivers, its check, and the
sections to read.

Order (owner inputs 117-118, 135): validation first (T1-T6), then the build
(T7-T18). The build starts after T6, because validation can change rules.

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
- **Check:** the architect can read every record kind of `schema.md` section
  8 in the fixtures, in all four repos and the non-code project.
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
  them; formatting-only differences under exact equality counted.
- **Boundary:** read OpenSpec only; work in a scratch copy; choose changes of
  different sizes and say why each was chosen (design.md 16).
- **Delivers:** evidence for R1, R2, R5, R12 on real history.
- **Check:** a report with the conversion cost per change, the equality
  cases that needed a wording or typo claim, and the answers on both forms.
- **Read:** design.md 3, 5 (the equality rule), 15, 16 (Open points).

### T5 Private adopter on a scratch copy
- **Wanted:** the open request of a private adopter converted by hand on a
  scratch copy; the fresh-reader test: a fresh reader recovers three separate
  facts (a PR merged, a proof not run, a part still open) and names the
  evidence that is not available.
- **Boundary:** no change to the adopter's repo; nothing from it is copied
  into this public repo.
- **Delivers:** evidence for R1, R8, R9.
- **Check:** the fresh reader's answers against the facts, in both forms.
- **Read:** design.md 9 (results and applicability), 14 (Migration and
  adoption), 15.

### T6 Validation report and decision (the architect)
- **Wanted:** one report from T3-T5: which rules helped a reviewer answer a
  question or catch a defect, at what cost; which rules go. Update design.md
  and schema.md to match. If a need in the signed requirement must change,
  the owner signs again.
- **Boundary:** no build code.
- **Delivers:** R12.
- **Check:** each rule of design.md is kept or dropped with its evidence; the
  owner has seen the report.
- **Read:** design.md 15; the T3-T5 reports.

## Build

### T7 Bootstrap and release plan (the architect)
- **Wanted:** how this repo moves from 0.1.0 records to v4 records; the
  minimum Node version (level 1 search needs FTS5 in `node:sqlite` on Node
  24); the plan for a breaking release.
- **Boundary:** a plan only; publishing needs the owner's yes.
- **Delivers:** R9 (history before v4), the release.
- **Check:** the plan names each step and who does it; the Node 24 test has
  run.
- **Read:** design.md 11 (the search levels), 14.

### T8 Schema and markers
- **Wanted:** `.assuredloop/` with `config.yaml` and `schema.yaml`; the
  leading marker with its blank line; flat sequential IDs and computed display
  numbers; kinds and links in the marker; the ID lints (missing, duplicate,
  lost, used again); the per-paragraph hash list and the derived change kinds
  (Changed, Moved, New, Removed); `al spec --add-ids` marks every paragraph.
- **Boundary:** no records, checks or search yet.
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
  `--align <ID>`; a pinned YAML library.
- **Boundary:** records and indexing only; checks that read them are T10.
- **Delivers:** R3, R5, R6, R8.
- **Check:** independent tests; indexing twice never advances a binding; a
  lost binding stays "unknown".
- **Read:** design.md 4 (The change spec honors the consolidated spec), 5
  (Dispositions), 6 (the requirement changes too), 10 (Records); schema.md 6
  (The links), 7 (Where the model lives), 8.

### T10 Checks
- **Wanted:** sign-off coverage for promise kinds; path claims against kinds
  and hashes; typo claims with meaning-sensitive marks; exact equality;
  dispositions and the close rule with versions and chains; overlaps and
  stale bases; requirement words in non-promise kinds; near matches; result
  applicability ("declared inputs unchanged"); rule-check hints on changed
  rules only; opt-in `--strict`.
- **Boundary:** hints by default; no block outside `al conclude` and opt-in
  `--strict`; no AI calls.
- **Delivers:** R4, R5, R6, R7, R11.
- **Check:** independent tests, one for each planted defect and its clean
  control from T2.
- **Read:** design.md 3 (What the script checks), 4, 5, 6 (Sign-off), 7
  (Paths for each kind of work), 9 (Checks of rules, and results).

### T11 Views
- **Wanted:** `al context` (status, dispositions, coverage per section,
  hints, what is not checked); the review view
  (`al context --diff ... --for review`); `--audit`; `--at` on v4 commits;
  `al conclude` with its three conditions and the outcome.
- **Boundary:** `al conclude` is the only command that refuses.
- **Delivers:** R5, R9.
- **Check:** independent tests; the T3 reviewer questions answered from these
  views.
- **Read:** design.md 1 (What v4 is not), 5 (The close rule), 9, 13.

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
- **Check:** a report with the timings; `al check` stays usable.
- **Read:** design.md 11 (Scale), 15.

### T16 Skill and docs
- **Wanted:** SKILL.md and README for v4: the paths, no Was/Now copies, no
  `consolidate`, the search levels, the adoption guide (markers change bytes,
  so a byte-bound sign-off needs renewal).
- **Boundary:** describe the tool; do not prescribe a way of working.
- **Delivers:** R7, R11, R14.
- **Check:** a fresh agent follows the skill through each path on a fixture.
- **Read:** design.md 1, 7, 11, 14.

### T17 The v4 spec
- **Wanted:** the consolidated v4 spec in `specs/`, with markers, from
  design.md; each change paragraph of this request with its disposition.
  This concludes the request.
- **Boundary:** the spec states promises and lasting design; history stays in
  this request.
- **Delivers:** R1, R5.
- **Check:** `al conclude assuredloop-v4` passes.
- **Read:** design.md 2, 3, 5.

### T18 Release (the architect)
- **Wanted:** the breaking release of v4.
- **Boundary:** publishing needs the owner's yes.
- **Delivers:** all R.
- **Check:** the owner's yes is recorded; the release workflow passes.
- **Read:** the T7 plan.

## Issues

The architect opens these issues for the developers, each a higher summary
of its tasks:

| Issue | Tasks | When |
|---|---|---|
| A. Validation: fixtures, questions and simulation | T1-T3 | now |
| B. Validation: OpenSpec replay and the private adopter | T4-T5 | now |
| C. Schema and markers | T8 | after T6 |
| D. Records and bindings | T9 | after T6 |
| E. Checks and views | T10-T11 | after T6 |
| F. Cross-repo links | T12 | after T6 |
| G. Export and search levels 1-2 | T13-T14 | after T6 |
| H. Scale, skill, docs and the v4 spec | T15-T17 | after T6 |

T6, T7 and T18 are the architect's.
