// Issue #140, the Next lines and hint commands: each names a command that
// works and is the next step [HNT-1] [VW-2]. Built from the issue's items and
// the architect's rulings; nothing here reads the code under test.
// (1) The Next of context <name> for an open, signed request names the step
//     it is at, first match wins: a bad snapshot, the re-fetch; a held block
//     that differs, has a broken link, a base revised or dropped, or is not
//     found, al context <name> --all; a pending block not marked Dropped, al
//     consolidate <name>; a block with no change yet, edit its Now in
//     <dir>/change.md; else al conclude <name> (with no change.md, for tier 1,
//     edit the sections it amends in the baseline, then al conclude <name>).
// (2) Before the organized requirement exists, every place that would name
//     al record <name> signoff names the write-it step instead, "write the
//     organized requirement in <dir>/request.md, then al context <name>":
//     context's Next, check's blocked hints (the Now written into the
//     baseline, work delivered, the "not signed off yet" note), and the Next
//     of a refused conclude or consolidate. Once it exists but is unsigned or
//     changed, each shows the sign-off step, "show the owner the organized
//     requirement; on their OK: al record <name> signoff --source <where>
//     --words <quote> --yes", the same everywhere.
// (3) The two-holders not ok names a fix that works: add `builds on <block>`
//     to one holder's block heading and set its Was to that block's Now.
// (4) The tier-0 note says to set the Tier line in <dir>/request.md, not al new.
// (5) A held section that differs: check's not ok names al record <request>
//     section <ID> --accept, which resolves it.
// (9) `Tier: 0 — a fix` counts as tier 0 in context, as the bare `0` does.
// (10) The "no Tier line" note says to add it to a commit message.
// (24) On main, with no branch, context <name> shows its own not oks with no
//     "(information: owned by <name>)" label.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { ENV, ORG, addRequest, both } from './helpers/request.js';
import { file } from './helpers/links.js';
import { assertCounts, check, checkHints, hint, kindOf, message, noHint, strict, viewHints } from './helpers/hints.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const S2 = '## [INV-3] Dates\nDates MUST show in ISO 8601, with the time zone.\n';
const S3 = '## [INV-3] Dates\nDates MUST show in ISO 8601, with the time zone, to the second.\n';

const WRITE = (name) => `write the organized requirement in requests/${name}/request.md, then al context ${name}`;
const SIGN = (name) => `show the owner the organized requirement; on their OK: al record ${name} signoff --source <where> --words <quote> --yes`;

const ok = (r, what) => assert.equal(r.code, 0, `${what}:\n${both(r)}`);
const al = (repo, ...args) => runAl(repo.dir, args, { env: ENV });
function context(repo, name, ...args) {
  const r = al(repo, 'context', name, ...args);
  ok(r, `context ${name} ${args.join(' ')}`);
  assertFrame(r.stdout);
  return r.stdout;
}
const nextLine = (out) => lines(out).at(-2);

// --- (2) the write-it step before the organized requirement, the sign-off step after ---

// The organized requirement with R1 edited since the sign-off of ORG.
const ORG_CHANGED = ORG.replace('as CSV.', 'as CSV or PDF.');
// Each: request.md's options for addRequest, and the step each place names.
const VARIANTS = {
  'no organized requirement': { opts: { org: '', signed: false }, step: WRITE },
  'an organized requirement not signed off': { opts: { signed: false }, step: SIGN },
  'an organized requirement changed since its sign-off': { opts: { org: ORG_CHANGED, signedText: ORG }, step: SIGN },
};
const NAME = 'iso-dates';

// The place's text names `step` for NAME; before the organized requirement, never al record <name> signoff.
function assertStep(text, step, where) {
  assert.ok(text.includes(step(NAME)), `${where} should name "${step(NAME)}":\n${text}`);
  if (step === WRITE) assert.doesNotMatch(text, new RegExp(`al record ${NAME} signoff`), `${where}: there is nothing to sign yet:\n${text}`);
}

// Main: INV-1 and INV-3 (S0); iso-dates, blocked as `opts` make it, holding INV-3@1 S0 to S1, pending.
function onMain(t, opts) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  addRequest(repo, NAME, [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })], opts);
  repo.commit('iso-dates: request', { date: '2026-09-21T12:00:00Z' });
  return repo;
}

