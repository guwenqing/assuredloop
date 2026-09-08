import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import {
  deltaPath,
  git,
  makeCloseoutFixture,
  manifestArchivePath,
  openspecRoot,
  readLog,
} from './fixtures/closeout-cli/helpers.mjs';
import { validateRecord } from '../src/records.js';

const execFile = promisify(execFileCallback);
const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname);
const cliPath = path.join(repositoryRoot, 'src', 'cli.js');

async function runCli(args, env) {
  try {
    const result = await execFile(process.execPath, [cliPath, ...args], {
      env,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { ...result, exitCode: 0 };
  } catch (error) {
    return {
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
      exitCode: error.code,
    };
  }
}

function outputOf(result) {
  assert.ok(result.stdout.trim(), `CLI returned no JSON output; stderr: ${result.stderr}`);
  return JSON.parse(result.stdout.trim());
}

function findingText(result) {
  return JSON.stringify(result);
}

function findingCodes(result) {
  return [
    ...(Array.isArray(result.findings) ? result.findings : []),
    ...(Array.isArray(result.manifest?.findings) ? result.manifest.findings : []),
    ...(Array.isArray(result.synchronization?.findings) ? result.synchronization.findings : []),
  ].map((finding) => `${finding.code ?? ''} ${finding.message ?? ''}`).join('\n');
}

function packetOf(result) {
  return result.packet ?? result.context?.packet ?? result.closeout?.packet;
}

function synchronizationOf(result) {
  return result.synchronization ?? result.sync ?? result.context?.synchronization ?? result.context?.sync ?? result.closeout?.synchronization;
}

function manifestOf(result) {
  return result.manifest ?? result.context?.manifest ?? result.closeout?.manifest;
}

function closeoutArgs(fixture, command = 'check', extra = {}) {
  return [
    command,
    '--target', fixture.root,
    '--work', fixture.work,
    '--delta-ref', JSON.stringify(extra.deltaRef ?? fixture.deltaRef),
    '--manifest-ref', JSON.stringify(extra.manifestRef ?? fixture.manifestRef),
  ];
}

function entryRefKey(entry) {
  return JSON.stringify(entry?.ref ?? entry?.source ?? null);
}

function packetRefs(packet) {
  return new Set((packet?.entries ?? []).map(entryRefKey));
}

function hasValidWork(result, work) {
  const seen = new Set();
  function visit(value) {
    if (!value || typeof value !== 'object' || seen.has(value)) return false;
    seen.add(value);
    if (value.status === 'valid' && (value.work === work || value.context?.work === work)) return true;
    return Array.isArray(value) ? value.some(visit) : Object.values(value).some(visit);
  }
  return visit(result);
}

test('check evaluates an open closeout candidate with delivered prerequisites, full synchronization, and manifest fixity', async (t) => {
  const fixture = await makeCloseoutFixture(t);
  const result = await runCli(closeoutArgs(fixture), fixture.env);
  const checked = outputOf(result);

  assert.equal(result.exitCode, 0, findingText(checked));
  assert.equal(checked.operation, 'check');
  assert.equal(checked.mode, 'live');
  assert.equal(checked.status, 'pass', 'an open closeout candidate may pass formal pre-merge checks');
  assert.equal(checked.context?.issue?.number ?? checked.issue?.number, 90);
  assert.ok((checked.context?.pulls ?? checked.pulls ?? []).some((pull) => pull.number === 91));

  const synchronization = synchronizationOf(checked);
  assert.ok(synchronization && typeof synchronization === 'object', 'closeout check exposes native synchronization assessment');
  assert.equal(synchronization.status, 'valid', JSON.stringify(synchronization));
  const manifest = manifestOf(checked);
  assert.ok(manifest && typeof manifest === 'object', 'closeout check exposes acceptance manifest assessment');
  assert.equal(manifest.valid, true, JSON.stringify(manifest));

  assert.ok(hasValidWork(checked, fixture.prerequisiteIssue),
    'the actual delivered prerequisite is checked as a closed merged work record');
  assert.match(findingText(checked), /formal-check-only|semantic|review/i,
    'formal output keeps the independent semantic/authorization boundary visible');

  assert.equal(packetOf(checked), undefined,
    'formal closeout check diagnostics do not expose a dead-end reviewer packet');
  assert.doesNotMatch(JSON.stringify(checked), /"next_cursor"/,
    'formal check output does not expose an unredeemable packet cursor');

  const inspectResult = await runCli([
    ...closeoutArgs(fixture, 'inspect'), '--max-inline-bytes', '8192',
  ], fixture.env);
  const inspected = outputOf(inspectResult);
  assert.equal(inspectResult.exitCode, 0, findingText(inspected));
  assert.equal(inspected.operation, 'inspect');
  assert.equal(inspected.status, 'pass');
  assert.ok(Buffer.byteLength(inspectResult.stdout, 'utf8') <= 8192,
    'bounded closeout context is supplied through inspect');
  const packet = packetOf(inspected);
  assert.ok(packet && Array.isArray(packet.entries), 'inspect returns the bounded closeout reviewer packet');
  assert.ok(packet.counts && packet.counts.total >= 5, 'inspect inventories all closeout roots');
  const refs = packetRefs(packet);
  assert.ok([...refs].some((ref) => ref.includes(fixture.deltaRef.path)), 'the fixed delta root remains in inspect context');
  assert.ok([...refs].some((ref) => ref.includes(fixture.manifestRef.path)), 'the candidate manifest root remains in inspect context');

  assert.equal(await git(fixture.root, ['status', '--porcelain']).then(({ stdout }) => stdout), fixture.statusBefore,
    'closeout check does not write the target checkout');
  const commands = await readLog(fixture.ghLog);
  assert.equal(commands.some((args) => args.includes('--method') && args[args.indexOf('--method') + 1] !== 'GET'), false,
    'closeout check uses read-only GitHub operations');
  assert.equal(commands.some((args) => args.some((value) => value.includes('evil.invalid'))), false,
    'command-looking ticket text is treated as data');
});

test('inspect paginates the complete closeout packet without dropping delta, manifest, or prerequisite roots', async (t) => {
  const fixture = await makeCloseoutFixture(t);
  const responseBudget = 8192;
  const pages = [];
  let cursor = null;
  let complete = false;
  for (let page = 0; page < 32; page += 1) {
    const args = [...closeoutArgs(fixture, 'inspect'), '--max-inline-bytes', String(responseBudget)];
    if (cursor) args.push('--cursor', cursor);
    const result = await runCli(args, fixture.env);
    const inspected = outputOf(result);
    assert.equal(result.exitCode, 0, findingText(inspected));
    assert.equal(inspected.operation, 'inspect');
    assert.equal(inspected.status, 'pass');
    assert.ok(Buffer.byteLength(result.stdout, 'utf8') <= responseBudget,
      'each complete closeout response and newline fits the declared byte budget');
    assert.ok(result.stdout.endsWith('\n'), 'closeout inspect responses are newline terminated');
    const packet = packetOf(inspected);
    assert.ok(packet && Array.isArray(packet.entries));
    pages.push({ inspected, packet });
    cursor = packet.next_cursor;
    if (!cursor) {
      complete = true;
      break;
    }
    assert.ok(page < 31, 'closeout packet pagination remains bounded');
  }
  assert.equal(complete, true, 'closeout packet pagination reaches its terminal page within the safety bound');
  assert.ok(pages.length > 1, 'the bounded closeout packet exercises continuation pages');
  const firstPacket = pages[0].packet;
  assert.ok(firstPacket.counts?.total >= 5);
  const total = firstPacket.counts.total;
  assert.ok(pages.every(({ packet }) => packet.counts?.total === total),
    'continuation pages preserve the full closeout inventory count');
  const seen = new Set();
  for (const { packet } of pages) {
    for (const entry of packet.entries) {
      assert.equal(seen.has(entryRefKey(entry)), false,
        'continuation pages do not repeat entries from earlier pages');
      seen.add(entryRefKey(entry));
    }
  }
  const allRefs = new Set(seen);
  assert.ok([...allRefs].some((ref) => ref.includes(fixture.deltaRef.path)), 'delta root survives packet pagination');
  assert.ok([...allRefs].some((ref) => ref.includes(fixture.manifestRef.path)), 'manifest root survives packet pagination');
  assert.ok([...allRefs].some((ref) => ref.includes(fixture.prerequisiteIssue)), 'delivered prerequisite remains a packet root');
});

test('inspect retains native parent and paginated sub-Issue context without turning membership into dependency or delivery credit', async (t) => {
  const fixture = await makeCloseoutFixture(t);
  const pages = [];
  let cursor = null;
  let complete = false;
  for (let page = 0; page < 64; page += 1) {
    const args = [...closeoutArgs(fixture, 'inspect'), '--max-inline-bytes', '8192'];
    if (cursor) args.push('--cursor', cursor);
    const result = await runCli(args, fixture.env);
    const inspected = outputOf(result);
    assert.equal(result.exitCode, 0, findingText(inspected));
    assert.equal(inspected.status, 'pass');
    const packet = packetOf(inspected);
    assert.ok(packet && Array.isArray(packet.entries));
    pages.push({ inspected, packet });
    if (!packet.next_cursor) {
      complete = true;
      break;
    }
    cursor = packet.next_cursor;
    assert.ok(page < 63, 'native context packet pagination remains bounded');
  }
  assert.equal(complete, true, 'native context pagination reaches its terminal page within the safety bound');
  assert.ok(pages.length > 1, 'the bounded packet exercises more than one continuation page');
  const total = pages[0].packet.counts.total;
  assert.ok(total >= 8, 'parent, children, delivery, delta and manifest roots are all inventoried');
  assert.ok(pages.every(({ packet }) => packet.counts.total === total));
  const refs = new Set(pages.flatMap(({ packet }) => [...packetRefs(packet)]));
  for (const work of [fixture.work, fixture.prerequisiteIssue, 'example/consumer#1', 'example/consumer#82']) {
    assert.ok([...refs].some((ref) => ref.includes(work)), `${work} remains in the complete native context inventory`);
  }
  const inspectedText = JSON.stringify(pages.map(({ inspected }) => inspected));
  assert.doesNotMatch(inspectedText, /prerequisite-(?:unverified|undelivered).*82|delivery-(?:plan-uncovered|unsupported|review-missing).*82/i,
    'parent membership does not become an implicit prerequisite or delivery claim');

  const commands = await readLog(fixture.ghLog);
  const endpoints = commands.filter((args) => args[0] === 'api')
    .map((args) => args.find((value) => value.startsWith('repos/'))).filter(Boolean);
  const endpointPaths = endpoints.map((endpoint) => endpoint.split('?')[0]);
  assert.ok(endpointPaths.includes('repos/example/consumer/issues/90/parent'), 'the bound closeout parent is read explicitly');
  assert.ok(endpointPaths.includes('repos/example/consumer/issues/1/sub_issues'), 'the parent sub-Issue inventory is read');
  assert.ok(endpointPaths.includes('repos/example/consumer/issues/82'), 'the extra native child is read as packet context');
  assert.ok(endpointPaths.includes('repos/example/consumer/issues/82/comments'), 'the extra child comments are retained as packet context');
  const childrenCommand = commands.find((args) => args.some((value) => value.startsWith('repos/example/consumer/issues/1/sub_issues')));
  assert.ok(childrenCommand?.includes('--paginate') && childrenCommand?.includes('--slurp'),
    'the native child inventory is fully paginated');
});

test('an archived active-change path is assessed from the explicit fixed delta and candidate manifest, while candidate activation cannot replace destination policy', async (t) => {
  const fixture = await makeCloseoutFixture(t, { archive: true, candidateActivation: true });
  const result = await runCli(closeoutArgs(fixture), fixture.env);
  const checked = outputOf(result);

  assert.equal(result.exitCode, 0, findingText(checked));
  assert.equal(checked.status, 'pass');
  const synchronization = synchronizationOf(checked);
  assert.equal(synchronization.status, 'valid', JSON.stringify(synchronization));
  assert.equal(synchronization.context?.deltaRevision ?? synchronization.deltaRevision, fixture.baseRevision,
    'archived candidates reconstruct the accepted delta from the selected historical revision');
  const manifest = manifestOf(checked);
  assert.equal(manifest.valid, true, JSON.stringify(manifest));
  assert.match(JSON.stringify(checked), new RegExp(manifestArchivePath.replaceAll('/', '\\/')),
    'the selected archived manifest path remains visible in the closeout assessment');
  const policy = checked.policy ?? checked.context?.policy;
  assert.equal(policy?.mode, 'bootstrap', 'candidate-only activation is not destination authorization');
  assert.equal(policy?.activation ?? null, null);
  const tree = await git(fixture.root, ['ls-tree', '-r', '--name-only', fixture.candidateRevision]);
  assert.equal(tree.stdout.split('\n').includes(deltaPath), false, 'the candidate no longer contains the active change path');
});

test('an undelivered prerequisite prevents closeout even when the candidate synchronization is otherwise available', async (t) => {
  const fixture = await makeCloseoutFixture(t, { missingPrerequisite: true });
  const result = await runCli(closeoutArgs(fixture), fixture.env);
  const checked = outputOf(result);

  assert.notEqual(result.exitCode, 0);
  assert.notEqual(checked.status, 'pass');
  assert.match(findingText(checked), /prerequisite|dependency|record-unavailable|reference-unavailable|not-found/i);
});

test('closeout rejects omitted scenarios and undeclared native retirement instead of accepting a partial baseline', async (t) => {
  for (const syncVariant of ['scenario-loss', 'retirement']) {
    const fixture = await makeCloseoutFixture(t, { syncVariant });
    const result = await runCli(closeoutArgs(fixture), fixture.env);
    const checked = outputOf(result);

    assert.notEqual(result.exitCode, 0, `${syncVariant}: ${findingText(checked)}`);
    assert.notEqual(checked.status, 'pass');
    assert.match(findingText(checked), /synchronization|scenario|coverage|retirement|native/i, syncVariant);
  }
});

test('missing fixed delta or candidate manifest stays explicitly unavailable', async (t) => {
  const deltaFixture = await makeCloseoutFixture(t);
  const missingDelta = { ...deltaFixture.deltaRef, path: `${deltaFixture.deltaRef.path}.missing` };
  const deltaResult = await runCli(closeoutArgs(deltaFixture, 'check', { deltaRef: missingDelta }), deltaFixture.env);
  const deltaChecked = outputOf(deltaResult);
  assert.notEqual(deltaResult.exitCode, 0);
  assert.notEqual(deltaChecked.status, 'pass');
  assert.match(findingText(deltaChecked), /delta|path-missing|unavailable/i);

  const manifestFixture = await makeCloseoutFixture(t, { syncVariant: 'missing-manifest' });
  const manifestResult = await runCli(closeoutArgs(manifestFixture), manifestFixture.env);
  const manifestChecked = outputOf(manifestResult);
  assert.notEqual(manifestResult.exitCode, 0);
  assert.notEqual(manifestChecked.status, 'pass');
  assert.match(findingText(manifestChecked), /manifest|path-missing|unavailable/i);
});

test('manifest fixity drift invalidates closeout and cannot be replaced by the current closeout policy', async (t) => {
  const fixture = await makeCloseoutFixture(t, { fixityDrift: true });
  const result = await runCli(closeoutArgs(fixture), fixture.env);
  const checked = outputOf(result);

  assert.notEqual(result.exitCode, 0);
  assert.notEqual(checked.status, 'pass');
  assert.match(findingText(checked), /evidence-drift|fixity|manifest|source.*mismatch/i);
  assert.doesNotMatch(findingText(checked), /closeout_policy_ref.*substitut|policy.*replace.*historical/i);
});

test('closeout rejects a schema-valid empty manifest when the closeout Issue declares a delivered prerequisite', async (t) => {
  const fixture = await makeCloseoutFixture(t, { emptyManifestDeliveries: true });
  const rawManifest = JSON.parse(await readFile(path.join(fixture.root, fixture.candidateManifestPath), 'utf8'));
  assert.equal(validateRecord('manifest', rawManifest).valid, true, 'the empty manifest remains generically schema-valid');
  assert.deepEqual(rawManifest.deliveries, []);

  const result = await runCli(closeoutArgs(fixture), fixture.env);
  const checked = outputOf(result);
  const manifest = manifestOf(checked);
  const findingSummary = findingCodes(checked);

  assert.notEqual(result.exitCode, 0);
  assert.notEqual(checked.status, 'pass');
  assert.equal(synchronizationOf(checked).status, 'valid', 'the negative is isolated to manifest inventory coverage');
  assert.equal(manifest.valid, true,
    'the generic manifest schema/fixity check remains valid; closeout inventory coverage is a separate constraint');
  assert.match(findingSummary, /manifest.*(?:delivery|inventory|prerequisite)|(?:delivery|inventory).*manifest/i);
  assert.match(findingSummary, /example\/consumer#80/,
    'the declared prerequisite is the missing manifest delivery');
  assert.doesNotMatch(JSON.stringify(manifest), /example\/consumer#82/,
    'native parent membership child #82 is not an implicit manifest delivery requirement');
});

test('closeout rejects a prerequisite reviewer explicitly excluded by its recorded historical policy while the current candidate policy remains eligible', async (t) => {
  const fixture = await makeCloseoutFixture(t, { historicalReviewerExcluded: true });
  const result = await runCli(closeoutArgs(fixture), fixture.env);
  const checked = outputOf(result);
  const text = findingText(checked);

  assert.notEqual(result.exitCode, 0);
  assert.notEqual(checked.status, 'pass');
  assert.equal(manifestOf(checked).valid, true, 'the manifest source digest is consistent in this policy negative');
  assert.doesNotMatch(findingCodes(checked), /evidence-drift|fixity|source-summary-mismatch/i,
    'the failure must not be caused by manifest drift');
  assert.match(text, /prerequisite-review-invalid|review-model-excluded|historical.*policy/i);
  assert.match(findingCodes(checked), /review-kind-unresolved|review-model-excluded/,
    'the unresolved review role is retained while the shared exclusion is enforced');
  const currentPolicy = (checked.policies ?? []).find((policy) => policy.assessment?.pr === fixture.closeoutPull);
  assert.equal(currentPolicy?.status, 'available', 'the current closeout destination policy still reconstructs');
  assert.doesNotMatch(JSON.stringify(currentPolicy ?? {}), /review-model-excluded/i,
    'the candidate reviewer remains eligible under the current destination policy');
});

test('closeout rejects a wrong historical config digest even when the manifest fixity digest matches the altered Evidence source', async (t) => {
  const fixture = await makeCloseoutFixture(t, { historicalConfigDigestMismatch: true });
  const result = await runCli(closeoutArgs(fixture), fixture.env);
  const checked = outputOf(result);
  const text = findingText(checked);

  assert.notEqual(result.exitCode, 0);
  assert.notEqual(checked.status, 'pass');
  assert.equal(manifestOf(checked).valid, true, 'the manifest digest matches the altered source body');
  assert.doesNotMatch(findingCodes(checked), /evidence-drift|fixity|source-summary-mismatch/i,
    'a consistent manifest must not mask a historical policy mismatch');
  assert.match(text, /historical-policy-mismatch|config_digest|prerequisite-policy/i);
});

test('explicit delta and manifest selectors reject unrelated or historical candidate objects instead of guessing', async (t) => {
  const fixture = await makeCloseoutFixture(t);
  const wrongDelta = { ...fixture.deltaRef, path: `${openspecRoot}/changes/unrelated` };
  const wrongManifest = fixture.wrongManifestRef;
  const result = await runCli(closeoutArgs(fixture, 'check', { deltaRef: wrongDelta, manifestRef: wrongManifest }), fixture.env);
  const checked = outputOf(result);

  assert.notEqual(result.exitCode, 0);
  assert.notEqual(checked.status, 'pass');
  assert.match(findingText(checked), /delta|manifest|accepted|candidate|path-missing|unavailable/i);
  assert.doesNotMatch(findingText(checked), /status["']?\s*[:=]\s*["']pass["']/i);
});
