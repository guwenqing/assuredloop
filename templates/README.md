# Completing work records

These Markdown files are reusable draft scaffolds, not completed consumer records or authorization. Resolve the selected installation and target as described in the package README before using them.

## One field authority

schemas/workflow.schema.json owns field/type rules. templates/records/*.json are sanitized, shape-valid examples, not real policy acceptance, owners, models or evidence. The behavior contracts are in contracts/*/spec.md; consumer requirements stay in the selected target's OpenSpec context. Do not maintain another mandatory-field table in each Skill.

Use work-issue.md for routed work and work-pr.md for a contribution PR. Construct the appropriate standard record object from explicit current inputs, validate it with validateRecord from the selected installation's src/records.js, and insert its safely serialized JSON as the single block under Workflow context. Keep numbers/arrays/null values typed; do not concatenate unescaped strings into JSON. A rough incoming Request needs no pre-triage block.

An inapplicable optional field is omitted. If the work has no active change, do not encode that absence as a made-up change identifier such as the word none, null or an unresolved slot. Use change only for an actual identified change. Include plan_items only for genuinely assigned, existing plan references; a new split may need plan reconciliation before that handoff is complete. An empty basis requires the justified no_spec_reason prescribed by the schema and independent assessment.

Keep GitHub parent/sub-issue membership separate from depends_on. Membership records the work relationship; depends_on records an actual prerequisite delivery. Do not infer an execution dependency merely from a parent link. In particular, do not make a contributing child wait for completion of the parent that needs its result. Establish the real prerequisite outcome and review the resulting dependency graph, retaining the native parent association separately.

Resolve every required SOURCE scaffold slot before presenting the output as complete. Missing bindings, unresolved refs or an unjustified exemption must remain explicit blockers or draft limitations. Do not mistake brace text inside supplied quoted evidence for a new slot, or use a reusable-example declaration to exempt actual Workflow context. Validate the actual work object, not the illustrative template. The Skill example-marker convention applies only to authored reusable guidance.

## Classify the assigned work

Use the consumer's six `repository.labels.type` mappings. Each must be nonempty and distinct under case-insensitive label matching. Their keys and default names are `request`/`type:request`, `epic`/`type:epic`, `architecture-task`/`type:architecture-task`, `task`/`type:task`, `bug`/`type:bug` and `spike`/`type:spike`. Different consumer label names are supported; unrelated labels do not count as categories.

| Category | Compatible activity |
| --- | --- |
| Request | `triage` |
| Epic | None; a container for separately assigned work |
| Architecture Task | `plan`, `closeout` |
| Task | `adopt`, `deliver`, `review` |
| Bug | `deliver` |
| Spike | `research` |

Require exactly one configured category for a routed Issue and check its activity against this contract. JSON `activity` remains the sole guidance selector. A rough incoming Request may omit category/context before triage; a non-executable Epic may omit context. Neither exception allows Architecture Task, Task, Bug or Spike to omit context, or an Epic to carry an executable activity. Missing, conflicting or incompatible declarations are errors.

A known explicit PR work assignment requires Workflow context; a missing Issue-side backlink does not restore an exception. Assign an Epic's contribution to its work child. An unrelated prose mention, or a PR whose authoritative `issues` list names only other work, does not establish an assignment to this Issue.

Classify the outcome, not the assignee or file extension: a docs-only implementation is Task/deliver; formal design is Architecture Task/plan; a separately assigned review is Task/review. An ordinary review comment needs no separate Issue. A valid pair is a declaration for semantic review, not proof that it truthfully describes the work.

For creation or reclassification, provision the configured label through the adopting owner or explicitly authorized agent, resolve the current work context, and verify the resulting label/activity pair. The former `repository.labels.discipline` mapping is invalid; remove it and reconcile the six category mappings through the [migration procedure](category-migration.md). Read-only initialization, inspection and checks do not migrate records or create labels.

## State, scope and evidence

GitHub holds assignment, progress, findings and delivery status; native OpenSpec files hold formal scope and task definitions. Reference numbered items and fixed requirement/decision refs rather than copying task bodies. Use qualified work refs and structured RepoRef/PlanRef fields, not machine authority inferred from arbitrary URLs.

A small patch, empty basis, closed Issue or checked box is not an acceptance proof. Explain a legitimate no_spec_reason and implementation-only boundary for independent assessment. Planning may precede future artifacts, but final handoff refs must resolve. Cancelled/superseded work needs a reason and contributes no delivered scope.

Use evidence-comment.md for actual checks/reviews under the appropriate record vocabulary. A code/policy/PR head cannot be invented or replaced with null. Genuine non-revisioned research may use explicit null with its required reason and evidence. Never invent future comment IDs, acceptance decisions, model executions or merge results. Follow the full applicable PR assessment envelope from accepted destination policy; candidate config cannot authorize itself.

Create evidence only when its actual subject, observations and required references exist. An unavailable code revision is not a non-revisioned research subject. At intake, an ordinary pending-evidence note is often the right artifact; do not manufacture a shape-valid evidence object to demonstrate the validator. A requirement/basis reference explains why work is needed, but does not by itself prove a test, research result or delivery happened.

For a known PR assessment, do not omit the PR identity merely to avoid its conditional base/policy/package/digest fields. If those values are missing, keep a clearly incomplete prose report or scaffold. A captured historical PASS may be cited and returned as that captured outcome, but cannot become a new qualifying current PR PASS until the complete applicable context is established.

Before activation, explicitly authorized native/manual bootstrap work may publish its real manual evidence and limitations. Do not label a manual report as a schema-conforming activated assessment or synthesize absent config/policy digests. Missing required authorization/input still returns to the responsible owner.

## Handoffs and checks

review-request.md and review-result.md are readable context/report scaffolds, not a new routing schema. The current author recipient must be supplied explicitly; no historical session, role, GitHub login or template default chooses it. Publication and confirmed author receipt are distinct observations. Use available authorized communication tools, report unavailable or queued delivery honestly, and do not add dispatch/retry infrastructure.

When the selected toolkit actually provides inspect/check, use its documented read-only operations and retain their limits. Until those commands exist, use native checks, the delivered structural record API and explicit manual reference/evidence assessment; do not claim unavailable helpers ran. Mechanical success never substitutes for semantic review.

Do not commit full execution/review logs. For closeout, use closeout-summary.md and the manifest schema/source rules: historical per-delivery audit values remain separate from the closeout policy, missing data stays explicit, and typed owner decisions are not executed-work results. Actual merge, archive and Issue closure must be recorded after they happen.
