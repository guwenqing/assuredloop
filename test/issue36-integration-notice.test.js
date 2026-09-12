import assert from 'node:assert/strict';
import { execFile as execCallback } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { makeCloseoutFixture, bodyFor, git, readLog } from './fixtures/closeout-cli/helpers.mjs';
import { structuredBody } from '../src/trace.js';

const exec = promisify(execCallback);
const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const noticeCode = 'historical-integration-review-required';

async function fixture(t, { advanced = false, ownerOnly = false, mergeVariant } = {}) {
  const f = await makeCloseoutFixture(t);
  const scenario = JSON.parse(await readFile(f.env.FAKE_GH_SCENARIO, 'utf8'));
  const owner = scenario.records['issues/80'];
  const ownerRecord = await structuredBody(owner.body);
  ownerRecord.activity = 'plan';
  owner.body = bodyFor(ownerRecord, 'Continuous planning remains open after this scoped delivery.');
  owner.labels = [{ name: f.config.repository.labels.type['architecture-task'] }];
  owner.state = 'open'; owner.state_reason = null;
  const dependent = await structuredBody(scenario.records['issues/90'].body);
  dependent.depends_on = [f.prerequisitePull];
  scenario.records['issues/90'].body = bodyFor(dependent);
  const originalReview = JSON.parse(scenario.records['issues/comments/801'].body);
  assert.equal(originalReview.base_sha, f.baseRevision);
  let integrationParent = f.baseRevision;
  let merge = f.prerequisiteHead;
  if (advanced) {
    const baseTree = (await git(f.root, ['rev-parse', `${f.baseRevision}^{tree}`])).stdout.trim();
    integrationParent = (await git(f.root, ['commit-tree', baseTree, '-p', f.baseRevision, '-m', 'Independent test: destination advances before integration'])).stdout.trim();
    const reviewedTree = (await git(f.root, ['rev-parse', `${f.prerequisiteHead}^{tree}`])).stdout.trim();
    merge = (await git(f.root, ['commit-tree', reviewedTree, '-p', integrationParent, '-m', 'Independent test: integrate the reviewed contribution'])).stdout.trim();
    assert.notEqual(integrationParent, originalReview.base_sha);
  }
  assert.equal((await git(f.root, ['rev-parse', `${merge}^`])).stdout.trim(), integrationParent);
  scenario.records['pulls/81'].merge_commit_sha = mergeVariant === 'missing' ? null : mergeVariant === 'malformed' ? 'not-a-commit-sha' : merge;
  if (ownerOnly) scenario.records['issues/81/comments'] = [[]];
  await writeFile(f.env.FAKE_GH_SCENARIO, JSON.stringify(scenario));
  return { ...f, integrationParent, merge, originalReview, ownerOnly };
}

async function check(f) {
  const args = [cli, 'check', '--target', f.root, '--work', f.work, '--delta-ref', JSON.stringify(f.deltaRef), '--manifest-ref', JSON.stringify(f.manifestRef)];
  let raw;
  try { raw = { ...await exec(process.execPath, args, { env: f.env, maxBuffer: 16 * 1024 * 1024 }), exit: 0 }; }
  catch (error) { raw = { stdout: error.stdout ?? '', stderr: error.stderr ?? '', exit: error.code }; }
  assert.ok(raw.stdout.trim(), `Actual CLI returned no JSON: ${raw.stderr}`);
  const value = JSON.parse(raw.stdout);
  assert.equal((await git(f.root, ['status', '--porcelain'])).stdout, f.statusBefore, 'check preserves consumer checkout');
  assert.ok((await readLog(f.ghLog)).every((args) => !args.includes('--method') || args[args.indexOf('--method') + 1] === 'GET'));
  return { ...raw, value };
}

for (const ownerOnly of [false, true]) {
  test(`issue36 R1: advanced integration parent remains pass with contextual notice (${ownerOnly ? 'owner-only review' : 'PR review'})`, async (t) => {
    const f = await fixture(t, { advanced: true, ownerOnly });
    const checked = await check(f);
    assert.equal(checked.exit, 0, checked.stdout);
    assert.equal(checked.value.status, 'pass', checked.stdout);
    const notices = checked.value.findings.filter((finding) => finding.code === noticeCode);
    assert.ok(notices.length, `Successful historical verification lost the advanced integration notice: ${checked.stdout}`);
    const matching = notices.find((notice) => {
      const value = JSON.stringify(notice);
      return value.includes(f.prerequisitePull) && value.includes('801') && value.includes(f.originalReview.base_sha) && value.includes(f.integrationParent) && value.includes(f.merge);
    });
    assert.ok(matching, `Notice must associate PR, review source, unchanged recorded base, actual integration parent and merge: ${JSON.stringify(notices)}`);
    assert.equal(matching.severity, 'review', 'an ordinary base advance retains a semantic review obligation');
    const retainedSource = JSON.parse(await readFile(f.env.FAKE_GH_SCENARIO, 'utf8')).records['issues/comments/801'];
    assert.equal(JSON.parse(retainedSource.body).base_sha, f.originalReview.base_sha, 'do not rewrite original review to match actual integration');
  });
}

test('issue36 R1: unchanged integration parent passes without a false advanced-parent notice', async (t) => {
  const f = await fixture(t);
  const checked = await check(f);
  assert.equal(checked.exit, 0, checked.stdout);
  assert.equal(checked.value.status, 'pass', checked.stdout);
  assert.equal(checked.stdout.includes(noticeCode), false);
});

for (const mergeVariant of ['missing', 'malformed']) {
  test(`issue36 R1: ${mergeVariant} actual merge remains a failure`, async (t) => {
    const checked = await check(await fixture(t, { mergeVariant }));
    assert.notEqual(checked.exit, 0, checked.stdout);
    assert.notEqual(checked.value.status, 'pass', checked.stdout);
  });
}
