// al context <name>: the blocked state [REC-6] from the sign-off files [REC-5]
// and the organized section [REC-4], compared like a section [SPC-4]; C7.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { makeRepo, runAl, sha256 } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';

const WORDS = 'Customers keep asking to download their invoices.\n';
const snap = (source, fetched, text) => `Source: ${source}\nFetched: ${fetched}\nSHA-256: ${sha256(text)}\n---\n${text}`;
const signoff = (fetched, text, hash = sha256(text)) => 'Source: chat with the owner\nOwner\'s words: "Signed"\n' +
  `Fetched: ${fetched}\nSHA-256: ${hash}   (of the signed text below)\n--- signed text ---\n${text}`;

const R1 = '### R1 Invoice export\nA customer MUST be able to export one invoice as CSV from the invoice page.\n';
const R2 = '### R2 Email link\nThe invoice email MUST carry a link to the same CSV download.\n';
const R2_EDITED = '### R2 Email link\nThe invoice email MUST carry a link to the same CSV or PDF download.\n';
const R3 = '### R3 Reminder\nAn unpaid invoice MUST be emailed again after 14 days.\n';
const OUT = 'Out: PDF export; period exports.\n';
const ASSUMED = 'Assumed: Excel users in comma-decimal locales need \';\' as the separator.\n';
const ORG = `## Organized requirement\n\n${R1}\n${R2}\n${OUT}\n${ASSUMED}`;
const DECISIONS = '\n## Decisions\n\n- D1, 2026-09-21. Source: the owner. CSV only for now.\n';

// request.md: the owner's words, the organized section `org` (if any), a
// Signed off line, then a Decisions section (outside the organized section).
const requestMd = (title, org, { type = 'story', signedOff = '', extra = '' } = {}) =>
  `# ${title}\nType: ${type} · Tier: 2 · Status: open\n\n## Owner's words and dialog\n\n` +
  '- 2026-09-20 owner chat, snapshot origin/2026-09-20-owner-words.md\n\n' +
  (org ?? '') + (signedOff ? `Signed off: ${signedOff}\n` : '') + DECISIONS + extra;

function addRequest(repo, name, title, org, opts) {
  repo.write(`requests/${name}/request.md`, requestMd(title, org, opts));
  repo.write(`requests/${name}/origin/2026-09-20-owner-words.md`, snap('standard input', '2026-09-20T09:00Z', WORDS));
}
const addSignoff = (repo, name, file, fetched, text, hash) =>
  repo.write(`requests/${name}/origin/${file}`, signoff(fetched, text, hash));

const first = (stdout) => lines(stdout)[0];
// A line naming the sign-off file that is not the list of all snapshots
// (that list also names the owner's words, and the other sign-offs).
const namesSignoff = (stdout, file, notWith = []) =>
  lines(stdout).some((l) => l.includes(file) && ![/owner-words|owner-inputs/, ...notWith].some((x) => l.match(x)));

function assertBlocked(r, ...parts) {
  assert.equal(r.code, 0, r.stderr);
  assert.match(first(r.stdout), /^BLOCKED/, `first line should start with BLOCKED:\n${r.stdout}`);
  for (const p of parts) assert.ok(first(r.stdout).includes(p), `first line should contain ${JSON.stringify(p)}:\n${r.stdout}`);
  assert.ok(lines(r.stdout).length <= 12, `more than 12 lines:\n${r.stdout}`);
}

function assertSigned(r, file, notWith) {
  assert.equal(r.code, 0, r.stderr);
  assert.ok(!r.stdout.includes('BLOCKED'), `should not be blocked:\n${r.stdout}`);
  assert.ok(namesSignoff(r.stdout, file, notWith), `a line should name the sign-off ${file}:\n${r.stdout}`);
  assert.ok(lines(r.stdout).length <= 12, `more than 12 lines:\n${r.stdout}`);
}

// A signed request: the organized section ORG, signed 2026-09-21.
function signed(t) {
  const repo = makeRepo(t);
  addRequest(repo, 'invoice-download', 'Customers can download invoices', ORG,
    { signedOff: '2026-09-21 owner, origin/2026-09-21-signoff.md' });
  addSignoff(repo, 'invoice-download', '2026-09-21-signoff.md', '2026-09-21T10:00Z', ORG);
  return repo;
}
const setOrg = (repo, org) => repo.write('requests/invoice-download/request.md',
  requestMd('Customers can download invoices', org, { signedOff: '2026-09-21 owner, origin/2026-09-21-signoff.md' }));