for (const [label, { opts, step }] of Object.entries(VARIANTS)) {
  test(`#140 item 2 ${step === SIGN ? 'pin ' : ''}[VW-2][HNT-1] ${label}: the Next lines of context, a refused conclude and a refused consolidate name the ${step === WRITE ? 'write-it' : 'sign-off'} step`, (t) => {
    const repo = onMain(t, opts);
    const out = context(repo, NAME);
    assert.match(lines(out)[0], /^BLOCKED/, `the fixture: ${NAME} is blocked:\n${out}`);
    assertStep(nextLine(out), step, 'the Next line of context');

    const c = al(repo, 'conclude', NAME);
    assert.equal(c.code, 1, `the fixture: conclude refuses:\n${both(c)}`);
    assertStep(nextLine(c.stdout), step, 'the Next line of a refused conclude');

    const s = al(repo, 'consolidate', NAME);
    assert.equal(s.code, 1, `the fixture: consolidate refuses:\n${both(s)}`);
    assertStep(nextLine(s.stdout), step, 'the Next line of a refused consolidate');
  });

  test(`#140 item 2 [HNT-1][HNT-2] ${label}: check's not oks for the Now written into the baseline and for work delivered name the ${step === WRITE ? 'write-it' : 'sign-off'} step`, (t) => {
    const repo = onMain(t, opts);
    repo.git(['checkout', '-q', '-b', 'work']);
    repo.write('specs/invoices.md', file(INV1, S1));
    repo.write('src/dates.js', 'export const iso = (d) => d.toISOString();\n');
    repo.commit(message('ISO dates', { request: NAME, tier: '2 — ISO dates' }), { date: '2026-09-22T12:00:00Z' });
    const out = check(repo, '--all');
    assertStep(hint(out, 'not ok', 'INV-3', /\bNow\b/, NAME, /\bblocked\b/), step, 'the not ok for the Now written into the baseline');
    assertStep(hint(out, 'not ok', 'delivers work for', NAME, /\bblocked\b/), step, 'the not ok for work delivered');
  });

  test(`#140 item 2 [HNT-1][HNT-2] ${label}: served by a branch that delivers nothing, check's sign-off note names the ${step === WRITE ? 'write-it' : 'sign-off'} step`, (t) => {
    const repo = makeRepo(t);
    repo.write('specs/invoices.md', file(INV1, S0));
    addRequest(repo, NAME, null, opts);
    repo.commit('iso-dates: request', { date: '2026-09-21T12:00:00Z' });
    repo.git(['checkout', '-q', '-b', 'work']);
    const md = repo.read(`requests/${NAME}/request.md`).toString();
    repo.write(`requests/${NAME}/request.md`, `${md}- D5, 2026-09-22. Source: the owner. Keep the CSV header in English.\n`);
    repo.commit(message('iso-dates: a decision', { request: NAME, tier: '2 — ISO dates' }), { date: '2026-09-22T12:00:00Z' });
    const out = check(repo, '--all');
    assert.ok(!checkHints(out).some((l) => kindOf(l) === 'not ok' && l.includes(NAME)), `the fixture: no not ok for ${NAME}:\n${out}`);
    assertStep(hint(out, 'note', NAME, /changed since its sign-off|not signed off yet/), step, 'the sign-off note');
  });
}

