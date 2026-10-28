// Issue #63, part 1: the repo follows its own config. .assuredloop/config.yaml
// says originals: {outside: assuredloop}, so the original files of each request
// (the owner's words, sign-off snapshots and other source snapshots) are kept
// outside the repo, in the place that each machine sets (src/v4/originals.js).
// The records in .assuredloop/records/requests/ keep each file's name and
// sha256. So git tracks no file under requests/<name>/origin/ or
// requests/archive/<name>/origin/. Built from the issue; it reads only this
// repo's config and `git ls-files`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// A path under requests/<name>/origin/ or requests/archive/<name>/origin/.
// requests/archive/ is the archive folder, not a request named archive.
const ORIGIN = /^requests\/(archive\/[^/]+|(?!archive\/)[^/]+)\/origin\//;

function tracked() {
  const r = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
  assert.equal(r.status, 0, `git ls-files failed:\n${r.stderr}`);
  return r.stdout.split('\0').filter(Boolean);
}

test('#63 the fixture: .assuredloop/config.yaml says originals: {outside: assuredloop}', () => {
  const config = parse(readFileSync(join(ROOT, '.assuredloop/config.yaml'), 'utf8'));
  assert.deepEqual(config?.originals, { outside: 'assuredloop' });
});

test('#63 git tracks no file under requests/<name>/origin/ or requests/archive/<name>/origin/', () => {
  const files = tracked();
  assert.ok(files.some((f) => f.startsWith('requests/')), 'the fixture: git tracks files under requests/');
  const origin = files.filter((f) => ORIGIN.test(f));
  assert.deepEqual(origin, [], `${origin.length} tracked original files should be outside the repo:\n${origin.join('\n')}`);
});

test('#63 control: the pattern finds an origin file of an open request and of an archived one, and nothing else', () => {
  const yes = ['requests/inv/origin/2026-05-04-signoff.md', 'requests/archive/inv/origin/a.md', 'requests/archive/inv/origin/sub/b.md'];
  const no = ['requests/inv/request.md', 'requests/archive/inv/request.md', 'requests/origin.md', 'specs/origin/x.md',
    'requests/archive/origin/request.md', 'test/v4/requests/inv/origin/x.md'];
  for (const f of yes) assert.ok(ORIGIN.test(f), f);
  for (const f of no) assert.ok(!ORIGIN.test(f), f);
});
