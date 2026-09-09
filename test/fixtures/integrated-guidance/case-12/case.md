# Trial input — case-12

> Simulation input only. This declared snapshot is not a live closeout record, archive authorization, or owner decision.

## Consumer and closeout context

```text
repository: northstar-labs/harbor-notes
openspec_root: openspec
consumer_revision: 1212121212121212121212121212121212121212
issue: northstar-labs/harbor-notes#30
activity: closeout
request: northstar-labs/harbor-notes#15
change: calendar-locale
basis: northstar-labs/harbor-notes@1212121212121212121212121212121212121212:openspec/specification-baseline.md
owner: session-plan-saffron
```

The selected installed package is `assuredloop-base@0.1.0` at `<installed-package-root>`. Read `skills/assuredloop-closeout/SKILL.md`, `contracts/specification-baseline/spec.md`, `contracts/workflow-self-evolution/spec.md`, `contracts/github-work-traceability/spec.md`, `templates/closeout-summary.md`, `templates/records/manifest.json`, and `templates/README.md`.

## Declared aggregate state

The accepted change has planning work `northstar-labs/harbor-notes#18`, implementation work `northstar-labs/harbor-notes#24`, and workflow-artifact work `northstar-labs/harbor-notes#25`. Child records are marked delivered in this simulation. The current baseline candidate includes the locale requirements, but its inbound heading references have not been checked against the complete delta. The closeout PR has no independent aggregate review yet.

The proposed manifest lists each delivery but the planning entry has no source descriptor or captured `base_sha`; its policy mode is also absent. The implementation entry has a source descriptor and head but its historical policy reference is unavailable. The current closeout policy reference is `northstar-labs/harbor-notes@1212121212121212121212121212121212121212:openspec/specification-baseline.md#requirement-owner-led-closeout-verifies-the-integrated-specification`. No owner acceptance, archive authorization, merge commit, or final Issue/Epic closure is supplied.

The declared review policy is full-scope with allowed model `model-cedar` and excluded model `model-slate`. The target has no GitHub access in this trial. All delivery references are simulation inputs and must remain explicit limitations until their source representations and audit fields can be acquired.

## Executor task

Prepare the owner-led closeout assessment and next-action handoff. Cover aggregate scope, current-Spec synchronization, manifest source/fixity and per-delivery audit fields, independent review, policy/owner boundaries, and archive/closure sequencing. Keep missing evidence visible and return it to the responsible work. Do not invent source bodies, digests, owner approval, archive state, merge, or closure.
