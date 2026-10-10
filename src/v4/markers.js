// STUB until issue #174 merges: its real src/v4/markers.js replaces this file.
// It follows the shared interface only as far as #175's code and tests need.
import { createHash } from 'node:crypto';

const LINK_KEYS = {
  serves: 'serves', 'builds-on': 'buildsOn', changes: 'changes', removes: 'removes', explains: 'explains',
  illustrates: 'illustrates', 'resolved-by': 'resolvedBy', 'governed-by': 'governedBy', decides: 'decides',
  for: 'for', supersedes: 'supersedes', source: 'source',
};
const emptyLinks = () => Object.fromEntries(Object.values(LINK_KEYS).map((k) => [k, []]));
const MARKER = /^<!--\s*(.*?)\s*-->\s*$/;

export function parseMarkdown(text, file) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const paragraphs = [];
  const lints = [];
  let fence = null;
  let current = null;
  const close = () => {
    if (!current) return;
    while (current.body.length && !current.body.at(-1).trim()) current.body.pop();
    while (current.body.length && !current.body[0].trim()) { current.body.shift(); current.line += 1; }
    const body = current.body.join('\n');
    const { body: _, ...p } = current;
    paragraphs.push({ ...p, text: body, sha256: createHash('sha256').update(body).digest('hex') });
    current = null;
  };
  lines.forEach((l, i) => {
    if (fence) { if (l.trim().startsWith(fence)) fence = null; if (current) current.body.push(l); return; }
    const f = l.trim().match(/^(```|~~~)/);
    if (f) { fence = f[1]; if (current) current.body.push(l); return; }
    const m = !fence && l.match(MARKER);
    if (m) {
      close();
      const [id, ...rest] = m[1].split(/\s+/);
      const links = emptyLinks();
      let kind = null;
      for (const w of rest) {
        const lm = w.match(/^([a-z-]+):(.*)$/);
        if (lm && LINK_KEYS[lm[1]]) links[LINK_KEYS[lm[1]]].push(...lm[2].split(',').filter(Boolean));
        else if (lm) lints.push({ code: 'unknown-link', id, file, line: i + 1, message: `unknown link ${lm[1]}` });
        else if (!kind) kind = w;
      }
      current = { id, kind, links, line: i + 2, headingPath: [], displayNumber: null, file, body: [] };
      return;
    }
    if (current) current.body.push(l);
    else if (l.trim()) lints.push({ code: 'missing-id', id: null, file, line: i + 1, message: 'a paragraph with no ID' });
  });
  close();
  // Heading paths and display numbers.
  const counts = [];
  let path = [];
  let k = 0;
  for (const p of paragraphs) {
    const h = p.text.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      counts.length = level;
      counts[level - 1] = (counts[level - 1] ?? 0) + 1;
      for (let j = 0; j < level - 1; j++) counts[j] ??= 0;
      path = [...path.slice(0, level - 1), h[2].trim()];
      k = 0;
      p.headingPath = path.slice(0, -1);
      p.displayNumber = counts.join('.');
    } else {
      k += 1;
      p.headingPath = [...path];
      p.displayNumber = `${counts.join('.') || '0'}:${k}`;
    }
  }
  return { paragraphs, lints };
}
