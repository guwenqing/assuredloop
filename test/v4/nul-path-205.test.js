// Issue #205: a path or name that holds a NUL byte reads as absent, in every
// reader of files at a commit (src/v4/git.js: readObjects, filesAt, fileAt,
// blobAt), and a result whose declared input is such a path shows
// "applicability unknown". Each NUL case has a clean control (the same path
// with no NUL), which reads as it does on main. Written before the code, from
// the issue and the interface note (interface-205.md), by a different author.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readObjects, filesAt, fileAt, blobAt } from '../../src/v4/git.js';
import { makeRepo } from './helpers/repo.js';
import { blobSha, centralConfig, commit, world, worldOutputs, ZIP_V1 } from './helpers/cross-repo.js';
import { al, baseProject, commitAll, git, sha, show, write, writeYaml } from './helpers/project.js';

// --- the readers

const FILES = { 'README.md': 'fixture\n', 'docs/a.md': 'a doc\n' };

function nulRepo(t) {
  const repo = makeRepo(t);
  repo.write('docs/a.md', FILES['docs/a.md']);
  const c = repo.commit('a doc');
  return { dir: repo.dir, c, blob: repo.git(['rev-parse', `${c}:README.md`]) };
}

// Paths with a NUL: after a file's name (alone or with more after it), in the
// middle, at the start, and the NUL alone. Their clean controls are FILES and
// a path that is not there.
const NUL_PATHS = ['README.md\0', 'README.md\0junk', 'docs/a.md\0x', 'docs\0/a.md', '\0README.md', '\0'];
const CLEAN_PATHS = ['README.md', 'docs/a.md', 'nope.md'];
const cleanText = (p) => FILES[p] ?? null;

describe('readers of files at a commit: a path or name with a NUL is absent', () => {
  test('readObjects: a name with a NUL is not in the Map', (t) => {
    const { dir, c, blob } = nulRepo(t);
    const names = [
      ...NUL_PATHS.map((p) => `${c}:${p}`), `${c}\0:README.md`, `\0${c}:README.md`, `${c}\0`, `${blob}\0`, `${blob}\0x`, `HEAD:README.md\0`,
    ];
    const got = readObjects(dir, names);
    for (const n of names) assert.ok(!got.has(n), `${JSON.stringify(n)} is not in the Map: ${got.get(n)}`);
    assert.equal(got.size, 0);
  });

  test('readObjects control: the same names with no NUL read as before', (t) => {
    const { dir, c, blob } = nulRepo(t);
    const got = readObjects(dir, [`${c}:README.md`, `${c}:docs/a.md`, `${c}:nope.md`, blob, `HEAD:README.md`]);
    assert.equal(got.get(`${c}:README.md`)?.toString(), FILES['README.md']);
    assert.equal(got.get(`${c}:docs/a.md`)?.toString(), FILES['docs/a.md']);
    assert.equal(got.get(blob)?.toString(), FILES['README.md']);
    assert.equal(got.get('HEAD:README.md')?.toString(), FILES['README.md']);
    assert.ok(!got.has(`${c}:nope.md`));
    assert.equal(got.size, 4);
  });

  const MIXED = (c, blob) => ({ nul: [`${c}:README.md\0`, `${c}:\0`, `${blob}\0`], clean: [`${c}:README.md`, `${c}:docs/a.md`, blob] });

  test('readObjects: NUL names beside clean names in one call are not in the Map', (t) => {
    const { dir, c, blob } = nulRepo(t);
    const { nul, clean } = MIXED(c, blob);
    const got = readObjects(dir, [...nul, ...clean]);
    for (const n of nul) assert.ok(!got.has(n), `${JSON.stringify(n)} is not in the Map: ${got.get(n)}`);
    assert.equal(got.size, clean.length);
  });

  test('readObjects control: clean names beside NUL names in one call read as before', (t) => {
    const { dir, c, blob } = nulRepo(t);
    const { nul, clean } = MIXED(c, blob);
    const got = readObjects(dir, [...nul, ...clean]);
    assert.deepEqual(clean.map((n) => got.get(n)?.toString()), [FILES['README.md'], FILES['docs/a.md'], FILES['README.md']]);
  });

  for (const encoding of ['utf8', null]) {
    const as = (text) => (text === null ? null : encoding === null ? Buffer.from(text) : text);
    test(`filesAt (encoding ${encoding}): a path with a NUL maps to null, alone and beside clean paths`, (t) => {
      const { dir, c } = nulRepo(t);
      const got = filesAt(dir, c, NUL_PATHS, encoding);
      assert.deepEqual([...got.keys()], NUL_PATHS);
      for (const p of NUL_PATHS) assert.equal(got.get(p), null, JSON.stringify(p));
      const mixed = filesAt(dir, c, [...NUL_PATHS, ...CLEAN_PATHS], encoding);
      for (const p of NUL_PATHS) assert.equal(mixed.get(p), null, JSON.stringify(p));
    });

    test(`filesAt (encoding ${encoding}) control: the same paths with no NUL, alone and beside the NUL paths`, (t) => {
      const { dir, c } = nulRepo(t);
      const got = filesAt(dir, c, [...NUL_PATHS, ...CLEAN_PATHS], encoding);
      for (const p of CLEAN_PATHS) assert.deepEqual(got.get(p), as(cleanText(p)), p);
      const alone = filesAt(dir, c, CLEAN_PATHS, encoding);
      for (const p of CLEAN_PATHS) assert.deepEqual(alone.get(p), as(cleanText(p)), p);
    });
  }

  test('fileAt and blobAt: null for a path with a NUL', (t) => {
    const { dir, c } = nulRepo(t);
    for (const p of NUL_PATHS) {
      assert.equal(fileAt(dir, c, p), null, `fileAt ${JSON.stringify(p)}`);
      assert.equal(blobAt(dir, c, p), null, `blobAt ${JSON.stringify(p)}`);
    }
  });

  test('fileAt and blobAt control: the same paths with no NUL', (t) => {
    const { dir, c } = nulRepo(t);
    for (const p of CLEAN_PATHS) {
      assert.equal(fileAt(dir, c, p), cleanText(p), `fileAt ${p}`);
      const bytes = blobAt(dir, c, p);
      if (cleanText(p) === null) assert.equal(bytes, null, `blobAt ${p}`);
      else assert.ok(Buffer.isBuffer(bytes) && bytes.equals(Buffer.from(cleanText(p))), `blobAt ${p}`);
    }
  });
});