const context = (repo, name = 'invoice-download', args = []) => runAl(repo.dir, ['context', name, ...args]);

test('[REC-6] context with no sign-off shows "BLOCKED ... awaiting owner sign-off" on the first line, exit 0', (t) => {
  const repo = makeRepo(t);
  addRequest(repo, 'invoice-download', 'Customers can download invoices', ORG, { signedOff: 'pending' });
  const r = context(repo);
  assertBlocked(r, 'awaiting owner sign-off');
  assertFrame(r.stdout);
});

test('[REC-5][REC-6] context of a signed, unchanged request is not blocked and names the sign-off', (t) => {
  const repo = signed(t);
  const r = context(repo);
  assertSigned(r, '2026-09-21-signoff.md');
  assertFrame(r.stdout);
});

test('[REC-6] context after R2 changed: first line "BLOCKED ... changed since 2026-09-21-signoff.md", names R2 and not R1', (t) => {
  const repo = signed(t);
  setOrg(repo, ORG.replace(R2, R2_EDITED));
  const r = context(repo);
  assertBlocked(r, 'changed since', '2026-09-21-signoff.md');
  assert.match(r.stdout, /\bR2\b/, `should name R2:\n${r.stdout}`);
  assert.doesNotMatch(r.stdout, /\bR1\b/, `should not name the unchanged R1:\n${r.stdout}`);
  assertFrame(r.stdout);
});

test('[REC-4][REC-6] context after the Out line changed names Out; after the Assumed line changed names Assumed', (t) => {
  const repo = signed(t);
  setOrg(repo, ORG.replace(OUT, 'Out: period exports.\n'));
  const out = context(repo);
  assertBlocked(out, 'changed since', '2026-09-21-signoff.md');
  assert.match(out.stdout, /\bOut\b/, `should name Out:\n${out.stdout}`);
  assert.doesNotMatch(out.stdout, /\bR[12]\b/, `should not name unchanged R1, R2:\n${out.stdout}`);

  setOrg(repo, ORG.replace(ASSUMED, 'Assumed: nothing.\n'));
  const assumed = context(repo);
  assertBlocked(assumed, 'changed since', '2026-09-21-signoff.md');
  assert.match(assumed.stdout, /\bAssumed\b/, `should name Assumed:\n${assumed.stdout}`);
  assert.doesNotMatch(assumed.stdout, /\bR[12]\b/, `should not name unchanged R1, R2:\n${assumed.stdout}`);
});

test('[REC-4][REC-6] context after an R3 was added is blocked and names R3', (t) => {
  const repo = signed(t);
  setOrg(repo, ORG.replace(OUT, `${R3}\n${OUT}`));
  const r = context(repo);
  assertBlocked(r, 'changed since', '2026-09-21-signoff.md');
  assert.match(r.stdout, /\bR3\b/, `should name R3:\n${r.stdout}`);
});

test('[SPC-4][REC-6] blank lines at the edges, after the heading, and trailing spaces or tabs do not block', (t) => {
  const repo = signed(t);
  const reflowed = '## Organized requirement   \n\n\n\n' +
    R1.replace('\n', ' \t\n') + '\n' + R2.replace('download.', 'download.  ') + '\n' + OUT + '\n' + ASSUMED + '\n\n\n';
  setOrg(repo, reflowed);
  assertSigned(context(repo), '2026-09-21-signoff.md');

  // A changed word still blocks, with the same reflowing around it.
  setOrg(repo, reflowed.replace('one invoice', 'two invoices'));
  assertBlocked(context(repo), 'changed since');
});

test('[REC-4][REC-6] context of a request with no organized section: "BLOCKED ... no organized requirement"', (t) => {
  const repo = makeRepo(t);
  addRequest(repo, 'invoice-download', 'Customers can download invoices', null);
  const r = context(repo);
  assertBlocked(r, 'no organized requirement');
  assertFrame(r.stdout);
});

test('[REC-4][REC-5] a spike\'s signed "Organized question" is not blocked; unsigned it is', (t) => {
  const repo = makeRepo(t);
  const question = '## Organized question\n\nWe want to know whether PDF rendering works without a native dependency.\n' +
    'A useful answer names one library, with a sample output, or says why none fits.\nOut: layout quality.\n';
  addRequest(repo, 'pdf-spike', 'Can we render PDF without native code', question, { type: 'spike' });
  assertBlocked(context(repo, 'pdf-spike'), 'awaiting owner sign-off');

  addSignoff(repo, 'pdf-spike', '2026-09-22-signoff.md', '2026-09-22T08:00Z', question);
  assertSigned(context(repo, 'pdf-spike'), '2026-09-22-signoff.md');
});

