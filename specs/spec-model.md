## [SPC-1] The baseline
The baseline is the consolidated current spec on main: plain Markdown, split
by area, under a root that is `specs/` by default and MAY be set by one line
in `.assuredloop` (`root: <path>`). It holds promises in the present tense,
never history. In a non-code project the promises are about the deliverable,
and the documents themselves are the "code". The baseline starts empty and
grows request by request.

## [SPC-2] Sections and IDs
A section is one ATX heading (`#`) and the text up to the next heading of
any level. Its ID is the bracketed token at the start of the heading, matching
`[A-Z][A-Z0-9]*-\d+(\.\d+)*`, for example `## [INV-3] Dates`. IDs are unique
within a root; with several roots, references are `(root, ID)`. Only a section
with an ID can be held by a change. `spec --add-ids <file>` numbers the headings
that have none.

## [SPC-3] Allocating IDs
The next ID for a prefix MUST be one more than the highest found in the root's
git history and in the open `change.md` files. An ID MUST never be reused. A
duplicate ID anywhere in the root is `not ok`, and blocks every `consolidate`
write until it is fixed.

## [SPC-4] Comparing sections
Sections MUST be compared as exact text, after normalizing only: line endings;
trailing spaces and tabs on each line; blank lines at the start and end of the
section and between its heading and body; and the number of `#` in the
heading. Code blocks, indentation and list structure MUST be compared exactly.
Scope inherited from a parent heading is outside the comparison.
