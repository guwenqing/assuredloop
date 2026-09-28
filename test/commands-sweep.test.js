// The seven commands, and the --yes rule over every command that changes
// files [TL-1]: new, context, spec, check, record, consolidate and conclude
// are accepted, an unknown command exits 2; new writes without --yes; every
// other form that writes (record origin --url and --verify, record signoff,
// decision, part and section, with --builds-on and --accept, spec --add-ids,
// consolidate and --revert, conclude and --dropped) shows what it would write
// and leaves the working tree byte for byte as it was without --yes, and
// writes with it. A usage error writes nothing and exits 2, even with --yes.
// This is the one place that checks the whole list; the single cases live
// with each command's own tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { makeRepo, runAl } from './helpers/fixture.js';
import { assertFrame } from './helpers/output.js';
import { block } from './helpers/change.js';
import { ENV, ORG, addRequest, both } from './helpers/request.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const INV1B = '## [INV-1] Totals\nTotals MUST show two decimals, rounded half up.\n';
const INV1C = '## [INV-1] Totals\nTotals MUST show the currency\'s decimals.\n';
const INV2 = '## [INV-2] Format\nThe export format is CSV.\n';
const S0 = '## [INV-3] Dates\nDates show in the customer\'s local format.\n';
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const INV4A = '## [INV-4] Separator\nThe CSV separator is a comma.\n';
const INV4B = '## [INV-4] Separator\nThe CSV separator MUST be a semicolon.\n';
const INV5 = '## [INV-5] Cancelling\nAn invoice can be cancelled.\n';
const INV7 = '## [INV-7] CSV export\nA customer MUST be able to export one invoice as CSV.\n';
const INV9 = '## [INV-9] Export name\nThe file MUST be named after the invoice number.\n';
const WORDS_AGAIN = 'Customers keep asking to download their invoices, as PDF too.\n';

// One committed repo where every form below would succeed:
// - specs/invoices.md: INV-1 (C, under acc's block), INV-2, INV-3 (S0),
//   INV-4, INV-5, INV-7 and INV-9; specs/notes.md with a heading and no ID;
// - inv, signed: INV-3 pending (consolidate), INV-7 added and consolidated
//   (--revert); INV-5 held by no one (record section), INV-4 held by prior;
// - prior, signed: INV-4 pending (--builds-on prior);
// - acc, signed: INV-1 differs, its baseline changed underneath (--accept);
// - done, signed: INV-9 added and consolidated (conclude);
// - gone, unsigned: INV-2 with no change yet, so it retains nothing, and D4
//   "Drop this request." (conclude --dropped D4);
// - draft, unsigned, holding nothing (record signoff).
function setup(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', [INV1C, INV2, S0, INV4A, INV5, INV7, INV9].join('\n'));
  repo.write('specs/notes.md', '## [NTE-1] Scope\nNotes on invoices.\n\n## Unnumbered\nA heading with no ID.\n');
  addRequest(repo, 'inv', [
    block('[INV-3]@1 modify   for R2', { was: S0, now: S1 }),
    block('[INV-7]@1 add after [INV-5]   for R1', { now: INV7 }),
  ]);
  addRequest(repo, 'prior', [block('[INV-4]@1 modify', { was: INV4A, now: INV4B })]);
  addRequest(repo, 'acc', [block('[INV-1]@1 modify   for R1', { was: INV1, now: INV1B })]);
  addRequest(repo, 'done', [block('[INV-9]@1 add after [INV-7]   for R1', { now: INV9 })]);
  addRequest(repo, 'gone', [block('[INV-2]@1 modify', { was: INV2, now: INV2 })], { signed: false });
  addRequest(repo, 'draft', null, { signed: false, decisions: '' });
  repo.commit('setup', { date: '2026-09-21T12:00:00Z' });
  return repo;
}

// Every file-changing form but new: [label, args, stdin, a path it writes with --yes].
const FORMS = [
  ['record origin --url', ['record', 'inv', 'origin', '--url', 'https://example.com/issue/31', '--from', '-'], 'Please add a PDF export.\n', 'requests/inv/origin/'],
  ['record origin --verify (changed)', ['record', 'inv', 'origin', '--verify', '2026-09-20-owner-words.md', '--from', '-'], WORDS_AGAIN, 'requests/inv/origin/'],
  ['record signoff', ['record', 'draft', 'signoff', '--source', 'chat with the owner', '--words', '"Signed"'], '', 'requests/draft/origin/'],
  ['record decision', ['record', 'inv', 'decision', '--source', 'the owner', '--text', 'Keep the CSV header in English.'], '', 'requests/inv/request.md'],
  ['record part', ['record', 'inv', 'part', '--text', 'Date format'], '', 'requests/inv/request.md'],
  ['record section', ['record', 'inv', 'section', 'INV-5'], '', 'requests/inv/change.md'],
  ['record section --builds-on', ['record', 'inv', 'section', 'INV-4', '--builds-on', 'prior'], '', 'requests/inv/change.md'],
  ['record section --accept', ['record', 'acc', 'section', 'INV-1', '--accept'], '', 'requests/acc/change.md'],
  ['spec --add-ids', ['spec', '--add-ids', 'specs/notes.md', '--prefix', 'NTE'], '', 'specs/notes.md'],
  ['consolidate', ['consolidate', 'inv'], '', 'specs/invoices.md'],
  ['consolidate --revert', ['consolidate', 'inv', '--revert', 'INV-7'], '', 'specs/invoices.md'],
  ['conclude', ['conclude', 'done'], '', 'requests/archive/done/request.md'],
  ['conclude --dropped', ['conclude', 'gone', '--dropped', 'D4'], '', 'requests/archive/gone/request.md'],
];

