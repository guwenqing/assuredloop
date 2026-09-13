---
name: assuredloop-sync
description: Prepare and inspect AssuredLoop verification inputs for synchronizing an accepted OpenSpec change into current specifications, including delta selection, manifest fixity and retained history.
---

# Check current-specification synchronization

Target: {{repository}}; native OpenSpec root: {{openspec_root}}.
Package: {{package_name}}@{{package_version}}.

Use native OpenSpec to apply the accepted delta and archive when the consumer's
workflow permits. This Skill supplies trace/check inputs; it does not assign a
closeout owner, schedule a review, approve an archive or prescribe ticket counts.

Current product requirements live in native `specs/`; active and archived changes
are not another current baseline. Preserve the whole accepted delta at its fixed
revision. Inspect additions, modifications, renames, removals and unaffected
requirements. Repair current inbound anchors; keep historical links fixed.
Informal notes under `.assuredloop/notes/` are not accepted specifications.

Use `templates/README.md`, the manifest schema and
`contracts/specification-baseline/spec.md` inside the selected package
installation, not the consumer repository, for the verification inputs.
A closeout work record selects a real native change and fixed plan assignments.
An aggregate Issue may refer to several changes; each PR selector identifies the
one whole change being checked. This is the current adapter's format constraint,
not a requirement to create an architect role or another Issue for every stage.

```text
assuredloop check --target /absolute/consumer --work OWNER/REPO#NUMBER
```

Where selection is ambiguous, supply `--delta-ref` and `--manifest-ref` as JSON
RepoRefs. The delta must match the accepted fixed change/plan revision. The manifest
must be the candidate head's actual `acceptance-manifest.json`. Use `inspect`
with the same selectors to obtain review context; its invocation acquires a fresh
snapshot rather than continuing a previous check.

Checks compare the baseline, delta and candidate through native OpenSpec; verify
required source/anchor relationships and manifest source hashes; and expose
missing deliveries. An accepted native `skip_specs` requires the complete current
Spec path inventory and raw bytes to remain identical, with no contradictory delta
or retirement. A flag alone cannot establish that the real change is Spec-neutral.

Per-delivery base/policy audit values describe that delivery, not the current
assessment. Initial no-policy delivery uses the separate source-backed
`initialBootstrapVerification` vocabulary; do not invent earlier policy or drop
that contribution. Missing source bytes remain unavailable, not reconstructed
from today's state.

The tool does not write the synchronized Specs, merge PRs, archive changes or close
Issues. It reports evidence for those decisions. For a toolkit package build,
generate `contracts/` from an exact committed canonical source using
`generate-contracts`; generated copies are not separately authored requirements.
