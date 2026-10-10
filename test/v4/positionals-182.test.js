// Issue #182: `al-v4 new --tier 1d`, and every v4 command refuses a
// positional argument that it does not use (design.md 7 and 13). Written from
// the requirement and the public command only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INVOICES, WORDS_FILE, appendSection, baseProject, commitAll, doc, exists, newRequest, ok, organized, project, read, record,
  recordPath, refused, req, show, tree, write, writeConfig,
} from './helpers/project.js';

const WORDS = 'Fix the name of the export component.\n';

// A refusal (exit 2, an "al: " line, nothing written) whose "al: " line names `word`.
function refusedNaming(dir, args, word, opts) {
  const r = refused(dir, args, opts);
  const lines = r.stdout.split('\n').filter((l) => l.startsWith('al: '));
  assert.ok(lines.some((l) => l.includes(word)), `an "al: " line names ${JSON.stringify(word)}:\n${show(r)}`);
  return r;
}

// The same command, without the extra argument, succeeds and writes something.
function okAndWrites(dir, args, opts) {
  const before = tree(dir);
  const r = ok(dir, args, opts);
  assert.notDeepEqual(tree(dir), before, `the command writes without the extra argument:\n${show(r)}`);
  return r;
}

// --- tier 1d

test('new --tier 1d writes the request as for any tier: "Tier: 1d" in request.md, tier \'1d\' as a string', (t) => {
  const dir = project(t);
  ok(dir, ['new', 'rename-exporter', '--from', '-', '--tier', '1d'], { input: WORDS });
  const md = read(dir, 'requests/rename-exporter/request.md');
  assert.match(md, /^Tier: 1d · Status: open$/m, md);
  const rec = record(dir, 'rename-exporter');
  assert.equal(typeof rec.tier, 'string');
  assert.equal(rec.tier, '1d');
  assert.equal(rec.status, 'open');
  assert.ok(exists(dir, `requests/rename-exporter/origin/${WORDS_FILE}`), 'the snapshot of the words');
  assert.match(read(dir, recordPath('rename-exporter')), /^tier: ['"]1d['"]$/m, 'the YAML holds the tier as a quoted string');
});

test('new --tier 1d writes the same files as --tier 1, apart from the tier', (t) => {
  const one = project(t);
  const oneD = project(t);
  ok(one, ['new', 'fix-names', '--from', '-', '--tier', '1'], { input: WORDS });
  ok(oneD, ['new', 'fix-names', '--from', '-', '--tier', '1d'], { input: WORDS });
  assert.deepEqual(Object.keys(tree(oneD)).sort(), Object.keys(tree(one)).sort(), 'the same files');
  assert.equal(read(oneD, 'requests/fix-names/request.md'),
    read(one, 'requests/fix-names/request.md').replace('Tier: 1 · Status: open', 'Tier: 1d · Status: open'));
  assert.deepEqual(record(oneD, 'fix-names'), { ...record(one, 'fix-names'), tier: '1d' });
});

test('new still refuses a bad tier other than 1d', (t) => {
  const dir = project(t);
  for (const tier of ['4', 'x', '0', '1e', '1dd', 'd']) {
    refused(dir, ['new', 'tiered', '--from', '-', '--tier', tier], { input: WORDS });
  }
});

// --- extra positionals: new and record

test('new refuses an extra positional and names it; without it, new writes the request', (t) => {
  const dir = project(t);
  refusedNaming(dir, ['new', 'inv', 'stray-word', '--from', '-'], 'stray-word', { input: WORDS });
  refusedNaming(dir, ['new', 'inv', '--from', '-', '--tier', '2', 'stray-word'], 'stray-word', { input: WORDS });
  assert.ok(!exists(dir, 'requests/inv'));
  okAndWrites(dir, ['new', 'inv', '--from', '-', '--tier', '2'], { input: WORDS });
  assert.equal(record(dir, 'inv').tier, '2');
});

test('new with two extra positionals names the first one', (t) => {
  const dir = project(t);
  refusedNaming(dir, ['new', 'inv', 'first-stray', 'second-stray', '--from', '-'], 'first-stray', { input: WORDS });
});

test('record decision refuses a --text split by the shell, names the first lost word, and writes nothing', (t) => {
  const dir = project(t);
  newRequest(dir, 'inv');
  const args = ['record', 'inv', 'decision', '--source', 'owner', '--text', 'Links', 'expire', 'quickly', '--yes'];
  refusedNaming(dir, args, 'expire');
  assert.deepEqual(record(dir, 'inv').decisions, [], 'no decision recorded');
  assert.doesNotMatch(read(dir, 'requests/inv/request.md'), /## Decisions/);

  okAndWrites(dir, ['record', 'inv', 'decision', '--source', 'owner', '--text', 'Links expire quickly', '--yes']);
  assert.deepEqual(record(dir, 'inv').decisions.map((d) => d.text), ['Links expire quickly']);
});

test('record decision without --yes refuses an extra positional too', (t) => {
  const dir = project(t);
  newRequest(dir, 'inv');
  refusedNaming(dir, ['record', 'inv', 'decision', 'stray-word', '--source', 'owner', '--text', 'Short.'], 'stray-word');
  ok(dir, ['record', 'inv', 'decision', '--source', 'owner', '--text', 'Short.']);
});

test('record origin refuses an extra positional and names it; without it, origin writes the snapshot', (t) => {
  const dir = project(t);
  newRequest(dir, 'inv');
  const URL = 'https://example.com/notes';
  const MORE = 'Also, the link should not work forever.\n';
  refusedNaming(dir, ['record', 'inv', 'origin', 'stray-word', '--url', URL, '--from', '-', '--yes'], 'stray-word',
    { input: MORE });
  refusedNaming(dir, ['record', 'inv', 'origin', '--url', URL, '--from', '-', '--yes', 'stray-word'], 'stray-word',
    { input: MORE });
  assert.equal(record(dir, 'inv').sources.length, 1);

  okAndWrites(dir, ['record', 'inv', 'origin', '--url', URL, '--from', '-', '--yes'], { input: MORE });
  assert.equal(record(dir, 'inv').sources.length, 2);
});

test('record signoff refuses an extra positional and names it; without it, signoff writes the sign-off', (t) => {
  const dir = project(t);
  newRequest(dir, 'inv');
  const R1 = req('R1', 'Monthly CSV download', 'A user MUST be able to download one month as one CSV file.', [WORDS_FILE]);
  appendSection(dir, 'inv', organized([R1]));
  const SOURCE = 'email from the owner, 2026-05-04';
  refusedNaming(dir, ['record', 'inv', 'signoff', '--source', SOURCE, 'stray-word', '--yes'], 'stray-word');
  assert.deepEqual(record(dir, 'inv').signoff, []);

  okAndWrites(dir, ['record', 'inv', 'signoff', '--source', SOURCE, '--yes']);
  assert.deepEqual(record(dir, 'inv').signoff.map((s) => s.id), ['S1']);
});

// --- extra positionals: index, check, export

test('index refuses an extra positional and names it; without it, index writes the doc records', (t) => {
  const dir = baseProject(t);
  newRequest(dir, 'inv');
  refusedNaming(dir, ['index', 'stray-word'], 'stray-word');
  okAndWrites(dir, ['index']);
});

test('check refuses an extra positional and names it; without it, check runs', (t) => {
  const dir = baseProject(t);
  refusedNaming(dir, ['check', 'stray-word'], 'stray-word');
  refusedNaming(dir, ['check', '--strict', 'stray-word'], 'stray-word');
  ok(dir, ['check']);
});

test('export refuses an extra positional and names it; without it, export --out writes the file', (t) => {
  const dir = baseProject(t);
  refusedNaming(dir, ['export', 'stray-word'], 'stray-word');
  refusedNaming(dir, ['export', 'stray-word', '--out', 'export.jsonl'], 'stray-word');
  assert.ok(!exists(dir, 'export.jsonl'));
  okAndWrites(dir, ['export', '--out', 'export.jsonl']);
  assert.ok(exists(dir, 'export.jsonl'));
});

// --- guard: spec and search take any number of positionals

test('spec with two doc paths and search with several words are not refused', (t) => {
  const dir = project(t);
  writeConfig(dir, [{ file: 'specs/invoices.md', prefix: 'INV' }, { file: 'specs/refunds.md', prefix: 'REF' }]);
  write(dir, 'specs/invoices.md', INVOICES);
  write(dir, 'specs/refunds.md', doc([['REF-1 note', '# Refunds'], ['REF-2 rule', 'A refund MUST name its invoice.']]));
  commitAll(dir, 'docs');
  const s = ok(dir, ['spec', 'specs/invoices.md', 'specs/refunds.md']);
  assert.ok(s.stdout.includes('INV-41') && s.stdout.includes('REF-2'), show(s));
  const q = ok(dir, ['search', 'export', 'link', 'email']);
  assert.ok(q.stdout.includes('INV-41'), show(q));
});
