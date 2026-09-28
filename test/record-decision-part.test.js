// al record <name> decision --source <who> --text <decision> [--yes] [REC-7]
// and al record <name> part --text <part> [--yes] [REC-8]. Each shows what it
// would write and writes only with --yes [TL-1]. A decision is the line
// `- D<n+1>, <YYYY-MM-DD>. Source: <who>. <decision>` at the end of
// ## Decisions, n the highest Dn written there; a part is `<k>. <part>` at
// the end of ## Parts, k the next number; a missing section is created at the
// end. No entry is ever edited, so the append-only check stays clean
// [REC-12]. No flag marks a part done. A part naming `request <child>` shows
// the child's state (open, blocked, concluded or dropped) on the parent's
// context as a note.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';
import { shape } from './helpers/change.js';
import { ORG, addRequest, both } from './helpers/request.js';
import { hint, message, check, checkHints, kindOf, strict } from './helpers/hints.js';

const ENV = { SOURCE_DATE_EPOCH: '1790510400', TZ: 'UTC' }; // 2026-09-27T12:00Z
const DIR = 'requests/invoice-download';
const MD = `${DIR}/request.md`;
const PARTS = '\n## Parts\n\n1. CSV export\n2. Email link\n';
const DECIDED = '- D5, 2026-09-27. Source: the owner, in review. Keep the CSV header in English.';
const DECISION_ARGS = ['--source', 'the owner, in review', '--text', 'Keep the CSV header in English.'];

// A committed repo holding the signed request invoice-download, request.md
// written from `opts` as requestText takes them; returns { repo, md }.
function setup(t, opts = {}) {
  const repo = makeRepo(t);
  addRequest(repo, 'invoice-download', null, opts);
  repo.commit('invoice-download: request', { date: '2026-09-21T12:00:00Z' });
  return { repo, md: repo.read(MD).toString() };
}
const record = (repo, args, name = 'invoice-download') => runAl(repo.dir, ['record', name, ...args], { env: ENV });
const read = (repo) => repo.read(MD).toString();
const clean = (repo) => assert.equal(repo.git(['status', '--porcelain']), '', 'nothing should be written');
const ok = (r) => assert.equal(r.code, 0, both(r));

// --- record decision ---

test('[REC-7][TL-1] record decision without --yes shows the entry it would write, D5 after D1-D4, and writes nothing', (t) => {
  const { repo } = setup(t);
  const r = record(repo, ['decision', ...DECISION_ARGS]);
  ok(r);
  assert.ok(lines(r.stdout).some((l) => l.includes(DECIDED)), `should show ${JSON.stringify(DECIDED)}:\n${r.stdout}`);
  clean(repo);
  assertFrame(r.stdout);
});

test('[REC-7] record decision --yes appends the entry at the end of ## Decisions, the last section; nothing else changes', (t) => {
  const { repo, md } = setup(t);
  assert.ok(md.endsWith('Drop this request.\n'), 'the fixture: ## Decisions ends request.md, with D4');
  const r = record(repo, ['decision', ...DECISION_ARGS, '--yes']);
  ok(r);
  assert.equal(read(repo), `${md}${DECIDED}\n`);
  assertFrame(r.stdout);
});

test('[REC-7] record decision --yes puts the entry at the end of ## Decisions when ## Parts follows it', (t) => {
  const { repo, md } = setup(t, { rest: PARTS });
  ok(record(repo, ['decision', ...DECISION_ARGS, '--yes']));
  assert.equal(read(repo), md.replace(PARTS, `${DECIDED}\n${PARTS}`));
});

test('[REC-7] the number is the highest Dn written in ## Decisions plus one: D1, D2, D4 there, D8 only named in an entry\'s text, D9 under ## Parts, gives D5', (t) => {
  const decisions = '\n## Decisions\n\n' +
    '- D1, 2026-09-21. Source: the owner. CSV only for now.\n' +
    '- D2, 2026-09-22. Source: the owner. ISO dates (a D8 was drafted and withdrawn before it was written).\n' +
    '- D4, 2026-09-23. Source: the owner. Dates in the customer\'s zone.\n';
  const parts = '\n## Parts\n\n1. CSV export\n- D9, 2026-09-27. Source: the owner. Ship the export in one part.\n';
  const { repo, md } = setup(t, { decisions, rest: parts });
  ok(record(repo, ['decision', ...DECISION_ARGS, '--yes']));
  assert.equal(read(repo), md.replace(parts, `${DECIDED}\n${parts}`));
});

