# Toolkit Adoption Specification

## Purpose

L2: install a reusable OpenSpec traceability/context extension without replacing
the consumer's workflow. Supports the
[narrow toolkit boundary](../workflow-goals/spec.md#requirement-reuse-supports-a-narrow-toolkit-boundary).

## Requirements

### Requirement: Reuse native workflow behavior and extend demonstrated gaps
The toolkit SHALL reuse pinned OpenSpec planning/parsing/task/synchronization
facilities. It SHALL NOT fork native behavior to recreate a separate SDD system
or copy framework requirements into consumer product Specs.

#### Scenario: Native Skill already handles an artifact operation
- **WHEN** the consumer creates or synchronizes a native change
- **THEN** native tooling owns that operation and AssuredLoop supplies trace/check inputs.

### Requirement: Skills describe tool operations only
Packaged Skills SHALL cover adoption, record authoring, context retrieval and
synchronization inputs. They SHALL NOT teach developer, tester, reviewer, architect
or PM methods, prescribe subagent sequencing, choose models, dispatch work or
require progress/completion notifications.

#### Scenario: Consumer supplies its own review Skill
- **WHEN** it needs relevant requirements and evidence
- **THEN** assuredloop-context provides retrieval/check usage without competing
  instructions about how that review must be conducted.

### Requirement: Creation guidance and validation share authoritative contracts
The schema SHALL own field rules; templates/Skills SHALL reference it and actual
commands. Examples SHALL remain illustrative. New local record preflight SHALL
use the same carrier/parser/schema as subsequent source discovery.

#### Scenario: Author writes a complete comment locally
- **WHEN** its JSON is under an unsupported heading
- **THEN** the documented preflight detects the mismatch before publication.

### Requirement: Resolve targets and Skill roots from explicit bindings
Init SHALL require a real consumer repository, native root, selected tools, label
map and package/source binding. Native registry roots and co-tenancy markers SHALL
be respected. Existing different files SHALL be conflicts rather than overwritten.

#### Scenario: A different repository adopts the toolkit
- **WHEN** its target differs from the framework source repository
- **THEN** rendered discovery files use the target's bindings without hard-coded
  framework Issues, model choices or session names.

### Requirement: Initialization reports exact bounded effects
Default init SHALL preview; apply SHALL write only its declared local files.
Explicit provision-labels MAY create missing mapped labels after a fresh preview
and readback. Existing metadata SHALL be preserved; partial effects SHALL be
reported without destructive rollback. Inspect/check SHALL remain read-only.

#### Scenario: A label write succeeds but readback fails
- **WHEN** initialization cannot verify the effect
- **THEN** it reports partial/unverified state instead of claiming no effect or
  deleting labels, and retry requires a fresh preview.

### Requirement: Linked development does not audit the toolkit itself
Actual npm package-root links SHALL select linked-development and omit toolkit
archive/source/dependency/Git-cleanliness/integrity verification. Required consumer
inputs, fixed policy, source permissions and freshness SHALL remain checked.

#### Scenario: Linked source tree is dirty
- **WHEN** a linked toolkit checks a consumer
- **THEN** toolkit provenance is not a blocker or a request for self-trace work;
  mutable local contracts do not replace fixed accepted consumer policy.

### Requirement: Installation is not adoption of product intent
Installation SHALL NOT claim whole-project Brownfield conversion, accepted
requirements, activation, CI setup or reviewer orchestration. Existing explicit
consumer constraints SHALL remain intact. Historical unsupported formats SHALL
receive explicit compatibility limits rather than silent reinterpretation.

#### Scenario: Consumer already has old work-role Skill copies
- **WHEN** the new package is selected
- **THEN** old files are not automatically deleted or overwritten; the exact
  migration scope and conflicts remain visible for authorized handling.
