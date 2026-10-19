Source: standard input
Fetched: 2026-10-19T18:22Z
SHA-256: 34667dc3b698e0fcf156c66770b87234c2ec5d8550b7a68caa83fc698e7624ab
---
## Summary

Two kinds of ADR edits give no finding in 0.4.1, although each changes what an ADR says or whether it counts as current. Both should be hints.

## 1. Text added inside an ADR's marker line

Append a token such as

```text
extra:-->The&#32;job&#32;reads&#32;all&#32;secrets.<!--
```

before the closing `-->` of an accepted ADR's heading marker, keeping every existing link. An HTML renderer now shows `The job reads all secrets.` as visible text. `al check --strict` gives exactly the findings it gave before: no `adr-changed`, no marker lint.

The changed-ADR comparison removes the whole marker line and compares only the kind and the existing links, so text added inside the marker is not a change. The parser sees the unknown token but drops it from the link arrays, and its lint is not carried into the check output. A trailing comma in an existing `source:` value (an empty list item) also gives no finding.

Expected:
- A marker line that holds more than one `<!--` or `-->`, an unknown token, or an empty list item gives a hint.
- The links-only exemption applies only when the marker changes by added links and nothing else; any other change to the marker line gives `adr-changed`.

## 2. An ADR without a recognized Status line

Remove an accepted ADR's first line `Status: accepted`, or change it to `Status: draft`, or move it below the marker. `al check --strict` gives exactly the findings it gave before.

The status is read as null or unknown, so the trace-link check and the current-citation check skip the record, and the changed-ADR comparison strips the old Status line, so the edit itself gives no `adr-changed` either. The record silently stops counting as a current ADR.

Expected: every ADR file whose first line is not `Status: proposed`, `accepted` or `superseded by ADR-<n>` gives a hint, and a change of the Status line is a change of the ADR.

## Context

A spec repository that moved to 0.4.1 removed its own local checks for both, because 0.4.1 covers the rest of what they did. It reports these gaps here instead of keeping local copies.



---

Moved from the old repository on 2026-10-19. There it was number 252, opened by guwenqing on 2026-10-19. A number such as #239 in this text names an item of the old repository.