test('#140 item 2 pin: with no organized requirement, al record iso-dates signoff fails (exit 2), "has no ## Organized requirement", and writes nothing', (t) => {
  const repo = onMain(t, VARIANTS['no organized requirement'].opts);
  const r = al(repo, 'record', NAME, 'signoff', '--source', 'chat', '--words', 'OK', '--yes');
  assert.equal(r.code, 2, both(r));
  assert.match(both(r), /has no "?## Organized requirement/, both(r));
  assert.equal(repo.git(['status', '--porcelain']), '', 'nothing written');
});

// --- (3) the two-holders not ok names a fix that works ---

// Main: INV-1 and INV-3 (S0); invoice-download holds INV-3@1 S0 to S1,
// tz-dates INV-3@1 S0 to S2, neither building on the other. The branch serves invoice-download.
function twoHolders(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  addRequest(repo, 'invoice-download', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  addRequest(repo, 'tz-dates', [block('[INV-3]@1 modify   for R2', { was: S0, now: S2 })]);
  repo.commit('Records', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('src/export.js', 'export const rows = [];\n');
  repo.commit(message('Rows', { request: 'invoice-download', tier: '2 — rows' }), { date: '2026-09-22T12:00:00Z' });
  return repo;
}
const NOWS = { 'invoice-download/INV-3@1': S1, 'tz-dates/INV-3@1': S2 };

test('#140 item 3 [HNT-1][HNT-2] the not ok "neither builds on the other" names both blocks and how to link them, not --builds-on; following it clears the not ok', (t) => {
  const repo = twoHolders(t);
  const line = hint(check(repo, '--all'), 'not ok', 'neither builds on the other', 'INV-3');
  assert.doesNotMatch(line, /--builds-on/, `--builds-on is refused for a request that already holds INV-3:\n${line}`);
  for (const key of Object.keys(NOWS)) assert.ok(line.includes(key), `the not ok should name the block ${key}:\n${line}`);
  const other = line.match(/builds on ((?:invoice-download|tz-dates)\/INV-3@1)/)?.[1];
  assert.ok(other, `the not ok should say to add "builds on <block>" to a heading:\n${line}`);
  const first = other.startsWith('tz-dates/') ? 'invoice-download' : 'tz-dates';
  assert.ok(line.includes(`requests/${first}/change.md`), `the not ok should name the change.md to edit, requests/${first}/change.md:\n${line}`);
  assert.match(line, /\bWas\b/, `the not ok should say to set the Was:\n${line}`);
  assert.match(line, /\bNow\b/, `the not ok should say the Was becomes that block's Now:\n${line}`);

  // Follow it: the first holder's block builds on the other, its Was the other's Now.
  repo.write(`requests/${first}/change.md`, repo.read(`requests/${first}/change.md`).toString().replace(
    block('[INV-3]@1 modify   for R2', { was: S0, now: NOWS[`${first}/INV-3@1`] }),
    block(`[INV-3]@1 modify   builds on ${other}   for R2`, { was: NOWS[other], now: NOWS[`${first}/INV-3@1`] })));
  assert.ok(repo.read(`requests/${first}/change.md`).toString().includes(`builds on ${other}`), 'the fixture: the instruction was followed');
  const after = check(repo, '--all');
  noHint(after, 'neither builds on the other');
  noHint(after, 'not ok', 'INV-3');
});

// --- (4) and (9) the tier-0 note ---

// A request whose status line is `line`, on main; context's notes that say tier 0.
function tierNotes(t, line) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  addRequest(repo, 'csv-fix', null, { line });
  repo.commit('csv-fix: request', { date: '2026-09-21T12:00:00Z' });
  return viewHints(context(repo, 'csv-fix', '--all')).filter((l) => kindOf(l) === 'note' && /\btier 0\b/i.test(l));
}

test('#140 item 4 [HNT-1] a request with Tier: 0: the note says to set the Tier line in requests/csv-fix/request.md to 1 or higher, or to drop the record; it does not name al new', (t) => {
  const [note, ...rest] = tierNotes(t, 'Type: fix · Tier: 0 · Status: open');
  assert.ok(note && !rest.length, `one tier-0 note:\n${note}`);
  assert.doesNotMatch(note, /\bal new\b/, `al new is refused: the name is taken:\n${note}`);
  assert.ok(note.includes('requests/csv-fix/request.md'), `the note should name requests/csv-fix/request.md:\n${note}`);
  assert.match(note, /\bTier line\b/i, `the note should say to set the Tier line:\n${note}`);
  assert.match(note, /\b1 or higher\b/, `to 1 or higher:\n${note}`);
  assert.match(note, /\bdrop\b/, `or to drop the record:\n${note}`);
});

test('#140 item 9 [REC-10] "Tier: 0 — a fix" on the status line counts as tier 0: the same note as a bare "Tier: 0"; Tier: 1 gives none', (t) => {
  const bare = tierNotes(t, 'Type: fix · Tier: 0 · Status: open');
  assert.equal(bare.length, 1, `the fixture: Tier: 0 gives the note:\n${bare}`);
  assert.deepEqual(tierNotes(t, 'Type: fix · Tier: 0 — a fix · Status: open'), bare);
  assert.deepEqual(tierNotes(t, 'Type: story · Tier: 1 · Status: open'), []);
});

// --- (5) differs: the command that resolves it ---

test('#140 item 5 [HNT-1] a held section that differs: check\'s not ok names al record invoice-download section INV-3 --accept; with --yes the section reads consolidated and the not ok is gone', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S3));
  addRequest(repo, 'invoice-download', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  repo.commit('Records', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('src/export.js', 'export const rows = [];\n');
  repo.commit(message('Rows', { request: 'invoice-download', tier: '2 — rows' }), { date: '2026-09-22T12:00:00Z' });
  const line = hint(check(repo, '--all'), 'not ok', 'reads differs', 'INV-3');
  assert.ok(line.includes('al record invoice-download section INV-3 --accept'), `the not ok should name al record invoice-download section INV-3 --accept:\n${line}`);

  ok(al(repo, 'record', 'invoice-download', 'section', 'INV-3', '--accept', '--yes'), 'record section --accept --yes');
  const spec = lines(context(repo, 'invoice-download')).find((l) => /^Spec\b/.test(l)) ?? '';
  assert.match(spec, /\bINV-3 consolidated\b/, `INV-3 reads consolidated:\n${spec}`);
  noHint(check(repo, '--all'), 'not ok', 'reads differs');
  strict(repo, 0);
});

// --- (10) the missing Tier line ---

test('#140 item 10 [HNT-2] the "no Tier line" note says to add the Tier line to a commit message, where the tool reads it, not "to the PR"', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  repo.commit('Baseline', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('src/export.js', 'export const rows = [];\n');
  repo.commit('Rows', { date: '2026-09-22T12:00:00Z' });
  const line = hint(check(repo, '--all'), 'note', 'no Tier line');
  assert.match(line, /\bcommit message\b/, `the note should say to add it to a commit message:\n${line}`);
  assert.doesNotMatch(line, /\bto the PR\b/, `the tool does not read the PR:\n${line}`);
});

// --- (24) a request's own not oks on main ---

test('#140 item 24 [HNT-3][VW-2] on main, with no branch, context invoice-download shows its own not ok (INV-3 reads differs) with no "information: owned by" label', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S3));
  addRequest(repo, 'invoice-download', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  repo.commit('Records', { date: '2026-09-21T12:00:00Z' });
  assert.equal(repo.git(['rev-parse', '--abbrev-ref', 'HEAD']), 'main', 'the fixture: on main');
  for (const args of [[], ['--all']]) {
    const line = hint(context(repo, 'invoice-download', ...args), 'not ok', 'reads differs', 'INV-3');
    assert.doesNotMatch(line, /\binformation\b|owned by/, `context ${args.join(' ')}: its own not ok carries no ownership label:\n${line}`);
  }
});

