# AssuredLoop v4: validation A (T1-T3)

This report covers the tasks T1, T2 and T3 of `tasks.md` (issue #170). It
gives the evidence for T6. It decides nothing: the architect decides the
model in T6.

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
