<!-- LD-1 note -->

# The light design: the change spec

<!-- LD-2 note -->

This change serves R1, R2 and R3 in `request.md`. It makes `al` lighter for
the user and the AI, and adds the code side: the requirements and decisions
in force for a change, the review's judgements, and a check of their
evidence (section 4a). It also changes how a change is written and
consolidated. The change spec is one readable design of the change, and the
AI brings it into the consolidated spec by its own judgement, which the
review checks (section 3). Five signed requirements get new versions, which
the owner signs one at a time (section 6). A part that depends on a new
version is built only after the owner signs it. The code side builds the
signed R1, R2 and R3, and can start when this change spec is reviewed and
merged.

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

From the same owner's words: the chain runs from the requirement, through
the spec and the design, to the work: code, tests and documents. Most of
the spec is derived design, and it can run to hundreds of pages. Each change
keeps its own documents, its design above all, beside the consolidated
spec, and its design honors the consolidated design. Consolidation is a
judgement, not a mechanical merge. The skill guides the AI's judgements; the
program keeps only a few facts. Audit questions run once in a while, not on
every change. Search is the team's own knowledge base, a local one, or none,
as the user chooses. A skill helps a project adopt `al` from scratch, or
move from an older version. `al` knows when a source changed after a change
relied on it. Code, tests and docs in up to 20 repos link to one spec repo.
A check takes 10 s at 1,000 requests; a search takes 2 s across 20 repos.

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

<!-- LD-53 rationale -->

Skill first. The skill guides the judgements: how to write a change's
design, how to consolidate it, and how to review it. The program keeps only
the facts that an AI forgets or invents: the signed text and its changes,
the items in force for a change, the spec paragraphs that a change named
and the ones it changed, the quotes of a review judgement, and a work item
that changed. `al` calls no model.

<!-- LD-9 rationale -->

A cut must not force a rewrite, and must not lose a fact. `al` maps old
kinds to the new words. Tasks, declared outputs, decisions, dispositions and
sign-offs in today's records stay readable. An old change spec that holds
replacement text stays valid: its `changes` links read as references. The
migration skill shows the answers of `al check` and `al context` before and
after, so an old project cannot turn clean by losing facts. A command that
goes (`al index --align`) still answers for one release, and says what
replaces it. A project adopts `al` from the day of adoption: its existing
spec paragraphs are the adopted baseline (DES-38, DES-39), and no history is
replayed. Adopters named adoption and upgrades as a real cost, so each must
take little work.

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
shown, and changes neither `--strict` nor `conclude`. An edit that changes
only an ID, or moves a paragraph, gives no hint. An edit of an accepted or
replaced ADR's marker line keeps the hint of adr-edits/R1.

<!-- LD-13 rationale -->

Check the change itself, not only the records. In the adopter project that
answered #38, no code file names a spec ID, and 1 of about 30 test files
does (Q14). So a check that waits for code or tests to name an ID sees
almost nothing there. `al` lists, in plain code, the requirements and
decisions in force that may govern a change, and says the limits of the
list. The user's AI judges the ones that apply, and `al` checks the
evidence that the AI quotes (section 4a). `al` calls no model.

<!-- LD-14 note -->

## 3. The records and consolidation (plans; a part that changes a signed requirement waits for the owner's new signature)

<!-- LD-54 plan -->

The change spec. It is the design of one change, for that change only,
written as one readable document: what the change does and why, its
promises, its design and its plan (v4/R1). Each paragraph keeps an ID and a
kind (v4/R2). A promise or design paragraph says which requirement it
serves, and names by ID the spec paragraphs that it builds on
(`builds-on`) or changes (`changes`). It holds no copy of a spec paragraph
and no replacement text. It says in its own words what the change does to
that part of the system, and it is not written as "change X from A to B".
One change paragraph may name several spec paragraphs, and several change
paragraphs may name one. So the change spec follows the change's own line
of thought, not the order of the spec. For example, a flow paragraph that
serves R1 and changes INV-41 and INV-42 may say: "A shared export link
lives for 24 hours from its creation; the email carries only the link." A
change may also name a project document as its design (LD-48). Deleting a
paragraph of an open change spec is ordinary editing
(delete-in-change-spec/R1).

<!-- LD-15 plan -->

