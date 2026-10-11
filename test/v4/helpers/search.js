// Helpers for the tests of `al export` and `al search` (#181, T13 and T14).
// They use only the public commands and the files the commands write. They
// never read src/v4/export.js or the search code. Level 2 runs with a
// stand-in @huggingface/transformers (#212): see installEmbedder.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import {
  BIN, EPOCH, REPO, appendSection, commitAll, doc, docRecordPath, editRecord, git, hashOf, index, move, newRequest, ok,
  organized, project, read, readYaml, req, sha, write, writeConfig, writeYaml,
} from './project.js';

export { REPO, sha };

// Every field of an export row (interface.md, Row fields), `hints` apart.
export const ROW_FIELDS = [
  'repo', 'doc_or_request', 'id', 'version', 'role', 'source_type', 'file', 'line', 'heading_path', 'kind',
  'serves', 'builds_on', 'changes', 'valid_from', 'superseded_by', 'commit', 'sha256', 'text',
];
export const ROLES = ['baseline', 'proposal', 'spike', 'source', 'evidence', 'history'];
export const SOURCE_TYPES = ['spec', 'adr', 'change', 'spike', 'requirement', 'question', 'decision', 'owner-words', 'signoff', 'result', 'output'];
export const FULL = /^[0-9a-f]{40}$/;

// The environment of one run: nothing that points git at another repo, and the fixed clock.
function cleanEnv(extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith('GIT_') && k !== 'SOURCE_DATE_EPOCH' && k !== 'NODE_OPTIONS') env[k] = v;
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
    SOURCE_DATE_EPOCH: String(EPOCH),
    ...extra,
  };
}

// One run of `node [nodeArgs] bin/al-v4.js ...args` in dir.
export function run(dir, args, { nodeArgs = [], env = {}, timeout = 120_000 } = {}) {
  const r = spawnSync(process.execPath, [...nodeArgs, BIN, ...args], {
    cwd: dir, env: cleanEnv(env), encoding: 'utf8', timeout, maxBuffer: 1 << 28,
  });
  return { code: r.status, signal: r.signal, stdout: r.stdout ?? '', stderr: r.stderr ?? '', args, nodeArgs };
}

export const show = (r) =>
  `node ${r.nodeArgs.join(' ')} al-v4 ${r.args.join(' ')} -> exit ${r.code} (signal ${r.signal})\n--- stdout\n${r.stdout.slice(0, 4000)}--- stderr\n${r.stderr.slice(0, 4000)}`;

export function runOk(dir, args, opts) {
  const r = run(dir, args, opts);
  assert.equal(r.code, 0, show(r));
  return r;
}

// Exit 2 with an `al: ` line.
export function runRefused(dir, args, opts) {
  const r = run(dir, args, opts);
  assert.equal(r.code, 2, show(r));
  assert.match(r.stdout, /^al: /m, show(r));
  return r;
}

// The rows of `al export` on standard output: one JSON object per line, nothing else.
export function parseRows(stdout) {
  assert.ok(stdout.endsWith('\n') || stdout === '', 'the JSONL ends with a line break');
  return stdout.split('\n').filter((l, i, a) => !(l === '' && i === a.length - 1)).map((l, i) => {
    try { return JSON.parse(l); } catch { assert.fail(`line ${i + 1} of the export is not JSON: ${l.slice(0, 200)}`); }
    return null;
  });
}

export function exportRows(dir, extra = [], opts) {
  const r = runOk(dir, ['export', ...extra], opts);
  return { rows: parseRows(r.stdout), stdout: r.stdout };
}

// `al search ... --json`; `level` 0 or 1 adds `--level n`; level 2 adds nothing.
export function search(dir, args, { level, nodeArgs = [], timeout } = {}) {
  const lv = level === undefined || level === 2 ? [] : ['--level', String(level)];
  const r = runOk(dir, ['search', ...args, ...lv, '--json'], { nodeArgs, timeout });
  let out;
  try { out = JSON.parse(r.stdout); } catch { assert.fail(`--json gives one JSON object and nothing else:\n${show(r)}`); }
  return out;
}

export const key = (r) => `${r.repo}\t${r.doc_or_request}\t${r.id}\t${r.version}`;
export const rowsOf = (rows, id) => rows.filter((r) => r.id === id);
export function oneRow(rows, id, version) {
  const found = rows.filter((r) => r.id === id && (version === undefined || r.version === version));
  assert.equal(found.length, 1, `one row ${id}${version === undefined ? '' : ` v${version}`}; rows of ${id}: ${JSON.stringify(rowsOf(rows, id).map((r) => [r.version, r.role, r.text.slice(0, 60)]))}`);
  return found[0];
}

