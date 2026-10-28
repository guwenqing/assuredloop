// The worlds and the checks of the tests of #88: a hint clears by a fix, or
// by a recorded judgement with its reason (LD-12, adr-rewrite/R1). Nothing
// here reads the code under test: the tests use only the al command, the
// files that it writes and the YAML records.
import assert from 'node:assert/strict';
import { check } from './invoicer.js';
import {
  ADR3, DAY, INVOICES, appendSection, commitAll, doc, git, index, newRequest, ok, organized, project, read, recordPath,
  req, show, write, writeConfig,
} from './project.js';

export const NAME = 'inv';
export const REC = recordPath(NAME);
export const SPEC = 'specs/invoices.md';
export const MORE = 'specs/more.md';
export const CS = 'requests/inv/spec.md';
export const ADR3_FILE = 'specs/adr/0003-signed-links.md';

export const R1 = req('R1', 'Monthly CSV download', 'A user MUST be able to download one month as one CSV file.');
export const R1b = req('R1', 'Monthly CSV download', 'A user MUST be able to download one month or one year as one CSV file.');

// The texts of the paragraphs, and the edits of the tests (b, then c).
export const T = {
  INV12: 'An invoice has a number, a customer, lines, a total and a paid date.',
  INV12b: 'An invoice has a unique number, a customer, lines, a total and a paid date.',
  INV12c: 'An invoice has a unique number, one customer, lines, a total and a paid date.',
  INV13: 'An invoice MUST have at least one line.',
  INV13b: 'An invoice MUST have at least one line with an amount.',
  INV41: 'The export link MUST expire 30 minutes after the email is sent.',
  INV41b: 'The export link MUST expire 30 minutes after the email is sent to the customer.',
  INV60: 'The exporter reads the lines of an invoice.',
  INV60b: 'The exporter reads every line of an invoice.',
  INV60c: 'The exporter reads every line of an invoice in order.',
  SP1: 'The export holds one row per invoice line.',
  SP1b: 'The export holds one row for each invoice line.',
  SP2: 'The exporter MUST write one file per month.',
  SP2b: 'The exporter MUST write one file for each month.',
  SP2s: 'The exporter MUST write one file per month, and SHOULD name it by the month.',
  SP3: 'The export link MUST expire 30 minutes after the mail is sent.',
  ADR: 'Context: a link must not be guessed.',
  ADRb: 'Context: nobody may guess a link.',
  ADRc: 'Context: nobody may guess or reuse a link.',
};
export const ADR3_MARKER = '<!-- ADR-3 choice -->';
export const ADR3_MARKER_B = '<!-- ADR-3 choice decides:INV-41 -->';

// main: the config (specs/invoices.md and specs/more.md), the two spec docs
// and ADR-3 (accepted, from the project helpers). With `adr` false, no ADR.
// Then the branch feature.
export function base(t, { adr = true } = {}) {
  const dir = project(t);
  writeConfig(dir, [{ file: SPEC, prefix: 'INV' }, { file: MORE, prefix: 'MORE' }]);
  write(dir, SPEC, INVOICES);
  write(dir, MORE, doc([['MORE-1 note', '# More']]));
  if (adr) write(dir, ADR3_FILE, ADR3);
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  return dir;
}

// The world of most tests. On the branch feature, the open request inv
// (path 2) with R1, not signed, and its change spec:
// - SP-1 component serves:R1 builds-on:INV-12 (a binding to a paragraph);
// - SP-2 component serves:R1 with MUST: the hint promise-kind;
// - SP-3 rule serves:R1, close to INV-41 with no link: the hint near-match
//   that names INV-41.
// specs/invoices.md gets INV-60 component serves:inv/R1 builds-on:INV-13.
// Indexed and committed, so the bindings hold the texts of then.
export function world(t, opts) {
  const dir = base(t, opts);
  newRequest(dir, NAME, 'The owner wants a monthly export.\n', ['--tier', '2']);
  appendSection(dir, NAME, organized([R1]));
  write(dir, CS, doc([
    ['SP-1 component serves:R1 builds-on:INV-12', T.SP1],
    ['SP-2 component serves:R1', T.SP2],
    ['SP-3 rule serves:R1', T.SP3],
  ]));
  write(dir, SPEC, `${read(dir, SPEC)}\n${doc([['INV-60 component serves:inv/R1 builds-on:INV-13', T.INV60]])}`);
  index(dir);
  commitAll(dir, 'The request inv\n\nTier: 2 — inv');
  return dir;
}

