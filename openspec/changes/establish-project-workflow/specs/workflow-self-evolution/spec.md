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

The effective activation/policy pointer SHALL be a versioned consumer record read from the trusted current target base, separately from the candidate head. It SHALL identify the fixed policy source, contract package/version/integrity, authorization and evidence. Candidate changes to that pointer or configuration SHALL be checked under the pre-change policy. When no base activation exists, an explicit authorized bootstrap basis SHALL be required; missing/unresolved policy SHALL NOT imply unrestricted operation. Mutable GitHub comments can support authorization evidence but SHALL NOT themselves select policy automatically.

#### Scenario: Candidate edits its own activation pointer
- **WHEN** a PR changes the configured policy or activation source
- **THEN** checking still resolves the prior accepted pointer from the current trusted base and reports the candidate policy change for review

#### Scenario: Bootstrap has no accepted pointer
- **WHEN** no versioned activation or explicit authorized bootstrap basis is available
- **THEN** checking reports policy unavailable and cannot accept the work through a permissive fallback

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
