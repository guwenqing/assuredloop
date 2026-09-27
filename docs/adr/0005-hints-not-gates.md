# ADR 0005: Hints in the output, not a harness; only a few hard rules

Date: 2026-09-27.
Status: accepted.
Decided by: the owner ("Accept", input 52). Proposed by: the architect.
Consulted: the adversary.

## Context

- The owner moved "from mechanical harness" to "provide the hint as part of the
  mechanical script and the output of the script". Script output should
  disclose progressively, and the outcome summary should be full (inputs 11
  and 12).
- Scripts must help the AI focus, not block it (input 1). There should be no
  formality monster (input 31).
- The earlier attempts show the cost of the other way. Attempt 0 had blocking
  hooks. Attempt 2 exited 1 on any non-pass and refused to run without a
  policy.
- Evidence on how agents respond:
  - Stripe (2026-05-14): errors and instructions in loaded context steer
    agents; warnings in passing are ignored.
  - planning-with-files: advice pushed into context every turn caused most of
    its bugs.
  - haft, OpenFastTrace and Perez inform rather than gate.

## Decision

- Every command prints a short, layered view with at most 3 hints (5 in
  `check`), ranked, with "N more". Each view ends with "Next" (the command to
  run) and "Not known".
- `context`, `spec` and `check` exit 0.
- **The only refusals are the tool's own `consolidate` and `conclude`, for
  their own request** (ADR 0003). They also refuse while a request is blocked
  on its sign-off (ADR 0011). Drafting is never refused. Delivering work for a
  blocked request is a `not ok` in `check`, not a refusal (owner's R3 and
  R10).
- `check --strict` is opt-in for CI. It counts only the diagnostics owned by
  requests the branch serves or archives, so a hotfix is never failed by
  another request's alignment debt.
- Nothing is installed in git hooks. Nothing is pushed into the agent's
  context by default.

## Alternatives considered

- **Blocking hooks and gates.** This was attempt 0, and it cost 61k lines.
- **Exit 1 on any finding.** This was attempt 2, and it turned every hint into
  a stop.
- **Advice pushed every turn.** planning-with-files' bugs showed the cost.
- **Pure advice with no refusals at all.** This fails the owner's foundation
  line: closing requires consolidation. It also fails the blocking sign-off.

## Consequences

- Good:
  - the agent meets hints in output it asked for, which counts as loaded
    context;
  - no ceremony stops the work;
  - projects can opt into strictness.
- Bad:
  - a project that never runs `check` on its PRs loses the per-commit
    append-only check (ADR 0006);
  - hints can be ignored;
  - the value depends on the agent running `context` at the right moments,
    which is tested by C10.
- Revisit if: the C10 fresh-reader or a real run shows agents ignoring the
  hints. The candidate then is an optional, once-per-session, dormant re-anchor
  (borrowed-ideas #91). Confidence: medium.
- Checked by: C8 (exit codes, no hooks), C3 (the hotfix strict exit).

## History

- None. This is the first record.
