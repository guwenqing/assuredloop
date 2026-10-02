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
The next ID for a prefix MUST be one more than the highest found in the root
and in every `change.md`, open or archived, as they are now and anywhere in
the git history. An ID MUST never be reused. A
duplicate ID anywhere in the root is `not ok`, and blocks every `consolidate`
write until it is fixed.

## [SPC-4] Comparing sections
Sections MUST be compared as exact text, after normalizing only: line endings;
trailing spaces and tabs on each line; blank lines at the start and end of the
section and between its heading and body; and the number of `#` in the
heading. Code blocks, indentation and list structure MUST be compared exactly.
Scope inherited from a parent heading is outside the comparison.

## [SPC-5] The change spec
`change.md` holds the change's why and design as prose, then `## Spec changes`
with one block per version of a held section. A block's heading is `### [ID]@<n> <op>`,
where `<n>` counts that section's versions within this request, and `<op>` is
`modify`, `add in <path>` (at the end of that file, which is created if
needed), `add after [ID]`, `remove, was after [ID]`, or `remove, was first in
<path>` (for the first section of a file). Its text is `Was:` and
`Now:`, each an indented or fenced block holding exactly one heading: an add
has no `Was:`, a remove has no `Now:`, and a modify has both. Markers
after the op: `builds on <request>/<ID>@<n>` (or `builds on @<n>` within the
request), `Dropped <date> (Dn)`, `Kept <date> (Dn)`, `Revised <date> (Dn)`,
and optionally `for R<n>`.