const run = (repo, args, input) => runAl(repo.dir, args, { input, env: ENV });

// Every file under the repo, .git left out, as { path: bytes }.
function tree(dir) {
  const out = {};
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (d === dir && name === '.git') continue;
      if (statSync(p).isDirectory()) walk(p);
      else out[relative(dir, p)] = readFileSync(p).toString('base64');
    }
  };
  walk(dir);
  return out;
}
const status = (repo) => repo.git(['status', '--porcelain', '--untracked-files=all', '--ignored']);

test('[TL-1] every file-changing form but new, without --yes, exits 0 and leaves the working tree byte for byte as it was: git status empty, nothing untracked, every file the same', (t) => {
  const repo = setup(t);
  const before = tree(repo.dir);
  for (const [label, args, input] of FORMS) {
    const r = run(repo, args, input);
    assert.equal(r.code, 0, `${label}: without --yes it should show what it would write, exit 0:\n${both(r)}`);
    assertFrame(r.stdout);
    assert.equal(status(repo), '', `${label}: nothing should be written without --yes`);
    assert.deepEqual(tree(repo.dir), before, `${label}: every file should be as it was`);
  }
});

test('[TL-1] the same forms with --yes write: each, on a fresh copy of the fixture, exits 0 and writes its own file', (t) => {
  for (const [label, args, input, path] of FORMS) {
    const repo = setup(t);
    const r = run(repo, [...args, '--yes'], input);
    assert.equal(r.code, 0, `${label} --yes:\n${both(r)}`);
    const st = status(repo);
    assert.ok(st.split('\n').some((l) => l.trim().replace(/^\S+\s+/, '').startsWith(path)), `${label} --yes should write ${path}:\n${st}`);
  }
});

test('[TL-1] a usage error writes nothing and exits 2, even with --yes: each form with an unknown option', (t) => {
  const repo = setup(t);
  for (const [label, args, input] of FORMS) {
    const r = run(repo, [...args, '--no-such-option', '--yes'], input);
    assert.equal(r.code, 2, `${label} with an unknown option:\n${both(r)}`);
    assert.equal(status(repo), '', `${label}: nothing should be written`);
  }
});

test('[TL-1] new writes without --yes: the request folder with request.md and the owner\'s words, from standard input', (t) => {
  const repo = makeRepo(t);
  const r = run(repo, ['new', 'pdf-export', '--from', '-'], 'Please add a PDF export.\n');
  assert.equal(r.code, 0, both(r));
  assert.ok(readdirSync(join(repo.dir, 'requests/pdf-export')).includes('request.md'), 'request.md should be written');
  assert.equal(readdirSync(join(repo.dir, 'requests/pdf-export/origin')).length, 1, 'the owner\'s words should be written as one snapshot');
});

test('[TL-1] new writes without --yes: from a file', (t) => {
  const repo = makeRepo(t);
  repo.write('words.txt', 'Please add a PDF export.\n');
  const r = run(repo, ['new', 'pdf-export', '--from', 'words.txt']);
  assert.equal(r.code, 0, both(r));
  assert.ok(readdirSync(join(repo.dir, 'requests/pdf-export')).includes('request.md'), 'request.md should be written');
});

test('[TL-1] the seven commands are accepted: new, context, spec, check, record, consolidate and conclude each exit 0 on the fixture', (t) => {
  const repo = setup(t);
  const seven = {
    new: [['new', 'pdf-export', '--from', '-'], 'Please add a PDF export.\n'],
    context: [['context']],
    spec: [['spec']],
    check: [['check']],
    record: [['record', 'inv', 'part', '--text', 'Date format']],
    consolidate: [['consolidate', 'inv']],
    conclude: [['conclude', 'done']],
  };
  assert.equal(Object.keys(seven).length, 7);
  for (const [name, [args, input]] of Object.entries(seven)) {
    const r = run(repo, args, input);
    assert.equal(r.code, 0, `${name}:\n${both(r)}`);
    assertFrame(r.stdout);
  }
});

test('[TL-1] an unknown command exits 2 and writes nothing; so does no command at all', (t) => {
  const repo = setup(t);
  for (const args of [['frobnicate'], ['frobnicate', 'inv', '--yes'], ['records', 'inv', 'part', '--text', 'x', '--yes'], []]) {
    const r = run(repo, args);
    assert.equal(r.code, 2, `${JSON.stringify(args)}:\n${both(r)}`);
    assert.equal(status(repo), '', `${JSON.stringify(args)}: nothing should be written`);
  }
});
