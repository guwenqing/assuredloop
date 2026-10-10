// al search: the three queries, exact IDs, roles and the output (#181, T13
// and T14; design.md 11 "Queries"; interface.md "al search"). Each test runs
// at level 0, level 1 and level 2 (the fixed test embedder): every level keeps
// exact-ID lookup, the roles, the commit identity and the history scope.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { git, read, write } from './helpers/project.js';
import {
  A_TEXT, ROW_FIELDS, asRow, buildWorld, exportRows, key, run, runOk, runRefused, search, show,
} from './helpers/search.js';

const cleanups = [];
after(() => cleanups.forEach((f) => f()));
let world = null;
// The world with the fixed embedder installed, and its export at HEAD and at A.
function get() {
  if (!world) {
    const W = buildWorld({ after: (f) => cleanups.push(f) }, { embedder: {} });
    const byKey = (rows) => new Map(rows.map((r) => [key(r), r]));
    world = { W, rows: byKey(exportRows(W.dir).rows), rowsAtA: byKey(exportRows(W.dir, ['--at', W.A]).rows) };
  }
  return world;
}

// Each hit is an export row of the selected commit, shown with the same role and fields.
function assertHitsAreRows(out, rows) {
  for (const h of out.hits) {
    const row = rows.get(key(h));
    assert.ok(row, `hit ${key(h)} is an export row`);
    assert.deepEqual(asRow(h), row, `hit ${h.id} v${h.version} shows its export row as it is (role ${row.role})`);
  }
}
const ids = (out) => out.hits.map((h) => h.id);
const idRoles = (out) => out.hits.map((h) => `${h.id} v${h.version} ${h.role}`);

// The word hits of `out` are exactly `want` at levels 0 and 1. At level 2 the
// vectors add the nearest embedded rows, so `want` is only included there.
function wordHits(out, want, level) {
  if (level < 2) assert.deepEqual(idRoles(out), want);
  else for (const w of want) assert.ok(idRoles(out).includes(w), `${w} in:\n${idRoles(out).join('\n')}`);
}
// No hit is one of `rows` ("<id> v<n>").
function none(out, rows) {
  const got = out.hits.map((h) => `${h.id} v${h.version}`);
  for (const r of rows) assert.ok(!got.includes(r), `${r} is not a hit:\n${idRoles(out).join('\n')}`);
}

