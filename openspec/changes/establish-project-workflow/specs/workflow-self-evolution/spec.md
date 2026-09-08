## Purpose

Make the minimum workflow govern later changes to itself after an explicit, verified activation. This L2 capability supports the shared [L1 goal](../workflow-goals/spec.md#requirement-reuse-supports-governed-evolution). Its requirements and scenarios below define L3 behavior.

## ADDED Requirements

### Requirement: Bootstrap has an explicit activation boundary

Before activation, work SHALL use native OpenSpec planning and explicitly executed owner, check and independent-review boundaries without claiming nonexistent automation. Activation SHALL identify the accepted workflow revision, applicable project/repo configuration, usable guidance and verification evidence. Proposal acceptance or file existence alone SHALL NOT mean the extension is active. The initial exception SHALL NOT exempt future work indefinitely.

#### Scenario: Only planning artifacts exist
- **WHEN** Proposal, Specs or Design are present but the usable extension has not been verified and accepted
- **THEN** status identifies planning progress and does not claim that the new workflow governs work automatically or is operational

#### Scenario: Initial workflow is activated
- **WHEN** the usable base has the required verification, independent review and acceptance evidence
- **THEN** activation records the applicable revision and obligations so the next work item can follow them without inheriting private bootstrap context

### Requirement: Accepted policy is selected from the trusted base

The activation/policy pointer and consumer config for a PR assessment SHALL be read from the actual destination branch's current pre-change revision, separately from candidate content. Policy/config changes SHALL be assessed under that destination's pre-change policy; candidate files, stale merge-bases and supplied ref overrides SHALL NOT replace it. Activation SHALL identify fixed policy/package refs, authorization and evidence.

PR assessment evidence SHALL bind repository/PR identity, destination branch, full base SHA, candidate head, assessed scope, selected policy/package refs and config/activation digests. Changed destination, base, head or applicable policy/work context SHALL require renewed applicable assessment; a prior result SHALL NOT silently transfer between destinations. Feature-branch acceptance SHALL remain destination/scope-specific. Final integration SHALL assess the cumulative proposed change under the final destination's pre-change policy. Normal staging and final squash integration SHALL NOT be prohibited by a single global base restriction.

When activation is absent, accepted destination config's `project.bootstrap` SHALL provide a fixed policy RepoRef and structured Proposal-acceptance evidence ref. Its actual policy revision SHALL have explicit adoption/handoff acceptance. A resolvable authorized bootstrap basis SHALL enable bootstrap-policy checking without claiming activation; absent/unresolved input SHALL yield policy unavailable. Existing suspended/invalid activation SHALL NOT fall back to bootstrap. Mutable comments may support evidence, not select policy automatically. The checks SHALL distinguish scoped consistency from owner authorization and SHALL NOT claim to prevent privileged direct writes or local operators bypassing unenforced controls.

#### Scenario: Candidate edits its own activation pointer
- **WHEN** a PR changes the configured policy or activation source
- **THEN** checking still resolves the prior accepted pointer from the current trusted base and reports the candidate policy change for review

#### Scenario: Bootstrap has no accepted pointer
- **WHEN** no versioned activation or explicit authorized bootstrap basis is available
- **THEN** checking reports policy unavailable and cannot accept the work through a permissive fallback

#### Scenario: Work stages through a feature branch
- **WHEN** work PRs merge into a feature branch before a final PR into the agreed delivery destination
- **THEN** intermediate results remain valid only for their assessed destination/scope, and final cumulative integration receives its own applicable checks and independent review under the final destination's pre-change policy

#### Scenario: PR is retargeted without changing its head
- **WHEN** a reviewed PR changes destination while its head stays the same
- **THEN** its prior result cannot establish acceptance for the new destination, and policy, cumulative scope and applicable assessment are resolved again

#### Scenario: Destination advances after assessment
- **WHEN** the destination's base SHA or applicable policy changes after evidence is recorded
- **THEN** the stale assessment is identified and renewed applicable checks/review are required before acceptance

#### Scenario: Authorized bootstrap resolves before activation
- **WHEN** the destination's pre-change config contains applicable review policy and a resolvable authorized `project.bootstrap`, but no activation
- **THEN** checking applies that fixed bootstrap policy for the named scope and reports bootstrap/not-active operation without treating scope-only acceptance as approval of an arbitrary pointer

#### Scenario: Staged policy changes reach final integration
- **WHEN** a feature branch carries weaker policy files into its final integration PR
- **THEN** the final destination's pre-change policy governs the cumulative change, and stage acceptance cannot authorize adopting those weaker files

### Requirement: Later changes follow the active workflow

After activation, changes to the project's workflow, Skills, templates, configuration, validators, tests and other traced content SHALL use the active work intake, planning, verification and review paths. Changes that only detail or specialize accepted obligations SHALL be evaluated against the same implementation-only boundary as other work. Changes to the accepted agreement SHALL return to Proposal review. The subject being the methodology itself SHALL NOT create an exemption.

#### Scenario: Validator behavior is strengthened within agreement
- **WHEN** a follow-up implements an already agreed check more completely
- **THEN** the work links the existing basis, supplies applicable test-first and review evidence, and justifies its implementation-only scope

#### Scenario: New policy weakens a merge obligation
- **WHEN** a workflow change proposes removing an accepted approval or review obligation
- **THEN** it returns to Proposal-level decision rather than accepting itself through the weakened rule

### Requirement: Evaluate a workflow change against its accepted basis

A change to active workflow obligations SHALL identify the existing basis and the proposed replacement. Review SHALL assess the transition and any affected instructions, templates, checks and work records. The proposal under review SHALL NOT grant itself an exemption from existing applicable obligations. Any necessary transition exception SHALL be explicit and authorized at the affected decision boundary.

#### Scenario: Candidate validation no longer flags its own missing evidence
- **WHEN** a proposed validator change would allow its own PR to omit currently required evidence
- **THEN** the current obligation remains part of the review basis and the candidate's success alone cannot authorize merge

### Requirement: Demonstrate a real governed self-change

Minimum acceptance SHALL include a real governed self-change after activation, normally a bounded improvement with its Issue, requirement/decision basis, PR, applicable checks, independent review and authorized completion traceable. At the end of initial trials, if no genuine improvement candidate exists, the owner SHALL decide between a concrete scoped follow-up and an explicitly reasoned named alternative governed self-change, subject to independent review. A closeout-PR alternative SHALL transfer demonstration verification to closeout rather than require that closeout finish before it starts. If neither path is accepted, the release SHALL remain explicitly not accepted and return to the owner, not enter an indefinite wait or automatic waiver. Manual execution and configured automation SHALL remain distinguishable; a checklist or claim of self-governance alone SHALL NOT suffice.

The owner choice SHALL be a distinct `self-change-decision` record with required `record_type`, `selection`, `work`, `rationale`, `authorized_by` and `evidence`, as defined in the shared vocabulary. It SHALL NOT inherit Evidence-comment `head`, `scope` or `result` fields or be interpreted as delivered-work acceptance. Its schema SHALL distinguish valid owner choices from incomplete Evidence comments; separate evidence must still establish the selected work's execution.

#### Scenario: Actual post-activation improvement completes
- **WHEN** a real bounded change to the base is delivered using its active instructions
- **THEN** its records demonstrate how intake, scope, work, validation, review and completion connected, including any required human decision

#### Scenario: Automation is still deferred
- **WHEN** the self-change uses explicit native checks and manual review handoffs
- **THEN** it can demonstrate the accepted initial workflow while clearly stating that automatic triggers and enforced CI gates are not implemented

#### Scenario: Trials produce no genuine improvement
- **WHEN** trials end without a meaningful improvement candidate
- **THEN** the owner records a scoped follow-up or reasoned alternative for independent review, or an explicit not-accepted outcome; the system neither manufactures work nor claims the demonstration completed

#### Scenario: Owner selects closeout as the alternative
- **WHEN** the owner and independent reviewer accept a named closeout-based demonstration plan
- **THEN** package 4 hands off that decision without claiming demonstration success, and closeout must verify its actual governed execution before overall acceptance

#### Scenario: A decision is not an executed-work report
- **WHEN** a correctly tagged self-change decision supplies its complete decision fields without an Evidence-comment head or result
- **THEN** it is validated as a decision, not rejected as an incomplete Evidence comment or counted as proof of execution; an untagged or wrongly mixed record is not accepted as either kind by guessing
