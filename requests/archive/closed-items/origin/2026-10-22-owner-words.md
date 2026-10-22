Source: standard input
Fetched: 2026-10-22T01:14Z
SHA-256: eeef32ff9de2615cb616d94e0e2e2ad117510d430f76b88715184ab98c02ebd6
---
## Summary

`issue-superseded` reads every saved work item the same way, closed or open. A closed item is a record of what held when it closed: a finished spike that names the ADR it tested against, for example. When that ADR is later superseded, the closed item gets `issue-superseded` on each line that names it, and the hint cannot be answered except by rewriting a finished record.

3.0.0 makes this more frequent, because `ADR 0022` and lists such as `ADRs 0022 and 0023` now count as citations.

## Steps

1. A request's task names a work item that is closed. Its body names `ADR 0022`.
2. A later ADR, ADR-37, supersedes ADR-22.
3. Save the items and run `al check --issues <folder>`.

Result: `hint issue-superseded ... names ADR-22, which is superseded, but not ADR-37` for each line of the closed item, its comments included.

## Expected

- The saved item format (`assuredloop-items/1`) may carry the item's state, for example `"state": "CLOSED"`, as `gh issue view --json state` gives it.
- A closed item gets no `issue-superseded` hint, or gets it as `info`. An open item gets it as now.
- When the state is absent, the check behaves as now.

## Context

A repository's rules ask that open items move their citations to the record that supersedes the cited one; finished items stay as they were. The repository judges these hints as false positives until the check knows the state.

---
I am good for the rest.
