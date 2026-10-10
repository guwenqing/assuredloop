# AssuredLoop v4: a traced change spec and one consolidated spec
Tier: 3 · Status: open

## Owner's words and dialog

- 2026-10-10 the owner's words, snapshot origin/2026-10-10-owner-words.md
- The dialog in brief:
  - The owner asked whether a schema built for every change, with a RAG
    index, could replace the strange change format (owner inputs 92-99).
    Research on built schemas, RAG levels and zero infrastructure followed.
  - The owner asked for an ID on every paragraph, kinds of text, ADRs as a
    special kind, and one graph from the owner's input to the output
    (inputs 100-101), and for an audit against the original requirements
    and research on prior art (input 103).
  - The owner kept both a change's own spec and design and one consolidated
    spec, with consolidation by hand before an epic closes and nothing left
    untraced (inputs 104-112), paths for every size of work (input 114),
    and light project management (input 115).
  - An adversary challenged the design in four rounds and ended with no high
    or medium finding. The owner settled the flavour decisions (input 123),
    the bottom line against a lifecycle tool (input 126), typo fixes
    (input 128), small design corrections (input 129), the search levels
    (inputs 130-131), the scale (input 132) and output repos (inputs
    133-134).
  - The owner chose to validate before the build (inputs 117-118 and 135),
    and to keep tasks in a `tasks.md` with issues as higher summaries, as
    our way of working, not the tool's rule (input 136).
- 2026-10-10: the owner signed off the organized requirement below: "i sign
  off", then, after the one changed R8 sentence was shown, "yes go ahead".
- 2026-10-10: the owner's words 141-144 on what goes into this repo: only
  the consolidated design, with its intent. Snapshot
  origin/2026-10-10-owner-chat-with-the-architect-2026-10-10-inputs-14.md.
  Decision D1 below.
- 2026-10-10: the owner's words 146-150: the scale pass marks are fine; the
  architect carries on overnight and decides T6; the cost is fine to try; up
  to three developers at once. Snapshot
  origin/2026-10-10-owner-chat-with-the-architect-2026-10-10-inputs-14-2.md.
  Decision D2 below.

## Organized requirement

### R1 One current spec, and the change's own spec
The project MUST keep one consolidated spec on main: the current promises,
the lasting design, and the decisions (ADRs) in the spec folder. Each change
that needs a design MUST keep its own change spec, for that change only, with
its promises, its design and its plan. A reader, human or AI, MUST be able to
tell the current system without reading past changes, and to find why any
part is as it is.

### R2 Every paragraph traced
Every paragraph of the spec and of a change spec MUST carry a stable ID that
the rendered page does not show, and a kind (for example a rule, a limit, a
definition, a design part, a plan, a note). Promise and design paragraphs
MUST link to what they serve, and to the spec paragraphs they build on or
change. No design text may live in a free, untraced document.

### R3 The owner's words, and the organized requirement
Work that changes a promise MUST have a request record. It keeps the owner's
words as given, with every link or chat snapshotted with its SHA-256 and its
times, and an organized requirement written from them. Each requirement MUST
point at the owner's words it comes from. Both MAY change while the owner
explores: each change is kept as a new version, and old versions stay
readable.

### R4 The owner signs off promise changes
When a change touches a promise, its organized requirement (for a spike, the
organized question) MUST be signed off by the owner. Work MAY be drafted
before the sign-off, but MUST be delivered with it or after it. A later
change MUST need a new sign-off. Changes that touch no promise, such as typo
fixes, small design corrections and design-only changes, need no sign-off;
the review reads them.

### R5 Consolidation by hand, and closing
The agent MUST bring each piece of a change into the consolidated spec by
plain paragraph replacement, with no tool command, at any time before the
change closes, part by part for an epic, as long as it does not deviate. The
tool MUST check that consolidated text matches its source exactly, unless a
recorded wording decision or typo claim explains the difference. Concluding
MUST require every change paragraph that affects the spec to be incorporated,
removed, replaced by a later change, or abandoned with a reason. Nothing
applied may be dropped silently.

### R6 Parallel work aligns
Changes to the same paragraph MUST align: build on each other, or correct the
earlier one. The tool MUST show overlaps, and a base that changed underneath
a change, and MUST never silently overwrite.

### R7 Paths for each kind of work
There MUST be paths for:
- a fix with no record, typo fixes included;
- a small promise amend in one PR;
- a small design correction;
- a big change;
- an epic landed in parts;
- a spike.

