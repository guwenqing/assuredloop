// Throwaway git projects for the v4 record tests (#175), and a runner for
// bin/al-v4.js. Nothing here reads the code under test: the tests use only the
// command, the files it writes and the YAML records.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';

export const REPO = fileURLToPath(new URL('../../../', import.meta.url));
export const BIN = join(REPO, 'bin/al-v4.js');

// "Now" for every run: 2026-05-04 09:30 UTC.
export const EPOCH = Date.UTC(2026, 4, 4, 9, 30, 0) / 1000;
export const DAY = '2026-05-04';
export const STAMP = '2026-05-04T09:30Z';
export const WORDS_FILE = `${DAY}-owner-words.md`;

export const sha = (text) => createHash('sha256').update(text).digest('hex');
export const HEX64 = /^[0-9a-f]{64}$/;

// The environment without anything that points git at another repo or config.
function cleanEnv(extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith('GIT_') && k !== 'SOURCE_DATE_EPOCH') env[k] = v;
  }
  return {
    ...env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Fixture Author',
    GIT_AUTHOR_EMAIL: 'author@example.invalid',
    GIT_AUTHOR_DATE: '2026-05-01T00:00:00Z',
    GIT_COMMITTER_NAME: 'Fixture Committer',
    GIT_COMMITTER_EMAIL: 'committer@example.invalid',
    GIT_COMMITTER_DATE: '2026-05-01T00:00:00Z',
    ...extra,
  };
}