Kinds: six groups, each read exactly as today's checks read it: `promise`
(purpose, scope, rule, limit, definition), `design` (component, interface,
data, flow, choice), `approach`, `explain` (rationale, example, open),
`plan` (plan, step, migration) and `note`. Old kinds are read as their
group, so no file changes. A paragraph still has a kind (v4/R2); the list
is shorter.

<!-- LD-55 plan -->

Consolidation. The AI brings the change into `specs/` by its own judgement,
when a piece is ready: in the PR with its code, or in a later PR, part by
part for an epic, before the change closes. It writes `specs/` as the
current system. It may rewrite, split or join paragraphs so that the spec
reads well, and it writes no Was/Now text. Promise, design and explain
paragraphs go into `specs/`; plan, `approach` and `note` paragraphs stay
with the change as its history. No command writes the spec. An ID that
leaves `specs/` is named in the change spec with `removes:`, as today, and
a loss that nobody declared stays a hint. A promise paragraph that is
consolidated before its requirement is signed is `not ok`, as today. An ID
is never used again.

<!-- LD-56 plan -->

The map. On a branch with an open change (path 2 or 3), `al check` shows
the change against its base, from facts only:

- each spec paragraph that the branch added, changed or removed, with the
  change paragraphs that name it;
- each change paragraph that names a spec paragraph by `changes` or
  `removes`, with that paragraph's state: unchanged since the link, changed
  since the link, or removed.

<!-- LD-61 plan -->

The states are facts. "Unchanged since the link" means that the named
paragraph still has the version that it had when the change first linked
it. No judgement moves that version. "Changed since the link" and "removed"
say only that the text changed or left `specs/`. Whether the change's
effect is in it is the review's judgement (LD-59). So a lost edit, and a
revert to the linked text, show as unchanged; a revert in other words shows
through a stale consolidation judgement. When the change's own branch
changes a named paragraph, `al` keeps that version in its own records; no
person and no AI writes or reads it. A later edit of that paragraph by
other work gives the parallel-work hint of v4/R6, as today; the change's
own consolidation does not. A recorded judgement clears that hint and
changes no state of the map. `al` compares no text with text. The map also
shows, for each change paragraph that goes into
`specs/`, its consolidation judgement (LD-59): current, stale or none. The
review reads the map beside the change spec and the spec's diff, and judges
the consolidation (LD-20, step 4.5).

<!-- LD-59 plan -->

The consolidation judgement. The review writes it as an ordinary judgement
of LD-27, in the same note, one for each piece that it consolidates. Its
item is the change paragraph or paragraphs of that piece. It names the spec
paragraphs that hold them now, says complies, violates or unclear with the
reason, and quotes the change paragraph and the spec text. It may name
several change paragraphs and several spec paragraphs, so a split or a join
needs one judgement. C8 checks its quotes. `al` keeps, by itself, the
version of each paragraph that the judgement names. The judgement goes
stale when any of them changes. So a later rewrite that loses an effect of
a consolidated piece, by this change or by other work, makes the judgement
stale and shows it again. Nothing is dropped in silence, and no record is
written for each paragraph.

<!-- LD-60 plan -->

The hints of the map: a spec paragraph that the branch changed and that no
change paragraph names; and a change paragraph that goes into `specs/` with
no current consolidation judgement. Each clears by a fix: a link, or a new
judgement. `al conclude` shows them again before it closes, and they never
refuse (R2).

<!-- LD-57 plan -->

The close rule, by path. A spike closes as today (DES-44): its current
question is signed, its answer names the question version, and its change
spec needs no consolidation; an unsigned spike that the owner drops may be
abandoned unsigned. Paths 0, 1 and 1d close as today. On paths 2 and 3,
`al conclude` refuses while:

1. a promise change is not signed (as today);
2. a signed requirement in the request's current version has no declared
   link: a `serves` link from a paragraph in `specs/`, or a `decides` link
   from an accepted ADR. A requirement that the owner dropped is not in the
   current signed version, so it is not asked for. `al` says "no declared
   paragraph link", never "not built". During work the same fact is a hint
   (LD-49); only `al conclude` refuses on it;
3. a change paragraph names a spec paragraph by `changes`, and that
   paragraph is unchanged since the link (LD-61); or it names one by
   `removes`, and that paragraph is still in `specs/`.

<!-- LD-62 plan -->

