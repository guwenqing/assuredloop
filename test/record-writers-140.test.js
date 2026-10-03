// Issue #140, what conclude, consolidate and the record writers print and
// write. Built from the issue's items and the architect's rulings; nothing
// here reads the code under test.
// (7) conclude prints three lines or fewer before Read, Next and Not known,
//     refusals included: many reasons are grouped, none left out [STA-7].
// (8) Previews show the text they would write [TL-1] [STA-4] [STA-7]:
//     consolidate shows, under each "Would write" line, the section it
//     writes (the block's Now; the Was for --revert; a remove keeps its one
//     line), and with --yes the same under "Wrote"; conclude shows the
//     generated Outcome lines and the Status joined on one line with ' · '.
// (12) A decision written `- D1 (2026-09-30). …`, with no comma, is read by
//     every writer: record decision writes D2, conclude --dropped D1 and
//     record section --decision D1 accept it [REC-7].
// (13) record part continues a `-` list as the third part, as context counts
//     it, not as `1.` [REC-8].
// (14a) record section <P-n> for an ID in neither the baseline nor the
//     request refuses, naming the next free ID for P (one more than the
//     highest ever used, history included) and the heading to write, not
//     al spec --add-ids [SPC-2] [SPC-3].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { ENV, ORG, addRequest, both, outcome } from './helpers/request.js';
import { file } from './helpers/links.js';
import { writeAdr } from './helpers/evidence.js';
import { viewHints, hint } from './helpers/hints.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const INV1B = '## [INV-1] Totals\nTotals MUST show three decimals.\n';
const INV2 = '## [INV-2] Format\nThe export format is CSV.\n';
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const INV4A = '## [INV-4] Separator\nThe CSV separator is a comma.\n';
const INV4B = '## [INV-4] Separator\nThe CSV separator MUST be a semicolon.\n';
const INV8 = '## [INV-8] Export page\nThe invoice page MUST offer the export.\n';

const al = (repo, ...args) => runAl(repo.dir, args, { env: ENV });
const ok = (r, what) => assert.equal(r.code, 0, `${what}:\n${both(r)}`);
const clean = (repo) => assert.equal(repo.git(['status', '--porcelain']), '', 'nothing should be written');
// The lines above the frame (Read, Next, Not known).
const body = (out) => lines(out).filter((l) => !/^(Read|Next|Not known)\b/.test(l));
const assertThree = (r, what) => {
  assertFrame(r.stdout);
  assert.ok(body(r.stdout).length <= 3, `${what}: three lines or fewer above Read, Next and Not known (${body(r.stdout).length}):\n${r.stdout}`);
};

// A committed repo: specs/invoices.md holding `baseline`, the request inv holding `blocks`.
function setup(t, blocks, baseline, opts = {}) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', baseline);
  addRequest(repo, 'inv', blocks, opts);
  repo.commit('setup', { date: '2026-09-21T12:00:00Z' });
  return repo;
}

// --- (7) conclude in three lines ---

test('#140 item 7 [STA-7] a conclude refused for many reasons at once (blocked, a block that breaks [SPC-5], two held blocks pending) prints three lines or fewer, and names every reason; with --yes too', (t) => {
  const repo = setup(t, [
    block('[INV-1]@1 modfiy   for R1', { was: INV1, now: INV1B }),
    block('[INV-3]@1 modify   for R2', { was: S0, now: S1 }),
    block('[INV-4]@1 modify   for R1', { was: INV4A, now: INV4B }),
  ], file(INV1, S0, INV4A), { signed: false });
  for (const args of [[], ['--yes']]) {
    const r = al(repo, 'conclude', 'inv', ...args);
    assert.equal(r.code, 1, `conclude ${args.join(' ')} refuses:\n${both(r)}`);
    assertThree(r, `conclude ${args.join(' ')}`);
    const text = body(r.stdout).join('\n');
    assert.match(text, /\bblocked\b/, `the blocked reason:\n${text}`);
    assert.match(text, /"modfiy" is not an op/, `the [SPC-5] fault of INV-1@1:\n${text}`);
    assert.ok(text.includes('[SPC-5]'), `the [SPC-5] fault cites it:\n${text}`);
    assert.match(text, /\bINV-3@1 pending\b/, `INV-3@1, not consolidated:\n${text}`);
    assert.match(text, /\bINV-4@1 pending\b/, `INV-4@1, not consolidated:\n${text}`);
    clean(repo);
  }
});