// --- through the commands

// Each commit of each repo by name ({<repo>:<subject>}, {...:7} for its first
// 7), and each `extra` text (a path, wherever it is) by its name, as in
// check-speed-199.test.js.
function named(stdout, repos, extra = {}) {
  const names = new Map();
  for (const [repo, dir] of Object.entries(repos)) {
    for (const line of git(dir, 'log', '--all', '--format=%H %s').split('\n')) {
      const sp = line.indexOf(' ');
      if (!names.has(line.slice(0, sp))) names.set(line.slice(0, sp), `${repo}:${line.slice(sp + 1)}`);
    }
  }
  const short = new Map();
  for (const [s, label] of names) short.set(s.slice(0, 7), short.has(s.slice(0, 7)) ? null : label);
  let text = stdout;
  for (const [from, to] of Object.entries(extra).sort(([a], [b]) => b.length - a.length)) text = text.split(from).join(to);
  return text.replace(/\b[0-9a-f]{7,40}\b/g, (h) => {
    if (h.length === 40 && names.has(h)) return `{${names.get(h)}}`;
    if (h.length === 7 && short.get(h)) return `{${short.get(h)}:7}`;
    return h;
  });
}
const linesOf = (text) => text.replace(/\n$/, '').split('\n');

// The cross-repo world, with four more results of test/zip-export.test.js in
// invoicer-worker, at K5, selected at K6 (the commit that adds them):
//   s-clean     input src/zip-export.js with its sha256 at K5 (unchanged)
//   s-nul       the same input as "src/zip-export.js\0"
//   t-clean     input src/zip-export.js with the sha256 of ZIP_V1 (changed)
//   t-nul       the same input as "src/zip-export.js\0old"
function nulWorld(t) {
  const w = world(t);
  const { K5 } = w.shas.worker;
  const now = blobSha(w.worker, K5, 'src/zip-export.js');
  const result = (file, sha256) => ({ check: 'test/zip-export.test.js', outcome: 'pass', commit: K5, inputs: [{ file, sha256 }] });
  writeYaml(w.worker, '.assuredloop/results/s-clean.yaml', result('src/zip-export.js', now));
  writeYaml(w.worker, '.assuredloop/results/s-nul.yaml', result('src/zip-export.js\0', now));
  writeYaml(w.worker, '.assuredloop/results/t-clean.yaml', result('src/zip-export.js', sha(ZIP_V1)));
  writeYaml(w.worker, '.assuredloop/results/t-nul.yaml', result('src/zip-export.js\0old', sha(ZIP_V1)));
  const K6 = commit(w.worker, 'Record results with a NUL in an input');
  centralConfig(w.central, worldOutputs(K6));
  commit(w.central, 'Select K6');
  return { w, repos: { central: w.central, web: w.web, worker: w.worker }, extra: { [w.root]: '<root>' } };
}

