# AssuredLoop v4: the scale run (T15)

This is the report of T15 in `tasks.md` (issue #188). It times `al` v4 on
1,000 generated requests and 20 repos, against the criteria of T15. The
world and the harness are in `scale/`; decision D19 in `request.md` records
their shape.

## Result

With #199, all five criteria are met: `al check` on a PR takes 6.0 seconds
(see "After #199" below). The first measured run, on main b4fe90e before
#199, met four of the five. `al check` on a PR missed: it took 40 to 43
seconds, and the criterion is 10 seconds. The table gives that first run.

| Measure | Criterion | Time (largest run) | Result |
|---|---|---|---|
| `al check` on a PR, at 1,000 requests | 10 s | 42.7 s (3 runs: 40.2, 41.4, 42.7) | missed |
| full level 1 rebuild of the index | 15 min (900 s) | 32.8 s | met |
| incremental index after a merge | 2 min (120 s) | 13.4 s | met |
| removal of rows from the current index (an incremental index after a merge that removes 10 paragraphs) | 2 min (120 s) | 12.7 s | met |
| `al search` across 20 repos | 2 s | 0.77 s (5 queries: 0.64 to 0.77) | met |

Every search answered at level 1. The 10 removed paragraphs are gone from
the current index, and a history query still finds each of them.

## After #199

#199 removed the causes that "Why `al check` missed" names. One git process
for each repo now finds the PR merges and the results' commits. `al check`
reads only the output repos and their results, so it does not load the records
a third time. It parses an archived record only when the check needs it (D20).

The two runs used the same world and the same harness, one after the other,
on the same machine:
- before: main 4d983cf, whose `src/` and `bin/` are those of b4fe90e;
- after: the #199 branch at 3664249.

Both runs, and the six-PR comparison below, ran before this branch was rebased
onto main e439316. That rebase brought #198, which changes only the text of
check's Next line and of al conclude's Outcome, not what is read or how.

The harness marks the "before" al as dirty. That is only because its
worktree holds `node_modules` as a symlink; its code is main's.

| Measure | Criterion | Before (main) | After (#199) | Result after |
|---|---|---|---|---|
| `al check` on a PR (328dabb, 3 runs) | 10 s | 45.0, 50.1, 49.7 s | 6.03, 6.05, 6.05 s | met |
| full level 1 rebuild | 900 s | 30.5 s | 30.0 s | met |
| incremental index after a merge | 120 s | 16.3 s | 18.3 s | met |
| removal of 10 rows | 120 s | 17.6 s | 17.7 s | met |
| `al search`, 5 queries at level 1 | 2 s | 0.97 to 1.21 s | 0.70 to 1.05 s | met |

- The 1-minute load average was 6.8 to 12.6 during both runs.
- Every search answered at level 1, and the removal checks held in both runs.
- The output of `al check` did not change. Besides the tests, I compared its
  full output from main and from #199, byte for byte, on six PRs of this
  world, each made off main. All six were the same. With #199 they took 6.1
  to 7.5 s; with main they took 45 to 52 s. The six PRs:
  - closing the oldest open request;
  - closing another open request;
  - removing 10 paragraphs from a spec file;
  - editing an adopted paragraph;
  - editing a paragraph that serves an archived request;
  - adding a link to a spec ID that an archived request removed.

## The run

- Date: 2026-10-10; the run ended at 18:17 EDT, after about 4 minutes.
- `al`: main at b4fe90e, run as `bin/al-v4.js` from branch commit 87198bc,
  which adds only `scale/`, its tests and the scale-run decision (then D18, now D19) to main. So the timed code is
  main's code, with #184 (checks and views), #186 (search across the output
  repos) and #190 (one batch git read per commit) merged.
- The command: `node scale/run.js --world <dir>` (3 runs of `al check`, 5
  search queries).
- The commits it ran at, in the central repo:

| Measure | Central commit |
|---|---|
| `al check` | 328dabb, a PR branch off main that consolidates and concludes request r0991 |
| full rebuild | c3bfe14, the generated main |
| incremental index | f9aa2a5, the merge of that PR, after a merge in output repo out-01 (b517beb) |
| removal | b53992d, the merge of a PR that removes 10 paragraphs from `specs/area-13.md` |
| search | b53992d |

- The output repos were at the heads that the generator wrote, except out-01
  for the incremental index. The full rebuild walked all 20 repos.

## The machine

The machine is not the reference machine of T15.

| | This run | Reference (T15) |
|---|---|---|
| Model | Mac17,16, Apple M5 Pro, 18 cores | an Apple-silicon laptop |
| Memory | 64 GB | 16 GB |
| OS and runtime | macOS (Darwin 27.0.0, arm64), Node 26.11.1 | not given |

- Other bots share this machine. The 1-minute load average was 5.7 to 14.5
  during the runs (0.3 to 0.8 for each core); report.json holds the load
  before and after each run.
- Peak memory (maximum resident set size), measured twice apart from the run
  with `/usr/bin/time -l` on central's main: `al check` 2.22 and 2.27 GB, and
  the full rebuild 2.33 and 2.23 GB. So 16 GB is not a limit at this size.
- Not known: the times on a 16 GB laptop with fewer cores. Most of the time of
  `al check` is in git processes and YAML parsing, on one core, so the number
  of cores matters less than the speed of one core.

## The world

`scale/generate.js` writes it, deterministically, in the v4 formats as `al`
writes them (D19). Its tests check that `al-v4 index` on a small world changes no file, and that
`al-v4 check` on it prints no `not ok` and no `no-link` hint on an adopted
paragraph.

- One central repo and 19 output repos.
- 1,000 requests: 990 concluded and archived, 10 open. Each request is
  opened by one PR, implemented by one PR in an output repo, and (except the
  last 10) consolidated and concluded by a later PR. The spec's adoption is
  recorded as the archived request `adoption` (D16).
- Central main has 3,983 commits, 1,993 of them on its first-parent history
  (one merge commit for each PR).
- 98,667 change-spec paragraphs (37.6 MB, about 9.4 million tokens), and
  8,216 spec paragraphs in `specs/` at main (3.5 MB).
- 56.0 MB of request records; 694 spec paragraphs removed over the history.
- Each output repo starts with 100 code files that cite nothing. Then each
  PR adds a code file and a test file that cite central IDs, an area index
  file, and a result file.
- The index after the full rebuild: 118,003 current rows and 137,047 history
  rows.

## Why `al check` missed (before #199)

A CPU profile of one `al check` on central's main (39 s; `node --cpu-prof`)
shows where the time goes:

| Part | Time | What it does |
|---|---|---|
| `crossRepo` (repos.js), called by `checks.js` | 22.7 s | the cross-repo links and results of the 19 output repos |
| `mergeOf` (git.js) | 8.0 s | one `git log --first-parent` for each PR reference, about 1,000 |
| `commitOf` (git.js) | 7.4 s | one `git rev-parse` for each result's commit, about 1,000 |
| YAML parsing | 15.7 s | the 1,001 request records (56.0 MB), parsed three times: by `state.js` `loadState` for the working tree and for the merge-base (checks.js lines 67-68; 11.4 s together), and by `indexer.js` `loadState` inside `crossRepo` (5.7 s) |

- The parts overlap: `crossRepo` holds `mergeOf`, `commitOf` and one of the three
  YAML parses.
- design.md 11 says that `al check` "reads archived records only through their
  stored hashes". Today it parses every archived record three times.
- `mergeOf` and `commitOf` read commits, not files, so #190 did not change
  them. One `git log` for each repo, and one `git cat-file --batch-check` for
  each repo, would replace about 2,000 processes.

The history of this number. The two earlier runs used the same world, but
without the adoption record:

| Code | `al check` | What changed |
|---|---|---|
| main f51d57f (#185, before #184) | 13 to 30 s | `docsInScope` read each doc at the base with its own `git show` |
| #190's fix on that code (c3a7027) | 2.9 to 3.0 s | one batch git read per commit (#190) |
| main b4fe90e (with #184 and #186) | 40 to 43 s | #184's checks call `crossRepo` and a second state load |

The other measures did not change much between these versions: the full
rebuild was 28 to 44 s, the incremental index 13 to 17 s, and search 0.15 to
0.8 s.

## Not checked

- Level 2 search: not timed (D19). The criterion "al search answers within
  2 s" was timed at level 1.
- A 16 GB reference machine: not available here.
- `al check` in an output repo, `al index` and `al context` at this size: not
  timed; T15 does not name them.
- An incremental index after merges in many output repos at once: the run
  merged in one output repo.
- The cost account of design.md 16: that is part of T16, after this issue.
- Each number is from one run on a shared machine. They are not averages.
- `al context` still loads the working tree's records twice: once in
  `state.js`, and once in `crossRepo`, which uses the indexer's shape of the
  state. Sharing one load could change its output for an archived folder with
  no request.md, so #199 left it.
- #199 reads the adoption entries, and the request that removed an ID, only
  from records whose text names `adoption` or that ID. A record that writes
  these words only through YAML escapes (for example `"\x61doption"`) would be
  missed. No record that al writes does so.

## How to repeat it

1. `node scale/generate.js --out <dir>` (about 7 minutes; outside the repo).
2. `node scale/run.js --world <dir>` (about 4 minutes). It writes
   `<dir>/report.md` and `<dir>/report.json`, and puts every repo back on its
   old main.
