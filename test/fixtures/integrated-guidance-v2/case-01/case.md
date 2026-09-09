# Trial input — case-01

> Simulation input only. This declared snapshot is not a live service record, owner decision, activation record, or authorization.

## Consumer binding

```text
repository: northstar-labs/harbor-notes
openspec_root: openspec
consumer_revision: 1111111111111111111111111111111111111111
selected_native_tools: gemini
```

The selected package is `assuredloop-base@0.1.0`, selected for the verified runtime root supplied in the dispatch. Its package binding is the one in `package-binding.md`. The consumer's product requirements are under `openspec/`; the framework contracts are read from the selected installation's `contracts/`.

The target already contains these unrelated files and declarations:

```text
README.md: consumer usage instructions
AGENTS.md: existing consumer instructions
.gemini/skills/.openspec-target: native ownership marker for the selected tool root
.gemini/skills/upstream-notes/SKILL.md: native Skill owned by the selected tool
openspec/specs/harbor-notes.md: current consumer product requirements
```

The six configured category names are declared in `consumer-labels.json`, including `architecture-task` mapped to `type:architecture-task`. Their provisioning has not been observed. No existing adoption work Issue or observed Issue-label snapshot is supplied. The selected native registry reports tool `gemini` at version `1.12.0` and a shared Skills root at `.gemini/skills`. No label mutation or registry installation is authorized.

The declared project review choices are `depth: full-scope`, internal allowed model `model-cedar`, excluded model `model-slate`, and context budget `65536`. These are trial inputs, not evidence that a review or owner decision occurred. No `project.bootstrap` or activation record is supplied.

## Request

Prepare the adoption work record and a read-only initialization preview for this consumer. Bind the package, target repository, OpenSpec root, selected tool, labels, review choices, and contract package explicitly. Explain the files eligible for the preview, the files that must remain preserved, prerequisites that are only reported, and the next human/owner handoff.

The preview must be local-only. Do not apply files, contact GitHub, install a provider, alter native Skills, create a work Issue, or claim that adoption or activation has been accepted.

## Available package references

Read the package README, `skills/assuredloop-adopt/SKILL.md`, `contracts/project-workflow-adoption/spec.md`, `contracts/github-work-traceability/spec.md`, `schemas/workflow.schema.json`, `templates/records/config.json`, `templates/agent-instructions.md`, and `templates/README.md` from the selected installation.

## Executor task

Use the fresh executor brief to return the adoption draft, preview boundary, checks/limitations, and explicit handoff. Keep all references qualified to `northstar-labs/harbor-notes` or the selected installed package.

## Declared category context

No existing work Issue, authoritative activity record or observed labels are supplied for adoption. The requested activity is adoption preparation. Do not invent an Issue to complete the record.
