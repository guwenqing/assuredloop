# AssuredLoop v4: the design

This is the consolidated design for the request `assuredloop-v4`. It serves
the signed organized requirement R1-R14 in `request.md`. `schema.md` holds
the model and a worked example. "Input N" means owner input N, whose words are
in `origin/`. Where this design and an older text differ, this design holds.

## 1. Intent

What the owner wants, and why, in the owner's words:

- The light v1 failed in real use: "the spec is USELESS, and strange when you
  reference the wholeparagraph, and the most part in design is nothing
  traced" (input 101).
- Each change keeps its own documents, and one consolidated set stays
  current: "still have both one ti,e and the consolidated
  files/spec/design/adr" (input 92).
- "the big part of the change is the design itself for THAT CHANGE ONLY"
  (input 106), "with the honor of the existing consolidated design" (input
  107).
- "I DO NOT WANT TO HAVE 90% of the things in a "free" uncontrolled/untraced
  document" (input 109).
- No tool consolidates: "just do the simple paragraph replacement" (input
  95), and consolidation may happen "before the close of the whole "epic""
  (input 105).
- "a schema with modeling from input till the output (code + test + doc
  changes + adr .. etc), they are alll connected like a graph" (input 100).
- "if things are not useful, it is a total waste" (input 111), but "soem
  sort of price we must pay, we can pay" (input 127).
- "I allow ai to do typo fixing at least" (input 128).

**What v4 is not.** "I do not want a fullscacle lifecycle tool, to demand
user must follow an exact heavy wow to do everything in one way. anti
pattern, AWS's ai software development lifecycle framework" (input 126). AWS
AI-DLC (awslabs/aidlc-workflows, version 2) runs a deterministic engine with
14 agents and 33 stages, with a gate at each stage. Every rule in this design
must pass these limits:
- No phases or stages, and no order of work. How and when to test, review or
  design is the project's way of working (R11).
- The tool refuses only in its own command `al conclude`, for three reasons:
  a promise change with no signed requirement, a spike with no signed
  question, and a change paragraph with a baseline effect and no valid
  disposition (sections 5 and 6). All other checks are hints. Blocks in CI
  come only from a project's opt-in `--strict`.
- No roles, no approvals beyond the sign-off, no task states (R11).
- The user picks the path. A fix needs no record (R7).
- The tool keeps records of what was asked, decided, changed and delivered.
  It does not run the process. The records of what happened to spec text,
  and of which version a link read, are facts, not work phases, task
  dependencies, review receipts or approvals.

The risk to watch: an ID on every paragraph, and a kind and links on promise
and design paragraphs, come close to an element-level trace chain. The
difference must hold: the links live in the doc and in git, most checks are
hints, and the records cost a small share of the work (a flexible 20%
target, input 123). Validation measures each rule against that cost
(section 15).

## 2. One change, and the consolidated spec

Why: the owner keeps both a change's own documents and one current set
(inputs 92, 104-108), and wants no design text outside the trace (input 109).
A reader must find the current system without reading past changes (R1).

| Set | Where | Holds | Changes how |
|---|---|---|---|
| One change | `requests/<name>/origin/` | the owner's words as snapshots, with SHA-256 | append only |
| | `requests/<name>/request.md` | the dialog, the organized requirement (R1...), the sign-off line, decisions (D1...), task references, the outcome | the requirement is an editable draft until it is signed (section 6); signed versions, the dialog and the decisions are append only; task references and the outcome are updated |
| | `requests/<name>/spec.md` | **the change spec**: the promises this change adds or changes, its design (the largest part), its plan, and its explanations | edited in the change's PRs |
| Consolidated | `specs/*.md` | the system now: the promises and the lasting design, told apart by kind | a PR replaces paragraphs by hand |
| | `specs/adr/` | the decisions; an ADR is superseded, never edited | a new ADR file |
| Outputs | code, tests, `docs/` | the product and its user documents | normal PRs; traced from the change's record (input 112) |
| Tool data | `.assuredloop/` | `config.yaml`, `schema.yaml`, `records/` | the developer's agent and `al` |

- There is no free design document anywhere. Design lives only in a change
  spec or in `specs/` (inputs 108, 109).
- ADRs live in the spec folder (input 110). An ADR made in a change is
  written straight into `specs/adr/` by that change's PR. ADRs are append
  only, so they need no consolidation.
- User documents in `docs/` are an output of a change, like code and tests
  (input 112). They carry no paragraph IDs of their own.
- Explanations, plans and other paragraphs with no baseline effect stay with
  the change as its history. They are never copied into `specs/`.
- A change closes and its folder moves to `requests/archive/<name>/`.

## 3. IDs, kinds and links

