import { chmod, copyFile, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { makeTraceFixture, readLog, workPull } from '../trace-cli/helpers.mjs';

const repository = 'example/consumer';
const changedPath = 'src/candidate-context.js';
const fakeGhSource = fileURLToPath(new URL('./fake-gh.mjs', import.meta.url));

async function scenarioFor(fixture) {
  return JSON.parse(await readFile(fixture.env.FAKE_GH_SCENARIO, 'utf8'));
}

async function saveScenario(fixture, scenario) {
  await writeFile(fixture.env.FAKE_GH_SCENARIO, `${JSON.stringify(scenario)}\n`);
}

function filesFor(pathname = changedPath) {
  return [{ filename: pathname, status: 'added', additions: 3, deletions: 0, patch: `+${pathname}` }];
}

export async function makeCandidateFilesFixture(t, { mode = 'drift' } = {}) {
  const fixture = await makeTraceFixture(t);
  const fakeGh = path.join(path.dirname(fixture.env.FAKE_GH_SCENARIO), 'bin', 'gh');
  await copyFile(fakeGhSource, fakeGh);
  await chmod(fakeGh, 0o755);
  const observedLog = path.join(path.dirname(fixture.env.FAKE_GH_SCENARIO), 'observed.jsonl');
  fixture.env.FAKE_GH_OBSERVED_LOG = observedLog;
  const scenario = await scenarioFor(fixture);
  const initialPull = { ...scenario.records['pulls/43'], changed_files: mode === 'count-mismatch' ? 2 : 1 };
  scenario.records['pulls/43/files'] = [filesFor()];
  if (mode === 'drift') {
    const changedPull = {
      ...initialPull,
      base: { ...initialPull.base, ref: 'release' },
      head: { ...initialPull.head, sha: fixture.alternateHead },
    };
    scenario.sequences = { ...(scenario.sequences || {}), 'pulls/43': [initialPull, changedPull] };
    scenario.candidateDriftAfterFiles = true;
  } else {
    scenario.records['pulls/43'] = initialPull;
  }
  await saveScenario(fixture, scenario);
  return { ...fixture, changedPath, repository, work: workPull, initialPull, observedLog };
}

export { readLog, repository, workPull };
