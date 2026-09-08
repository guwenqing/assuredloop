#!/usr/bin/env node

import { appendFileSync, readFileSync } from 'node:fs';

const scenario = JSON.parse(readFileSync(process.env.FAKE_GH_SCENARIO, 'utf8'));
const args = process.argv.slice(2);

function logLines() {
  try {
    return readFileSync(process.env.FAKE_GH_LOG, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

const before = logLines();
if (process.env.FAKE_GH_LOG) appendFileSync(process.env.FAKE_GH_LOG, `${JSON.stringify(args)}\n`);

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function output(value) {
  if (typeof value === 'string') process.stdout.write(value);
  else console.log(JSON.stringify(value));
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
  if (!endpoint || !args.includes('--hostname') || args[args.indexOf('--hostname') + 1] !== 'github.com') {
    fail('unexpected host or endpoint');
  } else if (!args.includes('--method') || args[args.indexOf('--method') + 1] !== 'GET') {
    fail('unexpected write method');
  } else if (scenario.mode === 'forbidden') {
    fail('HTTP 403 Forbidden');
  } else if (scenario.mode === 'rate-limited') {
    fail('HTTP 429 rate limit exceeded\nRetry-After: 120\nX-RateLimit-Reset: 1893456000');
  } else if (scenario.mode === 'transport') {
    fail('network transport unavailable');
  } else if (scenario.mode === 'access-404' && endpoint === `repos/${repository}`) {
    fail('HTTP 404 Not Found');
  } else if (endpoint === `repos/${repository}`) {
    output({ full_name: scenario.repositoryData?.full_name ?? repository, private: false,
      ...(scenario.repositoryData?.default_branch !== undefined ? { default_branch: scenario.repositoryData.default_branch } : {}) });
  } else if (scenario.missing?.includes(resource)) {
    fail('HTTP 404 Not Found');
  } else if (scenario.sequences && Object.hasOwn(scenario.sequences, resource)) {
    const seen = before.filter((command) => command[0] === 'api' && command.some((value) => value.startsWith(`repos/${repository}/${resource}`))).length;
    const values = scenario.sequences[resource];
    output(values[Math.min(seen, values.length - 1)]);
  } else if (scenario.records && Object.hasOwn(scenario.records, resource)) {
    output(scenario.records[resource]);
  } else {
    fail(`HTTP 404 Not Found: ${resource}`);
  }
}