A close line clears items 2 and 3: one sentence that the author records
with `al record`. For item 3, it names the change paragraph as not
delivered, with the reason. For item 2, it names where the requirement is
met when no lasting paragraph links to it: an existing design reused, or a
one-time task such as a migration. `al` keeps, by itself, the versions of
what the line names: the change paragraph or the requirement, and the spec
paragraphs that its reason names. The line clears only while they keep
those versions. When one of them changes, `al conclude` names the line as
stale, and it clears nothing until the author records it again. A close
line is the author's declaration, shown with its basis. It is not a
judgement of LD-12, and the review reads it. Nothing else refuses: a missing or stale consolidation judgement is shown
(LD-60), and a judgement never clears or causes a refusal (R2).
`al conclude` compares no text with text, and asks for no record for each
change paragraph. It runs on the closing PR's state, and an archived
request is never checked again against today's spec (as today). Items 2 and
3 and the consolidation judgements keep the two promises of v4/R5: every
signed requirement is served, and nothing applied is dropped in silence.

<!-- LD-58 plan -->

This change removes from today's design (`specs/design.md`, section 5): the
dispositions and their table, the exact-text rule, the wording decisions,
and the close rule that asks for a disposition for each change paragraph.
In section 4, `changes <ID>` becomes a reference with no replacement text,
and `al index --align` gives way to the recorded judgement of LD-12. Typo
claims stay, on path 0. Old records that hold dispositions or wording
decisions stay readable, and `al` no longer checks them (LD-9).

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
- `al conclude`, with the close rule of LD-57.
- Spikes and their signed question.
- C1 as `not ok` under `--strict` (signed hints-and-blocks/R2, R5).
- Every signed hint (own-item, adr-edits, issue-hints with phrases,
  hints-and-blocks/R1, closed-items, several-successors, adr-lists,
  delete-in-change-spec). A hint goes only with usage evidence and the
  owner's signature.
- The rule that an ID is never used again.
- Result files, as today.
- `--at <commit>` on `al check` and `al context`.

<!-- LD-17 note -->

## 4. Commands, answers and the skill (plans)

<!-- LD-18 plan -->

Three commands for the AI, the same as MCP tools. Each answer is a few
lines, groups repeated lines but never leaves one out (context-all/R1), and
says what to ask next only where that helps. `--full` shows everything;
`--at <commit>` answers as of a past commit.

- `al check`: every check of today's `al`, plus C7 and C8. On a change, it
  also shows the list of section 4a and the map of LD-56. `--all` is an
  audit.
- `al context [<request> | <ID>]`: with no argument, where the project
  stands. For a request, where it stands and what to do next, and with
  `--audit` its whole trace (v4/R9). The ID may name a paragraph, a
  requirement or an ADR (`ADR-2`). For an ID, its text in one line, its
  file and line, its status, what replaced what, its last signed version,
  the paragraphs that build on, explain or illustrate it, the open changes
  that name it, and the places that cite it, marked current or historical.
- `al search <words>`: the configured search (section 5); its results are
  marked as suggestions.

<!-- LD-63 plan -->

The record commands stay: `al new`, `al record`, `al spec` and
`al conclude`. `al export` stays, to feed a team's own knowledge base.
`al check` runs `al index`. Today's review view
(`al context --diff <range> --for review`) becomes the list and the map of
`al check`.

<!-- LD-19 plan -->

The default scope of a review is the change's affected IDs: the IDs that
the diff touches, plus open text that cites an ID whose text or status the
change alters, plus what the list of section 4a shows by citation or by
file scope. An answer is reused while its inputs stay the same: the base,
the changed content, the source versions, the saved work items, the
repository states and the options. A refreshed work item ends the reuse.
`al context <ID>` gives the citing places as counts by place with their
first lines, and "N more: al context <ID> --full".

<!-- LD-20 plan -->

The skill guides the judgements. It stays short, because the AI reads it
on every task. Its steps:

1. At the start of a task: run `al check` for the list of what is in force
   (section 4a). Read the requirement, the change spec and the listed
   items. Ask `al context <ID>` for an item whose status or history
   matters.
2. Writing a change spec: write the change's design as one readable
   document. Name the requirement that each part serves, and the spec
   paragraphs that it builds on or changes. Copy no spec text, and write no
   "from A to B".
3. Consolidating: when a piece is ready, write `specs/` as the current
   system, and honor what is in force. Rewrite, split or join paragraphs
   where that reads better. Write no Was/Now text. Then run `al check` and
   read the map (LD-56).
