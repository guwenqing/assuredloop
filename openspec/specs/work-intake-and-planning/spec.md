# Work Intake and Planning Specification

## Purpose

Turn incoming requests into proportionate, explicitly owned work without treating uncertainty as permission to implement. This L2 capability supports the shared [L1 goal](../workflow-goals/spec.md#requirement-work-is-traceable-and-proportionate). Its requirements and scenarios below define L3 behavior.

## Requirements

### Requirement: Preserve and triage the incoming request

The workflow SHALL accept a rough request as a GitHub Issue and guide initial exploration before assigning an execution route. Triage SHALL preserve the original request, distinguish confirmed context from assumptions and open questions, record the routing rationale, and identify the next responsible owner. A route, work selector or category label SHALL NOT imply implementation authorization.

#### Scenario: Request is incomplete
- **WHEN** the incoming Issue omits information needed to choose a responsible next step
- **THEN** triage records the gaps and requests clarification or proposes bounded research without inventing accepted requirements

#### Scenario: Existing context is sufficient
- **WHEN** exploration establishes that work fits accepted context and has no material unresolved scope question
- **THEN** the Issue is enriched with that context and routed to bounded Task/Bug work rather than requiring an unnecessary new Proposal

### Requirement: Route formal planning separately from implementation

The workflow SHALL route work requiring new or materially changed agreement through deeper exploration and an OpenSpec Proposal. Planning/design work and implementation work SHALL use distinct, independently assignable Issues with identified owners, inputs and expected outputs. Planning SHALL NOT authorize business-code edits. Task decomposition SHALL connect implementation work to relevant requirements and decisions, not only to an Epic parent.

For Epic work, an explicit planning Task SHALL remain separate from the parent request's overall delivery and cover continuous exploration, Proposal, Specs, Design, decomposition and handoff. Artifact stages, additional PRs and review rounds SHALL NOT by themselves require new Issues or complete that Task. Further splits SHALL identify meaningful separately assignable outcomes or responsibilities and their relationship to existing work, with the rationale available for review.

Planning/design/decomposition and owner-led aggregate closeout SHALL use the formal Architecture Task category, with `plan` and `closeout` guidance respectively. Ordinary delivery SHALL remain Task work and restoring accepted behavior SHALL remain Bug work. Classification SHALL describe the assigned outcome rather than the person's role or whether the edited files are code or documentation. These types SHALL follow the [category/activity contract](../github-work-traceability/spec.md#requirement-work-categories-and-activities-are-formally-consistent), not an optional display distinction.

#### Scenario: Request needs a new capability
- **WHEN** triage identifies clear work that changes accepted requirements
- **THEN** it routes the request to Epic planning, where the responsible owner develops a formal change before handing off scoped implementation work

#### Scenario: Planning is handed to another owner
- **WHEN** the planning owner prepares implementation Issues
- **THEN** each Issue identifies the agreed context, intended deliverable, acceptance evidence and relevant plan references, and can be assigned independently of the planning Issue

#### Scenario: Proposal merges before Design is finished
- **WHEN** a planning Task has delivered an accepted Proposal but still owes Design, decomposition or handoff
- **THEN** the same Task remains open, subsequent planning PRs reference it, and the parent request remains open for overall delivery

#### Scenario: Planning contains independently assignable work
- **WHEN** further decomposition identifies a meaningful separate planning outcome or responsibility
- **THEN** the owner can create linked work with explicit scope, handoff and split rationale rather than being forced to put all planning in one oversized Task

#### Scenario: Reviewed planning is ready for implementation
- **WHEN** Design, the scoped implementation Tasks and handoff have passed their applicable checks and review
- **THEN** the planning Task can complete, developers take the implementation Tasks, and the parent Epic stays open for delivery and a separate owner-led closeout Task

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

The owner SHALL assess additions against the agreed outcome, allowing necessary bounded refinement without treating an active Proposal as unlimited scope. Material expansion SHALL return to the required human decision. Work outside that outcome SHALL remain explicitly deferred for a future Proposal rather than silently become current delivery obligations or completed work.

#### Scenario: New task belongs to an active Epic
- **WHEN** a Task/Bug reveals additional work within an ongoing change
- **THEN** the active-plan owner assesses whether to update the plan within scope or return a material Proposal change for human review before authorizing the addition

#### Scenario: Useful idea exceeds the current outcome
- **WHEN** work discovers an improvement outside the accepted release scope
- **THEN** the owner records it as deferred follow-up for a future Proposal, without automatically expanding the current task set or claiming the improvement delivered

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
