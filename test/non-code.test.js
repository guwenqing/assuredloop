// Beyond code [TL-5]: on a repo of documents alone, the records, states,
// links and hints work as they do on code [SPC-1]. The deliverable is
// docs/guide.md; the baseline under specs/ holds promises about it; the
// "tests" are named checks of a kind, a checklist and a review record under
// checks/, named by a `tests:` line of .assuredloop; their results are the
// files those checks write, named by a `results:` line [LNK-3]. One signed
// tier-2 request walks through the real CLI: new, the organized requirement,
// the sign-off, record section, the Now edit in change.md, consolidate, a
// change to the guide and its checklist, the checks' results, check and
// context --diff, then conclude.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, runAl } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';
import { both, lineWith, outcome } from './helpers/request.js';
import { assertDiffFrame, contextDiff, labelled, says } from './helpers/links.js';
import { check, checkHints, hint, kindOf, message, strict } from './helpers/hints.js';
import { count, junit, short, tap } from './helpers/evidence.js';

const ENV = { SOURCE_DATE_EPOCH: '1790510400', TZ: 'UTC' }; // 2026-09-27T12:00Z
const NAME = 'guide-remove';
const DIR = `requests/${NAME}`;
const TIER = '2 — the guide explains removing the tool';

const GD1 = 'The guide MUST explain how to install the tool in three steps or fewer.';
const GD1_NOW = 'The guide MUST explain how to install the tool in three steps or fewer, and how to remove it.';
const SPEC = (gd1) => `# The guide\n\n## [GD-1] Install\n${gd1}\n\n## [GD-2] Audience\nThe guide MUST be written for readers new to the command line.\n`;
const GUIDE = '# Using the tool\n\n<!-- [GD-1] -->\n## Install\n\n1. Download the tool.\n2. Run the installer.\n';
const GUIDE_REMOVE = `${GUIDE}\n## Remove\n\n1. Run the uninstaller.\n`;
const CHECKLIST = '# Install checklist [GD-1]\n\n- [ ] The guide lists the install steps.\n- [ ] Three steps or fewer.\n';
const CHECKLIST_REMOVE = `${CHECKLIST}- [ ] The guide lists the remove steps.\n`;
const REVIEW = '# Review: audience [GD-2]\n\nA reader new to the command line reads docs/guide.md and notes where they stop.\n';
const WORDS = 'Readers ask how to remove the tool; the guide does not say.\n';
const ORGANIZED = '\n## Organized requirement\n\n### R1 Removing\nThe guide MUST explain how to remove the tool.\n\n' +
  'Out: removing old versions by hand.\n\nAssumed: removing is one command, as installing is.\n';

const CHECKLIST_RESULT = 'check-results/install-checklist.tap';
const REVIEW_RESULT = 'check-results/audience-review.xml';

const ok = (r, what) => assert.equal(r.code, 0, `${what}:\n${both(r)}`);
const al = (repo, args, input) => runAl(repo.dir, args, { input, env: ENV });
const has = (text, ...parts) => {
  const line = lineWith(text, ...parts);
  assert.ok(line, `expected a line with ${parts.map(String).join(' and ')}:\n${text}`);
  return line;
};
function contextOf(repo) {
  const r = al(repo, ['context', NAME]);
  ok(r, `context ${NAME}`);
  assertFrame(r.stdout);
  return r.stdout;
}
function labelledBlock(out, label) {
  const b = labelled(out, label);
  assert.ok(b, `expected a line starting with ${label}:\n${out}`);
  return b;
}

// Main: no code anywhere. The baseline specs/guide.md (GD-1, GD-2), the
// deliverable docs/guide.md, the checks under checks/, and .assuredloop
// naming them and their results.
function documents(t) {
  const repo = makeRepo(t);
  repo.write('specs/guide.md', SPEC(GD1));
  repo.write('docs/guide.md', GUIDE);
  repo.write('checks/install-checklist.md', CHECKLIST);
  repo.write('checks/audience-review.md', REVIEW);
  repo.write('.assuredloop', 'tests: checks\nresults: check-results\n');
  const base = repo.commit('The guide, its promises and its checks', { date: '2026-09-01T12:00:00Z' });
  const files = repo.git(['ls-files']).split('\n');
  assert.ok(!files.some((f) => /\.(js|mjs|cjs|ts|py|go|rb|java|cs)$/.test(f)), `the fixture: no code:\n${files.join('\n')}`);
  repo.git(['checkout', '-q', '-b', 'work']);
  return { repo, base };
}

