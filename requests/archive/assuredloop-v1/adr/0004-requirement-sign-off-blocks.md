# ADR 0004: The owner signs off the organized requirement, and until then the request is blocked

Date: 2026-09-27.
Status: superseded by [ADR 0010](0010-requirement-first-signed-and-blocking.md).
Decided by: the owner (inputs 33, 34, 36 and 37). Consulted: the architect, the
adversary, the case testers.

## Context

- The AI writes the tests as well as the code, so tests cannot anchor the
  work alone (input 16).
- The owner wants the original words kept, and also a consolidated, organized
  requirement that the owner signs off (input 33). RFC terms are welcome
  (input 32).
- Any later change needs a new sign-off, and a quick one; both the original
  and the final versions are kept (input 34).
- The case tests showed three problems:
  - a sign-off tied to commit order is lost in a squash;
  - signing every small amend after merge breaks the record's append-only
    rule;
  - a spike's question is not a requirement.

## Decision

- **The organized requirement.** Every request, except a tier-0 fix and a spike,
  carries one: numbered R-lines with RFC 2119 keywords, provenance tags
  ([owner] / [paraphrase] / [inferred]), and an `Out:` line.
- **Signing.** The owner signs off that text only; the spec text is not signed.
  The sign-off file in `origin/` holds the owner's words and the exact
  requirement text signed.
- **Blocked until signed.** Until the requirement is signed, and again after
  any change to it, the request is **blocked**:
  - `consolidate` and `conclude` refuse, except two actions that retain
    nothing: `consolidate --revert`, and `conclude --dropped` when every
    section retains nothing (ADR 0003);
  - `context` shows it first;
  - `check --strict` is `not ok` for any branch serving the request.
- **Quick re-sign-off.** The tool shows only the change since the last one.
- **Small amends.** A tier-1 amend's PR waits for the sign-off.
- **Spikes.** Need no sign-off.
- **Children.** A child request that reuses the parent's signed R-lines word for
  word inherits that sign-off.

## Alternatives considered

- **Sign the requirement and the spec change together** (v3.1). This covers
  more, but costs the owner more reading. The owner chose the requirement only
  (input 36).
- **Merge small amends "awaiting sign-off" and sign them in batches.** This
  clashes with the append-only archive (adversary, v3.1). Replaced by the
  blocking state.
- **A cryptographic or identity-checked sign-off.** This was the heavy layer
  that failed attempts 1 and 2.
- **No sign-off for small amends.** Rejected: the owner requires one (input
  33).

## Consequences

- Good:
  - the agreement is explicit and anchored to exact text that survives a
    squash;
  - the owner reads short R-lines, not spec prose;
  - drift from the agreement shows at once.
- Bad:
  - each amend waits for an owner round trip;
  - the tool cannot verify who spoke; it shows the recorded source;
  - spec text can move away from a signed R-line without a sign-off. The
    was/now check, review and the "R-line in no section" hint cover that.
- Revisit if: owner round trips become the bottleneck for small amends.
  Confidence: high.
- Checked by: C2 (blocked refusals), C7 (a squash-surviving "changed since
  sign-off").

## History

- None. This is the first record.
