# Workflow Goals Specification

## Purpose

Provide the shared L1 goals and constraints for AssuredLoop Base. These goals govern the L2 capabilities linked below; those capabilities contain the L3 behavior requirements and scenarios. This is ordinary OpenSpec content, not a new layer schema. Origin: [expanded Proposal at the owner-accepted revision](https://github.com/guwenqing/assuredloop-base/blob/5c1f33a26b5f106d594b11be46764b2ad23b6322/openspec/changes/establish-project-workflow/proposal.md), with [Wenqing's B4 acceptance recorded on PR #5](https://github.com/guwenqing/assuredloop-base/pull/5#issuecomment-5576464303). Acceptance of that scope is distinct from acceptance of subsequent design-review corrections.

## Requirements

### Requirement: Work is traceable and proportionate

The project SHALL make supported work traceable from its originating request through agreed requirements, responsible work, actual delivery and acceptance, while keeping the path proportionate to uncertainty and scope. Work records SHALL enable responsible handoff rather than multiply for each document or review stage. Supporting capabilities: [intake and planning](../work-intake-and-planning/spec.md) and [GitHub work traceability](../github-work-traceability/spec.md).

#### Scenario: A different executor takes over
- **WHEN** a new executor takes an existing work item
- **THEN** its formal basis, scope, current work and remaining acceptance obligations can be recovered without the previous executor's private conversation

### Requirement: Shared facts support human and machine judgment

The project SHALL keep formal requirements and necessary repo relationships in readable versioned files, with operational work and review evidence in the declared GitHub records. Mechanical checks SHALL expose formal omissions and inconsistencies and support focused AI review; they SHALL NOT replace semantic judgment or required human decisions. Supporting capabilities: [specification baseline](../specification-baseline/spec.md) and [review and validation](../review-and-validation/spec.md).

#### Scenario: Complete records contain a wrong conclusion
- **WHEN** all required records exist but delivery does not satisfy the agreed requirement
- **THEN** semantic review can reject the conclusion despite successful structural checks

### Requirement: Reuse supports governed evolution

The project SHALL reuse OpenSpec and supported extensions to provide a usable single-repo minimum with project extensibility, practical work guidance and an explicit transition to governing its own changes. It SHALL NOT require a forked core, a parallel workflow engine, an authoritative database, a fixed bot topology or multi-repo scheduling in the minimum. Supporting capabilities: [workflow adoption](../project-workflow-adoption/spec.md) and [self-evolution](../workflow-self-evolution/spec.md).

#### Scenario: Project conventions need detail
- **WHEN** a project specializes an accepted workflow convention
- **THEN** it can do so through the active traced workflow and applicable review rather than replacing the underlying specification system
