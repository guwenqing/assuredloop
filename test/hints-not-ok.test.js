// The "not ok" hints [HNT-2] that a request owns, in al check and in
// al context <name>: a held section that reads differs, base revised, base
// dropped, broken link or not found (its holder); two holders with no link
// between them (both); a snapshot whose text no longer matches its SHA-256; a
// dangling citation (an `add after` anchor or a Decisions [ID] in neither the
// baseline nor any block, a `for R<n>` its organized requirement lacks, a
// Follows or a Parts `request` naming no request); a block whose Was or Now
// does not hold exactly one heading carrying its own ID [SPC-5]. On a branch
// that serves the owner each counts: check --strict exits 1 [HNT-3].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl, sha256 } from './helpers/fixture.js';
import { block } from './helpers/change.js';
import { ENV, addRequest, both, lineWith, statusLine } from './helpers/request.js';
import { contextOf, file } from './helpers/links.js';
import { assertCounts, assertInformation, check, hint, message, noHint, strict } from './helpers/hints.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const S2 = '## [INV-3] Dates\nDates MUST show in ISO 8601, with the time zone.\n';
const S3 = '## [INV-3] Dates\nDates MUST show in ISO 8601, with the time zone, to the second.\n';
const INV4A = '## [INV-4] Separator\nThe CSV separator is a comma.\n';
const INV4B = '## [INV-4] Separator\nThe CSV separator MUST be a semicolon.\n';
const INV7 = '## [INV-7] CSV rows\nOne row per line item.\n';
const INV8 = '## [INV-8] Export page\nThe invoice page MUST offer the export.\n';
const CALL = 'The owner called about the dates.\n';

