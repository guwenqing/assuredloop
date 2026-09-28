// Draft while blocked, deliver with or after the sign-off [REC-6][REC-10]: no
// command refuses drafting; check is "not ok" for a branch whose final state
// delivers spec work (change.md or the baseline) or code for a request still
// blocked there, and for a baseline section the branch changes to a blocked
// request's Now [HNT-2]. Each is owned by the blocked request and counts for
// check --strict even when the branch does not map to it [HNT-3]; a sign-off
// in the same branch clears it. Any other edit to a section a blocked request
// holds is a hotfix note, with the holder's differs as information. Notes for
// a served request: its sign-off pending or changed since; work that reached
// main in a commit that is neither its first sign-off's nor after it.
// Acceptance C4.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl, sha256 } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { block, changeMd } from './helpers/change.js';
import { ENV, addRequest, both } from './helpers/request.js';
import { contextOf, file, says } from './helpers/links.js';
import { assertCounts, assertInformation, check, hint, message, noHint, strict } from './helpers/hints.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const S2 = '## [INV-3] Dates\nDates MUST show in ISO 8601, with the time zone.\n';
const INV4 = '## [INV-4] Separator\nThe CSV separator is a comma.\n';
const INV4B = '## [INV-4] Separator\nThe CSV separator MUST be a semicolon.\n';
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

// The sign-off, in a commit on the branch: the sign-off file and the Signed off line.
function signOff(repo, date) {
  const r = runAl(repo.dir, ['record', 'iso-dates', 'signoff', '--source', 'chat with the owner', '--yes'], { env: ENV });
  assert.equal(r.code, 0, both(r));
  repo.commit(message('Sign off iso-dates', { request: 'iso-dates', tier: '2 — ISO dates' }), { date });
  const changed = repo.git(['diff', '--name-only', 'HEAD~1', 'HEAD']).split('\n');
  assert.ok(changed.includes(MD) && changed.some((f) => /^requests\/iso-dates\/origin\/.*signoff.*\.md$/.test(f)), `the fixture: the commit adds the sign-off file and changes request.md:\n${changed.join('\n')}`);
  assert.match(repo.read(MD).toString(), /^Signed off: \d{4}-\d{2}-\d{2} owner, origin\/\S*signoff\S*\.md$/m, 'the fixture: the Signed off line');
  assert.ok(!blocked(repo), 'the fixture: iso-dates is signed now');
}

test('C4 [REC-6] drafting while blocked is allowed: record section --yes writes the block while iso-dates is unsigned', (t) => {
  const repo = base(t);
  const r = runAl(repo.dir, ['record', 'iso-dates', 'section', 'INV-4', '--yes'], { env: ENV });
  assert.equal(r.code, 0, both(r));
  assert.ok(repo.read('requests/iso-dates/change.md').toString().includes('### [INV-4]@1 modify'), 'the block is written');
  assert.ok(blocked(repo), 'still blocked');
});

// Work for iso-dates, with its Request line, as [path, text]: code; spec
// work in its change.md alone (a new block, no baseline edit, no code); spec
// work in the baseline that is not one of its Nows (a new section INV-9).
// None of them sets a section to a blocked Now, so that rule does not stand
// in for this one.
const INV9 = '## [INV-9] Time zones\nDates MUST carry the time zone.\n';
const WORK = {
  code: ['src/dates.js', 'export const format = "iso";\n'],
  'spec work in its change.md': ['requests/iso-dates/change.md', changeMd(
    block('[INV-3]@1 modify   for R2', { was: S0, now: S1 }), block('[INV-4]@1 modify   for R1', { was: INV4, now: INV4B }))],
  'spec work in the baseline': ['specs/invoices.md', file(INV1, S0, INV4, INV9)],
};

