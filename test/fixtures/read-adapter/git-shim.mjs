#!/usr/bin/env node

import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
appendFileSync(process.env.GIT_SHIM_LOG, `${JSON.stringify({
  args,
  noLazyFetch: process.env.GIT_NO_LAZY_FETCH ?? null,
})}\n`);

if (args.some((value) => ['fetch', 'checkout', 'switch', 'pull', 'clone'].includes(value))) {
  process.stderr.write('networking or checkout is forbidden in this read-only fixture\n');
  process.exit(97);
}

const result = spawnSync(process.env.REAL_GIT, args, { env: process.env });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) {
  process.stderr.write(`${result.error.message}\n`);
  process.exit(1);
}
process.exit(result.status ?? 1);
