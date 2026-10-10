// v4 markers (design.md 3, schema.md 3-4): each paragraph has a hidden marker
// on its own line before it, `<!-- INV-41 rule serves:R2 builds-on:INV-12 -->`,
// with a blank line before and after. parseMarkdown reads the paragraphs, their
// kinds, links, hashes and display numbers, and lints the markers of one doc.
import { createHash } from 'node:crypto';

// The kind groups of design.md 3. `approach` is design kept with its change.
export const KINDS = {
  promise: ['purpose', 'scope', 'rule', 'limit', 'definition'],
  design: ['component', 'interface', 'data', 'flow', 'choice', 'approach'],
  informative: ['rationale', 'example', 'open'],
  note: ['note'],
  'change-only': ['plan', 'step', 'migration'],
};

// The groups whose paragraphs need a link (design.md 3; approach included).
const NEEDS_LINK = ['promise', 'design'];

// The link words of a marker and the key of `links` each one fills.
export const LINK_WORDS = {
  serves: 'serves', 'builds-on': 'buildsOn', changes: 'changes', removes: 'removes',
  explains: 'explains', illustrates: 'illustrates', 'resolved-by': 'resolvedBy',
  'governed-by': 'governedBy', decides: 'decides', for: 'for', supersedes: 'supersedes', source: 'source',
};

export const groupOf = (kind, kinds = KINDS) => Object.keys(kinds).find((g) => kinds[g].includes(kind)) ?? null;

// An ID is PREFIX-n; an ADR's paragraphs below its heading take ADR-n-k (D4).
export const MARKER = /^<!--[ \t]+(ADR-[0-9]+-[0-9]+|[A-Z][A-Z0-9]*-[0-9]+)((?:[ \t]+\S+)*?)[ \t]+-->[ \t]*$/;
export const FENCE = /^ {0,3}(`{3,}|~{3,})/;
export const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;

// Line endings only: the rest of the text counts (design.md 5, Equality).
export const lf = (text) => text.replace(/\r\n?/g, '\n');
export const sha256 = (text) => createHash('sha256').update(lf(text)).digest('hex');

// A heading's text: no `#` marks, trimmed, a closing run of `#` removed.
const headingText = (raw) => (raw ?? '').replace(/(^|[ \t]+)#+$/, '').trim();

// A GFM table's delimiter row, such as `--- | ---` or `|:--|--:|`.
const DELIMITER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

// The cells of a table row: one leading and one trailing pipe do not count,
// and an escaped pipe does not split a cell.
const cells = (row) => row.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).length;

// A table starts where a row is followed by a delimiter row with as many
// cells (GFM's tables extension).
const tableStart = (l, next) => l.includes('|') && next.includes('|') && DELIMITER.test(next) && cells(l) === cells(next);

// A line that belongs to the paragraph before it, also after a blank line:
// a list item, the start of a table, a block quote, an indented line or a
// fence.
export const continues = (l, next = '') => /^\s*([-*+]|\d+[.)])(\s|$)/.test(l) || tableStart(l, next)
  || /^\s*>/.test(l) || /^\s+\S/.test(l) || FENCE.test(l);

// The blocks of a doc, each { first, marked, after }: `first` is the index of
// its first line, `marked` whether a marker comes right before it, `after`
// the ID of the last marker before it. Also the indexes of the marker lines.
// A heading line is a block of its own, and so is whatever follows it. A
// list, a table, a quote, an indented line or a fence belongs to the block
// before it, also after a blank line. Fenced code is not read for markers.
// parseMarkdown lints by these blocks and `al spec --add-ids` marks them.
export function blocksOf(lines) {
  const blocks = [];
  const markers = new Set();
  let fence = null;
  let blank = true;
  let open = false;
  let afterHeading = false;
  let marked = false;
  let after = null;
  lines.forEach((l, i) => {
    if (fence) {
      const f = FENCE.exec(l);
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && l.trim() === f[1]) fence = null;
      return;
    }
    const m = MARKER.exec(l);
    if (m) {
      markers.add(i);
      marked = true;
      after = m[1];
      open = false;
      afterHeading = false;
      blank = true;
      return;
    }
    if (l.trim() === '') { blank = true; return; }
    const heading = HEADING.test(l);
    if (!open || heading || afterHeading || (blank && !continues(l, lines[i + 1]))) {
      blocks.push({ first: i, marked, after });
      marked = false;
      open = true;
    }
    const f = FENCE.exec(l);
    if (f) fence = f[1];
    afterHeading = heading;
    blank = false;
  });
  return { blocks, markers };
}

