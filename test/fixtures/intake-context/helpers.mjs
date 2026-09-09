import { readFile, writeFile } from 'node:fs/promises';

import { bodyFor, makeNonPrFixture, git } from '../non-pr-cli/helpers.mjs';

const repository = 'example/consumer';

function issueMetadata(number, { bodyMode = 'text', body = 'Raw intake body.', labels = [], pullRequest = false,
  state = 'open', stateReason = null } = {}) {
  const issue = {
    number,
    title: `Intake context fixture #${number}`,
    state,
    state_reason: stateReason,
    repository_url: `https://api.github.com/repos/${repository}`,
    labels: labels.map((name) => ({ name })),
  };
  if (bodyMode !== 'absent') issue.body = bodyMode === 'null' ? null : body;
  if (pullRequest) issue.pull_request = { url: `https://api.github.com/repos/${repository}/pulls/${number}` };
  return issue;
}

function pullMetadata(number, { bodyMode = 'text', body = 'Raw pull body.', baseSha,
  state = 'open', merged = false } = {}) {
  const pull = {
    number,
    title: `Intake context pull #${number}`,
    state,
    merged,
    merged_at: null,
    merge_commit_sha: null,
    repository_url: `https://api.github.com/repos/${repository}`,
    base: { ref: 'develop', sha: baseSha, repo: { full_name: repository } },
    head: { ref: 'intake-context', sha: baseSha, repo: { full_name: repository } },
  };
  if (bodyMode !== 'absent') pull.body = bodyMode === 'null' ? null : body;
  return pull;
}

async function loadScenario(fixture) {
  return JSON.parse(await readFile(fixture.env.FAKE_GH_SCENARIO, 'utf8'));
}

async function saveScenario(fixture, scenario) {
  await writeFile(fixture.env.FAKE_GH_SCENARIO, `${JSON.stringify(scenario)}\n`);
}

export async function makeIntakeFixture(t, options = {}) {
  const fixture = await makeNonPrFixture(t, options.contextBudget === undefined
    ? {}
    : { contextBudget: options.contextBudget });
  const number = options.number ?? 62;
  const bodyMode = options.bodyMode ?? 'text';
  const suppliedBody = typeof options.body === 'function' ? options.body(fixture) : options.body;
  const rawBody = bodyMode === 'null' ? null : bodyMode === 'absent' ? undefined : (suppliedBody ?? 'Raw intake body.');
  const labels = options.labels ?? (options.labelKind ? [fixture.config.repository.labels.type[options.labelKind]] : []);
  const scenario = await loadScenario(fixture);
  scenario.records[`issues/${number}`] = issueMetadata(number, {
    bodyMode,
    body: rawBody,
    labels,
    pullRequest: options.pullRequest === true,
    state: options.issueState,
    stateReason: options.issueStateReason,
  });
  scenario.records[`issues/${number}/comments`] = [[]];
  scenario.records[`issues/${number}/timeline`] = [[]];
  if (options.pullRequest === true) {
    scenario.records[`pulls/${number}`] = pullMetadata(number, {
      bodyMode,
      body: rawBody,
      baseSha: fixture.revision,
      state: options.pullState,
      merged: options.merged ?? false,
    });
  }
  await saveScenario(fixture, scenario);
  return {
    ...fixture,
    number,
    work: `${repository}#${number}`,
    labels,
    rawBody,
    bodyPresent: bodyMode !== 'absent',
    statusBefore: (await git(fixture.root, ['status', '--porcelain'])).stdout,
  };
}

export function configuredLabel(fixture, kind) {
  const value = fixture.config.repository.labels.type[kind];
  if (typeof value !== 'string') throw new Error(`Fixture has no configured type label for ${kind}.`);
  return value;
}

export { bodyFor, git, repository };
