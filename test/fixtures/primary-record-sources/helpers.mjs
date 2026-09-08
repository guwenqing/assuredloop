import { readFile, writeFile } from 'node:fs/promises';

import {
  makeTraceEvidenceFixture,
} from '../execution-evidence-review/helpers.mjs';
import { makeNonPrFixture } from '../non-pr-cli/helpers.mjs';

const repository = 'example/consumer';
const primaryIssue = `${repository}#42`;
const primaryPull = `${repository}#43`;

function bodyFor(prose, json) {
  return `${prose}\n\n## Workflow context\n\n\`\`\`json\n${json}\n\`\`\`\n`;
}

async function scenarioFor(fixture) {
  return JSON.parse(await readFile(fixture.env.FAKE_GH_SCENARIO, 'utf8'));
}

async function writeScenario(fixture, scenario) {
  await writeFile(fixture.env.FAKE_GH_SCENARIO, `${JSON.stringify(scenario)}\n`);
}

export const malformedPrBody = bodyFor(
  'PR body must survive exactly.',
  '{"issues": ["example/consumer#42"],}',
);

export const schemaInvalidPrBody = bodyFor(
  'PR schema-invalid body must survive exactly.',
  '{"issues": ["example/consumer#42"]}',
);

export const malformedIssueBody = bodyFor(
  'Issue body must survive exactly.',
  '{"activity":"deliver",}',
);

export const schemaInvalidIssueBody = bodyFor(
  'Issue schema-invalid body must survive exactly.',
  '{"change":"trace-cli","basis":[]}',
);

export async function makePrimaryFormalFixture(t, { kind, body } = {}) {
  if (!['issue', 'pr'].includes(kind)) throw new Error(`Unsupported primary formal kind: ${kind}`);
  const fixture = await makeTraceEvidenceFixture(t, { mode: 'mixed' });
  const scenario = await scenarioFor(fixture);

  // Keep this regression focused on the selected primary source. The valid
  // review comment remains present, while the unrelated timeline PR is not
  // allowed to add unrelated findings to the source-preservation assertion.
  scenario.records['issues/42/timeline'] = scenario.records['issues/42/timeline'].slice(0, 1);
  if (kind === 'pr') {
    // GitHub exposes the same PR body through both endpoints. Keep them equal
    // so a stale-body mismatch cannot mask the expected record diagnostic.
    scenario.records['issues/43'].body = body;
    scenario.records['pulls/43'].body = body;
  } else {
    scenario.records['issues/42'].body = body;
    scenario.records['issues/42'].labels = [{ name: fixture.config.repository.labels.type.task }];
  }
  await writeScenario(fixture, scenario);
  return { ...fixture, body, work: kind === 'pr' ? primaryPull : primaryIssue };
}

export async function makeRoutedTaskMissingFixture(t) {
  const fixture = await makeNonPrFixture(t, { contextBudget: 65536 });
  const scenario = await scenarioFor(fixture);
  const body = 'Configured Task body without an authoritative Workflow context.';
  const taskLabel = fixture.config.repository.labels.type.task;
  scenario.records['issues/62'].body = body;
  scenario.records['issues/62'].labels = [{ name: taskLabel }];
  await writeScenario(fixture, scenario);
  return { ...fixture, body, taskLabel, work: fixture.intakeWork };
}

export async function makeRoughRequestFixture(t) {
  const fixture = await makeNonPrFixture(t, { contextBudget: 65536 });
  const scenario = await scenarioFor(fixture);
  return { ...fixture, body: scenario.records['issues/62'].body, work: fixture.intakeWork };
}

export { primaryIssue, primaryPull, repository };
