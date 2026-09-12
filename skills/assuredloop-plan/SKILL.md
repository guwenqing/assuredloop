---
name: assuredloop-plan
description: Develop agreed OpenSpec changes and linked work decomposition through continuous planning and explicit implementation handoffs.
---

# Plan and decompose work

Consumer: {{repository}}. Product context: {{openspec_root}}. Framework: {{package_name}}@{{package_version}}.

Resolve the selected installation through the package README. Read the source Issue's entire body and all comment pages, triage rationale, existing planning ownership, current consumer Specs/active changes and owner decisions. Apply templates/README.md's reading-scope guidance before routing or transferring scope, and refresh the discussion before consequential handoff or closure. Use contracts/work-intake-and-planning/spec.md, contracts/specification-baseline/spec.md, contracts/review-and-validation/spec.md and contracts/github-work-traceability/spec.md, with templates/README.md.

Authoritative entry in that installation: contracts/work-intake-and-planning/spec.md. Shared record/format instructions are in templates/README.md.

Use Architecture Task/plan under the category/activity contract in templates/README.md. The parent Epic remains a non-executable container; implementation and standalone review use their own compatible categories/activities.

## Develop one coherent plan

Use native OpenSpec exploration, status/instructions and Proposal/Spec/Design/task operations where they already fit. Do not fork its parser or create another requirements database. Reuse an applicable active change; later work must not edit archived plans merely to register a new ticket.

Keep the parent Epic's overall delivery distinct from the planning Architecture Task. The planning Architecture Task normally covers continuing exploration, Proposal, Specs, Design, decomposition and handoff, even across several PRs or review rounds. Proposal merge alone does not finish it while Design or handoff is still owed. Split only for a meaningful independently assignable outcome or responsibility, with a recorded rationale.

One continuous planning Issue may cover several explicitly bounded native changes when their ownership, scope and readiness remain clear. A new change, artifact stage or review round does not by itself justify another Issue. Keep each change's agreement, plan references and acceptance distinct; use the consolidation guidance in templates/README.md when existing tickets duplicate the same responsibility.

State the accepted outcome, constraints and deferred work. Keep goals, capabilities and concrete behavior readable through native requirements/scenarios and ordinary references; do not invent a layer engine. Review Proposal commitments against Specs, and Specs against Design/tasks for omissions, contradictions and unsupported additions. New or materially changed Proposals need the required human acceptance before their changes merge; file existence and structural validation are not that acceptance.

When development brings an active-plan addition, assess it against the accepted outcome, reconcile affected artifacts and refs, and return material scope changes to the actual decision owner. Do not reopen completed planning for routine implementation, or hide an expansion in another Issue.

## Establish a bounded existing-project baseline

For an assigned Brownfield adoption, first distinguish toolkit installation from establishing current product requirements. Use the owner's selected repository/area and important behavior boundaries, and state exclusions and unexamined areas. Reuse existing product Specs/design and the applicable native change; do not create a duplicate baseline or treat the whole repository as assessed.

Gather relevant tracked code, tests and docs plus the owner's supplied external decisions. Anchor claims to immutable repository revisions, paths and useful headings/requirements or code locations. In the Proposal/Design, distinguish observed behavior from intended requirements, unresolved conflicts, assumptions and unknowns. A passing structural check or a test's written assertion does not prove product behavior was exercised. Preserve contradictory sources and ask the owner for the substantive intent decision; do not silently make code authoritative or change code/tests merely to make the narrative agree. A bounded Spike can resolve uncertainty that exceeds the assigned planning scope.

Build a reviewable current definition with native product Spec deltas: readable L1 purpose, L2 capabilities and concrete L3 requirements/scenarios, connected by ordinary links. Preserve unaffected current requirements. Record coverage and remaining decisions in existing native artifacts, without a new generator, role, layer engine or mandatory source manifest. Have the owner agree the Proposal and material intent choices and an independent reviewer assess source accuracy, conflict dispositions and false-completeness risks. Only then may the separately authorized native synchronization and actual delivery establish that selected baseline. Report the result as documented/adopted scope, not feature implementation, executed behavior tests or full-project conversion. Subsequent work uses that accepted basis; uncovered areas do not inherit acceptance.

Optional `.assuredloop/notes/future-work.md` can retain tentative ideas with a short informal/possibly obsolete/not-accepted heading and useful rationale or links. It is not required and needs no schema, IDs, statuses, maintained backlinks, duplicated backlog or execution log. Preserve existing content. Stale ordinary notes at the fixed notes surface do not fail default formal synchronization, while formal Specs/config/work/evidence keep their checks. Explicitly requested notes remain permission-bound informal context, never approval or accepted requirements. When selected for action, route the original idea through normal intake and current decisions. Do not copy private customer data or credentials into notes.

## Decompose and deliver the handoff

Use native numbered tasks.md checkboxes for stable contribution scope and verification obligations. Connect each item or unambiguous package heading to a real scoped Issue. Use templates/work-issue.md for ownership, current readiness, dependencies, immutable requirement/decision basis and numbered plan refs. Several checklist steps may belong to one Issue; the work record references their authoritative body rather than copying it.

Implementation is separately assignable from planning. Define developer outcomes, review/test obligations and meaningful prerequisite delivery. Assign aggregate acceptance, current-Spec synchronization and final closeout to the responsible change owner, with independent acceptance review. A dependency must be delivered before execution, but its incompleteness does not prevent recording planned work.

Use native parent/sub-issue associations for ownership relationships. Add depends_on only for an established execution prerequisite, not automatically for a parent or handoff owner. A research child contributing to unfinished planning must not be blocked on that parent's final completion merely because it is a child. Reconcile the new work's actual plan-item mapping before final handoff rather than copying the parent's entire assignment or inventing a future revision.

Hand off a ready change through its fixed, reviewed and accepted planning delivery and scoped implementation assignment, even when the continuous planning Issue still owes other changes. Do not make that Issue's full closure an artificial prerequisite; explicitly verify the actual required planning delivery and its evidence. Follow the current prerequisite-checking limits in templates/README.md rather than claiming machine verification of a PR dependency. Undelivered or unaccepted planning remains unready.

Run native strict validation and applicable link/artifact checks. Obtain independent full-scope review under the accepted policy, including the task-to-Issue map, coverage, dependency cycles, owner/readiness clarity and scope boundaries. Use templates/work-pr.md and review-request.md; dispose findings and refresh stale context before authorized delivery.

A reviewed, accepted planning handoff can complete the planning Architecture Task only when its entire assigned planning outcome is delivered. A multi-change planning Issue remains open while any assigned planning or handoff is still owed. Leave the parent open for implementation and closeout. Checked candidate contributions do not predeclare their own merge, Issue closure or overall acceptance. Send the next owner the fixed plan/basis, ordered or dependency-scoped assignment, actual readiness and pending decisions.
