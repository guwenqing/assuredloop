## Context

See [Proposal](proposal.md) for intent and [workflow goals](specs/workflow-goals/spec.md) for the shared requirement basis. OpenSpec 1.12.0 is installed locally with the native `spec-driven` schema and generated Codex/Claude integrations. There is no AssuredLoop runtime, custom work Skill, Issue validator, CI job or active current-spec baseline yet.

Source Request #1 and planning Task #2 are connected by GitHub's native parent/sub-issue relationship. Proposal PR #3 is merged; PR #5 carries the remaining planning. Stage-specific #4 is superseded by #2. These existing records are bootstrap evidence, not examples of an already deployed extension.

The owner's subsequent decisions are recorded on #2: keep native tasks.md with GitHub operational state; complete the continuous planning Task at reviewed decomposition/handoff; return aggregate acceptance and specification synchronization to an owner-led closeout Task after development. Automatic external-review triggering and CI enforcement remain a later change.

## Goals / Non-Goals

**Goals:** define an implementable local workflow extension, a compact formal record contract, native-compatible delivery tracking, complete work guidance, useful read-only validation/context tools, and a tested closeout/activation path.

**Non-Goals:** a replacement OpenSpec parser, workflow scheduler, universal requirement ontology, new change-size taxonomy, bot accounts, multi-repo coordination, automatic review provider integration, CI installation, or a mandatory database. This plan does not install its proposed helpers or Skills.

The current delivery boundary is the usable, installable single-repo workflow and its verified self-use. Node.js, npm packaging, target bindings and framework-contract separation refine how that agreed tool is delivered; they do not authorize a broader hosting or orchestration product. New details are assessed against the accepted outcome. Necessary bounded refinements are incorporated with traceable review; material expansion returns to the owner. Deferred automation/CI, multi-repo coordination, bot orchestration and generic hierarchy enforcement remain incomplete follow-up candidates for future Proposals, not hidden Tasks of this change. Registry publication is an explicit release operation requiring confirmed identity and authorization, not a background side effect of producing the package.

## Decisions

### 1. Native artifacts and one readable requirement hierarchy

Use the existing native change, instructions, delta format and sync/archive workflows. Do not patch upstream code or copy its library implementation. The additional `workflow-goals` Spec gives the already agreed L1 goals a normal native home; it is not a seventh runtime subsystem. Each of the six L2 capability Specs references a named L1 goal; its Requirements and Scenarios define L3 behavior. Cross-capability links identify related contracts. Proposal and Design are not themselves L1 and L3.

The mapping is intentionally ordinary Markdown:

| L1 goal | L2 capabilities | L3 examples |
| --- | --- | --- |
| Work is traceable and proportionate | Intake/planning; GitHub traceability | Bounded Spike closure; task basis; planning handoff |
| Shared facts support human and machine judgment | Specification baseline; review/validation | Full-delta synchronization; unavailable evidence; semantic review |
| Reuse supports governed evolution | Workflow adoption; self-evolution | Usable work guidance; activation; governed self-change |

During the active change these paths live under `changes/establish-project-workflow/specs/`; closeout integrates all seven native Specs under `openspec/specs/`. Relative links between capability directories survive that operation. Requirement headings are the native addressing unit; do not introduce layer IDs, copied human-only documents or an automated layer graph. A rule-level link is used where a specific rule is the work's basis; the L2 purpose link does not pretend to prove every lower rule's relevance.

Alternative: keep only L1/L2 labels in every Purpose. Rejected because this scattered the global goal basis. A separate custom goals ledger or ignored README would require a separate synchronization contract; a native Spec uses the existing mechanism. Normal future changes update these goal requirements through deltas like any other Spec.

### 2. Work ownership and Issue boundaries

Use the owner's familiar routes: incoming Request, Epic, Task, Bug and Spike. On this personal GitHub repo these are repository labels, not organization-level native Issue Types. Map the category names in project configuration; do not infer a new approval taxonomy from them.

An incoming Issue retains its original request while triage enriches it and changes the route when justified. An Epic holds the overall delivery scope. Its planning Task covers exploration through reviewed Design, task decomposition and handoff. It can have several PRs and closes at that planning outcome, not at Proposal merge and not after all development. Implementation Tasks and the closeout Task are separate children of the Epic; they reference the planning output. A closed planning Task need not be reopened for routine development. If development reveals a material plan defect, the responsible owner explicitly reopens or revises the appropriate planning work with a reason.

