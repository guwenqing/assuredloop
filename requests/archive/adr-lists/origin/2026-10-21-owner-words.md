Source: standard input
Fetched: 2026-10-21T20:29Z
SHA-256: 8466fae9bb804193a2167f1b39a11e6d1565b46f0dda27a5df6331584bc3b8bd
---
## Problem

`superseded-cited` finds a citation of a superseded record in the forms `ADR-40` and `ADR 0040`, but not in a list such as `Design (ADRs 0003, 0005, 0008, 0017, 0040):`. A spec paragraph with that list kept naming a superseded record as current, and `al check` gave no finding; a reviewer found it.

## Request

Read the plural and list forms too: `ADRs 0003, 0005 and 0040`, `ADRs 0003 to 0005` where a range covers a superseded record, and the same with `ADR-` IDs. Apply the same rule as for a single citation: the superseding record must be named in the same paragraph.

---
Ok to both. Assuming you mean that ecen if a change related to adr change is merged and next pr doesn’t change this can also show the precious warning
