// C9 [TL-2]: the CLI source stays under 3,500 lines (ADR 0012), counted as
// every line of the .js files in src/ and bin/, blank lines and comments
// included; tests are not counted. (No runtime dependencies is
// test/deps.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Every .js file under `dir`, in its subfolders too.
function jsFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return jsFiles(p);
    return name.endsWith('.js') ? [p] : [];
  });
}
// A file's lines; a final newline does not make an extra line, a last line without one counts.
const count = (p) => {
  const s = readFileSync(p, 'utf8');
  return s === '' ? 0 : s.replace(/\n$/, '').split('\n').length;
};

test('C9 [TL-2] the CLI source, every line of the .js files in src/ and bin/, is under 3,500 lines', () => {
  const files = ['src', 'bin'].flatMap((d) => jsFiles(join(ROOT, d)));
  assert.ok(files.some((p) => p.endsWith('al.js')) && files.length > 1, `the count should read bin/al.js and src/: ${files.join(', ')}`);
  const total = files.reduce((n, p) => n + count(p), 0);
  assert.ok(total < 3500, `the CLI source is ${total} lines`);
});
