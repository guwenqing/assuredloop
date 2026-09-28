## [REC-1] The request folder
Each request MUST live in its own folder, `requests/<name>/`. The name is the
request's permanent ID: it MUST never change and MUST never be reused. The
folder holds `request.md`, `origin/`, and, as the tier needs, `change.md` or
`findings.md`. When a request concludes or is dropped, its folder MUST move to
`requests/archive/<name>/` under the same name, and MUST NOT be edited after
that change reaches main.

## [REC-2] The owner's words and dialog
`request.md` MUST open with a section "Owner's words and dialog". It holds the
owner's words and the questions and answers that clarified them, as dated
entries. It is append-only: an entry is never edited or removed, and a
correction is a new entry. Long material lives in `origin/` and is referenced
from an entry.

## [REC-3] Snapshots of originals
Every original that a request relies on, whether a link, a chat or a document,
MUST be kept as a snapshot in `origin/`. A snapshot starts with a header:
`Source:` (where it came from), `Fetched:` (when), `Target updated:` (the
source's own last-updated time, when the source gives one) and `SHA-256:` (of
the text after the header). The text then follows exactly as fetched. The tool
MUST NOT fetch anything itself: the agent fetches, and the tool stores,
hashes, and later verifies a re-fetch. When a re-fetch differs, a new snapshot
MUST be appended; the old one stays.

## [REC-4] The organized requirement
After the owner's words, `request.md` MUST hold an "Organized requirement". It
is one written-up statement of what is wanted, not a line-by-line translation.
It holds one or more requirements as sub-sections (R1, R2…) using RFC 2119
keywords, an `Out:` line for what is excluded, and an `Assumed:` list for what
the AI added that the owner did not say. A spike holds an "Organized question"
instead, in plain words: what we want to find out, what a useful answer looks
like, and what is out. Requirements that must be signed or finished
separately SHOULD be separate requests.

## [REC-5] The owner's sign-off
The owner MUST sign off the whole organized section (requirement or question)
of every request except a tier-0 fix. The spec text is not signed. A sign-off
MUST be recorded as a file in `origin/` holding the owner's words (or where
they said it), then a line `--- signed text ---`, then the exact organized
section as signed, and its SHA-256. `request.md` MUST point to it with a
`Signed off:` line. The latest sign-off counts. A child request that copies
some of the parent's signed requirements word for word inherits the parent's
latest sign-off for them.

## [REC-6] The blocked state
A request is **blocked** while its organized section has no sign-off, or
differs from the text last signed off. Work MAY be drafted while it is
blocked, but MUST be delivered with the sign-off or after it. While a request
is blocked: `consolidate` and `conclude` MUST refuse for it, except
`consolidate --revert` and `conclude --dropped` when every section retains
nothing ([STA-3]); `context` MUST show the blocked state first; and `check`
MUST report `not ok` for a branch whose final state delivers spec work or
other work for the request while it is still blocked in that state. A branch
that brings the sign-off with the work is not blocked. `record signoff` MUST
show only what changed since the last sign-off.

## [REC-7] Decisions
Decisions made after the request MUST be recorded in `request.md` as numbered,
dated, append-only entries (D1, D2…), each with its source: the owner, a
review, or the agent. A decision MAY supersede an earlier one, cite the
section IDs it concerns, or point to the ADR it produced. The kinds (scope,
approved change, implementation-only, rejected) are a writing convention; no
check depends on them.

## [REC-8] Parts
A request MAY list its parts as free text. A part MAY name a child request,
whose state is then shown on the parent as a hint. The tool MUST NOT claim a
part is done from the commits it finds; completion is only what someone
reported.
