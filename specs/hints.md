## [HNT-1] How hints are written
Hints MUST be ranked, at most three in a default view and five in `check`,
with "N more hidden, --all". Each MUST be worded as an observation, name the
section, file or line range involved, and name the command that addresses it.
A hint is `not ok` (something to fix or explain) or `note` (worth a look).

## [HNT-2] The hints
The tool MUST give at least these hints. `not ok`:
- a held section that differs, has a base revised or dropped, or has a broken
  link;
- two open changes holding one section when neither reaches the other through
  links;
- an edit to an append-only record;
- conflict markers, or Was:/Now: blocks, in the baseline;
- duplicate IDs, or a cited ID, request or requirement that does not exist;
  a block marked Dropped, and not Kept, is not flagged for a requirement its
  request no longer holds;
- a held ID not found;
- a request archived on the branch that no longer meets `conclude`'s rules;
- a baseline section changed on the branch that equals the "now" of a
  blocked request;
- a branch whose final state delivers spec work or other work for a request
  that is still blocked in that state;
- a tier-0 claim with a baseline edit;
- a snapshot whose text no longer matches its SHA-256.

`note`:
- a hotfix into a section another change holds;
- a section this branch edits that changed on main since the fork;
- baseline sections changed with no request linked;
- code changed while its linked tests did not;
- an observed assertion change with no linked code or spec change;
- code still live for dropped work, as `path:lines`, and whether a part plans
  its removal;
- a sign-off pending or changed since;
- a snapshot not re-checked, or whose source was updated since;
- a test result that is not evidence for this change;
- a tier-0 claim where a nearby promise's tests changed;
- a missing tier line;
- work that reached main in an earlier commit than its request's first
  sign-off;
- a requirement in no section at conclusion;
- an open child request when the parent concludes.

## [HNT-3] Exit codes and strict mode
`context`, `spec` and `check` MUST exit 0. `check --strict` MUST exit 1 on any
`not ok` that is owned by a request the branch serves or archives, or that no
request owns (such as duplicate IDs or conflict markers). Other requests'
alignment debt caused by this branch MUST be shown as information and MUST
NOT count. `conclude` and `consolidate` MUST exit 1 when they refuse. The tool
MUST exit 2 when it fails itself. Nothing is installed in git hooks.
