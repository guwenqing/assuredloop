# Deleting a paragraph of a change spec
Tier: 2 · Status: open

## Owner's words and dialog

- 2026-10-16 the owner's words, snapshot origin/2026-10-16-owner-words.md
- 2026-10-16 the owner's words, snapshot
  origin/2026-10-16-github-com-guwenqing-assuredloop-issues-230.md: issue
  #230, filed by the owner.
- 2026-10-16 the owner's words, snapshot
  origin/2026-10-16-github-com-guwenqing-assuredloop-issues-229-issuec.md:
  the owner's comment on issue #229 about `removes:`, the same problem.
- The dialog in brief: DES-22 makes a lost ID a marker lint, and `--strict`
  fails on it, in every scope. So a change spec cannot delete its own
  paragraphs, and `removes:` counts only for `specs/`. The architect wrote
  R1 and asked the owner to sign it.

## Organized requirement

<!-- R1 from:2026-10-16-github-com-guwenqing-assuredloop-issues-230.md -->

### R1 Deleting a paragraph of a change spec
In an open request's change spec, deleting a paragraph is ordinary editing: `al check --strict` does not fail on it. An ID is still never used again. In `specs/`, a removal still needs `removes:`.

## Decisions

- D1, 2026-10-16. Source: the agent (architect), message to developer, 2026-10-16. In the scope of an open request (its change spec), a lost ID is a hint, not a not ok, also under --strict. The hint names the deletion, and says that nothing more is needed when the deletion is on purpose.
- D2, 2026-10-16. Source: the agent (architect), message to developer, 2026-10-16. In specs/, nothing changes: a lost ID with no removes: stays not ok.
- D3, 2026-10-16. Source: the agent (architect), message to developer, 2026-10-16. These stay not ok in every scope: an ID used again, a paragraph with no ID (this still catches a marker that an agent removed by accident while the text stayed), and a link to an ID that does not exist.
- D4, 2026-10-16. Source: the agent (architect), message to developer, 2026-10-16. No new hint for a record entry that names a deleted change-spec ID. When a disposition (incorporated, removed, superseded) or a wording decision of the request names the deleted ID, the same lost-ID hint says so in its text, for example '<name>/SP-3 is deleted; its disposition says incorporated as INV-2'. Bindings, and the audit's 'source not found', stay as they are.
- D5, 2026-10-16. Source: the agent (architect), message to developer, 2026-10-16. The skill and the README say that a paragraph of a change spec may be deleted, that its ID is retired and never used again, and that plan, step and migration paragraphs may live in the tracker issue named by the task's ref instead of in the change spec (#229, point 3).
