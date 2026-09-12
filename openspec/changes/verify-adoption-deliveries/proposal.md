## Why

First-consumer feedback exposed three gaps in verifying real delivery: initial manual bootstrap has no prior policy envelope (#25), an accepted native zero-Spec change fails closeout (#30), and a specific planning PR cannot be a prerequisite while its continuous planning Issue remains open. Requiring invented audit data, fake Specs or extra wrapper tickets would defeat the existing workflow.

## What Changes

- Recognize a separately reviewed initial-bootstrap verification record for an actually merged, explicitly authorized no-prior-policy delivery. Verify the observed absent base configuration, original sources and delivered scope without reconstructing nonexistent authority.
- Preserve that verification and original source fixity through manifest capture and revalidation; unknown historical audit data remains unknown rather than receiving a blanket exemption.
- Honor native `skip_specs: true` only from the accepted fixed change, with an unchanged complete current Spec baseline and independent assessment of the claimed no-Spec scope.
- Support a merged PR contribution in existing `depends_on`, separately from completion of a whole Issue. Inspect exact declared scope, task associations, review and delivery; do not require the owning planning Issue to close or synthesize Issue fields on a PR.
- Let one batch closeout Issue deliver separately selected native changes through their own PRs, using existing PR `change` and fixed task references. Do not require extra closeout tickets or a mutable single-change selector on the aggregate Issue.

## Capabilities

### New Capabilities

None. These are bounded extensions of existing traceability and closeout capabilities.

### Modified Capabilities

- `workflow-self-evolution`: Explicit later verification of the genuine first manual bootstrap, not a permissive current-policy fallback.
- `github-work-traceability`: Issue versus PR-contribution prerequisites and scoped completion evidence.
- `specification-baseline`: Verified initial-bootstrap manifest entries and accepted native zero-delta synchronization.

## Impact

Extend the shared record schema/discovery, `policy`, `trace`, `work-records`, `manifest`, `closeout`, `synchronization` and trusted native adapter where required. Reuse the installed OpenSpec 1.12.0 marker reader, existing raw Git/GitHub acquisition and native delta parser. Update existing adopt/deliver/review/closeout guidance and examples; no new role, Skill category, issue type, database or dependency is needed.

This is planning under [#22](https://github.com/guwenqing/assuredloop-base/issues/22) within [Epic #21](https://github.com/guwenqing/assuredloop-base/issues/21). Separate developer outcomes share that planning task; [#24](https://github.com/guwenqing/assuredloop-base/issues/24) owns their aggregate acceptance. Original #25/#30 reports remain the request sources; superseded #28 is not delivered work.

## Boundaries and acceptance

No retarget restriction, staging-destination field, universal policy override, automated approval, retroactive edit of original evidence, remote-code execution or consumer configuration change. Missing/invalid/suspended existing policy must still fail. These changes cannot authorize their own adoption; current policy, independent review and human acceptance of this Proposal apply before implementation. Until PR prerequisites are implemented, a proposed temporary transition is explicit manual verification of the exact accepted planning PR, retaining the checker limitation and all other checks; this requires the owner's explicit acceptance, not an implicit waiver from an omitted field.
