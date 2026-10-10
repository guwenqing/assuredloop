// STUB until issue #174 merges: its real src/v4/config.js replaces this file.
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

export function loadConfig(top) {
  for (const p of ['.assuredloop', '.assuredloop/config.yaml']) {
    let st = null;
    try { st = lstatSync(join(top, p)); } catch { break; }
    if (st.isSymbolicLink()) throw new Error(`.assuredloop/config.yaml is reached through the symlink ${p}; nothing was read`);
  }
  let c = {};
  try { c = parse(readFileSync(join(top, '.assuredloop/config.yaml'), 'utf8')) ?? {}; } catch { c = {}; }
  return { ...c, root: c.root ?? 'specs', docs: Array.isArray(c.docs) ? c.docs : [] };
}
