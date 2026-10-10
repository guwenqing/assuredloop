// STUB until issue #174 merges: its real src/v4/ids.js replaces this file.
// diffParagraphs(base, head): one entry per ID in either, head order first,
// then the removed IDs in base order.
export function diffParagraphs(base, head) {
  const before = new Map(base.map((p, i) => [p.id, { p, i }]));
  const now = new Set(head.map((p) => p.id));
  const kept = head.filter((p) => before.has(p.id)).map((p) => before.get(p.id).i);
  const out = head.map((p, j) => {
    const b = before.get(p.id);
    if (!b) return { id: p.id, file: p.file, sha256: p.sha256, baseSha256: null, changes: ['New'] };
    const changes = [];
    if (b.p.sha256 !== p.sha256) changes.push('Changed');
    const order = kept.indexOf(b.i);
    const outOfOrder = (order > 0 && kept[order - 1] > b.i) || (order < kept.length - 1 && kept[order + 1] < b.i);
    if (b.p.file !== p.file || JSON.stringify(b.p.headingPath) !== JSON.stringify(p.headingPath) || outOfOrder) changes.push('Moved');
    return { id: p.id, file: p.file, sha256: p.sha256, baseSha256: b.p.sha256, changes };
  });
  for (const p of base) if (!now.has(p.id)) out.push({ id: p.id, file: p.file, sha256: null, baseSha256: p.sha256, changes: ['Removed'] });
  return out;
}
