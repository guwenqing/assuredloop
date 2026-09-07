## 1. Project adoption and record contracts

Work package: project configuration, record schema and safe setup. GitHub Issue will be linked before planning handoff. Basis: [adoption](specs/project-workflow-adoption/spec.md), [traceability](specs/github-work-traceability/spec.md), [Design decisions 4-5](design.md#4-minimal-structured-relationships-not-a-second-task-database).

- [ ] 1.1 Define the minimal JSON Schema, descriptions and valid/invalid examples for configuration and workflow records; verify independently authored schema tests reject missing/invalid required data and accept rough pre-triage requests, staged planning, legitimate no-Spec work and extensible project policy.
- [ ] 1.2 Implement safe local setup and project/repository configuration using native OpenSpec initialization; verify genuine RED/GREEN functional tests for explicit target selection, idempotent adoption, unrelated-file preservation and overlap failure, with pinned direct dependencies and no remote writes.
- [ ] 1.3 Deliver the adoption guidance and verify a fresh executor can configure a local fixture using only its instructions and declared context; record independent review and adoption evidence on the work PR.

## 2. Work-category Skills and handoff templates

Work package: complete guidance for doing the work, not one Skill per operation. Depends on package 1's reviewed contracts. GitHub Issue will be linked before planning handoff. Basis: [work guidance](specs/project-workflow-adoption/spec.md#requirement-cover-traced-mutations-through-coherent-work-category-skills), [intake/planning](specs/work-intake-and-planning/spec.md), [Design decision 7](design.md#7-skills-explain-complete-work-with-native-operations-inside).

- [ ] 2.1 Implement triage, planning/decomposition and bounded-research guidance with referenced Issue templates/contracts and native workflows; verify fresh-agent trials for continuous planning, justified splitting, active-plan additions and a Spike that ends at the human decision without automatic successor work.
- [ ] 2.2 Implement delivery, independent-review and closeout guidance, including native checklist/GitHub reconciliation and complete-change synchronization; verify instructions expose required inputs, references, checks, scope limits and completion obligations without hidden validator rules or duplicated task status.
- [ ] 2.3 Provide one authored source for Codex/Claude-discoverable guidance and template references; verify synchronization/example checks and an independent full guidance review, without editing upstream Skill logic or installing any review-provider automation.

## 3. Read-only trace checks and reviewer context

Work package: local inspect/check tools, not a new workflow engine. Depends on package 1; integrate with package 2 as guidance becomes available. GitHub Issue will be linked before planning handoff. Basis: [mechanical checks](specs/review-and-validation/spec.md), [record relationships](specs/github-work-traceability/spec.md), [Design decisions 5-6](design.md#5-small-local-tools-and-explicit-trust-boundaries).

- [ ] 3.1 Implement read-only Git/OpenSpec/GitHub context resolution through native interfaces; verify independently authored RED/GREEN unit and CLI tests for qualified references, pagination, scoped access, traversal rejection and unavailable evidence without executing commands from records.
- [ ] 3.2 Implement schema/link/revision/status/evidence checks using accepted policy separately from candidate content; verify RED/GREEN and controlled-fault cases for missing basis, premature closure, stale review, candidate policy weakening and legitimate planning/research/cancellation outcomes.
- [ ] 3.3 Implement focused reviewer packets with source basis, actual diff, task mapping, evidence, excluded/missing context and explicit expansion; verify planning, implementation and whole-change closeout packets against fixtures, with semantic judgment left to the reviewer.
- [ ] 3.4 Implement closeout synchronization coverage checks around native outputs, including candidate/merged completion distinctions; verify omitted deltas, lost scenarios, broken links, stale base and the open closeout Issue are handled correctly, and record independent code review with test evidence before delivery.

## 4. Integrated adoption, activation and governed self-use

Work package: acceptance execution and activation evidence. Depends on packages 1-3 being delivered. GitHub Issue will be linked before planning handoff. Basis: [adoption verification](specs/project-workflow-adoption/spec.md#requirement-verify-adoption-through-representative-guided-work), [self-evolution](specs/workflow-self-evolution/spec.md), [Design decisions 9-10](design.md#9-test-first-implementation-and-acceptance-evidence).

- [ ] 4.1 Run representative end-to-end work-guidance trials and local functional checks using only declared context, including negative cases; fix or return findings to the responsible work and verify independent acceptance review of the usable base before recording any activation.
- [ ] 4.2 Record authorized activation of a fixed verified revision, then select a genuine bounded improvement from the trials and deliver it under the active workflow with a scoped Issue/PR; verify traced basis, applicable RED/GREEN or artifact checks, independent review and completion evidence without claiming automation or closing the parent Epic.

## 5. Owner-led closeout

Work package: final aggregate acceptance, native synchronization/archive and overall completion, owned by the Epic/change owner rather than an implementation worker accepting their own output. Depends on packages 1-4 and any accepted self-use improvement being delivered. GitHub Issue will be linked before planning handoff. Basis: [closeout contract](specs/specification-baseline/spec.md#requirement-owner-led-closeout-verifies-the-integrated-specification), [evidence-backed completion](specs/github-work-traceability/spec.md#requirement-completion-requires-the-right-kind-of-evidence), [Design decision 8](design.md#8-closeout-is-a-normal-reviewed-delivery).

- [ ] 5.1 Assess the integrated outcome against all accepted requirements and delivery records, returning unresolved defects to responsible work; prepare a normal closeout PR that synchronizes all native delta Specs, preserves unaffected behavior and links, and stages archive only after successful native validation and synchronization comparison.
- [ ] 5.2 Obtain the applicable pre-merge mechanical checks and independent AI review of the entire closeout candidate, resolve findings and any required human decision, then perform authorized merge and verify the merged baseline/archive; close the closeout Issue and then the Epic only on that evidence, not on checkbox or child-Issue counts alone.
