# several-successors
Tier: 1 · Status: open

## Owner's words and dialog

- 2026-10-19 the owner's words, snapshot origin/2026-10-19-owner-words.md

## Organized requirement

<!-- R1 from:2026-10-19-owner-words.md -->

### R1 An ADR that several ADRs supersede
The status line of a superseded ADR MAY name more than one ADR that supersedes it, for example `Status: superseded by ADR-11, ADR-12`. Each ADR that it names MUST exist, and its marker MUST have `supersedes:` for the superseded ADR. A current place that names the superseded ADR MUST also name at least one ADR that supersedes it, directly or through a chain.

Out: other forms of the status line, and an ADR with no status line (#4).
