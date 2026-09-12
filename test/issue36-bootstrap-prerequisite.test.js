import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import test from 'node:test';
import { checkWorkRecords } from '../src/work-records.js';
import { verifyInitialBootstrap } from '../src/initial-bootstrap.js';
import { categoryMapping, evidenceRecord } from './fixtures/work-records/helpers.mjs';
import { makeTraceEvidenceFixture } from './fixtures/execution-evidence-review/helpers.mjs';
import { repository, ref, verificationRecord, wrap } from './fixtures/issue36-bootstrap/records.mjs';
import { scenario, commentKey } from './fixtures/issue36-bootstrap/scenario.mjs';

const execFile = promisify(execFileCallback);
const describe = (result) => JSON.stringify(result.findings);

function prerequisiteFixture() {
  const f = scenario();
  const ownerWork = `${repository}#2`, dependentWork = `${repository}#8`;
  const basis = ref('e'.repeat(40), 'openspec/changes/first-bootstrap/proposal.md');
  const plan = { ...ref('e'.repeat(40), 'openspec/changes/first-bootstrap/tasks.md'), items: ['1.1', '1.2'] };
  const owner = { issue: { number: 2, state: 'open', state_reason: null,
    repository_url: `https://api.github.com/repos/${repository}`, labels: [{ name: 'type:architecture-task' }],
    body: wrap({ activity: 'plan', request: `${repository}#1`, change: 'first-bootstrap',
      basis: [basis], plan_items: [{ ...plan, items: ['1.1', '1.2', '1.3'] }] }) } };
  f.pull.body = wrap({ issues: [ownerWork], change: 'first-bootstrap', basis: [basis], plan_items: [plan] });
  const entry = { ref: { repository, comment_id: 405 }, record: f.verification,
    body: f.comments.get(commentKey(f.laterSource)).body };
  const contribution = { issue: { number: 4, state: 'closed', body: f.pull.body,
    repository_url: `https://api.github.com/repos/${repository}`,
    pull_request: { url: `https://api.github.com/repos/${repository}/pulls/4` } },
    pulls: [f.pull], evidence: [entry] };
  const verificationCalls = [];
  const input = { work: dependentWork,
    issue: { number: 8, state: 'open', labels: [{ name: 'type:task' }],
      repository_url: `https://api.github.com/repos/${repository}`,
      body: wrap({ activity: 'deliver', request: `${repository}#1`, basis: [basis], depends_on: [f.verification.pr] }) },
    categoryMapping,
    async resolveWork(work) {
      if (work === ownerWork) return structuredClone(owner);
      if (work === f.verification.pr) return structuredClone(contribution);
      throw Object.assign(new Error(`Unknown fixture work ${work}`), { code: 'record-unavailable' });
    },
    async resolveRef(source) {
      return { content: source.path.endsWith('tasks.md')
        ? `## 1. Initial bootstrap\nWork Issue: [#2](https://github.com/${repository}/issues/2)\n\n- [x] 1.1 Accept fixed policy.\n- [x] 1.2 Deliver first bootstrap.\n- [ ] 1.3 Remaining planning contribution.\n`
        : '# First bootstrap accepted Proposal\n' };
    },
    async verifyBootstrap(value) {
      verificationCalls.push(structuredClone(value));
      return verifyInitialBootstrap({ adapter: f.adapter, record: value.record, verificationPolicy: f.verificationPolicy });
    },
  };
  return { ...f, input, owner, contribution, entry, verificationCalls };
}

test('tagged first bootstrap qualifies as a PR prerequisite only through real source-backed callback verification', async () => {
  const f = prerequisiteFixture();
  const result = await checkWorkRecords(f.input);
  assert.equal(result.status, 'valid', describe(result));
  assert.equal(f.verificationCalls.length, 1, 'verify callback must survive Issue→PR→owner recursion');
  assert.deepEqual(f.verificationCalls[0].record, f.verification);
  assert.ok(f.calls.some((call) => call.method === 'readCommit'));
  assert.ok(f.calls.some((call) => call.method === 'readComment' && call.value.comment_id === 401));
  assert.match(JSON.stringify(result.context.prerequisites), /1\.3/);
  assert.equal(f.owner.issue.state, 'open');
  assert.equal(f.contribution.issue.state_reason, undefined);
});

