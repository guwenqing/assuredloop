// What is in force for the selected change (light-design R1; LD-24, LD-25,
// LD-42, LD-43, LD-47, LD-48, LD-52): one section of al check. The change is
// what al check selects, the base to the working tree and the untracked
// files, with .assuredloop/ left out. In force: the promise and design
// paragraphs of the spec docs (approach aside) and each accepted ADR that no
// accepted ADR replaces. Shown with their text: the items that the change
// edits or cites, and the change's own signed requirements and proposed
// design. Every other item in force is named in the grouped line. No model,
// no network, and the same output for the same state and options.
import { lstatSync, readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { parse } from 'yaml';
import { join, posix } from 'node:path';
import { recordPath } from './base.js';
import { INDEX_KEYS } from './records.js';
import { fileAt, git } from './git.js';
import { FENCE, groupOf, lf, onlyLinksAdded, parseMarkdown, withoutScope } from './markers.js';
import { taskItems } from './issues.js';
import { centralRepo, namedIds, outputRepos } from './repos.js';
import { ADR_FILE, SPEC, symlinkOn } from './scope.js';
import { loadState, placeOf, replaceLinks, replacersOf, reqLine, signedBy, unknownBy, versionOf } from './state.js';

const oneLine = (text) => text.replace(/\s+/g, ' ').trim();
const inForceKind = (state, kind) => !!kind && kind !== 'approach' && ['promise', 'design'].includes(groupOf(kind, state.kinds));
const designKind = (state, kind) => !!kind && ['promise', 'design'].includes(groupOf(kind, state.kinds));
const adrNumber = (id) => Number(id.slice('ADR-'.length));
const word = (name) => new RegExp(`(?<![\\w-])${name.replace(/[-]/g, '\\-')}(?![\\w-])`);
const unref = (ref) => String(ref).replace(/^central:/, '');
// The review notes of the open requests (LD-27), as a git glob.
export const REVIEW_NOTES = 'requests/*/review.md';
export const isReviewNote = (path) => /^requests\/(?!archive\/)[^/]+\/review\.md$/.test(path);

// A glob of a file scope (LD-26) as a regex: `**` any number of folders,
// `*` within one folder name, `?` one character.
function globRe(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') { re += '(?:.*/)?'; i++; } else re += '.*';
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}
const matches = (globs, files) => globs.some((g) => { const re = globRe(g); return files.some((f) => re.test(f)); });

// The line of a paragraph's first line of text in `text`, never its marker line (LD-47).
export function textLine(text, p) {
  const lines = lf(text).split('\n');
  let i = p.line;
  while (i < lines.length && !lines[i].trim()) i++;
  return i < lines.length ? i + 1 : p.line;
}

// A path that git writes in a diff header: C-quoted when it holds a quote,
// a backslash or a control character (core.quotePath is off).
function unquote(s) {
  if (!s.startsWith('"')) return s;
  const bytes = [];
  const esc = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, '\\': 92 };
  for (let i = 1; i < s.length - 1; i++) {
    if (s[i] !== '\\') {
      const ch = String.fromCodePoint(s.codePointAt(i));
      bytes.push(...Buffer.from(ch));
      i += ch.length - 1;
      continue;
    }
    const o = /^[0-7]{3}/.exec(s.slice(i + 1));
    if (o) { bytes.push(parseInt(o[0], 8)); i += 3; } else { bytes.push(esc[s[i + 1]] ?? s.charCodeAt(i + 1)); i += 1; }
  }
  return Buffer.from(bytes).toString('utf8');
}
const headerPath = (rest) => {
  const p = unquote(rest.replace(/\t$/, ''));
  return p === '/dev/null' ? null : p.slice(2);
};

// The paths that the selected change touches: all of them, .assuredloop/
// and the review notes included, for the own requests; and the untracked ones.
function pathsOf(top, base) {
  const run = (args) => git(top, ['-c', 'core.quotePath=false', ...args], { allowFail: true }) ?? '';
  const paths = new Set(run(['diff', '--name-only', '-z', '--no-renames', '--no-relative', base, '--']).split('\0').filter(Boolean));
  const untracked = run(['ls-files', '-z', '--others', '--exclude-standard', '--', '.']).split('\0').filter(Boolean);
  for (const f of untracked) paths.add(f);
  return { paths, untracked };
}

