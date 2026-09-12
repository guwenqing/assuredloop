import assert from 'node:assert/strict';
import { execFile as execCallback } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { makeCloseoutFixture, bodyFor, readLog, git } from './fixtures/closeout-cli/helpers.mjs';
import { structuredBody, createTrace } from '../src/trace.js';
const exec = promisify(execCallback);
const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
async function prepare(t, mutate = () => {}) {
  const f = await makeCloseoutFixture(t);
  const scenario = JSON.parse(await readFile(f.env.FAKE_GH_SCENARIO, 'utf8'));
  const owner = scenario.records['issues/80'];
  owner.state = 'open'; owner.state_reason = null;
  owner.labels = [{ name: f.config.repository.labels.type['architecture-task'] }];
  const ownerRecord = await structuredBody(owner.body);
  ownerRecord.activity = 'plan';
  owner.body = bodyFor(ownerRecord, 'Continuous planning remains open for further assigned planning. This PR is its accepted delivered contribution.');
  const record = await structuredBody(scenario.records['issues/90'].body);
  record.depends_on = [f.prerequisitePull];
  scenario.records['issues/90'].body = bodyFor(record);
  await mutate({ f, scenario, record });
  await writeFile(f.env.FAKE_GH_SCENARIO, JSON.stringify(scenario));
  return f;
}
async function check(f) {
  let raw;
  try { raw = { ...await exec(process.execPath, [cli, 'check', '--target', f.root, '--work', f.work, '--delta-ref', JSON.stringify(f.deltaRef), '--manifest-ref', JSON.stringify(f.manifestRef)], { env: f.env, maxBuffer: 16 * 1024 * 1024 }), exit: 0 }; }
  catch (error) { raw = { stdout: error.stdout, stderr: error.stderr, exit: error.code }; }
  assert.ok(raw.stdout?.trim(), `CLI output missing: ${raw.stderr}`);
  return { ...raw, value: JSON.parse(raw.stdout) };
}

test('issue36 delivery: CLI checks actual merged PR prerequisite and matches manifest prs while umbrella stays open', async (t) => {
  const f = await prepare(t);
  const result = await check(f);
  const manifest = JSON.parse(await readFile(`${f.root}/${f.candidateManifestPath}`, 'utf8'));
  assert.ok(manifest.deliveries.some((row) => row.prs.includes(f.prerequisitePull)));
  assert.ok(manifest.deliveries.every((row) => !row.issues.includes(f.prerequisitePull)), 'never put a PR into issues to make inventory pass');
  assert.equal(result.exit, 0, JSON.stringify(result.value.findings));
  assert.equal(result.value.status, 'pass');
  assert.equal(result.value.manifest.valid, true);
  assert.equal((await git(f.root, ['status', '--porcelain'])).stdout, f.statusBefore);
  const calls = await readLog(f.ghLog);
  assert.ok(calls.some((args) => args.includes('repos/example/consumer/pulls/81')), 'actual PR metadata was acquired');
  assert.ok(calls.every((args) => !args.includes('--method') || args[args.indexOf('--method') + 1] === 'GET'));
});

test('issue36 delivery: CLI whole Issue prerequisite cannot be replaced with one PR contribution', async (t) => {
  const f = await prepare(t, ({ f, scenario, record }) => {
    record.depends_on = [f.prerequisiteIssue]; scenario.records['issues/90'].body = bodyFor(record);
  });
  const result = await check(f);
  assert.notEqual(result.value.status, 'pass');
  assert.match(JSON.stringify(result.value.findings), /prerequisite-undelivered/);
});

for (const variant of ['unmerged', 'stale-reviewed-head', 'wrong-actual-merge', 'missing-review', 'forbidden-reference']) {
  test(`issue36 delivery: CLI contribution rejects ${variant}`, async (t) => {
    const f = await prepare(t, async ({ scenario }) => {
      const pull = scenario.records['pulls/81'];
      if (variant === 'unmerged') { pull.merged = false; pull.merged_at = null; pull.merge_commit_sha = null; }
      if (variant === 'stale-reviewed-head') pull.head.sha = 'f'.repeat(40);
      if (variant === 'wrong-actual-merge') pull.merge_commit_sha = 'f'.repeat(40);
      if (variant === 'missing-review') { scenario.records['issues/81/comments'] = [[]]; scenario.records['issues/80/comments'] = [[]]; }
      if (variant === 'forbidden-reference') {
        const pr = await structuredBody(pull.body);
        pr.basis.push({ repository: 'forbidden/consumer', revision: 'f'.repeat(40), path: 'private.md' });
        pull.body = bodyFor(pr); scenario.records['issues/81'].body = pull.body;
      }
    });
    const result = await check(f);
    assert.notEqual(result.value.status, 'pass', JSON.stringify(result.value));
    if (variant === 'forbidden-reference') {
      assert.match(JSON.stringify(result.value.findings), /reference-out-of-scope/);
      assert.ok((await readLog(f.ghLog)).every((args) => args.every((arg) => !arg.startsWith('repos/forbidden/'))), 'forbidden reference is refused before external read');
    }
  });
}

test('issue36 delivery: cached forbidden PR and reference never bypass acquisition scope', async (t) => {
  const f = await prepare(t);
  const saved = { ...process.env };
  Object.assign(process.env, f.env);
  try {
    const trace = await createTrace({ targetRoot: f.root, work: f.work });
    const forbiddenPr = 'forbidden/consumer#81';
    const forbiddenRef = { repository: 'forbidden/consumer', revision: 'f'.repeat(40), path: 'private.md' };
    for (const ref of [forbiddenPr, forbiddenRef]) {
      trace.cacheSource(ref, { content: 'Cached content must not grant acquisition authority.', references: [] });
      await assert.rejects(() => trace.load(ref), (error) => error.code === 'reference-out-of-scope');
    }
    await assert.rejects(() => trace.bundleAt(forbiddenPr), (error) => error.code === 'reference-out-of-scope');
    assert.ok((await readLog(f.ghLog)).every((args) => args.every((arg) => !arg.startsWith('repos/forbidden/'))));
  } finally {
    for (const name of Object.keys(process.env)) if (!(name in saved)) delete process.env[name];
    Object.assign(process.env, saved);
  }
});
