# The invoicer fixture world

This folder holds the invented `invoicer` world of the v4 validation (T1, T2),
converted to the final design. The tests of T10 (#179) use it. Other v4 tests
may use it too. The builder is `test/v4/helpers/invoicer.js`.

The source is the validation folder `validation/v4/` of the assuredloop bot:
`fixtures/full/` (the base state and the case overlays) and
`t2/defects.yaml` with `t2/defects-repair.yaml` (the planted defects D01-D14).
Only invented invoicer, invoicer-web and market-report material is copied.

## How a state is built

Each state is a throwaway git repo. The builder runs the public commands
(`node bin/al-v4.js new`, `record`, `index`) and writes only the fields that
no command writes. It never copies a YAML record or a hash of the fixtures.

- A case is `cases/<name>.yaml`. Its files are in `cases/<name>/`.
- A case with no `base` starts a new repo: `main` with one empty commit.
- A case with a `base` starts from that case, built on `main`. Use `baseArm`
  when the base case has arms.
- The case asked for in a test runs on the branch `pr`, cut from `main`.
- The steps run in this order: `steps`, the arm's `steps`, then `after`.
- Then the builder commits everything. The message is the title, a blank
  line, and the claim (`claim` of the arm, else of the case). The check reads
  the claim from this message.
- A state is built once in each test process. Each test gets a copy.

In a test:

```js
import { check, invoicer, minus } from './helpers/invoicer.js';
const dir = invoicer(t, 'd06', 'defect');   // a copy, removed when the test ends
const r = check(dir, '--strict');           // r.code, r.stdout, r.findings
```

`findings` reads each line `<severity> <code> <file>[:<line>] <id> <message>`.
`minus(a, b)` gives the keys `<severity> <code> <id>` of `a` that are not in `b`.

## The steps

Each step is a map with one key.

| Step | What it does |
|---|---|
| `files: <dir>` or `{from, to}` | copies a folder of the case into the repo |
| `write: {file, text}` | writes a file; `text` may be `{file: <path in the case>}` |
| `edit: {file, from, to}` | replaces text that occurs once in the file |
| `delete: <path>` | deletes a file or a folder |
| `move: {from, to}` | moves a file or a folder |
| `archive: <request>` | moves `requests/<request>` to `requests/archive/<request>` |
| `al: [args]`, `input`, `date` | runs `node bin/al-v4.js <args>`; `input` goes to standard input; `date` sets SOURCE_DATE_EPOCH |
| `index: true`, `date` | runs `al-v4 index` |
| `align: <ID>`, `date` | runs `al-v4 index --align <ID>` |
| `section: {request, text}` | appends text to the request's `request.md` |
| `adoption: {doc, ids, text}` | writes the adoption request and record (item 2 below); run `index` first |
| `dispositionsDrop: {request, spec}` | removes a request's dispositions that name one spec ID |
| `dispositions: {request, add}` | appends dispositions to the request record; `al-v4 index` fills their hashes |
| `disposition: {request, source, set}` | changes the latest disposition of one source, and keeps its hashes |
| `decision: {request, id, set}` | adds fields to a decision of the request record |
| `recordSet: {request, set}` | sets top fields of the request record (for example `tasks`) |
| `hint: {doc, id, summary, tags, quote}` | writes an AI hint in a per-doc record; `basis_sha256` is the paragraph's hash there now |
| `result: {file, check, outcome, commit, inputs}` | writes `.assuredloop/results/<file>`; `commit: HEAD` becomes the full hash; an input given as a path gets the sha256 of its bytes now |
| `commit: <message>` | commits everything at this point |

## The cases

| Case | What it is |
|---|---|
| `base` | the invoicer world: the adoption commit (PR #10) on main, then `specs/invoices.md`, `specs/exports.md`, ADR-1 to ADR-4; the archived requests `adoption` (the adoption record) and `invoice-numbers`; the open requests `invoice-exports`, `reminder-emails` and `link-expiry-spike` |
| `clean` | the base, and a branch that changes nothing |
| `typo-pre` | on main: EXP-9, EXP-10, EXP-11 with real typos, from the archived request `export-rules` |
| `d01` to `d14` | the planted defects, each with the arms `defect` and `control`; `d09` also has `newest` and `unclaimed` (the claim itself) |
| `web-base`, `res-config` | invoicer-web as its own repo, with the W3 result; W4 changes an undeclared config file |
| `report-base`, `res-c3`, `res-unknown` | market-report: the C1 review added at C2; C3 changes the report; results whose applicability is unknown |
| `adr-accepted` | arms `text`, `status`, `deleted` of ADR-2 |
| `adr-proposed-pre`, `adr-proposed` | a proposed ADR-5 that changes |
| `adr-supersede` | arms `ok`, `missing`, `accepted`: ADR-5 supersedes ADR-2 (or the missing ADR-9) |
| `adr-governs` | arms `decided` (EXP-6, decided by ADR-4) and `free` (EXP-5) |
| `adr-history-pre`, `adr-history` | EXP-7, decided only by ADR-5, which ADR-6 superseded |
| `cr-wording` | part 2 of invoice-exports, with a wording decision D3 |
| `cr-supersede`, `cr-chain` | A→B (link-refresh) and A→B→C (portal-downloads removes EXP-4) |
| `cr-revert-m8`, `cr-revert-m9`, `cr-revert` | an incorporation, an unexplained revert on main, then the closing PR |
| `cr-abandon-m8`, `cr-abandon-m9`, `cr-abandon` | EXP-9 added and removed on main, then the PR that abandons SP-7, SP-10, SP-11, SP-12 |
| `cr-45` | SP-6 edited from 30 to 45 minutes after its early incorporation, with R2 version 2 signed |
| `cr-remove` | tax-module removes INV-4 (a limit, signed) and adds INV-19; ready to close |
| `spike-q2` | the spike's Q1 changes after its sign-off, and nobody signs the new version |
| `conclude-unsigned` | late-fees incorporates a rule as EXP-9 with a valid disposition, but R1 is not signed |
| `adoption-gap` | promise paragraphs with no link and no adoption entry: arm `unlisted` (INV-10's entry removed), arm `new` (a new rule INV-17) |
| `abandon-changes` | reminder-emails/SP-2 (`changes:INV-11`) abandoned with no decision: arm `kept` (INV-11 unchanged), arm `applied` (INV-11 holds SP-2's text), arm `changed` (INV-11 changed in another way) |
| `req-words` | a sentence added to EXP-5, a rationale: arm `lower` (may, should, must, shall), arm `upper` (MAY), arm `never`, arm `always` (Always) |
| `remove-promise`, `remove-merged-unsigned`, `remove-merged-signed` | drop-tax removes the adopted limit INV-4 with a note that serves R1 and declares `removes:INV-4`: arms `unsigned` and `signed`; then the same removal merged on main, with an empty closing PR |
| `abandon-unsigned` | csv-bom, unsigned, with one rule SP-2: arm `abandoned` (never in specs/), arm `incorporated` (as EXP-9) |
| `code-cite` | EXP-2 named by code only (arm `code`), by a test file (arm `test`), or by a review file that a result names as its check (arm `result`) |
| `spaced-pre`, `remove-spaced`, `remove-spaced-merged-unsigned`, `remove-spaced-merged-signed` | a limit INV-99 whose marker has extra spaces, on main; drop-spaced removes it (arms `unsigned`, `signed`); then the removal merged on main, with an empty closing PR |
| `abandon-decided-dropped`, `abandon-decided-kept` | an owner decision D1 to drop csv-bom's rule SP-2, named in an abandoned disposition, on top of `abandon-unsigned` arm `abandoned` (no kept effect) or arm `incorporated` (EXP-9 kept) |
| `root-moved-unsigned`, `root-moved-signed` | on top of `remove-merged-*`: the closing PR moves specs/ to current-specs/, with root and docs paths updated, and indexes |
| `kind-pre`, `remove-kind` | on main, INV-99 committed as a note, then made a limit; drop-latest's note serves R1 and declares `removes:INV-99` (arms `unsigned`, `signed`); the test removes INV-99 itself |
| `views` | a central test that names EXP-4 and its result, and declared outputs of invoice-exports; arms `fresh` and `changed` (the test changes after the result) |

The main commits of `cr-abandon` and `cr-revert` name their PR in the title,
for example `(#46)`, so that the views find PRs from git.

## The conversion to the final design

The fixtures were written before the final design. These are the changes.

1. Markers have no `from:` link. `from` is not a marker link word.
2. The adopted paragraphs (`from:adoption`) have a kind and no link
   (decision D16). The base first commits the spec as it was at adoption
   (INV-1 to INV-12) on main. Then the `adoption` step writes, by hand in the
   T9 format, the archived request `adoption`
   (`requests/archive/adoption/request.md`) and its record
   `.assuredloop/records/requests/adoption.yaml`: one disposition per adopted
   paragraph, `{source: adoption, disposition: incorporated, spec: <ID>,
   commit: <the adopting commit>, spec_sha256: <the paragraph's text hash>}`.
   `al-v4 index` writes no hash for adoption (D8), so these fields stay.
3. A path-1 paragraph uses `serves:<request>/R<n>` (defects-repair.yaml).
4. A removal is `removes:<ID>`, not `changes:<ID> remove`.
5. ADRs have the form of decision D4: `specs/adr/NNNN-<slug>.md`, a
   `Status:` first line, the heading's marker
   `<!-- ADR-<n> choice decides:… source:… supersedes:… -->`, and
   `<!-- ADR-<n>-<k> rationale -->` on the other paragraphs. The markers have
   no `status:` and no `superseded-by:`. ADR-2's source is
   `invoice-exports/S1` (was `invoice-exports/O1`, which is not an ID in v4).
6. The records come from the commands. Written by hand, and then completed
   by `al-v4 index`: dispositions, tasks, the AI hint of INV-8, the
   `wording` map of a wording decision, and the tier `1d`.
7. An archived request is built open, signed where the case says so, and
   then moved to `requests/archive/`. Its record stays in
   `.assuredloop/records/requests/`.
8. The symbolic commits (M3, W3, C1) are real commits. Results have real
   sha256 values of the files' bytes.
9. A superseded disposition is the same entry, changed from `incorporated`
   to `superseded` with `by:`. It keeps its hashes. The fixtures' `was:` is
   dropped.
10. An abandoned disposition names its decision (`decision: D3`). The
    fixtures' `reason`, `applied` and `reverted` fields are dropped.
11. A wording decision has `wording: {source, spec}`, and its disposition
    has `decision: D3`. The fixtures' `source_version` and `accepted_target`
    are dropped.
12. An informative paragraph has a baseline effect in the final design.
    So `d06` (both arms) and `cr-wording` add EXP-12, the incorporated copy
    of the rationale SP-12, and `cr-abandon` abandons SP-12.
13. Not built: invoicer-worker, invoicer-mobile, adopt-tiny,
    `docs/exports.md`, declared outputs and every cross-repo link (T12). D06
    keeps only its central part.
14. D04 holds both open proposals in one commit. Its claim names link-45.
15. `al-v4 new` refuses `--tier 1d`, so `d13` writes the tier by hand, and
    `adr-governs` leaves it out.
16. Each requirement has a plain marker (`<!-- R1 -->`) and no `from:` link.
17. Dates: each command runs with its own SOURCE_DATE_EPOCH, from the dates
    of the fixtures.