// --- the commands

// al record <name> judgement --hint <code> --on <ID> --reason <why> [--yes].
export const judgementArgs = (hint, on, reason, { name = NAME, yes = true } = {}) =>
  ['record', name, 'judgement', '--hint', hint, '--on', on, '--reason', reason, ...(yes ? ['--yes'] : [])];
export const judge = (dir, hint, on, reason, opts) => ok(dir, judgementArgs(hint, on, reason, opts));

// --- the findings

export const coded = (r, code, id) => r.findings.filter((f) => f.code === code && (id === undefined || f.id === id));
// The findings of a binding hint on one link: stale-base says "<link>
// <target>, which changed"; holder-changed says "<link> <target>: ...".
export const onLink = (r, code, holder, link, target) =>
  coded(r, code, holder).filter((f) => f.msg.startsWith(`${link} ${target},`) || f.msg.startsWith(`${link} ${target}:`));

export function one(list, r, what) {
  assert.equal(list.length, 1, `one ${what}:\n${show(r)}`);
  assert.equal(list[0].severity, 'hint', `${what} is a hint:\n${show(r)}`);
  return list[0];
}
export function none(list, r, what) {
  assert.deepEqual(list.map((f) => f.line), [], `no ${what}:\n${show(r)}`);
}

// The line of the current judgements: `info judged - - <request>/J<n> ...`.
export const judgedLines = (r) => r.findings.filter((f) => f.severity === 'info' && f.code === 'judged');
export function judgedLine(r) {
  const found = judgedLines(r);
  assert.equal(found.length, 1, `one "info judged" line:\n${show(r)}`);
  assert.equal(found[0].file, '-', show(r));
  assert.equal(found[0].id, '-', show(r));
  return found[0].msg;
}
export const noJudgedLine = (r) => assert.deepEqual(judgedLines(r).map((f) => f.line), [], `no "info judged" line:\n${show(r)}`);

// A hint that came back names its judgement as stale:
// "; the judgement <request>/J<n> (<date>) is stale: <what> changed since it".
export function namesStale(f, r, n, request = NAME) {
  assert.ok(f.msg.includes(`; the judgement ${request}/J${n} (${DAY}) is stale: `), `the hint names ${request}/J${n} as stale:\n${f.line}\n${show(r)}`);
  assert.match(f.msg, /is stale: .+ changed since it/, `it says what changed since the judgement:\n${f.line}`);
}
export const namesNoJudgement = (f, r) =>
  assert.ok(!f.msg.includes('the judgement '), `the hint names no judgement:\n${f.line}\n${show(r)}`);

// The lines `want` follow one another in the output, from the first one on.
export function hasLines(r, want) {
  const ls = r.stdout.split('\n');
  const at = ls.indexOf(want[0]);
  assert.ok(at >= 0, `a line "${want[0]}":\n${show(r)}`);
  assert.deepEqual(ls.slice(at, at + want.length), want, `the lines in this order:\n${show(r)}`);
}
// The line `head`, then the lines `rest` in any order.
export function hasBlock(r, head, rest) {
  const ls = r.stdout.split('\n');
  const at = ls.indexOf(head);
  assert.ok(at >= 0, `a line "${head}":\n${show(r)}`);
  assert.deepEqual(ls.slice(at + 1, at + 1 + rest.length).sort(), [...rest].sort(), `after "${head}", the lines:\n${rest.join('\n')}\n${show(r)}`);
}
export const nextIs = (r, text) => assert.ok(r.stdout.split('\n').includes(`Next      ${text}`), `Next: ${text}\n${show(r)}`);

export { check };
