# ADR 0012: A deterministic script: no LLM, network or database; Node ESM with no runtime dependencies; under 3,500 lines

Date: 2026-09-28.
Status: accepted.
Decided by: the owner (the line budget, 2026-09-28, snapshot
`requests/assuredloop-v1/origin/2026-09-28-chat-with-the-owner-architect-session-claude-code.md`;
the rest, "Accept", input 52). Proposed by: the architect. Consulted: the
developer, who measured the size.
Supersedes: [ADR 0009](0009-a-deterministic-script-node-zero-dependencies.md).

## Context

- Judgment belongs to the agent and its skills. The script gathers and checks
  (inputs 11 and 34: "thinking to be done by a skill").
- Files are the authority (attempts 1 and 2).
- It must work offline, for non-code projects too (input 13).
- The kit (`@assuredloop/orca-bot-kit`) is Node ESM, tested with `node --test`.
- The owner earlier required Node.js for scripts.
- Attempt 2 pinned OpenSpec internals and paid for it.
- Task Master measured that MCP schemas cost 15-20% of tokens (research E).
- The signed requirement R11 asks for a light tool, and for formality that
  costs no more than about a fifth of the change. It sets no line count.
- ADR 0009 set "under 2,000 lines of CLI source" as the size target (design
  check C9) before any code was written. It was an estimate.
- Measured on 2026-09-28, after parts 1-6 of 10: 2,115 lines in `src/` and
  `bin/`, of which 1,764 are neither blank nor comments. Part of that is
  safety code the reviews asked for and the design did not foresee: no writes
  through symlinks or `..`, atomic writes with rollback, exclusive temp files,
  canonical paths.
- The architect's rough estimate for the rest: part 7 about +350, part 8 about
  +350, part 9 about +200, part 10 about +50, so about 3,000 at the end. This
  is an estimate, not a measurement.
- Known so far about git: "concluded on main" uses `git log --first-parent`
  with diffs of merges, which git 2.31 and newer computes (PR #79).

## Decision

- The CLI is deterministic:
  - no LLM calls;
  - no network. The agent fetches originals, and the tool stores each as a
    snapshot with its SHA-256 and fetch metadata (ADR 0006);
  - no database or cache holding unique truth;
  - the same inputs give the same output. The inputs are the repository, its
    refs and their recorded times, the working tree, and the command line.
    The tool reads no clock except to stamp what it writes, and reports times
    as timestamps, never as ages.
- It is written in Node ESM with zero runtime dependencies (only Node and git;
  the version floor is set in part 10), and tested with `node --test`.
- It has 7 commands, a CLI and one skill, and no MCP server.
- Its CLI source stays under 3,500 lines, counted as every line of the `.js`
  files in `src/` and `bin/`, blank lines and comments included. Tests are not
  counted.

## Alternatives considered

- **Keep the 2,000-line budget, and trim and cut.** Trimming now saves about
  100-150 lines at some cost to readability. Staying under would then mean
  leaving out promises that serve the signed requirements in parts 7-9. Not
  chosen: the budget was an early estimate, and the requirement asks for
  lightness, not a line count.
- **Drop the line count,** and judge lightness only by the formality cost
  (R11's fifth) and the fresh-reader test. Not chosen: a ceiling keeps growth
  visible and makes each part weigh what it adds.
- **An MCP server.** Its schemas cost context tokens, and it adds a runtime.
- **Python.** It does not match the kit.
- **Depending on OpenSpec or other packages.** This brings pinning and churn;
  see ADR 0002.
- **Letting the script call an LLM for fuzzy linking.** It is not
  deterministic, not offline, and has a cost.

## Consequences

- Good:
  - the same answer on every run;
  - runs anywhere git runs;
  - cheap to review;
  - the budget matches what the work turned out to need, with room for parts
    7-10 and nothing more.
- Bad:
  - rough links stay lexical and history-based, never semantic;
  - some parsing (Markdown sections, JUnit) is written by hand;
  - a larger tool than first planned: about 3,000 lines expected, against the
    2,000 first estimated.
- Revisit if:
  - a real need for semantic linking appears. Then it goes in a skill, not the
    script. Confidence: high (carried over from ADR 0009).
  - the estimate for a part is exceeded by more than a third, or the total
    passes 3,500. Then cut a part's scope, or bring the budget back to the
    owner. Confidence: medium. The remaining parts are estimated, not measured.
- Checked by: C9 in part 10 (no runtime dependencies; the line count of
  `src/*.js` and `bin/*.js`), and C7 (offline). Each part's PR states the line
  count after it.

## History

- 2026-09-27, [ADR 0009](0009-a-deterministic-script-node-zero-dependencies.md):
  a deterministic script, Node ESM, no runtime dependencies, 7 commands, one
  skill, no MCP server, and under 2,000 lines as the target. Replaced because
  the size target was an estimate made before any code; after 6 of 10 parts
  the source was 2,115 lines, and the owner raised the ceiling to 3,500
  (2026-09-28).
