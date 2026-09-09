import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import {
  activities, addForeignIssue, addPull, customMapping, foreignRepository, foreignWork, git,
  makeCategoryFixture, pullWork, readLog, recordFor, repository, setIssue, work,
} from './fixtures/architecture-category/helpers.mjs';

const execFile = promisify(execFileCallback);
const cliPath = path.resolve(new URL('../src/cli.js', import.meta.url).pathname);
const traceUrl = new URL('../src/trace.js', import.meta.url).href;

async function runCli(fixture, operation, selectedWork = work, extra = []) {
  const args = [cliPath, operation, '--target', fixture.root, '--work', selectedWork,
    ...(operation === 'inspect' ? ['--max-inline-bytes', '65536'] : []), ...extra];
  let result;
  try { result = { ...await execFile(process.execPath, args, { env: fixture.env, maxBuffer: 16 * 1024 * 1024 }), exitCode: 0 }; }
  catch (error) { result = { stdout: error.stdout ?? '', stderr: error.stderr ?? '', exitCode: error.code }; }
  assert.ok(result.stdout.trim(), `CLI returned no JSON: ${result.stderr}`);
  result.data = JSON.parse(result.stdout);
  assert.doesNotMatch(JSON.stringify(result.data.findings), /Current acquisition configuration is invalid/,
    'SETUP BLOCKED: the six-category fixture must reach acquisition before behavioral RED is meaningful');
  return result;
}

function checkClassification(result, selectedWork = work) {
  const record = result.data.records?.find((entry) => entry.work === selectedWork || entry.context?.work === selectedWork)
    ?? (selectedWork === work ? result.data.records?.[0] : undefined);
  assert.ok(record?.context?.classification, `check exposes classification for ${selectedWork}`);
  return record.context.classification;
}

function packetSource(result, selectedWork = work) {
  const entry = result.data.packet?.entries?.find((item) => item.ref === selectedWork);
  assert.equal(entry?.disposition, 'inlined', `inspect inlines source context for ${selectedWork}: ${JSON.stringify(result.data.findings)}`);
  return JSON.parse(entry.content.split('\n\n', 1)[0]);
}

function assertClassification(value, { category, activity, labels, valid = true, exception = null, configRepository = repository } = {}) {
  assert.ok(value && typeof value === 'object', 'reviewer context exposes derived classification');
  assert.deepEqual(value.labels, labels, 'actual label spelling is preserved in derived context');
  assert.equal(value.category, category, 'resolved category uses the configured canonical category key');
  assert.equal(value.activity, activity, 'context exposes the declared activity without substituting another selector');
  assert.ok(Array.isArray(value.discrepancies), 'context exposes classification discrepancies even when empty');
  if (valid) assert.deepEqual(value.discrepancies, [], 'compatible declarations have no category errors');
  else assert.ok(value.discrepancies.some((finding) => finding.severity === 'error'),
    'incompatible, missing, or multiple declarations are errors, not display warnings');
  assert.equal(value.exception, exception);
  if (category) {
    assert.deepEqual([...value.rule?.activities ?? []].sort(), [...activities[category]].sort(),
      'the applicable formal compatibility rule is explicit');
    assert.match(JSON.stringify(value.rule?.basis), /work-categories-and-activities-are-formally-consistent/,
      'the derived rule identifies its authoritative formal basis');
  }
  assert.equal(value.config_ref?.repository, configRepository, 'classification records the effective mapping repository');
  assert.equal(value.config_ref?.path, '.assuredloop/config.json');
  assert.match(value.config_ref?.revision ?? '', /^[a-f0-9]{40}$/);
  assert.match(value.config_digest ?? '', /^[a-f0-9]{64}$/);
}

async function assertReadOnly(fixture) {
  assert.equal((await git(fixture.root, ['status', '--porcelain'])).stdout, fixture.statusBefore);
  const api = (await readLog(fixture.ghLog)).filter((args) => args[0] === 'api');
  assert.ok(api.length, 'the fixture exercised live acquisition');
  assert.ok(api.every((args) => args[args.indexOf('--method') + 1] === 'GET'), 'classification uses GET-only GitHub reads');
}