test('[REC-5] the latest sign-off (by Fetched) counts: an older one matching the current text does not unblock', (t) => {
  const repo = makeRepo(t);
  addRequest(repo, 'invoice-download', 'Customers can download invoices', ORG);
  // File names in the reverse order of Fetched, so only Fetched can tell.
  addSignoff(repo, 'invoice-download', '2026-09-21-signoff.md', '2026-09-21T10:00Z', ORG);
  addSignoff(repo, 'invoice-download', '2026-09-21-signoff-2.md', '2026-09-22T10:00Z', ORG.replace(R2, R2_EDITED));
  assertBlocked(context(repo), 'changed since', '2026-09-21-signoff-2.md');
});

test('[REC-5] the latest sign-off (by Fetched) counts: a newer one matching the current text unblocks', (t) => {
  const repo = makeRepo(t);
  addRequest(repo, 'invoice-download', 'Customers can download invoices', ORG);
  addSignoff(repo, 'invoice-download', '2026-09-21-signoff.md', '2026-09-22T10:00Z', ORG);
  addSignoff(repo, 'invoice-download', '2026-09-21-signoff-2.md', '2026-09-21T10:00Z', ORG.replace(R2, R2_EDITED));
  assertSigned(context(repo), '2026-09-21-signoff.md', ['2026-09-21-signoff-2.md']);
});

test('[REC-5][REC-6] a sign-off whose signed text no longer matches its SHA-256 does not count', (t) => {
  const repo = makeRepo(t);
  addRequest(repo, 'invoice-download', 'Customers can download invoices', ORG);
  // The signed text equals the current section, but the hash is of other text.
  addSignoff(repo, 'invoice-download', '2026-09-21-signoff.md', '2026-09-21T10:00Z', ORG, sha256(ORG.replace(R2, R2_EDITED)));
  assertBlocked(context(repo));
});

test('[REC-5] a sign-off with a bad hash is dropped before the latest is chosen: an older good one matching the text counts', (t) => {
  const repo = makeRepo(t);
  addRequest(repo, 'invoice-download', 'Customers can download invoices', ORG);
  addSignoff(repo, 'invoice-download', '2026-09-21-signoff.md', '2026-09-21T10:00Z', ORG);
  // Newer, but its signed text is not the text its hash is of.
  const edited = ORG.replace(R2, R2_EDITED);
  addSignoff(repo, 'invoice-download', '2026-09-22-signoff.md', '2026-09-22T10:00Z', edited.replace('PDF', 'XLS'), sha256(edited));
  assertSigned(context(repo), '2026-09-21-signoff.md', ['2026-09-22-signoff.md']);
});

// Two sign-offs with the same Fetched: one of ORG (matching), one of other text.
function tie(t, signedOff, matching, other) {
  const repo = makeRepo(t);
  addRequest(repo, 'invoice-download', 'Customers can download invoices', ORG, { signedOff });
  addSignoff(repo, 'invoice-download', matching, '2026-09-21T10:00Z', ORG);
  addSignoff(repo, 'invoice-download', other, '2026-09-21T10:00Z', ORG.replace(R2, R2_EDITED));
  return repo;
}

test('[REC-5] a tie on Fetched: the sign-off that the Signed off line names counts, whichever file name it has', (t) => {
  for (const [matching, other] of [['2026-09-21-signoff.md', '2026-09-21-signoff-2.md'], ['2026-09-21-signoff-2.md', '2026-09-21-signoff.md']]) {
    const repo = tie(t, `2026-09-21 owner, origin/${matching}`, matching, other);
    assertSigned(context(repo), matching, [other]);
  }
  // The Signed off line naming the file whose text does not match: blocked.
  const repo = tie(t, '2026-09-21 owner, origin/2026-09-21-signoff-2.md', '2026-09-21-signoff.md', '2026-09-21-signoff-2.md');
  assertBlocked(context(repo), 'changed since', '2026-09-21-signoff-2.md');
});

