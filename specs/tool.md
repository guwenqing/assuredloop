## [TL-1] Commands
The tool MUST offer seven commands: `new`, `context`, `spec`, `check`,
`record`, `consolidate` and `conclude`. `new` MUST accept the owner's words
from a file or standard input. `record <name>
decision|signoff|part|section|origin` MUST write only its own part of a
record. Every command that changes files, except `new`, MUST show what it
would write, and write only when given `--yes`. `record section <ID> [--builds-on
<request>]` MUST copy "was" from the baseline, or pin the named request's
latest version. `record origin --url <u> --from -` MUST store a snapshot with
its hash, and `--verify <file> --from -` MUST check a re-fetch.

## [TL-2] Deterministic and plain
The tool MUST make no network calls, no AI calls, and keep no database or
cache that holds unique truth. It is Node ESM with no runtime dependencies
beyond Node and git, tested with `node --test`. The same inputs (the
repository, its refs and their recorded times, the working tree, and the
command line) MUST give the same output. It MUST NOT read the clock, except
to stamp what it writes.

## [TL-3] What is enforced, and by whom
The tool's documentation MUST include a short table of what the tool checks,
what its skill asks of the agent, and what the owner decides, so no reader
takes a hint for a guarantee. The way of working (tests-first, review, the PR
flow) belongs to the bots and is out of this table.
