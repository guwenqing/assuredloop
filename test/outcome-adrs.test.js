// The Outcome's ADRs [REC-9][LNK-4]: al conclude <name> --yes writes two more
// generated lines, "- ADRs added: <numbers or none>" and "- ADRs superseded:
// <numbers or none>". An ADR the request added is one whose Request: line
// names it, or whose file was added in a commit that maps to it [LNK-2] (a
// Request: line, else the request folder it touched); the ADRs superseded
// are those the added ones supersede. An added ADR still proposed is marked
// "(proposed)", and conclude prints a note naming it [HNT-2]. The Outcome
// still lists no commit IDs. Acceptance C5a.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { assertFrame } from './helpers/output.js';
import { block } from './helpers/change.js';
import { addRequest, both, lineWith, outcome } from './helpers/request.js';
import { file } from './helpers/links.js';
import { writeAdr } from './helpers/evidence.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const ENV = { SOURCE_DATE_EPOCH: '1790206200' };

// Main: the baseline, INV-3 consolidated for inv; ADR 0001 accepted; the
// requests inv and other. The branch conclude-inv then starts.
function records(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S1));
  writeAdr(repo, '0001-local-dates', 'Local dates', { governs: ['INV-3'] });
  addRequest(repo, 'inv', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  addRequest(repo, 'other', null);
  repo.commit('Records', { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'conclude-inv']);
  return repo;
}
const conclude = (repo) => runAl(repo.dir, ['conclude', 'inv', '--yes'], { env: ENV });
const archived = (repo) => outcome(repo.read('requests/archive/inv/request.md').toString()).generated;
// The generated line starting with `label`.
function line(generated, label) {
  const l = generated.find((x) => x.startsWith(label));
  assert.ok(l, `expected a generated line starting with "${label}":\n${generated.join('\n')}`);
  return l;
}
// The entry of ADR `n` on a line: from its number to the next other number.
const entry = (l, n) => {
  const at = l.search(new RegExp(`\\b${n}\\b`));
  return at < 0 ? '' : n + l.slice(at + n.length).split(new RegExp(`\\b(?!${n}\\b)\\d{4}\\b`))[0];
};
// The ADR numbers on a line, each once, sorted.
const numbers = (l) => [...new Set([...l.matchAll(/\b\d{4}\b/g)].map((m) => m[0]))].sort();

test('C5a [REC-9][LNK-4] the Outcome lists the ADRs inv added (by the commit\'s Request line, by the ADR\'s own Request line, by the request folder the commit touched) and the ADR they supersede; not ADRs of another request', (t) => {
  const repo = records(t);
  const l1 = repo.read('docs/adr/0001-local-dates.md').toString();
  repo.write('docs/adr/0001-local-dates.md', l1.replace('Status: accepted.', 'Status: superseded by [ADR 0002](0002-iso-dates.md).'));
  writeAdr(repo, '0002-iso-dates', 'ISO dates', { supersedes: '0001-local-dates', governs: ['INV-3'] });
  repo.commit('ISO dates\n\nRequest: inv', { date: '2026-09-21T12:00:00Z' });
  writeAdr(repo, '0003-zones', 'Zones', { status: 'proposed', request: 'inv' });
  repo.commit('Draft the zones ADR', { date: '2026-09-21T13:00:00Z' });
  writeAdr(repo, '0004-pdf', 'PDF export', { status: 'proposed', request: 'other' });
  repo.commit('PDF idea', { date: '2026-09-21T14:00:00Z' });
  writeAdr(repo, '0005-csv', 'CSV only');
  repo.commit('CSV\n\nRequest: other', { date: '2026-09-21T15:00:00Z' });
  writeAdr(repo, '0006-rows', 'One row per item');
  repo.write('requests/inv/notes.md', 'Rows decided in ADR 0006.\n');
  repo.commit('Rows', { date: '2026-09-21T16:00:00Z' });

  const r = conclude(repo);
  assert.equal(r.code, 0, both(r));
  assertFrame(r.stdout);
  const g = archived(repo);
  const added = line(g, '- ADRs added:');
  assert.deepEqual(numbers(added), ['0002', '0003', '0006'], `ADRs added by inv:\n${g.join('\n')}`);
  assert.deepEqual(numbers(line(g, '- ADRs superseded:')), ['0001'], `ADRs superseded by inv's:\n${g.join('\n')}`);
});

test('C5a [REC-9][HNT-2] an ADR inv added that is still proposed is marked (proposed) in the Outcome, and conclude prints a note naming it; a proposed ADR of another request gets neither', (t) => {
  const repo = records(t);
  writeAdr(repo, '0002-iso-dates', 'ISO dates', { request: 'inv', governs: ['INV-3'] });
  writeAdr(repo, '0003-zones', 'Zones', { status: 'proposed', request: 'inv' });
  writeAdr(repo, '0004-pdf', 'PDF export', { status: 'proposed', request: 'other' });
  repo.commit('ADRs', { date: '2026-09-21T12:00:00Z' });

  const r = conclude(repo);
  assert.equal(r.code, 0, both(r));
  assertFrame(r.stdout);
  const added = line(archived(repo), '- ADRs added:');
  assert.match(entry(added, '0003'), /\bproposed\b/, `0003 is marked proposed:\n${added}`);
  assert.ok(entry(added, '0002') && !/\bproposed\b/.test(entry(added, '0002')), `0002 is listed, and accepted:\n${added}`);
  assert.ok(!/\b0004\b/.test(added), `0004 is other's:\n${added}`);
  assert.ok(lineWith(both(r), /\bnote\b/, /\b0003\b/, /proposed/), `conclude prints a note naming the proposed 0003:\n${both(r)}`);
  assert.ok(!lineWith(both(r), /\bnote\b/, /\b0004\b/), `no note for other's 0004:\n${both(r)}`);
});

test('C5a [REC-9] with no ADR added or superseded, the Outcome says none on both lines, and conclude gives no proposed note', (t) => {
  const repo = records(t);
  const r = conclude(repo);
  assert.equal(r.code, 0, both(r));
  const g = archived(repo);
  assert.match(line(g, '- ADRs added:'), /:\s*none\s*$/, g.join('\n'));
  assert.match(line(g, '- ADRs superseded:'), /:\s*none\s*$/, g.join('\n'));
  assert.ok(!lineWith(both(r), /proposed/), `no proposed note:\n${both(r)}`);
});

test('C5a [REC-9] the Outcome with its ADR lines still lists no commit IDs', (t) => {
  const repo = records(t);
  writeAdr(repo, '0002-iso-dates', 'ISO dates', { status: 'proposed', governs: ['INV-3'] });
  repo.commit('ISO dates\n\nRequest: inv', { date: '2026-09-21T12:00:00Z' });
  assert.equal(conclude(repo).code, 0);
  const g = archived(repo);
  line(g, '- ADRs added:');
  const text = g.join('\n');
  for (const c of repo.git(['rev-list', '--all']).split('\n')) {
    assert.ok(!text.includes(c.slice(0, 7)), `the Outcome lists commit ${c.slice(0, 7)}:\n${text}`);
  }
});