const isNulLine = (l) => /results\/[st]-nul\.yaml /.test(l);

// The result lines of s-nul and t-nul that the contract wants, with the
// line's start (`lead`: "info result " in check, "Result    " in context).
const nulLines = (lead) => [
  `${lead}invoicer-worker/.assuredloop/results/s-nul.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Merge pull request #12 from invoicer/zip-names:7}: applicability unknown: the declared input src/zip-export.js\\x00 is not there`,
  `${lead}invoicer-worker/.assuredloop/results/t-nul.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Merge pull request #12 from invoicer/zip-names:7}: applicability unknown: the declared input src/zip-export.js\\x00old is not there`,
];

// The output on main a6c6745, without the s-nul and t-nul lines (the clean
// controls and every other line stay as they are), and of the central case.
const PINNED = {
  check: {
    code: 0,
    lines: [
      'ok: no marker lint',
      'info disposition-pending requests/invoice-exports/spec.md invoice-exports 4 of 8 paragraphs with a baseline effect have no disposition for their current version: SP-7, SP-10, SP-11, SP-12',
      'info disposition-pending requests/reminder-emails/spec.md reminder-emails 3 of 3 paragraphs with a baseline effect have no disposition for their current version: SP-2, SP-3, SP-4',
      'info output-repo invoicer-mobile - unknown: no clone at ../invoicer-mobile',
      'info result invoicer-web/.assuredloop/results/export-link-test.yaml test/export-link.test.js pass at invoicer-web@{web:Move the link time into config/link.json (W3):7}: declared inputs unchanged since invoicer-web@{web:Move the link time into config/link.json (W3):7}',
      'info result invoicer-worker/.assuredloop/results/a-no-inputs.yaml test/zip-export.test.js not run at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: applicability unknown: no declared inputs',
      'info result invoicer-worker/.assuredloop/results/b-unknown-no-inputs.yaml test/zip-export.test.js pass at invoicer-worker@unknown: applicability unknown: no declared inputs',
      'info result invoicer-worker/.assuredloop/results/c-unknown.yaml test/zip-export.test.js pass at invoicer-worker@unknown: applicability unknown: the commit is unknown',
      'info result invoicer-worker/.assuredloop/results/d-k7.yaml test/zip-export.test.js pass at invoicer-worker@deadbee: applicability unknown: commit deadbeefdeadbeefdeadbeefdeadbeefdeadbeef is not in the invoicer-worker clone',
      'info result invoicer-worker/.assuredloop/results/e-gone.yaml test/zip-export.test.js fail at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: applicability unknown: the declared input src/old-zip.js is not there',
      'info result invoicer-worker/.assuredloop/results/f-changed.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: does not apply to the current text: src/zip-export.js changed',
      'info result invoicer-worker/.assuredloop/results/g-unchanged.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: declared inputs unchanged since invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}',
      'info result invoicer-worker/.assuredloop/results/h-short.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: declared inputs unchanged since invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}',
      'info result invoicer-worker/.assuredloop/results/s-clean.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Merge pull request #12 from invoicer/zip-names:7}: declared inputs unchanged since invoicer-worker@{worker:Merge pull request #12 from invoicer/zip-names:7}',
      'info result invoicer-worker/.assuredloop/results/t-clean.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Merge pull request #12 from invoicer/zip-names:7}: does not apply to the current text: src/zip-export.js changed',
      'Read      working tree · base {central:The invoicer world:7} (merge-base with main)',
      'Next      al context',
      'Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, and whether a change is authorized in substance (the review judges these)',
    ],
  },
  context: {
    code: 0,
    lines: [
      'Paragraph SP-10 (2:2, in Design) · data · requests/invoice-exports/spec.md:41',
      '  A yearly ZIP holds twelve monthly CSV files named YYYY-MM.csv, each in the',
      '  format of a monthly export.',
      'Serves    invoice-exports/R3 version 1: signed in S1 (declared)',
      'Links     buildsOn EXP-3',
      'Checks    invoicer-worker/test/zip-export.test.js cites it (at invoicer-worker@{worker:Record results with a NUL in an input:7}) · also named in invoicer-worker/src/zip-export.js (not a test: no check)',
      'Result    invoicer-worker/.assuredloop/results/a-no-inputs.yaml test/zip-export.test.js not run at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: applicability unknown: no declared inputs',
      'Result    invoicer-worker/.assuredloop/results/b-unknown-no-inputs.yaml test/zip-export.test.js pass at invoicer-worker@unknown: applicability unknown: no declared inputs',
      'Result    invoicer-worker/.assuredloop/results/c-unknown.yaml test/zip-export.test.js pass at invoicer-worker@unknown: applicability unknown: the commit is unknown',
      'Result    invoicer-worker/.assuredloop/results/d-k7.yaml test/zip-export.test.js pass at invoicer-worker@deadbee: applicability unknown: commit deadbeefdeadbeefdeadbeefdeadbeefdeadbeef is not in the invoicer-worker clone',
      'Result    invoicer-worker/.assuredloop/results/e-gone.yaml test/zip-export.test.js fail at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: applicability unknown: the declared input src/old-zip.js is not there',
      'Result    invoicer-worker/.assuredloop/results/f-changed.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: does not apply to the current text: src/zip-export.js changed',
      'Result    invoicer-worker/.assuredloop/results/g-unchanged.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: declared inputs unchanged since invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}',
      'Result    invoicer-worker/.assuredloop/results/h-short.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: declared inputs unchanged since invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}',
      'Result    invoicer-worker/.assuredloop/results/s-clean.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Merge pull request #12 from invoicer/zip-names:7}: declared inputs unchanged since invoicer-worker@{worker:Merge pull request #12 from invoicer/zip-names:7}',
      'Result    invoicer-worker/.assuredloop/results/t-clean.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Merge pull request #12 from invoicer/zip-names:7}: does not apply to the current text: src/zip-export.js changed',
      'Disp.     SP-10 data pending',
      'Read      working tree',
      'Next      al context invoice-exports',
      'Not known the PRs that never named the request in a commit message',
    ],
  },
  central: {
    code: 0,
    lines: [
      'hint no-link specs/invoices.md:5 INV-12 INV-12 is a data paragraph with no link',
      'hint no-link specs/invoices.md:9 INV-13 INV-13 is a rule paragraph with no link',
      'hint no-link specs/invoices.md:13 INV-41 INV-41 is a rule paragraph with no link',
      'info result .assuredloop/results/clean.yaml test/invoices.test.js pass at {central:Test INV-13:7}: declared inputs unchanged since {central:Test INV-13:7} (that they are complete is a claim)',
      'info result .assuredloop/results/nul.yaml test/invoices.test.js pass at {central:Test INV-13:7}: applicability unknown: the declared input test/invoices.test.js\\x00 is not there',
      'Read      working tree · base {central:base:7} (merge-base with main)',
      'Next      deal with each hint, or say in the PR why it stays',
      'Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, and whether a change is authorized in substance (the review judges these)',
    ],
  },
};

