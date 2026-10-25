<!-- SP-1 note -->

# Trace links on ADRs: the change spec

<!-- SP-2 note -->

This change serves R1 in `request.md`. It changes SCH-22 in
`specs/schema.md` (the ADR rules), and DES-22 (what the script checks) and
DES-9 (the sets of files) in `specs/design.md`. Each section has the promise
paragraph first, then the design that keeps it.

<!-- SP-3 note -->

## Links added to an accepted ADR, and the missing links

<!-- SP-4 rule serves:R1 changes:SCH-22 -->

- One file per decision, numbered, in `specs/adr/`. Its text does not change
  after it is accepted. Only its status changes: proposed → accepted →
  superseded by ADR-n. Who accepts it is the project's way of working; the
  schema records only its source.
- Links: `decides` → the paragraphs that it governs; `source` → the sign-off
  or the owner's words; `supersedes` → an older ADR. The text also names the
  alternatives that were considered.
- A change to an accepted ADR's text is `not ok`. Write a new ADR that
  supersedes it.
- Links may be added to the marker of an accepted ADR when nothing else
  changes: the same ID and kind, each old link kept with the same target,
  and the text below the marker unchanged. A changed or removed link is a
  change to its text.
- A proposed or accepted ADR with no `source` or no `decides` link gets a
  hint; under `--strict`, `not ok`. A superseded ADR gets none: it is
  history.
- A PR that changes a paragraph that an ADR governs gets a hint: "check that
  ADR-3 still holds". The review view marks each ADR that it names that has
  no `source` link.
- An ADR's ID is its number. It is in the file name, for example
  `specs/adr/0003-export-links-expire.md`, and on the markers of its
  paragraphs. Its status is a line at the top of the file.
- A superseded ADR keeps its `decides` links as history, even to paragraphs
  that were removed later.

<!-- SP-5 approach serves:R1 builds-on:SP-4 -->

`al check` compares each ADR that was `accepted` at the base with the
working tree. When the text after the Status line differs, it compares the
two again without the line of the heading marker `ADR-<n>`. When only that
line differs, the ID and the kind are the same, and each link word and
target of the old marker is in the new marker, there is no finding. The
order of the links does not count. Else the finding is `not ok adr-changed`,
as before. An ADR that was `superseded` at the base keeps the old rule:
each change other than its Status line is `not ok`.

<!-- SP-6 approach serves:R1 builds-on:SP-4,SP-9 -->

`al check` reads the heading marker of each ADR whose status in the working
tree is `proposed` or `accepted`. When it has no `source` link, no `decides`
link, or neither, one finding `adr-links` on `ADR-<n>` names what is
missing. It is at the marker line, or at the file when the ADR has no
heading marker. It is a hint, and `not ok` under `--strict`.

<!-- SP-7 approach serves:R1 builds-on:SP-4 -->

`al context --diff <range> --for review` reads the ADRs at the head of the
range. When ADR-n's heading marker has no `source` link, its line `governed
by ADR-n (<status>)` gets `; no source:` inside the brackets. Each finding
line of the view whose message names ADR-n ends with `; ADR-n has no
source:`. The lines of `al check` do not change.

<!-- SP-8 note -->

## What the script checks

<!-- SP-9 rule serves:R1 changes:DES-22 -->

**What the script checks** (no AI):
- A paragraph with no ID: `not ok`. A promise or design paragraph with no kind
  or no link: a hint; under opt-in `--strict`, `not ok`. An adopted paragraph
  (section 5) gets no link hint while its text equals the captured text.
- A proposed or accepted ADR with no `source` or no `decides` link: a hint;
  under `--strict`, `not ok` (schema.md 5).
- A link to an ID that does not exist: `not ok`. When another change removed
  the target, the link gets the hint "target removed" instead, and the open
  change aligns.
- Two headings with the same text under the same parent (the same heading
  path): a hint. The same text under different parents is valid. Why: two headings with the same path make a reference ambiguous.
- Per PR, the ID lint: IDs lost since the base, IDs used twice, and IDs used
  again after removal. Agents can remove comments near the lines they edit
  (claude-code issue #22530), so a lost ID must be caught. A lost ID is at the
  base, absent at the head in every doc of its scope, and named by no
  `removes:`. An ID used again is absent at the base but was used in an
  earlier commit.
- In an open request's change spec, deleting a paragraph is ordinary
  editing. Its lost ID is a hint that names the deletion, and each
  disposition or wording decision of the request that names the ID. When the
  deletion is on purpose, nothing more is needed: the ID is retired and never
  used again. A marker removed by accident, with its text kept, still leaves
  a paragraph with no ID, which is `not ok`. In `specs/` and in an archived
  change spec, a lost ID is `not ok`.
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
- A design or `approach` paragraph in a change spec can serve a
  requirement that promise paragraphs of the same change spec also serve.
  When it has no `builds on` or `changes` link to one of them, it gets the
  hint "which promise does it keep?". Why: else the records cannot say
  which design keeps which promise (issue #229).
- Where the project uses tasks: a `for <task>` that names no task in the
  record: a hint.
- A change of kind from a promise kind to any other kind counts as a promise
  change.
- The exit code is 0 by default, even when `not ok` lines print. Under
  `--strict`, the exit is 1 when any `not ok` prints. `--strict` raises only
  the findings that need no judgment: no kind, no link, an ADR with no
  `source` or no `decides`, an invalid disposition, and the marker lints.
  The hints that need judgment stay hints under `--strict`: near match,
  "promise kind?", the typo mark, overlap, stale base, a stale AI hint, an
  ADR that governs, a removed target, a paragraph deleted from an open
  request's change spec, "which promise does it keep?", and a `for` that
  names no task.

<!-- SP-10 note -->

## The sets of files

<!-- SP-11 data serves:R1 changes:DES-9 builds-on:SP-4 -->

| Set | Where | Holds | Changes how |
|---|---|---|---|
| One change | `requests/<name>/origin/` | the owner's words as snapshots, with SHA-256 | append only |
| | `requests/<name>/request.md` | the dialog, the organized requirement (R1...), the sign-off line, decisions (D1...), task references, the outcome | the requirement is an editable draft until it is signed (section 6); signed versions, the dialog and the decisions are append only; task references and the outcome are updated |
| | `requests/<name>/spec.md` | **the change spec**: the promises this change adds or changes, its design (the largest part), its plan, and its explanations | edited in the change's PRs |
| Consolidated | `specs/*.md` | the system now: the promises and the lasting design, told apart by kind | a PR replaces paragraphs by hand |
| | `specs/adr/` | the decisions; an ADR is superseded, never edited, but links may be added to its marker | a new ADR file, or links added to a marker |
| Outputs | code, tests, `docs/` | the product and its user documents | normal PRs; traced from the change's record (input 112) |
| Tool data | `.assuredloop/` | `config.yaml`, `schema.yaml`, `records/` | the developer's agent and `al` |
