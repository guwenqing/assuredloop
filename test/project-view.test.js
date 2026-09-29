// al context with no name [VW-1]: one line per open request (a folder
// requests/<name>/ holding request.md, not under requests/archive/) with its
// state, the requests blocked on the owner's sign-off [REC-6] first, with the
// reason; a repo with no baseline says "no baseline yet; requests add
// sections as they go"; --at <commit> lists them as at that commit [VW-8].
// And the Spec line of al context <name> [VW-2]@2: each held section with its
// state, or, when they do not fit on one line, the count in each state with
// every section named except those consolidated, carried or pending.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { ORG, addRequest, both, hasId } from './helpers/request.js';
import { file } from './helpers/links.js';
import { count, short } from './helpers/evidence.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
// The organized requirement with R2 edited since the sign-off of ORG.
const ORG_R2 = ORG.replace('Dates MUST show in ISO 8601.', 'Dates MUST show in ISO 8601, with the time zone.');

const ok = (r) => assert.equal(r.code, 0, both(r));
// The lines above the frame (Read, Next, Not known).
const body = (out) => lines(out).filter((l) => !/^(Read|Next|Not known)\b/.test(l));
// The index of the first body line naming `name` as a whole word (not a-signed-2).
const at = (out, name) => body(out).findIndex((l) => new RegExp(`(^|[^\\w-])${name}(?![\\w-])`).test(l));
function lineOf(out, name) {
  const i = at(out, name);
  assert.ok(i >= 0, `expected a line naming ${name}:\n${out}`);
  return body(out)[i];
}
const project = (repo, ...args) => runAl(repo.dir, ['context', ...args]);

