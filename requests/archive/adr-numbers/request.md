# ADR file numbers
Tier: 1 · Status: concluded

## Owner's words and dialog

- 2026-10-23 the owner's words, snapshot origin/2026-10-23-owner-words.md

## Organized requirement

<!-- R1 from:2026-10-23-owner-words.md -->

### R1 ADR file numbers
`al` MUST read a Markdown file in the ADR folder as an ADR when its name starts with one or more digits and a dash. Its number is the value of those digits. Two ADR files with the same number MUST give a hint. When the ADR folder holds Markdown files and `al` reads none of them as an ADR, `al check` MUST say so once.

Out: ADR files outside the ADR folder, and other names for the ADR folder.
Signed off: 2026-10-23 owner, origin/2026-10-23-signoff.md

## Outcome

Concluded 2026-10-23 with al conclude, on the working tree at a80028f.

- R1 ADR file numbers, version 1, signed in S1:
  - DES-78 rule: in specs/design.md, serves it
  - DES-113 choice: in specs/design.md, serves it
  - SCH-7 data: in specs/schema.md, serves it
- Not known: whether the code, tests and documents do what the paragraphs say; whether the work has ended: the tool does not take a merged task or a reconciled spec as evidence of that.
