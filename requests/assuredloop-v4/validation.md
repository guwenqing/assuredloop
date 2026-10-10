# AssuredLoop v4: validation A (T1-T3)

This report covers the tasks T1, T2 and T3 of `tasks.md` (issue #170). It
gives the evidence for T6. It decides nothing: the architect decides the
model in T6.

## 1. The answer

- The lighter arm did as well as the full model for reviewers. It answered
  29 of 30 questions (full: 30), and it caught 12 of 13 applicable planted
  defects (full: 13 of 14). The one question it missed and the one defect it
  missed both need bindings.
- The records cost more than the work in every arm: 1.3 to 1.5 times the
  tokens of the work agent overall, and 0.5 to 2.1 times for single cases. The 20% target was not met by any arm, today's
  0.1.0 included. On these small changes, most of the cost is the fixed cost
  of reading the rules and the existing records.
- The v4 checks catch much more than 0.1.0, but reviewers catch most defects
  from the diff without them. The tool caught 11 of 14 defects in the full
  arm, 8 in the lighter arm and 3 with the real `al` 0.1.0. A reviewer caught
  a defect with no flag on its clean control in 7, 8 and 7 cases.
- Only one rule changed what a reviewer found: the bindings. With them the
  full-arm reviewer caught D07 (a stale base) and answered H02; the lighter
  and today's arms missed both. The `changes` links gave the tool a
  near-match signal on D04, but reviewers in every arm caught D04 from the
  diff. The stale AI-hint check (D08) fired, but the reviewer did not act on
  it.
- Today's records answered 25 of 30 questions. The five it missed ask about
  open proposals, pending dispositions, task references, bindings and the
  inputs of a result, which 0.1.0 does not record.
- No agent lost a paragraph marker in 27 developer runs.

Section 9 lists the rules with the evidence for and against each one.

## 2. What was run, and what is a model

Run:
- Every agent: 269 subagent runs (owner, developer, records writer, reviewer,
  answerer, and the fixture builders), all of one model family.
- The real `al` 0.1.0 (`@assuredloop/cli`, version 0.1.0) on today's arm: it
  built every state with real git history and real `al` commands, and its
  `al check --all` and `al context` output is what today's reviewers saw.
- The scoring: every score in this report is an exact check by a script (a
  choice letter, yes or no, a set of IDs, a finding on a named ID). There is
  no LLM judge.

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
- 11 case states for the close rule, search and results, and 29 states for
  the planted defects and their controls. Each state is an overlay on the
  base or on another case.
- The T1 check passes over all 41 states: every link kind of `schema.md`
  section 6 appears, every record kind of section 8 is present, all YAML
  parses, and no marker lint fires.
- The lighter arm is made from the full fixtures by a script. Today's arm
  is built again in the 0.1.0 format, with the same story, texts and IDs.

### The questions, defects and dev cases (T2)

A separate subagent wrote them from `design.md` and the fixture texts. It
wrote no record. It found 15 problems in the fixtures (one was a test that
did not test expiry; it is kept as an unplanted defect, H01).
- 30 review questions, 10 of them held out: no records writer saw them.
- 14 planted defects (D01-D14), each with a clean control of the same shape,
  covering every defect of `design.md` 15.
- 9 developer cases (DC01-DC09), one for each path, with the owner's words,
  the owner's answers, and 21 review questions on the resulting PR.

### The arms (architect's decisions, 2026-10-10)

- Full: `design.md` and `schema.md` as written.
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

## 5. Planted defects (14 pairs, 84 reviews)

| Arm | Applicable pairs | Reviewer caught | Caught, control not flagged | Control flagged | Tool caught | Tokens per review | Time per review |
|---|---|---|---|---|---|---|---|
| full | 14 | 13 | 7 | 7 | 11 | 45k | 45 s |
| lighter | 13 | 12 | 8 | 4 | 8 | 42k | 39 s |
| today | 13 | 11 | 7 | 4 | 3 | 40k | 44 s |

D08 (a stale AI summary) does not apply to the lighter arm or to today's
arm: they keep no AI hints, so the two PRs are the same.

| Defect | Full | Lighter | Today (real `al` 0.1.0) |
|---|---|---|---|
| D01 unsigned promise change | caught; tool | caught clean; tool | caught clean; tool |
| D02 new rule labelled `data` | caught clean; tool | caught clean; tool | missed |
| D03 code-only change claimed as a fix | caught clean | caught clean | caught clean |
| D04 two changes, no `changes` links | caught; tool | caught | caught |
| D05 test checks another condition | caught clean | caught clean | caught clean |
| D06 drifted consolidation | caught clean; tool | caught; tool | caught; tool |
| D07 stale base after indexing | caught; tool | missed | missed |
| D08 stale AI summary, quote survives | missed; tool | not applicable | not applicable |
| D09 wrong path claim | caught; tool | caught clean; tool | caught clean; tool |
| D10 typo claim MUST → SHOULD | caught clean; tool | caught clean; tool | caught clean |
| D11 typo claim only → all | caught clean; tool | caught clean; tool | caught clean |
| D12 MUST MUST → MUST NOT (control: → MUST) | caught clean | caught clean | caught clean |
| D13 1d claim adds a component | caught; tool | caught; tool | caught |
| D14 trailing spaces in a code example | caught; tool | caught; tool | caught |

"Caught" means a blocking finding on the defect's ID; "clean" means the
control got no blocking finding on that ID; "tool" means the tool showed a
finding on the defect that it did not show on the control.

Most flags on controls were real problems, not reviewer errors:
- D01, D07, D09 (full only): the path-1 marker `from:<request>/R1`. The
  fixture schema allows `from` only for owner's words or adoption, so the
  reviewer said no `serves` link covers the promise. This is a gap in the
  design (section 8, item 1).
- D04 (all arms): the two open changes contradict each other (30 and 45
  minutes). They must be aligned; the reviewer was right to hold the PR.
- D06 (all arms): no code delivers the yearly ZIP, but the PR closes the
  request. A real, unplanted problem.
- D13 (all arms): the 1d rename changes EXP-6, which an open change
  incorporated, so that change's disposition is no longer valid. A real
  design finding (section 8, item 2).
- D14 (all arms): the reviewer read "exactly this header" as a promise, but
  the fixture labels it `interface`. A judgement on the kind.
- D08 (today): with no kinds, the reviewer could not tell that the change was
  design-only, and asked for a sign-off.

## 6. Developer cases (9 cases, 3 arms)

Tokens are the totals of the agents for each role. "Records / work" is the
records agent's tokens over the work agent's tokens.

| Arm | Group | Work | Records | Records / work | Owner | Review | Right answers | Lost markers |
|---|---|---|---|---|---|---|---|---|
| full | small: DC01 fix, DC02 amend, DC03 1d, DC09 adoption | 181k | 275k | 1.51 | 51k | 191k | 8/9 | 0 |
| full | big: DC04-DC08 | 475k | 721k | 1.52 | 179k | 338k | 10/12 | 0 |
| lighter | small | 178k | 245k | 1.38 | 50k | 189k | 9/9 | 0 |
| lighter | big | 506k | 664k | 1.31 | 179k | 305k | 11/12 | 0 |
| today | small | 174k | 269k | 1.55 | 51k | 167k | 8/9 | 0 |
| today | big | 420k | 615k | 1.46 | 153k | 265k | 10/12 | 0 |

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

- Cost against the 20% target: no arm and no path came near it. The lowest
  ratio is the non-code project (0.5-0.7), where the work was the largest.
  The work in these cases is small, so the fixed cost of reading the rules
  and the records weighs heavily. The ratio says how heavy the records are
  next to a small change; it does not say the cost on a real feature.
- Owner questions and sign-offs: 230k (full), 229k (lighter) and 204k
  (today) tokens, in 8-9 owner turns for each arm. In full DC04 the owner refused
  to sign R4: the records agent had turned "don't know" into a requirement.
  The sign-off caught an invented promise.
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
two differences of level: for D06 and D14 the model shows the invalid
disposition as a hint in `al check` and refuses only in `al conclude`; T2
expected `not ok` in `al check`. `design.md` 5 does not say which.

The model's close rule gives the expected verdict on every closing case:
the wording decision passes, the A→B→C chain ending in a removal passes, the
unexplained revert refuses, the source edited from 30 to 45 minutes refuses
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
   a requirement to the owner's words. Reviewers read it as no `serves` link.
2. A 1d edit of a paragraph that an open change incorporated breaks that
   change's disposition. The design does not say what the 1d PR must do.
3. The level of an invalid disposition in `al check` (hint, or `not ok`).
4. How a removal of an informative paragraph (a rationale) is declared: the
   ID lint flags it as lost; dispositions do not cover informative kinds.
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

0.1.0, observed: it flags a typo fix as `not ok`; it ignores trailing spaces
inside code blocks (D14); on D04 it flags the control and not the defect; it
reads its own consolidate, drop and revert as ID reuse (cr-abandon).

## 9. Each rule and its evidence (input to T6)

| Rule | Evidence for | Evidence against |
|---|---|---|
| ID on every paragraph | Recall 0.88-0.94 in all arms; 0 lost markers; IDs let the scorer and the reviewers name things | None seen |
| Kind in the marker | D02, D13 tool catches (lighter too); D08 and D14 controls flagged in today's arm for want of a kind | None seen |
| Marker links (serves, builds-on, changes) | D04 near match and overlap in full only | Lighter answered as well; links caused the D01/D07/D09 control flags (gap 1) |
| Bindings | D07 caught only in full; H02 answered only in full | Cost; only these two items depended on them |
| Dispositions and the close rule | D06, D14 tool catches in both v4 arms; every close-rule case gave the right verdict | None seen |
| AI hints with their source hash | D08 flagged by the tool | No reviewer acted on it |
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

- One model family played every role. Reviewers of the same family may share
  blind spots.
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

The fixtures, the model, the prompts, every agent's output, the scoring
scripts and the usage log are in the architect's working notes:
`validation/v4/` in the bots repository of the AssuredLoop bot, at the commit
named in the PR. They are not in this repository.
