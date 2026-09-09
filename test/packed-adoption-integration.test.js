import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { git, makeGitFixture } from './fixtures/adoption/helpers.js';
import {
  makeFinalAcquisitionFixture,
} from './fixtures/final-acquisition-failure/helpers.mjs';
import {
  makeSecondaryUnavailableFixture,
  commandLog,
} from './fixtures/secondary-unavailable/helpers.mjs';
import { saveScenario, scenarioOf } from './fixtures/trace-external-boundaries/helpers.mjs';
import { makeTraceFixture, workIssue, workPull } from './fixtures/trace-cli/helpers.mjs';
import {
  consumerConfig,
  installPackedCli,
  makePackedArtifact,
  runPackedCli,
} from './fixtures/packed-adoption-integration/helpers.mjs';

let artifact;

test.before(async (t) => {
  artifact = await makePackedArtifact(t);
});

function findingsOf(output) {
  return [
    ...(Array.isArray(output?.findings) ? output.findings : []),
    ...(Array.isArray(output?.policy?.findings) ? output.policy.findings : []),
    ...(Array.isArray(output?.context?.findings) ? output.context.findings : []),
    ...(Array.isArray(output?.policies) ? output.policies.flatMap((policy) => policy.findings || []) : []),
    ...(Array.isArray(output?.records) ? output.records.flatMap((record) => record.findings || []) : []),
  ];
}

function findingText(output) {
  return JSON.stringify(findingsOf(output));
}

function packetRefs(output) {
  return (output?.packet?.entries || []).map((entry) => JSON.stringify(entry.ref));
}

function apiEndpoints(commands) {
  return commands.filter((args) => args[0] === 'api')
    .flatMap((args) => args.filter((value) => value.startsWith('repos/')));
}

function assertNoFrameworkApiLeak(commands) {
  assert.equal(apiEndpoints(commands).some((endpoint) => endpoint.includes('guwenqing/assuredloop-base')), false,
    'installed framework provenance does not become a GitHub API target');
}

test('packed CLI initializes a different consumer from the installed executable and keeps contracts separate', async (t) => {
  const target = await makeGitFixture({
    prefix: 'assuredloop-packed-consumer-',
    remote: 'https://github.com/acme/packed-consumer.git',
    files: {
      'README.md': '# Consumer fixture\n',
      'openspec/config.yaml': 'schema: spec-driven\n',
      'openspec/specs/product/spec.md': '# Consumer product requirements\n',
    },
  });
  t.after(() => rm(target.root, { recursive: true, force: true }));

  const packageInfo = await installPackedCli(t, target.root, artifact);
  assert.match(packageInfo.resolvedExecutable, /node_modules\/assuredloop-base\/src\/cli\.js$/);
  assert.equal(packageInfo.packageJson.name, artifact.manifest.name);
  assert.equal(packageInfo.packageJson.version, artifact.manifest.version);
  assert.equal(packageInfo.metadata.name, artifact.manifest.name);
  assert.equal(packageInfo.metadata.version, artifact.manifest.version);
  assert.equal(packageInfo.metadata.basis, 'bootstrap');
  assert.equal(packageInfo.lockfile.packages['node_modules/@fission-ai/openspec'].version, '1.12.0');
  assert.equal(packageInfo.lockfile.packages['node_modules/ajv'].version, '8.20.0');
  assert.ok(artifact.manifest.files.every(({ path: entry }) => !/(^|\/)(test|openspec|local-data)(\/|$)/.test(entry)),
    'the packed allowlist excludes framework instance records and execution data');

  const config = consumerConfig(packageInfo);
  const configPath = path.join(artifact.root, 'packed-consumer-config.json');
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const version = await runPackedCli(packageInfo.executable, ['--version'], { GH_HOST: 'github.com' });
  assert.equal(version.exitCode, 0);
  assert.equal(version.stdout.trim(), artifact.manifest.version);
  const help = await runPackedCli(packageInfo.executable, ['--help'], { GH_HOST: 'github.com' });
  assert.equal(help.exitCode, 0);
  assert.match(help.stdout, /inspect/);
  assert.match(help.stdout, /check/);

  const preview = await runPackedCli(packageInfo.executable, [
    'init', '--target', target.root, '--config', configPath, '--local-only',
  ], { GH_HOST: 'github.com' });
  assert.equal(preview.exitCode, 0);
  assert.equal(preview.data?.status, 'preview');
  assert.ok(preview.data.files.every((file) => file.path === '.assuredloop/config.json' ||
    file.path.startsWith('.gemini/skills/assuredloop-')));
  assert.equal(await readFile(path.join(target.root, 'README.md'), 'utf8'), '# Consumer fixture\n');

  const applied = await runPackedCli(packageInfo.executable, [
    'init', '--target', target.root, '--config', configPath, '--local-only', '--apply',
  ], { GH_HOST: 'github.com' });
  assert.equal(applied.exitCode, 0);
  assert.equal(applied.data?.status, 'applied');
  assert.deepEqual(JSON.parse(await readFile(path.join(target.root, '.assuredloop/config.json'), 'utf8')), config);
  const renderedSkill = await readFile(path.join(target.root, '.gemini/skills/assuredloop-adopt/SKILL.md'), 'utf8');
  assert.match(renderedSkill, /acme\/packed-consumer/);
  assert.match(renderedSkill, new RegExp(artifact.manifest.version.replaceAll('.', '\\.')));
  assert.equal(await readFile(path.join(target.root, 'openspec/specs/product/spec.md'), 'utf8'), '# Consumer product requirements\n');
  await assert.rejects(readFile(path.join(target.root, 'openspec/specs/project-workflow-adoption/spec.md')),
    (error) => error.code === 'ENOENT');
  assert.ok(await readFile(path.join(packageInfo.packageRoot, 'contracts/project-workflow-adoption/spec.md'), 'utf8'));
  assert.equal((await git(target.root, ['remote', 'get-url', 'origin'])).stdout.trim(), 'https://github.com/acme/packed-consumer.git');
});

