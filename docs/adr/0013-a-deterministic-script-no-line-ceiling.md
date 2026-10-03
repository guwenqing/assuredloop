# ADR 0013: A deterministic script: no LLM, network or database; Node ESM with no runtime dependencies; no line ceiling

Date: 2026-10-02.
Status: accepted.
Decided by: the owner (the line ceiling, 2026-10-02, in the architect's
session: "Code budget is fine. You can remove that if you want." and "it is
not refer to line of codes it is refer to the process, the overhead and
requirement you put on people"; the rest, "Accept", input 52). Proposed by:
the architect.
Supersedes: [ADR 0012](0012-a-deterministic-script-under-3500-lines.md).

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
- ADR 0009 set "under 2,000 lines of CLI source" (design check C9) before any
  code was written, as an estimate. ADR 0012 raised it to 3,500 after part 6.
- Measured on 2026-10-02, after the build, the owner's follow-ups and the
  adversarial validation: 3,392 lines in `src/` and `bin/`, with 963 tests
  passing. Much of the growth since part 6 is safety and correctness code
  that reviews and the validation asked for.
- The owner said on 2026-10-02 that "lightweight" means the process: the
  overhead and the requirements the method puts on people, the owner and the
  agents. It does not mean lines of code. A line ceiling measures the wrong
  thing, and near it would force cuts that weigh code size over correctness.
- The version floor was set in part 10: Node 24 or newer (`package.json`
  engines) and git 2.31 or newer (the README); "concluded on main" needs
  git's first-parent diffs of merges (PR #79).

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
- It is written in Node ESM with zero runtime dependencies, needing only Node
  24 or newer and git 2.31 or newer, and it is tested with `node --test`.
- It has 7 commands, a CLI and one skill, and no MCP server.
- There is no ceiling on lines of code. Lightness is judged by the process
  overhead the method puts on people: the records written and read, the
  commands run, the skill read, and the owner's round trips (R11, [TL-4]),
  measured on real work.

## Alternatives considered

- **Keep the 3,500-line ceiling** (ADR 0012). With about 100 lines left, the
  next feature would force a cut or another raise. Not chosen: the owner
  ruled that lines of code are not what "lightweight" means.
- **Keep the 2,000-line budget, and trim and cut** (ADR 0009, already
  turned down in ADR 0012). Not chosen: it would mean leaving out promises
  that serve the signed requirements.
- **Trim to stay under a ceiling.** Not chosen, for the same reason, and
  because the recent growth is correctness and safety code.
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
  - correctness and safety fixes are not traded against a line count;
  - what is measured, the process overhead on people, is what the owner
    means by lightweight.
- Bad:
  - rough links stay lexical and history-based, never semantic;
  - some parsing (Markdown sections, JUnit) is written by hand;
  - nothing caps the code's growth. Review and the "keep it simple" rule are
    the only checks on it.
- Revisit if:
  - a real need for semantic linking appears. Then it goes in a skill, not the
    script. Confidence: high (carried over from ADRs 0009 and 0012).
  - the process overhead measured on real work (D7 of assuredloop-v1) passes
    about a fifth at typical sizes. Then cut process, not code. Confidence:
    medium; only estimates exist so far.
- Checked by: no runtime dependencies (`test/deps.test.js`); C7 (offline);
  the formality measured on real work ([TL-4]).

## History

- 2026-09-27, [ADR 0009](0009-a-deterministic-script-node-zero-dependencies.md):
  a deterministic script, Node ESM, no runtime dependencies, 7 commands, one
  skill, no MCP server, and under 2,000 lines as the target.
- 2026-09-28, [ADR 0012](0012-a-deterministic-script-under-3500-lines.md):
  the same, with the ceiling raised to 3,500 lines by the owner after part 6
  measured 2,115. Replaced because the owner ruled on 2026-10-02 that
  "lightweight" means the process overhead on people, not lines of code, and
  that the code budget can go.