test('#140 item 24 [HNT-3][VW-2] on main, a not ok owned by two requests (INV-3 held by both, neither building on the other) is each one\'s own: context of either shows it with no "information: owned by" label', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  addRequest(repo, 'invoice-download', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  addRequest(repo, 'tz-dates', [block('[INV-3]@1 modify   for R2', { was: S0, now: S2 })]);
  repo.commit('Records', { date: '2026-09-21T12:00:00Z' });
  for (const name of ['invoice-download', 'tz-dates']) {
    const line = hint(context(repo, name), 'not ok', 'neither builds on the other', 'INV-3');
    assert.doesNotMatch(line, /\binformation\b|owned by/, `context ${name}: its own not ok carries no ownership label:\n${line}`);
  }
});

// The two holders' not ok, served by one of them: it counts there (a pin, as today).
// --- (3) three holders: the not ok names a pair truly unlinked, and following it leaves one chain ---

const EX = (v) => `## [EX-1] Example\nThe example is version ${v}.\n`;
// The heading of `name`'s EX-1@1 block: its builds-on marker, if any.
const exHead = (on) => `[EX-1]@1 modify${on ? `   builds on ${on}` : ''}   for R1`;

// Main: specs/ex.md at EX(0); requests a, b, c, signed, each holding EX-1@1
// as `holders` gives it: { name: [was, now, builds on or null] }.
function holders3(t, holders) {
  const repo = makeRepo(t);
  repo.write('specs/ex.md', EX(0));
  for (const [name, [was, now, on]] of Object.entries(holders)) addRequest(repo, name, [block(exHead(on), { was: EX(was), now: EX(now) })]);
  repo.commit('a, b and c', { date: '2026-09-21T12:00:00Z' });
  return repo;
}

