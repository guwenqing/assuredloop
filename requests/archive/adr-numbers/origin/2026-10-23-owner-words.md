Source: standard input
Fetched: 2026-10-23T22:00Z
SHA-256: 645f976ece73dc14e64a4cf4edd4215038a9bef9c6829cd1bde09ac8e34a2008
---
# ADR files are found only with four-digit names

## Summary

`al` finds an ADR only when its file name starts with exactly four digits: `<root>/adr/NNNN-*.md`. Many projects number ADRs with three digits (`001-*.md`) or another width. In such a project `al` finds no ADR, and runs none of the ADR checks: `superseded-cited`, `superseded-status`, `adr-status`, `adr-changed` and the rest. It says nothing about it.

Seen in a test run of al 3.2.0 on a public project whose ADRs are named `001-…md` to `00N-…md`.

## Where

The pattern `^\d{4}-[^/]*\.md$` (or `^(\d{4})-`) in `src/v4/state.js`, `src/v4/indexer.js` and `src/v4/export.js`.

## Expected

- An ADR file name starts with one or more digits and a dash. Its number is the value of those digits, so `001-x.md` is ADR-1 and `0040-y.md` is ADR-40.
- Two files with the same number in one ADR folder get a hint.
- When the ADR folder holds Markdown files and none matches, `al check` says so once, so that a project does not run with no ADR checks by mistake.

## Tests

Fixtures with three-digit, four-digit and five-digit names; a clash of two files with the same number; a folder with no matching file.


## Comment

One more place, seen on the same project:

`scopeOf` in `src/v4/scope.js` returns `null` for every path under `<root>/adr/`. So a file such as `001-x.md` there is neither an ADR (the four-digit pattern does not match) nor a spec document (the ADR folder is taken out of the spec scope). al reads nothing in it and gives no hint.

The fix of this issue covers both places. The test for "a folder with no matching file" checks that `al check` says so once.

