import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import {
  changeForeignConfig, createTrace, customMapping, destinationConfig, endpoints, foreignFixture,
  foreignRepository, foreignWork, makeCategoryFixture, repository, saveScenario, scenarioOf,
  setIssue, withFixtureEnv, work,
} from './fixtures/architecture-acquisition/helpers.mjs';

const execFile = promisify(execFileCallback);
const cliPath = path.resolve(new URL('../src/cli.js', import.meta.url).pathname);
const pullWork = `${repository}#70`;

async function runCli(fixture, operation, selectedWork = work) {
  const args = [cliPath, operation, '--target', fixture.root, '--work', selectedWork,
    ...(operation === 'inspect' ? ['--max-inline-bytes', '65536'] : [])];
  let result;
  try { result = { ...await execFile(process.execPath, args, { env: fixture.env, maxBuffer: 16 * 1024 * 1024 }), exitCode: 0 }; }
  catch (error) { result = { stdout: error.stdout ?? '', stderr: error.stderr ?? '', exitCode: error.code }; }
  assert.ok(result.stdout.trim(), result.stderr);
  return { ...result, data: JSON.parse(result.stdout) };
}

function classification(source) {
  const value = JSON.parse(source.content.split('\n\n', 1)[0]).classification;
  assert.ok(value, 'acquired Issue exposes classification before boundary rechecks');
  assert.deepEqual(value.discrepancies, [], 'the initial category/configuration is valid');
  return value;
}

test('foreign category configuration cannot add a third repository to acquisition permissions', async (t) => {
  const fixture = await foreignFixture(t);
  const thirdWork = 'third/category-source#1';
  await changeForeignConfig(fixture, (config) => {
    config.repository.allowed_reference_repositories = ['third/category-source'];
  });
  await withFixtureEnv(fixture, async () => {
    const trace = await createTrace({ targetRoot: fixture.root, work });
    assert.equal(classification(await trace.load(foreignWork)).category, 'spike');
    await assert.rejects(() => trace.load(thirdWork), (error) => error.code === 'reference-out-of-scope',
      'foreign config supplies label names but cannot import its repository permissions');
  });
  assert.equal((await endpoints(fixture)).some((endpoint) => endpoint.startsWith('repos/third/category-source')), false,
    'the unauthorized third repository is rejected before any remote access');
});

test('a narrower assessment denies cached foreign Issue, bundle, and mapping recheck access', async (t) => {
  const fixture = await foreignFixture(t);
  await destinationConfig(fixture, { branch: 'narrow-category-destination', allowed: [] });
  await withFixtureEnv(fixture, async () => {
    const trace = await createTrace({ targetRoot: fixture.root, work });
    classification(await trace.load(foreignWork));
    assert.equal((await trace.bundleAt(foreignWork)).classification.category, 'spike');
    const before = (await endpoints(fixture)).filter((endpoint) => endpoint.startsWith(`repos/${foreignRepository}`)).length;
    await trace.bindPolicyScope(await trace.pullAt(pullWork));
    await assert.rejects(() => trace.load(foreignWork), (error) => error.code === 'reference-out-of-scope');
    await assert.rejects(() => trace.bundleAt(foreignWork), (error) => error.code === 'reference-out-of-scope');
    await assert.rejects(() => trace.recheckAcquisition(), (error) => error.code === 'reference-out-of-scope',
      'a prior wide mapping cache does not authorize rechecking through its old permissions');
    const after = (await endpoints(fixture)).filter((endpoint) => endpoint.startsWith(`repos/${foreignRepository}`)).length;
    assert.equal(after, before, 'narrow denial happens before cached return or remote recheck');
  });
});

for (const drift of ['default branch', 'branch head', 'configuration bytes']) {
  test(`foreign category acquisition rejects ${drift} drift after classification`, async (t) => {
    const fixture = await foreignFixture(t);
    await withFixtureEnv(fixture, async () => {
      const trace = await createTrace({ targetRoot: fixture.root, work });
      const first = classification(await trace.load(foreignWork));
      assert.equal(first.config_ref.revision, fixture.foreign.revision);
      if (drift === 'configuration bytes') {
        await changeForeignConfig(fixture, (config) => { config.repository.labels.type.spike = 'Changed: Research'; });
      } else {
        const scenario = await scenarioOf(fixture);
        if (drift === 'default branch') scenario.foreignRepositories[foreignRepository].default_branch = 'next';
        else scenario.foreignRecords[foreignRepository]['git/ref/heads/trunk'].object.sha = 'c'.repeat(40);
        await saveScenario(fixture, scenario);
      }
      await assert.rejects(() => trace.recheckAcquisition(), (error) => {
        assert.match(`${error.code} ${error.message}`, /stale|changed/i);
        return true;
      }, 'classification may not certify stable context after its mapping source changed');
    });
  });
}

test('check and inspect reject same-run Issue label drift even when both category/activity pairs are valid', async (t) => {
  for (const operation of ['check', 'inspect']) {
    const fixture = await foreignFixture(t);
    const scenario = await scenarioOf(fixture);
    const original = structuredClone(scenario.records['issues/62']);
    const changed = { ...original, labels: [{ name: fixture.mapping.bug }] };
    scenario.endpointSequences = { [`repos/${repository}/issues/62`]: [original, changed] };
    await saveScenario(fixture, scenario);
    const result = await runCli(fixture, operation);
    assert.notEqual(result.exitCode, 0);
    assert.notEqual(result.data.status, 'pass');
    assert.match(JSON.stringify(result.data.findings), /context-source-stale|label.*changed|changed.*label/i,
      'valid Task/deliver to Bug/deliver relabeling still changes assessed source identity');
    assert.ok((await endpoints(fixture)).filter((endpoint) => endpoint === `repos/${repository}/issues/62`).length >= 2,
      'the command actually re-reads the assessed Issue labels');
  }
});

test('a primary feature PR classifies same-repository Issues using its effective destination mapping', async (t) => {
  const fixture = await makeCategoryFixture(t);
  const destination = await destinationConfig(fixture, { mapping: customMapping });
  await setIssue(fixture, { activity: 'plan', labels: [customMapping['architecture-task'].toUpperCase()] });
  const result = await runCli(fixture, 'inspect', pullWork);
  assert.equal(result.exitCode, 0, JSON.stringify(result.data.findings));
  assert.equal(result.data.status, 'pass');
  const entry = result.data.packet.entries.find((item) => item.ref === work);
  assert.equal(entry?.disposition, 'inlined');
  const resolved = classification(entry);
  assert.equal(resolved.category, 'architecture-task');
  assert.equal(resolved.activity, 'plan');
  assert.equal(resolved.config_ref.revision, destination.revision);
  assert.notEqual(destination.revision, fixture.revision, 'destination and repository-default mapping revisions differ');
  assert.equal((await endpoints(fixture)).includes(`repos/${repository}/git/ref/heads/${fixture.defaultBranch}`), false,
    'same-repository Issue classification does not replace the selected PR destination with the default branch');
});
