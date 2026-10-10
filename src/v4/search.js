// al search (design.md 11): the current system, a change's context and the
// history, at the strongest level installed. Level 0 scans the export; level
// 1 is a SQLite FTS5 index of it (BM25) with the ID in its own exact column;
// level 2 fuses level 1 with the ranking of the optional package
// @assuredloop/search (reciprocal rank fusion). `al` holds no model and no
// vectors: the package does, and returns a ranked list.
import { mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { Fail, isName } from './base.js';
import { git } from './git.js';
import { createHash } from 'node:crypto';
import { exportRows, exported, firstParents, newHistory, resolveCommit, sectionAt, selectedRepos } from './export.js';

// The chunk rule and the tokenizer: a change to either rebuilds the index.
const MANIFEST = { schema: 'assuredloop-search/1', chunk: 'one paragraph version; header: file title, heading path, kind, ID', tokenizer: 'porter unicode61' };
const RRF_K = 60;
const DEEP = 100;
const STOP = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'did', 'do', 'does', 'for', 'from', 'has', 'have', 'how', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'what', 'when', 'which', 'who', 'why', 'with']);

const terms = (words) => [...new Set((words.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => !STOP.has(w)))];
const keyOf = (r) => [r.repo, r.doc_or_request, r.id, r.version, r.sha256].join('\t');
// A chunk: the fixed header (file title, heading path, kind, ID), then the text.
const chunk = (r) => [r.title ?? '', (r.heading_path ?? []).join(' > '), r.kind ?? '', r.id, r.text].join('\n');
const short = (c) => (c ? c.slice(0, 12) : 'unknown');

// node:sqlite with FTS5, or null with the reason.
async function sqlite() {
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE VIRTUAL TABLE t USING fts5(x, tokenize='${MANIFEST.tokenizer}')`);
    db.close();
    return { DatabaseSync };
  } catch (e) {
    return { reason: `node:sqlite with FTS5 is not available here (${e.code ?? e.message})` };
  }
}

// The optional package by normal Node resolution: from the project, then
// beside al. Null with the reason when neither has it.
async function level2(top) {
  for (const from of [join(top, 'package.json'), import.meta.url]) {
    let path;
    try { path = createRequire(from).resolve('@assuredloop/search'); } catch { continue; }
    try {
      const mod = await import(pathToFileURL(path).href);
      const l2 = mod.default;
      if (!l2 || typeof l2.refresh !== 'function' || typeof l2.rank !== 'function') return { reason: `${path} is not a level 2 package (no refresh and rank)` };
      return { l2 };
    } catch (e) {
      return { reason: `@assuredloop/search did not load: ${e.message.split('\n')[0]}` };
    }
  }
  return { reason: 'level 2 is not installed: no @assuredloop/search in the project or beside al' };
}

// The folder of the index: <git dir>/assuredloop, never in the working tree.
function indexDir(top) {
  const p = git(top, ['rev-parse', '--git-path', 'assuredloop']);
  return isAbsolute(p) ? p : join(top, p);
}

// The requests each evidence row is evidence for, set as `for` (D15): an
// output row's declaring records and the requests whose IDs it cites; a
// result's, through its declared inputs: an output of the same repo, a
// declared output of the central repo, or a file of a request's folder.
function setFor(rows, outputs, names, central) {
  const reqOf = (cite) => /^([a-z0-9][a-z0-9-]*)\//.exec(cite.replace(/^central:/, ''))?.[1];
  const outFor = new Map();
  for (const r of rows) {
    if (r.source_type !== 'output') continue;
    r.for = [...new Set([...(r.declared ?? []).map((d) => d.request), ...(r.cites ?? []).map(reqOf).filter((n) => n && names.has(n))])].sort();
    if (r.superseded_by === null) outFor.set(`${r.repo}\t${r.file}`, r.for);
  }
  for (const r of rows) {
    if (r.source_type === 'output') continue;
    if (r.source_type !== 'result') { r.for = []; continue; }
    let res;
    try { res = parse(r.text, { schema: 'failsafe' }); } catch { r.for = []; continue; }
    const out = new Set();
    for (const f of (Array.isArray(res?.inputs) ? res.inputs : []).map((x) => String(x?.file ?? '')).filter(Boolean)) {
      for (const n of outFor.get(`${r.repo}\t${f}`) ?? []) out.add(n);
      if (r.repo !== central) continue;
      for (const n of outputs.get(f) ?? []) out.add(n);
      const m = /^requests\/(?:archive\/)?([^/]+)\//.exec(f);
      if (m && names.has(m[1])) out.add(m[1]);
    }
    r.for = [...out].sort();
  }
}

// A version is on the first-parent history of its repo's selected commit;
// a repo with no chain (unknown now) is not checked.
const onChain = (q, r) => q.chains.get(r.repo)?.has(r.valid_from) ?? true;

// Which current roles a query takes, and whether it adds history.
function inScope(row, q) {
  if (row.role === 'baseline') return true;
  if (!q.change) return false;
  if (row.role === 'evidence') return (row.for ?? []).includes(q.change);
  return ['proposal', 'spike', 'source'].includes(row.role) && row.doc_or_request === q.change;
}

// --- The index (levels 1 and 2) ---------------------------------------------

function openIndex(DatabaseSync, dir, rebuild) {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'search.sqlite');
  let db = new DatabaseSync(path);
  const old = (() => { try { return db.prepare("SELECT v FROM meta WHERE k = 'manifest'").get()?.v ?? null; } catch { return null; } })();
  const fresh = rebuild || old !== JSON.stringify(MANIFEST);
  if (fresh) {
    // Everything in the folder goes, the level 2 package's vectors included.
    db.close();
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    db = new DatabaseSync(path);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
    CREATE TABLE IF NOT EXISTS current (key TEXT PRIMARY KEY, id TEXT NOT NULL, row TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS current_id ON current (id);
    CREATE TABLE IF NOT EXISTS history (key TEXT PRIMARY KEY, id TEXT NOT NULL, row TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS history_id ON history (id);
    CREATE VIRTUAL TABLE IF NOT EXISTS current_text USING fts5(key UNINDEXED, body, tokenize='${MANIFEST.tokenizer}');
    CREATE VIRTUAL TABLE IF NOT EXISTS history_text USING fts5(key UNINDEXED, body, tokenize='${MANIFEST.tokenizer}');
  `);
  db.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('manifest', ?)").run(JSON.stringify(MANIFEST));
  return { db, fresh: fresh && old !== null ? (rebuild ? 'rebuilt on request' : 'rebuilt: the chunk rule changed') : null };
}

