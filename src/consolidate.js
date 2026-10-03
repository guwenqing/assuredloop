// al consolidate <name> [--section <ID>] [--yes], and --revert <ID> ([STA-4]):
// everything is validated on a copy of the baseline in memory, shown, and with
// --yes every changed file is written at once. Only a pending block not marked
// Dropped is written ([STA-6]); a blocked request ([REC-6]) and a duplicate ID
// in the root ([SPC-3]) refuse.
import { lstatSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, posix } from 'node:path';
import { Fail } from './git.js';
import { openTree, noSymlinkOn } from './tree.js';
import { parseSections, sameSection } from './sections.js';
import { rootOf, baseline, duplicateIds } from './spec.js';
import { allBlocks, anchorFault, blockFault, statesOf } from './states.js';
import { signoffState } from './signoff.js';
import { requestToWrite } from './commands.js';

const LEFT_ALONE = ['consolidated', 'carried'];
const NOT_KNOWN = ['whether the code does what the consolidated text says (tests and review judge that)'];

// `text` without its trailing blank lines (the last line keeps its newline).
function trimEnd(text) {
  const lines = text.split(/(?<=\n)/);
  while (lines.length && !lines.at(-1).trim()) lines.pop();
  return lines.join('');
}
const tidy = (text) => `${trimEnd(text).replace(/\n$/, '')}\n`;

// The sections of `text` with offsets: `start`, `stop` (after its last
// non-blank line) and `end` (after its trailing blank lines).
function spans(text) {
  let at = text.length;
  const sections = parseSections(text);
  at -= sections.reduce((n, s) => n + s.text.length, 0);
  return sections.map((s) => {
    const start = at;
    at += s.text.length;
    return { ...s, start, stop: start + trimEnd(s.text).length, end: at };
  });
}

// `section` placed at `pos` in `text`: one blank line before it, and the gap
// that stood at `pos` (at least one blank line) before what follows.
function insertAt(text, pos, section) {
  const before = text.slice(0, pos);
  const rest = text.slice(pos);
  const gap = rest.match(/^(?:[ \t]*\r?\n)*/)[0];
  const after = rest.slice(gap.length);
  const head = before.trim() ? `${before.replace(/\n?$/, '\n')}\n` : '';
  return head + section + (after ? (gap || '\n') + after : '');
}

// After section `i` and the deeper headings under it.
function afterSubtree(list, i) {
  let j = i;
  while (j + 1 < list.length && list[j + 1].level > list[i].level) j++;
  return list[j].stop;
}

