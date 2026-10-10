// al-v4 check: a change's own links are not stale or removed by its own work,
// and a superseded ADR's decides links are history (#179, task T10). Each test
// has a control in the same state that still fires.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, invoicer } from './helpers/invoicer.js';
import { show } from './helpers/project.js';

const run = (t, name, arm) => check(invoicer(t, name, arm));
const on = (r, code, id) => r.findings.filter((f) => f.code === code && f.id === id);

test('cr-supersede: no stale-base on link-refresh/SP-2, whose own change incorporated EXP-4; another change\'s binding to EXP-4 is stale', (t) => {
  const r = run(t, 'cr-supersede');
  assert.deepEqual(on(r, 'stale-base', 'link-refresh/SP-2'), [], show(r));
  for (const id of ['link-expiry-spike/SP-2', 'link-expiry-spike/SP-3']) {
    assert.equal(on(r, 'stale-base', id).length, 1, `${id} builds on EXP-4, which link-refresh changed:\n${show(r)}`);
  }
});

test('cr-chain: no target-removed on the removes: links of portal-downloads, which removed the targets; another change\'s link gets it', (t) => {
  const r = run(t, 'cr-chain');
  for (const id of ['portal-downloads/SP-2', 'portal-downloads/SP-3', 'portal-downloads/SP-6']) {
    assert.deepEqual(on(r, 'target-removed', id), [], show(r));
    assert.deepEqual(on(r, 'unresolved-link', id), [], show(r));
  }
  assert.equal(on(r, 'target-removed', 'link-expiry-spike/SP-2').length, 1, show(r));
  assert.equal(on(r, 'target-removed', 'link-expiry-spike/SP-2')[0].severity, 'hint', show(r));
});

test('a binding held by a superseded ADR is history: no stale-base on ADR-5 (adr-history) nor on ADR-3 (cr-supersede)', (t) => {
  const history = run(t, 'adr-history');
  assert.deepEqual(on(history, 'stale-base', 'ADR-5'), [], show(history));
  const supersede = run(t, 'cr-supersede');
  assert.deepEqual(on(supersede, 'stale-base', 'ADR-3'), [], show(supersede));
});

test('control: a binding held by an accepted ADR still gets stale-base when its target changes (ADR-4 decides EXP-6, EXP-4)', (t) => {
  const decided = run(t, 'adr-governs', 'decided');
  assert.equal(on(decided, 'stale-base', 'ADR-4').length, 1, show(decided));
  assert.equal(on(decided, 'stale-base', 'ADR-4')[0].severity, 'hint', show(decided));
  const supersede = run(t, 'cr-supersede');
  assert.equal(on(supersede, 'stale-base', 'ADR-4').length, 1, show(supersede));
});
