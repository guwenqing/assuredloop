import assert from 'node:assert/strict';
import { test } from 'node:test';

import { expectedMalformedSource } from './fixtures/late-source-pagination/helpers.mjs';
import {
  configureDestinationDrift,
  mainBranchEndpoint,
  makeFinalAcquisitionFixture,
  runBoundedInspect,
} from './fixtures/final-acquisition-failure/helpers.mjs';
import { commandLog } from './fixtures/trace-external-boundaries/helpers.mjs';

const findingsOf = (result) => [
  ...(Array.isArray(result?.findings) ? result.findings : []),
  ...(Array.isArray(result?.context?.findings) ? result.context.findings : []),
  ...(Array.isArray(result?.policy?.findings) ? result.policy.findings : []),
];

const hasForeignRead = (commands) => commands.some((args) =>
  args.some((value) => typeof value === 'string' && value.startsWith('repos/foreign/')));

test('stable padded late-source inspection remains a usable 10000-byte packet', async (t) => {
  const fixture = await makeFinalAcquisitionFixture(t);
  const result = await runBoundedInspect(fixture, 10000);
  const findings = findingsOf(result.data);
  const malformed = findings.find((finding) => finding.code === 'record-context-invalid');
  const commands = await commandLog(fixture);

  assert.equal(result.data.status, 'invalid');
  assert.ok(Buffer.byteLength(result.stdout, 'utf8') <= 10000);
  assert.equal(result.data.work, fixture.work);
  assert.ok(result.data.packet && Array.isArray(result.data.packet.entries));
  assert.deepEqual(malformed?.source, expectedMalformedSource(fixture));
  assert.equal(commands.filter((args) => args[0] === 'api' && args.includes(mainBranchEndpoint)).length, 3,
    'the boundary fake performs two pre-source main reads and one final post-source read');
  assert.equal(hasForeignRead(commands), false);
});

for (const budget of [10000, 8192]) {
  test(`late destination drift remains a bounded acquisition failure without a stale cursor at ${budget} bytes`, async (t) => {
    const fixture = await makeFinalAcquisitionFixture(t);
    const { stable, mainReads } = await configureDestinationDrift(fixture, budget);
    const result = await runBoundedInspect(fixture, budget);
    const findings = findingsOf(result.data);
    const malformed = findings.find((finding) => finding.code === 'record-context-invalid');
    const stale = findings.find((finding) => finding.code === 'acquisition-context-stale');
    const commands = await commandLog(fixture);

    assert.ok(stable.data.packet && Array.isArray(stable.data.packet.entries),
      'the same-budget stable acquisition produces a packet before drift is introduced');
    assert.equal(mainReads.length, 3,
      'the drift sequence changes only the known final main-branch read after source acquisition');
    assert.equal(result.data.status, 'unavailable');
    assert.equal(result.data.work, fixture.work);
    assert.ok(Buffer.byteLength(result.stdout, 'utf8') <= budget,
      `the complete drift failure stays within ${budget} bytes`);
    assert.equal(result.data.packet?.next_cursor, undefined,
      'a stale continuation cursor is never offered after the final acquisition failure');
    assert.equal(findings.some((finding) => finding.code === 'packet-limit'), false,
      'the actual acquisition failure is not replaced by packet-limit');
    assert.equal(stale?.code, 'acquisition-context-stale');
    assert.deepEqual(malformed?.source, expectedMalformedSource(fixture),
      'the final recheck runs after the changed-root source has been acquired');
    assert.equal(hasForeignRead(commands), false);
  });
}
