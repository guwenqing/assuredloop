<!-- LD-1 note -->

# The light design: the change spec

<!-- LD-2 note -->

This change serves R1, R2 and R3 in `request.md`. It makes `al` lighter for
the user and the AI, and adds the code side: the requirements and decisions
in force for a change, the review's judgements, and a check of their
evidence. Nothing is built or removed until the tests below give their
results. Seven signed requirements get new versions, which the owner signs
one at a time after the tests (section 6). Until then, those parts stay
plans.

<!-- LD-3 note -->

## 1. What it must do

<!-- LD-4 rationale -->

The project's requirement has not changed: find misalignment and keep the
coding agent focused on its change; trace every change of a requirement and
of a decision; make sure that the design addresses the real problem, and
that the docs, the code and the tests say what was decided. The user's AI,
mainly the review agent, asks small questions through a skill, a command or
an MCP server, and gets the right answer with the least added tokens, cost
and time. The files stay close to natural language. Few choices are forced
on how a user works.

<!-- LD-5 rationale -->

From the same owner's words: audit questions run once in a while, not on
every change. The knowledge base is the user's own when there is one, else
a local one with a suggestion from the user's machine, else none. A skill
helps a project adopt `al` from scratch, or move from an older version.
`al` knows when a source changed after a change relied on it. Each change
keeps its own documents, its design above all, beside the consolidated
spec. Code, tests and docs in up to 20 repos link to one spec repo. A check
takes 10 s at 1,000 requests; a search takes 2 s across 20 repos.

<!-- LD-6 note -->

## 2. The approach

<!-- LD-7 rationale -->

Today's `al` stays the base: requests with the owner's words, the organized
requirement and the change's own spec and design; the consolidated spec;
IDs; sign-offs; ADRs with status and supersede links; paths and the close
rule; output repos; every signed hint.

<!-- LD-8 rationale -->

Light for the user and the AI. `al` may compute and keep exact records
(hashes, versions, bindings), as long as no person and no AI writes or
reads them, and as long as they never give a finding that cannot be
cleared. What a person or an AI must write or read is cut to what a check
needs.

<!-- LD-9 rationale -->