// A hit without the search's own fields: the export row it shows.
export const asRow = (hit) => {
  const { rank: _r, exact: _e, section: _s, ...row } = hit;
  return row;
};

export const head = (dir) => git(dir, 'rev-parse', 'HEAD');

// --- level 2: a fixed test embedder, as a stand-in @huggingface/transformers

// al's model, its pinned revision, and the Level line at level 2 (#212).
// The model name is al's own: a stand-in cannot change it.
export const TRANSFORMERS = '@huggingface/transformers';
export const TRANSFORMERS_VERSION = '4.3.1';
export const MODEL = 'Xenova/bge-small-en-v1.5';
export const REVISION = 'ea104dacec62c0de699686887e3f920caeb4f3e3';
export const LEVEL2_LINE = `Level     2 (hybrid: full text and ${MODEL}@${REVISION.slice(0, 12)})`;
export const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';

// The fixed embedder: one dimension per concept, from words in the text, and
// one small constant dimension so that no vector is zero.
export const CONCEPTS = [
  '\\b(link|links|url|urls)\\b',
  '\\b(invoice|invoices|bill|bills)\\b',
  '\\b(remind|reminder|reminders)\\b',
  '\\b(csv|spreadsheet|spreadsheets)\\b',
  '\\b(token|tokens)\\b',
];

// Writes a stand-in @huggingface/transformers into the folder `pkg`
// (package.json and index.js). It has only what al uses: `pipeline(task,
// model, options)` gives an extractor; `await extractor(texts, options)`
// gives an object whose `tolist()` is one vector per text. With
// `normalize: true` each vector has unit length, as the real library gives.
// mode: 'ok', 'embed-throws' (the extractor throws) or 'load-throws' (the
// import throws).
// `log`: a file that gets one JSON line for each text the extractor is given.
// `calls`: a file that gets one JSON line for each call of pipeline and of
// the extractor, with its arguments (the texts as a count).
// `marker`: a file that gets one line each time the module is imported: the
// process id and al's arguments.
export function standIn(pkg, { mode = 'ok', log = null, calls = null, marker = null } = {}) {
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, 'package.json'), `${JSON.stringify({
    name: TRANSFORMERS, version: TRANSFORMERS_VERSION, private: true, description: 'a test stand-in',
    type: 'module', main: 'index.js', exports: './index.js',
  }, null, 2)}\n`);
  writeFileSync(join(pkg, 'index.js'), [
    "import { appendFileSync } from 'node:fs';",
    `const LOG = ${JSON.stringify(log)};`,
    `const CALLS = ${JSON.stringify(calls)};`,
    `const MARKER = ${JSON.stringify(marker)};`,
    "if (MARKER) appendFileSync(MARKER, `${process.pid} ${process.argv.slice(2).join(' ')}\\n`);",
    mode === 'load-throws' ? "throw new Error('test embedder: it does not load');" : '',
    `const CONCEPTS = ${JSON.stringify(CONCEPTS)}.map((s) => new RegExp(s, 'i'));`,
    'const vector = (t) => [...CONCEPTS.map((re) => (re.test(t) ? 1 : 0)), 0.1];',
    'const unit = (v) => { const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0)); return v.map((x) => x / n); };',
    'const call = (x) => { if (CALLS) appendFileSync(CALLS, `${JSON.stringify(x)}\\n`); };',
    'export async function pipeline(task, model, options) {',
    "  call({ call: 'pipeline', task, model, options: options ?? null });",
    '  return async (input, options) => {',
    '    const texts = Array.isArray(input) ? input : [input];',
    "    call({ call: 'extract', count: texts.length, options: options ?? null });",
    mode === 'embed-throws' ? "    throw new Error('test embedder: embed failed');" : '',
    "    if (LOG) appendFileSync(LOG, texts.map((t) => `${JSON.stringify(t)}\\n`).join(''));",
    '    const rows = texts.map((t) => (options?.normalize ? unit(vector(t)) : vector(t)));',
    '    return { tolist: () => rows };',
    '  };',
    '}',
    '',
  ].join('\n'));
  return pkg;
}

// Writes the stand-in into <dir>/node_modules/@huggingface/transformers/:
// the project's own copy, which al finds first.
export const installEmbedder = (dir, opts) => standIn(join(dir, 'node_modules', TRANSFORMERS), opts);

