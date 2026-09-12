## Context

See [Proposal](proposal.md), original [#25](https://github.com/guwenqing/assuredloop-base/issues/25), [#30](https://github.com/guwenqing/assuredloop-base/issues/30), and the PM's contribution-prerequisite finding on [Epic #21](https://github.com/guwenqing/assuredloop-base/issues/21). Inspection at main `2c83d9bc3a52ddb088490bcd2b168507c0ab50d3` found:

- `work-records.js` parses prerequisite bundles as Issue records and requires closed/completed before recursing; a PR identifier passes the shared schema but fails the actual record path.
- `manifest.js` preserves manual rows but reports any null historical audit field as unavailable; it does not distinguish verified absence from unknown authority.
- `synchronization.js` returns before comparison whenever `findSpecUpdates` is empty. The pinned native metadata module already exports `readSkipSpecsMarker`; the adapter can reuse it like the existing retirement reader.
- `trace.js` passes the closeout Issue record to `selectCloseout`, which selects only `record.change`. Shared batch closeout guidance therefore needs a scoped PR-selection path, not just several Issue plan refs.

## Goals / Non-Goals

Support these three observed cases through existing read-only adapters, native snapshots and reviewed work records. Do not create a workflow engine, policy bypass, ticket wrapper generator, general historical reconstruction or staging-destination restriction. The work changes what the checker can establish, not what an agent may decide without a human.

## Decisions

### 1. Typed later bootstrap verification, not invented old Evidence

Add one shared record definition, `initialBootstrapVerification`, with discriminator `record_type: initial-bootstrap-verification`. Use the existing `Workflow context` wrapper, not another heading or parser. Required content groups are:

| Group | Fields and meaning |
| --- | --- |
| Original subject | `pr`, `head`, `base_ref`, `base_sha`, `merge_sha`: actual original PR, reviewed head and actual delivered revision |
| Delivered basis | `bootstrap_ref`: fixed delivered config RepoRef; its existing `project.bootstrap` contains the fixed policy and acceptance references |
| Original sources | `sources`: nonempty source descriptors using the existing raw Git/comment representation, with SHA-256, and purpose `policy-acceptance`, `proposal-acceptance`, `review` or `delivery`; each required purpose is covered |
| Later assessment | `verified_at`, `verification_policy_ref`, `scope`, `result`, `producer_session`, `reviewer_session`, `reviewer_model`, `review_depth` |

Use existing value definitions; do not embed arbitrary commands, authorization booleans, provider credentials or a copy of the full config. `result` is `pass`, `revise` or `incomplete`; only a source-backed pass can contribute. This tag is not ordinary pre-merge Evidence and never fills `policy_ref/config_digest/activation_digest` for a policy that did not exist. Later producer/reviewer declarations describe the later verification; the original review identities and actual owner authority are assessed from the original source reports, not relabeled as new execution.

Before returning eligibility, acquire actual PR and delivery metadata, confirm reviewed head/base-ref identity, and prove the historical base relation through the actual squash commit's parent/tree and acquired fixed source. Version one supports this repository's ordinary squash-delivery case; a merge form whose base/delivery relation cannot be established is explicitly unsupported, not guessed. Require both config and activation absent at that exact base with positive accessible-tree/path-missing evidence; access errors, invalid files and suspended activation are not absence. Compare delivered config bytes to the referenced bootstrap config and selected reviewed contribution. Follow its existing explicit policy/Proposal acceptance refs; require consistency with the purposes in `sources`.

Validate and retain original approval/review/delivery sources and their hashes. Mechanical checks establish structure, observed Git relations and source consistency; the later independent reviewer must still assess actual fixed-policy approval, original reviewer independence, full contribution coverage and original delivery. A scope-only or wrong-policy approval must not receive a qualifying semantic PASS even if a comment exists. Checking record shape never authenticates the people or their statements.

The invoking current check supplies `verification_policy_ref` through its accepted current policy; the tagged input cannot select the verifier's current permission ceiling or policy. Limit remote reads to that existing ceiling. Candidate configuration remains observed evidence only. Add the tag to shared source discovery/validation explicitly so malformed or mixed tagged records are errors, not unstructured-prose fallback; old ordinary Evidence and self-change decisions retain their schemas.

### 2. Preserve historical and verification provenance separately

Extend a manifest delivery entry with an optional `initial_bootstrap` object containing the full typed later-verification value and its source descriptor/hash. Original delivery source/head/base/scope remain in the existing entry; its historical `policy_ref` and `policy_mode` remain null because no policy governed that first merge. The nested later verification is not substituted into those fields. Do not introduce a fake normal policy mode.

Capture re-reads and hashes all nested original sources plus the later-verification source, checks the real merged contribution and confirmed base absence, and compares the caller's supplied summaries. Revalidation repeats source fixity and eligibility. Only a complete supported initial verification changes the otherwise expected audit-absence finding into a semantic-review notice; generic missing or inapplicable old fields retain the current failure. Invalid tagged records cannot take the manual-history path. The aggregate manifest's current closeout policy remains independent of both historical absence and later verification policy.

This is a compact final fixity record, not a transcript dump: bodies/logs remain GitHub/local evidence, with existing unavailable/drift semantics. Old manifests are not rewritten to appear complete. Reproduce the consumer case with synthetic isolated sources; source evidence may be consulted read-only, but no live consumer is modified by tests.

### 3. Dispatch prerequisite checking by actual resource kind

Keep the existing `depends_on` qualified WorkRef vocabulary. Resolve actual GitHub resource kind before invoking an evaluator. Issue dependencies continue through whole-Issue completion. PR dependencies parse `pr`, inspect the actual merged PR and original policy/review or initial-bootstrap verification, and resolve its canonical owner/task refs without parsing it as an Issue or requiring `state_reason` on a PR.

Expose selected PR contributions, parent remaining scope, missing sources and the dependent work's basis in reviewer context. A declaration that depends on PR X means the assigned contribution of X, not all work of its owning Issue. Verify fixed task references, exact actual merge/squash identity, applicable evidence and explicit review dispositions; semantic sufficiency remains review work. Use one normalized graph/cycle stack across Issue and PR nodes and scope checks before every read, including cached acquisitions. An unrelated PR, missing merged state or unsupported review context cannot qualify.

Manifest inventory matches dependency kind against `issues` or `prs` respectively, not just `deliveries[].issues`. Preserve the original source's contribution and do not copy a PR into an Issue array to pass a test. Do not require completed whole-Issue coverage when the dependency intentionally names only its PR, but retain whole-Issue checks for an actual Issue dependency.

### 4. Reuse the native skip marker and compare the complete baseline

Expose `readSkipSpecsMarker` from the exact pinned runtime, checking its function contract. Resolve it in the same isolated native schema view used for retirement metadata, including supplied custom schema files. Use the whole accepted fixed change snapshot selected by `selectCloseout`, never a flag added only in the current candidate or a supplied override.

Valid declared skip + no deltas + no retirement intent selects identity synchronization: require exact path inventory and raw bytes for every current `spec.md` in base and candidate, and still run native baseline validity/inbound-reference checks. Both empty inventories are a legitimate case. Changed purpose text, renamed files, added/removed Specs and code-hidden semantic changes are distinct: the first group fails mechanically; whether unchanged Specs should have changed is an independent review question supplied with actual diff/context. Do not broaden acquisition beyond existing bounded snapshots.

Return the existing top-level status vocabulary with an explicit `mode: no-spec-change` result and compared snapshot identities. Missing/false/malformed/unknown-schema skip metadata cannot convert an empty change to success. If skip and actual delta/retirement artifacts coexist, report contradiction rather than choose a convenient path. Nonempty normal changes retain native full-delta rebuilding. Review still verifies the skip declaration belongs to the accepted plan and accurately describes the real code/requirements impact.

### 5. Verification and transition

For batch closeout, use the existing optional PR `change` to select one assigned native change per closeout PR. An aggregate Issue may omit its singular `change` while retaining the complete batch's fixed basis/plan refs. Resolve the selected PR's closeout task refs against the actual owning Issue and canonical task associations; require one change and one accepted fixed whole-change revision. Preserve the Issue's aggregate scope, prerequisites and completion obligations. Reject an unassigned change, ambiguous revisions, mismatched Issue/PR selectors or a PR claiming another change's tasks. A legacy single-change Issue retains its existing selection path when no explicit PR selector is supplied.

This is a narrow selector extension, not a multi-change synchronization engine or a new record field. Each closeout PR synchronizes one complete delta against its actual destination and retains its own manifest/policy context. Independent review checks cumulative batch coverage; ordinary whole-Issue completion still requires all assigned contributions. Do not rewrite the aggregate Issue's selector between PRs to make earlier evidence mean something different, or close it after its first contribution. Include focused positive/negative selector and cumulative-completion tests in this delivery.

One developer work outcome covers this related prerequisite/closeout verification path; use scoped commits or contributing PRs if useful without new Architecture Tasks. A different test author writes observable failing unit/functional cases before implementation. Cover ordinary Issue/PR prerequisites, open umbrella planning with a merged accepted contribution, unmerged/cancelled/unrelated/stale PRs, cycles, forbidden references, original bootstrap happy path and every negative scenario, nested manifest drift, and valid/invalid native skip controls. Relevant faults remove absence/source checks, skip PR reviews or treat every empty delta as successful; unchanged tests must detect them before restoration to GREEN.

Update existing record examples and adopt/review/deliver/closeout guidance in the same delivery. A fresh executor must create conforming records without private conversation and distinguish supported completion from incomplete historical sources. No existing tests are changed without explicit authorization; add focused coverage instead.

Existing active policy governs this implementation's own PR. For the first delivery that adds PR-prerequisite support, owner acceptance must explicitly cover a bounded manual assessment of the exact reviewed/merged planning PR while the current checker cannot represent that prerequisite. Keep the raw diagnostic/limitation, source references, independent review and required checks; do not fake #22 closure. Once supported behavior is delivered and independently verified, subsequent work uses actual `depends_on` PR refs. This transition is pending a real owner decision, not granted by the document.

## Risks / Trade-offs

- Later attestations could falsely launder missing history: explicit absence proof, original raw source fixity, separate later policy and semantic review prevent a generic null-policy fallback.
- Broader dependency graphs could enlarge acquisition or create cycles: retain one current permission ceiling, normalized identities, fixed sources and explicit gaps.
- Several fixes share modules: one coherent implementation task avoids racing independent changes in source discovery/manifest paths; independently test each behavior and its controls.
- Archived workflows and old tools do not understand the new tag: retain raw older diagnostics and pin any upgraded package explicitly. No automatic rewrite or retroactive PASS.

## Migration Plan

After owner Proposal acceptance and design review, deliver this plan's contribution under #22 and hand off fixed refs. Implement and review under the old current policy; verify actual delivery before claiming new support. #24 synchronizes all three complete deltas, generates/checks required acceptance records, and records package version/contract selection explicitly without silently upgrading another consumer. Keep this change active until its own accepted implementation/synchronization is done; shared #24/#21 close only after their whole declared batch is complete. Rollback selects the prior accepted package and preserves new unsupported records as evidence, never deletes history to recover a green check.
