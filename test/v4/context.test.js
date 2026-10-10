// al-v4 context: the project view, the request view, the ID view, the review
// view of a diff, --audit and --at (#179, task T11; design.md 5, 8, 9, 13).
// States of the invoicer world (test/v4/fixtures/invoicer/cases/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, invoicer } from './helpers/invoicer.js';
import { al, git, readYaml } from './helpers/project.js';
import { dispositionCounts, has, hasNot, lines, linesWith, show, view, word } from './helpers/views.js';

const ctx = (t, name, arm, ...args) => {
  const dir = invoicer(t, name, arm);
  return { dir, ...view(dir, ['context', ...args]) };
};
const recordOf = (dir, name) => readYaml(dir, `.assuredloop/records/requests/${name}.yaml`);

// --- 1. the project

test('context: one line per open request with its tier, sign-off state and dispositions count; none for an archived one', (t) => {
  const r = ctx(t, 'clean');
  const exports = has(r, word('invoice-exports'), /with a baseline effect/);
  assert.match(exports, /\b3\b/, `the tier:\n${show(r)}`);
  assert.match(exports, /signed/, show(r));
  assert.deepEqual(dispositionCounts(r, word('invoice-exports')),
    { paragraphs: 15, baseline: 8, counts: { incorporated: 4, pending: 4 } });
  assert.deepEqual(dispositionCounts(r, word('reminder-emails')),
    { paragraphs: 5, baseline: 3, counts: { pending: 3 } });
  has(r, word('link-expiry-spike'));
  for (const archived of ['invoice-numbers', 'adoption']) hasNot(r, word(archived), /with a baseline effect/);
  has(r, /^Not checked/);
});

test('context: an open request whose requirement is not signed says so', (t) => {
  const r = ctx(t, 'd02', 'control');
  const line = has(r, word('credit-notes'), /with a baseline effect/);
  assert.match(line, /not signed/, show(r));
});

test('context: coverage per spec section, and the count of hints of the check', (t) => {
  const r = ctx(t, 'd07', 'defect');
  has(r, 'specs/exports.md', /\d+ rules, \d+ with a check, \d+ without/);
  has(r, 'specs/invoices.md', /\d+ rules, \d+ with a check, \d+ without/);
  const hints = check(r.dir).findings.filter((f) => f.severity === 'hint').length;
  assert.equal(hints, 1, 'the state has one hint (stale-base)');
  has(r, /\b1 hints?\b|\bhints?:?\s+1\b/i);
});

// --- 2. a request

test('context <name>: the Request line, each requirement with its version and sign-off, the decisions', (t) => {
  const r = ctx(t, 'clean', undefined, 'invoice-exports');
  const request = has(r, /^Request\b/, word('invoice-exports'));
  assert.match(request, /\b3\b/, show(r));
  assert.match(request, /\bopen\b/, show(r));
  for (const id of ['R1', 'R2', 'R3', 'R4']) {
    const line = has(r, word(id), /signed in S1/);
    assert.match(line, /\b(version |v)1\b/, show(r));
    assert.doesNotMatch(line, /not signed|changed since/, show(r));
  }
  has(r, word('D1'), /owner/, /30 minutes/);
  has(r, word('D2'), /owner/, /one-time token/);
});

test('context <name>: an archived request says archived', (t) => {
  const r = ctx(t, 'clean', undefined, 'invoice-numbers');
  has(r, /^Request\b/, word('invoice-numbers'), /archived/);
  has(r, word('R1'), /signed in S1/);
});

test('context <name>: R2 version 2 signed in S2; a draft changed after its sign-off; a draft never signed', (t) => {
  const r = ctx(t, 'cr-45', undefined, 'invoice-exports');
  assert.match(has(r, word('R2'), /signed in S2/), /\b(version |v)2\b/, show(r));
  const spike = ctx(t, 'spike-q2', undefined, 'link-expiry-spike');
  has(spike, word('Q1'), /changed since S1/);
  const draft = ctx(t, 'd02', 'control', 'credit-notes');
  has(draft, word('R1'), /not signed/);
});

