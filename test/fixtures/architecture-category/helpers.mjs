import { createHash } from 'node:crypto';
import { chmod, copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bodyFor, git, makeNonPrFixture, readLog } from '../non-pr-cli/helpers.mjs';

export { bodyFor, git, readLog };
export const repository = 'example/consumer';
export const foreignRepository = 'example/category-consumer';
export const issueNumber = 62;
export const work = `${repository}#${issueNumber}`;
export const pullWork = `${repository}#70`;
export const foreignWork = `${foreignRepository}#260`;
export const activities = {
  request: ['triage'],
  epic: [],
  'architecture-task': ['plan', 'closeout'],
  task: ['adopt', 'deliver', 'review'],
  bug: ['deliver'],
  spike: ['research'],
};
export const defaultMapping = Object.fromEntries(Object.keys(activities).map((kind) => [kind, `type:${kind}`]));
export const customMapping = {
  request: 'Queue: Intake',
  epic: 'Scope: Portfolio',
  'architecture-task': 'Work: Design',
  task: 'Work: Execution',
  bug: 'Repair: Accepted Behavior',
  spike: 'Question: Investigation',
};

export function recordFor(activity, fields = {}) {
  return {
    activity,
    request: `${repository}#1`,
    basis: [],
    no_spec_reason: 'This bounded classification fixture has no applicable product Spec.',
    ...fields,
  };
}

export async function scenarioOf(fixture) {
  return JSON.parse(await readFile(fixture.env.FAKE_GH_SCENARIO, 'utf8'));
}

export async function saveScenario(fixture, scenario) {
  await writeFile(fixture.env.FAKE_GH_SCENARIO, `${JSON.stringify(scenario)}\n`);
}

export async function makeCategoryFixture(t, { mapping = defaultMapping, allowForeign = false } = {}) {
  const fixture = await makeNonPrFixture(t, { contextBudget: 65536 });
  const config = structuredClone(fixture.config);
  config.repository.labels = { type: structuredClone(mapping) };
  if (allowForeign) config.repository.allowed_reference_repositories = [foreignRepository];
  const configBytes = `${JSON.stringify(config, null, 2)}\n`;
  await writeFile(path.join(fixture.root, '.assuredloop/config.json'), configBytes);
  await git(fixture.root, ['add', '.assuredloop/config.json']);
  await git(fixture.root, ['commit', '-q', '--allow-empty', '-m', 'configure formal category fixture']);
  const revision = (await git(fixture.root, ['rev-parse', 'HEAD'])).stdout.trim();
  const scenario = await scenarioOf(fixture);
  scenario.sequences[`git/ref/heads/${fixture.defaultBranch}`] = [{
    ref: `refs/heads/${fixture.defaultBranch}`, object: { type: 'commit', sha: revision },
  }];
  await saveScenario(fixture, scenario);
  return { ...fixture, config, revision, mapping, work, configDigest: createHash('sha256').update(configBytes).digest('hex'),
    statusBefore: (await git(fixture.root, ['status', '--porcelain'])).stdout };
}

export async function setIssue(fixture, { category, activity, labels, record, body, state = 'open', stateReason = null } = {}) {
  const scenario = await scenarioOf(fixture);
  const observedLabels = labels ?? (category ? [fixture.mapping[category]] : []);
  const issue = scenario.records[`issues/${issueNumber}`];
  issue.labels = observedLabels.map((name) => ({ name }));
  issue.body = body ?? bodyFor(record === undefined ? (activity ? recordFor(activity) : null) : record,
    'Category fixture source prose remains reviewable.');
  issue.state = state;
  issue.state_reason = stateReason;
  await saveScenario(fixture, scenario);
  return { labels: observedLabels, body: issue.body };
}

