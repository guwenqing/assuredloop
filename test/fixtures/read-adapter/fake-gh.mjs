#!/usr/bin/env node

import { appendFileSync, readFileSync } from 'node:fs';

const scenario = JSON.parse(readFileSync(process.env.FAKE_GH_SCENARIO, 'utf8'));
const args = process.argv.slice(2);
if (process.env.FAKE_GH_LOG) {
  appendFileSync(process.env.FAKE_GH_LOG, `${JSON.stringify(args)}\n`);
}

function loggedCommands() {
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

if (args[0] === '--version') {
  console.log(`gh version ${scenario.version ?? '2.88.0'}`);
} else if (args[0] === 'auth') {
  if (scenario.auth === 'fail') fail('not logged in');
} else if (args[0] === 'api') {
  const endpoint = args.find((value) => value.startsWith('repos/'));
  const repository = scenario.repository ?? 'example/consumer';
  const prefix = `repos/${repository}/`;
  const resource = endpoint?.startsWith(prefix) ? endpoint.slice(prefix.length).split('?')[0] : '';
  const metadataCalls = loggedCommands().filter((command) => command[0] === 'api' && command.includes(`repos/${repository}`) &&
    !command.some((value) => value.startsWith(`repos/${repository}/`)));

  if (!endpoint || !args.includes('--hostname') || args[args.indexOf('--hostname') + 1] !== 'github.com') {
    fail('unexpected host or endpoint');
  } else if (scenario.mode === 'forbidden') {
    fail('HTTP 403 Forbidden');
  } else if (scenario.mode === 'rate-limited') {
    fail('HTTP 429 rate limit exceeded\nRetry-After: 120\nX-RateLimit-Reset: 1893456000');
  } else if (scenario.mode === 'transport') {
    fail('network transport unavailable');
  } else if (scenario.mode === 'access-lost-after-record-404' && endpoint === `repos/${repository}` && metadataCalls.length >= 2) {
    fail('HTTP 404 Not Found');
  } else if (scenario.mode === 'access-lost-after-record-404' && resource === 'issues/7') {
    fail('HTTP 404 Not Found');
  } else if (scenario.mode === 'access-404' && endpoint === `repos/${repository}`) {
    fail('HTTP 404 Not Found');
  } else if (endpoint === `repos/${repository}`) {
    console.log(JSON.stringify(scenario.repositoryMetadata ?? { full_name: scenario.full_name ?? repository, private: false }));
  } else if (scenario.blobJsonOnly && endpoint.includes('/git/blobs/') &&
    !args.includes('Accept: application/vnd.github+json')) {
    process.stdout.write(String(scenario.rawBlobResponses?.[resource] ?? 'raw blob response\r\n'));
  } else if (scenario.rawResponses && Object.hasOwn(scenario.rawResponses, resource)) {
    process.stdout.write(String(scenario.rawResponses[resource]));
  } else if (scenario.missing?.includes(resource)) {
    fail('HTTP 404 Not Found');
  } else if (scenario.records && Object.hasOwn(scenario.records, resource)) {
    console.log(JSON.stringify(scenario.records[resource]));
  } else {
    fail(`HTTP 404 Not Found: ${resource}`);
  }
}