// `text` (LF line endings) with a marker before each block that has none: the
// ID from `nextId()`, kind note on a heading, with the blank lines a marker
// needs. Returns { text, marks }, marks being the IDs given, in file order.
export function markBlocks(text, nextId) {
  const lines = text.split('\n');
  const { blocks: all, markers } = blocksOf(lines);
  const todo = all.filter((b) => !b.marked);
  const out = [];
  const marks = [];
  let k = 0;
  lines.forEach((l, i) => {
    if (k < todo.length && todo[k].first === i) {
      const id = nextId();
      marks.push(id);
      if (out.length && out.at(-1).trim() !== '') out.push('');
      out.push(HEADING.test(l) ? `<!-- ${id} note -->` : `<!-- ${id} -->`, '');
      k++;
    } else if (markers.has(i) && out.length && out.at(-1).trim() !== '') {
      out.push('');
    }
    out.push(l);
    if (markers.has(i) && lines[i + 1] !== undefined && lines[i + 1].trim() !== '') out.push('');
  });
  return { text: out.join('\n'), marks };
}

// The IDs of `paragraphs` (one doc's, in file order) whose text is a block of
// `text` (that doc at another commit, marked or not) in the same order: the
// longest common subsequence of the two hash lists, as a diff keeps lines.
// So one block there stands for one paragraph here, and of two equal
// paragraphs only the one in the block's place matches (D16, D19, #196).
export function sameBlocks(text, paragraphs, file = '') {
  let n = 0;
  const a = parseMarkdown(markBlocks(lf(text), () => `UNMARKED-${++n}`).text, file).paragraphs.map((p) => p.sha256);
  const b = paragraphs.map((p) => p.sha256);
  // len[i][j]: the length of the common subsequence of a[i..] and b[j..].
  const len = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) len[i][j] = a[i] === b[j] ? len[i + 1][j + 1] + 1 : Math.max(len[i + 1][j], len[i][j + 1]);
  }
  const same = new Set();
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j] && len[i][j] === len[i + 1][j + 1] + 1) { same.add(paragraphs[j].id); i++; j++; }
    else if (len[i + 1][j] > len[i][j + 1]) i++;
    else j++;
  }
  return same;
}

const emptyLinks = () => Object.fromEntries(Object.values(LINK_WORDS).map((k) => [k, []]));