export function git(dir, ...args) {
  const r = spawnSync('git', args, { cwd: dir, env: cleanEnv(), encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${dir}:\n${r.stderr}`);
  return r.stdout.trim();
}

// A fresh git repo in a temp dir, removed when the test ends.
export function project(t, { branch = 'main' } = {}) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q', '-b', branch);
  git(dir, 'config', 'user.name', 'Fixture Author');
  git(dir, 'config', 'user.email', 'author@example.invalid');
  git(dir, 'config', 'commit.gpgsign', 'false');
  return dir;
}

export function commitAll(dir, message = 'commit') {
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', message);
  return git(dir, 'rev-parse', 'HEAD');
}

export function write(dir, rel, text) {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
}
export const read = (dir, rel) => readFileSync(join(dir, rel), 'utf8');
export const exists = (dir, rel) => existsSync(join(dir, rel));
export const readYaml = (dir, rel) => parse(read(dir, rel));
export const writeYaml = (dir, rel, value) => write(dir, rel, stringify(value));
export function move(dir, from, to) {
  mkdirSync(dirname(join(dir, to)), { recursive: true });
  renameSync(join(dir, from), join(dir, to));
}

// Every file under dir except .git, as {path: content}; a symlink as its target, not followed.
export function tree(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const p = join(d, e.name);
      if (e.isSymbolicLink()) out[relative(dir, p)] = `symlink:${readlinkSync(p)}`;
      else if (e.isDirectory()) walk(p);
      else out[relative(dir, p)] = readFileSync(p).toString('base64');
    }
  };
  walk(dir);
  return out;
}

// One run of `node bin/al-v4.js ...args` in dir, with the fixed clock.
export function al(dir, args, { input = '', env = {} } = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    cwd: dir,
    env: cleanEnv({ SOURCE_DATE_EPOCH: String(EPOCH), ...env }),
    input,
    encoding: 'utf8',
    timeout: 30_000,
  });
  return { code: r.status, signal: r.signal, stdout: r.stdout ?? '', stderr: r.stderr ?? '', args };
}

export const show = (r) =>
  `al-v4 ${r.args.join(' ')} -> exit ${r.code} (signal ${r.signal})\n--- stdout\n${r.stdout}--- stderr\n${r.stderr}`;

// Exit 0.
export function ok(dir, args, opts) {
  const r = al(dir, args, opts);
  assert.equal(r.code, 0, show(r));
  return r;
}

// Exit 0 and nothing written (a preview, or nothing to do).
export function writesNothing(dir, args, opts) {
  const before = tree(dir);
  const r = ok(dir, args, opts);
  assert.deepEqual(tree(dir), before, `nothing may be written:\n${show(r)}`);
  return r;
}

// Exit 2, an "al: " line on stdout, and nothing written.
export function refused(dir, args, opts) {
  const before = tree(dir);
  const r = al(dir, args, opts);
  assert.equal(r.code, 2, show(r));
  assert.match(r.stdout, /^al: /m, show(r));
  assert.deepEqual(tree(dir), before, `a refusal writes nothing:\n${show(r)}`);
  return r;
}

export const index = (dir, ...extra) => ok(dir, ['index', ...extra]);

// --- records

export const recordPath = (name) => `.assuredloop/records/requests/${name}.yaml`;
export const record = (dir, name) => readYaml(dir, recordPath(name));
export const docRecordPath = (doc) => `.assuredloop/records/${doc}.yaml`;
export const docRecord = (dir, doc) => readYaml(dir, docRecordPath(doc));

export function paragraph(dir, doc, id) {
  const p = (docRecord(dir, doc).paragraphs ?? []).find((x) => x.id === id);
  assert.ok(p, `${id} is in the record of ${doc}`);
  return p;
}
// A paragraph's text_sha256, as the per-doc record holds it.
export const hashOf = (dir, doc, id) => paragraph(dir, doc, id).text_sha256;

export const bindingsOf = (rec, from, link, to) =>
  (rec.bindings ?? []).filter((b) => b.holder === from && b.link === link && b.target === to);

// The one binding of (from, link, to).
export function binding(rec, from, link, to) {
  const found = bindingsOf(rec, from, link, to);
  assert.equal(found.length, 1, `one binding ${from} ${link} ${to}; bindings:\n${stringify(rec.bindings)}`);
  return found[0];
}

export function editRecord(dir, name, change) {
  const rec = record(dir, name);
  change(rec);
  writeYaml(dir, recordPath(name), rec);
}

// --- docs

export function writeConfig(dir, docs = [{ file: 'specs/invoices.md', prefix: 'INV' }], extra = {}) {
  writeYaml(dir, '.assuredloop/config.yaml', { docs, ...extra });
}

// A doc from [marker, text] pairs: each paragraph is its marker, a blank line,
// its text; a blank line between paragraphs.
export const doc = (paras) => paras.map(([m, text]) => `<!-- ${m} -->\n\n${text}\n`).join('\n');

// --- requests

// `al-v4 new <name>` with the words on standard input.
export function newRequest(dir, name, words = `The owner wants ${name}.\n`, extra = []) {
  ok(dir, ['new', name, '--from', '-', ...extra], { input: words });
  return words;
}

// A requirement: its text (what its sha256 is of) and its block in request.md.
export function req(id, title, body, from = []) {
  const text = `### ${id} ${title}\n${body}\n`;
  const marker = `<!-- ${id}${from.length ? ` from:${from.join(',')}` : ''} -->`;
  return { id, title, text, sha256: sha(text), block: `${marker}\n\n${text}` };
}

// The organized section: heading, intro, the requirement blocks, an optional tail.
export function organized(reqs, { heading = '## Organized requirement', intro = 'What the owner wants.', tail = '' } = {}) {
  return `${heading}\n\n${intro}\n\n${reqs.map((r) => r.block).join('\n')}${tail}`;
}

// The signed text, by the rule of interface.md: the section from its heading
// up to the next # or ## heading (here: the end of the file), with any
// "Signed off:" line left out, and the marker framing left out (decision D20,
// as design.md 5 does for paragraphs): a marker line and the one blank line
// right after it. Line endings made \n.
export function signedText(section) {
  const ls = section.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  for (let i = 0; i < ls.length; i++) {
    if (ls[i].startsWith('Signed off:')) continue;
    if (/^<!--.*-->\s*$/.test(ls[i])) {
      if (ls[i + 1] === '') i++;
      continue;
    }
    out.push(ls[i]);
  }
  return out.join('\n');
}

// The organized section of request.md as it is now, when it is the last section.
export function sectionNow(dir, name, heading = '## Organized requirement') {
  const md = read(dir, `requests/${name}/request.md`);
  const at = md.indexOf(`${heading}\n`);
  assert.ok(at >= 0, `request.md has ${heading}`);
  return md.slice(at);
}

// Puts the section at the end of request.md (after what `new` wrote).
export function appendSection(dir, name, section) {
  const path = `requests/${name}/request.md`;
  let md = read(dir, path);
  if (!md.endsWith('\n')) md += '\n';
  write(dir, path, `${md}\n${section}`);
}

// Replaces text in request.md (must occur once).
export function editRequest(dir, name, from, to) {
  const path = `requests/${name}/request.md`;
  const md = read(dir, path);
  assert.equal(md.split(from).length, 2, `request.md has "${from}" once`);
  write(dir, path, md.replace(from, to));
}

// A snapshot in origin/: its header lines and its text.
export function parseSnapshot(content) {
  const m = content.match(/^([\s\S]*?)\n(---|--- signed text ---)\n([\s\S]*)$/);
  assert.ok(m, `a snapshot with a header and a --- line:\n${content}`);
  return { header: m[1].split('\n'), separator: m[2], text: m[3] };
}

export function assertSnapshot(content, { source, text, fetched, signoff = false, words }) {
  const s = parseSnapshot(content);
  assert.equal(s.header[0], `Source: ${source}`, content);
  assert.ok(s.header.includes(`Fetched: ${fetched}`), `Fetched: ${fetched}\n${content}`);
  const shaLine = s.header.find((l) => l.startsWith('SHA-256: '));
  assert.ok(shaLine, `a SHA-256 line\n${content}`);
  assert.equal(shaLine.slice(9, 73), sha(text), content);
  assert.equal(s.separator, signoff ? '--- signed text ---' : '---', content);
  assert.equal(s.text, text, 'the text, byte for byte');
  if (words === undefined) assert.ok(!s.header.some((l) => l.startsWith("Owner's words:")), content);
  else assert.ok(s.header.includes(`Owner's words: ${words}`), content);
}

// --- a common base: config and specs/invoices.md committed on main, then a
// branch `feature`, so what a test adds after it is new at the base.
export const INVOICES = doc([
  ['INV-1 note', '# Invoices'],
  ['INV-12 data', 'An invoice has a number, a customer, lines, a total and a paid date.'],
  ['INV-13 rule', 'An invoice MUST have at least one line.'],
  ['INV-41 rule', 'The export link MUST expire 30 minutes after the email is sent.'],
]);
export const ADR3 = `Status: accepted\n\n${doc([
  ['ADR-3 choice', '# ADR-3: Signed links'],
  ['ADR-3-1 rationale', 'Context: a link must not be guessed.'],
])}`;

export function baseProject(t, { branch = 'feature', adr = true } = {}) {
  const dir = project(t);
  writeConfig(dir);
  write(dir, 'specs/invoices.md', INVOICES);
  if (adr) write(dir, 'specs/adr/0003-signed-links.md', ADR3);
  commitAll(dir, 'base');
  if (branch) git(dir, 'checkout', '-q', '-b', branch);
  return dir;
}

// Replaces text in a file (must occur once).
export function editFile(dir, path, from, to) {
  const text = read(dir, path);
  assert.equal(text.split(from).length, 2, `${path} has "${from}" once`);
  write(dir, path, text.replace(from, to));
}
