# removed-links
Tier: 1 · Status: concluded

## Owner's words and dialog

- 2026-10-19 the owner's words, snapshot origin/2026-10-19-owner-words.md

## Organized requirement

<!-- R1 from:2026-10-19-owner-words.md -->

### R1 Records of removed links
When no current marker declares a link any more, `al index` MUST remove its recorded binding and MUST say so in its output. A link that a marker still declares keeps its binding.

<!-- R2 from:2026-10-19-owner-words.md -->

### R2 A changed paragraph that holds a link
When a paragraph's text changed after one of its links was bound, `al check` MUST give a hint until the link is aligned.

Out: blocks for these cases; each one is a hint or a line of output.
Signed off: 2026-10-19 owner, origin/2026-10-19-signoff.md

## Outcome

Concluded 2026-10-19 with al conclude, on the working tree at 4c987ff.

- R1 Records of removed links, version 1, signed in S1:
  - DES-26 rule: in specs/design.md, serves it
  - DES-38 rule: in specs/design.md, serves it
- R2 A changed paragraph that holds a link, version 1, signed in S1:
  - DES-26 rule: in specs/design.md, serves it
- Not known: whether the code, tests and documents do what the paragraphs say; whether the work has ended: the tool does not take a merged task or a reconciled spec as evidence of that.
