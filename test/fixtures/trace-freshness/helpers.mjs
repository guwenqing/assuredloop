import { chmod, copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  alternateHead,
  git,
  makeTraceFixture,
  readLog,
  workIssue,
  workPull,
} from '../trace-cli/helpers.mjs';

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const dynamicGhSource = path.join(fixtureRoot, 'fake-gh.mjs');

export async function readScenario(fixture) {
  return JSON.parse(await readFile(fixture.env.FAKE_GH_SCENARIO, 'utf8'));
}

export async function writeScenario(fixture, scenario) {
  await writeFile(fixture.env.FAKE_GH_SCENARIO, `${JSON.stringify(scenario)}\n`);
}

export async function patchScenarioRecord(fixture, resource, patch) {
  const scenario = await readScenario(fixture);
  const record = scenario.records?.[resource];
  if (!record || Array.isArray(record)) throw new Error(`Expected an object record at ${resource}`);
  scenario.records[resource] = { ...record, ...patch };
  await writeScenario(fixture, scenario);
  return scenario.records[resource];
}

export async function installDynamicMutation(fixture, { resource, patch }) {
  const scenario = await readScenario(fixture);
  scenario.dynamicMutation = { resource, patch };
  delete scenario.dynamicMutationApplied;
  await writeScenario(fixture, scenario);
  const bin = fixture.env.PATH.split(path.delimiter)[0];
  const executable = path.join(bin, 'gh');
  await copyFile(dynamicGhSource, executable);
  await chmod(executable, 0o755);
}

export {
  alternateHead,
  git,
  makeTraceFixture,
  readLog,
  workIssue,
  workPull,
};
