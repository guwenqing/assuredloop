// al context <name> for an archived request [VW-6]: one line per held
// section, "as at conclusion" when today's baseline section equals its text
// at the concluding commit on main [STA-8], else "since changed by <request>
// (<date>)" from blame of today's section lines, taking commits after the
// concluding one [LNK-2]; a request archived only on this branch compares
// with the working tree. A "Followed by" line lists the requests whose status
// line has "Follows: <name>" [LNK-2]. Still no Spec line and no "differs".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, cloneRepo, runAl } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { addRequest, both, lineWith, statusLine } from './helpers/request.js';
import { file, says, squashMerge } from './helpers/links.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const S2 = '## [INV-3] Dates\nDates MUST show in ISO 8601, with the time zone.\n';
const INV7 = '## [INV-7] CSV rows\nOne row per line item.\n';
const OUTCOME = '\n## Outcome\n\n' +
  '- R1 Invoice export: in [INV-7]\n- R2 Dates: in [INV-3]\n- R3 Email link: in no section\n' +
  '- Added: [INV-7]\n- Modified: [INV-3]\n- Removed: none\n- Dropped: none\n- Kept: none\n' +
  '- Decisions: D1, D3, D4\n- Agent rulings: D2\n';

const has = (out, ...parts) => assert.ok(lineWith(out, ...parts), `expected a line with ${parts.map(String).join(' and ')}:\n${out}`);
const hasNo = (out, ...parts) => assert.ok(!lineWith(out, ...parts), `expected no line with ${parts.map(String).join(' and ')}:\n${out}`);
// The section `id` said to be `word` (a string or RegExp), or not.
const is = (out, id, word) => assert.ok(says(out, id, word), `expected ${id} to read ${word}:\n${out}`);
const isNot = (out, id, word) => assert.ok(!says(out, id, word), `expected ${id} not to read ${word}:\n${out}`);
function context(repo, name = 'iso-dates') {
  const r = runAl(repo.dir, ['context', name]);
  assert.equal(r.code, 0, both(r));
  assertFrame(r.stdout);
  assert.ok(!lines(r.stdout).some((l) => /^Spec\b/.test(l)), `no Spec line for an archived request:\n${r.stdout}`);
  assert.ok(!r.stdout.includes('differs'), `an archived request is not checked against today's baseline:\n${r.stdout}`);
  return r.stdout;
}

// Archived by hand, as conclude leaves it: the folder moved, the Status set, an Outcome.
function archiveByHand(repo, name) {
  mkdirSync(join(repo.dir, 'requests/archive'), { recursive: true });
  repo.git(['mv', `requests/${name}`, `requests/archive/${name}`]);
  const md = repo.read(`requests/archive/${name}/request.md`).toString().replace('Status: open', 'Status: concluded');
  repo.write(`requests/archive/${name}/request.md`, md + OUTCOME);
}