// The texts the fixed embedder was given, from its log.
export const embedded = (log) => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
export const clearLog = (log) => writeFileSync(log, '');
// The lines of a `calls` or `marker` file; none when it is absent.
export const callsOf = (file) => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
export const importsOf = (file) => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : []);

// True when @huggingface/transformers resolves beside al (from bin/). Then
// "not installed" cannot be shown with this al, and the real library is there.
export function besideAl() {
  try {
    createRequire(BIN).resolve(TRANSFORMERS);
    return true;
  } catch {
    return false;
  }
}

// --- the test world: a small central repo with every role

export const A_TEXT = {
  exp2v1: 'A user MUST be able to download the invoices of one month as one spreadsheet file.',
  exp2v2: 'A user MUST be able to download the invoices of one month as one CSV file with a header row.',
  exp4: 'The export link MUST expire 30 minutes after the email is sent.',
  exp5: 'Thirty minutes is long enough to open the email, and short enough that a forwarded link soon stops working.',
  exp7: 'Invoicer SHOULD send a reminder 7 days after the due date of an open invoice.',
  spikeSp2: 'Candidate A: the export link expires 10 minutes after the email is sent, and no reminder is sent.',
  remSp2: 'Invoicer MUST send one reminder email 7, 14 and 21 days after the due date of an unpaid invoice.',
  remSp3: 'A daily job finds each unpaid invoice whose due date was 7, 14 or 21 days ago and queues one reminder for it.',
  remSp4: 'Invoicer MAY send a reminder by text message.',
  remSp5: 'A reminder email MUST name the invoice number and the amount due.',
  oldSp2: 'Invoice numbers MUST be unique within one business, and a reminder never reuses one.',
  droppedSp2: 'A reminder MUST be sent by fax.',
  adr31: 'Context: a stored token can be cancelled early, which EXP-4 needs.',
};

export const EXPORTS_V1 = doc([
  ['EXP-1 note', '# Exports'],
  ['EXP-2 rule', A_TEXT.exp2v1],
  ['EXP-3 note', '## Export links'],
  ['EXP-4 rule', A_TEXT.exp4],
  ['EXP-5 rationale explains:EXP-4', A_TEXT.exp5],
  ['EXP-6 note', '## Overdue invoices'],
  ['EXP-7 rule', A_TEXT.exp7],
]);
export const EXPORTS_V2 = doc([
  ['EXP-1 note', '# Exports'],
  ['EXP-2 rule', A_TEXT.exp2v2],
  ['EXP-3 note', '## Export links'],
  ['EXP-4 rule', A_TEXT.exp4],
  ['EXP-6 note', '## Overdue invoices'],
  ['EXP-7 rule', A_TEXT.exp7],
]);

const adr = (status, paras) => `Status: ${status}\n\n${doc(paras)}`;

export const R1V1 = req('R1', 'Three reminders', 'Invoicer MUST send up to three reminders for an unpaid invoice, one week apart.');
export const R1V2 = req('R1', 'Three reminders', 'Invoicer MUST send one reminder 7, 14 and 21 days after the due date of an unpaid invoice.');
export const Q1 = req('Q1', 'A shorter link time', 'Can the link time be shorter without more support calls?');
export const OLD_R1 = req('R1', 'Unique numbers', 'Invoice numbers MUST be unique and MUST NOT be used again.');
export const D1_TEXT = 'A reminder goes by email only, never by text message.';
export const REMINDERS_JS = '// cites reminder-emails/SP-2: one reminder each week\nexport const reminderDays = [7, 14, 21];\n';

const result = (check, inputFile, inputText, note) => [
  `check: ${check}`, 'outcome: pass', 'commit: unknown', 'inputs:', `  - {file: ${inputFile}, sha256: ${sha(inputText)}}`, `note: ${note}`, '',
].join('\n');

