# A small promise change can be one line
Tier: 1 · Status: open

## Owner's words and dialog

- 2026-10-02 the owner's words, snapshot origin/2026-10-02-owner-words.md

## Organized requirement

### R1 A small promise change can be one line
For a tier-1 request, the organized requirement MAY be a single line: the
requirement in MUST/SHOULD/MAY words, followed by `Amends: [ID]`. `Out:` and
`Assumed:` MAY be left out when there is nothing to say, but `Assumed:` MUST
be written whenever the AI added something the owner did not say.

Amends: [REC-4]

Out: tiers 2, 3 and S keep the full form. Points a (batch small amendments
into one sign-off) and b (plain words) are guidance in the skill, not
promises.

Assumed:
- The tool reads a one-line `R1: …` the same as an `### R1` heading, so the
  Outcome still gives the requirement's fate.
