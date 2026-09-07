## Purpose

L1 goal: Let an executor adopt and use the workflow through practical work-category guidance while reusing OpenSpec. L2 capability: project workflow adoption. The requirements and scenarios below express its L3 behavior contracts. Origin: [accepted Skill and adoption decisions](https://github.com/guwenqing/assuredloop-base/blob/55e73ccb3ed83ede943f135a5977308cfdff1408/openspec/changes/establish-project-workflow/proposal.md#what-changes).

## ADDED Requirements

### Requirement: Reuse native workflow behavior and extend demonstrated gaps

Adoption SHALL use native OpenSpec tooling and Skills where they fulfill the agreed work. Extensions SHALL supplement uncovered behavior through supported integration rather than forking, copying the core or replacing existing mechanisms with a parallel engine. Users SHALL be able to identify which behavior is native and which is a project extension.

#### Scenario: Native Skill already handles an artifact operation
- **WHEN** an operation is adequately covered by a native OpenSpec Skill
- **THEN** project guidance reuses that Skill and supplies only the additional project context or obligations that are missing

#### Scenario: GitHub handoff is not covered natively
- **WHEN** an operation requires Issue context or associations not supplied by native instructions
- **THEN** the extension supplies that guidance without claiming the upstream tool already implements it

### Requirement: Cover traced mutations through coherent work-category Skills

Every major category of work that creates or changes traceable content SHALL have usable Skill guidance, including Issue handling, repository-artifact changes and changes to the workflow itself. Skills SHALL be organized by coherent work rather than mandatory bot titles or a fixed count. Individual field edits, links and status updates SHALL be guided steps within the relevant work, not mandatory standalone Skills. Skill guidance SHALL identify its input, allowed scope, output and handoff boundaries, including planning versus implementation and independent review.

#### Scenario: Executor triages a request
- **WHEN** an executor selects the request-triage work guidance
- **THEN** it explains how to preserve and enrich the Issue, distinguish assumptions, assess the route, update required context and hand off the result

#### Scenario: Planner creates implementation Issues
- **WHEN** an executor turns an agreed plan into scoped implementation work
- **THEN** its guidance explains the required context, requirement/decision associations, ownership and evidence expectations for the resulting Issues

#### Scenario: Maintainer changes a workflow rule
- **WHEN** work changes the methodology or a traced repo artifact rather than business code
- **THEN** a relevant work-category Skill still governs the change and its review; it is not exempt because it is documentation or process work

### Requirement: Planning guidance governs Issue continuity and decomposition

The planning/decomposition work-category Skill SHALL teach the executor how to find and continue the responsible planning Task, relate multiple planning PRs to it, and decide whether additional Issues are justified under [continuous planning](../work-intake-and-planning/spec.md#requirement-keep-continuous-planning-in-one-scoped-task). It SHALL guide creation of independently assignable implementation work, requirement/decision references, split rationale, handoff and evidence-backed closure. These SHALL be steps of coherent planning work, not a mandatory separate Skill for each Issue operation. Native artifact guidance SHALL be supplemented where it does not cover these GitHub work relationships.

#### Scenario: Fresh executor starts Design after Proposal merge
- **WHEN** an executor without the original conversation uses the planning Skill to continue an existing change
- **THEN** the guidance leads it to the still-responsible planning Task and required context instead of creating a new Issue merely for the next artifact

#### Scenario: Verification challenges an unnecessary split
- **WHEN** representative guided-work verification supplies a proposed split justified only by a new planning stage
- **THEN** independent review assesses the split against the referenced rule and reports the violation; mechanical checks only establish required context and rationale presence, not whether the rationale is sound

### Requirement: Creation guidance and validation share authoritative contracts

The applicable formats, required fields, references, statuses and completion evidence SHALL be discoverable from the relevant Skill through authoritative contracts or templates, together with applicable checks and failure handling. Rules SHALL NOT exist only in validator code or be independently duplicated across Skills. Executors SHALL be able to distinguish a mechanical failure they can correct from a semantic or authority question that needs review or human input.

#### Scenario: Executor has no original conversation
- **WHEN** an executor has the declared task context and uses the installed Skill and its references
- **THEN** it can create or update a conforming artifact and run the applicable checks without guessing hidden requirements from validator errors

#### Scenario: A contract becomes stricter
- **WHEN** a change adds a required association
- **THEN** review checks that the authoritative rule, creation guidance, applicable validation and affected templates agree before that rule is accepted as usable

### Requirement: Scripts remain governed execution helpers

If a script assists traceable work, the relevant Skill SHALL explain when and how to invoke it, its intended inputs and side effects, expected output, and interpretation of failure or incomplete results. A script SHALL NOT replace the work-category guidance or expand the executor's authority. A successful exit code SHALL NOT be represented as semantic acceptance.

#### Scenario: Helper cannot fetch a required Issue
- **WHEN** a helper returns an incomplete context result because an Issue is unavailable
- **THEN** the Skill guides the executor to report or resolve the missing input and prohibits treating the incomplete output as sufficient review evidence

### Requirement: Verify adoption through representative guided work

Adoption verification SHALL exercise the major supported work categories using only declared task context, Skills and their referenced contracts. It SHALL include conforming work and representative missing-context, broken-reference or unsupported-completion cases. Unexplained guidance gaps SHALL be findings even if an expert with private conversation history could finish the work. Review/run records SHALL remain external collaboration evidence, not a second committed rules ledger.

#### Scenario: Validator expects a field the Skill never exposes
- **WHEN** a fresh executor follows the guidance but cannot discover a required field or reference
- **THEN** verification reports a guidance-contract defect rather than blaming the executor or weakening the valid requirement

### Requirement: Adopt per project without prescribing a bot platform

The minimum SHALL support self-use in one repo with explicit project policy and extension points. Policy SHALL distinguish project choices from repository bindings without requiring multiple repos or bot scheduling in this release. Users SHALL be able to assign the same work categories to different people or agents while preserving ownership and review independence. Setup SHALL make the active obligations and deferred automation visible and SHALL NOT require an authoritative database.

#### Scenario: One person coordinates multiple work categories
- **WHEN** a project uses one coordinator instead of dedicated PM and Architect bots
- **THEN** the Skills remain usable, while planning/implementation assignment and producer/reviewer separation remain explicit

#### Scenario: A project wants stricter behavior
- **WHEN** the project proposes stronger local workflow obligations
- **THEN** those obligations enter the same traced change and validation process instead of silently changing inherited instructions
