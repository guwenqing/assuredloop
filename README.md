# AssuredLoop

AssuredLoop keeps an AI focused on one change. It holds together:
- the owner's words;
- the organized requirement the owner signs off;
- the current consolidated spec, and the change to it;
- the decisions;
- the code and tests that came with it.

It is being rebuilt with its own method, by hand until the tool exists:
- `requests/assuredloop-v1/`: the request. It holds the owner's words, the
  signed requirement, the change spec and the design;
- `docs/adr/`: the decision records;
- `specs/`: the current spec, which fills as the build's parts land.

The previous version is on the `legacy` branch. Its build is tagged
`assuredloop-base-0.1.0-canonical-build`, and its issues and pull requests stay
in this repository.