// inv, signed, with INV-3 consolidated; an open child named in its parts and a
// proposed ADR it added, so conclude has notes to give.
function withNotes(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S1));
  addRequest(repo, 'inv', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })], { rest: '\n## Parts\n\n1. Dates: request iso-child\n' });
  addRequest(repo, 'iso-child', null);
  writeAdr(repo, '0001-iso-dates', 'ISO dates', { status: 'proposed', request: 'inv' });
  repo.commit('setup\n\nRequest: inv', { date: '2026-09-21T12:00:00Z' });
  return repo;
}

test('#140 item 7 [STA-7] conclude with notes to give (an open child, a proposed ADR): the preview and the --yes run each print three lines or fewer', (t) => {
  const repo = withNotes(t);
  const preview = al(repo, 'conclude', 'inv');
  ok(preview, 'conclude inv');
  assertThree(preview, 'the preview');
  assert.match(preview.stdout, /iso-child/, `the fixture: a note names the open child:\n${preview.stdout}`);
  const r = al(repo, 'conclude', 'inv', '--yes');
  ok(r, 'conclude inv --yes');
  assertThree(r, 'the --yes run');
});

// --- (8) previews show the text they would write ---

test('#140 item 8 [TL-1][STA-7] conclude\'s preview shows the generated Outcome lines and the Status on one line, joined with \' · \', in three lines or fewer', (t) => {
  const repo = withNotes(t);
  const preview = al(repo, 'conclude', 'inv');
  ok(preview, 'conclude inv');
  ok(al(repo, 'conclude', 'inv', '--yes'), 'conclude inv --yes');
  const generated = outcome(repo.read('requests/archive/inv/request.md').toString()).generated.map((l) => l.replace(/^- /, ''));
  assert.ok(generated.some((g) => g.startsWith('R2 ') && g.includes('in [INV-3]')) && generated.includes('Modified: [INV-3]'),
    `the fixture: the Outcome gives R2 in [INV-3] and Modified: [INV-3]:\n${generated.join('\n')}`);
  const joined = body(preview.stdout).find((l) => generated.every((g) => l.includes(g)));
  assert.ok(joined, `one line of the preview should hold every generated Outcome line:\n${generated.join('\n')}\npreview:\n${preview.stdout}`);
  assert.ok(joined.includes('Status: concluded'), `the same line gives the Status:\n${joined}`);
  assert.ok(joined.includes(' · '), `joined with ' · ':\n${joined}`);
  assertThree(preview, 'the preview');
});

// The section lines under `head`: the non-blank lines after the line of `out`
// that starts with `word` and names [id], as many as `section` has, trimmed.
function under(out, word, id, section) {
  const ls = lines(out);
  const at = ls.findIndex((l) => l.startsWith(`${word} `) && l.includes(`[${id}]`));
  assert.ok(at >= 0, `expected a line starting "${word}" naming [${id}]:\n${out}`);
  const want = section.split('\n').filter((l) => l.trim());
  return { line: ls[at], got: ls.slice(at + 1).filter((l) => l.trim()).slice(0, want.length).map((l) => l.trim()), want };
}

// Main: INV-1, INV-2, INV-3 (S0); inv holds a modify of INV-3, an add of
// INV-8 after it and a remove of INV-2, all pending.
const THREE_OPS = [
  block('[INV-3]@1 modify   for R2', { was: S0, now: S1 }),
  block('[INV-8]@1 add after [INV-3]   for R1', { now: INV8 }),
  block('[INV-2]@1 remove, was after [INV-1]   for R1', { was: INV2 }),
];

test('#140 item 8 [TL-1][STA-4] consolidate\'s preview shows under each "Would write" line the section it writes, the block\'s Now; a remove keeps its one line; with --yes the same lines start "Wrote"', (t) => {
  const repo = setup(t, THREE_OPS, file(INV1, INV2, S0));
  for (const [args, word] of [[[], 'Would write'], [['--yes'], 'Wrote']]) {
    const r = al(repo, 'consolidate', 'inv', ...args);
    ok(r, `consolidate inv ${args.join(' ')}`);
    assertFrame(r.stdout);
    for (const [id, now] of [['INV-3', S1], ['INV-8', INV8]]) {
      const { line, got, want } = under(r.stdout, word, id, now);
      assert.deepEqual(got, want, `under "${line}", the Now of inv/${id}@1:\n${r.stdout}`);
    }
    assert.ok(lines(r.stdout).some((l) => l.startsWith(`${word} `) && l.includes('[INV-2]')), `a "${word}" line for the removal of INV-2:\n${r.stdout}`);
    assert.ok(!r.stdout.includes('The export format is CSV.'), `a remove keeps its one line; the removed text is not shown:\n${r.stdout}`);
    if (!args.length) clean(repo);
  }
  assert.equal(repo.read('specs/invoices.md').toString().includes('[INV-8]'), true, 'the fixture: --yes wrote');
});