Split work for a meaningful independent result or responsibility. Do not split every artifact, field, test, review round or day into a new Issue. Additional work within an active change returns to its owner; archived deliveries are not edited to register later tickets. Small implementation-only follow-ups use current context and prior delivery references. Huge or unclear requests can produce bounded Spikes, whose conclusion returns to the human without automatic successor creation.

The Epic owner is accountable for the closeout Task; Architect is a staffing example. That owner can have authored the plan, but cannot provide the independent acceptance review of their own closeout PR.

### 3. Native delivery checklist and GitHub operational work

Retain the native `tasks.md` artifact and `- [ ] X.Y ...` syntax. Each checkbox carries stable delivery scope and its verification obligation, and resolves to a GitHub Issue through its own link or an unambiguous work-package heading link. Several bounded checklist steps can belong to one implementation Issue; there is no one-checkbox/one-Issue requirement. The Issue links back to the relevant numbered plan items and specific requirement/design basis, adding operational context rather than duplicating the formal task body.

| Content | Authority | Update point |
| --- | --- | --- |
| Formal scope, requirement/design basis, delivery checklist | Versioned OpenSpec artifacts | Scoped planning or delivery PR |
| Assignment, live progress, questions and findings | GitHub Issue/PR records | Ordinary collaboration updates |
| Checklist completion mark | Delivery snapshot reconciled to evidence | Corresponding delivery/closeout PR |
| Acceptance and executed test/review records | Revision-specific PR/Issue comments | Actual run/review and resolution |

Changing an assignee or posting progress never requires a spec change. An Issue status is not duplicated in a repo status ledger. The native checkbox count remains useful for locating unfulfilled delivery items, but is not an acceptance verdict.

During a PR, checked items mean the candidate contains the claimed contribution, subject to review and merge. The responsible Issue remains open until its applicable delivery is accepted. Checks therefore distinguish candidate contribution from merged delivery. A closeout PR can contain the final checklist mark while its own closeout Issue is still open; that self-reference is not an unsupported closed-child exemption. All prerequisite implementation delivery must already be accepted. After merge the same file is the delivery snapshot, with no extra commit merely to change an operational status.

Checklist deliverables must be achievable before that PR merges. They do not include performing their own merge, post-merge confirmation or Issue/Epic closure. Those operational obligations remain in the GitHub work record and are checked there after merge. The closeout checklist therefore delivers the synchronized/archive candidate and reviewable acceptance package; it does not predeclare successful post-merge follow-through. An archived tasks.md never needs to be rewritten merely to record Issue closure.

Native `apply` reads and updates tasks.md. The delivery Skill adds the GitHub lookup and evidence reconciliation around it; it does not relabel native progress as live GitHub status. Native `list`/archive also read task files, so setting only `apply.tracks: null` would not implement a complete external task provider. Keeping native tracking avoids that fork/adapter project. Where native guidance is broader, project guidance limits execution to the assigned Issue's referenced checklist items.

### 4. Minimal structured relationships, not a second task database

Use human-readable Issue/PR bodies with a single JSON block under `## Workflow context`. Use a small JSON Schema contract for that block, with descriptions and valid examples. JSON keeps parsing unambiguous; prose remains the source of the human request and explanation. Exact schema/example files are implementation outputs, not hidden rules inferred by a validator.

The minimum record vocabulary is:

| Record | Required relationship data | Conditional data |
| --- | --- | --- |
| Incoming Request | No pre-triage block required | Triage adds its route rationale and next work context |
| Routed work Issue | `activity`, `request`, `basis` | `change`, `plan_items`, `depends_on`, `prior_work`, `no_spec_reason`, split rationale where applicable |
| Work PR | `issues`, `change` when applicable, `basis` | `plan_items`, `no_spec_reason` |
| Evidence comment | `head`, `scope`, `result`, evidence references | reviewer/producer session declarations for independent review; command and exit result for executed checks |

`activity` names the applicable work guidance (planning, research, delivery or closeout), not a mandatory human role or a change-risk level. Request/category comes from the configured GitHub label; do not duplicate ticket state or assignee in the JSON. `request` and `issues` use repository-qualified GitHub references. `basis` and `plan_items` resolve to explicit repo revisions and paths, with requirement/decision heading or task number where relevant. For no-Spec work, request context still exists and `no_spec_reason` explains the exemption; an empty list alone is not sufficient. `change` identifies the active native change, not a copied Proposal body. Later work can reference an archived delivery by an immutable file/PR reference without editing it.

