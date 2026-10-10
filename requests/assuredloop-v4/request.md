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
