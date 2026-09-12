import assert from 'node:assert/strict';
import test from 'node:test';
import { prerequisite, closeout, retained, oldRef, dispositionRef, disposition } from './fixtures/issue37-lifecycle-work/helpers.mjs';

for (const verdict of ['revise', 'pass']) {
  test(`linked merged prerequisite retains old ${verdict} but qualifies fresh exact historical review pair`, async (t) => {
    const f = await prerequisite(t, { verdict });
    const result = await f.run();
    assert.equal(result.exit, 0, JSON.stringify(result.value.findings));
    assert.equal(result.value.status, 'pass');
    assert.equal(result.value.policy.config.project.review.routing.additional, 'on-request');
    assert.equal(f.store.records['issues/40'].state, 'open');
    retained(result, f.old);
    if (verdict === 'revise') {
      const inspected = await f.inspect();
      assert.equal(inspected.exit, 0, JSON.stringify(inspected.value.findings));
      const original = inspected.value.packet.entries.find((entry) => entry.ref?.comment_id === oldRef.comment_id);
      assert.equal(original?.content, f.oldComment.body, 'reviewer packet retains the complete original assessment body');
      const resolved = inspected.value.packet.entries.find((entry) => entry.ref?.comment_id === dispositionRef.comment_id);
      assert.equal(resolved?.content, disposition, 'reviewer packet retains the actual referenced disposition body');
    }
    assert.match(JSON.stringify(result.value.records), /original-additional-session/);
    assert.match(JSON.stringify(result.value.records), /1\.2/);
  });
}
for (const verdict of ['revise', 'pass']) {
  test(`linked merged prerequisite cannot qualify from old ${verdict} alone`, async (t) => {
    const f = await prerequisite(t, { verdict, mode: 'old-only' });
    const result = await f.run();
    assert.notEqual(result.exit, 0);
    assert.match(JSON.stringify(result.value.findings), /prerequisite-unverified|delivery-review-missing|review-primary-missing|review-additional-missing/);
    assert.equal(result.value.review_routing.find((item) => item.pr === 'example/consumer#43').status, 'satisfied', 'current PR review cannot fill the missing historical prerequisite reviews');
  });
}
for (const mode of ['wrong-base-only', 'wrong-policy-only']) {
  test(`linked merged prerequisite ${mode} cannot replace exact delivered historical policy`, async (t) => {
    const f = await prerequisite(t, { mode }); const result = await f.run();
    assert.notEqual(result.exit, 0);
    assert.match(JSON.stringify(result.value.findings), /prerequisite-unverified|historical-evidence|evidence.*stale|policy/);
  });
}
for (const mode of ['malformed', 'wrong-pr', 'unavailable-source']) {
  test(`linked recursive prerequisite ${mode} remains visible failure beside valid final reviews`, async (t) => {
    const f = await prerequisite(t, { mode }); const result = await f.run();
    assert.notEqual(result.exit, 0);
    assert.match(JSON.stringify(result.value.findings), mode === 'malformed' ? /invalid|malformed/ : mode === 'wrong-pr' ? /unavailable|mismatch|identity|missing|out.of.scope/ : /unavailable|source|missing|drift/);
  });
}
test('linked closeout retains earlier prerequisite REVISE while exact delivered review and fixed manifest qualify', async (t) => {
  const f = await closeout(t); const result = await f.run();
  assert.equal(result.exit, 0, JSON.stringify(result.value.findings));
  assert.equal(result.value.manifest.valid, true);
  assert.equal(result.value.synchronization.status, 'valid');
  retained(result, f.old);
});
test('linked closeout cannot use only earlier prerequisite review despite its fixed manifest entry', async (t) => {
  const f = await closeout(t, { oldOnly: true }); const result = await f.run();
  assert.notEqual(result.exit, 0);
  assert.match(JSON.stringify(result.value.findings), /prerequisite-unverified|delivery-review-missing|historical-evidence/);
});
