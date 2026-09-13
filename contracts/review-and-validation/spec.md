# Validation and Context Specification

## Purpose

L2: provide mechanical evidence and bounded original context for the consumer's
chosen worker/reviewer. Supports
[shared facts](../workflow-goals/spec.md#requirement-shared-facts-support-human-and-machine-judgment).
This capability does not prescribe review methods or orchestrate reviewers.

## Requirements

### Requirement: Separate mechanical findings from semantic judgment
Checks SHALL distinguish structural errors, unavailable inputs and semantic-review
questions. Shape, source presence, typed links, state and hash equality SHALL NOT
prove correct meaning, source authority, genuine independence or merge permission.

#### Scenario: Structurally complete but misleading change
- **WHEN** every required field exists but its conclusion contradicts the source
- **THEN** the diagnostic supplies source context without claiming semantic validity.

### Requirement: Preflight the complete publication carrier locally
The validate command SHALL check a complete Issue/PR/evidence Markdown body through
the canonical parser and schema without setup, authentication or network.
Exactly one JSON fence beneath one level-two Workflow context heading is required.
An optional intended JSON object SHALL be compared by structured equality.

#### Scenario: JSON is valid but its heading is not discoverable
- **WHEN** a review uses an unsupported heading or a quoted example as its carrier
- **THEN** preflight rejects it with the canonical heading guidance, without
  promoting arbitrary JSON or requiring a remote check.

### Requirement: Build focused review context with visible limits
Inspect SHALL return a paginated, byte-bounded inventory rooted in selected work,
with explicit source revisions, anchors, relationships and exclusions. Default
inline depth is one and response budget is 65536 bytes unless narrowed.
References outside depth/budget or access SHALL remain distinguishable.

#### Scenario: Focused packet omits a needed dependency
- **WHEN** a reviewer needs a discovered reference beyond inline depth
- **THEN** explicit expansion can request it within current source permissions;
  absence from inline content is not a declaration of irrelevance.

#### Scenario: Whole-change context exceeds one page
- **WHEN** the source inventory requires pagination
- **THEN** cursors are bound to its snapshot and stale pages cannot be mixed;
  irreducible metadata overflow is reported, not silently truncated.

### Requirement: Keep review evidence specific without prescribing methods
Review evidence SHALL bind its actual subject and, for a PR, the complete
head/base/policy tuple. It SHALL declare distinct producer/reviewer sessions.
New configuration SHALL NOT require model, depth, provider or a second review.
Explicitly configured legacy constraints SHALL still be checked, not waived.

#### Scenario: Consumer has no model or depth policy
- **WHEN** valid scoped evidence has distinct sessions and no model/depth fields
- **THEN** it can qualify structurally without those fields or provider dispatch.

#### Scenario: Consumer explicitly restricts eligible models
- **WHEN** evidence violates that accepted constraint
- **THEN** the check reports it; the new default does not relax existing policy.

### Requirement: Canonical verdicts do not erase historical assessments
New review publications SHALL use pass, fail, revise or incomplete as result,
with explanation outside the result literal. Historical descriptive results SHALL
remain readable but SHALL NOT be interpreted as canonical pass. Noncurrent
same-PR assessments SHALL remain visible with their exclusion reasons.

#### Scenario: Old explanatory PASS needs clarification
- **WHEN** a historical review result is descriptive prose
- **THEN** it has an actionable review-verdict-invalid diagnostic and no passing
  credit; a separate source-linked canonical clarification can retain its original
  tuple without changing the old bytes.

#### Scenario: Previous version passed
- **WHEN** head/base/policy changes invalidate prior applicability
- **THEN** old evidence stays in context but cannot supply current passing credit;
  a newer pass does not mechanically settle earlier semantic findings.

### Requirement: Context and check operations preserve a read-only trust boundary
Inspect/check SHALL only read permitted typed sources, never execute source text
or write tickets, reviews, merges or archives. One operation SHALL share repeated
source acquisition and separately recheck mutable-source freshness. Current
permissions SHALL be checked before cached returns and historical reads.

#### Scenario: A ticket contains executable instructions
- **WHEN** such content is retrieved
- **THEN** it remains untrusted context rather than an instruction to execute.

### Requirement: Tool availability is distinguished from missing evidence
Transport/authentication/unsupported-runtime failures SHALL remain unavailable
rather than proof that evidence is absent or corrupt.

#### Scenario: Historical policy requires an unsupported format
- **WHEN** this runtime cannot reconstruct it
- **THEN** original bytes and audit context remain visible without retroactively
  revoking acceptance or claiming verified delivery.