4. Reviewing: start from the change's behaviour, not only from the IDs
   written.
   1. Read the diff, the task, the list and the map.
   2. Ask one search question about the changed behaviour: "which
      requirement or decision governs <behaviour>?". Written IDs can be
      incomplete or wrong. When search is off, use grep. An empty result
      never means that every governing item was found.
   3. Write a judgement for each item that applies to the change, conflicts
      with it, or that you are not sure of, however you found it, with its
      evidence (LD-27). Write no routine judgement for an item that does
      not apply.
   4. For a design in the change: does it answer the request's organized
      requirement, and does any part serve none?
   5. For the consolidation: does `specs/` now say what the change decided,
      with nothing lost and nothing added that the change did not decide?
      Write one consolidation judgement for each piece (LD-59).
   6. For the changed behaviour, find the test assertions that check it, by
      search or grep, whether or not a test names an ID and whether or not
      the test changed. Read each assertion: a name is not a check. When
      none is found, or none was read, say so as unknown. A code quote
      never stands for a test.
   7. For the changed behaviour, find the user documents that describe it,
      changed or not, and compare them with what was decided. A document
      that you did not read stays unknown.
   8. Judge a "fix" claim: does the change alter behaviour that a
      requirement covers?
   9. Run `al check` once more. Stop when the search question and the
      lookups find nothing more that applies. An empty lookup alone does
      not mean that nothing applies.
5. When the spec is large, or the task's words are not the spec's words:
   search first (section 5), with the team's knowledge base when there is
   one, then read the files that it names.
6. In every answer: write so that a reader can check it (LD-47).
7. An audit, only on request: `al check --all`, and a judgement for every
   item in force, "not applicable" included.

<!-- LD-47 plan -->

Answers that a reader can check. Beside each ID that it shows, `al` gives
the project file and line of the item's text at the selected repository
and revision. The grouped line of the list (LD-25) names its IDs only;
`al check --full` gives their file, line and text. Where a fact is held only in `al`'s records (a sign-off, a
tier, a request's state), `al` names that record as the source and says
that only its records hold the fact. It never makes up a project line, and
it never shows its paragraph markers as a source. Evidence that is missing
or cannot be read is reported as a limit. The skill tells the AI:

- support each material claim, with its meaning, its state and its
  version, from the project's own text, and cite the file and line, with an
  `al` ID beside it only as a label;
- keep apart project evidence, declared links, inferences, facts held only
  in `al`'s records, and what is unknown;
- report `al`'s own output (a hint, a `Tier:` line, a "not checked" line)
  as `al`'s output, and check a hint in the project's files before stating
  it as a fact;
- "`al` found no hint" does not mean "the change has no misalignment".

<!-- LD-41 plan -->

On an ordinary change `al` gives no hint; `al check` shows only the list of
section 4a and the map. The coding agent reads the list at the start
(skill step 1), and asks one search question for what is new and has no
ID.

<!-- LD-22 flow serves:R3 -->

C7: a saved work item whose text differs from the text that `al` kept when
the change relied on it. The text is the item's body and each comment that
is not minimized, in order, with line ends made LF; its state is not text.
`al index --issues <folder>` keeps the SHA-256 of a JSON list of these
texts in the request's record, by itself; no person and no AI writes or
reads it. It keeps it only at a moment that is now: when the record at HEAD
has no task that names the item (the request names it in this edit), and at
the first sign-off after the naming, while that sign-off is not at HEAD.
The text at that sign-off is the one that counts, else the text at the
naming. A moment that is past is not kept. So `al check --issues` gives
the hint `issue-changed` with "not known", not "unchanged", for an item
named in an earlier commit with no text kept, for a sign-off after the
naming with no text kept at it, and for an item that is not in the folder
or cannot be read. `al` cannot know when the caller saved a file, so each
`al check --issues` says so in its Not known line, and the caller saves the
items again before a check. A closed item gets the same
hint (DES-91): C7 compares the item with its own text at the moment of
reliance, which is what held then (LD-11). An archived request is not
checked. Without `--issues`, no line is about items (DES-92). The hint
clears by a recorded judgement that the change was read (LD-12):
`al record <name> judgement --hint issue-changed --on <item> --reason <why>
--issues <folder>` keeps the item's text with the judgement, and the moment
of reliance that held then. The hint comes back when that text changes
again, or when a later sign-off becomes the moment of reliance. Only `issue-changed` takes a
judgement until the general judgement of LD-12 is built.

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
  `decides` links. An ADR is replaced when an accepted ADR names it by
  `supersedes:`. An ADR's text also names the alternatives that were
  considered (SCH-22), so the review reads which part is the decision; `al`
  marks no part as binding.
