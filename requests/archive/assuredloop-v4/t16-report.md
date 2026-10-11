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
- With one agent doing the work and the records (#197, section 9), the
  records cost 0.29 of the work on small changes and 0.80 on a big change,
  by the context at the end of the run, and 0.87 and 2.36 by all the input
  the agent read (the runs without the helpers they started). The target
  of about 0.2 is still not met.
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
the work agent's tokens. The token counts in this section are the ones the
harness reported for each run. Section 9 shows what such a count measures,
and recounts this section from the transcripts. "Records" holds every records-agent run of the case,
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
- **A separate records agent.** As in validation, the records agent is not
  the work agent, so it pays its own fixed cost of reading the skill and
  the records. One agent that does both may read less twice; that is a
  hypothesis. The marginal cost of the records for such an agent was not
  measured.
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

## 9. One agent: the marginal cost of the records (#197)

Issue #197 asks what the records cost when one agent does the work and the
records together, as in use, for the owner's decision on R12.

### What a token count measures

- The harness reports one count each time a run stops. In the 38 stops of
  the #197 runs, that count was the size of the context of the run's last
  API call in that segment, plus 51 to 593 tokens (about the size of the
  last output). This is what was observed; how the harness computes the
  count is not documented, and this report does not know it.
- So a resumed run reports its earlier context again. Section 4 adds the
  segments of a resumed agent, so it counts that context more than once, in
  the work and in the records alike. Validation added them the same way.
- The count of a run does not include the subagents that the run started
  (its helpers; see below). They have their own transcripts.
- This section counts three measures from the transcripts, call by call:
  - **context at the end:** once per agent, the measure nearest to the
    harness's count;
  - **new input:** the input that was not read from the cache;
  - **all input read:** every call's whole input, the cache reads included.
    An agent rereads its whole context on each call, so more calls cost more.
- Output is left out: the transcripts record only start-of-stream output
  counts, and the output is small beside the input.
- Which measure follows the money depends on the price of cached input, and
  this report does not set that.

### Helpers

Nine developer runs started their own subagents: a test author and a
reviewer, as the session's working rules ask. The agents ran in a session
whose rules say that a different author writes the tests and a fresh agent
reviews the change. Neither the skill nor the prompts asked for them.
- T16: the work agents of DC04 and DC05, two helpers each (911k and 721k of
  input read). The harness counts of section 4 do not include them, and the
  recount below leaves them out too.
- #197: both arms of DC04 in both runs, and the work-only arm of DC02 run 1,
  two helpers each. So the arms did not start helpers evenly.
- Below, "the run alone" leaves the helpers out, and "with helpers" adds
  them. The run alone is the main measure, because the helpers come from
  the session's rules and not from the arm.

### T16 recounted

The T16 runs of section 4, the runs alone, counted from the transcripts.
Section 4's grouping is kept.

| Group | Records / work, context at the end | Records / work, new input | Records / work, all input read | (Records + corrections) / work, all input read |
|---|---|---|---|---|
| small: DC01, DC02, DC03 | 1.22 | 1.26 | 2.14 | 2.14 |
| big: DC04, DC06 | 1.14 | 1.01 | 1.48 | 2.23 |
| epic part: DC05 | 0.88 | 0.76 | 0.57 | 0.90 |

- The context-at-the-end ratios stay near section 4's ratios (1.20, 1.20,
  0.78). Counting a resumed agent more than once raised the work and the
  records alike.
- By all input read, the records cost more than section 4 shows on small
  changes: their agents make more calls than the work agents.

### The runs

- **Arms:** the same model (`claude-opus-5-5`) does the same case from the
  same start, in one agent each time:
  - **skill:** AGENTS.md names the v4 skill, and the prompt says to keep the
    records it asks for;
  - **work only:** no AGENTS.md, and the prompt says to write no records.
  The two prompts differ in that one paragraph only. Both arms commit on a
  branch and write the PR text.
- **Cases:** DC01, DC02 and DC03 (small) and DC04 (big), two runs of each arm:
  16 developer runs. They ask the owner when they need to, as in T16. The
  owner agents are counted apart: 11 owner runs, 4 for DC02 and 7 for DC04.
- **The tool:** al v4 at main ac9e534 (T16 used 3178c93).
- **Checks of the result:**
  - Each skill run claimed the expected path (0, 1, 1d, 2), and `al check`
    gives no `not ok` at its head.
  - No work-only run wrote a request, a marker or a file in `.assuredloop/`.