for (const mode of ['missing callback', 'missing tag', 'false verification', 'unavailable verification',
  'mixed tag', 'wrong head', 'unmerged delivery', 'original source drift', 'current policy unavailable']) {
  test(`tagged bootstrap PR prerequisite rejects ${mode}`, async () => {
    const f = prerequisiteFixture();
    if (mode === 'missing callback') delete f.input.verifyBootstrap;
    if (mode === 'missing tag') f.contribution.evidence = [];
    if (mode === 'false verification') f.input.verifyBootstrap = async () => ({ valid: false, findings: [{ code: 'synthetic-verification-invalid', message: 'Not eligible.' }] });
    if (mode === 'unavailable verification') f.input.verifyBootstrap = async () => { throw Object.assign(new Error('Original sources inaccessible'), { code: 'record-unavailable' }); };
    if (mode === 'mixed tag') f.verification.policy_ref = f.verification.verification_policy_ref;
    if (mode === 'wrong head') f.verification.head = '7'.repeat(40);
    if (mode === 'unmerged delivery') f.pull.merged = false;
    if (mode === 'original source drift') f.comments.get(commentKey(f.verification.sources[0].source)).body += '\nchanged approval';
    if (mode === 'current policy unavailable') f.verificationPolicy.status = 'unavailable';
    const result = await checkWorkRecords(f.input);
    assert.notEqual(result.status, 'valid', describe(result));
  });
}

test('a callback cannot make a tag for an unrelated PR satisfy this contribution', async () => {
  const f = prerequisiteFixture();
  f.verification.pr = `${repository}#99`;
  // Keep the dependency resolver focused on the originally assigned PR.
  const original = f.input.resolveWork;
  f.input.resolveWork = async (work) => work === `${repository}#4` ? structuredClone(f.contribution) : original(work);
  f.input.verifyBootstrap = async () => ({ valid: true, findings: [] });
  assert.notEqual((await checkWorkRecords(f.input)).status, 'valid');
});

test('ordinary PR Evidence retains its path without invoking bootstrap verification', async () => {
  const f = prerequisiteFixture();
  f.contribution.evidence = [{ ref: f.entry.ref, record: evidenceRecord({ pr: f.verification.pr,
    head: f.pull.head.sha, baseSha: f.verification.base_sha, baseRef: f.pull.base.ref }) }];
  f.input.verifyBootstrap = async () => { throw new Error('Ordinary Evidence must not enter bootstrap verification'); };
  const result = await checkWorkRecords(f.input);
  assert.equal(result.status, 'valid', describe(result));
});

test('trace discovers tagged sources on an owning Issue and preserves them in its PR contribution bundle', async (t) => {
  const f = await makeTraceEvidenceFixture(t);
  const store = JSON.parse(await readFile(f.env.FAKE_GH_SCENARIO, 'utf8'));
  const record = verificationRecord();
  record.pr = 'example/consumer#43';
  const body = wrap(record);
  // Only the Issue contains the tag. No timeline or ordinary Evidence points
  // at this PR, so discovery must use the new tag rather than a neighboring link.
  store.records['issues/42/comments'] = [[{ id: 777, body }]];
  store.records['issues/42/timeline'] = [];
  store.records['issues/43/comments'] = [[{ id: 777, body }]];
  store.records['issues/comments/777'] = { id: 777, body };
  await writeFile(f.env.FAKE_GH_SCENARIO, JSON.stringify(store));
  const source = `import { createTrace } from ${JSON.stringify(new URL('../src/trace.js', import.meta.url).href)};
    const trace = await createTrace({targetRoot:process.argv[1],work:'example/consumer#42'});
    const owner = await trace.bundleAt('example/consumer#42');
    const contribution = await trace.bundleAt('example/consumer#43');
    console.log(JSON.stringify({owner,contribution}));`;
  const executed = await execFile(process.execPath, ['--input-type=module', '-e', source, f.root], {
    env: f.env, maxBuffer: 16 * 1024 * 1024,
  });
  const result = JSON.parse(executed.stdout);
  assert.ok(result.owner.pulls.some((pull) => pull.number === 43), 'tagged Issue source must discover its original PR');
  for (const bundle of [result.owner, result.contribution]) {
    const entry = bundle.evidence.find((item) => item.ref.comment_id === 777);
    assert.ok(entry, 'tagged source must survive trace evidence filtering');
    assert.deepEqual(entry.record, record);
    assert.equal(entry.body, body);
  }
});
