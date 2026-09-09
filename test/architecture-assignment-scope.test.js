import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import {
  bodyFor, createTrace, endpoints, foreignPullWork, foreignRepository, makeAssignmentScopeFixture,
  makeIncidentalBodyFixture, narrowPullWork, saveScenario, scenarioOf, withFixtureEnv, work, workIssue,
} from './fixtures/architecture-assignment-scope/helpers.mjs';

const execFile = promisify(execFileCallback);
const cliPath = path.resolve(new URL('../src/cli.js', import.meta.url).pathname);

function sourceClassification(source) {
  return JSON.parse(source.content.split('\n\n', 1)[0]).classification;
}

function assertContainer(classification) {
  assert.equal(classification.exception, 'epic-container', 'a denied or unrelated PR cannot revoke this scope’s container exception');
  assert.deepEqual(classification.discrepancies, []);
  assert.deepEqual(classification.assigned_prs ?? [], [], 'denied assignments are not copied into derived context');
}

function assertAssigned(classification) {
  assert.equal(classification.exception, null, 'a permitted known assignment cannot inherit a narrower scope’s cached exception');
  assert.deepEqual(classification.assigned_prs, [foreignPullWork]);
  assert.ok(classification.discrepancies.some((finding) => finding.severity === 'error'
    && /record-context|execution|assignment/i.test(`${finding.code} ${finding.message}`)));
}

async function foreignReadCount(fixture) {
  return (await endpoints(fixture)).filter((endpoint) => endpoint.startsWith(`repos/${foreignRepository}`)).length;
}

async function narrow(trace) {
  await trace.bindPolicyScope(await trace.pullAt(narrowPullWork));
}

test('narrow-to-wide reset restores a known foreign assignment in cached Issue source and bundle context', async (t) => {
  const fixture = await makeAssignmentScopeFixture(t);
  await withFixtureEnv(fixture, async () => {
    const trace = await createTrace({ targetRoot: fixture.root, work });
    await trace.pullAt(foreignPullWork);
    await narrow(trace);
    const count = await foreignReadCount(fixture);
    assertContainer(sourceClassification(await trace.load(work)));
    assertContainer((await trace.bundleAt(work)).classification);
    assert.equal(await foreignReadCount(fixture), count, 'narrow classification performs no denied foreign read');
    trace.resetScope();
    const source = sourceClassification(await trace.load(work));
    const bundle = (await trace.bundleAt(work)).classification;
    assertAssigned(bundle);
    assertAssigned(source);
    assert.deepEqual(source, bundle, 'source and bundle use the same effective assignment scope');
  });
});

test('wide-to-narrow transition does not retain a denied assignment from cached Issue source', async (t) => {
  const fixture = await makeAssignmentScopeFixture(t);
  await withFixtureEnv(fixture, async () => {
    const trace = await createTrace({ targetRoot: fixture.root, work });
    await trace.pullAt(foreignPullWork);
    assertAssigned(sourceClassification(await trace.load(work)));
    assertAssigned((await trace.bundleAt(work)).classification);
    await narrow(trace);
    const count = await foreignReadCount(fixture);
    const source = sourceClassification(await trace.load(work));
    const bundle = (await trace.bundleAt(work)).classification;
    assertContainer(bundle);
    assertContainer(source);
    assert.deepEqual(source, bundle);
    await assert.rejects(() => trace.pullAt(foreignPullWork), (error) => error.code === 'reference-out-of-scope');
    assert.equal(await foreignReadCount(fixture), count, 'denied cached assignments do not trigger physical repository reads');
  });
});

test('unrelated foreign mappings preserve the container through repeated scope transitions', async (t) => {
  const fixture = await makeAssignmentScopeFixture(t, { assigned: false });
  await withFixtureEnv(fixture, async () => {
    const trace = await createTrace({ targetRoot: fixture.root, work });
    await trace.pullAt(foreignPullWork);
    for (const scope of ['wide', 'narrow', 'wide', 'narrow']) {
      if (scope === 'narrow') await narrow(trace);
      else trace.resetScope();
      const count = await foreignReadCount(fixture);
      assertContainer(sourceClassification(await trace.load(work)));
      assertContainer((await trace.bundleAt(work)).classification);
      assert.equal(await foreignReadCount(fixture), count, 'scope evaluation reuses allowed observations without foreign discovery');
    }
  });
});

