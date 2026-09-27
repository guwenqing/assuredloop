# ADR 0011: The owner signs off the organized requirement; work may be drafted before, and is delivered with the sign-off or after it

Date: 2026-09-27.
Status: accepted.
Decided by: the owner (inputs 33, 34, 36, 37, 41, 42, 44, 48 and 50).
Consulted: the architect, the adversary, the reviewer (PR #56), the case
testers.
Supersedes: [ADR 0010](0010-requirement-first-signed-and-blocking.md).

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
- Spikes are signed off too, less formally (input 42).
- The signed requirement must come first, so it can be trusted (input 44).
- The review of PR #56 found that R10 ("only consolidate and conclude
  refuse") conflicted with ADR 0010's refusal of `record section` before the
  sign-off. The owner then set the rule (input 50): "people can work on the
  spec work before sign off but the spec work or any later work have to be
  delivered as part of sign-off or after", in one commit, or sign-off first
  and a separate PR after.
- The way of working belongs to the bots, not to AssuredLoop (input 48).

## Decision

- **Two sections in every request** except a tier-0 fix:
  - **Owner's words and dialog**: append-only and dated, holding the owner's
    words and the AI's questions with the answers. Every original is
    snapshotted with a SHA-256 (ADR 0006).
  - **Organized requirement**: one statement holding one or more requirements
    (R1, R2…), with RFC 2119 keywords, an `Out:` line, and an `Assumed:` list
    of what the AI added.
  - For a spike this is an **Organized question** in plain words.
- **Signing.** The owner signs off the whole organized section; the spec text
  is not signed. The sign-off file holds the owner's words, the exact text
  signed and its SHA-256.
- **Draft before, deliver with or after.** Spec work and any later work may be
  drafted before the sign-off. They are delivered with the sign-off (the same
  commit or PR) or after it (a later PR). No command refuses drafting.
- **Blocked until signed.** Until the organized section is signed, and again
  after any change to it, the request is **blocked**:
  - `consolidate` and `conclude` refuse, except `consolidate --revert`, and
    `conclude --dropped` when every section retains nothing (ADR 0003);
  - `context` shows the blocked state first;
  - `check` reports `not ok` for a branch whose final state delivers spec work
    or other work for the request while it is still blocked there. A branch
    that brings the sign-off with the work is not blocked;
  - a hint shows work that reached main in an earlier commit than the
    request's first sign-off.
- **Quick re-sign-off.** Only the change since the last sign-off is shown.
  Every signed version is kept.
- **Children.** A child request that copies some of the parent's signed
  requirements word for word inherits the parent's latest sign-off for them.
- **Not decided here.** Whether and when implementation starts is the bots'
  rule (input 48).

## Alternatives considered

- **Refuse to start spec work before the sign-off** (ADR 0010). It conflicted
  with R10, and the owner allows drafting before the sign-off (input 50).
- **Sign the requirement and the spec change together** (v3.1). It covers
  more, at more reading cost for the owner (input 36).
- **Line-by-line requirements with provenance tags.** Replaced by the two
  sections and `Assumed:` (input 41).
- **Unsigned spikes.** Reversed by the owner (input 42).
- **Merge small amends "awaiting sign-off" and sign them in batches.** It
  clashes with the append-only archive.
- **A cryptographic or identity-checked sign-off.** This was the heavy layer
  that failed attempts 1 and 2.

## Consequences

- Good:
  - the agreement is explicit, anchored to exact text, and survives a squash;
  - drafting is never blocked;
  - nothing that depends on an unsigned requirement reaches main unflagged;
  - the tool's only refusals stay `consolidate` and `conclude` (R10).
- Bad:
  - delivery before the sign-off is flagged, not prevented, unless a project
    turns on `check --strict` in CI;
  - every request except a tier-0 fix waits for an owner round trip before
    delivery;
  - the tool cannot verify who spoke.
- Revisit if: work before sign-off is often delivered despite the flag.
  Confidence: high.
- Checked by:
  - C2 (blocked refusals, the allowed revert and the no-retention drop);
  - C4 (drafting allowed while blocked; a branch delivering work while
    blocked gives `not ok`; the sign-off in the same PR clears it);
  - C7 ("changed since sign-off" surviving a squash).

## History

- 2026-09-27, [ADR 0004](0004-requirement-sign-off-blocks.md): the owner signs
  off the R-lines only; blocked until signed; spikes unsigned; tier-1 PRs wait.
- 2026-09-27, [ADR 0010](0010-requirement-first-signed-and-blocking.md): two
  sections; spikes signed; sign-off before any spec work, enforced by
  `record section` refusing while blocked. Replaced because that refusal
  conflicted with R10, and the owner allowed drafting before the sign-off
  with delivery together with it or after it (input 50).
