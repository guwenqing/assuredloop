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

## [TL-4] The formality budget
The formality budget is the overhead the method puts on people. The agents'
extra work (records written, commands run, output and skill read) SHOULD stay
at or below about a fifth of the change (the lines changed plus the lines read
to make them) at typical sizes. It MUST be measured on real work, with the
owner's round trips reported beside it. The skill MUST open with a quick path
of fifteen lines or fewer for tiers 0 and 1.

## [TL-5] Beyond code
The records, states, links and hints SHOULD work on a repo of documents alone.
There, "tests" are named checks of a kind (a deterministic check, a
checklist, or a review), and results are the files those checks write.
