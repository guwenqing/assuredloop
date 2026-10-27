# A new version of a signed requirement for the light design
Tier: 1 · Status: open

## Owner's words and dialog

- 2026-10-27 the owner's words, snapshot origin/2026-10-27-owner-words.md

## Organized requirement

<!-- R10 from:2026-10-27-owner-words.md replaces:assuredloop-v4/R10 -->

### R10 Search from the user's own knowledge base, a local one, or none
The tool MUST offer search over the spec, the changes and the outputs. The tool MUST let the user choose its source: the user's own knowledge base, a local one that the tool offers, or none. With none, the agent reads the files. Setup MUST ask first whether the user has a knowledge base. When the user has one, setup MUST use it. When the user has none, setup MUST offer a local knowledge base or no search. The tool MUST recommend a choice from the user's computer and the measured results. The recommendation MUST state the limits of those results. The local one MUST work with full text alone. It MUST also find each file of the spec repo and the output repos. A model that strengthens it MUST be optional. When the tool offers a model, it MUST support each model and runtime measured for that offer, and the user MUST choose which one to use. The tool MUST show a model's download size before it fetches the model. Every choice MUST work; a choice changes only the strength. Search MUST show the current system by default, and proposals, the owner's words, evidence and history only when asked, each hit marked with its role. The records MUST be committed, so that any index can be rebuilt from them. A hosted level, preferably on Google Cloud, is later work.
Signed off: 2026-10-27 owner, origin/2026-10-27-signoff.md

## Decisions

- D1, 2026-10-27. Source: the agent (architect). The llama.cpp runtime is installed by the user, as a peer: al finds llama-server on PATH and never downloads it, so level2-peer/R1 holds as signed. llama-server fetches the GGUF file of a row from its pinned commit into its own place. al checks the file's size on every run and its SHA-256 once, with a record of its checks in its index folder; another build than b11624 still runs, with a note.
- D2, 2026-10-27. Source: the agent (architect). The recommendation keeps only the rows whose measured time for one search is at most 10 s, the same bound as al check at 1,000 requests, before it takes the smallest download within 0.05 of the best recall. The time of a reranker recurs at each search. When the bound removes the row that would be recommended, the recommendation names it, with its gain and its time.
