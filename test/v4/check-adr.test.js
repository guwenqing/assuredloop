// al-v4 check on ADRs: the cases of schema.md 5 (#179, task T10), as states of
// the invoicer world (test/v4/fixtures/invoicer/cases/adr-*.yaml, cr-chain.yaml).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, invoicer } from './helpers/invoicer.js';
import { show } from './helpers/project.js';

const run = (t, name, arm) => check(invoicer(t, name, arm));
const all = (r, severity, code, id) => r.findings.filter((f) => f.severity === severity && f.code === code && f.id === id);
const one = (r, severity, code, id) => {
  const found = all(r, severity, code, id);
  assert.ok(found.length >= 1, `a "${severity} ${code}" line on ${id}:\n${show(r)}`);
  return found[0];
};
const coded = (r, ...codes) => r.findings.filter((f) => codes.includes(f.code));
const notOk = (r) => r.findings.filter((f) => f.severity === 'not ok');

test('an accepted ADR whose text changed: not ok adr-changed on ADR-2', (t) => {
  const r = run(t, 'adr-accepted', 'text');
  assert.equal(r.code, 0, show(r));
  one(r, 'not ok', 'adr-changed', 'ADR-2');
});

test('an accepted ADR whose status line alone changed: no finding', (t) => {
  const r = run(t, 'adr-accepted', 'status');
  assert.deepEqual(coded(r, 'adr-changed', 'adr-supersede'), [], show(r));
  assert.deepEqual(notOk(r), [], show(r));
});

test('an accepted ADR whose file was deleted: not ok adr-changed on ADR-2', (t) => {
  const r = run(t, 'adr-accepted', 'deleted');
  one(r, 'not ok', 'adr-changed', 'ADR-2');
});

test('a proposed ADR may change: no adr-changed', (t) => {
  const r = run(t, 'adr-proposed');
  assert.deepEqual(coded(r, 'adr-changed'), [], show(r));
  assert.deepEqual(notOk(r), [], show(r));
});

test('a new ADR supersedes an old one whose status is superseded: no finding', (t) => {
  const r = run(t, 'adr-supersede', 'ok');
  assert.deepEqual(coded(r, 'adr-changed', 'adr-supersede', 'unresolved-link'), [], show(r));
  assert.deepEqual(notOk(r), [], show(r));
});

test('a new ADR supersedes an ADR that does not exist: not ok unresolved-link on ADR-5', (t) => {
  const r = run(t, 'adr-supersede', 'missing');
  assert.ok(one(r, 'not ok', 'unresolved-link', 'ADR-5').line.includes('ADR-9'), show(r));
  assert.deepEqual(coded(r, 'adr-supersede'), [], show(r));
});

test('a new ADR supersedes an old one that is still accepted: hint adr-supersede on ADR-5', (t) => {
  const r = run(t, 'adr-supersede', 'accepted');
  one(r, 'hint', 'adr-supersede', 'ADR-5');
  assert.deepEqual(coded(r, 'adr-changed', 'unresolved-link'), [], show(r));
});

test('a PR changes a paragraph that an accepted ADR decides: hint "check that ADR-4 still holds" on EXP-6', (t) => {
  const r = run(t, 'adr-governs', 'decided');
  assert.ok(one(r, 'hint', 'adr-governs', 'EXP-6').msg.includes('check that ADR-4 still holds'), show(r));
});

test('a PR changes a paragraph that no ADR governs: no adr-governs', (t) => {
  const r = run(t, 'adr-governs', 'free');
  assert.deepEqual(coded(r, 'adr-governs'), [], show(r));
});

test('a PR changes a paragraph that only a superseded ADR decides: no adr-governs', (t) => {
  const r = run(t, 'adr-history');
  assert.deepEqual(coded(r, 'adr-governs'), [], show(r));
  assert.deepEqual(coded(r, 'unresolved-link'), [], show(r));
});

test('a superseded ADR keeps decides links to removed paragraphs (cr-chain): no finding', (t) => {
  const r = run(t, 'cr-chain');
  assert.equal(r.code, 0, show(r));
  assert.deepEqual(coded(r, 'adr-changed', 'adr-supersede', 'unresolved-link'), [], show(r));
  assert.deepEqual(notOk(r), [], show(r));
  assert.deepEqual(r.findings.filter((f) => ['ADR-3', 'ADR-4'].includes(f.id)).map((f) => f.line), [], show(r));
});
