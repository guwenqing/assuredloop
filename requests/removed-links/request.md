# removed-links
Tier: 1 · Status: open

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
