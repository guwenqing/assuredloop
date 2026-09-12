import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import { makeBootstrapLiveFixture } from './fixtures/issue36-bootstrap/live.mjs';
import { readLog } from './fixtures/trace-cli/helpers.mjs';

const execFile = promisify(execFileCallback);
const cli = new URL('../src/cli.js', import.meta.url).pathname;
async function check(f) {
  try {
    const result = await execFile(process.execPath, [cli, 'check', '--target', f.root, '--work', 'example/consumer#43'],
      { env: f.env, maxBuffer: 16 * 1024 * 1024 });
    return { exit: 0, result: JSON.parse(result.stdout), stderr: result.stderr };
  } catch (error) {
    assert.ok(error.stdout, `Live check had no JSON response: ${error.stderr || error.message}`);
    return { exit: error.code, result: JSON.parse(error.stdout), stderr: error.stderr };
  }
}

for (const ownerOnly of [false, true]) {
  test(`live current PR verifies initial bootstrap prerequisite with tag ${ownerOnly ? 'only on canonical owner' : 'on original PR'}`, async (t) => {
    const f = await makeBootstrapLiveFixture(t, { ownerOnly });
    const checked = await check(f);
    assert.equal(checked.exit, 0, JSON.stringify(checked.result.findings));
    assert.equal(checked.result.status, 'pass', JSON.stringify(checked.result));
    assert.equal(checked.stderr, '');
    assert.ok(checked.result.records.some((record) => JSON.stringify(record.context?.prerequisites).includes('initial-bootstrap-verification')),
      'live prerequisite assessment must retain its typed original source');
    assert.match(JSON.stringify(checked.result.records), /initial-bootstrap-semantic-review-required/);
    assert.equal(checked.result.policy.assessment.head, f.currentHead);
    assert.equal(checked.result.policy.assessment.base_sha, f.currentBase);
    const log = await readLog(f.ghLog);
    for (const id of [100, 403, 404]) {
      assert.ok(log.some((args) => args.includes(`repos/example/consumer/issues/comments/${id}`)), `original comment ${id} not acquired`);
    }
    assert.equal(f.store.records['issues/2'].state, 'open');
    assert.equal(f.store.records['issues/4'].state_reason, undefined);
  });
}

test('live bootstrap prerequisite source drift fails under the unchanged current review and policy', async (t) => {
  const f = await makeBootstrapLiveFixture(t, { ownerOnly: true });
  f.store.records['issues/comments/403'].body += '\r\nOriginal review source changed.';
  await f.save();
  const checked = await check(f);
  assert.notEqual(checked.exit, 0);
  assert.notEqual(checked.result.status, 'pass');
  assert.match(JSON.stringify(checked.result), /evidence-drift/,
    'failure must come from original source fixity, not fixture setup or invented historical policy');
});
