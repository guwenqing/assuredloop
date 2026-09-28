// Decision records [LNK-4]: ADRs are the files NNNN-<words>.md in docs/adr/
// and in each `adrs:` folder of .assuredloop, in the kit's format (Status:,
// Supersedes:, Request:, Governs:). context <ID> lists on an ADRs line those
// governing the section (Governs: names it) or citing it ([ID] in the text),
// current (accepted, not superseded) first, each with its number and status,
// a superseded one naming its successor. check flags, comparing the base
// with the final state: an ADR accepted at the base and changed beyond its
// Status: line, or deleted; a broken supersede link; a one-way one; a reused
// number (two files now, or a number added under another name in main's
// history): each `not ok`, counting for check --strict on the branch that
// makes it [HNT-3]. A superseded ADR cited as current by the baseline or the
// Now of an open request's block, and an ADR a request added still proposed
// when the branch archives it, are notes [HNT-2]. Acceptance C5a.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { assertFrame } from './helpers/output.js';
import { block } from './helpers/change.js';
import { addRequest, both } from './helpers/request.js';
import { contextOf, file, labelled } from './helpers/links.js';
import { check, checkHints, hint, kindOf, message, noHint, strict } from './helpers/hints.js';
import { adr, adrOrder, writeAdr } from './helpers/evidence.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const ENV = { SOURCE_DATE_EPOCH: '1790206200' };

const notOks = (out) => checkHints(out).filter((l) => kindOf(l) === 'not ok');
const noNotOk = (out) => assert.deepEqual(notOks(out), [], `no not ok:\n${out}`);