const getMeta = (db, k) => db.prepare('SELECT v FROM meta WHERE k = ?').get(k)?.v ?? null;
const setMeta = (db, k, v) => db.prepare('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)').run(k, v);

// The walk state as stored: versions and the items of each path.
const saveHistory = (h) => JSON.stringify({ last: h.last, spec: h.spec, atPath: [...h.atPath], versions: [...h.versions].map(([k, vs]) => [k, [...vs]]) });
function loadHistory(text) {
  if (!text) return newHistory();
  const s = JSON.parse(text);
  return { last: s.last, spec: s.spec, atPath: new Map(s.atPath), versions: new Map(s.versions.map(([k, vs]) => [k, new Map(vs)])) };
}

// Brings the index to `commit`: the current index to that commit's rows
// (rows missing from its listing are removed), the history index added to and
// never removed from. Returns what it did.
function refresh(db, top, commit, repos) {
  // The index is up to date only when no repo moved (D15).
  const stamp = repos.map((r) => `${r.name}@${r.commit ?? 'unknown'}`).join(' ');
  const before = getMeta(db, 'commit');
  if (before === stamp) return { line: `up to date at ${short(commit)}`, changed: false };
  // The repos that moved since the last refresh: only their new commits are walked.
  const prev = new Set((before ?? '').split(' '));
  const moved = repos.filter((r) => !prev.has(`${r.name}@${r.commit ?? 'unknown'}`)).map((r) => (r.commit ? `${r.name}@${short(r.commit)}` : `${r.name} (unknown)`));
  const h = loadHistory(getMeta(db, 'walk'));
  const hs = new Map(JSON.parse(getMeta(db, 'walks') ?? '[]').map(([k, v]) => [k, loadHistory(JSON.stringify(v))]));
  const { rows, outputs, records, config } = exportRows(top, commit, h, hs);
  const names = new Set(records.keys());
  setFor(rows, outputs, names, config.repo);
  const at = new Map(repos.map((r) => [r.name, r.commit]));
  const live = rows.filter((r) => r.commit === at.get(r.repo) && r.superseded_by === null);
  const now = new Map(live.map((r) => [keyOf(r), r]));
  const had = new Map(db.prepare('SELECT key, row FROM current').all().map((x) => [x.key, x.row]));
  db.exec('BEGIN');
  let added = 0;
  let removed = 0;
  let kept = 0;
  const delRow = db.prepare('DELETE FROM current WHERE key = ?');
  const delText = db.prepare('DELETE FROM current_text WHERE key = ?');
  for (const k of had.keys()) if (!now.has(k)) { delRow.run(k); delText.run(k); removed += 1; }
  const putRow = db.prepare('INSERT OR REPLACE INTO current (key, id, row) VALUES (?, ?, ?)');
  const putText = db.prepare('INSERT INTO current_text (key, body) VALUES (?, ?)');
  for (const [k, r] of now) {
    putRow.run(k, r.id, JSON.stringify(r));
    if (!had.has(k)) { putText.run(k, chunk(r)); added += 1; }
    // The same version under a new header (a heading renamed): its chunk is written again.
    else if (chunk(JSON.parse(had.get(k))) !== chunk(r)) { delText.run(k); putText.run(k, chunk(r)); }
  }
  const inHistory = db.prepare('SELECT row FROM history WHERE key = ?');
  const delHistoryText = db.prepare('DELETE FROM history_text WHERE key = ?');
  const putHistory = db.prepare('INSERT OR REPLACE INTO history (key, id, row) VALUES (?, ?, ?)');
  const putHistoryText = db.prepare('INSERT INTO history_text (key, body) VALUES (?, ?)');
  for (const r of rows) {
    const k = keyOf(r);
    const known = inHistory.get(k);
    putHistory.run(k, r.id, JSON.stringify({ ...r, for: now.get(k)?.for ?? [] }));
    if (!known) { putHistoryText.run(k, chunk(r)); kept += 1; } else if (chunk(JSON.parse(known.row)) !== chunk(r)) { delHistoryText.run(k); putHistoryText.run(k, chunk(r)); }
  }
  setMeta(db, 'walk', saveHistory(h));
  setMeta(db, 'walks', JSON.stringify([...hs].map(([k, v]) => [k, JSON.parse(saveHistory(v))])));
  setMeta(db, 'commit', stamp);
  setMeta(db, 'requests', JSON.stringify([...names].sort()));
  db.exec('COMMIT');
  return { line: `brought to ${short(commit)}: current +${added} -${removed}; history +${kept}, nothing removed${repos.length > 1 ? `; walked ${moved.join(', ')}` : ''}`, changed: true };
}

