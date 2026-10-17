Source: standard input
Fetched: 2026-10-17T17:09Z
SHA-256: efb48f896785a5bea9c1f28c6c49105cd8363a60d57be6f2e1f17bb56012cc1b
---
The owner's issue #239 on GitHub (https://github.com/guwenqing/assuredloop/issues/239), its title and body as the owner filed them, kept exactly:

# Hints for drift the review keeps missing: issues that a record's tasks link, and configurable phrases

## Summary

Add review hints for drift that a person or an AI review keeps missing. Each is a hint, not a block, because each needs a judgement before it is acted on (see #238, rule 2).

Seen in a spec repository that uses AssuredLoop, in one request with 43 ADRs and about 30 issues, after several design changes:

- Issues that a record's `tasks:` link kept pointing to superseded ADRs, kept old conditions in active comments, and used bare `#n` references to issues in other repositories, which GitHub resolves in the issue's own repository.
- Text that names or retells the requester came back in records and issues after it had been removed.

## What we expect

### H1. Hints for the issues that a record's tasks link

`al check` can read the issues a request's `tasks:` link (read-only, with the GitHub CLI or API, only when asked, for example `al check --issues`). For each issue it reports a hint when:

- the issue body or an active comment names a superseded ADR without the ADR that supersedes it (the same rule as B3 in #238, as a hint for issues);
- a bare `#n` appears in an issue of a repository other than the request's own;
- the issue is not a sub-issue of the request issue, where GitHub allows sub-issues;
- a configured pattern matches (H2).

### H2. Configurable phrases that the review should look at

A project lists phrases or patterns in its configuration, for example phrases that retell who asked for something. `al check` reports each match in specs, records and (with H1) issues as a hint, with file and line. Origin files are exempt. The default list is empty.

## Context

That repository adds no local tools for these; its review reads for them by hand until AssuredLoop supports them.