test('[REC-5][REC-6] a tie on Fetched that the Signed off line does not settle: BLOCKED, with a hint naming the time and "not known"', (t) => {
  for (const signedOff of ['pending', '2026-09-20 owner, origin/2026-09-20-signoff.md']) {
    const repo = tie(t, signedOff, '2026-09-21-signoff.md', '2026-09-21-signoff-2.md');
    const r = context(repo);
    assertBlocked(r);
    assert.ok(lines(r.stdout).some((l) => l.includes('2026-09-21T10:00Z') && /not known/i.test(l)),
      `a line should give the shared time and say which counts is not known:\n${r.stdout}`);
  }
});

test('C7 [REC-6] "changed since sign-off" survives a squash: the text is compared, not the commits', (t) => {
  const repo = signed(t);
  repo.commit('sign off', { date: '2026-09-21T10:00:00Z' });
  setOrg(repo, ORG.replace(R2, R2_EDITED));
  repo.commit('change R2', { date: '2026-09-22T10:00:00Z' });
  // Squash both commits into one on top of the base.
  const initial = repo.git(['rev-list', '--max-parents=0', 'HEAD']);
  repo.git(['reset', '-q', '--soft', initial]);
  repo.commit('sign off and change R2, squashed', { date: '2026-09-22T11:00:00Z' });
  assert.equal(repo.git(['rev-list', '--count', 'HEAD']), '2');

  const r = context(repo);
  assertBlocked(r, 'changed since', '2026-09-21-signoff.md');
  assert.match(r.stdout, /\bR2\b/, `should name R2:\n${r.stdout}`);
  const at = context(repo, 'invoice-download', ['--at', repo.head()]);
  assertBlocked(at, 'changed since', '2026-09-21-signoff.md');
});

test('[REC-6][VW-8] context --at judges the state from that commit\'s tree', (t) => {
  const repo = signed(t);
  const signedAt = repo.commit('sign off', { date: '2026-09-21T10:00:00Z' });
  setOrg(repo, ORG.replace(R2, R2_EDITED));
  const changedAt = repo.commit('change R2', { date: '2026-09-22T10:00:00Z' });

  assertBlocked(context(repo), 'changed since');
  assertBlocked(context(repo, 'invoice-download', ['--at', changedAt]), 'changed since');
  const r = context(repo, 'invoice-download', ['--at', signedAt]);
  assertSigned(r, '2026-09-21-signoff.md');
  assertFrame(r.stdout, { read: signedAt.slice(0, 7) });
});

// Children [REC-5]: the parent names the child in its Parts section.
const P_R1 = '### R1 Invoice export\nA customer MUST be able to export one invoice as CSV from the invoice page.\n';
const P_R2 = '### R2 Date format\nDates in the export MUST use ISO 8601.\n';
const P_R3 = '### R3 Email link\nThe invoice email MUST carry a link to the same CSV download.\n';
const PARENT_ORG = `## Organized requirement\n\n${P_R1}\n${P_R2}\n${P_R3}\nOut: PDF export.\n`;
const parts = (...children) => `\n## Parts\n\n${children.map((c, i) => `${i + 1}. ${c}: request ${c}\n`).join('')}`;
const childOrg = (...rs) => `## Organized requirement\n\n${rs.join('\n')}`;
const COPIED_R1 = '### R1 Email link\nThe invoice email MUST carry a link to the same CSV download.\n';

function parentWithChildren(t, children) {
  const repo = makeRepo(t);
  addRequest(repo, 'invoice-epic', 'Invoices for customers', PARENT_ORG,
    { type: 'epic', signedOff: '2026-09-21 owner, origin/2026-09-21-signoff.md', extra: parts(...children) });
  addSignoff(repo, 'invoice-epic', '2026-09-21-signoff.md', '2026-09-21T10:00Z', PARENT_ORG);
  return repo;
}

test('[REC-5] a child copying the parent\'s signed R3 word for word (as its R1) is not blocked and names the parent; the same text outside the parent\'s Parts is', (t) => {
  const repo = parentWithChildren(t, ['email-link']);
  addRequest(repo, 'email-link', 'Invoice emails carry the link', childOrg(COPIED_R1));
  addRequest(repo, 'email-link-other', 'Invoice emails carry the link again', childOrg(COPIED_R1));

  const child = context(repo, 'email-link');
  assert.equal(child.code, 0, child.stderr);
  assert.ok(!child.stdout.includes('BLOCKED'), `child should not be blocked:\n${child.stdout}`);
  assert.ok(child.stdout.includes('invoice-epic'), `child should name its parent:\n${child.stdout}`);
  assert.ok(lines(child.stdout).length <= 12, `more than 12 lines:\n${child.stdout}`);
  assertFrame(child.stdout);

  assertBlocked(context(repo, 'email-link-other'), 'awaiting owner sign-off');
  assertSigned(context(repo, 'invoice-epic'), '2026-09-21-signoff.md');
});