- The selected change's own signed requirements and its proposed design
  (LD-48), shown as "proposed by this change", apart from what already
  holds. The change's own request is an open request whose folder or
  record the change touches, or whose name a commit message of the branch
  names. An unsigned requirement of it is not listed; the limits name it.

<!-- LD-48 data serves:R1 -->

The change's proposed design. Besides its own change spec, a change may
name a project document as its design, by a design line. In the request's
`request.md` or in a saved work item in Markdown, a design line is a line
that starts with `Design:` and holds one path from the repo's root, for
example `Design: docs/rfc/0018-streaming-http-api.md`. In a saved work item
in YAML or JSON, it is the field `design`, with one path or a list of
paths. Each path names one document of the spec repo, or, written
`<repo>:<path>`, of an output repo in the configuration, read at its
selected commit. A saved work item gives a design only when a task of the
change's own request names it. A plain mention, or a link for comparison or for
history, does not make a document the change's design. `al` reads the
named document at the selected revision and shows where the design line
is, the document's state as `al` reads it (an ADR's status; for another
document, its marked state or "state unknown"), and "proposed design of
this change". It never shows that document as in force. A design line
whose document is missing or cannot be read gives a hint that names it; a
removed design line removes the document from the list. A named document
with paragraph markers is read as design paragraphs of the change, with the
same rules as its change spec. A document with no markers is supporting
evidence: the list shows it, and the change spec holds the trace (the
`serves`, `builds-on`, `changes` and `removes` links). When the proposed
design conflicts with an item in force, both are shown, and the item in
force stays in force. The fixtures, with no model: a design line for one
document and a plain mention of another; a design line removed; a design
line whose file is missing; a document whose state `al` cannot read; and a
proposed design that conflicts with an accepted ADR. Why: a change's design
often lives in a project document, such as a draft RFC, and the review must
read it as the change's proposal, not as a decision in force.

<!-- LD-42 data serves:R1 -->

Not in force: another open request's proposal (shown as "open proposal on
<ID>", as today), a replaced ADR, and approach, explain, plan and note
paragraphs. An accepted ADR whose text changed keeps today's hint, and the
list marks it "text changed, review open".

<!-- LD-25 flow serves:R1 -->

The list for a change, in plain code, with no model. It is the same with or
without search. The change is what `al check` selects: its base to the
working tree, with the untracked files, and with `.assuredloop/` left out.
With no base, or an empty change, the list says "no change selected".

- The items in force that the change edits, and the ones that it cites: a
  line that it adds or removes names the ID as a whole word. A paragraph's
  own ID in its marker line is no citation.
- The items whose confirmed file scope (LD-26) matches a changed, renamed
  or deleted file, in the repo that holds it.
- The items whose scope is all files.
- The change's proposed design (LD-48).
- Every other item in force, named by its ID and grouped, with exact
  counts: "N further items in force: U with no known scope: <IDs>; K with a
  scope that does not match this change: <IDs>". Their text is not shown;
  `al check --full` shows it. No item is left out (context-all/R1). The
  search question of skill step 4.2 covers both groups. A scope that does
  not match is not proof that the item cannot apply: new behaviour can make
  an old scope incomplete.

<!-- LD-52 rationale -->

The items above the grouped line show their ID and their text in one line.
Why the rest is named and not shown: the full text of every item in force,
on every check, repeats long text, costs tokens and hides the items that
matter for the change. The names keep every item in view
(context-all/R1), and `--full` shows the text.

<!-- LD-43 flow serves:R1 -->

The list says its basis (cited, by scope, the change's proposed design, or
named in the grouped line), the way to the text that it does not show, and
its limits. It never says that an item it does not show in full cannot
apply.

<!-- LD-26 data serves:R1 -->

File scope, optional. An item in force may say which files it concerns, or
all files, in its marker line: `files:` and one or more globs from the
repo's root, joined by commas, for example `files:src/export/**,test/**`.
`**` matches any number of folders, `*` matches within one folder name, and
`?` matches one character. A space or a comma in a path is written as `?`.
All files is `files:**`. The author writes the token, and a written token
is the confirmed scope. `al` may later suggest it from git history (the
files changed in the commits that cite the item). The token is not part of
the item's text and is no link: adding, changing or removing it changes no
hash and gives no marker hint. When the change adds, changes or removes an
item's token, the list shows that item, so that a narrower scope cannot
move an item out of view. A scope helps the list; it never proves that
other files cannot affect the item. A scope that matches no file at the
selected commit gets a hint.

