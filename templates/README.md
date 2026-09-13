# Completing trace records

The field authority is `schemas/workflow.schema.json`. JSON files in
`templates/records/` are complete sanitized examples, not real authorization.
Packaged `contracts/` describe toolkit behavior; the consumer's native OpenSpec
files describe that consumer's product. Neither replaces the other.

This guide describes data and tool usage, not a development or review method.
Use the consumer's chosen workflow to decide who does the work and when.

## Read and preserve source context

For an Issue scope claim, read the body and every comment page. Later comments
may add requirements or supersede decisions; retain their source and authority
rather than treating the last comment as automatically correct. An unavailable
page is a context gap. Refresh mutable discussion when its freshness matters.

GitHub holds work status and discussion. Native OpenSpec holds current Specs,
change deltas, Design and numbered task definitions. Link these instead of
duplicating task bodies. Keep facts, decisions, hypotheses and unknowns distinct.

## Author and preflight

Use work-issue.md, work-pr.md or evidence-comment.md. Serialize one schema-valid
object in one complete JSON fence beneath exactly `## Workflow context`.
Other headings, arbitrary JSON and quoted examples are not authoritative records.

```text
assuredloop validate --kind issue --file /absolute/issue.md
assuredloop validate --kind pr --file /absolute/pr.md
assuredloop validate --kind evidence --file /absolute/comment.md --record /absolute/intended.json
```

Preflight is local and credential-free. It checks the complete rendered carrier
and schema; optional `--record` checks equality with the intended JSON, ignoring
key order/whitespace. It does not resolve remote references, check policy, publish
anything or prove correctness. A valid non-passing review is publishable data,
not permission to merge. Full `check` and bounded `inspect` serve different needs.

Use qualified `OWNER/REPO#N` WorkRefs and fixed RepoRefs
(repository, full commit SHA, relative path, optional anchor). PlanRefs additionally
identify native numbered task items. Omit inapplicable optional fields.
A missing active change is omission, not a fictional name such as `none`.
Empty `basis` requires a nonempty `no_spec_reason`; the tool cannot prove that
reason true. Never invent a future revision, comment ID or acceptance.

## Classify the assigned work

The current GitHub adapter uses six `repository.labels.type` mappings,
case-insensitive and distinct. Different consumer label names are supported;
unrelated labels do not count as categories.

| Category | Compatible activity |
| --- | --- |
| Request | `triage` |
| Epic | None; non-executable container |
| Architecture Task | `plan`, `closeout` |
| Task | `adopt`, `deliver`, `review` |
| Bug | `deliver` |
| Spike | `research` |

There must be exactly one configured category for a structured assigned Issue.
A rough incoming Request may omit category/context before triage; a non-executable
Epic may omit context. Neither exception lets other assigned work omit context
or an Epic carry an executable activity. A PR's authoritative assignment also
requires its actual owning Issue context.

These are adapter vocabulary, not required agent roles, a task-splitting method
or a Skill selector. A review comment need not have its own Issue. The tool does
not create tasks or decide ticket counts. Legacy discipline configuration is
unsupported; see [category migration](category-migration.md) for a scoped record
migration that preserves evidence.

## Relate scope and delivery

An Issue/PR `plan_items` reference points to fixed native `tasks.md` and item IDs.
The task or package uses the canonical association:

```markdown
Work Issue: [Assigned contribution](https://github.com/OWNER/REPO/issues/NUMBER)
```

Parent/sub-Issue membership describes grouping, not a prerequisite. Add
`depends_on` only for the actual dependency:

- An Issue means its entire current assigned scope must be completed.
- A PR means its fixed merged contribution, canonical owner/task map and evidence.

A broader Issue can remain open while a PR delivers the needed subset. If that
Issue later reopens, an existing whole-Issue dependency still refers to its current
whole scope. Select a PR dependency only after checking the intended boundary;
retain the old relationship and reason in the discussion. The validator must not
silently rewrite it to pass.

Closed state, checked boxes or a merged PR do not prove all assigned scope was
delivered. Cancelled/superseded work contributes no delivery credit. If records
are consolidated, preserve original scope, comment-added decisions and the actual
receiving work reference; a shared container alone does not prove transfer.

## Evidence and review verdicts

Execution evidence describes actual observations and sources. A requirement
reference is motivation, not evidence that an execution occurred.
A known PR assessment keeps its full head/base/policy/package/digest tuple.
Missing required context remains incomplete; do not omit PR identity to evade it.
Non-revisioned evidence may use null head with its explicit reason, not as an
exception for code or policy.

New review evidence uses exactly `pass`, `fail`, `revise` or `incomplete`
in `result`. Put findings/explanations in prose and source references in
`evidence`. Ordinary execution results can remain descriptive.
A `producer_session` alone records authorship; it does not declare a review.
Review fields require distinct producer/reviewer declarations. Distinct strings
do not prove real independence.

New setup defaults to optional context budgeting, not model/depth/tool rules.
Existing explicitly accepted `depth`, model allowlists/exclusions/aliases and
`routing` remain compatibility checks. They do not launch reviewers, select a
provider or require a new consumer to adopt those choices. Do not silently remove
them from an existing consumer configuration to make evidence qualify.

Only canonical `pass` can supply passing credit. Historical explanatory results
remain readable with `review-verdict-invalid` diagnostics. Do not infer a verdict
from prose or rewrite old sources. The original reviewer can append a complete
canonical clarification linked to the original report and original assessed
tuple. New current evidence requires its own current tuple. Historical noncurrent
assessments stay visible but are excluded from current acceptance. A newer pass
does not automatically dispose of earlier findings.

## Synchronization and acceptance inventory

Native synchronization updates the current specification from the accepted delta.
AssuredLoop verifies a fixed whole-change selection, current/base/candidate
requirements and inbound references. It does not perform the write or archive.
Readable L1 goals, L2 capabilities and L3 behavior can use native requirements and
ordinary links; this release does not enforce a general layer graph.

For the current closeout adapter, the Issue retains fixed plan assignments and
each PR selects one assigned `change`. An explicit `--delta-ref` must match the
accepted whole-change/plan revision. `--manifest-ref` must identify the actual
candidate-head `acceptance-manifest.json`. This selector format does not mandate
a separate architect role or Issue per phase.

Use the `manifest` schema and `captureManifest`/`checkManifest` APIs for source
fixity. Git sources hash raw blob bytes; comment sources hash the UTF-8 decoded
body string returned by GitHub, without Markdown/line-ending normalization.
Record actual Issue/PR delivery references in their corresponding inventory
fields. Each delivery's base_ref/base_sha/policy_ref/policy_mode records what was
checked then; `closeout_policy_ref` identifies the invoking assessment, not a
replacement for historical audit values. A missing source is unavailable; matching
hashes prove bytes, not authenticity, authority or correct meaning.

For a real initial no-policy squash delivery, use the separate
`initialBootstrapVerification` record. Preserve original reports; verify the
fixed original base positively lacks both config and activation, the actual
squash/head/tree and original accepted sources. Failed access is not absence.
The later record and its source/hash live in the delivery's `initial_bootstrap`;
original policy fields remain null. The invoking accepted `verificationPolicy`
comes from normal resolution, not the candidate record. This exception does not
turn arbitrary missing history into accepted bootstrap.

Historical `selfChangeDecision` records remain parseable source data. They are
not a required adoption exercise or an executed-work result. Full logs belong in
collaboration records or ignored local data, not canonical Specs.
