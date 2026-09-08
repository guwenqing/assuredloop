# Original request

> Simulation input only. This sanitized snapshot is not a live service record or a policy decision.

Complete the owner-led closeout for the delivered workflow-refresh change. Aggregate the reviewed deliveries, synchronize the current Specs, regenerate the bound contract assets, capture fixity, and complete the archive and handoff sequence.

## Specification snapshot

Source: `example/consumer` at revision `2323232323232323232323232323232323232323`, `openspec/specs/specification-baseline.md`.

Closeout verifies the full accepted delta, current baseline, source evidence identity, per-delivery base and policy metadata, independent review, and the post-merge archive result. A clean closeout still records the sequence and its limits.

## Issue snapshot

```text
repository: example/consumer
issue: example/consumer#57
activity: closeout
request: example/consumer#57
change: workflow-refresh
basis: example/consumer@2323232323232323232323232323232323232323:openspec/specs/specification-baseline.md
deliveries: example/consumer#12, example/consumer#21, example/consumer#34
manifest: complete source refs, revisions, scopes, results, digests, and per-delivery policy/base metadata
review: independent full-scope review passed for the closeout revision
owner: closeout-owner
owner_acceptance: recorded for the synchronized baseline and contract transition
```

## Policy snapshot

```text
project_review_depth: full-scope
closeout_policy_ref: example/consumer@2323232323232323232323232323232323232323:openspec/specs/specification-baseline.md#requirement-owner-led-closeout-verifies-the-integrated-specification
allowed_reviewer: model-reviewer
excluded_models: model-blocked
owner_acceptance_ref: example/consumer comment 904
archive_state: ready after reviewed delivery
epic_closure_state: ready after merged confirmation
```

## Evidence snapshot

```text
planning_delivery: example/consumer#12 base_ref=main base_sha=2424242424242424242424242424242424242424 policy_mode=bootstrap result=pass evidence=example/consumer comment 905
implementation_delivery: example/consumer#21 base_ref=main base_sha=2525252525252525252525252525252525252525 policy_mode=activation result=pass evidence=example/consumer comment 906
closeout_review: example/consumer comment 907 head=2626262626262626262626262626262626262626 producer_session=session-closeout-author reviewer_session=session-closeout-reviewer reviewer_model=model-reviewer review_depth=full-scope result=pass
fixity_manifest: example/consumer@2626262626262626262626262626262626262626:acceptance/workflow-refresh-manifest.json
sync_checks: complete-delta coverage; inbound-heading repair; native validation; contract regeneration; manifest comparison
```

The simulated record includes the evidence and policy references used by the closeout sequence.
