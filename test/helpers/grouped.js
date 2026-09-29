// The grouped form of a context line [VW-2] [VW-6] (request context-all,
// R1): "<count> <state>: <ids>", the groups joined by " · "; within a group
// the IDs are joined by ", ", a run of one prefix written "<first>–<last
// number>" (an en dash), a waiting block as "<key> on <target>". Built from
// the request's text; nothing here reads the code under test.
import assert from 'node:assert/strict';
import { lines } from './output.js';

// A line's groups: [{ count, state, items }].
export function groups(line, label) {
  const text = line.replace(new RegExp(`^${label}\\s+`), '');
  return text.split(' · ').map((g) => {
    const m = g.match(/^(\d+) (.+?): (.+)$/);
    assert.ok(m, `each group should read "<count> <state>: <ids>", got ${JSON.stringify(g)} in:\n${line}`);
    return { count: Number(m[1]), state: m[2], items: m[3].split(', ') };
  });
}

// An item's IDs: "REC-1–3" gives REC-1, REC-2, REC-3; "INV-3.1–3.2" gives
// INV-3.1, INV-3.2; "VW-1@2 on VW-1@1" gives VW-1@2; anything else itself.
export function expand(item) {
  const first = item.split(' on ')[0];
  const m = first.match(/^([A-Z][A-Z0-9]*-)([\d.]+)–([\d.]+)$/);
  if (!m) return [first];
  const [prefix, from, to] = [m[1], m[2].split('.'), m[3].split('.')];
  assert.equal(from.length, to.length, `a range joins IDs of one shape: ${item}`);
  assert.deepEqual(from.slice(0, -1), to.slice(0, -1), `a range differs only in its last number, written the same before it: ${item}`);
  assert.ok(!/^0\d/.test(from.at(-1)) && !/^0\d/.test(to.at(-1)), `a range's last numbers have no leading zeros, so it expands back to the IDs as written: ${item}`);
  const head = from.slice(0, -1).map((x) => `${x}.`).join('');
  const out = [];
  for (let n = Number(from.at(-1)); n <= Number(to.at(-1)); n++) out.push(`${prefix}${head}${n}`);
  assert.ok(out.length >= 2, `a range covers two IDs or more: ${item}`);
  return out;
}

// Each group's count matches its IDs, and no count is 0; returns { state: [ids] }.
export function expanded(gs, line) {
  const out = {};
  for (const g of gs) {
    const ids = g.items.flatMap(expand);
    assert.ok(g.count > 0, `an empty group is left out: ${g.state} in:\n${line}`);
    assert.equal(ids.length, g.count, `"${g.count} ${g.state}" should name ${g.count} sections, names ${ids.join(', ')}:\n${line}`);
    out[g.state] = ids;
  }
  return out;
}

// The state the grouped line starting with `label` in `out` gives `id`
// (an ID, or ID@n), or null when no group names it.
export function stateOf(out, label, id) {
  const line = lines(out).find((l) => new RegExp(`^${label}\\b`).test(l));
  assert.ok(line, `expected a line starting with ${label}:\n${out}`);
  const found = Object.entries(expanded(groups(line, label), line)).find(([, ids]) => ids.includes(id));
  return found ? found[0] : null;
}