// Read the not ok, check it names a pair of requests not linked either way
// (`linked` lists the pairs that are), follow its instruction, and check that
// no not ok on EX-1 is left: no "neither builds on the other", no broken link.
function followThree(repo, holders, linked) {
  const line = hint(check(repo, '--all'), 'not ok', 'neither builds on the other', 'EX-1');
  const other = line.match(/builds on ([abc])\/EX-1@1/);
  const edit = line.match(/requests\/([abc])\/change\.md/);
  assert.ok(other && edit, `the not ok should name a change.md and the block to build on:\n${line}`);
  const [p, q] = [edit[1], other[1]];
  assert.notEqual(p, q, `a block does not build on its own request:\n${line}`);
  assert.ok(!linked.some((pair) => pair.includes(p) && pair.includes(q)), `${p} and ${q} are already linked; the not ok should name a pair that is not:\n${line}`);
  // In place of a builds on the block has, when the line says so; else added to its heading.
  const replace = /\bin place of\b|\breplac/i.test(line);
  const [, now, on] = holders[p];
  const head = replace || !on ? exHead(`${q}/EX-1@1`) : `${exHead(on)}   builds on ${q}/EX-1@1`;
  const path = `requests/${p}/change.md`;
  const text = repo.read(path).toString();
  const old = block(exHead(on), { was: EX(holders[p][0]), now: EX(now) });
  assert.ok(text.includes(old), `the fixture: ${path} holds ${p}'s block`);
  repo.write(path, text.replace(old, block(head, { was: EX(holders[q][1]), now: EX(now) })));
  const after = check(repo, '--all');
  noHint(after, 'neither builds on the other');
  noHint(after, 'broken link');
  noHint(after, 'not ok', 'EX-1');
}

test('#140 item 3 [HNT-1][HNT-2] three holders, a builds on b and c unlinked: the not ok names c and one of a or b, never a and b; following it leaves one chain, no not ok on EX-1', (t) => {
  const holders = { a: [1, 2, 'b/EX-1@1'], b: [0, 1, null], c: [0, 3, null] };
  followThree(holders3(t, holders), holders, [['a', 'b']]);
});

test('#140 item 3 [HNT-1][HNT-2] three holders branching, a and c both build on b: the not ok names a and c; following it leaves one chain, no not ok on EX-1', (t) => {
  const holders = { a: [1, 2, 'b/EX-1@1'], b: [0, 1, null], c: [1, 3, 'b/EX-1@1'] };
  followThree(holders3(t, holders), holders, [['a', 'b'], ['c', 'b']]);
});

test('#140 item 3 pin: the two-holders not ok still counts on the branch serving one holder, and check --strict exits 1', (t) => {
  const repo = twoHolders(t);
  assertCounts(hint(check(repo, '--all'), 'not ok', 'neither builds on the other', 'INV-3'));
  strict(repo, 1);
});

// --- (1) the Next of a signed, open request: the step it is at ---

const INV4A = '## [INV-4] Separator\nThe CSV separator is a comma.\n';
const INV4B = '## [INV-4] Separator\nThe CSV separator MUST be a semicolon.\n';
const OLD_NEXT = /to snapshot a new original/;
const SNAP = '2026-09-20-owner-words.md';

// Main: specs/invoices.md holding `baseline`; inv, signed, holding `blocks`
// (no change.md when null); with `tampered`, its owner's words no longer match
// their SHA-256. Returns context inv's Next line.
function nextOf(t, blocks, baseline, { tampered = false, ...opts } = {}) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', baseline);
  addRequest(repo, 'inv', blocks, opts);
  if (tampered) repo.write(`requests/inv/origin/${SNAP}`, `${repo.read(`requests/inv/origin/${SNAP}`).toString()}tampered\n`);
  repo.commit('inv', { date: '2026-09-21T12:00:00Z' });
  const out = context(repo, 'inv');
  assert.doesNotMatch(lines(out)[0], /^BLOCKED/, `the fixture: inv is signed off:\n${out}`);
  return nextLine(out);
}
const MODIFY3 = block('[INV-3]@1 modify   for R2', { was: S0, now: S1 });
const MODIFY4 = block('[INV-4]@1 modify   for R1', { was: INV4A, now: INV4B });
const UNCHANGED4 = block('[INV-4]@1 modify   for R1', { was: INV4A, now: INV4A });
const assertNext = (next, step) => {
  assert.ok(next.includes(step), `the Next line should name "${step}":\n${next}`);
  assert.doesNotMatch(next, OLD_NEXT, `not the old Next for every request:\n${next}`);
};

