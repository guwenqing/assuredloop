// al-v4 check on the planted defects D01-D14 of T2 and their clean controls
// (#179, task T10). Each pair is two states of the invoicer world
// (test/v4/fixtures/invoicer/cases/dNN.yaml). The core assertion: the findings
// of the defect minus those of the control, compared on (severity, code, id),
// are exactly the planted ones; and the reverse difference is exactly what the
// control alone should show.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, invoicer, keys, minus } from './helpers/invoicer.js';
import { al, readYaml, show } from './helpers/project.js';

// The expected differences, from t2 defects.yaml and defects-repair.yaml with
// the final design (no rule-check hint).
const PAIRS = {
  d01: { name: 'an unsigned promise change', defect: ['not ok signoff-coverage INV-6'], control: [] },
  d02: { name: 'a new rule labelled data', defect: ['hint promise-kind credit-notes/SP-2'], control: [] },
  d03: { name: 'a code-only promise change claimed as a fix', defect: [], control: [] },
  d04: {
    name: 'two replacements of one ID with missing changes links',
    defect: ['hint near-match link-45/SP-2', 'hint near-match link-refresh/SP-2'],
    control: ['hint overlap link-45/SP-2', 'hint overlap link-refresh/SP-2'],
  },
  d05: { name: 'a test that cites the right ID and checks another condition', defect: [], control: [] },
  d06: { name: 'a drifted consolidation', defect: ['hint disposition invoice-exports/SP-10'], control: [] },
  d07: { name: 'a stale base after indexing', defect: ['hint stale-base reminder-emails/SP-4'], control: [] },
  d08: { name: 'a stale AI summary with a surviving quote', defect: ['hint stale-ai-hint INV-8'], control: [] },
  // D09: INV-4 is adopted (decision D12); edited with no link on path 0, it gets no-link back.
  d09: { name: 'a wrong path claim', defect: ['hint no-link INV-4', 'not ok path-claim INV-4', 'not ok signoff-coverage INV-4'], control: [] },
  d10: { name: 'a typo claim that changes a MUST', defect: ['hint typo-mark EXP-9'], control: [] },
  d11: { name: 'a typo claim that changes "only" to "all"', defect: ['hint typo-mark EXP-10'], control: [] },
  d12: { name: 'a typo claim that removes a doubled "MUST MUST"', defect: [], control: [] },
  d13: { name: 'a 1d claim that adds a component', defect: ['hint no-link INV-17', 'not ok path-claim INV-17'], control: [] },
  d14: { name: 'a code example whose trailing spaces change', defect: ['hint disposition csv-header/SP-2'], control: [] },
};

const run = (t, name, arm, ...args) => {
  const dir = invoicer(t, name, arm);
  return { dir, ...check(dir, ...args) };
};
const pair = (t, name) => ({ defect: run(t, name, 'defect'), control: run(t, name, 'control') });
const all = (r, severity, code, id) => r.findings.filter((f) => f.severity === severity && f.code === code && f.id === id);
const one = (r, severity, code, id) => {
  const found = all(r, severity, code, id);
  assert.ok(found.length >= 1, `a "${severity} ${code}" line on ${id}:\n${show(r)}`);
  return found[0];
};
const none = (r, severity, code, id) => assert.deepEqual(all(r, severity, code, id), [], show(r));
const results = (r, file) => r.findings.filter((f) => f.code === 'result' && f.file === `.assuredloop/results/${file}`);
const both = (p) => `--- defect\n${show(p.defect)}--- control\n${show(p.control)}`;

for (const [name, want] of Object.entries(PAIRS)) {
  const id = name.toUpperCase();
  test(`${id} defect (${want.name}): defect minus control is ${JSON.stringify(want.defect)}`, (t) => {
    const p = pair(t, name);
    assert.equal(p.defect.code, 0, show(p.defect));
    assert.deepEqual(minus(p.defect.findings, p.control.findings), [...want.defect].sort(), both(p));
  });
  test(`${id} control (${want.name}): control minus defect is ${JSON.stringify(want.control)}`, (t) => {
    const p = pair(t, name);
    assert.equal(p.control.code, 0, show(p.control));
    assert.deepEqual(minus(p.control.findings, p.defect.findings), [...want.control].sort(), both(p));
  });
}

test('the base world with no change: no not ok and no hint; --strict exits 0', (t) => {
  const r = run(t, 'clean');
  assert.equal(r.code, 0, show(r));
  assert.deepEqual(r.findings.filter((f) => f.severity !== 'info').map((f) => f.line), [], show(r));
  const s = run(t, 'clean', undefined, '--strict');
  assert.equal(s.code, 0, show(s));
});