Why: "I assume every paragraph will have an "id", so you can freely link
them" (input 100), and "there are different kind of texts" (input 100). Only
an ID stored in the text survives rewording: Doorstop takes the ID from the
file name, StrictDoc keeps a machine ID apart from the other fields, and the
Ferrocene Language Specification keeps a stable ID apart from its shown
paragraph number. IDs built from a hash or from a heading change when the
text changes.

**IDs:**
- Every paragraph has an ID. The key is one flat number per file, for example
  `INV-41`, never used again.
- The key is apart from the shown position. `al` computes a display number,
  for example "INV-41 (2.3:4, in Export links)". The display number can change
  when text moves; the key does not.
- An ID that is new in an open PR may be renumbered until the PR merges,
  because nothing outside the PR cites it yet. The duplicate-ID lint catches
  two parallel PRs that took the same number.
- A hidden HTML-comment marker goes on its own line before the paragraph,
  with a blank line after it and a blank line before it. Headings get
  markers too. GitHub does not show HTML comments, so a reader sees no ID.
- A list or a table belongs to the paragraph that introduces it.

Why the blank line: a marker on the line next to the text can join two
paragraphs in some Markdown renderers (tested with pandoc); a blank line
keeps them apart. Prettier and mdformat keep such markers and their blank
lines. The check flags a marker with no blank line after it.

**Kinds**, one per paragraph:

| Group | Kinds | Needs a link | A change to it needs |
|---|---|---|---|
| promise | purpose, scope, rule, limit, definition | yes | a signed requirement that covers it |
| design | component, interface, data, flow, choice | yes | review |
| informative | rationale, example, open | when it explains, illustrates or resolves something | review |
| note | note: introductions, headings, connecting text | no | review |
| change-only | plan, step, migration | no; it belongs to its request, and a task reference is optional | review; never consolidated |

- A `rule` has a strength: must, should or may. The script reads it from the
  words (MUST, SHOULD, MAY and their negations); nobody writes it.
- A `definition` is a promise kind, because it changes what the rules mean.
- A design `choice` that is hard to undo becomes an ADR.

**Links:**
- `serves R<n>`: a promise or design paragraph, to the requirement;
- `builds on <ID>` or `changes <ID>`: to a consolidated paragraph;
- `for <task>`: optional, for a project that uses tasks;
- `explains`, `illustrates`, `resolved by`, `governed by <ADR>`.

**Where the kind and the links are written** (input 123): in the paragraph's
hidden marker, so they move with the paragraph and cannot drift from it:

```markdown
<!-- INV-41 rule serves:invoice-exports/R2 builds-on:INV-12 -->

The export link MUST expire 30 minutes after the email is sent.
```

Inside a request's own change spec, `serves:R2` means that request's R2. In
`specs/`, a link names the request. The marker holds IDs only. The hashes and
versions at the time of each link are bindings that the script keeps in the
request's record (section 4).

**Who writes what:**
- People and agents write the markers (ID, kind, links) and the AI hints.
- The script recomputes every derived field (files, paths, hashes, git links,
  results) from the repo, and ignores or overwrites whatever anyone wrote
  there. It does not try to prove who wrote a byte.
- The link-time bindings are the one derived record that is kept, not
  recomputed: they are frozen when first indexed (section 4).
- A declared link is never shown as proven.

Why: derived facts that anyone can type in cannot be trusted, and a claim
shown as a fact misleads the review (the rules of the TraceLayer tool).

**What "checked" means.** The script checks that declarations are well formed
and that references resolve. It does not check that a kind is right, that a
requirement is fully covered, or that a change is authorized in substance.
`al context` and the review view say this in plain words; a clean check names
semantic coverage as "not checked".
- A code or test file that names an ID **cites** it. That is an exact fact.
- `implements` and `verifies` are declared claims. A test can cite INV-41 and
  check another condition, so a `verifies` claim is shown as a claim.
- Rough links from git history and from files that change together stay
  beside the declared links. The graph is not limited to the links that the
  author chose. Studies of trace links find that declared links are often
  incomplete (only about 60% of commits named an issue, Rath et al., ICSE
  2018).

**What the script checks** (no AI):
- A paragraph with no ID: `not ok`. A promise or design paragraph with no kind
  or no link: a hint; under opt-in `--strict`, `not ok`.
