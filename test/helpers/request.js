// Requests for the part-5 tests: signed or not [REC-5], with Decisions
// [REC-7] and Parts [REC-8]; the Outcome [REC-9] read back from request.md;
// refusal lines and block states. Built by hand from the spec text; nothing
// here reads the code under test.
import assert from 'node:assert/strict';
import { sha256 } from './fixture.js';
import { changeMd } from './change.js';
import { lines } from './output.js';

export const ENV = { SOURCE_DATE_EPOCH: '1790206200' }; // 2026-09-23T23:30Z

const WORDS = 'Customers keep asking to download their invoices.\n';
export const ORG = '## Organized requirement\n\n' +
  '### R1 Invoice export\nA customer MUST be able to export one invoice as CSV.\n\n' +
  '### R2 Dates\nDates MUST show in ISO 8601.\n\n' +
  '### R3 Email link\nThe invoice email MUST carry a link to the CSV.\n';
// D2 is the agent's ruling, its Source clause over two lines; D1, D3 and D4 are the owner's.
export const D4 = '- D4, 2026-09-26. Source: the owner. Drop this request.\n';
export const DECISIONS = '\n## Decisions\n\n' +
  '- D1, 2026-09-21. Source: the owner. CSV only for now.\n' +
  '- D2, 2026-09-24. Source: the review of PR #9 (reviewer);\n  ruling by the agent (architect). Semicolon as separator.\n' +
  '- D3, 2026-09-25. Source: the owner, in review. Keep the ISO dates.\n' +
  D4;

export const statusLine = (status) => `Type: story · Tier: 2 · Status: ${status}`;

// request.md: the title, the status line, the owner's words, the organized
// section `org`, the Signed off line, then `decisions` and `rest`.
export const requestText = (title, { org = ORG, signed = true, decisions = DECISIONS, rest = '', status = 'open', line = statusLine(status) } = {}) =>
  `# ${title}\n${line}\n\n## Owner's words and dialog\n\n- 2026-09-20 owner chat, snapshot origin/2026-09-20-owner-words.md\n\n` +
  `${org}Signed off: ${signed ? '2026-09-21 owner, origin/2026-09-21-signoff.md' : 'pending'}\n${decisions}${rest}`;

// requests/<name>/ (or `dir`): request.md, the owner's words, a sign-off of
// `signedText` unless `signed` is false, and a change.md of `blocks` when
// given. Returns request.md's text.
export function addRequest(repo, name, blocks, { dir = `requests/${name}`, title = `Request ${name}`, signedText = ORG, ...opts } = {}) {
  const md = requestText(title, opts);
  repo.write(`${dir}/request.md`, md);
  repo.write(`${dir}/origin/2026-09-20-owner-words.md`,
    `Source: standard input\nFetched: 2026-09-20T09:00Z\nSHA-256: ${sha256(WORDS)}\n---\n${WORDS}`);
  if (opts.signed ?? true) {
    repo.write(`${dir}/origin/2026-09-21-signoff.md`, 'Source: chat with the owner\nOwner\'s words: "Signed"\n' +
      `Fetched: 2026-09-21T10:00Z\nSHA-256: ${sha256(signedText)}   (of the signed text below)\n--- signed text ---\n${signedText}`);
  }
  if (blocks) repo.write(`${dir}/change.md`, changeMd(...blocks));
  return md;
}

// request.md split at "## Outcome", which must be its last section: the text
// before it, the generated lines (non-blank, up to a "Notes:" line), and the
// text from "Notes:" on (null when there is none).
export function outcome(md) {
  const ls = md.split('\n');
  const at = ls.findIndex((l) => /^## Outcome\s*$/.test(l));
  assert.ok(at >= 0, `request.md should have an "## Outcome" section:\n${md}`);
  const after = ls.slice(at + 1);
  assert.ok(!after.some((l) => /^#{1,2} /.test(l)), `"## Outcome" should be the last section:\n${md}`);
  const n = after.findIndex((l) => l.startsWith('Notes:'));
  const generated = (n < 0 ? after : after.slice(0, n)).filter((l) => l.trim());
  return { before: ls.slice(0, at).join('\n'), generated, notes: n < 0 ? null : after.slice(n).join('\n') };
}

// A section ID as a whole token: INV-3 but not INV-30 or INV-3.1.
const ID = /^[A-Z][A-Z0-9]*-\d+(\.\d+)*$/;
export const hasId = (line, id) => new RegExp(`(^|[^\\w.-])\\[?${id.replaceAll('.', '\\.')}\\]?(?![\\w.]|-\\d)`).test(line);
const matches = (line, p) => (p instanceof RegExp ? p.test(line) : ID.test(p) ? hasId(line, p) : line.includes(p));
// The first line of `text` holding every part (a string, an ID token, or a RegExp).
export const lineWith = (text, ...parts) => lines(text).find((l) => parts.every((p) => matches(l, p)));
export const both = (r) => `${r.stdout}\n${r.stderr}`;

// Exit 1, and a line (stdout or stderr) that says "refused" with every part.
export function assertRefused(r, ...parts) {
  assert.equal(r.code, 1, `expected exit 1 (refused):\n${both(r)}`);
  assert.ok(lineWith(both(r), /refused/i, ...parts),
    `expected a line with "refused" and ${parts.map((p) => JSON.stringify(String(p))).join(', ')}:\n${both(r)}`);
}

// The state of one block (and what it names) as changeStates gives it.
export async function expectState(repo, key, state, { by = null } = {}) {
  const { changeStates } = await import('../../src/states.js');
  const list = await changeStates(repo.dir);
  const e = list.find((x) => x.block === key);
  assert.ok(e, `no block ${key} in ${JSON.stringify(list.map((x) => x.block))}`);
  assert.equal(e.state, state, `${key}: ${JSON.stringify(e)}`);
  assert.equal(e.by, by, `${key} by: ${JSON.stringify(e)}`);
}
