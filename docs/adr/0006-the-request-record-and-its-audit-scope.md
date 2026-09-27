# ADR 0006: The request record is repo files with permanent names, append-only parts, and a stated audit scope

Date: 2026-09-27.
Status: accepted.
Decided by: the owner ("Accept", input 52). Proposed by: the architect.
Consulted: the adversary.

## Context

- The owner asks for:
  - the original words, which may be a GitHub link;
  - all original logs kept for audit (input 22.3);
  - flexible intake (input 10);
  - a formal, traceable way of working (input 29).
- Squash merges keep only a PR's final state.
- Attempt 2's Markdown+JSON record format caused repeated ceremony bugs.
- Tools that normalize the request rarely keep its raw words (research H2).

## Decision

- **A request is `requests/<name>/`.**
  - The name is its permanent ID, never reused. Concluding moves the folder to
    `requests/archive/<name>/`, under the same name.
  - `request.md` opens with two sections (input 41):
    - **Owner's words and dialog**: append-only and dated, the owner's own
      words and the AI's questions with the answers;
    - **Organized requirement**: one written-up statement holding one or more
      requirements (R1, R2…), with `Out:` and `Assumed:`, signed off as a
      whole.

    Then Decisions, Parts and Outcome, as needed. A tier-1 record is about 8
    lines.
  - `origin/` holds the originals and the sign-off files.
- **Every original is snapshotted** (input 41): links and chats alike. Each
  snapshot has a header (the source, the time fetched, the target's
  last-updated time where the source gives one, and a SHA-256 of the text),
  then the text exactly as fetched. The script stays offline: the agent
  fetches and the script stores, hashes and later verifies a re-fetch. Changed
  text is appended as a new snapshot.
- **Append-only.** The Owner's words and dialog, the Decisions, `origin/`, and anything in
  `archive/` are append-only. A request archived in the same branch may still
  be edited before merge. `check` verifies append-only per commit over
  `main..HEAD`.
- **Audit on demand** (inputs 44 and 45). `--audit` on a request, a section or
  `path:line` returns the whole trace, and re-checks every hash. `--at
  <commit>` replays any past state.
- **Audit scope.** A plain clone of main can audit:
  - every original supplied;
  - every sign-off with its text;
  - every decision;
  - every version of `request.md` and `change.md` that reached main.

  Drafts inside a squashed PR are not kept.
- **The Outcome.** It holds content facts only, never commit IDs; commits are
  derived when read.

## Alternatives considered

- **A JSON record in a Markdown carrier** (attempt 2). It caused ceremony bugs
  (#27, #47, #17).
- **Records in GitHub issues only.** Not auditable offline, and snapshots go
  stale (research H2).
- **Keeping every draft version inside the repo.** That grows a history store
  for draft edits. The owner can choose merge commits instead of squash.
- **A database.** Rejected: files are the authority (attempts 1 and 2 agreed).

## Consequences

- Good:
  - readable without the tool;
  - offline audit;
  - honest about what was captured.
- Bad:
  - append-only is checked only when `check` runs on the PR (the stated limit);
  - snapshotting a link is a deliberate fetch by the agent; the script does
    not fetch.
- Revisit if: owners find audits missing needed draft history; then use merge
  commits, or keep designated revisions as content. Confidence: high.
- Checked by: C7 (fresh-clone audit, per-commit append-only, snapshot hashes,
  `--audit` from a code line, `--at` replay).

## History

- None. This is the first record.