// The selected change: its paths (pathsOf), and each line it adds or removes
// outside .assuredloop/ and the review notes, as { file, line, text, removed }.
// A review note is the review's output, not part of the change, so an ID in
// it is no citation (LD-25, LD-28).
function changeOf(top, base) {
  const run = (args) => git(top, ['-c', 'core.quotePath=false', ...args], { allowFail: true }) ?? '';
  const { paths, untracked } = pathsOf(top, base);
  const lines = [];
  const diff = run(['diff', '-U0', '-M', '--no-color', '--no-ext-diff', '--no-textconv', '--no-relative', '--src-prefix=a/', '--dst-prefix=b/',
    base, '--', '.', ':(exclude).assuredloop', `:(exclude,glob)${REVIEW_NOTES}`]);
  let from = null;
  let to = null;
  let hunk = false;
  let o = 0;
  let n = 0;
  for (const l of diff.split('\n')) {
    if (l.startsWith('diff --git ')) { hunk = false; from = null; to = null; continue; }
    if (!hunk) {
      if (l.startsWith('--- ')) from = headerPath(l.slice(4));
      else if (l.startsWith('+++ ')) to = headerPath(l.slice(4));
      else if (l.startsWith('@@ ')) hunk = true;
      if (!hunk) continue;
    }
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (h) { o = Number(h[1]); n = Number(h[2]); continue; }
    if (l.startsWith('-')) lines.push({ file: from, line: o++, text: l.slice(1), removed: true });
    else if (l.startsWith('+')) lines.push({ file: to, line: n++, text: l.slice(1), removed: false });
  }
  for (const file of untracked.filter((f) => !f.startsWith('.assuredloop/') && !isReviewNote(f))) {
    let text;
    try {
      text = readFileSync(join(top, file), 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\0')) continue;
    lf(text).split('\n').forEach((t, i) => lines.push({ file, line: i + 1, text: t, removed: false }));
  }
  return { paths, lines, empty: ![...paths].some((p) => !p.startsWith('.assuredloop/')) };
}

// The items in force at `now`, in list order: the spec docs by path, each in
// file order, then the ADRs by number (LD-24, LD-42).
function itemsInForce(now) {
  const textOf = new Map(now.docs.map((d) => [d.path, d.text]));
  const items = (now.scopes.get(SPEC) ?? []).filter((p) => inForceKind(now, p.kind)).map((p) => ({
    id: p.id, file: p.file, line: textLine(textOf.get(p.file) ?? '', p), marker: p.line, what: p.kind, text: oneLine(p.text), p, files: p.files,
  }));
  const accepted = [...now.adrs.values()].filter((a) => a.status === 'accepted');
  const replaced = new Set(accepted.flatMap((a) => (a.head?.links.supersedes ?? []).map((x) => /^(ADR-\d+)/.exec(unref(x))?.[1])));
  for (const a of accepted.filter((x) => !replaced.has(x.id)).sort((x, y) => adrNumber(x.id) - adrNumber(y.id))) {
    const decides = (a.head?.links.decides ?? []).map(unref);
    items.push({
      id: a.id, file: a.file, line: a.head ? textLine(a.text, a.head) : 1, marker: a.head?.line ?? 1, adr: a, files: a.head?.files ?? [],
      what: `ADR accepted, decides ${decides.length ? decides.join(', ') : 'nothing'}`, text: oneLine(a.paragraphs.map((p) => p.text).join('\n')),
    });
  }
  return items;
}

// The open requests that are this change's own: the change touches their
// folder or their record, or a commit message of base..HEAD names them.
export function ownRequests(top, now, base, paths = pathsOf(top, base).paths) {
  const messages = git(top, ['log', '--format=%B%x00', `${base}..HEAD`], { allowFail: true }) ?? '';
  return [...now.requests.values()].filter((r) => r.open)
    .filter((r) => [...paths].some((f) => f.startsWith(`${r.dir}/`) || (f === recordPath(r.name) && recordTouched(top, base, r.name)))
    || word(r.name).test(messages)).sort((a, b) => (a.name < b.name ? -1 : 1));
}

// Whether the change touches a request's record in what al new and al record
// write (LD-24). What al index derives by itself (INDEX_KEYS) is left out,
// so an al check run, or its written record committed, makes no request
// the change's own. A record that is not YAML is compared as text.
function recordTouched(top, base, name) {
  const path = recordPath(name);
  const read = (text) => {
    if (text == null) return {};
    try {
      const data = parse(text);
      if (!data || typeof data !== 'object' || Array.isArray(data)) return text;
      return Object.fromEntries(Object.entries(data).filter(([k]) => !INDEX_KEYS.includes(k)));
    } catch { return text; }
  };
  let now = null;
  try { now = readFileSync(join(top, path), 'utf8'); } catch { /* deleted: compared as absent */ }
  return !isDeepStrictEqual(read(fileAt(top, base, path)), read(now));
}

// The design lines of request.md (LD-48): `Design: <path>`, outside fenced code.
function designLines(md) {
  const out = [];
  let fence = null;
  lf(md).split('\n').forEach((l, i) => {
    const f = FENCE.exec(l);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && l.trim() === f[1]) fence = null;
      return;
    }
    if (f) { fence = f[1]; return; }
    const m = /^Design:[ \t]*(.*?)\s*$/.exec(l);
    if (m && m[1]) out.push({ path: m[1].replace(/^`(.*)`$/, '$1'), line: i + 1 });
  });
  return out;
}

