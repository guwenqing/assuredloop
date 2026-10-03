// light-tier-1 R1 (amends [REC-4]), signed: a tier-1 organized requirement
// MAY be one line, `R1: <requirement in MUST/SHOULD/MAY words>. Amends: [ID]`,
// with Out: and Assumed: left out when there is nothing to say. The tool
// reads a line starting `R<n>: ` in the organized section as it reads an
// `### R<n> <title>` sub-section: its title is the requirement text before
// Amends:, its Amends: scopes to that R, and sign-off names it when it
// changes. Through the real CLI, on a signed tier-1 request whose branch
// edits the baseline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { both, outcome } from './helpers/request.js';
import { file } from './helpers/links.js';
import { check, message, noHint } from './helpers/hints.js';

const ENV = { SOURCE_DATE_EPOCH: '1790206200' }; // 2026-09-23T23:30Z
const A1 = '## [A-1] Promise\nThe promise MUST say old.\n';
const A1B = '## [A-1] Promise\nThe promise MUST say new.\n';
const A2 = '## [A-2] Order\nThe order MUST be old.\n';
const A2B = '## [A-2] Order\nThe order MUST be new.\n';
const LINE1 = 'R1: The promise MUST say new. Amends: [A-1]';

const al = (repo, args, input) => {
  const r = runAl(repo.dir, args, { input, env: ENV });
  assert.equal(r.code, 0, `al ${args.join(' ')}:\n${both(r)}`);
  return r;
};
const org = (...ls) => `\n## Organized requirement\n\n${ls.join('\n')}\n`;

// Main: specs/rules.md holding A-1 and A-2. On the branch `promise`: al new
// promise --tier 1, the organized section `organized` appended, signed with
// al record signoff --yes; then `after` as the baseline, al conclude --yes,
// and a commit. Returns { repo, generated }.
function concluded(t, organized, after = file(A1B, A2)) {
  const repo = makeRepo(t);
  repo.write('specs/rules.md', file(A1, A2));
  repo.commit('Baseline');
  repo.git(['checkout', '-q', '-b', 'promise']);
  al(repo, ['new', 'promise', '--tier', '1', '--from', '-'], 'Make the promise say new.\n');
  const md = 'requests/promise/request.md';
  repo.write(md, repo.read(md).toString() + organized);
  al(repo, ['record', 'promise', 'signoff', '--source', 'chat with the owner', '--yes']);
  repo.write('specs/rules.md', after);
  al(repo, ['conclude', 'promise', '--yes']);
  repo.commit(message('The promise says new', { request: 'promise', tier: '1 — promise' }), { date: '2026-09-24T12:00:00Z' });
  return { repo, generated: outcome(repo.read('requests/archive/promise/request.md').toString()).generated };
}
const fate = (generated, n) => {
  const line = generated.find((l) => l.startsWith(`- R${n} `));
  assert.ok(line, `the Outcome should have a line for R${n}:\n${generated.join('\n')}`);
  return line;
};

test('R1 [REC-4][REC-9] an organized section of one line, "R1: The promise MUST say new. Amends: [A-1]": the Outcome names R1 by its text and gives it in [A-1]; check gives no "in no section" note', (t) => {
  const { repo, generated } = concluded(t, org(LINE1));
  const line = fate(generated, 1);
  assert.ok(line.includes('The promise MUST say new'), `R1 named by its text:\n${line}`);
  assert.ok(!line.includes('Amends'), `the title is the text before Amends::\n${line}`);
  assert.match(line, /: in \[A-1\]$/, `R1 in [A-1]:\n${line}`);
  noHint(check(repo, '--all'), 'in no section');
});

for (const [label, extra] of [['an Assumed: line', ['Assumed: the AI added X.']], ['an Out: line', ['Out: nothing else.']], ['Out: and Assumed:', ['Out: nothing else.', 'Assumed: the AI added X.']]]) {
  test(`R1 [REC-4][REC-9] the one-line R1 with ${label} after it: R1's fate is the same, in [A-1]`, (t) => {
    const { generated } = concluded(t, org(LINE1, '', ...extra));
    assert.match(fate(generated, 1), /^- R1 The promise MUST say new.*: in \[A-1\]$/);
  });
}

test('R1 [REC-4][REC-9] two one-line requirements, each with its own Amends:: R1 in [A-1], R2 in [A-2]; each line\'s Amends: scopes to its R', (t) => {
  const { generated } = concluded(t, org(LINE1, 'R2: The order MUST be new. Amends: [A-2]'), file(A1B, A2B));
  assert.match(fate(generated, 1), /^- R1 The promise MUST say new.*: in \[A-1\]$/);
  assert.match(fate(generated, 2), /^- R2 The order MUST be new.*: in \[A-2\]$/);
});

test('R1 [REC-5][REC-6] signing the one-line form: record signoff shows and signs it; a later change to R1\'s line blocks the request, "changed since …: R1"', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/rules.md', file(A1, A2));
  repo.commit('Baseline');
  al(repo, ['new', 'promise', '--tier', '1', '--from', '-'], 'Make the promise say new.\n');
  const md = 'requests/promise/request.md';
  repo.write(md, repo.read(md).toString() + org(LINE1));
  const preview = al(repo, ['record', 'promise', 'signoff', '--source', 'chat with the owner']);
  assert.ok(preview.stdout.includes(LINE1), `the preview shows the line it signs:\n${preview.stdout}`);
  al(repo, ['record', 'promise', 'signoff', '--source', 'chat with the owner', '--yes']);
  const signed = al(repo, ['context', 'promise']);
  assert.doesNotMatch(lines(signed.stdout)[0], /^BLOCKED/, `signed:\n${signed.stdout}`);

  repo.write(md, repo.read(md).toString().replace('MUST say new.', 'MUST say newer.'));
  const changed = al(repo, ['context', 'promise']);
  const first = lines(changed.stdout)[0];
  assert.match(first, /^BLOCKED/, `blocked after R1 changed:\n${changed.stdout}`);
  assert.match(first, /changed since .*\bR1\b/, `"changed since …: R1":\n${changed.stdout}`);
});
