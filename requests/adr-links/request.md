# Trace links on ADRs
Tier: 2 · Status: open

## Owner's words and dialog

- 2026-10-16 the owner's words, snapshot origin/2026-10-16-owner-words.md:
  issue #234 on GitHub, its title and body as the owner filed them.
- The dialog in brief: the owner filed issue #234. An accepted ADR cannot
  get its `source:` and `decides:` links later, because a change to its
  marker is `not ok adr-changed`. No check asks a proposed or accepted ADR
  for these links. SCH-22 says that an accepted ADR's text does not change,
  and DES-22 lists what the script checks, so this is a promise change. The
  architect wrote R1 and asked the owner to sign it.

## Organized requirement

<!-- R1 from:2026-10-16-owner-words.md -->

### R1 Trace links on ADRs
Links may be added to the marker of an accepted ADR when nothing else changes: the same ID and kind, the old links kept, the text below unchanged. Any other change to an accepted ADR, except its status line, stays `not ok`. A proposed or accepted ADR with no `source:` or no `decides:` gets a hint, and under `--strict` a `not ok`. The review view marks each ADR it names that has no `source:`.

Out: design paragraphs with no source. In this model a design paragraph has
no `source:` link. Its authority is the signed requirement that it serves.

## Decisions

- D1, 2026-10-16. Source: the agent (architect), session prompt of developer, 2026-10-16. "Nothing else changes" means: the same ID and kind, every old link still there with the same target, only new links added, and the text below the marker unchanged as `adrBody` compares it today. A changed or removed link stays `adr-changed`.
- D2, 2026-10-16. Source: the agent (architect), session prompt of developer, 2026-10-16. A superseded ADR gets no missing-link hint: it is history.
- D3, 2026-10-16. Source: the agent (architect), session prompt of developer, 2026-10-16. No config setting. The missing-link finding follows the existing pattern for a paragraph with no link: a hint by default, `not ok` under `--strict`.
- D4, 2026-10-16. Source: the agent (architect), session prompt of developer, 2026-10-16. The review view is the one `al context --for review` gives. Where it names an ADR (for example "check that ADR-3 still holds"), it says that the ADR has no `source:` when that is so. Nothing else is added to it.
- D5, 2026-10-16. Source: the agent (architect), session prompt of developer, 2026-10-16. Design paragraphs are out: in this model a design paragraph has no `source:` link, and its authority is the signed requirement it serves. Write that as an Out: line in the request.
- D6, 2026-10-16. Source: the agent (architect), session prompt of developer, 2026-10-16. Docs: the README and the skill say that links can be added to an accepted ADR, and that `--strict` asks each proposed or accepted ADR for `source:` and `decides:`. Release notes will say that a project with ADRs that lack them fails `--strict` until it adds them.
- D7, 2026-10-16. Source: the agent (architect), session prompt of developer, 2026-10-16. In the PR body, say what SCH-22, DES-22 and any other changed paragraph said before and after.
