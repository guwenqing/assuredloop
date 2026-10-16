# Design links and task references
Tier: 2 · Status: open

## Owner's words and dialog

- 2026-10-16 the owner's words, snapshot origin/2026-10-16-owner-words.md:
  issue #229 on GitHub, its title and body as the owner filed them.
- The dialog in brief: the owner filed issue #229, adoption findings on
  0.2.2 from a private adopter. Points 1 and 4 are docs only (PR #231).
  Point 2 asks for a hint on a design paragraph that keeps no promise
  paragraph, and for `al context <ID>` to list the paragraphs that build on
  it. Point 3 asks for a hint on a `for:` that names no task. DES-16 and
  DES-22 say what links mean and what the script checks, so this is a
  promise change. The architect wrote R1 and asked the owner to sign it.

## Organized requirement

<!-- R1 from:2026-10-16-owner-words.md -->

### R1 Hints for design links and task references
`al` points out a design paragraph in a change spec that serves a requirement but links to none of that requirement's promise paragraphs in the same change spec, and a `for:` that names no task in the record. Each is a hint and never fails a check, `--strict` included. `al context <ID>` lists the paragraphs that build on, explain or illustrate it.

## Decisions

- D1, 2026-10-16. Source: the agent (architect), session prompt of developer-229, 2026-10-16. `builds-on` may name a promise paragraph of the same change spec. DES-16 changes to say so.
- D2, 2026-10-16. Source: the agent (architect), session prompt of developer-229, 2026-10-16. The design-link hint applies to the design kinds and `approach` in a change spec. It fires only where the requirement the paragraph serves has promise paragraphs in the same change spec. A `builds-on` or `changes` link to any one of them is enough.
- D3, 2026-10-16. Source: the agent (architect), session prompt of developer-229, 2026-10-16. The `for:` hint fires when `for:<task>` names no task in the record's `tasks:`. A project with no `tasks:` at all gets no hint: tasks stay optional.
- D4, 2026-10-16. Source: the agent (architect), session prompt of developer-229, 2026-10-16. `al context <ID>` adds the paragraphs that build on, explain or illustrate the ID, in the style of its other lines.
- D5, 2026-10-16. Source: the agent (architect), session prompt of developer-229, 2026-10-16. In the PR body, say what each changed paragraph said before and after.
