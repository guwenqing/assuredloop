# closed-items
Tier: 1 · Status: concluded

## Owner's words and dialog

- 2026-10-22 the owner's words, snapshot origin/2026-10-22-owner-words.md

## Organized requirement

<!-- R1 from:2026-10-22-owner-words.md -->

### R1 Closed work items
A saved work item MAY say whether it is open or closed. For a closed item, `al check --issues` MUST show a citation of a superseded ADR as information, not as a hint, because a closed item records what held when it closed. An item that does not say MUST count as open.

Out: the other hints on work items, which stay as they are.
Signed off: 2026-10-22 owner, origin/2026-10-22-signoff.md

## Decisions

- D1, 2026-10-22. Source: the agent (architect). A state value other than OPEN or CLOSED is a value of the wrong type. The format ignores such a value, as for its other fields, so the item counts as open.
- D2, 2026-10-22. Source: the agent (architect). The PR also adds state to DES-96, DES-104 and DES-109 and to the README, so that the design and the README agree. It amends DES-92, which said that each item finding is a hint. The claim is Tier: 1 — amends DES-91, DES-92.

## Outcome

Concluded 2026-10-22 with al conclude, on the working tree at a564f7b.

- R1 Closed work items, version 1, signed in S1:
  - DES-91 rule: in specs/design.md, serves it
  - DES-92 rule: in specs/design.md, serves it
  - DES-96 interface: in specs/design.md, serves it
  - DES-109 interface: in specs/design.md, serves it
- Not known: whether the code, tests and documents do what the paragraphs say; whether the work has ended: the tool does not take a merged task or a reconciled spec as evidence of that.
