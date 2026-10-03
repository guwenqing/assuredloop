// Issue #138, item 5 [SPC-5] [STA-4] [STA-2]: a fenced Was:/Now: block in
// change.md closes only at a fence line indented by three spaces or fewer
// (CommonMark). A line of ``` indented by four spaces, inside an indented code
// block in the section, does not close it: consolidate writes the whole
// section into the baseline, and context reads the same whole section.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { block } from './helpers/change.js';
import { ENV, addRequest, both } from './helpers/request.js';
import { says } from './helpers/links.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
// An indented code block holding a ``` line, then a closing paragraph.
const NEW1 = '## [NEW-1] Credit notes\nA credit note MUST name its invoice.\n\n' +
  '    ```\n    const note = credit(invoice);\n    ```\n\nThe credit note MUST carry the invoice number.\n';

// Main: the baseline INV-1; the signed request notes holding
// [NEW-1]@1 add in specs/new.md, its Now fenced with ```.
function setup(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  addRequest(repo, 'notes', [block('[NEW-1]@1 add in specs/new.md   for R1', { now: NEW1, fenced: true })]);
  repo.commit('notes: request', { date: '2026-09-21T12:00:00Z' });
  const md = repo.read('requests/notes/change.md').toString();
  assert.ok(md.includes('```\n## [NEW-1] Credit notes') && md.includes('carry the invoice number.\n```'), `the fixture: the Now is fenced whole:\n${md}`);
  return repo;
}

test('#138 [SPC-5][STA-4] a fenced Now holding a ``` line indented by four spaces: consolidate notes --yes writes the whole section into specs/new.md, its last line included', (t) => {
  const repo = setup(t);
  const r = runAl(repo.dir, ['consolidate', 'notes', '--yes'], { env: ENV });
  assert.equal(r.code, 0, both(r));
  assert.equal(repo.read('specs/new.md').toString().trim(), NEW1.trim(), 'the baseline gets the whole Now');
});

test('#138 [SPC-5][STA-2] after consolidate notes --yes, context notes says NEW-1 consolidated, and NEW-1 in the baseline is the whole section', (t) => {
  const repo = setup(t);
  assert.equal(runAl(repo.dir, ['consolidate', 'notes', '--yes'], { env: ENV }).code, 0);
  const c = runAl(repo.dir, ['context', 'notes']);
  assert.equal(c.code, 0, both(c));
  assert.ok(says(c.stdout, 'NEW-1', 'consolidated'), `NEW-1 should read consolidated:\n${c.stdout}`);
  const s = runAl(repo.dir, ['context', 'NEW-1']);
  assert.equal(s.code, 0, both(s));
  assert.ok(s.stdout.includes('The credit note MUST carry the invoice number.'), `NEW-1 holds its last line:\n${s.stdout}`);
});

test('#138 [SPC-5][STA-2] with the whole Now written into the baseline by hand, context notes says NEW-1 consolidated: it reads the same whole Now', (t) => {
  const repo = setup(t);
  repo.write('specs/new.md', NEW1);
  const c = runAl(repo.dir, ['context', 'notes']);
  assert.equal(c.code, 0, both(c));
  assert.ok(says(c.stdout, 'NEW-1', 'consolidated'), `the whole Now is in the baseline:\n${c.stdout}`);
});
