// STUB until issue #174 merges: its real src/v4/config.js replaces this file.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

export function loadConfig(top) {
  let c = {};
  try { c = parse(readFileSync(join(top, '.assuredloop/config.yaml'), 'utf8')) ?? {}; } catch { c = {}; }
  return { ...c, docs: Array.isArray(c.docs) ? c.docs : [] };
}
