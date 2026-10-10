// T12 (#180): the links that crossRepo(top) derives from the output repos
// (interface-180.md 2 and 3): cites, named-by, the declared links, PR
// references; an absent clone; a repo not in config; and that each output repo
// is read only at its selected commit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crossRepo, commit, linksWhere, oneLink, world } from './helpers/cross-repo.js';
import { git, write } from './helpers/project.js';

// The fields of a link that the interface fixes (proves is text, left open).
const FIELDS = ['repo', 'holder', 'link', 'target', 'how', 'commit', 'unknown', 'resolves', 'file', 'line', 'request'];
const pick = (l, extra = []) => Object.fromEntries([...FIELDS, ...extra].map((k) => [k, l[k]]));
const byKey = (a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b));
const sorted = (list) => [...list].sort(byKey);

// The world as built, read by most tests of this file.
let shared = null;
async function view() {
  if (shared) return shared;
  const w = world(null);
  const out = await crossRepo(w.central);
  const reason = (name) => out.repos.find((r) => r.name === name)?.unknown;
  shared = { w, out, links: out.links, reason, ...w.shas };
  return shared;
}

const cite = (repo, sha, file, target, line, resolves = true) => ({
  repo, holder: `${repo}/${file}`, link: 'cites', target, how: 'exact', commit: sha, unknown: null, resolves, file, line, request: null,
});

// --- cites

test('cites: each central ID in a file of invoicer-web at its commit, with file, line, holder and commit', async () => {
  const { links, web } = await view();
  const c = (file, target, line, resolves) => cite('invoicer-web', web.main, file, target, line, resolves);
  assert.deepEqual(sorted(linksWhere(links, { repo: 'invoicer-web', link: 'cites' }).map((l) => pick(l))), sorted([
    c('src/export-link.js', 'central:EXP-4', 1),
    c('src/export-link.js', 'central:EXP-6', 1),
    c('test/export-link.test.js', 'central:EXP-4', 1),
    c('docs/link.md', 'central:invoice-exports/R2', 3),
    c('docs/link.md', 'central:EXP-4', 4),
    c('docs/link.md', 'central:EXP-6', 5),
    c('docs/link.md', 'central:ADR-4', 5),
    c('docs/link.md', 'central:EXP-99', 6, false),
  ]));
});

test('cites: one link per file and target, at the first line that names it', async () => {
  const { links } = await view();
  const found = linksWhere(links, { link: 'cites', holder: 'invoicer-web/docs/link.md', target: 'central:EXP-4' });
  assert.deepEqual(found.map((l) => l.line), [4]);
});

test('cites: trailing punctuation is not part of the ID', async () => {
  const { links } = await view();
  const targets = linksWhere(links, { link: 'cites', holder: 'invoicer-web/docs/link.md' }).map((l) => l.target).sort();
  assert.deepEqual(targets, ['central:ADR-4', 'central:EXP-4', 'central:EXP-6', 'central:EXP-99', 'central:invoice-exports/R2']);
});

test('cites: nothing under .assuredloop/ of the output repo', async () => {
  const { links } = await view();
  const under = links.filter((l) => l.link === 'cites' && (String(l.file).startsWith('.assuredloop/') || l.target === 'central:EXP-5'));
  assert.deepEqual(under, []);
});

test('cites: resolves is false for an ID that the central repo does not have', async () => {
  const { links } = await view();
  assert.equal(oneLink(links, { link: 'cites', target: 'central:EXP-99' }).resolves, false);
  assert.equal(oneLink(links, { link: 'cites', holder: 'invoicer-web/docs/link.md', target: 'central:invoice-exports/R2' }).resolves, true);
});

test('cites: invoicer-worker is read at its pinned commit K5, a merge, with request-local IDs', async () => {
  const { links, worker } = await view();
  const c = (file, target) => cite('invoicer-worker', worker.K5, file, target, 1);
  assert.deepEqual(sorted(linksWhere(links, { repo: 'invoicer-worker', link: 'cites' }).map((l) => pick(l))), sorted([
    c('src/reminders.js', 'central:INV-11'),
    c('src/zip-export.js', 'central:invoice-exports/SP-7'),
    c('src/zip-export.js', 'central:invoice-exports/SP-10'),
    c('test/zip-export.test.js', 'central:invoice-exports/SP-10'),
  ]));
});

// --- named-by

test('named-by: a central task ID in the message of a reachable commit, held by <repo>@<full sha>', async () => {
  const { links, web, worker } = await view();
  const named = (repo, sha, target) => ({
    repo, holder: `${repo}@${sha}`, link: 'named-by', target, how: 'exact', commit: sha, unknown: null, resolves: true, file: null, line: null, request: null,
  });
  assert.deepEqual(sorted(linksWhere(links, { link: 'named-by' }).map((l) => pick(l))), sorted([
    named('invoicer-web', web.A, 'central:invoice-exports/T1'),
    named('invoicer-worker', worker.T2, 'central:invoice-exports/T2'),
  ]));
});