// A modify keeps the baseline heading's `#` count ([SPC-4] leaves it out of the comparison).
const withLevelOf = (old, section) => section.replace(/^ {0,3}#+/, old.text.match(/^ {0,3}#+/)[0]);

function removeSection(text, s) {
  const out = text.slice(0, s.start) + text.slice(s.end);
  return s.end === text.length ? trimEnd(out) : out;
}

// The file and section holding `id` in the in-memory baseline, if any.
function find(texts, id) {
  for (const [path, text] of texts) {
    const list = spans(text);
    const i = list.findIndex((s) => s.id === id);
    if (i >= 0) return { path, text, list, i, section: list[i] };
  }
  return null;
}

// [SPC-5]: a block holds exactly one heading, and it carries the block's own ID.
export function headingFault(b, text, side) {
  const headings = parseSections(text);
  if (headings.length !== 1) return `${b.key} holds ${headings.length} headings in its ${side}; a block holds exactly one ([SPC-5])`;
  if (headings[0].id !== b.id) return `${b.key}'s heading carries ${headings[0].id ? `[${headings[0].id}]` : 'no ID'}, not [${b.id}] ([SPC-5])`;
  return null;
}

const filesOf = (texts) => [...texts].sort(([a], [b]) => (a < b ? -1 : 1)).map(([path, text]) => ({ path, sections: parseSections(text) }));

// Apply one pending block to `texts`: what it did, or why it cannot.
function apply(texts, b, blocks) {
  const now = b.now === null ? null : tidy(b.now);
  if (b.op === 'add' && b.path) {
    const text = texts.get(b.path) ?? '';
    texts.set(b.path, insertAt(text, trimEnd(text).length, now));
    return { did: `[${b.id}] at the end of ${b.path}` };
  }
  if (b.op === 'add') {
    if (!b.anchor) throw new Fail(`${b.key}: an add names neither "in <path>" nor "after [ID]" ([SPC-5])`, 'fix the block heading in change.md');
    const at = find(texts, b.anchor);
    if (!at) {
      const holder = [...blocks.values()].find((x) => x.open && x.op === 'add' && x.id === b.anchor && !x.dropped);
      return { cannot: `anchor [${b.anchor}] is not in the baseline${holder ? `: ${holder.key} holds it pending; consolidate them together, or that one first` : ''}` };
    }
    texts.set(at.path, insertAt(at.text, afterSubtree(at.list, at.i), now));
    return { did: `[${b.id}] after [${b.anchor}] in ${at.path}` };
  }
  const at = find(texts, b.id);
  if (b.op === 'remove') {
    // [SPC-5]: "was first in <path>" holds only for that file's first section.
    if (b.firstIn && (at.path !== b.firstIn || at.i !== 0)) return { cannot: `[${b.id}] is not the first section of ${b.firstIn}, as its remove says` };
    texts.set(at.path, removeSection(at.text, at.section));
    return { did: `the removal of [${b.id}] from ${at.path}` };
  }
  texts.set(at.path, at.text.slice(0, at.section.start) + withLevelOf(at.section, now) + at.text.slice(at.section.stop));
  return { did: `[${b.id}] in place in ${at.path}` };
}

export function consolidate({ top, args, opts }) {
  const [name] = args;
  if (opts.revert !== undefined && opts.section !== undefined) {
    throw new Fail('give --section or --revert, not both', `al consolidate ${name} --revert <ID>`);
  }
  const tree = openTree(top);
  const dir = requestToWrite(top, tree, name);
  const root = rootOf(top, tree);
  const original = new Map(baseline(tree, root).map((f) => [f.path, f.text]));
  const texts = new Map(original);
  const blocks = allBlocks(tree);
  const id = opts.revert ?? opts.section;
  const mine = [...blocks.values()].filter((b) => b.request === name && (id === undefined || b.id === id));
  if (id !== undefined && !mine.length) throw new Fail(`${name} holds no block for [${id}]`, `al context ${name}`);
  const refuse = (reasons, next = `al context ${name}`) => ({ refused: true, body: reasons.map((r) => `refused: ${r}`), next, notKnown: NOT_KNOWN });

  const dups = duplicateIds(filesOf(texts));
  if (dups.length) {
    return refuse(dups.map(([d, at]) => `duplicate ID [${d}] in ${at.join(' and ')}; no consolidate writes until it is fixed ([SPC-3])`),
      'rename one copy of each duplicate ID by hand, to a new ID; an ID is never reused');
  }
  // [SPC-5]: a block that can't be read as written is fixed before any write, a revert included.
  const unreadable = mine.map(blockFault).filter(Boolean);
  if (unreadable.length) return refuse(unreadable, `fix the blocks named in ${dir}/change.md`);
  if (opts.revert !== undefined) return revert({ top, root, name, id, mine, blocks, texts, original, opts, refuse });

  const state = signoffState(tree, dir, name);
  if (state.blocked) {
    return refuse([`${name} is blocked: ${state.reason}; it is consolidated only once the sign-off is current ([REC-6])`],
      `show the owner the organized requirement; on their OK: al record ${name} signoff --source <where> --words <quote> --yes`);
  }
  const todo = mine.filter((b) => !b.dropped);
  if (id !== undefined && !todo.length) return refuse([`every block of [${id}] in ${name} is marked Dropped, and a dropped section is not written`]);
  const faults = todo.filter((b) => b.now !== null).map((b) => headingFault(b, b.now, 'Now')).filter(Boolean);
  // [STA-4]: a remove's anchor is checked against the baseline as it stands before any write.
  for (const b of todo.filter((x) => x.op === 'remove' && x.anchor)) {
    const at = find(original, b.id);
    const wrong = at && anchorFault(b, { path: at.path, sections: at.list });
    if (wrong) faults.push(`${b.key} ${wrong}`);
  }
  if (faults.length) return refuse(faults, `fix the blocks named in ${dir}/change.md`);

  // Write one pending block at a time, re-reading the states after each, so a
  // request's own chain and an add with its anchor go together.
  const read = () => new Map(statesOf(filesOf(texts), blocks, (b) => b.request === name).map((e) => [e.block, e]));
  const done = [];
  const cannot = new Map();
  for (let progress = true; progress;) {
    progress = false;
    const states = read();
    for (const b of todo) {
      if (done.some((d) => d.key === b.key) || states.get(b.key).state !== 'pending') continue;
      const r = apply(texts, b, blocks);
      if (r.cannot) { cannot.set(b.key, r.cannot); continue; }
      cannot.delete(b.key);
      done.push({ key: b.key, did: r.did });
      progress = true;
      break;
    }
  }
  const final = read();
  const reasons = todo.filter((b) => !LEFT_ALONE.includes(final.get(b.key).state)).map((b) => {
    const e = final.get(b.key);
    return `${b.key} ${cannot.get(b.key) ?? `${e.state}${e.by ? ` ${e.state === 'waiting' ? 'on' : 'by'} ${e.by}` : ''}`}`;
  });
  if (reasons.length) return refuse(reasons);
  if (!done.length) return { body: [`nothing to write: ${name}'s ${id === undefined ? 'sections are' : `[${id}] is`} consolidated or carried`], next: `al context ${name}`, notKnown: NOT_KNOWN };
  return write(top, root, original, texts, done.map((d) => `${d.did}, from ${d.key}`), opts.yes, name);
}

// --revert <ID>: the "was" of the request's first block for the ID goes back.
function revert({ top, root, name, id, mine, blocks, texts, original, opts, refuse }) {
  const first = mine.reduce((m, b) => (b.n < m.n ? b : m));
  // A Dropped marker never lifts the guard: carried is read as if no block were dropped ([STA-6]).
  const undropped = new Map([...blocks].map(([k, b]) => [k, { ...b, dropped: null, requestDropped: false }]));
  const carried = statesOf(filesOf(texts), undropped, (b) => mine.some((m) => m.key === b.key))
    .find((e) => e.state === 'carried' && !e.by.startsWith(`${name}/`));
  if (carried) return refuse([`[${id}] is carried by ${carried.by}; a section carried by a successor is not reverted, only kept ([STA-6])`]);
  const fault = first.was !== null && headingFault(first, first.was, 'Was');
  if (fault) return refuse([fault], `fix the block named in its change.md`);
  const at = find(texts, id);
  let did = null;
  if (first.op === 'add') {
    if (at) {
      texts.set(at.path, removeSection(at.text, at.section));
      did = `the removal of [${id}] from ${at.path}`;
    }
  } else if (at) {
    if (!sameSection(at.section.text, first.was)) {
      texts.set(at.path, at.text.slice(0, at.section.start) + withLevelOf(at.section, tidy(first.was)) + at.text.slice(at.section.stop));
      did = `the "was" of [${id}] in place in ${at.path}`;
    }
  } else if (mine.find((b) => b.op === 'remove')?.firstIn) {
    // [STA-4]: a removed first section goes back first in its file, after any text before it.
    const path = mine.find((b) => b.op === 'remove').firstIn;
    const text = texts.get(path) ?? '';
    texts.set(path, insertAt(text, spans(text)[0]?.start ?? text.length, tidy(first.was)));
    did = `[${id}] back first in ${path}`;
  } else {
    const removal = mine.find((b) => b.op === 'remove' && b.anchor);
    const anchor = removal?.anchor;
    const where = anchor ? find(texts, anchor) : null;
    if (!where) {
      return refuse([`[${id}] cannot be put back: ${anchor ? `its anchor [${anchor}] is not in the baseline` : 'it is not in the baseline, and no remove records where it stood'}`]);
    }
    // A shallower anchor is the parent: the section goes back first under it.
    // The removal's Was, which the check held against the anchor, says which.
    const unread = headingFault(removal, removal.was, 'Was');
    if (unread) return refuse([unread], `fix the block named in its change.md`);
    const under = where.section.level < parseSections(removal.was)[0].level;
    texts.set(where.path, insertAt(where.text, under ? where.section.stop : afterSubtree(where.list, where.i), tidy(first.was)));
    did = `[${id}] back ${under ? 'first under' : 'after'} [${anchor}] in ${where.path}`;
  }
  if (!did) return { body: [`nothing to write: [${id}] already reads the "was" of ${first.key}`], next: `al context ${name}`, notKnown: NOT_KNOWN };
  return write(top, root, original, texts, [`${did}, from ${first.key}`], opts.yes, name);
}

// Show the writes, or with --yes write every changed file at once: each to a
// new temporary file beside it, then all renamed into place. Every file written
// is a .md file under the root, reached through real folders inside the repo,
// and is a regular file or not there yet. If any step fails, the files already
// renamed are put back and the temporary files removed, so nothing is written.
function write(top, root, original, texts, what, yes, name) {
  const changed = [...texts].filter(([path, text]) => original.get(path) !== text);
  for (const [path] of changed) {
    let kind = null;
    try { kind = lstatSync(join(top, path)); } catch { /* not there yet */ }
    if (posix.normalize(path) !== path || !path.startsWith(`${root}/`) || !path.endsWith('.md') || !noSymlinkOn(top, path) || (kind && !kind.isFile())) {
      throw new Fail(`${path}: consolidate writes only .md files under the baseline root ${root}/, named in plain form, inside this repo, not through a symlink and not over a folder; nothing was written`,
        `fix the path in the block's heading in change.md, e.g. add in ${root}/<area>.md`);
    }
  }
  if (!yes) return { body: what.map((w) => `Would write ${w}`), next: 'run the same command with --yes to write it', notKnown: NOT_KNOWN };
  const temps = [];
  const renamed = [];
  try {
    for (const [path, text] of changed) {
      mkdirSync(dirname(join(top, path)), { recursive: true });
      const tmp = join(top, dirname(path), `.${basename(path)}.al-${process.pid}`);
      writeFileSync(tmp, text, { flag: 'wx' }); // a new file: never through or over what is there
      temps.push([tmp, path]);
    }
    for (const [tmp, path] of temps) {
      renameSync(tmp, join(top, path));
      renamed.push(path);
    }
  } catch (e) {
    for (const path of renamed) {
      if (original.has(path)) writeFileSync(join(top, path), original.get(path));
      else rmSync(join(top, path), { force: true });
    }
    for (const [tmp] of temps) rmSync(tmp, { force: true });
    throw new Fail(`could not write the baseline (${e.code ?? e.message}${e.path ? ` at ${e.path}` : ''}); every file was put back as it was, and nothing was written`,
      'remove what is in the way, then run the same command again');
  }
  return {
    body: what.map((w) => `Wrote ${w}`),
    next: `review the diff of ${changed.map(([p]) => p).join(', ')} and commit it; then al context ${name}`,
    notKnown: NOT_KNOWN,
  };
}
