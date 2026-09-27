# ADR 0003: Judge every held section by comparing content: link first, then text

Date: 2026-09-27.
Status: accepted.
Decided by: the owner ("Accept", input 52). Proposed by: the architect.
Consulted: the adversary, the case testers.

## Context

- The owner allows partial consolidation "as long as they do not deviate"
  (input 24). Anyone starting in the middle must align with both the change
  and the base (input 25). Closing a change requires consolidation (input 22).
- Recorded commit IDs do not survive squash merges; the adversary showed this
  in a fresh clone.
- A merge-status check passes after a quiet revert (adversary, v1).
- The v3 case tests broke the first section model in 26 places (G1-G5). The
  failures included:
  - parents holding their subsections;
  - ambiguous IDs;
  - moves;
  - "builds on" chains that got stuck;
  - whitespace that erased real changes in code blocks.

## Decision

- **Sections.** A section is one heading plus its text up to the next heading
  of any level. It is identified by a bracketed ID, `[INV-3]`, unique within
  a baseline root. Only sections with an ID can be held by a change.
- **Comparison.** Exact text, normalizing only line endings, trailing spaces,
  blank lines at the edges of the section, and the heading level. Code blocks,
  indentation and list structure are compared exactly.
- **Blocks and links.** Each change block has its own identity:
  `<request>/<ID>@<n>`, the versions within one request. `builds on` names a
  block version. A request's revision keeps its old block and adds the next
  version on top.
- **State.** Each held section's state is computed on read, in two steps:
  1. the `builds on` link is checked, per block: broken link (including a
     cycle of blocks), base dropped, or base revised;
  2. the text decides: no change yet, consolidated, carried by a successor
     along a valid chain, waiting, pending, not found, or differs.
- **Consolidate.** It writes only pending sections.
- **Retains nothing.** Established positively from content, whatever the
  link state, and never inferred from a mismatch. A block retains nothing only
  when:
  - its "was" equals its "now";
  - the baseline equals its "was" exactly (for an add: the ID is absent); or
  - it is waiting on a chain that was never applied.

  Everything else counts as possibly retained, and must be reverted, or
  accepted and kept. One definition covers section drops, whole-request drops,
  and the blocked-state exception.
- **Conclude.** It needs every section consolidated or carried, dropped while
  it retains nothing (or reverted), or kept with signed content.
- **What counts as history.** No commit ID is recorded as evidence. "Concluded
  on main" is derived from main's history.

## Alternatives considered

- **Record a commit or a hash at fold time.** Squash orphans it; the adversary
  reproduced this.
- **Git merge status** ("nothing left to merge"). It gave a false pass after a
  revert (adversary, v1).
- **OpenSpec's heading-text identity with whole-block replace.** It silently
  overwrites (research B).
- **Whitespace-insensitive comparison.** It erases indentation changes in code
  (adversary, v3.1; executed).

## Consequences

- Good:
  - works after squash, rebase and moves;
  - one mechanism for deviation, alignment and conclusion;
  - no stored state to go stale.
- Bad:
  - comparisons are textual: two changes to different sections can agree
    textually and contradict in meaning (the stated limit; judged in review);
  - held sections need IDs;
  - large sections make large was/now blocks.
- Revisit if: a real run shows common stuck or false states, or sections too
  big to compare usefully. Confidence: medium, until the first built version
  passes C2 and C3. R1 found 23 problems in v3.2's rules; all were fixed on
  paper in v3.3, and five were checked in R1's model.
- Checked by: C2 and C3, including the chain, revised-predecessor, cycle,
  code-block and ID-allocation fixtures.

## History

- None. This is the first record.
