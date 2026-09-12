## ADDED Requirements

### Requirement: Informal future work remains repo context rather than accepted scope

Consumers SHALL have an optional repo-versioned `.assuredloop/notes/future-work.md` convention for gaps, tentative ideas and possible later work. Its content SHALL be best effort, potentially obsolete and outside formal requirement, task-completion and consistency validation. It SHALL not be a required initialized file, a second accepted specification, an execution log or a source of automatic work creation. Tooling SHALL distinguish the conventional note surface from current formal baseline content and default formal synchronization scanning.

Guidance SHALL permit concise human-readable notes with useful source links without mandatory IDs, status enums, schema blocks or synchronized duplicates. When an owner chooses an item for action, the original note MAY remain as context, while the normal request/planning process establishes accepted scope; a note cannot authorize implementation. Normal privacy, repository safety and explicit source access rules SHALL still apply. An explicitly requested note read SHALL be marked informal context rather than accepted requirements.

#### Scenario: Old note no longer matches current design
- **WHEN** an informal note contains an obsolete suggestion or stale reference
- **THEN** it does not fail formal consistency or closeout and is not silently promoted to a requirement

#### Scenario: Owner selects a note for work
- **WHEN** the owner asks to pursue a tentative item
- **THEN** intake preserves that source and establishes current scope/decisions through the existing workflow instead of treating the note as already accepted

#### Scenario: Note contains sensitive source material
- **WHEN** an executor considers committing private customer or credential content as future context
- **THEN** the informal classification grants no exception to privacy or repository safety rules
