Source: chat with the owner, architect session (Claude Code), question on C9
Fetched: 2026-09-28T02:29Z
SHA-256: a650cdd030bf3644f6af3b117c86e2fec96220e7d8b306caca65050223d1ed09
---
Question (architect, 2026-09-28): The design's cost check C9 says the tool stays "under 2,000 lines of CLI source". After 6 of 10 parts it is 2,115 (1,764 not counting blank and comment lines). My rough estimate for the rest: part 7 +350, part 8 +350, part 9 +200, part 10 +50, about 3,000 at the end. Part of the growth is safety checks the reviews found (symlinks, atomic writes, bad paths) that the design never foresaw. Your signed R11 sets no line count. How should C9 change?

Options offered:
- Raise to under 3,500 (Recommended): Replace 2,000 with a ceiling set from the estimate: under 3,500 lines in src/ and bin/, blank and comments included. The rest of C9 stays: no dependencies, and a short skill. Checked at part 10. I update ADR 0009 and design C9.
- Keep 2,000, cut: Trim now (about 100-150 lines, at some cost to readability), then leave out features in parts 7-9 to stay under. It likely means dropping promises that serve your signed requirements, and I'd have to propose which ones.
- Drop the line count: C9 keeps only no runtime dependencies and the short skill. 'Lightweight' is judged at part 10 by the formality cost (R11's fifth) and the fresh-reader test, not by lines of code.

Owner's answer: "Raise to under 3,500 (Recommended)"
