# ADR 0001: Rebuild AssuredLoop in the existing repo, with the old version on a legacy branch

Date: 2026-09-27.
Status: accepted.
Decided by: the owner (inputs 35 and 38). Consulted: the architect.

## Context

- AssuredLoop was attempted three times. The last attempt,
  `guwenqing/assuredloop`, reached `baa2ba0` on main, with 25 feature branches,
  one build tag, and 30 issues and 25 PRs of discussion.
- That attempt failed for two reasons: it took in a way of working and a
  project-management loop, and it built an adversarial self-assurance layer
  (`research/notes/G-owner-attempts.md`).
- The redo shares the name and the goal, but none of the code.
- The owner first chose a new repo (input 35), then chose to reuse and clear
  this one (input 38). The old material must stay recoverable.

## Decision

- We will build the redo in `guwenqing/assuredloop`.
- The old main is kept on a `legacy` branch.
- `main` restarts as a fresh history.
- A full local mirror of the old repo is kept, with every branch, tag and PR
  ref, and the downloaded issue and PR text.
- The old feature branches are removed from GitHub, since the mirror keeps
  them.
- Issues, PRs and the build tag stay in the repository.

Done on 2026-09-27:
- the mirror is at `bots/assuredloop/work/architect/legacy/`: 26 branches, 1
  tag, 25 PR refs, `fsck` clean;
- `legacy` is at `baa2ba0`;
- `main` restarted at `08a6d9f`, a README only, pushed with a lease pinned to
  `baa2ba0`;
- the 25 `codex/*` branches were removed with the owner's explicit OK, each
  first checked in the mirror at the same commit.

## Alternatives considered

- **A new repo** (the owner's first choice). It gives a clean name history, but
  splits the project's issues and discussion across two repos. The owner
  replaced it with the reuse.
- **Clearing main by a commit that deletes every file.** This keeps the old
  history on main. It was not chosen: the owner asked for the old main to live
  on `legacy`, so a fresh main history reads more clearly.
- **Keeping the old feature branches on GitHub.** This is harmless but
  cluttered. The owner allowed their removal because the mirror holds them.

## Consequences

- Good:
  - one repo, one name;
  - the old version is one `git checkout legacy` away;
  - the old discussions stay linked.
- Bad:
  - clones made before 2026-09-27 have a main that no longer exists on GitHub,
    so they must re-clone or reset;
  - the local mirror lives in a work folder that is not versioned.
- Revisit if: the mirror's folder is cleaned up; move it somewhere permanent
  first. Confidence: high.
- Checked by: `git ls-remote origin` shows only `main`, `legacy` and the tag;
  `git -C <mirror> rev-parse main` = `baa2ba0`.

## History

- None. This is the first record.
