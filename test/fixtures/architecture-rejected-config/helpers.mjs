import { createHash } from 'node:crypto';

import {
  foreignFixture, foreignRepository, saveScenario, scenarioOf,
} from '../architecture-acquisition/helpers.mjs';

export { foreignFixture };

export async function foreignConfigSource(fixture) {
  const scenario = await scenarioOf(fixture);
  const records = scenario.foreignRecords[foreignRepository];
  const entry = Object.values(records).flatMap((value) => Array.isArray(value?.tree) ? value.tree : [])
    .find((item) => item.path === 'config.json');
  const blob = records[`git/blobs/${entry.sha}`];
  const bytes = Buffer.from(blob.content, 'base64');
  return { bytes, blob: entry.sha, repository: foreignRepository,
    branch: scenario.foreignRepositories[foreignRepository].default_branch,
    revision: fixture.foreign.revision,
    config_ref: { repository: foreignRepository, revision: fixture.foreign.revision, path: '.assuredloop/config.json' },
    config_digest: createHash('sha256').update(bytes).digest('hex') };
}

export async function rejectForeignConfig(fixture, kind = 'missing architecture') {
  const source = await foreignConfigSource(fixture);
  const config = JSON.parse(source.bytes);
  config.repository.allowed_reference_repositories = ['third/untrusted-category-source'];
  if (kind === 'legacy discipline') {
    delete config.repository.labels.type['architecture-task'];
    config.repository.labels.discipline = { plan: 'old:architecture' };
  } else if (kind === 'missing architecture') delete config.repository.labels.type['architecture-task'];
  else if (kind === 'case collision') config.repository.labels.type['architecture-task'] = config.repository.labels.type.task.toUpperCase();
  const jsonBytes = Buffer.from(`${JSON.stringify(config, null, 2)}\n`);
  const bytes = kind === 'malformed JSON' ? Buffer.from('{"repository": {"labels":\n')
    : kind === 'invalid UTF-8' ? Buffer.concat([jsonBytes, Buffer.from([0xff])]) : jsonBytes;
  const scenario = await scenarioOf(fixture);
  const records = scenario.foreignRecords[foreignRepository];
  const entry = Object.values(records).flatMap((value) => Array.isArray(value?.tree) ? value.tree : [])
    .find((item) => item.path === 'config.json');
  const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  entry.sha = sha;
  records[`git/blobs/${sha}`] = { sha, encoding: 'base64', size: bytes.length, content: bytes.toString('base64') };
  await saveScenario(fixture, scenario);
  return foreignConfigSource(fixture);
}

export function classificationOf(loaded) {
  return JSON.parse(loaded.content.split('\n\n', 1)[0]).classification;
}