test('[REC-5][REC-6] a child whose copied line has one word changed is blocked', (t) => {
  const repo = parentWithChildren(t, ['email-link']);
  addRequest(repo, 'email-link', 'Invoice emails carry the link', childOrg(COPIED_R1.replace('MUST', 'SHOULD')));
  assertBlocked(context(repo, 'email-link'));
});

test('[REC-5][REC-6] a child with an R2 not in the parent is blocked until its own sign-off covers it', (t) => {
  const repo = parentWithChildren(t, ['email-link']);
  const own = '### R2 Link expiry\nThe link MUST work for 30 days.\n';
  const org = childOrg(COPIED_R1, own);
  addRequest(repo, 'email-link', 'Invoice emails carry the link', org);
  assertBlocked(context(repo, 'email-link'));

  addSignoff(repo, 'email-link', '2026-09-24-signoff.md', '2026-09-24T09:00Z', org);
  const r = context(repo, 'email-link');
  assert.equal(r.code, 0, r.stderr);
  assert.ok(!r.stdout.includes('BLOCKED'), `child should not be blocked:\n${r.stdout}`);
  assert.ok(r.stdout.includes('2026-09-24-signoff.md'), r.stdout);
});

test('[REC-6] a parent whose text changed after signing is blocked, naming R3', (t) => {
  const repo = parentWithChildren(t, ['email-link']);
  repo.write('requests/invoice-epic/request.md', requestMd('Invoices for customers',
    PARENT_ORG.replace(P_R3, P_R3.replace('CSV download', 'CSV or PDF download')),
    { type: 'epic', signedOff: '2026-09-21 owner, origin/2026-09-21-signoff.md', extra: parts('email-link') }));
  const r = context(repo, 'invoice-epic');
  assertBlocked(r, 'changed since', '2026-09-21-signoff.md');
  assert.match(r.stdout, /\bR3\b/, `should name R3:\n${r.stdout}`);
});

test('[REC-5] a child is judged against the parent\'s latest signed text, not the parent\'s current text', (t) => {
  const repo = parentWithChildren(t, ['email-link', 'email-link-pdf']);
  const unsignedR3 = P_R3.replace('CSV download', 'CSV or PDF download');
  repo.write('requests/invoice-epic/request.md', requestMd('Invoices for customers', PARENT_ORG.replace(P_R3, unsignedR3),
    { type: 'epic', signedOff: '2026-09-21 owner, origin/2026-09-21-signoff.md', extra: parts('email-link', 'email-link-pdf') }));
  addRequest(repo, 'email-link', 'Invoice emails carry the link', childOrg(COPIED_R1));
  addRequest(repo, 'email-link-pdf', 'Invoice emails carry the PDF link', childOrg(unsignedR3.replace('### R3', '### R1')));

  const signedCopy = context(repo, 'email-link');
  assert.equal(signedCopy.code, 0, signedCopy.stderr);
  assert.ok(!signedCopy.stdout.includes('BLOCKED'), `copy of the signed text should not be blocked:\n${signedCopy.stdout}`);
  assertBlocked(context(repo, 'email-link-pdf'));
});

test('[REC-5][REC-6] a child\'s own sign-off binds deletions: deleting a part it signed blocks it', (t) => {
  const repo = parentWithChildren(t, ['email-link']);
  const own = '### R2 Link expiry\nThe link MUST work for 30 days.\n';
  const org = childOrg(COPIED_R1, own);
  addRequest(repo, 'email-link', 'Invoice emails carry the link', org);
  addSignoff(repo, 'email-link', '2026-09-24-signoff.md', '2026-09-24T09:00Z', org);
  const before = context(repo, 'email-link');
  assert.equal(before.code, 0, before.stderr);
  assert.ok(!before.stdout.includes('BLOCKED'), `signed child should not be blocked:\n${before.stdout}`);

  // R1 alone is still word for word in the parent, but the child signed R2 too.
  repo.write('requests/email-link/request.md', requestMd('Invoice emails carry the link', childOrg(COPIED_R1)));
  assertBlocked(context(repo, 'email-link'));
});

