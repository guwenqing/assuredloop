// Test files, result files and ADRs for the part-8 tests [LNK-3] [LNK-4]
// [HNT-2] [REC-9] [REC-11] [VW-3] [VW-4]: TAP as node's --test-reporter=tap
// writes it, JUnit XML, ADRs in the kit's format (as docs/adr/0009 and 0012
// in this repo), and readers for what the views show of them. Built from the
// spec text and the architect's rulings; nothing here reads the code under
// test.
import assert from 'node:assert/strict';
import { lines } from './output.js';
import { labelled } from './links.js';

export const short = (sha) => sha.slice(0, 7);

// --- result files ---

// TAP as node's tap reporter writes it: `# Subtest:` before each point, a
// YAML block after it, subtests indented four spaces before their parent's
// point, a plan per level, then node's summary. Each point is [name, result]:
// 'ok', 'not ok', 'skip' (ok # SKIP) or 'todo' (not ok # TODO), or
// [name, [...points]] for a parent, not ok when a subtest is. `revision` (a
// sha) goes on a `# revision:` line after the version line, or at the end
// with { revisionAt: 'end' }; `revision: null` leaves it out.
export function tap(revision, points, { revisionAt = 'top' } = {}) {
  const sum = { tests: 0, pass: 0, fail: 0, skipped: 0, todo: 0 };
  const level = (ps, depth) => {
    const pad = ' '.repeat(4 * depth);
    const out = [];
    let failed = false;
    ps.forEach(([name, r], i) => {
      out.push(`${pad}# Subtest: ${name}`);
      let bad;
      let directive = '';
      if (Array.isArray(r)) {
        const sub = level(r, depth + 1);
        out.push(...sub.out);
        bad = sub.failed;
      } else {
        bad = r === 'not ok' || r === 'todo';
        if (r === 'skip') directive = ' # SKIP not yet';
        if (r === 'todo') directive = ' # TODO later';
      }
      out.push(`${pad}${bad ? 'not ok' : 'ok'} ${i + 1} - ${name}${directive}`);
      out.push(`${pad}  ---`, `${pad}  duration_ms: 0.25`, `${pad}  type: 'test'`);
      if (bad && !directive) out.push(`${pad}  failureType: 'testCodeFailure'`, `${pad}  error: 'Expected values to be strictly equal'`);
      out.push(`${pad}  ...`);
      sum.tests++;
      if (r === 'skip') sum.skipped++;
      else if (r === 'todo') sum.todo++;
      else if (bad) sum.fail++;
      else sum.pass++;
      if (bad && !directive) failed = true;
    });
    out.push(`${pad}1..${ps.length}`);
    return { out, failed };
  };
  const body = level(points, 0).out;
  const rev = revision ? [`# revision: ${revision}`] : [];
  return ['TAP version 13', ...(revisionAt === 'top' ? rev : []), ...body,
    `# tests ${sum.tests}`, '# suites 0', `# pass ${sum.pass}`, `# fail ${sum.fail}`, '# cancelled 0',
    `# skipped ${sum.skipped}`, `# todo ${sum.todo}`, '# duration_ms 31.5', ...(revisionAt === 'end' ? rev : [])].join('\n') + '\n';
}

// JUnit XML: one <testcase> per [name, result], result 'pass', 'failure',
// 'error' or 'skipped'; the revision in an XML comment after the declaration.
export function junit(revision, cases) {
  const count = (r) => cases.filter(([, x]) => x === r).length;
  const child = {
    pass: '',
    failure: '\n      <failure message="Expected values to be strictly equal" type="AssertionError">1 !== 2</failure>\n    ',
    error: '\n      <error message="boom" type="TypeError">Cannot read properties of undefined</error>\n    ',
    skipped: '\n      <skipped/>\n    ',
  };
  const tc = ([name, r]) => child[r]
    ? `    <testcase classname="invoices" name="${name}" time="0.001">${child[r]}</testcase>`
    : `    <testcase classname="invoices" name="${name}" time="0.001"/>`;
  return ['<?xml version="1.0" encoding="UTF-8"?>', ...(revision ? [`<!-- revision: ${revision} -->`] : []),
    '<testsuites>',
    `  <testsuite name="invoices" tests="${cases.length}" failures="${count('failure')}" errors="${count('error')}" skipped="${count('skipped')}">`,
    ...cases.map(tc), '  </testsuite>', '</testsuites>'].join('\n') + '\n';
}

