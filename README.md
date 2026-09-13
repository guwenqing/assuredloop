# AssuredLoop Base

AssuredLoop is a traceability and context toolkit for OpenSpec. It does two things:

- Checks structured work, requirement, change, delivery and evidence relationships.
- Retrieves bounded, source-linked context so a worker or reviewer can assess the right material.

It does not define how a team develops, tests or reviews software. It does not
assign roles, dispatch agents, send progress messages, approve work or merge PRs.
Use your own workflow or BOT system for those tasks.

## Specification and storage

The current product definition starts at
[Workflow Goals](openspec/specs/workflow-goals/spec.md) in this source repository.
Installed packages carry [generated contracts](contracts/workflow-goals/spec.md)
from an exact Git revision, not a second authored specification.

Native OpenSpec owns Proposal, Design, delta Specs, tasks, synchronization and
archive operations. Current Specs describe the latest accepted product definition;
active/archived changes explain changes to it. AssuredLoop checks the links and
synchronization evidence rather than asking each reviewer to reconstruct current
requirements from all past proposals.

Files and their Git revisions remain authoritative. GitHub holds work discussions
and delivery evidence. There is no authoritative local database. Temporary
operation caches deduplicate reads; unavailable or out-of-scope sources remain
visible gaps. User data is separate from packaged toolkit code and contracts.

## Install and configure

Requires Node.js >=20.19.0, Git and the pinned OpenSpec 1.12.0 dependency.
Use `npm ci` in a source checkout. GitHub operations also require authenticated
gh >=2.88.0. Initialization does not install prerequisites or sign in.

For a development trial, select a separate npm prefix and the exact executable:

```sh
cd /absolute/selected-development-checkout
npm_config_prefix=/absolute/trial-prefix npm link
/absolute/trial-prefix/bin/assuredloop --help
/absolute/trial-prefix/bin/assuredloop init --target /absolute/consumer --config /absolute/config.json --local-only
```

Actual npm package-root links use `linked-development` with
`toolkit_verification: not-performed`: no toolkit archive, source, dependency,
Git-cleanliness or integrity audit. Consumer records, fixed policy, source
permissions and freshness still apply. Direct-source invocation and ordinary
executable shims retain their existing verification mode.

Build a real configuration from [the example](templates/records/config.json)
and [schema](schemas/workflow.schema.json). Bind the consumer repository,
OpenSpec root, selected native tool roots, category labels and allowed source
repositories. The review default supplies only a context budget; it does not
choose a model, role, review method or second provider. Existing explicit
consumer review constraints remain checked, not silently relaxed.

`init` previews files. Add `--apply` to write them. Existing differing files
are conflicts, not overwrite permission. `--provision-labels` previews missing
mapped labels; applying it creates only those missing labels. Existing metadata
is preserved. Partial effects return exit 1 and per-operation outcomes; inspect
them and make a fresh preview. No rollback deletion is performed.
`--local-only` skips GitHub checks and cannot provision labels.

Installation is not policy acceptance, activation or Brownfield conversion.
The consumer's existing requirements stay separate from toolkit contracts.
See [adoption guidance](skills/assuredloop-adopt/SKILL.md).

## Use the toolkit in your workflow

| Operation | What it provides |
| --- | --- |
| `validate` | Local preflight of a complete Issue, PR or evidence Markdown body |
| `inspect` | Bounded, paginated source context and relationship inventory |
| `check` | Full mechanical diagnostics, evidence applicability and synchronization results |
| `init` | Explicit configuration/discovery preview and scoped installation |
| `generate-contracts` | Reproducible package contracts from fixed committed native Specs |

```sh
assuredloop validate --kind evidence --file /absolute/comment.md --record /absolute/intended.json
assuredloop inspect --target /absolute/consumer --work OWNER/REPO#NUMBER
assuredloop check --target /absolute/consumer --work OWNER/REPO#NUMBER
```

Local `validate` needs no repository setup, network or credentials. It uses the
same canonical parser/schema as source discovery. Exactly one JSON fence belongs
under `## Workflow context`; quoted examples and other headings are not records.
Optional `--record` compares the parsed JSON with the intended object.
Publication-valid `fail`, `revise` and `incomplete` reviews are valid records,
not passing review outcomes. See [record guidance](templates/README.md).

`inspect` and `check` are read-only. A pass does not prove meaning, authority,
whole-scope completeness or merge permission. Source content is data, not a
command to run. GitHub Issues/PRs are the current work adapter; another task
backend, provider orchestration and CI installation are not supplied here.

`inspect` defaults to a complete response-page budget of 65536 bytes and inline
depth 1. `--max-inline-bytes` can narrow the accepted configuration budget.
Follow `packet.next_cursor` with `--cursor`; expand an exact discovered reference
with `--expand`. Missing, denied, outside-depth and over-budget references remain
distinct. Do not combine stale cursor pages. Irreducible metadata returns
`packet-limit`. `check` has a full non-paginated report; it is not a packet page.
Separate calls acquire fresh snapshots.

PR checks use the actual destination's pre-change policy; non-PR inspection uses
the current default branch. Historical assessments retain their original tuple
and verdict, with explicit reasons when they cannot supply current credit.
Unsupported historical policy remains unavailable, not retroactively rejected.
Acquisition permissions come from the current invocation and cannot be widened by
historical records or prerequisite links. Each operation shares source reads and
separately checks final mutable-source freshness.

## Trace and synchronization

Use [the shared record contract](templates/README.md#classify-the-assigned-work)
for the current GitHub adapter's category/activity labels. These describe records,
not mandatory roles or a Skill dispatcher. A rough Request can remain incomplete;
a small follow-up may reference existing requirements without a new Proposal.

Canonical task ownership in native `tasks.md` uses:

```markdown
## 1. Selected contribution
Work Issue: [Implementation](https://github.com/OWNER/REPO/issues/NUMBER)

- [ ] 1.1 Implement the accepted behavior
```

Issue/PR `plan_items` point to the fixed tasks revision and actual item IDs.
Parent membership is not an execution dependency. An Issue prerequisite means its
whole current assigned scope; a PR prerequisite means that fixed delivered
contribution. Reopened broader work must not silently reinterpret an existing
dependency. Preserve decisions and old references when reconciling it.

Synchronization uses native OpenSpec and the fixed whole-change delta. The check
compares current/base/candidate requirements, inbound links and manifest evidence.
Optional `--delta-ref` and `--manifest-ref` select exact JSON RepoRefs when needed.
A native accepted `skip_specs` requires identical full Spec inventory/raw bytes,
not merely no visible Spec diff. See [synchronization guidance](skills/assuredloop-sync/SKILL.md).

## Skills and limits

Only four tool-operation Skills are packaged:
[adopt](skills/assuredloop-adopt/SKILL.md),
[record](skills/assuredloop-record/SKILL.md),
[context](skills/assuredloop-context/SKILL.md) and
[sync](skills/assuredloop-sync/SKILL.md).

Older installed work-role Skill copies are not automatically removed. Inspect
their exact paths and obtain scoped removal approval; preserve native/user Skills
and locally edited content. Initialization reports conflicts, not an upgrade plan.

Optional informal notes can live under `.assuredloop/notes/`. They may be obsolete
and are excluded from formal synchronization, not promoted to accepted requirements.
Logs, credentials and private consumer data do not belong in packaged assets.
Historical changes and fixtures document earlier behavior; they are not current
instructions or proof that a new candidate passed.

The package is private and packable; no registry release or installed consumer
upgrade is claimed. The CLI does not synchronize files, publish reviews, merge,
archive, close Issues or select the humans/agents who do those things.
