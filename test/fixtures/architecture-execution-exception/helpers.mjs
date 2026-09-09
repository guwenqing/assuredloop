import { readFile, writeFile } from 'node:fs/promises';

import { makeTraceFixture, workIssue, workPull, git, readLog } from '../trace-cli/helpers.mjs';

export { workIssue, workPull, git, readLog };
export const mapping = Object.fromEntries(['request', 'epic', 'architecture-task', 'task', 'bug', 'spike']
  .map((category) => [category, `Assigned ${category}`]));

export function bodyFor(record, prose = 'Explicit assignment fixture.') {
  return `${prose}\n\n## Workflow context\n\n\`\`\`json\n${JSON.stringify(record, null, 2)}\n\`\`\`\n`;
}

export function directInput({ category = 'epic', body = '', mapped = true } = {}) {
  return {
    work: workIssue,
    categoryMapping: structuredClone(mapping),
    issue: {
      number: 42, title: 'Optional context Issue', body, state: 'open', state_reason: null,
      repository_url: 'https://api.github.com/repos/example/consumer',
      labels: category ? [{ name: mapping[category] }] : [],
    },
    pulls: [{
      number: 43, state: 'open', merged: false, merged_at: null, merge_commit_sha: null,
      base: { ref: 'main', sha: 'b'.repeat(40), repo: { full_name: 'example/consumer' } },
      head: { ref: 'assigned-work', sha: 'a'.repeat(40), repo: { full_name: 'example/consumer' } },
      body: bodyFor({
        issues: [mapped ? workIssue : 'example/consumer#99'], basis: [],
        no_spec_reason: 'This bounded PR has no applicable specification.',
      }, `A pull request may mention ${workIssue} in prose without assigning it.`),
    }],
  };
}

export async function scenarioOf(fixture) {
  return JSON.parse(await readFile(fixture.env.FAKE_GH_SCENARIO, 'utf8'));
}

export async function saveScenario(fixture, scenario) {
  await writeFile(fixture.env.FAKE_GH_SCENARIO, `${JSON.stringify(scenario)}\n`);
}

export async function makeAssignedFixture(t, { backlinks = true } = {}) {
  const fixture = await makeTraceFixture(t);
  const scenario = await scenarioOf(fixture);
  scenario.records['issues/42/timeline'] = [[]];
  if (!backlinks) {
    scenario.records['issues/42/comments'] = [scenario.records['issues/42/comments'].flat().filter((comment) => comment.id !== 101)];
  }
  await saveScenario(fixture, scenario);
  return fixture;
}

export async function replaceIssueContext(fixture, { category, body = 'A container or incoming request without an executable Workflow record.' } = {}) {
  const scenario = await scenarioOf(fixture);
  const issue = scenario.records['issues/42'];
  issue.labels = category ? [{ name: fixture.config.repository.labels.type[category] }] : [];
  if (body === undefined) delete issue.body;
  else issue.body = body;
  await saveScenario(fixture, scenario);
  return structuredClone(issue);
}

export async function addIncidentalReferences(fixture) {
  const scenario = await scenarioOf(fixture);
  const comment = { id: 119, body: `Discussion only: compare ${workPull}; no delivery is assigned here.` };
  scenario.records['issues/42/comments'].push([comment]);
  scenario.records['issues/comments/119'] = comment;
  scenario.records['pulls/44'] = {
    ...structuredClone(scenario.records['pulls/43']), number: 44,
    body: bodyFor({ issues: ['example/consumer#99'], basis: [], no_spec_reason: 'Unrelated PR assignment.' },
      `This unrelated PR only mentions ${workIssue} in prose.`),
  };
  scenario.records['issues/42/timeline'] = [[{
    event: 'cross-referenced', source: { issue: {
      number: 44, repository_url: 'https://api.github.com/repos/example/consumer',
      pull_request: { url: 'https://api.github.com/repos/example/consumer/pulls/44' },
    } },
  }]];
  await saveScenario(fixture, scenario);
}