// A pass or fail count on a line: "3 passed", "pass 3", "passed: 3".
export const count = (n, word) => new RegExp(`\\b${n} ${word}|\\b${word}\\w*:? ${n}\\b`, 'i');

// "<a> → <b> assertions" (or ->).
export const assertions = (a, b) => new RegExp(`(?:^|\\D)${a}\\s*(?:→|->)\\s*${b}\\s+assertions?\\b`);

// Which failure kind the Results block gives the test `name`: 'new',
// 'already failing' or 'fixed'. The one word on its line; with several on
// the line ("new: a · fixed: b"), the last before the name; with none, the
// last on the nearest line above (a heading over a list).
const KINDS = /\bnew\b|\balready failing\b|\bfixed\b/gi;
export function failureKind(block, name) {
  const ls = lines(block);
  const i = ls.findIndex((l) => l.includes(name));
  assert.ok(i >= 0, `the Results block should name the test "${name}":\n${block}`);
  const kinds = [...ls[i].matchAll(KINDS)];
  const at = ls[i].indexOf(name);
  let k = kinds.length === 1 ? kinds[0] : kinds.filter((m) => m.index < at).at(-1) ?? kinds[0];
  for (let j = i - 1; !k && j >= 0; j--) k = [...ls[j].matchAll(KINDS)].at(-1);
  return k?.[0].toLowerCase();
}

// In check, the line starting with `label` comes after the Serves line and
// before the first hint line.
export function assertAfterServes(out, label) {
  const ls = lines(out);
  const serves = ls.findIndex((l) => /^Serves\b/.test(l));
  const at = ls.findIndex((l) => new RegExp(`^${label}\\b`).test(l));
  const hint = ls.findIndex((l) => /^(not ok|note):/.test(l));
  assert.ok(serves >= 0 && at > serves, `${label} should come after the Serves line:\n${out}`);
  assert.ok(hint < 0 || at < hint, `${label} should come before the hints:\n${out}`);
}

// No line of `text` judges a test: observations only [LNK-3].
export function assertNoVerdict(text) {
  assert.doesNotMatch(text, /\b(good|enough|weak|weaker|better|worse|strong|stronger|sufficient|insufficient)\b/i,
    `observations, never verdicts:\n${text}`);
}

// --- ADRs ---

// An ADR in the kit's format. `name` is its file name without .md
// ('0002-iso-dates'). `status` is 'accepted', 'proposed', 'rejected',
// 'deprecated' or 'superseded by <name>'; `supersedes` a name; `request` a
// request name; `governs` a list of IDs; `text` the Context line.
export const adrNumber = (name) => name.slice(0, 4);
const link = (name) => `[ADR ${adrNumber(name)}](${name}.md)`;
export function adr(name, title, { status = 'accepted', supersedes, request, governs, text = 'Customers asked.' } = {}) {
  const st = status.startsWith('superseded by ') ? `superseded by ${link(status.slice('superseded by '.length))}` : status;
  return [`# ADR ${adrNumber(name)}: ${title}`, '', 'Date: 2026-09-20.', `Status: ${st}.`, 'Decided by: the owner.',
    ...(supersedes ? [`Supersedes: ${link(supersedes)}.`] : []),
    ...(request ? [`Request: ${request}`] : []),
    ...(governs ? [`Governs: ${governs.map((id) => `[${id}]`).join(', ')}`] : []),
    '', '## Context', '', `- ${text}`, '', '## Decision', '', `- ${title}.`, '',
    '## Consequences', '', '- Revisit if customers ask again.', ''].join('\n');
}
// Write the ADR `name` into `dir` (docs/adr by default); returns its path.
export function writeAdr(repo, name, title, { dir = 'docs/adr', ...opts } = {}) {
  const path = `${dir}/${name}.md`;
  repo.write(path, adr(name, title, opts));
  return path;
}

// The ADRs block of context <ID>: the ADR numbers in the order shown (a
// date's year is not one).
export function adrOrder(out) {
  const block = labelled(out, 'ADRs');
  assert.ok(block, `expected a line starting with ADRs:\n${out}`);
  return { block, numbers: [...block.matchAll(/\b\d{4}\b(?!-\d\d-\d\d)/g)].map((m) => m[0]) };
}
