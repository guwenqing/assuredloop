# ADR 0009: A deterministic script: no LLM, network or database; Node ESM with no runtime dependencies

Date: 2026-09-27.
Status: accepted.
Decided by: the owner ("Accept", input 52). Proposed by: the architect.

## Context

- Judgment belongs to the agent and its skills. The script gathers and checks
  (inputs 11 and 34: "thinking to be done by a skill").
- Files are the authority (attempts 1 and 2).
- It must work offline, for non-code projects too (input 13).
- The kit (`@assuredloop/orca-bot-kit`) is Node ESM, tested with `node --test`.
- The owner earlier required Node.js for scripts.
- Attempt 2 pinned OpenSpec internals and paid for it.
- Task Master measured that MCP schemas cost 15-20% of tokens (research E).

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
- It is written in Node ESM with zero runtime dependencies (only Node and git,
  version floor to confirm), and tested with `node --test`.
- It has 7 commands, a CLI and one skill, and no MCP server.

## Alternatives considered

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
  - under 2,000 lines is the target (C9).
- Bad:
  - rough links stay lexical and history-based, never semantic;
  - some parsing (Markdown sections, JUnit) is written by hand.
- Revisit if: a real need for semantic linking appears. Then it goes in a skill,
  not the script. Confidence: high.
- Checked by: C7 (offline), C9 (no dependencies, size).

## History

- None. This is the first record.