for (const [category, allowed] of Object.entries(activities)) {
  for (const activity of allowed) {
    test(`formal category accepts ${category}/${activity} in check and acquisition context`, async (t) => {
      const fixture = await makeCategoryFixture(t);
      const source = await setIssue(fixture, { category, activity, labels: [fixture.mapping[category], 'priority:high', 'owner:team'] });
      const checked = await runCli(fixture, 'check');
      const expected = { category, activity, labels: source.labels };
      assertClassification(checkClassification(checked), expected);
      if (activity === 'closeout') {
        assert.match(JSON.stringify(checked.data.findings), /closeout-context-unavailable/,
          'standalone closeout still reports its separate missing aggregate candidate');
        const script = `const { createTrace } = await import(${JSON.stringify(traceUrl)}); const trace = await createTrace({ targetRoot: process.argv[1], work: process.argv[2] }); console.log(JSON.stringify(await trace.load(process.argv[2])));`;
        const acquired = await execFile(process.execPath, ['--input-type=module', '--eval', script, fixture.root, work], { env: fixture.env });
        assertClassification(JSON.parse(JSON.parse(acquired.stdout).content.split('\n\n', 1)[0]).classification, expected);
      } else {
        assert.equal(checked.exitCode, 0, JSON.stringify(checked.data.findings));
        assert.equal(checked.data.status, 'pass');
        const inspected = await runCli(fixture, 'inspect');
        assert.equal(inspected.exitCode, 0, JSON.stringify(inspected.data.findings));
        assert.equal(inspected.data.status, 'pass');
        assertClassification(packetSource(inspected).classification, expected);
      }
      await assertReadOnly(fixture);
    });
  }
}

for (const [category, activity] of [
  ['request', 'deliver'], ['epic', 'triage'], ['architecture-task', 'deliver'],
  ['task', 'plan'], ['task', 'closeout'], ['bug', 'review'], ['spike', 'deliver'],
]) {
  test(`formal category rejects incompatible ${category}/${activity}`, async (t) => {
    const fixture = await makeCategoryFixture(t);
    const source = await setIssue(fixture, { category, activity });
    const checked = await runCli(fixture, 'check');
    assert.equal(checked.data.status, 'invalid');
    assert.notEqual(checked.exitCode, 0);
    assertClassification(checkClassification(checked), { category, activity, labels: source.labels, valid: false });
    // closeout also requires an aggregate candidate; its classification is already checked above.
    if (activity !== 'closeout') {
      const inspected = await runCli(fixture, 'inspect');
      assert.equal(inspected.data.status, 'invalid');
      assert.notEqual(inspected.exitCode, 0);
      assertClassification(packetSource(inspected).classification, { category, activity, labels: source.labels, valid: false });
    }
  });
}

for (const [name, categories] of [
  ['missing', []], ['multiple executable', ['architecture-task', 'task']],
  ['Request plus Task', ['request', 'task']], ['Epic plus Task', ['epic', 'task']],
]) {
  test(`routed activity rejects ${name} category declarations`, async (t) => {
    const fixture = await makeCategoryFixture(t);
    const labels = [...categories.map((category) => fixture.mapping[category]), 'priority:high'];
    await setIssue(fixture, { activity: 'deliver', labels });
    for (const operation of ['check', 'inspect']) {
      const result = await runCli(fixture, operation);
      assert.equal(result.data.status, 'invalid');
      assert.notEqual(result.exitCode, 0);
      const classification = operation === 'check' ? checkClassification(result) : packetSource(result).classification;
      assertClassification(classification, { category: null, activity: 'deliver', labels, valid: false });
      assert.match(JSON.stringify(classification.discrepancies), categories.length ? /multiple|exactly one/i : /missing|required|exactly one/i);
    }
  });
}

