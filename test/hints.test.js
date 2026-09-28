// How hints are written [HNT-1]: ranked, not ok before note, then those that
// count before information [HNT-3], then in [HNT-2]'s list order. check
// shows at most five, al context <name> the three its request owns, and
// al context --diff three of the list check makes; when more exist, "N more
// hidden, --all" (in the context views, on the last hint line, within
// [VW-2]'s twelve lines); --all shows every one, in all three. Each names the
// section, request, path or commit involved, and a command.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl, sha256 } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { addRequest, both } from './helpers/request.js';
import { contextOf, file, says } from './helpers/links.js';
import { COMMAND, check, checkHints, hint, kindOf, message, namesThing, viewHints } from './helpers/hints.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const S2 = '## [INV-3] Dates\nDates MUST show in ISO 8601, with the time zone.\n';
const INV4A = '## [INV-4] Separator\nThe CSV separator is a comma.\n';
const INV4B = '## [INV-4] Separator\nThe CSV separator MUST be a semicolon.\n';
const INV4C = '## [INV-4] Separator\nThe CSV separator MUST be a tab.\n';
const CALL = 'The owner called about the dates.\n';

const run = (repo, ...args) => {
  const r = runAl(repo.dir, args);
  assert.equal(r.code, 0, `al ${args.join(' ')}:\n${both(r)}`);
  return r.stdout;
};
const at = (hints, kind, ...parts) => {
  const i = hints.findIndex((l) => kindOf(l) === kind && parts.every((p) => (p instanceof RegExp ? p.test(l) : l.includes(p))));
  assert.ok(i >= 0, `expected a "${kind}:" hint with ${parts.map(String).join(' and ')}:\n${hints.join('\n')}`);
  return i;
};

// Main: iso-dates (signed) holds INV-3, which the baseline has at neither its
// Was nor its Now, and one of its snapshots no longer matches its SHA-256;
// csv-separator (signed) holds INV-4, which differs the same way. The branch
// serves iso-dates with a code commit and no Tier line.
function ranked(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S2, INV4C));
  addRequest(repo, 'iso-dates', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  repo.write('requests/iso-dates/origin/2026-09-22-call.md',
    `Source: chat with the owner\nFetched: 2026-09-22T10:00Z\nSHA-256: ${sha256(CALL)}\n---\n${CALL}tampered\n`);
  addRequest(repo, 'csv-separator', [block('[INV-4]@1 modify   for R1', { was: INV4A, now: INV4B })]);
  repo.commit('Records', { date: '2026-09-21T12:00:00Z' });
  assert.ok(says(contextOf(repo, 'iso-dates').stdout, 'INV-3', 'differs'), 'the fixture: iso-dates reads differs');
  assert.ok(says(contextOf(repo, 'csv-separator').stdout, 'INV-4', 'differs'), 'the fixture: csv-separator reads differs');
  repo.git(['checkout', '-q', '-b', 'iso-dates-part-1']);
  repo.write('src/dates.js', 'export const format = "iso";\n');
  repo.commit('ISO dates\n\nRequest: iso-dates', { date: '2026-09-22T12:00:00Z' });
  return repo;
}

test('[HNT-1][HNT-3] check ranks not ok before note; the not oks that count before information; then [HNT-2]\'s order (differs before SHA-256)', (t) => {
  const hints = checkHints(check(ranked(t), '--all'));
  const differs = at(hints, 'not ok', 'reads differs', 'INV-3');
  const sha = at(hints, 'not ok', 'SHA-256', '2026-09-22-call.md');
  const info = at(hints, 'not ok', 'reads differs', 'INV-4', /\binformation\b/);
  const noTier = at(hints, 'note', 'no Tier line');
  assert.ok(differs < sha && sha < info && info < noTier, `expected differs (INV-3), SHA-256, information (INV-4), then the note:\n${hints.join('\n')}`);
  const last = (kind, f = () => true) => Math.max(...hints.map((l, i) => (kindOf(l) === kind && f(l) ? i : -1)));
  const first = (kind, f = () => true) => hints.findIndex((l) => kindOf(l) === kind && f(l));
  assert.ok(last('not ok') < first('note'), `every not ok before every note:\n${hints.join('\n')}`);
  const isInfo = (l) => /\binformation\b/.test(l);
  assert.ok(last('not ok', (l) => !isInfo(l)) < first('not ok', isInfo), `every counting not ok before the information:\n${hints.join('\n')}`);
});

test('[HNT-1] notes keep [HNT-2]\'s order: a hotfix, then no request linked, then no Tier line', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S1));
  addRequest(repo, 'iso-dates', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  repo.commit('iso-dates: request', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'hotfix']);
  repo.write('specs/invoices.md', file(INV1, S2));
  repo.commit('Dates carry the time zone', { date: '2026-09-22T12:00:00Z' });
  const hints = checkHints(check(repo, '--all'));
  const hotfix = at(hints, 'note', 'hotfix', 'INV-3');
  const unlinked = at(hints, 'note', 'no request linked');
  const noTier = at(hints, 'note', 'no Tier line');
  assert.ok(hotfix < unlinked && unlinked < noTier, `expected hotfix, no request linked, no Tier line:\n${hints.join('\n')}`);
});

