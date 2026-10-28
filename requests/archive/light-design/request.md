# The light design: what is in force for a change, the evidence of review judgements, and a changed work item
Tier: 2 · Status: concluded

## Owner's words and dialog

- 2026-10-23 the owner's words, snapshot origin/2026-10-23-owner-words.md

## Organized requirement

<!-- R1 from:2026-10-23-owner-words.md -->

### R1 change-in-force
For a selected change, `al` MUST show the requirements and decisions in force that may govern the change. This MUST work when code and tests cite no IDs. `al` MUST show the basis and the limits of what it shows. It MUST run offline and use no model, and it MUST give the same result for the same change, project state and options.

<!-- R2 from:2026-10-23-owner-words.md -->

### R2 evidence-check
`al` MUST show each review judgement whose quoted evidence is missing, changed or stale. It MUST show a quote that it found apart from a judgement that the change complies. It MUST keep, for each judgement, the change and the versions that it judged. Review judgements MUST stay advisory: a judgement MUST NOT clear or hide a `not ok` or a refusal of `al conclude`.

<!-- R3 from:2026-10-23-owner-words.md -->

### R3 A work item that changed
When a task's work item says something different from what it said when the change first relied on it (at the sign-off, or when the request first named the item), `al check` MUST give a hint that names the item, until someone confirms that the change was read. When `al` cannot tell, it MUST say so, and MUST NOT report the item as unchanged. `al` MUST work this out by itself; no person and no AI writes or reads what it keeps for this.

Out: reading the item from a tracker; deciding whether the change matters, which the review decides.
Signed off: 2026-10-23 owner, origin/2026-10-23-signoff.md

## Decisions

- D1, 2026-10-25. Source: the agent (architect). An item's file scope is a files: token in its marker line, with globs joined by commas, and files:** for all files; the token is not text and no link, and the list shows an item whose scope the change edits (LD-26).
- D2, 2026-10-25. Source: the agent (architect). A design line may name <repo>:<path> of an output repo, read at its selected commit; a saved work item gives a design only when a task of the change's own request names it (LD-48).
- D3, 2026-10-25. Source: the agent (architect). Refines D2: in an output repo the list reads the central repo's items in force at its selected commit, shows the ones cited as central:<ID> and the all-files ones, names the rest, and does not match file scopes there; a saved item's design may also be a Design: line in its body; items in YAML or Markdown files are a later change (LD-25, LD-48).
- D4, 2026-10-26. Source: the agent (architect). A saved work item may be YAML with the fields of a JSON item, or Markdown: a header of Key: value lines (URL, Number, Repository, Ref, State, Parent), the body, then a section for each comment that starts with ## Comment <k>, with (minimized) for a hidden comment; every .md file of the folder is read as an item; the list items-out-of-reach: in the committed config names the items that the CI token cannot read, and al gives one info line for those that are not in the folder (LD-39, LD-48).
- D5, 2026-10-28. Source: the owner (owner chat with the architect, 2026-10-27). An MCP server for al is later work. The AI asks through the skill and the al commands.

## Outcome

Concluded 2026-10-28 with al conclude, on the working tree at a7a23e9.

- R1 change-in-force, version 1, signed in S1:
  - LD-7 approach: in the change spec, serves it
  - LD-10 approach: in the change spec, serves it
  - LD-24 data: in the change spec, serves it
  - LD-48 data: in the change spec, serves it
  - LD-42 data: in the change spec, serves it
  - LD-68 data: in the change spec, serves it
  - LD-25 flow: in the change spec, serves it
  - LD-43 flow: in the change spec, serves it
  - LD-26 data: in the change spec, serves it
  - LD-29 choice: in the change spec, serves it
  - DES-119 rule: in specs/design.md, serves it
  - DES-129 interface: in specs/design.md, serves it
  - DES-132 interface: in specs/design.md, serves it
  - DES-138 data: in specs/design.md, serves it
  - DES-139 data: in specs/design.md, serves it
  - DES-140 data: in specs/design.md, serves it
  - DES-141 data: in specs/design.md, serves it
  - DES-142 data: in specs/design.md, serves it
  - DES-143 flow: in specs/design.md, serves it
  - DES-144 flow: in specs/design.md, serves it
  - DES-145 flow: in specs/design.md, serves it
  - DES-147 flow: in specs/design.md, serves it
  - DES-148 data: in specs/design.md, serves it
  - DES-149 choice: in specs/design.md, serves it
- R2 evidence-check, version 1, signed in S1:
  - LD-27 data: in the change spec, serves it
  - LD-65 data: in the change spec, serves it
  - LD-44 data: in the change spec, serves it
  - LD-28 flow: in the change spec, serves it
  - LD-66 flow: in the change spec, serves it
  - DES-134 component: in specs/design.md, serves it
  - DES-150 data: in specs/design.md, serves it
  - DES-151 data: in specs/design.md, serves it
  - DES-152 data: in specs/design.md, serves it
  - DES-153 flow: in specs/design.md, serves it
  - DES-154 flow: in specs/design.md, serves it
  - DES-155 flow: in specs/design.md, serves it
  - DES-156 flow: in specs/design.md, serves it
- R3 A work item that changed, version 1, signed in S1:
  - LD-22 flow: in the change spec, serves it
  - DES-130 flow: in specs/design.md, serves it
- Change paragraphs named as not delivered:
  - LD-68: close line C1, current: No change of DES-119 is needed: DES-119 keeps the rule, and DES-129, which builds on it, holds the design that LD-68 adds.
  - LD-39: close line C2, current: No further change of DES-114, DES-115, DES-116, DES-117, DES-118 or SCH-40 is needed: they were written when the saved work items in YAML and Markdown and items-out-of-reach were built, and they say them now.
- Not known: whether the code, tests and documents do what the paragraphs say; whether the work has ended: the tool does not take a merged task or a reconciled spec as evidence of that.