A cut must not force a rewrite, and must not lose a fact. `al` maps old
kinds to the new words. Tasks, declared outputs, decisions and sign-offs in
today's records stay readable. The migration skill shows the answers of
`al check` and `al status` before and after, so an old project cannot turn
clean by losing facts. Old command names stay for one release. (The adopter
that answered #38 spent about 1 in 6 merged PRs on adoption and upgrades.)

<!-- LD-10 rationale -->

A cut that changes a signed requirement waits for the owner's new
signature (section 6).

<!-- LD-11 rationale -->

Judge each thing by its own time. A record of the past (a closed work item,
an archived request) is judged by what held when it was written. Only open
work is checked against what holds now (#33).

<!-- LD-12 rationale -->

Every hint can be cleared: by a fix, or by a one-line judgement with its
reason, which `al` records. The judgement holds until one of the two sides
changes again. This replaces `al index --align` (#38, Q11, Q19). A
judgement never clears a `not ok` rule (an unsigned requirement, changed
record evidence, an unreadable record, a citation of a replaced decision
under `--strict`) or a refusal of `al conclude`. Those clear only by their
own fix: a valid sign-off, or repaired evidence. A judgement on them is
shown, and changes neither `--strict` nor `conclude`.

<!-- LD-13 rationale -->

Check the change itself, not only the records. In the adopter project that
answered #38, no code file names a spec ID, and 1 of about 30 test files
does (Q14). So a check that waits for code or tests to name an ID sees
almost nothing there. `al` lists, in plain code, the requirements and
decisions in force that may govern a change, and says the limits of the
list. The user's AI judges the ones that apply, and `al` checks the
evidence that the AI quotes (section 4a). `al` calls no model.

<!-- LD-14 note -->

## 3. The cuts (plans; each waits for its test and, where it changes a signed requirement, for the owner's signature)

<!-- LD-15 plan -->

| Cut | Today | After | Signed requirements touched |
|---|---|---|---|
| K1 kinds | 18 kinds in each marker | six groups, each read exactly as today's checks read it: `promise` (purpose, scope, rule, limit, definition), `design` (component, interface, data, flow, choice), `approach`, `explain` (rationale, example, open), `plan` (plan, step, migration), `note`. Old kinds are read as their group; no file changes | none: a paragraph still has a kind (v4/R2); the list is shorter |
| K4 dispositions | written by hand for each change paragraph with a lasting effect | `al` derives a disposition where it can prove it: the text is in `specs/` word for word (incorporated), or a `removes:` names it and it is gone (removed), or a later signed change replaced its target. Only what `al` cannot prove is asked for, in one line. The guard cases of today (a lost edit, a wrong consolidation, a revert, two parallel changes) stay tests | v4/R5 |
| K5 test outcomes | result files, which the surveyed adopters never wrote | `al` also reads the project's CI test reports, with the commit of the run. A report from another commit is shown as "last reported at <commit>", never as a result for the selected commit. Result files stay for checks that are not code tests | v4/R8 |
| K7 context and search | `al context`, `al export`, search levels 1 and 2 over marked paragraphs only | the questions of section 4, the code side of section 4a, and the knowledge base setting of section 5. `al context` and `al export` stay as names for one release, then go with the migration skill | v4/R10, level2-peer/R1, context-all/R1, design-links/R1; v4/R9 holds as written: it names no command |
| K8 hints that cannot be cleared | a hint comes back on every run until the text changes | the recorded judgement of LD-12, for hints only; the time rule of LD-11; an ID-only edit or a move of a paragraph does not flag; an edit of an accepted or replaced ADR's marker line keeps the hint of adr-edits/R1 | hints-and-blocks/R1, which names `al index --align`; every `not ok` rule stays as signed |

<!-- LD-16 plan -->

Kept: the hashes, the requirement versions, the bindings and the records
folder. They are `al`'s own, and the user never edits them. Their loss
breaks a requirement changed from A to B and back to A, a squash merge, and
an edit before the first kept commit. `al check` refreshes the records, so
`al index` need not be run by hand. The skill commits them with the change.
Design links stay in the marker as today; prose that names an ID is a
reference, not a typed link.

<!-- LD-46 plan -->

Also kept:

- The paths and the `Tier:` claim line, and the skill asks the review agent
  to judge whether a "fix" changes behaviour that a requirement covers.
- `al conclude` and the close rule, with K4's lighter dispositions.
- Spikes and their signed question.
- C1 as `not ok` under `--strict` (signed hints-and-blocks/R2, R5).
- Every signed hint (own-item, adr-edits, issue-hints with phrases,
  hints-and-blocks/R1, closed-items, several-successors, adr-lists,
  delete-in-change-spec). A hint goes only with usage evidence and the
  owner's signature.
- The rule that an ID is never used again.
- `--at <commit>` on every question.

<!-- LD-17 note -->

## 4. The questions (plans: skill, command, MCP)

<!-- LD-18 plan -->

Small questions, the same as commands and MCP tools. Each answer is a few
lines, groups repeated lines but never leaves one out (context-all/R1), and
says which question to ask next. `--full` shows everything; `--at <commit>` answers as
of a past commit.

- `al about <file or ID>`: the requirements and decisions in force that name
  this file or ID, or that it names.
- `al status <ID or request>`: for an ID, its text in one line, its status,
  what replaced what, and its last signed version. For a request, where it
  stands and what to do next.
- `al cites <ID>`: every place that names the ID, in the spec repo and the
  output repos, marked current or historical.
- `al tests <ID>`: the tests that name the ID, their last outcome where the
  CI keeps one, and "not checked: whether they test it".
- `al history <ID>`: each change from git, with the commit message and the
  sign-off words.
- `al check`: every check of today's `al`, plus C4, C7 and C8, on the
  change's affected IDs; `--all` for an audit. On a change it also shows the
  list of section 4a.
- `al ask <text>`: the configured knowledge base; results marked as
  suggestions.

<!-- LD-19 plan -->

The default scope of a review is the change's affected IDs: the IDs that
the diff touches, plus open text that cites an ID whose text or status the
change alters, plus a requirement whose last naming test the change
removes, plus what the list of section 4a shows by citation or by file
scope. Answers are reused within one review. `al cites` gives counts by
place and the first lines, and "N more: al cites <ID> --full".

<!-- LD-20 plan -->

The skill leads the review agent from the change's behaviour, not only
from the IDs written:

1. Read the diff and the task. Ask `al about` for what it touches, and read
   the list of section 4a for the change.
2. Ask one search question about the changed behaviour, even when IDs are
   written: "which requirement or decision governs <behaviour>?". Written
   IDs can be incomplete or wrong. Where the list says that some items in
   force were not listed, this question covers them.
2a. Write a judgement for each item that applies to the change, or that you
   are not sure of, with its evidence (LD-27). Write none for an item that
   does not apply.
3. For a decision it names, `al status`. For a changed requirement,
   `al history`.
4. For a design in the change, compare it with the request's organized
   requirement: does it answer that problem, and does any part serve none?
5. For the changed behaviour, find the test assertions that check it, by
   search or grep, whether or not a test names an ID and whether or not the
   test changed. Read each assertion: a name is not a check. When none is found, or none was read, say so as
   unknown. A code quote never stands for a test.
6. Judge a "fix" claim: does the change alter behaviour that a requirement
   covers?
7. Run `al check` once. Stop when the search question and the lookups find
   nothing that applies. An empty lookup alone does not mean that nothing
   applies.

<!-- LD-41 plan -->

On an ordinary change `al` gives no hint; it shows only the list of section
4a. The coding agent asks `al about` on the task's files and IDs at the
start, and one search question for what is new and has no ID.

<!-- LD-21 plan -->

C4: a requirement in force that no test names (a hint). Off by default; on
only in a project that names IDs in its tests. Where tests name no IDs, C4
would flag almost every requirement, a hint that nobody can clear (#38,
Q11, Q14, Q16). Skill step 5 finds the assertions for the changed
behaviour without IDs.

<!-- LD-22 flow serves:R3 -->

C7: a saved work item whose text differs from the text that `al` kept when
the change relied on it (at the sign-off, or when the request first named
it). The caller refreshes the saved items before a check. An item saved
before the last refresh, or with no text kept, is reported as "not known",
not as clean. `al` keeps that text by itself; no person and no AI writes or
reads it. The hint clears by a recorded judgement that the change was read
(LD-12).

<!-- LD-23 note -->

## 4a. The code side: what is in force, the list, the judgements

<!-- LD-24 data serves:R1 -->

"In force" is `al`'s own term. The kind `rule` keeps its meaning as one of
the promise kinds. What is in force, at the selected commit, for the
selected change. `al` reads it from today's records: sign-offs, status
lines, supersede links and `specs/`. No new record.

- The promise and design paragraphs in `specs/`: the requirements and the
  lasting design. An archived request's text is history; its result is in
  `specs/`.
- The ADRs whose status is accepted and that no ADR replaced, each with its
  `decides` links. An ADR's text also names the alternatives that were
  considered (SCH-22), so the review reads which part is the decision; `al`
  marks no part as binding.
- The selected change's own signed requirements and its proposed design,
  shown as "proposed by this change", apart from what already holds.

<!-- LD-42 data serves:R1 -->

Not in force: another open request's proposal (shown as "open proposal on
<ID>", as today), a replaced ADR, and approach, explain, plan and note
paragraphs. An accepted ADR whose text changed keeps today's hint, and the
list marks it "text changed, review open".

<!-- LD-25 flow serves:R1 -->

The list for a change, in plain code, with no model. It is the same with or
without search.

- The items in force that the change cites.
- The items whose confirmed file scope (LD-26) matches a changed, renamed
  or deleted file, in the repo that holds it.
- The items whose scope is all files.
- When the set in force is small (300 items, provisional; a size
  calibration sets it): every other item in force, one line each, with its
  ID and its text in one line. About 85 items cost about 1,300 tokens
  (inferred: about 15 tokens a line; not measured).
- When the set is larger: one grouped line with exact counts, "N further
  items in force: U with no known scope, K with a scope that does not match
  this change". The search question of skill step 2 covers both groups. A
  scope that does not match is not proof that the item cannot apply: new
  behaviour can make an old scope incomplete.

<!-- LD-43 flow serves:R1 -->

The list says its basis (cited, by scope, or listed because the set is
small) and its limits. It never says that an item not listed cannot apply.

<!-- LD-26 data serves:R1 -->

File scope, optional. An item in force may say which files it concerns, or
all files, in one plain line. `al` may suggest the line from git history
(the files changed in the commits that cite the item); the author confirms
it. A scope helps the list; it never proves that other files cannot affect
the item. A scope that matches no file at the selected commit gets a hint.

<!-- LD-27 data serves:R2 -->

The judgements. The review AI judges only the items that apply to the
change, or that it is not sure of. It writes them in a short readable note
beside the change's design. Each judgement holds:

- the item's ID; `al` adds the item's version;
- complies, violates, not applicable, or unclear, with the reason in one
  sentence;
- a quote of the item's text, and a quote of the code or test with its repo
  and file, from the head of the change, or from its base when the change
  removed the text (a removed guard is quoted from the base);
- the test evidence apart: the assertion that checks the item, or "no test
  found", or "tests not examined".

<!-- LD-44 data serves:R2 -->

A judgement of absence ("no test found", "the guard was removed") says so,
and needs no quote from the head. A judgement for every item in force is
an audit: it runs only on request (`al check --all` with the skill's audit
step), never on an ordinary change.

<!-- LD-28 flow serves:R2 -->

C8, the evidence check, with no model. For each judgement, `al` checks that
the item's quote is in that item's text at the selected commit, word for
word, and that the code or test quote is in the file at the head or the
base that it names. `al` also keeps, by itself, the identity of the
reviewed change for each judgement: in each repo that it considered, the
base commit and a hash of the change's diff from that base, with the
review notes and `al`'s own records left out; and the item's version. A
judgement is current only while the selected change has the same base, the
same diff hash and the same item version. So a commit that only saves
review notes or `al`'s records keeps it current, and a commit that changes
any other file of the change, quoted or not, in any repo, makes it "stale:
judged at <head>". A stale judgement needs a new judgement or an explicit
renewed review, even when every quote is still there. The sequence: the
review judges head A and writes its note; commit B saves the note and the
records, and the judgement stays current; commit C changes a source file,
and the judgement is stale; the renewed review judges C, and commit D saves
it. A quote that is not there gives "evidence not found". `al` shows a quote that it found as
"quote found", never as "complies": the meaning is the AI's judgement. C8
gives hints only. A judgement never clears or hides a `not ok` or a refusal
of `al conclude` (LD-12), and it never blocks. To make a judgement block
needs its own requirement and the owner's signature.

<!-- LD-29 choice serves:R1 -->

Search only adds. The search question of skill step 2 adds candidates for
the review to read. It never adds to or removes from `al`'s list, which
stays the same with or without search (LD-25), and it never changes the
result of a check.

<!-- LD-30 rationale -->

Why advisory: in a real test on an open-source project, two GPT judges
with a fixed general rubric missed a change's violation of its RFC about 1
time in 5, and a majority of three did not fix it. A separate prompt with a
fixed procedure for that one question then gave the key's label in every
run, also on controls that comply or do not address the item (60 of 60
labels). So a judgement was reliable with a procedure fitted to the
question. Nothing yet shows that a general review is. The quote check
catches an invented quote, not a wrong reading.

<!-- LD-31 note -->

## 5. The knowledge base (plan)

<!-- LD-32 plan -->

One setting, `search`:

1. `own`: the user's knowledge base, named as an MCP server or a skill.
2. `local` (the default): full text alone, or full text with one embedding
   model and an optional reranker, from the measured list. `al` suggests a
   model from the free memory and disk and the measured figures, with the
   published benchmarks beside them; the user chooses; `al` downloads it on
   first use, showing its size. Without the model library, `al ask` answers
   with full text and says how to add a model.
3. `none`: the skill tells the AI to grep.

<!-- LD-45 plan -->

The setup skill asks first whether the user has a knowledge base, and sets
`own` when there is one. When there is none, it offers `local` with its
suggestion, or `none`.

<!-- LD-33 plan -->

The local index keeps today's searchable text with its roles (DES-64): the
spec and change-spec paragraphs with their proposals, the organized
requirements, the ADRs with their sources and alternatives, the source
snapshots, the decisions in the records, the result files, the output lines
that cite an ID, and their history from git. It adds one rough line for
each file of the spec repo and the output repos that says what the file is
(code, test, doc, config). Code is not indexed by syntax unit: agents grep
code, and code navigation belongs to code tools. Whether syntax units add
right answers is measured (section 7). The checks never use the knowledge
base.

<!-- LD-34 note -->

## 6. Signed requirements to sign again (plan)

<!-- LD-35 plan -->

When the tests give their results, each item below goes to the owner as
its own new version, one at a time. Nothing is built or removed until the
tests give their results and the owner signs these new versions.

| Requirement | The new version says, in short |
|---|---|
| v4/R5 | At close, `al` derives a disposition where it can prove it; a person writes one line only where `al` cannot. |
| v4/R8 | Test outcomes also come from the project's CI reports, with the commit of the run. |
| v4/R10 | Search is the user's own knowledge base, `al`'s local one over today's searchable text and a rough line for each file (full text, or with a model), or none. Setup asks for the user's own one first. |
| hints-and-blocks/R1 | A changed ADR text is a hint until the change is judged in one recorded line, in place of `--align`. |
| level2-peer/R1 | `al ask` answers with full text without the model library, and says how to add one. |
| context-all/R1 | The questions never leave a line out; `--full` shows everything. |
| design-links/R1 | Asked about an ID, `al` lists the paragraphs that build on, explain or illustrate it, with no `al context`. |

<!-- LD-36 note -->

## 7. What the tests decide (plan)

<!-- LD-37 plan -->

| Question | Test |
|---|---|
| Do the questions and the knowledge base give more right answers than the AI alone, or as many for fewer tokens, and how close do they come to the best effort (the strongest model with a large budget)? | an answer test on `al`'s own questions, with an upper bar |
| Does the local knowledge base add right answers, or only cost? The light prototype runs twice, with `local` and with `none`. If `local` shows no gain, the architect brings this to the owner, who chose `local` as the default | the answer test, the light prototype in two settings |
| Which model, fusion and reranker | a local model bench (#28), the Agent Retrieval Bench reproduction, and the answer test's tuning |
| Do agents write IDs when the skill asks? | the real test's arm with commit-message IDs and a rough map |
| Does it change the result of building and reviewing real changes, small to large? | a real test on an open-source project |
| Do the paths still work: a fix, an amendment, an epic in parts, two epics at once, a spike, a bug? | a case walk-through in the build's own tests |
| Do the list and the judgements of section 4a catch the violations in real changes, against a plain review? How many false alarms, and how many tokens? Which form of the list works better at the tested set size? (#45, #29) | the real test, with one more build arm and review modes with a prototype of section 4a (no separate test); the real test already holds a real rule break, and its review comparison plants a decision violation. The review modes run the list in both forms (every item as one line, and the grouped line) on the project's own set in force; the conclusion holds for that size only |
| At which size of the set in force does the grouped line become the better form? (the size of LD-25; 300 is provisional) | a size calibration before the release value is chosen: both list forms on sets of several sizes on both sides of 300, made as subsets of a real set in force that keep the decisions that the cases need and their known answers, with the rule for choosing the size fixed before the runs |
| The same for an ordinary one-file change | the answer test's ordinary changes: the list's tokens counted in full; the list alone is not a claim of drift |
| A long ADR; a judgement renewed after a small amendment (current, stale) | the build's own tests, with cases made for them; not answered by the real test |
| A fresh setup with the user's own knowledge base, with `local` and with `none`; an upgrade that keeps every task, declared output, decision and sign-off readable | the build's own tests |
| Do code syntax units add right answers? | the same light prototype with two index scopes (with and without syntax units) on the same questions: in the answer test if its frozen plan can take it, else a run after it |
| Speed at 1,000 requests and 20 repos | a scale test before release |
| The cost, in tokens and owner round trips | the answer test, the real test, and the adopters after release (#26) |

<!-- LD-38 note -->

## 8. Smaller asks (plan)

<!-- LD-39 plan -->

- Non-code projects: `al` reads Markdown and git; any text works.
- Saved work items may be YAML or JSON.
- Schema extension by users: not offered (the architect's proposal; the
  owner may keep it).
- The AI-filled hint index: not built; the commit message lines and the
  knowledge base serve its purpose (the architect's proposal).
- An ADR may carry a sign-off snapshot, as a requirement does.
- Typo fixes: the path 0 typo claim stays.
- #19: open, unchanged.
- Work items out of the CI token's reach (#38, Q9, Q19): a setting names
  them, and `al` gives one info line for them, in place of a hint for each.
- #30 (`al` proposes kinds and document links for the author to confirm):
  its idea is taken for file scopes (LD-26). Kinds need no suggestion after
  K1's six groups. Document links are not offered now: the adopter that
  answered #38 said that writing the markers and links is "not a pain"
  (Q12), and that judging hints and migrations cost more.
- #45: each part was evaluated. Taken: only what is in force counts (as
  "in force", with no new word); retrieval only as a helper. Changed: the
  file scope is optional and only helps the list; below the size, every
  other item as one line, not its whole text; judgements only for the
  items that apply or are uncertain, with the evidence of LD-27 and LD-28;
  the measure of injected violations becomes an arm of the real test.
  #28's search over the binding set only: changed, the list uses only what
  is in force, and `al ask` keeps all marked text.

<!-- LD-40 open -->

Not decided here: command names, file formats, the release plan and the
order of building. They follow the owner's agreement.