test('#140 item 1 pin [VW-2][VW-9] a snapshot that no longer matches its SHA-256: Next is the re-fetch, al record inv origin --verify <file> --from -, whether INV-3 differs or is pending', (t) => {
  for (const baseline of [file(INV1, S2), file(INV1, S0)]) {
    const next = nextOf(t, [MODIFY3], baseline, { tampered: true });
    assert.ok(next.includes(`al record inv origin --verify ${SNAP} --from -`), `the re-fetch:\n${next}`);
  }
});

test('#140 item 1 [VW-2] a held block that reads differs: Next is al context inv --all', (t) => {
  assertNext(nextOf(t, [MODIFY3], file(INV1, S2)), 'al context inv --all');
});

test('#140 item 1 [VW-2] a held block that reads not found, or broken link: Next is al context inv --all', (t) => {
  assertNext(nextOf(t, [MODIFY4], file(INV1, S1)), 'al context inv --all');
  assertNext(nextOf(t, [block('[INV-3]@1 modify   builds on nosuch/INV-3@1   for R2', { was: S1, now: S2 })], file(INV1, S1)), 'al context inv --all');
});

test('#140 item 1 [VW-2] first match wins: a pending block (INV-4) beside one that differs (INV-3): Next is al context inv --all, not al consolidate', (t) => {
  const next = nextOf(t, [MODIFY3, MODIFY4], file(INV1, S2, INV4A));
  assertNext(next, 'al context inv --all');
  assert.doesNotMatch(next, /\bal consolidate\b/, next);
});

test('#140 item 1 [VW-2] a pending block: Next is al consolidate inv', (t) => {
  assertNext(nextOf(t, [MODIFY3], file(INV1, S0)), 'al consolidate inv');
});

test('#140 item 1 [VW-2] first match wins: a pending block (INV-3) beside one with no change yet (INV-4): Next is al consolidate inv', (t) => {
  assertNext(nextOf(t, [MODIFY3, UNCHANGED4], file(INV1, S0, INV4A)), 'al consolidate inv');
});

test('#140 item 1 [VW-2] a block with no change yet (its Was equals its Now): Next says to edit its Now in requests/inv/change.md', (t) => {
  const next = nextOf(t, [UNCHANGED4], file(INV1, S1, INV4A));
  assertNext(next, 'requests/inv/change.md');
  assert.match(next, /\bedit\b/i, `it says to edit:\n${next}`);
  assert.match(next, /\bNow\b/, `its Now:\n${next}`);
});

test('#140 item 1 [VW-2] every block consolidated: Next is al conclude inv', (t) => {
  assertNext(nextOf(t, [MODIFY3, MODIFY4], file(INV1, S1, INV4B)), 'al conclude inv');
});

test('#140 item 1 [VW-2] a pending block marked Dropped (retaining nothing) beside a consolidated one: Next is al conclude inv, not al consolidate', (t) => {
  const next = nextOf(t, [MODIFY3, block('[INV-4]@1 modify   Dropped 2026-09-26 (D4)   for R1', { was: INV4A, now: INV4B })], file(INV1, S1, INV4A));
  assertNext(next, 'al conclude inv');
  assert.doesNotMatch(next, /\bal consolidate\b/, next);
});

test('#140 item 1 [VW-2] no change.md, tier 2: Next is al conclude inv', (t) => {
  const next = nextOf(t, null, file(INV1, S0));
  assertNext(next, 'al conclude inv');
  assert.doesNotMatch(next, /\bamends?\b/i, `only a tier-1 record edits what it amends:\n${next}`);
});

test('#140 item 1 [VW-2] no change.md, tier 1: Next says to edit the sections it amends in the baseline, then al conclude inv', (t) => {
  const org = '## Organized requirement\n\nR1: Dates MUST show in ISO 8601. Amends: [INV-3]\n';
  const next = nextOf(t, null, file(INV1, S0), { org, signedText: org, line: 'Type: story · Tier: 1 · Status: open', decisions: '' });
  assertNext(next, 'al conclude inv');
  assert.match(next, /\bamends\b/, `the sections it amends:\n${next}`);
  assert.match(next, /\bbaseline\b/, `in the baseline:\n${next}`);
  assert.ok(next.indexOf('al conclude inv') > next.search(/\bamends\b/), `the edit first, then al conclude inv:\n${next}`);
});