// Builds the world in a new repo (cleaned up by `t.after`). Commits:
// A: config, specs/exports.md v1 and four ADRs (accepted, superseded,
//    accepted that supersedes, proposed);
// B: the requests (open reminder-emails, open spike link-spike, archived
//    old-numbers, abandoned dropped-idea), records, an output, two results,
//    and two hints (one fresh, one stale);
// C: EXP-2 replaced, EXP-5 removed, R1 of reminder-emails at version 2;
// D: a commit that changes nothing in scope.
// The fixed embedder is installed in node_modules (not committed) when `embedder` is set.
export function buildWorld(t, { embedder = null } = {}) {
  const dir = project(t);
  write(dir, '.gitignore', 'node_modules/\n');
  writeConfig(dir, [{ file: 'specs/exports.md', prefix: 'EXP' }], { repo: 'acme' });
  write(dir, 'specs/exports.md', EXPORTS_V1);
  write(dir, 'specs/adr/0001-csv-files.md', adr('accepted', [
    ['ADR-1 choice decides:EXP-2', '# ADR-1: Exports are CSV files'],
    ['ADR-1-1 rationale', 'Context: accountants import a CSV file into any bookkeeping tool.'],
  ]));
  write(dir, 'specs/adr/0002-signed-urls.md', adr('superseded', [
    ['ADR-2 choice decides:EXP-4', '# ADR-2: Export links are signed URLs'],
    ['ADR-2-1 rationale', 'Context: a signed URL carries its own expiry time in the query string.'],
  ]));
  write(dir, 'specs/adr/0003-one-time-tokens.md', adr('accepted', [
    ['ADR-3 choice decides:EXP-4 supersedes:ADR-2', '# ADR-3: Export links use one-time tokens'],
    ['ADR-3-1 rationale', A_TEXT.adr31],
  ]));
  write(dir, 'specs/adr/0004-zip-archives.md', adr('proposed', [
    ['ADR-4 choice', '# ADR-4: Yearly exports may be ZIP archives'],
    ['ADR-4-1 rationale', 'Context: a yearly archive keeps twelve monthly files together.'],
  ]));
  const A = commitAll(dir, 'A: the spec and the ADRs');

  // reminder-emails: open, tier 2, signed R1 v1, a decision, a change spec.
  newRequest(dir, 'reminder-emails', 'Customers forget to pay. Send them three reminders, a week apart, by email only.\n', ['--tier', '2']);
  appendSection(dir, 'reminder-emails', organized([R1V1]));
  ok(dir, ['record', 'reminder-emails', 'signoff', '--source', 'owner by email', '--words', 'yes, sign it', '--yes']);
  ok(dir, ['record', 'reminder-emails', 'decision', '--source', 'owner', '--text', D1_TEXT, '--yes']);
  write(dir, 'requests/reminder-emails/spec.md', doc([
    ['SP-1 note', '# Reminder emails: the change'],
    ['SP-2 rule serves:R1 changes:EXP-7', A_TEXT.remSp2],
    ['SP-3 flow serves:R1 builds-on:SP-2', A_TEXT.remSp3],
    ['SP-4 rule serves:R1', A_TEXT.remSp4],
    ['SP-5 rule serves:R1', A_TEXT.remSp5],
  ]));
  write(dir, 'src/reminders.js', REMINDERS_JS);
  editRecord(dir, 'reminder-emails', (rec) => {
    rec.outputs = [
      { file: 'src/reminders.js', implements: ['SP-2'] },
      { file: 'src/missing.js', implements: ['SP-3'] },
      { repo: 'acme-worker', file: 'src/worker.js', implements: ['SP-3'] },
    ];
    rec.dispositions = [
      { source: 'reminder-emails/SP-4', disposition: 'abandoned', reason: 'never applied' },
      { source: 'reminder-emails/SP-5', disposition: 'superseded', by: 'later-change/SP-1' },
    ];
  });
  write(dir, '.assuredloop/results/reminders-test.yaml',
    result('test/reminders.test.js', 'src/reminders.js', REMINDERS_JS, 'the reminder test passed on CI'));
  write(dir, '.assuredloop/results/csv-review.yaml',
    result('review of the CSV rule', 'specs/exports.md', EXPORTS_V1, 'a reminder to check the CSV header passed'));

  // link-spike: open, tier S, a signed question and one candidate.
  newRequest(dir, 'link-spike', 'Can the link be shorter? Support calls must not go up.\n', ['--tier', 'S']);
  appendSection(dir, 'link-spike', organized([Q1], { heading: '## Organized question' }));
  ok(dir, ['record', 'link-spike', 'signoff', '--source', 'owner in chat', '--words', 'yes that is the question', '--yes']);
  write(dir, 'requests/link-spike/spec.md', doc([
    ['SP-1 note', '# Link expiry spike'],
    ['SP-2 approach serves:Q1 builds-on:EXP-4', A_TEXT.spikeSp2],
  ]));

  // old-numbers: concluded and archived.
  newRequest(dir, 'old-numbers', 'Invoice numbers must never come back.\n', ['--tier', '2']);
  appendSection(dir, 'old-numbers', organized([OLD_R1]));
  write(dir, 'requests/old-numbers/spec.md', doc([
    ['SP-1 note', '# Old numbers'],
    ['SP-2 rule serves:R1', A_TEXT.oldSp2],
  ]));

  // dropped-idea: not archived, status abandoned.
  newRequest(dir, 'dropped-idea', 'Maybe send reminders by fax.\n', ['--tier', '2']);
  write(dir, 'requests/dropped-idea/spec.md', doc([
    ['SP-1 note', '# Dropped idea'],
    ['SP-2 rule', A_TEXT.droppedSp2],
  ]));
  index(dir);
  editRecord(dir, 'old-numbers', (rec) => { rec.status = 'concluded'; });
  editRecord(dir, 'dropped-idea', (rec) => { rec.status = 'abandoned'; });
  move(dir, 'requests/old-numbers', 'requests/archive/old-numbers');
  index(dir);

  // Hints in the per-doc record: fresh on EXP-4, stale on EXP-2.
  const path = docRecordPath('specs/exports.md');
  const docRec = readYaml(dir, path);
  for (const p of docRec.paragraphs) {
    if (p.id === 'EXP-4') p.hint = { basis_sha256: p.text_sha256, summary: 'An export link works for half an hour.', tags: ['links', 'expiry'] };
    if (p.id === 'EXP-2') p.hint = { basis_sha256: 'f'.repeat(64), summary: 'Monthly spreadsheet download.', tags: ['old'] };
  }
  writeYaml(dir, path, docRec);
  index(dir);
  const B = commitAll(dir, 'B: the requests, records, results and hints');

  write(dir, 'specs/exports.md', EXPORTS_V2);
  const md = read(dir, 'requests/reminder-emails/request.md');
  write(dir, 'requests/reminder-emails/request.md', md.replace(R1V1.text, R1V2.text));
  index(dir);
  const C = commitAll(dir, 'C: EXP-2 replaced, EXP-5 removed, R1 version 2');

  write(dir, 'notes.txt', 'Nothing in scope.\n');
  const D = commitAll(dir, 'D: a note out of scope');

  let log = null;
  if (embedder) {
    log = join(dir, '.git', 'embed-test.log');
    installEmbedder(dir, { ...embedder, log });
  }
  return { dir, A, B, C, D, log, hash: (file, id) => hashOf(dir, file, id) };
}