test('packed inspect and check use the installed package against a consumer fixture', async (t) => {
  const inspectFixture = await makeTraceFixture(t);
  const installedInspect = await installPackedCli(t, inspectFixture.root, artifact);
  const beforeInspect = (await git(inspectFixture.root, ['status', '--porcelain'])).stdout;
  const inspected = await runPackedCli(installedInspect.executable, [
    'inspect', '--target', inspectFixture.root, '--work', workIssue, '--max-inline-bytes', '65536',
  ], inspectFixture.env);
  assert.equal(inspected.exitCode, 0, inspected.stderr);
  assert.equal(inspected.data?.operation, 'inspect');
  assert.equal(inspected.data?.status, 'pass');
  assert.equal(inspected.data?.context?.issue?.number, 42);
  assert.ok(packetRefs(inspected.data).some((ref) => ref.includes('example/consumer#42')));
  assert.ok(packetRefs(inspected.data).some((ref) => ref.includes('example/consumer#43')));
  const inspectCommands = await commandLog(inspectFixture);
  const inspectApi = inspectCommands.filter((args) => args[0] === 'api');
  assert.ok(inspectApi.length > 0);
  assert.equal(inspectApi.every((args) => args[args.indexOf('--method') + 1] === 'GET'), true);
  assert.equal(inspectApi.some((args) => args.some((value) => value.includes('evil.invalid'))), false);
  assertNoFrameworkApiLeak(inspectCommands);
  assert.match(JSON.stringify(inspected.data), /guwenqing\/assuredloop-base/,
    'framework contract provenance remains data in the installed package binding');
  assert.equal((await git(inspectFixture.root, ['status', '--porcelain'])).stdout, beforeInspect);

  const checkFixture = await makeTraceFixture(t, { candidateActivation: true });
  const installedCheck = await installPackedCli(t, checkFixture.root, artifact);
  const checked = await runPackedCli(installedCheck.executable, [
    'check', '--target', checkFixture.root, '--work', workPull,
  ], checkFixture.env);
  assert.equal(checked.exitCode, 0, checked.stderr);
  assert.equal(checked.data?.operation, 'check');
  assert.equal(checked.data?.status, 'pass');
  assert.equal(checked.data?.policy?.mode, 'bootstrap');
  assert.equal(checked.data?.policy?.activation, null);
  assert.match(findingText(checked.data), /semantic-authorization-review-required/);
  assert.match(findingText(checked.data), /not-active/);
  const checkCommands = await commandLog(checkFixture);
  assert.equal(checkCommands.every((args) => args[0] !== 'api' ||
    args[args.indexOf('--method') + 1] === 'GET'), true);
  assertNoFrameworkApiLeak(checkCommands);
  assert.equal(checked.data?.policy?.contract_package?.source_ref?.repository, 'guwenqing/assuredloop-base');

  const retargetFixture = await makeTraceFixture(t, { baseRef: 'release', evidenceBaseRef: 'main' });
  const installedRetarget = await installPackedCli(t, retargetFixture.root, artifact);
  const retargeted = await runPackedCli(installedRetarget.executable, [
    'check', '--target', retargetFixture.root, '--work', workPull,
  ], retargetFixture.env);
  assert.notEqual(retargeted.data?.status, 'pass');
  assert.match(findingText(retargeted.data), /stale|retarget|base_ref|destination/i);
});