test('[TL-5] a repo of documents alone: a signed tier-2 request, walked through new, sign-off, record section, consolidate, the guide and its checks, check, context --diff and conclude', (t) => {
  const { repo } = documents(t);

  // new, then the organized requirement: blocked until signed.
  ok(al(repo, ['new', NAME, '--from', '-', '--title', 'The guide explains removing the tool', '--tier', '2'], WORDS), 'new');
  repo.write(`${DIR}/request.md`, repo.read(`${DIR}/request.md`).toString() + ORGANIZED);
  assert.match(lines(contextOf(repo))[0], /blocked/i, 'an unsigned request shows the blocked state first');

  // The sign-off: no longer blocked.
  ok(al(repo, ['record', NAME, 'signoff', '--source', 'chat with the owner', '--words', '"Yes, that is it."', '--yes']), 'record signoff');
  assert.doesNotMatch(contextOf(repo), /blocked/i, 'signed, the request is not blocked');

  // record section copies "was" from the baseline: no change yet.
  ok(al(repo, ['record', NAME, 'section', 'GD-1', '--yes']), 'record section GD-1');
  assert.ok(says(contextOf(repo), 'GD-1', 'no change yet'), `GD-1 should read no change yet:\n${contextOf(repo)}`);

  // The Now edit, for R1: pending.
  const change = repo.read(`${DIR}/change.md`).toString();
  const heading = lines(change).find((l) => /^### \[GD-1\]@1 modify\s*$/.test(l));
  assert.ok(heading, `the fixture: record section wrote "### [GD-1]@1 modify":\n${change}`);
  const at = change.lastIndexOf(GD1);
  assert.ok(at > change.indexOf('Now:'), `the fixture: the Now block holds GD-1's text:\n${change}`);
  repo.write(`${DIR}/change.md`, (change.slice(0, at) + GD1_NOW + change.slice(at + GD1.length)).replace(heading, `${heading}   for R1`));
  assert.ok(says(contextOf(repo), 'GD-1', 'pending'), `GD-1 should read pending:\n${contextOf(repo)}`);
  // spec: the design as it stands, the open change's now and state under GD-1 [VW-5].
  const design = al(repo, ['spec']);
  ok(design, 'spec');
  assertFrame(design.stdout);
  has(design.stdout, GD1_NOW);
  assert.ok(says(design.stdout, 'GD-1', 'pending') || lineWith(design.stdout, NAME, 'pending'), `spec should show the change pending under GD-1:\n${design.stdout}`);
  repo.commit(message('Hold GD-1 for R1', { request: NAME, tier: TIER }), { date: '2026-09-10T12:00:00Z' });

  // consolidate writes the baseline: consolidated.
  ok(al(repo, ['consolidate', NAME, '--yes']), 'consolidate');
  assert.equal(repo.read('specs/guide.md').toString(), SPEC(GD1_NOW));
  const folded = repo.commit(message('Consolidate GD-1', { request: NAME, tier: TIER }), { date: '2026-09-11T12:00:00Z' });
  assert.ok(says(contextOf(repo), 'GD-1', 'consolidated'), `GD-1 should read consolidated:\n${contextOf(repo)}`);

  // The deliverable and its checklist change; the checks write their results.
  repo.write('docs/guide.md', GUIDE_REMOVE);
  repo.write('checks/install-checklist.md', CHECKLIST_REMOVE);
  const head = repo.commit(message('The guide says how to remove the tool', { request: NAME, tier: TIER }), { date: '2026-09-12T12:00:00Z' });
  repo.write(CHECKLIST_RESULT, tap(head, [['[GD-1] the guide lists the install steps', 'ok'], ['[GD-1] the guide lists the remove steps', 'ok']]));
  repo.write(REVIEW_RESULT, junit(folded, [['[GD-2] a new reader gets through the guide', 'pass']]));

  // check: the request served, the checks as tests, the results with their
  // provenance, and the hint that the review's result is not evidence.
  const out = check(repo, '--all');
  has(labelledBlock(out, 'Serves'), NAME);
  has(labelledBlock(out, 'Tests'), 'checks/install-checklist.md');
  const results = labelledBlock(out, 'Results');
  has(results, CHECKLIST_RESULT, short(head), /\bhead\b/, count(2, 'pass'));
  has(results, REVIEW_RESULT, short(folded), /\bolder\b/);
  hint(out, 'note', REVIEW_RESULT);
  assert.deepEqual(checkHints(out).filter((l) => kindOf(l) === 'not ok'), [], `no not ok:\n${out}`);

  // context --diff: the request, GD-1 consolidated, the guide near GD-1, and
  // the checklist linked to GD-1 with its reason.
  const d = contextDiff(repo, 'main...HEAD');
  ok(d, 'context --diff');
  assertDiffFrame(d.stdout);
  has(labelledBlock(d.stdout, 'Serves'), NAME);
  assert.ok(says(d.stdout, 'GD-1', 'consolidated'), `GD-1 should read consolidated:\n${d.stdout}`);
  has(d.stdout, 'docs/guide.md', 'GD-1');
  has(labelledBlock(d.stdout, 'Tests'), 'checks/install-checklist.md', /\bGD-1\b/);

  // context GD-1: the guide as linked code and the checklist as a linked test, each with its reason [VW-3].
  const section = al(repo, ['context', 'GD-1']);
  ok(section, 'context GD-1');
  assertFrame(section.stdout);
  has(labelledBlock(section.stdout, 'Links'), 'docs/guide.md', /\bGD-1\b/);
  has(labelledBlock(section.stdout, 'Tests'), 'checks/install-checklist.md', /\bGD-1\b|changed together|\bshares\b/);
  assert.ok(!labelledBlock(section.stdout, 'Links').includes('checks/'), `a named check is a test, not under Links:\n${section.stdout}`);

  // --for review: the evidence holds the results with their provenance.
  const review = runAl(repo.dir, ['context', '--diff', 'main...HEAD', '--for', 'review'], { env: ENV });
  ok(review, 'context --diff --for review');
  has(labelledBlock(review.stdout, 'Results'), CHECKLIST_RESULT, short(head), /\bhead\b/);

  // conclude: the Outcome, Status concluded, the folder archived; check --strict is clean.
  ok(al(repo, ['conclude', NAME, '--yes']), 'conclude');
  const archived = `requests/archive/${NAME}/request.md`;
  assert.ok(existsSync(join(repo.dir, archived)) && !existsSync(join(repo.dir, DIR)), `the request should move to requests/archive/${NAME}/`);
  const md = repo.read(archived).toString();
  assert.match(md, /Status: concluded/);
  has(outcome(md).generated.join('\n'), 'R1', 'GD-1');
  repo.commit(message('Conclude guide-remove', { request: NAME, tier: TIER }), { date: '2026-09-13T12:00:00Z' });
  strict(repo, 0);
});
