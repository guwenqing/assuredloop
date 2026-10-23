// Phrases for the review (issue-hints R2, design.md 3): the phrases and
// patterns that `phrases:` in .assuredloop/config.yaml lists. al check gives
// the hint `phrase` for each match in the spec docs, the ADRs and the
// Markdown files of each open request, but origin/; with --issues, in the
// issues too (issues.js). The list is empty by default.
import { read } from './base.js';
import { requestMarkdown } from './blocks.js';
import { SPEC } from './scope.js';
import { Fail } from './spec.js';

const NEXT = 'fix phrases: in .assuredloop/config.yaml';

// The matchers of the config: [{ entry, re }]. A bad list, entry or pattern
// is a refusal that names it (D6).
export function loadPhrases(config) {
  const list = config.phrases;
  if (list == null) return [];
  if (!Array.isArray(list)) throw new Fail('.assuredloop/config.yaml: phrases: is not a list', NEXT);
  return list.map((e, i) => {
    const at = `phrases: entry ${i + 1}`;
    if (typeof e === 'string') {
      if (!e.trim()) throw new Fail(`.assuredloop/config.yaml: ${at} is an empty phrase`, NEXT);
      // Ignoring case; a space matches any run of white space, a line break too.
      const source = e.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
      return { entry: e, re: new RegExp(source, 'gi') };
    }
    const pattern = e && typeof e === 'object' && !Array.isArray(e) ? e.pattern : undefined;
    if (typeof pattern !== 'string') throw new Fail(`.assuredloop/config.yaml: ${at} is neither a phrase nor a mapping with a pattern`, NEXT);
    if (!pattern) throw new Fail(`.assuredloop/config.yaml: ${at} is an empty pattern`, NEXT);
    try {
      return { entry: pattern, re: new RegExp(pattern, 'g') };
    } catch (err) {
      throw new Fail(`.assuredloop/config.yaml: ${at}, the pattern ${JSON.stringify(pattern)}, is not a valid regular expression: ${err.message}`, NEXT);
    }
  });
}

// Each match in `text`: [{ line, entry, match }], the line where it starts.
// A match of no characters is not counted.
export function phraseHits(text, matchers) {
  const t = text.replace(/\r\n?/g, '\n');
  const hits = [];
  for (const { entry, re } of matchers) {
    re.lastIndex = 0;
    for (const m of t.matchAll(re)) {
      if (!m[0]) continue;
      hits.push({ line: t.slice(0, m.index).split('\n').length, entry, match: m[0] });
    }
  }
  return hits.sort((a, b) => a.line - b.line);
}

export const phraseMessage = (h) => `matches ${JSON.stringify(h.entry)}: ${JSON.stringify(h.match.replace(/\s+/g, ' '))}`;

// The hints in the spec docs, the ADRs and the open requests' Markdown files.
export function phraseFindings(top, state, matchers, add) {
  if (!matchers.length) return;
  const files = [
    ...(state.docs ?? []).filter((d) => d.scope === SPEC && typeof d.text === 'string').map((d) => [d.path, d.text]),
    ...state.adrList.map((a) => [a.file, a.text]),
  ];
  for (const r of state.requests.values()) {
    if (!r.open) continue;
    for (const f of requestMarkdown(top, r.dir)) {
      if (f.unreadable) continue;
      let t = null;
      try {
        t = read(top, `${r.dir}/${f}`);
      } catch {
        t = null;
      }
      if (typeof t === 'string') files.push([`${r.dir}/${f}`, t]);
    }
  }
  for (const [file, text] of files) {
    for (const h of phraseHits(text, matchers)) add('hint', 'phrase', `${file}:${h.line}`, '-', phraseMessage(h));
  }
}
