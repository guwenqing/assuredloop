import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { makeLateSourcePaginationFixture } from '../late-source-pagination/helpers.mjs';
import {
  commandLog,
  git,
  installBoundaryFakeGh,
  runCli,
  saveScenario,
  scenarioOf,
} from '../trace-external-boundaries/helpers.mjs';

export const mainBranchEndpoint = 'repos/example/consumer/git/ref/heads/main';

export async function makeFinalAcquisitionFixture(t) {
  const fixture = await makeLateSourcePaginationFixture(t);
  await installBoundaryFakeGh(fixture);
  const scenario = await scenarioOf(fixture);
  scenario.records['issues/42'].title += ' '.repeat(50);
  await saveScenario(fixture, scenario);
  return fixture;
}

export async function runBoundedInspect(fixture, budget) {
  return runCli([
    'inspect', '--target', fixture.root, '--work', fixture.work,
    '--max-inline-bytes', String(budget),
  ], fixture.env);
}

export async function configureDestinationDrift(fixture, budget) {
  const stable = await runBoundedInspect(fixture, budget);
  const stableCommands = await commandLog(fixture);
  const mainReads = stableCommands.filter((args) => args[0] === 'api' && args.includes(mainBranchEndpoint));

  await writeFile(path.join(fixture.root, 'final-acquisition-drift.txt'), 'new destination\n');
  await git(fixture.root, ['add', 'final-acquisition-drift.txt']);
  await git(fixture.root, ['commit', '-q', '-m', 'advance destination after source acquisition']);
  const advancedRevision = (await git(fixture.root, ['rev-parse', 'HEAD'])).stdout.trim();

  const scenario = await scenarioOf(fixture);
  const initialRevision = scenario.records['git/ref/heads/main'].object.sha;
  scenario.endpointSequences = {
    ...(scenario.endpointSequences ?? {}),
    [mainBranchEndpoint]: mainReads.map((_, index) => ({
      ref: 'refs/heads/main',
      object: { type: 'commit', sha: index === mainReads.length - 1 ? advancedRevision : initialRevision },
    })),
  };
  await saveScenario(fixture, scenario);
  await writeFile(fixture.ghLog, '');

  return { stable, stableCommands, mainReads, advancedRevision };
}