test('context <name>: the task references of the record, and the PRs from git with their commits', (t) => {
  const r = ctx(t, 'cr-abandon', undefined, 'invoice-exports');
  has(r, word('T1'), 'tasks.md T1; issue #31');
  const prs = has(r, /PRs from git:/);
  for (const pr of ['#46', '#47']) assert.match(prs, word(pr), show(r));
  const m8 = git(r.dir, 'log', '--format=%H', '--grep=(#46)', 'main');
  assert.ok(prs.includes(m8.slice(0, 7)), `the short commit of #46 (${m8}):\n${show(r)}`);
});

test('context <name>: the Dispositions line in its exact form, and one line per paragraph with a baseline effect', (t) => {
  const r = ctx(t, 'clean', undefined, 'invoice-exports');
  assert.deepEqual(dispositionCounts(r, /^Dispositions\b/),
    { paragraphs: 15, baseline: 8, counts: { incorporated: 4, pending: 4 } });
  for (const [id, kind, spec] of [['SP-4', 'rule', 'EXP-2'], ['SP-5', 'rule', 'EXP-3'], ['SP-6', 'rule', 'EXP-4'], ['SP-9', 'component', 'EXP-6']]) {
    const line = has(r, word(id), word(kind), /incorporated/, word(spec));
    assert.match(line, /\bvalid\b/, show(r));
    assert.doesNotMatch(line, /not valid/, show(r));
  }
  for (const [id, kind] of [['SP-7', 'rule'], ['SP-10', 'data'], ['SP-11', 'interface'], ['SP-12', 'rationale']]) {
    has(r, word(id), word(kind), /pending/);
  }
  for (const id of ['SP-1', 'SP-2', 'SP-14', 'SP-15']) hasNot(r, word(id), /pending|incorporated/);
});

test('context <name>: an invalid disposition is counted and named with its reason; the hint shows', (t) => {
  const r = ctx(t, 'd06', 'defect', 'invoice-exports');
  assert.deepEqual(dispositionCounts(r, /^Dispositions\b/),
    { paragraphs: 15, baseline: 8, counts: { incorporated: 8, 'not valid': 1 } });
  has(r, word('SP-10'), word('data'), word('EXP-10'), /not valid: \S/);
  has(r, /disposition/, word('invoice-exports/SP-10'), /^\s*(hint|not ok) /);
  const control = ctx(t, 'd06', 'control', 'invoice-exports');
  assert.deepEqual(dispositionCounts(control, /^Dispositions\b/),
    { paragraphs: 15, baseline: 8, counts: { incorporated: 8 } });
});

test('context <name>: superseded, removed and abandoned are counted', (t) => {
  const chain = ctx(t, 'cr-chain', undefined, 'invoice-exports');
  assert.deepEqual(dispositionCounts(chain, /^Dispositions\b/),
    { paragraphs: 15, baseline: 8, counts: { incorporated: 2, superseded: 2, pending: 4 } });
  const portal = ctx(t, 'cr-chain', undefined, 'portal-downloads');
  assert.deepEqual(dispositionCounts(portal, /^Dispositions\b/),
    { paragraphs: 6, baseline: 4, counts: { removed: 3, incorporated: 1 } });
  const abandon = ctx(t, 'cr-abandon', undefined, 'invoice-exports');
  assert.deepEqual(dispositionCounts(abandon, /^Dispositions\b/),
    { paragraphs: 15, baseline: 8, counts: { incorporated: 4, abandoned: 4 } });
});

test('context <name>: coverage per section; each rule with its checks or none; one checked rule never hides an unchecked one', (t) => {
  const r = ctx(t, 'views', 'fresh', 'invoice-exports');
  const links = has(r, 'specs/exports.md', 'Export links', /rules,/);
  assert.match(links, /\b1 rules?, 1 with a check, 0 without\b/, show(r));
  const exports = has(r, 'specs/exports.md', /\bExports\b/, /rules,/);
  assert.match(exports, /\b2 rules, 1 with a check, 1 without\b/, show(r));
  has(r, word('EXP-4'), 'test/export-link.test.js');
  has(r, word('EXP-3'), 'test/dates.test.js', /a claim/);
  has(r, word('EXP-2'), /\bnone\b/);
});

