Source: https://github.com/guwenqing/assuredloop/issues/230
Fetched: 2026-10-16T18:42Z
SHA-256: 865be3272dcb18ac5c448c1ec49350af9e303749e1203c58855ad9b998eec044
---
# Deleting paragraphs in a change spec fails --strict with lost-id; removes: only works in specs/

## Summary

In 0.2.2, a change spec (a request's `spec.md`) cannot delete its own paragraphs without `al check --strict` failing. `removes:` silences `lost-id` only for the `specs/` scope. So a team that rewrites its design spec, which is normal during a trial, gets a red check for every deleted paragraph, and has no supported way to say "this deletion is intended".

The tool should help the team keep the spec correct and well written. Today it pushes the other way: it makes keeping old, wrong or log-like paragraphs cheaper than deleting them.

## What we did

1. A request's `spec.md` grew over some weeks into a log: notes added below paragraphs, history and quotes kept, because removing a paragraph's ID looked forbidden.
2. We decided to rewrite it in full as a plain design document: new structure, old paragraphs deleted, then new IDs with `al spec --add-ids`.
3. `al check --strict` on the rewrite PR gives `not ok lost-id` for every deleted paragraph ID.

## Where it comes from (0.2.2 source)

- `src/v4/ids.js` `idLints`: `lost-id` fires for an ID in the merge-base that is gone from the branch and not in `removes`.
- `src/v4/check.js`: `removes: scope === SPEC ? removes : []`, so `removes:` is ignored for the request scope.
- `src/v4/scope.js` `idsEverUsed` reads `git log`, so after the merge a deleted ID is gone and only reuse is caught (`used-again`). The block is therefore only in the deleting PR, but under `--strict` that PR is red.

## What we expect

Deleting a paragraph is ordinary editing, in a change spec most of all, since a change spec is a working document until it is concluded. Any one of these would do:

- `lost-id` is advisory (a hint) for paragraphs in the request scope; or
- `removes:` in a change spec also counts for that change spec's own paragraphs; or
- an explicit "rewrite" mode: the PR declares that the request's spec is replaced, and its old IDs are retired (still never reused).

The rule that an ID is never reused should stay.

## Also worth saying in the docs

The skill text and the docs led us (and our agents) to believe that a paragraph ID can never disappear. That belief made the specs worse. A short statement that deleting paragraphs is allowed, and how to do it cleanly, would prevent this.

Related: #229 (adoption findings on 0.2.2).

