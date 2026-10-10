// The T3 reviewer questions (validation t2/questions.yaml) answered from the
// T11 views (#179, task T11). Each test asks the view of the question's state
// and checks that the output holds the facts of the right answer, and not
// those of a wrong option where that is clear.
// Not used: Q02 (the change-context search, T13); Q11 (cr-squash: a check
// run again on an archived request, which the views do not do); Q13 and Q14
// (market-report: the check's result lines are tested in check-results.test.js,
// and no spec ID there is named by the result); Q15, Q16 and Q18 (output
// repos and their PRs, T12; the base history has no PR #33 or #38).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invoicer } from './helpers/invoicer.js';
import { conclude, has, hasNot, show, view, word } from './helpers/views.js';

const ctx = (t, name, ...args) => view(invoicer(t, name), ['context', ...args]);

test('Q01 (cr-45): the link works 30 minutes today: EXP-4 still says 30, not 45', (t) => {
  const r = ctx(t, 'cr-45', 'EXP-4');
  has(r, 'The export link MUST expire 30 minutes after the email is sent.');
  hasNot(r, 'MUST expire 45 minutes');
});

test('Q03 (base): invoice-exports R2 version 1, signed in S1, covers EXP-4; the owner chose 30 minutes in D1', (t) => {
  const id = ctx(t, 'clean', 'EXP-4');
  assert.doesNotMatch(has(id, 'invoice-exports/R2', /signed/), /not signed/, show(id));
  const r = ctx(t, 'clean', 'invoice-exports');
  const r2 = has(r, word('R2'), /signed in S1/);
  assert.match(r2, /\b(version |v)1\b/, show(r));
  has(r, word('D1'), /owner/, /30 minutes/);
  hasNot(r, word('D1'), /agent/);
});

test('Q04 (base): SP-7, SP-10 and SP-11 still need a disposition (and SP-12, a rationale, in the final design)', (t) => {
  const r = ctx(t, 'clean', 'invoice-exports');
  for (const id of ['SP-7', 'SP-10', 'SP-11', 'SP-12']) has(r, word(id), /pending/);
  for (const id of ['SP-4', 'SP-5', 'SP-6', 'SP-9']) hasNot(r, word(id), /pending/);
});

test('Q05 (cr-wording): the request can close: D3 records the wording, so SP-10 -> EXP-10 is valid', (t) => {
  const r = ctx(t, 'cr-wording', 'invoice-exports');
  const sp10 = has(r, word('SP-10'), /incorporated/, word('EXP-10'));
  assert.match(sp10, /\bvalid\b/, show(r));
  assert.doesNotMatch(sp10, /not valid/, show(r));
  has(r, word('D3'), /agent/);
  const c = conclude(invoicer(t, 'cr-wording'), 'invoice-exports');
  assert.equal(c.code, 0, show(c));
});

test('Q06 (cr-45): it could not close: SP-6\'s 45-minute version has no disposition, nor have SP-7, SP-10, SP-11', (t) => {
  const c = conclude(invoicer(t, 'cr-45'), 'invoice-exports');
  assert.equal(c.code, 1, show(c));
  for (const id of ['SP-6', 'SP-7', 'SP-10', 'SP-11']) {
    assert.ok(c.refused.some((l) => word(`invoice-exports/${id}`).test(l)), `${id}:\n${show(c)}`);
  }
  assert.ok(!c.refused.some((l) => word('R2').test(l)), `R2 version 2 is signed:\n${show(c)}`);
  const r = ctx(t, 'cr-45', 'invoice-exports');
  has(r, word('SP-6'), /pending/);
});

test('Q07 (cr-45): yes, the owner signed the 45-minute link time: R2 version 2 in S2', (t) => {
  const r = ctx(t, 'cr-45', 'invoice-exports');
  assert.match(has(r, word('R2'), /signed in S2/), /\b(version |v)2\b/, show(r));
});

test('Q08 (cr-supersede): EXP-4 holds link-refresh/SP-2\'s text; invoice-exports/SP-6 is superseded', (t) => {
  const r = ctx(t, 'cr-supersede', 'EXP-4');
  has(r, 'expired page MUST offer to send a new link.');
  has(r, word('link-refresh/SP-2'), /incorporated/);
  has(r, word('invoice-exports/SP-6'), /superseded/);
});

test('Q09 (cr-chain): invoice-exports/SP-6, then link-refresh/SP-2, then portal-downloads/SP-2 removed EXP-4', (t) => {
  const a = ctx(t, 'cr-chain', 'invoice-exports');
  has(a, word('SP-6'), /superseded/);
  const b = ctx(t, 'cr-chain', 'link-refresh');
  has(b, word('SP-2'), /superseded/);
  const c = ctx(t, 'cr-chain', 'portal-downloads');
  const removal = has(c, word('SP-2'), /removed/, word('EXP-4'));
  assert.doesNotMatch(removal, /not valid/, show(c));
});

test('Q10 (cr-remove): PR #51 removes INV-4 and adds INV-19; tax-module R1, signed in S1, covers both', (t) => {
  const r = ctx(t, 'cr-remove', 'tax-module');
  has(r, word('SP-2'), /removed/, word('INV-4'));
  has(r, word('SP-3'), /incorporated/, word('INV-19'));
  has(r, word('R1'), /signed in S1/);
});

test('Q12 (cr-abandon): the ZIP is not in the spec; the owner dropped it (D3); SP-7, SP-10, SP-11 abandoned; PRs #46 and #47', (t) => {
  const r = ctx(t, 'cr-abandon', 'invoice-exports');
  has(r, word('D3'), /owner/);
  for (const id of ['SP-7', 'SP-10', 'SP-11']) has(r, word(id), /abandoned/);
  const prs = has(r, /PRs from git:/);
  assert.match(prs, word('#46'), show(r));
  assert.match(prs, word('#47'), show(r));
});

test('Q17 (base): reminder-emails/SP-2 changes INV-11 and promises up to three reminders', (t) => {
  const r = ctx(t, 'clean', 'reminder-emails/SP-2');
  has(r, 'Invoicer SHOULD send up to three reminders by email for an open invoice,');
  has(r, word('INV-11'));
  hasNot(r, word('INV-13'));
});

test('Q19 (base): the spike has not answered: Q1 is signed in S1, and the request is open', (t) => {
  const r = ctx(t, 'clean', 'link-expiry-spike');
  has(r, /^Request\b/, /\bopen\b/);
  has(r, word('Q1'), /signed in S1/);
  hasNot(r, word('Q1'), /not signed/);
});

test('Q20 (base): SP-4 is a flow; only SP-2 (rule) and SP-3 (definition) need the signed R1, which S1 covers', (t) => {
  const r = ctx(t, 'clean', 'reminder-emails');
  has(r, word('SP-4'), word('flow'));
  has(r, word('SP-2'), word('rule'));
  has(r, word('SP-3'), word('definition'));
  has(r, word('R1'), /signed in S1/);
  const c = conclude(invoicer(t, 'clean'), 'reminder-emails');
  assert.equal(c.refused.length, 1, `only the dispositions are missing, no sign-off:\n${show(c)}`);
});
