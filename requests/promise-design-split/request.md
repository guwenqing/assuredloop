# Promises hold no design detail
Tier: 2 · Status: open

## Owner's words and dialog

- 2026-10-11 the owner's words, snapshot origin/2026-10-11-owner-words.md:
  owner chat with the architect, 2026-10-11 (input 166), transcribed by the
  architect.
- 2026-10-11 the owner's words, snapshot
  origin/2026-10-11-owner-chat-with-the-architect-2026-10-11-input-167.md:
  owner chat with the architect, 2026-10-11 (input 167).
- The dialog in brief: the owner signed level2-peer R1, and then asked why a
  packaging change needed a sign-off. The cause: DES-65, a rule paragraph,
  also held where level 2 lives and how it is installed, which is design.
  Issue #214 asks to find the same mistake across `specs/` and to split each
  case in one request. The owner approved issue #214 as the architect
  explained it in chat, before the R1 text was written; the architect showed
  R1 in its next reply. The list of splits is on issue #214.

## Organized requirement

<!-- R1 from:2026-10-11-owner-words.md -->

### R1 Promises hold no design detail
A promise paragraph in `specs/` MUST hold only what the tool promises. Design detail in it, such as a library, a file, a package or an algorithm, MUST move into a paragraph of a design kind. Each promise MUST keep its meaning.
Signed off: 2026-10-11 owner, origin/2026-10-11-signoff.md

## Decisions

- D1, 2026-10-11. Source: the agent (architect), message to developer-214, 2026-10-11. Three splits need a small wording change, and they keep the meaning: in DES-65's level 1 item the colon becomes a full stop; in DES-65's table, 'into a SQLite FTS5 (BM25) index' becomes 'into an index'; in DES-69, 'It shows' becomes '`al` shows'. ', preferably on Google Cloud' stays in DES-65's level 3 cell, because those are the owner's words in the signed assuredloop-v4/R10. The rest of the list on issue #214, and the four paragraphs kept as they are, hold.
