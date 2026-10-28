// The cross-repo facts of T12 (#185) in al-v4 check and al-v4 context (#179,
// T10 and T11): the results of output repos, an output repo that cannot be
// read, output-repo tests as checks, and the git facts of task PRs. Built on
// the cross-repo world of test/v4/helpers/cross-repo.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world } from './helpers/cross-repo.js';
import { invoicer, check } from './helpers/invoicer.js';
import { git, readYaml, writeYaml } from './helpers/project.js';
import { has, hasNot, lines, show, view } from './helpers/views.js';

const s7 = (sha) => sha.slice(0, 7);
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// --- 1. al-v4 check: output-repo results and unreadable output repos

const resultLine = (r, repo, file) => {
  const found = lines(r).filter((l) => l.startsWith(`info result ${repo}/.assuredloop/results/${file} `));
  assert.equal(found.length, 1, `one result line for ${repo} ${file}:\n${show(r)}`);
  return found[0];
};

test('check: one result line per result file of each output repo, with its repo, commit and applicability', (t) => {
  const w = world(t);
  const r = check(w.central);
  assert.equal(r.code, 0, show(r));
  const k4 = s7(w.shas.worker.K4);
  const w3 = s7(w.shas.web.W3);
  assert.match(resultLine(r, 'invoicer-web', 'export-link-test.yaml'),
    new RegExp(`test/export-link\\.test\\.js pass at invoicer-web@${w3}: declared inputs unchanged since invoicer-web@${w3}`));
  assert.match(resultLine(r, 'invoicer-worker', 'g-unchanged.yaml'),
    new RegExp(`test/zip-export\\.test\\.js pass at invoicer-worker@${k4}: declared inputs unchanged since invoicer-worker@${k4}`));
  assert.match(resultLine(r, 'invoicer-worker', 'h-short.yaml'),
    new RegExp(`at invoicer-worker@${k4}: declared inputs unchanged since invoicer-worker@${k4}`));
  assert.match(resultLine(r, 'invoicer-worker', 'f-changed.yaml'),
    new RegExp(`pass at invoicer-worker@${k4}: does not apply to the current text`));
  assert.match(resultLine(r, 'invoicer-worker', 'd-k7.yaml'), /at invoicer-worker@deadbee: applicability unknown/);
  for (const file of ['a-no-inputs.yaml', 'b-unknown-no-inputs.yaml', 'c-unknown.yaml', 'e-gone.yaml']) {
    assert.match(resultLine(r, 'invoicer-worker', file), /: applicability unknown/, show(r));
  }
  assert.equal(lines(r).filter((l) => /^info result invoicer-(web|worker)\//.test(l)).length, 9, show(r));
  assert.doesNotMatch(r.stdout, /\bapplies\b/, show(r));
});

test('check: an output repo that cannot be read gives one unknown line; the exit stays 0, also with --strict', (t) => {
  const w = world(t);
  for (const args of [[], ['--strict']]) {
    const r = check(w.central, ...args);
    assert.equal(r.code, 0, show(r));
    const found = lines(r).filter((l) => l.startsWith('info output-repo '));
    assert.deepEqual(found.map((l) => l.split(' ')[2]), ['invoicer-mobile'], show(r));
    assert.match(found[0], /^info output-repo invoicer-mobile - unknown: \S/, show(r));
  }
});

test('check control: a central repo with no outputs gives no output-repo line and no output-repo result line', (t) => {
  const r = check(invoicer(t, 'clean'));
  assert.equal(r.code, 0, show(r));
  assert.deepEqual(lines(r).filter((l) => /^info (output-repo|result invoicer-)/.test(l)), [], show(r));
});

// --- 2. al-v4 context <ID>: output-repo tests are checks, code is not, results

// The world without the declared verifies claim, so a check of EXP-4 can only
// come from the web repo's test file that cites it.
function withoutClaims(t) {
  const w = world(t);
  const rel = '.assuredloop/records/requests/invoice-exports.yaml';
  const rec = readYaml(w.central, rel);
  rec.outputs = rec.outputs.filter((o) => !o.verifies);
  writeYaml(w.central, rel, rec);
  return w;
}

test('context EXP-4: the web test that cites central:EXP-4 is a check, at the selected web commit; its result shows', (t) => {
  const w = withoutClaims(t);
  const r = view(w.central, ['context', 'EXP-4']);
  has(r, `invoicer-web/test/export-link.test.js cites it (at invoicer-web@${s7(w.shas.web.main)})`);
  hasNot(r, /check/i, /\bnone\b/);
  const w3 = s7(w.shas.web.W3);
  has(r, /^\s*Result\b/, /invoicer-web/, new RegExp(`declared inputs unchanged since invoicer-web@${w3}`));
});

test('context EXP-4: the web code that cites it is listed apart and is no check', (t) => {
  const w = withoutClaims(t);
  const r = view(w.central, ['context', 'EXP-4']);
  has(r, 'invoicer-web/src/export-link.js');
  hasNot(r, 'invoicer-web/src/export-link.js cites it (at');
});

test('context invoice-exports: the web test counts in the coverage of Export links', (t) => {
  const w = withoutClaims(t);
  const r = view(w.central, ['context', 'invoice-exports']);
  assert.match(has(r, 'specs/exports.md', 'Export links', /rules?,/), /\b1 rules?, 1 with a check, 0 without\b/, show(r));
  has(r, /(?<![\w-])EXP-4(?![\w-])/, 'invoicer-web/test/export-link.test.js');
});

test('context INV-11: cited only by worker code, it keeps none as its checks, and the code is listed apart', (t) => {
  const w = world(t);
  const r = view(w.central, ['context', 'INV-11']);
  has(r, /check/i, /\bnone\b/);
  has(r, 'invoicer-worker/src/reminders.js');
  hasNot(r, 'invoicer-worker/src/reminders.js cites it (at');
});

test('context invoice-exports/SP-10: the worker test is a check at the pinned K5; each worker result shows its applicability', (t) => {
  const w = world(t);
  const r = view(w.central, ['context', 'invoice-exports/SP-10']);
  has(r, `invoicer-worker/test/zip-export.test.js cites it (at invoicer-worker@${s7(w.shas.worker.K5)})`);
  const k4 = s7(w.shas.worker.K4);
  has(r, /^\s*Result\b/, 'g-unchanged', new RegExp(`declared inputs unchanged since invoicer-worker@${k4}`));
  has(r, /^\s*Result\b/, 'f-changed', /does not apply to the current text/);
  has(r, /^\s*Result\b/, 'd-k7', /applicability unknown/);
  assert.doesNotMatch(r.stdout, /\bapplies\b/, show(r));
});

test('context control: EXP-2, which no output file cites, keeps none', (t) => {
  const w = world(t);
  const r = view(w.central, ['context', 'EXP-2']);
  has(r, /check/i, /\bnone\b/);
  hasNot(r, /^\s*Result\b/);
  hasNot(r, /invoicer-(web|worker)\//);
});

// --- 3. al-v4 context <name>: the git facts of each task's PRs

// The text after a PR reference on its Task line, up to the next PR reference.
function prFact(r, task, pr) {
  const line = has(r, /^Task\b/, new RegExp(`(?<![\\w-])${task}(?![\\w-])`));
  const token = new RegExp(`(?<![\\w#-])${esc(pr)}(?!\\d)`);
  const m = token.exec(line);
  assert.ok(m, `the ${task} line names ${pr}:\n${line}`);
  const rest = line.slice(m.index + m[0].length);
  const next = /(?<![\w-])(?:[\w-]+)?#\d+/.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

test('context invoice-exports: a central PR with no merge on main says "no merge found", never "not merged"', (t) => {
  const w = world(t);
  const r = view(w.central, ['context', 'invoice-exports']);
  assert.match(prFact(r, 'T1', '#33'), /no merge found/, show(r));
  assert.doesNotMatch(r.stdout, /not merged/, show(r));
});

test('context invoice-exports: a central PR merged on main as "(#10)" says merged at its short commit', (t) => {
  const w = world(t);
  const rel = '.assuredloop/records/requests/invoice-exports.yaml';
  const rec = readYaml(w.central, rel);
  rec.tasks.find((x) => x.id === 'T1').prs.push('#10');
  writeYaml(w.central, rel, rec);
  const adopt = git(w.central, 'log', '--first-parent', '--format=%H', '--grep=(#10)$', 'main');
  assert.match(adopt, /^[0-9a-f]{40}$/, 'one commit "... (#10)" on main');
  const r = view(w.central, ['context', 'invoice-exports']);
  assert.match(prFact(r, 'T1', '#10'), new RegExp(`merged at ${s7(adopt)}`), show(r));
});

test('context invoice-exports: output-repo PRs say merged at <repo>@<7>, or unknown when the repo has no clone', (t) => {
  const w = world(t);
  const r = view(w.central, ['context', 'invoice-exports']);
  assert.match(prFact(r, 'T1', 'invoicer-web#57'), new RegExp(`merged at invoicer-web@${s7(w.shas.web.A)}`), show(r));
  assert.match(prFact(r, 'T3', 'invoicer-web#570'), new RegExp(`merged at invoicer-web@${s7(w.shas.web.B)}`), show(r));
  assert.match(prFact(r, 'T2', 'invoicer-worker#12'), new RegExp(`merged at invoicer-worker@${s7(w.shas.worker.K5)}`), show(r));
  assert.match(prFact(r, 'T3', 'invoicer-mobile#4'), /unknown: \S/, show(r));
  assert.match(prFact(r, 'T3', 'invoicer-desktop#2'), /unknown: \S/, show(r));
});

test('context control: an output-repo PR number with no such merge says "no merge found"', (t) => {
  const w = world(t);
  const r = view(w.central, ['context', 'invoice-exports']);
  assert.match(prFact(r, 'T2', 'invoicer-worker#1'), /no merge found/, show(r));
});