// a-signed is signed; b-unsigned has no sign-off; c-changed's R2 changed
// since its sign-off; d-archived is archived; requests/scratch holds no
// request.md. Named so that a plain sort would put a-signed first.
function requests(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  addRequest(repo, 'a-signed', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  addRequest(repo, 'b-unsigned', null, { signed: false });
  addRequest(repo, 'c-changed', null, { org: ORG_R2 });
  addRequest(repo, 'd-archived', null, { dir: 'requests/archive/d-archived', status: 'concluded' });
  repo.write('requests/scratch/notes.md', 'Ideas, not a request.\n');
  repo.commit('Requests', { date: '2026-09-21T12:00:00Z' });
  return repo;
}

test('[VW-1] context with no name: one line per open request with its state; archived requests and a folder with no request.md are not listed; exit 0 in the frame', (t) => {
  const repo = requests(t);
  const r = project(repo);
  ok(r);
  assert.match(lineOf(r.stdout, 'a-signed'), /\bopen\b/, `a-signed shows its Status word:\n${r.stdout}`);
  assert.ok(!lineOf(r.stdout, 'a-signed').includes('BLOCKED'), `a-signed is signed:\n${r.stdout}`);
  for (const name of ['b-unsigned', 'c-changed']) lineOf(r.stdout, name);
  assert.ok(!r.stdout.includes('d-archived'), `an archived request is not open:\n${r.stdout}`);
  assert.equal(at(r.stdout, 'scratch'), -1, `requests/scratch holds no request.md:\n${r.stdout}`);
  // One line each: no line names two of them.
  for (const l of body(r.stdout)) {
    const named = ['a-signed', 'b-unsigned', 'c-changed'].filter((n) => l.includes(n));
    assert.ok(named.length <= 1, `one line per request:\n${l}`);
  }
  assertFrame(r.stdout);
});

test('[VW-1][REC-6] context with no name: a request with no sign-off, and one whose R2 changed since its sign-off, read BLOCKED with the reason, and come before the others', (t) => {
  const repo = requests(t);
  const r = project(repo);
  ok(r);
  const b = lineOf(r.stdout, 'b-unsigned');
  const c = lineOf(r.stdout, 'c-changed');
  assert.ok(b.includes('BLOCKED') && /sign-?off/i.test(b), `b-unsigned is BLOCKED awaiting sign-off:\n${r.stdout}`);
  assert.ok(c.includes('BLOCKED') && /changed/.test(c), `c-changed is BLOCKED, its requirement changed since the sign-off:\n${r.stdout}`);
  const a = at(r.stdout, 'a-signed');
  assert.ok(at(r.stdout, 'b-unsigned') < a && at(r.stdout, 'c-changed') < a, `the blocked ones come first:\n${r.stdout}`);
});

test('[VW-1] a repo with no baseline says "no baseline yet; requests add sections as they go"; one with a baseline does not', (t) => {
  const bare = makeRepo(t);
  addRequest(bare, 'a-signed', null);
  bare.commit('A request, no baseline', { date: '2026-09-21T12:00:00Z' });
  const none = project(bare);
  ok(none);
  assert.ok(lines(none.stdout).some((l) => l.includes('no baseline yet; requests add sections as they go')),
    `a line should say "no baseline yet; requests add sections as they go":\n${none.stdout}`);
  lineOf(none.stdout, 'a-signed');
  assertFrame(none.stdout);

  const r = project(requests(t));
  ok(r);
  assert.ok(!r.stdout.includes('no baseline yet'), `this repo has a baseline:\n${r.stdout}`);
});

test('[VW-1][VW-8] context --at <commit> with no name lists the open requests as at that commit: one blocked then reads BLOCKED, one added later is not listed; the Read line names the commit', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  addRequest(repo, 'a-signed', null);
  addRequest(repo, 'b-unsigned', null, { signed: false });
  const x = repo.commit('Two requests, b unsigned', { date: '2026-09-21T12:00:00Z' });
  addRequest(repo, 'b-unsigned', null);
  addRequest(repo, 'e-later', null);
  repo.commit('b signed; e added', { date: '2026-09-22T12:00:00Z' });

  const now = project(repo);
  ok(now);
  assert.ok(!lineOf(now.stdout, 'b-unsigned').includes('BLOCKED'), `the fixture: b-unsigned is signed now:\n${now.stdout}`);
  lineOf(now.stdout, 'e-later');

  const then = project(repo, '--at', x);
  ok(then);
  assert.ok(lineOf(then.stdout, 'b-unsigned').includes('BLOCKED'), `b-unsigned was blocked at ${short(x)}:\n${then.stdout}`);
  assert.ok(!then.stdout.includes('e-later'), `e-later was added after ${short(x)}:\n${then.stdout}`);
  const read = lines(then.stdout).find((l) => /^Read\b/.test(l));
  assert.ok(read && read.includes(short(x)), `the Read line should name ${short(x)}:\n${then.stdout}`);
  assert.ok(!read.includes('working tree'), then.stdout);
  assertFrame(then.stdout, { read: short(x) });
});

// --- the Spec line of context <name> [VW-2]@2 ---

