// al record <name> section <ID> [--builds-on <request>] [--accept] [--decision Dn] [--yes]
// ([STA-5], [TL-1]): hold a baseline section, build on another request's
// block, revise one's own block under an existing decision, or accept the
// text underneath. Shows what it would write, and writes on --yes.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Fail, now, stamp } from './git.js';
import { openTree, noSymlinkOn } from './tree.js';
import { rootOf, baseline } from './spec.js';
import { parseChange, takeText } from './states.js';
import { requestToWrite } from './commands.js';
import { headingFault } from './consolidate.js';

const indent = (text) => text.replace(/\n+$/, '').split('\n').map((l) => (l ? `    ${l}` : '')).join('\n') + '\n';
const render = (head, was, now) => `### ${head}\n` + (was != null ? `Was:\n\n${indent(was)}\n` : '') + (now != null ? `Now:\n\n${indent(now)}\n` : '');

// The line range of block `<ID>@<n>` in change.md: from its heading to the next `### ` heading.
function range(lines, id, n) {
  const start = lines.findIndex((l) => l.startsWith(`### [${id}]@${n} `) || l === `### [${id}]@${n}`);
  let end = start + 1;
  while (end < lines.length && !/^#{2,3}\s/.test(lines[end])) {
    if (/^(Was|Now):\s*$/.test(lines[end].trim())) end = takeText(lines, end + 1).next;
    else end++;
  }
  return { start, end };
}

// The D-numbers of the entries in request.md's `## Decisions` (to the next
// level-1/2 heading), and where the next entry goes.
export function decisions(md) {
  const lines = md.split('\n');
  const at = lines.findIndex((l) => /^##\s+Decisions\s*$/.test(l));
  let end = lines.length;
  if (at >= 0) for (let i = at + 1; i < lines.length; i++) if (/^#{1,2}\s/.test(lines[i])) { end = i; break; }
  const names = at < 0 ? [] : lines.slice(at + 1, end).map((l) => l.match(/^- (D\d+),/)?.[1]).filter(Boolean);
  const ids = names.map((n) => Number(n.slice(1)));
  let last = end;
  while (last > at + 1 && !lines[last - 1].trim()) last--;
  return { at, ids, names, insertAt: last, lines };
}

export function recordSection({ top, args, opts }) {
  const [name, , id] = args;
  const tree = openTree(top);
  const dir = requestToWrite(top, tree, name);
  if (!id) throw new Fail('which section? al record <name> section <ID>', `al record ${name} section <ID>`);
  const changePath = `${dir}/change.md`;
  const reqPath = `${dir}/request.md`;
  if (!noSymlinkOn(top, changePath) || !noSymlinkOn(top, reqPath)) {
    throw new Fail(`${dir} is reached through a symlink; records are written only through real folders, and nothing was written`, `make ${dir} a real folder in this repo`);
  }
  const change = tree.read(changePath)?.toString('utf8') ?? null;
  const md = tree.read(reqPath).toString('utf8');
  const mine = change ? parseChange(change, name).filter((b) => b.id === id) : [];
  const latest = mine.reduce((m, b) => (!m || b.n > m.n ? b : m), null);
  const section = baseline(tree, rootOf(top, tree)).flatMap((f) => f.sections).find((s) => s.id === id);
  const underneath = section ? section.text.replace(/\n+$/, '\n') : null;
  const date = stamp(now()).slice(0, 10);
  const notKnown = ['whether the new text is right (review judges that)'];
  let newChange;
  let newRequest = md;
  let shown;

  if (opts.accept) {
    if (!latest || !underneath) throw new Fail(`--accept needs a block of ${name} holding [${id}] and [${id}] in the baseline`, `al context ${name}`);
    const lines = change.split('\n');
    const { start, end } = range(lines, id, latest.n);
    const head = lines[start].slice(4);
    newChange = [...lines.slice(0, start), render(head, latest.was, underneath).replace(/\n$/, ''), ...lines.slice(end)].join('\n');
    const { at, ids, insertAt, lines: mdLines } = decisions(md);
    const d = `- D${Math.max(0, ...ids) + 1}, ${date}. Source: the agent. Accepted the text underneath [${id}] as the new "now" for ${latest.key}.`;
    newRequest = at < 0 ? `${md.replace(/\n*$/, '\n')}\n## Decisions\n\n${d}\n`
      : [...mdLines.slice(0, insertAt), d, ...mdLines.slice(insertAt)].join('\n');
    shown = [`${latest.key}: Now becomes the text underneath:`, underneath.replace(/\n$/, ''), `and request.md gets: ${d}`];
  } else if (latest) {
    if (opts['builds-on']) throw new Fail(`${name} already holds [${id}] (${latest.key}); a new version builds on it`, `al record ${name} section ${id} --decision Dn`);
    const d = opts.decision;
    if (!decisions(md).names.includes(d)) {
      throw new Fail(`a revision of ${latest.key} needs --decision Dn naming an entry in ## Decisions: write the decision first (why, and its source), then pass --decision Dn`,
        `write the decision in ${reqPath}, then al record ${name} section ${id} --decision Dn`);
    }
    const lines = change.split('\n');
    const { start, end } = range(lines, id, latest.n);
    const marked = `${lines[start]}   Revised ${date} (${d})`;
    const next = render(`[${id}]@${latest.n + 1} modify`, latest.now, latest.now);
    newChange = [...lines.slice(0, start), marked, ...lines.slice(start + 1, end), next, ...lines.slice(end)].join('\n');
    shown = [`${latest.key} is marked Revised ${date} (${d}), and after it:`, next.replace(/\n$/, '')];
  } else {
    let head = `[${id}]@1 modify`;
    let text = underneath;
    if (opts['builds-on']) {
      const other = opts['builds-on'];
      const theirs = parseChange(tree.read(`requests/${other}/change.md`)?.toString('utf8') ?? '', other).filter((b) => b.id === id);
      const top1 = theirs.reduce((m, b) => (!m || b.n > m.n ? b : m), null);
      if (!top1) throw new Fail(`${other} holds no block for [${id}]`, `al context ${other}`);
      head += `   builds on ${top1.key}`;
      text = top1.now;
    } else if (!underneath) {
      throw new Fail(`[${id}] is in neither the baseline nor ${name}: write the add block by hand in ${changePath} (new IDs come from al spec --add-ids)`, `al spec --add-ids <file> --prefix <PREFIX>`);
    }
    const block = render(head, text, text);
    const base = change ?? '## Spec changes\n';
    const withSpec = /^##\s+Spec changes\s*$/m.test(base) ? base : `${base.replace(/\n*$/, '\n')}\n## Spec changes\n`;
    newChange = `${withSpec.replace(/\n*$/, '\n')}\n${block}`;
    shown = [block.replace(/\n$/, '')];
  }

  // [SPC-5]: the request's blocks that break the one-heading rule, said; drafting is never refused.
  const faults = (change ? parseChange(change, name) : []).flatMap((b) => [[b.now, 'Now'], [b.was, 'Was']].map(([t, side]) => t !== null && headingFault(b, t, side)))
    .filter(Boolean).map((f) => `not ok: ${f}; fix it in ${changePath}, then al context ${name}`);
  if (!opts.yes) return { body: ['Would write:', ...shown, ...faults], next: 'run the same command with --yes to write it', notKnown };
  writeFileSync(join(top, changePath), newChange);
  if (newRequest !== md) writeFileSync(join(top, reqPath), newRequest);
  return { body: ['Wrote:', ...shown, ...faults], next: `al context ${name}`, notKnown };
}