Use qualified `owner/repository#number` strings for Issue references, immutable GitHub blob URLs for `basis`, and `plan_items` entries with `revision`, repo-relative `path` and numbered `items`. `depends_on` lists prerequisite work references. Creating and reviewing the plan only requires those records to exist with clear scope; execution/closeout applies the appropriate prerequisite-delivery checks. These are relationship fields, not duplicate copies of their state.

A task gets its current owner from the GitHub assignment or an explicit named responsibility in its body when a bot account does not exist. Assignment is mutable operational data. The fixture/record schema requires that responsibility be discoverable at handoff; it does not falsely authenticate a model identity.

Schema-required fields depend on the declared work and lifecycle point. A rough incoming request is valid before triage; a planning Task can exist before its future design file exists. At handoff, references to the agreed plan must resolve. A pre-merge candidate can reference files in that PR head. Work closed as delivery requires merged evidence; a cancelled/superseded Issue requires a reason and contributes no delivered scope. Spike completion checks its research obligations, not implementation artifacts. Ambiguous or missing relationships are reported, not filled in by guessed links.

Single-source split: Specs own behavior, JSON Schema owns field/type shape, and Skills/templates reference both. Generate or check template examples against the actual schema. Do not maintain independent copies of mandatory fields in every Skill. Add extensions through documented project configuration and namespaced schema fields; do not make arbitrary unknown fields silently pass as accepted policy.

### 5. Small local tools and explicit trust boundaries

