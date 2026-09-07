## Purpose

L1 goal: Keep a readable current requirement set in addition to the history of individual changes. L2 capability: specification baseline. The requirements and scenarios below express its L3 behavior contracts. Origin: [accepted baseline and writing-pilot decisions](https://github.com/guwenqing/assuredloop-base/blob/55e73ccb3ed83ede943f135a5977308cfdff1408/openspec/changes/establish-project-workflow/proposal.md#impact).

## ADDED Requirements

### Requirement: Keep current requirements distinct from change history

The workflow SHALL use native OpenSpec current specifications and change deltas rather than a parallel specification store. Accepted deltas SHALL be integrated through the native synchronization/archive workflow at the agreed lifecycle point, with validation and review of the resulting current requirements. Proposed, accepted and delivered state SHALL remain distinguishable; synchronized text alone SHALL NOT prove implementation. An active change SHALL NOT be archived merely because its Proposal merged.

#### Scenario: Reader asks what the project currently requires
- **WHEN** a reader inspects the current specification set
- **THEN** integrated accepted requirements are available without reconstructing them from every historical Proposal, and pending changes or undelivered requirements are not represented as implemented behavior

#### Scenario: Proposal is accepted before implementation
- **WHEN** a planning PR merges but its change still has incomplete design or delivery
- **THEN** the change remains active and the merge is not reported as a completed release or archive

### Requirement: Reconcile affected requirements without rewriting history

The workflow SHALL guide changes to applicable current Specs through native delta operations and assess affected requirement and decision references. When replacing a requirement, the complete resulting behavior contract SHALL be retained, including applicable scenarios. Historical archived planning SHALL remain unchanged by later follow-up work. Missing or obsolete references SHALL be surfaced for review rather than silently treated as valid context.

#### Scenario: Requirement changes but an old guarantee remains
- **WHEN** a change modifies part of an existing requirement
- **THEN** the resulting delta preserves the rest of the agreed contract and its relevant scenarios, or explicitly proposes their removal

#### Scenario: Later request changes an archived feature
- **WHEN** a new request materially changes a feature whose original change is archived
- **THEN** a new active change targets the current requirement and references history as evidence instead of revising the archived plan

### Requirement: Pilot readable goal-to-behavior references

This project SHALL express L1 goals, L2 capabilities and L3 concrete behavior with ordinary readable references, while remaining compatible with native OpenSpec capability Specs. The pilot SHALL NOT require a new generic layer schema, cross-level enforcement engine or layer-based approval policy. The same formal content SHALL be readable by humans and available to tooling without a duplicate human-only specification set.

#### Scenario: Reviewer traces behavior to purpose
- **WHEN** a reviewer opens a capability's concrete behavior contract
- **THEN** the reviewer can follow ordinary references to its capability and goal basis and identify related contracts without a bespoke hierarchy database

#### Scenario: Pilot is extended into generic enforcement
- **WHEN** a later request proposes automated layer constraints or layer-specific routing
- **THEN** it is handled as a later formal change rather than silently added to this minimum release

### Requirement: Formal files remain the reconstructible authority

Final formal requirements, decisions and necessary repo relationships SHALL be versioned, English-language, human-readable files. Tools SHALL operate from these files and explicit GitHub work records without a required authoritative database or access to the originating conversation. Execution logs and review discussions SHALL remain collaboration evidence rather than a second committed rule set. Optional caches SHALL be disposable and reconstructible.

#### Scenario: Fresh reviewer has no local database
- **WHEN** a reviewer checks out the repo and obtains the applicable GitHub records
- **THEN** authoritative context is available without restoring an uncommitted database or private conversation
