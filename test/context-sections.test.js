// al context <name> [VW-2]: each held section with its state [STA-1][STA-2]
// and its requirement, the decisions newest first with agent rulings marked,
// the parts, other open requests in the same spec file, at most three hints,
// in twelve lines or fewer, keeping the BLOCKED first line [REC-6].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRepo, runAl, sha256 } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';
import { block, changeMd } from './helpers/change.js';
import { says } from './helpers/links.js';
import { count } from './helpers/evidence.js';

const WORDS = 'Customers keep asking to download their invoices.\n';
const ORG = '## Organized requirement\n\n### R1 Invoice export\nA customer MUST be able to export one invoice as CSV.\n\n' +
  '### R2 Dates\nDates MUST show in ISO 8601.\n';

// A signed request (not blocked) with `rest` after the Signed off line, and a change.md of `blocks`.
function addRequest(repo, name, title, blocks, { rest = '', status = 'open', dir = `requests/${name}`, signed = true } = {}) {
  repo.write(`${dir}/request.md`, `# ${title}\nType: story · Tier: 2 · Status: ${status}\n\n## Owner's words and dialog\n\n` +
    '- 2026-09-20 owner chat, snapshot origin/2026-09-20-owner-words.md\n\n' +
    `${ORG}Signed off: ${signed ? '2026-09-21 owner, origin/2026-09-21-signoff.md' : 'pending'}\n${rest}`);
  repo.write(`${dir}/origin/2026-09-20-owner-words.md`,
    `Source: standard input\nFetched: 2026-09-20T09:00Z\nSHA-256: ${sha256(WORDS)}\n---\n${WORDS}`);
  if (signed) {
    repo.write(`${dir}/origin/2026-09-21-signoff.md`, 'Source: chat with the owner\nOwner\'s words: "Signed"\n' +
      `Fetched: 2026-09-21T10:00Z\nSHA-256: ${sha256(ORG)}   (of the signed text below)\n--- signed text ---\n${ORG}`);
  }
  if (blocks) repo.write(`${dir}/change.md`, changeMd(...blocks));
}

const S0 = '## [INV-3] Dates\nDates show in the customer\'s local format.\n';
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const S2 = '## [INV-3] Dates\nDates MUST show in ISO 8601, with the time zone.\n';
const S3 = '## [INV-3] Dates\nDates MUST show in ISO 8601, with the time zone, to the second.\n';
const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const INV4A = '## [INV-4] Separator\nThe CSV separator is a comma.\n';
const INV4B = '## [INV-4] Separator\nThe CSV separator MUST be a semicolon.\n';
const INV5 = '## [INV-5] Cancelling\nAn invoice can be cancelled.\n';
const INV6 = '## [INV-6] Credit notes\nA credit note cancels an invoice.\n';
const INV7 = '## [INV-7] CSV export\nA customer MUST be able to export one invoice as CSV.\n';
const SES1 = '## [SES-1] Session length\nA session lasts one day.\n';

const context = (repo, name = 'invoice-download') => runAl(repo.dir, ['context', name]);
// The ID as a whole token: INV-3 but not INV-30 or INV-3.1.
const hasId = (line, id) => new RegExp(`(^|[^\\w.-])\\[?${id.replace('.', '\\.')}\\]?(?![\\w.]|-\\d)`).test(line);
const lineWith = (stdout, ...parts) => lines(stdout).find((l) => parts.every((p) => (/^[A-Z]+-\d/.test(p) ? hasId(l, p) : l.includes(p))));
function assertLine(stdout, ...parts) {
  assert.ok(lineWith(stdout, ...parts), `expected a line with ${parts.map((p) => JSON.stringify(p)).join(' and ')}:\n${stdout}`);
}
const assertCap = (r) => assert.ok(lines(r.stdout).length <= 12, `more than 12 lines:\n${r.stdout}`);

