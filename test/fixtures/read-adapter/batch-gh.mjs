#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
if (args[0] !== 'api' || args[1] !== 'graphql') {
  const result = spawnSync(path.join(path.dirname(process.argv[1]), 'gh-rest'), args, { env: process.env });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}
appendFileSync(process.env.FAKE_GH_LOG, `${JSON.stringify(args)}\n`);
const scenario = JSON.parse(readFileSync(process.env.FAKE_GH_SCENARIO, 'utf8'));
const query = args.find(arg => arg.startsWith('query='))?.slice(6);
if (!query?.startsWith('query {') || /mutation/.test(query)) throw new Error('Expected a read-only query');
const data = Object.fromEntries([...query.matchAll(/(r\d+):node\(id:"([^"]+)"\)/g)]
  .map(([, alias, id]) => [alias, scenario.graphqlNodes?.[id] ?? null]));
console.log(JSON.stringify({ data }));
