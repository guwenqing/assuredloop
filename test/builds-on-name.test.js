// Issue #138, item 3 [TL-1] [STA-5] [SPC-5] [REC-1]: `al record <name>
// section <ID> --builds-on <x>` takes x as a request name, as every other
// request argument: a path is refused before anything is read (exit 2, "is
// not a request name"), and with --yes nothing is written. A plain name finds
// the request where it is, open or archived, so an archived request's block
// can be pinned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { makeRepo, runAl } from './helpers/fixture.js';
import { block, changeMd } from './helpers/change.js';
import { addRequest, both } from './helpers/request.js';

const ENV = { SOURCE_DATE_EPOCH: '1790206200' }; // 2026-09-23T23:30Z
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const OUTSIDE = '## [INV-3] Dates\nThe outside text.\n';

// Main: the baseline INV-3 at S0; the open request mine with no change.md;
// the archived request old holding [INV-3]@1 (S0 to S1). Beside the repo,
// outside/ holds a request.md and a change.md with a block for INV-3.
function setup(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', S0);
  addRequest(repo, 'mine', null);
  addRequest(repo, 'old', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })], { dir: 'requests/archive/old', status: 'concluded' });
  repo.commit('mine open, old archived', { date: '2026-09-21T12:00:00Z' });
  const out = join(dirname(repo.dir), 'outside');
  mkdirSync(out);
  writeFileSync(join(out, 'request.md'), '# Outside\nType: story · Tier: 2 · Status: open\n');
  writeFileSync(join(out, 'change.md'), changeMd(block('[INV-3]@1 modify', { was: S0, now: OUTSIDE })));
  return repo;
}

const section = (repo, ...args) => runAl(repo.dir, ['record', 'mine', 'section', 'INV-3', ...args], { env: ENV });

test('#138 [TL-1][REC-1] record mine section INV-3 --builds-on ../../outside: exit 2, "is not a request name", nothing read from outside; with --yes nothing written', (t) => {
  const repo = setup(t);
  for (const extra of [[], ['--yes']]) {
    const r = section(repo, '--builds-on', '../../outside', ...extra);
    assert.equal(r.code, 2, `--builds-on ../../outside ${extra.join(' ')}:\n${both(r)}`);
    assert.match(both(r), /is not a request name/, both(r));
    assert.ok(!both(r).includes('The outside text.') && !both(r).includes('../../outside/INV-3'), `nothing read from outside:\n${both(r)}`);
    assert.equal(repo.git(['status', '--porcelain', '--untracked-files=all']), '', 'nothing written');
    assert.ok(!existsSync(join(repo.dir, 'requests/mine/change.md')), 'no change.md');
  }
});

test('#138 [TL-1][STA-5] record mine section INV-3 --builds-on old, archived with a block for INV-3: names old/INV-3@1 (exit 0, nothing written); with --yes change.md builds on old/INV-3@1, its Now as Was and Now', (t) => {
  const repo = setup(t);
  const r = section(repo, '--builds-on', 'old');
  assert.equal(r.code, 0, both(r));
  assert.ok(r.stdout.includes('old/INV-3@1'), `should pin old's block:\n${r.stdout}`);
  assert.equal(repo.git(['status', '--porcelain', '--untracked-files=all']), '', 'nothing written without --yes');
  const w = section(repo, '--builds-on', 'old', '--yes');
  assert.equal(w.code, 0, both(w));
  const md = repo.read('requests/mine/change.md').toString();
  assert.match(md, /^### \[INV-3\]@1 modify\b.*\bbuilds on old\/INV-3@1\b/m, md);
  assert.ok(md.includes('Dates MUST show in ISO 8601.') && !md.includes("customer's local format"), `Was and Now are old's Now:\n${md}`);
});
