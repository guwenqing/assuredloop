## Purpose

L1 goal: Turn incoming requests into proportionate, explicitly owned work without treating uncertainty as permission to implement. L2 capability: work intake and planning. The requirements and scenarios below express its L3 behavior contracts. Origin: [accepted goal and routing decisions](https://github.com/guwenqing/assuredloop-base/blob/55e73ccb3ed83ede943f135a5977308cfdff1408/openspec/changes/establish-project-workflow/proposal.md#what-changes).

## ADDED Requirements

### Requirement: Preserve and triage the incoming request

The workflow SHALL accept a rough request as a GitHub Issue and guide initial exploration before assigning an execution route. Triage SHALL preserve the original request, distinguish confirmed context from assumptions and open questions, record the routing rationale, and identify the next responsible owner. A route or activity label SHALL NOT imply implementation authorization.

#### Scenario: Request is incomplete
- **WHEN** the incoming Issue omits information needed to choose a responsible next step
- **THEN** triage records the gaps and requests clarification or proposes bounded research without inventing accepted requirements

#### Scenario: Existing context is sufficient
- **WHEN** exploration establishes that work fits accepted context and has no material unresolved scope question
- **THEN** the Issue is enriched with that context and routed to bounded Task/Bug work rather than requiring an unnecessary new Proposal

### Requirement: Route formal planning separately from implementation

The workflow SHALL route work requiring new or materially changed agreement through deeper exploration and an OpenSpec Proposal. Planning/design work and implementation work SHALL use distinct, independently assignable Issues with identified owners, inputs and expected outputs. Planning SHALL NOT authorize business-code edits. Task decomposition SHALL connect implementation work to relevant requirements and decisions, not only to an Epic parent.

#### Scenario: Request needs a new capability
- **WHEN** triage identifies clear work that changes accepted requirements
- **THEN** it routes the request to Epic planning, where the responsible owner develops a formal change before handing off scoped implementation work

#### Scenario: Planning is handed to another owner
- **WHEN** the planning owner prepares implementation Issues
- **THEN** each Issue identifies the agreed context, intended deliverable, acceptance evidence and relevant plan references, and can be assigned independently of the planning Issue

### Requirement: Keep continuous planning in one scoped Task

For Epic work, the workflow SHALL keep an explicit planning Task separate from the parent request's overall delivery and from implementation Tasks. That planning Task SHALL cover the continuous work of deeper exploration, Proposal, Specs, Design, implementation-task decomposition and handoff. Moving between these stages, publishing another planning PR or obtaining another review SHALL NOT by itself create a new Issue or complete the planning Task. A further split SHALL identify a meaningful separately assignable outcome or responsibility and its relationship to the existing work. The workflow SHALL make that rationale available for review rather than treating a new file or stage as sufficient justification.

#### Scenario: Proposal merges before Design is finished
- **WHEN** a planning Task has delivered an accepted Proposal but still owes Design, decomposition or handoff
- **THEN** the same Task remains open, subsequent planning PRs reference it, and the parent request remains open for overall delivery

#### Scenario: Planning contains independently assignable work
- **WHEN** further decomposition identifies a meaningful separate planning outcome or responsibility
- **THEN** the owner can create linked work with explicit scope, handoff and split rationale rather than being forced to put all planning in one oversized Task

#### Scenario: Stage-only split is proposed
- **WHEN** the sole reason for a new planning Issue is that work has moved from Proposal to Specs or Design
- **THEN** the work continues in the existing planning Task and review identifies the proposed split as unnecessary

### Requirement: Bound research and return decisions to the human

The workflow SHALL support Spikes with explicit questions, research boundaries and expected evidence, without requiring a predetermined positive conclusion. Uncertain work and oversized work needing decomposition into independently scoped requests SHALL be eligible for a Spike. Triage SHALL normally use that route for oversized work even if its overall goal is clear, and SHALL explain any alternative. Research SHALL report conclusions, limitations and unresolved questions, then return to the human. Closing a Spike SHALL NOT create or authorize successor requests or implementation automatically.

#### Scenario: Large clear goal needs decomposition
- **WHEN** a clear request is too broad for one responsible delivery plan
- **THEN** a bounded Spike can recommend several requests and close on that research result, leaving the decision to create them to the human

#### Scenario: Research finds no viable answer
- **WHEN** a Spike produces negative or inconclusive findings within its agreed scope
- **THEN** those findings can constitute its research deliverable without being misreported as implementation success

### Requirement: Active-plan additions return to the active-plan owner

The workflow SHALL route proposed additions to an ongoing change to its responsible planning owner for impact assessment and plan reconciliation. Accepted additions SHALL receive the same context and traceability obligations as originally decomposed work. An implementer SHALL NOT silently expand the accepted agreement by adding a ticket.

#### Scenario: New task belongs to an active Epic
- **WHEN** a Task/Bug reveals additional work within an ongoing change
- **THEN** the active-plan owner assesses whether to update the plan within scope or return a material Proposal change for human review before authorizing the addition

### Requirement: Implementation-only handling preserves the accepted agreement

The workflow SHALL permit a follow-up without a new Proposal only when it implements, restores or improves the solution within accepted requirements, constraints and material design decisions. Meaning-preserving wording edits alone SHALL NOT force a new Proposal. The work SHALL reference relevant prior work and current context, explain the claimed boundary, and submit that claim to independent review. Neither a small diff nor unchanged spec files SHALL prove that the agreement is unchanged. Work changing that agreement SHALL return to Proposal review.

#### Scenario: Bug restores accepted behavior
- **WHEN** a follow-up restores documented behavior without changing constraints or material design decisions
- **THEN** it can proceed with the existing basis, a link to the relevant prior work and evidence for the implementation-only claim, without editing an archived plan

#### Scenario: Small patch changes a guarantee
- **WHEN** a one-line change would weaken an accepted guarantee
- **THEN** it is treated as an agreement change despite its size and cannot use the implementation-only route

#### Scenario: No relevant specification exists
- **WHEN** bounded maintenance legitimately has no applicable Spec
- **THEN** the Issue supplies its request context and an explicit reason instead of a fabricated Spec link, and review assesses that reason under [review and validation](../review-and-validation/spec.md)