test('source rechecks skip denied foreign PRs and detect their changed body only after scope restoration', async (t) => {
  const fixture = await makeAssignmentScopeFixture(t);
  await withFixtureEnv(fixture, async () => {
    const trace = await createTrace({ targetRoot: fixture.root, work });
    await trace.pullAt(foreignPullWork);
    await narrow(trace);
    const scenario = await scenarioOf(fixture);
    scenario.foreignRecords[foreignRepository]['pulls/270'].body = bodyFor({
      issues: ['example/consumer#99'], basis: [], no_spec_reason: 'The previously observed foreign PR assignment changed.',
    });
    await saveScenario(fixture, scenario);
    const count = await foreignReadCount(fixture);
    const denied = await trace.recheckWorkSources();
    assert.equal(await foreignReadCount(fixture), count, 'freshness never widens the active read scope');
    assert.equal(denied.some((finding) => JSON.stringify(finding).includes(foreignPullWork)), false,
      'denied source contents do not become freshly observed findings');
    trace.resetScope();
    const permitted = await trace.recheckWorkSources();
    assert.ok(permitted.some((finding) => /stale|changed/i.test(`${finding.code} ${finding.message}`)
      && JSON.stringify(finding).includes(foreignPullWork)), 'once permitted again, an observed PR’s body participates in source freshness');
    assert.ok(await foreignReadCount(fixture) > count, 'the changed foreign source is actually re-read in the restored scope');
  });
});

async function runCli(fixture, operation) {
  const args = [cliPath, operation, '--target', fixture.root, '--work', workIssue,
    ...(operation === 'inspect' ? ['--max-inline-bytes', '65536'] : [])];
  let result;
  try { result = { ...await execFile(process.execPath, args, { env: fixture.env, maxBuffer: 16 * 1024 * 1024 }), exitCode: 0 }; }
  catch (error) { result = { stdout: error.stdout ?? '', stderr: error.stderr ?? '', exitCode: error.code }; }
  assert.ok(result.stdout.trim(), result.stderr);
  return { ...result, data: JSON.parse(result.stdout) };
}

for (const operation of ['check', 'inspect']) {
  test(`${operation} rejects an already observed incidental PR changing its authoritative Issue assignment`, async (t) => {
    const fixture = await makeIncidentalBodyFixture(t, { drift: true });
    assert.notEqual(fixture.originalPull.body, fixture.changedPull.body);
    const result = await runCli(fixture, operation);
    assert.notEqual(result.exitCode, 0, 'a container result cannot pass after its observed PR assignment source changes');
    assert.notEqual(result.data.status, 'pass');
    assert.match(JSON.stringify(result.data.findings), /stale|changed/i);
    const calls = await endpoints(fixture);
    assert.ok(calls.filter((endpoint) => endpoint === 'repos/example/consumer/pulls/44').length >= 2,
      'the known incidental PR body is re-read, rather than requiring a new global search');
    assert.equal(calls.some((endpoint) => /repos\/example\/consumer\/pulls\?/.test(endpoint)), false);
  });
}

test('unchanged incidental PR mapping to other work remains a valid container control', async (t) => {
  for (const operation of ['check', 'inspect']) {
    const fixture = await makeIncidentalBodyFixture(t);
    const result = await runCli(fixture, operation);
    assert.equal(result.exitCode, 0, JSON.stringify(result.data.findings));
    assert.equal(result.data.status, 'pass');
    const classification = operation === 'check'
      ? result.data.records.find((entry) => entry.context?.issue?.number === 42).context.classification
      : sourceClassification(result.data.packet.entries.find((entry) => entry.ref === workIssue));
    assertContainer(classification);
    assert.ok((await endpoints(fixture)).includes('repos/example/consumer/pulls/44'));
  }
});
