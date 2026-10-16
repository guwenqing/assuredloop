Source: standard input
Fetched: 2026-10-16T20:51Z
SHA-256: f8fb27a1fed44d5c8ac51029df21f5d3e3f389873873a529996fadfb7bdc7192
---
The owner's issue #234 on GitHub (https://github.com/guwenqing/assuredloop/issues/234), its title and body as the owner filed them, kept exactly:

# An accepted ADR cannot get its trace links later, and no check asks an ADR for them

## Summary

In 0.2.2, an accepted ADR cannot get its trace links later, and no check asks an ADR for its trace links. So a decision can be accepted with no link to the person who decided it and no link to the text it decides, and a review has nothing to check it against.

Two gaps:

1. **Links cannot be added to an accepted ADR.** `adrBody` in `src/v4/state.js` removes only the `Status:` line, so the marker line is part of the text. Adding `decides:` or `source:` to the marker of an accepted ADR gives `not ok adr-changed`. A team with ADRs from before it used AssuredLoop, or before it used these links, must either keep them without traces or supersede each one with a copy.
2. **Nothing reports an ADR with no `source:` or no `decides:`.** An accepted or proposed ADR with neither link passes `al check --strict`. `unresolved-link` checks only links that exist.

## What happened to us

Sapper/cicd-specs has 36 ADRs. ADRs 0032 to 0036 have `decides:` and `source:`. The 20 valid ADRs written before those links were used (0003 to 0028) have neither. One of them, ADR 0022, stated a design that the owner never decided: it extended "pause and wake" to a wait that the owner always wanted inside one call. Its reason was an estimate with no measurement behind it. Two reviews read the record and did not catch it, because the record had no source link that the review could check the claim against. We now replace that ADR, and we want to add the missing links to the other valid ADRs.

## What we expect

- Adding links to the marker of an accepted ADR is allowed when nothing else changes: the same ID and kind, the existing links unchanged, and the text below the marker unchanged. Changing or removing a link stays `adr-changed`.
- A lint for an accepted or proposed ADR with no `source:` (it says who decided) and with no `decides:` (it says which text the decision shapes). A hint by default; a config setting or `--strict` can make it `not ok`.
- The review view lists the ADRs and design paragraphs whose decision has no source, so that a reviewer can ask the owner about each one.

The rule that an accepted ADR's decision text never changes should stay.

## Workaround until then

Our repository check wraps `al check --strict`. It accepts `adr-changed` only when the base and head of an ADR differ only by links added to the marker, and it fails a valid ADR with no `source:` or `decides:`.

