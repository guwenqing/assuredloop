// Word-level reads of paragraph text for the checks (design.md 3 and 6): the
// changed words of an edit, the meaning-sensitive marks on them, the
// requirement words, and how close two texts are.

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu;
export const words = (text) => text.match(WORD) ?? [];

// The changes from `a` to `b` as hunks { old: [words], new: [words] }, from the
// longest common subsequence of their words.
export function diffWords(a, b) {
  const x = words(a);
  const y = words(b);
  const n = x.length;
  const m = y.length;
  const len = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) len[i][j] = x[i] === y[j] ? len[i + 1][j + 1] + 1 : Math.max(len[i + 1][j], len[i][j + 1]);
  }
  const hunks = [];
  let cur = null;
  const flush = () => { if (cur) hunks.push(cur); cur = null; };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) { flush(); i++; j++; continue; }
    cur ??= { old: [], new: [], at: i };
    if (j >= m || (i < n && len[i + 1][j] >= len[i][j + 1])) cur.old.push(x[i++]);
    else cur.new.push(y[j++]);
  }
  flush();
  return hunks.map((h) => ({ ...h, before: x.slice(Math.max(0, h.at - 1), h.at) }));
}

export const showHunk = (h) => `${h.old.join(' ') || '(nothing)'} -> ${h.new.join(' ') || '(nothing)'}`;

const NORMATIVE = new Set(['must', 'shall', 'should', 'may', 'required']);
const NEGATION = new Set(['not', 'never', 'no']);
const NUMBER_WORDS = new Set([
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'half', 'once', 'twice',
  'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
]);
const QUANTIFIER = new Set(['only', 'all', 'every', 'any', 'each', 'none', 'some']);

// What makes a changed word meaning-sensitive (design.md 6), or null.
function sensitive(word, before) {
  const w = word.toLowerCase();
  if (NORMATIVE.has(w)) return 'a normative word';
  if (NEGATION.has(w)) return 'a negation';
  if (/^\d/.test(w) || w.split('-').some((p) => NUMBER_WORDS.has(p))) return 'a number';
  if (QUANTIFIER.has(w)) return 'a quantifier';
  if ((w === 'least' || w === 'most') && before?.toLowerCase() === 'at') return 'a quantifier';
  return null;
}

// The reasons the hunks are meaning-sensitive, or [] when none is.
export function marks(hunks) {
  const out = new Set();
  for (const h of hunks) {
    for (const [list, prev] of [[h.old, h.before], [h.new, h.before]]) {
      list.forEach((w, k) => {
        const why = sensitive(w, k ? list[k - 1] : prev?.[0]);
        if (why) out.add(why);
        if (w.toLowerCase() === 'at' && ['least', 'most'].includes(list[k + 1]?.toLowerCase())) out.add('a quantifier');
      });
    }
  }
  return [...out];
}

// The sentences of `text` that hold a word of the hunks' new side, or the
// whole text when none does (a pure removal).
export function sentencesOf(text, hunks) {
  const changed = new Set(hunks.flatMap((h) => h.new));
  const sentences = text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/);
  const hit = sentences.filter((s) => words(s).some((w) => changed.has(w)));
  return (hit.length ? hit : sentences).join(' ');
}

// Requirement words in a non-promise kind (design.md 3): MUST, SHALL, SHOULD,
// MAY as written in capitals, and never or always.
export const requirementWords = (text) => [...new Set([
  ...(text.match(/\b(MUST|SHALL|SHOULD|MAY)\b/g) ?? []),
  ...(text.match(/\b(never|always)\b/gi) ?? []).map((w) => w.toLowerCase()),
])];

// How close two texts are: the Dice coefficient of their sets of lower-case
// words. NEAR is the least that counts as a near match (architect, #179).
export const NEAR = 0.6;
const wordSet = (text) => new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
export function closeness(a, b) {
  const x = wordSet(a);
  const y = wordSet(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return (2 * both) / (x.size + y.size);
}
