// Issue #209 (T18): the v4 release, 0.2.0. Built from the issue's
// requirement and the public interface only: here, the README texts.
// - README.md: 0.2.0 is v4 and breaks 0.1.0 records; how to move from 0.1.0.
//
// #212 (0.2.1) removed the second package, @assuredloop/search, and its
// publish step and cache fill. The #209 checks of that package, of its
// publish step, of the cache fill and its cutoff, of the cli at 0.2.0, of the
// install lines of both packages, and of the offline install of both
// tarballs are gone from this file. What still holds of them is in
// test/v4/release-212.test.js: the cli's publish steps and the offline
// install of the cli.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// --- README.md (root)

// The README cut into sections at each heading line.
const sections = (md) => md.split(/^(?=#{1,6} )/m);
const paragraphs = (md) => md.split(/\n\s*\n/);

test('#209 README.md says that 0.2.0 is v4, and that it breaks 0.1.0 records', () => {
  const md = readFileSync(join(ROOT, 'README.md'), 'utf8');
  assert.ok(paragraphs(md).some((p) => /\b0\.2\.0\b/.test(p) && /\bv4\b/.test(p)), 'one paragraph names 0.2.0 and v4');
  assert.ok(paragraphs(md).some((p) => /\b0\.1\.0\b/.test(p) && /\brecords?\b/.test(p)
    && /\b(break|breaks|does not read|cannot read|can not read|no longer reads?|not compatible|incompatible)\b/i.test(p)),
  'one paragraph says that 0.1.0 records are not read (broken) by this version');
});

test('#209 README.md tells an adopter how to move from 0.1.0: finish or restart an open 0.1.0 request, then run al spec --add-ids', () => {
  const md = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const found = sections(md).some((s) => {
    const at = s.search(/\b0\.1\.0\b/);
    if (at < 0) return false;
    const rest = s.slice(at);
    const fin = rest.search(/\bfinish/i);
    if (fin < 0 || !/\bopen\b/i.test(rest)) return false;
    if (!/\brestart|\bstart\b[^.]{0,30}\b(again|over)\b/i.test(rest)) return false;
    return rest.indexOf('al spec --add-ids', fin) > fin;
  });
  assert.ok(found, 'one section names 0.1.0, says to finish or restart an open request, and after that names `al spec --add-ids`');
});