// Main: the baseline; decisions, a signed tier-1 request with no change spec;
// .assuredloop when `config`; the ADRs `adrs` ({ name: [title, opts] }); then
// `extra` on the repo. The branch work starts there.
function decided(t, adrs, { config, extra, baseline = file(INV1, S1) } = {}) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', baseline);
  addRequest(repo, 'decisions', null, { line: 'Type: bug · Tier: 1 · Status: open' });
  if (config) repo.write('.assuredloop', config);
  for (const [name, [title, opts]] of Object.entries(adrs)) writeAdr(repo, name, title, opts);
  extra?.(repo);
  repo.commit('Records and ADRs', { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  return repo;
}
// A branch commit for the decisions request.
const commit = (repo, subject) => repo.commit(message(subject, { request: 'decisions', tier: '1 — decisions' }), { date: '2026-09-21T12:00:00Z' });
const edit = (repo, path, from, to) => {
  const text = repo.read(path).toString();
  assert.ok(text.includes(from), `the fixture: ${path} holds ${JSON.stringify(from)}`);
  repo.write(path, text.replace(from, to));
};

const LOCAL = ['Local dates', { governs: ['INV-3'] }];
const L1 = 'docs/adr/0001-local-dates.md';
const ISO = 'docs/adr/0002-iso-dates.md';

// --- context <ID>: the governing ADRs, current first ---

test('C5a [LNK-4][VW-3] context INV-3: two ADRs governing it, 0002 superseding 0001, are listed current first; the superseded one names its successor', (t) => {
  const repo = decided(t, {
    '0001-local-dates': ['Local dates', { status: 'superseded by 0002-iso-dates', governs: ['INV-3'] }],
    '0002-iso-dates': ['ISO dates', { supersedes: '0001-local-dates', governs: ['INV-3'] }],
  });
  const r = contextOf(repo, 'INV-3');
  assert.equal(r.code, 0, both(r));
  assertFrame(r.stdout);
  const { block, numbers } = adrOrder(r.stdout);
  assert.equal(numbers[0], '0002', `the current ADR, 0002, comes first:\n${block}`);
  assert.ok(numbers.includes('0001'), `the superseded 0001 is listed too:\n${block}`);
  assert.match(block, /\b0002\b[^·;\n]*\baccepted\b/, `0002 with its status:\n${block}`);
  assert.match(block, /\b0001\b[^·;\n]*\bsuperseded\b[^·;\n]*\b0002\b/, `0001 is superseded and names 0002:\n${block}`);
});

test('C5a [LNK-4][VW-3] context INV-3 lists an ADR whose text cites [INV-3] (a rough link, with its status), not one citing a bare INV-3 or governing [INV-1], and not README.md or a file not named NNNN-<words>.md; no ADR file is under Links', (t) => {
  const repo = decided(t, {
    '0002-iso-dates': ['ISO dates', { governs: ['INV-3'] }],
    '0003-csv-only': ['CSV only', { governs: ['INV-1'], text: 'See INV-3 for the dates.' }],
    '0004-zones': ['Zones', { status: 'proposed', text: 'Dates of [INV-3] may carry the zone.' }],
  }, {
    extra: (r) => {
      r.write('docs/adr/README.md', '| ADR | Decision |\n|---|---|\n| 0002 | ISO dates for [INV-3] |\n');
      r.write('docs/adr/template.md', adr('0099-template', 'Template', { governs: ['INV-3'] }));
      r.write('src/dates.js', '// [INV-3] Dates\nexport const format = "iso";\n');
    },
  });
  const r = contextOf(repo, 'INV-3');
  assert.equal(r.code, 0, both(r));
  const { block, numbers } = adrOrder(r.stdout);
  assert.equal(numbers[0], '0002', `the current ADR first:\n${block}`);
  assert.match(block, /\b0004\b[^·;\n]*\bproposed\b/, `0004 cites [INV-3] in its text, with its status:\n${block}`);
  for (const n of ['0003', '0099']) assert.ok(!numbers.includes(n), `${n} is not listed:\n${block}`);
  assert.ok(!block.includes('README'), `README.md is not an ADR:\n${block}`);
  const links = labelled(r.stdout, 'Links');
  assert.ok(links.includes('src/dates.js'), `the code is under Links:\n${r.stdout}`);
  assert.ok(!links.includes('docs/adr/'), `no ADR file under Links:\n${links}`);
});

test('C5a [LNK-4][VW-3] an adrs: folder counts beside docs/adr: decisions/0005-zones.md governing [INV-3] is listed with 0002', (t) => {
  const repo = decided(t, { '0002-iso-dates': ['ISO dates', { governs: ['INV-3'] }] }, {
    config: 'adrs: decisions\n',
    extra: (r) => writeAdr(r, '0005-zones', 'Zones', { dir: 'decisions', governs: ['INV-3'] }),
  });
  const r = contextOf(repo, 'INV-3');
  assert.equal(r.code, 0, both(r));
  const { block, numbers } = adrOrder(r.stdout);
  assert.ok(numbers.includes('0002') && numbers.includes('0005'), `both folders' ADRs are listed:\n${block}`);
  assert.ok(!labelled(r.stdout, 'Links').includes('decisions/'), `no ADR file under Links:\n${r.stdout}`);
});

// --- an accepted ADR edited ---

test('C5a [LNK-4][HNT-3] an accepted ADR edited beyond its Status line (its decision, its title, its Governs line) is not ok, and check --strict exits 1', (t) => {
  for (const [from, to] of [['- Local dates.', '- Local dates, then ISO.'], ['# ADR 0001: Local dates', '# ADR 0001: Local or ISO dates'],
    ['Governs: [INV-3]', 'Governs: [INV-3], [INV-1]']]) {
    const repo = decided(t, { '0001-local-dates': LOCAL });
    edit(repo, L1, from, to);
    commit(repo, 'Rethink the dates');
    hint(check(repo, '--all'), 'not ok', /\b0001\b/);
    strict(repo, 1);
  }
});

test('C5a [LNK-4] an accepted ADR deleted on the branch is not ok, and check --strict exits 1', (t) => {
  const repo = decided(t, { '0001-local-dates': LOCAL });
  repo.git(['rm', '-q', L1]);
  commit(repo, 'Drop the dates ADR');
  hint(check(repo, '--all'), 'not ok', /\b0001\b/);
  strict(repo, 1);
});

test('C5a [LNK-4] contrast, no not ok and check --strict exits 0: a status-only edit (to superseded by, with its successor; to deprecated); an edit to a proposed ADR; an ADR added and then edited on the branch; an edit reverted on the branch', (t) => {
  const cases = {
    'superseded by 0002': (repo) => {
      edit(repo, L1, 'Status: accepted.', 'Status: superseded by [ADR 0002](0002-iso-dates.md).');
      writeAdr(repo, '0002-iso-dates', 'ISO dates', { supersedes: '0001-local-dates', governs: ['INV-3'] });
      commit(repo, 'ISO dates replace local dates');
    },
    deprecated: (repo) => {
      edit(repo, L1, 'Status: accepted.', 'Status: deprecated.');
      commit(repo, 'Deprecate the dates ADR');
    },
    'a proposed ADR edited': (repo) => {
      edit(repo, 'docs/adr/0005-csv-only.md', '- CSV only.', '- CSV and PDF.');
      commit(repo, 'Rethink the export');
    },
    'added, then edited': (repo) => {
      writeAdr(repo, '0006-rows', 'One row per item');
      commit(repo, 'Rows ADR');
      edit(repo, 'docs/adr/0006-rows.md', '- One row per item.', '- One row per line item.');
      commit(repo, 'Rows ADR, clearer');
    },
    'edited, then reverted': (repo) => {
      edit(repo, L1, '- Local dates.', '- Local dates, then ISO.');
      commit(repo, 'Rethink the dates');
      edit(repo, L1, '- Local dates, then ISO.', '- Local dates.');
      commit(repo, 'Back to local dates');
    },
  };
  for (const [name, change] of Object.entries(cases)) {
    const repo = decided(t, { '0001-local-dates': LOCAL, '0005-csv-only': ['CSV only', { status: 'proposed' }] });
    change(repo);
    assert.notEqual(repo.git(['rev-list', '--count', 'main..HEAD']), '0', `the fixture (${name}): the branch has commits`);
    noNotOk(check(repo, '--all'));
    strict(repo, 0);
  }
});

// --- supersede links ---

test('C5a [LNK-4][HNT-3] a one-way supersede link is not ok, and check --strict exits 1: 0002 says it supersedes 0001 while 0001 stays accepted', (t) => {
  const repo = decided(t, { '0001-local-dates': LOCAL });
  writeAdr(repo, '0002-iso-dates', 'ISO dates', { supersedes: '0001-local-dates', governs: ['INV-3'] });
  commit(repo, 'ISO dates');
  hint(check(repo, '--all'), 'not ok', /one[- ]way/, /\b000[12]\b/);
  strict(repo, 1);
});

test('C5a [LNK-4][HNT-3] a one-way supersede link the other way is not ok: 0001 says it is superseded by 0002, which does not say it supersedes 0001', (t) => {
  const repo = decided(t, { '0001-local-dates': LOCAL });
  edit(repo, L1, 'Status: accepted.', 'Status: superseded by [ADR 0002](0002-iso-dates.md).');
  writeAdr(repo, '0002-iso-dates', 'ISO dates', { governs: ['INV-3'] });
  commit(repo, 'ISO dates');
  hint(check(repo, '--all'), 'not ok', /one[- ]way/, /\b000[12]\b/);
  strict(repo, 1);
});

test('C5a [LNK-4] a broken supersede link is not ok: Supersedes names 0009, and Status: superseded by names 0008, neither of which exists', (t) => {
  const sup = decided(t, { '0001-local-dates': LOCAL });
  writeAdr(sup, '0002-iso-dates', 'ISO dates', { supersedes: '0009-gone' });
  commit(sup, 'ISO dates');
  hint(check(sup, '--all'), 'not ok', /broken/, /\b000[29]\b/);
  strict(sup, 1);

  const by = decided(t, { '0001-local-dates': LOCAL });
  edit(by, L1, 'Status: accepted.', 'Status: superseded by [ADR 0008](0008-gone.md).');
  commit(by, 'Local dates are gone');
  hint(check(by, '--all'), 'not ok', /broken/, /\b000[18]\b/);
});

test('C5a [LNK-4] contrast: a two-way supersede link across folders (adrs: decisions holds 0007, docs/adr/0008 supersedes it) is fine', (t) => {
  const repo = decided(t, {}, { config: 'adrs: decisions\n', extra: (r) => writeAdr(r, '0007-rows', 'Rows', { dir: 'decisions' }) });
  edit(repo, 'decisions/0007-rows.md', 'Status: accepted.', 'Status: superseded by [ADR 0008](../docs/adr/0008-rows-per-item.md).');
  repo.write('docs/adr/0008-rows-per-item.md', adr('0008-rows-per-item', 'Rows per item').replace('Decided by: the owner.',
    'Decided by: the owner.\nSupersedes: [ADR 0007](../../decisions/0007-rows.md).'));
  commit(repo, 'Rows per item');
  noNotOk(check(repo, '--all'));
  strict(repo, 0);
});

// --- reused numbers ---

test('C5a [LNK-4][HNT-3] a reused ADR number is not ok: a second 0001 file in docs/adr, and check --strict exits 1', (t) => {
  const repo = decided(t, { '0001-local-dates': LOCAL });
  writeAdr(repo, '0001-other-dates', 'Other dates');
  commit(repo, 'Other dates');
  hint(check(repo, '--all'), 'not ok', /reused/, /\b0001\b/);
  strict(repo, 1);
});

test('C5a [LNK-4] a reused ADR number across folders (decisions/0007 and docs/adr/0007) is not ok', (t) => {
  const repo = decided(t, {}, { config: 'adrs: decisions\n', extra: (r) => writeAdr(r, '0007-rows', 'Rows', { dir: 'decisions' }) });
  writeAdr(repo, '0007-duplicate', 'Duplicate');
  commit(repo, 'Duplicate');
  hint(check(repo, '--all'), 'not ok', /reused/, /\b0007\b/);
});

test('C5a [LNK-4] a number once added under another file name in main\'s history is reused: 0004-old.md added and deleted on main, then 0004-new.md on the branch; a fresh 0006 is fine', (t) => {
  for (const [name, reused] of [['0006-fresh', false], ['0004-new', true]]) {
    const repo = decided(t, { '0001-local-dates': LOCAL });
    repo.git(['checkout', '-q', 'main']);
    writeAdr(repo, '0004-old', 'Old');
    repo.commit('Old ADR', { date: '2026-09-20T13:00:00Z' });
    repo.git(['rm', '-q', 'docs/adr/0004-old.md']);
    repo.commit('Remove the old ADR', { date: '2026-09-20T14:00:00Z' });
    repo.git(['checkout', '-q', 'work']);
    repo.git(['merge', '-q', '--ff-only', 'main']);
    assert.notEqual(repo.git(['log', '--diff-filter=A', '--format=%h', 'main', '--', 'docs/adr/0004-old.md']), '', 'the fixture: main\'s history added 0004-old.md');
    assert.equal(repo.git(['ls-tree', '--name-only', 'HEAD', 'docs/adr/']), 'docs/adr/0001-local-dates.md', 'the fixture: only 0001 is in docs/adr now');
    writeAdr(repo, name, 'New');
    commit(repo, 'New ADR');
    const out = check(repo, '--all');
    if (reused) hint(out, 'not ok', /reused/, /\b0004\b/);
    else noNotOk(out);
  }
});

// --- a superseded ADR cited as current ---

test('C5a [LNK-4][HNT-2] a superseded ADR cited as current is a note: by a baseline section (INV-3) and by the Now of an open request\'s block (tz-dates); not by a request\'s decisions, an archived request, another ADR\'s text, or a section citing the current 0002', (t) => {
  const INV1B = '## [INV-1] Totals\nTotals MUST show two decimals, rounded as ADR 0001 says.\n';
  const INV4 = '## [INV-4] Separator\nThe CSV separator is a comma; dates follow ADR 0002.\n';
  const repo = decided(t, {
    '0001-local-dates': LOCAL,
    '0003-zones': ['Zones', { text: 'Unlike ADR 0001, zones are explicit.' }],
  }, {
    baseline: file(INV1, '## [INV-3] Dates\nDates MUST show in ISO 8601, as ADR 0001 decided.\n', INV4),
    extra: (r) => {
      addRequest(r, 'tz-dates', [block('[INV-1]@1 modify   for R1', { was: INV1, now: INV1B })]);
      addRequest(r, 'old-talk', null, { decisions: '\n## Decisions\n\n- D1, 2026-09-19. Source: the owner. Keep ADR 0001 for now.\n' });
      addRequest(r, 'archived-dates', [block('[INV-3]@1 modify   for R2', { was: S0, now: '## [INV-3] Dates\nDates MUST show in ISO 8601, as ADR 0001 decided.\n' })],
        { dir: 'requests/archive/archived-dates', status: 'concluded' });
    },
  });
  edit(repo, L1, 'Status: accepted.', 'Status: superseded by [ADR 0002](0002-iso-dates.md).');
  writeAdr(repo, '0002-iso-dates', 'ISO dates', { supersedes: '0001-local-dates', governs: ['INV-3'] });
  commit(repo, 'ISO dates replace local dates');

  strict(repo, 0);
  const out = check(repo, '--all');
  hint(out, 'note', /superseded/, /\b0001\b/, /\bINV-3\b|specs\/invoices\.md/);
  hint(out, 'note', /superseded/, /\b0001\b/, 'tz-dates');
  noHint(out, 'note', 'old-talk');
  noHint(out, 'note', 'archived-dates');
  noHint(out, 'note', /\b0003\b/);
  noHint(out, 'note', /superseded/, 'INV-4');
});

// --- an ADR left proposed at a request's conclusion ---

// Main: the baseline (INV-3 consolidated for inv); inv, whose block is
// consolidated; other, open. The branch adds the ADR 0002 (`opts`) in a
// commit with the Request line `by` (none when undefined), then, when
// `archive`, concludes inv and commits.
function concluding(t, opts, { by, archive = true } = {}) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S1));
  addRequest(repo, 'inv', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  addRequest(repo, 'other', null);
  repo.commit('Records', { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'conclude-inv']);
  writeAdr(repo, '0002-iso-dates', 'ISO dates', opts);
  repo.commit(message('ISO dates ADR', { request: by, tier: '2 — ISO dates' }), { date: '2026-09-21T12:00:00Z' });
  if (archive) {
    const r = runAl(repo.dir, ['conclude', 'inv', '--yes'], { env: ENV });
    assert.equal(r.code, 0, `the fixture: inv concludes:\n${both(r)}`);
    repo.commit(message('Conclude inv', { request: 'inv', tier: '2 — ISO dates' }), { date: '2026-09-22T12:00:00Z' });
  }
  return repo;
}

test('C5a [LNK-4][HNT-2] a request archived on the branch with an ADR it added still proposed is a note naming the ADR: added by its Request line, or by the commit that added it', (t) => {
  hint(check(concluding(t, { status: 'proposed', request: 'inv' }), '--all'), 'note', /proposed/, /\b0002\b/);
  hint(check(concluding(t, { status: 'proposed' }, { by: 'inv' }), '--all'), 'note', /proposed/, /\b0002\b/);
});

test('C5a [LNK-4][HNT-2] contrast, no "proposed" note: the ADR accepted; the request not archived; the proposed ADR added by another request', (t) => {
  noHint(check(concluding(t, { status: 'accepted', request: 'inv' }), '--all'), /proposed/);
  noHint(check(concluding(t, { status: 'proposed', request: 'inv' }, { archive: false }), '--all'), /proposed/);
  noHint(check(concluding(t, { status: 'proposed', request: 'other' }), '--all'), /proposed/);
});