test('named-by: other central IDs in commit messages make no link', async () => {
  const { links } = await view();
  // W3 and A name central:EXP-4; K4 names central:INV-11.
  const fromMessages = links.filter((l) => /@/.test(l.holder) && !/\/T\d+$/.test(l.target));
  assert.deepEqual(fromMessages, []);
});

// --- declared links

test('implements, verifies and documents: declared, from the outputs: of invoice-exports, with present', async () => {
  const { links, web, worker } = await view();
  const declared = (repo, sha, file, link, target, present) => ({
    repo, holder: `${repo}/${file}`, link, target, how: 'declared', commit: sha, unknown: null, resolves: true, file, line: null,
    request: 'invoice-exports', present,
  });
  const present = links.filter((l) => ['implements', 'verifies', 'documents'].includes(l.link) && l.unknown === null);
  assert.deepEqual(sorted(present.map((l) => pick(l, ['present']))), sorted([
    declared('invoicer-web', web.main, 'src/export-link.js', 'implements', 'central:EXP-4', true),
    declared('invoicer-web', web.main, 'test/export-link.test.js', 'verifies', 'central:EXP-4', true),
    declared('invoicer-web', web.main, 'docs/missing.md', 'documents', 'central:EXP-4', false),
    declared('invoicer-worker', worker.K5, 'src/zip-export.js', 'implements', 'central:invoice-exports/R3', true),
  ]));
});

test("an outputs: entry of the central repo itself is not a cross-repo link", async () => {
  const { links } = await view();
  assert.deepEqual(links.filter((l) => l.file === 'docs/exports.md' || l.repo === 'invoicer'), []);
});

test('a declared link or a PR reference is never exact; every link has a proves text', async () => {
  const { links } = await view();
  assert.ok(links.length > 0);
  for (const l of links) {
    if (['implements', 'verifies', 'documents', 'pr'].includes(l.link)) assert.equal(l.how, 'declared', JSON.stringify(l));
    assert.equal(typeof l.proves, 'string', JSON.stringify(l));
    assert.ok(l.proves.length > 0, JSON.stringify(l));
  }
});

// --- PR references

const pr = (repo, task, target, sha, unknown) => ({
  repo, holder: `invoice-exports/${task}`, link: 'pr', target, how: 'declared', commit: sha, unknown, resolves: null, file: null, line: null,
  request: 'invoice-exports', merged: sha ? `merged at ${repo}@${sha.slice(0, 7)}` : null,
});
const prLink = (links, target) => pick(oneLink(links, { link: 'pr', target }), ['merged']);

test('pr: a squash commit whose subject ends in (#57) is the merge of invoicer-web#57', async () => {
  const { links, web } = await view();
  assert.deepEqual(prLink(links, 'invoicer-web#57'), pr('invoicer-web', 'T1', 'invoicer-web#57', web.A, null));
});

test('pr: (#570) is the merge of #570, not of #57', async () => {
  const { links, web } = await view();
  assert.deepEqual(prLink(links, 'invoicer-web#570'), pr('invoicer-web', 'T3', 'invoicer-web#570', web.B, null));
});

test('pr: a commit "Merge pull request #12 ..." is the merge of invoicer-worker#12', async () => {
  const { links, worker } = await view();
  assert.deepEqual(prLink(links, 'invoicer-worker#12'), pr('invoicer-worker', 'T2', 'invoicer-worker#12', worker.K5, null));
});

test('pr: a commit off the first-parent history does not count: no merge found', async () => {
  const { links, worker } = await view();
  assert.deepEqual(prLink(links, 'invoicer-worker#13'),
    pr('invoicer-worker', 'T2', 'invoicer-worker#13', null, `no merge found at invoicer-worker@${worker.K5.slice(0, 7)}`));
});

test('pr: "Merge pull request #12" is not the merge of #1', async () => {
  const { links, worker } = await view();
  assert.deepEqual(prLink(links, 'invoicer-worker#1'),
    pr('invoicer-worker', 'T2', 'invoicer-worker#1', null, `no merge found at invoicer-worker@${worker.K5.slice(0, 7)}`));
});

