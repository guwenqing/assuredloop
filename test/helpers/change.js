// Hand-built change specs [SPC-5] for the part-4 tests: blocks, change.md and
// a bare request.md. Nothing here reads the code under test.

// Each line indented by 4 spaces; blank lines stay empty.
export const indent = (text) => text.replace(/\n+$/, '').split('\n').map((l) => (l ? `    ${l}` : '')).join('\n') + '\n';
export const fence = (text) => '```\n' + text.replace(/\n+$/, '') + '\n```\n';

// `### <head>`, then `Was:` and `Now:` (each left out when undefined), each
// followed by a blank line and the section indented (or fenced).
export function block(head, { was, now, fenced = false } = {}) {
  const body = fenced ? fence : indent;
  let s = `### ${head}\n`;
  if (was !== undefined) s += `Was:\n\n${body(was)}\n`;
  if (now !== undefined) s += `Now:\n\n${body(now)}\n`;
  return s;
}

export const CHANGE_PROSE = '# Change\n\nWhy: customers asked. Design: see below.\n\n';
export const changeMd = (...blocks) => `${CHANGE_PROSE}## Spec changes\n\n${blocks.join('')}`;

export const requestMd = (title, { status = 'open', rest = '' } = {}) =>
  `# ${title}\nType: story · Tier: 2 · Status: ${status}\n\n## Owner's words and dialog\n\n- 2026-09-20 owner chat\n${rest}`;

// change.md as the lines that [SPC-5] fixes: blank lines dropped, trailing
// spaces trimmed, and in a block heading the runs of spaces collapsed and the
// markers sorted (their order and spacing are left open).
const MARKER = /builds on \S+|(?:Dropped|Kept|Revised) \S+ \(D\d+\)|for R\d+(?:, R\d+)*/g;
function heading(line) {
  if (!line.startsWith('### ')) return line;
  const markers = (line.match(MARKER) ?? []).sort();
  return [line.replace(MARKER, ' ').replace(/\s+/g, ' ').trim(), ...markers].join(' | ');
}
export const shape = (text) => text.split('\n').map((l) => l.trimEnd()).filter(Boolean).map(heading);