test('#140 item 8 [TL-1][STA-4] consolidate --revert\'s preview shows under its "Would write" line the Was it puts back; with --yes the same under "Wrote"', (t) => {
  const repo = setup(t, [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })], file(INV1, S1));
  for (const [args, word] of [[[], 'Would write'], [['--yes'], 'Wrote']]) {
    const r = al(repo, 'consolidate', 'inv', '--revert', 'INV-3', ...args);
    ok(r, `consolidate inv --revert INV-3 ${args.join(' ')}`);
    const { line, got, want } = under(r.stdout, word, 'INV-3', S0);
    assert.deepEqual(got, want, `under "${line}", the Was of inv/INV-3@1:\n${r.stdout}`);
    if (!args.length) clean(repo);
  }
  assert.equal(repo.read('specs/invoices.md').toString(), file(INV1, S0), 'the fixture: --yes put the Was back');
});

// --- (12) a decision with no comma after its number ---

const NO_COMMA = '\n## Decisions\n\n- D1 (2026-09-30). Source: the owner. Keep the ISO dates in the export.\n';

test('#140 item 12 pin [REC-7] a decision written "- D1 (2026-09-30). Source: the owner. …" is read: context\'s Decided line names D1 2026-09-30', (t) => {
  const repo = setup(t, null, file(INV1, S0), { decisions: NO_COMMA });
  const r = al(repo, 'context', 'inv');
  ok(r, 'context inv');
  const decided = lines(r.stdout).find((l) => /^Decided\b/.test(l)) ?? '';
  assert.match(decided, /\bD1 2026-09-30\b/, `the Decided line:\n${r.stdout}`);
});

test('#140 item 12 [REC-7] after "- D1 (2026-09-30). …", al record inv decision --yes writes D2, not a second D1', (t) => {
  const repo = setup(t, null, file(INV1, S0), { decisions: NO_COMMA });
  ok(al(repo, 'record', 'inv', 'decision', '--source', 'the owner', '--text', 'Semicolons as separator.', '--yes'), 'record decision --yes');
  const md = repo.read('requests/inv/request.md').toString();
  assert.match(md, /^- D2, \d{4}-\d\d-\d\d\. Source: the owner\. Semicolons as separator\.$/m, `D2 is written:\n${md}`);
  assert.equal(md.match(/^- D1\b/gm).length, 1, `one D1 only:\n${md}`);
});

