import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { git, makeNonPrFixture } from '../non-pr-cli/helpers.mjs';

const repository = 'example/consumer';
const issueNumber = 62;

function labelVariant(value, variant) {
  if (variant === 'lower') return value.toLowerCase();
  if (variant === 'upper') return value.toUpperCase();
  if (variant === 'mixed') {
    return [...value].map((character, index) => index % 2 ? character.toUpperCase() : character.toLowerCase()).join('');
  }
  throw new Error(`Unsupported label variant: ${variant}`);
}

async function scenarioFor(fixture) {
  return JSON.parse(await readFile(fixture.env.FAKE_GH_SCENARIO, 'utf8'));
}

async function saveScenario(fixture, scenario) {
  await writeFile(fixture.env.FAKE_GH_SCENARIO, `${JSON.stringify(scenario)}\n`);
}

export async function makeRoutedLabelCaseFixture(t, {
  labelKind = 'task',
  configuredVariant = 'lower',
  observedVariant = 'upper',
  unlabeled = false,
} = {}) {
  const fixture = await makeNonPrFixture(t, { contextBudget: 65536 });
  const scenario = await scenarioFor(fixture);
  const config = structuredClone(fixture.config);
  const configuredBase = labelKind ? config.repository.labels.type[labelKind] : null;
  const configuredLabel = labelKind ? labelVariant(configuredBase, configuredVariant) : null;
  const observedLabel = labelKind && !unlabeled ? labelVariant(configuredBase, observedVariant) : null;

  if (labelKind) {
    config.repository.labels.type[labelKind] = configuredLabel;
    await writeFile(path.join(fixture.root, '.assuredloop/config.json'), `${JSON.stringify(config, null, 2)}\n`);
    await git(fixture.root, ['add', '.assuredloop/config.json']);
    await git(fixture.root, ['commit', '-q', '-m', 'configure routed label case fixture']);
    const revision = (await git(fixture.root, ['rev-parse', 'HEAD'])).stdout.trim();
    scenario.sequences[`git/ref/heads/${fixture.defaultBranch}`] = [
      { ref: `refs/heads/${fixture.defaultBranch}`, object: { type: 'commit', sha: revision } },
    ];
  }

  const body = unlabeled
    ? 'Unlabeled rough intake without an authoritative Workflow context.'
    : `Configured ${labelKind} body without an authoritative Workflow context.`;
  scenario.records[`issues/${issueNumber}`].body = body;
  scenario.records[`issues/${issueNumber}`].labels = observedLabel ? [{ name: observedLabel }] : [];
  await saveScenario(fixture, scenario);

  return {
    ...fixture,
    config,
    body,
    configuredLabel,
    observedLabel,
    labels: observedLabel ? [{ name: observedLabel }] : [],
    work: `${repository}#${issueNumber}`,
  };
}

export { labelVariant, repository };
