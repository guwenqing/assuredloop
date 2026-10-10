// al-v4 check on dispositions beyond D06 and D14 (#179, task T10; design.md 5):
// states of the invoicer world (test/v4/fixtures/invoicer/cases/cr-*.yaml).
// An invalid disposition is a hint, and not ok under --strict; a source
// version with no disposition yet (pending) is no finding.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, invoicer } from './helpers/invoicer.js';
import { HEX64, readYaml, show } from './helpers/project.js';

const run = (t, name, ...args) => {
  const dir = invoicer(t, name);
  return { dir, ...check(dir, ...args) };
};
// The disposition findings that count: hint, or not ok under --strict.
const invalid = (r) => r.findings.filter((f) => f.code === 'disposition' && f.severity !== 'info');

test('cr-wording: a recorded wording decision makes the reworded EXP-10 valid; --strict exits 0', (t) => {
  const r = run(t, 'cr-wording');
  const d3 = readYaml(r.dir, '.assuredloop/records/requests/invoice-exports.yaml').decisions.find((d) => d.id === 'D3');
  assert.match(String(d3?.wording?.source_sha256), HEX64, `index fills D3's wording hashes:\n${JSON.stringify(d3)}`);
  assert.match(String(d3?.wording?.target_sha256), HEX64, `index fills D3's wording hashes:\n${JSON.stringify(d3)}`);
  assert.deepEqual(invalid(r), [], show(r));
  const strict = run(t, 'cr-wording', '--strict');
  assert.equal(strict.code, 0, show(strict));
});

test('cr-revert: an unexplained revert of INV-11 makes SP-2\'s incorporated disposition invalid', (t) => {
  const r = run(t, 'cr-revert');
  assert.equal(r.code, 0, show(r));
  assert.deepEqual(invalid(r).map((f) => `${f.severity} ${f.id}`), ['hint reminder-emails/SP-2'], show(r));
  const strict = run(t, 'cr-revert', '--strict');
  assert.equal(strict.code, 1, show(strict));
  assert.deepEqual(invalid(strict).map((f) => `${f.severity} ${f.id}`), ['not ok reminder-emails/SP-2'], show(strict));
});

test('cr-supersede: SP-6 superseded by link-refresh/SP-2, which incorporated EXP-4: valid', (t) => {
  const r = run(t, 'cr-supersede');
  assert.deepEqual(invalid(r), [], show(r));
});

test('cr-chain: the chain A→B→C that ends in a removal is valid', (t) => {
  const r = run(t, 'cr-chain');
  assert.deepEqual(invalid(r), [], show(r));
  const strict = run(t, 'cr-chain', '--strict');
  assert.deepEqual(invalid(strict), [], show(strict));
});

test('cr-abandon: SP-7 abandoned after its revert, SP-10 to SP-12 never applied: valid', (t) => {
  const r = run(t, 'cr-abandon');
  assert.deepEqual(invalid(r), [], show(r));
});

test('cr-45: SP-6 edited after its incorporation has no disposition for its new version: pending, no finding', (t) => {
  const r = run(t, 'cr-45');
  assert.equal(r.code, 0, show(r));
  assert.deepEqual(invalid(r), [], show(r));
  const strict = run(t, 'cr-45', '--strict');
  assert.deepEqual(invalid(strict), [], show(strict));
});
