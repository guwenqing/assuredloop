# adr-edits
Tier: 1 · Status: open

## Owner's words and dialog

- 2026-10-19 the owner's words, snapshot origin/2026-10-19-owner-words.md

## Organized requirement

<!-- R1 from:2026-10-19-owner-words.md -->

### R1 Hidden text in an ADR's marker line
When someone changes the marker line of an accepted or replaced ADR in any way other than adding links, `al check` MUST give a hint. A marker line that holds anything other than links MUST also get a hint.

<!-- R2 from:2026-10-19-owner-words.md -->

### R2 An ADR without a clear status
When the first line of an ADR is not a status that `al` knows (proposed, accepted, or replaced by other ADRs), `al check` MUST give a hint.

Out: these cases give a hint and never block.