test('[HNT-1] each hint names the section, request, path, commit or (for the branch as a whole) main..HEAD involved, and a command (al … or git …), in check, context <name> and context --diff', (t) => {
  const repo = ranked(t);
  const outs = [check(repo, '--all'), run(repo, 'context', 'iso-dates', '--all'), run(repo, 'context', '--diff', 'main...HEAD', '--all')];
  const hints = [...checkHints(outs[0]), ...viewHints(outs[1]), ...viewHints(outs[2])];
  assert.ok(checkHints(outs[0]).length >= 4 && viewHints(outs[1]).length >= 2 && viewHints(outs[2]).length >= 4,
    `each view should give the fixture's hints:\n${outs.join('\n---\n')}`);
  for (const line of hints) {
    assert.ok(namesThing(line, ['iso-dates', 'csv-separator']), `the hint should name what it is about, outside its command:\n${line}`);
    assert.match(line, COMMAND, `the hint should name a command:\n${line}`);
  }
});

test('[HNT-1][VW-2] context <name> shows only the hints its request owns: iso-dates\' view has no INV-4 (csv-separator\'s) and no "no Tier line" (the branch\'s); csv-separator\'s has its INV-4', (t) => {
  const repo = ranked(t);
  const iso = viewHints(run(repo, 'context', 'iso-dates', '--all'));
  at(iso, 'not ok', 'reads differs', 'INV-3');
  assert.ok(!iso.some((l) => /\bINV-4\b/.test(l) || l.includes('no Tier line')), `only iso-dates' own hints:\n${iso.join('\n')}`);
  const sep = viewHints(run(repo, 'context', 'csv-separator', '--all'));
  at(sep, 'not ok', 'reads differs', 'INV-4');
  assert.ok(!sep.some((l) => /\bINV-3\b/.test(l) || l.includes('SHA-256')), `only csv-separator's own hints:\n${sep.join('\n')}`);
});

// invoice-download (signed) holds INV-11 to INV-17, each changed underneath
// (the baseline is at neither Was nor Now); the branch serves it.
const NS = [11, 12, 13, 14, 15, 16, 17];
function many(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', NS.map((n) => `## [INV-${n}] Rule ${n}\nRule ${n} changed underneath.\n`).join('\n'));
  addRequest(repo, 'invoice-download', NS.map((n) => block(`[INV-${n}]@1 modify   for R1`,
    { was: `## [INV-${n}] Rule ${n}\nRule ${n} holds.\n`, now: `## [INV-${n}] Rule ${n}\nRule ${n} MUST hold.\n` })));
  repo.commit('Records', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('src/export.js', 'export const rows = [];\n');
  repo.commit(message('Rows', { request: 'invoice-download', tier: '2 — rows' }), { date: '2026-09-22T12:00:00Z' });
  return repo;
}
const more = (n) => `${n} more hidden, --all`;

test('[HNT-1] check shows five hints and "N more hidden, --all"; check --all shows every one, with nothing hidden', (t) => {
  const repo = many(t);
  const all = checkHints(check(repo, '--all'));
  assert.ok(all.length >= NS.length, `check --all shows a not ok for each of the ${NS.length} sections:\n${all.join('\n')}`);
  for (const n of NS) at(all, 'not ok', 'reads differs', `INV-${n}`);
  const out = check(repo);
  assert.equal(checkHints(out).length, 5, `five hints:\n${out}`);
  assert.ok(out.includes(more(all.length - 5)), `expected "${more(all.length - 5)}":\n${out}`);
  assert.ok(!check(repo, '--all').includes('more hidden'), 'nothing hidden with --all');
});

test('[HNT-1][VW-2] context <name> shows three of its request\'s hints, "N more hidden, --all" on the last one, in twelve lines; --all shows every one', (t) => {
  const repo = many(t);
  const all = viewHints(run(repo, 'context', 'invoice-download', '--all'));
  assert.ok(all.length >= NS.length, `context --all shows every hint:\n${all.join('\n')}`);
  const out = run(repo, 'context', 'invoice-download');
  const shown = viewHints(out);
  assert.equal(shown.length, 3, `three hints:\n${out}`);
  assert.ok(shown[2].includes(more(all.length - 3)), `the last hint line ends the list with "${more(all.length - 3)}":\n${out}`);
  assert.ok(lines(out).length <= 12, `more than 12 lines:\n${out}`);
});

test('[HNT-1][VW-4] context --diff shows three of the hints check makes, the first three in the same order, and "N more hidden, --all" on the last; --all shows the whole list', (t) => {
  const repo = many(t);
  const list = checkHints(check(repo, '--all'));
  const out = run(repo, 'context', '--diff', 'main...HEAD');
  const shown = viewHints(out);
  assert.equal(shown.length, 3, `three hints:\n${out}`);
  assert.ok(shown[2].includes(more(list.length - 3)), `the last hint line ends with "${more(list.length - 3)}":\n${out}`);
  const ids = (l) => [...new Set(l.replaceAll('SHA-256', '').match(/[A-Z][A-Z0-9]*-\d+(\.\d+)*/g) ?? [])].sort().join(' ');
  shown.forEach((l, i) => {
    assert.equal(kindOf(l), kindOf(list[i]), `hint ${i + 1} is check's hint ${i + 1}:\n${out}\n---\n${list.join('\n')}`);
    assert.equal(ids(l), ids(list[i]), `hint ${i + 1} names what check's hint ${i + 1} names:\n${out}\n---\n${list.join('\n')}`);
  });
  const whole = viewHints(run(repo, 'context', '--diff', 'main...HEAD', '--all'));
  assert.equal(whole.length, list.length, `--all shows the whole list:\n${whole.join('\n')}\n---\n${list.join('\n')}`);
});
