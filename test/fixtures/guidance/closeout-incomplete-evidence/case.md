# Original request

> Simulation input only. This sanitized snapshot is not a live service record or a policy decision.

Prepare the owner-led closeout for the completed workflow-refresh change. Aggregate the delivery records, synchronize the current Specs, and report any missing evidence before archive.

## Specification snapshot

Source: `example/consumer` at revision `2020202020202020202020202020202020202020`, `openspec/specs/specification-baseline.md`.

Closeout requires every accepted delivery, including planning, to retain its source evidence identity, assessed revision, scope, result, and per-delivery policy/base audit fields. Missing source metadata remains an unresolved closeout gap.

## Issue snapshot

```text
repository: example/consumer
issue: example/consumer#55
activity: closeout
request: example/consumer#55
change: workflow-refresh
basis: example/consumer@2020202020202020202020202020202020202020:openspec/specs/specification-baseline.md
deliveries: example/consumer#12, example/consumer#21, example/consumer#34
manifest: planning entry has no captured evidence source or base_sha
owner: closeout-owner
```

The child implementation Issues are closed, but the planning delivery record is incomplete and the synchronized baseline has not been independently reviewed.
