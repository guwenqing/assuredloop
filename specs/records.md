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