The user picks the path. Every PR MUST state its path and its claim. The tool
MUST show the evidence, and flag the contradictions it can see.

### R8 From input to output, across repos
The tool MUST trace the chain from the owner's words, through the
requirement, the decisions, the ADRs, the spec paragraphs, the tasks and the
PRs, to the outputs: code, tests, user documents and test results. Outputs
MAY live in other repos: links from output repos to one central spec repo
MUST work, for up to 20 repos. Each link MUST say how it was made (found by
the tool, declared in the PR, or a rough hint) and what it proves. A declared
link MUST never be shown as proven. Tasks MAY live in the repo (for example
a `tasks.md` in the request) or in any tracker, and several tasks MAY share
one issue; the chain keeps only their references, and the tool enforces no
way of dividing the work.

### R9 Bringing the AI back, and full audit
One command MUST show, briefly, where a request stands and what to do next.
On request it MUST return the full trace, including as of any past commit made
under v4. History from before v4 MAY be read with the pinned 0.1.0.

### R10 Search at the user's chosen strength
The tool MUST offer search over the spec, the changes and the outputs at
several levels: none (the agent reads the files), local full text, and local
full text with an embedding model. The last is the default, and is optional
to install. Every level MUST work; a level changes only the strength. Search
MUST show the current system by default, and proposals, the owner's words,
evidence and history only when asked, each hit marked with its role. The
records MUST be committed, so that any index can be rebuilt from them. A
hosted level, preferably on Google Cloud, is later work.

### R11 Hints, not a lifecycle
The tool MUST give hints. It MUST NOT block commits or merges: only its own
conclude refuses, and a strict mode is opt-in. It MUST NOT impose phases,
stages, roles, approvals beyond the sign-off, task states, or one way of
working. How to develop, test and review belongs to the project.

### R12 Light enough to pay for itself
Its formality SHOULD cost no more than about a fifth of the change, as a
flexible target. A rule that helps no reviewer answer a real question SHOULD
be dropped after validation. The core checks MUST run offline and
deterministically, with no AI calls. AI fills hints in the PR, and the review
reads them.

### R13 Scale
It MUST stay usable with up to 1,000 change specs in a repo, and across 20
repos.

### R14 Beyond code
The same records SHOULD work for non-code projects, such as documents and
research.

Out:
- how to develop, test and review;
- roles, approvals beyond this sign-off, project management and task status;
- implementation specs in output repos that refine the central spec (later);
- a hosted search level (later);
- backward compatibility with 0.1.0 records;
- fetching links inside the tool.

Assumed:
- The design detail is in `design-v4-draft.md` (revision 4) and
  `schema-v4-sketch.md`. It moves into this request's change spec after the
  sign-off.
- Validation runs before the build, in this order: a simulation with planted
  defects, a replay of real OpenSpec changes, then Guanxi on a scratch copy.
  If validation shows that a need above must change, the owner signs again.
- The schema (kinds and link names) is designed by the owner and the
  architect, with a version. Users extend it with the same careful review.
- Node ESM, tested with `node --test`. A pinned dependency is allowed where
  it earns its place; zero dependencies is the least important goal.
Signed off: 2026-10-10 owner, origin/2026-10-10-signoff.md

## Decisions

