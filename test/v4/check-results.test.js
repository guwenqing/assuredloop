// al-v4 check on result applicability (#179, task T10; design.md 9). States of
// the market-report and invoicer-web worlds (test/v4/fixtures/invoicer/cases/
// report-base, res-c3, res-unknown, web-base, res-config). The tool never says
// that a result "applies".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, invoicer } from './helpers/invoicer.js';
import { readYaml, show } from './helpers/project.js';

function result(t, name, file) {
  const dir = invoicer(t, name);
  const r = check(dir);
  assert.equal(r.code, 0, show(r));
  assert.doesNotMatch(r.stdout, /\bapplies\b/, show(r));
  const lines = r.findings.filter((f) => f.code === 'result' && f.file === `.assuredloop/results/${file}`);
  assert.equal(lines.length, 1, `one result line for ${file}:\n${show(r)}`);
  assert.equal(lines[0].severity, 'info', show(r));
  const commit = String(readYaml(dir, `.assuredloop/results/${file}`).commit);
  return { r, line: lines[0], commit };
}

test('C2 adds only the result file: the C1 review shows "declared inputs unchanged since" C1', (t) => {
  const { r, line, commit } = result(t, 'report-base', 'citation-review.yaml');
  assert.ok(line.msg.includes('declared inputs unchanged since'), show(r));
  assert.ok(line.line.includes(commit.slice(0, 7)), `the line names ${commit}:\n${show(r)}`);
});

test('C3 changes the report: the C1 review "does not apply to the current text"', (t) => {
  const { r, line, commit } = result(t, 'res-c3', 'citation-review.yaml');
  assert.ok(line.msg.includes('does not apply to the current text'), show(r));
  assert.ok(line.line.includes(commit.slice(0, 7)), `the old result is shown with its commit ${commit}:\n${show(r)}`);
});

test('an undeclared config file changes: the W3 test result still shows "declared inputs unchanged"', (t) => {
  const { r, line, commit } = result(t, 'res-config', 'export-link-test.yaml');
  assert.ok(line.msg.includes('declared inputs unchanged since'), show(r));
  assert.ok(line.line.includes(commit.slice(0, 7)), show(r));
});

for (const [file, why] of [
  ['commit-unknown.yaml', 'the commit is unknown'],
  ['no-inputs.yaml', 'no inputs are declared'],
  ['input-absent.yaml', 'a declared input is not there'],
  ['commit-absent.yaml', 'the commit is not in the clone'],
]) {
  test(`applicability unknown when ${why}`, (t) => {
    const { r, line } = result(t, 'res-unknown', file);
    assert.ok(line.msg.includes('applicability unknown'), show(r));
    assert.ok(!line.msg.includes('declared inputs unchanged'), show(r));
  });
}

test('beside the unknown ones, the C1 review in the same state still shows "declared inputs unchanged"', (t) => {
  const { r, line } = result(t, 'res-unknown', 'citation-review.yaml');
  assert.ok(line.msg.includes('declared inputs unchanged since'), show(r));
});
