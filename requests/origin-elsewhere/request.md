# Original files outside the repo
Tier: 2 · Status: open

## Owner's words and dialog

- 2026-10-26 the owner's words, snapshot origin/2026-10-26-owner-words.md

## Organized requirement

<!-- R1 from:2026-10-26-owner-words.md -->

### R1 Original files outside the repo
A project MAY keep the original files of its requests outside the repo: the owner's words, the sign-off snapshots and the other source snapshots. Each worker MUST be able to tell `al` where these files are on its own machine. The shared files that `al` writes into the repo MUST NOT name that place. The repo MUST keep each file's name and fingerprint, so that a requirement and a sign-off still bind to their exact text.

Where a worker has set the place, `al` MUST write each new original file there, and MUST check each named file as it checks a file in the repo: a file that is missing, unreadable or changed is `not ok`. Where `al` cannot write a new original file, because no place is set or the write fails, it MUST stop and record nothing.

Where a worker has set no place, `al` MUST name each original file that it could not check, say why, and MUST NOT report the file as checked or as changed. `al check`, `--strict` included, MUST NOT fail for that reason alone, so that a check runs where the files cannot be reached, such as on CI. `al conclude` MUST refuse a request until each of its original files is checked.

A project that keeps its original files in the repo MUST work as before, with no new setting.

Amends: hints-and-blocks/R3 (a sign-off's file may be outside the repo; every other condition of a valid sign-off stays) and hints-and-blocks/R4 (a missing or unreadable original file is `not ok` only where the worker has set the place).

Out: moving the existing original files out of the repo and out of its history (#63).
Signed off: 2026-10-26 owner, origin/2026-10-26-signoff.md
