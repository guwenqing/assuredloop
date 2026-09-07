## Purpose

Let an executor adopt and use the workflow through practical work-category guidance while reusing OpenSpec. This L2 capability supports the shared [L1 goal](../workflow-goals/spec.md#requirement-reuse-supports-governed-evolution). Its requirements and scenarios below define L3 behavior.

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

For its supported work, the guidance SHALL explain what context to read, the meanings and relationships of the applicable work records, the decisions the executor must make, how to create or update the expected artifacts and associations, and how to check, review, hand off and complete the work. These conventions SHALL be available through the Skill and its authoritative references, not assumed from a role title or private conversation. Issue continuity and decomposition are examples of those conventions within planning work, not a separate Skill category.

#### Scenario: Executor triages a request
- **WHEN** an executor selects the request-triage work guidance
- **THEN** it explains how to preserve and enrich the Issue, distinguish assumptions, assess the route, update required context and hand off the result

#### Scenario: Planner creates implementation Issues
- **WHEN** an executor turns an agreed plan into scoped implementation work
- **THEN** its guidance explains the existing request and planning Task, the agreed basis for decomposition, the required context and requirement/decision associations of the resulting Issues, and their ownership, verification and handoff expectations under [formal planning](../work-intake-and-planning/spec.md#requirement-route-formal-planning-separately-from-implementation)

#### Scenario: Maintainer changes a workflow rule
- **WHEN** work changes the methodology or a traced repo artifact rather than business code
- **THEN** a relevant work-category Skill still governs the change and its review; it is not exempt because it is documentation or process work

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

All executable tooling scripts authored for this extension SHALL run on Node.js, matching the upstream tool's runtime. Reusable scripts, Skills and templates SHALL resolve the target's identity, paths, Issue references and configurable conventions from explicit inputs, target configuration or native OpenSpec context. AssuredLoop Base's own consumer data SHALL NOT be baked into reusable behavior. Installed guidance SHALL use resolved target references or explicit placeholders and SHALL NOT treat the framework source repository as the consumer's project. Missing required bindings SHALL produce a clear setup/context error rather than a fallback to this repo's data.

An adopting project SHALL have access to the pinned framework's workflow contracts independently of its own product requirements. Framework contracts SHALL NOT be injected into the consumer's current specification baseline, and their packaged copies SHALL remain derived from an identified canonical revision rather than become another authored rule source.

The toolkit SHALL be distributable as a versioned npm package with a Node.js CLI and explicit project initialization. An installed package SHALL contain the runtime, schemas, templates, reusable Skill sources and identified framework contracts needed for adoption without cloning the source repo. Initialization SHALL write only the agreed target configuration/discovery artifacts and SHALL preserve the consumer's own work. Packed artifacts SHALL exclude consumer instance configuration, project change history, credentials and execution logs.

#### Scenario: One person coordinates multiple work categories
- **WHEN** a project uses one coordinator instead of dedicated PM and Architect bots
- **THEN** the Skills remain usable, while planning/implementation assignment and producer/reviewer separation remain explicit

#### Scenario: A project wants stricter behavior
- **WHEN** the project proposes stronger local workflow obligations
- **THEN** those obligations enter the same traced change and validation process instead of silently changing inherited instructions

#### Scenario: A different repository adopts the workflow
- **WHEN** a target has a different directory, GitHub identity, Issue numbers and configured label names from AssuredLoop Base
- **THEN** the same scripts and Skills operate on that target through its bindings without source edits, copied source-project work data or unintended access to the framework's Issues

#### Scenario: Target binding is incomplete
- **WHEN** a work operation lacks the required target context
- **THEN** it reports the missing binding and does not guess this project's repository, paths or Issue identifiers

#### Scenario: Consumer checks its own product change
- **WHEN** a consumer uses an installed framework version without the original source checkout
- **THEN** guidance resolves the framework rules from that pinned installation and the consumer's requirements from its own OpenSpec context, without adding the framework's product Specs to the consumer baseline

#### Scenario: Packed CLI initializes an unrelated project
- **WHEN** the packed npm artifact is installed and invoked against a new consumer fixture
- **THEN** its CLI can initialize and inspect that target using the packaged assets and explicit bindings, without copying AssuredLoop's own project records or requiring its source checkout
