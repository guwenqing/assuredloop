# Original request

> Simulation input only. This sanitized snapshot is not a live service record or a policy decision.

Complete closeout only after the aggregate assessment, synchronized baseline, regenerated contract binding, fixity capture, and required owner decisions are available. Return unresolved acceptance gaps to their responsible work.

## Specification snapshot

Source: `example/consumer` at revision `2121212121212121212121212121212121212121`, `openspec/specs/specification-baseline.md`.

Closeout is an owner-led reviewed delivery. The current owner may separately authorize synchronization while an acceptance hold keeps archive and final closure pending. The synchronization and review evidence remain part of the active change until that hold is resolved.

## Issue snapshot

```text
repository: example/consumer
issue: example/consumer#56
activity: closeout
request: example/consumer#56
change: workflow-refresh
basis: example/consumer@2121212121212121212121212121212121212121:openspec/specs/specification-baseline.md
deliveries: example/consumer#12, example/consumer#21, example/consumer#34
owner: closeout-owner
owner_decision: pending confirmation of the accepted contract transition before archive and final Epic closure
sync_authorization: example/consumer comment 901 authorizes synchronization of the current Specs and preparation of the closeout candidate while the hold remains
sync_checks: complete-delta coverage; inbound-heading repair; native validation; contract regeneration; fixity manifest comparison
sync_review: independent full-scope review of synchronized Specs and closeout candidate at head 2222222222222222222222222222222222222222
hold_evidence: example/consumer comment 901 records the current owner's archive/final-closure acceptance condition
```

## Policy snapshot

```text
closeout_policy_ref: example/consumer@2121212121212121212121212121212121212121:openspec/specs/specification-baseline.md#requirement-owner-led-closeout-verifies-the-integrated-specification
archive_state: pending owner acceptance
epic_closure_state: pending owner acceptance
sync_state: authorized and assessed within the active change
```

## Evidence snapshot

```text
sync_revision: 2222222222222222222222222222222222222222
sync_check_record: example/consumer comment 902
review_record: example/consumer comment 903
fixity_manifest: example/consumer@2222222222222222222222222222222222222222:acceptance/workflow-refresh-manifest.json
delivery_records: example/consumer#12, example/consumer#21, example/consumer#34 each retain base_ref, base_sha, policy_ref, and policy_mode
```

The current record contains an owner hold on archive and final closure after the separately authorized synchronization and its review evidence.
