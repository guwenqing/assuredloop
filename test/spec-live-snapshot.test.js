// Validation fixes, PR 4 (tier 0):
// #105 [VW-5]: with no baseline files yet, al spec keeps its "no baseline
// yet" line and still shows each open change's "now" and state; its Next
// line does not suggest al new while open changes exist.
// #108 [LNK-2] [REC-9] [HNT-2]: code still live for dropped work is found
// through all three of [LNK-2]'s routes to a request's commits, the third
// being an issue number listed in the request's owner's words.
// #104 [HNT-2]: the note on a served request's http(s) snapshot says
// "fetched <date>; no re-check recorded (an unchanged --verify writes
// nothing)", not "not re-checked since", which the tool cannot know.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, runAl } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { ENV, addRequest, both, outcome } from './helpers/request.js';
import { check, hint, message, noHint } from './helpers/hints.js';

const al = (repo, args, input) => runAl(repo.dir, args, { input, env: ENV });
const ok = (r, what) => assert.equal(r.code, 0, `${what}:\n${both(r)}`);
const NO_BASELINE = 'no baseline yet; requests add sections as they go';

// --- #105: al spec with no baseline files ---

const NEW1 = '## [NEW-1] New promise\nMUST exist.\n';

test('#105 [VW-5] no baseline files and the signed request fresh holding [NEW-1]@1 add in specs/new.md: al spec keeps the no-baseline line and shows fresh/NEW-1@1 pending with its text; Next does not suggest al new', (t) => {
  const repo = makeRepo(t);
  addRequest(repo, 'fresh', [block('[NEW-1]@1 add in specs/new.md   for R1', { now: NEW1 })]);
  repo.commit('fresh: request', { date: '2026-09-21T12:00:00Z' });
  const r = al(repo, ['spec']);
  ok(r, 'spec');
  assertFrame(r.stdout);
  assert.ok(lines(r.stdout).some((l) => l.includes(NO_BASELINE)), `the no-baseline line stays:\n${r.stdout}`);
  assert.ok(lines(r.stdout).some((l) => l.includes('NEW-1@1') && /\bpending\b/.test(l)), `NEW-1@1 shown pending:\n${r.stdout}`);
  assert.ok(r.stdout.includes('MUST exist.'), `its "now" text shown:\n${r.stdout}`);
  const next = lines(r.stdout).find((l) => /^Next\b/.test(l));
  assert.doesNotMatch(next, /\bal new\b/, `open changes exist, so Next does not suggest al new:\n${next}`);
});

test('#105 [VW-5] pin: no baseline and no open change: al spec says "no baseline yet", and its Next line suggests al new', (t) => {
  const repo = makeRepo(t);
  const r = al(repo, ['spec']);
  ok(r, 'spec');
  assertFrame(r.stdout);
  assert.ok(lines(r.stdout).some((l) => l.includes(NO_BASELINE)), r.stdout);
  assert.match(lines(r.stdout).find((l) => /^Next\b/.test(l)), /\bal new\b/, r.stdout);
});

// --- #108: live code found through an issue number ---

const CODE = 'export function deliver(order) {\n  return { order, at: "door" };\n}\n';
const D1 = '\n## Decisions\n\n- D1, 2026-09-22. Source: the owner. Drop the delivery form.\n';

// Main: the request delivery, whose owner's words list issue #123 and whose
// D1 drops it; then src/delivery.js, committed alone with `message` (it
// touches no request folder). The branch `drop` concludes delivery --dropped
// D1 and commits. Returns { repo, generated }: the Outcome's generated lines.
function dropped(t, codeMessage) {
  const repo = makeRepo(t);
  addRequest(repo, 'delivery', null, { decisions: D1 });
  const md = 'requests/delivery/request.md';
  const text = repo.read(md).toString();
  const words = '## Owner\'s words and dialog\n\n';
  assert.ok(text.includes(words), 'the fixture: the owner\'s words section');
  repo.write(md, text.replace(words, `${words}- 2026-09-19 issue #123, the delivery form\n`));
  repo.commit('delivery: request', { date: '2026-09-20T12:00:00Z' });
  repo.write('src/delivery.js', CODE);
  repo.commit(codeMessage, { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'drop']);
  ok(al(repo, ['conclude', 'delivery', '--dropped', 'D1', '--yes']), 'conclude --dropped');
  repo.commit(message('Drop delivery', { request: 'delivery', tier: '2 — drop delivery' }), { date: '2026-09-23T12:00:00Z' });
  return { repo, generated: outcome(repo.read('requests/archive/delivery/request.md').toString()).generated };
}
const liveLine = (generated) => generated.find((l) => l.startsWith('- Code still live for dropped work:'));