// Appends text to a file in dir (not committed).
export const appendTo = (dir, rel, text) => appendFileSync(join(dir, rel), text);

// A small repo: specs/exports.md (EXP-1 to EXP-5, as EXPORTS_V1 up to EXP-5)
// and one open request `links` with a change spec, committed once. The fixed
// embedder is installed (not committed) when `embedder` is set, with its log
// in the git dir.
export const SMALL_SPEC = doc([
  ['EXP-1 note', '# Exports'],
  ['EXP-2 rule', A_TEXT.exp2v2],
  ['EXP-3 note', '## Export links'],
  ['EXP-4 rule', A_TEXT.exp4],
  ['EXP-5 rationale explains:EXP-4', A_TEXT.exp5],
]);
export const SMALL_SP2 = 'The export link MUST offer a new link when an expired one is opened.';
export function smallRepo(t, { embedder = null } = {}) {
  const dir = project(t);
  write(dir, '.gitignore', 'node_modules/\n');
  writeConfig(dir, [{ file: 'specs/exports.md', prefix: 'EXP' }], { repo: 'acme' });
  write(dir, 'specs/exports.md', SMALL_SPEC);
  newRequest(dir, 'links', 'Expired links should offer a new one.\n', ['--tier', '2']);
  write(dir, 'requests/links/spec.md', doc([
    ['SP-1 note', '# Links: the change'],
    ['SP-2 rule changes:EXP-4', SMALL_SP2],
  ]));
  index(dir);
  const A = commitAll(dir, 'A');
  let log = null;
  if (embedder) {
    log = join(dir, '.git', 'embed-test.log');
    installEmbedder(dir, { ...embedder, log });
  }
  return { dir, A, log };
}

// The path of the search index, by git (interface.md, The index).
export const indexFile = (dir) => resolve(dir, git(dir, 'rev-parse', '--git-path', 'assuredloop'), 'search.sqlite');
