import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  expectedMalformedSource,
  expectedPaddingReferences,
  makeLateSourcePaginationFixture,
} from './fixtures/late-source-pagination/helpers.mjs';
import { runCli } from './fixtures/trace-external-boundaries/helpers.mjs';

const budgets = [8192, 10000, 12000];

function findingsOf(result) {
  return [
    ...(Array.isArray(result?.findings) ? result.findings : []),
    ...(Array.isArray(result?.context?.findings) ? result.context.findings : []),
    ...(Array.isArray(result?.policy?.findings) ? result.policy.findings : []),
  ];
}

function referenceKey(ref) {
  return typeof ref === 'string' ? ref : JSON.stringify(ref);
}

for (const budget of budgets) {
  test(`bounded inspect keeps late source diagnostics and walks every page at ${budget} bytes`, async (t) => {
    const fixture = await makeLateSourcePaginationFixture(t);
    const expectedSource = expectedMalformedSource(fixture);
    const expectedComments = expectedPaddingReferences(fixture).map(referenceKey);
    const pages = [];
    let cursor = null;

    for (let pageNumber = 0; pageNumber < 128; pageNumber += 1) {
      const args = [
        'inspect', '--target', fixture.root, '--work', fixture.work,
        '--max-inline-bytes', String(budget),
      ];
      if (cursor) args.push('--cursor', cursor);
      const result = await runCli(args, fixture.env);
      assert.ok(result.data, `inspect page ${pageNumber} returned structured JSON: ${result.stderr}`);
      assert.equal(result.data.operation, 'inspect');
      assert.equal(result.data.status, 'invalid', `late malformed source remains an inspection error on page ${pageNumber}`);
      assert.ok(Buffer.byteLength(result.stdout, 'utf8') <= budget,
        `complete page ${pageNumber} including its trailing newline stays within ${budget} bytes`);

      const findings = findingsOf(result.data);
      const malformed = findings.filter((finding) => finding.code === 'record-context-invalid');
      assert.equal(malformed.length, 1, `page ${pageNumber} retains exactly one malformed-context diagnostic`);
      assert.deepEqual(malformed[0].source, expectedSource,
        `page ${pageNumber} attributes the malformed context to the changed root`);
      assert.match(malformed[0].message, /Malformed record JSON/);

      const packet = result.data.packet;
      assert.ok(packet && Array.isArray(packet.entries), `page ${pageNumber} retains reviewer inventory`);
      assert.equal(result.data.work, fixture.work);
      pages.push(packet);
      cursor = packet.next_cursor;
      if (!cursor) break;
    }

    assert.equal(Boolean(cursor), false, 'bounded inspect reaches a terminal page');
    assert.ok(pages.length > 1, 'the late source fixture exercises continuation pages');

    const entries = pages.flatMap((packet) => packet.entries);
    const references = entries.map((entry) => referenceKey(entry.ref));
    assert.equal(new Set(references).size, references.length,
      'continuation pages do not duplicate inventory entries');
    assert.equal(new Set(pages.map((packet) => packet.counts.total)).size, 1,
      'continuation pages retain one complete inventory total');
    assert.equal(pages[0].counts.total, entries.length,
      'walking every cursor page yields the complete inventory');
    assert.ok(references.includes(fixture.work), 'the selected work root remains in the inventory');
    assert.ok(references.includes(referenceKey(expectedSource)), 'the changed source remains in the inventory');
    for (const comment of expectedComments) {
      assert.ok(references.includes(comment), `late comment ${comment} remains in the inventory`);
    }
  });
}
