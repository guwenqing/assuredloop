# ADR 0010: The owner's words become an organized requirement, signed off first; until then the request is blocked

Date: 2026-09-27.
Status: superseded by [ADR 0011](0011-requirement-signed-work-delivered-with-or-after.md).
Decided by: the owner (inputs 33, 34, 36, 37, 41, 42, 44 and 48). Consulted: the
architect, the adversary, the case testers.
Supersedes: [ADR 0004](0004-requirement-sign-off-blocks.md).

## Context

- The AI writes the tests as well as the code, so tests cannot anchor the
  work alone (input 16).
- The owner wants:
  - the original words kept;
  - a consolidated, organized requirement, signed off by the owner (input 33),
    with RFC terms welcome (input 32);
  - a quick re-sign-off after any later change, with the original and the
    final both kept (input 34).
- The owner's words are often unstructured. The organized requirement is a
  written-up statement, not a line-by-line translation (input 41).
- The sign-off must come before any spec work, so the signed requirement can
  be trusted; small work may do it all at once (input 44).
- Spikes need a sign-off of what the owner wants to learn too, in a less
  formal form (input 42). This reverses the earlier "no sign-off for spikes"
  (input 37).
- The case tests found three problems:
  - a sign-off tied to commit order is lost in a squash;
  - signing small amends after merge clashes with the append-only archive;
  - an unsigned request must still be droppable when nothing of it was
    applied.
- The way of working (whether implementation may start early, how review is
  done) belongs to the bots, not to AssuredLoop (input 48).

## Decision

- **Two sections in every request** except a tier-0 fix:
  - **Owner's words and dialog**: append-only and dated, holding the owner's
    words and the AI's questions with the answers. Every original, link or
    chat, is snapshotted with a SHA-256 (ADR 0006).
  - **Organized requirement**: one statement holding one or more requirements
    (R1, R2…), with RFC 2119 keywords, an `Out:` line, and an `Assumed:` list
    of what the AI added.
  - For a spike this is an **Organized question** in plain words: what we want
    to find out, what a useful answer looks like, and what is out.
- **Signing.** The owner signs off the whole organized section (requirement or
  question). The spec text is not signed. The sign-off file holds the owner's
  words, the exact text signed and its SHA-256.
- **Blocked until signed.** Until that section is signed, and again after any
  change to it, the request is **blocked**:
  - `consolidate` and `conclude` refuse, except two actions that retain
    nothing: `consolidate --revert`, and `conclude --dropped` when every
    section retains nothing (ADR 0003);
  - `record section` refuses, so no spec work starts before the sign-off. A
    hint shows when a change spec reached main before the first sign-off;
  - `context` shows the blocked state first;
  - `check --strict` is `not ok` for any branch serving the request.
- **Order.** For tiers 2, 3 and S: words, then the organized section, then the
  sign-off, then spec work. Tier 1 may do all of it in one PR, whose merge waits
  for the sign-off.
- **Quick re-sign-off.** The tool shows only what changed since the last
  sign-off. Every signed version is kept, so the first and the final
  requirement are both on record.
- **Children.** A child request that copies some of the parent's signed
  requirements word for word inherits the parent's latest sign-off for them.
- **Not decided here.** Whether implementation may start before the sign-off
  is the bots' rule (input 48). AssuredLoop shows the state, and its own
  commands refuse.

## Alternatives considered

- **Sign the requirement and the spec change together** (v3.1). It covers
  more, at more reading cost for the owner. The owner chose the requirement
  only (input 36).
- **Line-by-line requirements with provenance tags** (v3.1-v3.3). This forces
  a translation of unstructured words. It is replaced by the two sections and
  the `Assumed:` list (input 41).
- **Unsigned spikes** (input 37). Reversed by the owner (input 42), so that the
  trace from what was wanted to the work done is controlled.
- **Merge small amends "awaiting sign-off" and sign them in batches.** It
  clashes with the append-only archive (adversary, v3.1).
- **A cryptographic or identity-checked sign-off.** This was the heavy layer
  that failed attempts 1 and 2.

## Consequences

- Good:
  - the agreement is explicit, anchored to exact text, and survives a squash;
  - the owner reads a short organized statement, with the AI's assumptions
    listed apart;
  - the spec work starts from a trusted requirement;
  - drift from the agreement shows at once.
- Bad:
  - every request, spikes included, waits for an owner round trip;
  - the tool cannot verify who spoke; it shows the recorded source;
  - spec text can move away from a signed requirement without a new
    sign-off; the was/now check, the review and the "requirement in no
    section" hint cover that.
- Revisit if: owner round trips become the bottleneck. Confidence: high.
- Checked by:
  - C2: the blocked refusals, and the allowed revert and the no-retention
    drop;
  - C4: a spike's signed question, and `record section` refused while
    blocked;
  - C7: "changed since sign-off" surviving a squash.

## History

- 2026-09-27, [ADR 0004](0004-requirement-sign-off-blocks.md): the owner signs
  off the R-lines only; blocked until signed; spikes unsigned; tier-1 PRs wait.
  Replaced because the owner reshaped the request into two sections (words and
  dialog, then an organized requirement), required a sign-off of spike
  questions too, and put the sign-off before any spec work (inputs 41, 42 and
  44).