test('packed check distinguishes unavailable GitHub environments from unavailable records and local-only control', async (t) => {
  const cases = [
    {
      name: 'missing gh',
      patch: {},
      env: { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin` },
      reason: 'missing-binary',
    },
    { name: 'unsupported gh', patch: { version: '2.87.0' }, reason: 'unsupported-version' },
    { name: 'authentication required', patch: { auth: 'fail' }, reason: 'authentication-required' },
    { name: 'permission denied', patch: { mode: 'forbidden' }, reason: 'insufficient-access' },
    { name: 'rate limited', patch: { mode: 'rate-limited' }, reason: 'rate-limited' },
  ];

  for (const scenarioCase of cases) {
    const fixture = await makeTraceFixture(t);
    const scenario = await scenarioOf(fixture);
    Object.assign(scenario, scenarioCase.patch);
    await saveScenario(fixture, scenario);
    const installed = await installPackedCli(t, fixture.root, artifact);
    const result = await runPackedCli(installed.executable, [
      'check', '--target', fixture.root, '--work', workPull,
    ], { ...fixture.env, ...scenarioCase.env });
    assert.notEqual(result.exitCode, 0, scenarioCase.name);
    assert.equal(result.data?.status, 'unavailable', scenarioCase.name);
    const unavailable = result.data?.findings?.find((finding) => finding.code === 'tool-unavailable');
    assert.ok(unavailable, `${scenarioCase.name} has a typed tool-unavailable finding`);
    assert.equal(unavailable.details?.reason, scenarioCase.reason, scenarioCase.name);
    assert.equal(result.data?.findings?.some((finding) => finding.code === 'record-unavailable'), false,
      `${scenarioCase.name} is not misreported as a missing record`);
    assertNoFrameworkApiLeak(await commandLog(fixture));
  }

  const localFixture = await makeTraceFixture(t);
  const localInstalled = await installPackedCli(t, localFixture.root, artifact);
  const local = await runPackedCli(localInstalled.executable, [
    'check', '--target', localFixture.root, '--work', workPull, '--local-only',
  ], localFixture.env);
  assert.notEqual(local.exitCode, 0);
  assert.equal(local.data?.mode, 'local-only');
  assert.equal(local.data?.status, 'incomplete');
  assert.ok(local.data?.findings?.some((finding) => finding.code === 'github-skipped'));
  assert.ok(local.data?.findings?.some((finding) => finding.code === 'policy-unavailable'));
  assert.deepEqual(await commandLog(localFixture), []);
});

test('packed inspect preserves typed unavailable outcomes for missing and malformed sources', async (t) => {
  const missingFixture = await makeTraceFixture(t, { missing: ['issues/comments/100'] });
  const missingPackage = await installPackedCli(t, missingFixture.root, artifact);
  const missing = await runPackedCli(missingPackage.executable, [
    'inspect', '--target', missingFixture.root, '--work', workPull,
  ], missingFixture.env);
  assert.notEqual(missing.exitCode, 0);
  assert.equal(missing.data?.status, 'unavailable');
  assert.match(findingText(missing.data), /policy-unavailable|record-unavailable|not-found/);
  assert.doesNotMatch(findingText(missing.data), /tool-unavailable|insufficient-access/);

  const missingContextFixture = await makeTraceFixture(t);
  const missingContextScenario = await scenarioOf(missingContextFixture);
  missingContextScenario.records['issues/43'].body = 'The routed PR body has no authoritative Workflow context.\n';
  missingContextScenario.records['pulls/43'].body = missingContextScenario.records['issues/43'].body;
  await saveScenario(missingContextFixture, missingContextScenario);
  const missingContextPackage = await installPackedCli(t, missingContextFixture.root, artifact);
  const missingContext = await runPackedCli(missingContextPackage.executable, [
    'inspect', '--target', missingContextFixture.root, '--work', workPull,
  ], missingContextFixture.env);
  assert.notEqual(missingContext.exitCode, 0);
  assert.equal(missingContext.data?.status, 'invalid');
  assert.ok(findingsOf(missingContext.data).some((finding) => finding.code === 'record-context-missing'));

  const malformedFixture = await makeFinalAcquisitionFixture(t);
  const malformedPackage = await installPackedCli(t, malformedFixture.root, artifact);
  const malformed = await runPackedCli(malformedPackage.executable, [
    'inspect', '--target', malformedFixture.root, '--work', malformedFixture.work, '--max-inline-bytes', '10000',
  ], malformedFixture.env);
  assert.notEqual(malformed.exitCode, 0);
  assert.equal(malformed.data?.status, 'invalid');
  assert.ok(findingsOf(malformed.data).some((finding) => finding.code === 'record-context-invalid'));

  await writeFile(malformedFixture.ghLog, '');
  const stable = await runPackedCli(malformedPackage.executable, [
    'inspect', '--target', malformedFixture.root, '--work', malformedFixture.work, '--max-inline-bytes', '8192',
  ], malformedFixture.env);
  const stableCommands = await commandLog(malformedFixture);
  const mainBranchEndpoint = 'repos/example/consumer/git/ref/heads/main';
  const mainReads = stableCommands.filter((args) => args[0] === 'api' && args.includes(mainBranchEndpoint));
  assert.ok(stable.data?.packet);
  assert.equal(mainReads.length, 3);
  await writeFile(path.join(malformedFixture.root, 'packed-final-acquisition-drift.txt'), 'new destination\n');
  await git(malformedFixture.root, ['add', 'packed-final-acquisition-drift.txt']);
  await git(malformedFixture.root, ['commit', '-q', '-m', 'advance destination after packed source acquisition']);
  const advancedRevision = (await git(malformedFixture.root, ['rev-parse', 'HEAD'])).stdout.trim();
  const scenario = await scenarioOf(malformedFixture);
  const initialRevision = scenario.records['git/ref/heads/main'].object.sha;
  scenario.endpointSequences = {
    ...(scenario.endpointSequences ?? {}),
    [mainBranchEndpoint]: mainReads.map((_, index) => ({
      ref: 'refs/heads/main',
      object: { type: 'commit', sha: index === mainReads.length - 1 ? advancedRevision : initialRevision },
    })),
  };
  await saveScenario(malformedFixture, scenario);
  await writeFile(malformedFixture.ghLog, '');
  const drift = await runPackedCli(malformedPackage.executable, [
    'inspect', '--target', malformedFixture.root, '--work', malformedFixture.work, '--max-inline-bytes', '8192',
  ], malformedFixture.env);
  assert.notEqual(drift.exitCode, 0);
  assert.equal(drift.data?.status, 'unavailable');
  assert.ok(findingsOf(drift.data).some((finding) => finding.code === 'acquisition-context-stale'));
  assert.equal(drift.data?.packet?.next_cursor, undefined);
});

test('packed Issue-root assessment keeps a wider primary and types missing secondary acquisition', async (t) => {
  const controlFixture = await makeSecondaryUnavailableFixture(t, { missing: 'control' });
  const controlInstalled = await installPackedCli(t, controlFixture.root, artifact);
  const control = await runPackedCli(controlInstalled.executable, [
    'inspect', '--target', controlFixture.root, '--work', workIssue,
  ], controlFixture.env);
  assert.equal(control.exitCode, 0);
  assert.equal(control.data?.status, 'pass');
  const controlEndpoints = apiEndpoints(await commandLog(controlFixture));
  assert.equal(controlEndpoints.some((endpoint) => endpoint.includes('foreign/a/issues/comments/9001')), true);
  assert.equal(controlEndpoints.some((endpoint) => endpoint.includes('foreign/b/issues/comments/9003')), true,
    'the wider primary explicitly permits both linked secondary evidence sources');
  assertNoFrameworkApiLeak(await commandLog(controlFixture));

  const branchFixture = await makeSecondaryUnavailableFixture(t, { missing: 'branch', restrictPrimary: false });
  const branchInstalled = await installPackedCli(t, branchFixture.root, artifact);
  const inspected = await runPackedCli(branchInstalled.executable, [
    'inspect', '--target', branchFixture.root, '--work', workIssue,
  ], branchFixture.env);
  const output = inspected.data;
  assert.notEqual(inspected.exitCode, 0);
  assert.equal(output?.status, 'unavailable');
  assert.ok(output?.packet);
  assert.equal(output?.policy?.status, 'available');
  assert.match(packetRefs(output).join('\n'), /example\/consumer#42/);
  assert.match(packetRefs(output).join('\n'), /example\/consumer#43/);
  const branchFailure = assertSecondaryAcquisitionUnavailable(output, {
    branch: 'linked-second',
  });
  assert.equal(Object.hasOwn(branchFailure.details, 'config_ref'), false);
  const branchEndpoints = apiEndpoints(await commandLog(branchFixture));
  assert.equal(branchEndpoints.some((endpoint) => endpoint.includes('foreign/a/issues/comments/9001')), true,
    'the available linked secondary remains assessed under the wider primary');
  assertNoFrameworkApiLeak(await commandLog(branchFixture));

  const checkedBranch = await runPackedCli(branchInstalled.executable, [
    'check', '--target', branchFixture.root, '--work', workIssue,
  ], branchFixture.env);
  assert.notEqual(checkedBranch.data?.status, 'pass');
  assert.ok(checkedBranch.data?.policies?.some((policy) =>
    policy.status === 'available' && policy.assessment?.pr === 'example/consumer#43'));
  assert.equal(checkedBranch.data?.policies?.some((policy) =>
    policy.status === 'available' && policy.assessment?.pr === 'example/consumer#45'), false);
  assertSecondaryAcquisitionUnavailable(checkedBranch.data, { branch: 'linked-second' });
  assertNoFrameworkApiLeak(await commandLog(branchFixture));

  const configFixture = await makeSecondaryUnavailableFixture(t, { missing: 'config', restrictPrimary: false });
  const configInstalled = await installPackedCli(t, configFixture.root, artifact);
  const configChecked = await runPackedCli(configInstalled.executable, [
    'check', '--target', configFixture.root, '--work', workIssue,
  ], configFixture.env);
  const configScenario = await scenarioOf(configFixture);
  const currentSecondaryRevision = configScenario.records['git/ref/heads/linked-second'].object.sha;
  const configFailure = assertSecondaryAcquisitionUnavailable(configChecked.data, {
    branch: 'linked-second',
    configRef: {
      repository: 'example/consumer',
      revision: currentSecondaryRevision,
      path: '.assuredloop/config.json',
    },
  });
  assert.equal(configFailure.details.cause_details?.reason, 'path-missing');
  assert.equal(configChecked.data?.policies?.some((policy) =>
    policy.status === 'available' && policy.assessment?.pr === 'example/consumer#45'), false);
  assertNoFrameworkApiLeak(await commandLog(configFixture));
});

function assertSecondaryAcquisitionUnavailable(output, { branch, configRef } = {}) {
  const finding = findingsOf(output).find((entry) => {
    const text = JSON.stringify(entry);
    return entry.code === 'secondary-acquisition-unavailable' && entry.details?.work === 'example/consumer#45' &&
      /record-unavailable/i.test(text);
  });
  assert.ok(finding, 'the missing secondary has an attributed secondary-acquisition-unavailable finding');
  assert.equal(finding.details.work, 'example/consumer#45');
  assert.equal(finding.details.cause, 'record-unavailable');
  assert.equal(finding.details.branch, branch);
  if (configRef) assert.deepEqual(finding.details.config_ref, configRef);
  return finding;
}