for (const [kind, [path, text]] of Object.entries(WORK)) {
  test(`C4 [REC-6][HNT-2] a branch whose final state delivers ${kind} for iso-dates while it is still blocked is not ok, counting (check --strict exits 1); the sign-off in the same branch clears it`, (t) => {
    const repo = base(t);
    repo.write(path, text);
    repo.commit(message('ISO dates', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-21T12:00:00Z' });
    assert.equal(repo.git(['diff', '--name-only', 'main', 'HEAD']), path, `the fixture: the branch changes ${path} only`);
    assert.ok(blocked(repo), 'the fixture: iso-dates is still blocked');
    assertCounts(hint(check(repo, '--all'), 'not ok', 'blocked', /iso-dates|INV-3/));
    strict(repo, 1);

    signOff(repo, '2026-09-22T12:00:00Z');
    noHint(check(repo, '--all'), 'not ok', 'blocked');
    strict(repo, 0);
  });
}

test('[REC-6][HNT-2] a branch that only writes blocked iso-dates\' own request.md (an owner\'s words entry) and origin/ (a snapshot) delivers no work: no "blocked", check --strict exits 0, the sign-off note stays; a change.md edit on top is "blocked"', (t) => {
  const repo = base(t);
  const entry = '- 2026-09-20 owner chat, snapshot origin/2026-09-20-owner-words.md\n';
  const md = repo.read(MD).toString();
  assert.ok(md.includes(entry), 'the fixture: the owner\'s words entry');
  repo.write(MD, md.replace(entry, `${entry}- 2026-09-22 owner call, snapshot origin/2026-09-22-call.md\n`));
  const call = 'One invoice at a time, for now.\n';
  const snapshot = 'requests/iso-dates/origin/2026-09-22-call.md';
  repo.write(snapshot, `Source: chat with the owner\nFetched: 2026-09-22T09:00Z\nSHA-256: ${sha256(call)}\n---\n${call}`);
  repo.commit(message('The owner\'s call', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-21T12:00:00Z' });
  assert.deepEqual(repo.git(['diff', '--name-only', 'main', 'HEAD']).split('\n'), [snapshot, MD], 'the fixture: only request.md and origin/ change');
  assert.ok(blocked(repo), 'the fixture: iso-dates is still blocked');
  const out = check(repo, '--all');
  noHint(out, 'not ok', 'blocked');
  hint(out, 'note', SIGN_OFF, PENDING, 'iso-dates');
  strict(repo, 0);

  const [path, text] = WORK['spec work in its change.md'];
  repo.write(path, text);
  repo.commit(message('INV-4 block', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-22T12:00:00Z' });
  assertCounts(hint(check(repo, '--all'), 'not ok', 'blocked', /iso-dates|INV-3/));
  strict(repo, 1);
});

test('[HNT-3][REC-6] check reads the working tree, untracked files too: an untracked change.md for blocked iso-dates, on a branch that commits nothing for it, is a counting "blocked" not ok and check --strict exits 1, as when it is staged', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0, INV4));
  addRequest(repo, 'iso-dates', null, { signed: false });
  repo.commit('iso-dates: request', { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  const path = 'requests/iso-dates/change.md';
  repo.write(path, changeMd(block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })));
  assert.equal(repo.git(['rev-list', '--count', 'main..HEAD']), '0', 'the fixture: the branch commits nothing');
  assert.equal(repo.git(['status', '--porcelain', '--untracked-files=all']), `?? ${path}`, 'the fixture: change.md is untracked');
  assert.ok(blocked(repo), 'the fixture: iso-dates is blocked');
  assert.ok(says(contextOf(repo, 'iso-dates').stdout, 'INV-3', 'pending'), 'the fixture: its INV-3 block is pending');
  for (const state of ['untracked', 'staged']) {
    if (state === 'staged') {
      repo.git(['add', path]);
      assert.equal(repo.git(['status', '--porcelain']), `A  ${path}`, 'the fixture: change.md is staged');
    }
    assertCounts(hint(check(repo, '--all'), 'not ok', 'blocked', /iso-dates|INV-3/));
    strict(repo, 1);
  }
});

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

test('C4 [HNT-2][HNT-3] contrast: INV-3 changed to another text than blocked iso-dates\' Now, or to its Now once iso-dates is signed, is not "blocked" but a hotfix note (with iso-dates\' differs as information): check --strict exits 0', (t) => {
  for (const [text, signed] of [[S2, false], [S1, true]]) {
    const repo = unmapped(t, text, { signed });
    assert.ok(says(contextOf(repo, 'iso-dates').stdout, 'INV-3', signed ? 'consolidated' : 'differs'), 'the fixture: INV-3\'s state');
    const out = check(repo, '--all');
    noHint(out, 'not ok', 'blocked');
    hint(out, 'note', 'hotfix', 'INV-3');
    if (!signed) assertInformation(hint(out, 'not ok', 'reads differs', 'INV-3'), 'iso-dates');
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

// Main: iso-dates' request (unsigned), then its code, then its first sign-off
// with more code in the same commit, then more code. HEAD is the branch work.
function earlyWork(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0, INV4));
  addRequest(repo, 'iso-dates', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })], { signed: false });
  repo.commit('iso-dates: request', { date: '2026-09-20T12:00:00Z' });
  repo.write('src/dates.js', 'export const format = "iso";\n');
  const early = repo.commit(message('ISO dates code', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-21T12:00:00Z' });
  const r = runAl(repo.dir, ['record', 'iso-dates', 'signoff', '--source', 'chat with the owner', '--yes'], { env: ENV });
  assert.equal(r.code, 0, both(r));
  repo.write('src/export.js', 'export const dates = "iso";\n');
  const signed = repo.commit(message('Sign off iso-dates, with the export', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-22T12:00:00Z' });
  assert.equal(repo.git(['log', '--diff-filter=A', '--format=%H', '--', 'requests/iso-dates/origin/*signoff*']), signed,
    'the fixture: this commit added the first sign-off file');
  repo.write('src/zone.js', 'export const zone = "UTC";\n');
  const later = repo.commit(message('Zone code', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-23T12:00:00Z' });
  addRequest(repo, 'tz-dates', null);
  repo.commit('tz-dates: request', { date: '2026-09-23T13:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  return { repo, early, signed, later };
}

test('C4 [REC-10][HNT-2] work that reached main before the request\'s first sign-off is a note naming that commit, on a branch serving the request; not the sign-off commit\'s own work, nor a commit after it', (t) => {
  const { repo, early, signed, later } = earlyWork(t);
  repo.write('src/dates.js', 'export const format = "iso-8601";\n');
  repo.commit(message('ISO dates, again', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-24T12:00:00Z' });
  const out = check(repo, '--all');
  hint(out, 'note', 'before its first sign-off', early.slice(0, 7));
  noHint(out, 'before its first sign-off', signed.slice(0, 7));
  noHint(out, 'before its first sign-off', later.slice(0, 7));
});

test('C4 [HNT-2] contrast: the same history on a branch serving another request gives no such note', (t) => {
  const { repo } = earlyWork(t);
  repo.write('src/zone.js', 'export const zone = "Europe/Amsterdam";\n');
  repo.commit(message('Zones', { request: 'tz-dates', tier: '2 — zones' }), { date: '2026-09-24T12:00:00Z' });
  noHint(check(repo, '--all'), 'before its first sign-off');
});

test('C4 [HNT-2][REC-10] when work reached main is what counts: a draft committed before the sign-off on a branch that reached main in the same --no-ff merge as the sign-off is not "before its first sign-off"', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0, INV4));
  addRequest(repo, 'iso-dates', null, { signed: false });
  repo.commit('iso-dates: request', { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'iso-dates-part-1']);
  repo.write('src/dates.js', 'export const format = "iso";\n');
  const draft = repo.commit(message('Draft dates', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-21T12:00:00Z' });
  const r = runAl(repo.dir, ['record', 'iso-dates', 'signoff', '--source', 'chat with the owner', '--yes'], { env: ENV });
  assert.equal(r.code, 0, both(r));
  const signed = repo.commit(message('Sign off iso-dates', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-22T12:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  repo.git(['merge', '-q', '--no-ff', '-m', message('Deliver the dates with the sign-off', { request: 'iso-dates', tier: '2 — ISO dates' }), 'iso-dates-part-1'],
    { date: '2026-09-23T12:00:00Z' });
  const merge = repo.head();
  assert.ok(repo.git(['rev-list', signed]).split('\n').includes(draft), 'the fixture: the draft comes before the sign-off commit');
  const firstParent = repo.git(['rev-list', '--first-parent', 'main']).split('\n');
  assert.ok(firstParent.includes(merge) && !firstParent.includes(draft) && !firstParent.includes(signed),
    'the fixture: the draft and the sign-off reached main\'s line only with the merge');
  repo.git(['checkout', '-q', '-b', 'iso-dates-part-2']);
  repo.write('src/dates.js', 'export const format = "iso-8601";\n');
  repo.commit(message('Dates, again', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-24T12:00:00Z' });
  const out = check(repo, '--all');
  noHint(out, 'before its first sign-off', draft.slice(0, 7));
  noHint(out, 'before its first sign-off', merge.slice(0, 7));
});

test('C4 [HNT-2][REC-10] the mirror: a draft that reached main in a --no-ff merge while iso-dates was unsigned, its first sign-off in a later main commit, is "before its first sign-off", naming the draft', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0, INV4));
  addRequest(repo, 'iso-dates', null, { signed: false });
  repo.commit('iso-dates: request', { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'iso-dates-draft']);
  repo.write('src/dates.js', 'export const format = "iso";\n');
  const draft = repo.commit(message('Draft dates', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  repo.git(['merge', '-q', '--no-ff', '-m', message('Merge the draft dates', { request: 'iso-dates', tier: '2 — ISO dates' }), 'iso-dates-draft'],
    { date: '2026-09-22T12:00:00Z' });
  const merge = repo.head();
  assert.ok(blocked(repo), 'the fixture: iso-dates is still unsigned after the merge');
  const r = runAl(repo.dir, ['record', 'iso-dates', 'signoff', '--source', 'chat with the owner', '--yes'], { env: ENV });
  assert.equal(r.code, 0, both(r));
  const signed = repo.commit(message('Sign off iso-dates', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-23T12:00:00Z' });
  const firstParent = repo.git(['rev-list', '--first-parent', 'main']).split('\n');
  assert.ok(firstParent.indexOf(signed) < firstParent.indexOf(merge) && !firstParent.includes(draft),
    'the fixture: the draft reached main\'s line with the merge, and the sign-off in a later main commit');
  assert.equal(repo.git(['log', '--diff-filter=A', '--format=%H', '--', 'requests/iso-dates/origin/*signoff*']), signed,
    'the fixture: that later commit added the first sign-off file');
  repo.git(['checkout', '-q', '-b', 'iso-dates-part-2']);
  repo.write('src/dates.js', 'export const format = "iso-8601";\n');
  repo.commit(message('Dates, again', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-24T12:00:00Z' });
  hint(check(repo, '--all'), 'note', 'before its first sign-off', draft.slice(0, 7), 'iso-dates');
});

test('C4 [HNT-2][REC-6] a main commit before the first sign-off that writes only iso-dates\' own request.md and origin/ (its record) is not work: no "before its first sign-off" note for it; a code commit in the same place gets one', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0, INV4));
  repo.commit('Initial spec', { date: '2026-09-19T12:00:00Z' });
  addRequest(repo, 'iso-dates', null, { signed: false });
  const record = repo.commit('iso-dates: request', { date: '2026-09-20T12:00:00Z' });
  assert.deepEqual(repo.git(['show', '--name-only', '--format=', record]).split('\n'),
    ['requests/iso-dates/origin/2026-09-20-owner-words.md', 'requests/iso-dates/request.md'], 'the fixture: the record commit writes only request.md and origin/');
  repo.write('src/dates.js', 'export const format = "iso";\n');
  const code = repo.commit(message('ISO dates code', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-21T12:00:00Z' });
  const r = runAl(repo.dir, ['record', 'iso-dates', 'signoff', '--source', 'chat with the owner', '--yes'], { env: ENV });
  assert.equal(r.code, 0, both(r));
  const signed = repo.commit(message('Sign off iso-dates', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-22T12:00:00Z' });
  assert.equal(repo.git(['log', '--diff-filter=A', '--format=%H', '--', 'requests/iso-dates/origin/*signoff*']), signed,
    'the fixture: the first sign-off comes after both commits');
  repo.git(['checkout', '-q', '-b', 'iso-dates-part-2']);
  repo.write('src/dates.js', 'export const format = "iso-8601";\n');
  repo.commit(message('Dates, again', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-24T12:00:00Z' });
  const out = check(repo, '--all');
  noHint(out, 'before its first sign-off', record.slice(0, 7));
  hint(out, 'note', 'before its first sign-off', code.slice(0, 7), 'iso-dates');
});

test('C4 [HNT-2][LNK-2] a --no-ff merge whose own message says "Request: iso-dates" maps the draft it brings (no Request line, no request folder): when the merge also brings the sign-off, no note; when the sign-off comes later, a "before its first sign-off" note names the merge', (t) => {
  for (const signedInMerge of [true, false]) {
    const repo = makeRepo(t);
    repo.write('specs/invoices.md', file(INV1, S0, INV4));
    repo.commit('Initial spec', { date: '2026-09-19T12:00:00Z' });
    addRequest(repo, 'iso-dates', null, { signed: false });
    repo.commit('iso-dates: request', { date: '2026-09-20T12:00:00Z' });
    repo.git(['checkout', '-q', '-b', 'draft']);
    repo.write('src/dates.js', 'export const format = "iso";\n');
    const draft = repo.commit(message('Draft dates', { tier: '2 — ISO dates' }), { date: '2026-09-21T12:00:00Z' });
    assert.equal(repo.git(['show', '--name-only', '--format=', draft]), 'src/dates.js', 'the fixture: the draft touches no request folder');
    assert.ok(!repo.git(['log', '-1', '--format=%B', draft]).includes('Request:'), 'the fixture: the draft has no Request line');
    const signOffAt = (date) => {
      const r = runAl(repo.dir, ['record', 'iso-dates', 'signoff', '--source', 'chat with the owner', '--yes'], { env: ENV });
      assert.equal(r.code, 0, both(r));
      return repo.commit(message('Sign off iso-dates', { request: 'iso-dates', tier: '2 — ISO dates' }), { date });
    };
    if (signedInMerge) signOffAt('2026-09-22T12:00:00Z');
    repo.git(['checkout', '-q', 'main']);
    repo.git(['merge', '-q', '--no-ff', '-m', message('Deliver the draft dates', { request: 'iso-dates', tier: '2 — ISO dates' }), 'draft'],
      { date: '2026-09-23T12:00:00Z' });
    const merge = repo.head();
    assert.equal(blocked(repo), !signedInMerge, `the fixture: iso-dates is ${signedInMerge ? 'signed' : 'still unsigned'} after the merge`);
    if (!signedInMerge) {
      const signed = signOffAt('2026-09-24T12:00:00Z');
      const firstParent = repo.git(['rev-list', '--first-parent', 'main']).split('\n');
      assert.ok(firstParent.indexOf(signed) < firstParent.indexOf(merge) && !firstParent.includes(draft),
        'the fixture: the draft reached main\'s line with the merge, and the sign-off in a later main commit');
    }
    repo.git(['checkout', '-q', '-b', 'iso-dates-part-2']);
    repo.write('src/dates.js', 'export const format = "iso-8601";\n');
    repo.commit(message('Dates, again', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-25T12:00:00Z' });
    const out = check(repo, '--all');
    if (signedInMerge) {
      noHint(out, 'before its first sign-off', merge.slice(0, 7));
      noHint(out, 'before its first sign-off', draft.slice(0, 7));
    } else {
      hint(out, 'note', 'before its first sign-off', merge.slice(0, 7), 'iso-dates');
    }
  }
});