test('[REC-7] record decision --yes on a request with no ## Decisions creates it at the end, with D1', (t) => {
  const { repo, md } = setup(t, { decisions: '', rest: PARTS });
  assert.ok(!md.includes('## Decisions'), 'the fixture: no ## Decisions');
  ok(record(repo, ['decision', ...DECISION_ARGS, '--yes']));
  const now = read(repo);
  assert.ok(now.startsWith(md), `request.md is kept as it was, up to the new section:\n${now}`);
  assert.deepEqual(shape(now.slice(md.length)), ['## Decisions', DECIDED.replace('D5', 'D1')]);
});

test('[REC-7] record decision without --source or without --text exits 2 and writes nothing, even with --yes; on an unknown request too', (t) => {
  const { repo } = setup(t);
  for (const args of [['--text', 'Keep the CSV header in English.'], ['--source', 'the owner']]) {
    for (const extra of [[], ['--yes']]) {
      const r = record(repo, ['decision', ...args, ...extra]);
      assert.equal(r.code, 2, `${args.join(' ')} ${extra.join(' ')}:\n${both(r)}`);
      clean(repo);
    }
  }
  const unknown = record(repo, ['decision', ...DECISION_ARGS, '--yes'], 'no-such-request');
  assert.equal(unknown.code, 2, both(unknown));
  clean(repo);
  // With both options the same command works: the refusals above are about the input.
  ok(record(repo, ['decision', ...DECISION_ARGS]));
});

// --- record part ---

test('[REC-8][TL-1] record part without --yes shows the part it would write, 3 after 1 and 2, and writes nothing', (t) => {
  const { repo } = setup(t, { rest: PARTS });
  const r = record(repo, ['part', '--text', 'Date format']);
  ok(r);
  assert.ok(lines(r.stdout).some((l) => l.includes('3. Date format')), `should show "3. Date format":\n${r.stdout}`);
  clean(repo);
  assertFrame(r.stdout);
});

test('[REC-8] record part --yes appends "3. Date format" at the end of ## Parts, the last section; nothing else changes', (t) => {
  const { repo, md } = setup(t, { rest: PARTS });
  const r = record(repo, ['part', '--text', 'Date format', '--yes']);
  ok(r);
  assert.equal(read(repo), `${md}3. Date format\n`);
  assertFrame(r.stdout);
});

test('[REC-8] record part --yes puts the part at the end of ## Parts when another section follows it', (t) => {
  const notes = '\n## Notes\n\nThe owner may split the email link out.\n';
  const { repo, md } = setup(t, { rest: PARTS + notes });
  ok(record(repo, ['part', '--text', 'Date format', '--yes']));
  assert.equal(read(repo), md.replace(PARTS, `${PARTS}3. Date format\n`));
});

test('[REC-8] record part --yes on a request with no ## Parts creates it at the end, with 1', (t) => {
  const { repo, md } = setup(t);
  assert.ok(!md.includes('## Parts'), 'the fixture: no ## Parts');
  ok(record(repo, ['part', '--text', 'Date format', '--yes']));
  const now = read(repo);
  assert.ok(now.startsWith(md), `request.md is kept as it was, up to the new section:\n${now}`);
  assert.deepEqual(shape(now.slice(md.length)), ['## Parts', '1. Date format']);
});

test('[REC-8] record part --yes on a request with no ## Parts starts at 1, though another section holds a numbered list ("9." under the owner\'s words, or under ## Notes)', (t) => {
  const note = '9. Numbered background note.\n';
  const entry = '- 2026-09-20 owner chat, snapshot origin/2026-09-20-owner-words.md\n';
  const cases = {
    'the owner\'s words': (md) => md.replace(entry, `${entry}${note}`),
    '## Notes': (md) => `${md}\n## Notes\n\n${note}`,
  };
  for (const [where, edit] of Object.entries(cases)) {
    const repo = makeRepo(t);
    addRequest(repo, 'invoice-download', null);
    const md = edit(read(repo));
    repo.write(MD, md);
    repo.commit('invoice-download: request', { date: '2026-09-21T12:00:00Z' });
    assert.ok(md.includes(note) && !md.includes('## Parts'), `the fixture: a numbered list under ${where}, no ## Parts`);
    ok(record(repo, ['part', '--text', 'Dates', '--yes']));
    const now = read(repo);
    assert.ok(now.startsWith(md), `${where}: request.md is kept as it was, up to the new section:\n${now}`);
    assert.deepEqual(shape(now.slice(md.length)), ['## Parts', '1. Dates'], `${where}:\n${now}`);
  }
});

test('[REC-8] record part without --text exits 2, and no flag marks a part done (--done exits 2); nothing is written, even with --yes', (t) => {
  const { repo } = setup(t, { rest: PARTS });
  for (const args of [[], ['--done'], ['--text', 'CSV export', '--done']]) {
    for (const extra of [[], ['--yes']]) {
      const r = record(repo, ['part', ...args, ...extra]);
      assert.equal(r.code, 2, `${args.join(' ')} ${extra.join(' ')}:\n${both(r)}`);
      clean(repo);
    }
  }
  const unknown = record(repo, ['part', '--text', 'Date format', '--yes'], 'no-such-request');
  assert.equal(unknown.code, 2, both(unknown));
  clean(repo);
  // With --text and no --done the same command works: the refusals above are about the input.
  ok(record(repo, ['part', '--text', 'Date format']));
});