### Results

The marginal cost is (skill - work only) / work only.

The runs alone:

| Case | Run | Skill, all input read | Work only, all input read | Marginal, all input read | Marginal, new input | Marginal, context at the end |
|---|---|---|---|---|---|---|
| DC01 | 1 | 254k | 134k | 0.90 | 0.32 | 0.25 |
| DC01 | 2 | 253k | 132k | 0.92 | 0.36 | 0.28 |
| DC02 | 1 | 1066k | 892k | 0.19 | -0.01 | 0.02 |
| DC02 | 2 | 672k | 432k | 0.56 | 0.22 | 0.19 |
| DC03 | 1 | 666k | 181k | 2.67 | 0.51 | 0.42 |
| DC03 | 2 | 774k | 197k | 2.93 | 0.98 | 0.79 |
| DC04 | 1 | 3901k | 1271k | 2.07 | 0.74 | 0.68 |
| DC04 | 2 | 4289k | 1164k | 2.68 | 1.04 | 0.93 |

| Group, both runs | Marginal, all input read | Marginal, new input | Marginal, context at the end | Range of the runs, all input read |
|---|---|---|---|---|
| small: DC01, DC02, DC03, the runs alone | 0.87 | 0.35 | 0.29 | 0.19 to 2.93 |
| big: DC04, the runs alone | 2.36 | 0.88 | 0.80 | 2.07 to 2.68 |
| small, with helpers | 0.60 | 0.04 | 0.00 | -0.13 to 2.93 |
| big, with helpers | 1.68 | 0.52 | 0.46 | 1.31 to 2.13 |

- **Beside the separate agent:** by the context at the end, the runs alone,
  one agent's records cost 0.29 of the work on small changes and 0.80 on the
  big change. The separate records agent of T16 cost 1.22 and 1.14 by the
  same measure. These ratios differ, but the comparison does not show why:
  the tool version, the work and the big group (DC04 and DC06 in T16, DC04
  alone here) differ too. That the separate agent paid mostly for its own
  reading is a hypothesis, not a measurement.
- **By all input read** the cost is higher: 0.87 on small changes and 2.36 on
  the big change. The skill runs make more calls (`al` commands, record
  files), and each call reads the whole context again.
- **With helpers** the small-change cost falls to about zero by the context
  at the end, because only the work-only arm of DC02 run 1 started helpers.
  That is the session's rules at work, not the records.
- **Against R12** (about 0.2, flexible): the target is not met on any
  measure of the runs alone. The nearest is the context at the end on small
  changes, 0.29.
- **The spread is large.** DC02 run 1 cost almost nothing more (0.02 by the
  context at the end): its work-only agent also asked the owner, and made
  22 calls against the skill agent's 25. DC03 cost the most of the small
  cases: a one-word rename became a path-1d request with its own records.

### Limits

- Two runs for each case and arm, one model family, a small invented fixture.
- Every agent ran with the session's own working rules in its context. They
  made some runs start helpers, unevenly between the arms, and they add the
  same fixed context to both arms.
- The work-only arm worked in a repo that still has the markers and the
  records, so it could read them. A repo with no AssuredLoop at all was not
  measured.
- The work itself can differ between the arms. For example, the work-only
  agents of DC02 also asked the owner to agree a requirement.
- Times are wall times of runs that ran eight at a time on a shared machine,
  so they are not compared here.
- The al version differs from T16's. Both arms of #197 used the same one.

### The data

In the same bots repository as section 8:
- `validation/v4/t16/extract.py` and `usage_from_transcript.py` read the
  transcripts.
- They write one row of numbers for each API call: `runs/calls-rows.jsonl`
  for T16 and `marginal/runs/calls-rows.jsonl` for #197. A row holds the
  run, the agent, whether the agent is a helper, the segment, the message
  ID, the new input and the cache reads.
- `recount.py` and `marginal/score.py` print the tables above from those
  rows.
- The prompts, the owner chats, the PR texts, the diffs and the harness's
  own counts are in `marginal/runs/` (`raw/`, `usage.jsonl`, `agents.txt`).
- The transcripts are not kept, because they hold session text that is not
  part of this work. So the extraction itself cannot be checked again from
  the repository; the rows can.
