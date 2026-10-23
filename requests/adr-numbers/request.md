# ADR file numbers
Tier: 1 · Status: open

## Owner's words and dialog

- 2026-10-23 the owner's words, snapshot origin/2026-10-23-owner-words.md

## Organized requirement

<!-- R1 from:2026-10-23-owner-words.md -->

### R1 ADR file numbers
`al` MUST read a Markdown file in the ADR folder as an ADR when its name starts with one or more digits and a dash. Its number is the value of those digits. Two ADR files with the same number MUST give a hint. When the ADR folder holds Markdown files and `al` reads none of them as an ADR, `al check` MUST say so once.

Out: ADR files outside the ADR folder, and other names for the ADR folder.
Signed off: 2026-10-23 owner, origin/2026-10-23-signoff.md