test('[REC-7][REC-8][REC-12] decisions and parts recorded on a branch, a commit each, keep the append-only check clean: no not ok, check --strict exits 0', (t) => {
  const { repo } = setup(t, { rest: PARTS });
  repo.git(['checkout', '-q', '-b', 'decide']);
  const steps = [
    ['decision', ...DECISION_ARGS, '--yes'],
    ['part', '--text', 'Date format', '--yes'],
    ['decision', '--source', 'the owner', '--text', 'Dates in UTC.', '--yes'],
    ['part', '--text', 'Time zones', '--yes'],
  ];
  steps.forEach((args, i) => {
    ok(record(repo, args));
    repo.commit(message(`Record ${args[0]}`, { tier: '2 — records' }), { date: `2026-09-2${2 + i}T12:00:00Z` });
  });
  const md = read(repo);
  assert.ok(md.includes(`${DECIDED}\n- D6, 2026-09-27. Source: the owner. Dates in UTC.\n`), `D5 then D6:\n${md}`);
  assert.ok(md.includes('2. Email link\n3. Date format\n4. Time zones\n'), `parts 3 and 4:\n${md}`);
  const out = check(repo, '--all');
  assert.deepEqual(checkHints(out).filter((l) => kindOf(l) === 'not ok'), [], `no not ok:\n${out}`);
  strict(repo, 0);
});

// --- a part naming a child request ---

// The signed parent invoice-epic, whose parts name the children `children`
// ({ name: { dir, status, signed } }; no ## Parts when there are none), each
// written with an organized section of its own (R1 is not the parent's
// words), then committed.
function epic(t, children) {
  const repo = makeRepo(t);
  const names = Object.keys(children);
  const parts = names.map((n, i) => `${i + 1}. ${n}: request ${n}\n`).join('');
  addRequest(repo, 'invoice-epic', null, { rest: parts && `\n## Parts\n\n${parts}` });
  const own = ORG.replace('as CSV', 'as a CSV file');
  for (const [name, { dir = `requests/${name}`, status = 'open', signed = true }] of Object.entries(children)) {
    addRequest(repo, name, null, { dir, status, signed, org: own, signedText: own });
  }
  repo.commit('Records', { date: '2026-09-21T12:00:00Z' });
  return repo;
}
function contextNotes(repo) {
  const r = runAl(repo.dir, ['context', 'invoice-epic']);
  ok(r);
  assert.ok(lines(r.stdout).length <= 12, `more than 12 lines:\n${r.stdout}`);
  return r.stdout;
}

test('[REC-8] the parent\'s context shows each named child\'s state as a note: open, blocked', (t) => {
  const repo = epic(t, { 'email-link': {}, 'csv-rows': { signed: false } });
  const blockedChild = runAl(repo.dir, ['context', 'csv-rows']);
  assert.match(lines(blockedChild.stdout)[0], /^BLOCKED/, `the fixture: csv-rows is blocked:\n${blockedChild.stdout}`);
  const out = contextNotes(repo);
  hint(out, 'note', 'email-link', /\bopen\b/);
  hint(out, 'note', 'csv-rows', /\bblocked\b/i);
});

test('[REC-8] the parent\'s context shows each named child\'s state as a note: concluded, dropped', (t) => {
  const repo = epic(t, {
    'iso-dates': { dir: 'requests/archive/iso-dates', status: 'concluded' },
    'old-pdf': { dir: 'requests/archive/old-pdf', status: 'dropped' },
  });
  const out = contextNotes(repo);
  hint(out, 'note', 'iso-dates', /\bconcluded\b/);
  hint(out, 'note', 'old-pdf', /\bdropped\b/);
});

test('[REC-8] a part recorded with record part naming a child shows that child\'s state on the parent\'s context', (t) => {
  const repo = epic(t, {});
  addRequest(repo, 'email-link', null, { org: ORG.replace('as CSV', 'as a CSV file'), signedText: ORG.replace('as CSV', 'as a CSV file') });
  repo.commit('email-link: request', { date: '2026-09-22T12:00:00Z' });
  ok(record(repo, ['part', '--text', 'Email link: request email-link', '--yes'], 'invoice-epic'));
  assert.ok(repo.read('requests/invoice-epic/request.md').toString().includes('1. Email link: request email-link\n'), 'the part is written');
  hint(contextNotes(repo), 'note', 'email-link', /\bopen\b/);
});
