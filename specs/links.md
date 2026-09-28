## [LNK-1] Rough links, with reasons
Links MUST be derived when read, never kept as a required list, strongest
first, each shown with its reason:
1. a bracketed ID near the change, in code or a test name;
2. blame of the changed lines (the old side for changed or deleted lines),
   with `-w -M -C` for code, without `-C` for the baseline, honouring
   `.git-blame-ignore-revs`, then the commit's request ([LNK-2]);
3. files changed in the same commits, skipping (and counting) commits that
   touch more than 30 files;
4. words shared between section headings and code or test names.

## [LNK-2] From a commit to its request
A commit MUST map to a request through a `Request:` line anywhere in its
message; else through the request folder it touched ("ambiguous" when it
touched more than one); else through an issue number listed in a request's
owner's words. `Follows:` lines link a later request to an earlier one.

## [LNK-3] Tests and their results
Test files MUST be recognised by common path patterns or by paths the project
names. Test results MUST be read only from files the project names, and
reported with their provenance: a result with an unknown or older revision is
not evidence for this change. When both exist, results at the base and the
head MUST be compared, so failures that were already there are not blamed on
the change. Assertion counts MUST be reported only for supported test syntax,
as observations, and unsupported files as skipped.

## [LNK-4] Decision records
ADRs live in the project's ADR folder, or `docs/adr/NNNN-<decision>.md`, in
the kit's format, where a change is a new record that replaces the old one
whole. A request's decision MAY point to an ADR; an ADR MAY name its request
(`Request:`) and the sections it governs (`Governs:`). The tool MUST show the
governing ADRs of a section (current first), list the ADRs a request added or
superseded, and flag: an accepted ADR edited beyond its status, a broken or
one-way supersede link, and a reused ADR number (`not ok`); a superseded ADR
cited as current, or an ADR left proposed at a request's conclusion (note).
