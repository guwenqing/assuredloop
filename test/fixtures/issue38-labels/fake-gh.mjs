#!/usr/bin/env node
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const statePath = process.env.ISSUE38_GH_STATE;
const state = JSON.parse(readFileSync(statePath, 'utf8'));
const event = { args };
function finish(value, failure) {
  writeFileSync(statePath, JSON.stringify(state));
  appendFileSync(process.env.ISSUE38_GH_LOG, `${JSON.stringify(event)}\n`);
  if (failure) { process.stderr.write(`${failure}\n`); process.exitCode = 1; }
  else process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value)}\n`);
}
if (args[0] === '--version') finish('gh version 2.88.0');
else if (args[0] === 'auth' && args[1] === 'status') finish('', state.authDenied && 'HTTP 403 Forbidden');
else if (args[0] !== 'api') finish(null, 'Unexpected command: only API reads and explicit label creates are allowed');
else {
  const endpoint = args.find((arg) => arg.startsWith('repos/'));
  const methodAt = args.findIndex((arg) => ['--method', '-X'].includes(arg));
  const method = methodAt >= 0 ? args[methodAt + 1].toUpperCase() : 'GET';
  Object.assign(event, { endpoint, method });
  const base = `repos/${state.repository}`;
  if (!args.includes('--hostname') || args[args.indexOf('--hostname') + 1] !== 'github.com') finish(null, 'Wrong API host');
  else if (!endpoint?.startsWith(base)) finish(null, 'HTTP 404 Wrong repository');
  else if (method === 'GET' && endpoint === base) finish({ full_name: state.remoteName ?? state.repository,
    permissions: { push: state.canWrite !== false, admin: false, maintain: false } }, state.denyRead && 'HTTP 403 Forbidden');
  else if (method === 'GET' && /^\/labels(?:\?|$|\/)/.test(endpoint.slice(base.length))) {
    if (state.denyRead || state.readbackDenied && state.successfulCreates > 0) finish(null, 'HTTP 403 Label inventory unavailable');
    else {
      const suffix = endpoint.slice(`${base}/labels`.length);
      if (!suffix.startsWith('/')) {
        state.inventoryReads = (state.inventoryReads || 0) + 1;
        if (state.appearNextInventory) { state.labels.push(state.appearNextInventory); delete state.appearNextInventory; }
      }
      const labels = suffix.startsWith('/') ? state.labels.filter((label) => label.name.toLowerCase() === decodeURIComponent(suffix.slice(1)).toLowerCase()) : state.labels;
      event.observed = labels.map((label) => label.name);
      if (suffix.startsWith('/') && !labels.length) finish(null, 'HTTP 404 Label not found');
      else finish(suffix.startsWith('/') ? labels[0] : args.includes('--slurp') ? [labels] : labels);
    }
  } else if (method === 'POST' && endpoint === `${base}/labels`) {
    const inputAt = args.indexOf('--input');
    if (inputAt < 0) finish(null, 'Label creation must use serialized JSON input');
    else {
      let body;
      try { body = JSON.parse(readFileSync(args[inputAt + 1] === '-' ? 0 : args[inputAt + 1], 'utf8')); }
      catch { finish(null, 'Invalid serialized label request'); }
      if (body) {
        event.body = body;
        if (state.canWrite === false || state.failName === body.name) finish(null, 'HTTP 403 Label creation denied');
        else if (state.raceName === body.name) {
          state.labels.push({ id: 9001, name: body.name, color: 'fedcba', description: 'Created concurrently; preserve this metadata' });
          delete state.raceName; event.race = true; finish(null, 'HTTP 422 Validation Failed: already_exists');
        } else if (state.labels.some((label) => label.name.toLowerCase() === body.name.toLowerCase())) finish(null, 'HTTP 422 Label already exists');
        else {
          const created = { id: 1000 + (state.successfulCreates || 0), ...body };
          state.labels.push(created); state.successfulCreates = (state.successfulCreates || 0) + 1;
          event.created = body.name; finish(created);
        }
      }
    }
  } else finish(null, 'Forbidden mutation or unexpected endpoint');
}
