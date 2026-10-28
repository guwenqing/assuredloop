// #78 changes these lines of al check on purpose, so a test that compares
// the output with a main from before #78 takes them out of both outputs:
// al check runs al index (its `records:` and `index ` lines), one
// `ok: nothing found by` line replaces `ok: no marker lint`, each change
// line is now a `map paragraph` line of the map, no Next line comes when no
// step follows (main's was `al context`), and the Not known line names what
// the review view named, once. With a main from after #78, the same lines
// go from both outputs, so the comparison stays the same.
const OLD_NOT_KNOWN = 'whether each kind is right, whether a requirement is fully covered, and whether a change is authorized in substance (the review judges these)';
const NEW_NOT_KNOWN = 'whether each kind is right, whether a requirement is fully covered, whether a test really checks the rule it names, '
  + 'whether a result\'s declared inputs are complete, and whether a change is authorized in substance (the review judges these)';
const CHANGE_LINE = /^\S+:\d+(?: at the base \S+)? \S+ (?:New|Changed|Moved|Removed)(?:\+(?:Changed|Moved))*$/;
const LEFT_OUT = /^(records: |index [^:]+: |ok: nothing found by |map paragraph )/;

export function as78(stdout) {
  return stdout.split('\n')
    .filter((l) => l !== 'ok: no marker lint' && l !== 'Next      al context' && !CHANGE_LINE.test(l) && !LEFT_OUT.test(l))
    .map((l) => (l.startsWith('Not known ') ? l.replace(OLD_NOT_KNOWN, NEW_NOT_KNOWN) : l))
    .join('\n');
}

// The first of two al check runs writes the records, binds the new links
// and keeps what is new (#78), so a test that compares two runs leaves
// those lines out.
export const settled = (text) => text.split('\n').filter((l) => !/^(records|index bound|index kept): /.test(l)).join('\n');

// The lines that name `word`, other than the ok line, which names each
// check that found nothing (#78).
export const outsideOk = (stdout, word) => stdout.split('\n').filter((l) => !l.startsWith('ok: nothing found by ') && l.includes(word));

// The change lines of a main from before #78, `<place> <ID> <change>`, read
// from the map paragraph lines of #78, alone or grouped by change; sorted.
export function changeLines78(stdout) {
  const found = [];
  for (const l of stdout.split('\n')) {
    const one = /^map paragraph (\S+) · (.+?) · .+ · (\S+)$/.exec(l);
    if (one) { found.push(`${one[2]} ${one[1]} ${one[3]}`); continue; }
    const many = /^map paragraph · \d+ paragraphs · (\S+): (.*)$/.exec(l);
    if (many) for (const [, id, place] of many[2].matchAll(/(\S+) [^(]*\(([^)]*)\)(?:, |$)/g)) found.push(`${place} ${id} ${many[1]}`);
  }
  return found.sort();
}