describe('a result in an output repo whose declared input holds a NUL', () => {
  const runs = [
    ['check', ['check'], 'info result '],
    ['context', ['context', 'invoice-exports/SP-10'], 'Result    '],
  ];
  for (const [label, args, lead] of runs) {
    test(`${label}: applicability unknown: the declared input <path> is not there`, (t) => {
      const { w, repos, extra } = nulWorld(t);
      const r = al(w.central, args);
      assert.equal(r.code, 0, show(r));
      assert.deepEqual(linesOf(named(r.stdout, repos, extra)).filter(isNulLine), nulLines(lead), show(r));
    });

    test(`${label} control: the clean results and every other line as on main`, (t) => {
      const { w, repos, extra } = nulWorld(t);
      const r = al(w.central, args);
      const got = linesOf(named(r.stdout, repos, extra)).filter((l) => !isNulLine(l));
      assert.deepEqual({ code: r.code, lines: got }, PINNED[label], show(r));
    });
  }
});

// The central repo's own result: its inputs are read from the working tree,
// where a path with a NUL is absent, on main already. baseProject's main, then
// on the branch feature a test file and two results of it at that commit:
// clean.yaml (input test/invoices.test.js) and nul.yaml (the same input with
// "\0" after it).
test("the central repo's own result with a NUL in an input: applicability unknown, as on main", (t) => {
  const dir = baseProject(t);
  const testText = "// INV-13: an invoice has at least one line.\ntest('one line', () => {});\n";
  write(dir, 'test/invoices.test.js', testText);
  const tested = commitAll(dir, 'Test INV-13\n\nTier: 0 — a test');
  const result = (file) => ({ check: 'test/invoices.test.js', outcome: 'pass', commit: tested, inputs: [{ file, sha256: sha(testText) }] });
  writeYaml(dir, '.assuredloop/results/clean.yaml', result('test/invoices.test.js'));
  writeYaml(dir, '.assuredloop/results/nul.yaml', result('test/invoices.test.js\0'));
  commitAll(dir, 'Record two results\n\nTier: 0 — results');
  const r = al(dir, ['check']);
  const got = linesOf(named(r.stdout, { central: dir }, { [dir]: '<dir>' }));
  assert.deepEqual({ code: r.code, lines: got }, PINNED.central, show(r));
});