test("pr: the central repo's own #33 is not listed", async () => {
  const { links } = await view();
  assert.deepEqual(links.filter((l) => l.link === 'pr' && !/^[a-z0-9._-]+#\d+$/.test(l.target)), []);
  assert.deepEqual(linksWhere(links, { target: '#33' }), []);
});

// --- an absent clone, and a repo that is not in config

test('invoicer-mobile, an absent clone, is unknown with a reason in repos', async () => {
  const { reason } = await view();
  assert.equal(typeof reason('invoicer-mobile'), 'string');
  assert.ok(reason('invoicer-mobile').length > 0);
});

test('the declared link of an absent clone is listed with commit null, present null and its unknown reason', async () => {
  const { links, reason } = await view();
  assert.deepEqual(pick(oneLink(links, { repo: 'invoicer-mobile', link: 'implements' }), ['present']), {
    repo: 'invoicer-mobile', holder: 'invoicer-mobile/src/link.swift', link: 'implements', target: 'central:EXP-4', how: 'declared',
    commit: null, unknown: reason('invoicer-mobile'), resolves: true, file: 'src/link.swift', line: null, request: 'invoice-exports', present: null,
  });
});

test('the PR reference to an absent clone is listed with commit null and its unknown reason', async () => {
  const { links, reason } = await view();
  assert.deepEqual(prLink(links, 'invoicer-mobile#4'), pr('invoicer-mobile', 'T3', 'invoicer-mobile#4', null, reason('invoicer-mobile')));
});

test('no cites, named-by links or results come from an absent clone', async () => {
  const { out } = await view();
  assert.deepEqual(out.links.filter((l) => l.repo === 'invoicer-mobile' && ['cites', 'named-by'].includes(l.link)), []);
  assert.deepEqual(out.results.filter((r) => r.repo === 'invoicer-mobile'), []);
});

test('a declared link to a repo that is not in outputs: is unknown: not an output repo in config', async () => {
  const { links } = await view();
  assert.deepEqual(pick(oneLink(links, { repo: 'invoicer-desktop', link: 'implements' }), ['present']), {
    repo: 'invoicer-desktop', holder: 'invoicer-desktop/src/app.js', link: 'implements', target: 'central:EXP-4', how: 'declared',
    commit: null, unknown: 'not an output repo in config', resolves: true, file: 'src/app.js', line: null, request: 'invoice-exports', present: null,
  });
});

test('a PR reference to a repo that is not in outputs: is unknown: not an output repo in config', async () => {
  const { links } = await view();
  assert.deepEqual(prLink(links, 'invoicer-desktop#2'), pr('invoicer-desktop', 'T3', 'invoicer-desktop#2', null, 'not an output repo in config'));
});

// --- only the selected commit is read

test("an uncommitted change in the output clone's working tree is not seen", async (t) => {
  const w = world(t);
  write(w.web, 'src/export-link.js', '// central:EXP-5 and central:EXP-4\n');
  write(w.web, 'docs/new.md', 'See central:EXP-3.\n');
  write(w.web, 'docs/missing.md', 'Now here, but not committed: central:EXP-4.\n');
  const { links } = await crossRepo(w.central);
  assert.deepEqual(linksWhere(links, { link: 'cites', target: 'central:EXP-5' }), []);
  assert.deepEqual(linksWhere(links, { link: 'cites', target: 'central:EXP-3' }), []);
  assert.deepEqual(linksWhere(links, { link: 'cites', holder: 'invoicer-web/src/export-link.js' }).map((l) => l.target).sort(),
    ['central:EXP-4', 'central:EXP-6']);
  assert.equal(oneLink(links, { link: 'documents', holder: 'invoicer-web/docs/missing.md' }).present, false);
});

test('a clone checked out at another commit is still read at the selected commit', async (t) => {
  const w = world(t);
  git(w.web, 'checkout', '-q', '--detach', w.shas.web.W3);
  const { repos, links } = await crossRepo(w.central);
  assert.equal(repos.find((r) => r.name === 'invoicer-web').sha, w.shas.web.main);
  assert.equal(oneLink(links, { link: 'cites', holder: 'invoicer-web/docs/link.md', target: 'central:EXP-4' }).commit, w.shas.web.main);
});

test('a later commit past the pinned commit is not seen', async (t) => {
  const w = world(t);
  write(w.worker, 'src/later.js', '// Later work (central:EXP-2).\n');
  write(w.worker, '.assuredloop/results/z-later.yaml', `check: test/zip-export.test.js\noutcome: pass\ncommit: ${w.shas.worker.K5}\n`);
  commit(w.worker, 'Later work for central:invoice-exports/T3 (#13)');
  const { repos, links, results } = await crossRepo(w.central);
  assert.equal(repos.find((r) => r.name === 'invoicer-worker').sha, w.shas.worker.K5);
  assert.deepEqual(linksWhere(links, { holder: 'invoicer-worker/src/later.js' }), []);
  assert.deepEqual(linksWhere(links, { link: 'named-by', target: 'central:invoice-exports/T3' }), []);
  assert.equal(oneLink(links, { link: 'pr', target: 'invoicer-worker#13' }).commit, null);
  assert.deepEqual(results.filter((r) => r.file.endsWith('z-later.yaml')), []);
});
