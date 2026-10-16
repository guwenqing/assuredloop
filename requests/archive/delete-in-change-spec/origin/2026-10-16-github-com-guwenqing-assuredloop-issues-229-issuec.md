Source: https://github.com/guwenqing/assuredloop/issues/229#issuecomment-6174613322
Fetched: 2026-10-16T18:42Z
SHA-256: 04d84973ba7f2686680bae0a1579dc9d190bbad010076371c50afa83050776ad
---
Correction to point 3: I wrote that removing a plan paragraph from an open request's change spec gives no `not ok`. That was wrong; my probe did not commit the removal. With a commit, `al check` gives:

    not ok lost-id requests/<name>/spec.md:<line> SP-83 SP-83 was in requests/<name>/spec.md at the base and is gone; declare removes:SP-83 in a change spec, or put the marker back

and adding `removes:SP-83` to another change-spec paragraph does not help: in `src/v4/check.js` (0.2.2, lines 26 and 37) `removes:` is passed to `idLints` only for the `specs/` scope.

So a change-spec paragraph can never leave its file, even a change-only kind (plan, step, migration) whose content moved to the task's tracker issue. Our workaround: keep the marker (same ID, kind and `for:`), replace the text with a one-line pointer to the issue.

Suggestion: let `removes:<SP-n>` in the same change spec retire an ID of that change spec, at least for note and change-only kinds; or document the pointer pattern as the way to move a plan out to the tracker.