for (const category of ['architecture-task', 'task', 'bug', 'spike']) {
  test(`${category} cannot borrow the rough-intake exception when Workflow context is missing`, async (t) => {
    const fixture = await makeCategoryFixture(t);
    const source = await setIssue(fixture, { category });
    for (const operation of ['check', 'inspect']) {
      const result = await runCli(fixture, operation);
      assert.equal(result.data.status, 'invalid');
      assert.notEqual(result.exitCode, 0);
      const classification = operation === 'check' ? checkClassification(result) : packetSource(result).classification;
      assertClassification(classification, { category, activity: null, labels: source.labels, valid: false });
      assert.doesNotMatch(JSON.stringify(result.data.findings), /rough-intake-context/);
    }
  });
}

for (const category of [null, 'request', 'epic']) {
  test(`${category ?? 'unclassified'} permits only its limited intake or container exception`, async (t) => {
    const fixture = await makeCategoryFixture(t);
    const source = await setIssue(fixture, { category });
    for (const operation of ['check', 'inspect']) {
      const result = await runCli(fixture, operation);
      assert.ok(['pass', 'incomplete'].includes(result.data.status), JSON.stringify(result.data.findings));
      const classification = operation === 'check' ? checkClassification(result) : packetSource(result).classification;
      assertClassification(classification, { category, activity: null, labels: source.labels,
        exception: category === 'epic' ? 'epic-container' : 'rough-request' });
      assert.doesNotMatch(JSON.stringify(result.data.findings), /record-context-(?:missing|required)/);
    }
  });
}

test('custom labels match case-insensitively and default-looking unrelated labels have no fallback meaning', async (t) => {
  const fixture = await makeCategoryFixture(t, { mapping: customMapping });
  const labels = [customMapping['architecture-task'].toUpperCase(), 'type:task', 'type:bug', 'architecture', 'priority:high'];
  await setIssue(fixture, { activity: 'plan', labels });
  for (const operation of ['check', 'inspect']) {
    const result = await runCli(fixture, operation);
    assert.equal(result.data.status, 'pass', JSON.stringify(result.data.findings));
    const classification = operation === 'check' ? checkClassification(result) : packetSource(result).classification;
    assertClassification(classification, { category: 'architecture-task', activity: 'plan', labels });
  }
  await setIssue(fixture, { activity: 'deliver', labels: ['type:task'] });
  const missing = await runCli(fixture, 'check');
  assert.equal(missing.data.status, 'invalid', 'custom configuration does not silently fall back to default labels');
  assertClassification(checkClassification(missing), { category: null, activity: 'deliver', labels: ['type:task'], valid: false });
});

test('selected PR labels do not classify the PR and cannot satisfy its mapped Issue category', async (t) => {
  const fixture = await makeCategoryFixture(t);
  await setIssue(fixture, { category: 'task', activity: 'deliver' });
  await addPull(fixture);
  const inspected = await runCli(fixture, 'inspect', pullWork);
  assert.equal(inspected.data.status, 'pass', JSON.stringify(inspected.data.findings));
  assert.equal(packetSource(inspected, pullWork).classification, undefined, 'PR labels do not declare an Issue category');
  assertClassification(packetSource(inspected).classification, { category: 'task', activity: 'deliver', labels: [fixture.mapping.task] });
  await setIssue(fixture, { activity: 'deliver', labels: [] });
  for (const operation of ['check', 'inspect']) {
    const result = await runCli(fixture, operation, pullWork);
    assert.equal(result.data.status, 'invalid');
    const classification = operation === 'check' ? checkClassification(result) : packetSource(result).classification;
    assertClassification(classification, { category: null, activity: 'deliver', labels: [], valid: false });
  }
});