export async function addPull(fixture, { issues = [work], labels = [fixture.mapping.task, fixture.mapping['architecture-task']] } = {}) {
  const scenario = await scenarioOf(fixture);
  const body = bodyFor({ issues, basis: [], no_spec_reason: 'This PR only exercises mapped Issue classification.' });
  scenario.records['issues/70'] = {
    number: 70, title: 'Mapped category fixture PR', body, state: 'open',
    repository_url: `https://api.github.com/repos/${repository}`,
    labels: labels.map((name) => ({ name })),
    pull_request: { url: `https://api.github.com/repos/${repository}/pulls/70` },
  };
  scenario.records['issues/70/comments'] = [[]];
  scenario.records['pulls/70'] = {
    number: 70, title: 'Mapped category fixture PR', body, state: 'open', merged: false,
    merged_at: null, merge_commit_sha: null, changed_files: 0,
    base: { ref: fixture.defaultBranch, sha: fixture.revision, repo: { full_name: repository } },
    head: { ref: 'category-candidate', sha: fixture.revision, repo: { full_name: repository } },
  };
  scenario.records['pulls/70/files'] = [[]];
  await saveScenario(fixture, scenario);
}

export async function addForeignIssue(fixture, { valid = true, missingConfig = false } = {}) {
  const scenario = await scenarioOf(fixture);
  const mapping = { ...customMapping, task: 'Remote: Execution', spike: fixture.mapping.task };
  const config = structuredClone(fixture.config);
  config.repository.name = foreignRepository;
  config.repository.labels = { type: mapping };
  delete config.repository.allowed_reference_repositories;
  const revision = 'd'.repeat(40);
  const rootTree = 'e'.repeat(40);
  const configTree = 'f'.repeat(40);
  const bytes = Buffer.from(`${JSON.stringify(config, null, 2)}\n`);
  const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  const labels = [(valid ? mapping.spike : mapping['architecture-task']).toUpperCase()];
  const records = {
    'issues/260': {
      number: 260, title: 'Foreign category fixture', state: 'closed', state_reason: 'completed',
      repository_url: `https://api.github.com/repos/${foreignRepository}`,
      labels: labels.map((name) => ({ name })), body: bodyFor(recordFor('research')),
    },
    'issues/260/comments': [[{ id: 2601, body: JSON.stringify({
      head: null, no_head_reason: 'Bounded research has no implementation revision.',
      scope: 'Compare classification mappings and return findings.', result: 'pass',
      evidence: [{ repository, comment_id: 500 }],
      producer_session: 'foreign-producer', reviewer_session: 'foreign-reviewer',
      reviewer_model: 'gpt-6-astra', review_depth: 'full-scope',
    }) }]],
    'issues/260/timeline': [[]],
    'git/ref/heads/trunk': { ref: 'refs/heads/trunk', object: { type: 'commit', sha: revision } },
    [`git/commits/${revision}`]: { sha: revision, tree: { sha: rootTree } },
    [`git/trees/${rootTree}`]: { sha: rootTree, truncated: false, tree: [
      { path: '.assuredloop', type: 'tree', mode: '040000', sha: configTree },
    ] },
    [`git/trees/${configTree}`]: { sha: configTree, truncated: false, tree: missingConfig ? [] : [
      { path: 'config.json', type: 'blob', mode: '100644', sha: blob },
    ] },
    [`git/blobs/${blob}`]: { sha: blob, encoding: 'base64', size: bytes.length, content: bytes.toString('base64') },
  };
  records['issues/comments/2601'] = records['issues/260/comments'][0][0];
  scenario.foreignRepositories = { [foreignRepository]: { full_name: foreignRepository, private: false, default_branch: 'trunk' } };
  scenario.foreignRecords = { [foreignRepository]: records };
  scenario.repositoryMetadata = { full_name: repository, private: false, default_branch: fixture.defaultBranch };
  for (const [resource, sequence] of Object.entries(scenario.sequences)) scenario.records[resource] = sequence[0];
  const executable = path.join(path.dirname(fixture.env.FAKE_GH_SCENARIO), 'bin', 'gh');
  await copyFile(fileURLToPath(new URL('../trace-external-boundaries/fake-gh.mjs', import.meta.url)), executable);
  await chmod(executable, 0o755);
  await saveScenario(fixture, scenario);
  return { labels, revision, mapping, configDigest: createHash('sha256').update(bytes).digest('hex') };
}
