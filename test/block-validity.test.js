// Validation fixes, PR 2 (tier 0): a block heading's op follows [SPC-5]'s
// grammar, exactly one of its five ops, `modify`, `add in <path>`, `add after
// [ID]`, `remove, was after [ID]` or `remove, was first in <path>`, with Was:
// and Now: as the op needs them (an add
// has no Was:, a remove no Now:, a modify both). Anything else is a fault,
// never read as a remove (#97, #106(a)); so is a repeated request/ID@n in
// one change.md (#98). For a faulty block, check gives a `not ok` naming it,
// check --strict exits 1 on a branch serving its request [HNT-3], and
// consolidate and conclude refuse, exit 1, writing nothing [STA-4] [STA-7];
// consolidate's refusal cites [SPC-5], so it refuses for the fault and not for
// the block's state.
// And a repo with no commits is not the tool failing itself: context, spec
// and check exit 0 there, with a true frame (#114, [HNT-3], [VW-9]).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, runAl, git, tempDir } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { ENV, addRequest, assertRefused, both } from './helpers/request.js';
import { file } from './helpers/links.js';
import { check, checkHints, hint, kindOf, message, strict } from './helpers/hints.js';

const CSV = '## [INV-1] Export\nCSV MUST be available.\n';
const PDF = '## [INV-1] Export\nPDF MUST be available.\n';
const TEXT = '## [INV-1] Export\nTEXT MUST be available.\n';
const INV2 = '## [INV-2] Format\nThe export format is named in its file.\n';
const INV2B = '## [INV-2] Format\nThe export format MUST be named in its file.\n';
const INV3 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const INV9 = '## [INV-9] Export name\nThe file MUST be named after the invoice number.\n';
const INV9_OLD = '## [INV-9] Export name\nThe file is named after the invoice.\n';
const INV20 = '## [INV-20] Credit notes\nA credit note MUST name its invoice.\n';

const al = (repo, ...args) => runAl(repo.dir, args, { env: ENV });
const status = (repo) => repo.git(['status', '--porcelain', '--untracked-files=all']);

// Main: specs/invoices.md holding `baseline`, and the request export,
// signed unless `signed` is false. The branch `work` commits its change.md
// of `blocks`, with a Request: line, so the branch serves it.
function served(t, blocks, baseline, { signed = true } = {}) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', baseline);
  addRequest(repo, 'export', null, { signed });
  repo.commit('export: request', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  addRequest(repo, 'export', blocks, { signed });
  repo.commit(message('export: change spec', { request: 'export', tier: '2 — export' }), { date: '2026-09-22T12:00:00Z' });
  return repo;
}

// Each faulty block: its key, and the baseline with its "was" (so a write
// would show) and with its "now" (so conclude would pass if it were read as
// the op it names or as a remove).
const FAULTS = {
  '#97 an unknown op, "modfiy"': {
    key: 'INV-1@1', block: block('[INV-1]@1 modfiy   for R1', { was: CSV, now: PDF }),
    before: file(CSV, INV2), after: file(PDF, INV2),
  },
  '#106(a) a remove with no "was after [ID]"': {
    key: 'INV-2@1', block: block('[INV-2]@1 remove   for R1', { was: INV2 }),
    before: file(CSV, INV2), after: file(CSV),
  },
  'an add with a Was:': {
    key: 'INV-9@1', block: block('[INV-9]@1 add after [INV-2]   for R1', { was: INV9_OLD, now: INV9 }),
    before: file(CSV, INV2), after: file(CSV, INV2, INV9),
  },
  'a remove with a Now:': {
    key: 'INV-2@1', block: block('[INV-2]@1 remove, was after [INV-1]   for R1', { was: INV2, now: INV2B }),
    before: file(CSV, INV2), after: file(CSV),
  },
  'a modify with no Now:': {
    key: 'INV-1@1', block: block('[INV-1]@1 modify   for R1', { was: CSV }),
    before: file(CSV, INV2), after: file(CSV, INV2),
  },
  'a modify with no Was:': {
    key: 'INV-1@1', block: block('[INV-1]@1 modify   for R1', { now: PDF }),
    before: file(CSV, INV2), after: file(PDF, INV2),
  },
  // PR #116 review: both sides of each op, and the whole op token.
  'PR #116 a remove with neither Was: nor Now:': {
    key: 'INV-1@1', block: block('[INV-1]@1 remove, was after [INV-2]   for R1', {}),
    before: file(INV2, CSV), after: file(INV2),
  },
  'PR #116 an add in <path> with no Now:': {
    key: 'INV-20@1', block: block('[INV-20]@1 add in specs/invoices.md   for R1', {}),
    before: file(CSV, INV2), after: file(CSV, INV2),
  },
  'PR #116 an op with a suffix, "modify-typo"': {
    key: 'INV-1@1', block: block('[INV-1]@1 modify-typo   for R1', { was: CSV, now: PDF }),
    before: file(CSV, INV2), after: file(PDF, INV2),
  },
  'PR #116 an op with a suffix, "add-in"': {
    key: 'INV-9@1', block: block('[INV-9]@1 add-in specs/invoices.md   for R1', { now: INV9 }),
    before: file(CSV, INV2), after: file(CSV, INV2, INV9),
  },
  // PR #116 re-review: names every JS object inherits are not ops either.
  ...Object.fromEntries(['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'].map((op) => [
    `PR #116 an inherited name as the op, "${op}"`, {
      key: 'INV-1@1', block: block(`[INV-1]@1 ${op}   for R1`, { was: CSV, now: PDF }),
      before: file(CSV, INV2), after: file(PDF, INV2),
    }])),
};

