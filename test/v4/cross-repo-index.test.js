// T12 (#180): al index in the central repo writes commit bindings for the
// declared output links (interface-180.md 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blobSha, centralConfig, commit, world, worldOutputs, ZIP_V2 } from './helpers/cross-repo.js';
import { invoicer } from './helpers/invoicer.js';
import { binding, bindingsOf, hashOf, index, read, record, sha, write } from './helpers/project.js';

const REQ = 'invoice-exports';
const EXPORT = 'invoicer-web/src/export-link.js';
const TEST = 'invoicer-web/test/export-link.test.js';
const ZIP = 'invoicer-worker/src/zip-export.js';
const EXP4 = 'central:EXP-4';
const lines = (r) => r.stdout.split('\n');

// The world after one al index, read by several tests.
let shared = null;
function indexed() {
  if (shared) return shared;
  const w = world(null);
  const r = index(w.central);
  shared = { w, r, rec: record(w.central, REQ), exp4: hashOf(w.central, 'specs/exports.md', 'EXP-4'), ...w.shas };
  return shared;
}

test('a declared output link of a present repo is bound with the hashes and <repo>@<full sha>', () => {
  const { w, rec, exp4, web } = indexed();
  assert.deepEqual(binding(rec, EXPORT, 'implements', EXP4), {
    holder: EXPORT, link: 'implements', target: EXP4,
    holder_sha256: blobSha(w.web, web.main, 'src/export-link.js'), target_sha256: exp4, commit: `invoicer-web@${web.main}`,
  });
  assert.deepEqual(binding(rec, TEST, 'verifies', EXP4), {
    holder: TEST, link: 'verifies', target: EXP4,
    holder_sha256: blobSha(w.web, web.main, 'test/export-link.test.js'), target_sha256: exp4, commit: `invoicer-web@${web.main}`,
  });
});

test('a binding to a requirement has its target_version, as a local link to it has', () => {
  const { rec, worker } = indexed();
  const local = binding(rec, `${REQ}/SP-7`, 'serves', `${REQ}/R3`);
  assert.deepEqual(binding(rec, ZIP, 'implements', `central:${REQ}/R3`), {
    holder: ZIP, link: 'implements', target: `central:${REQ}/R3`, target_version: local.target_version,
    holder_sha256: sha(ZIP_V2), target_sha256: local.target_sha256, commit: `invoicer-worker@${worker.K5}`,
  });
});

test('a file that is not in the output repo at its commit: not bound, output file not found', () => {
  const { r, rec } = indexed();
  assert.ok(lines(r).includes(`not bound: invoicer-web/docs/missing.md documents ${EXP4}: output file not found`), r.stdout);
  assert.deepEqual(bindingsOf(rec, 'invoicer-web/docs/missing.md', 'documents', EXP4), []);
});

test('an absent clone: the unknown line with its reason, and no binding', () => {
  const { r, rec } = indexed();
  const prefix = `unknown: invoicer-mobile/src/link.swift implements ${EXP4}: `;
  const found = lines(r).filter((l) => l.startsWith(prefix));
  assert.equal(found.length, 1, r.stdout);
  assert.ok(found[0].length > prefix.length, 'a reason is given');
  assert.deepEqual(bindingsOf(rec, 'invoicer-mobile/src/link.swift', 'implements', EXP4), []);
});

test('a repo that is not in outputs: the unknown line, and no binding', () => {
  const { r, rec } = indexed();
  assert.ok(lines(r).includes(`unknown: invoicer-desktop/src/app.js implements ${EXP4}: not an output repo in config`), r.stdout);
  assert.deepEqual(bindingsOf(rec, 'invoicer-desktop/src/app.js', 'implements', EXP4), []);
});

test("holder_sha256 is of the file's bytes at the selected commit, not of the working tree", (t) => {
  const w = world(t);
  const committed = read(w.web, 'src/export-link.js');
  write(w.web, 'src/export-link.js', `${committed}// changed, not committed\n`);
  index(w.central);
  assert.equal(binding(record(w.central, REQ), EXPORT, 'implements', EXP4).holder_sha256, sha(committed));
});

