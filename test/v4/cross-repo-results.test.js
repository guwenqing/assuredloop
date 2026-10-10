// T12 (#180): the results in output repos, as crossRepo(top) gives them
// (interface-180.md 3, design.md 9): each rule of `applies`, in its order,
// including the unavailable commit K7, commit: unknown and a short hash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blobSha, commit, crossRepo, centralConfig, GONE_SHA, K7, world, worldOutputs, ZIP_V1 } from './helpers/cross-repo.js';
import { sha, write, writeYaml } from './helpers/project.js';

const DIR = '.assuredloop/results';
let shared = null;
async function view() {
  if (shared) return shared;
  const w = world(null);
  const out = await crossRepo(w.central);
  const result = (repo, name) => {
    const found = out.results.filter((r) => r.repo === repo && r.file === `${DIR}/${name}`);
    assert.equal(found.length, 1, `one result ${repo} ${name}:\n${JSON.stringify(out.results, null, 1)}`);
    return found[0];
  };
  shared = { w, out, result, ...w.shas };
  return shared;
}

const UNCHANGED = 'declared inputs unchanged since';

test('every result file of each present output repo is listed, and no other', async () => {
  const { out } = await view();
  assert.deepEqual(out.results.map((r) => `${r.repo} ${r.file}`).sort(), [
    `invoicer-web ${DIR}/export-link-test.yaml`,
    ...['a-no-inputs', 'b-unknown-no-inputs', 'c-unknown', 'd-k7', 'e-gone', 'f-changed', 'g-unchanged', 'h-short']
      .map((n) => `invoicer-worker ${DIR}/${n}.yaml`),
  ]);
});

test('each result carries its fields as written, with no problems', async () => {
  const { result, worker, w } = await view();
  const r = result('invoicer-worker', 'g-unchanged.yaml');
  assert.deepEqual({ ...r, applies: undefined }, {
    repo: 'invoicer-worker',
    file: `${DIR}/g-unchanged.yaml`,
    check: 'test/zip-export.test.js',
    outcome: 'pass',
    commit: worker.K4,
    resolved: worker.K4,
    inputs: [
      { file: 'test/zip-export.test.js', sha256: blobSha(w.worker, worker.K4, 'test/zip-export.test.js') },
      { file: 'src/reminders.js', sha256: blobSha(w.worker, worker.K4, 'src/reminders.js') },
    ],
    by: r.by,
    source: r.source,
    note: r.note,
    problems: [],
    applies: undefined,
  });
});

test('by, source and note are carried', async () => {
  const { result } = await view();
  const r = result('invoicer-worker', 'd-k7.yaml');
  assert.deepEqual([r.by, r.source, r.note], ['reviewer-7', 'https://ci.example.invalid/runs/7', 'ran on the worker CI']);
});

test('1: no declared inputs gives applicability unknown', async () => {
  const { result } = await view();
  assert.equal(result('invoicer-worker', 'a-no-inputs.yaml').applies, 'applicability unknown: no declared inputs');
});

test('1 comes before 2: no declared inputs and commit: unknown', async () => {
  const { result } = await view();
  assert.equal(result('invoicer-worker', 'b-unknown-no-inputs.yaml').applies, 'applicability unknown: no declared inputs');
});

test('2: commit: unknown gives applicability unknown, before an input that is not there', async () => {
  const { result } = await view();
  const r = result('invoicer-worker', 'c-unknown.yaml');
  assert.equal(r.commit, 'unknown');
  assert.equal(r.resolved, null);
  assert.equal(r.applies, 'applicability unknown: the commit is unknown');
});

test('3: a commit that is not in the clone (K7) gives applicability unknown, before a changed input', async () => {
  const { result } = await view();
  const r = result('invoicer-worker', 'd-k7.yaml');
  assert.equal(r.commit, K7);
  assert.equal(r.resolved, null);
  assert.equal(r.applies, `applicability unknown: commit ${K7} is not in the invoicer-worker clone`);
});

test('4: a declared input that is not there at the selected commit, before a changed input', async () => {
  const { result, worker } = await view();
  const r = result('invoicer-worker', 'e-gone.yaml');
  assert.equal(r.resolved, worker.K4);
  assert.deepEqual(r.inputs, [{ file: 'src/zip-export.js', sha256: sha(ZIP_V1) }, { file: 'src/old-zip.js', sha256: GONE_SHA }]);
  assert.equal(r.applies, 'applicability unknown: the declared input src/old-zip.js is not there');
});

test('5: an input whose bytes at the selected commit have another sha256 does not apply to the current text', async () => {
  const { result } = await view();
  assert.equal(result('invoicer-worker', 'f-changed.yaml').applies, 'does not apply to the current text: src/zip-export.js changed');
});

test('6: declared inputs unchanged since <repo>@<first 7 of resolved>', async () => {
  const { result, worker } = await view();
  assert.equal(result('invoicer-worker', 'g-unchanged.yaml').applies, `${UNCHANGED} invoicer-worker@${worker.K4.slice(0, 7)}`);
});

test('a short hash resolves to the full hash of that commit in the clone', async () => {
  const { result, worker } = await view();
  const r = result('invoicer-worker', 'h-short.yaml');
  assert.equal(r.commit, worker.K4.slice(0, 7));
  assert.equal(r.resolved, worker.K4);
  assert.equal(r.applies, `${UNCHANGED} invoicer-worker@${worker.K4.slice(0, 7)}`);
});

test('the W3 result of invoicer-web: its inputs are unchanged at main', async () => {
  const { result, web } = await view();
  const r = result('invoicer-web', 'export-link-test.yaml');
  assert.equal(r.resolved, web.W3);
  assert.equal(r.outcome, 'pass');
  assert.equal(r.applies, `${UNCHANGED} invoicer-web@${web.W3.slice(0, 7)}`);
});

test('the results folder is the one that the output repo config names at the selected commit', async (t) => {
  const w = world(t);
  write(w.worker, '.assuredloop/config.yaml', 'repo: invoicer-worker\ncentral: {path: ../invoicer}\nresults: ci/results\n');
  writeYaml(w.worker, 'ci/results/zip.yaml', { check: 'test/zip-export.test.js', outcome: 'pass', commit: w.shas.worker.K5 });
  const K6 = commit(w.worker, 'Keep the results in ci/results');
  centralConfig(w.central, worldOutputs(K6));
  const { results } = await crossRepo(w.central);
  assert.deepEqual(results.filter((r) => r.repo === 'invoicer-worker').map((r) => r.file), ['ci/results/zip.yaml']);
});

test("an uncommitted change to the output repo's results: setting is not read", async (t) => {
  const w = world(t);
  write(w.worker, '.assuredloop/config.yaml', 'repo: invoicer-worker\ncentral: {path: ../invoicer}\nresults: ci/results\n');
  writeYaml(w.worker, 'ci/results/zip.yaml', { check: 'test/zip-export.test.js', outcome: 'pass', commit: w.shas.worker.K5 });
  const { results } = await crossRepo(w.central);
  const files = results.filter((r) => r.repo === 'invoicer-worker').map((r) => r.file);
  assert.equal(files.length, 8);
  assert.ok(files.every((f) => f.startsWith(`${DIR}/`)), files.join(', '));
});
