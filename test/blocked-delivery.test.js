// Draft while blocked, deliver with or after the sign-off [REC-6][REC-10]: no
// command refuses drafting; check is "not ok" for a branch whose final state
// delivers spec work or code for a request still blocked there, and for a
// baseline section the branch changes to a blocked request's Now [HNT-2].
// Each is owned by the blocked request and counts for check --strict even
// when the branch does not map to it [HNT-3]; a sign-off in the same branch
// clears it. Notes for a served request: its sign-off pending or changed
// since; work that reached main before its first sign-off. Acceptance C4.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { ENV, addRequest, both } from './helpers/request.js';
import { contextOf, file, says } from './helpers/links.js';
import { assertCounts, check, hint, message, noHint, strict } from './helpers/hints.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const S2 = '## [INV-3] Dates\nDates MUST show in ISO 8601, with the time zone.\n';
const INV4 = '## [INV-4] Separator\nThe CSV separator is a comma.\n';
const MD = 'requests/iso-dates/request.md';

// The conventions pin no key word for a sign-off pending or changed since: a line about the sign-off.
const SIGN_OFF = /sign(?:ed)?[- ]off/i;
const PENDING = /pending|awaiting|\byet\b|unsigned|no sign|not signed/i;
const blocked = (repo) => /^BLOCKED/.test(lines(contextOf(repo, 'iso-dates').stdout)[0]);

// Main: the baseline at S0; iso-dates holding INV-3 (S0 to S1), unsigned
// unless `signed`; whatever `more` adds. HEAD is the branch work.
function base(t, { signed = false, more = () => {} } = {}) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0, INV4));
  addRequest(repo, 'iso-dates', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })], { signed });
  more(repo);
  repo.commit('iso-dates: request', { date: '2026-09-20T12:00:00Z' });
  assert.equal(blocked(repo), !signed, `the fixture: iso-dates is ${signed ? 'not ' : ''}blocked`);
  repo.git(['checkout', '-q', '-b', 'work']);
  return repo;
}

// The sign-off, in a commit on the branch.
function signOff(repo, date) {
  const r = runAl(repo.dir, ['record', 'iso-dates', 'signoff', '--source', 'chat with the owner', '--yes'], { env: ENV });
  assert.equal(r.code, 0, both(r));
  repo.commit(message('Sign off iso-dates', { request: 'iso-dates', tier: '2 — ISO dates' }), { date });
  assert.ok(!blocked(repo), 'the fixture: iso-dates is signed now');
}

test('C4 [REC-6] drafting while blocked is allowed: record section --yes writes the block while iso-dates is unsigned', (t) => {
  const repo = base(t);
  const r = runAl(repo.dir, ['record', 'iso-dates', 'section', 'INV-4', '--yes'], { env: ENV });
  assert.equal(r.code, 0, both(r));
  assert.ok(repo.read('requests/iso-dates/change.md').toString().includes('### [INV-4]@1 modify'), 'the block is written');
  assert.ok(blocked(repo), 'still blocked');
});

// Work for iso-dates, with its Request line: code, or spec work that is not
// one of its Nows (a new section INV-9), so that the rule on a blocked Now
// does not stand in for this one.
const INV9 = '## [INV-9] Time zones\nDates MUST carry the time zone.\n';
const WORK = {
  code: (repo) => repo.write('src/dates.js', 'export const format = "iso";\n'),
  'spec work': (repo) => repo.write('specs/invoices.md', file(INV1, S0, INV4, INV9)),
};

