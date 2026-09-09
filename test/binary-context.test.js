import assert from 'node:assert/strict';
import { test } from 'node:test';

import { categoryMapping } from './fixtures/work-records/helpers.mjs';

import { createTrace } from '../src/trace.js';
import { buildReviewPacket } from '../src/review-packet.js';
import { checkWorkRecords } from '../src/work-records.js';
import {
  git,
  makeBinaryFixture,
  issueSnapshot,
  work,
} from './fixtures/binary-context/helpers.mjs';

function findingText(value) {
  return JSON.stringify(value ?? []).toLowerCase();
}

async function traceFor(t) {
  const fixture = await makeBinaryFixture(t);
  const previous = new Map(Object.keys(fixture.env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, fixture.env);
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const trace = await createTrace({ targetRoot: fixture.root, work });
  return { fixture, trace };
}

test('trace.load keeps exact non-UTF-8 Git bytes as an explicit non-text source result', async (t) => {
  const { fixture, trace } = await traceFor(t);

  const loaded = await trace.load(fixture.binaryRef);

  assert.deepEqual(loaded.bytes, fixture.binaryBytes);
  assert.ok(Buffer.isBuffer(loaded.bytes));
  assert.equal(loaded.disposition, 'unavailable');
  assert.equal(loaded.reason, 'non-text-source');
  assert.equal(loaded.content, undefined);
  assert.equal((await git(fixture.root, ['status', '--porcelain'])).stdout, fixture.statusBefore);
});

test('review packets retain a binary reference and continue inlining readable neighbors', async (t) => {
  const { fixture, trace } = await traceFor(t);

  const packet = await buildReviewPacket({
    roots: [fixture.binaryRef, fixture.textRef],
    load: trace.load,
    maxInlineBytes: 8192,
  });

  const binary = packet.entries.find((entry) => entry.ref.path === fixture.binaryRef.path);
  const text = packet.entries.find((entry) => entry.ref.path === fixture.textRef.path);
  assert.ok(binary, 'binary source remains in the packet inventory');
  assert.deepEqual(binary.ref, fixture.binaryRef);
  assert.equal(binary.disposition, 'unavailable');
  assert.equal(binary.reason, 'non-text-source');
  assert.equal(Object.hasOwn(binary, 'content'), false, 'binary bytes are not dumped into packet text');
  assert.equal(Object.hasOwn(binary, 'bytes'), false, 'binary bytes are retained by the loader, not serialized in the packet');
  assert.equal(text.disposition, 'inlined');
  assert.match(text.content, /Readable context/);
  assert.equal(packet.counts.total, 2);
  assert.equal((await git(fixture.root, ['status', '--porcelain'])).stdout, fixture.statusBefore);
});

test('generic basis references verify raw binary acquisition while retaining semantic review', async (t) => {
  const { fixture, trace } = await traceFor(t);
  const issue = issueSnapshot({
    activity: 'research',
    request: work,
    basis: [fixture.binaryRef],
  }, 42, [{ name: 'type:spike' }]);

  const result = await checkWorkRecords({
    work,
    categoryMapping,
    issue,
    phase: 'handoff',
    resolveRef: trace.load,
  });

  assert.equal(result.status, 'valid', JSON.stringify(result));
  assert.doesNotMatch(findingText(result.findings), /reference-unavailable|non-text-source/);
  const source = result.context.references.find((entry) => entry.ref.path === fixture.binaryRef.path);
  assert.ok(source, 'raw binary source remains linked in work-record context');
  assert.deepEqual(source.bytes, fixture.binaryBytes);
  assert.equal(source.disposition, 'unavailable');
  assert.equal(source.reason, 'non-text-source');
  assert.match(findingText(result.findings), /semantic|research|review/);
  assert.equal((await git(fixture.root, ['status', '--porcelain'])).stdout, fixture.statusBefore);
});

test('PlanRef binary sources stay unavailable and never fabricate native task parsing', async (t) => {
  const { fixture, trace } = await traceFor(t);
  const issue = issueSnapshot({
    activity: 'deliver',
    request: work,
    change: 'binary-context',
    basis: [fixture.textRef],
    plan_items: [fixture.binaryPlanRef],
  });

  const result = await checkWorkRecords({
    work,
    categoryMapping,
    issue,
    phase: 'handoff',
    resolveRef: trace.load,
  });

  assert.equal(result.status, 'unavailable', JSON.stringify(result));
  const unavailable = result.findings.find((finding) => finding.code === 'reference-unavailable');
  assert.ok(unavailable, JSON.stringify(result));
  assert.equal(unavailable.details?.cause, 'non-text-source', JSON.stringify(result));
  assert.doesNotMatch(findingText(result.findings), /plan-item-missing/);
  assert.equal(
    Boolean(result.context.task_associations?.some((entry) => entry.associations?.some((item) => item.verified))),
    false,
  );
  assert.equal((await git(fixture.root, ['status', '--porcelain'])).stdout, fixture.statusBefore);
});

test('heading anchors require text and report binary acquisition as unavailable', async (t) => {
  const { fixture, trace } = await traceFor(t);
  const issue = issueSnapshot({
    activity: 'research',
    request: work,
    basis: [fixture.anchoredBinaryRef],
  }, 42, [{ name: 'type:spike' }]);

  const result = await checkWorkRecords({
    work,
    categoryMapping,
    issue,
    phase: 'handoff',
    resolveRef: trace.load,
  });

  assert.equal(result.status, 'unavailable', JSON.stringify(result));
  const unavailable = result.findings.find((finding) => finding.code === 'reference-unavailable');
  assert.ok(unavailable, JSON.stringify(result));
  assert.equal(unavailable.details?.cause, 'non-text-source', JSON.stringify(result));
  assert.doesNotMatch(findingText(result.findings), /heading anchor is available|plan-item-missing/);
  assert.equal((await git(fixture.root, ['status', '--porcelain'])).stdout, fixture.statusBefore);
});
