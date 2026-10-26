// Fixtures and readers for the map of a change and the consolidation
// judgement (#68): map-68.test.js and consolidation-68.test.js. Nothing here
// reads the code under test: only the command, its output and the files.
import assert from 'node:assert/strict';
import {
  al, appendSection, baseProject, commitAll, doc, editFile, git, index, newRequest, ok, organized, read, req, show, write,
} from './project.js';

export { show };

export const SPEC = 'specs/invoices.md';
export const NAME = 'share';
export const CS = `requests/${NAME}/spec.md`;
export const NOTE = `requests/${NAME}/review.md`;
export const R1 = req('R1', 'Shared links', 'A shared export link MUST live for 24 hours, and the email MUST carry only the link.');

// The texts of specs/invoices.md at the base (see INVOICES in project.js).
export const T12 = 'An invoice has a number, a customer, lines, a total and a paid date.';
export const T13 = 'An invoice MUST have at least one line.';
export const T41 = 'The export link MUST expire 30 minutes after the email is sent.';

// The commit message of a request commit, with its Tier claim.
export const claim = (name, tier = '2') => `${name}: the request\n\nTier: ${tier} — ${name}`;

// An open request: R1 signed by the owner, a change spec from `paras`
// ([marker, text] pairs), and al index. Not committed.
export function openRequest(dir, name, paras, { tier = '2' } = {}) {
  newRequest(dir, name, `The owner wants ${name}.\n`, ['--tier', tier]);
  appendSection(dir, name, organized([R1]));
  ok(dir, ['record', name, 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
  if (paras) write(dir, `requests/${name}/spec.md`, doc(paras));
  index(dir);
}

// main: the base of baseProject, plus what `onMain` adds, indexed and
// committed. Then the branch feature with the own request share (path 2):
// R1 signed and a change spec from `paras`, indexed and committed.
export function world(t, paras, { onMain, link = true } = {}) {
  const dir = baseProject(t, { branch: null });
  if (onMain) onMain(dir);
  index(dir);
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  if (link) {
    openRequest(dir, NAME, paras);
    commitAll(dir, claim(NAME));
  }
  return dir;
}

// The base of the branch: the merge-base with main, 7 hex.
export const base7 = (dir) => git(dir, 'merge-base', 'main', 'HEAD').slice(0, 7);

// Replaces the text of a spec paragraph, and puts serves:share/R1 in its
// marker, so that a promise edit is covered by the signed R1 (no not ok).
export function editSpec(dir, id, kind, from, to, { serves = `${NAME}/R1` } = {}) {
  const text = read(dir, SPEC);
  const marker = text.split('\n').find((l) => l.startsWith(`<!-- ${id} `));
  assert.ok(marker, `${SPEC} has the marker of ${id}`);
  editFile(dir, SPEC, `${marker}\n\n${from}`, `<!-- ${id} ${kind}${serves ? ` serves:${serves}` : ''} -->\n\n${to}`);
}

// Adds a paragraph at the end of specs/invoices.md.
export function addSpec(dir, marker, text) {
  write(dir, SPEC, `${read(dir, SPEC).replace(/\n*$/, '\n')}\n${doc([[marker, text]])}`);
}

// Deletes a paragraph, its marker and its text, from specs/invoices.md.
export function removeSpec(dir, id, text) {
  const all = read(dir, SPEC);
  const marker = all.split('\n').find((l) => l.startsWith(`<!-- ${id} `));
  assert.ok(marker, `${SPEC} has the marker of ${id}`);
  editFile(dir, SPEC, `${marker}\n\n${text}\n`, '');
}

// --- the review note

// A judgement as the review writes it: the first line, then its evidence lines.
export const judged = (first, ...evidence) => [`- ${first}`, ...evidence.map((e) => `  - ${e}`)].join('\n');
// The note: a heading, a free paragraph, and the judgements.
export const note = (dir, ...items) => write(dir, NOTE, `# Review of ${NAME}\n\nFree text that al does not read.\n\n${items.join('\n')}\n`);

// The 1-based number of the first line of `text` that starts with `start`.
export function lineStarting(text, start) {
  const at = text.split('\n').findIndex((l) => l.startsWith(start));
  assert.ok(at >= 0, `a line that starts with ${JSON.stringify(start)} in:\n${text}`);
  return at + 1;
}
// The line of a judgement's first line in the note.
export const noteLine = (dir, first) => lineStarting(read(dir, NOTE), `- ${first}`);
// "judgement requests/share/review.md:<line>", as the map and the spec lines name a judgement.
export const jref = (dir, first) => `judgement ${NOTE}:${noteLine(dir, first)}`;

// --- places

// The places that al may print for a paragraph: its marker line, or the
// first line of its text (the marker line + 2). The interface says only
// "<file>:<line>", so either is taken. `at` reads the file at a commit.
export function places(dir, file, id, at) {
  const text = at ? git(dir, 'show', `${at}:${file}`) : read(dir, file);
  const m = lineStarting(text, `<!-- ${id} `);
  return [`${file}:${m}`, `${file}:${m + 2}`];
}

// --- reading the output

export const out = (r) => r.stdout.split('\n');

export function check(dir, ...args) {
  const r = al(dir, ['check', ...args]);
  assert.equal(r.code, 0, show(r));
  return r;
}

export const mapLines = (r) => out(r).filter((l) => l.startsWith('map:') || l.startsWith('map '));

// The one `map: ` line (a reason or the header). The map comes after the
// list and review sections, and before the closing Read line.
export function mapHead(r) {
  const ls = out(r);
  const found = ls.filter((l) => l.startsWith('map: '));
  assert.equal(found.length, 1, `one "map: " line:\n${show(r)}`);
  const at = ls.indexOf(found[0]);
  const earlier = ls.map((l, i) => (/^(list limits: |list: |review note |judgement )/.test(l) ? i : -1)).filter((i) => i >= 0);
  assert.ok(earlier.length > 0 && at > Math.max(...earlier), `the map comes after the list and the review section:\n${show(r)}`);
  const readAt = ls.findIndex((l) => /^Read {6}/.test(l));
  assert.ok(readAt > at, `the map comes before the Read line:\n${show(r)}`);
  for (const l of mapLines(r)) {
    const i = ls.indexOf(l);
    assert.ok(i >= at && i < readAt, `each map line is in the map section:\n${l}\n${show(r)}`);
  }
  return found[0];
}

export const headerLine = (dir, ...names) =>
  `map: the change against its base ${base7(dir)} (own changes: ${names.join(', ')}), from facts only`;

const SINGLE = {
  spec: /^map spec (\S+) · (\S+) · (.+)$/,
  link: /^map link (\S+ (?:changes|removes) \S+) · (\S+) · (.+)$/,
  consolidation: /^map consolidation (\S+) · (\S+) · (.+)$/,
};
const NOUN = { spec: 'spec paragraphs', link: 'links', consolidation: 'change paragraphs' };
const GROUP = /^map (spec|link|consolidation) · (\d+) (spec paragraphs|links|change paragraphs) · (.+): ((?:[^()]+ \([^()\s]+\))(?:, [^()]+ \([^()\s]+\))*)$/;

// Every map entry, from a single line or from a grouped line, in output
// order: {kind, id, place, fact, line, grouped}. A grouped line must count
// its IDs right and name the noun of its kind.
export function entries(r) {
  const list = [];
  for (const line of mapLines(r)) {
    if (line.startsWith('map: ')) continue;
    const g = GROUP.exec(line);
    if (g) {
      const [, kind, n, noun, fact, items] = g;
      assert.equal(noun, NOUN[kind], `the noun of a grouped ${kind} line:\n${line}`);
      const parts = [...items.matchAll(/(.+?) \(([^()\s]+)\)(?:, |$)/g)];
      assert.equal(parts.length, Number(n), `a grouped line names as many IDs as its count:\n${line}\n${show(r)}`);
      assert.ok(parts.length >= 2, `a group has two or more lines:\n${line}`);
      for (const [, id, place] of parts) list.push({ kind, id, place, fact, line, grouped: true });
      continue;
    }
    const kind = Object.keys(SINGLE).find((k) => SINGLE[k].test(line));
    assert.ok(kind, `a map line in a known form:\n${line}\n${show(r)}`);
    const [, id, place, fact] = SINGLE[kind].exec(line);
    list.push({ kind, id, place, fact, line, grouped: false });
  }
  return list;
}

// The one entry of kind and id.
export function entry(r, kind, id) {
  const found = entries(r).filter((e) => e.kind === kind && e.id === id);
  assert.equal(found.length, 1, `one map ${kind} entry for ${id}:\n${show(r)}`);
  return found[0];
}
export function noEntry(r, kind, id) {
  assert.deepEqual(entries(r).filter((e) => e.kind === kind && e.id === id), [], `no map ${kind} entry for ${id}:\n${show(r)}`);
}

// The entries come in order: spec, then link, then consolidation.
export function kindOrder(r) {
  const rank = { spec: 0, link: 1, consolidation: 2 };
  const ks = entries(r).map((e) => rank[e.kind]);
  assert.deepEqual(ks, [...ks].sort((a, b) => a - b), `spec lines, then link lines, then consolidation lines:\n${show(r)}`);
}

// An entry's place is one of the places of the paragraph.
export function placed(r, e, options) {
  assert.ok(options.includes(e.place), `${e.kind} ${e.id} at ${options.join(' or ')}, not ${e.place}:\n${show(r)}`);
}

// A spec entry's fact, read: what happened, the refs, the open proposals.
export function specFact(r, e) {
  const m = /^(added|changed|removed); named by (.+?)(?:; open proposal: (.+))?$/.exec(e.fact);
  assert.ok(m, `a spec fact "<added|changed|removed>; named by <refs>":\n${e.line}\n${show(r)}`);
  return { what: m[1], refs: m[2] === 'no change paragraph' ? [] : m[2].split(', ').sort(), raw: m[2], proposal: m[3] ?? null };
}

// The spec entry of id: what, refs (any order), place and proposal.
export function assertSpec(r, id, { what, refs, at, proposal = null }) {
  const e = entry(r, 'spec', id);
  placed(r, e, at);
  const f = specFact(r, e);
  assert.equal(f.what, what, `${id} is ${what}:\n${e.line}\n${show(r)}`);
  assert.deepEqual(f.refs, [...refs].sort(), `${id} is named by ${refs.join(', ') || 'no change paragraph'}:\n${e.line}\n${show(r)}`);
  if (refs.length === 0) assert.equal(f.raw, 'no change paragraph', show(r));
  assert.equal(f.proposal, proposal, `the open proposal of ${id}:\n${e.line}\n${show(r)}`);
  return e;
}

// --- hints and findings

export const hintLines = (r, code) => out(r).filter((l) => l.startsWith(`hint ${code} `));
export const notOkLines = (r) => out(r).filter((l) => l.startsWith('not ok '));
export const mapHints = (r) => out(r).filter((l) => /^hint map-/.test(l));

// The one `hint map-unnamed <file>:<line> <id> ...` line, at one of `at`.
export function unnamedHint(r, id, at) {
  const found = hintLines(r, 'map-unnamed').filter((l) => l.split(' ')[3] === id);
  assert.equal(found.length, 1, `one "hint map-unnamed <file>:<line> ${id}" line:\n${show(r)}`);
  const where = found[0].split(' ')[2];
  assert.ok(at.includes(where), `map-unnamed ${id} at ${at.join(' or ')}, not ${where}:\n${show(r)}`);
  return found[0];
}
export function noUnnamedHint(r, id) {
  assert.deepEqual(hintLines(r, 'map-unnamed').filter((l) => l.split(' ')[3] === id), [], `no map-unnamed hint for ${id}:\n${show(r)}`);
}

// An ID as a whole word: SP-1 does not match SP-10; share/SP-1 matches SP-1.
export const word = (id) => new RegExp(`(?<![\\w-])${id.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?![\\w-])`);

// The one `hint map-consolidation <change spec file> <name> ...` line; its
// message names exactly the change paragraphs `ids` of all of `all`.
export function consolidationHint(r, { file = CS, name = NAME, ids, all }) {
  const found = hintLines(r, 'map-consolidation').filter((l) => l.split(' ')[3] === name);
  assert.equal(found.length, 1, `one "hint map-consolidation ${file} ${name}" line:\n${show(r)}`);
  const [, , where, , ...rest] = found[0].split(' ');
  assert.equal(where, file, `the hint names the change spec:\n${show(r)}`);
  const msg = rest.join(' ');
  for (const id of all) {
    assert.equal(word(id).test(msg), ids.includes(id), `map-consolidation ${ids.includes(id) ? 'names' : 'does not name'} ${id}:\n${found[0]}\n${show(r)}`);
  }
  return found[0];
}
export function noConsolidationHint(r, name = NAME) {
  assert.deepEqual(hintLines(r, 'map-consolidation').filter((l) => l.split(' ')[3] === name), [], `no map-consolidation hint for ${name}:\n${show(r)}`);
}

export const staleBase = (r, holder, link, target) =>
  hintLines(r, 'stale-base').filter((l) => l.split(' ')[3] === holder && l.split(' ').slice(4).join(' ').startsWith(`${link} ${target},`));

// --- the judgement line of the review section (#64)

// The one judgement line whose place is the note line of `first`.
export function judgementAt(r, dir, first) {
  const want = ` · ${NOTE}:${noteLine(dir, first)} · `;
  const found = out(r).filter((l) => l.startsWith('judgement ') && l.includes(want));
  assert.equal(found.length, 1, `one judgement line at ${NOTE}:${noteLine(dir, first)}:\n${show(r)}`);
  return found[0];
}

// The quote results of a judgement line, as its " · " parts.
export const parts = (line) => line.split(' · ');