for (const [label, { key, block: faulty, before, after }] of Object.entries(FAULTS)) {
  test(`[SPC-5][HNT-3] ${label}: check gives a not ok naming ${key}; check --strict exits 1 on the branch serving it`, (t) => {
    const repo = served(t, [faulty], before);
    hint(check(repo, '--all'), 'not ok', key);
    strict(repo, 1);
  });

  test(`[SPC-5][STA-4] ${label}: consolidate export --yes refuses, exit 1, citing [SPC-5], and writes nothing; the baseline stays byte for byte`, (t) => {
    const repo = served(t, [faulty], before);
    const r = al(repo, 'consolidate', 'export', '--yes');
    assertRefused(r, '[SPC-5]');
    assert.equal(status(repo), '', 'nothing written');
    assert.equal(repo.read('specs/invoices.md').toString(), before);
  });

  test(`[SPC-5][STA-7] ${label}: conclude export --yes refuses, exit 1, and writes nothing, even with the baseline at its "now"`, (t) => {
    const repo = served(t, [faulty], after);
    const r = al(repo, 'conclude', 'export', '--yes');
    assert.equal(r.code, 1, `conclude should refuse:\n${both(r)}`);
    assert.equal(status(repo), '', 'nothing written, the request not archived');
  });
}

test('[SPC-5][STA-4] contrast: the four valid ops, modify, add in <path>, add after [ID] and remove, was after [ID], give no not ok, and consolidate writes each', (t) => {
  const repo = served(t, [
    block('[INV-1]@1 modify   for R1', { was: CSV, now: PDF }),
    block('[INV-20]@1 add in specs/credit.md   for R1', { now: INV20 }),
    block('[INV-9]@1 add after [INV-3]   for R1', { now: INV9 }),
    block('[INV-2]@1 remove, was after [INV-1]   for R1', { was: INV2 }),
  ], file(CSV, INV2, INV3));
  const out = check(repo, '--all');
  assert.deepEqual(checkHints(out).filter((l) => kindOf(l) === 'not ok'), [], `no not ok:\n${out}`);
  const r = al(repo, 'consolidate', 'export', '--yes');
  assert.equal(r.code, 0, both(r));
  const spec = repo.read('specs/invoices.md').toString();
  assert.ok(spec.includes('PDF MUST be available.') && !spec.includes('CSV MUST be available.'), `INV-1 modified:\n${spec}`);
  assert.ok(!spec.includes('[INV-2]'), `INV-2 removed:\n${spec}`);
  assert.ok(spec.indexOf('[INV-9]') > spec.indexOf('[INV-3]'), `INV-9 added after INV-3:\n${spec}`);
  assert.equal(repo.read('specs/credit.md').toString().trim(), INV20.trim(), 'INV-20 added in specs/credit.md');
});

// --- #98: a repeated block ---

// The same key twice: the first pending (CSV to PDF), the second consolidated (TEXT to CSV).
const REPEATED = [
  block('[INV-1]@1 modify   for R1', { was: CSV, now: PDF }),
  block('[INV-1]@1 modify   for R1', { was: TEXT, now: CSV }),
];

test('#98 [SPC-5][HNT-3] two blocks [INV-1]@1 in one change.md: check gives a not ok naming INV-1@1; check --strict exits 1', (t) => {
  const repo = served(t, REPEATED, file(CSV, INV2));
  hint(check(repo, '--all'), 'not ok', 'INV-1@1');
  strict(repo, 1);
});

test('#98 [STA-4] two blocks [INV-1]@1: consolidate export --yes refuses, exit 1, citing [SPC-5], and writes nothing', (t) => {
  const repo = served(t, REPEATED, file(CSV, INV2));
  const r = al(repo, 'consolidate', 'export', '--yes');
  assertRefused(r, '[SPC-5]');
  assert.equal(status(repo), '', 'nothing written');
});

