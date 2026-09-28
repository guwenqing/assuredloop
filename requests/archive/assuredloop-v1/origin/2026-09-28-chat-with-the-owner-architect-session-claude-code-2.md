Source: chat with the owner, architect session (Claude Code), question on C11
Fetched: 2026-09-28T14:59Z
SHA-256: ed863d5c4b176ebc6ebe72451eb7e1a3f915bdb692992e5222e231c3f693a802
---
Question (architect, 2026-09-28): C11 measured formality on the 22 real build PRs, against your "about 20%" (you called it "a rough idea… just a feeling"). Whole request: 18-19% if the design and ADRs count as design work (the spec's reading), 34% if every record counts as formality. Tier 0's typical PR: 29%, mostly the architect and reviewer reading the raw 253-line change.md by hand during a spec question. `al context` now prints that in 12 lines. The big confound: the tool didn't exist yet, so records were read whole by hand. The requirement's MUSTs hold; only the SHOULD "about a fifth" is mixed. How should we treat it at conclusion?

Options offered:
- Conclude, re-measure later (Recommended): Conclude with all numbers and the confound written in the Outcome Notes, and TL-4 as it is. Re-measure C11 on the first real project that uses the tool, when records are read through al, not by hand. If it's still over then, that's a new request.
- Hold, cut formality first: Don't conclude yet. I look for what to cut (records, steps, output) and propose changes before part 10 merges. Slower, and the cuts would be guesses, because this build's numbers are distorted by the hand reads.
- Change the target: Revise TL-4's "about a fifth" or how it's counted (for example, not counting record reads, which gives 4%). That changes how the result is measured to get a pass, so I don't recommend it.

Owner's answer: "Conclude, re-measure later (Recommended)"
