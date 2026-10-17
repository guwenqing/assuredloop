// v4 IDs between a base and a head (design.md 3, What the script checks): the
// per-paragraph hash list with each paragraph's change (Changed, Moved, New,
// Removed), and the ID lints of a PR (IDs lost since the base, IDs used again
// after removal, one ID in two files).

const byId = (paragraphs) => {
  const m = new Map();
  for (const p of paragraphs) if (!m.has(p.id)) m.set(p.id, p);
  return m;
};

// The kept IDs that stay in place: per file, the longest run of IDs whose base
// order is kept (IDs are unique, so this is the longest common subsequence).
// Every other kept ID moved: the minimum set.
function inOrder(was, now) {
  const keep = new Set();
  const files = new Map();
  for (const [id, p] of now) {
    const b = was.get(id);
    if (!b || b.file !== p.file) continue;
    if (!files.has(p.file)) files.set(p.file, []);
    files.get(p.file).push(id);
  }
  const at = new Map([...was.keys()].map((id, i) => [id, i]));
  for (const ids of files.values()) {
    // Patience: tails[k] ends the best run of length k + 1; prev links the run.
    const tails = [];
    const prev = new Map();
    for (const id of ids) {
      let lo = 0;
      let hi = tails.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (at.get(tails[mid]) < at.get(id)) lo = mid + 1; else hi = mid;
      }
      prev.set(id, lo > 0 ? tails[lo - 1] : null);
      tails[lo] = id;
    }
    for (let id = tails.at(-1); id != null; id = prev.get(id)) keep.add(id);
  }
  return keep;
}

export function diffParagraphs(base, head) {
  const was = byId(base);
  const now = byId(head);
  const stays = inOrder(was, now);
  const out = [];
  for (const [id, p] of now) {
    const b = was.get(id);
    if (!b) {
      out.push({ id, file: p.file, sha256: p.sha256, baseSha256: null, changes: ['New'] });
      continue;
    }
    const changes = [];
    if (b.sha256 !== p.sha256) changes.push('Changed');
    if (b.file !== p.file || JSON.stringify(b.headingPath) !== JSON.stringify(p.headingPath) || !stays.has(id)) changes.push('Moved');
    out.push({ id, file: p.file, sha256: p.sha256, baseSha256: b.sha256, changes });
  }
  for (const [id, b] of was) {
    if (!now.has(id)) out.push({ id, file: b.file, sha256: null, baseSha256: b.sha256, changes: ['Removed'] });
  }
  return out;
}

export function idLints(base, head, { everUsed = [], removes = [] } = {}) {
  const was = byId(base);
  const now = byId(head);
  const used = new Set(everUsed);
  const removed = new Set(removes);
  const lints = [];
  const lint = (code, p, message) => lints.push({ code, severity: 'not ok', id: p.id, file: p.file, line: p.line, message });
  for (const [id, p] of was) {
    if (!now.has(id) && !removed.has(id)) lint('lost-id', p, `${id} was in ${p.file} at the base and is gone; declare removes:${id} in a change spec, or put the marker back`);
  }
  for (const [id, p] of now) {
    if (!was.has(id) && used.has(id)) lint('used-again', p, `${id} was used before and removed; an ID is never used again`);
  }
  const files = new Map();
  for (const p of head) {
    const seen = files.get(p.id) ?? new Set();
    if (seen.size && !seen.has(p.file)) lint('duplicate-id', p, `${p.id} is also used in ${[...seen][0]}`);
    seen.add(p.file);
    files.set(p.id, seen);
  }
  return lints;
}
