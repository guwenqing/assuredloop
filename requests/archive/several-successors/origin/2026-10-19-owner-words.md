Source: standard input
Fetched: 2026-10-19T18:20Z
SHA-256: bee3985871fc76e1038695ca3c5ee7d7bc3634e17632f0c71d42a2373327d6e6
---
## Summary

A record that several ADRs supersede cannot say so in its status line. `superseded-status` (0.3.0, #238) reads only `Status: superseded by ADR-<n>` followed by the end of the line, so `Status: superseded by ADR-11, ADR-12` gives `not ok superseded-status ... its status line does not say by which ADR`.

## Where it happens

In a spec repository that uses AssuredLoop, ADR 0002 was split: ADR 0011 replaced how a run waits, and ADR 0012 replaced the human channel. Both markers hold `supersedes:ADR-2`. The status line said `superseded by ADR-11, ADR-12`, which is correct, and `al check --strict` 0.4.1 fails on it.

## What we expect

- `Status: superseded by ADR-11, ADR-12` (and `ADR-11 and ADR-12`) is read as superseded by each listed ADR. Each listed ADR must exist, and its marker must hold `supersedes:` for the record, as for one ADR today.
- The chain walk for `superseded-cited` follows every listed successor: a current place that names the record names at least one record that supersedes it, directly or through a chain.

## Workaround until then

The status line names the first successor, and the record's text names all of them. The repository's rules say so, and point to this issue.




---

Moved from the old repository on 2026-10-19. There it was number 249, opened by guwenqing on 2026-10-19. A number such as #239 in this text names an item of the old repository.