test('[VW-2] context shows the title, type, tier and status, and each held section with its state and its R', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', [INV1, S1, INV4A].join('\n'));
  addRequest(repo, 'invoice-download', 'Customers can download invoices', [
    block('[INV-3]@1 modify   for R2', { was: S0, now: S1 }),
    block('[INV-4]@1 modify   for R1', { was: INV4A, now: INV4B }),
  ]);
  const r = context(repo);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(!r.stdout.includes('BLOCKED'), r.stdout);
  assert.ok(r.stdout.includes('Customers can download invoices'), r.stdout);
  assert.ok(r.stdout.includes('story'), r.stdout);
  assert.match(r.stdout, /tier\W{0,3}2\b/i);
  assert.ok(r.stdout.includes('open'), r.stdout);
  assertLine(r.stdout, 'INV-3', 'consolidated', 'R2');
  assertLine(r.stdout, 'INV-4', 'pending', 'R1');
  assert.ok(!r.stdout.includes('not ok'), r.stdout);
  assertCap(r);
  assertFrame(r.stdout);
});

test('[VW-2][REC-6] context of an unsigned request keeps BLOCKED on the first line and still shows its sections', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', [INV1, S0].join('\n'));
  addRequest(repo, 'invoice-download', 'Customers can download invoices',
    [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })], { signed: false });
  const r = context(repo);
  assert.equal(r.code, 0, r.stderr);
  assert.match(lines(r.stdout)[0], /^BLOCKED/, r.stdout);
  assertLine(r.stdout, 'INV-3', 'pending');
  assertCap(r);
  assertFrame(r.stdout);
});

test('[VW-2] context names the carried and waiting sections with their state', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', [INV1, S0].join('\n'));
  addRequest(repo, 'cancel-invoices', 'Invoices can be cancelled', [block('[INV-3]@1 modify   for R1', { was: S0, now: S1 })]);
  addRequest(repo, 'invoice-download', 'Customers can download invoices',
    [block('[INV-3]@1 modify   builds on cancel-invoices/INV-3@1   for R2', { was: S1, now: S2 })]);
  const waiting = context(repo);
  assert.equal(waiting.code, 0, waiting.stderr);
  assertLine(waiting.stdout, 'INV-3', 'waiting');

  repo.write('specs/invoices.md', [INV1, S2].join('\n'));
  const carried = context(repo, 'cancel-invoices');
  assert.equal(carried.code, 0, carried.stderr);
  assertLine(carried.stdout, 'INV-3', 'carried');
});

test('[VW-2] context caps a request holding fifteen sections at twelve lines, with Next and Not known last', (t) => {
  const repo = makeRepo(t);
  const was = (n) => `## [INV-${n}] Rule ${n}\nRule ${n} holds.\n`;
  const now = (n) => `## [INV-${n}] Rule ${n}\nRule ${n} MUST hold.\n`;
  const ns = Array.from({ length: 15 }, (_, i) => i + 11);
  repo.write('specs/invoices.md', ns.map((n) => (n % 2 ? now(n) : was(n))).join('\n'));
  addRequest(repo, 'invoice-download', 'Customers can download invoices',
    ns.map((n) => block(`[INV-${n}]@1 modify   for R${n % 2 ? 1 : 2}`, { was: was(n), now: now(n) })));
  const r = context(repo);
  assert.equal(r.code, 0, r.stderr);
  assertCap(r);
  assertFrame(r.stdout);
  assert.ok(lines(r.stdout).some((l) => l.includes('pending')), r.stdout);
  assert.ok(lines(r.stdout).some((l) => l.includes('consolidated')), r.stdout);
});

// The Decided line: D-numbers in order, and the text from each to the next.
function decided(stdout) {
  const line = lines(stdout).find((l) => /^Decided\b/.test(l));
  assert.ok(line, `expected a line starting with Decided:\n${stdout}`);
  return line;
}
const segment = (line, d, next) => line.slice(line.indexOf(d), next ? line.indexOf(next) : undefined);