- D1, 2026-10-10. Source: owner, inputs 140-144 (chat with the architect, 2026-10-10). The design (design.md), the schema (schema.md) and the tasks (tasks.md) live in this request folder. Assumed's design-v4-draft.md is now design.md, and schema-v4-sketch.md is now schema.md. They hold only the consolidated design and its intent, not the history of how it was reached (inputs 142-144). The research and the challenge rounds stay in the architect's working notes (input 141). This repo is public, so a private adopter's content is replaced by a neutral example.
- D2, 2026-10-10. Source: the agent (architect), on the owner's words 148-149. T6, the validation decision (validation.md parts A and B). Stay: IDs on every paragraph with hidden markers; kinds; the marker links serves, builds on and changes, with bindings for every declared link; dispositions and the close rule; exact equality with no more normalization; typo marks; path and 1d checks; the requirement-words hint; results with declared inputs; facts derived from git. Change: AI hints and declared outputs (implements, verifies, documents) become optional; a new kind, approach, keeps design text with its change, with R2 links; removals are declared with removes; the record's provenance field is source, and from stays only for requirement to owner's words; seventeen gaps found in validation are decided in design.md. Go: the hint for a rule with no check. Add: a duplicate-heading lint under one parent. Cost: the records cost 1.3 to 1.6 times the work in validation, so the flexible 20% target of R12 is not yet met; the owner chose to build and measure again (input 149); a complete cost account runs in T15 and T16.
- D3, 2026-10-10. Source: the agent (architect), by fleet mail to developer-175 for #175 (T9). Until T17 switches the command, the YAML library yaml is pinned at exactly 2.9.1 (released 2026-09-11, over 24 hours old) in devDependencies, with a committed package-lock.json; test.yml and the test job of publish.yml run npm ci before node --test; .gitignore holds node_modules/. So v1's pack test, which installs the packed package offline, stays green. T17 moves yaml to dependencies. As the architect relayed, the owner chose this over a vendored copy (owner input 151) and added the workflow scope that pushing the workflow edit needs.
- D4, 2026-10-10. Source: the agent (architect), by fleet mail to developer-175 for #175 (T9). An ADR is specs/adr/NNNN-<slug>.md with Status: proposed|accepted|superseded on its first line. Its heading's marker has the ID ADR-<n> and its links decides:, source: and supersedes:; its other paragraphs take the IDs ADR-<n>-<k>. decides and supersedes bind the target's text hash; source binds the hash of the decision, sign-off or owner's-words snapshot. That an accepted ADR's text does not change is a T10 check.
- D5, 2026-10-10. Source: the agent (architect), by fleet mail to developer-175 for #175 (T9). The request record keeps one entry per requirement version {id, version, sha256, title}: al index and al record signoff append one whenever the text of ### R<n> (or Q<n>) gets a new hash, drafts included, and never edit one. A requirement's from link is declared in a marker on it in request.md, <!-- R2 from:<snapshot file in origin/> -->, not by hand in the record (input 123); the snapshot's file name is the source's ID. A serves binding keeps to_version and to_sha256. A sign-off lists the versions it covers, each with its sha256, and may name what was presented and who transcribed it (presented, transcribed_by), with no checks.
- D6, 2026-10-10. Source: the agent (architect), by fleet mail to developer-175 for #175 (T9). The base for a lost binding is the merge-base of HEAD with main (origin/main, else main). A link with no binding that is in the marker at the base stays binding unknown and is not bound; a link not at the base is bound when first indexed. With no main the base is HEAD, and al index says the base is unknown.
- D7, 2026-10-10. Source: the agent (architect), by fleet mail to developer-175 for #175 (T9). For T9, results are a record format with a loader that checks it: check, outcome (pass, fail or not run), commit (a hash or unknown), declared inputs, and optional by, source and note, in .assuredloop/results/ unless config results: names another folder. Whether a result applies is T10.
- D8, 2026-10-10. Source: the agent (architect), by fleet mail to developer-175 for #175 (T9). A binding uses the field names of schema.md 8: holder, link, target, holder_sha256, target_sha256 and target_version; a hint records its basis_sha256. A disposition's source is a change paragraph (<request>/SP-n), a path-1 requirement (<request>/R<n>) or adoption; index fills its hashes once (for a requirement, the latest version's hash; for adoption, none, as the adoption record is T17's), and no index and no --align changes them after that. A new source version gets its own entry, and the old entry stays as history. --align advances link bindings only.
- D9, 2026-10-10. Source: the agent (architect), message to developer-174, 2026-10-10. T8 (issue #174) builds markers as follows. The docs in scope are every *.md under the spec root (root: in config.yaml, specs/ by default) except specs/adr/, the files that the docs: list of config.yaml names, and every requests/<name>/spec.md, with prefix SP and IDs local to that request. A single leading H1 is the title and is not numbered; H2 is 1, 2 and so on; a heading shows "INV-40 (2.3, Export links)" and a paragraph "INV-41 (2.3:4, in Export links)". The paragraph hash is the full SHA-256 hex of the text after line endings are normalized and the marker framing is removed. A lost ID is an ID at the base that is absent at head in every doc of its scope and is not named by removes: in a change spec; a used-again ID is absent at the base but present in an earlier commit. al spec --add-ids keeps existing markers, numbers above the highest number ever used for the prefix, gives headings the kind note and other blocks no kind, and writes config.yaml and schema.yaml when they are absent. A promise, design or approach paragraph with no link is a hint, and not ok under --strict. Link resolution is T10. The parser shape of issue #174 gains the links for, supersedes and source, headingPath is an array of heading texts, and each paragraph carries file (agreed with developer-175). src/v4/config.js exports loadConfig and loadSchema.
- D10, 2026-10-10. Source: the agent (architect), on the owner's input 151 ("Have a dependency is very normal"), message to developer-174, 2026-10-10. v4 reads YAML with the npm package yaml, a normal dependency pinned at exactly 2.9.1 (published 2026-09-11), with a committed package-lock.json and npm ci in the workflows. The pull request of issue #175 (PR #178) adds the dependency, the lock file and the workflow change; the code of issue #174 only imports yaml. An earlier plan to vendor a copy into src/v4/ was dropped.
- D11, 2026-10-10. Source: the agent (architect), message to developer-181, 2026-10-10. T13-T14 (issue #181) build search as follows. al export walks the first-parent history up to the selected commit, and every paragraph and requirement version not at that commit is a history row; it walks only the commits that touched the docs in scope and reads only the changed files, and an incremental index walks only the commits after the last commit in its manifest. valid_from and superseded_by are commits; the edges and the dispositions name the change that replaced a version. The change-context query adds to the default query, so all baseline rows stay in. The index is one SQLite file at $(git rev-parse --git-path assuredloop)/search.sqlite, never committed; every row has its repo, and only the central repo is indexed until #180 adds the output repos. Level 2 is the package packages/search/, @assuredloop/search, private until T18, found by normal Node resolution (the project first, then beside al); the package holds the model, the vectors and the scan, and al only fuses the ranked lists. The level 2 tests with a fixed test embedder run in CI; the real model's runtime loads lazily, and its smoke test runs locally and skips in CI. transformers.js and the model are pinned, the model by its revision.
- D12, 2026-10-10. Source: the agent (architect), message to developer-181, 2026-10-10. Level 2's fusion (T14, issue #181): reciprocal rank fusion over the rows that have vectors; a row with no vector keeps its level 1 place, because the vector list gives it no vote and must not push it down. The default query (baseline rows only) is the same under plain RRF. developer-181 chose this after seeing the visible T2 results. The held-out measure is the honest one: level 2 equals level 1 (recall 29.2% at the top 5, 58.3% at the top 10, 8 questions); plain RRF gave 41.7% and 47.9%. On 8 questions neither fusion is clearly better, and the fusion is not tuned further on these questions.
- D13, 2026-10-10. Source: the agent (architect), message to developer-180 for #180 (T12). The central config.yaml lists its output repos as outputs: [{name, path, url, commit}]; with no commit, al uses the clone's HEAD and shows that commit. An output repo's config names central: {path, commit}, and the qualifier is central:. al reads another repo only through git at the resolved commit, never its working tree, and never fetches; a repo with no path, no clone or an unresolved commit is unknown, with its reason. src/v4/repos.js gives crossRepo(top): the repos, the links and the results of the output repos. The link kinds are those of schema.md 6: cites (exact), named by (exact, a commit message that names a central task ID central:<request>/T<n>; other IDs in commit messages make no link), implements, verifies and documents (declared), and the PR references, which git maps to a merge ("Merge pull request #n" or a subject that ends in "(#n)" in the first-parent history at the selected commit): "merged at <sha>", or unknown "no merge found", never "not merged"; one function in src/v4/git.js serves the central repo and the output repos. al index binds a declared output with the output repo's commit. In an output repo, al check looks up the central IDs that the branch's changed files cite. The central repo's checks of these links are T10's; whichever of the PRs of #179 and #180 merges second wires the other's part in.
- D14, 2026-10-10. Source: the agent (architect), message to developer-180 on PR #185 (T12, #180). A repo is the central repo, so that central:X means its own X (D13), only when its config lists outputs. In a repo with no outputs, central:X stays a link to another repo and is not bound.
- D15, 2026-10-10. Source: the agent (architect), message to developer-179 for #179 (T10, T11). al check reads the path claim from the newest Tier: line in the commit messages of base..HEAD, as v1 does; with none, it gives the hint "no Tier line" and the path checks do not run. The exit is 0; --strict exits 1 when a not ok prints, and raises only no kind, no link, an invalid disposition and the marker lints; the judgment hints stay hints. A wording decision names its pair, wording: {source, spec}, and al index fills its source_sha256 and target_sha256 once; a disposition names it with decision: Dn. A typo claim excuses a difference only on its own branch; a typo or 1d PR gets an information hint that names the open changes whose incorporated disposition it makes invalid. Path 0: a promise change with no typo claim is not ok, a kind change into a promise kind included; a non-promise spec paragraph changed with no typo claim gets the hint "path 1d or 2?". Path 1d: not ok when it touches a promise kind, or adds or removes a design paragraph. A near match is a word-set Dice of 0.6 or more, one named constant. Abandoned is valid by the bindings: the changes or removes target still has its bound text, or a new paragraph's text is not in specs/, or an owner decision keeps the effect. Superseded needs the later change's changes or removes binding to the incorporated version, and a valid disposition of that change; an archived change counts as recorded. A deleted accepted ADR is a change to it; a supersedes: link with no target is an unresolved link. al conclude refuses as v1 does, with exit 1, and with --yes writes the Outcome, which shows the evidence and what is unknown.
- D16, 2026-10-10. Source: the agent (architect), message to developer-179 for #179. An adopted paragraph is a spec paragraph that a request's record names in a disposition with source: adoption, with the captured commit and the text hash (design.md 5 and 14). The no-link hint does not fire on it while its text hash equals the captured hash. source: adoption excuses no later change: after an edit the paragraph follows its path, so a typo fix keeps no link and a path-1 edit adds serves:<request>/R<n>. Until T17's command writes the adoption record, tests write it by hand in the T9 record format.
- D17, 2026-10-10. Source: the agent (architect), message to developer-180 for #186 (T13 with T12). al export and al search in the central repo include the output repos that its config, as committed at the selected central commit, lists; each is read through git at its resolved commit, and an unknown one gives no rows and a Not known line with its reason. From an output repo come evidence rows (history for earlier versions): its result files, and its output files, which are the files that a central record declares and the files that cite a central ID. An output row does not hold the whole file: it holds the repo, the commit and the path, the central IDs it cites, the records that declare it, and each line that names a central ID with its line number; a cited file shows how: exact, which proves only that the ID is named, and a declared one how: declared; a file that is both is one row. A result row holds the result record. An output row has this one shape in every repo, the central repo's declared outputs included; paragraph rows of marked docs do not change. The central repo's output files are its declared ones and every other file that names a known ID (central:<ID>, or the bare ID of an item that the central export has at that commit), user docs included, but not the spec's own files: the spec docs in scope, specs/adr/, requests/, .assuredloop/ and the results folder; in an output repo only the qualified form counts. One cite finder serves the central repo and the output repos. al is a trace tool, not a code search engine. al search keeps one index across the repos, shows each hit's repo and commit and each repo's selected commit, walks only each repo's new commits, and drops a repo that becomes unknown from the current index; the roles and the three queries do not change.
- D18, 2026-10-10. Source: the agent (developer-193), issue #193 (T16). Until T17 moves them into place, the v4 skill is skills/assuredloop/SKILL-v4.md and the v4 README is README-v4.md, beside v1's, which stay unchanged; test/v4/docs-v4.test.js checks that each al command and option they name is one that al-v4 accepts, that they name no consolidate and no record section, and that each Tier example is read as a path claim. The skill has one section per path, so an agent reads only its own path's rules, and it sends the agent to al context for the paragraphs and records that its change touches. The cost account runs the T2 developer cases of each path on the invoicer fixture, with a work agent, a records agent that follows the skill, an owner agent and a reviewer, and keeps validation.md's ratio (records-agent tokens over work-agent tokens).
- D19, 2026-10-10. Source: the agent (developer-188), issue #188 (T15). The scale run lives in scale/: generate.js writes the world and run.js times al on it; neither is published or changes al. The world: one central repo with 1,000 requests and 19 output repos. Each request is opened by one pull request, is implemented by one pull request in an output repo, and, except for the last 10, is consolidated and concluded by a later pull request. A change spec has from 50 to 150 paragraphs of about 60 words; about 30% of them change, add or remove a spec paragraph. The spec starts as 50 files of 37 paragraphs, and its adoption is recorded as the archived request adoption, in the form of D16. Each output repo starts with 100 code files that cite nothing. The generator writes the records in al's exact format: al index on the result changes no file. run.js times search at level 1 (--level 1), the level that al holds; a search that falls back to level 0 does not count; level 2 is not timed. The removal of rows is timed against the incremental criterion (2 minutes). The report is requests/assuredloop-v4/scale.md.
- D20, 2026-10-10. Source: the agent (architect), message to developer-188 for #199. al check parses an archived request's record only when the check needs it: when the branch changes the record or the request's folder, or when a paragraph that the branch changes links to that request. The adoption entries are read only from records whose text names adoption. A superseded chain that ends in an archived change needs no parse, because an archived change counts as recorded (design.md 5). al check's output stays the same, byte for byte; besides the tests, this is compared on several PRs of the 1,000-request world of #188.