Implement a Node.js ESM CLI using the standard library for filesystem, Git subprocesses and JSON. All executable scripts maintained by this extension, including setup, validation, generation and test helpers, use Node.js; do not add Python or shell-script implementations of the extension. Declarative configuration and documented invocations of native tools are not another runtime. Use native OpenSpec CLI JSON/status/instructions/validation for OpenSpec artifacts, not a new parser. Use `gh api` to fetch GitHub records and native parent/sub-issue relations; paginate and report unavailable input. The only planned additional validation dependency is a pinned direct Ajv 8 version for standard JSON Schema, selected and checked for release age before installation. Do not rely on an undeclared transitive dependency. [Ajv documents schema-based JSON validation](https://ajv.js.org/guide/getting-started.html).

Proposed surfaces, to be implemented rather than claimed available now:

- `inspect`: produce a focused review packet from a work Issue or PR.
- `check`: validate applicable structured records, links, revision identity, task evidence and status consistency; a closeout mode adds complete-change/baseline coverage.
- `init`: explicitly selected project adoption, with a preview of files/configuration to add or change. No automatic push, GitHub settings change or account setup.

`inspect` and `check` are read-only. They cannot edit labels, close Issues, merge PRs, run commands embedded in a ticket, fetch arbitrary URLs, execute repo code, or silently repair an artifact. GitHub writes stay explicit operations through the relevant Skill and authorized tool. Fetch only the selected repo and explicit permitted reference scope; missing cross-repo access remains a visible limitation. File resolution stays within the selected repo/revision and rejects traversal or external symlink targets.

Use one `.assuredloop/config.json` with distinct `project` policy and `repository` binding sections. Project configuration selects the workflow contracts and optional extensions; repository binding identifies the GitHub repository and local OpenSpec context. No multi-repo service, mirrored authoritative database or fixed bot topology is needed. Inspectable configuration and entry-point help are part of setup acceptance.

The framework and the consumer have separate roots. The selected target root, its configuration and native OpenSpec context determine all consumer work-data lookups. The framework's install directory provides versioned runtime assets and read-only workflow behavior contracts. A missing target binding is an error, never an invitation to use this checkout's remote, user home, Issue numbers or plan. Generic Skills resolve framework rules from the pinned toolkit contract binding and consumer requirements from the target's native OpenSpec context; neither replaces the other. Shipped templates use placeholders such as `{{repository}}` and `{{change}}`, rendered only from explicit validated context. Unresolved placeholders block a handoff artifact. Do not copy this repo's actual configuration, source requests, changes, credentials or activation records into an adopting project.

The pinned framework package exports its delivered workflow Specs as read-only `contracts/` assets, alongside schemas, templates and runtime code. They are generated from the canonical framework Specs at a recorded source revision and checked for equality, not independently authored as another specification set. Package metadata identifies that version/source revision and the contract paths; `project.workflow` in the target configuration pins that package and any explicit locally governed policy extensions. Installed Skills can read these assets without requiring the original source checkout. Never insert framework contracts into the consumer's `openspec/specs/`, which remains the consumer's own product baseline. Human-readable provenance links in contracts are history, not target routing defaults.

For initial self-adoption before this first change is archived, activation may explicitly bind a package of the already reviewed active-change contract revision. Its metadata declares this bootstrap basis and does not pretend it came from a delivered baseline. Final closeout replaces that bootstrap binding with the integrated, accepted contract release. Later adopters receive the completed package, not this bootstrap project's Issues or activation record. The cross-target fixture must work without the original source checkout and must prove framework rules and consumer requirements resolve from their separate bindings.

Implementation layout (proposed files, not existing implementation):

| Location | Ownership |
| --- | --- |
| `src/` | Reusable Node.js CLI, native-tool adapters, checks and template/setup helpers |
| `schemas/` and `templates/` | Reusable field contracts and parameterized Issue/PR/evidence templates |
| Packaged `contracts/` | Generated read-only framework behavior Specs with source-version metadata; not consumer Specs or a second authored rule source |
| `.agents/skills/assuredloop-*/` | Authored reusable work-category guidance, separate from upstream-generated Skills |
| `.claude/skills/assuredloop-*/` | Generated discoverable copies from that same authored guidance; checked for drift |
| `test/` | Sanitized fixtures and Node.js tests, with distinct framework and consumer roots |
| `.assuredloop/config.json` | This consumer repo's project policy and repository binding, not a shipped target default |
| `openspec/` and GitHub work records | This consumer's actual goals, plans, implementation work and evidence |

Distribute through a normal versioned npm package with a `bin` entry, an explicit package-files allowlist and the assets above. npm installs the runtime into its package location (global, one-shot execution cache or pinned project dependency); `init` generates only target-specific configuration and Skill discovery files after a preview. It does not copy the source repository or inject framework Specs into consumer Specs. Preserve native/user-owned files and fail on unapproved conflicts. Running a toolkit version that disagrees with the target's pin requires an explicit compatible selection or upgrade, not silent rebinding.

Use [npm's bin/package metadata](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#bin) and [npm pack](https://docs.npmjs.com/cli/v11/commands/npm-pack/) rather than a custom package manager. The package allowlist includes runtime, schemas, parameterized templates, reusable Skill sources and generated contract assets, but excludes this consumer's config, active/archived change history, credentials, test-run logs and local work. Test the actual tarball installation and CLI from a different directory without the source checkout. The package name/scope and registry account are release settings to confirm before actual publication; this plan authorizes building/testing the distributable, not registry writes or access changes. Existing `private: true` is not removed merely to make a planning check pass.

A small root README points to usage and the formal Specs; it is not another copy of requirements. This repo's self-adoption uses the same installation/init path as a different target, without a hardcoded self-hosting mode. A cross-target fixture changes repository identity, directory, Issue numbers and label mapping and verifies correct context, links and unchanged source assets.

Validation takes the accepted policy revision as a separate input from the candidate revision. A change cannot weaken the very rule used to judge itself by changing candidate schema/config. For initial bootstrap, explicitly record the reviewed planning basis. After activation, resolve the accepted policy basis from the recorded activation/delivery history. Candidate schema conformance is an additional test, not a replacement for the existing agreement.

### 6. Focused context and two kinds of review

The packet contains the source request, work record, applicable Proposal/Spec/Design fragments, candidate diff, resolved references, task mappings, test/review evidence, known impacted contracts and open questions. It records base/head revisions and the fetched mutable Issue/PR records with retrieval time. It reports missing inputs and what was excluded. There is no fixed Top-N retrieval cutoff that silently drops relevant requirements.

Start from explicit basis links and changed files, then follow directly referenced requirement/decision links and report the expansion. For planning, compare Proposal commitments to Specs and Specs to Design/tasks for both missing coverage and unsupported additions. For implementation, compare actual code/behavior to its basis. For closeout, expand to the whole accepted change and all its delivery evidence. The reviewer may request more context; focused does not mean unable to inspect the repo.

Mechanical success proves the implemented formal checks succeeded, not that a rationale is valid or a feature works. Two different session IDs are only an independence declaration, not proof of how execution occurred. Independent review is performed in a separate read-only agent/session using original evidence. A worker obtains internal Sol/Astra-level review; a distinct review/acceptance perspective for the PR or closeout is invoked explicitly with the same original context where required. Future external bots/pipelines can consume the same packet; none are installed in this release.

Results remain revision-specific comments. If head changes materially, obtain renewed review. Re-fetch mutable Issues and compare the review's captured basis before merge; a material context change invalidates the relevant conclusion even if code head did not change. Missing reports and unresolved findings prevent completion. AI owners perform allowed merges only when these obligations and required human Proposal decisions are met.

### 7. Skills explain complete work, with native operations inside

The following are initial work groupings, not a permanent count or role chart:

| Work guidance | End-to-end responsibility | Native reuse |
| --- | --- | --- |
| Adopt the workflow | Inspect target repo; agree configuration; install without overwriting unrelated work; verify usable guidance | Native init/status and generated integrations |
| Triage a request | Preserve request; explore; explain routing; enrich Issue and assign next work | Explore |
| Plan and decompose | Deepen understanding; Proposal/Specs/Design; create scoped tasks; review and hand off | Propose/instructions; update-change coherence workflow |
| Research a Spike | Bound questions; gather evidence; report limits; close research to human | Explore where appropriate |
| Deliver assigned work | Resolve basis; test first; implement; independent review; PR findings; authorized delivery | Apply scoped to the assigned plan items |
| Review work | Read-only assessment of original basis and actual artifacts; report findings with revision/scope | Native validate; artifact coherence guidance; native verify where applicable to implementation |
| Close a change | Aggregate acceptance; synchronize and verify Specs; closeout PR; archive and completion | Sync-specs and archive-change |

Each explains required inputs, record meanings, decisions, allowed edits, expected outputs, references, checks, failure handling and handoff. Issue splitting and checkbox reconciliation are conventions within these workflows, not separate Skills. Keep project-authored instructions separate from generated native Skills; project guidance invokes native workflows and adds declared obligations. Support both Codex and Claude discovery using the authored Codex-path source and mechanically checked generated Claude-path copies, not independently edited versions. Repo-specific context is resolved when using the guidance, not copied from this project's task data into reusable instructions.

No Skill promises that invocation alone enforces behavior. Representative execution by an agent without this conversation verifies that the guidance is sufficient. Both guidance and checker defects can be found; do not blame the executor for a requirement hidden only in code.

### 8. Closeout is a normal reviewed delivery

The parent owner schedules a separate closeout Task with explicit prerequisite implementation Issues. A closed developer ticket is an input to validation, not proof by itself. The owner checks the accepted requirement set against integrated implementation and its evidence; unresolved failures return to the responsible work, and material scope changes return to planning/human decisions.

For this release, current Specs mean the integrated contract of completed changes. Pending accepted targets remain in active deltas. Closeout uses a normal branch and PR; no special worktree is required. In the closeout candidate:

1. Read the accepted delta set, latest base Specs and all prerequisite delivery records at explicit revisions.
2. Run native checks and the aggregate delivery assessment; record gaps before synchronizing.
3. Use native sync guidance to apply all intended adds, modifications, removals and renames to current Specs, preserving unaffected contracts and links. Do not just copy delta files with operation headings into the baseline.
4. Run native current-Spec validation and inspect the baseline diff against every delta. Mechanical checks report coverage/shape and unresolved references; independent AI review checks the actual meaning and preservation of unaffected behavior.
5. Prepare the archive in the same closeout candidate only after synchronization is verified. Preserve the original delta at the source revision and the archived files for review; the candidate's archive move is not a completed operational claim before merge.
   For the framework's own release, regenerate the packaged workflow contracts from that synchronized canonical revision, verify content equality and version/source metadata, and replace the self-adoption bootstrap binding with the delivered contract package. Pack/install validation must resolve the new contracts without the active-change path. These are release outputs of this consumer project, not a requirement to package every adopting project's business Specs.
6. Review the entire closeout PR, including aggregate acceptance evidence, baseline changes and archive move. Run the applicable pre-merge checks explicitly now, and through configured automation when a later change installs it. A sync/archive PR is not exempt.
7. If base or relevant work evidence changes, refresh integration and affected checks/review. After authorized merge, confirm the merged baseline and archive result. Close the closeout Task, then the parent Epic if its full agreed outcome is satisfied.

The closeout Task is allowed to be open while its own PR is under review. It cannot require its own post-merge closure as a precondition for merge. Native checklist items cover the pre-merge candidate and acceptance package only; the closeout Issue records required review, merge, post-merge confirmation and eventual Issue/Epic closure. No other undelivered prerequisite is waived. Archive warnings or an option to skip synchronization in upstream tooling do not satisfy this project's accepted completion contract.

Alternative: synchronize on every Proposal merge. Rejected for this release because current Specs would then mix pending targets and completed delivery. Alternative: automatic sync triggered by any GitHub merge. Deferred with CI integration; native synchronization is an explicit operation, not a merge webhook guarantee.

### 9. Test-first implementation and acceptance evidence

Use Node's built-in test runner for unit and CLI-level functional tests, plus native OpenSpec validation. The [Node test runner](https://nodejs.org/api/test.html) provides the executable test surface; do not build a test framework. The runtime version will be pinned during implementation using an established release, not upgraded merely to follow latest documentation.

For each executable work item, a different agent authors relevant tests from the contract; run them and record genuine RED before implementation, then GREEN afterwards. Controlled invalid fixtures and small deliberate faults assess whether the checks detect broken links, missing fields, unavailable records, stale evidence, false completion and missed synchronization. Do not weaken tests to obtain a pass. Non-code planning uses native checks and independent semantic review, not simulated claims of runtime tests.

Use sanitized committed test fixtures as test inputs, not production run logs. GitHub API behavior is exercised through deterministic fixtures in normal tests; live verification is read-only against explicitly scoped work records. No automated test creates or closes arbitrary public Issues. Agent-guidance trials provide only the declared repo/task context, not the original chat; store their findings and execution evidence in Issue/PR comments.

The functional acceptance set covers incoming uncertainty, bounded clear work, an active-plan addition, an implementation-only follow-up, a Spike returning to the human, planning handoff, delivered work and owner-led closeout. It includes negative cases for unjustified splits, no-Spec claims, missing task context, premature completion, sync omissions and self-weakened policy. These are workflow acceptance tests, not a general simulation platform.

### 10. Bootstrap activation and real self-use

Separate three milestones: reviewed usable base, explicit activation of that fixed revision, and final minimum acceptance after a real governed self-change. Activation records the adopted policy/contract revision and evidence on GitHub; it does not assert that the parent Epic is finished. While this initial change is still active, the activation record points to its reviewed contract revision explicitly. The absence of current Specs at this bootstrap point is visible, not silently treated as unrestricted policy.

After base implementation and representative verification pass, the authorized owner records activation. A bounded genuine improvement found in those trials is then delivered under that active policy, with its own scoped Issue/PR and original evidence. Do not invent a cosmetic change merely to produce a success badge; if no meaningful candidate exists, the self-change acceptance item remains incomplete until the owner selects one. This selection is acceptance execution, not an unresolved runtime architecture choice.

The activation checkpoint and the subsequent improvement are distinct. The acceptance work package records and verifies activation, then verifies evidence from the separately assigned improvement; it does not authorize implementing that improvement inside the activation checkbox. The improvement's own Issue carries its scope, active-policy basis, implementation ownership and PR, and is linked from the acceptance Issue when the genuine candidate is selected. No placeholder successor is created now solely to satisfy a count.

The separate closeout Task runs after that self-use evidence is available. It synchronizes the final accepted delta, archives and closes the Epic. Later work reads the integrated current Specs and accepted configuration, and changes them through the same workflow. Neither a candidate validator nor a proposed Skill can exempt its own PR from the currently applicable rules.

## Risks / Trade-offs

- Explicit local execution is bypassable without enforced CI -> make that limitation visible; require actual evidence and review now, with enforcement a separate accepted change.
- GitHub records mutate outside Git -> bind review to captured records and revisions, re-fetch before completion, and report context drift.
- Native checkboxes can be mistaken for live status -> Skills and checks distinguish candidate/merged delivery snapshots from Issue state and actual acceptance.
- Main Specs lag ongoing accepted targets -> active changes remain the explicit pending target context; no claim that the baseline describes uncompleted work.
- Reviewer context selection can omit an impact -> expose exclusions, follow references, and allow expansion; semantic coverage is not mechanically proven.
- Adoption can overwrite user customization -> preview changes, preserve unrelated files, and stop on overlapping unowned content; do not patch global instructions implicitly.
- New record fields can become busywork -> require only data used by a named check or handoff; use Schema descriptions/examples and verify fresh-agent usability.

## Migration Plan

There is no migration from the old repository. Implement in this fresh repo through the linked tasks, pin direct dependencies, and keep changes reviewable. Exercise setup on an isolated local fixture before any target-repo adoption. Configure project policy and repo binding explicitly; record activation only after actual verification and authorized acceptance. If adoption cannot complete safely, leave the previous configuration effective and report the partial result. Roll back an accepted local configuration change through an ordinary reviewed revert; do not delete user content or rewrite history.

The initial planning handoff closes Task #2 only after the agreed artifacts and task associations pass review. It does not close the Epic, activate tools, merge future implementation or start the post-implementation closeout Task.