test('#140 item 12 [REC-7] al conclude inv --dropped D1 accepts the comma-less D1: it previews the drop (exit 0), not "name an entry of ## Decisions"', (t) => {
  const repo = setup(t, null, file(INV1, S0), { decisions: NO_COMMA });
  const r = al(repo, 'conclude', 'inv', '--dropped', 'D1');
  ok(r, 'conclude inv --dropped D1');
  assert.doesNotMatch(both(r), /name an entry of ## Decisions/, both(r));
  assertFrame(r.stdout);
  clean(repo);
});

test('#140 item 12 [REC-7][STA-5] al record inv section INV-3 --decision D1 accepts the comma-less D1 when inv already holds INV-3: it marks INV-3@1 Revised (D1) and adds INV-3@2', (t) => {
  const repo = setup(t, [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })], file(INV1, S0), { decisions: NO_COMMA });
  ok(al(repo, 'record', 'inv', 'section', 'INV-3', '--decision', 'D1', '--yes'), 'record section --decision D1 --yes');
  const change = repo.read('requests/inv/change.md').toString();
  assert.match(change, /^### \[INV-3\]@1 modify .*Revised \d{4}-\d\d-\d\d \(D1\)/m, `INV-3@1 marked Revised (D1):\n${change}`);
  assert.match(change, /^### \[INV-3\]@2 modify/m, `INV-3@2 added:\n${change}`);
});

// --- (13) record part continues the list as it is written ---

// invoice-download with `parts`, and the open request csv-child.
function withParts(t, parts) {
  const repo = makeRepo(t);
  addRequest(repo, 'invoice-download', null, { rest: `\n## Parts\n\n${parts}` });
  addRequest(repo, 'csv-child', null);
  repo.commit('Requests', { date: '2026-09-21T12:00:00Z' });
  ok(al(repo, 'record', 'invoice-download', 'part', '--text', 'request csv-child', '--yes'), 'record part --yes');
  return repo;
}
// The ## Parts entries of invoice-download's request.md.
const partLines = (repo) => {
  const md = repo.read('requests/invoice-download/request.md').toString();
  return md.slice(md.indexOf('## Parts')).split('\n').slice(1).filter((l) => l.trim());
};
const childNote = (repo) => {
  const r = al(repo, 'context', 'invoice-download', '--all');
  ok(r, 'context invoice-download --all');
  return viewHints(r.stdout).filter((l) => l.includes('names request csv-child'));
};

test('#140 item 13 [REC-8] ## Parts written with - bullets: record part adds "request csv-child" as the third entry, not as "1."; context calls it part 3', (t) => {
  const repo = withParts(t, '- CSV export\n- Email link\n');
  const parts = partLines(repo);
  assert.deepEqual(parts.slice(0, 2), ['- CSV export', '- Email link'], parts.join('\n'));
  assert.equal(parts.length, 3, parts.join('\n'));
  assert.ok(['- request csv-child', '3. request csv-child'].includes(parts[2]), `the third entry continues the list, "- " or "3.", never "1.":\n${parts.join('\n')}`);
  const [note] = childNote(repo);
  assert.ok(note && note.includes('part 3 names request csv-child: '), `context: part 3 names request csv-child:\n${note}`);
});

test('#140 item 13 pin [REC-8] ## Parts numbered 1. and 2.: record part adds "3. request csv-child"; context calls it part 3', (t) => {
  const repo = withParts(t, '1. CSV export\n2. Email link\n');
  assert.deepEqual(partLines(repo), ['1. CSV export', '2. Email link', '3. request csv-child']);
  const [note] = childNote(repo);
  assert.ok(note && note.includes('part 3 names request csv-child: '), `context: part 3 names request csv-child:\n${note}`);
});

// --- (14a) the next free ID for a new section ---

const PAY = (n) => `## [PAY-${n}] Rule ${n}\nPayments rule ${n} holds.\n`;

// The refusal of al record refunds section PAY-3: exit 2, naming [PAY-<next>]
// and the heading to write, not al spec --add-ids; nothing written.
function assertNextFree(repo, next) {
  for (const args of [[], ['--yes']]) {
    const r = al(repo, 'record', 'refunds', 'section', 'PAY-3', ...args);
    assert.equal(r.code, 2, `record section PAY-3 ${args.join(' ')} refuses:\n${both(r)}`);
    assert.ok(both(r).includes(`[PAY-${next}]`), `it should name the next free ID, [PAY-${next}]:\n${both(r)}`);
    assert.ok(both(r).includes(`### [PAY-${next}]@1 add in `), `it should give the heading to write, ### [PAY-${next}]@1 add in …:\n${both(r)}`);
    assert.doesNotMatch(both(r), /--add-ids/, `al spec --add-ids refuses change.md:\n${both(r)}`);
    clean(repo);
  }
}

test('#140 item 14a [SPC-2][SPC-3] record refunds section PAY-3, in neither the baseline nor refunds, refuses (exit 2), naming the next free ID PAY-8: PAY-7 was in the baseline and was removed since', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/pay.md', file(PAY(1), PAY(2), PAY(7)));
  repo.commit('Payments', { date: '2026-09-20T12:00:00Z' });
  repo.write('specs/pay.md', file(PAY(1), PAY(2)));
  addRequest(repo, 'refunds', null);
  repo.commit('PAY-7 removed; refunds', { date: '2026-09-21T12:00:00Z' });
  assertNextFree(repo, 8);
});

test('#140 item 14a [SPC-3] the next free ID counts every change.md: another open request adding PAY-9 makes it PAY-10', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/pay.md', file(PAY(1), PAY(2)));
  addRequest(repo, 'refunds', null);
  addRequest(repo, 'payouts', [block('[PAY-9]@1 add in specs/pay.md   for R1', { now: PAY(9) })]);
  repo.commit('Payments, refunds and payouts', { date: '2026-09-21T12:00:00Z' });
  assertNextFree(repo, 10);
});
