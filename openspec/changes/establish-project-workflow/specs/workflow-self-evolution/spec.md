## Purpose

L1 goal: Make the minimum workflow govern later changes to itself after an explicit, verified activation. L2 capability: workflow self-evolution. The requirements and scenarios below express its L3 behavior contracts. Origin: [accepted self-use and evolution decision](https://github.com/guwenqing/assuredloop-base/blob/55e73ccb3ed83ede943f135a5977308cfdff1408/openspec/changes/establish-project-workflow/proposal.md#what-changes).

## ADDED Requirements

### Requirement: Bootstrap has an explicit activation boundary

Before activation, work SHALL use native OpenSpec planning and explicitly executed owner, check and independent-review boundaries without claiming nonexistent automation. Activation SHALL identify the accepted workflow revision, applicable project/repo configuration, usable guidance and verification evidence. Proposal acceptance or file existence alone SHALL NOT mean the extension is active. The initial exception SHALL NOT exempt future work indefinitely.

#### Scenario: Only planning artifacts exist
- **WHEN** Proposal, Specs or Design are present but the usable extension has not been verified and accepted
- **THEN** status identifies planning progress and does not claim that the new workflow governs work automatically or is operational

#### Scenario: Initial workflow is activated
- **WHEN** the usable base has the required verification, independent review and acceptance evidence
- **THEN** activation records the applicable revision and obligations so the next work item can follow them without inheriting private bootstrap context

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

Minimum acceptance SHALL include a bounded real improvement made after activation through the active workflow, with its Issue, relevant requirement/decision basis, PR, applicable tests or artifact checks, independent review and authorized completion traceable. Demonstration evidence SHALL distinguish manual execution from configured automation. An unexecuted checklist or a repeated claim that the framework is self-governing SHALL NOT satisfy this requirement.

#### Scenario: Actual post-activation improvement completes
- **WHEN** a real bounded change to the base is delivered using its active instructions
- **THEN** its records demonstrate how intake, scope, work, validation, review and completion connected, including any required human decision

#### Scenario: Automation is still deferred
- **WHEN** the self-change uses explicit native checks and manual review handoffs
- **THEN** it can demonstrate the accepted initial workflow while clearly stating that automatic triggers and enforced CI gates are not implemented