test('[VW-2] Decided lists the decisions newest first and marks the agent\'s ruling (its Source spans two lines)', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', [INV1, S0].join('\n'));
  addRequest(repo, 'invoice-download', 'Customers can download invoices', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })], {
    rest: '\n## Decisions\n\n' +
      '- D1, 2026-09-21. Source: the owner. CSV only for now.\n' +
      '- D2, 2026-09-24. Source: the review of PR #9 (reviewer);\n  ruling by the agent (architect). Semicolon as separator.\n' +
      '- D3, 2026-09-25. Source: the owner, in review. Dates in ISO 8601.\n',
  });
  const r = context(repo);
  assert.equal(r.code, 0, r.stderr);
  const line = decided(r.stdout);
  for (const d of ['D1', 'D2', 'D3']) assert.ok(line.includes(d), `Decided should name ${d}:\n${r.stdout}`);
  assert.ok(line.indexOf('D3') < line.indexOf('D2') && line.indexOf('D2') < line.indexOf('D1'), `newest first:\n${line}`);
  assert.match(segment(line, 'D2', 'D1'), /agent/i, `D2 should be marked as the agent's ruling:\n${line}`);
  assert.doesNotMatch(segment(line, 'D3', 'D2'), /agent/i, `D3 is the owner's:\n${line}`);
  assert.doesNotMatch(segment(line, 'D1'), /agent/i, `D1 is the owner's:\n${line}`);
  assertCap(r);
});

test('[VW-2] Parts shows the ## Parts lines', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', [INV1, S0].join('\n'));
  addRequest(repo, 'invoice-download', 'Customers can download invoices', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })], {
    rest: '\n## Parts\n\n1. CSV export: request csv-export\n2. Date format\n',
  });
  const r = context(repo);
  assert.equal(r.code, 0, r.stderr);
  const line = lines(r.stdout).find((l) => /^Parts\b/.test(l));
  assert.ok(line, `expected a line starting with Parts:\n${r.stdout}`);
  assert.ok(line.includes('CSV export') && line.includes('Date format'), line);
  assertCap(r);
});

test('[VW-2] context names the other open requests holding sections in the same spec file, and not those in other files or archived', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', [INV1, S0, INV5, INV6].join('\n'));
  repo.write('specs/sessions.md', SES1);
  addRequest(repo, 'invoice-download', 'Customers can download invoices', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  addRequest(repo, 'cancel-invoices', 'Invoices can be cancelled',
    [block('[INV-5]@1 modify   for R1', { was: INV5, now: INV5.replace('can be', 'MUST be able to be') })]);
  addRequest(repo, 'csv-export', 'CSV export', [block('[INV-7]@1 add in specs/invoices.md   for R1', { now: INV7 })]);
  addRequest(repo, 'login-expiry', 'Sessions expire', [block('[SES-1]@1 modify   for R1', { was: SES1, now: SES1.replace('lasts', 'MUST last') })]);
  addRequest(repo, 'old-credit', 'Credit notes', [block('[INV-6]@1 modify   for R1', { was: INV6.replace('cancels', 'voids'), now: INV6 })],
    { status: 'concluded', dir: 'requests/archive/old-credit' });

  const r = context(repo);
  assert.equal(r.code, 0, r.stderr);
  assertLine(r.stdout, 'cancel-invoices', 'INV-5');
  assertLine(r.stdout, 'csv-export', 'INV-7');
  assert.ok(!r.stdout.includes('login-expiry'), `another file's request should not be named:\n${r.stdout}`);
  assert.ok(!r.stdout.includes('old-credit'), `an archived request should not be named:\n${r.stdout}`);
  assertCap(r);

  const other = context(repo, 'login-expiry');
  assert.equal(other.code, 0, other.stderr);
  for (const name of ['invoice-download', 'cancel-invoices', 'csv-export']) {
    assert.ok(!other.stdout.includes(name), `login-expiry shares no file with ${name}:\n${other.stdout}`);
  }
});

