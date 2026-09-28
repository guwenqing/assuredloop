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