- A link to an ID that does not exist: `not ok`.
- Per PR, the ID lint: IDs lost since the base, IDs used twice, and IDs used
  again after removal. Agents can remove comments near the lines they edit
  (claude-code issue #22530), so a lost ID must be caught.
- A per-paragraph hash list, from which the script derives each paragraph's
  change in the PR: Changed, Moved, New or Removed.
- A non-promise kind whose text holds requirement words (MUST, SHALL, MUST
  NOT, SHOULD, MAY, never, always): the hint "promise kind?". ISO/IEC
  Directives Part 2 says notes "shall not contain requirements". It is only a
  hint: an example can quote a MUST correctly, and a new promise can hold no
  such word.
- A change paragraph whose text is close to an existing spec paragraph, with
  no `changes` or `builds on` link to it: the hint "does this change
  INV-12?".
- A change of kind from a promise kind to any other kind counts as a promise
  change.

**Who sets the kind.** The developer's agent proposes it in the PR, and the
review checks it. The review view shows each changed paragraph's text beside
its kind and its requirement, with the baseline paragraphs it touches. Text
that changes a promise gets the promise treatment, whatever its kind. The
review may ask for a split where that makes the text clearer.

## 4. The change spec honors the consolidated spec

Why: the change's design must honor "the existing consolidated design"
(input 107), and parallel work must align, never overwrite in silence (R6,
input 25). A link is only useful if it remembers what the target said when
the link was made.

- A change paragraph that relies on a spec paragraph says `builds on <ID>`.
  One that replaces it says `changes <ID>`. It holds no copy of the old text.
- **Bindings.** When a link is first indexed, the script records a binding in
  the request's record: the target's version or text hash at that time, and
  the source paragraph's text hash. Both ends are hashed.
  - Ordinary indexing never advances a binding.
  - Only an explicit align step (`al index --align <ID>`) advances it, after
    the agent has checked the change against the new target. The PR diff then
    shows the old and the new binding.
  - A newly declared link (not in the marker at the base commit) gets its
    first binding when it is first indexed. A link that was in the marker at
    the base commit but whose binding record is gone stays "binding unknown".
    The script never fills a lost binding with today's value.
  - The same rules hold for `serves R<n>` (the requirement version) and for
    `from` (the owner's-words snapshot).
- When a bound target changes, the source paragraph gets a hint until it is
  aligned: "your change builds on INV-41, which change X changed on <date>.
  Align it." Running the index again does not remove the hint.
- Request-local IDs resolve by request name, never by path:
  `invoice-exports/R2`, `invoice-exports/SP-12`. A request's name is
  permanent, so its IDs still resolve after a move or an archive.
- Two open changes that both `change` the same spec ID get a hint on both.
  The script sees only declared `changes` links; the near-match hint (section
  3) helps where a link is missing. `al context <ID>` shows the open changes
  that build on or change it.

## 5. Consolidation and the close rule

Why: the owner wants no tool that consolidates (input 95), consolidation
before an epic closes (input 105), and nothing applied dropped in silence
(R5).

**Consolidation:**
1. The agent replaces the paragraph in `specs/` by hand. No command writes the
   spec.
2. It happens when a piece is ready: in the PR with its code, or in a later
   PR, part by part, before the epic closes.
3. Promise and design kinds go into `specs/`. Change-only, note and
   explanatory paragraphs stay with the change as its history.
4. A promise-kind paragraph consolidated before its requirement is signed:
   `not ok`.

**Dispositions.** Each change paragraph with a baseline effect (a promise or
design paragraph that adds, changes or removes spec text) gets a disposition
in the request's record. A disposition closes one named source version, not
an ID forever: it names the source paragraph's version (its text hash) and
the spec version it produced. When the source paragraph is edited, the new
version needs its own disposition; the old one stays as history, and indexing
never advances it.

| Disposition | Means | Valid when |
|---|---|---|
| `incorporated` | the text is in `specs/` | the bound source version is the source's current version, and its text equals the bound spec version (rule below) |
| `removed` | the change removes a spec paragraph | the ID is absent from `specs/` in the closing state; the ID is never used again |
| `superseded` | a later change replaced the incorporated text | the later change has a valid `incorporated` or `removed` disposition whose `changes` binding names this incorporated version; a pending `changes` link alone proves nothing. A chain A→B→C resolves to the closing baseline, a valid removal included |
| `abandoned` | the paragraph is not delivered | it was never applied; or the applied text was reverted; or a decision Dn whose source is the owner keeps its effect, with a signed requirement where a promise kind is kept |

An owner decision to keep an effect is only for the owner's call on the
requirement or the scope. A design paragraph can stay `incorporated` while
another paragraph of the same change is `abandoned`; that needs no owner
decision.

**Equality.** Two texts are equal when they match exactly after only two
steps: line endings are normalized, and the marker framing (the marker line
and its blank line) is removed. Spaces, hard breaks, list, table and code
content all count: two trailing spaces in a code example can change its
output. A difference passes in two cases only, and each names the source
version and the accepted target version:
- a recorded wording decision Dn;
- a typo-fix claim (section 6), shown with its changed words and never as
  proven.

An unexplained revert does not pass: the spec text must equal the bound
version, a valid successor's version, or a decided final text.

**The close rule.** `al conclude` refuses until each change paragraph with a
baseline effect has a valid disposition for its current version, every
promise change is signed, and a spike's current question is signed (section
6). Change-only, note and explanatory paragraphs need no disposition.
- The check runs on the closing PR's state. An archived request is never
  checked again against today's spec.
- The local tree and main stay apart: "consolidated on main" is read from
  main's history, not from the working tree.
- Code or tests that still cite a removed or abandoned ID get a hint.

**Path 1 and adoption.** A paragraph edited directly on path 1 records
`from: <request>/R2`. That proves where the change came from, not that the
spec text equals the requirement. A paragraph that existed before adoption
records `from: adoption` with the captured baseline: the commit and its hash.
It is not an owner approval, and it does not excuse later changes that nobody
asked for.

## 6. Sign-off

Why: "Requirements are still the same need the signoff" (input 100); the
owner signs the organized requirement, never a paragraph (R4). The owner and
the requirement may change while the owner explores (input 122).

- A sign-off is needed when a change touches a promise kind, and for every
  spike's question. A request that touches no promise kind and is not a spike
  closes without one. A design-only change needs no sign-off; the review
  reads it.
- A PR that edits a promise-kind paragraph, in a change spec or in `specs/`,
  with no signed requirement that covers it: `not ok`. It blocks only under
  opt-in `--strict`. A typo-fix claim is the exception (below).
- `al conclude` refuses while a promise change has no sign-off.
- A later change to a signed requirement needs a new sign-off.
- A request with no kept effect may be abandoned without a sign-off. The owner
  never has to sign work that the owner chose not to pursue.

**Typo fixes** (input 128). An AI may claim a typo fix in any paragraph of a
change spec or of `specs/`, promise kinds included, with no request and no
sign-off, on path 0. The script cannot establish that the meaning is
unchanged: "The export includes only paid invoices" becoming "The export
includes all paid invoices" changes one short word, no number and no MUST,
and changes the promise. So:
- The script shows each changed word beside the word it replaces, and the full
  sentence.
- It marks as "meaning-sensitive; review the typo claim" any change to a
  normative word (MUST, SHALL, SHOULD, MAY, REQUIRED), a negation (not, never,
  no), a number, or a quantifier (only, all, every, any, each, none, some, at
  least, at most). "MUST MUST" to "MUST" is marked and is a true typo; "paid"
  to "unpaid" is not marked and changes the meaning. So the mark never forces
  a request or a sign-off by itself, and its absence proves nothing. The
  review decides in both cases.
- The claim is never shown as proven.
- Typo fixes apply to spec and change-spec text only. The owner's words in
  `origin/` are never edited; a corrected reading is a note in the dialog, and
  the snapshot stays.

**The spike:**
- The spike's current organized question needs the owner's sign-off.
- Its conclusion names the question version that it answers.
- Its exploratory change spec (candidate designs and experiments) stays with
  the spike as history. It needs no consolidation and no disposition, and it
  never becomes current design.
- An unsigned spike that the owner drops may be abandoned unsigned.

**The owner's words and the requirement change too** (input 122):
- Before the sign-off, the requirement is a draft. It changes freely, and work
  may start on it; delivery comes with the sign-off or after it.
- New or changed owner's words are a new snapshot, appended. The old snapshot
  stays.
- After the sign-off, a changed requirement is a new version, signed again.
  The first and the latest versions both stay readable.
- Each `from` link binds its snapshot, and each `serves R<n>` link binds the
  requirement version (section 4). When a newer snapshot or version changes
  the linked text, the linking paragraphs get a hint until they are aligned:
  "R2 changed after this paragraph was linked to it. Check that it still
  serves R2."
- A spike's organized question can change the same way.

## 7. Paths for each kind of work

Why: "we need to support a regular wow, in various cases, big or small, clear
or spike" (input 114), with the user free to pick (R7, input 126).

| Path | When | Records | Sign-off | Consolidation | Closes when |
|---|---|---|---|---|---|
| 0. Fix | no promise changes: it restores what the spec says, or claims a typo fix in any paragraph | none; the PR says `Tier: 0 — restores INV-41` or `Tier: 0 — typo in INV-41` | no | none | the PR merges |
| 1. Small promise amend | one or a few promise paragraphs change | a short request; no change spec; the PR edits `specs/` directly | yes | in the same PR | the PR merges |
| 1d. Small design correction | names or wording of design-kind paragraphs only (input 129) | a short request with a one-line source note; no change spec; the PR edits `specs/` directly | no | in the same PR | the PR merges |
| 2. Big change | a real design; one or a few PRs | request, change spec | if a promise kind changes | in the PRs | the close rule holds |
| 3. Epic | big, in parts over time | as 2, with optional task references | as 2 | part by part, before the epic closes | the close rule holds |
| S. Spike | not yet clear what to build | request with an organized question; the change spec holds the candidates and the experiment; findings open with the answer | yes, on the question | none | the answer names the question version |

- A spike may end with no follow-up. A new request is needed only for
  separately authorized work, which says `Follows: <spike>`. An answer may
  also inform work that is already open.
- Work that grows changes its path: a small change that needs a design adds a
  change spec and becomes path 2.
- Every PR states its path and its claim. The script checks the claim against
  the declared kinds and the paragraph hash list: "path 0, but the PR changes
  a `rule` paragraph with no typo claim" is `not ok`. A typo claim with a
  meaning-sensitive mark goes to the review. This checks the labels, not
  their meaning; a code-only change claimed as a fix still needs the review.
- **Small design corrections.** "Small" means, for the reviewer: it changes
  only names or wording of design-kind paragraphs; it adds or removes no
  component, interface, data or flow; and it touches no promise kind. The
  script shows the changed words, and flags a 1d claim that touches a promise
  kind or adds or removes a design paragraph. The review judges the rest.
  Larger design changes stay on path 2.

## 8. Tasks

Why: "I want to be light on the project mgmt side ... we do not enforce one
way" (input 115). The chain must still reach from the requirement to the work
(input 100).

- A task is optional. Where a project uses tasks, a task has an ID and a
  reference: a line in a file of the request, an issue number, a tracker key
  or URL, or a title only.
- The chain holds the reference only. `al` reads no outside tracker and keeps
  no task status. Git shows which PRs name the task and whether they merged.
- Change-only paragraphs belong to their request by default. A plan needs no
  task node.
- One way of working that the tool supports and does not enforce (input 136):
  a `tasks.md` in the request holds the definite list of tasks (T1, T2...);
  issues for the developers each summarize one or more tasks. The chain is
  R → task → issue → PR → outputs; several tasks may share one issue.
- Hints only, and only where the project uses tasks: a PR with no task in an
  epic; an R that no task delivers; a task that delivers no R.
- The context and the outcome never claim that a merged task or a reconciled
  spec proves the work complete. They show the evidence and what is unknown.

## 9. Checks of rules, and results

Why: a rule with no check is a wish, but how to check belongs to the project
(R11). Coverage builds up slowly in real specs: the Rust Reference had test
links for about 5.4% of its rules after two years (its test summary,
2026-10-09), and the Ferrocene spec asks for one test per section. So a hint
on every old rule would only make noise.

- Each `rule` stays visible on its own: `al context` lists its checks, or
  "none". One checked rule never hides an unchecked one.
- The hint fires only on a `rule` that a change adds or changes, when no check
  names it: a test, a review checklist item, or an evaluation. Untouched rules
  get no hint.
- `al context` also shows a summary per section: rules, checks, uncovered
  rules, and a percentage. The summary groups the per-rule list; it does not
  replace it.
- Three facts stay apart: a check exists; a result exists; the result applies
  to the selected material. A result records the commit it ran at and the
  hashes of its declared inputs. The exact fact the tool shows is "declared
  inputs unchanged since C1". That the declared inputs cover everything the
  check depends on is a claim, and is shown as a claim: a test can also read
  an undeclared config file.
- When a declared input changed, the old result is shown with its commit as
  "does not apply to the current text". When inputs are not given or not
  available (for example an output repo that is not present), it shows
  "applicability unknown". The tool never infers that an unlisted changed file
  is unrelated, and builds no dependency graph.
- For a report review, the report's own bytes can be the whole checked
  object. For a code test, a project may declare a wide scope (the tested repo
  trees and declared outside inputs) or a narrower one. A commit that only
  adds or changes the result file never changes the checked object. Unchanged
  inputs never count as a fresh run.
- The hint neither chooses a method nor stops closure.

## 10. Records

Why: the owner wants the records "checked in, so it is easy to rebuild the
rag when needed" (input 123). The AI only fills the schema; the owner and the
architect design it (input 96). AI output varies between runs and models, so
AI fields stay hints: the same prompt at fixed settings gave accuracy that
varied by up to 15% over ten runs (arXiv 2408.04667), and a change of model
moved the main tag on close to half of the notes in one study (arXiv
2606.05970).

- `.assuredloop/schema.yaml`: the schema, with a version. The owner and the
  architect design it. A user's extension gets the same careful review.
- `.assuredloop/records/`, committed to git:
  - one record per request: the chain of that change, its bindings (section
    4) and its dispositions (section 5). Mostly that change's own PRs touch
    it.
  - one record per doc: only fields that the script can regenerate (hash
    list, display numbers, derived change kinds), and the AI hints.
- On a merge conflict in a per-doc record: run the index again to rebuild the
  regenerable fields. Conflicting optional AI hints may be dropped and shown
  as absent; no AI refresh is required. Bindings are never in a per-doc
  record, so a re-run cannot erase them.
- The developer's agent writes the markers and the AI hints in the PR, and the
  review reads them (input 98). The script writes the derived facts.
- **AI hints** (summaries, tags, quotes):
  - Each hint records the paragraph hash it was made from. A hint is stale
    when the paragraph's hash differs, even if its quote still matches: a
    kept sentence does not keep the rest of a summary true.
  - A quote is scoped to its paragraph ID and the paragraph's source version.
    It holds the exact text by default. It adds `prefix` and `suffix` (the W3C
    Web Annotation TextQuoteSelector form) only when the exact text occurs
    more than once in that paragraph. A fuzzy re-anchor stays a hint.
  - The agent refreshes hints only for paragraphs that the PR changed. An
    empty or missing hint is an honest state, not a defect.
- The kinds and the declared links are checked data, in the limited sense of
  section 3. The AI summaries and tags are hints (input 123).
- Checks give hints by default. A project that wants blocks turns on
  `--strict` in its CI, and the README advises it (input 123).
- The core checks stay deterministic: no AI, network or database calls. The
  search command may use a local SQLite index (section 11); no check depends
  on it. `al` may use a pinned YAML library; zero dependencies is the least
  important goal (input 99).

## 11. Search and the export

Why: the owner wants search at a strength the user chooses, where "all cases
must work, it just provides different strength" (input 131). The evidence
for free text of this size: structure beats clever methods; word search is a
strong base; and old text must be filtered out, not ranked down.
- Ranking alone still leaves about half the top-5 hits outdated, even with
  recency weighting (HoH, arXiv 2503.04800). Version-aware retrieval did much
  better on versioned technical documents (VersionRAG, arXiv 2510.08109). So
  search filters by role.
- Graphs built by an LLM did no better than plain retrieval on direct
  questions, missed facts and cost far more to build (GraphRAG-Bench, arXiv
  2506.05690); a deleted document can stay retrievable after an incremental
  update (GraphRAG issue #2590). So the script exports the declared links as
  the graph.
- An agent that greps files does well on small corpora, and word search
  (BM25) overtakes it near 10 million tokens (arXiv 2607.26497).

**The export.** `al export` writes one deterministic JSONL row per paragraph
version, built from the committed docs and records. It is not committed;
anyone rebuilds it. Fields: `repo, doc_or_request, id, version, role, file,
heading_path, kind, serves[], builds_on[], changes[], valid_from,
superseded_by, commit, sha256, text`, and the AI hints (`summary, tags`) in
fields marked as hints. The version key is repo + document or request +
paragraph ID + version. Local RAG tools do not read HTML-comment markers, so
levels above 0 need this export.

**Roles.** "Latest version" does not mean "the current system": a baseline
paragraph, an open proposal for it and a spike candidate can each be their
source's newest version. The script derives one role for each row from the
existing records:
- `baseline`: consolidated spec text at the selected central commit;
- `proposal`: text of an open change spec;
- `spike`: exploratory text of a spike;
- `source`: the owner's words, the requirement and question versions, and
  decisions;
- `evidence`: results and outputs;
- `history`: removed, abandoned and superseded text, and closed changes.

These are retrieval labels, not work states. When a row fits two roles,
`history` wins, and the row keeps its original source type (for example a
closed spike, or a replaced requirement version).

**Queries:**
- The default query is the current system: `baseline` rows at the selected
  central commit.
- A change-context query, for one selected change, adds its live `proposal`
  and `spike` text, its `source` rows and its `evidence` rows, plus the related
  `baseline` text.
- A history query adds `history` rows, never shown as current promises.
- Each hit shows its role and its commit. All roles stay in the level 1
  full-text index, so they can be found by their words even where level 2
  does not embed them.
- IDs resolve exactly, in their own column, never through search.
- A chunk is one paragraph version, the unit that carries the ID, with a fixed
  header (file title, heading path, kind, ID). The parent section is returned
  on request.
- A rebuild compares paragraph hashes with an index manifest (model, chunk
  rule), embeds only new or changed rows, and rebuilds everything when the
  manifest changes. It removes from the current index every row missing from
  the commit's full listing; the history index keeps every version.
- No `llms.txt`: it has no measured benefit.

**The search levels** (input 130):

| Level | Setup | Status |
|---|---|---|
| 0 | No index: `al`'s exact views and the agent's grep. | always there |
| 1 | Local full text: `al export` into a SQLite FTS5 (BM25) index, with the ID in its own exact column. | built in |
| 2 | Local hybrid: level 1 plus a small local embedding model; vectors stored beside the text; word and vector results fused (reciprocal rank fusion); the same roles and queries. | **default** |
| 3 | Mixed: the local index of level 2, with embeddings from a hosted service, preferably on Google Cloud; a hosted shared index may follow. | future |

- One search command answers at the strongest level that is installed, falls
  back 2 → 1 → 0 by itself, and says which level answered. Every level keeps
  exact-ID lookup, the roles, the commit identity and the history scope; only
  the strength changes.
- Level 1 needs no new dependency: Node's built-in `node:sqlite` has FTS5
  (checked on Node 26.11.1 with SQLite 3.53.4). It lives in `al` itself, as
  `al search`, and stays deterministic and offline. The package declares Node
  24 or newer, so level 1 must be tested on Node 24; if Node 24 lacks FTS5,
  the minimum version goes up.
- Level 2 adds an embedding model, so it lives in a separate optional package
  (for example `@assuredloop/search`); `al` itself keeps no AI and no network.
  Candidate models: bge-small-en-v1.5 (MIT) or EmbeddingGemma-300M; a
  multilingual one (Qwen3-Embedding-0.6B) for specs not in English. At this
  size a plain scan of the stored vectors is fast enough, so no vector
  database is needed (an estimate: 20,000 rows of 384 numbers per query).
  The only data that leaves the machine is the model download.
- Level 2 stays optional, because it costs every user a model download and a
  native runtime, and CI needs no search (input 131: "if it is not costing a
  lot, optional is good for user"). The recommended install includes it, so
  level 2 is the default in practice.
- Level 3 is future work. Candidates on Google Cloud: Gemini or Vertex AI
  embeddings for the mixed setup; later a hosted index (for example Vertex AI
  RAG Engine, Vertex AI Vector Search, or pgvector on Cloud SQL or AlloyDB).
  Prices and data terms are not checked yet.
- All levels read the same export and rebuild the same way, so a user moves
  between levels with no change to the records.
- The tool's tests run the search tests at levels 0, 1 and 2: level 2 with a
  small fixed test embedder for exact results, plus one smoke test with a real
  model. Validation compares level 1 with level 2 on the golden questions, so
  the default is checked, not assumed.

**Scale** (input 132): up to 1,000 change specs in one repo, and one search
across up to 20 repos. These are estimates, at about 100 tokens a paragraph:
- History is large and the current text is small. 1,000 archived change specs
  of about 100 paragraphs each are about 10 million tokens a repo; 20 repos
  are about 200 million. The current specs and the open change specs are a
  small part of that.
- So level 2 embeds only `baseline` and `proposal` rows. History goes into
  the level 1 full-text index, and search shows it only in a history query.
  No first full embedding of history is needed.
- At this size level 0 is weak, and level 1 or 2 carries the search.
- `al check` must stay fast at 1,000 requests: it checks what the branch
  changed, and reads archived records only through their stored hashes.

## 12. One central spec repo, and output repos

Why: "many of our solutions are using multi repos" (input 134); "so far
let's assume the spec stay in the central repo" (input 133). Links from output
repos are a must.

- The central repo holds the spec (`specs/`, `specs/adr/`), the requests and
  the records. Its `config.yaml` lists the output repos, each with a name and
  a local path or a URL.
- An output repo holds code, tests and user documents only: no spec and no
  requests. Its config names the central repo, so `al` there can resolve
  central IDs for hints.
- Output links to the central spec with qualified IDs, both ways: code and
  tests in an output repo cite central IDs (`central:INV-41`,
  `central:invoice-exports/R3`), and a central request's task names the output
  repo's PR (`invoicer-web#57`). A binding records the output repo's commit,
  so the evidence stays exact.
- The sign-off stays in the central repo. An output-repo PR that changes a
  promise names the central request that covers it; a fix says
  `Tier: 0 — restores central:INV-41`.
- `al` in the central repo derives the cross-repo links (cites, rough links
  from git, results) from local clones of the output repos at known commits. A
  repo that is not present gives "unknown", never a guess.
- The index tags each row with its repo and commit. A result that combines
  repos shows the selected central and output commits. A pinned output commit
  proves that snapshot only, not that the repo has no newer work.
- Later, not now (input 133): implementation specs in output repos that
  refine the central spec. The qualified-ID form leaves room for a `refines`
  link.

## 13. Commands

| Command | v4 |
|---|---|
| `al new` | stays: snapshots the owner's words |
| `al record origin`, `signoff`, `decision` | stay |
| `al record section`, `al consolidate` | go |
| `al spec` | lists IDs, display numbers and kinds; `--add-ids` marks every paragraph |
| `al context` | a change's dispositions (for example "120 paragraphs, 40 with a baseline effect: 30 incorporated, 6 pending, 2 removed, 2 abandoned"), coverage per section, the hints, the open changes on an ID, and what is not checked |
| `al context --diff ... --for review` | the review view: each changed paragraph's text beside its kind, its requirement and the baseline paragraphs it touches |
| `al check` | the checks in sections 3-9 |
| `al conclude` | the close rule; writes the outcome |
| `al index` | writes derived facts and new bindings; `--align <ID>` advances a binding on purpose; lists the hints that the agent must refresh |
| `al export` | the export: one JSONL row per paragraph version, with its role, version, commit and edges; not committed |
| `al search` | search at levels 0-2, with the current-system, change-context and history queries |

## 14. Migration and adoption

Why: "no need to take care of nbackward copatibility" (input 98).

- v4 is a breaking release. It does not read 0.1.0 records.
- History: `--at` works on commits made under v4. Older records stay readable
  as files, and the pinned 0.1.0 runs at those commits (input 123).
- Adopters pin 0.1.0, so nothing breaks until they move. An adopter with an
  open 0.1.0 request finishes it on its pinned copy, or restarts it under v4.
- Adding markers changes a file's bytes. A spec whose signed requirement
  binds its whole text by SHA-256 needs a new approval after conversion.
  Validation uses a scratch copy, never an adopter's live record.
- Adoption: `al spec --add-ids` marks every paragraph, and the baseline is
  captured as `from: adoption` with its commit and hash (section 5).

## 15. Validation, before the build

Why: "if things are not useful, it is a total waste" (input 111), and the
owner chose to validate before building (inputs 117-118). Validation keeps
only the rules that earn their cost.

Three ways, in this order (input 135):
1. **A simulation with planted defects**, on a tiny central repo with three
   output repos and one non-code project. Agents play the owner, the
   developer and the reviewer through the cases below.
2. **A replay of real OpenSpec changes.** OpenSpec (Fission-AI/OpenSpec)
   keeps its own spec in its repo: 36 entries in `openspec/specs/` and 85
   archived changes (checked 2026-10-09). Replay 5-10 real changes into the
   model.
3. **A private adopter on a scratch copy**: convert its open request by hand,
   with no change to the adopter's repo, and run the fresh-reader test.

Cases:
- the paths: a fix with a typo, a small amend, a small design correction, a
  big change, an epic with early consolidation and A→B→C supersession, a
  spike, two changes on one paragraph, a non-code project, and adoption;
- the close rule: remove a paragraph; supersede an early consolidated part;
  abandon an applied part; record a wording change; reject an unexplained
  revert; repeat after a squash merge; a source edited from 30 to 45 minutes
  after early incorporation needs its own disposition;
- planted defects, each with a clean control of the same shape: an unsigned
  promise change; a new rule labelled `data`; a code-only promise change
  claimed as a fix; two replacements of one ID with missing `changes` links;
  a test that cites the right ID and checks another condition; a drifted
  consolidation; a stale base after indexing; a stale AI summary with a
  surviving quote; a wrong path claim; typo claims that change a MUST, that
  change "only" to "all", and that remove a doubled "MUST MUST"; a 1d claim
  that adds a component; a code example whose trailing spaces change;
- search: a 30-minute baseline, a 45-minute open proposal and a 10-minute
  spike candidate (the default query returns only the baseline); then remove
  the baseline and abandon the proposal (the default query omits both, the
  history query finds both); the same with identical local IDs in two requests
  and two output repos; every role through the change-context query at levels
  0, 1 and 2; real fallback; exact IDs;
- results: a report whose review passed at C1; C2 adds only the result file
  (the result still applies); C3 changes the report (the old result does not
  apply); a test whose undeclared config file changes (the tool shows
  "declared inputs unchanged", never "applies"); an output repo that is
  absent ("applicability unknown");
- cross-repo: one central repo and three output repos, with every link kind
  (cites, implements, verifies, documents, PR references, results), an absent
  clone and an unavailable commit;
- scale: 1,000 generated requests and 20 repos; the time of `al check`, a full
  and an incremental index, removal from the current index, and kept history;
- level 1 on the minimum Node version;
- markers: whether agents keep them when they rewrite text, measured apart
  from the lint that detects a lost ID; formatting-only differences under
  exact equality, measured in the OpenSpec replay before any more
  normalization is added;
- the fresh-reader test on the private adopter: a fresh reader must recover
  three separate facts (a PR merged, a proof not run, a part still open) and
  name the evidence that is not available.

Arms, for each way: today's records; a lighter arm with the same texts and
paragraph IDs and fewer declarations; the full model.

Measures:
- usefulness: 20-30 real review questions, some held out from the record
  writers; the right answer, the right originals in the top 5, useful defects
  missed, false alarms, and reviewer time; retrieval measured by recall of the
  expected paragraph IDs, with no LLM judge;
- cost: tokens and time on record creation, record reading, corrections,
  indexing and repeated review, across every agent, against the tokens and
  time of the work itself. Small changes, epics, and owner questions and
  sign-offs are reported apart. The starting target is 20% (input 31), as a
  guide, not a hard limit (input 123);
- catch rate: planted defects found, against false alarms on the controls.

A rule stays only where it helped a reviewer answer a question or catch a
real defect, at an acceptable cost. A rule that only catches its own missing
declaration does not count. If a need in the signed requirement must change,
the owner signs again.

## 16. Open points

1. Which OpenSpec changes to replay (chosen in task T4).
