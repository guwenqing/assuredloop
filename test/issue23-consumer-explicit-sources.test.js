import assert from 'node:assert/strict';
import test from 'node:test';
import { linkedConsumerFixture, wrap } from './fixtures/issue23-consumer/helpers.mjs';
import { readLog } from './fixtures/trace-cli/helpers.mjs';

for (const operation of ['inspect', 'check']) {
  for (const field of ['PR basis', 'Evidence input']) {
    test(`linked ${operation} still requires an explicit ${field} identical to the package source declaration`, async (t) => {
      const f = await linkedConsumerFixture(t);
      const explicit = structuredClone(f.evidence.contract_package.source_ref);
      if (field === 'PR basis') {
        const pr = { ...f.pull, basis: [...f.pull.basis, explicit] };
        const body = wrap(pr);
        f.store.records['pulls/43'].body = body;
        f.store.records['issues/43'].body = body;
      } else {
        f.evidence.evidence.push(explicit);
        f.updateEvidence();
      }
      await f.save();
      const result = await f.run(operation);
      assert.notEqual(result.exit, 0, `${field} was incorrectly excluded as toolkit provenance`);
      assert.notEqual(result.value.status, 'pass');
      assert.match(JSON.stringify(result.value.findings), /reference-out-of-scope|outside.*(?:scope|permitted)/i,
        'explicit source remains subject to the current consumer read ceiling');
      assert.equal(result.value.runtime?.mode, 'linked-development');
      assert.deepEqual(f.evidence.contract_package.source_ref, explicit,
        'declared package provenance is preserved even when acquisition is excluded');
      const commands = await readLog(f.ghLog);
      assert.equal(commands.some((args) => args.some((arg) => arg.startsWith(`repos/${explicit.repository}`))), false,
        'the linked exception grants no additional GitHub source permission');
    });
  }
}
