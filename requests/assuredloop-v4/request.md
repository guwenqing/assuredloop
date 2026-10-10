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