test('context <name>: Hints holds the findings that concern the request, and Not checked names semantic coverage', (t) => {
  const r = ctx(t, 'd07', 'defect', 'reminder-emails');
  has(r, /stale-base/, word('reminder-emails/SP-4'));
  const other = ctx(t, 'd07', 'defect', 'invoice-exports');
  hasNot(other, /stale-base/, word('reminder-emails/SP-4'));
  const notChecked = has(r, /^Not checked/);
  for (const w of [/kind/, /cover/, /test/, /input/]) assert.match(notChecked, w, show(r));
});

// --- 3. an ID

test('context <ID>: display number, kind, file, text, requirement and its sign-off, governing ADRs, open changes, dispositions', (t) => {
  const r = ctx(t, 'clean', undefined, 'EXP-4');
  has(r, 'EXP-4 (1:1, in Export links)');
  has(r, /\brule\b/);
  has(r, 'specs/exports.md');
  has(r, 'The export link MUST expire 30 minutes after the email is sent.');
  assert.doesNotMatch(has(r, 'invoice-exports/R2', /signed/), /not signed/, show(r));
  has(r, word('ADR-4'), /accepted/);
  has(r, word('ADR-3'), /superseded/, /history/);
  has(r, 'link-expiry-spike/SP-2 builds on it');
  has(r, 'link-expiry-spike/SP-3 builds on it');
  has(r, /check/i, /\bnone\b/);
  has(r, word('invoice-exports/SP-6'), /incorporated/);
});

test('context <ID>: the open changes that change it', (t) => {
  const r = ctx(t, 'd04', 'control', 'EXP-4');
  has(r, 'link-45/SP-2 changes it');
  has(r, 'link-refresh/SP-2 changes it');
  const d = ctx(t, 'd04', 'defect', 'EXP-4');
  hasNot(d, 'link-45/SP-2 changes it');
});

test('context <ID>: its checks (cites, exact; verifies, a claim) and its results with their applicability', (t) => {
  const r = ctx(t, 'views', 'fresh', 'EXP-4');
  has(r, 'test/export-link.test.js', /cites/);
  has(r, /declared inputs unchanged since/);
  assert.doesNotMatch(r.stdout, /\bapplies\b/, show(r));
  const changed = ctx(t, 'views', 'changed', 'EXP-4');
  has(changed, /does not apply to the current text/);
  const exp3 = ctx(t, 'views', 'fresh', 'EXP-3');
  has(exp3, 'test/dates.test.js', /a claim/);
});

test('context <request>/SP-n: a change-spec paragraph by its request-local ID', (t) => {
  const r = ctx(t, 'clean', undefined, 'reminder-emails/SP-2');
  has(r, /\brule\b/);
  has(r, 'requests/reminder-emails/spec.md');
  has(r, 'Invoicer SHOULD send up to three reminders by email for an open invoice,');
  has(r, word('INV-11'));
  has(r, 'reminder-emails/R1', /signed/);
});

// --- 4. the review view of a diff

test('context --diff main...HEAD --for review: each changed paragraph with its text, requirement, sign-off state and hints', (t) => {
  const r = ctx(t, 'd01', 'defect', '--diff', 'main...HEAD', '--for', 'review');
  has(r, word('INV-6'), /definition/);
  has(r, /Changed/);
  has(r, 'remaining amount is less than 1.00 in its currency.');
  has(r, 'small-remainders/R1');
  has(r, 'An invoice whose remaining amount is less than 1.00 in its currency counts');
  has(r, /not signed/);
  has(r, /signoff-coverage/);
  const control = ctx(t, 'd01', 'control', '--diff', 'main...HEAD', '--for', 'review');
  hasNot(control, /not signed/);
});

test('context --diff --for review: the baseline paragraphs a change paragraph touches, with their text, and the governing ADRs', (t) => {
  const r = ctx(t, 'd04', 'control', '--diff', 'main...HEAD', '--for', 'review');
  has(r, word('link-45/SP-2'), /New/);
  has(r, 'The export link MUST expire 45 minutes after the email is sent, and the');
  has(r, 'The export link MUST expire 30 minutes after the email is sent.');
  has(r, /overlap/);
  const adr = ctx(t, 'adr-governs', 'decided', '--diff', 'main...HEAD', '--for', 'review');
  has(adr, word('ADR-4'));
});