// The output repos move on: web commits new bytes on main, and the worker
// commits K6, which config now selects.
function moveOn(w) {
  write(w.web, 'src/export-link.js', `${read(w.web, 'src/export-link.js')}// moved on\n`);
  write(w.web, 'test/export-link.test.js', `${read(w.web, 'test/export-link.test.js')}// moved on\n`);
  const web = commit(w.web, 'Move on (#71)');
  write(w.worker, 'src/zip-export.js', `${ZIP_V2}// moved on\n`);
  const K6 = commit(w.worker, 'Move on');
  centralConfig(w.central, worldOutputs(K6));
  return { web, K6 };
}

test('a binding is frozen: indexing again after the output repos move on changes nothing', (t) => {
  const w = world(t);
  index(w.central);
  const rec = record(w.central, REQ);
  const before = rec.bindings;
  for (const [holder, link, target] of [[EXPORT, 'implements', EXP4], [TEST, 'verifies', EXP4], [ZIP, 'implements', `central:${REQ}/R3`]]) {
    assert.ok(binding(rec, holder, link, target).commit, `${holder} is bound with a commit`);
  }
  moveOn(w);
  index(w.central);
  assert.deepEqual(record(w.central, REQ).bindings, before);
});

test('al index --align <repo>/<file> advances its hashes and commit, and only its own', (t) => {
  const w = world(t);
  index(w.central);
  const old = record(w.central, REQ);
  const { web } = moveOn(w);
  index(w.central, '--align', EXPORT);
  const rec = record(w.central, REQ);
  assert.deepEqual(binding(rec, EXPORT, 'implements', EXP4), {
    ...binding(old, EXPORT, 'implements', EXP4),
    holder_sha256: blobSha(w.web, web, 'src/export-link.js'),
    commit: `invoicer-web@${web}`,
  });
  assert.notEqual(binding(rec, EXPORT, 'implements', EXP4).holder_sha256, binding(old, EXPORT, 'implements', EXP4).holder_sha256);
  assert.deepEqual(binding(rec, TEST, 'verifies', EXP4), binding(old, TEST, 'verifies', EXP4));
  assert.deepEqual(binding(rec, ZIP, 'implements', `central:${REQ}/R3`), binding(old, ZIP, 'implements', `central:${REQ}/R3`));
});

test('a marker link central:<ID> in the central repo binds as <ID> would, with the target as written', (t) => {
  const w = world(t);
  const CS = `requests/${REQ}/spec.md`;
  write(w.central, CS, `${read(w.central, CS)}
<!-- SP-30 rule serves:R2 builds-on:central:EXP-4 -->

The export link MUST show when it expires.

<!-- SP-31 rule serves:R2 builds-on:EXP-4 -->

The export link MUST name its export.
`);
  index(w.central);
  const rec = record(w.central, REQ);
  const plain = binding(rec, `${REQ}/SP-31`, 'builds-on', 'EXP-4');
  assert.deepEqual(binding(rec, `${REQ}/SP-30`, 'builds-on', EXP4), {
    holder: `${REQ}/SP-30`, link: 'builds-on', target: EXP4,
    holder_sha256: hashOf(w.central, CS, 'SP-30'), target_sha256: plain.target_sha256,
  });
  assert.equal(plain.target_sha256, hashOf(w.central, 'specs/exports.md', 'EXP-4'));
});

// --- with no outputs: in config, al index behaves as before

test('with no outputs: in config, al index writes no commit binding and no unknown line', (t) => {
  const dir = invoicer(t, 'clean');
  const r = index(dir);
  assert.deepEqual(lines(r).filter((l) => l.startsWith('unknown:')), [], r.stdout);
  assert.deepEqual((record(dir, REQ).bindings ?? []).filter((b) => 'commit' in b), []);
});
