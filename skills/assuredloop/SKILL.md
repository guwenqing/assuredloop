---
name: assuredloop
description: >-
  Keeping the records of a change with AssuredLoop's `al` (v4): the owner's
  words, the signed requirement, the change spec, the hidden paragraph
  markers in the spec, the decisions and the dispositions. Use in a project
  whose AGENTS.md names AssuredLoop, before work that changes the spec, and
  whenever you need to know where a request stands.
---
# AssuredLoop v4

`al` keeps the records of what was asked, decided, changed and delivered,
and gives hints. It refuses only in `al conclude`. How and when you design,
test and review is your project's way of working; this skill does not set it.

## Start here, on every path

1. Run `al context`. For each spec paragraph that your work touches, run
   `al context <ID>`. For an open request, run `al context <name>`. Each one
   shows the requirement, the open changes, the ADRs and the checks of what
   it names. Read those paragraphs and records, not the whole spec.
2. To find a paragraph by its words, run `al search <words>`. Add
   `--change <name>` for one request's open text, and `--history` for removed
   and replaced text. In a central repo, a hit from an output repo shows
   `<repo>:<path>` and the lines that name a central ID.
3. Choose the path from the table. Then read "Markers" and the section of
   your path only.

| Path | When | Records | Owner's sign-off |
|---|---|---|---|
| 0 | No promise changes: a fix that restores what the spec says, or a typo in any paragraph. | none | no |
| 1 | One or a few promise paragraphs change. | a short request; no change spec | yes |
| 1d | Only names or wording of design paragraphs change. | a short request; no change spec | no |
| 2 | A real design, in one or a few PRs. | a request and a change spec | if a promise changes |
| 3 | A big change, delivered in parts over time. | as path 2, part by part | as path 2 |
| S | It is not clear yet what to build. | a request with a question | yes, on the question |

The promise kinds are purpose, scope, rule, limit and definition. Work that
grows changes its path: a small change that needs a design becomes path 2.

4. Before you ask for review, run `al index`, then `al check`. Fix each
   `not ok`, or say in the PR why it stays. A hint is an observation, not a
   verdict.
5. Put the claim in a commit message and in the PR, for example
   `Tier: 1 — amends INV-10`. `al check` reads the newest `Tier:` line of the
   branch.

## Markers

Each paragraph in `specs/` and in a `requests/<name>/spec.md` has a hidden
marker on its own line before it, with a blank line before and after it:

```markdown
<!-- INV-41 rule serves:invoice-exports/R2 builds-on:INV-12 -->

The export link MUST expire 30 minutes after the email is sent.
```

- When you edit a marked paragraph, keep its marker line and the blank lines
  around it. Keep the ID when you move the paragraph. Never renumber or
  delete an ID: a lost ID is `not ok`.
- For a new paragraph, write the text with no marker. Then run
  `al spec --add-ids <file> --yes`: it gives each unmarked paragraph the next
  free ID. Then write the kind and the links into each new marker.
- The kinds: promise (purpose, scope, rule, limit, definition); design
  (component, interface, data, flow, choice); approach (how one change is
  built; it stays with the change); informative (rationale, example, open);
  note (headings and connecting text); change-only (plan, step, migration).
- The links: `serves:R<n>` in a change spec, `serves:<request>/R<n>` in
  `specs/`; `builds-on:<ID>`, `changes:<ID>`, `removes:<ID>`;
  `explains:<ID>`, `illustrates:<ID>`, `resolved-by:<ID>`,
  `governed-by:<ADR>`; `for:<task>`. A promise, design or approach paragraph
  needs at least one link. In `specs/`, the ID of a change spec paragraph
  names its request: `invoice-exports/SP-12`.
- `al` writes every hash and every derived field. Do not write them by hand.

## Path 0: a fix

1. Change the code, or the spec text that has the error.
2. Write no request. Claim one of:
   - `Tier: 0 — restores INV-41` when the work makes the code do what the
     spec says;
   - `Tier: 0 — typo in INV-3` when you fix a typo in a spec paragraph. Name
     each paragraph: `Tier: 0 — typo in INV-3, EXP-4`.
3. `al check` shows each changed word. It marks a change to a normative
   word, a negation, a number or a quantifier as "meaning-sensitive". The
   review decides whether the meaning stays the same.

## Path 1: a small promise change

1. `al new <name> --tier 1 --from -`, with the owner's words on standard
   input. The name is permanent.
2. In `requests/<name>/request.md`, add the organized requirement, in plain
   words that the owner reads:

   ```markdown
   ## Organized requirement

   <!-- R1 from:<the snapshot file in origin/> -->

   ### R1 <a short title>
   <one requirement, with MUST, SHOULD or MAY>
   ```

3. Run `al index`. Show the requirement to the owner with
   `al record <name> signoff --source <where> --words "<their words>"`. Only
   on the owner's own yes, run the same command with `--yes`. Do not sign for
   the owner.
