import { readFile, writeFile } from 'node:fs/promises';

export async function patchScenario(fixture, mutate) {
  const scenarioPath = fixture.env.FAKE_GH_SCENARIO;
  const scenario = JSON.parse(await readFile(scenarioPath, 'utf8'));
  await mutate(scenario);
  await writeFile(scenarioPath, `${JSON.stringify(scenario)}\n`);
  return scenario;
}