test('context --diff without --for review: one line per changed paragraph; the A..B form works too', (t) => {
  const r = ctx(t, 'd01', 'defect', '--diff', 'main...HEAD');
  assert.equal(linesWith(r, word('INV-6')).filter((l) => !/^(Read|Next|Not known)/.test(l)).length, 1, show(r));
  has(r, word('INV-6'), /Changed/);
  hasNot(r, 'An invoice whose remaining amount is less than 1.00 in its currency counts');
  const main = git(r.dir, 'rev-parse', 'main');
  const two = ctx(t, 'd01', 'defect', '--diff', `${main}..HEAD`);
  has(two, word('INV-6'), /Changed/);
});

// --- 5. --audit

test('context <name> --audit: sources and their hashes, every requirement version, sign-offs, decisions, tasks, bindings, dispositions', (t) => {
  const r = ctx(t, 'cr-45', undefined, 'invoice-exports', '--audit');
  const rec = recordOf(r.dir, 'invoice-exports');
  for (const s of rec.sources) has(r, s.file, s.sha256.slice(0, 7));
  assert.equal(rec.requirements.filter((v) => v.id === 'R2').length, 2, 'R2 has two versions');
  for (const v of rec.requirements) has(r, word(v.id), v.sha256.slice(0, 7));
  has(r, word('S1'), word('R4'));
  has(r, word('S2'), word('R2'));
  has(r, word('D1'));
  has(r, word('D2'));
  for (const id of ['T1', 'T2', 'T3']) has(r, word(id));
  has(r, word('invoice-exports/SP-9'), /\bstale\b/);
  has(r, word('invoice-exports/SP-7'), word('EXP-2'), /\bbound\b/);
  has(r, word('SP-6'), /incorporated/, word('EXP-4'));
});

test('context <name> --audit: declared outputs as claims, results, bindings whose target is gone, merged PRs from git', (t) => {
  const v = ctx(t, 'views', 'fresh', 'invoice-exports', '--audit');
  has(v, 'test/dates.test.js', /claim/);
  has(v, 'docs/exports.md', /claim/);
  const chain = ctx(t, 'cr-chain', undefined, 'link-refresh', '--audit');
  has(chain, word('link-refresh/SP-2'), word('EXP-4'), /target not found/);
  const abandon = ctx(t, 'cr-abandon', undefined, 'invoice-exports', '--audit');
  has(abandon, word('#46'));
  has(abandon, word('#47'));
});

// --- 6. --at

test('context --at <commit> reads that commit, and the Read line names it', (t) => {
  const r = ctx(t, 'cr-45', undefined, 'invoice-exports');
  has(r, word('R2'), /signed in S2/);
  const main = git(r.dir, 'rev-parse', 'main');
  const at = view(r.dir, ['context', 'invoice-exports', '--at', main]);
  has(at, word('R2'), /signed in S1/);
  hasNot(at, word('S2'));
  assert.ok(lines(at).find((l) => l.startsWith('Read '))?.includes(main.slice(0, 7)), show(at));

  const s = ctx(t, 'cr-supersede', undefined, 'EXP-4');
  has(s, 'expired page MUST offer to send a new link.');
  const old = view(s.dir, ['context', 'EXP-4', '--at', git(s.dir, 'rev-parse', 'main')]);
  hasNot(old, 'expired page MUST offer to send a new link.');
  has(old, 'The export link MUST expire 30 minutes after the email is sent.');
});

// --- 8. unknown names and IDs

test('context of an unknown request name or ID: exit 2 with an al: line, nothing written', (t) => {
  const dir = invoicer(t, 'clean');
  for (const args of [['context', 'no-such-request'], ['context', 'EXP-99'], ['context', 'invoice-exports/SP-99']]) {
    const r = al(dir, args);
    assert.equal(r.code, 2, show(r));
    assert.match(r.stdout, /^al: /m, show(r));
    assert.ok(r.stdout.split('\n').find((l) => l.startsWith('al: '))?.includes(args[1]), `the al: line names ${args[1]}:\n${show(r)}`);
  }
  assert.equal(recordOf(dir, 'invoice-exports').status, 'open');
});
