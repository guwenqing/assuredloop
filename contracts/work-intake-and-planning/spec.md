# Work Context Specification

## Purpose

L2: connect work context to the current product definition and native OpenSpec
artifacts without prescribing a planning method or dividing work among roles.
Supports [traceable work](../workflow-goals/spec.md#requirement-work-is-traceable-and-proportionate).

## Requirements

### Requirement: Preserve the originating context
Work records SHALL preserve references to original requests and later decisions.
Context acquisition SHALL retain the full selected Issue body and all comment
pages, distinguishing missing access from complete coverage. Source text SHALL NOT
gain authority merely because it appears later in a discussion.

#### Scenario: Request is incomplete
- **WHEN** a rough request has unresolved scope
- **THEN** it may remain unstructured intake; the tool does not invent a decision,
  create a Proposal, route an agent or start implementation.

### Requirement: Formal scope remains native
Current requirements and accepted change/task definitions SHALL remain in native
OpenSpec files. Work records SHALL reference relevant fixed basis and native task
items rather than duplicate their bodies. Optional change identifiers SHALL name
real changes, not fabricated absence markers.

#### Scenario: Planning and implementation have different owners
- **WHEN** separate work records refer to the same accepted native change
- **THEN** their references preserve each assigned contribution without requiring
  one combined work record or an extra Issue per artifact stage.

### Requirement: Implementation-only handling preserves the accepted agreement
An implementation-only follow-up MAY reference existing Specs and prior delivery
without a new Proposal. An empty basis SHALL require a nonempty no_spec_reason.
The tool SHALL expose this claim and affected context for semantic assessment;
diff size or unchanged Spec files SHALL NOT prove the exemption.

#### Scenario: Small patch changes a guarantee
- **WHEN** a one-line patch claims no specification impact
- **THEN** the claim and linked requirements remain visible to the reviewer; the
  validator does not certify the claim's meaning from patch size.

### Requirement: Research and active-plan changes retain their status
Research conclusions and informal notes SHALL remain distinct from accepted
requirements. Amendments to active native work SHALL retain their source and
affected associations; later work SHALL NOT rewrite archived plans merely to
attach a new ticket. The consumer decides authorization and workflow.

#### Scenario: Research suggests a new capability
- **WHEN** a source contains a recommendation
- **THEN** retrieval presents it as context, not an accepted requirement or an
  instruction to create successor work.
