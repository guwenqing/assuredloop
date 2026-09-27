// C9 [TL-2]: no runtime dependencies beyond Node and git.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, cpSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRepo, tempDir, sha256 } from './helpers/fixture.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('C9 [TL-2] package.json declares no dependencies', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies, undefined);
});

test('C9 [TL-2] the tool runs from a copy of the project with no node_modules anywhere above it', (t) => {
  const copy = join(tempDir(t), 'al');
  cpSync(ROOT, copy, { recursive: true, filter: (src) => !['node_modules', '.git'].includes(basename(src)) });
  const repo = makeRepo(t);
  const words = 'words\n';
  repo.write('requests/x1/request.md', "# X one\nStatus: open\n\n## Owner's words and dialog\n\n- 2026-09-20 origin/2026-09-20-owner-words.md\n");
  repo.write('requests/x1/origin/2026-09-20-owner-words.md',
    `Source: standard input\nFetched: 2026-09-20T09:00Z\nSHA-256: ${sha256(words)}\n---\n${words}`);
  const r = spawnSync(process.execPath, [join(copy, 'bin/al.js'), 'context', 'x1'],
    { cwd: repo.dir, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('X one'), r.stdout);
});
