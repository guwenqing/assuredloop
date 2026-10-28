// The T3 reviewer questions (from AssuredLoop's own validation) answered from the
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

// #72 (LD-58): no wording decision is needed; the request can still close.
test('Q05 (cr-wording): the request can close; D3 is recorded', (t) => {
  const r = ctx(t, 'cr-wording', 'invoice-exports');
  has(r, word('D3'), /agent/);
  const c = conclude(invoicer(t, 'cr-wording'), 'invoice-exports');
  assert.equal(c.code, 0, show(c));
});

// #72: the reason is now the close rule's item 2 (R3 has no declared
// paragraph link); the dispositions are gone.
test('Q06 (cr-45): it could not close: R3 has no declared paragraph link; nothing refuses on R2, signed in version 2', (t) => {
  const c = conclude(invoicer(t, 'cr-45'), 'invoice-exports');
  assert.equal(c.code, 1, show(c));
  assert.ok(c.refused.some((l) => word('invoice-exports/R3').test(l) && /no declared paragraph link/.test(l)), show(c));
  assert.ok(!c.refused.some((l) => word('R2').test(l)), `R2 version 2 is signed:\n${show(c)}`);
});

test('Q07 (cr-45): yes, the owner signed the 45-minute link time: R2 version 2 in S2', (t) => {
  const r = ctx(t, 'cr-45', 'invoice-exports');
  assert.match(has(r, word('R2'), /signed in S2/), /\b(version |v)2\b/, show(r));
});

// #72 (LD-58): the superseded and incorporated dispositions are not shown;
// the link of link-refresh/SP-2 is.
test('Q08 (cr-supersede): EXP-4 holds link-refresh/SP-2\'s text; link-refresh/SP-2 changes it', (t) => {
  const r = ctx(t, 'cr-supersede', 'EXP-4');
  has(r, 'expired page MUST offer to send a new link.');
  has(r, 'link-refresh/SP-2 (requests/link-refresh/spec.md:7) changes it'); // #74: with the place of its text
});

// #72 (LD-58): the chain of superseded and removed dispositions is not
// shown; the removal of EXP-4 shows on link-refresh/SP-2's link.
test('Q09 (cr-chain): portal-downloads removed EXP-4: link-refresh/SP-2\'s link to it says so', (t) => {
  const b = ctx(t, 'cr-chain', 'link-refresh');
  has(b, /target-removed/, word('link-refresh/SP-2'), word('EXP-4'), /target removed by portal-downloads/);
});

// #72 (LD-58): the removed and incorporated dispositions are not shown.
test('Q10 (cr-remove): tax-module R1 is signed in S1', (t) => {
  const r = ctx(t, 'cr-remove', 'tax-module');
  has(r, word('R1'), /signed in S1/);
});

// #72 (LD-58): the abandoned dispositions are not shown.
test('Q12 (cr-abandon): the owner dropped the ZIP (D3); PRs #46 and #47', (t) => {
  const r = ctx(t, 'cr-abandon', 'invoice-exports');
  has(r, word('D3'), /owner/);
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
  // #72: the kinds were on the Dispositions lines of the request view, which
  // are gone; each paragraph's view gives its kind.
  for (const [id, kind] of [['SP-4', 'flow'], ['SP-2', 'rule'], ['SP-3', 'definition']]) {
    has(ctx(t, 'clean', `reminder-emails/${id}`), /^Paragraph\b/, word(id), word(kind));
  }
  const r = ctx(t, 'clean', 'reminder-emails');
  has(r, word('R1'), /signed in S1/);
  // #72: conclude refuses on the close rule (R1, SP-2), with no sign-off reason.
  const c = conclude(invoicer(t, 'clean'), 'reminder-emails');
  assert.equal(c.code, 1, show(c));
  assert.deepEqual(c.refused.filter((l) => /no signed requirement/.test(l)), [], `no sign-off reason:\n${show(c)}`);
});
