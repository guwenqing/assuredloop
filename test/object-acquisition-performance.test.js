import assert from 'node:assert/strict';
import { execFile as callbackExecFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, copyFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { makeTraceFixture, readScenario, writeScenario } from './fixtures/trace-freshness/helpers.mjs';

const execFile = promisify(callbackExecFile);
const adapterModule = new URL('../src/read-adapter.js', import.meta.url).href;
const traceModule = new URL('../src/trace.js', import.meta.url).href;
const repository = 'example/consumer';
const api = 'https://api.github.com/repos/example/consumer';
const issue = (number) => ({ number, id: number, title: `Work ${number}`, body: 'Current requirement',
  repository_url: api, url: `${api}/issues/${number}`, state: 'closed', state_reason: 'completed',
  labels: [{ name: 'type:task' }], comments: 1 });
const comment = { id: 901, body: 'Original review', issue_url: `${api}/issues/61` };

async function fixture(t) {
  const f = await makeTraceFixture(t);
  const scenario = await readScenario(f);
  Object.assign(scenario.records, {
    'issues/61': issue(61), 'issues/62': issue(62),
    'issues/60/sub_issues': [[issue(61), issue(62)]],
    'issues/61/timeline': [[{ ...comment, event: 'commented' }]],
    'issues/61/comments': [[comment]], 'issues/comments/901': comment,
  });
  await writeScenario(f, scenario);
  return f;
}

async function run(f, action) {
  const { stdout } = await execFile(process.execPath, ['--input-type=module', '-e', `
    import { createReadAdapter } from ${JSON.stringify(adapterModule)};
    import { readFile, writeFile } from 'node:fs/promises';
    const adapter = await createReadAdapter({ targetRoot: ${JSON.stringify(f.root)}, repository: '${repository}', cacheReads: true });
    const requests = async () => (await readFile(process.env.FAKE_GH_LOG, 'utf8')).trim().split('\\n').map(JSON.parse).filter(x => x[0] === 'api').map(x => x[1]);
    ${action}
  `], { env: f.env, maxBuffer: 4 * 1024 * 1024 });
  return JSON.parse(stdout);
}

test('complete sub-issue objects satisfy later individual reads without another endpoint', async (t) => {
  const f = await fixture(t);
  const result = await run(f, `
    await adapter.listChildren('${repository}#60');
    const first = await adapter.readIssue('${repository}#61');
    first.body = 'Caller mutation';
    const again = await adapter.readIssue('${repository}#61');
    const second = await adapter.readIssue('${repository}#62');
    console.log(JSON.stringify({ again, second, requests: await requests() }));
  `);
  assert.equal(result.again.body, 'Current requirement');
  assert.equal(result.second.number, 62);
  assert.equal(result.requests.filter(x => /\/issues\/(61|62)$/.test(x)).length, 0);
});

test('complete timeline comments satisfy list and individual comment reads', async (t) => {
  const f = await fixture(t);
  const result = await run(f, `
    await adapter.readIssue('${repository}#61');
    await adapter.listTimeline('${repository}#61');
    const comments = await adapter.listComments('${repository}#61');
    const one = await adapter.readComment({ repository: '${repository}', comment_id: 901 });
    console.log(JSON.stringify({ comments, one, requests: await requests() }));
  `);
  assert.equal(result.comments.length, 1);
  assert.equal(result.one.body, comment.body);
  assert.equal(result.requests.filter(x => /\/comments(?:\?|\/)/.test(x)).length, 0);
});

test('a timeline source carries the Issue view of a PR without a duplicate Issue read', async (t) => {
  const f = await fixture(t);
  const scenario = await readScenario(f);
  const source = { ...issue(62), pull_request: { url: `${api}/pulls/62` } };
  scenario.records['issues/61/timeline'][0].push({ event: 'cross-referenced', source: { issue: source } });
  scenario.records['issues/62'] = source;
  await writeScenario(f, scenario);
  const result = await run(f, `
    await adapter.readIssue('${repository}#61');
    await adapter.listTimeline('${repository}#61');
    const source = await adapter.readIssue('${repository}#62');
    const findings = await adapter.recheck(await adapter.fresh());
    console.log(JSON.stringify({ source, findings, requests: await requests() }));
  `);
  assert.equal(result.source.body, source.body);
  assert.deepEqual(result.findings, []);
  assert.equal(result.requests.filter(x => x.endsWith('issues/62')).length, 0);
});

test('partial timeline cannot silently replace a complete comment inventory', async (t) => {
  const f = await fixture(t);
  const scenario = await readScenario(f);
  scenario.records['issues/61'].comments = 2;
  scenario.records['issues/61/comments'][0].push({ ...comment, id: 902, body: 'Another review' });
  await writeScenario(f, scenario);
  const result = await run(f, `
    await adapter.readIssue('${repository}#61');
    await adapter.listTimeline('${repository}#61');
    const comments = await adapter.listComments('${repository}#61');
    console.log(JSON.stringify({ comments, requests: await requests() }));
  `);
  assert.equal(result.comments.length, 2);
  assert.ok(result.requests.some(x => x.includes('issues/61/comments?')));
});

test('final verification reuses a fresh parent inventory but catches changed child content', async (t) => {
  const f = await fixture(t);
  const result = await run(f, `
    await adapter.listChildren('${repository}#60');
    await adapter.readIssue('${repository}#61');
    const scenario = JSON.parse(await readFile(process.env.FAKE_GH_SCENARIO, 'utf8'));
    scenario.records['issues/60/sub_issues'][0][0].body = 'Changed requirement';
    scenario.records['issues/61'].body = 'Changed requirement';
    await writeFile(process.env.FAKE_GH_SCENARIO, JSON.stringify(scenario));
    const findings = await adapter.recheck(await adapter.fresh());
    console.log(JSON.stringify({ findings, requests: await requests() }));
  `);
  assert.ok(result.findings.some(x => x.code === 'context-source-stale'));
  assert.equal(result.requests.filter(x => x.endsWith('issues/61')).length, 0);
  assert.equal(result.requests.filter(x => x.includes('issues/60/sub_issues?')).length, 2);
});

test('final timeline refresh detects an edited comment without separately refetching its body', async (t) => {
  const f = await fixture(t);
  const result = await run(f, `
    await adapter.readIssue('${repository}#61');
    await adapter.listTimeline('${repository}#61');
    await adapter.listComments('${repository}#61');
    await adapter.readComment({ repository: '${repository}', comment_id: 901 });
    const scenario = JSON.parse(await readFile(process.env.FAKE_GH_SCENARIO, 'utf8'));
    scenario.records['issues/61/timeline'][0][0].body = 'Edited review';
    scenario.records['issues/61/comments'][0][0].body = 'Edited review';
    scenario.records['issues/comments/901'].body = 'Edited review';
    await writeFile(process.env.FAKE_GH_SCENARIO, JSON.stringify(scenario));
    const findings = await adapter.recheck(await adapter.fresh());
    console.log(JSON.stringify({ findings, requests: await requests() }));
  `);
  assert.ok(result.findings.some(x => x.code === 'context-source-stale'));
  assert.equal(result.requests.filter(x => /\/comments(?:\?|\/)/.test(x)).length, 0);
});

test('a fixed recursive inventory supplies file entries without per-file tree subprocesses', async (t) => {
  const f = await fixture(t);
  const bin = f.env.PATH.split(path.delimiter)[0];
  await copyFile(new URL('./fixtures/read-adapter/git-shim.mjs', import.meta.url), path.join(bin, 'git'));
  await chmod(path.join(bin, 'git'), 0o755);
  f.env.GIT_SHIM_LOG = path.join(f.root, 'git-read.log');
  f.env.REAL_GIT = (await execFile('which', ['git'])).stdout.trim();
  const result = await run(f, `
    const ref = { repository: '${repository}', revision: '${f.revision}', path: '.' };
    const files = await adapter.listFiles(ref);
    const before = (await readFile(process.env.GIT_SHIM_LOG, 'utf8')).trim().split('\\n').length;
    const selected = files.filter(x => x.type === 'blob').slice(0, 8);
    const contents = [];
    for (const file of selected) contents.push((await adapter.readBlob({ ...ref, path: file.path })).length);
    const commands = (await readFile(process.env.GIT_SHIM_LOG, 'utf8')).trim().split('\\n').map(JSON.parse).slice(before);
    console.log(JSON.stringify({ contents, treeReads: commands.filter(x => x.args.includes('ls-tree')).length }));
  `);
  assert.ok(result.contents.length >= 3);
  assert.ok(result.contents.every(x => x > 0));
  assert.equal(result.treeReads, 0);
});

test('a complete timeline PR body can exclude a mere mention without fetching the unrelated PR', async (t) => {
  const f = await fixture(t);
  const scenario = await readScenario(f);
  const source = { ...issue(62), pull_request: { url: `${api}/pulls/62` },
    body: `## Workflow context\n\n\`\`\`json\n${JSON.stringify({ issues: [`${repository}#99`], basis: [], no_spec_reason: 'Unrelated local repair' })}\n\`\`\`` };
  scenario.records['issues/42/timeline'][0].push({ event: 'cross-referenced', source: { issue: source } });
  scenario.records['pulls/62'] = { ...scenario.records['pulls/43'], number: 62, body: source.body };
  await writeScenario(f, scenario);
  const result = await run(f, `
    const { createTrace } = await import(${JSON.stringify(traceModule)});
    const trace = await createTrace({ targetRoot: ${JSON.stringify(f.root)}, work: '${repository}#42' });
    const bundle = await trace.bundleAt('${repository}#42');
    console.log(JSON.stringify({ pulls: bundle.pulls.map(x => x.number), findings: trace.findings, requests: await requests() }));
  `);
  assert.ok(!result.pulls.includes(62));
  assert.equal(result.requests.filter(x => x.endsWith('pulls/62')).length, 0);
});

test('final PR and comment reads share one fresh query and still detect changed PR content', async (t) => {
  const f = await fixture(t);
  const scenario = await readScenario(f);
  scenario.records['pulls/62'] = { ...scenario.records['pulls/43'], number: 62, node_id: 'P62' };
  scenario.records['issues/comments/901'].node_id = 'C901';
  const p = scenario.records['pulls/62'];
  scenario.graphqlNodes = {
    P62: { number: 62, body: 'Changed PR content', state: p.state.toUpperCase(), merged: p.merged, mergedAt: p.merged_at ?? null,
      mergeCommit: null, potentialMergeCommit: null, changedFiles: p.changed_files ?? 1,
      headRefOid: p.head.sha, headRefName: p.head.ref, headRepository: { nameWithOwner: p.head.repo.full_name },
      baseRefOid: p.base.sha, baseRefName: p.base.ref, repository: { nameWithOwner: repository } },
    C901: { id: 'C901', fullDatabaseId: '901', body: comment.body, repository: { nameWithOwner: repository } },
  };
  await writeScenario(f, scenario);
  const bin = f.env.PATH.split(path.delimiter)[0];
  await copyFile(path.join(bin, 'gh'), path.join(bin, 'gh-rest'));
  await chmod(path.join(bin, 'gh-rest'), 0o755);
  await copyFile(new URL('./fixtures/read-adapter/batch-gh.mjs', import.meta.url), path.join(bin, 'gh'));
  await chmod(path.join(bin, 'gh'), 0o755);
  const result = await run(f, `
    await adapter.readPull('${repository}#62');
    await adapter.readComment({ repository: '${repository}', comment_id: 901 });
    const findings = await adapter.recheck(await adapter.fresh());
    console.log(JSON.stringify({ findings, requests: await requests() }));
  `);
  assert.ok(result.findings.some(finding => finding.code === 'context-source-stale'));
  assert.equal(result.requests.filter(resource => resource === 'graphql').length, 1);
  assert.equal(result.requests.filter(resource => resource.endsWith('pulls/62')).length, 1);
  assert.equal(result.requests.filter(resource => resource.endsWith('issues/comments/901')).length, 1);
});
