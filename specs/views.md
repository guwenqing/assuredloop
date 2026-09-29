## [VW-1] Where the project stands
`al context` with no name MUST list the open requests, one line each with its
state, blocked ones first. On a repo with no baseline it MUST say so, and that
requests add sections as they go.

## [VW-2] Where a request stands
`al context <name>` MUST print twelve lines or fewer: the request's title,
tier and state; its owner's words and snapshots, with whether each was
re-checked; its sign-off state, and which requirements changed since, if any;
the decisions, newest first, with agent rulings marked; each held section
with its state and its requirement, or, when they do not fit on one line,
every held section grouped by state; the parts; other changes holding
sections in the same file; at most three hints; then a Next line (the command
to run) and a Not known line (what could not be checked). It MAY group
repeated output, but MUST NOT leave out a section. `al context <name> --all`
MUST show everything in full, beyond twelve lines if need be: each held
section on its own line with its state and its requirement, each decision
with its text, and every hint.

## [VW-3] Everything about one section
`al context <ID>` MUST show the section's text, the open changes holding it,
the requests that shaped it (from blame), the decisions and ADRs citing it,
and the linked code and tests with the reason for each link.

## [VW-4] A branch, and the review view
`al context --diff <range>` MUST show the requests a branch serves, the
sections it changes with their states, nearby sections, linked tests, related
history (requests citing the same IDs, rejected ones first) and hints.
`--for review` MUST split this into an **intent** view (the signed
requirement verbatim, the spec changes, the decisions, the tier claim) and an
**evidence** view (each requirement with the evidence found or none, changed
files linked to no request, linked tests, test results with their provenance,
and hints).

## [VW-5] The design now
`al spec [--list]` MUST show the design as it stands: the section map first,
then the text, with each open change's "now" and state under the section it
holds. A partial baseline MUST say which areas it covers.

## [VW-6] Archived requests
An archived request MUST show each of its sections "as at conclusion", or
what has changed it since (from blame), grouped by what it says with none left
out, and one per line with `--all`; and it MUST list the later requests that
follow it.

## [VW-7] Audit on demand
`--audit`, on a request, a section ID or `path:line`, MUST return the whole
trace with nothing capped: the owner's words and every snapshot, with each
SHA-256 re-checked; every sign-off, with its text re-checked; every decision;
every version of `request.md` and `change.md` that reached main; when each
section was consolidated; the linked commits and tests; the ADRs; and the
Outcome. From a code line it MUST walk from blame, to the request, to the
signed requirement, the decisions and the change.

## [VW-8] History at any commit
Every read command MUST take `--at <commit>`, and evaluate the baseline, the
requests, their states and the links as they were at that commit, reading
that commit's tree through git.

## [VW-9] Every output says what it read and what is next
Every output MUST name the refs it read (working tree, `origin/main` and the
latest time git recorded for it, or local main when there is no remote). It
reports times as timestamps, never as ages. It MUST end with a Next line and
a Not known line. A shallow or single-branch clone that lacks history MUST
say "history unavailable", never "nothing found".