for (const level of [0, 1, 2]) {
  const L = `level ${level}:`;

  test(`${L} --json: one object with level, fallback, commit, query and ranked hits`, () => {
    const { W, rows } = get();
    const out = search(W.dir, ['export', 'link'], { level });
    assert.equal(out.level, level, 'the level that answered');
    assert.equal(out.fallback, null, 'no fallback');
    assert.equal(out.commit, W.D, 'the selected commit, in full');
    assert.deepEqual(out.query, { words: 'export link', id: null, change: null, history: false });
    assert.ok(out.hits.length > 0);
    out.hits.forEach((h, i) => {
      assert.equal(h.rank, i + 1, 'ranks from 1');
      assert.equal(typeof h.exact, 'boolean');
      for (const f of ROW_FIELDS) assert.ok(Object.hasOwn(h, f), `hit has ${f}`);
    });
    assertHitsAreRows(out, rows);
  });

  test(`${L} the default query is the current system: baseline rows only`, () => {
    const { W, rows } = get();
    const out = search(W.dir, ['export', 'link', '--limit', '50'], { level });
    assert.ok(ids(out).includes('EXP-4'), idRoles(out).join('\n'));
    for (const h of out.hits) assert.equal(h.role, 'baseline', `${h.id} v${h.version}`);
    assert.ok(!ids(out).includes('link-spike/SP-2'), 'a spike candidate is not the current system');
    assertHitsAreRows(out, rows);
    const reminder = search(W.dir, ['reminder', '--limit', '50'], { level });
    wordHits(reminder, ['EXP-7 v1 baseline'], level);
    for (const h of reminder.hits) assert.equal(h.role, 'baseline', `${h.id} v${h.version}`);
  });

  test(`${L} a replaced or removed text is not in the default query`, () => {
    const { W } = get();
    const spread = search(W.dir, ['spreadsheet'], { level });
    none(spread, ['EXP-2 v1']);
    if (level < 2) assert.deepEqual(spread.hits, [], 'EXP-2 v1 is history');
    const fwd = search(W.dir, ['forwarded'], { level });
    none(fwd, ['EXP-5 v1']);
    if (level < 2) assert.deepEqual(fwd.hits, [], 'EXP-5 was removed');
  });

  test(`${L} --history adds the history rows, shown as history, never as current`, () => {
    const { W, rows } = get();
    const out = search(W.dir, ['spreadsheet', '--history'], { level });
    assert.deepEqual(out.query.history, true);
    wordHits(out, ['EXP-2 v1 history'], level);
    assertHitsAreRows(out, rows);
    const removed = search(W.dir, ['forwarded', '--history'], { level });
    wordHits(removed, ['EXP-5 v1 history'], level);
    const all = search(W.dir, ['reminder', '--history', '--limit', '50'], { level });
    const got = new Set(idRoles(all));
    for (const want of ['EXP-7 v1 baseline', 'reminder-emails/SP-4 v1 history', 'dropped-idea/SP-2 v1 history', 'old-numbers/SP-2 v1 history']) {
      assert.ok(got.has(want), `${want} in:\n${[...got].join('\n')}`);
    }
    for (const h of all.hits) assert.ok(['baseline', 'history'].includes(h.role), `${h.id}: the default query + history has no ${h.role}`);
    assertHitsAreRows(all, rows);
  });

  test(`${L} --change <request>: baseline, plus that request's proposal, source and evidence rows`, () => {
    const { W, rows } = get();
    const out = search(W.dir, ['reminder', '--change', 'reminder-emails', '--limit', '50'], { level });
    assert.equal(out.query.change, 'reminder-emails');
    const got = new Set(ids(out));
    for (const want of ['EXP-7', 'reminder-emails/SP-2', 'reminder-emails/SP-3', 'reminder-emails/D1', 'src/reminders.js',
      '.assuredloop/results/reminders-test.yaml']) {
      assert.ok(got.has(want), `${want} in:\n${idRoles(out).join('\n')}`);
    }
    assert.ok(out.hits.some((h) => h.id === 'reminder-emails/R1' && h.version === 2 && h.role === 'source'), 'the current requirement version');
    for (const h of out.hits) {
      assert.notEqual(h.role, 'history', `${h.id} v${h.version}: no history without --history`);
      if (h.role !== 'baseline') assert.ok(h.doc_or_request === 'reminder-emails' || h.role === 'evidence', `${h.id} is of the selected request`);
    }
    assert.ok(!got.has('link-spike/SP-2'), 'another request\'s spike is not in this change\'s context');
    assert.ok(!got.has('.assuredloop/results/csv-review.yaml'), 'a result whose inputs are not this request\'s outputs is not its evidence');
    assertHitsAreRows(out, rows);
  });

  test(`${L} --change of a spike adds its spike rows and its question`, () => {
    const { W, rows } = get();
    const out = search(W.dir, ['link', '--change', 'link-spike', '--limit', '50'], { level });
    const got = new Set(idRoles(out));
    assert.ok(got.has('link-spike/SP-2 v1 spike'), [...got].join('\n'));
    assert.ok(got.has('EXP-4 v1 baseline'), [...got].join('\n'));
    const q = search(W.dir, ['support', 'calls', '--change', 'link-spike', '--limit', '50'], { level });
    assert.ok(idRoles(q).includes('link-spike/Q1 v1 source'), idRoles(q).join('\n'));
    assertHitsAreRows(out, rows);
  });

  test(`${L} --change with --history adds the history rows too`, () => {
    const { W } = get();
    const out = search(W.dir, ['reminder', '--change', 'reminder-emails', '--history', '--limit', '50'], { level });
    const got = new Set(idRoles(out));
    for (const want of ['reminder-emails/SP-4 v1 history', 'reminder-emails/SP-5 v1 history', 'reminder-emails/SP-2 v1 proposal']) {
      assert.ok(got.has(want), `${want} in:\n${[...got].join('\n')}`);
    }
  });

  test(`${L} --change of an unknown request is a refusal`, () => {
    const { W } = get();
    runRefused(W.dir, ['search', 'reminder', '--change', 'no-such-request', ...(level === 2 ? [] : ['--level', String(level)])]);
    assert.equal(search(W.dir, ['reminder', '--change', 'reminder-emails'], { level }).query.change, 'reminder-emails', 'a known request is no refusal');
  });

  test(`${L} --id: exact lookup in the ID column, never through the words`, () => {
    const { W, rows } = get();
    const exp4 = search(W.dir, ['--id', 'EXP-4'], { level });
    assert.deepEqual(exp4.query.id, 'EXP-4');
    assert.deepEqual(idRoles(exp4), ['EXP-4 v1 baseline'], 'ADR-3-1 names EXP-4 in its text and is not returned');
    assert.equal(exp4.hits[0].exact, true);
    assertHitsAreRows(exp4, rows);
    assert.deepEqual(search(W.dir, ['--id', 'EXP-2'], { level }).hits.map((h) => h.version), [2], 'history rows only with --history');
    assert.deepEqual(idRoles(search(W.dir, ['--id', 'EXP-2', '--history'], { level })).sort(), ['EXP-2 v1 history', 'EXP-2 v2 baseline']);
    assert.deepEqual(search(W.dir, ['--id', 'exp-4'], { level }).hits, [], 'exact: another case is another ID');
    assert.deepEqual(search(W.dir, ['--id', 'EXP-'], { level }).hits, [], 'exact: no prefix match');
  });

  test(`${L} --id with identical local IDs in several requests: only the named request's row`, () => {
    const { W } = get();
    assert.deepEqual(idRoles(search(W.dir, ['--id', 'reminder-emails/SP-2'], { level })), ['reminder-emails/SP-2 v1 proposal'],
      'a proposal ID resolves in the default query too');
    assert.deepEqual(idRoles(search(W.dir, ['--id', 'link-spike/SP-2'], { level })), ['link-spike/SP-2 v1 spike']);
    assert.deepEqual(search(W.dir, ['--id', 'SP-2'], { level }).hits, [], 'a bare SP-2 is no ID in this repo');
    assert.deepEqual(search(W.dir, ['--id', 'old-numbers/SP-2'], { level }).hits, [], 'an archived request is history');
    assert.deepEqual(idRoles(search(W.dir, ['--id', 'old-numbers/SP-2', '--history'], { level })), ['old-numbers/SP-2 v1 history']);
    assert.deepEqual(idRoles(search(W.dir, ['--id', 'ADR-4'], { level })), ['ADR-4 v1 proposal'], 'a proposed ADR');
    assert.deepEqual(idRoles(search(W.dir, ['--id', 'src/reminders.js'], { level })), ['src/reminders.js v1 evidence']);
  });

  test(`${L} an ID among the words resolves exactly and comes first, marked exact`, () => {
    const { W, rows } = get();
    const out = search(W.dir, ['reminder-emails/SP-2', 'reminder', '--limit', '50'], { level });
    assert.equal(out.hits[0].id, 'reminder-emails/SP-2');
    assert.equal(out.hits[0].exact, true);
    const exact = out.hits.filter((h) => h.exact).map((h) => h.id);
    assert.deepEqual(exact, ['reminder-emails/SP-2'], 'no other SP-2 resolves');
    for (const h of out.hits.slice(1)) assert.equal(h.exact, false);
    assertHitsAreRows(out, rows);
    const spec = search(W.dir, ['EXP-4'], { level });
    assert.equal(spec.hits[0].id, 'EXP-4');
    assert.equal(spec.hits[0].exact, true);
    assert.equal(spec.hits.filter((h) => h.exact).length, 1);
  });

  test(`${L} --limit caps the word hits`, () => {
    const { W } = get();
    const many = search(W.dir, ['reminder', '--change', 'reminder-emails', '--limit', '50'], { level });
    assert.ok(many.hits.length >= 3, idRoles(many).join('\n'));
    const two = search(W.dir, ['reminder', '--change', 'reminder-emails', '--limit', '2'], { level });
    assert.equal(two.hits.length, 2);
  });

  test(`${L} --at selects the commit: the rows as at that commit`, () => {
    const { W, rowsAtA } = get();
    const out = search(W.dir, ['forwarded', '--at', W.A], { level });
    assert.equal(out.commit, W.A);
    wordHits(out, ['EXP-5 v1 baseline'], level);
    for (const h of out.hits) assert.equal(h.commit, W.A, 'a current row at A is read at A');
    assertHitsAreRows(out, rowsAtA);
    const back = search(W.dir, ['forwarded'], { level });
    none(back, ['EXP-5 v1']);
    if (level < 2) assert.deepEqual(back.hits, [], 'back at HEAD, EXP-5 is not current again');
    const spread = search(W.dir, ['spreadsheet', '--at', W.A], { level });
    wordHits(spread, ['EXP-2 v1 baseline'], level);
  });

  test(`${L} --section adds the rows under the same heading path, in file order`, () => {
    const { W } = get();
    const out = search(W.dir, ['--id', 'EXP-4', '--section', '--at', W.A], { level });
    const sec = out.hits[0].section;
    assert.ok(Array.isArray(sec), 'section is a list of rows');
    const secIds = sec.map((r) => r.id);
    assert.ok(secIds.includes('EXP-4') && secIds.includes('EXP-5'), secIds.join(', '));
    assert.ok(secIds.indexOf('EXP-4') < secIds.indexOf('EXP-5'), 'file order');
    for (const bad of ['EXP-2', 'EXP-7']) assert.ok(!secIds.includes(bad), `${bad} is under another heading`);
    for (const r of sec) {
      assert.equal(r.file, 'specs/exports.md');
      assert.equal(r.commit, W.A);
    }
    const plain = search(W.dir, ['--id', 'EXP-4'], { level });
    assert.ok(!Object.hasOwn(plain.hits[0], 'section'), 'no section without --section');
  });

  test(`${L} uncommitted text is not searched`, () => {
    const { W } = get();
    const spec = 'specs/exports.md';
    write(W.dir, spec, `${read(W.dir, spec)}\n<!-- EXP-9 rule -->\n\nAn uncommitted zebra rule.\n`);
    try {
      const out = search(W.dir, ['zebra'], { level });
      assert.ok(!out.hits.some((h) => h.text.includes('zebra')), idRoles(out).join('\n'));
      if (level < 2) assert.deepEqual(out.hits, []);
    } finally {
      git(W.dir, 'checkout', '-q', '--', spec);
    }
  });

  test(`${L} neither words nor --id is a refusal`, () => {
    const { W } = get();
    runRefused(W.dir, ['search', ...(level === 2 ? [] : ['--level', String(level)])]);
    assert.equal(search(W.dir, ['--id', 'EXP-4'], { level }).hits.length, 1, 'with --id it answers');
  });

  test(`${L} the text output says the level and shows each hit with its role and commit`, () => {
    const { W } = get();
    const lv = level === 2 ? [] : ['--level', String(level)];
    const r = runOk(W.dir, ['search', '--id', 'EXP-4', ...lv]);
    const lines = r.stdout.split('\n');
    assert.match(lines[0], new RegExp(`^Level\\s+${level}\\b`), show(r));
    if (level === 2) assert.match(lines[0], /test-fixed/, 'level 2 names its model');
    assert.ok(!lines.some((l) => /^Fallback\b/.test(l)), 'no Fallback line when no fallback happened');
    assert.ok(lines.some((l) => /^Query\b/.test(l)), show(r));
    assert.ok(lines.some((l) => /^\s*1\. EXP-4 baseline (exact )?rule specs\/exports\.md v1 @[0-9a-f]{7,40}\b/.test(l)), show(r));
    assert.ok(lines.some((l) => l.includes(A_TEXT.exp4)), 'the text of the hit');
    const h = runOk(W.dir, ['search', '--id', 'EXP-2', '--history', ...lv]);
    const hl = h.stdout.split('\n');
    assert.ok(hl.some((l) => /^\s*\d+\. EXP-2 history (exact )?rule specs\/exports\.md v1 @/.test(l)), show(h));
    assert.ok(hl.some((l) => /^\s*\d+\. EXP-2 baseline (exact )?rule specs\/exports\.md v2 @/.test(l)), show(h));
    assert.ok(!hl.some((l) => /EXP-2 baseline .* v1 /.test(l)), 'a history row is never shown as baseline');
  });
}

test('the search writes nothing in the working tree; the index is in the git dir', () => {
  const { W } = get();
  const before = git(W.dir, 'status', '--porcelain');
  for (const level of [0, 1, 2]) search(W.dir, ['reminder'], { level });
  assert.equal(git(W.dir, 'status', '--porcelain'), before);
  const r = run(W.dir, ['search', 'reminder', '--level', '1']);
  assert.equal(r.code, 0, show(r));
});