// iso-dates holds INV-3 and INV-7. A branch consolidates both and archives
// it; main takes it as a squash on 2026-09-23, the concluding commit.
function concluded(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  addRequest(repo, 'iso-dates', [
    block('[INV-3]@1 modify   for R2', { was: S0, now: S1 }),
    block('[INV-7]@1 add in specs/invoices.md   for R1', { now: INV7 }),
  ]);
  repo.commit('iso-dates: request\n\nRequest: iso-dates', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'iso-dates-part-1']);
  repo.write('specs/invoices.md', file(INV1, S1, INV7));
  archiveByHand(repo, 'iso-dates');
  repo.commit('Consolidate and conclude\n\nRequest: iso-dates', { date: '2026-09-22T12:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  const squash = squashMerge(repo, 'iso-dates-part-1', '2026-09-23T12:00:00Z');
  repo.git(['branch', '-q', '-D', 'iso-dates-part-1']);
  assert.equal(repo.git(['log', '--diff-filter=A', '--format=%H', '--', 'requests/archive/iso-dates/request.md']), squash,
    'the fixture: the squash added the archived request.md on main');
  return repo;
}

// tz-dates, which follows iso-dates, changes INV-3 on main on 2026-10-05.
function laterChange(repo) {
  addRequest(repo, 'tz-dates', [block('[INV-3]@1 modify   for R2', { was: S1, now: S2 })], { line: `${statusLine('open')} · Follows: iso-dates` });
  repo.write('specs/invoices.md', file(INV1, S2, INV7));
  return repo.commit('Time zone in dates\n\nRequest: tz-dates', { date: '2026-10-05T12:00:00Z' });
}

test('[VW-6][STA-8] an archived request with nothing changed since: each held section reads "as at conclusion"', (t) => {
  const out = context(concluded(t));
  is(out, 'INV-3', 'as at conclusion');
  is(out, 'INV-7', 'as at conclusion');
  assert.ok(!out.includes('since changed'), out);
});

test('[VW-6][LNK-2] after a later request changes INV-3: "since changed by tz-dates (2026-10-05)" on INV-3, from blame; INV-7 is still "as at conclusion"', (t) => {
  const repo = concluded(t);
  const later = laterChange(repo);
  assert.equal(repo.git(['blame', '-w', '-M', '--porcelain', '-L', '5,5', 'HEAD', '--', 'specs/invoices.md']).slice(0, 40), later,
    'the fixture: INV-3\'s body line blames to the tz-dates commit');
  const out = context(repo);
  is(out, 'INV-3', /since changed by tz-dates \(2026-10-05/);
  isNot(out, 'INV-3', 'as at conclusion');
  is(out, 'INV-7', 'as at conclusion');
  isNot(out, 'INV-7', 'since changed');
});

test('[VW-6][LNK-2] "since changed by" names only requests whose commits come after the concluding one: INV-3 names tz-dates, not iso-dates, whose earlier commit still holds its heading line', (t) => {
  const repo = concluded(t);
  const later = laterChange(repo);
  const first = repo.git(['log', '--format=%H', '--fixed-strings', '--grep=iso-dates: request']);
  const line = (n) => repo.git(['blame', '-w', '-M', '--porcelain', '-L', `${n},${n}`, 'HEAD', '--', 'specs/invoices.md']).slice(0, 40);
  assert.equal(line(4), first, 'the fixture: INV-3\'s heading blames to "iso-dates: request", from before the conclusion');
  assert.equal(line(5), later, 'the fixture: INV-3\'s body line blames to the tz-dates commit');
  const out = context(repo);
  is(out, 'INV-3', /since changed by tz-dates \(2026-10-05/);
  isNot(out, 'INV-3', /iso-dates/);
});

test('[VW-6][LNK-2] "Followed by" lists the open and the archived requests whose status line has "Follows: iso-dates", and not "Follows: iso-dates-old"', (t) => {
  const repo = concluded(t);
  laterChange(repo);
  addRequest(repo, 'sydney-dates', null, { dir: 'requests/archive/sydney-dates', line: `${statusLine('concluded')} · Follows: iso-dates` });
  addRequest(repo, 'csv-rows', null, { line: `${statusLine('open')} · Follows: iso-dates-old` });
  repo.commit('More requests', { date: '2026-10-06T12:00:00Z' });
  const out = context(repo);
  has(out, /Followed by/, 'tz-dates', 'sydney-dates');
  hasNo(out, /Followed by/, 'csv-rows');
});

test('[VW-6] a request archived only on this branch compares with the working tree: "as at conclusion", though main has since changed INV-3', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  addRequest(repo, 'iso-dates', [
    block('[INV-3]@1 modify   for R2', { was: S0, now: S1 }),
    block('[INV-7]@1 add in specs/invoices.md   for R1', { now: INV7 }),
  ]);
  repo.commit('iso-dates: request\n\nRequest: iso-dates', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'iso-dates-part-1']);
  repo.write('specs/invoices.md', file(INV1, S1, INV7));
  archiveByHand(repo, 'iso-dates');
  repo.commit('Consolidate and conclude\n\nRequest: iso-dates', { date: '2026-09-22T12:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  repo.write('specs/invoices.md', file(INV1, '## [INV-3] Dates\nDates MUST show in RFC 3339.\n'));
  repo.commit('RFC dates\n\nRequest: rfc-dates', { date: '2026-09-25T12:00:00Z' });
  repo.git(['checkout', '-q', 'iso-dates-part-1']);

  const out = context(repo);
  is(out, 'INV-3', 'as at conclusion');
  is(out, 'INV-7', 'as at conclusion');
  assert.ok(!out.includes('since changed') && !out.includes('rfc-dates'), `main's later change is not in this working tree:\n${out}`);
});

test('[VW-6][VW-9] in a shallow clone that lacks the concluding commit, the section lines say "history unavailable", not what changed them', (t) => {
  const repo = concluded(t);
  laterChange(repo);
  const clone = cloneRepo(t, repo, { depth: 1 });
  assert.equal(clone.git(['rev-parse', '--is-shallow-repository']), 'true');
  assert.equal(clone.git(['rev-list', '--count', 'HEAD']), '1', 'the fixture clone holds only the tz-dates commit');
  const r = runAl(clone.dir, ['context', 'iso-dates']);
  assert.equal(r.code, 0, both(r));
  assertFrame(r.stdout, { main: 'origin/main' });
  is(r.stdout, 'INV-3', 'history unavailable');
  assert.ok(!r.stdout.includes('since changed by'), r.stdout);
  assert.doesNotMatch(r.stdout, /nothing found/i);
});