test('[REC-5] a child with no own sign-off that drops one of the parent\'s copied R-lines stays signed', (t) => {
  const repo = parentWithChildren(t, ['email-link']);
  const copiedR2 = P_R2.replace('### R2', '### R1');
  const copiedR3 = P_R3.replace('### R3', '### R2');
  addRequest(repo, 'email-link', 'Invoice emails carry the link', childOrg(copiedR2, copiedR3));
  const both = context(repo, 'email-link');
  assert.equal(both.code, 0, both.stderr);
  assert.ok(!both.stdout.includes('BLOCKED'), `child copying two lines should not be blocked:\n${both.stdout}`);

  repo.write('requests/email-link/request.md', requestMd('Invoice emails carry the link', childOrg(copiedR3.replace('### R2', '### R1'))));
  const one = context(repo, 'email-link');
  assert.equal(one.code, 0, one.stderr);
  assert.ok(!one.stdout.includes('BLOCKED'), `child that dropped a copied line should not be blocked:\n${one.stdout}`);
  assert.ok(one.stdout.includes('invoice-epic'), `child should name its parent:\n${one.stdout}`);
});

test('[REC-5][REC-6] a copied R-line whose title differs from the parent\'s is blocked, though its body is word for word', (t) => {
  const repo = parentWithChildren(t, ['email-link']);
  addRequest(repo, 'email-link', 'Invoice emails carry the link', childOrg(COPIED_R1.replace('Email link', 'Email links')));
  assertBlocked(context(repo, 'email-link'));
});

test('[REC-5] a request whose name is a prefix of a child\'s is not a child: its copy of the parent\'s text is blocked', (t) => {
  const repo = parentWithChildren(t, ['email-link']);
  addRequest(repo, 'email-link', 'Invoice emails carry the link', childOrg(COPIED_R1));
  addRequest(repo, 'email', 'Invoice emails', childOrg(COPIED_R1));

  const prefix = context(repo, 'email');
  assertBlocked(prefix, 'awaiting owner sign-off');
  assert.ok(!prefix.stdout.includes('invoice-epic'), `"email" should not name a parent:\n${prefix.stdout}`);

  const child = context(repo, 'email-link');
  assert.equal(child.code, 0, child.stderr);
  assert.ok(!child.stdout.includes('BLOCKED'), `the child should not be blocked:\n${child.stdout}`);
  assert.ok(child.stdout.includes('invoice-epic'), `the child should name its parent:\n${child.stdout}`);
});

test('[REC-5][REC-6] real data: al context assuredloop-v1 in this repo is not blocked and names 2026-09-27-signoff-3.md', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const r = runAl(root, ['context', 'assuredloop-v1']);
  assertSigned(r, '2026-09-27-signoff-3.md');
});

test('[REC-5] a tie on Fetched: the Signed off line names a file exactly, not by prefix', (t) => {
  // The line names "….md.md", the only one that matches; "2026-09-21-signoff.md" is a prefix of it (both end in .md).
  const extra = tie(t, '2026-09-21 owner, origin/2026-09-21-signoff.md.md', '2026-09-21-signoff.md.md', '2026-09-21-signoff.md');
  assertSigned(context(extra), '2026-09-21-signoff.md.md');

  // The reverse: the line names the shorter name, which matches; "….md.md" does not.
  const plain = tie(t, '2026-09-21 owner, origin/2026-09-21-signoff.md', '2026-09-21-signoff.md', '2026-09-21-signoff.md.md');
  assertSigned(context(plain), '2026-09-21-signoff.md');
});

test('[REC-5] a tie on Fetched: only the first origin/ pointer on the Signed off line counts, not earlier sign-offs cited after it', (t) => {
  // "-2" holds the current text and is named first; the old one is cited after it.
  const first = tie(t, '2026-09-21 owner, origin/2026-09-21-signoff-2.md (the latest; earlier: origin/2026-09-21-signoff.md)',
    '2026-09-21-signoff-2.md', '2026-09-21-signoff.md');
  assertSigned(context(first), '2026-09-21-signoff-2.md');

  // The reverse: the old text is named first, "-2" (the current text) is cited after it.
  const reverse = tie(t, '2026-09-21 owner, origin/2026-09-21-signoff.md (the latest; earlier: origin/2026-09-21-signoff-2.md)',
    '2026-09-21-signoff-2.md', '2026-09-21-signoff.md');
  assertBlocked(context(reverse), 'changed since', '2026-09-21-signoff.md');
});