const W = (n) => `## [INV-${n}] Rule ${n}\nRule ${n} holds.\n`;
const N = (n) => `## [INV-${n}] Rule ${n}\nRule ${n} MUST hold.\n`;
const N2 = (n) => `## [INV-${n}] Rule ${n}\nRule ${n} MUST hold, always.\n`;
const X = (n) => `## [INV-${n}] Rule ${n}\nRule ${n} MUST NOT hold.\n`;
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// big-change holds 30 sections: INV-11..30 consolidated, INV-31..35 pending,
// INV-36..37 differs, INV-38 not found, INV-39 waiting (on other-change's
// block), INV-40 no change yet.
const STATES = {
  consolidated: range(11, 30), pending: range(31, 35), differs: [36, 37],
  'not found': [38], waiting: [39], 'no change yet': [40],
};
function bigRequest(t) {
  const repo = makeRepo(t);
  const REFUND = '## [INV-38] Refunds\nA refund names its invoice.\n';
  repo.write('specs/invoices.md', file(INV1,
    ...STATES.consolidated.map(N), ...STATES.pending.map(W), ...STATES.differs.map(X), W(39), W(40)));
  addRequest(repo, 'other-change', [block('[INV-39]@1 modify   for R1', { was: W(39), now: N(39) })]);
  addRequest(repo, 'big-change', [
    ...[...STATES.consolidated, ...STATES.pending, ...STATES.differs].map((n) => block(`[INV-${n}]@1 modify   for R1`, { was: W(n), now: N(n) })),
    block('[INV-38]@1 modify   for R1', { was: REFUND, now: REFUND.replace('names', 'MUST name') }),
    block('[INV-39]@1 modify   builds on other-change/INV-39@1   for R1', { was: N(39), now: N2(39) }),
    block('[INV-40]@1 modify   for R1', { was: W(40), now: W(40) }),
  ]);
  repo.commit('Thirty sections', { date: '2026-09-21T12:00:00Z' });
  return repo;
}
function specLine(out) {
  const line = lines(out).find((l) => /^Spec\b/.test(l));
  assert.ok(line, `expected a line starting with Spec:\n${out}`);
  return line;
}

test('[VW-2] a request holding a few sections: the Spec line names each with its state', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S1, W(4)));
  addRequest(repo, 'small-change', [
    block('[INV-3]@1 modify   for R2', { was: S0, now: S1 }),
    block('[INV-4]@1 modify   for R1', { was: W(4), now: N(4) }),
  ]);
  repo.commit('Two sections', { date: '2026-09-21T12:00:00Z' });
  const r = project(repo, 'small-change');
  ok(r);
  const spec = specLine(r.stdout);
  assert.ok(hasId(spec, 'INV-3') && spec.includes('consolidated'), `INV-3 consolidated:\n${spec}`);
  assert.ok(hasId(spec, 'INV-4') && spec.includes('pending'), `INV-4 pending:\n${spec}`);
});

test('[VW-2]@2 a request holding 30 sections: the Spec line is one line, far shorter than the full list, gives the count in each state, and names every section except the consolidated, carried or pending ones', (t) => {
  const repo = bigRequest(t);
  const r = project(repo, 'big-change');
  ok(r);
  const spec = specLine(r.stdout);
  // One line, far shorter than listing all 30: under a quarter of the list
  // form's length, each section as "INV-n <state> (R1)" joined by " · ".
  // The shortest honest one here is about 165, the waiting block naming what
  // it waits on (#89 (d)); the list is about 750.
  const list = Object.entries(STATES).flatMap(([state, ns]) => ns.map((n) => `INV-${n} ${state} (R1)`)).join(' · ');
  assert.ok(spec.length < list.length / 4, `the Spec line should be far shorter than the full list (${list.length} characters), under a quarter of it, got ${spec.length}:\n${spec}`);
  for (const [state, ns] of Object.entries(STATES)) {
    assert.match(spec, count(ns.length, state), `the Spec line should give ${ns.length} ${state}:\n${spec}`);
  }
  for (const n of [...STATES.differs, ...STATES['not found'], ...STATES.waiting, ...STATES['no change yet']]) {
    assert.ok(hasId(spec, `INV-${n}`), `the Spec line should name INV-${n}:\n${spec}`);
  }
  for (const n of [...STATES.consolidated, ...STATES.pending]) {
    assert.ok(!hasId(spec, `INV-${n}`), `the Spec line should not name INV-${n}:\n${spec}`);
  }
  assertFrame(r.stdout);
});

test('[VW-2]@2 context of the 30-section request stays at twelve lines or fewer above Read, Next and Not known', (t) => {
  const repo = bigRequest(t);
  const r = project(repo, 'big-change');
  ok(r);
  assert.ok(body(r.stdout).length <= 12, `more than twelve lines above the frame (${body(r.stdout).length}):\n${r.stdout}`);
});
