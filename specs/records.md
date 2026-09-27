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