4. Edit the promise paragraphs in `specs/` directly. Each changed or new
   promise paragraph says `serves:<name>/R<n>` in its marker.
5. Run `al index`, then `al check`. Claim `Tier: 1 — amends <ID>`. When the
   PR is ready to merge, run `al conclude <name> --yes`: it writes the
   Outcome and moves the request to `requests/archive/<name>/`.

## Path 1d: a small design correction

1. `al new <name> --tier 1d --from -`, with a one-line note of where the
   correction comes from.
2. Change only names or wording of design paragraphs in `specs/`. Add or
   remove no paragraph. Do not change an accepted ADR's text: a new ADR
   supersedes it.
3. Claim `Tier: 1d — <what changes>`. `al check` gives `not ok` when the PR
   touches a promise paragraph, or adds or removes a design paragraph. No
   sign-off is needed.
4. Run `al conclude <name> --yes` with the PR.

## Path 2: a big change

1. `al new <name> --tier 2 --from -`. Write the organized requirement as in
   path 1, with `Out:` and `Assumed:` lines where they help. Draft freely;
   deliver with the owner's sign-off or after it. A change that touches no
   promise kind needs no sign-off.
2. Write the design in `requests/<name>/spec.md`, the change spec: the
   promises this change adds or changes, its design, its plan. Run
   `al spec --add-ids requests/<name>/spec.md --yes` for the IDs (SP-1,
   SP-2…), then write the kinds and links. A paragraph that relies on a spec
   paragraph says `builds-on:<ID>`. One that replaces it says `changes:<ID>`.
   One that removes it says `removes:<ID>`. Never copy the old text.
3. Snapshot each later word of the owner that you rely on:
   `al record <name> origin --url <where> --from - --yes`. Record each later
   decision: `al record <name> decision --source <who> --text "<it>" --yes`.
4. Consolidate by hand, in the PR with the code or later: copy each paragraph
   of a kind that goes into `specs/` (promise, the lasting design kinds,
   rationale, example, open) into `specs/`, word for word. Give it a spec ID
   (`al spec --add-ids`), its kind, and its links. In `specs/`, a link names
   the request: `serves:<name>/R<n>`. Plan, step, migration, approach and note
   paragraphs stay with the change.
5. For each change paragraph that goes into `specs/`, and each `removes:`,
   add a disposition to `.assuredloop/records/requests/<name>.yaml`, then run
   `al index` to fill its hashes:

   ```yaml
   dispositions:
     - {source: <name>/SP-4, disposition: incorporated, spec: EXP-9}
     - {source: <name>/SP-6, disposition: removed, spec: INV-4}
     - {source: <name>/SP-7, disposition: abandoned, decision: D2}
   ```

   - `incorporated`: the spec text equals the change paragraph exactly. If
     you word it differently, record a decision and add
     `wording: {source: <name>/SP-n, spec: <ID>}` to that decision in the
     record; the disposition then names `decision: Dn`.
   - `removed`: the paragraph declares `removes:<ID>`, and the ID is gone
     from `specs/`. Removing a promise needs a signed requirement.
   - `superseded`: `by: <later request>/SP-n`, when a later change replaced
     the incorporated text.
   - `abandoned`: the paragraph is not delivered. Name the owner's decision
     when an applied effect is kept.
6. When `al check` says a paragraph you build on changed, check your change
   against the new text, then run `al index --align <name>/SP-n`.
7. Close with `al conclude <name> --yes`. It refuses while a promise change
   is not signed, or a paragraph with a baseline effect has no valid
   disposition for its current version. `al context <name>` lists them.

## Path 3: an epic

As path 2, in parts. Each part consolidates the paragraphs it delivers,
with their dispositions, in its own PR. Tasks are optional: where the
project uses them, list them in the record as
`tasks: [{id: T2, ref: "issue #34", delivers: [R3]}]`, and name the task in
the commit messages of its PRs. Run `al conclude <name> --yes` with the last
part.

## Path S: a spike

1. `al new <name> --tier S --from -`. In `request.md`, write
   `## Organized question` with `<!-- Q1 -->` and `### Q1 <title>`.
2. The owner signs the question, as in path 1, step 3.
3. The change spec holds the candidates and the experiments. It is never
   consolidated and needs no dispositions.
4. Write the findings in the request folder. Open them with the answer, and
   name the question version that it answers, for example "Answer to Q1
   version 1: …". Change no spec text.
5. Run `al conclude <name> --yes`. A spike may end with no follow-up. An
   answer may also inform work that is already open. Only separately
   authorized work needs a new request; say in its `request.md` that it
   follows the spike: `Follows: <name>`.

## The views

- `al context --diff main...HEAD --for review`: each changed paragraph
  beside its kind, its requirement and the baseline it touches.
- `al context <name> --audit`: the whole trace of a request. Add
  `--at <commit>` to any view for a past state.
- `al spec`: every doc's IDs, display numbers and kinds.
- Each output ends with `Read`, `Next` and `Not known`. Take `Not known` as
  it is: the tool does not know it, and you do not either.