export function parseMarkdown(text, file, options = {}) {
  const kinds = options.kinds ?? KINDS;
  const known = new Set(Object.values(kinds).flat());
  const lines = lf(text).split('\n');
  const paragraphs = [];
  const lints = [];
  const lint = (code, severity, id, line, message) => lints.push({ code, severity, id, file, line, message });

  // Split into the text before the first marker and one block per marker,
  // skipping markers inside fenced code.
  const blocks = [];
  let fence = null;
  let cur = { marker: null, start: 0, lines: [] };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const m = fence ? null : MARKER.exec(l);
    if (m) {
      blocks.push(cur);
      cur = { marker: m, line: i + 1, start: i + 1, lines: [] };
      continue;
    }
    const f = FENCE.exec(l);
    if (f) {
      if (!fence) fence = f[1];
      else if (f[1][0] === fence[0] && f[1].length >= fence.length && l.trim() === f[1]) fence = null;
    }
    cur.lines.push({ text: l, n: i + 1 });
  }
  blocks.push(cur);

  const [, ...marked] = blocks;
  for (const b of blocksOf(lines).blocks) {
    if (!b.marked) lint('no-id', 'not ok', null, b.first + 1, `a paragraph with no ID marker${b.after ? `, after ${b.after}` : ' before it'}`);
  }

  const seen = new Set();
  for (const b of marked) {
    const id = b.marker[1];
    const n = b.line;
    if (n > 1 && lines[n - 2].trim() !== '') lint('no-blank-before', 'not ok', id, n, `the marker of ${id} needs a blank line before it`);
    // The empty string after a final newline is the end of the file, not a blank line.
    if (n >= lines.length - 1 || lines[n].trim() !== '') lint('no-blank-after', 'not ok', id, n, `the marker of ${id} needs a blank line after it`);
    if (seen.has(id)) lint('duplicate-id', 'not ok', id, n, `${id} is used by an earlier marker in this doc`);
    seen.add(id);

    let kind = null;
    const links = emptyLinks();
    for (const token of b.marker[2].trim().split(/[ \t]+/).filter(Boolean)) {
      const c = token.indexOf(':');
      if (c < 0) {
        if (kind !== null) lint('unknown-kind', 'not ok', id, n, `${id} has a second kind "${token}"; a paragraph has one kind`);
        else if (!known.has(token)) lint('unknown-kind', 'not ok', id, n, `${id}: "${token}" is not a kind`);
        else kind = token;
        continue;
      }
      const key = Object.hasOwn(LINK_WORDS, token.slice(0, c)) ? LINK_WORDS[token.slice(0, c)] : null;
      if (!key) lint('unknown-link', 'not ok', id, n, `${id}: "${token.slice(0, c)}" is not a link word`);
      else links[key].push(...token.slice(c + 1).split(',').filter(Boolean));
    }
    if (kind === null) lint('no-kind', 'hint', id, n, `${id} has no kind`);
    if (kind && NEEDS_LINK.includes(groupOf(kind, kinds)) && Object.values(links).every((v) => !v.length)) {
      lint('no-link', 'hint', id, n, `${id} is a ${kind} paragraph with no link`);
    }

    const body = b.lines.slice();
    while (body.length && body[0].text.trim() === '') body.shift();
    while (body.length && body.at(-1).text.trim() === '') body.pop();
    const ptext = body.map((l) => l.text).join('\n');
    const h = body.length ? HEADING.exec(body[0].text) : null;
    paragraphs.push({
      id, kind, links, text: ptext, sha256: sha256(ptext), line: n,
      level: h ? h[1].length : 0, heading: h ? headingText(h[2]) : null, file,
    });
  }

  number(paragraphs);
  const headings = new Set();
  for (const p of paragraphs) {
    if (p.heading !== null) {
      const key = JSON.stringify(p.headingPath);
      if (headings.has(key)) lint('duplicate-heading', 'hint', p.id, p.line, `the heading "${p.heading}" is already used under the same parent`);
      headings.add(key);
    }
    delete p.level;
    delete p.heading;
  }
  return { paragraphs, lints };
}

// Display numbers and heading paths (design.md 3): a single leading H1 is the
// title and is not numbered; below it, H2 is 1, 2, ... Without it, H1 is 1.
function number(paragraphs) {
  const heads = paragraphs.filter((p) => p.heading !== null);
  const titled = heads.length > 0 && heads[0].level === 1 && !heads.slice(1).some((p) => p.level === 1);
  const top = titled ? 2 : 1;
  const title = titled ? heads[0].heading : null;
  const counters = [];
  const path = [];
  let section = '0';
  let where = title ?? 'the top';
  let idx = 0;
  for (const p of paragraphs) {
    if (p.heading !== null) {
      path.length = p.level - 1;
      path[p.level - 1] = p.heading;
      p.headingPath = path.filter((t) => t !== undefined);
      if (titled && p === heads[0]) {
        p.displayNumber = `${p.id} (0, ${p.heading})`;
      } else {
        const depth = p.level - top;
        counters.length = depth + 1;
        for (let k = 0; k <= depth; k++) counters[k] = counters[k] ?? 0;
        counters[depth] += 1;
        section = counters.join('.');
        p.displayNumber = `${p.id} (${section}, ${p.heading})`;
      }
      where = p.heading;
      idx = 0;
    } else {
      idx += 1;
      p.headingPath = path.filter((t) => t !== undefined);
      p.displayNumber = `${p.id} (${section}:${idx}, in ${where})`;
    }
  }
}
