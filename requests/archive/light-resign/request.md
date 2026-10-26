# New versions of signed requirements for the light design
Tier: 1 · Status: concluded

## Owner's words and dialog

- 2026-10-26 the owner's words, snapshot origin/2026-10-26-owner-words.md

## Organized requirement

<!-- R1 from:2026-10-26-owner-words.md replaces:context-all/R1 -->

### R1 Grouped by default, everything on request
Each of `al`'s answers MAY group repeated output, for example IDs by state, but MUST NOT leave out a line. On request, an answer MUST show everything in full: each item on its own line with its state and its requirement, each decision with its text, and every hint. A reader MUST be able to find the available evidence for each fact that an answer reports. An answer MUST keep apart project evidence, facts held only in `al`'s records, inferences and unknowns.

Amends: [VW-2], [VW-6]

Out: the full trace of a request (v4/R9), which is unchanged.

<!-- R5 from:2026-10-26-owner-words.md replaces:assuredloop-v4/R5 -->

### R5 Consolidation by judgement, and closing
The agent MUST bring each piece of a change into the consolidated spec by its own judgement, with no tool command, at any time before the change closes, part by part for an epic, as long as it does not deviate. It MAY rewrite, split or join paragraphs, so that the spec reads as the current system. The tool MUST NOT require the consolidated text to match the change's text. The review judges the consolidation. The tool MUST show a judgement of the consolidation again when the text that it judged changes. Concluding MUST require every promise change to be covered by a requirement that the owner signed. No recorded reason replaces this. Concluding MUST require every signed requirement of the change to be served in the consolidated spec or by an accepted decision, or else a recorded account of where it is met, such as a design that is reused or a one-time task. Concluding MUST require every spec paragraph that the change set out to change or remove to be changed or removed, or else a recorded reason why it was not. A review judgement MUST NOT waive any of these. A spike needs no consolidation. Nothing applied may be dropped silently.
Signed off: 2026-10-26 owner, origin/2026-10-26-signoff.md

## Outcome

Concluded 2026-10-26 with al conclude, on the working tree at c2dc30a.

- R1 Grouped by default, everything on request, version 1, signed in S1:
  - DES-125 interface: in specs/design.md, serves it
- R5 Consolidation by judgement, and closing, version 1, signed in S1:
  - DES-29 rule: in specs/design.md, serves it
  - DES-34 rule: in specs/design.md, serves it
  - DES-37 rule: in specs/design.md, serves it
  - DES-38 rule: in specs/design.md, serves it
  - DES-39 definition: in specs/design.md, serves it
  - SCH-15 rule: in specs/schema.md, serves it
- Not known: whether the code, tests and documents do what the paragraphs say; whether the work has ended: the tool does not take a merged task or a reconciled spec as evidence of that.
