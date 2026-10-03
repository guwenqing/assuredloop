// A `git` put first on PATH that logs each call (the directory it ran in and
// its args), then runs the real git. Nothing here reads the code under test.
import { spawnSync } from 'node:child_process';
import { writeFileSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { tempDir } from './fixture.js';

// The calls each run as { cwd, args }; fields end in \x1f, calls in \x1e.
export function gitShim(t) {
  const real = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
  assert.ok(real.startsWith('/'), `no git found on PATH: ${real}`);
  const dir = tempDir(t);
  const log = join(dir, 'calls');
  const shim = join(dir, 'git');
  writeFileSync(shim, `#!/bin/sh\nprintf '%s\\037' "$(pwd -P)" "$@" >> '${log}'\nprintf '\\036' >> '${log}'\nexec '${real}' "$@"\n`);
  chmodSync(shim, 0o755);
  return {
    path: `${dir}:${process.env.PATH}`,
    calls() {
      if (!existsSync(log)) return [];
      return readFileSync(log, 'utf8').split('\x1e').slice(0, -1).map((rec) => {
        const [cwd, ...args] = rec.split('\x1f').slice(0, -1);
        return { cwd, args };
      });
    },
    clear: () => writeFileSync(log, ''),
  };
}

// The working-tree forms the tool may repeat in one run: ls-files, diff with
// fewer than two revisions, grep or blame without a revision. A revision for
// grep and blame is read as a full commit id (the tool passes those).
export function readsWorktree(args) {
  const [cmd, ...rest] = args;
  const dd = rest.indexOf('--');
  const plain = (dd < 0 ? rest : rest.slice(0, dd)).filter((a) => !a.startsWith('-'));
  if (cmd === 'ls-files') return true;
  if (cmd === 'diff') return plain.length < 2 && !plain.some((a) => a.includes('..'));
  if (cmd === 'grep' || cmd === 'blame') return !plain.some((a) => /^[0-9a-f]{40}/.test(a));
  return false;
}

// Calls made more than once, other than the working-tree forms, as
// "<n> × <cwd>: git <args>".
export function repeats(calls) {
  const seen = new Map();
  for (const { cwd, args } of calls) {
    if (readsWorktree(args)) continue;
    const key = JSON.stringify([cwd, ...args]);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen].filter(([, n]) => n > 1).map(([key, n]) => {
    const [cwd, ...args] = JSON.parse(key);
    return `${n} × ${cwd}: git ${args.join(' ')}`;
  });
}