test('D01: the defect\'s finding names the definition; both arms show stale-base on reminder-emails/SP-3', (t) => {
  const p = pair(t, 'd01');
  assert.equal(one(p.defect, 'not ok', 'signoff-coverage', 'INV-6').file, 'specs/invoices.md');
  one(p.defect, 'hint', 'stale-base', 'reminder-emails/SP-3');
  one(p.control, 'hint', 'stale-base', 'reminder-emails/SP-3');
  none(p.control, 'not ok', 'signoff-coverage', 'INV-6');
});

test('D02: promise kind? on the data paragraph that holds MUST NOT; no signoff-coverage in either arm', (t) => {
  const p = pair(t, 'd02');
  assert.match(one(p.defect, 'hint', 'promise-kind', 'credit-notes/SP-2').msg, /promise kind\?/);
  for (const r of [p.defect, p.control]) {
    assert.deepEqual(r.findings.filter((f) => f.code === 'signoff-coverage'), [], show(r));
  }
});

test('D03: both arms show the W3 result as "declared inputs unchanged", never "applies"', (t) => {
  const p = pair(t, 'd03');
  const commit = String(readYaml(p.defect.dir, '.assuredloop/results/export-link-test.yaml').commit);
  for (const r of [p.defect, p.control]) {
    const lines = results(r, 'export-link-test.yaml');
    assert.equal(lines.length, 1, show(r));
    assert.equal(lines[0].severity, 'info', show(r));
    assert.ok(lines[0].msg.includes('declared inputs unchanged since'), show(r));
    assert.ok(lines[0].line.includes(commit.slice(0, 7)), `the line names the commit ${commit}:\n${show(r)}`);
    assert.doesNotMatch(r.stdout, /\bapplies\b/, show(r));
  }
});

test('D04: near-match asks "does this change EXP-4?" on both SP-2 of the defect; the control has no near-match', (t) => {
  const p = pair(t, 'd04');
  for (const id of ['link-refresh/SP-2', 'link-45/SP-2']) {
    assert.ok(one(p.defect, 'hint', 'near-match', id).msg.includes('does this change EXP-4?'), show(p.defect));
    none(p.defect, 'hint', 'overlap', id);
  }
  assert.deepEqual(p.control.findings.filter((f) => f.code === 'near-match'), [], show(p.control));
});

test('D05: both arms show the W3 result as "does not apply to the current text"', (t) => {
  const p = pair(t, 'd05');
  for (const r of [p.defect, p.control]) {
    const lines = results(r, 'export-link-test.yaml');
    assert.equal(lines.length, 1, show(r));
    assert.ok(lines[0].msg.includes('does not apply to the current text'), show(r));
    assert.doesNotMatch(r.stdout, /\bapplies\b/, show(r));
  }
});

test('D07: the defect\'s stale-base stays after another plain al-v4 index', (t) => {
  const dir = invoicer(t, 'd07', 'defect');
  const r = al(dir, ['index']);
  assert.equal(r.code, 0, show(r));
  one(check(dir), 'hint', 'stale-base', 'reminder-emails/SP-4');
  const control = invoicer(t, 'd07', 'control');
  assert.equal(al(control, ['index']).code, 0);
  none(check(control), 'hint', 'stale-base', 'reminder-emails/SP-4');
});

test('D08: stale-ai-hint on INV-8 although its quote still matches; none in the control', (t) => {
  const p = pair(t, 'd08');
  one(p.defect, 'hint', 'stale-ai-hint', 'INV-8');
  none(p.control, 'hint', 'stale-ai-hint', 'INV-8');
});

const typoWords = (r, id) => {
  const lines = r.findings.filter((f) => f.severity === 'info' && f.code === 'typo-words' && f.id === id);
  assert.ok(lines.length >= 1, `an "info typo-words" line on ${id}:\n${show(r)}`);
  return lines.map((f) => f.msg).join('\n');
};
const sensitive = (r, id) => assert.ok(
  one(r, 'hint', 'typo-mark', id).msg.includes('meaning-sensitive; review the typo claim'), show(r));

test('D10: the words MUST -> SHOULD and nubmer -> number and the sentence; the control shows only nubmer -> number', (t) => {
  const p = pair(t, 'd10');
  sensitive(p.defect, 'EXP-9');
  const words = typoWords(p.defect, 'EXP-9');
  for (const s of ['MUST -> SHOULD', 'nubmer -> number', 'A monthly export SHOULD list each invoice once, sorted by invoice number.']) {
    assert.ok(words.includes(s), `${s}:\n${show(p.defect)}`);
  }
  const control = typoWords(p.control, 'EXP-9');
  assert.ok(control.includes('nubmer -> number'), show(p.control));
  assert.ok(!control.includes('MUST ->'), show(p.control));
  none(p.control, 'hint', 'typo-mark', 'EXP-9');
});

