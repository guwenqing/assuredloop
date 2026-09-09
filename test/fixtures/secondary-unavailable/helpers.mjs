import { rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  commandLog,
  makeLinkedPolicyCeilingFixture,
  runCli,
  saveScenario,
  scenarioOf,
  workIssue,
} from '../trace-external-boundaries/helpers.mjs';
import { git as closeoutGit, makeCloseoutFixture } from '../closeout-cli/helpers.mjs';

export { commandLog, runCli, workIssue };

async function saveCloseoutScenario(fixture, scenario) {
  await writeFile(fixture.env.FAKE_GH_SCENARIO, `${JSON.stringify(scenario)}\n`);
}

async function narrowPrimaryCeiling(fixture, scenario) {
  await closeoutGit(fixture.root, ['checkout', '-q', 'main']);
  const config = structuredClone(fixture.config);
  config.repository.allowed_reference_repositories = ['foreign/a'];
  await writeFile(path.join(fixture.root, '.assuredloop/config.json'), `${JSON.stringify(config, null, 2)}\n`);
  await closeoutGit(fixture.root, ['add', '.assuredloop/config.json']);
  await closeoutGit(fixture.root, ['commit', '-q', '-m', 'narrow primary test ceiling']);
  const revision = (await closeoutGit(fixture.root, ['rev-parse', 'HEAD'])).stdout.trim();
  scenario.records['git/ref/heads/main'].object.sha = revision;
}

export async function makeSecondaryUnavailableFixture(t, { missing = 'branch', restrictPrimary = missing !== 'control' } = {}) {
  const fixture = await makeLinkedPolicyCeilingFixture(t);
  const scenario = await scenarioOf(fixture);
  if (restrictPrimary) await narrowPrimaryCeiling(fixture, scenario);
  if (missing === 'branch' || missing === 'both') delete scenario.records['git/ref/heads/linked-second'];
  if (missing === 'both') delete scenario.records['git/ref/heads/linked-first'];
  if (missing === 'config') {
    await closeoutGit(fixture.root, ['checkout', '-q', 'linked-second']);
    await rm(path.join(fixture.root, '.assuredloop/config.json'));
    await closeoutGit(fixture.root, ['add', '-u', '.assuredloop/config.json']);
    await closeoutGit(fixture.root, ['commit', '-q', '-m', 'remove secondary current config']);
    const revision = (await closeoutGit(fixture.root, ['rev-parse', 'HEAD'])).stdout.trim();
    await closeoutGit(fixture.root, ['checkout', '-q', 'main']);
    scenario.records['git/ref/heads/linked-second'].object.sha = revision;
    scenario.records['pulls/45'].base.sha = revision;
  }
  if (!['branch', 'config', 'both', 'control'].includes(missing)) {
    throw new Error(`Unsupported missing secondary fixture: ${missing}`);
  }
  await saveScenario(fixture, scenario);
  return fixture;
}

export async function makePrerequisiteSecondaryUnavailableFixture(t) {
  const fixture = await makeCloseoutFixture(t);
  await closeoutGit(fixture.root, ['branch', 'linked-prerequisite', fixture.baseRevision]);
  const scenario = JSON.parse(await readFile(fixture.env.FAKE_GH_SCENARIO, 'utf8'));
  scenario.records['pulls/81'].base.ref = 'linked-prerequisite';
  scenario.records['pulls/81'].base.sha = fixture.baseRevision;
  delete scenario.records['git/ref/heads/linked-prerequisite'];
  await saveCloseoutScenario(fixture, scenario);
  return fixture;
}
