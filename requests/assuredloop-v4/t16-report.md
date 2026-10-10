# AssuredLoop v4: T16, the skill on real agent runs, the cost account and the markers

This report covers task T16 of `tasks.md` (issue #193): a fresh agent follows
the v4 skill through each path on the invoicer fixture, a reviewer reads the
result, and the runs give the cost account of design.md 16 and the marker
counts. It decides nothing; the architect decides what follows from it.

## 1. The answer

- Fresh agents followed the v4 skill (`skills/assuredloop/SKILL-v4.md`)
  through each path: 0, 1, 1d, 2, 3 and S, and adoption with the README
  (`README-v4.md`). Each records agent chose the path that the T2 case
  expects. At each PR head, `al check` gives no `not ok`, except on the
  adoption PR (section 6, gap 1).
- The reviewers approved paths 0, 1, 1d and adoption. They asked for changes
  on paths 2, 3 and S. After one correction round, no blocking finding on
  the records stays; the blocking findings that stay are on the work.
- The records cost 1.20 times the work on the small changes and on the big
  changes, and 0.78 times on the epic part. Validation gave 1.51, 1.56 and
  1.23 for the same groups. With the correction round, the big changes cost
  1.80 and the epic part 1.66. R12 asks for about 0.2. The target is not
  met on any path.
- No agent lost a marker. In 20 edits of marked text, made by two agents
  that were not told about markers in their prompt, every marker stayed as
  it was, with its blank lines. In the six path runs, no marker was lost.

## 2. What was run

- **The tool:** al v4 at commit 3178c93 (main before #192), as
  `node bin/al-v4.js`, through a shim named `al`. Every run used the same
  commit.
- **The model:** every agent was a Claude Code subagent (general-purpose)
  on `claude-opus-5-5`. One model family played every role.
- **The world:** the `base` case of `test/v4/fixtures/invoicer/`, built by
  its helper and merged into main, with the user document `docs/exports.md`
  and two output repos with code (`invoicer-web`, `invoicer-worker`) from
  the validation fixtures, listed in the central config. `adopt-tiny`, an
  unadopted project, is the adoption case. The central AGENTS.md names the
  v4 skill, as an adopter's would.
- **The cases:** the T2 developer cases DC01-DC06 and DC09, one for each
  path: the owner's words, the owner's brief and the review questions. DC07
  (two parallel changes) and DC08 (the non-code project) did not run: they
  repeat path 2.
- **The roles,** as in validation (T3):
  1. A work agent does the change: spec text, change spec text, code,
     tests and documents. It reads AGENTS.md and the skill, and may run
     `al context`, `al search` and `al spec`. It writes no records.
  2. A records agent follows the skill: it chooses the path, writes the
     request, the markers and the records, runs `al`, and commits on a
     branch with the path claim.
  3. An owner agent answers questions and signs, from the T2 brief.
  4. A reviewer reads the PR, the diff and the repos, may run the read-only
     `al` views, answers the T2 questions, and gives a verdict with
     findings marked "records" or "work".
  5. A correction round: when a review blocks on the records, the records
     agent fixes those findings, and the reviewer reviews again. One round
     at most.
- **The marker trial:** two agents each made the same ten edits of marked
  text (rewording, a moved section, a list, a rewritten section, a swap of
  two paragraphs). Their prompt named AGENTS.md and the skill, and did not
  name markers.
- **Agent runs:** 40 in all: 32 counted path runs, 2 marker-trial runs, 1
  test author for the docs test (not in the account), and 5 runs that
  stopped on an account usage limit. The 5 stopped runs are not counted;
  DC04 and DC05 ran again from a fresh state, and the DC02 review ran again.
- Token counts and times are per agent run, as the harness reported them.

## 3. The skill through each path

| Case | Path | The records agent's claim | First review | Right answers | After the correction round |
|---|---|---|---|---|---|
| DC01 | 0 | `Tier: 0 — typo in INV-3` | approve | 2/2 | - |
| DC02 | 1 | `Tier: 1 — adds INV-17, beside INV-10` | approve | 1/2 (see below) | - |
| DC03 | 1d | `Tier: 1d — renames "link service" to "link store" in EXP-6 …` | approve | 2/2 | - |
| DC04 | 2 | `Tier: 2 — part-payments` | request-changes: 2 blocking on records, 2 on work | 2/2 | request-changes: 0 blocking on records, 2 on work |
| DC05 | 3 | `Tier: 3 — invoice-exports part 2 …; concludes invoice-exports` | request-changes: 1 blocking on records, 1 on work | 2/3 | request-changes: 0 blocking on records, 1 on work |
| DC06 | S | `Tier: S — concludes link-expiry-spike (answer to Q1 version 1)` | request-changes: 1 blocking on work | 3/3 | - |
| DC09 | adoption | `Tier: 0 — adds paragraph IDs; no promise changes` | approve | 3/3 | - |

- DC02: the owner signed R1. The developer added a new rule, INV-17, and
  left INV-10 as it was. So question DC02-Q2 ("which open change builds on
  INV-10 and now needs to be aligned?") has the answer "none" for this PR;
  the T2 key expected reminder-emails/SP-4, which is right only when INV-10
  changes. The reviewer answered "none".
- DC04: the owner answered four questions and signed R1-R3. The first
  review blocked on two records points: three paragraphs consolidated into
  `specs/` while no code delivered them, and a change to EXP-7 with no
  change paragraph and no disposition. The records agent kept the three
  paragraphs in the change spec and recorded EXP-7. The blocking work
  points (no migration for stored invoices; a user document that describes
  a CSV column the code does not write) stay with the developer.
- DC05: the agent consolidated SP-7, SP-10, SP-11 and SP-12, recorded their
  dispositions and concluded invoice-exports. The first review blocked
  because the new code cited the archived SP IDs, not the new EXP IDs, so
  `al context` showed the rule with no check. After the correction, the
  blocking point left is on the work: which date puts an invoice in a month.
  DC05-Q1 expected SP-7, SP-10 and SP-11; the reviewer also named SP-12, a
  rationale, which has a baseline effect in the final design (decision D2).
- DC06: the reviewer blocked on the findings' reasoning (14 calls against
  3 compares two candidates that differ in two ways), not on the records.
- DC09: the adoption PR followed README-v4, with the adoption record written
  by hand. `al check` gives 10 `not ok` on it (section 6, gap 1); the
  reviewer approved and named this as a tool limit.

## 4. The cost account

The ratio is the one of validation.md: the records agent's tokens divided by
the work agent's tokens. "Records" holds every records-agent run of the case,
the one after an owner's answer included. "Corrections" is the correction
round of a records agent. Time is the wall time of the agent run.

| Case | Path | Work | Records | Corrections | Owner (runs) | Review | Repeat review | Records / work | (Records + corrections) / work | Validation, full arm |
|---|---|---|---|---|---|---|---|---|---|---|
| DC01 | 0 | 35k, 22 s | 39k, 35 s | 0 | 0 | 42k | 0 | 1.12 | 1.12 | 1.20 |
| DC02 | 1 | 83k, 59 s | 94k, 160 s | 0 | 48k (2) | 57k | 0 | 1.14 | 1.14 | 1.45 |
| DC03 | 1d | 43k, 41 s | 61k, 108 s | 0 | 0 | 61k | 0 | 1.40 | 1.40 | 2.07 |
| DC04 | 2 | 117k, 427 s | 152k, 437 s | 96k | 48k (2) | 89k | 102k | 1.30 | 2.12 | 1.62 |
| DC05 | 3 | 79k, 618 s | 61k, 96 s | 69k | 0 | 75k | 82k | 0.78 | 1.66 | 1.23 |
| DC06 | S | 45k, 62 s | 43k, 57 s | 0 | 0 | 43k | 0 | 0.95 | 0.95 | 1.82 |
| DC09 | adoption | no work agent | 48k, 70 s | 0 | 0 | 51k | 0 | - | - | 1.41 |

By group, small changes and the epic apart:

| Group | Work | Records | Corrections | Records / work, tokens | (Records + corrections) / work | Records / work, time | Owner | Review and repeat review | Validation, full arm, same cases |
|---|---|---|---|---|---|---|---|---|---|
| small: DC01, DC02, DC03 | 161k, 122 s | 194k, 302 s | 0 | 1.20 | 1.20 | 2.48 | 48k | 160k | 1.54 (1.51 with DC09) |
| big: DC04, DC06 | 162k, 489 s | 195k, 494 s | 96k | 1.20 | 1.80 | 1.01 | 48k | 233k | 1.66 (1.56 with DC07, DC08) |
| epic part: DC05 | 79k, 618 s | 61k, 96 s | 69k | 0.78 | 1.66 | 0.16 | 0 | 157k | 1.23 |
| adoption: DC09 | none | 48k, 70 s | 0 | - | - | - | 0 | 51k | 1.41 |

Owner questions and sign-offs, apart: DC02 and DC04 each had two owner runs
(questions from the work agent, then the sign-off asked by the records
agent), 24k tokens and 3-6 s each. The other cases had none.

What the account counts:
- **Record creation:** the records agent's runs, with its reading of the
  skill and the records, and its `al` commands.
- **Indexing:** inside the records runs. Unlike validation, `al index` ran
  inside the agent, so its cost is in "records".
- **Corrections:** the correction round after a review that blocked on the
  records (DC04, DC05).
- **Review and repeated review:** apart, because a reviewer reads the work
  and the records together and its cost cannot be split between them.

What the account leaves out, or cannot isolate:
- **Reading the records inside the work:** the work agent reads AGENTS.md,
  the skill and `al context`. That cost is in "work", as in validation.
- **Corrections of the work:** the blocking work findings of DC04, DC05 and
  DC06 got no fix round. A fix of the work is work, not records.
- **A resumed run's carried context.** An agent that was resumed (after an
  owner's answer, a correction, a repeat review) reported a count that seems
  to include the context it carried: the repeat reviews reported 82k and
  102k tokens with 5-6 tool uses in 27-28 s. So the counts of resumed runs
  are probably higher than the new work in them. Validation's "after" runs
  had the same form.
- **The adoption case** had no work agent, so it has no ratio.
- **The skill's own effect cannot be separated** from the change of tool and
  fixture: the v4 product with its skill replaced a written model with
  guides, so the drop from validation is the sum of all changes.

Against the target: R12 asks for about a fifth (0.2), as a flexible target.
The ratio dropped from 1.5-1.7 to 1.2 on small and big changes, and to 0.8 on
the epic part, before corrections. It is still about six times the target.
On these small changes, the fixed cost of reading the skill and the records
is most of the records cost: the records agent of a one-word typo fix used
39k tokens.

## 5. Marker preservation

Measured by a script that compares the markers at main with the files after
the agent (`validation/v4/t16/run.mjs markers`): for each marker at main, the
ID is still there, the marker line is the same, and the blank lines stay. It
does not use `al`, and the agents measured did not run `al check`, the lint
that finds a lost ID.

| Runs | Measured after | Marked paragraphs edited | Markers kept, line unchanged, framed |
|---|---|---|---|
| Marker trial M1, M2 (10 edits each, no `al check`) | the agent | 20 | 20 |
| Work agents DC01, DC02, DC03, DC06 (no `al check`) | the work agent | 4 (INV-3, a new rule beside INV-10, SP-9, EXP-6) | 4 |
| All six path cases | the PR head, after the records agent (which ran `al check`) | 4 | 4 IDs kept; 1 marker line changed on purpose (INV-8 gained `serves:part-payments/R1`) |

- The trial's edits moved a whole section, made a paragraph into a list,
  rewrote a whole section of three paragraphs and swapped two paragraphs.
  No marker was lost, changed or unframed.
- DC04 and DC05 were measured only at the PR head: their work state was
  committed together with the records.
- The trial prompt said nothing about markers; the skill says to keep them. One
  trial agent also said that three of the ten "wording" edits change a
  promise and need a request.
- Not measured: an agent with no skill at all, and edits that merge or
  split paragraphs, where an ID must go or come.

## 6. Gaps found (for the architect)

These are findings about `al`, not changes made here (the issue's boundary).

1. **Adoption in a PR gives `not ok`.** On a branch that adds markers to an
   unmarked spec, `al check` reads every adopted paragraph as new: a
   `signoff-coverage` and a `path-claim` `not ok` for each promise paragraph
   (10 on DC09). The adoption record with `source: adoption` on the same
   branch does not change that. Under `--strict` the PR fails. README-v4
   states this as it is today.
2. **No command writes the adoption record.** README-v4 tells the user to
   write `adoption.yaml` by hand, with the hashes copied from the per-doc
   record (decision D16 says T17's command will write it).
3. **The path-1 Outcome misses the spec link.** `al conclude` on a path-1
   request writes "no change paragraph serves it" for R1, even when the spec
   paragraph says `serves:<request>/R1`.
4. **No `al --version` in v4.** v1 has it; `bin/al-v4.js` refuses it as an
   unknown command. README-v4 does not name it.
5. **`Next` says "fix each not ok" when there is none** (on a typo branch
   whose only finding is the hint `no-link`).

## 7. Limits of this evidence

- One run for each path, and one model family for every role. A single
  run can change.
- The fixture is small and invented. The changes are small, so the fixed
  cost of the records is a large share.
- Validation ran a written model with guides; this ran the product with the
  skill. The fixture differs too: the converted test fixture, with code in
  two output repos.
- The account usage limit stopped five runs. They are not counted, and the
  three cases ran again from a fresh state. The disk that holds the harness
  was unreadable for an hour; no run used it, because every run worked in
  a scratch folder.
- The reviewer's area label (records or work) is the reviewer's own. In
  DC05 the blocking "records" finding was about citations in code comments.

## 8. Where the data is

The harness, the prompts, every agent's notes, PR text, owner chat, diff and
review, the usage log and the scores are in the architect's working notes:
`validation/v4/t16/` in the bots repository of the AssuredLoop bot
(`runs/usage.jsonl`, `runs/agents.txt`, `runs/raw/`, `runs/score.json`). They
are not in this repository.
