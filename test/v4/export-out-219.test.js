// Issue #219: `al export --out <file>` follows the README rule for commands
// that change files: it shows what it would write, and writes only with
// `--yes`. Without --yes: one body line "Would write <n> rows to <file>",
// then ", replacing the existing file" or ", a new file"; Next says "run the
// same command with --yes to write it"; nothing is written. With --yes: the
// file holds the bytes of `al export` on standard output at that commit,
// and the body line starts "Wrote <n> rows to <file>". `al export` with no
// --out does not change. Written from the requirement and the public command only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INVOICES, baseProject, commitAll, exists, git, ok, read, show, write, writesNothing,
} from './helpers/project.js';
import { parseRows } from './helpers/search.js';

const OUT = 'export.jsonl';
const USER_TEXT = 'existing user text\n';
const NEXT_YES = /^Next\s+run the same command with --yes to write it\s*$/m;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The JSONL of `al export` on standard output, and its row count.
function stdoutExport(dir, extra = []) {
  const r = ok(dir, ['export', ...extra]);
  return { text: r.stdout, n: parseRows(r.stdout).length };
}

// The output ends with the Read, Next and Not known lines, in that order,
// after the body line that matches `body`.
function endsWithThreeLines(r, body) {
  const lines = r.stdout.split('\n');
  const at = (re) => lines.findIndex((l) => re.test(l));
  const b = at(body);
  const read = at(/^Read\b/);
  const next = at(/^Next\b/);
  const notKnown = at(/^Not known\b/);
  assert.ok(b >= 0, `a body line ${body}:\n${show(r)}`);
  assert.ok(read > b && next > read && notKnown > next, `Read, Next and Not known after the body line, in order:\n${show(r)}`);
}

test('export --out without --yes and no file: nothing is created; the line says a new file, with the row count of al export', (t) => {
  const dir = baseProject(t);
  const { n } = stdoutExport(dir);
  assert.ok(n > 0, 'the project has rows');
  const r = writesNothing(dir, ['export', '--out', OUT]);
  assert.ok(!exists(dir, OUT), `the file is not created:\n${show(r)}`);
  const line = new RegExp(`^Would write ${n} rows to ${esc(OUT)}, a new file`, 'm');
  assert.match(r.stdout, line, show(r));
  assert.doesNotMatch(r.stdout, /replacing the existing file/, show(r));
  assert.doesNotMatch(r.stdout, /^Wrote /m, show(r));
  assert.match(r.stdout, NEXT_YES, show(r));
  endsWithThreeLines(r, line);
});

test('export --out without --yes and an existing file: its bytes stay; the line says replacing the existing file', (t) => {
  const dir = baseProject(t);
  write(dir, OUT, USER_TEXT);
  const { n } = stdoutExport(dir);
  const r = writesNothing(dir, ['export', '--out', OUT]);
  assert.equal(read(dir, OUT), USER_TEXT, `the existing file keeps its bytes:\n${show(r)}`);
  const line = new RegExp(`^Would write ${n} rows to ${esc(OUT)}, replacing the existing file`, 'm');
  assert.match(r.stdout, line, show(r));
  assert.doesNotMatch(r.stdout, /, a new file/, show(r));
  assert.doesNotMatch(r.stdout, /^Wrote /m, show(r));
  assert.match(r.stdout, NEXT_YES, show(r));
  endsWithThreeLines(r, line);
});

test('export --out --yes and an existing file: the file is replaced with the bytes of al export on standard output', (t) => {
  const dir = baseProject(t);
  write(dir, OUT, USER_TEXT);
  const { text, n } = stdoutExport(dir);
  const r = ok(dir, ['export', '--out', OUT, '--yes']);
  assert.equal(read(dir, OUT), text, `the file holds the JSONL of al export:\n${show(r)}`);
  const line = new RegExp(`^Wrote ${n} rows to ${esc(OUT)}`, 'm');
  assert.match(r.stdout, line, show(r));
  assert.doesNotMatch(r.stdout, /^Would write /m, show(r));
  endsWithThreeLines(r, line);
});

test('export --out --yes and no file: the file is written with the bytes of al export on standard output', (t) => {
  const dir = baseProject(t);
  const { text, n } = stdoutExport(dir);
  const r = ok(dir, ['export', '--out', OUT, '--yes']);
  assert.ok(exists(dir, OUT), `the file is written:\n${show(r)}`);
  assert.equal(read(dir, OUT), text, `the file holds the JSONL of al export:\n${show(r)}`);
  const line = new RegExp(`^Wrote ${n} rows to ${esc(OUT)}`, 'm');
  assert.match(r.stdout, line, show(r));
  assert.doesNotMatch(r.stdout, /^Would write /m, show(r));
  endsWithThreeLines(r, line);
});

test('export --at <commit> --out: the count and the bytes are those of al export --at that commit', (t) => {
  const dir = baseProject(t);
  const A = git(dir, 'rev-parse', 'HEAD');
  write(dir, 'specs/invoices.md', `${INVOICES}\n<!-- INV-50 rule -->\n\nAn invoice MUST name its currency.\n`);
  commitAll(dir, 'B: INV-50');
  const atA = stdoutExport(dir, ['--at', A]);
  const atHead = stdoutExport(dir);
  assert.notEqual(atA.n, atHead.n, 'the two commits have different row counts');
  const preview = writesNothing(dir, ['export', '--at', A, '--out', OUT]);
  assert.match(preview.stdout, new RegExp(`^Would write ${atA.n} rows to ${esc(OUT)}, a new file`, 'm'), show(preview));
  const r = ok(dir, ['export', '--at', A, '--out', OUT, '--yes']);
  assert.equal(read(dir, OUT), atA.text, `the file holds the JSONL of al export --at ${A}:\n${show(r)}`);
  assert.match(r.stdout, new RegExp(`^Wrote ${atA.n} rows to ${esc(OUT)}`, 'm'), show(r));
});

test('export with no --out: the JSONL on standard output, and no file is written', (t) => {
  const dir = baseProject(t);
  const r = writesNothing(dir, ['export']);
  const rows = parseRows(r.stdout);
  assert.ok(rows.length > 0, show(r));
  assert.ok(!exists(dir, OUT));
  assert.doesNotMatch(r.stdout, /^(Would write|Wrote) /m, show(r));
});