<!-- LD-27 data serves:R2 -->

The judgements. The review AI judges the items that apply to the change,
conflict with it, or that it is not sure of, however it found them. It
writes no routine "not applicable" judgement; earlier judgements stay. It
writes them in a short readable note beside the change's design. Each
judgement holds:

- the item's ID; `al` adds the item's version;
- complies, violates or unclear (and, in an audit, not applicable), with
  the reason in one sentence;
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
word, wherever `al` can find the item: in force, proposed (LD-48), draft or
replaced. It shows the item's state beside the result, for example "quote
found; item not in force". It also checks that the code or test quote is in the file at the head or the
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
it. A quote that is not there gives "quote not found"; an item that `al`
cannot find gives "item not found". `al` shows a quote that it found as
"quote found", never as "complies": the meaning is the AI's judgement. C8
gives hints only. A judgement never clears or hides a `not ok` or a refusal
of `al conclude` (LD-12), and it never blocks. To make a judgement block
needs its own requirement and the owner's signature.

<!-- LD-29 choice serves:R1 -->

Search only adds. The search question of skill step 4.2 adds candidates for
the review to read. It never adds to or removes from `al`'s list, which
stays the same with or without search (LD-25), and it never changes the
result of a check. The quote check catches an invented quote, not a wrong
reading; the meaning stays the review's judgement.

<!-- LD-49 plan -->

The whole chain, from the requirement through the design and the spec to
the code, the tests and the user documents. Each link is either an exact
check, proven by a planted fixture and a code test that uses no model, or a
question for the AI's review (LD-20). Exact today: `signoff-coverage` and
`superseded-cited` (`not ok`); `design-link`, `stale-base`,
`holder-changed`, `target-removed`, `overlap`, `no-claim`, the ADR-change
hints and the test-result source rules (hints). New: the map of LD-56 and
its hints (LD-60), and a signed requirement of an open change with no
declared link to a promise or design paragraph. During work that is a hint; at close it is item 2 of
LD-57. It says "no declared paragraph link", never "not served" or "not
built", and it shows the known direct links to code, tests and documents,
with their limits. Its fixtures: direct output links only, an existing
design reused, an ADR only, partial links, and no link. Whether the code
does what the requirement says, and whether a user document still says what
was decided, stay review questions (LD-20, steps 4.4, 4.6 and 4.7); the
code tests do not prove them.

<!-- LD-31 note -->

## 5. Search and the knowledge base (plan)

<!-- LD-32 plan -->

One setting, `search`, which the user chooses:

1. `own`: the team's knowledge base, named as an MCP server or a skill.
   `al export` gives it `al`'s rows: each paragraph version with its role,
   version, commit and links.
2. `local`: word search alone, or word search with one embedding model that
   the user picks. `al` shows a short list of models, each with its size
   and its published benchmark figures, and downloads the chosen one on
   first use, showing its size. Without the model library, `al search`
   answers with word search and says how to add a model.
3. `none`: no search; the skill tells the AI to grep.

<!-- LD-64 plan -->

No setting is a default by itself. The checks never use search.

<!-- LD-45 plan -->

The setup skill asks first whether the team has a knowledge base, and sets
`own` when there is one. When there is none, it offers `local` or `none`,
with what each costs on the user's computer (disk, memory and the first
index), and the user chooses. Until a choice is set, `al search` says so
and how to set it, and the checks run as usual. The skill asks for one
search question in each review (LD-20, step 4.2), with the chosen search or
with grep. It asks for more searches when the spec is large, or when the
task's words are not the spec's words.

<!-- LD-33 plan -->

The local index keeps today's searchable text with its roles (DES-64): the
spec and change-spec paragraphs with their proposals, the organized
requirements, the ADRs with their sources and alternatives, the source
snapshots, the decisions in the records, the result files, the output lines
that cite an ID, and their history from git. It adds one rough line for
each file of the spec repo and the output repos that says what the file is
(code, test, doc, config). Code is not indexed by syntax unit: agents grep
code, and code navigation belongs to code tools.

<!-- LD-34 note -->

## 6. Signed requirements to sign again (plan)

<!-- LD-35 plan -->

