import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { git, makeTraceFixture, workPull } from '../trace-cli/helpers.mjs';

export async function makeDefaultBudgetFixture(t) {
  const fixture = await makeTraceFixture(t);
  const config = structuredClone(fixture.config);
  delete config.project.review.context;
  const configPath = path.join(fixture.root, '.assuredloop/config.json');
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  await git(fixture.root, ['add', '.assuredloop/config.json']);
  await git(fixture.root, ['commit', '-q', '-m', 'use default review context budget']);
  const baseRevision = (await git(fixture.root, ['rev-parse', 'HEAD'])).stdout.trim();

  const scenarioPath = fixture.env.FAKE_GH_SCENARIO;
  const scenario = JSON.parse(await readFile(scenarioPath, 'utf8'));
  scenario.records[`pulls/${workPull.split('#')[1]}`].base.sha = baseRevision;
  scenario.records['git/ref/heads/main'].object.sha = baseRevision;
  await writeFile(scenarioPath, `${JSON.stringify(scenario)}\n`);

  return { ...fixture, config, baseRevision, work: workPull };
}
