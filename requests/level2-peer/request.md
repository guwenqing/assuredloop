# Level 2 search with no package of ours
Tier: 2 · Status: open

## Owner's words and dialog

- 2026-10-11 the owner's words, snapshot origin/2026-10-11-owner-words.md:
  owner chat with the architect, 2026-10-11 (inputs 162-164), transcribed
  by the architect.
- The dialog in brief: after 0.2.0, the owner asked why level 2 search is a
  second package of ours, when its runtime is not our code and npm installs
  the dependencies itself. Issue #212 first asked for a download of the
  runtime at first use. The architect changed it before the build to npm's
  optional peer dependency, so no download code is needed.

## Organized requirement

<!-- R1 from:2026-10-11-owner-words.md -->

### R1 Level 2 search with no package of ours
Level 2 search MUST need no second package of ours. `al` MUST name the embedding model's library as an optional dependency, which npm does not install by default; the user installs it beside `al` to get level 2. Without it, `al search` MUST answer at level 1 and say how to add level 2.

Out: a download of the runtime by `al` itself, and a cache of our own.

Assumed:
- The library is `@huggingface/transformers` at exactly 4.3.1, the version
  that 0.2.0 pinned. It stays pinned, and no release newer than 24 hours is
  used (DES-77).
Signed off: 2026-10-11 owner, origin/2026-10-11-signoff.md

## Decisions

- D1, 2026-10-11. Source: the agent (architect), issue #212 as changed on 2026-10-11. This replaces the level 2 package part of assuredloop-v4 D11; the rest of D11 holds. Level 2 is code in al, src/v4/level2.js. @assuredloop/cli names @huggingface/transformers at exactly 4.3.1 in peerDependencies, marked optional in peerDependenciesMeta, and al search finds it by normal Node resolution (the project first, then beside al). packages/search/ and @assuredloop/search are removed and never published. The version is 0.2.1. The level 2 tests use a stand-in library with a fixed test embedder and run in CI; the real-model smoke test runs locally only when the library is installed, and skips in CI.
- D2, 2026-10-11. Source: the agent (architect), message to developer-212, 2026-10-11. The level 2 install and packaging text moves out of DES-65, a rule paragraph, into DES-80, a component paragraph that serves assuredloop-v4/R10 and level2-peer/R1. DES-65 keeps what search offers: the levels, the default and the fallback. So a later change to how level 2 is installed is design only and needs no sign-off. The other bullets of DES-65 stay as they are; issue #214 reviews the kinds across the spec.