Each item below goes to the owner as its own new version, one at a time.
A part that depends on one is built only after the owner signs it. R1, R2
and R3 of this request are signed, and the code side (section 4a) needs no
new version. level2-peer/R1 stays as signed: its level 1 is `local` word
search, and its level 2 is `local` with a model. v4/R1, R2, R6, R8, R9 and
R12 stay as signed.

| Requirement | The new version says, in short |
|---|---|
| v4/R5 | The agent brings each piece of a change into the consolidated spec by its own judgement, with no tool command, part by part for an epic, before the change closes, as long as it does not deviate. The review checks it. Concluding needs every promise change signed, every signed requirement served in the consolidated spec, and every spec part that the change set out to change or remove either changed or named as not delivered, with a reason. Nothing applied may be dropped silently. |
| v4/R10 | Search is the team's own knowledge base, a local one, or none, as the user chooses; no level is a default. Setup asks for the team's own one first. A local model stays optional, and the user picks it. Every level works, and the checks never use search. The rest of R10 stays. |
| hints-and-blocks/R1 | A changed ADR text is a hint until the change is judged in one recorded line, in place of `al index --align`. |
| context-all/R1 | Answers group repeated output but never leave a line out, and show everything on request. A reader can find the evidence of each reported fact, and an answer keeps apart project evidence, facts held only in `al`'s records, inferences and unknowns. |
| design-links/R1 | Asked about an ID, `al` lists the paragraphs that build on, explain or illustrate it. `al` also points out a signed requirement of an open change with no declared link to a promise or design paragraph, as a hint that never claims that the requirement has no code or test. |

<!-- LD-36 note -->

## 7. How it is proven (plan)

<!-- LD-37 plan -->

Every check is proven by a planted fixture and a code test that uses no
model. What an AI judges stays a review question, and code tests do not
prove it.

| What | How |
|---|---|
| The map and the close rule: a named spec paragraph unchanged, changed, lost, reverted to the linked text, and removed; a change paragraph named as not delivered; a spec paragraph changed with no change paragraph that names it; two open changes on one paragraph; a later edit by other work, then a recorded judgement on it, with no change to the map's state; a requirement with no declared link, one met by an ADR, and one with a close line; a close line that goes stale when its change paragraph, its requirement or a spec paragraph that it names changes; a spike, signed and unsigned | planted fixtures in the build's own tests |
| The consolidation judgement: one piece split into two spec paragraphs, two pieces joined into one; current, then stale after a later rewrite by the same change and by other work; missing at close | planted fixtures in the build's own tests |
| A design line to a document with markers, and to one with none | planted fixtures in the build's own tests |
| The paths: a fix, an amendment, an epic in parts, two epics at once, a spike, a bug | a case walk-through in the build's own tests |
| A long ADR; a judgement renewed after a small amendment (current, stale) | the build's own tests, with cases made for them |
| A fresh setup with `own`, `local` and `none`; an upgrade that keeps every task, declared output, decision and sign-off readable, and gives the same facts in `al check` before and after | the build's own tests |
| Speed at 1,000 requests and 20 repos | a scale test before release |
| The cost in tokens and owner round trips | real use after release |

<!-- LD-38 note -->

## 8. Smaller asks (plan)

<!-- LD-39 plan -->

- Non-code projects: `al` reads Markdown and git; any text works.
- Saved work items may be YAML or JSON.
- Schema extension by users: not offered.
- The AI-filled hint index: not built; the commit message lines and search
  serve its purpose.
- An ADR may carry a sign-off snapshot, as a requirement does.
- Typo fixes: the path 0 typo claim stays.
- Work items out of the CI token's reach (#38, Q9, Q19): a setting names
  them, and `al` gives one info line for them, in place of a hint for each.
- Suggestions: `al` suggests file scopes (LD-26). Kinds need no suggestion
  after the six groups. Document links are not suggested now: the adopter
  that answered #38 said that writing the markers and links is "not a pain"
  (Q12), and that judging hints and migrations cost more.
- Test outcomes from the project's CI reports: not planned now. Result files
  stay as today.
- Only what is in force counts, as "in force", with no new word. Retrieval
  is only a helper: the list uses only what is in force, and `al search`
  keeps all marked text.

<!-- LD-40 open -->

Not decided here: file formats, the release plan and the order of building.
Two points wait for the owner: whether item 2 of the close rule (LD-57)
refuses or only hints, and whether item 3 stays.
