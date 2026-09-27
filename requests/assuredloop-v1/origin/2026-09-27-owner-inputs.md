Source: mybots repo, bots/assuredloop/research/owner-inputs.md @ 169eb0daad82c69f65c77d4a4f837d8e149a0e1d
Fetched: 2026-09-27T15:27Z
Target updated: 2026-09-27T11:25:31-04:00
SHA-256: 4afe3cc87b1979119d4cdf1331434cfaff67983d8d01f2ffce3e072bd31c87f4   (of the text below)
---
# Owner inputs for the AssuredLoop redo

What the owner said, in order, 2026-09-26. Quoted where the wording matters;
the rest is a close paraphrase. My readings are marked as mine.

1. Study all the popular spec-driven repos first, then discuss our idea,
   including the owner's own attempts. Ask when in doubt.
2. "How to develop" questions ship as part of orca-bot-kit skills (distilled
   from many such repos). AssuredLoop does not enforce a strict or large way of
   working and does not bind to a heavy project-management loop.
3. Some mechanical validation is fine, "if that does not make ai focusing too
   much on formality".
4. "The key idea is to bring AI back to the context about the change, the
   origin of change, the design."
5. After using many SDD toolkits: "they only care about the one change, and
   left thousands one time change spec".
6. "I need a way to force a change will be merged into the main, when the
   whole request is done." (My reading, given 5 and 7: the change's spec delta
   is folded into the main/current spec when the whole request concludes. Not
   yet confirmed that "main" means the main spec rather than the main branch.)
7. "When the request is large, it is possible to work on partial changes and
   then conclude in the end."
8. Research all other spec-related things and similar ideas first, then talk.
9. Research the legacy repo too: "there are stuff left" worth keeping.
10. Some way of working is unavoidable, "but as little as possible". Support a
    flexible way of receiving the change request; things need to be flexible.
11. Ambition lowered from a mechanical harness to hints: "provide the hint as
    part of mechanical script and the output of script".
12. "The script has progressive disclosure and the outcome summary has full."
13. It may serve more than coding projects.
14. Do not forget github/spec-kit.
15. Search GitHub generically for matching repos too.
16. Why (2026-09-27): "ai confuses after a while, and even the design of the
    prd confuses without knowing where we were. then things got rotted very
    quickly. with test driven it is better but the test and even larger test
    is also written by ai."
17. Cases to support: a small change that needs no spec; a small change to an
    ongoing spec or to a closed one; a large request; several large requests
    at the same time.
18. "We also want to use this methodology to chain the code change and test
    effort together."
19. "No aim to find exact. It is mainly a hint, so a rough link is more
    important than the strict list, which miss things."
20. A current consolidated spec is a requirement: "we have had 30 specs, then
    it is impossible for ai to know what is the right design, and you need to
    know the right design right now." (Settles the adversary's "does a separate
    spec beat the small baseline" question: the consolidated spec stays.)
21. "You need to give me more context for what you mean." (My proposals were
    too terse; explain with a worked example.)
22. Answers to my six questions (2026-09-27):
    1. Fine that the current spec on main stays old until the whole change
       (epic) is done, as with an open OpenSpec change, "as the ongoing spec
       itself can change". How to change an archived/finished spec is open;
       "when it is small, maybe we also need a new spec". The change and the
       spec merge can be together or separate. Foundation line: "if you want
       to close a spec, then the change must be consolidated into the current
       spec."
    2. Answered by 1.
    3. The request keeps the original words; the words can be a GitHub link.
       Also list the digest the AI read of the requirement, which the user
       needs to read themselves to confirm. "All original log should be kept
       so it can be audited." (My reading: "digest" = the AI's summary of its
       understanding, for the owner to confirm; everything original is kept
       append-only.)
    4. The agent decides what is small: right.
    5. Read test results, do not run tests: correct.
    6. Rough links "depend on the file size; if the file has a lot of content
       from different requests, I also need id inside the file."
23. Big requests have two parts: the change itself (the change of spec, a
    one-time spec) and the consolidated update to the baseline spec. The change
    spec can be on main, or come with its own change. The consolidation does not
    have to: it can come in a later PR, at the latest when the change is
    declared concluded. The conclusion (which requires some changes to the
    change spec) and the consolidated piece of the spec can be pushed together.
    Epic happy path: the change spec is finalized and merged to main while
    consolidation is still pending; developers work on the change set citing the
    change spec and the baseline; when the epic concludes, one dedicated change
    merges the spec and archives the change.
24. "I allow the partial consolidation of the spec as long as they do not
    deviate."
25. "If anything else starts in the middle of this spec, they have to align
    both this change and the base, or if it is wrong it has to change."
26. "So I never mean to keep something in a normal git branch." (Rejects v1's
    pending spec branches; change specs live on main.)
27. "The way I am explaining is the OpenSpec way I believe." And: small changes
    may modify the baseline spec without raising a change of spec (unlike
    OpenSpec). If that is a problem, a small change spec is fine too, and the
    consolidation, the code change and everything can be done in one PR.
    (Open: build on OpenSpec's files and CLI, or its way with our own light
    format. I recommended the latter; v2 assumes it, marked open.)
28. "I need you to read through all the good examples and with my flavors and
    propose a complete one."
29. "I need a formal wow that can be traced, but I also want a flexibility, for
    example a bug fix that requires a small amend to the current spec as well."
30. Test the proposal against different cases, small and big, different types
    of work: spike, story, epic, bug; things that come after the conclusion of
    an old change; another big one in the middle of something; etc.