test('#98 [STA-7] two blocks [INV-1]@1, the first pending and the second consolidated: conclude export --yes refuses, exit 1, and does not archive', (t) => {
  const repo = served(t, REPEATED, file(CSV, INV2));
  const r = al(repo, 'conclude', 'export', '--yes');
  assert.equal(r.code, 1, `conclude should refuse:\n${both(r)}`);
  assert.equal(status(repo), '', 'nothing written, the request not archived');
});

// --- #114: a repo with no commits ---

// A fresh git init with no commits, then al new first --from -.
function noCommits(t) {
  const dir = join(tempDir(t), 'repo');
  mkdirSync(dir);
  git(dir, ['init', '-q']);
  const repo = { dir };
  const r = runAl(dir, ['new', 'first', '--from', '-'], { input: 'The first request.\n', env: ENV });
  assert.equal(r.code, 0, `the fixture: new works with no commits:\n${both(r)}`);
  assert.throws(() => git(dir, ['rev-parse', '--verify', 'HEAD']), 'the fixture: no commits');
  return repo;
}
// Exit 0 with the [VW-9] frame: a Read line naming the working tree, then
// Next, then a Not known line saying there is no history yet.
function trueFrame(r, what) {
  assert.equal(r.code, 0, `${what} should exit 0:\n${both(r)}`);
  const ls = lines(r.stdout);
  const read = ls.find((l) => /^Read\b/.test(l));
  assert.ok(read && read.includes('working tree'), `${what}: a Read line naming the working tree:\n${r.stdout}`);
  assert.match(ls.at(-2), /^Next\b/, `${what}: a Next line:\n${r.stdout}`);
  assert.match(ls.at(-1), /^Not known\b.*\b(no commits|no history|history unavailable)/i, `${what}: the Not known line says there is no history yet:\n${r.stdout}`);
}

test('#114 [HNT-3][VW-9] a repo with no commits: context first exits 0, with a true frame', (t) => {
  trueFrame(al(noCommits(t), 'context', 'first'), 'context first');
});

test('#114 [HNT-3][VW-9] a repo with no commits: check exits 0, with a true frame', (t) => {
  trueFrame(al(noCommits(t), 'check'), 'check');
});

test('#114 [HNT-3] pin: a repo with no commits: context and spec exit 0', (t) => {
  const repo = noCommits(t);
  for (const args of [['context'], ['spec']]) {
    const r = al(repo, ...args);
    assert.equal(r.code, 0, `${args.join(' ')}:\n${both(r)}`);
  }
});

// --- PR #116 review: revert validates too; record section shows the fault and still drafts ---

// Two export/INV-1@1 modify blocks, both Now PDF, Was CSV and TEXT.
const REPEATED_PDF = [
  block('[INV-1]@1 modify   for R1', { was: CSV, now: PDF }),
  block('[INV-1]@1 modify   for R1', { was: TEXT, now: PDF }),
];

test('PR #116 [STA-4] consolidate --revert validates too: with the repeated INV-1@1 pair and the baseline at PDF, consolidate export --revert INV-1 --yes refuses, exit 1, the baseline byte for byte', (t) => {
  const repo = served(t, REPEATED_PDF, file(PDF, INV2));
  const r = al(repo, 'consolidate', 'export', '--revert', 'INV-1', '--yes');
  assert.equal(r.code, 1, `revert should refuse:\n${both(r)}`);
  assert.equal(status(repo), '', 'nothing written');
  assert.equal(repo.read('specs/invoices.md').toString(), file(PDF, INV2));
});

test('PR #116 [STA-4] contrast: a valid revert still works while the request is blocked: consolidate export --revert INV-1 --yes puts back CSV', (t) => {
  const repo = served(t, [block('[INV-1]@1 modify   for R1', { was: CSV, now: PDF })], file(PDF, INV2), { signed: false });
  const r = al(repo, 'consolidate', 'export', '--revert', 'INV-1', '--yes');
  assert.equal(r.code, 0, both(r));
  assert.equal(repo.read('specs/invoices.md').toString(), file(CSV, INV2));
});

test('PR #116 [SPC-5][TL-1] record export section INV-2 on a change.md with the repeated INV-1@1 pair: the preview shows a not ok naming INV-1@1, and --yes still writes the block (drafting is never refused)', (t) => {
  const repo = served(t, REPEATED_PDF, file(PDF, INV2));
  const preview = al(repo, 'record', 'export', 'section', 'INV-2');
  assert.equal(preview.code, 0, both(preview));
  assert.ok(lines(preview.stdout).some((l) => /not ok/.test(l) && l.includes('INV-1@1')), `the preview should show a not ok naming INV-1@1:\n${preview.stdout}`);
  assert.equal(status(repo), '', 'the preview writes nothing');
  const r = al(repo, 'record', 'export', 'section', 'INV-2', '--yes');
  assert.equal(r.code, 0, both(r));
  assert.match(repo.read('requests/export/change.md').toString(), /^### \[INV-2\]@1 modify/m, 'the INV-2 block is written');
});
