// The rules that block (#238, design.md 3, 6 and 10, schema.md 5): the few
// findings that are `not ok` because an exact check of the records, hashes
// and links decides them, and breaking them lets an unapproved or wrong
// decision be built. Every other finding of al check is a hint.
// - unsigned-requirement: the latest version of each requirement has a valid
//   sign-off (R3);
// - record-evidence: each file that a record lists with a hash still has it (R4);
// - superseded-cited and superseded-status: a current place that names a
//   superseded ADR names its successor, and the status line names it (R5);
// - record-unreadable: a request record that cannot be read or is not a YAML
//   mapping, or whose request has no request.md.
// Each finding is { severity, code, where, id, message }, as in checks.js.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { read, recordPath, sha256 } from './base.js';
import { SIGNED } from './snapshot.js';
import { SPEC } from './scope.js';

const isMap = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const text = (x) => typeof x === 'string' && x.length > 0;
const whole = (x) => Number.isInteger(x) && x > 0;
const REQ = /^[RQ]\d+$/;

// The bytes of a snapshot after its separator line, as al new and al record
// hashed them: the first line that is `---` (or `--- signed text ---`), or
// only `--- signed text ---` for a sign-off. Null when there is none.
function snapshotText(bytes, signedOnly) {
  const seps = signedOnly ? [`\n${SIGNED}\n`] : ['\n---\n', `\n${SIGNED}\n`];
  const at = seps.map((s) => [bytes.indexOf(s), s]).filter(([i]) => i >= 0).sort((a, b) => a[0] - b[0])[0];
  return at ? bytes.subarray(at[0] + at[1].length) : null;
}

