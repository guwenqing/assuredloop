# Fresh-agent guidance inputs

Each directory contains one sanitized trial input. `case.md` preserves an original request, a compact specification snapshot, and the relevant Issue snapshot; some cases also include review or closeout context in the same file.

Run each case with a fresh executor that receives only the case file, the installed guidance, and the declared framework contracts. Do not use network access, private conversation history, or this fixture directory's sibling cases. These inputs contain no answer key; record the executor's route, artifact decisions, handoff, and limits in ignored local data.

The snapshots use `example/consumer` and synthetic revisions. They are evidence-shaped context for trial design, not live GitHub records or authorization.