test('#108 [LNK-2][REC-9] conclude --dropped: code linked to delivery only by "Fixes #123" (listed in its owner\'s words) is in the Outcome\'s "Code still live for dropped work: src/delivery.js:…"', (t) => {
  const { generated } = dropped(t, 'Implement delivery\n\nFixes #123');
  assert.match(liveLine(generated) ?? '', /src\/delivery\.js:\d/, `the Outcome:\n${generated.join('\n')}`);
});

test('#108 [LNK-2][HNT-2] check --all on that branch: the note "code still live for dropped work of delivery: src/delivery.js:…"', (t) => {
  const { repo } = dropped(t, 'Implement delivery\n\nFixes #123');
  hint(check(repo, '--all'), 'note', 'code still live for dropped work of delivery', /src\/delivery\.js:\d/);
});

test('#108 contrast: the same commit without #123, linked to delivery no other way: not in the Outcome, no note', (t) => {
  const { repo, generated } = dropped(t, 'Implement delivery');
  assert.doesNotMatch(liveLine(generated) ?? '', /src\/delivery\.js/, `the Outcome:\n${generated.join('\n')}`);
  noHint(check(repo, '--all'), 'code still live', 'src/delivery.js');
});

// --- #104: the snapshot note's wording ---

// Main: the request verify with a snapshot of https://example.test/document
// fetched 2026-01-01T00:00Z; the branch serves it. Then an unchanged
// --verify --yes, which writes nothing. Returns { repo, file }.
function verified(t) {
  const repo = makeRepo(t);
  addRequest(repo, 'verify', null);
  ok(al(repo, ['record', 'verify', 'origin', '--url', 'https://example.test/document', '--from', '-', '--fetched', '2026-01-01T00:00Z', '--yes'], 'original text\n'), 'record origin');
  repo.commit('verify: request and snapshot', { date: '2026-09-20T12:00:00Z' });
  const file = readdirSync(join(repo.dir, 'requests/verify/origin')).find((f) => f.includes('example-test'));
  assert.ok(file, 'the fixture: the snapshot file');
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('src/verify.js', 'export const v = 1;\n');
  repo.commit(message('Verify', { request: 'verify', tier: '2 — verify' }), { date: '2026-09-21T12:00:00Z' });
  const r = al(repo, ['record', 'verify', 'origin', '--verify', file, '--from', '-', '--fetched', '2026-02-01T00:00Z', '--yes'], 'original text\n');
  ok(r, 'record origin --verify');
  assert.match(r.stdout, /unchanged since/, `the fixture: an unchanged re-fetch:\n${r.stdout}`);
  assert.equal(repo.git(['status', '--porcelain']), '', 'the fixture: an unchanged --verify writes nothing');
  return { repo, file };
}

test('#104 [HNT-2][REC-3] after an unchanged --verify --yes, check\'s note on the snapshot reads "fetched 2026-01-01; no re-check recorded (an unchanged --verify writes nothing)", names al record verify origin --verify, and says nothing of "not re-checked since"', (t) => {
  const { repo, file } = verified(t);
  const out = check(repo, '--all');
  const line = hint(out, 'note', file, /fetched 2026-01-01/, 'no re-check recorded (an unchanged --verify writes nothing)', 'al record verify origin --verify');
  assert.doesNotMatch(line, /not re-checked/, line);
});
