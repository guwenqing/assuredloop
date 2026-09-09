# Trial input — case-11

> Simulation input only. This declared snapshot is not a live review record, verdict, or authorization.

## Consumer and review context

```text
repository: northstar-labs/harbor-notes
openspec_root: openspec
consumer_revision: dddddddddddddddddddddddddddddddddddddddd
issue: northstar-labs/harbor-notes#28
activity: review
request: northstar-labs/harbor-notes#28
basis: northstar-labs/harbor-notes@dddddddddddddddddddddddddddddddddddddddd:openspec/changes/calendar-locale/specs/export.md
pr: northstar-labs/harbor-notes#29
head: eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
base_ref: main
base_sha: ffffffffffffffffffffffffffffffffffffffff
```

The selected installed package is `assuredloop-base@0.1.0` at `<installed-package-root>`. Read `skills/assuredloop-review/SKILL.md`, `contracts/review-and-validation/spec.md`, `contracts/github-work-traceability/spec.md`, `contracts/workflow-self-evolution/spec.md`, `templates/review-request.md`, `templates/review-result.md`, `templates/records/evidence.json`, and `templates/README.md`.

## Declared handoff and evidence inventory

The pull request changes `src/export/calendar.csv.js` and `test/export/calendar.csv.test.js` for the assigned locale export outcome. The supplied basis is the consumer requirement at `openspec/changes/calendar-locale/specs/export.md`; the requested depth is full-scope. The destination policy declares internal allowed model `gpt-5.6-luna`, excluded model `model-slate`, and `depth: full-scope`.

The current work explicitly names author return context `session-export-author`, producer `session-export-producer`, reviewer `session-independent-reviewer`, reviewer model `gpt-5.6-luna`, and review depth `full-scope`. The changed scope and basis are supplied above. A matching prior review is not declared. No publication URL or notification receipt exists in this local context. The candidate has not been merged and no owner approval is supplied.

The following files are declared source/evidence material for this simulation and are available with this case:

```text
case-11/source/openspec/changes/calendar-locale/specs/export.md
case-11/base/src/export/calendar.csv.js
case-11/base/test/export/calendar.csv.test.js
case-11/source/src/export/calendar.csv.js
case-11/source/test/export/calendar.csv.test.js
case-11/declared-diff.patch
case-11/declared-checks.txt
```

The source bundle represents the supplied consumer basis and candidate head. `declared-diff.patch` is the change relative to the supplied base, and `declared-checks.txt` records the check command/output declared by the handoff. The coordinator separately reran the same local source test after reconciling the bundle; its actual output is preparation evidence under ignored local data, not a result produced by a fresh executor or reviewer. Treat all supplied files as bounded evidence to assess, not as permission to run, publish, or merge.

## Executor task

Prepare the review request and outcome draft for the exact head, base, scope, policy, and author context. Include the relevant checks/limits and a truthful publication/return handoff for a clean or findings result as supported by the declared inputs. Do not invent observed test output, post a result, send a notification, or claim acceptance or merge.