// One held INV-3 (or INV-4) in each case; a hint says `not ok` and names it.
const HINT_CASES = {
  differs: (repo) => {
    repo.write('specs/invoices.md', [INV1, S3].join('\n'));
    addRequest(repo, 'invoice-download', 'Customers can download invoices', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
    return 'INV-3';
  },
  'broken link': (repo) => {
    repo.write('specs/invoices.md', [INV1, S1].join('\n'));
    addRequest(repo, 'invoice-download', 'Customers can download invoices',
      [block('[INV-3]@1 modify   builds on nosuch/INV-3@1   for R2', { was: S1, now: S2 })]);
    return 'INV-3';
  },
  'base revised': (repo) => {
    repo.write('specs/invoices.md', [INV1, S1].join('\n'));
    addRequest(repo, 'cancel-invoices', 'Invoices can be cancelled', [
      block('[INV-3]@1 modify   Revised 2026-09-24 (D1)   for R1', { was: S0, now: S1 }),
      block('[INV-3]@2 modify   for R1', { was: S1, now: S3 }),
    ]);
    addRequest(repo, 'invoice-download', 'Customers can download invoices',
      [block('[INV-3]@1 modify   builds on cancel-invoices/INV-3@1   for R2', { was: S1, now: S2 })]);
    return 'INV-3';
  },
  'base dropped': (repo) => {
    repo.write('specs/invoices.md', [INV1, S0].join('\n'));
    addRequest(repo, 'cancel-invoices', 'Invoices can be cancelled', [block('[INV-3]@1 modify   for R1', { was: S0, now: S1 })], { status: 'dropped' });
    addRequest(repo, 'invoice-download', 'Customers can download invoices',
      [block('[INV-3]@1 modify   builds on cancel-invoices/INV-3@1   for R2', { was: S1, now: S2 })]);
    return 'INV-3';
  },
  'not found': (repo) => {
    repo.write('specs/invoices.md', [INV1, S0].join('\n'));
    addRequest(repo, 'invoice-download', 'Customers can download invoices', [block('[INV-4]@1 modify   for R1', { was: INV4A, now: INV4B })]);
    return 'INV-4';
  },
};

for (const [state, setup] of Object.entries(HINT_CASES)) {
  test(`[VW-2][STA-1][STA-2] a held section that reads ${state}: a "not ok" hint naming its ID, and the section line says ${state}`, (t) => {
    const repo = makeRepo(t);
    const id = setup(repo);
    const r = context(repo);
    assert.equal(r.code, 0, r.stderr);
    assertLine(r.stdout, 'not ok', id);
    assertLine(r.stdout, id, state);
    assertCap(r);
    assertFrame(r.stdout);
  });
}

test('[VW-2] at most three hints: five sections that differ give one to three "not ok"s, in twelve lines', (t) => {
  const repo = makeRepo(t);
  const ns = [11, 12, 13, 14, 15];
  repo.write('specs/invoices.md', ns.map((n) => `## [INV-${n}] Rule ${n}\nRule ${n} changed underneath.\n`).join('\n'));
  addRequest(repo, 'invoice-download', 'Customers can download invoices',
    ns.map((n) => block(`[INV-${n}]@1 modify   for R1`, { was: `## [INV-${n}] Rule ${n}\nRule ${n} holds.\n`, now: `## [INV-${n}] Rule ${n}\nRule ${n} MUST hold.\n` })));
  const r = context(repo);
  assert.equal(r.code, 0, r.stderr);
  const count = (r.stdout.match(/not ok/g) ?? []).length;
  assert.ok(count >= 1 && count <= 3, `expected 1 to 3 "not ok" hints, got ${count}:\n${r.stdout}`);
  assertCap(r);
  assertFrame(r.stdout);
});

test('[VW-2][REC-6] the 12-line cap with every optional line at once: blocked, decisions, parts, a same-file request, and more not-ok hints than fit', (t) => {
  const repo = makeRepo(t);
  const ns = [11, 12, 13, 14, 15];
  repo.write('specs/invoices.md', [...ns.map((n) => `## [INV-${n}] Rule ${n}\nRule ${n} changed underneath.\n`), INV5].join('\n'));
  addRequest(repo, 'invoice-download', 'Customers can download invoices',
    ns.map((n) => block(`[INV-${n}]@1 modify   for R1`, { was: `## [INV-${n}] Rule ${n}\nRule ${n} holds.\n`, now: `## [INV-${n}] Rule ${n}\nRule ${n} MUST hold.\n` })), {
      signed: false,
      rest: '\n## Decisions\n\n' +
        '- D1, 2026-09-21. Source: the owner. CSV only for now.\n' +
        '- D2, 2026-09-24. Source: ruling by the agent (architect). Semicolon as separator.\n' +
        '- D3, 2026-09-25. Source: the owner, in review. Dates in ISO 8601.\n' +
        '\n## Parts\n\n1. CSV export: request csv-export\n2. Date format\n3. Email link\n',
    });
  addRequest(repo, 'cancel-invoices', 'Invoices can be cancelled',
    [block('[INV-5]@1 modify   for R1', { was: INV5, now: INV5.replace('can be', 'MUST be able to be') })]);
  const r = context(repo);
  assert.equal(r.code, 0, r.stderr);
  assert.match(lines(r.stdout)[0], /^BLOCKED/, r.stdout);
  assertCap(r);
  assertFrame(r.stdout);
  assert.match(r.stdout, /not ok/, `at least one not-ok hint should fit:\n${r.stdout}`);
});

// Real data. The archived request is append-only [REC-12]; its view reads
// the history that archived it [STA-8], never today's baseline. The IDs it
// holds are read here from its change.md's block headings.
const V1 = 'requests/archive/assuredloop-v1';
function heldIds(root) {
  const change = readFileSync(join(root, V1, 'change.md'), 'utf8');
  const blocks = [...change.matchAll(/^### \[([A-Z][A-Z0-9]*-\d+(?:\.\d+)*)\]@(\d+)/gm)].map((m) => ({ id: m[1], n: Number(m[2]) }));
  return { ids: [...new Set(blocks.map((b) => b.id))], later: blocks.filter((b) => b.n > 1) };
}

test('[VW-2] real data: the archived assuredloop-v1 copied back under requests/ onto an empty baseline: context gives the count in each state (every @1 pending, each later block waiting and named) and D1 as the agent\'s ruling, in twelve lines', (t) => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const { ids, later } = heldIds(root);
  assert.ok(ids.length > 40 && later.length > 0, `the fixture: v1 holds every section, some revised: ${ids.length}, ${later.length}`);
  const repo = makeRepo(t);
  cpSync(join(root, V1), join(repo.dir, 'requests/assuredloop-v1'), { recursive: true });
  const r = context(repo, 'assuredloop-v1');
  assert.equal(r.code, 0, r.stderr);
  assert.ok(!r.stdout.includes('BLOCKED'), r.stdout);
  const spec = lines(r.stdout).find((l) => /^Spec\b/.test(l));
  assert.ok(spec, `expected a line starting with Spec:\n${r.stdout}`);
  assert.match(spec, count(ids.length, 'pending'), spec);
  assert.match(spec, count(later.length, 'waiting'), spec);
  for (const { id, n } of later) assert.ok(spec.includes(`${id}@${n}`), `the Spec line should name ${id}@${n}:\n${spec}`);
  assert.match(segment(decided(r.stdout), 'D1'), /agent/i);
  assertCap(r);
  assertFrame(r.stdout);
});

test('[VW-6][STA-8] real data: the archived assuredloop-v1, committed to a fixture\'s main with specs/, is concluded on main at that commit, shows each section it held as at conclusion, and D1 as the agent\'s ruling, in twelve lines', (t) => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const { ids } = heldIds(root);
  const repo = makeRepo(t);
  cpSync(join(root, V1), join(repo.dir, V1), { recursive: true });
  cpSync(join(root, 'specs'), join(repo.dir, 'specs'), { recursive: true });
  const archived = repo.commit('Archive assuredloop-v1', { date: '2026-09-28T15:05:00Z' });
  const r = context(repo, 'assuredloop-v1');
  assert.equal(r.code, 0, r.stderr);
  assert.match(lines(r.stdout)[0], /assuredloop-v1.*\bconcluded\b/, r.stdout);
  assert.ok(lines(r.stdout).some((l) => /concluded on main/i.test(l) && l.includes(archived.slice(0, 7))),
    `a line should say it concluded on main at ${archived.slice(0, 7)}:\n${r.stdout}`);
  for (const id of ids) assert.ok(says(r.stdout, id, /as at conclusion/), `${id} should read as at conclusion:\n${r.stdout}`);
  assert.match(segment(decided(r.stdout), 'D1'), /agent/i);
  assertCap(r);
  assertFrame(r.stdout);
});
