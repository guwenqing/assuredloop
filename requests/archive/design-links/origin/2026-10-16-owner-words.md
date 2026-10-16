Source: standard input
Fetched: 2026-10-16T18:44Z
SHA-256: 85230704e16272e914de9a8c437992691986f5514e4acf95a9bc2f0da3e3f8c9
---
The owner's issue #229 on GitHub (https://github.com/guwenqing/assuredloop/issues/229), its title and body as the owner filed them, kept exactly:

# Adoption findings on 0.2.2: change-spec layout, design-to-promise links, task tracking

Adoption findings from a private adopter on 0.2.2: two large path-2 change specs (about 120 and 490 paragraphs).

## 1. The skill leads to a change spec that is a concatenation

Path 2, step 2 of the skill says the change spec holds "the promises this change adds or changes, its design, its plan". Both our change specs follow that order literally: all promise paragraphs in one block, then all design, then the plan. A human reader meets each rule hundreds of lines away from the design that keeps it.

The marker graph already holds a better order: a promise paragraph, then the design paragraphs that `builds-on` it, with the `rationale` that `explains` them and the `example` that `illustrates` them. Suggestion: the skill and README say the order of paragraphs is free, and recommend one section per topic: the promise first, then the design that keeps it, then its open points. Cross-cutting design and decisions follow. The plan stays with the change or goes to the tracker (see 3).

## 2. Nothing shows a design paragraph that keeps no promise paragraph

A design paragraph needs only one link, and `serves:R<n>` meets that. So a design paragraph can serve a requirement with no `builds-on` link to the promise paragraph it keeps. In our specs, 18 of 27 and 33 of 150 design or approach paragraphs link to a promise paragraph; the rest only serve an R<n>. So the records cannot say which design keeps which promise, and the layout in 1 cannot be derived from them.

Suggestion: a hint for a design or approach paragraph in a change spec that serves R<n>, where R<n> has promise paragraphs in the same change spec, but that has no `builds-on` or `changes` link to one of them. Also, if it does not already, `al context <promise ID>` could list the paragraphs that build on it.

## 3. Task tracking: `for:` is not checked, and the plan has no home outside the change spec

- `checks.js` skips `for:` ("tasks are optional"). A `for:T9` that names no task in the record's `tasks:` gives no hint.
- We want the plan and task detail in the issue tracker, one issue per task, with the record's `tasks: [{id, ref, delivers}]` as the list. The skill names `ref: "issue #34"` but does not say whether plan, step and migration paragraphs should then stay in the change spec. Removing a plan paragraph from an open request's change spec gives no `not ok`, which suggests it is allowed.

Suggestions:
- a hint when `for:<task>` names no task in the record;
- one line in path 2 and 3: plan, step and migration paragraphs may live in the tracker issue named by the task's `ref` instead of in the change spec.

## 4. Small: hand-numbered headings

`al` computes display numbers from headings, so a heading like `## 7. The proxy` carries a second number that goes stale when sections move. A note in the README that headings need no numbers would help.