for (const [kind, work] of Object.entries(WORK)) {
  test(`C4 [REC-6][HNT-2] a branch whose final state delivers ${kind} for iso-dates while it is still blocked is not ok, counting (check --strict exits 1); the sign-off in the same branch clears it`, (t) => {
    const repo = base(t);
    work(repo);
    repo.commit(message('ISO dates', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-21T12:00:00Z' });
    assertCounts(hint(check(repo, '--all'), 'not ok', 'blocked', /iso-dates|INV-3/));
    strict(repo, 1);

    signOff(repo, '2026-09-22T12:00:00Z');
    noHint(check(repo, '--all'), 'not ok', 'blocked');
    strict(repo, 0);
  });
}

// A branch that maps to no request changes INV-3 to `text`, claiming tier 1.
function unmapped(t, text, opts) {
  const repo = base(t, opts);
  repo.write('specs/invoices.md', file(INV1, text, INV4));
  repo.commit(message('Dates', { tier: '1 — dates' }), { date: '2026-09-21T12:00:00Z' });
  assert.ok(!repo.git(['log', '--format=%B', 'main..HEAD']).includes('Request:'), 'the fixture: no Request line');
  return repo;
}

test('C4 [HNT-2][HNT-3] a baseline section changed to the Now of blocked iso-dates, by a branch that does not map to it, is not ok and counts: check --strict exits 1', (t) => {
  const repo = unmapped(t, S1);
  assertCounts(hint(check(repo, '--all'), 'not ok', 'blocked', /INV-3|iso-dates/));
  strict(repo, 1);
});

test('C4 [HNT-2] contrast: INV-3 changed to another text than blocked iso-dates\' Now, or to its Now once iso-dates is signed, is not "blocked": check --strict exits 0', (t) => {
  for (const [text, signed] of [[S2, false], [S1, true]]) {
    const repo = unmapped(t, text, { signed });
    assert.ok(says(contextOf(repo, 'iso-dates').stdout, 'INV-3', signed ? 'consolidated' : 'differs'), 'the fixture: INV-3\'s state');
    noHint(check(repo, '--all'), 'not ok', 'blocked');
    strict(repo, 0);
  }
});

test('[HNT-2] a served request\'s sign-off pending is a note naming it; an unsigned request the branch does not serve gets none', (t) => {
  const repo = base(t, { more: (r) => addRequest(r, 'tz-dates', null, { signed: false }) });
  repo.write('src/dates.js', 'export const format = "iso";\n');
  repo.commit(message('ISO dates', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-21T12:00:00Z' });
  const out = check(repo, '--all');
  hint(out, 'note', SIGN_OFF, PENDING, 'iso-dates');
  noHint(out, 'note', SIGN_OFF, 'tz-dates');
});

test('[HNT-2] a served request whose organized requirement changed since its sign-off gets a note saying so; one still as signed gets no sign-off note', (t) => {
  const repo = base(t, { signed: true });
  const md = repo.read(MD).toString();
  assert.ok(md.includes('Dates MUST show in ISO 8601.'), 'the fixture: R2 in request.md');
  repo.write(MD, md.replace('Dates MUST show in ISO 8601.', 'Dates MUST show in ISO 8601, with the zone.'));
  repo.commit(message('R2 with the zone', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-21T12:00:00Z' });
  assert.ok(blocked(repo), 'the fixture: iso-dates changed since its sign-off');
  hint(check(repo, '--all'), 'note', SIGN_OFF, /changed since/i, 'iso-dates');

  const same = base(t, { signed: true });
  same.write('src/dates.js', 'export const format = "iso";\n');
  same.commit(message('ISO dates', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-21T12:00:00Z' });
  noHint(check(same, '--all'), 'note', SIGN_OFF, PENDING);
  noHint(check(same, '--all'), 'note', SIGN_OFF, /changed since/i);
});

// Main: iso-dates' request (unsigned), then its code, then its first
// sign-off, then more code. HEAD is the branch work.
function earlyWork(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0, INV4));
  addRequest(repo, 'iso-dates', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })], { signed: false });
  repo.commit('iso-dates: request', { date: '2026-09-20T12:00:00Z' });
  repo.write('src/dates.js', 'export const format = "iso";\n');
  const early = repo.commit(message('ISO dates code', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-21T12:00:00Z' });
  const r = runAl(repo.dir, ['record', 'iso-dates', 'signoff', '--source', 'chat with the owner', '--yes'], { env: ENV });
  assert.equal(r.code, 0, both(r));
  const signed = repo.commit('Sign off iso-dates', { date: '2026-09-22T12:00:00Z' });
  assert.equal(repo.git(['log', '--diff-filter=A', '--format=%H', '--', 'requests/iso-dates/origin/*signoff*']), signed,
    'the fixture: this commit added the first sign-off file');
  repo.write('src/zone.js', 'export const zone = "UTC";\n');
  const later = repo.commit(message('Zone code', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-23T12:00:00Z' });
  addRequest(repo, 'tz-dates', null);
  repo.commit('tz-dates: request', { date: '2026-09-23T13:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  return { repo, early, later };
}

test('C4 [REC-10][HNT-2] work that reached main before the request\'s first sign-off is a note naming that commit, on a branch serving the request; not a commit after it', (t) => {
  const { repo, early, later } = earlyWork(t);
  repo.write('src/dates.js', 'export const format = "iso-8601";\n');
  repo.commit(message('ISO dates, again', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-24T12:00:00Z' });
  const out = check(repo, '--all');
  hint(out, 'note', 'before its first sign-off', early.slice(0, 7));
  noHint(out, 'before its first sign-off', later.slice(0, 7));
});

test('C4 [HNT-2] contrast: the same history on a branch serving another request gives no such note', (t) => {
  const { repo } = earlyWork(t);
  repo.write('src/zone.js', 'export const zone = "Europe/Amsterdam";\n');
  repo.commit(message('Zones', { request: 'tz-dates', tier: '2 — zones' }), { date: '2026-09-24T12:00:00Z' });
  noHint(check(repo, '--all'), 'before its first sign-off');
});
