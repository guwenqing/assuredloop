# AssuredLoop v4: validation A (T1-T3) and B (T4-T5)

This report covers the tasks T1, T2 and T3 of `tasks.md` (issue #170) in
sections 1-12, and the tasks T4 and T5 (issue #171) in Part B. It gives the
evidence for T6. It decides nothing: the architect decides the model in T6.

## 1. The answer

- The lighter arm answered review questions as well as the full model, but
  its reviewers missed two planted defects that the full arm blocked. It
  answered 29 of 30 questions (full: 30). Its reviewers blocked 11 of 13
  applicable defects on the planted mechanism (full: 13 of 14). The lighter
  arm missed D04 (two changes with no `changes` links) and saw D07 (a stale
  base) only as a minor point. Its missed question (H02) needs the bindings.
- Every repaired control is valid. Audit agents checked the 18 repaired
  controls against the rules before their reviews were counted.
  After the repair, no reviewer in the full or lighter arm blocked a control.
  In today's arm, reviewers blocked 2 controls that the audit found valid
  (D04, D14): these are false alarms.
- The records cost more than the work in every arm: 1.3 to 1.6 times the
  tokens of the work agent for the small and the big changes, 0.9 to 1.2
  for the epic part (DC05), and 0.5 to 2.1 times for single cases. The 20%
  target was not met by any arm, today's 0.1.0 included. On these small
  changes, most of the cost is the fixed cost of reading the rules and the
  existing records.
- The v4 checks catch much more than 0.1.0, but reviewers block most defects
  from the diff without them. The tool caught 11 of 14 defects in the full
  arm, 8 of 13 in the lighter arm and 3 of 13 with the real `al` 0.1.0.
- The bindings changed one verdict: the full-arm reviewer blocked D07 on the
  stale base of reminder-emails/SP-4. The lighter and today's reviewers
  noticed the same problem only as a minor point. The full arm also answered
  H02, which needs the bindings. Each cell is one review, so this is one
  observation for each arm, not a rate.
- The stale AI-hint check (D08) fired. The full-arm reviewer asked for the
  hint to be refreshed, as a minor point, and approved the PR.
- Today's records answered 25 of 30 questions. The five it missed ask about
  open proposals, pending dispositions, task references, bindings and the
  inputs of a result, which 0.1.0 does not record.
- No agent lost a paragraph marker in 27 developer runs.

Section 9 lists the rules with the evidence for and against each one.

## 2. What was run, and what is a model

Run:
- Every agent: 313 subagent runs, all of one model family. These are the
  owner, developer, records writer, reviewer, answerer, fixture builder,
  control auditor and mechanism judge. 6 runs are invalid and 36 were
  replaced by a rerun; the raw logs keep all of them.
- The real `al` 0.1.0 (`@assuredloop/cli`, version 0.1.0) on today's arm: it
  built every state with real git history and real `al` commands, and its
  `al check --all` and `al context` output is what today's reviewers saw.

How each score was made:
- Exact checks by a script: the questions (a choice letter, yes or no, a set
  of IDs), the retrieval recall, the tool catches, the ID-based reviewer
  catch of the first run, the developer-case questions, the lost markers and
  the costs.
- LLM judges: whether a review finding names the planted mechanism (section
  5). Two judge agents labelled each of the 208 findings of the 84 defect
  reviews. They did not see the arm, and they did not see whether the PR
  was the defect or the control. They saw only the planted mechanism and the
  findings. A finding counts only when both judges say yes; this rule was
  set before the labels were read. The judges agreed on 207 of 208 findings
  (Cohen's kappa 0.99). The prompt, both label sets, both judges' notes and
  the one disagreement are in the raw logs.
- LLM audits: whether a control is valid (section 5). Four audit agents
  read the rules and the 18 repaired controls.

A written model, not a product test:
- The v4 checks, the close rule, the views and the index. A Node script
  outside `src/` gives what `al check`, `al context`, the review view and
  `al conclude` would show under `design.md`. The full and lighter reviewers
  saw its output as their tool output. It was checked against the expected
  verdicts that the T2 author wrote (section 7).
- Search levels 0 and 1: a word-overlap scan and a `node:sqlite` FTS5 index
  over an export with roles. Level 2 (embeddings) was not modelled.

No result here is a measurement of v4 product code: there is none yet.

## 3. Set-up

### The fixtures (T1)

- A central repo `invoicer` (specs `invoices.md` and `exports.md`, ADR-1 to
  ADR-4, an open epic, an open big change, an open spike, an archived
  change), three output repos (`invoicer-web`, `invoicer-worker`, and
  `invoicer-mobile`, which is listed but absent), a non-code report project,
  and an unadopted project for the adoption path.
- 11 case states for the close rule, search and results, and 30 states for
  the planted defects, their controls and their two pre-states. Each state
  is an overlay on the base or on another case.
- The T1 check passes over all 42 states (the base included): every link kind of `schema.md`
  section 6 appears, every record kind of section 8 is present, all YAML
  parses, and no marker lint fires.
- The lighter arm is made from the full fixtures by a script. Today's arm
  is built again in the 0.1.0 format, with the same story, texts and IDs.

### The questions, defects and dev cases (T2)

A separate subagent wrote them from `design.md` and the fixture texts. It
wrote no record. It found 15 problems in the fixtures (one was a test that
did not test expiry; it is kept as an unplanted defect, H01).
- 30 review questions, 10 of them held out: no records writer saw them.
- 14 planted defects (D01-D14), each with a control of the same shape,
  covering every defect of `design.md` 15.
- 9 developer cases (DC01-DC09), one for each path, with the owner's words,
  the owner's answers, and 21 review questions on the resulting PR.

The review of this report found that 4 controls were not clean (section 5).
A second spec agent, which wrote no fixture, wrote the repaired pairs. A
builder agent built them, and audit agents checked them.

### The arms (architect's decisions, 2026-10-10)

- Full: `design.md` and `schema.md` as written. One fix by the architect: a
  promise paragraph edited on path 1 uses `serves:<request>/R<n>` in its
  marker and binding, and `from` is only for a requirement to the owner's
  words (section 8, item 1).
- Lighter: the same texts and IDs. Each marker keeps its ID and kind. It
  keeps the sources, requirement versions, sign-offs, decisions, task
  references, results with their commit, and dispositions. It drops the
  marker links, the bindings, the AI hints and the declared outputs.
- Today: the records of AssuredLoop 0.1.0, built and checked with the real
  `al` 0.1.0.

Every reviewer and answerer got the same one-page project rules and a guide
to its arm's records. Reviewers were not told whether a PR held a planted
defect.

### The simulation (T3)

- Questions: one answerer for each fixture state and arm (36 runs).
- Defects: one reviewer for each PR and arm, 84 PRs, under shuffled names.
  The repaired pairs were reviewed again by new reviewers (36 reruns).
- Developer cases: for each case and arm, a work agent (the change itself), a
  records agent (everything the arm records), an owner agent (answers and
  sign-offs, from the T2 brief), and a reviewer. DC07 had two developers in
  parallel on one paragraph.

## 4. Questions (30, 10 held out)

| Arm | Right | Visible | Held out | Recall of expected IDs | Recall without SP-n IDs | Tokens per answerer | Time per answerer |
|---|---|---|---|---|---|---|---|
| full | 30/30 | 20/20 | 10/10 | 0.88 | 0.90 | 41k | 25 s |
| lighter | 29/30 | 20/20 | 9/10 | 0.92 | 0.94 | 40k | 23 s |
| today | 25/30 | 17/20 | 8/10 | 0.50 | 0.88 | 39k | 35 s |

- Lighter missed H02: which outputs still name a paragraph after it changed.
  Only the bindings record that.
- Today missed Q02 and Q04 (an open proposal and the pending parts of an
  epic), Q18 (the PRs that name a task), H02, and H05 (a result whose
  undeclared input changed). 0.1.0 records none of these as data.
- Recall: 0.1.0 has no ID for a change-spec paragraph (SP-n). Without those
  IDs, today's recall is 0.88.
- Held-out and visible questions scored the same in the v4 arms. No sign of
  records written to fit the questions.
- No question uses a state that the repairs of section 5 changed.

## 5. Planted defects (14 pairs, 84 reviews)

"Reviewer catch": the verdict is request-changes, and a blocking finding
names the planted mechanism (both judges agree). "Noticed": a finding of any
severity names the mechanism. "Clean catch": a reviewer catch, and the
control was approved. "Controls flagged": the control got request-changes.

| Arm | Pairs | Reviewer catch | Noticed, any severity | Noticed, minor only | Clean catch | Controls flagged | Tool catch | Tokens per review | Time per review |
|---|---|---|---|---|---|---|---|---|---|
| full | 14 | 13 | 14 | 1 (D08) | 13 | 0 | 11 | 46k | 43 s |
| lighter | 13 | 11 | 12 | 1 (D07) | 11 | 0 | 8 | 42k | 41 s |
| today | 13 | 12 | 13 | 1 (D07) | 10 | 2 | 3 | 41k | 45 s |

Each judge alone gives the same reviewer catch in every arm. D08 (a stale
AI summary) applies to the full arm only: the other arms keep no AI hints,
so its two PRs are the same there.

| Defect | Full | Lighter | Today (real `al` 0.1.0) |
|---|---|---|---|
| D01 unsigned promise change | caught clean; tool | caught clean; tool | caught clean; tool |
| D02 new rule labelled `data` | caught clean; tool | caught clean; tool | caught clean |
| D03 code-only change claimed as a fix | caught clean | caught clean | caught clean |
| D04 two changes, no `changes` links | caught clean; tool | missed | caught; control flagged |
| D05 test checks another condition | caught clean | caught clean | caught clean |
| D06 drifted consolidation | caught clean; tool | caught clean; tool | caught clean; tool |
| D07 stale base after indexing | caught clean; tool | minor only | minor only |
| D08 stale AI summary, quote survives | minor only; tool | not applicable | not applicable |
| D09 wrong path claim | caught clean; tool | caught clean; tool | caught clean; tool |
| D10 typo claim MUST → SHOULD | caught clean; tool | caught clean; tool | caught clean |
| D11 typo claim only → all | caught clean; tool | caught clean; tool | caught clean |
| D12 MUST MUST → MUST NOT (control: → MUST) | caught clean | caught clean | caught clean |
| D13 1d claim adds a component | caught clean; tool | caught clean; tool | caught clean |
| D14 trailing spaces in a code example | caught clean; tool | caught clean; tool | caught; control flagged |

"Tool" means the tool showed a finding on the defect that it did not show on
the control.

### The controls

The first run had controls that were not clean. Its reviewers flagged 7
controls in the full arm and 4 in each of the other arms. The review of
this report confirmed that each flag was a real problem in the control, not
a reviewer error:
- D01, D07, D09, and D10-D12 by their pre-state (full arm): the path-1
  marker `from:<request>/R1`, which `schema.md` 6 does not allow. The
  architect decided the link (section 8, item 1). The fixtures now use
  `serves`, and the 6 pairs were reviewed again in the full arm. The other
  arms have no marker links, so they did not change.
- D04: the two open changes contradicted each other (30 and 45 minutes).
  Now link-45 keeps the new link of link-refresh and orders itself after
  it, and both PRs are proposals.
- D06: no code delivered the yearly ZIP, but the PR closed the request. Now
  the worker PR with the ZIP code and its test merged first (a pre-state),
  and the PR does not close the request.
- D13: the 1d rename changed EXP-6, which an open change had incorporated
  (section 8, item 2). Now the pair renames INV-8, which no open change
  holds.
- D14: an unsigned promise was labelled `interface`. Now R1 is signed and
  the paragraph is a rule.

In D04, D06, D13 and D14 the defect changed in the same way as its control,
and both PRs were reviewed again in all three arms. The defect and its
control differ only in the planted mechanism; the builder checked each pair
by a diff. Audit agents found all 18 repaired controls valid (the 12 above and the 6
path-1 controls), with the rule cited for each point. One of them, the D01
control, is valid only under one reading of who aligns a stale binding
(section 8, item 12).

Two controls are still flagged, both in today's arm. The audit found both
valid, so they count as false alarms:
- D04: the reviewer followed the `al` 0.1.0 `not ok` "neither builds on the
  other". The two changes align in their text and plan, but link-45's
  0.1.0 block builds on invoice-exports, not on link-refresh. 0.1.0 also
  flags this control and not the defect.
- D14: the reviewer asked for the code that writes the CSV header. No repo
  holds it; the audit judged this inherited and not blocking.

The first run counted a catch when a blocking finding named one of the
defect's key IDs. That method scored a catch for full D07, but the blocking
finding was about the `from` link, and the control had the same finding.
The mechanism scores above replace it. The ID-based catch on the final
reviews is 13, 11 and 11; it is kept in the raw scores for comparison.

### Cost per pair (reviewer agents)

Each cell: tokens and time of the defect review, then of the control review.

| Pair | Full | Lighter | Today |
|---|---|---|---|
| D01 | 45k, 28 s / 49k, 55 s | 40k, 34 s / 45k, 49 s | 37k, 38 s / 43k, 60 s |
| D02 | 45k, 48 s / 55k, 68 s | 43k, 54 s / 45k, 57 s | 45k, 74 s / 42k, 60 s |
| D03 | 42k, 37 s / 45k, 43 s | 41k, 43 s / 42k, 37 s | 35k, 23 s / 41k, 49 s |
| D04 | 57k, 72 s / 65k, 101 s | 56k, 99 s / 50k, 55 s | 47k, 71 s / 49k, 71 s |
| D05 | 40k, 41 s / 43k, 67 s | 37k, 37 s / 42k, 48 s | 40k, 42 s / 40k, 46 s |
| D06 | 51k, 35 s / 55k, 59 s | 45k, 26 s / 50k, 50 s | 40k, 23 s / 46k, 58 s |
| D07 | 49k, 42 s / 48k, 47 s | 45k, 53 s / 45k, 61 s | 48k, 79 s / 45k, 68 s |
| D08 | 48k, 57 s / 49k, 59 s | 43k, 38 s / 47k, 62 s | 42k, 46 s / 43k, 63 s |
| D09 | 38k, 19 s / 45k, 46 s | 38k, 27 s / 43k, 43 s | 36k, 18 s / 41k, 48 s |
| D10 | 38k, 16 s / 44k, 35 s | 36k, 19 s / 39k, 31 s | 34k, 27 s / 35k, 30 s |
| D11 | 38k, 16 s / 39k, 26 s | 37k, 24 s / 39k, 32 s | 35k, 21 s / 35k, 26 s |
| D12 | 34k, 12 s / 42k, 30 s | 34k, 21 s / 37k, 24 s | 32k, 16 s / 35k, 27 s |
| D13 | 39k, 20 s / 42k, 27 s | 40k, 24 s / 40k, 27 s | 41k, 29 s / 40k, 43 s |
| D14 | 47k, 48 s / 51k, 48 s | 41k, 26 s / 50k, 52 s | 41k, 46 s / 46k, 63 s |

## 6. Developer cases (9 cases, 3 arms)

"Records / work" is the records agent's tokens over the work agent's tokens.
Time is the wall time of the agent run, not a person's time.

| Case | Path | Full: verdict, right, records/work | Lighter | Today |
|---|---|---|---|---|
| DC01 | 0, typo fix | approve, 2/2, 1.20 | approve, 2/2, 1.21 | approve, 2/2, 1.29 |
| DC02 | 1, small amend | approve, 1/2, 1.45 | approve, 2/2, 1.40 | approve, 2/2, 1.53 |
| DC03 | 1d, design correction | approve, 2/2, 2.07 | approve, 2/2, 1.59 | approve, 2/2, 2.01 |
| DC04 | 2, big change | request-changes, 2/2, 1.62 | request-changes, 2/2, 1.50 | request-changes, 2/2, 1.59 |
| DC05 | 3, epic part | request-changes, 2/3, 1.23 | request-changes, 3/3, 1.22 | request-changes, 2/3, 0.88 |
| DC06 | S, spike | request-changes, 3/3, 1.82 | request-changes, 3/3, 1.54 | request-changes, 3/3, 1.41 |
| DC07 | 2, two changes on one paragraph | request-changes, 1/2, 1.90 | request-changes, 1/2, 1.77 | request-changes, 1/2, 2.13 |
| DC08 | 2, non-code project | approve, 2/2, 0.54 | request-changes, 2/2, 0.48 | approve, 2/2, 0.73 |
| DC09 | adoption | approve, 3/3, 1.41 | approve, 3/3, 1.28 | approve, 2/3, 1.38 |

### Cost per case, arm and role

Each cell: work / records / owner / review.

| Case | Full tokens | Lighter tokens | Today tokens | Full time (s) | Lighter time (s) | Today time (s) | Owner runs (full/lighter/today) |
|---|---|---|---|---|---|---|---|
| DC01 | 31k / 38k / 0 / 39k | 31k / 38k / 0 / 42k | 30k / 39k / 0 / 33k | 22 / 33 / 0 / 26 | 27 / 59 / 0 / 26 | 19 / 31 / 0 / 19 | 0/0/0 |
| DC02 | 85k / 123k / 51k / 54k | 78k / 109k / 50k / 54k | 81k / 123k / 51k / 52k | 60 / 323 / 27 / 75 | 64 / 282 / 17 / 64 | 110 / 304 / 13 / 111 | 2/2/2 |
| DC03 | 33k / 68k / 0 / 53k | 35k / 56k / 0 / 51k | 32k / 63k / 0 / 47k | 32 / 169 / 0 / 67 | 39 / 121 / 0 / 69 | 28 / 162 / 0 / 70 | 0/0/0 |
| DC04 | 120k / 194k / 51k / 86k | 144k / 216k / 51k / 79k | 115k / 183k / 51k / 73k | 388 / 584 / 16 / 121 | 681 / 423 / 19 / 112 | 727 / 584 / 11 / 168 | 2/2/2 |
| DC05 | 59k / 72k / 0 / 74k | 58k / 71k / 0 / 61k | 73k / 64k / 0 / 58k | 141 / 190 / 0 / 121 | 178 / 188 / 0 / 84 | 376 / 148 / 0 / 114 | 0/0/0 |
| DC06 | 37k / 67k / 0 / 51k | 37k / 56k / 0 / 46k | 36k / 51k / 0 / 36k | 40 / 174 / 0 / 56 | 43 / 138 / 0 / 38 | 46 / 92 / 0 / 32 | 0/0/0 |
| DC07 | 182k / 346k / 102k / 79k | 149k / 263k / 76k / 69k | 124k / 265k / 76k / 55k | 453 / 584 / 31 / 94 | 298 / 554 / 22 / 100 | 222 / 656 / 28 / 88 | 4/3/3 |
| DC08 | 78k / 42k / 26k / 48k | 118k / 57k / 52k / 50k | 72k / 52k / 26k / 42k | 70 / 82 / 7 / 55 | 97 / 164 / 13 / 92 | 133 / 102 / 6 / 57 | 1/2/1 |
| DC09 | 32k / 45k / 0 / 45k | 33k / 42k / 0 / 42k | 32k / 44k / 0 / 35k | 29 / 74 / 0 / 45 | 27 / 64 / 0 / 43 | 33 / 67 / 0 / 39 | 0/0/0 |

By group, with the epic apart:

| Arm | Group | Work | Records | Records / work, tokens | Records / work, time | Owner | Review |
|---|---|---|---|---|---|---|---|
| full | small: DC01, DC02, DC03, DC09 | 181k, 143 s | 275k, 599 s | 1.51 | 4.18 | 51k, 27 s | 191k, 213 s |
| full | big: DC04, DC06, DC07, DC08 | 417k, 950 s | 649k, 1425 s | 1.56 | 1.50 | 179k, 54 s | 263k, 325 s |
| full | epic part: DC05 | 59k, 141 s | 72k, 190 s | 1.23 | 1.35 | 0 | 74k, 121 s |
| lighter | small | 178k, 157 s | 245k, 526 s | 1.38 | 3.36 | 50k, 17 s | 189k, 203 s |
| lighter | big | 448k, 1118 s | 593k, 1279 s | 1.32 | 1.14 | 179k, 54 s | 244k, 342 s |
| lighter | epic part | 58k, 178 s | 71k, 188 s | 1.22 | 1.05 | 0 | 61k, 84 s |
| today | small | 174k, 190 s | 269k, 564 s | 1.55 | 2.96 | 51k, 13 s | 167k, 239 s |
| today | big | 347k, 1128 s | 551k, 1433 s | 1.59 | 1.27 | 153k, 45 s | 207k, 345 s |
| today | epic part | 73k, 376 s | 64k, 148 s | 0.88 | 0.40 | 0 | 58k, 114 s |

Owner questions and sign-offs, apart (DC02, DC04, DC07, DC08). "Before" is
the run up to the first question to the owner; "after" is every other run of
those cases.

| Arm | Work before | Work after | Records before | Records after | Owner runs | Owner |
|---|---|---|---|---|---|---|
| full | 201k, 240 s | 263k, 730 s | 305k, 824 s | 400k, 749 s | 9 | 230k, 82 s |
| lighter | 155k, 175 s | 335k, 963 s | 279k, 737 s | 367k, 686 s | 9 | 229k, 72 s |
| today | 148k, 145 s | 244k, 1048 s | 262k, 580 s | 361k, 1065 s | 8 | 204k, 57 s |

Costs that these runs cannot isolate:
- Reading the records: the work agent reads the rules and the records as
  part of its own run, so that cost is in "work", not in "records".
- Corrections: no case had a fix round after its review, so the cost of a
  correction after review was not measured. Corrections inside a run (for
  example after the owner answered) are in the "after" runs, with the rest
  of that run.
- Indexing: in the v4 arms the records agent wrote the records and the
  harness ran the model's index outside any agent, so the index has no
  token cost here. In today's arm the `al` commands ran inside the records
  run.
- Repeated review: each case got one review, so a second review round was
  not measured.
- Two runs are not clean: in full DC04 the work agent started a helper whose
  tokens are not counted, and in lighter DC04 the records agent started
  before the work agent finished.

Findings:
- Cost against the 20% target: no arm and no path came near it. The lowest
  ratio is the non-code project (0.5-0.7), where the work was the largest.
  The work in these cases is small, so the fixed cost of reading the rules
  and the records weighs heavily. The ratio says how heavy the records are
  next to a small change; it does not say the cost on a real feature.
- In time, the records weigh most on small changes: 3.0 to 4.2 times the
  work time, against 1.1 to 1.5 on big changes.
- In full DC04 the owner refused to sign R4: the records agent had turned
  "don't know" into a requirement. The sign-off caught an invented promise.
- DC07, two changes on one paragraph: the two developers worked at the same
  time, and neither knew of the other. In the full and today's arms the two
  branches conflict in the user guide. Every reviewer asked for changes, and
  every reviewer answered "after both merge, EXP-4 says 45 minutes only"
  (wrong: the owner wanted both). In the v4 arms both developers chose path
  1 and edited `specs/` directly, so there was no change spec and no
  `changes` link, and the tool showed no overlap hint (section 8, item 11).
- Markers: 0 of the markers present before the change were lost, across all
  27 runs. The work agents were told to keep them; T16 measures this on
  real agents later.
- 0.1.0 on the typo fix (DC01): `al check` says `not ok: the claim is tier 0,
  but main..HEAD edits the baseline`. 0.1.0 has no typo claim.

## 7. The model against the expected verdicts

The T2 author wrote what the v4 tool should say on each defect and control.
The model gives the expected finding on all 14 pairs in both v4 arms, with
these differences:
- D06 and D14: the model shows the invalid disposition as a hint in
  `al check` and refuses only in `al conclude`; T2 expected `not ok` in
  `al check`. `design.md` 5 does not say which.
- D04, lighter arm: T2 expected a near-match hint on link-45/SP-3 against
  EXP-5 in both PRs. The model checks near matches only between promise and
  design kinds, and both paragraphs are rationale.

The model's close rule gives the expected verdict on every closing case:
the wording decision passes; the A→B→C chain ending in a removal is a
valid disposition, but the request still refuses to close in both arms,
because SP-7, SP-10 and SP-11 have no disposition yet; the
unexplained revert refuses; the source edited from 30 to 45 minutes refuses
until its new version has a disposition, and the result is the same after a
squash merge. In the lighter arm, supersession can be checked by ID only.

The search model (levels 0 and 1, 28 questions with expected IDs): the
right originals were in the top 5 for 0.30-0.34 of the expected IDs, the same
in both arms and at both levels. The default query returned only baseline
text, and the history query found removed and abandoned text, as
`design.md` 11 says. Review questions name few words of the paragraphs they
ask about; T13 measures real search on real wording.

## 8. Gaps in the design that the fixtures found

1. How a path-1 paragraph names its requirement: `design.md` 5 says it
   "records `from: <request>/R2`", but `schema.md` 6 defines `from` only from
   a requirement to the owner's words. Architect's decision (2026-10-10): a
   path-1 promise paragraph uses `serves:<request>/R<n>` in its marker and
   binding. `design.md` 5 meant the consolidation provenance in the record;
   that field is to be named `source:` (for example
   `source: invoice-exports/SP-12`, or `source: adoption`). The architect
   corrects `design.md` and `schema.md` in T6. The fixtures' existing
   `from:adoption` markers were not changed.
2. A 1d edit of a paragraph that an open change incorporated breaks that
   change's disposition. A 1d PR has no change spec, so it has no way to keep
   the other change valid. The design does not say what the 1d PR must do.
3. The level of an invalid disposition in `al check` (hint, or `not ok`).
4. How a removal of an informative paragraph (a rationale) is declared: the
   ID lint flags it as lost; dispositions do not cover informative kinds.
   The audits also found that `design.md` 2 says explanatory paragraphs are
   never copied into `specs/`, but the base holds a rationale (EXP-5) there.
5. Links from an open change to a paragraph that another change removed: the
   rule "a link to an ID that does not exist is `not ok`" fires on an open
   spike.
6. Whether a superseded ADR may keep `decides` links to removed paragraphs.
7. Where result files live, and how an ADR file carries its ID and status.
8. Whether a number word ("one") counts as a number for the typo mark.
9. A result at a commit that the clone does not have: the model shows
   "applicability unknown"; the design names only an absent repo.
10. In the lighter arm, a superseded disposition can be checked only by the
    spec ID, not by the bound version.
11. Two open path-1 PRs that edit the same spec paragraph get no overlap
    hint: the hint reads only the `changes` links of change specs (DC07).
12. Who must align a stale binding: the PR that changes the target, or the
    change that holds the link. The design does not say. T2 uses both
    readings: D07 plants an unaligned stale base as its defect, but the D01
    control also leaves one unaligned (reminder-emails/SP-3 on INV-6), and T2
    calls that not a defect of the PR. The audit took the second reading; the
    D01 control's reviewer approved and noted it as minor.

0.1.0, observed: it flags a typo fix as `not ok`; it ignores trailing spaces
inside code blocks (D14); on D04 it flags the control and not the defect; it
has no path 1d, so it calls a 1d request blocked (D13); it reads its own
consolidate, drop and revert as ID reuse (cr-abandon).

## 9. Each rule and its evidence (input to T6)

| Rule | Evidence for | Evidence against |
|---|---|---|
| ID on every paragraph | Recall 0.88-0.94 in all arms; 0 lost markers; IDs let the scorer and the reviewers name things | None seen |
| Kind in the marker | D02, D13 tool catches (lighter too); today's D08 control flagged for want of a kind | None seen |
| Marker links (serves, builds-on, changes) | D04: blocked and found by the tool in full; missed in lighter, where no link or tool finding exists | Today's reviewer blocked D04 without links, from the 0.1.0 blocks |
| Bindings | D07 blocked only in full (minor only in lighter and today); H02 answered only in full | Cost; only these two items depended on them; one review each |
| Dispositions and the close rule | D06, D14 tool catches in both v4 arms; every close-rule case gave the right verdict | None seen |
| AI hints with their source hash | D08 flagged by the tool; the full reviewer asked for a refresh | No reviewer blocked on it |
| Declared outputs (implements, verifies, documents) | H02 depends on them | The lighter arm answered Q15 (the absent mobile repo) right without them |
| Typo marks | D10, D11 caught by the tool in both v4 arms; D12 marked in both PRs as designed | None seen |
| Path claims and the 1d check | D09, D13 | None seen |
| Requirement words in non-promise kinds | D02 | None seen |
| Rule-check hints | None of the defects | Fired on many new rules as noise |
| Results with declared inputs | H05 answered in both v4 arms, missed in today's | None seen |
| Search roles (model) | Default and history scopes behaved as designed | Recall 0.3 on review questions at levels 0-1 |

A rule that only catches its own missing declaration does not count
(`design.md` 15). By that test, the bindings count only for D07 and H02.

## 10. Not covered here, and the task that covers it

- Scale: 1,000 requests and 20 repos, the timings (T15).
- Level 1 on Node 24, the minimum version (T7, T13).
- Real search fallback and level 2 with an embedding model (T14); every role
  through the change-context query at levels 0-2 on the product (T13, T14).
- Formatting-only differences under exact equality on real history (T4).
- The fresh-reader test on a private adopter (T5).
- Marker preservation by agents on the product (T16).
- The record commands end to end, the ADR checks, an absent clone and an
  unavailable commit on the product (T9, T10, T12).

## 11. Limits of this evidence

- One model family played every role, the judges and auditors included.
  Reviewers of the same family may share blind spots.
- One review for each PR and arm. A single review can change: the full-arm
  D07 defect was blocked for a different reason in its first run.
- The mechanism scores rest on LLM judges, not on an exact check. The two
  judges agreed on 207 of 208 findings, and each judge alone gives the same
  catch counts. The judges saw a one-sentence mechanism from T2, so a
  finding that names the right fault in other words can still be missed.
- The control audits are LLM judgements against the written rules. Where
  the design is silent, the auditors said which reading they took.
- The fixtures are small and invented. The changes are small, so the fixed
  cost of the records dominates the cost ratio.
- The tool output of the v4 arms comes from a model of the rules that the
  developer of this issue wrote. T2's expected verdicts checked it.
- The orchestration had faults, each recorded in the raw logs:
  - In lighter DC04, the records agent started before the work agent
    finished.
  - Six of today's defect reviews were run again after their PR claim was
    corrected; the first results were discarded.
  - A classifier blocked one owner agent from writing its reply; from then
    on, owner agents gave their reply as text, and the orchestrator wrote it
    to the file unchanged.
  - Token counts are per agent run as the harness reported them; one work
    agent started a helper whose tokens are not counted.

## 12. Where the data is

The fixtures, the model, the prompts, every agent's output (the first
reviews of the repaired pairs included), the judge labels, the control
audits, the scoring scripts and the usage log are in the architect's working
notes: `validation/v4/` in the bots repository of the AssuredLoop bot, at
the commit named in the PR. They are not in this repository.

# Part B: validation B (T4-T5)

## B1. The answer

- Formatting-only differences under exact equality are rare in real
  OpenSpec history. Over the whole archive (69 changes with delta specs, 328
  requirements found in the spec at their archive commit), no paragraph
  differs in whitespace only. One requirement differs only in the number of
  blank lines between its paragraphs; the paragraph split absorbs it. Six
  paragraphs differ in markup only: 4 in a code-fence info string, 2 in
  letter case. Under exact equality these 6 need a wording decision or a
  typo claim. 70 paragraphs differ in words.
- The agents' conversion kept the text. A script made 33 comparisons of a
  converted spec with the real OpenSpec spec, over the 17 replay states that
  have a spec. All 33 are equal in this sense: every non-blank line is equal
  byte for byte, in order, once the markers are removed, and the lines
  inside code fences are equal with their blank lines. Blank lines outside
  code fences are not compared, because a marker adds them. No replayed disposition needed a wording
  decision or a typo claim: every difference that the replay met changed the
  meaning.
- On the review questions, the three arms answered the same: 30 of 30 each.
  The questions were answerable from OpenSpec's own records and the diffs.
  The v4 records added no right answer on this real history; they added
  paragraph IDs (recall 0.64 in the full arm, 0.72 in the lighter arm).
- The replay met five real defects (section B6). The OpenSpec CLI 1.14.1
  (today's release, not the version that the project used then) reported
  three as errors: MODIFIED blocks that drop scenarios, a stale base in the
  chain, and a spec with duplicate requirement names. The full v4 model
  showed four: the dropped scenarios (in one of two cases, see B6), the
  stale base, and two that only it showed: a parallel edit that was lost,
  and a consolidated text with the opposite meaning. It did not see the
  duplicate names. The lighter arm showed the same four, but the lost edit
  and the stale base only at the close; it also flagged declared removals
  of headings as lost IDs.
- The v4 model also flagged what OpenSpec does not declare: four direct
  promise edits with no request, and no sign-off on any change. These are
  missing declarations, not detected defects (design.md 15: a rule that
  only catches its own missing declaration does not count).
- Converting one real change cost 166k to 294k tokens and 5 to 13 minutes of
  agent time, in two runs (open and close). Most of it is a fixed cost: the
  changes of 340 to 450 words cost 166k to 184k, the largest (2,221 words)
  294k.
- The fresh-reader test on a private adopter: with the v4 records, 6 of 6
  readers recovered all three facts. With the original records, 0 of 3 did:
  each of them answered "unknown" for the merged PR, because the records say
  that it is not merged. All 9 readers recovered the other two facts.

## B2. What was run, and what is a model

Run:
- 38 agent runs for T4 (22 conversion runs, 1 question author, 15
  answerers) and 12 for T5 (1 conversion run, 9 fresh readers, 2 judges). All of one model family, the
  same as in validation A.
- The equality measurement: a script over the real git history of OpenSpec.
- The fidelity check: a script that compares each converted spec with the
  real OpenSpec spec of the same state.
- The OpenSpec CLI, version 1.14.1 (released 2026-10-05), on today's arm of
  T4: its `list`, `list --specs` and `validate --all` output is what
  today's answerers saw.
- The pinned `al` of the private adopter, on today's arm of T5.

A model, not a product test:
- The tool output of the full and lighter arms: validation A's rule model,
  unchanged, with two additions in Part B. T4 shows an archived request as
  judged on its own closing state (design.md 5: "An archived request is
  never checked again"); validation A's model judges every request on the
  current state. T5 adds the git facts of design.md 8 (which PRs name a task,
  and whether they merged) and resolves a commit through git, not as a
  string.
- The adoption step of T4: a script marked the base specs with IDs and
  kinds from the OpenSpec structure. It stands in for `al spec --add-ids`,
  which does not exist yet. Each change was converted by agents, by hand.

No result here is a measurement of v4 product code: there is none yet.

### The architect's decisions for Part B (2026-10-10)

- The arms of T4: today's arm is OpenSpec's own records, with the output of
  a released OpenSpec CLI that is at least 24 hours old; the lighter and
  full arms are as in validation A. Validation A already measured 0.1.0.
- The fresh reader of T5 gets the records and the tool output only, with no
  direct git. In the v4 arms, the tool output carries the git facts of
  design.md 8. In today's arm, the reader gets the original records and the
  pinned `al`'s own output.
- The T5 key: the three facts (a PR merged, a proof not run, a part still
  open), and two pieces of evidence that are not available: (a) the proof
  that did not run has no evidence (no run, no check result); (b) the owner's chat itself
  is not available, only a transcription. A reader who says that the PR is
  not merged fails the first fact, though the request's text says so.
- Design gap 1 of section 8 as decided there: `serves` in the marker,
  `source:` for provenance.

## B3. T4: the OpenSpec changes and the replay

OpenSpec (github.com/Fission-AI/OpenSpec), main read at commit
`9111a7654d7800391459431fff4eaf66e33a3d2e`. Nine archived changes, in five
episodes. Each episode replays real commits, in order. A state holds the
real bytes of the requirements that the episode follows; the other
requirements stay at the base bytes, so the edits of changes that are not
replayed stay out.

| Change (`openspec/changes/archive/`) | Archive commit | Size | Why it was chosen |
|---|---|---|---|
| `2025-09-29-update-markdown-parser-crlf` | `6f7cc2abd20c` | 450 words; 1 ADDED | a small change: one ADDED requirement |
| `2025-09-29-sort-active-changes-by-progress` | `6f7cc2abd20c` | 345 words; 1 MODIFIED | a small change: one MODIFIED requirement |
| `2025-08-19-adopt-delta-based-changes` | `7ced2a87916e` | 2,221 words; ADDED, MODIFIED, REMOVED over 3 specs | a large change with a removal, and the one whitespace-only difference of the archive |
| `2025-10-14-add-non-interactive-init-options` | `345f9dbb456b` | 609 words; 1 ADDED, 1 MODIFIED | two changes MODIFIED one requirement, archived in one commit |
| `2025-10-14-update-cli-init-enter-selection` | `345f9dbb456b` | 340 words; 1 MODIFIED | the other change of that pair |
| `2025-12-21-add-config-command` | `971f8ca4a36d` | 1,941 words; 11 ADDED, a new spec | a large new spec; one consolidated requirement says the opposite of the change |
| `2026-04-23-add-kimi-cli-skills-only-support` | `342ed43e694a` | 1,184 words; MODIFIED in 2 specs | the first of a chain of three changes on one requirement |
| `2026-08-15-add-dsh-support` | `297092cb25d9` | 1,753 words; 1 MODIFIED | the second of the chain |
| `2026-07-11-add-grok-build-skills-only-support` | `e232080d0943` | 1,605 words; MODIFIED in 2 specs | the third of the chain; its base text changed while it was open |

The chain also replays four commits that changed the spec with no OpenSpec
change: `e60ff536442f`, `4a0f15d3b2f5`, `cdd06a059424` and `781c7f9447b4`.
None of the three changes of the chain was open on main before its archive
commit. The replay opens the first at the base state, and each of the other
two on the date of its folder name.

The replay converted each change in two agent runs: one opens the request
(the request, the change spec, the record), one closes it (the hand
consolidation into `specs/`, the dispositions, the outputs, the AI hints).
One run applied each direct spec edit. The agents worked from a written
guide and validation A's records as examples. A script filled the hashes
and the per-doc records, as `al index` would. The lighter arm was made from
the full arm by validation A's script.

## B4. Formatting-only differences under exact equality

For each archived change with a delta spec, a script compared each ADDED or
MODIFIED requirement with the requirement of the same name in
`openspec/specs/<capability>/spec.md` at the archive commit. It applied the
equality rule of design.md 5 (line endings normalized; the framing blank
lines removed), then lighter and heavier normalizations, to name the kind of
each difference.

| Set | Requirements compared | Equal | Blank lines only | Markup only | Words differ |
|---|---|---|---|---|---|
| Whole archive (69 changes) | 328 (28 more not found by name) | 285 | 1 | 2 | 40 |
| The 9 chosen changes | 28 | 21 | 1 | 0 | 6 |

By paragraph (each change paragraph against its closest paragraph in the
spec requirement): whole archive 2,866 paragraphs, 2,790 equal, 0 whitespace
only, 6 markup only (4 code-fence info strings, 2 letter case), 70 words.
Chosen changes: 197 paragraphs, 185 equal, 12 words.

- OpenSpec's archive command copies the delta text into the spec. So most
  text is equal. v4 consolidates by hand (design.md 5), so this measures
  the source texts, not hand copies. The fidelity check measures the hand
  copies: 33 of 33 comparisons equal, on non-blank lines and code fences
  (B1).
- Most "words differ" cases are not drift of one text. Several changes
  MODIFIED one requirement and were archived in one commit, or a MODIFIED
  delta held only the new scenario and the archive kept the others. At the
  paragraph level, the second case is equal.
- The one blank-line case: under v4 each paragraph has its own marker, so
  the blank lines between paragraphs do not count, and the paragraphs are
  equal. No more normalization is needed for whitespace. The 6 markup cases
  would need a wording decision or a typo claim each.

## B5. Conversion cost, and the equality cases in the replay

| Change | Tokens (2 runs) | Agent time | Baseline effect | Incorporated | Removed | No valid disposition |
|---|---|---|---|---|---|---|
| update-markdown-parser-crlf | 168k | 341 s | 2 | 2 | 0 | 0 |
| sort-active-changes-by-progress | 166k | 338 s | 2 | 2 | 0 | 0 |
| adopt-delta-based-changes | 294k | 769 s | 30 | 23 | 7 | 0 |
| add-non-interactive-init-options | 204k | 483 s | 8 | 7 | 0 | 1 |
| update-cli-init-enter-selection | 184k | 300 s | 2 | 2 | 0 | 0 |
| add-config-command | 204k | 482 s | 42 | 34 | 0 | 8 (2 rules, 6 design) |
| add-kimi-cli-skills-only-support | 192k | 495 s | 11 | 6 | 0 | 5 (design) |
| add-dsh-support | 221k | 406 s | 15 | 7 | 0 | 8 (1 rule, 7 design) |
| add-grok-build-skills-only-support | 221k | 507 s | 18 | 9 | 0 | 9 (3 rules, 6 design) |

The four direct spec edits cost 67k to 85k tokens each (95 s to 121 s). All
conversion runs together: 2.15 million tokens, 22 runs. The dispositions are
judged on each request's closing state.

- Wording decisions and typo claims: none. No replayed text differed in
  wording only. Each difference changed the meaning: the converters left
  those paragraphs with no disposition, and `al conclude` (the model) refuses
  each of those requests.
- No OpenSpec change has a sign-off, so the model's `al conclude` refuses
  all nine requests. A maintainer's merge is not a sign-off; the converters
  recorded none.
- Design text: OpenSpec keeps `design.md` with the change and never puts it
  into the specs. Under design.md 5, design kinds go into `specs/` and need
  a disposition. 24 design paragraphs of four changes have none, so the
  close rule refuses them, though the code delivered them.
- There is no "work" agent in this replay: the work happened in the real
  project. So the cost is not a ratio. The question author cost 215k tokens.

## B6. What each arm's tool showed on the real problems

The replay met five real defects and two missing declarations. The OpenSpec
CLI ran on the states before and after the last step of each episode; the
model ran on every state. The CLI is today's release: the project archived these changes with
older versions, which let the problems through.

| Real problem (episode) | OpenSpec CLI 1.14.1 | Lighter (model) | Full (model) |
|---|---|---|---|
| A MODIFIED block omits scenarios that the spec still has, so the archive drops them (sort-active; adopt-delta) | error before the archive: "MODIFIED ... omits scenario(s)" (both) | sort-active: `not ok`, 4 IDs lost; adopt-delta: `not ok`, 7 heading IDs lost, but these include the headings of a requirement that the change did remove: with no marker links, the lighter arm cannot see a declared removal of a heading | sort-active: `not ok`, 4 IDs lost; adopt-delta: none, because its converter wrote the omissions as declared removals |
| A spec holds 7 requirement names twice (openspec-conventions, adopt-delta) | error: duplicate requirement names | no finding | no finding |
| Two open changes MODIFIED one requirement; one text was lost at the archive (the pair) | no finding | no overlap hint; `al conclude` refuses the lost paragraph | overlap hint while both were open; `al conclude` refuses the lost paragraph |
| The consolidated requirement says the opposite of the change (config: unknown keys rejected, not allowed) | no finding | `al conclude` refuses 2 rules | the same |
| A spec text changed under an open change (the chain: a rename, then a tool replaced) | error before the archive: the MODIFIED block omits the scenarios added since | nothing while open; `al conclude` refuses at the close | stale-binding hint while open; `al conclude` refuses at the close |
| Missing declaration, not a defect: four commits changed promise text with no change | not a concept (no change to validate) | `not ok`: no signed requirement | `not ok`: no signed requirement |
| Missing declaration, not a defect: no change has a sign-off | not a concept | `al conclude` refuses all 9 | the same |

- The CLI found the stale base of the chain by structure: the old MODIFIED
  block no longer holds the scenarios that later commits added. The v4
  binding found it by hash, while the change was open.
- The two converters of a dropped-scenario case chose differently. One kept
  the delta as written, so the v4 ID lint flagged the lost IDs. The other
  wrote each omitted scenario as a declared removal, so the full arm saw a
  declared removal and no loss. The v4 finding depends on that choice.
- In the lighter arm, a removal of a heading or other note is declared only
  by a marker link, which that arm drops. So its ID lint flags every removed
  heading, declared or not.

The answerers of all three arms still answered the questions on these
problems right, from the diffs and the history. No defect review was run in
T4, so the effect of these findings on a reviewer is not measured here.

## B7. Questions in three arms (30 questions)

A separate agent wrote 30 questions over the five episodes after the
conversion, from the real history and the converted IDs. No conversion agent
saw them. Each has one answer that a script checks: 20 choice, 8 yes or no,
2 sets. A check of the scorer: each answer changed to a wrong one scored
wrong (90 of 90).

| Arm | Right | Recall of the evidence | Tokens per answerer | Time per answerer |
|---|---|---|---|---|
| today (OpenSpec's records) | 30/30 | 0.42, by reference | 44k | 28 s |
| lighter | 30/30 | 0.72, by v4 ID | 51k | 29 s |
| full | 30/30 | 0.64, by v4 ID | 54k | 30 s |

- Every arm answered every question right, with high confidence. On this
  history, the v4 records did not change an answer.
- Recall is not comparable across the arms. OpenSpec's records have no
  paragraph IDs, so its recall matches requirement and scenario names.
- The v4 packets are larger: the records, the diff and the tool output of
  the five episodes are 0.62 MB (lighter) and 0.71 MB (full), against 0.16
  MB for OpenSpec's own. The answerers' tokens grew less: 51k and 54k,
  against 44k.

## B8. Gaps in the design that the replay found

1. Design text that a project keeps only with the change. OpenSpec never
   consolidates `design.md`. Under design.md 5, every design paragraph with
   a baseline effect needs `incorporated` or `abandoned`. Neither is true for
   delivered design that stays with its change, so the close rule refuses.
2. An archived request judged again. Validation A's model judged archived
   requests on today's spec; design.md 5 says it must not. The product must
   judge an archived request on its closing state only (T10, T11).
3. A direct edit keeps an old `serves` link. After a direct edit of a
   promise paragraph, its marker still names the requirement of the closed
   change that wrote it, though the text no longer matches. The sign-off
   check then names that old requirement. The design does not say what a
   direct edit does with the old link.
4. Silent loss in a whole-block replace. OpenSpec's archive replaced a
   whole requirement block with the MODIFIED text, so scenarios that the
   delta left out vanished. Today's OpenSpec CLI refuses such a delta. The
   v4 ID lint catches the loss only when nobody declares it as a removal;
   the design does not say when a change may declare a removal that its
   source did not ask for.
5. Markup-only differences (code-fence info strings, letter case) need a
   wording decision or a typo claim under exact equality. This is 6 of 2,866
   paragraphs. The data does not support more normalization.

## B9. T5: a private adopter's tier-3 restart request

The adopter's open tier-3 request was converted by hand on a scratch copy,
at a pinned commit. Nothing was changed in the adopter's repo, and nothing
from it is in this repository. The private detail is in the bots repository
(see B11).

Method:
- One conversion agent converted the request's records into v4 records (one
  run, 229k tokens, 12 min). It wrote 44 spec markers, a change spec of 51
  paragraphs, the request record (23 sources, 4 requirements, 1 sign-off, 4
  decisions, 4 tasks, 12 declared outputs, 36 dispositions) and 20 result
  files (3 of them "not run"). The lighter arm was made from it by script.
- Nine fresh readers, three for each arm, each with only its arm's records
  and tool output. Each listed the PRs, the checks, the parts, the evidence
  that is not available, and the contradictions.
- The three facts were scored by script. The two pieces of evidence and the
  contradiction were labelled by two judges who did not see the arm; a label
  counts when both agree. They agreed on 26 of 27 labels. The key was fixed
  before any answer was read.

| Arm | All three facts | A PR merged | A proof not run | A part still open | (a) no evidence of the proof that did not run | (b) owner chat not available | Saw the contradiction | Tokens per reader | Time per reader |
|---|---|---|---|---|---|---|---|---|---|
| today | 0/3 | 0/3 ("unknown") | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 121k | 193 s |
| lighter | 3/3 | 3/3 | 3/3 | 3/3 | 2/3 | 3/3 | 0/3 | 100k | 159 s |
| full | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 0/3 | 128k | 214 s |

Findings:
- The merge fact came from the tool's git facts. The original records say
  that the PR is not merged: the request wrote that line inside the PR,
  before the merge, so it went stale at the merge. Today's readers saw that
  the tool read a tree that already held the PR's records, and answered
  "unknown"; none answered "merged".
- Two things helped the v4 readers, and this test cannot tell them apart:
  the derived merge fact, and the conversion rule that drops a merge state
  from the records ("the tool derives it from git"). The converter dropped
  the stale line for that reason. So the v4 readers saw no contradiction.
- The lighter arm did as well as the full arm. The facts come from the git
  facts, the results and the task references, which both arms keep.
- "A part still open" came from the part's brief ("not started") and a dated
  status line in all arms, and in the v4 arms also from a task that no PR
  names. v4 keeps no task status (design.md 8), so the converter kept the
  status text as dated dialog lines.
- The conversion needed fields that the examples do not have: results with
  "by", "source" and "note", sign-offs with the presented packet and the
  transcription, and "commit: unknown" for 7 of the 20 results. A result
  with no commit gives "applicability unknown".
- Validation A's model compared commit IDs as strings, so a full hash and a
  short hash of one commit did not match. The T5 view resolved them through
  git. The product must do the same (T12).
- The request has its own rule that any change to the spec's bytes needs a
  new sign-off. Under v4, a change to a heading, a design paragraph or an
  open paragraph needs review only. v4 does not carry that project rule.

## B10. Limits of this evidence

- One model family played every role: the converters, the question author,
  the answerers, the readers and the judges.
- T4 has one answerer for each episode and arm. All arms scored 30 of 30,
  so the questions did not separate the arms; harder questions might.
- The T4 questions were written from the replay. They test what the real
  history asks; they are not planted defects. T4 ran no defect review.
- The converters made different choices in similar cases (B6), and their
  choices change what the v4 tool shows.
- The OpenSpec CLI is today's release, run on old states. It shows what the
  best-known tool of this kind says now, not what the project saw then.
- The replay keeps only the followed requirements of each spec, and opens
  two changes on the date of their folder names. The real history held more
  text and other changes.
- T5 is one request, three readers per arm. Its result rests on one
  stale line and one derived fact.
- The tool output of the v4 arms is a model of the rules. The adoption step
  is a script that stands in for `al spec --add-ids`.
- Agent time is the wall time of an agent run, not a person's time.

## B11. Where the data is

The replay world, the conversion snapshots, the prompts, every agent's
output, the scorers, the usage log and the T5 detail are in the architect's
working notes: `validation/v4/t4/` and `validation/v4/t5/` in the bots
repository of the AssuredLoop bot, at the commit named in the PR. They are
not in this repository.
