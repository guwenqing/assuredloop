#!/usr/bin/env node

import { appendFileSync, readFileSync } from 'node:fs';

const scenario = JSON.parse(readFileSync(process.env.FAKE_GH_SCENARIO, 'utf8'));
const args = process.argv.slice(2);
if (process.env.FAKE_GH_LOG) appendFileSync(process.env.FAKE_GH_LOG, `${JSON.stringify(args)}\n`);

function commands() {
  try {
    return readFileSync(process.env.FAKE_GH_LOG, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function endpointForApi() {
  return args.find((value) => value.startsWith('repos/'));
}

function lookup(repository, resource) {
  if (repository === scenario.repository) {
    if (resource === '') {
      const switched = scenario.metadataAfter && commands().some((command) => command[0] === 'api' && command.includes(scenario.metadataAfter.endpoint));
      return switched ? scenario.metadataAfter.value : (scenario.repositoryMetadata ?? { full_name: repository, private: false, default_branch: 'main' });
    }
    if (scenario.rawResponses && Object.hasOwn(scenario.rawResponses, resource)) return scenario.rawResponses[resource];
    if (scenario.records && Object.hasOwn(scenario.records, resource)) return scenario.records[resource];
  }
  const records = scenario.foreignRecords?.[repository];
  if (records && Object.hasOwn(records, resource)) return records[resource];
  if (scenario.foreignRepositories?.[repository] && resource === '') return scenario.foreignRepositories[repository];
  return undefined;
}

if (args[0] === '--version') {
  console.log(`gh version ${scenario.version ?? '2.88.0'}`);
} else if (args[0] === 'auth') {
  if (scenario.auth === 'fail') fail('not logged in');
} else if (args[0] === 'api') {
  const endpoint = endpointForApi();
  const match = /^repos\/([^/]+\/[^/]+)(?:\/(.*))?$/.exec(endpoint ?? '');
  const repository = match?.[1];
  const resource = (match?.[2] ?? '').split('?')[0];
  if (!endpoint || !args.includes('--hostname') || args[args.indexOf('--hostname') + 1] !== 'github.com') {
    fail('unexpected host or endpoint');
  } else if (scenario.mode === 'forbidden') {
    fail('HTTP 403 Forbidden');
  } else if (scenario.mode === 'rate-limited') {
    fail('HTTP 429 rate limit exceeded\nRetry-After: 120\nX-RateLimit-Reset: 1893456000');
  } else if (scenario.mode === 'transport') {
    fail('network transport unavailable');
  } else {
    const sequence = scenario.endpointSequences?.[endpoint];
    const prior = commands().filter((command) => command[0] === 'api' && command.includes(endpoint)).length - 1;
    const value = sequence ? sequence[Math.min(Math.max(prior, 0), sequence.length - 1)] : lookup(repository, resource);
    if (value === undefined) fail(`HTTP 404 Not Found: ${resource}`);
    else process.stdout.write(`${JSON.stringify(value)}\n`);
  }
}
