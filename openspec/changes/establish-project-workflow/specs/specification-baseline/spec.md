## Purpose

Keep a readable current requirement set in addition to the history of individual changes. This L2 capability supports the shared [L1 goal](../workflow-goals/spec.md#requirement-shared-facts-support-human-and-machine-judgment). Its requirements and scenarios below define L3 behavior.

## ADDED Requirements

### Requirement: Keep current requirements distinct from change history

The workflow SHALL use native OpenSpec current specifications and change deltas rather than a parallel specification store. Accepted deltas SHALL be integrated through the native synchronization/archive workflow at the agreed lifecycle point, with validation and review of the resulting current requirements. Proposed, accepted and delivered state SHALL remain distinguishable; synchronized text alone SHALL NOT prove implementation. An active change SHALL NOT be archived merely because its Proposal merged.

For this release, the current specification set SHALL represent the integrated contract of completed changes. Accepted work still being implemented SHALL remain visible in the active change. At delivery closeout, the change owner SHALL synchronize the complete delta and verify the resulting baseline before archive and overall completion.

#### Scenario: Reader asks what the project currently requires
- **WHEN** a reader inspects the current specification set
- **THEN** integrated accepted requirements are available without reconstructing them from every historical Proposal, and pending changes or undelivered requirements are not represented as implemented behavior

#### Scenario: Proposal is accepted before implementation
- **WHEN** a planning PR merges but its change still has incomplete design or delivery
- **THEN** the change remains active and the merge is not reported as a completed release or archive

### Requirement: Reconcile affected requirements without rewriting history

The workflow SHALL guide changes to applicable current Specs through native delta operations and assess affected requirement and decision references. When replacing a requirement, the complete resulting behavior contract SHALL be retained, including applicable scenarios. Historical archived planning SHALL remain unchanged by later follow-up work. Missing or obsolete references SHALL be surfaced for review rather than silently treated as valid context.

Requirement-heading changes SHALL include repair of affected current inbound references and a reviewable old/new mapping; immutable historical links SHALL retain their historical identity rather than silently be redirected to unrelated content.

#### Scenario: Requirement changes but an old guarantee remains
- **WHEN** a change modifies part of an existing requirement
- **THEN** the resulting delta preserves the rest of the agreed contract and its relevant scenarios, or explicitly proposes their removal

#### Scenario: Later request changes an archived feature
- **WHEN** a new request materially changes a feature whose original change is archived
- **THEN** a new active change targets the current requirement and references history as evidence instead of revising the archived plan

### Requirement: Owner-led closeout verifies the integrated specification

An Epic SHALL have a separately assignable closeout Task owned by its responsible change owner after implementation work. The Task SHALL assess aggregate delivery, reconcile current Specs with the full accepted change, validate the synchronized result and obtain independent AI review of its PR before completing archive and closing the Epic. The PR SHALL follow the same applicable pre-merge obligations as other work, including later configured automation; the initial release executes checks and review explicitly. Missing or incorrect synchronization SHALL block closeout even when all developer Issues are closed. Acceptance failures SHALL return to the responsible work rather than be hidden by closing the Epic.

#### Scenario: Child Tasks are closed but one requirement was not integrated
- **WHEN** aggregate closeout finds that an accepted delta is missing from the proposed current specification
- **THEN** closeout remains incomplete, the discrepancy is reported and corrected, and the final synchronized revision is checked and reviewed before merge

#### Scenario: Closeout is ready
- **WHEN** aggregate delivery and synchronization have passed applicable checks, independent review and required human decisions
- **THEN** the owner can merge the closeout PR, confirm the merged state and archive result, and close the closeout Task followed by the Epic

### Requirement: Pilot readable goal-to-behavior references

This project SHALL express L1 goals, L2 capabilities and L3 concrete behavior with ordinary readable references, while remaining compatible with native OpenSpec capability Specs. The pilot SHALL NOT require a new generic layer schema, cross-level enforcement engine or layer-based approval policy. The same formal content SHALL be readable by humans and available to tooling without a duplicate human-only specification set.

#### Scenario: Reviewer traces behavior to purpose
- **WHEN** a reviewer opens a capability's concrete behavior contract
- **THEN** the reviewer can follow ordinary references to its capability and goal basis and identify related contracts without a bespoke hierarchy database

#### Scenario: Pilot is extended into generic enforcement
- **WHEN** a later request proposes automated layer constraints or layer-specific routing
- **THEN** it is handled as a later formal change rather than silently added to this minimum release

### Requirement: Formal files remain the reconstructible authority

Final formal requirements, decisions and necessary repo relationships SHALL be versioned, English-language, human-readable files. Tools SHALL operate from these files and explicit GitHub work records without a required authoritative database or access to the originating conversation. Execution logs and full review discussions SHALL remain collaboration evidence rather than a second committed rule set. A compact final acceptance/fixity manifest is a versioned delivery record, not a full log or duplicate policy. Optional caches SHALL be disposable and reconstructible.

#### Scenario: Fresh reviewer has no local database
- **WHEN** a reviewer checks out the repo and obtains the applicable GitHub records
- **THEN** authoritative context is available without restoring an uncommitted database or private conversation

### Requirement: Closeout preserves acceptance evidence fixity

The closeout candidate SHALL include a versioned manifest identifying accepted delivery Issue/PR references, evidence comment identifiers, assessed revisions, results, scope and captured-content digests, including planning delivery. It SHALL move with the archived change and SHALL be checked against captured source evidence before acceptance. Full logs SHALL remain external. The manifest SHALL NOT claim that its own future merge or post-merge review already happened. Later changed or unavailable source evidence SHALL be reported as drift or unavailability, not silently accepted; a digest SHALL NOT be claimed to reconstruct missing content or authenticate a human decision.

Each digest SHALL identify its reproducible source representation, including the adapter endpoint/field and decoding/encoding rules. Typed self-change decisions SHALL retain their decision fields and discriminator in separate decision entries rather than be converted into a delivery head/result. A valid decision's integrity SHALL NOT prove its selected work has been performed.

#### Scenario: An accepted evidence comment changes later
- **WHEN** a fetched comment differs from the body captured by the committed manifest
- **THEN** revalidation reports evidence drift while preserving the prior recorded summary and digest at its Git revision

#### Scenario: Captured evidence disappears
- **WHEN** a manifest reference can no longer be fetched
- **THEN** the prior fixity record remains readable but the source is reported unavailable and no complete revalidation PASS is claimed

#### Scenario: A verifier uses a different comment rendering
- **WHEN** one client displays rendered text or normalizes line endings instead of the recorded raw body representation
- **THEN** verification reacquires the specified field/representation for hashing rather than treating a display transformation as evidence drift or silently changing the digest rule
