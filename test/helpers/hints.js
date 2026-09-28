// Hint lines [HNT-1] and the exit codes of al check [HNT-3], as part 7's
// output conventions fix them, for the part-7 tests. Built from the spec text
// and the architect's rulings; nothing here reads the code under test.
import assert from 'node:assert/strict';
import { runAl } from './fixture.js';
import { assertFrame, lines } from './output.js';
import { both, lineWith } from './request.js';

// In check a hint line starts with "not ok:" or "note:". In the context views
// it sits after a Hint label ("Hint      not ok: …"); one indented under
// another is read as a hint line too.
const CHECK_HINT = /^(not ok|note):/;
const VIEW_HINT = /^(?:Hints?\s+|\s+)(not ok|note):/;
export const checkHints = (out) => lines(out).filter((l) => CHECK_HINT.test(l));
export const viewHints = (out) => lines(out).filter((l) => VIEW_HINT.test(l));
const allHints = (out) => [...new Set([...checkHints(out), ...viewHints(out)])];
export const kindOf = (line) => (line.match(CHECK_HINT) ?? line.match(VIEW_HINT))?.[1];

// Some `al …` or `git …` text on the line: the command that addresses it.
export const COMMAND = /(?:^|[^\w-])(?:al|git) [a-z-]+/;
// The line with each command taken out: `al …` or `git …` up to the end of
// the line or the next separator (; · | ( ) or a dash between spaces).
const withoutCommands = (line) => line.replace(/(?<=^|[^\w-])(?:al|git) [a-z-]+.*?(?=\s[—–-]\s|[;·|()]|$)/g, '');
// The thing a hint names, outside its command: a section ID (SHA-256 is none)
// or R-line, a 7-character commit id, a path or file name (or path:lines), the range
// main..HEAD (for a hint about the branch as a whole), or one of `names` (the
// fixture's requests).
export function namesThing(line, names = []) {
  const text = withoutCommands(line).replaceAll('SHA-256', '');
  return /\[?[A-Z][A-Z0-9]*-\d+(\.\d+)*\]?/.test(text) || /\bR\d+\b/.test(text) || /\b[0-9a-f]{7}\b/.test(text) ||
    /[\w.-]+\/[\w.-]+|\b[\w-]+\.(?:md|js|mjs|cjs|ts|json|txt|ya?ml)\b/.test(text) || text.includes('main..HEAD') || names.some((n) => text.includes(n));
}

// The hint line of `kind` ('not ok' or 'note') holding every part (a string,
// an ID token or a RegExp, as lineWith takes them). It must name a command.
export function hint(out, kind, ...parts) {
  const line = allHints(out).find((l) => kindOf(l) === kind && lineWith(l, ...parts));
  assert.ok(line, `expected a "${kind}:" hint line with ${parts.map(String).join(' and ')}:\n${out}`);
  assert.match(line, COMMAND, `the hint should name a command (al … or git …):\n${line}`);
  return line;
}

// No hint line holds every part (a part 'not ok' or 'note' narrows it to that kind).
export function noHint(out, ...parts) {
  const line = allHints(out).find((l) => lineWith(l, ...parts));
  assert.ok(!line, `expected no hint line with ${parts.map(String).join(' and ')}:\n${out}`);
}

// A not ok that does not count: it holds the word information and its owner.
export function assertInformation(line, owner) {
  assert.ok(/\binformation\b/.test(line) && line.includes(owner), `should be information, naming ${owner}:\n${line}`);
}
export function assertCounts(line) {
  assert.ok(!/\binformation\b/.test(line), `should count, not be information:\n${line}`);
}

// What every check prints: part 5's line, the Read line naming the working
// tree, and the [VW-9] frame.
export function assertCheckFrame(out, main = 'local main') {
  assert.ok(lines(out).some((l) => l.includes('protects a PR only when check runs on it')),
    `a line should say it protects a PR only when check runs on it:\n${out}`);
  const read = lines(out).find((l) => /^Read\b/.test(l));
  assert.ok(read && read.includes('working tree'), `the Read line should name the working tree:\n${out}`);
  assertFrame(out, { main });
}

// al check [args] in `repo`: exit 0 (without --strict it always is), the frame; its stdout.
export function check(repo, ...args) {
  const r = runAl(repo.dir, ['check', ...args]);
  assert.equal(r.code, 0, `check ${args.join(' ')} should exit 0:\n${both(r)}`);
  assertCheckFrame(r.stdout);
  return r.stdout;
}

// al check --strict: exits `code`, with the frame; its stdout.
export function strict(repo, code) {
  const r = runAl(repo.dir, ['check', '--strict']);
  assert.equal(r.code, code, `check --strict should exit ${code}:\n${both(r)}`);
  assertCheckFrame(r.stdout);
  return r.stdout;
}

// A commit message: the subject, then a Request line and a Tier line when given.
export const message = (subject, { request, tier } = {}) =>
  [subject, request && `Request: ${request}`, tier && `Tier: ${tier}`].filter(Boolean).join('\n\n');