// The FTS5 query of the words: each term quoted, any term may match.
const match = (ws) => ws.map((w) => `"${w}"`).join(' OR ');

// Word hits at level 1, best first: rows in the query's scope.
function wordHits(db, q, ws, limit) {
  if (!ws.length) return [];
  const table = q.history ? 'history' : 'current';
  const found = db.prepare(`SELECT t.key AS key, bm25(${table}_text) AS score FROM ${table}_text t WHERE ${table}_text MATCH ? ORDER BY score, key`).all(match(ws));
  const cur = db.prepare('SELECT row FROM current WHERE key = ?');
  const hist = db.prepare('SELECT row FROM history WHERE key = ?');
  const out = [];
  for (const { key } of found) {
    const r = shownRow(cur.get(key)?.row, q.history ? hist.get(key)?.row : null, q);
    if (r) out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

// A row as a query shows it, or null when the query does not take it. A
// current row keeps its role; in a history query every other version on the
// first-parent history of the selected commit (`q.chain`) is shown as
// history, never as a current promise. The index keeps every version it
// indexed, from other commits too; those are not shown.
function shownRow(curText, histText, q) {
  if (curText) {
    const r = JSON.parse(curText);
    if (r.role === 'history') return q.history ? r : null;
    return inScope(r, q) ? r : null;
  }
  if (!histText || !q.history) return null;
  const r = JSON.parse(histText);
  return onChain(q, r) ? { ...r, role: 'history' } : null;
}

function exactHits(db, q, ids) {
  const out = [];
  for (const id of ids) {
    const rows = db.prepare('SELECT key, row FROM current WHERE id = ? ORDER BY key').all(id).map((x) => JSON.parse(x.row))
      .filter((r) => r.role !== 'history' || q.history);
    if (q.history) {
      const live = new Set(rows.map(keyOf));
      for (const x of db.prepare('SELECT key, row FROM history WHERE id = ? ORDER BY key').all(id)) {
        const r = JSON.parse(x.row);
        if (!live.has(x.key) && onChain(q, r) && !db.prepare('SELECT 1 FROM current WHERE key = ?').get(x.key)) rows.push({ ...r, role: 'history' });
      }
    }
    out.push(...rows);
  }
  return out;
}

// The IDs among the words: tokens equal to an ID in the index.
function idsAmong(words, known) {
  return [...new Set(words.split(/\s+/).map((t) => t.replace(/^[("'`]+|[)"'`?,.;:!]+$/g, '')).filter((t) => t && known(t)))];
}

// The parent section of a hit as it was at the hit's commit. A paragraph's
// section is read from its file at that commit, so a past version gets its
// heading and siblings as they were then; each is the indexed row of that
// version when there is one.
function sectionOf(top, rows, hit, chain) {
  if (['spec', 'adr', 'change', 'spike'].includes(hit.source_type)) {
    const items = sectionAt(top, hit.commit, hit.file, hit.id);
    if (items) {
      // The place, the heading path and the text are the file's at that
      // commit; the indexed row gives only the version's identity. Beside a
      // past hit every row is history, never a current promise.
      return items.map((it) => {
        const known = rows.find((r) => r.id === it.id && r.sha256 === it.sha256 && chain.has(r.valid_from));
        const { title, source_type: _, ...row } = it.row;
        const base = known ?? { repo: hit.repo, doc_or_request: it.doc, id: it.id, version: null, role: hit.role, source_type: hit.source_type, valid_from: null, superseded_by: null };
        return exported({ ...base, ...row, kind: row.kind ?? base.source_type, commit: hit.commit, sha256: it.sha256, role: hit.role === 'history' ? 'history' : base.role });
      });
    }
  }
  const path = JSON.stringify(hit.heading_path ?? []);
  return rows.filter((r) => r.repo === hit.repo && r.file === hit.file && r.commit === hit.commit && JSON.stringify(r.heading_path ?? []) === path)
    .sort((a, b) => (a.line ?? 0) - (b.line ?? 0)).map(exported);
}

// The exact hits first, then the word hits that are not among them, up to `limit` word hits.
function merge(exact, ranked, limit) {
  const seen = new Set(exact.map(keyOf));
  return [...exact.map((r) => ({ ...r, exact: true })), ...ranked.filter((r) => !seen.has(keyOf(r))).slice(0, limit).map((r) => ({ ...r, exact: false }))];
}

// Reciprocal rank fusion of ranked key lists.
function fuse(lists) {
  const score = new Map();
  for (const list of lists) list.forEach((k, i) => score.set(k, (score.get(k) ?? 0) + 1 / (RRF_K + i + 1)));
  return [...score].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([k]) => k);
}

// Level 2's fusion. Only baseline and proposal rows have vectors (design.md
// 11), so the fusion reorders only the places of those rows; every other row
// keeps its level 1 place, and the vectors cannot push it down. A row that
// only the vectors found takes a place after the word hits' rows with vectors.
function fuseInPlace(ranked, vec, embedded, byKey) {
  const fused = fuse([ranked.map(keyOf).filter((k) => embedded.has(k)), vec]);
  const out = [];
  let j = 0;
  for (const r of ranked) {
    if (!embedded.has(keyOf(r))) out.push(r);
    else if (j < fused.length) out.push(byKey.get(fused[j++]));
  }
  while (j < fused.length) out.push(byKey.get(fused[j++]));
  return out;
}

// --- Level 0: a scan of the export ------------------------------------------

function scan(rows, q, ws, limit) {
  const pool = rows.map((r) => shownRow(r.superseded_by === null ? JSON.stringify(r) : null, r.superseded_by === null ? null : JSON.stringify(r), q)).filter(Boolean);
  const scored = pool.map((r) => {
    const body = new Set(chunk(r).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
    return { r, n: ws.filter((w) => body.has(w)).length };
  }).filter((x) => x.n > 0);
  scored.sort((a, b) => b.n - a.n || (keyOf(a.r) < keyOf(b.r) ? -1 : keyOf(a.r) > keyOf(b.r) ? 1 : 0));
  return scored.slice(0, limit).map((x) => x.r);
}

// --- The command -------------------------------------------------------------

const LEVEL_TEXT = {
  0: '0 (no index: a scan of the export)',
  1: '1 (full text, SQLite FTS5)',
};

// al search [<words>...] [--id <ID>] [--change <request>] [--history] [--level 0|1|2]
//           [--at <commit>] [--limit <n>] [--section] [--rebuild] [--json]
export async function search({ top, args, opts }) {
  const words = args.join(' ').trim();
  if (!words && opts.id === undefined) throw new Fail('no words and no --id given', 'al search <words> | al search --id <ID>');
  if (opts.level !== undefined && !['0', '1', '2'].includes(opts.level)) throw new Fail(`--level ${opts.level}: one of 0, 1, 2`);
  const limit = opts.limit === undefined ? 10 : Number(opts.limit);
  if (!Number.isInteger(limit) || limit < 1) throw new Fail(`--limit ${opts.limit}: a whole number from 1`);
  if (opts.change !== undefined && !isName(opts.change)) throw new Fail(`--change ${JSON.stringify(opts.change)} is not a request name`);
  const commit = resolveCommit(top, opts.at);
  const want = opts.level === undefined ? 2 : Number(opts.level);
  const chain = firstParents(top, commit);
  // Each repo at its selected commit (D15): the central repo first, then the output repos.
  const repos = selectedRepos(top, commit);
  const chains = new Map(repos.filter((r) => r.commit).map((r) => [r.name, r.dir === top ? chain : firstParents(r.dir, r.commit)]));
  const q = { words, id: opts.id ?? null, change: opts.change ?? null, history: Boolean(opts.history), chain, chains };
  const central = repos[0].name;
  const notKnown = repos.filter((r) => r.unknown).map((r) => `the output repo ${r.name}: ${r.unknown}; none of its rows is shown`);
  const ws = terms(words);

  // The level that answers: the strongest one installed, up to --level.
  const falls = [];
  let level = want;
  let found2 = null;
  let lite = null;
  if (level === 2) {
    found2 = await level2(top);
    if (!found2.l2) { falls.push(found2.reason); level = 1; }
  }
  if (level >= 1) {
    lite = await sqlite();
    if (!lite.DatabaseSync) { falls.push(lite.reason); level = 0; }
  }

  let hits = [];
  let indexLine = null;
  let model = null;
  let sectionRows = null;
  if (level === 0) {
    const { rows, outputs, records } = exportRows(top, commit);
    if (q.change && !records.has(q.change)) throw new Fail(`no request named ${q.change}`, 'al search --change <request> <words>');
    setFor(rows, outputs, new Set(records.keys()), central);
    const known = new Set(rows.map((r) => r.id));
    const ids = [...(q.id ? [q.id] : []), ...idsAmong(words, (t) => known.has(t))];
    // An ID resolves in every non-history row, whatever the query; history rows with --history.
    const exact = ids.flatMap((id) => rows.filter((r) => r.id === id).map((r) => (r.superseded_by === null && r.role !== 'history' ? r : q.history ? { ...r, role: 'history' } : null)).filter(Boolean));
    hits = merge(exact, scan(rows, q, ws, limit + exact.length), limit);
    sectionRows = rows;
  } else {
    const dir = indexDir(top);
    const { db, fresh } = openIndex(lite.DatabaseSync, dir, Boolean(opts.rebuild));
    try {
      const done = refresh(db, top, commit, repos);
      indexLine = fresh ? `${fresh}; ${done.line}` : done.line;
      if (q.change && !JSON.parse(getMeta(db, 'requests') ?? '[]').includes(q.change)) throw new Fail(`no request named ${q.change}`, 'al search --change <request> <words>');
      const known = (t) => Boolean(db.prepare('SELECT 1 FROM current WHERE id = ? UNION SELECT 1 FROM history WHERE id = ?').get(t, t));
      const ids = [...(q.id ? [q.id] : []), ...idsAmong(words, known)];
      // An ID resolves in every non-history row, whatever the query.
      const exact = exactHits(db, { ...q }, ids);
      let ranked = wordHits(db, q, ws, level === 2 ? DEEP : limit);
      if (level === 2) model = found2.l2.model ?? 'an unnamed model';
      if (level === 2 && ws.length) {
        const l2 = found2.l2;
        try {
          const cur = db.prepare('SELECT key, row FROM current').all().map((x) => ({ key: x.key, r: JSON.parse(x.row) }));
          const embed = cur.filter((x) => x.r.role === 'baseline' || x.r.role === 'proposal');
          // The hash is of the whole embedded text, header and hints included, so a renamed heading embeds again.
          const texts = embed.map((x) => [chunk(x.r), x.r.hints?.summary ?? '', ...(x.r.hints?.tags ?? [])].filter(Boolean).join('\n'));
          await l2.refresh({ dir, rows: embed.map((x, i) => ({ key: x.key, sha256: createHash('sha256').update(texts[i]).digest('hex'), text: texts[i] })) });
          const keys = embed.filter((x) => inScope(x.r, q)).map((x) => x.key);
          const vec = keys.length ? await l2.rank({ dir, query: words, keys, k: DEEP }) : [];
          const byKey = new Map([...ranked.map((r) => [keyOf(r), r]), ...embed.map((x) => [x.key, x.r])]);
          ranked = fuseInPlace(ranked, vec.filter((k) => byKey.has(k)), new Set(keys), byKey);
        } catch (e) {
          if (e instanceof Fail) throw e;
          falls.push(`level 2 failed: ${String(e.message ?? e).split('\n')[0]}`);
          level = 1;
          ranked = ranked.slice(0, limit);
        }
      }
      hits = merge(exact, ranked, limit);
      if (opts.section) {
        const files = new Set(hits.map((h) => h.file));
        sectionRows = [...db.prepare('SELECT row FROM current').all(), ...db.prepare('SELECT row FROM history').all()]
          .map((x) => JSON.parse(x.row)).filter((r) => files.has(r.file));
        const seen = new Set();
        sectionRows = sectionRows.filter((r) => { const k = keyOf(r); if (seen.has(k)) return false; seen.add(k); return true; });
      }
    } finally {
      db.close();
    }
  }

  const levelText = level === 2 ? `2 (hybrid: full text and ${model})` : LEVEL_TEXT[level];
  const fallback = falls.length && want > level ? falls.join('; ') : null;
  const out = hits.map((h, i) => {
    const { for: _, ...row } = h;
    return { rank: i + 1, exact: h.exact, ...exported(row), ...(opts.section ? { section: sectionOf(top, sectionRows ?? [], h, chain) } : {}) };
  });
  const scope = `${q.change ? `change ${q.change}` : 'current system'}${q.history ? ' + history' : ''}`;
  if (opts.json) {
    return { raw: `${JSON.stringify({ level, fallback, commit, repos: repos.map(({ name, commit: c, unknown }) => ({ name, commit: c, unknown })), query: { words: q.words, id: q.id, change: q.change, history: q.history }, not_known: notKnown, ...(indexLine ? { index: indexLine } : {}), hits: out })}\n` };
  }
  const body = [`Level     ${levelText}`];
  if (fallback) body.push(`Fallback  ${fallback}`);
  body.push(`Query     ${scope} at ${short(commit)}`);
  if (repos.length > 1) body.push(`Repos     ${repos.map((r) => (r.commit ? `${r.name}@${short(r.commit)}` : `${r.name} unknown`)).join(' ')}`);
  if (indexLine) body.push(`Index     ${indexLine}`);
  if (!out.length) body.push('No hits');
  for (const h of out) {
    body.push(`${h.rank}. ${h.id} ${h.role}${h.exact ? ' exact' : ''} ${h.kind} ${h.repo === central ? '' : `${h.repo}:`}${h.file} v${h.version} @${short(h.commit)}${h.heading_path?.length ? ` (${h.heading_path.join(' > ')})` : ''}`);
    for (const l of String(h.text).split('\n')) body.push(`   ${l}`);
    for (const s of h.section ?? []) if (s.id !== h.id) body.push(`   | ${s.id}: ${String(s.text).split('\n')[0]}`);
  }
  return { body, notKnown, next: out.length ? `al search --id <ID> for one row; --history adds removed and replaced text` : 'try other words, --change <request>, or --history' };
}