// What a record's file name in origin/ gives: { hash } of its snapshot text,
// or { problem } that says why it has none.
function evidence(top, r, file, signedOnly) {
  const name = String(file).replace(/^origin\//, '');
  if (!/^[^/\\]+$/.test(name) || name === '.' || name === '..') return { problem: `${file} is not a file in ${r.dir}/origin/` };
  let bytes;
  try {
    bytes = read(top, `${r.dir}/origin/${name}`, null);
  } catch (e) {
    return { problem: `${r.dir}/origin/${name} cannot be read: ${e.message}` };
  }
  if (bytes === null) return { problem: `${r.dir}/origin/${name} is missing` };
  const t = snapshotText(bytes, signedOnly);
  if (t === null) return { problem: `${r.dir}/origin/${name} has no ${signedOnly ? `"${SIGNED}"` : '"---"'} line, so its text cannot be read` };
  return { hash: sha256(t) };
}

// R3, R4 and the unreadable record, for each request with a record, open or archived.
export function recordBlocks(top, state, add) {
  // A record whose request has no request.md: nothing in it can be checked.
  const folder = '.assuredloop/records/requests';
  let records = [];
  try {
    records = readdirSync(join(top, folder), { withFileTypes: true }).filter((e) => e.name.endsWith('.yaml')).map((e) => e.name.slice(0, -5)).sort();
  } catch (e) {
    records = [];
    if (e.code !== 'ENOENT') add('not ok', 'record-unreadable', folder, '-', `${folder} cannot be read (${e.code ?? e.message}), so no record in it is checked`);
  }
  for (const name of records.filter((n) => !state.requests.has(n))) {
    const at = recordPath(name);
    add('not ok', 'record-unreadable', at, name, `${at} has no request.md in requests/${name}/ or requests/archive/${name}/, so its requirements, sign-offs and evidence are not checked`);
  }
  for (const r of state.requests.values()) {
    const at = recordPath(r.name);
    const data = r.data;
    if (r.recordError) {
      add('not ok', 'record-unreadable', at, r.name, `${at} cannot be read (${r.recordError}), so its requirements, sign-offs and evidence are not checked; fix it by hand`);
      continue;
    }
    if (!data) continue;
    const bad = (code, where, id, message) => add('not ok', code, where, `${r.name}/${id}`, message);

    // R4: each origin file under sources:, and each sign-off file.
    const sources = data.sources ?? [];
    if (!Array.isArray(sources)) bad('record-evidence', at, 'sources', 'sources: is not a list, so its files cannot be checked');
    for (const s of Array.isArray(sources) ? sources : []) {
      if (!isMap(s) || !text(s.file) || !text(s.sha256)) {
        bad('record-evidence', at, isMap(s) && text(s.file) ? s.file : '-', 'a sources entry with no file or no sha256');
        continue;
      }
      const e = evidence(top, r, s.file, false);
      if (e.problem) bad('record-evidence', at, s.file, e.problem);
      else if (e.hash !== s.sha256) bad('record-evidence', at, s.file, `${r.dir}/origin/${s.file.replace(/^origin\//, '')} changed: its text no longer has the sha256 that the record lists`);
    }
    const signoffs = data.signoff ?? [];
    if (!Array.isArray(signoffs)) bad('unsigned-requirement', at, 'signoff', 'signoff: is not a list, so no sign-off can be read');
    // Each sign-off: why it is not valid (R3), or null.
    const why = new Map();
    for (const s of Array.isArray(signoffs) ? signoffs : []) {
      const id = isMap(s) && text(s.id) ? s.id : '-';
      if (!isMap(s) || !text(s.id) || !text(s.file) || !text(s.sha256) || !Array.isArray(s.covers)) {
        if (isMap(s) && !(text(s.file) && text(s.sha256))) bad('record-evidence', at, id, 'a sign-off with no file or no sha256');
        bad('unsigned-requirement', at, id, 'a sign-off entry that cannot be read: it needs id, file, sha256 and a covers list');
        continue;
      }
      const e = evidence(top, r, s.file, true);
      if (e.problem) bad('record-evidence', at, s.file, e.problem);
      else if (e.hash !== s.sha256) bad('record-evidence', at, s.file, `${r.dir}/origin/${s.file.replace(/^origin\//, '')} changed: its signed text no longer has the sha256 of ${s.id}`);
      const covers = s.covers.filter((c) => isMap(c) && text(c.id) && whole(c.version) && text(c.sha256));
      if (covers.length < s.covers.length) {
        bad('unsigned-requirement', at, s.id, `${s.id} has a covers entry that cannot be read: it needs id, a whole version above 0 and sha256`);
        continue;
      }
      const problem = e.problem ? `its file: ${e.problem}`
        : e.hash !== s.sha256 ? 'its file\'s signed text does not have its sha256'
          : !(text(s.signed) && !Number.isNaN(Date.parse(s.signed))) ? 'it does not record when it was signed'
            : !text(s.words) ? 'it does not record the signer\'s words' : null;
      why.set(s, problem);
    }

    // R3: only a request whose record has requirements:.
    if (!Object.hasOwn(data, 'requirements')) continue;
    if (!Array.isArray(data.requirements)) {
      bad('unsigned-requirement', at, 'requirements', 'requirements: is not a list, so no requirement can be read');
      continue;
    }
    const latest = new Map();
    for (const v of data.requirements) {
      if (!isMap(v) || !(typeof v.id === 'string' && REQ.test(v.id)) || !whole(v.version) || !text(v.sha256)) {
        bad('unsigned-requirement', at, isMap(v) && text(v.id) ? v.id : '-', 'a requirement entry that cannot be read: it needs an id R<n> or Q<n>, a whole version above 0 and sha256');
        continue;
      }
      if (!latest.has(v.id) || v.version > latest.get(v.id).version) latest.set(v.id, v);
    }
    const md = `${r.dir}/request.md`;
    const next = `run al index, then show it to the owner: al record ${r.name} signoff`;
    const shown = new Set();
    for (const q of r.reqs) {
      const v = latest.get(q.id);
      if (!v) bad('unsigned-requirement', md, q.id, `${q.id} is in request.md, but the record has no version of it, so no sign-off covers it; ${next}`);
      else if (v.sha256 !== q.sha256) bad('unsigned-requirement', md, q.id, `${q.id} in request.md is not its latest recorded version ${v.version}: it is a new version that no sign-off covers; ${next}`);
      else continue;
      shown.add(q.id);
    }
    for (const v of latest.values()) {
      if (shown.has(v.id)) continue;
      const covering = [...why.keys()].filter((s) => s.covers.some((c) => c.id === v.id && c.version === v.version && c.sha256 === v.sha256));
      if (covering.some((s) => why.get(s) === null)) continue;
      const reason = covering.length
        ? covering.map((s) => `${s.id} covers it, but is not valid: ${why.get(s)}`).join('; ')
        : `no sign-off covers version ${v.version} with its sha256`;
      bad('unsigned-requirement', md, v.id, `${v.id} version ${v.version} is not signed: ${reason}; ${next}`);
    }
  }
}

// The ADRs that each ADR supersedes, directly: those its marker names in
// supersedes:, and those whose status line names it.
function supersedes(state) {
  const out = new Map([...state.adrs.keys()].map((id) => [id, new Set()]));
  for (const a of state.adrs.values()) {
    for (const x of (a.head?.links.supersedes ?? []).map(adrOf).filter(Boolean)) out.get(a.id).add(x);
    if (a.by && out.has(a.by)) out.get(a.by).add(a.id);
  }
  return out;
}

// The ADR that a link value or word names: `ADR-n` and `ADR-n-k` name ADR-n.
const ADR_REF = /^ADR-(\d+)(?:-\d+)?$/;
const adrOf = (ref) => (ADR_REF.test(ref) ? `ADR-${Number(ADR_REF.exec(ref)[1])}` : null);
const MARKER = /^\s*<!--(.*)-->\s*$/;

// The places of a Markdown text: each marker line and each run of text lines,
// with the ADRs it names and the ID of the marker it falls under. A heading
// that `skip` matches starts a section that is not read, up to the next
// heading of level 1 or 2.
function places(textOf, skip) {
  const lines = textOf.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let id = null;
  let skipping = false;
  let run = null;
  const close = () => {
    if (run && run.names.size) out.push(run);
    run = null;
  };
  lines.forEach((l, i) => {
    if (/^#{1,2}\s/.test(l)) skipping = Boolean(skip && skip.test(l));
    if (skipping || !l.trim()) { close(); return; }
    const m = MARKER.exec(l);
    if (m) {
      close();
      const tokens = m[1].trim().split(/\s+/).filter(Boolean);
      if (tokens[0] && !tokens[0].includes(':')) id = tokens[0];
      const names = new Set(tokens.filter((t) => t.indexOf(':') > 0).flatMap((t) => t.slice(t.indexOf(':') + 1).split(',')).map(adrOf).filter(Boolean));
      if (names.size) out.push({ line: i + 1, id, link: true, names });
      return;
    }
    if (!run) run = { line: i + 1, id, link: false, names: new Set() };
    for (const w of l.matchAll(/\bADR-(\d+)(?:-\d+)?\b/g)) run.names.add(`ADR-${Number(w[1])}`);
  });
  close();
  return out;
}

// R5: a current place that names a superseded ADR names an ADR that
// supersedes it, in the same marker or the same paragraph; and each
// superseded ADR's status line names an ADR whose marker supersedes it.
export function supersededBlocks(top, state, add) {
  const down = supersedes(state);
  // The ADRs that supersede `id` directly.
  const up = (id) => [...down].filter(([, xs]) => xs.has(id)).map(([y]) => y);
  // The ADRs that `id` supersedes, directly or through a chain.
  const chain = (id) => {
    const seen = new Set();
    const walk = (x) => { for (const y of down.get(x) ?? []) if (!seen.has(y)) { seen.add(y); walk(y); } };
    walk(id);
    return seen;
  };
  const superseded = (id) => state.adrs.get(id)?.status === 'superseded';

  for (const a of state.adrs.values()) {
    if (a.status !== 'superseded') continue;
    const where = `${a.file}:1`;
    if (!a.by) add('not ok', 'superseded-status', where, a.id, `${a.id} is superseded, but its status line does not say by which ADR: write "Status: superseded by ADR-<n>"`);
    else if (!state.adrs.has(a.by)) add('not ok', 'superseded-status', where, a.id, `${a.id} says it is superseded by ${a.by}, which does not exist`);
    else if (!(state.adrs.get(a.by).head?.links.supersedes ?? []).some((x) => adrOf(x) === a.id)) {
      add('not ok', 'superseded-status', where, a.id, `${a.id} says it is superseded by ${a.by}, but the marker of ${a.by} has no supersedes:${a.id}`);
    }
  }

  const check = (file, textOf, { skip = null, exempt = new Set(), name = null } = {}) => {
    for (const p of places(textOf, skip)) {
      for (const x of p.names) {
        if (!superseded(x) || exempt.has(x)) continue;
        const next = up(x);
        if (next.some((y) => p.names.has(y))) continue;
        const where = p.link ? 'in the same marker' : 'in the same paragraph';
        const id = p.id ? (name ? `${name}/${p.id}` : p.id) : '-';
        add('not ok', 'superseded-cited', `${file}:${p.line}`, id, next.length
          ? `names ${x}, which is superseded, but not ${next.join(' or ')}, which supersedes it, ${where}`
          : `names ${x}, which is superseded, and no ADR supersedes it (see superseded-status)`);
      }
    }
  };
  // The spec docs, each paragraph with its marker.
  for (const d of state.docs ?? []) if (d.scope === SPEC && typeof d.text === 'string') check(d.path, d.text);
  // A current place that cannot be read: its citations are not checked, and
  // a read failure never hides a block (SCH-37).
  const unreadable = (path, why) => add('not ok', 'superseded-cited', path, '-', `${path} cannot be read (${why}), so its citations of superseded ADRs are not checked`);
  // The Markdown files of each open request, in its subfolders too, but
  // origin/ and the recorded decisions; a subfolder that cannot be read is
  // given as { unreadable }.
  const markdown = (dir, sub) => {
    let entries = [];
    try {
      entries = readdirSync(join(top, dir, sub), { withFileTypes: true });
    } catch (e) {
      return sub && e.code !== 'ENOENT' ? [{ unreadable: sub, why: e.code ?? e.message }] : [];
    }
    return entries.sort((a, b) => (a.name < b.name ? -1 : 1)).flatMap((e) => {
      const f = sub ? `${sub}/${e.name}` : e.name;
      if (e.isDirectory()) return f === 'origin' ? [] : markdown(dir, f);
      return e.isFile() && e.name.endsWith('.md') ? [f] : [];
    });
  };
  for (const r of state.requests.values()) {
    if (!r.open) continue;
    for (const f of markdown(r.dir, '')) {
      if (f.unreadable) {
        unreadable(`${r.dir}/${f.unreadable}`, f.why);
        continue;
      }
      let t;
      let why = 'it is there, but it cannot be read as a file';
      try {
        t = read(top, `${r.dir}/${f}`);
      } catch (e) {
        t = null;
        why = e.message.split('\n')[0];
      }
      if (t === null) unreadable(`${r.dir}/${f}`, why);
      else check(`${r.dir}/${f}`, t, { name: r.name, skip: f === 'request.md' ? /^#{1,2}\s+Decisions\s*$/ : null });
    }
  }
  // An ADR file that cannot be read: neither its status nor its citations are known.
  for (const file of state.unreadableAdrs ?? []) unreadable(file, 'it is there, but it cannot be read as a file');
  // Each proposed or accepted ADR, but its History section and the ADRs it supersedes.
  for (const a of state.adrs.values()) {
    if (!['proposed', 'accepted'].includes(a.status)) continue;
    check(a.file, a.text, { skip: /^#{1,2}\s+History\s*$/, exempt: chain(a.id) });
  }
}