for (const relation of ['mapped Issue', 'prerequisite']) {
  test(`${relation} uses its own allowed repository mapping and exposes its configuration provenance`, async (t) => {
    const fixture = await makeCategoryFixture(t, { allowForeign: true });
    const foreign = await addForeignIssue(fixture);
    await setIssue(fixture, { category: 'task', record: recordFor('deliver', relation === 'prerequisite' ? { depends_on: [foreignWork] } : {}) });
    if (relation === 'mapped Issue') await addPull(fixture, { issues: [foreignWork] });
    const selected = relation === 'mapped Issue' ? pullWork : work;
    const inspected = await runCli(fixture, 'inspect', selected, ['--expand', foreignWork]);
    assert.equal(inspected.data.status, 'pass', JSON.stringify(inspected.data.findings));
    assertClassification(packetSource(inspected, foreignWork).classification, {
      category: 'spike', activity: 'research', labels: foreign.labels, configRepository: foreignRepository,
    });
    assert.equal(packetSource(inspected, foreignWork).classification.config_ref.revision, foreign.revision);
    assert.equal(packetSource(inspected, foreignWork).classification.config_digest, foreign.configDigest);
    const checked = await runCli(fixture, 'check', selected);
    const foreignContext = relation === 'mapped Issue'
      ? checkClassification(checked, foreignWork)
      : checked.data.records?.[0]?.context?.prerequisites?.find((entry) => entry.work === foreignWork)?.classification;
    assertClassification(foreignContext, { category: 'spike', activity: 'research', labels: foreign.labels, configRepository: foreignRepository });
    if (relation === 'prerequisite') assert.equal(checked.data.status, 'pass', JSON.stringify(checked.data.findings));
    await addForeignIssue(fixture, { valid: false });
    const invalid = await runCli(fixture, 'check', selected);
    assert.equal(invalid.data.status, 'invalid');
    assert.match(JSON.stringify(invalid.data.findings), /categor|classif/i,
      'foreign incompatibility must be checked, not lost behind the primary mapping');
    await assertReadOnly(fixture);
  });
}

test('an allowed foreign Issue with unavailable mapping cannot inherit the primary mapping', async (t) => {
  const fixture = await makeCategoryFixture(t, { allowForeign: true });
  await addForeignIssue(fixture, { missingConfig: true });
  await setIssue(fixture, { category: 'task', record: recordFor('deliver', { depends_on: [foreignWork] }) });
  for (const operation of ['check', 'inspect']) {
    const result = await runCli(fixture, operation);
    assert.notEqual(result.data.status, 'pass');
    assert.match(JSON.stringify(result.data.findings), /categor|classif|configuration|config.*unavailable/i);
  }
});

test('closed unclassified and Request Issues cannot borrow the pre-triage rough intake exception', async (t) => {
  const fixture = await makeCategoryFixture(t);
  for (const category of [null, 'request']) {
    const source = await setIssue(fixture, { category, state: 'closed', stateReason: 'not_planned' });
    for (const operation of ['check', 'inspect']) {
      const result = await runCli(fixture, operation);
      assert.equal(result.data.status, 'invalid');
      const classification = operation === 'check' ? checkClassification(result) : packetSource(result).classification;
      assertClassification(classification, { category, activity: null, labels: source.labels, valid: false });
      assert.doesNotMatch(JSON.stringify(result.data.findings), /rough-intake-context/);
    }
  }
});

test('a closed container Epic may still omit executable context', async (t) => {
  const fixture = await makeCategoryFixture(t);
  const source = await setIssue(fixture, { category: 'epic', state: 'closed', stateReason: 'completed' });
  for (const operation of ['check', 'inspect']) {
    const result = await runCli(fixture, operation);
    assert.ok(['pass', 'incomplete'].includes(result.data.status), JSON.stringify(result.data.findings));
    const classification = operation === 'check' ? checkClassification(result) : packetSource(result).classification;
    assertClassification(classification, { category: 'epic', activity: null, labels: source.labels, exception: 'epic-container' });
  }
});

test('Request plus Epic without a record is still an ambiguous classification', async (t) => {
  const fixture = await makeCategoryFixture(t);
  const labels = [fixture.mapping.request, fixture.mapping.epic];
  await setIssue(fixture, { labels });
  for (const operation of ['check', 'inspect']) {
    const result = await runCli(fixture, operation);
    assert.equal(result.data.status, 'invalid');
    const classification = operation === 'check' ? checkClassification(result) : packetSource(result).classification;
    assertClassification(classification, { category: null, activity: null, labels, valid: false });
  }
});
