// Issue #63, part 2 (layout A): the code lives flat in src/ and the tests in
// test/, with no v4 folder. A move by git mv, with no change of behaviour:
// - git tracks no path under src/v4/ or test/v4/;
// - git tracks src/*.js files, and every file git tracks under src/ is
//   directly in src/, in no subfolder;
// - bin/al.js imports its code from ../src/<file>.js, never from src/v4/;
// - `node bin/al.js --version` still runs and exits 0.
// Built from the issue; it reads only `git ls-files`, the import lines of
// bin/al.js, and the exit of al --version. It does not read the code in src/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const LIMIT = 60_000;

// A path under src/v4/ or test/v4/.
const OLD = /^(src|test)\/v4\//;
// A file directly in src/, in no subfolder.
const FLAT_SRC = /^src\/[^/]+$/;
// A JavaScript file directly in src/.
const FLAT_SRC_JS = /^src\/[^/]+\.js$/;
// The specifier of each static import or export ... from, and each dynamic import().
const SPEC = /\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
// An import of the code in src/ from bin/: ../src/<file>.js, with no subfolder.
const BIN_SRC = /^\.\.\/src\/[^/]+\.js$/;

function tracked() {
  const r = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', timeout: LIMIT });
  assert.equal(r.signal, null, `git ls-files was killed (signal ${r.signal})`);
  assert.equal(r.status, 0, `git ls-files failed:\n${r.stderr}`);
  return r.stdout.split('\0').filter(Boolean);
}

function specifiers(text) {
  return [...text.matchAll(SPEC)].map((m) => m[1]);
}

test('#63 git tracks no path under src/v4/ or test/v4/', () => {
  const files = tracked();
  assert.ok(files.includes('package.json') && files.includes('bin/al.js'), 'the fixture: git ls-files lists the repo\'s files');
  const old = files.filter((f) => OLD.test(f));
  assert.deepEqual(old, [], `${old.length} tracked paths should have moved out of src/v4/ or test/v4/:\n${old.join('\n')}`);
});

test('#63 git tracks src/*.js files, and every file git tracks under src/ is directly in src/, in no subfolder', () => {
  const src = tracked().filter((f) => f.startsWith('src/'));
  assert.ok(src.some((f) => FLAT_SRC_JS.test(f)), `git should track at least one src/*.js file; it tracks under src/:\n${src.join('\n')}`);
  const nested = src.filter((f) => !FLAT_SRC.test(f));
  assert.deepEqual(nested, [], `every file git tracks under src/ should be directly in src/:\n${nested.join('\n')}`);
});

test('#63 git tracks the tests directly in test/ (at least this file)', () => {
  assert.ok(tracked().includes('test/layout-63.test.js'), 'git should track test/layout-63.test.js at the top of test/');
});

test('#63 bin/al.js imports its code from ../src/<file>.js and nothing from src/v4/', () => {
  const bin = readFileSync(join(ROOT, 'bin', 'al.js'), 'utf8');
  const specs = specifiers(bin);
  const src = specs.filter((s) => s.includes('src/'));
  assert.ok(src.length > 0, `the fixture: bin/al.js imports from src/; its imports:\n${specs.join('\n')}`);
  const v4 = specs.filter((s) => s.includes('src/v4/'));
  assert.deepEqual(v4, [], 'bin/al.js should import nothing from src/v4/');
  const other = src.filter((s) => !BIN_SRC.test(s));
  assert.deepEqual(other, [], 'bin/al.js should import the code in src/ as ../src/<file>.js');
});

test('#63 node bin/al.js --version runs and exits 0', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'bin', 'al.js'), '--version'],
    { cwd: ROOT, input: '', encoding: 'utf8', timeout: LIMIT });
  assert.equal(r.signal, null, `al --version was killed (signal ${r.signal}):\n${r.stdout}\n${r.stderr}`);
  assert.equal(r.status, 0, `al --version should exit 0:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /^al \d+\.\d+\.\d+/, `al --version should name the version:\n${r.stdout}`);
});

test('#63 control: the path patterns find the old and the nested paths, and nothing else', () => {
  for (const f of ['src/v4/check.js', 'test/v4/pack.test.js', 'test/v4/helpers/repo.js']) assert.ok(OLD.test(f), f);
  for (const f of ['src/check.js', 'test/pack.test.js', 'test/helpers/repo.js', 'requests/archive/assuredloop-v4/request.md', 'docs/src/v4/x.js']) {
    assert.ok(!OLD.test(f), f);
  }
  for (const f of ['src/check.js', 'src/yaml-worker.js']) assert.ok(FLAT_SRC.test(f) && FLAT_SRC_JS.test(f), f);
  for (const f of ['src/v4/check.js', 'src/a/b.js']) assert.ok(!FLAT_SRC.test(f), f);
  assert.ok(!FLAT_SRC_JS.test('src/README.md'), 'src/README.md is no .js file');
});

test('#63 control: the import scan finds static, re-export and dynamic imports, and the bin pattern takes only ../src/<file>.js', () => {
  const text = [
    "import { check } from '../src/v4/check.js';",
    "import x from \"../src/spec.js\";",
    "export { y } from '../src/views.js';",
    "const m = await import('../src/search.js');",
    "import 'node:fs';",
  ].join('\n');
  assert.deepEqual(specifiers(text), ['../src/v4/check.js', '../src/spec.js', '../src/views.js', '../src/search.js', 'node:fs']);
  for (const s of ['../src/check.js', '../src/yaml-worker.js']) assert.ok(BIN_SRC.test(s), s);
  for (const s of ['../src/v4/check.js', '../src/a/b.js', './src/check.js', '../src/check.mjs']) assert.ok(!BIN_SRC.test(s), s);
});
