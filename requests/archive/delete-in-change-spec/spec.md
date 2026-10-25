<!-- SP-1 note -->

# Deleting a paragraph of a change spec: the change spec

<!-- SP-2 note -->

This change serves R1 in `request.md`. It changes one promise paragraph of
`specs/design.md`, DES-22: a paragraph deleted from an open request's change
spec gives a hint, not a `not ok`. The rest of DES-22 stays as it is.

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
  OpenSpec CLI caught duplicate requirement names that the v4 model missed.
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
- A change of kind from a promise kind to any other kind counts as a promise
  change.
- The exit code is 0 by default, even when `not ok` lines print. Under
  `--strict`, the exit is 1 when any `not ok` prints. `--strict` raises only
  the findings that need no judgment: no kind, no link, an invalid
  disposition, and the marker lints. The hints that need judgment stay hints
  under `--strict`: near match, "promise kind?", the typo mark, overlap,
  stale base, a stale AI hint, an ADR that governs, a removed target, and a
  paragraph deleted from an open request's change spec.
