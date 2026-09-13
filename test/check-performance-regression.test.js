import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

import { makeTraceFixture, readLog, readScenario, writeScenario } from './fixtures/trace-freshness/helpers.mjs';

const execFile = promisify(execFileCallback);
const traceModule = new URL('../src/trace.js', import.meta.url).href;
const cliPath = new URL('../src/cli.js', import.meta.url).pathname;

async function runTrace(fixture, body) {
  const { stdout } = await execFile(process.execPath, ['--input-type=module', '-e', `
    import { createTrace } from ${JSON.stringify(traceModule)};
    import { readFile, writeFile } from 'node:fs/promises';
    const targetRoot = ${JSON.stringify(fixture.root)};
    const work = 'example/consumer#43';
    const ref = { repository: 'example/consumer', comment_id: 100 };
    const commands = async () => (await readFile(process.env.FAKE_GH_LOG, 'utf8'))
      .trim().split('\\n').filter(Boolean).map(JSON.parse);
    const trace = await createTrace({ targetRoot, work });
    ${body}
  `], { env: fixture.env, maxBuffer: 4 * 1024 * 1024 });
  return JSON.parse(stdout);
}

test('repeated same-PR source loads reuse acquisition as well as source bytes', async (t) => {
  const fixture = await makeTraceFixture(t);
  const result = await runTrace(fixture, `
    const first = await trace.loadForWork(ref, { work });
    const before = (await commands()).length;
    const repeated = [];
    for (let i = 0; i < 5; i++) repeated.push(await trace.loadForWork(ref, { work }));
    console.log(JSON.stringify({ first, repeated, added: (await commands()).slice(before) }));
  `);
  assert.ok(result.first.content, 'the initial source was actually acquired');
  for (const repeated of result.repeated) assert.deepEqual(repeated, result.first);
  assert.deepEqual(result.added, [],
    'already observed same-PR scope and source must not repeat gh acquisition before final freshness');
});

test('warm source cache does not replace final mutable-comment freshness acquisition', async (t) => {
  const fixture = await makeTraceFixture(t);
  const result = await runTrace(fixture, `
    await trace.loadForWork(ref, { work });
    const scenario = JSON.parse(await readFile(process.env.FAKE_GH_SCENARIO, 'utf8'));
    scenario.records['issues/comments/100'].body += '\\nChanged after acquisition';
    await writeFile(process.env.FAKE_GH_SCENARIO, JSON.stringify(scenario));
    const before = (await commands()).length;
    const findings = await trace.recheckWorkSources();
    console.log(JSON.stringify({ findings, added: (await commands()).slice(before) }));
  `);
  assert.ok(result.findings.some((finding) => finding.code === 'context-source-stale'));
  assert.ok(result.added.some((args) => args.includes('repos/example/consumer/issues/comments/100')),
    'final freshness must physically reacquire the mutable comment');
});

test('a fresh trace in the same process reacquires changed source bytes', async (t) => {
  const fixture = await makeTraceFixture(t);
  const result = await runTrace(fixture, `
    const first = await trace.loadForWork(ref, { work });
    const scenario = JSON.parse(await readFile(process.env.FAKE_GH_SCENARIO, 'utf8'));
    scenario.records['issues/comments/100'].body += '\\nNext operation content';
    await writeFile(process.env.FAKE_GH_SCENARIO, JSON.stringify(scenario));
    const next = await createTrace({ targetRoot, work });
    const second = await next.loadForWork(ref, { work });
    console.log(JSON.stringify({ first, second }));
  `);
  assert.notEqual(result.second.content, result.first.content);
  assert.match(result.second.content, /Next operation content/);
});

test('check does not reacquire one PR destination for every distinct Evidence record', async (t) => {
  const fixture = await makeTraceFixture(t);
  async function check() {
    const before = (await readLog(fixture.ghLog)).length;
    let stdout;
    try {
      ({ stdout } = await execFile(process.execPath,
        [cliPath, 'check', '--target', fixture.root, '--work', 'example/consumer#43'],
        { env: fixture.env, maxBuffer: 16 * 1024 * 1024 }));
    } catch (error) {
      assert.ok(error.stdout, `expected a diagnostic report, got ${error.stderr}`);
      stdout = error.stdout;
    }
    const report = JSON.parse(stdout);
    assert.equal(report.operation, 'check');
    assert.ok(report.policies.some((policy) => policy.status === 'available'),
      'the fixture must exercise real policy resolution, not an early setup failure');
    const requests = (await readLog(fixture.ghLog)).slice(before);
    return { report, destinationReads: requests.filter((args) =>
      args.includes('repos/example/consumer/pulls/43') ||
      args.includes('repos/example/consumer/git/ref/heads/main')).length };
  }
  const baseline = await check();
  const scenario = await readScenario(fixture);
  for (let i = 0; i < 5; i++) {
    const record = { ...fixture.evidence, scope: `Independent assessment ${i}`,
      reviewer_session: `additional-session-${i}` };
    if (i === 4) record.reviewer_model = 'gpt-5.6-luna';
    const comment = { id: 200 + i, body: JSON.stringify(record) };
    scenario.records['issues/43/comments'][0].push(comment);
    scenario.records[`issues/comments/${comment.id}`] = comment;
  }
  await writeScenario(fixture, scenario);
  const expanded = await check();
  assert.equal(expanded.report.context.evidence.length, baseline.report.context.evidence.length + 5,
    'distinct records remain in the complete diagnostic report');
  assert.match(JSON.stringify(expanded.report.findings), /excluded|not.allowed|ineligible/i,
    'a cached policy must still assess the different excluded reviewer declaration');
  assert.equal(expanded.destinationReads, baseline.destinationReads,
    'extra Evidence with the same PR/base/policy must not increase PR or branch acquisition reads');
});

test('inspect shares the same operation cache and retains a separate final observation', async (t) => {
  const fixture = await makeTraceFixture(t);
  let stdout;
  try {
    ({ stdout } = await execFile(process.execPath,
      ['--input-type=module', '-e', `
        import { inspectWork } from ${JSON.stringify(traceModule)};
        console.log(JSON.stringify(await inspectWork({ targetRoot: ${JSON.stringify(fixture.root)},
          work: 'example/consumer#43', maxInlineBytes: 1048576, runtime: { mode: 'linked-development' } })));
      `],
      { env: fixture.env, maxBuffer: 2 * 1024 * 1024 }));
  } catch (error) { stdout = error.stdout; }
  const report = JSON.parse(stdout);
  assert.equal(report.status, 'pass', JSON.stringify(report.findings));
  assert.ok(report.packet, 'the complete inspection must run, not stop at setup');
  const requests = await readLog(fixture.ghLog);
  for (const endpoint of ['pulls/43', 'git/ref/heads/main']) {
    assert.equal(requests.filter(args => args.includes(`repos/example/consumer/${endpoint}`)).length, 2,
      `${endpoint} should be read once during acquisition and once at final freshness`);
  }
});