test('D11: the words only -> all and overdeu -> overdue; the control shows only overdeu -> overdue', (t) => {
  const p = pair(t, 'd11');
  sensitive(p.defect, 'EXP-10');
  const words = typoWords(p.defect, 'EXP-10');
  for (const s of ['only -> all', 'overdeu -> overdue']) assert.ok(words.includes(s), `${s}:\n${show(p.defect)}`);
  const control = typoWords(p.control, 'EXP-10');
  assert.ok(control.includes('overdeu -> overdue'), show(p.control));
  assert.ok(!control.includes('only ->'), show(p.control));
  none(p.control, 'hint', 'typo-mark', 'EXP-10');
});

test('D12: typo-mark on EXP-11 in both arms; the shown words tell them apart (MUST -> NOT against a removed MUST)', (t) => {
  const p = pair(t, 'd12');
  sensitive(p.defect, 'EXP-11');
  sensitive(p.control, 'EXP-11');
  assert.ok(typoWords(p.defect, 'EXP-11').includes('MUST -> NOT'), show(p.defect));
  const control = typoWords(p.control, 'EXP-11');
  assert.ok(control.includes('MUST ->'), show(p.control));
  assert.ok(!control.includes('NOT'), show(p.control));
});

test('D09: path-claim and signoff-coverage are not ok on INV-4; the control (path 1, signed) has neither', (t) => {
  const p = pair(t, 'd09');
  for (const code of ['path-claim', 'signoff-coverage']) {
    assert.equal(one(p.defect, 'not ok', code, 'INV-4').file, 'specs/invoices.md');
    none(p.control, 'not ok', code, 'INV-4');
  }
});

test('D13: path-claim on INV-17 (a 1d claim adds a component); both arms show lines -> line items on INV-8', (t) => {
  const p = pair(t, 'd13');
  one(p.defect, 'not ok', 'path-claim', 'INV-17');
  for (const r of [p.defect, p.control]) assert.ok(typoWords(r, 'INV-8').includes('lines -> line items'), show(r));
  assert.deepEqual(p.control.findings.filter((f) => f.code === 'path-claim'), [], show(p.control));
});

test('D06 and D14 under --strict: the invalid disposition is not ok and exits 1; the control exits 0', (t) => {
  for (const [name, id] of [['d06', 'invoice-exports/SP-10'], ['d14', 'csv-header/SP-2']]) {
    const defect = run(t, name, 'defect', '--strict');
    assert.equal(defect.code, 1, show(defect));
    one(defect, 'not ok', 'disposition', id);
    none(defect, 'hint', 'disposition', id);
    const control = run(t, name, 'control', '--strict');
    assert.equal(control.code, 0, show(control));
    assert.deepEqual(control.findings.filter((f) => f.code === 'disposition'), [], show(control));
  }
});

test('--strict raises no-link to not ok; the judgment hints stay hints and do not change the exit code', (t) => {
  const d13 = run(t, 'd13', 'defect', '--strict');
  one(d13, 'not ok', 'no-link', 'INV-17');
  for (const [name, code, id] of [
    ['d02', 'promise-kind', 'credit-notes/SP-2'],
    ['d04', 'near-match', 'link-45/SP-2'],
    ['d07', 'stale-base', 'reminder-emails/SP-4'],
    ['d08', 'stale-ai-hint', 'INV-8'],
    ['d10', 'typo-mark', 'EXP-9'],
  ]) {
    const r = run(t, name, 'defect', '--strict');
    assert.equal(r.code, 0, `${name}: only judgment hints, so --strict exits 0\n${show(r)}`);
    one(r, 'hint', code, id);
    assert.deepEqual(r.findings.filter((f) => f.severity === 'not ok').map((f) => f.line), [], show(r));
  }
});

test('without --strict the check exits 0 on every defect, not ok lines included', (t) => {
  for (const name of Object.keys(PAIRS)) {
    const r = run(t, name, 'defect');
    assert.equal(r.code, 0, `${name}\n${show(r)}`);
  }
  assert.ok(keys(run(t, 'd09', 'defect').findings).some((k) => k.startsWith('not ok ')), 'D09 prints not ok lines');
});

test('the claim is the newest Tier line in base..HEAD; with none, no path check runs and Not known says so', (t) => {
  const newest = run(t, 'd09', 'newest');
  one(newest, 'not ok', 'path-claim', 'INV-4');
  const unclaimed = run(t, 'd09', 'unclaimed');
  assert.deepEqual(unclaimed.findings.filter((f) => f.code === 'path-claim'), [], show(unclaimed));
  assert.equal(unclaimed.findings.filter((f) => f.severity === 'hint' && f.code === 'no-claim').length, 1, show(unclaimed));
  const notKnown = unclaimed.stdout.split('\n').find((l) => l.startsWith('Not known '));
  assert.match(notKnown ?? '', /path check/, show(unclaimed));
});
