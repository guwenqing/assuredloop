Source: standard input
Fetched: 2026-10-19T19:56Z
SHA-256: 88d3caa2a4f47988abb5a802a256c954ae0734dbb3fd84ee274968623f2412c8
---
#2 stops the `stale-base` hint for such bindings; it is not in a release yet (1.0.0 has the same code as 0.4.1). This issue asks for the rest: drop the dead bindings from the records, and report holder drift.

## Problem

`al index` never removes a recorded binding. When a link is removed from a marker (for example, a paragraph's `governed-by:` drops an ADR that another ADR superseded, or a superseded ADR's marker drops its `decides:` and `source:` links), the binding stays in `.assuredloop/records/requests/<name>.yaml`.

- If the old target's text changed, `al check` reports the binding as `stale-base` and suggests `al index --align <ID>`. Aligning does not help: it moves only the declared links, and the old binding keeps its old hash. The hint cannot be cleared with an AssuredLoop command.
- If the old target's text did not change, the binding stays with no hint at all.

In one project, 161 recorded bindings had no declaration in any current marker: 107 `governed-by`, 36 `decides`, 15 `source` and 3 `serves`. 108 of them printed `stale-base` hints. Removing exactly those lines from the records by hand made `stale-base` zero; a following `al index` changed no record and every other check result stayed the same.

## Request

- `al index` drops each recorded binding that no current marker declares, or `al check` reports it with a dedicated finding and a command removes it.
- Declared history links, such as `supersedes:`, stay.

## Related

`al check` reports `stale-base` only when a binding's target text changed. A binding whose holder text changed after it was bound (`holder_sha256` differs from the holder's current `text_sha256`) gives no finding, so it is easy to miss when aligning.



`al index --align <ID>` also does not move the bindings held by a superseded ADR. For an ADR whose Status line is `superseded by ADR-n`, `al index --align ADR-14` reports "No record changed", although its `supersedes:ADR-1` binding records an older `holder_sha256` than the ADR's current `text_sha256`. The same command moves the `supersedes` binding of an accepted ADR. Wanted: `--align` moves every declared binding of the paragraph it names, for a superseded ADR too.


---

The owner's words in the architect's tab, 2026-10-19:

- 19:49Z: "Tell me more what to sign"
- 19:51Z, after the architect's plain account of #11 and #13 with both texts (shown at 19:50Z): "Yes I am good on both"
