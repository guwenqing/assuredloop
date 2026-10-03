// Sections and their IDs ([SPC-2]), and when two sections are the same ([SPC-4]).

// An ATX heading as in CommonMark: 0-3 spaces, 1-6 `#`, then a space, a tab or
// the end of the line. Groups: the marks, the gap after them, the heading text.
const HEADING = /^( {0,3}#{1,6})([ \t]+|$)(.*)$/;
// The ID grammar ([SPC-2]): a prefix of capitals and digits, starting with a
// capital, a hyphen, then numbers joined by dots. Every pattern for an ID is
// built from these.
export const PREFIX_TEXT = '[A-Z][A-Z0-9]*';
export const ID_TEXT = `${PREFIX_TEXT}-\\d+(?:\\.\\d+)*`;
const ID = new RegExp(`^\\[(${ID_TEXT})\\][ \\t]*`);
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

// The titles of the record sections the tool reads and writes: request.md's
// ([REC-2], [REC-7], [REC-8], [REC-9]) and change.md's ([SPC-5]).
export const TITLES = { words: "Owner's words and dialog", decisions: 'Decisions', parts: 'Parts', outcome: 'Outcome', specChanges: 'Spec changes' };

// The index among `lines` of the line that heads a record's `## <title>`
// section, or -1: one form for every reader and writer.
export const headingAt = (lines, title) => lines.findIndex((l) => new RegExp(`^##\\s+${title}\\s*$`).test(l));

// Whether `line` closes the fence `fence` opened: 0-3 spaces, then the same
// mark, at least as long, and nothing else.
export function closes(line, fence) {
  const f = line.match(FENCE);
  return Boolean(f && f[1][0] === fence[0] && f[1].length >= fence.length && line.trim() === f[1]);
}

// Each line of `text` with its ending, whether it is a heading, and whether it
// is fenced code (a fence line included): lines in fenced code are not
// headings, and indented code never matches HEADING.
function scan(text) {
  const lines = text.split(/(?<=\n)/);
  let fence = null;
  return lines.map((raw) => {
    const line = raw.replace(/\r?\n$/, '');
    const f = line.match(FENCE);
    if (fence) {
      if (closes(line, fence)) fence = null;
      return { raw, heading: null, code: true };
    }
    if (f) {
      fence = f[1];
      return { raw, heading: null, code: true };
    }
    return { raw, heading: line.match(HEADING), code: false };
  });
}

// For each line of `text` (split after each newline), whether it is fenced code.
export const codeLines = (text) => scan(text).map((l) => l.code);

// `text` without its fenced code.
export const prose = (text) => scan(text).filter((l) => !l.code).map((l) => l.raw).join('');

// A section is one heading and the text up to the next heading of any level.
export function parseSections(text) {
  const sections = [];
  scan(text).forEach(({ raw, heading }, i) => {
    if (heading) {
      const content = heading[3].trim();
      const id = content.match(ID);
      sections.push({
        id: id ? id[1] : null,
        level: heading[1].trim().length,
        title: id ? content.slice(id[0].length) : content,
        text: raw,
        line: i + 1,
      });
    } else if (sections.length) {
      sections.at(-1).text += raw;
    }
  });
  return sections;
}

// The sections of `files` (each with its `sections`) by ID, each as `pick` gives it (its text
// by default); of a duplicate ID the first copy counts, as in statesOf and
// consolidate ([SPC-3]).
export function sectionsById(files, pick = (s) => s.text) {
  const byId = new Map();
  for (const f of files) for (const s of f.sections) if (s.id && !byId.has(s.id)) byId.set(s.id, pick(s, f));
  return byId;
}

// The text outside every section with an ID, one piece each: before the
// first heading, then each section whose heading has none.
export function unheld(text) {
  const sections = parseSections(text);
  return [text.slice(0, text.length - sections.reduce((n, s) => n + s.text.length, 0)), ...sections.filter((s) => !s.id).map((s) => s.text)];
}

// `text` with every heading that has no ID given `[<prefix>-n] `, n counting
// up from `first`; everything else byte for byte. Returns the new text and the
// headings it numbered.
export function numberHeadings(text, prefix, first) {
  let n = first;
  const numbered = [];
  const out = scan(text).map(({ raw, heading }) => {
    if (!heading || heading[3].trim().match(ID)) return raw;
    const id = `[${prefix}-${n++}]`;
    const line = heading[3] === '' ? `${heading[1]} ${id}` : `${heading[1]}${heading[2]}${id} ${heading[3]}`;
    numbered.push(line);
    return line + raw.slice(raw.replace(/\r?\n$/, '').length);
  });
  return { text: out.join(''), numbered };
}

// Normalized only as [SPC-4] allows: line endings, trailing spaces and tabs,
// blank lines at the edges and after the heading, and the heading's `#` count.
function normalize(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/[ \t]+$/, ''));
  while (lines.length && lines[0] === '') lines.shift();
  while (lines.length && lines.at(-1) === '') lines.pop();
  const heading = lines.length ? lines[0].match(HEADING) : null;
  if (heading) {
    lines[0] = lines[0].replace(/#+/, '#');
    while (lines.length > 1 && lines[1] === '') lines.splice(1, 1);
  }
  return lines.join('\n');
}

export function sameSection(a, b) {
  return normalize(a) === normalize(b);
}
