# ADR 0007: Links between requests, spec, code and tests are rough, derived from git, and shown with their reasons

Date: 2026-09-27.
Status: accepted.
Decided by: the owner ("Accept", input 52). Proposed by: the architect.
Consulted: the case testers.

## Context

- The owner wants code changes and test effort chained together (input 18).
  "No aim to find exact … a rough link is more important than the strict
  list, which misses things" (input 19). IDs belong inside big files that mix
  requests (input 22.6).
- Strict link lists (OpenFastTrace needs/covers, AI-DLC trace JSON, spec-kitty
  mappings) cost tagging and still miss links.
- Squash merges drop or indent trailers (G1, G3, G5).

## Decision

Links are derived when read, strongest first, and each is shown with its
reason:
1. **A bracketed ID near the change**, in code or a test name. Optional.
2. **Blame, then the request.**
   - Blame runs on the old side for changed or deleted lines.
   - It uses `-w -M -C` for code, and no `-C` for `specs/`.
   - The repo's `.git-blame-ignore-revs` is honoured.
   - The commit found maps to its request through:
     - a `Request:` line anywhere in its message;
     - else the request folder it touched ("ambiguous" when it touched more
       than one);
     - else an issue number listed in a request's Original.
3. **Co-change.** Commits touching more than 30 files are skipped, and the
   count is shown.
4. **Shared words** between section headings and code or test names. The
   weakest.

There is no required link list.

## Alternatives considered

- **Explicit-only links** (agent-spec). Precise, but misses what nobody tagged.
  It goes against input 19.
- **Required ID tags on every function and test** (StrictDoc, OpenFastTrace).
  The tagging cost is high, and IDs collide across branches.
- **Git notes.** Not pushed by default, and lost on rewrite unless configured
  (research H2).

## Consequences

- Good:
  - nothing to maintain by hand;
  - it survives squash through the folder fallback;
  - the reasons let a reader weigh each link.
- Bad:
  - false positives, which are ranked and capped;
  - blame shows who touched a line last, not intent;
  - a new repo has thin history.
- Revisit if: C5 shows the top-ranked links are mostly wrong on a real repo.
  Confidence: medium.
- Checked by: C5 (mixed files, formatting sweeps, moves, missing trailers,
  large commits, scoped IDs).

## History

- None. This is the first record.