// A design document of this repo, or `<repo>:<path>` of an output repo at its
// selected commit (git only): { text, clean, shown, adr, paras }, with its
// paragraphs (an ADR's own); { hint } when it is missing or cannot be read,
// or { info } when the output repo is unknown. With `rev`, a document of
// this repo is read at that commit. The list and the evidence check (C8)
// read a change's design documents with it.
export function readDesign(top, now, path, repos, rev = null) {
  const m = /^([A-Za-z0-9][\w.-]*):(.*)$/.exec(path);
  const rel = m ? m[2] : path;
  if (!rel || posix.isAbsolute(rel) || rel.split('/').includes('..')) return { hint: 'cannot be read' };
  const clean = posix.normalize(rel).replace(/^\.\//, '');
  let text;
  if (m) {
    const repo = repos().find((r) => r.name === m[1]);
    if (!repo) return { hint: `cannot be read: ${m[1]} is not an output repo in the config` };
    if (repo.unknown) return { info: `unknown: ${repo.unknown}` };
    text = fileAt(repo.dir, repo.sha, clean);
    if (text == null) return { hint: 'is missing' };
  } else if (rev) {
    text = fileAt(top, rev, clean);
    if (text == null) return { hint: 'is missing' };
  } else {
    let stat;
    try {
      stat = lstatSync(join(top, clean));
    } catch {
      return { hint: 'is missing' };
    }
    try {
      if (symlinkOn(top, clean) || !stat.isFile()) throw new Error('not a file');
      text = readFileSync(join(top, clean), 'utf8');
    } catch {
      return { hint: 'cannot be read' };
    }
  }
  const shown = m ? `${m[1]}:${clean}` : clean;
  const adr = !m && ADR_FILE.test(posix.basename(clean)) && posix.dirname(clean) === `${now.root}/adr` ? now.adrList.find((a) => a.file === clean) : null;
  return { text, clean, shown, adr, paras: adr ? adr.paragraphs : parseMarkdown(text, clean, { kinds: now.kinds }).paragraphs };
}

// The lines of a design document for the list, or its { hint } or { info }.
function designDoc(top, now, path, source, repos) {
  const d = readDesign(top, now, path, repos);
  if (d.text === undefined) return d;
  const { text, clean, shown, adr, paras } = d;
  const head = `proposed ${path} design document · ${source}`;
  const design = paras.filter((p) => designKind(now, p.kind));
  if (adr) {
    return {
      lines: [`${head} · ${adr.id} ${adr.status ?? 'with no known status'} · an ADR; ${design.length} design paragraphs`,
        ...design.map((p) => `proposed ${p.id} design paragraph · ${clean}:${textLine(text, p)} · ${p.kind}: ${oneLine(p.text)}`)],
    };
  }
  const status = /^Status:[ \t]*(.*?)\s*$/m.exec(lf(text).split('\n')[0] ?? '')?.[1];
  const state = status ? `Status: ${status}` : 'state unknown';
  if (!paras.length) return { lines: [`${head} · ${state} · no markers: supporting evidence`] };
  return {
    lines: [`${head} · ${state} · ${design.length} design paragraphs`,
      ...design.map((p) => `proposed ${p.id} design paragraph · ${shown}:${textLine(text, p)} · ${p.kind}: ${oneLine(p.text)}`)],
  };
}

// The design paths of the open requests `names` (LD-48, D2): the design lines
// of each request.md; with --issues, the field design (one path or a list) and
// the design lines of each saved work item that a task of one of them names.
// Each as { path, r, source, where, item }, or { bad, it } for a design field
// that is not a path or a list of paths; item is set for a work item's.
export function designPaths(top, now, own, issues) {
  const out = [];
  for (const r of own) {
    for (const d of designLines(r.md)) out.push({ path: d.path, r, source: `design line ${r.dir}/request.md:${d.line}`, where: `${r.dir}/request.md:${d.line}` });
  }
  const ownNames = new Set(own.map((r) => r.name));
  const named = issues && own.length ? taskItems(top, now, issues.items).named.filter((n) => ownNames.has(n.r.name)) : [];
  const seen = new Set();
  for (const { r, it } of named) {
    if (seen.has(it)) continue;
    seen.add(it);
    for (const path of it.design === undefined ? [] : [].concat(it.design)) {
      if (typeof path !== 'string' || !path) out.push({ bad: true, item: true, it });
      else out.push({ path, r, item: true, source: `design of work item ${it.key} (${it.file})`, where: it.file });
    }
    for (const d of designLines(it.body)) out.push({ path: d.path, r, item: true, source: `design line in work item ${it.key} (${it.file})`, where: it.file });
  }
  return out;
}

// The line of an item in force, before its text.
const inForceLine = (it, basis) => `in force ${it.id} ${basis} · ${it.file}:${it.line} · ${it.what}`;

// The list. Returns { body, findings, own, none, skipped }: the lines, the
// design-doc hints, the change's own requests (none with no base, an empty
// change, or in an output repo), why no change is selected, and the list's
// checks that did not run, for the ok line (LD-41).
const LIST_CODES = ['design-doc', 'scope-no-file'];
export function changeInForce(top, { now, was, base, issues = null, full = false, all: auditAll = false }) {
  // --all, the audit (LD-18, LD-44): every item in force on its own line,
  // also with no change selected. al gives no judgement; the review does.
  const audit = (none) => {
    const central = centralRepo(top, now.config);
    if (central?.unknown) return [`list limits: the central repo cannot be read: ${central.unknown}, so no item in force is listed`];
    return [`list: no change selected: ${none}; the audit shows every item in force`,
      ...itemsInForce(central ? loadState(central.dir, central.sha) : now).map((it) => `${inForceLine(it, 'audit')}: ${it.text}`)];
  };
  const noBase = 'no base (no main branch, or no commit)';
  if (!base) return { body: auditAll ? audit(noBase) : [`list: no change selected: ${noBase}`], findings: [], none: noBase, skipped: LIST_CODES };
  const change = changeOf(top, base);
  const empty = `nothing changed against the base ${base.slice(0, 7)}`;
  if (change.empty) return { body: auditAll ? audit(empty) : [`list: no change selected: ${empty}`], findings: [], none: empty, skipped: LIST_CODES };
  const findings = [];
  const limits = [];
  // In an output repo, the items in force are the central repo's at its
  // selected commit; it is cited only as central:<ID>, its file scopes are not
  // matched here, and the change's own request is not read (LD-25, D3).
  const central = centralRepo(top, now.config);
  if (central?.unknown) {
    return { body: [`list limits: the central repo cannot be read: ${central.unknown}, so no item in force is listed; the change's own request is not read in an output repo`], findings, skipped: LIST_CODES };
  }
  const items = itemsInForce(central ? loadState(central.dir, central.sha) : now);
  if (central) {
    limits.push('file scopes name files of the central repo; they are not matched in an output repo',
      `the items' files are in the central repo at ${central.sha.slice(0, 7)}`, 'the change\'s own request is not read in an output repo');
  }

  // Cited: a line that the change added or removed names the ID as a whole
  // word; a paragraph's own ID in its marker line is no citation.
  const known = new Map();
  for (const it of items) {
    known.set(it.id, it.id);
    for (const p of it.adr?.paragraphs ?? []) known.set(p.id, it.id);
  }
  const cites = new Map();
  for (const l of change.lines) {
    const text = l.text.replace(/^(\s*<!--[ \t]+)(ADR-\d+-\d+|[A-Z][A-Z0-9]*-\d+)/, '$1');
    for (const written of namedIds(text, { qualified: !!central, known: new Set(known.keys()) })) {
      const id = known.get(unref(written));
      if (!id) continue;
      if (!cites.has(id)) cites.set(id, new Map());
      const files = cites.get(id);
      if (!files.has(l.file)) files.set(l.file, `${l.file}:${l.line}${l.removed ? ' removed' : ''}`);
    }
  }

  // Changed by this change: its text, or its ADR file, differs from the base.
  const changed = (it) => {
    if (central) return false;
    if (it.adr) { const b = was?.adrs.get(it.id); return !b || withoutScope(lf(b.text)) !== withoutScope(lf(it.adr.text)); }
    const b = was?.spec.get(it.id);
    return !b || b.sha256 !== it.p.sha256 || b.kind !== it.p.kind;
  };
  // An accepted ADR whose text changed, as the adr-changed hint reads it.
  const textChanged = (a) => {
    const b = was?.adrs.get(a.id);
    if (!b || !['accepted', 'superseded'].includes(b.status) || b.body === a.body) return false;
    return !(b.status === 'accepted' && b.head && a.head && b.rest === a.rest && onlyLinksAdded(b.marker, a.marker, now.kinds));
  };

  const own = central ? [] : ownRequests(top, now, base, change.paths);
  const ownNames = new Set(own.map((r) => r.name));
  const proposals = new Map();
  for (const r of [...now.requests.values()].filter((x) => x.open && !ownNames.has(x.name))) {
    for (const p of r.paras.values()) {
      for (const [key, verb] of [['changes', 'changes it'], ['removes', 'removes it']]) {
        for (const ref of p.links[key]) {
          const id = unref(ref);
          if (!proposals.has(id)) proposals.set(id, []);
          proposals.get(id).push(`open proposal: ${r.name}/${p.id} (${placeOf(p)}) ${verb}`);
        }
      }
    }
  }

  // The file scope (LD-26): the files that the change adds, changes, renames
  // (both paths) or deletes, outside .assuredloop/; and whether the change
  // edits an item's scope, so that a narrower one cannot hide it.
  const touched = [...change.paths].filter((f) => !f.startsWith('.assuredloop/'));
  const scopeChanged = (it) => {
    if (central) return false;
    const b = it.adr ? was?.adrs.get(it.id) : was?.spec.get(it.id);
    return !!b && ((it.adr ? b.head?.files : b.files) ?? []).join(',') !== it.files.join(',');
  };
  let tree = null;
  const lsFiles = (args) => (git(top, ['-c', 'core.quotePath=false', 'ls-files', '-z', ...args], { allowFail: true }) ?? '').split('\0').filter(Boolean);
  // The files of the working tree: tracked and not deleted, or untracked and not ignored.
  const treeFiles = () => {
    if (tree) return tree;
    const gone = new Set(lsFiles(['--deleted']));
    return (tree = lsFiles(['--cached', '--others', '--exclude-standard']).filter((f) => !gone.has(f)));
  };
  for (const it of central ? [] : items.filter((x) => x.files.length)) {
    if (!matches(it.files, treeFiles())) findings.push({ severity: 'hint', code: 'scope-no-file', where: `${it.file}:${it.marker}`, id: it.id, message: `its file scope ${it.files.join(',')} matches no file` });
  }

  const body = [];
  const grouped = [];
  const show = (it, basis) => [inForceLine(it, basis),
    ...(it.adr && textChanged(it.adr) ? ['text changed, review open'] : []), ...(proposals.get(it.id) ?? [])].join(' · ') + `: ${it.text}`;
  for (const it of items) {
    const all = it.files.includes('**');
    const basis = [...(changed(it) ? ['changed by this change'] : []), ...(cites.has(it.id) ? [`cited (${[...cites.get(it.id).values()].join('; ')})`] : []),
      ...(scopeChanged(it) ? ['scope changed in this change'] : []), ...(!all && !central && matches(it.files, touched) ? ['by scope'] : []), ...(all ? ['all files'] : [])];
    if (basis.length) body.push(show(it, basis.join(', ')));
    else if (auditAll) body.push(show(it, 'audit'));
    else grouped.push(it);
  }

  // This change's own proposals: never in force (LD-24, LD-48).
  let outputs = null;
  const repos = () => (outputs ??= outputRepos(top, now.config));
  const designShown = (path, source, where) => {
    const got = designDoc(top, now, path, source, repos);
    if (got.hint) findings.push({ severity: 'hint', code: 'design-doc', where, id: path, message: `the design line names ${path}, which ${got.hint}` });
    if (got.info) findings.push({ severity: 'info', code: 'output-repo', where, id: path, message: got.info });
    return got.lines ?? [];
  };
  const designs = designPaths(top, now, own, issues);
  for (const r of own) {
    const lines = lf(r.md).split('\n');
    for (const q of r.reqs) {
      const s = signedBy(now, r.name, q.id);
      if (!s) {
        limits.push(unknownBy(now, r.name, q.id) ? `whether ${r.name}/${q.id} is signed: the original file of its sign-off is not checked, so it is not listed`
          : `${r.name}/${q.id} is not signed, so it is not listed`);
        continue;
      }
      const at = lines.findIndex((l) => new RegExp(`^###\\s+${q.id}\\b`).test(l)) + 1;
      // A replaced requirement is not in force: the list shows the one that
      // replaces it (LD-68); one whose replacement is not known stays.
      const by = replacersOf(now, `${r.name}/${q.id}`);
      for (const l of by.filter((x) => x.holds === null)) limits.push(`whether ${l.key} replaces ${r.name}/${q.id}: not known: the original file of its sign-off is not checked`);
      if (by.some((l) => l.holds)) {
        for (const l of by.filter((x) => x.holds)) {
          body.push(`replaced ${r.name}/${q.id} signed requirement · ${r.dir}/request.md:${at} · replaced by ${l.key} (${l.r.dir}/request.md:${reqLine(l.r, l.q.id)}), `
            + `${versionOf(l.r, l.q)}: signed in ${signedBy(now, l.r.name, l.q.id).id} (only al's record ${recordPath(l.r.name)} holds this): ${l.q.title}: ${oneLine(l.q.text.split('\n').slice(1).join('\n'))}`);
        }
        continue;
      }
      const replaces = replaceLinks(now).filter((l) => l.key === `${r.name}/${q.id}` && l.target)
        .map((l) => ` · replaces ${l.target.key} (${l.target.r.dir}/request.md:${reqLine(l.target.r, l.target.q.id)})`).join('');
      body.push(`proposed ${r.name}/${q.id} signed requirement · ${r.dir}/request.md:${at} · signed in ${s.id} (only al's record ${recordPath(r.name)} holds this)${replaces}: `
        + `${q.title}: ${oneLine(q.text.split('\n').slice(1).join('\n'))}`);
    }
    const specText = now.docs.find((d) => d.path === r.specFile)?.text ?? '';
    for (const p of r.paras.values()) {
      if (designKind(now, p.kind)) body.push(`proposed ${r.name}/${p.id} change spec · ${r.specFile}:${textLine(specText, p)} · ${p.kind}: ${oneLine(p.text)}`);
    }
    for (const d of designs.filter((x) => x.r === r && !x.item)) body.push(...designShown(d.path, d.source, d.where));
  }
  // The designs of the saved work items that a task of an own request names (LD-48, D2).
  for (const d of designs.filter((x) => x.item)) {
    if (d.bad) findings.push({ severity: 'hint', code: 'design-doc', where: d.it.file, id: '-', message: `the design field of ${d.it.key} is not a path or a list of paths, so it cannot be read` });
    else body.push(...designShown(d.path, d.source, d.where));
  }
  if (!own.length && !central) limits.unshift('no open request is this change\'s own (none of its files changed, and no commit message names one)');
  if (!issues) limits.push('the design field of work items is read only with --issues <folder>');

  const ids = (xs) => (xs.length ? xs.map((x) => x.id).join(', ') : 'none');
  const unscoped = grouped.filter((it) => !it.files.length);
  const unmatched = grouped.filter((it) => it.files.length);
  body.push(`${grouped.length} further items in force: ${unscoped.length} with no known scope: ${ids(unscoped)}; ${unmatched.length} with a scope that does not match this change: ${ids(unmatched)}`);
  if (full) {
    for (const it of grouped) body.push(`in force ${it.id} grouped, ${it.files.length ? 'scope does not match' : 'no known scope'} · ${it.file}:${it.line} · ${it.what}: ${it.text}`);
  }
  body.push('list basis: changed by this change = the change edits the item; cited = a line that the change added or removed names the ID; '
    + 'scope changed in this change = the change edits its files: scope; by scope = its files: scope matches a file that the change touches; all files = its scope is files:**; '
    + 'proposed = this change\'s own signed requirements and design, not in force; replaced = a signed requirement of another request replaces it; the line shows that one; '
    + `${auditAll ? 'audit = an item in force that the change does not touch, shown for the audit' : 'the grouped line names every other item in force'}`);
  body.push(`list limits: an item that is not shown in full may still apply, so ask which requirement or decision governs the changed behaviour; `
    + `al check --full shows the text of every item, al context <ID>${central ? ` --at ${central.sha.slice(0, 7)} in the central repo shows` : ''} one item${limits.length ? `; ${limits.join('; ')}` : ''}`);
  // In an output repo, no file scope is matched and no own request is read.
  return { body, findings, own, skipped: central ? LIST_CODES : [] };
}