31. "The formality costs to the AI should not be more than 20% compared to the
    real change." A rough feeling, not data. "I don't want to create a
    formality monster."
32. Fine to use the right terms, as RFCs do (MUST, SHALL, etc.), to make the
    request clear.
33. Likes including the source of the original requirement, but "I need the
    consolidated organized requirement to be included as well, and that
    requires a user sign off."
34. Allow a quick sign-off after an amendment of the original, but any later
    change also requires sign-off. The thinking is to be done by a skill. Keep
    both the original change requirement and the consolidated final one.
    (My reading: every sign-off stores the exact text signed, so the first and
    the final requirement are both kept; a re-sign-off shows only what changed
    since the last one, so it is quick; a skill prepares the sign-off and does
    the judgment work, the script only records and checks.)
35. Decisions (2026-09-27): 1, the light was/now format: "ok". 2, where to
    build: "new repo". (Decisions 3-5, tier-1 sign-off timing, spike sign-off,
    and an R-line in no section at conclusion, not answered yet; defaults
    stand. The repo's name and visibility are to be asked before it is
    created.)
36. Decision 3: "let's make the req sign off (not spec) as a blocking state."
    (My reading: the owner signs the requirement only, the R-lines and Out
    line, not the spec text. Until it is signed, the request is blocked:
    consolidate and conclude refuse, context shows it, and check --strict
    fails a branch serving it. Tier-1 PRs therefore wait for the sign-off; no
    batch sign-off after merge.)
37. Decisions 4 and 5: "ok". Spikes need no sign-off. An R-line in no spec
    section at conclusion is a not-ok hint in the Outcome, not a refusal.
38. Decision 2 changed (2026-09-27): "You can clear the current assured loop
    repo, just keep a local copy of old and keep the current main to a legacy
    branch." (The redo lives in guwenqing/assuredloop itself, not a new repo.)
39. "Don't forget writing ADR is part of the game." (My reading: both (a)
    AssuredLoop's way of working includes ADRs for decisions that outlast a
    change, linked with the spec and requests; and (b) this design's own
    decisions are written as ADRs, proposed now and accepted with the
    design.)
40. R1 P14 (a hotfix that changes a promise): "yes". It waits for the
    requirement sign-off; if it cannot wait, it lands first as tier 0
    (restoring the old behaviour) and a signed tier-1 amend follows.
    On agreement: "you will have to explain to me the whole idea and serial
    one by one" (on a phone). So: explain the design in short parts, one at a
    time.
41. Walkthrough, part 2 (2026-09-27):
    - Links: "always keep a snapshot and sha256 of the target so if changes
      can be validated and the last updated time if applicable."
    - "The organized requirement is not line by line... not line by line
      translation rather one section of owner requirement and dialog with ai
      record and another section organized requirement. Both can be one or
      more requirement. You can put different file for different requirements
      or suggest any other format." (Proposed: request.md with two sections,
      "Owner's words and dialog" (append-only) and "Organized requirement"
      (R1, R2… sub-sections, Out, Assumed), signed off as a whole; separate
      requests when requirements must be signed or finished separately.)
42. "Spike: also sign off what the user wants in a similar way. But can be
    less formal to control the trace from requirement and the work done."
    (Changes decision 4: a spike's question is signed off too, in plain
    words; blocked the same way until signed.)
43. Part 3 "looks good", but: "put a requirement that the ai validator needs to
    validate the claim so that we avoid everything to be sneak in as a bug
    fix." (Proposed: every PR states its size and claim in one line; the AI
    reviewer must validate the claim against the evidence the tool shows; the
    tool flags the mechanical contradictions, e.g. a tier-0 claim with a spec
    edit, as not ok.)
44. Part 7: "I see my word to requirements done in a section that is done
    before any spec work so later the signed off requirements can be trusted.
    Of course if things are small enough it can be done all together. The two
    cases are different in the return but when asked the tool can always
    return all the details wanted for an audit to happen or something is wrong
    later discovered." (Proposed: sizes 2, 3 and S sign off the requirement
    before any spec work, and `record section` refuses while blocked, with a
    hint if spec work lands before the sign-off. Size 1 may do it all in one
    PR. And an audit view, `context <request|section|path:line> --audit`, that
    returns the whole trace, including archived requests and hash checks.)
45. Audit: "allow the script works against a past sha to find out history."
    (Proposed: every read command takes `--at <commit>`: it evaluates the spec,
    the requests, the states and the links as they were at that commit.)
46. After the walkthrough (parts 1-8, with inputs 40-45): "Looks good so far."
    (Read as agreement with the design, open to further changes; no build
    starts until the owner says go.)
47. "Can you try to follow the same method for this development as well? Even
    though no tool yet." (Plan: build AssuredLoop v1 as a tier-3 request in
    guwenqing/assuredloop, by hand. The owner's words and dialog are
    snapshotted with sha256; the organized requirement is signed off by the
    owner before any spec work; then the change spec, ADRs and parts. Keep only
    the records, simulate nothing, and log friction as budget data. Attempt 2's
    lesson: "pretend we have" ceremony.)
48. "And to remind again: the wow is part of the bots, not the assured loop
    enforce, like test driven. But the way of writing pre you can absorb."
    (My reading: the way of working, meaning tests-first, review and the PR
    flow, belongs to the bots and the kit's rules and skills; AssuredLoop does
    not enforce it. AssuredLoop absorbs the way of writing the requirement
    (PRD), the spec, the change spec and the record links, in its skill and
    its own commands. "pre" read as PRD/requirement writing.)
