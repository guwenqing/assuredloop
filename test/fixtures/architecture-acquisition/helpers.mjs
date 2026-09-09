import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createTrace } from '../../../src/trace.js';
import {
  addForeignIssue, addPull, customMapping, foreignRepository, foreignWork, git,
  makeCategoryFixture, readLog, recordFor, repository, saveScenario, scenarioOf, setIssue, work,
} from '../architecture-category/helpers.mjs';

export { addForeignIssue, addPull, createTrace, customMapping, foreignRepository, foreignWork, git,
  makeCategoryFixture, readLog, recordFor, repository, saveScenario, scenarioOf, setIssue, work };

export async function withFixtureEnv(fixture, action) {
  const names = ['PATH', 'FAKE_GH_SCENARIO', 'FAKE_GH_LOG', 'GH_HOST'];
  const saved = new Map(names.map((name) => [name, process.env[name]]));
  for (const name of names) process.env[name] = fixture.env[name];
  try { return await action(); }
  finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

export async function foreignFixture(t) {
  const fixture = await makeCategoryFixture(t, { allowForeign: true });
  const foreign = await addForeignIssue(fixture);
  await setIssue(fixture, { category: 'task', activity: 'deliver' });
  return { ...fixture, foreign };
}

export async function changeForeignConfig(fixture, update) {
  const scenario = await scenarioOf(fixture);
  const records = scenario.foreignRecords[foreignRepository];
  const tree = records[`git/trees/${'f'.repeat(40)}`];
  const originalBlob = records[`git/blobs/${tree.tree[0].sha}`];
  const config = JSON.parse(Buffer.from(originalBlob.content, 'base64').toString('utf8'));
  update(config);
  const bytes = Buffer.from(`${JSON.stringify(config, null, 2)}\n`);
  const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  tree.tree[0].sha = sha;
  records[`git/blobs/${sha}`] = { sha, encoding: 'base64', size: bytes.length, content: bytes.toString('base64') };
  await saveScenario(fixture, scenario);
}

export async function destinationConfig(fixture, { branch = 'category-feature', mapping = fixture.mapping, allowed = [] } = {}) {
  const config = structuredClone(fixture.config);
  config.repository.labels = { type: structuredClone(mapping) };
  config.repository.allowed_reference_repositories = [...allowed];
  await git(fixture.root, ['checkout', '-q', '-b', branch]);
  await writeFile(path.join(fixture.root, '.assuredloop/config.json'), `${JSON.stringify(config, null, 2)}\n`);
  await git(fixture.root, ['add', '.assuredloop/config.json']);
  await git(fixture.root, ['commit', '-q', '--allow-empty', '-m', 'category destination configuration']);
  const revision = (await git(fixture.root, ['rev-parse', 'HEAD'])).stdout.trim();
  const scenario = await scenarioOf(fixture);
  scenario.records[`git/ref/heads/${branch}`] = { ref: `refs/heads/${branch}`, object: { type: 'commit', sha: revision } };
  scenario.sequences[`git/ref/heads/${branch}`] = [scenario.records[`git/ref/heads/${branch}`]];
  await saveScenario(fixture, scenario);
  await addPull({ ...fixture, revision, defaultBranch: branch });
  return { branch, revision, config };
}

export async function endpoints(fixture) {
  return (await readLog(fixture.ghLog)).filter((args) => args[0] === 'api')
    .map((args) => args.find((value) => value.startsWith('repos/')));
}