// Commit what `setup` wrote on main, then serve `serve` on the branch work.
function served(t, setup, serve = 'invoice-download') {
  const repo = makeRepo(t);
  setup(repo);
  repo.commit('Records', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('src/export.js', 'export const rows = [];\n');
  repo.commit(message('Rows', { request: serve, tier: '2 — rows' }), { date: '2026-09-22T12:00:00Z' });
  return repo;
}
const context = (repo, name = 'invoice-download') => {
  const r = runAl(repo.dir, ['context', name]);
  assert.equal(r.code, 0, both(r));
  return r.stdout;
};

// One held INV-3 (or INV-4) in each state; invoice-download holds it.
const HOLDER = {
  differs: (repo) => {
    repo.write('specs/invoices.md', file(INV1, S3));
    addRequest(repo, 'invoice-download', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
    return 'INV-3';
  },
  'broken link': (repo) => {
    repo.write('specs/invoices.md', file(INV1, S1));
    addRequest(repo, 'invoice-download', [block('[INV-3]@1 modify   builds on nosuch/INV-3@1   for R2', { was: S1, now: S2 })]);
    return 'INV-3';
  },
  'base revised': (repo) => {
    repo.write('specs/invoices.md', file(INV1, S1));
    addRequest(repo, 'cancel-invoices', [
      block('[INV-3]@1 modify   Revised 2026-09-24 (D1)   for R1', { was: S0, now: S1 }),
      block('[INV-3]@2 modify   for R1', { was: S1, now: S3 }),
    ]);
    addRequest(repo, 'invoice-download', [block('[INV-3]@1 modify   builds on cancel-invoices/INV-3@1   for R2', { was: S1, now: S2 })]);
    return 'INV-3';
  },
  'base dropped': (repo) => {
    repo.write('specs/invoices.md', file(INV1, S0));
    addRequest(repo, 'cancel-invoices', [block('[INV-3]@1 modify   for R1', { was: S0, now: S1 })], { status: 'dropped' });
    addRequest(repo, 'invoice-download', [block('[INV-3]@1 modify   builds on cancel-invoices/INV-3@1   for R2', { was: S1, now: S2 })]);
    return 'INV-3';
  },
  'not found': (repo) => {
    repo.write('specs/invoices.md', file(INV1, S0));
    addRequest(repo, 'invoice-download', [block('[INV-4]@1 modify   for R1', { was: INV4A, now: INV4B })]);
    return 'INV-4';
  },
};

for (const [state, setup] of Object.entries(HOLDER)) {
  test(`[HNT-2][HNT-3] check: a held section that reads ${state} is not ok ("reads ${state}"), owned by its holder, which the branch serves: it counts, check --strict exits 1`, (t) => {
    let id;
    const repo = served(t, (r) => { id = setup(r); });
    assert.ok(lineWith(contextOf(repo, 'invoice-download').stdout, id, state), `the fixture: ${id} reads ${state}`);
    assertCounts(hint(check(repo, '--all'), 'not ok', `reads ${state}`, id));
    strict(repo, 1);
  });
}

test('[HNT-3] contrast: the holder with INV-3 consolidated has no "reads" not ok, and check --strict exits 0', (t) => {
  const repo = served(t, (r) => {
    r.write('specs/invoices.md', file(INV1, S1));
    addRequest(r, 'invoice-download', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  });
  noHint(check(repo, '--all'), 'not ok', 'reads');
  strict(repo, 0);
});

test('[HNT-2][HNT-3] two open requests holding INV-3, neither building on the other: not ok ("neither builds on the other"), owned by both: it counts for a branch serving either, and is information on one serving neither; with a builds-on link, none', (t) => {
  const two = (link, serve) => served(t, (r) => {
    r.write('specs/invoices.md', file(INV1, S0));
    addRequest(r, 'invoice-download', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
    addRequest(r, 'tz-dates', [link
      ? block('[INV-3]@1 modify   builds on invoice-download/INV-3@1   for R1', { was: S1, now: S2 })
      : block('[INV-3]@1 modify   for R1', { was: S0, now: S2 })]);
    addRequest(r, 'csv-rows', null);
  }, serve);
  for (const serve of ['invoice-download', 'tz-dates']) {
    const repo = two(false, serve);
    assertCounts(hint(check(repo, '--all'), 'not ok', 'neither builds on the other', 'INV-3'));
    strict(repo, 1);
  }
  const neither = two(false, 'csv-rows');
  const line = hint(check(neither, '--all'), 'not ok', 'neither builds on the other', 'INV-3');
  assertInformation(line, 'invoice-download');
  assertInformation(line, 'tz-dates');
  strict(neither, 0);

  const linked = two(true, 'invoice-download');
  noHint(check(linked, '--all'), 'neither builds on the other');
  strict(linked, 0);
});

test('[HNT-2][HNT-3] a snapshot whose text no longer matches its SHA-256 is not ok, naming the file, owned by its request: it counts; untampered, none', (t) => {
  const snap = (text) => `Source: chat with the owner\nFetched: 2026-09-22T10:00Z\nSHA-256: ${sha256(CALL)}\n---\n${text}`;
  for (const [text, code] of [[`${CALL}tampered\n`, 1], [CALL, 0]]) {
    const repo = served(t, (r) => {
      addRequest(r, 'invoice-download', null);
      r.write('requests/invoice-download/origin/2026-09-22-call.md', snap(text));
    });
    const out = check(repo, '--all');
    if (code) assertCounts(hint(out, 'not ok', 'SHA-256', '2026-09-22-call.md'));
    else noHint(out, 'SHA-256');
    strict(repo, code);
  }
});

// --- dangling citations, each owned by its request ---

// csv-export (signed) adds INV-7 in a block; old-dates is archived.
function others(repo) {
  addRequest(repo, 'csv-export', [block('[INV-7]@1 add in specs/invoices.md   for R1', { now: INV7 })]);
  addRequest(repo, 'old-dates', null, { dir: 'requests/archive/old-dates', status: 'concluded' });
}
// invoice-download as `opts` and `blocks` give it, beside the baseline at S0 and `others`.
function citing(t, blocks, opts = {}) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  others(repo);
  addRequest(repo, 'invoice-download', blocks, opts);
  repo.commit('Records', { date: '2026-09-21T12:00:00Z' });
  return repo;
}
const decision = (text) => `\n## Decisions\n\n- D1, 2026-09-21. Source: the owner. ${text}\n`;
const addAfter = (anchor) => [block(`[INV-8]@1 add after [${anchor}]   for R1`, { now: INV8 })];

// Each: the request citing what does not exist, the thing it cites, and
// requests citing what does exist, as { blocks, opts } for citing().
const DANGLING = {
  'an add after an anchor in neither the baseline nor any block': {
    bad: { blocks: addAfter('INV-99') }, thing: 'INV-99', goods: [{ blocks: addAfter('INV-3') }, { blocks: addAfter('INV-7') }],
  },
  'a Decisions entry citing an [ID] in neither the baseline nor any block': {
    bad: { opts: { decisions: decision('Leave [INV-42] as it is.') } }, thing: 'INV-42',
    goods: [{ opts: { decisions: decision('Leave [INV-3] as it is.') } }, { opts: { decisions: decision('Rows as in [INV-7].') } }],
  },
  'a block for an R-line its organized requirement lacks': {
    bad: { blocks: [block('[INV-3]@1 modify   for R7', { was: S0, now: S1 })] }, thing: /\bR7\b/,
    goods: [{ blocks: [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })] }],
  },
  'a Follows naming no request': {
    bad: { opts: { line: `${statusLine('open')} · Follows: no-such-dates` } }, thing: 'no-such-dates',
    goods: [{ opts: { line: `${statusLine('open')} · Follows: old-dates` } }, { opts: { line: `${statusLine('open')} · Follows: csv-export` } }],
  },
  'a Parts entry naming no request': {
    bad: { opts: { rest: '\n## Parts\n\n1. Email link: request no-such-link\n' } }, thing: 'no-such-link',
    goods: [{ opts: { rest: '\n## Parts\n\n1. CSV rows: request csv-export\n' } }, { opts: { rest: '\n## Parts\n\n1. Dates: request old-dates\n' } }],
  },
};

for (const [label, { bad, thing, goods }] of Object.entries(DANGLING)) {
  test(`[HNT-2] context <name>: ${label} is not ok ("cites"), naming it; citing what exists is not`, (t) => {
    hint(context(citing(t, bad.blocks ?? null, bad.opts)), 'not ok', 'cites', thing);
    for (const good of goods) noHint(context(citing(t, good.blocks ?? null, good.opts)), 'cites');
  });
}

test('[HNT-2][HNT-3] check: a dangling citation counts for the branch serving its request (check --strict exits 1), and is information on a branch serving another', (t) => {
  const dangling = (serve) => {
    const repo = citing(t, null, { decisions: decision('Leave [INV-42] as it is.') });
    repo.git(['checkout', '-q', '-b', 'work']);
    repo.write('src/export.js', 'export const rows = [];\n');
    repo.commit(message('Rows', { request: serve, tier: '2 — rows' }), { date: '2026-09-22T12:00:00Z' });
    return repo;
  };
  const own = dangling('invoice-download');
  assertCounts(hint(check(own, '--all'), 'not ok', 'cites', 'INV-42'));
  strict(own, 1);

  const other = dangling('csv-export');
  assertInformation(hint(check(other, '--all'), 'not ok', 'cites', 'INV-42'), 'invoice-download');
  strict(other, 0);
});

// --- one heading per Was and Now [SPC-5] ---

const TWO_HEADINGS = block('[INV-7]@1 add after [INV-3]   for R1', { now: `${INV7}\n${INV8}` });
const OTHER_ID = block('[INV-4]@1 modify   for R1', { was: INV4A, now: INV4B.replace('[INV-4]', '[INV-5]') });
const TWO_WAS = block('[INV-1]@1 modify   for R1', { was: `${INV1}\n## [INV-2] Rounding\nTotals round half up.\n`, now: INV1.replace('two decimals', 'two decimals, rounded half up') });

test('[HNT-2][SPC-5] check: a block whose Now holds two headings ("holds 2 headings"), one whose Was does, and one whose heading carries another ID ("carries [INV-5], not [INV-4]"), are not ok and count', (t) => {
  const repo = served(t, (r) => {
    r.write('specs/invoices.md', file(INV1, S0, INV4A));
    addRequest(r, 'invoice-download', [TWO_HEADINGS, OTHER_ID, TWO_WAS]);
  });
  const out = check(repo, '--all');
  assertCounts(hint(out, 'not ok', 'holds 2 headings', 'INV-7'));
  assertCounts(hint(out, 'not ok', 'holds 2 headings', 'INV-1'));
  assertCounts(hint(out, 'not ok', 'carries [INV-5], not [INV-4]'));
  strict(repo, 1);
});

test('[HNT-3][SPC-5] contrast: the same heading faults, on a branch that serves another request, are information owned by invoice-download, and check --strict exits 0', (t) => {
  const repo = served(t, (r) => {
    r.write('specs/invoices.md', file(INV1, S0, INV4A));
    addRequest(r, 'invoice-download', [TWO_HEADINGS, OTHER_ID, TWO_WAS]);
    addRequest(r, 'csv-rows', null);
  }, 'csv-rows');
  const out = check(repo, '--all');
  assertInformation(hint(out, 'not ok', 'holds 2 headings', 'INV-7'), 'invoice-download');
  assertInformation(hint(out, 'not ok', 'holds 2 headings', 'INV-1'), 'invoice-download');
  assertInformation(hint(out, 'not ok', 'carries [INV-5], not [INV-4]'), 'invoice-download');
  strict(repo, 0);
});

test('[SPC-5] contrast: the same blocks with one heading each, carrying their own IDs, give neither', (t) => {
  const repo = served(t, (r) => {
    r.write('specs/invoices.md', file(INV1, S0, INV4A));
    addRequest(r, 'invoice-download', [block('[INV-7]@1 add after [INV-3]   for R1', { now: INV7 }), block('[INV-4]@1 modify   for R1', { was: INV4A, now: INV4B })]);
  });
  const out = check(repo, '--all');
  noHint(out, 'headings');
  noHint(out, 'carries');
  strict(repo, 0);
});

test('[SPC-5][REC-6] record section prints the same not ok for its request\'s blocks, and still writes with --yes: drafting is never refused, even while blocked', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0, INV4A));
  addRequest(repo, 'invoice-download', [TWO_HEADINGS], { signed: false });
  repo.commit('Records', { date: '2026-09-21T12:00:00Z' });
  const r = runAl(repo.dir, ['record', 'invoice-download', 'section', 'INV-4', '--yes'], { env: ENV });
  assert.equal(r.code, 0, both(r));
  hint(r.stdout, 'not ok', 'holds 2 headings', 'INV-7');
  assert.ok(repo.read('requests/invoice-download/change.md').toString().includes('### [INV-4]@1 modify'), 'the new block is written');

  const clean = makeRepo(t);
  clean.write('specs/invoices.md', file(INV1, S0, INV4A));
  addRequest(clean, 'invoice-download', [block('[INV-7]@1 add after [INV-3]   for R1', { now: INV7 })], { signed: false });
  clean.commit('Records', { date: '2026-09-21T12:00:00Z' });
  const c = runAl(clean.dir, ['record', 'invoice-download', 'section', 'INV-4', '--yes'], { env: ENV });
  assert.equal(c.code, 0, both(c));
  noHint(c.stdout, 'headings');
});
